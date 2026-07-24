/**
 * Replenishment + return workflows (Appendix A #5).
 * Bill-back snapshots and unbilled credit queue; ledger via postBreakPackMove.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import {
  postBreakPackMove,
  computePackQtyFromBase,
  InsufficientStockError,
  LedgerValidationError,
} from "./stockLedger.js";

const Decimal = Prisma.Decimal;
const MONEY_DP = 4;
const QTY_DP = 6;

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
    const d = value instanceof Decimal ? value : new Decimal(value);
    if (!d.isFinite()) throw new Error("not finite");
    return d;
  } catch {
    throw new ReplenishmentError(`${field} must be a number`, "VALIDATION");
  }
}

function moneyStr(d) {
  return toDecimal(d).toFixed(MONEY_DP);
}

function qtyStr(d) {
  return toDecimal(d).toDecimalPlaces(QTY_DP, Decimal.ROUND_HALF_UP).toFixed(QTY_DP);
}

function mapLine(line) {
  if (!line) return null;
  const mapped = {
    ...line,
    baseQtyDeployed: qtyStr(line.baseQtyDeployed),
    packQtyConsumed: qtyStr(line.packQtyConsumed),
    unitRate: qtyStr(line.unitRate),
    markupPercentage: toDecimal(line.markupPercentage).toFixed(4),
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
              ? toDecimal(row.property.markupPercentage).toFixed(4)
              : null,
          client: row.property.client
            ? {
                id: row.property.client.id,
                name: row.property.client.name,
                defaultMarkupPercentage: toDecimal(
                  row.property.client.defaultMarkupPercentage ?? 0
                ).toFixed(4),
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

/**
 * Create a location → property replenishment with one or more SKU lines.
 */
export async function createReplenishment({
  teamId,
  stockLocationId,
  propertyId,
  lines,
  userId,
}) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ReplenishmentError("At least one line is required", "VALIDATION");
  }

  const property = await prisma.property.findFirst({
    where: { id: propertyId, teamId },
    include: { client: true },
  });
  if (!property) {
    throw new ReplenishmentError("Property not found", "NOT_FOUND");
  }
  if (!property.clientId || !property.client) {
    throw new ReplenishmentError(
      "Property must have a billing client before replenishing.",
      "NO_CLIENT"
    );
  }

  const location = await prisma.stockLocation.findFirst({
    where: { id: stockLocationId, teamId, archivedAt: null },
  });
  if (!location) {
    throw new ReplenishmentError("Stock location not found", "NOT_FOUND");
  }

  await assertLocationLinked(stockLocationId, propertyId);

  const markup = effectiveMarkup(property, property.client);
  const createdLines = [];

  // Process lines sequentially so stock locks don't conflict within one request
  const header = await prisma.replenishment.create({
    data: {
      teamId,
      stockLocationId,
      propertyId,
      direction: "replenish",
      status: "completed",
      performedByUserId: userId ?? null,
    },
  });

  try {
    for (const raw of lines) {
      const skuId = raw.skuId;
      const baseQty = toDecimal(raw.baseQty, "baseQty");
      if (!(baseQty.gt(0))) {
        throw new ReplenishmentError("baseQty must be greater than zero", "VALIDATION");
      }

      const sku = await prisma.sku.findFirst({
        where: { id: skuId, teamId, stockLocationId, archivedAt: null },
        include: { stockOnHand: true, supplyItem: true },
      });
      if (!sku) {
        throw new ReplenishmentError("SKU not found at this stock location", "NOT_FOUND");
      }

      const packQty = computePackQtyFromBase(baseQty, sku.packSize);
      const unitRate = toDecimal(sku.unitRate);
      const billBackAmount = computeBillBack(baseQty, unitRate, markup);

      const move = await postBreakPackMove({
        teamId,
        skuId: sku.id,
        propertyId,
        baseQty,
        direction: "replenish",
        userId,
        referenceType: "replenishment",
        referenceId: header.id,
      });

      const line = await prisma.replenishmentLine.create({
        data: {
          replenishmentId: header.id,
          skuId: sku.id,
          supplyItemId: sku.supplyItemId,
          baseQtyDeployed: baseQty.toDecimalPlaces(QTY_DP, Decimal.ROUND_HALF_UP),
          packQtyConsumed: packQty,
          unitRate,
          markupPercentage: markup,
          billBackAmount,
          billable: true,
          invoiced: false,
          stockPostingId: move.postingId,
        },
        include: {
          sku: { select: { id: true, name: true } },
          supplyItem: { select: { id: true, name: true } },
        },
      });
      createdLines.push(line);
    }
  } catch (err) {
    // Best-effort: leave header; partial lines may exist. Prefer fail loud.
    // If first line failed, delete empty header.
    if (createdLines.length === 0) {
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

  const qty = toDecimal(baseQty, "baseQty");
  if (!(qty.gt(0))) {
    throw new ReplenishmentError("baseQty must be greater than zero", "VALIDATION");
  }

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

  const property = await prisma.property.findFirst({
    where: { id: propertyId, teamId },
    include: { client: true },
  });
  if (!property?.clientId) {
    throw new ReplenishmentError("Property must have a billing client", "NO_CLIENT");
  }

  await assertLocationLinked(locationId, propertyId);

  const sku = await prisma.sku.findFirst({
    where: { id: returnSkuId, teamId, stockLocationId: locationId, archivedAt: null },
  });
  if (!sku) {
    throw new ReplenishmentError("SKU not found at stock location", "NOT_FOUND");
  }
  if (sku.supplyItemId !== original.supplyItemId) {
    throw new ReplenishmentError(
      "Return SKU must be for the same supply item as the original line",
      "VALIDATION"
    );
  }

  const markup = effectiveMarkup(property, property.client);
  const unitRate = toDecimal(sku.unitRate);
  const packQty = computePackQtyFromBase(qty, sku.packSize);
  const billBackAmount = computeBillBack(qty, unitRate, markup, { credit: true });

  const header = await prisma.replenishment.create({
    data: {
      teamId,
      stockLocationId: locationId,
      propertyId,
      direction: "return",
      status: "completed",
      performedByUserId: userId ?? null,
    },
  });

  try {
    const move = await postBreakPackMove({
      teamId,
      skuId: sku.id,
      propertyId,
      baseQty: qty,
      direction: "return",
      userId,
      referenceType: "replenishment",
      referenceId: header.id,
    });

    await prisma.replenishmentLine.create({
      data: {
        replenishmentId: header.id,
        skuId: sku.id,
        supplyItemId: sku.supplyItemId,
        baseQtyDeployed: qty.toDecimalPlaces(QTY_DP, Decimal.ROUND_HALF_UP),
        packQtyConsumed: packQty,
        unitRate,
        markupPercentage: markup,
        billBackAmount,
        billable: true,
        invoiced: false,
        reversesLineId: original.id,
        stockPostingId: move.postingId,
      },
    });
  } catch (err) {
    await prisma.replenishment.delete({ where: { id: header.id } }).catch(() => {});
    throw err;
  }

  return getReplenishment(teamId, header.id);
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

export async function listReplenishments(teamId, { limit = 50 } = {}) {
  const rows = await prisma.replenishment.findMany({
    where: { teamId },
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
