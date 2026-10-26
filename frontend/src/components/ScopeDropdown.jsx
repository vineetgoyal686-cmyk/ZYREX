import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

// Header picker in the same style as the Create Order company select:
// search box, a count row, and each option with its code and one more
// detail line. `allLabel` adds an "all" option at the top (value "").
// `align="left"` opens the list from the left edge (default: right).
export default function ScopeDropdown({ icon, value, onChange, options, countLabel, allLabel, placeholder, align = "right", subtle = false }) {
  const Icon = icon;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selected = options.find(o => o.id === value);
  const q = search.trim().toLowerCase();
  const filtered = options.filter(o => !q || `${o.title} ${o.code} ${o.detail}`.toLowerCase().includes(q));
  const pick = (id) => { onChange(id); setOpen(false); setSearch(""); };

  return (
    <div ref={ref} className="relative">
      {/* subtle: plain text that reads as part of a page title (HRMS header) */}
      {subtle ? (
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`h-8 max-w-[260px] flex items-center gap-1.5 rounded-md px-2 -mx-1 text-left transition-colors ${open ? "bg-slate-100" : "hover:bg-slate-100"}`}>
        <Icon size={14} className="text-slate-400 shrink-0" />
        <span className="min-w-0 truncate text-[13px] font-semibold text-slate-600">{selected ? selected.title : allLabel || placeholder}</span>
        <ChevronDown size={13} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      ) : (
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`h-9 w-[210px] sm:w-[250px] flex items-center gap-2 border rounded-lg pl-3 pr-2.5 bg-white text-left transition-colors
          ${open ? "border-slate-500" : "border-slate-200 hover:border-slate-400"}`}>
        <Icon size={14} className="text-slate-400 shrink-0" />
        <span className={`flex-1 min-w-0 truncate text-sm font-medium ${selected || allLabel ? "text-slate-800" : "text-slate-400"}`}>
          {selected ? selected.title : allLabel || placeholder}
        </span>
        {selected?.code && <span className="shrink-0 text-[11px] font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{selected.code}</span>}
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      )}

      {open && (
        <div className={`absolute ${align === "left" ? "left-0" : "right-0"} mt-1 w-[320px] bg-white border border-slate-200 rounded-lg shadow-xl z-[60] flex flex-col overflow-hidden`}>
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search here..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 text-slate-700" />
          </div>
          <div className="overflow-y-auto max-h-72">
            <div className="px-4 py-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border-b border-slate-100">
              {countLabel}: {options.length}
            </div>
            {allLabel && !q && (
              <div onClick={() => pick("")}
                className={`px-4 py-2.5 cursor-pointer border-b border-slate-100 text-[13px] font-semibold ${!value ? "bg-indigo-50 text-indigo-700" : "text-slate-900 hover:bg-slate-50"}`}>
                {allLabel}
              </div>
            )}
            {filtered.map(o => {
              const isSel = o.id === value;
              return (
                <div key={o.id} onClick={() => pick(o.id)}
                  className={`flex items-center justify-between px-4 py-2 cursor-pointer border-b border-slate-100 last:border-0 ${isSel ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold truncate ${isSel ? "text-indigo-700" : "text-slate-900"}`}>{o.title}</p>
                    {o.code && (
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">
                        <span className="text-slate-500">Code:</span> <span className="font-semibold text-slate-700">{o.code}</span>
                      </p>
                    )}
                    {o.detail && <p className="text-[11px] text-slate-600 truncate">{o.detail}</p>}
                  </div>
                  {isSel && <Check size={15} className="text-indigo-600 shrink-0 ml-3" />}
                </div>
              );
            })}
            {filtered.length === 0 && <div className="px-4 py-4 text-center text-xs text-slate-400">No results found</div>}
          </div>
        </div>
      )}
    </div>
  );
}
