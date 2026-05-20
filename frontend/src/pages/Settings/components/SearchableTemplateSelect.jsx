import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

export default function SearchableTemplateSelect({ designations, onPick }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = designations.filter(d =>
    d.name.toLowerCase().includes(query.toLowerCase()) ||
    (d.description || "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-56 flex items-center justify-between pl-3 pr-2 py-1.5 bg-white border border-indigo-200 rounded-sm text-[13px] font-medium outline-none hover:border-indigo-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 cursor-pointer">
        <span className="text-slate-500">Choose...</span>
        <ChevronDown size={14} className={`text-indigo-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 bg-white border border-indigo-200 rounded-sm shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search template..."
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-sm text-[12px] font-medium outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100" />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-slate-400">No templates match</p>
            ) : filtered.map(d => (
              <button key={d.id} type="button"
                onClick={() => { onPick(d); setOpen(false); setQuery(""); }}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition border-b border-slate-50 last:border-0">
                <p className="text-[13px] font-bold text-slate-800">{d.name}</p>
                {d.description && (
                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{d.description}</p>
                )}
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {(d.app_permissions || []).filter(p => p.can_view).length} modules
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
