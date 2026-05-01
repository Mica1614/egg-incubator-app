"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  Bell,
  LogIn,
  Menu,
  Shield,
  Trash2,
  Droplet,
  Droplets,
  RotateCcw,
  Wind,
  CloudRain,
  Thermometer,
} from "lucide-react";
import Link from "next/link";
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
import { auth, firestore } from "@/lib/firebase";

export default function TopBar({
  title,
  notificationCount = 0,
  notificationsOverride = null,
  onOpenSidebar = null,
}) {
  const dropdownRef = useRef(null);
  const [userInfo, setUserInfo] = useState({
    displayName: "",
    email: "",
  });

  const [uid, setUid] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsError, setNotificationsError] = useState("");

  const overrideActive = Array.isArray(notificationsOverride);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUserInfo({ displayName: "", email: "" });
        setUid(null);
        if (!overrideActive) {
          setNotifications([]);
          setNotificationsError("");
        }
        return;
      }

      const email = user.email || "";
      const displayName =
        user.displayName ||
        (email && email.includes("@") ? email.split("@")[0] : "User");

      setUserInfo({ displayName, email });
      setUid(user.uid || null);
    });

    return () => unsubscribe();
  }, [overrideActive]);

  useEffect(() => {
    setNotificationsError("");

    if (overrideActive) {
      setNotifications(Array.isArray(notificationsOverride) ? notificationsOverride : []);
      return;
    }

    if (!uid) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(firestore, "users", uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(25)
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
      (error) => {
        const message = error?.message || "Failed to load notifications.";
        const code = error?.code ? ` (${error.code})` : "";
        setNotificationsError(`${message}${code}`);
      }
    );

    return () => unsubscribe();
  }, [uid, overrideActive, notificationsOverride]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      window.addEventListener("keydown", onKeyDown);
    }

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDropdownOpen]);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (!dropdownRef.current) return;
      if (dropdownRef.current.contains(e.target)) return;
      setIsDropdownOpen(false);
    };

    if (isDropdownOpen) {
      window.addEventListener("mousedown", onMouseDown);
    }

    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [isDropdownOpen]);

  const avatarLetter = useMemo(() => {
    const s = userInfo.displayName || userInfo.email || "U";
    return String(s).trim().charAt(0).toUpperCase() || "U";
  }, [userInfo.displayName, userInfo.email]);

  const unreadCount = useMemo(() => {
    return notifications.reduce((acc, item) => {
      return item?.read ? acc : acc + 1;
    }, 0);
  }, [notifications]);

  const dropdownNotifications = useMemo(() => {
    return notifications.slice(0, 5);
  }, [notifications]);

  const safeCount = Number.isFinite(Number(unreadCount))
    ? Math.max(0, Number(unreadCount))
    : Number.isFinite(Number(notificationCount))
    ? Math.max(0, Number(notificationCount))
    : 0;

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
      Bell,
    };
    return iconMap[iconName] || Bell;
  };

  const getIconColor = (tone) => {
    const toneMap = {
      warning: "text-rose-500",
      success: "text-emerald-500",
      info: "text-sky-500",
      danger: "text-rose-500",
    };
    return toneMap[tone] || "text-slate-500";
  };

  const markAllAsRead = async () => {
    if (overrideActive) return;
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
      console.error("Failed to mark all as read:", e);
    }
  };

  const deleteNotification = async (id) => {
    if (overrideActive) return;
    if (!uid || !id) return;
    try {
      await deleteDoc(doc(firestore, "users", uid, "notifications", id));
    } catch (e) {
      console.error("Failed to delete notification:", e);
    }
  };

  return (
    <header className="rounded-2xl bg-white px-6 py-4 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {typeof onOpenSidebar === "function" ? (
            <button
              type="button"
              onClick={onOpenSidebar}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50 lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : null}

          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen((v) => !v)}
              className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50 ${
                isDropdownOpen ? "ring-sky-200" : ""
              }`}
              aria-label="Notifications"
              aria-expanded={isDropdownOpen}
            >
              <Bell className="h-5 w-5" />
              {safeCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                  {safeCount > 99 ? "99+" : safeCount}
                </span>
              ) : null}
            </button>

            {isDropdownOpen ? (
              <div
                className="fixed left-3 right-3 top-[76px] z-50 flex max-h-[calc(100vh-96px)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:block sm:max-h-none sm:w-[360px]"
              >
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
                  <p className="text-sm font-semibold tracking-tight text-slate-900">
                    Notifications
                  </p>
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="text-xs font-medium text-slate-500 transition hover:text-slate-700"
                  >
                    Mark all as read
                  </button>
                </div>

                {notificationsError ? (
                  <div className="px-5 py-4 text-xs font-medium text-rose-700">
                    {notificationsError}
                  </div>
                ) : null}

                {!overrideActive && !uid ? (
                  <div className="px-5 py-6">
                    <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-100">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900/5 text-slate-700 ring-1 ring-slate-200/60">
                        <LogIn className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Sign in required</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                          Please sign in to view notifications.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="px-5 py-6">
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                      <p className="text-xs font-semibold text-slate-700">No notifications</p>
                      <p className="mt-1 text-[11px] text-slate-400">You’re all caught up.</p>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[420px] overflow-auto sm:max-h-[420px]">
                    {dropdownNotifications.map((item) => {
                      const IconComponent = getIconComponent(item?.icon);
                      const iconColor = getIconColor(item?.tone);
                      const isRead = Boolean(item?.read);

                      const titleText =
                        item?.title ||
                        item?.text ||
                        "Notification";

                      const messageText = item?.message || "";

                      const timestamp = formatTimestamp(item?.createdAt);

                      return (
                        <div
                          key={item.id}
                          className={`flex items-start gap-3 border-b border-slate-200 px-5 py-4 transition ${
                            isRead
                              ? "bg-white opacity-60 hover:opacity-80"
                              : "bg-sky-50/30 hover:bg-sky-50/60"
                          }`}
                        >
                          <div className={`shrink-0 pt-0.5 ${iconColor}`}>
                            <IconComponent className="h-5 w-5" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className={`text-sm font-semibold leading-snug text-slate-900 ${
                                  isRead ? "font-normal" : "font-semibold"
                                }`}
                              >
                                {titleText}
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
                              <p className="mt-1 text-[10px] text-slate-400">
                                {timestamp}
                              </p>
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

                <div className="border-t border-slate-200 px-5 py-3 text-center">
                  <Link
                    href="/notifications"
                    onClick={() => setIsDropdownOpen(false)}
                    className="text-xs font-semibold text-sky-700 transition hover:text-sky-800"
                  >
                    See all notifications
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-3 rounded-full bg-white px-3 py-1.5 text-xs shadow-sm ring-1 ring-slate-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500 text-xs font-semibold text-white">
              {avatarLetter}
            </div>
            <div className="hidden flex-col sm:flex">
              <span className="text-xs font-semibold text-slate-900">
                {userInfo.displayName || "-"}
              </span>
              <span className="text-[11px] text-slate-500">
                {userInfo.email || "-"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
