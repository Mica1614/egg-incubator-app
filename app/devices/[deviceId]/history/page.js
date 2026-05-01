// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { useIncubatorDevices } from "@/lib/useIncubatorDevices";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Link from "next/link";
import { ChevronLeft, AlertTriangle, Thermometer, Droplets } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function DeviceHistoryPage() {
  const { deviceId } = useParams();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(null);
  const [nickname, setNickname] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [readings, setReadings] = useState([]);
  const [readingsLoading, setReadingsLoading] = useState(true);

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

  useEffect(() => {
    if (!authorized) return;
    const q = query(
      collection(firestore, "devices", deviceId, "history"),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      setReadings(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse());
      setReadingsLoading(false);
    }, () => setReadingsLoading(false));
    return () => unsub();
  }, [authorized, deviceId]);

  const { devices } = useIncubatorDevices(authorized ? [deviceId] : []);
  const live = devices[deviceId] || {};

  const chartData = readings.map((r) => {
    const ts = r.createdAt?.toDate?.() || null;
    return {
      time: ts ? `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}` : "",
      temp: typeof r.tempC === "number" && r.tempC !== -999 ? parseFloat(r.tempC.toFixed(1)) : null,
      humidity: typeof r.humidity === "number" && r.humidity !== -999 ? Math.round(r.humidity) : null,
    };
  }).filter((r) => r.temp !== null || r.humidity !== null);

  if (authorized === null) return <div className="flex h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#004a87] border-t-transparent" /></div>;
  if (authorized === false) return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-12 w-12 text-amber-400" />
      <Link href="/dashboard" className="rounded-2xl bg-[#004a87] px-4 py-2 text-sm font-semibold text-white">Back to Dashboard</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />
        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="Device History" onOpenSidebar={() => setIsSidebarOpen(true)} />

          <div className="flex flex-col gap-1">
            <Link href={`/devices/${deviceId}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition">
              <ChevronLeft className="h-3 w-3" /> {nickname || deviceId}
            </Link>
            <h1 className="text-base font-bold tracking-tight text-slate-900">Sensor History</h1>
          </div>

          {/* Current live readings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Thermometer className="h-4 w-4 text-rose-400" />
                <span className="text-xs text-slate-500">Current Temp</span>
              </div>
              <p className="text-2xl font-bold text-rose-600">
                {typeof live?.tempC === "number" && live.tempC !== -999 ? `${live.tempC.toFixed(1)}°C` : "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Droplets className="h-4 w-4 text-sky-400" />
                <span className="text-xs text-slate-500">Current Humidity</span>
              </div>
              <p className="text-2xl font-bold text-sky-600">
                {typeof live?.humidity === "number" && live.humidity !== -999 ? `${Math.round(live.humidity)}%` : "—"}
              </p>
            </div>
          </div>

          {/* Temperature chart */}
          <div className="rounded-2xl bg-white px-5 py-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Temperature Trend</h2>
            {readingsLoading ? (
              <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
            ) : chartData.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-12">No historical data yet. Data is logged as the ESP32 publishes to Firestore.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="temp" stroke="#f43f5e" strokeWidth={2} dot={false} name="Temp (°C)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Humidity chart */}
          <div className="rounded-2xl bg-white px-5 py-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Humidity Trend</h2>
            {readingsLoading ? (
              <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
            ) : chartData.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-12">No historical data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="humidity" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Humidity (%)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
