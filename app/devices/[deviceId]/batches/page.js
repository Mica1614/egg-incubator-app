// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, onSnapshot, orderBy, query, addDoc, serverTimestamp, updateDoc, deleteDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Link from "next/link";
import { ChevronLeft, Plus, Egg, CheckCircle2, Clock, Trash2, AlertTriangle, Loader2 } from "lucide-react";

const EGG_TYPES = ["Chicken", "Duck", "Quail", "Goose"];
const INCUBATION_DAYS = { chicken: 21, duck: 28, quail: 18, goose: 30 };

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
  const [form, setForm] = useState({ deviceId: "", batchId: "", eggType: "Chicken", eggCount: "", startDate: "", notes: "" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace("/login"); return; }
      const snap = await getDoc(doc(firestore, "users", user.uid, "devices", deviceId));
      if (!snap.exists()) { setAuthorized(false); return; }
      setNickname(snap.data()?.nickname || deviceId);
      setAuthorized(true);
      
      // Load all user devices for the dropdown

      const docsSnap = await onSnapshot(collection(firestore, "users", user.uid, "devices"), (snap) => {
        const devices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUserDevices(devices);
        // Set default device for the form
        setForm((p) => ({ ...p, deviceId: deviceId }));
      });
      return () => docsSnap();
    });
    return () => unsub();
  }, [deviceId, router]);

  useEffect(() => {
    if (!authorized) return;
    const q = query(
      collection(firestore, "devices", deviceId, "batches"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setBatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [authorized, deviceId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.deviceId) { setSaveError("Please select a device."); return; }
    setSaveError("");
    setIsSaving(true);
    try {
      const selectedDeviceId = form.deviceId;
      await addDoc(collection(firestore, "devices", selectedDeviceId, "batches"), {
        batchId: form.batchId,
        eggType: form.eggType,
        eggCount: Number(form.eggCount) || 0,
        startDate: form.startDate,
        notes: form.notes,
        status: "ACTIVE",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setIsAddOpen(false);
      setForm({ deviceId: deviceId, batchId: "", eggType: "Chicken", eggCount: "", startDate: "", notes: "" });
    } catch (err) {
      setSaveError(err?.message || "Failed to save batch.");
    } finally {
      setIsSaving(false);
    }
  };

  const closeBatch = async (id) => {
    if (!confirm("Mark this batch as completed?")) return;
    await updateDoc(doc(firestore, "devices", deviceId, "batches", id), {
      status: "COMPLETED",
      updatedAt: serverTimestamp(),
    });
  };

  const deleteBatch = async (id) => {
    if (!confirm("Delete this batch permanently?")) return;
    await deleteDoc(doc(firestore, "devices", deviceId, "batches", id));
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

  const activeBatches = batches.filter((b) => b.status === "ACTIVE");
  const completedBatches = batches.filter((b) => b.status !== "ACTIVE");

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />
        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="Egg Batches" onOpenSidebar={() => setIsSidebarOpen(true)} />

          <div className="flex flex-col gap-1">
            <Link href={`/devices/${deviceId}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition">
              <ChevronLeft className="h-3 w-3" /> {nickname || deviceId}
            </Link>
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
                  const startDate = b.startDate ? new Date(b.startDate) : null;
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
                          <p className="text-xs text-slate-500 mt-0.5">{b.eggType} · {b.eggCount} eggs{startDate ? ` · Started ${startDate.toLocaleDateString()}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2">
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
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Completed</p>
              <div className="flex flex-col gap-2">
                {completedBatches.map((b) => (
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
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Select Incubator</label>
                <select value={form.deviceId} onChange={(e) => setForm((p) => ({ ...p, deviceId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400">
                  <option value="">Choose an incubator...</option>
                  {userDevices.map((d) => <option key={d.id} value={d.id}>{d.nickname || d.id}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Batch ID</label>
                  <input type="text" value={form.batchId} onChange={(e) => setForm((p) => ({ ...p, batchId: e.target.value }))} placeholder="e.g. B001" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400" />
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
    </div>
  );
}
