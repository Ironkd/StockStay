import { describe, it, expect } from "vitest";
import {
  getAllPlans,
  getPlanLimits,
  getResourceMax,
  isWithinLimit,
} from "../../planConfig.js";

describe("planConfig (E1-9 / E4-8 / E8-5)", () => {
  it("exposes free/starter/pro", () => {
    const all = getAllPlans();
    expect(all.plans.free).toBeTruthy();
    expect(all.plans.starter).toBeTruthy();
    expect(all.plans.pro).toBeTruthy();
  });

  it("Free caps match live JSON", () => {
    const free = getPlanLimits("free");
    expect(free.maxProperties).toBe(1);
    expect(free.maxStockLocations).toBe(1);
    expect(free.maxSupplyItems).toBe(10);
    expect(free.maxSkus).toBe(15);
    expect(free.maxInventoryItems).toBe(30);
  });

  it("isWithinLimit treats null as unlimited", () => {
    expect(isWithinLimit(null, 999)).toBe(true);
    expect(isWithinLimit(1, 0)).toBe(true);
    expect(isWithinLimit(1, 1)).toBe(false);
  });

  it("getResourceMax maps resource keys", () => {
    const free = getPlanLimits("free");
    expect(getResourceMax(free, "properties")).toBe(1);
    expect(getResourceMax(free, "skus")).toBe(15);
    expect(getResourceMax(free, "users", 3)).toBe(3);
  });
});
