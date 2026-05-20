import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, Pencil, Trash2, X, Upload, FileText, FileSpreadsheet, ArrowUpRight, Eye, ChevronLeft, ChevronRight, History, ChevronDown, Trash, RotateCcw, Copy, Check } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { logAudit } from "../../utils/auditLog";
import LogPanel from "../../components/LogPanel";
import { INDIA_STATES } from "../../data/indiaStateCities.js";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 15;

const todayStr = () => new Date().toISOString().split("T")[0];

const DIAL_CODES = [
  { code: "+91",  label: "+91"  },
  { code: "+1",   label: "+1"   },
  { code: "+44",  label: "+44"  },
  { code: "+971", label: "+971" },
  { code: "+65",  label: "+65"  },
  { code: "+61",  label: "+61"  },
  { code: "+49",  label: "+49"  },
  { code: "+86",  label: "+86"  },
];

function parseContact(raw) {
  const s = (raw || "").trim();
  for (const { code } of DIAL_CODES) {
    if (s.startsWith(code)) return { dialCode: code, digits: s.slice(code.length).replace(/\D/g, "") };
  }
  return { dialCode: "+91", digits: s.replace(/\D/g, "") };
}

const emptyForm = {
  vendorName: "", firmName: "", email: "", dialCode: "+91", contactNumber: "",
  state: "", city: "", address: "",
  logo: null, logoPreview: "", logoUrl: "",
  vendorCard: null, vendorCardUrl: "",
  otherAttachment: null, otherAttachmentUrl: "",
  gstNo: "", category: "", dateOfVisit: todayStr(),
  notes: "", status: "Pool",
};

const inp = "w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-100 text-slate-700 transition-all";
const inpArea = "w-full min-h-[100px] border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-100 text-slate-700 transition-all resize-y";
const lbl = "block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider";
const dropZone = "flex flex-col items-stretch gap-2 border-2 border-dashed rounded-md px-3 py-3 cursor-pointer transition-all";

const STATUS_META = {
  Pool:        { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400",   border: "border-amber-200" },
  Shortlisted: { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500",    border: "border-blue-200"  },
  Rejected:    { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-400",     border: "border-red-200"   },
  Promoted:    { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", border: "border-emerald-200"},
};

const POOL_STATUS_OPTIONS = ["Pool", "Shortlisted", "Rejected", "Promoted"];

const POOL_EXPORT_COLS = [
  ["Pool Code", "pool_code"],
  ["Date of Visit", "date_of_visit"],
  ["Vendor Name", "vendor_name"],
  ["Firm Name", "firm_name"],
  ["Email", "email"],
  ["Contact", "contact_number"],
  ["State", "state"],
  ["City", "city"],
  ["Address", "address"],
  ["GST No", "gst_no"],
  ["Category", "category"],
  ["Status", "status"],
  ["Notes", "notes"],
  ["Logo URL", "logo_url"],
  ["Vendor card URL", "attachment_url"],
  ["Other attachment URL", "other_attachment_url"],
];

const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/** Searchable list only — no free-text value (pick from options). Dropdown portaled to avoid modal overflow clipping. */
function SearchableLocationSelect({ label, value, onChange, options, disabled, placeholder, optionsLoading }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [rect, setRect] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 220);
    return () => clearTimeout(id);
  }, [q]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setRect(null);
      return;
    }
    const r = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const maxH = Math.min(280, Math.max(100, spaceBelow));
    setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 200), maxH });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom - 12;
      const maxH = Math.min(280, Math.max(100, spaceBelow));
      setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 200), maxH });
    };
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const searchResult = useMemo(() => {
    const opts = options || [];
    const t = debouncedQ.toLowerCase();
    if (!t) {
      const total = opts.length;
      const SLICE = 400;
      return { display: opts.slice(0, SLICE), total, capped: total > SLICE };
    }
    const matches = [];
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i];
      if (o.toLowerCase().includes(t)) matches.push(o);
    }
    const total = matches.length;
    const CAP = 500;
    return { display: matches.slice(0, CAP), total, capped: total > CAP };
  }, [options, debouncedQ]);

  useEffect(() => { if (!open) setQ(""); }, [open]);

  const showLoading = optionsLoading && (!options || options.length === 0);

  return (
    <div className="relative">
      <label className={lbl}>{label}</label>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        className={`${inp} flex w-full min-h-[42px] items-center justify-between gap-2 text-left ${disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : "bg-white"}`}
      >
        <span className={`truncate ${value ? "text-slate-800" : "text-slate-400"}`}>{value || placeholder}</span>
        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && rect && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[200] flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xl"
          style={{ top: rect.top, left: rect.left, width: rect.width, maxHeight: rect.maxH }}
        >
          <div className="shrink-0 border-b border-slate-100 p-2">
            <div className="flex items-center gap-2 rounded border border-slate-200 px-2">
              <Search size={12} className="shrink-0 text-slate-400" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                className="h-8 w-full bg-transparent text-xs outline-none"
                placeholder="Search…"
                onMouseDown={e => e.stopPropagation()}
              />
            </div>
            <p className="mt-1.5 px-0.5 text-[11px] text-slate-500 tabular-nums">
              {showLoading
                ? "Loading…"
                : `${searchResult.total.toLocaleString("en-IN")} ${searchResult.total === 1 ? "result" : "results"} found${
                    searchResult.capped ? ` — showing first ${searchResult.display.length.toLocaleString("en-IN")}` : ""
                  }`}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {showLoading ? (
              <p className="px-3 py-3 text-center text-xs text-slate-400">Loading places…</p>
            ) : searchResult.display.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs text-slate-400">No match</p>
            ) : (
              searchResult.display.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { onChange(opt); setOpen(false); }}
                  className="flex w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  {opt}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const VendorPool = forwardRef(function VendorPool({ onPromoted }, ref) {
  const [pools,      setPools]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editId,     setEditId]     = useState(null);
  const [form,       setForm]       = useState(emptyForm);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState(null);
  const [search,     setSearch]     = useState("");
  const [statusFilter, setStatusFilter]   = useState([]);
  const [categoryFilter, setCategoryFilter] = useState([]);
  const [page,       setPage]       = useState(1);
  const [categories, setCategories] = useState([]);
  const [viewEntry,   setViewEntry]  = useState(null);
  const [logTarget,   setLogTarget]  = useState(null);
  const [showBulk,   setShowBulk]   = useState(false);
  const [bulkRows,   setBulkRows]   = useState([]);
  const [bulkFile,   setBulkFile]   = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showTrash,   setShowTrash]  = useState(false);
  const [trashPools,  setTrashPools] = useState([]);
  const [trashLoading,setTrashLoading] = useState(false);
  const [copiedKey,  setCopiedKey]  = useState("");
  const logoRef = useRef();
  const vendorCardRef = useRef();
  const otherAttachRef = useRef();
  const bulkRef   = useRef();

  const stateOptions = useMemo(() => {
    const s = (form.state || "").trim();
    if (s && !INDIA_STATES.includes(s)) return [s, ...INDIA_STATES];
    return INDIA_STATES;
  }, [form.state]);


  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchPools = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/procurement/vendor-pool`);
      const data = await res.json();
      setPools(data.pools || []);
    } catch { setPools([]); }
    finally { setLoading(false); }
  };

  const fetchCategories = async () => {
    try {
      const res  = await fetch(`${API}/api/procurement/categories`);
      const data = await res.json();
      setCategories((data.categories || []).map(c => c.categoryName || c.category_name).filter(Boolean));
    } catch {}
  };

  const fetchTrash = async () => {
    setTrashLoading(true);
    try {
      const res  = await fetch(`${API}/api/procurement/vendor-pool/trash`);
      const data = await res.json();
      setTrashPools(data.pools || []);
    } catch { setTrashPools([]); }
    finally { setTrashLoading(false); }
  };

  const handleRestore = async (id) => {
    try {
      await fetch(`${API}/api/procurement/vendor-pool/${id}/restore`, { method: "POST" });
      showToast("Restored");
      fetchTrash();
      fetchPools();
    } catch { showToast("Restore failed", "error"); }
  };

  const handlePermanentDelete = async (id, name) => {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    try {
      await fetch(`${API}/api/procurement/vendor-pool/${id}/permanent`, { method: "DELETE" });
      showToast("Permanently deleted");
      fetchTrash();
    } catch { showToast("Delete failed", "error"); }
  };

  useEffect(() => { fetchPools(); fetchCategories(); }, []);

  const openAdd = useCallback(() => {
    setForm({ ...emptyForm, dateOfVisit: todayStr() });
    setEditId(null);
    setShowModal(true);
  }, []);

  const openEdit = (p) => {
    const { dialCode, digits } = parseContact(p.contact_number);
    setForm({
      vendorName:    p.vendor_name    || "",
      firmName:      p.firm_name      || "",
      email:         p.email          || "",
      dialCode,
      contactNumber: digits,
      state:         p.state          || "",
      city:          p.city           || "",
      address:       p.address        || "",
      logo: null, logoPreview: p.logo_url || "", logoUrl: p.logo_url || "",
      vendorCard: null, vendorCardUrl: p.attachment_url || "",
      otherAttachment: null, otherAttachmentUrl: p.other_attachment_url || "",
      gstNo:         p.gst_no         || "",
      category:      p.category       || "",
      dateOfVisit:   p.date_of_visit  || todayStr(),
      notes:         p.notes          || "",
      status:        p.status         || "Pool",
    });
    setEditId(p.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.vendorName.trim()) return showToast("Vendor Name required", "error");
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("vendorName",    form.vendorName);
      fd.append("firmName",      form.firmName);
      fd.append("email",         form.email);
      fd.append("contactNumber", form.contactNumber ? form.dialCode + form.contactNumber : "");
      fd.append("state",         form.state);
      fd.append("city",          form.city);
      fd.append("address",       form.address);
      fd.append("gstNo",         form.gstNo);
      fd.append("category",      form.category);
      fd.append("dateOfVisit",   form.dateOfVisit);
      fd.append("notes",         form.notes);
      fd.append("status",        form.status);
      if (form.logo instanceof File) fd.append("logo", form.logo);
      if (form.vendorCard instanceof File) fd.append("attachment", form.vendorCard);
      if (form.otherAttachment instanceof File) fd.append("otherAttachment", form.otherAttachment);

      const url    = editId ? `${API}/api/procurement/vendor-pool/${editId}` : `${API}/api/procurement/vendor-pool`;
      const method = editId ? "PUT" : "POST";
      const res     = await fetch(url, { method, body: fd });
      if (!res.ok) throw new Error("Save failed");
      const resData = await res.json();
      logAudit("vendor_pool", editId || resData.id || "", form.vendorName, editId ? "updated" : "created");
      showToast(editId ? "Entry updated" : "Added to Vendor Pool");
      setShowModal(false);
      fetchPools();
    } catch { showToast("Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this entry from Vendor Pool?")) return;
    try {
      const name = pools.find(p => p.id === id)?.vendor_name || "";
      await fetch(`${API}/api/procurement/vendor-pool/${id}`, { method: "DELETE" });
      logAudit("vendor_pool", id, name, "deleted");
      showToast("Deleted");
      setPools(prev => prev.filter(p => p.id !== id));
    } catch { showToast("Failed to delete", "error"); }
  };

  const handlePromote = async (p) => {
    if (!confirm(`Promote "${p.vendor_name}" to Vendor List? A new vendor entry will be created.`)) return;
    try {
      const user = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const res  = await fetch(`${API}/api/procurement/vendor-pool/${p.id}/promote`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ promotedById: user.id, promotedByName: user.name }),
      });
      if (!res.ok) throw new Error("Promote failed");
      const data = await res.json();
      showToast(`Promoted! Vendor code: ${data.vendorCode}`);
      fetchPools();
      if (onPromoted) onPromoted();
    } catch { showToast("Failed to promote", "error"); }
  };

  const filterOptions = useMemo(() => {
    const catSet = new Set(categories);
    pools.forEach(p => {
      const c = (p.category || "").trim();
      if (c) catSet.add(c);
    });
    if (pools.some(p => !(p.category || "").trim())) catSet.add("(No category)");
    return {
      statuses: [...POOL_STATUS_OPTIONS],
      categories: [...catSet].sort((a, b) => a.localeCompare(b)),
    };
  }, [pools, categories]);

  const filtered = useMemo(() => pools.filter(p => {
    if (statusFilter.length && !statusFilter.includes(p.status || "Pool")) return false;
    if (categoryFilter.length) {
      const c = (p.category || "").trim() || "(No category)";
      if (!categoryFilter.includes(c)) return false;
    }
    if (!search) return true;
    const t = search.toLowerCase();
    return (
      (p.vendor_name    || "").toLowerCase().includes(t) ||
      (p.firm_name      || "").toLowerCase().includes(t) ||
      (p.email          || "").toLowerCase().includes(t) ||
      (p.gst_no         || "").toLowerCase().includes(t) ||
      (p.city           || "").toLowerCase().includes(t)
    );
  }), [pools, search, statusFilter, categoryFilter]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [search, statusFilter, categoryFilter]);
  useEffect(() => { setPage(p => Math.min(Math.max(1, p), totalPages)); }, [totalPages]);

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 1500);
    }).catch(() => showToast("Copy failed", "error"));
  };

  const exportPoolExcel = useCallback(() => {
    const rows = filtered.map(p => Object.fromEntries(POOL_EXPORT_COLS.map(([h, k]) => {
      let val = p[k] ?? "";
      if (k === "date_of_visit") val = fmtDate(p.date_of_visit);
      return [h, val];
    })));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendor Pool");
    XLSX.writeFile(wb, "vendor_pool.xlsx");
  }, [filtered]);

  const exportPoolPDF = useCallback(() => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(13); doc.setFont(undefined, "bold");
    doc.text("Vendor Pool", 14, 14);
    doc.setFontSize(8); doc.setFont(undefined, "normal");
    doc.text(`Exported: ${new Date().toLocaleDateString("en-IN")} · ${filtered.length} entries`, 14, 20);
    autoTable(doc, {
      startY: 25,
      head: [POOL_EXPORT_COLS.map(([h]) => h)],
      body: filtered.map(p => POOL_EXPORT_COLS.map(([, k]) => {
        if (k === "date_of_visit") return fmtDate(p.date_of_visit);
        return p[k] ?? "";
      })),
      styles: { fontSize: 6.5, cellPadding: 2 },
      headStyles: { fillColor: [30, 27, 75], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 249, 255] },
    });
    doc.save("vendor_pool.pdf");
  }, [filtered]);

  const downloadPoolBulkTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{
      "Vendor Name": "Rajesh Kumar",
      "Firm Name": "Sample Contractors",
      "Email": "rajesh@example.com",
      "Contact Number": "9876543210",
      "State": "Maharashtra",
      "City": "Mumbai",
      "Address": "Plot 12, MIDC Area",
      "GST No": "27AABCU9603R1ZV",
      "Category": "",
      "Date of Visit": todayStr(),
      "Status": "Pool",
      "Notes": "Met at site office",
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pool");
    XLSX.writeFile(wb, "vendor_pool_bulk_template.xlsx");
  };

  const handlePoolBulkFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target.result, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      const valid = data.filter(r => (r["Vendor Name"] || "").toString().trim());
      setBulkRows(valid);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handlePoolBulkSave = async () => {
    if (!bulkRows.length) return showToast("No valid rows to upload", "error");
    setBulkSaving(true);
    let ok = 0, fail = 0;
    try {
      for (const r of bulkRows) {
        const fd = new FormData();
        fd.append("vendorName",    String(r["Vendor Name"] || "").trim());
        fd.append("firmName",      String(r["Firm Name"] || "").trim());
        fd.append("email",         String(r["Email"] || "").trim());
        fd.append("contactNumber", String(r["Contact Number"] || "").trim());
        fd.append("state",         String(r["State"] || "").trim());
        fd.append("city",          String(r["City"] || "").trim());
        fd.append("address",       String(r["Address"] || "").trim());
        fd.append("gstNo",         String(r["GST No"] || "").trim());
        fd.append("category",      String(r["Category"] || "").trim());
        fd.append("dateOfVisit",   String(r["Date of Visit"] || todayStr()).trim());
        fd.append("notes",         String(r["Notes"] || "").trim());
        const st = String(r["Status"] || "Pool").trim();
        fd.append("status",        POOL_STATUS_OPTIONS.includes(st) ? st : "Pool");
        try {
          const res = await fetch(`${API}/api/procurement/vendor-pool`, { method: "POST", body: fd });
          if (res.ok) ok++;
          else fail++;
        } catch { fail++; }
      }
      showToast(`${ok} added${fail ? `, ${fail} failed` : ""}`, fail ? "error" : "success");
      setShowBulk(false); setBulkRows([]); setBulkFile("");
      fetchPools();
    } catch {
      showToast("Bulk upload failed", "error");
    }
    setBulkSaving(false);
  };

  const openTrashFromParent = useCallback(() => {
    fetchTrash();
    setShowTrash(true);
  }, []);

  useImperativeHandle(ref, () => ({
    openAdd,
    exportExcel: exportPoolExcel,
    exportPDF: exportPoolPDF,
    openBulkUpload: () => setShowBulk(true),
    openTrash: openTrashFromParent,
  }), [openAdd, exportPoolExcel, exportPoolPDF, openTrashFromParent]);

  return (
    <div>
      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl text-sm font-medium shadow-lg
          ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      {/* Search + Filters (aligned with Vendor List tab) */}
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name, firm, email, GSTIN…"
              className="w-full pl-9 pr-4 py-2 rounded-md border border-slate-200 text-sm outline-none focus:border-indigo-400 bg-white text-slate-700" />
          </div>
          <span
            className="inline-flex h-9 shrink-0 items-center self-start rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold tabular-nums text-slate-700 shadow-sm sm:self-center"
            title="Pool entries"
          >
            {pools.length} {pools.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PoolMultiFilter label="Status" options={filterOptions.statuses} selected={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }} />
          <PoolMultiFilter label="Category" options={filterOptions.categories} selected={categoryFilter} onChange={v => { setCategoryFilter(v); setPage(1); }} />
          {(statusFilter.length || categoryFilter.length) ? (
            <button type="button" onClick={() => { setStatusFilter([]); setCategoryFilter([]); setPage(1); }}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50">
              <X size={12} /> Clear
            </button>
          ) : null}
        </div>
      </div>

      {showBulk && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700">Bulk Upload — Vendor Pool</h3>
            <button type="button" onClick={() => { setShowBulk(false); setBulkRows([]); setBulkFile(""); }}
              className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <span className="text-xs font-black text-indigo-600">1</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700">Download Template</p>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">One row per pool entry (no files in bulk)</p>
                <button type="button" onClick={downloadPoolBulkTemplate}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all">
                  <FileSpreadsheet size={13} className="text-green-600" /> Download Template
                </button>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <span className="text-xs font-black text-indigo-600">2</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700">Upload Filled File</p>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">Choose your filled .xlsx file</p>
                <button type="button" onClick={() => bulkRef.current.click()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all truncate max-w-full">
                  <Upload size={13} /> {bulkFile || "Choose .xlsx file"}
                </button>
                <input ref={bulkRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handlePoolBulkFile} />
              </div>
            </div>
          </div>
          {bulkRows.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-600 mb-2">{bulkRows.length} rows ready</p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50">
                {bulkRows.slice(0, 8).map((r, i) => (
                  <div key={i} className="px-3 py-2 text-xs text-slate-600 truncate">{r["Vendor Name"]}</div>
                ))}
                {bulkRows.length > 8 && <div className="px-3 py-2 text-xs text-slate-400">+{bulkRows.length - 8} more…</div>}
              </div>
              <button type="button" onClick={handlePoolBulkSave} disabled={bulkSaving}
                className="mt-3 flex items-center gap-2 px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition-all">
                <Upload size={14} />
                {bulkSaving ? "Uploading…" : `Upload ${bulkRows.length} entries`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto thin-scroll">
          <style>{`
            .thin-scroll { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
            .thin-scroll::-webkit-scrollbar { height: 3px; width: 3px; }
            .thin-scroll::-webkit-scrollbar-track { background: transparent; }
            .thin-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
            .thin-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
          `}</style>
          <table className="w-full text-sm border-collapse border border-slate-200">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 divide-x divide-slate-200">
                {["Pool Code","Date of Visit","Vendor Name","Firm Name","Email","Contact","State / City","GST No","Category","Status","Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-slate-400 text-sm">Loading…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-slate-400 text-sm">
                    <div className="mx-auto max-w-lg">
                    {pools.length === 0 ? (
                      <>No pool entries yet. Use <span className="font-semibold text-slate-600">Add</span> or <span className="font-semibold text-slate-600">Bulk Upload</span> (under More) to create entries.</>
                    ) : (
                      <>No entries match your search or filters. Try adjusting filters or click <span className="font-semibold text-slate-600">Clear</span>.</>
                    )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map(p => {
                  const sm = STATUS_META[p.status] || STATUS_META.Pool;
                  const gstKey = `${p.id}:gst`;
                  const isCopied = copiedKey === gstKey;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors divide-x divide-slate-200 group">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">{p.pool_code || "—"}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{fmtDate(p.date_of_visit)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {p.logo_url && <img src={p.logo_url} alt="" className="h-6 w-6 rounded-md object-cover border border-slate-100" />}
                          {p.vendor_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.firm_name || "—"}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.email || "—"}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.contact_number || "—"}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {p.gst_no ? (
                          <button type="button" onClick={() => copyToClipboard(p.gst_no, gstKey)} title={isCopied ? "Copied!" : "Copy"}
                            className={`group inline-flex items-center gap-1.5 font-mono text-xs px-1.5 py-1 -mx-1.5 -my-1 rounded hover:bg-slate-100 transition-colors ${isCopied ? "text-emerald-600" : "text-slate-700"}`}>
                            <span>{p.gst_no}</span>
                            {isCopied ? <Check size={12} className="shrink-0" /> : <Copy size={11} className="shrink-0 text-slate-300 group-hover:text-slate-500" />}
                          </button>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.category || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${sm.bg} ${sm.text} ${sm.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => setViewEntry(p)} title="View details"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                            <Eye size={13} />
                          </button>
                          {p.status !== "Promoted" && <>
                            <button type="button" onClick={() => openEdit(p)} title="Edit"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                              <Pencil size={13} />
                            </button>
                            <button type="button" onClick={() => handlePromote(p)} title="Promote to Vendor"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                              <ArrowUpRight size={13} />
                            </button>
                          </>}
                          <button type="button" onClick={() => setLogTarget({ entityType: "vendor_pool", entityId: p.id, entityName: p.vendor_name })} title="Activity Log"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all">
                            <History size={13} />
                          </button>
                          <button type="button" onClick={() => handleDelete(p.id)} title="Delete"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-400">{filtered.length} entr{filtered.length === 1 ? "y" : "ies"} · Page {page} of {totalPages}</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let n;
                  if (totalPages <= 5) n = i + 1;
                  else if (page <= 3) n = i + 1;
                  else if (page >= totalPages - 2) n = totalPages - 4 + i;
                  else n = page - 2 + i;
                  return (
                    <button type="button" key={n} onClick={() => setPage(n)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                        ${page === n ? "bg-slate-900 text-white border-slate-900" : "text-slate-600 border-slate-200 hover:bg-white"}`}>
                      {n}
                    </button>
                  );
                })}
                <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">{editId ? "Edit Pool Entry" : "Add to Vendor Pool"}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">

              <div>
                <label className={lbl}>Firm Name</label>
                <input className={inp} value={form.firmName} onChange={e => setForm(f => ({ ...f, firmName: e.target.value }))} placeholder="Company / firm name" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div>
                  <label className={lbl}>Vendor Name *</label>
                  <input className={inp} value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} placeholder="Contact person name" />
                </div>
                <div>
                  <label className={lbl}>Contact Number</label>
                  <div className="flex items-center border border-slate-200 rounded-md overflow-hidden focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-100">
                    <div className="relative shrink-0 border-r border-slate-200 bg-slate-50">
                      <select
                        value={form.dialCode}
                        onChange={e => setForm(f => ({ ...f, dialCode: e.target.value }))}
                        className="appearance-none bg-transparent pl-2 pr-6 py-2.5 text-sm text-slate-700 outline-none cursor-pointer"
                      >
                        {DIAL_CODES.map(({ code, label }) => (
                          <option key={code} value={code}>{label}</option>
                        ))}
                      </select>
                      <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <input
                      className="flex-1 px-3 py-2.5 text-sm text-slate-700 outline-none bg-white placeholder-slate-400"
                      value={form.contactNumber}
                      onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value.replace(/\D/g, "") }))}
                      placeholder="Mobile / phone"
                      inputMode="numeric"
                      maxLength={15}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className={lbl}>Email</label>
                <input className={inp} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SearchableLocationSelect
                  label="State"
                  value={form.state}
                  onChange={(v) => setForm(f => ({ ...f, state: v, city: "" }))}
                  options={stateOptions}
                  placeholder="Select state"
                />
                <div>
                  <label className={lbl}>City</label>
                  <input
                    className={inp}
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Enter city name"
                  />
                </div>
              </div>

              <div>
                <label className={lbl}>Address</label>
                <textarea className={inpArea} rows={4} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Full address (multi-line)" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>GST No</label>
                  <input className={inp} value={form.gstNo} onChange={e => setForm(f => ({ ...f, gstNo: e.target.value.toUpperCase() }))} placeholder="27XXXXX…" />
                </div>
                <div>
                  <label className={lbl}>Category</label>
                  <select className={inp} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Date of Visit</label>
                  <input className={inp} type="date" value={form.dateOfVisit} onChange={e => setForm(f => ({ ...f, dateOfVisit: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl}>Status</label>
                  <select className={inp} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="Pool">Pool</option>
                    <option value="Shortlisted">Shortlisted</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/80 p-4">
                <p className={`${lbl} mb-3`}>Attachments</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Logo</p>
                    <div onClick={() => logoRef.current.click()}
                      className={`${dropZone} ${form.logo || form.logoPreview ? "border-violet-300 bg-violet-50/50" : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/30"}`}>
                      <div className="flex items-center gap-2">
                        {form.logoPreview
                          ? <img src={form.logoPreview} alt="" className="h-9 w-9 rounded-md object-cover border border-slate-200 shrink-0" />
                          : <Upload size={14} className="text-slate-400 shrink-0" />}
                        <span className={`text-xs truncate ${form.logo || form.logoPreview ? "text-violet-700 font-medium" : "text-slate-500"}`}>
                          {form.logo ? form.logo.name : (form.logoPreview ? "Logo linked" : "JPG / PNG")}
                        </span>
                        {(form.logo || form.logoPreview) && (
                          <button type="button" onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, logo: null, logoPreview: "", logoUrl: "" })); }}
                            className="ml-auto text-slate-400 hover:text-red-500 shrink-0"><X size={14} /></button>
                        )}
                      </div>
                    </div>
                    <input ref={logoRef} type="file" accept=".jpg,.jpeg,.png" className="hidden"
                      onChange={e => {
                        const f = e.target.files[0];
                        if (f) setForm(prev => ({ ...prev, logo: f, logoPreview: URL.createObjectURL(f) }));
                        e.target.value = "";
                      }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Vendor card</p>
                    <div onClick={() => vendorCardRef.current.click()}
                      className={`${dropZone} ${form.vendorCard || form.vendorCardUrl ? "border-violet-300 bg-violet-50/50" : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/30"}`}>
                      <div className="flex items-center gap-2">
                        <FileText size={14} className={form.vendorCard || form.vendorCardUrl ? "text-violet-600 shrink-0" : "text-slate-400 shrink-0"} />
                        <span className={`text-xs truncate ${form.vendorCard || form.vendorCardUrl ? "text-violet-700 font-medium" : "text-slate-500"}`}>
                          {form.vendorCard ? form.vendorCard.name : (form.vendorCardUrl ? "Card on file" : "PDF / image")}
                        </span>
                        {(form.vendorCard || form.vendorCardUrl) && (
                          <button type="button" onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, vendorCard: null, vendorCardUrl: "" })); }}
                            className="ml-auto text-slate-400 hover:text-red-500 shrink-0"><X size={14} /></button>
                        )}
                      </div>
                    </div>
                    <input ref={vendorCardRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                      onChange={e => {
                        const f = e.target.files[0];
                        if (f) setForm(prev => ({ ...prev, vendorCard: f }));
                        e.target.value = "";
                      }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Other attachment</p>
                    <div onClick={() => otherAttachRef.current.click()}
                      className={`${dropZone} ${form.otherAttachment || form.otherAttachmentUrl ? "border-violet-300 bg-violet-50/50" : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/30"}`}>
                      <div className="flex items-center gap-2">
                        <FileText size={14} className={form.otherAttachment || form.otherAttachmentUrl ? "text-violet-600 shrink-0" : "text-slate-400 shrink-0"} />
                        <span className={`text-xs truncate ${form.otherAttachment || form.otherAttachmentUrl ? "text-violet-700 font-medium" : "text-slate-500"}`}>
                          {form.otherAttachment ? form.otherAttachment.name : (form.otherAttachmentUrl ? "File on file" : "PDF / image")}
                        </span>
                        {(form.otherAttachment || form.otherAttachmentUrl) && (
                          <button type="button" onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, otherAttachment: null, otherAttachmentUrl: "" })); }}
                            className="ml-auto text-slate-400 hover:text-red-500 shrink-0"><X size={14} /></button>
                        )}
                      </div>
                    </div>
                    <input ref={otherAttachRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                      onChange={e => {
                        const f = e.target.files[0];
                        if (f) setForm(prev => ({ ...prev, otherAttachment: f }));
                        e.target.value = "";
                      }} />
                  </div>
                </div>
              </div>

              <div>
                <label className={lbl}>Notes</label>
                <textarea className={inpArea} rows={3} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any notes about this vendor visit…" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-md text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                {saving ? "Saving…" : editId ? "Update" : "Add to Pool"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">Pool Entry Details</h2>
              <button onClick={() => setViewEntry(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {viewEntry.logo_url && (
                <div className="flex justify-center mb-2">
                  <img src={viewEntry.logo_url} alt="logo" className="h-16 w-16 rounded-xl object-cover border border-slate-100 shadow-sm" />
                </div>
              )}
              {[
                ["Vendor Name",   viewEntry.vendor_name],
                ["Firm Name",     viewEntry.firm_name],
                ["Email",         viewEntry.email],
                ["Contact",       viewEntry.contact_number],
                ["State",         viewEntry.state],
                ["City",          viewEntry.city],
                ["Address",       viewEntry.address],
                ["GST No",        viewEntry.gst_no],
                ["Category",      viewEntry.category],
                ["Date of Visit", fmtDate(viewEntry.date_of_visit)],
                ["Status",        viewEntry.status],
                ["Notes",         viewEntry.notes],
              ].filter(([, v]) => !!v).map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider w-28 shrink-0 pt-0.5">{k}</span>
                  <span className="text-sm text-slate-700 flex-1 break-words">{v}</span>
                </div>
              ))}
              {viewEntry.attachment_url && (
                <div className="flex gap-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider w-28 shrink-0 pt-0.5">Vendor card</span>
                  <a href={viewEntry.attachment_url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-violet-600 hover:underline flex items-center gap-1">
                    <FileText size={13} /> View document
                  </a>
                </div>
              )}
              {viewEntry.other_attachment_url && (
                <div className="flex gap-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider w-28 shrink-0 pt-0.5">Other</span>
                  <a href={viewEntry.other_attachment_url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-violet-600 hover:underline flex items-center gap-1">
                    <FileText size={13} /> View attachment
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trash Modal */}
      {showTrash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">Vendor Pool — Trash</h2>
                <p className="text-xs text-slate-400 mt-0.5">Deleted entries can be restored or permanently removed</p>
              </div>
              <button onClick={() => setShowTrash(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {trashLoading ? (
                <p className="text-center text-slate-400 text-sm py-10">Loading…</p>
              ) : trashPools.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-10">Trash is empty</p>
              ) : (
                <div className="space-y-2">
                  {trashPools.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-slate-100 bg-slate-50">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{p.vendor_name}</p>
                        <p className="text-xs text-slate-400">{p.firm_name || ""}{p.pool_code ? ` · ${p.pool_code}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleRestore(p.id)} title="Restore"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-colors">
                          <RotateCcw size={12} /> Restore
                        </button>
                        <button onClick={() => handlePermanentDelete(p.id, p.vendor_name)} title="Permanently Delete"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {logTarget && (
        <LogPanel entityType={logTarget.entityType} entityId={logTarget.entityId} entityName={logTarget.entityName} onClose={() => setLogTarget(null)} />
      )}
    </div>
  );
});

function PoolMultiFilter({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const toggle = (value) => {
    if (selected.includes(value)) onChange(selected.filter(v => v !== value));
    else onChange([...selected, value]);
  };

  const filtered = query ? options.filter(o => String(o).toLowerCase().includes(query.toLowerCase())) : options;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-bold shadow-sm transition ${selected.length ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-black text-white">{selected.length}</span>
        )}
        <ChevronDown size={12} className={`transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-md border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 p-2">
            <div className="flex items-center gap-2 rounded border border-slate-200 px-2">
              <Search size={12} className="text-slate-400" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-slate-400" />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-slate-400">No options</p>
            ) : (
              filtered.map(opt => {
                const checked = selected.includes(opt);
                return (
                  <button type="button" key={String(opt)} onClick={() => toggle(opt)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">
                    <span className={`grid h-4 w-4 place-items-center rounded border ${checked ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"}`}>
                      {checked && <span className="text-[10px] font-black leading-none">✓</span>}
                    </span>
                    <span className="truncate">{opt}</span>
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
              <span className="text-[11px] font-bold text-slate-500">{selected.length} selected</span>
              <button type="button" onClick={() => onChange([])} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default VendorPool;
