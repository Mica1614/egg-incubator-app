// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  increment,
  writeBatch,
} from "firebase/firestore";
import { firestore, auth } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import {
  Camera,
  CameraOff,
  ScanLine,
  Loader2,
  Database,
  Upload,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  RotateCcw,
  History,
  Trash2,
  Package,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Activity,
  Microscope,
  BarChart3,
  X,
  Circle,
  HelpCircle,
  Lightbulb,
  Bell,
  WifiOff,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

/* ─── helpers ──────────────────────────────────────────────────────────── */

function FeatureChip({ label, value, sub }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-white/70 p-3 ring-1 ring-slate-200/70">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm font-bold text-slate-800">{value}</span>
      {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
    </div>
  );
}

function Accordion({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl ring-1 ring-slate-200/70 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 bg-white/60 px-4 py-3 text-left text-xs font-semibold text-slate-700 hover:bg-white/80 transition"
      >
        <span className="flex items-center gap-2">{icon}{title}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
      </button>
      {open && <div className="border-t border-slate-100 bg-white/40 px-4 py-3">{children}</div>}
    </div>
  );
}

/* egg-type prefix map */
const EGG_TYPE_PREFIX = {
  chicken: "CK", duck: "DK", quail: "QL", goose: "GS", turkey: "TK",
};

/* candling schedule per egg type (days) */
const CANDLING_SCHEDULES = {
  chicken: [7, 14, 18],
  duck: [7, 18, 25],
  quail: [5, 12, 15],
  goose: [7, 14, 21],
  turkey: [7, 14, 21],
};

function getCandlingSchedule(eggType) {
  return CANDLING_SCHEDULES[String(eggType || "").toLowerCase()] || CANDLING_SCHEDULES.chicken;
}

function calculateNextCandling(incubationDay, startDate, eggType) {
  const schedule = getCandlingSchedule(eggType);
  const next = schedule.find((d) => d > incubationDay);
  if (!next) return null;
  const sd = startDate instanceof Date ? startDate : new Date(startDate);
  const date = new Date(sd);
  date.setDate(date.getDate() + next);
  return {
    date,
    day: next,
    name: `Day ${next} Candling`,
    daysUntil: Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24)),
  };
}

/* ─── status helpers ──────────────────────────────────────────────────── */

const STATUS_COLORS = {
  fertile:   { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-800", badge: "bg-emerald-600" },
  dead:      { bg: "bg-rose-50",    ring: "ring-rose-200",    text: "text-rose-800",    badge: "bg-rose-600" },
  infertile: { bg: "bg-slate-50",   ring: "ring-slate-200",   text: "text-slate-700",   badge: "bg-slate-500" },
  unknown:   { bg: "bg-amber-50",   ring: "ring-amber-200",   text: "text-amber-800",   badge: "bg-amber-500" },
};

function statusKey(layer1) {
  if (!layer1) return "unknown";
  const l = layer1.toLowerCase();
  if (l === "fertile") return "fertile";
  if (l === "dead") return "dead";
  if (l === "infertile") return "infertile";
  return "unknown";
}

function statusLabel(layer1) {
  if (!layer1) return "Unknown";
  const l = layer1.toLowerCase();
  if (l === "fertile") return "Developing Embryo";
  if (l === "dead") return "Dead Embryo";
  if (l === "infertile") return "Infertile Egg";
  return "Unknown";
}

function stageLabel(layer2) {
  if (!layer2) return null;
  return layer2.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusIcon({ layer1, className = "h-4 w-4" }) {
  const k = statusKey(layer1);
  if (k === "fertile") return <CheckCircle className={className} />;
  if (k === "dead") return <XCircle className={className} />;
  if (k === "infertile") return <Circle className={className} />;
  return <HelpCircle className={className} />;
}

function recommendation(layer1, layer2) {
  if (layer1 === "fertile") {
    const stage = stageLabel(layer2) || "developing";
    return `Egg is fertile and ${stage.toLowerCase()}. Continue incubation at 37.5°C, 40-50% humidity. Turn eggs 3-5 times daily if not automatic.`;
  }
  if (layer1 === "dead") {
    return "Dead embryo detected. Remove within 24-48 hours to prevent contamination of other eggs. Sanitize the slot.";
  }
  if (layer1 === "infertile") {
    return "Infertile egg — no embryo development detected. Remove to save incubator space.";
  }
  return "Unable to determine egg status. Try again with better lighting and a clearer image.";
}

/* ─── main component ──────────────────────────────────────────────────── */

export default function EggDetectorScannerPage() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("scan");

  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState("");
  const [scannerUnavailable, setScannerUnavailable] = useState(false);
  const [captureDataUrl, setCaptureDataUrl] = useState("");
  const [uploadedImage, setUploadedImage] = useState(null);
  const [annotatedImage, setAnnotatedImage] = useState("");

  // pendingScanData holds the inference result waiting for user to Accept
  const [pendingScanData, setPendingScanData] = useState(null);
  // The class the operator confirmed — seeded from the model's own call, so
  // Accept without touching anything still records an explicit agreement.
  const [correctedClass, setCorrectedClass] = useState(null);

  const [isInferring, setIsInferring] = useState(false);
  const [inferenceResult, setInferenceResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedBatchData, setSelectedBatchData] = useState(null);
  const [availableBatches, setAvailableBatches] = useState([]);
  const [batchEggCount, setBatchEggCount] = useState({ total: 0, scanned: 0, fertile: 0, infertile: 0, dead: 0 });
  const [candlingRound, setCandlingRound] = useState(1);

  const [showBatchSelectModal, setShowBatchSelectModal] = useState(false);
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const [showResetScanModal, setShowResetScanModal] = useState(false);
  const [isResettingScan, setIsResettingScan] = useState(false);
  const [nextCandlingDate, setNextCandlingDate] = useState(null);
  const [showNextCandlingModal, setShowNextCandlingModal] = useState(false);

  const [scanHistory, setScanHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PER_PAGE = 10;

  /* ── camera ─────────────────────────────────────────────────────────── */

  const stopCamera = useCallback(async () => {
    const stream = streamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setIsActive(false);
    setIsStarting(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    setScannerUnavailable(false);
    setCaptureDataUrl("");
    setUploadedImage(null);
    setInferenceResult(null);
    setAnnotatedImage("");
    setIsStarting(true);
    try {
      if (!navigator?.mediaDevices?.getUserMedia) throw new Error("Camera not supported in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        if (video.readyState < 1) await new Promise((r) => { video.onloadedmetadata = r; });
        try { await video.play(); } catch (_) {}
      }
      setIsActive(true);
    } catch (e) {
      setError(e?.message || "Unable to access camera.");
      await stopCamera();
    } finally {
      setIsStarting(false);
    }
  }, [stopCamera]);

  const handleReset = useCallback(() => {
    setCaptureDataUrl("");
    setUploadedImage(null);
    setInferenceResult(null);
    setAnnotatedImage("");
    setError("");
    setSaveError("");
    setScannerUnavailable(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  /* ── batch loading ───────────────────────────────────────────────────── */

  const loadBatches = useCallback(async () => {
    try {
      const qs = await getDocs(query(collection(firestore, "egg_batches"), orderBy("createdAt", "desc")));
      // Filter out completed batches — only show active ones for scanning
      const batches = qs.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((b) => b.status !== "completed");
      setAvailableBatches(batches);
      if (batches.length === 0) {
        setError("No active batches found. Please create a batch first in Egg Batches.");
      } else {
        setShowBatchSelectModal(true);
      }
    } catch (err) { console.error("Failed to load batches:", err); setError("Failed to load batches. Please try again."); }
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const loadBatchEggCount = useCallback(async (batchId) => {
    try {
      const qs = await getDocs(query(collection(firestore, "egg_scans"), where("batchId", "==", batchId)));
      let scanned = 0, fertile = 0, infertile = 0, dead = 0;
      qs.forEach((d) => {
        scanned++;
        const l1 = d.data().layer1_class || "";
        if (l1 === "fertile") fertile++;
        else if (l1 === "infertile") infertile++;
        else if (l1 === "dead") dead++;
      });
      const batchDoc = await getDoc(doc(firestore, "egg_batches", batchId));
      const totalEggs = batchDoc.exists() ? (batchDoc.data().totalEggs || 0) : 0;
      const lastCandling = batchDoc.exists() ? batchDoc.data().lastCandlingDate : null;
      let round = 1;
      if (lastCandling) {
        const lastDate = lastCandling.toDate ? lastCandling.toDate() : new Date(lastCandling);
        if ((new Date() - lastDate) / (1000 * 60 * 60 * 24) >= 7) round = 2;
      }
      setCandlingRound(round);
      setBatchEggCount({ total: totalEggs, scanned, fertile, infertile, dead });
    } catch (err) { console.error("Failed to load batch egg count:", err); }
  }, []);

  useEffect(() => { if (selectedBatch) loadBatchEggCount(selectedBatch); }, [selectedBatch, loadBatchEggCount]);

  /* ── reset all scans for current batch ─────────────────────────────── */

  const handleResetScanBatch = useCallback(async () => {
    if (!selectedBatch) return;
    setIsResettingScan(true);
    try {
      const qs = await getDocs(query(collection(firestore, "egg_scans"), where("batchId", "==", selectedBatch)));
      const batch = writeBatch(firestore);
      qs.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      // Reset egg counts on the batch document
      await updateDoc(doc(firestore, "egg_batches", selectedBatch), {
        deadEggs: 0,
        infertileEggs: 0,
        lastCandlingDate: null,
        lastCandlingResult: null,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      loadBatchEggCount(selectedBatch);
    } catch (err) {
      console.error("Failed to reset scan batch:", err);
    } finally {
      setIsResettingScan(false);
      setShowResetScanModal(false);
    }
  }, [selectedBatch, loadBatchEggCount]);

  /* ── candling reminder ───────────────────────────────────────────────── */

  const createCandlingReminder = useCallback(async (nextCandling, batchId, batchName) => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const daysUntil = nextCandling.daysUntil;
      let title, message, tone;
      if (daysUntil <= 1) { title = "Candling Check Tomorrow!"; message = `Batch "${batchName}" needs candling tomorrow (${nextCandling.name}).`; tone = "danger"; }
      else if (daysUntil <= 3) { title = `Candling Check in ${daysUntil} Days`; message = `Batch "${batchName}" — ${nextCandling.name} on ${nextCandling.date.toLocaleDateString()}.`; tone = "warning"; }
      else { title = "Upcoming Candling Check"; message = `${nextCandling.name} for "${batchName}" on ${nextCandling.date.toLocaleDateString()} (${daysUntil} days).`; tone = "info"; }
      await addDoc(collection(firestore, "users", user.uid, "notifications"), {
        title, message, tone,
        type: "candling_reminder",
        batchId, nextCandlingDate: nextCandling.date, nextCandlingDay: nextCandling.day, daysUntil,
        createdAt: serverTimestamp(), read: false,
      });
    } catch (err) { console.error("Failed to create candling reminder:", err); }
  }, []);

  /* ── scan history ────────────────────────────────────────────────────── */

  const loadScanHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const qs = await getDocs(query(collection(firestore, "egg_scans"), orderBy("createdAt", "desc")));
      setScanHistory(qs.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id, ...data,
          scannedAt: data.createdAt?.toDate?.() || new Date(),
          label: statusLabel(data.layer1_class),
          layer1_class: data.layer1_class || null,
          layer2_class: data.layer2_class || null,
          layer1_confidence: data.layer1_confidence || null,
        };
      }));
      setHistoryPage(1);
      setActiveTab("history");
    } catch (err) { setError("Failed to load scan history: " + err.message); }
    finally { setIsLoadingHistory(false); }
  }, []);

  const clearScanHistory = useCallback(async () => {
    setScanHistory([]);
    setShowClearHistoryModal(false);
  }, []);

  /* ── save scan to Firestore ─────────────────────────────────────────── */

  const saveScanToFirebase = useCallback(async (scanData, confirmedClass) => {
    const { layer1_class, layer2_class, layer1_confidence, layer2_confidence, annotation_label, imageDataUrl } = scanData;

    // What the model said, versus what the operator confirmed. Storing both is
    // what makes accuracy measurable; the confirmed class is the one that counts.
    const predictedClass = statusKey(layer1_class);
    const finalClass = confirmedClass || predictedClass;
    const wasCorrected = finalClass !== predictedClass;

    setIsSaving(true);
    try {
      // Save scan record
      await addDoc(collection(firestore, "egg_scans"), {
        createdAt: serverTimestamp(),
        batchId: selectedBatch || null,
        candlingRound,
        layer1_class,
        layer2_class: layer2_class || null,
        layer1_confidence: layer1_confidence || null,
        layer2_confidence: layer2_confidence || null,
        annotation_label: annotation_label || null,
        imageDataUrl: imageDataUrl || null,
        predictedClass,
        finalClass,
        wasCorrected,
        status: statusLabel(finalClass),
        scanType: "embryo_development",
      });

      // Deduct against the CONFIRMED class, not the model's guess — otherwise a
      // corrected scan still moves the batch counts the wrong way.
      if (selectedBatch && (finalClass === "dead" || finalClass === "infertile")) {
        const field = finalClass === "dead" ? "deadEggs" : "infertileEggs";
        await updateDoc(doc(firestore, "egg_batches", selectedBatch), {
          [field]: increment(1),
          lastCandlingDate: new Date(),
          lastCandlingResult: statusLabel(finalClass),
          candlingRound,
          updatedAt: serverTimestamp(),
        });
      } else if (selectedBatch) {
        await updateDoc(doc(firestore, "egg_batches", selectedBatch), {
          lastCandlingDate: new Date(),
          lastCandlingResult: statusLabel(finalClass),
          candlingRound,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      if (selectedBatch) loadBatchEggCount(selectedBatch);
    } catch (err) {
      console.error("Failed to save scan:", err);
      setSaveError("Scan completed but failed to save to database.");
    } finally {
      setIsSaving(false);
    }
  }, [selectedBatch, candlingRound, loadBatchEggCount]);

  /* ── run inference ───────────────────────────────────────────────────── */

  const runInference = useCallback(async (imageDataUrl) => {
    if (!imageDataUrl) { setError("Capture an image first."); return; }
    if (!selectedBatch) { setError("Please select an egg batch first."); loadBatches(); return; }

    setIsInferring(true);
    setError("");
    setSaveError("");
    setScannerUnavailable(false);
    setInferenceResult(null);
    setAnnotatedImage("");
    setPendingScanData(null);

    try {
      const res = await fetch("/api/egg-analyzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageDataUrl }),
      });

      if (res.status === 503) {
        setScannerUnavailable(true);
        setIsInferring(false);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Analysis failed");

      setInferenceResult(data);
      if (data.annotated_image) setAnnotatedImage(data.annotated_image);
      setActiveTab("results");

      // Store pending scan data — will be saved only when user clicks Accept
      setPendingScanData({
        layer1_class: data.layer1_class,
        layer2_class: data.layer2_class,
        layer1_confidence: data.layer1_confidence,
        layer2_confidence: data.layer2_confidence,
        annotation_label: data.annotation_label,
        imageDataUrl,
      });
      // Pre-select the model's answer so Accept means "I agree", not "I skipped".
      setCorrectedClass(statusKey(data.layer1_class));

      // Schedule next candling notification
      const batchData = availableBatches.find((b) => b.id === selectedBatch);
      if (batchData?.startDate) {
        const sd = batchData.startDate.toDate ? batchData.startDate.toDate() : new Date(batchData.startDate);
        const incDay = Math.floor((new Date() - sd) / (1000 * 60 * 60 * 24));
        const nextCandling = calculateNextCandling(incDay, sd, batchData.eggType || "chicken");
        if (nextCandling) {
          setNextCandlingDate(nextCandling);
          setShowNextCandlingModal(true);
          const batchName = batchData.batchId || batchData.id;
          createCandlingReminder(nextCandling, selectedBatch, batchName).catch(() => {});
          updateDoc(doc(firestore, "egg_batches", selectedBatch), {
            nextCandlingDate: nextCandling.date, nextCandlingDay: nextCandling.day,
          }).catch(() => {});
        }
      }

      await stopCamera();
    } catch (e) {
      setError(e?.message || "Analysis failed");
    } finally {
      setIsInferring(false);
    }
  }, [selectedBatch, availableBatches, loadBatches, stopCamera, createCandlingReminder]);

  const captureFrame = useCallback(() => {
    setError("");
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) { setError("Camera not ready."); return; }
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCaptureDataUrl(dataUrl);
    runInference(dataUrl);
  }, [runInference]);

  const handleImageUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setInferenceResult(null); setAnnotatedImage("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (dataUrl) { setUploadedImage(dataUrl); runInference(dataUrl); }
    };
    reader.readAsDataURL(file);
  }, [runInference]);

  const triggerFileInput = useCallback(() => fileInputRef.current?.click(), []);

  /* recheck — clears result, keeps image, does NOT save */
  const handleRecheck = useCallback(() => {
    setInferenceResult(null);
    setAnnotatedImage("");
    setError("");
    setSaveError("");
    setScannerUnavailable(false);
    setPendingScanData(null);
    setCorrectedClass(null);
    setActiveTab("scan");
  }, []);

  /* accept — saves the pending scan, increments count, resets for next egg */
  const handleAccept = useCallback(async () => {
    if (!pendingScanData) { handleReset(); setActiveTab("scan"); return; }
    setIsSaving(true);
    try {
      await saveScanToFirebase(pendingScanData, correctedClass);
    } finally {
      setPendingScanData(null);
      setCorrectedClass(null);
      handleReset();
      setActiveTab("scan");
    }
  }, [pendingScanData, correctedClass, saveScanToFirebase, handleReset]);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  /* ── tabs ────────────────────────────────────────────────────────────── */

  const TABS = [
    { id: "scan",    label: "Scan",    icon: <Camera className="h-3.5 w-3.5" /> },
    { id: "results", label: "Results", icon: <Microscope className="h-3.5 w-3.5" />, badge: !!inferenceResult },
    { id: "history", label: "History", icon: <History className="h-3.5 w-3.5" /> },
  ];

  const currentImageSrc = uploadedImage || captureDataUrl;

  /* ── render ──────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-5xl items-start gap-4 px-3 py-4 sm:gap-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-4 min-w-0">
          <TopBar title="Egg Scanner" onOpenSidebar={() => setIsSidebarOpen(true)} />

          {/* header card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/70 via-white/55 to-white/40 px-5 py-4 shadow-sm ring-1 ring-slate-200/60 backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-sky-200/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-emerald-200/30 blur-3xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow">
                  <ScanLine className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-base font-semibold tracking-tight text-slate-900">AI Egg Scanner</h1>
                  <p className="text-[11px] text-slate-500">Embryo candling analysis via AI</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isInferring ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white">
                    <Loader2 className="h-3 w-3 animate-spin" />Analyzing
                  </span>
                ) : isSaving ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white">
                    <Database className="h-3 w-3" />Saving
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Ready
                  </span>
                )}
              </div>
            </div>

            {/* batch bar */}
            <div className="relative mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={loadBatches}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:from-emerald-700 hover:to-teal-700 transition"
              >
                <Package className="h-3.5 w-3.5" />
                {selectedBatch ? "Change Batch" : "Select Batch"}
              </button>
              {selectedBatch && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                  <Package className="h-3 w-3" />
                  {selectedBatchData?.batchId || selectedBatch}
                  {selectedBatchData?.deviceName && (
                    <span className="ml-1 text-emerald-500">· {selectedBatchData.deviceName}</span>
                  )}
                </span>
              )}
              {selectedBatch && batchEggCount.total > 0 && (
                <span className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200">
                  <Activity className="h-3 w-3" />
                  {batchEggCount.scanned}/{batchEggCount.total} scanned
                  <span className="text-emerald-600">+{batchEggCount.fertile} fertile</span>
                  <span className="text-rose-600">-{batchEggCount.infertile + batchEggCount.dead} non-viable</span>
                </span>
              )}
              {candlingRound > 1 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700 ring-1 ring-amber-200">
                  <CalendarDays className="h-3 w-3" />Round {candlingRound}
                </span>
              )}
              {selectedBatch && (
                <button
                  onClick={() => setShowResetScanModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100 transition"
                  title="Reset all scans for this batch"
                >
                  <RotateCcw className="h-3 w-3" />Reset Scans
                </button>
              )}
            </div>
          </div>

          {/* scanner unavailable banner */}
          {scannerUnavailable && (
            <div className="flex items-start gap-3 rounded-xl bg-rose-50 px-4 py-3 ring-1 ring-rose-200">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <div>
                <p className="text-xs font-semibold text-rose-800">Scanner not available</p>
                <p className="text-[11px] text-rose-600 mt-0.5">The AI analysis server is unreachable. Please start the Python server and try again.</p>
              </div>
            </div>
          )}

          {/* tabs */}
          <div className="flex gap-1 rounded-xl bg-white/60 p-1 ring-1 ring-slate-200/70 shadow-sm backdrop-blur">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === "history" && scanHistory.length === 0) loadScanHistory();
                }}
                className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  activeTab === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.icon}{tab.label}
                {tab.badge && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500" />
                )}
              </button>
            ))}
          </div>

          {/* ── SCAN TAB ────────────────────────────────────────────────── */}
          {activeTab === "scan" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 rounded-2xl bg-white/70 p-3 ring-1 ring-slate-200/70 shadow-sm backdrop-blur">
                <button
                  onClick={startCamera}
                  disabled={isStarting || isActive}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                    isActive || isStarting ? "bg-slate-100 text-slate-400" : "bg-gradient-to-r from-sky-600 to-indigo-600 text-white hover:from-sky-700 hover:to-indigo-700"
                  }`}
                >
                  <Camera className="h-3.5 w-3.5" />
                  {isStarting ? "Starting…" : "Camera"}
                </button>
                <button
                  onClick={stopCamera}
                  disabled={!isActive}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                    !isActive ? "bg-slate-100 text-slate-400" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <CameraOff className="h-3.5 w-3.5" />Stop
                </button>
                <button
                  onClick={captureFrame}
                  disabled={!isActive || isInferring}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                    !isActive || isInferring ? "bg-slate-100 text-slate-400" : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600"
                  }`}
                >
                  {isInferring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                  {isInferring ? "Scanning…" : "Capture"}
                </button>
                <button
                  onClick={triggerFileInput}
                  disabled={isInferring}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                    isInferring ? "bg-slate-100 text-slate-400" : "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700"
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />Upload
                </button>
                <button
                  onClick={handleReset}
                  disabled={isInferring || (!uploadedImage && !captureDataUrl && !inferenceResult)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                    isInferring || (!uploadedImage && !captureDataUrl && !inferenceResult) ? "bg-slate-100 text-slate-400" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  }`}
                >
                  <RefreshCw className="h-3.5 w-3.5" />Reset
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </div>

              {(error || saveError) && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700 ring-1 ring-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error || saveError}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-slate-200 shadow-sm">
                  <video ref={videoRef} playsInline muted autoPlay className={`h-full w-full object-cover ${isActive ? "block" : "hidden"}`} />
                  {!isActive && currentImageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentImageSrc} alt="Input" className="h-full w-full object-contain" />
                  ) : !isActive ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-4">
                      <ImageIcon className="h-8 w-8 text-white/40" />
                      <p className="text-xs text-white/50">Camera feed or uploaded image</p>
                    </div>
                  ) : null}
                  <span className="absolute left-2 top-2 rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">Input</span>
                  {isActive && (
                    <button
                      onClick={captureFrame}
                      disabled={isInferring}
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2 text-xs font-semibold text-slate-800 shadow-lg hover:bg-slate-100 transition disabled:opacity-50"
                    >
                      {isInferring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                      {isInferring ? "Scanning…" : "Scan Egg"}
                    </button>
                  )}
                </div>

                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200 shadow-sm">
                  {currentImageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentImageSrc} alt="Preview" className="h-full w-full object-contain" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <ScanLine className="h-8 w-8 text-slate-300" />
                      <p className="text-xs text-slate-400">Preview appears here</p>
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded-md bg-black/10 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-black/5">Preview</span>
                  {isInferring && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
                      <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                    </div>
                  )}
                </div>
              </div>

              <canvas ref={canvasRef} className="hidden" />

              {inferenceResult && (
                <button
                  onClick={() => setActiveTab("results")}
                  className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-3 text-left ring-1 ring-slate-200/70 shadow-sm hover:bg-white transition"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-white ${STATUS_COLORS[statusKey(inferenceResult.layer1_class)]?.badge}`}>
                      <StatusIcon layer1={inferenceResult.layer1_class} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{statusLabel(inferenceResult.layer1_class)}</p>
                      <p className="text-[10px] text-slate-500">{inferenceResult.layer1_confidence?.toFixed(1)}% confidence — tap to view details</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              )}
            </div>
          )}

          {/* ── RESULTS TAB ─────────────────────────────────────────────── */}
          {activeTab === "results" && (
            <div className="flex flex-col gap-3">
              {!inferenceResult ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/60 py-12 ring-1 ring-slate-200/60 text-center">
                  <Microscope className="h-10 w-10 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">No scan results yet</p>
                  <p className="text-xs text-slate-400">Go to the Scan tab to capture or upload an egg image</p>
                  <button onClick={() => setActiveTab("scan")} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition">
                    <Camera className="h-3.5 w-3.5" />Go to Scan
                  </button>
                </div>
              ) : (() => {
                const sc = STATUS_COLORS[statusKey(inferenceResult.layer1_class)];
                const stage = stageLabel(inferenceResult.layer2_class);
                return (
                  <>
                    {/* main result card */}
                    <div className={`rounded-2xl p-4 ${sc.bg} ring-1 ${sc.ring}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Scan Result</p>
                          <p className={`text-xl font-bold ${sc.text}`}>{statusLabel(inferenceResult.layer1_class)}</p>
                          {stage && <p className="mt-0.5 text-sm font-semibold text-slate-600">{stage}</p>}
                          <p className="mt-1 text-xs text-slate-500">{inferenceResult.annotation_label}</p>
                        </div>
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white ${sc.badge}`}>
                          <StatusIcon layer1={inferenceResult.layer1_class} className="h-6 w-6" />
                        </div>
                      </div>

                      {/* confidence chips */}
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <FeatureChip label="Condition" value={inferenceResult.layer1_class?.toUpperCase() || "—"} sub={`${inferenceResult.layer1_confidence?.toFixed(1) ?? "—"}% confidence`} />
                        {stage && <FeatureChip label="Stage" value={stage} sub={`${inferenceResult.layer2_confidence?.toFixed(1) ?? "—"}% confidence`} />}
                        <FeatureChip
                          label="Batch"
                          value={selectedBatchData?.batchId || selectedBatch || "—"}
                          sub={selectedBatchData?.deviceName || undefined}
                        />
                      </div>
                    </div>

                    {/* recommendation */}
                    <div className="rounded-xl bg-white/70 px-4 py-3 ring-1 ring-slate-200/70 shadow-sm">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <div>
                          <p className="text-xs font-semibold text-slate-900 mb-1">Recommendation</p>
                          <p className="text-xs leading-relaxed text-slate-700">{recommendation(inferenceResult.layer1_class, inferenceResult.layer2_class)}</p>
                        </div>
                      </div>
                    </div>

                    {/* image panel — prefer annotated (with bounding boxes) if server returned one, else show original */}
                    {(annotatedImage || captureDataUrl || uploadedImage) && (
                      <div className="rounded-xl bg-white/70 px-4 py-3 ring-1 ring-slate-200/70 shadow-sm">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {annotatedImage ? "Annotated Image" : "Captured Image"}
                        </p>
                        <img
                          src={annotatedImage ? `data:image/jpeg;base64,${annotatedImage}` : (captureDataUrl || uploadedImage)}
                          alt={annotatedImage ? "Annotated egg scan" : "Captured egg"}
                          className="w-full rounded-lg object-contain max-h-64"
                        />
                      </div>
                    )}

                    {/* probability breakdown */}
                    {inferenceResult.layer1_probs && (
                      <Accordion title="Probability Breakdown" icon={<BarChart3 className="h-3.5 w-3.5 text-slate-500" />}>
                        <div className="space-y-2">
                          {Object.entries(inferenceResult.layer1_probs).map(([cls, prob]) => (
                            <div key={cls} className="flex items-center gap-3">
                              <span className="w-20 shrink-0 capitalize text-xs text-slate-600">{cls}</span>
                              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${Math.round(prob)}%` }} />
                              </div>
                              <span className="w-10 text-right text-xs font-semibold text-slate-700">{Math.round(prob)}%</span>
                            </div>
                          ))}
                        </div>
                        {inferenceResult.layer2_probs && (
                          <>
                            <p className="mt-3 mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Stage Probabilities</p>
                            <div className="space-y-2">
                              {Object.entries(inferenceResult.layer2_probs).map(([cls, prob]) => (
                                <div key={cls} className="flex items-center gap-3">
                                  <span className="w-24 shrink-0 capitalize text-xs text-slate-600">{cls.replace(/_/g, " ")}</span>
                                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${Math.round(prob)}%` }} />
                                  </div>
                                  <span className="w-10 text-right text-xs font-semibold text-slate-700">{Math.round(prob)}%</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </Accordion>
                    )}

                    {/* ── Verify the model's call ──────────────────────────
                        Until now the only option was Accept, so a wrong
                        prediction could never be corrected — and with no ground
                        truth recorded, model accuracy was unmeasurable. */}
                    <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Confirm the result
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        If the model got it wrong, pick the correct result. Your choice is what gets
                        saved and counted, and it lets the app measure how accurate the model really is.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {["fertile", "dead", "infertile"].map((cls) => {
                          const isPredicted = statusKey(inferenceResult.layer1_class) === cls;
                          const isChosen = correctedClass === cls;
                          return (
                            <button
                              key={cls}
                              type="button"
                              onClick={() => setCorrectedClass(cls)}
                              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold ring-1 transition ${
                                isChosen
                                  ? "bg-[#004a87] text-white ring-[#004a87]"
                                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-100"
                              }`}
                            >
                              {statusLabel(cls)}
                              {isPredicted && (
                                <span className={`text-[9px] font-bold ${isChosen ? "text-sky-200" : "text-slate-400"}`}>
                                  AI
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {correctedClass && statusKey(inferenceResult.layer1_class) !== correctedClass && (
                        <p className="mt-2 text-[11px] font-medium text-amber-700">
                          Recorded as a correction — the model said{" "}
                          {statusLabel(inferenceResult.layer1_class)}.
                        </p>
                      )}
                    </div>

                    {/* action row */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleRecheck}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-50 py-2.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 transition"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />Recheck
                      </button>
                      <button
                        onClick={handleAccept}
                        disabled={isSaving}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-60"
                      >
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        {isSaving ? "Saving…" : correctedClass && statusKey(inferenceResult.layer1_class) !== correctedClass ? "Save Correction" : "Accept"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* ── HISTORY TAB ─────────────────────────────────────────────── */}
          {activeTab === "history" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600">{scanHistory.length} scan{scanHistory.length !== 1 ? "s" : ""} recorded</p>
                <div className="flex gap-2">
                  <button
                    onClick={loadScanHistory}
                    disabled={isLoadingHistory}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 transition"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoadingHistory ? "animate-spin" : ""}`} />Refresh
                  </button>
                  {scanHistory.length > 0 && (
                    <button
                      onClick={() => setShowClearHistoryModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100 transition"
                    >
                      <Trash2 className="h-3 w-3" />Clear
                    </button>
                  )}
                </div>
              </div>

              {isLoadingHistory ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading history…
                </div>
              ) : scanHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/60 py-12 text-center ring-1 ring-slate-200/60">
                  <History className="h-10 w-10 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">No scans recorded yet</p>
                  <p className="text-xs text-slate-400">Your egg scans will appear here after analysis</p>
                </div>
              ) : (() => {
                const historyTotalPages = Math.max(1, Math.ceil(scanHistory.length / HISTORY_PER_PAGE));
                const safeHistoryPage = Math.min(Math.max(1, historyPage), historyTotalPages);
                const pagedHistory = scanHistory.slice((safeHistoryPage - 1) * HISTORY_PER_PAGE, safeHistoryPage * HISTORY_PER_PAGE);
                return (
                  <>
                    <div className="space-y-2">
                      {pagedHistory.map((scan) => {
                        const sc = STATUS_COLORS[statusKey(scan.layer1_class)];
                        const date = scan.scannedAt instanceof Date ? scan.scannedAt : new Date(scan.scannedAt);
                        const stage = stageLabel(scan.layer2_class);
                        return (
                          <div key={scan.id} className={`rounded-xl px-4 py-3 ring-1 ${sc.ring} ${sc.bg}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white ${sc.badge}`}>
                                  <StatusIcon layer1={scan.layer1_class} className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-xs font-semibold ${sc.text} truncate`}>{scan.label}</p>
                                  <p className="text-[10px] text-slate-500 truncate">
                                    {stage ? `${stage} · ` : ""}{scan.layer1_confidence ? `${scan.layer1_confidence.toFixed(1)}%` : ""}
                                  </p>
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-[10px] font-medium text-slate-500">{date.toLocaleDateString()}</p>
                                <p className="text-[10px] text-slate-400">{date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                              </div>
                            </div>
                            {scan.annotation_label && (
                              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{scan.annotation_label}</p>
                            )}
                            {scan.batchId && (
                              <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400">
                                <Package className="h-3 w-3" />Batch: {scan.batchId.substring(0, 16)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {historyTotalPages > 1 && (
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-400">{scanHistory.length} total scans</p>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setHistoryPage(1)} disabled={safeHistoryPage === 1} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition">
                            <ChevronsLeft className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={safeHistoryPage === 1} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition">
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <span className="px-2 text-[11px] font-semibold text-slate-600">{safeHistoryPage} / {historyTotalPages}</span>
                          <button onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))} disabled={safeHistoryPage === historyTotalPages} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition">
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setHistoryPage(historyTotalPages)} disabled={safeHistoryPage === historyTotalPages} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition">
                            <ChevronsRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </main>
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────── */}

      {/* Reset Scan Batch Confirm Modal */}
      {showResetScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <RotateCcw className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">Reset Scan Data?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              All scan records for batch <strong>{selectedBatchData?.batchId || selectedBatch}</strong> will be permanently deleted and egg counts reset to zero. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowResetScanModal(false)} disabled={isResettingScan} className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button onClick={handleResetScanBatch} disabled={isResettingScan} className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                {isResettingScan ? "Resetting…" : "Reset"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear History Confirm Modal */}
      {showClearHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">Clear Scan History?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">All scan records will be removed from this view. This cannot be undone.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowClearHistoryModal(false)} className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={clearScanHistory} className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700">Clear</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Select Modal */}
      {showBatchSelectModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Select Egg Batch</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Choose the batch to link this scan to</p>
              </div>
              <button onClick={() => setShowBatchSelectModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto mb-4">
              {availableBatches.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Package className="h-8 w-8 text-slate-300" />
                  <p className="text-xs font-medium text-slate-600">No batches found</p>
                  <p className="text-[11px] text-slate-500">Create a batch in Egg Batches first</p>
                </div>
              ) : (
                availableBatches.map((batch) => {
                  const sd = batch.startDate?.toDate ? batch.startDate.toDate() : batch.startDate ? new Date(batch.startDate) : batch.createdAt?.toDate ? batch.createdAt.toDate() : new Date();
                  const incDay = Math.floor((new Date() - sd) / (1000 * 60 * 60 * 24));
                  const totalDays = batch.incubationDays || (String(batch.eggType).toLowerCase() === "duck" ? 28 : 21);
                  return (
                    <button
                      key={batch.id}
                      onClick={() => {
                        setSelectedBatch(batch.id);
                        setSelectedBatchData(batch);
                        setShowBatchSelectModal(false);
                      }}
                      className="w-full rounded-xl border-2 border-slate-100 p-3 text-left hover:border-emerald-400 hover:bg-emerald-50 transition"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-900">{batch.batchId || batch.id}</p>
                        {batch.deviceName && (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-semibold text-sky-600 ring-1 ring-sky-100">{batch.deviceName}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{batch.eggType || "Chicken"} · Day {incDay} of {totalDays}</p>
                    </button>
                  );
                })
              )}
            </div>
            <button onClick={() => setShowBatchSelectModal(false)} className="w-full rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition">Cancel</button>
          </div>
        </div>
      )}

      {/* Next Candling Modal */}
      {showNextCandlingModal && nextCandlingDate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Next Candling Scheduled</h3>
                <p className="text-[11px] text-slate-500">{nextCandlingDate.name}</p>
              </div>
            </div>
            <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 ring-1 ring-blue-200 text-center">
              <p className="text-xl font-bold text-slate-900">{nextCandlingDate.date.toLocaleDateString()}</p>
              <p className="text-xs text-slate-500 mt-0.5">Day {nextCandlingDate.day} · {nextCandlingDate.daysUntil} days from now</p>
            </div>
            <p className="mb-4 text-[11px] leading-relaxed text-slate-600">A reminder notification has been saved. You will be notified when it is time for the next candling check.</p>
            <button onClick={() => setShowNextCandlingModal(false)} className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 transition">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
