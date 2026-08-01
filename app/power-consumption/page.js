// @ts-nocheck
"use client";

/**
 * Power consumption — client recommendation 2.
 *
 * The incubator firmware reports no current or power reading: RTDB device state
 * carries only temperature, humidity, water level and actuator booleans. So
 * every figure here is derived — measured actuator ON time × a wattage the user
 * enters — and is labelled as an estimate throughout.
 */

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth, firestore } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { summariseActuators, formatDuration } from "@/lib/batchReport.mjs";
import { estimatePower, costPerChick, DEFAULT_CURRENCY } from "@/lib/powerEstimate.mjs";
import { usePowerSettings } from "@/lib/usePowerSettings";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Zap, Info, Gauge, Monitor, TrendingUp, AlertTriangle } from "lucide-react";

const DASH = "—";
const show = (v, suffix = "") => (v === null || v === undefined ? DASH : `${v}${suffix}`);

const BAR_COLORS = ["#e11d48", "#0284c7", "#059669", "#d97706"];

function Tile({ label, value, sub, tone = "slate" }) {
  const tones = {
    slate: "text-slate-900",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    indigo: "text-indigo-600",
  };
  return (
    <article className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-slate-100">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${tones[tone] ?? tones.slate}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{sub}</p>}
    </article>
  );
}

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-[#004a87]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-tight text-slate-900">{title}</p>
          {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function PowerConsumptionPage() {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [devices, setDevices] = useState([]);
  const [totalHatched, setTotalHatched] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { settings, update, setRating } = usePowerSettings();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace("/login"); return; }

      try {
        const deviceSnap = await getDocs(collection(firestore, "users", user.uid, "devices"));
        const owned = deviceSnap.docs.map((d) => ({ id: d.id, nickname: d.data()?.nickname || d.id }));

        const withActivity = await Promise.all(
          owned.map(async (device) => {
            const snap = await getDocs(
              collection(firestore, "devices", device.id, "activityLog")
            ).catch(() => null);
            const events = snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
            return { ...device, events };
          })
        );

        // Chicks hatched across owned devices, for the cost-per-chick figure.
        const batchSnap = await getDocs(collection(firestore, "egg_batches"));
        const ownedIds = owned.map((d) => d.id);
        const hatched = batchSnap.docs
          .map((d) => d.data())
          .filter((b) => !b.deviceId || ownedIds.includes(b.deviceId))
          .reduce((sum, b) => sum + (Number(b.hatchedEggs) || 0), 0);

        setDevices(withActivity);
        setTotalHatched(hatched);
      } catch (e) {
        setError(e?.message || "Failed to load actuator history.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  /**
   * Runtime per device, then per actuator. Uses the same ON/OFF pairing as the
   * batch report rather than a second implementation, so a trailing unmatched
   * ON is handled identically in both places.
   */
  const perDevice = useMemo(
    () =>
      devices.map((device) => {
        const dates = device.events
          .map((e) => e.createdAt?.toDate?.() ?? null)
          .filter(Boolean)
          .sort((a, b) => a - b);

        const first = dates[0] ?? null;
        const end = new Date();
        const windowMs = first ? Math.max(0, end.getTime() - first.getTime()) : 0;

        const summary = summariseActuators(device.events, end, windowMs);
        const energy = estimatePower({
          perActuator: summary.perActuator,
          ratings: settings.ratings,
          tariff: settings.tariff,
        });

        return { ...device, windowMs, firstEvent: first, summary, energy };
      }),
    [devices, settings]
  );

  /** Fleet totals — actuator runtime summed across every owned device. */
  const fleet = useMemo(() => {
    const merged = {};
    for (const device of perDevice) {
      for (const actuator of device.summary.perActuator) {
        if (!merged[actuator.key]) {
          merged[actuator.key] = { key: actuator.key, label: actuator.label, runtimeMs: 0, cycles: 0 };
        }
        merged[actuator.key].runtimeMs += actuator.runtimeMs;
        merged[actuator.key].cycles += actuator.cycles;
      }
    }
    return estimatePower({
      perActuator: Object.values(merged),
      ratings: settings.ratings,
      tariff: settings.tariff,
    });
  }, [perDevice, settings]);

  const chartData = useMemo(
    () => fleet.breakdown.filter((row) => row.kwh > 0).map((row) => ({ name: row.label, kwh: row.kwh })),
    [fleet]
  );

  const hasRuntime = fleet.breakdown.some((row) => row.runtimeMs > 0);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#004a87] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="Power Consumption" onOpenSidebar={() => setIsSidebarOpen(true)} />

          {error && (
            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-700 ring-1 ring-rose-200">{error}</div>
          )}

          {/* The estimate caveat leads, rather than being buried at the bottom.
              These numbers are not measurements and the user should know before
              reading them, not after. */}
          <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-5 py-4 text-[11px] leading-relaxed text-amber-800 ring-1 ring-amber-100">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>These are estimates, not meter readings.</strong> The incubator reports no
              current or power value, so consumption is calculated as measured actuator ON time × the
              wattage you enter below. Actuator events are also only recorded while a device control
              page is open in a browser, so unlogged periods are missing — the real figure is{" "}
              <strong>higher</strong> than what is shown here, never lower.
            </p>
          </div>

          {!hasRuntime ? (
            <div className="rounded-3xl bg-white px-8 py-16 text-center shadow-sm ring-1 ring-slate-100">
              <Zap className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-4 text-sm font-semibold text-slate-700">No actuator runtime recorded yet</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Runtime is logged while a device control page is open. Open one and leave it running to
                start building a consumption history.
              </p>
              <Link
                href="/dashboard"
                className="mt-5 inline-block rounded-2xl bg-[#004a87] px-4 py-2 text-xs font-semibold text-white"
              >
                Go to Dashboard
              </Link>
            </div>
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Tile label="Energy Logged" value={`${show(fleet.totalKwh)} kWh`} sub="Across all your devices" />
                <Tile
                  label="Estimated Cost"
                  value={`${DEFAULT_CURRENCY}${show(fleet.totalCost)}`}
                  sub={`At ${DEFAULT_CURRENCY}${fleet.tariff}/kWh`}
                  tone="amber"
                />
                <Tile
                  label="Cost per Chick"
                  value={
                    costPerChick(fleet.totalCost, totalHatched) === null
                      ? DASH
                      : `${DEFAULT_CURRENCY}${costPerChick(fleet.totalCost, totalHatched)}`
                  }
                  sub={`${totalHatched} chicks hatched to date`}
                  tone="indigo"
                />
                <Tile
                  label="Biggest Draw"
                  value={fleet.breakdown[0]?.label ?? DASH}
                  sub={
                    fleet.breakdown[0]
                      ? `${fleet.breakdown[0].runtimeHours} h at ${fleet.breakdown[0].watts} W`
                      : "No runtime recorded"
                  }
                  tone="emerald"
                />
              </section>

              {chartData.length > 0 && (
                <Section icon={TrendingUp} title="Where the Energy Goes" subtitle="Estimated kWh by actuator">
                  <div className="h-64 w-full rounded-2xl bg-slate-50/60 p-4 ring-1 ring-slate-100">
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
                </Section>
              )}

              {/* ── Rates ────────────────────────────────────────────────── */}
              <Section
                icon={Gauge}
                title="Equipment Ratings & Tariff"
                subtitle="Set these to match your hardware and electricity bill — everything above recalculates"
              >
                <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-100">
                  <table className="min-w-[620px] w-full border-collapse text-left">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200">
                        {["Actuator", "Rated watts", "Total runtime", "Cycles", "kWh", "Cost"].map((h) => (
                          <th key={h} className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fleet.breakdown.map((row) => (
                        <tr key={row.key} className="border-b border-slate-100 last:border-0">
                          <td className="py-2.5 px-3 text-xs font-semibold text-slate-800">{row.label}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                value={settings.ratings[row.key] ?? ""}
                                onChange={(e) => setRating(row.key, e.target.value)}
                                className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10"
                              />
                              <span className="text-[10px] text-slate-400">W</span>
                            </div>
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
                  <label
                    className="text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                    htmlFor="tariff"
                  >
                    Electricity rate ({DEFAULT_CURRENCY} per kWh)
                  </label>
                  <input
                    id="tariff"
                    type="number"
                    min="0"
                    step="0.5"
                    value={settings.tariff}
                    onChange={(e) => update({ tariff: Number(e.target.value) })}
                    className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10"
                  />
                  <p className="text-[11px] text-slate-400">
                    Saved on this browser and used by the batch reports too.
                  </p>
                </div>
              </Section>

              {/* ── Per device ───────────────────────────────────────────── */}
              <Section
                icon={Monitor}
                title="By Device"
                subtitle={`${perDevice.length} device${perDevice.length === 1 ? "" : "s"} in your account`}
              >
                <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-100">
                  <table className="min-w-[620px] w-full border-collapse text-left">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200">
                        {["Device", "Logged since", "Heater runtime", "kWh", "Cost", ""].map((h, i) => (
                          <th key={i} className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {perDevice.map((device) => {
                        const heater = device.summary.perActuator.find((a) => a.key === "heaterBulb");
                        return (
                          <tr key={device.id} className="border-b border-slate-100 last:border-0">
                            <td className="py-2.5 px-3 text-xs font-semibold text-slate-800">{device.nickname}</td>
                            <td className="py-2.5 px-3 text-xs text-slate-500">
                              {device.firstEvent ? device.firstEvent.toLocaleDateString() : DASH}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-600">
                              {heater ? formatDuration(heater.runtimeMs) : DASH}
                            </td>
                            <td className="py-2.5 px-3 text-xs font-semibold text-slate-800">
                              {device.energy.totalKwh}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-600">
                              {DEFAULT_CURRENCY}{device.energy.totalCost}
                            </td>
                            <td className="py-2.5 px-3">
                              <Link
                                href={`/devices/${device.id}/history`}
                                className="text-[11px] font-semibold text-[#004a87] underline"
                              >
                                History
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                  Per-batch energy, scaled to that batch&apos;s logging coverage, appears on each
                  batch&apos;s report page.
                </p>
              </Section>

              <div className="flex items-start gap-2 rounded-2xl bg-slate-100 px-5 py-4 text-[11px] leading-relaxed text-slate-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p>
                  For an accurate bill figure, compare a month of these estimates against your actual
                  meter and adjust the wattages above until they line up. The runtime measurement is
                  sound; the wattages are assumptions until you calibrate them.
                </p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
