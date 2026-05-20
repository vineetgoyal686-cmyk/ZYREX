import { useState } from "react";
import {
  ShieldCheck, Plus, Loader2, Eye, Pencil, RefreshCw, Trash2, X, Save,
} from "lucide-react";
import api from "../../../utils/api";
import {
  PROFILE_SECTIONS, DEFAULT_PROFILE_PERMS,
  GLOBAL_DASHBOARD_ORDER_KEYS, getModulePermKeysFull, makeBlankModule,
} from "../constants";
import { inp, lbl, btnPrimary } from "../utils";
import GroupedPermissions from "../components/GroupedPermissions";

export default function Designations({ showToast, designations, designationsLoading, fetchDesignations }) {
  const [showForm, setShowForm]           = useState(false);
  const [formReadOnly, setFormReadOnly]   = useState(false);
  const [editingDesg, setEditingDesg]     = useState(null);

  const [desgName, setDesgName]               = useState("");
  const [desgDescription, setDesgDescription] = useState("");
  const [desgModules, setDesgModules]         = useState([]);
  const [desgProfilePerms, setDesgProfilePerms] = useState(DEFAULT_PROFILE_PERMS);
  const [desgSaving, setDesgSaving]           = useState(false);
  const [desgProjects, setDesgProjects]       = useState([]);
  const [allProjects, setAllProjects]         = useState([]);

  const blankDesgModules = async () => {
    const { data } = await api.get("/api/users/modules/list");
    return (data.modules || []).map(makeBlankModule);
  };

  const fetchProjects = async () => {
    try {
      const { data } = await api.get("/api/projects");
      setAllProjects((data.projects || data || []).filter(p => p.isActive !== false));
    } catch { /* silent */ }
  };

  const openCreate = async () => {
    setEditingDesg(null);
    setFormReadOnly(false);
    setDesgName("");
    setDesgDescription("");
    setDesgProfilePerms(DEFAULT_PROFILE_PERMS);
    setDesgProjects([]);
    setDesgModules(await blankDesgModules());
    await fetchProjects();
    setShowForm(true);
  };

  const openEdit = async (d, readOnly = false) => {
    setEditingDesg(d);
    setFormReadOnly(!!readOnly);
    setDesgName(d.name || "");
    setDesgDescription(d.description || "");
    const draw = d.profile_permissions || {};
    if (draw.add_project && !draw.manage_project) draw.manage_project = { view: !!draw.add_project.view, add: !!draw.add_project.edit, edit: !!draw.add_project.edit, delete: false };
    if (draw.manage_user && draw.manage_user.edit !== undefined && draw.manage_user.add === undefined) { const e = !!draw.manage_user.edit; draw.manage_user = { view: !!draw.manage_user.view, add: e, edit: e, delete: e, manage_permissions: e }; }
    const dmerged = {};
    PROFILE_SECTIONS.forEach(sec => { dmerged[sec.key] = { ...Object.fromEntries(sec.keys.map(({ k }) => [k, false])), ...(draw[sec.key] || {}) }; });
    setDesgProfilePerms(dmerged);
    setDesgProjects(d.project_access || []);
    await fetchProjects();
    const fresh = await blankDesgModules();
    const stored = d.app_permissions || [];
    setDesgModules(fresh.map(m => {
      const match = stored.find(s => s.module_id === m.module_id);
      if (!match) return m;
      const merged = { ...m, ...match };
      if (m.module_key === "global_dashboard") {
        merged.order_overview_aging = !!match.order_overview_aging;
        merged.order_intake = !!match.order_intake;
        merged.order_payment = !!match.order_payment;
      }
      return merged;
    }));
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setFormReadOnly(false); };

  const updateDesgModule = (modId, key, val) =>
    setDesgModules(prev => prev.map(m => {
      if (m.module_id !== modId) return m;
      const updated = { ...m, [key]: val };
      if (val === true && key !== "can_view") updated.can_view = true;
      if (m.module_key === "global_dashboard" && key === "can_view" && !val) {
        GLOBAL_DASHBOARD_ORDER_KEYS.forEach((k) => { updated[k] = false; });
      }
      return updated;
    }));

  const isAllChecked = () => {
    if (!desgModules.length) return false;
    const profileFull = PROFILE_SECTIONS.every(s => s.keys.every(({ k }) => desgProfilePerms[s.key]?.[k]));
    const modulesFull = desgModules.every(m => getModulePermKeysFull(m).every(k => m[k]));
    return profileFull && modulesFull;
  };

  const setAllPerms = (checked) => {
    const nextProfile = {};
    PROFILE_SECTIONS.forEach(s => {
      nextProfile[s.key] = Object.fromEntries(s.keys.map(({ k }) => [k, checked]));
    });
    setDesgProfilePerms(nextProfile);
    setDesgModules(prev => prev.map(m => {
      const keys = getModulePermKeysFull(m);
      return { ...m, ...Object.fromEntries(keys.map(k => [k, checked])) };
    }));
  };

  const saveDesignation = async () => {
    if (formReadOnly) return;
    if (!desgName.trim()) { showToast("Designation name is required", "error"); return; }
    setDesgSaving(true);
    try {
      const payload = {
        name: desgName.trim(),
        description: desgDescription.trim() || null,
        app_permissions: desgModules,
        profile_permissions: desgProfilePerms,
        project_access: desgProjects,
      };
      if (editingDesg) {
        await api.put(`/api/designations/${editingDesg.id}`, payload);
        showToast("Designation updated");
      } else {
        await api.post("/api/designations", payload);
        showToast("Designation created");
      }
      closeForm();
      fetchDesignations();
    } catch (err) {
      showToast(err.response?.data?.error || "Save failed", "error");
    } finally { setDesgSaving(false); }
  };

  const deleteDesignation = async (id) => {
    if (!confirm("Delete this designation? Users currently assigned will keep their permissions but lose the template link.")) return;
    try {
      await api.delete(`/api/designations/${id}`);
      showToast("Designation deleted");
      fetchDesignations();
    } catch (err) {
      showToast(err.response?.data?.error || "Delete failed", "error");
    }
  };

  const syncDesignation = async (d) => {
    if (!confirm(`Re-apply "${d.name}" template to ALL users currently assigned this designation? This will overwrite their custom permissions.`)) return;
    try {
      const { data } = await api.post(`/api/designations/${d.id}/sync`);
      showToast(`Synced ${data.synced} ${data.synced === 1 ? "user" : "users"}`);
    } catch (err) {
      showToast(err.response?.data?.error || "Sync failed", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Table card */}
      {!showForm && (
        <div className="bg-white rounded-none shadow-sm border border-slate-100 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-200">
            <h2 className="font-sans text-lg sm:text-xl font-bold text-slate-800 tracking-normal antialiased">
              Designation Management
            </h2>
            <button type="button" onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#3b4df2] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#2f40d4] active:bg-[#2838c4]">
              <Plus size={18} strokeWidth={2.5} className="shrink-0" aria-hidden />
              Add designation
            </button>
          </div>

          {designationsLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
              <Loader2 className="animate-spin mr-2" size={16} /> Loading...
            </div>
          ) : designations.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-sm p-10 text-center">
              <ShieldCheck size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-500">No designations yet</p>
              <p className="text-[12px] text-slate-400 mt-1">Create templates like &quot;Site Engineer&quot;, &quot;Procurement Manager&quot; to speed up user onboarding.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-sm border border-slate-300">
              <table className="w-full min-w-[760px] text-sm border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-center w-12">S.No</th>
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-left">Name</th>
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-left whitespace-nowrap">Created date</th>
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-left whitespace-nowrap">Created By</th>
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-right whitespace-nowrap">Allow access</th>
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {designations.map((d, idx) => {
                    const accessCount = (d.app_permissions || []).filter((p) => p.can_view).length;
                    const created = d.created_at ? new Date(d.created_at).toLocaleDateString() : "—";
                    const createdBy = (d.created_by_name && String(d.created_by_name).trim()) || "—";
                    const actBtn = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 transition shrink-0";
                    return (
                      <tr key={d.id} className="bg-white hover:bg-slate-50/80">
                        <td className="border border-slate-300 px-3 py-2 align-middle text-center font-semibold text-slate-600 tabular-nums">{idx + 1}</td>
                        <td className="border border-slate-300 px-3 py-2 align-middle">
                          <p className="font-semibold text-slate-800">{d.name}</p>
                          {d.description ? <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 max-w-md">{d.description}</p> : null}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 align-middle text-slate-700 whitespace-nowrap tabular-nums">{created}</td>
                        <td className="border border-slate-300 px-3 py-2 align-middle text-slate-700">{createdBy}</td>
                        <td className="border border-slate-300 px-3 py-2 align-middle text-right font-semibold text-slate-800 tabular-nums">{accessCount}</td>
                        <td className="border border-slate-300 px-3 py-2 align-middle">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button type="button" title="View" onClick={() => openEdit(d, true)} className={actBtn}><Eye size={15} strokeWidth={2} /></button>
                            <button type="button" title="Edit" onClick={() => openEdit(d, false)} className={actBtn}><Pencil size={15} strokeWidth={2} /></button>
                            <button type="button" title="Sync to assigned users" onClick={() => syncDesignation(d)} className={`${actBtn} hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50/80`}><RefreshCw size={15} strokeWidth={2} /></button>
                            <button type="button" title="Delete" onClick={() => deleteDesignation(d.id)} className={`${actBtn} hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/80`}><Trash2 size={15} strokeWidth={2} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Inline form */}
      {showForm && (
        <div className="bg-white rounded-none shadow-sm border border-slate-100">

          {/* Header */}
          <div className="sticky top-0 z-10 px-6 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 bg-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 bg-indigo-100 rounded-sm flex items-center justify-center text-indigo-600 shrink-0">
                <ShieldCheck size={16} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  {formReadOnly ? "View Designation" : editingDesg ? "Edit Designation" : "New Designation"}
                </h3>
                <p className="text-[11px] text-slate-400 leading-tight">
                  {formReadOnly ? "Read-only preview" : "Define a reusable permission set"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {formReadOnly ? (
                <button onClick={closeForm}
                  className="h-8 px-4 rounded-sm border border-slate-300 text-slate-600 text-[12px] font-semibold hover:bg-slate-50 transition-colors">
                  Close
                </button>
              ) : (
                <>
                  <button onClick={closeForm}
                    className="h-8 px-4 rounded-sm border border-slate-300 text-slate-600 text-[12px] font-semibold hover:bg-slate-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveDesignation} disabled={desgSaving}
                    className="h-8 px-4 rounded-sm bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1.5 disabled:opacity-60">
                    {desgSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    {editingDesg ? "Update" : "Create"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-64 shrink-0">
                <label className={lbl}>Designation Name *</label>
                <input value={desgName} onChange={e => setDesgName(e.target.value)} className={inp}
                  disabled={formReadOnly} placeholder="e.g. Site Engineer" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className={lbl}>Description (optional)</label>
                <input value={desgDescription} onChange={e => setDesgDescription(e.target.value)} className={inp}
                  disabled={formReadOnly} placeholder="Brief role description..." />
              </div>
              {!formReadOnly && (
                <div className="flex items-center gap-2 shrink-0 pb-[1px]">
                  <button type="button" onClick={() => setAllPerms(true)}
                    className="h-[38px] px-4 rounded-sm bg-indigo-600 text-white text-[12px] font-bold hover:bg-indigo-700 transition-colors">
                    Select All
                  </button>
                  <button type="button" onClick={() => setAllPerms(false)}
                    className="h-[38px] px-4 rounded-sm border border-slate-300 bg-white text-slate-600 text-[12px] font-bold hover:bg-slate-50 hover:border-slate-400 transition-colors">
                    Clear All
                  </button>
                </div>
              )}
            </div>

            <div>
              <GroupedPermissions
                modules={desgModules}
                onChange={updateDesgModule}
                readOnly={formReadOnly}
                allProjects={allProjects}
                selectedProjects={desgProjects}
                onProjectChange={setDesgProjects}
              />
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
