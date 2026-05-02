// @ts-nocheck
"use client";

/**
 * AlertEmailProvider
 *
 * Invisible client component that activates the useEmailAlerts hook
 * for the currently logged-in user and all their owned devices.
 * Drop this inside the app layout so it runs on every page.
 */

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { useEmailAlerts } from "@/lib/useEmailAlerts";

function AlertEmailWatcher({ uid }) {
  const [deviceIds, setDeviceIds] = useState([]);

  // Subscribe to user's owned device list from Firestore
  useEffect(() => {
    if (!uid) return;

    const unsub = onSnapshot(
      collection(firestore, "users", uid, "devices"),
      (snap) => {
        setDeviceIds(snap.docs.map((d) => d.id));
      },
      (err) => console.error("[AlertEmailProvider] device list error:", err)
    );

    return () => unsub();
  }, [uid]);

  // Activate the alert hook
  useEmailAlerts(uid, deviceIds);

  return null; // renders nothing
}

export function AlertEmailProvider() {
  const [uid, setUid] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  if (!uid) return null;
  return <AlertEmailWatcher uid={uid} />;
}
