import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown } from "lucide-react";

// Same pager as Setup > Vendor (Procurement/VendorList.jsx): item range,
// numbered pages with ellipses, and a per-page picker.
export default function Pagination({ page, setPage, perPage, setPerPage, total }) {
  if (!total) return null;
  const totalPages = Math.ceil(total / perPage) || 1;

  const items = [];
  if (totalPages <= 7) {
    for (let n = 1; n <= totalPages; n++) items.push(n);
  } else {
    items.push(1);
    if (page > 3) items.push("...");
    for (let n = Math.max(2, page - 1); n <= Math.min(totalPages - 1, page + 1); n++) items.push(n);
    if (page < totalPages - 2) items.push("...");
    items.push(totalPages);
  }

  const navBtn = "p-1.5 rounded-lg text-slate-400 hover:bg-white disabled:opacity-30 transition-all";

  return (
    <div className="shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 md:gap-4 px-4 py-3 border-t border-slate-200 bg-slate-50/50">
      <p className="text-xs text-slate-500 order-1">
        {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} of {total} items
      </p>
      <div className="order-3 md:order-2 w-full md:w-auto flex justify-center">
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={page === 1} className={navBtn}><ChevronsLeft size={14} /></button>
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className={navBtn}><ChevronLeft size={14} /></button>
            {items.map((n, i) =>
              n === "..." ? (
                <span key={`e${i}`} className="px-1.5 text-xs text-slate-400 select-none">...</span>
              ) : (
                <button key={n} onClick={() => setPage(n)}
                  className={`min-w-[26px] h-[26px] px-1.5 rounded-md text-xs font-medium transition-all
                    ${page === n ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"}`}>
                  {n}
                </button>
              )
            )}
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className={navBtn}><ChevronRight size={14} /></button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className={navBtn}><ChevronsRight size={14} /></button>
          </div>
        )}
      </div>
      <div className="relative order-2 md:order-3">
        <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
          className="appearance-none text-xs border border-slate-200 rounded-md pl-2.5 pr-6 py-1.5 text-slate-600 bg-white focus:outline-none">
          {[10, 20, 30, 40, 50].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  );
}
