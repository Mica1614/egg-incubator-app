// @ts-nocheck
/**
 * Smart Egg Incubator - Alert & Notification System
 * 
 * Features:
 * - Critical, Warning, and Informational alerts
 * - SMS + Email notifications
 * - Cooldown logic to prevent duplicates
 * - Escalation for unacknowledged alerts
 * - Alert history logging
 * - User-defined thresholds
 */

import { collection, addDoc, query, where, orderBy, getDocs, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { sendAlertEmail } from "@/lib/mailer";

// ==========================================
// 1. ALERT CONFIGURATION & THRESHOLDS
// ==========================================

const DEFAULT_THRESHOLDS = {
  temperature: {
    critical: { min: 35.0, max: 40.0 },  // °C
    warning: { min: 36.5, max: 38.5 },    // °C
    ideal: 37.5,                           // °C
  },
  humidity: {
    critical: { min: 30, max: 80 },       // %
    warning: { min: 40, max: 65 },        // %
    ideal: 50,                             // %
  },
  eggTurning: {
    maxMissedCycles: 2,                    // Before warning
    criticalMissedCycles: 5,               // Before critical alert
  },
  waterLevel: {
    warningThreshold: 20,                  // % - Warning when below this
    criticalThreshold: 10,                 // % - Critical when below this
  },
  cooldown: {
    critical: 5 * 60 * 1000,              // 5 minutes (ms)
    warning: 15 * 60 * 1000,              // 15 minutes
    info: 60 * 60 * 1000,                 // 1 hour
  },
  escalation: {
    resendInterval: 10 * 60 * 1000,       // 10 minutes
    maxEscalations: 3,                     // Max resend attempts
  },
};

// ==========================================
// 2. ALERT TYPE DEFINITIONS
// ==========================================

const ALERT_TYPES = {
  // CRITICAL ALERTS
  TEMP_TOO_HIGH: {
    id: "TEMP_TOO_HIGH",
    category: "critical",
    title: "Temperature Too High",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: true,
  },
  TEMP_TOO_LOW: {
    id: "TEMP_TOO_LOW",
    category: "critical",
    title: "Temperature Too Low",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: true,
  },
  HUMIDITY_TOO_HIGH: {
    id: "HUMIDITY_TOO_HIGH",
    category: "critical",
    title: "Humidity Too High",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: true,
  },
  HUMIDITY_TOO_LOW: {
    id: "HUMIDITY_TOO_LOW",
    category: "critical",
    title: "Humidity Too Low",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: true,
  },
  POWER_OUTAGE: {
    id: "POWER_OUTAGE",
    category: "critical",
    title: "Power Outage Detected",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: true,
  },
  POWER_RESTORED: {
    id: "POWER_RESTORED",
    category: "critical",
    title: "Power Restored",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: false,
  },
  SENSOR_FAILURE: {
    id: "SENSOR_FAILURE",
    category: "critical",
    title: "Sensor Failure",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: true,
  },
  SYSTEM_OFFLINE: {
    id: "SYSTEM_OFFLINE",
    category: "critical",
    title: "System Offline",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: true,
  },

  // WARNING ALERTS
  TEMP_APPROACHING_CRITICAL: {
    id: "TEMP_APPROACHING_CRITICAL",
    category: "warning",
    title: "Temperature Approaching Unsafe Levels",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: true,
  },
  HUMIDITY_APPROACHING_CRITICAL: {
    id: "HUMIDITY_APPROACHING_CRITICAL",
    category: "warning",
    title: "Humidity Approaching Unsafe Levels",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: true,
  },
  WATER_LOW: {
    id: "WATER_LOW",
    category: "warning",
    title: "Water Reservoir Low",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: true,
  },
  EGG_TURNING_MALFUNCTION: {
    id: "EGG_TURNING_MALFUNCTION",
    category: "warning",
    title: "Egg Turning Malfunction",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: true,
  },

  // INFORMATIONAL NOTIFICATIONS
  DAILY_PROGRESS: {
    id: "DAILY_PROGRESS",
    category: "info",
    title: "Daily Incubation Progress",
    smsEnabled: false,
    emailEnabled: true,
    escalationEnabled: false,
  },
  LOCKDOWN_REMINDER: {
    id: "LOCKDOWN_REMINDER",
    category: "info",
    title: "Lockdown Phase Reminder",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: false,
  },
  HATCH_COUNTDOWN: {
    id: "HATCH_COUNTDOWN",
    category: "info",
    title: "Hatch Date Countdown",
    smsEnabled: false,
    emailEnabled: true,
    escalationEnabled: false,
  },
  HATCH_STARTED: {
    id: "HATCH_STARTED",
    category: "info",
    title: "Hatching Started",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: false,
  },
  HATCH_COMPLETED: {
    id: "HATCH_COMPLETED",
    category: "info",
    title: "Hatching Completed",
    smsEnabled: true,
    emailEnabled: true,
    escalationEnabled: false,
  },
  SYSTEM_STATUS: {
    id: "SYSTEM_STATUS",
    category: "info",
    title: "System Status Update",
    smsEnabled: false,
    emailEnabled: true,
    escalationEnabled: false,
  },
};

// ==========================================
// 3. NOTIFICATION MESSAGE TEMPLATES
// ==========================================

const MESSAGE_TEMPLATES = {
  // SMS Templates (short, concise)
  sms: {
    TEMP_TOO_HIGH: (data) => 
      `🚨 CRITICAL: Temperature too high (${data.temperature}°C). Action: Check heating system immediately. Time: ${data.timestamp}`,
    
    TEMP_TOO_LOW: (data) => 
      `🚨 CRITICAL: Temperature too low (${data.temperature}°C). Action: Check heater and power supply. Time: ${data.timestamp}`,
    
    HUMIDITY_TOO_HIGH: (data) => 
      `🚨 CRITICAL: Humidity too high (${data.humidity}%). Action: Increase ventilation. Time: ${data.timestamp}`,
    
    HUMIDITY_TOO_LOW: (data) => 
      `🚨 CRITICAL: Humidity too low (${data.humidity}%). Action: Add water to reservoir. Time: ${data.timestamp}`,
    
    POWER_OUTAGE: (data) => 
      `🚨 CRITICAL: Power outage detected! Action: Check power supply and backup battery. Time: ${data.timestamp}`,
    
    POWER_RESTORED: (data) => 
      `✅ Power restored to incubator. Action: Verify temperature and humidity stability. Time: ${data.timestamp}`,
    
    SENSOR_FAILURE: (data) => 
      `🚨 CRITICAL: ${data.sensor} sensor failure. Action: Check sensor connections. Time: ${data.timestamp}`,
    
    SYSTEM_OFFLINE: (data) => 
      `🚨 CRITICAL: Incubator system offline. Action: Check internet connection. Time: ${data.timestamp}`,
    
    TEMP_APPROACHING_CRITICAL: (data) => 
      `⚠️ WARNING: Temperature approaching unsafe levels (${data.temperature}°C). Action: Monitor closely. Time: ${data.timestamp}`,
    
    HUMIDITY_APPROACHING_CRITICAL: (data) => 
      `⚠️ WARNING: Humidity approaching unsafe levels (${data.humidity}%). Action: Adjust humidity control. Time: ${data.timestamp}`,
    
    WATER_LOW: (data) => 
      `⚠️ WARNING: Water reservoir low (${data.waterLevel}%). Action: Refill water soon. Time: ${data.timestamp}`,
    
    EGG_TURNING_MALFUNCTION: (data) => 
      `⚠️ WARNING: Egg turning malfunction (${data.missedCycles} missed cycles). Action: Check turning mechanism. Time: ${data.timestamp}`,
    
    DAILY_PROGRESS: (data) => 
      `📊 Day ${data.incubationDay}/${data.totalDays} - Temp: ${data.temperature}°C, Humidity: ${data.humidity}%. Status: ${data.status}`,
    
    LOCKDOWN_REMINDER: (data) => 
      `🔔 LOCKDOWN: Stop turning eggs! Increase humidity to 65-70%. Day ${data.incubationDay}. Time: ${data.timestamp}`,
    
    HATCH_COUNTDOWN: (data) => 
      `🐣 Hatch countdown: ${data.daysUntilHatch} days remaining. Expected: ${data.expectedHatchDate}`,
    
    HATCH_STARTED: (data) => 
      `🐣 Hatching started! First pips detected. Action: Do not open incubator. Time: ${data.timestamp}`,
    
    HATCH_COMPLETED: (data) => 
      `✅ Hatching completed! ${data.hatchedCount}/${data.totalEggs} hatched (${data.hatchRate}%). Time: ${data.timestamp}`,
  },

  // Email Templates (detailed, formatted)
  email: {
    TEMP_TOO_HIGH: (data) => ({
      subject: `[CRITICAL] Incubator Temperature Alert - Too High`,
      body: `
🚨 CRITICAL ALERT: Temperature Too High

Device: ${data.deviceName || "Incubator A1"}
Incubator ID: ${data.incubatorId}

📊 CURRENT READINGS:
• Temperature: ${data.temperature}°C (Threshold: ${data.threshold}°C)
• Humidity: ${data.humidity}%
• Incubation Day: ${data.incubationDay}/${data.totalDays}

⚠️ ISSUE:
Temperature has exceeded the maximum safe threshold of ${data.threshold}°C.
Current reading: ${data.temperature}°C

✅ RECOMMENDED ACTIONS:
1. Check heating element for malfunction
2. Verify ventilation is working properly
3. Check room temperature
4. Inspect temperature sensor calibration
5. If persistent, reduce heater power setting

⏰ Timestamp: ${data.timestamp}
      `,
    }),

    TEMP_TOO_LOW: (data) => ({
      subject: `[CRITICAL] Incubator Temperature Alert - Too Low`,
      body: `
🚨 CRITICAL ALERT: Temperature Too Low

Device: ${data.deviceName || "Incubator A1"}
Incubator ID: ${data.incubatorId}

📊 CURRENT READINGS:
• Temperature: ${data.temperature}°C (Threshold: ${data.threshold}°C)
• Humidity: ${data.humidity}%
• Incubation Day: ${data.incubationDay}/${data.totalDays}

⚠️ ISSUE:
Temperature has dropped below the minimum safe threshold of ${data.threshold}°C.
Current reading: ${data.temperature}°C

✅ RECOMMENDED ACTIONS:
1. Check power supply to heater
2. Verify heater element is functioning
3. Check for drafts or open doors
4. Inspect temperature sensor
5. Consider backup heating source

⏰ Timestamp: ${data.timestamp}
      `,
    }),

    HUMIDITY_TOO_HIGH: (data) => ({
      subject: `[CRITICAL] Incubator Humidity Alert - Too High`,
      body: `
🚨 CRITICAL ALERT: Humidity Too High

Device: ${data.deviceName || "Incubator A1"}

📊 CURRENT READINGS:
• Humidity: ${data.humidity}% (Threshold: ${data.threshold}%)
• Temperature: ${data.temperature}°C

⚠️ ISSUE:
Humidity has exceeded the maximum safe threshold.

✅ RECOMMENDED ACTIONS:
1. Increase ventilation
2. Reduce water surface area
3. Check humidifier settings
4. Wipe condensation from walls

⏰ Timestamp: ${data.timestamp}
      `,
    }),

    HUMIDITY_TOO_LOW: (data) => ({
      subject: `[CRITICAL] Incubator Humidity Alert - Too Low`,
      body: `
🚨 CRITICAL ALERT: Humidity Too Low

Device: ${data.deviceName || "Incubator A1"}

📊 CURRENT READINGS:
• Humidity: ${data.humidity}% (Threshold: ${data.threshold}%)
• Temperature: ${data.temperature}°C

⚠️ ISSUE:
Humidity has dropped below the minimum safe threshold.

✅ RECOMMENDED ACTIONS:
1. Add water to reservoir immediately
2. Check humidifier is working
3. Verify water channels are filled
4. Increase water surface area

⏰ Timestamp: ${data.timestamp}
      `,
    }),

    POWER_OUTAGE: (data) => ({
      subject: `[CRITICAL] Power Outage Detected`,
      body: `
🚨 CRITICAL ALERT: Power Outage

Device: ${data.deviceName || "Incubator A1"}

⚠️ ISSUE:
Power supply to the incubator has been interrupted.

✅ RECOMMENDED ACTIONS:
1. Check main power supply
2. Verify backup battery is engaged
3. Minimize opening incubator door
4. Monitor temperature closely
5. Prepare alternative power source if needed

⏰ Timestamp: ${data.timestamp}
      `,
    }),

    POWER_RESTORED: (data) => ({
      subject: `[INFO] Power Restored to Incubator`,
      body: `
✅ Power has been restored to the incubator.

Device: ${data.deviceName || "Incubator A1"}

📊 CURRENT STATUS:
• Temperature: ${data.temperature}°C
• Humidity: ${data.humidity}%

✅ RECOMMENDED ACTIONS:
1. Verify temperature is stabilizing
2. Check all systems are functioning
3. Monitor for next 30 minutes
4. Ensure egg turner is working

⏰ Timestamp: ${data.timestamp}
      `,
    }),

    SENSOR_FAILURE: (data) => ({
      subject: `[CRITICAL] Sensor Failure Detected`,
      body: `
🚨 CRITICAL ALERT: Sensor Failure

Device: ${data.deviceName || "Incubator A1"}

⚠️ ISSUE:
${data.sensor} sensor is not responding or providing invalid readings.

✅ RECOMMENDED ACTIONS:
1. Check sensor connections
2. Inspect sensor for damage
3. Clean sensor if dirty
4. Replace sensor if necessary
5. Use manual monitoring until fixed

⏰ Timestamp: ${data.timestamp}
      `,
    }),

    SYSTEM_OFFLINE: (data) => ({
      subject: `[CRITICAL] Incubator System Offline`,
      body: `
🚨 CRITICAL ALERT: System Offline

Device: ${data.deviceName || "Incubator A1"}

⚠️ ISSUE:
The incubator monitoring system has lost internet connection.

✅ RECOMMENDED ACTIONS:
1. Check WiFi/router connection
2. Verify network cable (if wired)
3. Restart router if needed
4. Check device network settings
5. System will auto-reconnect when possible

⏰ Timestamp: ${data.timestamp}
      `,
    }),

    TEMP_APPROACHING_CRITICAL: (data) => ({
      subject: `[WARNING] Temperature Approaching Unsafe Levels`,
      body: `
⚠️ WARNING: Temperature Approaching Critical Threshold

Device: ${data.deviceName || "Incubator A1"}

📊 CURRENT READINGS:
• Temperature: ${data.temperature}°C
• Warning Range: ${data.warningMin}°C - ${data.warningMax}°C
• Critical Range: ${data.criticalMin}°C - ${data.criticalMax}°C

⚠️ ISSUE:
Temperature is approaching unsafe levels but has not yet reached critical threshold.

✅ RECOMMENDED ACTIONS:
1. Monitor temperature closely
2. Check heating/cooling systems
3. Verify ventilation
4. Prepare to take action if trend continues

⏰ Timestamp: ${data.timestamp}
      `,
    }),

    HUMIDITY_APPROACHING_CRITICAL: (data) => ({
      subject: `[WARNING] Humidity Approaching Unsafe Levels`,
      body: `
⚠️ WARNING: Humidity Approaching Critical Threshold

Device: ${data.deviceName || "Incubator A1"}

📊 CURRENT READINGS:
• Humidity: ${data.humidity}%
• Warning Range: ${data.warningMin}% - ${data.warningMax}%
• Critical Range: ${data.criticalMin}% - ${data.criticalMax}%

✅ RECOMMENDED ACTIONS:
1. Monitor humidity closely
2. Adjust water levels if needed
3. Check ventilation
4. Prepare to adjust if trend continues

⏰ Timestamp: ${data.timestamp}
      `,
    }),

    WATER_LOW: (data) => ({
      subject: `[WARNING] Water Reservoir Low`,
      body: `
⚠️ WARNING: Water Reservoir Low

Device: ${data.deviceName || "Incubator A1"}

📊 CURRENT STATUS:
• Water Level: ${data.waterLevel}%
• Warning Threshold: ${DEFAULT_THRESHOLDS.waterLevel.warningThreshold}%

✅ RECOMMENDED ACTIONS:
1. Refill water reservoir soon
2. Use distilled or demineralized water
3. Check for leaks
4. Monitor humidity after refill

⏰ Timestamp: ${data.timestamp}
      `,
    }),

    EGG_TURNING_MALFUNCTION: (data) => ({
      subject: `[WARNING] Egg Turning Malfunction`,
      body: `
⚠️ WARNING: Egg Turning Issue Detected

Device: ${data.deviceName || "Incubator A1"}

📊 CURRENT STATUS:
• Missed Turning Cycles: ${data.missedCycles}
• Last Successful Turn: ${data.lastTurnTime}

✅ RECOMMENDED ACTIONS:
1. Check turning mechanism motor
2. Verify no obstructions
3. Inspect gear connections
4. Manually turn eggs if needed
5. Schedule maintenance if persistent

⏰ Timestamp: ${data.timestamp}
      `,
    }),

    DAILY_PROGRESS: (data) => ({
      subject: `[INFO] Daily Incubation Progress - Day ${data.incubationDay}`,
      body: `
📊 Daily Incubation Progress Report

Device: ${data.deviceName || "Incubator A1"}
Batch ID: ${data.batchId}

📈 PROGRESS:
• Incubation Day: ${data.incubationDay} of ${data.totalDays}
• Progress: ${data.progress}%
• Days Remaining: ${data.daysRemaining}

🌡️ CURRENT CONDITIONS:
• Temperature: ${data.temperature}°C (Target: ${data.targetTemp}°C)
• Humidity: ${data.humidity}% (Target: ${data.targetHumidity}%)
• Egg Turner: ${data.eggTurnerStatus}
• Water Level: ${data.waterLevel}%

🥚 EGG STATUS:
• Total Eggs: ${data.totalEggs}
• Incubating: ${data.incubatingCount}
• Dead: ${data.deadCount}
• Removed: ${data.removedCount}
• Hatched: ${data.hatchedCount}

✅ STATUS: ${data.status}

⏰ Report Time: ${data.timestamp}
      `,
    }),

    LOCKDOWN_REMINDER: (data) => ({
      subject: `[IMPORTANT] Lockdown Phase Reminder - Stop Egg Turning`,
      body: `
🔔 LOCKDOWN PHASE REMINDER

Device: ${data.deviceName || "Incubator A1"}
Batch ID: ${data.batchId}

📅 TIMELINE:
• Current Day: ${data.incubationDay}
• Lockdown Starts: Day ${data.lockdownDay}
• Expected Hatch: Day ${data.hatchDay}

⚠️ REQUIRED ACTIONS:
1. STOP turning eggs immediately
2. Increase humidity to 65-70%
3. Add extra water to reservoirs
4. Do NOT open incubator door
5. Ensure ventilation is adequate
6. Prepare for hatching

🌡️ TARGET CONDITIONS:
• Temperature: Maintain at ${data.targetTemp}°C
• Humidity: Increase to 65-70%
• Turning: DISABLED

⏰ Reminder Time: ${data.timestamp}
      `,
    }),

    HATCH_COUNTDOWN: (data) => ({
      subject: `[INFO] Hatch Countdown - ${data.daysUntilHatch} Days Remaining`,
      body: `
🐣 Hatch Countdown

Device: ${data.deviceName || "Incubator A1"}
Batch ID: ${data.batchId}

📅 HATCH INFORMATION:
• Days Until Hatch: ${data.daysUntilHatch}
• Expected Hatch Date: ${data.expectedHatchDate}
• Current Incubation Day: ${data.incubationDay} of ${data.totalDays}

📊 CURRENT STATUS:
• Eggs Remaining: ${data.incubatingCount}
• Temperature: ${data.temperature}°C
• Humidity: ${data.humidity}%

💡 REMINDERS:
• Do not open incubator during lockdown
• Maintain high humidity (65-70%)
• Be patient - hatching takes time
• Listen for chirping sounds

⏰ Update Time: ${data.timestamp}
      `,
    }),

    HATCH_STARTED: (data) => ({
      subject: `[INFO] Hatching Has Started!`,
      body: `
🐣🎉 HATCHING HAS STARTED!

Device: ${data.deviceName || "Incubator A1"}
Batch ID: ${data.batchId}

📊 HATCH STATUS:
• First Pip Detected: ${data.timestamp}
• Expected Duration: 12-24 hours
• Eggs Hatching: ${data.incubatingCount}

⚠️ IMPORTANT:
• DO NOT open the incubator
• Maintain humidity at 65-70%
• Keep temperature stable
• Be patient - natural process
• Only assist if chick is stuck 24+ hours

🎯 WHAT TO EXPECT:
1. External pips (small cracks)
2. Zipping (crack around egg)
3. Chick emerges
4. Chick rests and dries
5. Chick becomes active

⏰ Detection Time: ${data.timestamp}
      `,
    }),

    HATCH_COMPLETED: (data) => ({
      subject: `[INFO] Hatching Completed - Results`,
      body: `
✅ HATCHING COMPLETED!

Device: ${data.deviceName || "Incubator A1"}
Batch ID: ${data.batchId}

📊 HATCH RESULTS:
• Total Eggs: ${data.totalEggs}
• Successfully Hatched: ${data.hatchedCount}
• Failed to Hatch: ${data.failedCount}
• Hatch Rate: ${data.hatchRate}%

📈 PERFORMANCE:
• Incubation Duration: ${data.incubationDays} days
• Start Date: ${data.startDate}
• Completion Date: ${data.completionDate}

💡 NEXT STEPS:
1. Move chicks to brooder
2. Provide heat, water, and food
3. Clean and sanitize incubator
4. Record hatch data for future reference
5. Review and optimize settings

⏰ Completion Time: ${data.timestamp}
      `,
    }),

    SYSTEM_STATUS: (data) => ({
      subject: `[INFO] System Status Update`,
      body: `
📡 System Status Update

Device: ${data.deviceName || "Incubator A1"}

🔧 SYSTEM STATUS:
• Online Status: ${data.onlineStatus}
• Last Heartbeat: ${data.lastHeartbeat}
• Uptime: ${data.uptime}

📊 SENSOR STATUS:
• Temperature Sensor: ${data.tempSensorStatus}
• Humidity Sensor: ${data.humiditySensorStatus}
• Water Level Sensor: ${data.waterSensorStatus}

✅ All systems operational.

⏰ Update Time: ${data.timestamp}
      `,
    }),
  },
};

// ==========================================
// 4. ALERT COOLDOWN & HISTORY MANAGEMENT
// ==========================================

class AlertManager {
  constructor() {
    this.cooldowns = new Map();
    this.alertHistory = [];
    this.escalationTimers = new Map();
  }

  /**
   * Check if alert is in cooldown period
   */
  isInCooldown(alertType) {
    const lastAlert = this.cooldowns.get(alertType);
    if (!lastAlert) return false;

    const config = ALERT_TYPES[alertType];
    const cooldownMs = DEFAULT_THRESHOLDS.cooldown[config.category];
    const timeSinceLastAlert = Date.now() - lastAlert;

    return timeSinceLastAlert < cooldownMs;
  }

  /**
   * Set cooldown for alert type
   */
  setCooldown(alertType) {
    this.cooldowns.set(alertType, Date.now());
  }

  /**
   * Log alert to history
   */
  async logAlert(alertData) {
    try {
      const alertRecord = {
        ...alertData,
        loggedAt: serverTimestamp(),
        acknowledged: false,
        escalationCount: 0,
      };

      const docRef = await addDoc(
        collection(firestore, "alert_history"),
        alertRecord
      );

      this.alertHistory.push({ id: docRef.id, ...alertRecord });
      return docRef.id;
    } catch (error) {
      console.error("Failed to log alert:", error);
      throw error;
    }
  }

  /**
   * Get recent alerts
   */
  async getRecentAlerts(limit = 50) {
    try {
      const q = query(
        collection(firestore, "alert_history"),
        orderBy("loggedAt", "desc"),
        limit
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Failed to get recent alerts:", error);
      return [];
    }
  }

  /**
   * Check if alert needs escalation
   */
  async checkEscalation(alertId) {
    try {
      const alertDoc = await getDoc(doc(firestore, "alert_history", alertId));
      if (!alertDoc.exists()) return;

      const alert = alertDoc.data();
      const config = ALERT_TYPES[alert.alertType];

      if (!config.escalationEnabled) return;
      if (alert.acknowledged) return;

      const timeSinceAlert = Date.now() - alert.loggedAt.toDate().getTime();
      const resendInterval = DEFAULT_THRESHOLDS.escalation.resendInterval;
      const maxEscalations = DEFAULT_THRESHOLDS.escalation.maxEscalations;

      if (timeSinceAlert >= resendInterval && alert.escalationCount < maxEscalations) {
        // Escalate: resend notification
        await this.escalateAlert(alert);
      }
    } catch (error) {
      console.error("Failed to check escalation:", error);
    }
  }

  /**
   * Escalate alert (resend notification)
   */
  async escalateAlert(alert) {
    try {
      const escalationCount = alert.escalationCount + 1;
      
      // Update escalation count
      await addDoc(collection(firestore, "alert_escalations"), {
        originalAlertId: alert.id,
        escalationCount,
        escalatedAt: serverTimestamp(),
        alertType: alert.alertType,
        message: alert.message,
      });

      // Resend notification
      await sendNotification({
        ...alert,
        isEscalation: true,
        escalationCount,
      });

      console.log(`Alert ${alert.id} escalated (attempt ${escalationCount})`);
    } catch (error) {
      console.error("Failed to escalate alert:", error);
    }
  }
}

// ==========================================
// 5. NOTIFICATION SENDING (SMS + EMAIL)
// ==========================================

/**
 * Send notification via SMS and Email
 */
async function sendNotification(alertData) {
  const { alertType, data, isEscalation = false } = alertData;
  const config = ALERT_TYPES[alertType];

  if (!config) {
    console.error("Unknown alert type:", alertType);
    return;
  }

  // Generate messages
  const smsMessage = MESSAGE_TEMPLATES.sms[alertType]?.(data);
  const emailTemplate = MESSAGE_TEMPLATES.email[alertType]?.(data);

  const notificationPayload = {
    alertType,
    category: config.category,
    timestamp: new Date().toISOString(),
    isEscalation,
    smsMessage,
    emailSubject: emailTemplate?.subject,
    emailBody: emailTemplate?.body,
    recipients: data.recipients || [],
    // Pass raw sensor data so sendEmail can build the HTML template
    rawData: alertData.data,
  };

  // Send SMS
  if (config.smsEnabled && (config.category === "critical" || config.category === "warning")) {
    await sendSMS(notificationPayload);
  }

  // Send Email
  if (config.emailEnabled) {
    await sendEmail(notificationPayload);
  }

  console.log(`Notification sent for ${alertType}`, {
    sms: config.smsEnabled,
    email: config.emailEnabled,
    isEscalation,
  });
}

/**
 * Send SMS notification
 * TODO: Integrate with SMS provider (Twilio, etc.)
 */
async function sendSMS(payload) {
  try {
    // Example: Twilio integration
    // const twilio = require('twilio');
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    // for (const recipient of payload.recipients) {
    //   if (recipient.phone) {
    //     await client.messages.create({
    //       body: payload.smsMessage,
    //       from: process.env.TWILIO_PHONE_NUMBER,
    //       to: recipient.phone,
    //     });
    //   }
    // }

    console.log("SMS would be sent:", payload.smsMessage);
    
    // Log to Firebase
    await addDoc(collection(firestore, "notifications_sent"), {
      type: "sms",
      ...payload,
      sentAt: serverTimestamp(),
      status: "sent",
    });
  } catch (error) {
    console.error("Failed to send SMS:", error);
    throw error;
  }
}

/**
 * Send Email notification via Gmail SMTP.
 * Delegates to lib/mailer.js which checks the Firestore toggle before sending.
 */
async function sendEmail(payload) {
  try {
    const raw = payload.rawData || {};

    await sendAlertEmail({
      alertTypeKey: payload.alertType,
      subject: payload.emailSubject || `Incubator Alert: ${payload.alertType}`,
      deviceId: raw.incubatorId || raw.deviceName || "Incubator",
      sensorData: {
        temperature: raw.temperature,
        humidity: raw.humidity,
        waterLevel: raw.waterLevel,
      },
      message: raw.message,
    });

    // Log to Firebase
    await addDoc(collection(firestore, "notifications_sent"), {
      type: "email",
      alertType: payload.alertType,
      category: payload.category,
      emailSubject: payload.emailSubject,
      sentAt: serverTimestamp(),
      status: "sent",
    });
  } catch (error) {
    console.error("Failed to send Email:", error);
    // Non-fatal: log but don't rethrow so other alerts can continue
  }
}

// ==========================================
// 6. ALERT TRIGGER LOGIC (If/Else Conditions)
// ==========================================

const alertManager = new AlertManager();

/**
 * Main alert checking function
 * Call this whenever sensor readings are updated
 */
export async function checkAlerts(sensorData, batchData) {
  const {
    temperature,
    humidity,
    powerStatus,
    sensorStatus,
    eggTurnerStatus,
    waterLevel,
    systemOnline,
  } = sensorData;

  const thresholds = DEFAULT_THRESHOLDS;
  const timestamp = new Date().toLocaleString();

  // Common data for all alerts
  const baseData = {
    timestamp,
    temperature,
    humidity,
    deviceName: "Incubator A1",
    incubatorId: "INC-001",
    incubationDay: batchData?.incubationDay || 0,
    totalDays: batchData?.totalDays || 21,
    recipients: batchData?.notifications?.recipients || [],
  };

  // ==========================================
  // CRITICAL ALERTS
  // ==========================================

  // Temperature Too High
  if (temperature > thresholds.temperature.critical.max) {
    if (!alertManager.isInCooldown("TEMP_TOO_HIGH")) {
      const alertData = {
        alertType: "TEMP_TOO_HIGH",
        data: {
          ...baseData,
          threshold: thresholds.temperature.critical.max,
        },
      };
      await alertManager.logAlert(alertData);
      await sendNotification(alertData);
      alertManager.setCooldown("TEMP_TOO_HIGH");
    }
  }

  // Temperature Too Low
  if (temperature < thresholds.temperature.critical.min) {
    if (!alertManager.isInCooldown("TEMP_TOO_LOW")) {
      const alertData = {
        alertType: "TEMP_TOO_LOW",
        data: {
          ...baseData,
          threshold: thresholds.temperature.critical.min,
        },
      };
      await alertManager.logAlert(alertData);
      await sendNotification(alertData);
      alertManager.setCooldown("TEMP_TOO_LOW");
    }
  }

  // Humidity Too High
  if (humidity > thresholds.humidity.critical.max) {
    if (!alertManager.isInCooldown("HUMIDITY_TOO_HIGH")) {
      const alertData = {
        alertType: "HUMIDITY_TOO_HIGH",
        data: {
          ...baseData,
          threshold: thresholds.humidity.critical.max,
        },
      };
      await alertManager.logAlert(alertData);
      await sendNotification(alertData);
      alertManager.setCooldown("HUMIDITY_TOO_HIGH");
    }
  }

  // Humidity Too Low
  if (humidity < thresholds.humidity.critical.min) {
    if (!alertManager.isInCooldown("HUMIDITY_TOO_LOW")) {
      const alertData = {
        alertType: "HUMIDITY_TOO_LOW",
        data: {
          ...baseData,
          threshold: thresholds.humidity.critical.min,
        },
      };
      await alertManager.logAlert(alertData);
      await sendNotification(alertData);
      alertManager.setCooldown("HUMIDITY_TOO_LOW");
    }
  }

  // Power Outage
  if (powerStatus === "offline" || powerStatus === false) {
    if (!alertManager.isInCooldown("POWER_OUTAGE")) {
      const alertData = {
        alertType: "POWER_OUTAGE",
        data: baseData,
      };
      await alertManager.logAlert(alertData);
      await sendNotification(alertData);
      alertManager.setCooldown("POWER_OUTAGE");
    }
  }

  // Sensor Failure
  if (sensorStatus?.temperature === "error" || sensorStatus?.humidity === "error") {
    const failedSensor = sensorStatus.temperature === "error" ? "Temperature" : "Humidity";
    if (!alertManager.isInCooldown("SENSOR_FAILURE")) {
      const alertData = {
        alertType: "SENSOR_FAILURE",
        data: {
          ...baseData,
          sensor: failedSensor,
        },
      };
      await alertManager.logAlert(alertData);
      await sendNotification(alertData);
      alertManager.setCooldown("SENSOR_FAILURE");
    }
  }

  // System Offline
  if (!systemOnline) {
    if (!alertManager.isInCooldown("SYSTEM_OFFLINE")) {
      const alertData = {
        alertType: "SYSTEM_OFFLINE",
        data: baseData,
      };
      await alertManager.logAlert(alertData);
      await sendNotification(alertData);
      alertManager.setCooldown("SYSTEM_OFFLINE");
    }
  }

  // ==========================================
  // WARNING ALERTS
  // ==========================================

  // Temperature Approaching Critical
  if (
    temperature > thresholds.temperature.warning.max &&
    temperature <= thresholds.temperature.critical.max
  ) {
    if (!alertManager.isInCooldown("TEMP_APPROACHING_CRITICAL")) {
      const alertData = {
        alertType: "TEMP_APPROACHING_CRITICAL",
        data: {
          ...baseData,
          warningMin: thresholds.temperature.warning.min,
          warningMax: thresholds.temperature.warning.max,
          criticalMin: thresholds.temperature.critical.min,
          criticalMax: thresholds.temperature.critical.max,
        },
      };
      await alertManager.logAlert(alertData);
      await sendNotification(alertData);
      alertManager.setCooldown("TEMP_APPROACHING_CRITICAL");
    }
  }

  // Humidity Approaching Critical
  if (
    humidity > thresholds.humidity.warning.max &&
    humidity <= thresholds.humidity.critical.max
  ) {
    if (!alertManager.isInCooldown("HUMIDITY_APPROACHING_CRITICAL")) {
      const alertData = {
        alertType: "HUMIDITY_APPROACHING_CRITICAL",
        data: {
          ...baseData,
          warningMin: thresholds.humidity.warning.min,
          warningMax: thresholds.humidity.warning.max,
          criticalMin: thresholds.humidity.critical.min,
          criticalMax: thresholds.humidity.critical.max,
        },
      };
      await alertManager.logAlert(alertData);
      await sendNotification(alertData);
      alertManager.setCooldown("HUMIDITY_APPROACHING_CRITICAL");
    }
  }

  // Water Level Low
  if (waterLevel < thresholds.waterLevel.warningThreshold) {
    if (!alertManager.isInCooldown("WATER_LOW")) {
      const alertData = {
        alertType: "WATER_LOW",
        data: {
          ...baseData,
          waterLevel,
        },
      };
      await alertManager.logAlert(alertData);
      await sendNotification(alertData);
      alertManager.setCooldown("WATER_LOW");
    }
  }

  // Egg Turning Malfunction
  if (eggTurnerStatus?.missedCycles >= thresholds.eggTurning.maxMissedCycles) {
    if (!alertManager.isInCooldown("EGG_TURNING_MALFUNCTION")) {
      const alertData = {
        alertType: "EGG_TURNING_MALFUNCTION",
        data: {
          ...baseData,
          missedCycles: eggTurnerStatus.missedCycles,
          lastTurnTime: eggTurnerStatus.lastTurnTime,
        },
      };
      await alertManager.logAlert(alertData);
      await sendNotification(alertData);
      alertManager.setCooldown("EGG_TURNING_MALFUNCTION");
    }
  }
}

// ==========================================
// 7. INFORMATIONAL NOTIFICATIONS
// ==========================================

/**
 * Send daily progress report
 */
export async function sendDailyProgress(batchData, sensorData) {
  const alertData = {
    alertType: "DAILY_PROGRESS",
    data: {
      timestamp: new Date().toLocaleString(),
      batchId: batchData?.id,
      incubationDay: batchData?.incubationDay,
      totalDays: batchData?.totalDays,
      progress: batchData?.progress,
      daysRemaining: batchData?.daysLeft,
      temperature: sensorData?.temperature,
      humidity: sensorData?.humidity,
      targetTemp: 37.5,
      targetHumidity: 50,
      eggTurnerStatus: batchData?.eggTurnerEnabled ? "Active" : "Inactive",
      waterLevel: sensorData?.waterLevel,
      totalEggs: batchData?.totalEggs,
      incubatingCount: batchData?.counts?.incubating || 0,
      deadCount: batchData?.counts?.dead || 0,
      removedCount: batchData?.counts?.removed || 0,
      hatchedCount: batchData?.counts?.hatched || 0,
      status: batchData?.status,
      recipients: batchData?.notifications?.recipients || [],
    },
  };

  await alertManager.logAlert(alertData);
  await sendNotification(alertData);
}

/**
 * Send lockdown reminder
 */
export async function sendLockdownReminder(batchData) {
  const alertData = {
    alertType: "LOCKDOWN_REMINDER",
    data: {
      timestamp: new Date().toLocaleString(),
      batchId: batchData?.id,
      incubationDay: batchData?.incubationDay,
      lockdownDay: 18,
      hatchDay: 21,
      targetTemp: 37.5,
      recipients: batchData?.notifications?.recipients || [],
    },
  };

  await alertManager.logAlert(alertData);
  await sendNotification(alertData);
}

/**
 * Send hatch countdown
 */
export async function sendHatchCountdown(batchData, sensorData) {
  const daysUntilHatch = batchData?.daysLeft;
  
  if (daysUntilHatch <= 3 && daysUntilHatch > 0) {
    const alertData = {
      alertType: "HATCH_COUNTDOWN",
      data: {
        timestamp: new Date().toLocaleString(),
        batchId: batchData?.id,
        daysUntilHatch,
        expectedHatchDate: batchData?.hatchingDate,
        incubationDay: batchData?.incubationDay,
        totalDays: batchData?.totalDays,
        incubatingCount: batchData?.counts?.incubating || 0,
        temperature: sensorData?.temperature,
        humidity: sensorData?.humidity,
        recipients: batchData?.notifications?.recipients || [],
      },
    };

    await alertManager.logAlert(alertData);
    await sendNotification(alertData);
  }
}

// ==========================================
// 8. API ENDPOINTS (for backend integration)
// ==========================================

/**
 * Example API endpoint structure
 * Use these in your Next.js API routes
 */

// POST /api/alerts/check
// Triggers alert checking with current sensor data
export async function POST_checkAlerts(req, res) {
  try {
    const { sensorData, batchData } = req.body;
    await checkAlerts(sensorData, batchData);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// GET /api/alerts/history
// Get alert history
export async function GET_alertHistory(req, res) {
  try {
    const { limit = 50 } = req.query;
    const alerts = await alertManager.getRecentAlerts(parseInt(limit));
    res.status(200).json({ success: true, alerts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// POST /api/alerts/acknowledge
// Acknowledge an alert
export async function POST_acknowledgeAlert(req, res) {
  try {
    const { alertId } = req.body;
    // Update alert in Firestore
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// POST /api/notifications/test
// Test notification sending
export async function POST_testNotification(req, res) {
  try {
    const { alertType, recipients } = req.body;
    
    const testData = {
      timestamp: new Date().toLocaleString(),
      temperature: 37.5,
      humidity: 50,
      deviceName: "Test Incubator",
      recipients,
    };

    const alertData = {
      alertType,
      data: testData,
    };

    await sendNotification(alertData);
    res.status(200).json({ success: true, message: "Test notification sent" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export { alertManager, ALERT_TYPES, DEFAULT_THRESHOLDS, MESSAGE_TEMPLATES };
