import React, { useState, useEffect, useRef } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { Plus, Search, Pencil, Trash2, X, MapPin, Upload, Download, FileSpreadsheet, FileText, ChevronDown, Eye } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const Field = ({ label, value, onChange, placeholder, textarea }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{label}</label>
    {textarea
      ? <textarea value={value} onChange={onChange} rows={2} placeholder={placeholder}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700 resize-none" />
      : <input value={value} onChange={onChange} placeholder={placeholder}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700" />
    }
  </div>
);

const emptyForm = {
  siteName: "", siteCode: "", city: "", state: "", billingAddress: "", siteAddress: "",
};

const CSV_HEADERS = ["Site Name", "Site Code", "City", "State", "Billing Address", "Site Address"];

const PER_PAGE = 10;

export default function SiteList() {
  const [sites, setSites]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [showBulkMenu, setShowBulkMenu]     = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef                       = useRef();
  const [form, setForm]             = useState(emptyForm);
  const [editId, setEditId]         = useState(null);
  const [search, setSearch]         = useState("");
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState(null);
  const [bulking, setBulking]       = useState(false);
  const [page, setPage]             = useState(1);
  const [viewSite, setViewSite]     = useState(null);
  const csvRef                      = useRef();
  const bulkMenuRef                 = useRef();
  const { isGlobalAdmin, canAdd, canEdit, canDelete, canExport, canBulk } = useModulePermissions("site_list");

  useEffect(() => { fetchSites(); }, []);

  // Close bulk menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target)) setShowBulkMenu(false);
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchSites = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/procurement/sites`);
      const data = await res.json();
      setSites(data.sites || []);
    } catch { setSites([]); }
    setLoading(false);
  };

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const openAdd  = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };
  const openEdit = (s) => { setForm({ ...emptyForm, ...s }); setEditId(s.id); setShowModal(true); };

  const handleSave = async () => {
    if (!form.siteName.trim()) return showToast("Site Name required", "error");
    setSaving(true);
    try {
      const url    = editId ? `${API}/api/procurement/sites/${editId}` : `${API}/api/procurement/sites`;
      const method = editId ? "PUT" : "POST";
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const payload = { ...form, createdById: u.id || "", createdByName: u.name || "" };
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      showToast(editId ? "Site updated" : "Site added");
      setShowModal(false);
      if (editId) {
        setSites(prev => prev.map(s => s.id === editId ? { ...s, ...form } : s));
      } else {
        fetchSites();
      }
    } catch { showToast("Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this site?")) return;
    try {
      await fetch(`${API}/api/procurement/sites/${id}`, { method: "DELETE" });
      showToast("Site deleted"); fetchSites();
    } catch { showToast("Failed to delete", "error"); }
  };

  /* ── Template download (CSV) ── */
  const downloadTemplate = () => {
    const csv = [
      CSV_HEADERS.join(","),
      '"Varanasi Library","GDLV","Varanasi","Uttar Pradesh","1752 Outside Khanderao Gate Civil Lines Jhansi UP 284001","Government District Library Orderly Bazar Varanasi UP 221002"',
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "sites_template.csv"; a.click();
    setShowBulkMenu(false);
  };

  /* ── Bulk CSV upload ── */
  const handleBulkCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulking(true); setShowBulkMenu(false);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const allLines = ev.target.result.trim().split("\n");
        const parseRow = (line) => (line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || []).map(c => c.replace(/^"|"$/g, "").trim());
        const headers = parseRow(allLines[0]).map(h => h.toLowerCase());
        const idx = (name) => headers.indexOf(name.toLowerCase());
        const lines = allLines.slice(1);
        const rows = lines
          .filter(l => l.trim())
          .map(l => {
            const clean = parseRow(l);
            const get = (name) => { const i = idx(name); return i >= 0 ? (clean[i] || "") : ""; };
            return { siteName: get("site name"), siteCode: get("site code"), city: get("city"), state: get("state"), billingAddress: get("billing address"), siteAddress: get("site address") };
          })
          .filter(r => r.siteName);
        if (!rows.length) { showToast("No valid rows found", "error"); setBulking(false); return; }
        const currentUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
        const res = await fetch(`${API}/api/procurement/sites/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows,
            createdById: currentUser.id || "",
            createdByName: currentUser.name || ""
          })
        });
        const data = await res.json();
        const inserted = data.count ?? 0;
        const skipped = data.skipped ?? 0;
        showToast(skipped > 0
          ? `${inserted} site${inserted !== 1 ? "s" : ""} added, ${skipped} skipped (duplicates)`
          : `${inserted} site${inserted !== 1 ? "s" : ""} added`);
        fetchSites();
      } catch { showToast("Bulk upload failed", "error"); }
      setBulking(false);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  /* ── Export Excel ── */
  const exportExcel = () => {
    const data = filtered.map((s, i) => ({
      "S.No": i + 1,
      "Site Name": s.siteName,
      "Site Code": s.siteCode,
      "City": s.city,
      "State": s.state,
      "Billing Address": s.billingAddress,
      "Site Address": s.siteAddress,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sites");
    XLSX.writeFile(wb, "site_list.xlsx");
  };

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Site List", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${filtered.length} sites   |   Exported: ${new Date().toLocaleDateString("en-IN")}`, 14, 23);

    // Horizontal rule
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(14, 26, pageW - 14, 26);

    autoTable(doc, {
      startY: 30,
      head: [["S.No", "Site Name", "Code", "City", "State", "Billing Address", "Site Address"]],
      body: filtered.map((s, i) => [i + 1, s.siteName, s.siteCode, s.city, s.state, s.billingAddress, s.siteAddress]),
      tableWidth: pageW - 28,
      styles: {
        fontSize: 8,
        cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
        valign: "top",
        lineColor: [203, 213, 225],
        lineWidth: 0.3,
        textColor: [51, 65, 85],
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
        halign: "left",
        lineColor: [30, 41, 59],
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 38 },
        2: { cellWidth: 22 },
        3: { cellWidth: 24 },
        4: { cellWidth: 24 },
        5: { cellWidth: "auto" },
        6: { cellWidth: "auto" },
      },
      didDrawPage: (data) => {
        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
        doc.text("BMS — Site List", 14, doc.internal.pageSize.getHeight() - 8);
      },
    });

    doc.save("site_list.pdf");
  };

  const filtered = sites.filter(s =>
    s.siteName?.toLowerCase().includes(search.toLowerCase()) ||
    s.siteCode?.toLowerCase().includes(search.toLowerCase()) ||
    s.city?.toLowerCase().includes(search.toLowerCase()) ||
    s.state?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);


  return (
    <div className="p-3 sm:p-4 lg:p-6 w-full pb-32">

      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg
          ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <MapPin size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Site List</h1>
            <p className="text-sm text-slate-400">Global master — all project sites</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">

          {canExport && (
          <div className="relative" ref={exportMenuRef}>
            <button onClick={() => setShowExportMenu(v => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
              <Download size={15} /> Export <ChevronDown size={13} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-xl border border-slate-100 z-30 overflow-hidden">
                <button onClick={() => { exportExcel(); setShowExportMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-emerald-700 hover:bg-emerald-50 transition-colors text-left">
                  <FileSpreadsheet size={14} /> Excel (.xlsx)
                </button>
                <div className="border-t border-slate-100" />
                <button onClick={() => { exportPDF(); setShowExportMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors text-left">
                  <FileText size={14} /> PDF
                </button>
              </div>
            )}
          </div>
          )}

          {/* Bulk Upload dropdown */}
          {canBulk && (
          <div className="relative" ref={bulkMenuRef}>
            <button onClick={() => setShowBulkMenu(v => !v)} disabled={bulking}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all disabled:opacity-50">
              <Upload size={15} /> {bulking ? "Uploading…" : "Bulk Upload"} <ChevronDown size={13} />
            </button>
            {showBulkMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-slate-100 z-30 overflow-hidden">
                <button onClick={downloadTemplate}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left">
                  <Download size={14} className="text-slate-400" /> Download Template
                </button>
                <div className="border-t border-slate-100" />
                <button onClick={() => { setShowBulkMenu(false); csvRef.current.click(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left">
                  <Upload size={14} className="text-slate-400" /> Upload CSV
                </button>
              </div>
            )}
          </div>
          )}
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleBulkCSV} />

          {/* Add Site */}
          {canAdd && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all">
              <Plus size={15} /> Add Site
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name, code, city or state…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-400 bg-white text-slate-700" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 flex items-center justify-center">
          <p className="text-slate-300 font-bold uppercase tracking-widest text-xs">No sites found</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white">
                  {["S.No","Site Name","Code","City","State","Billing Address","Site Address","Action"].map((h, i) => {
                    let stickyClass = "";
                    let style = {};
                    if (i === 0) stickyClass = "sticky-left-0";
                    if (i === 1) { stickyClass = "sticky-left-1"; style = { left: '48px' }; }
                    if (i === 7) stickyClass = "sticky-right-0";
                    
                    return (
                      <th key={i} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 last:border-r-0 ${stickyClass}
                        ${i === 0 ? "w-12 text-center" : "text-left"}
                        ${i === 1 ? "min-w-[150px]" : ""} 
                        ${i === 5 || i === 6 ? "min-w-[240px]" : ""} 
                        ${i === 7 ? "w-20 text-center" : ""}`}
                        style={style}>
                        {h}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {paginated.map((s, idx) => (
                  <tr key={idx} className={`transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50/50 group`}>
                    <td className="px-4 py-3 text-slate-400 text-xs border border-slate-200 align-middle text-center sticky-left-0 w-12">{(page - 1) * PER_PAGE + idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 text-sm border border-slate-200 align-top leading-snug sticky-left-1 w-[150px] whitespace-normal break-words" style={{left:'48px'}}>{s.siteName}</td>
                    <td className="px-4 py-3 border border-slate-200 align-top">
                      <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-mono font-semibold whitespace-nowrap">{s.siteCode}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 text-xs border border-slate-200 align-top whitespace-normal break-words">{s.city}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs border border-slate-200 align-top whitespace-normal break-words">{s.state}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs border border-slate-200 align-top leading-relaxed whitespace-normal break-words">{s.billingAddress}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs border border-slate-200 align-top leading-relaxed whitespace-normal break-words">{s.siteAddress}</td>
                    <td className="px-4 py-3 border border-slate-200 align-middle sticky-right-0 w-20">
                      <div className="flex items-center gap-1 justify-center">
                        <button onClick={() => setViewSite(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"><Eye size={13} /></button>
                        {canEdit && (
                          <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"><Pencil size={13} /></button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">{filtered.length} sites · Page {page} of {totalPages}</p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                    className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all">‹</button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let n;
                    if (totalPages <= 5) n = i + 1;
                    else if (page <= 3) n = i + 1;
                    else if (page >= totalPages - 2) n = totalPages - 4 + i;
                    else n = page - 2 + i;
                    return (
                      <button key={n} onClick={() => setPage(n)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${page === n ? "bg-slate-900 text-white border-slate-900" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                        {n}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                    className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all">›</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

            {/* Coloured header banner */}
            <div className="bg-linear-to-r from-slate-800 to-slate-700 px-6 py-5 relative">
              <button onClick={() => setViewSite(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                  <MapPin size={20} className="text-blue-300" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Site Name</p>
                  <h2 className="text-lg font-bold text-white leading-tight">{viewSite.siteName}</h2>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Site Code</p>
                    <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-200 rounded-lg text-xs font-mono font-semibold tracking-wider">
                      {viewSite.siteCode || "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">

              {/* City + State row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">City</p>
                  <p className="text-sm font-semibold text-slate-700">{viewSite.city || "—"}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">State</p>
                  <p className="text-sm font-semibold text-slate-700">{viewSite.state || "—"}</p>
                </div>
              </div>

              {/* Billing Address */}
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Billing Address</p>
                </div>
                <p className="px-4 py-3 text-sm text-slate-600 leading-relaxed">{viewSite.billingAddress || "—"}</p>
              </div>

              {/* Site Address */}
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Site Address</p>
                </div>
                <p className="px-4 py-3 text-sm text-slate-600 leading-relaxed">{viewSite.siteAddress || "—"}</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
              {canEdit && (
                <button onClick={() => { setViewSite(null); openEdit(viewSite); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all">
                  <Pencil size={13} /> Edit
                </button>
              )}
              <button onClick={() => setViewSite(null)}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">{editId ? "Edit Site" : "Add Site"}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Site Name *" value={form.siteName} onChange={e => setForm(f => ({ ...f, siteName: e.target.value }))} placeholder="e.g. Varanasi Library" />
                <Field label="Site Code" value={form.siteCode} onChange={e => setForm(f => ({ ...f, siteCode: e.target.value.toUpperCase() }))} placeholder="e.g. GDLV" />
                <Field label="City" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="e.g. Varanasi" />
                <Field label="State" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="e.g. Uttar Pradesh" />
              </div>
              <Field label="Billing Address" value={form.billingAddress} onChange={e => setForm(f => ({ ...f, billingAddress: e.target.value }))} placeholder="Full billing address" textarea />
              <Field label="Site Address" value={form.siteAddress} onChange={e => setForm(f => ({ ...f, siteAddress: e.target.value }))} placeholder="Physical site address" textarea />
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                {saving ? "Saving…" : editId ? "Update" : "Add Site"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
