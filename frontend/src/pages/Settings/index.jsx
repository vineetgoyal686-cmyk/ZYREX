import { useState, useEffect, useRef } from "react";
import {
  UserCircle, Lock, Users, ShieldCheck, Briefcase,
  FolderOpen, KeyRound, Inbox, Workflow, Mail, X, UserCheck,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import api from "../../utils/api";
import ManageProjects from "../../components/ManageProjects";
import RoleManagementPanel from "../../components/RoleManagementPanel";
import Toast from "./components/Toast";
import PersonalInfo from "./tabs/PersonalInfo";
import Security from "./tabs/Security";
import UserManagement from "./tabs/UserManagement";
import Designations from "./tabs/Designations";
import Serialization from "./tabs/Serialization";
import RequestHandler from "./tabs/RequestHandler";
import ApprovalFlow from "./tabs/ApprovalFlow";
import Delegation from "./tabs/Delegation";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

function ComingSoon({ label }) {
  return (
    <div className="bg-white rounded-none shadow-sm border border-slate-100 p-12 flex flex-col items-center justify-center text-center gap-2">
      <p className="text-sm font-semibold text-slate-400">{label} — Coming Soon</p>
      <p className="text-xs text-slate-300">This section is under development</p>
    </div>
  );
}

export default function Settings({ onProfileUpdate, onProjectsUpdate }) {
  const currentUser    = JSON.parse(localStorage.getItem("bms_user") || "{}");
  const isGlobalAdmin  = currentUser.role === "global_admin";
  const isAdminOrAbove = ["global_admin", "super_admin", "admin"].includes(currentUser.role);
  const rawPp          = currentUser.profile_permissions || {};
  const pp = currentUser.role === "super_admin"
    ? {
        manage_user:     { view: true, add: true, edit: true, delete: true, manage_permissions: true },
        manage_project:  { view: true, add: true, edit: true, delete: true },
        designation:     { view: true, add: true, edit: true, delete: true },
        approval_flow:   { view: true, add: true, edit: true, delete: true },
        serialization:   { view: true, add: true, edit: true, delete: true },
        request_handler: { view: true, edit: true },
        delegation:      { view: true, add: true, edit: true, delete: true },
        mail_management: { view: true, add: true, edit: true, delete: true },
      }
    : rawPp;

  const [section,   setSection]   = useState("profile");
  const [toast,     setToast]     = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [tooltip,   setTooltip]   = useState(null);

  /* ── Shared: designations (needed by Designations tab + UserManagement dropdown) ── */
  const [designations, setDesignations]               = useState([]);
  const [designationsLoading, setDesignationsLoading] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchDesignations = async () => {
    setDesignationsLoading(true);
    try {
      const { data } = await api.get("/api/designations");
      setDesignations(data.designations || []);
    } catch {
      /* silent */
    } finally {
      setDesignationsLoading(false);
    }
  };

  /* On mount: sync current user data from DB */
  useEffect(() => {
    let ignore = false;
    const syncProfile = async () => {
      try {
        const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
        if (!u.id) return;

        // Fetch full user data (accessible to all users)
        const meRes = await fetch(`${API}/api/auth/me`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("bms_token")}` },
        });
        if (!meRes.ok) return;
        const meData = await meRes.json();
        const meUser = meData.user || {};
        if (ignore) return; // a newer effect run already took over (e.g. React StrictMode)

        const updated = {
          ...u,
          name:               meUser.name               ?? u.name,
          designation:        meUser.designation        ?? u.designation,
          department:         meUser.department         ?? u.department,
          contact_no:         meUser.contact_no         ?? u.contact_no,
          avatar:             meUser.avatar             ?? u.avatar,
          access_profile_ids: meUser.access_profile_ids ?? u.access_profile_ids ?? [],
          profile_permissions: meUser.profile_permissions ?? u.profile_permissions,
        };

        // Also sync app permissions if admin-level (existing logic)
        if (["global_admin","super_admin","admin"].includes(u.role)) {
          const permRes = await fetch(`${API}/api/users/${u.id}/permissions`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("bms_token")}` },
          });
          if (permRes.ok) {
            const permData = await permRes.json();
            updated.app_permissions = permData.permissions;
          }
        } else {
          const permRes = await fetch(`${API}/api/auth/my-permissions`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("bms_token")}` },
          });
          if (permRes.ok) {
            const permData = await permRes.json();
            updated.app_permissions = permData.permissions;
          }
        }

        if (ignore) return;
        localStorage.setItem("bms_user", JSON.stringify(updated));
        onProfileUpdate?.(updated);
      } catch {
        /* silent */
      }
    };
    syncProfile();
    return () => { ignore = true; };
  }, []);

  /* Fetch designations when relevant sections become active */
  useEffect(() => {
    if (section === "profile") {
      fetchDesignations();
    } else if (
      (section === "roles" || section === "designations" || section === "team") &&
      (isGlobalAdmin || currentUser.role === "super_admin")
    ) {
      fetchDesignations();
    }
  }, [section]);

  /* ── Nav groups ── */
  const isSuperOrGlobal   = isGlobalAdmin || currentUser.role === "super_admin";
  const showProjectsTab   = isSuperOrGlobal || !!pp.manage_project?.view;
  const showTeamTab       = isSuperOrGlobal || !!pp.manage_user?.view;
  const showDelegationTab = isSuperOrGlobal || !!pp.delegation?.view;
  const showApprovalFlowTab   = isSuperOrGlobal || !!pp.approval_flow?.view;
  const showRequestHandlerTab = isSuperOrGlobal || !!pp.request_handler?.view;
  const showMailManagementTab = isSuperOrGlobal || !!pp.mail_management?.view;
  const adminSettings   = isGlobalAdmin || currentUser.role === "super_admin";

  const settingsNavGroups = (() => {
    const general = [
      { id: "profile",    label: "Personal Info",      icon: UserCircle },
      { id: "security",   label: "Security",            icon: Lock       },
      ...(showDelegationTab ? [{ id: "delegation", label: "Delegation", icon: UserCheck }] : []),
      ...(showProjectsTab ? [{ id: "projects", label: "Project Management", icon: FolderOpen }] : []),
    ];
    const access = [
      ...(showTeamTab ? [{ id: "team", label: "User Management", icon: Users }] : []),
      ...((isGlobalAdmin || currentUser.can_manage_roles)
        ? [{ id: "roles", label: "Roles", icon: ShieldCheck }]
        : []),
      ...(adminSettings
        ? [{ id: "designations", label: "Access Profiles", icon: Briefcase }]
        : []),
    ];
    const workflow = [
      ...(showApprovalFlowTab ? [{ id: "approval_flow", label: "Approval Flow", icon: Workflow }] : []),
      ...(isGlobalAdmin || currentUser.role === "super_admin" || !!pp.serialization?.view
        ? [{ id: "serialization", label: "Serialization", icon: KeyRound }]
        : []),
      ...(showRequestHandlerTab ? [{ id: "request_handler", label: "Request Handler", icon: Inbox }] : []),
      ...(showMailManagementTab ? [{ id: "mail_management", label: "Mail Management", icon: Mail }] : []),
    ];
    const groups = [{ title: null, items: general }];
    if (access.length) groups.push({ title: "Access control", items: access });
    if (workflow.length) groups.push({ title: "Workflow", items: workflow });
    return groups;
  })();

  /* ── Render ── */
  return (
    <div className="w-full min-w-0 min-h-full flex flex-col bg-[#f0f2f5]">
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div className="flex w-full min-w-0 flex-1">

        {/* Fixed tooltip when collapsed */}
        {collapsed && tooltip && (
          <div className="fixed z-[999] pointer-events-none"
            style={{ left: tooltip.x + 8, top: tooltip.y, transform: "translateY(-50%)" }}>
            <div className="bg-slate-800 text-white text-[11px] font-semibold px-2.5 py-1 rounded whitespace-nowrap shadow-lg">
              {tooltip.label}
            </div>
          </div>
        )}

        {/* Sidebar */}
        <div
          className="hidden md:block border-r border-slate-200/90 bg-slate-100 self-stretch shrink-0 transition-all duration-300 ease-in-out"
          style={{ width: collapsed ? "3.25rem" : "14rem" }}>
          <aside
            className="sticky top-0 h-screen max-h-screen overflow-y-auto thin-scrollbar-xs flex flex-col"
            style={{ width: collapsed ? "3.25rem" : "14rem" }}
            aria-label="Settings"
          >
            {/* Header row with title + collapse toggle */}
            <div className="flex items-center border-b border-slate-200/90 shrink-0"
              style={{ padding: collapsed ? "0.6rem 0" : "0.6rem 1rem", justifyContent: collapsed ? "center" : "space-between" }}>
              {!collapsed && (
                <h2 className="text-[15px] font-bold text-slate-900 tracking-tight whitespace-nowrap">Settings</h2>
              )}
              <button
                onClick={() => setCollapsed(v => !v)}
                className="text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                title={collapsed ? "Expand" : "Collapse"}>
                {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            </div>

            {/* Nav */}
            <nav className="flex flex-col gap-0 w-full flex-1 py-0">
              {settingsNavGroups.map((group, gi) => (
                <div key={gi} className={`py-2 ${gi > 0 ? "border-t border-slate-200/90" : ""}`}>
                  {!collapsed && group.title && (
                    <p className="px-4 pt-0.5 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 whitespace-nowrap">
                      {group.title}
                    </p>
                  )}
                  {group.items.map((t) => {
                    const Icon   = t.icon;
                    const active = section === t.id;
                    return (
                      <div key={t.id}
                        onMouseEnter={collapsed ? e => { const r = e.currentTarget.getBoundingClientRect(); setTooltip({ label: t.label, y: r.top + r.height / 2, x: r.right }); } : undefined}
                        onMouseLeave={collapsed ? () => setTooltip(null) : undefined}>
                        <button
                          type="button"
                          onClick={() => setSection(t.id)}
                          className={`w-full flex items-center text-left py-2.5 text-[13px] font-semibold transition-colors
                            ${collapsed ? "justify-center px-0" : "gap-3 px-4"}
                            ${active ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-200/60 hover:text-slate-900"}`}
                        >
                          <Icon size={17} className={`shrink-0 ${active ? "text-white" : "text-slate-400"}`} strokeWidth={2} />
                          {!collapsed && <span className="leading-snug whitespace-nowrap">{t.label}</span>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1 flex flex-col min-h-0">

          {section === "serialization" && (isGlobalAdmin || currentUser.role === "super_admin" || !!pp.serialization?.view) && (
            <Serialization isGlobalAdmin={isGlobalAdmin || currentUser.role === "super_admin"} showToast={showToast} />
          )}

          {/* Team = full-bleed, no padding */}
          {section === "team" && (isSuperOrGlobal || !!pp.manage_user?.view) && (
            <UserManagement
              currentUser={currentUser}
              isGlobalAdmin={isGlobalAdmin}
              pp={pp}
              showToast={showToast}
              onProfileUpdate={onProfileUpdate}
              designations={designations}
              fetchDesignations={fetchDesignations}
            />
          )}

          <div className={`min-w-0 px-3 sm:px-4 lg:px-6 py-4 flex flex-col gap-4 ${(section === "serialization" || section === "team") ? "hidden" : ""}`}>

            {section === "profile" && (
              <PersonalInfo
                currentUser={currentUser}
                showToast={showToast}
                onProfileUpdate={onProfileUpdate}
                designations={designations}
              />
            )}

            {section === "security" && (
              <Security currentUser={currentUser} showToast={showToast} />
            )}

            {section === "delegation" && (
              <Delegation showToast={showToast} />
            )}

            {section === "roles" && adminSettings && (
              <div className="w-full min-w-0">
                <RoleManagementPanel showToast={showToast} />
              </div>
            )}

            {section === "designations" && adminSettings && (
              <Designations
                showToast={showToast}
                designations={designations}
                designationsLoading={designationsLoading}
                fetchDesignations={fetchDesignations}
              />
            )}

            {section === "projects" && (isGlobalAdmin || !!pp.manage_project?.view) && (
              <ManageProjects
                isGlobalAdmin={isGlobalAdmin}
                permissions={pp.manage_project}
                onProjectsUpdate={onProjectsUpdate}
              />
            )}

            {section === "approval_flow" && (
              <ApprovalFlow showToast={showToast} />
            )}

            {section === "request_handler" && (
              <RequestHandler currentUser={currentUser} showToast={showToast} />
            )}

            {section === "mail_management" && (
              <ComingSoon label="Mail Management" />
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
