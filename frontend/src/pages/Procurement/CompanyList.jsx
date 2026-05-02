import React, { useState, useEffect, useMemo, useRef } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { Plus, Search, Pencil, Trash2, X, Landmark, Eye, Image, Download, FileSpreadsheet, FileText, ChevronDown } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

// SWR Cache
let cachedCompanies = null;
const preloadedCompanyImageUrls = new Set();

const imgUrl = (url) => url || "";

const preloadCompanyImages = (company) => {
  if (typeof window === "undefined" || !company) return;
  [company.logoUrl, company.stampUrl, company.signUrl].filter(Boolean).forEach((url) => {
    if (preloadedCompanyImageUrls.has(url)) return;
    preloadedCompanyImageUrls.add(url);
    const img = new window.Image();
    img.decoding = "async";
    img.src = url;
  });
};

const DeferredImage = ({ src, alt, className }) => {
  const [activeSrc, setActiveSrc] = useState("");

  useEffect(() => {
    if (!src) {
      setActiveSrc("");
      return undefined;
    }

    let cancelled = false;
    const showImage = () => {
      if (!cancelled) setActiveSrc(src);
    };

    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      const frame = window.requestAnimationFrame(() => window.setTimeout(showImage, 0));
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frame);
      };
    }

    const timer = setTimeout(showImage, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [src]);

  if (!activeSrc) return null;
  return <img src={activeSrc} alt={alt} className={className} loading="lazy" decoding="async" />;
};


const ACCEPT = "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp,image/svg+xml,image/tiff";

const TABS = [
  { key: "basic",  label: "Basic Info" },
  { key: "images", label: "Images"     },
];

/* ── Form field ── */
const Field = ({ label, value, onChange, placeholder, mono, span2, textarea }) => (
  <div className={span2 ? "col-span-2" : ""}>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{label}</label>
    {textarea ? (
      <textarea value={value} onChange={onChange} rows={2} placeholder={placeholder}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700 resize-none" />
    ) : (
      <input value={value} onChange={onChange} placeholder={placeholder}
        className={`w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700 ${mono ? "font-mono" : ""}`} />
    )}
  </div>
);

const emptyForm = {
  companyName: "", companyCode: "", personName: "", designation: "",
  phone: "", email: "", gstin: "", pan: "", pincode: "", state: "", district: "", address: "",
  logo: null, logoPreview: "",
  stamp: null, stampPreview: "",
  sign: null, signPreview: "",
};

/* ── Single image upload box ── */
const ImgUpload = ({ label, fieldKey, previewKey, form, setForm }) => {
  const ref = useRef();
  const preview = form[previewKey];
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">{label}</p>
      <div className="flex flex-col items-center gap-3">
        <div
          onClick={() => ref.current.click()}
          className="w-full h-32 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-all overflow-hidden bg-slate-50 relative group"
        >
          {preview ? (
            <>
              <img src={preview} alt={label} className="max-h-full max-w-full object-contain p-2" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                <span className="text-white text-xs font-semibold">Change</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-slate-300">
              <Image size={24} />
              <span className="text-xs">Click to upload</span>
            </div>
          )}
        </div>
        {preview && (
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, [fieldKey]: null, [previewKey]: "" }))}
            className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
          >
            <X size={11} /> Remove
          </button>
        )}
      </div>
      <input
        ref={ref} type="file" accept={ACCEPT} className="hidden"
        onChange={e => {
          const file = e.target.files[0];
          if (file) setForm(prev => ({ ...prev, [fieldKey]: file, [previewKey]: URL.createObjectURL(file) }));
          e.target.value = "";
        }}
      />
    </div>
  );
};


export default function CompanyList() {
  const { isGlobalAdmin, canAdd, canEdit, canDelete, canExport } = useModulePermissions("company_list");

  const [companies, setCompanies] = useState(cachedCompanies || []);
  const [loading, setLoading]     = useState(!cachedCompanies);
  const [showModal, setShowModal] = useState(false);
  const [showView, setShowView]   = useState(false);
  const [viewData, setViewData]   = useState(null);
  const [form, setForm]           = useState(emptyForm);
  const [editId, setEditId]       = useState(null);
  const [search, setSearch]       = useState("");
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [tab, setTab]             = useState("basic");
  const [page, setPage]           = useState(1);
  const [perPage, setPerPage]     = useState(10);
  const [jumpInput, setJumpInput] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef();

  useEffect(() => { 
    if (!cachedCompanies) fetchCompanies(); else fetchCompanies(true); 
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchCompanies = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res  = await fetch(`${API}/api/procurement/companies`);
      const data = await res.json();
      cachedCompanies = data.companies || [];
      setCompanies(cachedCompanies);
    } catch { if (!cachedCompanies) setCompanies([]); }
    if (!isBackground) setLoading(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setEditIdx(null);
    setTab("basic");
    setShowModal(true);
  };

  const openEdit = (c) => {
    setForm({
      ...emptyForm, ...c,
      logo: null, logoPreview: imgUrl(c.logoUrl)   || "",
      stamp: null, stampPreview: imgUrl(c.stampUrl) || "",
      sign: null, signPreview: imgUrl(c.signUrl)   || "",
    });
    setEditId(c.id);
    setTab("basic");
    setShowModal(true);
  };

  const openView = (c) => {
    preloadCompanyImages(c);
    setViewData(c);
    setShowView(true);
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) return showToast("Company Name required", "error");
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (["logoPreview", "stampPreview", "signPreview"].includes(k)) return;
        if (v instanceof File) fd.append(k, v);
        else if (v !== null && v !== undefined) fd.append(k, v);
      });
      const url    = editId ? `${API}/api/procurement/companies/${editId}` : `${API}/api/procurement/companies`;
      const method = editId ? "PUT" : "POST";
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      fd.append("createdById", u.id || "");
      fd.append("createdByName", u.name || "");
      const res  = await fetch(url, { method, body: fd });
      const data = await res.json();
      if (!res.ok || data.error) { showToast(data.error || "Failed to save", "error"); setSaving(false); return; }
      showToast(editId ? "Company updated" : "Company added");
      setShowModal(false);
      fetchCompanies();
    } catch { showToast("Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (c) => {
    if (!confirm("Delete this company?")) return;
    try {
      await fetch(`${API}/api/procurement/companies/${c.id}`, { method: "DELETE" });
      showToast("Company deleted");
      fetchCompanies();
    } catch { showToast("Failed to delete", "error"); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(c =>
      c.companyName?.toLowerCase().includes(q) ||
      c.companyCode?.toLowerCase().includes(q) ||
      c.gstin?.toLowerCase().includes(q) ||
      c.personName?.toLowerCase().includes(q) ||
      c.designation?.toLowerCase().includes(q)
    );
  }, [companies, search]);
  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const paginated  = useMemo(() => filtered.slice((page - 1) * perPage, page * perPage), [filtered, page, perPage]);

  const exportExcel = () => {
    const data = filtered.map((c, i) => ({
      "S.No": i + 1,
      "Company Name": c.companyName,
      "Code": c.companyCode,
      "Person Name": c.personName,
      "Designation": c.designation,
      "Phone": c.phone,
      "Email": c.email,
      "GSTIN": c.gstin,
      "PAN": c.pan,
      "Pincode": c.pincode,
      "State": c.state,
      "District": c.district,
      "Address": c.address,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Companies");
    XLSX.writeFile(wb, "company_list.xlsx");
    setShowExportMenu(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Company List", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${filtered.length} companies   |   Exported: ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4);
    doc.line(14, 26, pageW - 14, 26);
    autoTable(doc, {
      startY: 30,
      head: [["S.No", "Company Name", "Code", "Person Name", "Designation", "Phone", "Email", "GSTIN", "PAN", "Pincode", "State", "District", "Address"]],
      body: filtered.map((c, i) => [i + 1, c.companyName, c.companyCode, c.personName, c.designation, c.phone, c.email, c.gstin, c.pan, c.pincode, c.state, c.district, c.address]),
      tableWidth: pageW - 28,
      styles: { fontSize: 7, cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }, valign: "top", lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85], overflow: "linebreak" },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7, halign: "left", lineColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 35 }, 2: { cellWidth: 15 }, 3: { cellWidth: 25 }, 4: { cellWidth: 25 }, 12: { cellWidth: "auto" } },
      didDrawPage: (data) => {
        const pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
        doc.text("BMS — Company List", 14, doc.internal.pageSize.getHeight() - 8);
      },
    });
    doc.save("company_list.pdf");
    setShowExportMenu(false);
  };



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
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
            <Landmark size={20} className="text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Company List</h1>
            <p className="text-sm text-slate-400">Global — Buyer company details for PO</p>
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
                <Plus size={15} /> Add Company
              </button>
            )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name, code or GSTIN…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-400 bg-white text-slate-700" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 flex items-center justify-center">
          <p className="text-slate-300 font-bold uppercase tracking-widest text-xs">No companies found</p>
        </div>
      ) : (
        <div className="rounded-none border border-slate-200 shadow-sm overflow-hidden max-w-full">
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[1500px] text-sm border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="sticky left-0 z-30 bg-slate-800 px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-center w-[45px] min-w-[45px]">S.No</th>
                  <th className="sticky left-[45px] z-30 bg-slate-800 px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-left w-[140px] min-w-[140px]">Company Name</th>
                  <th className="sticky left-[185px] z-30 bg-slate-800 px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-left w-[100px] min-w-[100px]">Code</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-left min-w-36">Person Name</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-left w-32">Designation</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-left w-28">Phone</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-left min-w-36">Email</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-left min-w-36">GSTIN</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-left w-28">PAN</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-center w-20">Pincode</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-left w-24">State</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-left w-28">District</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide border-r border-slate-700 text-left min-w-52 whitespace-normal break-words leading-tight">Address</th>
                  <th className="sticky right-0 z-30 bg-slate-800 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-center w-[100px] min-w-[100px] border-l border-slate-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((c, idx) => {
                  const even = idx % 2 === 0;
                  const rowBg    = even ? "bg-white"   : "bg-slate-50";
                  return (
                  <tr key={c.id || idx} className={`transition-colors ${rowBg} hover:bg-emerald-50 group`}>
                    {/* sticky S.No */}
                    <td className={`sticky left-0 z-20 ${rowBg} group-hover:bg-emerald-50 px-3 py-3 text-slate-400 text-xs border-r border-b border-slate-200 text-center align-middle font-medium w-[45px] min-w-[45px]`}>{(page - 1) * perPage + idx + 1}</td>
                    {/* sticky Company Name */}
                    <td className={`sticky left-[45px] z-20 ${rowBg} group-hover:bg-emerald-50 px-3 py-3 border-r border-b border-slate-200 align-middle w-[140px] min-w-[140px]`}>
                      <span className="font-semibold text-slate-800 text-xs leading-snug whitespace-normal break-words">{c.companyName}</span>
                    </td>
                    {/* sticky Company Code */}
                    <td className={`sticky left-[185px] z-20 ${rowBg} group-hover:bg-emerald-50 px-3 py-3 border border-slate-200 align-middle w-[100px] min-w-[100px]`}>
                      <span className="inline-block px-2 py-0.5 bg-green-50 text-green-700 rounded-lg text-xs font-mono font-semibold whitespace-nowrap">{c.companyCode}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600 text-xs border border-slate-200 align-middle whitespace-normal break-words">{c.personName || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-3 text-slate-600 text-xs border border-slate-200 align-middle whitespace-normal break-words">{c.designation || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-3 text-slate-600 text-xs border border-slate-200 align-middle whitespace-nowrap">{c.phone || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-3 text-slate-600 text-xs border border-slate-200 align-middle whitespace-normal break-words">{c.email || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-3 text-slate-600 text-xs font-mono border border-slate-200 align-middle whitespace-nowrap">{c.gstin}</td>
                    <td className="px-3 py-3 text-slate-600 text-xs font-mono border border-slate-200 align-middle whitespace-nowrap">{c.pan}</td>
                    <td className="px-3 py-3 text-slate-600 text-xs border border-slate-200 align-middle text-center">{c.pincode}</td>
                    <td className="px-3 py-3 text-slate-600 text-xs border border-slate-200 align-middle whitespace-normal break-words">{c.state}</td>
                    <td className="px-3 py-3 text-slate-600 text-xs border border-slate-200 align-middle whitespace-normal break-words">{c.district}</td>
                    <td className="px-3 py-3 text-slate-500 text-xs border border-slate-200 align-top leading-relaxed min-w-52 whitespace-normal break-words">{c.address}</td>
                    {/* sticky Action */}
                    <td className={`sticky right-0 z-20 ${rowBg} group-hover:bg-emerald-50 px-3 py-3 border-l border-b border-slate-200 align-middle w-[100px] min-w-[100px]`}>
                      <div className="flex items-center gap-1 justify-center">
                        <button onMouseEnter={() => preloadCompanyImages(c)} onFocus={() => preloadCompanyImages(c)} onClick={() => openView(c)} title="View"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-all">
                          <Eye size={13} />
                        </button>
                        {canEdit && (
                          <button onClick={() => openEdit(c)} title="Edit"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                            <Pencil size={13} />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(c)} title="Delete"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">{filtered.length} compan{filtered.length !== 1 ? "ies" : "y"} · Page {page} of {totalPages}</p>
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

      {/* ── ADD / EDIT MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h2 className="text-base font-bold text-slate-800">{editId ? "Edit Company" : "Add Company"}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-6 shrink-0">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide transition-all border-b-2 -mb-px
                    ${tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* BASIC INFO TAB */}
              {tab === "basic" && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Company Name *" value={form.companyName}
                    onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                    placeholder="e.g. Netzewa Sustainable Solution Pvt Ltd" span2 />
                  <Field label="Company Code" value={form.companyCode}
                    onChange={e => setForm(f => ({ ...f, companyCode: e.target.value.toUpperCase() }))}
                    placeholder="e.g. NSSPL" mono />
                  <Field label="Person Name" value={form.personName}
                    onChange={e => setForm(f => ({ ...f, personName: e.target.value }))}
                    placeholder="e.g. John Doe" />
                  <Field label="Designation" value={form.designation}
                    onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
                    placeholder="e.g. Managing Director" />
                  <Field label="Phone" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="Phone number" />
                  <Field label="Email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="company@email.com" span2 />
                  <Field label="GSTIN" value={form.gstin}
                    onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                    placeholder="15-digit GST No." mono />
                  <Field label="PAN" value={form.pan}
                    onChange={e => setForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))}
                    placeholder="10-char PAN" mono />
                  <Field label="Pincode" value={form.pincode}
                    onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))}
                    placeholder="6-digit pincode" />
                  <Field label="State" value={form.state}
                    onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                    placeholder="e.g. Haryana" />
                  <Field label="District" value={form.district}
                    onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                    placeholder="e.g. Gurgaon" />
                  <Field label="Address" value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Full registered address" span2 textarea />
                </div>
              )}

              {/* IMAGES TAB */}
              {tab === "images" && (
                <div className="grid grid-cols-3 gap-6">
                  <ImgUpload label="Company Logo"  fieldKey="logo"  previewKey="logoPreview"  form={form} setForm={setForm} />
                  <ImgUpload label="Company Stamp" fieldKey="stamp" previewKey="stampPreview" form={form} setForm={setForm} />
                  <ImgUpload label="Company Sign"  fieldKey="sign"  previewKey="signPreview"  form={form} setForm={setForm} />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
              <div className="flex gap-1">
                {TABS.map(t => (
                  <span key={t.key} className={`h-2 rounded-full transition-all ${tab === t.key ? "w-4 bg-slate-800" : "w-2 bg-slate-200"}`} />
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                  {saving ? "Saving…" : editId ? "Update" : "Add Company"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW MODAL ── */}
      {showView && viewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/35">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                {viewData.logoUrl
                  ? <DeferredImage src={imgUrl(viewData.logoUrl)} alt="" className="w-10 h-10 rounded-xl object-contain border border-slate-100 bg-slate-50 p-1" />
                  : <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><Landmark size={18} className="text-green-600" /></div>
                }
                <div>
                  <h2 className="text-base font-bold text-slate-800">{viewData.companyName}</h2>
                  {viewData.companyCode && (
                    <span className="text-xs font-mono text-green-700 bg-green-50 px-2 py-0.5 rounded-lg">{viewData.companyCode}</span>
                  )}
                </div>
              </div>
              <button onClick={() => setShowView(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {[
                  ["Person Name", viewData.personName],
                  ["Designation", viewData.designation],
                  ["Phone",    viewData.phone],
                  ["Email",    viewData.email],
                  ["GSTIN",    viewData.gstin],
                  ["PAN",      viewData.pan],
                  ["Pincode",  viewData.pincode],
                  ["State",    viewData.state],
                  ["District", viewData.district],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
                    <p className="text-sm text-slate-700 font-medium">{value}</p>
                  </div>
                ))}
                {viewData.address && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Address</p>
                    <p className="text-sm text-slate-700">{viewData.address}</p>
                  </div>
                )}
              </div>

              {/* Images — always show all 3 slots */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Company Images</p>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Company Logo",  url: imgUrl(viewData.logoUrl)  },
                    { label: "Company Stamp", url: imgUrl(viewData.stampUrl) },
                    { label: "Company Sign",  url: imgUrl(viewData.signUrl)  },
                  ].map(({ label, url }) => (
                    <div key={label}>
                      <div className="h-32 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden mb-2">
                        {url
                          ? <DeferredImage src={url} alt={label} className="max-h-full max-w-full object-contain p-2" />
                          : <div className="flex flex-col items-center gap-1 text-slate-300">
                              <Image size={22} />
                              <span className="text-[10px]">Not uploaded</span>
                            </div>
                        }
                      </div>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide text-center">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
              {canEdit && (
                <button onClick={() => { setShowView(false); openEdit(viewData); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all mr-2">
                  <Pencil size={13} /> Edit
                </button>
              )}
              <button onClick={() => setShowView(false)}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
