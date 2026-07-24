/**
 * Shared Decimal helpers for stock / catalogue APIs.
 * Prefer these over float division for unitRate and qty/money string formatting.
 */

import { Prisma } from "@prisma/client";

const Decimal = Prisma.Decimal;
export const QTY_DP = 6;
export const MONEY_DP = 4;

export function toDecimal(value, fieldName = "value") {
  try {
    const d = value instanceof Decimal ? value : new Decimal(value);
    if (!d.isFinite()) throw new Error("not finite");
    return d;
  } catch {
    const err = new Error(`${fieldName} must be a number`);
    err.code = "VALIDATION";
    throw err;
  }
}

export function qtyStr(d) {
  return toDecimal(d).toDecimalPlaces(QTY_DP, Decimal.ROUND_HALF_UP).toFixed(QTY_DP);
}

export function moneyStr(d) {
  return toDecimal(d).toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP).toFixed(MONEY_DP);
}

export function markupStr(d) {
  return toDecimal(d).toFixed(4);
}

/** unitRate = purchasePrice / packSize with Decimal math */
export function computeUnitRate(purchasePrice, packSize) {
  const price = toDecimal(purchasePrice, "purchasePrice");
  const pack = toDecimal(packSize, "packSize");
  if (!(pack.gt(0))) {
    const err = new Error("packSize must be greater than zero");
    err.code = "VALIDATION";
    throw err;
  }
  return price.div(pack).toDecimalPlaces(QTY_DP, Decimal.ROUND_HALF_UP);
}

export { Decimal };
