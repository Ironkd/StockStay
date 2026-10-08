/**
 * StockTransaction ledger engine (Appendix A #4).
 * Sole path for mutating StockOnHand quantities.
 * Historical property_stock rows remain readable; new posts must not use that entity type.
 */

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { computeUnitRate, moneyStr } from "./decimalUtil.js";

const Decimal = Prisma.Decimal;
const QTY_DP = 6;
const MONEY_DP = 4;

export class InsufficientStockError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "InsufficientStockError";
    this.code = "INSUFFICIENT_STOCK";
    this.details = details;
  }
}

export class LedgerValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "LedgerValidationError";
    this.code = "LEDGER_VALIDATION";
    this.details = details;
  }
}

function toDecimal(value, fieldName = "quantity") {
  try {
    const d = value instanceof Decimal ? value : new Decimal(value);
    if (!d.isFinite()) {
      throw new LedgerValidationError(`${fieldName} must be a finite number`);
    }
    return d;
  } catch (err) {
    if (err instanceof LedgerValidationError) throw err;
    throw new LedgerValidationError(`${fieldName} must be a number`);
  }
}

function quantizeQty(value) {
  return toDecimal(value).toDecimalPlaces(QTY_DP, Decimal.ROUND_HALF_UP);
}

function decimalToString(value) {
  if (value == null) return null;
  return toDecimal(value).toFixed(QTY_DP);
}

/**
 * Break-pack: pack qty consumed = baseQty / packSize (6 dp, half-up).
 */
export function computePackQtyFromBase(baseQty, packSize) {
  const base = quantizeQty(baseQty);
  const pack = toDecimal(packSize, "packSize");
  if (pack.lte(0)) {
    throw new LedgerValidationError("packSize must be greater than zero");
  }
  if (base.lt(0)) {
    throw new LedgerValidationError("baseQty cannot be negative");
  }
  if (base.isZero()) {
    return new Decimal(0);
  }
  const packQty = base.div(pack).toDecimalPlaces(QTY_DP, Decimal.ROUND_HALF_UP);
  if (packQty.isZero()) {
    throw new LedgerValidationError(
      "baseQty is too small to represent as a pack quantity at 6 decimal places"
    );
  }
  return packQty;
}

async function lockStockOnHand(tx, id) {
  const rows = await tx.$queryRaw`
    SELECT id, quantity, "skuId"
    FROM "StockOnHand"
    WHERE id = ${id}
    FOR UPDATE
  `;
  return rows[0] || null;
}

function sortIds(ids) {
  return [...new Set(ids.filter(Boolean))].sort();
}

async function applyEntriesInTx(tx, entries, { postingId, userId, referenceType, referenceId }) {
  for (const entry of entries) {
    if (entry.entityType === "property_stock") {
      throw new LedgerValidationError(
        "New property_stock ledger posts are not allowed; property balances are billing-only"
      );
    }
  }

  const sohIds = sortIds(
    entries.filter((e) => e.entityType === "stock_on_hand").map((e) => e.entityId)
  );

  for (const id of sohIds) {
    const row = await lockStockOnHand(tx, id);
    if (!row) throw new LedgerValidationError(`StockOnHand not found: ${id}`);
  }

  const ordered = [...entries]
    .filter((e) => e.entityType === "stock_on_hand")
    .sort((a, b) => a.entityId.localeCompare(b.entityId));

  const created = [];
  for (const entry of ordered) {
    const delta = quantizeQty(entry.quantityDelta);
    const row = await lockStockOnHand(tx, entry.entityId);
    const current = toDecimal(row.quantity);
    const next = quantizeQty(current.add(delta));
    if (next.lt(0)) {
      throw new InsufficientStockError("Insufficient stock on hand", {
        entityType: entry.entityType,
        entityId: entry.entityId,
        current: decimalToString(current),
        delta: decimalToString(delta),
      });
    }
    await tx.stockOnHand.update({
      where: { id: entry.entityId },
      data: { quantity: next },
    });

    const txn = await tx.stockTransaction.create({
      data: {
        teamId: entry.teamId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        quantityDelta: delta,
        transactionType: entry.transactionType,
        postingId,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
        reason: entry.reason ?? null,
        effectiveAt: entry.effectiveAt ?? null,
        unitPrice: entry.unitPrice ?? null,
        createdByUserId: userId ?? null,
      },
    });
    created.push({
      ...txn,
      quantityDelta: decimalToString(txn.quantityDelta),
      unitPrice: txn.unitPrice != null ? moneyStr(txn.unitPrice) : null,
      effectiveAt: txn.effectiveAt ? txn.effectiveAt.toISOString() : null,
    });
  }

  return { postingId, transactions: created };
}

/**
 * Post one or more immutable ledger legs and update balances atomically.
 */
export async function postEntries(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new LedgerValidationError("At least one ledger entry is required");
  }

  const postingId = options.postingId || crypto.randomUUID();
  const userId = options.userId ?? null;
  const referenceType = options.referenceType ?? null;
  const referenceId = options.referenceId ?? null;

  const normalized = entries.map((e, i) => {
    if (!e.teamId) throw new LedgerValidationError(`entries[${i}].teamId is required`);
    if (e.entityType === "property_stock") {
      throw new LedgerValidationError(
        `entries[${i}]: new property_stock posts are not allowed`
      );
    }
    if (!e.entityType || e.entityType !== "stock_on_hand") {
      throw new LedgerValidationError(`entries[${i}].entityType is invalid`);
    }
    if (!e.entityId) throw new LedgerValidationError(`entries[${i}].entityId is required`);
    if (!e.transactionType) {
      throw new LedgerValidationError(`entries[${i}].transactionType is required`);
    }
    const delta = quantizeQty(e.quantityDelta);
    if (delta.isZero()) {
      throw new LedgerValidationError(`entries[${i}].quantityDelta cannot be zero`);
    }
    return {
      teamId: e.teamId,
      entityType: e.entityType,
      entityId: e.entityId,
      quantityDelta: delta,
      transactionType: e.transactionType,
      reason: e.reason ?? null,
      effectiveAt: e.effectiveAt ?? null,
      unitPrice: e.unitPrice != null ? toDecimal(e.unitPrice, "unitPrice") : null,
    };
  });

  return prisma.$transaction(async (tx) =>
    applyEntriesInTx(tx, normalized, { postingId, userId, referenceType, referenceId })
  );
}

async function resolveStockOnHandForSku(teamId, skuId, stockLocationId, { createIfMissing = false } = {}) {
  if (!stockLocationId) {
    throw new LedgerValidationError("stockLocationId is required");
  }
  const sku = await prisma.sku.findUnique({
    where: { id: skuId },
  });
  if (!sku || sku.teamId !== teamId) {
    throw new LedgerValidationError("SKU not found for team");
  }
  if (sku.archivedAt) {
    throw new LedgerValidationError("SKU is archived");
  }
  const location = await prisma.stockLocation.findFirst({
    where: { id: stockLocationId, teamId, archivedAt: null },
  });
  if (!location) {
    throw new LedgerValidationError("Stock location not found for team");
  }

  let stockOnHand = await prisma.stockOnHand.findUnique({
    where: { skuId_stockLocationId: { skuId, stockLocationId } },
  });
  if (!stockOnHand) {
    if (!createIfMissing) {
      throw new LedgerValidationError("SKU is not stocked at this location");
    }
    stockOnHand = await prisma.stockOnHand.create({
      data: {
        skuId,
        stockLocationId,
        quantity: 0,
        lastPurchasePrice: sku.purchasePrice,
        lastUnitRate: sku.unitRate,
      },
    });
  }
  return { sku, stockOnHand };
}

export async function receiveStock({
  teamId,
  skuId,
  stockLocationId,
  packQty,
  purchasePrice,
  purchasedAt,
  userId,
  referenceType,
  referenceId,
}) {
  const qty = quantizeQty(packQty);
  if (!(qty.gt(0))) {
    throw new LedgerValidationError("Receive quantity must be greater than zero");
  }

  const { sku, stockOnHand } = await resolveStockOnHandForSku(teamId, skuId, stockLocationId, {
    createIfMissing: true,
  });

  const priceRaw =
    purchasePrice === undefined || purchasePrice === null || purchasePrice === ""
      ? stockOnHand.lastPurchasePrice ?? sku.purchasePrice
      : purchasePrice;
  const price = toDecimal(priceRaw, "purchasePrice").toDecimalPlaces(
    MONEY_DP,
    Decimal.ROUND_HALF_UP
  );
  if (price.lt(0)) {
    throw new LedgerValidationError("purchasePrice cannot be negative");
  }

  let effectiveAt = null;
  if (purchasedAt != null && purchasedAt !== "") {
    const parsed = new Date(purchasedAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new LedgerValidationError("purchasedAt must be a valid date");
    }
    const maxFuture = new Date();
    maxFuture.setDate(maxFuture.getDate() + 1);
    maxFuture.setHours(23, 59, 59, 999);
    if (parsed.getTime() > maxFuture.getTime()) {
      throw new LedgerValidationError("purchasedAt cannot be more than 1 day in the future");
    }
    effectiveAt = parsed;
  } else {
    effectiveAt = new Date();
  }

  const unitRate = computeUnitRate(price, sku.packSize);

  const postingId = crypto.randomUUID();
  return prisma.$transaction(async (tx) => {
    await tx.sku.update({
      where: { id: sku.id },
      data: {
        purchasePrice: price,
        unitRate,
      },
    });

    await tx.stockOnHand.update({
      where: { id: stockOnHand.id },
      data: {
        lastPurchasePrice: price,
        lastUnitRate: unitRate,
      },
    });

    return applyEntriesInTx(
      tx,
      [
        {
          teamId,
          entityType: "stock_on_hand",
          entityId: stockOnHand.id,
          quantityDelta: qty,
          transactionType: "receipt",
          unitPrice: price,
          effectiveAt,
        },
      ],
      {
        postingId,
        userId,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
      }
    );
  });
}

export async function adjustStockOnHand({
  teamId,
  skuId,
  stockLocationId,
  quantityDelta,
  reason,
  userId,
  referenceType,
  referenceId,
}) {
  const delta = quantizeQty(quantityDelta);
  if (delta.isZero()) {
    throw new LedgerValidationError("Adjustment quantityDelta cannot be zero");
  }
  const { stockOnHand } = await resolveStockOnHandForSku(teamId, skuId, stockLocationId, {
    createIfMissing: true,
  });
  return postEntries(
    [
      {
        teamId,
        entityType: "stock_on_hand",
        entityId: stockOnHand.id,
        quantityDelta: delta,
        transactionType: "adjustment",
        reason: reason ? String(reason).trim() || null : null,
      },
    ],
    { userId, referenceType, referenceId }
  );
}

/**
 * Break-pack replenish or return: StockOnHand pack delta only.
 * PropertyId is validated for team membership (billing destination) but not balanced.
 */
export async function postBreakPackMove({
  teamId,
  skuId,
  stockLocationId,
  propertyId,
  baseQty,
  direction,
  userId,
  referenceType,
  referenceId,
  postingId,
}) {
  if (direction !== "replenish" && direction !== "return") {
    throw new LedgerValidationError("direction must be replenish or return");
  }
  const base = quantizeQty(baseQty);
  if (!(base.gt(0))) {
    throw new LedgerValidationError("baseQty must be greater than zero");
  }

  const { sku, stockOnHand } = await resolveStockOnHandForSku(teamId, skuId, stockLocationId);
  const property = await prisma.property.findFirst({
    where: { id: propertyId, teamId },
  });
  if (!property) {
    throw new LedgerValidationError("Property not found for team");
  }
  const supplyItem = await prisma.supplyItem.findFirst({
    where: { id: sku.supplyItemId, teamId },
  });
  if (!supplyItem || supplyItem.archivedAt) {
    throw new LedgerValidationError("Supply item not found or archived");
  }

  const packQty = computePackQtyFromBase(base, sku.packSize);
  const id = postingId || crypto.randomUUID();

  return prisma.$transaction(async (tx) => {
    const sohDelta = direction === "replenish" ? packQty.neg() : packQty;
    const sohType = direction === "replenish" ? "replenishment_out" : "replenishment_in";

    const result = await applyEntriesInTx(
      tx,
      [
        {
          teamId,
          entityType: "stock_on_hand",
          entityId: stockOnHand.id,
          quantityDelta: sohDelta,
          transactionType: sohType,
        },
      ],
      {
        postingId: id,
        userId,
        referenceType,
        referenceId,
      }
    );

    return {
      ...result,
      packQty: decimalToString(packQty),
      baseQty: decimalToString(base),
    };
  });
}

function decimalToStringThreshold(value) {
  return decimalToString(value);
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function thresholdMapKey(stockLocationId, supplyItemId) {
  return `${stockLocationId}::${supplyItemId}`;
}

function parseReportDateInput(value, fieldName) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const parsed = DATE_ONLY_RE.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new LedgerValidationError(`${fieldName} must be a valid date`);
  }
  return { parsed, isDateOnly: DATE_ONLY_RE.test(raw) };
}

function buildBusinessDateRange(fromDate, toDate) {
  const from = parseReportDateInput(fromDate, "fromDate");
  const to = parseReportDateInput(toDate, "toDate");

  if (from && to && from.parsed.getTime() > to.parsed.getTime()) {
    throw new LedgerValidationError("fromDate must be on or before toDate");
  }

  return {
    from: from?.parsed ?? null,
    to: to?.parsed ?? null,
    toExclusive:
      to && to.isDateOnly ? new Date(to.parsed.getTime() + 24 * 60 * 60 * 1000) : null,
  };
}

function buildRangeFilter(range) {
  const filter = {};
  if (range.from) filter.gte = range.from;
  if (range.toExclusive) {
    filter.lt = range.toExclusive;
  } else if (range.to) {
    filter.lte = range.to;
  }
  return Object.keys(filter).length > 0 ? filter : null;
}

async function getOnHandBaseByLocationSupplyItem(teamId, stockLocationIds) {
  const rows = await prisma.stockOnHand.findMany({
    where: {
      stockLocationId: stockLocationIds?.length ? { in: stockLocationIds } : undefined,
      sku: { teamId, archivedAt: null },
    },
    select: {
      stockLocationId: true,
      quantity: true,
      sku: { select: { supplyItemId: true, packSize: true } },
    },
  });

  const totals = new Map();
  for (const row of rows) {
    const key = thresholdMapKey(row.stockLocationId, row.sku.supplyItemId);
    const current = totals.get(key) || new Decimal(0);
    totals.set(key, current.add(toDecimal(row.quantity).mul(toDecimal(row.sku.packSize))));
  }
  return totals;
}

function mapThresholdRow(row, onHandBase) {
  const reorderPoint = toDecimal(row.reorderPoint);
  return {
    ...row,
    reorderPoint: decimalToStringThreshold(row.reorderPoint),
    reorderQuantity: decimalToStringThreshold(row.reorderQuantity),
    onHandBase: decimalToStringThreshold(onHandBase),
    isLow: reorderPoint.gt(0) && onHandBase.lte(reorderPoint),
    supplyItem: row.supplyItem
      ? {
          ...row.supplyItem,
          defaultReorderPoint: decimalToStringThreshold(row.supplyItem.defaultReorderPoint),
          defaultReorderQuantity: decimalToStringThreshold(row.supplyItem.defaultReorderQuantity),
        }
      : undefined,
  };
}

/**
 * On-hand base units for a supply item at a location (sum of packs × packSize).
 */
export async function sumOnHandBaseAtLocation(stockLocationId, supplyItemId) {
  const rows = await prisma.stockOnHand.findMany({
    where: {
      stockLocationId,
      sku: { supplyItemId, archivedAt: null },
    },
    include: { sku: { select: { packSize: true } } },
  });
  let total = new Decimal(0);
  for (const row of rows) {
    total = total.add(toDecimal(row.quantity).mul(toDecimal(row.sku.packSize)));
  }
  return quantizeQty(total);
}

export const locationSupplyThresholdOps = {
  async listByLocation(teamId, stockLocationId) {
    const location = await prisma.stockLocation.findFirst({
      where: { id: stockLocationId, teamId },
    });
    if (!location) return null;
    const rows = await prisma.locationSupplyThreshold.findMany({
      where: { stockLocationId },
      include: {
        supplyItem: {
          select: {
            id: true,
            name: true,
            category: true,
            baseUnitId: true,
            defaultReorderPoint: true,
            defaultReorderQuantity: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    const onHandByKey = await getOnHandBaseByLocationSupplyItem(teamId, [stockLocationId]);
    return rows.map((row) =>
      mapThresholdRow(
        row,
        quantizeQty(onHandByKey.get(thresholdMapKey(stockLocationId, row.supplyItemId)) || 0)
      )
    );
  },

  async listByTeam(teamId) {
    const rows = await prisma.locationSupplyThreshold.findMany({
      where: {
        stockLocation: { teamId, archivedAt: null },
        supplyItem: { teamId, archivedAt: null },
      },
      include: {
        stockLocation: { select: { id: true, name: true } },
        supplyItem: {
          select: {
            id: true,
            name: true,
            category: true,
            baseUnitId: true,
            defaultReorderPoint: true,
            defaultReorderQuantity: true,
          },
        },
      },
      orderBy: [{ stockLocationId: "asc" }, { updatedAt: "desc" }],
    });

    const onHandByKey = await getOnHandBaseByLocationSupplyItem(
      teamId,
      [...new Set(rows.map((row) => row.stockLocationId))]
    );

    return rows.map((row) =>
      mapThresholdRow(
        row,
        quantizeQty(
          onHandByKey.get(thresholdMapKey(row.stockLocationId, row.supplyItemId)) || 0
        )
      )
    );
  },

  async upsert(teamId, stockLocationId, supplyItemId, { reorderPoint, reorderQuantity }) {
    const location = await prisma.stockLocation.findFirst({
      where: { id: stockLocationId, teamId, archivedAt: null },
    });
    if (!location) {
      throw new LedgerValidationError("Stock location not found for team");
    }
    const supplyItem = await prisma.supplyItem.findFirst({
      where: { id: supplyItemId, teamId, archivedAt: null },
    });
    if (!supplyItem) {
      throw new LedgerValidationError("Supply item not found for team");
    }
    const point = quantizeQty(reorderPoint ?? 0);
    const qty = quantizeQty(reorderQuantity ?? 0);
    if (point.lt(0) || qty.lt(0)) {
      throw new LedgerValidationError("reorderPoint and reorderQuantity cannot be negative");
    }
    const row = await prisma.locationSupplyThreshold.upsert({
      where: {
        stockLocationId_supplyItemId: { stockLocationId, supplyItemId },
      },
      create: {
        stockLocationId,
        supplyItemId,
        reorderPoint: point,
        reorderQuantity: qty,
      },
      update: {
        reorderPoint: point,
        reorderQuantity: qty,
      },
      include: {
        supplyItem: {
          select: { id: true, name: true, category: true, baseUnitId: true },
        },
        stockLocation: { select: { id: true, name: true } },
      },
    });
    const onHandBase = await sumOnHandBaseAtLocation(stockLocationId, supplyItemId);
    return {
      ...row,
      reorderPoint: decimalToStringThreshold(row.reorderPoint),
      reorderQuantity: decimalToStringThreshold(row.reorderQuantity),
      onHandBase: decimalToStringThreshold(onHandBase),
      isLow: point.gt(0) && onHandBase.lte(point),
    };
  },

  /**
   * Low-stock rows across the team: thresholds with reorderPoint > 0 and onHand <= point.
   */
  async listLowStock(teamId) {
    const thresholds = await prisma.locationSupplyThreshold.findMany({
      where: {
        stockLocation: { teamId, archivedAt: null },
        supplyItem: { teamId, archivedAt: null },
      },
      include: {
        stockLocation: { select: { id: true, name: true } },
        supplyItem: {
          select: {
            id: true,
            name: true,
            category: true,
            baseUnitId: true,
            baseUnit: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    const low = [];
    for (const t of thresholds) {
      const reorderPoint = toDecimal(t.reorderPoint);
      if (!(reorderPoint.gt(0))) continue;
      const onHandBase = await sumOnHandBaseAtLocation(t.stockLocationId, t.supplyItemId);
      if (onHandBase.lte(reorderPoint)) {
        const reorderQuantity = toDecimal(t.reorderQuantity);
        const shortfall = quantizeQty(reorderPoint.sub(onHandBase));
        const suggestedBuy = reorderQuantity.gt(0) ? reorderQuantity : shortfall;
        low.push({
          id: t.id,
          stockLocationId: t.stockLocationId,
          supplyItemId: t.supplyItemId,
          reorderPoint: decimalToStringThreshold(t.reorderPoint),
          reorderQuantity: decimalToStringThreshold(t.reorderQuantity),
          onHandBase: decimalToStringThreshold(onHandBase),
          suggestedBuyBase: decimalToStringThreshold(suggestedBuy),
          stockLocation: t.stockLocation,
          supplyItem: t.supplyItem,
        });
      }
    }
    return low;
  },
};

/**
 * PropertySupplyItem: the standing list of supply items a property is stocked with,
 * each with an optional par quantity. Mirrors locationSupplyThresholdOps one level up.
 */
async function sumUnbilledAllocatedBase(teamId, propertyId, supplyItemId) {
  const lines = await prisma.replenishmentLine.findMany({
    where: {
      supplyItemId,
      invoiced: false,
      billable: true,
      replenishment: { teamId, propertyId },
    },
    select: { baseQtyDeployed: true, billBackAmount: true, replenishment: { select: { direction: true } } },
  });
  let total = new Decimal(0);
  for (const line of lines) {
    const sign =
      toDecimal(line.billBackAmount).lt(0) || line.replenishment.direction === "return" ? -1 : 1;
    total = total.add(toDecimal(line.baseQtyDeployed).mul(sign));
  }
  return quantizeQty(total);
}

export const propertySupplyItemOps = {
  async listByProperty(teamId, propertyId) {
    const property = await prisma.property.findFirst({ where: { id: propertyId, teamId } });
    if (!property) return null;

    const [rows, unbilledLines] = await Promise.all([
      prisma.propertySupplyItem.findMany({
        where: { propertyId },
        include: {
          supplyItem: {
            select: { id: true, name: true, category: true, baseUnitId: true, archivedAt: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.replenishmentLine.findMany({
        where: {
          invoiced: false,
          billable: true,
          replenishment: { teamId, propertyId },
        },
        select: {
          supplyItemId: true,
          baseQtyDeployed: true,
          billBackAmount: true,
          sku: { select: { name: true } },
          replenishment: { select: { direction: true } },
        },
      }),
    ]);

    const allocatedSinceInvoice = new Map();
    const skuNamesBySupplyItem = new Map();
    for (const line of unbilledLines) {
      const sign =
        toDecimal(line.billBackAmount).lt(0) || line.replenishment.direction === "return" ? -1 : 1;
      const current = allocatedSinceInvoice.get(line.supplyItemId) || new Decimal(0);
      allocatedSinceInvoice.set(
        line.supplyItemId,
        current.add(toDecimal(line.baseQtyDeployed).mul(sign))
      );
      if (line.sku?.name) {
        const names = skuNamesBySupplyItem.get(line.supplyItemId) || new Set();
        names.add(line.sku.name);
        skuNamesBySupplyItem.set(line.supplyItemId, names);
      }
    }

    return rows.map((r) => ({
      ...r,
      parQuantity: decimalToStringThreshold(r.parQuantity),
      allocatedSinceInvoice: decimalToStringThreshold(
        allocatedSinceInvoice.get(r.supplyItemId) || new Decimal(0)
      ),
      recentSkuNames: Array.from(skuNamesBySupplyItem.get(r.supplyItemId) || []),
    }));
  },

  async upsert(teamId, propertyId, supplyItemId, { parQuantity }) {
    const property = await prisma.property.findFirst({ where: { id: propertyId, teamId } });
    if (!property) {
      throw new LedgerValidationError("Property not found for team");
    }
    if (property.archivedAt) {
      throw new LedgerValidationError("Archived properties cannot be changed.");
    }
    const supplyItem = await prisma.supplyItem.findFirst({
      where: { id: supplyItemId, teamId, archivedAt: null },
    });
    if (!supplyItem) {
      throw new LedgerValidationError("Supply item not found for team");
    }
    const par = quantizeQty(parQuantity ?? 0);
    if (par.lt(0)) {
      throw new LedgerValidationError("parQuantity cannot be negative");
    }
    const row = await prisma.propertySupplyItem.upsert({
      where: {
        propertyId_supplyItemId: { propertyId, supplyItemId },
      },
      create: {
        propertyId,
        supplyItemId,
        parQuantity: par,
      },
      update: {
        parQuantity: par,
      },
      include: {
        supplyItem: { select: { id: true, name: true, category: true, baseUnitId: true } },
      },
    });
    const allocatedBase = await sumUnbilledAllocatedBase(teamId, propertyId, supplyItemId);
    return {
      ...row,
      parQuantity: decimalToStringThreshold(row.parQuantity),
      allocatedSinceInvoice: decimalToStringThreshold(allocatedBase),
      recentSkuNames: [],
    };
  },

  async remove(teamId, propertyId, supplyItemId) {
    const property = await prisma.property.findFirst({ where: { id: propertyId, teamId } });
    if (!property) {
      throw new LedgerValidationError("Property not found for team");
    }
    if (property.archivedAt) {
      throw new LedgerValidationError("Archived properties cannot be changed.");
    }
    const result = await prisma.propertySupplyItem.deleteMany({
      where: { propertyId, supplyItemId },
    });
    return result.count > 0;
  },
};

export const stockTransactionOps = {
  async findAllByTeam(teamId, opts = {}) {
    let entityType = opts.entityType;
    let resolvedEntityIds =
      opts.entityId !== undefined
        ? Array.isArray(opts.entityId)
          ? opts.entityId
          : [opts.entityId]
        : null;

    if (opts.skuId) {
      const sohWhere = { skuId: opts.skuId };
      if (opts.stockLocationId) sohWhere.stockLocationId = opts.stockLocationId;
      const hands = await prisma.stockOnHand.findMany({
        where: sohWhere,
        select: { id: true },
      });
      if (hands.length === 0) return [];
      entityType = "stock_on_hand";
      resolvedEntityIds = hands.map((h) => h.id);
    }

    const limit = Math.min(opts.limit || 200, 1000);
    const dateRange =
      opts.fromDate || opts.toDate ? buildBusinessDateRange(opts.fromDate, opts.toDate) : null;
    const dateUpperExclusive = dateRange
      ? dateRange.toExclusive ??
        (dateRange.to ? new Date(dateRange.to.getTime() + 1) : null)
      : null;

    // The business date used for ordering/limiting is COALESCE(effectiveAt, createdAt),
    // which Prisma's query builder cannot express directly. Select ordered IDs with raw
    // SQL first (matching the same filters the old Prisma `where` applied), then fetch and
    // format full rows via Prisma. This avoids truncating by createdAt before applying the
    // real business-date order, which could otherwise drop/keep the wrong rows once the
    // limit is hit.
    const conditions = [Prisma.sql`"teamId" = ${teamId}`];
    if (entityType) conditions.push(Prisma.sql`"entityType" = ${entityType}`);
    if (resolvedEntityIds) {
      if (resolvedEntityIds.length === 0) return [];
      conditions.push(Prisma.sql`"entityId" IN (${Prisma.join(resolvedEntityIds)})`);
    }
    if (opts.postingId) conditions.push(Prisma.sql`"postingId" = ${opts.postingId}`);
    if (opts.transactionType)
      conditions.push(Prisma.sql`"transactionType" = ${opts.transactionType}`);
    if (dateRange?.from)
      conditions.push(Prisma.sql`COALESCE("effectiveAt", "createdAt") >= ${dateRange.from}`);
    if (dateUpperExclusive)
      conditions.push(Prisma.sql`COALESCE("effectiveAt", "createdAt") < ${dateUpperExclusive}`);

    const whereSql = Prisma.join(conditions, " AND ");
    const idRows = await prisma.$queryRaw`
      SELECT "id"
      FROM "StockTransaction"
      WHERE ${whereSql}
      ORDER BY COALESCE("effectiveAt", "createdAt") DESC, "createdAt" DESC
      LIMIT ${limit}
    `;
    const ids = idRows.map((r) => r.id);
    if (ids.length === 0) return [];
    const rowsById = new Map(
      (
        await prisma.stockTransaction.findMany({
          where: { id: { in: ids } },
        })
      ).map((r) => [r.id, r])
    );
    const rows = ids.map((id) => rowsById.get(id)).filter(Boolean);
    const userIds = [
      ...new Set(rows.map((r) => r.createdByUserId).filter((id) => typeof id === "string" && id)),
    ];
    const users =
      userIds.length === 0
        ? []
        : await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, firstName: true, lastName: true },
          });
    const userById = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      ...r,
      quantityDelta: decimalToString(r.quantityDelta),
      unitPrice: r.unitPrice != null ? moneyStr(r.unitPrice) : null,
      effectiveAt: r.effectiveAt ? r.effectiveAt.toISOString() : null,
      createdByUser: r.createdByUserId ? userById.get(r.createdByUserId) || null : null,
    }));
  },
};
