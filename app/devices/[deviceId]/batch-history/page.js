// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc, getDoc, collection, onSnapshot, query,
  updateDoc, deleteDoc, serverTimestamp, setDoc, where,
} from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import BreadcrumbNav from "@/components/BreadcrumbNav";
import Link from "next/link";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  ChevronLeft, AlertTriangle, Loader2, Check, Trash2,
  ArchiveRestore, FileDown, FileSpreadsheet, ClipboardList,
  ChevronsLeft, ChevronsRight, ChevronRight,
} from "lucide-react";
import BatchFilterBar from "@/components/BatchFilterBar";
import { filterBatches, EMPTY_FILTERS } from "@/lib/batchFilters.mjs";

const formatShortDate = (date) => {
  try {
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
};

const incubationDaysForType = (eggType) => {
  const type = String(eggType || "").toLowerCase();
  if (type === "chicken") return 21;
  if (type === "duck") return 28;
  if (type === "quail") return 18;
  if (type === "goose") return 30;
  if (type === "turkey") return 28;
  return 21;
};

function BatchRow({ batch, deviceId }) {
  const autoHatched = Math.max(0, (batch?.totalEggs || 0) - (batch?.deadEggs || 0) - (batch?.infertileEggs || 0));
  const [hatchedValue, setHatchedValue] = useState(
    batch?.hatchedEggs != null ? String(batch.hatchedEggs) : String(autoHatched)
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const hatchRate = batch?.totalEggs > 0
    ? Math.round((Number(hatchedValue || 0) / Number(batch.totalEggs)) * 100)
    : 0;

  const handleSaveHatched = async () => {
    const val = Number(hatchedValue);
    if (isNaN(val) || val < 0) return;
    setIsUpdating(true);
    try {
      await updateDoc(doc(firestore, "egg_batches", batch.id), {
        hatchedEggs: val,
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(firestore, "chick_inventory", `batch_${batch.batchId}`), {
        batch_id: String(batch.batchId || ""),
        deviceId: batch.deviceId || null,
        deviceName: batch.deviceName || null,
        hatch_date: new Date(),
        total_chicks: val,
        available_chicks: val,
        sold_chicks: 0,
        egg_type: batch.eggType || "Chicken",
        createdAt: serverTimestamp(),
      });
      setShowCheck(true);
      setTimeout(() => setShowCheck(false), 2000);
    } catch (e) { console.error(e); }
    finally { setIsUpdating(false); }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try { await deleteDoc(doc(firestore, "egg_batches", batch.id)); }
    catch (e) { console.error(e); setIsDeleting(false); }
  };

  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition">
        <td className="py-3 pr-4 pl-3">
          <span className="text-[12px] font-semibold text-slate-900">{batch?.batchId || "—"}</span>
        </td>
        <td className="py-3 pr-4 text-xs text-slate-700 capitalize">{batch?.eggType || "—"}</td>
        <td className="py-3 pr-4 text-xs font-semibold text-slate-900 tabular-nums">{batch?.totalEggs ?? "—"}</td>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-1.5">
            <input
              type="number" min="0" max={batch?.totalEggs}
              value={hatchedValue}
              onChange={(e) => setHatchedValue(e.target.value)}
              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10"
            />
            <button
              onClick={handleSaveHatched}
              disabled={isUpdating || String(hatchedValue) === String(batch?.hatchedEggs ?? autoHatched)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-30 transition"
            >
              {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </button>
          </div>
        </td>
        <td className="py-3 pr-4">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
            hatchRate >= 70 ? "bg-emerald-50 text-emerald-700" : hatchRate >= 40 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
          }`}>
            {hatchRate}%
          </span>
        </td>
        <td className="py-3 pr-4 text-xs text-slate-500 whitespace-nowrap">{batch._startDate ? formatShortDate(batch._startDate) : "—"}</td>
        <td className="py-3 pr-4 text-xs text-slate-500 whitespace-nowrap">{batch?._hatchDate ? formatShortDate(batch._hatchDate) : "—"}</td>
        <td className="py-3 pl-0">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/devices/${deviceId}/batches/${batch.id}/report`}
              className="inline-flex h-7 items-center gap-1 rounded-lg bg-sky-50 px-2 text-[11px] font-semibold text-[#004a87] ring-1 ring-sky-100 transition hover:bg-sky-100"
              title="View full batch report"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Report
            </Link>
            <button
              onClick={() => setIsDeleteConfirmOpen(true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-500 ring-1 ring-rose-100 hover:bg-rose-100 transition"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>

      {isDeleteConfirmOpen && (
        <tr><td colSpan={8}>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
            <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Delete Batch?</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Delete <span className="font-semibold text-slate-900">{batch.batchId}</span>? This cannot be undone.
              </p>
              <div className="mt-6 flex gap-3">
                <button onClick={() => setIsDeleteConfirmOpen(false)} disabled={isDeleting} className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button onClick={handleDelete} disabled={isDeleting} className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}

export default function DeviceBatchHistoryPage() {
  const { deviceId } = useParams();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(null);
  const [nickname, setNickname] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [batches, setBatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(6);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      const snap = await getDoc(doc(firestore, "users", user.uid, "devices", deviceId));
      setNickname(snap.data()?.nickname || deviceId);
      setAuthorized(true);
    });
    return () => unsub();
  }, [deviceId, router]);

  useEffect(() => {
    const q = query(collection(firestore, "egg_batches"), where("deviceId", "==", deviceId));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => {
        const data = d.data();
        const startDate = data.startDate?.toDate ? data.startDate.toDate() : data.startDate ? new Date(data.startDate) : null;
        const totalDays = incubationDaysForType(data.eggType);
        const hatchDate = startDate ? new Date(startDate.getTime() + totalDays * 86400000) : null;
        return { id: d.id, ...data, _startDate: startDate, _hatchDate: hatchDate };
      });
      docs.sort((a, b) => (b._startDate?.getTime() ?? 0) - (a._startDate?.getTime() ?? 0));
      setBatches(docs);
      setIsLoading(false);
    }, (err) => { setLoadError(err.message); setIsLoading(false); });
    return () => unsub();
  }, [authorized, deviceId]);

  const summary = useMemo(() => {
    const totalBatches = batches.length;
    const totalEggs = batches.reduce((s, b) => s + (Number(b.totalEggs) || 0), 0);
    const totalChicks = batches.reduce((s, b) => s + (Number(b.hatchedEggs) || 0), 0);
    const avgHatchRate = totalEggs > 0 ? (totalChicks / totalEggs) * 100 : 0;
    return { totalBatches, totalChicks, avgHatchRate };
  }, [batches]);

  const filteredBatches = useMemo(() => filterBatches(batches, filters), [batches, filters]);

  // Reset paging in the handlers rather than an effect — an effect would cause
  // a cascading render, and these are the only two ways the page can change.
  const handleFiltersChange = (next) => { setFilters(next); setPage(1); };
  const handlePerPageChange = (next) => { setPerPage(next); setPage(1); };

  const totalPages = Math.max(1, Math.ceil(filteredBatches.length / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedBatches = useMemo(() => filteredBatches.slice((safePage - 1) * perPage, safePage * perPage), [filteredBatches, safePage, perPage]);

  const exportToPDF = () => {
    const d = new jsPDF();
    d.text(`Batch History — ${nickname || deviceId}`, 14, 15);
    d.setFontSize(9);
    d.text(`Exported: ${new Date().toLocaleString()}`, 14, 22);
    autoTable(d, {
      startY: 28,
      head: [["Batch ID", "Type", "Total", "Hatched", "Rate", "Start", "Hatch Date"]],
      body: filteredBatches.map((b) => {
        const hr = b.totalEggs > 0 ? Math.round(((b.hatchedEggs || 0) / b.totalEggs) * 100) : 0;
        return [b.batchId || "—", b.eggType || "—", b.totalEggs ?? "—", b.hatchedEggs ?? "—", `${hr}%`,
          b._startDate ? formatShortDate(b._startDate) : "—",
          b._hatchDate ? formatShortDate(b._hatchDate) : "—"];
      }),
    });
    d.save(`BatchHistory_${deviceId}_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredBatches.map((b) => {
      const hr = b.totalEggs > 0 ? Math.round(((b.hatchedEggs || 0) / b.totalEggs) * 100) : 0;
      return {
        "Batch ID": b.batchId || "—", "Egg Type": b.eggType || "—",
        "Total Eggs": b.totalEggs ?? 0, "Hatched": b.hatchedEggs ?? 0,
        "Hatch Rate": `${hr}%`,
        "Start Date": b._startDate ? formatShortDate(b._startDate) : "—",
        "Hatch Date": b._hatchDate ? formatShortDate(b._hatchDate) : "—",
      };
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Batch History");
    XLSX.writeFile(wb, `BatchHistory_${deviceId}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  if (authorized === null) return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#004a87] border-t-transparent" />
    </div>
  );

  if (authorized === false) return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-12 w-12 text-amber-400" />
      <p className="text-sm font-semibold text-slate-900">Device not in your account.</p>
      <Link href="/dashboard" className="rounded-2xl bg-[#004a87] px-4 py-2 text-sm font-semibold text-white">Back to Dashboard</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />
        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="Batch History" onOpenSidebar={() => setIsSidebarOpen(true)} />

          <BreadcrumbNav deviceId={deviceId} deviceName={nickname} currentPage="Batch History" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-[#004a87]">
                <ArchiveRestore className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-slate-900">Batch History</h1>
                <p className="text-[11px] text-slate-400">{nickname}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={exportToPDF} disabled={batches.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 transition">
                  <FileDown className="h-3.5 w-3.5" />PDF
                </button>
                <button onClick={exportToExcel} disabled={batches.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition">
                  <FileSpreadsheet className="h-3.5 w-3.5" />Excel
                </button>
              </div>
            </div>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Batches</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{summary.totalBatches}</p>
              <p className="mt-1 text-xs text-slate-500">All records</p>
            </article>
            <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Avg Hatch Rate</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-600">{Math.round(summary.avgHatchRate)}%</p>
              <p className="mt-1 text-xs text-slate-500">Efficiency</p>
            </article>
            <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Chicks</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-indigo-600">{summary.totalChicks}</p>
              <p className="mt-1 text-xs text-slate-500">Successful hatches</p>
            </article>
          </section>

          <BatchFilterBar
            filters={filters}
            onChange={handleFiltersChange}
            resultCount={filteredBatches.length}
            totalCount={batches.length}
          />

          <section className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-tight text-slate-900">All Batches</p>
                <p className="mt-1 text-[11px] text-slate-500">All batches for {nickname || deviceId}.</p>
              </div>
            </div>

            {isLoading ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <p className="text-xs font-medium text-slate-500">Loading…</p>
              </div>
            ) : loadError ? (
              <div className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700 ring-1 ring-rose-200">{loadError}</div>
            ) : batches.length === 0 ? (
              <div className="mt-5 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white px-8 py-16 text-center">
                <ArchiveRestore className="mb-4 h-12 w-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">No batches yet</p>
                <p className="mt-1 text-xs text-slate-400">Batches for this device will appear here.</p>
              </div>
            ) : filteredBatches.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <p className="text-xs font-medium text-slate-500">No matching results.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-100">
                  <table className="min-w-[640px] w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="py-2.5 pr-4 pl-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Batch ID</th>
                        <th className="py-2.5 pr-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Type</th>
                        <th className="py-2.5 pr-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</th>
                        <th className="py-2.5 pr-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Hatched</th>
                        <th className="py-2.5 pr-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Rate</th>
                        <th className="py-2.5 pr-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Start</th>
                        <th className="py-2.5 pr-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Hatch Date</th>
                        <th className="py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedBatches.map((batch) => (
                        <BatchRow key={batch.id} batch={batch} deviceId={deviceId} />
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center gap-1 rounded-2xl bg-white/70 p-1 ring-1 ring-slate-200/70">
                      <button type="button" onClick={() => setPage(1)} disabled={safePage <= 1} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
                        <ChevronsLeft className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <div className="px-2 text-xs font-semibold text-slate-600">{safePage} / {totalPages}</div>
                      <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition">
                        <ChevronsRight className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-[11px] font-medium text-slate-400">{filteredBatches.length} total</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Per page</label>
                    <select value={perPage} onChange={(e) => handlePerPageChange(Number(e.target.value))} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-500/10">
                      <option value={3}>3</option>
                      <option value={6}>6</option>
                      <option value={9}>9</option>
                      <option value={12}>12</option>
                      <option value={15}>15</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
