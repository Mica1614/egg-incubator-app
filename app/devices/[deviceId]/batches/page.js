// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, onSnapshot, query, addDoc, serverTimestamp, updateDoc, deleteDoc, where, Timestamp, setDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";import BreadcrumbNav from "@/components/BreadcrumbNav";import Link from "next/link";
import { ChevronLeft, Plus, Egg, CheckCircle2, Clock, Trash2, AlertTriangle, Loader2, Wand2, Pencil } from "lucide-react";

const EGG_TYPES = ["Chicken", "Duck", "Quail", "Goose"];
const INCUBATION_DAYS = { chicken: 21, duck: 28, quail: 18, goose: 30 };
const EGG_TYPE_PREFIX = { chicken: "CK", duck: "DK", quail: "QL", goose: "GS" };

function generateBatchId(eggType) {
  const prefix = EGG_TYPE_PREFIX[String(eggType || "").toLowerCase()] || "CK";
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
  return `${prefix}-${yy}${mm}${dd}-${hex}`;
}

export default function DeviceBatchesPage() {
  const { deviceId } = useParams();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(null);
  const [nickname, setNickname] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [userDevices, setUserDevices] = useState([]);
  const [form, setForm] = useState({ batchId: "", eggType: "Chicken", eggCount: "", startDate: "", notes: "" });
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingBatchId, setPendingBatchId] = useState(null);
  const [isActioning, setIsActioning] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editBatch, setEditBatch] = useState(null);
  const [editForm, setEditForm] = useState({ eggCount: "", notes: "", hatchedEggs: "", deadEggs: "", infertileEggs: "" });
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [showAllCompleted, setShowAllCompleted] = useState(false);

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
      collection(firestore, "egg_batches"),
      where("deviceId", "==", deviceId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const tb = b.createdAt?.toMillis?.() ?? (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return tb - ta;
      });
      setBatches(docs);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [authorized, deviceId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaveError("");
    if (!form.batchId.trim()) { setSaveError("Batch ID is required."); return; }
    if (!form.eggCount || Number(form.eggCount) <= 0) { setSaveError("Egg count must be greater than 0."); return; }
    if (!form.startDate) { setSaveError("Start date is required."); return; }
    setIsSaving(true);
    try {
      const totalDays = INCUBATION_DAYS[form.eggType.toLowerCase()] || 21;
      const start = new Date(form.startDate);
      const hatchingDate = new Date(start);
      hatchingDate.setDate(hatchingDate.getDate() + totalDays);
      await addDoc(collection(firestore, "egg_batches"), {
        batchId: form.batchId.trim(),
        eggType: form.eggType,
        totalEggs: Number(form.eggCount),
        startDate: Timestamp.fromDate(start),
        hatchingDate: Timestamp.fromDate(hatchingDate),
        incubationDays: totalDays,
        daysLeft: Math.ceil((hatchingDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
        progress: 0,
        status: "active",
        deadEggs: 0,
        infertileEggs: 0,
        notes: form.notes,
        deviceId: deviceId,
        deviceName: nickname || deviceId,
        uid: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setIsAddOpen(false);
      setForm({ batchId: "", eggType: "Chicken", eggCount: "", startDate: "", notes: "" });
    } catch (err) {
      setSaveError(err?.message || "Failed to save batch.");
    } finally {
      setIsSaving(false);
    }
  };

  const closeBatch = async (id) => {
    setPendingBatchId(id);
    setShowCompleteModal(true);
  };

  const confirmClose = async () => {
    if (!pendingBatchId) return;
    setIsActioning(true);
    try {
      const batchSnap = await getDoc(doc(firestore, "egg_batches", pendingBatchId));
      if (batchSnap.exists()) {
        const b = batchSnap.data();
        // Calculate hatched eggs from scan results (total minus dead and infertile)
        const hatchedEggs = Math.max(0, (b.totalEggs || 0) - (b.deadEggs || 0) - (b.infertileEggs || 0));
        // Mark batch as completed with hatchedEggs
        await updateDoc(doc(firestore, "egg_batches", pendingBatchId), {
          status: "completed",
          hatchedEggs,
          updatedAt: serverTimestamp(),
        });
        // Auto-add to chick inventory
        const hDate = new Date();
        await setDoc(doc(firestore, "chick_inventory", `batch_${b.batchId || pendingBatchId}_${hDate.getTime()}`), {
          batch_id: String(b.batchId || pendingBatchId),
          deviceId: b.deviceId || null,
          deviceName: b.deviceName || null,
          hatch_date: hDate,
          total_chicks: hatchedEggs,
          available_chicks: hatchedEggs,
          sold_chicks: 0,
          egg_type: b.eggType || "Chicken",
          total_eggs: b.totalEggs || 0,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) { console.error(e); }
    setIsActioning(false);
    setShowCompleteModal(false);
    setPendingBatchId(null);
  };

  const openEdit = (b) => {
    setEditBatch(b);
    setEditForm({
      eggCount: String(b.totalEggs ?? b.eggCount ?? ""),
      notes: b.notes || "",
      hatchedEggs: String(b.hatchedEggs ?? ""),
      deadEggs: String(b.deadEggs ?? ""),
      infertileEggs: String(b.infertileEggs ?? ""),
    });
    setEditError("");
    setIsEditOpen(true);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editBatch) return;
    setIsEditSaving(true);
    setEditError("");
    try {
      await updateDoc(doc(firestore, "egg_batches", editBatch.id), {
        totalEggs: Number(editForm.eggCount) || editBatch.totalEggs,
        notes: editForm.notes,
        deadEggs: editForm.deadEggs !== "" ? Number(editForm.deadEggs) : (editBatch.deadEggs || 0),
        infertileEggs: editForm.infertileEggs !== "" ? Number(editForm.infertileEggs) : (editBatch.infertileEggs || 0),
        ...(editForm.hatchedEggs !== "" ? { hatchedEggs: Number(editForm.hatchedEggs) } : {}),
        updatedAt: serverTimestamp(),
      });
      setIsEditOpen(false);
      setEditBatch(null);
    } catch (err) {
      setEditError(err?.message || "Failed to save.");
    } finally {
      setIsEditSaving(false);
    }
  };

  const deleteBatch = async (id) => {
    setPendingBatchId(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!pendingBatchId) return;
    setIsActioning(true);
    await deleteDoc(doc(firestore, "egg_batches", pendingBatchId));
    setIsActioning(false);
    setShowDeleteModal(false);
    setPendingBatchId(null);
  };

  if (authorized === null) {
    return <div className="flex h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#004a87] border-t-transparent" /></div>;
  }
  if (authorized === false) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-400" />
        <p className="text-sm font-semibold text-slate-900">Device not in your account.</p>
        <Link href="/dashboard" className="rounded-2xl bg-[#004a87] px-4 py-2 text-sm font-semibold text-white">Back to Dashboard</Link>
      </div>
    );
  }

  const activeBatches = batches.filter((b) => b.status === "active");
  const completedBatches = batches.filter((b) => b.status !== "active");

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />
        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="Egg Batches" onOpenSidebar={() => setIsSidebarOpen(true)} />

          <BreadcrumbNav deviceId={deviceId} deviceName={nickname} currentPage="Egg Batches" />

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <h1 className="text-base font-bold tracking-tight text-slate-900">Egg Batches</h1>
              <button
                type="button"
                onClick={() => { setSaveError(""); setIsAddOpen(true); }}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#004a87] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#003d72]"
              >
                <Plus className="h-3.5 w-3.5" /> New Batch
              </button>
            </div>
          </div>

          {loading && <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />}

          {!loading && batches.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white px-8 py-16 text-center">
              <Egg className="mb-4 h-12 w-12 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No batches yet</p>
              <p className="mt-1 text-xs text-slate-400">Start your first incubation batch for this device.</p>
              <button type="button" onClick={() => setIsAddOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#004a87] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#003d72]">
                <Plus className="h-3.5 w-3.5" /> New Batch
              </button>
            </div>
          )}

          {activeBatches.length > 0 && (
            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Active</p>
              <div className="flex flex-col gap-3">
                {activeBatches.map((b) => {
                  const startDate = b.startDate?.toDate ? b.startDate.toDate() : b.startDate ? new Date(b.startDate) : null;
                  const totalDays = INCUBATION_DAYS[b.eggType?.toLowerCase()] || 21;
                  const elapsedDays = startDate ? Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1 : 0;
                  const progress = startDate ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;
                  return (
                    <div key={b.id} className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">Batch #{b.batchId || b.id.slice(0, 6)}</span>
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-100">Active</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{b.eggType} · {b.totalEggs ?? b.eggCount} eggs{b.startDate ? ` · Started ${(b.startDate?.toDate ? b.startDate.toDate() : new Date(b.startDate)).toLocaleDateString()}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => openEdit(b)} className="rounded-xl bg-sky-50 p-1.5 text-sky-600 ring-1 ring-sky-100 hover:bg-sky-100 transition" title="Edit batch">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => closeBatch(b.id)} className="rounded-xl bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-100 hover:bg-emerald-100 transition">
                            Complete
                          </button>
                          <button type="button" onClick={() => deleteBatch(b.id)} className="rounded-xl bg-rose-50 p-1.5 text-rose-500 ring-1 ring-rose-100 hover:bg-rose-100 transition">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {startDate && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-400">Day {elapsedDays} of {totalDays}</span>
                            <span className="text-[10px] font-semibold text-slate-500">{progress}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-[#004a87] transition-all" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      )}
                      {b.notes && <p className="mt-2 text-xs text-slate-500 italic">{b.notes}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {completedBatches.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Completed</p>
                {completedBatches.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllCompleted((v) => !v)}
                    className="text-[11px] font-semibold text-sky-600 hover:text-sky-800 transition"
                  >
                    {showAllCompleted ? "Show Less" : `View All (${completedBatches.length})`}
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {(showAllCompleted ? completedBatches : completedBatches.slice(0, 3)).map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
                    <div>
                      <span className="text-xs font-semibold text-slate-700">Batch #{b.batchId || b.id.slice(0, 6)}</span>
                      <p className="text-[10px] text-slate-400">{b.eggType} · {b.eggCount} eggs</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-slate-300" />
                      <button type="button" onClick={() => deleteBatch(b.id)} className="rounded-lg p-1 text-slate-300 hover:text-rose-400 transition">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {!showAllCompleted && completedBatches.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllCompleted(true)}
                    className="w-full rounded-xl border border-dashed border-slate-200 py-2.5 text-xs font-semibold text-slate-400 hover:border-sky-300 hover:text-sky-600 transition"
                  >
                    +{completedBatches.length - 3} more completed batches
                  </button>
                )}
              </div>
            </section>
          )}
        </main>
      </div>

      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsAddOpen(false); }}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">New Batch</h2>
            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Batch ID</label>
                  <div className="flex gap-1">
                    <input type="text" value={form.batchId} onChange={(e) => setForm((p) => ({ ...p, batchId: e.target.value }))} placeholder="e.g. CK-250101" className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                    <button type="button" onClick={() => setForm((p) => ({ ...p, batchId: generateBatchId(p.eggType) }))} title="Generate ID" className="rounded-xl bg-violet-600 px-2 text-white hover:bg-violet-700 transition">
                      <Wand2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Egg Type</label>
                  <select value={form.eggType} onChange={(e) => setForm((p) => ({ ...p, eggType: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400">
                    {EGG_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Egg Count</label>
                  <input type="number" min="1" value={form.eggCount} onChange={(e) => setForm((p) => ({ ...p, eggCount: e.target.value }))} placeholder="e.g. 50" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Start Date</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes…" className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
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

      {/* Edit Batch Modal */}
      {isEditOpen && editBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsEditOpen(false); }}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Edit Batch — {editBatch.batchId || editBatch.id.slice(0, 6)}</h2>
            <form onSubmit={handleEditSave} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Total Eggs</label>
                  <input type="number" min="1" value={editForm.eggCount} onChange={(e) => setEditForm((p) => ({ ...p, eggCount: e.target.value }))} placeholder="e.g. 50" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Dead Eggs</label>
                  <input type="number" min="0" value={editForm.deadEggs} onChange={(e) => setEditForm((p) => ({ ...p, deadEggs: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Infertile Eggs</label>
                  <input type="number" min="0" value={editForm.infertileEggs} onChange={(e) => setEditForm((p) => ({ ...p, infertileEggs: e.target.value }))} placeholder="0" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Hatched Eggs <span className="font-normal text-slate-400">(optional)</span></label>
                  <input type="number" min="0" value={editForm.hatchedEggs} onChange={(e) => setEditForm((p) => ({ ...p, hatchedEggs: e.target.value }))} placeholder="auto-calc on complete" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Notes</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes…" className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
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

      {/* Complete Batch Confirm Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">Mark as Completed?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">This batch will be moved to the completed list. You can still view it in Batch History.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => { setShowCompleteModal(false); setPendingBatchId(null); }} disabled={isActioning} className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button onClick={confirmClose} disabled={isActioning} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {isActioning ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Batch Confirm Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">Delete Batch?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">This batch will be permanently deleted. This cannot be undone.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setPendingBatchId(null); }} disabled={isActioning} className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button onClick={confirmDelete} disabled={isActioning} className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                {isActioning ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
