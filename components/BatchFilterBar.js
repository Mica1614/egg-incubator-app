// @ts-nocheck
"use client";

/**
 * Filter controls shared by the global and per-device batch-history pages, so
 * both behave identically. Filtering logic lives in lib/batchFilters.mjs.
 */

import { Search, SlidersHorizontal, X } from "lucide-react";
import { EGG_TYPES, HATCH_RATE_BANDS, hasActiveFilters, EMPTY_FILTERS } from "@/lib/batchFilters.mjs";

const FIELD =
  "rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-500/10";

export default function BatchFilterBar({ filters, onChange, resultCount, totalCount }) {
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value });
  const active = hasActiveFilters(filters);

  return (
    <div className="rounded-3xl bg-white px-5 py-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-slate-400" />
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Filters</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-medium text-slate-400">
            {resultCount} of {totalCount} batches
          </p>
          {active && (
            <button
              type="button"
              onClick={() => onChange({ ...EMPTY_FILTERS })}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              <X className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.search ?? ""}
            onChange={set("search")}
            placeholder="Search batch, type, device, notes…"
            className={`${FIELD} w-full pl-9`}
          />
        </div>

        <select value={filters.eggType ?? ""} onChange={set("eggType")} className={FIELD} aria-label="Egg type">
          <option value="">All egg types</option>
          {EGG_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        <select value={filters.status ?? ""} onChange={set("status")} className={FIELD} aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>

        <select value={filters.hatchRate ?? ""} onChange={set("hatchRate")} className={FIELD} aria-label="Hatch rate">
          <option value="">Any hatch rate</option>
          {HATCH_RATE_BANDS.map((band) => (
            <option key={band.value} value={band.value}>{band.label}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400" htmlFor="batch-from">
            From
          </label>
          <input id="batch-from" type="date" value={filters.from ?? ""} onChange={set("from")} className={`${FIELD} w-full`} />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400" htmlFor="batch-to">
            To
          </label>
          <input id="batch-to" type="date" value={filters.to ?? ""} onChange={set("to")} className={`${FIELD} w-full`} />
        </div>
      </div>
    </div>
  );
}
