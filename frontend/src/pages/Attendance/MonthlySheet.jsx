import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Download, Loader2, Users, UserCheck, UserX, CalendarOff, Wallet, Timer } from "lucide-react";
import * as XLSX from "xlsx";
import API from "../../api";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import StatCards from "./StatCards";
import { STATUSES, statusOf, isLeave, otMin, paidValue, fmtDur, isoToday, CATEGORY_DOT } from "./utils";

/*
 * Monthly Sheet (muster roll) — one row per person, one column per day,
 * with totals and paid days (feeds salary later). Rows: everyone posted at
 * the place plus anyone marked here in the month. Clicking a day opens it
 * in the Daily Register.
 */
const GROUPS = [["all", "All"], ["staff", "Staff"], ["guard", "Guards"]];
const pad = (n) => String(n).padStart(2, "0");
const monthOf = (iso) => iso.slice(0, 7);
const addMonths = (ym, n) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const daysIn = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const fmtNum = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1);

export default function MonthlySheet({ place, onOpenDay }) {
  const { canExport } = useModulePermissions("staff_attendance");
  const today = isoToday();
  const [month, setMonth] = useState(monthOf(today));
  const [records, setRecords] = useState(null);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState("");
  const [group, setGroup] = useState("all");
  const [q, setQ] = useState("");

  const n = daysIn(month);
  const days = useMemo(() => Array.from({ length: n }, (_, i) => {
    const iso = `${month}-${pad(i + 1)}`;
    const wd = new Date(`${iso}T00:00:00`).getDay();
    return { iso, d: i + 1, wd, sunday: wd === 0, future: iso > today };
  }), [month, n, today]);

  useEffect(() => {
    setRecords(null); setError("");
    const from = `${month}-01`, to = `${month}-${pad(n)}`;
    Promise.all([
      API.get(`/api/attendance/records/${encodeURIComponent(place.code)}`, { params: { from, to } }),
      API.get(`/api/attendance/people/${encodeURIComponent(place.code)}`),
    ]).then(([r, p]) => { setRecords(r.data.records || []); setPeople(p.data.people || []); })
      .catch(err => { setRecords([]); setError(err?.response?.data?.error || "Could not load the month"); });
  }, [place.code, month, n]);

  // person → { info, byDay: { iso: record } }
  const sheet = useMemo(() => {
    const map = new Map();
    const add = (id, info) => { if (!map.has(id)) map.set(id, { ...info, byDay: {} }); return map.get(id); };
    people.filter(p => String(p.postedAt).toLowerCase() === place.code.toLowerCase())
      .forEach(p => add(p.employeeId, { id: p.employeeId, name: p.name, designation: p.designation, category: p.category, code: p.empCode || p.contactCode }));
    (records || []).forEach(r => {
      const id = r.employeeId || `name:${r.name}`;
      add(id, { id, name: r.name, designation: r.designation, category: r.category, code: r.contactCode }).byDay[r.date] = r;
    });
    return [...map.values()].map(row => {
      const marks = Object.values(row.byDay);
      const t = { P: 0, A: 0, HD: 0, L: 0, OFF: 0, paid: 0, ot: 0 };
      marks.forEach(r => {
        if (r.status === "Present" || r.status === "On Duty") t.P++;
        else if (r.status === "Absent") t.A++;
        else if (r.status === "Half Day") t.HD++;
        else if (r.status === "Annual Leave") t.L++;
        else if (isLeave(r.status)) t.OFF++;
        t.paid += paidValue(r.status);
        t.ot += otMin(row.category, r.shift, r.inTime, r.outTime);
      });
      return { ...row, t };
    }).sort((a, b) => (a.category === "Guard") - (b.category === "Guard") || a.name.localeCompare(b.name));
  }, [people, records, place.code]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sheet.filter(r => (group === "all" || (group === "guard" ? r.category === "Guard" : r.category !== "Guard"))
      && (!s || `${r.name} ${r.designation} ${r.code}`.toLowerCase().includes(s)));
  }, [sheet, group, q]);

  const sum = useMemo(() => shown.reduce((s, r) => ({
    P: s.P + r.t.P + r.t.HD * 0.5, A: s.A + r.t.A, L: s.L + r.t.L + r.t.OFF, paid: s.paid + r.t.paid, ot: s.ot + r.t.ot,
  }), { P: 0, A: 0, L: 0, paid: 0, ot: 0 }), [shown]);

  const exportExcel = () => {
    const head = ["#", "Name", "Contact / Employee ID", "Designation", "Category", ...days.map(d => d.d), "Present", "Absent", "Half Day", "Leave", "Off / Holiday", "Paid Days", "OT"];
    const body = shown.map((r, i) => [
      i + 1, r.name, r.code, r.designation, r.category,
      ...days.map(d => statusOf(r.byDay[d.iso]?.status)?.k || ""),
      r.t.P, r.t.A, r.t.HD, r.t.L, r.t.OFF, r.t.paid, fmtDur(r.t.ot),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([[`${place.name} (${place.code}) — Attendance ${monthLabel(month)}`], [], head, ...body, [],
      ["Codes:", STATUSES.map(s => `${s.k} = ${s.v}`).join(", ")]]);
    ws["!cols"] = [4, 24, 14, 18, 12, ...days.map(() => 4), 8, 8, 8, 7, 11, 9, 9].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, monthLabel(month).slice(0, 31));
    XLSX.writeFile(wb, `Attendance_${place.code}_${month}.xlsx`);
  };

  const th = "px-2 py-2 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap";
  const td = "border-b border-r border-slate-200 text-[12px] text-slate-600 whitespace-nowrap";
  const stick = "sticky z-[5] bg-white";

  return (
    <div className="h-full flex flex-col gap-4 p-4 sm:p-5">
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth(m => addMonths(m, -1))} className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title="Previous month"><ChevronLeft size={15} /></button>
          <label className="relative">
            <span className="flex items-center justify-center h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-800 min-w-[150px]">{monthLabel(month)}</span>
            <input type="month" value={month} max={monthOf(today)} onChange={e => e.target.value && setMonth(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
          </label>
          <button onClick={() => setMonth(m => addMonths(m, 1))} disabled={month >= monthOf(today)}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed" title="Next month"><ChevronRight size={15} /></button>
        </div>
        <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
          {GROUPS.map(([id, l]) => (
            <button key={id} onClick={() => setGroup(id)}
              className={`px-3 h-8 rounded-md text-xs font-semibold transition-all ${group === id ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
          ))}
        </div>
        <div className="relative w-48 sm:w-60">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name…"
            className="h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg bg-white w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        {canExport && (
          <button onClick={exportExcel} disabled={!shown.length}
            className="ml-auto inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            <Download size={14} /> Export
          </button>
        )}
      </div>

      <div className="shrink-0">
        <StatCards cards={[
          { label: "People",       value: shown.length,     Icon: Users,       accent: "#475569", tint: "#f1f5f9" },
          { label: "Present Days", value: fmtNum(sum.P),    Icon: UserCheck,   accent: "#059669", tint: "#ecfdf5" },
          { label: "Absent Days",  value: sum.A,            Icon: UserX,       accent: "#dc2626", tint: "#fef2f2" },
          { label: "Leave / Off",  value: sum.L,            Icon: CalendarOff, accent: "#2563eb", tint: "#eff6ff" },
          { label: "Paid Days",    value: fmtNum(sum.paid), Icon: Wallet,      accent: "#0d9488", tint: "#f0fdfa" },
          { label: "Overtime",     value: fmtDur(sum.ot),   Icon: Timer,       accent: "#4f46e5", tint: "#eef2ff" },
        ]} />
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          {!records ? (
            <div className="flex items-center justify-center h-48"><Loader2 size={20} className="text-blue-400 animate-spin" /></div>
          ) : error ? (
            <p className="p-6 text-sm text-red-600">{error}</p>
          ) : (
            <table className="text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className={`${th} sticky left-0 z-20 w-10 text-center`}>#</th>
                  <th className={`${th} sticky left-10 z-20 min-w-[190px]`}>Name</th>
                  {days.map(d => (
                    <th key={d.d} className={`${th} !px-0 w-8 min-w-[32px] text-center ${d.sunday ? "!bg-rose-50 text-rose-500" : ""}`}>
                      <span className="block text-[11px] text-slate-700 tabular-nums">{d.d}</span>
                      <span className="block text-[9px] font-medium normal-case">{"SMTWTFS"[d.wd]}</span>
                    </th>
                  ))}
                  {["P", "A", "HD", "L", "Off", "Paid", "OT"].map((h, i) => (
                    <th key={h} className={`${th} text-center ${h === "Paid" ? "!bg-teal-50 text-teal-700" : ""} ${i === 6 ? "border-r-0" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.id} className="group">
                    <td className={`${td} ${stick} left-0 text-center text-[11px] text-slate-400 tabular-nums group-hover:bg-slate-50`}>{i + 1}</td>
                    <td className={`${td} ${stick} left-10 px-2.5 py-1.5 group-hover:bg-slate-50`}>
                      <p className="flex items-center gap-1.5 font-semibold text-slate-800 leading-tight text-[13px]">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_DOT[r.category] || "bg-slate-300"}`} title={r.category} />{r.name}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 pl-3.5">{r.designation || r.category || "—"}</p>
                    </td>
                    {days.map(d => {
                      const rec = r.byDay[d.iso];
                      const s = statusOf(rec?.status);
                      return (
                        <td key={d.d} className={`${td} p-0 text-center ${d.sunday ? "bg-rose-50/40" : ""}`}>
                          {d.future ? null : (
                            <button onClick={() => onOpenDay(d.iso)} title={`${d.iso}${rec ? ` · ${rec.status}${rec.inTime ? ` · ${rec.inTime}–${rec.outTime || "?"}` : ""}` : " · not marked"} — open day`}
                              className="w-full h-9 flex items-center justify-center hover:bg-blue-50">
                              {s ? <span className={`min-w-[22px] px-0.5 py-0.5 rounded text-[10px] font-bold border ${s.soft}`}>{s.k}</span>
                                 : rec ? <span className="text-[10px] text-slate-500">?</span>
                                 : <span className="text-slate-200">·</span>}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className={`${td} px-2 text-center font-semibold text-emerald-700 tabular-nums`}>{r.t.P || ""}</td>
                    <td className={`${td} px-2 text-center font-semibold text-red-600 tabular-nums`}>{r.t.A || ""}</td>
                    <td className={`${td} px-2 text-center text-amber-700 tabular-nums`}>{r.t.HD || ""}</td>
                    <td className={`${td} px-2 text-center text-blue-700 tabular-nums`}>{r.t.L || ""}</td>
                    <td className={`${td} px-2 text-center text-slate-500 tabular-nums`}>{r.t.OFF || ""}</td>
                    <td className={`${td} px-2 text-center font-bold text-teal-700 bg-teal-50/40 tabular-nums`}>{fmtNum(r.t.paid)}</td>
                    <td className={`${td} px-2 text-center text-indigo-700 tabular-nums border-r-0`}>{r.t.ot ? fmtDur(r.t.ot) : ""}</td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={n + 9} className="py-10 text-center text-sm text-slate-400">No one posted or marked here in {monthLabel(month)}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
        <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-t border-slate-100 text-[10px] text-slate-500">
          {STATUSES.map(s => (
            <span key={s.v} className="inline-flex items-center gap-1"><span className={`px-1 rounded border font-bold ${s.soft}`}>{s.k}</span>{s.v}</span>
          ))}
          <span className="ml-auto text-slate-400">Paid = Present, On Duty, Leave, Week Off, Holiday, Comp Off + ½ for Half Day</span>
        </div>
      </div>
    </div>
  );
}
