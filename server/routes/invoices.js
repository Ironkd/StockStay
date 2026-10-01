import { invoiceOps, clientOps, teamOps, organizationOps } from "../db.js";
import { prisma } from "../db.js";
import {
  generateDraftInvoicesForTeam,
  updateDraftInvoice,
  buildInvoicesCsv,
  ClientBillingError,
} from "../clientBilling.js";
import { buildInvoicePdf } from "../invoicePdf.js";
import { sendInvoiceEmail } from "../email.js";
import { Decimal } from "../decimalUtil.js";

const MONEY_TOLERANCE = new Decimal("0.01");
const EDIT_LOCKED_STATUSES = new Set(["paid", "void"]);
const SOFT_DELETE_STATUSES = new Set(["sent", "paid", "overdue", "void"]);
const SEND_BLOCKED_STATUSES = new Set(["paid", "void"]);
const INTERNAL_SENDING_STATUS = "sending";

function roundMoney(value) {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function parseDecimal(value, fieldName) {
  try {
    const decimal = new Decimal(value ?? 0);
    if (!decimal.isFinite()) throw new Error("not finite");
    return decimal;
  } catch {
    const error = new Error(`${fieldName} must be a valid number`);
    error.code = "VALIDATION";
    throw error;
  }
}

function withinMoneyTolerance(submitted, computed) {
  return parseDecimal(submitted, "amount").sub(computed).abs().lte(MONEY_TOLERANCE);
}

function normalizeManualInvoice(invoiceData = {}, existingInvoice = null) {
  const items = Array.isArray(invoiceData.items)
    ? invoiceData.items
    : Array.isArray(existingInvoice?.items)
      ? existingInvoice.items
      : [];
  const taxRate = parseDecimal(
    invoiceData.taxRate ?? invoiceData.tax ?? existingInvoice?.taxRate ?? 0,
    "taxRate"
  );
  if (taxRate.lt(0)) {
    const error = new Error("taxRate cannot be negative");
    error.code = "VALIDATION";
    throw error;
  }

  let subtotal = new Decimal(0);
  const normalizedItems = items.map((item, index) => {
    const quantity = parseDecimal(item?.quantity ?? 0, `items[${index}].quantity`);
    const unitPrice = parseDecimal(item?.unitPrice ?? 0, `items[${index}].unitPrice`);
    const lineTotal = roundMoney(quantity.mul(unitPrice));
    subtotal = subtotal.add(lineTotal);

    return {
      ...item,
      name: String(item?.name ?? "").trim(),
      quantity: Number(quantity.toString()),
      unitPrice: Number(unitPrice.toString()),
      total: Number(lineTotal.toFixed(2)),
    };
  });

  subtotal = roundMoney(subtotal);
  const taxAmount = roundMoney(subtotal.mul(taxRate).div(100));
  const total = roundMoney(subtotal.add(taxAmount));

  if (invoiceData.subtotal !== undefined && !withinMoneyTolerance(invoiceData.subtotal, subtotal)) {
    const error = new Error("Invoice subtotal does not match submitted line items.");
    error.code = "VALIDATION";
    throw error;
  }
  if (invoiceData.total !== undefined && !withinMoneyTolerance(invoiceData.total, total)) {
    const error = new Error("Invoice total does not match submitted line items.");
    error.code = "VALIDATION";
    throw error;
  }

  return {
    ...invoiceData,
    items: normalizedItems,
    taxRate: Number(taxRate.toString()),
    subtotal: Number(subtotal.toFixed(2)),
    tax: Number(taxAmount.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

function validateInvoiceStatusChange(currentStatus, nextStatus, { isCreate = false } = {}) {
  if (nextStatus === undefined) return null;
  const normalizedNext = String(nextStatus);

  if (normalizedNext === INTERNAL_SENDING_STATUS) {
    return "Invalid status";
  }
  if (normalizedNext === "void") {
    return "Use delete to void invoices.";
  }
  if (isCreate) {
    return ["draft", "sent"].includes(normalizedNext)
      ? null
      : "New invoices can only be created as draft or sent.";
  }
  if (normalizedNext === currentStatus) return null;
  if (currentStatus === "draft") {
    return normalizedNext === "sent"
      ? null
      : "Draft invoices must be sent before they can be marked paid or overdue.";
  }
  if (currentStatus === "sent") {
    return ["paid", "overdue"].includes(normalizedNext)
      ? null
      : "Sent invoices can only move to overdue or paid.";
  }
  if (currentStatus === "overdue") {
    return ["sent", "paid"].includes(normalizedNext)
      ? null
      : "Overdue invoices can only move back to sent or forward to paid.";
  }
  if (currentStatus === "paid") {
    return "Paid invoices cannot be changed.";
  }
  if (currentStatus === "void") {
    return "Voided invoices cannot be changed.";
  }
  return "Invalid status transition";
}

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
    const wantsPaginated = String(req.query.paginated || "").toLowerCase() === "true";

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    if (!currentUser?.teamId) {
      if (wantsPaginated) {
        return res.json({
          active: { invoices: [], page: 1, pageSize: 20, total: 0, totalPages: 1 },
          sent: { invoices: [], page: 1, pageSize: 20, total: 0, totalPages: 1 },
          soldByMonth: [],
          summary: {
            draftTotal: 0,
            draftCount: 0,
            outstandingTotal: 0,
            outstandingCount: 0,
            overdueTotal: 0,
            overdueCount: 0,
            issuedMonthTotal: 0,
            issuedMonthCount: 0,
            issuedYearTotal: 0,
            issuedYearCount: 0,
          },
        });
      }
      return res.json([]);
    }

    if (wantsPaginated) {
      const parsePositiveInt = (value, fallback, { min = 1, max = 200 } = {}) => {
        const parsed = Number.parseInt(String(value ?? ""), 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
      };
      const parseInvoiceItems = (value) => {
        try {
          const parsed = JSON.parse(value || "[]");
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };
      const invoiceInclude = {
        lines: {
          include: {
            property: { select: { id: true, name: true } },
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      };
      const mapInvoiceRow = (invoice) => {
        const lines = Array.isArray(invoice?.lines)
          ? invoice.lines.map((line) => ({
              ...line,
              quantity: line.quantity != null ? String(line.quantity) : "0",
              unitPrice: line.unitPrice != null ? String(line.unitPrice) : "0",
              amount: line.amount != null ? String(line.amount) : "0",
            }))
          : [];
        const items =
          lines.length > 0
            ? lines.map((line) => ({
                name: line.description,
                quantity: Number(line.quantity),
                unitPrice: Number(line.unitPrice),
                total: Number(line.amount),
                propertyId: line.propertyId,
                propertyName: line.property?.name,
                replenishmentLineId: line.replenishmentLineId,
              }))
            : parseInvoiceItems(invoice?.items);

        return {
          ...invoice,
          items,
          lines,
          taxRate: invoice?.taxRate != null ? Number(invoice.taxRate) : 0,
          subtotal: invoice?.subtotal != null ? Number(invoice.subtotal) : 0,
          tax: invoice?.tax != null ? Number(invoice.tax) : 0,
          total: invoice?.total != null ? Number(invoice.total) : 0,
          billingPeriodStart: invoice?.billingPeriodStart
            ? new Date(invoice.billingPeriodStart).toISOString()
            : null,
          billingPeriodEnd: invoice?.billingPeriodEnd
            ? new Date(invoice.billingPeriodEnd).toISOString()
            : null,
        };
      };
      const toMoney = (aggregate) => Number(aggregate?._sum?.total ?? 0);
      const toCount = (aggregate) => Number(aggregate?._count?._all ?? 0);
      const buildSlice = async (where, requestedPage, orderBy) => {
        const total = await prisma.invoice.count({ where });
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(requestedPage, totalPages);
        const rows = await prisma.invoice.findMany({
          where,
          include: invoiceInclude,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        });
        return {
          invoices: rows.map(mapInvoiceRow),
          page,
          pageSize,
          total,
          totalPages,
        };
      };

      const pageSize = parsePositiveInt(req.query.pageSize, 20, { min: 1, max: 100 });
      const activePage = parsePositiveInt(req.query.activePage ?? req.query.page, 1, { min: 1, max: 10_000 });
      const sentPage = parsePositiveInt(req.query.sentPage, 1, { min: 1, max: 10_000 });
      const now = new Date();
      const selectedYear = parsePositiveInt(req.query.year, now.getUTCFullYear(), { min: 2000, max: 9999 });
      const selectedMonth = parsePositiveInt(req.query.month, now.getUTCMonth() + 1, { min: 1, max: 12 });
      const issuedStatuses = ["sent", "overdue", "paid"];
      const monthPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-`;
      const yearPrefix = `${selectedYear}-`;

      const [active, sent, soldByMonthRows, draftSummary, outstandingSummary, overdueSummary, issuedMonthSummary, issuedYearSummary] = await Promise.all([
        buildSlice(
          {
            teamId: currentUser.teamId,
            status: { notIn: ["sent", INTERNAL_SENDING_STATUS] },
          },
          activePage,
          [{ createdAt: "desc" }]
        ),
        buildSlice(
          {
            teamId: currentUser.teamId,
            status: "sent",
          },
          sentPage,
          [{ date: "desc" }, { createdAt: "desc" }]
        ),
        prisma.invoice.findMany({
          where: {
            teamId: currentUser.teamId,
            status: { in: issuedStatuses },
            date: { startsWith: monthPrefix },
          },
          include: invoiceInclude,
          orderBy: [{ clientName: "asc" }, { date: "asc" }, { createdAt: "asc" }],
        }),
        prisma.invoice.aggregate({
          where: { teamId: currentUser.teamId, status: "draft" },
          _sum: { total: true },
          _count: { _all: true },
        }),
        prisma.invoice.aggregate({
          where: { teamId: currentUser.teamId, status: { in: ["sent", "overdue"] } },
          _sum: { total: true },
          _count: { _all: true },
        }),
        prisma.invoice.aggregate({
          where: { teamId: currentUser.teamId, status: "overdue" },
          _sum: { total: true },
          _count: { _all: true },
        }),
        prisma.invoice.aggregate({
          where: {
            teamId: currentUser.teamId,
            status: { in: issuedStatuses },
            date: { startsWith: monthPrefix },
          },
          _sum: { total: true },
          _count: { _all: true },
        }),
        prisma.invoice.aggregate({
          where: {
            teamId: currentUser.teamId,
            status: { in: issuedStatuses },
            date: { startsWith: yearPrefix },
          },
          _sum: { total: true },
          _count: { _all: true },
        }),
      ]);

      return res.json({
        active,
        sent,
        soldByMonth: soldByMonthRows.map(mapInvoiceRow),
        summary: {
          draftTotal: toMoney(draftSummary),
          draftCount: toCount(draftSummary),
          outstandingTotal: toMoney(outstandingSummary),
          outstandingCount: toCount(outstandingSummary),
          overdueTotal: toMoney(overdueSummary),
          overdueCount: toCount(overdueSummary),
          issuedMonthTotal: toMoney(issuedMonthSummary),
          issuedMonthCount: toCount(issuedMonthSummary),
          issuedYearTotal: toMoney(issuedYearSummary),
          issuedYearCount: toCount(issuedYearSummary),
        },
      });
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
    const invoice = await invoiceOps.findById(req.params.id, currentUser?.teamId);

    if (!invoice) {
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

    const statusError = validateInvoiceStatusChange("draft", invoiceData.status, { isCreate: true });
    if (statusError) {
      return res.status(400).json({ message: statusError });
    }

    const normalizedInvoice = normalizeManualInvoice(invoiceData);

    const newInvoice = await invoiceOps.create({
      ...normalizedInvoice,
      teamId: currentUser.teamId,
    });
    res.status(201).json(newInvoice);
  } catch (error) {
    if (error?.code === "VALIDATION") {
      return res.status(400).json({ message: error.message });
    }
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
    const existingInvoice = await invoiceOps.findById(req.params.id, currentUser?.teamId);

    if (!existingInvoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const body = req.body || {};
    if (EDIT_LOCKED_STATUSES.has(existingInvoice.status)) {
      return res.status(409).json({
        message:
          existingInvoice.status === "paid"
            ? "Paid invoices cannot be edited."
            : "Voided invoices cannot be edited.",
      });
    }
    const statusError = validateInvoiceStatusChange(existingInvoice.status, body.status);
    if (statusError) {
      return res.status(400).json({ message: statusError });
    }
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

    const updatedInvoice = await invoiceOps.update(
      req.params.id,
      currentUser.teamId,
      normalizeManualInvoice(body, existingInvoice)
    );
    res.json(updatedInvoice);
  } catch (error) {
    if (error?.code === "VALIDATION") {
      return res.status(400).json({ message: error.message });
    }
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
    const invoice = await invoiceOps.findById(req.params.id, currentUser?.teamId);

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (SOFT_DELETE_STATUSES.has(invoice.status)) {
      if (invoice.status === "void") {
        return res.json({ message: "Invoice already voided.", invoice });
      }
      const voided = await invoiceOps.update(req.params.id, currentUser.teamId, { status: "void" });
      return res.json({ message: "Invoice voided successfully", invoice: voided });
    }

    await invoiceOps.delete(req.params.id, currentUser.teamId);
    res.json({ message: "Invoice deleted successfully" });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({ message: "Error deleting invoice" });
  }
});

app.post("/api/invoices/:id/send", authenticateToken, requireWriteAccess, async (req, res) => {
  let originalStatus = null;
  let emailSent = false;
  let currentTeamId = null;
  try {
    const currentUser = await loadCurrentUser(req);
    currentTeamId = currentUser?.teamId ?? null;
    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoice = await invoiceOps.findById(req.params.id, currentTeamId);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    originalStatus = invoice.status;
    if (originalStatus === "sent") {
      return res.json({ message: "Invoice was already sent.", sentTo: null });
    }
    if (originalStatus === INTERNAL_SENDING_STATUS) {
      return res.status(409).json({ message: "Invoice is already being sent." });
    }
    if (SEND_BLOCKED_STATUSES.has(originalStatus)) {
      return res.status(409).json({
        message:
          originalStatus === "paid"
            ? "Paid invoices cannot be sent again."
            : "Voided invoices cannot be sent.",
      });
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

    const claim = await prisma.invoice.updateMany({
      where: {
        id: invoice.id,
        teamId: currentTeamId,
        status: originalStatus,
      },
      data: { status: INTERNAL_SENDING_STATUS },
    });
    if (claim.count === 0) {
      const latest = await invoiceOps.findById(invoice.id, currentTeamId);
      if (latest?.status === "sent") {
        return res.json({ message: "Invoice was already sent.", sentTo: clientEmail });
      }
      if (latest?.status === INTERNAL_SENDING_STATUS) {
        return res.status(409).json({ message: "Invoice is already being sent." });
      }
      return res.status(409).json({ message: "Invoice status changed. Refresh and try again." });
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
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: originalStatus },
      });
      return res.status(500).json({
        message: "Failed to send email. Check server email configuration (Resend or SMTP).",
      });
    }
    emailSent = true;
    // The email has already been delivered at this point. Retry the status commit a few
    // times rather than letting a transient DB error fall into the outer catch, which would
    // otherwise revert the invoice to its original status and allow a duplicate send.
    let committed = false;
    let lastCommitErr = null;
    for (let attempt = 0; attempt < 3 && !committed; attempt += 1) {
      try {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: "sent" },
        });
        committed = true;
      } catch (commitErr) {
        lastCommitErr = commitErr;
      }
    }
    if (!committed) {
      console.error(
        "Error committing 'sent' status after successful email delivery for invoice",
        invoice.id,
        lastCommitErr
      );
      // Leave the invoice in the internal "sending" state rather than reverting to its
      // original status: reverting here would let a retry send a duplicate email even
      // though delivery already succeeded. The stuck "sending" state is surfaced to the
      // caller for manual follow-up instead of silently masking the inconsistency.
      return res.status(500).json({
        message:
          "Invoice email was sent, but we couldn't update its status. Please refresh and verify manually.",
        sentTo: clientEmail,
      });
    }
    res.json({ message: `Invoice sent to ${clientEmail}.`, sentTo: clientEmail });
  } catch (error) {
    try {
      if (!emailSent) {
        const invoice = await invoiceOps.findById(req.params.id, currentTeamId);
        if (invoice?.status === INTERNAL_SENDING_STATUS) {
          await prisma.invoice.update({
            where: { id: req.params.id },
            data: { status: originalStatus || "draft" },
          });
        }
      }
    } catch {}
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
    const invoice = await invoiceOps.findById(req.params.id, currentUser?.teamId);
    if (!invoice) {
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
