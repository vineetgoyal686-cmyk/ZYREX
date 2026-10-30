import React, { useEffect, useState } from "react";
import { X, Loader2, Edit2, Trash2 } from "lucide-react";
import API from "../../../api";
import { useModulePermissions } from "../../../hooks/useModulePermissions";
import ActionBtn from "../../Attendance/ActionBtn";
import { calc, inr, fmtDay, EARNINGS } from "./calc";
import BrandLoader from "../../../components/BrandLoader";

/* One employee's salary records, newest first — what's in force today,
   any raise entered for later, and every earlier one. */
export default function HistoryModal({ person, onClose, onEdit, onChanged }) {
  const { canEdit, canDelete } = useModulePermissions("salary");
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null); // expanded record id
  const [error, setError] = useState("");

  const load = () => API.get(`/api/salary/history/${person.employeeId}`)
    .then(({ data }) => { setList(data.history || []); setOpen(o => o || data.history?.[0]?.id || null); })
    .catch(err => { setList([]); setError(err?.response?.data?.error || "Could not load history"); });
  useEffect(() => { load(); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const currentId = list?.find(r => r.effectiveFrom <= today)?.id;

  const remove = async (r) => {
    if (!window.confirm(`Delete the salary from ${fmtDay(r.effectiveFrom)}? This can't be undone.`)) return;
    try {
      await API.delete(`/api/salary/records/${r.id}`);
      await load(); onChanged?.();
    } catch (err) { alert(err?.response?.data?.error || "Delete failed"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-[15px] font-bold text-slate-800">{person.name} · Salary</h2>
            <p className="text-[11px] text-slate-400">{[person.designation, person.category, person.empCode].filter(Boolean).join(" · ")}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {!list ? <div className="flex justify-center py-10"><BrandLoader compact /></div>
            : error ? <p className="text-sm text-red-600">{error}</p>
            : !list.length ? <p className="text-sm text-slate-400 text-center py-8">No salary records</p>
            : list.map((r, i) => {
              const c = calc(r);
              const prev = list[i + 1] ? calc(list[i + 1]) : null;
              const change = prev && prev.gross ? Math.round(((c.gross - prev.gross) / prev.gross) * 1000) / 10 : null;
              const tag = r.id === currentId ? ["Current", "bg-emerald-50 text-emerald-700 border-emerald-200"]
                : r.effectiveFrom > today ? ["Upcoming", "bg-violet-50 text-violet-700 border-violet-200"]
                : ["Old", "bg-slate-50 text-slate-500 border-slate-200"];
              const isOpen = open === r.id;
              return (
                <div key={r.id} className={`rounded-lg border ${r.id === currentId ? "border-emerald-200" : "border-slate-200"}`}>
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setOpen(isOpen ? null : r.id)}>
                    <div className="flex-1 min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        From {fmtDay(r.effectiveFrom)}
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${tag[1]}`}>{tag[0]}</span>
                        {change != null && change !== 0 && <span className={`text-[11px] font-semibold ${change > 0 ? "text-emerald-600" : "text-red-600"}`}>{change > 0 ? "▲" : "▼"} {Math.abs(change)}%</span>}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {c.daily ? `${inr(r.dailyRate)}/day` : `Gross ${inr(c.gross)}`} · Net {inr(c.net)} · CTC {inr(c.ctc)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      {canEdit && <ActionBtn icon={Edit2} tone="blue" title="Edit" onClick={() => onEdit(r)} />}
                      {canDelete && <ActionBtn icon={Trash2} tone="red" title="Delete" onClick={() => remove(r)} />}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-slate-100 px-4 py-3 grid sm:grid-cols-2 gap-x-8 gap-y-1 text-[12px]">
                      {(c.daily ? [["Day rate", inr(r.dailyRate)]] : EARNINGS.filter(([k]) => r[k]).map(([k, l]) => [l, inr(r[k])]))
                        .concat([
                          ["Overtime / hour", r.otRate ? inr(r.otRate) : "—"],
                          ["Day basis", c.daily ? "Per day present" : r.dayBasis === "actual" ? "Days in month" : `÷ ${r.dayBasis}`],
                          ["PF", r.pfApplicable ? `${inr(c.pf)}${r.pfCapped ? " (capped)" : ""}` : "No"],
                          ["ESI", c.esi ? inr(c.esi) : "No"],
                          ["PT / TDS", `${inr(c.pt)} / ${inr(c.tds)}`],
                          ["Payment", r.paymentMode === "bank" ? `${r.bankName || "Bank"} · ${r.accountNumber} · ${r.ifsc}` : r.paymentMode === "cash" ? "Cash" : "Cheque"],
                          ["PAN / UAN", `${r.pan || "—"} / ${r.uan || "—"}`],
                          ["ESIC No", r.esicNumber || "—"],
                          ["Remarks", r.remarks || "—"],
                          ["Entered by", `${r.createdBy || "—"}${r.updatedBy && r.updatedBy !== r.createdBy ? ` · edited by ${r.updatedBy}` : ""}`],
                        ]).map(([l, v]) => (
                          <div key={l} className="flex justify-between gap-3 py-1 border-b border-slate-50">
                            <span className="text-slate-400">{l}</span><span className="text-slate-700 text-right break-all">{v}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
