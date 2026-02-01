/**
 * Email sending for verification and password reset.
 * Uses Resend (RESEND_API_KEY) if set, else nodemailer/SMTP, else logs link to console.
 */

import nodemailer from "nodemailer";

const APP_URL = process.env.APP_URL || "http://localhost:5173";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Stock Stay <onboarding@resend.dev>";
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@stockstay.com";

function getTransporter() {
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return null;
}

/**
 * Send verification email to the user with a link to verify their email.
 * Uses Resend if RESEND_API_KEY is set, else SMTP, else logs to console.
 * @param {string} to - Recipient email
 * @param {string} token - Verification token
 * @param {string} name - User's name (for greeting)
 * @returns {Promise<boolean>} - true if sent (or logged in dev), false on error
 */
export async function sendVerificationEmail(to, token, name = "there") {
  const verificationLink = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const subject = "Verify your StockStay email address";
  const text = `Hi ${name},\n\nPlease verify your email address by clicking this link:\n\n${verificationLink}\n\nThis link expires in 24 hours.\n\nIf you didn't create an account with StockStay, you can ignore this email.\n\n— StockStay`;
  const html = `
    <p>Hi ${name},</p>
    <p>Please verify your email address by clicking the link below:</p>
    <p><a href="${verificationLink}">Verify my email</a></p>
    <p>This link expires in 24 hours.</p>
    <p>If you didn't create an account with StockStay, you can ignore this email.</p>
    <p>— StockStay</p>
  `;

  // Resend (same as password reset)
  if (RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: [to],
        subject,
        html,
        text,
      });
      if (error) {
        console.error("[EMAIL] Resend verification error:", error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[EMAIL] Resend verification error:", err?.message || err);
      return false;
    }
  }

  // SMTP (nodemailer)
  const transporter = getTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to,
        subject,
        text,
        html,
      });
      return true;
    } catch (err) {
      console.error("Failed to send verification email:", err);
      return false;
    }
  }

  // Dev fallback: log the link
  console.log("[EMAIL] Verification email (no Resend/SMTP configured):");
  console.log("  To:", to);
  console.log("  Link:", verificationLink);
  return true;
}

/**
 * Build HTML body for an invoice email (same layout as preview).
 * @param {object} invoice - { invoiceNumber, clientName, date, dueDate, items[], subtotal, tax, total, notes }
 * @returns {string} HTML string
 */
function buildInvoiceEmailHtml(invoice) {
  const items = invoice.items || [];
  const itemsRows = items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td>${Number(item.quantity)}</td><td>$${Number(item.unitPrice).toFixed(2)}</td><td>$${Number(item.total).toFixed(2)}</td></tr>`
    )
    .join("");
  const subtotal = Number(invoice.subtotal) ?? 0;
  const tax = Number(invoice.tax) ?? 0;
  const total = Number(invoice.total) ?? 0;
  const dateStr = invoice.date ? new Date(invoice.date).toLocaleDateString() : "";
  const dueStr = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "";
  const notes = invoice.notes ? `<p style="margin-top:16px;color:#64748b;">${escapeHtml(invoice.notes)}</p>` : "";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b;">
  <h1 style="font-size:1.5rem;margin-bottom:8px;">Invoice ${escapeHtml(invoice.invoiceNumber)}</h1>
  <p style="margin:0 0 16px;color:#64748b;">${escapeHtml(invoice.clientName)}</p>
  <p style="margin:0 0 4px;"><strong>Date:</strong> ${dateStr}</p>
  <p style="margin:0 0 24px;"><strong>Due date:</strong> ${dueStr}</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <thead><tr style="border-bottom:2px solid #e2e8f0;"><th style="text-align:left;padding:8px;">Item</th><th style="text-align:right;padding:8px;">Qty</th><th style="text-align:right;padding:8px;">Price</th><th style="text-align:right;padding:8px;">Total</th></tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>
  <p style="margin:0 0 4px;text-align:right;"><strong>Subtotal:</strong> $${subtotal.toFixed(2)}</p>
  <p style="margin:0 0 4px;text-align:right;"><strong>Tax:</strong> $${tax.toFixed(2)}</p>
  <p style="margin:0 0 0;text-align:right;font-size:1.125rem;"><strong>Total:</strong> $${total.toFixed(2)}</p>
  ${notes}
  <p style="margin-top:24px;color:#64748b;font-size:0.875rem;">— Stock Stay</p>
</body>
</html>`;
}

function escapeHtml(str) {
  if (str == null) return "";
  const s = String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send invoice email to the client.
 * @param {string} to - Client email
 * @param {string} clientName - Client name
 * @param {object} invoice - Invoice object (invoiceNumber, clientName, date, dueDate, items, subtotal, tax, total, notes)
 * @returns {Promise<boolean>} - true if sent, false on error
 */
export async function sendInvoiceEmail(to, clientName, invoice) {
  if (!to || !String(to).trim()) return false;
  const subject = `Invoice ${invoice.invoiceNumber} from Stock Stay`;
  const html = buildInvoiceEmailHtml(invoice);
  const text = `Invoice ${invoice.invoiceNumber}\n\n${clientName}\nDate: ${invoice.date}\nDue: ${invoice.dueDate}\n\nItems: ${(invoice.items || []).map((i) => `${i.name} x${i.quantity} = $${i.total}`).join("\n")}\n\nSubtotal: $${(invoice.subtotal ?? 0).toFixed(2)}\nTax: $${(invoice.tax ?? 0).toFixed(2)}\nTotal: $${(invoice.total ?? 0).toFixed(2)}\n\n— Stock Stay`;

  if (RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: [to.trim()],
        subject,
        html,
        text,
      });
      if (error) {
        console.error("[EMAIL] Resend invoice error:", error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[EMAIL] Resend invoice error:", err?.message || err);
      return false;
    }
  }

  const transporter = getTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to: to.trim(),
        subject,
        text,
        html,
      });
      return true;
    } catch (err) {
      console.error("[EMAIL] Failed to send invoice email:", err);
      return false;
    }
  }

  console.log("[EMAIL] Invoice email (no Resend/SMTP configured):");
  console.log("  To:", to);
  console.log("  Subject:", subject);
  return true;
}
