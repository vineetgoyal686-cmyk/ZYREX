import React, { useState, useEffect, useRef } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { Plus, Search, Pencil, Trash2, X, Users, Upload, Download,
         FileSpreadsheet, FileText, ChevronDown, Eye, Phone } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 10;
const emptyForm = { personName: "", contactNumber: "", designation: "", company: "" };

const Field = ({ label, value, onChange, placeholder, type = "text" }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{label}</label>
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700" />
  </div>
);

export default function ContactList() {
  const [contacts, setContacts]         = useState([]);
  const [companies, setCompanies]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [form, setForm]                 = useState(emptyForm);
  const [editId, setEditId]             = useState(null);
  const [viewContact, setViewContact]   = useState(null);
  const [search, setSearch]             = useState("");
  const [saving, setSaving]             = useState(false);
  const [toast, setToast]               = useState(null);
  const [page, setPage]                 = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef();
  const { isGlobalAdmin, canAdd, canEdit, canDelete, canExport } = useModulePermissions("contact_list");

  useEffect(() => {
    fetchContacts();
    fetch(`${API}/api/procurement/companies`)
      .then(r => r.json())
      .then(d => setCompanies(d.companies || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/procurement/contacts`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (err) {
      console.error("Contacts fetch error:", err.message);
      setContacts([]);
      showToast("Failed to load contacts — check if backend is deployed", "error");
    }
    setLoading(false);
  };

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const openAdd  = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };
  const openEdit = (c) => { setForm({ personName: c.personName, contactNumber: c.contactNumber, designation: c.designation, company: c.company }); setEditId(c.id); setShowModal(true); };

  const handleSave = async () => {
    if (!form.personName.trim()) return showToast("Person Name required", "error");
    setSaving(true);
    try {
      const url    = editId ? `${API}/api/procurement/contacts/${editId}` : `${API}/api/procurement/contacts`;
      const method = editId ? "PUT" : "POST";
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      await fetch(url, { method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, createdById: u.id || "", createdByName: u.name || "" }) });
      showToast(editId ? "Contact updated" : "Contact added");
      setShowModal(false);
      if (editId) {
        setContacts(prev => prev.map(c => c.id === editId ? { ...c, ...form } : c));
      } else {
        fetchContacts();
      }
    } catch { showToast("Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this contact?")) return;
    try {
      await fetch(`${API}/api/procurement/contacts/${id}`, { method: "DELETE" });
      showToast("Contact deleted");
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch { showToast("Failed to delete", "error"); }
  };

  const exportExcel = () => {
    const data = filtered.map((c, i) => ({
      "S.No": i + 1, "Contact ID": c.contactCode, "Person Name": c.personName, "Contact Number": c.contactNumber,
      "Designation": c.designation, "Company / Organisation": c.company,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 6 }, { wch: 24 }, { wch: 18 }, { wch: 22 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contacts");
    XLSX.writeFile(wb, "contact_list.xlsx");
    setShowExportMenu(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Contact List — Procurement Setup", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${filtered.length} contacts   |   Exported: ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4); doc.line(14, 26, pageW - 14, 26);
    autoTable(doc, {
      startY: 30,
      head: [["#", "Person Name", "Contact Number", "Designation", "Company / Organisation"]],
      body: filtered.map((c, i) => [i + 1, c.personName, c.contactNumber, c.designation, c.company]),
      styles: { fontSize: 8.5, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85] },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: 50 }, 2: { cellWidth: 40 }, 3: { cellWidth: 50 }, 4: { cellWidth: "auto" } },
      didDrawPage: (data) => {
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${data.pageNumber}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
        doc.text("BMS — Contact List", 14, doc.internal.pageSize.getHeight() - 8);
      },
    });
    doc.save("contact_list.pdf");
    setShowExportMenu(false);
  };

  const filtered   = contacts.filter(c =>
    c.contactCode?.toLowerCase().includes(search.toLowerCase()) ||
    c.personName?.toLowerCase().includes(search.toLowerCase()) ||
    c.contactNumber?.toLowerCase().includes(search.toLowerCase()) ||
    c.designation?.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.toLowerCase().includes(search.toLowerCase())
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
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
            <Users size={20} className="text-sky-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Contact List</h1>
            <p className="text-sm text-slate-400">Procurement Setup — key contacts directory</p>
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
          {canAdd && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all">
              <Plus size={15} /> Add Contact
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name, number, designation or company…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-400 bg-white text-slate-700" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 flex items-center justify-center">
          <p className="text-slate-300 font-bold uppercase tracking-widest text-xs">No contacts found</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm border-collapse table-fixed">
            <colgroup>
              <col style={{width:"5%"}} />
              <col style={{width:"22%"}} />
              <col style={{width:"18%"}} />
              <col style={{width:"22%"}} />
              <col style={{width:"22%"}} />
              <col style={{width:"11%"}} />
            </colgroup>
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 sticky-left-0 w-12">S.No</th>
                <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 w-[100px]">Contact ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 sticky-left-1 w-[160px]" style={{left:'48px'}}>Person Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700">Contact Number</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700">Designation</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700">Company / Organisation</th>
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wide sticky-right-0 w-[100px]">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((c, idx) => (
                <tr key={c.id} className={`transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-sky-50/40 group`}>
                  <td className="px-3 py-3 text-slate-400 text-xs text-center border border-slate-100 font-medium sticky-left-0 w-12">{(page - 1) * PER_PAGE + idx + 1}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600 border border-slate-100 w-[100px]">{c.contactCode || "—"}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800 text-sm border border-slate-100 sticky-left-1 w-[160px] whitespace-normal break-words leading-tight" style={{left:'48px'}}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
                        <span className="text-sky-600 text-xs font-bold">{c.personName?.[0]?.toUpperCase()}</span>
                      </div>
                      {c.personName}
                    </div>
                  </td>
                  <td className="px-4 py-3 border border-slate-100 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-slate-600 text-sm">
                      <Phone size={12} className="text-slate-400 shrink-0" />
                      {c.contactNumber || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-sm border border-slate-100 whitespace-normal break-words leading-snug">{c.designation || "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs border border-slate-100 whitespace-normal break-words leading-snug">{c.company || "—"}</td>
                  <td className="px-3 py-3 border border-slate-100 sticky-right-0 w-[100px]">
                    <div className="flex items-center justify-center gap-0.5">
                      <button onClick={() => setViewContact(c)} className="p-1.5 rounded-lg text-slate-300 hover:text-sky-600 hover:bg-sky-50 transition-all"><Eye size={14} /></button>
                      {canEdit && <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all"><Pencil size={14} /></button>}
                      {canDelete && <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">{filtered.length} contact{filtered.length !== 1 ? "s" : ""} · Page {page} of {totalPages}</p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
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
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all">›</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-linear-to-r from-slate-800 to-slate-700 px-6 py-5 relative">
              <button onClick={() => setViewContact(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center shrink-0">
                  <span className="text-sky-200 text-xl font-bold">{viewContact.personName?.[0]?.toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Person Name</p>
                  <h2 className="text-lg font-bold text-white">{viewContact.personName}</h2>
                  {viewContact.designation && <p className="text-sm text-slate-300 mt-0.5">{viewContact.designation}</p>}
                </div>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                  <Phone size={16} className="text-sky-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contact Number</p>
                    <p className="text-sm font-semibold text-slate-700 mt-0.5">{viewContact.contactNumber || "—"}</p>
                  </div>
                </div>
                {viewContact.company && (
                  <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                    <Users size={16} className="text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Company / Organisation</p>
                      <p className="text-sm font-semibold text-slate-700 mt-0.5">{viewContact.company}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
              {canEdit && (
                <button onClick={() => { setViewContact(null); openEdit(viewContact); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all">
                  <Pencil size={13} /> Edit
                </button>
              )}
              <button onClick={() => setViewContact(null)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">{editId ? "Edit Contact" : "Add Contact"}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Person Name *" value={form.personName}
                onChange={e => setForm(f => ({ ...f, personName: e.target.value }))} placeholder="e.g. Rajesh Kumar" />
              <Field label="Contact Number" value={form.contactNumber} type="tel"
                onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value }))} placeholder="e.g. 9876543210" />
              <Field label="Designation" value={form.designation}
                onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} placeholder="e.g. Site Engineer" />
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Company / Organisation</label>
                <select value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700 bg-white">
                  <option value="">— Select Company —</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.companyName}>{c.companyName}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                {saving ? "Saving…" : editId ? "Update" : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
