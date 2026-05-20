import React, { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, LayoutList, Share2, Search, Edit2 } from "lucide-react";
import { cx } from "./helpers";
import { loadDivisions } from "./Divisions";
import { loadSubDepts } from "./SubDepts";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";

const TYPE_BADGE = {
  division:       { label: "Division",  cls: "bg-purple-100 text-purple-700" },
  department:     { label: "Dept",      cls: "bg-blue-100 text-blue-700"   },
  sub_department: { label: "Sub-dept",  cls: "bg-slate-100 text-slate-600" },
};

/* ─── Chart node ────────────────────────────────────────── */
function ChartNode({ node, depth }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children?.length > 0;
  const border =
    depth === 0 ? "border-purple-300 bg-purple-50"
    : depth === 1 ? "border-blue-200 bg-blue-50"
    : "border-slate-200 bg-white";

  return (
    <div className="flex flex-col items-center gap-0">
      <div
        onClick={() => hasChildren && setOpen(v => !v)}
        className={cx("border rounded px-4 py-2 min-w-[120px] text-center shadow-sm", hasChildren && "cursor-pointer", border)}>
        <p className="text-xs font-bold text-slate-800 leading-tight">{node.name}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{node.uid}</p>
      </div>
      {hasChildren && open && (
        <>
          <div className="w-px h-4 bg-slate-300" />
          <div className="flex items-start gap-6">
            {node.children.map(child => (
              <div key={child.uid} className="flex flex-col items-center">
                <div className="w-px h-4 bg-slate-300" />
                <ChartNode node={child} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Main ──────────────────────────────────────────────── */
export default function Structure() {
  const [view, setView]       = useState("table");
  const [depts, setDepts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState({});   // key → bool (false = collapsed)

  useEffect(() => {
    fetch(`${API}/api/departments`, { headers: { Authorization: `Bearer ${TOKEN()}` } })
      .then(r => r.json())
      .then(j => setDepts(j.departments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const divisions = loadDivisions();
  const subdepts  = loadSubDepts();

  /* ── build flat rows ─────────────────────────────────── */
  const buildRows = () => {
    const rows = [];
    let sno = 0;

    divisions.forEach(div => {
      sno++;
      const divKey = `div-${div.id}`;
      const linkedDepts = depts.filter(d => d.division_id === div.id || d.division_id === String(div.id));
      rows.push({ key: divKey, uid: div.div_id, name: div.name, head: div.head || "—", status: div.status, type: "division", sno, hasChildren: linkedDepts.length > 0, depth: 0, parentKey: null });

      if (expanded[divKey] === false) return;   // collapsed

      linkedDepts.forEach(dept => {
        sno++;
        const deptKey = `dept-${dept.id}`;
        const linkedSubs = subdepts.filter(s => s.dept_id === dept.id || s.dept_id === String(dept.id));
        rows.push({ key: deptKey, uid: dept.dept_id || "", name: dept.name, head: dept.head || "—", status: dept.status, type: "department", sno, hasChildren: linkedSubs.length > 0, depth: 1, parentKey: divKey });

        if (expanded[deptKey] === false) return;

        linkedSubs.forEach(s => {
          sno++;
          rows.push({ key: `sub-${s.id}`, uid: s.sub_id, name: s.name, head: "—", status: s.status, type: "sub_department", sno, hasChildren: false, depth: 2, parentKey: deptKey });
        });
      });
    });

    /* departments NOT linked to any division */
    const unlinkedDepts = depts.filter(d => !d.division_id || !divisions.find(dv => dv.id === d.division_id || String(dv.id) === d.division_id));
    unlinkedDepts.forEach(dept => {
      sno++;
      const deptKey = `dept-${dept.id}`;
      const linkedSubs = subdepts.filter(s => s.dept_id === dept.id || s.dept_id === String(dept.id));
      rows.push({ key: deptKey, uid: dept.dept_id || "", name: dept.name, head: dept.head || "—", status: dept.status, type: "department", sno, hasChildren: linkedSubs.length > 0, depth: 0, parentKey: null });

      if (expanded[deptKey] === false) return;

      linkedSubs.forEach(s => {
        sno++;
        rows.push({ key: `sub-${s.id}`, uid: s.sub_id, name: s.name, head: "—", status: s.status, type: "sub_department", sno, hasChildren: false, depth: 1, parentKey: deptKey });
      });
    });

    return rows;
  };

  const toggle = (key) => setExpanded(e => ({ ...e, [key]: e[key] === false ? true : false }));

  const expandAll  = () => setExpanded({});
  const collapseAll = () => {
    const keys = {};
    buildRows().forEach(r => { if (r.hasChildren) keys[r.key] = false; });
    setExpanded(keys);
  };

  /* ── chart tree ──────────────────────────────────────── */
  const buildTree = () => {
    const unlinked = depts.filter(d => !d.division_id);
    const tree = [
      ...divisions.map(div => ({
        uid: div.div_id, name: div.name, type: "division",
        children: depts.filter(d => d.division_id === div.id || d.division_id === String(div.id)).map(dept => ({
          uid: dept.dept_id, name: dept.name, type: "department",
          children: subdepts.filter(s => s.dept_id === dept.id || s.dept_id === String(dept.id)).map(s => ({
            uid: s.sub_id, name: s.name, type: "sub_department", children: [],
          })),
        })),
      })),
      ...unlinked.map(dept => ({
        uid: dept.dept_id, name: dept.name, type: "department",
        children: subdepts.filter(s => s.dept_id === dept.id || s.dept_id === String(dept.id)).map(s => ({
          uid: s.sub_id, name: s.name, type: "sub_department", children: [],
        })),
      })),
    ];
    return tree;
  };

  if (loading) return (
    <div className="bg-white rounded border border-slate-200 px-4 py-12 text-center text-slate-400 text-sm">Loading…</div>
  );

  const rows = buildRows().filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.uid.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded border border-slate-200 overflow-hidden">
      {/* toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 gap-3">
        <div className="flex items-center gap-3">
          {view === "table" && (
            <>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 w-48 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <span className="text-slate-200">|</span>
              <button onClick={expandAll}  className="text-xs text-blue-600 font-semibold hover:underline">Expand All</button>
              <button onClick={collapseAll} className="text-xs text-slate-500 font-semibold hover:underline">Collapse All</button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded p-0.5">
          <button onClick={() => setView("table")}
            className={cx("flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors",
              view === "table" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700")}>
            <LayoutList size={13} /> Table
          </button>
          <button onClick={() => setView("chart")}
            className={cx("flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors",
              view === "chart" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700")}>
            <Share2 size={13} /> Chart
          </button>
        </div>
      </div>

      {/* Table view */}
      {view === "table" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500" style={{ background: "rgb(243,243,245)" }}>
                <th className="px-4 py-3 text-left font-semibold w-12">S.No</th>
                <th className="px-4 py-3 text-left font-semibold w-28">ID</th>
                <th className="px-4 py-3 text-left font-semibold w-28">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Head</th>
                <th className="px-4 py-3 text-left font-semibold w-24">Status</th>
                <th className="px-4 py-3 text-right font-semibold w-20">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-xs">
                  {search ? "No results" : "No data — add Divisions, Departments and Sub-Depts first"}
                </td></tr>
              ) : rows.map(row => {
                const badge = TYPE_BADGE[row.type];
                const isCollapsed = expanded[row.key] === false;
                return (
                  <tr key={row.key} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{row.sno}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs font-semibold text-slate-600">{row.uid}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5" style={{ paddingLeft: row.depth * 12 }}>
                        {row.hasChildren ? (
                          <button onClick={() => toggle(row.key)}
                            className="w-5 h-5 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-400 shrink-0 transition-colors">
                            {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                          </button>
                        ) : <span className="w-5 shrink-0" />}
                        <span className={cx("px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap", badge.cls)}>
                          {badge.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{row.name}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{row.head}</td>
                    <td className="px-4 py-2.5">
                      <span className={cx("px-2 py-0.5 rounded-full text-[11px] font-semibold",
                        row.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                        {row.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button className="text-slate-400 hover:text-blue-600 transition-colors"><Edit2 size={13} /></button>
                        <button className="text-slate-400 hover:text-red-500 transition-colors text-sm font-bold">×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Chart view */}
      {view === "chart" && (
        <div className="p-8 overflow-x-auto">
          {buildTree().length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">No data yet</p>
          ) : (
            <div className="flex gap-16 justify-center flex-wrap">
              {buildTree().map(node => (
                <ChartNode key={node.uid} node={node} depth={0} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
