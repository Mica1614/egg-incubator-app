// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { useIncubatorDevices } from "@/lib/useIncubatorDevices";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Link from "next/link";
import {
  Thermometer,
  Droplets,
  Wifi,
  WifiOff,
  Settings2,
  Egg,
  History,
  ScanLine,
  Settings,
  ChevronLeft,
  Heater,
  Droplet,
  Wind,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";

export default function DevicePage() {
  const { deviceId } = useParams();
  const router = useRouter();

  const [uid, setUid] = useState(null);
  const [nickname, setNickname] = useState("");
  const [authorized, setAuthorized] = useState(null); // null = loading, true/false
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUid(user.uid);

      // Verify user owns this device
      const ownerDoc = await getDoc(
        doc(firestore, "users", user.uid, "devices", deviceId)
      );
      if (!ownerDoc.exists()) {
        setAuthorized(false);
      } else {
        setNickname(ownerDoc.data()?.nickname || deviceId);
        setAuthorized(true);
      }
    });
    return () => unsub();
  }, [deviceId, router]);

  const { devices, loading: liveLoading, setActuator } = useIncubatorDevices(
    authorized ? [deviceId] : []
  );

  const live = devices[deviceId] || {};
  const lastSeenMs = typeof live?.lastSeen === "number" ? live.lastSeen : 0;
  const isOnline = live?.mode === "online" && (lastSeenMs === 0 || (Date.now() - lastSeenMs) < 15000);
  const tempValid = typeof live?.tempC === "number" && live.tempC !== -999;
  const humValid = typeof live?.humidity === "number" && live.humidity !== -999;

  if (authorized === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#004a87] border-t-transparent" />
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center px-4">
        <AlertTriangle className="h-12 w-12 text-amber-400" />
        <p className="text-base font-semibold text-slate-900">Access denied</p>
        <p className="text-sm text-slate-500">
          Device <span className="font-mono font-medium">{deviceId}</span> is not registered to your account.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-2xl bg-[#004a87] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#003d72]"
        >
          Back to My Incubators
        </Link>
      </div>
    );
  }

  const navLinks = [
    { href: `/devices/${deviceId}/control`, label: "Controls", icon: Settings2 },
    { href: `/devices/${deviceId}/batches`, label: "Egg Batches", icon: Egg },
    { href: `/devices/${deviceId}/scanner`, label: "Scanner", icon: ScanLine },
    { href: `/devices/${deviceId}/history`, label: "History", icon: History },
    { href: `/devices/${deviceId}/settings`, label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <TopBar title={nickname || deviceId} onOpenSidebar={() => setIsSidebarOpen(true)} />

          {/* Back + device header */}
          <div className="flex flex-col gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition"
            >
              <ChevronLeft className="h-3 w-3" />
              My Incubators
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900">
                  {nickname || deviceId}
                </h1>
                <p className="text-[10px] font-mono text-slate-400">{deviceId}</p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                  isOnline
                    ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
                    : "bg-slate-100 text-slate-500 ring-slate-200"
                }`}
              >
                {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
          </div>

          {/* Live readings */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center gap-1.5 mb-2">
                <Thermometer className="h-3.5 w-3.5 text-rose-400" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Temperature</span>
              </div>
              <p className="text-3xl font-bold text-rose-600">
                {tempValid ? `${live.tempC.toFixed(1)}` : "—"}
              </p>
              <p className="text-xs text-slate-400">°C</p>
            </div>

            <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center gap-1.5 mb-2">
                <Droplets className="h-3.5 w-3.5 text-sky-400" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Humidity</span>
              </div>
              <p className="text-3xl font-bold text-sky-600">
                {humValid ? `${Math.round(live.humidity)}` : "—"}
              </p>
              <p className="text-xs text-slate-400">%</p>
            </div>

            <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center gap-1.5 mb-2">
                <Droplet className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Water</span>
              </div>
              <p className={`text-sm font-bold ${live?.waterLow ? "text-amber-500" : "text-emerald-600"}`}>
                {live?.waterLow !== undefined ? (live.waterLow ? "Low" : "OK") : "—"}
              </p>
            </div>

            <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center gap-1.5 mb-2">
                <Heater className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Heater</span>
              </div>
              <p className={`text-sm font-bold ${live?.heaterBulb ? "text-rose-500" : "text-slate-400"}`}>
                {live?.heaterBulb !== undefined ? (live.heaterBulb ? "ON" : "OFF") : "—"}
              </p>
            </div>
          </div>

          {/* Actuator quick status */}
          <div className="rounded-2xl bg-white px-5 py-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Actuators
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { key: "heaterBulb", label: "Heater", icon: Heater, onColor: "text-rose-500", onBg: "bg-rose-50", onRing: "ring-rose-100" },
                { key: "humidifier", label: "Humidifier", icon: Droplet, onColor: "text-sky-500", onBg: "bg-sky-50", onRing: "ring-sky-100" },
                { key: "fan", label: "Fan", icon: Wind, onColor: "text-slate-600", onBg: "bg-slate-50", onRing: "ring-slate-200" },
                { key: "eggTurner", label: "Egg Turner", icon: RotateCcw, onColor: "text-indigo-500", onBg: "bg-indigo-50", onRing: "ring-indigo-100" },
              ].map(({ key, label, icon: Icon, onColor, onBg, onRing }) => {
                const isOn = Boolean(live?.[key]);
                return (
                  <div
                    key={key}
                    className={`flex flex-col gap-2 rounded-xl px-4 py-3 ring-1 transition ${
                      isOn ? `${onBg} ${onRing}` : "bg-slate-50 ring-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${isOn ? onColor : "text-slate-300"}`} />
                      <span className="text-[10px] font-medium text-slate-500">{label}</span>
                    </div>
                    <span className={`text-sm font-bold ${isOn ? onColor : "text-slate-300"}`}>
                      {live?.[key] !== undefined ? (isOn ? "ON" : "OFF") : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white px-4 py-5 shadow-sm ring-1 ring-slate-100 text-center transition hover:-translate-y-0.5 hover:shadow-md hover:ring-sky-100"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-[#004a87]">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold text-slate-700">{label}</span>
              </Link>
            ))}
          </div>

          {/* Last seen */}
          {live?.lastSeen && (
            <p className="text-center text-[10px] text-slate-400">
              Last seen: {new Date(live.lastSeen).toLocaleString()} · IP: {live?.ip || "—"}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
