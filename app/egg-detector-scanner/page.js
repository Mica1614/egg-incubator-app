// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addDoc, collection, serverTimestamp, query, where, orderBy, getDocs, getDoc, updateDoc, doc, limit } from "firebase/firestore";
import { firestore, auth } from "@/lib/firebase";
import { EmbryoAnalysisSystem } from "@/lib/embryoAnalysis";
import { EggCandlingAnalyzer } from "@/lib/eggCandlingAnalysis";
import { EmbryoLifeDetector, extractCandlingObservations, extractEnvironmentalData } from "@/lib/embryoLifeDetector";
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
  HelpCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  History,
  Trash2,
} from "lucide-react";

function normalizeWorkflowResponse(result) {
  if (!result) {
    return {
      outputImageBase64: "",
      predictions: [],
    };
  }

  const root = Array.isArray(result) ? result[0] : result;
  const outputs = Array.isArray(root?.outputs) ? root.outputs : Array.isArray(result) ? result : [root];
  const first = outputs.find((o) => o && (o.output_image || o["output_image"] || o["output image"] || o.predictions)) || outputs[0];

  const outputImage = first?.output_image || first?.["output_image"] || first?.["output image"] || null;
  const outputImageBase64 = typeof outputImage?.value === "string" ? outputImage.value : "";

  const predictionsObj = first?.predictions || first?.detection_predictions || null;
  const predictions =
    Array.isArray(predictionsObj?.predictions)
      ? predictionsObj.predictions
      : Array.isArray(predictionsObj)
      ? predictionsObj
      : [];

  return {
    outputImageBase64,
    predictions,
  };
}

export default function EggDetectorScannerPage() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [isStarting, setIsStarting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState("");
  const [captureDataUrl, setCaptureDataUrl] = useState("");
  const [isInferring, setIsInferring] = useState(false);
  const [inferenceResult, setInferenceResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadedImage, setUploadedImage] = useState(null);
  const fileInputRef = useRef(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [aiDecisionResult, setAiDecisionResult] = useState(null);
  const [showAdvancedAnalysis, setShowAdvancedAnalysis] = useState(false);
  const [batchStartDate, setBatchStartDate] = useState("");
  const [showStartDateModal, setShowStartDateModal] = useState(false);
  const [pendingScanData, setPendingScanData] = useState(null);
  const [scanHistory, setScanHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedBatchData, setSelectedBatchData] = useState(null);
  const [availableBatches, setAvailableBatches] = useState([]);
  const [showBatchSelectModal, setShowBatchSelectModal] = useState(false);
  const [nextCandlingDate, setNextCandlingDate] = useState(null);
  const [showNextCandlingModal, setShowNextCandlingModal] = useState(false);
  const [eggPosition, setEggPosition] = useState("");
  const [showEggPositionModal, setShowEggPositionModal] = useState(false);
  const [pendingScanForPosition, setPendingScanForPosition] = useState(null);
  const [batchEggCount, setBatchEggCount] = useState({ total: 0, scanned: 0, fertile: 0, infertile: 0, dead: 0 });
  const [candlingRound, setCandlingRound] = useState(1);
  const [previousCandlingNotes, setPreviousCandlingNotes] = useState("");

  const normalizedWorkflow = (() => {
    return normalizeWorkflowResponse(inferenceResult);
  })();

  const modelPredictions = normalizedWorkflow.predictions;
  const detectionCount = modelPredictions.length;
  const topClass = modelPredictions?.[0]?.class || "None";
  const topConfidence =
    typeof modelPredictions?.[0]?.confidence === "number"
      ? modelPredictions[0].confidence
      : null;

  const stopCamera = useCallback(async () => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }

    setIsActive(false);
    setIsStarting(false);
    setCaptureDataUrl("");
    setUploadedImage(null);
  }, []);

  // NEW: Refresh/Reset function to clear current scan
  const handleRefresh = useCallback(() => {
    setCaptureDataUrl("");
    setUploadedImage(null);
    setInferenceResult(null);
    setAnalysisResult(null);
    setAiDecisionResult(null);
    setError("");
    setSaveError("");
    setSelectedBatch("");
    setSelectedBatchData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // NEW: Load scan history from Firebase
  const loadScanHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      console.log("Loading scan history from Firebase...");
      const scansQuery = query(
        collection(firestore, "egg_scans"),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(scansQuery);
      console.log("Found scans:", querySnapshot.size);
      
      const history = querySnapshot.docs.map(doc => {
        const data = doc.data();
        console.log("Raw scan data:", data);
        
        // Extract the analysis result properly
        const analysis = data.analysisResult || {};
        const candling = data.candlingAnalysis || {};
        const viability = candling.viability || {};
        
        return {
          id: doc.id,
          ...data,
          // Main scan result fields
          status: analysis.status || 'Unknown',
          eggType: analysis.eggType || 'Unknown',
          confidence: analysis.confidence || 'Unknown',
          observations: analysis.observations || '',
          recommendation: analysis.recommendation || '',
          
          // AI Model predictions
          topClass: data.topClass || 'N/A',
          topConfidence: data.topConfidence ? `${(data.topConfidence * 100).toFixed(0)}%` : 'N/A',
          detectionCount: data.count || 0,
          
          // Viability assessment
          viabilityStatus: viability.viabilityStatus || 'N/A',
          viabilityScore: viability.viabilityScore || 0,
          viabilityIndicators: viability.viabilityIndicators || [],
          
          // Timestamp
          scannedAt: data.createdAt?.toDate?.() || new Date(),
        };
      });
      
      console.log("Processed history:", history);
      setScanHistory(history);
      setShowHistory(true);
    } catch (err) {
      console.error("Failed to load scan history:", err);
      setError("Failed to load scan history: " + err.message);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // NEW: Clear all scan history
  const clearScanHistory = useCallback(async () => {
    if (!confirm("Are you sure you want to clear all scan history? This cannot be undone.")) {
      return;
    }
    try {
      // Note: In production, you'd want to delete documents in batches
      // For now, we'll just clear the local state
      setScanHistory([]);
      setShowHistory(false);
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  }, []);

  // NEW: Load available egg batches
  const loadBatches = useCallback(async () => {
    try {
      console.log("Loading batches from Firebase...");
      // Load all batches (remove status filter to be more flexible)
      const batchesQuery = query(
        collection(firestore, "egg_batches"),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(batchesQuery);
      console.log("Found batches:", querySnapshot.size);
      
      const batches = querySnapshot.docs.map(doc => {
        const data = doc.data();
        console.log("Batch data:", data);
        return {
          id: doc.id,
          ...data,
        };
      });
      
      setAvailableBatches(batches);
      console.log("Loaded batches:", batches);
      
      if (batches.length > 0) {
        setShowBatchSelectModal(true);
      } else {
        console.log("No batches found. Please create batches first.");
      }
    } catch (err) {
      console.error("Failed to load batches:", err);
    }
  }, []);

  // NEW: Load batches when page loads
  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // NEW: Load batch egg count when batch is selected
  useEffect(() => {
    if (selectedBatch) {
      loadBatchEggCount(selectedBatch);
    }
  }, [selectedBatch]);

  // NEW: Load batch egg count from Firebase
  const loadBatchEggCount = useCallback(async (batchId) => {
    try {
      console.log("📊 Loading egg count for batch:", batchId);
      
      // Get all scans for this batch
      const scansQuery = query(
        collection(firestore, "egg_scans"),
        where("batchId", "==", batchId)
      );
      const querySnapshot = await getDocs(scansQuery);
      
      console.log("📊 Found scans:", querySnapshot.size);
      
      let scanned = 0;
      let fertile = 0;
      let infertile = 0;
      let dead = 0;
      
      querySnapshot.forEach(doc => {
        const data = doc.data();
        scanned++;
        
        const status = data.analysisResult?.status || '';
        if (status.includes('Developing') || status.includes('Fertile')) {
          fertile++;
        } else if (status.includes('Infertile')) {
          infertile++;
        } else if (status.includes('Dead')) {
          dead++;
        }
      });
      
      // Get total eggs from batch
      const batchDoc = await getDoc(doc(firestore, "egg_batches", batchId));
      const batchData = batchDoc.exists() ? batchDoc.data() : {};
      const totalEggs = batchData.totalEggs || 48;
      
      // Determine candling round based on lastCandlingDate
      const lastCandling = batchData.lastCandlingDate;
      let round = 1;
      let previousNotes = "";
      
      if (lastCandling) {
        const lastDate = lastCandling.toDate ? lastCandling.toDate() : new Date(lastCandling);
        const incubationDay = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
        
        // If last candling was 7+ days ago, this is a new round
        if (incubationDay >= 7) {
          const lastResult = batchData.lastCandlingResult || '';
          if (lastResult.includes('Developing') || lastResult.includes('Fertile')) {
            round = 2; // Second candling
            previousNotes = `1st Candling: ${batchData.fertileCount || scanned} fertile, ${batchData.infertileCount || 0} infertile, ${batchData.deadCount || 0} dead. Continue monitoring development.`;
          }
        }
      }
      
      setCandlingRound(round);
      setPreviousCandlingNotes(previousNotes);
      
      console.log("📊 Batch egg count calculated:", { total: totalEggs, scanned, fertile, infertile, dead });
      console.log("🔍 Candling Round:", round, previousNotes ? "(2nd)" : "(1st)");
      
      setBatchEggCount({
        total: totalEggs,
        scanned,
        fertile,
        infertile,
        dead,
      });
    } catch (err) {
      console.error("Failed to load batch egg count:", err);
    }
  }, []);

  // NEW: Save scan with egg position
  // NEW: Create candling reminder notification
  const createCandlingReminder = useCallback(async (nextCandling, batchId, batchName) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.log("No user logged in, skipping notification");
        return;
      }

      const daysUntil = nextCandling.daysUntil;
      let notificationTitle, notificationMessage, tone;

      if (daysUntil <= 1) {
        notificationTitle = "🔴 URGENT: Candling Check Tomorrow!";
        notificationMessage = `Your batch "${batchName}" needs embryo candling check TOMORROW (Day ${nextCandling.day}). This is your ${nextCandling.name}. Please scan all eggs to monitor development.`;
        tone = "danger";
      } else if (daysUntil <= 3) {
        notificationTitle = "🟡 Reminder: Candling Check in " + daysUntil + " Days";
        notificationMessage = `Batch "${batchName}" - ${nextCandling.name} scheduled for ${nextCandling.date.toLocaleDateString()} (Day ${nextCandling.day}). Prepare your candling scanner.`;
        tone = "warning";
      } else {
        notificationTitle = "🔵 Upcoming: Candling Check Scheduled";
        notificationMessage = `${nextCandling.name} for batch "${batchName}" is on ${nextCandling.date.toLocaleDateString()} (${daysUntil} days from now). Mark your calendar!`;
        tone = "info";
      }

      // Create notification in user's notifications collection
      await addDoc(collection(firestore, "users", currentUser.uid, "notifications"), {
        title: notificationTitle,
        message: notificationMessage,
        tone: tone,
        type: "candling_reminder",
        batchId: batchId,
        nextCandlingDate: nextCandling.date,
        nextCandlingDay: nextCandling.day,
        nextCandlingName: nextCandling.name,
        daysUntil: daysUntil,
        createdAt: serverTimestamp(),
        read: false,
      });

      console.log("✅ Candling reminder notification created");
    } catch (err) {
      console.error("Failed to create candling reminder:", err);
    }
  }, []);

  // NEW: Calculate next candling date based on current incubation day
  const calculateNextCandlingDate = useCallback((incubationDay, batchStartDate) => {
    const candlingSchedule = [
      { day: 7, name: "First Candling Check" },
      { day: 14, name: "Second Candling Check" },
      { day: 18, name: "Pre-Lockdown Check" },
    ];
    
    // Find next candling day
    let nextCandling = candlingSchedule.find(c => c.day > incubationDay);
    
    if (!nextCandling) {
      // Past all scheduled candling days
      return null;
    }
    
    const startDate = new Date(batchStartDate);
    const nextDate = new Date(startDate);
    nextDate.setDate(nextDate.getDate() + nextCandling.day);
    
    return {
      date: nextDate,
      day: nextCandling.day,
      name: nextCandling.name,
      daysUntil: Math.ceil((nextDate - new Date()) / (1000 * 60 * 60 * 24)),
    };
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
        await video.play();
      }

      setIsActive(true);
    } catch (e) {
      setError(e?.message || "Unable to access camera.");
      await stopCamera();
    } finally {
      setIsStarting(false);
    }
  }, [stopCamera]);

  const analyzeEmbryoDevelopment = useCallback((predictions, lifeDetection = null, candlingAnalysis = null) => {
    // Enhanced classification logic based on visual features and model predictions
    const allClasses = predictions.map(p => p.class?.toLowerCase() || '').join(' ');
    const allPredictions = predictions.map(p => ({
      class: p.class?.toLowerCase() || '',
      confidence: p.confidence || 0
    }));

    // EXTENSIVE Debug logging to see EXACTLY what AI detects
    console.log('=== EGG ANALYSIS DEBUG ===');
    console.log('📊 AI Model Predictions:', predictions);
    console.log('🏷️ All Classes Detected:', allClasses);
    console.log('📈 Max Confidence:', Math.max(...predictions.map(p => p.confidence || 0)));
    console.log('🔬 Life Detection:', lifeDetection);
    console.log('🥚 Candling Analysis:', candlingAnalysis);
    
    // Show detailed prediction breakdown
    if (predictions.length > 0) {
      console.log('=== PREDICTION DETAILS ===');
      predictions.forEach((pred, idx) => {
        console.log(`  ${idx + 1}. Class: "${pred.class}", Confidence: ${(pred.confidence * 100).toFixed(1)}%`);
      });
    }
    
    if (candlingAnalysis) {
      console.log('=== CANDLING VIABILITY ===');
      console.log('  Viability Status:', candlingAnalysis.viability?.viabilityStatus);
      console.log('  Viability Score:', candlingAnalysis.viability?.viabilityScore);
      console.log('  Classification:', candlingAnalysis.classification?.classification);
      console.log('  Features - Veins:', candlingAnalysis.features?.veins);
      console.log('  Features - Embryo:', candlingAnalysis.features?.embryo);
    }

    // IMPROVED vein detection - broader matching for fertility signs
    const veinPredictions = allPredictions.filter(p => 
      p.class.includes('vein') || 
      p.class.includes('veins') ||
      p.class.includes('vascular') ||
      p.class.includes('blood_vessel') ||
      p.class.includes('spider') ||
      p.class.includes('network')
    );
    const hasVeins = veinPredictions.length > 0;
    const veinConfidence = veinPredictions.length > 0 ? Math.max(...veinPredictions.map(p => p.confidence)) : 0;
    
    // IMPROVED embryo development detection - MUCH BROADER matching
    const embryoPredictions = allPredictions.filter(p => 
      p.class.includes('developing') ||
      p.class.includes('embryo') ||
      p.class.includes('fertile') ||
      p.class.includes('live') ||
      p.class.includes('alive') ||
      p.class.includes('growth') ||
      p.class.includes('day') ||  // day1_3, day4_6, day7_10
      p.class.includes('week') ||
      p.class.includes('stage') ||
      p.class.includes('healthy') ||
      p.class.includes('positive')
    );
    const hasEmbryo = embryoPredictions.length > 0;
    const embryoConfidence = embryoPredictions.length > 0 ? Math.max(...embryoPredictions.map(p => p.confidence)) : 0;
    
    // IMPROVED blood ring detection - MORE STRICT to avoid false positives
    const bloodRingPredictions = allPredictions.filter(p => 
      p.class.includes('blood_ring') || 
      p.class.includes('bloodring') ||
      p.class.includes('early_death') ||
      p.class.includes('dead_embryo') ||
      (p.class.includes('dead') && !p.class.includes('develop')) ||
      (p.class.includes('death') && !p.class.includes('develop'))
    );
    const hasBloodRing = bloodRingPredictions.length > 0;
    const bloodRingConfidence = bloodRingPredictions.length > 0 ? Math.max(...bloodRingPredictions.map(p => p.confidence)) : 0;
    
    // IMPROVED clear/infertile detection - STRICTER to avoid false positives
    const clearPredictions = allPredictions.filter(p => 
      p.class.includes('clear') || 
      p.class.includes('infertile') ||
      p.class.includes('no_development') ||
      p.class.includes('undeveloped') ||
      p.class.includes('empty') ||
      p.class.includes('bad') ||
      p.class.includes('rotten') ||
      p.class.includes('negative')
    );
    const isClear = clearPredictions.length > 0;
    const clearConfidence = clearPredictions.length > 0 ? Math.max(...clearPredictions.map(p => p.confidence)) : 0;

    // Get the highest confidence prediction overall
    const maxConfidence = predictions.length > 0 
      ? Math.max(...predictions.map(p => p.confidence || 0))
      : 0;
    
    const topPrediction = predictions[0]?.class?.toLowerCase() || '';
    
    // NEW: Check candling analysis results for additional fertility evidence
    console.log('🔍 Analyzing egg with combined AI and Computer Vision...');

    // Egg type identification with incubation parameters
    let eggType = "Unknown";
    let incubationParams = {
      temperature: "37.5-37.8°C (99.5-100°F)",
      humidity: "40-50%",
      lockdownHumidity: "65-70%",
      lockdownDay: 18,
      hatchDay: "20-21",
      turningFrequency: "3-5 times daily",
      totalIncubation: "21 days"
    };
    
    if (allClasses.includes('chicken') || allClasses.includes('hen')) {
      eggType = "Chicken Egg";
      incubationParams = {
        temperature: "37.5-37.8°C (99.5-100°F)",
        humidity: "40-50%",
        lockdownHumidity: "65-70%",
        lockdownDay: 18,
        hatchDay: "20-21",
        turningFrequency: "3-5 times daily",
        totalIncubation: "21 days"
      };
    } else if (allClasses.includes('duck')) {
      eggType = "Duck Egg";
      incubationParams = {
        temperature: "37.5-37.8°C (99.5-100°F)",
        humidity: "45-55%",
        lockdownHumidity: "70-80%",
        lockdownDay: 25,
        hatchDay: "28",
        turningFrequency: "5-7 times daily",
        totalIncubation: "28 days"
      };
    } else if (allClasses.includes('quail')) {
      eggType = "Quail Egg";
      incubationParams = {
        temperature: "37.5-37.8°C (99.5-100°F)",
        humidity: "45-50%",
        lockdownHumidity: "65-70%",
        lockdownDay: 14,
        hatchDay: "16-18",
        turningFrequency: "3-5 times daily",
        totalIncubation: "16-18 days"
      };
    } else if (allClasses.includes('goose')) {
      eggType = "Goose Egg";
      incubationParams = {
        temperature: "37.5-37.8°C (99.5-100°F)",
        humidity: "40-50%",
        lockdownHumidity: "70-75%",
        lockdownDay: 27,
        hatchDay: "28-35",
        turningFrequency: "5-7 times daily",
        totalIncubation: "28-35 days"
      };
    } else if (allClasses.includes('turkey')) {
      eggType = "Turkey Egg";
      incubationParams = {
        temperature: "37.5-37.8°C (99.5-100°F)",
        humidity: "45-55%",
        lockdownHumidity: "65-70%",
        lockdownDay: 25,
        hatchDay: "28",
        turningFrequency: "5-7 times daily",
        totalIncubation: "28 days"
      };
    } else {
      eggType = "Unknown (Default: Chicken)";
    }

    // Determine development stage with improved logic
    // PRIORITY: Use CANDLING ANALYSIS (trained on 24k+ images) as PRIMARY indicator
    let status, confidence, observations, recommendation, notes, actionSteps;
    
    // Check if candling analysis shows clear fertility
    // COMBINED ANALYSIS: Merge AI Model + Candling Analysis for accurate results
    console.log('🎯 COMBINING AI + CANDLING ANALYSIS...');
    
    // Check for STRONG VIABLE indicators from BOTH sources
    const hasStrongViableSigns = (
      // From Candling Analysis - LOWERED threshold for better accuracy
      (candlingAnalysis?.viability?.viabilityScore >= 30) ||
      (candlingAnalysis?.viability?.viabilityIndicators?.length >= 1) ||
      (candlingAnalysis?.features?.veins?.detected && candlingAnalysis?.features?.embryo?.detected) ||
      // From AI Life Detection  
      (lifeDetection?.isAlive === true)
    );
    
    // Check for STRONG non-viable indicators (blood ring must be VERY prominent)
    const hasStrongDeadSigns = (
      (candlingAnalysis?.features?.bloodRing?.detected && 
       candlingAnalysis?.features?.bloodRing?.coverage > 60 &&
       !candlingAnalysis?.features?.veins?.detected &&
       !candlingAnalysis?.features?.embryo?.detected) ||
      (candlingAnalysis?.viability?.viabilityScore < 10 &&
       !lifeDetection?.isAlive &&
       !candlingAnalysis?.features?.veins?.detected)
    );
    
    console.log('✅ Strong Viable Signs:', hasStrongViableSigns);
    console.log('❌ Strong Dead Signs:', hasStrongDeadSigns);
    console.log('📊 Viability Score:', candlingAnalysis?.viability?.viabilityScore);
    console.log('🔬 Life Detection:', lifeDetection?.isAlive, lifeDetection?.confidenceLevel);

    // COMBINED CLASSIFICATION LOGIC:
    
    // Priority 1: Strong viable signs from EITHER source = LIVE
    if (hasStrongViableSigns) {
      const viability = candlingAnalysis.viability || {};
      const features = candlingAnalysis.features || {};
      
      status = "Developing Embryo";
      confidence = viability.viabilityConfidence || 
                   (lifeDetection?.confidenceLevel === 'High' ? 'High' : 'Medium');
      
      // COMBINE observations from both analyses
      const candlingIndicators = viability.viabilityIndicators || [];
      const lifeObs = lifeDetection?.observations || [];
      const allObservations = [...candlingIndicators, ...lifeObs];
      
      observations = allObservations.length > 0 
        ? allObservations.join('. ') + '.'
        : `Fertile egg detected with development signs. Viability: ${viability.viabilityScore || 0}%`;
      
      recommendation = viability.recommendation || 
        `GOOD NEWS: This is a FERTILE egg showing healthy development. Continue incubation. Maintain stable temperature at 37.5°C and humidity at 50-55%. Turn eggs 3-5 times daily.`;
      
      actionSteps = [
        "1. Continue normal incubation process",
        "2. Maintain temperature: 37.5-37.8°C (99.5-100°F)",
        "3. Maintain humidity: 40-50% (Days 1-18), 65-70% (Days 18-21)",
        "4. Turn eggs 3-5 times daily if not automatic",
        "5. Limit incubator openings to prevent temperature drops",
        "6. Re-scan in 2-3 days to monitor progress",
        "7. Expected hatch: Day 20-21 (based on start date)"
      ];
      notes = `Fertile egg - Viability: ${viability.viabilityStatus || 'Developing'} (${viability.viabilityScore || 0}%)`;
    }
    // Priority 2: Strong dead signs ONLY (no viable indicators present)
    else if (hasStrongDeadSigns) {
      status = "Dead Embryo";
      confidence = "High";
      observations = candlingAnalysis.viability?.nonViableIndicators?.join('. ') || 
        "Blood ring detected with no viable development. Embryo is not viable.";
      recommendation = "IMMEDIATE ACTION REQUIRED: This egg has a dead embryo. Remove within 24-48 hours to prevent contamination. Isolate from healthy eggs. Sanitize incubator.";
      actionSteps = [
        "1. Mark this egg for removal",
        "2. Wait 24-48 hours and re-scan to confirm",
        "3. If confirmed dead, remove carefully with gloves",
        "4. Dispose properly (bury or compost away from flock)",
        "5. Sanitize incubator and wash hands thoroughly",
        "6. Monitor other eggs for any signs of contamination"
      ];
      notes = `Non-viable egg - Viability score: ${candlingAnalysis.viability?.viabilityScore || 0}%`;
    }
    // Priority 3: If candling shows infertile (clear egg, no development)
    else if (candlingAnalysis?.classification?.classification === 'infertile' && candlingAnalysis?.viability?.viabilityScore < 20) {
      status = "Infertile Egg";
      confidence = "High";
      observations = "No embryo development detected. Egg appears clear with no blood vessels or embryo mass.";
      recommendation = "This egg is infertile and will not develop. Remove to save incubator space. Check your egg source for fertility rates.";
      actionSteps = [
        "1. Remove egg from incubator",
        "2. Check egg source fertility rates",
        "3. Ensure eggs were stored properly before incubation",
        "4. Review incubator temperature history",
        "5. Source eggs from healthy, mature breeders"
      ];
      notes = "Infertile egg - No development indicators";
    } else if ((hasVeins && veinConfidence > 0.3) || (hasEmbryo && embryoConfidence > 0.3)) {
      status = "Developing Embryo";
      confidence = "Medium";
      observations = "AI model detected development indicators. Continue monitoring.";
      recommendation = "LIKELY DEVELOPING: Continue incubation and monitor progress. Maintain temperature at 37.5°C and humidity at 50-55%. Re-scan in 2-3 days.";
      actionSteps = [
        "1. Continue incubation",
        "2. Maintain stable temperature and humidity",
        "3. Turn eggs regularly",
        "4. Re-scan in 2-3 days to confirm development"
      ];
      notes = "AI model detected potential development";
    } else if ((isClear && clearConfidence > 0.35) || (maxConfidence < 0.3)) {
      status = "Infertile Egg";
      confidence = "Medium";
      observations = "No clear development indicators detected. Egg may be infertile.";
      recommendation = "Likely infertile. Check incubation day - if 7+ days, remove egg. If less than 7 days, continue and re-scan.";
      actionSteps = [
        "1. Check incubation day",
        "2. If 7+ days: Remove egg",
        "3. If less than 7 days: Continue and re-scan",
        "4. Check egg source fertility rates"
      ];
      notes = "Likely infertile - no development detected";
    } else {
      status = "Uncertain";
      confidence = "Low";
      observations = "Unable to determine egg status clearly. Please try again with a better image.";
      recommendation = "Take another photo in a darker room with stronger candling light. Ensure the egg is positioned correctly.";
      actionSteps = [
        "1. Improve candling setup - darker room",
        "2. Use brighter LED candling light",
        "3. Position light at large end of egg",
        "4. Hold egg steady and close to camera",
        "5. Take multiple photos from different angles"
      ];
      notes = "Uncertain result - improve image quality and retry";
    }

    return {
      status,
      confidence,
      observations,
      recommendation,
      actionSteps,
      notes,
      eggType,
      timestamp: new Date().toISOString(),
    };
  }, []);

  const runInference = useCallback(async (imageDataUrl) => {
    if (!imageDataUrl) {
      setError("Capture an image first.");
      return;
    }
    
    // NEW: Require batch selection before scanning
    if (!selectedBatch) {
      setError("Please select an egg batch first before scanning.");
      loadBatches();
      return;
    }

    setIsInferring(true);
    setError("");
    setSaveError("");
    setInferenceResult(null);
    setAnalysisResult(null);

    let inferenceData = null;
    try {
      const res = await fetch("/api/roboflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageDataUrl }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Inference failed");
      }

      inferenceData = data;
      setInferenceResult(data);

      // NEW: Run 5-class egg candling analysis with computer vision FIRST
      let candlingAnalysis = null;
      let lifeDetection = null;
      
      try {
        // Create canvas from image for computer vision analysis
        const img = new Image();
        
        // Wait for image to load and run all analyses
        await new Promise((resolve) => {
          img.onload = async () => {
            const canvas = document.createElement("canvas");
            canvas.width = 224;
            canvas.height = 224;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, 224, 224);
            
            // Calculate incubation day if batch exists
            let incubationDay = null;
            if (batchStartDate && batchStartDate.trim() !== "") {
              const start = new Date(batchStartDate);
              const now = new Date();
              incubationDay = Math.floor((now - start) / (1000 * 60 * 60 * 24));
            }
            
            // Run 5-class candling analysis
            const imageData = ctx.getImageData(0, 0, 224, 224);
            candlingAnalysis = EggCandlingAnalyzer.analyze(imageData, incubationDay);
            console.log("5-Class Candling Analysis:", candlingAnalysis);
            
            // Run Embryo Life Detection
            try {
              const candlingObservations = extractCandlingObservations(candlingAnalysis);
              const environmentalData = extractEnvironmentalData({
                temperatureHistory: [],
                humidityHistory: [],
              });
              
              lifeDetection = EmbryoLifeDetector.detectLife(
                candlingObservations,
                environmentalData,
                incubationDay || 0
              );
              
              console.log("Embryo Life Detection:", lifeDetection);
            } catch (lifeDetectionError) {
              console.error("Life detection failed (non-critical):", lifeDetectionError);
            }
            
            // Run AI Decision Engine - Comprehensive embryo viability assessment
            let aiDecision = null;
            try {
              const decisionInput = {
                candlingObservations: extractCandlingObservations(candlingAnalysis),
                sensorData: {
                  temperature: 37.5, // Default - can be integrated with real sensor data
                  humidity: 50,
                  temperatureStable: true,
                  humidityStable: true,
                },
                incubationDay: incubationDay || 0,
                imageAnalysis: candlingAnalysis,
                historicalChecks: [], // Can be populated from Firestore history
              };
              
              aiDecision = AIDecisionEngine.makeDecision(decisionInput);
              console.log("AI Decision Engine Result:", aiDecision);
              
              // Store AI decision for use in analysis result
              window._aiDecision = aiDecision;
            } catch (aiDecisionError) {
              console.error("AI Decision Engine error (non-critical):", aiDecisionError);
            }
            
            resolve();
          };
          img.src = imageDataUrl;
        });
      } catch (candlingError) {
        console.error("Candling analysis failed (non-critical):", candlingError);
      }
      
      // Perform embryo development analysis WITH ALL FEATURES (AI + Candling + Life Detection)
      const normalized = normalizeWorkflowResponse(data);
      const predictions = normalized?.predictions || [];
      const count = predictions.length;
      const top = predictions?.[0] || null;
      const topClass = top?.class || "None";
      const topConfidence = typeof top?.confidence === "number" ? top.confidence : null;

      const outputImageDataUrl = normalized.outputImageBase64
        ? `data:image/jpeg;base64,${normalized.outputImageBase64}`
        : "";
      const savedImageDataUrl = outputImageDataUrl || imageDataUrl;

      const analysis = analyzeEmbryoDevelopment(
        predictions,
        lifeDetection,
        candlingAnalysis
      );
      
      // Enhance analysis with AI Decision Engine output
      const aiDecision = window._aiDecision;
      if (aiDecision) {
        analysis.aiDecisionSummary = `${aiDecision.embryoStatus} (${aiDecision.confidenceLevel}% confidence). ${aiDecision.observedEvidence}`;
        analysis.aiConfidencePercentage = aiDecision.confidenceLevel;
        analysis.aiRecommendedAction = aiDecision.recommendedAction;
        analysis.aiAlertLevel = aiDecision.alertLevel;
        analysis.aiReasoning = aiDecision.reasoning;
        analysis.aiEvidence = aiDecision.observedEvidence;
      }
      
      // Show results to user with ALL features integrated
      setAnalysisResult({
        ...analysis,
        candlingAnalysis,
        lifeDetection,
        aiDecision,
      });

      // NEW: Ask for egg position before saving
      setPendingScanForPosition({
        predictions,
        count,
        topClassSave: topClass,
        topConfidenceSave: topConfidence,
        savedImageDataUrl,
        analysis,
        candlingAnalysis,
        lifeDetection,
        aiDecision,
      });
      setShowEggPositionModal(true);

      // NEW: Calculate and show next candling date
      const selectedBatchData = availableBatches.find(b => b.id === selectedBatch);
      if (selectedBatchData && selectedBatchData.startDate) {
        const startDate = selectedBatchData.startDate.toDate ? selectedBatchData.startDate.toDate() : new Date(selectedBatchData.startDate);
        const incubationDay = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24));
        
        const nextCandling = calculateNextCandlingDate(incubationDay, startDate);
        if (nextCandling) {
          setNextCandlingDate(nextCandling);
          setShowNextCandlingModal(true);
          
          // Save next candling date to batch
          try {
            await updateDoc(doc(firestore, "egg_batches", selectedBatch), {
              nextCandlingDate: nextCandling.date,
              nextCandlingDay: nextCandling.day,
              lastCandlingDate: new Date(),
              lastCandlingResult: analysis.status,
            });
            
            // NEW: Create notification reminder
            const batchName = selectedBatchData?.batchId || selectedBatchData?.batchName || selectedBatch;
            await createCandlingReminder(nextCandling, selectedBatch, batchName);
          } catch (err) {
            console.error("Failed to update batch with next candling date:", err);
          }
        }
      }

      // Check if this is a developing egg and we need to set start date
      const isDeveloping = analysis.status.includes("Developing") || 
                          analysis.status.includes("Early Development");
      
      // Add second detection schedule notes for developing eggs
      let updatedNotes = analysis.notes || "";
      if (isDeveloping) {
        const selectedBatchData = availableBatches.find(b => b.id === selectedBatch);
        if (selectedBatchData && selectedBatchData.startDate) {
          const startDate = selectedBatchData.startDate.toDate ? selectedBatchData.startDate.toDate() : new Date(selectedBatchData.startDate);
          const incubationDay = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24));
          
          // Calculate second candling date (typically day 14)
          const secondCandlingDay = 14;
          const secondCandlingDate = new Date(startDate);
          secondCandlingDate.setDate(secondCandlingDate.getDate() + secondCandlingDay);
          
          if (incubationDay < secondCandlingDay) {
            const daysUntilSecond = secondCandlingDay - incubationDay;
            updatedNotes += `\n\n📅 SECOND DETECTION SCHEDULED:\n`;
            updatedNotes += `• Next candling: Day ${secondCandlingDay} (${secondCandlingDate.toLocaleDateString()})\n`;
            updatedNotes += `• Days until next scan: ${daysUntilSecond} day${daysUntilSecond !== 1 ? 's' : ''}\n`;
            updatedNotes += `• Purpose: Confirm embryo development and viability\n`;
            updatedNotes += `• Look for: Enhanced vein network, embryo movement, air cell changes`;
          }
        }
      }
      
      // Save to Firebase in background (doesn't block UI)
      // If egg is developing and no start date is set, prompt user
      if (isDeveloping && (!batchStartDate || batchStartDate.trim() === "")) {
        setPendingScanData({
          predictions,
          count,
          topClassSave: topClass,
          topConfidenceSave: topConfidence,
          savedImageDataUrl,
          analysis: { ...analysis, notes: updatedNotes },
        });
        setShowStartDateModal(true);
      } else {
        // Save scan with existing start date or non-developing egg
        saveScanToFirebase({
          predictions,
          count,
          topClassSave: topClass,
          topConfidenceSave: topConfidence,
          savedImageDataUrl,
          analysis: { ...analysis, notes: updatedNotes },
        });
      }
      
      // Stop camera after successful detection
      await stopCamera();
    } catch (e) {
      const message = e?.message || "Inference failed";
      setError(message);
    } finally {
      setIsInferring(false);
      setIsSaving(false);
    }
  }, [analyzeEmbryoDevelopment, stopCamera, batchStartDate]);

  // Save scan to Firebase
  const saveScanToFirebase = useCallback(async (scanData) => {
    const { predictions, count, topClassSave, topConfidenceSave, savedImageDataUrl, analysis, eggPosition: position } = scanData;
    
    try {
      // Run advanced embryo analysis ONLY if user enabled it
      let embryoAnalysisResult = null;
      if (showAdvancedAnalysis) {
        try {
          // Get batch data for context
          const activeBatchQuery = query(
            collection(firestore, "egg_batches"),
            where("status", "==", "ACTIVE")
          );
          const batchSnapshot = await getDocs(activeBatchQuery);
          
          if (!batchSnapshot.empty) {
            // Get the first active batch
            const batchDoc = batchSnapshot.docs[0];
            const batchData = batchDoc.data();
            
            // Calculate incubation day
            let incubationDay = 0;
            if (batchData.startDate) {
              const startDate = batchData.startDate.toDate ? batchData.startDate.toDate() : new Date(batchData.startDate);
              const now = new Date();
              incubationDay = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
            }
            
            // Run embryo analysis
            embryoAnalysisResult = await EmbryoAnalysisSystem.analyzeEgg({
              eggId: `EGG-SCAN-${Date.now()}`,
              batchId: batchDoc.id,
              incubationDay,
              temperatureHistory: [], // Would come from sensors
              humidityHistory: [], // Would come from sensors
              turningData: {}, // Would come from sensors
              developmentProgress: {
                veinsVisible: analysis?.hasVeins || false,
                embryoMovement: false,
                airCellSize: "normal",
                developmentStage: analysis?.status === "Developing Embryo" ? "normal" : analysis?.status === "Dead Embryo" ? "dead" : "early",
              },
              sensorReadings: {
                temperature: 37.5, // Default - would come from sensors
                humidity: 50, // Default - would come from sensors
                turningEnabled: true,
              },
              previousStatus: null,
            });
            
            console.log("Embryo Analysis Result:", embryoAnalysisResult);
          }
        } catch (analysisError) {
          console.error("Embryo analysis failed (non-critical):", analysisError);
          // Continue saving even if analysis fails
        }
      }
      
      await addDoc(collection(firestore, "egg_scans"), {
        createdAt: serverTimestamp(),
        batchId: selectedBatch, // NEW: Link to batch
        eggPosition: position || null, // NEW: Egg position in tray (1-48)
        candlingRound: candlingRound, // NEW: Track which candling round (1st, 2nd, etc.)
        previousCandlingNotes: previousCandlingNotes || null, // NEW: Notes from previous candling
        topClass: topClassSave,
        topConfidence: topConfidenceSave,
        count,
        predictions,
        imageDataUrl: savedImageDataUrl,
        analysisResult: analysis,
        candlingAnalysis: embryoAnalysisResult?.candlingAnalysis || null, // NEW: 5-class candling results
        embryoAnalysis: embryoAnalysisResult, // NEW: AI analysis results
        scanType: "embryo_development",
        batchStartDate: batchStartDate && batchStartDate.trim() !== "" ? new Date(batchStartDate).toISOString() : null,
        candlingPurpose: "development_confirmation",
        // NEW: 5-class detection fields
        classification5Class: embryoAnalysisResult?.candlingAnalysis?.classification?.classification || null,
        classificationConfidence: embryoAnalysisResult?.candlingAnalysis?.classification?.confidence || null,
        detectedFeatures: embryoAnalysisResult?.candlingAnalysis?.features || null,
        // NEW: Egg purpose detection
        eggPurpose: embryoAnalysisResult?.candlingAnalysis?.eggPurpose || null,
        isIncubationEgg: embryoAnalysisResult?.candlingAnalysis?.eggPurpose?.isIncubationEgg || null,
        eggPurposeConfidence: embryoAnalysisResult?.candlingAnalysis?.eggPurpose?.confidence || null,
      });
      
      console.log("✅ Scan saved to Firebase with batchId:", selectedBatch);
      
      // Update batch with latest candling info
      try {
        await updateDoc(doc(firestore, "egg_batches", selectedBatch), {
          lastCandlingDate: new Date(),
          lastCandlingResult: analysis?.status || 'Unknown',
          candlingRound: candlingRound,
          fertileCount: batchEggCount.fertile,
          infertileCount: batchEggCount.infertile,
          deadCount: batchEggCount.dead,
          totalScanned: batchEggCount.scanned,
        });
        console.log("✅ Batch updated with candling round:", candlingRound);
      } catch (err) {
        console.error("Failed to update batch:", err);
      }
      
      // Reload egg count after saving
      if (selectedBatch) {
        console.log("🔄 Reloading batch egg count...");
        loadBatchEggCount(selectedBatch);
      }
    } catch (err) {
      console.error("Failed to save scan:", err);
      setSaveError("Scan completed but failed to save to database.");
    }
  }, [batchStartDate, showAdvancedAnalysis]);

  // NEW: Save scan with egg position
  const saveScanWithPosition = useCallback(async (position) => {
    if (!pendingScanForPosition) {
      console.log("⚠️ No pending scan data");
      return;
    }
    
    try {
      console.log("💾 Saving scan with position:", position);
      
      // Add egg position to scan data
      const scanDataWithPosition = {
        ...pendingScanForPosition,
        eggPosition: position,
      };
      
      // Save to Firebase
      await saveScanToFirebase(scanDataWithPosition);
      
      console.log("✅ Scan saved successfully");
      
      // Clear pending scan and close modal
      setPendingScanForPosition(null);
      setShowEggPositionModal(false);
      setEggPosition("");
    } catch (err) {
      console.error("Failed to save scan with position:", err);
    }
  }, [pendingScanForPosition, saveScanToFirebase]);

  // Handle start date confirmation
  const handleStartDateConfirm = useCallback(async () => {
    if (!batchStartDate || batchStartDate.trim() === "") {
      setError("Please select a start date.");
      return;
    }

    setIsSaving(true);
    
    // Save the scan with the start date
    await saveScanToFirebase(pendingScanData);
    
    // Also create or update the egg batch with this start date
    try {
      const analysis = pendingScanData?.analysis;
      const eggType = analysis?.eggType || "Chicken";
      
      // Check if there's an active batch
      const activeBatchQuery = query(
        collection(firestore, "egg_batches"),
        where("status", "==", "ACTIVE")
      );
      const querySnapshot = await getDocs(activeBatchQuery);
      
      if (querySnapshot.empty) {
        // Create new batch with the start date
        const incubationDays = eggType.toLowerCase().includes("duck") ? 28 : 
                              eggType.toLowerCase().includes("quail") ? 18 :
                              eggType.toLowerCase().includes("goose") ? 30 : 21;
        
        const startDate = new Date(batchStartDate);
        const hatchingDate = new Date(startDate);
        hatchingDate.setDate(hatchingDate.getDate() + incubationDays);
        
        await addDoc(collection(firestore, "egg_batches"), {
          batchId: `BATCH-${Date.now()}`,
          eggType: eggType.replace(" Egg", ""),
          totalEggs: 1,
          startDate: startDate,
          incubationDays: incubationDays,
          hatchingDate: hatchingDate,
          status: "ACTIVE",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        // Update existing active batch with start date if not set
        const batchDoc = querySnapshot.docs[0];
        const batchData = batchDoc.data();
        
        if (!batchData.startDate) {
          await updateDoc(doc(firestore, "egg_batches", batchDoc.id), {
            startDate: new Date(batchStartDate),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      console.error("Failed to update batch:", err);
    }
    
    setShowStartDateModal(false);
    setPendingScanData(null);
    setIsSaving(false);
  }, [batchStartDate, pendingScanData, saveScanToFirebase]);

  const handleImageUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setInferenceResult(null);
    setAnalysisResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        setUploadedImage(dataUrl);
        runInference(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  }, [runInference]);

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const captureFrame = useCallback(() => {
    setError("");
    setInferenceResult(null);

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
      setError("Camera not ready yet.");
      return;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Unable to capture frame.");
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    setCaptureDataUrl(dataUrl);
    runInference(dataUrl);
  }, [runInference]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <TopBar
            title="Egg Detector Scanner"
            notificationCount={3}
            onOpenSidebar={() => setIsSidebarOpen(true)}
          />
          <div className="flex w-full max-w-4xl flex-col gap-4">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white/70 via-white/55 to-white/40 px-6 py-5 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/60 backdrop-blur-xl">
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-200/40 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-emerald-200/40 blur-3xl" />

              <div className="relative flex flex-col gap-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200/60">
                      <Sparkles className="h-3.5 w-3.5" />
                      Egg Detection Scanner
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                      AI Egg Scanner
                    </h1>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      Detect eggs and identify development status with AI-powered analysis.
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {isInferring ? (
                      <div className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm shadow-sky-600/20">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Detecting
                      </div>
                    ) : isSaving ? (
                      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm shadow-emerald-600/20">
                        <Database className="h-3.5 w-3.5" />
                        Saving
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200/60">
                        <ScanLine className="h-3.5 w-3.5" />
                        Ready
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Advanced Analysis Toggle */}
                <div className="mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 px-4 py-3 ring-1 ring-violet-200/50">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowAdvancedAnalysis(!showAdvancedAnalysis)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-600 focus:ring-offset-2 ${
                        showAdvancedAnalysis ? 'bg-violet-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          showAdvancedAnalysis ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <div>
                      <span className="text-xs font-medium text-slate-700">
                        Advanced AI Analysis
                      </span>
                      <p className="text-[10px] text-slate-500">
                        Viability score, predictions & recommendations
                      </p>
                    </div>
                  </div>
                  {showAdvancedAnalysis && (
                    <span className="rounded-full bg-violet-600 px-2 py-1 text-[10px] font-semibold text-white">
                      Enabled
                    </span>
                  )}
                </div>
              </div>
            </div>

            <section className="rounded-3xl bg-white/70 px-5 py-5 shadow-sm ring-1 ring-slate-200/70 backdrop-blur">
              <div className="flex flex-col gap-4">
                {/* Upload and Camera Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* NEW: Batch Selection Button */}
                  <button
                    onClick={loadBatches}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 transition focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    <span>📦</span>
                    {selectedBatch ? 'Change Batch' : 'Select Batch'}
                  </button>
                  
                  {selectedBatch && (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs font-medium text-emerald-700">
                      <span className="font-semibold">Batch ID:</span> {selectedBatchData?.batchId || selectedBatchData?.id || selectedBatch}
                    </div>
                  )}
                  
                  {selectedBatch && batchEggCount.total > 0 && (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-blue-700">🥚 Progress:</span>
                          <span className="text-blue-900">
                            <span className="font-medium">{batchEggCount.scanned}</span>/{batchEggCount.total} scanned
                          </span>
                          <span className="text-green-600">✓{batchEggCount.fertile}</span>
                          <span className="text-red-600">✗{batchEggCount.infertile + batchEggCount.dead}</span>
                        </div>
                        {candlingRound > 1 && previousCandlingNotes && (
                          <div className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] text-amber-800 border border-amber-200">
                            <span className="font-semibold">📝 {candlingRound === 2 ? '2nd' : '3rd'} Candling - Previous Notes:</span> {previousCandlingNotes}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-900/5 p-2 ring-1 ring-slate-200/70">
                    <button
                      onClick={startCamera}
                      disabled={isStarting || isActive}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${
                        isActive
                          ? "bg-slate-200/60 text-slate-400"
                          : "bg-gradient-to-r from-sky-600 to-indigo-600 text-white hover:from-sky-700 hover:to-indigo-700"
                      }`}
                    >
                      <Camera className="h-4 w-4" />
                      {isStarting ? "Starting..." : "Camera"}
                    </button>

                    <button
                      onClick={stopCamera}
                      disabled={!isActive}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-400/40 ${
                        !isActive
                          ? "bg-slate-200/60 text-slate-400"
                          : "bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <CameraOff className="h-4 w-4" />
                      Stop
                    </button>

                    <button
                      onClick={captureFrame}
                      disabled={!isActive || isInferring}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
                        !isActive || isInferring
                          ? "bg-slate-200/60 text-slate-400"
                          : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600"
                      }`}
                    >
                      {isInferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                      {isInferring ? "Detecting" : "Capture"}
                    </button>

                    <button
                      onClick={triggerFileInput}
                      disabled={isInferring}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${
                        isInferring
                          ? "bg-slate-200/60 text-slate-400"
                          : "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700"
                      }`}
                    >
                      <Upload className="h-4 w-4" />
                      Upload Image
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />

                    {/* NEW: Refresh Button */}
                    <button
                      onClick={handleRefresh}
                      disabled={isInferring || (!uploadedImage && !captureDataUrl && !analysisResult)}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                        isInferring || (!uploadedImage && !captureDataUrl && !analysisResult)
                          ? "bg-slate-200/60 text-slate-400"
                          : "bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700"
                      }`}
                    >
                      <RefreshCw className={`h-4 w-4 ${isInferring ? 'animate-spin' : ''}`} />
                      New Scan
                    </button>

                    {/* NEW: History Button */}
                    <button
                      onClick={loadScanHistory}
                      disabled={isLoadingHistory}
                      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                        isLoadingHistory
                          ? "bg-slate-200/60 text-slate-400"
                          : "bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:from-indigo-700 hover:to-blue-700"
                      }`}
                    >
                      <History className="h-4 w-4" />
                      {isLoadingHistory ? "Loading..." : "Scan History"}
                    </button>
                  </div>

                  {batchStartDate && batchStartDate.trim() !== "" && (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3 text-xs font-medium text-emerald-700">
                      <span className="font-semibold">Start Date:</span> {new Date(batchStartDate).toLocaleDateString()}
                    </div>
                  )}

                  {error ? (
                    <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-4 text-xs font-medium text-rose-700">
                      {error}
                    </div>
                  ) : null}

                  {saveError ? (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-xs font-medium text-amber-800">
                      Failed saving scan to Firebase. {saveError}
                    </div>
                  ) : null}
                </div>

                {/* Educational Guide - What to Look For */}
                <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-indigo-50 p-5 ring-1 ring-sky-200/50">
                  <h3 className="mb-3 text-sm font-bold text-slate-900">🔍 What the AI Looks For During Scanning</h3>
                  
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Healthy Egg */}
                    <div className="rounded-xl bg-white/80 p-4 ring-1 ring-emerald-200/50">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <h4 className="text-xs font-bold text-emerald-700">Healthy Egg (Days 3-7)</h4>
                      </div>
                      <ul className="space-y-1.5 text-[11px] text-slate-700">
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                          <span><strong>Spider-like vein network</strong> - Red veins spreading from center</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                          <span><strong>Dark embryo spot</strong> - May move slightly when candled</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                          <span><strong>Clear, organized structure</strong> - Well-defined patterns</span>
                        </li>
                      </ul>
                    </div>

                    {/* Early Death - Blood Ring */}
                    <div className="rounded-xl bg-white/80 p-4 ring-1 ring-rose-200/50">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-white">
                          <XCircle className="h-4 w-4" />
                        </div>
                        <h4 className="text-xs font-bold text-rose-700">Early Death (Blood Ring)</h4>
                      </div>
                      <ul className="space-y-1.5 text-[11px] text-slate-700">
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-500" />
                          <span><strong>Distinct red circle</strong> - Ring inside the egg</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-500" />
                          <span><strong>No spreading veins</strong> - No veins from central point</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-500" />
                          <span><strong>No movement</strong> - Embryo stopped developing</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-500" />
                          <span><strong>Blood settles</strong> - Forms a visible ring pattern</span>
                        </li>
                      </ul>
                    </div>

                    {/* Other Death Signs */}
                    <div className="rounded-xl bg-white/80 p-4 ring-1 ring-amber-200/50">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white">
                          <AlertCircle className="h-4 w-4" />
                        </div>
                        <h4 className="text-xs font-bold text-amber-700">Other Death Signs</h4>
                      </div>
                      <ul className="space-y-1.5 text-[11px] text-slate-700">
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                          <span><strong>Cloudy/murky contents</strong> - No clear vein pattern</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                          <span><strong>Dark blob</strong> - Doesn't grow over time</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                          <span><strong>No change</strong> - Same appearance after several days</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                          <span><strong>Floating yolk</strong> - No structure or development</span>
                        </li>
                      </ul>
                    </div>

                    {/* When to Candle */}
                    <div className="rounded-xl bg-white/80 p-4 ring-1 ring-sky-200/50">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500 text-white">
                          <Clock className="h-4 w-4" />
                        </div>
                        <h4 className="text-xs font-bold text-sky-700">Candling Purpose</h4>
                      </div>
                      <ul className="space-y-1.5 text-[11px] text-slate-700">
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-500" />
                          <span><strong>Confirm development</strong> - Not for tracking time</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-500" />
                          <span><strong>Verify embryo growth</strong> - Check vein formation</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-500" />
                          <span><strong>Identify issues</strong> - Detect early death or infertility</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-500" />
                          <span><strong>Start date is key</strong> - Time tracking uses start date</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="relative h-48 overflow-hidden rounded-2xl bg-slate-950 ring-1 ring-slate-200 shadow-sm">
                    {isActive ? (
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        className="h-full w-full object-cover"
                      />
                    ) : uploadedImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={uploadedImage}
                        alt="Uploaded image"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/50 backdrop-blur-sm">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
                          <ImageIcon className="h-5 w-5 text-white" />
                        </div>
                        <p className="text-xs font-medium text-white">Upload an image or start camera</p>
                      </div>
                    )}
                  </div>

                  <div className="relative h-48 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200 shadow-sm">
                    {normalizedWorkflow.outputImageBase64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`data:image/jpeg;base64,${normalizedWorkflow.outputImageBase64}`}
                        alt="Model output"
                        className="h-full w-full object-contain"
                      />
                    ) : captureDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={captureDataUrl}
                        alt="Captured frame"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 py-10">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900/5 ring-1 ring-slate-200/60">
                          <ScanLine className="h-5 w-5 text-slate-500" />
                        </div>
                        <p className="text-xs font-medium text-slate-500">Preview</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl bg-white/70 ring-1 ring-slate-200/70 shadow-sm backdrop-blur">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200/60 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                        AI Analysis Result
                      </p>
                      {analysisResult && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                          Live
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-medium text-slate-500">
                      {isInferring ? (
                        <span className="inline-flex items-center gap-1 text-sky-600">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Analyzing...
                        </span>
                      ) : analysisResult ? (
                        <span className="text-emerald-600 font-semibold">✓ Complete</span>
                      ) : inferenceResult ? (
                        "Processing"
                      ) : (
                        "Idle"
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-4">
                    {analysisResult ? (
                      <div className="grid gap-4">

                        {/* Observations */}
                        <div className="rounded-2xl border border-slate-200/70 bg-white/60 p-4">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 h-4 w-4 text-sky-600" />
                            <div>
                              <h4 className="text-xs font-semibold text-slate-900">Observations</h4>
                              <p className="mt-1 text-xs leading-relaxed text-slate-700">
                                {analysisResult.observations}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Recommendation */}
                        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-4">
                          <div className="flex items-start gap-2">
                            <Sparkles className="mt-0.5 h-4 w-4 text-emerald-600" />
                            <div className="flex-1">
                              <h4 className="text-xs font-semibold text-slate-900">AI Recommendation</h4>
                              <p className="mt-1 text-xs leading-relaxed text-slate-700">
                                {analysisResult.recommendation}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Action Steps */}
                        {analysisResult.actionSteps && analysisResult.actionSteps.length > 0 && (
                          <div className="rounded-2xl border border-violet-200/70 bg-violet-50/40 p-4">
                            <div className="flex items-start gap-2">
                              <CheckCircle className="mt-0.5 h-4 w-4 text-violet-600" />
                              <div className="flex-1">
                                <h4 className="text-xs font-semibold text-slate-900">Action Steps - What You Should Do:</h4>
                                <div className="mt-2 space-y-1">
                                  {analysisResult.actionSteps.map((step, index) => (
                                    <p key={index} className="text-xs leading-relaxed text-slate-700">
                                      {step}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3">
                          <p className="text-[10px] font-semibold text-slate-600">Notes:</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-700">
                            {analysisResult.notes}
                          </p>
                        </div>

                        {/* NEW: 5-Class Candling Analysis Results */}
                        {analysisResult.candlingAnalysis && (
                          <>
                            <div className="my-2 border-t-2 border-dashed border-violet-300" />
                            <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 p-4 ring-2 ring-violet-200">
                              <div className="mb-3 flex items-center gap-2">
                                <span className="text-lg">🔬</span>
                                <h4 className="text-sm font-bold text-violet-900">
                                  5-Class Egg Candling Analysis
                                </h4>
                                <span className="ml-auto rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                  {analysisResult.candlingAnalysis.accuracy} Accuracy
                                </span>
                              </div>

                              {/* NEW: Embryo Life Detection */}
                              {analysisResult.lifeDetection && (
                                <div className={`mb-4 rounded-xl p-4 ${
                                  analysisResult.lifeDetection.status === 'Alive (Healthy)' ? 'bg-gradient-to-r from-emerald-50 to-green-50 ring-2 ring-emerald-300' :
                                  analysisResult.lifeDetection.status === 'Alive (At Risk)' ? 'bg-gradient-to-r from-amber-50 to-yellow-50 ring-2 ring-amber-300' :
                                  analysisResult.lifeDetection.status === 'Dead' ? 'bg-gradient-to-r from-rose-50 to-red-50 ring-2 ring-rose-300' :
                                  analysisResult.lifeDetection.status === 'Infertile' ? 'bg-gradient-to-r from-slate-50 to-gray-50 ring-2 ring-slate-300' :
                                  'bg-gradient-to-r from-blue-50 to-indigo-50 ring-2 ring-blue-300'
                                }`}>
                                  <div className="flex items-start gap-3">
                                    <div className="text-3xl">
                                      {analysisResult.lifeDetection.status === 'Alive (Healthy)' ? '✅' :
                                       analysisResult.lifeDetection.status === 'Alive (At Risk)' ? '⚠️' :
                                       analysisResult.lifeDetection.status === 'Dead' ? '❌' :
                                       analysisResult.lifeDetection.status === 'Infertile' ? '⭕' :
                                       '❓'}
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                          Embryo Life Detection
                                        </p>
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                          analysisResult.lifeDetection.confidence === 'High' ? 'bg-emerald-600 text-white' :
                                          analysisResult.lifeDetection.confidence === 'Medium' ? 'bg-amber-600 text-white' :
                                          'bg-slate-600 text-white'
                                        }`}>
                                          {analysisResult.lifeDetection.confidence} Confidence
                                        </span>
                                      </div>
                                      <p className={`mt-1 text-lg font-bold ${
                                        analysisResult.lifeDetection.status === 'Alive (Healthy)' ? 'text-emerald-900' :
                                        analysisResult.lifeDetection.status === 'Alive (At Risk)' ? 'text-amber-900' :
                                        analysisResult.lifeDetection.status === 'Dead' ? 'text-rose-900' :
                                        analysisResult.lifeDetection.status === 'Infertile' ? 'text-slate-900' :
                                        'text-blue-900'
                                      }`}>
                                        {analysisResult.lifeDetection.status === 'Alive (Healthy)' ? '✅ Alive - Healthy' :
                                         analysisResult.lifeDetection.status === 'Alive (At Risk)' ? '⚠️ Alive - At Risk' :
                                         analysisResult.lifeDetection.status === 'Dead' ? '❌ Dead Embryo' :
                                         analysisResult.lifeDetection.status === 'Infertile' ? '⭕ Infertile Egg' :
                                         analysisResult.lifeDetection.status}
                                      </p>
                                      <p className="mt-1 text-xs leading-relaxed text-slate-700">
                                        {analysisResult.lifeDetection.observedIndicators}
                                      </p>

                                      {/* Timeline Validation */}
                                      {analysisResult.lifeDetection.timelineValidation && (
                                        <div className="mt-2 rounded-lg bg-white/60 p-2">
                                          <p className="text-[9px] font-bold uppercase text-slate-500">
                                            Timeline Validation (Day {analysisResult.lifeDetection.incubationDay})
                                          </p>
                                          <p className={`mt-1 text-xs ${
                                            analysisResult.lifeDetection.timelineValidation.matches ? 'text-emerald-700' : 'text-amber-700'
                                          }`}>
                                            {analysisResult.lifeDetection.timelineValidation.matches
                                              ? '✓ Development matches expected timeline'
                                              : `⚠ ${analysisResult.lifeDetection.timelineValidation.message}`}
                                          </p>
                                        </div>
                                      )}

                                      {/* Recommendation */}
                                      <div className={`mt-3 rounded-lg p-3 ${
                                        analysisResult.lifeDetection.actionRequired === 'continue_incubation' ? 'bg-emerald-100 ring-1 ring-emerald-300' :
                                        analysisResult.lifeDetection.actionRequired === 'urgent_removal' ? 'bg-rose-100 ring-1 ring-rose-300' :
                                        analysisResult.lifeDetection.actionRequired.includes('monitoring') || analysisResult.lifeDetection.actionRequired.includes('intervention') ? 'bg-amber-100 ring-1 ring-amber-300' :
                                        'bg-blue-50 ring-1 ring-blue-200'
                                      }`}>
                                        <p className="text-[10px] font-bold uppercase text-slate-600">
                                          💡 Recommended Action
                                        </p>
                                        <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-800">
                                          {analysisResult.lifeDetection.recommendation}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Classification Badge */}
                              <div className={`mb-4 rounded-xl p-3 ${
                                analysisResult.candlingAnalysis.classification.classification === 'day7_10' ? 'bg-emerald-100 ring-1 ring-emerald-300' :
                                analysisResult.candlingAnalysis.classification.classification === 'dead' ? 'bg-rose-100 ring-1 ring-rose-300' :
                                analysisResult.candlingAnalysis.classification.classification === 'infertile' ? 'bg-slate-100 ring-1 ring-slate-300' :
                                'bg-amber-100 ring-1 ring-amber-300'
                              }`}>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                      Detected Stage
                                    </p>
                                    <p className="mt-1 text-lg font-bold text-slate-900">
                                      {analysisResult.candlingAnalysis.classInfo.icon} {analysisResult.candlingAnalysis.classInfo.label}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                      Confidence
                                    </p>
                                    <p className={`mt-1 text-2xl font-bold ${
                                      analysisResult.candlingAnalysis.classification.confidence >= 70 ? 'text-emerald-600' :
                                      analysisResult.candlingAnalysis.classification.confidence >= 50 ? 'text-amber-600' :
                                      'text-rose-600'
                                    }`}>
                                      {analysisResult.candlingAnalysis.classification.confidence}%
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Detected Features */}
                              <div className="mb-3 grid grid-cols-2 gap-2">
                                <div className="rounded-lg bg-white/70 p-2 ring-1 ring-violet-200">
                                  <p className="text-[9px] font-bold uppercase text-slate-500">Veins</p>
                                  <p className={`text-sm font-bold ${
                                    analysisResult.candlingAnalysis.features.veins.detected ? 'text-emerald-600' : 'text-slate-400'
                                  }`}>
                                    {analysisResult.candlingAnalysis.features.veins.detected ? '✓ Detected' : '✗ Not Found'}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    Coverage: {analysisResult.candlingAnalysis.features.veins.coverage}%
                                  </p>
                                </div>
                                <div className="rounded-lg bg-white/70 p-2 ring-1 ring-violet-200">
                                  <p className="text-[9px] font-bold uppercase text-slate-500">Embryo</p>
                                  <p className={`text-sm font-bold ${
                                    analysisResult.candlingAnalysis.features.embryo.detected ? 'text-emerald-600' : 'text-slate-400'
                                  }`}>
                                    {analysisResult.candlingAnalysis.features.embryo.detected ? '✓ Detected' : '✗ Not Found'}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    Area: {analysisResult.candlingAnalysis.features.embryo.area}%
                                  </p>
                                </div>
                                <div className="rounded-lg bg-white/70 p-2 ring-1 ring-violet-200">
                                  <p className="text-[9px] font-bold uppercase text-slate-500">Air Cell</p>
                                  <p className={`text-sm font-bold ${
                                    analysisResult.candlingAnalysis.features.airCell.detected ? 'text-emerald-600' : 'text-slate-400'
                                  }`}>
                                    {analysisResult.candlingAnalysis.features.airCell.detected ? '✓ Found' : '✗ Not Found'}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    Size: {analysisResult.candlingAnalysis.features.airCell.size}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-white/70 p-2 ring-1 ring-violet-200">
                                  <p className="text-[9px] font-bold uppercase text-slate-500">Blood Ring</p>
                                  <p className={`text-sm font-bold ${
                                    analysisResult.candlingAnalysis.features.bloodRing.detected ? 'text-rose-600' : 'text-slate-400'
                                  }`}>
                                    {analysisResult.candlingAnalysis.features.bloodRing.detected ? '⚠ Detected' : '✗ Not Found'}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    {analysisResult.candlingAnalysis.features.bloodRing.detected ? 'Dead embryo sign' : 'Good sign'}
                                  </p>
                                </div>
                              </div>

                              {/* Description */}
                              <div className="mb-3 rounded-lg bg-white/70 p-3 ring-1 ring-violet-200">
                                <p className="text-[10px] font-bold uppercase text-slate-500">Analysis</p>
                                <p className="mt-1 text-xs leading-relaxed text-slate-700">
                                  {analysisResult.candlingAnalysis.classification.description}
                                </p>
                              </div>

                              {/* Recommendation */}
                              <div className={`rounded-lg p-3 ${
                                analysisResult.candlingAnalysis.classInfo.urgency === 'critical' ? 'bg-rose-100 ring-1 ring-rose-300' :
                                analysisResult.candlingAnalysis.classInfo.urgency === 'high' ? 'bg-amber-100 ring-1 ring-amber-300' :
                                'bg-emerald-100 ring-1 ring-emerald-300'
                              }`}>
                                <p className="text-[10px] font-bold uppercase text-slate-600">
                                  💡 Recommended Action
                                </p>
                                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-800">
                                  {analysisResult.candlingAnalysis.classification.recommendation}
                                </p>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : inferenceResult ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50/80 via-white/40 to-white/20 p-4 ring-1 ring-sky-200/50">
                          <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-sky-200/30 blur-2xl" />
                          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-600">
                            Detection Status
                          </p>
                          <div className="mt-1 flex items-baseline gap-1">
                            <span className="text-xl font-bold text-slate-900 capitalize">
                              {String(topClass).replace(/_/g, " ")}
                            </span>
                            <span className="text-[10px] font-semibold text-sky-500">
                              {typeof topConfidence === "number"
                                ? `${(topConfidence * 100).toFixed(0)}%`
                                : ""}
                            </span>
                          </div>
                        </div>

                        <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50/80 via-white/40 to-white/20 p-4 ring-1 ring-emerald-200/50">
                          <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-emerald-200/30 blur-2xl" />
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                            Total Count
                          </p>
                          <div className="mt-1">
                            <span className="text-xl font-bold text-slate-900">
                              {detectionCount}
                            </span>
                            <span className="ml-1 text-[10px] font-medium text-slate-400">
                              Eggs detected
                            </span>
                          </div>
                        </div>

                        <div className="col-span-full rounded-2xl border border-slate-200/70 bg-white/60 p-3">
                          <div className="max-h-[96px] overflow-auto pr-1">
                            <table className="w-full text-left text-[11px]">
                              <thead>
                                <tr className="border-b border-slate-50 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                  <th className="pb-2">Class</th>
                                  <th className="pb-2 text-right">Confidence</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {detectionCount > 0 ? (
                                  <tr>
                                    <td className="py-2 font-semibold text-slate-700 capitalize">
                                      {String(topClass).replace(/_/g, " ")}
                                    </td>
                                    <td className="py-2 text-right">
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">
                                        {typeof topConfidence === "number"
                                          ? `${(topConfidence * 100).toFixed(0)}%`
                                          : ""}
                                      </span>
                                    </td>
                                  </tr>
                                ) : null}
                                {modelPredictions.map((pred, i) => (
                                  <tr key={i}>
                                    <td className="py-2 font-semibold text-slate-700 capitalize">
                                      {String(pred.class).replace(/_/g, " ")}
                                    </td>
                                    <td className="py-2 text-right">
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">
                                        {(pred.confidence * 100).toFixed(0)}%
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                                {detectionCount === 0 ? (
                                  <tr>
                                    <td colSpan={2} className="py-4 text-center text-slate-400 italic">
                                      No eggs detected in this frame.
                                    </td>
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-28 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/80 bg-white/40">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900/5 ring-1 ring-slate-200/60">
                          <ScanLine className="h-5 w-5 text-slate-500" />
                        </div>
                        <p className="mt-3 text-[11px] font-medium text-slate-500">
                          Capture to start embryo scanning
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Results with AI analysis will appear here.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <canvas ref={canvasRef} className="hidden" />

                {/* NEW: Egg Position Modal */}
                {showEggPositionModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-2xl ring-1 ring-amber-200">
                      <div className="mb-4 text-center">
                        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 text-white text-3xl">
                          🥚
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900">Egg Position in Tray</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          Enter egg position (1-48) to track individual eggs in your 48-egg turner
                        </p>
                      </div>

                      <div className="mb-6">
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          Position Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="48"
                          value={eggPosition}
                          onChange={(e) => setEggPosition(e.target.value)}
                          placeholder="e.g., 1, 15, 48"
                          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          This helps track which specific eggs are fertile, infertile, or removed
                        </p>
                      </div>

                      <div className="mb-4 rounded-xl bg-amber-100 p-3 text-xs text-amber-800">
                        <p className="font-semibold mb-1">📊 Batch Progress:</p>
                        <p>Scanned: {batchEggCount.scanned}/{batchEggCount.total}</p>
                        <p>✓ Fertile: {batchEggCount.fertile} | ✗ Infertile: {batchEggCount.infertile} | ✗ Dead: {batchEggCount.dead}</p>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setShowEggPositionModal(false);
                            setPendingScanForPosition(null);
                          }}
                          className="flex-1 rounded-xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-300 transition"
                        >
                          Skip
                        </button>
                        <button
                          onClick={() => saveScanWithPosition(eggPosition || null)}
                          disabled={!eggPosition}
                          className="flex-1 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-3 text-sm font-semibold text-white hover:from-amber-700 hover:to-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save with Position
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* NEW: Batch Selection Modal */}
                {showBatchSelectModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-slate-900">Select Egg Batch</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          Choose which batch you're scanning for embryo candling detection.
                        </p>
                      </div>

                      <div className="mb-6 space-y-2 max-h-60 overflow-y-auto">
                        {availableBatches.length === 0 ? (
                          <div className="text-center py-8 text-slate-500">
                            <p className="text-4xl mb-2">📦</p>
                            <p className="text-sm font-medium">No batches found</p>
                            <p className="text-xs mt-1">Create a batch in Egg Batches page first</p>
                          </div>
                        ) : (
                          availableBatches.map((batch) => {
                            // Handle different date formats
                            let startDate;
                            if (batch.startDate?.toDate) {
                              startDate = batch.startDate.toDate();
                            } else if (batch.startDate) {
                              startDate = new Date(batch.startDate);
                            } else if (batch.createdAt?.toDate) {
                              startDate = batch.createdAt.toDate();
                            } else {
                              startDate = new Date();
                            }
                            
                            const incubationDay = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24));
                            const batchName = batch.batchId || batch.batchName || batch.name || batch.id;
                            const eggType = batch.eggType || batch.type || 'Chicken';
                            const totalDays = batch.incubationDays || batch.totalDays || 21;
                            
                            return (
                              <button
                                key={batch.id}
                                onClick={() => {
                                  setSelectedBatch(batch.id);
                                  setSelectedBatchData(batch);
                                  setBatchStartDate(startDate.toISOString().split('T')[0]);
                                  setShowBatchSelectModal(false);
                                }}
                                className="w-full text-left rounded-xl border-2 border-slate-200 p-4 hover:border-emerald-500 hover:bg-emerald-50 transition"
                              >
                                <p className="font-semibold text-slate-900">{batchName}</p>
                                <p className="text-xs text-slate-600 mt-1">
                                  {eggType} • Day {incubationDay} of {totalDays}
                                </p>
                                <p className="text-[10px] text-slate-500 mt-1">
                                  Started: {startDate.toLocaleDateString()}
                                </p>
                              </button>
                            );
                          })
                        )}
                      </div>

                      <button
                        onClick={() => setShowBatchSelectModal(false)}
                        className="w-full rounded-xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-300 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* NEW: Next Candling Notification Modal */}
                {showNextCandlingModal && nextCandlingDate && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 p-6 shadow-2xl ring-1 ring-blue-200">
                      <div className="mb-4 text-center">
                        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500 text-white text-3xl">
                          📅
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900">Next Candling Check Scheduled</h3>
                      </div>

                      <div className="mb-6 rounded-2xl bg-white p-4 ring-1 ring-blue-200">
                        <div className="text-center">
                          <p className="text-sm font-semibold text-blue-700 mb-2">{nextCandlingDate.name}</p>
                          <p className="text-3xl font-bold text-slate-900 mb-1">
                            {nextCandlingDate.date.toLocaleDateString()}
                          </p>
                          <p className="text-xs text-slate-600">
                            Incubation Day {nextCandlingDate.day}
                          </p>
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                            ⏰
                            {nextCandlingDate.daysUntil} days from now
                          </div>
                        </div>
                      </div>

                      <div className="mb-6 rounded-xl bg-blue-100 p-3 text-xs text-blue-800">
                        <p className="font-semibold mb-1">💡 Reminder:</p>
                        <p>You will be notified when it's time for the next embryo candling check. This helps track development progress.</p>
                      </div>

                      <button
                        onClick={() => setShowNextCandlingModal(false)}
                        className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:from-blue-700 hover:to-indigo-700 transition"
                      >
                        Got it!
                      </button>
                    </div>
                  </div>
                )}

                {/* Start Date Modal */}
                {showStartDateModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="mx-4 w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-slate-900">Set Batch Start Date</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          A developing embryo was detected. Please set the start date for this batch to enable proper incubation tracking.
                        </p>
                      </div>

                      <div className="mb-6">
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          Start Date <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={batchStartDate || ""}
                          onChange={(e) => setBatchStartDate(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                          max={new Date().toISOString().split('T')[0]}
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          This is the date when the eggs were placed in the incubator.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setShowStartDateModal(false);
                            setPendingScanData(null);
                            // Still save the scan without start date
                            if (pendingScanData) {
                              saveScanToFirebase(pendingScanData);
                            }
                          }}
                          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                        >
                          Skip
                        </button>
                        <button
                          onClick={handleStartDateConfirm}
                          disabled={!batchStartDate}
                          className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${
                            batchStartDate
                              ? "bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700"
                              : "bg-slate-300 cursor-not-allowed"
                          }`}
                        >
                          Confirm & Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* NEW: Scan History Modal */}
                {showHistory && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-4xl max-h-[80vh] rounded-3xl bg-white shadow-2xl flex flex-col">
                      {/* Header */}
                      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            <History className="h-5 w-5" />
                            Scan History
                          </h3>
                          <p className="mt-1 text-sm text-slate-600">
                            {scanHistory.length} scan{scanHistory.length !== 1 ? 's' : ''} recorded
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {scanHistory.length > 0 && (
                            <button
                              onClick={clearScanHistory}
                              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                            >
                              <Trash2 className="h-4 w-4" />
                              Clear All
                            </button>
                          )}
                          <button
                            onClick={() => setShowHistory(false)}
                            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                          >
                            <XCircle className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      {/* History List */}
                      <div className="flex-1 overflow-y-auto px-6 py-4">
                        {scanHistory.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <History className="h-12 w-12 text-slate-300 mb-3" />
                            <p className="text-sm font-medium text-slate-600">No scan history yet</p>
                            <p className="mt-1 text-xs text-slate-500">Your egg scans will be recorded here</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {scanHistory.map((scan, index) => {
                              const scanDate = scan.scannedAt instanceof Date ? scan.scannedAt : new Date(scan.scannedAt);
                              
                              // Determine status color
                              const statusColor = scan.status?.includes('Developing') || scan.status?.includes('Fertile') || scan.status?.includes('Viable')
                                ? 'emerald' 
                                : scan.status?.includes('Dead') || scan.status?.includes('Non-Viable')
                                ? 'rose'
                                : scan.status?.includes('Infertile') || scan.status?.includes('No Development')
                                ? 'slate'
                                : scan.status?.includes('Uncertain')
                                ? 'amber'
                                : 'blue';
                              
                              return (
                                <div
                                  key={scan.id || index}
                                  className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4 hover:shadow-md transition"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                      {/* Status Badge */}
                                      <div className="flex items-center gap-3 mb-3">
                                        <span className={`inline-flex items-center rounded-full bg-${statusColor}-100 px-3 py-1 text-xs font-semibold text-${statusColor}-700`}>
                                          {scan.status || 'Unknown'}
                                        </span>
                                        {scan.eggType && scan.eggType !== 'Unknown' && (
                                          <span className="text-xs text-slate-600">
                                            {scan.eggType}
                                          </span>
                                        )}
                                      </div>
                                      
                                      {/* Scan Details Grid */}
                                      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                                        {/* AI Model Detection */}
                                        <div className="rounded-lg bg-blue-50 p-2">
                                          <p className="text-[10px] text-slate-500 mb-1">AI Model Detection</p>
                                          <p className="font-semibold text-slate-800">{scan.topClass}</p>
                                          <p className="text-[10px] text-slate-600">Confidence: {scan.topConfidence}</p>
                                        </div>
                                        
                                        {/* Viability Score */}
                                        {scan.viabilityScore > 0 && (
                                          <div className="rounded-lg bg-emerald-50 p-2">
                                            <p className="text-[10px] text-slate-500 mb-1">Viability Score</p>
                                            <p className="font-semibold text-emerald-700">{scan.viabilityScore}%</p>
                                            <p className="text-[10px] text-slate-600">{scan.viabilityStatus || 'N/A'}</p>
                                          </div>
                                        )}
                                        
                                        {/* Confidence Level */}
                                        {scan.confidence && scan.confidence !== 'Unknown' && (
                                          <div>
                                            <span className="text-slate-500">Result Confidence:</span>
                                            <span className="ml-1 font-medium text-slate-700">{scan.confidence}</span>
                                          </div>
                                        )}
                                        
                                        {/* Detections Count */}
                                        {scan.detectionCount > 0 && (
                                          <div>
                                            <span className="text-slate-500">Detections:</span>
                                            <span className="ml-1 font-medium text-slate-700">{scan.detectionCount}</span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Observations */}
                                      {scan.observations && (
                                        <div className="mb-2">
                                          <p className="text-[10px] font-semibold text-slate-600 mb-1">Observations:</p>
                                          <p className="text-xs text-slate-700 line-clamp-2">
                                            {scan.observations}
                                          </p>
                                        </div>
                                      )}
                                      
                                      {/* Viability Indicators */}
                                      {scan.viabilityIndicators && scan.viabilityIndicators.length > 0 && (
                                        <div className="mb-2">
                                          <p className="text-[10px] font-semibold text-slate-600 mb-1">Viability Indicators:</p>
                                          <div className="flex flex-wrap gap-1">
                                            {scan.viabilityIndicators.slice(0, 3).map((indicator, idx) => (
                                              <span key={idx} className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                                                ✓ {indicator}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Timestamp */}
                                    <div className="text-right shrink-0">
                                      <p className="text-xs font-medium text-slate-600">
                                        {scanDate.toLocaleDateString()}
                                      </p>
                                      <p className="text-[10px] text-slate-500">
                                        {scanDate.toLocaleTimeString()}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="border-t border-slate-200 px-6 py-4">
                        <button
                          onClick={() => setShowHistory(false)}
                          className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white hover:from-indigo-700 hover:to-blue-700 transition"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
