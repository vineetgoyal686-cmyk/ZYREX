import React, { useState, useEffect, useRef } from "react";
import {
  Users, UserPlus, ShieldCheck, Loader2, Save, Trash2,
  Mail, Phone, Building2, Briefcase, CheckCircle2, XCircle,
  Pencil, LayoutDashboard, ShieldAlert, SendHorizonal, Camera, ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../../utils/api";
import {
  ROLE_BADGE, PROFILE_SECTIONS, DEFAULT_PROFILE_PERMS, ROLE_DEFAULT_PERMS,
  MODULE_PERM_KEYS, GLOBAL_DASHBOARD_ORDER_KEYS,
  getModulePermKeysFull, makeBlankModule,
} from "../constants";
import { inp, lbl, btnPrimary, secHeader, secTitle, resizeSignature } from "../utils";
import GroupedPermissions from "../components/GroupedPermissions";
import SearchableTemplateSelect from "../components/SearchableTemplateSelect";
import { API } from "../constants";

export default function UserManagement({
  currentUser, isGlobalAdmin, pp,
  showToast, onProfileUpdate,
  designations, fetchDesignations,
}) {
  const isAdminOrAbove = ["global_admin", "super_admin", "admin"].includes(currentUser.role);

  const canManage = (viewerRole, targetRole, targetId) => {
    if (targetRole === "global_admin" && targetId !== currentUser.id) return false;
    if (targetId === currentUser.id && viewerRole !== "global_admin") return false;
    if (viewerRole === "global_admin") return true;
    if (viewerRole === "super_admin") return ["admin", "user"].includes(targetRole);
    if (viewerRole === "admin") return targetRole === "user";
    return false;
  };

  const getManageableRoles = (viewerRole) => {
    if (viewerRole === "global_admin") return ["super_admin", "admin", "user"];
    if (viewerRole === "super_admin") return ["admin", "user"];
    if (viewerRole === "admin") return ["user"];
    return [];
  };

  /* Team */
  const [members,     setMembers]     = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [viewType,    setViewType]    = useState("list");
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [confirmRoleChange, setConfirmRoleChange] = useState(null);
  const [loading, setLoading] = useState(false);

  /* Permissions panel */
  const [permUser,             setPermUser]             = useState(null);
  const [permissions,          setPermissions]          = useState([]);
  const [editingProfilePerms,  setEditingProfilePerms]  = useState(DEFAULT_PROFILE_PERMS);
  const [permLoading,          setPermLoading]          = useState(false);
  const [pickedTemplate,       setPickedTemplate]       = useState(null);
  const [permFilter,           setPermFilter]           = useState("all");
  const [editingAllowedProjects, setEditingAllowedProjects] = useState([]);
  const [allProjects,          setAllProjects]          = useState([]);
  const [permAccessProfileIds, setPermAccessProfileIds] = useState([]);

  /* Add user */
  const [showAddUser,           setShowAddUser]           = useState(false);
  const [newUser,               setNewUser]               = useState({ name: "", email: "", contact_no: "", designation: "", department: "", role: "user" });
  const [newUserAccessProfileIds, setNewUserAccessProfileIds] = useState([]);
  const [newUserProfilePerms,   setNewUserProfilePerms]   = useState(DEFAULT_PROFILE_PERMS);
  const [newUserAllowedProjects,setNewUserAllowedProjects]= useState([]);
  const [newUserModules,        setNewUserModules]        = useState([]);
  const [modulesLoading,        setModulesLoading]        = useState(false);
  const [newUserSignature,      setNewUserSignature]      = useState(null);
  const [newUserSigLoading,     setNewUserSigLoading]     = useState(false);
  const [allPermsSelected,      setAllPermsSelected]      = useState(false);
  const newUserSigRef = useRef();

  /* Edit member */
  const [editingMember,         setEditingMember]         = useState(null);
  const [editForm,              setEditForm]              = useState({ name: "", contact_no: "", designation: "", department: "" });
  const [editAccessProfileIds,  setEditAccessProfileIds]  = useState([]);
  const [editSaving,            setEditSaving]            = useState(false);

  /* Lock body scroll when modal open */
  useEffect(() => {
    document.body.style.overflow = showAddUser ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showAddUser]);

  useEffect(() => { fetchTeam(); }, []);

  useEffect(() => {
    fetch(`${API}/api/projects`).then(r => r.json())
      .then(d => setAllProjects(d.projects || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (showAddUser) {
      if (newUserModules.length === 0) fetchModulesForNewUser();
      if (designations.length === 0) fetchDesignations();
    }
  }, [showAddUser]);

  const fetchTeam = async () => {
    setTeamLoading(true);
    try {
      const { data } = await api.get("/api/users");
      const users = data.users || [];
      setMembers(users);
      const fresh = users.find(u => u.id === currentUser.id);
      if (fresh && (fresh.role !== currentUser.role || fresh.name !== currentUser.name)) {
        const updatedUser = { ...currentUser, ...fresh };
        localStorage.setItem("bms_user", JSON.stringify(updatedUser));
        onProfileUpdate?.(updatedUser);
      }
    } catch { showToast("Failed to load team", "error"); }
    finally { setTeamLoading(false); }
  };

  const fetchModulesForNewUser = async () => {
    setModulesLoading(true);
    try {
      const { data } = await api.get("/api/users/modules/list");
      setNewUserModules((data.modules || []).map(makeBlankModule));
    } catch { /* silent */ }
    finally { setModulesLoading(false); }
  };

  const applyAccessProfiles = (profileIds) => {
    const profiles = designations.filter(d => profileIds.includes(d.id));
    if (!profiles.length) {
      setNewUserProfilePerms(DEFAULT_PROFILE_PERMS);
      setNewUserModules(prev => prev.map(m => {
        const blank = { ...m, can_view: false, can_add: false, can_edit: false, can_delete: false, can_trash: false, can_bulk_upload: false, can_export: false, can_log: false, can_download_document: false, can_take_action: false, can_submit: false, can_approve: false, can_issue: false, can_recall: false, can_reject: false, can_revert: false, can_request: false, can_withdraw: false, can_cancel: false, can_manage_amend: false };
        if (m.module_key === "global_dashboard") GLOBAL_DASHBOARD_ORDER_KEYS.forEach(k => { blank[k] = false; });
        return blank;
      }));
      return;
    }
    // Merge profile_permissions — union
    const mergedPP = JSON.parse(JSON.stringify(DEFAULT_PROFILE_PERMS));
    profiles.forEach(p => {
      const pp = p.profile_permissions || {};
      PROFILE_SECTIONS.forEach(sec => {
        sec.keys.forEach(({ k }) => { if (pp[sec.key]?.[k]) mergedPP[sec.key][k] = true; });
      });
    });
    setNewUserProfilePerms(mergedPP);
    // Merge app_permissions — union per module
    const allStored = profiles.flatMap(p => p.app_permissions || []);
    setNewUserModules(prev => prev.map(m => {
      const matches = allStored.filter(s => s.module_id === m.module_id);
      if (!matches.length) {
        const blank = { ...m, can_view: false, can_add: false, can_edit: false, can_delete: false, can_trash: false, can_bulk_upload: false, can_export: false, can_log: false, can_download_document: false, can_take_action: false, can_submit: false, can_approve: false, can_issue: false, can_recall: false, can_reject: false, can_revert: false, can_request: false, can_withdraw: false, can_cancel: false, can_manage_amend: false };
        if (m.module_key === "global_dashboard") GLOBAL_DASHBOARD_ORDER_KEYS.forEach(k => { blank[k] = false; });
        return blank;
      }
      const merged = { ...m };
      getModulePermKeysFull(m).forEach(k => { merged[k] = matches.some(x => x[k]); });
      if (m.module_key === "global_dashboard") {
        merged.order_overview_aging = matches.some(x => x.order_overview_aging);
        merged.order_intake         = matches.some(x => x.order_intake);
        merged.order_payment        = matches.some(x => x.order_payment);
      }
      return merged;
    }));
  };

  const updateNewUserModule = (modId, key, val) =>
    setNewUserModules(prev => prev.map(m => {
      if (m.module_id !== modId) return m;
      const updated = { ...m, [key]: val };
      if (val === true && key !== "can_view") updated.can_view = true;
      if (m.module_key === "global_dashboard" && key === "can_view" && !val) {
        GLOBAL_DASHBOARD_ORDER_KEYS.forEach((k) => { updated[k] = false; });
      }
      return updated;
    }));

  const handleAllPerms = (checked) => {
    setAllPermsSelected(checked);
    setNewUserModules(prev => prev.map(m => {
      const keys = getModulePermKeysFull(m);
      return { ...m, ...Object.fromEntries(keys.map(k => [k, checked])) };
    }));
    const nextProfilePerms = {};
    Object.keys(DEFAULT_PROFILE_PERMS).forEach(k => { nextProfilePerms[k] = { view: checked, edit: checked }; });
    setNewUserProfilePerms(nextProfilePerms);
  };

  const handleNewUserSigChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setNewUserSigLoading(true);
    try {
      const base64 = await resizeSignature(file);
      setNewUserSignature(base64);
    } catch { showToast("Signature preview failed", "error"); }
    finally { setNewUserSigLoading(false); }
  };

  const addMember = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const { data } = await api.post("/api/users", { ...newUser, access_profile_ids: newUserAccessProfileIds, designation_id: newUserAccessProfileIds[0] || null, profile_permissions: { ...newUserProfilePerms, allowed_projects: newUserAllowedProjects }, createdById: u.id || "", createdByName: u.name || "" });
      const userId = data.user?.id;
      const newMember = data.user;

      const hasPerms = userId && newUserModules.some(m =>
        MODULE_PERM_KEYS.some(k => m[k.key]) || GLOBAL_DASHBOARD_ORDER_KEYS.some(k => m[k])
      );

      // Run permissions + signature in parallel instead of sequentially
      await Promise.all([
        hasPerms ? api.put(`/api/users/${userId}/permissions`, { permissions: newUserModules }) : Promise.resolve(),
        (userId && newUserSignature) ? api.post(`/api/users/${userId}/signature`, { signature: newUserSignature }).catch(() => {}) : Promise.resolve(),
      ]);

      // Optimistically add to list — avoids full fetchTeam() round-trip
      if (newMember) {
        setMembers(prev => [newMember, ...prev]);
      }

      setNewUser({ name: "", email: "", contact_no: "", designation: "", department: "", role: "user" });
      setNewUserAccessProfileIds([]);
      setNewUserProfilePerms(DEFAULT_PROFILE_PERMS);
      setNewUserAllowedProjects([]);
      setNewUserSignature(null);
      setAllPermsSelected(false);
      setNewUserModules(prev => prev.map(m => {
        const cleared = {
          can_view: false, can_add: false, can_edit: false, can_delete: false, can_trash: false, can_bulk_upload: false, can_export: false, can_log: false, can_download_document: false, can_take_action: false, can_submit: false, can_approve: false, can_issue: false, can_recall: false, can_reject: false, can_revert: false, can_request: false, can_withdraw: false, can_cancel: false, can_manage_amend: false,
        };
        if (m.module_key === "global_dashboard") {
          GLOBAL_DASHBOARD_ORDER_KEYS.forEach((k) => { cleared[k] = false; });
        }
        return { ...m, ...cleared };
      }));
      setShowAddUser(false);
      showToast(`Invite sent to ${newUser.email}`);
    } catch (err) { showToast(err.response?.data?.error || "Failed to add member", "error"); }
    finally { setLoading(false); }
  };

  const toggleActive = async (member) => {
    try {
      await api.put(`/api/users/${member.id}`, { is_active: !member.is_active });
      setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, is_active: !m.is_active } : m));
      showToast(`${member.name} ${member.is_active ? "deactivated" : "activated"}`);
    } catch { showToast("Failed to update member", "error"); }
  };

  const changeRole = (member, newRole) => {
    if (newRole === member.role) { setEditingRoleId(null); return; }
    setConfirmRoleChange({ member, newRole });
    setEditingRoleId(null);
  };

  const executeRoleChange = async (resetPermissions) => {
    if (!confirmRoleChange) return;
    const { member, newRole } = confirmRoleChange;
    setLoading(true);
    try {
      await api.put(`/api/users/${member.id}`, { role: newRole, reset_permissions: resetPermissions });
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, role: newRole } : m));
      showToast(`${member.name} ka role update hua ${resetPermissions ? "with default permissions" : ""}`);
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update role", "error");
    } finally { setLoading(false); setConfirmRoleChange(null); }
  };

  const handleEditSave = async () => {
    if (!editingMember || !editForm.name.trim()) return;
    setEditSaving(true);
    try {
      await api.put(`/api/users/${editingMember.id}`, {
        name: editForm.name.trim(), contact_no: editForm.contact_no,
        designation: editForm.designation, designation_id: editAccessProfileIds[0] || null,
        access_profile_ids: editAccessProfileIds,
        department: editForm.department,
      });
      setMembers(prev => prev.map(m => m.id === editingMember.id ? { ...m, ...editForm, name: editForm.name.trim(), access_profile_ids: editAccessProfileIds } : m));
      showToast(`${editForm.name.trim()} updated`);
      setEditingMember(null);
    } catch (err) { showToast(err.response?.data?.error || "Failed to update", "error"); }
    setEditSaving(false);
  };

  const handleResendInvite = async (member) => {
    try {
      await api.post(`/api/users/${member.id}/resend-invite`);
      showToast(`Invitation resent to ${member.email}`);
    } catch (err) { showToast(err.response?.data?.error || "Failed to resend invite", "error"); }
  };

  const removeUser = async (member) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${member.name}"? This action cannot be undone.`)) return;
    try {
      await api.delete(`/api/users/${member.id}`);
      setMembers(prev => prev.filter(m => m.id !== member.id));
      showToast(`${member.name} removed`);
    } catch (err) { showToast(err.response?.data?.error || "Failed to remove user", "error"); }
  };

  const viewPerms = async (member) => {
    setPermUser(member);
    setPermFilter("all");
    setPermLoading(true);
    setPermissions([]);
    setEditingProfilePerms(DEFAULT_PROFILE_PERMS);
    setEditingAllowedProjects([]);
    setPickedTemplate(null);
    setPermAccessProfileIds(member.access_profile_ids || []);
    try {
      const { data } = await api.get(`/api/users/${member.id}/permissions`);
      const list = data.permissions || [];
      setPermissions(list.map((p) => {
        if (p.module_key !== "global_dashboard") return p;
        return { ...p, order_overview_aging: !!p.order_overview_aging, order_intake: !!p.order_intake, order_payment: !!p.order_payment };
      }));
      const raw = data.profile_permissions || {};
      setEditingAllowedProjects(raw.allowed_projects || []);
      if (raw.add_project && !raw.manage_project) raw.manage_project = { view: !!raw.add_project.view, add: !!raw.add_project.edit, edit: !!raw.add_project.edit, delete: false };
      if (raw.manage_user && raw.manage_user.edit !== undefined && raw.manage_user.add === undefined) {
        const e = !!raw.manage_user.edit;
        raw.manage_user = { view: !!raw.manage_user.view, add: e, edit: e, delete: e, manage_permissions: e };
      }
      const merged = {};
      PROFILE_SECTIONS.forEach(sec => {
        merged[sec.key] = { ...Object.fromEntries(sec.keys.map(({ k }) => [k, false])), ...(raw[sec.key] || {}) };
      });
      setEditingProfilePerms(merged);
    } catch { showToast("Failed to load permissions", "error"); }
    finally { setPermLoading(false); }
  };

  const closePermsPanel = () => {
    if (pickedTemplate && !window.confirm("Template changes are not saved yet. Go back anyway?")) return;
    setPickedTemplate(null);
    setPermUser(null);
  };

  const updatePerm = (moduleId, key, value) =>
    setPermissions((prev) => prev.map((p) => {
      if (p.module_id !== moduleId) return p;
      const updated = { ...p, [key]: value };
      const impliesView = ["can_add","can_edit","can_delete","can_trash","can_bulk_upload","can_export","can_download_document","can_log","can_take_action","can_submit","can_approve","can_issue","can_reject","can_revert","can_request","can_withdraw","can_recall","can_cancel","can_manage_amend", ...GLOBAL_DASHBOARD_ORDER_KEYS];
      if (value === true && impliesView.includes(key)) updated.can_view = true;
      if (p.module_key === "global_dashboard" && key === "can_view" && !value) {
        GLOBAL_DASHBOARD_ORDER_KEYS.forEach((k) => { updated[k] = false; });
      }
      return updated;
    }));

  const savePerms = async () => {
    setPermLoading(true);
    try {
      const validIds = new Set(permissions.map(p => p.module_id).filter(Boolean));
      const cleanPerms = permissions.filter(p => p.module_id && validIds.has(p.module_id));
      const designationPatch = pickedTemplate ? { designation: pickedTemplate.name, designation_id: pickedTemplate.id } : {};
      await api.put(`/api/users/${permUser.id}/permissions`, {
        permissions: cleanPerms,
        profile_permissions: { ...editingProfilePerms, allowed_projects: editingAllowedProjects },
        access_profile_ids: permAccessProfileIds,
        designation_id: permAccessProfileIds[0] || null,
        ...designationPatch,
      });
      if (permUser.id === currentUser.id) {
        const updatedSelf = { ...currentUser, app_permissions: cleanPerms, profile_permissions: editingProfilePerms };
        localStorage.setItem("bms_user", JSON.stringify(updatedSelf));
        onProfileUpdate?.(updatedSelf);
      }
      if (pickedTemplate) {
        setMembers(prev => prev.map(m => m.id === permUser.id ? { ...m, ...designationPatch } : m));
        setPermUser(prev => prev ? { ...prev, ...designationPatch } : prev);
        if (permUser.id === currentUser.id) {
          const storedSelf = JSON.parse(localStorage.getItem("bms_user") || "{}");
          const updatedSelf = { ...storedSelf, ...designationPatch };
          localStorage.setItem("bms_user", JSON.stringify(updatedSelf));
          onProfileUpdate?.(updatedSelf);
        }
        setPickedTemplate(null);
      }
      showToast("Permissions saved");
    } catch (err) {
      showToast(err?.response?.data?.error || err?.message || "Save failed", "error");
    } finally { setPermLoading(false); }
  };

  return (
    <>
      <input ref={newUserSigRef} type="file" accept="image/*" className="hidden" onChange={handleNewUserSigChange} />

      <div className="space-y-4">
        {permUser ? (
          /* ── Permissions panel ── */
          <div className="bg-white rounded-none shadow-sm border border-slate-100">

            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-sm bg-indigo-50 flex items-center justify-center shrink-0">
                  <ShieldCheck size={16} className="text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-black text-slate-800">Permissions</h2>
                  <p className="text-[12px] text-slate-500 truncate">{permUser.name} — {permUser.email}</p>
                </div>
              </div>
              <button onClick={closePermsPanel}
                className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-sm hover:bg-slate-100 transition-colors border border-slate-200 shrink-0">
                ← Back
              </button>
            </div>

            {permLoading ? (
              <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
            ) : (
              <div className="p-6 space-y-6">

                {/* ── Section 1: Access Profile ── */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-5 rounded-full bg-violet-500" />
                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-600">Access Profile</span>
                    <div className="flex-1 h-px bg-violet-100" />
                  </div>
                  <div className="flex items-start gap-4 flex-wrap">
                    {designations.length > 0 ? (
                      <div className="w-72 shrink-0">
                        <SearchableTemplateSelect
                          designations={designations}
                          selectedIds={permAccessProfileIds}
                          multiSelect
                          onPick={d => {
                            const ids = permAccessProfileIds.includes(d.id)
                              ? permAccessProfileIds.filter(x => x !== d.id)
                              : [...permAccessProfileIds, d.id];
                            setPermAccessProfileIds(ids);
                          }}
                        />
                        {permAccessProfileIds.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {permAccessProfileIds.map(id => {
                              const d = designations.find(x => x.id === id);
                              return d ? (
                                <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-violet-100 text-violet-700 text-[11px] font-bold border border-violet-200">
                                  {d.name}
                                  <button type="button" onClick={() => setPermAccessProfileIds(prev => prev.filter(x => x !== id))}
                                    className="hover:text-rose-500 transition-colors text-[14px] leading-none ml-0.5">×</button>
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[12px] text-slate-400 italic">No access profiles created yet.</p>
                    )}
                  </div>
                </div>

                {/* ── Section 2: Management Permissions (super_admin / global_admin only) ── */}
                {["global_admin", "super_admin"].includes(currentUser.role) && (
                  <div className="rounded-sm border-2 border-indigo-200 bg-indigo-50/20">
                    {/* Section header */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-indigo-100 bg-indigo-50/50">
                      <div className="w-1.5 h-5 rounded-full bg-indigo-500" />
                      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-600">
                        Management Permissions
                      </span>
                      <div className="flex-1" />
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-sm ${(ROLE_BADGE[permUser.role] || ROLE_BADGE.user).color}`}>
                        {(ROLE_BADGE[permUser.role] || ROLE_BADGE.user).label}
                      </span>
                    </div>

                    {/* Grid */}
                    <div className="p-4">
                      {permissions.length === 0 ? (
                        <p className="py-4 text-center text-sm text-slate-400">No modules found</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {PROFILE_SECTIONS.map(sec => {
                            const allChecked = sec.keys.every(({ k }) => editingProfilePerms[sec.key]?.[k]);
                            const anyChecked = sec.keys.some(({ k }) => editingProfilePerms[sec.key]?.[k]);
                            return (
                              <div key={sec.key} className={`rounded-sm border p-3.5 bg-white transition-all hover:border-indigo-300 ${anyChecked ? "border-indigo-200" : "border-slate-200"}`}>
                                <div className="flex items-start justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-bold text-slate-800">{sec.label}</p>
                                    <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest mt-0.5">{sec.key}</p>
                                  </div>
                                  <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0 px-2 py-1 rounded-sm hover:bg-slate-100/70 transition">
                                    <input type="checkbox" checked={allChecked}
                                      ref={el => { if (el) el.indeterminate = anyChecked && !allChecked; }}
                                      onChange={e => setEditingProfilePerms(prev => ({ ...prev, [sec.key]: Object.fromEntries(sec.keys.map(({ k }) => [k, e.target.checked])) }))}
                                      className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer" />
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">All</span>
                                  </label>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-2">
                                  {sec.keys.map(({ k, label }) => (
                                    <label key={k} className="flex items-center gap-1.5 cursor-pointer select-none group/item">
                                      <input type="checkbox" checked={editingProfilePerms[sec.key]?.[k] || false}
                                        onChange={e => setEditingProfilePerms(prev => ({ ...prev, [sec.key]: { ...prev[sec.key], [k]: e.target.checked } }))}
                                        className="w-3.5 h-3.5 rounded accent-indigo-600 shrink-0" />
                                      <span className="text-[11px] font-medium text-slate-600 group-hover/item:text-slate-900 transition-colors">{label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Section 3: Module Permissions (Project Access inside) ── */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-5 rounded-full bg-blue-500" />
                      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">Module Permissions</span>
                      <div className="w-12 h-px bg-blue-100" />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox"
                        checked={permissions.length > 0 && permissions.every(m => getModulePermKeysFull(m).every(k => m[k]))}
                        onChange={e => setPermissions(prev => prev.map(m => {
                          const keys = getModulePermKeysFull(m);
                          return { ...m, ...Object.fromEntries(keys.map(k => [k, e.target.checked])) };
                        }))}
                        className="w-3.5 h-3.5 rounded accent-blue-600" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select All</span>
                    </label>
                  </div>
                  <GroupedPermissions
                    modules={permissions}
                    onChange={updatePerm}
                    allProjects={allProjects}
                    selectedProjects={editingAllowedProjects}
                    onProjectChange={setEditingAllowedProjects}
                  />
                </div>

                {/* Save */}
                <div className="pt-2 border-t border-slate-100">
                  <button onClick={savePerms} disabled={permLoading} className={btnPrimary}>
                    {permLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Permissions
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Team list ── */
          <div className="flex flex-col h-full">

            {/* Sticky header — full width, no side gaps */}
            <div className="sticky top-0 z-20 bg-white border-b-2 border-slate-200 shadow-sm px-6 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-black text-slate-800 tracking-tight">User Management</h2>
                  {!teamLoading && <p className="text-[11px] text-slate-400 mt-0.5">Total {members.length} team member{members.length !== 1 ? "s" : ""}</p>}
                </div>
                <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-sm border border-slate-200 shrink-0">
                  <button onClick={() => setViewType("list")} title="List View"
                    className={`p-1.5 rounded-sm transition-all ${viewType === "list" ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600"}`}>
                    <Briefcase size={13} />
                  </button>
                  <button onClick={() => setViewType("tile")} title="Tile View"
                    className={`p-1.5 rounded-sm transition-all ${viewType === "tile" ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600"}`}>
                    <LayoutDashboard size={13} />
                  </button>
                </div>
              </div>
              {(isGlobalAdmin || !!pp.manage_user?.add) && (
                <button onClick={() => setShowAddUser(true)}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-sm font-bold shadow-md shadow-blue-200 transition-all active:scale-95 shrink-0">
                  <UserPlus size={15} /> Add New User
                </button>
              )}
            </div>

            {/* Table area */}
            <div className="flex-1 bg-[#f0f2f5] p-5">
            {teamLoading ? (
              <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-blue-500" /></div>
            ) : members.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Users className="text-slate-300" size={32} />
                </div>
                <p className="text-sm font-medium text-slate-400">No team members found.</p>
              </div>
            ) : viewType === "list" ? (
              <div className="bg-white border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300">
                      {["S.No","Name","Email","Designation","Access Profile","Role","Status","Actions"].map((h, i) => (
                        <th key={h} className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap border-r border-slate-200 last:border-r-0 ${i === 0 || i >= 6 ? "text-center" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m, idx) => {
                      const mb = ROLE_BADGE[m.role] || ROLE_BADGE.user;
                      const initials = m.name?.split(" ").map(n => n[0]).join("").toUpperCase() || "?";
                      const isSelf = m.id === currentUser.id;
                      const isSuperOrGlobal = isGlobalAdmin || currentUser.role === "super_admin";
                      const canHierarchy = canManage(currentUser.role, m.role, m.id);
                      const canShield  = canHierarchy && (isSuperOrGlobal || !!pp.manage_user?.manage_permissions);
                      const canToggle  = canHierarchy && !isSelf && (isSuperOrGlobal || !!pp.manage_user?.edit);
                      const canDel     = canHierarchy && !isSelf && (isSuperOrGlobal || !!pp.manage_user?.delete);
                      const canManageRole = canHierarchy && m.role !== "global_admin" && (isSuperOrGlobal || !!pp.manage_user?.edit);
                      const isEven = idx % 2 === 0;
                      const td = "px-4 py-3 border-r border-slate-100 last:border-r-0";
                      return (
                        <tr key={m.id} className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${isEven ? "bg-white" : "bg-slate-50/40"}`}>
                          <td className={`${td} text-[12px] font-bold text-slate-400 tabular-nums w-10 text-center`}>{idx + 1}</td>
                          <td className={td}>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-sm flex items-center justify-center text-white font-black text-sm overflow-hidden shadow-sm shrink-0"
                                style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}>
                                {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> : initials}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-bold text-[13px] text-slate-800 truncate">{m.name}</p>
                                  {isSelf && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-sm text-[8px] font-black uppercase tracking-widest border border-blue-200">You</span>}
                                </div>
                                {m.contact_no && <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5"><Phone size={9} /> {m.contact_no}</p>}
                              </div>
                            </div>
                          </td>
                          <td className={`${td} text-[12px] text-slate-500 max-w-[180px]`}>
                            <div className="flex items-center gap-1.5 min-w-0"><Mail size={12} className="text-slate-300 shrink-0" /><span className="truncate">{m.email}</span></div>
                          </td>
                          <td className={`${td} text-[12px] text-slate-600 whitespace-nowrap`}>
                            {m.designation || <span className="text-slate-300">—</span>}
                          </td>
                          <td className={td}>
                            {(m.access_profile_ids?.length > 0) ? (
                              <div className="flex flex-wrap gap-1">
                                {m.access_profile_ids.map(id => {
                                  const d = designations.find(d => d.id === id);
                                  return d ? (
                                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-violet-50 text-violet-700 text-[10px] font-bold border border-violet-200">
                                      <Briefcase size={8} /> {d.name}
                                    </span>
                                  ) : null;
                                })}
                              </div>
                            ) : <span className="text-slate-300 text-[12px]">—</span>}
                          </td>
                          <td className={td}>
                            {canManageRole && editingRoleId === m.id ? (
                              <select autoFocus defaultValue={m.role}
                                className="text-[11px] font-bold px-2 py-1 rounded-sm border border-blue-400 bg-white text-slate-700 outline-none shadow-sm"
                                onChange={e => changeRole(m, e.target.value)}
                                onBlur={() => setEditingRoleId(null)}>
                                {getManageableRoles(currentUser.role).map(r => (
                                  <option key={r} value={r}>{ROLE_BADGE[r]?.label || r}</option>
                                ))}
                              </select>
                            ) : (
                              <span onClick={() => canManageRole && setEditingRoleId(m.id)}
                                className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-sm ${mb.color} ${canManageRole ? "cursor-pointer hover:shadow-sm" : ""} whitespace-nowrap`}>
                                {mb.label.toUpperCase()}
                                {canManageRole && <Pencil size={8} className="opacity-50" />}
                              </span>
                            )}
                          </td>
                          <td className={`${td} text-center`}>
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-sm border ${m.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-600 border-rose-200"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${m.is_active ? "bg-emerald-500" : "bg-rose-500"}`} />
                              {m.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className={`${td} text-center`}>
                            <div className="flex items-center justify-center gap-1">
                              {(canShield || canToggle || canDel || canHierarchy) ? (
                                <>
                                  {canHierarchy && (
                                    <button onClick={() => { setEditingMember(m); setEditForm({ name: m.name, contact_no: m.contact_no || "", designation: m.designation || "", department: m.department || "" }); setEditAccessProfileIds(m.access_profile_ids || []); }}
                                      title="Edit Info" className="w-8 h-8 flex items-center justify-center rounded-sm bg-indigo-50 text-indigo-500 border border-indigo-100 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all">
                                      <Pencil size={13} />
                                    </button>
                                  )}
                                  {canHierarchy && (
                                    <button onClick={() => handleResendInvite(m)} title="Resend Invite"
                                      className="w-8 h-8 flex items-center justify-center rounded-sm bg-emerald-50 text-emerald-500 border border-emerald-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all">
                                      <SendHorizonal size={13} />
                                    </button>
                                  )}
                                  {canShield && (
                                    <button onClick={() => viewPerms(m)} title="Manage Permissions"
                                      className="w-8 h-8 flex items-center justify-center rounded-sm bg-blue-50 text-blue-500 border border-blue-100 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all">
                                      <ShieldCheck size={13} />
                                    </button>
                                  )}
                                  {canToggle && (
                                    <button onClick={() => toggleActive(m)} title={m.is_active ? "Deactivate" : "Activate"}
                                      className={`w-8 h-8 flex items-center justify-center rounded-sm border transition-all ${m.is_active ? "bg-amber-50 text-amber-500 border-amber-100 hover:bg-amber-500 hover:text-white hover:border-amber-500" : "bg-emerald-50 text-emerald-500 border-emerald-100 hover:bg-emerald-500 hover:text-white hover:border-emerald-500"}`}>
                                      {m.is_active ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                                    </button>
                                  )}
                                  {canDel && (
                                    <button onClick={() => removeUser(m)} title="Remove User"
                                      className="w-8 h-8 flex items-center justify-center rounded-sm bg-rose-50 text-rose-500 border border-rose-100 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all">
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </>
                              ) : <span className="text-slate-300 text-[11px]">—</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {members.map((m) => {
                  const mb = ROLE_BADGE[m.role] || ROLE_BADGE.user;
                  const initials = m.name?.split(" ").map(n => n[0]).join("").toUpperCase() || "?";
                  return (
                    <div key={m.id} className="bg-white rounded-none border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all group p-5 relative">
                      <div className="flex flex-col items-center text-center">
                        <div className="relative mb-3">
                          <div className={`w-16 h-16 rounded-sm flex items-center justify-center text-white font-black text-xl overflow-hidden shadow-sm ring-4 ${m.is_active ? "ring-green-50" : "ring-red-50"}`}
                            style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}>
                            {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> : initials}
                          </div>
                          <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white ${m.is_active ? "bg-green-500" : "bg-red-500"}`} />
                        </div>
                        <h3 className="font-bold text-slate-800 text-[15px] truncate max-w-full">{m.name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{m.designation || "No Title"}</p>
                        <div className="mt-3 flex flex-col gap-1.5 w-full">
                          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><Mail size={12} className="opacity-60" /><span className="truncate">{m.email}</span></div>
                          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><Building2 size={12} className="opacity-60" /><span>{m.department || "General"}</span></div>
                        </div>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                          <div className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-sm ${mb.color}`}>{mb.label.toUpperCase()}</div>
                          {m.is_active === false && <div className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-sm bg-red-50 text-red-600 border border-red-100 uppercase">Inactive</div>}
                        </div>
                      </div>
                      <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100">
                        {(() => {
                          const isSuperOrGlobal2 = isGlobalAdmin || currentUser.role === "super_admin";
                          const ch = canManage(currentUser.role, m.role, m.id);
                          const cShield = ch && (isSuperOrGlobal2 || !!pp.manage_user?.manage_permissions);
                          const cToggle = ch && m.id !== currentUser.id && (isSuperOrGlobal2 || !!pp.manage_user?.edit);
                          const cDel    = ch && m.id !== currentUser.id && (isSuperOrGlobal2 || !!pp.manage_user?.delete);
                          return (
                            <>
                              {ch && <button onClick={() => { setEditingMember(m); setEditForm({ name: m.name, contact_no: m.contact_no || "", designation: m.designation || "", department: m.department || "" }); setEditAccessProfileIds(m.access_profile_ids || []); }} title="Edit Info" className="p-2 rounded-sm bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"><Pencil size={16} /></button>}
                              {ch && <button onClick={() => handleResendInvite(m)} title="Resend Invite" className="p-2 rounded-sm bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"><SendHorizonal size={16} /></button>}
                              {cShield && <button onClick={() => viewPerms(m)} title="Permissions" className="p-2 rounded-sm bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm"><ShieldCheck size={16} /></button>}
                              {cToggle && <button onClick={() => toggleActive(m)} className={`p-2 rounded-sm transition-all shadow-sm ${m.is_active ? "bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white" : "bg-green-50 text-green-600 hover:bg-green-600 hover:text-white"}`}>{m.is_active ? <XCircle size={16} /> : <CheckCircle2 size={16} />}</button>}
                              {cDel    && <button onClick={() => removeUser(m)} className="p-2 rounded-sm bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm"><Trash2 size={16} /></button>}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>{/* end flex-1 bg area */}
          </div>
        )}
      </div>

      {/* ── Add User Modal ── */}
      <AnimatePresence>
        {showAddUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddUser(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-5xl bg-white rounded-none shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-sm bg-blue-50 flex items-center justify-center"><UserPlus size={20} className="text-blue-600" /></div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 tracking-tight">Add New Member</h3>
                    <p className="text-xs font-medium text-slate-400 mt-0.5">Invite a colleague to your team</p>
                  </div>
                </div>
                <button onClick={() => setShowAddUser(false)} className="w-8 h-8 rounded-sm flex items-center justify-center hover:bg-slate-100 text-slate-400 transition-colors"><XCircle size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <form id="add-member-form" onSubmit={addMember} className="space-y-8">
                  <div>
                    <div className={secHeader}><p className={secTitle}>Basic Details</p></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div><span className={lbl}>Full Name *</span><input className={inp} placeholder="e.g. John Doe" value={newUser.name} onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))} required /></div>
                      <div><span className={lbl}>Email Address *</span><input type="email" className={inp} placeholder="john@example.com" value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} required /></div>
                      <div><span className={lbl}>Phone Number</span><input className={inp} placeholder="+91 00000 00000" value={newUser.contact_no} onChange={(e) => setNewUser((p) => ({ ...p, contact_no: e.target.value }))} /></div>
                      <div>
                        <span className={lbl}>Designation</span>
                        <input className={inp} placeholder="e.g. Site Engineer" value={newUser.designation}
                          onChange={(e) => setNewUser((p) => ({ ...p, designation: e.target.value }))} />
                      </div>
                      <div><span className={lbl}>Department</span><input className={inp} placeholder="Operations" value={newUser.department} onChange={(e) => setNewUser((p) => ({ ...p, department: e.target.value }))} /></div>
                      <div>
                        <span className={lbl}>Role Access</span>
                        <div className="relative">
                          <select className={`${inp} appearance-none pr-10`} value={newUser.role} onChange={(e) => {
                              const role = e.target.value;
                              setNewUser((p) => ({ ...p, role }));
                              setNewUserProfilePerms(ROLE_DEFAULT_PERMS[role] || DEFAULT_PROFILE_PERMS);
                            }}>
                            {getManageableRoles(currentUser.role).includes("super_admin") && <option value="super_admin">Super Admin (Organization)</option>}
                            {getManageableRoles(currentUser.role).includes("admin") && <option value="admin">Administrator (Team)</option>}
                            <option value="user">Standard User (Staff)</option>
                          </select>
                          <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 ml-1">Role controls who this user can manage.</p>
                      </div>
                      {designations.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className={lbl}>Access Profile</span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-rose-400">Min. 1 required</span>
                          </div>
                          <SearchableTemplateSelect
                            designations={designations}
                            selectedIds={newUserAccessProfileIds}
                            multiSelect
                            onPick={d => {
                              const ids = newUserAccessProfileIds.includes(d.id)
                                ? newUserAccessProfileIds.filter(x => x !== d.id)
                                : [...newUserAccessProfileIds, d.id];
                              setNewUserAccessProfileIds(ids);
                              applyAccessProfiles(ids);
                            }}
                          />
                          {newUserAccessProfileIds.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {newUserAccessProfileIds.map(id => {
                                const d = designations.find(x => x.id === id);
                                return d ? (
                                  <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-violet-50 text-violet-700 text-[11px] font-bold border border-violet-200">
                                    {d.name}
                                    <button type="button" onClick={() => {
                                      const ids = newUserAccessProfileIds.filter(x => x !== id);
                                      setNewUserAccessProfileIds(ids);
                                      applyAccessProfiles(ids);
                                    }} className="hover:text-rose-500 transition-colors ml-0.5 text-[14px] leading-none">×</button>
                                  </span>
                                ) : null;
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Signature */}
                  <div>
                    <div className="flex items-center gap-2 mb-5 border-l-4 border-amber-400 pl-4 py-1">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Signature</p>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Optional</span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start gap-5 p-4 bg-amber-50/60 rounded-sm border border-amber-100">
                      <div className="w-full sm:w-48 h-24 rounded-sm border-2 border-dashed border-amber-200 bg-white flex items-center justify-center overflow-hidden shrink-0 relative group"
                        style={{backgroundImage: "linear-gradient(45deg, #f8f8f8 25%, transparent 25%), linear-gradient(-45deg, #f8f8f8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f8f8f8 75%), linear-gradient(-45deg, transparent 75%, #f8f8f8 75%)", backgroundSize: "8px 8px", backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px"}}>
                        {newUserSigLoading ? <Loader2 size={20} className="text-amber-400 animate-spin" />
                        : newUserSignature ? (
                          <>
                            <img src={newUserSignature} alt="Signature" className="max-h-full max-w-full object-contain p-2" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-sm flex items-center justify-center gap-3">
                              <button type="button" onClick={() => newUserSigRef.current.click()} className="text-white flex flex-col items-center gap-0.5"><Camera size={14} /><span className="text-[9px] font-bold">Change</span></button>
                              <button type="button" onClick={() => setNewUserSignature(null)} className="text-red-400 flex flex-col items-center gap-0.5"><Trash2 size={14} /><span className="text-[9px] font-bold">Remove</span></button>
                            </div>
                          </>
                        ) : (
                          <div className="text-center"><Pencil size={20} className="text-amber-300 mx-auto mb-1" /><p className="text-[10px] text-amber-400 font-medium">No signature</p></div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-[12px] text-slate-600 font-medium">Upload user's signature now, or they can do it later from their Profile page.</p>
                        <button type="button" onClick={() => newUserSigRef.current.click()} disabled={newUserSigLoading}
                          className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-sm shadow-sm shadow-amber-200 transition-all active:scale-95 disabled:opacity-60">
                          {newUserSigLoading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                          {newUserSignature ? "Change Signature" : "Upload Signature"}
                        </button>
                        {newUserSignature && (
                          <button type="button" onClick={() => setNewUserSignature(null)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-sm transition-all">
                            <Trash2 size={12} /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Profile Perms */}
                  <div>
                    <div className="flex items-center gap-2 mb-5 border-l-4 border-purple-500 pl-4 py-1">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Management Access</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {PROFILE_SECTIONS.map(sec => {
                        const allChecked = sec.keys.every(({ k }) => newUserProfilePerms[sec.key]?.[k]);
                        const anyChecked = sec.keys.some(({ k }) => newUserProfilePerms[sec.key]?.[k]);
                        return (
                          <div key={sec.key} className={`rounded-sm border p-3.5 transition-all ${anyChecked ? "border-violet-200 bg-violet-50/40" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                            <div className="flex items-start justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
                              <p className="text-[13px] font-bold text-slate-800">{sec.label}</p>
                              <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0 px-2 py-1 rounded-sm hover:bg-slate-100/70 transition">
                                <input type="checkbox" checked={allChecked}
                                  ref={el => { if (el) el.indeterminate = anyChecked && !allChecked; }}
                                  onChange={e => setNewUserProfilePerms(prev => ({ ...prev, [sec.key]: Object.fromEntries(sec.keys.map(({ k }) => [k, e.target.checked])) }))}
                                  className="w-3.5 h-3.5 rounded accent-violet-600 cursor-pointer" />
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">All</span>
                              </label>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
                              {sec.keys.map(({ k, label }) => (
                                <label key={k} className="flex items-center gap-1.5 cursor-pointer select-none group/item">
                                  <input type="checkbox" checked={newUserProfilePerms[sec.key]?.[k] || false}
                                    onChange={e => setNewUserProfilePerms(prev => ({ ...prev, [sec.key]: { ...prev[sec.key], [k]: e.target.checked } }))}
                                    className="w-3.5 h-3.5 rounded accent-violet-600 cursor-pointer shrink-0" />
                                  <span className="text-[11px] font-medium text-slate-600 group-hover/item:text-slate-900 transition-colors">{label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tab Perms */}
                  <div className="pb-4">
                    <div className="flex items-center justify-between mb-4 border-l-4 border-emerald-500 pl-3">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Module Permissions</p>
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" checked={allPermsSelected} onChange={e => handleAllPerms(e.target.checked)} className="w-4 h-4 rounded accent-emerald-600" />
                        <span className="text-[10px] font-black text-slate-400 group-hover:text-emerald-600 uppercase tracking-widest transition-colors">Full Grant</span>
                      </label>
                    </div>
                    {modulesLoading
                      ? <div className="flex justify-center p-8"><Loader2 className="animate-spin text-emerald-500" /></div>
                      : <GroupedPermissions modules={newUserModules} onChange={updateNewUserModule} allProjects={allProjects} selectedProjects={newUserAllowedProjects} onProjectChange={setNewUserAllowedProjects} />}
                  </div>
                </form>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                <button onClick={() => setShowAddUser(false)} className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-sm transition-all">Cancel</button>
                <button form="add-member-form" type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-sm shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center gap-2">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <SendHorizonal size={16} />}
                  Send Invitation
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Role Change Modal ── */}
      <AnimatePresence>
        {confirmRoleChange && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setConfirmRoleChange(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-none shadow-2xl overflow-hidden border border-white/20">
              <div className="p-6 text-center">
                <div className="w-16 h-16 rounded-sm bg-amber-50 flex items-center justify-center mx-auto mb-4 border border-amber-100">
                  <ShieldAlert size={32} className="text-amber-500" />
                </div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight mb-2">Update User Role?</h3>
                <p className="text-sm font-medium text-slate-500 leading-relaxed px-4">
                  Aap <span className="font-bold text-slate-800">{confirmRoleChange.member.name}</span> ka role <span className="text-blue-600 font-bold uppercase tracking-wider">{confirmRoleChange.newRole}</span> par change kar rahe hain.
                  <br /><br />
                  Role sirf hierarchy decide karta hai — actual app permissions designation template se aati hain.
                </p>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
                <button onClick={() => executeRoleChange(false)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-sm font-bold shadow-lg shadow-blue-200 transition-all active:scale-95">
                  Change Role Only (Recommended)
                </button>
                <button onClick={() => executeRoleChange(true)}
                  className="w-full py-3 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-sm text-sm font-bold transition-all active:scale-95">
                  Also Wipe Permissions (Advanced)
                </button>
                <button onClick={() => setConfirmRoleChange(null)}
                  className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-all">
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Member Modal */}
      <AnimatePresence>
        {editingMember && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingMember(null)} />
            <motion.div className="relative w-full max-w-md bg-white shadow-2xl overflow-hidden" initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-[15px] font-black text-slate-800">Edit Member</h3>
                  <p className="text-[12px] text-slate-400">{editingMember.email}</p>
                </div>
                <button onClick={() => setEditingMember(null)} className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-slate-100 text-slate-400 transition"><XCircle size={18} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <span className={lbl}>Full Name *</span>
                  <input className={inp} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="Full Name" />
                </div>
                <div>
                  <span className={lbl}>Phone Number</span>
                  <input className={inp} value={editForm.contact_no} onChange={e => setEditForm(p => ({ ...p, contact_no: e.target.value }))} placeholder="+91 00000 00000" />
                </div>
                <div>
                  <span className={lbl}>Designation</span>
                  <input className={inp} value={editForm.designation} onChange={e => setEditForm(p => ({ ...p, designation: e.target.value }))} placeholder="e.g. Site Engineer" />
                </div>
                {designations.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className={lbl}>Access Profile</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-rose-400">Min. 1 required</span>
                    </div>
                    <SearchableTemplateSelect
                      designations={designations}
                      selectedIds={editAccessProfileIds}
                      multiSelect
                      onPick={d => setEditAccessProfileIds(prev =>
                        prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]
                      )}
                    />
                    {editAccessProfileIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {editAccessProfileIds.map(id => {
                          const d = designations.find(x => x.id === id);
                          return d ? (
                            <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-violet-50 text-violet-700 text-[11px] font-bold border border-violet-200">
                              {d.name}
                              <button type="button" onClick={() => setEditAccessProfileIds(prev => prev.filter(x => x !== id))} className="hover:text-rose-500 transition-colors ml-0.5">×</button>
                            </span>
                          ) : null;
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-rose-400 mt-1.5 ml-1">No access profile selected.</p>
                    )}
                  </div>
                )}
                <div>
                  <span className={lbl}>Department</span>
                  <input className={inp} value={editForm.department} onChange={e => setEditForm(p => ({ ...p, department: e.target.value }))} placeholder="e.g. Operations" />
                </div>
              </div>
              <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                <button onClick={() => setEditingMember(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-sm transition-all">Cancel</button>
                <button onClick={handleEditSave} disabled={editSaving || !editForm.name.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-sm shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-60">
                  {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
