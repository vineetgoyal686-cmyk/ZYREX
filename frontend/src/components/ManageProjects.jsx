import React, { useState, useEffect, useRef } from "react";
import {
  Plus, Search, Pencil, Trash2, X, Eye, Image,
  FolderOpen, ChevronLeft, ChevronRight, Download,
  FileSpreadsheet, FileText, Upload, MapPin, Hash,
  Building, CheckCircle2, XCircle, ChevronDown,
  LayoutGrid, List, History,
} from "lucide-react";
import LogPanel from "./LogPanel";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API    = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const ACCEPT = "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp,image/svg+xml";

const emptyForm = {
  projectName: "", projectCode: "", city: "", state: "",
  pincode: "", address: "", district: "",
  logo: null, logoPreview: "",
  contacts: [], // [{ name, phone, email, isPrimary }]
};

/* ── outside component to avoid re-mount cursor bug ── */
const Field = ({ label, value, onChange, placeholder, span2, textarea }) => (
  <div className={span2 ? "col-span-2" : ""}>
    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-widest">{label}</label>
    {textarea ? (
      <textarea value={value} onChange={onChange} rows={2} placeholder={placeholder}
        className="w-full border border-slate-200 rounded-sm px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-slate-700 resize-none bg-slate-50" />
    ) : (
      <input value={value} onChange={onChange} placeholder={placeholder}
        className="w-full border border-slate-200 rounded-sm px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-slate-700 bg-slate-50" />
    )}
  </div>
);

const LogoUpload = ({ form, setForm }) => {
  const ref = useRef();
  return (
    <div className="col-span-2">
      <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-widest">Project Logo / Image</label>
      <div
        onClick={() => ref.current.click()}
        className="w-full h-32 rounded-sm border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all overflow-hidden bg-slate-50 relative group"
      >
        {form.logoPreview ? (
          <>
            <img src={form.logoPreview} alt="logo" className="max-h-full max-w-full object-contain p-2" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center rounded-sm">
              <span className="text-white text-xs font-semibold">Change Image</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-300 pointer-events-none">
            <Image size={26} />
            <span className="text-xs font-medium">Click to upload logo</span>
          </div>
        )}
      </div>
      {form.logoPreview && (
        <button type="button" onClick={() => setForm(f => ({ ...f, logo: null, logoPreview: "" }))}
          className="mt-2 text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
          <X size={11} /> Remove
        </button>
      )}
      <input ref={ref} type="file" accept={ACCEPT} className="hidden"
        onChange={e => {
          const file = e.target.files[0];
          if (file) setForm(f => ({ ...f, logo: file, logoPreview: URL.createObjectURL(file) }));
          e.target.value = "";
        }}
      />
    </div>
  );
};

/* ── Gradient avatar for projects without logo ── */
const GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-red-500",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-blue-500",
];
const getGradient = (name) => GRADIENTS[(name?.charCodeAt(0) || 0) % GRADIENTS.length];

export default function ManageProjects({ isGlobalAdmin, permissions = {}, onProjectsUpdate }) {
  const canAdd    = isGlobalAdmin || !!permissions.add;
  const canEdit   = isGlobalAdmin || !!permissions.edit;
  const canDelete = isGlobalAdmin || !!permissions.delete;
  const [projects, setProjects]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [showView, setShowView]       = useState(false);
  const [showBulk, setShowBulk]       = useState(false);
  const [viewData, setViewData]       = useState(null);
  const [form, setForm]               = useState(emptyForm);
  const [editId, setEditId]           = useState(null);
  const [search, setSearch]           = useState("");
  const [saving, setSaving]           = useState(false);
  const [bulkRows, setBulkRows]       = useState([]);
  const [bulkFile, setBulkFile]       = useState("");
  const [bulkSaving, setBulkSaving]   = useState(false);
  const [toast, setToast]             = useState(null);
  const [page, setPage]               = useState(1);
  const [showExport, setShowExport]   = useState(false);
  const [viewMode, setViewMode]       = useState("card");
  const [logoLightbox, setLogoLightbox] = useState(null);
  const [logTarget, setLogTarget] = useState(null);
  const [filterCodes, setFilterCodes]   = useState([]);
  const [filterStates, setFilterStates] = useState([]);
  const [showCodeFilter, setShowCodeFilter]   = useState(false);
  const [showStateFilter, setShowStateFilter] = useState(false);
  const [codeSearch, setCodeSearch]   = useState("");
  const [stateSearch, setStateSearch] = useState("");
  const perPage    = 9;
  const exportRef  = useRef();
  const bulkInputRef   = useRef();
  const codeFilterRef  = useRef();
  const stateFilterRef = useRef();

  useEffect(() => {
    const h = (e) => {
      if (codeFilterRef.current && !codeFilterRef.current.contains(e.target)) setShowCodeFilter(false);
      if (stateFilterRef.current && !stateFilterRef.current.contains(e.target)) setShowStateFilter(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => { fetchProjects(); }, []);

  useEffect(() => {
    const h = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (!logoLightbox) return;
    const onKey = (e) => { if (e.key === "Escape") setLogoLightbox(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [logoLightbox]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/projects`);
      const data = await res.json();
      setProjects(data.projects || []);
    } catch { setProjects([]); }
    setLoading(false);
  };

  const notify = async () => {
    const res  = await fetch(`${API}/api/projects`);
    const data = await res.json();
    const all  = data.projects || [];
    setProjects(all);
    onProjectsUpdate?.(all.filter(p => p.isActive));
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openAdd  = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };
  const openEdit = (p) => { setForm({ ...emptyForm, ...p, logo: null, logoPreview: p.logoUrl || "", contacts: p.contacts || [] }); setEditId(p.id); setShowModal(true); };
  const openView = (p) => { setViewData(p); setShowView(true); };

  const handleSave = async () => {
    if (!form.projectName.trim()) return showToast("Project Name is required", "error");
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === "logoPreview") return;
        if (k === "contacts") { fd.append("contacts", JSON.stringify(v)); return; }
        if (v instanceof File) fd.append(k, v);
        else if (v !== null && v !== undefined) fd.append(k, String(v));
      });
      const url    = editId ? `${API}/api/projects/${editId}` : `${API}/api/projects`;
      const method = editId ? "PUT" : "POST";
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      fd.append("createdById", u.id || "");
      fd.append("createdByName", u.name || "");
      const res  = await fetch(url, { method, body: fd });
      const data = await res.json();
      if (!res.ok || data.error) { showToast(data.error || "Failed to save", "error"); setSaving(false); return; }
      showToast(editId ? "Project updated!" : "Project added!");
      setShowModal(false);
      await notify();
    } catch { showToast("Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (p) => {
    if (!confirm(`Delete project "${p.projectName}"?`)) return;
    try {
      await fetch(`${API}/api/projects/${p.id}`, { method: "DELETE" });
      showToast("Project deleted");
      await notify();
    } catch { showToast("Failed to delete", "error"); }
  };

  const handleToggle = async (p) => {
    try {
      const res = await fetch(`${API}/api/projects/${p.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return showToast(data.error || "Failed", "error");
      showToast(`Project ${!p.isActive ? "activated" : "deactivated"}`);
      await notify();
    } catch { showToast("Failed to update status", "error"); }
  };

  /* ── Export ── */
  const exportExcel = () => {
    const rows = filtered.map((p, i) => ({
      "S.No": i + 1, "Project Name": p.projectName, "Code": p.projectCode,
      "City": p.city, "State": p.state, "Pincode": p.pincode,
      "Address": p.address, "Status": p.isActive ? "Active" : "Inactive",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Projects");
    XLSX.writeFile(wb, "project_list.xlsx");
    setShowExport(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw  = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Project List", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${filtered.length}   |   Exported: ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4); doc.line(14, 26, pw - 14, 26);
    autoTable(doc, {
      startY: 30,
      head: [["S.No", "Project Name", "Code", "City", "State", "Pincode", "Address", "Status"]],
      body: filtered.map((p, i) => [i + 1, p.projectName, p.projectCode, p.city, p.state, p.pincode, p.address, p.isActive ? "Active" : "Inactive"]),
      tableWidth: pw - 28,
      styles: { fontSize: 7.5, cellPadding: 3, textColor: [51, 65, 85], lineColor: [203, 213, 225], lineWidth: 0.3 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 10, halign: "center" }, 7: { cellWidth: 18 } },
    });
    doc.save("project_list.pdf");
    setShowExport(false);
  };

  /* ── Bulk upload ── */
  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { "Project Name": "Sample Project", "Project Code": "PRJ-001", "City": "Delhi", "State": "Delhi", "Pincode": "110001", "Address": "Sample Street" },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Projects");
    XLSX.writeFile(wb, "project_upload_template.xlsx");
  };

  const handleBulkFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target.result, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      const rows = data.map(r => ({
        projectName: r["Project Name"] || r["project_name"] || "",
        projectCode: r["Project Code"] || r["project_code"] || "",
        city:        r["City"]         || r["city"]         || "",
        state:       r["State"]        || r["state"]        || "",
        pincode:     String(r["Pincode"] || r["pincode"] || ""),
        address:     r["Address"]      || r["address"]      || "",
      })).filter(r => r.projectName);
      setBulkRows(rows);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleBulkSave = async () => {
    if (!bulkRows.length) return showToast("No valid rows to upload", "error");
    setBulkSaving(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const rowsWithAudit = bulkRows.map(r => ({ ...r, createdById: u.id || "", createdByName: u.name || "" }));
      const res  = await fetch(`${API}/api/projects/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsWithAudit }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { showToast(data.error || "Upload failed", "error"); setBulkSaving(false); return; }
      const msg = data.skipped > 0
        ? `${data.count} uploaded, ${data.skipped} skipped (duplicates)`
        : `${data.count} projects uploaded!`;
      showToast(msg, data.skipped > 0 && data.count === 0 ? "error" : "success");
      setShowBulk(false); setBulkRows([]); setBulkFile("");
      await notify();
    } catch { showToast("Upload failed", "error"); }
    setBulkSaving(false);
  };

  const allCodes  = [...new Set(projects.map(p => p.projectCode).filter(Boolean))].sort();
  const allStates = [...new Set(projects.map(p => p.state).filter(Boolean))].sort();

  const filtered = projects.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      p.projectName?.toLowerCase().includes(q) ||
      p.projectCode?.toLowerCase().includes(q) ||
      p.city?.toLowerCase().includes(q);
    const matchCode  = filterCodes.length  === 0 || filterCodes.includes(p.projectCode);
    const matchState = filterStates.length === 0 || filterStates.includes(p.state);
    return matchSearch && matchCode && matchState;
  });
  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);
  const activeCount   = projects.filter(p => p.isActive).length;
  const inactiveCount = projects.length - activeCount;

  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-60 flex items-center gap-2.5 px-4 py-3 rounded-sm text-sm font-semibold shadow-xl
          ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {toast.type === "error" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
          {toast.msg}
        </div>
      )}

      {/* ── TOP HEADER ── */}
      <div className="bg-white rounded-md border border-slate-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-md bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <FolderOpen size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 leading-tight">Manage Projects</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {projects.length} total &nbsp;·&nbsp;
                <span className="text-green-600 font-semibold">{activeCount} active</span>
                {inactiveCount > 0 && <> &nbsp;·&nbsp; <span className="text-red-500 font-semibold">{inactiveCount} inactive</span></>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Export */}
            <div className="relative" ref={exportRef}>
              <button onClick={() => setShowExport(v => !v)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-sm border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
                <Download size={14} /> Export <ChevronDown size={12} className={`transition-transform ${showExport ? "rotate-180" : ""}`} />
              </button>
              {showExport && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-sm shadow-xl border border-slate-100 z-30 overflow-hidden">
                  <button onClick={exportExcel}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-emerald-700 hover:bg-emerald-50 transition-colors text-left">
                    <FileSpreadsheet size={14} /> Excel (.xlsx)
                  </button>
                  <div className="border-t border-slate-100" />
                  <button onClick={exportPDF}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors text-left">
                    <FileText size={14} /> PDF
                  </button>
                </div>
              )}
            </div>

            {/* Bulk Upload */}
            {canAdd && (
              <button onClick={() => { setShowBulk(true); setBulkRows([]); setBulkFile(""); }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-sm border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
                <Upload size={14} /> Bulk Upload
              </button>
            )}

            {/* Add */}
            {canAdd && (
              <button onClick={openAdd}
                className="flex items-center gap-1.5 px-4 py-2 rounded-sm bg-linear-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:shadow-md hover:shadow-blue-200 transition-all">
                <Plus size={15} /> Add Project
              </button>
            )}
          </div>
        </div>

        {/* Search + Filters row */}
        <div className="flex items-center justify-between gap-2 mt-4">

          {/* Search — left */}
          <div className="relative w-80">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, code, city…"
              className="w-full pl-9 pr-3 py-2 rounded-sm border border-slate-200 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 bg-slate-50 text-slate-700" />
          </div>

          {/* Filters — right */}
          <div className="flex items-center gap-2">

            {/* Card / Table toggle */}
            <div className="flex items-center rounded-sm border border-slate-200 overflow-hidden">
              <button onClick={() => setViewMode("card")} title="Card View"
                className={`px-2.5 py-2 transition-colors ${viewMode === "card" ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-50"}`}>
                <LayoutGrid size={14} />
              </button>
              <button onClick={() => setViewMode("table")} title="Table View"
                className={`px-2.5 py-2 transition-colors ${viewMode === "table" ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-50"}`}>
                <List size={14} />
              </button>
            </div>

            {/* Clear all */}
            {(filterCodes.length > 0 || filterStates.length > 0 || search) && (
              <button onClick={() => { setFilterCodes([]); setFilterStates([]); setSearch(""); setPage(1); }}
                className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1">
                <X size={11} /> Clear all
              </button>
            )}

            {/* Code filter */}
            <div className="relative" ref={codeFilterRef}>
              <button onClick={() => { setShowCodeFilter(v => !v); setShowStateFilter(false); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-sm border text-sm font-medium transition-all
                  ${filterCodes.length ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                Code {filterCodes.length > 0 && <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{filterCodes.length}</span>}
                <ChevronDown size={12} className={`transition-transform ${showCodeFilter ? "rotate-180" : ""}`} />
              </button>
              {showCodeFilter && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-sm shadow-xl border border-slate-100 z-30">
                  <div className="p-2 border-b border-slate-100">
                    <input value={codeSearch} onChange={e => setCodeSearch(e.target.value)}
                      placeholder="Search code…"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-sm outline-none focus:border-blue-400 bg-slate-50" />
                    <p className="mt-1.5 px-0.5 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-600">{filtered.length}</span> results found
                    </p>
                  </div>
                  <div className="max-h-48 overflow-y-auto py-1">
                    {allCodes.filter(c => c.toLowerCase().includes(codeSearch.toLowerCase())).map(code => (
                      <label key={code} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={filterCodes.includes(code)}
                          onChange={() => { setFilterCodes(prev => prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code]); setPage(1); }}
                          className="accent-blue-600 w-3.5 h-3.5" />
                        <span className="text-xs font-mono font-semibold text-slate-700">{code}</span>
                      </label>
                    ))}
                    {allCodes.length === 0 && <p className="text-xs text-slate-400 px-3 py-2">No codes</p>}
                  </div>
                  {filterCodes.length > 0 && (
                    <div className="border-t border-slate-100 px-3 py-2">
                      <button onClick={() => { setFilterCodes([]); setPage(1); }} className="text-xs text-red-500 hover:text-red-700 font-semibold">Clear</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* State filter */}
            <div className="relative" ref={stateFilterRef}>
              <button onClick={() => { setShowStateFilter(v => !v); setShowCodeFilter(false); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-sm border text-sm font-medium transition-all
                  ${filterStates.length ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                State {filterStates.length > 0 && <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{filterStates.length}</span>}
                <ChevronDown size={12} className={`transition-transform ${showStateFilter ? "rotate-180" : ""}`} />
              </button>
              {showStateFilter && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-sm shadow-xl border border-slate-100 z-30">
                  <div className="p-2 border-b border-slate-100">
                    <input value={stateSearch} onChange={e => setStateSearch(e.target.value)}
                      placeholder="Search state…"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-sm outline-none focus:border-blue-400 bg-slate-50" />
                    <p className="mt-1.5 px-0.5 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-600">{filtered.length}</span> results found
                    </p>
                  </div>
                  <div className="max-h-48 overflow-y-auto py-1">
                    {allStates.filter(s => s.toLowerCase().includes(stateSearch.toLowerCase())).map(state => (
                      <label key={state} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={filterStates.includes(state)}
                          onChange={() => { setFilterStates(prev => prev.includes(state) ? prev.filter(x => x !== state) : [...prev, state]); setPage(1); }}
                          className="accent-blue-600 w-3.5 h-3.5" />
                        <span className="text-xs font-semibold text-slate-700">{state}</span>
                      </label>
                    ))}
                    {allStates.length === 0 && <p className="text-xs text-slate-400 px-3 py-2">No states</p>}
                  </div>
                  {filterStates.length > 0 && (
                    <div className="border-t border-slate-100 px-3 py-2">
                      <button onClick={() => { setFilterStates([]); setPage(1); }} className="text-xs text-red-500 hover:text-red-700 font-semibold">Clear</button>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── PROJECT LIST ── */}
      {loading ? (
        <div className="bg-white rounded-md border border-slate-100 shadow-sm p-16 text-center text-slate-400 text-sm">Loading projects…</div>
      ) : paginated.length === 0 ? (
        <div className="bg-white rounded-md border border-slate-100 shadow-sm p-16 text-center">
          <FolderOpen size={40} className="mx-auto text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium">No projects found</p>
          <button onClick={openAdd} className="mt-4 text-sm text-blue-600 font-semibold hover:underline">+ Add your first project</button>
        </div>
      ) : viewMode === "table" ? (
        /* ── TABLE VIEW ── */
        <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200 w-14">S.NO</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200">Project Name</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200 w-24">Code</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200 w-36">Location</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200">Address</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200 w-24">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest w-32">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((p, idx) => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3.5 text-slate-400 font-mono text-xs font-semibold border-r border-slate-100">
                      {String((page - 1) * perPage + idx + 1).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3.5 border-r border-slate-100">
                      <span className="font-semibold text-slate-800">{p.projectName}</span>
                    </td>
                    <td className="px-4 py-3.5 border-r border-slate-100">
                      <span className="font-mono text-xs font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{p.projectCode || "—"}</span>
                    </td>
                    <td className="px-4 py-3.5 border-r border-slate-100">
                      <p className="text-slate-700 font-medium">{p.city || "—"}</p>
                      {p.state && <p className="text-xs text-slate-400 uppercase tracking-wide mt-0.5">{p.state}</p>}
                    </td>
                    <td className="px-4 py-3.5 border-r border-slate-100 max-w-[260px]">
                      <p className="text-slate-500 text-xs leading-relaxed text-justify">{p.address || "—"}</p>
                      {p.pincode && <p className="text-xs text-slate-400 mt-0.5 font-mono">{p.pincode}</p>}
                    </td>
                    <td className="px-4 py-3.5 border-r border-slate-100">
                      <span className={`inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded border
                        ${p.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                        {p.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openView(p)} title="View"
                          className="p-1.5 rounded-sm text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Eye size={14} />
                        </button>
                        {canEdit && (
                          <button onClick={() => openEdit(p)} title="Edit"
                            className="p-1.5 rounded-sm text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(p)} title="Delete"
                            className="p-1.5 rounded-sm text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                        <button onClick={() => setLogTarget({ entityType: "project", entityId: p.id, entityName: p.projectName })}
                          title="Activity Log"
                          className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all">
                          <History size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── CARD VIEW ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginated.map((p) => (
            <div key={p.id}
              className="bg-white rounded-md border border-slate-100 shadow-sm overflow-hidden hover:shadow-md hover:border-slate-200 transition-all group">

              {/* Card top band */}
              <div className={`h-1.5 w-full ${p.isActive ? "bg-linear-to-r from-blue-500 to-indigo-500" : "bg-slate-200"}`} />

              <div className="p-4">
                {/* Logo + Name row */}
                <div className="flex items-start gap-3 mb-3">
                  {p.logoUrl ? (
                    <button
                      type="button"
                      onClick={() => setLogoLightbox({ url: p.logoUrl, name: p.projectName })}
                      className="shrink-0 rounded-sm border border-slate-100 shadow-sm overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 cursor-pointer p-0 bg-transparent hover:border-blue-300/60 hover:shadow transition-[box-shadow,border-color]"
                      title="View logo"
                    >
                      <img src={p.logoUrl} alt="" className="w-12 h-12 object-cover block" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openView(p)}
                      className={`w-12 h-12 shrink-0 rounded-sm bg-linear-to-br ${getGradient(p.projectName)} flex items-center justify-center text-white text-base font-black shadow-sm border border-transparent cursor-pointer hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 transition-[filter,box-shadow]`}
                      title="View project"
                    >
                      {(p.projectCode || p.projectName).slice(0, 2).toUpperCase()}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-800 text-sm leading-snug truncate" title={p.projectName}>{p.projectName}</h3>
                    {p.projectCode && (
                      <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                        <Hash size={9} />{p.projectCode}
                      </span>
                    )}
                  </div>
                  {/* Status pill */}
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border
                    ${p.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {p.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Info chips */}
                <div className="space-y-1.5 mb-4">
                  {(p.city || p.state || p.pincode) && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin size={11} className="text-slate-400 shrink-0" />
                      <span className="truncate">{[p.city, p.state, p.pincode].filter(Boolean).join(", ")}</span>
                    </div>
                  )}
                  {p.address && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Building size={11} className="shrink-0" />
                      <span className="truncate" title={p.address}>{p.address}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openView(p)} title="View"
                      className="p-1.5 rounded-sm text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <Eye size={14} />
                    </button>
                    {canEdit && (
                      <button onClick={() => openEdit(p)} title="Edit"
                        className="p-1.5 rounded-sm text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                        <Pencil size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => handleDelete(p)} title="Delete"
                        className="p-1.5 rounded-sm text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {/* Toggle switch */}
                  {canEdit && (
                    <button onClick={() => handleToggle(p)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
                        ${p.isActive ? "bg-blue-500" : "bg-slate-200"}`}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform
                        ${p.isActive ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PAGINATION ── */}

      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-sm border border-slate-100 px-4 py-2.5">
          <p className="text-xs text-slate-400">{filtered.length} projects · Page {page} of {totalPages}</p>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded-sm border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50 transition-colors">
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)}
                className={`w-7 h-7 rounded-sm text-xs font-semibold transition-colors
                  ${n === page ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50 border border-slate-200"}`}>
                {n}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded-sm border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── ADD / EDIT MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-800">{editId ? "Edit Project" : "Add New Project"}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{editId ? "Update project details" : "Fill in the details below"}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-sm hover:bg-slate-100 text-slate-400 transition-colors"><X size={16} /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <Field label="Project Name *" value={form.projectName} placeholder="e.g. B-47 IAS House Noida"
                onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))} span2 />
              <Field label="Project Code" value={form.projectCode} placeholder="e.g. B-47"
                onChange={e => setForm(f => ({ ...f, projectCode: e.target.value }))} />
              <Field label="City" value={form.city} placeholder="City"
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              <Field label="District" value={form.district} placeholder="District"
                onChange={e => setForm(f => ({ ...f, district: e.target.value }))} />
              <Field label="State" value={form.state} placeholder="State"
                onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
              <Field label="Pincode" value={form.pincode} placeholder="000000"
                onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} />
              <Field label="Address" value={form.address} placeholder="Street / Area / Landmark"
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))} span2 textarea />

              {/* ── Contacts ── */}
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Contacts</label>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, contacts: [...f.contacts, { name: "", phone: "", email: "", isPrimary: false }] }))}
                    className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
                    <Plus size={11} /> Add Contact
                  </button>
                </div>
                {form.contacts.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No contacts added</p>
                )}
                {form.contacts.map((c, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 mb-2 p-3 bg-slate-50 rounded-sm border border-slate-200">
                    <input value={c.name} onChange={e => setForm(f => { const cs = [...f.contacts]; cs[i] = { ...cs[i], name: e.target.value }; return { ...f, contacts: cs }; })}
                      placeholder="Name" className="border border-slate-200 rounded-sm px-2.5 py-2 text-sm outline-none focus:border-blue-400 bg-white text-slate-700" />
                    <input value={c.phone} onChange={e => { const val = e.target.value.replace(/\D/g, "").slice(0, 10); setForm(f => { const cs = [...f.contacts]; cs[i] = { ...cs[i], phone: val }; return { ...f, contacts: cs }; }); }}
                      placeholder="Phone" inputMode="numeric" maxLength={10} className="border border-slate-200 rounded-sm px-2.5 py-2 text-sm outline-none focus:border-blue-400 bg-white text-slate-700" />
                    <input value={c.email} onChange={e => setForm(f => { const cs = [...f.contacts]; cs[i] = { ...cs[i], email: e.target.value }; return { ...f, contacts: cs }; })}
                      placeholder="Email" className="border border-slate-200 rounded-sm px-2.5 py-2 text-sm outline-none focus:border-blue-400 bg-white text-slate-700" />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                        <input type="checkbox" checked={c.isPrimary} onChange={() => setForm(f => ({ ...f, contacts: f.contacts.map((c2, j) => ({ ...c2, isPrimary: j === i })) }))}
                          className="accent-blue-600" />
                        Primary
                      </label>
                      <button type="button" onClick={() => setForm(f => { const cs = f.contacts.filter((_, j) => j !== i); return { ...f, contacts: cs }; })}
                        className="text-red-400 hover:text-red-600 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <LogoUpload form={form} setForm={setForm} />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-md">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2.5 rounded-sm border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-white transition-all">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-sm bg-linear-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:shadow-md hover:shadow-blue-200 transition-all disabled:opacity-50">
                {saving ? "Saving…" : (editId ? "Update Project" : "Add Project")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW MODAL ── */}
      {showView && viewData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md shadow-2xl w-full max-w-md">
            {/* Header band */}
            <div className={`h-1.5 w-full rounded-t-md ${viewData.isActive ? "bg-linear-to-r from-blue-500 to-indigo-500" : "bg-slate-200"}`} />
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-800">Project Details</h3>
              <button onClick={() => setShowView(false)} className="p-1.5 rounded-sm hover:bg-slate-100 text-slate-400 transition-colors"><X size={16} /></button>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-5">
                {viewData.logoUrl ? (
                  <button
                    type="button"
                    onClick={() => setLogoLightbox({ url: viewData.logoUrl, name: viewData.projectName })}
                    className="shrink-0 rounded-md border border-slate-100 shadow overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 cursor-pointer p-0 bg-transparent hover:border-blue-300/60 transition-[border-color]"
                    title="View logo full size"
                  >
                    <img src={viewData.logoUrl} alt="" className="w-20 h-20 object-cover block" />
                  </button>
                ) : (
                  <div className={`w-20 h-20 rounded-md bg-linear-to-br ${getGradient(viewData.projectName)} flex items-center justify-center text-white text-2xl font-black shadow`}>
                    {(viewData.projectCode || viewData.projectName).slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h4 className="text-lg font-black text-slate-800">{viewData.projectName}</h4>
                  {viewData.projectCode && (
                    <span className="inline-flex items-center gap-1 text-xs font-mono font-bold bg-slate-100 text-slate-500 px-2.5 py-1 rounded mt-1">
                      <Hash size={10} />{viewData.projectCode}
                    </span>
                  )}
                  <div className="mt-1.5">
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded border
                      ${viewData.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {viewData.isActive ? "● Active" : "○ Inactive"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[["City", viewData.city], ["State", viewData.state], ["Pincode", viewData.pincode], ["Address", viewData.address]]
                  .filter(([, v]) => v)
                  .map(([label, val]) => (
                    <div key={label} className={`bg-slate-50 rounded-sm px-4 py-3 ${label === "Address" ? "col-span-2" : ""}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
                      <p className="text-sm font-semibold text-slate-700">{val}</p>
                    </div>
                  ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-md">
              {canEdit && (
                <button onClick={() => { setShowView(false); openEdit(viewData); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-sm border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-white transition-all">
                  <Pencil size={13} /> Edit
                </button>
              )}
              <button onClick={() => setShowView(false)}
                className="px-4 py-2.5 rounded-sm bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK UPLOAD MODAL ── */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-800">Bulk Upload Projects</h3>
                <p className="text-xs text-slate-400 mt-0.5">Upload an Excel file to add multiple projects at once</p>
              </div>
              <button onClick={() => setShowBulk(false)} className="p-1.5 rounded-sm hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Step 1 */}
              <div className="flex items-start gap-3 bg-blue-50 rounded-sm p-4 border border-blue-100">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">1</span>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Download the template</p>
                  <p className="text-xs text-slate-500 mt-0.5">Fill in project details in the Excel template</p>
                  <button onClick={downloadTemplate}
                    className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:underline">
                    <FileSpreadsheet size={13} /> Download Template
                  </button>
                </div>
              </div>
              {/* Step 2 */}
              <div className="flex items-start gap-3 bg-slate-50 rounded-sm p-4 border border-slate-200">
                <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">2</span>
                <div className="w-full">
                  <p className="text-sm font-semibold text-slate-700">Upload filled Excel file</p>
                  <button onClick={() => bulkInputRef.current.click()}
                    className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm border-2 border-dashed border-slate-300 text-slate-500 text-sm hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                    <Upload size={15} />
                    {bulkFile ? bulkFile : "Choose Excel file (.xlsx)"}
                  </button>
                  <input ref={bulkInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkFile} />
                </div>
              </div>
              {/* Preview */}
              {bulkRows.length > 0 && (
                <div className="rounded-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                    <p className="text-xs font-bold text-slate-600">{bulkRows.length} projects ready to upload</p>
                  </div>
                  <div className="max-h-36 overflow-y-auto">
                    {bulkRows.map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2 border-b border-slate-50 last:border-0">
                        <span className="text-sm font-medium text-slate-700">{r.projectName}</span>
                        <span className="text-xs text-slate-400 font-mono">{r.projectCode || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-md">
              <button onClick={() => setShowBulk(false)}
                className="px-4 py-2.5 rounded-sm border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-white transition-all">
                Cancel
              </button>
              <button onClick={handleBulkSave} disabled={bulkSaving || !bulkRows.length}
                className="flex items-center gap-2 px-5 py-2.5 rounded-sm bg-linear-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:shadow-md transition-all disabled:opacity-40">
                {bulkSaving ? "Uploading…" : `Upload ${bulkRows.length} Projects`}
              </button>
            </div>
          </div>
        </div>
      )}

      {logTarget && (
        <LogPanel entityType={logTarget.entityType} entityId={logTarget.entityId} entityName={logTarget.entityName} onClose={() => setLogTarget(null)} />
      )}

      {logoLightbox && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 sm:p-8"
          onClick={() => setLogoLightbox(null)}
          role="presentation"
        >
          <div className="relative max-h-full max-w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLogoLightbox(null)}
              className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 z-10 flex h-8 w-8 items-center justify-center rounded-sm bg-white text-slate-600 shadow-md hover:bg-slate-100"
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <img
              src={logoLightbox.url}
              alt={logoLightbox.name || "Project logo"}
              className="max-h-[min(85vh,720px)] max-w-[min(92vw,920px)] object-contain rounded-sm shadow-2xl"
            />
            {logoLightbox.name && (
              <p className="mt-3 max-w-[min(92vw,920px)] truncate text-center text-sm font-semibold text-white/90">
                {logoLightbox.name}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
