// @ts-nocheck
"use client";

/**
 * Comprehensive per-batch report.
 *
 * Route param [batchId] is the egg_batches DOCUMENT id — the same value
 * egg_scans.batchId points at. The human-readable label lives on batch.batchId.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import BreadcrumbNav from "@/components/BreadcrumbNav";
import { useBatchReport } from "@/lib/useBatchReport";
import { formatDuration } from "@/lib/batchReport.mjs";
import { estimatePower, costPerChick, DEFAULT_CURRENCY } from "@/lib/powerEstimate.mjs";
import { usePowerSettings } from "@/lib/usePowerSettings";
import { analyseBatch } from "@/lib/hatchAnalytics.mjs";
import { reconcileScansWithHatch, scoreScanAccuracy, validateReadings } from "@/lib/outputValidation.mjs";
import { exportBatchReportExcel, exportBatchReportPdf } from "@/lib/batchReportExport";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle, FileDown, FileSpreadsheet, Thermometer, Droplets, Heater, Wind,
  CloudRain, RotateCcw, Microscope, Bell, Database, RefreshCw, ClipboardList,
  Zap, ShieldCheck, TrendingUp,
} from "lucide-react";

const DASH = "—";

const ACTUATOR_ICONS = {
  heaterBulb: Heater,
  fan: Wind,
  humidifier: CloudRain,
  eggTurner: RotateCcw,
};

const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : DASH;

const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : DASH;

const show = (v, suffix = "") => (v === null || v === undefined ? DASH : `${v}${suffix}`);

function Tile({ label, value, sub, tone = "slate" }) {
  const tones = {
    slate: "text-slate-900",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
    indigo: "text-indigo-600",
  };
  return (
    <article className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-slate-100">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${tones[tone] ?? tones.slate}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-slate-500">{sub}</p>}
    </article>
  );
}

function Section({ icon: Icon, title, subtitle, children, action }) {
  return (
    <section className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-[#004a87]">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-tight text-slate-900">{title}</p>
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyNote({ children }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
      <p className="text-xs font-medium text-slate-500">{children}</p>
    </div>
  );
}

function SimpleTable({ head, rows, emptyText, maxHeight = "max-h-80" }) {
  if (!rows.length) return <EmptyNote>{emptyText}</EmptyNote>;
  return (
    <div className={`overflow-auto rounded-2xl ring-1 ring-slate-100 ${maxHeight}`}>
      <table className="min-w-[560px] w-full border-collapse text-left">
        <thead className="sticky top-0 bg-slate-50">
          <tr className="border-b border-slate-200">
            {head.map((h) => (
              <th key={h} className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
              {row.map((cell, j) => (
                <td key={j} className="py-2.5 px-3 text-xs text-slate-700 whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BatchReportPage() {
  const { deviceId, batchId: docId } = useParams();
  const router = useRouter();

  const [authorized, setAuthorized] = useState(null);
  const [uid, setUid] = useState(null);
  const [nickname, setNickname] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace("/login"); return; }
      setUid(user.uid);
      try {
        const snap = await getDoc(doc(firestore, "users", user.uid, "devices", deviceId));
        if (!snap.exists()) { setAuthorized(false); return; }
        setNickname(snap.data()?.nickname || deviceId);
        setAuthorized(true);
      } catch {
        setAuthorized(false);
      }
    });
    return () => unsub();
  }, [deviceId, router]);

  const { report, loading, error, notFound, reload } = useBatchReport(
    authorized ? deviceId : null,
    authorized ? docId : null,
    uid,
    nickname
  );

  // Derived analysis layered on the report model — energy, hatch metrics and
  // output validation for this one batch.
  const { settings: powerSettings } = usePowerSettings();

  const energy = useMemo(
    () =>
      report
        ? estimatePower({
            perActuator: report.actuators.perActuator,
            ratings: powerSettings.ratings,
            tariff: powerSettings.tariff,
            coveragePct: report.coverage.pct,
          })
        : null,
    [report, powerSettings]
  );

  const hatchMetrics = useMemo(
    () =>
      report
        ? analyseBatch({
            totalEggs: report.outcome.totalEggs,
            infertileEggs: report.outcome.infertileEggs,
            deadEggs: report.outcome.deadEggs,
            hatchedEggs: report.outcome.hatchedEggs,
          })
        : null,
    [report]
  );

  const sensorHealth = useMemo(
    () =>
      report
        ? validateReadings(
            report.environment.series.map((row) => ({
              createdAt: row.at,
              tempC: row.temp,
              humidity: row.humidity,
            }))
          )
        : null,
    [report]
  );

  const scanAccuracy = useMemo(
    () => (report ? scoreScanAccuracy(report.scans.items.map((s) => ({ ...s, layer1_confidence: s.layer1Confidence }))) : null),
    [report]
  );

  const reconciliation = useMemo(
    () =>
      report
        ? reconcileScansWithHatch(
            { totalEggs: report.outcome.totalEggs, hatchedEggs: report.outcome.hatchedEggs },
            report.scans.items.map((s) => ({ finalClass: s.finalClass ?? s.layer1Class }))
          )
        : null,
    [report]
  );

  const chartData = useMemo(
    () =>
      (report?.environment.series ?? []).map((row) => ({
        time: row.at
          ? `${String(row.at.getMonth() + 1).padStart(2, "0")}/${String(row.at.getDate()).padStart(2, "0")} ${String(row.at.getHours()).padStart(2, "0")}:${String(row.at.getMinutes()).padStart(2, "0")}`
          : "",
        temp: row.temp,
        humidity: row.humidity,
      })),
    [report]
  );

  if (authorized === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#004a87] border-t-transparent" />
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-400" />
        <p className="text-sm font-semibold text-slate-900">Device not in your account.</p>
        <Link href="/dashboard" className="rounded-2xl bg-[#004a87] px-4 py-2 text-sm font-semibold text-white">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const meta = report?.meta;
  const coverage = report?.coverage;

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="Batch Report" onOpenSidebar={() => setIsSidebarOpen(true)} />
          <BreadcrumbNav deviceId={deviceId} deviceName={nickname} currentPage="Batch Report" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-[#004a87]">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-slate-900">
                  {meta?.batchId || "Batch Report"}
                </h1>
                <p className="text-[11px] text-slate-400">
                  {meta
                    ? `${meta.eggType || DASH} • ${fmtDate(meta.startDate)} → ${fmtDate(meta.hatchingDate)} • ${nickname}`
                    : nickname}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={reload}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                onClick={() => exportBatchReportPdf(report)}
                disabled={!report}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
              >
                <FileDown className="h-3.5 w-3.5" />
                PDF
              </button>
              <button
                onClick={() => exportBatchReportExcel(report)}
                disabled={!report}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Excel
              </button>
            </div>
          </div>

          {loading && (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#004a87] border-t-transparent" />
              <p className="mt-3 text-xs font-medium text-slate-500">Building report…</p>
            </div>
          )}

          {!loading && notFound && (
            <div className="rounded-3xl bg-white px-6 py-10 text-center shadow-sm ring-1 ring-slate-100">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Batch not found.</p>
              <p className="mt-1 text-xs text-slate-500">It may have been deleted.</p>
              <Link
                href={`/devices/${deviceId}/batch-history`}
                className="mt-4 inline-block rounded-2xl bg-[#004a87] px-4 py-2 text-xs font-semibold text-white"
              >
                Back to Batch History
              </Link>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-700 ring-1 ring-rose-200">{error}</div>
          )}

          {!loading && report && (
            <>
              {/* Outcome */}
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Tile label="Total Eggs" value={report.outcome.totalEggs} sub="Set at batch creation" />
                <Tile
                  label="Hatched"
                  value={show(report.outcome.hatchedEggs)}
                  sub={report.outcome.hatchedEggs === null ? "Not yet recorded" : "Chicks produced"}
                  tone="emerald"
                />
                <Tile label="Hatch Rate" value={show(report.outcome.hatchRate, "%")} sub="Hatched ÷ total" tone="indigo" />
                <Tile
                  label="Dead / Infertile"
                  value={`${report.outcome.deadEggs} / ${report.outcome.infertileEggs}`}
                  sub="From candling deductions"
                  tone="rose"
                />
              </section>

              {/* Coverage banner — makes a thin report visibly thin */}
              <div
                className={`rounded-2xl px-5 py-4 text-xs ring-1 ${
                  coverage.pct === null
                    ? "bg-slate-50 text-slate-600 ring-slate-200"
                    : coverage.pct >= 80
                      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                      : "bg-amber-50 text-amber-800 ring-amber-200"
                }`}
              >
                <div className="flex items-start gap-2">
                  <Database className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      Data coverage: {coverage.pct === null ? "not measurable" : `${coverage.pct}%`}
                    </p>
                    <p className="mt-1 leading-relaxed">
                      {coverage.actualReadings} readings logged of roughly {coverage.expectedReadings} expected at a{" "}
                      {Math.round(coverage.intervalMs / 1000)}s interval. Sensor logging runs while the device control
                      page is open in a browser, so gaps mean nobody was on that page — not that the incubator was off.
                    </p>
                  </div>
                </div>
              </div>

              {/* Environment */}
              <Section
                icon={Thermometer}
                title="Environment"
                subtitle={`${report.environment.count} readings • thresholds ${report.environment.thresholds.tempLow}–${report.environment.thresholds.tempHigh} °C, ${report.environment.thresholds.humidityLow}–${report.environment.thresholds.humidityHigh} %`}
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Tile
                    label="Avg Temp"
                    value={show(report.environment.temp.avg, " °C")}
                    sub={`min ${show(report.environment.temp.min)} • max ${show(report.environment.temp.max)}`}
                  />
                  <Tile
                    label="Avg Humidity"
                    value={show(report.environment.humidity.avg, " %")}
                    sub={`min ${show(report.environment.humidity.min)} • max ${show(report.environment.humidity.max)}`}
                  />
                  <Tile
                    label="Temp In Range"
                    value={show(report.environment.tempInRangePct, "%")}
                    sub="of recorded readings"
                    tone={report.environment.tempInRangePct >= 90 ? "emerald" : "amber"}
                  />
                  <Tile
                    label="Humidity In Range"
                    value={show(report.environment.humidityInRangePct, "%")}
                    sub="of recorded readings"
                    tone={report.environment.humidityInRangePct >= 90 ? "emerald" : "amber"}
                  />
                </div>

                {chartData.length > 0 && (
                  <div className="mt-5 h-72 w-full rounded-2xl bg-slate-50/60 p-4 ring-1 ring-slate-100">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={24} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="temp" name="Temp (°C)" stroke="#e11d48" dot={false} strokeWidth={2} connectNulls />
                        <Line type="monotone" dataKey="humidity" name="Humidity (%)" stroke="#0284c7" dot={false} strokeWidth={2} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="mt-5">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Out-of-range readings ({report.environment.deviations.length})
                  </p>
                  <SimpleTable
                    head={["Timestamp", "Reading", "Value"]}
                    rows={report.environment.deviations.map((d) => [
                      fmtDateTime(d.at),
                      d.kind === "temperature" ? "Temperature" : "Humidity",
                      d.kind === "temperature" ? `${d.value} °C` : `${d.value} %`,
                    ])}
                    emptyText="Every recorded reading stayed within range."
                  />
                </div>
              </Section>

              {/* Actuators */}
              <Section
                icon={Wind}
                title="Actuator Activity"
                subtitle={`${report.actuators.totalEvents} events over ${formatDuration(report.meta.windowMs)}`}
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {report.actuators.perActuator.map((a) => {
                    const Icon = ACTUATOR_ICONS[a.key] ?? Wind;
                    return (
                      <article key={a.key} className="rounded-3xl bg-slate-50/70 px-5 py-5 ring-1 ring-slate-100">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Icon className="h-4 w-4" />
                          <p className="text-[10px] font-bold uppercase tracking-widest">{a.label}</p>
                        </div>
                        <p className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
                          {formatDuration(a.runtimeMs)}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {a.cycles} cycles • {show(a.runtimePct, "%")} of window
                        </p>
                      </article>
                    );
                  })}
                </div>

                <div className="mt-5">
                  <SimpleTable
                    head={["Timestamp", "Actuator", "Event"]}
                    rows={report.actuators.events.map((e) => [fmtDateTime(e.at), e.label, e.state ? "ON" : "OFF"])}
                    emptyText="No actuator events recorded in this window."
                  />
                </div>
              </Section>

              {/* Candling scans */}
              <Section
                icon={Microscope}
                title="Candling Scans"
                subtitle={`${report.scans.total} scans across ${report.scans.byRound.length} round(s)`}
              >
                {report.scans.total === 0 ? (
                  <EmptyNote>No candling scans recorded for this batch.</EmptyNote>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {report.scans.byRound.map((round) => (
                        <article key={round.round} className="rounded-3xl bg-slate-50/70 px-5 py-5 ring-1 ring-slate-100">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Round {round.round || DASH}
                          </p>
                          <p className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{round.total} scans</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            Avg confidence{" "}
                            {round.avgConfidence === null ? DASH : `${Math.round(round.avgConfidence * 100)}%`}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {Object.entries(round.classes).map(([cls, count]) => (
                              <span
                                key={cls}
                                className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200"
                              >
                                {cls}: {count}
                              </span>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                      {report.scans.items
                        .filter((s) => s.imageDataUrl)
                        .map((scan) => (
                          <figure key={scan.id} className="overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-100">
                            {/* Stored as a base64 data URL, so next/image gains nothing here. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={scan.imageDataUrl} alt={scan.layer1Class || "Candling scan"} className="h-24 w-full object-cover" />
                            <figcaption className="px-2 py-1.5 text-[10px] font-medium text-slate-600">
                              R{scan.round || DASH} • {scan.layer1Class || DASH}
                            </figcaption>
                          </figure>
                        ))}
                    </div>

                    <div className="mt-5">
                      <SimpleTable
                        head={["Timestamp", "Round", "Class", "Sub-class", "Confidence"]}
                        rows={report.scans.items.map((s) => [
                          fmtDateTime(s.at),
                          s.round || DASH,
                          s.layer1Class || DASH,
                          s.layer2Class || DASH,
                          s.layer1Confidence === null ? DASH : `${Math.round(s.layer1Confidence * 100)}%`,
                        ])}
                        emptyText="No candling scans recorded."
                      />
                    </div>
                  </>
                )}
              </Section>

              {/* Alerts */}
              <Section
                icon={Bell}
                title="Alerts & Notifications"
                subtitle={`${report.alerts.total} raised during this batch`}
              >
                <SimpleTable
                  head={["Timestamp", "Type", "Title", "Message"]}
                  rows={report.alerts.items.map((a) => [
                    fmtDateTime(a.at),
                    a.type || DASH,
                    a.title || DASH,
                    a.message || DASH,
                  ])}
                  emptyText="No alerts raised during this window."
                />
              </Section>

              {/* Hatch metrics — the numbers a hatchery actually judges on */}
              <Section
                icon={TrendingUp}
                title="Hatch Metrics"
                subtitle="Fertility and hatchability for this batch"
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Tile
                    label="Fertility Rate"
                    value={show(hatchMetrics.fertilityRate, "%")}
                    sub={`${hatchMetrics.fertileEggs} fertile of ${hatchMetrics.totalEggs} set`}
                  />
                  <Tile
                    label="Hatch of Fertile"
                    value={show(hatchMetrics.hatchOfFertile, "%")}
                    sub="Judges the incubation, not the eggs"
                    tone="emerald"
                  />
                  <Tile
                    label="Dead in Shell"
                    value={show(hatchMetrics.deadInShell)}
                    sub={`${show(hatchMetrics.deadInShellRate, "%")} of fertile eggs`}
                    tone="rose"
                  />
                  <Tile
                    label="Infertile"
                    value={hatchMetrics.infertileEggs}
                    sub="Removed at candling"
                  />
                </div>
                <p className="mt-4 text-[11px] text-slate-500">
                  Fleet-wide comparison across every batch is on the{" "}
                  <Link href="/hatch-analysis" className="font-semibold text-[#004a87] underline">
                    Hatch Analysis
                  </Link>{" "}
                  page.
                </p>
              </Section>

              {/* Power — derived, since the hardware reports no power figure */}
              <Section
                icon={Zap}
                title="Power Consumption"
                subtitle="Estimated from this batch's actuator runtime"
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Tile label="Energy Logged" value={`${show(energy.totalKwh)} kWh`} sub="From recorded runtime only" />
                  <Tile
                    label="Estimated Cost"
                    value={`${DEFAULT_CURRENCY}${show(energy.totalCost)}`}
                    sub={`At ${DEFAULT_CURRENCY}${energy.tariff}/kWh`}
                    tone="amber"
                  />
                  <Tile
                    label="Projected Full Window"
                    value={energy.projectedKwh === null ? DASH : `${energy.projectedKwh} kWh`}
                    sub={
                      energy.projectedKwh === null
                        ? "Needs a coverage figure to project"
                        : `Scaled up from ${energy.coveragePct}% logging coverage`
                    }
                  />
                  <Tile
                    label="Cost per Chick"
                    value={
                      costPerChick(energy.totalCost, report.outcome.hatchedEggs) === null
                        ? DASH
                        : `${DEFAULT_CURRENCY}${costPerChick(energy.totalCost, report.outcome.hatchedEggs)}`
                    }
                    sub="Logged energy ÷ chicks hatched"
                    tone="indigo"
                  />
                </div>

                <div className="mt-5">
                  <SimpleTable
                    head={["Actuator", "Rated W", "Runtime", "kWh", "Cost"]}
                    rows={energy.breakdown.map((row) => [
                      row.label,
                      `${row.watts} W`,
                      formatDuration(row.runtimeMs),
                      row.kwh,
                      `${DEFAULT_CURRENCY}${row.cost}`,
                    ])}
                    emptyText="No actuator runtime recorded for this batch."
                  />
                </div>

                <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-800 ring-1 ring-amber-100">
                  Estimate, not a measurement — the incubator reports no current or power reading, so
                  this is actuator ON time × assumed wattage. Adjust the wattages on the{" "}
                  <Link href="/power-consumption" className="font-semibold underline">
                    Power Consumption
                  </Link>{" "}
                  page to match your hardware.
                </div>
              </Section>

              {/* Validation of system output */}
              <Section
                icon={ShieldCheck}
                title="Validation of System Output"
                subtitle="Sensor plausibility and candling-model agreement"
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Tile
                    label="Sensor Health"
                    value={show(sensorHealth.healthyPct, "%")}
                    sub={`${sensorHealth.issues.length} suspect of ${sensorHealth.checked} readings`}
                    tone={sensorHealth.healthyPct >= 95 ? "emerald" : "amber"}
                  />
                  <Tile
                    label="Sensor Failures"
                    value={sensorHealth.byType.sentinel ?? 0}
                    sub="Readings where the sensor reported a fault"
                  />
                  <Tile
                    label="Implausible Jumps"
                    value={sensorHealth.byType.spike ?? 0}
                    sub="Changes too fast to be physically real"
                  />
                  <Tile
                    label="Model Accuracy"
                    value={show(scanAccuracy.accuracyPct, "%")}
                    sub={
                      scanAccuracy.scored === 0
                        ? "No confirmed scans in this batch yet"
                        : `${scanAccuracy.correct} agreed, ${scanAccuracy.corrected} corrected`
                    }
                  />
                </div>

                {reconciliation.applicable && (
                  <div
                    className={`mt-5 rounded-2xl px-5 py-4 text-[11px] leading-relaxed ring-1 ${
                      reconciliation.verdict === "consistent"
                        ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
                        : "bg-amber-50 text-amber-800 ring-amber-100"
                    }`}
                  >
                    <p className="text-xs font-semibold">
                      Candling vs actual hatch: {reconciliation.verdict.replace("-", " ")}
                    </p>
                    <p className="mt-1">
                      {reconciliation.culledByScan} egg{reconciliation.culledByScan === 1 ? "" : "s"} were
                      written off at candling, leaving {reconciliation.expectedViable} expected viable.{" "}
                      {reconciliation.hatchedEggs} actually hatched.
                      {reconciliation.verdict === "over-culled" &&
                        ` More hatched than the scans said were viable, so ${reconciliation.discrepancy} egg${
                          reconciliation.discrepancy === 1 ? " was" : "s were"
                        } written off incorrectly.`}
                      {reconciliation.verdict === "under-performed" &&
                        " Far fewer hatched than the candling results predicted — worth checking the environment log above."}
                    </p>
                  </div>
                )}

                {sensorHealth.issues.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Suspect readings
                    </p>
                    <SimpleTable
                      head={["Timestamp", "Reading", "Type", "Detail"]}
                      rows={sensorHealth.issues.map((issue) => [
                        fmtDateTime(issue.at),
                        issue.kind === "temperature" ? "Temperature" : "Humidity",
                        issue.type,
                        issue.detail,
                      ])}
                      emptyText="No suspect readings."
                    />
                  </div>
                )}
              </Section>

              {report.meta.notes && (
                <Section icon={Droplets} title="Batch Notes">
                  <p className="text-xs leading-relaxed text-slate-600">{report.meta.notes}</p>
                </Section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
