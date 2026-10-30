import React, { useRef, useState } from "react";
import { X, Download, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";

/*
 * Excel bulk upload, shared by pages: 1 · download the template, 2 · upload
 * the filled file, see every row checked, 3 · save the good ones.
 *
 * cols          template header, in order
 * templateRows  () => rows for the template (objects keyed by cols)
 * help          [[column, what to fill], …] — second sheet "How to fill"
 * parse(pick, line) → { blank } | { label, cells, data, error }
 *               pick("name", "other name"…) reads a cell by header, forgiving
 *               case / spaces; cells = preview columns (previewHead)
 * save(datas)   → Promise<{ saved, skipped: [{ label, reason }] }>
 */
const norm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export default function BulkImportModal({ title, subtitle, fileName, cols, templateRows, help, previewHead, parse, save, onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [file, setFile] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const input = useRef(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(templateRows(), { header: cols });
    ws["!cols"] = cols.map(c => ({ wch: Math.max(12, c.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    if (help?.length) {
      const h = XLSX.utils.aoa_to_sheet([["Column", "What to fill"], ...help]);
      h["!cols"] = [{ wch: 24 }, { wch: 100 }];
      XLSX.utils.book_append_sheet(wb, h, "How to fill");
    }
    XLSX.writeFile(wb, fileName);
  };

  const read = async (f) => {
    if (!f) return;
    setError(""); setResult(null); setFile(f.name);
    try {
      // raw: CSV cells stay text, so "05-10-2026" isn't read as 10 May
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", raw: true });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
      const out = raw.map((r, i) => {
        const keys = Object.keys(r).map(k => [norm(k), k]);
        const pick = (...names) => {
          for (const n of names) { const hit = keys.find(([nk]) => nk === norm(n)); if (hit && r[hit[1]] !== "") return r[hit[1]]; }
          return "";
        };
        return { line: i + 2, ...parse(pick, i + 2) };
      });
      setRows(out);
    } catch {
      setRows(null);
      setError("Could not read this file — use the template (.xlsx or .csv)");
    }
    if (input.current) input.current.value = "";
  };

  const good = (rows || []).filter(r => !r.blank && !r.error);
  const bad = (rows || []).filter(r => !r.blank && r.error);
  const blank = (rows || []).filter(r => r.blank).length;

  const run = async () => {
    setSaving(true); setError("");
    try {
      const res = await save(good.map(r => ({ ...r.data, line: r.line })));
      setResult(res);
      if (res.saved) onDone?.();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || "Upload failed");
    } finally { setSaving(false); }
  };

  const th = "px-2.5 py-2 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap";
  const td = "px-2.5 py-1.5 border-b border-r border-slate-200 text-xs text-slate-600 whitespace-nowrap";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onMouseDown={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div>
            <p className="text-sm font-bold text-slate-800">{title}</p>
            {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} disabled={saving} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-bold text-slate-700">1 · Download the template</p>
              <p className="text-[11px] text-slate-400 mt-1">Fill one row per entry. The "How to fill" sheet explains every column.</p>
              <button onClick={downloadTemplate}
                className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                <Download size={13} /> Download Template
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-bold text-slate-700">2 · Upload the filled file</p>
              <p className="text-[11px] text-slate-400 mt-1">Excel (.xlsx) or CSV. Every row is checked before anything is saved.</p>
              <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => read(e.target.files?.[0])} />
              <button onClick={() => input.current?.click()} disabled={saving}
                className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                <Upload size={13} /> Choose File
              </button>
              {file && <span className="ml-2 text-[11px] text-slate-500 inline-flex items-center gap-1"><FileSpreadsheet size={12} />{file}</span>}
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={15} /> {result.saved} saved</p>
              {result.skipped?.length > 0 && (
                <>
                  <p className="mt-2 text-xs font-semibold text-amber-800">{result.skipped.length} not saved:</p>
                  <ul className="mt-1 text-xs text-amber-800 space-y-0.5 max-h-40 overflow-auto">
                    {result.skipped.map((s, i) => <li key={i}>• {s.label} — {s.reason}</li>)}
                  </ul>
                </>
              )}
            </div>
          )}

          {rows && !result && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-semibold">{good.length} ready</span>
                {bad.length > 0 && <span className="px-2 py-1 rounded-md bg-red-50 text-red-700 font-semibold">{bad.length} with problems (won't be saved)</span>}
                {blank > 0 && <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-500 font-semibold">{blank} empty — skipped</span>}
              </div>
              <div className="rounded-lg border border-slate-200 overflow-auto max-h-[45vh]">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead className="sticky top-0">
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                      <th className={th}>Row</th>
                      {previewHead.map(h => <th key={h} className={th}>{h}</th>)}
                      <th className={`${th} border-r-0`}>Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter(r => !r.blank).sort((a, b) => !!b.error - !!a.error || a.line - b.line).map(r => (
                      <tr key={r.line} className={r.error ? "bg-red-50/40" : ""}>
                        <td className={`${td} text-slate-400 tabular-nums`}>{r.line}</td>
                        {r.cells.map((c, i) => <td key={i} className={`${td} max-w-[220px] truncate`} title={typeof c === "string" ? c : undefined}>{c === "" || c == null ? "—" : c}</td>)}
                        <td className={`${td} border-r-0`}>
                          {r.error ? <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle size={11} />{r.error}</span> : <span className="text-emerald-600 font-semibold">OK</span>}
                        </td>
                      </tr>
                    ))}
                    {!rows.some(r => !r.blank) && <tr><td colSpan={previewHead.length + 2} className="py-8 text-center text-xs text-slate-400">The file has no filled rows</td></tr>}
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
            <button onClick={run} disabled={saving || !good.length}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Save {good.length || ""} row{good.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
