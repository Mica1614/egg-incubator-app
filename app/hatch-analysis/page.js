// @ts-nocheck
"use client";

/**
 * Hatch analysis — client recommendations 1 (analysis from egg hatch),
 * 2 (power consumption) and 6 (validation of system output).
 *
 * Every metric is derived from data the app already collected; nothing here
 * needs new hardware or new firmware. Numbers whose sample size is too small to
 * mean anything say so rather than being presented as findings.
 */

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth, firestore } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { summariseBatches } from "@/lib/hatchAnalytics.mjs";
import { confidenceCalibration, scoreScanAccuracy } from "@/lib/outputValidation.mjs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import {
  TrendingUp, ShieldCheck, Egg, AlertTriangle, Info, ClipboardList, Zap,
} from "lucide-react";

const DASH = "—";
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

function Caveat({ children }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-800 ring-1 ring-amber-100">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

export default function HatchAnalysisPage() {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [batches, setBatches] = useState([]);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace("/login"); return; }

      try {
        const deviceSnap = await getDocs(collection(firestore, "users", user.uid, "devices"));
        const deviceIds = deviceSnap.docs.map((d) => d.id);

        const [batchSnap, scanSnap] = await Promise.all([
          getDocs(collection(firestore, "egg_batches")),
          getDocs(collection(firestore, "egg_scans")),
        ]);

        const owned = batchSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((b) => !b.deviceId || deviceIds.includes(b.deviceId));

        setBatches(owned);
        setScans(scanSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        setError(e?.message || "Failed to load analysis data.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const analysis = useMemo(() => summariseBatches(batches), [batches]);
  const accuracy = useMemo(() => scoreScanAccuracy(scans), [scans]);
  const calibration = useMemo(() => confidenceCalibration(scans), [scans]);

  const chartData = useMemo(
    () =>
      analysis.batches
        .filter((b) => b.hatchRate !== null)
        .slice(-12)
        .map((b) => ({ name: b.batchId || b.id?.slice(0, 5), hatch: b.hatchRate, fertile: b.hatchOfFertile })),
    [analysis]
  );

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
          <TopBar title="Hatch Analysis" onOpenSidebar={() => setIsSidebarOpen(true)} />

          {error && (
            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-700 ring-1 ring-rose-200">{error}</div>
          )}

          {analysis.completedCount === 0 ? (
            <div className="rounded-3xl bg-white px-8 py-16 text-center shadow-sm ring-1 ring-slate-100">
              <Egg className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-4 text-sm font-semibold text-slate-700">No completed batches yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Record a hatch count on a batch and its analysis will appear here.
              </p>
              <Link
                href="/batch-history"
                className="mt-5 inline-block rounded-2xl bg-[#004a87] px-4 py-2 text-xs font-semibold text-white"
              >
                Go to Batch History
              </Link>
            </div>
          ) : (
            <>
              {/* ── Hatch performance (recommendation 1) ─────────────────── */}
              <Section
                icon={TrendingUp}
                title="Hatch Performance"
                subtitle={`${analysis.completedCount} completed of ${analysis.totalCount} batches • ${analysis.totalSet} eggs set`}
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Tile
                    label="Fertility Rate"
                    value={show(analysis.fertilityRate, "%")}
                    sub="Fertile eggs ÷ eggs set. Judges the eggs, not the machine."
                  />
                  <Tile
                    label="Hatch Rate"
                    value={show(analysis.hatchRate, "%")}
                    sub="Chicks ÷ eggs set. The headline figure."
                    tone="indigo"
                  />
                  <Tile
                    label="Hatch of Fertile"
                    value={show(analysis.hatchOfFertile, "%")}
                    sub="Chicks ÷ fertile eggs. Judges the incubation itself."
                    tone="emerald"
                  />
                  <Tile
                    label="Dead in Shell"
                    value={show(analysis.deadInShellRate, "%")}
                    sub={`${analysis.totalDeadInShell} fertile eggs that developed but never hatched.`}
                    tone="rose"
                  />
                </div>

                {chartData.length > 0 && (
                  <div className="mt-5 h-72 w-full rounded-2xl bg-slate-50/60 p-4 ring-1 ring-slate-100">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} unit="%" />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="hatch" name="Hatch rate" radius={[6, 6, 0, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={entry.hatch >= 70 ? "#059669" : entry.hatch >= 40 ? "#d97706" : "#e11d48"}
                            />
                          ))}
                        </Bar>
                        <Bar dataKey="fertile" name="Hatch of fertile" fill="#0284c7" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {analysis.best && (
                    <div className="rounded-2xl bg-emerald-50 px-5 py-4 ring-1 ring-emerald-100">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Best batch</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-900">{analysis.best.batchId || DASH}</p>
                      <p className="mt-0.5 text-[11px] text-emerald-700">
                        {show(analysis.best.hatchRate, "%")} hatch • {analysis.best.totalEggs} eggs •{" "}
                        {analysis.best.eggType || DASH}
                      </p>
                    </div>
                  )}
                  {analysis.worst && (
                    <div className="rounded-2xl bg-rose-50 px-5 py-4 ring-1 ring-rose-100">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">Weakest batch</p>
                      <p className="mt-1 text-sm font-semibold text-rose-900">{analysis.worst.batchId || DASH}</p>
                      <p className="mt-0.5 text-[11px] text-rose-700">
                        {show(analysis.worst.hatchRate, "%")} hatch • {analysis.worst.totalEggs} eggs •{" "}
                        {analysis.worst.eggType || DASH}
                      </p>
                    </div>
                  )}
                </div>

                {analysis.byEggType.length > 1 && (
                  <div className="mt-5 overflow-x-auto rounded-2xl ring-1 ring-slate-100">
                    <table className="min-w-[520px] w-full border-collapse text-left">
                      <thead className="bg-slate-50">
                        <tr className="border-b border-slate-200">
                          {["Egg type", "Batches", "Eggs set", "Hatch rate", "Hatch of fertile"].map((h) => (
                            <th key={h} className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.byEggType.map((group) => (
                          <tr key={group.eggType} className="border-b border-slate-100 last:border-0">
                            <td className="py-2.5 px-3 text-xs font-semibold capitalize text-slate-800">{group.eggType}</td>
                            <td className="py-2.5 px-3 text-xs text-slate-600">{group.batches}</td>
                            <td className="py-2.5 px-3 text-xs text-slate-600">{group.set}</td>
                            <td className="py-2.5 px-3 text-xs text-slate-600">{show(group.hatchRate, "%")}</td>
                            <td className="py-2.5 px-3 text-xs text-slate-600">{show(group.hatchOfFertile, "%")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              {/* ── Validation of system output (recommendation 6) ───────── */}
              <Section
                icon={ShieldCheck}
                title="Validation of System Output"
                subtitle="How often the candling model agreed with the operator"
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Tile
                    label="Model Accuracy"
                    value={show(accuracy.accuracyPct, "%")}
                    sub={`${accuracy.correct} agreed, ${accuracy.corrected} corrected`}
                    tone={accuracy.accuracyPct >= 80 ? "emerald" : "amber"}
                  />
                  <Tile label="Scans Scored" value={accuracy.scored} sub="Scans with both a prediction and a confirmation" />
                  <Tile
                    label="Not Scoreable"
                    value={accuracy.unscored}
                    sub="Scans recorded before confirmation was added"
                  />
                  <Tile
                    label="Confidence Gap"
                    value={show(calibration.separation)}
                    sub="Confidence when right, minus when wrong. Higher is better."
                  />
                </div>

                {!accuracy.isIndicative && (
                  <Caveat>
                    Only {accuracy.scored} scan{accuracy.scored === 1 ? " has" : "s have"} both a model
                    prediction and an operator confirmation, which is too few to draw a conclusion from.
                    The accuracy figure becomes meaningful at around 10 confirmed scans. Every scan you
                    confirm or correct on the scanner adds to it.
                  </Caveat>
                )}

                {Object.keys(accuracy.confusion).length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Where the model went wrong
                    </p>
                    <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-100">
                      <table className="min-w-[420px] w-full border-collapse text-left">
                        <thead className="bg-slate-50">
                          <tr className="border-b border-slate-200">
                            {["Model said", "Operator confirmed", "Count"].map((h) => (
                              <th key={h} className="py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(accuracy.confusion).flatMap(([predicted, finals]) =>
                            Object.entries(finals).map(([final, count]) => (
                              <tr key={`${predicted}-${final}`} className="border-b border-slate-100 last:border-0">
                                <td className="py-2.5 px-3 text-xs capitalize text-slate-700">{predicted}</td>
                                <td className="py-2.5 px-3 text-xs capitalize text-slate-700">
                                  {final}
                                  {predicted !== final && (
                                    <span className="ml-2 inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                                      corrected
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-xs font-semibold text-slate-800">{count}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-start gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-[11px] leading-relaxed text-sky-800 ring-1 ring-sky-100">
                  <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>
                    Per-batch validation — including sensor plausibility checks and a cross-check of
                    culled eggs against what actually hatched — appears on each batch&apos;s report page.
                  </p>
                </div>
              </Section>

              <Link
                href="/power-consumption"
                className="flex items-center gap-3 rounded-3xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-100 transition hover:ring-sky-200"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <Zap className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold tracking-tight text-slate-900">Power Consumption</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Estimated energy use and running cost, with editable equipment ratings.
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-[#004a87]">Open →</span>
              </Link>

              {analysis.completedCount < 4 && (
                <div className="flex items-start gap-2 rounded-2xl bg-slate-100 px-5 py-4 text-[11px] leading-relaxed text-slate-600">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <p>
                    These figures are based on {analysis.completedCount} completed batch
                    {analysis.completedCount === 1 ? "" : "es"}. Treat them as a starting picture rather
                    than a trend until more batches finish.
                  </p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
