import type { Client, Property } from "../types";

export type MarkupInfo = {
  pct: number;
  label: string;
};

/** Match server effectiveMarkup: property override → client default → 0 */
export function effectiveMarkup(
  property: Property | undefined | null,
  client?: Client | null,
  clients: Client[] = []
): MarkupInfo {
  if (!property) return { pct: 0, label: "No markup" };

  if (property.markupPercentage != null && property.markupPercentage !== "") {
    const pct = Number(property.markupPercentage) || 0;
    return { pct, label: `Property override ${pct}%` };
  }

  const resolved =
    client ?? (property.clientId ? clients.find((c) => c.id === property.clientId) : undefined);

  if (resolved) {
    const pct = Number(resolved.defaultMarkupPercentage ?? 0) || 0;
    return { pct, label: `Client default ${pct}%` };
  }

  return { pct: 0, label: "No markup" };
}

/** billBackAmount = baseQty × unitRate × (1 + markup/100); credits negative */
export function estimateBillBack(
  baseQty: number,
  unitRate: number,
  markupPct: number,
  { credit = false }: { credit?: boolean } = {}
): number {
  if (!(baseQty > 0) || !Number.isFinite(baseQty) || !Number.isFinite(unitRate)) {
    return 0;
  }
  const amount = baseQty * unitRate * (1 + (markupPct || 0) / 100);
  return credit ? -amount : amount;
}

export function formatMoney(amount: number): string {
  return amount.toFixed(2);
}
