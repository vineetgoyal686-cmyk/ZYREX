import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* Footer under every Attendance table — always shown, stays at the bottom
   while the rows scroll. `total` rows, `page` (1-based), `per` per page. */
export const PER_PAGE_OPTIONS = [25, 50, 100];
export const pageOf = (list, page, per) => list.slice((page - 1) * per, page * per);

export default function Pager({ total, page, per, onPage, onPer, note }) {
  const pages = Math.max(1, Math.ceil(total / per));
  const from = total ? (page - 1) * per + 1 : 0;
  const btn = "h-7 w-7 flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed";
  return (
    <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t border-slate-200 bg-slate-50/60 text-[11px] text-slate-500">
      <span className="tabular-nums">
        {total ? <>Showing <b className="text-slate-700">{from}–{Math.min(page * per, total)}</b> of <b className="text-slate-700">{total}</b></> : "No rows"}
        {note && <span className="ml-3 text-slate-400">{note}</span>}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          Rows
          <select value={per} onChange={e => onPer(Number(e.target.value))}
            className="h-7 px-1.5 rounded-md border border-slate-200 bg-white text-[11px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400">
            {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} className={btn} title="Previous page"><ChevronLeft size={14} /></button>
        <span className="tabular-nums text-slate-600 min-w-[64px] text-center">Page {Math.min(page, pages)} / {pages}</span>
        <button onClick={() => onPage(page + 1)} disabled={page >= pages} className={btn} title="Next page"><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}
