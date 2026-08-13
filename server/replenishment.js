/**
 * Replenishment + return + inter-property transfer (Appendix A #5/#6).
 * Bill-back snapshots and unbilled credit queue; ledger via postBreakPackMove (SOH only).
 */

import crypto from "crypto";
import { prisma } from "./db.js";
import {
  toDecimal as decToDecimal,
  qtyStr,
  moneyStr,
  markupStr,
  Decimal,
  QTY_DP,
  MONEY_DP,
} from "./decimalUtil.js";
import {
  postBreakPackMove,
  computePackQtyFromBase,
  InsufficientStockError,
  LedgerValidationError,
} from "./stockLedger.js";

export { InsufficientStockError, LedgerValidationError };

export class ReplenishmentError extends Error {
  constructor(message, code = "REPLENISHMENT_ERROR", details = {}) {
    super(message);
    this.name = "ReplenishmentError";
    this.code = code;
    this.details = details;
  }
}

function toDecimal(value, field = "value") {
  try {
    return decToDecimal(value, field);
  } catch (err) {
    throw new ReplenishmentError(err.message, err.code || "VALIDATION");
  }
}

function assertPositiveBaseQty(value) {
  const d = toDecimal(value, "baseQty");
  if (!d.gt(0)) {
    throw new ReplenishmentError("baseQty must be greater than zero", "VALIDATION");
  }
  return d;
}

async function resolveSkuAtLocation(teamId, skuId, stockLocationId, queryOptions = {}) {
  const sku = await prisma.sku.findFirst({
    where: {
      id: skuId,
      teamId,
      archivedAt: null,
      stockOnHands: { some: { stockLocationId } },
    },
    ...queryOptions,
  });
  if (!sku) {
    throw new ReplenishmentError("SKU not found at this stock location", "NOT_FOUND");
  }
  return sku;
}

function billBackUnitRate(sku) {
  const hands = Array.isArray(sku.stockOnHands) ? sku.stockOnHands : [];
  const soh = sku.stockOnHand || hands[0];
  if (soh?.lastUnitRate != null && soh.lastUnitRate !== "") {
    return toDecimal(soh.lastUnitRate);
  }
  return toDecimal(sku.unitRate);
}

async function createHeader({
  teamId,
  stockLocationId,
  propertyId,
  direction,
  userId,
  transferGroupId = null,
}) {
  return prisma.replenishment.create({
    data: {
      teamId,
      stockLocationId,
      propertyId,
      direction,
      status: "completed",
      performedByUserId: userId ?? null,
      transferGroupId: transferGroupId || null,
    },
  });
}

function mapLine(line) {
  if (!line) return null;
  const mapped = {
    ...line,
    baseQtyDeployed: qtyStr(line.baseQtyDeployed),
    packQtyConsumed: qtyStr(line.packQtyConsumed),
    unitRate: qtyStr(line.unitRate),
    markupPercentage: markupStr(line.markupPercentage),
    billBackAmount: moneyStr(line.billBackAmount),
  };
  if (Array.isArray(line.reversedBy)) {
    mapped.reversedBy = line.reversedBy.map((r) => ({
      id: r.id,
      baseQtyDeployed: qtyStr(r.baseQtyDeployed),
    }));
  }
  return mapped;
}

function mapReplenishment(row) {
  if (!row) return null;
  return {
    ...row,
    lines: Array.isArray(row.lines) ? row.lines.map(mapLine) : undefined,
    property: row.property
      ? {
          id: row.property.id,
          name: row.property.name,
          clientId: row.property.clientId,
          markupPercentage:
            row.property.markupPercentage != null
              ? markupStr(row.property.markupPercentage)
              : null,
          client: row.property.client
            ? {
                id: row.property.client.id,
                name: row.property.client.name,
                defaultMarkupPercentage: markupStr(
                  row.property.client.defaultMarkupPercentage ?? 0
                ),
              }
            : undefined,
        }
      : undefined,
    stockLocation: row.stockLocation
      ? { id: row.stockLocation.id, name: row.stockLocation.name }
      : undefined,
  };
}

function effectiveMarkup(property, client) {
  if (property?.markupPercentage != null && property.markupPercentage !== "") {
    return toDecimal(property.markupPercentage);
  }
  if (client?.defaultMarkupPercentage != null) {
    return toDecimal(client.defaultMarkupPercentage);
  }
  return new Decimal(0);
}

function computeBillBack(baseQty, unitRate, markupPct, { credit = false } = {}) {
  const base = toDecimal(baseQty);
  const rate = toDecimal(unitRate);
  const markup = toDecimal(markupPct);
  let amount = base.mul(rate).mul(new Decimal(1).add(markup.div(100)));
  amount = amount.toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP);
  if (credit) amount = amount.neg();
  return amount;
}

async function loadPropertyWithClient(teamId, propertyId, label = "Property") {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, teamId },
    include: { client: true },
  });
  if (!property) {
    throw new ReplenishmentError(`${label} not found`, "NOT_FOUND");
  }
  if (!property.clientId || !property.client) {
    throw new ReplenishmentError(`${label} must have a billing client.`, "NO_CLIENT");
  }
  return property;
}

async function assertLocationLinked(stockLocationId, propertyId) {
  const link = await prisma.stockLocationProperty.findUnique({
    where: {
      stockLocationId_propertyId: { stockLocationId, propertyId },
    },
  });
  if (!link) {
    throw new ReplenishmentError(
      "Property is not linked to this stock location. Link them before replenishing.",
      "NOT_LINKED"
    );
  }
}

async function postBreakPackLine({
  header,
  teamId,
  sku,
  stockLocationId,
  propertyId,
  baseQty,
  direction,
  markup,
  userId,
  reversesLineId = null,
  billable = true,
}) {
  const qty = baseQty instanceof Decimal ? baseQty : toDecimal(baseQty, "baseQty");
  const unitRate = billBackUnitRate(sku);
  const packQty = computePackQtyFromBase(qty, sku.packSize);
  const billBackAmount = computeBillBack(qty, unitRate, markup, {
    credit: direction === "return",
  });

  try {
    const move = await postBreakPackMove({
      teamId,
      skuId: sku.id,
      stockLocationId,
      propertyId,
      baseQty: qty,
      direction,
      userId,
      referenceType: "replenishment",
      referenceId: header.id,
    });

    return prisma.replenishmentLine.create({
      data: {
        replenishmentId: header.id,
        skuId: sku.id,
        supplyItemId: sku.supplyItemId,
        baseQtyDeployed: qty.toDecimalPlaces(QTY_DP, Decimal.ROUND_HALF_UP),
        packQtyConsumed: packQty,
        unitRate,
        markupPercentage: markup,
        billBackAmount,
        billable,
        invoiced: false,
        reversesLineId,
        stockPostingId: move.postingId,
      },
      include: {
        sku: { select: { id: true, name: true } },
        supplyItem: { select: { id: true, name: true } },
      },
    });
  } catch (err) {
    const lineCount = await prisma.replenishmentLine.count({
      where: { replenishmentId: header.id },
    });
    if (lineCount === 0) {
      await prisma.replenishment.delete({ where: { id: header.id } }).catch(() => {});
    }
    throw err;
  }
}

function lineRemaining(line) {
  const alreadyReturned = (line.reversedBy || []).reduce(
    (sum, l) => sum.add(toDecimal(l.baseQtyDeployed).abs()),
    new Decimal(0)
  );
  return toDecimal(line.baseQtyDeployed).sub(alreadyReturned);
}

/**
 * Unreverted replenish lines for a property + supply item (FIFO by createdAt).
 */
export async function listUnrevertedLinesForPropertySupply(
  teamId,
  propertyId,
  supplyItemId
) {
  const lines = await prisma.replenishmentLine.findMany({
    where: {
      supplyItemId,
      reversesLineId: null,
      replenishment: {
        teamId,
        propertyId,
        direction: "replenish",
      },
    },
    include: {
      reversedBy: { select: { id: true, baseQtyDeployed: true } },
      sku: { select: { id: true, name: true } },
      supplyItem: { select: { id: true, name: true } },
      replenishment: {
        select: {
          id: true,
          propertyId: true,
          stockLocationId: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const open = [];
  let totalRemaining = new Decimal(0);
  for (const line of lines) {
    const remaining = lineRemaining(line);
    if (remaining.gt(0)) {
      totalRemaining = totalRemaining.add(remaining);
      open.push({
        ...mapLine(line),
        remaining: qtyStr(remaining),
      });
    }
  }
  return {
    lines: open,
    totalRemaining: qtyStr(totalRemaining),
  };
}

function allocateAcrossLines(openLines, qty) {
  const allocations = [];
  let left = qty;
  for (const line of openLines) {
    if (!(left.gt(0))) break;
    const remaining = toDecimal(line.remaining);
    if (!(remaining.gt(0))) continue;
    const take = remaining.lt(left) ? remaining : left;
    allocations.push({ lineId: line.id, baseQty: take, skuId: line.skuId });
    left = left.sub(take);
  }
  if (left.gt(0)) {
    throw new InsufficientStockError(
      "Insufficient unreverted replenishment at source property",
      {
        available: qtyStr(qty.sub(left)),
        requested: qtyStr(qty),
      }
    );
  }
  return allocations;
}

/**
 * Create a location → property replenishment with one or more SKU lines.
 */
export async function createReplenishment({
  teamId,
  stockLocationId,
  propertyId,
  lines,
  userId,
  transferGroupId = null,
}) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ReplenishmentError("At least one line is required", "VALIDATION");
  }

  const property = await loadPropertyWithClient(teamId, propertyId);

  const location = await prisma.stockLocation.findFirst({
    where: { id: stockLocationId, teamId, archivedAt: null },
  });
  if (!location) {
    throw new ReplenishmentError("Stock location not found", "NOT_FOUND");
  }

  await assertLocationLinked(stockLocationId, propertyId);

  const markup = effectiveMarkup(property, property.client);

  const header = await createHeader({
    teamId,
    stockLocationId,
    propertyId,
    direction: "replenish",
    userId,
    transferGroupId,
  });

  try {
    for (const raw of lines) {
      const baseQty = assertPositiveBaseQty(raw.baseQty);
      const sku = await resolveSkuAtLocation(teamId, raw.skuId, stockLocationId, {
        include: {
          stockOnHands: { where: { stockLocationId } },
          supplyItem: true,
        },
      });
      await postBreakPackLine({
        header,
        teamId,
        sku,
        stockLocationId,
        propertyId,
        baseQty,
        direction: "replenish",
        markup,
        userId,
      });
    }
  } catch (err) {
    const lineCount = await prisma.replenishmentLine.count({
      where: { replenishmentId: header.id },
    });
    if (lineCount === 0) {
      await prisma.replenishment.delete({ where: { id: header.id } }).catch(() => {});
    }
    throw err;
  }

  return getReplenishment(teamId, header.id);
}

/**
 * Return stock to location; create unbilled credit line reversing (part of) an original line.
 */
export async function createReturn({
  teamId,
  reversesLineId,
  baseQty,
  stockLocationId,
  skuId,
  userId,
  transferGroupId = null,
}) {
  const original = await prisma.replenishmentLine.findFirst({
    where: { id: reversesLineId },
    include: {
      replenishment: true,
      sku: true,
      supplyItem: true,
      reversedBy: true,
    },
  });
  if (!original || original.replenishment.teamId !== teamId) {
    throw new ReplenishmentError("Replenishment line not found", "NOT_FOUND");
  }
  if (original.reversesLineId) {
    throw new ReplenishmentError("Cannot reverse a credit line", "VALIDATION");
  }
  if (original.replenishment.direction !== "replenish") {
    throw new ReplenishmentError("Only replenish lines can be returned", "VALIDATION");
  }

  const qty = assertPositiveBaseQty(baseQty);

  const alreadyReturned = (original.reversedBy || []).reduce(
    (sum, l) => sum.add(toDecimal(l.baseQtyDeployed).abs()),
    new Decimal(0)
  );
  const remaining = toDecimal(original.baseQtyDeployed).sub(alreadyReturned);
  if (qty.gt(remaining)) {
    throw new ReplenishmentError(
      `Return quantity exceeds remaining unreverted amount (${qtyStr(remaining)})`,
      "VALIDATION",
      { remaining: qtyStr(remaining) }
    );
  }

  const propertyId = original.replenishment.propertyId;
  const locationId = stockLocationId || original.replenishment.stockLocationId;
  const returnSkuId = skuId || original.skuId;

  const property = await loadPropertyWithClient(teamId, propertyId);

  await assertLocationLinked(locationId, propertyId);

  const sku = await resolveSkuAtLocation(teamId, returnSkuId, locationId, {
    include: { stockOnHands: { where: { stockLocationId: locationId } } },
  });
  if (sku.supplyItemId !== original.supplyItemId) {
    throw new ReplenishmentError(
      "Return SKU must be for the same supply item as the original line",
      "VALIDATION"
    );
  }

  const markup = effectiveMarkup(property, property.client);

  const header = await createHeader({
    teamId,
    stockLocationId: locationId,
    propertyId,
    direction: "return",
    userId,
    transferGroupId,
  });

  await postBreakPackLine({
    header,
    teamId,
    sku,
    stockLocationId: locationId,
    propertyId,
    baseQty: qty,
    direction: "return",
    markup,
    userId,
    reversesLineId: original.id,
  });

  return getReplenishment(teamId, header.id);
}

/**
 * Inter-property transfer: FIFO-allocate unreverted replenish lines at source →
 * line-linked returns to location → replenish to destination.
 */
export async function createInterPropertyTransfer({
  teamId,
  fromPropertyId,
  toPropertyId,
  stockLocationId,
  skuId,
  baseQty,
  userId,
}) {
  if (!fromPropertyId || !toPropertyId || !stockLocationId || !skuId) {
    throw new ReplenishmentError(
      "fromPropertyId, toPropertyId, stockLocationId, and skuId are required",
      "VALIDATION"
    );
  }
  if (fromPropertyId === toPropertyId) {
    throw new ReplenishmentError("Source and destination properties must differ", "VALIDATION");
  }

  const qty = assertPositiveBaseQty(baseQty);

  await loadPropertyWithClient(teamId, fromPropertyId, "Source property");
  await loadPropertyWithClient(teamId, toPropertyId, "Destination property");

  const location = await prisma.stockLocation.findFirst({
    where: { id: stockLocationId, teamId, archivedAt: null },
  });
  if (!location) {
    throw new ReplenishmentError("Stock location not found", "NOT_FOUND");
  }

  await assertLocationLinked(stockLocationId, fromPropertyId);
  await assertLocationLinked(stockLocationId, toPropertyId);

  const sku = await resolveSkuAtLocation(teamId, skuId, stockLocationId, {
    include: { stockOnHands: { where: { stockLocationId } } },
  });

  const { lines: openLines, totalRemaining } = await listUnrevertedLinesForPropertySupply(
    teamId,
    fromPropertyId,
    sku.supplyItemId
  );
  if (qty.gt(toDecimal(totalRemaining))) {
    throw new InsufficientStockError(
      "Insufficient unreverted replenishment at source property",
      {
        available: totalRemaining,
        requested: qtyStr(qty),
      }
    );
  }

  const allocations = allocateAcrossLines(openLines, qty);
  const transferGroupId = crypto.randomUUID();
  const returnLegs = [];

  try {
    for (const alloc of allocations) {
      const returnLeg = await createReturn({
        teamId,
        reversesLineId: alloc.lineId,
        baseQty: alloc.baseQty,
        stockLocationId,
        skuId: sku.id,
        userId,
        transferGroupId,
      });
      returnLegs.push(returnLeg);
    }
  } catch (err) {
    err.details = {
      ...(err.details || {}),
      transferGroupId,
      partialReturns: returnLegs.map((r) => r.id),
      partial: returnLegs.length > 0,
    };
    err.transferGroupId = transferGroupId;
    throw err;
  }

  let replenishLeg;
  try {
    replenishLeg = await createReplenishment({
      teamId,
      stockLocationId,
      propertyId: toPropertyId,
      lines: [{ skuId: sku.id, baseQty: qty }],
      userId,
      transferGroupId,
    });
  } catch (err) {
    let compensationOk = false;
    try {
      for (const returnLeg of [...returnLegs].reverse()) {
        for (const line of returnLeg.lines || []) {
          await postBreakPackMove({
            teamId,
            skuId: line.skuId,
            stockLocationId,
            propertyId: fromPropertyId,
            baseQty: toDecimal(line.baseQtyDeployed).abs(),
            direction: "replenish",
            userId,
            referenceType: "transfer_compensation",
            referenceId: transferGroupId,
          });
        }
        await prisma.replenishmentLine
          .deleteMany({ where: { replenishmentId: returnLeg.id } })
          .catch(() => {});
        await prisma.replenishment.delete({ where: { id: returnLeg.id } }).catch(() => {});
      }
      compensationOk = true;
    } catch (compErr) {
      err.details = {
        ...(err.details || {}),
        transferGroupId,
        returnReplenishmentIds: returnLegs.map((r) => r.id),
        partial: true,
        compensationFailed: true,
        compensationError: compErr.message,
      };
    }
    if (compensationOk) {
      err.details = {
        ...(err.details || {}),
        transferGroupId,
        compensated: true,
        partial: false,
      };
    }
    err.transferGroupId = transferGroupId;
    throw err;
  }

  return {
    transferGroupId,
    return: returnLegs[0] || null,
    returns: returnLegs,
    replenish: replenishLeg,
  };
}

const replenishmentInclude = {
  lines: {
    include: {
      sku: { select: { id: true, name: true } },
      supplyItem: { select: { id: true, name: true } },
      reversesLine: { select: { id: true } },
      reversedBy: { select: { id: true, baseQtyDeployed: true } },
    },
    orderBy: { createdAt: "asc" },
  },
  property: {
    include: {
      client: { select: { id: true, name: true, defaultMarkupPercentage: true } },
    },
  },
  stockLocation: { select: { id: true, name: true } },
};

export async function getReplenishment(teamId, id) {
  const row = await prisma.replenishment.findFirst({
    where: { id, teamId },
    include: replenishmentInclude,
  });
  return mapReplenishment(row);
}

export async function listReplenishments(teamId, { limit = 50, transferGroupId, propertyId } = {}) {
  const rows = await prisma.replenishment.findMany({
    where: {
      teamId,
      ...(transferGroupId ? { transferGroupId } : {}),
      ...(propertyId ? { propertyId } : {}),
    },
    include: replenishmentInclude,
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
  return rows.map(mapReplenishment);
}

export async function listUnbilledLines(teamId) {
  const lines = await prisma.replenishmentLine.findMany({
    where: {
      invoiced: false,
      billable: true,
      replenishment: { teamId },
    },
    include: {
      replenishment: {
        include: {
          property: {
            include: {
              client: { select: { id: true, name: true } },
            },
          },
          stockLocation: { select: { id: true, name: true } },
        },
      },
      sku: { select: { id: true, name: true } },
      supplyItem: { select: { id: true, name: true } },
      reversesLine: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return lines.map((line) => ({
    ...mapLine(line),
    direction: line.replenishment.direction,
    transferGroupId: line.replenishment.transferGroupId,
    property: line.replenishment.property
      ? {
          id: line.replenishment.property.id,
          name: line.replenishment.property.name,
          client: line.replenishment.property.client,
        }
      : null,
    stockLocation: line.replenishment.stockLocation,
    isCredit: toDecimal(line.billBackAmount).lt(0),
  }));
}

/** Remaining unreverted base qty on a charge line */
export async function getReturnableQty(teamId, lineId) {
  const line = await prisma.replenishmentLine.findFirst({
    where: { id: lineId },
    include: { replenishment: true, reversedBy: true },
  });
  if (!line || line.replenishment.teamId !== teamId) return null;
  if (line.reversesLineId || line.replenishment.direction !== "replenish") {
    return { remaining: "0.000000" };
  }
  const returned = (line.reversedBy || []).reduce(
    (s, l) => s.add(toDecimal(l.baseQtyDeployed).abs()),
    new Decimal(0)
  );
  return {
    remaining: qtyStr(toDecimal(line.baseQtyDeployed).sub(returned)),
    originalBaseQty: qtyStr(line.baseQtyDeployed),
  };
}
