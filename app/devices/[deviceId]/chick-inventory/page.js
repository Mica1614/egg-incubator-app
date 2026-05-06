// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc, getDoc, collection, onSnapshot, query, where,
  updateDoc, serverTimestamp, addDoc,
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
  ChevronLeft, Package, AlertTriangle, Loader2, Search, Egg,
  ShoppingCart, X, FileDown, FileSpreadsheet, DollarSign,
  TrendingUp, CalendarDays, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";

const fmt = (date) => {
  try { return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return "—"; }
};
const toDate = (v) => v?.toDate ? v.toDate() : v ? new Date(v) : null;

export default function DeviceChickInventoryPage() {
  const { deviceId } = useParams();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(null);
  const [nickname, setNickname] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("inventory"); // "inventory" | "sales"
  const [inventory, setInventory] = useState([]);
  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");

  // Revenue date filter
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Sell modal
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantitySold, setQuantitySold] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [pricePerChick, setPricePerChick] = useState("");
  const [isSelling, setIsSelling] = useState(false);
  const [sellError, setSellError] = useState("");

  // Pagination
  const INV_PER_PAGE = 10;
  const SALES_PER_PAGE = 10;
  const [invPage, setInvPage] = useState(1);
  const [salesPage, setSalesPage] = useState(1);

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
    const q = query(collection(firestore, "chick_inventory"), where("deviceId", "==", deviceId));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0));
      setInventory(items);
      setIsLoading(false);
    }, (err) => { setLoadError(err.message); setIsLoading(false); });
    return () => unsub();
  }, [authorized, deviceId]);

  // Load sales for this device
  useEffect(() => {
    if (!authorized) return;
    const q = query(collection(firestore, "chick_sales"), where("deviceId", "==", deviceId));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => {
        const ta = toDate(a.sale_date)?.getTime() ?? toDate(a.saleDate)?.getTime() ?? toDate(a.createdAt)?.getTime() ?? 0;
        const tb = toDate(b.sale_date)?.getTime() ?? toDate(b.saleDate)?.getTime() ?? toDate(b.createdAt)?.getTime() ?? 0;
        return tb - ta;
      });
      setSales(items);
    });
    return () => unsub();
  }, [authorized, deviceId]);

  const handleSell = async () => {
    if (!selectedItem) return;
    setSellError("");
    const qty = Number(quantitySold);
    if (!qty || qty <= 0 || qty > selectedItem.available_chicks) {
      setSellError(`Quantity must be between 1 and ${selectedItem.available_chicks}.`);
      return;
    }
    const price = Number(pricePerChick);
    if (!pricePerChick || !Number.isFinite(price) || price <= 0) {
      setSellError("Price per chick is required and must be greater than 0.");
      return;
    }
    setIsSelling(true);
    try {
      await updateDoc(doc(firestore, "chick_inventory", selectedItem.id), {
        available_chicks: selectedItem.available_chicks - qty,
        sold_chicks: (selectedItem.sold_chicks || 0) + qty,
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(firestore, "chick_sales"), {
        batch_id: selectedItem.batch_id || "",
        inventoryId: selectedItem.id,
        deviceId: deviceId,
        deviceName: nickname || deviceId,
        egg_type: selectedItem.egg_type || "",
        quantity_sold: qty,
        price_per_chick: price,
        total_amount: qty * price,
        buyer_name: buyerName.trim() || null,
        sale_date: new Date(),
        createdAt: serverTimestamp(),
      });
      setIsSellModalOpen(false);
      setSelectedItem(null);
      setQuantitySold("");
      setBuyerName("");
      setPricePerChick("");
    } catch (e) {
      setSellError(e?.message || "Failed to record sale.");
    } finally {
      setIsSelling(false);
    }
  };

  // Computed
  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory.filter((i) =>
      !q ||
      String(i.batch_id || "").toLowerCase().includes(q) ||
      String(i.egg_type || "").toLowerCase().includes(q)
    );
  }, [inventory, search]);

  const availableItems = filteredInventory.filter((i) => (i.available_chicks || 0) > 0);
  const soldOutItems = filteredInventory.filter((i) => (i.available_chicks || 0) <= 0);

  // Inventory pagination
  const invTotalPages = Math.max(1, Math.ceil(filteredInventory.length / INV_PER_PAGE));
  const safeInvPage = Math.min(invPage, invTotalPages);
  const pagedInventory = filteredInventory.slice((safeInvPage - 1) * INV_PER_PAGE, safeInvPage * INV_PER_PAGE);
  const pagedAvailableItems = pagedInventory.filter((i) => (i.available_chicks || 0) > 0);
  const pagedSoldOutItems = pagedInventory.filter((i) => (i.available_chicks || 0) <= 0);

  // Sales pagination
  const salesTotalPages = Math.max(1, Math.ceil(filteredSales.length / SALES_PER_PAGE));
  const safeSalesPage = Math.min(salesPage, salesTotalPages);
  const pagedSales = filteredSales.slice((safeSalesPage - 1) * SALES_PER_PAGE, safeSalesPage * SALES_PER_PAGE);

  // Reset pages on filter change
  useEffect(() => { setInvPage(1); }, [filteredInventory]);
  useEffect(() => { setSalesPage(1); }, [filteredSales]);

  const filteredSales = useMemo(() => {
    let s = [...sales];
    if (dateFrom) s = s.filter((x) => {
      const d = toDate(x.sale_date) ?? toDate(x.saleDate) ?? toDate(x.createdAt);
      return d && d >= new Date(dateFrom);
    });
    if (dateTo) s = s.filter((x) => {
      const d = toDate(x.sale_date) ?? toDate(x.saleDate) ?? toDate(x.createdAt);
      return d && d <= new Date(dateTo + "T23:59:59");
    });
    return s;
  }, [sales, dateFrom, dateTo]);

  const totalRevenue = useMemo(
    () => filteredSales.reduce((s, x) => s + (x.total_amount || 0), 0),
    [filteredSales]
  );
  const totalSold = useMemo(
    () => filteredSales.reduce((s, x) => s + (x.quantity_sold || 0), 0),
    [filteredSales]
  );

  // Summary totals
  const sumTotal = inventory.reduce((s, i) => s + (i.total_chicks || 0), 0);
  const sumAvail = inventory.reduce((s, i) => s + (i.available_chicks || 0), 0);
  const sumSold = inventory.reduce((s, i) => s + (i.sold_chicks || 0), 0);

  // Export helpers
  const exportInventoryPDF = () => {
    const d = new jsPDF();
    d.text(`Chick Inventory — ${nickname || deviceId}`, 14, 15);
    d.setFontSize(9);
    d.text(`Exported: ${new Date().toLocaleString()}`, 14, 22);
    autoTable(d, {
      startY: 28,
      head: [["Batch ID", "Egg Type", "Total", "Available", "Sold", "Hatch Date"]],
      body: filteredInventory.map((i) => [
        i.batch_id || "—", i.egg_type || "—",
        i.total_chicks || 0, i.available_chicks || 0, i.sold_chicks || 0,
        fmt(toDate(i.hatch_date)),
      ]),
    });
    d.save(`ChickInventory_${deviceId}_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportInventoryExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredInventory.map((i) => ({
      "Batch ID": i.batch_id || "—", "Egg Type": i.egg_type || "—",
      "Total Chicks": i.total_chicks || 0, "Available": i.available_chicks || 0,
      "Sold": i.sold_chicks || 0, "Hatch Date": fmt(toDate(i.hatch_date)),
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, `ChickInventory_${deviceId}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const exportSalesPDF = () => {
    const d = new jsPDF();
    d.text(`Sales Record — ${nickname || deviceId}`, 14, 15);
    d.setFontSize(9);
    d.text(`Exported: ${new Date().toLocaleString()}  |  Total Revenue: ₱${totalRevenue.toFixed(2)}`, 14, 22);
    autoTable(d, {
      startY: 28,
      head: [["Date", "Batch ID", "Egg Type", "Qty Sold", "Price/Chick", "Total", "Buyer"]],
      body: filteredSales.map((x) => {
        const d2 = toDate(x.sale_date) ?? toDate(x.saleDate) ?? toDate(x.createdAt);
        return [
          d2 ? fmt(d2) : "—", x.batch_id || "—", x.egg_type || "—",
          x.quantity_sold || 0,
          x.price_per_chick != null ? `₱${Number(x.price_per_chick).toFixed(2)}` : "—",
          x.total_amount != null ? `₱${Number(x.total_amount).toFixed(2)}` : "—",
          x.buyer_name || "—",
        ];
      }),
    });
    d.save(`SalesRecord_${deviceId}_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportSalesExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredSales.map((x) => {
      const d2 = toDate(x.sale_date) ?? toDate(x.saleDate) ?? toDate(x.createdAt);
      return {
        "Date": d2 ? fmt(d2) : "—", "Batch ID": x.batch_id || "—",
        "Egg Type": x.egg_type || "—", "Qty Sold": x.quantity_sold || 0,
        "Price/Chick": x.price_per_chick != null ? Number(x.price_per_chick) : "",
        "Total Amount": x.total_amount != null ? Number(x.total_amount) : "",
        "Buyer": x.buyer_name || "—",
      };
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
    XLSX.writeFile(wb, `SalesRecord_${deviceId}_${new Date().toISOString().split("T")[0]}.xlsx`);
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

  const TABS = [
    { id: "inventory", label: "Inventory" },
    { id: "sales", label: "Sales Records" },
  ];

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />
        <main className="flex flex-1 flex-col gap-6 min-w-0">
          <TopBar title="Chick Inventory" onOpenSidebar={() => setIsSidebarOpen(true)} />

          <BreadcrumbNav deviceId={deviceId} deviceName={nickname} currentPage="Chick Inventory" />

          {/* Header */}
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-tight text-slate-900">Chick Inventory</h1>
                  <p className="text-[11px] text-slate-400">{nickname} · {inventory.length} record{inventory.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{sumTotal}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 shadow-sm ring-1 ring-emerald-100 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Available</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{sumAvail}</p>
            </div>
            <div className="rounded-2xl bg-sky-50 px-4 py-3 shadow-sm ring-1 ring-sky-100 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-500">Sold</p>
              <p className="mt-1 text-2xl font-bold text-sky-700">{sumSold}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-xl bg-white/60 p-1 ring-1 ring-slate-200/70 shadow-sm">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${activeTab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {t.id === "inventory" ? <Package className="h-3.5 w-3.5" /> : <DollarSign className="h-3.5 w-3.5" />}
                {t.label}
              </button>
            ))}
          </div>

          {/* ── INVENTORY TAB ────────────────────────────────────── */}
          {activeTab === "inventory" && (
            <section className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
                <div className="relative flex-1 min-w-48">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search batch or egg type…"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10" />
                </div>
                <div className="flex gap-2">
                  <button onClick={exportInventoryPDF} disabled={filteredInventory.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-rose-700 transition">
                    <FileDown className="h-3.5 w-3.5" />PDF
                  </button>
                  <button onClick={exportInventoryExcel} disabled={filteredInventory.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-emerald-700 transition">
                    <FileSpreadsheet className="h-3.5 w-3.5" />Excel
                  </button>
                </div>
              </div>

              {isLoading ? (
                <div className="px-5 pb-5"><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /></div>
              ) : loadError ? (
                <div className="px-5 pb-5 text-xs text-rose-700">{loadError}</div>
              ) : filteredInventory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                  <Package className="mb-4 h-12 w-12 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">{search ? "No matching records" : "No chick inventory yet"}</p>
                  <p className="mt-1 text-xs text-slate-400">Chick records appear after batches are completed.</p>
                </div>
              ) : (
                <>
                  {/* Available group */}
                  {pagedAvailableItems.length > 0 && (
                    <>
                      <div className="px-5 py-2 bg-emerald-50/60 border-b border-emerald-100">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                          Available ({availableItems.length})
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-[600px] w-full text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/70">
                              <th className="py-2.5 pl-5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Batch ID</th>
                              <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Egg Type</th>
                              <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</th>
                              <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Available</th>
                              <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Sold</th>
                              <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Hatch Date</th>
                              <th className="py-2.5 pr-5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedAvailableItems.map((item) => (
                              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition">
                                <td className="py-3 pl-5 pr-4 font-semibold text-slate-900">{item.batch_id || "—"}</td>
                                <td className="py-3 pr-4 capitalize text-slate-600">{item.egg_type || "—"}</td>
                                <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{item.total_chicks || 0}</td>
                                <td className="py-3 pr-4 text-right tabular-nums font-semibold text-emerald-600">{item.available_chicks || 0}</td>
                                <td className="py-3 pr-4 text-right tabular-nums text-sky-600">{item.sold_chicks || 0}</td>
                                <td className="py-3 pr-4 text-slate-500 whitespace-nowrap">{fmt(toDate(item.hatch_date))}</td>
                                <td className="py-3 pr-5 text-right">
                                  <button onClick={() => { setSelectedItem(item); setSellError(""); setIsSellModalOpen(true); }}
                                    className="inline-flex items-center gap-1 rounded-lg bg-[#004a87] px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-[#003d72] transition">
                                    <ShoppingCart className="h-3 w-3" />Sell
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {/* Sold out group */}
                  {pagedSoldOutItems.length > 0 && (
                    <>
                      <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 border-t border-t-slate-100">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Sold Out ({soldOutItems.length})
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-[600px] w-full text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/70">
                              <th className="py-2.5 pl-5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Batch ID</th>
                              <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Egg Type</th>
                              <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</th>
                              <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Available</th>
                              <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Sold</th>
                              <th className="py-2.5 pr-5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Hatch Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedSoldOutItems.map((item) => (
                              <tr key={item.id} className="border-b border-slate-100 opacity-60">
                                <td className="py-3 pl-5 pr-4 font-semibold text-slate-700">{item.batch_id || "—"}</td>
                                <td className="py-3 pr-4 capitalize text-slate-500">{item.egg_type || "—"}</td>
                                <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{item.total_chicks || 0}</td>
                                <td className="py-3 pr-4 text-right tabular-nums text-slate-400">0</td>
                                <td className="py-3 pr-4 text-right tabular-nums text-sky-600">{item.sold_chicks || 0}</td>
                                <td className="py-3 pr-5 text-slate-400 whitespace-nowrap">{fmt(toDate(item.hatch_date))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {/* Inventory Pagination */}
                  {invTotalPages > 1 && (
                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
                      <p className="text-[11px] text-slate-400">
                        Page {safeInvPage} of {invTotalPages} &middot; {filteredInventory.length} items
                      </p>
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => setInvPage(1)} disabled={safeInvPage <= 1} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition">
                          <ChevronsLeft className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setInvPage((p) => Math.max(1, p - 1))} disabled={safeInvPage <= 1} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition">
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="px-2 text-[11px] font-semibold text-slate-700">{safeInvPage}</span>
                        <button onClick={() => setInvPage((p) => Math.min(invTotalPages, p + 1))} disabled={safeInvPage >= invTotalPages} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setInvPage(invTotalPages)} disabled={safeInvPage >= invTotalPages} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition">
                          <ChevronsRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* ── SALES TAB ────────────────────────────────────────── */}
          {activeTab === "sales" && (
            <section className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
              {/* Revenue summary */}
              <div className="grid grid-cols-2 gap-3 px-5 pt-5 sm:grid-cols-3">
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Total Revenue</p>
                  <p className="mt-1 text-xl font-bold text-emerald-700">₱{totalRevenue.toFixed(2)}</p>
                  {(dateFrom || dateTo) && <p className="text-[10px] text-emerald-500 mt-0.5">Filtered period</p>}
                </div>
                <div className="rounded-2xl bg-sky-50 px-4 py-3 ring-1 ring-sky-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-sky-500">Chicks Sold</p>
                  <p className="mt-1 text-xl font-bold text-sky-700">{totalSold}</p>
                </div>
                <div className="rounded-2xl bg-indigo-50 px-4 py-3 ring-1 ring-indigo-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Avg Price</p>
                  <p className="mt-1 text-xl font-bold text-indigo-700">
                    {totalSold > 0 ? `₱${(totalRevenue / totalSold).toFixed(2)}` : "—"}
                  </p>
                </div>
              </div>

              {/* Date filter + export */}
              <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-100">
                <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-sky-300" />
                <span className="text-xs text-slate-400">to</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-sky-300" />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="text-[11px] text-slate-400 hover:text-rose-500 transition">Clear</button>
                )}
                <div className="ml-auto flex gap-2">
                  <button onClick={exportSalesPDF} disabled={filteredSales.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-rose-700 transition">
                    <FileDown className="h-3.5 w-3.5" />PDF
                  </button>
                  <button onClick={exportSalesExcel} disabled={filteredSales.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-emerald-700 transition">
                    <FileSpreadsheet className="h-3.5 w-3.5" />Excel
                  </button>
                </div>
              </div>

              {filteredSales.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                  <TrendingUp className="mb-4 h-12 w-12 text-slate-200" />
                  <p className="text-sm font-semibold text-slate-600">No sales records yet</p>
                  <p className="mt-1 text-xs text-slate-400">Sales will appear here after you sell chicks from this device.</p>
                </div>
              ) : (
                <>
                <div className="overflow-x-auto">
                  <table className="min-w-[650px] w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="py-2.5 pl-5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Date</th>
                        <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Batch ID</th>
                        <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Egg Type</th>
                        <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Qty</th>
                        <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Price/Chick</th>
                        <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</th>
                        <th className="py-2.5 pr-5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Buyer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedSales.map((x) => {
                        const saleD = toDate(x.sale_date) ?? toDate(x.saleDate) ?? toDate(x.createdAt);
                        return (
                          <tr key={x.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition">
                            <td className="py-3 pl-5 pr-4 text-slate-500 whitespace-nowrap">{saleD ? fmt(saleD) : "—"}</td>
                            <td className="py-3 pr-4 font-semibold text-slate-900">{x.batch_id || "—"}</td>
                            <td className="py-3 pr-4 capitalize text-slate-600">{x.egg_type || "—"}</td>
                            <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{x.quantity_sold || 0}</td>
                            <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                              {x.price_per_chick != null ? `₱${Number(x.price_per_chick).toFixed(2)}` : "—"}
                            </td>
                            <td className="py-3 pr-4 text-right tabular-nums font-semibold text-emerald-600">
                              {x.total_amount != null ? `₱${Number(x.total_amount).toFixed(2)}` : "—"}
                            </td>
                            <td className="py-3 pr-5 text-slate-500">{x.buyer_name || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td colSpan={3} className="py-3 pl-5 pr-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Totals</td>
                        <td className="py-3 pr-4 text-right tabular-nums font-bold text-slate-700">{totalSold}</td>
                        <td className="py-3 pr-4" />
                        <td className="py-3 pr-4 text-right tabular-nums font-bold text-emerald-600">₱{totalRevenue.toFixed(2)}</td>
                        <td className="py-3 pr-5" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {/* Sales Pagination */}
                {salesTotalPages > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
                    <p className="text-[11px] text-slate-400">
                      Page {safeSalesPage} of {salesTotalPages} &middot; {filteredSales.length} records
                    </p>
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => setSalesPage(1)} disabled={safeSalesPage <= 1} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition">
                        <ChevronsLeft className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setSalesPage((p) => Math.max(1, p - 1))} disabled={safeSalesPage <= 1} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition">
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="px-2 text-[11px] font-semibold text-slate-700">{safeSalesPage}</span>
                      <button onClick={() => setSalesPage((p) => Math.min(salesTotalPages, p + 1))} disabled={safeSalesPage >= salesTotalPages} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setSalesPage(salesTotalPages)} disabled={safeSalesPage >= salesTotalPages} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition">
                        <ChevronsRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                </>
              )}
            </section>
          )}
        </main>
      </div>

      {/* Sell Modal */}
      {isSellModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsSellModalOpen(false); }}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Sell Chicks</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Batch {selectedItem.batch_id} · {selectedItem.available_chicks} available</p>
              </div>
              <button onClick={() => setIsSellModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quantity</label>
                <input type="number" min="1" max={selectedItem.available_chicks} value={quantitySold} onChange={(e) => setQuantitySold(e.target.value)}
                  placeholder="Enter quantity"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Buyer Name <span className="font-normal normal-case text-slate-400">(optional)</span></label>
                <input type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Price per Chick <span className="font-normal normal-case text-rose-500">*</span></label>
                <input type="number" min="0" step="0.01" value={pricePerChick} onChange={(e) => setPricePerChick(e.target.value)}
                  placeholder="e.g. 5.00"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10" />
              </div>
              {sellError && <p className="text-xs text-rose-600">{sellError}</p>}
            </div>

            <div className="mt-4 flex gap-3">
              <button onClick={() => setIsSellModalOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={handleSell} disabled={isSelling} className="flex-1 rounded-xl bg-[#004a87] py-2.5 text-xs font-semibold text-white hover:bg-[#003d72] transition disabled:opacity-50">
                {isSelling ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Confirm Sale"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
