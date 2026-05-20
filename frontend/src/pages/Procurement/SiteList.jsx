import React, { useState, useEffect, useRef } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import {
  Plus, Search, Pencil, Trash2, X, MapPin, Upload, Download,
  FileSpreadsheet, FileText, ChevronDown, Eye, ArrowLeft, User, Navigation, History,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SiteMapModal, SiteFormField, SiteContactPicker } from "../../components/procurement/SiteShared";
import { logAudit } from "../../utils/auditLog";
import LogPanel from "../../components/LogPanel";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const PER_PAGE = 10;
const CSV_HEADERS = ["Site Name", "Site Code", "Status", "District", "State", "Pincode", "Site Address", "Slug"];

/* Map / FormField / ContactPicker moved to shared component */

const emptyContact = (isPrimary = false) => ({ id: uid(), contactId: "", name: "", phone: "", email: "", isPrimary });

const emptyForm = {
  siteName: "", siteCode: "", status: "active",
  contacts: [emptyContact(true)],
  pincode: "", district: "", state: "",
  longitude: "", latitude: "", siteAddress: "",
  slug: "",
};

const normalizeContacts = (val) => {
  if (Array.isArray(val) && val.length) return val.map(c => ({ id: c.id || uid(), ...c }));
  if (typeof val === "string") {
    try { const p = JSON.parse(val); if (Array.isArray(p) && p.length) return p.map(c => ({ id: c.id || uid(), ...c })); } catch { }
  }
  return [emptyContact(true)];
};

export default function SiteList() {
  const { canAdd, canEdit, canDelete, canExport, canBulk } = useModulePermissions("site_list");
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showView, setShowView] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [bulking, setBulking] = useState(false);
  const [toast, setToast] = useState(null);
  const [logTarget, setLogTarget] = useState(null);
  const [page, setPage] = useState(1);
  const [allContacts, setAllContacts] = useState([]);
  const exportRef = useRef();
  const bulkRef = useRef();
  const csvRef = useRef();

  useEffect(() => { fetchSites(); }, []);

  useEffect(() => {
    const h = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExportMenu(false);
      if (bulkRef.current && !bulkRef.current.contains(e.target)) setShowBulkMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Scroll Lock when View is open
  useEffect(() => {
    if (showView) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [showView]);

  const fetchSites = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/procurement/sites`);
      const data = await res.json();
      setSites(data.sites || []);
    } catch { setSites([]); }
    setLoading(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAllContacts = async () => {
    try {
      const res = await fetch(`${API}/api/procurement/contacts`);
      const data = await res.json();
      setAllContacts(data.contacts || []);
    } catch { }
  };

  const openAdd = () => {
    setForm({ ...emptyForm, contacts: [emptyContact(true)] });
    setEditId(null);
    fetchAllContacts();
    setShowForm(true);
  };

  const openEdit = (s) => {
    setForm({ ...emptyForm, ...s, contacts: normalizeContacts(s.contacts) });
    setEditId(s.id);
    fetchAllContacts();
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.siteName.trim()) return showToast("Site Name required", "error");
    if (!form.contacts[0]?.name?.trim()) return showToast("Primary Contact name required", "error");
    setSaving(true);
    try {
      const url = editId ? `${API}/api/procurement/sites/${editId}` : `${API}/api/procurement/sites`;
      const method = editId ? "PUT" : "POST";
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, createdById: u.id || "", createdByName: u.name || "" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { showToast(data.error || "Failed to save", "error"); setSaving(false); return; }
      const savedId = editId || data.id;
      logAudit("site", savedId, form.siteName, editId ? "updated" : "created");
      showToast(editId ? "Site updated" : "Site added");
      setShowForm(false);
      fetchSites();
    } catch { showToast("Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this site?")) return;
    try {
      const siteName = sites.find(s => s.id === id)?.site_name || "";
      await fetch(`${API}/api/procurement/sites/${id}`, { method: "DELETE" });
      logAudit("site", id, siteName, "deleted");
      showToast("Site deleted");
      fetchSites();
    } catch { showToast("Failed to delete", "error"); }
  };

  const addContact = () => setForm(f => ({ ...f, contacts: [...f.contacts, emptyContact(false)] }));
  const removeContact = (id) => setForm(f => ({ ...f, contacts: f.contacts.filter(c => c.id !== id) }));
  const selectContact = (slotId, picked) =>
    setForm(f => ({ ...f, contacts: f.contacts.map(c => c.id === slotId ? { ...c, contactId: picked.id, name: picked.personName, phone: picked.contactNumber, email: picked.email || "" } : c) }));
  const clearContact = (slotId) =>
    setForm(f => ({ ...f, contacts: f.contacts.map(c => c.id === slotId ? { ...c, contactId: "", name: "", phone: "", email: "" } : c) }));

  const downloadTemplate = () => {
    const csv = [
      CSV_HEADERS.join(","),
      '"Varanasi Library","GDLV","active","Varanasi","Uttar Pradesh","221002","Orderly Bazar Varanasi UP 221002","varanasi-library"',
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sites_template.csv";
    a.click();
    setShowBulkMenu(false);
  };

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
        const rows = allLines.slice(1)
          .filter(l => l.trim())
          .map(l => {
            const c = parseRow(l);
            const get = (name) => { const i = idx(name); return i >= 0 ? (c[i] || "") : ""; };
            return { siteName: get("site name"), siteCode: get("site code"), status: get("status") || "active", district: get("district"), state: get("state"), pincode: get("pincode"), siteAddress: get("site address"), slug: get("slug") };
          })
          .filter(r => r.siteName);
        if (!rows.length) { showToast("No valid rows found", "error"); setBulking(false); return; }
        const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
        const res = await fetch(`${API}/api/procurement/sites/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows, createdById: u.id || "", createdByName: u.name || "" }),
        });
        const data = await res.json();
        showToast(data.skipped > 0 ? `${data.count ?? 0} added, ${data.skipped} skipped` : `${data.count ?? 0} site(s) added`);
        fetchSites();
      } catch { showToast("Bulk upload failed", "error"); }
      setBulking(false);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const uniqueStates = [...new Set(sites.map(s => s.state).filter(Boolean))].sort();
  const uniqueCodes = [...new Set(sites.map(s => s.siteCode).filter(Boolean))].sort();

  const filtered = sites.filter(s => {
    const matchesSearch = !search || (
      s.siteName?.toLowerCase().includes(search.toLowerCase()) ||
      s.siteCode?.toLowerCase().includes(search.toLowerCase()) ||
      (s.district || s.city || "").toLowerCase().includes(search.toLowerCase()) ||
      s.state?.toLowerCase().includes(search.toLowerCase())
    );
    const matchesState = !filterState || s.state === filterState;
    const matchesCode = !filterCode || s.siteCode === filterCode;
    return matchesSearch && matchesState && matchesCode;
  });
  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const exportExcel = () => {
    const data = filtered.map((s, i) => ({
      "S.No": i + 1, "Site Name": s.siteName, "Site Code": s.siteCode,
      "Status": s.status, "District": s.district || s.city, "State": s.state,
      "Pincode": s.pincode, "Site Address": s.siteAddress, "Slug": s.slug,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sites");
    XLSX.writeFile(wb, "site_list.xlsx");
    setShowExportMenu(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Site List", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${filtered.length} sites | Exported: ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    autoTable(doc, {
      startY: 30,
      head: [["S.No", "Site Name", "Code", "Status", "District", "State", "Pincode", "Site Address"]],
      body: filtered.map((s, i) => [i + 1, s.siteName, s.siteCode, s.status || "active", s.district || s.city, s.state, s.pincode, s.siteAddress]),
      tableWidth: pageW - 28,
      styles: { fontSize: 7, cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85], overflow: "linebreak" },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    doc.save("site_list.pdf");
    setShowExportMenu(false);
  };

  /* ════════════════════════════════════
     FORM PAGE
  ════════════════════════════════════ */
  if (showForm) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
        {showMapModal && (
          <SiteMapModal
            initialLat={form.latitude}
            initialLng={form.longitude}
            onSave={(lat, lng) => { setForm(f => ({ ...f, latitude: lat, longitude: lng })); setShowMapModal(false); }}
            onClose={() => setShowMapModal(false)}
          />
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm text-slate-400 mb-4">
          <span className="hover:text-slate-600 cursor-pointer" onClick={() => setShowForm(false)}>Sites</span>
          <span>/</span>
          <span className="text-slate-700 font-semibold">{editId ? "Edit" : "Add"}</span>
        </div>

        {/* Title */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setShowForm(false)}
            className="w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={15} />
          </button>
          <h1 className="text-xl font-bold text-slate-800">{editId ? "Edit Site" : "Add Site"}</h1>
        </div>

        <div className="space-y-4 max-w-4xl">

          {/* Site Details */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-800 mb-4">Site Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SiteFormField label="Name" required value={form.siteName}
                onChange={e => setForm(f => ({ ...f, siteName: e.target.value }))} placeholder="Enter site name" />
              <SiteFormField label="Code" required value={form.siteCode}
                onChange={e => setForm(f => ({ ...f, siteCode: e.target.value.toUpperCase() }))} placeholder="Enter site code" />
              <SiteFormField label="Status" required value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                select options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
            </div>
          </div>

          {/* Contacts */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-800">Contacts</h2>
              <button
                onClick={addContact}
                className="w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="space-y-3">
              {form.contacts.map((contact, idx) => (
                <div key={contact.id} className={`rounded-lg border p-4 ${idx === 0 ? "bg-blue-50/40 border-blue-100" : "bg-slate-50 border-slate-100"}`}>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <User size={13} className={idx === 0 ? "text-blue-600" : "text-slate-400"} />
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                        {idx === 0 ? "Primary Contact" : `Contact ${idx + 1}`}
                      </span>
                    </div>
                    {idx > 0 && (
                      <button type="button" onClick={() => removeContact(contact.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <SiteContactPicker
                    allContacts={allContacts}
                    contact={contact}
                    isPrimary={idx === 0}
                    onSelect={(picked) => selectContact(contact.id, picked)}
                    onClear={() => clearContact(contact.id)}
                  />
                </div>
              ))}
              {allContacts.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">
                  No contacts in directory yet — add contacts from the Contact tab first.
                </p>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-800">Location</h2>
              <button
                type="button"
                onClick={() => setShowMapModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <MapPin size={14} /> Select on Map
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <SiteFormField label="Pincode" required value={form.pincode}
                onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} placeholder="Enter pincode" />
              <SiteFormField label="District" required value={form.district}
                onChange={e => setForm(f => ({ ...f, district: e.target.value }))} placeholder="Enter district" />
              <SiteFormField label="State" required value={form.state}
                onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="Enter state" />
            </div>
            <div className="grid grid-cols-2 gap-4 items-stretch">
              <div className="flex flex-col gap-4">
                <SiteFormField label="Longitude" required value={form.longitude}
                  onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} placeholder="" />
                <SiteFormField label="Latitude" required value={form.latitude}
                  onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} placeholder="" />
              </div>
              <div className="flex flex-col">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.siteAddress}
                  onChange={e => setForm(f => ({ ...f, siteAddress: e.target.value }))}
                  placeholder="Enter address"
                  className="flex-1 w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-50 text-slate-700 resize-none transition-colors"
                  style={{ minHeight: 0 }}
                />
              </div>
            </div>
          </div>

        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-3 mt-6 max-w-4xl">
          <button
            onClick={() => setShowForm(false)}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : editId ? "Update Site" : "Create Site"}
          </button>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════
     LIST VIEW
  ════════════════════════════════════ */
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
            <div className="relative" ref={exportRef}>
              <button onClick={() => setShowExportMenu(v => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
                <Download size={15} /> Export <ChevronDown size={13} />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-xl border border-slate-100 z-30 overflow-hidden">
                  <button onClick={exportExcel} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-emerald-700 hover:bg-emerald-50 text-left">
                    <FileSpreadsheet size={14} /> Excel (.xlsx)
                  </button>
                  <div className="border-t border-slate-100" />
                  <button onClick={exportPDF} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-600 hover:bg-red-50 text-left">
                    <FileText size={14} /> PDF
                  </button>
                </div>
              )}
            </div>
          )}
          {canBulk && (
            <div className="relative" ref={bulkRef}>
              <button onClick={() => setShowBulkMenu(v => !v)} disabled={bulking}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all disabled:opacity-50">
                <Upload size={15} /> {bulking ? "Uploading…" : "Bulk Upload"} <ChevronDown size={13} />
              </button>
              {showBulkMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-slate-100 z-30 overflow-hidden">
                  <button onClick={downloadTemplate} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 text-left">
                    <Download size={14} className="text-slate-400" /> Download Template
                  </button>
                  <div className="border-t border-slate-100" />
                  <button onClick={() => { setShowBulkMenu(false); csvRef.current.click(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 text-left">
                    <Upload size={14} className="text-slate-400" /> Upload CSV
                  </button>
                </div>
              )}
            </div>
          )}
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleBulkCSV} />
          {canAdd && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all">
              <Plus size={15} /> Add Site
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-5">
        <div className="relative w-full sm:max-w-xs">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search site…"
            className="w-full pl-9 pr-4 py-2 rounded-md border border-slate-200 text-sm outline-none focus:border-indigo-400 bg-white text-slate-700 shadow-sm transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="relative flex-1 sm:flex-initial">
            <select
              value={filterState}
              onChange={e => { setFilterState(e.target.value); setPage(1); }}
              className="w-full sm:w-40 pl-3 pr-9 py-2 rounded-md border border-slate-200 text-sm outline-none focus:border-indigo-400 bg-white text-slate-700 appearance-none shadow-sm transition-all cursor-pointer"
            >
              <option value="">All States</option>
              {uniqueStates.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative flex-1 sm:flex-initial">
            <select
              value={filterCode}
              onChange={e => { setFilterCode(e.target.value); setPage(1); }}
              className="w-full sm:w-40 pl-3 pr-9 py-2 rounded-md border border-slate-200 text-sm outline-none focus:border-indigo-400 bg-white text-slate-700 appearance-none shadow-sm transition-all cursor-pointer"
            >
              <option value="">All Codes</option>
              {uniqueCodes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ═════ TABLE AREA ═════ */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4" />
          <p className="text-slate-400 text-sm font-medium">Fetching sites...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-20 flex flex-col items-center justify-center shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Search size={24} className="text-slate-200" />
          </div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No sites match your search</p>
        </div>
      ) : (
        <div className="bg-white rounded-none border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-20 text-center border-r border-slate-200">S.No</th>
                  <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left min-w-[200px] border-r border-slate-200">Site Name</th>
                  <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left border-r border-slate-200">Code</th>
                  <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left border-r border-slate-200">Location</th>
                  <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left min-w-[240px] border-r border-slate-200">Site Address</th>
                  <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center border-r border-slate-200">Status</th>
                  <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center w-32">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginated.map((s, idx) => (
                  <tr key={s.id || idx} className="hover:bg-indigo-50/20 transition-colors group">
                    <td className="px-4 py-4 text-slate-400 text-xs text-center font-medium border-r border-b border-slate-200">
                      {String((page - 1) * PER_PAGE + idx + 1).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-4 border-r border-b border-slate-200">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-[13px] leading-tight">{s.siteName}</span>
                        {s.slug && <span className="text-[10px] text-slate-400 font-mono mt-0.5">{s.slug}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 border-r border-b border-slate-200">
                      <span className="text-slate-600 text-xs font-semibold uppercase">
                        {s.siteCode || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-4 border-r border-b border-slate-200">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-slate-700 text-xs font-semibold">{s.district || s.city || "—"}</span>
                        <span className="text-slate-400 text-[10px] uppercase tracking-wide">{s.state || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 border-r border-b border-slate-200">
                      <div className="flex gap-2 items-start">
                        <p className="text-slate-500 text-[11px] leading-relaxed max-w-[220px]">
                          {s.siteAddress || "No address provided"}
                          {s.pincode && <span className="ml-1 text-slate-400 font-medium">— {s.pincode}</span>}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center border-r border-b border-slate-200">
                      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border-2
                        ${s.status === "active" ? "border-emerald-400 text-emerald-500" : "border-slate-300 text-slate-400"}`}>
                        {s.status || "active"}
                      </span>
                    </td>
                    <td className="px-4 py-4 border-b border-slate-200">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setShowView(s)} className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="View Details">
                          <Eye size={14} />
                        </button>
                        {canEdit && (
                          <button onClick={() => openEdit(s)} className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all" title="Edit Site">
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(s.id)} className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all" title="Delete Site">
                            <Trash2 size={14} />
                          </button>
                        )}
                        <button onClick={() => setLogTarget({ entityType: "site", entityId: s.id, entityName: s.site_name })} className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all" title="Activity Log">
                          <History size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <p className="text-[11px] text-slate-400 font-medium">
              Showing <span className="text-slate-600 font-bold">{paginated.length}</span> of <span className="text-slate-600 font-bold">{filtered.length}</span> sites
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors uppercase tracking-wider">
                  Prev
                </button>
                <div className="flex items-center gap-1 px-2">
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 w-6 h-6 flex items-center justify-center rounded-md">{page}</span>
                  <span className="text-[10px] text-slate-300 mx-1">/</span>
                  <span className="text-xs font-medium text-slate-400">{totalPages}</span>
                </div>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors uppercase tracking-wider">
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═════ VIEW MODAL ═════ */}
      {showView && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowView(null)}>
          <style>{`
            .drawer-scrollbar::-webkit-scrollbar { width: 4px; }
            .drawer-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .drawer-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
            .drawer-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
          `}</style>
          <div 
            className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Area */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <MapPin size={20} className="text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 leading-tight">Site Details</h2>
                  <p className="text-xs text-slate-400 font-medium">{showView.siteCode || "No Code"}</p>
                </div>
              </div>
              <button onClick={() => setShowView(null)}
                className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-7 drawer-scrollbar">
              {/* Main Info */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider 
                    ${showView.status === "active" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-50 text-slate-500 border border-slate-100"}`}>
                    {showView.status || "active"}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider">Site Master</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{showView.siteName}</h1>
              </div>

              {/* Location Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">District</p>
                  <p className="text-sm font-semibold text-slate-700">{showView.district || showView.city || "—"}</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">State</p>
                  <p className="text-sm font-semibold text-slate-700">{showView.state || "—"}</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 col-span-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pincode</p>
                  <p className="text-sm font-semibold text-slate-700">{showView.pincode || "—"}</p>
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Navigation size={13} /> Site Address
                </h3>
                <div className="p-4 rounded-xl border border-slate-200 text-slate-600 text-sm leading-relaxed bg-white shadow-sm">
                  {showView.siteAddress || "No address provided."}
                </div>
              </div>

              {/* Geo Info */}
              {(showView.latitude || showView.longitude) && (
                <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100 space-y-3">
                  <h3 className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                    <MapPin size={13} /> Coordinates
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Latitude</p>
                      <p className="text-xs font-mono font-bold text-slate-700">{showView.latitude || "0.000000"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Longitude</p>
                      <p className="text-xs font-mono font-bold text-slate-700">{showView.longitude || "0.000000"}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Contacts */}
              {Array.isArray(showView.contacts) && showView.contacts.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <User size={13} /> Assigned Contacts
                  </h3>
                  <div className="space-y-2.5">
                    {showView.contacts.map((c, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 transition-all group bg-slate-50/50">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm
                          ${i === 0 ? "bg-indigo-600 text-white shadow-md" : "bg-slate-200 text-slate-500"}`}>
                          {c.name?.[0]?.toUpperCase() || "C"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-800 truncate">{c.name || "Unnamed"}</p>
                            {i === 0 && <span className="text-[8px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full uppercase">Primary</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500 font-medium">
                            <span>{c.phone || "No phone"}</span>
                            {c.email && <span className="opacity-50 truncate">{c.email}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Area */}
            <div className="px-6 py-5 border-t border-slate-100 bg-slate-50 flex items-center gap-3 shrink-0">
              {canEdit && (
                <button onClick={() => { setShowView(null); openEdit(showView); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm">
                  <Pencil size={15} /> Edit Site
                </button>
              )}
              <button onClick={() => setShowView(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {logTarget && (
        <LogPanel entityType={logTarget.entityType} entityId={logTarget.entityId} entityName={logTarget.entityName} onClose={() => setLogTarget(null)} />
      )}
    </div>
  );
}

export function SiteDetailPanel({ site, onClose, onSelect }) {
  if (!site) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <style>{`
        .site-drawer-scroll::-webkit-scrollbar { width: 4px; }
        .site-drawer-scroll::-webkit-scrollbar-track { background: transparent; }
        .site-drawer-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .site-drawer-scroll::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
      <div className="bg-white w-full max-w-md max-h-[90vh] shadow-2xl flex flex-col rounded-xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <MapPin size={20} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">Site Details</h2>
              <p className="text-xs text-slate-400 font-medium">{site.siteCode || "No Code"}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-7 site-drawer-scroll">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                ${site.status === "active" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-50 text-slate-500 border border-slate-100"}`}>
                {site.status || "active"}
              </span>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider">Site Master</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{site.siteName}</h1>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">District</p>
              <p className="text-sm font-semibold text-slate-700">{site.district || site.city || "—"}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">State</p>
              <p className="text-sm font-semibold text-slate-700">{site.state || "—"}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 col-span-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pincode</p>
              <p className="text-sm font-semibold text-slate-700">{site.pincode || "—"}</p>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Navigation size={13} /> Site Address
            </h3>
            <div className="p-4 rounded-xl border border-slate-200 text-slate-600 text-sm leading-relaxed bg-white shadow-sm">
              {site.siteAddress || "No address provided."}
            </div>
          </div>
          {(site.latitude || site.longitude) && (
            <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100 space-y-3">
              <h3 className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                <MapPin size={13} /> Coordinates
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Latitude</p>
                  <p className="text-xs font-mono font-bold text-slate-700">{site.latitude || "0.000000"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Longitude</p>
                  <p className="text-xs font-mono font-bold text-slate-700">{site.longitude || "0.000000"}</p>
                </div>
              </div>
            </div>
          )}
          {Array.isArray(site.contacts) && site.contacts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <User size={13} /> Assigned Contacts
              </h3>
              <div className="space-y-2.5">
                {site.contacts.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 transition-all group bg-slate-50/50">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm
                      ${i === 0 ? "bg-indigo-600 text-white shadow-md" : "bg-slate-200 text-slate-500"}`}>
                      {c.name?.[0]?.toUpperCase() || "C"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-800 truncate">{c.name || "Unnamed"}</p>
                        {i === 0 && <span className="text-[8px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full uppercase">Primary</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500 font-medium">
                        <span>{c.phone || "No phone"}</span>
                        {c.email && <span className="opacity-50 truncate">{c.email}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-5 border-t border-slate-100 bg-slate-50 flex items-center gap-3 shrink-0">
          {onSelect && (
            <button onClick={() => { onSelect(site); onClose(); }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm">
              Select
            </button>
          )}
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
