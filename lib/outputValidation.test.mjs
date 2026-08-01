import test from "node:test";
import assert from "node:assert/strict";

import {
  confidenceCalibration,
  reconcileScansWithHatch,
  scoreScanAccuracy,
  validateReadings,
} from "./outputValidation.mjs";

const MIN = 60_000;
const base = new Date("2026-03-01T00:00:00.000Z");
const at = (offsetMs) => new Date(base.getTime() + offsetMs);
const reading = (offsetMs, tempC, humidity) => ({ createdAt: at(offsetMs), tempC, humidity });

// ── scan accuracy ───────────────────────────────────────────────────────────

test("scoreScanAccuracy counts agreements against corrections", () => {
  const result = scoreScanAccuracy([
    { predictedClass: "fertile", finalClass: "fertile" },
    { predictedClass: "fertile", finalClass: "fertile" },
    { predictedClass: "dead", finalClass: "fertile" },
    { predictedClass: "infertile", finalClass: "infertile" },
  ]);

  assert.equal(result.scored, 4);
  assert.equal(result.correct, 3);
  assert.equal(result.corrected, 1);
  assert.equal(result.accuracyPct, 75);
});

test("scans without a recorded prediction are unscored, never assumed correct", () => {
  // Scans predating the correction feature would otherwise inflate accuracy.
  const result = scoreScanAccuracy([
    { layer1_class: "fertile" },
    { predictedClass: "fertile", finalClass: "dead" },
  ]);

  assert.equal(result.total, 2);
  assert.equal(result.unscored, 1);
  assert.equal(result.scored, 1);
  assert.equal(result.accuracyPct, 0);
});

test("scoreScanAccuracy builds a confusion map of predicted against final", () => {
  const result = scoreScanAccuracy([
    { predictedClass: "dead", finalClass: "fertile" },
    { predictedClass: "dead", finalClass: "fertile" },
    { predictedClass: "dead", finalClass: "dead" },
  ]);
  assert.equal(result.confusion.dead.fertile, 2);
  assert.equal(result.confusion.dead.dead, 1);
});

test("scoreScanAccuracy refuses to call a small sample indicative", () => {
  assert.equal(scoreScanAccuracy([{ predictedClass: "a", finalClass: "a" }]).isIndicative, false);
  const many = Array.from({ length: 10 }, () => ({ predictedClass: "a", finalClass: "a" }));
  assert.equal(scoreScanAccuracy(many).isIndicative, true);
});

test("scoreScanAccuracy handles empty input", () => {
  const result = scoreScanAccuracy([]);
  assert.equal(result.accuracyPct, null);
  assert.equal(result.scored, 0);
});

// ── confidence calibration ──────────────────────────────────────────────────

test("confidenceCalibration separates confidence on agreed versus corrected scans", () => {
  const result = confidenceCalibration([
    { predictedClass: "a", finalClass: "a", layer1_confidence: 0.9 },
    { predictedClass: "a", finalClass: "a", layer1_confidence: 0.95 },
    { predictedClass: "a", finalClass: "b", layer1_confidence: 0.55 },
  ]);

  assert.equal(result.agreedAvgConfidence, 0.925);
  assert.equal(result.correctedAvgConfidence, 0.55);
  // A well-calibrated model is less sure about the ones people corrected.
  assert.equal(result.separation, 0.375);
});

test("confidenceCalibration ignores scans lacking a usable confidence value", () => {
  const result = confidenceCalibration([
    { predictedClass: "a", finalClass: "a" },
    { predictedClass: "a", finalClass: "a", layer1_confidence: "high" },
    { predictedClass: "a", finalClass: "a", layer1_confidence: 0.8 },
  ]);
  assert.equal(result.agreedCount, 1);
});

test("confidenceCalibration needs both groups before claiming to be indicative", () => {
  const result = confidenceCalibration([
    { predictedClass: "a", finalClass: "a", layer1_confidence: 0.9 },
  ]);
  assert.equal(result.separation, null);
  assert.equal(result.isIndicative, false);
});

// ── sensor plausibility ─────────────────────────────────────────────────────

test("validateReadings flags the -999 sensor failure sentinel", () => {
  const result = validateReadings([reading(0, -999, -999)]);
  assert.equal(result.issues.length, 2);
  assert.ok(result.issues.every((i) => i.type === "sentinel"));
});

test("validateReadings flags physically impossible values", () => {
  const result = validateReadings([reading(0, 95, 140)]);
  assert.equal(result.byType["out-of-range"], 2);
});

test("validateReadings flags changes too fast to be physical", () => {
  // 20 °C in one minute inside a sealed incubator is a glitch, not weather.
  const result = validateReadings([reading(0, 37, 50), reading(MIN, 17, 50)]);
  assert.equal(result.byType.spike, 1);
});

test("validateReadings does not flag a large change across a logging gap", () => {
  // The logger only runs while the control page is open, so gaps are expected
  // and a jump either side of one is not evidence of a sensor fault.
  const result = validateReadings([reading(0, 37, 50), reading(60 * MIN, 20, 50)]);
  assert.equal(result.byType.spike, undefined);
});

test("validateReadings accepts a normal series without complaint", () => {
  const result = validateReadings([
    reading(0, 37.2, 55),
    reading(MIN, 37.4, 56),
    reading(2 * MIN, 37.3, 55),
  ]);
  assert.equal(result.issues.length, 0);
  assert.equal(result.healthyPct, 100);
  assert.equal(result.checked, 3);
});

test("validateReadings reports healthy percentage per reading, not per issue", () => {
  // One reading with two faults must not count as two unhealthy readings.
  const result = validateReadings([reading(0, -999, -999), reading(MIN, 37, 55)]);
  assert.equal(result.healthyPct, 50);
});

test("validateReadings ignores undated rows and empty input", () => {
  assert.equal(validateReadings([{ tempC: 37 }]).checked, 0);
  assert.equal(validateReadings([]).healthyPct, null);
  assert.equal(validateReadings(null).checked, 0);
});

// ── scan-versus-hatch reconciliation ────────────────────────────────────────

test("reconcileScansWithHatch detects the model having over-culled", () => {
  // The scanner deducts an egg for every dead/infertile call, so 30 culls means
  // 70 were expected viable. 80 hatching proves 10 were culled wrongly.
  const scans = [
    ...Array.from({ length: 30 }, () => ({ finalClass: "dead" })),
    ...Array.from({ length: 10 }, () => ({ finalClass: "fertile" })),
  ];
  const result = reconcileScansWithHatch({ totalEggs: 100, hatchedEggs: 80 }, scans);

  assert.equal(result.culledByScan, 30);
  assert.equal(result.expectedViable, 70);
  assert.equal(result.discrepancy, 10);
  assert.equal(result.verdict, "over-culled");
});

test("reconcileScansWithHatch reports a consistent result", () => {
  const scans = Array.from({ length: 20 }, () => ({ finalClass: "infertile" }));
  const result = reconcileScansWithHatch({ totalEggs: 100, hatchedEggs: 75 }, scans);
  assert.equal(result.verdict, "consistent");
  assert.equal(result.discrepancy, -5);
});

test("reconcileScansWithHatch flags a batch that badly under-performed", () => {
  const result = reconcileScansWithHatch({ totalEggs: 100, hatchedEggs: 10 }, []);
  assert.equal(result.verdict, "under-performed");
});

test("reconcileScansWithHatch falls back to the raw model class when uncorrected", () => {
  const result = reconcileScansWithHatch({ totalEggs: 10, hatchedEggs: 8 }, [
    { layer1_class: "dead" },
  ]);
  assert.equal(result.culledByScan, 1);
});

test("reconcileScansWithHatch is not applicable before a hatch is recorded", () => {
  const result = reconcileScansWithHatch({ totalEggs: 100 }, []);
  assert.equal(result.applicable, false);
});
