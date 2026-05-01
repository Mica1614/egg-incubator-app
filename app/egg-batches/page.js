// @ts-nocheck
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import {
  Plus,
  Info,
  Search,
  Box,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Egg,
  ClipboardCheck,
  TrendingUp,
  X,
  Loader2,
  ClipboardList,
  Bell,
  AlertCircle,
  CheckCircle,
  Calendar,
  Thermometer,
  Droplets,
  Activity,
  Target,
  Clock,
  Zap,
} from "lucide-react";
import { firestore } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
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
      progress: 0,
    };
  }

  const hatch = addDays(start, totalDays);
  const now = new Date();
  const diffMs = hatch.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  
  // Calculate days passed and progress
  const daysPassed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const progress = Math.min(100, Math.max(0, Math.round((daysPassed / totalDays) * 100)));

  return {
    totalDays,
    hatchingDate: hatch,
    daysLeft,
    progress,
  };
};

const calculateStatus = (daysLeft, progress) => {
  if (progress >= 100) return "completed";
  if (daysLeft <= 0) return "ready_to_hatch";
  return "active";
};

// Enhanced Incubation Tracker Functions
const calculateIncubationDay = (startDate) => {
  const start = startDate instanceof Date ? startDate : startDate ? new Date(startDate) : null;
  if (!start || Number.isNaN(start.getTime())) return 0;
  
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const daysPassed = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(0, daysPassed);
};

const getHatchPrediction = (incubationDay, totalDays, eggsHatched, totalEggs) => {
  // Predict hatch rate based on current incubation day
  // Using typical hatch curves for poultry
  
  if (incubationDay < 7) {
    return {
      prediction: "Early Stage",
      confidence: "Low",
      estimatedRate: null,
      message: "Too early to predict. Continue monitoring temperature and humidity.",
      color: "blue",
    };
  }
  
  if (incubationDay >= 7 && incubationDay < 14) {
    // After first candling
    const baseRate = 85; // Typical baseline
    return {
      prediction: "On Track",
      confidence: "Medium",
      estimatedRate: `${baseRate - 5}%`,
      message: "Development appears normal. First candling recommended.",
      color: "cyan",
    };
  }
  
  if (incubationDay >= 14 && incubationDay < 18) {
    // After second candling
    const baseRate = 85;
    return {
      prediction: "Good Progress",
      confidence: "High",
      estimatedRate: `${baseRate}%`,
      message: "Strong development. Prepare for lockdown stage.",
      color: "green",
    };
  }
  
  if (incubationDay >= 18 && incubationDay < 21) {
    // Lockdown stage - can make better predictions
    const hatchedSoFar = eggsHatched || 0;
    const remaining = totalEggs - hatchedSoFar;
    const predictedHatch = Math.round(remaining * 0.85); // 85% of remaining
    
    return {
      prediction: "Lockdown Stage",
      confidence: "Very High",
      estimatedRate: `${Math.round(((hatchedSoFar + predictedHatch) / totalEggs) * 100)}%`,
      message: "Stop turning eggs. Maintain high humidity. Hatching soon!",
      color: "orange",
    };
  }
  
  if (incubationDay >= 21) {
    // Hatch day or beyond
    const actualRate = totalEggs > 0 ? Math.round((eggsHatched / totalEggs) * 100) : 0;
    return {
      prediction: eggsHatched > 0 ? "Hatching Complete" : "Awaiting Hatch",
      confidence: "Actual",
      estimatedRate: `${actualRate}%`,
      message: eggsHatched > 0 ? `Successfully hatched ${eggsHatched} chicks!` : "Monitor closely. Contact vet if no pipping.",
      color: eggsHatched > 0 ? "emerald" : "amber",
    };
  }
  
  return {
    prediction: "Unknown",
    confidence: "N/A",
    estimatedRate: null,
    message: "Unable to predict.",
    color: "gray",
  };
};

const getIncubationAlerts = (incubationDay, eggType) => {
  const type = String(eggType || "").toLowerCase();
  const totalDays = type === "duck" ? 28 : 21;
  const alerts = [];
  
  // Critical milestones
  const milestones = [
    { day: 7, title: "First Candling", icon: "🔍", priority: "medium", message: "Time to candle eggs and check for fertility. Remove clear eggs." },
    { day: 10, title: "Early Development Check", icon: "👁️", priority: "low", message: "Check for visible embryo movement and blood vessels." },
    { day: 14, title: "Second Candling", icon: "🔍", priority: "high", message: "Second candling recommended. Check embryo growth and air cell size." },
    { day: 17, title: "Pre-Lockdown Prep", icon: "⚙️", priority: "medium", message: "Prepare incubator for lockdown. Ensure humidity system is working." },
    { day: 18, title: "LOCKDOWN STAGE", icon: "🚫", priority: "critical", message: "STOP turning eggs! Increase humidity to 65-70%. Do not open incubator." },
    { day: 19, title: "Watch for Pipping", icon: "👂", priority: "high", message: "Listen for chirping. First external pips may appear." },
    { day: 20, title: "Hatching Active", icon: "🐣", priority: "high", message: "Chicks should be hatching. Maintain humidity and avoid opening incubator." },
    { day: 21, title: "Expected Hatch Day", icon: "🎉", priority: "critical", message: "Most chicks should hatch today. Allow 24-48 hours for all to hatch." },
  ];
  
  // Add duck-specific milestones
  if (type === "duck") {
    milestones.push(
      { day: 25, title: "Duck Lockdown", icon: "🚫", priority: "critical", message: "LOCKDOWN for duck eggs. Stop turning, increase humidity." },
      { day: 28, title: "Duck Hatch Day", icon: "🦆", priority: "critical", message: "Expected hatch day for duck eggs." }
    );
  }
  
  // Check if current day matches any milestone
  const todayAlerts = milestones.filter(m => m.day === incubationDay);
  alerts.push(...todayAlerts.map(a => ({ ...a, isNew: true })));
  
  // Add upcoming alerts (next 3 days)
  const upcomingAlerts = milestones.filter(m => m.day > incubationDay && m.day <= incubationDay + 3);
  alerts.push(...upcomingAlerts.map(a => ({ ...a, isUpcoming: true, daysUntil: a.day - incubationDay })));
  
  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return alerts;
};

const getProgressColor = (incubationDay, totalDays) => {
  const percentage = (incubationDay / totalDays) * 100;
  
  if (percentage < 33) return "from-sky-400 to-cyan-500";
  if (percentage < 66) return "from-blue-400 to-indigo-500";
  if (percentage < 85) return "from-indigo-400 to-purple-500";
  if (percentage < 100) return "from-purple-400 to-pink-500";
  return "from-emerald-400 to-teal-500";
};

const getAIRecommendation = (eggType) => {
  const type = String(eggType || "").toLowerCase();
  
  if (type === "duck") {
    return {
      title: "AI Recommendation",
      temperature: "37.5°C",
      humidity: "55–60%",
      finalHumidity: "70%",
      text: "Maintain a temperature of 37.5°C and humidity between 55–60% during days 1-25. Increase humidity to 70% during the final 3 days (days 26-28) before hatching. Ensure proper ventilation and regular egg turning for optimal development.",
    };
  }
  
  if (type === "goose") {
    return {
      title: "AI Recommendation",
      temperature: "37.5°C",
      humidity: "50–55%",
      finalHumidity: "65–70%",
      text: "Maintain a temperature of 37.5°C and humidity between 50–55% during days 1-27. Increase humidity to 65–70% during the final 3 days (days 28-30) before hatching. Goose eggs require regular cooling and misting after day 15 for best results.",
    };
  }
  
  if (type === "quail") {
    return {
      title: "AI Recommendation",
      temperature: "37.2°C",
      humidity: "45–50%",
      finalHumidity: "60–65%",
      text: "Maintain a temperature of 37.2°C and humidity between 45–50% during days 1-14. Increase humidity to 60–65% during the final 3 days (days 15-17) before hatching. Quail eggs develop quickly, so maintain stable conditions throughout incubation.",
    };
  }
  
  // Default to chicken - Enhanced English version
  return {
    title: "AI Recommendation",
    temperature: "37.5°C",
    humidity: "45–55%",
    finalHumidity: "65–75%",
    text: "🥚 Days 1–18 (Setting Phase): Maintain humidity at 45–55%. This provides adequate moisture to prevent the egg from drying out while avoiding excess humidity. Ensure consistent temperature at 37.5°C with proper ventilation. 🐥 Days 19–21 (Hatching Phase): Increase humidity to 65–75%. Higher humidity softens the shell membrane and prevents chicks from drying out during hatching. Stop egg turning and avoid opening the incubator.",
  };
};

export default function EggBatchesPage() {
  const today = useMemo(() => formatToday(), []);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [batches, setBatches] = useState([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(6);

  // State for showing/hiding recommendations in batch cards
  const [showRecommendations, setShowRecommendations] = useState({});

  // Control config to track egg turner status
  const [controlConfig, setControlConfig] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [eggType, setEggType] = useState("");
  const [totalEggs, setTotalEggs] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [manageBatchId, setManageBatchId] = useState("");
  const [manageEggType, setManageEggType] = useState("");
  const [manageTotalEggs, setManageTotalEggs] = useState(0);
  const [manageStartDate, setManageStartDate] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [manageError, setManageError] = useState("");

  // State for showing/hiding recommendation in detail view
  const [showDetailRecommendation, setShowDetailRecommendation] = useState(true);

  // Hatch tracking states
  const [isHatchModalOpen, setIsHatchModalOpen] = useState(false);
  const [selectedBatchForHatch, setSelectedBatchForHatch] = useState(null);
  const [eggsHatched, setEggsHatched] = useState(0);
  const [eggsFailed, setEggsFailed] = useState(0);
  const [hatchDate, setHatchDate] = useState(new Date().toISOString().split("T")[0]);
  const [isUpdatingHatch, setIsUpdatingHatch] = useState(false);
  const [hatchError, setHatchError] = useState("");

  useEffect(() => {
    setLoadError("");
    setIsLoadingBatches(true);

    const q = query(collection(firestore, "egg_batches"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => {
          const batchData = docSnap.data();
          const start = batchData?.startDate?.toDate ? batchData.startDate.toDate() : null;
          const incubationDays = incubationDaysForType(batchData?.eggType || "");
          
          // Calculate derived data for display
          const daysPassed = start ? Math.floor((new Date().getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1 : 0;
          const progress = Math.min(100, Math.max(0, Math.round((daysPassed / incubationDays) * 100)));
          const hatchingDate = start ? addDays(start, incubationDays) : null;
          const now = new Date();
          const daysLeft = hatchingDate ? Math.max(0, Math.ceil((hatchingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;
          
          return {
            id: docSnap.id,
            ...batchData,
            _derived: {
              daysPassed,
              totalDays: incubationDays,
              progress,
              daysLeft,
              hatchingDate,
            },
          };
        });
        setBatches(next);
        setIsLoadingBatches(false);
      },
      (error) => {
        const message = error?.message || "Failed to load batches.";
        const code = error?.code ? ` (${error.code})` : "";
        setLoadError(`${message}${code}`);
        setIsLoadingBatches(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Auto-recalculate incubation data for all batches
  useEffect(() => {
    const recalculateBatchData = async () => {
      if (!batches.length) return;

      const now = new Date();
      const updates = [];

      for (const batch of batches) {
        try {
          const start = batch?.startDate?.toDate ? batch.startDate.toDate() : null;
          if (!start) continue;

          const eggType = batch?.eggType || "";
          const incubationDays = incubationDaysForType(eggType);
          const hatchingDate = addDays(start, incubationDays);
          
          const daysPassed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const progress = Math.min(100, Math.max(0, Math.round((daysPassed / incubationDays) * 100)));
          const daysLeft = Math.max(0, Math.ceil((hatchingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          const status = calculateStatus(daysLeft, progress);

          // Check if values need updating
          const needsUpdate = 
            batch.progress !== progress ||
            batch.daysLeft !== daysLeft ||
            batch.status !== status;

          if (needsUpdate) {
            updates.push({
              id: batch.id,
              data: {
                progress,
                daysLeft,
                status,
                updatedAt: serverTimestamp(),
              },
            });
          }
        } catch (err) {
          console.error(`Failed to recalculate batch ${batch.id}:`, err);
        }
      }

      // Apply all updates
      if (updates.length > 0) {
        const batchPromises = updates.map(({ id, data }) =>
          updateDoc(doc(firestore, "egg_batches", id), data)
        );
        await Promise.all(batchPromises);
      }
    };

    // Recalculate on page load and every 10 seconds for real-time updates
    recalculateBatchData();
    const interval = setInterval(recalculateBatchData, 10000);

    return () => clearInterval(interval);
  }, [batches]);

  const selectedBatchRaw = selectedBatchId
    ? batches.find((b) => b && b.id === selectedBatchId) || null
    : null;
  const selectedStartDate = selectedBatchRaw?.startDate?.toDate
    ? selectedBatchRaw.startDate.toDate()
    : null;
  const derived = computeDerived({
    startDate: selectedStartDate,
    eggType: selectedBatchRaw?.eggType,
  });

  const decorateBatch = (batch) => {
    const start = batch?.startDate?.toDate ? batch.startDate.toDate() : null;
    const derived = computeDerived({
      startDate: start,
      eggType: batch?.eggType,
    });

    // Calculate status based on days left and progress
    const status = calculateStatus(derived.daysLeft, derived.progress);

    return {
      ...batch,
      _startDate: start,
      _derived: derived,
      _status: status,
    };
  };

  const decoratedBatches = batches.map(decorateBatch);

  const activeBatches = useMemo(() => {
    return decoratedBatches.filter((batch) => {
      const daysLeft = batch?._derived?.daysLeft;
      return typeof daysLeft === "number" ? daysLeft > 0 : true;
    });
  }, [decoratedBatches]);

  const filteredBatches = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return activeBatches;

    return activeBatches.filter((batch) => {
      const id = String(batch?.batchId || "").toLowerCase();
      const type = String(batch?.eggType || "").toLowerCase();
      const start = batch?._startDate ? formatShortDate(batch._startDate).toLowerCase() : "";
      const hatch = batch?._derived?.hatchingDate
        ? formatShortDate(batch._derived.hatchingDate).toLowerCase()
        : "";
      const status = String(batch?.status || "").toLowerCase();

      return (
        id.includes(q) ||
        type.includes(q) ||
        start.includes(q) ||
        hatch.includes(q) ||
        status.includes(q)
      );
    });
  }, [activeBatches, search]);

  useEffect(() => {
    if (!selectedBatchId) return;
    const stillActive = activeBatches.some((b) => b && b.id === selectedBatchId);
    if (!stillActive) setSelectedBatchId(null);
  }, [activeBatches, selectedBatchId]);

  // Listen to control config for egg turner status
  useEffect(() => {
    const ref = doc(firestore, "control_center_configs", "default");

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setControlConfig(null);
          return;
        }

        setControlConfig({ id: snap.id, ...snap.data() });
      },
      (err) => {
        console.error("Failed to load control config:", err);
        setControlConfig(null);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, perPage]);

  const totalPages = Math.max(1, Math.ceil(filteredBatches.length / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedBatches = useMemo(() => {
    const startIndex = (safePage - 1) * perPage;
    return filteredBatches.slice(startIndex, startIndex + perPage);
  }, [filteredBatches, perPage, safePage]);

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setSaveError("");
  };

  const closeManage = () => {
    if (isUpdating || isDeleting) return;
    setIsManageOpen(false);
    setIsEditing(false);
    setIsDeleteConfirmOpen(false);
    setManageError("");
  };

  const closeDeleteConfirm = () => {
    if (isDeleting) return;
    setIsDeleteConfirmOpen(false);
    setManageError("");
  };

  // Hatch tracking handlers
  const openHatchModal = (batch) => {
    setSelectedBatchForHatch(batch);
    setHatchError("");
    setIsHatchModalOpen(true);
  };

  const closeHatchModal = () => {
    if (isUpdatingHatch) return;
    setIsHatchModalOpen(false);
    setSelectedBatchForHatch(null);
    setHatchError("");
  };

  const handleUpdateHatch = async ({ eggsHatched: hatched, eggsFailed: failed, hatchDate }) => {
    if (!selectedBatchForHatch?.id) return;
    setHatchError("");

    const total = Number(selectedBatchForHatch.totalEggs || 0);
    const hatchRate = total > 0 ? ((hatched / total) * 100).toFixed(1) : 0;
    
    setIsUpdatingHatch(true);
    try {
      await updateDoc(doc(firestore, "egg_batches", selectedBatchForHatch.id), {
        hatchedEggs: hatched,
        failedToHatch: failed,
        hatchRate: parseFloat(hatchRate),
        status: "completed",
        progress: 100,
        hatchDate: new Date(hatchDate),
        updatedAt: serverTimestamp(),
      });

      // Automatically create chick inventory record
      const inventoryData = {
        batch_id: String(selectedBatchForHatch.batchId || ""),
        egg_type: String(selectedBatchForHatch.eggType || "Chicken"),
        total_eggs_set: total,
        total_chicks: hatched,
        failed_to_hatch: failed,
        available_chicks: hatched,
        sold_chicks: 0,
        hatch_rate: parseFloat(hatchRate),
        hatch_date: new Date(hatchDate),
        createdAt: serverTimestamp(),
      };

      await setDoc(
        doc(firestore, "chick_inventory", `batch_${selectedBatchForHatch.batchId}_${Date.now()}`),
        inventoryData
      );

      closeHatchModal();
    } catch (e) {
      const message = e?.message || "Failed to update hatch results.";
      const code = e?.code ? ` (${e.code})` : "";
      setHatchError(`${message}${code}`);
    } finally {
      setIsUpdatingHatch(false);
    }
  };

  const resetForm = () => {
    setBatchId("");
    setEggType("");
    setTotalEggs(0);
    setStartDate("");
  };

  const openManage = () => {
    if (!selectedBatchRaw) return;
    setManageError("");
    setIsEditing(false);

    setManageBatchId(String(selectedBatchRaw.batchId || ""));
    setManageEggType(String(selectedBatchRaw.eggType || ""));
    setManageTotalEggs(Number(selectedBatchRaw.totalEggs || 0));
    const start = selectedStartDate;
    const startIso = start
      ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
          start.getDate()
        ).padStart(2, "0")}`
      : "";
    setManageStartDate(startIso);
    setIsManageOpen(true);
  };

  const handleUpdateBatch = async () => {
    if (!selectedBatchRaw?.id) return;
    setManageError("");

    const trimmed = String(manageBatchId || "").trim();
    if (!trimmed) {
      setManageError("Batch ID / Name is required.");
      return;
    }

    const type = String(manageEggType || "").trim();
    if (!type) {
      setManageError("Egg type is required.");
      return;
    }

    const eggs = Number(manageTotalEggs);
    if (!Number.isFinite(eggs) || eggs <= 0) {
      setManageError("Total eggs must be greater than 0.");
      return;
    }

    if (!manageStartDate) {
      setManageError("Start date is required.");
      return;
    }

    const parsed = new Date(manageStartDate);
    if (Number.isNaN(parsed.getTime())) {
      setManageError("Start date is invalid.");
      return;
    }

    setIsUpdating(true);
    try {
      const incubationDays = incubationDaysForType(type);
      const hatchingDate = addDays(parsed, incubationDays);
      const now = new Date();
      const daysPassed = Math.floor((now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const progress = Math.min(100, Math.max(0, Math.round((daysPassed / incubationDays) * 100)));
      const daysLeft = Math.max(0, Math.ceil((hatchingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const status = calculateStatus(daysLeft, progress);

      await updateDoc(doc(firestore, "egg_batches", selectedBatchRaw.id), {
        batchId: trimmed,
        eggType: type,
        totalEggs: eggs,
        startDate: Timestamp.fromDate(parsed),
        incubationDays: incubationDays,
        hatchingDate: Timestamp.fromDate(hatchingDate),
        daysLeft: daysLeft,
        progress: progress,
        status: status,
        updatedAt: serverTimestamp(),
      });

      setIsEditing(false);
    } catch (e) {
      const message = e?.message || "Failed updating batch.";
      const code = e?.code ? ` (${e.code})` : "";
      setManageError(`${message}${code}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!selectedBatchRaw?.id) return;
    setManageError("");

    setIsDeleting(true);
    try {
      await deleteDoc(doc(firestore, "egg_batches", selectedBatchRaw.id));
      setSelectedBatchId(null);
      setIsDeleteConfirmOpen(false);
      closeManage();
    } catch (e) {
      const message = e?.message || "Failed deleting batch.";
      const code = e?.code ? ` (${e.code})` : "";
      setManageError(`${message}${code}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateBatch = async () => {
    setSaveError("");

    const trimmed = String(batchId || "").trim();
    if (!trimmed) {
      setSaveError("Batch ID / Name is required.");
      return;
    }

    const eggs = Number(totalEggs);
    if (!Number.isFinite(eggs) || eggs <= 0) {
      setSaveError("Total eggs must be greater than 0.");
      return;
    }

    const type = String(eggType || "").trim();
    if (!type) {
      setSaveError("Egg type is required.");
      return;
    }

    if (!startDate) {
      setSaveError("Start date is required.");
      return;
    }

    const parsed = new Date(startDate);
    if (Number.isNaN(parsed.getTime())) {
      setSaveError("Start date is invalid.");
      return;
    }

    setIsSaving(true);
    try {
      const incubationDays = incubationDaysForType(type);
      const hatchingDate = addDays(parsed, incubationDays);

      await addDoc(collection(firestore, "egg_batches"), {
        batchId: trimmed,
        eggType: type,
        totalEggs: eggs,
        startDate: Timestamp.fromDate(parsed),
        incubationDays: incubationDays,
        hatchingDate: Timestamp.fromDate(hatchingDate),
        daysLeft: Math.ceil((hatchingDate.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24)),
        progress: 0,
        status: "active",
        // NEW: Individual egg inventory
        eggInventory: Array.from({ length: eggs }, (_, i) => ({
          eggId: `EGG-${String(i + 1).padStart(3, '0')}`,
          status: "incubating",
          addedAt: Timestamp.fromDate(parsed),
        })),
        // NEW: Real-time counts
        counts: {
          incubating: eggs,
          dead: 0,
          removed: 0,
          hatched: 0,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetForm();
      setIsModalOpen(false);
    } catch (e) {
      const message = e?.message || "Failed saving batch.";
      const code = e?.code ? ` (${e.code})` : "";
      setSaveError(`${message}${code}`);
    } finally {
      setIsSaving(false);
    }
  };

  // NEW: Update egg status in batch
  const updateEggStatus = useCallback(async (batchId, eggIds, newStatus) => {
    try {
      const batchRef = doc(firestore, "egg_batches", batchId);
      const batchDoc = await getDoc(batchRef);
      
      if (!batchDoc.exists()) {
        throw new Error("Batch not found");
      }

      const batchData = batchDoc.data();
      const eggInventory = batchData.eggInventory || [];
      const counts = batchData.counts || { incubating: 0, dead: 0, removed: 0, hatched: 0 };

      // Update egg statuses
      const updatedInventory = eggInventory.map(egg => {
        if (eggIds.includes(egg.eggId)) {
          // Decrement old status count
          if (counts[egg.status] !== undefined) {
            counts[egg.status] = Math.max(0, counts[egg.status] - 1);
          }
          // Increment new status count
          if (counts[newStatus] !== undefined) {
            counts[newStatus] = (counts[newStatus] || 0) + 1;
          }
          return { ...egg, status: newStatus, updatedAt: new Date() };
        }
        return egg;
      });

      // Update batch with new inventory and counts
      await updateDoc(batchRef, {
        eggInventory: updatedInventory,
        counts: counts,
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Failed to update egg status:", error);
      return { success: false, error: error.message };
    }
  }, []);

  // NEW: Record candling session
  const recordCandlingSession = useCallback(async (batchId, sessionData) => {
    try {
      const { eggsScanned, results, notes } = sessionData;
      
      // Create candling session in subcollection
      const sessionsRef = collection(firestore, "egg_batches", batchId, "candlingSessions");
      await addDoc(sessionsRef, {
        date: new Date(),
        eggsScanned: eggsScanned || [],
        results: results || [],
        notes: notes || "",
        createdAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Failed to record candling session:", error);
      return { success: false, error: error.message };
    }
  }, []);

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-4">
            <TopBar
              title="Egg Batches"
              notificationCount={3}
              onOpenSidebar={() => setIsSidebarOpen(true)}
            />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-[11px] font-medium text-slate-400">{today}</p>

              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              >
                <Plus className="h-4 w-4" />
                New Batch
              </button>
            </div>
          </div>

          <section className="grid gap-4 lg:grid-cols-3">
            <article className="lg:col-span-2 rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 ring-1 ring-slate-200/60">
                    {selectedBatchRaw?.batchId
                      ? `BATCH #${selectedBatchRaw.batchId}`
                      : isLoadingBatches
                      ? "Loading"
                      : "Select a batch"}
                  </span>
                  {selectedBatchRaw?.status ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 ring-1 ring-emerald-100">
                      {controlConfig?.enabled?.turner ? (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                          Active
                        </>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 mr-1.5" />
                          Not Active
                        </>
                      )}
                    </span>
                  ) : null}
                  {selectedBatchRaw?.eggType ? (
                    <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600 ring-1 ring-sky-100">
                      {selectedBatchRaw.eggType}
                    </span>
                  ) : null}
                </div>
              </div>

              {loadError ? (
                <div className="mt-4 rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
                  {loadError}
                </div>
              ) : null}

              {!isLoadingBatches && activeBatches.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                  <p className="text-xs font-medium text-slate-500">No batches yet.</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Click <span className="font-semibold">New Batch</span> to create one.
                  </p>
                </div>
              ) : null}

              {!isLoadingBatches && activeBatches.length > 0 && !selectedBatchRaw ? (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900/5 ring-1 ring-slate-200/60">
                    <Box className="h-5 w-5 text-slate-500" />
                  </div>
                  <p className="mt-3 text-xs font-semibold text-slate-700">
                    Select a batch to review
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Click any batch below to view its details.
                  </p>
                </div>
              ) : null}

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Days Left
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                    {selectedBatchRaw && typeof derived.daysLeft === "number" ? derived.daysLeft : "-"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Days remaining</p>
                </div>

                <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Total Eggs
                  </p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <p className="text-3xl font-semibold tracking-tight text-slate-900">
                      {selectedBatchRaw?.totalEggs ?? "-"}
                    </p>
                    <span className="text-xs font-semibold text-slate-400">pcs</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Incubating</p>
                </div>

                <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Hatching Date
                  </p>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-emerald-600">
                    {selectedBatchRaw && derived.hatchingDate
                      ? formatShortDate(derived.hatchingDate)
                      : "-"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Estimated</p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={openManage}
                  disabled={!selectedBatchRaw}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:from-sky-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 sm:w-auto"
                >
                  Manage
                </button>
              </div>

              {/* AI Recommendation for Selected Batch - Collapsible */}
              {selectedBatchRaw && selectedBatchRaw.eggType && (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setShowDetailRecommendation(!showDetailRecommendation)}
                    className="group inline-flex w-full items-center justify-between gap-3 rounded-3xl bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-pink-50/40 px-6 py-4 ring-1 ring-indigo-100/80 transition hover:bg-gradient-to-r hover:from-indigo-50 hover:via-purple-50 hover:to-pink-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  >
                    <div className="flex items-center gap-3">
                      <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">
                          AI Incubation Recommendation
                        </p>
                        <p className="text-[11px] text-slate-500">Optimized for {selectedBatchRaw.eggType} eggs</p>
                      </div>
                    </div>
                    <svg 
                      className={`h-5 w-5 text-indigo-600 transition-transform duration-200 ${showDetailRecommendation ? 'rotate-180' : ''}`}
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded Content */}
                  {showDetailRecommendation && (
                    <div className="mt-3 rounded-3xl bg-gradient-to-br from-indigo-50/80 via-purple-50/60 to-pink-50/40 px-6 py-5 ring-1 ring-indigo-100/80 backdrop-blur-sm">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-indigo-50/50">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.971 7.971 0 016.343 18.657z" />
                            </svg>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Temperature</span>
                          </div>
                          <p className="text-2xl font-bold text-slate-900">{getAIRecommendation(selectedBatchRaw.eggType).temperature}</p>
                          <p className="mt-1 text-[10px] text-slate-600">Maintain consistently throughout incubation</p>
                        </div>

                        <div className="rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-indigo-50/50">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="h-4 w-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Humidity</span>
                          </div>
                          <p className="text-lg font-bold text-slate-900">{getAIRecommendation(selectedBatchRaw.eggType).humidity}</p>
                          <p className="mt-1 text-[10px] text-slate-600">During days 1-{selectedBatchRaw.incubationDays ? selectedBatchRaw.incubationDays - 3 : '18'}</p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-indigo-50/50">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Critical Final Stage</p>
                            <p className="text-sm font-semibold text-slate-900">Increase humidity to {getAIRecommendation(selectedBatchRaw.eggType).finalHumidity}</p>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-700">
                              {getAIRecommendation(selectedBatchRaw.eggType).text}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>

            <aside className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Batch Summary
              </p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
                  <span className="text-xs font-medium text-slate-600">Status</span>
                  <span className="text-xs font-semibold text-emerald-600">
                    {selectedBatchRaw?.status ? String(selectedBatchRaw.status) : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
                  <span className="text-xs font-medium text-slate-600">Batch ID</span>
                  <span className="text-xs font-semibold text-slate-700">
                    {selectedBatchRaw?.batchId ? String(selectedBatchRaw.batchId) : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
                  <span className="text-xs font-medium text-slate-600">Egg count</span>
                  <span className="text-xs font-semibold text-slate-700">
                    {selectedBatchRaw?.totalEggs ?? "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
                  <span className="text-xs font-medium text-slate-600">Egg type</span>
                  <span className="text-xs font-semibold text-slate-700">
                    {selectedBatchRaw?.eggType ? String(selectedBatchRaw.eggType) : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
                  <span className="text-xs font-medium text-slate-600">Start date</span>
                  <span className="text-xs font-semibold text-slate-700">
                    {selectedStartDate ? formatShortDate(selectedStartDate) : "-"}
                  </span>
                </div>
              </div>
            </aside>
          </section>

          {isManageOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeManage();
              }}
            >
              <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-br from-white/80 via-white/70 to-white/60 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.65)] ring-1 ring-slate-200/70 backdrop-blur-xl">
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-200/30 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-sky-200/30 blur-3xl" />

                <div className="relative px-5 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 ring-1 ring-slate-200/60">
                        Manage Batch
                      </div>
                      <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                        {selectedBatchRaw?.batchId ? `BATCH-${selectedBatchRaw.batchId}` : "Batch"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {selectedStartDate ? formatShortDate(selectedStartDate) : ""}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsEditing((v) => !v)}
                      disabled={isUpdating || isDeleting}
                      className="inline-flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/70 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Pencil className="h-4 w-4" />
                      {isEditing ? "View" : "Edit"}
                    </button>
                  </div>

                  {!isEditing ? (
                    <div className="mt-5 grid gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-sky-50/70 px-3.5 py-2.5 ring-1 ring-sky-100/80">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Egg Type</p>
                          <p className="mt-1 text-base font-semibold tracking-tight text-slate-900">
                            {selectedBatchRaw?.eggType ? String(selectedBatchRaw.eggType) : "-"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-sky-50/70 px-3.5 py-2.5 ring-1 ring-sky-100/80">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</p>
                          <p className="mt-1 text-base font-semibold tracking-tight text-slate-900">
                            {selectedBatchRaw?.status ? String(selectedBatchRaw.status) : "-"}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-amber-50/60 px-3.5 py-2.5 ring-1 ring-amber-100/80">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Eggs</p>
                          <p className="mt-1 text-[12px] font-semibold tracking-tight text-slate-900">
                            {selectedBatchRaw?.totalEggs ?? "-"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-amber-50/60 px-3.5 py-2.5 ring-1 ring-amber-100/80">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Hatch</p>
                          <p className="mt-1 text-[12px] font-semibold tracking-tight text-slate-900">
                            {derived?.hatchingDate ? formatShortDate(derived.hatchingDate) : "-"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-100">
                        <span className="text-[11px] font-medium text-slate-600">Days left</span>
                        <span className="text-[11px] font-semibold text-slate-900">
                          {typeof derived?.daysLeft === "number" ? derived.daysLeft : "-"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-3.5">
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Batch ID / Name
                        </label>
                        <input
                          value={manageBatchId}
                          onChange={(e) => setManageBatchId(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Egg Type
                        </label>
                        <select
                          value={manageEggType}
                          onChange={(e) => setManageEggType(e.target.value)}
                          className="w-full appearance-none rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                        >
                          <option value="" disabled>
                            Select egg type
                          </option>
                          <option value="Chicken">Chicken</option>
                          <option value="Duck">Duck</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Total Eggs (pcs)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={manageTotalEggs}
                          onChange={(e) => setManageTotalEggs(Number(e.target.value))}
                          className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={manageStartDate}
                          onChange={(e) => setManageStartDate(e.target.value)}
                          className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                        />
                      </div>

                      {manageError ? (
                        <div className="rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
                          {manageError}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="relative mt-5 flex gap-3 border-t border-slate-200/60 bg-white/50 px-5 py-4 backdrop-blur">
                  <button
                    type="button"
                    onClick={closeManage}
                    disabled={isUpdating || isDeleting}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Close
                  </button>

                  {isEditing ? (
                    <button
                      type="button"
                      onClick={handleUpdateBatch}
                      disabled={isUpdating || isDeleting}
                      className="inline-flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUpdating ? "Saving..." : "Save"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsDeleteConfirmOpen(true)}
                      disabled={isUpdating || isDeleting}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {isDeleteConfirmOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeDeleteConfirm();
              }}
            >
              <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-br from-white/80 via-white/70 to-white/60 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.65)] ring-1 ring-slate-200/70 backdrop-blur-xl">
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-rose-200/25 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-amber-200/25 blur-3xl" />

                <div className="relative px-5 pt-5">
                  <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-600 ring-1 ring-rose-100">
                    Confirm Delete
                  </div>

                  <p className="mt-3 text-sm font-semibold tracking-tight text-slate-900">
                    Delete this batch?
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    This action cannot be undone. Batch:{" "}
                    <span className="font-semibold text-slate-700">
                      {selectedBatchRaw?.batchId ? `BATCH-${selectedBatchRaw.batchId}` : "(unknown)"}
                    </span>
                  </p>

                  {manageError ? (
                    <div className="mt-4 rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
                      {manageError}
                    </div>
                  ) : null}
                </div>

                <div className="relative mt-5 flex gap-3 border-t border-slate-200/60 bg-white/50 px-5 py-4 backdrop-blur">
                  <button
                    type="button"
                    onClick={closeDeleteConfirm}
                    disabled={isDeleting}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteBatch}
                    disabled={isDeleting}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <section className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-semibold tracking-tight text-slate-900">
                  All Batches
                </h2>
                <p className="text-xs text-slate-500">
                  Search and review batches saved in Firebase.
                </p>
              </div>

              <div className="relative w-full sm:max-w-sm">
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
                <p className="text-xs font-medium text-slate-500">Loading batches...</p>
              </div>
            ) : loadError ? (
              <div className="mt-5 rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
                {loadError}
              </div>
            ) : decoratedBatches.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <p className="text-xs font-medium text-slate-500">No batches yet.</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Create one using <span className="font-semibold">New Batch</span>.
                </p>
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
                    <article
                      key={batch.id}
                      onClick={() => setSelectedBatchId(batch.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedBatchId(batch.id);
                        }
                      }}
                      className={`rounded-3xl bg-white px-4 py-4 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${
                        selectedBatchId === batch.id
                          ? "ring-sky-200"
                          : "ring-slate-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[13px] font-semibold tracking-tight text-slate-900">
                            {batch?.batchId ? `BATCH-${batch.batchId}` : "BATCH"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {typeof batch?.totalEggs === "number" ? `${batch.totalEggs} eggs total` : "-"}
                          </p>
                        </div>

                        <div className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                          <Box className="h-3.5 w-3.5" />
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {/* NEW: Egg Status Counts */}
                        {batch?.counts && (
                          <>
                            <div className="rounded-2xl bg-emerald-50/70 px-3 py-2 ring-1 ring-emerald-100/80">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Incubating
                              </p>
                              <p className="mt-1 text-base font-semibold tracking-tight text-emerald-700">
                                {batch.counts.incubating || 0}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-rose-50/70 px-3 py-2 ring-1 ring-rose-100/80">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Dead
                              </p>
                              <p className="mt-1 text-base font-semibold tracking-tight text-rose-700">
                                {batch.counts.dead || 0}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-amber-50/60 px-3 py-2 ring-1 ring-amber-100/80">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Removed
                              </p>
                              <p className="mt-1 text-[12px] font-semibold tracking-tight text-amber-700">
                                {batch.counts.removed || 0}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-sky-50/60 px-3 py-2 ring-1 ring-sky-100/80">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Hatched
                              </p>
                              <p className="mt-1 text-[12px] font-semibold tracking-tight text-sky-700">
                                {batch.counts.hatched || 0}
                              </p>
                            </div>
                          </>
                        )}

                        {/* Original fields if no counts yet */}
                        {!batch?.counts && (
                          <>
                            <div className="rounded-2xl bg-sky-50/70 px-3 py-2 ring-1 ring-sky-100/80">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Egg Type
                              </p>
                              <p className="mt-1 text-base font-semibold tracking-tight text-slate-900">
                                {batch?.eggType ? String(batch.eggType) : "-"}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-sky-50/70 px-3 py-2 ring-1 ring-sky-100/80">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Status
                              </p>
                              <p className="mt-1 text-base font-semibold tracking-tight text-slate-900">
                                {batch?.status ? String(batch.status) : "-"}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-amber-50/60 px-3 py-2 ring-1 ring-amber-100/80">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Start
                              </p>
                              <p className="mt-1 text-[12px] font-semibold tracking-tight text-slate-900">
                                {batch._startDate ? formatShortDate(batch._startDate) : "-"}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-amber-50/60 px-3 py-2 ring-1 ring-amber-100/80">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Hatch
                              </p>
                              <p className="mt-1 text-[12px] font-semibold tracking-tight text-slate-900">
                                {batch?._derived?.hatchingDate
                                  ? formatShortDate(batch._derived.hatchingDate)
                                  : "-"}
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="mt-2.5 flex items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-100">
                        <span className="text-[11px] font-medium text-slate-600">Days left</span>
                        <span className="text-[11px] font-semibold text-slate-900">
                          {typeof batch?._derived?.daysLeft === "number" ? batch._derived.daysLeft : "-"}
                        </span>
                      </div>

                      {/* Track Hatch Button - Only show for active batches */}
                      {batch?.status !== "completed" && (
                        <>
                          {/* Visual Incubation Progress Bar */}
                          <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4 text-indigo-600" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                  Incubation Progress
                                </p>
                              </div>
                              <span className="text-xs font-semibold text-indigo-600">
                                Day {batch._derived?.daysPassed || 0} of {batch._derived?.totalDays || 21}
                              </span>
                            </div>
                            
                            {/* Progress Bar */}
                            <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200">
                              <div 
                                className={`absolute left-0 top-0 h-full bg-gradient-to-r ${getProgressColor(batch._derived?.daysPassed || 0, batch._derived?.totalDays || 21)} transition-all duration-500`}
                                style={{ width: `${batch._derived?.progress || 0}%` }}
                              />
                            </div>
                            
                            {/* Progress Stats */}
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                              <div className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-100">
                                <p className="text-[9px] text-slate-500">Days Left</p>
                                <p className="text-sm font-semibold text-slate-900">{batch._derived?.daysLeft || 0}</p>
                              </div>
                              <div className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-100">
                                <p className="text-[9px] text-slate-500">Progress</p>
                                <p className="text-sm font-semibold text-indigo-600">{batch._derived?.progress || 0}%</p>
                              </div>
                              <div className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-100">
                                <p className="text-[9px] text-slate-500">Status</p>
                                {controlConfig?.enabled?.turner ? (
                                  <p className="text-sm font-semibold text-emerald-600 capitalize flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Active
                                  </p>
                                ) : (
                                  <p className="text-sm font-semibold text-slate-500 capitalize flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                    Not Active
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Smart Incubation Alerts */}
                          <div className="mt-3">
                            {(() => {
                              const alerts = getIncubationAlerts(batch._derived?.daysPassed || 0, batch?.eggType);
                              if (alerts.length === 0) return null;
                              
                              return (
                                <div className="rounded-xl bg-amber-50/70 px-4 py-3 ring-1 ring-amber-100/70">
                                  <div className="flex items-center gap-2 mb-3">
                                    <Bell className="h-4 w-4 text-amber-600" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                      Incubation Alerts
                                    </p>
                                  </div>
                                  
                                  <div className="space-y-2">
                                    {alerts.slice(0, 3).map((alert, idx) => (
                                      <div 
                                        key={idx}
                                        className={`rounded-lg p-2.5 ${
                                          alert.isNew 
                                            ? 'bg-white ring-2 ring-amber-200' 
                                            : alert.isUpcoming 
                                              ? 'bg-amber-50/50 ring-1 ring-amber-100/50' 
                                              : 'bg-white ring-1 ring-slate-100'
                                        }`}
                                      >
                                        <div className="flex items-start gap-2">
                                          <span className="text-lg">{alert.icon}</span>
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <p className="text-xs font-semibold text-slate-900">{alert.title}</p>
                                              {alert.priority === 'critical' && (
                                                <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-700">
                                                  CRITICAL
                                                </span>
                                              )}
                                              {alert.priority === 'high' && (
                                                <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                                                  HIGH
                                                </span>
                                              )}
                                            </div>
                                            <p className="mt-1 text-[10px] leading-tight text-slate-600">{alert.message}</p>
                                            {alert.isUpcoming && (
                                              <p className="mt-1 text-[9px] font-medium text-amber-600">
                                                In {alert.daysUntil} {alert.daysUntil === 1 ? 'day' : 'days'}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Hatch Prediction */}
                          <div className="mt-3">
                            {(() => {
                              const prediction = getHatchPrediction(
                                batch._derived?.daysPassed || 0,
                                batch._derived?.totalDays || 21,
                                batch?.eggsHatched || 0,
                                batch?.totalEggs || 0
                              );
                              
                              const colorMap = {
                                blue: 'from-sky-50 to-blue-50 ring-sky-100 text-sky-700',
                                cyan: 'from-cyan-50 to-sky-50 ring-cyan-100 text-cyan-700',
                                green: 'from-emerald-50 to-green-50 ring-emerald-100 text-emerald-700',
                                orange: 'from-orange-50 to-amber-50 ring-orange-100 text-orange-700',
                                amber: 'from-amber-50 to-yellow-50 ring-amber-100 text-amber-700',
                                emerald: 'from-emerald-50 to-teal-50 ring-emerald-100 text-emerald-700',
                                gray: 'from-slate-50 to-gray-50 ring-slate-100 text-slate-700',
                              };
                              
                              return (
                                <div className={`rounded-xl bg-gradient-to-br px-4 py-3 ring-1 ${colorMap[prediction.color] || colorMap.blue}`}>
                                  <div className="flex items-center gap-2 mb-2">
                                    <Target className="h-4 w-4" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                                      Hatch Prediction
                                    </p>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <p className="text-[9px] opacity-70">Prediction</p>
                                      <p className="text-sm font-bold">{prediction.prediction}</p>
                                    </div>
                                    <div>
                                      <p className="text-[9px] opacity-70">Est. Hatch Rate</p>
                                      <p className="text-sm font-bold">{prediction.estimatedRate || 'N/A'}</p>
                                    </div>
                                  </div>
                                  
                                  <div className="mt-2 rounded-lg bg-white/70 px-2.5 py-2">
                                    <p className="text-[10px] leading-relaxed">{prediction.message}</p>
                                    <div className="mt-1.5 flex items-center gap-1.5">
                                      <Clock className="h-3 w-3 opacity-60" />
                                      <p className="text-[9px] opacity-70">Confidence: <span className="font-semibold">{prediction.confidence}</span></p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openHatchModal(batch);
                            }}
                            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                          >
                            <ClipboardCheck className="h-4 w-4" />
                            Track Hatch
                          </button>
                        </>
                      )}

                      {/* Completed Badge - Show for completed batches */}
                      {batch?.status === "completed" && (
                        <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100">
                          <div className="flex items-center gap-2 mb-2">
                            <Egg className="h-4 w-4 text-emerald-600" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                              Hatch Results
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-[9px] text-slate-500">Hatched</p>
                              <p className="text-[11px] font-semibold text-emerald-600">{batch.hatchedEggs || 0}</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-slate-500">Failed</p>
                              <p className="text-[11px] font-semibold text-rose-600">{batch.failedToHatch || 0}</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-slate-500">Hatch Rate</p>
                              <p className="text-[11px] font-semibold text-indigo-600">{(batch.hatchRate || 0).toFixed(1)}%</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-slate-500">Added to Inventory</p>
                              <p className="text-[11px] font-semibold text-sky-600">{batch.hatchedEggs || 0}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* AI Recommendation Section - Collapsible */}
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setShowRecommendations(prev => ({
                              ...prev,
                              [batch.id]: !prev[batch.id],
                            }));
                          }}
                          className="group inline-flex w-full items-center justify-between gap-2 rounded-2xl bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-pink-50/40 px-4 py-2.5 ring-1 ring-indigo-100/80 transition hover:bg-gradient-to-r hover:from-indigo-50 hover:via-purple-50 hover:to-pink-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                        >
                          <div className="flex items-center gap-2">
                            <div className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                              </svg>
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
                              AI Recommendation
                            </p>
                          </div>
                          <svg 
                            className={`h-4 w-4 text-indigo-600 transition-transform duration-200 ${showRecommendations[batch.id] ? 'rotate-180' : ''}`}
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {/* Expanded Content */}
                        {showRecommendations[batch.id] && (
                          <div className="mt-2 rounded-2xl bg-gradient-to-br from-indigo-50/80 via-purple-50/60 to-pink-50/40 px-4 py-3 ring-1 ring-indigo-100/80 backdrop-blur-sm">
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wide">Temperature</span>
                                  <span className="text-[11px] font-semibold text-slate-900">{getAIRecommendation(batch.eggType).temperature}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wide">Humidity</span>
                                  <span className="text-[11px] font-semibold text-slate-900">{getAIRecommendation(batch.eggType).humidity}</span>
                                </div>
                              </div>
                              
                              <div className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-indigo-50/50">
                                <p className="text-[10px] leading-relaxed text-slate-700">
                                  {getAIRecommendation(batch.eggType).text}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
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
                    <div className="text-[11px] font-medium text-slate-400">
                      {filteredBatches.length} total
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Per page
                    </label>
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
                <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                  Incubation Tip
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Ensure that the Egg Turner is active for batches under 18 days to prevent embryo sticking.
                </p>
              </div>
            </div>
          </section>

          {isModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeModal();
              }}
            >
              <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-br from-white/80 via-white/70 to-white/60 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.65)] ring-1 ring-slate-200/70 backdrop-blur-xl">
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-200/35 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-emerald-200/25 blur-3xl" />

                <div className="relative px-5 pt-5">
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 ring-1 ring-slate-200/60">
                    New Incubation Batch
                  </div>

                  <div className="mt-5 space-y-3.5">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Batch ID / Name
                      </label>
                      <input
                        value={batchId}
                        onChange={(e) => setBatchId(e.target.value)}
                        placeholder="e.g. 2026-003"
                        className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Egg Type
                      </label>
                      <select
                        value={eggType}
                        onChange={(e) => setEggType(e.target.value)}
                        className="w-full appearance-none rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                      >
                        <option value="" disabled>
                          Select egg type
                        </option>
                        <option value="Chicken">Chicken</option>
                        <option value="Duck">Duck</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Total Eggs (pcs)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={totalEggs}
                        onChange={(e) => setTotalEggs(Number(e.target.value))}
                        className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:bg-white focus:ring-4 focus:ring-sky-500/15"
                      />
                    </div>

                    {saveError ? (
                      <div className="rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
                        {saveError}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="relative mt-5 flex gap-3 border-t border-slate-200/60 bg-white/50 px-5 py-4 backdrop-blur">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={isSaving}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateBatch}
                    disabled={isSaving}
                    className="inline-flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? "Saving..." : "Confirm"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

// Track Hatch Modal Component
function TrackHatchModal({ isOpen, onClose, batch, onSubmit, isSubmitting }) {
  const [eggsHatched, setEggsHatched] = useState(0);
  const [eggsFailed, setEggsFailed] = useState(0);
  const [hatchDate, setHatchDate] = useState(new Date().toISOString().split("T")[0]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen && batch) {
      setEggsHatched(Number(batch.hatchedEggs || 0));
      setEggsFailed(Number(batch.failedToHatch || 0));
      const hatch = batch.hatchingDate?.toDate ? batch.hatchingDate.toDate() : new Date();
      setHatchDate(hatch.toISOString().split("T")[0]);
      setError("");
    }
  }, [isOpen, batch]);

  const handleSubmit = () => {
    const hatched = Number(eggsHatched);
    const failed = Number(eggsFailed);
    const total = Number(batch.totalEggs || 0);

    if (!Number.isFinite(hatched) || hatched < 0) {
      setError("Please enter valid number of hatched eggs.");
      return;
    }

    if (!Number.isFinite(failed) || failed < 0) {
      setError("Please enter valid number of failed eggs.");
      return;
    }

    if (hatched + failed !== total) {
      setError(`Total must equal ${total}. Current: ${hatched + failed}`);
      return;
    }

    onSubmit({ eggsHatched: hatched, eggsFailed: failed, hatchDate });
  };

  if (!isOpen || !batch) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-gradient-to-br from-white/80 via-white/70 to-white/60 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.65)] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-sky-200/25 blur-3xl" />

        <div className="relative px-5 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 ring-1 ring-emerald-100">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Record Hatch Results
              </div>
              <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                BATCH-{batch.batchId}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Total Eggs: {batch.totalEggs} • {batch.eggType}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-white/70 text-slate-700 ring-1 ring-slate-200/70 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Hatch Progress
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Eggs Hatched:</span>
                  <p className="text-base font-semibold text-emerald-600">{eggsHatched}</p>
                </div>
                <div>
                  <span className="text-slate-500">Remaining:</span>
                  <p className="text-base font-semibold text-slate-700">
                    {Number(batch.totalEggs || 0) - eggsHatched - eggsFailed}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Total Eggs Hatched *
                </label>
                <input
                  type="number"
                  min={0}
                  value={eggsHatched}
                  onChange={(e) => setEggsHatched(Number(e.target.value))}
                  placeholder="e.g. 82"
                  className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/90 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Failed to Hatch *
                </label>
                <input
                  type="number"
                  min={0}
                  value={eggsFailed}
                  onChange={(e) => setEggsFailed(Number(e.target.value))}
                  placeholder="e.g. 18"
                  className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-rose-300/90 focus:bg-white focus:ring-4 focus:ring-rose-500/15"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Hatch Date *
              </label>
              <input
                type="date"
                value={hatchDate}
                onChange={(e) => setHatchDate(e.target.value)}
                className="w-full rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/90 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
              />
            </div>

            <div className="rounded-2xl bg-indigo-50 px-4 py-3 ring-1 ring-indigo-100">
              <p className="text-xs text-indigo-900">
                <strong>Note:</strong> When you confirm, {eggsHatched} chicks will be automatically added to Chick Inventory and available for sale.
              </p>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="relative mt-5 flex gap-3 border-t border-slate-200/60 bg-white/50 px-5 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete Hatch & Add to Inventory"}
          </button>
        </div>
      </div>
    </div>
  );
}
