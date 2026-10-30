import React from "react";
import { X } from "lucide-react";
import { statusOf, otMin, lateMin, fmtDur, fmtTime, fmtDate, CATEGORY_DOT } from "./utils";

/* Read-only view of one person's mark on one day — everything the table
   leaves out (remarks, marked by …). `record` null = not marked. */
export default function ViewModal({ person, date, record: r, place, elsewhere, onClose }) {
  const s = statusOf(r?.status);
  const late = r ? lateMin(person.category, r.shift, r.status, r.inTime) : 0;
  const ot = r ? otMin(person.category, r.shift, r.inTime, r.outTime) : 0;
  const Item = ({ label, children, wide }) => (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 text-sm text-slate-800">{children}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[15px] font-bold text-slate-800">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${CATEGORY_DOT[person.category] || "bg-slate-300"}`} />
              <span className="truncate">{person.name}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 pl-[18px]">{[person.designation, person.category].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 shrink-0"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            <Item label="Date">{fmtDate(date)}</Item>
            <Item label="Place">{place.name} <span className="text-slate-400 text-xs">({place.code})</span></Item>
            <Item label="Status" wide>
              {elsewhere ? <span className="text-slate-500">Marked at {elsewhere.place} · {elsewhere.status}</span>
                : r ? (
                  <span className="inline-flex items-center gap-2">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full border text-xs font-semibold ${s?.soft || "bg-slate-50 text-slate-600 border-slate-200"}`}>{r.status}</span>
                    {late > 0 && <span className="text-xs font-semibold text-amber-700">Late by {fmtDur(late)}</span>}
                  </span>
                ) : <span className="text-slate-400">Not marked</span>}
            </Item>
            {r && <>
              <Item label="Shift">{r.shift || "—"}</Item>
              <Item label="Hours">{fmtDur(r.minutes)}{ot > 0 && <span className="ml-2 text-xs font-semibold text-indigo-700">OT {fmtDur(ot)}</span>}</Item>
              <Item label="In">{fmtTime(r.inTime)}</Item>
              <Item label="Out">{fmtTime(r.outTime)}</Item>
              <Item label="Remarks" wide>
                {r.remarks ? <p className="whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700">{r.remarks}</p>
                  : <span className="text-slate-400">No remarks</span>}
              </Item>
              <Item label="Marked by" wide>{r.markedBy || "—"}</Item>
            </>}
          </div>
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="h-9 px-4 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">Close</button>
        </div>
      </div>
    </div>
  );
}
