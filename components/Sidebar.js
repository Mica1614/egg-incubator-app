"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  ChevronDown,
  ChevronUp,
  Egg,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Package,
  ScanLine,
  Settings,
  Settings2,
  TrendingUp,
  User,
  X,
  Zap,
} from "lucide-react";

export default function Sidebar({ mobileOpen = false, onMobileClose = null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const prevPathRef = useRef(pathname);

  const isChangePassword = pathname === "/settings";
  const isConfiguration = pathname === "/configuration";
  const isSettingsGroupActive = isChangePassword || isConfiguration;
  const [isSettingsOpen, setIsSettingsOpen] = useState(isSettingsGroupActive);

  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/devices/");
  const isEggDetectorScanner = pathname === "/egg-detector-scanner";
  const isControlCenter = pathname === "/control-center";
  const isEggBatches = pathname === "/egg-batches";
  const isBatchHistory = pathname === "/batch-history";
  const isChickInventory = pathname === "/chick-inventory";
  const isHatchAnalysis = pathname === "/hatch-analysis";
  const isPowerConsumption = pathname === "/power-consumption";
  const isProfile = pathname === "/profile";

  const closeMobile = useCallback(() => {
    if (typeof onMobileClose === "function") onMobileClose();
  }, [onMobileClose]);

  useEffect(() => {
    if (!mobileOpen) {
      prevPathRef.current = pathname;
      return;
    }

    const prevPath = prevPathRef.current;
    prevPathRef.current = pathname;
    if (prevPath !== pathname) {
      closeMobile();
    }
  }, [pathname, mobileOpen, closeMobile]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeMobile();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, closeMobile]);

  const handleOpenSignOut = () => {
    setSignOutError("");
    setIsSignOutModalOpen(true);
  };

  const handleCloseSignOut = () => {
    if (isSigningOut) return;
    setIsSignOutModalOpen(false);
    setSignOutError("");
  };

  const handleConfirmSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError("");

    try {
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage?.clear?.();
        } catch {}
        try {
          window.localStorage?.clear?.();
        } catch {}
      }

      await signOut(auth);

      setIsSignOutModalOpen(false);
      router.replace("/login");
    } catch (e) {
      const message = e?.message || "Failed to sign out.";
      const code = e?.code ? ` (${e.code})` : "";
      setSignOutError(`${message}${code}`);
    } finally {
      setIsSigningOut(false);
    }
  };

  const content = (
    <div className="px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center">
          <Image
            src="/eggcubator3.png"
            alt="Eggcubator Logo"
            width={48}
            height={48}
            className="h-full w-full object-contain"
            priority
          />
        </div>
        <div className="flex flex-col">
          <p className="text-lg font-bold tracking-tight text-[#004a87] uppercase leading-none">
            Eggcubator
          </p>
          <p className="mt-1 text-[11px] leading-[1.25] font-medium text-slate-500">
            Web-based Smart Egg Incubator Monitoring and Control Platform
          </p>
        </div>
      </div>

      <nav className="mt-6 space-y-4 text-sm">
        <div>
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Menus
          </p>
          <ul className="space-y-1">
            <li>
              <Link
                href="/dashboard"
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition ${
                  isDashboard
                    ? "bg-sky-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={closeMobile}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span>Dashboard</span>
              </Link>
            </li>
            <li>
              <Link
                href="/egg-detector-scanner"
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition ${
                  isEggDetectorScanner
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={closeMobile}
              >
                <ScanLine className="h-3.5 w-3.5" />
                <span>Egg Detector Scanner</span>
              </Link>
            </li>
            <li>
              <Link
                href="/control-center"
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition ${
                  isControlCenter
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={closeMobile}
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span>Control Center</span>
              </Link>
            </li>
            <li>
              <Link
                href="/egg-batches"
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition ${
                  isEggBatches
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={closeMobile}
              >
                <Egg className="h-3.5 w-3.5" />
                <span>Egg Batches</span>
              </Link>
            </li>
            <li>
              <Link
                href="/batch-history"
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition ${
                  isBatchHistory
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={closeMobile}
              >
                <History className="h-3.5 w-3.5" />
                <span>Batch History</span>
              </Link>
            </li>
            <li>
              <Link
                href="/chick-inventory"
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition ${
                  isChickInventory
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={closeMobile}
              >
                <Package className="h-3.5 w-3.5" />
                <span>Chick Inventory</span>
              </Link>
            </li>
            <li>
              <Link
                href="/hatch-analysis"
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition ${
                  isHatchAnalysis
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={closeMobile}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Hatch Analysis</span>
              </Link>
            </li>
            <li>
              <Link
                href="/power-consumption"
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition ${
                  isPowerConsumption
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={closeMobile}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Power Consumption</span>
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Management
          </p>
          <ul className="space-y-1">
            <li>
              <Link
                href="/profile"
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition ${
                  isProfile
                    ? "bg-sky-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={closeMobile}
              >
                <User className="h-3.5 w-3.5" />
                <span>Profile</span>
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setIsSettingsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                aria-expanded={isSettingsOpen}
              >
                <span className="flex items-center gap-3">
                  <Settings className="h-3.5 w-3.5" />
                  <span>Settings</span>
                </span>
                {isSettingsOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 opacity-90" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 opacity-90" />
                )}
              </button>

              {isSettingsOpen ? (
                <div className="mt-1 pl-2">
                  <div className="border-l-2 border-slate-200 pl-2">
                    <ul className="space-y-1">
                      <li>
                        <Link
                          href="/settings"
                          className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition ${
                            isChangePassword
                              ? "bg-sky-600 text-white"
                              : "text-slate-600 hover:bg-slate-50"
                          }`}
                          onClick={closeMobile}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          <span>Change Password</span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/configuration"
                          className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition ${
                            isConfiguration
                              ? "bg-sky-600 text-white"
                              : "text-slate-600 hover:bg-slate-50"
                          }`}
                          onClick={closeMobile}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          <span>Configuration</span>
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              ) : null}
            </li>
          </ul>
        </div>
      </nav>

      <div className="mt-4">
        <button
          type="button"
          onClick={handleOpenSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold text-rose-500 hover:bg-rose-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign out</span>
        </button>
      </div>

      {isSignOutModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm sign out"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) handleCloseSignOut();
          }}
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <p className="text-sm font-semibold tracking-tight text-slate-900">
              Sign out
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Are you sure you want to sign out? This will terminate all current activity on this device.
            </p>

            {signOutError ? (
              <p className="mt-3 text-xs font-medium text-rose-700">
                {signOutError}
              </p>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseSignOut}
                disabled={isSigningOut}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSignOut}
                disabled={isSigningOut}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-rose-600 px-4 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSigningOut ? "Signing out..." : "Yes, sign out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 flex-shrink-0 flex-col gap-4 rounded-3xl bg-white/95 pb-3 pt-3 shadow-sm ring-1 ring-slate-100 lg:flex">
        {content}
      </aside>

      <div
        className={`fixed inset-0 z-[90] lg:hidden transition-opacity duration-300 ease-out ${
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ease-out"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeMobile();
          }}
        />

        <div
          className={`absolute inset-y-0 left-0 w-[min(20rem,85vw)] transform-gpu transition-transform duration-300 ease-out will-change-transform ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <aside className="relative flex h-full w-full flex-col gap-4 bg-white/95 pb-3 pt-3 shadow-2xl ring-1 ring-slate-200">
            <div className="flex justify-end px-3">
              <button
                type="button"
                onClick={closeMobile}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50"
                aria-label="Close sidebar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {content}
          </aside>
        </div>
      </div>
    </>
  );
}
