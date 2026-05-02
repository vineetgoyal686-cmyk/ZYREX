import React, { useState, useEffect, useRef } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { Plus, Search, Pencil, Trash2, X, Building2, Upload, FileText, ChevronLeft, ChevronRight, Download, FileSpreadsheet, ChevronDown, Eye, Copy, Check, Trash, RotateCcw } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 15;

const emptyForm = {
  vendorName: "", email: "", contactPerson: "", mobile: "",
  gstin: "", pan: "", aadharNo: "", msmeNumber: "",
  bankName: "", accountHolder: "", accountNumber: "", ifscCode: "",
  bankBranch: "", bankCity: "", bankState: "", address: "",
  companyCodes: [], siteCodes: [],
  logo: null, logoPreview: "",
  docGst: null, docPan: null, docAadhaar: null, docCoi: null,
  docMsme: null, docCancelCheque: null, docOther: null, docOther2: null,
};

const inp = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 text-slate-700 transition-all";
const lbl = "block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider";

const DocUpload = ({ label, fieldKey, form, setForm }) => {
  const ref = useRef();
  const file = form[fieldKey];
  const urlKey = `${fieldKey}Url`;
  const existingUrl = form[urlKey];
  const hasDoc = !!file || !!existingUrl;

  const handleRemove = (e) => {
    e.stopPropagation();
    setForm(f => ({ ...f, [fieldKey]: null, [urlKey]: "" })); // "" ensures backend wipes the DB field if untouched
  };

  return (
    <div>
      <p className={lbl}>{label}</p>
      <div onClick={() => ref.current.click()}
        className={`flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-all ${
          hasDoc ? "border-indigo-200 bg-indigo-50/50 hover:border-indigo-300" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40"
        }`}>
        <FileText size={15} className={hasDoc ? "text-indigo-500" : "text-slate-300"} />
        <span className={`text-xs truncate ${hasDoc ? "text-indigo-600 font-medium" : "text-slate-400"}`}>
          {file ? file.name : (existingUrl ? "Uploaded Document" : "Click to upload")}
        </span>
        {hasDoc && (
          <button type="button" onClick={handleRemove}
            className="ml-auto text-slate-400 hover:text-red-500 transition-colors" title="Remove Document">
            <X size={14} />
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
        onChange={e => { const f = e.target.files[0]; if (f) setForm(prev => ({ ...prev, [fieldKey]: f })); e.target.value = ""; }} />
    </div>
  );
};

const COLS = [
  { label: "Vendor ID",              key: "vendorCode",     w: "w-[9%] min-w-[100px]", mono: true },
  { label: "Vendor Firm Name",       key: "vendorName",     w: "w-[22%] min-w-[180px]" },
  { label: "Company Codes",          key: "companyCodes",   w: "w-[10%] min-w-[110px]" },
  { label: "Site Codes",             key: "siteCodes",      w: "w-[8%] min-w-[80px]" },
  { label: "Email",                  key: "email",          w: "w-[18%] min-w-[160px]" },
  { label: "Contact Number",         key: "mobile",         w: "w-[12%] min-w-[120px]" },
  { label: "GST No",                 key: "gstin",          w: "w-[15%] min-w-[140px]", mono: true, copy: true },
  { label: "Profile Score",          key: "profileScore",   w: "w-[10%] min-w-[110px]" },
];

/* Profile completeness — 18 fields total, weighted equally.
   Bank section fields kept together; documents counted as a group. */
const PROFILE_FIELDS = [
  "vendorName", "address", "email", "mobile", "contactPerson",
  "gstin", "pan", "aadharNo", "msmeNumber",
  "bankName", "accountHolder", "accountNumber", "ifscCode", "bankBranch",
  "logoUrl", "docGstUrl", "docPanUrl", "docCancelChequeUrl",
];

const computeProfileScore = (v) => {
  const filled = PROFILE_FIELDS.filter(f => {
    const val = v[f];
    if (Array.isArray(val)) return val.length > 0;
    return val !== undefined && val !== null && String(val).trim() !== "";
  }).length;
  const pct = Math.round((filled / PROFILE_FIELDS.length) * 100);
  const missing = PROFILE_FIELDS.filter(f => {
    const val = v[f];
    if (Array.isArray(val)) return val.length === 0;
    return val === undefined || val === null || String(val).trim() === "";
  });
  return { pct, missing };
};

const PROFILE_LABELS = {
  vendorName: "Vendor Name", address: "Address", email: "Email", mobile: "Mobile", contactPerson: "Contact Person",
  gstin: "GST", pan: "PAN", aadharNo: "Aadhar", msmeNumber: "MSME",
  bankName: "Bank Name", accountHolder: "Account Holder", accountNumber: "Account No.", ifscCode: "IFSC", bankBranch: "Bank Branch",
  logoUrl: "Logo", docGstUrl: "GST Doc", docPanUrl: "PAN Doc", docCancelChequeUrl: "Cancelled Cheque",
};

const MODAL_TABS = [
  { key: "basic", label: "Basic Info"   },
  { key: "bank",  label: "Bank Details" },
  { key: "docs",  label: "Documents"    },
];

// Module-level cache for SWR (Stale-While-Revalidate)
let cachedVendors = null;
let cachedSites = null;
let cachedCompanies = null;

export default function VendorList() {
  const { isGlobalAdmin, canAdd, canEdit, canDelete, canExport } = useModulePermissions("vendor_list");

  const [vendors, setVendors]     = useState(cachedVendors || []);
  const [loading, setLoading]     = useState(!cachedVendors);
  const [showModal, setShowModal] = useState(false);
  const [viewVendor, setViewVendor] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [trashVendors, setTrashVendors] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);

  const fetchTrash = async () => {
    setTrashLoading(true);
    try {
      const res = await fetch(`${API}/api/procurement/vendors/trash`);
      const data = await res.json();
      setTrashVendors(data.vendors || []);
    } catch { setTrashVendors([]); }
    finally { setTrashLoading(false); }
  };

  const openTrash = () => { setShowTrash(true); fetchTrash(); };

  const handleRestore = async (id) => {
    try {
      await fetch(`${API}/api/procurement/vendors/${id}/restore`, { method: "POST" });
      showToast("Vendor restored");
      fetchTrash();
      fetchVendors(true);
    } catch { showToast("Failed to restore", "error"); }
  };

  const handlePermanentDelete = async (id, name) => {
    if (!confirm(`Permanently delete "${name}"?\n\nThis cannot be undone.`)) return;
    try {
      await fetch(`${API}/api/procurement/vendors/${id}/permanent`, { method: "DELETE" });
      showToast("Vendor permanently deleted");
      fetchTrash();
    } catch { showToast("Failed to delete", "error"); }
  };
  const [form, setForm]           = useState(emptyForm);
  const [editId, setEditId]       = useState(null);
  const [search, setSearch]       = useState("");
  const [nameFilter, setNameFilter]     = useState([]);
  const [entityFilter, setEntityFilter] = useState([]);
  const [siteFilter, setSiteFilter]     = useState([]);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [tab, setTab]             = useState("basic");
  const [page, setPage]           = useState(1);
  const [showBulk, setShowBulk]   = useState(false);
  const [bulkRows, setBulkRows]   = useState([]);
  const [bulkFile, setBulkFile]   = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [sites, setSites]         = useState(cachedSites || []);
  const [companies, setCompanies] = useState(cachedCompanies || []);
  const [showCompanySearch, setShowCompanySearch] = useState(false);
  const [showSiteSearch, setShowSiteSearch] = useState(false);
  const [copiedKey, setCopiedKey] = useState(""); // `${vendorId}:${field}`

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 1500);
    }).catch(() => showToast("Copy failed", "error"));
  };
  const logoRef                   = useRef();
  const bulkRef                   = useRef();
  const siteRef                   = useRef();
  const companyRef                = useRef();

  useEffect(() => { 
    if (!cachedVendors) fetchVendors(); else fetchVendors(true);
    if (!cachedSites) fetchSites(); else fetchSites(true);
    if (!cachedCompanies) fetchCompanies(); else fetchCompanies(true);
  }, []);

  useEffect(() => {
    const click = (e) => {
      if (siteRef.current && !siteRef.current.contains(e.target)) setShowSiteSearch(false);
      if (companyRef.current && !companyRef.current.contains(e.target)) setShowCompanySearch(false);
    };
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, []);

  const fetchSites = async (isBackground = false) => {
    try {
      const res = await fetch(`${API}/api/procurement/sites`);
      const data = await res.json();
      cachedSites = data.sites || [];
      setSites(cachedSites);
    } catch { if (!cachedSites) setSites([]); }
  };

  const fetchCompanies = async (isBackground = false) => {
    try {
      const res = await fetch(`${API}/api/procurement/companies`);
      const data = await res.json();
      cachedCompanies = data.companies || [];
      setCompanies(cachedCompanies);
    } catch { if (!cachedCompanies) setCompanies([]); }
  };

  const fetchVendors = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res  = await fetch(`${API}/api/procurement/vendors`);
      const data = await res.json();
      cachedVendors = data.vendors || [];
      setVendors(cachedVendors);
    } catch { if (!cachedVendors) setVendors([]); }
    if (!isBackground) setLoading(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openAdd = () => { setForm(emptyForm); setEditId(null); setTab("basic"); setShowModal(true); };

  const openEdit = (v) => {
    setForm({
      ...emptyForm, ...v,
      logo: null, logoPreview: v.logoUrl || "",
      docGst: null, docPan: null, docAadhaar: null, docCoi: null,
      docMsme: null, docCancelCheque: null, docOther: null, docOther2: null,
    });
    setEditId(v.id); setTab("basic"); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.vendorName.trim()) return showToast("Vendor Name required", "error");
    setSaving(true);
    try {
      const fd = new FormData();
      const currentUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
      fd.append("createdById", currentUser.id || "");
      fd.append("createdByName", currentUser.name || "");
      Object.entries(form).forEach(([k, v]) => {
        if (k === "logoPreview") return;
        if (v instanceof File) fd.append(k, v);
        else if (k === "siteCodes" || k === "companyCodes") fd.append(k, JSON.stringify(v || []));
        else if (v) fd.append(k, v);
      });
      const url    = editId ? `${API}/api/procurement/vendors/${editId}` : `${API}/api/procurement/vendors`;
      const method = editId ? "PUT" : "POST";
      const res    = await fetch(url, { method, body: fd });
      if (!res.ok) throw new Error("Save failed");
      showToast(editId ? "Vendor updated" : "Vendor added");
      setShowModal(false);
      fetchVendors();
    } catch { showToast("Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Move this vendor to Trash? You can restore it later.")) return;
    try {
      const currentUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
      await fetch(`${API}/api/procurement/vendors/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deletedById: currentUser.id || "", deletedByName: currentUser.name || "" }),
      });
      showToast("Vendor moved to trash");
      fetchVendors();
    } catch { showToast("Failed to delete", "error"); }
  };

  const forceDownload = async (url, filename) => {
    try {
      showToast("Starting download…");
      const resp = await fetch(url);
      const blob = await resp.blob();
      const objUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${filename || "Document"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  /* ── Export helpers ── */
  const EXPORT_COLS = [
    ["Vendor ID", "vendorCode"], ["Vendor Firm Name", "vendorName"], ["Company Codes", "companyCodes"], ["Site Codes", "siteCodes"], ["Email", "email"],
    ["Contact Person Name", "contactPerson"], ["Contact Person Number", "mobile"],
    ["GST No", "gstin"], ["PAN No", "pan"], ["Aadhar No", "aadharNo"],
    ["MSME Number", "msmeNumber"], ["Bank Name", "bankName"],
    ["Account Holder", "accountHolder"], ["Account Number", "accountNumber"],
    ["Bank IFSC", "ifscCode"], ["Bank Branch", "bankBranch"],
    ["Bank City", "bankCity"], ["Bank State", "bankState"], ["Address", "address"],
  ];

  const exportExcel = () => {
    const rows = filtered.map(v => Object.fromEntries(EXPORT_COLS.map(([h, k]) => {
      let val = v[k] || "";
      if (k === "siteCodes" || k === "companyCodes") val = Array.isArray(v[k]) ? v[k].join(", ") : "";
      return [h, val];
    })));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendors");
    XLSX.writeFile(wb, "vendor_list.xlsx");
    setShowExport(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(13); doc.setFont(undefined, "bold");
    doc.text("Vendor List", 14, 14);
    doc.setFontSize(8); doc.setFont(undefined, "normal");
    doc.text(`Exported: ${new Date().toLocaleDateString("en-IN")} · ${filtered.length} vendors`, 14, 20);
    autoTable(doc, {
      startY: 25,
      head: [EXPORT_COLS.map(([h]) => h)],
      body: filtered.map(v => EXPORT_COLS.map(([, k]) => {
        if (k === "siteCodes" || k === "companyCodes") return Array.isArray(v[k]) ? v[k].join(", ") : "";
        return v[k] || "";
      })),
      styles: { fontSize: 6.5, cellPadding: 2 },
      headStyles: { fillColor: [30, 27, 75], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 249, 255] },
    });
    doc.save("vendor_list.pdf");
    setShowExport(false);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{
      "Vendor Firm Name": "ABC Constructions Pvt Ltd",
      "Company Codes": "BITL, ZYX",
      "Site Codes": "SITE-001, SITE-002",
      "Email": "abc@example.com",
      "Contact Person Name": "Rajesh Kumar",
      "Contact Person Number": "9876543210",
      "GST No": "07AABCU9603R1ZV",
      "PAN No": "AABCU9603R",
      "Aadhar No": "1234 5678 9012",
      "MSME Number": "UDYAM-DL-01-0012345",
      "Bank Name": "State Bank of India",
      "Account Holder": "ABC Constructions Pvt Ltd",
      "Account Number": "1234567890",
      "Bank IFSC": "SBIN0001234",
      "Bank Branch": "Connaught Place",
      "Bank City": "New Delhi",
      "Bank State": "Delhi",
      "Address": "123 Industrial Area, Phase 2, New Delhi - 110001",
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendors");
    XLSX.writeFile(wb, "vendor_bulk_template.xlsx");
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
      const valid = data.filter(r => r["Vendor Firm Name"]);
      setBulkRows(valid);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleBulkSave = async () => {
    if (!bulkRows.length) return showToast("No valid rows to upload", "error");
    setBulkSaving(true);
    try {
      const currentUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const res = await fetch(`${API}/api/procurement/vendors/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          rows: bulkRows,
          createdById: currentUser.id || "",
          createdByName: currentUser.name || ""
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      showToast(data.skipped > 0
        ? `${data.inserted} vendors uploaded, ${data.skipped} skipped (duplicates)`
        : `${data.inserted} vendors uploaded`);
      setShowBulk(false); setBulkRows([]); setBulkFile("");
      fetchVendors();
    } catch (err) { showToast(err.message, "error"); }
    setBulkSaving(false);
  };

  const filterOptions = React.useMemo(() => {
    const names = new Set(), entities = new Set(), sites = new Set();
    vendors.forEach(v => {
      if (v.vendorName) names.add(v.vendorName);
      (v.companyCodes || []).forEach(c => c && entities.add(c));
      (v.siteCodes || []).forEach(s => s && sites.add(s));
    });
    return { names: [...names].sort(), entities: [...entities].sort(), sites: [...sites].sort() };
  }, [vendors]);

  const filtered = vendors.filter(v => {
    if (nameFilter.length && !nameFilter.includes(v.vendorName)) return false;
    if (entityFilter.length && !(v.companyCodes || []).some(c => entityFilter.includes(c))) return false;
    if (siteFilter.length && !(v.siteCodes || []).some(s => siteFilter.includes(s))) return false;
    const t = search.toLowerCase();
    if (!t) return true;
    return (
      v.vendorCode?.toLowerCase().includes(t) ||
      v.vendorName?.toLowerCase().includes(t) ||
      v.gstin?.toLowerCase().includes(t) ||
      v.email?.toLowerCase().includes(t)
    );
  });
  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="p-3 sm:p-4 lg:p-6 w-full pb-32">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg
          ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
            <Building2 size={18} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Vendor List</h1>
            <p className="text-xs text-slate-400">{vendors.length} vendors registered</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          {/* Export dropdown */}
          {canExport && (
            <div className="relative">
              <button onClick={() => { setShowExport(s => !s); setShowBulk(false); }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
                <Download size={14} /> Export <ChevronDown size={12} />
              </button>
              {showExport && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-35">
                  <button onClick={exportExcel}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                    <FileSpreadsheet size={14} className="text-green-600" /> Excel (.xlsx)
                  </button>
                  <button onClick={exportPDF}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                    <FileText size={14} className="text-red-500" /> PDF
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bulk Upload */}
          {canEdit && (
            <button onClick={() => { setShowBulk(s => !s); setShowExport(false); }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
              <Upload size={14} /> Bulk Upload
            </button>
          )}

          <button onClick={openTrash}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all" title="View deleted vendors">
            <Trash size={14} /> Trash
          </button>

          {canAdd && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all">
              <Plus size={14} /> Add Vendor
            </button>
          )}
        </div>
      </div>

      {/* Bulk Upload Panel */}
      {showBulk && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700">Bulk Upload Vendors</h3>
            <button onClick={() => { setShowBulk(false); setBulkRows([]); setBulkFile(""); }}
              className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step 1: Template */}
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <span className="text-xs font-black text-indigo-600">1</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700">Download Template</p>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">Fill in vendor details using the Excel template</p>
                <button onClick={downloadTemplate}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all">
                  <FileSpreadsheet size={13} className="text-green-600" /> Download Template
                </button>
              </div>
            </div>
            {/* Step 2: Upload */}
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <span className="text-xs font-black text-indigo-600">2</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700">Upload Filled File</p>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">Select your filled Excel file to preview</p>
                <button onClick={() => bulkRef.current.click()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all truncate max-w-full">
                  <Upload size={13} /> {bulkFile || "Choose .xlsx file"}
                </button>
                <input ref={bulkRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkFile} />
              </div>
            </div>
          </div>

          {/* Preview */}
          {bulkRows.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-600 mb-2">{bulkRows.length} vendors ready to upload</p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50">
                {bulkRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-xs">
                    <span className="text-slate-300 font-mono w-5 shrink-0">{i + 1}</span>
                    <span className="font-semibold text-slate-700 truncate">{r["Vendor Firm Name"]}</span>
                    {r["GST No"] && <span className="text-slate-400 font-mono">{r["GST No"]}</span>}
                    {r["Email"] && <span className="text-slate-400 truncate">{r["Email"]}</span>}
                  </div>
                ))}
              </div>
              <button onClick={handleBulkSave} disabled={bulkSaving}
                className="mt-3 flex items-center gap-2 px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition-all">
                <Upload size={14} />
                {bulkSaving ? "Uploading…" : `Upload ${bulkRows.length} Vendors`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col gap-2 mb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:max-w-md flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, GSTIN or email…"
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 bg-white text-slate-700" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VendorMultiFilter label="Name" options={filterOptions.names} selected={nameFilter} onChange={v => { setNameFilter(v); setPage(1); }} />
          <VendorMultiFilter label="Entity" options={filterOptions.entities} selected={entityFilter} onChange={v => { setEntityFilter(v); setPage(1); }} />
          <VendorMultiFilter label="Site" options={filterOptions.sites} selected={siteFilter} onChange={v => { setSiteFilter(v); setPage(1); }} />
          {(nameFilter.length || entityFilter.length || siteFilter.length) ? (
            <button onClick={() => { setNameFilter([]); setEntityFilter([]); setSiteFilter([]); setPage(1); }}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50">
              <X size={12} /> Clear
            </button>
          ) : null}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-300 font-bold uppercase tracking-widest text-xs">No vendors found</div>
        ) : (
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
                  {COLS.map((c, i) => {
                    const isVendorName = c.key === "vendorName";
                    return (
                      <th
                        key={c.key}
                        className={`px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap ${c.w} ${isVendorName ? "sticky left-0 z-20 bg-slate-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]" : ""}`}
                      >
                        {c.label}
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500 w-[100px] sticky right-0 z-20 bg-slate-50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginated.map((v, idx) => (
                  <tr key={v.id} className="hover:bg-slate-50/60 transition-colors divide-x divide-slate-200 group">
                    {COLS.map(c => {
                      const isVendorName = c.key === "vendorName";
                      return (
                      <td key={c.key} className={`px-4 py-3 text-slate-700 whitespace-nowrap ${c.w} ${isVendorName ? "sticky left-0 z-10 bg-white group-hover:bg-slate-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]" : ""}`}>
                        {c.key === "vendorName" ? (
                          <span className="font-semibold text-slate-800 break-words whitespace-normal">{v[c.key] || "—"}</span>
                        ) : c.key === "siteCodes" || c.key === "companyCodes" ? (
                          <div className="flex flex-wrap gap-1">
                            {v[c.key]?.filter(Boolean).length > 0 ? (
                              v[c.key].filter(Boolean).map((sc, i) => (
                                <span key={i} className={`px-1.5 py-0.5 text-[10px] font-bold rounded border uppercase tracking-tight ${
                                  c.key === "companyCodes"
                                    ? "bg-blue-50 text-blue-700 border-blue-100"
                                    : "bg-purple-50 text-purple-600 border-purple-100"
                                }`}>
                                  {sc}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </div>
                        ) : c.key === "profileScore" ? (
                          (() => {
                            const { pct, missing } = computeProfileScore(v);
                            const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
                            const textColor = pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-600";
                            const tooltip = missing.length === 0
                              ? "Profile complete"
                              : "Missing: " + missing.map(m => PROFILE_LABELS[m] || m).join(", ");
                            return (
                              <div className="flex flex-col gap-1" title={tooltip}>
                                <span className={`text-xs font-bold tabular-nums ${textColor}`}>{pct}%</span>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })()
                        ) : c.copy && v[c.key] ? (
                          (() => {
                            const key = `${v.id}:${c.key}`;
                            const isCopied = copiedKey === key;
                            return (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(v[c.key], key)}
                                title={isCopied ? "Copied!" : "Click to copy"}
                                className={`group inline-flex items-center gap-1.5 font-mono text-xs px-1.5 py-1 -mx-1.5 -my-1 rounded hover:bg-slate-100 transition-colors ${isCopied ? "text-emerald-600" : "text-slate-700"}`}>
                                <span className="break-words whitespace-normal text-left">{v[c.key]}</span>
                                {isCopied
                                  ? <Check size={12} className="shrink-0" />
                                  : <Copy size={11} className="shrink-0 text-slate-300 group-hover:text-slate-500 transition-colors" />}
                              </button>
                            );
                          })()
                        ) : (
                          <span className={`${c.mono ? "font-mono text-xs" : "text-sm"} ${!v[c.key] ? "text-slate-300" : ""} break-words whitespace-normal`}>
                            {v[c.key] || "—"}
                          </span>
                        )}
                      </td>
                      );
                    })}
                    <td className="px-4 py-3 sticky right-0 z-10 bg-white group-hover:bg-slate-50 w-[100px] shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setViewVendor(v)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="View Details">
                          <Eye size={13} />
                        </button>
                        {canEdit && (
                          <button onClick={() => openEdit(v)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                            <Pencil size={13} />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(v.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-400">{filtered.length} vendors · Page {page} of {totalPages}</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
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
                    <button key={n} onClick={() => setPage(n)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                        ${page === n ? "bg-slate-900 text-white border-slate-900" : "text-slate-600 border-slate-200 hover:bg-white"}`}>
                      {n}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h2 className="text-base font-bold text-slate-800">{editId ? "Edit Vendor" : "Add Vendor"}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-6 shrink-0">
              {MODAL_TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px
                    ${tab === t.key ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* BASIC TAB */}
              {tab === "basic" && (
                <div className="space-y-4">
                  {/* Logo */}
                  <div>
                    <label className={lbl}>Vendor Logo</label>
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden shrink-0">
                        {form.logoPreview
                          ? <img src={form.logoPreview} alt="" className="w-full h-full object-contain p-1" />
                          : <Building2 size={20} className="text-slate-300" />}
                      </div>
                      <button type="button" onClick={() => logoRef.current.click()}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-all">
                        <Upload size={12} /> Upload Logo
                      </button>
                      <input ref={logoRef} type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files[0]; if (f) setForm(p => ({ ...p, logo: f, logoPreview: URL.createObjectURL(f) })); }} />
                    </div>
                  </div>

                  <div>
                    <label className={lbl}>Vendor Firm Name <span className="text-red-400 normal-case">*</span></label>
                    <input className={inp} value={form.vendorName}
                      onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))}
                      placeholder="e.g. Ojo Technologies Pvt Ltd" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Contact Person Name</label>
                      <input className={inp} value={form.contactPerson}
                        onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))}
                        placeholder="Full name" />
                    </div>
                    <div>
                      <label className={lbl}>Contact Person Number</label>
                      <input className={inp} value={form.mobile}
                        onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))}
                        placeholder="10-digit number" />
                    </div>
                    <div className="col-span-2">
                      <label className={lbl}>Email</label>
                      <input className={inp} type="email" value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="vendor@email.com" />
                    </div>
                    <div>
                      <label className={lbl}>GST No</label>
                      <input className={`${inp} font-mono`} value={form.gstin}
                        onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                        placeholder="15-digit GSTIN" />
                    </div>
                    <div>
                      <label className={lbl}>PAN No</label>
                      <input className={`${inp} font-mono`} value={form.pan}
                        onChange={e => setForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))}
                        placeholder="ABCDE1234F" />
                    </div>
                    <div>
                      <label className={lbl}>Aadhar No</label>
                      <input className={`${inp} font-mono`} value={form.aadharNo}
                        onChange={e => setForm(f => ({ ...f, aadharNo: e.target.value.replace(/\D/g, "") }))}
                        placeholder="12-digit Aadhar" maxLength={12} />
                    </div>
                    <div>
                      <label className={lbl}>MSME Number</label>
                      <input className={inp} value={form.msmeNumber}
                        onChange={e => setForm(f => ({ ...f, msmeNumber: e.target.value }))}
                        placeholder="MSME Reg. No. (if any)" />
                    </div>

                    <div className="col-span-2 relative" ref={companyRef}>
                      <label className={lbl}>Associated Company Codes</label>
                      <div onClick={() => setShowCompanySearch(!showCompanySearch)}
                        className={`min-h-[42px] border border-slate-200 rounded-xl px-3 py-2 text-sm flex flex-wrap gap-1 cursor-pointer transition-all ${showCompanySearch ? "ring-2 ring-indigo-50 border-indigo-400" : "hover:border-slate-300"}`}>
                        {form.companyCodes.filter(Boolean).length === 0 ? (
                          <span className="text-slate-400 py-0.5">Select companies...</span>
                        ) : (
                          form.companyCodes.filter(Boolean).map(cc => (
                            <span key={cc} className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg text-xs font-semibold border border-blue-100 group">
                              {cc}
                              <X size={12} className="text-blue-300 group-hover:text-red-500" onClick={(e) => {
                                e.stopPropagation();
                                setForm(f => ({ ...f, companyCodes: f.companyCodes.filter(x => x !== cc) }));
                              }} />
                            </span>
                          ))
                        )}
                      </div>

                      {showCompanySearch && (
                        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                          <div className="py-1">
                            {companies.length === 0 ? (
                              <div className="px-4 py-3 text-xs text-slate-400 italic">No companies found...</div>
                            ) : (
                              companies.map(c => {
                                const isSel = form.companyCodes.includes(c.companyCode);
                                return (
                                  <div key={c.id} onClick={() => {
                                    setForm(f => {
                                      const newCodes = isSel ? f.companyCodes.filter(x => x !== c.companyCode) : [...f.companyCodes, c.companyCode];
                                      return { ...f, companyCodes: newCodes };
                                    });
                                  }}
                                  className={`px-4 py-2.5 text-xs flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors ${isSel ? "bg-blue-50/70 text-blue-700 font-bold" : "text-slate-600"}`}>
                                    <span>{c.companyCode} <span className="text-slate-400 font-normal ml-1">- {c.companyName}</span></span>
                                    {isSel && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="col-span-2 relative" ref={siteRef}>
                      <label className={lbl}>Associated Site Codes</label>
                      <div onClick={() => setShowSiteSearch(!showSiteSearch)}
                        className={`min-h-[42px] border border-slate-200 rounded-xl px-3 py-2 text-sm flex flex-wrap gap-1 cursor-pointer transition-all ${showSiteSearch ? "ring-2 ring-indigo-50 border-indigo-400" : "hover:border-slate-300"}`}>
                        {form.siteCodes.length === 0 ? (
                          <span className="text-slate-400 py-0.5">Select sites…</span>
                        ) : (
                          form.siteCodes.map(sc => (
                            <span key={sc} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg text-xs font-semibold border border-indigo-100 group">
                              {sc}
                              <X size={12} className="text-indigo-300 group-hover:text-red-500" onClick={(e) => {
                                e.stopPropagation();
                                setForm(f => ({ ...f, siteCodes: f.siteCodes.filter(x => x !== sc) }));
                              }} />
                            </span>
                          ))
                        )}
                      </div>
                      
                      {showSiteSearch && (
                        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                          <div className="sticky top-0 bg-white p-2 border-b border-slate-50">
                            <input autoFocus placeholder="Search site code…" 
                              className="w-full text-xs font-semibold border-none outline-none px-2 py-1 text-slate-600"
                              onClick={(e) => e.stopPropagation()} 
                              onChange={(e) => {
                                // Search functionality handled by list filtering
                              }}
                            />
                          </div>
                          <div className="py-1">
                            {sites.length === 0 ? (
                              <div className="px-4 py-3 text-xs text-slate-400 italic">No sites found…</div>
                            ) : (
                              sites.map(s => {
                                const isSel = form.siteCodes.includes(s.siteCode);
                                return (
                                  <div key={s.id} onClick={() => {
                                    setForm(f => {
                                      const newCodes = isSel ? f.siteCodes.filter(x => x !== s.siteCode) : [...f.siteCodes, s.siteCode];
                                      return { ...f, siteCodes: newCodes };
                                    });
                                  }}
                                  className={`px-4 py-2.5 text-xs flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors ${isSel ? "bg-indigo-50/50 text-indigo-700 font-bold" : "text-slate-600"}`}>
                                    <span>{s.siteCode} <span className="text-slate-400 font-normal ml-1">— {s.siteName}</span></span>
                                    {isSel && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className={lbl}>Address</label>
                      <textarea className={`${inp} resize-none`} rows={2} value={form.address}
                        onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                        placeholder="Full address" />
                    </div>
                  </div>
                </div>
              )}

              {/* BANK TAB */}
              {tab === "bank" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className={lbl}>Bank Name</label>
                    <input className={inp} value={form.bankName}
                      onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                      placeholder="e.g. HDFC Bank" />
                  </div>
                  <div className="col-span-2">
                    <label className={lbl}>Account Holder Name</label>
                    <input className={inp} value={form.accountHolder}
                      onChange={e => setForm(f => ({ ...f, accountHolder: e.target.value }))}
                      placeholder="Name as per bank records" />
                  </div>
                  <div className="col-span-2">
                    <label className={lbl}>Account Number</label>
                    <input className={`${inp} font-mono`} value={form.accountNumber}
                      onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))}
                      placeholder="Account number" />
                  </div>
                  <div>
                    <label className={lbl}>IFSC Code</label>
                    <input className={`${inp} font-mono`} value={form.ifscCode}
                      onChange={e => setForm(f => ({ ...f, ifscCode: e.target.value.toUpperCase() }))}
                      placeholder="e.g. HDFC0002649" />
                  </div>
                  <div>
                    <label className={lbl}>Bank Branch</label>
                    <input className={inp} value={form.bankBranch}
                      onChange={e => setForm(f => ({ ...f, bankBranch: e.target.value }))}
                      placeholder="Branch name" />
                  </div>
                  <div>
                    <label className={lbl}>Bank City</label>
                    <input className={inp} value={form.bankCity}
                      onChange={e => setForm(f => ({ ...f, bankCity: e.target.value }))}
                      placeholder="City" />
                  </div>
                  <div>
                    <label className={lbl}>Bank State</label>
                    <input className={inp} value={form.bankState}
                      onChange={e => setForm(f => ({ ...f, bankState: e.target.value }))}
                      placeholder="State" />
                  </div>
                </div>
              )}

              {/* DOCS TAB */}
              {tab === "docs" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <DocUpload label="Aadhar Card"                  fieldKey="docAadhaar"      form={form} setForm={setForm} />
                    <DocUpload label="PAN Card"                     fieldKey="docPan"          form={form} setForm={setForm} />
                    <DocUpload label="GST Certificate"              fieldKey="docGst"          form={form} setForm={setForm} />
                    <DocUpload label="MSME Certificate"             fieldKey="docMsme"         form={form} setForm={setForm} />
                    <DocUpload label="Cancel Cheque"                fieldKey="docCancelCheque" form={form} setForm={setForm} />
                    <DocUpload label="Certificate of Incorporation" fieldKey="docCoi"          form={form} setForm={setForm} />
                  </div>

                  {/* Other Documents — max 2 */}
                    <div className="border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className={lbl + " mb-0"}>Other Documents <span className="text-slate-300 normal-case font-normal">(max 2)</span></p>
                        {(!(form.docOther || form.docOtherUrl) || !(form.docOther2 || form.docOther2Url)) && (
                          <button type="button"
                            onClick={() => {
                              const ref = document.getElementById("otherDocInput");
                              if (ref) ref.click();
                            }}
                            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition-all border border-indigo-200">
                            <Plus size={12} /> Add File
                          </button>
                        )}
                        <input id="otherDocInput" type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                          onChange={e => {
                            const f = e.target.files[0];
                            if (!f) return;
                            e.target.value = "";
                            if (!form.docOther && !form.docOtherUrl) setForm(p => ({ ...p, docOther: f }));
                            else if (!form.docOther2 && !form.docOther2Url) setForm(p => ({ ...p, docOther2: f }));
                          }} />
                      </div>
                      <div className="space-y-2">
                        {[{ key: "docOther", label: "Doc 1" }, { key: "docOther2", label: "Doc 2" }].map(({ key, label }) => {
                          const file = form[key];
                          const url = form[`${key}Url`];
                          if (!file && !url) return null;
                          return (
                            <div key={key} className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5">
                              <FileText size={14} className="text-indigo-500 shrink-0" />
                              <span className="text-xs font-medium text-indigo-700 truncate flex-1">
                                {file ? file.name : "Uploaded Document"}
                              </span>
                              <button type="button" onClick={() => setForm(p => ({ ...p, [key]: null, [`${key}Url`]: "" }))}
                                className="text-slate-400 hover:text-red-400 shrink-0"><X size={13} /></button>
                            </div>
                          );
                        })}
                        {!(form.docOther || form.docOtherUrl) && !(form.docOther2 || form.docOther2Url) && (
                          <p className="text-xs text-slate-300 text-center py-3">No files added yet</p>
                        )}
                      </div>
                    </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
              <div className="flex gap-1.5">
                {MODAL_TABS.map(t => (
                  <span key={t.key} className={`h-1.5 rounded-full transition-all ${tab === t.key ? "w-5 bg-indigo-600" : "w-1.5 bg-slate-200"}`} />
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                  {saving ? "Saving…" : editId ? "Update" : "Add Vendor"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW MODAL ── */}
      {showTrash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                  <Trash size={16} className="text-red-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Vendor Trash</h2>
                  <p className="text-[11px] text-slate-500">{trashVendors.length} deleted vendor(s) — restore or delete permanently</p>
                </div>
              </div>
              <button onClick={() => setShowTrash(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
              {trashLoading ? (
                <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
              ) : trashVendors.length === 0 ? (
                <div className="py-16 text-center">
                  <Trash size={32} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-sm font-bold text-slate-400">Trash is empty</p>
                  <p className="text-xs text-slate-400 mt-1">Deleted vendors will appear here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {trashVendors.map(v => {
                    const d = v.deletedAt ? new Date(v.deletedAt) : null;
                    const dateStr = d && !isNaN(d.getTime())
                      ? `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} at ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`
                      : "";
                    return (
                      <div key={v.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-[11px] text-slate-500">{v.vendorCode}</span>
                            <span className="font-bold text-sm text-slate-800 truncate">{v.vendorName}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">{v.email || "—"} · {v.mobile || "—"}</p>
                          {dateStr && (
                            <p className="text-[11px] text-red-500 mt-1">
                              Deleted by <span className="font-semibold">{v.deletedByName || "—"}</span> on <span className="font-semibold">{dateStr}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => handleRestore(v.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-all">
                            <RotateCcw size={12} /> Restore
                          </button>
                          <button onClick={() => handlePermanentDelete(v.id, v.vendorName)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition-all">
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {viewVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex flex-col gap-0.5 min-w-0">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Building2 size={18} className="text-indigo-600 shrink-0" />
                  <span className="truncate">{viewVendor.vendorName}</span>
                </h2>
                {(viewVendor.createdByName || viewVendor.createdAt) && (
                  <p className="text-[11px] text-slate-500 ml-7">
                    Registered by <span className="font-semibold text-slate-700">{viewVendor.createdByName || "—"}</span>
                    {viewVendor.createdAt && (() => {
                      const d = new Date(viewVendor.createdAt);
                      if (isNaN(d.getTime())) return null;
                      const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                      const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
                      return <> on <span className="font-semibold text-slate-700">{date}</span> at <span className="font-semibold text-slate-700">{time}</span></>;
                    })()}
                  </p>
                )}
              </div>
              <button onClick={() => setViewVendor(null)} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                <X size={18} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 bg-slate-50">
              
              {/* Basic Details */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-50">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <Building2 size={16} className="text-indigo-500" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700">Basic Information</h3>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Contact Person</p>
                    <p className="text-sm font-semibold text-slate-700 break-words">{viewVendor.contactPerson || "—"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Mobile</p>
                    <p className="text-sm font-semibold text-slate-700 break-words">{viewVendor.mobile || "—"}</p>
                  </div>
                  <div className="col-span-2 bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Email</p>
                    <p className="text-sm font-semibold text-slate-700 break-words">{viewVendor.email || "—"}</p>
                  </div>
                  <div className="col-span-full bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Address</p>
                    <p className="text-sm font-semibold text-slate-700">{viewVendor.address || "—"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">GST NO</p>
                    <p className="text-sm font-bold text-indigo-700 font-mono break-all sm:break-words">{viewVendor.gstin || "—"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">PAN NO</p>
                    <p className="text-sm font-bold text-indigo-700 font-mono break-all sm:break-words">{viewVendor.pan || "—"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Aadhar NO</p>
                    <p className="text-sm font-semibold text-slate-700 font-mono break-words">{viewVendor.aadharNo || "—"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">MSME NO</p>
                    <p className="text-sm font-semibold text-slate-700 break-words">{viewVendor.msmeNumber || "—"}</p>
                  </div>
                  <div className="col-span-full bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Associated Company Codes</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {viewVendor.companyCodes?.length > 0 ? (
                        viewVendor.companyCodes.map((cc, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded border border-blue-200 uppercase tracking-tight">
                            {cc}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400 font-medium italic">No companies associated</span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-full bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Associated Site Codes</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {viewVendor.siteCodes?.length > 0 ? (
                        viewVendor.siteCodes.map((sc, i) => (
                          <span key={i} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-bold rounded border border-purple-200 uppercase tracking-tight">
                            {sc}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400 font-medium italic">No sites associated</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-50">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <span className="text-emerald-500 font-serif font-bold text-sm">₹</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-700">Bank Details</h3>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="col-span-2 bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Bank Name</p>
                    <p className="text-sm font-semibold text-slate-700 break-words">{viewVendor.bankName || "—"}</p>
                  </div>
                  <div className="col-span-2 bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Account Holder</p>
                    <p className="text-sm font-semibold text-slate-700 break-words">{viewVendor.accountHolder || "—"}</p>
                  </div>
                  <div className="col-span-2 bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Account No</p>
                    <p className="text-sm font-bold text-emerald-700 font-mono break-all sm:break-words">{viewVendor.accountNumber || "—"}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-1 bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">IFSC Code</p>
                    <p className="text-sm font-bold text-emerald-700 font-mono break-all sm:break-words">{viewVendor.ifscCode || "—"}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-1 bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Branch</p>
                    <p className="text-sm font-semibold text-slate-700 break-words">{viewVendor.bankBranch || "—"}</p>
                  </div>
                </div>
              </div>

              {/* Documents */}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-50">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                      <FileText size={16} className="text-orange-500" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-700">Documents Attached</h3>
                  </div>
                  
                  {/* Download All Button */}
                  <button onClick={() => {
                    const docs = [
                      { label: "Aadhar", url: viewVendor.docAadhaarUrl },
                      { label: "PAN Card", url: viewVendor.docPanUrl },
                      { label: "GST Certificate", url: viewVendor.docGstUrl },
                      { label: "MSME", url: viewVendor.docMsmeUrl },
                      { label: "Cancel Cheque", url: viewVendor.docCancelChequeUrl },
                      { label: "COI", url: viewVendor.docCoiUrl },
                      { label: "Other Doc 1", url: viewVendor.docOtherUrl },
                      { label: "Other Doc 2", url: viewVendor.docOther2Url },
                    ].filter(d => d.url);
                    if (docs.length > 0) {
                      docs.forEach((doc, idx) => {
                        setTimeout(() => forceDownload(doc.url, doc.label), idx * 800);
                      });
                    }
                  }} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-100 text-slate-600 rounded-lg text-xs font-bold transition-all">
                    <Download size={13} className="text-indigo-500" /> Download All
                  </button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Aadhar", url: viewVendor.docAadhaarUrl },
                    { label: "PAN Card", url: viewVendor.docPanUrl },
                    { label: "GST Certificate", url: viewVendor.docGstUrl },
                    { label: "MSME", url: viewVendor.docMsmeUrl },
                    { label: "Cancel Cheque", url: viewVendor.docCancelChequeUrl },
                    { label: "COI", url: viewVendor.docCoiUrl },
                    { label: "Other Doc 1", url: viewVendor.docOtherUrl },
                    { label: "Other Doc 2", url: viewVendor.docOther2Url },
                  ].map((doc, idx) => doc.url ? (
                    <div key={idx} onClick={() => window.open(doc.url, "_blank")}
                       className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
                       
                       <div className="h-28 w-full bg-slate-50 border-b border-slate-100 relative overflow-hidden pointer-events-none">
                         {doc.url.match(/\.(jpeg|jpg|png|gif|webp)$/i) ? (
                           <img src={doc.url} alt="" className="w-full h-full object-cover" />
                         ) : (
                           <div className="absolute inset-0 right-[-30px] bottom-[-30px]">
                             <iframe src={`${doc.url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`} 
                               scrolling="no" 
                               className="w-[150%] h-[150%] scale-[0.66] origin-top-left border-none pointer-events-none" />
                           </div>
                         )}
                         <div className="absolute inset-0 bg-transparent group-hover:bg-indigo-50/10 z-10 transition-colors" />
                       </div>

                       <div className="flex items-center justify-between p-2.5 bg-white">
                         <div className="flex items-center gap-2 pr-2 min-w-0">
                           <FileText size={14} className="text-indigo-500 shrink-0" />
                           <span className="text-[11px] font-bold text-slate-700 truncate">{doc.label}</span>
                         </div>
                         <button onClick={(e) => { e.stopPropagation(); forceDownload(doc.url, doc.label); }} 
                           className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors shrink-0" title="Download Document">
                           <Download size={14} />
                         </button>
                       </div>
                    </div>
                  ) : null)}
                  
                  {![viewVendor.docAadhaarUrl, viewVendor.docPanUrl, viewVendor.docGstUrl, viewVendor.docMsmeUrl, viewVendor.docCancelChequeUrl, viewVendor.docCoiUrl, viewVendor.docOtherUrl, viewVendor.docOther2Url].some(u => !!u) && (
                    <p className="text-sm text-slate-400 italic col-span-2">No documents uploaded.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VendorMultiFilter({ label, options, selected, onChange }) {
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
      <button onClick={() => setOpen(o => !o)}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold shadow-sm transition ${selected.length ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-black text-white">{selected.length}</span>
        )}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 p-2">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2">
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
                  <button key={opt} onClick={() => toggle(opt)}
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
              <button onClick={() => onChange([])} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
