import type { StockLocation } from "../types";

/** Whether a supply-item category should appear for a stock location's filtered views. */
export function isCategoryVisible(
  category: string,
  loc: Pick<StockLocation, "visibleCategories" | "showUncategorized">
): boolean {
  const trimmed = (category || "").trim();
  if (!trimmed) return loc.showUncategorized !== false;
  if (loc.visibleCategories == null) return true;
  return loc.visibleCategories.includes(trimmed);
}
