// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { auth, firestore } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
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
import { LogIn, Shield, Trash2, Calendar, Eye, AlertTriangle } from "lucide-react";

export default function NotificationsPage() {
  const [uid, setUid] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  const iconForNotification = (item) => {
    const type = String(item?.type || "").toLowerCase();
    const tone = String(item?.tone || "").toLowerCase();
    
    // Candling reminders get special icons
    if (type.includes("candling")) {
      if (tone.includes("danger") || tone.includes("urgent")) {
        return { icon: AlertTriangle, bg: "bg-rose-600" };
      } else if (tone.includes("warning")) {
        return { icon: Eye, bg: "bg-amber-600" };
      } else {
        return { icon: Calendar, bg: "bg-blue-600" };
      }
    }
    
    // Default icons
    if (tone.includes("danger") || tone.includes("warning")) {
      return { icon: Shield, bg: "bg-rose-600" };
    }
    return { icon: LogIn, bg: "bg-[#0b4f78]" };
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
                  {uid ? `${notifications.length} total • ${unreadCount} unread` : "Sign in to view notifications."}
                </p>
              </div>

              <button
                type="button"
                onClick={markAllAsRead}
                disabled={!uid || unreadCount === 0}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40"
              >
                Mark all as read
              </button>
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
              <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-slate-200">
                {notifications.map((item) => {
                  const tone = toneForNotification(item);
                  const isDanger = tone === "danger";
                  const titleText = item?.title || item?.text || "Notification";
                  const messageText = item?.message || "";
                  const timestamp = formatTimestamp(item?.createdAt);
                  const { icon: IconComponent, bg: iconBg } = iconForNotification(item);

                  return (
                    <div key={item.id} className="flex items-start gap-4 border-b border-slate-200 bg-white px-5 py-4 last:border-b-0">
                      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-white ${iconBg}`}>
                        <IconComponent className="h-5 w-5" />
                      </div>

                      <div className="flex-1">
                        <p className={`text-sm font-semibold leading-snug text-slate-900 ${item?.read ? "opacity-80" : ""}`}>
                          {titleText}
                        </p>
                        {messageText ? (
                          <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-600">
                            {String(messageText)}
                          </p>
                        ) : null}
                        {timestamp ? (
                          <p className="mt-1 text-[11px] text-slate-500">{timestamp}</p>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteNotification(item.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
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
