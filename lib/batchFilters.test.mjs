import test from "node:test";
import assert from "node:assert/strict";

import { filterBatches, hasActiveFilters, hatchRateOf, EMPTY_FILTERS } from "./batchFilters.mjs";

const BATCHES = [
  {
    id: "a",
    batchId: "B-001",
    eggType: "Chicken",
    status: "completed",
    totalEggs: 40,
    hatchedEggs: 36, // 90%
    startDate: new Date("2026-03-01T08:00:00.000Z"),
    deviceName: "Coop A",
  },
  {
    id: "b",
    batchId: "B-002",
    eggType: "Duck",
    status: "active",
    totalEggs: 40,
    hatchedEggs: 20, // 50%
    startDate: new Date("2026-04-15T08:00:00.000Z"),
    deviceName: "Coop B",
  },
  {
    id: "c",
    batchId: "B-003",
    eggType: "Chicken",
    status: "completed",
    totalEggs: 40,
    hatchedEggs: 8, // 20%
    startDate: new Date("2026-05-20T08:00:00.000Z"),
    deviceName: "Coop A",
  },
  {
    id: "d",
    batchId: "B-004",
    eggType: "Quail",
    status: "active",
    totalEggs: 30,
    startDate: new Date("2026-06-01T08:00:00.000Z"),
    deviceName: "Coop C",
    notes: "trial run",
  },
];

const ids = (rows) => rows.map((r) => r.id);

test("no filters returns every batch", () => {
  assert.deepEqual(ids(filterBatches(BATCHES, EMPTY_FILTERS)), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(filterBatches(BATCHES, {})), ["a", "b", "c", "d"]);
});

test("search matches id, type, status, device and notes", () => {
  assert.deepEqual(ids(filterBatches(BATCHES, { search: "B-002" })), ["b"]);
  assert.deepEqual(ids(filterBatches(BATCHES, { search: "duck" })), ["b"]);
  assert.deepEqual(ids(filterBatches(BATCHES, { search: "Coop A" })), ["a", "c"]);
  assert.deepEqual(ids(filterBatches(BATCHES, { search: "trial" })), ["d"]);
});

test("search is case-insensitive and trims whitespace", () => {
  assert.deepEqual(ids(filterBatches(BATCHES, { search: "  CHICKEN " })), ["a", "c"]);
});

test("egg type filter matches exactly, ignoring case", () => {
  assert.deepEqual(ids(filterBatches(BATCHES, { eggType: "chicken" })), ["a", "c"]);
  assert.deepEqual(ids(filterBatches(BATCHES, { eggType: "Goose" })), []);
});

test("status filter separates active from completed", () => {
  assert.deepEqual(ids(filterBatches(BATCHES, { status: "active" })), ["b", "d"]);
  assert.deepEqual(ids(filterBatches(BATCHES, { status: "completed" })), ["a", "c"]);
});

test("date range filters on the batch start date, inclusive of both days", () => {
  assert.deepEqual(ids(filterBatches(BATCHES, { from: "2026-04-01", to: "2026-05-31" })), ["b", "c"]);
  assert.deepEqual(ids(filterBatches(BATCHES, { from: "2026-03-01", to: "2026-03-01" })), ["a"]);
});

test("date range accepts an open lower or upper bound", () => {
  assert.deepEqual(ids(filterBatches(BATCHES, { from: "2026-05-01" })), ["c", "d"]);
  assert.deepEqual(ids(filterBatches(BATCHES, { to: "2026-04-30" })), ["a", "b"]);
});

test("date range uses a precomputed _startDate when present", () => {
  const decorated = [{ id: "x", _startDate: new Date("2026-03-05T00:00:00.000Z") }];
  assert.deepEqual(ids(filterBatches(decorated, { from: "2026-03-01", to: "2026-03-31" })), ["x"]);
});

test("date range excludes batches with no start date", () => {
  const rows = [{ id: "x" }];
  assert.deepEqual(ids(filterBatches(rows, { from: "2026-01-01" })), []);
  // ...but keeps them when no range is set
  assert.deepEqual(ids(filterBatches(rows, {})), ["x"]);
});

test("hatch rate bands split high, medium and low", () => {
  assert.deepEqual(ids(filterBatches(BATCHES, { hatchRate: "high" })), ["a"]);
  assert.deepEqual(ids(filterBatches(BATCHES, { hatchRate: "mid" })), ["b"]);
  assert.deepEqual(ids(filterBatches(BATCHES, { hatchRate: "low" })), ["c"]);
});

test("the 'none' band isolates batches with no hatch count recorded", () => {
  assert.deepEqual(ids(filterBatches(BATCHES, { hatchRate: "none" })), ["d"]);
});

test("filters combine as AND", () => {
  assert.deepEqual(ids(filterBatches(BATCHES, { eggType: "Chicken", status: "completed", hatchRate: "low" })), ["c"]);
  assert.deepEqual(ids(filterBatches(BATCHES, { eggType: "Chicken", status: "active" })), []);
});

test("filterBatches tolerates nullish input", () => {
  assert.deepEqual(filterBatches(null, {}), []);
  assert.deepEqual(filterBatches(undefined, {}), []);
  assert.deepEqual(ids(filterBatches([null, BATCHES[0]], {})), ["a"]);
});

test("hatchRateOf returns null without a hatch count or without eggs", () => {
  assert.equal(hatchRateOf({ totalEggs: 40, hatchedEggs: 20 }), 50);
  assert.equal(hatchRateOf({ totalEggs: 40 }), null);
  assert.equal(hatchRateOf({ totalEggs: 0, hatchedEggs: 0 }), null);
  assert.equal(hatchRateOf(null), null);
});

test("hasActiveFilters detects any narrowing filter", () => {
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
  assert.equal(hasActiveFilters({}), false);
  assert.equal(hasActiveFilters({ search: "   " }), false);
  assert.equal(hasActiveFilters({ search: "B-001" }), true);
  assert.equal(hasActiveFilters({ hatchRate: "low" }), true);
});
