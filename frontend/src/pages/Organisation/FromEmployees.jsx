import React, { useEffect, useMemo, useState } from "react";
import { X, Loader2, Search, Wand2, Users } from "lucide-react";
import BrandLoader from "../../components/BrandLoader";

/*
 * Settings › Organisation › Designations / Departments — "from employees":
 * an employee's designation and department used to be typed text. This
 * lists the ones a company uses that aren't in the list yet, lets you tidy
 * a name (or merge two by giving them the same name) and adds them — the
 * employees then carry the list name.
 * KINDS → backend: GET / POST <endpoint> (organisation.js, departments.js).
 */
export const KINDS = {
  designations: { what: "Designations", one: "designation", endpoint: "/api/organisation/org-designations/from-employees" },
  departments:  { what: "Departments",  one: "department",  endpoint: "/api/departments/from-employees" },
};
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";

// "manager - procurement " → "Manager - Procurement"
const tidy = (s) => String(s || "").trim().replace(/\s+/g, " ")
  .replace(/\b([a-z])([a-z]*)/g, (m, a, b) => (["and", "of", "&"].includes(m) ? m : a.toUpperCase() + b))
  .replace(/\b(Sr|Jr)\b\.?/gi, (m, a) => a[0].toUpperCase() + a[1].toLowerCase());

export function useFromEmployees(kind, orgId) {
  const [list, setList] = useState(null);
  const load = () => fetch(`${API}${KINDS[kind].endpoint}?company_id=${orgId}`, { headers: { Authorization: `Bearer ${TOKEN()}` } })
    .then(r => r.json()).then(d => setList(d.suggestions || [])).catch(() => setList([]));
  useEffect(() => { if (orgId) load(); }, [orgId]);
  return [list, load];
}

export default function FromEmployees({ kind, orgId, existing, suggestions, onClose, onDone }) {
  const K = KINDS[kind];
  const [rows, setRows] = useState(() => (suggestions || []).map(s => ({ ...s, title: tidy(s.text), on: true })));
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const setRow = (text, patch) => setRows(rs => rs.map(r => r.text === text ? { ...r, ...patch } : r));

  // names already used: the list + what's typed here — offered when renaming, so two can be merged
  const names = useMemo(() => [...new Set([...existing, ...rows.filter(r => r.on && r.title.trim()).map(r => r.title.trim())])].sort(), [existing, rows]);
  const merged = useMemo(() => {
    const m = new Map();
    rows.filter(r => r.on && r.title.trim()).forEach(r => { const k = r.title.trim().toLowerCase(); m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }, [rows]);
  const chosen = rows.filter(r => r.on && r.title.trim());
  const people = chosen.reduce((a, r) => a + r.count, 0);
  const newNames = new Set(chosen.map(r => r.title.trim().toLowerCase()).filter(k => !existing.some(e => e.toLowerCase() === k)));
  const shown = rows.filter(r => !q.trim() || `${r.text} ${r.title}`.toLowerCase().includes(q.trim().toLowerCase()));

  const save = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch(`${API}${K.endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
        body: JSON.stringify({ company_id: orgId, items: chosen.map(r => ({ from: r.text, title: r.title.trim() })) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      onDone(d);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div>
            <p className="text-[15px] font-bold text-slate-800">{K.what} from employees</p>
            <p className="text-[11px] text-slate-400">Fix a name if needed. Give two rows the same name to merge them.</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100">
          <div className="relative w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
              className="w-full h-8 pl-8 pr-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <button onClick={() => setRows(rs => rs.map(r => ({ ...r, on: true })))} className="h-8 px-3 text-xs font-semibold rounded-md border border-slate-200 hover:bg-slate-50">Select all</button>
          <button onClick={() => setRows(rs => rs.map(r => ({ ...r, on: false })))} className="h-8 px-3 text-xs font-semibold rounded-md border border-slate-200 hover:bg-slate-50">Clear</button>
          <span className="ml-auto text-xs text-slate-500">
            <b className="text-slate-800">{newNames.size}</b> new {K.one}{newNames.size === 1 ? "" : "s"} · <b className="text-slate-800">{people}</b> employees linked
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {!suggestions ? <BrandLoader compact /> : !rows.length ? (
            <p className="py-12 text-center text-sm text-slate-500">Every employee's {K.one} is already in the list.</p>
          ) : (
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 bg-slate-50 border-b border-slate-200 w-10" />
                  <th className="px-3 py-2 bg-slate-50 border-b border-slate-200">Employees wrote</th>
                  <th className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-right">People</th>
                  <th className="px-3 py-2 bg-slate-50 border-b border-slate-200">Add as</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(r => {
                  const k = r.title.trim().toLowerCase();
                  const isMerge = r.on && merged.get(k) > 1;
                  const isExisting = r.on && existing.some(e => e.toLowerCase() === k);
                  return (
                    <tr key={r.text} className={r.on ? "" : "opacity-50"}>
                      <td className="px-3 py-2 border-b border-slate-100"><input type="checkbox" checked={r.on} onChange={e => setRow(r.text, { on: e.target.checked })} className="w-4 h-4 accent-blue-600" /></td>
                      <td className="px-3 py-2 border-b border-slate-100">
                        <p className="text-[13px] text-slate-700">{r.text}</p>
                        <p className="text-[10px] text-slate-400 truncate max-w-[260px]" title={r.people.join(", ")}><Users size={9} className="inline -mt-0.5" /> {r.people.join(", ")}{r.count > r.people.length ? "…" : ""}</p>
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-right text-[13px] font-semibold tabular-nums">{r.count}</td>
                      <td className="px-3 py-2 border-b border-slate-100 min-w-[260px]">
                        <input value={r.title} disabled={!r.on} list={`${kind}-names`} onChange={e => setRow(r.text, { title: e.target.value })}
                          className="w-full h-8 px-2.5 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50" />
                        {isExisting ? <p className="text-[10px] font-semibold text-emerald-600 mt-0.5">Already in the list — employees will be linked to it</p>
                          : isMerge ? <p className="text-[10px] font-semibold text-violet-600 mt-0.5">Merged with {merged.get(k) - 1} other row{merged.get(k) > 2 ? "s" : ""}</p> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <datalist id={`${kind}-names`}>{names.map(n => <option key={n} value={n} />)}</datalist>
        </div>

        <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50">
          {error && <p className="text-xs text-red-600 flex-1">{error}</p>}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving || !chosen.length}
              className="inline-flex items-center gap-2 h-9 px-5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Add {newNames.size} & link {people}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* The blue strip on top of the list + the dialog behind it */
export function FromEmployeesBanner({ kind, orgId, existing, onAdded }) {
  const K = KINDS[kind];
  const [suggestions, reload] = useFromEmployees(kind, orgId);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const people = (suggestions || []).reduce((a, x) => a + x.count, 0);
  return (
    <>
      {suggestions?.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <Wand2 size={16} className="text-blue-600 shrink-0" />
          <p className="flex-1 min-w-[240px] text-[13px] text-blue-900">
            <b>{people} employee{people === 1 ? "" : "s"}</b> use <b>{suggestions.length}</b> {K.one}{suggestions.length === 1 ? "" : "s"} that {suggestions.length === 1 ? "isn't" : "aren't"} in this list yet.
          </p>
          <button onClick={() => setOpen(true)} className="h-8 px-3.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700">Review & add</button>
        </div>
      )}
      {msg && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800">{msg}</p>}
      {open && (
        <FromEmployees kind={kind} orgId={orgId} existing={existing} suggestions={suggestions}
          onClose={() => setOpen(false)}
          onDone={(d) => { setOpen(false); setMsg(`${d.added} ${K.one}${d.added === 1 ? "" : "s"} added · ${d.linked} employee${d.linked === 1 ? "" : "s"} now use the list name`); reload(); onAdded?.(); }} />
      )}
    </>
  );
}
