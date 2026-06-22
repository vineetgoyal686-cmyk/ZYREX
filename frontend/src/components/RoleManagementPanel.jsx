import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  Users, FolderOpen, Briefcase, Workflow, KeyRound, Inbox,
  ShieldUser, UserCog, User, Info, ChevronDown, Save, UserCheck, Mail,
} from "lucide-react";

const STORAGE_KEY = "zyhawk_role_management_matrix_v1";

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

/** Module + permission rows (UI model — persist locally until API exists). */
const MODULES = [
  {
    id: "manage_user",
    label: "User Management",
    Icon: Users,
    perms: [
      { key: "view", label: "View Users" },
      { key: "add", label: "Add User" },
      {
        key: "edit",
        label: "Edit User",
        children: [
          { key: "change_role", label: "Change Role" },
          { key: "change_designation", label: "Change Access Profile" },
          { key: "custom_permissions", label: "Custom Permissions" },
          { key: "activate_user", label: "Activate / Deactivate User" },
        ],
      },
    ],
  },
  {
    id: "manage_project",
    label: "Project Management",
    Icon: FolderOpen,
    perms: [
      { key: "view", label: "View Projects" },
      { key: "add", label: "Add Project" },
      { key: "edit", label: "Edit Project" },
      { key: "activate", label: "Activate / Deactivate Project" },
    ],
  },
  {
    id: "designation",
    label: "Access Profile",
    Icon: Briefcase,
    perms: [
      { key: "view", label: "View Access Profile" },
      { key: "add", label: "Add Access Profile" },
      { key: "edit", label: "Edit Access Profile" },
      { key: "delete", label: "Delete Access Profile" },
    ],
  },
  {
    id: "approval_flow",
    label: "Approval Flow",
    Icon: Workflow,
    perms: [
      { key: "view", label: "View Approval Flow" },
      { key: "add", label: "Add Approval Flow" },
      { key: "edit", label: "Edit Approval Flow" },
      { key: "delete", label: "Delete Approval Flow" },
    ],
  },
  {
    id: "serialization",
    label: "Serialization",
    Icon: KeyRound,
    perms: [
      { key: "view", label: "View Serialization" },
      { key: "add", label: "Add Serialization" },
      { key: "edit", label: "Edit Serialization" },
      { key: "delete", label: "Delete Serialization" },
    ],
  },
  {
    id: "request_handler",
    label: "Request Handler",
    Icon: Inbox,
    perms: [
      { key: "view", label: "View Request Handler" },
      { key: "edit", label: "Edit Request Handler" },
    ],
  },
  {
    id: "delegation",
    label: "Delegation",
    Icon: UserCheck,
    perms: [
      { key: "view", label: "View Delegation" },
      { key: "add", label: "Add Delegation" },
      { key: "edit", label: "Edit Delegation" },
      { key: "delete", label: "Delete Delegation" },
    ],
  },
  {
    id: "mail_management",
    label: "Mail Management",
    Icon: Mail,
    perms: [
      { key: "view", label: "View Mail Management" },
      { key: "add", label: "Add Mail Template" },
      { key: "edit", label: "Edit Mail Template" },
      { key: "delete", label: "Delete Mail Template" },
    ],
  },
];

function defaultMatrix() {
  const full = {};
  const sa = {};
  const ad = {};
  const us = {};
  for (const m of MODULES) {
    sa[m.id] = {};
    ad[m.id] = {};
    us[m.id] = {};
    for (const p of m.perms) {
      sa[m.id][p.key] = true;
      if (p.children) {
        p.children.forEach((c) => { sa[m.id][c.key] = true; });
      }
      ad[m.id][p.key] = p.key === "view" || p.key === "edit" || p.key === "add";
      if (p.children) {
        p.children.forEach((c) => { ad[m.id][c.key] = c.key !== "custom_permissions"; });
      }
      us[m.id][p.key] = p.key === "view";
      if (p.children) {
        p.children.forEach((c) => { us[m.id][c.key] = false; });
      }
    }
  }
  full.super_admin = sa;
  full.admin = ad;
  full.user = us;
  return full;
}

function loadMatrix() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMatrix();
    const parsed = JSON.parse(raw);
    if (!parsed?.super_admin || !parsed?.admin || !parsed?.user) return defaultMatrix();
    return parsed;
  } catch {
    return defaultMatrix();
  }
}

export default function RoleManagementPanel({ showToast }) {
  const [selectedRole, setSelectedRole] = useState("super_admin");
  const [matrix, setMatrix] = useState(loadMatrix);
  const [collapsed, setCollapsed] = useState({});

  const roleLabel = useMemo(
    () => ROLE_CARDS.find((r) => r.key === selectedRole)?.title || selectedRole,
    [selectedRole]
  );

  const toggle = useCallback((moduleId, key, value) => {
    setMatrix((prev) => ({
      ...prev,
      [selectedRole]: {
        ...prev[selectedRole],
        [moduleId]: {
          ...prev[selectedRole][moduleId],
          [key]: value,
        },
      },
    }));
  }, [selectedRole]);

  const toggleCollapsed = (moduleId) => {
    setCollapsed((c) => ({ ...c, [moduleId]: !c[moduleId] }));
  };

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(matrix));
      showToast?.("Role defaults saved");
    } catch {
      showToast?.("Could not save", "error");
    }
  };

  /* Hydrate if another tab updated storage */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try { setMatrix(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const mForRole = matrix[selectedRole] || {};

  return (
    <div className="w-full flex flex-col rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="shrink-0 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-200 bg-white">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Role Management</h1>
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
                  onClick={() => setSelectedRole(r.key)}
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

        <div className="shrink-0 flex items-center gap-2 px-5 sm:px-6 py-2.5 border-b border-slate-100 bg-white text-sm text-slate-600 min-w-0">
          <Info size={16} className="text-slate-400 shrink-0" />
          <span className="truncate">
            Permissions for: <span className="font-bold text-slate-900">{roleLabel}</span>
          </span>
        </div>

        <div className="flex flex-col px-5 sm:px-6 py-5 pb-6 bg-slate-50/40">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {MODULES.map((mod) => {
              const ModIcon = mod.Icon;
              const isCollapsed = !!collapsed[mod.id];
              const modState = mForRole[mod.id] || {};
              return (
                <div
                  key={mod.id}
                  className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col"
                >
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(mod.id)}
                    className="flex items-center gap-3 w-full px-4 py-3 border-b border-slate-100 bg-white hover:bg-slate-50/80 text-left shrink-0"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-600 shrink-0">
                      <ModIcon size={18} />
                    </span>
                    <span className="flex-1 min-w-0 font-bold text-slate-800 text-sm truncate">{mod.label}</span>
                    <ChevronDown size={18} className={`text-slate-400 shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  </button>

                  {!isCollapsed && (
                    <div className="px-4 py-3 space-y-2.5 border-t border-transparent">
                      {mod.perms.map((p) => {
                        const checked = !!modState[p.key];
                        const hasChildren = p.children?.length;
                        return (
                          <div key={p.key}>
                            <label className="flex items-start gap-2.5 cursor-pointer select-none group">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => toggle(mod.id, p.key, e.target.checked)}
                                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 accent-blue-600 shrink-0"
                              />
                              <span className="text-sm font-medium text-slate-700 leading-snug">{p.label}</span>
                            </label>
                            {hasChildren && checked && (
                              <div className="mt-2 ml-6 pl-3 border-l border-dotted border-slate-300 space-y-2">
                                {p.children.map((c) => (
                                  <label key={c.key} className="flex items-start gap-2.5 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={!!modState[c.key]}
                                      onChange={(e) => toggle(mod.id, c.key, e.target.checked)}
                                      className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-blue-600 accent-blue-600 shrink-0"
                                    />
                                    <span className="text-xs font-medium text-slate-600">{c.label}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-5 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
        <button
          type="button"
          onClick={save}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 shadow-sm transition-colors"
        >
          <Save size={16} strokeWidth={2.5} />
          Save Changes
        </button>
      </div>
    </div>
  );
}
