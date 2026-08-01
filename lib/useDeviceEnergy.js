// @ts-nocheck
"use client";

/**
 * lib/useDeviceEnergy.js — Energy history for a single device.
 *
 * Shared by the device dashboard card and the device power page so both report
 * the same figures. Runtime is derived with summariseActuators from
 * batchReport.mjs rather than a second implementation.
 */

import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, Timestamp, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { summariseActuators } from "@/lib/batchReport.mjs";
import { estimatePower } from "@/lib/powerEstimate.mjs";
import { usePowerSettings } from "@/lib/usePowerSettings";

/**
 * @param deviceId  device whose activityLog to read
 * @param enabled   hold off until the caller has confirmed ownership
 * @param sinceDays optional window; omit for all recorded history
 */
export function useDeviceEnergy(deviceId, enabled = true, sinceDays = null) {
  const { settings } = usePowerSettings();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!deviceId || !enabled) return;
    setLoading(true);
    setError("");

    try {
      const base = collection(firestore, "devices", deviceId, "activityLog");
      const q = sinceDays
        ? query(
            base,
            where("createdAt", ">=", Timestamp.fromDate(new Date(Date.now() - sinceDays * 86_400_000))),
            orderBy("createdAt", "asc")
          )
        : query(base, orderBy("createdAt", "asc"));

      const snap = await getDocs(q);
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.warn("[useDeviceEnergy] load failed:", e.message);
      setError(e?.message || "Failed to load actuator history.");
    } finally {
      setLoading(false);
    }
  }, [deviceId, enabled, sinceDays]);

  useEffect(() => {
    load();
  }, [load]);

  const dates = events.map((e) => e.createdAt?.toDate?.() ?? null).filter(Boolean).sort((a, b) => a - b);
  const firstEvent = dates[0] ?? null;
  const end = new Date();
  const windowMs = firstEvent ? Math.max(0, end.getTime() - firstEvent.getTime()) : 0;

  const summary = summariseActuators(events, end, windowMs);
  const energy = estimatePower({
    perActuator: summary.perActuator,
    ratings: settings.ratings,
    tariff: settings.tariff,
  });

  return { energy, summary, events, firstEvent, windowMs, loading, error, reload: load, settings };
}
