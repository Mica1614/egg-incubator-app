// @ts-nocheck
"use client";

import { Bell, BellOff } from "lucide-react";
import { useState } from "react";

/**
 * Minimal notification toggle - just a bell icon that toggles on/off
 * Used in device settings page
 */
export default function NotificationToggle({ enabled = true, onChange, loading = false }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        disabled={loading}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg transition duration-200 disabled:opacity-60 ${
          enabled
            ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-600"
            : "bg-slate-100 hover:bg-slate-200 text-slate-400"
        } ${isHovered ? "ring-2 ring-offset-2 ring-offset-white" : ""} ${
          enabled ? "ring-emerald-200" : "ring-slate-200"
        }`}
        title={enabled ? "Click to mute notifications" : "Click to unmute notifications"}
      >
        {enabled ? (
          <Bell className="h-5 w-5" />
        ) : (
          <BellOff className="h-5 w-5" />
        )}
      </button>
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-medium text-slate-700">
          {enabled ? "Notifications Enabled" : "Notifications Muted"}
        </p>
        <p className="text-[10px] text-slate-500">
          {enabled ? "Receive all alerts" : "All alerts muted"}
        </p>
      </div>
    </div>
  );
}
