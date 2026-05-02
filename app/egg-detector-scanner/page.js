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
  doc,
} from "firebase/firestore";
import { firestore, auth } from "@/lib/firebase";
import { EmbryoAnalysisSystem } from "@/lib/embryoAnalysis";
import { EggCandlingAnalyzer } from "@/lib/eggCandlingAnalysis";
import {
  EmbryoLifeDetector,
  extractCandlingObservations,
  extractEnvironmentalData,
} from "@/lib/embryoLifeDetector";
import { AIDecisionEngine } from "@/lib/aiDecisionEngine";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import {
  Camera,
  CameraOff,
  ScanLine,
  Loader2,
  Sparkles,
  Database,
  Upload,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
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
} from "lucide-react";

/* helpers */

function normalizeWorkflowResponse(result) {
  if (!result) return { outputImageBase64: "", predictions: [] };
  const root = Array.isArray(result) ? result[0] : result;
  const outputs = Array.isArray(root?.outputs)
    ? root.outputs
    : Array.isArray(result)
    ? result
    : [root];
  const first =
    outputs.find(
      (o) =>
        o &&
        (o.output_image ||
          o["output_image"] ||
          o["output image"] ||
          o.predictions)
    ) || outputs[0];
  const outputImage =
    first?.output_image ||
    first?.["output_image"] ||
    first?.["output image"] ||
    null;
  const outputImageBase64 =
    typeof outputImage?.value === "string" ? outputImage.value : "";
  const predictionsObj =
    first?.predictions || first?.detection_predictions || null;
  const predictions = Array.isArray(predictionsObj?.predictions)
    ? predictionsObj.predictions
    : Array.isArray(predictionsObj)
    ? predictionsObj
    : [];
  return { outputImageBase64, predictions };
}

function FeatureChip({ label, detected, detail }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-white/70 p-3 ring-1 ring-slate-200/70">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className={`text-sm font-bold ${detected ? "text-emerald-600" : "text-slate-400"}`}>
        {detected ? "Detected" : "Not found"}
      </span>
      {detail && <span className="text-[10px] text-slate-500">{detail}</span>}
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

/* main component */

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
  const [captureDataUrl, setCaptureDataUrl] = useState("");
  const [uploadedImage, setUploadedImage] = useState(null);

  const [isInferring, setIsInferring] = useState(false);
  const [inferenceResult, setInferenceResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [aiDecisionResult, setAiDecisionResult] = useState(null);
  const [showAdvancedAnalysis, setShowAdvancedAnalysis] = useState(false);

  const [batchStartDate, setBatchStartDate] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedBatchData, setSelectedBatchData] = useState(null);
  const [availableBatches, setAvailableBatches] = useState([]);
  const [batchEggCount, setBatchEggCount] = useState({ total: 0, scanned: 0, fertile: 0, infertile: 0, dead: 0 });
  const [candlingRound, setCandlingRound] = useState(1);
  const [previousCandlingNotes, setPreviousCandlingNotes] = useState("");

  const [showBatchSelectModal, setShowBatchSelectModal] = useState(false);
  const [showEggPositionModal, setShowEggPositionModal] = useState(false);
  const [pendingScanForPosition, setPendingScanForPosition] = useState(null);
  const [eggPosition, setEggPosition] = useState("");
  const [showStartDateModal, setShowStartDateModal] = useState(false);
  const [pendingScanData, setPendingScanData] = useState(null);
  const [nextCandlingDate, setNextCandlingDate] = useState(null);
  const [showNextCandlingModal, setShowNextCandlingModal] = useState(false);

  const [scanHistory, setScanHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const normalizedWorkflow = normalizeWorkflowResponse(inferenceResult);
  const modelPredictions = normalizedWorkflow.predictions;
  const detectionCount = modelPredictions.length;
  const topClass = modelPredictions?.[0]?.class || "None";
  const topConfidence =
    typeof modelPredictions?.[0]?.confidence === "number"
      ? modelPredictions[0].confidence
      : null;

  /* camera */

  const stopCamera = useCallback(async () => {
    const stream = streamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setIsActive(false);
    setIsStarting(false);
    setCaptureDataUrl("");
    setUploadedImage(null);
  }, []);

  const handleRefresh = useCallback(() => {
    setCaptureDataUrl("");
    setUploadedImage(null);
    setInferenceResult(null);
    setAnalysisResult(null);
    setAiDecisionResult(null);
    setError("");
    setSaveError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setActiveTab("scan");
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    setCaptureDataUrl("");
    setUploadedImage(null);
    setInferenceResult(null);
    setIsStarting(true);
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("Camera is not supported in this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // wait for metadata (gives browser time to decode dimensions)
        if (video.readyState < 1) {
          await new Promise((resolve) => {
            video.onloadedmetadata = resolve;
          });
        }
        try { await video.play(); } catch (_) { /* autoplay policy — already playing */ }
      }
      setIsActive(true);
    } catch (e) {
      setError(e?.message || "Unable to access camera.");
      await stopCamera();
    } finally {
      setIsStarting(false);
    }
  }, [stopCamera]);

  /* history */

  const loadScanHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const scansQuery = query(
        collection(firestore, "egg_scans"),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(scansQuery);
      const history = querySnapshot.docs.map((d) => {
        const data = d.data();
        const analysis = data.analysisResult || {};
        const candling = data.candlingAnalysis || {};
        const viability = candling.viability || {};
        return {
          id: d.id,
          ...data,
          status: analysis.status || "Unknown",
          eggType: analysis.eggType || "Unknown",
          confidence: analysis.confidence || "Unknown",
          observations: analysis.observations || "",
          topClass: data.topClass || "N/A",
          topConfidence: data.topConfidence ? `${(data.topConfidence * 100).toFixed(0)}%` : "N/A",
          scannedAt: data.createdAt?.toDate?.() || new Date(),
        };
      });
      setScanHistory(history);
      setActiveTab("history");
    } catch (err) {
      setError("Failed to load scan history: " + err.message);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const clearScanHistory = useCallback(async () => {
    if (!confirm("Clear all scan history? This cannot be undone.")) return;
    setScanHistory([]);
  }, []);

  /* batch loading */

  const loadBatches = useCallback(async () => {
    try {
      const batchesQuery = query(
        collection(firestore, "egg_batches"),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(batchesQuery);
      const batches = querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAvailableBatches(batches);
      if (batches.length > 0) setShowBatchSelectModal(true);
    } catch (err) {
      console.error("Failed to load batches:", err);
    }
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  useEffect(() => {
    if (selectedBatch) loadBatchEggCount(selectedBatch);
  }, [selectedBatch]);

  const loadBatchEggCount = useCallback(async (batchId) => {
    try {
      const scansQuery = query(collection(firestore, "egg_scans"), where("batchId", "==", batchId));
      const querySnapshot = await getDocs(scansQuery);
      let scanned = 0, fertile = 0, infertile = 0, dead = 0;
      querySnapshot.forEach((d) => {
        scanned++;
        const status = d.data().analysisResult?.status || "";
        if (status.includes("Developing") || status.includes("Fertile")) fertile++;
        else if (status.includes("Infertile")) infertile++;
        else if (status.includes("Dead")) dead++;
      });
      const batchDoc = await getDoc(doc(firestore, "egg_batches", batchId));
      const batchData = batchDoc.exists() ? batchDoc.data() : {};
      const totalEggs = batchData.totalEggs || 48;
      const lastCandling = batchData.lastCandlingDate;
      let round = 1, previousNotes = "";
      if (lastCandling) {
        const lastDate = lastCandling.toDate ? lastCandling.toDate() : new Date(lastCandling);
        const days = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
        if (days >= 7) {
          round = 2;
          previousNotes = `1st Candling: ${batchData.fertileCount || scanned} fertile, ${batchData.infertileCount || 0} infertile, ${batchData.deadCount || 0} dead.`;
        }
      }
      setCandlingRound(round);
      setPreviousCandlingNotes(previousNotes);
      setBatchEggCount({ total: totalEggs, scanned, fertile, infertile, dead });
    } catch (err) {
      console.error("Failed to load batch egg count:", err);
    }
  }, []);

  /* candling reminder */

  const createCandlingReminder = useCallback(async (nextCandling, batchId, batchName) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const daysUntil = nextCandling.daysUntil;
      let title, message, tone;
      if (daysUntil <= 1) {
        title = "Candling Check Tomorrow!";
        message = `Batch "${batchName}" needs embryo candling TOMORROW (Day ${nextCandling.day}).`;
        tone = "danger";
      } else if (daysUntil <= 3) {
        title = `Candling Check in ${daysUntil} Days`;
        message = `Batch "${batchName}" - ${nextCandling.name} on ${nextCandling.date.toLocaleDateString()}.`;
        tone = "warning";
      } else {
        title = "Upcoming Candling Check";
        message = `${nextCandling.name} for "${batchName}" on ${nextCandling.date.toLocaleDateString()} (${daysUntil} days).`;
        tone = "info";
      }
      await addDoc(collection(firestore, "users", currentUser.uid, "notifications"), {
        title, message, tone,
        type: "candling_reminder",
        batchId,
        nextCandlingDate: nextCandling.date,
        nextCandlingDay: nextCandling.day,
        nextCandlingName: nextCandling.name,
        daysUntil,
        createdAt: serverTimestamp(),
        read: false,
      });
    } catch (err) {
      console.error("Failed to create candling reminder:", err);
    }
  }, []);

  const calculateNextCandlingDate = useCallback((incubationDay, batchStartDate) => {
    const schedule = [
      { day: 7, name: "First Candling Check" },
      { day: 14, name: "Second Candling Check" },
      { day: 18, name: "Pre-Lockdown Check" },
    ];
    const next = schedule.find((c) => c.day > incubationDay);
    if (!next) return null;
    const startDate = new Date(batchStartDate);
    const nextDate = new Date(startDate);
    nextDate.setDate(nextDate.getDate() + next.day);
    return {
      date: nextDate,
      day: next.day,
      name: next.name,
      daysUntil: Math.ceil((nextDate - new Date()) / (1000 * 60 * 60 * 24)),
    };
  }, []);

  /* analysis logic */

  const analyzeEmbryoDevelopment = useCallback(
    (predictions, lifeDetection = null, candlingAnalysis = null) => {
      const allClasses = predictions.map((p) => p.class?.toLowerCase() || "").join(" ");
      const allPredictions = predictions.map((p) => ({
        class: p.class?.toLowerCase() || "",
        confidence: p.confidence || 0,
      }));

      const veinPreds = allPredictions.filter((p) =>
        p.class.includes("vein") || p.class.includes("vascular") || p.class.includes("spider")
      );
      const hasVeins = veinPreds.length > 0;
      const veinConf = veinPreds.length > 0 ? Math.max(...veinPreds.map((p) => p.confidence)) : 0;

      const embryoPreds = allPredictions.filter((p) =>
        p.class.includes("developing") || p.class.includes("embryo") || p.class.includes("fertile") ||
        p.class.includes("live") || p.class.includes("day") || p.class.includes("healthy")
      );
      const hasEmbryo = embryoPreds.length > 0;
      const embryoConf = embryoPreds.length > 0 ? Math.max(...embryoPreds.map((p) => p.confidence)) : 0;

      const clearPreds = allPredictions.filter((p) =>
        p.class.includes("clear") || p.class.includes("infertile") ||
        p.class.includes("undeveloped") || p.class.includes("empty")
      );
      const isClear = clearPreds.length > 0;
      const clearConf = clearPreds.length > 0 ? Math.max(...clearPreds.map((p) => p.confidence)) : 0;

      const maxConf = predictions.length > 0 ? Math.max(...predictions.map((p) => p.confidence || 0)) : 0;

      let eggType = "Unknown (Default: Chicken)";
      if (allClasses.includes("duck")) eggType = "Duck Egg";
      else if (allClasses.includes("quail")) eggType = "Quail Egg";
      else if (allClasses.includes("goose")) eggType = "Goose Egg";
      else if (allClasses.includes("turkey")) eggType = "Turkey Egg";
      else if (allClasses.includes("chicken")) eggType = "Chicken Egg";

      const hasStrongViableSigns =
        (candlingAnalysis?.viability?.viabilityScore >= 30) ||
        (candlingAnalysis?.viability?.viabilityIndicators?.length >= 1) ||
        (candlingAnalysis?.features?.veins?.detected && candlingAnalysis?.features?.embryo?.detected) ||
        lifeDetection?.isAlive === true;

      const hasStrongDeadSigns =
        (candlingAnalysis?.features?.bloodRing?.detected &&
          candlingAnalysis?.features?.bloodRing?.coverage > 60 &&
          !candlingAnalysis?.features?.veins?.detected &&
          !candlingAnalysis?.features?.embryo?.detected) ||
        (candlingAnalysis?.viability?.viabilityScore < 10 &&
          !lifeDetection?.isAlive &&
          !candlingAnalysis?.features?.veins?.detected);

      let status, confidence, observations, recommendation, actionSteps, notes;

      if (hasStrongViableSigns) {
        const viability = candlingAnalysis?.viability || {};
        status = "Developing Embryo";
        confidence = viability.viabilityConfidence || (lifeDetection?.confidenceLevel === "High" ? "High" : "Medium");
        const indicators = [...(viability.viabilityIndicators || []), ...(lifeDetection?.observations || [])];
        observations = indicators.length > 0
          ? indicators.join(". ") + "."
          : `Fertile egg with development signs. Viability: ${viability.viabilityScore || 0}%`;
        recommendation = viability.recommendation || "GOOD NEWS: This is a FERTILE egg. Continue incubation at 37.5 degrees C, 40-50% humidity.";
        actionSteps = [
          "Continue normal incubation",
          "Maintain temperature 37.5-37.8 degrees C (99.5-100 degrees F)",
          "Keep humidity 40-50% (days 1-18), 65-70% (days 18-21)",
          "Turn eggs 3-5 times daily if not automatic",
          "Re-scan in 2-3 days to monitor progress",
        ];
        notes = `Fertile - Viability: ${viability.viabilityStatus || "Developing"} (${viability.viabilityScore || 0}%)`;
      } else if (hasStrongDeadSigns) {
        status = "Dead Embryo";
        confidence = "High";
        observations = candlingAnalysis?.viability?.nonViableIndicators?.join(". ") || "Blood ring detected. No viable development.";
        recommendation = "IMMEDIATE ACTION: Remove within 24-48 hours to prevent contamination. Sanitize incubator.";
        actionSteps = [
          "Mark egg for removal",
          "Re-scan in 24-48 h to confirm",
          "Remove carefully with gloves if confirmed",
          "Dispose properly and sanitize incubator",
        ];
        notes = `Non-viable - Score: ${candlingAnalysis?.viability?.viabilityScore || 0}%`;
      } else if (candlingAnalysis?.classification?.classification === "infertile" && candlingAnalysis?.viability?.viabilityScore < 20) {
        status = "Infertile Egg";
        confidence = "High";
        observations = "No embryo development. Egg appears clear with no blood vessels.";
        recommendation = "Infertile egg - remove to save incubator space. Check egg source fertility rates.";
        actionSteps = [
          "Remove egg from incubator",
          "Check egg source fertility rates",
          "Ensure eggs were stored properly before incubation",
          "Source eggs from healthy, mature breeders",
        ];
        notes = "Infertile - no development indicators";
      } else if ((hasVeins && veinConf > 0.3) || (hasEmbryo && embryoConf > 0.3)) {
        status = "Developing Embryo";
        confidence = "Medium";
        observations = "AI model detected development indicators. Continue monitoring.";
        recommendation = "LIKELY DEVELOPING: Continue incubation. Re-scan in 2-3 days to confirm.";
        actionSteps = ["Continue incubation", "Maintain stable temperature and humidity", "Re-scan in 2-3 days"];
        notes = "AI model detected potential development";
      } else if ((isClear && clearConf > 0.35) || maxConf < 0.3) {
        status = "Infertile Egg";
        confidence = "Medium";
        observations = "No clear development indicators detected.";
        recommendation = "Likely infertile. If 7+ days in incubation, remove egg. Otherwise re-scan.";
        actionSteps = ["Check incubation day", "If 7+ days: remove egg", "If under 7 days: re-scan later"];
        notes = "Likely infertile - no development detected";
      } else {
        status = "Uncertain";
        confidence = "Low";
        observations = "Unable to determine egg status clearly.";
        recommendation = "Take another photo in a darker room with stronger candling light.";
        actionSteps = ["Use darker room", "Use brighter candling light", "Hold egg steady close to camera"];
        notes = "Uncertain - improve image quality and retry";
      }

      return { status, confidence, observations, recommendation, actionSteps, notes, eggType, timestamp: new Date().toISOString() };
    },
    []
  );

  /* inference + save */

  const saveScanToFirebase = useCallback(
    async (scanData) => {
      const { predictions, count, topClassSave, topConfidenceSave, savedImageDataUrl, analysis, eggPosition: position } = scanData;
      try {
        let embryoAnalysisResult = null;
        if (showAdvancedAnalysis) {
          try {
            const activeBatchQuery = query(collection(firestore, "egg_batches"), where("status", "==", "ACTIVE"));
            const batchSnapshot = await getDocs(activeBatchQuery);
            if (!batchSnapshot.empty) {
              const batchDoc = batchSnapshot.docs[0];
              const batchData = batchDoc.data();
              let incubationDay = 0;
              if (batchData.startDate) {
                const sd = batchData.startDate.toDate ? batchData.startDate.toDate() : new Date(batchData.startDate);
                incubationDay = Math.floor((new Date() - sd) / (1000 * 60 * 60 * 24));
              }
              embryoAnalysisResult = await EmbryoAnalysisSystem.analyzeEgg({
                eggId: `EGG-SCAN-${Date.now()}`,
                batchId: batchDoc.id,
                incubationDay,
                temperatureHistory: [],
                humidityHistory: [],
                turningData: {},
                developmentProgress: {
                  veinsVisible: analysis?.hasVeins || false,
                  embryoMovement: false,
                  airCellSize: "normal",
                  developmentStage:
                    analysis?.status === "Developing Embryo" ? "normal" :
                    analysis?.status === "Dead Embryo" ? "dead" : "early",
                },
                sensorReadings: { temperature: 37.5, humidity: 50, turningEnabled: true },
                previousStatus: null,
              });
            }
          } catch (e) {
            console.error("Embryo analysis failed (non-critical):", e);
          }
        }

        await addDoc(collection(firestore, "egg_scans"), {
          createdAt: serverTimestamp(),
          batchId: selectedBatch,
          eggPosition: position || null,
          candlingRound,
          previousCandlingNotes: previousCandlingNotes || null,
          topClass: topClassSave,
          topConfidence: topConfidenceSave,
          count,
          predictions,
          imageDataUrl: savedImageDataUrl,
          analysisResult: analysis,
          candlingAnalysis: embryoAnalysisResult?.candlingAnalysis || null,
          embryoAnalysis: embryoAnalysisResult,
          scanType: "embryo_development",
          batchStartDate: batchStartDate?.trim() ? new Date(batchStartDate).toISOString() : null,
          classification5Class: embryoAnalysisResult?.candlingAnalysis?.classification?.classification || null,
          classificationConfidence: embryoAnalysisResult?.candlingAnalysis?.classification?.confidence || null,
          detectedFeatures: embryoAnalysisResult?.candlingAnalysis?.features || null,
        });

        try {
          await updateDoc(doc(firestore, "egg_batches", selectedBatch), {
            lastCandlingDate: new Date(),
            lastCandlingResult: analysis?.status || "Unknown",
            candlingRound,
            fertileCount: batchEggCount.fertile,
            infertileCount: batchEggCount.infertile,
            deadCount: batchEggCount.dead,
            totalScanned: batchEggCount.scanned,
          });
        } catch (e) {
          console.error("Failed to update batch:", e);
        }

        if (selectedBatch) loadBatchEggCount(selectedBatch);
      } catch (err) {
        console.error("Failed to save scan:", err);
        setSaveError("Scan completed but failed to save to database.");
      }
    },
    [batchStartDate, showAdvancedAnalysis, selectedBatch, candlingRound, previousCandlingNotes, batchEggCount, loadBatchEggCount]
  );

  const saveScanWithPosition = useCallback(
    async (position) => {
      if (!pendingScanForPosition) return;
      await saveScanToFirebase({ ...pendingScanForPosition, eggPosition: position });
      setPendingScanForPosition(null);
      setShowEggPositionModal(false);
      setEggPosition("");
    },
    [pendingScanForPosition, saveScanToFirebase]
  );

  const handleStartDateConfirm = useCallback(async () => {
    if (!batchStartDate?.trim()) { setError("Please select a start date."); return; }
    setIsSaving(true);
    await saveScanToFirebase(pendingScanData);
    try {
      const activeBatchQuery = query(collection(firestore, "egg_batches"), where("status", "==", "ACTIVE"));
      const qs = await getDocs(activeBatchQuery);
      if (qs.empty) {
        const analysis = pendingScanData?.analysis;
        const eggType = analysis?.eggType || "Chicken";
        const days = eggType.toLowerCase().includes("duck") ? 28 : eggType.toLowerCase().includes("quail") ? 18 : 21;
        const sd = new Date(batchStartDate);
        const hd = new Date(sd); hd.setDate(hd.getDate() + days);
        await addDoc(collection(firestore, "egg_batches"), {
          batchId: `BATCH-${Date.now()}`,
          eggType: eggType.replace(" Egg", ""),
          totalEggs: 1,
          startDate: sd,
          incubationDays: days,
          hatchingDate: hd,
          status: "ACTIVE",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const bd = qs.docs[0];
        if (!bd.data().startDate) {
          await updateDoc(doc(firestore, "egg_batches", bd.id), {
            startDate: new Date(batchStartDate),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e) {
      console.error("Failed to update batch:", e);
    }
    setShowStartDateModal(false);
    setPendingScanData(null);
    setIsSaving(false);
  }, [batchStartDate, pendingScanData, saveScanToFirebase]);

  const runInference = useCallback(
    async (imageDataUrl) => {
      if (!imageDataUrl) { setError("Capture an image first."); return; }
      if (!selectedBatch) { setError("Please select an egg batch first."); loadBatches(); return; }

      setIsInferring(true);
      setError("");
      setSaveError("");
      setInferenceResult(null);
      setAnalysisResult(null);

      try {
        const res = await fetch("/api/roboflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: imageDataUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Inference failed");

        setInferenceResult(data);

        let candlingAnalysis = null;
        let lifeDetection = null;

        try {
          const img = new Image();
          await new Promise((resolve) => {
            img.onload = async () => {
              const canvas = document.createElement("canvas");
              canvas.width = 224; canvas.height = 224;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0, 224, 224);

              let incubationDay = null;
              if (batchStartDate?.trim()) {
                const start = new Date(batchStartDate);
                incubationDay = Math.floor((new Date() - start) / (1000 * 60 * 60 * 24));
              }

              const imageData = ctx.getImageData(0, 0, 224, 224);
              candlingAnalysis = EggCandlingAnalyzer.analyze(imageData, incubationDay);

              try {
                const candlingObs = extractCandlingObservations(candlingAnalysis);
                const envData = extractEnvironmentalData({ temperatureHistory: [], humidityHistory: [] });
                lifeDetection = EmbryoLifeDetector.detectLife(candlingObs, envData, incubationDay || 0);
              } catch (e) {
                console.error("Life detection failed:", e);
              }

              try {
                const decisionInput = {
                  candlingObservations: extractCandlingObservations(candlingAnalysis),
                  sensorData: { temperature: 37.5, humidity: 50, temperatureStable: true, humidityStable: true },
                  incubationDay: incubationDay || 0,
                  imageAnalysis: candlingAnalysis,
                  historicalChecks: [],
                };
                window._aiDecision = AIDecisionEngine.makeDecision(decisionInput);
              } catch (e) {
                console.error("AI Decision Engine error:", e);
              }

              resolve();
            };
            img.src = imageDataUrl;
          });
        } catch (e) {
          console.error("Candling analysis failed:", e);
        }

        const normalized = normalizeWorkflowResponse(data);
        const predictions = normalized?.predictions || [];
        const count = predictions.length;
        const top = predictions?.[0] || null;
        const topClassSave = top?.class || "None";
        const topConfidenceSave = typeof top?.confidence === "number" ? top.confidence : null;

        const outputImageDataUrl = normalized.outputImageBase64
          ? `data:image/jpeg;base64,${normalized.outputImageBase64}`
          : "";
        const savedImageDataUrl = outputImageDataUrl || imageDataUrl;

        const analysis = analyzeEmbryoDevelopment(predictions, lifeDetection, candlingAnalysis);

        const aiDecision = window._aiDecision;
        if (aiDecision) {
          analysis.aiDecisionSummary = `${aiDecision.embryoStatus} (${aiDecision.confidenceLevel}% confidence). ${aiDecision.observedEvidence}`;
          analysis.aiConfidencePercentage = aiDecision.confidenceLevel;
          analysis.aiRecommendedAction = aiDecision.recommendedAction;
          analysis.aiAlertLevel = aiDecision.alertLevel;
        }

        setAnalysisResult({ ...analysis, candlingAnalysis, lifeDetection, aiDecision });
        setActiveTab("results");

        setPendingScanForPosition({ predictions, count, topClassSave, topConfidenceSave, savedImageDataUrl, analysis, candlingAnalysis, lifeDetection, aiDecision });
        setShowEggPositionModal(true);

        const batchDataForCalc = availableBatches.find((b) => b.id === selectedBatch);
        if (batchDataForCalc?.startDate) {
          const sd = batchDataForCalc.startDate.toDate ? batchDataForCalc.startDate.toDate() : new Date(batchDataForCalc.startDate);
          const incDay = Math.floor((new Date() - sd) / (1000 * 60 * 60 * 24));
          const nextCandling = calculateNextCandlingDate(incDay, sd);
          if (nextCandling) {
            setNextCandlingDate(nextCandling);
            setShowNextCandlingModal(true);
            try {
              await updateDoc(doc(firestore, "egg_batches", selectedBatch), {
                nextCandlingDate: nextCandling.date,
                nextCandlingDay: nextCandling.day,
                lastCandlingDate: new Date(),
                lastCandlingResult: analysis.status,
              });
              const batchName = batchDataForCalc?.batchId || batchDataForCalc?.batchName || selectedBatch;
              await createCandlingReminder(nextCandling, selectedBatch, batchName);
            } catch (e) {
              console.error("Failed to update batch next candling:", e);
            }
          }
        }

        const isDeveloping = analysis.status.includes("Developing") || analysis.status.includes("Early Development");
        if (isDeveloping && !batchStartDate?.trim()) {
          setPendingScanData({ predictions, count, topClassSave, topConfidenceSave, savedImageDataUrl, analysis });
          setShowStartDateModal(true);
        } else {
          saveScanToFirebase({ predictions, count, topClassSave, topConfidenceSave, savedImageDataUrl, analysis });
        }

        await stopCamera();
      } catch (e) {
        setError(e?.message || "Inference failed");
      } finally {
        setIsInferring(false);
        setIsSaving(false);
      }
    },
    [analyzeEmbryoDevelopment, stopCamera, batchStartDate, selectedBatch, availableBatches, loadBatches, calculateNextCandlingDate, createCandlingReminder, saveScanToFirebase]
  );

  const captureFrameFull = useCallback(() => {
    setError("");
    setInferenceResult(null);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) { setError("Camera not ready yet."); return; }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setError("Unable to capture frame."); return; }
    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    setCaptureDataUrl(dataUrl);
    runInference(dataUrl);
  }, [runInference]);

  const handleImageUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError("");
      setInferenceResult(null);
      setAnalysisResult(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result;
        if (dataUrl) { setUploadedImage(dataUrl); runInference(dataUrl); }
      };
      reader.readAsDataURL(file);
    },
    [runInference]
  );

  const triggerFileInput = useCallback(() => fileInputRef.current?.click(), []);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  /* status color helpers */

  const statusColorMap = {
    "Developing Embryo": { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-800", badge: "bg-emerald-600" },
    "Dead Embryo":       { bg: "bg-rose-50",    ring: "ring-rose-200",    text: "text-rose-800",    badge: "bg-rose-600" },
    "Infertile Egg":     { bg: "bg-slate-50",   ring: "ring-slate-200",   text: "text-slate-700",   badge: "bg-slate-500" },
    "Uncertain":         { bg: "bg-amber-50",   ring: "ring-amber-200",   text: "text-amber-800",   badge: "bg-amber-500" },
  };
  const getStatusColor = (status) =>
    Object.entries(statusColorMap).find(([k]) => status?.includes(k.split(" ")[0]))?.[1] ?? statusColorMap["Uncertain"];

  const getStatusIcon = (status, className = "h-4 w-4") =>
    status?.includes("Developing") ? <CheckCircle className={className} /> :
    status?.includes("Dead") ? <XCircle className={className} /> :
    status?.includes("Infertile") ? <Circle className={className} /> :
    <HelpCircle className={className} />;

  /* tabs */

  const TABS = [
    { id: "scan",    label: "Scan",    icon: <Camera className="h-3.5 w-3.5" /> },
    { id: "results", label: "Results", icon: <Microscope className="h-3.5 w-3.5" />, badge: analysisResult ? true : false },
    { id: "history", label: "History", icon: <History className="h-3.5 w-3.5" /> },
  ];

  /* render */

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-5xl items-start gap-4 px-3 py-4 sm:gap-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-4 min-w-0">
          <TopBar
            title="Egg Scanner"
            notificationCount={3}
            onOpenSidebar={() => setIsSidebarOpen(true)}
          />

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
                <button
                  onClick={() => setShowAdvancedAnalysis(!showAdvancedAnalysis)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1 transition ${
                    showAdvancedAnalysis
                      ? "bg-violet-600 text-white ring-violet-600"
                      : "bg-white/60 text-slate-600 ring-slate-200 hover:bg-white"
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  Advanced
                </button>
                {isInferring ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Analyzing
                  </span>
                ) : isSaving ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white">
                    <Database className="h-3 w-3" />
                    Saving
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Ready
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
                </span>
              )}
              {selectedBatch && batchEggCount.total > 0 && (
                <span className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200">
                  <Activity className="h-3 w-3" />
                  {batchEggCount.scanned}/{batchEggCount.total} scanned
                  <span className="text-emerald-600">+{batchEggCount.fertile}</span>
                  <span className="text-rose-600">-{batchEggCount.infertile + batchEggCount.dead}</span>
                </span>
              )}
              {candlingRound > 1 && previousCandlingNotes && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700 ring-1 ring-amber-200">
                  <CalendarDays className="h-3 w-3" />
                  Round {candlingRound}: {previousCandlingNotes.substring(0, 50)}
                </span>
              )}
            </div>
          </div>

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
                  activeTab === tab.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.badge && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500" />
                )}
              </button>
            ))}
          </div>

          {/* SCAN TAB */}
          {activeTab === "scan" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 rounded-2xl bg-white/70 p-3 ring-1 ring-slate-200/70 shadow-sm backdrop-blur">
                <button
                  onClick={startCamera}
                  disabled={isStarting || isActive}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                    isActive || isStarting
                      ? "bg-slate-100 text-slate-400"
                      : "bg-gradient-to-r from-sky-600 to-indigo-600 text-white hover:from-sky-700 hover:to-indigo-700"
                  }`}
                >
                  <Camera className="h-3.5 w-3.5" />
                  {isStarting ? "Starting..." : "Camera"}
                </button>
                <button
                  onClick={stopCamera}
                  disabled={!isActive}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                    !isActive ? "bg-slate-100 text-slate-400" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <CameraOff className="h-3.5 w-3.5" />
                  Stop
                </button>
                <button
                  onClick={captureFrameFull}
                  disabled={!isActive || isInferring}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                    !isActive || isInferring
                      ? "bg-slate-100 text-slate-400"
                      : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600"
                  }`}
                >
                  {isInferring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                  {isInferring ? "Scanning..." : "Capture"}
                </button>
                <button
                  onClick={triggerFileInput}
                  disabled={isInferring}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                    isInferring
                      ? "bg-slate-100 text-slate-400"
                      : "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700"
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={isInferring || (!uploadedImage && !captureDataUrl && !analysisResult)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                    isInferring || (!uploadedImage && !captureDataUrl && !analysisResult)
                      ? "bg-slate-100 text-slate-400"
                      : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  }`}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reset
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
                  {/* video is always mounted so videoRef is always available */}
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className={`h-full w-full object-cover ${isActive ? "block" : "hidden"}`}
                  />
                  {!isActive && uploadedImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={uploadedImage} alt="Uploaded" className="h-full w-full object-contain" />
                  ) : !isActive ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-4">
                      <ImageIcon className="h-8 w-8 text-white/40" />
                      <p className="text-xs text-white/50">Camera feed or uploaded image</p>
                    </div>
                  ) : null}
                  <span className="absolute left-2 top-2 rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">Input</span>
                  {isActive && (
                    <button
                      onClick={captureFrameFull}
                      disabled={isInferring}
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2 text-xs font-semibold text-slate-800 shadow-lg hover:bg-slate-100 transition disabled:opacity-50"
                    >
                      {isInferring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                      {isInferring ? "Scanning..." : "Scan Egg"}
                    </button>
                  )}
                </div>

                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200 shadow-sm">
                  {normalizedWorkflow.outputImageBase64 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:image/jpeg;base64,${normalizedWorkflow.outputImageBase64}`}
                      alt="Model output"
                      className="h-full w-full object-contain"
                    />
                  ) : captureDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={captureDataUrl} alt="Captured" className="h-full w-full object-contain" />
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

              {analysisResult && (
                <button
                  onClick={() => setActiveTab("results")}
                  className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-3 text-left ring-1 ring-slate-200/70 shadow-sm hover:bg-white transition"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-white ${getStatusColor(analysisResult.status).badge}`}>
                      {getStatusIcon(analysisResult.status)}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{analysisResult.status}</p>
                      <p className="text-[10px] text-slate-500">{analysisResult.confidence} confidence - tap to view details</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              )}
            </div>
          )}

          {/* RESULTS TAB */}
          {activeTab === "results" && (
            <div className="flex flex-col gap-3">
              {!analysisResult ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/60 py-12 ring-1 ring-slate-200/60 text-center">
                  <Microscope className="h-10 w-10 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">No scan results yet</p>
                  <p className="text-xs text-slate-400">Go to the Scan tab to capture or upload an egg image</p>
                  <button
                    onClick={() => setActiveTab("scan")}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Go to Scan
                  </button>
                </div>
              ) : (
                <>
                  {(() => {
                    const sc = getStatusColor(analysisResult.status);
                    return (
                      <div className={`rounded-2xl p-4 ${sc.bg} ring-1 ${sc.ring}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Scan Result</p>
                            <p className={`text-xl font-bold ${sc.text}`}>{analysisResult.status}</p>
                            <p className="mt-1 text-xs text-slate-600">{analysisResult.confidence} confidence - {analysisResult.eggType}</p>
                          </div>
                          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white ${sc.badge}`}>
                            {getStatusIcon(analysisResult.status, "h-6 w-6")}
                          </div>
                        </div>
                        {analysisResult.candlingAnalysis && (
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <FeatureChip
                              label="Veins"
                              detected={analysisResult.candlingAnalysis.features.veins.detected}
                              detail={`${analysisResult.candlingAnalysis.features.veins.coverage}% coverage`}
                            />
                            <FeatureChip
                              label="Embryo"
                              detected={analysisResult.candlingAnalysis.features.embryo.detected}
                              detail={`${analysisResult.candlingAnalysis.features.embryo.area}% area`}
                            />
                            <FeatureChip
                              label="Air Cell"
                              detected={analysisResult.candlingAnalysis.features.airCell.detected}
                              detail={analysisResult.candlingAnalysis.features.airCell.size}
                            />
                            <FeatureChip
                              label="Blood Ring"
                              detected={analysisResult.candlingAnalysis.features.bloodRing.detected}
                              detail={analysisResult.candlingAnalysis.features.bloodRing.detected ? "Early death sign" : "Good sign"}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="rounded-xl bg-white/70 px-4 py-3 ring-1 ring-slate-200/70 shadow-sm">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <div>
                        <p className="text-xs font-semibold text-slate-900 mb-1">Recommendation</p>
                        <p className="text-xs leading-relaxed text-slate-700">{analysisResult.recommendation}</p>
                      </div>
                    </div>
                  </div>

                  {analysisResult.actionSteps?.length > 0 && (
                    <Accordion title="Action Steps" icon={<CheckCircle className="h-3.5 w-3.5 text-emerald-600" />} defaultOpen>
                      <ol className="space-y-1.5">
                        {analysisResult.actionSteps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700">
                              {i + 1}
                            </span>
                            {step.replace(/^\d+\.\s*/, "")}
                          </li>
                        ))}
                      </ol>
                    </Accordion>
                  )}

                  <Accordion title="Observations" icon={<AlertCircle className="h-3.5 w-3.5 text-sky-500" />}>
                    <p className="text-xs leading-relaxed text-slate-700">{analysisResult.observations}</p>
                    {analysisResult.notes && (
                      <p className="mt-2 text-[11px] text-slate-500 italic">{analysisResult.notes}</p>
                    )}
                  </Accordion>

                  {analysisResult.candlingAnalysis && (
                    <Accordion
                      title={`5-Class Analysis - ${analysisResult.candlingAnalysis.classInfo?.label || ""}`}
                      icon={<Microscope className="h-3.5 w-3.5 text-violet-600" />}
                    >
                      <div className="space-y-2 text-xs text-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Stage</span>
                          <span className="font-bold">{analysisResult.candlingAnalysis.classInfo?.label}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Confidence</span>
                          <span className={`font-bold ${analysisResult.candlingAnalysis.classification.confidence >= 70 ? "text-emerald-600" : analysisResult.candlingAnalysis.classification.confidence >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                            {analysisResult.candlingAnalysis.classification.confidence}%
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{analysisResult.candlingAnalysis.classification.description}</p>
                      </div>
                    </Accordion>
                  )}

                  {analysisResult.lifeDetection && (
                    <Accordion
                      title={`Life Detection - ${analysisResult.lifeDetection.status}`}
                      icon={<Activity className="h-3.5 w-3.5 text-rose-500" />}
                    >
                      <div className="space-y-1.5 text-xs text-slate-700">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Status:</span>
                          <span className="font-bold">{analysisResult.lifeDetection.status}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {analysisResult.lifeDetection.confidence} confidence
                          </span>
                        </div>
                        <p className="leading-relaxed">{analysisResult.lifeDetection.observedIndicators}</p>
                        {analysisResult.lifeDetection.recommendation && (
                          <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200 mt-2">
                            <p className="font-semibold text-slate-800">{analysisResult.lifeDetection.recommendation}</p>
                          </div>
                        )}
                      </div>
                    </Accordion>
                  )}

                  {analysisResult.aiDecisionSummary && (
                    <Accordion title="AI Decision Engine" icon={<Sparkles className="h-3.5 w-3.5 text-violet-500" />}>
                      <p className="text-xs leading-relaxed text-slate-700">{analysisResult.aiDecisionSummary}</p>
                    </Accordion>
                  )}

                  {detectionCount > 0 && (
                    <Accordion title={`Model Predictions (${detectionCount})`} icon={<BarChart3 className="h-3.5 w-3.5 text-slate-500" />}>
                      <div className="space-y-1">
                        {modelPredictions.map((pred, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="capitalize text-slate-700">{String(pred.class).replace(/_/g, " ")}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                              {(pred.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </Accordion>
                  )}

                  <button
                    onClick={() => { handleRefresh(); setActiveTab("scan"); }}
                    className="flex items-center justify-center gap-2 rounded-xl bg-white/70 py-2.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-white transition"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Scan Another Egg
                  </button>
                </>
              )}
            </div>
          )}

          {/* HISTORY TAB */}
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
                    <RefreshCw className={`h-3 w-3 ${isLoadingHistory ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                  {scanHistory.length > 0 && (
                    <button
                      onClick={clearScanHistory}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100 transition"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {isLoadingHistory ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading history...
                </div>
              ) : scanHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/60 py-12 text-center ring-1 ring-slate-200/60">
                  <History className="h-10 w-10 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">No scans recorded yet</p>
                  <p className="text-xs text-slate-400">Your egg scans will appear here after analysis</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scanHistory.map((scan, index) => {
                    const scanDate = scan.scannedAt instanceof Date ? scan.scannedAt : new Date(scan.scannedAt);
                    const sc = getStatusColor(scan.status);
                    return (
                      <div key={scan.id || index} className={`rounded-xl px-4 py-3 ring-1 ${sc.ring} ${sc.bg}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white ${sc.badge}`}>
                              {getStatusIcon(scan.status, "h-3.5 w-3.5")}
                            </div>
                            <div className="min-w-0">
                              <p className={`text-xs font-semibold ${sc.text} truncate`}>{scan.status}</p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {scan.topClass !== "N/A" ? scan.topClass.replace(/_/g, " ") : scan.eggType} - {scan.topConfidence}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] font-medium text-slate-500">{scanDate.toLocaleDateString()}</p>
                            <p className="text-[10px] text-slate-400">{scanDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        </div>
                        {scan.observations && (
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-600 line-clamp-2">{scan.observations}</p>
                        )}
                        {scan.batchId && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400">
                            <Package className="h-3 w-3" />
                            Batch: {scan.batchId.substring(0, 12)}...
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* MODALS */}

      {/* Egg Position Modal */}
      {showEggPositionModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Egg Position in Tray</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Optional - enter slot number (1-48)</p>
              </div>
              <button
                onClick={() => { setShowEggPositionModal(false); setPendingScanForPosition(null); }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="number" min="1" max="48"
              value={eggPosition}
              onChange={(e) => setEggPosition(e.target.value)}
              placeholder="e.g., 1, 15, 48"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 mb-3"
            />
            {batchEggCount.total > 0 && (
              <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600 ring-1 ring-slate-200">
                <Activity className="inline h-3 w-3 mr-1" />
                {batchEggCount.scanned}/{batchEggCount.total} scanned -
                <span className="text-emerald-600"> {batchEggCount.fertile} fertile</span> -
                <span className="text-rose-600"> {batchEggCount.infertile + batchEggCount.dead} non-viable</span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowEggPositionModal(false); setPendingScanForPosition(null); }}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
              >Skip</button>
              <button
                onClick={() => saveScanWithPosition(eggPosition || null)}
                className="flex-1 rounded-xl bg-amber-600 py-2.5 text-xs font-semibold text-white hover:bg-amber-700 transition"
              >Save</button>
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
                <p className="text-[11px] text-slate-500 mt-0.5">Choose batch to link this scan</p>
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
                  <p className="text-[11px] text-slate-500">Create a batch in the Egg Batches page first</p>
                </div>
              ) : (
                availableBatches.map((batch) => {
                  let startDate;
                  if (batch.startDate?.toDate) startDate = batch.startDate.toDate();
                  else if (batch.startDate) startDate = new Date(batch.startDate);
                  else if (batch.createdAt?.toDate) startDate = batch.createdAt.toDate();
                  else startDate = new Date();
                  const incDay = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24));
                  const batchName = batch.batchId || batch.batchName || batch.name || batch.id;
                  const eggType = batch.eggType || batch.type || "Chicken";
                  const totalDays = batch.incubationDays || batch.totalDays || 21;
                  return (
                    <button
                      key={batch.id}
                      onClick={() => {
                        setSelectedBatch(batch.id);
                        setSelectedBatchData(batch);
                        setBatchStartDate(startDate.toISOString().split("T")[0]);
                        setShowBatchSelectModal(false);
                      }}
                      className="w-full rounded-xl border-2 border-slate-100 p-3 text-left hover:border-emerald-400 hover:bg-emerald-50 transition"
                    >
                      <p className="text-xs font-semibold text-slate-900">{batchName}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{eggType} - Day {incDay} of {totalDays}</p>
                    </button>
                  );
                })
              )}
            </div>
            <button
              onClick={() => setShowBatchSelectModal(false)}
              className="w-full rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
            >Cancel</button>
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
              <p className="text-xs text-slate-500 mt-0.5">Day {nextCandlingDate.day} - {nextCandlingDate.daysUntil} days from now</p>
            </div>
            <p className="mb-4 text-[11px] leading-relaxed text-slate-600">
              A reminder notification has been saved. You will be notified when it is time for the next candling check.
            </p>
            <button
              onClick={() => setShowNextCandlingModal(false)}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
            >Got it</button>
          </div>
        </div>
      )}

      {/* Start Date Modal */}
      {showStartDateModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Set Batch Start Date</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                A developing embryo was detected. Enter the date eggs were placed in the incubator.
              </p>
            </div>
            <input
              type="date"
              value={batchStartDate || ""}
              onChange={(e) => setBatchStartDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowStartDateModal(false);
                  setPendingScanData(null);
                  if (pendingScanData) saveScanToFirebase(pendingScanData);
                }}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
              >Skip</button>
              <button
                onClick={handleStartDateConfirm}
                disabled={!batchStartDate}
                className="flex-1 rounded-xl bg-sky-600 py-2.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >Confirm & Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
