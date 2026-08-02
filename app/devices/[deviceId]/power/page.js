// @ts-nocheck
"use client";

/**
 * Per-device power consumption.
 *
 * Live draw is exact — it is just the wattage of whatever is switched on right
 * now. The cumulative figures are estimates limited by how much actuator
 * history got logged, and say so.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { useIncubatorDevices } from "@/lib/useIncubatorDevices";
import { useNowTick, isDeviceOnline } from "@/lib/useNowTick";
import { useDeviceEnergy } from "@/lib/useDeviceEnergy";
import { usePowerSettings } from "@/lib/usePowerSettings";
import { liveDraw, DEFAULT_CURRENCY } from "@/lib/powerEstimate.mjs";
import { formatDuration, ACTUATOR_LABELS } from "@/lib/batchReport.mjs";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import BreadcrumbNav from "@/components/BreadcrumbNav";
import NumberField from "@/components/NumberField";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Zap, AlertTriangle, Info, Gauge, Activity, RefreshCw } from "lucide-react";

const DASH = "—";
const BAR_COLORS = ["#e11d48", "#0284c7", "#059669", "#d97706"];

function Tile({ label, value, sub, tone = "slate" }) {
  const tones = {
    slate: "text-slate-900",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    indigo: "text-indigo-600",
  };
  return (
    <article className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${tones[tone] ?? tones.slate}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{sub}</p>}
    </article>
  );
}

export default function DevicePowerPage() {
  const { deviceId } = useParams();
  const router = useRouter();

  const [authorized, setAuthorized] = useState(null);
  const [nickname, setNickname] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { settings, setRating, update } = usePowerSettings();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace("/login"); return; }
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

  const { devices } = useIncubatorDevices(authorized ? [deviceId] : []);
  const live = useMemo(() => devices[deviceId] || {}, [devices, deviceId]);

  // Ticking clock, not Date.now() at render time — see lib/useNowTick.js.
  const now = useNowTick(5000);
  const isOnline = isDeviceOnline(live, now);

  const { energy, loading, error, firstEvent, windowMs, reload } = useDeviceEnergy(
    deviceId,
    authorized === true
  );

  const draw = useMemo(
    () => liveDraw(live, settings.ratings, isOnline),
    [live, settings, isOnline]
  );

  const chartData = useMemo(
    () => energy.breakdown.filter((r) => r.kwh > 0).map((r) => ({ name: r.label, kwh: r.kwh })),
    [energy]
  );

  // At the current draw, what a full day would cost if nothing changed.
  const dailyAtCurrentDraw = useMemo(
    () => Math.round(((draw.watts * 24) / 1000) * settings.tariff * 100) / 100,
    [draw, settings.tariff]
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

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="Power" onOpenSidebar={() => setIsSidebarOpen(true)} />
          <BreadcrumbNav deviceId={deviceId} deviceName={nickname} currentPage="Power" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-slate-900">Power Consumption</h1>
                <p className="text-[11px] text-slate-400">{nickname}</p>
              </div>
            </div>
            <button
              onClick={reload}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {error && (
            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-700 ring-1 ring-rose-200">{error}</div>
          )}

          {/* ── Live draw — exact, needs no history ────────────────────── */}
          <section className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Right Now</p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Tile
                label="Current Draw"
                value={isOnline ? `${draw.watts} W` : DASH}
                sub={
                  !isOnline
                    ? "Device is offline — nothing observable"
                    : draw.active.length
                      ? `${draw.active.map((a) => ACTUATOR_LABELS[a.key] ?? a.key).join(", ")} running`
                      : "All actuators idle"
                }
                tone={draw.watts > 0 ? "amber" : "slate"}
              />
              <Tile
                label="If Sustained, per Day"
                value={isOnline ? `${DEFAULT_CURRENCY}${dailyAtCurrentDraw}` : DASH}
                sub={`${Math.round((draw.watts * 24) / 10) / 100} kWh at the current draw`}
              />
              <Tile
                label="Full Load"
                value={`${Object.values(settings.ratings).reduce((a, b) => a + b, 0)} W`}
                sub="Everything switched on at once"
              />
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
              This figure is exact — it is simply the rated wattage of whatever is switched on at this
              moment. It does not depend on logging history.
            </p>
          </section>

          {/* ── Recorded history — estimate ────────────────────────────── */}
          <section className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Recorded History
              </p>
            </div>

            {loading ? (
              <div className="mt-5 h-24 animate-pulse rounded-2xl bg-slate-100" />
            ) : energy.totalKwh === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                <p className="text-xs font-medium text-slate-500">No actuator runtime recorded yet.</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Runtime is logged while this device&apos;s control page is open in a browser.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Tile label="Energy Logged" value={`${energy.totalKwh} kWh`} sub="From recorded runtime" />
                  <Tile
                    label="Estimated Cost"
                    value={`${DEFAULT_CURRENCY}${energy.totalCost}`}
                    sub={`At ${DEFAULT_CURRENCY}${energy.tariff}/kWh`}
                    tone="amber"
                  />
                  <Tile
                    label="Logging Since"
                    value={firstEvent ? firstEvent.toLocaleDateString() : DASH}
                    sub={windowMs ? `${formatDuration(windowMs)} elapsed` : ""}
                  />
                  <Tile
                    label="Biggest Draw"
                    value={energy.breakdown[0]?.label ?? DASH}
                    sub={
                      energy.breakdown[0]
                        ? `${energy.breakdown[0].runtimeHours} h at ${energy.breakdown[0].watts} W`
                        : ""
                    }
                    tone="emerald"
                  />
                </div>

                {chartData.length > 0 && (
                  <div className="mt-5 h-60 w-full rounded-2xl bg-slate-50/60 p-4 ring-1 ring-slate-100">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} unit=" kWh" width={70} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                        <Bar dataKey="kwh" name="kWh" radius={[6, 6, 0, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell key={entry.name} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="mt-5 overflow-x-auto rounded-2xl ring-1 ring-slate-100">
                  <table className="min-w-[600px] w-full border-collapse text-left">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200">
                        {["Actuator", "Rated watts", "Runtime", "Cycles", "kWh", "Cost"].map((h) => (
                          <th key={h} className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {energy.breakdown.map((row) => (
                        <tr key={row.key} className="border-b border-slate-100 last:border-0">
                          <td className="py-2.5 px-3 text-xs font-semibold text-slate-800">{row.label}</td>
                          <td className="py-2.5 px-3">
                            <NumberField
                              value={settings.ratings[row.key]}
                              onChange={(watts) => setRating(row.key, watts)}
                              suffix="W"
                              aria-label={`${row.label} rated watts`}
                              className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10"
                            />
                            {/* A negative or unusable entry is ignored by the
                                estimator, so say which figure is actually in use
                                rather than letting the two diverge silently. */}
                            {Number(settings.ratings[row.key]) !== row.watts && (
                              <p className="mt-1 text-[10px] font-medium text-amber-600">
                                Using {row.watts} W
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-600">{formatDuration(row.runtimeMs)}</td>
                          <td className="py-2.5 px-3 text-xs text-slate-600">{row.cycles}</td>
                          <td className="py-2.5 px-3 text-xs font-semibold text-slate-800">{row.kwh}</td>
                          <td className="py-2.5 px-3 text-xs text-slate-600">
                            {DEFAULT_CURRENCY}{row.cost}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400" htmlFor="tariff">
                    Electricity rate ({DEFAULT_CURRENCY} per kWh)
                  </label>
                  <NumberField
                    id="tariff"
                    value={settings.tariff}
                    onChange={(tariff) => update({ tariff })}
                    className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10"
                  />
                  <p className="text-[11px] text-slate-400">Shared with every other device and report.</p>
                </div>
              </>
            )}

            <div className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-800 ring-1 ring-amber-100">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                Cumulative figures are estimates. Actuator events are only recorded while this
                device&apos;s control page is open in a browser, so unlogged periods are missing
                entirely — the real total is <strong>higher</strong> than shown, never lower.
              </p>
            </div>
          </section>

          <Link
            href="/power-consumption"
            className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100 transition hover:ring-sky-200"
          >
            <Zap className="h-4 w-4 text-amber-500" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-900">All devices</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Fleet-wide energy, cost and cost per chick.</p>
            </div>
            <span className="text-[11px] font-semibold text-[#004a87]">Open →</span>
          </Link>
        </main>
      </div>
    </div>
  );
}
