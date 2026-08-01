// @ts-nocheck
"use client";

/**
 * lib/notificationSettings.js — Browser-side storage for notification volume
 * settings and the shared "last sent" ledger.
 *
 * The ledger lives in localStorage rather than component state on purpose: the
 * dashboard and the device control page both mount useDeviceNotifications, and
 * in-memory throttling would let each mount fire its own copy of every alert.
 * A shared key means whichever mount fires first claims the cooldown.
 *
 * Matches the storage approach already used by useGlobalMute.
 */

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS } from "@/lib/notificationPolicy.mjs";

const SETTINGS_KEY = "notification_settings";
const LEDGER_KEY = "notification_last_sent";

/** Entries older than this are pruned so the ledger cannot grow without bound. */
const LEDGER_TTL_MS = 24 * 60 * 60 * 1000;

export function readSettings() {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(next) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...next }));
  } catch {
    // private browsing / quota — settings simply fall back to defaults
  }
}

function readLedger() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LEDGER_KEY) || "{}") ?? {};
  } catch {
    return {};
  }
}

/** Epoch ms this (device, type) pair last fired, or null. */
export function readLastSent(key) {
  const value = readLedger()[key];
  return Number.isFinite(value) ? value : null;
}

/** Record a send, pruning stale entries in the same pass. */
export function recordSent(key, at = Date.now()) {
  if (typeof window === "undefined") return;
  try {
    const ledger = readLedger();
    const cutoff = at - LEDGER_TTL_MS;
    const pruned = {};
    for (const [entryKey, value] of Object.entries(ledger)) {
      if (Number.isFinite(value) && value >= cutoff) pruned[entryKey] = value;
    }
    pruned[key] = at;
    localStorage.setItem(LEDGER_KEY, JSON.stringify(pruned));
  } catch {
    // ignore
  }
}

/** Clear all cooldowns — used by the "test notification" path in settings. */
export function clearLedger() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEDGER_KEY);
  } catch {
    // ignore
  }
}

/** React binding for the settings object. */
export function useNotificationSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(readSettings());
  }, []);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeSettings(next);
      return next;
    });
  }, []);

  return { settings, update };
}
