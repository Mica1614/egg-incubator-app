// @ts-nocheck
/**
 * Smart Candling Schedule & Embryo Monitoring System
 * 
 * Features:
 * - Automated candling schedule (Day 7, 14, 18)
 * - Stage-based embryo detection
 * - Continuous environmental monitoring
 * - SMS + Email alerts for all events
 * - Cooldown logic to prevent duplicate alerts
 * - Intelligent guidance throughout incubation
 */

import { collection, addDoc, query, where, getDocs, serverTimestamp, doc, updateDoc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

// ==========================================
// 1. CANDLING SCHEDULE CONFIGURATION
// ==========================================

const CANDLING_SCHEDULE = {
  chicken: {
    totalDays: 21,
    sessions: [
      {
        day: 7,
        name: "First Candling - Early Detection",
        purpose: "Detect fertility and early embryo death",
        checks: ["fertility", "early_death", "blood_ring"],
        environment: "dark_room",
        duration: "30-60 seconds per egg",
        alertMessage: "🔬 Day 7: Time for first candling! Check for fertility and early embryo death. 2 eggs may be infertile based on current data.",
        actions: [
          "Candle in dark room for best visibility",
          "Look for spiderweb-like veins (fertile)",
          "Remove clear eggs (infertile)",
          "Remove eggs with blood ring (early death)",
          "Mark and record results for each egg",
        ],
      },
      {
        day: 14,
        name: "Second Candling - Development Check",
        purpose: "Monitor embryo growth and viability",
        checks: ["growth", "viability", "weak_embryo"],
        environment: "dark_room",
        duration: "30-60 seconds per egg",
        alertMessage: "📊 Day 14: Second candling due! Check embryo development and assess viability scores.",
        actions: [
          "Check for large, dark embryo mass",
          "Look for movement (healthy sign)",
          "Assess air cell size",
          "Update viability scores",
          "Remove any dead embryos",
        ],
      },
      {
        day: 18,
        name: "Final Candling - Lockdown Stage",
        purpose: "Confirm readiness for hatching",
        checks: ["full_development", "air_cell", "positioning"],
        environment: "minimal_disturbance",
        duration: "Quick check only",
        alertMessage: "🚨 Day 18: FINAL candling! Enter LOCKDOWN phase. Stop turning, increase humidity, prepare for hatching!",
        actions: [
          "Quick check only - minimize disturbance",
          "Confirm embryo is fully developed",
          "Check air cell size (should be 1/3 of egg)",
          "STOP egg turning immediately",
          "Increase humidity to 65-70%",
          "Do NOT open incubator after this",
        ],
      },
    ],
  },
  duck: {
    totalDays: 28,
    sessions: [
      { day: 7, name: "First Candling", checks: ["fertility"] },
      { day: 18, name: "Second Candling", checks: ["development"] },
      { day: 25, name: "Lockdown Check", checks: ["readiness"] },
    ],
  },
  quail: {
    totalDays: 18,
    sessions: [
      { day: 5, name: "First Candling", checks: ["fertility"] },
      { day: 12, name: "Second Candling", checks: ["development"] },
      { day: 15, name: "Lockdown Check", checks: ["readiness"] },
    ],
  },
  goose: {
    totalDays: 30,
    sessions: [
      { day: 7, name: "First Candling", checks: ["fertility"] },
      { day: 20, name: "Second Candling", checks: ["development"] },
      { day: 27, name: "Lockdown Check", checks: ["readiness"] },
    ],
  },
  turkey: {
    totalDays: 28,
    sessions: [
      { day: 7, name: "First Candling", checks: ["fertility"] },
      { day: 18, name: "Second Candling", checks: ["development"] },
      { day: 25, name: "Lockdown Check", checks: ["readiness"] },
    ],
  },
};

// ==========================================
// 2. ALERT COOLDOWN & MANAGEMENT
// ==========================================

class AlertCooldownManager {
  constructor() {
    this.cooldowns = new Map();
  }

  /**
   * Check if alert is in cooldown
   */
  isInCooldown(alertType, batchId) {
    const key = `${alertType}_${batchId}`;
    if (!this.cooldowns.has(key)) return false;

    const cooldownEnd = this.cooldowns.get(key);
    return Date.now() < cooldownEnd;
  }

  /**
   * Set cooldown for alert
   */
  setCooldown(alertType, batchId, durationHours = 24) {
    const key = `${alertType}_${batchId}`;
    const cooldownEnd = Date.now() + (durationHours * 60 * 60 * 1000);
    this.cooldowns.set(key, cooldownEnd);
  }

  /**
   * Clear cooldown
   */
  clearCooldown(alertType, batchId) {
    const key = `${alertType}_${batchId}`;
    this.cooldowns.delete(key);
  }
}

const alertManager = new AlertCooldownManager();

// ==========================================
// 3. STAGE-BASED EMBRYO DETECTION LOGIC
// ==========================================

class EmbryoStageDetector {
  /**
   * Detect embryo status based on incubation stage
   */
  static detectStage(incubationDay, scanResults, environmentalData) {
    const stage = this.getStage(incubationDay);
    
    let detection = {
      day: incubationDay,
      stage: stage.name,
      stageRange: stage.range,
      status: "unknown",
      riskLevel: "low",
      viabilityScore: 100,
      recommendations: [],
      alerts: [],
    };

    // Apply stage-specific detection logic
    switch (stage.name) {
      case "early":
        detection = this.detectEarlyStage(detection, scanResults, environmentalData);
        break;
      case "mid":
        detection = this.detectMidStage(detection, scanResults, environmentalData);
        break;
      case "late":
        detection = this.detectLateStage(detection, scanResults, environmentalData);
        break;
      case "lockdown":
        detection = this.detectLockdownStage(detection, scanResults, environmentalData);
        break;
      case "hatching":
        detection = this.detectHatchingStage(detection, scanResults, environmentalData);
        break;
    }

    return detection;
  }

  /**
   * Get current incubation stage
   */
  static getStage(day) {
    if (day <= 7) return { name: "early", range: "Days 1-7" };
    if (day <= 17) return { name: "mid", range: "Days 8-17" };
    if (day === 18) return { name: "lockdown", range: "Day 18" };
    if (day <= 21) return { name: "hatching", range: "Days 19-21" };
    return { name: "complete", range: "Day 21+" };
  }

  /**
   * Early Stage Detection (Days 1-7)
   */
  static detectEarlyStage(detection, scanResults, envData) {
    const { classification, features } = scanResults || {};

    // Check for fertility
    if (classification === "infertile" || (features && !features.veins.detected && !features.embryo.detected)) {
      detection.status = "infertile";
      detection.riskLevel = "low";
      detection.viabilityScore = 0;
      detection.recommendations.push("Remove infertile egg to save incubator space");
      detection.alerts.push({
        type: "INFERTILE_DETECTED",
        priority: "medium",
        message: "Infertile egg detected - no embryo development",
      });
    }
    // Check for early death
    else if (classification === "dead" || (features && features.bloodRing.detected)) {
      detection.status = "dead";
      detection.riskLevel = "high";
      detection.viabilityScore = 0;
      detection.recommendations.push("Remove dead embryo within 24-48 hours to prevent contamination");
      detection.alerts.push({
        type: "EARLY_DEATH_DETECTED",
        priority: "high",
        message: "Early embryo death detected - blood ring pattern found",
      });
    }
    // Check for healthy development
    else if (classification === "day1_3" || classification === "day4_6" || (features && features.veins.detected)) {
      detection.status = "healthy";
      detection.riskLevel = "low";
      detection.viabilityScore = 85;
      detection.recommendations.push("Continue normal incubation - development looks good");
    }
    // Environmental risk assessment
    else {
      detection = this.assessEnvironmentalRisk(detection, envData);
    }

    return detection;
  }

  /**
   * Mid Stage Detection (Days 8-17)
   */
  static detectMidStage(detection, scanResults, envData) {
    const { classification, features } = scanResults || {};

    // Check for healthy growth
    if (classification === "day7_10" || (features && features.veins.detected && features.embryo.detected)) {
      const confidence = features?.embryo.confidence || 75;
      
      if (confidence >= 70) {
        detection.status = "healthy";
        detection.riskLevel = "low";
        detection.viabilityScore = Math.round(confidence);
        detection.recommendations.push("Healthy development - continue incubation");
      } else if (confidence >= 50) {
        detection.status = "weak";
        detection.riskLevel = "medium";
        detection.viabilityScore = Math.round(confidence);
        detection.recommendations.push("Weak development detected - monitor closely");
        detection.recommendations.push("Check temperature and humidity stability");
        detection.alerts.push({
          type: "WEAK_DEVELOPMENT",
          priority: "medium",
          message: `Weak embryo detected - viability score: ${confidence}%`,
        });
      } else {
        detection.status = "at_risk";
        detection.riskLevel = "high";
        detection.viabilityScore = Math.round(confidence);
        detection.recommendations.push("Critical: Embryo at high risk - review environmental conditions");
        detection.alerts.push({
          type: "HIGH_RISK_EMBRYO",
          priority: "high",
          message: `Embryo at high risk - only ${confidence}% viability`,
        });
      }
    }
    // Check for death
    else if (classification === "dead") {
      detection.status = "dead";
      detection.riskLevel = "high";
      detection.viabilityScore = 0;
      detection.recommendations.push("Remove dead embryo immediately");
      detection.alerts.push({
        type: "MID_STAGE_DEATH",
        priority: "high",
        message: "Mid-stage embryo death detected - remove within 24 hours",
      });
    }

    // Environmental risk
    detection = this.assessEnvironmentalRisk(detection, envData);

    return detection;
  }

  /**
   * Late Stage Detection (Day 18 - Lockdown)
   */
  static detectLockdownStage(detection, scanResults, envData) {
    const { classification, features } = scanResults || {};

    // Check readiness for hatching
    if (classification === "day7_10" || (features && features.embryo.detected)) {
      const airCellReady = features?.airCell.size === "large" || features?.airCell.size === "medium";
      
      if (airCellReady) {
        detection.status = "ready_to_hatch";
        detection.riskLevel = "low";
        detection.viabilityScore = 90;
        detection.recommendations.push("Embryo ready for hatching - lockdown phase active");
        detection.recommendations.push("STOP turning eggs immediately");
        detection.recommendations.push("Increase humidity to 65-70%");
        detection.recommendations.push("Do NOT open incubator");
        detection.alerts.push({
          type: "LOCKDOWN_READY",
          priority: "critical",
          message: "Day 18: Enter LOCKDOWN! Stop turning, increase humidity, prepare for hatch",
        });
      } else {
        detection.status = "delayed";
        detection.riskLevel = "medium";
        detection.viabilityScore = 70;
        detection.recommendations.push("Air cell not optimal - may have delayed hatching");
        detection.alerts.push({
          type: "DELAYED_DEVELOPMENT",
          priority: "medium",
          message: "Embryo development delayed - air cell not at expected size",
        });
      }
    }

    return detection;
  }

  /**
   * Hatching Stage Detection (Days 19-21)
   */
  static detectHatchingStage(detection, scanResults, envData) {
    detection.status = "hatching";
    detection.riskLevel = "low";
    detection.viabilityScore = 95;
    detection.recommendations.push("Hatching in progress - do not disturb");
    detection.recommendations.push("Maintain humidity at 65-70%");
    detection.recommendations.push("Wait for natural hatching process");

    return detection;
  }

  /**
   * Assess environmental risks
   */
  static assessEnvironmentalRisk(detection, envData) {
    if (!envData) return detection;

    const { temperature, humidity, turningEnabled, stability } = envData;

    // Temperature risk
    if (temperature > 38.5 || temperature < 36.5) {
      detection.riskLevel = detection.riskLevel === "low" ? "medium" : "high";
      detection.viabilityScore -= 15;
      detection.recommendations.push(`Temperature out of range (${temperature}°C) - adjust immediately`);
      detection.alerts.push({
        type: "TEMPERATURE_RISK",
        priority: "high",
        message: `Temperature ${temperature}°C is harming embryo development`,
      });
    }

    // Humidity risk
    if (humidity < 40 || humidity > 65) {
      detection.riskLevel = detection.riskLevel === "low" ? "medium" : "high";
      detection.viabilityScore -= 10;
      detection.recommendations.push(`Humidity out of range (${humidity}%) - adjust immediately`);
    }

    // Turning risk
    if (detection.day < 18 && !turningEnabled) {
      detection.riskLevel = "high";
      detection.viabilityScore -= 20;
      detection.recommendations.push("Egg turning is OFF but required before Day 18");
      detection.alerts.push({
        type: "TURNING_DISABLED",
        priority: "high",
        message: "Egg turning disabled - embryo development at risk",
      });
    }

    detection.viabilityScore = Math.max(0, Math.min(100, detection.viabilityScore));

    return detection;
  }
}

// ==========================================
// 4. CANDLING SCHEDULE CHECKER
// ==========================================

class CandlingScheduleChecker {
  /**
   * Check if it's time for candling
   */
  static shouldCandle(eggType, incubationDay) {
    const schedule = CANDLING_SCHEDULE[eggType?.toLowerCase()] || CANDLING_SCHEDULE.chicken;
    
    const session = schedule.sessions.find(s => s.day === incubationDay);
    
    if (!session) {
      return {
        shouldCandle: false,
        nextCandlingDay: this.getNextCandlingDay(schedule, incubationDay),
        message: null,
      };
    }

    return {
      shouldCandle: true,
      session: session,
      nextCandlingDay: this.getNextCandlingDay(schedule, incubationDay),
      message: session.alertMessage,
    };
  }

  /**
   * Get next candling day
   */
  static getNextCandlingDay(schedule, currentDay) {
    const upcoming = schedule.sessions
      .filter(s => s.day > currentDay)
      .sort((a, b) => a.day - b.day);

    return upcoming.length > 0 ? upcoming[0].day : null;
  }

  /**
   * Get countdown to next candling
   */
  static getCandlingCountdown(eggType, incubationDay) {
    const schedule = CANDLING_SCHEDULE[eggType?.toLowerCase()] || CANDLING_SCHEDULE.chicken;
    const nextDay = this.getNextCandlingDay(schedule, incubationDay);

    if (!nextDay) {
      return {
        daysUntil: null,
        message: "No more candling sessions needed",
        urgent: false,
      };
    }

    const daysUntil = nextDay - incubationDay;
    const urgent = daysUntil <= 1;

    return {
      daysUntil,
      nextCandlingDay: nextDay,
      message: urgent 
        ? `⚠️ Candling due tomorrow (Day ${nextDay})!`
        : `Next candling: Day ${nextDay} (${daysUntil} days)`,
      urgent,
    };
  }
}

// ==========================================
// 5. ALERT MESSAGE GENERATOR
// ==========================================

class AlertMessageGenerator {
  /**
   * Generate SMS alert message
   */
  static generateSMS(alertType, batchData, detection) {
    const messages = {
      CANDLING_DUE: `🔬 Day ${detection.day}: Time to candle eggs! ${detection.recommendations[0] || "Check development progress."}`,
      
      INFERTILE_DETECTED: `⭕ Infertile egg detected in batch ${batchData.batchId}. Remove to save space. Viability: ${detection.viabilityScore}%`,
      
      EARLY_DEATH_DETECTED: `❌ Early embryo death detected! Blood ring found. Remove within 24-48hrs to prevent contamination.`,
      
      WEAK_DEVELOPMENT: `⚠️ Weak embryo development in batch ${batchData.batchId}. Viability: ${detection.viabilityScore}%. Check temp/humidity.`,
      
      HIGH_RISK_EMBRYO: `🚨 HIGH RISK: Embryo viability only ${detection.viabilityScore}% in batch ${batchData.batchId}. Immediate action needed!`,
      
      MID_STAGE_DEATH: `❌ Mid-stage embryo death detected. Remove within 24hrs. Batch ${batchData.batchId}.`,
      
      LOCKDOWN_READY: `🚨 DAY 18: Enter LOCKDOWN NOW! Stop turning, increase humidity to 65-70%, do NOT open incubator!`,
      
      TEMPERATURE_RISK: `🌡️ Temperature ${detection.day > 18 ? '39.0' : '37.5'}°C alert! Embryo development at risk. Adjust immediately.`,
      
      TURNING_DISABLED: `⚙️ Egg turning is OFF but required before Day 18. Turn ON immediately to prevent embryo death.`,
      
      HATCHING_STARTED: `🐣 Hatching started! Do NOT disturb incubator. Maintain humidity 65-70%. Congratulations!`,
    };

    return messages[alertType] || `Alert: ${alertType} - Check your incubator`;
  }

  /**
   * Generate Email alert
   */
  static generateEmail(alertType, batchData, detection, scanResults) {
    const emails = {
      CANDLING_DUE: {
        subject: `🔬 Candling Alert: Day ${detection.day} - ${this.getCandlingSessionName(detection.day)}`,
        body: this.generateCandlingEmail(detection, batchData),
      },
      
      INFERTILE_DETECTED: {
        subject: `⭕ Infertile Egg Detected - Batch ${batchData.batchId}`,
        body: `Infertile egg detected during Day ${detection.day} scan.

Current Status:
- Viability Score: ${detection.viabilityScore}%
- Risk Level: ${detection.riskLevel}

Recommended Action:
${detection.recommendations.join("\n")}

This egg will not develop and should be removed to save incubator space and prevent contamination.`,
      },
      
      EARLY_DEATH_DETECTED: {
        subject: `❌ URGENT: Early Embryo Death Detected - Batch ${batchData.batchId}`,
        body: `Early embryo death detected (blood ring pattern).

Critical Information:
- Detection Day: Day ${detection.day}
- Viability Score: ${detection.viabilityScore}%
- Risk Level: ${detection.riskLevel}

IMMEDIATE ACTION REQUIRED:
1. Mark egg for removal
2. Remove within 24-48 hours
3. Dispose properly (bury or compost)
4. Sanitize incubator
5. Wash hands thoroughly

Dead embryos can explode and contaminate other eggs. Act quickly!`,
      },
      
      LOCKDOWN_READY: {
        subject: `🚨 CRITICAL: Day 18 Lockdown Phase - IMMEDIATE ACTION REQUIRED`,
        body: `LOCKDOWN PHASE ACTIVATED - Day 18

CRITICAL ACTIONS (Do NOW):
1. STOP egg turning immediately
2. Increase humidity to 65-70%
3. Do NOT open incubator
4. Maintain temperature at 37.5°C (99.5°F)
5. Wait for natural hatching (Days 19-21)

Important:
- Opening incubator now can kill chicks
- Humidity is critical for hatching success
- Chicks will absorb remaining yolk
- Hatching can take 24-48 hours

Current Status:
- Batch: ${batchData.batchId}
- Eggs Remaining: ${batchData.counts?.incubating || 0}
- Viability Score: ${detection.viabilityScore}%

Prepare for hatch! 🐣`,
      },
      
      HATCHING_STARTED: {
        subject: `🐣 Congratulations! Hatching Started - Batch ${batchData.batchId}`,
        body: `Great news! Your eggs have started hatching!

Current Status:
- Hatching Day: Day ${detection.day}
- Viability Score: ${detection.viabilityScore}%
- Risk Level: ${detection.riskLevel}

IMPORTANT - Do Not Disturb:
- Do NOT open incubator
- Do NOT help chicks out of shells
- Maintain humidity at 65-70%
- Keep temperature stable at 37.5°C
- Wait for natural hatching process

Hatching can take 24-48 hours. Be patient!

Congratulations on reaching this milestone! 🎉`,
      },
    };

    const email = emails[alertType] || {
      subject: `Alert: ${alertType}`,
      body: JSON.stringify(detection, null, 2),
    };

    return email;
  }

  /**
   * Generate candling-specific email
   */
  static generateCandlingEmail(detection, batchData) {
    const sessionName = this.getCandlingSessionName(detection.day);
    
    return `CANDLING REMINDER - ${sessionName}

Incubation Details:
- Current Day: Day ${detection.day}
- Batch ID: ${batchData.batchId}
- Egg Type: ${batchData.eggType || "Chicken"}
- Eggs to Check: ${batchData.counts?.incubating || batchData.totalEggs || 0}

What to Look For:
${this.getCandlingChecklist(detection.day)}

Instructions:
1. Candle in a DARK room for best visibility
2. Use bright, focused light source
3. Handle eggs gently and quickly
4. Spend only 30-60 seconds per egg
5. Record results for each egg
6. Remove infertile/dead eggs immediately

After Candling:
- Update egg status in the system
- Remove clear eggs (infertile)
- Remove blood ring eggs (early death)
- Continue incubation for developing eggs

Good luck! 🔬`;
  }

  /**
   * Get candling session name
   */
  static getCandlingSessionName(day) {
    if (day === 7) return "First Candling - Early Detection";
    if (day === 14) return "Second Candling - Development Check";
    if (day === 18) return "Final Candling - Lockdown";
    return `Candling - Day ${day}`;
  }

  /**
   * Get candling checklist
   */
  static getCandlingChecklist(day) {
    if (day === 7) {
      return `Day 7 Checklist:
✓ Spiderweb-like veins = FERTILE (keep)
✓ Clear/transparent = INFERTILE (remove)
✓ Blood ring = EARLY DEATH (remove)
✓ Small dark spot = EARLY DEVELOPMENT (keep)`;
    }
    if (day === 14) {
      return `Day 14 Checklist:
✓ Large dark mass with movement = HEALTHY
✓ Small dark mass, no movement = WEAK (monitor)
✓ Cloudy mass, bad smell = DEAD (remove)
✓ Air cell should be visible at large end`;
    }
    if (day === 18) {
      return `Day 18 Checklist (QUICK CHECK ONLY):
✓ Egg should appear mostly dark
✓ Air cell should be 1/3 of egg
✓ May see chick movement
✓ Beak may be in air cell (pipping soon)
✓ MINIMIZE disturbance - lockdown active`;
    }
    return `Check for:
✓ Vein patterns
✓ Embryo movement
✓ Air cell size
✓ Any abnormalities`;
  }
}

// ==========================================
// 6. MAIN MONITORING SYSTEM
// ==========================================

class SmartCandlingMonitor {
  /**
   * Run comprehensive monitoring check
   */
  static async runMonitoringCheck(batchId, scanResults = null, environmentalData = null) {
    try {
      // Get batch data
      const batchDoc = await getDoc(doc(firestore, "egg_batches", batchId));
      if (!batchDoc.exists()) {
        throw new Error("Batch not found");
      }

      const batchData = batchDoc.data();
      
      // Calculate incubation day
      let incubationDay = 0;
      if (batchData.startDate) {
        const startDate = batchData.startDate.toDate ? batchData.startDate.toDate() : new Date(batchData.startDate);
        const now = new Date();
        incubationDay = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
      }

      // Check candling schedule
      const candlingCheck = CandlingScheduleChecker.shouldCandle(batchData.eggType, incubationDay);
      
      // Run stage-based detection
      const detection = EmbryoStageDetector.detectStage(
        incubationDay,
        scanResults,
        environmentalData
      );

      // Compile alerts
      const alerts = [];

      // Add candling alert if due
      if (candlingCheck.shouldCandle && !alertManager.isInCooldown("CANDLING_DUE", batchId)) {
        alerts.push({
          type: "CANDLING_DUE",
          priority: "high",
          message: candlingCheck.message,
          data: candlingCheck.session,
        });
        alertManager.setCooldown("CANDLING_DUE", batchId, 24);
      }

      // Add detection alerts
      detection.alerts.forEach(alert => {
        if (!alertManager.isInCooldown(alert.type, batchId)) {
          alerts.push(alert);
          alertManager.setCooldown(alert.type, batchId, alert.priority === "high" ? 6 : 24);
        }
      });

      // Get candling countdown
      const countdown = CandlingScheduleChecker.getCandlingCountdown(batchData.eggType, incubationDay);

      // Generate notifications
      const notifications = alerts.map(alert => ({
        sms: AlertMessageGenerator.generateSMS(alert.type, batchData, detection),
        email: AlertMessageGenerator.generateEmail(alert.type, batchData, detection, scanResults),
        alert: alert,
      }));

      // Save monitoring log
      const monitoringLog = await addDoc(collection(firestore, "monitoring_logs"), {
        batchId,
        incubationDay,
        detection,
        candlingCheck: {
          shouldCandle: candlingCheck.shouldCandle,
          nextCandlingDay: candlingCheck.nextCandlingDay,
          countdown: countdown,
        },
        alerts: alerts,
        notificationsCount: notifications.length,
        timestamp: serverTimestamp(),
        scanResults,
        environmentalData,
      });

      // Update batch with latest detection
      await updateDoc(doc(firestore, "egg_batches", batchId), {
        latestDetection: detection,
        lastMonitoredAt: serverTimestamp(),
        incubationDay,
        nextCandlingDay: candlingCheck.nextCandlingDay,
        candlingCountdown: countdown,
      });

      return {
        success: true,
        batchId,
        incubationDay,
        detection,
        candlingCheck,
        countdown,
        alerts,
        notifications,
        monitoringLogId: monitoringLog.id,
      };
    } catch (error) {
      console.error("Monitoring check failed:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Check all active batches
   */
  static async checkAllActiveBatches() {
    try {
      const batchesQuery = query(
        collection(firestore, "egg_batches"),
        where("status", "==", "ACTIVE")
      );
      const snapshot = await getDocs(batchesQuery);

      const results = [];
      for (const batchDoc of snapshot.docs) {
        const result = await this.runMonitoringCheck(batchDoc.id);
        results.push(result);
      }

      return {
        success: true,
        batchesChecked: results.length,
        results,
      };
    } catch (error) {
      console.error("Failed to check all batches:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// ==========================================
// 7. EXPORTS
// ==========================================

export {
  SmartCandlingMonitor,
  EmbryoStageDetector,
  CandlingScheduleChecker,
  AlertMessageGenerator,
  CANDLING_SCHEDULE,
};
