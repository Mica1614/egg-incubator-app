// @ts-nocheck
/**
 * lib/deviceMonitor.js  — Server-side only, Node.js
 *
 * Background device monitor that runs independently of any user session.
 * Started once when the Next.js server boots via instrumentation.js.
 *
 * What it does:
 *  1. Watches Firestore `system_configurations/default` for alert config
 *     (emailAlerts toggle, alertEmail, cooldownMinutes).
 *  2. Watches all devices owned by any user via a Firestore collection-group
 *     query on the `devices` sub-collection (`users/{uid}/devices/{deviceId}`).
 *  3. Subscribes to RTDB `devices/{deviceId}/state` for each discovered device.
 *  4. Checks sensor thresholds on every RTDB update — sends email if abnormal.
 *  5. Runs a setInterval every 10 s to detect offline/online transitions
 *     (RTDB never fires an event when a device silently stops sending data).
 *  6. Sends emails directly via nodemailer — no HTTP round-trip, no user auth.
 *
 * Per-category email queue prevents concurrent requests and silent timeouts.
 */

import nodemailer from "nodemailer";
import { getAdminAuth, getAdminDb, getAdminFirestore } from "./firebaseAdmin.js";
import { buildAlertEmailHtml } from "./emailTemplate.js";

// ── Alert thresholds (must match useEmailAlerts.js) ───────────────────────────
const THRESHOLDS = {
  tempHigh:    38.5,
  tempLow:     36.5,
  humidityHigh: 65,
  humidityLow:  40,
  offlineMs:   15_000,
};

const DEFAULT_COOLDOWN_MINUTES    = 10;
const OFFLINE_CHECK_INTERVAL_MS   = 10_000;

// ── Runtime state (in-process memory, survives for the lifetime of the server) ─
let emailConfig = {
  enabled:         false,
  cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
};

// Map each deviceId → owner's email address (resolved from Firebase Auth)
const deviceOwnerEmail = {}; // { [deviceId]: string }

const cooldowns      = {};  // { "deviceId:alertKey": timestamp }
const latestStates   = {};  // { deviceId: rtdb state object }
const prevOffline    = {};  // { deviceId: boolean }
const deviceListeners = {}; // { deviceId: unsubscribeFunction }

// Per-category email queues — one queue per alertType category.
const queues = {}; // { [category]: Array<() => Promise> }
const busy   = {}; // { [category]: boolean }

// ── Nodemailer transporter ────────────────────────────────────────────────────
// Created lazily so missing env vars don't crash at import time.
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

// ── Queue processor ───────────────────────────────────────────────────────────
async function processQueue(category) {
  if (busy[category]) return;
  busy[category] = true;
  while (queues[category]?.length) {
    const task = queues[category].shift();
    try {
      await task();
    } catch (err) {
      console.error(`[deviceMonitor] queue error (${category}):`, err.message);
    }
  }
  busy[category] = false;
}

/**
 * Enqueue an email send. Checks cooldown before enqueuing.
 * Uses the alertType as the queue category (sensor | water | offline | online).
 */
function enqueueEmail(deviceId, alertKey, alertType, subject, sensorData, message) {
  const { enabled, cooldownMinutes } = emailConfig;
  // Each device sends to its owner's email, not a global shared address.
  const recipient = deviceOwnerEmail[deviceId];
  if (!enabled || !recipient) return;

  const cooldownKey = `${deviceId}:${alertKey}`;
  const lastSent    = cooldowns[cooldownKey] ?? 0;
  const cooldownMs  = cooldownMinutes * 60 * 1000;
  if (Date.now() - lastSent < cooldownMs) return;

  cooldowns[cooldownKey] = Date.now();

  if (!queues[alertType]) queues[alertType] = [];
  queues[alertType].push(async () => {
    try {
      const html = buildAlertEmailHtml({ alertType, deviceId, sensorData, message });
      await getTransporter().sendMail({
        from:    `"Egg Incubator Alerts" <${process.env.GMAIL_USER}>`,
        to:      recipient,
        subject,
        text:    message || subject,
        html,
      });
      console.log(`[deviceMonitor] ✉ Sent "${subject}" → ${recipient}`);
    } catch (err) {
      console.error(`[deviceMonitor] Failed to send "${subject}":`, err.message);
    }
  });

  processQueue(alertType);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isDeviceOffline(state) {
  if (!state || state.mode !== "online") return true;
  const lastSeenMs = typeof state.lastSeen === "number" ? state.lastSeen : 0;
  if (lastSeenMs === 0) return false;
  return Date.now() - lastSeenMs > THRESHOLDS.offlineMs;
}

// ── Per-device RTDB state handler ─────────────────────────────────────────────
function handleDeviceState(deviceId, state) {
  if (!state) return;
  latestStates[deviceId] = state;

  // Skip sensor/water checks if device is currently offline
  if (isDeviceOffline(state)) return;

  const { tempC, humidity, waterLow } = state;

  // Temperature
  if (tempC !== undefined) {
    const isSensorError = tempC === -999;
    const isAbnormal    = isSensorError || tempC > THRESHOLDS.tempHigh || tempC < THRESHOLDS.tempLow;
    if (isAbnormal) {
      enqueueEmail(
        deviceId, "sensor_temp", "sensor",
        `⚠️ Abnormal Temperature — ${deviceId}`,
        isSensorError ? null : { temperature: tempC, humidity, waterLevel: waterLow ? 0 : 100 },
        isSensorError ? `Sensor error on device "${deviceId}". Temperature sensor returned -999.` : null
      );
    }
  }

  // Humidity
  if (humidity !== undefined) {
    const isSensorError = humidity === -999;
    const isAbnormal    = isSensorError || humidity > THRESHOLDS.humidityHigh || humidity < THRESHOLDS.humidityLow;
    if (isAbnormal) {
      enqueueEmail(
        deviceId, "sensor_humidity", "sensor",
        `⚠️ Abnormal Humidity — ${deviceId}`,
        isSensorError ? null : { temperature: tempC, humidity, waterLevel: waterLow ? 0 : 100 },
        isSensorError ? `Sensor error on device "${deviceId}". Humidity sensor returned -999.` : null
      );
    }
  }

  // Water low
  if (waterLow === true) {
    enqueueEmail(
      deviceId, "water_low", "water",
      `💧 Water Level Low — ${deviceId}`,
      { waterLevel: 0 }, null
    );
  }
}

// ── Per-device RTDB listener management ──────────────────────────────────────
async function watchDevice(deviceId, ownerUid) {
  // Resolve owner email from Firebase Auth (cached after first lookup)
  if (!deviceOwnerEmail[deviceId]) {
    try {
      const userRecord = await getAdminAuth().getUser(ownerUid);
      if (userRecord.email) {
        deviceOwnerEmail[deviceId] = userRecord.email;
      } else {
        console.warn(`[deviceMonitor] User ${ownerUid} has no email — skipping device ${deviceId}`);
        return;
      }
    } catch (err) {
      console.error(`[deviceMonitor] Could not resolve owner for ${deviceId}:`, err.message);
      return;
    }
  }

  if (deviceListeners[deviceId]) return; // already subscribed

  try {
    const adminDb  = getAdminDb();
    const stateRef = adminDb.ref(`devices/${deviceId}/state`);

    stateRef.on("value", (snap) => {
      handleDeviceState(deviceId, snap.val());
    }, (err) => {
      console.error(`[deviceMonitor] RTDB error for ${deviceId}:`, err.message);
    });

    deviceListeners[deviceId] = () => stateRef.off("value");
    console.log(`[deviceMonitor] Watching device: ${deviceId} (owner: ${deviceOwnerEmail[deviceId]})`);
  } catch (err) {
    console.error(`[deviceMonitor] Failed to watch ${deviceId}:`, err.message);
  }
}

function unwatchDevice(deviceId) {
  if (deviceListeners[deviceId]) {
    deviceListeners[deviceId]();
    delete deviceListeners[deviceId];
    delete latestStates[deviceId];
    delete prevOffline[deviceId];
    delete deviceOwnerEmail[deviceId];
    console.log(`[deviceMonitor] Stopped watching device: ${deviceId}`);
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
export function startDeviceMonitor() {
  let adminFirestore;
  try {
    adminFirestore = getAdminFirestore();
  } catch (err) {
    // Admin credentials missing — log a clear message and exit gracefully.
    // The app still runs; only the server-side email monitor is disabled.
    console.warn("\n[deviceMonitor] ⚠️  Server-side email monitor NOT started.");
    console.warn("[deviceMonitor]    Reason:", err.message);
    console.warn("[deviceMonitor]    To enable: add FIREBASE_ADMIN_CLIENT_EMAIL and");
    console.warn("[deviceMonitor]    FIREBASE_ADMIN_PRIVATE_KEY to .env.local\n");
    return;
  }

  // 1. Watch alert config from Firestore (global toggle + cooldown only)
  adminFirestore
    .doc("system_configurations/default")
    .onSnapshot(
      (snap) => {
        const d = snap.data();
        emailConfig = {
          enabled:         Boolean(d?.alerts?.emailAlerts),
          cooldownMinutes: Number(d?.alerts?.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES),
        };
        console.log(
          `[deviceMonitor] Config updated — alerts ${emailConfig.enabled ? "ON" : "OFF"}`
        );
      },
      (err) => console.error("[deviceMonitor] Config snapshot error:", err.message)
    );

  // 2. Watch all user devices via collection-group query on "devices" sub-collections.
  //    Path pattern: users/{uid}/devices/{deviceId}
  //    We extract uid from the document reference path to resolve the owner's email.
  adminFirestore
    .collectionGroup("devices")
    .onSnapshot(
      (snap) => {
        const activeIds = new Set();
        snap.forEach((docSnap) => {
          const deviceId = docSnap.id;
          // ref.path = "users/{uid}/devices/{deviceId}"
          const pathParts = docSnap.ref.path.split("/");
          const ownerUid  = pathParts[1]; // index 1 = uid
          activeIds.add(deviceId);
          watchDevice(deviceId, ownerUid);
        });

        // Stop watching devices that have been removed from all users
        Object.keys(deviceListeners).forEach((id) => {
          if (!activeIds.has(id)) unwatchDevice(id);
        });
      },
      (err) => console.error("[deviceMonitor] Device list snapshot error:", err.message)
    );

  // 3. Interval — offline/online detection
  //    RTDB never fires an event when a device simply stops sending data,
  //    so we poll lastSeen every 10 s to detect the transition.
  setInterval(() => {
    Object.entries(latestStates).forEach(([deviceId, state]) => {
      const offline    = isDeviceOffline(state);
      const wasOffline = prevOffline[deviceId] ?? false;

      if (offline && !wasOffline) {
        prevOffline[deviceId] = true;
        enqueueEmail(
          deviceId, "offline", "offline",
          `🔴 Device Offline — ${deviceId}`,
          null,
          `Device "${deviceId}" has gone offline or stopped responding.`
        );
      } else if (!offline && wasOffline) {
        prevOffline[deviceId] = false;
        // Clear per-device cooldowns so the first post-reconnect readings are checked fresh
        ["offline", "sensor_temp", "sensor_humidity", "water_low"].forEach(
          (key) => delete cooldowns[`${deviceId}:${key}`]
        );
        enqueueEmail(
          deviceId, "online", "online",
          `✅ Device Back Online — ${deviceId}`,
          null,
          `Device "${deviceId}" has reconnected and is back online.`
        );
      }
    });
  }, OFFLINE_CHECK_INTERVAL_MS);

  console.log("[deviceMonitor] ✅ Server-side device monitor started successfully.");
}
