import React from "react";

/* Summary cards — same style as Treasury › Party Ledger / Employees.
   A card with `id` is clickable (filters the list); `active` = selected. */
export default function StatCards({ cards, active, onPick }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map(c => {
        const on = c.id && active === c.id;
        const Tag = c.id && onPick ? "button" : "div";
        return (
          <Tag key={c.label}
            {...(Tag === "button" ? { type: "button", onClick: () => onPick(on ? "" : c.id), title: on ? "Show all" : `Show ${c.label.toLowerCase()} only` } : {})}
            className={`relative overflow-hidden text-left bg-white rounded-lg border shadow-sm p-3 flex items-center gap-3 min-w-0 transition-colors
              ${on ? "border-blue-400 ring-1 ring-blue-400" : "border-slate-200/80"} ${Tag === "button" ? "hover:border-slate-300 cursor-pointer" : ""}`}>
            <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: c.accent }} />
            <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: c.tint, color: c.accent }}>
              <c.Icon size={16} strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide truncate">{c.label}</p>
              <p className="text-lg font-extrabold leading-tight tracking-tight truncate tabular-nums text-slate-800">
                {c.value}{c.sub != null && c.sub !== "" && <span className="ml-1.5 text-[11px] font-semibold text-slate-400">{c.sub}</span>}
              </p>
            </div>
          </Tag>
        );
      })}
    </div>
  );
}
