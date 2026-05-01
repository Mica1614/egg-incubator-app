// @ts-nocheck
/**
 * Advanced AI Embryo Monitoring, Detection & Prediction System
 * 
 * Features:
 * - Embryo status classification (Healthy, At Risk, Weak, Dead, Infertile)
 * - Viability scoring (0-100%)
 * - Cause analysis engine
 * - Predictive risk detection
 * - Development timeline monitoring
 * - Mortality pattern analysis
 * - Smart recommendation engine
 * - Intervention alerts
 */

import { collection, addDoc, query, where, orderBy, getDocs, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

// ==========================================
// 1. EMBRYO STATUS CLASSIFICATION
// ==========================================

const EMBRYO_STATUS = {
  HEALTHY: {
    id: "HEALTHY",
    label: "Healthy",
    color: "emerald",
    icon: "✅",
    description: "Embryo developing normally with strong viability",
    actionRequired: false,
  },
  AT_RISK: {
    id: "AT_RISK",
    label: "At Risk",
    color: "amber",
    icon: "⚠️",
    description: "Embryo showing signs of stress, needs monitoring",
    actionRequired: true,
  },
  WEAK_DEVELOPMENT: {
    id: "WEAK_DEVELOPMENT",
    label: "Weak Development",
    color: "orange",
    icon: "⚡",
    description: "Embryo development is below expected progress",
    actionRequired: true,
  },
  DEAD: {
    id: "DEAD",
    label: "Dead",
    color: "rose",
    icon: "❌",
    description: "Embryo has stopped developing",
    actionRequired: true,
  },
  INFERTILE: {
    id: "INFERTILE",
    label: "Infertile",
    color: "slate",
    icon: "⭕",
    description: "Egg was never fertilized",
    actionRequired: true,
  },
};

// ==========================================
// 2. VIABILITY SCORING SYSTEM
// ==========================================

class ViabilityScorer {
  /**
   * Calculate embryo viability score (0-100%)
   */
  static calculate({
    temperatureHistory = [],
    humidityHistory = [],
    turningData = {},
    incubationDay = 0,
    developmentProgress = {},
    sensorReadings = {},
  }) {
    let score = 100; // Start with perfect score
    const deductions = [];

    // Temperature Stability (max -30 points)
    const tempScore = this.scoreTemperature(temperatureHistory, sensorReadings.temperature);
    score -= tempScore.deduction;
    if (tempScore.deduction > 0) {
      deductions.push(...tempScore.issues);
    }

    // Humidity Consistency (max -25 points)
    const humidityScore = this.scoreHumidity(humidityHistory, sensorReadings.humidity);
    score -= humidityScore.deduction;
    if (humidityScore.deduction > 0) {
      deductions.push(...humidityScore.issues);
    }

    // Turning Accuracy (max -20 points)
    const turningScore = this.scoreTurning(turningData);
    score -= turningScore.deduction;
    if (turningScore.deduction > 0) {
      deductions.push(...turningScore.issues);
    }

    // Development Timing (max -25 points)
    const developmentScore = this.scoreDevelopment(incubationDay, developmentProgress);
    score -= developmentScore.deduction;
    if (developmentScore.deduction > 0) {
      deductions.push(...developmentScore.issues);
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));

    // Classify based on score
    let status, riskLevel;
    if (score >= 80) {
      status = EMBRYO_STATUS.HEALTHY;
      riskLevel = "low";
    } else if (score >= 65) {
      status = EMBRYO_STATUS.AT_RISK;
      riskLevel = "medium";
    } else if (score >= 50) {
      status = EMBRYO_STATUS.WEAK_DEVELOPMENT;
      riskLevel = "high";
    } else {
      status = EMBRYO_STATUS.CRITICAL;
      riskLevel = "critical";
    }

    return {
      score: Math.round(score),
      status: status.id,
      statusLabel: status.label,
      riskLevel,
      deductions,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Score temperature stability
   */
  static scoreTemperature(history, currentTemp) {
    let deduction = 0;
    const issues = [];
    const idealTemp = 37.5;
    const acceptableRange = { min: 37.0, max: 38.0 };
    const criticalRange = { min: 36.0, max: 39.0 };

    // Check current temperature
    if (currentTemp !== undefined && currentTemp !== null) {
      if (currentTemp < criticalRange.min || currentTemp > criticalRange.max) {
        deduction += 20;
        issues.push(`Critical temperature: ${currentTemp}°C (outside ${criticalRange.min}-${criticalRange.max}°C)`);
      } else if (currentTemp < acceptableRange.min || currentTemp > acceptableRange.max) {
        deduction += 10;
        issues.push(`Temperature deviation: ${currentTemp}°C (ideal: ${idealTemp}°C)`);
      }
    }

    // Check temperature fluctuations in history
    if (history.length > 1) {
      const temps = history.map(h => h.temperature).filter(t => t !== null);
      if (temps.length > 0) {
        const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
        const variance = temps.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / temps.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev > 1.0) {
          deduction += 15;
          issues.push(`High temperature variability (±${stdDev.toFixed(1)}°C)`);
        } else if (stdDev > 0.5) {
          deduction += 5;
          issues.push(`Moderate temperature fluctuations (±${stdDev.toFixed(1)}°C)`);
        }
      }
    }

    return { deduction: Math.min(30, deduction), issues };
  }

  /**
   * Score humidity consistency
   */
  static scoreHumidity(history, currentHumidity) {
    let deduction = 0;
    const issues = [];
    const idealHumidity = 50;
    const acceptableRange = { min: 45, max: 55 };
    const criticalRange = { min: 35, max: 65 };

    // Check current humidity
    if (currentHumidity !== undefined && currentHumidity !== null) {
      if (currentHumidity < criticalRange.min || currentHumidity > criticalRange.max) {
        deduction += 15;
        issues.push(`Critical humidity: ${currentHumidity}% (outside ${criticalRange.min}-${criticalRange.max}%)`);
      } else if (currentHumidity < acceptableRange.min || currentHumidity > acceptableRange.max) {
        deduction += 8;
        issues.push(`Humidity deviation: ${currentHumidity}% (ideal: ${idealHumidity}%)`);
      }
    }

    // Check humidity stability
    if (history.length > 1) {
      const humidities = history.map(h => h.humidity).filter(h => h !== null);
      if (humidities.length > 0) {
        const avg = humidities.reduce((a, b) => a + b, 0) / humidities.length;
        const variance = humidities.reduce((sum, h) => sum + Math.pow(h - avg, 2), 0) / humidities.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev > 10) {
          deduction += 10;
          issues.push(`High humidity variability (±${stdDev.toFixed(0)}%)`);
        } else if (stdDev > 5) {
          deduction += 3;
          issues.push(`Moderate humidity fluctuations (±${stdDev.toFixed(0)}%)`);
        }
      }
    }

    return { deduction: Math.min(25, deduction), issues };
  }

  /**
   * Score egg turning accuracy
   */
  static scoreTurning(turningData) {
    let deduction = 0;
    const issues = [];

    const {
      missedCycles = 0,
      totalExpectedCycles = 0,
      lastTurnTime = null,
      turningEnabled = true,
    } = turningData;

    // Check if turning is enabled
    if (!turningEnabled) {
      // During lockdown (Day 18+), not turning is correct
      return { deduction: 0, issues: [] };
    }

    // Calculate missed cycle percentage
    if (totalExpectedCycles > 0) {
      const missRate = (missedCycles / totalExpectedCycles) * 100;

      if (missRate > 20) {
        deduction += 15;
        issues.push(`High turning failure rate: ${missRate.toFixed(0)}% cycles missed`);
      } else if (missRate > 10) {
        deduction += 8;
        issues.push(`Moderate turning issues: ${missRate.toFixed(0)}% cycles missed`);
      } else if (missRate > 5) {
        deduction += 3;
        issues.push(`Minor turning delays detected`);
      }
    }

    // Check if last turn was too long ago
    if (lastTurnTime) {
      const hoursSinceLastTurn = (Date.now() - new Date(lastTurnTime).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastTurn > 12) {
        deduction += 10;
        issues.push(`No turning in ${hoursSinceLastTurn.toFixed(0)} hours (should be every 4-6 hours)`);
      } else if (hoursSinceLastTurn > 8) {
        deduction += 5;
        issues.push(`Turning delayed: ${hoursSinceLastTurn.toFixed(0)} hours since last turn`);
      }
    }

    return { deduction: Math.min(20, deduction), issues };
  }

  /**
   * Score development progress against expected timeline
   */
  static scoreDevelopment(incubationDay, progress) {
    let deduction = 0;
    const issues = [];

    const {
      veinsVisible = false,
      embryoMovement = false,
      airCellSize = "normal",
      developmentStage = "unknown",
    } = progress;

    // Day-specific expectations
    if (incubationDay >= 7 && incubationDay < 14) {
      // Days 7-13: Should see veins
      if (!veinsVisible) {
        deduction += 15;
        issues.push(`No veins visible on Day ${incubationDay} (should be visible by Day 7)`);
      }
    } else if (incubationDay >= 14 && incubationDay < 18) {
      // Days 14-17: Should see movement
      if (!embryoMovement) {
        deduction += 12;
        issues.push(`No embryo movement detected on Day ${incubationDay}`);
      }
    } else if (incubationDay >= 18) {
      // Day 18+: Lockdown phase, embryo should be positioning
      if (developmentStage === "early") {
        deduction += 20;
        issues.push(`Development delayed on Day ${incubationDay} (should be in late stage)`);
      }
    }

    // Air cell size check
    if (airCellSize === "too_small" && incubationDay > 10) {
      deduction += 8;
      issues.push("Air cell smaller than expected (possible humidity issue)");
    } else if (airCellSize === "too_large" && incubationDay < 15) {
      deduction += 8;
      issues.push("Air cell larger than expected (possible dehydration)");
    }

    return { deduction: Math.min(25, deduction), issues };
  }
}

// ==========================================
// 3. CAUSE ANALYSIS ENGINE
// ==========================================

class CauseAnalysisEngine {
  /**
   * Analyze likely cause of embryo death or weak development
   */
  static analyze({
    embryoStatus,
    temperatureHistory = [],
    humidityHistory = [],
    turningData = {},
    incubationDay = 0,
    deathStage = "unknown",
  }) {
    const causes = [];
    const confidence = [];

    // Analyze temperature-related causes
    const tempCause = this.analyzeTemperature(temperatureHistory, incubationDay);
    if (tempCause) {
      causes.push(tempCause.cause);
      confidence.push(tempCause.confidence);
    }

    // Analyze humidity-related causes
    const humidityCause = this.analyzeHumidity(humidityHistory, incubationDay, deathStage);
    if (humidityCause) {
      causes.push(humidityCause.cause);
      confidence.push(humidityCause.confidence);
    }

    // Analyze turning-related causes
    const turningCause = this.analyzeTurning(turningData, incubationDay);
    if (turningCause) {
      causes.push(turningCause.cause);
      confidence.push(turningCause.confidence);
    }

    // Analyze developmental timing
    const timingCause = this.analyzeTiming(incubationDay, deathStage);
    if (timingCause) {
      causes.push(timingCause.cause);
      confidence.push(timingCause.confidence);
    }

    // Sort by confidence
    const sorted = causes
      .map((cause, i) => ({ cause, confidence: confidence[i] }))
      .sort((a, b) => b.confidence - a.confidence);

    return {
      primaryCause: sorted[0]?.cause || "Unknown",
      allCauses: sorted,
      primaryConfidence: sorted[0]?.confidence || 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Analyze temperature as cause
   */
  static analyzeTemperature(history, day) {
    if (history.length === 0) return null;

    const criticalHigh = history.filter(h => h.temperature > 39.5);
    const criticalLow = history.filter(h => h.temperature < 36.0);
    const fluctuations = history.filter((h, i) => {
      if (i === 0) return false;
      return Math.abs(h.temperature - history[i-1].temperature) > 1.5;
    });

    if (criticalHigh.length > history.length * 0.3) {
      return {
        cause: "Prolonged high temperature exposure",
        confidence: 85,
        details: `Temperature exceeded 39.5°C in ${criticalHigh.length} readings`,
        recommendation: "Reduce heater power and improve ventilation",
      };
    }

    if (criticalLow.length > history.length * 0.3) {
      return {
        cause: "Prolonged low temperature exposure",
        confidence: 85,
        details: `Temperature dropped below 36.0°C in ${criticalLow.length} readings`,
        recommendation: "Check heater functionality and power supply",
      };
    }

    if (fluctuations.length > history.length * 0.2) {
      return {
        cause: "Severe temperature fluctuations",
        confidence: 70,
        details: `${fluctuations.length} rapid temperature changes detected`,
        recommendation: "Stabilize incubator environment and check thermostat",
      };
    }

    return null;
  }

  /**
   * Analyze humidity as cause
   */
  static analyzeHumidity(history, day, stage) {
    if (history.length === 0) return null;

    const criticalLow = history.filter(h => h.humidity < 35);
    const criticalHigh = history.filter(h => h.humidity > 70);

    if (stage === "early" && criticalLow.length > 0) {
      return {
        cause: "Low humidity during early development",
        confidence: 75,
        details: `Humidity dropped below 35% during critical early stage`,
        recommendation: "Maintain humidity at 45-55% during Days 1-18",
      };
    }

    if (stage === "late" && criticalHigh.length > history.length * 0.3) {
      return {
        cause: "Excess humidity during late stage",
        confidence: 70,
        details: `Humidity exceeded 70% in ${criticalHigh.length} readings`,
        recommendation: "Reduce water surface area and increase ventilation",
      };
    }

    if (criticalLow.length > history.length * 0.4) {
      return {
        cause: "Chronic low humidity causing dehydration",
        confidence: 80,
        details: `Humidity consistently below optimal levels`,
        recommendation: "Add water to reservoirs and check humidifier",
      };
    }

    return null;
  }

  /**
   * Analyze turning as cause
   */
  static analyzeTurning(turningData, day) {
    const { missedCycles = 0, turningEnabled = true } = turningData;

    if (!turningEnabled && day < 18) {
      return {
        cause: "Egg turning not active during incubation",
        confidence: 80,
        details: "Turning mechanism was disabled before lockdown phase",
        recommendation: "Enable egg turner immediately (unless Day 18+)",
      };
    }

    if (missedCycles > 10) {
      return {
        cause: "Excessive missed turning cycles",
        confidence: 75,
        details: `${missedCycles} turning cycles missed`,
        recommendation: "Check turning motor and mechanism for obstructions",
      };
    }

    return null;
  }

  /**
   * Analyze developmental timing
   */
  static analyzeTiming(day, stage) {
    if (stage === "early" && day > 10) {
      return {
        cause: "Severe developmental delay",
        confidence: 65,
        details: `Still in early stage on Day ${day}`,
        recommendation: "Review incubation conditions and egg quality",
      };
    }

    if (stage === "dead" && day <= 3) {
      return {
        cause: "Early embryonic mortality (likely infertility or storage issue)",
        confidence: 70,
        details: `Death occurred before Day 3`,
        recommendation: "Check egg freshness and storage conditions before incubation",
      };
    }

    return null;
  }
}

// ==========================================
// 4. PREDICTIVE RISK DETECTION
// ==========================================

class PredictiveRiskDetector {
  /**
   * Predict risks before they become critical
   */
  static detectRisks({
    temperatureHistory = [],
    humidityHistory = [],
    turningData = {},
    incubationDay = 0,
    currentStatus = "HEALTHY",
  }) {
    const risks = [];

    // Temperature trend prediction
    const tempRisk = this.predictTemperatureRisk(temperatureHistory);
    if (tempRisk) risks.push(tempRisk);

    // Humidity trend prediction
    const humidityRisk = this.predictHumidityRisk(humidityHistory, incubationDay);
    if (humidityRisk) risks.push(humidityRisk);

    // Turning failure prediction
    const turningRisk = this.predictTurningRisk(turningData);
    if (turningRisk) risks.push(turningRisk);

    // Development delay prediction
    const developmentRisk = this.predictDevelopmentRisk(incubationDay, currentStatus);
    if (developmentRisk) risks.push(developmentRisk);

    return risks;
  }

  /**
   * Predict temperature-related risks
   */
  static predictTemperatureRisk(history) {
    if (history.length < 3) return null;

    const recent = history.slice(-6); // Last 6 readings
    const temps = recent.map(h => h.temperature);
    const trend = temps[temps.length - 1] - temps[0];

    // Rising temperature trend
    if (trend > 1.0 && temps[temps.length - 1] > 38.0) {
      return {
        type: "TEMPERATURE_RISING",
        severity: "high",
        prediction: "Temperature rising trend detected - may exceed safe threshold within 6 hours",
        timeToRisk: "6 hours",
        recommendation: "Check heating system and ventilation immediately",
        confidence: 75,
      };
    }

    // Falling temperature trend
    if (trend < -1.0 && temps[temps.length - 1] < 37.0) {
      return {
        type: "TEMPERATURE_FALLING",
        severity: "high",
        prediction: "Temperature dropping trend detected - may fall below safe threshold within 6 hours",
        timeToRisk: "6 hours",
        recommendation: "Check heater and power supply",
        confidence: 75,
      };
    }

    // Increasing fluctuations
    if (recent.length >= 4) {
      const firstHalf = recent.slice(0, 2);
      const secondHalf = recent.slice(2);
      const firstVar = Math.variance(firstHalf.map(h => h.temperature));
      const secondVar = Math.variance(secondHalf.map(h => h.temperature));

      if (secondVar > firstVar * 2 && secondVar > 0.5) {
        return {
          type: "TEMPERATURE_INSTABILITY",
          severity: "medium",
          prediction: "Temperature instability increasing - risk of embryo stress",
          timeToRisk: "12 hours",
          recommendation: "Stabilize incubator environment",
          confidence: 65,
        };
      }
    }

    return null;
  }

  /**
   * Predict humidity-related risks
   */
  static predictHumidityRisk(history, day) {
    if (history.length < 3) return null;

    const recent = history.slice(-6);
    const humidities = recent.map(h => h.humidity);
    const trend = humidities[humidities.length - 1] - humidities[0];

    // Approaching lockdown
    if (day >= 16 && day < 18) {
      const avgHumidity = humidities.reduce((a, b) => a + b, 0) / humidities.length;
      if (avgHumidity < 55) {
        return {
          type: "LOCKDOWN_HUMIDITY_PREP",
          severity: "medium",
          prediction: `Humidity needs to increase for lockdown phase (currently ${avgHumidity.toFixed(0)}%)`,
          timeToRisk: "48 hours",
          recommendation: "Prepare to increase humidity to 65-70% for lockdown",
          confidence: 80,
        };
      }
    }

    // Declining humidity trend
    if (trend < -10 && humidities[humidities.length - 1] < 45) {
      return {
        type: "HUMIDITY_DECLINING",
        severity: "high",
        prediction: "Humidity rapidly declining - may cause embryo dehydration",
        timeToRisk: "8 hours",
        recommendation: "Add water to reservoir immediately",
        confidence: 70,
      };
    }

    return null;
  }

  /**
   * Predict turning-related risks
   */
  static predictTurningRisk(turningData) {
    const { missedCycles = 0, lastTurnTime = null } = turningData;

    if (lastTurnTime) {
      const hoursSinceLastTurn = (Date.now() - new Date(lastTurnTime).getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLastTurn > 6 && hoursSinceLastTurn <= 10) {
        return {
          type: "TURNING_DELAY",
          severity: "medium",
          prediction: `Egg turning delayed by ${hoursSinceLastTurn.toFixed(0)} hours`,
          timeToRisk: "2 hours",
          recommendation: "Check turning mechanism for obstructions or motor failure",
          confidence: 80,
        };
      }
    }

    if (missedCycles >= 3 && missedCycles < 10) {
      return {
        type: "TURNING_FAILURE_PATTERN",
        severity: "high",
        prediction: `${missedCycles} missed turning cycles detected - pattern indicates mechanical issue`,
        timeToRisk: "Immediate",
        recommendation: "Inspect turning motor and gear mechanism",
        confidence: 85,
      };
    }

    return null;
  }

  /**
   * Predict development-related risks
   */
  static predictDevelopmentRisk(day, status) {
    if (status === "WEAK_DEVELOPMENT" && day >= 7 && day < 14) {
      return {
        type: "DEVELOPMENT_STALL",
        severity: "high",
        prediction: "Weak development detected - high risk of embryo death within 48 hours",
        timeToRisk: "48 hours",
        recommendation: "Review all incubation parameters and consider candling verification",
        confidence: 70,
      };
    }

    return null;
  }
}

// ==========================================
// 5. MORTALITY PATTERN ANALYSIS
// ==========================================

class MortalityPatternAnalyzer {
  /**
   * Analyze embryo death patterns by stage
   */
  static analyzePattern(deaths) {
    const stages = {
      early: { count: 0, deaths: [], days: "1-7" },      // Days 1-7
      mid: { count: 0, deaths: [], days: "8-14" },        // Days 8-14
      late: { count: 0, deaths: [], days: "15-21" },      // Days 15-21
    };

    // Categorize deaths by stage
    deaths.forEach(death => {
      const day = death.deathDay || death.incubationDay;
      if (day <= 7) {
        stages.early.count++;
        stages.early.deaths.push(death);
      } else if (day <= 14) {
        stages.mid.count++;
        stages.mid.deaths.push(death);
      } else {
        stages.late.count++;
        stages.late.deaths.push(death);
      }
    });

    const totalDeaths = deaths.length;
    const insights = [];

    // Early stage deaths analysis
    if (stages.early.count > totalDeaths * 0.5) {
      insights.push({
        stage: "Early (Days 1-7)",
        count: stages.early.count,
        percentage: ((stages.early.count / totalDeaths) * 100).toFixed(0),
        likelyCauses: [
          "Infertility or poor egg quality",
          "Improper egg storage before incubation",
          "Eggs too old when set",
          "Severe temperature shock in first 24 hours",
        ],
        recommendations: [
          "Source eggs from healthy, mature breeders",
          "Store eggs at 12-15°C before incubation (max 7 days)",
          "Pre-warm eggs gradually before setting",
          "Ensure stable temperature from Day 1",
        ],
      });
    }

    // Mid stage deaths analysis
    if (stages.mid.count > totalDeaths * 0.4) {
      insights.push({
        stage: "Mid (Days 8-14)",
        count: stages.mid.count,
        percentage: ((stages.mid.count / totalDeaths) * 100).toFixed(0),
        likelyCauses: [
          "Nutritional deficiencies in parent flock",
          "Temperature fluctuations",
          "Inadequate egg turning",
          "Genetic defects",
        ],
        recommendations: [
          "Improve breeder nutrition",
          "Stabilize incubator temperature",
          "Verify egg turner is functioning properly",
          "Candle eggs to remove clear eggs early",
        ],
      });
    }

    // Late stage deaths analysis
    if (stages.late.count > totalDeaths * 0.4) {
      insights.push({
        stage: "Late (Days 15-21)",
        count: stages.late.count,
        percentage: ((stages.late.count / totalDeaths) * 100).toFixed(0),
        likelyCauses: [
          "Incorrect humidity during lockdown",
          "Poor ventilation",
          "Failure to stop turning at Day 18",
          "Opening incubator during lockdown",
        ],
        recommendations: [
          "Increase humidity to 65-70% at Day 18",
          "Stop turning eggs at Day 18",
          "Do NOT open incubator during lockdown",
          "Ensure adequate ventilation",
        ],
      });
    }

    return {
      totalDeaths,
      stages,
      insights,
      timestamp: new Date().toISOString(),
    };
  }
}

// ==========================================
// 6. SMART RECOMMENDATION ENGINE
// ==========================================

class RecommendationEngine {
  /**
   * Generate actionable recommendations based on detected issues
   */
  static generate({
    viabilityScore,
    embryoStatus,
    causes,
    risks,
    mortalityPatterns,
    incubationDay,
    sensorReadings,
  }) {
    const recommendations = [];
    const priority = [];

    // Critical recommendations
    if (embryoStatus === "DEAD") {
      recommendations.push({
        id: "REMOVE_DEAD_EMBRYO",
        priority: "critical",
        category: "immediate_action",
        title: "Remove Dead Embryo Immediately",
        description: "Dead embryo can explode and contaminate other eggs",
        action: "Remove egg within 24 hours, sanitize incubator",
        urgency: "Within 24 hours",
      });
    }

    // Temperature recommendations
    if (sensorReadings.temperature > 38.5) {
      recommendations.push({
        id: "REDUCE_TEMPERATURE",
        priority: "high",
        category: "environment",
        title: "Reduce Temperature",
        description: `Current temperature ${sensorReadings.temperature}°C is too high`,
        action: "Decrease heater setting by 0.5°C and improve ventilation",
        urgency: "Within 1 hour",
      });
    } else if (sensorReadings.temperature < 37.0) {
      recommendations.push({
        id: "INCREASE_TEMPERATURE",
        priority: "high",
        category: "environment",
        title: "Increase Temperature",
        description: `Current temperature ${sensorReadings.temperature}°C is too low`,
        action: "Check heater functionality and increase setting",
        urgency: "Within 1 hour",
      });
    }

    // Humidity recommendations
    if (incubationDay >= 18) {
      // Lockdown phase
      if (sensorReadings.humidity < 65) {
        recommendations.push({
          id: "INCREASE_HUMIDITY_LOCKDOWN",
          priority: "high",
          category: "environment",
          title: "Increase Humidity for Lockdown",
          description: `Humidity ${sensorReadings.humidity}% is too low for lockdown phase`,
          action: "Add water to all reservoirs, target 65-70% humidity",
          urgency: "Immediately",
        });
      }
    } else {
      // Normal incubation
      if (sensorReadings.humidity < 45) {
        recommendations.push({
          id: "INCREASE_HUMIDITY",
          priority: "high",
          category: "environment",
          title: "Increase Humidity",
          description: `Humidity ${sensorReadings.humidity}% is below optimal`,
          action: "Add water to reservoir, target 50-55% humidity",
          urgency: "Within 2 hours",
        });
      } else if (sensorReadings.humidity > 60) {
        recommendations.push({
          id: "DECREASE_HUMIDITY",
          priority: "medium",
          category: "environment",
          title: "Decrease Humidity",
          description: `Humidity ${sensorReadings.humidity}% is above optimal`,
          action: "Reduce water surface area, increase ventilation",
          urgency: "Within 4 hours",
        });
      }
    }

    // Turning recommendations
    if (incubationDay < 18 && sensorReadings.turningEnabled === false) {
      recommendations.push({
        id: "ENABLE_TURNING",
        priority: "high",
        category: "mechanical",
        title: "Enable Egg Turning",
        description: "Egg turning is disabled but required before Day 18",
        action: "Turn on egg turner immediately",
        urgency: "Immediately",
      });
    } else if (incubationDay >= 18 && sensorReadings.turningEnabled === true) {
      recommendations.push({
        id: "DISABLE_TURNING_LOCKDOWN",
        priority: "critical",
        category: "phase_change",
        title: "Stop Egg Turning - Lockdown Phase",
        description: "Day 18+ reached - must stop turning for hatching",
        action: "Turn off egg turner and do not disturb eggs",
        urgency: "Immediately",
      });
    }

    // Candling recommendations
    if (incubationDay === 7 || incubationDay === 14) {
      recommendations.push({
        id: "CANDLING_CHECK",
        priority: "medium",
        category: "monitoring",
        title: `Perform Candling Check (Day ${incubationDay})`,
        description: "Time to candle eggs and check development progress",
        action: "Candle all eggs, remove infertile or dead eggs",
        urgency: "Today",
      });
    }

    // Risk-based recommendations
    risks.forEach(risk => {
      recommendations.push({
        id: `RISK_${risk.type}`,
        priority: risk.severity === "high" ? "high" : "medium",
        category: "predictive",
        title: `Risk Alert: ${risk.type}`,
        description: risk.prediction,
        action: risk.recommendation,
        urgency: risk.timeToRisk,
      });
    });

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return {
      recommendations,
      totalActions: recommendations.length,
      criticalActions: recommendations.filter(r => r.priority === "critical").length,
      timestamp: new Date().toISOString(),
    };
  }
}

// ==========================================
// 7. MAIN EMBRYO ANALYSIS SYSTEM
// ==========================================

class EmbryoAnalysisSystem {
  /**
   * Complete embryo analysis with prediction and recommendations
   */
  static async analyzeEgg(eggData) {
    const {
      eggId,
      batchId,
      incubationDay,
      temperatureHistory,
      humidityHistory,
      turningData,
      developmentProgress,
      sensorReadings,
      previousStatus,
    } = eggData;

    // 1. Calculate viability score
    const viability = ViabilityScorer.calculate({
      temperatureHistory,
      humidityHistory,
      turningData,
      incubationDay,
      developmentProgress,
      sensorReadings,
    });

    // 2. Detect predictive risks
    const risks = PredictiveRiskDetector.detectRisks({
      temperatureHistory,
      humidityHistory,
      turningData,
      incubationDay,
      currentStatus: viability.status,
    });

    // 3. Analyze causes if not healthy
    let causeAnalysis = null;
    if (viability.status !== "HEALTHY") {
      causeAnalysis = CauseAnalysisEngine.analyze({
        embryoStatus: viability.status,
        temperatureHistory,
        humidityHistory,
        turningData,
        incubationDay,
        deathStage: developmentProgress?.stage || "unknown",
      });
    }

    // 4. Generate recommendations
    const recommendations = RecommendationEngine.generate({
      viabilityScore: viability.score,
      embryoStatus: viability.status,
      causes: causeAnalysis,
      risks,
      incubationDay,
      sensorReadings,
    });

    // 5. Compile complete analysis
    const analysis = {
      eggId,
      batchId,
      incubationDay,
      viability,
      risks,
      causeAnalysis,
      recommendations,
      timestamp: new Date().toISOString(),
    };

    // 6. Save to Firestore
    try {
      await addDoc(collection(firestore, "embryo_analyses"), {
        ...analysis,
        analyzedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to save embryo analysis:", error);
    }

    return analysis;
  }

  /**
   * Analyze entire batch
   */
  static async analyzeBatch(batchData, eggsData) {
    const analyses = [];
    
    // Analyze each egg
    for (const egg of eggsData) {
      const analysis = await this.analyzeEgg({
        ...egg,
        batchId: batchData.id,
      });
      analyses.push(analysis);
    }

    // Batch-level summary
    const summary = {
      batchId: batchData.id,
      totalEggs: eggsData.length,
      statusCounts: {
        HEALTHY: analyses.filter(a => a.viability.status === "HEALTHY").length,
        AT_RISK: analyses.filter(a => a.viability.status === "AT_RISK").length,
        WEAK_DEVELOPMENT: analyses.filter(a => a.viability.status === "WEAK_DEVELOPMENT").length,
        DEAD: analyses.filter(a => a.viability.status === "DEAD").length,
        INFERTILE: analyses.filter(a => a.viability.status === "INFERTILE").length,
      },
      averageViability: Math.round(
        analyses.reduce((sum, a) => sum + a.viability.score, 0) / analyses.length
      ),
      totalRisks: analyses.reduce((sum, a) => sum + a.risks.length, 0),
      criticalRecommendations: analyses.reduce(
        (sum, a) => sum + a.recommendations.filter(r => r.priority === "critical").length,
        0
      ),
      timestamp: new Date().toISOString(),
    };

    // Analyze mortality patterns
    const deaths = analyses.filter(a => a.viability.status === "DEAD");
    if (deaths.length > 0) {
      summary.mortalityPattern = MortalityPatternAnalyzer.analyzePattern(deaths);
    }

    // Save batch analysis
    try {
      await addDoc(collection(firestore, "batch_analyses"), {
        ...summary,
        analyzedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to save batch analysis:", error);
    }

    return { summary, analyses };
  }
}

// ==========================================
// 8. EXPORTS
// ==========================================

export {
  EmbryoAnalysisSystem,
  ViabilityScorer,
  CauseAnalysisEngine,
  PredictiveRiskDetector,
  MortalityPatternAnalyzer,
  RecommendationEngine,
  EMBRYO_STATUS,
};
