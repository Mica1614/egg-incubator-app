// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { auth, firestore } from "@/lib/firebase";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

const formatToday = () => {
  const now = new Date();
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export default function SettingsPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const today = useMemo(() => formatToday(), []);

  const [authUser, setAuthUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setError("");
    setSuccess("");
    setIsLoading(true);

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setAuthUser(user || null);
        setIsLoading(false);
      },
      (e) => {
        const message = e?.message || "Failed to read authentication state.";
        const code = e?.code ? ` (${e.code})` : "";
        setError(`${message}${code}`);
        setAuthUser(null);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const pushNotification = async (uid, title, message) => {
    if (!uid) return;
    try {
      await addDoc(collection(firestore, "users", uid, "notifications"), {
        title,
        message,
        tone: "info",
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Failed to write notification:", e);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!authUser) {
      setError("You are not signed in.");
      return;
    }

    const email = authUser.email || "";

    if (!email) {
      setError("This account has no email address. Password change is not available.");
      return;
    }

    const nextCurrent = String(currentPassword || "");
    const nextNew = String(newPassword || "");
    const nextConfirm = String(confirmPassword || "");

    if (!nextCurrent || !nextNew || !nextConfirm) {
      setError("Please fill out all password fields.");
      return;
    }

    if (nextNew.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    if (nextNew !== nextConfirm) {
      setError("New password and confirm password do not match.");
      return;
    }

    setIsSaving(true);
    try {
      const credential = EmailAuthProvider.credential(email, nextCurrent);
      await reauthenticateWithCredential(authUser, credential);
      await updatePassword(authUser, nextNew);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setSuccess("Password updated successfully.");

      await pushNotification(
        authUser.uid,
        "Password changed",
        "Your account password was updated successfully."
      );
    } catch (e2) {
      const message = e2?.message || "Failed to change password.";
      const code = e2?.code ? ` (${e2.code})` : "";
      setError(`${message}${code}`);

      if (String(e2?.code || "") === "auth/requires-recent-login") {
        await pushNotification(
          authUser.uid,
          "Password change failed",
          "For security reasons, please sign in again and retry changing your password."
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-4">
            <TopBar
              title="Change Password"
              notificationCount={3}
              onOpenSidebar={() => setIsSidebarOpen(true)}
            />
            <p className="text-[11px] font-medium text-slate-400">{today}</p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-emerald-100/80 bg-emerald-50/80 px-4 py-3 text-xs font-medium text-emerald-700">
              {success}
            </div>
          ) : null}

          {!isLoading && !authUser ? (
            <section className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <p className="text-xs font-semibold text-slate-700">
                  You are not signed in.
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Please sign in to change your password.
                </p>
              </div>
            </section>
          ) : (
            <section className="grid gap-4">
              <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Account Security
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                    Change Password
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    For your security, confirm your current password before setting a new one.
                  </p>
                </div>

                <form onSubmit={handleChangePassword} className="mt-6 grid gap-4 sm:max-w-xl">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/15"
                      placeholder="Enter current password"
                      autoComplete="current-password"
                      disabled={isSaving}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/15"
                      placeholder="Enter new password"
                      autoComplete="new-password"
                      disabled={isSaving}
                    />
                    <p className="mt-2 text-[11px] text-slate-400">
                      Minimum 6 characters.
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/15"
                      placeholder="Re-enter new password"
                      autoComplete="new-password"
                      disabled={isSaving}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={isSaving || isLoading || !authUser}
                      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:from-sky-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? "Updating..." : "Update Password"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setSuccess("");
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");
                      }}
                      disabled={isSaving}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Clear
                    </button>
                  </div>
                </form>
              </article>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
