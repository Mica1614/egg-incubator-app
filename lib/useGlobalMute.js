// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "notifications_globally_muted";

export function useGlobalMute() {
  const [isMuted, setIsMuted] = useState(false);

  // Read from localStorage on mount
  useEffect(() => {
    try {
      setIsMuted(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // ignore SSR / private-browsing errors
    }
  }, []);

  const toggle = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { isMuted, toggle };
}

/**
 * Read the global mute flag synchronously (for use inside notificationService).
 * Returns true when all toasts should be suppressed.
 */
export function isGloballyMuted() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
