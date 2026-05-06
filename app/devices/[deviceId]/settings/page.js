// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { useNotificationPreferences } from "@/lib/useNotificationPreferences";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import NotificationSettings from "@/components/NotificationSettings";
import Link from "next/link";
import { ChevronLeft, Save, Loader2, AlertTriangle } from "lucide-react";
import NotificationToggle from "@/components/NotificationToggle";

const DEFAULT_CONFIG = {
  thresholds: { idealTemperatureC: 37.5, idealHumidityPct: 60, minTemperatureC: 36, maxTemperatureC: 39 },
  alerts: { temperatureAlert: true, humidityAlert: true, waterLevelAlert: true },
  notificationsEnabled: true,
};

export default function DeviceSettingsPage() {
  const { deviceId } = useParams();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authorized, setAuthorized] = useState(null);
  const [nickname, setNickname] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Get notification preferences
  const { preferences: notificationPrefs, updatePreference: updateNotificationPref } = useNotificationPreferences(user?.uid, deviceId);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (!authUser) { router.replace("/login"); return; }
      const snap = await getDoc(doc(firestore, "users", authUser.uid, "devices", deviceId));
      if (!snap.exists()) { setAuthorized(false); return; }
      setNickname(snap.data()?.nickname || deviceId);
      setAuthorized(true);
    });
    return () => unsub();
  }, [deviceId, router]);

  useEffect(() => {
    if (!authorized) return;
    const unsub = onSnapshot(doc(firestore, "devices", deviceId, "config", "main"), (snap) => {
      if (snap.exists()) {
        setConfig((prev) => ({ ...DEFAULT_CONFIG, ...snap.data() }));
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [authorized, deviceId]);

  const save = async () => {
    setError("");
    setIsSaving(true);
    try {
      await setDoc(doc(firestore, "devices", deviceId, "config", "main"), {
        ...config,
        updatedAt: serverTimestamp(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err?.message || "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const setThreshold = (key, value) => {
    setConfig((prev) => ({ ...prev, thresholds: { ...prev.thresholds, [key]: parseFloat(value) || 0 } }));
  };

  const setAlert = (key, value) => {
    setConfig((prev) => ({ ...prev, alerts: { ...prev.alerts, [key]: value } }));
  };

  if (authorized === null) return <div className="flex h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#004a87] border-t-transparent" /></div>;
  if (authorized === false) return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-12 w-12 text-amber-400" />
      <Link href="/dashboard" className="rounded-2xl bg-[#004a87] px-4 py-2 text-sm font-semibold text-white">Back to Dashboard</Link>
    </div>
  );

  const Toggle = ({ checked, onChange }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition ring-1 ring-slate-200 ${checked ? "bg-emerald-500" : "bg-slate-200"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />
        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="Device Settings" onOpenSidebar={() => setIsSidebarOpen(true)} />

          <BreadcrumbNav deviceId={deviceId} deviceName={nickname} currentPage="Settings" />

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <h1 className="text-base font-bold tracking-tight text-slate-900">Device Settings</h1>
              <button
                type="button"
                onClick={save}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#004a87] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#003d72] disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saved ? "Saved!" : isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          {error && <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>}

          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ) : (
            <div className="flex flex-col gap-4">
              {/* Temperature thresholds */}
              <div className="rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-100">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Temperature</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { label: "Ideal Temperature (°C)", key: "idealTemperatureC" },
                    { label: "Min Temperature (°C)", key: "minTemperatureC" },
                    { label: "Max Temperature (°C)", key: "maxTemperatureC" },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700">{label}</label>
                      <input
                        type="number"
                        step="0.1"
                        value={config.thresholds[key] ?? ""}
                        onChange={(e) => setThreshold(key, e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Humidity thresholds */}
              <div className="rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-100">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Humidity</h2>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">Ideal Humidity (%)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={config.thresholds.idealHumidityPct ?? ""}
                    onChange={(e) => setThreshold("idealHumidityPct", e.target.value)}
                    className="w-full max-w-xs rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                  />
                </div>
              </div>

              {/* Alerts */}
              <div className="rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-100">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Alerts</h2>
                <div className="flex flex-col gap-3">
                  {[
                    { label: "Temperature Alerts", key: "temperatureAlert", desc: "Notify when temperature exceeds ideal range" },
                    { label: "Humidity Alerts", key: "humidityAlert", desc: "Notify when humidity exceeds ideal range" },
                    { label: "Water Level Alerts", key: "waterLevelAlert", desc: "Notify when water level is low" },
                  ].map(({ label, key, desc }) => (
                    <div key={key} className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{label}</p>
                        <p className="text-[10px] text-slate-400">{desc}</p>
                      </div>
                      <Toggle checked={Boolean(config.alerts[key])} onChange={(v) => setAlert(key, v)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Notifications */}
              <div className="rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-100">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Notifications</h2>
                <NotificationToggle 
                  enabled={Boolean(config.notificationsEnabled)}
                  onChange={(enabled) => setConfig((p) => ({ ...p, notificationsEnabled: enabled }))}
                  loading={false}
                />
              </div>

              {/* Notification Settings - Per Type Muting */}
              {notificationPrefs && Object.keys(notificationPrefs).length > 0 && (
                <div className="rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-100">
                  <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Notification Types</h2>
                  <NotificationSettings 
                    preferences={notificationPrefs}
                    onToggle={updateNotificationPref}
                    loading={false}
                  />
                </div>
              )}

              {/* Device ID info */}
              <div className="rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-100">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Device Info</h2>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-slate-500">Device ID</p>
                  <p className="font-mono text-sm font-semibold text-slate-900">{deviceId}</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
