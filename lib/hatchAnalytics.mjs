/**
 * lib/hatchAnalytics.mjs — Post-hatch analysis across batches.
 *
 * The app already stored everything needed for this (totalEggs, deadEggs,
 * infertileEggs, hatchedEggs per batch, plus candling scans) but only ever
 * displayed a single crude "hatched ÷ total" percentage. The metrics below are
 * the ones a hatchery actually judges performance on.
 *
 * Pure module — no Firebase, no React.
 */

import { toDate } from "./batchReport.mjs";

/**
 * Per-batch metrics.
 *
 * - fertilityRate       fertile ÷ set. How good the breeding flock / eggs were.
 * - hatchRate           hatched ÷ set. Overall result.
 * - hatchOfFertile      hatched ÷ fertile. How good the *incubation* was — the
 *                       number that separates a bad machine from bad eggs.
 * - deadInShell         fertile eggs that developed but never hatched.
 *
 * Any metric whose inputs are missing is null rather than 0, so "no data" never
 * renders as "0%" and drags an average down.
 */
export function analyseBatch(batch) {
  const total = Number(batch?.totalEggs) || 0;
  const infertile = Number(batch?.infertileEggs) || 0;
  const dead = Number(batch?.deadEggs) || 0;
  const hatchedRaw = Number(batch?.hatchedEggs);
  const hatched = Number.isFinite(hatchedRaw) ? hatchedRaw : null;

  const fertile = total > 0 ? Math.max(0, total - infertile) : 0;
  const pct = (part, whole) =>
    whole > 0 && Number.isFinite(part) ? Math.round((part / whole) * 1000) / 10 : null;

  // Fertile eggs that neither hatched nor were recorded as early deaths.
  const deadInShell = hatched === null ? null : Math.max(0, fertile - hatched);

  return {
    id: batch?.id ?? null,
    batchId: batch?.batchId ?? null,
    eggType: batch?.eggType ?? null,
    deviceId: batch?.deviceId ?? null,
    deviceName: batch?.deviceName ?? null,
    startDate: toDate(batch?.startDate),
    status: batch?.status ?? null,
    totalEggs: total,
    infertileEggs: infertile,
    deadEggs: dead,
    fertileEggs: fertile,
    hatchedEggs: hatched,
    deadInShell,
    fertilityRate: pct(fertile, total),
    hatchRate: hatched === null ? null : pct(hatched, total),
    hatchOfFertile: hatched === null ? null : pct(hatched, fertile),
    deadInShellRate: deadInShell === null ? null : pct(deadInShell, fertile),
  };
}

function mean(values) {
  const usable = values.filter((v) => Number.isFinite(v));
  if (!usable.length) return null;
  return Math.round((usable.reduce((a, b) => a + b, 0) / usable.length) * 10) / 10;
}

/**
 * Fleet-level rollup.
 *
 * Rates are computed from summed counts rather than averaging per-batch
 * percentages: a 4-egg batch should not weigh the same as a 200-egg one.
 */
export function summariseBatches(batches) {
  const analysed = (batches ?? []).map(analyseBatch);
  const completed = analysed.filter((b) => b.hatchedEggs !== null);

  const sum = (rows, field) => rows.reduce((acc, row) => acc + (Number(row[field]) || 0), 0);

  const totalSet = sum(completed, "totalEggs");
  const totalFertile = sum(completed, "fertileEggs");
  const totalHatched = sum(completed, "hatchedEggs");
  const totalDeadInShell = sum(completed, "deadInShell");
  const rate = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

  const best = completed.reduce(
    (top, row) => (top === null || (row.hatchRate ?? -1) > (top.hatchRate ?? -1) ? row : top),
    null
  );
  const worst = completed.reduce(
    (low, row) => (low === null || (row.hatchRate ?? 101) < (low.hatchRate ?? 101) ? row : low),
    null
  );

  return {
    batches: analysed,
    completedCount: completed.length,
    totalCount: analysed.length,
    totalSet,
    totalFertile,
    totalHatched,
    totalDeadInShell,
    fertilityRate: rate(totalFertile, totalSet),
    hatchRate: rate(totalHatched, totalSet),
    hatchOfFertile: rate(totalHatched, totalFertile),
    deadInShellRate: rate(totalDeadInShell, totalFertile),
    best,
    worst,
    byEggType: groupByEggType(completed),
  };
}

function groupByEggType(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = row.eggType || "Unknown";
    if (!groups.has(key)) groups.set(key, { eggType: key, batches: 0, set: 0, fertile: 0, hatched: 0 });
    const group = groups.get(key);
    group.batches += 1;
    group.set += row.totalEggs;
    group.fertile += row.fertileEggs;
    group.hatched += row.hatchedEggs ?? 0;
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      hatchRate: group.set > 0 ? Math.round((group.hatched / group.set) * 1000) / 10 : null,
      hatchOfFertile: group.fertile > 0 ? Math.round((group.hatched / group.fertile) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.set - a.set);
}

/**
 * Relate environmental quality to hatch outcome.
 *
 * Deliberately reported as a comparison of group averages, not a correlation
 * coefficient: with a handful of batches an r-value would look authoritative
 * while meaning almost nothing. Splitting "well-controlled" from "poorly
 * controlled" runs and showing both hatch rates is honest at this sample size.
 *
 * @param entries [{ batch, tempInRangePct, coveragePct }]
 * @param options.minCoveragePct  ignore batches whose logging was too sparse
 * @param options.goodThreshold   in-range % at or above which a run counts as well-controlled
 */
export function environmentVsHatch(entries, { minCoveragePct = 20, goodThreshold = 90 } = {}) {
  const usable = (entries ?? []).filter((entry) => {
    const analysed = analyseBatch(entry.batch);
    return (
      analysed.hatchRate !== null &&
      Number.isFinite(entry.tempInRangePct) &&
      (entry.coveragePct === null || !Number.isFinite(entry.coveragePct)
        ? false
        : entry.coveragePct >= minCoveragePct)
    );
  });

  const rows = usable.map((entry) => ({
    ...analyseBatch(entry.batch),
    tempInRangePct: entry.tempInRangePct,
    coveragePct: entry.coveragePct,
  }));

  const good = rows.filter((row) => row.tempInRangePct >= goodThreshold);
  const poor = rows.filter((row) => row.tempInRangePct < goodThreshold);

  const goodHatch = mean(good.map((r) => r.hatchRate));
  const poorHatch = mean(poor.map((r) => r.hatchRate));

  return {
    rows,
    sampleSize: rows.length,
    excluded: (entries ?? []).length - rows.length,
    minCoveragePct,
    goodThreshold,
    goodCount: good.length,
    poorCount: poor.length,
    goodHatchRate: goodHatch,
    poorHatchRate: poorHatch,
    difference:
      goodHatch === null || poorHatch === null ? null : Math.round((goodHatch - poorHatch) * 10) / 10,
    // Below this, differences are noise. The UI says so rather than drawing conclusions.
    isIndicative: rows.length >= 4 && good.length >= 2 && poor.length >= 2,
  };
}
