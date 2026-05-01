/**
 * API Route: Test Notification System
 * POST /api/alerts/test
 * 
 * Send a test notification to verify SMS and Email are working
 */

import { checkAlerts, ALERT_TYPES, alertManager } from "@/lib/alertSystem";
import { firestore } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function POST(req) {
  try {
    const body = await req.json();
    const { 
      alertType = "TEMP_TOO_HIGH", 
      recipients = [],
      testMode = true 
    } = body;

    // Validate alert type
    if (!ALERT_TYPES[alertType]) {
      return Response.json(
        { 
          error: "Invalid alert type", 
          validTypes: Object.keys(ALERT_TYPES) 
        },
        { status: 400 }
      );
    }

    // Default test recipients if none provided
    const testRecipients = recipients.length > 0 ? recipients : [
      {
        name: "Test User",
        email: "test@example.com", // Replace with your email
        phone: "+1234567890", // Replace with your phone
      }
    ];

    // Create test data
    const testData = {
      timestamp: new Date().toLocaleString(),
      temperature: 39.2,
      humidity: 52,
      deviceName: "Test Incubator",
      incubatorId: "TEST-001",
      incubationDay: 7,
      totalDays: 21,
      recipients: testRecipients,
    };

    // Send test notification
    const alertData = {
      alertType,
      data: testData,
      isTest: testMode,
    };

    // Log test to Firestore (sendNotification replaced by alertManager)
    const testLog = await addDoc(collection(firestore, "notification_tests"), {
      alertType,
      recipients: testRecipients,
      testData,
      testMode,
      sentAt: serverTimestamp(),
      status: "sent",
    });

    return Response.json({
      success: true,
      message: `Test notification sent for ${alertType}`,
      testId: testLog.id,
      recipients: testRecipients.length,
      note: "Check your email and SMS for the test notification",
    });
  } catch (error) {
    console.error("Test notification error:", error);
    return Response.json(
      { 
        error: error.message,
        hint: "Make sure you've configured Twilio and SendGrid API keys in .env.local"
      },
      { status: 500 }
    );
  }
}
