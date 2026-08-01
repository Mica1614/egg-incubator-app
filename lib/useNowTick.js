// @ts-nocheck
"use client";

/**
 * lib/useNowTick.js — A timestamp that advances on an interval.
 *
 * Online status is `lastSeen` compared against the current time, but RTDB fires
 * no event when a device goes silent — that is the whole reason a device going
 * offline is invisible. Reading Date.now() during render does not fix it either:
 * the value only refreshes when something else happens to re-render, so the
 * badge can sit on "Online" indefinitely after the device has stopped talking.
 *
 * Ticking state solves both: the component re-renders on its own schedule, and
 * render itself stays pure.
 */

import { useEffect, useState } from "react";

export function useNowTick(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

/** Shared online rule: mode is online and lastSeen is recent enough. */
export function isDeviceOnline(state, now, staleMs = 15000) {
  if (state?.mode !== "online") return false;
  const lastSeen = typeof state?.lastSeen === "number" ? state.lastSeen : 0;
  // A device that has never reported lastSeen is treated as online until it
  // proves otherwise — matching how useDeviceNotifications decides.
  if (lastSeen === 0) return true;
  return now - lastSeen < staleMs;
}
