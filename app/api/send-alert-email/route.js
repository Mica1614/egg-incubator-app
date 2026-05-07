// @ts-nocheck
/**
 * POST /api/send-alert-email
 *
 * Serverless API route for sending incubator alert emails via Gmail SMTP.
 * Accepts: { to, subject, alertType, deviceId, sensorData }
 * Returns: { success: true } or { error: "..." }
 *
 * Enhanced error handling for Gmail SMTP failures with detailed diagnostics.
 */

import nodemailer from "nodemailer";
import { buildAlertEmailHtml } from "@/lib/emailTemplate";

// ── Gmail SMTP transporter ──────────────────────────────────────────────────
// Use explicit host/port instead of service:'gmail' — more reliable with App Passwords.
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // SSL
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// ── Verification cache ───────────────────────────────────────────────────────
// transporter.verify() opens a full SMTP AUTH handshake. Calling it on every
// request hammers Gmail and triggers "454 4.7.0 Too many login attempts".
// Cache the result for VERIFY_TTL_MS so we only re-check occasionally.
const VERIFY_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _verifyOk = false;
let _verifyCheckedAt = 0;

async function ensureTransporterReady() {
  if (_verifyOk && Date.now() - _verifyCheckedAt < VERIFY_TTL_MS) return; // cache hit
  await transporter.verify(); // throws on failure
  _verifyOk = true;
  _verifyCheckedAt = Date.now();
}

/**
 * Categorize Gmail/SMTP errors for better debugging.
 * Order matters — more specific checks first.
 */
function categorizeEmailError(error) {
  const msg       = error.message  || "";
  const code      = error.code     || "";
  const response  = error.response || "";
  const resCode   = error.responseCode || 0;

  // 454 4.7.0 — Too many login attempts (auth throttle / temp lockout)
  if (resCode === 454 || response.includes("Too many login attempts") || response.includes("4.7.0")) {
    return {
      category: "AUTH_THROTTLE",
      detail: "Gmail temporarily blocked login attempts due to too many requests. Wait a few minutes before retrying.",
    };
  }
  // 535 / EAUTH — bad credentials
  if (
    code === "EAUTH" ||
    resCode === 535 ||
    msg.includes("Username and Password not accepted") ||
    msg.includes("Invalid login")
  ) {
    return { category: "AUTH", detail: "Gmail authentication failed. Check GMAIL_USER and GMAIL_APP_PASSWORD." };
  }
  // 550 5.4.5 — daily sending limit exceeded
  if (
    (code === "EENVELOPE" && (resCode === 550 || response.includes("5.4.5"))) ||
    response.includes("Daily user sending limit exceeded") ||
    msg.includes("Daily user sending limit exceeded")
  ) {
    return { category: "DAILY_LIMIT", detail: "Gmail daily sending limit exceeded. No more alert emails can be sent today." };
  }
  // 421 / general rate limit
  if (response.includes("rate limit") || msg.includes("rate limit") || resCode === 421) {
    return { category: "RATE_LIMIT", detail: "Gmail rate limit exceeded. Try again later." };
  }
  if (code === "ECONNREFUSED" || msg.includes("connect")) {
    return { category: "CONNECTION", detail: "Failed to connect to Gmail SMTP server." };
  }
  if (resCode === 553 || msg.includes("invalid recipient")) {
    return { category: "RECIPIENT", detail: "Invalid recipient email address." };
  }
  // Generic 550 / EENVELOPE that is not a daily limit
  if (resCode === 550 || code === "EENVELOPE") {
    return { category: "SENDER", detail: "Sender address rejected. Verify GMAIL_USER." };
  }
  if (msg.includes("timeout")) {
    return { category: "TIMEOUT", detail: "Gmail SMTP timeout. Network or server issue." };
  }
  return { category: "UNKNOWN", detail: msg };
}

export async function POST(request) {
  try {
    // ── Pre-flight: Verify Gmail credentials are configured ──────────────
    if (!process.env.GMAIL_USER) {
      console.error("[send-alert-email] GMAIL_USER environment variable not set");
      return Response.json(
        { error: "Email service not configured: missing GMAIL_USER" },
        { status: 503 }
      );
    }
    if (!process.env.GMAIL_APP_PASSWORD) {
      console.error("[send-alert-email] GMAIL_APP_PASSWORD environment variable not set");
      return Response.json(
        { error: "Email service not configured: missing GMAIL_APP_PASSWORD" },
        { status: 503 }
      );
    }

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
      console.error("[send-alert-email] Invalid recipient email:", to);
      return Response.json({ error: "Invalid recipient email address" }, { status: 400 });
    }

    // ── Build rich HTML email body ────────────────────────────────────────
    const htmlBody = buildAlertEmailHtml({ alertType, deviceId, sensorData, message });

    // ── Verify transporter connectivity (cached — skips re-verify if recently passed) ──
    // Avoids hammering Gmail AUTH which triggers "454 Too many login attempts".
    try {
      await ensureTransporterReady();
    } catch (verifyErr) {
      const { category, detail } = categorizeEmailError(verifyErr);
      console.error(`[send-alert-email] Transporter verification failed [${category}]:`, detail);
      console.error("[send-alert-email] Full error:", verifyErr);
      // Invalidate cache so next request retries (after the lockout window)
      _verifyOk = false;
      _verifyCheckedAt = 0;
      const statusCode = category === "AUTH_THROTTLE" ? 429 : 503;
      return Response.json(
        { error: `Email service error: ${detail}`, category },
        { status: statusCode }
      );
    }

    // ── Send email ───────────────────────────────────────────────────────
    try {
      const result = await transporter.sendMail({
        from: `"Egg Incubator Alerts" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        text: message || subject, // plain-text fallback for email clients that don't render HTML
        html: htmlBody,
      });
      console.log("[send-alert-email] Email sent successfully", {
        messageId: result.messageId,
        to,
        alertType,
        deviceId,
      });
      return Response.json({ success: true });
    } catch (sendErr) {
      const { category, detail } = categorizeEmailError(sendErr);
      console.error(`[send-alert-email] Email send failed [${category}]:`, detail);
      console.error("[send-alert-email] Error code:", sendErr.code);
      console.error("[send-alert-email] Full error:", sendErr);
      console.error("[send-alert-email] Request details:", {
        to,
        subject,
        alertType,
        deviceId,
        gmailUser: process.env.GMAIL_USER,
      });

      // Return appropriate error status based on category
      const statusCode =
        category === "AUTH"         ? 401 :
        category === "AUTH_THROTTLE" ? 429 :
        category === "DAILY_LIMIT"   ? 429 :
        category === "RATE_LIMIT"    ? 429 : 500;
      return Response.json(
        { error: `Failed to send alert email: ${detail}`, category },
        { status: statusCode }
      );
    }
  } catch (error) {
    // Catch JSON parsing or other unexpected errors
    console.error("[send-alert-email] Unexpected error:", error.message);
    console.error("[send-alert-email] Stack:", error.stack);

    return Response.json(
      { error: "Failed to send alert email. Please try again later." },
      { status: 500 }
    );
  }
}
