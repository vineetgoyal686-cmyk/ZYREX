import React, { useState, useEffect, useRef } from "react";
import {
  ShieldCheck, UserPlus, Users, Save, Loader2,
  CheckCircle2, XCircle, X, Mail, Phone, Building2,
  Briefcase, Camera, FolderOpen, Trash2, Plus,
  UserCircle, Lock, Eye, EyeOff, KeyRound, SendHorizonal,
  GitMerge, ChevronDown, Pencil, LayoutDashboard, ShieldAlert
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../utils/api";
import ManageProjects from "../components/ManageProjects";
import ApprovalConfig from "../components/ApprovalConfig";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const ROLE_BADGE = {
  global_admin: { label: "Global Admin", color: "bg-violet-100 text-violet-700 border border-violet-200" },
  super_admin:  { label: "Super Admin",  color: "bg-purple-100 text-purple-700 border border-purple-200" },
  admin:        { label: "Admin",        color: "bg-blue-100 text-blue-700 border border-blue-200"        },
  user:         { label: "User",         color: "bg-slate-100 text-slate-600 border border-slate-200"     },
};

const PROFILE_SECTIONS = [
  { key: "manage_user",    label: "Users",         keys: [{ k: "view", label: "View" }, { k: "add", label: "Add" }, { k: "edit", label: "Edit" }, { k: "delete", label: "Delete" }, { k: "manage_permissions", label: "Manage Permissions" }] },
  { key: "manage_project", label: "Projects",      keys: [{ k: "view", label: "View" }, { k: "add", label: "Add" }, { k: "edit", label: "Edit" }, { k: "delete", label: "Delete" }] },
  { key: "serialization",  label: "Serialization", keys: [{ k: "view", label: "View" }, { k: "edit", label: "Edit" }] },
  { key: "approval_flow",  label: "Approval Flow", keys: [{ k: "view", label: "View" }, { k: "edit", label: "Edit" }] },
];

const DEFAULT_PROFILE_PERMS = {
  manage_user:    { view: false, add: false, edit: false, delete: false, manage_permissions: false },
  manage_project: { view: false, add: false, edit: false, delete: false },
  serialization:  { view: false, edit: false },
  approval_flow:  { view: false, edit: false },
};

const MODULE_PERM_KEYS = [
  { key: "can_view",              label: "View"        },
  { key: "can_add",               label: "Add"         },
  { key: "can_edit",              label: "Edit"        },
  { key: "can_delete",            label: "Delete"      },
  { key: "can_export",            label: "Export"      },
  { key: "can_bulk_upload",       label: "Bulk Up"     },
  { key: "can_download_document", label: "Download"    },
  { key: "can_issue",             label: "Issue"       },
  { key: "can_recall",            label: "Recall"      },
  { key: "can_reject",            label: "Reject"      },
  { key: "can_revert",            label: "Revert"      },
  { key: "can_cancel",            label: "Cancel"      },
  { key: "can_manage_amend",      label: "Manage Amend"},
];

// Per-module available permissions (based on what features each tab has)
const PERM_LABELS = {
  can_view:              "View",
  can_add:               "Add",
  can_edit:              "Edit",
  can_delete:            "Delete",
  can_export:            "Export",
  can_bulk_upload:       "Bulk Upload",
  can_download_document: "Download",
  can_issue:             "Issue",
  can_recall:            "Recall",
  can_reject:            "Reject",
  can_revert:            "Revert",
  can_cancel:            "Cancel",
  can_manage_amend:      "Manage Amend",
};

// Each module gets ONLY the permissions that are actually meaningful for it.
// Naming: can_add = create a new record OR upload a document (depending on tab type)
const MODULE_PERM_CONFIG = {
  /* ── Top-level / Management ── */
  global_dashboard:       ["can_view", "can_export"],
  inbox:                  ["can_view"],
  audit:                  ["can_view", "can_export"],

  /* ── Master Data (4 sub-tabs, each its own module) ── */
  master_data_vendor:     ["can_view", "can_edit", "can_export"],
  master_data_products:   ["can_view", "can_edit", "can_export"],
  master_data_orders:     ["can_view", "can_edit", "can_export"],
  master_data_intakes:    ["can_view", "can_edit", "can_export"],
  master_data_clauses:    ["can_view", "can_add", "can_edit", "can_export", "can_bulk_upload"],

  /* ── Project Display ── */
  dashboard:              ["can_view"],
  view_3d:                ["can_view"],
  stock_available:        ["can_view", "can_export"],

  /* ── Procurement Setup ── */
  company_list:           ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  vendor_list:            ["can_view", "can_add", "can_edit", "can_delete", "can_export", "can_download_document"],
  site_list:              ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  category_list:          ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  uom:                    ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  item_list:              ["can_view", "can_add", "can_edit", "can_delete", "can_export", "can_bulk_upload"],
  contact_list:           ["can_view", "can_add", "can_edit", "can_delete", "can_export"],

  /* ── Clauses / Terms (text masters) ── */
  term_condition:         ["can_view", "can_add", "can_edit", "can_delete"],
  payment_terms:          ["can_view", "can_add", "can_edit", "can_delete"],
  government_laws:        ["can_view", "can_add", "can_edit", "can_delete"],
  annexure:               ["can_view", "can_add", "can_edit", "can_delete", "can_download_document"],

  /* ── Confidential Documents (file-based) ── */
  loa:                    ["can_view", "can_add", "can_edit", "can_delete", "can_download_document"],
  boq:                    ["can_view", "can_add", "can_edit", "can_delete", "can_download_document"],
  drawings:               ["can_view", "can_add", "can_delete", "can_download_document"],
  ra_bills:               ["can_view", "can_add", "can_edit", "can_delete", "can_download_document"],

  /* ── Finance ── */
  payment_request:        ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  site_expense:           ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  petty_cash:             ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  bills_docs:             ["can_view", "can_add", "can_delete", "can_download_document"],

  /* ── Operations ── */
  execution_plan:         ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  staff_attendance:       ["can_view", "can_add", "can_edit", "can_delete", "can_export", "can_bulk_upload"],
  daily_manpower:         ["can_view", "can_add", "can_edit", "can_delete", "can_export"],

  /* ── Inventory / Store ── */
  received_record:        ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  consumption_record:     ["can_view", "can_add", "can_edit", "can_delete", "can_export"],

  /* ── Procurement Workflow ── */
  intake:                 ["can_view", "can_add", "can_edit", "can_delete", "can_export", "can_download_document"],
  order:                  ["can_view", "can_add", "can_edit", "can_delete", "can_export",
                           "can_issue", "can_recall", "can_reject", "can_revert", "can_cancel",
                           "can_manage_amend"],
};
const DEFAULT_MODULE_PERMS = ["can_view", "can_add", "can_edit", "can_delete", "can_export"];

// Modules currently shipped in production. Unbuilt modules (placeholders in
// the sidebar) get only View permission until their pages are implemented.
// All current modules are production-ready. Add new entries with `: false`
// to mark them as "Soon" (view-only) when they haven't shipped yet.
const MODULE_BUILT_STATUS = {
  global_dashboard: true, inbox: true, audit: true, annexure: true,
  master_data_vendor: true, master_data_products: true,
  master_data_orders: true, master_data_intakes: true, master_data_clauses: true,
  dashboard: true, view_3d: true,
  intake: true, order: true,
  company_list: true, vendor_list: true, site_list: true, uom: true,
  category_list: true, item_list: true, contact_list: true,
  term_condition: true, payment_terms: true, government_laws: true,
  loa: true, boq: true, drawings: true, ra_bills: true,
  site_expense: true, petty_cash: true, bills_docs: true, payment_request: true,
  execution_plan: true, daily_manpower: true, staff_attendance: true,
  received_record: true, stock_available: true, consumption_record: true,
};

const isModuleBuilt = (key) => MODULE_BUILT_STATUS[key] !== false;

// Use this everywhere instead of MODULE_PERM_CONFIG directly. It collapses
// unbuilt modules to view-only so their UI/save behaviour stays consistent.
const getModulePerms = (key) =>
  isModuleBuilt(key)
    ? (MODULE_PERM_CONFIG[key] || DEFAULT_MODULE_PERMS)
    : ["can_view"];

// 2-level hierarchy matching sidebar exactly
const MODULE_SECTIONS = [
  {
    section: "Global",
    groups: [
      { label: "Top Level",         keys: ["global_dashboard", "inbox"] },
      { label: "Procurement Setup", keys: ["company_list","site_list","vendor_list","uom","category_list","item_list","contact_list","term_condition","payment_terms","government_laws","annexure"] },
      { label: "Master Data",       keys: ["master_data_vendor","master_data_products","master_data_orders","master_data_intakes","master_data_clauses"] },
      { label: "Audit",             keys: ["audit"], single: true },
    ],
  },
  {
    section: "Project",
    groups: [
      { label: "Dashboard",         keys: ["dashboard"],     single: true },
      { label: "3D View",           keys: ["view_3d"],       single: true },
      { label: "Procurement",       keys: ["intake","order"] },
      { label: "Inventory",         keys: ["received_record","stock_available","consumption_record"] },
      { label: "Operations",        keys: ["execution_plan","staff_attendance","daily_manpower"] },
      { label: "Finance",           keys: ["payment_request","site_expense","petty_cash","bills_docs"] },
      { label: "Confidential",      keys: ["loa","boq","drawings","ra_bills"] },
    ],
  },
];

// Color theme per permission key — keeps the dense checkbox grid scannable.
const PERM_COLOR = {
  can_view:              "text-slate-600",
  can_add:               "text-emerald-600",
  can_edit:              "text-amber-600",
  can_delete:            "text-rose-600",
  can_export:            "text-indigo-600",
  can_bulk_upload:       "text-cyan-600",
  can_download_document: "text-sky-600",
  can_issue:             "text-violet-600",
  can_recall:            "text-fuchsia-600",
  can_reject:            "text-red-600",
  can_revert:            "text-orange-600",
  can_cancel:            "text-stone-600",
  can_manage_amend:      "text-purple-700",
};

/* Compact searchable dropdown for picking a designation template.
   Type to filter, click to apply — closes on outside click. */
const SearchableTemplateSelect = ({ designations, onPick }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = designations.filter(d =>
    d.name.toLowerCase().includes(query.toLowerCase()) ||
    (d.description || "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-56 flex items-center justify-between pl-3 pr-2 py-1.5 bg-white border border-indigo-200 rounded-lg text-[13px] font-medium outline-none hover:border-indigo-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 cursor-pointer">
        <span className="text-slate-500">Choose...</span>
        <ChevronDown size={14} className={`text-indigo-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 bg-white border border-indigo-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search template..."
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-[12px] font-medium outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100" />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-slate-400">No templates match</p>
            ) : filtered.map(d => (
              <button key={d.id} type="button"
                onClick={() => { onPick(d); setOpen(false); setQuery(""); }}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition border-b border-slate-50 last:border-0">
                <p className="text-[13px] font-bold text-slate-800">{d.name}</p>
                {d.description && (
                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{d.description}</p>
                )}
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {(d.app_permissions || []).filter(p => p.can_view).length} modules
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* Reusable grouped permission renderer — mirrors sidebar hierarchy */
const GroupedPermissions = ({ modules, onChange }) => {
  const allSectionKeys = MODULE_SECTIONS.flatMap(s => s.groups.flatMap(g => g.keys));
  const ungrouped = modules.filter(m => !allSectionKeys.includes(m.module_key));
  const [bulkOpen, setBulkOpen] = useState(false);
  const [filter, setFilter] = useState("all"); // all | built | unbuilt | edited
  const [search, setSearch] = useState("");

  const matchesFilter = (m) => {
    if (search && !m.module_name.toLowerCase().includes(search.toLowerCase()) && !m.module_key.includes(search.toLowerCase())) return false;
    const built = isModuleBuilt(m.module_key);
    if (filter === "built"   && !built) return false;
    if (filter === "unbuilt" &&  built) return false;
    if (filter === "edited") {
      const keys = getModulePerms(m.module_key);
      if (!keys.some(k => m[k])) return false;
    }
    return true;
  };

  const toggleAllGlobal = (key, val) => {
    modules.forEach(m => {
      const avail = getModulePerms(m.module_key);
      if (avail.includes(key)) onChange(m.module_id, key, val);
    });
  };

  const toggleAllSection = (groupKeys, val) => {
    modules.filter(m => groupKeys.includes(m.module_key)).forEach(m => {
      const avail = getModulePerms(m.module_key);
      avail.forEach(k => onChange(m.module_id, k, val));
    });
  };

  // Card-style row — title on top (like Profile Section Access cards),
  // permissions in a 3-column grid below.
  const renderRow = (mod) => {
    const availKeys = getModulePerms(mod.module_key);
    const built = isModuleBuilt(mod.module_key);
    const allChecked = availKeys.every(k => mod[k]);
    const anyChecked = availKeys.some(k => mod[k]);
    return (
      <div key={mod.module_id}
        className={`rounded-xl border p-3.5 transition-all
          ${!built
            ? "border-amber-100 bg-amber-50/30"
            : anyChecked
              ? "border-blue-200 bg-blue-50/40"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}>
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-[13px] font-bold truncate ${built ? "text-slate-800" : "text-slate-500"}`}>
                {mod.module_name}
              </p>
              {!built && (
                <span title="Module not yet implemented — only View applies"
                  className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[8px] font-black uppercase tracking-widest border border-amber-200">
                  Soon
                </span>
              )}
            </div>
            <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest mt-0.5 truncate">
              {mod.module_key}
            </p>
          </div>
          {availKeys.length > 1 && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0 px-2 py-1 rounded-md hover:bg-slate-100/70 transition">
              <input type="checkbox" checked={allChecked}
                ref={el => { if (el) el.indeterminate = anyChecked && !allChecked; }}
                onChange={e => availKeys.forEach(k => onChange(mod.module_id, k, e.target.checked))}
                className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer" />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">All</span>
            </label>
          )}
        </div>

        {/* Permission grid — 3 per row, wraps as needed */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
          {availKeys.map(key => (
            <label key={key}
              className="flex items-center gap-2 cursor-pointer select-none group px-1.5 py-1 rounded-md hover:bg-white/80 transition">
              <input type="checkbox" checked={mod[key] || false}
                onChange={e => onChange(mod.module_id, key, e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer transition-transform group-active:scale-90" />
              <span className={`text-[11px] font-semibold ${PERM_COLOR[key] || "text-slate-500"} group-hover:opacity-80 transition`}>
                {PERM_LABELS[key]}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* SEARCH + FILTER STRIP */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm py-2.5 -mx-1 px-1 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <input type="text" placeholder="Search module..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        <div className="flex bg-slate-100 rounded-lg p-0.5 text-[10px] font-bold">
          {[
            { v: "all",     l: "All" },
            { v: "built",   l: "Live" },
            { v: "unbuilt", l: "Soon" },
            { v: "edited",  l: "Edited" },
          ].map(f => (
            <button key={f.v} type="button" onClick={() => setFilter(f.v)}
              className={`px-3 py-1 rounded-md uppercase tracking-wider transition
                ${filter === f.v ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {/* GLOBAL BULK ACTIONS — collapsible to keep things calm */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
        <button type="button" onClick={() => setBulkOpen(o => !o)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-100/50 transition">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Global Bulk Actions</p>
            <span className="text-[10px] text-slate-400 font-medium ml-1">(apply to every module)</span>
          </div>
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${bulkOpen ? "rotate-180" : ""}`} />
        </button>
        {bulkOpen && (
          <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {MODULE_PERM_KEYS.map(pk => (
              <button key={pk.key} type="button"
                onClick={() => toggleAllGlobal(pk.key, true)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:shadow-sm transition-all text-center">
                All {pk.label}
              </button>
            ))}
            <button type="button" onClick={() => modules.forEach(m => getModulePerms(m.module_key).forEach(k => onChange(m.module_id, k, false)))}
              className="px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-[10px] font-bold text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-xs text-center">
              Clear All
            </button>
          </div>
        )}
      </div>

      {MODULE_SECTIONS.map(({ section, groups }) => {
        const sectionHasMods = groups.some(g => modules.some(m => g.keys.includes(m.module_key) && matchesFilter(m)));
        if (!sectionHasMods) return null;
        return (
          <div key={section}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{section}</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <div className="space-y-3 pl-2">
              {groups.map(group => {
                const groupMods = modules.filter(m => group.keys.includes(m.module_key) && matchesFilter(m));
                if (groupMods.length === 0) return null;

                const allInGroupChecked = groupMods.every(m => getModulePerms(m.module_key).every(k => m[k]));

                return (
                  <div key={group.label} className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-bold text-slate-500">{group.label}</span>
                      <button type="button" onClick={() => toggleAllSection(group.keys, !allInGroupChecked)}
                        className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md transition-all ${allInGroupChecked ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400 hover:text-blue-600"}`}>
                        {allInGroupChecked ? "Unselect Group" : "Select Group"}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {groupMods.map(renderRow)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {ungrouped.filter(matchesFilter).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Other</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {ungrouped.filter(matchesFilter).map(renderRow)}
          </div>
        </div>
      )}
    </div>
  );
};

const inp = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all shadow-sm";
const lbl = "text-[12px] font-bold text-slate-500 mb-1.5 ml-1 block";
const btnPrimary = "flex items-center gap-2 rounded-2xl bg-linear-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-200 hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50";
const secHeader = "flex items-center gap-2 mb-5 border-l-4 border-blue-500 pl-4 py-1";
const secTitle = "text-xs font-black uppercase tracking-[0.2em] text-slate-400";

/* Resize image to max 800px, return base64 JPEG */
const resizeImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File read failed"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image load failed"));
      img.onload = () => {
        try {
          const maxSize = 800;
          const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width  = Math.round(img.width  * ratio) || 1;
          canvas.height = Math.round(img.height * ratio) || 1;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        } catch (err) { reject(err); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

/* Resize signature image — preserves PNG transparency (white background for JPEG files) */
const resizeSignature = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File read failed"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image load failed"));
      img.onload = () => {
        try {
          const maxSize = 1200;
          const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width  = Math.round(img.width  * ratio) || 1;
          canvas.height = Math.round(img.height * ratio) || 1;
          const ctx = canvas.getContext("2d");
          const isPng = file.type === "image/png";
          if (!isPng) {
            // Fill white background for non-PNG so transparency doesn't go black
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.95));
        } catch (err) { reject(err); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

const Toast = ({ msg, type }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3 shadow-lg text-sm font-semibold
    ${type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
    {type === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
    {msg}
  </div>
);

const PermRow = ({ perm, onChange }) => (
  <div className="flex items-center gap-1 py-2.5 border-b border-slate-50 last:border-0">
    <span className="w-32 shrink-0 text-sm font-medium text-slate-700 truncate">{perm.module_name}</span>
    {MODULE_PERM_KEYS.map(({ key }) => (
      <div key={key} className="w-14 flex justify-center shrink-0">
        <input type="checkbox" checked={perm[key] || false}
          onChange={(e) => onChange(perm.module_id, key, e.target.checked)}
          className="w-4 h-4 rounded accent-blue-600" />
      </div>
    ))}
  </div>
);

/* ════════════════════════════════════════
   MAIN PROFILE COMPONENT
════════════════════════════════════════ */
export default function Profile({ onProfileUpdate, onProjectsUpdate }) {
  const currentUser      = JSON.parse(localStorage.getItem("bms_user") || "{}");
  const isAdminOrAbove   = ["global_admin", "super_admin", "admin"].includes(currentUser.role);
  const isGlobalAdmin    = currentUser.role === "global_admin";

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

  const NAV = [
    { id: "profile",  label: "My Profile",      icon: UserCircle },
    { id: "security", label: "Security",         icon: Lock       },
    ...(isAdminOrAbove ? [
      { id: "add_user", label: "Add User",       icon: UserPlus   },
      { id: "team",     label: "Manage Users",   icon: Users      },
    ] : []),
    ...(isGlobalAdmin ? [
      { id: "projects", label: "Manage Projects", icon: FolderOpen },
    ] : []),
  ];

  const [section, setSection]   = useState("profile");
  const [toast, setToast]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);

  /* Avatar & Header */
  const [avatar, setAvatar]     = useState(currentUser.avatar || null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  
  const uiSettings = currentUser.profile_permissions?.ui || {};
  const [coverImage, setCoverImage] = useState(uiSettings.cover_image || null);
  const [coverLoading, setCoverLoading] = useState(false);
  
  const GRADIENTS = [
    { name: "Midnight", value: "linear-gradient(135deg, #1a1f3c 0%, #2d1b69 100%)" },
    { name: "Ocean",    value: "linear-gradient(135deg, #0f172a 0%, #2563eb 100%)" },
    { name: "Sunset",   value: "linear-gradient(135deg, #4c1d95 0%, #db2777 100%)" },
    { name: "Emerald",  value: "linear-gradient(135deg, #064e3b 0%, #059669 100%)" },
    { name: "Coal",     value: "linear-gradient(135deg, #111827 0%, #374151 100%)" },
    { name: "Royal",    value: "linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)" },
  ];
  const [headerTheme, setHeaderTheme] = useState(uiSettings.header_theme || GRADIENTS[0].value);
  const [showThemePicker, setShowThemePicker] = useState(false);

  /* Signature */
  const [signature, setSignature]           = useState(currentUser.signature || uiSettings.signature || null);
  const [signatureLoading, setSignatureLoading] = useState(false);

  /* Avatar lightbox */
  const [avatarLightbox, setAvatarLightbox] = useState(false);

  const fileRef                 = useRef();
  const coverFileRef            = useRef();
  const signatureRef            = useRef();

  /* Edit profile */
  const [profile, setProfile]   = useState({
    name:        currentUser.name        || "",
    contact_no:  currentUser.contact_no  || "",
    designation: currentUser.designation || "",
    department:  currentUser.department  || "",
  });

  /* Security — OTP flow */
  const [secStep, setSecStep]   = useState(1); // 1=send OTP, 2=verify+change
  const [otpLoading, setOtpLoading] = useState(false);
  const [otp, setOtp]           = useState("");
  const [newPw, setNewPw]       = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  /* Add user */
  const [newUser, setNewUser]             = useState({ name: "", email: "", contact_no: "", designation: "", department: "", role: "user" });
  const [newUserProfilePerms, setNewUserProfilePerms] = useState(DEFAULT_PROFILE_PERMS);
  const [newUserModules, setNewUserModules]   = useState([]);
  const [modulesLoading, setModulesLoading]   = useState(false);
  const [newUserSignature, setNewUserSignature] = useState(null);
  const [newUserSigLoading, setNewUserSigLoading] = useState(false);
  const newUserSigRef = useRef();
  const [allPermsSelected, setAllPermsSelected] = useState(false);

  /* Team / permissions */
  const [members, setMembers]         = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [permUser, setPermUser]       = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [editingProfilePerms, setEditingProfilePerms] = useState(DEFAULT_PROFILE_PERMS);
  const [permLoading, setPermLoading] = useState(false);
  // Tracks the designation template a user picked from "Apply Template"
  // so savePerms can also update users.designation + users.designation_id.
  const [pickedTemplate, setPickedTemplate] = useState(null);
  const [permFilter, setPermFilter]   = useState("all");
  const [viewType, setViewType]       = useState("list");
  const [confirmRoleChange, setConfirmRoleChange] = useState(null); // { member, newRole }

  /* Designations / Permission Templates */
  const [designations, setDesignations]               = useState([]);
  const [designationsLoading, setDesignationsLoading] = useState(false);
  const [showDesgModal, setShowDesgModal]             = useState(false);
  const [editingDesg, setEditingDesg]                 = useState(null); // null = create, object = edit
  const [desgName, setDesgName]                       = useState("");
  const [desgDescription, setDesgDescription]         = useState("");
  const [desgModules, setDesgModules]                 = useState([]);
  const [desgProfilePerms, setDesgProfilePerms]       = useState(DEFAULT_PROFILE_PERMS);
  const [desgSaving, setDesgSaving]                   = useState(false);

  /* Projects count for header stats */
  const [projectsCount, setProjectsCount] = useState(0);
  useEffect(() => {
    // 1. Fetch projects count for header
    fetch(`${API}/api/projects`).then(r => r.json())
      .then(d => setProjectsCount((d.projects || []).filter(p => p.isActive).length))
      .catch(() => {});

    // 2. Sync current user permissions from DB (in case admin changed them)
    const syncProfile = async () => {
      try {
        const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
        if (!u.id) return;
        const res = await fetch(`${API}/api/users/${u.id}/permissions`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("bms_token")}` }
        });
        if (res.ok) {
          const data = await res.json();
          const updatedUser = { 
            ...u, 
            profile_permissions: data.profile_permissions,
            app_permissions: data.permissions 
          };
          localStorage.setItem("bms_user", JSON.stringify(updatedUser));
          onProfileUpdate?.(updatedUser);
        }
      } catch (err) {
        console.error("Profile sync failed", err);
      }
    };
    syncProfile();
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (section === "team" && isAdminOrAbove) fetchTeam();
  }, [section]);

  useEffect(() => {
    // Designations are needed both on the Permissions section (manage templates)
    // and on Manage Users (apply template to existing user dropdown)
    if (
      (section === "permissions" || section === "team") &&
      (isGlobalAdmin || currentUser.role === "super_admin")
    ) {
      fetchDesignations();
    }
  }, [section]);

  useEffect(() => {
    if (showAddUser) {
      if (newUserModules.length === 0) fetchModulesForNewUser();
      if (designations.length === 0) fetchDesignations();
    }
  }, [showAddUser]);

  const applyDesignationToNewUser = (desgId) => {
    if (!desgId) return;
    const tpl = designations.find(d => d.id === desgId);
    if (!tpl) return;
    setNewUser(p => ({ ...p, designation: tpl.name, designation_id: tpl.id }));
    setNewUserProfilePerms(tpl.profile_permissions || DEFAULT_PROFILE_PERMS);
    const stored = tpl.app_permissions || [];
    setNewUserModules(prev => prev.map(m => {
      const match = stored.find(s => s.module_id === m.module_id);
      if (!match) return { ...m,
        can_view: false, can_add: false, can_edit: false, can_delete: false,
        can_bulk_upload: false, can_export: false, can_download_document: false,
        can_issue: false, can_recall: false, can_reject: false, can_revert: false,
        can_cancel: false, can_manage_amend: false,
      };
      return { ...m, ...match };
    }));
  };

  /* ── Designation handlers ── */
  const fetchDesignations = async () => {
    setDesignationsLoading(true);
    try {
      const { data } = await api.get("/api/designations");
      setDesignations(data.designations || []);
    } catch { showToast("Failed to load designations", "error"); }
    finally { setDesignationsLoading(false); }
  };

  const blankDesgModules = async () => {
    const { data } = await api.get("/api/users/modules/list");
    return (data.modules || []).map(m => ({
      module_id:  m.id,
      module_key: m.module_key,
      module_name: m.module_name,
      can_view: false, can_add: false, can_edit: false, can_delete: false,
      can_bulk_upload: false, can_export: false, can_download_document: false,
      can_issue: false, can_recall: false, can_reject: false, can_revert: false,
      can_cancel: false, can_manage_amend: false,
    }));
  };

  const openDesgCreate = async () => {
    setEditingDesg(null);
    setDesgName("");
    setDesgDescription("");
    setDesgProfilePerms(DEFAULT_PROFILE_PERMS);
    setDesgModules(await blankDesgModules());
    setShowDesgModal(true);
  };

  const openDesgEdit = async (d) => {
    setEditingDesg(d);
    setDesgName(d.name || "");
    setDesgDescription(d.description || "");
    const draw = d.profile_permissions || {};
    if (draw.add_project && !draw.manage_project) draw.manage_project = { view: !!draw.add_project.view, add: !!draw.add_project.edit, edit: !!draw.add_project.edit, delete: false };
    if (draw.manage_user && draw.manage_user.edit !== undefined && draw.manage_user.add === undefined) { const e = !!draw.manage_user.edit; draw.manage_user = { view: !!draw.manage_user.view, add: e, edit: e, delete: e, manage_permissions: e }; }
    const dmerged = {};
    PROFILE_SECTIONS.forEach(sec => { dmerged[sec.key] = { ...Object.fromEntries(sec.keys.map(({ k }) => [k, false])), ...(draw[sec.key] || {}) }; });
    setDesgProfilePerms(dmerged);
    // Merge stored app_permissions onto fresh module list
    const fresh = await blankDesgModules();
    const stored = d.app_permissions || [];
    setDesgModules(fresh.map(m => {
      const match = stored.find(s => s.module_id === m.module_id);
      return match ? { ...m, ...match } : m;
    }));
    setShowDesgModal(true);
  };

  const updateDesgModule = (modId, key, val) =>
    setDesgModules(prev => prev.map(m => {
      if (m.module_id !== modId) return m;
      const updated = { ...m, [key]: val };
      if (val === true && key !== "can_view") updated.can_view = true;
      return updated;
    }));

  // Master toggle for the designation modal — flips every profile section AND
  // every available app-tab permission for every module.
  const setAllDesgPerms = (checked) => {
    const nextProfile = {};
    PROFILE_SECTIONS.forEach(s => {
      nextProfile[s.key] = Object.fromEntries(s.keys.map(({ k }) => [k, checked]));
    });
    setDesgProfilePerms(nextProfile);
    setDesgModules(prev => prev.map(m => {
      const availKeys = getModulePerms(m.module_key);
      return { ...m, ...Object.fromEntries(availKeys.map(k => [k, checked])) };
    }));
  };

  // True only when literally everything is ticked — drives the master checkbox state
  const isDesgAllChecked = () => {
    if (!desgModules.length) return false;
    const profileFull = PROFILE_SECTIONS.every(s =>
      s.keys.every(({ k }) => desgProfilePerms[s.key]?.[k])
    );
    const modulesFull = desgModules.every(m => {
      const availKeys = getModulePerms(m.module_key);
      return availKeys.every(k => m[k]);
    });
    return profileFull && modulesFull;
  };

  const saveDesignation = async () => {
    if (!desgName.trim()) { showToast("Designation name is required", "error"); return; }
    setDesgSaving(true);
    try {
      const payload = {
        name: desgName.trim(),
        description: desgDescription.trim() || null,
        app_permissions: desgModules,
        profile_permissions: desgProfilePerms,
      };
      if (editingDesg) {
        await api.put(`/api/designations/${editingDesg.id}`, payload);
        showToast("Designation updated");
      } else {
        await api.post("/api/designations", payload);
        showToast("Designation created");
      }
      setShowDesgModal(false);
      fetchDesignations();
    } catch (err) {
      showToast(err.response?.data?.error || "Save failed", "error");
    } finally {
      setDesgSaving(false);
    }
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

  const fetchModulesForNewUser = async () => {
    setModulesLoading(true);
    try {
      const { data } = await api.get("/api/users/modules/list");
      setNewUserModules((data.modules || []).map(m => ({
        module_id:             m.id,
        module_key:            m.module_key,
        module_name:           m.module_name,
        can_view:              false,
        can_add:               false,
        can_edit:              false,
        can_delete:            false,
        can_bulk_upload:       false,
        can_export:            false,
        can_download_document: false,
        can_issue:             false,
        can_recall:            false,
        can_reject:            false,
        can_revert:            false,
        can_cancel:            false,
        can_manage_amend:      false,
      })));
    } catch { /* silent */ }
    finally { setModulesLoading(false); }
  };

  const updateNewUserModule = (modId, key, val) =>
    setNewUserModules(prev => prev.map(m => {
      if (m.module_id !== modId) return m;
      const updated = { ...m, [key]: val };
      if (val === true && key !== "can_view") {
        updated.can_view = true;
      }
      return updated;
    }));

  const handleAllPerms = (checked) => {
    setAllPermsSelected(checked);
    setNewUserModules(prev => prev.map(m => {
      const availKeys = getModulePerms(m.module_key);
      return { ...m, ...Object.fromEntries(availKeys.map(k => [k, checked])) };
    }));
    // Bulk update Profile Section Perms too
    const nextProfilePerms = {};
    Object.keys(DEFAULT_PROFILE_PERMS).forEach(k => { nextProfilePerms[k] = { view: checked, edit: checked }; });
    setNewUserProfilePerms(nextProfilePerms);
  };

  const applyRoleDefaults = (role) => {
    if (role === "user") return; // Keep manual for user

    // Handle App Tab Permissions
    // can_manage_amend is restricted — only global_admin grants it manually.
    setNewUserModules(prev => prev.map(m => {
      const availKeys = getModulePerms(m.module_key);
      const updates = {};
      availKeys.forEach(k => {
        if (role === "super_admin") updates[k] = k !== "can_delete" && k !== "can_manage_amend";
        if (role === "admin")       updates[k] = k === "can_view";
      });
      return { ...m, ...updates };
    }));

    // Handle Profile Management Access
    const nextProfilePerms = {};
    Object.keys(DEFAULT_PROFILE_PERMS).forEach(k => {
      if (role === "super_admin") nextProfilePerms[k] = { view: true, edit: true };
      if (role === "admin")       nextProfilePerms[k] = { view: true, edit: false };
    });
    setNewUserProfilePerms(nextProfilePerms);
    setAllPermsSelected(role === "super_admin");
  };

  const fetchTeam = async () => {
    setTeamLoading(true);
    try {
      const { data } = await api.get("/api/users");
      const users = data.users || [];
      setMembers(users);
      // Sync current user's role/data if it changed in DB
      const fresh = users.find(u => u.id === currentUser.id);
      if (fresh && (fresh.role !== currentUser.role || fresh.name !== currentUser.name)) {
        const updatedUser = { ...currentUser, ...fresh };
        localStorage.setItem("bms_user", JSON.stringify(updatedUser));
        onProfileUpdate?.(updatedUser);
      }
    } catch { showToast("Failed to load team", "error"); }
    finally { setTeamLoading(false); }
  };


  /* ── Avatar upload ── */
  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";

    setAvatarLoading(true);
    try {
      // Step 1: resize karo
      const base64 = await resizeImage(file);

      // Step 2: preview dikhao
      setAvatar(base64);

      // Step 3: Supabase Storage pe upload
      const { data } = await api.post("/api/auth/avatar", { avatar: base64 });
      setAvatar(data.url);
      const updated = { ...currentUser, avatar: data.url };
      localStorage.setItem("bms_user", JSON.stringify(updated));
      onProfileUpdate?.(updated);
      showToast("Profile picture updated successfully");
    } catch (err) {
      showToast(err?.response?.data?.error || err?.message || "Upload failed", "error");
    } finally {
      setAvatarLoading(false);
    }
  };

  /* ── Avatar delete ── */
  const deleteAvatar = async () => {
    setAvatar(null);
    const updated = { ...currentUser, avatar: null };
    localStorage.setItem("bms_user", JSON.stringify(updated));
    onProfileUpdate?.(updated);
    try { await api.delete("/api/auth/avatar"); } catch { /* silent */ }
    showToast("Profile picture removed");
  };

  const handleCoverChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCoverLoading(true);
    try {
      const base64 = await resizeImage(file); // reuse helper
      const { data } = await api.post("/api/auth/cover", { cover: base64 });
      setCoverImage(data.url);
      const updated = { ...currentUser, profile_permissions: { ...currentUser.profile_permissions, ui: { ...currentUser.profile_permissions?.ui, cover_image: data.url } } };
      localStorage.setItem("bms_user", JSON.stringify(updated));
      onProfileUpdate?.(updated);
      showToast("Cover image updated");
    } catch (err) {
      showToast("Cover upload failed", "error");
    } finally { setCoverLoading(false); }
  };

  const changeHeaderTheme = async (themeValue) => {
    try {
      setHeaderTheme(themeValue);
      setShowThemePicker(false);

      // Agar cover image hai toh pehle Storage se delete karo
      if (coverImage) {
        setCoverImage(null);
        await api.delete("/api/auth/cover");
      }

      await api.put("/api/auth/profile", { header_theme: themeValue });

      const updated = { ...currentUser, profile_permissions: { ...currentUser.profile_permissions, ui: { ...currentUser.profile_permissions?.ui, header_theme: themeValue, cover_image: null } } };
      localStorage.setItem("bms_user", JSON.stringify(updated));
      onProfileUpdate?.(updated);
      showToast("Theme applied effectively");
    } catch { showToast("Failed to save theme", "error"); }
  };

  const deleteCover = async () => {
    setCoverImage(null);
    const updated = { ...currentUser, profile_permissions: { ...currentUser.profile_permissions, ui: { ...currentUser.profile_permissions?.ui, cover_image: null } } };
    localStorage.setItem("bms_user", JSON.stringify(updated));
    onProfileUpdate?.(updated);
    try { await api.delete("/api/auth/cover"); } catch { /* silent */ }
    showToast("Cover removed");
  };
  /* ── Signature upload ── */
  const handleSignatureChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setSignatureLoading(true);
    try {
      const base64 = await resizeSignature(file);
      setSignature(base64);
      const { data } = await api.post("/api/auth/signature", { signature: base64 });
      setSignature(data.url);
      const updated = { ...currentUser, signature: data.url };
      localStorage.setItem("bms_user", JSON.stringify(updated));
      onProfileUpdate?.(updated);
      showToast("Signature uploaded successfully");
    } catch (err) {
      showToast(err?.response?.data?.error || "Signature upload failed", "error");
    } finally { setSignatureLoading(false); }
  };

  const deleteSignature = async () => {
    setSignature(null);
    const updated = { ...currentUser, signature: null };
    localStorage.setItem("bms_user", JSON.stringify(updated));
    onProfileUpdate?.(updated);
    try { await api.delete("/api/auth/signature"); } catch { /* silent */ }
    showToast("Signature removed");
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.put("/api/auth/profile", profile);
      // Backend now returns signed URLs for avatar/cover, so we can use data.user directly
      const updated = { ...currentUser, ...data.user };
      localStorage.setItem("bms_user", JSON.stringify(updated));
      onProfileUpdate?.(updated);
      showToast("Profile updated successfully");
    } catch { showToast("Failed to update profile", "error"); }
    finally { setLoading(false); }
  };

  /* ── Security: Send OTP ── */
  const sendOtp = async () => {
    setOtpLoading(true);
    try {
      await api.post("/api/auth/send-otp", { email: currentUser.email });
      setSecStep(2);
      showToast(`OTP sent to ${currentUser.email}`);
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to send OTP", "error");
    } finally { setOtpLoading(false); }
  };

  /* ── Security: Verify OTP + Change Password ── */
  const verifyOtpAndChange = async (e) => {
    e.preventDefault();
    if (newPw !== confirmPw) return showToast("Passwords do not match", "error");
    if (newPw.length < 8)    return showToast("Password must be at least 8 characters", "error");
    if (!otp.trim())         return showToast("Enter the OTP", "error");
    setOtpLoading(true);
    try {
      await api.post("/api/auth/verify-otp-change-password", {
        email: currentUser.email,
        otp,
        newPassword: newPw,
      });
      showToast("Password changed successfully!");
      setSecStep(1);
      setOtp(""); setNewPw(""); setConfirmPw("");
    } catch (err) {
      showToast(err.response?.data?.error || "Invalid OTP or failed", "error");
    } finally { setOtpLoading(false); }
  };



  /* ── New user signature pick (local preview, upload after user is created) ── */
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

  /* ── Add member ── */
  const addMember = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const { data } = await api.post("/api/users", { ...newUser, profile_permissions: newUserProfilePerms, createdById: u.id || "", createdByName: u.name || "" });
      const userId = data.user?.id;
      if (userId && newUserModules.some(m => MODULE_PERM_KEYS.some(k => m[k.key]))) {
        await api.put(`/api/users/${userId}/permissions`, { permissions: newUserModules });
      }
      // Upload signature if provided
      if (userId && newUserSignature) {
        try { await api.post(`/api/users/${userId}/signature`, { signature: newUserSignature }); } catch { /* non-blocking */ }
      }
      setNewUser({ name: "", email: "", contact_no: "", designation: "", designation_id: null, department: "", role: "user" });
      setNewUserProfilePerms(DEFAULT_PROFILE_PERMS);
      setNewUserSignature(null);
      setAllPermsSelected(false);
      setNewUserModules(prev => prev.map(m => ({ ...m, can_view: false, can_add: false, can_edit: false, can_delete: false, can_bulk_upload: false, can_export: false, can_download_document: false })));
      setShowAddUser(false); // Modal close karo
      showToast(`Invite sent to ${newUser.email}`);
      fetchTeam(); // List refresh karo
    } catch (err) { showToast(err.response?.data?.error || "Failed to add member", "error"); }
    finally { setLoading(false); }
  };

  /* ── Toggle active ── */
  const toggleActive = async (member) => {
    try {
      await api.put(`/api/users/${member.id}`, { is_active: !member.is_active });
      setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, is_active: !m.is_active } : m));
      showToast(`${member.name} ${member.is_active ? "deactivated" : "activated"}`);
    } catch { showToast("Failed to update member", "error"); }
  };

  /* ── Change role ── */
  const [editingRoleId, setEditingRoleId] = useState(null);
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
    } finally {
      setLoading(false);
      setConfirmRoleChange(null);
    }
  };

  /* ── Remove user (global_admin only) ── */
  const removeUser = async (member) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${member.name}"? This action cannot be undone.`)) return;
    try {
      await api.delete(`/api/users/${member.id}`);
      setMembers(prev => prev.filter(m => m.id !== member.id));
      showToast(`${member.name} removed`);
    } catch (err) { showToast(err.response?.data?.error || "Failed to remove user", "error"); }
  };

  /* ── Permissions ── */
  const viewPerms = async (member) => {
    setPermUser(member);
    setPermFilter("all");
    setPermLoading(true);
    setPermissions([]); // PURANI VALUES CLEAR KARO
    setEditingProfilePerms(DEFAULT_PROFILE_PERMS); // PROFILE PERMS BHI RESET KARO
    setPickedTemplate(null); // Clear any leftover template selection from a previous user
    try {
      const { data } = await api.get(`/api/users/${member.id}/permissions`);
      setPermissions(data.permissions || []);
      const raw = data.profile_permissions || {};
      // migrate old add_project key → manage_project
      if (raw.add_project && !raw.manage_project) raw.manage_project = { view: !!raw.add_project.view, add: !!raw.add_project.edit, edit: !!raw.add_project.edit, delete: false };
      // migrate old manage_user { view, edit } → new granular keys
      if (raw.manage_user && raw.manage_user.edit !== undefined && raw.manage_user.add === undefined) {
        const e = !!raw.manage_user.edit;
        raw.manage_user = { view: !!raw.manage_user.view, add: e, edit: e, delete: e, manage_permissions: e };
      }
      // merge with defaults so all keys exist
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
      // Smart Toggle: If Edit/Delete/Add/Export/Download/Bulk is checked, View must be checked
      if (value === true && ["can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_download_document"].includes(key)) {
        updated.can_view = true;
      }
      return updated;
    }));

  const savePerms = async () => {
    setPermLoading(true);
    try {
      // Strip stale module entries — template snapshots may carry module_ids that
      // no longer exist if those modules were deleted/renamed in DB.
      const validIds = new Set(permissions.map(p => p.module_id).filter(Boolean));
      const cleanPerms = permissions.filter(p => p.module_id && validIds.has(p.module_id));

      const designationPatch = pickedTemplate ? {
        designation:    pickedTemplate.name,
        designation_id: pickedTemplate.id,
      } : {};

      await api.put(`/api/users/${permUser.id}/permissions`, {
        permissions: cleanPerms,
        profile_permissions: editingProfilePerms,
        ...designationPatch,
      });

      // If saving permissions for the currently logged-in user,
      // sync localStorage immediately so components read fresh permissions
      if (permUser.id === currentUser.id) {
        const updatedSelf = {
          ...currentUser,
          app_permissions: cleanPerms,
          profile_permissions: editingProfilePerms,
        };
        localStorage.setItem("bms_user", JSON.stringify(updatedSelf));
        onProfileUpdate?.(updatedSelf);
      }

      if (pickedTemplate) {
        setMembers(prev => prev.map(m =>
          m.id === permUser.id
            ? { ...m, ...designationPatch }
            : m
        ));
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
      const apiMsg = err?.response?.data?.error || err?.message || "Save failed";
      console.error("savePerms failed:", err?.response?.data || err);
      showToast(apiMsg, "error");
    }
    finally { setPermLoading(false); }
  };


  const badge = ROLE_BADGE[currentUser.role] || ROLE_BADGE.user;

  /* Serialization */
  const [serSites,    setSerSites]    = useState([]);
  const [serConfigs,  setSerConfigs]  = useState([]);
  const [orderSerConfigs, setOrderSerConfigs] = useState([]);
  const [serLoading,  setSerLoading]  = useState(false);
  const [serSaving,   setSerSaving]   = useState(null); // siteId being saved
  const [serTab, setSerTab] = useState("intake"); // "intake" | "order"
  const [orderKindTab, setOrderKindTab] = useState("Supply"); // "Supply" | "SITC"
  const [showAddSiteSer, setShowAddSiteSer] = useState(false);
  const [addSiteForm, setAddSiteForm] = useState({ siteId: "", financialYear: "", currentNumber: 0 });

  useEffect(() => {
    if (section === "serialization" && isGlobalAdmin) fetchSerData();
  }, [section]);

  const fetchSerData = async () => {
    setSerLoading(true);
    try {
      const [sitesRes, configsRes, orderRes] = await Promise.all([
        fetch(`${API}/api/procurement/sites`).then(r => r.json()),
        fetch(`${API}/api/intakes/serialization`).then(r => r.json()),
        fetch(`${API}/api/orders/serialization`).then(r => r.json())
      ]);
      setSerSites(sitesRes.sites || []);
      setSerConfigs(configsRes.configs || []);
      setOrderSerConfigs(orderRes.configs || []);
    } catch { showToast("Failed to load data", "error"); }
    setSerLoading(false);
  };

  const getSerConfig = (siteId) =>
    serConfigs.find(c => c.site_id === siteId && c.doc_type === "intake") || {};

  const updateSerConfig = (siteId, field, value) => {
    setSerConfigs(prev => {
      const exists = prev.find(c => c.site_id === siteId && c.doc_type === "intake");
      if (exists) return prev.map(c => c.site_id === siteId && c.doc_type === "intake" ? { ...c, [field]: value } : c);
      return [...prev, { doc_type: "intake", site_id: siteId, [field]: value }];
    });
  };

  const saveSerConfig = async (site) => {
    const cfg = getSerConfig(site.id);
    if (!cfg.prefix) return showToast("Prefix is required", "error");
    setSerSaving(site.id);
    try {
      const res = await fetch(`${API}/api/intakes/serialization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_type: "intake", site_id: site.id,
          site_name: site.siteName, prefix: cfg.prefix,
          pad_length: parseInt(cfg.pad_length) || 2,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      showToast(`Saved for ${site.siteName}`);
      fetchSerData();
    } catch { showToast("Failed to save", "error"); }
    setSerSaving(null);
  };

  const currentFY = () => {
    const d = new Date();
    const m = d.getMonth();
    const y = d.getFullYear();
    const fy = m >= 3 ? y : y - 1;
    return `${fy}-${String(fy + 1).slice(-2)}`;
  };

  // Configs filtered for current order kind tab (Supply / SITC)
  const orderTilesForKind = (kind) =>
    orderSerConfigs.filter(c => c.order_kind === kind);

  const updateOrderTile = (id, field, value) => {
    setOrderSerConfigs(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const saveOrderTile = async (cfg) => {
    setSerSaving("order_" + cfg.id);
    try {
      const res = await fetch(`${API}/api/orders/serialization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: cfg.site_id,
          financial_year: cfg.financial_year,
          current_number: parseInt(cfg.current_number) || 0,
          order_kind: cfg.order_kind,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      showToast(`Sequence saved`);
      fetchSerData();
    } catch { showToast("Failed to save sequence", "error"); }
    setSerSaving(null);
  };

  const deleteOrderTile = async (id) => {
    if (!confirm("Remove this serialization entry?")) return;
    try {
      const res = await fetch(`${API}/api/orders/serialization/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      showToast("Removed");
      fetchSerData();
    } catch { showToast("Failed to remove", "error"); }
  };

  const addOrderTile = async () => {
    if (!addSiteForm.siteId) return showToast("Site is required", "error");
    if (!addSiteForm.financialYear) return showToast("Financial year is required", "error");
    // Prevent duplicate (site + fy + kind)
    const dup = orderSerConfigs.find(c =>
      c.site_id === addSiteForm.siteId &&
      c.financial_year === addSiteForm.financialYear &&
      c.order_kind === orderKindTab);
    if (dup) return showToast("This site is already configured for that FY", "error");

    setSerSaving("add_new");
    try {
      const res = await fetch(`${API}/api/orders/serialization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: addSiteForm.siteId,
          financial_year: addSiteForm.financialYear,
          current_number: parseInt(addSiteForm.currentNumber) || 0,
          order_kind: orderKindTab,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      showToast("Site added");
      setShowAddSiteSer(false);
      setAddSiteForm({ siteId: "", financialYear: "", currentNumber: 0 });
      fetchSerData();
    } catch { showToast("Failed to add", "error"); }
    setSerSaving(null);
  };

  /* Approval Flows */
  const APPROVAL_MODULES = [
    { key: "intake", label: "Intake (PR)" },
    { key: "order",  label: "Purchase Order" },
  ];
  const [approvalFlows,   setApprovalFlows]   = useState({});
  const [approvalUsers,   setApprovalUsers]   = useState([]);
  const [approvalSaving,  setApprovalSaving]  = useState(null);
  const [approvalLoading, setApprovalLoading] = useState(false);

  useEffect(() => {
    if (section === "approval_flow" && isGlobalAdmin) fetchApprovalData();
  }, [section]);

  const fetchApprovalData = async () => {
    setApprovalLoading(true);
    try {
      const [flowsRes, usersRes] = await Promise.all([
        fetch(`${API}/api/intakes/approval-flows`).then(r => r.json()),
        api.get("/api/users").then(r => r.data),
      ]);
      const flowMap = {};
      (flowsRes.flows || []).forEach(f => { flowMap[f.module] = f; });
      setApprovalFlows(flowMap);
      setApprovalUsers(usersRes.users || []);
    } catch { showToast("Failed to load", "error"); }
    setApprovalLoading(false);
  };

  const updateApprovalFlow = (module, userId) => {
    const user = approvalUsers.find(u => u.id === userId);
    setApprovalFlows(prev => ({
      ...prev,
      [module]: { ...prev[module], approver_user_id: userId, approver_name: user?.name || "", approver_email: user?.email || "" },
    }));
  };

  const saveApprovalFlow = async (module) => {
    const cfg = approvalFlows[module] || {};
    setApprovalSaving(module);
    try {
      const res = await fetch(`${API}/api/intakes/approval-flows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, approver_user_id: cfg.approver_user_id, approver_name: cfg.approver_name, approver_email: cfg.approver_email }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast(`Saved for ${APPROVAL_MODULES.find(m => m.key === module)?.label}`);
    } catch { showToast("Failed to save", "error"); }
    setApprovalSaving(null);
  };

  const pp = currentUser.profile_permissions || {};
  const TABS = [
    { id: "profile",       label: "Personal info",  show: true },
    { id: "security",      label: "Security",        show: true },
    { id: "team",          label: "Manage Users",    show: isGlobalAdmin || !!pp.manage_user?.view   },
    { id: "permissions",   label: "Permissions",     show: isGlobalAdmin || currentUser.role === "super_admin" },
    { id: "projects",      label: "Projects",        show: isGlobalAdmin || !!pp.manage_project?.view },
    { id: "serialization", label: "Serialization",   show: isGlobalAdmin || !!pp.serialization?.view },
    { id: "approval_flow", label: "Approval Flow",   show: isGlobalAdmin || !!pp.approval_flow?.view },
  ].filter(t => t.show);

  const accessLabel = currentUser.role === "global_admin" ? "Global" : currentUser.role === "super_admin" ? "Super" : currentUser.role === "admin" ? "Admin" : "Standard";
  const roleLabel   = ROLE_BADGE[currentUser.role]?.label || "User";

  /* ══ RENDER ══ */
  return (
    <div className="min-h-screen bg-[#f0f2f5] p-4 md:p-6">
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Avatar Lightbox */}
      {avatarLightbox && avatar && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setAvatarLightbox(false)}
        >
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img src={avatar} alt="avatar" className="max-h-[80vh] max-w-[80vw] rounded-2xl shadow-2xl object-contain" />
            <button
              onClick={() => setAvatarLightbox(false)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-slate-100 transition"
            >
              <X size={16} className="text-slate-700" />
            </button>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
      <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
      <input ref={signatureRef} type="file" accept="image/*" className="hidden" onChange={handleSignatureChange} />
      <input ref={newUserSigRef} type="file" accept="image/*" className="hidden" onChange={handleNewUserSigChange} />

      <div className="space-y-4">

        {/* ── CUSTOMIZABLE PROFILE HEADER CARD ── */}
        <div className="relative group/header transition-all duration-500 rounded-3xl shadow-xl hover:shadow-2xl overflow-visible">

          {/* BACKGROUND LAYER (Handles Image & Gradient) */}
          <div className="absolute inset-0 rounded-3xl overflow-hidden transition-all duration-500 pointer-events-none" 
            style={{ 
              background: coverImage ? `url(${coverImage}) center/cover no-repeat` : headerTheme,
            }}>
            {/* Darker Overlay for maximum readability */}
            <div className={`absolute inset-0 transition-opacity duration-300 ${coverImage ? "bg-black/40 backdrop-blur-[1px]" : "bg-black/10"}`} />
            
            {/* Subtle Gradient from bottom to ensure text pop */}
            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-80" />
          </div>

          {/* Theme/Image Controls (Placed outside overflow-hidden for dropdown visibility) */}
          <div className="absolute top-5 right-5 flex items-center gap-3 opacity-0 group-hover/header:opacity-100 transition-all duration-300 z-50">
            {/* Palette Button */}
            <div className="relative">
              <button 
                onClick={() => setShowThemePicker(!showThemePicker)}
                className="w-10 h-10 rounded-xl bg-black/20 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-black/40 transition-all shadow-xl active:scale-90"
                title="Change Theme"
              >
                <LayoutDashboard size={20} />
              </button>
              
              <AnimatePresence>
                {showThemePicker && (
                  <motion.div 
                    initial={{ opacity: 0, y: 15, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 15, scale: 0.9 }}
                    className="absolute right-0 top-full mt-4 w-64 bg-white/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-200/50 p-4 z-[100] origin-top-right overflow-visible"
                    style={{ position: "absolute", right: 0 }}
                  >
                    <div className="flex items-center justify-between mb-4 px-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Premium Themes</p>
                      <button onClick={() => setShowThemePicker(false)} className="text-slate-300 hover:text-slate-500 transition-colors"><X size={14} /></button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      {GRADIENTS.map((g) => (
                        <button 
                          key={g.name}
                          onClick={() => changeHeaderTheme(g.value)}
                          className={`h-12 rounded-2xl border-2 transition-all hover:scale-110 shadow-sm active:scale-90 ${headerTheme === g.value ? "border-indigo-500 ring-4 ring-indigo-500/10" : "border-slate-100"}`}
                          style={{ background: g.value }}
                          title={g.name}
                        />
                      ))}
                    </div>
                    
                    <button 
                      onClick={() => { setCoverImage(null); deleteCover(); setShowThemePicker(false); }}
                      className="w-full mt-5 py-3 text-[10px] font-black text-slate-400 hover:text-red-500 transition-all uppercase tracking-[0.2em] border-t border-slate-100 flex items-center justify-center gap-2"
                    >
                      <Trash2 size={12} /> Reset Background
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Camera Button */}
            <button 
              onClick={() => coverFileRef.current.click()}
              className="w-10 h-10 rounded-xl bg-black/20 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-black/40 transition-all shadow-xl active:scale-90"
              title="Upload Cover"
            >
              {coverLoading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={20} />}
            </button>
          </div>

          {/* CONTENT LAYER */}
          <div className="relative flex flex-col md:flex-row items-center gap-6 z-20 p-6 md:p-10">
            {/* Avatar */}
            <div className="relative group shrink-0 mt-10 md:mt-0">
              <div className="w-20 h-20 rounded-2xl border-2 border-white/20 overflow-hidden shadow-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                {avatarLoading ? (
                  <Loader2 size={24} className="text-white animate-spin" />
                ) : avatar ? (
                  <img
                    src={avatar}
                    alt="avatar"
                    className="w-full h-full object-cover"
                    onError={async () => {
                      try {
                        const { data } = await api.get("/api/auth/refresh-avatar");
                        setAvatar(data.url || null);
                        const updated = { ...currentUser, avatar: data.url || null };
                        localStorage.setItem("bms_user", JSON.stringify(updated));
                        if (!data.url) onProfileUpdate?.(updated);
                      } catch { setAvatar(null); }
                    }}
                  />
                ) : (
                  <span className="text-white font-black text-3xl select-none">
                    {currentUser.name?.charAt(0)?.toUpperCase() || "?"}
                  </span>
                )}
              </div>
              <div className={`absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center gap-2 transition-opacity
                ${avatarLoading ? "opacity-0 pointer-events-none" : "opacity-0 group-hover:opacity-100"}`}>
                {avatar && (
                  <button onClick={() => setAvatarLightbox(true)} className="flex flex-col items-center gap-0.5">
                    <FolderOpen size={16} className="text-white" />
                    <span className="text-[9px] text-white font-bold">View</span>
                  </button>
                )}
                <button onClick={() => fileRef.current.click()} className="flex flex-col items-center gap-0.5">
                  <Camera size={16} className="text-white" />
                  <span className="text-[9px] text-white font-bold">Edit</span>
                </button>
                {avatar && (
                  <button onClick={deleteAvatar} className="flex flex-col items-center gap-0.5">
                    <Trash2 size={16} className="text-red-300" />
                    <span className="text-[9px] text-red-300 font-bold">Del</span>
                  </button>
                )}
              </div>
            </div>

            {/* Name + Role + Email */}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-black text-white leading-tight">{currentUser.name || "—"}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                  style={{ background: "rgba(139,92,246,0.3)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.4)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                  {roleLabel}
                </span>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Active
                </span>
              </div>
              <p className="text-xs text-white/40 mt-1 truncate">{currentUser.email}</p>
            </div>

          </div>
        </div>

        {/* ── TAB NAV ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-1.5 flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id}
              onClick={() => { setSection(t.id); setPermUser(null); setSecStep(1); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all
                ${section === t.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── CONTENT ── */}
        <div>

            {/* ─── MY PROFILE ─── */}
            {section === "profile" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Left: Current info */}
                <div className="lg:col-span-1">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 h-full">
                    <p className={lbl + " mb-5"}>Current Info</p>
                    <div className="space-y-4">
                      {[
                        { icon: UserCircle,  label: "Full Name",   value: currentUser.name,        color: "text-indigo-500", bg: "bg-indigo-50" },
                        { icon: Mail,        label: "Email",        value: currentUser.email,       color: "text-blue-500",   bg: "bg-blue-50"   },
                        { icon: Phone,       label: "Contact",      value: currentUser.contact_no,  color: "text-green-500",  bg: "bg-green-50"  },
                        { icon: ShieldCheck, label: "Role",         value: ROLE_BADGE[currentUser.role]?.label || "User",
                                                                    color: "text-violet-500", bg: "bg-violet-50", isRole: true },
                        { icon: Briefcase,   label: "Designation",  value: currentUser.designation, color: "text-orange-500", bg: "bg-orange-50" },
                        { icon: Building2,   label: "Department",   value: currentUser.department,  color: "text-purple-500", bg: "bg-purple-50" },
                      ].map(({ icon: Icon, label: l, value, color, bg, isRole }) => (
                        <div key={l} className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                            <Icon size={15} className={color} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{l}</p>
                            {isRole ? (
                              <span className={`inline-flex items-center text-[11px] font-black px-2 py-0.5 rounded-md mt-0.5 ${ROLE_BADGE[currentUser.role]?.color || "bg-slate-100 text-slate-700"}`}>
                                {value}
                              </span>
                            ) : (
                              <p className="text-sm font-semibold text-slate-700 truncate mt-0.5">{value || "—"}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: Edit form */}
                <div className="lg:col-span-2">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                        <UserCircle size={18} className="text-indigo-600" />
                      </div>
                      <div>
                        <h2 className="text-base font-black text-slate-800">Edit Profile</h2>
                        <p className="text-xs text-slate-500">Update your personal information</p>
                      </div>
                    </div>

                    <form onSubmit={saveProfile} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <span className={lbl}>Full Name *</span>
                          <div className="relative">
                            <UserCircle size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input className={`${inp} pl-10`} value={profile.name}
                              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} required />
                          </div>
                        </div>
                        <div>
                          <span className={lbl}>Email Address</span>
                          <div className="relative">
                            <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                            <input className={`${inp} pl-10 opacity-50 cursor-not-allowed`}
                              value={currentUser.email || ""} disabled />
                          </div>
                        </div>
                        <div>
                          <span className={lbl}>Contact Number</span>
                          <div className="relative">
                            <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input className={`${inp} pl-10`} value={profile.contact_no}
                              onChange={(e) => setProfile((p) => ({ ...p, contact_no: e.target.value }))}
                              placeholder="+91 98765 43210" />
                          </div>
                        </div>
                        <div>
                          <span className={lbl}>Designation</span>
                          <div className="relative">
                            <Briefcase size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input className={`${inp} pl-10 bg-slate-50 cursor-not-allowed text-slate-500`}
                              value={currentUser.designation || "Not assigned"}
                              readOnly disabled
                              title="Designation is managed by your administrator" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">
                              Admin
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1.5 ml-1">
                            Set by your administrator. Contact admin to change.
                          </p>
                        </div>
                        <div className="sm:col-span-2">
                          <span className={lbl}>Department</span>
                          <div className="relative">
                            <Building2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input className={`${inp} pl-10`} value={profile.department}
                              onChange={(e) => setProfile((p) => ({ ...p, department: e.target.value }))}
                              placeholder="Engineering" />
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 flex items-center gap-4 border-t border-slate-50">
                        <button type="submit" disabled={loading} className={btnPrimary}>
                          {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          Save Changes
                        </button>
                        <p className="text-xs text-slate-400">Email address cannot be changed</p>
                      </div>
                    </form>
                  </div>
                </div>

                {/* Signature */}
                <div className="lg:col-span-3">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                        <Pencil size={16} className="text-amber-600" />
                      </div>
                      <div>
                        <h2 className="text-base font-black text-slate-800">Signature</h2>
                        <p className="text-xs text-slate-500">Your signature is used on documents and purchase orders</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start gap-6">
                      {/* Preview */}
                      <div className="w-full sm:w-64 h-32 rounded-xl border-2 border-dashed border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 relative group">
                        {signatureLoading ? (
                          <Loader2 size={24} className="text-amber-400 animate-spin" />
                        ) : signature ? (
                          <>
                            <img src={signature} alt="Signature" className="max-h-full max-w-full object-contain p-2" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-3">
                              <button type="button" onClick={() => signatureRef.current.click()}
                                className="flex flex-col items-center gap-1 text-white">
                                <Camera size={16} />
                                <span className="text-[10px] font-bold">Change</span>
                              </button>
                              <button type="button" onClick={deleteSignature}
                                className="flex flex-col items-center gap-1 text-red-400">
                                <Trash2 size={16} />
                                <span className="text-[10px] font-bold">Remove</span>
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="text-center">
                            <Pencil size={24} className="text-slate-300 mx-auto mb-1" />
                            <p className="text-[11px] text-slate-400 font-medium">No signature</p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex-1 space-y-3">
                        <p className="text-[12px] text-slate-500 leading-relaxed">
                          Upload a clear image of your handwritten signature (PNG or JPG recommended).
                          It will appear on purchase orders and official documents generated from this platform.
                        </p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <button type="button" onClick={() => signatureRef.current.click()}
                            disabled={signatureLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl shadow-sm shadow-amber-200 transition-all active:scale-95 disabled:opacity-60">
                            {signatureLoading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                            {signature ? "Change Signature" : "Upload Signature"}
                          </button>
                          {signature && (
                            <button type="button" onClick={deleteSignature}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                              <Trash2 size={14} />
                              Remove
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400">Accepted: PNG, JPG, JPEG · Max size: 5MB</p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ─── SECURITY ─── */}
            {section === "security" && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 max-w-lg">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                    <ShieldCheck size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-800">Change Password</h2>
                    <p className="text-sm text-slate-500">OTP will be sent to your email for verification</p>
                  </div>
                </div>

                {/* Step indicators */}
                <div className="flex items-center gap-2 mb-7">
                  {[{ n: 1, label: "Send OTP" }, { n: 2, label: "Verify & Set" }].map(({ n, label }) => (
                    <React.Fragment key={n}>
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all
                          ${secStep >= n ? "bg-linear-to-br from-blue-600 to-purple-600 text-white shadow" : "bg-slate-100 text-slate-400"}`}>
                          {secStep > n ? <CheckCircle2 size={14} /> : n}
                        </div>
                        <span className={`text-xs font-semibold hidden sm:block ${secStep >= n ? "text-slate-700" : "text-slate-400"}`}>{label}</span>
                      </div>
                      {n < 2 && <div className={`flex-1 h-px ${secStep > n ? "bg-blue-400" : "bg-slate-200"}`} />}
                    </React.Fragment>
                  ))}
                </div>

                {/* Step 1 — Send OTP */}
                {secStep === 1 && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                      <Mail size={18} className="text-blue-500 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-widest">OTP will be sent to</p>
                        <p className="text-sm font-semibold text-slate-800 mt-0.5">{currentUser.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={sendOtp}
                      disabled={otpLoading}
                      className={btnPrimary}
                    >
                      {otpLoading
                        ? <Loader2 size={16} className="animate-spin" />
                        : <SendHorizonal size={16} />
                      }
                      Send OTP to Email
                    </button>
                  </div>
                )}

                {/* Step 2 — Enter OTP + New Password */}
                {secStep === 2 && (
                  <form onSubmit={verifyOtpAndChange} className="space-y-4">
                    <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 mb-2">
                      <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                      <p className="text-sm text-green-700 font-medium">OTP sent to <strong>{currentUser.email}</strong></p>
                    </div>

                    <div>
                      <span className={lbl}>Enter OTP</span>
                      <input
                        className={`${inp} text-center text-2xl font-black tracking-[0.4em]`}
                        placeholder="• • • • • •"
                        maxLength={8}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                        required
                      />
                    </div>

                    <div>
                      <span className={lbl}>New Password</span>
                      <div className="relative">
                        <input
                          type={showNewPw ? "text" : "password"}
                          className={`${inp} pr-11`}
                          placeholder="Minimum 8 characters"
                          value={newPw}
                          onChange={(e) => setNewPw(e.target.value)}
                          required
                        />
                        <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <span className={lbl}>Confirm New Password</span>
                      <div className="relative">
                        <input
                          type={showConfirmPw ? "text" : "password"}
                          className={`${inp} pr-11`}
                          placeholder="Re-enter password"
                          value={confirmPw}
                          onChange={(e) => setConfirmPw(e.target.value)}
                          required
                        />
                        <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <button type="submit" disabled={otpLoading} className={btnPrimary}>
                        {otpLoading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                        Verify & Update Password
                      </button>
                      <button type="button" onClick={() => { setSecStep(1); setOtp(""); setNewPw(""); setConfirmPw(""); }}
                        className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors">
                        Resend OTP
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}


            {/* ─── MANAGE USERS ─── */}
            {section === "team" && (isGlobalAdmin || !!pp.manage_user?.view) && (
              <div className="space-y-4">
                {permUser ? (
                  /* Permissions panel */
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h2 className="text-lg font-black text-slate-800">Permissions</h2>
                        <p className="text-sm text-slate-500">{permUser.name} — {permUser.email}</p>
                      </div>
                      <button onClick={closePermsPanel}
                        className="text-sm font-semibold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                        ← Back
                      </button>
                    </div>

                    {/* Apply Designation Template */}
                    {designations.length > 0 && (
                      <div className="mb-5 inline-flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-100">
                        <ShieldCheck size={15} className="text-indigo-600 shrink-0" />
                        <p className="text-[12px] font-bold text-slate-700 shrink-0">Apply Template:</p>
                        <SearchableTemplateSelect
                          designations={designations}
                          onPick={(tpl) => {
                            const traw = tpl.profile_permissions || {};
                            if (traw.add_project && !traw.manage_project) traw.manage_project = { view: !!traw.add_project.view, add: !!traw.add_project.edit, edit: !!traw.add_project.edit, delete: false };
                            if (traw.manage_user && traw.manage_user.edit !== undefined && traw.manage_user.add === undefined) { const e = !!traw.manage_user.edit; traw.manage_user = { view: !!traw.manage_user.view, add: e, edit: e, delete: e, manage_permissions: e }; }
                            const tmerged = {};
                            PROFILE_SECTIONS.forEach(sec => { tmerged[sec.key] = { ...Object.fromEntries(sec.keys.map(({ k }) => [k, false])), ...(traw[sec.key] || {}) }; });
                            setEditingProfilePerms(tmerged);
                            const stored = tpl.app_permissions || [];
                            setPermissions(prev => prev.map(m => {
                              const match = stored.find(s => s.module_id === m.module_id);
                              if (!match) return { ...m,
                                can_view: false, can_add: false, can_edit: false, can_delete: false,
                                can_bulk_upload: false, can_export: false, can_download_document: false,
                                can_issue: false, can_recall: false, can_reject: false, can_revert: false,
                                can_cancel: false, can_manage_amend: false,
                              };
                              return { ...m, ...match };
                            }));
                            // Remember the template so savePerms can update designation + designation_id
                            setPickedTemplate({ id: tpl.id, name: tpl.name });
                            showToast(`Selected "${tpl.name}" template - save to apply`);
                          }}
                        />
                      </div>
                    )}

                    {permLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 size={24} className="animate-spin text-blue-500" />
                      </div>
                    ) : (
                      <>
                        {permissions.length === 0 ? (
                          <p className="py-6 text-center text-sm text-slate-400">No modules found</p>
                        ) : (
                          <div className="space-y-6">
                            {/* Profile Management Section */}
                            <div className="border-b border-slate-100 pb-5">
                              <p className={lbl + " mb-3"}>Profile Management Access</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {PROFILE_SECTIONS.map(sec => {
                                  const allChecked = sec.keys.every(({ k }) => editingProfilePerms[sec.key]?.[k]);
                                  const anyChecked = sec.keys.some(({ k }) => editingProfilePerms[sec.key]?.[k]);
                                  return (
                                    <div key={sec.key} className={`rounded-xl border p-3.5 transition-all ${anyChecked ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                                      <div className="flex items-start justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[13px] font-bold text-slate-800">{sec.label}</p>
                                          <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest mt-0.5">{sec.key}</p>
                                        </div>
                                        <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0 px-2 py-1 rounded-md hover:bg-slate-100/70 transition">
                                          <input type="checkbox"
                                            checked={allChecked}
                                            ref={el => { if (el) el.indeterminate = anyChecked && !allChecked; }}
                                            onChange={e => setEditingProfilePerms(prev => ({ ...prev, [sec.key]: Object.fromEntries(sec.keys.map(({ k }) => [k, e.target.checked])) }))}
                                            className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer" />
                                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">All</span>
                                        </label>
                                      </div>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
                                        {sec.keys.map(({ k, label }) => (
                                          <label key={k} className="flex items-center gap-1.5 cursor-pointer select-none group/item">
                                            <input type="checkbox"
                                              checked={editingProfilePerms[sec.key]?.[k] || false}
                                              onChange={e => setEditingProfilePerms(prev => ({ ...prev, [sec.key]: { ...prev[sec.key], [k]: e.target.checked } }))}
                                              className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer shrink-0" />
                                            <span className="text-[11px] font-medium text-slate-600 group-hover/item:text-slate-900 transition-colors">{label}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* App Tab Permissions */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <p className={lbl}>App Tab Permissions</p>
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input type="checkbox"
                                            checked={permissions.length > 0 && permissions.every(m => {
                                                const availKeys = getModulePerms(m.module_key);
                                                return availKeys.every(k => m[k]);
                                            })}
                                            onChange={e => {
                                                const checked = e.target.checked;
                                                setPermissions(prev => prev.map(m => {
                                                    const availKeys = getModulePerms(m.module_key);
                                                    return { ...m, ...Object.fromEntries(availKeys.map(k => [k, checked])) };
                                                }));
                                                // Also sync profile perms for consistency
                                                const next = {};
                                                PROFILE_SECTIONS.forEach(sec => {
                                                  next[sec.key] = Object.fromEntries(sec.keys.map(({ k }) => [k, checked]));
                                                });
                                                setEditingProfilePerms(next);
                                            }}
                                            className="w-4 h-4 rounded accent-blue-600" />
                                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Select All Modules</span>
                                    </label>
                                </div>
                                <GroupedPermissions modules={permissions} onChange={updatePerm} />
                            </div>
                          </div>
                        )}
                        <div className="mt-2">
                          <button onClick={savePerms} disabled={permLoading} className={btnPrimary}>
                            {permLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {pickedTemplate ? "Save Permissions & Designation" : "Save Permissions"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  /* Team list */
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-black text-slate-800 tracking-tight">User Management</h2>
                        {!teamLoading && (
                          <div className="flex items-center gap-3 mt-0.5">
                            <p className="text-xs font-medium text-slate-500">
                              Total {members.length} team member{members.length !== 1 ? "s" : ""}
                            </p>
                            <div className="h-3 w-px bg-slate-200" />
                            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                              <button
                                onClick={() => setViewType("list")}
                                className={`p-1 rounded-md transition-all ${viewType === "list" ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600"}`}
                                title="List View"
                              >
                                <Briefcase size={14} />
                              </button>
                              <button
                                onClick={() => setViewType("tile")}
                                className={`p-1 rounded-md transition-all ${viewType === "tile" ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600"}`}
                                title="Tile View"
                              >
                                <LayoutDashboard size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      {(isGlobalAdmin || !!pp.manage_user?.add) && (
                        <button 
                          onClick={() => setShowAddUser(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 transition-all active:scale-95"
                        >
                          <UserPlus size={16} />
                          Add New User
                        </button>
                      )}
                    </div>

                    {teamLoading ? (
                      <div className="flex justify-center py-16">
                        <Loader2 size={32} className="animate-spin text-blue-500" />
                      </div>
                    ) : members.length === 0 ? (
                      <div className="text-center py-16">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Users className="text-slate-300" size={32} />
                        </div>
                        <p className="text-sm font-medium text-slate-400">No team members found.</p>
                      </div>
                    ) : viewType === "list" ? (
                      /* TABLE VIEW — bordered, business-app style */
                      <div className="p-5">
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50">
                              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">
                                <th className="px-5 py-3 border-r border-slate-200">User</th>
                                <th className="px-5 py-3 border-r border-slate-200">Email</th>
                                <th className="px-5 py-3 border-r border-slate-200">Designation</th>
                                <th className="px-5 py-3 border-r border-slate-200">Role</th>
                                <th className="px-5 py-3 border-r border-slate-200 text-center">Status</th>
                                <th className="px-5 py-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {members.map((m, idx) => {
                                const mb = ROLE_BADGE[m.role] || ROLE_BADGE.user;
                                const initials = m.name?.split(" ").map(n => n[0]).join("").toUpperCase() || "?";
                                const isSelf = m.id === currentUser.id;
                                const canHierarchy = canManage(currentUser.role, m.role, m.id);
                                const canShield  = canHierarchy && (isGlobalAdmin || !!pp.manage_user?.manage_permissions);
                                const canToggle  = canHierarchy && !isSelf && (isGlobalAdmin || !!pp.manage_user?.edit);
                                const canDel     = canHierarchy && !isSelf && (isGlobalAdmin || !!pp.manage_user?.delete);
                                const canManageRole = canHierarchy && m.role !== "global_admin" && (isGlobalAdmin || !!pp.manage_user?.edit);
                                return (
                                  <tr key={m.id}
                                    className={`hover:bg-blue-50/30 transition group ${idx !== members.length - 1 ? "border-b border-slate-200" : ""}`}>
                                    {/* USER */}
                                    <td className="px-5 py-3.5 border-r border-slate-100">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="relative w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm overflow-hidden shadow-sm shrink-0"
                                          style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}>
                                          {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> : initials}
                                        </div>
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <p className="font-bold text-[14px] text-slate-800 truncate">{m.name}</p>
                                            {isSelf && (
                                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[8px] font-black uppercase tracking-widest border border-blue-200">
                                                You
                                              </span>
                                            )}
                                          </div>
                                          {m.contact_no && (
                                            <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                              <Phone size={10} /> {m.contact_no}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    {/* EMAIL */}
                                    <td className="px-5 py-3.5 border-r border-slate-100 text-[13px] text-slate-600">
                                      <div className="flex items-center gap-2">
                                        <Mail size={13} className="text-slate-400 shrink-0" />
                                        <span className="truncate">{m.email}</span>
                                      </div>
                                    </td>
                                    {/* DESIGNATION */}
                                    <td className="px-5 py-3.5 border-r border-slate-100">
                                      {m.designation ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-bold border border-indigo-100">
                                          <Briefcase size={11} /> {m.designation}
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-slate-300 italic">— not assigned —</span>
                                      )}
                                    </td>
                                    {/* ROLE */}
                                    <td className="px-5 py-3.5 border-r border-slate-100">
                                      {canManageRole && editingRoleId === m.id ? (
                                        <select autoFocus
                                          className="text-[11px] font-bold px-2 py-1 rounded-lg border border-blue-400 bg-white text-slate-700 outline-none shadow-sm"
                                          defaultValue={m.role}
                                          onChange={e => changeRole(m, e.target.value)}
                                          onBlur={() => setEditingRoleId(null)}>
                                          {getManageableRoles(currentUser.role).map(r => (
                                            <option key={r} value={r}>{ROLE_BADGE[r]?.label || r}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span
                                          onClick={() => canManageRole && setEditingRoleId(m.id)}
                                          className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-lg ${mb.color} ${canManageRole ? "cursor-pointer hover:shadow-sm" : ""}`}>
                                          {mb.label.toUpperCase()}
                                          {canManageRole && <Pencil size={9} className="opacity-50" />}
                                        </span>
                                      )}
                                    </td>
                                    {/* STATUS */}
                                    <td className="px-5 py-3.5 border-r border-slate-100 text-center">
                                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${m.is_active ? "text-emerald-600" : "text-rose-600"}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${m.is_active ? "bg-emerald-500" : "bg-rose-500"}`} />
                                        {m.is_active ? "Active" : "Inactive"}
                                      </span>
                                    </td>
                                    {/* ACTIONS */}
                                    <td className="px-5 py-3.5">
                                      <div className="flex items-center justify-end gap-1.5">
                                        {(canShield || canToggle || canDel) ? (
                                          <>
                                            {canShield && (
                                              <button onClick={() => viewPerms(m)} title="Manage Permissions"
                                                className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition border border-transparent hover:border-blue-200">
                                                <ShieldCheck size={16} />
                                              </button>
                                            )}
                                            {canToggle && (
                                              <button onClick={() => toggleActive(m)} title={m.is_active ? "Deactivate" : "Activate"}
                                                className={`p-2 rounded-lg transition border border-transparent ${m.is_active ? "text-slate-400 hover:text-amber-600 hover:bg-amber-50 hover:border-amber-200" : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200"}`}>
                                                {m.is_active ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                                              </button>
                                            )}
                                            {canDel && (
                                              <button onClick={() => removeUser(m)} title="Remove User"
                                                className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition border border-transparent hover:border-rose-200">
                                                <Trash2 size={16} />
                                              </button>
                                            )}
                                          </>
                                        ) : (
                                          <span className="text-[10px] text-slate-300 italic">—</span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {members.map((m) => {
                          const mb = ROLE_BADGE[m.role] || ROLE_BADGE.user;
                          const initials = m.name?.split(" ").map(n => n[0]).join("").toUpperCase() || "?";

                          if (viewType === "tile") {
                            return (
                              <div key={m.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all group p-5 relative">
                                <div className="flex flex-col items-center text-center">
                                  {/* Avatar */}
                                  <div className="relative mb-3">
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-xl overflow-hidden shadow-sm ring-4 ${m.is_active ? "ring-green-50" : "ring-red-50"}`}
                                      style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}>
                                      {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> : initials}
                                    </div>
                                    <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white ${m.is_active ? "bg-green-500" : "bg-red-500"}`} />
                                  </div>

                                  <h3 className="font-bold text-slate-800 text-[15px] truncate max-w-full">{m.name}</h3>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{m.designation || "No Title"}</p>
                                  
                                  <div className="mt-3 flex flex-col gap-1.5 w-full">
                                    <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                                      <Mail size={12} className="opacity-60" />
                                      <span className="truncate">{m.email}</span>
                                    </div>
                                    <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                                      <Building2 size={12} className="opacity-60" />
                                      <span>{m.department || "General"}</span>
                                    </div>
                                  </div>

                                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                                    <div className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg ${mb.color}`}>
                                      {mb.label.toUpperCase()}
                                    </div>
                                    {m.is_active === false && (
                                      <div className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg bg-red-50 text-red-600 border border-red-100 uppercase">
                                        Inactive
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Hover Actions */}
                                <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100">
                                  {(() => {
                                    const ch = canManage(currentUser.role, m.role, m.id);
                                    const cShield = ch && (isGlobalAdmin || !!pp.manage_user?.manage_permissions);
                                    const cToggle = ch && m.id !== currentUser.id && (isGlobalAdmin || !!pp.manage_user?.edit);
                                    const cDel    = ch && m.id !== currentUser.id && (isGlobalAdmin || !!pp.manage_user?.delete);
                                    return (
                                      <>
                                        {cShield && <button onClick={() => viewPerms(m)} title="Permissions" className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm"><ShieldCheck size={16} /></button>}
                                        {cToggle && <button onClick={() => toggleActive(m)} title={m.is_active ? "Deactivate" : "Activate"} className={`p-2 rounded-xl transition-all shadow-sm ${m.is_active ? "bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white" : "bg-green-50 text-green-600 hover:bg-green-600 hover:text-white"}`}>{m.is_active ? <XCircle size={16} /> : <CheckCircle2 size={16} />}</button>}
                                        {cDel    && <button onClick={() => removeUser(m)} title="Remove" className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm"><Trash2 size={16} /></button>}
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            );
                          }

                          // Default List View (Existing layout)
                          return (
                            <div key={m.id}
                              className="group flex flex-col md:flex-row md:items-center justify-between p-5 hover:bg-slate-50/50 transition-all gap-4">
                              <div className="flex items-center gap-4 min-w-0">
                                {/* Avatar with status ring */}
                                <div className="relative shrink-0">
                                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-base overflow-hidden shadow-sm ring-2 ${m.is_active ? "ring-green-100" : "ring-red-100"}`}
                                    style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}>
                                    {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> : initials}
                                  </div>
                                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${m.is_active ? "bg-green-500" : "bg-red-500"}`} />
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-baseline gap-2 mb-0.5">
                                    <p className="font-bold text-[15px] text-slate-800 tracking-tight truncate">{m.name}</p>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{m.department || "General"}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-slate-500 mb-1.5">
                                    <span className="flex items-center gap-1"><Mail size={12} className="opacity-60" /> {m.email}</span>
                                    {m.contact_no && <span className="flex items-center gap-1"><Phone size={12} className="opacity-60" /> {m.contact_no}</span>}
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    {/* Role Select / Badge */}
                                    {(() => { const cmr = canManage(currentUser.role, m.role, m.id) && m.role !== "global_admin" && (isGlobalAdmin || !!pp.manage_user?.edit); return cmr && editingRoleId === m.id ? (
                                      <select autoFocus className="text-[11px] font-bold px-2 py-1 rounded-lg border border-blue-400 bg-white text-slate-700 outline-none shadow-sm" defaultValue={m.role} onChange={e => changeRole(m, e.target.value)} onBlur={() => setEditingRoleId(null)}>
                                        {getManageableRoles(currentUser.role).map(r => (<option key={r} value={r}>{ROLE_BADGE[r]?.label || r}</option>))}
                                      </select>
                                    ) : (
                                      <div onClick={() => cmr && setEditingRoleId(m.id)} className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1 rounded-lg transition-all ${mb.color} ${cmr ? "cursor-pointer hover:shadow-md" : ""}`}>
                                        {mb.label.toUpperCase()}
                                        {cmr && <Pencil size={10} className="opacity-60" />}
                                      </div>
                                    ); })()}
                                    {m.designation && (
                                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wide">
                                        <Briefcase size={10} /> {m.designation}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Actions - Premium Buttons */}
                              <div className="flex items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                {(() => {
                                    const ch = canManage(currentUser.role, m.role, m.id);
                                    const cShield = ch && (isGlobalAdmin || !!pp.manage_user?.manage_permissions);
                                    const cToggle = ch && m.id !== currentUser.id && (isGlobalAdmin || !!pp.manage_user?.edit);
                                    const cDel    = ch && m.id !== currentUser.id && (isGlobalAdmin || !!pp.manage_user?.delete);
                                    return (
                                      <>
                                        {cShield && <button onClick={() => viewPerms(m)} title="Manage Permissions" className="p-2.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm"><ShieldCheck size={18} /></button>}
                                        {cToggle && <button onClick={() => toggleActive(m)} title={m.is_active ? "Deactivate User" : "Activate User"} className={`p-2.5 rounded-xl transition-all shadow-sm ${m.is_active ? "bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white" : "bg-green-50 text-green-600 hover:bg-green-600 hover:text-white"}`}>{m.is_active ? <XCircle size={18} /> : <CheckCircle2 size={18} />}</button>}
                                        {cDel    && <button onClick={() => removeUser(m)} title="Remove User" className="p-2.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm"><Trash2 size={18} /></button>}
                                      </>
                                    );
                                  })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ─── PERMISSIONS / DESIGNATIONS ─── */}
            {section === "permissions" && (isGlobalAdmin || currentUser.role === "super_admin") && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                  <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-800">Designation Templates</h3>
                      <p className="text-[12px] text-slate-500 mt-0.5">
                        Reusable permission sets. Assign a designation to a user and their permissions auto-fill — admin can still customize per user afterwards.
                      </p>
                    </div>
                    <button onClick={openDesgCreate} className={btnPrimary}>
                      <Plus size={16} /> New Designation
                    </button>
                  </div>

                  {designationsLoading ? (
                    <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                      <Loader2 className="animate-spin mr-2" size={16} /> Loading...
                    </div>
                  ) : designations.length === 0 ? (
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
                      <ShieldCheck size={32} className="mx-auto text-slate-300 mb-3" />
                      <p className="text-sm font-bold text-slate-500">No designations yet</p>
                      <p className="text-[12px] text-slate-400 mt-1">Create templates like "Site Engineer", "Procurement Manager" to speed up user onboarding.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {designations.map(d => {
                        const tickedCount = (d.app_permissions || []).filter(p => p.can_view).length;
                        return (
                          <div key={d.id} className="border border-slate-200 rounded-2xl p-4 hover:border-indigo-300 hover:shadow-sm transition group">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{d.name}</p>
                                {d.description && (
                                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{d.description}</p>
                                )}
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                <button onClick={() => syncDesignation(d)}
                                  title="Re-apply this template to all users assigned this designation"
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition">
                                  <GitMerge size={13} />
                                </button>
                                <button onClick={() => openDesgEdit(d)}
                                  title="Edit template"
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => deleteDesignation(d.id)}
                                  title="Delete template"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {tickedCount} {tickedCount === 1 ? "module" : "modules"}
                              </span>
                              <span className="text-[10px] text-slate-300">·</span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(d.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <button onClick={() => syncDesignation(d)}
                              className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 text-slate-500 hover:text-emerald-700 rounded-lg text-[10px] font-bold uppercase tracking-widest transition">
                              <GitMerge size={11} />
                              Sync to assigned users
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* CREATE / EDIT MODAL */}
                {showDesgModal && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-linear-to-r from-indigo-50 to-blue-50">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                            <ShieldCheck size={20} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">{editingDesg ? "Edit Designation" : "New Designation"}</h3>
                            <p className="text-[11px] text-slate-500">Define a reusable permission set</p>
                          </div>
                        </div>
                        <button onClick={() => setShowDesgModal(false)}
                          className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition">
                          <X size={18} />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-6 space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className={lbl}>Designation Name *</label>
                            <input value={desgName} onChange={e => setDesgName(e.target.value)} className={inp}
                              placeholder="e.g. Site Engineer, Procurement Manager" />
                          </div>
                          <div>
                            <label className={lbl}>Description (optional)</label>
                            <input value={desgDescription} onChange={e => setDesgDescription(e.target.value)} className={inp}
                              placeholder="Brief role description" />
                          </div>
                        </div>

                        {/* Master toggle — Select All / Clear All */}
                        <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl border border-emerald-100">
                          <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input type="checkbox"
                              checked={isDesgAllChecked()}
                              onChange={e => setAllDesgPerms(e.target.checked)}
                              className="w-4 h-4 rounded accent-emerald-600 cursor-pointer" />
                            <div>
                              <p className="text-[13px] font-bold text-slate-800">Select All Permissions</p>
                              <p className="text-[10px] text-slate-500">Ticks every profile section + every module action — useful for full-access roles like Vice President</p>
                            </div>
                          </label>
                          <button type="button" onClick={() => setAllDesgPerms(false)}
                            className="px-3 py-1.5 bg-white border border-rose-100 text-rose-600 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-rose-600 hover:text-white hover:border-rose-600 transition shrink-0">
                            Clear All
                          </button>
                        </div>

                        {/* Profile section permissions */}
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">Profile Section Access</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {PROFILE_SECTIONS.map(s => {
                              const allChecked = s.keys.every(({ k }) => desgProfilePerms[s.key]?.[k]);
                              const anyChecked = s.keys.some(({ k }) => desgProfilePerms[s.key]?.[k]);
                              return (
                                <div key={s.key} className={`rounded-xl border p-3.5 transition-all ${anyChecked ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                                  <div className="flex items-start justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[13px] font-bold text-slate-800">{s.label}</p>
                                      <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest mt-0.5">{s.key}</p>
                                    </div>
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0 px-2 py-1 rounded-md hover:bg-slate-100/70 transition">
                                      <input type="checkbox"
                                        checked={allChecked}
                                        ref={el => { if (el) el.indeterminate = anyChecked && !allChecked; }}
                                        onChange={e => setDesgProfilePerms(prev => ({ ...prev, [s.key]: Object.fromEntries(s.keys.map(({ k }) => [k, e.target.checked])) }))}
                                        className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer" />
                                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">All</span>
                                    </label>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
                                    {s.keys.map(({ k, label }) => (
                                      <label key={k} className="flex items-center gap-1.5 cursor-pointer select-none group/item">
                                        <input type="checkbox"
                                          checked={!!desgProfilePerms[s.key]?.[k]}
                                          onChange={e => setDesgProfilePerms(prev => ({ ...prev, [s.key]: { ...prev[s.key], [k]: e.target.checked } }))}
                                          className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer shrink-0" />
                                        <span className="text-[11px] font-medium text-slate-600 group-hover/item:text-slate-900 transition-colors">{label}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* App tab permissions */}
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">App Tab Permissions</p>
                          <GroupedPermissions modules={desgModules} onChange={updateDesgModule} />
                        </div>
                      </div>

                      <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
                        <button onClick={() => setShowDesgModal(false)}
                          className="px-5 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-white transition">
                          Cancel
                        </button>
                        <button onClick={saveDesignation} disabled={desgSaving}
                          className={btnPrimary}>
                          {desgSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          {editingDesg ? "Update" : "Create"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── MANAGE PROJECTS ─── */}
            {section === "projects" && (isGlobalAdmin || !!pp.manage_project?.view) && (
              <ManageProjects isGlobalAdmin={isGlobalAdmin} permissions={pp.manage_project} onProjectsUpdate={onProjectsUpdate} />
            )}

            {/* ─── SERIALIZATION ─── */}
            {section === "serialization" && (isGlobalAdmin || !!pp.serialization?.view) && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 relative">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                      <KeyRound size={17} className="text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-slate-800">Serialization</h2>
                      <p className="text-xs text-slate-500">Configure document number series per site</p>
                    </div>
                  </div>
                  
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button onClick={() => setSerTab("intake")}
                      className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${serTab === "intake" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}>
                      Intake
                    </button>
                    <button onClick={() => setSerTab("order")}
                      className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${serTab === "order" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}>
                      Orders
                    </button>
                  </div>
                </div>

                {serLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 size={22} className="animate-spin text-indigo-400" />
                  </div>
                ) : serSites.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No sites registered. Add sites first from Procurement Setup → Site List.</p>
                ) : (
                  <div className="space-y-3">
                    {serTab === "intake" ? (
                      <>
                        {/* Header row for Intake */}
                        <div className="grid grid-cols-12 gap-3 px-4 pb-1">
                          <div className="col-span-3"><span className={lbl}>Site</span></div>
                          <div className="col-span-2"><span className={lbl}>Doc Type</span></div>
                          <div className="col-span-3"><span className={lbl}>Prefix / Format</span></div>
                          <div className="col-span-2"><span className={lbl}>Pad Length</span></div>
                          <div className="col-span-2"><span className={lbl}>Preview</span></div>
                        </div>
                        {serSites.map(site => {
                          const cfg    = getSerConfig(site.id);
                          const next   = (cfg.current_number || 0) + 1;
                          const padded = String(next).padStart(parseInt(cfg.pad_length) || 2, "0");
                          const preview = cfg.prefix ? `${cfg.prefix}${padded}` : "—";
                          return (
                            <div key={site.id} className="grid grid-cols-12 gap-3 items-center p-4 rounded-xl border border-slate-100 bg-slate-50 hover:border-indigo-200 transition-all">
                              <div className="col-span-3">
                                <p className="text-sm font-semibold text-slate-700">{site.siteName}</p>
                                {site.siteCode && <p className="text-xs text-slate-400 font-mono">{site.siteCode}</p>}
                              </div>
                              <div className="col-span-2">
                                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">Intake</span>
                              </div>
                              <div className="col-span-3">
                                <input
                                  className={inp}
                                  value={cfg.prefix || ""}
                                  onChange={e => updateSerConfig(site.id, "prefix", e.target.value)}
                                  placeholder={`e.g. PR/${site.siteCode || "SITE"}/`}
                                />
                              </div>
                              <div className="col-span-2">
                                <select
                                  className={inp}
                                  value={cfg.pad_length || 2}
                                  onChange={e => updateSerConfig(site.id, "pad_length", parseInt(e.target.value))}>
                                  {[1,2,3,4].map(n => <option key={n} value={n}>{n} digit{n>1?"s":""} ({"0".repeat(n-1)}1)</option>)}
                                </select>
                              </div>
                              <div className="col-span-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 truncate">
                                  {preview}
                                </span>
                                <button
                                  onClick={() => saveSerConfig(site)}
                                  disabled={serSaving === site.id}
                                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                                  {serSaving === site.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                  Save
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <>
                        {/* Sub-tabs: Supply (PO) | SITC (WO) + Add Site button */}
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button onClick={() => setOrderKindTab("Supply")}
                              className={`px-5 py-1.5 rounded-lg text-xs font-bold transition-all ${orderKindTab === "Supply" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                              Supply Order (Purchase Order)
                            </button>
                            <button onClick={() => setOrderKindTab("SITC")}
                              className={`px-5 py-1.5 rounded-lg text-xs font-bold transition-all ${orderKindTab === "SITC" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                              SITC Order (Work Order)
                            </button>
                          </div>
                          <button onClick={() => { setAddSiteForm({ siteId: "", financialYear: currentFY(), currentNumber: 0 }); setShowAddSiteSer(true); }}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all">
                            <Plus size={14} /> Add Site
                          </button>
                        </div>

                        {/* Tiles grid */}
                        {orderTilesForKind(orderKindTab).length === 0 ? (
                          <div className="text-sm text-slate-400 text-center py-12 rounded-xl border-2 border-dashed border-slate-200">
                            No sites configured for {orderKindTab === "Supply" ? "Supply Orders" : "SITC Orders"}. Click <span className="font-semibold text-indigo-600">+ Add Site</span> to start.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {orderTilesForKind(orderKindTab).map(cfg => {
                              const site = serSites.find(s => s.id === cfg.site_id) || {};
                              const next = parseInt(cfg.current_number) || 0;
                              const typeCode = cfg.order_kind === "Supply" ? "PO" : "WO";
                              const preview = `CMP/${site.siteCode || "S"}/${typeCode}/${cfg.financial_year}/${next + 1}`;
                              return (
                                <div key={cfg.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:border-indigo-200 transition-all">
                                  <div className="flex items-start justify-between gap-2 mb-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold text-slate-800 truncate">{site.siteName || "—"}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        {site.siteCode && <span className="text-[10px] font-mono font-semibold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">{site.siteCode}</span>}
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{cfg.financial_year}</span>
                                      </div>
                                    </div>
                                    <button onClick={() => deleteOrderTile(cfg.id)}
                                      className="text-slate-400 hover:text-red-500 transition-all" title="Remove">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                  <div className="mb-2">
                                    <span className={lbl}>Last Issued Serial</span>
                                    <input
                                      type="number" min="0"
                                      className={inp}
                                      value={cfg.current_number !== undefined ? cfg.current_number : 0}
                                      onChange={e => updateOrderTile(cfg.id, "current_number", e.target.value)} />
                                    <p className="text-[10px] text-slate-400 mt-1">Next document = this value + 1 (so 30 → next is 31)</p>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                                    <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 truncate" title={preview}>
                                      {preview}
                                    </span>
                                    <button
                                      onClick={() => saveOrderTile(cfg)}
                                      disabled={serSaving === "order_" + cfg.id}
                                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                                      {serSaving === "order_" + cfg.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                      Save
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ─── ADD SITE MODAL (for Order Serialization) ─── */}
                {showAddSiteSer && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div onClick={() => setShowAddSiteSer(false)}
                      className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
                    <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-black text-slate-800">Add Site</h3>
                          <p className="text-xs text-slate-500 mt-0.5">{orderKindTab === "Supply" ? "Supply Order (PO)" : "SITC Order (WO)"} sequence</p>
                        </div>
                        <button onClick={() => setShowAddSiteSer(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400">
                          <X size={18} />
                        </button>
                      </div>
                      <div className="p-5 space-y-4">
                        <div>
                          <span className={lbl}>Site *</span>
                          <select className={inp} value={addSiteForm.siteId}
                            onChange={e => setAddSiteForm(f => ({ ...f, siteId: e.target.value }))}>
                            <option value="">Select site…</option>
                            {serSites.map(s => (
                              <option key={s.id} value={s.id}>{s.siteName}{s.siteCode ? ` (${s.siteCode})` : ""}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <span className={lbl}>Financial Year *</span>
                          <input className={inp} placeholder="e.g. 2026-27"
                            value={addSiteForm.financialYear}
                            onChange={e => setAddSiteForm(f => ({ ...f, financialYear: e.target.value }))} />
                        </div>
                        <div>
                          <span className={lbl}>Last Issued Serial</span>
                          <input type="number" min="0" className={inp}
                            value={addSiteForm.currentNumber}
                            onChange={e => setAddSiteForm(f => ({ ...f, currentNumber: e.target.value }))} />
                          <p className="text-[10px] text-slate-400 mt-1">Next order = this + 1. Set 0 for fresh site (first order will be 1).</p>
                        </div>
                      </div>
                      <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
                        <button onClick={() => setShowAddSiteSer(false)}
                          className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                        <button onClick={addOrderTile} disabled={serSaving === "add_new"}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
                          {serSaving === "add_new" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── APPROVAL FLOW ─── */}
            {section === "approval_flow" && (isGlobalAdmin || !!pp.approval_flow?.view) && (
               <ApprovalConfig showToast={showToast} />
            )}


      {/* ─── ADD USER MODAL ─── */}
      <AnimatePresence>
        {showAddUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddUser(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
              
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <UserPlus size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 tracking-tight">Add New Member</h3>
                    <p className="text-xs font-medium text-slate-400 mt-0.5">Invite a colleague to your team</p>
                  </div>
                </div>
                <button onClick={() => setShowAddUser(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400 transition-colors">
                  <XCircle size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <form id="add-member-form" onSubmit={addMember} className="space-y-8">
                  {/* Basic Info */}
                  <div>
                    <div className={secHeader}>
                      <p className={secTitle}>Basic Details</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div><span className={lbl}>Full Name *</span><input className={inp} placeholder="e.g. John Doe" value={newUser.name} onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))} required /></div>
                      <div><span className={lbl}>Email Address *</span><input type="email" className={inp} placeholder="john@example.com" value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} required /></div>
                      <div><span className={lbl}>Phone Number</span><input className={inp} placeholder="+91 00000 00000" value={newUser.contact_no} onChange={(e) => setNewUser((p) => ({ ...p, contact_no: e.target.value }))} /></div>
                      <div>
                        <span className={lbl}>Designation</span>
                        {designations.length > 0 ? (
                          <select className={inp}
                            value={designations.find(d => d.name === newUser.designation)?.id || ""}
                            onChange={e => {
                              if (e.target.value === "__custom__") {
                                setNewUser(p => ({ ...p, designation: "" }));
                              } else {
                                applyDesignationToNewUser(e.target.value);
                              }
                            }}>
                            <option value="">Select designation...</option>
                            {designations.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                            <option value="__custom__">— Custom (no template) —</option>
                          </select>
                        ) : (
                          <input className={inp} placeholder="Product Manager" value={newUser.designation}
                            onChange={(e) => setNewUser((p) => ({ ...p, designation: e.target.value }))} />
                        )}
                        {designations.length > 0 && (
                          <p className="text-[10px] text-slate-400 mt-1 ml-1">
                            Selecting a designation auto-fills permissions. You can still customize below.
                          </p>
                        )}
                      </div>
                      <div><span className={lbl}>Department</span><input className={inp} placeholder="Operations" value={newUser.department} onChange={(e) => setNewUser((p) => ({ ...p, department: e.target.value }))} /></div>
                      <div>
                        <span className={lbl}>Role Access</span>
                        <select className={inp} value={newUser.role}
                          onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}>
                          {getManageableRoles(currentUser.role).includes("super_admin") && <option value="super_admin">Super Admin (Organization)</option>}
                          {getManageableRoles(currentUser.role).includes("admin") && <option value="admin">Administrator (Team)</option>}
                          <option value="user">Standard User (Staff)</option>
                        </select>
                        <p className="text-[10px] text-slate-400 mt-1 ml-1">
                          Role controls who this user can manage. App permissions come from the Designation template below.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Signature */}
                  <div>
                    <div className="flex items-center gap-2 mb-5 border-l-4 border-amber-400 pl-4 py-1">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Signature</p>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Optional</span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start gap-5 p-4 bg-amber-50/60 rounded-2xl border border-amber-100">
                      <div className="w-full sm:w-48 h-24 rounded-xl border-2 border-dashed border-amber-200 bg-white flex items-center justify-center overflow-hidden shrink-0 relative group" style={{backgroundImage: "linear-gradient(45deg, #f8f8f8 25%, transparent 25%), linear-gradient(-45deg, #f8f8f8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f8f8f8 75%), linear-gradient(-45deg, transparent 75%, #f8f8f8 75%)", backgroundSize: "8px 8px", backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px"}}>
                        {newUserSigLoading ? (
                          <Loader2 size={20} className="text-amber-400 animate-spin" />
                        ) : newUserSignature ? (
                          <>
                            <img src={newUserSignature} alt="Signature" className="max-h-full max-w-full object-contain p-2" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-3">
                              <button type="button" onClick={() => newUserSigRef.current.click()} className="text-white flex flex-col items-center gap-0.5">
                                <Camera size={14} /><span className="text-[9px] font-bold">Change</span>
                              </button>
                              <button type="button" onClick={() => setNewUserSignature(null)} className="text-red-400 flex flex-col items-center gap-0.5">
                                <Trash2 size={14} /><span className="text-[9px] font-bold">Remove</span>
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="text-center">
                            <Pencil size={20} className="text-amber-300 mx-auto mb-1" />
                            <p className="text-[10px] text-amber-400 font-medium">No signature</p>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-[12px] text-slate-600 font-medium">Upload user's signature now, or they can do it later from their Profile page.</p>
                        <button type="button" onClick={() => newUserSigRef.current.click()}
                          disabled={newUserSigLoading}
                          className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm shadow-amber-200 transition-all active:scale-95 disabled:opacity-60">
                          {newUserSigLoading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                          {newUserSignature ? "Change Signature" : "Upload Signature"}
                        </button>
                        {newUserSignature && (
                          <button type="button" onClick={() => setNewUserSignature(null)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
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
                    <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
                      <div className="flex items-center gap-4 px-6 py-4 bg-slate-50/80 border-b border-slate-100">
                        <span className="w-48 shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400">Platform Section</span>
                        <span className="w-20 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">View</span>
                        <span className="w-20 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Edit</span>
                      </div>
                      {PROFILE_SECTIONS.map(sec => (
                        <div key={sec.key} className="flex items-center gap-4 px-6 py-4 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <span className="w-48 shrink-0 text-[13px] font-bold text-slate-700">{sec.label}</span>
                          {["view", "edit"].map(k => (
                            <div key={k} className="w-20 flex justify-center">
                              <input type="checkbox" checked={newUserProfilePerms[sec.key]?.[k] || false}
                                onChange={e => setNewUserProfilePerms(prev => ({ ...prev, [sec.key]: { ...prev[sec.key], [k]: e.target.checked } }))}
                                className="w-5 h-5 rounded-md accent-purple-600 cursor-pointer shadow-sm" />
                            </div>
                          ))}
                        </div>
                      ))}
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
                    {modulesLoading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin text-emerald-500" /></div> : <GroupedPermissions modules={newUserModules} onChange={updateNewUserModule} />}
                  </div>
                </form>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                <button onClick={() => setShowAddUser(false)} className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
                <button form="add-member-form" type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center gap-2">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <SendHorizonal size={16} />}
                  Send Invitation
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* ─── ROLE CHANGE CONFIRMATION MODAL ─── */}
      <AnimatePresence>
        {confirmRoleChange && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setConfirmRoleChange(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
              
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/20">
              
              <div className="p-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4 border border-amber-100">
                  <ShieldAlert size={32} className="text-amber-500" />
                </div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight mb-2">Update User Role?</h3>
                <p className="text-sm font-medium text-slate-500 leading-relaxed px-4">
                  Aap <span className="font-bold text-slate-800">{confirmRoleChange.member.name}</span> ka role <span className="text-blue-600 font-bold uppercase tracking-wider">{confirmRoleChange.newRole}</span> par change kar rahe hain.
                  <br /><br />
                  Role sirf hierarchy decide karta hai — actual app permissions designation template se aati hain. Permissions same rakho aur baad me designation se update karo.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
                <button
                  onClick={() => executeRoleChange(false)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-200 transition-all active:scale-95"
                >
                  Change Role Only (Recommended)
                </button>
                <button
                  onClick={() => executeRoleChange(true)}
                  className="w-full py-3 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-2xl text-sm font-bold transition-all active:scale-95"
                >
                  Also Wipe Permissions (Advanced)
                </button>
                <button 
                  onClick={() => setConfirmRoleChange(null)}
                  className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
