/**
 * lib/notificationPolicy.mjs — Pure notification admission control.
 *
 * The app previously fired a toast, a browser push AND a Firestore write for
 * every single state change. In auto mode the heater and humidifier cycle every
 * few minutes, so a running incubator generated a constant stream of "Heater ON
 * / Heater OFF" notifications. Two pages (dashboard and device control) also
 * mount the notification hook, so an open pair of tabs doubled everything.
 *
 * This module decides whether a given notification is allowed through. It is
 * pure — no storage, no clock, no React — so every rule is directly testable.
 */

/** How loud a notification is. Drives cooldown length and quiet-hours handling. */
export const SEVERITY = {
  CRITICAL: "critical",
  WARNING: "warning",
  ROUTINE: "routine",
};

/**
 * Severity per notification type.
 * Anything absent is treated as WARNING — a new type is noisy until classified,
 * never silently dropped.
 */
export const TYPE_SEVERITY = {
  device_offline: SEVERITY.CRITICAL,
  temp_abnormal: SEVERITY.CRITICAL,
  humidity_abnormal: SEVERITY.CRITICAL,
  water_low: SEVERITY.CRITICAL,

  device_online: SEVERITY.WARNING,
  temp_normal: SEVERITY.WARNING,
  humidity_normal: SEVERITY.WARNING,
  water_ok: SEVERITY.WARNING,
  email_limit: SEVERITY.WARNING,
  email_auth_throttle: SEVERITY.WARNING,

  heater_on: SEVERITY.ROUTINE,
  heater_off: SEVERITY.ROUTINE,
  fan_on: SEVERITY.ROUTINE,
  fan_off: SEVERITY.ROUTINE,
  humidifier_on: SEVERITY.ROUTINE,
  humidifier_off: SEVERITY.ROUTINE,
  egg_turner_on: SEVERITY.ROUTINE,
  egg_turner_off: SEVERITY.ROUTINE,
};

/** Minimum gap between two notifications of the same type for the same device. */
export const COOLDOWN_MS = {
  [SEVERITY.CRITICAL]: 5 * 60_000,
  [SEVERITY.WARNING]: 15 * 60_000,
  [SEVERITY.ROUTINE]: 60 * 60_000,
};

/**
 * Volume presets. `minSeverity` is the quietest level still allowed through.
 * "balanced" is the default: routine actuator chatter is dropped, everything
 * that indicates a problem still arrives.
 */
export const VOLUME_PRESETS = {
  all: { label: "Everything", minSeverity: SEVERITY.ROUTINE, cooldownScale: 0.25 },
  balanced: { label: "Balanced", minSeverity: SEVERITY.WARNING, cooldownScale: 1 },
  critical: { label: "Critical only", minSeverity: SEVERITY.CRITICAL, cooldownScale: 1 },
};

const SEVERITY_RANK = {
  [SEVERITY.ROUTINE]: 0,
  [SEVERITY.WARNING]: 1,
  [SEVERITY.CRITICAL]: 2,
};

export const DEFAULT_SETTINGS = {
  volume: "balanced",
  quietHoursEnabled: false,
  quietStart: "22:00",
  quietEnd: "06:00",
};

/** Severity for a type, defaulting to WARNING for anything unclassified. */
export function severityOf(type) {
  return TYPE_SEVERITY[type] ?? SEVERITY.WARNING;
}

/** Stable dedupe key. Two mounts of the same hook produce the same key. */
export function throttleKey(deviceKey, type) {
  return `${deviceKey ?? "unknown"}:${type}`;
}

function parseHhMm(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Quiet hours may wrap past midnight (22:00 → 06:00), so the comparison is
 * inclusive-or rather than a plain range check when start > end.
 */
export function isWithinQuietHours(now, settings) {
  if (!settings?.quietHoursEnabled) return false;

  const start = parseHhMm(settings.quietStart);
  const end = parseHhMm(settings.quietEnd);
  if (start === null || end === null || start === end) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/**
 * Decide whether one notification may be delivered.
 *
 * @param type          notification type id
 * @param deviceKey     stable device identifier, for per-device throttling
 * @param now           Date
 * @param lastSentAt    epoch ms this (device, type) pair last fired, or null
 * @param preferences   per-type user toggles; an explicit `false` always wins
 * @param settings      volume preset and quiet hours
 * @returns { allowed, reason, severity, key, cooldownMs }
 */
export function decideNotification({
  type,
  deviceKey,
  now = new Date(),
  lastSentAt = null,
  preferences = {},
  settings = DEFAULT_SETTINGS,
} = {}) {
  const severity = severityOf(type);
  const key = throttleKey(deviceKey, type);
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const preset = VOLUME_PRESETS[merged.volume] ?? VOLUME_PRESETS.balanced;
  const cooldownMs = Math.round((COOLDOWN_MS[severity] ?? COOLDOWN_MS[SEVERITY.WARNING]) * preset.cooldownScale);

  const deny = (reason) => ({ allowed: false, reason, severity, key, cooldownMs });

  // An explicit per-type opt-out beats everything, including critical severity.
  if (preferences[type] === false) return deny("muted-by-preference");

  if (SEVERITY_RANK[severity] < SEVERITY_RANK[preset.minSeverity]) {
    return deny("below-volume-threshold");
  }

  // Quiet hours never suppress critical alerts — a dead incubator at 3am is
  // exactly what the user needs to hear about.
  if (severity !== SEVERITY.CRITICAL && isWithinQuietHours(now, merged)) {
    return deny("quiet-hours");
  }

  if (lastSentAt !== null && Number.isFinite(lastSentAt)) {
    if (now.getTime() - lastSentAt < cooldownMs) return deny("cooldown");
  }

  return { allowed: true, reason: "allowed", severity, key, cooldownMs };
}

/**
 * Collapse a list of notification records into per-type counts, newest first.
 * Used by the notification list to show "Heater ON ×14" instead of 14 rows.
 */
export function groupNotifications(items) {
  const groups = new Map();

  for (const item of items ?? []) {
    const at = item?.createdAt instanceof Date ? item.createdAt : item?.createdAt?.toDate?.() ?? null;
    const groupKey = `${item?.deviceName ?? ""}:${item?.type ?? "unknown"}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { key: groupKey, type: item?.type ?? "unknown", latest: item, count: 0, latestAt: at });
    }

    const group = groups.get(groupKey);
    group.count += 1;
    if (at && (!group.latestAt || at > group.latestAt)) {
      group.latest = item;
      group.latestAt = at;
    }
  }

  return [...groups.values()].sort((a, b) => (b.latestAt?.getTime() ?? 0) - (a.latestAt?.getTime() ?? 0));
}
