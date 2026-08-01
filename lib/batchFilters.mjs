/**
 * lib/batchFilters.mjs — Pure batch list filtering.
 *
 * Shared by the global and per-device batch-history pages so both behave
 * identically. No React, no Firebase — testable with plain objects.
 */

import { toDate } from "./batchReport.mjs";

export const EMPTY_FILTERS = {
  search: "",
  eggType: "",
  status: "",
  from: "",
  to: "",
  hatchRate: "",
};

export const EGG_TYPES = ["Chicken", "Duck", "Quail", "Goose", "Turkey"];

export const HATCH_RATE_BANDS = [
  { value: "high", label: "High (≥ 70%)" },
  { value: "mid", label: "Medium (40–69%)" },
  { value: "low", label: "Low (< 40%)" },
  { value: "none", label: "No hatch recorded" },
];

/** Hatch rate as a percentage, or null when no hatch count has been entered. */
export function hatchRateOf(batch) {
  const total = Number(batch?.totalEggs) || 0;
  const hatched = Number(batch?.hatchedEggs);
  if (!total || !Number.isFinite(hatched)) return null;
  return (hatched / total) * 100;
}

function matchesBand(rate, band) {
  if (band === "none") return rate === null;
  if (rate === null) return false;
  if (band === "high") return rate >= 70;
  if (band === "mid") return rate >= 40 && rate < 70;
  if (band === "low") return rate < 40;
  return true;
}

function startOfDay(value) {
  const d = toDate(value);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(value) {
  const d = toDate(value);
  if (!d) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Filter a decorated batch list.
 *
 * Batches may carry a precomputed `_startDate`; when absent the raw
 * `startDate` is normalised here, so callers can pass either shape.
 */
export function filterBatches(batches, filters = {}) {
  const f = { ...EMPTY_FILTERS, ...filters };
  const search = String(f.search || "").trim().toLowerCase();
  const from = startOfDay(f.from);
  const to = endOfDay(f.to);

  return (batches ?? []).filter((batch) => {
    if (!batch) return false;

    if (search) {
      const haystack = [
        batch.batchId,
        batch.eggType,
        batch.status,
        batch.deviceName,
        batch.notes,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      if (!haystack.includes(search)) return false;
    }

    if (f.eggType && String(batch.eggType || "").toLowerCase() !== f.eggType.toLowerCase()) {
      return false;
    }

    if (f.status && String(batch.status || "").toLowerCase() !== f.status.toLowerCase()) {
      return false;
    }

    if (from || to) {
      const start = batch._startDate instanceof Date ? batch._startDate : toDate(batch.startDate);
      if (!start) return false;
      if (from && start < from) return false;
      if (to && start > to) return false;
    }

    if (f.hatchRate && !matchesBand(hatchRateOf(batch), f.hatchRate)) return false;

    return true;
  });
}

/** True when any filter is narrowing the list — drives the Reset control. */
export function hasActiveFilters(filters = {}) {
  const f = { ...EMPTY_FILTERS, ...filters };
  return Object.keys(EMPTY_FILTERS).some((key) => String(f[key] || "").trim() !== "");
}
