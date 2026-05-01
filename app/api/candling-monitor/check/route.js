/**
 * API Route: Smart Candling Monitor
 * POST /api/candling-monitor/check
 * 
 * Run monitoring check for a batch or all active batches
 */

import { SmartCandlingMonitor } from "@/lib/smartCandlingMonitor";
import { checkAlerts, alertManager } from "@/lib/alertSystem";

export async function POST(req) {
  try {
    const body = await req.json();
    const { batchId, scanResults, environmentalData, checkAll = false } = body;

    let result;

    if (checkAll) {
      // Check all active batches
      result = await SmartCandlingMonitor.checkAllActiveBatches();
      
      // Notifications are handled internally by SmartCandlingMonitor
    } else if (batchId) {
      // Check specific batch
      result = await SmartCandlingMonitor.runMonitoringCheck(
        batchId,
        scanResults,
        environmentalData
      );
      
      // Notifications are handled internally by SmartCandlingMonitor
    } else {
      return Response.json(
        { error: "Provide batchId or set checkAll=true" },
        { status: 400 }
      );
    }

    return Response.json(result);
  } catch (error) {
    console.error("Candling monitor API error:", error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// GET endpoint to get candling schedule info
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const eggType = searchParams.get("eggType") || "chicken";
    const currentDay = parseInt(searchParams.get("day") || "0");

    const { CandlingScheduleChecker } = await import("@/lib/smartCandlingMonitor");

    const countdown = CandlingScheduleChecker.getCandlingCountdown(eggType, currentDay);

    return Response.json({
      success: true,
      eggType,
      currentDay,
      countdown,
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
