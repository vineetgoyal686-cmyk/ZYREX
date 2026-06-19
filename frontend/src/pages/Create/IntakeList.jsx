import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { createPortal } from "react-dom";
import {
  Plus, Trash2, X, FileText, Upload, Save, Send,
  ChevronLeft, ChevronRight, Loader2, CheckCircle2,
  Clock, Eye, Hash, ChevronDown, ArrowLeft, PackagePlus,
  ThumbsUp, ThumbsDown, UserCheck, Play, Image as ImageIcon, Paperclip,
  Search, Layers, LayoutGrid, Check, FileSpreadsheet, UserPlus, FolderPlus,
} from "lucide-react";
import { FullViewSiteModal, FullViewCompanyModal, FullCompanyModal } from "./FullMasterModals";
import ProjectFormModal from "../../components/ProjectFormModal";
import ProjectSelect from "../../components/ProjectSelect";
import CompanySelect from "../../components/CompanySelect";
import ViewIntake from "./ViewIntake";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 15;

const inp = "w-full border border-slate-200 rounded px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 text-slate-700 bg-white transition-all";
const lbl = "block text-[13px] font-semibold text-slate-600 mb-1.5";

const TABS = [
  { key: "all",       label: "All"       },
  { key: "draft",     label: "Draft"     },
  { key: "in_review", label: "In Review" },
  { key: "pending",   label: "Pending Approval" },
  { key: "approved",  label: "Approved"  },
  { key: "assigned",  label: "Assigned"  },
  { key: "rejected",  label: "Rejected"  },
  { key: "closed",    label: "Closed"    },
];

const tabStatusMatch = (intake, tabKey) => {
  if (tabKey === "pending") return intake.status === "submitted";
  if (tabKey === "assigned") return intake.status === "working";
  return intake.status === tabKey;
};

const GROUP_BY_OPTIONS = [
  { key: "intake",   label: "Group by Intake"   },
  { key: "site",     label: "Group by Site"     },
  { key: "item",     label: "Group by Item"     },
  { key: "category", label: "Group by Category" },
];

const ACTION_ITEMS = [
  { key: "pdf",      label: "Download PDF",  icon: FileText,        disabled: false },
  { key: "excel",    label: "Download Excel", icon: FileSpreadsheet, disabled: false },
  { key: "assignee", label: "Add Assignee",  icon: UserPlus,        disabled: true  },
  { key: "rfx",      label: "Create RFx",    icon: FolderPlus,      disabled: true  },
];

const STATUS_BADGE = {
  draft:      { label: "Draft",       cls: "bg-yellow-50 text-yellow-600 border border-yellow-200"  },
  submitted:  { label: "Submitted",   cls: "bg-blue-50 text-blue-600 border border-blue-200"        },
  in_review:  { label: "In Review",   cls: "bg-purple-50 text-purple-600 border border-purple-200"  },
  approved:   { label: "Approved",    cls: "bg-green-50 text-green-600 border border-green-200"     },
  working:    { label: "Working",     cls: "bg-orange-50 text-orange-600 border border-orange-200"  },
  rejected:   { label: "Rejected",    cls: "bg-red-50 text-red-600 border border-red-200"           },
  closed:     { label: "Closed",      cls: "bg-slate-100 text-slate-500 border border-slate-200"    },
};

const PRIORITY_COLOR = {
  Low:    "bg-slate-100 text-slate-500",
  Medium: "bg-blue-50 text-blue-600",
  High:   "bg-orange-50 text-orange-600",
  Urgent: "bg-red-50 text-red-600",
};

function SearchDropdown({ options = [], value = "", onChange, onSelect, onAdd, addLabel, placeholder = "Select…", allowFreeText = false, onView, variant, listSize }) {
  const tableField = variant === "table";
  const isLargeList = listSize === "large";
  const fieldCls = tableField ? "min-h-[38px]" : "";
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");
  const [pos, setPos]       = useState(null);
  const anchorRef           = useRef(null);
  const dropRef             = useRef(null);
  const searchRef           = useRef(null);
  const ignoreScrollRef     = useRef(false);
  const scrollPadElRef      = useRef(null);
  const DROP_PAD            = isLargeList ? "480px" : "400px";
  const LIST_ROW_H          = isLargeList ? 52 : 42;
  const LIST_VISIBLE_ROWS   = 5;
  const LIST_PREF_H         = 28 + LIST_ROW_H * LIST_VISIBLE_ROWS;
  const MIN_DROP_W          = isLargeList ? 360 : 240;
  const PANEL_NEED          = isLargeList ? 440 : 380;

  const closeDropdown = () => {
    if (scrollPadElRef.current) {
      scrollPadElRef.current.style.paddingBottom = "";
      scrollPadElRef.current = null;
    }
    setOpen(false);
    setPos(null);
    setSearch("");
  };

  const getScrollParent = (node) => {
    let p = node?.parentElement;
    while (p && p !== document.body) {
      const { overflowY } = getComputedStyle(p);
      if ((overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay")
          && p.scrollHeight > p.clientHeight + 1) return p;
      p = p.parentElement;
    }
    return document.querySelector("main") || document.documentElement;
  };

  const ensureSpaceBelow = (field) => {
    const scrollEl = getScrollParent(field);
    if (!scrollEl || !field) return;

    scrollPadElRef.current = scrollEl;
    scrollEl.style.paddingBottom = DROP_PAD;

    const pad = 12;
    const panelNeed = PANEL_NEED;
    const rect = field.getBoundingClientRect();
    const shortfall = rect.bottom + panelNeed - (window.innerHeight - pad);
    if (shortfall > 0) scrollEl.scrollTop += Math.ceil(shortfall);
  };

  const placeDropdown = () => {
    const field = anchorRef.current;
    if (!field) return null;
    const rect = field.getBoundingClientRect();
    const pad = 8;
    const vh = window.innerHeight;
    const dropW = Math.max(rect.width, MIN_DROP_W);
    const left = Math.min(Math.max(pad, rect.left), window.innerWidth - dropW - pad);
    const chrome = 60 + (onAdd ? 36 : 0);
    const spaceBelow = vh - rect.bottom - pad;
    const panelMaxH = Math.min(chrome + LIST_PREF_H, spaceBelow - 4);

    return {
      top: rect.bottom + 4,
      left,
      width: dropW,
      panelMaxH,
      listMaxH: Math.min(LIST_PREF_H, Math.max(LIST_ROW_H * 2, panelMaxH - chrome)),
    };
  };

  const openDropdown = (el) => {
    if (!el) return;
    anchorRef.current = el;
    ignoreScrollRef.current = true;
    setSearch("");
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const field = anchorRef.current;
    if (field) ensureSpaceBelow(field);
    const sync = () => { const p = placeDropdown(); if (p) setPos(p); };
    sync();
    const id = requestAnimationFrame(() => {
      sync();
      setTimeout(() => {
        sync();
        ignoreScrollRef.current = false;
      }, 150);
    });
    const onResize = () => sync();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (searchRef.current) setTimeout(() => searchRef.current?.focus(), 50);
    const onScroll = (e) => {
      if (ignoreScrollRef.current) return;
      if (dropRef.current?.contains(e.target)) return;
      const p = placeDropdown();
      if (p) setPos(p);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  useEffect(() => {
    if (anchorRef.current) autoGrowTextarea(anchorRef.current);
  }, [value, allowFreeText]);

  const filtered = options.filter(o => !search || o.toLowerCase().includes(search.toLowerCase()));
  const pick     = (opt) => { (onSelect || onChange)(opt); closeDropdown(); };

  const setAnchor = (el) => {
    anchorRef.current = el;
    if (el && allowFreeText) autoGrowTextarea(el);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        {allowFreeText ? (
          <textarea className={`${inp} text-xs resize-none overflow-hidden ${fieldCls}`} value={value} placeholder={placeholder}
            rows={1}
            ref={setAnchor}
            onChange={e => { onChange(e.target.value); setSearch(e.target.value); autoGrowTextarea(e.target); }}
            onInput={e => autoGrowTextarea(e.currentTarget)}
            onFocus={e => {
              autoGrowTextarea(e.currentTarget);
              if (!open) openDropdown(e.currentTarget);
            }}
            style={{ overflowY: "hidden", minHeight: tableField ? 38 : undefined }} />
        ) : (
          <div ref={setAnchor} onClick={(e) => open ? closeDropdown() : openDropdown(e.currentTarget)}
            className={`${inp} text-xs cursor-pointer flex items-center justify-between select-none ${fieldCls}`}>
            <span title={value || ""} className={`flex-1 min-w-0 break-words leading-snug ${value ? "text-slate-700" : "text-slate-400 italic font-normal"}`}>{value || placeholder}</span>
            <ChevronDown size={11} className={`text-slate-400 shrink-0 ml-1 transition-transform ${open ? "rotate-180" : ""}`} />
          </div>
        )}
      </div>

      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[1250]" onClick={closeDropdown} />
          <div ref={dropRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.panelMaxH, zIndex: 1251 }}
            className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col">
            {/* Search box */}
            <div className="px-2 py-1.5 border-b border-slate-100 shrink-0">
              <input ref={searchRef} type="text" value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                placeholder="Search…"
                className="w-full text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-indigo-400 placeholder:text-slate-300" />
            </div>
            {/* Results */}
            <div className="overflow-y-auto thin-scrollbar-light" style={{ maxHeight: pos.listMaxH ?? LIST_PREF_H }}>
              {filtered.length === 0
                ? <div className="px-3 py-3 text-center text-xs text-slate-400 italic">No results</div>
                : <>
                    <div className="px-3 pt-1.5 pb-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50">
                      {filtered.length} result{filtered.length !== 1 ? "s" : ""} found
                    </div>
                    {filtered.map((o, i) => (
                      <div key={i}
                        onClick={(e) => { e.stopPropagation(); pick(o); }}
                        className={`px-3 py-2 text-xs cursor-pointer border-b border-slate-50 last:border-0 transition-colors flex items-start gap-2
                          ${value === o ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-700 hover:bg-indigo-50"}`}>
                        <span className={`flex-1 leading-snug ${isLargeList ? "whitespace-normal break-words" : "line-clamp-2"}`}>{o}</span>
                        {onView && (
                          <button onClick={e => { e.stopPropagation(); onView(o); }}
                            className="shrink-0 mt-0.5 text-slate-400 hover:text-indigo-600 transition-colors">
                            <Eye size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </>
              }
            </div>
            {/* Add button */}
            {onAdd && (
              <div onClick={(e) => { e.stopPropagation(); const t = search; closeDropdown(); onAdd(t); }}
                className="shrink-0 border-t border-slate-100 text-[10px] font-semibold px-3 py-2 flex items-center justify-center gap-1.5 uppercase tracking-wide transition-colors bg-indigo-50/60 hover:bg-indigo-100 text-indigo-600 cursor-pointer">
                <Plus size={12} strokeWidth={3} />
                {search.trim() ? `${addLabel || "Add"} "${search.trim()}"` : (addLabel || "Add new")}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

function SearchableSelect({ options, value, onChange, placeholder }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const ref               = useRef();

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(v => !v)}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between bg-white">
        <span className={selected ? "text-slate-700" : "text-slate-400"}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-[2100] mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full px-2 py-1 text-sm outline-none text-slate-700" />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs text-slate-400">No results</p>
              : filtered.map(o => (
                <div key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors
                    ${value === o.value ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-slate-50 text-slate-700"}`}>
                  {o.label}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

const Toast = ({ msg, type }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3 shadow-lg text-sm font-semibold
    ${type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
    {msg}
  </div>
);

const stripHtml = (html) => {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").replace(/ /g, " ").trim();
};

const autoGrowTextarea = (el) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

const emptyDescRow = () => ({
  _did: Date.now() + Math.random(),
  description: "",
  make: "",
  brand: "",
  unit: "",
  boq_qty: "",
  existing_qty: "",
  raised_qty: "",
  remarks: "",
  files: [],
});

const emptyItem = () => ({
  _id: Date.now() + Math.random(),
  product_name: "",
  _procItem: null,
  rows: [emptyDescRow()],
});

export default function IntakeList({ project }) {
  const currentUser  = JSON.parse(localStorage.getItem("bms_user") || "{}");
  const isAdmin      = ["global_admin", "admin"].includes(currentUser.role);
  const isGlobal     = currentUser.role === "global_admin";

  /* ── view: "list" | "create" | "detail" ── */
  const [view,          setView]          = useState("list");
  const [activeTab,     setActiveTab]     = useState("all");
  const [intakes,       setIntakes]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [page,          setPage]          = useState(1);
  const [toast,         setToast]         = useState(null);
  const [detail,        setDetail]        = useState(null);
  const [submitting,    setSubmitting]    = useState(null);
  const [approvalFlow,  setApprovalFlow]  = useState(null); // intake approval config
  const [allUsers,      setAllUsers]      = useState([]);
  const [assignModal,   setAssignModal]   = useState(null); // intakeId being assigned
  const [assignTo,      setAssignTo]      = useState("");
  const [rejectModal,   setRejectModal]   = useState(null); // intakeId
  const [rejectReason,  setRejectReason]  = useState("");
  const [search,        setSearch]        = useState("");
  const [groupBy,       setGroupBy]       = useState("intake");
  const [groupByOpen,   setGroupByOpen]   = useState(false);
  const [actionsOpen,   setActionsOpen]   = useState(false);
  const groupByRef                        = useRef(null);
  const actionsRef                        = useRef(null);

  /* create form state */
  const [sites,    setSites]    = useState([]);
  const [actionModal, setActionModal] = useState({ type: null, data: null });
  const [saving,   setSaving]   = useState(null);
  const [preview,  setPreview]  = useState(null);
  const [form,     setForm]     = useState({
    name: "", requisition_by: "",
    priority: "Low", available_by: "", site_id: "", site_name: "",
    company: "", company_id: "", intake_type: "Supply",
    category: "", prepared_by: currentUser.name || "",
    created_at: new Date().toISOString().slice(0, 10), note: "",
  });
  const [items,     setItems]     = useState([emptyItem()]);
  const [optCols,     setOptCols]     = useState({ make: false, brand: false, remarks: false, attachments: false });
  const [companies,   setCompanies]   = useState([]);
  const [allItems,       setAllItems]       = useState([]);
  const [procCategories, setProcCategories] = useState([]);
  const [showColMenu,    setShowColMenu]    = useState(false);
  const [catOpen,        setCatOpen]        = useState(false);
  const [catSearch,      setCatSearch]      = useState("");
  const [addProdModal,   setAddProdModal]   = useState({ open: false, targetIIdx: null });
  const [addProdForm,    setAddProdForm]    = useState({ materialName: "", category: "", unit: "", brands: [], specifications: [], remarks: "", image: null, imagePreview: null });
  const [addProdSaving,  setAddProdSaving]  = useState(false);
  const [descModal,      setDescModal]      = useState({ open: false, iIdx: null, rIdx: null, text: "", procItemId: null });
  const [viewModal,      setViewModal]      = useState({ open: false, text: "" });
  const [uomModal,       setUomModal]       = useState({ open: false, iIdx: null, rIdx: null, name: "", code: "", saving: false });
  const [uoms,           setUoms]           = useState([]);
  const addProdFileRef                      = useRef(null);

  useEffect(() => { fetchIntakes(); }, []);
  useEffect(() => {
    const closeMenus = (e) => {
      if (groupByRef.current && !groupByRef.current.contains(e.target)) setGroupByOpen(false);
      if (actionsRef.current && !actionsRef.current.contains(e.target)) setActionsOpen(false);
    };
    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, []);
  useEffect(() => {
    fetch(`${API}/api/projects`).then(r => r.json())
      .then(d => setSites(d.projects || [])).catch(() => {});
    fetch(`${API}/api/procurement/companies`).then(r => r.json())
      .then(d => setCompanies(d.companies || [])).catch(() => {});
    fetch(`${API}/api/procurement/items`).then(r => r.json())
      .then(d => setAllItems(d.items || [])).catch(() => {});
    fetch(`${API}/api/procurement/categories`).then(r => r.json())
      .then(d => setProcCategories(d.categories || [])).catch(() => {});
    fetch(`${API}/api/procurement/uom`).then(r => r.json())
      .then(d => setUoms(d.uoms || [])).catch(() => {});
  }, []);
  useEffect(() => {
    // Load approval flow config for intake module
    fetch(`${API}/api/intakes/approval-flows`).then(r => r.json())
      .then(d => { const f = (d.flows||[]).find(x => x.module === "intake"); setApprovalFlow(f || null); })
      .catch(() => {});
    // Load users for assign dropdown (admin+)
    if (isAdmin) {
      const token = localStorage.getItem("bms_token") || "";
      fetch(`${API}/api/users`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setAllUsers(d.users || [])).catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (!form.site_id) { setPreview(null); return; }
    fetch(`${API}/api/intakes/serialization/next/intake/${form.site_id}`)
      .then(r => r.json()).then(d => setPreview(d.preview || null)).catch(() => setPreview(null));
  }, [form.site_id]);

  /* Auto-select project when entering create form with a project context */
  useEffect(() => {
    if (view !== "create" || !sites.length || form.site_id) return;
    const normProj = String(project || "").trim().toLowerCase();
    if (!normProj || normProj === "all project") return;
    const match = sites.find(s =>
      [s.projectCode, s.project_code, s.projectName, s.project_name]
        .some(v => String(v || "").trim().toLowerCase() === normProj)
    );
    if (match) setForm(f => ({ ...f, site_id: match.id, site_name: match.projectName || "" }));
  }, [sites, view, project]);

  const fetchIntakes = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/intakes`);
      const data = await res.json();
      setIntakes(data.intakes || []);
    } catch { setIntakes([]); }
    setLoading(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  /* ── List helpers ── */
  const fmt = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const normProject = String(project || "").trim().toLowerCase();
  const isAllProject = !normProject || normProject === "all project";
  const projectMatches = (...values) => (
    isAllProject || values.some(v => String(v || "").trim().toLowerCase() === normProject)
  );
  const availableSites = isAllProject
    ? sites
    : sites.filter(s => projectMatches(s.projectCode, s.project_code, s.projectName, s.project_name));

  const refreshSites = async () => {
    try {
      const res = await fetch(`${API}/api/projects`);
      const d = await res.json();
      const list = d.projects || [];
      setSites(list);
      return list;
    } catch {
      return sites;
    }
  };

  const handleSiteChange = (e) => {
    const id = e.target.value;
    const s = sites.find(x => x.id === id);
    setForm(f => ({ ...f, site_id: id, site_name: s?.projectName || s?.project_name || "" }));
  };

  const refreshCompanies = async () => {
    try {
      const res = await fetch(`${API}/api/procurement/companies`);
      const d = await res.json();
      const list = d.companies || [];
      setCompanies(list);
      return list;
    } catch {
      return companies;
    }
  };

  const handleCompanyChange = (e) => {
    const id = e.target.value;
    const c = companies.find(x => x.id === id);
    setForm(f => ({
      ...f,
      company_id: id || "",
      company: c ? (c.companyName || c.company_name || "") : "",
    }));
  };

  const projectScopedIntakes = intakes.filter(i =>
    projectMatches(i.site_code, i.siteCode, i.site_name, i.siteName)
  );
  const getTabCount = (tabKey) => {
    if (tabKey === "all") return projectScopedIntakes.length;
    return projectScopedIntakes.filter(i => tabStatusMatch(i, tabKey)).length;
  };

  const searchMatch = (intake) => {
    const ms = search.trim().toLowerCase();
    if (!ms) return true;
    const blob = [
      intake.intake_number,
      intake.name,
      intake.site_name,
      intake.requisition_by,
      intake.priority,
      intake.status,
    ].filter(Boolean).join(" ").toLowerCase();
    return blob.includes(ms);
  };

  const filtered = projectScopedIntakes.filter(i =>
    (activeTab === "all" || tabStatusMatch(i, activeTab)) && searchMatch(i)
  );

  const selectedGroupBy = GROUP_BY_OPTIONS.find(o => o.key === groupBy) || GROUP_BY_OPTIONS[0];

  const handleAction = (key) => {
    setActionsOpen(false);
    if (key === "pdf") showToast("Download PDF — coming soon");
    else if (key === "excel") showToast("Download Excel — coming soon");
  };
  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleSubmitDraft = async (id) => {
    if (!confirm("Submit this draft to procurement?")) return;
    setSubmitting(id);
    try {
      const res  = await fetch(`${API}/api/intakes/${id}/submit`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`Submitted — ${data.intake_number || "No serial (configure Serialization in Profile)"}`);
      fetchIntakes();
      if (detail?.id === id) setDetail(prev => ({ ...prev, status: "submitted", intake_number: data.intake_number }));
    } catch (err) { showToast(err.message, "error"); }
    setSubmitting(null);
  };

  const canApprove = (intake) => {
    if (!isAdmin) return false;
    if (intake.status !== "submitted") return false;
    if (isGlobal) return true;
    return approvalFlow?.approver_user_id === currentUser.id;
  };

  const handleApprove = async (id) => {
    setSubmitting(id + "_approve");
    try {
      const res = await fetch(`${API}/api/intakes/${id}/approve`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: currentUser.name }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast("Intake approved"); fetchIntakes();
      if (detail?.id === id) setDetail(p => ({ ...p, status: "approved", approved_by: currentUser.name }));
    } catch { showToast("Failed to approve", "error"); }
    setSubmitting(null);
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setSubmitting(rejectModal + "_reject");
    try {
      const res = await fetch(`${API}/api/intakes/${rejectModal}/reject`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reject_reason: rejectReason, rejected_by: currentUser.name }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast("Intake rejected"); setRejectModal(null); setRejectReason(""); fetchIntakes();
    } catch { showToast("Failed to reject", "error"); }
    setSubmitting(null);
  };

  const handleAssign = async () => {
    if (!assignModal || !assignTo) return showToast("Select a person to assign", "error");
    const user = allUsers.find(u => u.id === assignTo);
    setSubmitting(assignModal + "_assign");
    try {
      const res = await fetch(`${API}/api/intakes/${assignModal}/assign`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to_id: assignTo, assigned_to_name: user?.name || "", assigned_by_name: currentUser.name }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast(`Assigned to ${user?.name}`); setAssignModal(null); setAssignTo(""); fetchIntakes();
    } catch { showToast("Failed to assign", "error"); }
    setSubmitting(null);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this intake?")) return;
    try {
      await fetch(`${API}/api/intakes/${id}`, { method: "DELETE" });
      showToast("Deleted"); fetchIntakes();
      if (detail?.id === id) { setDetail(null); setView("list"); }
    } catch { showToast("Delete failed", "error"); }
  };

  /* ── Create form helpers ── */
  const resetForm = () => {
    setForm({ name: "", requisition_by: currentUser.name || "", priority: "Low", available_by: "", site_id: "", site_name: "", company: "", company_id: "", intake_type: "Supply", category: "", prepared_by: currentUser.name || "", created_at: new Date().toISOString().slice(0, 10), note: "" });
    setItems([emptyItem()]);
    setPreview(null);
    setOptCols({ make: false, brand: false, remarks: false, attachments: false });
  };

  const updateItemName = (iIdx, val) =>
    setItems(prev => prev.map((it, i) => i === iIdx ? { ...it, product_name: val } : it));
  const addDescRow = (iIdx) =>
    setItems(prev => prev.map((it, i) => i === iIdx ? { ...it, rows: [...it.rows, emptyDescRow()] } : it));
  const removeDescRow = (iIdx, rIdx) =>
    setItems(prev => prev.map((it, i) => i === iIdx ? { ...it, rows: it.rows.filter((_, j) => j !== rIdx) } : it));
  const updateDescRow = (iIdx, rIdx, field, val) =>
    setItems(prev => prev.map((it, i) => i === iIdx ? {
      ...it, rows: it.rows.map((r, j) => j === rIdx ? { ...r, [field]: val } : r),
    } : it));
  const patchDescRow = (iIdx, rIdx, patch) =>
    setItems(prev => prev.map((it, i) => i === iIdx ? {
      ...it, rows: it.rows.map((r, j) => j === rIdx ? { ...r, ...patch } : r),
    } : it));
  const removeItem = (iIdx) =>
    setItems(prev => prev.filter((_, i) => i !== iIdx));

  const handleSave = async (status) => {
    if (!form.name.trim())  return showToast("Intake name required", "error");
    if (!form.site_id)      return showToast("Please select a project", "error");
    const flatRows = items
      .flatMap(it => it.rows.map(r => ({ ...r, product_name: it.product_name })))
      .filter(r => r.product_name.trim() || r.description.trim());
    if (!flatRows.length) return showToast("Add at least one item", "error");

    setSaving(status);
    try {
      const fd = new FormData();
      fd.append("intakeData", JSON.stringify({
        ...form, status, created_by: currentUser.name || "",
        items: flatRows.map(({ _did, files: _f, ...rest }) => rest),
      }));
      flatRows.forEach((row, idx) =>
        (row.files || []).forEach((file, fi) => fd.append(`item_${idx}_file_${fi}`, file))
      );
      const res  = await fetch(`${API}/api/intakes`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      showToast(status === "draft" ? "Saved as draft" : `Submitted — ${data.intake_number || "No serial configured"}`);
      resetForm();
      setView("list");
      // switch to correct tab
      setActiveTab(status === "draft" ? "draft" : "pending"); // key stays "pending", label updated to "Pending Approval"
      setPage(1);
      fetchIntakes();
    } catch (err) { showToast(err.message, "error"); }
    setSaving(null);
  };

  const handleSaveUom = async () => {
    if (!uomModal.name.trim()) return;
    setUomModal(p => ({ ...p, saving: true }));
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const res  = await fetch(`${API}/api/procurement/uom`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uomName: uomModal.name.trim(), uomCode: uomModal.code.trim().toLowerCase(), createdByName: u.name || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const newUom = data.uom || { uomName: uomModal.name.trim(), uomCode: uomModal.code.trim() };
      setUoms(prev => [...prev, newUom]);
      updateDescRow(uomModal.iIdx, uomModal.rIdx, "unit", newUom.uomName);
      setUomModal({ open: false, iIdx: null, rIdx: null, name: "", code: "", saving: false });
      showToast("UOM added!");
    } catch (err) { showToast(err.message || "Failed", "error"); setUomModal(p => ({ ...p, saving: false })); }
  };

  const handleSaveDesc = async () => {
    const { iIdx, rIdx, text, procItemId, type } = descModal;
    const isEmpty = !text || !text.trim() || text.trim() === "<p><br></p>" || text.trim() === "<p></p>";
    if (isEmpty) { setDescModal({ open: false }); return; }
    const isBrand = type === "brand";
    updateDescRow(iIdx, rIdx, isBrand ? "brand" : "description", text.trim());
    setDescModal({ open: false });
    if (procItemId) {
      const dbField = isBrand ? "brands" : "description";
      try {
        const res  = await fetch(`${API}/api/procurement/items/${procItemId}/append-array`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: dbField, value: text.trim() }),
        });
        const data = await res.json();
        if (data.success) {
          setAllItems(prev => prev.map(it => it.id === procItemId ? {
            ...it,
            ...(isBrand ? { brands: data.updatedArray || it.brands } : { specifications: data.updatedArray || it.specifications }),
          } : it));
          showToast(`Added to master item!`);
        }
      } catch { showToast("Saved to row but failed to update master", "error"); }
    }
  };

  /* ══════════ RENDER ══════════ */

  /* ── CREATE VIEW ── */
  if (view === "create") {
    const toggleCol = (col) => setOptCols(prev => ({ ...prev, [col]: !prev[col] }));

    const isSupplyType      = form.intake_type === "Supply";
    const filteredProcItems = allItems.filter(it => {
      const t = (it.itemType || "supply").toLowerCase();
      return isSupplyType ? t === "supply" : t === "sitc";
    });
    const visibleProcItems  = form.category
      ? filteredProcItems.filter(it => it.category === form.category)
      : filteredProcItems;
    const COMMON_UNITS = ["Nos","Kg","Ltr","Mtr","Sqm","Cum","Rmt","Set","Pair","Box","Pack","Roll","Sheet","Bag","Ton","MT"];
    const selectProduct = (iIdx, procItem) =>
      setItems(prev => prev.map((it, i) => i === iIdx ? {
        ...it, product_name: procItem.materialName, _procItem: procItem,
        rows: it.rows.map(r => ({ ...r, unit: procItem.unit || r.unit || "", description: "", brand: "" })),
      } : it));

    const refreshAllItems = () =>
      fetch(`${API}/api/procurement/items`).then(r => r.json())
        .then(d => setAllItems(d.items || [])).catch(() => {});

    /* Append a value to an item's array field (description/make) in master data */
    const appendItemField = async (procItemId, dbField, value) => {
      if (!procItemId || !value?.trim()) return;
      await fetch(`${API}/api/procurement/items/${procItemId}/append-array`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: dbField, value: value.trim() }),
      }).catch(() => {});
      refreshAllItems();
    };

    /* Open modal to create a new product */
    const createNewProduct = (name, iIdx) => {
      setAddProdForm({
        materialName: name?.trim() || "", category: form.category || "", unit: "",
        brands: [], specifications: [], remarks: "", image: null, imagePreview: null,
      });
      setAddProdModal({ open: true, targetIIdx: iIdx });
    };

    /* Save product from modal */
    const saveNewProduct = async () => {
      if (!addProdForm.materialName.trim()) return;
      setAddProdSaving(true);
      try {
        const fd = new FormData();
        fd.append("materialName", addProdForm.materialName.trim());
        fd.append("itemType", isSupplyType ? "Supply" : "SITC");
        fd.append("category", addProdForm.category || "");
        fd.append("unit", addProdForm.unit || "");
        fd.append("brands", JSON.stringify(addProdForm.brands.filter(b => b.trim())));
        fd.append("specifications", JSON.stringify(addProdForm.specifications.filter(s => s.trim())));
        if (addProdForm.image) fd.append("image", addProdForm.image);
        fd.append("remarks", addProdForm.remarks || "");
        fd.append("createdById", currentUser.id || "");
        fd.append("createdByName", currentUser.name || "");
        const res  = await fetch(`${API}/api/procurement/items`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create");
        await refreshAllItems();
        const newItem = {
          id: data.item?.id || data.id,
          materialName: addProdForm.materialName.trim(),
          unit: addProdForm.unit || "",
          brands: addProdForm.brands,
          specifications: addProdForm.specifications,
          category: addProdForm.category || "",
          itemType: isSupplyType ? "Supply" : "SITC",
        };
        selectProduct(addProdModal.targetIIdx, newItem);
        setAddProdModal({ open: false, targetIIdx: null });
        showToast("Product added to master data");
      } catch (err) { showToast(err.message || "Failed", "error"); }
      setAddProdSaving(false);
    };

    return (
      <div className="w-full flex flex-col min-h-full">
        <style>{`
          .intake-items-table thead th { background: rgb(232,232,235); }
          .intake-col-lines { border-collapse: separate; border-spacing: 0; }
          .intake-col-lines th, .intake-col-lines td { border-right: 1px solid rgba(226,232,240,0.9); }
          .intake-col-lines th { border-right-color: rgba(180,188,198,0.9); }
          .intake-col-lines td { word-break: break-word; white-space: normal; text-align: justify; }
          .intake-col-lines th:last-child, .intake-col-lines td:last-child { border-right: 0; }
          .intake-col-lines tr.row-divider > td { border-top: 1px solid rgba(226,232,240,0.9); }
          .intake-scroll::-webkit-scrollbar { height: 3px; }
          .intake-scroll::-webkit-scrollbar-track { background: #f1f5f9; }
          .intake-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
        `}</style>
        {toast && <Toast msg={toast.msg} type={toast.type} />}

        {/* ── Add UOM Modal ── */}
        {uomModal.open && (
          <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-800">Add UOM</h2>
                <button onClick={() => setUomModal({ open: false })} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">UOM Name *</label>
                  <input autoFocus value={uomModal.name} onChange={e => setUomModal(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Kilogram"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">UOM Code</label>
                  <input value={uomModal.code} onChange={e => setUomModal(p => ({ ...p, code: e.target.value.toLowerCase() }))}
                    placeholder="e.g. kg"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700" />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
                <button onClick={() => setUomModal({ open: false })} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
                <button onClick={handleSaveUom} disabled={uomModal.saving}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                  {uomModal.saving ? "Saving…" : "Add UOM"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── View Full Spec Modal ── */}
        {viewModal.open && (
          <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Eye size={14} /> Full Specification</h3>
                <button onClick={() => setViewModal({ open: false, text: "" })} className="text-slate-400 hover:text-rose-500 transition-colors bg-white rounded-md p-1 border border-slate-200"><X size={16} /></button>
              </div>
              <div className="p-5">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{viewModal.text}</p>
              </div>
              <div className="px-5 pb-5 flex justify-end">
                <button onClick={() => setViewModal({ open: false, text: "" })} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Description / Spec Add Modal ── */}
        {descModal.open && (
          <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className={`bg-white rounded-2xl shadow-2xl w-full overflow-hidden ${descModal.type === "brand" ? "max-w-sm" : "max-w-xl"}`}>
              <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-sm font-bold text-slate-700">{descModal.type === "brand" ? "Add Brand" : descModal.simple ? "Add Specification" : "Add Description"}</h3>
                <button onClick={() => setDescModal({ open: false })} className="text-slate-400 hover:text-rose-500 transition-colors bg-white rounded-md p-1 border border-slate-200"><X size={16} /></button>
              </div>
              <div className="p-5">
                <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wide">{descModal.type === "brand" ? "Enter Brand Name" : descModal.simple ? "Enter Specification" : "Enter Description"}</label>
                {descModal.simple ? (
                  /* Supply — plain textarea */
                  <textarea
                    autoFocus
                    value={descModal.text || ""}
                    onChange={e => setDescModal(prev => ({ ...prev, text: e.target.value }))}
                    placeholder={descModal.type === "brand" ? "Enter brand name…" : "Type specification here…"}
                    rows={descModal.type === "brand" ? 2 : 3}
                    className="w-full border border-slate-300 rounded-md px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
                  />
                ) : (
                  /* SITC — Quill rich editor */
                  <div className="border border-slate-300 rounded-xl overflow-hidden focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100 transition-all">
                    <ReactQuill
                      theme="snow"
                      value={descModal.text || ""}
                      onChange={val => setDescModal(prev => ({ ...prev, text: val }))}
                      modules={{ toolbar: [["bold","italic","underline"],
                        [{ list: "ordered" }, { list: "bullet" }],
                        [{ align: [] }], ["clean"]] }}
                      placeholder="Type description here…"
                      style={{ minHeight: 160 }}
                    />
                  </div>
                )}
                {descModal.procItemId && (
                  <p className="text-[10px] text-slate-400 mt-2 font-medium">This will also be saved to the item master permanently.</p>
                )}
              </div>
              <div className="px-5 pb-5 flex justify-end gap-2">
                <button onClick={() => setDescModal({ open: false })} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200">Cancel</button>
                <button onClick={handleSaveDesc} className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200">
                  {descModal.type === "brand" ? "Add Brand" : descModal.simple ? "Add Specification" : "Save Description"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Sticky Header ── */}
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-5 sm:px-6 py-3 flex items-center justify-between gap-4 shrink-0">
          {/* Left: back + title */}
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => { resetForm(); setView("list"); }}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-medium px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-all shrink-0">
              <ArrowLeft size={14} /> Back
            </button>
            <div className="w-px h-5 bg-slate-200 shrink-0" />
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <PackagePlus size={14} className="text-indigo-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-[15px] font-bold text-slate-800 leading-tight">Create Intake</h1>
                <p className="text-[11px] text-slate-400 leading-tight hidden sm:block">Raise a material purchase requisition</p>
              </div>
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => handleSave("draft")} disabled={!!saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-all">
              {saving === "draft" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              <span className="hidden sm:inline">Save as Draft</span>
              <span className="sm:hidden">Draft</span>
            </button>
            <button onClick={() => handleSave("submitted")} disabled={!!saving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all">
              {saving === "submitted" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Submit
            </button>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex flex-col flex-1 bg-white">

        {/* Header form */}
        <div>
          <div className="px-8 py-3 bg-slate-50 border-b border-slate-200">
            <p className="text-[16px] font-bold text-slate-800 border-b-2 border-slate-800 pb-0.5 inline-block">Intake Setup</p>
          </div>
          <div className="px-8 py-6 bg-slate-100">

          {/* Row 1: Intake No · Intake Name · Requested By · Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-14 mb-6">

            {/* Intake Number */}
            <div>
              <label className={lbl}>Intake Number</label>
              <div className="flex items-center gap-2 border border-slate-200 rounded px-3 py-2.5 bg-slate-50">
                <Hash size={13} className="text-slate-400 shrink-0" />
                <span className={`text-sm font-mono font-bold ${preview ? "text-indigo-600" : "text-slate-300"}`}>
                  {preview || "Auto-generated"}
                </span>
              </div>
            </div>

            {/* Intake Name */}
            <div>
              <label className={lbl}>Intake Name <span className="text-red-400 normal-case font-normal">*</span></label>
              <input className={inp} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Enter intake name" />
            </div>

            {/* Requested By */}
            <div>
              <label className={lbl}>Requested By <span className="text-red-400 normal-case font-normal">*</span></label>
              <input className={inp} value={form.requisition_by}
                onChange={e => setForm(f => ({ ...f, requisition_by: e.target.value }))}
                placeholder="Name" />
            </div>

            {/* Priority */}
            <div>
              <label className={lbl}>Priority</label>
              <div className="relative">
                <select className={`${inp} appearance-none pr-8`} value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {["Low","Medium","High","Urgent"].map(p => <option key={p}>{p}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

          </div>

          {/* Row 2: Required By Date · Project · Company · Intake Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-14">

            {/* Required By Date */}
            <div>
              <label className={lbl}>Required By Date</label>
              <input type="date" className={inp} value={form.available_by}
                onChange={e => setForm(f => ({ ...f, available_by: e.target.value }))} />
            </div>

            {/* Select Project */}
            <div>
              <ProjectSelect
                label="Select Project"
                required
                variant="intake"
                value={form.site_id}
                onChange={handleSiteChange}
                options={availableSites}
                placeholder="Select project…"
                onView={s => setActionModal({ type: "viewSite", data: s })}
                onAdd={() => setActionModal({ type: "addSite" })}
              />
            </div>

            {/* Select Company */}
            <div>
              <CompanySelect
                label="Select Company"
                variant="intake"
                value={form.company_id}
                onChange={handleCompanyChange}
                options={companies}
                placeholder="Select company…"
                onView={c => setActionModal({ type: "viewCompany", data: c })}
                onAdd={() => setActionModal({ type: "addCompany" })}
              />
            </div>

            {/* Intake Type */}
            <div>
              <label className={lbl}>Intake Type</label>
              <div className="flex items-center gap-2 h-[42px]">
                {["Supply","Services"].map(t => (
                  <label key={t} className={`flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer transition-all text-sm font-semibold select-none
                    ${form.intake_type === t
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"}`}>
                    <input type="radio" name="intake_type" value={t} checked={form.intake_type === t}
                      onChange={() => { setForm(f => ({ ...f, intake_type: t, category: "" })); setItems([emptyItem()]); }} className="hidden" />
                    {t}
                  </label>
                ))}
              </div>
            </div>

          </div>

          {/* Row 3: Prepared By · Created At · Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-14 mt-6">

            {/* Prepared By */}
            <div>
              <label className={lbl}>Prepared By</label>
              <div className="flex items-center border border-slate-200 rounded px-3 py-2.5 bg-slate-50">
                <span className="text-sm text-slate-600 font-medium">{form.prepared_by || "—"}</span>
              </div>
            </div>

            {/* Created At */}
            <div>
              <label className={lbl}>Created At</label>
              <input type="date" className={inp} value={form.created_at}
                onChange={e => setForm(f => ({ ...f, created_at: e.target.value }))} />
            </div>

            {/* Category */}
            <div>
              <label className={lbl}>Category</label>
              <div className="relative">
                <button type="button"
                  onClick={() => { setCatOpen(v => !v); setCatSearch(""); }}
                  className={`${inp} flex items-center justify-between text-left`}>
                  <span className={form.category ? "text-slate-700" : "text-slate-400"}>
                    {form.category || "Select category…"}
                  </span>
                  <ChevronDown size={13} className="text-slate-400 shrink-0" />
                </button>

                {catOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setCatOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-xl z-30">
                      <div className="p-2 border-b border-slate-100">
                        <input autoFocus
                          className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                          placeholder="Search category…"
                          value={catSearch}
                          onChange={e => setCatSearch(e.target.value)} />
                      </div>
                      <div className="max-h-[204px] overflow-y-auto py-1">
                        {(() => {
                          const list = procCategories
                            .filter(c => c.status !== "Inactive")
                            .filter(c => !catSearch || c.categoryName.toLowerCase().includes(catSearch.toLowerCase()));
                          if (!list.length) return <p className="px-3 py-2 text-xs text-slate-400">No results found</p>;
                          return [
                            <p key="count" className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50">
                              {list.length} result{list.length !== 1 ? "s" : ""} found
                            </p>,
                            ...list.map(c => (
                            <button key={c.id} type="button"
                              onClick={() => { setForm(f => ({ ...f, category: c.categoryName })); setCatOpen(false); setCatSearch(""); }}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors
                                ${form.category === c.categoryName ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>
                              {c.categoryName}
                            </button>
                          ))];
                        })()}
                      </div>
                      {form.category && (
                        <div className="border-t border-slate-100 px-3 py-1.5">
                          <button type="button" onClick={() => { setForm(f => ({ ...f, category: "" })); setCatOpen(false); }}
                            className="text-xs text-slate-400 hover:text-red-500 transition-colors">Clear</button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
        </div>

        {/* Items Table */}
        <div className="px-8 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-slate-800 border-b-2 border-slate-800 pb-0.5 inline-block">Table of Content</h3>
          <div className="relative">
            <button type="button" onClick={() => setShowColMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-all">
              <Plus size={12} /> Add Column <ChevronDown size={11} className="ml-0.5" />
            </button>
            {showColMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowColMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded shadow-lg z-30 py-1 min-w-[130px]">
                  {[["make","Make"],["brand","Brand"],["remarks","Remarks"],["attachments","Attachments"]].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                      <input type="checkbox" checked={optCols[key]} onChange={() => toggleCol(key)} className="accent-indigo-600 w-3.5 h-3.5" />
                      {label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mx-6 mt-3 mb-6 border border-slate-200 rounded-sm bg-white shadow-sm">

          <div className="overflow-x-auto thin-scrollbar-xs">
            <table className="intake-items-table intake-col-lines w-full text-xs" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-slate-200">
                  <th style={{ width: 50, left: 0 }}  className="sticky left-0 z-10 bg-white py-3 pl-3 pr-2 text-xs font-semibold text-slate-700 text-center whitespace-nowrap">S.No</th>
                  <th style={{ width: 250, left: 50 }} className="sticky z-10 bg-white px-3 py-3 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Item Name</th>
                  <th style={{ width: 380, left: 300 }} className="sticky z-10 bg-white px-3 py-3 text-xs font-semibold text-slate-700 text-left whitespace-nowrap border-r border-slate-200">{isSupplyType ? "Specification" : "Description"}</th>
                  {optCols.make    && <th style={{ width: 150 }} className="px-3 py-3 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Make</th>}
                  {optCols.brand   && <th style={{ width: 150 }} className="px-3 py-3 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Brand</th>}
                  <th style={{ width: 120 }}  className="px-3 py-3 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Unit</th>
                  <th style={{ width: 100 }} className="px-3 py-3 text-xs font-semibold text-slate-700 text-right whitespace-nowrap">BOQ Qty</th>
                  <th style={{ width: 100 }} className="px-3 py-3 text-xs font-semibold text-slate-700 text-right whitespace-nowrap">Existing Qty</th>
                  <th style={{ width: 100 }} className="px-3 py-3 text-xs font-semibold text-slate-700 text-right whitespace-nowrap">Raised Qty</th>
                  {optCols.remarks && <th style={{ width: 240 }} className="px-3 py-3 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Remarks</th>}
                  {optCols.attachments && <th style={{ width: 160 }}  className="px-3 py-3 text-xs font-semibold text-slate-700 text-center whitespace-nowrap">
                    Attachments
                    <span className="block text-[10px] font-normal text-slate-400">(Max 5 allowed)</span>
                  </th>}
                  <th style={{ width: 44, right: 0 }} className="sticky right-0 z-10 bg-white"></th>
                </tr>
              </thead>
              <tbody>
                {items.flatMap((item, iIdx) =>
                  item.rows.map((row, rIdx) => {
                    const isLastRow = rIdx === item.rows.length - 1;
                    const nb = {
                      ...(rIdx > 0 ? { borderTopColor: 'transparent' } : {}),
                      ...(isLastRow ? { borderBottom: '1px solid #e2e8f0' } : {}),
                    };
                    const procItem  = item._procItem || visibleProcItems.find(it => stripHtml(it.materialName) === stripHtml(item.product_name)) || null;
                    const hasName   = !!item.product_name.trim();
                    const lockCls   = !hasName ? "pointer-events-none opacity-30" : "";
                    return (
                    <tr key={row._did} className="hover:bg-slate-50/40 transition-colors group">

                      {/* S.No — rowspan */}
                      {rIdx === 0 && (
                        <td rowSpan={item.rows.length}
                          className="sticky left-0 z-10 bg-white px-2 py-2 text-center align-top"
                          style={{ borderBottom: '1px solid #e2e8f0', left: 0 }}>
                          <div className="flex flex-col items-center gap-2 pt-1.5">
                            <span className="text-xs text-slate-400 font-semibold">{iIdx + 1}</span>
                            {items.length > 1 && (
                              <button type="button" onClick={() => removeItem(iIdx)} title="Remove product"
                                className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all">
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Product Name — rowspan */}
                      {rIdx === 0 && (
                        <td rowSpan={item.rows.length}
                          className="sticky z-10 bg-white px-2 py-2 align-top"
                          style={{ borderBottom: '1px solid #e2e8f0', left: 50, minWidth: 250 }}>
                          <div className="flex flex-col gap-2">
                            <SearchDropdown
                              options={visibleProcItems.map(it => stripHtml(it.materialName))}
                              value={stripHtml(item.product_name)}
                              allowFreeText
                              placeholder="Product name"
                              onChange={val => updateItemName(iIdx, val)}
                              onSelect={val => {
                                const match = visibleProcItems.find(it => stripHtml(it.materialName) === val);
                                if (match) selectProduct(iIdx, match); else updateItemName(iIdx, val);
                              }}
                              onAdd={val => createNewProduct(val, iIdx)}
                              addLabel="Add product"
                            />
                            <button type="button" onClick={() => addDescRow(iIdx)}
                              className="flex items-center gap-1 text-[10px] text-indigo-500 font-semibold hover:text-indigo-700 transition-colors">
                              <Plus size={10} /> Add description
                            </button>
                          </div>
                        </td>
                      )}

                      {/* Description / Specification */}
                      <td className={`sticky z-10 bg-white px-2 py-2 border-r border-slate-200 align-top ${lockCls}`} style={{ ...nb, left: 300 }}>
                        <SearchDropdown
                          variant="table"
                          listSize="large"
                          allowFreeText
                          options={(procItem?.specifications || []).map(s => stripHtml(s))}
                          value={stripHtml(row.description)}
                          placeholder={isSupplyType ? "Specification…" : "Description…"}
                          onChange={val => updateDescRow(iIdx, rIdx, "description", val)}
                          onSelect={val => {
                            const patch = { description: val };
                            if (!row.unit && procItem?.unit) patch.unit = procItem.unit;
                            patchDescRow(iIdx, rIdx, patch);
                          }}
                          onAdd={val => setDescModal({ open: true, iIdx, rIdx, text: isSupplyType ? (val || "") : "", procItemId: procItem?.id || null, simple: isSupplyType })}
                          addLabel={isSupplyType ? "Add spec" : "Add spec"}
                          onView={val => setViewModal({ open: true, text: val })}
                        />
                      </td>

                      {/* Make (optional column) — free text */}
                      {optCols.make && (
                        <td className={`px-2 py-2 ${lockCls}`} style={nb}>
                          <textarea
                            ref={el => autoGrowTextarea(el)}
                            value={row.make}
                            onChange={e => updateDescRow(iIdx, rIdx, "make", e.target.value)}
                            onInput={e => autoGrowTextarea(e.currentTarget)}
                            onFocus={e => autoGrowTextarea(e.currentTarget)}
                            rows={1}
                            className="w-full resize-none overflow-hidden text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 transition-all leading-snug"
                            placeholder="Make…" />
                        </td>
                      )}

                      {/* Brand (optional column) */}
                      {optCols.brand && (
                        <td className={`px-2 py-2 ${lockCls}`} style={nb}>
                          <SearchDropdown
                            options={procItem?.brands || []}
                            value={row.brand}
                            placeholder="Brand…"
                            onChange={val => updateDescRow(iIdx, rIdx, "brand", val)}
                            onAdd={val => setDescModal({ open: true, iIdx, rIdx, text: val || "", procItemId: procItem?.id || null, simple: true, type: "brand" })}
                            addLabel="Add brand"
                          />
                        </td>
                      )}

                      {/* Unit */}
                      <td className={`px-2 py-2 ${lockCls}`} style={nb}>
                        <SearchDropdown
                          options={[...new Set([...(procItem?.unit ? [procItem.unit] : []), ...uoms.map(u => u.uomName), ...COMMON_UNITS])]}
                          value={row.unit}
                          placeholder="Unit…"
                          onChange={val => updateDescRow(iIdx, rIdx, "unit", val)}
                          onAdd={val => setUomModal({ open: true, iIdx, rIdx, name: val || "", code: "", saving: false })}
                          addLabel="Add unit"
                        />
                      </td>

                      {/* BOQ Qty */}
                      <td className={`px-2 py-2 ${lockCls}`} style={nb}>
                        <input type="number" min="0" className={`${inp} text-xs text-right`} value={row.boq_qty}
                          onChange={e => updateDescRow(iIdx, rIdx, "boq_qty", e.target.value)}
                          placeholder="0" />
                      </td>

                      {/* Existing Qty */}
                      <td className={`px-2 py-2 ${lockCls}`} style={nb}>
                        <input type="number" min="0" className={`${inp} text-xs text-right`} value={row.existing_qty}
                          onChange={e => updateDescRow(iIdx, rIdx, "existing_qty", e.target.value)}
                          placeholder="0" />
                      </td>

                      {/* Raised Qty */}
                      <td className={`px-2 py-2 ${lockCls}`} style={nb}>
                        <input type="number" min="0" className={`${inp} text-xs text-right`} value={row.raised_qty}
                          onChange={e => updateDescRow(iIdx, rIdx, "raised_qty", e.target.value)}
                          placeholder="0" />
                      </td>

                      {/* Remarks (optional column) */}
                      {optCols.remarks && (
                        <td className={`px-2 py-2 ${lockCls}`} style={nb}>
                          <textarea
                            ref={el => autoGrowTextarea(el)}
                            value={row.remarks}
                            onChange={e => updateDescRow(iIdx, rIdx, "remarks", e.target.value)}
                            onInput={e => autoGrowTextarea(e.currentTarget)}
                            onFocus={e => autoGrowTextarea(e.currentTarget)}
                            rows={1}
                            className="w-full resize-none overflow-hidden text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 transition-all leading-snug"
                            placeholder="Remarks…" />
                        </td>
                      )}

                      {/* Attachments — label+id, no ref needed */}
                      {optCols.attachments && <td className={`px-2 py-2 w-32 text-center ${lockCls}`} style={nb}>
                        <div className="space-y-1">
                          {row.files.map((f, fi) => (
                            <div key={fi} className="flex items-center gap-1 bg-indigo-50 rounded-lg px-1.5 py-0.5">
                              <button type="button"
                                onClick={() => {
                                  const url = URL.createObjectURL(f);
                                  const a = document.createElement('a');
                                  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
                                  document.body.appendChild(a); a.click();
                                  document.body.removeChild(a);
                                  setTimeout(() => URL.revokeObjectURL(url), 10000);
                                }}
                                className="flex items-center gap-1 flex-1 min-w-0 hover:opacity-70 transition-all">
                                <FileText size={10} className="text-indigo-500 shrink-0" />
                                <span className="text-[10px] text-indigo-700 truncate max-w-[60px] underline">{f.name}</span>
                              </button>
                              <button type="button"
                                onClick={() => updateDescRow(iIdx, rIdx, "files", row.files.filter((_, i) => i !== fi))}
                                className="text-slate-400 hover:text-red-400 shrink-0">
                                <X size={9} />
                              </button>
                            </div>
                          ))}
                          {row.files.length < 5 && (
                            <label htmlFor={`file-${row._did}`}
                              className="flex items-center gap-1 text-[10px] text-slate-500 font-medium cursor-pointer px-2 py-1 rounded-full border border-slate-300 bg-white hover:bg-slate-50 transition-all w-fit">
                              <Paperclip size={10} /> Attach
                            </label>
                          )}
                          <input id={`file-${row._did}`} type="file" multiple
                            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx" className="hidden"
                            onChange={e => {
                              const picked = Array.from(e.target.files).map(f => {
                                f._url = URL.createObjectURL(f);
                                return f;
                              });
                              e.target.value = "";
                              updateDescRow(iIdx, rIdx, "files", [...row.files, ...picked].slice(0, 5));
                            }} />
                        </div>
                      </td>}

                      {/* Remove desc row */}
                      <td className="sticky right-0 z-10 bg-white px-1 py-2 text-center border-l border-slate-100" style={{ ...nb, width: 44 }}>
                        {item.rows.length > 1 && (
                          <button type="button" onClick={() => removeDescRow(iIdx, rIdx)}
                            className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-all">
                            <X size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-3 border-t border-slate-200">
            <button onClick={() => setItems(p => [...p, emptyItem()])}
              className="flex items-center gap-1.5 text-xs text-indigo-500 font-semibold hover:text-indigo-700 transition-colors">
              <Plus size={13} /> Add another product
            </button>
          </div>
        </div>

        {/* ── Note Section ── */}
        <div className="px-8 py-3 bg-slate-50 border-t border-b border-slate-200">
          <h3 className="text-[16px] font-bold text-slate-800 border-b-2 border-slate-800 pb-0.5 inline-block">Note</h3>
        </div>
        <div className="px-8 py-5 bg-slate-100">
          <textarea
            rows={4}
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="Add any additional notes or remarks for this intake..."
            className="w-full border border-slate-200 rounded px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 text-slate-700 bg-white transition-all resize-none"
          />
        </div>

        </div>{/* end scrollable content */}

        {actionModal.type === "addSite" && (
          <ProjectFormModal
            onClose={() => setActionModal({ type: null })}
            onError={msg => showToast(msg, "error")}
            onSuccess={async (id) => {
              await refreshSites();
              handleSiteChange({ target: { value: id } });
              setActionModal({ type: null });
              showToast("Project added!");
            }}
          />
        )}
        {actionModal.type === "editSite" && (
          <ProjectFormModal
            editData={actionModal.data}
            onClose={() => setActionModal({ type: null })}
            onError={msg => showToast(msg, "error")}
            onSuccess={async () => {
              await refreshSites();
              setActionModal({ type: null });
              showToast("Project updated!");
            }}
          />
        )}
        {actionModal.type === "viewSite" && (
          <FullViewSiteModal
            site={actionModal.data}
            onClose={() => setActionModal({ type: null })}
            onEdit={d => setActionModal({ type: "editSite", data: d })}
          />
        )}
        {actionModal.type === "addCompany" && (
          <FullCompanyModal
            onClose={() => setActionModal({ type: null })}
            onSuccess={async (id) => {
              await refreshCompanies();
              handleCompanyChange({ target: { value: id } });
              setActionModal({ type: null });
              showToast("Company added!");
            }}
          />
        )}
        {actionModal.type === "editCompany" && (
          <FullCompanyModal
            editData={actionModal.data}
            onClose={() => setActionModal({ type: null })}
            onSuccess={async () => {
              await refreshCompanies();
              setActionModal({ type: null });
              showToast("Company updated!");
            }}
          />
        )}
        {actionModal.type === "viewCompany" && (
          <FullViewCompanyModal
            company={actionModal.data}
            onClose={() => setActionModal({ type: null })}
            onEdit={d => setActionModal({ type: "editCompany", data: d })}
          />
        )}

        {/* Add Product Modal — same UI as ItemList "Add Supply Item" */}
        {addProdModal.open && createPortal(
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-800">
                  Add {isSupplyType ? "Supply" : "SITC"} Item
                </h2>
                <button onClick={() => setAddProdModal({ open: false, targetIIdx: null })}
                  className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4 max-h-[72vh] overflow-y-auto">

                {/* Image */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Image</label>
                  <div onClick={() => addProdFileRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-5 cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-all">
                    {addProdForm.imagePreview
                      ? <img src={addProdForm.imagePreview} alt="" className="h-24 object-contain rounded-lg" />
                      : <><ImageIcon size={26} className="text-slate-300" /><p className="text-xs text-slate-400">Click to upload</p></>
                    }
                  </div>
                  <input ref={addProdFileRef} type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const file = e.target.files[0];
                      if (file) setAddProdForm(f => ({ ...f, image: file, imagePreview: URL.createObjectURL(file) }));
                    }} />
                </div>

                <div className="grid grid-cols-2 gap-3">

                  {/* Category */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Category</label>
                    <SearchableSelect
                      options={procCategories.filter(c => c.status !== "Inactive").map(c => ({ label: c.categoryName, value: c.categoryName }))}
                      value={addProdForm.category}
                      onChange={v => setAddProdForm(f => ({ ...f, category: v }))}
                      placeholder="Select category…" />
                  </div>

                  {/* Unit */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Unit</label>
                    <SearchableSelect
                      options={uoms.length > 0
                        ? uoms.map(u => ({ label: `${u.uomName} (${u.uomCode})`, value: u.uomCode }))
                        : COMMON_UNITS.map(u => ({ label: u, value: u }))}
                      value={addProdForm.unit}
                      onChange={v => setAddProdForm(f => ({ ...f, unit: v }))}
                      placeholder="Select unit…" />
                  </div>

                  {/* Item Name */}
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Item Name <span className="text-red-400">*</span></label>
                    <input autoFocus value={addProdForm.materialName}
                      onChange={e => setAddProdForm(f => ({ ...f, materialName: e.target.value }))}
                      placeholder="e.g. Cement OPC 53 Grade"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700" />
                  </div>

                  {/* Description / Points */}
                  <div className="col-span-full">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description / Points</label>
                      <button type="button"
                        onClick={() => setAddProdForm(f => ({ ...f, specifications: [...f.specifications, ""] }))}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                        <Plus size={10} /> Add Point
                      </button>
                    </div>
                    <div className="space-y-2">
                      {addProdForm.specifications.map((s, i) => (
                        <div key={i} className="flex gap-2">
                          <input value={s}
                            onChange={e => setAddProdForm(f => { const specs = [...f.specifications]; specs[i] = e.target.value; return { ...f, specifications: specs }; })}
                            placeholder={`Specification Point ${i + 1}...`}
                            className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700" />
                          <button type="button"
                            onClick={() => setAddProdForm(f => ({ ...f, specifications: f.specifications.filter((_, j) => j !== i) }))}
                            className="w-8 h-8 rounded-xl bg-slate-50 text-slate-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center shrink-0 border border-slate-100 transition-all mt-1">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      {addProdForm.specifications.length === 0 && (
                        <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/30">
                          <p className="text-xs text-slate-400 font-medium">Click "Add Point" to start adding descriptions</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Brand(s) */}
                  <div className="col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Brand(s) <span className="text-slate-400 font-normal normal-case">(max 5)</span></label>
                      {addProdForm.brands.length < 5 && (
                        <button type="button"
                          onClick={() => setAddProdForm(f => ({ ...f, brands: [...f.brands, ""] }))}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                          <Plus size={12} /> Add Brand
                        </button>
                      )}
                    </div>
                    {addProdForm.brands.length === 0
                      ? <p className="text-xs text-slate-400 italic">Click "Add Brand" to add brands</p>
                      : <div className="space-y-2">
                          {addProdForm.brands.map((b, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input value={b}
                                onChange={e => setAddProdForm(f => { const brands = [...f.brands]; brands[i] = e.target.value; return { ...f, brands }; })}
                                placeholder={`Brand ${i + 1}`}
                                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-slate-400 text-slate-700" />
                              <button type="button"
                                onClick={() => setAddProdForm(f => ({ ...f, brands: f.brands.filter((_, j) => j !== i) }))}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                    }
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Remarks</label>
                    <input value={addProdForm.remarks}
                      onChange={e => setAddProdForm(f => ({ ...f, remarks: e.target.value }))}
                      placeholder="Optional…"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700" />
                  </div>

                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
                <button onClick={() => setAddProdModal({ open: false, targetIIdx: null })}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
                <button onClick={saveNewProduct} disabled={addProdSaving || !addProdForm.materialName.trim()}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                  {addProdSaving ? "Saving…" : "Add Item"}
                </button>
              </div>

            </div>
          </div>,
          document.body
        )}

      </div>
    );
  }

  /* ── LIST VIEW ── */
  return (
    <div className="relative w-full min-w-0 min-h-full flex flex-col">
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header + tabs — flush, underline style */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Intakes</h1>
          <button onClick={() => { resetForm(); setView("create"); }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all shrink-0">
            <Plus size={14} /> Create Intake
          </button>
        </div>
        <div className="flex px-5 pt-3.5 pb-0 gap-7 overflow-x-auto">
          {TABS.map(t => {
            const count = getTabCount(t.key);
            return (
              <button key={t.key} onClick={() => { setActiveTab(t.key); setPage(1); }}
                className={`pb-3.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 flex items-center gap-2
                  ${activeTab === t.key ? "text-indigo-600 border-indigo-600" : "text-slate-400 border-transparent hover:text-slate-600"}`}>
                {t.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
                  ${activeTab === t.key ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search + filters */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-200">
          <div className="relative flex-1 max-w-sm min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search intakes..."
              className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 bg-white placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div ref={groupByRef} className="relative">
              <button
                type="button"
                onClick={() => { setGroupByOpen(v => !v); setActionsOpen(false); }}
                className="inline-flex items-center gap-2 h-9 px-3.5 border border-slate-200 rounded bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
              >
                <Layers size={15} className="text-slate-600" />
                {selectedGroupBy.label}
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${groupByOpen ? "rotate-180" : ""}`} />
              </button>
              {groupByOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-40">
                  {GROUP_BY_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => { setGroupBy(opt.key); setGroupByOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors
                        ${groupBy === opt.key ? "bg-slate-50 text-slate-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}
                    >
                      <Layers size={14} className="text-slate-500 shrink-0" />
                      <span className="flex-1 text-left">{opt.label}</span>
                      {groupBy === opt.key && <Check size={14} className="text-slate-700 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div ref={actionsRef} className="relative">
              <button
                type="button"
                onClick={() => { setActionsOpen(v => !v); setGroupByOpen(false); }}
                className="inline-flex items-center gap-2 h-9 px-3.5 border border-slate-200 rounded bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
              >
                <LayoutGrid size={15} className="text-slate-600" />
                Actions
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${actionsOpen ? "rotate-180" : ""}`} />
              </button>
              {actionsOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-40">
                  {ACTION_ITEMS.map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={item.disabled}
                        onClick={() => !item.disabled && handleAction(item.key)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors
                          ${item.disabled
                            ? "text-slate-300 cursor-not-allowed"
                            : "text-slate-700 hover:bg-slate-50"}`}
                      >
                        <Icon size={15} className={item.disabled ? "text-slate-300" : "text-slate-500"} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 px-4 sm:px-5 py-4">
      <div className="bg-white rounded border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-indigo-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-300 font-bold uppercase tracking-widest text-xs">No intakes here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["S.No","Intake No.","Name","Site","Requested By","Priority","Required By","Items","Status","Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginated.map((intake, idx) => {
                  const badge = STATUS_BADGE[intake.status] || STATUS_BADGE.draft;
                  return (
                    <tr key={intake.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-400">{(page-1)*PER_PAGE+idx+1}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setDetail(intake); setView("detail"); }}
                          className={`font-mono text-xs font-bold hover:underline transition-all ${intake.intake_number ? "text-indigo-600 hover:text-indigo-800" : "text-slate-300 cursor-default"}`}>
                          {intake.intake_number || "—"}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700 max-w-44 truncate">{intake.name || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{intake.site_name || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{intake.requisition_by || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[intake.priority] || PRIORITY_COLOR.Low}`}>
                          {intake.priority || "Low"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmt(intake.available_by)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{intake.intake_items?.length || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <button onClick={() => { setDetail(intake); setView("detail"); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="View">
                            <Eye size={13} />
                          </button>
                          {/* Submit draft */}
                          {intake.status === "draft" && (
                            <button onClick={() => handleSubmitDraft(intake.id)} disabled={!!submitting}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Submit to procurement">
                              {submitting === intake.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                            </button>
                          )}
                          {/* Approve */}
                          {canApprove(intake) && (
                            <button onClick={() => handleApprove(intake.id)} disabled={!!submitting}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-all" title="Approve">
                              <ThumbsUp size={13} />
                            </button>
                          )}
                          {/* Reject */}
                          {canApprove(intake) && (
                            <button onClick={() => { setRejectModal(intake.id); setRejectReason(""); }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Reject">
                              <ThumbsDown size={13} />
                            </button>
                          )}
                          {/* Assign (after approved) */}
                          {isAdmin && intake.status === "approved" && (
                            <button onClick={() => { setAssignModal(intake.id); setAssignTo(""); }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all" title="Assign to team">
                              <UserCheck size={13} />
                            </button>
                          )}
                          {/* Start working (assigned person) */}
                          {intake.status === "in_review" && (intake.assigned_to_id === currentUser.id || isAdmin) && (
                            <button onClick={async () => {
                              await fetch(`${API}/api/intakes/${intake.id}/start-working`, { method: "PATCH" });
                              showToast("Status updated to Working"); fetchIntakes();
                            }} className="p-1.5 rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-all" title="Start Working">
                              <Play size={13} />
                            </button>
                          )}
                          <button onClick={() => handleDelete(intake.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-400">{filtered.length} intakes · Page {page} of {totalPages}</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const n = totalPages <= 5 ? i+1 : page <= 3 ? i+1 : page >= totalPages-2 ? totalPages-4+i : page-2+i;
                  return (
                    <button key={n} onClick={() => setPage(n)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${page===n ? "bg-slate-900 text-white border-slate-900" : "text-slate-600 border-slate-200 hover:bg-white"}`}>
                      {n}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-black text-slate-800 mb-4">Reject Intake</h3>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Reason for rejection</label>
            <textarea className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-400 text-slate-700 resize-none" rows={3}
              value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Enter reason…" />
            <div className="flex gap-2 mt-4">
              <button onClick={handleReject} disabled={!!submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-all">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <ThumbsDown size={14} />} Reject
              </button>
              <button onClick={() => { setRejectModal(null); setRejectReason(""); }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-black text-slate-800 mb-4">Assign to Team Member</h3>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Select person</label>
            <div className="relative">
              <select className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 text-slate-700 appearance-none pr-8"
                value={assignTo} onChange={e => setAssignTo(e.target.value)}>
                <option value="">Select team member…</option>
                {allUsers.map(u => <option key={u.id} value={u.id}>{u.name} — {u.designation || u.role}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAssign} disabled={!!submitting || !assignTo}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-all">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />} Assign
              </button>
              <button onClick={() => { setAssignModal(null); setAssignTo(""); }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail side drawer */}
      {view === "detail" && detail && (
        <div className="absolute inset-0 z-40 bg-slate-100">
          <ViewIntake
            intake={detail}
            currentUser={currentUser}
            onBack={() => { setDetail(null); setView("list"); }}
            onSubmitDraft={handleSubmitDraft}
          />
        </div>
      )}
    </div>
  );
}
