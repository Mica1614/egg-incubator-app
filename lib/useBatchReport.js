// @ts-nocheck
"use client";

/**
 * lib/useBatchReport.js — Fetches every source a batch report needs and hands
 * the raw documents to buildBatchReport.
 *
 * Reads run through the client SDK, matching every other page in the app. All
 * arithmetic lives in lib/batchReport.mjs so it stays testable without Firebase.
 */

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { get, ref } from "firebase/database";
import { db, firestore } from "@/lib/firebase";
import { buildBatchReport, resolveWindow } from "@/lib/batchReport.mjs";
import { LOG_INTERVAL_KEY } from "@/lib/useDeviceHistoryLogger";

function readIntervalMs() {
  try {
    const raw = localStorage.getItem(LOG_INTERVAL_KEY);
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 5_000) return parsed;
  } catch {}
  return 60_000;
}

/** Firestore surfaces a missing index as failed-precondition with a console link. */
function describeError(error) {
  if (error?.code === "failed-precondition") {
    return `${error.message} — a Firestore index is required for this query.`;
  }
  return error?.message || "Failed to load report data.";
}

/**
 * @param deviceId     route device id
 * @param docId        egg_batches document id (what egg_scans.batchId points at)
 * @param uid          signed-in user, for their notifications collection
 * @param deviceLabel  the device's CURRENT nickname — notifications are stored
 *                     against the nickname in force when they fired, which may
 *                     differ from the one frozen on the batch at creation time
 */
export function useBatchReport(deviceId, docId, uid, deviceLabel = null) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!deviceId || !docId) return;

    setLoading(true);
    setError("");
    setNotFound(false);

    try {
      const batchSnap = await getDoc(doc(firestore, "egg_batches", docId));
      if (!batchSnap.exists()) {
        setNotFound(true);
        setReport(null);
        return;
      }

      const batch = { id: batchSnap.id, ...batchSnap.data() };
      const { start, end } = resolveWindow(batch, new Date());

      if (!start) {
        setError("This batch has no start date, so its report window cannot be determined.");
        setReport(null);
        return;
      }

      const fromTs = Timestamp.fromDate(start);
      const toTs = Timestamp.fromDate(end);

      // egg_scans is queried by equality only and sorted in the aggregation
      // module — adding orderBy here would require a composite index.
      const [readingsSnap, activitySnap, scansSnap, inventorySnap, deviceStateSnap] =
        await Promise.all([
          getDocs(
            query(
              collection(firestore, "devices", deviceId, "history"),
              where("createdAt", ">=", fromTs),
              where("createdAt", "<=", toTs),
              orderBy("createdAt", "asc")
            )
          ),
          getDocs(
            query(
              collection(firestore, "devices", deviceId, "activityLog"),
              where("createdAt", ">=", fromTs),
              where("createdAt", "<=", toTs),
              orderBy("createdAt", "asc")
            )
          ),
          getDocs(query(collection(firestore, "egg_scans"), where("batchId", "==", docId))),
          // Matched on the batch_id field, not the document id: the two
          // batch-history pages write different id shapes for the same batch.
          batch.batchId
            ? getDocs(
                query(
                  collection(firestore, "chick_inventory"),
                  where("batch_id", "==", String(batch.batchId))
                )
              )
            : Promise.resolve(null),
          get(ref(db, `devices/${deviceId}/state`)).catch(() => null),
        ]);

      // Notifications are per-user; scope to this device by its nickname, or by
      // batch id for the candling reminders that carry one.
      let notifications = [];
      if (uid) {
        const notifSnap = await getDocs(
          query(
            collection(firestore, "users", uid, "notifications"),
            where("createdAt", ">=", fromTs),
            where("createdAt", "<=", toTs),
            orderBy("createdAt", "asc")
          )
        );
        const deviceLabels = [batch.deviceName, deviceLabel, deviceId]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase());
        notifications = notifSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((n) => {
            if (n.batchId && n.batchId === docId) return true;
            if (!n.deviceName) return false;
            return deviceLabels.includes(String(n.deviceName).toLowerCase());
          });
      }

      setReport(
        buildBatchReport({
          batch,
          docId,
          deviceId,
          deviceName: batch.deviceName,
          deviceState: deviceStateSnap?.val?.() ?? null,
          readings: readingsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          activity: activitySnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          scans: scansSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          notifications,
          inventory: inventorySnap ? inventorySnap.docs.map((d) => d.data()) : [],
          intervalMs: readIntervalMs(),
          now: new Date(),
        })
      );
    } catch (err) {
      console.error("[useBatchReport] load failed:", err);
      setError(describeError(err));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [deviceId, docId, uid, deviceLabel]);

  useEffect(() => {
    load();
  }, [load]);

  return { report, loading, error, notFound, reload: load };
}
