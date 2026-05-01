"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { firestore } from "@/lib/firebase";
import { deleteField, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { Bell, SlidersHorizontal, ThermometerSun } from "lucide-react";

const formatToday = () => {
  const now = new Date();
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const clampNumber = (value, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
};

const Toggle = ({ checked, onChange, disabled }) => {
  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition ring-1 ring-slate-200 ${
        checked ? "bg-emerald-500" : "bg-slate-200"
      } ${disabled ? "cursor-not-allowed opacity-60" : "hover:brightness-[0.98]"}`}
      aria-pressed={checked}
      aria-disabled={disabled}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
};

export default function ConfigurationPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const today = useMemo(() => formatToday(), []);

  const [thresholds, setThresholds] = useState({
    idealTemperatureC: 37.5,
    idealHumidityPct: 55,
    rotationIntervalHours: 2,
  });

  const [alerts, setAlerts] = useState({
    temperatureAlert: true,
    humidityAlert: true,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const skipNextRemoteApplyRef = useRef(false);

  useEffect(() => {
    setError("");
    setSuccess("");
    setIsLoading(true);

    const configDocRef = doc(firestore, "system_configurations", "default");

    const unsubscribe = onSnapshot(
      configDocRef,
      (snapshot) => {
        const data = snapshot.data();

        if (skipNextRemoteApplyRef.current) {
          skipNextRemoteApplyRef.current = false;
          setIsLoading(false);
          return;
        }

        const nextThresholds = data?.thresholds;
        const nextAlerts = data?.alerts;

        if (nextThresholds && typeof nextThresholds === "object") {
          setThresholds((prev) => ({
            ...prev,
            ...nextThresholds,
          }));
        }

        if (nextAlerts && typeof nextAlerts === "object") {
          setAlerts((prev) => ({
            ...prev,
            temperatureAlert:
              nextAlerts.temperatureAlert === undefined
                ? prev.temperatureAlert
                : Boolean(nextAlerts.temperatureAlert),
            humidityAlert:
              nextAlerts.humidityAlert === undefined
                ? prev.humidityAlert
                : Boolean(nextAlerts.humidityAlert),
          }));
        }

        setIsLoading(false);
      },
      (e) => {
        const message = e?.message || "Failed to load configurations.";
        const code = e?.code ? ` (${e.code})` : "";
        setError(`${message}${code}`);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const save = async () => {
    if (isSaving) return;

    setError("");
    setSuccess("");

    const normalized = {
      thresholds: {
        idealTemperatureC: clampNumber(thresholds.idealTemperatureC, 30, 45),
        idealHumidityPct: clampNumber(thresholds.idealHumidityPct, 0, 100),
        rotationIntervalHours: clampNumber(thresholds.rotationIntervalHours, 1, 24),
      },
      alerts: {
        temperatureAlert: Boolean(alerts.temperatureAlert),
        humidityAlert: Boolean(alerts.humidityAlert),
        powerFailure: deleteField(),
      },
    };

    setIsSaving(true);
    skipNextRemoteApplyRef.current = true;

    try {
      await setDoc(
        doc(firestore, "system_configurations", "default"),
        {
          ...normalized,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSuccess("Changes saved successfully.");
    } catch (e) {
      const message = e?.message || "Failed saving configurations.";
      const code = e?.code ? ` (${e.code})` : "";
      setError(`${message}${code}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-4">
            <TopBar
              title="Configuration"
              notificationCount={3}
              onOpenSidebar={() => setIsSidebarOpen(true)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] font-medium text-slate-400">{today}</p>
              <button
                type="button"
                onClick={save}
                disabled={isSaving || isLoading}
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:from-sky-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-emerald-100/80 bg-emerald-50/80 px-4 py-3 text-xs font-medium text-emerald-700">
              {success}
            </div>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-start gap-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                  <ThermometerSun className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Incubation Thresholds
                  </p>
                  <p className="mt-1 text-sm font-semibold tracking-tight text-slate-900">
                    Ideal operating values
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Configure target levels used by the monitoring system.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Ideal Temperature (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={thresholds.idealTemperatureC}
                    onChange={(e) =>
                      setThresholds((prev) => ({
                        ...prev,
                        idealTemperatureC: e.target.value,
                      }))
                    }
                    disabled={isLoading || isSaving}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <p className="mt-2 text-[11px] text-slate-400">
                    Standard: 37.5°C - 38.0°C
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Ideal Humidity (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={thresholds.idealHumidityPct}
                    onChange={(e) =>
                      setThresholds((prev) => ({
                        ...prev,
                        idealHumidityPct: e.target.value,
                      }))
                    }
                    disabled={isLoading || isSaving}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <p className="mt-2 text-[11px] text-slate-400">
                    Standard: 50% - 60% for Setting Phase
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Rotation Interval (Hours)
                  </label>
                  <select
                    value={thresholds.rotationIntervalHours}
                    onChange={(e) =>
                      setThresholds((prev) => ({
                        ...prev,
                        rotationIntervalHours: Number(e.target.value),
                      }))
                    }
                    disabled={isLoading || isSaving}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {[1, 2, 3, 4, 6, 8, 12, 24].map((v) => (
                      <option key={v} value={v}>
                        {v === 1 ? "Every 1 Hour" : `Every ${v} Hours`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </article>

            <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-start gap-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                  <Bell className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Alert Notifications
                  </p>
                  <p className="mt-1 text-sm font-semibold tracking-tight text-slate-900">
                    Choose what to notify
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Toggle which events should generate notifications.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-100">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-slate-600 ring-1 ring-slate-200">
                      <SlidersHorizontal className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Temperature Alert</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Notify if temperature exceeds threshold.
                      </p>
                    </div>
                  </div>
                  <Toggle
                    checked={alerts.temperatureAlert}
                    onChange={(v) => setAlerts((prev) => ({ ...prev, temperatureAlert: v }))}
                    disabled={isLoading || isSaving}
                  />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-100">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-slate-600 ring-1 ring-slate-200">
                      <SlidersHorizontal className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Humidity Alert</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Notify if humidity drops below threshold.
                      </p>
                    </div>
                  </div>
                  <Toggle
                    checked={alerts.humidityAlert}
                    onChange={(v) => setAlerts((prev) => ({ ...prev, humidityAlert: v }))}
                    disabled={isLoading || isSaving}
                  />
                </div>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
