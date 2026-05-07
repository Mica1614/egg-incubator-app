// @ts-nocheck
"use client";

/**
 * useEmailAlerts
 *
 * Listens to RTDB for each owned device and emails alerts when thresholds breach.
 *
 * Architecture:
 *  - onValue    → sensor / water alerts (fires on every device data change)
 *  - setInterval → offline/online detection (RTDB never fires for silent devices)
 *  - Queue       → per alert-type category queue (sensor | water | offline | online)
 *                  ensures at-most-one in-flight request per category, no silent drops
 *  - Cooldown    → per device per alertKey, configurable in Firestore
 */

import { useEffect, useRef } from "react";
import { onValue, ref } from "firebase/database";
import { doc, onSnapshot } from "firebase/firestore";
import { db, firestore } from "@/lib/firebase";
import { sendToastNotification, sendPushNotification, saveNotificationToFirestore, NOTIFICATION_TYPES } from "@/lib/notificationService";

// ── Thresholds ────────────────────────────────────────────────────────────────
const THRESHOLDS = {
  tempHigh: 38.5,
  tempLow: 36.5,
  humidityHigh: 65,
  humidityLow: 40,
  offlineMs: 15000,
};

const DEFAULT_COOLDOWN_MINUTES = 10;
const OFFLINE_CHECK_INTERVAL_MS = 10_000;

function isDeviceOffline(state) {
  if (!state || state.mode !== "online") return true;
  const lastSeenMs = typeof state.lastSeen === "number" ? state.lastSeen : 0;
  if (lastSeenMs === 0) return false;
  return Date.now() - lastSeenMs > THRESHOLDS.offlineMs;
}

export function useEmailAlerts(uid, ownedDeviceIds = []) {
  const cooldownRef     = useRef({});  // { "deviceId:alertKey": timestamp }
  const emailConfigRef  = useRef({ enabled: false, recipient: "", cooldownMinutes: DEFAULT_COOLDOWN_MINUTES });
  const latestStatesRef = useRef({});  // { [deviceId]: state }
  const prevOfflineRef  = useRef({});  // { [deviceId]: boolean }

  // ── Per-category email queue ───────────────────────────────────────────────
  // Prevents concurrent requests within the same alert category (sensor, water, offline, online).
  const queueRef   = useRef({}); // { [category]: Array<() => Promise> }
  const busyRef    = useRef({}); // { [category]: boolean }

  async function processQueue(category) {
    if (busyRef.current[category]) return;
    busyRef.current[category] = true;
    while (queueRef.current[category]?.length) {
      const task = queueRef.current[category].shift();
      try {
        await task();
      } catch (err) {
        console.error(`[useEmailAlerts] queue error (${category}):`, err);
      }
    }
    busyRef.current[category] = false;
  }

  /**
   * Enqueue an email send. Respects cooldown per alertKey.
   * Queued by alertType category (sensor | water | offline | online).
   */
  function enqueueEmail(deviceId, alertKey, alertType, subject, sensorData, message) {
    const { enabled, recipient, cooldownMinutes } = emailConfigRef.current;
    if (!enabled || !recipient) return;

    const cooldownKey = `${deviceId}:${alertKey}`;
    const lastSent = cooldownRef.current[cooldownKey] ?? 0;
    const cooldownMs = cooldownMinutes * 60 * 1000;
    if (Date.now() - lastSent < cooldownMs) return;

    cooldownRef.current[cooldownKey] = Date.now();

    if (!queueRef.current[alertType]) queueRef.current[alertType] = [];
    queueRef.current[alertType].push(async () => {
      try {
        const res = await fetch("/api/send-alert-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: recipient, subject, alertType, deviceId, sensorData, message }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          let errorDetail = errText;
          let errorCategory = "";
          try {
            const errJson = JSON.parse(errText);
            errorDetail = errJson.error || errText;
            errorCategory = errJson.category || "";
          } catch {}

          console.error(`[useEmailAlerts] HTTP ${res.status} for ${cooldownKey}: ${errorDetail}`);

          // Notify user when Gmail daily sending limit is hit
          if (res.status === 429 || errorCategory === "DAILY_LIMIT") {
            const deviceName = deviceId || cooldownKey;
            // In-app toast notification
            sendToastNotification(NOTIFICATION_TYPES.EMAIL_LIMIT, deviceName, null);
            // Browser push notification
            sendPushNotification(NOTIFICATION_TYPES.EMAIL_LIMIT, deviceName, null);
            // Persist to Firestore notification history
            saveNotificationToFirestore(NOTIFICATION_TYPES.EMAIL_LIMIT, deviceName, null);
            console.warn(`[useEmailAlerts] Gmail daily limit reached — no more alert emails will be sent today`);
          } else if (errorCategory === "AUTH_THROTTLE") {
            const deviceName = deviceId || cooldownKey;
            sendToastNotification(NOTIFICATION_TYPES.EMAIL_AUTH_THROTTLE, deviceName, null);
            sendPushNotification(NOTIFICATION_TYPES.EMAIL_AUTH_THROTTLE, deviceName, null);
            saveNotificationToFirestore(NOTIFICATION_TYPES.EMAIL_AUTH_THROTTLE, deviceName, null);
            console.warn(`[useEmailAlerts] Gmail auth throttled — too many login attempts, will retry next cooldown cycle`);
          } else if (res.status === 401) {
            console.error(`[useEmailAlerts] Gmail authentication failed — check GMAIL_USER and GMAIL_APP_PASSWORD`);
          } else if (res.status === 503) {
            console.error(`[useEmailAlerts] Email service unavailable — check Gmail configuration`);
          }
        } else {
          console.log(`[useEmailAlerts] Alert email sent successfully for ${cooldownKey}`);
        }
      } catch (err) {
        console.error(`[useEmailAlerts] fetch error for ${cooldownKey}:`, err.message || err);
      }
    });
    processQueue(alertType);
  }

  // ── Subscribe to Firestore email config ────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      doc(firestore, "system_configurations", "default"),
      (snap) => {
        const d = snap.data();
        emailConfigRef.current = {
          enabled: Boolean(d?.alerts?.emailAlerts),
          recipient: String(d?.alerts?.alertEmail || ""),
          cooldownMinutes: Number(d?.alerts?.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES),
        };
      },
      (err) => console.error("[useEmailAlerts] config read error:", err)
    );
    return () => unsub();
  }, [uid]);

  // ── Subscribe to RTDB: sensor / water alerts ───────────────────────────────
  useEffect(() => {
    if (!uid || !ownedDeviceIds.length) return;

    const listeners = ownedDeviceIds.map((deviceId) => {
      const deviceRef = ref(db, `devices/${deviceId}/state`);
      const unsubscribe = onValue(deviceRef, (snapshot) => {
        const state = snapshot.val();
        if (!state) return;

        latestStatesRef.current[deviceId] = state;

        // Skip sensor/water checks when device is offline
        if (isDeviceOffline(state)) return;

        const { tempC, humidity, waterLow } = state;

        // Temperature — also alert on sensor error (-999)
        if (tempC !== undefined) {
          const isSensorError = tempC === -999;
          const isAbnormal = isSensorError || tempC > THRESHOLDS.tempHigh || tempC < THRESHOLDS.tempLow;
          if (isAbnormal) {
            enqueueEmail(
              deviceId, "sensor_temp", "sensor",
              `⚠️ Abnormal Temperature — ${deviceId}`,
              isSensorError ? null : { temperature: tempC, humidity, waterLevel: waterLow ? 0 : 100 },
              isSensorError ? `Sensor error on device "${deviceId}". Temperature sensor returned -999.` : null
            );
          }
        }

        // Humidity — also alert on sensor error (-999)
        if (humidity !== undefined) {
          const isSensorError = humidity === -999;
          const isAbnormal = isSensorError || humidity > THRESHOLDS.humidityHigh || humidity < THRESHOLDS.humidityLow;
          if (isAbnormal) {
            enqueueEmail(
              deviceId, "sensor_humidity", "sensor",
              `⚠️ Abnormal Humidity — ${deviceId}`,
              isSensorError ? null : { temperature: tempC, humidity, waterLevel: waterLow ? 0 : 100 },
              isSensorError ? `Sensor error on device "${deviceId}". Humidity sensor returned -999.` : null
            );
          }
        }

        // Water low (boolean)
        if (waterLow === true) {
          enqueueEmail(
            deviceId, "water_low", "water",
            `💧 Water Level Low — ${deviceId}`,
            { waterLevel: 0 },
            null
          );
        }
      });
      return () => unsubscribe();
    });

    return () => listeners.forEach((unsub) => unsub());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, JSON.stringify(ownedDeviceIds)]);

  // ── Interval: offline / online transition emails ───────────────────────────
  useEffect(() => {
    if (!uid || !ownedDeviceIds.length) return;

    const interval = setInterval(() => {
      ownedDeviceIds.forEach((deviceId) => {
        const state = latestStatesRef.current[deviceId];
        const offline = state ? isDeviceOffline(state) : false;
        const prevOffline = prevOfflineRef.current[deviceId];

        // First evaluation — initialise silently
        if (prevOffline === undefined) {
          prevOfflineRef.current[deviceId] = offline;
          return;
        }

        if (offline && !prevOffline) {
          // online → offline
          prevOfflineRef.current[deviceId] = true;
          enqueueEmail(
            deviceId, "offline", "offline",
            `🔌 Device Offline — ${deviceId}`,
            null,
            `Device "${deviceId}" has not sent data for over 15 seconds.`
          );
        } else if (!offline && prevOffline) {
          // offline → online: clear all cooldowns for this device so first readings fire fresh
          prevOfflineRef.current[deviceId] = false;
          ["offline", "sensor_temp", "sensor_humidity", "water_low"].forEach((k) => {
            delete cooldownRef.current[`${deviceId}:${k}`];
          });
          enqueueEmail(
            deviceId, "online", "online",
            `✅ Device Back Online — ${deviceId}`,
            null,
            `Device "${deviceId}" has reconnected and is sending data again.`
          );
        }
      });
    }, OFFLINE_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, JSON.stringify(ownedDeviceIds)]);
}

