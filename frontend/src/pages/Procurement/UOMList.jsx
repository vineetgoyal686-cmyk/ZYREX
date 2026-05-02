import React, { useState, useEffect, useRef } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { Plus, Search, Pencil, Trash2, X, Ruler, Upload, Download, FileSpreadsheet, FileText, ChevronDown, Eye } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const PER_PAGE = 10;

const emptyForm = { uomName: "", uomCode: "" };

const Field = ({ label, value, onChange, placeholder }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{label}</label>
    <input value={value} onChange={onChange} placeholder={placeholder}
      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700" />
  </div>
);

export default function UOMList() {
  const [uoms, setUoms]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState(emptyForm);
  const [editId, setEditId]      = useState(null);
  const [search, setSearch]       = useState("");
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [page, setPage]           = useState(1);
  const [viewUOM, setViewUOM]     = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showBulkMenu, setShowBulkMenu]     = useState(false);
  const [bulking, setBulking]               = useState(false);
  const exportMenuRef = useRef();
  const bulkMenuRef   = useRef();
  const csvRef        = useRef();
  const { isGlobalAdmin, canAdd, canEdit, canDelete, canExport, canBulk } = useModulePermissions("uom");

  useEffect(() => { fetchUoms(); }, []);

  useEffect(() => {
    const handler = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false);
      if (bulkMenuRef.current  && !bulkMenuRef.current.contains(e.target))   setShowBulkMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchUoms = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/procurement/uom`);
      const data = await res.json();
      setUoms(data.uoms || []);
    } catch { setUoms([]); }
    setLoading(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openAdd  = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };
  const openEdit = (u) => { setForm({ ...u }); setEditId(u.id); setShowModal(true); };

  const handleSave = async () => {
    if (!form.uomName.trim()) return showToast("UOM Name required", "error");
    setSaving(true);
    try {
      const url    = editId ? `${API}/api/procurement/uom/${editId}` : `${API}/api/procurement/uom`;
      const method = editId ? "PUT" : "POST";
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const payload = { ...form, createdById: u.id || "", createdByName: u.name || "" };
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      showToast(editId ? "UOM updated" : "UOM added");
      setShowModal(false);
      if (editId) {
        setUoms(prev => prev.map(u => u.id === editId ? { ...u, ...form } : u));
      } else {
        fetchUoms();
      }
    } catch { showToast("Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this UOM?")) return;
    try {
      await fetch(`${API}/api/procurement/uom/${id}`, { method: "DELETE" });
      showToast("UOM deleted");
      fetchUoms();
    } catch { showToast("Failed to delete", "error"); }
  };

  /* ── Export Excel ── */
  const exportExcel = () => {
    const data = filtered.map((u, i) => ({ "S.No": i + 1, "UOM Name": u.uomName, "UOM Code": u.uomCode }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "UOM");
    XLSX.writeFile(wb, "uom_list.xlsx");
    setShowExportMenu(false);
  };

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("UOM List", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${filtered.length} units   |   Exported: ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4);
    doc.line(14, 26, pageW - 14, 26);
    autoTable(doc, {
      startY: 30,
      head: [["S.No", "UOM Name", "UOM Code"]],
      body: filtered.map((u, i) => [i + 1, u.uomName, u.uomCode]),
      styles: { fontSize: 9, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85] },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 20, halign: "center" }, 1: { cellWidth: 100 }, 2: { cellWidth: 50 } },
      didDrawPage: (data) => {
        const pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
        doc.text("BMS — UOM List", 14, doc.internal.pageSize.getHeight() - 8);
      },
    });
    doc.save("uom_list.pdf");
    setShowExportMenu(false);
  };

  /* ── Download CSV Template ── */
  const downloadTemplate = () => {
    const csv = ["UOM Name,UOM Code", '"Kilogram","kg"', '"Meter","m"', '"Piece","pcs"'].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "uom_template.csv"; a.click();
    setShowBulkMenu(false);
  };

  /* ── Bulk CSV Upload ── */
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
            return { uomName: get("uom name"), uomCode: get("uom code") };
          })
          .filter(r => r.uomName);
        if (!rows.length) { showToast("No valid rows found", "error"); setBulking(false); return; }
        const currentUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
        const res = await fetch(`${API}/api/procurement/uom/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows,
            createdById: currentUser.id || "",
            createdByName: currentUser.name || ""
          }),
        });
        const data = await res.json();
        const inserted = data.count ?? 0;
        const skipped = data.skipped ?? 0;
        showToast(skipped > 0
          ? `${inserted} UOM${inserted !== 1 ? "s" : ""} added, ${skipped} skipped (duplicates)`
          : `${inserted} UOM${inserted !== 1 ? "s" : ""} added`);
        fetchUoms();
      } catch { showToast("Bulk upload failed", "error"); }
      setBulking(false);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const filtered = uoms.filter(u =>
    u.uomName?.toLowerCase().includes(search.toLowerCase()) ||
    u.uomCode?.toLowerCase().includes(search.toLowerCase())
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
            <Ruler size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">UOM List</h1>
            <p className="text-sm text-slate-400">Units of Measurement — used in Item List</p>
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
          )}

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

          {/* Add UOM */}
          {canAdd && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all">
              <Plus size={15} /> Add UOM
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name or code…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-400 bg-white text-slate-700" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 flex items-center justify-center">
          <p className="text-slate-300 font-bold uppercase tracking-widest text-xs">No UOMs found</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide sticky-left-0 w-12">S.No</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide sticky-left-1 w-[120px]" style={{left:'48px'}}>UOM Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">UOM Code</th>
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide sticky-right-0 w-24">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((u, idx) => (
                <tr key={idx} className={`transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"} hover:bg-blue-50/40 group`}>
                  <td className="px-3 py-3.5 text-slate-400 text-xs text-center font-medium sticky-left-0 w-12">{(page - 1) * PER_PAGE + idx + 1}</td>
                  <td className="px-4 py-3.5 font-semibold text-slate-800 text-sm sticky-left-1 w-[120px] whitespace-normal break-words leading-tight" style={{left:'48px'}}>{u.uomName}</td>
                  <td className="px-4 py-3.5 whitespace-normal break-words leading-tight">
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-mono font-semibold">{u.uomCode}</span>
                  </td>
                  <td className="px-3 py-3.5 sticky-right-0 w-24">
                    <div className="flex items-center justify-center gap-0.5">
                      <button onClick={() => setViewUOM(u)} className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-all"><Eye size={14} /></button>
                      {canEdit && <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all"><Pencil size={14} /></button>}
                      {canDelete && <button onClick={() => handleDelete(u.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">{filtered.length} unit{filtered.length !== 1 ? "s" : ""} · Page {page} of {totalPages}</p>
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
      {viewUOM && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-linear-to-r from-slate-800 to-slate-700 px-6 py-5 relative">
              <button onClick={() => setViewUOM(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                  <Ruler size={20} className="text-blue-300" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">UOM Name</p>
                  <h2 className="text-lg font-bold text-white leading-tight">{viewUOM.uomName}</h2>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Code</p>
                    <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-200 rounded-lg text-xs font-mono font-semibold tracking-wider">{viewUOM.uomCode || "—"}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
              {canEdit && (
                <button onClick={() => { setViewUOM(null); openEdit(viewUOM); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all">
                  <Pencil size={13} /> Edit
                </button>
              )}
              <button onClick={() => setViewUOM(null)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">{editId ? "Edit UOM" : "Add UOM"}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="UOM Name *" value={form.uomName} onChange={e => setForm(f => ({ ...f, uomName: e.target.value }))} placeholder="e.g. Kilogram" />
              <Field label="UOM Code" value={form.uomCode} onChange={e => setForm(f => ({ ...f, uomCode: e.target.value.toLowerCase() }))} placeholder="e.g. kg" />
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                {saving ? "Saving…" : editId ? "Update" : "Add UOM"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
