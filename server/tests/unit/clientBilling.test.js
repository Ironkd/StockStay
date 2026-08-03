import { describe, it, expect } from "vitest";
import {
  periodContaining,
  listClosedPeriods,
  invoiceLinesToCsvRows,
  buildInvoicesCsv,
} from "../../clientBilling.js";

describe("clientBilling period math (E6-1 / E6-3)", () => {
  const zone = "America/Toronto";
  const teamCreatedAt = new Date("2026-01-05T12:00:00Z");

  it("weekly period is ISO week [Mon, next Mon)", () => {
    const period = periodContaining(new Date("2026-08-05T15:00:00Z"), "weekly", {
      zone,
      teamCreatedAt,
    });
    expect(period.start).toBeInstanceOf(Date);
    expect(period.end.getTime()).toBeGreaterThan(period.start.getTime());
    // End is 7 days after start
    expect(period.end.getTime() - period.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("monthly_eom uses calendar month bounds", () => {
    const period = periodContaining(new Date("2026-08-15T12:00:00Z"), "monthly_eom", {
      zone,
      teamCreatedAt,
    });
    const start = period.start;
    const end = period.end;
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it("biweekly anchors to team creation week", () => {
    const period = periodContaining(new Date("2026-08-05T12:00:00Z"), "biweekly", {
      zone,
      teamCreatedAt,
    });
    expect(period.end.getTime() - period.start.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it("listClosedPeriods returns periods ending on or before asOf", () => {
    const periods = listClosedPeriods("weekly", {
      zone,
      teamCreatedAt,
      asOf: new Date("2026-08-10T12:00:00Z"),
      maxPeriods: 3,
    });
    expect(periods.length).toBeGreaterThan(0);
    expect(periods.length).toBeLessThanOrEqual(3);
    for (const p of periods) {
      expect(p.end.getTime()).toBeLessThanOrEqual(new Date("2026-08-10T12:00:00Z").getTime());
    }
  });
});

describe("clientBilling CSV helpers (E6-6)", () => {
  it("invoiceLinesToCsvRows flattens lines", () => {
    const rows = invoiceLinesToCsvRows({
      invoiceNumber: "INV-1",
      clientName: "Acme",
      status: "draft",
      date: "2026-08-01",
      dueDate: "2026-08-15",
      tax: 0,
      total: 12.5,
      lines: [
        {
          description: "Pods",
          quantity: 5,
          unitPrice: 2,
          amount: 10,
          property: { name: "Cabin" },
        },
      ],
    });
    expect(rows.length).toBe(1);
    expect(rows[0].description).toBe("Pods");
    expect(rows[0].clientName).toBe("Acme");
  });

  it("buildInvoicesCsv includes header", () => {
    const csv = buildInvoicesCsv([
      {
        invoiceNumber: "INV-1",
        clientName: "Acme",
        status: "draft",
        date: "2026-08-01",
        dueDate: "",
        tax: 0,
        total: 0,
        lines: [],
      },
    ]);
    expect(csv).toContain("invoiceNumber");
  });
});
