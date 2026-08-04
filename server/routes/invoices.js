import { invoiceOps, clientOps, teamOps, organizationOps } from "../db.js";
import {
  generateDraftInvoicesForTeam,
  updateDraftInvoice,
  buildInvoicesCsv,
  ClientBillingError,
} from "../clientBilling.js";
import { buildInvoicePdf } from "../invoicePdf.js";
import { sendInvoiceEmail } from "../email.js";

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function registerInvoiceRoutes(app, deps) {
  const {
    authenticateToken,
    requireWriteAccess,
    loadCurrentUser,
    userHasPageAccess,
  } = deps;

// ==================== INVOICES ROUTES ====================

app.get("/api/invoices", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    if (!currentUser?.teamId) {
      return res.json([]);
    }

    const invoices = await invoiceOps.findAll(currentUser.teamId);
    res.json(invoices);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ message: "Error fetching invoices" });
  }
});

app.get("/api/invoices/export.csv", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    if (!currentUser?.teamId) {
      return res.status(400).json({ message: "No active team." });
    }
    const idsRaw = typeof req.query.ids === "string" ? req.query.ids : "";
    const ids = idsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    let invoices = await invoiceOps.findAll(currentUser.teamId);
    if (ids.length > 0) {
      const idSet = new Set(ids);
      invoices = invoices.filter((inv) => idSet.has(inv.id));
    }
    const csv = buildInvoicesCsv(invoices);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="invoices-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting invoices CSV:", error);
    res.status(500).json({ message: "Error exporting invoices" });
  }
});

app.get("/api/invoices/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoice = await invoiceOps.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (invoice.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    res.json(invoice);
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ message: "Error fetching invoice" });
  }
});

app.post("/api/invoices", authenticateToken, requireWriteAccess, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    // Allow create for users with Invoices access (inventory bill-to path retired)
    const canCreateInvoice =
      userHasPageAccess(currentUser, "invoices") || userHasPageAccess(currentUser, "inventory");
    if (!canCreateInvoice) {
      return res.status(403).json({ message: "You do not have access to create invoices." });
    }
    if (!currentUser?.teamId) {
      return res.status(400).json({ message: "No active team." });
    }
    const invoiceData = req.body;

    if (
      invoiceData.items &&
      Array.isArray(invoiceData.items) &&
      invoiceData.items.some((item) => item.inventoryItemId)
    ) {
      return res.status(410).json({
        message:
          "Billing from inventory items is retired. Use replenishment (POST /api/replenishments); charges appear on unbilled lines until scheduled invoicing.",
        code: "GONE",
      });
    }

    const newInvoice = await invoiceOps.create({
      ...invoiceData,
      teamId: currentUser.teamId,
    });
    res.status(201).json(newInvoice);
  } catch (error) {
    console.error("Error creating invoice:", error);
    res.status(500).json({ message: "Error creating invoice" });
  }
});

app.put("/api/invoices/:id", authenticateToken, requireWriteAccess, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const existingInvoice = await invoiceOps.findById(req.params.id);

    if (!existingInvoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (existingInvoice.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const body = req.body || {};
    if (
      (existingInvoice.lines && existingInvoice.lines.length > 0) ||
      body.taxRate !== undefined ||
      (existingInvoice.billingPeriodStart && body.items === undefined)
    ) {
      try {
        const updated = await updateDraftInvoice(currentUser.teamId, req.params.id, {
          taxRate: body.taxRate,
          notes: body.notes,
          status: body.status,
          dueDate: body.dueDate,
          date: body.date,
        });
        return res.json(updated);
      } catch (err) {
        if (err instanceof ClientBillingError) {
          return res.status(err.code === "NOT_FOUND" ? 404 : 400).json({ message: err.message });
        }
        throw err;
      }
    }

    const updatedInvoice = await invoiceOps.update(req.params.id, body);
    res.json(updatedInvoice);
  } catch (error) {
    console.error("Error updating invoice:", error);
    res.status(500).json({ message: "Error updating invoice" });
  }
});

app.delete("/api/invoices/:id", authenticateToken, requireWriteAccess, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoice = await invoiceOps.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (invoice.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    await invoiceOps.delete(req.params.id);
    res.json({ message: "Invoice deleted successfully" });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({ message: "Error deleting invoice" });
  }
});

app.post("/api/invoices/:id/send", authenticateToken, requireWriteAccess, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoice = await invoiceOps.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (invoice.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (!invoice.clientId) {
      return res.status(400).json({ message: "This invoice has no client. Add a client before sending." });
    }
    const client = await clientOps.findById(invoice.clientId);
    if (!client) {
      return res.status(400).json({ message: "Client not found." });
    }
    const clientEmail = (client.email && String(client.email).trim()) || null;
    if (!clientEmail) {
      return res.status(400).json({
        message: `No email address for ${invoice.clientName}. Add an email to the client before sending.`,
      });
    }
    const team = currentUser.teamId ? await teamOps.findById(currentUser.teamId) : null;
    const branding =
      team?.organizationId
        ? await organizationOps.findById(team.organizationId)
        : null;
    let pdfBuffer = null;
    try {
      pdfBuffer = await buildInvoicePdf(invoice, branding || team);
    } catch (pdfErr) {
      console.error("[PDF] Failed to build invoice PDF:", pdfErr?.message || pdfErr);
    }
    const sent = await sendInvoiceEmail(
      clientEmail,
      invoice.clientName,
      invoice,
      branding,
      pdfBuffer
    );
    if (!sent) {
      return res.status(500).json({
        message: "Failed to send email. Check server email configuration (Resend or SMTP).",
      });
    }
    await invoiceOps.update(invoice.id, { status: "sent" });
    res.json({ message: `Invoice sent to ${clientEmail}.`, sentTo: clientEmail });
  } catch (error) {
    console.error("Error sending invoice:", error);
    res.status(500).json({ message: "Error sending invoice." });
  }
});

app.post("/api/billing/generate-drafts", authenticateToken, requireWriteAccess, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    if (!currentUser.teamId) {
      return res.status(400).json({ message: "No active team." });
    }
    const clientId =
      typeof req.body?.clientId === "string" && req.body.clientId.trim()
        ? req.body.clientId.trim()
        : null;
    const result = await generateDraftInvoicesForTeam(currentUser.teamId, { clientId });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof ClientBillingError) {
      return res.status(error.code === "NOT_FOUND" ? 404 : 400).json({ message: error.message });
    }
    console.error("Error generating draft invoices:", error);
    res.status(500).json({ message: "Error generating draft invoices" });
  }
});

app.get("/api/invoices/:id/export.csv", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoice = await invoiceOps.findById(req.params.id);
    if (!invoice || invoice.teamId !== currentUser.teamId) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    const csv = buildInvoicesCsv([invoice]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="invoice-${invoice.invoiceNumber}.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting invoice CSV:", error);
    res.status(500).json({ message: "Error exporting invoice" });
  }
});
}
