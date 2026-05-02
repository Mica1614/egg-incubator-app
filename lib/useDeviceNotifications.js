// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";
import { sendNotification, sendToastNotification, saveNotificationToFirestore, NOTIFICATION_TYPES } from "@/lib/notificationService";

const OFFLINE_THRESHOLD_MS = 15000;
const OFFLINE_CHECK_INTERVAL_MS = 10_000;

/** Derive online status from a raw RTDB device state object */
function computeIsOnline(state) {
  if (!state || state.mode !== "online") return false;
  const lastSeenMs = typeof state.lastSeen === "number" ? state.lastSeen : 0;
  if (lastSeenMs === 0) return true; // never seen yet — treat as online until proven stale
  return (Date.now() - lastSeenMs) <= OFFLINE_THRESHOLD_MS;
}

/**
 * Hook to monitor device state changes and send notifications.
 * Uses both useEffect (for data-change events) and setInterval (for offline detection
 * when the device goes silent and RTDB stops firing).
 */
export function useDeviceNotifications(deviceName, deviceState, preferences, enabled = true) {
  const prevStateRef    = useRef(null);
  const prevIsOnlineRef = useRef(null); // null = not yet evaluated
  // Keep a ref to the latest deviceState so the interval can always read it
  const latestDeviceStateRef = useRef(deviceState);

  // Sync the ref whenever the prop updates
  useEffect(() => {
    latestDeviceStateRef.current = deviceState;
  }, [deviceState]);

  // ── Interval: detect offline/online transitions ────────────────────────────
  // RTDB onValue does NOT fire when a device goes silent — must use an interval.
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const state = latestDeviceStateRef.current;
      const isOnline = computeIsOnline(state);
      const prevIsOnline = prevIsOnlineRef.current;

      if (prevIsOnline === null) {
        // First tick — initialise without alerting
        prevIsOnlineRef.current = isOnline;
        return;
      }

      if (prevIsOnline !== isOnline) {
        if (!isOnline) {
          // Toast + save to notification list
          sendToastNotification(NOTIFICATION_TYPES.DEVICE_OFFLINE, deviceName, null);
          saveNotificationToFirestore(NOTIFICATION_TYPES.DEVICE_OFFLINE, deviceName, null);
        } else {
          sendToastNotification(NOTIFICATION_TYPES.DEVICE_ONLINE, deviceName, null);
          saveNotificationToFirestore(NOTIFICATION_TYPES.DEVICE_ONLINE, deviceName, null);
        }
        prevIsOnlineRef.current = isOnline;
      }
    }, OFFLINE_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, deviceName]);

  // ── Data-change effect: sensor / water / actuator notifications ───────────
  useEffect(() => {
    if (!enabled || !deviceState || !preferences) return;

    const isOnline = computeIsOnline(deviceState);

    // Skip all sensor checks when device is offline
    if (!isOnline) {
      prevStateRef.current = deviceState;
      return;
    }

    const prevState = prevStateRef.current;
    if (!prevState) {
      // Check initial load conditions
      if (deviceState.waterLow === true) {
        sendNotification(NOTIFICATION_TYPES.WATER_LOW, deviceName, null, preferences);
      }
      if (deviceState.tempC === -999 || (deviceState.tempC !== undefined && deviceState.tempC < 0)) {
        sendNotification(NOTIFICATION_TYPES.TEMP_ABNORMAL, deviceName, "Sensor Error", preferences);
      }
      if (deviceState.humidity === -999 || (deviceState.humidity !== undefined && deviceState.humidity < 0)) {
        sendNotification(NOTIFICATION_TYPES.HUMIDITY_ABNORMAL, deviceName, "Sensor Error", preferences);
      }
      prevStateRef.current = deviceState;
      return;
    }

    // Water level changes
    const currWaterLow = deviceState.waterLow;
    const prevWaterLow = prevState.waterLow;
    if (currWaterLow === true && prevWaterLow !== true) {
      sendNotification(NOTIFICATION_TYPES.WATER_LOW, deviceName, null, preferences);
    } else if (currWaterLow === false && prevWaterLow === true) {
      sendNotification(NOTIFICATION_TYPES.WATER_OK, deviceName, null, preferences);
    }

    // Heater
    if (prevState.heaterBulb !== undefined && deviceState.heaterBulb !== undefined) {
      if (!prevState.heaterBulb && deviceState.heaterBulb) {
        sendNotification(NOTIFICATION_TYPES.HEATER_ON, deviceName, null, preferences);
      } else if (prevState.heaterBulb && !deviceState.heaterBulb) {
        sendNotification(NOTIFICATION_TYPES.HEATER_OFF, deviceName, null, preferences);
      }
    }

    // Egg turner
    if (prevState.eggTurner !== undefined && deviceState.eggTurner !== undefined) {
      if (!prevState.eggTurner && deviceState.eggTurner) {
        sendNotification(NOTIFICATION_TYPES.EGG_TURNER_ON, deviceName, null, preferences);
      } else if (prevState.eggTurner && !deviceState.eggTurner) {
        sendNotification(NOTIFICATION_TYPES.EGG_TURNER_OFF, deviceName, null, preferences);
      }
    }

    // Fan
    if (prevState.fan !== undefined && deviceState.fan !== undefined) {
      if (!prevState.fan && deviceState.fan) {
        sendNotification(NOTIFICATION_TYPES.FAN_ON, deviceName, null, preferences);
      } else if (prevState.fan && !deviceState.fan) {
        sendNotification(NOTIFICATION_TYPES.FAN_OFF, deviceName, null, preferences);
      }
    }

    // Humidifier
    if (prevState.humidifier !== undefined && deviceState.humidifier !== undefined) {
      if (!prevState.humidifier && deviceState.humidifier) {
        sendNotification(NOTIFICATION_TYPES.HUMIDIFIER_ON, deviceName, null, preferences);
      } else if (prevState.humidifier && !deviceState.humidifier) {
        sendNotification(NOTIFICATION_TYPES.HUMIDIFIER_OFF, deviceName, null, preferences);
      }
    }

    // Temperature abnormality
    if (deviceState.tempC !== undefined) {
      const TEMP_TRIGGER = deviceState.tempTrigger;
      const TEMP_STOP = deviceState.tempStop;
      const currTempError = deviceState.tempC === -999 || deviceState.tempC < 0;
      const prevTempError = prevState.tempC !== undefined && (prevState.tempC === -999 || prevState.tempC < 0);
      const currTempThresh = !currTempError && TEMP_TRIGGER !== undefined && TEMP_STOP !== undefined &&
        (deviceState.tempC < TEMP_TRIGGER || deviceState.tempC > TEMP_STOP);
      const prevTempThresh = prevState.tempC !== undefined && !prevTempError &&
        TEMP_TRIGGER !== undefined && TEMP_STOP !== undefined &&
        (prevState.tempC < TEMP_TRIGGER || prevState.tempC > TEMP_STOP);
      const currAbnormal = currTempError || currTempThresh;
      const prevAbnormal = prevTempError || prevTempThresh;
      if (!prevAbnormal && currAbnormal) {
        sendNotification(NOTIFICATION_TYPES.TEMP_ABNORMAL, deviceName, currTempError ? "Sensor Error" : deviceState.tempC?.toFixed(1), preferences);
      } else if (prevAbnormal && !currAbnormal) {
        sendNotification(NOTIFICATION_TYPES.TEMP_NORMAL, deviceName, deviceState.tempC?.toFixed(1), preferences);
      }
    }

    // Humidity abnormality
    if (deviceState.humidity !== undefined) {
      const HUM_TRIGGER = deviceState.humidityTrigger;
      const HUM_STOP = deviceState.humidityStop;
      const currHumError = deviceState.humidity === -999 || deviceState.humidity < 0;
      const prevHumError = prevState.humidity !== undefined && (prevState.humidity === -999 || prevState.humidity < 0);
      const currHumThresh = !currHumError && HUM_TRIGGER !== undefined && HUM_STOP !== undefined &&
        (deviceState.humidity < HUM_TRIGGER || deviceState.humidity > HUM_STOP);
      const prevHumThresh = prevState.humidity !== undefined && !prevHumError &&
        HUM_TRIGGER !== undefined && HUM_STOP !== undefined &&
        (prevState.humidity < HUM_TRIGGER || prevState.humidity > HUM_STOP);
      const currAbnormal = currHumError || currHumThresh;
      const prevAbnormal = prevHumError || prevHumThresh;
      if (!prevAbnormal && currAbnormal) {
        sendNotification(NOTIFICATION_TYPES.HUMIDITY_ABNORMAL, deviceName, currHumError ? "Sensor Error" : Math.round(deviceState.humidity), preferences);
      } else if (prevAbnormal && !currAbnormal) {
        sendNotification(NOTIFICATION_TYPES.HUMIDITY_NORMAL, deviceName, Math.round(deviceState.humidity), preferences);
      }
    }

    prevStateRef.current = deviceState;
  }, [deviceState, deviceName, preferences, enabled]);
}
