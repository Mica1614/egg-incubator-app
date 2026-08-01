# Batch Reporting — Design

Date: 2026-08-01
Status: approved for implementation
Covers client recommendations 4 (report filtering per batch) and 5 (comprehensive reports and logs per batch).

## Context

The client raised six recommendations. They were sliced into four independent pieces:

| Slice | Content | Status |
| --- | --- | --- |
| A | Server-side sensor/actuator logging | Deferred by user decision |
| B | Notification discipline (recommendation 3) | Not started |
| **C** | **Batch reporting (recommendations 4 + 5)** | **This spec** |
| D | Hatch analytics, power consumption, output validation (1, 2, 6) | Not started |

Slice A was deprioritised deliberately: the user's client only sees the user-facing app, so visible work comes first.

### Accepted limitation

`useDeviceHistoryLogger` is a client hook mounted only on the device control page
(`app/devices/[deviceId]/control/page.js`). Sensor readings and actuator events are therefore written to
Firestore **only while a browser tab sits on that page**. Reports built now show data only for periods
somebody was watching.

This is accepted, not hidden. The report computes and displays a **data coverage percentage** so a
sparsely-logged batch is visibly sparse rather than silently wrong. Slice A removes the limitation later
without changing anything in this spec.

## Goals

1. One comprehensive, on-screen report per batch, exportable to PDF and Excel.
2. Real filtering on batch lists — beyond the current free-text search.
3. Existing device-scoped sensor history filterable by batch.

## Non-goals

- Fertility / hatchability-of-fertile / dead-in-shell analytics — slice D.
- Power consumption estimates — slice D.
- Scan accuracy tracking — slice D.
- Moving logging server-side — slice A.

## Architecture

Client-side Firestore reads (matching every existing page), with aggregation extracted into a pure
module so the arithmetic is testable without Firebase, a browser, or admin credentials.

```
report page  ─┬─> useBatchReport (client SDK reads)
              │        │
              │        └─> buildBatchReport(raw docs) ──> report model
              │                                              │
              └─> screen sections <─────────────────────────┤
                  PDF builder    <─────────────────────────┤
                  Excel builder  <─────────────────────────┘
```

Screen, PDF and Excel all render the same model, so they cannot drift apart.

### Files

| File | Purpose |
| --- | --- |
| `lib/batchReport.mjs` | Pure aggregation. No imports, no Firebase, no React. |
| `lib/batchReport.test.mjs` | `node:test` unit tests over fixtures. |
| `lib/useBatchReport.js` | Client hook: fetches the six sources, calls `buildBatchReport`. |
| `lib/batchReportExport.js` | PDF (jsPDF + autoTable) and Excel (xlsx) builders. |
| `app/devices/[deviceId]/batches/[batchId]/report/page.js` | The report screen. |
| `components/BatchFilterBar.js` | Reusable filter controls. |
| `lib/batchFilters.mjs` | Pure filter predicate, shared by both batch-history pages. |

`.mjs` is used for the pure modules so `node --test` runs them directly. The package has no
`"type": "module"`, so a `.js` module would be treated as CommonJS by Node and fail to import.

## Data sources

Batch window: `start = batch.startDate`, `end = min(now, batch.hatchingDate)`. All time-scoped
sections use this window and the batch's `deviceId`.

| Section | Collection | Join key |
| --- | --- | --- |
| Batch meta + outcome | `egg_batches/{docId}` | direct |
| Environment | `devices/{deviceId}/history` | `createdAt` in window |
| Actuators | `devices/{deviceId}/activityLog` | `createdAt` in window |
| Candling scans | `egg_scans` | `batchId ==` batch **document id** |
| Alerts | `users/{uid}/notifications` | `createdAt` in window, `deviceName` match |
| Chicks | `chick_inventory` | `batch_id ==` batch **label** |

### Two join-key traps

`egg_scans.batchId` stores the batch **document id** (`app/egg-detector-scanner/page.js`), while
`chick_inventory` keys on the human-readable `batch.batchId` label. Same batch, two different keys.
`buildBatchReport` takes both explicitly so they cannot be confused.

Chick inventory is additionally matched on the **`batch_id` field rather than the document id**,
because the two batch-history pages write different id shapes for the same batch:
`batch_{label}` on the per-device page and `batch_{label}_{timestamp}` on the global one. Matching on
the field catches both, and `summariseOutcome` sums whatever it finds.

### Why not `alert_history`

`alert_history` is written only by `checkAlerts`, and `/api/alerts/check` is called from nowhere in the
application. Its records also hardcode `deviceName: "Incubator A1"` and `incubatorId: "INC-001"`
(`lib/alertSystem.js`), so they cannot be attributed to a real device. The alert section reads
`users/{uid}/notifications`, which is actually written and carries a real `deviceName` and `createdAt`.

## Report model

`buildBatchReport({ batch, deviceId, deviceName, readings, activity, scans, notifications, inventory, thresholds, intervalMs, now })`
returns:

```
{
  meta:      { batchId, docId, eggType, deviceId, deviceName, status, notes,
               startDate, endDate, hatchingDate, incubationDays, windowMs },
  outcome:   { totalEggs, hatchedEggs, deadEggs, infertileEggs, hatchRate,
               chicksAvailable, chicksSold },
  environment: {
    count, temp: {min,max,avg}, humidity: {min,max,avg},
    tempInRangePct, humidityInRangePct, waterLowCount,
    thresholds, deviations: [...], series: [...]
  },
  actuators: { perActuator: {key,label,cycles,runtimeMs,runtimePct}[], events: [...] },
  scans:     { total, byRound: [{round,total,classes,avgConfidence}], classTotals, items: [...] },
  alerts:    { total, byType: {...}, items: [...] },
  coverage:  { expectedReadings, actualReadings, pct, intervalMs },
  generatedAt
}
```

### Definitions

- **`tempInRangePct` / `humidityInRangePct`** — percentage of *recorded readings* inside range, not
  percentage of time. Sampling is interval-based and gappy; naming it "time" would overstate it.
  Thresholds come from the device's live `tempTrigger` / `tempStop` / `humidityTrigger` /
  `humidityStop`, falling back to the constants in `lib/deviceMonitor.js` (36.5–38.5 °C, 40–65 %).
- **Actuator runtime** — each `ON` event pairs with the next `OFF`. A trailing unmatched `ON` counts
  to window end. A leading `OFF` with no preceding `ON` is ignored.
- **Coverage** — `actualReadings / expectedReadings` where
  `expectedReadings = floor(windowMs / intervalMs)`, capped at 100 %. `intervalMs` comes from the
  `sensor_log_interval_ms` localStorage key used by the logger, defaulting to 60000.
- **Sensor sentinels** — `-999` and negative values are excluded from every min/max/avg and from
  in-range counts, matching how the notification layer treats them.

## Screen

Route: `/devices/[deviceId]/batches/[batchId]/report`, where `[batchId]` is the batch document id.

Sections, in order: header (batch identity, window, status) · outcome tiles · coverage banner ·
environment (tiles + Recharts line chart + paginated table) · actuator summary (per-actuator runtime
cards + event table) · candling scans (per-round breakdown, class distribution, thumbnails from
`imageDataUrl`) · alert log.

Thumbnails render on screen only. `egg_scans.imageDataUrl` holds full base64 data URLs; embedding
them in a PDF would produce very heavy files for a 40-egg batch.

Auth guard follows the existing pattern: `onAuthStateChanged`, then confirm
`users/{uid}/devices/{deviceId}` exists, else render the "Device not in your account" state.

## Exports

- **PDF** — one document, section per heading, via jsPDF + autoTable. Tables only, no images.
- **Excel** — one workbook, one sheet per section (Summary, Environment, Actuators, Scans, Alerts).

Both consume the report model, so both always match the screen.

## Filtering

`lib/batchFilters.mjs` exports `filterBatches(batches, filters)` with fields:

| Field | Behaviour |
| --- | --- |
| `search` | Existing free-text behaviour, preserved |
| `eggType` | Exact match, case-insensitive; `""` = all |
| `status` | `active` / `completed`; `""` = all |
| `from` / `to` | Batch start date within range |
| `hatchRate` | `high` ≥ 70 %, `mid` 40–69 %, `low` < 40 %, `none` = no hatch recorded |

`components/BatchFilterBar.js` renders these plus a Reset control and a result count.

Wired into:
- `app/devices/[deviceId]/batch-history/page.js` — filter bar plus a **View report** action per row.
- `app/batch-history/page.js` — same filter bar; the report action links to the device-scoped route
  using the row's `deviceId`, and is disabled for legacy rows that have no `deviceId`.

Both pages already feed their filtered array to the PDF/Excel buttons, so existing exports become
filter-aware with no export changes.

## Batch selector on sensor history

`app/devices/[deviceId]/history/page.js` gains a batch dropdown listing that device's batches.
Selecting one snaps the existing `from`/`to` inputs to the batch window and refetches. The manual
range picker keeps working; picking a batch is a shortcut, not a mode.

## Firestore indexes

No new composite index is required. `egg_scans` and `chick_inventory` are queried by equality only
and sorted inside the aggregation module — adding an `orderBy` to either query would have forced a
composite index and an extra deployment step. The remaining range queries
(`devices/{id}/history`, `devices/{id}/activityLog`, `users/{uid}/notifications`) are single-field and
covered by Firestore's automatic indexes.

If a future change does need one, Firestore returns `failed-precondition` with a console link;
`useBatchReport` already surfaces that message on screen rather than rendering an empty section.

## Testing

`npm test` runs `node --test` over `lib/*.test.mjs`. Coverage:

- Window derivation, including a batch whose hatch date is in the future.
- Sentinel exclusion (`-999`, negatives) from statistics.
- In-range percentages against custom and fallback thresholds.
- Actuator pairing: normal ON/OFF, trailing unmatched ON, leading orphan OFF, empty log.
- Coverage percentage, including the zero-length window and over-100 % clamp.
- Scan grouping by round and class totals.
- Empty-everything case returning a well-formed model rather than throwing.
- Filter predicate for each field and combinations.

Build verification: `npm run build` must compile and typecheck.
