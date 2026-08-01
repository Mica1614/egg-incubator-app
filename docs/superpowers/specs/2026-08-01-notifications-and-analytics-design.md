# Notification Discipline & Hatch Analytics — Design

Date: 2026-08-01
Status: implemented
Covers client recommendations 1 (analysis from egg hatch), 2 (power consumption),
3 (too many notifications) and 6 (validation of system output).

Companion to `2026-08-01-batch-reporting-design.md`, which covered recommendations 4 and 5.

## Slice B — Notification discipline (recommendation 3)

### What was wrong

- Every state change fired a toast **and** a browser push **and** a Firestore write. In auto mode the
  heater and humidifier cycle every few minutes, so a running incubator produced a constant stream.
- Both `app/dashboard/page.js` and `app/devices/[deviceId]/control/page.js` mount
  `useDeviceNotifications`. With both open, every alert fired twice.
- The offline/online path in `useDeviceNotifications` called `sendToastNotification` and
  `saveNotificationToFirestore` directly, bypassing preferences entirely.
- Email had a cooldown; the in-app path had none at all.

### Design

`lib/notificationPolicy.mjs` — pure admission control. Every notification is classified by severity,
then admitted or dropped:

| Severity | Types | Cooldown |
| --- | --- | --- |
| Critical | device offline, temp/humidity abnormal, water low | 5 min |
| Warning | device online, temp/humidity normal, water OK, email limits | 15 min |
| Routine | heater/fan/humidifier/turner on-off | 60 min |

An unclassified type defaults to **warning**, not routine — a new alert type must be noisy until
someone classifies it, never silently dropped.

Rules, in order: explicit per-type mute → volume preset threshold → quiet hours → cooldown.

- **Volume presets** — `Everything` (routine included, cooldowns quartered), `Balanced` (default;
  routine dropped), `Critical only`.
- **Quiet hours** — suppress non-critical notifications in a window that may wrap past midnight.
  Critical alerts always come through; a dead incubator at 3am is what the user needs woken for.
- **Cooldown ledger** in `localStorage` (`lib/notificationSettings.js`), so the dashboard and control
  page share suppression state. That is what fixes the double-mount duplication — whichever mount
  fires first claims the window. The ledger self-prunes entries older than 24h.
- **Routine defaults flipped to off** in `useNotificationPreferences`. Saved preferences are merged
  over the defaults, so existing users keep whatever they previously chose.
- **Browser push reserved for non-routine** severities; routine events stay in-app.
- Every path now funnels through `sendNotification`, so the throttle cannot be bypassed.
- The notifications list gained a **Group** toggle collapsing repeats into one row with a `×N` badge.
  Deleting a grouped row deletes only that document — the count is a display aid, not a selection.

## Slice D — Analytics (recommendations 1, 2, 6)

### Hatch analysis (recommendation 1)

`lib/hatchAnalytics.mjs`. The app previously showed only "hatched ÷ total". Added:

- **Fertility rate** — fertile ÷ set. Judges the eggs.
- **Hatch of fertile** — hatched ÷ fertile. Judges the incubation. This is the number that separates
  a bad machine from bad eggs, and it was missing entirely.
- **Dead in shell** — fertile eggs that developed but never hatched.
- Best/weakest batch, per-egg-type rollup, and `environmentVsHatch`.

Fleet rates are computed from **summed counts**, not averaged percentages — a 4-egg batch must not
weigh the same as a 200-egg one. Metrics whose inputs are missing return `null`, never `0`, so
"no data" cannot drag an average down.

`environmentVsHatch` deliberately reports a **group comparison**, not a correlation coefficient: with
a handful of batches an r-value would look authoritative while meaning almost nothing. It also
excludes batches whose logging coverage was too sparse to trust, and reports `isIndicative: false`
below four usable batches.

### Power consumption (recommendation 2)

`lib/powerEstimate.mjs`. The firmware reports no current or power figure — RTDB device state carries
only temperature, humidity, water level and actuator booleans. So consumption is **derived**: measured
actuator ON time × user-entered rated wattage, at a user-entered tariff.

Both limits are surfaced, not buried: wattage is an assumption, and actuator events are only logged
while the control page is open. Alongside the measured figure the module reports a **projection**
scaled by logging coverage — offered as well as, never instead of, the measured number.

Power lives on its own route, `/power-consumption`, rather than as a section of hatch analysis: it
answers a different question (running cost) from a different audience's point of view, and it needs
room for the ratings editor and per-device breakdown.

Wattages and tariff live in `lib/usePowerSettings.js` — one `localStorage`-backed store shared by the
power page, the per-batch report and the PDF/Excel exports, so all three price energy identically.
The store also listens for cross-tab `storage` events, so editing a wattage in one tab cannot leave
another quietly costing energy differently. Runtime is derived with `summariseActuators` from
`batchReport.mjs` rather than a second implementation, so trailing unmatched ON events are handled the
same way everywhere.

### Validation of system output (recommendation 6)

Three independent checks in `lib/outputValidation.mjs`:

1. **Model accuracy.** The scanner previously offered only "Accept", so a wrong prediction could be
   accepted or discarded but never *corrected* — no ground truth was ever recorded and accuracy was
   unmeasurable. Scans now store `predictedClass`, `finalClass` and `wasCorrected`, and the confirmed
   class (not the model's guess) drives the dead/infertile deduction on the batch. Scans predating
   this feature are counted as **unscored** rather than assumed correct.
2. **Sensor plausibility.** Beyond the `-999` failure sentinel, readings are checked for impossible
   values and for rate-of-change too fast to be physical. Changes across a logging gap are *not*
   flagged — gaps are expected, and a jump either side of one is not evidence of a fault.
3. **Scan-versus-hatch reconciliation.** The scanner deducts an egg on every dead/infertile call, so
   those predictions directly change reported numbers. If more eggs hatched than the surviving count,
   the model over-culled — a discrepancy nothing previously surfaced.

Every one of these reports `isIndicative` and says so in the UI when the sample is too small.

## Surfaces

| Route | Content |
| --- | --- |
| `/hatch-analysis` (new, in sidebar) | Fleet hatch performance, model accuracy and confusion table |
| `/power-consumption` (new, in sidebar) | Fleet energy and cost, per-actuator chart, editable wattages and tariff, per-device breakdown |
| `/devices/[deviceId]/batches/[batchId]/report` | Gained per-batch hatch metrics, power, sensor health and reconciliation sections |
| `/devices/[deviceId]/settings` | Gained volume preset, quiet hours, per-type severity badges |
| `/notifications` | Gained the Group toggle |
| `/egg-detector-scanner` | Gained the confirm/correct control before Accept |

PDF and Excel exports gained Power and Sensor Issues sections, and the summary block gained fertility,
hatch-of-fertile, dead-in-shell, energy and sensor-health rows.

## Testing

`npm test` — 121 tests across five pure modules. Notification coverage includes wrap-past-midnight
quiet hours, critical-beats-quiet-hours, per-device cooldown isolation, preset thresholds and the
unclassified-type default. Analytics coverage includes weighted-versus-averaged rates, null-not-zero
handling, coverage-based exclusion and every small-sample guard.

## Known limitations

- Everything here still reads the client-logged sensor and actuator history (slice A remains
  deferred), so energy figures understate reality and coverage figures make that visible.
- `/hatch-analysis` reads the full `egg_batches` and `egg_scans` collections, matching how the
  existing global batch-history page already queries. Fine at current data volume; would need
  pagination at scale.
