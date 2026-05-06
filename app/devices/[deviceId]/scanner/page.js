// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import BreadcrumbNav from "@/components/BreadcrumbNav";
import Link from "next/link";
import { ChevronLeft, ScanLine, AlertTriangle } from "lucide-react";

export default function DeviceScannerPage() {
  const { deviceId } = useParams();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(null);
  const [nickname, setNickname] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace("/login"); return; }
      const snap = await getDoc(doc(firestore, "users", user.uid, "devices", deviceId));
      if (!snap.exists()) { setAuthorized(false); return; }
      setNickname(snap.data()?.nickname || deviceId);
      setAuthorized(true);
    });
    return () => unsub();
  }, [deviceId, router]);

  if (authorized === null) return <div className="flex h-screen items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#004a87] border-t-transparent" /></div>;
  if (authorized === false) return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-12 w-12 text-amber-400" />
      <Link href="/dashboard" className="rounded-2xl bg-[#004a87] px-4 py-2 text-sm font-semibold text-white">Back to Dashboard</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />
        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="Egg Scanner" onOpenSidebar={() => setIsSidebarOpen(true)} />

          <BreadcrumbNav deviceId={deviceId} deviceName={nickname} currentPage="Scanner" />

          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white px-8 py-16 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-sky-50 text-sky-400 ring-1 ring-sky-100">
              <ScanLine className="h-10 w-10" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Egg Candling Scanner</h2>
            <p className="mt-2 max-w-sm text-sm text-slate-500">
              Use the egg detector scanner to analyze egg viability and embryo development using the AI candling model.
            </p>
            <Link
              href="/egg-detector-scanner"
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#004a87] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#003d72]"
            >
              <ScanLine className="h-4 w-4" />
              Open Scanner
            </Link>
            <p className="mt-3 text-[11px] text-slate-400">
              Device context: <span className="font-mono">{deviceId}</span>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
