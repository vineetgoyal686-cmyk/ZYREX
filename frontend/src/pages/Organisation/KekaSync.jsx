import React, { useMemo, useRef, useState } from "react";
import { X, Upload, Loader2, RefreshCw, AlertTriangle, CheckCircle2, UserX, UserPlus } from "lucide-react";
import * as XLSX from "xlsx";
import BrandLoader from "../../components/BrandLoader";

/*
 * Employees › Sync from Keka. Keka's Org Tree export (Org › Organization
 * Tree › open every box › Download Excel) is the live staff list. Upload it:
 *  1 · matched — Keka's Job Title / Department / Employee Number are written
 *      on the employee (tick to apply; "check" = matched by a near-same name)
 *  2 · in Keka, not here — add them from Add Employee (a mobile is needed)
 *  3 · here, not in Keka — tick to mark Inactive (never deleted). Office
 *      staff are ticked; guards / site staff / drivers / cooks aren't (they
 *      were never in Keka).
 * Backend: POST /api/organisation/keka-sync/preview and /apply.
 */
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";
const post = async (path, body) => {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` }, body: JSON.stringify(body) });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Failed");
  return d;
};
const NOT_IN_KEKA_BY_DEFAULT = ["Guard", "Site Staff", "Driver", "Cook", "Labour"];

export default function KekaSync({ orgId, onClose, onDone }) {
  const [file, setFile] = useState("");
  const [data, setData] = useState(null);      // preview
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [apply, setApply] = useState({});      // employee id → true (matched rows to update)
  const [deact, setDeact] = useState({});      // employee id → true (mark inactive)
  const [result, setResult] = useState(null);
  const input = useRef(null);

  const read = async (f) => {
    if (!f) return;
    setFile(f.name); setError(""); setData(null); setResult(null); setBusy(true);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", raw: true });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      const pick = (r, ...names) => { const k = Object.keys(r).find(x => names.includes(x.trim().toLowerCase())); return k ? r[k] : ""; };
      const rows = raw.map(r => ({
        number: pick(r, "employee number", "employee no", "emp no", "employee id"),
        name: pick(r, "display name", "name", "employee name"),
        title: pick(r, "job title", "designation"),
        department: pick(r, "department"),
      })).filter(r => String(r.name).trim());
      if (!rows.length) throw new Error("No rows found — use Keka's Org Tree › Download Excel");
      const d = await post("/api/organisation/keka-sync/preview", { company_id: orgId, rows });
      setData(d);
      setApply(Object.fromEntries(d.matched.filter(m => m.changes.length).map(m => [m.id, true])));
      setDeact(Object.fromEntries(d.notInKeka.filter(e => !NOT_IN_KEKA_BY_DEFAULT.includes(e.category)).map(e => [e.id, true])));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };

  const toApply = useMemo(() => (data?.matched || []).filter(m => apply[m.id]), [data, apply]);
  const toDeact = useMemo(() => Object.keys(deact).filter(id => deact[id]), [deact]);

  const run = async () => {
    if (toDeact.length && !window.confirm(`Mark ${toDeact.length} employee${toDeact.length === 1 ? "" : "s"} Inactive? They stay in the records but leave the lists, Org Chart and pickers.`)) return;
    setBusy(true); setError("");
    try {
      const d = await post("/api/organisation/keka-sync/apply", {
        company_id: orgId,
        updates: toApply.map(m => ({ id: m.id, name: m.name, ...m.set })),
        deactivate: toDeact,
      });
      setResult(d); onDone?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const th = "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-200";
  const td = "px-3 py-2 border-b border-slate-100 text-[12.5px] align-top";
  const changed = (data?.matched || []).filter(m => m.changes.length);
  const same = (data?.matched || []).length - changed.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div>
            <p className="text-[15px] font-bold text-slate-800">Sync from Keka</p>
            <p className="text-[11px] text-slate-400">Keka › Org › Organization Tree › open every box › Download Excel</p>
          </div>
          <button onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={input} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => read(e.target.files?.[0])} />
            <button onClick={() => input.current?.click()} disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              <Upload size={14} /> {file ? "Choose another file" : "Choose Keka file"}
            </button>
            {file && <span className="text-xs text-slate-500">{file}</span>}
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {busy && !data && <BrandLoader compact />}

          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <p className="font-semibold flex items-center gap-1.5"><CheckCircle2 size={15} /> Done</p>
              <p className="mt-1">{result.updated} updated · {result.deactivated} marked inactive · {result.addedDesig} designation{result.addedDesig === 1 ? "" : "s"} and {result.addedDept} department{result.addedDept === 1 ? "" : "s"} added to the lists</p>
              {result.skipped?.length > 0 && <ul className="mt-1.5 text-xs text-amber-800">{result.skipped.map((s, i) => <li key={i}>• {s.name} — {s.reason}</li>)}</ul>}
            </div>
          )}

          {data && !result && (
            <>
              {/* 1 · matched */}
              <section>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  1 · In Keka and here — {changed.length} to update{same ? ` · ${same} already the same` : ""}
                </p>
                {!changed.length ? <p className="text-sm text-slate-400">Nothing to change.</p> : (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full border-separate border-spacing-0">
                      <thead><tr><th className={`${th} w-8`} /><th className={th}>Employee</th><th className={th}>What changes</th></tr></thead>
                      <tbody>
                        {changed.map(m => (
                          <tr key={m.id} className={apply[m.id] ? "" : "opacity-50"}>
                            <td className={td}><input type="checkbox" checked={!!apply[m.id]} onChange={e => setApply(a => ({ ...a, [m.id]: e.target.checked }))} className="w-4 h-4 accent-blue-600" /></td>
                            <td className={td}>
                              <p className="font-semibold text-slate-800">{m.name}</p>
                              {m.guess && <p className="text-[11px] font-semibold text-amber-600 flex items-center gap-1"><AlertTriangle size={11} /> Check: Keka says "{m.kekaName}"</p>}
                              {m.otherCompany && <p className="text-[11px] text-slate-400">in {m.company}</p>}
                            </td>
                            <td className={td}>
                              {m.changes.map(c => (
                                <p key={c.field} className="text-[12px]"><span className="text-slate-400">{c.field}:</span> <span className="line-through text-slate-400">{c.from || "—"}</span> → <b className="text-slate-800">{c.to}</b></p>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* 2 · in Keka, not here */}
              {data.missing.length > 0 && (
                <section>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><UserPlus size={12} /> 2 · In Keka, not here — {data.missing.length}</p>
                  <p className="mb-2 text-[12px] text-slate-500">Add them with "Add Employee" (a mobile number is needed). If one is here under another spelling, fix the name and sync again.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.missing.map((r, i) => <span key={i} className="px-2.5 py-1 rounded-md border border-slate-200 text-[12px] text-slate-700">{r.name}<span className="text-slate-400"> · {r.title || "—"} · {r.no || "no number"}</span></span>)}
                  </div>
                </section>
              )}

              {/* 3 · here, not in Keka */}
              {data.notInKeka.length > 0 && (
                <section>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><UserX size={12} /> 3 · Here, not in Keka — {data.notInKeka.length} · ticked ones become Inactive</p>
                  <p className="mb-2 text-[12px] text-slate-500">Inactive people aren't deleted — their attendance, orders and history stay. Guards, site staff, drivers and cooks are left unticked: they were never in Keka.</p>
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => setDeact(Object.fromEntries(data.notInKeka.map(e => [e.id, true])))} className="h-7 px-2.5 text-[11px] font-semibold rounded-md border border-slate-200 hover:bg-slate-50">Tick all</button>
                    <button onClick={() => setDeact({})} className="h-7 px-2.5 text-[11px] font-semibold rounded-md border border-slate-200 hover:bg-slate-50">Untick all</button>
                  </div>
                  <div className="rounded-lg border border-slate-200 overflow-hidden max-h-[40vh] overflow-y-auto">
                    <table className="w-full border-separate border-spacing-0">
                      <thead className="sticky top-0"><tr><th className={`${th} w-8`} /><th className={th}>Employee</th><th className={th}>Category</th><th className={th}>Department · Designation</th></tr></thead>
                      <tbody>
                        {data.notInKeka.map(e => (
                          <tr key={e.id} className={deact[e.id] ? "bg-red-50/40" : ""}>
                            <td className={td}><input type="checkbox" checked={!!deact[e.id]} onChange={ev => setDeact(d => ({ ...d, [e.id]: ev.target.checked }))} className="w-4 h-4 accent-red-600" /></td>
                            <td className={td}><p className="font-semibold text-slate-800">{e.name}</p><p className="text-[11px] text-slate-400">{e.employeeId || "—"}</p></td>
                            <td className={`${td} text-slate-600`}>{e.category || "—"}</td>
                            <td className={`${td} text-slate-600`}>{[e.department, e.designation].filter(Boolean).join(" · ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">{result ? "Close" : "Cancel"}</button>
            {data && !result && (
              <button onClick={run} disabled={busy || (!toApply.length && !toDeact.length)}
                className="inline-flex items-center gap-2 h-9 px-5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Update {toApply.length} · Inactive {toDeact.length}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
