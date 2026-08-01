import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBatchReport,
  computeCoverage,
  formatDuration,
  incubationDaysForType,
  isUsableReading,
  resolveThresholds,
  resolveWindow,
  summariseActuators,
  summariseAlerts,
  summariseEnvironment,
  summariseOutcome,
  summariseScans,
  toDate,
  FALLBACK_THRESHOLDS,
} from "./batchReport.mjs";

const HOUR = 3_600_000;
const DAY = 86_400_000;

const at = (base, offsetMs) => new Date(base.getTime() + offsetMs);
const reading = (createdAt, tempC, humidity, waterLow = false) => ({ createdAt, tempC, humidity, waterLow });
const event = (createdAt, actuator, state) => ({ createdAt, actuator, state });

// ── toDate ──────────────────────────────────────────────────────────────────

test("toDate normalises Firestore timestamps, dates, millis and strings", () => {
  const d = new Date("2026-03-01T00:00:00.000Z");
  assert.deepEqual(toDate({ toDate: () => d }), d);
  assert.deepEqual(toDate(d), d);
  assert.equal(toDate(d.getTime()).getTime(), d.getTime());
  assert.equal(toDate("2026-03-01T00:00:00.000Z").getTime(), d.getTime());
});

test("toDate rejects nullish and unparseable values", () => {
  assert.equal(toDate(null), null);
  assert.equal(toDate(undefined), null);
  assert.equal(toDate(""), null);
  assert.equal(toDate("not a date"), null);
  assert.equal(toDate(new Date("nope")), null);
});

// ── sensor sentinels ────────────────────────────────────────────────────────

test("isUsableReading rejects the -999 sentinel and negatives", () => {
  assert.equal(isUsableReading(37.2), true);
  assert.equal(isUsableReading(0), true);
  assert.equal(isUsableReading(-999), false);
  assert.equal(isUsableReading(-0.5), false);
  assert.equal(isUsableReading(null), false);
  assert.equal(isUsableReading(NaN), false);
  assert.equal(isUsableReading("37"), false);
});

// ── window ──────────────────────────────────────────────────────────────────

test("resolveWindow ends at now for a batch still incubating", () => {
  const start = new Date("2026-03-01T00:00:00.000Z");
  const now = at(start, 5 * DAY);
  const w = resolveWindow({ startDate: start, eggType: "Chicken" }, now);

  assert.equal(w.start.getTime(), start.getTime());
  assert.equal(w.end.getTime(), now.getTime());
  assert.equal(w.windowMs, 5 * DAY);
  assert.equal(w.hatchingDate.getTime(), at(start, 21 * DAY).getTime());
});

test("resolveWindow ends at the hatch date once it has passed", () => {
  const start = new Date("2026-03-01T00:00:00.000Z");
  const now = at(start, 40 * DAY);
  const w = resolveWindow({ startDate: start, eggType: "Quail" }, now);

  assert.equal(w.windowMs, 18 * DAY);
  assert.equal(w.end.getTime(), at(start, 18 * DAY).getTime());
});

test("resolveWindow prefers an explicit hatchingDate over the derived one", () => {
  const start = new Date("2026-03-01T00:00:00.000Z");
  const explicit = at(start, 10 * DAY);
  const w = resolveWindow({ startDate: start, eggType: "Chicken", hatchingDate: explicit }, at(start, 30 * DAY));
  assert.equal(w.end.getTime(), explicit.getTime());
  assert.equal(w.windowMs, 10 * DAY);
});

test("resolveWindow never returns a negative window for a future start date", () => {
  const now = new Date("2026-03-01T00:00:00.000Z");
  const w = resolveWindow({ startDate: at(now, 3 * DAY) }, now);
  assert.equal(w.windowMs, 0);
});

test("resolveWindow returns nulls when the batch has no start date", () => {
  const w = resolveWindow({ eggType: "Chicken" }, new Date());
  assert.equal(w.start, null);
  assert.equal(w.end, null);
  assert.equal(w.windowMs, 0);
});

test("incubationDaysForType covers known types and defaults to chicken", () => {
  assert.equal(incubationDaysForType("Duck"), 28);
  assert.equal(incubationDaysForType("quail"), 18);
  assert.equal(incubationDaysForType("goose"), 30);
  assert.equal(incubationDaysForType("ostrich"), 21);
  assert.equal(incubationDaysForType(undefined), 21);
});

// ── thresholds ──────────────────────────────────────────────────────────────

test("resolveThresholds falls back when the device state is missing", () => {
  assert.deepEqual(resolveThresholds(null), FALLBACK_THRESHOLDS);
});

test("resolveThresholds uses live device values and ignores non-numeric ones", () => {
  const t = resolveThresholds({
    tempTrigger: 37,
    tempStop: 39,
    humidityTrigger: null,
    humidityStop: "65",
  });
  assert.equal(t.tempLow, 37);
  assert.equal(t.tempHigh, 39);
  assert.equal(t.humidityLow, FALLBACK_THRESHOLDS.humidityLow);
  assert.equal(t.humidityHigh, FALLBACK_THRESHOLDS.humidityHigh);
});

// ── environment ─────────────────────────────────────────────────────────────

test("summariseEnvironment excludes sentinels from statistics", () => {
  const base = new Date("2026-03-01T00:00:00.000Z");
  const env = summariseEnvironment(
    [
      reading(at(base, 0), 37.0, 50),
      reading(at(base, HOUR), -999, -999),
      reading(at(base, 2 * HOUR), 38.0, 60),
    ],
    FALLBACK_THRESHOLDS
  );

  assert.equal(env.count, 3);
  assert.equal(env.tempReadings, 2);
  assert.equal(env.temp.min, 37);
  assert.equal(env.temp.max, 38);
  assert.equal(env.temp.avg, 37.5);
  assert.equal(env.humidity.avg, 55);
});

test("summariseEnvironment reports in-range percentage of readings, not of time", () => {
  const base = new Date("2026-03-01T00:00:00.000Z");
  const env = summariseEnvironment(
    [
      reading(at(base, 0), 37.0, 50),
      reading(at(base, HOUR), 42.0, 50),
      reading(at(base, 2 * HOUR), 37.5, 90),
      reading(at(base, 3 * HOUR), 37.5, 50),
    ],
    FALLBACK_THRESHOLDS
  );

  assert.equal(env.tempInRangePct, 75);
  assert.equal(env.humidityInRangePct, 75);
  assert.equal(env.deviations.length, 2);
  assert.deepEqual(
    env.deviations.map((d) => d.kind),
    ["temperature", "humidity"]
  );
});

test("summariseEnvironment honours custom thresholds", () => {
  const base = new Date("2026-03-01T00:00:00.000Z");
  const env = summariseEnvironment([reading(at(base, 0), 39.5, 50)], {
    tempLow: 39,
    tempHigh: 40,
    humidityLow: 40,
    humidityHigh: 65,
  });
  assert.equal(env.tempInRangePct, 100);
});

test("summariseEnvironment counts low-water readings and drops undated rows", () => {
  const base = new Date("2026-03-01T00:00:00.000Z");
  const env = summariseEnvironment(
    [
      reading(at(base, 0), 37, 50, true),
      reading(at(base, HOUR), 37, 50, false),
      { createdAt: null, tempC: 37, humidity: 50 },
    ],
    FALLBACK_THRESHOLDS
  );
  assert.equal(env.count, 2);
  assert.equal(env.waterLowCount, 1);
});

test("summariseEnvironment returns a well-formed empty summary", () => {
  const env = summariseEnvironment([], FALLBACK_THRESHOLDS);
  assert.equal(env.count, 0);
  assert.equal(env.temp.avg, null);
  assert.equal(env.tempInRangePct, null);
  assert.deepEqual(env.series, []);
});

// ── actuators ───────────────────────────────────────────────────────────────

test("summariseActuators pairs each ON with the following OFF", () => {
  const base = new Date("2026-03-01T00:00:00.000Z");
  const end = at(base, 4 * HOUR);
  const summary = summariseActuators(
    [
      event(at(base, 0), "heaterBulb", true),
      event(at(base, HOUR), "heaterBulb", false),
      event(at(base, 2 * HOUR), "heaterBulb", true),
      event(at(base, 3 * HOUR), "heaterBulb", false),
    ],
    end,
    4 * HOUR
  );

  const heater = summary.perActuator.find((a) => a.key === "heaterBulb");
  assert.equal(heater.cycles, 2);
  assert.equal(heater.runtimeMs, 2 * HOUR);
  assert.equal(heater.runtimePct, 50);
});

test("summariseActuators counts a trailing unmatched ON through to window end", () => {
  const base = new Date("2026-03-01T00:00:00.000Z");
  const summary = summariseActuators([event(at(base, 0), "fan", true)], at(base, 2 * HOUR), 2 * HOUR);

  const fan = summary.perActuator.find((a) => a.key === "fan");
  assert.equal(fan.cycles, 1);
  assert.equal(fan.runtimeMs, 2 * HOUR);
  assert.equal(fan.runtimePct, 100);
});

test("summariseActuators ignores a leading OFF with no preceding ON", () => {
  const base = new Date("2026-03-01T00:00:00.000Z");
  const summary = summariseActuators(
    [event(at(base, 0), "humidifier", false), event(at(base, HOUR), "humidifier", true), event(at(base, 2 * HOUR), "humidifier", false)],
    at(base, 3 * HOUR),
    3 * HOUR
  );

  const humidifier = summary.perActuator.find((a) => a.key === "humidifier");
  assert.equal(humidifier.cycles, 1);
  assert.equal(humidifier.runtimeMs, HOUR);
});

test("summariseActuators keeps the first of consecutive ON events", () => {
  const base = new Date("2026-03-01T00:00:00.000Z");
  const summary = summariseActuators(
    [event(at(base, 0), "eggTurner", true), event(at(base, HOUR), "eggTurner", true), event(at(base, 2 * HOUR), "eggTurner", false)],
    at(base, 3 * HOUR),
    3 * HOUR
  );

  const turner = summary.perActuator.find((a) => a.key === "eggTurner");
  assert.equal(turner.cycles, 1);
  assert.equal(turner.runtimeMs, 2 * HOUR);
});

test("summariseActuators sorts unordered events before pairing", () => {
  const base = new Date("2026-03-01T00:00:00.000Z");
  const summary = summariseActuators(
    [event(at(base, 2 * HOUR), "fan", false), event(at(base, 0), "fan", true)],
    at(base, 3 * HOUR),
    3 * HOUR
  );
  const fan = summary.perActuator.find((a) => a.key === "fan");
  assert.equal(fan.runtimeMs, 2 * HOUR);
});

test("summariseActuators returns every actuator at zero for an empty log", () => {
  const summary = summariseActuators([], new Date(), HOUR);
  assert.equal(summary.perActuator.length, 4);
  assert.ok(summary.perActuator.every((a) => a.runtimeMs === 0 && a.cycles === 0));
  assert.equal(summary.totalEvents, 0);
});

test("summariseActuators yields a null runtime percentage for a zero-length window", () => {
  const summary = summariseActuators([], new Date(), 0);
  assert.equal(summary.perActuator[0].runtimePct, null);
});

// ── scans ───────────────────────────────────────────────────────────────────

test("summariseScans groups by candling round with class distribution", () => {
  const base = new Date("2026-03-01T00:00:00.000Z");
  const scans = summariseScans([
    { createdAt: at(base, 0), candlingRound: 1, layer1_class: "fertile", layer1_confidence: 0.9 },
    { createdAt: at(base, HOUR), candlingRound: 1, layer1_class: "infertile", layer1_confidence: 0.7 },
    { createdAt: at(base, 2 * HOUR), candlingRound: 2, layer1_class: "fertile", layer1_confidence: 0.8 },
  ]);

  assert.equal(scans.total, 3);
  assert.deepEqual(scans.classTotals, { fertile: 2, infertile: 1 });
  assert.equal(scans.byRound.length, 2);
  assert.equal(scans.byRound[0].round, 1);
  assert.equal(scans.byRound[0].total, 2);
  assert.equal(scans.byRound[0].avgConfidence, 0.8);
  assert.deepEqual(scans.byRound[0].classes, { fertile: 1, infertile: 1 });
});

test("summariseScans labels missing classes and rounds without dropping the scan", () => {
  const scans = summariseScans([{ createdAt: new Date("2026-03-01T00:00:00.000Z") }]);
  assert.equal(scans.total, 1);
  assert.deepEqual(scans.classTotals, { unknown: 1 });
  assert.equal(scans.byRound[0].round, 0);
  assert.equal(scans.byRound[0].avgConfidence, null);
});

test("summariseScans handles an empty list", () => {
  const scans = summariseScans([]);
  assert.equal(scans.total, 0);
  assert.deepEqual(scans.byRound, []);
});

// ── alerts ──────────────────────────────────────────────────────────────────

test("summariseAlerts groups by type and orders newest first", () => {
  const base = new Date("2026-03-01T00:00:00.000Z");
  const alerts = summariseAlerts([
    { createdAt: at(base, 0), type: "water_low", title: "Water Low" },
    { createdAt: at(base, HOUR), type: "water_low", title: "Water Low" },
    { createdAt: at(base, 2 * HOUR), type: "temp_abnormal", title: "Temp" },
  ]);

  assert.equal(alerts.total, 3);
  assert.deepEqual(alerts.byType, { water_low: 2, temp_abnormal: 1 });
  assert.equal(alerts.items[0].type, "temp_abnormal");
});

test("summariseAlerts drops undated notifications", () => {
  const alerts = summariseAlerts([{ type: "water_low" }]);
  assert.equal(alerts.total, 0);
});

// ── coverage ────────────────────────────────────────────────────────────────

test("computeCoverage divides actual readings by expected", () => {
  const c = computeCoverage(30, HOUR, 60_000);
  assert.equal(c.expectedReadings, 60);
  assert.equal(c.actualReadings, 30);
  assert.equal(c.pct, 50);
});

test("computeCoverage clamps above 100 percent", () => {
  assert.equal(computeCoverage(500, HOUR, 60_000).pct, 100);
});

test("computeCoverage returns null percentage for a zero-length window", () => {
  const c = computeCoverage(0, 0, 60_000);
  assert.equal(c.expectedReadings, 0);
  assert.equal(c.pct, null);
});

test("computeCoverage falls back to the default interval for invalid input", () => {
  assert.equal(computeCoverage(60, HOUR, 0).intervalMs, 60_000);
  assert.equal(computeCoverage(60, HOUR, -5).intervalMs, 60_000);
});

// ── outcome ─────────────────────────────────────────────────────────────────

test("summariseOutcome computes hatch rate and folds in chick inventory", () => {
  const outcome = summariseOutcome(
    { totalEggs: 40, hatchedEggs: 30, deadEggs: 4, infertileEggs: 6 },
    { total_chicks: 30, available_chicks: 25, sold_chicks: 5 }
  );
  assert.equal(outcome.hatchRate, 75);
  assert.equal(outcome.chicksAvailable, 25);
  assert.equal(outcome.chicksSold, 5);
});

test("summariseOutcome sums inventory records written under different id schemes", () => {
  const outcome = summariseOutcome({ totalEggs: 40, hatchedEggs: 30 }, [
    { total_chicks: 20, available_chicks: 15, sold_chicks: 5 },
    { total_chicks: 10, available_chicks: 10, sold_chicks: 0 },
  ]);
  assert.equal(outcome.chicksTotal, 30);
  assert.equal(outcome.chicksAvailable, 25);
  assert.equal(outcome.chicksSold, 5);
});

test("summariseOutcome leaves hatch rate null when no hatch count is recorded", () => {
  const outcome = summariseOutcome({ totalEggs: 40 }, null);
  assert.equal(outcome.hatchedEggs, null);
  assert.equal(outcome.hatchRate, null);
  assert.equal(outcome.chicksTotal, 0);
});

test("summariseOutcome treats an empty inventory list as zero chicks", () => {
  const outcome = summariseOutcome({ totalEggs: 40, hatchedEggs: 10 }, []);
  assert.equal(outcome.chicksTotal, 0);
  assert.equal(outcome.chicksAvailable, 0);
});

test("summariseOutcome leaves hatch rate null when the batch has no eggs", () => {
  assert.equal(summariseOutcome({ totalEggs: 0, hatchedEggs: 0 }, null).hatchRate, null);
});

// ── full model ──────────────────────────────────────────────────────────────

test("buildBatchReport assembles every section", () => {
  const start = new Date("2026-03-01T00:00:00.000Z");
  const now = at(start, 2 * HOUR);

  const report = buildBatchReport({
    batch: {
      batchId: "B-001",
      eggType: "Chicken",
      totalEggs: 40,
      hatchedEggs: 30,
      deadEggs: 4,
      infertileEggs: 6,
      status: "active",
      startDate: start,
      deviceId: "incubator1",
      deviceName: "Coop A",
    },
    docId: "doc123",
    deviceState: { tempTrigger: 36.5, tempStop: 38.5 },
    readings: [reading(at(start, 0), 37, 50), reading(at(start, HOUR), 41, 50)],
    activity: [event(at(start, 0), "heaterBulb", true), event(at(start, HOUR), "heaterBulb", false)],
    scans: [{ createdAt: at(start, 0), candlingRound: 1, layer1_class: "fertile", layer1_confidence: 0.9 }],
    notifications: [{ createdAt: at(start, 0), type: "water_low", title: "Water Low" }],
    inventory: { total_chicks: 30, available_chicks: 30, sold_chicks: 0 },
    intervalMs: 60_000,
    now,
  });

  assert.equal(report.meta.docId, "doc123");
  assert.equal(report.meta.batchId, "B-001");
  assert.equal(report.meta.windowMs, 2 * HOUR);
  assert.equal(report.outcome.hatchRate, 75);
  assert.equal(report.environment.count, 2);
  assert.equal(report.environment.tempInRangePct, 50);
  assert.equal(report.actuators.perActuator.find((a) => a.key === "heaterBulb").runtimeMs, HOUR);
  assert.equal(report.scans.total, 1);
  assert.equal(report.alerts.total, 1);
  assert.equal(report.coverage.expectedReadings, 120);
  assert.equal(report.coverage.pct, 1.7);
  assert.equal(report.generatedAt, now);
});

test("buildBatchReport returns a well-formed model with no data at all", () => {
  const report = buildBatchReport({ batch: { startDate: new Date("2026-03-01T00:00:00.000Z") } });

  assert.equal(report.environment.count, 0);
  assert.equal(report.scans.total, 0);
  assert.equal(report.alerts.total, 0);
  assert.equal(report.outcome.totalEggs, 0);
  assert.equal(report.actuators.perActuator.length, 4);
});

test("buildBatchReport survives a null batch", () => {
  const report = buildBatchReport({ batch: null });
  assert.equal(report.meta.startDate, null);
  assert.equal(report.meta.windowMs, 0);
  assert.equal(report.coverage.pct, null);
});

// ── formatting ──────────────────────────────────────────────────────────────

test("formatDuration renders days, hours and minutes", () => {
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(90_000), "1m");
  assert.equal(formatDuration(2 * HOUR), "2h");
  assert.equal(formatDuration(2 * HOUR + 30 * 60_000), "2h 30m");
  assert.equal(formatDuration(DAY + 3 * HOUR), "1d 3h");
  assert.equal(formatDuration(-5), "0m");
});
