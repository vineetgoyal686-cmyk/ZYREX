import { useState, useEffect } from "react";
import {
  UserCircle, Lock, Users, ShieldCheck, Briefcase,
  FolderOpen, KeyRound, Inbox, Workflow, Mail, X, UserCheck,
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
  const pp             = currentUser.profile_permissions || {};

  const [section, setSection] = useState("profile");
  const [toast, setToast]     = useState(null);

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

  /* On mount: sync current user permissions from DB */
  useEffect(() => {
    const syncProfile = async () => {
      try {
        const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
        if (!u.id) return;
        const res = await fetch(`${API}/api/users/${u.id}/permissions`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("bms_token")}` },
        });
        if (res.ok) {
          const data = await res.json();
          const updated = {
            ...u,
            profile_permissions: data.profile_permissions,
            app_permissions: data.permissions,
          };
          localStorage.setItem("bms_user", JSON.stringify(updated));
          onProfileUpdate?.(updated);
        }
      } catch {
        /* silent */
      }
    };
    syncProfile();
  }, []);

  /* Fetch designations when relevant sections become active */
  useEffect(() => {
    if (
      (section === "roles" || section === "designations" || section === "team") &&
      (isGlobalAdmin || currentUser.role === "super_admin")
    ) {
      fetchDesignations();
    }
  }, [section]);

  /* ── Nav groups ── */
  const showProjectsTab = isGlobalAdmin || !!pp.manage_project?.view;
  const showTeamTab     = isGlobalAdmin || !!pp.manage_user?.view;
  const adminSettings   = isGlobalAdmin || currentUser.role === "super_admin";

  const settingsNavGroups = (() => {
    const general = [
      { id: "profile",    label: "Personal Info",      icon: UserCircle },
      { id: "security",   label: "Security",            icon: Lock       },
      { id: "delegation", label: "Delegation",          icon: UserCheck  },
      ...(showProjectsTab ? [{ id: "projects", label: "Project Management", icon: FolderOpen }] : []),
    ];
    const access = [
      ...(showTeamTab ? [{ id: "team", label: "User Management", icon: Users }] : []),
      ...(adminSettings
        ? [
            { id: "roles",        label: "Roles",        icon: ShieldCheck },
            { id: "designations", label: "Designations", icon: Briefcase   },
          ]
        : []),
    ];
    const workflow = [
      { id: "approval_flow",   label: "Approval Flow",   icon: Workflow },
      ...(isGlobalAdmin || !!pp.serialization?.view
        ? [{ id: "serialization", label: "Serialization", icon: KeyRound }]
        : []),
      { id: "request_handler",  label: "Request Handler",  icon: Inbox },
      { id: "mail_management",  label: "Mail Management",  icon: Mail  },
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

      <div className="flex w-full min-w-0 flex-1 md:grid md:grid-cols-[14rem_minmax(0,1fr)]">

        {/* Sidebar */}
        <div className="hidden md:block border-r border-slate-200/90 bg-slate-100 self-stretch">
          <aside
            className="sticky top-0 w-full bg-slate-100 h-screen max-h-screen overflow-y-auto thin-scrollbar-xs"
            aria-label="Settings"
          >
            <nav className="flex flex-col gap-0 w-full py-0 px-0 md:pt-0 md:pb-3">
              <div className="px-3 md:px-4 py-3 border-b border-slate-200/90 bg-slate-100">
                <h2 className="text-[15px] font-bold text-slate-900 tracking-tight">Settings</h2>
              </div>
              {settingsNavGroups.map((group, gi) => (
                <div key={gi} className={gi > 0 ? "border-t border-slate-200/90" : ""}>
                  {group.title && (
                    <p className="px-3 md:px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {group.title}
                    </p>
                  )}
                  <div className={`flex flex-col gap-0 ${group.title ? "pb-2 pt-0.5" : "py-2"}`}>
                    {group.items.map((t) => {
                      const Icon = t.icon;
                      const active = section === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSection(t.id)}
                          className={`w-full flex items-center gap-3 text-left rounded-none px-3 md:px-4 py-2.5 text-[13px] font-semibold transition-colors
                            ${active
                              ? "bg-indigo-600 text-white"
                              : "text-slate-700 hover:bg-slate-100/90 hover:text-slate-900"
                            }`}
                        >
                          <Icon size={17} className={`shrink-0 ${active ? "text-white" : "text-slate-400"}`} strokeWidth={2} />
                          <span className="leading-snug">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1 flex flex-col">
          <div className="min-w-0 px-3 sm:px-4 lg:px-6 py-4 flex flex-col gap-4">

            {section === "profile" && (
              <PersonalInfo
                currentUser={currentUser}
                showToast={showToast}
                onProfileUpdate={onProfileUpdate}
              />
            )}

            {section === "security" && (
              <Security currentUser={currentUser} showToast={showToast} />
            )}

            {section === "delegation" && (
              <Delegation showToast={showToast} />
            )}

            {section === "team" && (isGlobalAdmin || !!pp.manage_user?.view) && (
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

            {section === "serialization" && (isGlobalAdmin || !!pp.serialization?.view) && (
              <Serialization isGlobalAdmin={isGlobalAdmin} showToast={showToast} />
            )}

            {section === "approval_flow" && (
              <ApprovalFlow showToast={showToast} />
            )}

            {section === "request_handler" && (
              <RequestHandler />
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
