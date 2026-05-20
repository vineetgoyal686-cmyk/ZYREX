import React from "react";
import { Users, Edit2 } from "lucide-react";
import { AddBtn, TableHead } from "./helpers";
import { TEAMS_ALL } from "./data";

export default function Teams() {
  return (
    <div className="bg-white rounded border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <p className="text-sm font-bold text-slate-700">All Teams</p>
        <AddBtn label="Add Team" />
      </div>
      <table className="w-full text-sm">
        <TableHead cols={[
          { label: "Team Name" }, { label: "Department" }, { label: "Team Lead" },
          { label: "Members", center: true }, { label: "" },
        ]} />
        <tbody className="divide-y divide-slate-100">
          {TEAMS_ALL.map(t => (
            <tr key={t.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 font-semibold text-slate-800">{t.name}</td>
              <td className="px-4 py-3 text-slate-600">{t.dept}</td>
              <td className="px-4 py-3 text-slate-600">{t.lead}</td>
              <td className="px-4 py-3 text-center">
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <Users size={11} />{t.members}
                </span>
              </td>
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
