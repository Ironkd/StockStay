import { describe, it, expect } from "vitest";
import { buildInvoicePdf } from "../../invoicePdf.js";

function extractPdfText(buffer) {
  const raw = buffer.toString("latin1");
  const decodedHex = Array.from(raw.matchAll(/<([0-9A-Fa-f]+)>/g), ([, hex]) =>
    Buffer.from(hex, "hex").toString("latin1").replace(/\u00a0/g, " ")
  ).join("\n");
  return `${raw}\n${decodedHex}`;
}

function buildInvoice(overrides = {}) {
  return {
    invoiceNumber: "INV-2026-0001",
    clientName: "Acme Hospitality",
    date: "2026-09-01",
    dueDate: "2026-09-15",
    subtotal: 120,
    tax: 15.6,
    total: 135.6,
    notes: "Thanks for your business.",
    items: [
      { name: "Stock replenishment", quantity: 2, unitPrice: 60, total: 120, propertyName: "Cabin 1" },
    ],
    ...overrides,
  };
}

describe("invoicePdf", () => {
  it("generates a multi-page PDF without throwing for many line items", async () => {
    const items = Array.from({ length: 80 }, (_, index) => ({
      name: `Line item ${index + 1}`,
      quantity: 1,
      unitPrice: 10,
      total: 10,
      propertyName: `Property ${index + 1}`,
    }));
    const buffer = await buildInvoicePdf(buildInvoice({
      subtotal: 800,
      total: 800,
      items,
    }));

    const text = extractPdfText(buffer);

    expect(buffer.length).toBeGreaterThan(0);
    expect((text.match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(1);
    expect(text).toContain("USD 800.00");
  });

  it("renders malformed numeric values without NaN", async () => {
    const buffer = await buildInvoicePdf(buildInvoice({
      subtotal: "oops",
      tax: undefined,
      total: "nope",
      items: [
        { name: "Broken quantity", quantity: "bad", unitPrice: 12.5, total: "NaNish" },
        { name: "Broken price", quantity: 3, unitPrice: null, total: undefined },
      ],
    }));

    const text = extractPdfText(buffer);

    expect(text).not.toContain("NaN");
    expect(text).toContain("USD");
    expect(text).toContain("0.00");
  });

  it("uses the invoice currency when available", async () => {
    const buffer = await buildInvoicePdf(
      buildInvoice({
        currency: "EUR",
        subtotal: 10,
        tax: 0,
        total: 10,
        items: [{ name: "Service fee", quantity: 1, unitPrice: 10, total: 10 }],
      })
    );

    const text = extractPdfText(buffer);

    expect(text).toContain("EUR");
    expect(text).not.toContain("USD");
    expect(text).not.toContain("$10.00");
  });
});
