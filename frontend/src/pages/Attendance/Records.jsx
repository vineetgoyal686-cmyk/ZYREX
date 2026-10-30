import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Download, Trash2, Loader2, CalendarDays, ChevronDown, Check, Plus, Upload, Edit2, History, ListChecks, UserCheck, UserX, CalendarOff, Clock, Timer } from "lucide-react";
import StatCards from "./StatCards";
import CategoryTabs, { inCategory } from "./CategoryTabs";
import Pager, { pageOf } from "./Pager";
import { AttendanceForm, LogModal, MoreMenu } from "./DailyRegister";
import BulkUpload from "./BulkUpload";
import ViewModal from "./ViewModal";
import ActionBtn, { RowMenu } from "./ActionBtn";
import * as XLSX from "xlsx";
import API from "../../api";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { STATUSES, statusOf, isPresent, isLeave, otMin, lateMin, fmtDur, fmtTime, fmtDate, isoToday, CATEGORY_DOT } from "./utils";
import BrandLoader from "../../components/BrandLoader";

/* Every mark at a place over a date range — search, filter, export;
   Edit / Log / Delete per row. */

export default function Records({ place }) {
  const { canAdd, canEdit, canDelete, canExport } = useModulePermissions("staff_attendance");
  const today = isoToday();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [group, setGroup] = useState("all");
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [editing, setEditing] = useState(null); // record being edited
  const [logOf, setLogOf] = useState(null);     // record whose history is open
  const [viewOf, setViewOf] = useState(null);   // record open in View
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);

  const load = () => {
    setRows(null); setError("");
    API.get(`/api/attendance/records/${encodeURIComponent(place.code)}`, { params: { from, to } })
      .then(({ data }) => setRows(data.records || []))
      .catch(err => { setRows([]); setError(err?.response?.data?.error || "Could not load records"); });
  };
  useEffect(() => { load(); }, [place.code, from, to]);
  useEffect(() => { setPage(1); }, [q, status, group, from, to, per]);

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

  const paged = pageOf(list, page, per);

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

  const th = "px-3 py-2.5 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap";
  const td = "px-3 py-2.5 border-b border-r border-slate-200 text-[13px] text-slate-600 whitespace-nowrap";

  return (
    <div className="h-full flex flex-col gap-4 p-4 sm:p-5">
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarDays size={14} className="text-slate-400" />
          <DateBox value={from} max={to} onChange={setFrom} />
          to
          <DateBox value={to} min={from} max={today} onChange={setTo} />
        </div>
        <CategoryTabs list={peopleOf} value={group} onChange={setGroup} />
        <StatusPicker value={status} onChange={setStatus} rows={(rows || []).filter(r => inCategory(r.category, group))} />
        <div className="relative w-48 sm:w-60">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, remarks…"
            className="h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg bg-white w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <MoreMenu items={[
            (canAdd || canEdit) && { label: "Bulk Upload", hint: "From Excel / CSV", Icon: Upload, onClick: () => setBulk(true) },
            canExport && { label: "Export", hint: "These records as Excel", Icon: Download, onClick: exportExcel, disabled: !list.length },
          ].filter(Boolean)} />
          {canAdd && (
            <button onClick={() => setAdding(true)} title="Mark attendance"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm">
              <Plus size={15} /> Mark
            </button>
          )}
        </div>
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
          <div className="flex items-center justify-center h-48"><BrandLoader /></div>
        ) : error ? (
          <p className="p-6 text-sm text-red-600">{error}</p>
        ) : (
          <table className="w-full text-left border-separate border-spacing-0 min-w-[1100px]">
            <thead className="sticky top-0 z-10">
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className={th}>Date</th><th className={th}>Name</th><th className={th}>Status</th><th className={th}>Shift</th>
                <th className={th}>In</th><th className={th}>Out</th><th className={th}>Hours</th>
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
                    <td className={`${td} w-[110px]`}>
                      <p className="font-semibold text-slate-800 leading-tight tabular-nums">{fmtDate(r.date, { day: "numeric", month: "short", year: "numeric" })}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(r.date, { weekday: "long" })}</p>
                    </td>
                    <td className={`${td} min-w-[200px]`}>
                      <p className="flex items-center gap-1.5 font-semibold text-slate-800 leading-tight">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_DOT[r.category] || "bg-slate-300"}`} title={r.category} />
                        <button type="button" onClick={() => setViewOf(r)} title="View details" className="hover:text-blue-600 hover:underline underline-offset-2 cursor-pointer text-left">{r.name}</button>
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 pl-3.5">{r.designation || r.category || "—"}</p>
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
                    <td className={`${td} text-xs text-slate-400`}>{r.markedBy || "—"}</td>
                    <td className={`${td} text-center`}>
                      <div className="flex items-center justify-center gap-1.5">
                        {canEdit && <ActionBtn icon={Edit2} tone="blue" title={r.employeeId ? "Edit" : "Old row, not linked to an employee"} onClick={() => setEditing(r)} disabled={!r.employeeId} />}
                        <RowMenu items={[
                          { label: "Log", icon: History, onClick: () => setLogOf(r), disabled: !r.employeeId },
                          canDelete && { label: "Delete", icon: Trash2, danger: true, onClick: () => remove(r) },
                        ].filter(Boolean)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={9} className="py-10 text-center text-sm text-slate-400">No attendance in this range</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <Pager total={list.length} page={page} per={per} onPage={setPage} onPer={setPer} />
      </div>

      {editing && (
        <AttendanceForm place={place} date={editing.date} today={today} record={editing}
          person={{ employeeId: editing.employeeId, name: editing.name, category: editing.category, designation: editing.designation }}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
      {adding && (
        <AttendanceForm place={place} date={to} today={today}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load(); }} />
      )}
      {bulk && <BulkUpload place={place} date={to} onClose={() => setBulk(false)} onDone={load} />}
      {viewOf && <ViewModal person={viewOf} date={viewOf.date} record={viewOf} place={place} onClose={() => setViewOf(null)} />}
      {logOf && <LogModal person={{ employeeId: logOf.employeeId, name: logOf.name }} date={logOf.date} onClose={() => setLogOf(null)} />}
    </div>
  );
}

/* A date picker that reads "1 Oct 2026" instead of the browser's 01-10-2026 */
function DateBox({ value, min, max, onChange }) {
  return (
    <label className="relative">
      <span className="flex items-center h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 min-w-[112px] justify-center tabular-nums">
        {fmtDate(value, { day: "numeric", month: "short", year: "numeric" })}
      </span>
      <input type="date" value={value} min={min} max={max} onChange={e => e.target.value && onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer" />
    </label>
  );
}

/* Status filter — coloured like the badges in the table, with a count each */
function StatusPicker({ value, onChange, rows }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const count = (v) => v === "Late" ? rows.filter(r => lateMin(r.category, r.shift, r.status, r.inTime) > 0).length
    : rows.filter(r => r.status === v).length;
  const opts = [
    { v: "", label: "All status", n: rows.length, dot: "bg-slate-800" },
    ...STATUSES.map(s => ({ v: s.v, label: s.v, n: count(s.v), dot: s.on.split(" ")[0] })),
    { v: "Late", label: "Late", n: count("Late"), dot: "bg-amber-500", sep: true },
  ];
  const cur = opts.find(o => o.v === value) || opts[0];
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-lg border bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 min-w-[150px]
          ${open ? "border-blue-400 ring-1 ring-blue-400" : "border-slate-200"}`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${cur.dot}`} />
        <span className="flex-1 text-left">{cur.label}</span>
        <span className="text-[11px] text-slate-400 tabular-nums">{cur.n}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
          {opts.map(o => (
            <React.Fragment key={o.v || "all"}>
              {o.sep && <div className="my-1 border-t border-slate-100" />}
              <button type="button" onClick={() => { onChange(o.v); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left hover:bg-slate-50
                  ${value === o.v ? "font-semibold text-slate-800 bg-slate-50" : "text-slate-600"} ${o.n || !o.v ? "" : "opacity-50"}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${o.dot}`} />
                <span className="flex-1">{o.label}</span>
                <span className="text-[11px] text-slate-400 tabular-nums">{o.n}</span>
                <Check size={13} className={value === o.v ? "text-blue-600" : "invisible"} />
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
