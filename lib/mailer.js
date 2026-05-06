// @ts-nocheck
/**
 * lib/mailer.js  — Server-side only
 *
 * Shared nodemailer utility used by the alert system to send Gmail SMTP emails.
 * Reads the enabled flag and recipient address from Firestore before sending,
 * so toggling email alerts in Configuration takes effect immediately.
 */

import nodemailer from "nodemailer";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { buildAlertEmailHtml } from "@/lib/emailTemplate";

// ── Map specific alert-type keys → HTML template category ────────────────────
const ALERT_CATEGORY_MAP = {
  TEMP_TOO_HIGH: "sensor",
  TEMP_TOO_LOW: "sensor",
  HUMIDITY_TOO_HIGH: "sensor",
  HUMIDITY_TOO_LOW: "sensor",
  TEMP_APPROACHING_CRITICAL: "sensor",
  HUMIDITY_APPROACHING_CRITICAL: "sensor",
  SENSOR_FAILURE: "sensor",
  EGG_TURNING_MALFUNCTION: "sensor",
  WATER_LOW: "water",
  SYSTEM_OFFLINE: "offline",
  POWER_OUTAGE: "offline",
  POWER_RESTORED: "offline",
  CANDLING_SCHEDULE_ALERT: "candling",
};

// ── Nodemailer transporter (Gmail SMTP) ──────────────────────────────────────
// Transporter is created lazily so missing env vars don't crash at import time.
let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return _transporter;
}

// ── Read email config from Firestore ─────────────────────────────────────────
async function getEmailConfig() {
  try {
    const snap = await getDoc(
      doc(firestore, "system_configurations", "default")
    );
    const data = snap.data();
    return {
      enabled: Boolean(data?.alerts?.emailAlerts),
      recipient: String(data?.alerts?.alertEmail || "").trim(),
    };
  } catch (err) {
    console.error("[mailer] Failed to read email config:", err.message);
    return { enabled: false, recipient: "" };
  }
}

/**
 * sendAlertEmail
 *
 * Called by alertSystem.js whenever a triggered alert needs an email.
 * Checks the Firestore "emailAlerts" toggle before sending.
 *
 * @param {object} opts
 * @param {string} opts.alertTypeKey   Internal key e.g. "TEMP_TOO_HIGH"
 * @param {string} opts.subject        Email subject line
 * @param {string} [opts.deviceId]     Device identifier to show in email
 * @param {object} [opts.sensorData]   { temperature, humidity, waterLevel }
 * @param {string} [opts.message]      Optional extra message text
 */
export async function sendAlertEmail({
  alertTypeKey,
  subject,
  deviceId,
  sensorData,
  message,
}) {
  // Guard: require Gmail credentials
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[mailer] GMAIL_USER / GMAIL_APP_PASSWORD not set. Skipping email.");
    return;
  }

  // Guard: check Firestore toggle + recipient
  const config = await getEmailConfig();
  if (!config.enabled) {
    console.log("[mailer] Email alerts are disabled in configuration. Skipping.");
    return;
  }
  if (!config.recipient) {
    console.warn("[mailer] No alert recipient email configured. Skipping.");
    return;
  }

  // Resolve the template category (sensor / water / offline)
  const templateType = ALERT_CATEGORY_MAP[alertTypeKey] ?? "sensor";

  // Build the HTML body using the shared email template
  const htmlBody = buildAlertEmailHtml({
    alertType: templateType,
    deviceId,
    sensorData,
    message,
  });

  await getTransporter().sendMail({
    from: `"Egg Incubator Alerts" <${process.env.GMAIL_USER}>`,
    to: config.recipient,
    subject,
    text: message || subject, // plain-text fallback
    html: htmlBody,
  });

  console.log(`[mailer] Alert email sent → ${config.recipient} | ${subject}`);
}

/**
 * sendCandlingAlertEmail
 *
 * Sends a candling schedule reminder email for a specific batch.
 *
 * @param {object} opts
 * @param {string} opts.batchId           Batch ID string e.g. "CK-250615-AB12"
 * @param {string} opts.batchName         Display name
 * @param {string} [opts.deviceName]      Incubator name
 * @param {number} opts.candlingDay       Which candling day (e.g. 7, 14)
 * @param {string} opts.scheduleDate      Formatted date string e.g. "Jun 22, 2025"
 * @param {string} [opts.eggType]         Egg type e.g. "Chicken"
 * @param {string} [opts.recipient]       Override recipient (uses Firestore config if omitted)
 * @param {boolean} [opts.isTomorrow]     True if reminder is for tomorrow
 */
export async function sendCandlingAlertEmail({
  batchId,
  batchName,
  deviceName,
  candlingDay,
  scheduleDate,
  eggType,
  recipient: overrideRecipient,
  isTomorrow = false,
}) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[mailer] GMAIL credentials not set. Skipping candling email.");
    return;
  }

  const config = await getEmailConfig();
  const finalRecipient = overrideRecipient || config.recipient;
  if (!config.enabled && !overrideRecipient) {
    console.log("[mailer] Email alerts disabled. Skipping candling email.");
    return;
  }
  if (!finalRecipient) {
    console.warn("[mailer] No recipient for candling email.");
    return;
  }

  const dayLabel = isTomorrow ? `Day ${candlingDay} (Tomorrow)` : `Day ${candlingDay} (Today)`;
  const subject = isTomorrow
    ? `Candling Reminder Tomorrow — ${batchId}`
    : `Candle Your Eggs Today — ${batchId}`;
  const message = [
    `Batch: ${batchName || batchId}`,
    eggType ? `Egg Type: ${eggType}` : null,
    deviceName ? `Incubator: ${deviceName}` : null,
    `Candling: ${dayLabel} — ${scheduleDate}`,
  ].filter(Boolean).join("<br />");

  const htmlBody = buildAlertEmailHtml({
    alertType: "candling",
    deviceId: deviceName || null,
    message,
  });

  await getTransporter().sendMail({
    from: `"Egg Incubator Alerts" <${process.env.GMAIL_USER}>`,
    to: finalRecipient,
    subject,
    text: `${subject}\n${message.replace(/<br \/>/g, "\n")}`,
    html: htmlBody,
  });

  console.log(`[mailer] Candling email sent → ${finalRecipient} | ${subject}`);
}
