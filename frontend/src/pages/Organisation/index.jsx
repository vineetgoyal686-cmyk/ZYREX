import React, { useState, useRef, useEffect } from "react";
import {
  Plus, LayoutGrid, GitBranch, Building2, Briefcase,
  MapPin, PanelLeftClose, PanelLeftOpen,
  Download, Upload, ChevronDown, FileSpreadsheet, FileText,
  Layers, Network, UserSquare2, FolderTree, ArrowLeft, Table2, BarChart2, ClipboardList, FileSignature, FolderKanban,
  MoreHorizontal,
} from "lucide-react";
import OrgOverview   from "./OrgOverview";
import Departments   from "./Departments";
import Designations  from "./Designations";
import OrgChart      from "./OrgChart";
import Locations     from "./Locations";
import Structure     from "./Structure";
import Divisions     from "./Divisions";
import SubDepts      from "./SubDepts";
import Grades        from "./Grades";
import EmployeeList  from "./EmployeeList";
import OrgList       from "./OrgList";
import SOPTab        from "../Settings/tabs/SOP";
import Policy        from "./Policy";
import HRLetter      from "./HRLetter";
import ManageProjects from "../../components/ManageProjects";
import { effectiveProfilePerms } from "../Settings/access";
import { OrgScopeContext, scopedUrl } from "./orgScope";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import ScopeDropdown from "../../components/ScopeDropdown";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";

const NAV_SECTIONS = [
  {
    label: "Organisation",
    items: [
      { id: "overview",   label: "Overview",   icon: LayoutGrid,    hasAdd: false, hasExport: false },
      // Projects = the main project list, filtered to this company (its own header has Add)
      { id: "projects",   label: "Projects",   icon: FolderKanban,  hasAdd: false, hasExport: false },
      { id: "locations",  label: "Branch",     icon: MapPin,        hasAdd: true,  hasExport: false, btnLabel: "Add Branch" },
      { id: "structure",  label: "Structure",  icon: FolderTree,    hasAdd: false, hasExport: false },
      { id: "org_chart",  label: "Org Chart",  icon: GitBranch,     hasAdd: false, hasExport: false },
      { id: "sop",        label: "SOP",        icon: ClipboardList, hasAdd: false, hasExport: false },
      { id: "policy",     label: "Policy",     icon: FileText,      hasAdd: true,  hasExport: false, btnLabel: "Add Policy" },
    ],
  },
  {
    label: "Master Data",
    items: [
      { id: "divisions",       label: "Divisions",       icon: Layers,    hasAdd: true,  hasExport: true,  btnLabel: "Add Division"       },
      { id: "departments",     label: "Departments",     icon: Building2, hasAdd: true,  hasExport: true,  btnLabel: "Add Department"     },
      { id: "sub_departments", label: "Teams",        icon: Network,   hasAdd: true, hasExport: true, btnLabel: "Add Team"        },
      { id: "grades",          label: "Grades",       icon: BarChart2, hasAdd: true, hasExport: true, btnLabel: "Add Grade"       },
      { id: "designations",    label: "Designations", icon: Briefcase, hasAdd: true, hasExport: true, btnLabel: "Add Designation" },
    ],
  },
  {
    label: "People",
    items: [
      { id: "employees", label: "Employees", icon: UserSquare2, hasAdd: true,  hasExport: true,  btnLabel: "Add Employee" },
      { id: "hr_letters", label: "Offer & Appointment", icon: FileSignature, hasAdd: false, hasExport: false },
    ],
  },
];

const ALL_TABS = NAV_SECTIONS.flatMap(s => s.items);

/* ─── Org Detail View (after selecting an org) ───────────
   fixedTab: show only that tab, without the inner sidebar (HRMS pages in
   the main sidebar). allowedTabs: limit the inner sidebar (Settings ›
   Company). headerExtra: shown before the title (company picker). */
function OrgDetail({ org, onBack, currentUser, fixedTab, allowedTabs, headerExtra, onProjectsUpdate }) {
  const [activeTab,  setActiveTabRaw]  = useState(fixedTab || allowedTabs?.[0] || "overview");
  const setActiveTab = (t) => {
    if (fixedTab || (allowedTabs && !allowedTabs.includes(t))) return;
    setActiveTabRaw(t);
  };
  const [collapsed,  setCollapsed]  = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [tooltip,    setTooltip]    = useState(null);
  const [divCount,    setDivCount]    = useState(0);
  const [subCount,    setSubCount]    = useState(0);
  const [lvlCount,    setLvlCount]    = useState(0);
  const [deptCount,   setDeptCount]   = useState(0);
  const [branchCount, setBranchCount] = useState(0);
  const [projectCount, setProjectCount] = useState(0);
  const [empView,  setEmpView]  = useState("card");
  // the Employees tab puts its search + filters into the header through this
  const [toolbarSlot, setToolbarSlot] = useState(null);

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const exportDropRef = useRef(null);
  const actionsRef    = useRef({});

  const meta = ALL_TABS.find(t => t.id === activeTab);

  const permDepartments  = useModulePermissions("departments");
  const permTeams        = useModulePermissions("teams");
  const permDivisions    = useModulePermissions("divisions");
  const permGrades       = useModulePermissions("grades");
  const permDesignations = useModulePermissions("designations");
  const permEmployees    = useModulePermissions("employees");
  const permLocations    = useModulePermissions("locations");
  const permPolicy       = useModulePermissions("policy");
  const permStructure    = useModulePermissions("structure");
  const permOrgChart     = useModulePermissions("org_chart");
  const permSop          = useModulePermissions("sop");
  // Projects follow Project Management access (profile permission manage_project)
  const isGlobalAdmin    = currentUser?.role === "global_admin";
  const pmPerms          = effectiveProfilePerms(currentUser).manage_project || {};
  const permProjects     = { canView: isGlobalAdmin || !!pmPerms.view };

  const TAB_PERMS = {
    departments: permDepartments, sub_departments: permTeams, divisions: permDivisions,
    grades: permGrades, designations: permDesignations, employees: permEmployees,
    structure: permStructure, org_chart: permOrgChart, sop: permSop,
    locations: permLocations, policy: permPolicy, projects: permProjects,
  };

  useEffect(() => {
    const h = { Authorization: `Bearer ${TOKEN()}` };
    const u = (path) => scopedUrl(`${API}${path}`, org.id);
    fetch(u("/api/departments"), { headers: h }).then(r => r.json()).then(j => setDeptCount((j.departments || []).length)).catch(() => {});
    fetch(u("/api/organisation/divisions"), { headers: h }).then(r => r.json()).then(j => setDivCount((j.divisions || []).length)).catch(() => {});
    fetch(u("/api/organisation/grades"), { headers: h }).then(r => r.json()).then(j => setLvlCount((j.grades || []).length)).catch(() => {});
    fetch(u("/api/teams"), { headers: h }).then(r => r.json()).then(j => setSubCount((j.teams || []).length)).catch(() => {});
    fetch(u("/api/organisation/branches"), { headers: h }).then(r => r.json()).then(j => setBranchCount((j.branches || []).length)).catch(() => {});
    fetch(`${API}/api/projects`, { headers: h }).then(r => r.json()).then(j => setProjectCount((j.projects || []).filter(p => p.companyId === org.id).length)).catch(() => {});
  }, [activeTab, org.id]);

  useEffect(() => {
    const h = (e) => {
      if (exportDropRef.current && !exportDropRef.current.contains(e.target)) setShowExport(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const badges = {
    divisions:       divCount    || null,
    departments:     deptCount   || null,
    sub_departments: subCount    || null,
    grades:          lvlCount    || null,
    locations:       branchCount || null,
    projects:        projectCount || null,
  };

  const renderContent = () => {
    switch (activeTab) {
      case "overview":        return <OrgOverview org={org} onNavigate={setActiveTab} />;
      case "structure":       return <Structure />;
      case "org_chart":       return <OrgChart    onNavigate={setActiveTab} />;
      case "sop":             return <SOPTab showToast={showToast} />;
      case "divisions":       return <Divisions   actionsRef={actionsRef} onChange={d => setDivCount(d.length)} />;
      case "departments":     return <Departments actionsRef={actionsRef} />;
      case "sub_departments": return <SubDepts    actionsRef={actionsRef} onChange={d => setSubCount(d.length)} />;
      case "grades":          return <Grades      actionsRef={actionsRef} onChange={d => setLvlCount(d.length)} />;
      case "designations":    return <Designations actionsRef={actionsRef} />;
      case "employees":       return <EmployeeList actionsRef={actionsRef} view={empView} onViewChange={setEmpView} toolbarSlot={toolbarSlot} />;
      case "locations":       return <Locations   actionsRef={actionsRef} />;
      case "projects":        return <ManageProjects companyId={org.id} companyName={org.companyName || org.company_name}
                                isGlobalAdmin={isGlobalAdmin} permissions={pmPerms} onProjectsUpdate={onProjectsUpdate} />;
      case "policy":          return <Policy actionsRef={actionsRef} companyId={org?.id} orgName={org?.companyName || org?.company_name} />;
      case "hr_letters":      return <HRLetter org={org} showToast={showToast} />;
      default:                return null;
    }
  };

  return (
    <OrgScopeContext.Provider value={org.id}>
    <div className="flex w-full min-w-0 flex-1">

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[9999] px-4 py-2.5 rounded shadow-lg text-white text-sm font-semibold transition-all ${toast.type === "error" ? "bg-rose-500" : "bg-emerald-500"}`}>
          {toast.msg}
        </div>
      )}

      {/* Fixed tooltip for collapsed sidebar */}
      {collapsed && tooltip && (
        <div
          className="fixed z-[999] pointer-events-none"
          style={{ left: tooltip.x + 8, top: tooltip.y, transform: "translateY(-50%)" }}>
          <div className="bg-slate-800 text-white text-[11px] font-semibold px-2.5 py-1 rounded whitespace-nowrap shadow-lg">
            {tooltip.label}
            {tooltip.badge != null && <span className="ml-1.5 opacity-70">{tooltip.badge}</span>}
          </div>
        </div>
      )}

      {/* Sidebar — width transitions smoothly; not shown for a single fixed tab */}
      {!fixedTab && <div
        className="hidden md:block border-r border-slate-200/90 bg-slate-100 self-stretch shrink-0 transition-all duration-300 ease-in-out"
        style={{ width: collapsed ? "3.25rem" : "14rem" }}>
        <aside className="sticky top-0 h-screen max-h-screen overflow-y-auto thin-scrollbar-xs flex flex-col"
          style={{ width: collapsed ? "3.25rem" : "14rem" }}>

          {/* Back + collapse toggle row */}
          <div className="flex items-center justify-between border-b border-slate-200/90 shrink-0"
            style={{ padding: collapsed ? "0.6rem 0" : "0.6rem 1rem", justifyContent: collapsed ? "center" : "space-between" }}>
            {!collapsed && (
              <button onClick={onBack}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-blue-600 transition-colors whitespace-nowrap">
                <ArrowLeft size={13} /> All Organisations
              </button>
            )}
            <button
              onClick={() => setCollapsed(v => !v)}
              className="text-slate-400 hover:text-slate-700 transition-colors shrink-0"
              title={collapsed ? "Expand" : "Collapse"}>
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>

          {/* Org name */}
          {!collapsed && (
            <div className="px-4 py-3 border-b border-slate-200/90 shrink-0">
              <p className="text-[13px] font-bold text-slate-900 leading-tight truncate">{org.companyName || org.company_name}</p>
              <p className="text-[11px] text-slate-400 font-mono truncate">{org.companyCode || ""}{org.state ? ` · ${org.state}` : ""}</p>
            </div>
          )}

          {/* Nav */}
          <nav className="flex flex-col gap-0 w-full flex-1">
            {NAV_SECTIONS.map(section => {
              const visibleItems = section.items.filter(t => (!TAB_PERMS[t.id] || TAB_PERMS[t.id].canView) && (!allowedTabs || allowedTabs.includes(t.id)));
              if (visibleItems.length === 0) return null;
              return (
              <div key={section.label} className="py-2 border-b border-slate-200/70 last:border-0">
                {!collapsed && (
                  <p className="px-4 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
                    {section.label}
                  </p>
                )}
                {visibleItems.map(t => {
                  const Icon   = t.icon;
                  const active = activeTab === t.id;
                  const badge  = badges[t.id];
                  return (
                    <div key={t.id}
                      onMouseEnter={collapsed ? e => { const r = e.currentTarget.getBoundingClientRect(); setTooltip({ label: t.label, badge, y: r.top + r.height / 2, x: r.right }); } : undefined}
                      onMouseLeave={collapsed ? () => setTooltip(null) : undefined}>
                      <button onClick={() => setActiveTab(t.id)}
                        className={`w-full flex items-center text-left py-2 text-[13px] font-semibold transition-colors
                          ${collapsed ? "justify-center px-0" : "gap-3 px-4"}
                          ${active ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200/60 hover:text-slate-900"}`}>
                        <Icon size={15} className={`shrink-0 ${active ? "text-white" : "text-slate-400"}`} strokeWidth={2} />
                        {!collapsed && <span className="flex-1 leading-snug whitespace-nowrap">{t.label}</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
              );
            })}
          </nav>
        </aside>
      </div>}

      {/* Main content */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Per-tab header — one row: title · count, the tab's own search/filters,
            then view toggle, a "⋯" menu (export / bulk upload) and Add */}
        {(() => {
          // Employees shows its numbers in the cards below instead
          const count = activeTab === "employees" ? null : badges[activeTab];
          const canExport = meta?.hasExport && (TAB_PERMS[activeTab]?.canExport ?? true);
          const canBulk   = meta?.hasExport && (TAB_PERMS[activeTab]?.canBulk ?? true);
          const menuItem = "w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-slate-700 hover:bg-slate-50";
          return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 sm:px-6 py-3 bg-white border-b border-slate-200 sticky top-0 z-30">
          {/* page name first, then the company it is showing */}
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-[15px] font-bold text-slate-800 whitespace-nowrap">
              {meta?.label}
              {count != null && <span className="ml-1.5 font-semibold text-slate-400">· {count}</span>}
            </h1>
            {headerExtra && <span className="h-5 w-px bg-slate-200 shrink-0" />}
            {headerExtra}
          </div>

          {/* filled by the tab (Employees: search + Filters) */}
          <div ref={setToolbarSlot} className="flex items-center gap-2 empty:hidden" />

          <div className="flex items-center gap-2 ml-auto">
            {activeTab === "employees" && (
              <div className="flex items-center border border-slate-200 rounded-md overflow-hidden">
                <button onClick={() => setEmpView("table")} title="Table view"
                  className={`p-2 transition-colors ${empView === "table" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                  <Table2 size={14} />
                </button>
                <button onClick={() => setEmpView("card")} title="Card view"
                  className={`p-2 transition-colors ${empView === "card" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                  <LayoutGrid size={14} />
                </button>
              </div>
            )}
            {(canExport || canBulk) && (
              <div className="relative" ref={exportDropRef}>
                <button onClick={() => setShowExport(v => !v)} title="More"
                  className={`p-2 rounded-md border transition-colors ${showExport ? "border-slate-300 bg-slate-100 text-slate-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  <MoreHorizontal size={14} />
                </button>
                {showExport && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg z-30 py-1">
                    {canExport && <>
                      <p className="px-3.5 pt-1.5 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Export</p>
                      <button onClick={() => { actionsRef.current?.exportExcel?.(); setShowExport(false); }} className={menuItem}>
                        <FileSpreadsheet size={14} className="text-emerald-500" /> Excel
                      </button>
                      <button onClick={() => { actionsRef.current?.exportPDF?.(); setShowExport(false); }} className={menuItem}>
                        <FileText size={14} className="text-red-400" /> PDF
                      </button>
                    </>}
                    {canExport && canBulk && <div className="my-1 border-t border-slate-100" />}
                    {canBulk && <>
                      <p className="px-3.5 pt-1.5 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bulk Upload</p>
                      <button onClick={() => { actionsRef.current?.downloadTemplate?.(); setShowExport(false); }} className={menuItem}>
                        <Download size={14} className="text-slate-400" /> Download Template
                      </button>
                      <button onClick={() => { actionsRef.current?.openUpload?.(); setShowExport(false); }} className={menuItem}>
                        <Upload size={14} className="text-blue-500" /> Upload Excel File
                      </button>
                    </>}
                  </div>
                )}
              </div>
            )}
            {meta?.hasAdd && (TAB_PERMS[activeTab]?.canAdd ?? true) && (
              <button onClick={() => actionsRef.current?.openAdd?.()} title={meta.btnLabel}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 transition-colors">
                <Plus size={14} /> <span className="hidden sm:inline">{meta.btnLabel}</span>
              </button>
            )}
          </div>
        </div>
          );
        })()}

        <div className="min-w-0 px-4 sm:px-5 lg:px-6 py-5 flex flex-col gap-4">
          {renderContent()}
        </div>
      </div>
    </div>
    </OrgScopeContext.Provider>
  );
}

/* ─── One HRMS / Branch tab for a picked company ─────────────
   Used by the main sidebar. All this data is per company, so a company
   picker sits in the header; the choice is remembered per browser. */
const ORG_COMPANY_KEY = "bms_org_company";

export function OrgScopedPage({ tab, currentUser }) {
  const [companies, setCompanies] = useState(null);
  const [error, setError] = useState("");
  const [companyId, setCompanyId] = useState(() => {
    try { return localStorage.getItem(ORG_COMPANY_KEY) || ""; } catch { return ""; }
  });

  useEffect(() => {
    fetch(`${API}/api/procurement/companies`, { headers: { Authorization: `Bearer ${TOKEN()}` } })
      .then(r => r.json())
      .then(j => setCompanies(j.companies || []))
      .catch(() => setError("Could not load companies"));
  }, []);

  const list = companies || [];
  const org = list.find(c => c.id === companyId) || list[0] || null;

  const pick = (id) => {
    setCompanyId(id);
    try { localStorage.setItem(ORG_COMPANY_KEY, id); } catch { /* ignore */ }
  };

  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!companies) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" /></div>;
  }
  if (!org) return <p className="p-6 text-sm text-slate-500">No company found. Add one under Settings › Company first.</p>;

  const picker = (
    <ScopeDropdown icon={Building2} value={org.id} placeholder="Select company" countLabel="Total Companies"
      onChange={pick} align="left" subtle
      options={list.map(c => ({ id: c.id, title: c.companyName || c.company_name, code: c.companyCode || "", detail: c.state || "" }))} />
  );

  return (
    <div className="w-full min-w-0 min-h-full flex flex-col bg-[#f0f2f5]">
      <div className="flex w-full min-w-0 flex-1">
        <OrgDetail key={`${org.id}|${tab}`} org={org} currentUser={currentUser} fixedTab={tab} headerExtra={picker} />
      </div>
    </div>
  );
}

/* ─── Main Organisation Page ────────────────────────────── */
export default function Organisation({ currentUser, allowedTabs, onProjectsUpdate }) {
  const [selectedOrg,  setSelectedOrg]  = useState(null);
  const [showAddOrg,   setShowAddOrg]   = useState(false);
  const [showMore,     setShowMore]     = useState(null);
  const [orgView,      setOrgView]      = useState("card");
  const orgActionsRef = useRef({});
  const moreRef       = useRef(null);

  useEffect(() => {
    if (!showMore) return;
    const h = e => { if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMore]);

  return (
    <div className="w-full min-w-0 min-h-full flex flex-col bg-[#f0f2f5]">
      {selectedOrg ? (
        <div className="flex w-full min-w-0 flex-1">
          <OrgDetail org={selectedOrg} onBack={() => setSelectedOrg(null)} currentUser={currentUser} allowedTabs={allowedTabs} onProjectsUpdate={onProjectsUpdate} />
        </div>
      ) : (
        <>
          {/* Page header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-20">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Building2 size={16} className="text-blue-600" />
              </div>
              <h1 className="text-[15px] font-bold text-slate-800">Organisations</h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Card / Table toggle */}
              <div className="flex items-center border border-slate-200 rounded overflow-hidden bg-white">
                <button onClick={() => setOrgView("card")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${orgView === "card" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                  <LayoutGrid size={13} /> Card
                </button>
                <button onClick={() => setOrgView("table")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${orgView === "table" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                  <Table2 size={13} /> Table
                </button>
              </div>
              {/* More dropdown */}
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setShowMore(v => v ? null : "open")}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold border border-slate-200 bg-white text-slate-700 px-3 py-2 rounded hover:bg-slate-50 transition-colors">
                  More <ChevronDown size={13} className={`transition-transform ${showMore ? "rotate-180" : ""}`} />
                </button>

                {showMore && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded shadow-lg z-50 overflow-hidden">
                    <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Export</p>
                    <button onClick={() => { orgActionsRef.current?.exportExcel?.(); setShowMore(null); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors">
                      <FileSpreadsheet size={14} className="text-emerald-600" /> Export Excel
                    </button>
                    <button onClick={() => { orgActionsRef.current?.exportPDF?.(); setShowMore(null); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors">
                      <FileText size={14} className="text-red-500" /> Export PDF
                    </button>
                    <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-t border-b border-slate-100 mt-1">Import</p>
                    <button onClick={() => { orgActionsRef.current?.downloadTemplate?.(); setShowMore(null); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors">
                      <Download size={14} className="text-blue-500" /> Download Template
                    </button>
                    <button onClick={() => { orgActionsRef.current?.openUpload?.(); setShowMore(null); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors">
                      <Upload size={14} className="text-violet-500" /> Upload File
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowAddOrg(true)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-slate-900 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors">
                <Plus size={14} /> Add Organisation
              </button>
            </div>
          </div>

          <div className="min-w-0 flex-1 px-4 sm:px-6 py-5">
            <OrgList
              onSelectOrg={setSelectedOrg}
              showAdd={showAddOrg}
              onAddDone={() => setShowAddOrg(false)}
              actionsRef={orgActionsRef}
              view={orgView}
            />
          </div>
        </>
      )}
    </div>
  );
}
