// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { Info, Search, Box, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Check, Loader2, Trash2, FileDown, FileSpreadsheet } from "lucide-react";
import TopBar from "@/components/TopBar";
import { firestore } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query, doc, updateDoc, serverTimestamp, deleteDoc, setDoc } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const formatToday = () => {
  const now = new Date();
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatShortDate = (date) => {
  try {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const incubationDaysForType = (eggType) => {
  const type = String(eggType || "").toLowerCase();
  if (type === "duck") return 28;
  return 21;
};

const computeDerived = ({ startDate, eggType }) => {
  const totalDays = incubationDaysForType(eggType);
  const start = startDate instanceof Date ? startDate : startDate ? new Date(startDate) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return {
      totalDays,
      hatchingDate: null,
      daysLeft: null,
    };
  }

  const hatch = addDays(start, totalDays);
  const now = new Date();
  const diffMs = hatch.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  return {
    totalDays,
    hatchingDate: hatch,
    daysLeft,
  };
};

function BatchCard({ batch, formatShortDate }) {
  const [hatchedValue, setHatchedValue] = useState(batch?.hatchedEggs ?? "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSaveHatched = async () => {
    const val = Number(hatchedValue);
    if (isNaN(val) || val < 0) return;
    if (val > (batch?.totalEggs ?? 9999)) return;

    setIsUpdating(true);
    try {
      // Update the batch with hatched eggs count
      await updateDoc(doc(firestore, "egg_batches", batch.id), {
        hatchedEggs: val,
        updatedAt: serverTimestamp(),
      });

      // Create or update chick inventory record
      const hatchDate = new Date();
      await setDoc(doc(firestore, "chick_inventory", `batch_${batch.batchId}_${hatchDate.getTime()}`), {
        batch_id: String(batch.batchId || ""),
        hatch_date: hatchDate,
        total_chicks: val,
        available_chicks: val,
        sold_chicks: 0,
        createdAt: serverTimestamp(),
      });

      setShowCheck(true);
      setTimeout(() => setShowCheck(false), 2000);
    } catch (e) {
      console.error("Failed to update hatched eggs:", e);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(firestore, "egg_batches", batch.id));
    } catch (e) {
      console.error("Failed to delete batch:", e);
      setIsDeleting(false);
    }
  };

  return (
    <>
      <article className="rounded-3xl bg-white px-4 py-4 shadow-sm ring-1 ring-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold tracking-tight text-slate-900">
              {batch?.batchId ? `BATCH-${batch.batchId}` : "BATCH"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {typeof batch?.totalEggs === "number" ? `${batch.totalEggs} eggs total` : "-"}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsDeleteConfirmOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100 transition hover:bg-rose-100"
              title="Delete Batch"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-50 text-slate-600 ring-1 ring-slate-100">
              <Box className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-sky-50/70 px-3 py-2 ring-1 ring-sky-100/80">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Egg Type</p>
            <p className="mt-1 text-base font-semibold tracking-tight text-slate-900">
              {batch?.eggType ? String(batch.eggType) : "-"}
            </p>
          </div>

          <div className="rounded-2xl bg-sky-50/70 px-3 py-2 ring-1 ring-sky-100/80">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</p>
            <p className="mt-1 text-base font-semibold tracking-tight text-slate-900">
              {batch?.status ? String(batch.status) : "-"}
            </p>
          </div>

          <div className="rounded-2xl bg-amber-50/60 px-3 py-2 ring-1 ring-amber-100/80">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Start</p>
            <p className="mt-1 text-[12px] font-semibold tracking-tight text-slate-900">
              {batch._startDate ? formatShortDate(batch._startDate) : "-"}
            </p>
          </div>

          <div className="rounded-2xl bg-amber-50/60 px-3 py-2 ring-1 ring-amber-100/80">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Hatch</p>
            <p className="mt-1 text-[12px] font-semibold tracking-tight text-slate-900">
              {batch?._derived?.hatchingDate ? formatShortDate(batch._derived.hatchingDate) : "-"}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Hatched Eggs (Chicks)</label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              max={batch?.totalEggs}
              value={hatchedValue}
              onChange={(e) => setHatchedValue(e.target.value)}
              placeholder="Enter count"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-500/10"
            />
            <button
              onClick={handleSaveHatched}
              disabled={isUpdating || String(hatchedValue) === String(batch?.hatchedEggs ?? "")}
              className="inline-flex min-w-[60px] items-center justify-center rounded-xl bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-slate-800 disabled:opacity-30"
            >
              {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : showCheck ? <Check className="h-3 w-3" /> : "Save"}
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-100">
          <span className="text-[11px] font-medium text-slate-600">Days left</span>
          <span className="text-[11px] font-semibold text-slate-900">0</span>
        </div>
      </article>

      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">Delete Batch?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Are you sure you want to delete <span className="font-semibold text-slate-900">BATCH-{batch.batchId}</span>? This action cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                disabled={isDeleting}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function BatchHistoryPage() {
  const today = useMemo(() => formatToday(), []);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [batches, setBatches] = useState([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(6);

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text("Eggcubator Batch History", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

    const tableData = historyBatches.map((b) => [
      b.batchId || "-",
      b.eggType || "-",
      b.totalEggs || 0,
      b.hatchedEggs || 0,
      `${Math.round((Number(b.hatchedEggs || 0) / Number(b.totalEggs || 1)) * 100)}%`,
      b._startDate ? formatShortDate(b._startDate) : "-",
      b._derived?.hatchingDate ? formatShortDate(b._derived.hatchingDate) : "-",
    ]);

    autoTable(doc, {
      startY: 30,
      head: [["Batch ID", "Type", "Total Eggs", "Hatched", "Hatch Rate", "Start Date", "Hatch Date"]],
      body: tableData,
    });

    doc.save(`Batch_History_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportToExcel = () => {
    const data = historyBatches.map((b) => ({
      "Batch ID": b.batchId || "-",
      "Egg Type": b.eggType || "-",
      "Total Eggs": b.totalEggs || 0,
      "Hatched Eggs": b.hatchedEggs || 0,
      "Hatch Rate": `${Math.round((Number(b.hatchedEggs || 0) / Number(b.totalEggs || 1)) * 100)}%`,
      "Start Date": b._startDate ? formatShortDate(b._startDate) : "-",
      "Hatching Date": b._derived?.hatchingDate ? formatShortDate(b._derived.hatchingDate) : "-",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Batch History");
    XLSX.writeFile(wb, `Batch_History_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  useEffect(() => {
    setLoadError("");
    setIsLoadingBatches(true);

    const q = query(collection(firestore, "egg_batches"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setBatches(next);
        setIsLoadingBatches(false);
      },
      (error) => {
        const message = error?.message || "Failed to load batch history.";
        const code = error?.code ? ` (${error.code})` : "";
        setLoadError(`${message}${code}`);
        setIsLoadingBatches(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const decorateBatch = (batch) => {
    const start = batch?.startDate?.toDate ? batch.startDate.toDate() : null;
    const derived = computeDerived({
      startDate: start,
      eggType: batch?.eggType,
    });

    return {
      ...batch,
      _startDate: start,
      _derived: derived,
    };
  };

  const decoratedBatches = batches.map(decorateBatch);

  const historyBatches = useMemo(() => {
    return decoratedBatches.filter((batch) => {
      const daysLeft = batch?._derived?.daysLeft;
      return typeof daysLeft === "number" ? daysLeft <= 0 : false;
    });
  }, [decoratedBatches]);

  const summary = useMemo(() => {
    const totalBatches = historyBatches.length;

    const totalEggs = historyBatches.reduce((acc, b) => {
      const n = Number(b?.totalEggs);
      return Number.isFinite(n) ? acc + n : acc;
    }, 0);

    const totalChicks = historyBatches.reduce((acc, b) => {
      const candidates = [b?.hatchedEggs, b?.chicks, b?.totalChicks, b?.successfulHatches];
      const first = candidates.find((v) => Number.isFinite(Number(v)));
      const n = Number(first ?? 0);
      return Number.isFinite(n) ? acc + n : acc;
    }, 0);

    const avgHatchRate = totalEggs > 0 ? (totalChicks / totalEggs) * 100 : 0;

    return {
      totalBatches,
      totalEggs,
      totalChicks,
      avgHatchRate,
    };
  }, [historyBatches]);

  const filteredBatches = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return historyBatches;

    return historyBatches.filter((batch) => {
      const id = String(batch?.batchId || "").toLowerCase();
      const type = String(batch?.eggType || "").toLowerCase();
      const start = batch?._startDate ? formatShortDate(batch._startDate).toLowerCase() : "";
      const hatch = batch?._derived?.hatchingDate
        ? formatShortDate(batch._derived.hatchingDate).toLowerCase()
        : "";
      const status = String(batch?.status || "").toLowerCase();

      return id.includes(q) || type.includes(q) || start.includes(q) || hatch.includes(q) || status.includes(q);
    });
  }, [historyBatches, search]);

  useEffect(() => {
    setPage(1);
  }, [search, perPage]);

  const totalPages = Math.max(1, Math.ceil(filteredBatches.length / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedBatches = useMemo(() => {
    const startIndex = (safePage - 1) * perPage;
    return filteredBatches.slice(startIndex, startIndex + perPage);
  }, [filteredBatches, perPage, safePage]);

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-4">
            <TopBar
              title="Batch History"
              notificationCount={3}
              onOpenSidebar={() => setIsSidebarOpen(true)}
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-slate-400">{today}</p>
              <div className="flex gap-2">
                <button
                  onClick={exportToPDF}
                  disabled={historyBatches.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
                >
                  <FileDown className="h-4 w-4" />
                  PDF
                </button>
                <button
                  onClick={exportToExcel}
                  disabled={historyBatches.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel
                </button>
              </div>
            </div>
          </div>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Batches</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{summary.totalBatches}</p>
              <p className="mt-1 text-xs text-slate-500">All-time records</p>
            </article>

            <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Avg Hatch Rate</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-600">
                {`${Math.round(summary.avgHatchRate)}%`}
              </p>
              <p className="mt-1 text-xs text-slate-500">System Efficiency</p>
            </article>

            <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Chicks</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-indigo-600">{summary.totalChicks}</p>
              <p className="mt-1 text-xs text-slate-500">Successful hatches</p>
            </article>
          </section>

          <section className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-tight text-slate-900">Completed Batches</p>
                <p className="mt-1 text-[11px] text-slate-500">Search and review previously finished batches.</p>
              </div>

              <div className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by batch number, date, egg type..."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-10 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/10"
                />
              </div>
            </div>

            {isLoadingBatches ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <p className="text-xs font-medium text-slate-500">Loading history...</p>
              </div>
            ) : loadError ? (
              <div className="mt-5 rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
                {loadError}
              </div>
            ) : batches.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <p className="text-xs font-medium text-slate-500">No batches yet.</p>
              </div>
            ) : historyBatches.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <p className="text-xs font-medium text-slate-500">No finished batches yet.</p>
                <p className="mt-1 text-[11px] text-slate-400">Finished batches will show here once days left reaches 0.</p>
              </div>
            ) : filteredBatches.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <p className="text-xs font-medium text-slate-500">No matching results.</p>
                <p className="mt-1 text-[11px] text-slate-400">Try a different search term.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {pagedBatches.map((batch) => (
                    <BatchCard key={batch.id} batch={batch} formatShortDate={formatShortDate} />
                  ))}
                </div>

                <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 rounded-2xl bg-white/70 p-1 ring-1 ring-slate-200/70">
                      <button
                        type="button"
                        onClick={() => setPage(1)}
                        disabled={safePage <= 1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                        aria-label="First page"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <div className="px-2 text-xs font-semibold text-slate-600">
                        {safePage} / {totalPages}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                        aria-label="Next page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage(totalPages)}
                        disabled={safePage >= totalPages}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                        aria-label="Last page"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-[11px] font-medium text-slate-400">{filteredBatches.length} total</div>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Per page</label>
                    <select
                      value={perPage}
                      onChange={(e) => setPerPage(Number(e.target.value))}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/10"
                    >
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

          <section className="rounded-3xl bg-sky-50/70 px-6 py-5 shadow-sm ring-1 ring-sky-100/70">
            <div className="flex items-start gap-4">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 ring-1 ring-sky-200">
                <Info className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-slate-900">Tip</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  If you still see a batch in active list, double-check its Start Date. The system computes completion from that date.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
