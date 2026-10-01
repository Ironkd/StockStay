/**
 * Generate a branded invoice PDF buffer (pdfkit).
 */

import PDFDocument from "pdfkit";

const DEFAULT_INVOICE_CURRENCY =
  process.env.DEFAULT_INVOICE_CURRENCY || process.env.DEFAULT_CURRENCY || "USD";

function brandingFromTeam(team) {
  if (!team) {
    return {
      companyName: "Stock Stay",
      companyAddress: "",
      companyPhone: "",
      companyEmail: "",
      primaryColor: "#2563eb",
      footerText: "— Stock Stay",
    };
  }
  let style = {};
  if (team.invoiceStyle) {
    try {
      style =
        typeof team.invoiceStyle === "string" ? JSON.parse(team.invoiceStyle) : team.invoiceStyle;
    } catch {
      style = {};
    }
  }
  return {
    companyName: style.companyName || team.name || "Stock Stay",
    companyAddress: style.companyAddress != null ? String(style.companyAddress).trim() : "",
    companyPhone: style.companyPhone != null ? String(style.companyPhone).trim() : "",
    companyEmail: style.companyEmail != null ? String(style.companyEmail).trim() : "",
    primaryColor:
      style.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(style.primaryColor)
        ? style.primaryColor
        : "#2563eb",
    footerText: style.footerText != null ? String(style.footerText) : "— Stock Stay",
  };
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value, fallback = "—") {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

function normalizeCurrencyCode(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const code = candidate.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(code)) return code;
  }
  return DEFAULT_INVOICE_CURRENCY;
}

function resolveInvoiceCurrency(invoice, brandingSource) {
  return normalizeCurrencyCode(
    invoice?.currency,
    invoice?.currencyCode,
    invoice?.currency?.code,
    invoice?.team?.currency,
    invoice?.team?.currencyCode,
    invoice?.organization?.currency,
    invoice?.organization?.currencyCode,
    brandingSource?.currency,
    brandingSource?.currencyCode
  );
}

function formatMoney(value, currencyCode) {
  const amount = safeNumber(value, 0);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

function normalizeLineItem(item = {}) {
  const quantity = safeNumber(item.quantity, 0);
  const unitPrice = safeNumber(item.unitPrice, 0);
  const computedTotal = quantity * unitPrice;
  const total = safeNumber(item.total, computedTotal);
  return {
    name: cleanText(item.name, "Line item"),
    quantity,
    unitPrice,
    total,
    property: cleanText(item.property, ""),
  };
}

function drawFooter(doc, branding) {
  const footerY = doc.page.height - doc.page.margins.bottom + 8;
  doc
    .fontSize(8)
    .fillColor("#94a3b8")
    .text(branding.footerText, doc.page.margins.left, footerY, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: "center",
    });
}

function drawTableHeader(doc, colX, rgb) {
  const top = doc.y;
  doc.rect(colX[0], top, 512, 18).fill(`rgb(${rgb.r},${rgb.g},${rgb.b})`);
  doc.fillColor("#ffffff").fontSize(9);
  doc.text("Item", colX[0] + 4, top + 4, { width: 220 });
  doc.text("Qty", colX[1], top + 4, { width: 50, align: "right" });
  doc.text("Price", colX[2], top + 4, { width: 50, align: "right" });
  doc.text("Total", colX[3], top + 4, { width: 60, align: "right" });
  doc.fillColor("#334155").fontSize(9);
  doc.y = top + 22;
}

/**
 * @param {object} invoice - mapped invoice with items[] or lines[]
 * @param {object|null} brandingSource - org or team with invoiceStyle
 * @returns {Promise<Buffer>}
 */
export function buildInvoicePdf(invoice, brandingSource = null) {
  const branding = brandingFromTeam(brandingSource);
  const currencyCode = resolveInvoiceCurrency(invoice, brandingSource);
  const items =
    Array.isArray(invoice?.lines) && invoice.lines.length > 0
      ? invoice.lines.map((line) =>
          normalizeLineItem({
            name: line?.description,
            quantity: line?.quantity,
            unitPrice: line?.unitPrice,
            total: line?.amount,
            property: line?.property?.name,
          })
        )
      : Array.isArray(invoice?.items)
        ? invoice.items.map((item) =>
            normalizeLineItem({
              name: item?.name,
              quantity: item?.quantity,
              unitPrice: item?.unitPrice,
              total: item?.total,
              property: item?.propertyName,
            })
          )
        : [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER", compress: false });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const rgb = hexToRgb(branding.primaryColor);
    const colX = [50, 280, 340, 400, 470];
    const usableBottom = () => doc.page.height - doc.page.margins.bottom - 26;
    const addPage = ({ repeatTableHeader = false } = {}) => {
      drawFooter(doc, branding);
      doc.addPage();
      if (repeatTableHeader) drawTableHeader(doc, colX, rgb);
    };
    const ensureSpace = (requiredHeight, options = {}) => {
      if (doc.y + requiredHeight > usableBottom()) {
        addPage(options);
      }
    };

    doc.fontSize(20).fillColor(branding.primaryColor).text(branding.companyName, { align: "left" });
    doc.fillColor("#334155").fontSize(10);
    if (branding.companyAddress) {
      branding.companyAddress.split(/\n/).forEach((line) => {
        if (line.trim()) doc.text(line.trim());
      });
    }
    if (branding.companyPhone) doc.text(`Tel: ${branding.companyPhone}`);
    if (branding.companyEmail) doc.text(branding.companyEmail);

    doc.moveDown();
    doc.fontSize(16).fillColor(branding.primaryColor).text(`Invoice ${cleanText(invoice?.invoiceNumber)}`);
    doc.fillColor("#64748b").fontSize(10);
    doc.text(`Bill to: ${cleanText(invoice?.clientName)}`);
    doc.text(`Date: ${safeDate(invoice?.date)}    Due: ${safeDate(invoice?.dueDate)}`);
    if (invoice?.billingPeriodStart && invoice?.billingPeriodEnd) {
      doc.text(`Period: ${safeDate(invoice.billingPeriodStart)} → ${safeDate(invoice.billingPeriodEnd)}`);
    }

    doc.moveDown();
    drawTableHeader(doc, colX, rgb);

    for (const item of items) {
      const label = item.property ? `${item.name} · ${item.property}` : item.name;
      const rowHeight = Math.max(16, doc.heightOfString(label, { width: 220 }) + 4);
      ensureSpace(rowHeight, { repeatTableHeader: true });
      const rowTop = doc.y;

      doc.text(label, colX[0] + 4, rowTop, { width: 220 });
      doc.text(String(item.quantity), colX[1], rowTop, { width: 50, align: "right" });
      doc.text(formatMoney(item.unitPrice, currencyCode), colX[2], rowTop, {
        width: 50,
        align: "right",
      });
      doc.text(formatMoney(item.total, currencyCode), colX[3], rowTop, {
        width: 60,
        align: "right",
      });
      doc.y = rowTop + rowHeight;
    }

    doc.y += 12;
    const notesHeight = invoice?.notes
      ? doc.heightOfString(String(invoice.notes), { width: 500 }) + 28
      : 0;
    const totalsBlockHeight = 60 + notesHeight;
    ensureSpace(totalsBlockHeight);

    doc
      .moveTo(50, doc.y)
      .lineTo(562, doc.y)
      .strokeColor("#e2e8f0")
      .stroke();
    doc.y += 10;
    doc.fontSize(10).fillColor("#475569");
    doc.text(`Subtotal: ${formatMoney(invoice?.subtotal, currencyCode)}`, 350, doc.y, {
      width: 200,
      align: "right",
    });
    doc.y += 14;
    doc.text(`Tax: ${formatMoney(invoice?.tax, currencyCode)}`, 350, doc.y, {
      width: 200,
      align: "right",
    });
    doc.y += 16;
    doc
      .fontSize(12)
      .fillColor(branding.primaryColor)
      .text(`Total: ${formatMoney(invoice?.total, currencyCode)}`, 350, doc.y, {
        width: 200,
        align: "right",
      });

    if (invoice?.notes) {
      doc.y += 28;
      doc.fontSize(9).fillColor("#64748b").text(String(invoice.notes), 50, doc.y, { width: 500 });
    }

    drawFooter(doc, branding);
    doc.end();
  });
}
