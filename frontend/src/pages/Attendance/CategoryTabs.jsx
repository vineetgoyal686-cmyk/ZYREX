import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { CATEGORY_DOT } from "./utils";

/* All · Office Staff · Site Staff · Guards … — only the categories present
   in the list, same names as HRMS › Employees. value "all" or a category.
   Up to 3 tabs show as buttons; more fold into one dropdown so the toolbar
   stays short. */
const ORDER = ["Office Staff", "Site Staff", "Guard", "Driver", "Cook"];
const LABEL = { Guard: "Guards", Driver: "Drivers", Cook: "Cooks" };
const MAX_TABS = 3;
export const inCategory = (category, value) => value === "all" || (category || "Other") === value;

export default function CategoryTabs({ list, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const counts = new Map();
  if (value !== "all") counts.set(value, 0); // keep the chosen tab even if it's empty now
  list.forEach(x => counts.set(x.category || "Other", (counts.get(x.category || "Other") || 0) + 1));
  const cats = [...counts.keys()].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  const tabs = [["all", "All", list.length], ...cats.map(c => [c, LABEL[c] || c, counts.get(c)])];

  if (tabs.length <= MAX_TABS) return (
    <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
      {tabs.map(([id, label, n]) => (
        <button key={id} onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold whitespace-nowrap transition-all
            ${value === id ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-700"}`}>
          {label} <span className={`text-[10px] tabular-nums ${value === id ? "text-white/70" : "text-slate-400"}`}>{n}</span>
        </button>
      ))}
    </div>
  );

  const cur = tabs.find(t => t[0] === value) || tabs[0];
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-lg border bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50
          ${open ? "border-blue-400 ring-1 ring-blue-400" : "border-slate-200"}`}>
        {cur[0] !== "all" && <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[cur[0]] || "bg-slate-300"}`} />}
        {cur[1]} <span className="text-[11px] text-slate-400 tabular-nums">{cur[2]}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
          {tabs.map(([id, label, n]) => (
            <button key={id} onClick={() => { onChange(id); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 ${value === id ? "font-semibold text-slate-800" : "text-slate-600"}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${id === "all" ? "bg-slate-800" : CATEGORY_DOT[id] || "bg-slate-300"}`} />
              <span className="flex-1">{label}</span>
              <span className="text-[11px] text-slate-400 tabular-nums">{n}</span>
              <Check size={13} className={value === id ? "text-blue-600" : "invisible"} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
