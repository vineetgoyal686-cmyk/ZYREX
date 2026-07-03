import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  Users, FolderOpen, Briefcase, Workflow, KeyRound, Inbox,
  ShieldUser, UserCog, User, Info, ChevronDown, Save, UserCheck, Mail, Loader2,
  Pencil, RefreshCw,
} from "lucide-react";
import api from "../utils/api";
import { PROFILE_SECTIONS, ROLE_DEFAULT_PERMS } from "../pages/Settings/constants";

// Hierarchy: global_admin > super_admin > admin > user. A role may only edit
// (or sync) defaults for a role strictly below it — never its own row or above.
const ROLE_RANK = { global_admin: 3, super_admin: 2, admin: 1, user: 0 };
const canEditRoleDefaults = (actorRole, targetRole) =>
  (ROLE_RANK[actorRole] ?? -1) > (ROLE_RANK[targetRole] ?? -1);

const SECTION_ICONS = {
  manage_user:      Users,
  manage_project:   FolderOpen,
  designation:      Briefcase,
  approval_flow:    Workflow,
  serialization:    KeyRound,
  request_handler:  Inbox,
  delegation:       UserCheck,
  mail_management:  Mail,
};

const ROLE_CARDS = [
  {
    key: "super_admin",
    title: "Super Admin",
    description: "Full access to all modules",
    Icon: ShieldUser,
    accent: "text-blue-600",
    iconBg: "bg-blue-50",
    borderActive: "border-blue-500 ring-1 ring-blue-500/20",
    bgActive: "bg-blue-50/80",
  },
  {
    key: "admin",
    title: "Admin",
    description: "Manage system & configurations",
    Icon: UserCog,
    accent: "text-emerald-600",
    iconBg: "bg-emerald-50",
    borderActive: "border-emerald-500 ring-1 ring-emerald-500/15",
    bgActive: "bg-emerald-50/50",
  },
  {
    key: "user",
    title: "User",
    description: "Limited access to assigned modules",
    Icon: User,
    accent: "text-amber-600",
    iconBg: "bg-amber-50",
    borderActive: "border-amber-500 ring-1 ring-amber-500/15",
    bgActive: "bg-amber-50/40",
  },
];

export default function RoleManagementPanel({ showToast }) {
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("bms_user") || "{}"); } catch { return {}; }
  }, []);

  const [selectedRole, setSelectedRole] = useState("super_admin");
  const [matrix, setMatrix]   = useState(ROLE_DEFAULT_PERMS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [collapsed, setCollapsed] = useState({});

  const roleLabel = useMemo(
    () => ROLE_CARDS.find((r) => r.key === selectedRole)?.title || selectedRole,
    [selectedRole]
  );

  const canEditSelected = canEditRoleDefaults(currentUser?.role, selectedRole);

  useEffect(() => {
    let ignore = false;
    api.get("/api/users/role-defaults/all")
      .then(({ data }) => { if (!ignore && data?.roleDefaults) setMatrix(data.roleDefaults); })
      .catch(() => { /* keep fallback defaults on failure */ })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const toggle = useCallback((sectionKey, key, value) => {
    setMatrix((prev) => ({
      ...prev,
      [selectedRole]: {
        ...prev[selectedRole],
        [sectionKey]: {
          ...prev[selectedRole]?.[sectionKey],
          [key]: value,
        },
      },
    }));
  }, [selectedRole]);

  const toggleCollapsed = (sectionKey) => {
    setCollapsed((c) => ({ ...c, [sectionKey]: !c[sectionKey] }));
  };

  const selectRole = (role) => {
    setSelectedRole(role);
    setEditMode(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/users/role-defaults/${selectedRole}`, {
        profile_permissions: matrix[selectedRole] || {},
      });
      showToast?.(`${roleLabel} defaults saved`);
      setEditMode(false);
    } catch (err) {
      showToast?.(err.response?.data?.error || "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    if (!window.confirm(`Apply the saved ${roleLabel} defaults to every existing ${roleLabel} user? This overwrites their current Management Permissions.`)) return;
    setSyncing(true);
    try {
      const { data } = await api.post(`/api/users/role-defaults/${selectedRole}/sync`);
      showToast?.(`Synced to ${data?.updatedCount ?? 0} ${roleLabel} user(s)`);
    } catch (err) {
      showToast?.(err.response?.data?.error || "Sync failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  const mForRole = matrix[selectedRole] || {};
  const checkboxesLocked = !editMode || !canEditSelected;

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-20 rounded-md border border-slate-200 bg-white shadow-sm">
        <Loader2 size={22} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="shrink-0 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-200 bg-white">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Role Management</h1>
        <p className="text-[12px] text-slate-500 mt-1">
          These are the default permissions a new user gets when assigned a role. Individual users and Access
          Profiles can still be customized on top of this baseline.
        </p>
      </div>

      <div className="flex flex-col">
        <div className="shrink-0 px-5 sm:px-6 py-3 bg-slate-50/60 border-b border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {ROLE_CARDS.map((r) => {
              const active = selectedRole === r.key;
              const Icon = r.Icon;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => selectRole(r.key)}
                  className={`text-left rounded-md border p-2.5 sm:p-3 flex gap-2.5 items-start transition-all
                    ${active
                      ? `${r.borderActive} ${r.bgActive}`
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                    }`}
                >
                  <div className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-md ${r.iconBg} ${r.accent}`}>
                    <Icon size={16} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className={`text-[13px] font-bold leading-tight ${active ? r.accent : "text-slate-800"}`}>{r.title}</p>
                    <p className={`text-[11px] mt-0.5 leading-snug ${active ? r.accent : "text-slate-500"}`}>{r.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 px-5 sm:px-6 py-2.5 border-b border-slate-100 bg-white text-sm text-slate-600 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Info size={16} className="text-slate-400 shrink-0" />
            <span className="truncate">
              Permissions for: <span className="font-bold text-slate-900">{roleLabel}</span>
              {selectedRole === "super_admin" && (
                <span className="text-slate-400"> — Global/Super Admin always has full access; changes here only affect what's shown, not their real access.</span>
              )}
              {!canEditSelected && selectedRole !== "super_admin" && (
                <span className="text-amber-600"> — You don't have permission to edit this role's defaults.</span>
              )}
            </span>
          </div>
          {canEditSelected && (
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={sync} disabled={syncing || editMode}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-slate-300 bg-white text-slate-600 text-[12px] font-bold hover:bg-slate-50 transition disabled:opacity-50">
                {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Sync to Existing Users
              </button>
              <button type="button" onClick={() => setEditMode((v) => !v)}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-[12px] font-bold transition
                  ${editMode ? "bg-slate-800 text-white hover:bg-slate-900" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
                <Pencil size={13} />
                {editMode ? "Editing…" : "Edit"}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col px-5 sm:px-6 py-5 pb-6 bg-slate-50/40">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {PROFILE_SECTIONS.map((sec) => {
              const SecIcon = SECTION_ICONS[sec.key] || Users;
              const isCollapsed = !!collapsed[sec.key];
              const secState = mForRole[sec.key] || {};
              return (
                <div
                  key={sec.key}
                  className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col"
                >
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(sec.key)}
                    className="flex items-center gap-3 w-full px-4 py-3 border-b border-slate-100 bg-white hover:bg-slate-50/80 text-left shrink-0"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-600 shrink-0">
                      <SecIcon size={18} />
                    </span>
                    <span className="flex-1 min-w-0 font-bold text-slate-800 text-sm truncate">{sec.label}</span>
                    <ChevronDown size={18} className={`text-slate-400 shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  </button>

                  {!isCollapsed && (
                    <div className="px-4 py-3 space-y-2.5 border-t border-transparent">
                      {sec.keys.map(({ k, label }) => (
                        <label key={k} className="flex items-start gap-2.5 cursor-pointer select-none group">
                          <input
                            type="checkbox"
                            checked={!!secState[k]}
                            disabled={checkboxesLocked}
                            onChange={(e) => toggle(sec.key, k, e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 accent-blue-600 shrink-0 disabled:opacity-50"
                          />
                          <span className="text-sm font-medium text-slate-700 leading-snug">{label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {editMode && canEditSelected && (
        <div className="shrink-0 px-5 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditMode(false)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 text-sm font-bold px-4 py-2.5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} strokeWidth={2.5} />}
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
}
