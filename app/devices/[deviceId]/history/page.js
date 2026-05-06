// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  orderBy,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import BreadcrumbNav from "@/components/BreadcrumbNav";
import Link from "next/link";
import {
  ChevronLeft,
  AlertTriangle,
  Thermometer,
  Droplets,
  Heater,
  Wind,
  CloudRain,
  RotateCcw,
  RefreshCw,
  CalendarDays,
  Timer,
  FileDown,
  FileSpreadsheet,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { LOG_INTERVAL_KEY } from "@/lib/useDeviceHistoryLogger";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ── helpers ─────────────────────────────────────────────────────────────────

function toLocalDatetimeValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000); // last 24 h
  return { from: toLocalDatetimeValue(from), to: toLocalDatetimeValue(to) };
}

const ACTUATOR_META = {
  heaterBulb:  { label: "Heater",     Icon: Heater,    on: "text-emerald-600 bg-emerald-50", off: "text-rose-500 bg-rose-50" },
  fan:         { label: "Fan",        Icon: Wind,      on: "text-emerald-600 bg-emerald-50", off: "text-slate-500 bg-slate-100" },
  humidifier:  { label: "Humidifier", Icon: CloudRain, on: "text-emerald-600 bg-emerald-50", off: "text-slate-500 bg-slate-100" },
  eggTurner:   { label: "Egg Turner", Icon: RotateCcw, on: "text-emerald-600 bg-emerald-50", off: "text-slate-500 bg-slate-100" },
};

function Pagination({ page, setPage, total, perPage }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
      <span className="text-[11px] text-slate-400">
        {Math.min((page - 1) * perPage + 1, total)}&ndash;{Math.min(page * perPage, total)} of {total}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-40"
        >&lsaquo; Prev</button>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-40"
        >Next &rsaquo;</button>
      </div>
    </div>
  );
}

function formatTs(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ── component ────────────────────────────────────────────────────────────────

export default function DeviceHistoryPage() {
  const { deviceId } = useParams();
  const router = useRouter();

  const [authorized, setAuthorized] = useState(null);
  const [nickname, setNickname] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [range, setRange] = useState(defaultRange());
  const [loading, setLoading] = useState(false);
  const [logInterval, setLogInterval] = useState(() => {
    try { return localStorage.getItem(LOG_INTERVAL_KEY) || "60000"; } catch { return "60000"; }
  });

  const handleIntervalChange = (val) => {
    setLogInterval(val);
    try { localStorage.setItem(LOG_INTERVAL_KEY, val); } catch {}
  };

  const exportToPDF = () => {
    const pdf = new jsPDF();
    const dateLabel = `${range.from.replace("T", " ")} → ${range.to.replace("T", " ")}`;
    pdf.setFontSize(14);
    pdf.text("Eggcubator – Sensor History", 14, 15);
    pdf.setFontSize(9);
    pdf.text(`Device: ${nickname || deviceId}`, 14, 22);
    pdf.text(`Range: ${dateLabel}`, 14, 27);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 32);

    autoTable(pdf, {
      startY: 38,
      head: [["Timestamp", "Temp (°C)", "Humidity (%)", "Water"]],
      body: [...sensorRows].reverse().map((r) => [
        formatTs(r.createdAt),
        typeof r.tempC === "number" ? r.tempC.toFixed(1) : "—",
        typeof r.humidity === "number" ? r.humidity.toFixed(1) : "—",
        r.waterLow === true ? "Low" : r.waterLow === false ? "OK" : "—",
      ]),
      styles: { fontSize: 8 },
    });

    const afterSensor = pdf.lastAutoTable.finalY + 8;
    pdf.setFontSize(11);
    pdf.text("Actuator Events", 14, afterSensor);
    autoTable(pdf, {
      startY: afterSensor + 4,
      head: [["Timestamp", "Actuator", "Event"]],
      body: activityRows.map((r) => [
        formatTs(r.createdAt),
        r.label || r.actuator,
        r.state ? "ON" : "OFF",
      ]),
      styles: { fontSize: 8 },
    });

    pdf.save(`Sensor_History_${deviceId}_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportToExcel = () => {
    const sensorData = [...sensorRows].reverse().map((r) => ({
      Timestamp: formatTs(r.createdAt),
      "Temperature (°C)": typeof r.tempC === "number" ? r.tempC.toFixed(1) : "",
      "Humidity (%)": typeof r.humidity === "number" ? r.humidity.toFixed(1) : "",
      Water: r.waterLow === true ? "Low" : r.waterLow === false ? "OK" : "",
    }));
    const activityData = activityRows.map((r) => ({
      Timestamp: formatTs(r.createdAt),
      Actuator: r.label || r.actuator,
      Event: r.state ? "ON" : "OFF",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sensorData), "Sensor Readings");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activityData), "Actuator Events");
    XLSX.writeFile(wb, `Sensor_History_${deviceId}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const [sensorRows, setSensorRows] = useState([]);
  const [activityRows, setActivityRows] = useState([]);
  const [sensorPage, setSensorPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const ROWS_PER_PAGE = 20;

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace("/login"); return; }
      const snap = await getDoc(doc(firestore, "users", user.uid, "devices", deviceId));
      if (!snap.exists()) { setAuthorized(false); return; }
      setNickname(snap.data()?.nickname || deviceId);
      setAuthorized(true);
    });
    return () => unsub();
  }, [deviceId, router]);

  // Fetch data whenever range or auth changes
  const fetchData = async () => {
    if (!authorized || !deviceId) return;
    setLoading(true);
    try {
      const fromTs = Timestamp.fromDate(new Date(range.from));
      const toTs   = Timestamp.fromDate(new Date(range.to));

      const [sSnap, aSnap] = await Promise.all([
        getDocs(query(
          collection(firestore, "devices", deviceId, "history"),
          where("createdAt", ">=", fromTs),
          where("createdAt", "<=", toTs),
          orderBy("createdAt", "asc"),
        )),
        getDocs(query(
          collection(firestore, "devices", deviceId, "activityLog"),
          where("createdAt", ">=", fromTs),
          where("createdAt", "<=", toTs),
          orderBy("createdAt", "desc"),
        )),
      ]);

      setSensorRows(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setActivityRows(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSensorPage(1);
      setActivityPage(1);
    } catch (e) {
      console.error("[HistoryPage] fetch failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authorized) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  // Chart data
  const chartData = useMemo(() => {
    return sensorRows.map((r) => {
      const d = r.createdAt?.toDate?.() ?? null;
      return {
        time: d
          ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
          : "",
        temp: typeof r.tempC === "number" ? parseFloat(r.tempC.toFixed(1)) : null,
        humidity: typeof r.humidity === "number" ? parseFloat(r.humidity.toFixed(1)) : null,
      };
    });
  }, [sensorRows]);

  // ── guards ─────────────────────────────────────────────────────────
  if (authorized === null) return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#004a87] border-t-transparent" />
    </div>
  );

  if (authorized === false) return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-12 w-12 text-amber-400" />
      <Link href="/dashboard" className="rounded-2xl bg-[#004a87] px-4 py-2 text-sm font-semibold text-white">
        Back to Dashboard
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="Device History" onOpenSidebar={() => setIsSidebarOpen(true)} />

          <BreadcrumbNav deviceId={deviceId} deviceName={nickname} currentPage="History" />

          {/* Export buttons */}
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-base font-bold tracking-tight text-slate-900">Historical Data</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportToPDF}
                disabled={sensorRows.length === 0 && activityRows.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
              >
                <FileDown className="h-4 w-4" />
                PDF
              </button>
              <button
                onClick={exportToExcel}
                disabled={sensorRows.length === 0 && activityRows.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </button>
            </div>
          </div>

          {/* ── Recording interval ─────────────────────────────────── */}
          <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <Timer className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sensor Recording Interval</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[11px] text-slate-500">Save a sensor reading every:</p>
              <select
                value={logInterval}
                onChange={(e) => handleIntervalChange(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#004a87]/30"
              >
                <option value="10000">10 seconds</option>
                <option value="30000">30 seconds</option>
                <option value="60000">1 minute</option>
                <option value="120000">2 minutes</option>
                <option value="300000">5 minutes</option>
                <option value="600000">10 minutes</option>
              </select>
              <p className="text-[10px] text-slate-400">(applies immediately — no page reload needed)</p>
            </div>
          </div>

          {/* ── Date / time range picker ─────────────────────────────── */}
          <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date &amp; Time Range</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-slate-500">From</label>
                <input
                  type="datetime-local"
                  value={range.from}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#004a87]/30"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-slate-500">To</label>
                <input
                  type="datetime-local"
                  value={range.to}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#004a87]/30"
                />
              </div>
              <div className="flex gap-2">
                {/* Quick ranges */}
                {[
                  { label: "1 h",  ms: 1 * 60 * 60 * 1000 },
                  { label: "6 h",  ms: 6 * 60 * 60 * 1000 },
                  { label: "24 h", ms: 24 * 60 * 60 * 1000 },
                  { label: "7 d",  ms: 7 * 24 * 60 * 60 * 1000 },
                ].map(({ label, ms }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const to = new Date();
                      const from = new Date(to.getTime() - ms);
                      setRange({ from: toLocalDatetimeValue(from), to: toLocalDatetimeValue(to) });
                    }}
                    className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200"
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={fetchData}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#004a87] px-4 py-2 text-[11px] font-semibold text-white transition hover:bg-[#003d72] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  Apply
                </button>
              </div>
            </div>
          </div>

          {/* ── Sensor charts ─────────────────────────────────────────── */}
          <div className="rounded-2xl bg-white px-5 py-5 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center gap-2 mb-4">
              <Thermometer className="h-4 w-4 text-rose-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Temperature (°C)</p>
              <span className="ml-auto text-[10px] text-slate-400">{sensorRows.length} readings</span>
            </div>
            {loading ? (
              <div className="h-52 animate-pulse rounded-xl bg-slate-100" />
            ) : chartData.filter((r) => r.temp !== null).length === 0 ? (
              <p className="py-12 text-center text-xs text-slate-400">No temperature data for this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} unit="°C" width={42} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    formatter={(v) => [`${v}°C`, "Temperature"]}
                  />
                  <Line
                    type="monotone" dataKey="temp" stroke="#f43f5e"
                    strokeWidth={2} dot={false} connectNulls name="Temp (°C)"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-2xl bg-white px-5 py-5 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="h-4 w-4 text-sky-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Humidity (%)</p>
            </div>
            {loading ? (
              <div className="h-52 animate-pulse rounded-xl bg-slate-100" />
            ) : chartData.filter((r) => r.humidity !== null).length === 0 ? (
              <p className="py-12 text-center text-xs text-slate-400">No humidity data for this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" width={38} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    formatter={(v) => [`${v}%`, "Humidity"]}
                  />
                  <Line
                    type="monotone" dataKey="humidity" stroke="#0ea5e9"
                    strokeWidth={2} dot={false} connectNulls name="Humidity (%)"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Sensor readings table ──────────────────────────────────── */}
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <Thermometer className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sensor Readings</p>
            </div>
            {loading ? (
              <div className="px-5 py-6 space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : sensorRows.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-slate-400">No sensor readings for this range.</p>
            ) : (
              <div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-5 py-3 font-semibold text-slate-500">Timestamp</th>
                      <th className="px-5 py-3 font-semibold text-slate-500">Temperature</th>
                      <th className="px-5 py-3 font-semibold text-slate-500">Humidity</th>
                      <th className="px-5 py-3 font-semibold text-slate-500">Water</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[...sensorRows].reverse().slice((sensorPage - 1) * ROWS_PER_PAGE, sensorPage * ROWS_PER_PAGE).map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/60 transition">
                        <td className="px-5 py-2.5 text-slate-500 whitespace-nowrap">{formatTs(r.createdAt)}</td>
                        <td className="px-5 py-2.5 font-medium text-rose-600">
                          {typeof r.tempC === "number" ? `${r.tempC.toFixed(1)} °C` : "—"}
                        </td>
                        <td className="px-5 py-2.5 font-medium text-sky-600">
                          {typeof r.humidity === "number" ? `${r.humidity.toFixed(1)} %` : "—"}
                        </td>
                        <td className="px-5 py-2.5">
                          {r.waterLow === true ? (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-200">Low</span>
                          ) : r.waterLow === false ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-200">OK</span>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={sensorPage} setPage={setSensorPage} total={sensorRows.length} perPage={ROWS_PER_PAGE} />
              </div>
            )}
          </div>

          {/* ── Actuator activity log ──────────────────────────────────── */}
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <Wind className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Actuator Events</p>
              <span className="ml-auto text-[10px] text-slate-400">{activityRows.length} events</span>
            </div>
            {loading ? (
              <div className="px-5 py-6 space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : activityRows.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-slate-400">No actuator events for this range.</p>
            ) : (
              <div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-5 py-3 font-semibold text-slate-500">Timestamp</th>
                      <th className="px-5 py-3 font-semibold text-slate-500">Actuator</th>
                      <th className="px-5 py-3 font-semibold text-slate-500">Event</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {activityRows.slice((activityPage - 1) * ROWS_PER_PAGE, activityPage * ROWS_PER_PAGE).map((r) => {
                      const meta = ACTUATOR_META[r.actuator];
                      const Icon = meta?.Icon ?? Wind;
                      const colorClass = r.state
                        ? (meta?.on ?? "text-emerald-600 bg-emerald-50")
                        : (meta?.off ?? "text-slate-500 bg-slate-100");
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/60 transition">
                          <td className="px-5 py-2.5 text-slate-500 whitespace-nowrap">{formatTs(r.createdAt)}</td>
                          <td className="px-5 py-2.5">
                            <div className="inline-flex items-center gap-1.5">
                              <Icon className="h-3.5 w-3.5 text-slate-400" />
                              <span className="font-medium text-slate-700">{r.label ?? r.actuator}</span>
                            </div>
                          </td>
                          <td className="px-5 py-2.5">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                              r.state
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                : "bg-rose-50 text-rose-600 ring-rose-200"
                            }`}>
                              {r.state ? "ON" : "OFF"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={activityPage} setPage={setActivityPage} total={activityRows.length} perPage={ROWS_PER_PAGE} />
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
