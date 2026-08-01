import test from "node:test";
import assert from "node:assert/strict";

import { analyseBatch, environmentVsHatch, summariseBatches } from "./hatchAnalytics.mjs";
import { estimatePower, costPerChick, liveDraw, resolveRatings, DEFAULT_RATINGS } from "./powerEstimate.mjs";

const HOUR = 3_600_000;

// ── analyseBatch ────────────────────────────────────────────────────────────

test("analyseBatch separates fertility, hatch rate and hatch-of-fertile", () => {
  const a = analyseBatch({ totalEggs: 100, infertileEggs: 20, deadEggs: 5, hatchedEggs: 70 });
  assert.equal(a.fertileEggs, 80);
  assert.equal(a.fertilityRate, 80);
  assert.equal(a.hatchRate, 70);
  // 70 of 80 fertile eggs hatched — the number that judges the incubator itself.
  assert.equal(a.hatchOfFertile, 87.5);
});

test("analyseBatch derives dead-in-shell from fertile minus hatched", () => {
  const a = analyseBatch({ totalEggs: 100, infertileEggs: 20, hatchedEggs: 70 });
  assert.equal(a.deadInShell, 10);
  assert.equal(a.deadInShellRate, 12.5);
});

test("analyseBatch returns nulls, not zeros, when no hatch is recorded", () => {
  const a = analyseBatch({ totalEggs: 100, infertileEggs: 20 });
  assert.equal(a.hatchedEggs, null);
  assert.equal(a.hatchRate, null);
  assert.equal(a.hatchOfFertile, null);
  assert.equal(a.deadInShell, null);
  // Fertility is still knowable without a hatch count.
  assert.equal(a.fertilityRate, 80);
});

test("analyseBatch handles a zero-egg batch without dividing by zero", () => {
  const a = analyseBatch({ totalEggs: 0, hatchedEggs: 0 });
  assert.equal(a.fertilityRate, null);
  assert.equal(a.hatchRate, null);
  assert.equal(a.hatchOfFertile, null);
});

test("analyseBatch never reports negative fertile eggs", () => {
  const a = analyseBatch({ totalEggs: 10, infertileEggs: 25, hatchedEggs: 0 });
  assert.equal(a.fertileEggs, 0);
});

test("analyseBatch copes with a null batch", () => {
  const a = analyseBatch(null);
  assert.equal(a.totalEggs, 0);
  assert.equal(a.hatchRate, null);
});

// ── summariseBatches ────────────────────────────────────────────────────────

const BATCHES = [
  { id: "a", batchId: "B-1", eggType: "Chicken", totalEggs: 100, infertileEggs: 10, hatchedEggs: 80 },
  { id: "b", batchId: "B-2", eggType: "Chicken", totalEggs: 100, infertileEggs: 30, hatchedEggs: 50 },
  { id: "c", batchId: "B-3", eggType: "Duck", totalEggs: 50, infertileEggs: 5, hatchedEggs: 40 },
  { id: "d", batchId: "B-4", eggType: "Duck", totalEggs: 40 }, // still incubating
];

test("summariseBatches weights by egg count rather than averaging percentages", () => {
  const s = summariseBatches(BATCHES);
  assert.equal(s.completedCount, 3);
  assert.equal(s.totalCount, 4);
  assert.equal(s.totalSet, 250);
  assert.equal(s.totalHatched, 170);
  assert.equal(s.hatchRate, 68);
  assert.equal(s.totalFertile, 205);
  assert.equal(s.hatchOfFertile, 82.9);
});

test("summariseBatches identifies best and worst completed batches", () => {
  const s = summariseBatches(BATCHES);
  assert.equal(s.best.batchId, "B-1");
  assert.equal(s.worst.batchId, "B-2");
});

test("summariseBatches groups by egg type", () => {
  const s = summariseBatches(BATCHES);
  const chicken = s.byEggType.find((g) => g.eggType === "Chicken");
  const duck = s.byEggType.find((g) => g.eggType === "Duck");
  assert.equal(chicken.batches, 2);
  assert.equal(chicken.hatchRate, 65);
  // The still-incubating duck batch is excluded from the rollup.
  assert.equal(duck.batches, 1);
  assert.equal(duck.hatchRate, 80);
});

test("summariseBatches handles an empty list", () => {
  const s = summariseBatches([]);
  assert.equal(s.completedCount, 0);
  assert.equal(s.hatchRate, null);
  assert.equal(s.best, null);
  assert.deepEqual(s.byEggType, []);
});

// ── environmentVsHatch ──────────────────────────────────────────────────────

test("environmentVsHatch compares well-controlled against poorly-controlled runs", () => {
  const result = environmentVsHatch([
    { batch: { totalEggs: 100, hatchedEggs: 85 }, tempInRangePct: 96, coveragePct: 80 },
    { batch: { totalEggs: 100, hatchedEggs: 90 }, tempInRangePct: 94, coveragePct: 75 },
    { batch: { totalEggs: 100, hatchedEggs: 50 }, tempInRangePct: 60, coveragePct: 70 },
    { batch: { totalEggs: 100, hatchedEggs: 40 }, tempInRangePct: 55, coveragePct: 90 },
  ]);

  assert.equal(result.sampleSize, 4);
  assert.equal(result.goodCount, 2);
  assert.equal(result.poorCount, 2);
  assert.equal(result.goodHatchRate, 87.5);
  assert.equal(result.poorHatchRate, 45);
  assert.equal(result.difference, 42.5);
  assert.equal(result.isIndicative, true);
});

test("environmentVsHatch excludes batches with too little logging coverage", () => {
  const result = environmentVsHatch([
    { batch: { totalEggs: 100, hatchedEggs: 85 }, tempInRangePct: 96, coveragePct: 80 },
    { batch: { totalEggs: 100, hatchedEggs: 20 }, tempInRangePct: 99, coveragePct: 2 },
  ]);
  assert.equal(result.sampleSize, 1);
  assert.equal(result.excluded, 1);
});

test("environmentVsHatch excludes batches with no coverage figure at all", () => {
  const result = environmentVsHatch([
    { batch: { totalEggs: 100, hatchedEggs: 85 }, tempInRangePct: 96, coveragePct: null },
  ]);
  assert.equal(result.sampleSize, 0);
});

test("environmentVsHatch refuses to call a tiny sample indicative", () => {
  const result = environmentVsHatch([
    { batch: { totalEggs: 100, hatchedEggs: 85 }, tempInRangePct: 96, coveragePct: 80 },
    { batch: { totalEggs: 100, hatchedEggs: 45 }, tempInRangePct: 50, coveragePct: 80 },
  ]);
  assert.equal(result.isIndicative, false);
  assert.equal(result.difference, 40);
});

test("environmentVsHatch survives empty input", () => {
  const result = environmentVsHatch([]);
  assert.equal(result.sampleSize, 0);
  assert.equal(result.difference, null);
  assert.equal(result.isIndicative, false);
});

// ── power estimation ────────────────────────────────────────────────────────

test("estimatePower multiplies runtime by rated wattage", () => {
  const result = estimatePower({
    perActuator: [
      { key: "heaterBulb", label: "Heater", runtimeMs: 10 * HOUR, cycles: 20 },
      { key: "fan", label: "Fan", runtimeMs: 24 * HOUR, cycles: 1 },
    ],
    tariff: 12,
  });

  // 60 W for 10 h = 0.6 kWh; 5 W for 24 h = 0.12 kWh
  const heater = result.breakdown.find((r) => r.key === "heaterBulb");
  assert.equal(heater.kwh, 0.6);
  assert.equal(result.totalKwh, 0.72);
  assert.equal(result.totalCost, 8.64);
  assert.equal(result.isEstimate, true);
});

test("estimatePower sorts the breakdown by consumption", () => {
  const result = estimatePower({
    perActuator: [
      { key: "fan", label: "Fan", runtimeMs: HOUR },
      { key: "heaterBulb", label: "Heater", runtimeMs: HOUR },
    ],
  });
  assert.equal(result.breakdown[0].key, "heaterBulb");
});

test("estimatePower projects a full-window figure from logging coverage", () => {
  const result = estimatePower({
    perActuator: [{ key: "heaterBulb", label: "Heater", runtimeMs: 10 * HOUR }],
    coveragePct: 50,
  });
  assert.equal(result.totalKwh, 0.6);
  // Only half the window was logged, so the true figure is around double.
  assert.equal(result.projectedKwh, 1.2);
});

test("estimatePower omits the projection when coverage is unknown or invalid", () => {
  assert.equal(estimatePower({ perActuator: [], coveragePct: null }).projectedKwh, null);
  assert.equal(estimatePower({ perActuator: [], coveragePct: 0 }).projectedKwh, null);
  assert.equal(estimatePower({ perActuator: [], coveragePct: 150 }).projectedKwh, null);
});

test("estimatePower accepts custom ratings and rejects nonsense ones", () => {
  const ratings = resolveRatings({ heaterBulb: 100, fan: -5, humidifier: "abc" });
  assert.equal(ratings.heaterBulb, 100);
  assert.equal(ratings.fan, DEFAULT_RATINGS.fan);
  assert.equal(ratings.humidifier, DEFAULT_RATINGS.humidifier);
});

test("estimatePower falls back to the default tariff for invalid input", () => {
  assert.equal(estimatePower({ perActuator: [], tariff: -3 }).tariff, 12);
  assert.equal(estimatePower({ perActuator: [], tariff: "abc" }).tariff, 12);
});

test("estimatePower handles an empty actuator list", () => {
  const result = estimatePower({ perActuator: [] });
  assert.equal(result.totalKwh, 0);
  assert.equal(result.totalCost, 0);
});

test("liveDraw sums the wattage of whatever is switched on right now", () => {
  const draw = liveDraw({ heaterBulb: true, fan: true, humidifier: false, eggTurner: false });
  assert.equal(draw.watts, DEFAULT_RATINGS.heaterBulb + DEFAULT_RATINGS.fan);
  assert.equal(draw.active.length, 2);
});

test("liveDraw reports zero for an offline device rather than its last state", () => {
  const draw = liveDraw({ heaterBulb: true }, DEFAULT_RATINGS, false);
  assert.equal(draw.watts, 0);
  assert.equal(draw.isOnline, false);
});

test("liveDraw ignores non-boolean and unknown state keys", () => {
  const draw = liveDraw({ heaterBulb: "on", tempC: 37, mode: "online" });
  assert.equal(draw.watts, 0);
});

test("liveDraw honours custom ratings and a null state", () => {
  assert.equal(liveDraw({ heaterBulb: true }, { heaterBulb: 150 }).watts, 150);
  assert.equal(liveDraw(null).watts, 0);
});

test("costPerChick is null until chicks actually hatched", () => {
  assert.equal(costPerChick(100, 20), 5);
  assert.equal(costPerChick(100, 0), null);
  assert.equal(costPerChick(100, null), null);
  assert.equal(costPerChick(null, 20), null);
});
