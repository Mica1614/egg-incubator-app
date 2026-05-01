// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { useUserDevices } from "@/lib/useUserDevices";
import { useIncubatorDevices } from "@/lib/useIncubatorDevices";
import Link from "next/link";
import {
  Plus,
  Thermometer,
  Droplets,
  Cpu,
  ChevronRight,
  Wifi,
  WifiOff,
  AlertTriangle,
  X,
  Loader2,
} from "lucide-react";

export default function DashboardPage() {
  const [uid, setUid] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deviceIdInput, setDeviceIdInput] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [addError, setAddError] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || null);
    });
    return () => unsub();
  }, []);

  const { ownedDevices, loading: devicesLoading, error: devicesError, addDevice, removeDevice } =
    useUserDevices(uid);

  const ownedIds = ownedDevices.map((d) => d.id);
  const { devices: liveDevices } = useIncubatorDevices(ownedIds);

  const handleAddDevice = async (e) => {
    e.preventDefault();
    setAddError("");
    setIsAdding(true);
    try {
      await addDevice(deviceIdInput, nicknameInput);
      setDeviceIdInput("");
      setNicknameInput("");
      setIsAddModalOpen(false);
    } catch (err) {
      setAddError(err?.message || "Failed to add device.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (deviceId, nickname) => {
    if (!confirm(`Remove "${nickname}" from your account?`)) return;
    try {
      await removeDevice(deviceId);
    } catch {}
  };

  const openAddModal = () => {
    setAddError("");
    setDeviceIdInput("");
    setNicknameInput("");
    setIsAddModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="My Incubators" onOpenSidebar={() => setIsSidebarOpen(true)} />

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">My Incubators</h1>
              <p className="text-xs text-slate-500">
                Manage and monitor your registered incubator devices.
              </p>
            </div>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#004a87] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#003d72] active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Incubator
            </button>
          </div>

          {devicesError && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {devicesError}
            </div>
          )}

          {devicesLoading && (
            <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-52 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          )}

          {!devicesLoading && ownedDevices.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white px-8 py-16 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-sky-50 text-sky-400 ring-1 ring-sky-100">
                <Cpu className="h-10 w-10" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">No incubators yet</h2>
              <p className="mt-2 max-w-xs text-sm text-slate-500">
                Power on your incubator device and connect it to WiFi. The Device ID will appear on its local web configuration page at 192.168.4.1.
              </p>
              <button
                type="button"
                onClick={openAddModal}
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#004a87] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#003d72] active:scale-95"
              >
                <Plus className="h-4 w-4" />
                Add Your First Incubator
              </button>
            </div>
          )}

          {!devicesLoading && ownedDevices.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ownedDevices.map((owned) => {
                const live = liveDevices[owned.id] || {};
                const isOnline = live?.mode === "online";
                const tempValid = typeof live?.tempC === "number" && live.tempC !== -999;
                const humValid = typeof live?.humidity === "number" && live.humidity !== -999;

                return (
                  <div
                    key={owned.id}
                    className="group relative flex h-full min-h-[320px] flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-sky-100"
                  >
                    <div className="flex items-start justify-between px-5 pt-5 pb-3">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {owned.nickname || owned.id}
                        </p>
                        <p className="text-[10px] font-mono text-slate-400 truncate">{owned.id}</p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                          isOnline
                            ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
                            : "bg-slate-100 text-slate-400 ring-slate-200"
                        }`}
                      >
                        {isOnline ? (
                          <Wifi className="h-2.5 w-2.5" />
                        ) : (
                          <WifiOff className="h-2.5 w-2.5" />
                        )}
                        {isOnline ? "Online" : "Offline"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 px-5 pb-4">
                      <div className="rounded-xl bg-rose-50 px-3 py-3 ring-1 ring-rose-100">
                        <div className="flex items-center gap-1 mb-1">
                          <Thermometer className="h-3 w-3 text-rose-400" />
                          <span className="text-[9px] font-medium uppercase tracking-wider text-rose-400">Temp</span>
                        </div>
                        <p className="text-xl font-bold text-rose-600">
                          {tempValid ? `${live.tempC.toFixed(1)}°` : "—"}
                        </p>
                        <p className="text-[9px] text-rose-400">°C</p>
                      </div>
                      <div className="rounded-xl bg-sky-50 px-3 py-3 ring-1 ring-sky-100">
                        <div className="flex items-center gap-1 mb-1">
                          <Droplets className="h-3 w-3 text-sky-400" />
                          <span className="text-[9px] font-medium uppercase tracking-wider text-sky-400">Humidity</span>
                        </div>
                        <p className="text-xl font-bold text-sky-600">
                          {humValid ? `${Math.round(live.humidity)}` : "—"}
                        </p>
                        <p className="text-[9px] text-sky-400">%</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 px-5 pb-3">
                      {[
                        { label: "Heater", val: live?.heaterBulb },
                        { label: "Fan", val: live?.fan },
                        { label: "Mist", val: live?.humidifier },
                        { label: "Turner", val: live?.eggTurner },
                      ].map(({ label, val }) => (
                        <span
                          key={label}
                          className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ${
                            val
                              ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
                              : "bg-slate-100 text-slate-400 ring-slate-200"
                          }`}
                        >
                          {label}: {val ? "ON" : "OFF"}
                        </span>
                      ))}
                      {live?.waterLow !== undefined && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ${
                            live.waterLow
                              ? "bg-amber-50 text-amber-600 ring-amber-100"
                              : "bg-emerald-50 text-emerald-600 ring-emerald-100"
                          }`}
                        >
                          {live.waterLow ? "⚠ Water Low" : "Water OK"}
                        </span>
                      )}
                    </div>

                    <div className="mt-auto border-t border-slate-100 px-5 py-3 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleRemove(owned.id, owned.nickname || owned.id)}
                        className="text-[10px] text-slate-400 hover:text-rose-500 transition"
                      >
                        Remove
                      </button>
                      <Link
                        href={`/devices/${owned.id}`}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#004a87]/10 px-3 py-1.5 text-[11px] font-semibold text-[#004a87] transition hover:bg-[#004a87]/20"
                      >
                        Manage
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={openAddModal}
                className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-transparent px-6 py-10 text-slate-400 transition hover:border-[#004a87] hover:text-[#004a87] hover:bg-sky-50/30"
              >
                <Plus className="h-8 w-8 mb-2" />
                <span className="text-xs font-medium">Add Incubator</span>
              </button>
            </div>
          )}
        </main>
      </div>

      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsAddModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Add Incubator</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Enter the Device ID shown on your incubator local web configuration page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddDevice} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Device ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={deviceIdInput}
                  onChange={(e) => setDeviceIdInput(e.target.value)}
                  placeholder="e.g. INC-A1B2C3D4"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-1 focus:ring-sky-400"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Nickname <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="e.g. Barn #1"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-1 focus:ring-sky-400"
                />
              </div>

              {addError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                  <p className="text-xs text-rose-700">{addError}</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isAdding}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding || !deviceIdInput.trim()}
                  className="inline-flex h-9 items-center gap-2 justify-center rounded-xl bg-[#004a87] px-4 text-xs font-semibold text-white transition hover:bg-[#003d72] disabled:opacity-60"
                >
                  {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {isAdding ? "Adding…" : "Add Device"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
