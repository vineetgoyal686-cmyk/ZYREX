import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

const getField = (obj, key) => {
  if (!obj || !key) return "";
  const snake = String(key).replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);
  return obj[key] ?? obj[snake] ?? "";
};

const ORDER_LABEL = "block text-[15px] font-semibold text-slate-950 mb-2 tracking-normal";
const ORDER_TRIGGER = "w-full border border-slate-300 rounded px-4 text-[15px] font-normal outline-none transition-colors bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-400 focus:ring-0 h-14 flex items-center justify-between cursor-pointer hover:border-slate-400";
const INTAKE_INP = "w-full border border-slate-200 rounded px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 text-slate-700 bg-white transition-all";
const INTAKE_LBL = "block text-[13px] font-semibold text-slate-600 mb-1.5";

/** Company dropdown — same list style as Create Order Select (search, code, GSTIN, view, add) */
export default function CompanySelect({
  value,
  onChange,
  options = [],
  placeholder = "Select company…",
  onView,
  onAdd,
  disabled,
  label,
  required,
  variant = "intake",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const isOrder = variant === "order";

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selected = options.find(c => c.id === value);
  const filtered = options.filter(c => {
    const q = search.toLowerCase();
    const name = String(getField(c, "companyName") || "").toLowerCase();
    const code = String(getField(c, "companyCode") || "").toLowerCase();
    const gstin = String(getField(c, "gstin") || getField(c, "billingGstin") || "").toLowerCase();
    return `${name} ${code} ${gstin}`.includes(q);
  });

  const pick = (id) => {
    onChange({ target: { value: id } });
    setOpen(false);
    setSearch("");
  };

  const triggerCls = isOrder
    ? `${ORDER_TRIGGER} ${disabled ? "opacity-60 cursor-not-allowed bg-slate-50" : ""} ${open ? "border-slate-500" : ""}`
    : `${INTAKE_INP} cursor-pointer flex items-center justify-between gap-2
        ${disabled ? "opacity-60 cursor-not-allowed bg-slate-50" : "hover:border-slate-300"}
        ${open ? "border-indigo-400 ring-2 ring-indigo-50" : ""}`;

  const displayName = selected ? getField(selected, "companyName") : "";

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className={isOrder ? ORDER_LABEL : INTAKE_LBL}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div onClick={() => !disabled && setOpen(v => !v)} className={triggerCls}>
        <span className={`truncate flex-1 min-w-0 ${selected ? (isOrder ? "text-slate-950" : "text-slate-700") : "text-slate-400"}`}>
          {displayName || placeholder}
        </span>
        {!disabled && (
          <ChevronDown
            size={isOrder ? 16 : 13}
            className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${isOrder ? "ml-2" : ""}`}
          />
        )}
      </div>

      {open && (
        <div className={`absolute left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl flex flex-col overflow-hidden min-w-[280px] ${isOrder ? "rounded shadow-lg z-[2100]" : "rounded-lg z-[2100]"}`}>
          <div className="p-2 border-b border-slate-100 shrink-0">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search here..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 text-slate-700"
            />
          </div>
          <div className="overflow-y-auto max-h-56 thin-scrollbar-light">
            <div
              onClick={() => pick("")}
              className={`px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 transition-colors ${!value ? "text-slate-400 font-bold" : "text-slate-400"}`}
            >
              {placeholder}
            </div>
            {options.length > 0 && (
              <div className="px-4 py-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border-b border-slate-100">
                Total Companies: {options.length}
              </div>
            )}
            {filtered.map(c => {
              const isSel = value === c.id;
              const name = getField(c, "companyName");
              const code = getField(c, "companyCode");
              const gstin = getField(c, "gstin") || getField(c, "billingGstin");
              return (
                <div
                  key={c.id}
                  className={`flex items-center justify-between px-4 py-2 cursor-pointer transition-colors border-b border-slate-100 last:border-0
                    ${isSel ? "bg-indigo-50" : "bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex-1 min-w-0" onClick={() => pick(c.id)}>
                    <p className={`text-[13px] truncate ${isSel ? "text-indigo-700 font-semibold" : "text-slate-900 font-semibold"}`}>
                      {name}
                    </p>
                    {code && (
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">
                        <span className="text-slate-500">Code:</span>{" "}
                        <span className="font-semibold text-slate-700">{code}</span>
                      </p>
                    )}
                    {gstin && (
                      <p className="text-[11px] text-slate-600 truncate">
                        <span className="text-slate-500">GSTIN:</span> {gstin}
                      </p>
                    )}
                  </div>
                  {onView && (
                    <button
                      type="button"
                      title="View company"
                      onClick={e => { e.stopPropagation(); setOpen(false); onView(c); }}
                      className="p-1 rounded-md text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0 ml-3"
                    >
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-4 text-center text-xs text-slate-400">No results found</div>
            )}
          </div>
          {onAdd && (
            <div
              onClick={() => { setOpen(false); onAdd(); }}
              className="shrink-0 bg-indigo-50/50 hover:bg-indigo-100 text-indigo-600 border-t border-slate-100 text-sm font-medium px-3 py-3 text-center cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus size={14} /> Add New Company
            </div>
          )}
        </div>
      )}
    </div>
  );
}
