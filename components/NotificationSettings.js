// @ts-nocheck
"use client";

import { Bell, BellOff, Droplet, RotateCcw, Wind, CloudRain, Thermometer, Heater, Moon, Volume2 } from "lucide-react";
import { NOTIFICATION_TYPES } from "@/lib/notificationService";
import { COOLDOWN_MS, VOLUME_PRESETS, severityOf, SEVERITY } from "@/lib/notificationPolicy.mjs";
import { useNotificationSettings } from "@/lib/notificationSettings";

const SEVERITY_BADGE = {
  [SEVERITY.CRITICAL]: { label: "Critical", className: "bg-rose-50 text-rose-600 ring-rose-100" },
  [SEVERITY.WARNING]: { label: "Warning", className: "bg-amber-50 text-amber-600 ring-amber-100" },
  [SEVERITY.ROUTINE]: { label: "Routine", className: "bg-slate-100 text-slate-500 ring-slate-200" },
};

const iconMap = {
  [NOTIFICATION_TYPES.WATER_LOW]: Droplet,
  [NOTIFICATION_TYPES.WATER_OK]: Droplet,
  [NOTIFICATION_TYPES.HEATER_ON]: Heater,
  [NOTIFICATION_TYPES.HEATER_OFF]: Heater,
  [NOTIFICATION_TYPES.EGG_TURNER_ON]: RotateCcw,
  [NOTIFICATION_TYPES.EGG_TURNER_OFF]: RotateCcw,
  [NOTIFICATION_TYPES.FAN_ON]: Wind,
  [NOTIFICATION_TYPES.FAN_OFF]: Wind,
  [NOTIFICATION_TYPES.HUMIDIFIER_ON]: CloudRain,
  [NOTIFICATION_TYPES.HUMIDIFIER_OFF]: CloudRain,
  [NOTIFICATION_TYPES.TEMP_ABNORMAL]: Thermometer,
  [NOTIFICATION_TYPES.TEMP_NORMAL]: Thermometer,
  [NOTIFICATION_TYPES.HUMIDITY_ABNORMAL]: CloudRain,
  [NOTIFICATION_TYPES.HUMIDITY_NORMAL]: CloudRain,
};

/**
 * Notification settings UI component
 * Displays toggles for each notification type with uniform styling
 */
export default function NotificationSettings({ preferences, onToggle, loading }) {
  const { settings, update } = useNotificationSettings();

  const notificationGroups = [
    {
      label: "Device Status",
      items: [
        { type: NOTIFICATION_TYPES.WATER_LOW, label: "Water Level Low" },
        { type: NOTIFICATION_TYPES.WATER_OK, label: "Water Level Normal" },
      ],
    },
    {
      label: "Heater",
      items: [
        { type: NOTIFICATION_TYPES.HEATER_ON, label: "Heater Started" },
        { type: NOTIFICATION_TYPES.HEATER_OFF, label: "Heater Stopped" },
      ],
    },
    {
      label: "Egg Turner",
      items: [
        { type: NOTIFICATION_TYPES.EGG_TURNER_ON, label: "Turner Started" },
        { type: NOTIFICATION_TYPES.EGG_TURNER_OFF, label: "Turner Stopped" },
      ],
    },
    {
      label: "Fan",
      items: [
        { type: NOTIFICATION_TYPES.FAN_ON, label: "Fan Started" },
        { type: NOTIFICATION_TYPES.FAN_OFF, label: "Fan Stopped" },
      ],
    },
    {
      label: "Humidifier",
      items: [
        { type: NOTIFICATION_TYPES.HUMIDIFIER_ON, label: "Humidifier Started" },
        { type: NOTIFICATION_TYPES.HUMIDIFIER_OFF, label: "Humidifier Stopped" },
      ],
    },
    {
      label: "Environmental Alerts",
      items: [
        { type: NOTIFICATION_TYPES.TEMP_ABNORMAL, label: "Temperature Warning" },
        { type: NOTIFICATION_TYPES.TEMP_NORMAL, label: "Temperature Normal" },
        { type: NOTIFICATION_TYPES.HUMIDITY_ABNORMAL, label: "Humidity Warning" },
        { type: NOTIFICATION_TYPES.HUMIDITY_NORMAL, label: "Humidity Normal" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Notification Alerts</h3>
        <p className="text-xs text-slate-500 mb-6">
          Choose how much you want to hear, then fine-tune individual events below.
        </p>
      </div>

      {/* ── Volume preset ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
        <div className="mb-3 flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-slate-400" />
          <h4 className="text-xs font-medium uppercase tracking-wider text-slate-500">Notification Volume</h4>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(VOLUME_PRESETS).map(([value, preset]) => {
            const active = settings.volume === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => update({ volume: value })}
                className={`rounded-xl px-3 py-2.5 text-xs font-semibold ring-1 transition ${
                  active
                    ? "bg-[#004a87] text-white ring-[#004a87]"
                    : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          {settings.volume === "all"
            ? "Every event, including routine heater and humidifier cycling. Expect a lot of notifications."
            : settings.volume === "critical"
              ? "Only problems that need action: device offline, abnormal temperature or humidity, low water."
              : "Problems and status changes, but no routine actuator cycling. Recommended."}
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          Repeats of the same alert for the same device are held back for{" "}
          {Math.round(COOLDOWN_MS[SEVERITY.CRITICAL] / 60000)}–
          {Math.round(COOLDOWN_MS[SEVERITY.ROUTINE] / 60000)} minutes depending on severity.
        </p>
      </div>

      {/* ── Quiet hours ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-slate-400" />
            <h4 className="text-xs font-medium uppercase tracking-wider text-slate-500">Quiet Hours</h4>
          </div>
          <button
            type="button"
            onClick={() => update({ quietHoursEnabled: !settings.quietHoursEnabled })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full ring-1 transition-colors duration-200 ${
              settings.quietHoursEnabled ? "bg-emerald-500 ring-emerald-200" : "bg-slate-300 ring-slate-200"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
                settings.quietHoursEnabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-[11px] font-medium text-slate-500">
            From{" "}
            <input
              type="time"
              value={settings.quietStart}
              onChange={(e) => update({ quietStart: e.target.value })}
              disabled={!settings.quietHoursEnabled}
              className="ml-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800 disabled:opacity-50"
            />
          </label>
          <label className="text-[11px] font-medium text-slate-500">
            To{" "}
            <input
              type="time"
              value={settings.quietEnd}
              onChange={(e) => update({ quietEnd: e.target.value })}
              disabled={!settings.quietHoursEnabled}
              className="ml-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800 disabled:opacity-50"
            />
          </label>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Critical alerts still come through during quiet hours — a device going offline overnight is
          exactly what you need to know about.
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
              const IconComp = iconMap[item.type];
              return (
                <div
                  key={item.type}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-slate-100"
                >
                  <div className="flex items-center gap-3">
                    {IconComp && <IconComp className="h-4 w-4 text-slate-500" />}
                    <span className="text-sm font-medium text-slate-700">{item.label}</span>
                    {(() => {
                      const badge = SEVERITY_BADGE[severityOf(item.type)];
                      return (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${badge.className}`}
                          title="Severity decides cooldown length and whether quiet hours apply"
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                  </div>
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
        <p className="text-xs leading-relaxed text-blue-700">
          <strong>Note:</strong> routine actuator events are off by default — in auto mode the heater
          and humidifier cycle every few minutes, which was the main source of notification noise.
          Turning one back on here overrides that, but the volume preset above still applies.
        </p>
      </div>
    </div>
  );
}
