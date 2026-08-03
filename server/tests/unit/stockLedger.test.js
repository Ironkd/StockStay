import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { computePackQtyFromBase, LedgerValidationError } from "../../stockLedger.js";

const Decimal = Prisma.Decimal;

describe("stockLedger computePackQtyFromBase (E4-5 / E5-4 / BR-3)", () => {
  it("divides base qty by pack size with 6dp half-up", () => {
    const result = computePackQtyFromBase(5, 10);
    expect(result.toFixed(6)).toBe("0.500000");
  });

  it("handles exact pack multiples", () => {
    expect(computePackQtyFromBase(20, 10).toFixed(6)).toBe("2.000000");
  });

  it("returns zero for zero base qty", () => {
    expect(computePackQtyFromBase(0, 10).equals(new Decimal(0))).toBe(true);
  });

  it("rejects non-positive pack size", () => {
    expect(() => computePackQtyFromBase(5, 0)).toThrow(LedgerValidationError);
    expect(() => computePackQtyFromBase(5, -1)).toThrow(LedgerValidationError);
  });

  it("rejects negative base qty", () => {
    expect(() => computePackQtyFromBase(-1, 10)).toThrow(LedgerValidationError);
  });
});
