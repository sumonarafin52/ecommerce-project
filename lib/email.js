// lib/email.js
import nodemailer from "nodemailer";
import Settings from "@/models/Settings";
import { decryptSecret } from "@/lib/crypto";

// Settings → (future) Email section takes priority once configured; env
// vars are the fallback so a deployment that sets SMTP_* directly still
// works without ever touching the admin UI.
export async function getEmailConfig() {
  try {
    const settings = await Settings.findOne().lean();
    const stored = settings?.email;
    if (stored?.enabled && stored?.smtpHost && stored?.smtpUser) {
      return {
        enabled: true,
        fromName: stored.fromName || "Store",
        fromEmail: stored.fromEmail || stored.smtpUser,
        host: stored.smtpHost,
        port: stored.smtpPort || 587,
        secure: !!stored.smtpSecure,
        user: stored.smtpUser,
        pass: decryptSecret(stored.smtpPassword),
      };
    }
  } catch {
    // fall through to env vars below
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return {
      enabled: true,
      fromName: process.env.SMTP_FROM_NAME || "Store",
      fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    };
  }

  return { enabled: false };
}

let cachedTransporter = null;
let cachedConfigKey = "";

async function getTransporter(config) {
  const key = `${config.host}:${config.port}:${config.user}`;
  if (cachedTransporter && cachedConfigKey === key) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  cachedConfigKey = key;
  return cachedTransporter;
}

/**
 * Sends a transactional email. Never throws — returns { sent: boolean,
 * reason? } so callers (typically lib/notify.js, fire-and-forget) can log
 * without any risk of this breaking the order/payment operation around it.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!to) return { sent: false, reason: "no recipient" };

  const config = await getEmailConfig();
  if (!config.enabled) return { sent: false, reason: "email not configured" };

  try {
    const transporter = await getTransporter(config);
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject,
      html,
      text: text || html?.replace(/<[^>]+>/g, " "),
    });
    return { sent: true };
  } catch (err) {
    console.error("[email] send failed:", err.message);
    return { sent: false, reason: err.message };
  }
}
