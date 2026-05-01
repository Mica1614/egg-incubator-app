// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

const DEFAULT_THROTTLE_MS = 60_000;
export const LOG_INTERVAL_KEY = "sensor_log_interval_ms";

function getThrottleMs() {
  try {
    const v = localStorage.getItem(LOG_INTERVAL_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n >= 5_000) return n;
    }
  } catch {}
  return DEFAULT_THROTTLE_MS;
}

const ACTUATORS = ["heaterBulb", "fan", "humidifier", "eggTurner"];

const ACTUATOR_LABELS = {
  heaterBulb: "Heater",
  fan: "Fan",
  humidifier: "Humidifier",
  eggTurner: "Egg Turner",
};

/**
 * Logs sensor readings and actuator on/off events to Firestore.
 *
 * Sensor readings → devices/{deviceId}/history
 *   { tempC, humidity, waterLow, createdAt }
 *
 * Actuator events → devices/{deviceId}/activityLog
 *   { actuator, label, state, createdAt }
 *
 * Call this hook in the device control page once the device is authorized.
 */
export function useDeviceHistoryLogger(deviceId, deviceState, enabled = true) {
  const latestStateRef = useRef(null);  // always holds the most recent deviceState
  const prevStateRef   = useRef(null);  // used for actuator change detection
  const isOnlineRef    = useRef(false); // current online status

  // Keep latestStateRef + isOnlineRef in sync with every RTDB update
  useEffect(() => {
    latestStateRef.current = deviceState;
    if (deviceState) {
      const lastSeenMs = typeof deviceState.lastSeen === "number" ? deviceState.lastSeen : 0;
      isOnlineRef.current =
        deviceState.mode === "online" &&
        lastSeenMs > 0 &&
        (Date.now() - lastSeenMs) <= 45000;
    } else {
      isOnlineRef.current = false;
    }
  }, [deviceState]);

  // ── Sensor recording: interval-driven ──────────────────────────────────
  useEffect(() => {
    if (!enabled || !deviceId) return;

    function saveSensor() {
      const state = latestStateRef.current;
      if (!state) return;
      // Do not record data when device is offline
      if (!isOnlineRef.current) return;

      const tempValid =
        typeof state.tempC === "number" && state.tempC !== -999;
      const humValid =
        typeof state.humidity === "number" && state.humidity !== -999;
      if (!tempValid && !humValid) return;

      const entry = {
        createdAt: serverTimestamp(),
        waterLow: state.waterLow ?? null,
      };
      if (tempValid) entry.tempC = parseFloat(state.tempC.toFixed(2));
      if (humValid)  entry.humidity = parseFloat(state.humidity.toFixed(1));

      addDoc(collection(firestore, "devices", deviceId, "history"), entry).catch(
        (e) => console.warn("[HistoryLogger] sensor save failed:", e.message)
      );
    }

    // Save once immediately on mount (first reading)
    saveSensor();

    // Then save on every interval tick; re-create timer if interval changes
    const intervalMs = getThrottleMs();
    const timerId = setInterval(saveSensor, intervalMs);
    return () => clearInterval(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, deviceId]);

  // ── Actuator events: change-driven ─────────────────────────────────────
  useEffect(() => {
    if (!enabled || !deviceId || !deviceState) return;
    // Do not log actuator events when device is offline
    if (!isOnlineRef.current) { prevStateRef.current = deviceState; return; }

    const prevState = prevStateRef.current;
    if (prevState) {
      ACTUATORS.forEach((key) => {
        if (
          prevState[key] !== undefined &&
          deviceState[key] !== undefined &&
          prevState[key] !== deviceState[key]
        ) {
          addDoc(
            collection(firestore, "devices", deviceId, "activityLog"),
            {
              actuator: key,
              label: ACTUATOR_LABELS[key] ?? key,
              state: deviceState[key],
              createdAt: serverTimestamp(),
            }
          ).catch((e) =>
            console.warn("[HistoryLogger] actuator log failed:", e.message)
          );
        }
      });
    }

    prevStateRef.current = deviceState;
  }, [deviceState, deviceId, enabled]);
}
