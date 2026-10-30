import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Download, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import API from "../../api";
import { STATUSES, statusOf, parseStatus, parseTime, parseDate, isoToday, fmtDate, currentUserName } from "./utils";

/*
 * Bulk Upload — fill attendance for many people / days from an Excel or CSV.
 * Each row is matched to an employee of the place's company by Employee ID
 * (or Contact ID), else mobile, else exact name. Rows are then saved day by
 * day through POST /api/attendance/mark/:place, so the same rules apply as
 * in the register (one mark per person per day, permissions, edit log).
 * A row with a blank Status is skipped.
 */
const COLS = ["Date", "Employee ID", "Mobile", "Name", "Status", "In", "Out", "Shift", "Remarks"];
const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const last10 = (v) => String(v ?? "").replace(/\D/g, "").slice(-10);
// header cell → our column, forgiving about case / spaces
const pick = (row, ...names) => {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find(k => norm(k).replace(/[^a-z]/g, "") === n);
    if (k !== undefined && row[k] !== "") return row[k];
  }
  return "";
};

export default function BulkUpload({ place, date, onClose, onDone }) {
  const [people, setPeople] = useState(null);
  const [rows, setRows] = useState(null);     // parsed file
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { saved, skipped: [{name, date, reason}] }
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const today = isoToday();

  useEffect(() => {
    API.get(`/api/attendance/people/${encodeURIComponent(place.code)}`)
      .then(({ data }) => setPeople(data.people || []))
      .catch(err => setError(err?.response?.data?.error || "Could not load employees"));
  }, [place.code]);

  const downloadTemplate = () => {
    const posted = (people || []).filter(p => p.postedAt && norm(p.postedAt) === norm(place.code));
    const data = posted.length
      ? posted.map(p => ({ Date: date, "Employee ID": p.empCode || p.contactCode, Mobile: p.mobile, Name: p.name, Status: "", In: "", Out: "", Shift: "Day", Remarks: "" }))
      : [{ Date: date, "Employee ID": "", Mobile: "", Name: "", Status: "P", In: "09:30", Out: "18:00", Shift: "Day", Remarks: "" }];
    const ws = XLSX.utils.json_to_sheet(data, { header: COLS });
    ws["!cols"] = [12, 14, 13, 24, 10, 8, 8, 8, 28].map(wch => ({ wch }));
    const help = XLSX.utils.aoa_to_sheet([
      ["Column", "What to fill"],
      ["Date", "YYYY-MM-DD or DD-MM-YYYY (e.g. 2026-10-30 or 30-10-2026). Not a future date."],
      ["Employee ID / Mobile / Name", "Any one is enough. Matched in this order: Employee ID (or Contact ID like CON-012), mobile, exact name."],
      ["Status", "Leave blank to skip the row. Codes: " + STATUSES.map(s => `${s.k} = ${s.v}`).join(", ")],
      ["In / Out", "24-hour HH:MM or 9:30 AM. Optional."],
      ["Shift", "Day or Night (default Day)."],
      ["", ""],
      ["Note", "A row for someone who already has a mark that day updates it. Someone already marked at another project/office that day is skipped."],
    ]);
    help["!cols"] = [{ wch: 26 }, { wch: 110 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.utils.book_append_sheet(wb, help, "How to fill");
    XLSX.writeFile(wb, `Attendance_upload_${place.code}_${date}.xlsx`);
  };

  // lookups for matching
  const index = useMemo(() => {
    const byId = new Map(), byMobile = new Map(), byName = new Map();
    (people || []).forEach(p => {
      [p.empCode, p.contactCode].filter(Boolean).forEach(id => byId.set(norm(id), p));
      if (last10(p.mobile).length === 10) byMobile.set(last10(p.mobile), [...(byMobile.get(last10(p.mobile)) || []), p]);
      byName.set(norm(p.name), [...(byName.get(norm(p.name)) || []), p]);
    });
    return { byId, byMobile, byName };
  }, [people]);

  const readFile = async (file) => {
    if (!file) return;
    setError(""); setResult(null); setFileName(file.name);
    try {
      // raw: CSV cells stay text, so "05-10-2026" isn't read as 10 May
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
      const seen = new Set();
      const out = raw.map((r, i) => {
        const line = i + 2;
        const statusIn = pick(r, "status");
        const idIn = String(pick(r, "employeeid", "empid", "contactid", "id")).trim();
        const mobileIn = pick(r, "mobile", "mobilenumber", "phone", "contactnumber");
        const nameIn = String(pick(r, "name", "employeename", "personname")).trim();
        const row = { line, nameIn: nameIn || idIn || String(mobileIn), blank: !String(statusIn).trim() };
        if (row.blank) return row;

        row.date = parseDate(pick(r, "date"));
        row.status = parseStatus(statusIn);
        row.inTime = parseTime(pick(r, "in", "intime"));
        row.outTime = parseTime(pick(r, "out", "outtime"));
        row.shift = norm(pick(r, "shift")) === "night" ? "Night" : "Day";
        row.remarks = String(pick(r, "remarks", "remark")).trim();

        let p = idIn ? index.byId.get(norm(idIn)) : null;
        if (!p && last10(mobileIn).length === 10) { const m = index.byMobile.get(last10(mobileIn)) || []; if (m.length === 1) p = m[0]; }
        if (!p && nameIn) {
          const m = index.byName.get(norm(nameIn)) || [];
          if (m.length === 1) p = m[0];
          else if (m.length > 1) row.error = `${m.length} employees named "${nameIn}" — add Employee ID or mobile`;
        }
        row.person = p || null;

        if (!row.date) row.error = "Date missing or not a date";
        else if (row.date > today) row.error = "Future date";
        else if (!row.status) row.error = `Unknown status "${statusIn}"`;
        else if (row.inTime === null || row.outTime === null) row.error = "In / Out time not readable";
        else if (!p && !row.error) row.error = "No employee found in this company";
        if (!row.error) {
          const key = `${p.employeeId}_${row.date}`;
          if (seen.has(key)) row.error = "Same person and date twice in the file";
          seen.add(key);
        }
        return row;
      }).filter(r => !r.blank || r.nameIn);
      setRows(out);
    } catch {
      setRows(null);
      setError("Could not read this file — use the template (.xlsx or .csv)");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const good = (rows || []).filter(r => !r.blank && !r.error);
  const bad = (rows || []).filter(r => !r.blank && r.error);
  const blank = (rows || []).filter(r => r.blank).length;

  const save = async () => {
    setSaving(true); setError("");
    const byDate = new Map();
    good.forEach(r => byDate.set(r.date, [...(byDate.get(r.date) || []), r]));
    let saved = 0;
    const skipped = [];
    try {
      for (const [d, list] of [...byDate.entries()].sort()) {
        const { data } = await API.post(`/api/attendance/mark/${encodeURIComponent(place.code)}`, {
          date: d, createdByName: currentUserName(),
          rows: list.map(r => ({ employeeId: r.person.employeeId, status: r.status, inTime: r.inTime, outTime: r.outTime, shift: r.shift, remarks: r.remarks })),
        });
        saved += data.saved || 0;
        (data.skipped || []).forEach(s => skipped.push({ ...s, date: d }));
      }
      setResult({ saved, skipped });
      onDone?.();
    } catch (err) {
      setResult({ saved, skipped });
      setError(err?.response?.data?.detail || err?.response?.data?.error || "Upload stopped — some rows may not be saved");
    } finally { setSaving(false); }
  };

  const th = "px-2.5 py-2 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap";
  const td = "px-2.5 py-1.5 border-b border-r border-slate-200 text-xs text-slate-600 whitespace-nowrap";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onMouseDown={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div>
            <p className="text-sm font-bold text-slate-800">Bulk Upload Attendance</p>
            <p className="text-[11px] text-slate-400">{place.name} · {place.code}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-5 space-y-4">
          {/* 1 · template, 2 · file */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-bold text-slate-700">1 · Download the template</p>
              <p className="text-[11px] text-slate-400 mt-1">Comes filled with everyone posted at {place.code}, dated {fmtDate(date)}. Fill Status (P / A / HD / L / WO …), In and Out. Add rows for other days if you like.</p>
              <button onClick={downloadTemplate} disabled={!people}
                className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                {people ? <Download size={13} /> : <Loader2 size={13} className="animate-spin" />} Download Template
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-bold text-slate-700">2 · Upload the filled file</p>
              <p className="text-[11px] text-slate-400 mt-1">Excel (.xlsx) or CSV. You'll see every row checked before anything is saved.</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => readFile(e.target.files?.[0])} />
              <button onClick={() => fileRef.current?.click()} disabled={!people || saving}
                className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                <Upload size={13} /> Choose File
              </button>
              {fileName && <span className="ml-2 text-[11px] text-slate-500 inline-flex items-center gap-1"><FileSpreadsheet size={12} />{fileName}</span>}
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={15} /> {result.saved} mark{result.saved === 1 ? "" : "s"} saved</p>
              {result.skipped.length > 0 && (
                <ul className="mt-2 text-xs text-amber-800 space-y-0.5 max-h-40 overflow-auto">
                  {result.skipped.map((s, i) => <li key={i}>• {s.name} · {fmtDate(s.date)} — {s.reason}</li>)}
                </ul>
              )}
            </div>
          )}

          {rows && !result && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-semibold">{good.length} ready</span>
                {bad.length > 0 && <span className="px-2 py-1 rounded-md bg-red-50 text-red-700 font-semibold">{bad.length} with problems (won't be saved)</span>}
                {blank > 0 && <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-500 font-semibold">{blank} blank status — skipped</span>}
              </div>
              <div className="rounded-lg border border-slate-200 overflow-auto max-h-[45vh]">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead className="sticky top-0">
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                      <th className={th}>Row</th><th className={th}>Date</th><th className={th}>Employee</th><th className={th}>Status</th>
                      <th className={th}>In</th><th className={th}>Out</th><th className={th}>Shift</th><th className={`${th} border-r-0`}>Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter(r => !r.blank).sort((a, b) => !!b.error - !!a.error || a.line - b.line).map(r => (
                      <tr key={r.line} className={r.error ? "bg-red-50/40" : ""}>
                        <td className={`${td} text-slate-400 tabular-nums`}>{r.line}</td>
                        <td className={`${td} tabular-nums`}>{r.date ? fmtDate(r.date, { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                        <td className={td}>
                          {r.person ? <><span className="font-semibold text-slate-800">{r.person.name}</span> <span className="text-slate-400">{r.person.category}</span></> : <span className="text-slate-400">{r.nameIn || "—"}</span>}
                        </td>
                        <td className={td}>
                          {r.status ? <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusOf(r.status)?.soft}`}>{r.status}</span> : "—"}
                        </td>
                        <td className={`${td} tabular-nums`}>{r.inTime || "—"}</td>
                        <td className={`${td} tabular-nums`}>{r.outTime || "—"}</td>
                        <td className={td}>{r.shift || "—"}</td>
                        <td className={`${td} border-r-0`}>
                          {r.error ? <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle size={11} />{r.error}</span> : <span className="text-emerald-600 font-semibold">OK</span>}
                        </td>
                      </tr>
                    ))}
                    {!rows.some(r => !r.blank) && <tr><td colSpan={8} className="py-8 text-center text-xs text-slate-400">No row has a Status filled</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button onClick={save} disabled={saving || !good.length}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Save {good.length || ""} mark{good.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
