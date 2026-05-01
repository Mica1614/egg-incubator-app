// @ts-nocheck
"use client";

import { useEffect, useState, useCallback } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { NOTIFICATION_TYPES } from "@/lib/notificationService";

/**
 * Default notification preferences - all enabled by default
 */
const DEFAULT_PREFERENCES = {
  [NOTIFICATION_TYPES.WATER_LOW]: true,
  [NOTIFICATION_TYPES.WATER_OK]: true,
  [NOTIFICATION_TYPES.EGG_TURNER_ON]: true,
  [NOTIFICATION_TYPES.EGG_TURNER_OFF]: true,
  [NOTIFICATION_TYPES.FAN_ON]: true,
  [NOTIFICATION_TYPES.FAN_OFF]: true,
  [NOTIFICATION_TYPES.HUMIDIFIER_ON]: true,
  [NOTIFICATION_TYPES.HUMIDIFIER_OFF]: true,
  [NOTIFICATION_TYPES.TEMP_ABNORMAL]: true,
  [NOTIFICATION_TYPES.TEMP_NORMAL]: true,
  [NOTIFICATION_TYPES.HUMIDITY_ABNORMAL]: true,
  [NOTIFICATION_TYPES.HUMIDITY_NORMAL]: true,
};

/**
 * Hook to manage notification preferences per device
 * Stores preferences in Firestore: users/{uid}/devices/{deviceId}/notificationPreferences
 */
export function useNotificationPreferences(uid, deviceId) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch preferences from Firestore
  useEffect(() => {
    if (!uid || !deviceId) {
      console.log(`[useNotificationPreferences] Skipping fetch: uid=${!!uid}, deviceId=${!!deviceId}`);
      setLoading(false);
      return;
    }

    const fetchPreferences = async () => {
      try {
        console.log(`[useNotificationPreferences] Fetching for uid=${uid}, deviceId=${deviceId}`);
        const docRef = doc(
          firestore,
          "users",
          uid,
          "devices",
          deviceId,
          "notificationPreferences",
          "settings"
        );
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          console.log(`[useNotificationPreferences] Found preferences:`, docSnap.data());
          setPreferences({ ...DEFAULT_PREFERENCES, ...docSnap.data() });
        } else {
          console.log(`[useNotificationPreferences] No preferences found, using defaults`);
          setPreferences(DEFAULT_PREFERENCES);
        }
        setError(null);
      } catch (err) {
        console.error("[useNotificationPreferences] Error fetching:", err);
        setError(err?.message || "Failed to load preferences");
        setPreferences(DEFAULT_PREFERENCES);
      } finally {
        setLoading(false);
      }
    };

    fetchPreferences();
  }, [uid, deviceId]);

  // Update a single preference
  const updatePreference = useCallback(
    async (notificationType, enabled) => {
      if (!uid || !deviceId) return;

      // Update local state immediately (optimistic)
      setPreferences((prev) => ({
        ...prev,
        [notificationType]: enabled,
      }));

      // Save to Firestore
      try {
        const docRef = doc(
          firestore,
          "users",
          uid,
          "devices",
          deviceId,
          "notificationPreferences",
          "settings"
        );
        await setDoc(
          docRef,
          {
            [notificationType]: enabled,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        console.error("Failed to update notification preference:", err);
        setError(err?.message || "Failed to save preference");
        // Revert optimistic update on error
        setPreferences((prev) => ({
          ...prev,
          [notificationType]: !enabled,
        }));
      }
    },
    [uid, deviceId]
  );

  // Update all preferences at once
  const updateAllPreferences = useCallback(
    async (newPreferences) => {
      if (!uid || !deviceId) return;

      setPreferences(newPreferences);

      try {
        const docRef = doc(
          firestore,
          "users",
          uid,
          "devices",
          deviceId,
          "notificationPreferences",
          "settings"
        );
        await setDoc(docRef, {
          ...newPreferences,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Failed to update notification preferences:", err);
        setError(err?.message || "Failed to save preferences");
        setPreferences(DEFAULT_PREFERENCES);
      }
    },
    [uid, deviceId]
  );

  return {
    preferences,
    loading,
    error,
    updatePreference,
    updateAllPreferences,
  };
}
