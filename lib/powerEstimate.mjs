/**
 * lib/powerEstimate.mjs — Energy estimation from actuator runtime.
 *
 * The incubator firmware reports no current or power figure — the RTDB device
 * state carries only temperature, humidity, water level and actuator booleans.
 * So consumption is *derived*: each actuator's measured ON time multiplied by
 * its rated wattage.
 *
 * That makes every number here an estimate, and it is labelled as such
 * everywhere it surfaces. Two things limit accuracy:
 *   1. Rated wattage is user-entered, not measured.
 *   2. Actuator events are logged by a client hook on the device control page,
 *      so unlogged periods are invisible. `coveragePct` scales the confidence.
 */

/** Typical ratings for a small hobby incubator, in watts. User-editable. */
export const DEFAULT_RATINGS = {
  heaterBulb: 60,
  fan: 5,
  humidifier: 25,
  eggTurner: 4,
};

/** Philippine residential average, roughly ₱12/kWh. Editable in settings. */
export const DEFAULT_TARIFF = 12;
export const DEFAULT_CURRENCY = "₱";

const HOUR_MS = 3_600_000;

function round(value, places = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Merge user ratings over the defaults, ignoring blanks and negatives. */
export function resolveRatings(overrides) {
  const result = { ...DEFAULT_RATINGS };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    const watts = Number(value);
    if (Number.isFinite(watts) && watts >= 0) result[key] = watts;
  }
  return result;
}

/**
 * Energy estimate from an actuator summary produced by lib/batchReport.mjs.
 *
 * @param perActuator  [{ key, label, runtimeMs, cycles }]
 * @param ratings      watts per actuator key
 * @param tariff       currency units per kWh
 * @param coveragePct  logging coverage 0-100, or null when unknown
 */
export function estimatePower({
  perActuator = [],
  ratings = DEFAULT_RATINGS,
  tariff = DEFAULT_TARIFF,
  coveragePct = null,
} = {}) {
  const resolved = resolveRatings(ratings);
  const rate = Number.isFinite(Number(tariff)) && Number(tariff) >= 0 ? Number(tariff) : DEFAULT_TARIFF;

  const breakdown = perActuator.map((actuator) => {
    const watts = resolved[actuator.key] ?? 0;
    const hours = (Number(actuator.runtimeMs) || 0) / HOUR_MS;
    const kwh = (watts * hours) / 1000;
    return {
      key: actuator.key,
      label: actuator.label,
      watts,
      runtimeMs: Number(actuator.runtimeMs) || 0,
      runtimeHours: round(hours),
      kwh: round(kwh, 3),
      cost: round(kwh * rate),
      cycles: actuator.cycles ?? 0,
    };
  });

  const totalKwh = breakdown.reduce((sum, row) => sum + (row.kwh ?? 0), 0);

  // Logged runtime only covers the logged portion of the window. Scaling by
  // coverage gives a full-window projection — offered alongside the measured
  // figure, never instead of it.
  const usableCoverage =
    Number.isFinite(coveragePct) && coveragePct > 0 && coveragePct <= 100 ? coveragePct : null;
  const projectedKwh = usableCoverage ? totalKwh * (100 / usableCoverage) : null;

  return {
    breakdown: breakdown.sort((a, b) => (b.kwh ?? 0) - (a.kwh ?? 0)),
    totalKwh: round(totalKwh, 3),
    totalCost: round(totalKwh * rate),
    projectedKwh: projectedKwh === null ? null : round(projectedKwh, 3),
    projectedCost: projectedKwh === null ? null : round(projectedKwh * rate, 2),
    tariff: rate,
    coveragePct: usableCoverage,
    ratings: resolved,
    isEstimate: true,
  };
}

/**
 * Instantaneous draw from a live RTDB device state — the wattage of whatever is
 * switched on right now.
 *
 * Unlike the cumulative figures this needs no history at all, so it is accurate
 * regardless of how much got logged. An offline device draws nothing we can
 * observe, so it reports 0 rather than the last known state.
 */
export function liveDraw(deviceState, ratings = DEFAULT_RATINGS, isOnline = true) {
  const resolved = resolveRatings(ratings);
  if (!deviceState || !isOnline) {
    return { watts: 0, active: [], isOnline: Boolean(isOnline) };
  }

  const active = Object.keys(resolved)
    .filter((key) => deviceState[key] === true)
    .map((key) => ({ key, watts: resolved[key] }));

  return {
    watts: active.reduce((sum, item) => sum + item.watts, 0),
    active,
    isOnline: true,
  };
}

/** Energy per chick — only meaningful once a batch has actually hatched. */
export function costPerChick(totalCost, hatchedEggs) {
  const chicks = Number(hatchedEggs);
  if (!Number.isFinite(chicks) || chicks <= 0) return null;
  if (!Number.isFinite(totalCost)) return null;
  return round(totalCost / chicks);
}
