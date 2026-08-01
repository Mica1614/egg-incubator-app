// @ts-nocheck
"use client";

/**
 * lib/usePowerSettings.js — Shared store for actuator wattages and the
 * electricity tariff.
 *
 * Kept in one place so the dedicated power page, the per-batch report and the
 * PDF/Excel exports all price energy the same way. Previously the report
 * hardcoded the defaults, so editing a wattage changed one screen and not the
 * others.
 *
 * localStorage, matching how the notification and logging settings are stored.
 */

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_RATINGS, DEFAULT_TARIFF } from "@/lib/powerEstimate.mjs";

const STORAGE_KEY = "power_settings";

export function readPowerSettings() {
  const fallback = { ratings: { ...DEFAULT_RATINGS }, tariff: DEFAULT_TARIFF };
  if (typeof window === "undefined") return fallback;

  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const tariff = Number(raw?.tariff);
    return {
      ratings: { ...DEFAULT_RATINGS, ...(raw?.ratings ?? {}) },
      tariff: Number.isFinite(tariff) && tariff >= 0 ? tariff : DEFAULT_TARIFF,
    };
  } catch {
    return fallback;
  }
}

export function writePowerSettings(next) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private browsing / quota — settings fall back to defaults
  }
}

export function usePowerSettings() {
  // Lazy initialiser rather than an effect: localStorage is readable on the
  // first client render, and setting state in an effect cascades a re-render.
  const [settings, setSettings] = useState(readPowerSettings);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writePowerSettings(next);
      return next;
    });
  }, []);

  const setRating = useCallback(
    (key, watts) => {
      update({ ratings: { ...readPowerSettings().ratings, [key]: Number(watts) } });
    },
    [update]
  );

  // Keep multiple open tabs consistent — editing a wattage in one should not
  // leave another quietly pricing energy differently.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setSettings(readPowerSettings());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { settings, update, setRating };
}
