// @ts-nocheck
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc, getDoc, getDocs, collection, onSnapshot, addDoc,
  serverTimestamp, updateDoc, deleteDoc, Timestamp, setDoc,
} from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import {
  Plus, Egg, CheckCircle2, Trash2, Loader2, Wand2, Pencil,
  Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ClipboardCheck, X,
} from "lucide-react";

// ─── constants ────────────────────────────────────────────────────────────────
const EGG_TYPES = ["Chicken", "Duck", "Quail", "Goose"];
const INCUBATION_DAYS = { chicken: 21, duck: 28, quail: 18, goose: 30 };
const EGG_TYPE_PREFIX = { chicken: "CK", duck: "DK", quail: "QL", goose: "GS" };

// ─── helpers ──────────────────────────────────────────────────────────────────
const formatShortDate = (date) => {
  try {
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
};

function generateBatchId(eggType) {
  const prefix = EGG_TYPE_PREFIX[String(eggType || "").toLowerCase()] || "CK";
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
  return `${prefix}-${yy}${mm}${dd}-${hex}`;
}

const getProgressColor = (day, total) => {
  const pct = (day / total) * 100;
  if (pct < 33) return "from-sky-400 to-cyan-500";
  if (pct < 66) return "from-blue-400 to-indigo-500";
  if (pct < 85) return "from-indigo-400 to-purple-500";
  if (pct < 100) return "from-purple-400 to-pink-500";
  return "from-emerald-400 to-teal-500";
};

const getAIRecommendation = (eggType) => {
  const t = String(eggType || "").toLowerCase();
  if (t === "duck")  return { temperature: "37.5°C", humidity: "55–60%", finalHumidity: "70%",    text: "Maintain 37.5°C and 55–60% humidity during days 1–25. Increase to 70% for the final 3 days. Ensure ventilation and regular egg turning for optimal development." };
  if (t === "goose") return { temperature: "37.5°C", humidity: "50–55%", finalHumidity: "65–70%", text: "Maintain 37.5°C and 50–55% humidity during days 1–27. Increase to 65–70% for the final 3 days. Goose eggs require cooling and misting after day 15." };
  if (t === "quail") return { temperature: "37.2°C", humidity: "45–50%", finalHumidity: "60–65%", text: "Maintain 37.2°C and 45–50% humidity during days 1–14. Increase to 60–65% for the final 3 days. Quail eggs develop quickly — maintain stable conditions." };
  return { temperature: "37.5°C", humidity: "45–55%", finalHumidity: "65–75%", text: "🥚 Days 1–18 (Setting Phase): Maintain 45–55% humidity at 37.5°C with proper ventilation. 🐥 Days 19–21 (Hatching Phase): Increase humidity to 65–75%. Stop egg turning and avoid opening the incubator." };
};

const getIncubationAlerts = (day, eggType) => {
  const t = String(eggType || "").toLowerCase();
  const alerts = [];
  const milestones = [
    { day: 7,  title: "First Candling",     icon: "🔍", priority: "medium",   message: "Candle eggs and check for fertility. Remove clear eggs." },
    { day: 14, title: "Second Candling",    icon: "🔍", priority: "high",     message: "Second candling. Check embryo growth and air cell size." },
    { day: 18, title: "LOCKDOWN STAGE",     icon: "🚫", priority: "critical", message: "STOP turning eggs! Increase humidity to 65–70%. Do not open incubator." },
    { day: 19, title: "Watch for Pipping",  icon: "👂", priority: "high",     message: "Listen for chirping. First external pips may appear." },
    { day: 21, title: "Expected Hatch Day", icon: "🎉", priority: "critical", message: "Most chicks should hatch today. Allow 24–48 hours for all." },
  ];
  if (t === "duck") {
    milestones.push(
      { day: 25, title: "Duck Lockdown",  icon: "🚫", priority: "critical", message: "LOCKDOWN for duck eggs. Stop turning, increase humidity." },
      { day: 28, title: "Duck Hatch Day", icon: "🦆", priority: "critical", message: "Expected hatch day for duck eggs." }
    );
  }
  alerts.push(...milestones.filter(m => m.day === day).map(a => ({ ...a, isNew: true })));
  alerts.push(...milestones.filter(m => m.day > day && m.day <= day + 3).map(a => ({ ...a, isUpcoming: true, daysUntil: a.day - day })));
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return alerts.sort((a, b) => order[a.priority] - order[b.priority]);
};

// ─── BatchRow (with Device column) ───────────────────────────────────────────
function BatchRow({ batch, onEdit, onDelete, onComplete, onTrackHatch }) {
  const [expanded, setExpanded] = useState(false);

  const startDate    = batch.startDate?.toDate ? batch.startDate.toDate() : batch.startDate ? new Date(batch.startDate) : null;
  const totalDays    = INCUBATION_DAYS[batch.eggType?.toLowerCase()] || 21;
  const daysPassed   = startDate ? Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1) : 0;
  const progressPct  = startDate ? Math.min(100, Math.round((daysPassed / totalDays) * 100)) : 0;
  const hatchingDate = startDate ? new Date(startDate.getTime() + totalDays * 86400000) : null;
  const daysLeft     = hatchingDate ? Math.max(0, Math.ceil((hatchingDate.getTime() - Date.now()) / 86400000)) : "-";
  const isCompleted  = batch.status === "completed";
  const rec          = getAIRecommendation(batch.eggType);
  const alerts       = getIncubationAlerts(daysPassed, batch.eggType);

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors hover:bg-slate-50 ${expanded ? "bg-sky-50/30" : ""}`}
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
          {batch.batchId ? `BATCH-${batch.batchId}` : "—"}
        </td>
        <td className="px-4 py-3 text-slate-700 capitalize whitespace-nowrap">{batch.eggType || "—"}</td>
        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{typeof batch.totalEggs === "number" ? batch.totalEggs : "—"}</td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full bg-gradient-to-r ${getProgressColor(daysPassed, totalDays)} transition-all`} style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-[10px] font-semibold text-slate-500">{progressPct}%</span>
          </div>
        </td>
        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{daysLeft}</td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
            isCompleted ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-sky-50 text-sky-700 ring-sky-100"
          }`}>
            {batch.status || "active"}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-[11px]">
          {batch.deviceName || batch.deviceId || "—"}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1.5">
            <button type="button" onClick={() => onEdit(batch)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-sky-100 hover:bg-sky-100 transition" title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onDelete(batch.id)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-500 ring-1 ring-rose-100 hover:bg-rose-100 transition" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {!isCompleted && (
              <button type="button" onClick={() => onComplete(batch.id)}
                className="inline-flex h-7 items-center rounded-lg bg-emerald-50 px-2.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-100 hover:bg-emerald-100 transition">
                Complete
              </button>
            )}
            <button type="button" onClick={() => setExpanded(v => !v)}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 transition">
              {expanded ? "Less" : "View More"}
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-slate-50/70">
          <td colSpan={8} className="px-4 pb-5 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Incubation Progress / Hatch Results */}
              {!isCompleted ? (
                <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Incubation Progress</p>
                    <span className="text-[10px] font-semibold text-indigo-600">Day {daysPassed} of {totalDays}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full bg-gradient-to-r ${getProgressColor(daysPassed, totalDays)} transition-all`} style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                    <div><p className="text-slate-400">Start</p><p className="font-semibold">{startDate ? formatShortDate(startDate) : "—"}</p></div>
                    <div><p className="text-slate-400">Hatch Date</p><p className="font-semibold">{hatchingDate ? formatShortDate(hatchingDate) : "—"}</p></div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-2">Hatch Results</p>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div><p className="text-slate-400">Hatched</p><p className="font-semibold text-emerald-600">{batch.hatchedEggs || 0}</p></div>
                    <div><p className="text-slate-400">Dead</p><p className="font-semibold text-rose-600">{batch.deadEggs || 0}</p></div>
                    <div><p className="text-slate-400">Infertile</p><p className="font-semibold text-amber-600">{batch.infertileEggs || 0}</p></div>
                    <div><p className="text-slate-400">Hatch Rate</p><p className="font-semibold text-indigo-600">{batch.totalEggs > 0 ? Math.round(((batch.hatchedEggs || 0) / batch.totalEggs) * 100) : 0}%</p></div>
                  </div>
                </div>
              )}

              {/* AI Recommendation */}
              <div className="rounded-xl bg-indigo-50/60 px-4 py-3 ring-1 ring-indigo-100/60">
                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 mb-2">AI Recommendation</p>
                <div className="space-y-1 text-[10px]">
                  <p><span className="text-slate-400">Temp:</span> <span className="font-semibold">{rec.temperature}</span></p>
                  <p><span className="text-slate-400">Humidity:</span> <span className="font-semibold">{rec.humidity}</span></p>
                  <p><span className="text-slate-400">Final stage:</span> <span className="font-semibold">{rec.finalHumidity}</span></p>
                  <p className="text-slate-600 leading-relaxed mt-1">{rec.text.length > 150 ? rec.text.slice(0, 150) + "…" : rec.text}</p>
                </div>
              </div>

              {/* Incubation Alerts */}
              {!isCompleted && alerts.length > 0 && (
                <div className="sm:col-span-2 rounded-xl bg-amber-50/70 px-4 py-3 ring-1 ring-amber-100/70">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-2">Incubation Alerts</p>
                  <div className="flex flex-wrap gap-2">
                    {alerts.slice(0, 3).map((alert, idx) => (
                      <div key={idx} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100">
                        <span className="text-sm">{alert.icon}</span>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-800">{alert.title}</p>
                          <p className="text-[9px] text-slate-500">{alert.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!isCompleted && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onTrackHatch(batch); }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-purple-700"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Track Hatch
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── TrackHatchModal ──────────────────────────────────────────────────────────
function TrackHatchModal({ isOpen, onClose, batch, onSubmit, isSubmitting }) {
  const [eggsHatched, setEggsHatched] = useState("");
  const [eggsFailed,  setEggsFailed]  = useState("");
  const [hatchDate,   setHatchDate]   = useState(new Date().toISOString().split("T")[0]);
  const [error,       setError]       = useState("");

  useEffect(() => {
    if (isOpen && batch) {
      setEggsHatched(batch.hatchedEggs ? String(Number(batch.hatchedEggs)) : "");
      setEggsFailed(batch.failedToHatch ? String(Number(batch.failedToHatch)) : "");
      const h = batch.hatchingDate?.toDate ? batch.hatchingDate.toDate() : new Date();
      setHatchDate(h.toISOString().split("T")[0]);
      setError("");
    }
  }, [isOpen, batch]);

  const handleSubmit = () => {
    const hatched = Number(eggsHatched);
    const failed  = Number(eggsFailed);
    const total   = Number(batch?.totalEggs || 0);
    if (!Number.isFinite(hatched) || hatched < 0) { setError("Enter valid hatched count."); return; }
    if (!Number.isFinite(failed)  || failed  < 0) { setError("Enter valid failed count.");  return; }
    if (hatched + failed > total) { setError(`Total (${hatched + failed}) exceeds egg count (${total}).`); return; }
    onSubmit({ eggsHatched: hatched, eggsFailed: failed, hatchDate });
  };

  if (!isOpen || !batch) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
      role="dialog" aria-modal="true"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="px-6 pt-6">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-600 ring-1 ring-emerald-100">
                <ClipboardCheck className="h-3.5 w-3.5" /> Record Hatch Results
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">BATCH-{batch.batchId}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Total Eggs: {batch.totalEggs} · {batch.eggType}</p>
            </div>
            <button type="button" onClick={onClose} disabled={isSubmitting}
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition disabled:opacity-50">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Eggs Hatched</label>
              <input type="number" min={0} value={eggsHatched} onChange={e => setEggsHatched(e.target.value)} placeholder="e.g. 10"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Failed to Hatch</label>
              <input type="number" min={0} value={eggsFailed} onChange={e => setEggsFailed(e.target.value)} placeholder="e.g. 2"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400" />
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-slate-700">Hatch Date</label>
            <input type="date" value={hatchDate} onChange={e => setHatchDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
          </div>

          <div className="mb-4 rounded-xl bg-indigo-50 px-4 py-3 ring-1 ring-indigo-100 text-xs text-indigo-900">
            <strong>Note:</strong> Hatched chicks will be automatically added to the Chick Inventory.
          </div>

          {error && <p className="mb-3 text-xs text-rose-600">{error}</p>}
        </div>

        <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} disabled={isSubmitting}
            className="flex-1 h-9 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-white transition disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting}
            className="flex-1 h-9 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-xs font-semibold text-white hover:from-emerald-700 hover:to-teal-700 transition disabled:opacity-50">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete & Add to Inventory"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EggBatchesPage() {
  const router = useRouter();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [batches,       setBatches]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [userDevices,   setUserDevices]   = useState([]);

  // add modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({ batchId: "", eggType: "Chicken", eggCount: "", startDate: "", notes: "", deviceId: "", deviceName: "" });

  // edit modal
  const [isEditOpen,   setIsEditOpen]   = useState(false);
  const [editBatch,    setEditBatch]    = useState(null);
  const [editForm,     setEditForm]     = useState({ eggCount: "", notes: "", deadEggs: "", infertileEggs: "", hatchedEggs: "" });
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editError,    setEditError]    = useState("");

  // complete / delete
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showDeleteModal,   setShowDeleteModal]   = useState(false);
  const [pendingBatchId,    setPendingBatchId]    = useState(null);
  const [isActioning,       setIsActioning]       = useState(false);

  // track hatch
  const [isHatchOpen,        setIsHatchOpen]        = useState(false);
  const [selectedHatchBatch, setSelectedHatchBatch] = useState(null);
  const [isUpdatingHatch,    setIsUpdatingHatch]    = useState(false);

  // search + pagination
  const [search,  setSearch]  = useState("");
  const [page,    setPage]    = useState(1);
  const [perPage, setPerPage] = useState(8);
  const [expandedMobileCard, setExpandedMobileCard] = useState(null);

  // ─── auth + load devices ───────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace("/login"); return; }
      try {
        const snap = await getDocs(collection(firestore, "users", user.uid, "devices"));
        setUserDevices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {}
    });
    return () => unsub();
  }, [router]);

  // ─── load all batches ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(firestore, "egg_batches"), snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const tb = b.createdAt?.toMillis?.() ?? (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return tb - ta;
      });
      setBatches(docs);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // ─── search / paginate ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter(b =>
      (b.batchId     || "").toLowerCase().includes(q) ||
      (b.eggType     || "").toLowerCase().includes(q) ||
      (b.status      || "").toLowerCase().includes(q) ||
      (b.deviceName  || "").toLowerCase().includes(q) ||
      (b.deviceId    || "").toLowerCase().includes(q)
    );
  }, [batches, search]);

  useEffect(() => { setPage(1); }, [search, perPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage   = Math.min(Math.max(1, page), totalPages);
  const paged      = useMemo(() => filtered.slice((safePage - 1) * perPage, safePage * perPage), [filtered, safePage, perPage]);

  // ─── add ───────────────────────────────────────────────────────────────────
  const handleAdd = async (e) => {
    e.preventDefault();
    setSaveError("");
    if (!form.batchId.trim())                          { setSaveError("Batch ID is required."); return; }
    if (!form.eggCount || Number(form.eggCount) <= 0)  { setSaveError("Egg count must be > 0."); return; }
    if (!form.startDate)                               { setSaveError("Start date is required."); return; }
    setIsSaving(true);
    try {
      const totalDays    = INCUBATION_DAYS[form.eggType.toLowerCase()] || 21;
      const start        = new Date(form.startDate);
      const hatchingDate = new Date(start.getTime() + totalDays * 86400000);
      const selectedDevice = userDevices.find(d => d.id === form.deviceId);
      await addDoc(collection(firestore, "egg_batches"), {
        batchId: form.batchId.trim(), eggType: form.eggType, totalEggs: Number(form.eggCount),
        startDate: Timestamp.fromDate(start), hatchingDate: Timestamp.fromDate(hatchingDate),
        incubationDays: totalDays, daysLeft: totalDays, progress: 0,
        status: "active", deadEggs: 0, infertileEggs: 0, notes: form.notes,
        deviceId:   form.deviceId   || null,
        deviceName: selectedDevice?.nickname || selectedDevice?.name || form.deviceId || null,
        uid: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setIsAddOpen(false);
      setForm({ batchId: "", eggType: "Chicken", eggCount: "", startDate: "", notes: "", deviceId: "", deviceName: "" });
    } catch (err) {
      setSaveError(err?.message || "Failed to save batch.");
    } finally {
      setIsSaving(false);
    }
  };

  // ─── edit ──────────────────────────────────────────────────────────────────
  const openEdit = (b) => {
    setEditBatch(b);
    setEditForm({ eggCount: String(b.totalEggs ?? b.eggCount ?? ""), notes: b.notes || "",
      deadEggs: String(b.deadEggs ?? ""), infertileEggs: String(b.infertileEggs ?? ""), hatchedEggs: String(b.hatchedEggs ?? "") });
    setEditError(""); setIsEditOpen(true);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editBatch) return;
    setIsEditSaving(true); setEditError("");
    try {
      await updateDoc(doc(firestore, "egg_batches", editBatch.id), {
        totalEggs:    Number(editForm.eggCount) || editBatch.totalEggs,
        notes:        editForm.notes,
        deadEggs:      editForm.deadEggs      !== "" ? Number(editForm.deadEggs)      : (editBatch.deadEggs      || 0),
        infertileEggs: editForm.infertileEggs !== "" ? Number(editForm.infertileEggs) : (editBatch.infertileEggs || 0),
        ...(editForm.hatchedEggs !== "" ? { hatchedEggs: Number(editForm.hatchedEggs) } : {}),
        updatedAt: serverTimestamp(),
      });
      setIsEditOpen(false); setEditBatch(null);
    } catch (err) {
      setEditError(err?.message || "Failed to save.");
    } finally {
      setIsEditSaving(false);
    }
  };

  // ─── complete ──────────────────────────────────────────────────────────────
  const openComplete = (id) => { setPendingBatchId(id); setShowCompleteModal(true); };

  const confirmClose = async () => {
    if (!pendingBatchId) return;
    setIsActioning(true);
    try {
      const snap = await getDoc(doc(firestore, "egg_batches", pendingBatchId));
      if (snap.exists()) {
        const b = snap.data();
        const hatched = Math.max(0, (b.totalEggs || 0) - (b.deadEggs || 0) - (b.infertileEggs || 0));
        await updateDoc(doc(firestore, "egg_batches", pendingBatchId), { status: "completed", hatchedEggs: hatched, updatedAt: serverTimestamp() });
        const hDate = new Date();
        await setDoc(doc(firestore, "chick_inventory", `batch_${b.batchId || pendingBatchId}_${hDate.getTime()}`), {
          batch_id: String(b.batchId || pendingBatchId), deviceId: b.deviceId || null, deviceName: b.deviceName || null,
          hatch_date: hDate, total_chicks: hatched, available_chicks: hatched, sold_chicks: 0,
          egg_type: b.eggType || "Chicken", total_eggs: b.totalEggs || 0, createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.error(e); }
    setIsActioning(false); setShowCompleteModal(false); setPendingBatchId(null);
  };

  // ─── delete ────────────────────────────────────────────────────────────────
  const openDelete    = (id) => { setPendingBatchId(id); setShowDeleteModal(true); };
  const confirmDelete = async () => {
    if (!pendingBatchId) return;
    setIsActioning(true);
    await deleteDoc(doc(firestore, "egg_batches", pendingBatchId));
    setIsActioning(false); setShowDeleteModal(false); setPendingBatchId(null);
  };

  // ─── track hatch ───────────────────────────────────────────────────────────
  const openTrackHatch = (b) => { setSelectedHatchBatch(b); setIsHatchOpen(true); };

  const handleUpdateHatch = async ({ eggsHatched, eggsFailed, hatchDate }) => {
    if (!selectedHatchBatch?.id) return;
    setIsUpdatingHatch(true);
    try {
      const total     = Number(selectedHatchBatch.totalEggs || 0);
      const hatchRate = total > 0 ? parseFloat(((eggsHatched / total) * 100).toFixed(1)) : 0;
      await updateDoc(doc(firestore, "egg_batches", selectedHatchBatch.id), {
        hatchedEggs: eggsHatched, failedToHatch: eggsFailed, hatchRate,
        status: "completed", progress: 100, hatchDate: new Date(hatchDate), updatedAt: serverTimestamp(),
      });
      await setDoc(doc(firestore, "chick_inventory", `batch_${selectedHatchBatch.batchId}_${Date.now()}`), {
        batch_id: String(selectedHatchBatch.batchId || ""), egg_type: String(selectedHatchBatch.eggType || "Chicken"),
        total_eggs_set: total, total_chicks: eggsHatched, failed_to_hatch: eggsFailed,
        available_chicks: eggsHatched, sold_chicks: 0, hatch_rate: hatchRate,
        hatch_date: new Date(hatchDate),
        deviceId:   selectedHatchBatch.deviceId   || null,
        deviceName: selectedHatchBatch.deviceName || null,
        createdAt: serverTimestamp(),
      });
      setIsHatchOpen(false); setSelectedHatchBatch(null);
    } catch (e) { console.error(e); }
    finally { setIsUpdatingHatch(false); }
  };

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-0 sm:gap-6 px-0 sm:px-4 py-0 sm:py-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-4 sm:gap-6 min-w-0 px-4 py-4 sm:px-0 sm:py-0">
          <TopBar title="Egg Batches" onOpenSidebar={() => setIsSidebarOpen(true)} />

          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-base font-bold tracking-tight text-slate-900">Egg Batches</h1>
            <button type="button" onClick={() => { setSaveError(""); setIsAddOpen(true); }}
              className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-[#004a87] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#003d72]">
              <Plus className="h-3.5 w-3.5" /> New Batch
            </button>
          </div>

          {loading && <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />}

          {!loading && batches.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white px-8 py-16 text-center">
              <Egg className="mb-4 h-12 w-12 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No batches yet</p>
              <p className="mt-1 text-xs text-slate-400">Create your first incubation batch to get started.</p>
              <button type="button" onClick={() => setIsAddOpen(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#004a87] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#003d72]">
                <Plus className="h-3.5 w-3.5" /> New Batch
              </button>
            </div>
          )}

          {!loading && batches.length > 0 && (
            <section className="rounded-3xl bg-white px-4 py-5 sm:px-6 shadow-sm ring-1 ring-slate-100">
              {/* Search */}
              <div className="mb-4 relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by batch ID, egg type, device, status…"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-10 py-2.5 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-500/10" />
              </div>

              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                  <p className="text-xs font-medium text-slate-500">No matching batches.</p>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto rounded-2xl ring-1 ring-slate-100">
                    <table className="w-full min-w-[640px] text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">Batch ID</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">Egg Type</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">Total</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">Progress</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">Days Left</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">Status</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">Device</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paged.map(b => (
                          <BatchRow key={b.id} batch={b}
                            onEdit={openEdit} onDelete={openDelete}
                            onComplete={openComplete} onTrackHatch={openTrackHatch}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-3">
                    {paged.map(b => {
                      const sd   = b.startDate?.toDate ? b.startDate.toDate() : b.startDate ? new Date(b.startDate) : null;
                      const td   = INCUBATION_DAYS[b.eggType?.toLowerCase()] || 21;
                      const dp   = sd ? Math.max(0, Math.floor((Date.now() - sd.getTime()) / 86400000) + 1) : 0;
                      const pct  = sd ? Math.min(100, Math.round((dp / td) * 100)) : 0;
                      const hd   = sd ? new Date(sd.getTime() + td * 86400000) : null;
                      const dl   = hd ? Math.max(0, Math.ceil((hd.getTime() - Date.now()) / 86400000)) : "-";
                      const done = b.status === "completed";
                      const isExpanded = expandedMobileCard === b.id;
                      const rec = getAIRecommendation(b.eggType);
                      const alerts = getIncubationAlerts(dp, b.eggType);
                      return (
                        <div key={b.id}>
                          <div className={`rounded-2xl bg-white px-4 py-4 ring-1 ring-slate-100 shadow-sm cursor-pointer transition ${isExpanded ? "bg-sky-50/50" : "hover:ring-sky-200"}`}
                            onClick={() => setExpandedMobileCard(isExpanded ? null : b.id)}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">{b.batchId ? `BATCH-${b.batchId}` : "—"}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">{b.eggType} · {typeof b.totalEggs === "number" ? b.totalEggs : "—"} eggs{b.deviceName ? ` · ${b.deviceName}` : ""}</p>
                              </div>
                              <span className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${done ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-sky-50 text-sky-700 ring-sky-100"}`}>
                                {b.status || "active"}
                              </span>
                            </div>
                            {!done && (
                              <div className="mt-3">
                                <div className="flex justify-between mb-1">
                                  <span className="text-[10px] text-slate-400">Day {dp} of {td}</span>
                                  <span className="text-[10px] font-semibold text-slate-500">{pct}%</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                  <div className={`h-full bg-gradient-to-r ${getProgressColor(dp, td)} transition-all`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            )}
                            <div className="mt-3 flex items-end justify-between gap-2" onClick={e => e.stopPropagation()}>
                              <p className="text-[11px] font-medium text-slate-600">{dl !== "-" ? `${dl} days left` : "Completed"}</p>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button type="button" onClick={() => openEdit(b)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100 hover:bg-sky-100 transition"><Pencil className="h-3.5 w-3.5" /></button>
                                <button type="button" onClick={() => openDelete(b.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-500 ring-1 ring-rose-100 hover:bg-rose-100 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                                {!done && (
                                  <button type="button" onClick={() => openTrackHatch(b)} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-600 ring-1 ring-indigo-100 hover:bg-indigo-100 transition">
                                    <ClipboardCheck className="h-3.5 w-3.5" /> Track
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="mt-0.5 rounded-2xl bg-slate-50/70 px-4 py-3 ring-1 ring-slate-100 space-y-2.5">
                              {!done ? (
                                <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-100">
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Progress</p>
                                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 mb-1.5">
                                    <div className={`h-full bg-gradient-to-r ${getProgressColor(dp, td)} transition-all`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-[9px]">
                                    <div><p className="text-slate-400">Start</p><p className="font-semibold">{sd ? formatShortDate(sd) : "—"}</p></div>
                                    <div><p className="text-slate-400">Hatch</p><p className="font-semibold">{hd ? formatShortDate(hd) : "—"}</p></div>
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-100">
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-1.5">Results</p>
                                  <div className="grid grid-cols-2 gap-2 text-[9px]">
                                    <div><p className="text-slate-400">Hatched</p><p className="font-semibold text-emerald-600">{b.hatchedEggs || 0}</p></div>
                                    <div><p className="text-slate-400">Dead</p><p className="font-semibold text-rose-600">{b.deadEggs || 0}</p></div>
                                  </div>
                                </div>
                              )}
                              <div className="rounded-xl bg-indigo-50/60 px-3 py-2.5 ring-1 ring-indigo-100/60">
                                <p className="text-[9px] font-bold uppercase tracking-widest text-indigo-600 mb-1">AI Tips</p>
                                <div className="text-[9px] space-y-0.5">
                                  <p><span className="text-slate-500">Temp:</span> <span className="font-semibold">{rec.temperature}</span></p>
                                  <p><span className="text-slate-500">Humidity:</span> <span className="font-semibold">{rec.humidity}</span></p>
                                </div>
                              </div>
                              {!done && alerts.length > 0 && (
                                <div className="rounded-xl bg-amber-50/70 px-3 py-2.5 ring-1 ring-amber-100/70">
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-amber-700 mb-1">Alerts</p>
                                  {alerts.slice(0, 2).map((a, idx) => (
                                    <div key={idx} className="flex gap-1.5 text-[8px] mb-1">
                                      <span className="flex-shrink-0 text-sm">{a.icon}</span>
                                      <div>
                                        <p className="font-semibold text-slate-800">{a.title}</p>
                                        <p className="text-slate-600">{a.message}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center gap-1 rounded-2xl bg-white p-1 ring-1 ring-slate-200">
                        <button onClick={() => setPage(1)} disabled={safePage <= 1} className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronsLeft className="h-4 w-4" /></button>
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                        <span className="px-2 text-xs font-semibold text-slate-600">{safePage} / {totalPages}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                        <button onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronsRight className="h-4 w-4" /></button>
                      </div>
                      <span className="text-[11px] text-slate-400">{filtered.length} total</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Per page</label>
                      <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none">
                        {[6, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </main>
      </div>

      {/* Add Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
          onMouseDown={e => { if (e.target === e.currentTarget) setIsAddOpen(false); }}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h2 className="mb-5 text-sm font-bold text-slate-900">New Batch</h2>
            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Batch ID</label>
                <div className="flex gap-2">
                  <input type="text" value={form.batchId} onChange={e => setForm(p => ({ ...p, batchId: e.target.value }))} placeholder="e.g. CK-250101"
                    className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                  <button type="button" onClick={() => setForm(p => ({ ...p, batchId: generateBatchId(p.eggType) }))}
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-3 py-2 text-xs font-semibold text-white hover:from-violet-700 hover:to-purple-700 transition">
                    <Wand2 className="h-3.5 w-3.5" /><span>Auto</span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Egg Type</label>
                  <select value={form.eggType} onChange={e => setForm(p => ({ ...p, eggType: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400">
                    {EGG_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Egg Count</label>
                  <input type="number" min="1" value={form.eggCount} onChange={e => setForm(p => ({ ...p, eggCount: e.target.value }))} placeholder="e.g. 50"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Start Date</label>
                <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
              </div>
              {userDevices.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Assign to Device <span className="font-normal text-slate-400">(optional)</span></label>
                  <select value={form.deviceId} onChange={e => setForm(p => ({ ...p, deviceId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400">
                    <option value="">— No Device —</option>
                    {userDevices.map(d => (
                      <option key={d.id} value={d.id}>{d.nickname || d.name || d.id}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes…"
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
              </div>
              {saveError && <p className="text-xs text-rose-600">{saveError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setIsAddOpen(false)} className="h-9 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={isSaving} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#004a87] px-4 text-xs font-semibold text-white disabled:opacity-60">
                  {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isSaving ? "Saving…" : "Add Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditOpen && editBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
          onMouseDown={e => { if (e.target === e.currentTarget) setIsEditOpen(false); }}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h2 className="mb-5 text-sm font-bold text-slate-900">Edit Batch — {editBatch.batchId || editBatch.id.slice(0, 6)}</h2>
            <form onSubmit={handleEditSave} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Total Eggs</label>
                  <input type="number" min="1" value={editForm.eggCount} onChange={e => setEditForm(p => ({ ...p, eggCount: e.target.value }))} placeholder="e.g. 50"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Dead Eggs</label>
                  <input type="number" min="0" value={editForm.deadEggs} onChange={e => setEditForm(p => ({ ...p, deadEggs: e.target.value }))} placeholder="0"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Infertile Eggs</label>
                  <input type="number" min="0" value={editForm.infertileEggs} onChange={e => setEditForm(p => ({ ...p, infertileEggs: e.target.value }))} placeholder="0"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Hatched Eggs <span className="font-normal text-slate-400">(opt.)</span></label>
                  <input type="number" min="0" value={editForm.hatchedEggs} onChange={e => setEditForm(p => ({ ...p, hatchedEggs: e.target.value }))} placeholder="auto"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes…"
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
              </div>
              {editError && <p className="text-xs text-rose-600">{editError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setIsEditOpen(false)} className="h-9 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={isEditSaving} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#004a87] px-4 text-xs font-semibold text-white disabled:opacity-60">
                  {isEditSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isEditSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Confirm */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"><CheckCircle2 className="h-6 w-6" /></div>
            <h3 className="mt-4 text-base font-bold text-slate-900">Mark as Completed?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">This batch will be closed and hatched chicks auto-added to inventory.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => { setShowCompleteModal(false); setPendingBatchId(null); }} disabled={isActioning}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button onClick={confirmClose} disabled={isActioning}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {isActioning ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100"><Trash2 className="h-6 w-6" /></div>
            <h3 className="mt-4 text-base font-bold text-slate-900">Delete Batch?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">This batch will be permanently deleted. This cannot be undone.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setPendingBatchId(null); }} disabled={isActioning}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button onClick={confirmDelete} disabled={isActioning}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                {isActioning ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Track Hatch Modal */}
      <TrackHatchModal
        isOpen={isHatchOpen}
        onClose={() => { setIsHatchOpen(false); setSelectedHatchBatch(null); }}
        batch={selectedHatchBatch}
        onSubmit={handleUpdateHatch}
        isSubmitting={isUpdatingHatch}
      />
    </div>
  );
}
