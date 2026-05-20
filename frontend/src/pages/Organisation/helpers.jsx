import React from "react";
import { Edit2, Plus } from "lucide-react";

export const cx = (...c) => c.filter(Boolean).join(" ");

export const levelBadge = (l) =>
  l === 1 ? "bg-purple-100 text-purple-700"
  : l === 2 ? "bg-blue-100 text-blue-700"
  : "bg-slate-100 text-slate-600";

export const initials = (name) =>
  name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

export const StatusBadge = ({ active }) => (
  <span className={cx("inline-flex items-center px-2.5 py-0.5 rounded border text-[11px] font-semibold",
    active
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-slate-50 text-slate-500 border-slate-200")}>
    {active ? "Active" : "Inactive"}
  </span>
);

export const AddBtn = ({ label, onClick }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors">
    <Plus size={13} /> {label}
  </button>
);

export const TableHead = ({ cols }) => (
  <thead>
    <tr className="text-[11px] uppercase tracking-wide text-slate-500" style={{ background: "rgb(243,243,245)" }}>
      {cols.map((c, i) => (
        <th key={i} className={cx("px-4 py-2.5 font-semibold", c.center ? "text-center" : "text-left")}>
          {c.label}
        </th>
      ))}
    </tr>
  </thead>
);

export const RowActions = () => (
  <td className="px-4 py-3">
    <div className="flex items-center justify-end gap-2">
      <button className="text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={13} /></button>
      <button className="text-slate-400 hover:text-red-500 transition-colors text-sm font-bold leading-none">×</button>
    </div>
  </td>
);
