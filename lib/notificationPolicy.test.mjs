import test from "node:test";
import assert from "node:assert/strict";

import {
  decideNotification,
  groupNotifications,
  isWithinQuietHours,
  severityOf,
  throttleKey,
  COOLDOWN_MS,
  DEFAULT_SETTINGS,
  SEVERITY,
} from "./notificationPolicy.mjs";

const MIN = 60_000;
const at = (hh, mm = 0) => new Date(2026, 2, 1, hh, mm, 0);

// ── severity ────────────────────────────────────────────────────────────────

test("severity is assigned per type", () => {
  assert.equal(severityOf("device_offline"), SEVERITY.CRITICAL);
  assert.equal(severityOf("temp_abnormal"), SEVERITY.CRITICAL);
  assert.equal(severityOf("heater_on"), SEVERITY.ROUTINE);
  assert.equal(severityOf("device_online"), SEVERITY.WARNING);
});

test("an unclassified type defaults to warning, not routine", () => {
  // Defaulting to routine would silently drop a new alert under the balanced preset.
  assert.equal(severityOf("something_new"), SEVERITY.WARNING);
});

test("throttle key is stable for the same device and type", () => {
  assert.equal(throttleKey("Coop A", "water_low"), throttleKey("Coop A", "water_low"));
  assert.notEqual(throttleKey("Coop A", "water_low"), throttleKey("Coop B", "water_low"));
});

// ── preference gate ─────────────────────────────────────────────────────────

test("an explicit per-type mute blocks even a critical alert", () => {
  const d = decideNotification({
    type: "temp_abnormal",
    deviceKey: "Coop A",
    preferences: { temp_abnormal: false },
  });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "muted-by-preference");
});

test("an absent preference does not block", () => {
  assert.equal(decideNotification({ type: "water_low", deviceKey: "Coop A" }).allowed, true);
});

// ── volume presets ──────────────────────────────────────────────────────────

test("balanced drops routine actuator chatter but keeps warnings", () => {
  const routine = decideNotification({ type: "heater_on", deviceKey: "Coop A" });
  assert.equal(routine.allowed, false);
  assert.equal(routine.reason, "below-volume-threshold");

  assert.equal(decideNotification({ type: "device_online", deviceKey: "Coop A" }).allowed, true);
});

test("the 'all' preset lets routine events through", () => {
  const d = decideNotification({
    type: "heater_on",
    deviceKey: "Coop A",
    settings: { ...DEFAULT_SETTINGS, volume: "all" },
  });
  assert.equal(d.allowed, true);
});

test("'critical only' drops warnings but keeps critical alerts", () => {
  const settings = { ...DEFAULT_SETTINGS, volume: "critical" };
  assert.equal(decideNotification({ type: "device_online", deviceKey: "A", settings }).allowed, false);
  assert.equal(decideNotification({ type: "device_offline", deviceKey: "A", settings }).allowed, true);
});

test("an unknown preset falls back to balanced rather than allowing everything", () => {
  const settings = { ...DEFAULT_SETTINGS, volume: "nonsense" };
  assert.equal(decideNotification({ type: "heater_on", deviceKey: "A", settings }).allowed, false);
});

// ── cooldown ────────────────────────────────────────────────────────────────

test("a repeat inside the cooldown window is suppressed", () => {
  const now = at(12);
  const lastSentAt = now.getTime() - 1 * MIN;
  const d = decideNotification({ type: "water_low", deviceKey: "Coop A", now, lastSentAt });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "cooldown");
});

test("a repeat after the cooldown window is allowed", () => {
  const now = at(12);
  const lastSentAt = now.getTime() - (COOLDOWN_MS[SEVERITY.CRITICAL] + 1000);
  assert.equal(decideNotification({ type: "water_low", deviceKey: "Coop A", now, lastSentAt }).allowed, true);
});

test("cooldown is per device, so two incubators do not mask each other", () => {
  const now = at(12);
  const a = decideNotification({ type: "water_low", deviceKey: "Coop A", now, lastSentAt: now.getTime() });
  const b = decideNotification({ type: "water_low", deviceKey: "Coop B", now, lastSentAt: null });
  assert.equal(a.allowed, false);
  assert.equal(b.allowed, true);
  assert.notEqual(a.key, b.key);
});

test("routine events get a much longer cooldown than critical ones", () => {
  assert.ok(COOLDOWN_MS[SEVERITY.ROUTINE] > COOLDOWN_MS[SEVERITY.CRITICAL]);
});

test("the 'all' preset shortens cooldowns instead of removing them", () => {
  const d = decideNotification({
    type: "heater_on",
    deviceKey: "A",
    settings: { ...DEFAULT_SETTINGS, volume: "all" },
  });
  assert.equal(d.cooldownMs, COOLDOWN_MS[SEVERITY.ROUTINE] * 0.25);
});

test("a null or non-finite lastSentAt is treated as never sent", () => {
  const now = at(12);
  assert.equal(decideNotification({ type: "water_low", deviceKey: "A", now, lastSentAt: null }).allowed, true);
  assert.equal(decideNotification({ type: "water_low", deviceKey: "A", now, lastSentAt: NaN }).allowed, true);
});

// ── quiet hours ─────────────────────────────────────────────────────────────

const QUIET = { ...DEFAULT_SETTINGS, quietHoursEnabled: true, quietStart: "22:00", quietEnd: "06:00" };

test("quiet hours wrap past midnight", () => {
  assert.equal(isWithinQuietHours(at(23), QUIET), true);
  assert.equal(isWithinQuietHours(at(2), QUIET), true);
  assert.equal(isWithinQuietHours(at(5, 59), QUIET), true);
  assert.equal(isWithinQuietHours(at(6), QUIET), false);
  assert.equal(isWithinQuietHours(at(12), QUIET), false);
  assert.equal(isWithinQuietHours(at(21, 59), QUIET), false);
});

test("quiet hours also work without wrapping", () => {
  const daytime = { ...DEFAULT_SETTINGS, quietHoursEnabled: true, quietStart: "09:00", quietEnd: "17:00" };
  assert.equal(isWithinQuietHours(at(10), daytime), true);
  assert.equal(isWithinQuietHours(at(18), daytime), false);
});

test("quiet hours are inactive when disabled or misconfigured", () => {
  assert.equal(isWithinQuietHours(at(23), { ...QUIET, quietHoursEnabled: false }), false);
  assert.equal(isWithinQuietHours(at(23), { ...QUIET, quietStart: "oops" }), false);
  assert.equal(isWithinQuietHours(at(23), { ...QUIET, quietStart: "22:00", quietEnd: "22:00" }), false);
  assert.equal(isWithinQuietHours(at(23), { ...QUIET, quietStart: "25:00" }), false);
});

test("quiet hours suppress warnings", () => {
  const d = decideNotification({ type: "device_online", deviceKey: "A", now: at(23), settings: QUIET });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "quiet-hours");
});

test("quiet hours never suppress a critical alert", () => {
  // A dead incubator at 3am is exactly what the user needs woken for.
  const d = decideNotification({ type: "device_offline", deviceKey: "A", now: at(3), settings: QUIET });
  assert.equal(d.allowed, true);
});

// ── grouping ────────────────────────────────────────────────────────────────

test("groupNotifications collapses repeats per device and type", () => {
  const groups = groupNotifications([
    { type: "heater_on", deviceName: "Coop A", createdAt: at(10) },
    { type: "heater_on", deviceName: "Coop A", createdAt: at(11) },
    { type: "heater_on", deviceName: "Coop B", createdAt: at(12) },
    { type: "water_low", deviceName: "Coop A", createdAt: at(13) },
  ]);

  assert.equal(groups.length, 3);
  assert.equal(groups[0].type, "water_low");

  const coopAHeater = groups.find((g) => g.key === "Coop A:heater_on");
  assert.equal(coopAHeater.count, 2);
  assert.equal(coopAHeater.latestAt.getHours(), 11);
});

test("groupNotifications handles Firestore timestamps and empty input", () => {
  const stamp = { toDate: () => at(9) };
  const groups = groupNotifications([{ type: "water_low", deviceName: "A", createdAt: stamp }]);
  assert.equal(groups[0].latestAt.getHours(), 9);
  assert.deepEqual(groupNotifications([]), []);
  assert.deepEqual(groupNotifications(null), []);
});
