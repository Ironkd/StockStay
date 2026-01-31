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
