// @ts-nocheck
"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export default function BreadcrumbNav({ deviceId, deviceName, currentPage }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-slate-200 backdrop-blur-sm">
      {/* Home */}
      <Link
        href="/dashboard"
        className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#004a87] transition"
        title="Dashboard"
      >
        <Home className="h-4 w-4" />
        <span className="hidden sm:inline">Dashboard</span>
      </Link>

      <ChevronRight className="h-4 w-4 text-slate-300" />

      {/* Device */}
      <Link
        href={`/devices/${deviceId}`}
        className="text-sm font-medium text-slate-600 hover:text-[#004a87] transition truncate"
        title={deviceName || deviceId}
      >
        {deviceName || deviceId}
      </Link>

      {currentPage && (
        <>
          <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
          {/* Current Page */}
          <span className="text-sm font-semibold text-[#004a87] truncate">
            {currentPage}
          </span>
        </>
      )}
    </div>
  );
}
