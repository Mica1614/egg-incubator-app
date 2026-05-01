// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { useIncubatorDevices } from "@/lib/useIncubatorDevices";
import { useDeviceNotifications } from "@/lib/useDeviceNotifications";
import { useNotificationPreferences } from "@/lib/useNotificationPreferences";
import { useDeviceHistoryLogger } from "@/lib/useDeviceHistoryLogger";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Link from "next/link";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { ChevronLeft, Loader2, Radio, AlertTriangle } from "lucide-react";

const MANUAL_CONTROLS = [
  { key: "heater",     esp32Key: "heaterBulb", stateKey: "heaterBulb", title: "Heater",  subtitle: "Incubation target: 37.5°C", tone: "rose",   lottieSrc: "https://lottie.host/a326d1d6-8a59-41a0-a096-b51612d776a7/zpWIYNjsIK.lottie" },
  { key: "humidifier", esp32Key: "humidifier", stateKey: "humidifier", title: "Humidifier",   subtitle: "Incubation target: 60% RH",    tone: "sky",    lottieSrc: "https://lottie.host/0547fe37-7ced-4ad5-9e4c-a0212c0e6a8b/VJivw3H1xl.lottie" },
  { key: "exhaust",    esp32Key: "fan",        stateKey: "fan",        title: "Fan",  subtitle: "Airflow & Heat Regulation",    tone: "slate",  lottieSrc: "https://lottie.host/08a2092b-8c40-4157-8d9f-d0fb42778d4d/MScaWmtsHw.lottie" },
  { key: "turner",     esp32Key: "eggTurner",  stateKey: "eggTurner",  title: "Egg Turner",   subtitle: "Manual rotation control",      tone: "indigo", lottieSrc: "https://lottie.host/e4fb9d0e-96b5-4885-bc68-b44334623733/3YgT6TptdD.lottie" },
];

const toneClasses = {
  rose:   { on: "bg-rose-50 ring-rose-100",    badge: "bg-rose-100 text-rose-700 ring-rose-200",       btn: "bg-rose-500 hover:bg-rose-600 text-white",   btnOff: "bg-rose-50 hover:bg-rose-100 text-rose-600 ring-1 ring-rose-200" },
  sky:    { on: "bg-sky-50 ring-sky-100",       badge: "bg-sky-100 text-sky-700 ring-sky-200",          btn: "bg-sky-500 hover:bg-sky-600 text-white",     btnOff: "bg-sky-50 hover:bg-sky-100 text-sky-600 ring-1 ring-sky-200" },
  slate:  { on: "bg-slate-50 ring-slate-200",   badge: "bg-slate-100 text-slate-600 ring-slate-200",    btn: "bg-slate-600 hover:bg-slate-700 text-white", btnOff: "bg-slate-50 hover:bg-slate-100 text-slate-600 ring-1 ring-slate-200" },
  indigo: { on: "bg-indigo-50 ring-indigo-100", badge: "bg-indigo-100 text-indigo-700 ring-indigo-200", btn: "bg-indigo-500 hover:bg-indigo-600 text-white",btnOff: "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 ring-1 ring-indigo-200" },
};

export default function DeviceControlPage() {
  const { deviceId } = useParams();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(null);
  const [nickname, setNickname] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState(null);
  const [error, setError] = useState("");

  // Optimistic manual actuator state and local auto-mode form state
  const [optimisticActuators, setOptimisticActuators] = useState({});
  const [autoModes, setAutoModes] = useState(null);

  // Threshold settings
  const [thresholds, setThresholds] = useState({
    tempTrigger: "", tempStop: "",
    humidityTrigger: "", humidityStop: "",
    fanRunDuration: "", fanIdleDuration: "",
    eggTurnerRunDuration: "", eggTurnerIdleDuration: "",
  });
  const [thresholdsPending, setThresholdsPending] = useState(false);
  const [thresholdsSuccess, setThresholdsSuccess] = useState(false);

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

  const { devices, loading, setActuator, setBulkActuator } = useIncubatorDevices(authorized ? [deviceId] : []);
  const live = devices[deviceId] || {};
  
  // Get user for notification preferences
  const [user, setUser] = useState(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);
  
  // Load notification preferences and enable automatic notifications
  const { preferences: notificationPrefs } = useNotificationPreferences(user?.uid, deviceId);
  const prefs = notificationPrefs || {};
  
  // Enable notifications as soon as device is authorized - preferences will use defaults if not loaded yet
  useDeviceNotifications(
    nickname || deviceId,
    live,
    prefs,
    authorized === true // enable as soon as authorized, preferences will have defaults
  );

  // Log sensor readings and actuator events to Firestore history collections
  useDeviceHistoryLogger(deviceId, live, authorized === true);
  
  // Check if device is stale (hasn't updated in 45+ seconds)
  const lastSeenMs = typeof live?.lastSeen === "number" ? live.lastSeen : 0;
  const isStale = lastSeenMs === 0 || (Date.now() - lastSeenMs) > 45000;
  const isOnline = live?.mode === "online" && !isStale;

  // Sync threshold form from live device values (skip if user is actively saving)
  useEffect(() => {
    if (!thresholdsPending && live.tempTrigger !== undefined) {
      setThresholds({
        tempTrigger:           live.tempTrigger           ?? 37.5,
        tempStop:              live.tempStop              ?? 38.0,
        humidityTrigger:       live.humidityTrigger       ?? 60,
        humidityStop:          live.humidityStop          ?? 65,
        fanRunDuration:        live.fanRunDuration        ?? 300,
        fanIdleDuration:       live.fanIdleDuration       ?? 300,
        eggTurnerRunDuration:  live.eggTurnerRunDuration  ?? 10,
        eggTurnerIdleDuration: live.eggTurnerIdleDuration ?? 21600,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.tempTrigger, live.tempStop, live.humidityTrigger, live.humidityStop,
      live.fanRunDuration, live.fanIdleDuration, live.eggTurnerRunDuration, live.eggTurnerIdleDuration]);

  // Helper: return local auto-mode edit state or live RTDB value
  const getMode = (key) => autoModes?.[key] ?? Boolean(live?.[key]);
  const getActuatorState = (stateKey) => stateKey in optimisticActuators ? optimisticActuators[stateKey] : live?.[stateKey];

  useEffect(() => {
    if (autoModes !== null) return;
    if (
      live.bulbAutoMode === undefined &&
      live.humidifierAutoMode === undefined &&
      live.fanScheduleEnabled === undefined &&
      live.eggTurnerScheduleEnabled === undefined
    ) {
      return;
    }

    setAutoModes({
      bulbAutoMode: Boolean(live.bulbAutoMode),
      humidifierAutoMode: Boolean(live.humidifierAutoMode),
      fanScheduleEnabled: Boolean(live.fanScheduleEnabled),
      eggTurnerScheduleEnabled: Boolean(live.eggTurnerScheduleEnabled),
    });
  }, [autoModes, live.bulbAutoMode, live.humidifierAutoMode, live.fanScheduleEnabled, live.eggTurnerScheduleEnabled]);

  useEffect(() => {
    setOptimisticActuators((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(prev)) {
        if (live[key] === prev[key]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [live]);

  const toggle = async (ctrl) => {
    const currentVal = Boolean(getActuatorState(ctrl.stateKey));
    const next = !currentVal;
    setError("");
    setPendingKey(ctrl.key);
    setOptimisticActuators((p) => ({ ...p, [ctrl.stateKey]: next }));
    try {
      await setActuator(deviceId, ctrl.esp32Key, next);
    } catch (err) {
      setOptimisticActuators((p) => { const n = { ...p }; delete n[ctrl.stateKey]; return n; });
      setError(err?.message || "Failed to send command.");
    } finally {
      setPendingKey(null);
    }
  };

  const handleToggleAutoMode = (mode, value) => {
    setAutoModes((prev) => ({ ...(prev ?? {}), [mode]: value }));
  };

  const saveThresholds = async () => {
    setThresholdsPending(true);
    setThresholdsSuccess(false);
    setError("");
    try {
      // Send all fields in ONE command so the ESP32 processes them together.
      // Sending them individually overwrites the command path each time, causing
      // all but the last field to be silently dropped.
      const payload = {
        bulbAutoMode:             Boolean(autoModes?.bulbAutoMode),
        humidifierAutoMode:       Boolean(autoModes?.humidifierAutoMode),
        fanScheduleEnabled:       Boolean(autoModes?.fanScheduleEnabled),
        eggTurnerScheduleEnabled: Boolean(autoModes?.eggTurnerScheduleEnabled),
        tempTrigger:              parseFloat(thresholds.tempTrigger),
        tempStop:                 parseFloat(thresholds.tempStop),
        humidityTrigger:          parseFloat(thresholds.humidityTrigger),
        humidityStop:             parseFloat(thresholds.humidityStop),
        fanRunDuration:           parseInt(thresholds.fanRunDuration),
        fanIdleDuration:          parseInt(thresholds.fanIdleDuration),
        eggTurnerRunDuration:     parseInt(thresholds.eggTurnerRunDuration),
        eggTurnerIdleDuration:    parseInt(thresholds.eggTurnerIdleDuration),
      };
      await setBulkActuator(deviceId, payload);
      setThresholdsSuccess(true);
      setTimeout(() => setThresholdsSuccess(false), 3000);
    } catch (err) {
      setError(err?.message || "Failed to save settings.");
    } finally {
      setThresholdsPending(false);
    }
  };

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
        <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-2xl bg-[#004a87] px-4 py-2 text-sm font-semibold text-white">
          Back to My Incubators
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="System Controls" onOpenSidebar={() => setIsSidebarOpen(true)} />

          {/* Breadcrumb + Title */}
          <div className="flex flex-col gap-1">
            <Link href={`/devices/${deviceId}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition">
              <ChevronLeft className="h-3 w-3" />
              {nickname || deviceId}
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h1 className="text-base font-bold tracking-tight text-slate-900">System Controls</h1>
              <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs shadow-sm ring-1 ring-slate-100">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ring-1 ${isOnline ? "bg-emerald-50 text-emerald-600 ring-emerald-100" : "bg-slate-100 text-slate-400 ring-slate-200"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-slate-300"}`} />
                  {isOnline ? "Online" : "Offline"}
                </span>
                <Radio className="h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading device state…
            </div>
          )}

          {/* ── Auto Modes & Schedule Settings (combined) ── */}
          <div className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Auto Modes &amp; Schedule Settings</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                {
                  mode: "bulbAutoMode", label: "Heater Auto Mode", sub: "Auto on/off by temperature",
                  fields: [
                    { key: "tempTrigger",  label: "Heat ON below",  step: "0.1", min: "30", max: "45", unit: "°C" },
                    { key: "tempStop",     label: "Heat OFF above", step: "0.1", min: "30", max: "45", unit: "°C" },
                  ],
                },
                {
                  mode: "humidifierAutoMode", label: "Humidifier Auto Mode", sub: "Auto on/off by humidity",
                  fields: [
                    { key: "humidityTrigger", label: "Humid ON below",  step: "1", min: "30", max: "90", unit: "%" },
                    { key: "humidityStop",    label: "Humid OFF above", step: "1", min: "30", max: "90", unit: "%" },
                  ],
                },
                {
                  mode: "fanScheduleEnabled", label: "Fan Schedule", sub: "Timed on/off cycles",
                  fields: [
                    { key: "fanRunDuration",  label: "Run",  step: "1", min: "10", max: "3600", unit: "sec" },
                    { key: "fanIdleDuration", label: "Idle", step: "1", min: "10", max: "3600", unit: "sec" },
                  ],
                },
                {
                  mode: "eggTurnerScheduleEnabled", label: "Turner Schedule", sub: "Timed rotation cycles",
                  fields: [
                    { key: "eggTurnerRunDuration",  label: "Run",  step: "1", min: "5",  max: "300", unit: "sec" },
                    { key: "eggTurnerIdleDuration", label: "Idle", step: "1", min: "60",             unit: "sec" },
                  ],
                },
              ].map(({ mode, label, sub, fields }) => {
                const isOn = Boolean(getMode(mode));
                return (
                  <div key={mode} className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100 col-span-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{label}</p>
                        <p className="text-[10px] text-slate-400">{sub}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleAutoMode(mode, !isOn)}
                        disabled={thresholdsPending}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ring-1 ring-slate-200 disabled:opacity-60 ${isOn ? "bg-emerald-500" : "bg-slate-200"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${isOn ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5 border-t border-slate-200 pt-2">
                      {fields.map(({ key, label: flabel, step, min, max, unit }) => (
                        <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                          <label className="w-full sm:w-24 shrink-0 text-[11px] text-slate-500">{flabel}</label>
                          <input
                            type="number" step={step} min={min} max={max}
                            value={thresholds[key]}
                            onChange={(e) => setThresholds((p) => ({ ...p, [key]: e.target.value }))}
                            className="flex-1 sm:w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                          />
                          <span className="text-[10px] text-slate-400">{unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              {thresholdsSuccess && <span className="text-xs font-medium text-emerald-600">✓ Saved</span>}
              <button
                type="button"
                onClick={saveThresholds}
                disabled={thresholdsPending || autoModes === null}
                className="inline-flex h-8 items-center gap-2 rounded-xl bg-[#004a87] px-4 text-xs font-semibold text-white transition hover:bg-[#003d72] disabled:opacity-60"
              >
                {thresholdsPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {thresholdsPending ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </div>

          {/* ── Manual Controls (2-column grid) ── */}
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Manual Controls</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MANUAL_CONTROLS.map((ctrl) => {
                const isOn = Boolean(getActuatorState(ctrl.stateKey));
                const isPending = pendingKey === ctrl.key;
                const tone = toneClasses[ctrl.tone];
                return (
                  <div
                    key={ctrl.key}
                    className={`flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 transition ${isOn ? tone.on : "ring-slate-100"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
                          <DotLottieReact src={ctrl.lottieSrc} loop autoplay style={{ width: "28px", height: "28px" }} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900 leading-tight">{ctrl.title}</p>
                          <p className="text-[10px] text-slate-500 leading-tight">{ctrl.subtitle}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${isOn ? tone.badge : "bg-slate-100 text-slate-400 ring-slate-200"}`}>
                        {live?.[ctrl.stateKey] !== undefined ? (isOn ? "ON" : "OFF") : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggle(ctrl)}
                        disabled={isPending}
                        className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition disabled:opacity-60 ${isOn ? tone.btn : tone.btnOff}`}
                      >
                        {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                        {isPending ? "…" : isOn ? "Turn OFF" : "Turn ON"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
