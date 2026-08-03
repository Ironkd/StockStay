/**
 * Scheduled client billing engine (Appendix A #7).
 * Period math in Team.billingTimezone; drafts from unbilled ReplenishmentLines.
 */

import { DateTime } from "luxon";
import { prisma } from "./db.js";
import { moneyStr, qtyStr, Decimal } from "./decimalUtil.js";

const MONEY_DP = 4;

export class ClientBillingError extends Error {
  constructor(message, code = "BILLING_ERROR", details = {}) {
    super(message);
    this.name = "ClientBillingError";
    this.code = code;
    this.details = details;
  }
}

function resolveTimezone(tz) {
  const zone = tz && String(tz).trim() ? String(tz).trim() : "America/Toronto";
  const probe = DateTime.now().setZone(zone);
  if (!probe.isValid) {
    throw new ClientBillingError(`Invalid billing timezone: ${zone}`, "INVALID_TIMEZONE");
  }
  return zone;
}

/** Monday 00:00 of the ISO week containing `dt` in zone. */
function startOfIsoWeek(dt) {
  // Luxon: weekday 1 = Monday … 7 = Sunday
  return dt.startOf("day").minus({ days: dt.weekday - 1 });
}

/**
 * Biweekly anchor: Monday of the ISO week containing team.createdAt.
 */
function biweeklyAnchorMonday(teamCreatedAt, zone) {
  const created = DateTime.fromJSDate(new Date(teamCreatedAt), { zone: "utc" }).setZone(zone);
  return startOfIsoWeek(created);
}

/**
 * Return the closed period containing `instant` for the frequency, or null if none.
 * Period is [start, end) as UTC JS Dates.
 */
export function periodContaining(instant, frequency, { zone, teamCreatedAt }) {
  const tz = resolveTimezone(zone);
  const at = DateTime.fromJSDate(new Date(instant), { zone: "utc" }).setZone(tz);

  if (frequency === "weekly") {
    const start = startOfIsoWeek(at);
    const end = start.plus({ weeks: 1 });
    return { start: start.toUTC().toJSDate(), end: end.toUTC().toJSDate() };
  }

  if (frequency === "monthly_eom") {
    const start = at.startOf("month");
    const end = start.plus({ months: 1 });
    return { start: start.toUTC().toJSDate(), end: end.toUTC().toJSDate() };
  }

  if (frequency === "biweekly") {
    const anchor = biweeklyAnchorMonday(teamCreatedAt, tz);
    const weekStart = startOfIsoWeek(at);
    const days = Math.floor(weekStart.diff(anchor, "days").days);
    const periodIndex = Math.floor(days / 14);
    const start = anchor.plus({ days: periodIndex * 14 });
    const end = start.plus({ days: 14 });
    return { start: start.toUTC().toJSDate(), end: end.toUTC().toJSDate() };
  }

  throw new ClientBillingError(`Unknown billing frequency: ${frequency}`, "VALIDATION");
}

/**
 * List closed periods (end <= asOf) that may need invoicing, walking back from asOf.
 * Caps lookback to avoid infinite history (maxPeriods).
 */
export function listClosedPeriods(frequency, { zone, teamCreatedAt, asOf = new Date(), maxPeriods = 24 }) {
  const tz = resolveTimezone(zone);
  const now = DateTime.fromJSDate(new Date(asOf), { zone: "utc" }).setZone(tz);
  const periods = [];
  let cursor = now;

  for (let i = 0; i < maxPeriods + 4; i++) {
    const period = periodContaining(cursor.toUTC().toJSDate(), frequency, {
      zone: tz,
      teamCreatedAt,
    });
    if (period.end.getTime() <= now.toUTC().toJSDate().getTime()) {
      periods.push(period);
    }
    // Step into previous period
    cursor = DateTime.fromJSDate(period.start, { zone: "utc" }).setZone(tz).minus({ seconds: 1 });
    if (periods.length >= maxPeriods) break;
    // Stop if before team creation
    if (teamCreatedAt && period.end.getTime() < new Date(teamCreatedAt).getTime()) break;
  }

  // Oldest first
  periods.reverse();
  return periods;
}

function mapInvoiceLine(line) {
  if (!line) return null;
  return {
    ...line,
    quantity: qtyStr(line.quantity),
    unitPrice: qtyStr(line.unitPrice),
    amount: moneyStr(line.amount),
    property: line.property
      ? { id: line.property.id, name: line.property.name }
      : undefined,
  };
}

function mapInvoice(inv) {
  if (!inv) return null;
  const legacyItems =
    typeof inv.items === "string"
      ? (() => {
          try {
            return JSON.parse(inv.items || "[]");
          } catch {
            return [];
          }
        })()
      : Array.isArray(inv.items)
        ? inv.items
        : [];

  const lines = Array.isArray(inv.lines) ? inv.lines.map(mapInvoiceLine) : [];
  // Prefer InvoiceLine rows; fall back to legacy JSON items shaped for UI/email
  const items =
    lines.length > 0
      ? lines.map((l) => ({
          name: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          total: Number(l.amount),
          propertyId: l.propertyId,
          propertyName: l.property?.name,
          replenishmentLineId: l.replenishmentLineId,
        }))
      : legacyItems;

  return {
    ...inv,
    items,
    lines,
    taxRate: inv.taxRate != null ? Number(inv.taxRate) : 0,
    billingPeriodStart: inv.billingPeriodStart
      ? new Date(inv.billingPeriodStart).toISOString()
      : null,
    billingPeriodEnd: inv.billingPeriodEnd
      ? new Date(inv.billingPeriodEnd).toISOString()
      : null,
  };
}

const invoiceInclude = {
  lines: {
    include: {
      property: { select: { id: true, name: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  },
};

async function nextInvoiceNumber(teamId, tx = prisma) {
  const count = await tx.invoice.count({ where: { teamId } });
  const year = new Date().getFullYear();
  return `INV-${year}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Unbilled billable lines for a client whose replenishment falls in [start, end).
 */
async function loadUnbilledLinesForPeriod(teamId, clientId, periodStart, periodEnd) {
  return prisma.replenishmentLine.findMany({
    where: {
      invoiced: false,
      billable: true,
      replenishment: {
        teamId,
        createdAt: { gte: periodStart, lt: periodEnd },
        property: { clientId },
      },
    },
    include: {
      sku: { select: { id: true, name: true } },
      supplyItem: { select: { id: true, name: true } },
      replenishment: {
        select: {
          id: true,
          direction: true,
          createdAt: true,
          propertyId: true,
          property: { select: { id: true, name: true, clientId: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function invoiceExistsForPeriod(teamId, clientId, periodStart, periodEnd) {
  const existing = await prisma.invoice.findFirst({
    where: {
      teamId,
      clientId,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
    },
  });
  return Boolean(existing);
}

function buildLineDescription(rl) {
  const itemName = rl.supplyItem?.name || rl.sku?.name || "Supply";
  const skuName = rl.sku?.name && rl.sku.name !== itemName ? ` (${rl.sku.name})` : "";
  const dir = rl.replenishment?.direction === "return" ? "Return credit" : "Replenishment";
  return `${dir}: ${itemName}${skuName}`;
}

/**
 * Generate draft invoices for a team (all due closed periods with unbilled lines).
 */
export async function generateDraftInvoicesForTeam(teamId, { clientId = null, asOf = new Date() } = {}) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    throw new ClientBillingError("Team not found", "NOT_FOUND");
  }
  const zone = resolveTimezone(team.billingTimezone);

  const clients = await prisma.client.findMany({
    where: {
      teamId,
      ...(clientId ? { id: clientId } : {}),
    },
  });

  const created = [];
  const skipped = [];

  for (const client of clients) {
    const frequency = client.billingFrequency || "monthly_eom";
    const periods = listClosedPeriods(frequency, {
      zone,
      teamCreatedAt: team.createdAt,
      asOf,
      maxPeriods: 12,
    });

    for (const period of periods) {
      if (await invoiceExistsForPeriod(teamId, client.id, period.start, period.end)) {
        skipped.push({
          clientId: client.id,
          reason: "invoice_exists",
          periodStart: period.start.toISOString(),
          periodEnd: period.end.toISOString(),
        });
        continue;
      }

      const unbilled = await loadUnbilledLinesForPeriod(
        teamId,
        client.id,
        period.start,
        period.end
      );
      if (unbilled.length === 0) continue;

      const invoice = await prisma.$transaction(async (tx) => {
        // Re-check inside tx
        const exists = await tx.invoice.findFirst({
          where: {
            teamId,
            clientId: client.id,
            billingPeriodStart: period.start,
            billingPeriodEnd: period.end,
          },
        });
        if (exists) return null;

        let subtotal = new Decimal(0);
        const lineData = [];
        let sortOrder = 0;
        for (const rl of unbilled) {
          const amount = new Decimal(rl.billBackAmount);
          subtotal = subtotal.add(amount);
          const qty = new Decimal(rl.baseQtyDeployed).abs();
          const unitPrice =
            qty.gt(0) ? amount.div(qty).toDecimalPlaces(6, Decimal.ROUND_HALF_UP) : new Decimal(0);
          lineData.push({
            propertyId: rl.replenishment.propertyId,
            replenishmentLineId: rl.id,
            description: buildLineDescription(rl),
            quantity: qty,
            unitPrice,
            amount,
            sortOrder: sortOrder++,
          });
        }

        const taxRate = new Decimal(0);
        const taxAmount = subtotal
          .mul(taxRate)
          .div(100)
          .toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP);
        const total = subtotal.add(taxAmount).toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP);

        const issueDate = DateTime.fromJSDate(period.end, { zone: "utc" })
          .setZone(zone)
          .toISODate();
        const dueDate = DateTime.fromJSDate(period.end, { zone: "utc" })
          .setZone(zone)
          .plus({ days: 14 })
          .toISODate();

        const invoiceNumber = await nextInvoiceNumber(teamId, tx);

        const inv = await tx.invoice.create({
          data: {
            teamId,
            invoiceNumber,
            clientId: client.id,
            clientName: client.name,
            date: issueDate,
            dueDate,
            items: "[]",
            billingPeriodStart: period.start,
            billingPeriodEnd: period.end,
            taxRate,
            subtotal: Number(subtotal.toFixed(MONEY_DP)),
            tax: Number(taxAmount.toFixed(MONEY_DP)),
            total: Number(total.toFixed(MONEY_DP)),
            status: "draft",
            notes: "",
            lines: {
              create: lineData.map((l) => ({
                propertyId: l.propertyId,
                replenishmentLineId: l.replenishmentLineId,
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                amount: l.amount,
                sortOrder: l.sortOrder,
              })),
            },
          },
          include: invoiceInclude,
        });

        await tx.replenishmentLine.updateMany({
          where: { id: { in: unbilled.map((l) => l.id) } },
          data: { invoiced: true },
        });

        return inv;
      });

      if (invoice) {
        created.push(mapInvoice(invoice));
      }
    }
  }

  return { created, skipped, count: created.length };
}

export async function generateDraftInvoicesForAllTeams(asOf = new Date()) {
  const teams = await prisma.team.findMany({ select: { id: true } });
  let total = 0;
  for (const t of teams) {
    try {
      const result = await generateDraftInvoicesForTeam(t.id, { asOf });
      total += result.count;
    } catch (err) {
      console.error(`[clientBilling] generate failed for team ${t.id}:`, err?.message || err);
    }
  }
  return { teams: teams.length, invoicesCreated: total };
}

export async function getInvoiceWithLines(teamId, id) {
  const inv = await prisma.invoice.findFirst({
    where: { id, teamId },
    include: invoiceInclude,
  });
  return mapInvoice(inv);
}

export async function listInvoicesWithLines(teamId) {
  const rows = await prisma.invoice.findMany({
    where: { teamId },
    include: invoiceInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapInvoice);
}

/**
 * Recalculate totals after tax rate / line edits on a draft.
 */
export async function updateDraftInvoice(teamId, id, { taxRate, notes, status, dueDate, date }) {
  const existing = await prisma.invoice.findFirst({
    where: { id, teamId },
    include: { lines: true },
  });
  if (!existing) {
    throw new ClientBillingError("Invoice not found", "NOT_FOUND");
  }

  const data = {};
  if (notes !== undefined) data.notes = notes == null ? "" : String(notes);
  if (dueDate !== undefined) data.dueDate = dueDate;
  if (date !== undefined) data.date = date;
  if (status !== undefined) {
    if (!["draft", "sent", "paid", "overdue"].includes(status)) {
      throw new ClientBillingError("Invalid status", "VALIDATION");
    }
    data.status = status;
  }

  if (taxRate !== undefined) {
    if (existing.status !== "draft" && existing.lines.length > 0) {
      // Allow tax edit only on drafts for scheduled invoices
      throw new ClientBillingError("Only draft invoices can change tax rate", "VALIDATION");
    }
    const rate = new Decimal(taxRate);
    if (rate.lt(0)) {
      throw new ClientBillingError("taxRate cannot be negative", "VALIDATION");
    }
    let subtotal = new Decimal(0);
    if (existing.lines.length > 0) {
      for (const line of existing.lines) {
        subtotal = subtotal.add(new Decimal(line.amount));
      }
    } else {
      subtotal = new Decimal(existing.subtotal || 0);
    }
    const taxAmount = subtotal
      .mul(rate)
      .div(100)
      .toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP);
    const total = subtotal.add(taxAmount).toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP);
    data.taxRate = rate;
    data.subtotal = Number(subtotal.toFixed(MONEY_DP));
    data.tax = Number(taxAmount.toFixed(MONEY_DP));
    data.total = Number(total.toFixed(MONEY_DP));
  }

  const updated = await prisma.invoice.update({
    where: { id },
    data,
    include: invoiceInclude,
  });
  return mapInvoice(updated);
}

export function invoiceLinesToCsvRows(invoice) {
  const periodStart = invoice.billingPeriodStart || "";
  const periodEnd = invoice.billingPeriodEnd || "";
  const rows = [];
  const lines =
    Array.isArray(invoice.lines) && invoice.lines.length > 0
      ? invoice.lines
      : (invoice.items || []).map((i) => ({
          description: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          amount: i.total,
          property: i.propertyName ? { name: i.propertyName } : null,
        }));

  for (const line of lines) {
    rows.push({
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      status: invoice.status,
      date: invoice.date,
      dueDate: invoice.dueDate || "",
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      property: line.property?.name || "",
      description: line.description || line.name || "",
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount ?? line.total,
      tax: invoice.tax,
      total: invoice.total,
    });
  }
  if (rows.length === 0) {
    rows.push({
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      status: invoice.status,
      date: invoice.date,
      dueDate: invoice.dueDate || "",
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      property: "",
      description: "",
      quantity: "",
      unitPrice: "",
      amount: "",
      tax: invoice.tax,
      total: invoice.total,
    });
  }
  return rows;
}

export function buildInvoicesCsv(invoices) {
  const header = [
    "invoiceNumber",
    "clientName",
    "status",
    "date",
    "dueDate",
    "billingPeriodStart",
    "billingPeriodEnd",
    "property",
    "description",
    "quantity",
    "unitPrice",
    "amount",
    "tax",
    "total",
  ];
  const escape = (v) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(",")];
  for (const inv of invoices) {
    for (const row of invoiceLinesToCsvRows(inv)) {
      lines.push(header.map((h) => escape(row[h])).join(","));
    }
  }
  return lines.join("\n");
}
