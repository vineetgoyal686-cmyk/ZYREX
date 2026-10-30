import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Search, Plus, CheckCheck, Loader2, X, Moon, Sun, AlertTriangle,
  Users, UserCheck, UserX, CalendarOff, Clock, CircleDashed, ClipboardList, Edit2, History, Download, Upload, MoreHorizontal,
} from "lucide-react";
import * as XLSX from "xlsx";
import API from "../../api";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import StatCards from "./StatCards";
import BulkUpload from "./BulkUpload";
import CategoryTabs, { inCategory } from "./CategoryTabs";
import Pager, { pageOf } from "./Pager";
import ViewModal from "./ViewModal";
import ActionBtn from "./ActionBtn";
import {
  STATUSES, statusOf, isPresent, isLeave, workedMin, otMin, lateMin, fmtDur, fmtTime,
  isoToday, shiftDate, fmtDate, CATEGORY_DOT, currentUserName,
} from "./utils";

/*
 * One day at a place: everyone posted there (HRMS › Employees) plus anyone
 * marked there that day. The table only shows; Edit opens the form for
 * that person, "+ Add Attendance" the same form for anyone in the company.
 * Saves go through POST /api/attendance/mark/:place, which also writes the
 * edit history shown by Log.
 */
// which summary card a row counts under
const bucketOf = (p) => {
  const st = p.record?.status;
  if (p.elsewhere) return "elsewhere";
  if (!st) return "unmarked";
  if (isPresent(st)) return "present";
  if (st === "Absent") return "absent";
  return isLeave(st) ? "leave" : "other";
};
const lateOf = (p) => p.record ? lateMin(p.category, p.record.shift, p.record.status, p.record.inTime) : 0;

export default function DailyRegister({ place, date, onDateChange }) {
  const { canAdd, canEdit, canExport } = useModulePermissions("staff_attendance");
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);
  const [orphans, setOrphans] = useState(0);
  const [group, setGroup] = useState("all");
  const [card, setCard] = useState(""); // summary card filter
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState(null);   // { person?, record? } — the Add / Edit form
  const [logOf, setLogOf] = useState(null); // person whose history is open
  const [bulk, setBulk] = useState(false);
  const [viewOf, setViewOf] = useState(null); // person whose day is open in View
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const today = isoToday();

  const flash = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), type === "error" ? 6000 : 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await API.get(`/api/attendance/register/${encodeURIComponent(place.code)}`, { params: { date } });
      setPeople(data.people || []);
      setOrphans((data.orphans || []).length);
    } catch (err) {
      setPeople([]);
      flash(err?.response?.data?.error || "Could not load the register", "error");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [place.code, date]);

  const groupList = people.filter(p => inCategory(p.category, group));
  const stats = useMemo(() => {
    const s = { total: 0, present: 0, absent: 0, leave: 0, late: 0, unmarked: 0 };
    groupList.forEach(p => {
      if (p.elsewhere) return;
      s.total++;
      const b = bucketOf(p);
      if (s[b] !== undefined) s[b]++;
      if (lateOf(p)) s.late++;
    });
    return s;
  }, [people, group]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupList.filter(p => {
      if (card === "late" ? !lateOf(p) : card && card !== "total" && bucketOf(p) !== card) return false;
      return !q || `${p.name} ${p.designation} ${p.mobile} ${p.contactCode}`.toLowerCase().includes(q);
    });
  }, [people, group, search, card]);

  const markAllPresent = async () => {
    const targets = shown.filter(p => !p.elsewhere && !p.record);
    if (!targets.length) return flash("Everyone shown is already marked");
    if (!window.confirm(`Mark ${targets.length} unmarked ${targets.length === 1 ? "person" : "people"} Present for ${fmtDate(date)}?`)) return;
    setBusy(true);
    try {
      const rows = targets.map(p => ({ employeeId: p.employeeId, status: "Present", shift: "Day" }));
      const { data } = await API.post(`/api/attendance/mark/${encodeURIComponent(place.code)}`, { date, rows, createdByName: currentUserName() });
      flash(data.skipped?.length
        ? `Marked ${data.saved}. Not marked: ${data.skipped.map(s => `${s.name} (${s.reason})`).join(", ")}`
        : `Marked ${data.saved} present`, data.skipped?.length ? "error" : "success");
      await load();
    } catch (err) {
      flash(err?.response?.data?.detail || err?.response?.data?.error || "Save failed", "error");
    } finally { setBusy(false); }
  };

  useEffect(() => { setPage(1); }, [group, search, card, date, per]);
  const paged = pageOf(shown, page, per);

  // the rows on screen, as they are shown
  const exportDay = () => {
    const data = shown.map((p, i) => {
      const r = p.record;
      return {
        "#": i + 1, Date: date, Name: p.name, "Contact ID": p.contactCode, Designation: p.designation, Category: p.category,
        Status: p.elsewhere ? `At ${p.elsewhere.place} · ${p.elsewhere.status}` : r?.status || "Not marked",
        Shift: r?.shift || "", In: r?.inTime || "", Out: r?.outTime || "",
        Hours: r ? fmtDur(r.minutes) : "", OT: r ? fmtDur(otMin(p.category, r.shift, r.inTime, r.outTime)) : "",
        Late: fmtDur(lateOf(p)), Remarks: r?.remarks || "", "Marked by": r?.markedBy || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [4, 11, 24, 12, 18, 12, 14, 7, 7, 7, 9, 9, 9, 28, 16].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Register");
    XLSX.writeFile(wb, `Attendance_${place.code}_${date}.xlsx`);
  };

  const pct = stats.total ? Math.round((stats.present / stats.total) * 100) : 0;
  const cards = [
    { id: "total",    label: "Total",       value: stats.total,    Icon: Users,        accent: "#475569", tint: "#f1f5f9" },
    { id: "present",  label: "Present",     value: stats.present,  Icon: UserCheck,    accent: "#059669", tint: "#ecfdf5", sub: stats.total ? `${pct}%` : "" },
    { id: "absent",   label: "Absent",      value: stats.absent,   Icon: UserX,        accent: "#dc2626", tint: "#fef2f2" },
    { id: "leave",    label: "Leave / Off", value: stats.leave,    Icon: CalendarOff,  accent: "#2563eb", tint: "#eff6ff" },
    { id: "late",     label: "Late",        value: stats.late,     Icon: Clock,        accent: "#d97706", tint: "#fffbeb" },
    { id: "unmarked", label: "Not Marked",  value: stats.unmarked, Icon: CircleDashed, accent: "#64748b", tint: "#f1f5f9" },
  ];

  const th = "px-3 py-2.5 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap";
  const td = "px-3 py-2.5 border-b border-r border-slate-200 text-[13px] text-slate-600 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors";

  return (
    <div className="h-full flex flex-col gap-4 p-4 sm:p-5">
      {/* Day, filters, actions */}
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => onDateChange(shiftDate(date, -1))} className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title="Previous day"><ChevronLeft size={15} /></button>
          <label className="relative">
            <span className="flex items-center justify-center h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-800 min-w-[170px]">
              {fmtDate(date)}
            </span>
            <input type="date" value={date} max={today} onChange={e => e.target.value && e.target.value <= today && onDateChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
          <button onClick={() => onDateChange(shiftDate(date, 1))} disabled={date >= today}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed" title="Next day"><ChevronRight size={15} /></button>
          {date !== today && (
            <button onClick={() => onDateChange(today)} className="ml-1 px-3 h-9 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50">Today</button>
          )}
        </div>
        <CategoryTabs list={people} value={group} onChange={setGroup} />
        <div className="relative w-48 sm:w-60">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, mobile…"
            className="h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg bg-white w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <MoreMenu items={[
            canAdd && people.length > 0 && { label: busy ? "Marking…" : "Mark all present", hint: "Everyone not marked yet", Icon: CheckCheck, onClick: markAllPresent, disabled: busy },
            (canAdd || canEdit) && { label: "Bulk Upload", hint: "From Excel / CSV", Icon: Upload, onClick: () => setBulk(true) },
            canExport && { label: "Export", hint: "This day as Excel", Icon: Download, onClick: exportDay, disabled: !shown.length },
          ].filter(Boolean)} />
          {canAdd && (
            <button onClick={() => setForm({})} title="Mark attendance"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm">
              <Plus size={15} /> Mark
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="shrink-0">
        <StatCards cards={cards} active={card} onPick={setCard} />
      </div>

      {/* Register */}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200">
          <p className="text-[13px] font-bold text-slate-800">Register · {fmtDate(date, { day: "numeric", month: "long" })}</p>
          {orphans > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={12} /> {orphans} old row(s) here aren't linked to an employee</span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48"><Loader2 size={20} className="text-blue-400 animate-spin" /></div>
          ) : !people.length ? (
            <div className="h-full min-h-[260px] flex flex-col items-center justify-center gap-3 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center"><ClipboardList size={22} className="text-slate-400" /></div>
              <div>
                <p className="text-sm font-semibold text-slate-700">No attendance for {place.name} on this day yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Add attendance with the button below. People whose "Posted At" is {place.code} (HRMS › Employees) show up here every day.
                </p>
              </div>
              {canAdd && (
                <button onClick={() => setForm({})}
                  className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                  <Plus size={15} /> Add Attendance
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-separate border-spacing-0 min-w-[1150px]">
              <thead className="sticky top-0 z-10">
                <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                  <th className={`${th} w-12 text-center`}>#</th>
                  <th className={th}>Name</th>
                  <th className={`${th} text-center`}>Category</th>
                  <th className={`${th} text-center`}>Status</th>
                  <th className={`${th} text-center`}>Shift</th>
                  <th className={`${th} text-center`}>In</th>
                  <th className={`${th} text-center`}>Out</th>
                  <th className={`${th} text-center`}>Hours</th>
                  <th className={`${th} text-center`}>OT</th>
                  <th className={`${th} text-center border-r-0`}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((p, idx) => {
                  const i = (page - 1) * per + idx;
                  const r = p.record;
                  const s = statusOf(r?.status);
                  const late = lateOf(p);
                  const ot = r ? otMin(p.category, r.shift, r.inTime, r.outTime) : 0;
                  const editable = !p.elsewhere && (r ? canEdit : canAdd);
                  return (
                    <tr key={p.employeeId} className="group">
                      <td className={`${td} text-center text-xs text-slate-400 tabular-nums`}>{i + 1}</td>
                      <td className={`${td} min-w-[200px]`}>
                        <p className="font-semibold text-slate-800 leading-tight">
                          <button type="button" onClick={() => setViewOf(p)} title="View details" className="font-semibold text-slate-800 hover:text-blue-600 hover:underline underline-offset-2 cursor-pointer text-left">{p.name}</button>
                          {p.visiting && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">Visiting</span>}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{p.designation || "—"}</p>
                      </td>
                      <td className={`${td} text-center`}>
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                          <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[p.category] || "bg-slate-300"}`} />{p.category || "—"}
                        </span>
                      </td>
                      <td className={`${td} text-center`}>
                        {p.elsewhere ? (
                          <span className="text-xs text-slate-400">At {p.elsewhere.place} · {p.elsewhere.status}</span>
                        ) : r ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${s?.soft || "bg-slate-50 text-slate-600 border-slate-200"}`}>
                              {r.status === "Annual Leave" ? "Leave" : r.status}
                            </span>
                            {late > 0 && <span className="text-[10px] font-bold text-amber-700" title="Late">+{fmtDur(late)}</span>}
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full border border-dashed border-slate-300 text-[11px] font-medium text-slate-400">Not marked</span>
                        )}
                      </td>
                      <td className={`${td} text-center`}>
                        {r ? <span className="inline-flex items-center gap-1 text-xs">{r.shift === "Night" ? <Moon size={11} className="text-indigo-500" /> : <Sun size={11} className="text-amber-500" />}{r.shift}</span> : "—"}
                      </td>
                      <td className={`${td} text-center tabular-nums`}>{r?.inTime ? fmtTime(r.inTime) : "—"}</td>
                      <td className={`${td} text-center tabular-nums`}>{r?.outTime ? fmtTime(r.outTime) : "—"}</td>
                      <td className={`${td} text-center tabular-nums`}>{r ? fmtDur(workedMin(r.inTime, r.outTime)) : "—"}</td>
                      <td className={`${td} text-center tabular-nums ${ot ? "text-indigo-700 font-semibold" : ""}`}>{ot ? fmtDur(ot) : "—"}</td>
                      <td className={`${td} text-center border-r-0`}>
                        <div className="flex items-center justify-center gap-1.5">
                          <ActionBtn icon={Edit2} tone="blue" onClick={() => setForm({ person: p, record: r })} disabled={!editable}
                            title={p.elsewhere ? `Marked at ${p.elsewhere.place}` : r ? "Edit" : "Mark attendance"} />
                          <ActionBtn icon={History} tone="violet" title="Edit history" onClick={() => setLogOf(p)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!shown.length && (
                  <tr><td colSpan={10} className="py-10 text-center text-sm text-slate-400 border-b border-slate-200">No one matches</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <Pager total={shown.length} page={page} per={per} onPage={setPage} onPer={setPer} />
      </div>

      {form && (
        <AttendanceForm place={place} date={date} today={today} person={form.person} record={form.record}
          onClose={() => setForm(null)}
          onSaved={(d, msg) => {
            setForm(null);
            flash(msg);
            if (d === date) load(); else onDateChange(d);
          }} />
      )}
      {logOf && <LogModal person={logOf} date={date} onClose={() => setLogOf(null)} />}
      {viewOf && <ViewModal person={viewOf} date={date} record={viewOf.record} elsewhere={viewOf.elsewhere} place={place} onClose={() => setViewOf(null)} />}
      {bulk && <BulkUpload place={place} date={date} onClose={() => setBulk(false)} onDone={load} />}

      {toast && (
        <div className={`fixed top-5 right-5 z-[200] max-w-md px-4 py-3 rounded-lg text-sm font-medium shadow-lg border
          ${toast.type === "error" ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ── Add / Edit attendance — one person, one day.
   person given = Edit (or first mark) for them; none = pick anyone. ── */
const LBL = "block text-xs font-semibold text-slate-500 mb-1";
const INP = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-400";

export function AttendanceForm({ place, date, today, person: fixed, record, onClose, onSaved }) {
  const { canDelete } = useModulePermissions("staff_attendance");
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [person, setPerson] = useState(fixed || null);
  const [form, setForm] = useState({
    date, status: record?.status || "Present", shift: record?.shift || "Day",
    inTime: record?.inTime || "", outTime: record?.outTime || "", remarks: record?.remarks || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const editing = !!fixed;

  useEffect(() => {
    if (editing) return;
    API.get(`/api/attendance/people/${encodeURIComponent(place.code)}`)
      .then(({ data }) => setList((data.people || []).sort((a, b) =>
        (b.postedAt === place.code) - (a.postedAt === place.code) || a.name.localeCompare(b.name))))
      .catch(() => setList([]));
  }, []);

  const s = q.trim().toLowerCase();
  const shown = (list || []).filter(p => !s || `${p.name} ${p.mobile} ${p.designation} ${p.postedAt} ${p.category}`.toLowerCase().includes(s));
  const present = isPresent(form.status);

  const submit = async (status) => {
    if (!person) return setError("Pick a person");
    setSaving(true); setError("");
    try {
      const row = { employeeId: person.employeeId, status, shift: form.shift, remarks: form.remarks,
        inTime: isPresent(status) ? form.inTime : "", outTime: isPresent(status) ? form.outTime : "" };
      const { data } = await API.post(`/api/attendance/mark/${encodeURIComponent(place.code)}`,
        { date: form.date, rows: [row], createdByName: currentUserName() });
      if (data.skipped?.length) setError(data.skipped[0].reason);
      else onSaved(form.date, status ? `Attendance saved for ${person.name}` : `Mark removed for ${person.name}`);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-[15px] font-bold text-slate-800">{record ? "Edit Attendance" : editing ? "Mark Attendance" : "Add Attendance"}</h2>
            <p className="text-[11px] text-slate-400">{place.name} · {place.code}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className={LBL}>Employee *</label>
            {person ? (
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${CATEGORY_DOT[person.category] || "bg-slate-300"}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{person.name}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{[person.designation, person.category, person.mobile].filter(Boolean).join(" · ")}</span>
                </span>
                {!editing && <button onClick={() => setPerson(null)} className="text-xs font-semibold text-blue-600 hover:underline">Change</button>}
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="relative border-b border-slate-100">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, mobile, place…"
                    className="w-full h-9 pl-9 pr-3 text-sm focus:outline-none" />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {!list ? (
                    <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-400" /></div>
                  ) : !shown.length ? (
                    <p className="py-6 text-center text-sm text-slate-400">No one found — add them in HRMS › Employees first</p>
                  ) : shown.map(p => (
                    <button key={p.employeeId} onClick={() => setPerson(p)}
                      className="w-full flex items-center gap-3 px-3 py-2 border-b border-slate-50 hover:bg-slate-50 text-left">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_DOT[p.category] || "bg-slate-300"}`} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-semibold text-slate-800 truncate">{p.name}</span>
                        <span className="block text-[11px] text-slate-400 truncate">{[p.designation || p.category, p.mobile].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 shrink-0 ${p.postedAt === place.code ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {p.postedAt === place.code ? "Posted here" : p.postedAt || "Not posted"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LBL}>Date *</label>
              <input type="date" value={form.date} max={today} disabled={editing} onChange={set("date")} className={INP} />
            </div>
            <div>
              <label className={LBL}>Shift</label>
              <div className="flex h-9 rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                {["Day", "Night"].map(sh => (
                  <button key={sh} type="button" onClick={() => setForm(f => ({ ...f, shift: sh }))}
                    className={`flex-1 flex items-center justify-center gap-1 text-xs font-semibold rounded-md transition-colors ${form.shift === sh ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>
                    {sh === "Night" ? <Moon size={12} /> : <Sun size={12} />} {sh}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={LBL}>Status *</label>
            <div className="grid grid-cols-4 gap-1.5">
              {STATUSES.map(st => (
                <button key={st.v} type="button" onClick={() => setForm(f => ({ ...f, status: st.v }))}
                  className={`h-9 rounded-lg border text-xs font-semibold transition-colors ${form.status === st.v ? st.on : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
                  {st.v === "Annual Leave" ? "Leave" : st.v}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LBL}>In time</label>
              <input type="time" value={present ? form.inTime : ""} disabled={!present} onChange={set("inTime")} className={INP} />
            </div>
            <div>
              <label className={LBL}>Out time</label>
              <input type="time" value={present ? form.outTime : ""} disabled={!present} onChange={set("outTime")} className={INP} />
            </div>
            <div>
              <label className={LBL}>Hours</label>
              <div className="h-9 px-3 flex items-center rounded-lg bg-slate-50 border border-slate-100 text-sm font-semibold text-slate-700 tabular-nums">
                {present ? fmtDur(workedMin(form.inTime, form.outTime)) : "—"}
              </div>
            </div>
          </div>

          <div>
            <label className={LBL}>Remarks</label>
            <input value={form.remarks} onChange={set("remarks")} placeholder="Optional" className={INP} />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-slate-100">
          {record && canDelete && (
            <button onClick={() => window.confirm(`Remove ${person.name}'s mark for this day?`) && submit("")} disabled={saving}
              className="px-3 h-9 text-sm font-semibold text-red-600 rounded-lg hover:bg-red-50">Remove mark</button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={() => submit(form.status)} disabled={saving || !person}
              className="px-5 h-9 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin" />} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── "⋯" menu for the less used actions ── */
export function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} title="More actions"
        className={`h-9 w-9 flex items-center justify-center rounded-lg border bg-white text-slate-600 hover:bg-slate-50 ${open ? "border-blue-400 ring-1 ring-blue-400" : "border-slate-200"}`}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
          {items.map(it => (
            <button key={it.label} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white">
              <it.Icon size={15} className="text-slate-500 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-700">{it.label}</span>
                <span className="block text-[11px] text-slate-400">{it.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Edit history of one person's mark on one day ── */
export function LogModal({ person, date, onClose }) {
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    API.get(`/api/audit-logs/attendance/${person.employeeId}_${date}`)
      .then(({ data }) => setLogs(data.logs || []))
      .catch(() => setLogs([]));
  }, []);
  const tone = { Marked: "bg-emerald-500", Updated: "bg-blue-500", Removed: "bg-red-500" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-[15px] font-bold text-slate-800">Edit History</h2>
            <p className="text-[11px] text-slate-400">{person.name} · {fmtDate(date)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!logs ? (
            <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-400" /></div>
          ) : !logs.length ? (
            <p className="py-6 text-center text-sm text-slate-400">No changes recorded for this day yet.</p>
          ) : (
            <div className="space-y-4">
              {logs.map((l, i) => (
                <div key={l.id || i} className="relative border-l-2 border-slate-200 pl-4">
                  <span className={`absolute -left-[5px] top-1 w-2 h-2 rounded-full ${tone[l.action] || "bg-slate-400"}`} />
                  <p className="text-sm text-slate-700">
                    <b>{l.user_name || "Someone"}</b> <span className="text-slate-500">{(l.action || "").toLowerCase()}</span>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(l.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {Array.isArray(l.changes) && l.changes.length > 0 && (
                    <div className="mt-1.5 rounded-md border border-slate-100 bg-slate-50 divide-y divide-slate-100">
                      {l.changes.map((c, j) => (
                        <p key={j} className="px-2.5 py-1 text-xs text-slate-600">
                          <span className="font-semibold text-slate-500">{c.field}:</span>{" "}
                          {c.from ? <span className="line-through text-slate-400">{c.from}</span> : <span className="text-slate-300">—</span>}
                          {" → "}<span className="font-semibold text-slate-800">{c.to || "—"}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
