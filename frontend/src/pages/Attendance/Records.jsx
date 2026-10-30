import React, { useEffect, useMemo, useState } from "react";
import { Search, Download, Trash2, Loader2, CalendarDays, ChevronDown, ListChecks, UserCheck, UserX, CalendarOff, Clock, Timer } from "lucide-react";
import StatCards from "./StatCards";
import CategoryTabs, { inCategory } from "./CategoryTabs";
import * as XLSX from "xlsx";
import API from "../../api";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { STATUSES, statusOf, isPresent, isLeave, otMin, lateMin, fmtDur, fmtTime, fmtDate, isoToday, CATEGORY_DOT } from "./utils";

/* Every mark at a place over a date range — search, filter, export,
   delete; "Open" jumps to that day in the register to change it. */
const PER_PAGE = 50;

export default function Records({ place, onOpenDay }) {
  const { canDelete, canExport } = useModulePermissions("staff_attendance");
  const today = isoToday();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [group, setGroup] = useState("all");
  const [page, setPage] = useState(1);

  const load = () => {
    setRows(null); setError("");
    API.get(`/api/attendance/records/${encodeURIComponent(place.code)}`, { params: { from, to } })
      .then(({ data }) => setRows(data.records || []))
      .catch(err => { setRows([]); setError(err?.response?.data?.error || "Could not load records"); });
  };
  useEffect(() => { load(); }, [place.code, from, to]);
  useEffect(() => { setPage(1); }, [q, status, group, from, to]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows || []).filter(r =>
      inCategory(r.category, group) &&
      (!status || (status === "Late" ? lateMin(r.category, r.shift, r.status, r.inTime) > 0 : r.status === status)) &&
      (!s || `${r.name} ${r.designation} ${r.remarks} ${r.contactCode}`.toLowerCase().includes(s)));
  }, [rows, q, status, group]);

  // one entry per person, so the tab counts are people, not marks
  const peopleOf = useMemo(() => [...new Map((rows || []).map(r => [r.employeeId || r.name, r])).values()], [rows]);

  const sum = useMemo(() => ({
    days: new Set(list.map(r => r.date)).size,
    present: list.filter(r => isPresent(r.status)).length,
    absent: list.filter(r => r.status === "Absent").length,
    leave: list.filter(r => isLeave(r.status)).length,
    late: list.filter(r => lateMin(r.category, r.shift, r.status, r.inTime) > 0).length,
    ot: list.reduce((t, r) => t + otMin(r.category, r.shift, r.inTime, r.outTime), 0),
  }), [list]);

  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const paged = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const remove = async (r) => {
    if (!window.confirm(`Delete ${r.name}'s mark for ${fmtDate(r.date)}?`)) return;
    try {
      await API.delete(`/api/attendance/records/${encodeURIComponent(place.code)}/${r.table}/${r.id}`);
      setRows(prev => prev.filter(x => x.id !== r.id));
    } catch (err) { alert(err?.response?.data?.error || "Delete failed"); }
  };

  const exportExcel = () => {
    const data = list.map((r, i) => ({
      "#": i + 1, Date: r.date, Name: r.name, "Contact ID": r.contactCode, Category: r.category, Designation: r.designation,
      Status: r.status, Shift: r.shift, In: r.inTime, Out: r.outTime,
      Hours: fmtDur(r.minutes), OT: fmtDur(otMin(r.category, r.shift, r.inTime, r.outTime)),
      Late: fmtDur(lateMin(r.category, r.shift, r.status, r.inTime)), Remarks: r.remarks, "Marked by": r.markedBy,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [4, 11, 24, 10, 12, 18, 12, 7, 7, 7, 9, 9, 9, 28, 16].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `Attendance_${place.code}_${from}_to_${to}.xlsx`);
  };

  const sel = "appearance-none h-9 pl-3 pr-8 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-600 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400";
  const th = "px-3 py-2.5 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap";
  const td = "px-3 py-2.5 border-b border-r border-slate-200 text-[13px] text-slate-600 whitespace-nowrap";

  return (
    <div className="h-full flex flex-col gap-4 p-4 sm:p-5">
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarDays size={14} className="text-slate-400" />
          <input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)}
            className="h-9 px-2.5 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          to
          <input type="date" value={to} min={from} max={today} onChange={e => e.target.value && setTo(e.target.value)}
            className="h-9 px-2.5 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <CategoryTabs list={peopleOf} value={group} onChange={setGroup} />
        <div className="relative">
          <select value={status} onChange={e => setStatus(e.target.value)} className={sel}>
            <option value="">All status</option>
            {STATUSES.map(s => <option key={s.v} value={s.v}>{s.v}</option>)}
            <option value="Late">Late</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative w-48 sm:w-60">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, remarks…"
            className="h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg bg-white w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        {canExport && (
          <button onClick={exportExcel} disabled={!list.length}
            className="ml-auto inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            <Download size={14} /> Export
          </button>
        )}
      </div>

      <div className="shrink-0">
        <StatCards active={status} onPick={setStatus} cards={[
          { label: "Marks",       value: list.length,  Icon: ListChecks,  accent: "#475569", tint: "#f1f5f9", sub: `${sum.days} day${sum.days === 1 ? "" : "s"}` },
          { id: "Present", label: "Present", value: sum.present, Icon: UserCheck, accent: "#059669", tint: "#ecfdf5" },
          { id: "Absent",  label: "Absent",  value: sum.absent,  Icon: UserX,     accent: "#dc2626", tint: "#fef2f2" },
          { label: "Leave / Off", value: sum.leave,    Icon: CalendarOff, accent: "#2563eb", tint: "#eff6ff" },
          { id: "Late",    label: "Late",    value: sum.late,    Icon: Clock,     accent: "#d97706", tint: "#fffbeb" },
          { label: "Overtime",    value: fmtDur(sum.ot), Icon: Timer,     accent: "#4f46e5", tint: "#eef2ff" },
        ]} />
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex-1 min-h-0 overflow-auto">
        {!rows ? (
          <div className="flex items-center justify-center h-48"><Loader2 size={20} className="text-blue-400 animate-spin" /></div>
        ) : error ? (
          <p className="p-6 text-sm text-red-600">{error}</p>
        ) : (
          <table className="w-full text-left border-separate border-spacing-0 min-w-[1100px]">
            <thead className="sticky top-0 z-10">
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className={th}>Date</th><th className={th}>Name</th><th className={th}>Status</th><th className={th}>Shift</th>
                <th className={th}>In</th><th className={th}>Out</th><th className={th}>Hours</th><th className={th}>Remarks</th>
                <th className={th}>Marked by</th><th className={`${th} text-center`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(r => {
                const s = statusOf(r.status);
                const late = lateMin(r.category, r.shift, r.status, r.inTime);
                const ot = otMin(r.category, r.shift, r.inTime, r.outTime);
                return (
                  <tr key={`${r.table}-${r.id}`} className="hover:bg-slate-50/70">
                    <td className={`${td} tabular-nums`}>{fmtDate(r.date, { weekday: "short", day: "2-digit", month: "short" })}</td>
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_DOT[r.category] || "bg-slate-300"}`} title={r.category} />
                        <span className="font-semibold text-slate-800">{r.name}</span>
                        {r.designation && <span className="text-[11px] text-slate-400">{r.designation}</span>}
                      </span>
                    </td>
                    <td className={td}>
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${s?.soft || "bg-slate-50 text-slate-600 border-slate-200"}`}>{r.status || "—"}</span>
                      {late > 0 && <span className="ml-1.5 text-[10px] font-bold text-amber-700">Late {fmtDur(late)}</span>}
                    </td>
                    <td className={td}>{r.shift}</td>
                    <td className={`${td} tabular-nums`}>{fmtTime(r.inTime)}</td>
                    <td className={`${td} tabular-nums`}>{fmtTime(r.outTime)}</td>
                    <td className={`${td} tabular-nums`}>
                      {fmtDur(r.minutes)}
                      {ot > 0 && <span className="ml-1.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 rounded px-1 py-0.5">OT {fmtDur(ot)}</span>}
                    </td>
                    <td className={`${td} max-w-[220px] truncate`} title={r.remarks}>{r.remarks || "—"}</td>
                    <td className={`${td} text-xs text-slate-400`}>{r.markedBy || "—"}</td>
                    <td className={`${td} text-center`}>
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => onOpenDay(r.date)} className="px-2 py-1 rounded text-[11px] font-semibold text-blue-600 hover:bg-blue-50" title="Open this day in the register">Open</button>
                        {canDelete && <button onClick={() => remove(r)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50" title="Delete"><Trash2 size={13} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={10} className="py-10 text-center text-sm text-slate-400">No attendance in this range</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-400">
          <span>{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, list.length)} of {list.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2.5 py-1 text-xs border border-slate-200 rounded text-slate-500 hover:bg-slate-50 disabled:opacity-30">Prev</button>
            <span className="px-2 text-slate-500">Page {page} / {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-2.5 py-1 text-xs border border-slate-200 rounded text-slate-500 hover:bg-slate-50 disabled:opacity-30">Next</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
