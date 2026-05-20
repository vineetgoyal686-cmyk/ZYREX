import React, { useState, useEffect } from "react";
import { Search, Edit2 } from "lucide-react";
import { StatusBadge, TableHead, cx, levelBadge } from "./helpers";
import { DESIG_ALL } from "./data";

export default function Designations({ actionsRef }) {
  const [search, setSearch] = useState("");
  const rows = DESIG_ALL.filter(d => d.title.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (actionsRef) actionsRef.current = { openAdd: () => {} };
    return () => { if (actionsRef) actionsRef.current = {}; };
  });

  return (
    <div className="bg-white rounded border border-slate-200 overflow-hidden">
      <div className="flex items-center px-5 py-3.5 border-b border-slate-100">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search designations…"
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 w-52 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>
      <table className="w-full text-sm">
        <TableHead cols={[
          { label: "Title" }, { label: "Department" },
          { label: "Level", center: true }, { label: "Status", center: true }, { label: "" },
        ]} />
        <tbody className="divide-y divide-slate-100">
          {rows.map(d => (
            <tr key={d.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 font-semibold text-slate-800">{d.title}</td>
              <td className="px-4 py-3 text-slate-600">{d.dept}</td>
              <td className="px-4 py-3 text-center">
                <span className={cx("px-2 py-0.5 rounded-full text-[11px] font-bold", levelBadge(d.level))}>
                  Level {d.level}
                </span>
              </td>
              <td className="px-4 py-3 text-center"><StatusBadge active={d.active} /></td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <button className="text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={13} /></button>
                  <button className="text-slate-400 hover:text-red-500 transition-colors text-sm font-bold leading-none">×</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
