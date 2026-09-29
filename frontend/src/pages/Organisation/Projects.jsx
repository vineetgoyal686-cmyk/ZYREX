import React, { useState, useEffect } from "react";
import { Search, Edit2, Trash2, X, Loader2, MapPin, CalendarDays, Building } from "lucide-react";
import api from "../../utils/api";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { useOrgId, scopedUrl } from "./orgScope";

// Organisation > Projects — each organisation's own projects (basic
// details only). Petty Cash picks its Entity + Project from these.

const STATUSES = [
  { value: "active",    label: "Active",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "on_hold",   label: "On Hold",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "completed", label: "Completed", cls: "bg-slate-100 text-slate-600 border-slate-200" },
];
const statusOf = (v) => STATUSES.find(s => s.value === v) || STATUSES[0];

const EMPTY = {
  project_code: "", project_name: "", client_name: "", city: "", state: "", address: "",
  start_date: "", end_date: "", status: "active", remarks: "",
};

const INP = "w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white";
const LBL = "text-xs font-semibold text-slate-600 block mb-1";

const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
const apiError = (err, fallback) => err?.response?.data?.error || err?.message || fallback;

function ProjectModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(() => item
    ? Object.fromEntries(Object.keys(EMPTY).map(k => [k, k.endsWith("_date") ? String(item[k] || "").slice(0, 10) : (item[k] ?? EMPTY[k])]))
    : EMPTY);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.project_name.trim()) return setErr("Project name is required");
    if (form.start_date && form.end_date && form.end_date < form.start_date) return setErr("End date can't be before start date");
    setSaving(true);
    setErr("");
    try { await onSave(form); } catch (e) { setErr(apiError(e, "Failed to save")); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-[15px] font-bold text-slate-800">{item ? "Edit Project" : "Add Project"}</p>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={LBL}>Project Name *</label>
            <input value={form.project_name} onChange={set("project_name")} autoFocus className={INP} placeholder="e.g. Wave One" />
          </div>
          <div>
            <label className={LBL}>Project Code</label>
            <input value={form.project_code} onChange={set("project_code")} className={INP} placeholder="e.g. WO-01" />
          </div>
          <div>
            <label className={LBL}>Status</label>
            <select value={form.status} onChange={set("status")} className={INP}>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={LBL}>Client</label>
            <input value={form.client_name} onChange={set("client_name")} className={INP} placeholder="Client / customer name" />
          </div>
          <div>
            <label className={LBL}>City</label>
            <input value={form.city} onChange={set("city")} className={INP} />
          </div>
          <div>
            <label className={LBL}>State</label>
            <input value={form.state} onChange={set("state")} className={INP} />
          </div>
          <div className="sm:col-span-2">
            <label className={LBL}>Address</label>
            <textarea value={form.address} onChange={set("address")} rows={2} className={`${INP} resize-none`} />
          </div>
          <div>
            <label className={LBL}>Start Date</label>
            <input type="date" value={form.start_date} onChange={set("start_date")} className={INP} />
          </div>
          <div>
            <label className={LBL}>End Date</label>
            <input type="date" value={form.end_date} onChange={set("end_date")} className={INP} />
          </div>
          <div className="sm:col-span-2">
            <label className={LBL}>Remarks</label>
            <textarea value={form.remarks} onChange={set("remarks")} rows={2} className={`${INP} resize-none`} />
          </div>
        </div>
        {err && <p className="text-red-500 text-xs px-6 pb-2">{err}</p>}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />} {item ? "Save Changes" : "Add Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Projects({ actionsRef, onChange }) {
  const { canEdit, canDelete } = useModulePermissions("org_projects");
  const orgId = useOrgId();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [modal, setModal]       = useState(null); // "add" | project row

  const fetchProjects = async () => {
    try {
      const { data } = await api.get(scopedUrl("/api/organisation/projects", orgId));
      const list = data.projects || [];
      setProjects(list);
      onChange?.(list);
    } catch (err) { alert(apiError(err, "Failed to load projects")); }
    setLoading(false);
  };
  useEffect(() => { fetchProjects(); }, [orgId]);

  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = { openAdd: () => setModal("add") };
    return () => { actionsRef.current = {}; };
  });

  const save = async (form) => {
    if (modal === "add") await api.post("/api/organisation/projects", { ...form, company_id: orgId });
    else await api.put(`/api/organisation/projects/${modal.id}`, form);
    setModal(null);
    fetchProjects();
  };

  const del = async (p) => {
    if (!window.confirm(`Delete project "${p.project_name}"?`)) return;
    try {
      await api.delete(`/api/organisation/projects/${p.id}`);
      fetchProjects();
    } catch (err) { alert(apiError(err, "Failed to delete")); }
  };

  const q = search.trim().toLowerCase();
  const rows = projects.filter(p => !q || [p.project_name, p.project_code, p.client_name, p.city].some(v => String(v || "").toLowerCase().includes(q)));

  return (
    <>
      <div className="bg-white rounded border border-slate-200 overflow-hidden">
        <div className="flex items-center px-5 py-3.5 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 w-56 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500" style={{ background: "rgb(243,243,245)" }}>
                <th className="px-4 py-3 text-left font-semibold w-14">S.No</th>
                <th className="px-4 py-3 text-left font-semibold">Project</th>
                <th className="px-4 py-3 text-left font-semibold">Client</th>
                <th className="px-4 py-3 text-left font-semibold">Location</th>
                <th className="px-4 py-3 text-left font-semibold">Duration</th>
                <th className="px-4 py-3 text-center font-semibold w-28">Status</th>
                <th className="px-4 py-3 text-right font-semibold w-20">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center"><Loader2 size={16} className="inline animate-spin text-slate-400" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs">
                  {search ? "No projects match your search" : "No projects yet — add one above"}
                </td></tr>
              ) : rows.map((p, i) => {
                const st = statusOf(p.status);
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{p.project_name}</p>
                      {p.project_code && <p className="text-[11px] text-slate-400 font-mono">{p.project_code}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.client_name ? <span className="inline-flex items-center gap-1.5"><Building size={12} className="text-slate-400" />{p.client_name}</span> : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.city || p.state ? <span className="inline-flex items-center gap-1.5"><MapPin size={12} className="text-slate-400" />{[p.city, p.state].filter(Boolean).join(", ")}</span> : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-[13px]">
                      {p.start_date || p.end_date ? (
                        <span className="inline-flex items-center gap-1.5"><CalendarDays size={12} className="text-slate-400" />
                          {fmtDate(p.start_date) || "—"} → {fmtDate(p.end_date) || "ongoing"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && <button onClick={() => setModal(p)} title="Edit" className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Edit2 size={13} /></button>}
                        {canDelete && <button onClick={() => del(p)} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={13} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <ProjectModal item={modal === "add" ? null : modal} onClose={() => setModal(null)} onSave={save} />}
    </>
  );
}
