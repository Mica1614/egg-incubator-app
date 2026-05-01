// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Link from "next/link";
import { Settings2, ChevronRight, PlusCircle } from "lucide-react";

export default function ControlCenterPage() {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.replace("/login"); return; }
      const colRef = collection(firestore, "users", user.uid, "devices");
      const unsub2 = onSnapshot(colRef, (snap) => {
        setDevices(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, () => setLoading(false));
      return () => unsub2();
    });
    return () => unsub();
  }, [router]);

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />
        <main className="flex flex-1 flex-col gap-6">
          <TopBar title="Control Center" onOpenSidebar={() => setIsSidebarOpen(true)} />

          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">Control Center</h1>
            <p className="mt-1 text-xs text-slate-500">Select a device to manage its controls.</p>
          </div>

          {loading && <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />}

          {!loading && devices.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white px-8 py-16 text-center">
              <Settings2 className="mb-4 h-12 w-12 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No incubators registered</p>
              <p className="mt-1 text-xs text-slate-400">Add an incubator from the dashboard to start controlling it.</p>
              <Link href="/dashboard" className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#004a87] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#003d72]">
                <PlusCircle className="h-3.5 w-3.5" /> Go to Dashboard
              </Link>
            </div>
          )}

          {devices.length > 0 && (
            <div className="flex flex-col gap-3">
              {devices.map((d) => (
                <Link
                  key={d.id}
                  href={`/devices/${d.id}/control`}
                  className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-500 ring-1 ring-sky-100">
                      <Settings2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{d.nickname || d.id}</p>
                      <p className="font-mono text-[10px] text-slate-400">{d.id}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
