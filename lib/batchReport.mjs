/**
 * lib/batchReport.mjs — Pure batch-report aggregation.
 *
 * No Firebase, no React, no browser APIs. Takes raw documents in, returns the
 * report model out. Every consumer — the report screen, the PDF builder and the
 * Excel builder — renders this one model, so they cannot drift apart.
 *
 * Kept as .mjs so `node --test` can import it directly (the package has no
 * "type": "module", so a .js file would be treated as CommonJS).
 */

// Fallback thresholds — must match lib/deviceMonitor.js
export const FALLBACK_THRESHOLDS = {
  tempLow: 36.5,
  tempHigh: 38.5,
  humidityLow: 40,
  humidityHigh: 65,
};

export const DEFAULT_INTERVAL_MS = 60_000;

const DAY_MS = 86_400_000;

export const ACTUATOR_KEYS = ["heaterBulb", "fan", "humidifier", "eggTurner"];

export const ACTUATOR_LABELS = {
  heaterBulb: "Heater",
  fan: "Fan",
  humidifier: "Humidifier",
  eggTurner: "Egg Turner",
};

const INCUBATION_DAYS = {
  chicken: 21,
  duck: 28,
  quail: 18,
  goose: 30,
  turkey: 28,
};

/** Incubation length for an egg type, defaulting to chicken. */
export function incubationDaysForType(eggType) {
  return INCUBATION_DAYS[String(eggType || "").toLowerCase()] ?? 21;
}

/**
 * Normalise anything date-like to a Date, or null.
 * Handles Firestore Timestamps, Date instances, epoch millis and ISO strings.
 */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * A sensor value is usable only when it is a finite non-negative number.
 * The firmware writes -999 when a sensor read fails; the notification layer
 * also treats any negative reading as an error, and so do we.
 */
export function isUsableReading(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function round(value, places = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function statsFor(values) {
  if (!values.length) return { min: null, max: null, avg: null };
  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min: round(min), max: round(max), avg: round(sum / values.length) };
}

function pct(part, whole) {
  if (!whole) return null;
  return round((part / whole) * 100);
}

/**
 * Resolve the report window for a batch.
 * Starts at the batch start date; ends at the hatch date, or now if the batch
 * is still incubating. Returns nulls when the batch has no usable start date.
 */
export function resolveWindow(batch, now = new Date()) {
  const start = toDate(batch?.startDate);
  if (!start) return { start: null, end: null, windowMs: 0, hatchingDate: null };

  const days = Number(batch?.incubationDays) || incubationDaysForType(batch?.eggType);
  const hatchingDate = toDate(batch?.hatchingDate) ?? new Date(start.getTime() + days * DAY_MS);

  const end = new Date(Math.min(now.getTime(), hatchingDate.getTime()));
  // A start date in the future yields a zero-length window rather than a negative one.
  const windowMs = Math.max(0, end.getTime() - start.getTime());

  return { start, end, windowMs, hatchingDate };
}

/** Merge live device thresholds over the fallbacks, ignoring non-numeric values. */
export function resolveThresholds(deviceState) {
  const pick = (value, fallback) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  return {
    tempLow: pick(deviceState?.tempTrigger, FALLBACK_THRESHOLDS.tempLow),
    tempHigh: pick(deviceState?.tempStop, FALLBACK_THRESHOLDS.tempHigh),
    humidityLow: pick(deviceState?.humidityTrigger, FALLBACK_THRESHOLDS.humidityLow),
    humidityHigh: pick(deviceState?.humidityStop, FALLBACK_THRESHOLDS.humidityHigh),
  };
}

/**
 * Environment statistics over the readings already scoped to the batch window.
 * `deviations` lists readings that fell outside range, for the report's table.
 */
export function summariseEnvironment(readings, thresholds) {
  const rows = (readings ?? [])
    .map((r) => ({ ...r, _at: toDate(r?.createdAt) }))
    .filter((r) => r._at)
    .sort((a, b) => a._at - b._at);

  const temps = [];
  const humidities = [];
  const deviations = [];
  const series = [];
  let tempInRange = 0;
  let humidityInRange = 0;
  let waterLowCount = 0;

  for (const row of rows) {
    const tempOk = isUsableReading(row.tempC);
    const humOk = isUsableReading(row.humidity);

    if (tempOk) {
      temps.push(row.tempC);
      if (row.tempC >= thresholds.tempLow && row.tempC <= thresholds.tempHigh) tempInRange += 1;
      else deviations.push({ at: row._at, kind: "temperature", value: round(row.tempC) });
    }

    if (humOk) {
      humidities.push(row.humidity);
      if (row.humidity >= thresholds.humidityLow && row.humidity <= thresholds.humidityHigh) {
        humidityInRange += 1;
      } else {
        deviations.push({ at: row._at, kind: "humidity", value: round(row.humidity) });
      }
    }

    if (row.waterLow === true) waterLowCount += 1;

    series.push({
      at: row._at,
      temp: tempOk ? round(row.tempC) : null,
      humidity: humOk ? round(row.humidity) : null,
      waterLow: row.waterLow ?? null,
    });
  }

  return {
    count: rows.length,
    temp: statsFor(temps),
    humidity: statsFor(humidities),
    tempReadings: temps.length,
    humidityReadings: humidities.length,
    // Percentage of *recorded readings* in range — not percentage of time.
    // Sampling is interval-based and gappy, so "time" would overstate it.
    tempInRangePct: pct(tempInRange, temps.length),
    humidityInRangePct: pct(humidityInRange, humidities.length),
    waterLowCount,
    thresholds,
    deviations: deviations.sort((a, b) => a.at - b.at),
    series,
  };
}

/**
 * Pair actuator ON events with the following OFF to derive runtime.
 *
 * A trailing ON with no matching OFF counts through to `windowEnd` — the
 * actuator was still running when the window closed. A leading OFF with no
 * preceding ON is ignored: it closes a session that started before the window,
 * and counting it would attribute runtime the batch never saw.
 */
export function summariseActuators(activity, windowEnd, windowMs) {
  const rows = (activity ?? [])
    .map((r) => ({ ...r, _at: toDate(r?.createdAt) }))
    .filter((r) => r._at)
    .sort((a, b) => a._at - b._at);

  const endMs = windowEnd instanceof Date ? windowEnd.getTime() : null;

  const perActuator = ACTUATOR_KEYS.map((key) => {
    const events = rows.filter((r) => r.actuator === key);
    let runtimeMs = 0;
    let cycles = 0;
    let openedAt = null;

    for (const event of events) {
      if (event.state === true) {
        // Consecutive ONs without an OFF: keep the first, it is the real start.
        if (openedAt === null) openedAt = event._at.getTime();
      } else if (event.state === false && openedAt !== null) {
        runtimeMs += Math.max(0, event._at.getTime() - openedAt);
        cycles += 1;
        openedAt = null;
      }
    }

    if (openedAt !== null && endMs !== null) {
      runtimeMs += Math.max(0, endMs - openedAt);
      cycles += 1;
    }

    return {
      key,
      label: ACTUATOR_LABELS[key] ?? key,
      cycles,
      runtimeMs,
      runtimePct: windowMs > 0 ? round((runtimeMs / windowMs) * 100) : null,
      eventCount: events.length,
    };
  });

  return {
    perActuator,
    totalEvents: rows.length,
    events: rows.map((r) => ({
      at: r._at,
      actuator: r.actuator,
      label: r.label || ACTUATOR_LABELS[r.actuator] || r.actuator,
      state: r.state === true,
    })),
  };
}

/** Group candling scans by round, with class distribution and mean confidence. */
export function summariseScans(scans) {
  const rows = (scans ?? [])
    .map((s) => ({ ...s, _at: toDate(s?.createdAt) }))
    .sort((a, b) => (a._at?.getTime() ?? 0) - (b._at?.getTime() ?? 0));

  const classTotals = {};
  const rounds = new Map();

  for (const row of rows) {
    const cls = row.layer1_class || "unknown";
    classTotals[cls] = (classTotals[cls] ?? 0) + 1;

    const roundKey = Number.isFinite(Number(row.candlingRound)) ? Number(row.candlingRound) : 0;
    if (!rounds.has(roundKey)) {
      rounds.set(roundKey, { round: roundKey, total: 0, classes: {}, confidenceSum: 0, confidenceCount: 0 });
    }
    const bucket = rounds.get(roundKey);
    bucket.total += 1;
    bucket.classes[cls] = (bucket.classes[cls] ?? 0) + 1;

    const confidence = Number(row.layer1_confidence);
    if (Number.isFinite(confidence)) {
      bucket.confidenceSum += confidence;
      bucket.confidenceCount += 1;
    }
  }

  const byRound = [...rounds.values()]
    .sort((a, b) => a.round - b.round)
    .map(({ confidenceSum, confidenceCount, ...rest }) => ({
      ...rest,
      avgConfidence: confidenceCount ? round(confidenceSum / confidenceCount, 3) : null,
    }));

  return {
    total: rows.length,
    classTotals,
    byRound,
    items: rows.map((r) => ({
      id: r.id ?? null,
      at: r._at,
      round: Number.isFinite(Number(r.candlingRound)) ? Number(r.candlingRound) : 0,
      layer1Class: r.layer1_class ?? null,
      layer2Class: r.layer2_class ?? null,
      layer1Confidence: Number.isFinite(Number(r.layer1_confidence)) ? Number(r.layer1_confidence) : null,
      // Present only on scans recorded after operator confirmation was added.
      // Left null on older scans so accuracy scoring can exclude them rather
      // than assume the model was right.
      predictedClass: r.predictedClass ?? null,
      finalClass: r.finalClass ?? null,
      wasCorrected: r.wasCorrected === true,
      status: r.status ?? null,
      imageDataUrl: r.imageDataUrl ?? null,
    })),
  };
}

/** Alerts and notifications raised during the window, grouped by type. */
export function summariseAlerts(notifications) {
  const rows = (notifications ?? [])
    .map((n) => ({ ...n, _at: toDate(n?.createdAt) }))
    .filter((n) => n._at)
    .sort((a, b) => b._at - a._at);

  const byType = {};
  for (const row of rows) {
    const type = row.type || "unknown";
    byType[type] = (byType[type] ?? 0) + 1;
  }

  return {
    total: rows.length,
    byType,
    items: rows.map((r) => ({
      id: r.id ?? null,
      at: r._at,
      type: r.type ?? null,
      title: r.title ?? r.text ?? "Notification",
      message: r.message ?? r.description ?? "",
      tone: r.tone ?? "info",
      read: r.read === true,
    })),
  };
}

/**
 * How much of the window actually got logged.
 *
 * Sensor logging runs in a client hook mounted on the device control page, so
 * readings exist only while somebody had that page open. Surfacing this as a
 * number keeps a thin report visibly thin instead of quietly wrong.
 */
export function computeCoverage(actualReadings, windowMs, intervalMs = DEFAULT_INTERVAL_MS) {
  const interval = Number(intervalMs) > 0 ? Number(intervalMs) : DEFAULT_INTERVAL_MS;
  const expected = windowMs > 0 ? Math.floor(windowMs / interval) : 0;
  if (!expected) {
    return { expectedReadings: 0, actualReadings, pct: null, intervalMs: interval };
  }
  return {
    expectedReadings: expected,
    actualReadings,
    pct: round(Math.min(100, (actualReadings / expected) * 100)),
    intervalMs: interval,
  };
}

/**
 * Batch counts and hatch rate, plus chick inventory if the batch produced any.
 *
 * `inventory` is a list because the two batch-history pages write chick_inventory
 * under different document ids for the same batch — `batch_{label}` on the
 * per-device page and `batch_{label}_{timestamp}` on the global one. Records are
 * matched on the `batch_id` field and summed, so both schemes are counted.
 * A single object is accepted too and treated as a one-element list.
 */
export function summariseOutcome(batch, inventory) {
  const totalEggs = Number(batch?.totalEggs) || 0;
  const deadEggs = Number(batch?.deadEggs) || 0;
  const infertileEggs = Number(batch?.infertileEggs) || 0;
  const hatchedEggs = Number.isFinite(Number(batch?.hatchedEggs))
    ? Number(batch.hatchedEggs)
    : null;

  const records = Array.isArray(inventory) ? inventory : inventory ? [inventory] : [];
  const sum = (field) =>
    records.reduce((acc, record) => acc + (Number(record?.[field]) || 0), 0);

  return {
    totalEggs,
    deadEggs,
    infertileEggs,
    hatchedEggs,
    hatchRate: totalEggs > 0 && hatchedEggs !== null ? round((hatchedEggs / totalEggs) * 100) : null,
    chicksTotal: sum("total_chicks"),
    chicksAvailable: sum("available_chicks"),
    chicksSold: sum("sold_chicks"),
  };
}

/**
 * Build the complete report model.
 *
 * `scans` must already be filtered by the batch DOCUMENT id, and `inventory`
 * looked up by the human-readable batch label — the two collections key on
 * different identifiers for the same batch.
 */
export function buildBatchReport({
  batch,
  docId = null,
  deviceId = null,
  deviceName = null,
  deviceState = null,
  readings = [],
  activity = [],
  scans = [],
  notifications = [],
  inventory = null,
  intervalMs = DEFAULT_INTERVAL_MS,
  now = new Date(),
} = {}) {
  const { start, end, windowMs, hatchingDate } = resolveWindow(batch, now);
  const thresholds = resolveThresholds(deviceState);

  const environment = summariseEnvironment(readings, thresholds);
  const actuators = summariseActuators(activity, end, windowMs);

  return {
    meta: {
      docId: docId ?? batch?.id ?? null,
      batchId: batch?.batchId ?? null,
      eggType: batch?.eggType ?? null,
      status: batch?.status ?? null,
      notes: batch?.notes ?? "",
      deviceId: deviceId ?? batch?.deviceId ?? null,
      deviceName: deviceName ?? batch?.deviceName ?? null,
      startDate: start,
      endDate: end,
      hatchingDate,
      incubationDays: Number(batch?.incubationDays) || incubationDaysForType(batch?.eggType),
      windowMs,
    },
    outcome: summariseOutcome(batch, inventory),
    environment,
    actuators,
    scans: summariseScans(scans),
    alerts: summariseAlerts(notifications),
    coverage: computeCoverage(environment.count, windowMs, intervalMs),
    generatedAt: now,
  };
}

/** Human-readable duration, e.g. "3h 12m". */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || !parts.length) parts.push(`${minutes}m`);
  return parts.join(" ");
}
