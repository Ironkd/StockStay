/**
 * StockTransaction ledger engine (Appendix A #4).
 * Sole path for mutating StockOnHand / PropertyStock quantities.
 */

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

const Decimal = Prisma.Decimal;
const QTY_DP = 6;

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

async function lockPropertyStock(tx, id) {
  const rows = await tx.$queryRaw`
    SELECT id, quantity, "teamId", "propertyId", "supplyItemId"
    FROM "PropertyStock"
    WHERE id = ${id}
    FOR UPDATE
  `;
  return rows[0] || null;
}

function sortIds(ids) {
  return [...new Set(ids.filter(Boolean))].sort();
}

/**
 * Get-or-create PropertyStock at 0; lock the row. Handles unique races (P2002).
 */
export async function ensurePropertyStock(
  tx,
  { teamId, propertyId, supplyItemId, reorderPoint, reorderQuantity }
) {
  const existing = await tx.propertyStock.findUnique({
    where: { propertyId_supplyItemId: { propertyId, supplyItemId } },
  });
  if (existing) {
    const locked = await lockPropertyStock(tx, existing.id);
    if (!locked) {
      throw new LedgerValidationError("PropertyStock disappeared during lock");
    }
    return locked;
  }

  try {
    const created = await tx.propertyStock.create({
      data: {
        teamId,
        propertyId,
        supplyItemId,
        quantity: 0,
        reorderPoint: reorderPoint ?? 0,
        reorderQuantity: reorderQuantity ?? 0,
      },
    });
    const locked = await lockPropertyStock(tx, created.id);
    if (!locked) {
      throw new LedgerValidationError("PropertyStock disappeared after create");
    }
    return locked;
  } catch (err) {
    if (err?.code !== "P2002") throw err;
    const again = await tx.propertyStock.findUnique({
      where: { propertyId_supplyItemId: { propertyId, supplyItemId } },
    });
    if (!again) {
      throw new LedgerValidationError("PropertyStock unique conflict but row not found");
    }
    const locked = await lockPropertyStock(tx, again.id);
    if (!locked) {
      throw new LedgerValidationError("PropertyStock disappeared after conflict");
    }
    return locked;
  }
}

async function applyEntriesInTx(tx, entries, { postingId, userId, referenceType, referenceId }) {
  const sohIds = sortIds(
    entries.filter((e) => e.entityType === "stock_on_hand").map((e) => e.entityId)
  );
  const psIds = sortIds(
    entries.filter((e) => e.entityType === "property_stock").map((e) => e.entityId)
  );

  for (const id of sohIds) {
    const row = await lockStockOnHand(tx, id);
    if (!row) throw new LedgerValidationError(`StockOnHand not found: ${id}`);
  }
  for (const id of psIds) {
    const row = await lockPropertyStock(tx, id);
    if (!row) throw new LedgerValidationError(`PropertyStock not found: ${id}`);
  }

  const ordered = [
    ...entries
      .filter((e) => e.entityType === "stock_on_hand")
      .sort((a, b) => a.entityId.localeCompare(b.entityId)),
    ...entries
      .filter((e) => e.entityType === "property_stock")
      .sort((a, b) => a.entityId.localeCompare(b.entityId)),
  ];

  const created = [];
  for (const entry of ordered) {
    const delta = quantizeQty(entry.quantityDelta);
    if (entry.entityType === "stock_on_hand") {
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
    } else {
      const row = await lockPropertyStock(tx, entry.entityId);
      const current = toDecimal(row.quantity);
      const next = quantizeQty(current.add(delta));
      if (next.lt(0)) {
        throw new InsufficientStockError("Insufficient property stock", {
          entityType: entry.entityType,
          entityId: entry.entityId,
          current: decimalToString(current),
          delta: decimalToString(delta),
        });
      }
      await tx.propertyStock.update({
        where: { id: entry.entityId },
        data: { quantity: next },
      });
    }

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
        createdByUserId: userId ?? null,
      },
    });
    created.push({
      ...txn,
      quantityDelta: decimalToString(txn.quantityDelta),
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
    if (!e.entityType || !["stock_on_hand", "property_stock"].includes(e.entityType)) {
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
    };
  });

  return prisma.$transaction(async (tx) =>
    applyEntriesInTx(tx, normalized, { postingId, userId, referenceType, referenceId })
  );
}

async function resolveStockOnHandForSku(teamId, skuId) {
  const sku = await prisma.sku.findUnique({
    where: { id: skuId },
    include: { stockOnHand: true },
  });
  if (!sku || sku.teamId !== teamId) {
    throw new LedgerValidationError("SKU not found for team");
  }
  if (sku.archivedAt) {
    throw new LedgerValidationError("SKU is archived");
  }
  if (!sku.stockOnHand) {
    throw new LedgerValidationError("SKU has no StockOnHand balance row");
  }
  return { sku, stockOnHand: sku.stockOnHand };
}

export async function receiveStock({
  teamId,
  skuId,
  packQty,
  userId,
  referenceType,
  referenceId,
}) {
  const qty = quantizeQty(packQty);
  if (!(qty.gt(0))) {
    throw new LedgerValidationError("Receive quantity must be greater than zero");
  }
  const { stockOnHand } = await resolveStockOnHandForSku(teamId, skuId);
  return postEntries(
    [
      {
        teamId,
        entityType: "stock_on_hand",
        entityId: stockOnHand.id,
        quantityDelta: qty,
        transactionType: "receipt",
      },
    ],
    { userId, referenceType, referenceId }
  );
}

export async function adjustStockOnHand({
  teamId,
  skuId,
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
  const { stockOnHand } = await resolveStockOnHandForSku(teamId, skuId);
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
 * Break-pack replenish or return between one SKU (packs) and property stock (base units).
 */
export async function postBreakPackMove({
  teamId,
  skuId,
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

  const { sku, stockOnHand } = await resolveStockOnHandForSku(teamId, skuId);
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
    const propertyStock = await ensurePropertyStock(tx, {
      teamId,
      propertyId,
      supplyItemId: sku.supplyItemId,
      reorderPoint: supplyItem.defaultReorderPoint,
      reorderQuantity: supplyItem.defaultReorderQuantity,
    });

    const sohDelta = direction === "replenish" ? packQty.neg() : packQty;
    const psDelta = direction === "replenish" ? base : base.neg();
    const sohType = direction === "replenish" ? "replenishment_out" : "replenishment_in";
    const psType = direction === "replenish" ? "replenishment_in" : "replenishment_out";

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
        {
          teamId,
          entityType: "property_stock",
          entityId: propertyStock.id,
          quantityDelta: psDelta,
          transactionType: psType,
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

export const propertyStockOps = {
  async findAllByTeam(teamId) {
    const rows = await prisma.propertyStock.findMany({
      where: { teamId },
      include: {
        property: { select: { id: true, name: true } },
        supplyItem: { select: { id: true, name: true, category: true, baseUnitId: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => ({
      ...r,
      quantity: decimalToString(r.quantity),
      reorderPoint: decimalToString(r.reorderPoint),
      reorderQuantity: decimalToString(r.reorderQuantity),
    }));
  },
};

export const stockTransactionOps = {
  async findAllByTeam(teamId, opts = {}) {
    const where = { teamId };
    if (opts.entityType) where.entityType = opts.entityType;
    if (opts.entityId) where.entityId = opts.entityId;
    if (opts.postingId) where.postingId = opts.postingId;
    if (opts.transactionType) where.transactionType = opts.transactionType;
    if (opts.fromDate || opts.toDate) {
      where.createdAt = {};
      if (opts.fromDate) where.createdAt.gte = new Date(opts.fromDate);
      if (opts.toDate) where.createdAt.lte = new Date(opts.toDate);
    }
    if (opts.skuId) {
      const soh = await prisma.stockOnHand.findUnique({ where: { skuId: opts.skuId } });
      if (!soh) return [];
      where.entityType = "stock_on_hand";
      where.entityId = soh.id;
    }
    const rows = await prisma.stockTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.limit || 200, 1000),
    });
    return rows.map((r) => ({
      ...r,
      quantityDelta: decimalToString(r.quantityDelta),
    }));
  },
};
