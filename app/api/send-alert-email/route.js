// @ts-nocheck
/**
 * POST /api/send-alert-email
 *
 * Serverless API route for sending incubator alert emails via Gmail SMTP.
 * Accepts: { to, subject, alertType, deviceId, sensorData }
 * Returns: { success: true } or { error: "..." }
 */

import nodemailer from "nodemailer";
import { buildAlertEmailHtml } from "@/lib/emailTemplate";

// ── Gmail SMTP transporter ──────────────────────────────────────────────────
// Credentials come from environment variables only — never hard-coded.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,       // e.g. yourapp@gmail.com
    pass: process.env.GMAIL_APP_PASSWORD, // Gmail App Password (16-char)
  },
});

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      to,           // recipient email address
      subject,      // email subject line
      alertType,    // "sensor" | "water" | "offline"
      deviceId,     // device identifier string
      sensorData,   // object with current readings (optional)
      message,      // plain-text fallback message (optional)
    } = body;

    // ── Basic input validation ────────────────────────────────────────────
    if (!to || !subject || !alertType) {
      return Response.json(
        { error: "Missing required fields: to, subject, alertType" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return Response.json({ error: "Invalid recipient email address" }, { status: 400 });
    }

    // ── Build rich HTML email body ────────────────────────────────────────
    const htmlBody = buildAlertEmailHtml({ alertType, deviceId, sensorData, message });

    // ── Send email ───────────────────────────────────────────────────────
    await transporter.sendMail({
      from: `"Egg Incubator Alerts" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text: message || subject, // plain-text fallback for email clients that don't render HTML
      html: htmlBody,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("[send-alert-email] Failed to send email:", error.message);

    // Return a safe error message — don't leak internal details to the client
    return Response.json(
      { error: "Failed to send alert email. Please try again later." },
      { status: 500 }
    );
  }
}
