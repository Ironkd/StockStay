/**
 * Generate a branded invoice PDF buffer (pdfkit).
 */

import PDFDocument from "pdfkit";

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

/**
 * @param {object} invoice - mapped invoice with items[] or lines[]
 * @param {object|null} brandingSource - org or team with invoiceStyle
 * @returns {Promise<Buffer>}
 */
export function buildInvoicePdf(invoice, brandingSource = null) {
  const branding = brandingFromTeam(brandingSource);
  const items =
    Array.isArray(invoice.lines) && invoice.lines.length > 0
      ? invoice.lines.map((l) => ({
          name: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          total: Number(l.amount),
          property: l.property?.name,
        }))
      : (invoice.items || []).map((i) => ({
          name: i.name,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          total: Number(i.total),
          property: i.propertyName,
        }));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const rgb = hexToRgb(branding.primaryColor);

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
    doc.fontSize(16).fillColor(branding.primaryColor).text(`Invoice ${invoice.invoiceNumber}`);
    doc.fillColor("#64748b").fontSize(10);
    doc.text(`Bill to: ${invoice.clientName || "—"}`);
    doc.text(`Date: ${invoice.date || "—"}    Due: ${invoice.dueDate || "—"}`);
    if (invoice.billingPeriodStart && invoice.billingPeriodEnd) {
      doc.text(
        `Period: ${new Date(invoice.billingPeriodStart).toISOString().slice(0, 10)} → ${new Date(invoice.billingPeriodEnd).toISOString().slice(0, 10)}`
      );
    }

    doc.moveDown();
    const tableTop = doc.y;
    const colX = [50, 280, 340, 400, 470];
    doc.rect(50, tableTop, 512, 18).fill(`rgb(${rgb.r},${rgb.g},${rgb.b})`);
    doc.fillColor("#ffffff").fontSize(9);
    doc.text("Item", colX[0] + 4, tableTop + 4, { width: 220 });
    doc.text("Qty", colX[1], tableTop + 4, { width: 50, align: "right" });
    doc.text("Price", colX[2], tableTop + 4, { width: 50, align: "right" });
    doc.text("Total", colX[3], tableTop + 4, { width: 60, align: "right" });

    let y = tableTop + 22;
    doc.fillColor("#334155").fontSize(9);
    for (const item of items) {
      const label = item.property ? `${item.name} · ${item.property}` : item.name;
      doc.text(label, colX[0] + 4, y, { width: 220 });
      doc.text(String(item.quantity), colX[1], y, { width: 50, align: "right" });
      doc.text(`$${Number(item.unitPrice).toFixed(2)}`, colX[2], y, { width: 50, align: "right" });
      doc.text(`$${Number(item.total).toFixed(2)}`, colX[3], y, { width: 60, align: "right" });
      y += 16;
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    }

    y += 12;
    doc
      .moveTo(50, y)
      .lineTo(562, y)
      .strokeColor("#e2e8f0")
      .stroke();
    y += 10;
    doc.fontSize(10).fillColor("#475569");
    doc.text(`Subtotal: $${Number(invoice.subtotal ?? 0).toFixed(2)}`, 350, y, {
      width: 200,
      align: "right",
    });
    y += 14;
    doc.text(`Tax: $${Number(invoice.tax ?? 0).toFixed(2)}`, 350, y, {
      width: 200,
      align: "right",
    });
    y += 16;
    doc
      .fontSize(12)
      .fillColor(branding.primaryColor)
      .text(`Total: $${Number(invoice.total ?? 0).toFixed(2)}`, 350, y, {
        width: 200,
        align: "right",
      });

    if (invoice.notes) {
      y += 28;
      doc.fontSize(9).fillColor("#64748b").text(String(invoice.notes), 50, y, { width: 500 });
    }

    doc
      .fontSize(8)
      .fillColor("#94a3b8")
      .text(branding.footerText, 50, 720, { width: 512, align: "center" });

    doc.end();
  });
}
