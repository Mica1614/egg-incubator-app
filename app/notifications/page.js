// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { auth, firestore } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useGlobalMute } from "@/lib/useGlobalMute";
import { groupNotifications } from "@/lib/notificationPolicy.mjs";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import {
  Layers,
  LogIn,
  Trash2,
  Droplet,
  Droplets,
  RotateCcw,
  Wind,
  CloudRain,
  Thermometer,
  Bell,
  BellOff,
  Heater,
  WifiOff,
  Wifi,
} from "lucide-react";
export default function NotificationsPage() {
  const [uid, setUid] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Collapse repeats of the same alert for the same device into a single row.
  const [grouped, setGrouped] = useState(false);
  const { isMuted, toggle: toggleMute } = useGlobalMute();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setError("");
    if (!uid) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(firestore, "users", uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setNotifications(next);
      },
      (e) => {
        const message = e?.message || "Failed to load notifications.";
        const code = e?.code ? ` (${e.code})` : "";
        setError(`${message}${code}`);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const unreadCount = useMemo(() => {
    return notifications.reduce((acc, item) => (item?.read ? acc : acc + 1), 0);
  }, [notifications]);

  /**
   * In grouped mode each row is the most recent notification of its
   * (device, type) pair, carrying a repeat count. Deleting a grouped row still
   * deletes only that one document — the count is a display aid, not a batch
   * selection, so nothing is destroyed that the user cannot see.
   */
  const visibleNotifications = useMemo(() => {
    if (!grouped) return notifications;
    return groupNotifications(notifications).map((group) => ({
      ...group.latest,
      _repeatCount: group.count,
    }));
  }, [notifications, grouped]);

  const formatTimestamp = (createdAt) => {
    try {
      const date = createdAt?.toDate ? createdAt.toDate() : createdAt ? new Date(createdAt) : null;
      if (!date || Number.isNaN(date.getTime())) return "";

      const dateStr = date.toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
      });
      const timeStr = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

      return `${dateStr}, ${timeStr}`;
    } catch {
      return "";
    }
  };

  const toneForNotification = (item) => {
    const t = String(item?.tone || item?.type || "").toLowerCase();
    if (t.includes("danger") || t.includes("security") || t.includes("alert") || t.includes("warning")) {
      return "danger";
    }
    return "info";
  };

  const getIconComponent = (iconName) => {
    const iconMap = {
      Droplet,
      Droplets,
      RotateCcw,
      Wind,
      CloudRain,
      Thermometer,
      Heater,
      WifiOff,
      Wifi,
      Flame: Heater, // legacy alias
      Zap: Heater, // legacy alias for old Firestore records
      Bell,
    };
    return iconMap[iconName] || Bell;
  };

  const markAllAsRead = async () => {
    if (!uid) return;

    const unread = notifications.filter((n) => n && !n.read);
    if (unread.length === 0) return;

    try {
      const batch = writeBatch(firestore);
      unread.forEach((n) => {
        batch.set(
          doc(firestore, "users", uid, "notifications", n.id),
          { read: true, readAt: serverTimestamp() },
          { merge: true }
        );
      });
      await batch.commit();
    } catch (e) {
      console.error("Failed to mark all notifications as read:", e);
    }
  };

  const clearAllNotifications = async () => {
    if (!uid || notifications.length === 0) return;
    try {
      // Firestore batch limit is 500 — chunk if needed
      const ids = notifications.map((n) => n.id);
      const CHUNK = 400;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = writeBatch(firestore);
        ids.slice(i, i + CHUNK).forEach((id) => {
          batch.delete(doc(firestore, "users", uid, "notifications", id));
        });
        await batch.commit();
      }
    } catch (e) {
      console.error("Failed to clear all notifications:", e);
    }
  };

  const deleteNotification = async (id) => {
    if (!uid || !id) return;
    try {
      await deleteDoc(doc(firestore, "users", uid, "notifications", id));
    } catch (e) {
      console.error("Failed to delete notification:", e);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <TopBar
            title="Notifications"
            notificationCount={unreadCount}
            onOpenSidebar={() => setIsSidebarOpen(true)}
          />

          <section className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold tracking-tight text-slate-900">
                  All Notifications
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {uid
                    ? `${notifications.length} total • ${unreadCount} unread${
                        grouped ? ` • showing ${visibleNotifications.length} grouped` : ""
                      }`
                    : "Sign in to view notifications."}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGrouped((g) => !g)}
                  disabled={!uid || notifications.length === 0}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold shadow-sm transition disabled:opacity-40 ${
                    grouped ? "bg-sky-600 text-white hover:bg-sky-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                  title="Collapse repeats of the same alert for the same device into one row"
                >
                  <Layers className="h-4 w-4" />
                  {grouped ? "Grouped" : "Group"}
                </button>
                <button
                  type="button"
                  onClick={markAllAsRead}
                  disabled={!uid || unreadCount === 0}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40"
                >
                  Mark all as read
                </button>
                <button
                  type="button"
                  onClick={clearAllNotifications}
                  disabled={!uid || notifications.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-600 shadow-sm ring-1 ring-rose-200 transition hover:bg-rose-100 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold shadow-sm transition ${
                    isMuted
                      ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                  title={isMuted ? "Notifications muted globally — click to unmute" : "Click to mute all notifications"}
                >
                  <BellOff className="h-4 w-4" />
                  {isMuted ? "Unmute" : "Mute"}
                </button>
              </div>
            </div>

            {error ? (
              <div className="mt-5 rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
                {error}
              </div>
            ) : null}

            {!uid ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200">
                  <LogIn className="h-5 w-5 text-slate-500" />
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-700">You are not signed in.</p>
                <p className="mt-1 text-[11px] text-slate-400">Please sign in to view notifications.</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <p className="text-xs font-semibold text-slate-700">No notifications</p>
                <p className="mt-1 text-[11px] text-slate-400">You’re all caught up.</p>
              </div>
            ) : (
              <div className="mt-5 max-h-[600px] overflow-y-auto rounded-2xl ring-1 ring-slate-200">
                {visibleNotifications.map((item) => {
                  const IconComponent = getIconComponent(item?.icon);
                  const iconColor = item?.iconColor || "text-slate-500";
                  const isRead = Boolean(item?.read);

                  const repeatCount = item?._repeatCount ?? 1;
                  const titleText = item?.title || item?.text || "Notification";
                  const messageText = item?.message || "";
                  const timestamp = formatTimestamp(item?.createdAt);

                  return (
                    <div key={item.id} className={`flex items-start gap-4 border-b border-slate-200 px-5 py-4 last:border-b-0 transition ${
                      isRead
                        ? "bg-white opacity-70 hover:opacity-85"
                        : "bg-sky-50/30 hover:bg-sky-50/60"
                    }`}>
                      <div className={`shrink-0 pt-0.5 ${iconColor}`}>
                        <IconComponent className="h-6 w-6" />
                      </div>

                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm leading-snug text-slate-900 ${
                            isRead ? "font-normal" : "font-semibold"
                          }`}>
                            {titleText}
                            {repeatCount > 1 && (
                              <span
                                className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600"
                                title={`${repeatCount} notifications of this type for this device`}
                              >
                                ×{repeatCount}
                              </span>
                            )}
                          </p>
                          {!isRead && (
                            <div className="h-2 w-2 shrink-0 rounded-full bg-sky-500 mt-2" />
                          )}
                        </div>
                        {messageText ? (
                          <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-600">
                            {String(messageText)}
                          </p>
                        ) : null}
                        {timestamp ? (
                          <p className="mt-1 text-[10px] text-slate-400">{timestamp}</p>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteNotification(item.id)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-200 hover:text-slate-600"
                        aria-label="Delete notification"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
