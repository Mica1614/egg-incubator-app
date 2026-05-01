// @ts-nocheck
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { ref, onValue, set, off } from "firebase/database";
import { db } from "@/lib/firebase";

/**
 * Subscribes to a specific set of incubator devices in the Realtime Database.
 *
 * @param {string[]} ownedDeviceIds - Array of device IDs the current user owns.
 *                                    Pass an empty array (or omit) to subscribe to nothing.
 *
 * Returns:
 *   devices  – Record<deviceId, state>  (live sensor + actuator values)
 *   loading  – boolean
 *   error    – string | null
 *   setActuator(deviceId, key, value) – write a single actuator command
 */
export function useIncubatorDevices(ownedDeviceIds = []) {
  const [devices, setDevices] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Keep a ref to the active listeners so we can clean them up on re-subscription
  const listenersRef = useRef({});

  useEffect(() => {
    // Unsubscribe all previous listeners
    Object.values(listenersRef.current).forEach((unsub) => unsub());
    listenersRef.current = {};

    if (!ownedDeviceIds || ownedDeviceIds.length === 0) {
      setDevices({});
      setLoading(false);
      return;
    }

    setLoading(true);
    let loadedCount = 0;
    const total = ownedDeviceIds.length;

    ownedDeviceIds.forEach((deviceId) => {
      const deviceRef = ref(db, `devices/${deviceId}`);
      const unsub = onValue(
        deviceRef,
        (snapshot) => {
          const data = snapshot.val() || {};
          setDevices((prev) => ({
            ...prev,
            [deviceId]: data?.state || {},
          }));
          loadedCount += 1;
          if (loadedCount >= total) {
            setLoading(false);
          }
          setError(null);
        },
        (err) => {
          setError(err?.message || `Failed to read device ${deviceId}`);
          setLoading(false);
        }
      );
      listenersRef.current[deviceId] = () => off(deviceRef, "value", unsub);
    });

    return () => {
      Object.values(listenersRef.current).forEach((unsub) => unsub());
      listenersRef.current = {};
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ownedDeviceIds)]);

  /**
   * Send a command to a specific device via /devices/{deviceId}/command.
   * The ESP32 reads this path and applies the actuator change.
   */
  const FRONTEND_TO_ESP32_KEY = {
    heater: "heaterBulb",
    exhaust: "fan",
    turner: "eggTurner",
    humidifier: "humidifier",
    fan: "fan",
    heaterBulb: "heaterBulb",
    eggTurner: "eggTurner",
  };

  const setActuator = useCallback(async (deviceId, key, value) => {
    const esp32Key = FRONTEND_TO_ESP32_KEY[key] || key;
    const cmdId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cmdRef = ref(db, `devices/${deviceId}/command`);
    await set(cmdRef, { cmdId, [esp32Key]: value });
  }, []);

  /**
   * Send multiple fields in a single command so they are all processed
   * by the ESP32 in one read cycle instead of being overwritten by each other.
   * fields: Record<string, any> — keys use the same frontend naming as setActuator.
   */
  const setBulkActuator = useCallback(async (deviceId, fields) => {
    const cmdId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload = { cmdId };
    for (const [key, value] of Object.entries(fields)) {
      const esp32Key = FRONTEND_TO_ESP32_KEY[key] || key;
      payload[esp32Key] = value;
    }
    const cmdRef = ref(db, `devices/${deviceId}/command`);
    await set(cmdRef, payload);
  }, []);

  /**
   * Returns the state of a specific device (or null if not found).
   */
  const getDeviceState = useCallback(
    (deviceId) => devices[deviceId] || null,
    [devices]
  );

  /**
   * Returns the "primary" device — the first online device with valid readings.
   */
  const primaryDevice = useCallback(() => {
    const entries = Object.entries(devices).filter(
      ([, state]) =>
        state?.mode === "online" &&
        typeof state?.tempC === "number" &&
        state.tempC !== -999
    );
    if (!entries.length) return null;
    entries.sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0));
    const [id, state] = entries[0];
    return { id, ...state };
  }, [devices]);

  return {
    devices,
    loading,
    error,
    setActuator,
    setBulkActuator,
    getDeviceState,
    primaryDevice,
  };
}

