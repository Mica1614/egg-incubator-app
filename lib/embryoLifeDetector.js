// @ts-nocheck
/**
 * Embryo Life Detection System
 * 
 * Determines if embryo is:
 * - Alive (Healthy)
 * - Alive (At Risk)
 * - Dead
 * - Infertile
 * 
 * Uses candling observations, environmental data, and timeline validation
 */

/**
 * Embryo Life Detector
 */
class EmbryoLifeDetector {
  /**
   * Main detection function
   * @param {Object} candlingObservations - Veins, movement, blood ring, air cell, clarity
   * @param {Object} environmentalData - Temperature, humidity history
   * @param {number} incubationDay - Current day of incubation
   * @returns {Object} Detection result with status, confidence, indicators, recommendation
   */
  static detectLife(candlingObservations, environmentalData, incubationDay) {
    const {
      veinsVisible = false,
      veinsStrength = "none", // none, weak, strong
      movement = false,
      bloodRing = false,
      airCellNormal = true,
      eggClarity = "clear", // clear, darkening, dark
      cloudyAppearance = false,
    } = candlingObservations;

    const {
      temperatureHistory = [],
      humidityHistory = [],
      temperatureStable = true,
      humidityStable = true,
    } = environmentalData;

    let status, confidence, observedIndicators, recommendation, actionRequired;

    // ==========================================
    // DEAD EMBRYO DETECTION
    // ==========================================
    
    // Blood ring is definitive sign of death
    if (bloodRing) {
      status = "Dead";
      confidence = "High";
      observedIndicators = "Blood ring detected - embryo death confirmed";
      recommendation = "Remove egg immediately to prevent contamination and explosion risk";
      actionRequired = "urgent_removal";
    }
    // No veins after Day 7 + cloudy appearance
    else if (!veinsVisible && incubationDay > 7 && cloudyAppearance) {
      status = "Dead";
      confidence = "High";
      observedIndicators = "No veins visible after Day 7 with cloudy appearance - embryo death likely";
      recommendation = "Remove egg within 24-48 hours to prevent contamination";
      actionRequired = "urgent_removal";
    }
    // No veins, no growth, no movement over multiple days
    else if (!veinsVisible && !movement && incubationDay >= 7 && eggClarity === "clear") {
      status = "Dead";
      confidence = "Medium";
      observedIndicators = "No veins, movement, or growth detected since Day 7";
      recommendation = "Monitor for 24 hours, then remove if no changes";
      actionRequired = "monitor_then_remove";
    }

    // ==========================================
    // INFERTILE DETECTION
    // ==========================================
    
    // Clear egg with no development by Day 7
    else if (!veinsVisible && !movement && incubationDay >= 7 && eggClarity === "clear" && !cloudyAppearance) {
      status = "Infertile";
      confidence = "High";
      observedIndicators = "Egg remains clear with no vein development by Day 7 - likely infertile";
      recommendation = "Remove egg to save incubator space";
      actionRequired = "removal_recommended";
    }
    // Very early stage, no signs yet (before Day 5)
    else if (!veinsVisible && !movement && incubationDay < 5) {
      status = "Unknown - Too Early";
      confidence = "Low";
      observedIndicators = `No development signs yet at Day ${incubationDay} - too early to determine`;
      recommendation = `Continue incubation and re-scan at Day 5-7`;
      actionRequired = "continue_monitoring";
    }

    // ==========================================
    // AT RISK DETECTION
    // ==========================================
    
    // Weak veins + environmental instability
    else if (veinsVisible && veinsStrength === "weak" && (!temperatureStable || !humidityStable)) {
      status = "Alive (At Risk)";
      confidence = "Medium";
      observedIndicators = "Weak vein development with environmental instability detected";
      recommendation = "Stabilize temperature and humidity immediately, monitor closely";
      actionRequired = "immediate_intervention";
    }
    // Weak veins only
    else if (veinsVisible && veinsStrength === "weak") {
      status = "Alive (At Risk)";
      confidence = "Medium";
      observedIndicators = "Weak or faint veins detected - embryo development below normal";
      recommendation = "Monitor closely for next 48 hours, check environmental conditions";
      actionRequired = "close_monitoring";
    }
    // No movement but veins present
    else if (veinsVisible && !movement && incubationDay >= 8) {
      status = "Alive (At Risk)";
      confidence = "Medium";
      observedIndicators = "Veins present but no visible movement - embryo may be weak";
      recommendation = "Continue incubation but monitor for movement within 24-48 hours";
      actionRequired = "close_monitoring";
    }
    // Abnormal growth pattern
    else if (veinsVisible && eggClarity === "clear" && incubationDay >= 10) {
      status = "Alive (At Risk)";
      confidence = "Low";
      observedIndicators = "Egg not darkening as expected - growth may be stunted";
      recommendation = "Review temperature and humidity history, monitor development";
      actionRequired = "close_monitoring";
    }

    // ==========================================
    // ALIVE (HEALTHY) DETECTION
    // ==========================================
    
    // Strong veins + movement
    else if (veinsVisible && movement && veinsStrength === "strong") {
      status = "Alive (Healthy)";
      confidence = "High";
      observedIndicators = "Visible veins and movement detected - embryo developing normally";
      recommendation = "Continue incubation - embryo is healthy";
      actionRequired = "continue_incubation";
    }
    // Veins present + normal darkening
    else if (veinsVisible && eggClarity === "darkening") {
      status = "Alive (Healthy)";
      confidence = "High";
      observedIndicators = "Visible veins with normal egg darkening - growth progressing well";
      recommendation = "Continue incubation";
      actionRequired = "continue_incubation";
    }
    // Veins present (general healthy case)
    else if (veinsVisible && veinsStrength === "strong") {
      status = "Alive (Healthy)";
      confidence = "High";
      observedIndicators = "Visible veins detected - embryo is alive and developing";
      recommendation = "Continue incubation";
      actionRequired = "continue_incubation";
    }
    // Late stage - mostly dark with air cell (normal)
    else if (incubationDay >= 15 && eggClarity === "dark" && airCellNormal) {
      status = "Alive (Healthy)";
      confidence = "High";
      observedIndicators = "Egg mostly dark with normal air cell - embryo fully developed";
      recommendation = incubationDay >= 18 
        ? "Lockdown phase - do not disturb, prepare for hatching"
        : "Continue incubation - approaching hatching stage";
      actionRequired = "continue_incubation";
    }

    // ==========================================
    // FALLBACK
    // ==========================================
    
    else {
      status = "Uncertain";
      confidence = "Low";
      observedIndicators = "Insufficient indicators to determine embryo status";
      recommendation = "Re-scan in 24-48 hours with better candling conditions";
      actionRequired = "recheck_soon";
    }

    // ==========================================
    // TIME-BASED VALIDATION
    // ==========================================
    
    const validation = this.validateWithTimeline(status, incubationDay, {
      veinsVisible,
      movement,
      eggClarity,
    });

    if (!validation.matches) {
      // Reduce confidence if timeline doesn't match
      confidence = confidence === "High" ? "Medium" : "Low";
      observedIndicators += ` [Timeline note: ${validation.message}]`;
    }

    // ==========================================
    // COMPILE RESULT
    // ==========================================
    
    return {
      status,
      confidence,
      observedIndicators,
      recommendation,
      actionRequired,
      incubationDay,
      timelineValidation: validation,
      alertRequired: this.needsAlert(status, actionRequired),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate detection against expected timeline
   */
  static validateWithTimeline(status, day, observations) {
    let matches = true;
    let message = "";

    // Day 5-7: Should see veins
    if (day >= 5 && day <= 7) {
      if (!observations.veinsVisible && status !== "Infertile" && status !== "Dead") {
        matches = false;
        message = "Veins expected by Day 5-7";
      }
    }
    // Day 8-14: Should see growth and possibly movement
    else if (day >= 8 && day <= 14) {
      if (!observations.veinsVisible) {
        matches = false;
        message = "Growth and veins expected by Day 8-14";
      } else if (!observations.movement && observations.eggClarity === "clear") {
        matches = false;
        message = "Some movement or darkening expected by Day 8-14";
      }
    }
    // Day 15-21: Should be mostly dark with air cell
    else if (day >= 15 && day <= 21) {
      if (observations.eggClarity === "clear") {
        matches = false;
        message = "Egg should be mostly dark by Day 15+";
      }
    }

    return { matches, message, day, expectedRange: this.getExpectedRange(day) };
  }

  /**
   * Get expected development for day range
   */
  static getExpectedRange(day) {
    if (day < 5) return "Pre-detection phase - development too early to see";
    if (day <= 7) return "Veins should be visible - fertility confirmation stage";
    if (day <= 14) return "Growth and movement expected - development monitoring";
    if (day <= 17) return "Egg darkening, embryo growing - late development";
    if (day <= 21) return "Mostly dark with air cell - hatching phase";
    return "Post-hatching";
  }

  /**
   * Determine if alert should be sent
   */
  static needsAlert(status, actionRequired) {
    const alertStatuses = ["Dead", "Alive (At Risk)"];
    const alertActions = ["urgent_removal", "immediate_intervention", "monitor_then_remove"];

    return alertStatuses.includes(status) || alertActions.includes(actionRequired);
  }

  /**
   * Generate alert message for SMS/Email
   */
  static generateAlertMessage(detection, eggId, batchId) {
    const { status, confidence, observedIndicators, recommendation } = detection;

    // SMS Message (concise)
    const sms = status === "Dead"
      ? `❌ DEAD EMBRYO: Egg ${eggId} in batch ${batchId}. ${observedIndicators}. ${recommendation}`
      : status === "Alive (At Risk)"
      ? `⚠️ AT RISK: Egg ${eggId} in batch ${batchId}. ${observedIndicators}. ${recommendation}`
      : null;

    // Email Message (detailed)
    const email = {
      subject: status === "Dead"
        ? `❌ URGENT: Dead Embryo Detected - Egg ${eggId}`
        : `⚠️ WARNING: Embryo At Risk - Egg ${eggId}`,
      body: `Embryo Viability Alert

Egg Details:
- Egg ID: ${eggId}
- Batch ID: ${batchId}
- Incubation Day: ${detection.incubationDay}

Status: ${status}
Confidence: ${detection.confidence}

Observed Indicators:
${observedIndicators}

Recommended Action:
${recommendation}

Timeline Validation:
${detection.timelineValidation.matches 
  ? "✓ Development matches expected timeline" 
  : `⚠ Note: ${detection.timelineValidation.message}`}

Timestamp: ${detection.timestamp}

${status === "Dead" 
  ? "IMPORTANT: Remove dead embryo within 24-48 hours to prevent contamination and explosion risk."
  : "Please take action immediately to improve embryo viability."}`
    };

    return { sms, email };
  }
}

/**
 * Helper: Extract candling observations from 5-class image analysis
 * Enhanced to fully utilize 5-Class Egg Candling Analysis results
 */
function extractCandlingObservations(imageAnalysis) {
  const { features, classification, confidence } = imageAnalysis || {};

  // Extract detailed feature data from 5-class analysis
  const veinsData = features?.veins || {};
  const embryoData = features?.embryo || {};
  const bloodRingData = features?.bloodRing || {};
  const airCellData = features?.airCell || {};

  // Determine veins visibility and strength based on 5-class analysis
  const veinsVisible = veinsData.detected || false;
  const veinsConfidence = veinsData.confidence || 0;
  const veinsStrength = veinsConfidence > 60 ? "strong" : 
                        veinsConfidence > 30 ? "weak" : "none";

  // Determine egg clarity based on 5-class classification
  // 5 classes: infertile, day1_3, day4_6, day7_10, dead
  let eggClarity = "clear";
  if (classification === "day7_10") {
    eggClarity = "darkening"; // Late stage shows darkening
  } else if (classification === "day4_6") {
    eggClarity = "slightly_dark"; // Mid stage slight darkening
  } else if (classification === "day1_3") {
    eggClarity = "clear"; // Early stage still clear
  } else if (classification === "infertile") {
    eggClarity = "clear"; // Infertile remains clear
  } else if (classification === "dead") {
    eggClarity = "cloudy"; // Dead embryo appears cloudy
  }

  // Blood ring detection from 5-class analysis
  const bloodRing = bloodRingData.detected || false;

  // Cloudy appearance for dead embryos
  const cloudyAppearance = classification === "dead" || eggClarity === "cloudy";

  // Air cell analysis
  const airCellNormal = airCellData.detected && 
                        (airCellData.size === "medium" || airCellData.size === "large");

  // Movement detection (requires video or multiple scans - default false)
  const movement = false;

  console.log("5-Class Candling Observations Extracted:", {
    classification,
    confidence,
    veinsVisible,
    veinsStrength,
    veinsConfidence,
    embryoDetected: embryoData.detected,
    embryoConfidence: embryoData.confidence,
    bloodRing,
    eggClarity,
    cloudyAppearance,
    airCellNormal,
  });

  return {
    veinsVisible,
    veinsStrength,
    veinsConfidence,
    movement,
    bloodRing,
    airCellNormal,
    eggClarity,
    cloudyAppearance,
    // Include raw 5-class data for AI Decision Engine
    classification,
    classificationConfidence: confidence,
    embryoDetected: embryoData.detected,
    embryoConfidence: embryoData.confidence,
    embryoArea: embryoData.area,
    veinsCoverage: veinsData.coverage,
    airCellSize: airCellData.size,
    airCellCoverage: airCellData.coverage,
  };
}

/**
 * Helper: Extract environmental data
 */
function extractEnvironmentalData(sensorData) {
  const { temperatureHistory = [], humidityHistory = [] } = sensorData;

  // Calculate stability
  const tempStable = calculateStability(temperatureHistory);
  const humidityStable = calculateStability(humidityHistory);

  return {
    temperatureHistory,
    humidityHistory,
    temperatureStable: tempStable > 0.8,
    humidityStable: humidityStable > 0.8,
  };
}

/**
 * Calculate data stability (0-1)
 */
function calculateStability(history) {
  if (history.length < 2) return 1;

  const values = history.map(h => h.value || h.temperature || h.humidity || 0);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Normalize: lower stdDev = higher stability
  return Math.max(0, Math.min(1, 1 - (stdDev / 5)));
}

// Export
export { EmbryoLifeDetector, extractCandlingObservations, extractEnvironmentalData };
