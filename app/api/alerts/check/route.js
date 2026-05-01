/**
 * API Route: Check Alerts
 * POST /api/alerts/check
 * 
 * This endpoint is called by the incubator device or monitoring service
 * to check sensor readings and trigger alerts if needed.
 */

import { checkAlerts } from "@/lib/alertSystem";
import { firestore } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

export async function POST(req) {
  try {
    const body = await req.json();
    const { sensorData, batchId } = body;

    // Validate required sensor data
    if (!sensorData) {
      return Response.json(
        { error: "sensorData is required" },
        { status: 400 }
      );
    }

    // Get batch data if batchId provided
    let batchData = null;
    if (batchId) {
      const batchQuery = query(
        collection(firestore, "egg_batches"),
        where("id", "==", batchId)
      );
      const snapshot = await getDocs(batchQuery);
      if (!snapshot.empty) {
        batchData = snapshot.docs[0].data();
      }
    }

    // Check alerts
    await checkAlerts(sensorData, batchData);

    return Response.json({
      success: true,
      message: "Alert check completed",
    });
  } catch (error) {
    console.error("Alert check error:", error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
