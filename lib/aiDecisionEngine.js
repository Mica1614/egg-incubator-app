// @ts-nocheck
/**
 * AI Decision-Making Engine for Smart Egg Incubator
 * 
 * Evaluates embryo viability using:
 * - Candling observations
 * - Sensor data
 * - Time-based incubation progress
 * 
 * Outputs:
 * - Embryo Status (Healthy, At Risk, Dead, Infertile)
 * - Confidence Level (0-100%)
 * - Observed Evidence
 * - Reasoning
 * - Recommended Action
 */

/**
 * AI Decision Engine
 */
class AIDecisionEngine {
  /**
   * Main decision-making function
   * @param {Object} inputData - Combined input data
   * @returns {Object} Decision output with status, confidence, evidence, reasoning, action
   */
  static makeDecision(inputData) {
    const {
      candlingObservations = {},
      sensorData = {},
      incubationDay = 0,
      imageAnalysis = null,
      historicalChecks = [],
    } = inputData;

    // Extract candling data
    const {
      veinsVisible = false,
      veinsStrength = "none",
      veinsConfidence = 0,
      movement = false,
      bloodRing = false,
      airCellSize = "normal",
      eggClarity = "clear",
      cloudyAppearance = false,
      // 5-Class Candling Analysis data
      classification = null,
      classificationConfidence = 0,
      embryoDetected = false,
      embryoConfidence = 0,
      embryoArea = 0,
      veinsCoverage = 0,
      airCellCoverage = 0,
    } = candlingObservations;

    // Extract sensor data
    const {
      temperature = 37.5,
      humidity = 50,
      temperatureStable = true,
      humidityStable = true,
      temperatureHistory = [],
      humidityHistory = [],
    } = sensorData;

    // ==========================================
    // CONFIDENCE CALCULATION ENGINE
    // ==========================================
    
    let confidence = 0;
    let status = "Unknown";
    let evidence = [];
    let reasoning = [];
    let action = "";
    let alertLevel = "none"; // none, info, warning, urgent

    // ==========================================
    // DECISION LOGIC - SIMPLIFIED & CORRECT
    // ==========================================
    
    // DEBUG: Log what we're actually detecting
    console.log("=== AI DECISION ENGINE INPUT ===");
    console.log("veinsVisible:", veinsVisible);
    console.log("veinsStrength:", veinsStrength);
    console.log("veinsConfidence:", veinsConfidence);
    console.log("classification:", classification);
    console.log("classificationConfidence:", classificationConfidence);
    console.log("bloodRing:", bloodRing);
    console.log("eggClarity:", eggClarity);
    console.log("incubationDay:", incubationDay);
    console.log("===============================");

    // ==========================================
    // PRIORITY 1: VEINS VISIBLE = EMBRYO IS ALIVE!
    // ==========================================
    if (veinsVisible) {
      // ANY veins visible means the embryo is ALIVE
      if (veinsStrength === "strong" && movement) {
        // Best case: strong veins + movement
        confidence = 95;
        status = "Healthy";
        evidence = [
          "STRONG VEINS detected - PRIMARY indicator of life",
          "Embryo movement observed - CONFIRMS active development",
          `Vein confidence: ${veinsConfidence}%`,
          classification ? `5-Class: ${classification} (${classificationConfidence}%)` : null
        ].filter(Boolean);
        reasoning = [
          "VISIBLE VEINS are the #1 indicator of a living embryo",
          "Strong vein network shows healthy vascular development",
          "Movement confirms the embryo is active and developing"
        ];
        action = "Continue incubation - embryo is healthy and developing well";
        alertLevel = "info";
      }
      else if (veinsStrength === "strong") {
        // Strong veins but no movement detected (movement is hard to see in still images)
        confidence = 90;
        status = "Healthy";
        evidence = [
          "STRONG VEINS detected - PRIMARY indicator of life",
          `Vein confidence: ${veinsConfidence}%`,
          `Vein coverage: ${veinsCoverage}%`,
          classification ? `5-Class: ${classification} (${classificationConfidence}%)` : null
        ].filter(Boolean);
        reasoning = [
          "VISIBLE VEINS confirm the embryo is alive",
          "Strong vein pattern indicates healthy development",
          "Movement may not be visible in still images but veins confirm life"
        ];
        action = "Continue incubation - embryo is alive and developing";
        alertLevel = "info";
      }
      else if (veinsStrength === "weak") {
        // Weak veins but STILL ALIVE
        confidence = 75;
        status = "Healthy";
        evidence = [
          "Veins detected - embryo is ALIVE",
          `Vein strength: weak (confidence: ${veinsConfidence}%)`,
          "Vein network present but could be stronger"
        ];
        reasoning = [
          "VEINS ARE VISIBLE - this means the embryo is alive",
          "Vein strength is weaker than ideal but still indicates life",
          "Could be early stage or minor developmental variation"
        ];
        action = "Continue incubation - monitor to ensure veins strengthen";
        alertLevel = "info";
      }
      else {
        // Veins detected but strength unclear - STILL ALIVE
        confidence = 80;
        status = "Healthy";
        evidence = [
          "Veins detected - embryo is ALIVE",
          `Vein confidence: ${veinsConfidence}%`
        ];
        reasoning = [
          "Any visible vein network means the embryo is living",
          "Development is ongoing"
        ];
        action = "Continue incubation - re-candle in 2-3 days";
        alertLevel = "info";
      }
    }
    // ==========================================
    // PRIORITY 2: NO VEINS - Check for death/infertile
    // ==========================================
    else if (!veinsVisible && bloodRing) {
      // Blood ring WITHOUT veins = dead
      confidence = 92;
      status = "Dead";
      evidence = [
        "Blood ring detected - sign of embryo death",
        "NO visible veins (veins have broken down)"
      ];
      reasoning = [
        "Blood ring forms when embryo dies",
        "No visible veins confirms development has stopped"
      ];
      action = "Remove egg to prevent contamination";
      alertLevel = "urgent";
    }
    else if (!veinsVisible && classification === "dead" && veinsConfidence < 20) {
      // 5-class says dead AND very low vein confidence
      confidence = 70;
      status = "Dead";
      evidence = [
        "5-Class analysis suggests dead embryo",
        `Very low vein detection: ${veinsConfidence}%`,
        "No visible vein network"
      ];
      reasoning = [
        "Both 5-class classification and vein detection suggest no life",
        "However, recommend confirmation scan to be certain"
      ];
      action = "Re-candle in 24-48 hours to confirm before removing";
      alertLevel = "warning";
    }
    else if (!veinsVisible && incubationDay >= 7 && eggClarity === "clear") {
      // No veins after Day 7 and still clear = likely infertile
      confidence = 82;
      status = incubationDay >= 10 ? "Infertile" : "At Risk";
      evidence = [
        `No veins visible at Day ${incubationDay}`,
        "Egg remains clear - no development signs"
      ];
      reasoning = [
        incubationDay >= 10 
          ? "By Day 10+, veins should be clearly visible if fertile"
          : "By Day 7, veins should be starting to show"
      ];
      action = incubationDay >= 10 
        ? "Remove egg - likely infertile" 
        : "Re-candle in 2-3 days to check for late development";
      alertLevel = incubationDay >= 10 ? "warning" : "info";
    }
    else if (!veinsVisible && incubationDay < 5) {
      // Too early to tell
      confidence = 40;
      status = "At Risk";
      evidence = [
        `Day ${incubationDay} - too early for definitive assessment`,
        "Veins typically visible by Day 5-7"
      ];
      reasoning = [
        "Development may not be visible yet at this early stage"
      ];
      action = "Continue incubation and re-scan at Day 5-7";
      alertLevel = "info";
    }
    // ==========================================
    // FALLBACK
    // ==========================================
    else {
      confidence = 50;
      status = "At Risk";
      evidence = ["Insufficient data for clear classification"];
      reasoning = ["Image quality or development stage unclear"];
      action = "Re-scan in 24-48 hours with better candling";
      alertLevel = "warning";
    }

    // ==========================================
    // TIME-BASED CONFIDENCE ADJUSTMENT
    // ==========================================
    
    const timeAdjustment = this.applyTimeBasedValidation(
      status, confidence, incubationDay, candlingObservations, historicalChecks
    );
    
    confidence = timeAdjustment.adjustedConfidence;
    if (timeAdjustment.message) {
      reasoning.push(timeAdjustment.message);
    }

    // ==========================================
    // HISTORICAL TREND ANALYSIS
    // ==========================================
    
    if (historicalChecks.length > 0) {
      const trendAnalysis = this.analyzeHistoricalTrend(historicalChecks, status, incubationDay);
      confidence = trendAnalysis.adjustedConfidence;
      if (trendAnalysis.insight) {
        reasoning.push(trendAnalysis.insight);
      }
    }

    // ==========================================
    // ENVIRONMENTAL IMPACT ASSESSMENT
    // ==========================================
    
    const environmentalImpact = this.assessEnvironmentalImpact(
      temperature, humidity, temperatureStable, humidityStable, temperatureHistory, humidityHistory
    );
    
    if (environmentalImpact.riskFactor > 0) {
      confidence = Math.max(0, confidence - environmentalImpact.riskFactor);
      reasoning.push(environmentalImpact.message);
    }

    // Ensure confidence is within bounds
    confidence = Math.max(0, Math.min(100, Math.round(confidence)));

    // ==========================================
    // GENERATE FINAL OUTPUT
    // ==========================================
    
    const decisionOutput = {
      embryoStatus: status,
      confidenceLevel: confidence,
      observedEvidence: evidence.join(". "),
      reasoning: reasoning.join(". "),
      recommendedAction: action,
      alertLevel: alertLevel,
      incubationDay: incubationDay,
      timestamp: new Date().toISOString(),
      
      // Alert message generation
      alertMessage: this.generateAlertMessage(
        status, confidence, incubationDay, action, evidence[0]
      ),
      
      // Detailed breakdown for UI
      breakdown: {
        status,
        confidence,
        evidence,
        reasoning,
        action,
        environmentalFactors: {
          temperature,
          humidity,
          temperatureStable,
          humidityStable,
        },
        candlingIndicators: {
          veinsVisible,
          veinsStrength,
          movement,
          bloodRing,
          eggClarity,
        },
      }
    };

    return decisionOutput;
  }

  /**
   * Apply time-based validation rules
   */
  static applyTimeBasedValidation(status, confidence, day, observations, historicalChecks) {
    let adjustedConfidence = confidence;
    let message = "";

    // Day 5-7: Focus on fertility (vein detection is critical)
    if (day >= 5 && day <= 7) {
      if (status === "Healthy" && observations.veinsVisible) {
        adjustedConfidence = Math.min(100, confidence + 5);
        message = "Time validation: Vein detection at Day 5-7 confirms fertility";
      } else if (status === "Infertile" && !observations.veinsVisible) {
        adjustedConfidence = Math.min(100, confidence + 3);
        message = "Time validation: No veins at Day 7 strongly indicates infertility";
      } else if (status === "At Risk" && !observations.veinsVisible) {
        adjustedConfidence = Math.min(100, confidence + 5);
        message = "Time validation: Veins expected by Day 7 - concern validated";
      }
    }
    // Day 8-14: Focus on growth and development consistency
    else if (day >= 8 && day <= 14) {
      if (status === "Healthy" && observations.veinsVisible) {
        adjustedConfidence = Math.min(100, confidence + 3);
        message = "Time validation: Development consistent with Day 8-14 expectations";
      } else if (status === "Dead" && !observations.veinsVisible && !observations.movement) {
        adjustedConfidence = Math.min(100, confidence + 5);
        message = "Time validation: No growth or movement at Day 8-14 confirms concern";
      }
    }
    // Day 15-21: Focus on readiness and survival to hatch
    else if (day >= 15 && day <= 21) {
      if (status === "Healthy" && observations.eggClarity === "dark") {
        adjustedConfidence = Math.min(100, confidence + 5);
        message = "Time validation: Late stage development matches Day 15-21 expectations";
      } else if (status === "Dead" && observations.eggClarity === "clear") {
        adjustedConfidence = Math.min(100, confidence + 8);
        message = "Time validation: Egg should be dark by Day 15+ - clear appearance confirms issue";
      }
    }

    // If no improvement observed over time, increase confidence of negative outcome
    if (historicalChecks.length >= 2) {
      const recentChecks = historicalChecks.slice(-2);
      const noImprovement = recentChecks.every(
        check => !check.veinsVisible || check.veinsStrength === "weak"
      );
      
      if (noImprovement && (status === "Dead" || status === "At Risk")) {
        adjustedConfidence = Math.min(100, confidence + 7);
        message += " Historical data shows no improvement over time.";
      }
    }

    return { adjustedConfidence, message };
  }

  /**
   * Analyze historical trend from multiple checks
   */
  static analyzeHistoricalTrend(historicalChecks, currentStatus, currentDay) {
    if (historicalChecks.length === 0) {
      return { adjustedConfidence: 0, insight: "" };
    }

    let adjustedConfidence = 0;
    let insight = "";

    // Check for consistent patterns
    const healthyChecks = historicalChecks.filter(
      check => check.status === "Healthy"
    ).length;
    
    const atRiskChecks = historicalChecks.filter(
      check => check.status === "At Risk"
    ).length;

    const deadChecks = historicalChecks.filter(
      check => check.status === "Dead"
    ).length;

    const totalChecks = historicalChecks.length;

    // If consistently healthy, boost confidence
    if (healthyChecks === totalChecks && currentStatus === "Healthy") {
      adjustedConfidence = 5;
      insight = `Trend analysis: ${totalChecks} consecutive healthy checks confirm stable development`;
    }
    // If deteriorating, boost confidence in negative outcome
    else if (deadChecks > healthyChecks && currentStatus === "Dead") {
      adjustedConfidence = 8;
      insight = `Trend analysis: Deteriorating pattern over ${totalChecks} checks confirms decline`;
    }
    // If improving, boost confidence in positive outcome
    else if (currentStatus === "Healthy" && atRiskChecks > 0) {
      adjustedConfidence = 5;
      insight = `Trend analysis: Improvement from ${atRiskChecks} at-risk checks to healthy status`;
    }

    return { adjustedConfidence, insight };
  }

  /**
   * Assess environmental impact on confidence
   */
  static assessEnvironmentalImpact(
    temperature, humidity, tempStable, humidityStable, tempHistory, humidityHistory
  ) {
    let riskFactor = 0;
    let message = "";

    // Temperature assessment
    if (!tempStable) {
      riskFactor += 8;
      message = "Environmental: Temperature instability detected - reduces confidence";
    } else if (temperature < 36.5 || temperature > 38.5) {
      riskFactor += 10;
      message = `Environmental: Temperature ${temperature}°C outside optimal range (37.0-38.0°C)`;
    }

    // Humidity assessment
    if (!humidityStable) {
      riskFactor += 5;
      message += message ? " and humidity instability" : "Environmental: Humidity instability detected";
    } else if (humidity < 40 || humidity > 60) {
      riskFactor += 6;
      message += message ? ` and humidity ${humidity}% suboptimal` : `Environmental: Humidity ${humidity}% outside optimal range (45-55%)`;
    }

    return { riskFactor, message: message + " - reduces confidence" };
  }

  /**
   * Generate alert message for notifications
   */
  static generateAlertMessage(status, confidence, day, action, primaryEvidence) {
    const statusEmoji = {
      "Healthy": "🟢",
      "At Risk": "🟡",
      "Dead": "🔴",
      "Infertile": "⭕",
    };

    const alertType = {
      "Healthy": "Status Update",
      "At Risk": "Warning Alert",
      "Dead": "Urgent Alert",
      "Infertile": "Warning Alert",
    };

    return {
      subject: `${statusEmoji[status] || "🔍"} ${alertType[status] || "Update"} - Day ${day} (${confidence}% confidence)`,
      body: `Embryo Status: ${status}
Confidence: ${confidence}%
Incubation Day: ${day}

Evidence: ${primaryEvidence}

Recommended Action: ${action}

Timestamp: ${new Date().toISOString()}`,
      sms: `${statusEmoji[status]} ${status.toUpperCase()}: Day ${day}, ${confidence}% confidence. ${action}`,
    };
  }

  /**
   * Format decision for display
   */
  static formatForDisplay(decision) {
    const statusColors = {
      "Healthy": "emerald",
      "At Risk": "amber",
      "Dead": "rose",
      "Infertile": "slate",
    };

    const confidenceColor = 
      decision.confidenceLevel >= 80 ? "emerald" :
      decision.confidenceLevel >= 50 ? "amber" : "rose";

    return {
      ...decision,
      displayColor: statusColors[decision.embryoStatus] || "blue",
      confidenceColor,
      confidenceLabel: 
        decision.confidenceLevel >= 80 ? "High" :
        decision.confidenceLevel >= 50 ? "Medium" : "Low",
    };
  }
}

export { AIDecisionEngine };
