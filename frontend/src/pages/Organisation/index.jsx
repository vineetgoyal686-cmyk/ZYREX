import React, { useState, useRef, useEffect } from "react";
import {
  Plus, LayoutGrid, GitBranch, Building2, Briefcase,
  MapPin, PanelLeftClose, PanelLeftOpen,
  Download, Upload, ChevronDown, FileSpreadsheet, FileText,
  Layers, Network, UserSquare2, FolderTree, ArrowLeft,
} from "lucide-react";
import OrgOverview   from "./OrgOverview";
import Departments   from "./Departments";
import Designations  from "./Designations";
import OrgChart      from "./OrgChart";
import Locations     from "./Locations";
import Structure     from "./Structure";
import Divisions     from "./Divisions";
import SubDepts      from "./SubDepts";
import ContactList   from "../Procurement/ContactList";
import OrgList       from "./OrgList";
import { loadDivisions } from "./Divisions";
import { loadSubDepts   } from "./SubDepts";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";

const NAV_SECTIONS = [
  {
    label: "Organisation",
    items: [
      { id: "overview",   label: "Overview",   icon: LayoutGrid, hasAdd: false, hasExport: false },
      { id: "structure",  label: "Structure",  icon: FolderTree, hasAdd: false, hasExport: false },
      { id: "org_chart",  label: "Org Chart",  icon: GitBranch,  hasAdd: false, hasExport: false },
    ],
  },
  {
    label: "Master Data",
    items: [
      { id: "divisions",       label: "Divisions",       icon: Layers,    hasAdd: true,  hasExport: false, btnLabel: "Add Division"       },
      { id: "departments",     label: "Departments",     icon: Building2, hasAdd: true,  hasExport: true,  btnLabel: "Add Department"     },
      { id: "sub_departments", label: "Teams",            icon: Network,   hasAdd: true,  hasExport: false, btnLabel: "Add Team"           },
      { id: "designations",    label: "Designations",    icon: Briefcase, hasAdd: true,  hasExport: false, btnLabel: "Add Designation"    },
    ],
  },
  {
    label: "People",
    items: [
      { id: "employees", label: "Employees", icon: UserSquare2, hasAdd: false, hasExport: false },
    ],
  },
  {
    label: "Settings",
    items: [
      { id: "locations", label: "Branch",    icon: MapPin, hasAdd: true, hasExport: false, btnLabel: "Add Branch"   },
    ],
  },
];

const ALL_TABS = NAV_SECTIONS.flatMap(s => s.items);

/* ─── Org Detail View (after selecting an org) ─────────── */
function OrgDetail({ org, onBack, currentUser }) {
  const [activeTab,  setActiveTab]  = useState("overview");
  const [collapsed,  setCollapsed]  = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [tooltip,    setTooltip]    = useState(null); // { label, badge, y }
  const [divCount,    setDivCount]    = useState(() => loadDivisions().length);
  const [subCount,    setSubCount]    = useState(() => loadSubDepts().length);
  const [deptCount,   setDeptCount]   = useState(0);
  const [branchCount, setBranchCount] = useState(() => { try { return JSON.parse(localStorage.getItem("org_branches_v2") || "[]").length; } catch { return 0; } });

  const exportDropRef = useRef(null);
  const uploadDropRef = useRef(null);
  const actionsRef    = useRef({});

  const meta = ALL_TABS.find(t => t.id === activeTab);

  useEffect(() => {
    fetch(`${API}/api/departments`, { headers: { Authorization: `Bearer ${TOKEN()}` } })
      .then(r => r.json())
      .then(j => setDeptCount((j.departments || []).length))
      .catch(() => {});
    try { setBranchCount(JSON.parse(localStorage.getItem("org_branches_v2") || "[]").length); } catch {}
  }, [activeTab]);

  useEffect(() => {
    const h = (e) => {
      if (exportDropRef.current && !exportDropRef.current.contains(e.target)) setShowExport(false);
      if (uploadDropRef.current && !uploadDropRef.current.contains(e.target)) setShowUpload(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const badges = {
    divisions:       divCount     || null,
    departments:     deptCount    || null,
    sub_departments: subCount     || null,
    locations:       branchCount  || null,
  };

  const renderContent = () => {
    switch (activeTab) {
      case "overview":        return <OrgOverview org={org} onNavigate={setActiveTab} />;
      case "structure":       return <Structure />;
      case "org_chart":       return <OrgChart    onNavigate={setActiveTab} />;
      case "divisions":       return <Divisions   actionsRef={actionsRef} onChange={d => setDivCount(d.length)} />;
      case "departments":     return <Departments actionsRef={actionsRef} />;
      case "sub_departments": return <SubDepts    actionsRef={actionsRef} onChange={d => setSubCount(d.length)} />;
      case "designations":    return <Designations actionsRef={actionsRef} />;
      case "employees":       return <ContactList />;
      case "locations":       return <Locations   actionsRef={actionsRef} />;
      default:                return null;
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-1">

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

      {/* Sidebar — always rendered, width transitions smoothly */}
      <div
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
            {NAV_SECTIONS.map(section => (
              <div key={section.label} className="py-2 border-b border-slate-200/70 last:border-0">
                {!collapsed && (
                  <p className="px-4 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
                    {section.label}
                  </p>
                )}
                {section.items.map(t => {
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
            ))}
          </nav>
        </aside>
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1 flex flex-col overflow-y-auto">
        {/* Per-tab header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-10 gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[15px] font-bold text-slate-800">{meta?.label}</h1>
            {badges[activeTab] != null && (
              <span className="text-[12px] text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded font-medium">
                {badges[activeTab]} {(() => { const l = meta?.label?.toLowerCase() || ""; return badges[activeTab] !== 1 && !l.endsWith("s") ? l + "s" : l; })()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {meta?.hasExport && (
              <div className="relative" ref={exportDropRef}>
                <button onClick={() => { setShowExport(v => !v); setShowUpload(false); }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium border border-slate-200 text-slate-600 px-3 py-2 rounded hover:bg-slate-50 transition-colors">
                  <Download size={14} /> Export <ChevronDown size={12} />
                </button>
                {showExport && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded shadow-lg z-30">
                    <button onClick={() => { actionsRef.current?.exportExcel?.(); setShowExport(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                      <FileSpreadsheet size={14} className="text-emerald-500" /> Export Excel
                    </button>
                    <button onClick={() => { actionsRef.current?.exportPDF?.(); setShowExport(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                      <FileText size={14} className="text-red-400" /> Export PDF
                    </button>
                  </div>
                )}
              </div>
            )}
            {meta?.hasExport && (
              <div className="relative" ref={uploadDropRef}>
                <button onClick={() => { setShowUpload(v => !v); setShowExport(false); }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium border border-slate-200 text-slate-600 px-3 py-2 rounded hover:bg-slate-50 transition-colors">
                  <Upload size={14} /> Bulk Upload <ChevronDown size={12} />
                </button>
                {showUpload && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded shadow-lg z-30">
                    <button onClick={() => { actionsRef.current?.downloadTemplate?.(); setShowUpload(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                      <Download size={14} className="text-slate-400" /> Download Template
                    </button>
                    <div className="border-t border-slate-100" />
                    <button onClick={() => { actionsRef.current?.openUpload?.(); setShowUpload(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                      <Upload size={14} className="text-blue-500" /> Upload Excel File
                    </button>
                  </div>
                )}
              </div>
            )}
            {meta?.hasAdd && (
              <button onClick={() => actionsRef.current?.openAdd?.()}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">
                <Plus size={14} /> {meta.btnLabel}
              </button>
            )}
          </div>
        </div>

        <div className="min-w-0 px-4 sm:px-5 lg:px-6 py-5 flex flex-col gap-4">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Organisation Page ────────────────────────────── */
export default function Organisation({ currentUser }) {
  const [selectedOrg,  setSelectedOrg]  = useState(null);
  const [showAddOrg,   setShowAddOrg]   = useState(false);

  return (
    <div className="w-full min-w-0 min-h-full flex flex-col bg-[#f0f2f5]">
      {selectedOrg ? (
        <div className="flex w-full min-w-0 flex-1">
          <OrgDetail org={selectedOrg} onBack={() => setSelectedOrg(null)} currentUser={currentUser} />
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
            <button
              onClick={() => setShowAddOrg(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-slate-900 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors">
              <Plus size={14} /> Add Organisation
            </button>
          </div>
          <div className="min-w-0 flex-1 px-4 sm:px-6 py-5">
            <OrgList
              onSelectOrg={setSelectedOrg}
              showAdd={showAddOrg}
              onAddDone={() => setShowAddOrg(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}
