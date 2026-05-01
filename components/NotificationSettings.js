// @ts-nocheck
"use client";

import { Bell, BellOff } from "lucide-react";
import { NOTIFICATION_TYPES } from "@/lib/notificationService";

/**
 * Notification settings UI component
 * Displays toggles for each notification type with uniform styling
 */
export default function NotificationSettings({ preferences, onToggle, loading }) {
  const notificationGroups = [
    {
      label: "Device Status",
      items: [
        { type: NOTIFICATION_TYPES.WATER_LOW, label: "🌊 Water Level Low" },
        { type: NOTIFICATION_TYPES.WATER_OK, label: "✓ Water Level Normal" },
      ],
    },
    {
      label: "Egg Turner",
      items: [
        { type: NOTIFICATION_TYPES.EGG_TURNER_ON, label: "🔄 Turner Started" },
        { type: NOTIFICATION_TYPES.EGG_TURNER_OFF, label: "⏹ Turner Stopped" },
      ],
    },
    {
      label: "Fan",
      items: [
        { type: NOTIFICATION_TYPES.FAN_ON, label: "💨 Fan Started" },
        { type: NOTIFICATION_TYPES.FAN_OFF, label: "⏹ Fan Stopped" },
      ],
    },
    {
      label: "Humidifier",
      items: [
        { type: NOTIFICATION_TYPES.HUMIDIFIER_ON, label: "💧 Humidifier Started" },
        { type: NOTIFICATION_TYPES.HUMIDIFIER_OFF, label: "⏹ Humidifier Stopped" },
      ],
    },
    {
      label: "Environmental Alerts",
      items: [
        { type: NOTIFICATION_TYPES.TEMP_ABNORMAL, label: "🌡 Temperature Warning" },
        { type: NOTIFICATION_TYPES.TEMP_NORMAL, label: "✓ Temperature Normal" },
        { type: NOTIFICATION_TYPES.HUMIDITY_ABNORMAL, label: "💧 Humidity Warning" },
        { type: NOTIFICATION_TYPES.HUMIDITY_NORMAL, label: "✓ Humidity Normal" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Notification Alerts</h3>
        <p className="text-xs text-slate-500 mb-6">
          Toggle notifications on/off for each event type. Use the toggle icon to mute/unmute.
        </p>
      </div>

      {notificationGroups.map((group) => (
        <div key={group.label} className="space-y-3">
          <h4 className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {group.label}
          </h4>
          <div className="space-y-2">
            {group.items.map((item) => {
              const isEnabled = preferences[item.type] !== false;
              return (
                <div
                  key={item.type}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-slate-100"
                >
                  <span className="text-sm font-medium text-slate-700">{item.label}</span>
                  <button
                    type="button"
                    onClick={() => onToggle(item.type, !isEnabled)}
                    disabled={loading}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ring-1 ring-slate-200 disabled:opacity-60 ${
                      isEnabled
                        ? "bg-emerald-500 ring-emerald-200"
                        : "bg-slate-300 ring-slate-200"
                    }`}
                    title={isEnabled ? "Click to mute" : "Click to unmute"}
                  >
                    <span
                      className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white text-xs transition-transform duration-200 ${
                        isEnabled ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    >
                      {isEnabled ? (
                        <Bell className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <BellOff className="h-3 w-3 text-slate-400" />
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
        <p className="text-xs text-blue-700">
          💡 <strong>Tip:</strong> Disable notifications for routine events (on/off) and keep
          warnings enabled for abnormal conditions.
        </p>
      </div>
    </div>
  );
}
