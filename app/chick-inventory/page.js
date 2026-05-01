// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import {
  Info,
  Search,
  Egg,
  DollarSign,
  Package,
  TrendingUp,
  Plus,
  X,
  Loader2,
  AlertTriangle,
  ClipboardList,
  ShoppingCart,
  Users,
  Bell,
  Calendar,
  Activity,
  CheckCircle,
  AlertCircle,
  Edit,
  Trash2,
  FileText,
  BarChart3,
  Heart,
  Skull,
  Truck,
  ArrowRightLeft,
  Download,
} from "lucide-react";
import { firestore } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
  increment,
  getDoc,
  addDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";

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

export default function ChickInventoryPage() {
  const today = useMemo(() => formatToday(), []);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Data states
  const [chickInventories, setChickInventories] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [eggBatches, setEggBatches] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [adjustmentRecords, setAdjustmentRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Active tab/state for navigation
  const [activeTab, setActiveTab] = useState("inventory"); // inventory, batches, suppliers, reports, adjustments

  // Modal states - Sell
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState(null);
  const [quantitySold, setQuantitySold] = useState(0);
  const [buyerName, setBuyerName] = useState("");
  const [pricePerChick, setPricePerChick] = useState(0);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);
  const [isSelling, setIsSelling] = useState(false);
  const [sellError, setSellError] = useState("");

  // Modal states - Add Batch from Egg
  const [isAddBatchModalOpen, setIsAddBatchModalOpen] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [eggType, setEggType] = useState("");
  const [totalEggs, setTotalEggs] = useState(0);
  const [hatchedEggs, setHatchedEggs] = useState(0);
  const [failedEggs, setFailedEggs] = useState(0);
  const [healthyChicks, setHealthyChicks] = useState(0);
  const [weakChicks, setWeakChicks] = useState(0);
  const [deadChicks, setDeadChicks] = useState(0);
  const [hatchDate, setHatchDate] = useState(new Date().toISOString().split("T")[0]);
  const [incubatorNumber, setIncubatorNumber] = useState("");
  const [isAddingBatch, setIsAddingBatch] = useState(false);
  const [addBatchError, setAddBatchError] = useState("");

  // Modal states - Supplier Management
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [supplierType, setSupplierType] = useState("breeder"); // breeder or supplier
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState("");

  // Modal states - Egg Supply Record
  const [isEggSupplyModalOpen, setIsEggSupplyModalOpen] = useState(false);
  const [selectedSupplierForEggs, setSelectedSupplierForEggs] = useState(null);
  const [supplyDate, setSupplyDate] = useState(new Date().toISOString().split("T")[0]);
  const [supplyEggType, setSupplyEggType] = useState("");
  const [supplyQuantity, setSupplyQuantity] = useState(0);
  const [unitPrice, setUnitPrice] = useState(0);
  const [isRecordingSupply, setIsRecordingSupply] = useState(false);
  const [supplyError, setSupplyError] = useState("");

  // Modal states - Adjustment Record
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [selectedInventoryForAdjustment, setSelectedInventoryForAdjustment] = useState(null);
  const [adjustmentType, setAdjustmentType] = useState("broken_eggs"); // broken_eggs, dead_chicks, count_correction
  const [adjustmentQuantity, setAdjustmentQuantity] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().split("T")[0]);
  const [isMakingAdjustment, setIsMakingAdjustment] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState("");

  // Low stock alert threshold
  const [lowStockThreshold, setLowStockThreshold] = useState(10);

  // Transfer/Move to Brooder modal
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedInventoryForTransfer, setSelectedInventoryForTransfer] = useState(null);
  const [transferQuantity, setTransferQuantity] = useState(0);
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [brooderLocation, setBrooderLocation] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");

  // Load chick inventories and sales history
  useEffect(() => {
    setIsLoading(true);
    setLoadError("");

    // Listen to chick inventory
    const inventoryQuery = query(
      collection(firestore, "chick_inventory"),
      orderBy("hatch_date", "desc")
    );

    const unsubscribeInventory = onSnapshot(
      inventoryQuery,
      (snapshot) => {
        const inventories = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setChickInventories(inventories);
        setIsLoading(false);
      },
      (error) => {
        const message = error?.message || "Failed to load chick inventory.";
        const code = error?.code ? ` (${error.code})` : "";
        setLoadError(`${message}${code}`);
        setIsLoading(false);
      }
    );

    // Listen to sales history
    const salesQuery = query(
      collection(firestore, "chick_sales"),
      orderBy("sale_date", "desc")
    );

    const unsubscribeSales = onSnapshot(
      salesQuery,
      (snapshot) => {
        const sales = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setSalesHistory(sales);
      },
      (error) => {
        console.error("Failed to load sales history:", error);
      }
    );

    return () => {
      unsubscribeInventory();
      unsubscribeSales();
    };
  }, []);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const totalHatched = chickInventories.reduce((acc, inv) => {
      const n = Number(inv?.total_chicks || 0);
      return Number.isFinite(n) ? acc + n : acc;
    }, 0);

    const totalAvailable = chickInventories.reduce((acc, inv) => {
      const n = Number(inv?.available_chicks || 0);
      return Number.isFinite(n) ? acc + n : acc;
    }, 0);

    const totalSold = salesHistory.reduce((acc, sale) => {
      const n = Number(sale?.quantity_sold || 0);
      return Number.isFinite(n) ? acc + n : acc;
    }, 0);

    const totalRevenue = salesHistory.reduce((acc, sale) => {
      const qty = Number(sale?.quantity_sold || 0);
      const price = Number(sale?.price_per_chick || 0);
      return Number.isFinite(qty) && Number.isFinite(price) ? acc + (qty * price) : acc;
    }, 0);

    const totalBatches = chickInventories.length;

    // Calculate overall hatch rate
    const totalEggsSet = chickInventories.reduce((acc, inv) => {
      const n = Number(inv?.total_eggs_set || 0);
      return Number.isFinite(n) ? acc + n : acc;
    }, 0);

    const hatchRate = totalEggsSet > 0 ? ((totalHatched / totalEggsSet) * 100).toFixed(1) : 0;

    // Low stock count
    const lowStockCount = chickInventories.filter(inv => {
      const available = Number(inv?.available_chicks || 0);
      return available <= lowStockThreshold && available > 0;
    }).length;

    return {
      totalHatched,
      totalAvailable,
      totalSold,
      totalRevenue,
      totalBatches,
      totalEggsSet,
      hatchRate,
      lowStockCount,
    };
  }, [chickInventories, salesHistory, lowStockThreshold]);

  // Filter available inventories (those with chicks remaining)
  const availableInventories = useMemo(() => {
    return chickInventories.filter((inv) => {
      const available = Number(inv?.available_chicks || 0);
      return available > 0;
    });
  }, [chickInventories]);

  const openSellModal = (inventory) => {
    setSelectedInventory(inventory);
    setQuantitySold(0);
    setBuyerName("");
    setPricePerChick(0);
    setSaleDate(new Date().toISOString().split("T")[0]);
    setSellError("");
    setIsSellModalOpen(true);
  };

  const closeSellModal = () => {
    if (isSelling) return;
    setIsSellModalOpen(false);
    setSelectedInventory(null);
    setSellError("");
  };

  const handleSellChicks = async () => {
    if (!selectedInventory) return;
    setSellError("");

    const qty = Number(quantitySold);
    if (!Number.isFinite(qty) || qty <= 0) {
      setSellError("Please enter a valid quantity.");
      return;
    }

    const availableChicks = Number(selectedInventory.available_chicks || 0);
    if (qty > availableChicks) {
      setSellError(`Cannot sell more than ${availableChicks} available chicks.`);
      return;
    }

    const price = Number(pricePerChick);
    if (!Number.isFinite(price) || price < 0) {
      setSellError("Please enter a valid price per chick.");
      return;
    }

    setIsSelling(true);
    try {
      // Create sales record with price
      const saleData = {
        batch_id: selectedInventory.batch_id,
        quantity_sold: qty,
        buyer_name: buyerName.trim() || "N/A",
        price_per_chick: price,
        total_amount: qty * price,
        sale_date: new Date(saleDate),
        createdAt: serverTimestamp(),
      };

      await addDoc(doc(collection(firestore, "chick_sales")), saleData);

      // Update inventory
      await updateDoc(doc(firestore, "chick_inventory", selectedInventory.id), {
        available_chicks: increment(-qty),
        sold_chicks: increment(qty),
        updatedAt: serverTimestamp(),
      });

      closeSellModal();
    } catch (e) {
      const message = e?.message || "Failed to process sale.";
      const code = e?.code ? ` (${e.code})` : "";
      setSellError(`${message}${code}`);
    } finally {
      setIsSelling(false);
    }
  };

  // Add Batch Handler
  const openAddBatchModal = () => {
    setBatchId("");
    setEggType("");
    setTotalEggs(0);
    setHatchedEggs(0);
    setFailedEggs(0);
    setHatchDate(new Date().toISOString().split("T")[0]);
    setAddBatchError("");
    setIsAddBatchModalOpen(true);
  };

  const closeAddBatchModal = () => {
    if (isAddingBatch) return;
    setIsAddBatchModalOpen(false);
    setAddBatchError("");
  };

  const handleAddBatch = async () => {
    setAddBatchError("");

    const batchIdStr = String(batchId || "").trim();
    if (!batchIdStr) {
      setAddBatchError("Batch ID is required.");
      return;
    }

    const eggs = Number(totalEggs);
    if (!Number.isFinite(eggs) || eggs <= 0) {
      setAddBatchError("Please enter valid number of eggs.");
      return;
    }

    const hatched = Number(hatchedEggs);
    const failed = Number(failedEggs);
    
    if (hatched + failed > eggs) {
      setAddBatchError("Hatched + Failed eggs cannot exceed total eggs.");
      return;
    }

    const hatchRateVal = eggs > 0 ? ((hatched / eggs) * 100).toFixed(1) : 0;

    setIsAddingBatch(true);
    try {
      // Create chick inventory record
      const inventoryData = {
        batch_id: batchIdStr,
        egg_type: String(eggType || "").trim() || "Chicken",
        total_eggs_set: eggs,
        total_chicks: hatched,
        failed_to_hatch: failed,
        available_chicks: hatched,
        sold_chicks: 0,
        hatch_rate: parseFloat(hatchRateVal),
        hatch_date: new Date(hatchDate),
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(firestore, "chick_inventory", `batch_${batchIdStr}_${Date.now()}`), inventoryData);

      closeAddBatchModal();
    } catch (e) {
      const message = e?.message || "Failed to add batch.";
      const code = e?.code ? ` (${e.code})` : "";
      setAddBatchError(`${message}${code}`);
    } finally {
      setIsAddingBatch(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-4">
            <TopBar
              title="Chick Inventory"
              notificationCount={3}
              onOpenSidebar={() => setIsSidebarOpen(true)}
            />
            <p className="text-[11px] font-medium text-slate-400">{today}</p>
          </div>

          {/* Summary Cards */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Total Hatched
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                    {summary.totalHatched}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">From {summary.totalEggsSet} eggs set</p>
                </div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                  <Egg className="h-6 w-6" />
                </div>
              </div>
            </article>

            <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Available
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-sky-600">
                    {summary.totalAvailable}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Ready for sale</p>
                </div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                  <Package className="h-6 w-6" />
                </div>
              </div>
            </article>

            <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Total Sold
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-indigo-600">
                    {summary.totalSold}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">${summary.totalRevenue.toFixed(2)} revenue</p>
                </div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                  <DollarSign className="h-6 w-6" />
                </div>
              </div>
            </article>

            <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Hatch Rate
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-600">
                    {summary.hatchRate}%
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Success rate</p>
                </div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                  <TrendingUp className="h-6 w-6" />
                </div>
              </div>
            </article>
          </section>

          {/* Low Stock Alert */}
          {summary.lowStockCount > 0 && (
            <section className="rounded-3xl bg-amber-50/70 px-6 py-5 shadow-sm ring-1 ring-amber-100/70">
              <div className="flex items-start gap-4">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                    Low Stock Alert
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    <strong>{summary.lowStockCount} batch{summary.lowStockCount === 1 ? '' : 'es'}</strong> have chick inventory below {lowStockThreshold}. 
                    Consider monitoring these batches closely or restocking soon.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Available Chicks Inventory */}
          <section className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-tight text-slate-900">
                  Available Chicks
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Chicks ready for selling from successful hatches.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative w-full sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    placeholder="Search by batch ID..."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-10 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/10"
                  />
                </div>

                <button
                  type="button"
                  onClick={openAddBatchModal}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <Plus className="h-4 w-4" />
                  Add Batch
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <p className="text-xs font-medium text-slate-500">Loading inventory...</p>
              </div>
            ) : loadError ? (
              <div className="mt-5 rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
                {loadError}
              </div>
            ) : availableInventories.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <Egg className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-3 text-xs font-medium text-slate-500">No chicks available for sale.</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Chicks will appear here after successful hatches are recorded.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {availableInventories.map((inventory) => (
                  <article
                    key={inventory.id}
                    className="rounded-3xl bg-white px-4 py-4 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[13px] font-semibold tracking-tight text-slate-900">
                          BATCH-{inventory.batch_id}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {inventory.egg_type || "Chicken"} • Hatched: {formatShortDate(inventory.hatch_date)}
                        </p>
                      </div>
                      <div className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                        <Egg className="h-3.5 w-3.5" />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl bg-sky-50/70 px-3 py-2 ring-1 ring-sky-100/80">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Eggs Set
                        </p>
                        <p className="mt-1 text-base font-semibold tracking-tight text-slate-900">
                          {inventory.total_eggs_set || 0}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2 ring-1 ring-emerald-100/80">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Hatch Rate
                        </p>
                        <p className="mt-1 text-base font-semibold tracking-tight text-emerald-600">
                          {(inventory.hatch_rate || 0).toFixed(1)}%
                        </p>
                      </div>

                      <div className="rounded-2xl bg-indigo-50/60 px-3 py-2 ring-1 ring-indigo-100/80">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Total Chicks
                        </p>
                        <p className="mt-1 text-[12px] font-semibold tracking-tight text-slate-900">
                          {inventory.total_chicks || 0}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-amber-50/60 px-3 py-2 ring-1 ring-amber-100/80">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Available
                        </p>
                        <p className="mt-1 text-[12px] font-semibold tracking-tight text-amber-600">
                          {inventory.available_chicks || 0}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-rose-50/60 px-3 py-2 ring-1 ring-rose-100/80">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Failed
                        </p>
                        <p className="mt-1 text-[12px] font-semibold tracking-tight text-rose-600">
                          {inventory.failed_to_hatch || 0}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50/60 px-3 py-2 ring-1 ring-slate-100/80">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Sold
                        </p>
                        <p className="mt-1 text-[12px] font-semibold tracking-tight text-slate-900">
                          {inventory.sold_chicks || 0}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openSellModal(inventory)}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    >
                      <DollarSign className="h-4 w-4" />
                      Sell Chicks
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Sales History */}
          <section className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold tracking-tight text-slate-900">
                  Sales Report
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Record of all chick sales transactions with revenue tracking.
                </p>
              </div>
            </div>

            {salesHistory.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <DollarSign className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-3 text-xs font-medium text-slate-500">No sales yet.</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Sales will appear here when you sell chicks.
                </p>
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 font-semibold text-slate-600">Sale ID</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Batch ID</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Quantity Sold</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Price/Chick</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Total Amount</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Buyer Name</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Date Sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesHistory.map((sale, index) => (
                      <tr key={sale.id} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-slate-500">#{index + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          BATCH-{sale.batch_id}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{sale.quantity_sold}</td>
                        <td className="px-4 py-3 text-slate-700">${Number(sale.price_per_chick || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-600">
                          ${Number(sale.total_amount || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{sale.buyer_name}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {formatShortDate(sale.sale_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-sky-50/70 px-6 py-5 shadow-sm ring-1 ring-sky-100/70">
            <div className="flex items-start gap-4">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 ring-1 ring-sky-200">
                <Info className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                  Chick Inventory Tip
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Chicks are automatically added to inventory when you record successful hatches in Batch History. 
                  Use the "Sell Chicks" button to record sales and track your inventory.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Sell Modal */}
      {isSellModalOpen && selectedInventory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeSellModal();
          }}
        >
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-br from-white/80 via-white/70 to-white/60 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.65)] ring-1 ring-slate-200/70 backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-200/35 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-teal-200/25 blur-3xl" />

            <div className="relative px-5 pt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 ring-1 ring-emerald-100">
                    Sell Chicks
                  </div>
                  <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                    BATCH-{selectedInventory.batch_id}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Available: {selectedInventory.available_chicks} chicks
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeSellModal}
                  disabled={isSelling}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-white/70 text-slate-700 ring-1 ring-slate-200/70 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 space-y-3.5">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Quantity to Sell
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={selectedInventory.available_chicks}
                    value={quantitySold}
                    onChange={(e) => setQuantitySold(Number(e.target.value))}
                    className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/90 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Price per Chick ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={pricePerChick}
                    onChange={(e) => setPricePerChick(Number(e.target.value))}
                    placeholder="e.g. 5.00"
                    className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/90 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Buyer Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/90 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Sale Date
                  </label>
                  <input
                    type="date"
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/90 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
                  />
                </div>

                {sellError ? (
                  <div className="rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
                    {sellError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="relative mt-5 flex gap-3 border-t border-slate-200/60 bg-white/50 px-5 py-4 backdrop-blur">
              <button
                type="button"
                onClick={closeSellModal}
                disabled={isSelling}
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSellChicks}
                disabled={isSelling || quantitySold <= 0}
                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Sale"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Batch Modal */}
      {isAddBatchModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeAddBatchModal();
          }}
        >
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-gradient-to-br from-white/80 via-white/70 to-white/60 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.65)] ring-1 ring-slate-200/70 backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-200/35 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-sky-200/25 blur-3xl" />

            <div className="relative px-5 pt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600 ring-1 ring-indigo-100">
                    <ClipboardList className="h-3.5 w-3.5" />
                    Record Hatch Batch
                  </div>
                  <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                    Add new chick inventory from successful hatch
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAddBatchModal}
                  disabled={isAddingBatch}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-white/70 text-slate-700 ring-1 ring-slate-200/70 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Batch ID *
                  </label>
                  <input
                    type="text"
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value)}
                    placeholder="e.g. 2026-001"
                    className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-300/90 focus:bg-white focus:ring-4 focus:ring-indigo-500/15"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Egg Type *
                  </label>
                  <select
                    value={eggType}
                    onChange={(e) => setEggType(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-300/90 focus:bg-white focus:ring-4 focus:ring-indigo-500/15"
                  >
                    <option value="">Select type...</option>
                    <option value="Native Chicken">Native Chicken</option>
                    <option value="Broiler">Broiler</option>
                    <option value="Duck">Duck</option>
                    <option value="Quail">Quail</option>
                    <option value="Turkey">Turkey</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Total Eggs Set *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={totalEggs}
                    onChange={(e) => setTotalEggs(Number(e.target.value))}
                    placeholder="e.g. 120"
                    className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-300/90 focus:bg-white focus:ring-4 focus:ring-indigo-500/15"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Hatch Date *
                  </label>
                  <input
                    type="date"
                    value={hatchDate}
                    onChange={(e) => setHatchDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-300/90 focus:bg-white focus:ring-4 focus:ring-indigo-500/15"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Successfully Hatched *
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={totalEggs}
                    value={hatchedEggs}
                    onChange={(e) => setHatchedEggs(Number(e.target.value))}
                    placeholder="e.g. 108"
                    className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/90 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Failed to Hatch
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={totalEggs}
                    value={failedEggs}
                    onChange={(e) => setFailedEggs(Number(e.target.value))}
                    placeholder="e.g. 12"
                    className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-rose-300/90 focus:bg-white focus:ring-4 focus:ring-rose-500/15"
                  />
                </div>
              </div>

              {addBatchError ? (
                <div className="mt-4 rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
                  {addBatchError}
                </div>
              ) : null}
            </div>

            <div className="relative mt-5 flex gap-3 border-t border-slate-200/60 bg-white/50 px-5 py-4 backdrop-blur">
              <button
                type="button"
                onClick={closeAddBatchModal}
                disabled={isAddingBatch}
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleAddBatch}
                disabled={isAddingBatch || !batchId || !totalEggs}
                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-sky-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAddingBatch ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Batch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
