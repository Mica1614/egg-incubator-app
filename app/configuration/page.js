"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { auth, firestore } from "@/lib/firebase";
import { deleteField, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Bell, Mail, SlidersHorizontal, ThermometerSun } from "lucide-react";

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

  const [authUser, setAuthUser] = useState(null);

  const [thresholds, setThresholds] = useState({
    idealTemperatureC: 37.5,
    idealHumidityPct: 55,
    rotationIntervalHours: 2,
  });

  const [alerts, setAlerts] = useState({
    temperatureAlert: true,
    humidityAlert: true,
    emailAlerts: false,
  });

  const [alertEmail, setAlertEmail] = useState(""); // stored silently
  const [testEmailStatus, setTestEmailStatus] = useState(""); // "" | "sending" | "ok" | "error"
  const [isToggleSaving, setIsToggleSaving] = useState(false);
  const [cooldownMinutes, setCooldownMinutes] = useState(10); // email alert cooldown in minutes
  const [isCooldownSaving, setIsCooldownSaving] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const skipNextRemoteApplyRef = useRef(false);

  // Auto-save email alerts setting when it changes
  useEffect(() => {
    if (isLoading) return;

    const autoSave = async () => {
      setIsToggleSaving(true);
      try {
        await setDoc(
          doc(firestore, "system_configurations", "default"),
          {
            alerts: {
              emailAlerts: Boolean(alerts.emailAlerts),
              alertEmail: alertEmail,
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.error("Auto-save failed:", e);
      } finally {
        setIsToggleSaving(false);
      }
    };

    autoSave();
  }, [alerts.emailAlerts]);

  // Auto-save cooldown setting when it changes
  useEffect(() => {
    if (isLoading) return;

    const autoSave = async () => {
      setIsCooldownSaving(true);
      try {
        await setDoc(
          doc(firestore, "system_configurations", "default"),
          {
            alerts: {
              cooldownMinutes: Number(cooldownMinutes),
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.error("Auto-save cooldown failed:", e);
      } finally {
        setIsCooldownSaving(false);
      }
    };

    autoSave();
  }, [cooldownMinutes]);

  // Get current auth user's email and sync it to Firestore so alert emails
  // always go to the currently-logged-in account, not a stale previous user.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user?.email) {
        setAlertEmail(user.email);
        // Overwrite alertEmail in Firestore with the current user's email.
        // This prevents onSnapshot from restoring a previous account's email.
        try {
          await setDoc(
            doc(firestore, "system_configurations", "default"),
            { alerts: { alertEmail: user.email } },
            { merge: true }
          );
        } catch (e) {
          console.error("[config] Failed to sync alertEmail:", e);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setError("");
    setSuccess("");
    setIsLoading(true);

    const configDocRef = doc(firestore, "system_configurations", "default");

    const unsubscribe = onSnapshot(
      configDocRef,
      (snapshot) => {
        const data = snapshot.data();

        const nextAlerts = data?.alerts;
        if (nextAlerts && typeof nextAlerts === "object") {
          setAlerts((prev) => ({
            ...prev,
            temperatureAlert: nextAlerts.temperatureAlert !== undefined ? Boolean(nextAlerts.temperatureAlert) : prev.temperatureAlert,
            humidityAlert: nextAlerts.humidityAlert !== undefined ? Boolean(nextAlerts.humidityAlert) : prev.humidityAlert,
            emailAlerts: nextAlerts.emailAlerts !== undefined ? Boolean(nextAlerts.emailAlerts) : prev.emailAlerts,
          }));
          if (nextAlerts.alertEmail !== undefined) {
            setAlertEmail(String(nextAlerts.alertEmail || ""));
          }
          if (nextAlerts.cooldownMinutes !== undefined) {
            setCooldownMinutes(Number(nextAlerts.cooldownMinutes));
          }
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

  const sendTestEmail = async () => {
    // On mobile, Firebase Auth may still be initializing when the button is pressed.
    // Fall back to the alertEmail state (loaded from Firestore) if authUser is not yet set.
    const to = authUser?.email || alertEmail;
    if (!to) {
      setTestEmailStatus("error");
      return;
    }
    setTestEmailStatus("sending");
    try {
      const res = await fetch("/api/send-alert-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject: "Test Email - Egg Incubator System",
          alertType: "test",
          deviceId: null,
          sensorData: null,
          message: null,
        }),
      });
      const json = await res.json();
      setTestEmailStatus(json.success ? "ok" : "error");
    } catch {
      setTestEmailStatus("error");
    }
    setTimeout(() => setTestEmailStatus(""), 4000);
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
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[11px] font-medium text-slate-400">{today}</p>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          <section className="grid gap-4">

          {/* ── Gmail Email Alerts card ──────────────────────────────── */}
          <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-start gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Gmail Email Alerts
                </p>
                <p className="mt-1 text-sm font-semibold tracking-tight text-slate-900">
                  Email notifications via Gmail SMTP
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Receive an email when sensor readings are abnormal, water is low, or a device goes offline.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {/* Enable / disable toggle */}
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-100">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-slate-600 ring-1 ring-slate-200">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Enable Gmail Alerts</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Send alert emails when abnormal conditions are detected.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isToggleSaving && (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
                  )}
                    <Toggle
                      checked={alerts.emailAlerts}
                      onChange={(v) => setAlerts((prev) => ({ ...prev, emailAlerts: v }))}
                      disabled={isLoading || isToggleSaving}
                    />
                </div>
              </div>

              {/* Cooldown input */}
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-100">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-slate-600 ring-1 ring-slate-200">
                    <SlidersHorizontal className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Alert Cooldown (minutes)</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Minimum time between duplicate alerts for the same device.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isCooldownSaving && (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
                  )}
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={cooldownMinutes}
                    onChange={(e) => setCooldownMinutes(clampNumber(e.target.value, 1, 120))}
                    disabled={isLoading || isCooldownSaving}
                    className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-center text-xs font-semibold text-slate-900 transition placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Test email button */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={sendTestEmail}
                  disabled={isLoading || isSaving || testEmailStatus === "sending" || (!authUser?.email && !alertEmail)}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {testEmailStatus === "sending" ? "Sending…" : "Send Test Email"}
                </button>

                {testEmailStatus === "ok" && (
                  <span className="rounded-xl bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    ✓ Test email sent!
                  </span>
                )}
                {testEmailStatus === "error" && (
                  <span className="rounded-xl bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-600 ring-1 ring-rose-200">
                    ✗ Failed to send
                  </span>
                )}
              </div>
            </div>
          </article>
          </section>
        </main>
      </div>
    </div>
  );
}
