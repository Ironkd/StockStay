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
 * Parse team invoice style (JSON string or object).
 * @param {object|null} team - Team with optional invoiceStyle (string) and invoiceLogoUrl
 * @returns {{ companyName?: string, companyAddress?: string, companyPhone?: string, companyEmail?: string, primaryColor?: string, accentColor?: string, footerText?: string, logoUrl?: string }}
 */
function getInvoiceBranding(team) {
  if (!team) return {};
  let style = {};
  if (team.invoiceStyle) {
    try {
      style = typeof team.invoiceStyle === "string" ? JSON.parse(team.invoiceStyle) : team.invoiceStyle;
    } catch (_) {}
  }
  return {
    companyName: style.companyName || team.name || "Stock Stay",
    companyAddress: style.companyAddress != null ? String(style.companyAddress).trim() : "",
    companyPhone: style.companyPhone != null ? String(style.companyPhone).trim() : "",
    companyEmail: style.companyEmail != null ? String(style.companyEmail).trim() : "",
    primaryColor: style.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(style.primaryColor) ? style.primaryColor : "#2563eb",
    accentColor: style.accentColor && /^#[0-9A-Fa-f]{6}$/.test(style.accentColor) ? style.accentColor : "#1e40af",
    footerText: style.footerText != null ? String(style.footerText) : "— Stock Stay",
    logoUrl: team.invoiceLogoUrl && String(team.invoiceLogoUrl).trim() ? String(team.invoiceLogoUrl).trim() : null,
  };
}

/**
 * Build HTML body for an invoice email (professional layout with optional logo and branding).
 * @param {object} invoice - { invoiceNumber, clientName, date, dueDate, items[], subtotal, tax, total, notes }
 * @param {object|null} team - Team with optional invoiceLogoUrl and invoiceStyle (JSON)
 * @returns {string} HTML string
 */
function buildInvoiceEmailHtml(invoice, team = null) {
  const branding = getInvoiceBranding(team);
  const items = invoice.items || [];
  const itemsRows = items
    .map(
      (item) =>
        `<tr><td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.name)}</td><td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${Number(item.quantity)}</td><td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">$${Number(item.unitPrice).toFixed(2)}</td><td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">$${Number(item.total).toFixed(2)}</td></tr>`
    )
    .join("");
  const subtotal = Number(invoice.subtotal) ?? 0;
  const tax = Number(invoice.tax) ?? 0;
  const total = Number(invoice.total) ?? 0;
  const dateStr = invoice.date ? new Date(invoice.date).toLocaleDateString() : "";
  const dueStr = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "";
  const notes = invoice.notes ? `<p style="margin-top:20px;color:#64748b;font-size:14px;">${escapeHtml(invoice.notes)}</p>` : "";
  const logoBlock = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.companyName)}" style="max-height:48px;max-width:200px;display:block;margin-bottom:20px;" />`
    : "";
  const addressLines = branding.companyAddress ? branding.companyAddress.split(/\n/).filter((l) => l.trim()).map((l) => escapeHtml(l.trim())) : [];
  const fromBlockLines = [
    escapeHtml(branding.companyName),
    ...addressLines,
    ...(branding.companyPhone ? [`Tel: ${escapeHtml(branding.companyPhone)}`] : []),
    ...(branding.companyEmail ? [`${escapeHtml(branding.companyEmail)}`] : []),
  ].filter(Boolean);
  const fromBlock = fromBlockLines.length
    ? `<div style="margin-bottom:20px;"><p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#334155;">From</p><p style="margin:0;font-size:14px;color:#475569;line-height:1.5;">${fromBlockLines.join("<br/>")}</p></div>`
    : "";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${escapeHtml(invoice.invoiceNumber)} from ${escapeHtml(branding.companyName)}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;background:#f1f5f9;padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
    <div style="padding:32px 28px;border-bottom:1px solid #e2e8f0;">
      ${logoBlock}
      ${fromBlock}
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;">Bill to</p>
      <p style="margin:0 0 16px;font-size:15px;color:#334155;">${escapeHtml(invoice.clientName)}</p>
      <h2 style="margin:0 0 8px;font-size:1.75rem;font-weight:700;color:${branding.primaryColor};">Invoice ${escapeHtml(invoice.invoiceNumber)}</h2>
      <p style="margin:0;font-size:13px;color:#64748b;">Date: ${dateStr} &nbsp;·&nbsp; Due: ${dueStr}</p>
    </div>
    <div style="padding:28px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead><tr style="background:${branding.primaryColor};color:#fff;"><th style="text-align:left;padding:12px 10px;font-size:12px;font-weight:600;letter-spacing:0.02em;">Item</th><th style="text-align:right;padding:12px 10px;font-size:12px;font-weight:600;">Qty</th><th style="text-align:right;padding:12px 10px;font-size:12px;font-weight:600;">Price</th><th style="text-align:right;padding:12px 10px;font-size:12px;font-weight:600;">Total</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
      <div style="text-align:right;padding-top:16px;border-top:2px solid #e2e8f0;">
        <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Subtotal:</strong> $${subtotal.toFixed(2)}</p>
        <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Tax:</strong> $${tax.toFixed(2)}</p>
        <p style="margin:16px 0 0;font-size:1.25rem;font-weight:700;color:${branding.accentColor};">Total: $${total.toFixed(2)}</p>
      </div>
      ${notes}
    </div>
    <div style="padding:20px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:13px;color:#64748b;">${escapeHtml(branding.footerText)}</p>
    </div>
  </div>
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
 * @param {object|null} team - Team with optional invoiceLogoUrl and invoiceStyle (for branding)
 * @returns {Promise<boolean>} - true if sent, false on error
 */
export async function sendInvoiceEmail(to, clientName, invoice, team = null) {
  if (!to || !String(to).trim()) return false;
  const branding = getInvoiceBranding(team);
  const subject = `Invoice ${invoice.invoiceNumber} from ${branding.companyName}`;
  const html = buildInvoiceEmailHtml(invoice, team);
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

const SUPPORT_EMAIL = "support@stockstay.com";

/**
 * Send support/contact form submission to support@stockstay.com.
 * @param {string} fromEmail - Sender email
 * @param {string} fromName - Sender name
 * @param {string} message - Message body
 * @returns {Promise<boolean>} - true if sent (or logged), false on error
 */
export async function sendSupportEmail(fromEmail, fromName, message) {
  const subject = `Support: ${(fromName || "Someone").toString().slice(0, 50)}`;
  const text = `From: ${fromName || "—"}\nEmail: ${fromEmail || "—"}\n\n${message || ""}`;
  const html = `<p><strong>From:</strong> ${escapeHtml(fromName || "—")}<br/><strong>Email:</strong> ${escapeHtml(fromEmail || "—")}</p><p>${escapeHtml((message || "").replace(/\n/g, "<br/>"))}</p>`;

  if (RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: [SUPPORT_EMAIL],
        replyTo: fromEmail && String(fromEmail).trim() ? fromEmail.trim() : undefined,
        subject,
        html,
        text,
      });
      if (error) {
        console.error("[EMAIL] Resend support email error:", error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[EMAIL] Resend support email error:", err?.message || err);
      return false;
    }
  }

  const transporter = getTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to: SUPPORT_EMAIL,
        replyTo: fromEmail && String(fromEmail).trim() ? fromEmail.trim() : undefined,
        subject,
        text,
        html,
      });
      return true;
    } catch (err) {
      console.error("[EMAIL] Failed to send support email:", err);
      return false;
    }
  }

  console.log("[EMAIL] Support email (no Resend/SMTP configured):");
  console.log("  To:", SUPPORT_EMAIL);
  console.log("  From:", fromName, fromEmail);
  console.log("  Message:", message?.slice(0, 200));
  return true;
}

/**
 * Send team invitation email with link to join.
 * @param {string} to - Invitee email
 * @param {string} token - Invitation token
 * @param {string} teamName - Team name
 * @param {string} inviterName - Name of person who sent the invite
 * @returns {Promise<boolean>} - true if sent (or logged in dev), false on error
 */
export async function sendInvitationEmail(to, token, teamName = "the team", inviterName = "A team owner") {
  const acceptPath = `/accept-invite?token=${encodeURIComponent(token)}`;
  const inviteLink = `${APP_URL}/login?mode=signup&redirect=${encodeURIComponent(acceptPath)}&invite=${encodeURIComponent(token)}`;
  const subject = `You're invited to join ${teamName} on Stock Stay`;
  const text = `Hi,\n\n${inviterName} invited you to join ${teamName} on Stock Stay.\n\nSign up to join by clicking this link:\n\n${inviteLink}\n\nThis link expires in 14 days.\n\n— Stock Stay`;
  const html = `
    <p>Hi,</p>
    <p><strong>${escapeHtml(inviterName)}</strong> invited you to join <strong>${escapeHtml(teamName)}</strong> on Stock Stay.</p>
    <p><a href="${inviteLink}">Sign up to join</a></p>
    <p>Create an account to accept the invitation. This link expires in 14 days.</p>
    <p>— Stock Stay</p>
  `;

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
        console.error("[EMAIL] Resend invitation error:", error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[EMAIL] Resend invitation error:", err?.message || err);
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
      console.error("[EMAIL] Failed to send invitation email:", err);
      return false;
    }
  }

  console.log("[EMAIL] Invitation email (no Resend/SMTP configured):");
  console.log("  To:", to);
  console.log("  Link:", inviteLink);
  return true;
}
