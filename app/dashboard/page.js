// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, firestore } from "@/lib/firebase";
import { getDocs, collection, query, where } from "firebase/firestore";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { useUserDevices } from "@/lib/useUserDevices";
import { useIncubatorDevices } from "@/lib/useIncubatorDevices";
import { useDeviceNotifications } from "@/lib/useDeviceNotifications";
import { useNotificationPreferences } from "@/lib/useNotificationPreferences";
import Link from "next/link";
import {
  Plus,
  Thermometer,
  Droplets,
  Cpu,
  ChevronRight,
  ChevronLeft,
  Wifi,
  WifiOff,
  AlertTriangle,
  X,
  Loader2,
  CalendarDays,
  Egg,
  Filter,
} from "lucide-react";

const CANDLING_SCHEDULES = { Chicken:[7,14,18], Duck:[7,18,25], Quail:[5,12,15], Goose:[7,14,21], Turkey:[7,14,21] };
const INCUBATION_DAYS = { Chicken:21, Duck:28, Quail:18, Goose:30, Turkey:28 };

const toYMD = (d) => d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : null;

function buildCalendarEvents(batches) {
  const map = {};
  for (const b of batches) {
    const start = b.startDate?.toDate ? b.startDate.toDate() : b.startDate ? new Date(b.startDate) : null;
    if (!start || isNaN(start)) continue;
    const eggType = b.eggType || "Chicken";
    const incDays = INCUBATION_DAYS[eggType] || 21;
    const candleDays = CANDLING_SCHEDULES[eggType] || [];
    const hatchDate = new Date(start.getTime() + incDays * 86400000);
    const add = (date, type) => {
      const k = toYMD(date);
      if (!k) return;
      if (!map[k]) map[k] = [];
      map[k].push({ type, batch: b, date });
    };
    add(start, "start");
    candleDays.forEach((day) => add(new Date(start.getTime() + day * 86400000), "candle"));
    add(hatchDate, "hatch");
  }
  return map;
}

function EggCalendar({ batches, batchFilter, onFilterChange }) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [popoverDate, setPopoverDate] = useState(null);

  const filtered = batchFilter === "all" ? batches : batches.filter((b) => b.id === batchFilter);
  const eventMap = buildCalendarEvents(filtered);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayYMD = toYMD(today);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); };

  const monthName = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Upcoming events for next 30 days
  const upcoming = [];
  for (let i = 0; i <= 30; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const k = toYMD(d);
    if (eventMap[k]) {
      for (const ev of eventMap[k]) {
        upcoming.push({ ...ev, dateKey: k, dateObj: d });
      }
    }
  }

  const TYPE_COLORS = { start: "bg-teal-400", candle: "bg-amber-400", hatch: "bg-emerald-500" };
  const TYPE_LABELS = { start: "Batch Start", candle: "Candling Day", hatch: "Hatch Date" };
  const TYPE_BG = { start: "bg-teal-50 text-teal-700 ring-teal-100", candle: "bg-amber-50 text-amber-700 ring-amber-100", hatch: "bg-emerald-50 text-emerald-700 ring-emerald-100" };

  return (
    <div className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-[#004a87]">
            <CalendarDays className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-bold text-slate-900">Incubation Calendar</h2>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <select value={batchFilter} onChange={(e) => onFilterChange(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-sky-300">
            <option value="all">All Batches</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.batchId || b.id}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_260px]">
        {/* Calendar grid */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 transition">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-slate-900">{monthName}</span>
            <button onClick={nextMonth} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 transition">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5" onClick={(e) => { if (e.target === e.currentTarget) setPopoverDate(null); }}>
            {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
              <div key={d} className="py-1 text-center text-[9px] font-bold uppercase tracking-widest text-slate-400">{d}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
              const events = eventMap[dateKey] || [];
              const isToday = dateKey === todayYMD;
              const types = [...new Set(events.map((e) => e.type))];
              const isPopover = popoverDate === dateKey;
              const col = (firstDay + i) % 7; // 0=Sun … 6=Sat
              const popoverAlign = col <= 1 ? "left-0" : col >= 5 ? "right-0" : "left-1/2 -translate-x-1/2";
              return (
                <div key={dayNum} className="relative">
                  <div onClick={() => events.length > 0 ? setPopoverDate(isPopover ? null : dateKey) : setPopoverDate(null)}
                    className={`relative flex flex-col items-center rounded-lg py-1.5 transition cursor-pointer ${
                      isToday ? "bg-[#004a87] text-white" :
                      events.length > 0 ? "bg-sky-50/80 ring-1 ring-sky-100 hover:ring-sky-300" : "hover:bg-slate-50"
                    }`}>
                    <span className={`text-[11px] font-semibold leading-none ${ isToday ? "text-white" : "text-slate-700" }`}>{dayNum}</span>
                    {types.length > 0 && (
                      <div className="mt-1 flex gap-0.5 justify-center">
                        {types.map((t) => <span key={t} className={`inline-block h-1.5 w-1.5 rounded-full ${isToday ? "bg-white" : TYPE_COLORS[t]}`} />)}
                      </div>
                    )}
                  </div>
                  {isPopover && events.length > 0 && (
                    <div className={`absolute z-30 top-full mt-1 w-52 rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 p-3 ${popoverAlign}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                        {new Date(year, month, dayNum).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                        {events.map((ev, ei) => (
                          <div key={ei} className={`flex items-start gap-2 rounded-xl px-2.5 py-2 ring-1 ${TYPE_BG[ev.type]}`}>
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold">{TYPE_LABELS[ev.type]}</p>
                              <p className="text-[10px] opacity-70 truncate">{ev.batch.batchId || ev.batch.id}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {[["start","Batch Start"],["candle","Candling"],["hatch","Hatch"]].map(([t,l]) => (
              <div key={t} className="flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${TYPE_COLORS[t]}`} />
                <span className="text-[10px] text-slate-400">{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming events */}
        <div className="border-t border-slate-100 px-4 py-4 lg:border-l lg:border-t-0">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Next 30 Days</p>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <Egg className="h-8 w-8 text-slate-200 mb-2" />
              <p className="text-[11px] text-slate-400">No upcoming events</p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto pr-1 space-y-2" style={{ scrollbarWidth: "thin" }}>
              {upcoming.map((ev, idx) => (
                <div key={idx} className={`flex items-start gap-2 rounded-xl px-3 py-2 ring-1 ${TYPE_BG[ev.type]}`}>
                  <CalendarDays className="mt-0.5 h-3 w-3 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold">{TYPE_LABELS[ev.type]}</p>
                    <p className="text-[10px] leading-tight opacity-70 truncate">{ev.batch.batchId || ev.batch.id} · {ev.dateObj.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Device card component with notification hooks
function DeviceCard({ owned, liveDevice, uid, onRemove }) {
  const { preferences: notificationPrefs } = useNotificationPreferences(uid, owned.id);
  
  // Force re-render every 5 s so Date.now() stays fresh for offline detection
  // (RTDB never fires new events when a device goes silent)
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  // Enable automatic notifications for this device
  useDeviceNotifications(
    owned.nickname || owned.id,
    liveDevice,
    notificationPrefs,
    true
  );

  const live = liveDevice || {};
  const lastSeenMs = typeof live?.lastSeen === "number" ? live.lastSeen : 0;
  const now = Date.now();
  const isStale = lastSeenMs > 0 && (now - lastSeenMs) > 15000;
  const isOnline = live?.mode === "online" && !isStale;
  const tempValid = typeof live?.tempC === "number" && live.tempC !== -999;
  const humValid = typeof live?.humidity === "number" && live.humidity !== -999;

  return (
    <div
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
          { label: "Humidifier", val: live?.humidifier },
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
          onClick={() => onRemove(owned.id, owned.nickname || owned.id)}
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
}

export default function DashboardPage() {
  const [uid, setUid] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deviceIdInput, setDeviceIdInput] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [addError, setAddError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [allBatches, setAllBatches] = useState([]);
  const [batchFilter, setBatchFilter] = useState("all");
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [pendingRemoveDevice, setPendingRemoveDevice] = useState(null);
  const [activeTab, setActiveTab] = useState("incubators"); // "incubators" | "calendar"

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

  // Load batches for all owned devices
  useEffect(() => {
    if (!ownedIds.length) { setAllBatches([]); return; }
    const q = query(collection(firestore, "egg_batches"), where("deviceId", "in", ownedIds.slice(0, 10)));
    getDocs(q).then((snap) => {
      setAllBatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((b) => b.status !== "completed"));
    }).catch(() => {});
  }, [JSON.stringify(ownedIds)]);

  // Trigger candling schedule check
  useEffect(() => {
    if (!uid) return;
    fetch(`/api/alerts/candling-check?uid=${uid}`).catch(() => {});
  }, [uid]);

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

  const handleRemove = (deviceId, nickname) => {
    setPendingRemoveDevice({ id: deviceId, nickname });
    setShowRemoveModal(true);
  };

  const confirmRemove = async () => {
    if (!pendingRemoveDevice) return;
    try {
      await removeDevice(pendingRemoveDevice.id);
    } catch {}
    setShowRemoveModal(false);
    setPendingRemoveDevice(null);
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

          {/* Tabs */}
          <div className="flex gap-1 rounded-xl bg-white/60 p-1 ring-1 ring-slate-200/70 shadow-sm backdrop-blur">
            <button
              onClick={() => setActiveTab("incubators")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${activeTab === "incubators" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Cpu className="h-3.5 w-3.5" />My Incubators
            </button>
            <button
              onClick={() => setActiveTab("calendar")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${activeTab === "calendar" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <CalendarDays className="h-3.5 w-3.5" />Calendar
            </button>
          </div>

          {devicesError && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {devicesError}
            </div>
          )}

          {/* My Incubators Tab */}
          {activeTab === "incubators" && (
            <>
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
                  {ownedDevices.map((owned) => (
                    <DeviceCard
                      key={owned.id}
                      owned={owned}
                      liveDevice={liveDevices[owned.id] || {}}
                      uid={uid}
                      onRemove={handleRemove}
                    />
                  ))}

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
            </>
          )}

          {/* Calendar Tab */}
          {activeTab === "calendar" && (
            <EggCalendar batches={allBatches} batchFilter={batchFilter} onFilterChange={setBatchFilter} />
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

      {/* Remove Device Confirm Modal */}
      {showRemoveModal && pendingRemoveDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <X className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">Remove Incubator?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Remove <span className="font-semibold text-slate-900">"{pendingRemoveDevice.nickname}"</span> from your account? The device data will remain but it will no longer appear in your dashboard.
            </p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => { setShowRemoveModal(false); setPendingRemoveDevice(null); }} className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={confirmRemove} className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
