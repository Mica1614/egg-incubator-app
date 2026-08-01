/**
 * lib/outputValidation.mjs — Validation of what the system reports.
 *
 * Two independent questions, both raised by the client as "validation of system
 * output":
 *
 *   1. Is the candling model right? The scanner previously offered only an
 *      "Accept" button, so a wrong prediction could be accepted or discarded but
 *      never *corrected* — meaning no ground truth was ever recorded and model
 *      accuracy was unmeasurable. Scans now carry predictedClass, finalClass and
 *      a corrected flag; this module scores them.
 *
 *   2. Are the sensors plausible? A DHT sensor that has failed reads -999, but a
 *      partially failed one reads a value that is merely impossible. Range and
 *      rate-of-change checks catch what the sentinel check misses.
 *
 * Pure module — no Firebase, no React.
 */

import { isUsableReading, toDate } from "./batchReport.mjs";

/** Physically plausible bounds inside a closed incubator. */
export const PLAUSIBLE = {
  tempMin: 0,
  tempMax: 60,
  humidityMin: 0,
  humidityMax: 100,
  // A sealed incubator has thermal mass; more than this between consecutive
  // readings means a sensor glitch, not a real excursion.
  maxTempJumpPerMinute: 5,
  maxHumidityJumpPerMinute: 25,
};

/**
 * Model accuracy from scans that recorded both a prediction and a final label.
 *
 * Scans predating the correction feature have no `predictedClass`; they are
 * counted as `unscored` rather than assumed correct, which would inflate accuracy.
 */
export function scoreScanAccuracy(scans) {
  const rows = scans ?? [];
  let scored = 0;
  let correct = 0;
  let unscored = 0;
  const confusion = {};

  for (const scan of rows) {
    const predicted = scan?.predictedClass ?? null;
    const final = scan?.finalClass ?? null;

    if (!predicted || !final) {
      unscored += 1;
      continue;
    }

    scored += 1;
    if (predicted === final) correct += 1;

    if (!confusion[predicted]) confusion[predicted] = {};
    confusion[predicted][final] = (confusion[predicted][final] ?? 0) + 1;
  }

  return {
    total: rows.length,
    scored,
    unscored,
    correct,
    corrected: scored - correct,
    accuracyPct: scored > 0 ? Math.round((correct / scored) * 1000) / 10 : null,
    confusion,
    // One or two corrections tell you nothing; say so rather than printing 50%.
    isIndicative: scored >= 10,
  };
}

/**
 * Mean reported confidence, split by whether the human agreed.
 *
 * A well-calibrated model should be markedly less confident on the scans people
 * corrected. If the two averages are close, its confidence score is not
 * meaningful and should not be shown as if it were.
 */
export function confidenceCalibration(scans) {
  const agreed = [];
  const corrected = [];

  for (const scan of scans ?? []) {
    const confidence = Number(scan?.layer1_confidence ?? scan?.predictedConfidence);
    if (!Number.isFinite(confidence)) continue;
    if (!scan?.predictedClass || !scan?.finalClass) continue;
    (scan.predictedClass === scan.finalClass ? agreed : corrected).push(confidence);
  }

  const avg = (values) =>
    values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000 : null;

  const agreedAvg = avg(agreed);
  const correctedAvg = avg(corrected);

  return {
    agreedCount: agreed.length,
    correctedCount: corrected.length,
    agreedAvgConfidence: agreedAvg,
    correctedAvgConfidence: correctedAvg,
    separation:
      agreedAvg === null || correctedAvg === null
        ? null
        : Math.round((agreedAvg - correctedAvg) * 1000) / 1000,
    isIndicative: agreed.length >= 5 && corrected.length >= 5,
  };
}

/**
 * Flag implausible sensor readings.
 *
 * Returns one issue per suspect reading: `sentinel` for the -999 failure value,
 * `out-of-range` for physically impossible values, and `spike` for changes too
 * fast to be real.
 */
export function validateReadings(readings) {
  const rows = (readings ?? [])
    .map((r) => ({ ...r, _at: toDate(r?.createdAt) }))
    .filter((r) => r._at)
    .sort((a, b) => a._at - b._at);

  const issues = [];
  let previous = null;

  for (const row of rows) {
    const hasTemp = row.tempC !== undefined && row.tempC !== null;
    const hasHumidity = row.humidity !== undefined && row.humidity !== null;

    if (hasTemp && !isUsableReading(row.tempC)) {
      issues.push({
        at: row._at,
        kind: "temperature",
        type: row.tempC === -999 ? "sentinel" : "out-of-range",
        value: row.tempC,
        detail: row.tempC === -999 ? "Sensor reported a read failure" : "Negative temperature",
      });
    } else if (hasTemp && (row.tempC < PLAUSIBLE.tempMin || row.tempC > PLAUSIBLE.tempMax)) {
      issues.push({
        at: row._at,
        kind: "temperature",
        type: "out-of-range",
        value: row.tempC,
        detail: `Outside ${PLAUSIBLE.tempMin}–${PLAUSIBLE.tempMax} °C`,
      });
    }

    if (hasHumidity && !isUsableReading(row.humidity)) {
      issues.push({
        at: row._at,
        kind: "humidity",
        type: row.humidity === -999 ? "sentinel" : "out-of-range",
        value: row.humidity,
        detail: row.humidity === -999 ? "Sensor reported a read failure" : "Negative humidity",
      });
    } else if (hasHumidity && row.humidity > PLAUSIBLE.humidityMax) {
      issues.push({
        at: row._at,
        kind: "humidity",
        type: "out-of-range",
        value: row.humidity,
        detail: `Above ${PLAUSIBLE.humidityMax} %`,
      });
    }

    if (previous) {
      const minutes = (row._at - previous._at) / 60_000;
      // Only compare adjacent samples. Across a logging gap a large change is
      // expected, not a glitch.
      if (minutes > 0 && minutes <= 5) {
        if (isUsableReading(row.tempC) && isUsableReading(previous.tempC)) {
          const rate = Math.abs(row.tempC - previous.tempC) / minutes;
          if (rate > PLAUSIBLE.maxTempJumpPerMinute) {
            issues.push({
              at: row._at,
              kind: "temperature",
              type: "spike",
              value: row.tempC,
              detail: `Changed ${Math.round(rate * 10) / 10} °C/min from ${previous.tempC}`,
            });
          }
        }

        if (isUsableReading(row.humidity) && isUsableReading(previous.humidity)) {
          const rate = Math.abs(row.humidity - previous.humidity) / minutes;
          if (rate > PLAUSIBLE.maxHumidityJumpPerMinute) {
            issues.push({
              at: row._at,
              kind: "humidity",
              type: "spike",
              value: row.humidity,
              detail: `Changed ${Math.round(rate * 10) / 10} %/min from ${previous.humidity}`,
            });
          }
        }
      }
    }

    previous = row;
  }

  const byType = {};
  for (const issue of issues) byType[issue.type] = (byType[issue.type] ?? 0) + 1;

  return {
    checked: rows.length,
    issues,
    byType,
    healthyPct:
      rows.length > 0
        ? Math.round(((rows.length - new Set(issues.map((i) => i.at.getTime())).size) / rows.length) * 1000) / 10
        : null,
  };
}

/**
 * Cross-check the model's candling verdict against what actually hatched.
 *
 * The scanner deducts an egg from the batch on every "dead" or "infertile"
 * call, so those predictions directly change the reported numbers. If far more
 * eggs hatched than the surviving count, the model was over-culling — a
 * discrepancy nothing in the app previously surfaced.
 */
export function reconcileScansWithHatch(batch, scans) {
  const total = Number(batch?.totalEggs) || 0;
  const hatched = Number(batch?.hatchedEggs);
  if (!total || !Number.isFinite(hatched)) {
    return { applicable: false, reason: "Batch has no recorded hatch count yet." };
  }

  const culled = (scans ?? []).filter((s) => {
    const cls = s?.finalClass ?? s?.layer1_class;
    return cls === "dead" || cls === "infertile";
  }).length;

  const expectedViable = Math.max(0, total - culled);
  const discrepancy = hatched - expectedViable;

  return {
    applicable: true,
    totalEggs: total,
    culledByScan: culled,
    expectedViable,
    hatchedEggs: hatched,
    discrepancy,
    // More hatched than the scan said were viable ⇒ eggs were culled wrongly.
    verdict:
      discrepancy > 0
        ? "over-culled"
        : expectedViable > 0 && hatched / expectedViable < 0.5
          ? "under-performed"
          : "consistent",
  };
}
