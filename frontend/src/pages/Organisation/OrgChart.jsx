import React, { useEffect, useMemo, useState } from "react";
import { Search, ChevronDown, ChevronRight, Users, AlertTriangle, Minus, Plus } from "lucide-react";
import { cx, initials } from "./helpers";
import { useOrgId, scopedUrl } from "./orgScope";
import BrandLoader from "../../components/BrandLoader";

/*
 * HRMS › Org Chart — built from the company's employees: each person sits
 * under their Reporting Manager (employee form). People with no manager,
 * or whose manager isn't an employee here, start their own branch.
 * Click a box to open / close the people under it.
 */
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";
const COLORS = ["bg-slate-700", "bg-blue-600", "bg-emerald-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-cyan-600"];
const key = (v) => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();

// employees → forest of { emp, children, size }
function buildTree(emps) {
  const active = emps.filter(e => e.status !== "inactive");
  const byName = new Map();
  active.forEach(e => { const k = key(e.personName); if (k) byName.set(k, [...(byName.get(k) || []), e]); });
  const node = new Map(active.map(e => [e.id, { emp: e, children: [] }]));
  const roots = [], unknownMgr = [];
  active.forEach(e => {
    const m = key(e.reportingTo) ? byName.get(key(e.reportingTo)) : null;
    const mgr = m && m.length === 1 && m[0].id !== e.id ? m[0] : null;
    if (mgr) node.get(mgr.id).children.push(node.get(e.id));
    else { roots.push(node.get(e.id)); if (key(e.reportingTo)) unknownMgr.push(e); }
  });
  // a loop (A → B → A) leaves people unreached — put them on top
  const seen = new Set();
  const walk = (n, depth) => { if (seen.has(n.emp.id)) return 0; seen.add(n.emp.id); n.depth = depth; n.size = 1 + n.children.reduce((a, c) => a + walk(c, depth + 1), 0); return n.size; };
  roots.forEach(r => walk(r, 0));
  node.forEach(n => { if (!seen.has(n.emp.id)) { roots.push(n); walk(n, 0); } });
  const sort = (list) => { list.sort((a, b) => b.size - a.size || a.emp.personName.localeCompare(b.emp.personName)); list.forEach(n => sort(n.children)); };
  sort(roots);
  // people with a team first, then those standing alone
  return { roots, unknownMgr, total: active.length };
}

function Box({ n, open, onToggle, hit }) {
  const e = n.emp;
  return (
    <div onClick={n.children.length ? onToggle : undefined}
      className={cx("relative bg-white border rounded-lg shadow-sm px-3 py-2.5 flex items-center gap-2.5 w-[210px] transition-colors",
        n.children.length ? "cursor-pointer hover:border-blue-300" : "",
        hit ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200")}>
      <div className={cx("w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0", COLORS[n.depth % COLORS.length])}>
        {initials(e.personName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-bold text-slate-800 leading-tight truncate" title={e.personName}>{e.personName}</p>
        <p className="text-[10.5px] text-slate-500 leading-tight mt-0.5 truncate" title={e.designation}>{e.designation || "—"}</p>
        {e.department && <p className="text-[10px] text-slate-400 leading-tight truncate">{e.department}</p>}
      </div>
      {n.children.length > 0 && (
        <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-bold">
          {open ? <Minus size={9} /> : <Plus size={9} />}{n.size - 1}
        </span>
      )}
    </div>
  );
}

function Branch({ n, openSet, toggle, hits }) {
  const open = openSet.has(n.emp.id);
  const kids = open ? n.children : [];
  return (
    <div className="inline-flex flex-col items-center">
      <Box n={n} open={open} onToggle={() => toggle(n.emp.id)} hit={hits.has(n.emp.id)} />
      {kids.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="w-px h-6 bg-slate-300" />
          <div className="flex items-start">
            {kids.map((c, i) => (
              <div key={c.emp.id} className="flex flex-col items-center">
                <div className="relative flex justify-center w-full">
                  {kids.length > 1 && <div className="absolute bg-slate-300 h-px top-0" style={{ left: i === 0 ? "50%" : 0, right: i === kids.length - 1 ? "50%" : 0 }} />}
                  <div className="w-px h-6 bg-slate-300" />
                </div>
                <div className="px-2"><Branch n={c} openSet={openSet} toggle={toggle} hits={hits} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgChart() {
  const orgId = useOrgId();
  const [emps, setEmps] = useState(null);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [openSet, setOpenSet] = useState(new Set());

  useEffect(() => {
    fetch(scopedUrl(`${API}/api/organisation/employees`, orgId), { headers: { Authorization: `Bearer ${TOKEN()}` } })
      .then(r => r.json()).then(d => setEmps(d.contacts || [])).catch(() => setEmps([]));
  }, [orgId]);

  const scoped = useMemo(() => (emps || []).filter(e => !dept || e.department === dept), [emps, dept]);
  const { roots, unknownMgr, total } = useMemo(() => buildTree(scoped), [scoped]);
  const teams = roots.filter(r => r.children.length);
  const loners = roots.filter(r => !r.children.length);
  const depts = useMemo(() => [...new Set((emps || []).map(e => e.department).filter(Boolean))].sort(), [emps]);

  // open the top two levels at first
  useEffect(() => {
    const s = new Set();
    teams.forEach(r => { s.add(r.emp.id); r.children.forEach(c => c.children.length && s.add(c.emp.id)); });
    setOpenSet(s);
  }, [roots]);

  // search: mark matches and open the way down to them
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    const set = new Set();
    if (!t) return set;
    const visit = (n, path) => {
      const match = `${n.emp.personName} ${n.emp.designation}`.toLowerCase().includes(t);
      if (match) { set.add(n.emp.id); path.forEach(id => set.add(`open:${id}`)); }
      n.children.forEach(c => visit(c, [...path, n.emp.id]));
    };
    roots.forEach(r => visit(r, []));
    return set;
  }, [q, roots]);
  useEffect(() => {
    if (!hits.size) return;
    setOpenSet(s => { const n = new Set(s); hits.forEach(h => String(h).startsWith("open:") && n.add(String(h).slice(5))); return n; });
  }, [hits]);

  const toggle = (id) => setOpenSet(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const all = (open) => {
    if (!open) return setOpenSet(new Set());
    const s = new Set(); const walk = (n) => { if (n.children.length) { s.add(n.emp.id); n.children.forEach(walk); } }; roots.forEach(walk); setOpenSet(s);
  };

  if (!emps) return <BrandLoader />;

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100">
        <div className="relative w-56">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a person…"
            className="w-full h-8 pl-8 pr-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <select value={dept} onChange={e => setDept(e.target.value)} className="h-8 px-2.5 text-sm border border-slate-200 rounded-md bg-white">
          <option value="">All departments</option>
          {depts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <button onClick={() => all(true)} className="h-8 px-3 text-xs font-semibold rounded-md border border-slate-200 hover:bg-slate-50">Open all</button>
        <button onClick={() => all(false)} className="h-8 px-3 text-xs font-semibold rounded-md border border-slate-200 hover:bg-slate-50">Close all</button>
        <span className="ml-auto text-xs text-slate-500">{total} people · {teams.length} top manager{teams.length === 1 ? "" : "s"}</span>
      </div>

      {unknownMgr.length > 0 && (
        <p className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span><b>{unknownMgr.length}</b> {unknownMgr.length === 1 ? "person's" : "people's"} Reporting Manager isn't an employee here (or the name matches two people), so they're shown on top:{" "}
            {unknownMgr.slice(0, 6).map(e => `${e.personName} → ${e.reportingTo}`).join(", ")}{unknownMgr.length > 6 ? "…" : ""}. Fix it in the employee's form.</span>
        </p>
      )}

      {!total ? (
        <p className="py-14 text-center text-sm text-slate-400">No employees in this company yet.</p>
      ) : (
        <div className="overflow-auto px-5 py-6">
          <div className="flex items-start gap-10 w-max mx-auto">
            {teams.map(r => <Branch key={r.emp.id} n={r} openSet={openSet} toggle={toggle} hits={hits} />)}
          </div>
        </div>
      )}

      {loners.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-4">
          <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <Users size={12} /> No reporting manager set · {loners.length}
          </p>
          <div className="flex flex-wrap gap-2">
            {loners.map(r => (
              <span key={r.emp.id} className={cx("px-2.5 py-1 rounded-md border text-[12px]", hits.has(r.emp.id) ? "border-amber-400 bg-amber-50" : "border-slate-200 text-slate-600")} title={r.emp.designation}>
                {r.emp.personName}{r.emp.designation ? <span className="text-slate-400"> · {r.emp.designation}</span> : null}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
