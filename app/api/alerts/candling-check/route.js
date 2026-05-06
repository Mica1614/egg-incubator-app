// @ts-nocheck
/**
 * GET /api/alerts/candling-check?uid=<uid>
 *
 * Checks all active egg batches for the given user.
 * For each batch, calculates candling schedule dates.
 * If today or tomorrow is a candling day, sends:
 *   - An in-app Firestore notification
 *   - An email via mailer (if configured)
 *
 * Deduplicates by writing a flag to Firestore so the same alert
 * is not sent more than once per day.
 */

import { NextResponse } from "next/server";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { sendCandlingAlertEmail } from "@/lib/mailer";

const CANDLING_SCHEDULES = {
  Chicken: [7, 14, 18],
  Duck: [7, 18, 25],
  Quail: [5, 12, 15],
  Goose: [7, 14, 21],
  Turkey: [7, 14, 21],
};

const INCUBATION_DAYS = {
  Chicken: 21,
  Duck: 28,
  Quail: 18,
  Goose: 30,
  Turkey: 28,
};

function toYMD(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid");

  if (!uid) {
    return NextResponse.json({ error: "uid required" }, { status: 400 });
  }

  try {
    // Load user's owned device IDs
    const devSnap = await getDocs(collection(firestore, "users", uid, "devices"));
    const deviceIds = devSnap.docs.map((d) => d.id);

    if (!deviceIds.length) {
      return NextResponse.json({ checked: 0, alerts_sent: 0 });
    }

    // Load active egg batches for user's devices (in batches of 10 due to Firestore limit)
    const batches = [];
    for (let i = 0; i < deviceIds.length; i += 10) {
      const chunk = deviceIds.slice(i, i + 10);
      const q = query(
        collection(firestore, "egg_batches"),
        where("deviceId", "in", chunk),
        where("status", "in", ["active", "Active"])
      );
      const snap = await getDocs(q);
      snap.docs.forEach((d) => batches.push({ id: d.id, ...d.data() }));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = addDays(today, 1);
    const todayYMD = toYMD(today);
    const tomorrowYMD = toYMD(tomorrow);

    let alertsSent = 0;

    for (const batch of batches) {
      const startRaw = batch.startDate;
      const startDate = startRaw?.toDate
        ? startRaw.toDate()
        : startRaw
        ? new Date(startRaw)
        : null;

      if (!startDate || isNaN(startDate)) continue;

      const eggType = batch.eggType || "Chicken";
      const candleDays = CANDLING_SCHEDULES[eggType] || [];

      for (const day of candleDays) {
        const candleDate = addDays(startDate, day);
        const candleDateDate = new Date(candleDate);
        candleDateDate.setHours(0, 0, 0, 0);
        const candleYMD = toYMD(candleDateDate);

        let isTomorrow = false;
        if (candleYMD === todayYMD) {
          isTomorrow = false;
        } else if (candleYMD === tomorrowYMD) {
          isTomorrow = true;
        } else {
          continue; // not today or tomorrow
        }

        // Dedup key: one alert per batch per candling day per day
        const dedupKey = `candling_${batch.id}_day${day}_${todayYMD}`;
        const dedupRef = doc(firestore, "candling_alert_dedup", dedupKey);
        const dedupSnap = await getDoc(dedupRef);
        if (dedupSnap.exists()) continue; // already sent today

        // Mark as sent
        await setDoc(dedupRef, { sentAt: serverTimestamp(), batchId: batch.id, candlingDay: day });

        // Schedule date label
        const scheduleDateLabel = candleDateDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const batchLabel = batch.batchId ? `BATCH-${batch.batchId}` : batch.id;
        const notifTitle = isTomorrow
          ? `Candling Reminder — ${batchLabel}`
          : `Candle Your Eggs Today — ${batchLabel}`;
        const notifBody = isTomorrow
          ? `Day ${day} candling is scheduled for tomorrow (${scheduleDateLabel}).`
          : `Today is Day ${day} candling for ${batchLabel}. Check embryo development now.`;

        // In-app notification
        try {
          await addDoc(collection(firestore, "users", uid, "notifications"), {
            title: notifTitle,
            message: notifBody,
            type: "candling",
            batchId: batch.batchId || batch.id,
            deviceId: batch.deviceId || null,
            deviceName: batch.deviceName || null,
            candlingDay: day,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch (e) {
          console.error("[candling-check] Failed to create in-app notification:", e.message);
        }

        // Email
        try {
          await sendCandlingAlertEmail({
            batchId: batch.batchId || batch.id,
            batchName: batchLabel,
            deviceName: batch.deviceName || batch.deviceId || null,
            candlingDay: day,
            scheduleDate: scheduleDateLabel,
            eggType,
            isTomorrow,
          });
        } catch (e) {
          console.error("[candling-check] Failed to send candling email:", e.message);
        }

        alertsSent++;
      }
    }

    return NextResponse.json({ checked: batches.length, alerts_sent: alertsSent });
  } catch (err) {
    console.error("[candling-check] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
