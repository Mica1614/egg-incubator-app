// @ts-nocheck
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { ref, get } from "firebase/database";
import { db, firestore } from "@/lib/firebase";

/**
 * Manages the current user's owned incubator devices.
 *
 * Reads from Firestore: users/{uid}/devices
 * Verifies device existence against RTDB: /devices/{deviceId}
 *
 * Returns:
 *   ownedDevices   – [{ id, nickname, registeredAt }]
 *   loading        – boolean
 *   error          – string | null
 *   addDevice(deviceId, nickname) – claim a device by ID
 *   removeDevice(deviceId)        – unlink a device
 */
export function useUserDevices(uid) {
  const [ownedDevices, setOwnedDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) {
      setOwnedDevices([]);
      setLoading(false);
      return;
    }

    const colRef = collection(firestore, "users", uid, "devices");
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const devices = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        // Sort by registeredAt ascending
        devices.sort((a, b) => {
          const at = a.registeredAt?.toMillis?.() ?? 0;
          const bt = b.registeredAt?.toMillis?.() ?? 0;
          return at - bt;
        });
        setOwnedDevices(devices);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err?.message || "Failed to load your devices.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  /**
   * Claim a device:
   * 1. Verify /devices/{deviceId} exists in RTDB (ESP32 has registered)
   * 2. Write to Firestore users/{uid}/devices/{deviceId}
   */
  const addDevice = useCallback(
    async (deviceId, nickname = "") => {
      if (!uid) throw new Error("Not authenticated.");
      const trimmedId = (deviceId || "").trim();
      if (!trimmedId) throw new Error("Device ID cannot be empty.");

      // Check if already owned
      const alreadyOwned = ownedDevices.some((d) => d.id === trimmedId);
      if (alreadyOwned) throw new Error("You have already added this device.");

      // Verify device exists in RTDB
      const deviceRef = ref(db, `devices/${trimmedId}`);
      const snap = await get(deviceRef);
      if (!snap.exists()) {
        throw new Error(
          `Device "${trimmedId}" not found. Make sure the ESP32 is powered on and connected to the internet.`
        );
      }

      // Write ownership record to Firestore
      await setDoc(doc(firestore, "users", uid, "devices", trimmedId), {
        nickname: nickname.trim() || trimmedId,
        registeredAt: serverTimestamp(),
      });
    },
    [uid, ownedDevices]
  );

  /**
   * Unlink a device from the user's account.
   * Does NOT delete the device from RTDB (another user might own it).
   */
  const removeDevice = useCallback(
    async (deviceId) => {
      if (!uid) throw new Error("Not authenticated.");
      await deleteDoc(doc(firestore, "users", uid, "devices", deviceId));
    },
    [uid]
  );

  return { ownedDevices, loading, error, addDevice, removeDevice };
}
