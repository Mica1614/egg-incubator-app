/**
 * API Route: Get Alert History
 * GET /api/alerts/history?limit=50
 * 
 * Returns recent alerts from the system
 */

import { alertManager } from "@/lib/alertSystem";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit")) || 50;

    const alerts = await alertManager.getRecentAlerts(limit);

    return Response.json({
      success: true,
      alerts,
      count: alerts.length,
    });
  } catch (error) {
    console.error("Get alert history error:", error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
