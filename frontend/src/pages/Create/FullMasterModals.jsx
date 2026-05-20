import React, { useState, useRef, useEffect } from "react";
import { X, Building2, Upload, FileText, Download, MapPin, Landmark, Pencil, Image as ImageIcon, Plus, Users, Phone, CreditCard, Search, Trash2, Star, ChevronDown } from "lucide-react";
import { SiteMapModal } from "../../components/procurement/SiteShared";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const ACCEPT_IMAGES = "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp,image/svg+xml,image/tiff";

const INDIA_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

/* ── helper: Force Download ── */
const forceDownload = (url, filename) => {
  if (!url) return;
  fetch(url).then(res => res.blob()).then(blob => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename || "document";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }).catch(() => window.open(url, "_blank"));
};

// ─────────────────────────────────────────────────────────────────
// SHARED STYLES & COMPONENTS
// ─────────────────────────────────────────────────────────────────

const inp = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 text-slate-700 transition-all";
const lbl = "block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider";

const Field = ({ label, value, onChange, placeholder, mono, span2, textarea, type = "text", readOnly = false, inputClassName = "" }) => (
  <div className={span2 ? "col-span-2" : ""}>
    <label className={lbl}>{label}</label>
    {textarea ? (
      <textarea value={value || ""} onChange={onChange} rows={2} placeholder={placeholder} readOnly={readOnly}
        className={`${inp} ${inputClassName} resize-none ${readOnly ? "bg-slate-50 cursor-not-allowed" : ""}`} />
    ) : (
      <input type={type} value={value || ""} onChange={onChange} placeholder={placeholder} readOnly={readOnly}
        className={`${inp} ${inputClassName} ${mono ? "font-mono" : ""} ${readOnly ? "bg-slate-50 cursor-not-allowed" : ""}`} />
    )}
  </div>
);

/* Site map modal moved to shared component */

const DocUpload = ({ label, fieldKey, form, setForm }) => {
  const ref = useRef();
  const file = form[fieldKey];
  const urlKey = `${fieldKey}Url`;
  const existingUrl = form[urlKey];
  const hasDoc = !!file || !!existingUrl;

  const handleRemove = (e) => {
    e.stopPropagation();
    setForm(f => ({ ...f, [fieldKey]: null, [urlKey]: "" }));
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

const ImgUpload = ({ label, fieldKey, previewKey, form, setForm }) => {
  const ref = useRef();
  const preview = form[previewKey];
  return (
    <div>
      <p className={lbl}>{label}</p>
      <div className="flex flex-col items-center gap-3">
        <div onClick={() => ref.current.click()}
          className="w-full h-32 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-all overflow-hidden bg-slate-50 relative group">
          {preview ? (
            <>
              <img src={preview} alt={label} className="max-h-full max-w-full object-contain p-2" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                <span className="text-white text-xs font-semibold">Change</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-slate-300">
              <ImageIcon size={24} />
              <span className="text-[10px]">Click to upload</span>
            </div>
          )}
        </div>
        {preview && (
          <button type="button" onClick={() => setForm(f => ({ ...f, [fieldKey]: null, [previewKey]: "" }))}
            className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
            <X size={11} /> Remove
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept={ACCEPT_IMAGES} className="hidden"
        onChange={e => {
          const file = e.target.files[0];
          if (file) setForm(prev => ({ ...prev, [fieldKey]: file, [previewKey]: URL.createObjectURL(file) }));
          e.target.value = "";
        }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// VENDOR MODAL
// ─────────────────────────────────────────────────────────────────

const VENDOR_TABS = [
    { key: "basic", label: "Basic Info"   },
    { key: "bank",  label: "Bank Details" },
    { key: "docs",  label: "Documents"    },
];

const emptyVendor = {
  vendorName: "", email: "", contactPerson: "", mobile: "",
  gstin: "", pan: "", aadharNo: "", msmeNumber: "",
  bankName: "", accountHolder: "", accountNumber: "", ifscCode: "",
  bankBranch: "", bankCity: "", bankState: "", address: "",
  logo: null, logoPreview: "",
  docGst: null, docPan: null, docAadhaar: null, docCoi: null,
  docMsme: null, docCancelCheque: null, docOther: null, docOther2: null,
};

export const FullVendorModal = ({ onClose, onSuccess, editData }) => {
  const [form, setForm] = useState(() => {
    if (!editData) return emptyVendor;
    return {
      ...emptyVendor,
      ...editData,
      // Fallbacks for snake_case join data
      vendorName:     editData.vendorName     || editData.vendor_name || "",
      bankName:       editData.bankName       || editData.bank_name   || "",
      accountHolder:  editData.accountHolder  || editData.account_holder || "",
      accountNumber:  editData.accountNumber  || editData.account_number || "",
      ifscCode:       editData.ifscCode       || editData.ifsc_code   || "",
      bankBranch:     editData.bankBranch     || editData.bank_branch || "",
      bankCity:       editData.bankCity       || editData.bank_city   || "",
      bankState:      editData.bankState      || editData.bank_state  || "",
      msmeNumber:     editData.msmeNumber     || editData.msme_number || "",
      aadharNo:       editData.aadharNo       || editData.aadhar_no   || "",
      contactPerson:  editData.contactPerson  || editData.contact_person || "",
      logoUrl:        editData.logoUrl        || editData.logo_url    || "",
      docGstUrl:      editData.docGstUrl      || editData.doc_gst_url || "",
      docPanUrl:      editData.docPanUrl      || editData.doc_pan_url || "",
      docAadhaarUrl:  editData.docAadhaarUrl  || editData.doc_aadhaar_url || "",
      docCoiUrl:      editData.docCoiUrl      || editData.doc_coi_url || "",
      docMsmeUrl:     editData.docMsmeUrl     || editData.doc_msme_url || "",
      docCancelChequeUrl: editData.docCancelChequeUrl || editData.doc_cancel_cheque_url || "",
      docOtherUrl:    editData.docOtherUrl    || editData.doc_other_url || "",
      docOther2Url:   editData.docOther2Url   || editData.doc_other2_url || "",
      logoPreview:    editData.logoUrl        || editData.logo_url    || "",
    };
  });
  const [tab, setTab] = useState("basic");
  const [saving, setSaving] = useState(false);
  const logoRef = useRef();

  const editId = editData?.id;

  const handleSave = async () => {
    if (!form.vendorName.trim()) return alert("Vendor Name is required");
    setSaving(true);
    try {
      const fd = new FormData();
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      fd.append("createdById", u.id || "");
      fd.append("createdByName", u.name || "");
      Object.entries(form).forEach(([k, v]) => {
        if (k === "logoPreview") return;
        if (v instanceof File) fd.append(k, v);
        else if (v !== null && v !== undefined && v !== "") fd.append(k, v);
      });
      const url = editId ? `${API}/api/procurement/vendors/${editId}` : `${API}/api/procurement/vendors`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSuccess(data.vendor?.id || data.id);
      onClose();
    } catch (err) {
      alert(err.message || "Failed to save vendor");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-slate-800">{editId ? "Edit Vendor" : "Add New Vendor"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
        </div>

        <div className="flex border-b border-slate-100 px-6 shrink-0">
          {VENDOR_TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 -mb-px
                ${tab === t.key ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "basic" && (
            <div className="space-y-4">
              <div>
                <label className={lbl}>Vendor Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden shrink-0">
                    {form.logoPreview ? <img src={form.logoPreview} alt="" className="w-full h-full object-contain p-1" /> : <Building2 size={20} className="text-slate-300" />}
                  </div>
                  <button type="button" onClick={() => logoRef.current.click()} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-50">Upload Logo</button>
                  <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files[0]; if (f) setForm(p => ({ ...p, logo: f, logoPreview: URL.createObjectURL(f) })); }} />
                </div>
              </div>
              <Field label="Vendor Firm Name *" value={form.vendorName} onChange={e => setForm({ ...form, vendorName: e.target.value })} placeholder="e.g. Ojo Technologies Pvt Ltd" span2 />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact Person" value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} placeholder="Full name" />
                <Field label="Mobile Number" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} placeholder="10-digit number" />
                <Field label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="vendor@email.com" span2 />
                <Field label="GST No" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="15-digit GSTIN" mono />
                <Field label="PAN No" value={form.pan} onChange={e => setForm({ ...form, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" mono />
                <Field label="Aadhar No" value={form.aadharNo} onChange={e => setForm({ ...form, aadharNo: e.target.value.replace(/\D/g, "") })} placeholder="12-digit Aadhar" mono />
                <Field label="MSME Number" value={form.msmeNumber} onChange={e => setForm({ ...form, msmeNumber: e.target.value })} placeholder="MSME Reg. No." />
                <Field label="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Full address" span2 textarea />
              </div>
            </div>
          )}

          {tab === "bank" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bank Name" value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} placeholder="HDFC, SBI, etc." span2 />
              <Field label="Account Holder" value={form.accountHolder} onChange={e => setForm({ ...form, accountHolder: e.target.value })} placeholder="Name in bank" span2 />
              <Field label="Account Number" value={form.accountNumber} onChange={e => setForm({ ...form, accountNumber: e.target.value })} placeholder="Account number" span2 mono />
              <Field label="IFSC Code" value={form.ifscCode} onChange={e => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })} placeholder="HDFC0001234" mono />
              <Field label="Branch" value={form.bankBranch} onChange={e => setForm({ ...form, bankBranch: e.target.value })} placeholder="Branch name" />
              <Field label="City" value={form.bankCity} onChange={e => setForm({ ...form, bankCity: e.target.value })} placeholder="City" />
              <Field label="State" value={form.bankState} onChange={e => setForm({ ...form, bankState: e.target.value })} placeholder="State" />
            </div>
          )}

          {tab === "docs" && (
            <div className="grid grid-cols-2 gap-4">
              <DocUpload label="Aadhar Card" fieldKey="docAadhaar" form={form} setForm={setForm} />
              <DocUpload label="PAN Card" fieldKey="docPan" form={form} setForm={setForm} />
              <DocUpload label="GST Certificate" fieldKey="docGst" form={form} setForm={setForm} />
              <DocUpload label="MSME Certificate" fieldKey="docMsme" form={form} setForm={setForm} />
              <DocUpload label="Cancel Cheque" fieldKey="docCancelCheque" form={form} setForm={setForm} />
              <DocUpload label="COI" fieldKey="docCoi" form={form} setForm={setForm} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <div className="flex gap-1.5">
            {VENDOR_TABS.map(t => (
              <span key={t.key} className={`h-1.5 rounded-full transition-all ${tab === t.key ? "w-5 bg-indigo-600" : "w-1.5 bg-slate-200"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
              {saving ? "Saving…" : editId ? "Update Vendor" : "Add Vendor"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const FullViewVendorModal = ({ vendor, onClose, onEdit }) => {
  if (!vendor) return null;
  const docs = [
    { label: "Aadhar", url: vendor.docAadhaarUrl || vendor.doc_aadhaar_url },
    { label: "PAN Card", url: vendor.docPanUrl || vendor.doc_pan_url },
    { label: "GST Certificate", url: vendor.docGstUrl || vendor.doc_gst_url },
    { label: "MSME", url: vendor.docMsmeUrl || vendor.doc_msme_url },
    { label: "Cancel Cheque", url: vendor.docCancelChequeUrl || vendor.doc_cancel_cheque_url },
    { label: "COI", url: vendor.docCoiUrl || vendor.doc_coi_url },
    { label: "Other Doc 1", url: vendor.docOtherUrl || vendor.doc_other_url },
    { label: "Other Doc 2", url: vendor.docOther2Url || vendor.doc_other2_url },
  ].filter(d => d.url);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm text-left">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Building2 size={18} className="text-indigo-600" /> {vendor.vendorName || vendor.vendor_name}
          </h2>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button onClick={() => { onClose(); onEdit(vendor); }} 
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="Edit Vendor">
                <Pencil size={16} />
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 bg-slate-50">
          
          {/* Basic Details */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 underline decoration-indigo-100 underline-offset-4">Basic Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2 md:col-span-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Contact Person</p>
                <p className="text-sm font-semibold text-slate-700">{vendor.contactPerson || vendor.contact_person || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Mobile</p>
                <p className="text-sm font-semibold text-slate-700">{vendor.mobile || vendor.phone || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Email</p>
                <p className="text-sm font-semibold text-slate-700">{vendor.email || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">GST NO</p>
                <p className="text-sm font-bold text-indigo-700 font-mono">{vendor.gstin || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">PAN NO</p>
                <p className="text-sm font-bold text-indigo-700 font-mono">{vendor.pan || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Aadhar NO</p>
                <p className="text-sm font-semibold text-slate-700 font-mono">{vendor.aadharNo || vendor.aadhar_no || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">MSME NO</p>
                <p className="text-sm font-semibold text-slate-700">{vendor.msmeNumber || "—"}</p>
              </div>
              <div className="col-span-full">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Address</p>
                <p className="text-sm font-semibold text-slate-600 leading-relaxed">{vendor.address || "—"}</p>
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 underline decoration-emerald-100 underline-offset-4">Bank Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Bank Name</p>
                <p className="text-sm font-semibold text-slate-700">{vendor.bankName || vendor.bank_name || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Account Holder</p>
                <p className="text-sm font-semibold text-slate-700">{vendor.accountHolder || vendor.account_holder || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Account No</p>
                <p className="text-sm font-bold font-mono text-emerald-700">{vendor.accountNumber || vendor.account_number || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">IFSC Code</p>
                <p className="text-sm font-bold font-mono text-emerald-700">{vendor.ifscCode || vendor.ifsc_code || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Branch</p>
                <p className="text-sm font-semibold text-slate-700">{vendor.bankBranch || vendor.bank_branch || "—"}</p>
              </div>
            </div>
          </div>

          {/* Documents Card Grid */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                  <FileText size={16} className="text-orange-500" />
                </div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Documents Attached</h3>
              </div>
              <button 
                onClick={() => {
                  if (docs.length > 0) {
                    docs.forEach((doc, idx) => {
                      setTimeout(() => forceDownload(doc.url, doc.label), idx * 800);
                    });
                  }
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-100 text-slate-600 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wide">
                <Download size={13} className="text-indigo-500" /> Download All
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {docs.map((doc, idx) => (
                <div key={idx} onClick={() => window.open(doc.url, "_blank")}
                  className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
                  
                  <div className="h-24 w-full bg-slate-50 border-b border-slate-100 relative overflow-hidden pointer-events-none">
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
                      className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors shrink-0">
                      <Download size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {docs.length === 0 && (
                <p className="text-xs text-slate-400 italic">No documents uploaded.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// COMPANY MODAL
// ─────────────────────────────────────────────────────────────────

const ENTITY_CX = (...classes) => classes.filter(Boolean).join(" ");
const ENTITY_ACCEPT = ACCEPT_IMAGES;

const EntityField = ({ label, value, onChange, placeholder, mono, textarea, select, options = [], className = "" }) => (
  <label className={ENTITY_CX("block", className)}>
    <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
    {textarea ? (
      <textarea
        value={value || ""}
        onChange={onChange}
        rows={3}
        placeholder={placeholder}
        className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50"
      />
    ) : select ? (
      <select
        value={value || ""}
        onChange={onChange}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    ) : (
      <input
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        className={ENTITY_CX(
          "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50",
          mono && "font-mono"
        )}
      />
    )}
  </label>
);

const EntitySectionTitle = ({ icon: Icon, title }) => (
  <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
      <Icon size={16} />
    </span>
    <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">{title}</h3>
  </div>
);

const EntityImgUpload = ({ label, fieldKey, previewKey, form, setForm }) => {
  const ref = useRef();
  const preview = form[previewKey];
  const urlKey = `${fieldKey}Url`;
  const pathKey = `${fieldKey}Path`;
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex h-28 w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50 transition hover:border-cyan-400 hover:bg-cyan-50/40"
      >
        {preview ? (
          <img src={preview} alt={label} className="max-h-full max-w-full object-contain p-2" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs font-semibold text-slate-400">
            <ImageIcon size={22} />
            Upload
          </span>
        )}
      </button>
      {preview && (
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, [fieldKey]: null, [previewKey]: "", [urlKey]: "", [pathKey]: "" }))}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600"
        >
          <X size={12} /> Remove
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept={ENTITY_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setForm((prev) => ({ ...prev, [fieldKey]: file, [previewKey]: URL.createObjectURL(file) }));
          e.target.value = "";
        }}
      />
    </div>
  );
};

const emptyCompany = {
  companyName: "", companyCode: "", phone: "", email: "", gstin: "", pan: "", pincode: "", state: "", district: "", address: "", status: "active",
  billingGstin: "", billingContactName: "", billingContactPhone: "", billingState: "", billingAddress: "",
  accountNo: "", accountHolderName: "", ifscCode: "", bankName: "", bankBranch: "", bankCity: "", bankState: "",
  stateBillingProfiles: [],
  logo: null, logoPreview: "", stamp: null, stampPreview: "", sign: null, signPreview: "",
};

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emptyProfile = (isDefault = false) => ({
  id: uid(),
  locationName: "",
  gstin: "",
  contactName: "",
  contactPhone: "",
  address: "",
  isDefault,
});
const emptyStateBlock = (stateName) => ({
  id: uid(),
  stateName,
  profiles: [emptyProfile(true)],
});
const normalizeStateBlocks = (value) => {
  let rows = value;
  if (typeof value === "string") {
    try { rows = JSON.parse(value || "[]"); } catch { rows = []; }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && (row.stateName || row.state))
    .map((row) => {
      const profiles = Array.isArray(row.profiles) ? row.profiles : [];
      const nextProfiles = profiles.length ? profiles : [emptyProfile(true)];
      const hasDefault = nextProfiles.some((p) => p?.isDefault);
      return {
        id: row.id || uid(),
        stateName: row.stateName || row.state || "",
        profiles: nextProfiles.map((p, index) => ({
          id: p.id || uid(),
          locationName: p.locationName || p.location || "",
          gstin: p.gstin || p.gstIn || "",
          contactName: p.contactName || "",
          contactPhone: p.contactPhone || "",
          address: p.address || "",
          isDefault: hasDefault ? !!p.isDefault : index === 0,
        })),
      };
    });
};

export const FullCompanyModal = ({ onClose, onSuccess, editData }) => {
  const [form, setForm] = useState(() => {
    if (!editData) return emptyCompany;
    return {
      ...emptyCompany,
      ...editData,
      companyName:     editData.companyName || editData.company_name || "",
      companyCode:     editData.companyCode || editData.company_code || "",
      phone:           editData.phone || editData.mobile || "",
      gstin:           editData.gstin || "",
      pan:             editData.pan || "",
      pincode:         editData.pincode || "",
      state:           editData.state || "",
      district:        editData.district || "",
      address:         editData.address || "",
      status:          editData.status || "active",
      billingGstin:         editData.billingGstin || editData.billing_gstin || "",
      billingContactName:   editData.billingContactName || "",
      billingContactPhone:  editData.billingContactPhone || "",
      billingState:         editData.billingState || "",
      billingAddress:       editData.billingAddress || "",
      accountNo:            editData.accountNo || "",
      accountHolderName:    editData.accountHolderName || "",
      ifscCode:             editData.ifscCode || "",
      bankName:             editData.bankName || "",
      bankBranch:           editData.bankBranch || "",
      bankCity:             editData.bankCity || "",
      bankState:            editData.bankState || "",
      stateBillingProfiles: normalizeStateBlocks(editData.stateBillingProfiles || editData.state_billing_profiles || []),
      logoUrl:         editData.logoUrl     || editData.logo_url     || "",
      logoPreview:     editData.logoUrl     || editData.logo_url     || "",
      stampUrl:        editData.stampUrl    || editData.stamp_url    || "",
    };
  });
  const [tab, setTab] = useState("basic");
  const [saving, setSaving] = useState(false);
  const [stateQuery, setStateQuery] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [stateListOpen, setStateListOpen] = useState(false);

  const editId = editData?.id;

  const stateOptions = INDIA_STATES.filter((state) => state.toLowerCase().includes(stateQuery.trim().toLowerCase()));

  const addStateBlock = () => {
    const name =
      selectedState ||
      INDIA_STATES.find((s) => s.toLowerCase() === stateQuery.trim().toLowerCase());
    if (!name) return alert("Please select a state");
    if (form.stateBillingProfiles.some((b) => b.stateName === name)) {
      return alert("This state already exists");
    }
    setForm((prev) => ({ ...prev, stateBillingProfiles: [...prev.stateBillingProfiles, emptyStateBlock(name)] }));
    setStateQuery("");
    setSelectedState("");
  };

  const addProfile = (blockId) => {
    setForm((prev) => ({
      ...prev,
      stateBillingProfiles: prev.stateBillingProfiles.map((block) =>
        block.id === blockId ? { ...block, profiles: [...block.profiles, emptyProfile(false)] } : block
      ),
    }));
  };

  const updateProfile = (blockId, profileId, key, value) => {
    setForm((prev) => ({
      ...prev,
      stateBillingProfiles: prev.stateBillingProfiles.map((block) => {
        if (block.id !== blockId) return block;
        return {
          ...block,
          profiles: block.profiles.map((p) => (p.id === profileId ? { ...p, [key]: value } : p)),
        };
      }),
    }));
  };

  const markDefaultProfile = (blockId, profileId) => {
    setForm((prev) => ({
      ...prev,
      stateBillingProfiles: prev.stateBillingProfiles.map((block) => {
        if (block.id !== blockId) return block;
        return {
          ...block,
          profiles: block.profiles.map((p) => ({ ...p, isDefault: p.id === profileId })),
        };
      }),
    }));
  };

  const removeProfile = (blockId, profileId) => {
    setForm((prev) => ({
      ...prev,
      stateBillingProfiles: prev.stateBillingProfiles.map((block) => {
        if (block.id !== blockId) return block;
        const next = block.profiles.filter((p) => p.id !== profileId);
        if (!next.length) return { ...block, profiles: [emptyProfile(true)] };
        const hasDefault = next.some((p) => p.isDefault);
        const nextFixed = hasDefault ? next : next.map((p, idx) => ({ ...p, isDefault: idx === 0 }));
        return { ...block, profiles: nextFixed };
      }),
    }));
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) return alert("Company Name is required");
    setSaving(true);
    try {
      const fd = new FormData();
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      fd.append("createdById", u.id || "");
      fd.append("createdByName", u.name || "");
      Object.entries(form).forEach(([k, v]) => {
        if (k.includes("Preview")) return;
        if (k === "stateBillingProfiles") {
          fd.append("stateBillingProfiles", JSON.stringify(v || []));
          return;
        }
        if (v instanceof File) fd.append(k, v);
        else if (v !== null && v !== undefined && v !== "") fd.append(k, v);
      });
      const url = editId ? `${API}/api/procurement/companies/${editId}` : `${API}/api/procurement/companies`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSuccess(data.company?.id || data.id);
      onClose();
    } catch (err) { alert(err.message || "Failed to save company"); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-3">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-md bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-black text-slate-900">{editId ? "Edit Entity" : "Add Entity"}</h2>
            <p className="text-xs text-slate-400">Main, billing, bank and state-specific billing profiles</p>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-8 overflow-y-auto px-5 py-5">
          <section>
            <EntitySectionTitle icon={Building2} title="Main Detail" />
            <div className="grid gap-4 md:grid-cols-4">
              <EntityField label="Entity Name *" value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} placeholder="Entity name" className="md:col-span-2" />
              <EntityField label="Entity Code" value={form.companyCode} onChange={(e) => setForm((f) => ({ ...f, companyCode: e.target.value.toUpperCase() }))} placeholder="Code" mono />
              <EntityField label="Status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} select options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
              <EntityField label="Phone No" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone no" />
              <EntityField label="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@company.com" />
              <EntityField label="GSTIN Number" value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))} placeholder="GSTIN" mono />
              <EntityField label="PAN Number" value={form.pan} onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value.toUpperCase() }))} placeholder="PAN" mono />
              <EntityField label="Pincode" value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))} placeholder="Pincode" />
              <EntityField label="State" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} placeholder="State" />
              <EntityField label="District" value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} placeholder="District" />
              <div className="grid gap-4 md:col-span-1 md:grid-cols-2">
                <EntityImgUpload label="Entity Logo" fieldKey="logo" previewKey="logoPreview" form={form} setForm={setForm} />
                <EntityImgUpload label="Entity Stamp" fieldKey="stamp" previewKey="stampPreview" form={form} setForm={setForm} />
              </div>
              <EntityField label="Address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Registered address" textarea className="md:col-span-4" />
            </div>
          </section>

          <section>
            <EntitySectionTitle icon={MapPin} title="Entity Billing Address" />
            <div className="grid gap-4 md:grid-cols-4">
              <EntityField label="Billing GSTIN No" value={form.billingGstin} onChange={(e) => setForm((f) => ({ ...f, billingGstin: e.target.value.toUpperCase() }))} placeholder="Billing GSTIN" mono />
              <EntityField label="Billing Contact Name" value={form.billingContactName} onChange={(e) => setForm((f) => ({ ...f, billingContactName: e.target.value }))} placeholder="Contact name" />
              <EntityField label="Billing Contact Phone" value={form.billingContactPhone} onChange={(e) => setForm((f) => ({ ...f, billingContactPhone: e.target.value }))} placeholder="Contact phone" />
              <EntityField label="Billing State" value={form.billingState} onChange={(e) => setForm((f) => ({ ...f, billingState: e.target.value }))} placeholder="Billing state" />
              <EntityField label="Billing Address" value={form.billingAddress} onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))} placeholder="Billing address" textarea className="md:col-span-4" />
            </div>
          </section>

          <section>
            <EntitySectionTitle icon={CreditCard} title="Bank Detail" />
            <div className="grid gap-4 md:grid-cols-4">
              <EntityField label="Account No" value={form.accountNo} onChange={(e) => setForm((f) => ({ ...f, accountNo: e.target.value }))} placeholder="Account no" mono />
              <EntityField label="Account Holder Name" value={form.accountHolderName} onChange={(e) => setForm((f) => ({ ...f, accountHolderName: e.target.value }))} placeholder="Account holder" />
              <EntityField label="IFSC Code" value={form.ifscCode} onChange={(e) => setForm((f) => ({ ...f, ifscCode: e.target.value.toUpperCase() }))} placeholder="IFSC" mono />
              <EntityField label="Bank Name" value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} placeholder="Bank name" />
              <EntityField label="Bank Branch" value={form.bankBranch} onChange={(e) => setForm((f) => ({ ...f, bankBranch: e.target.value }))} placeholder="Branch" />
              <EntityField label="Bank City" value={form.bankCity} onChange={(e) => setForm((f) => ({ ...f, bankCity: e.target.value }))} placeholder="City" />
              <EntityField label="Bank State" value={form.bankState} onChange={(e) => setForm((f) => ({ ...f, bankState: e.target.value }))} placeholder="State" />
            </div>
          </section>

          <section>
            <EntitySectionTitle icon={MapPin} title="State Specific Billing Address" />
            <div className="mb-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_120px]">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" />
                <input
                  value={stateQuery}
                  onFocus={() => setStateListOpen(true)}
                  onBlur={() => window.setTimeout(() => setStateListOpen(false), 120)}
                  onChange={(e) => {
                    setStateQuery(e.target.value);
                    setSelectedState("");
                    setStateListOpen(true);
                  }}
                  placeholder="Search and select India state..."
                  className="w-full rounded-md border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50"
                />
                {stateListOpen && (
                  <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-xl">
                    {stateOptions.map((state) => (
                      <button
                        key={state}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedState(state);
                          setStateQuery(state);
                          setStateListOpen(false);
                        }}
                        className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-cyan-50 hover:text-cyan-800"
                      >
                        {state}
                      </button>
                    ))}
                    {!stateOptions.length && <p className="px-3 py-2 text-xs text-slate-400">No state found</p>}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={addStateBlock}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-800"
              >
                <Plus size={15} /> Add
              </button>
            </div>

            <div className="space-y-4">
              {form.stateBillingProfiles.map((block) => (
                <div key={block.id} className="rounded-md border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{block.stateName}</p>
                      <p className="text-xs text-slate-400">{block.profiles.length} profile{block.profiles.length !== 1 ? "s" : ""}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, stateBillingProfiles: prev.stateBillingProfiles.filter((b) => b.id !== block.id) }))}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="space-y-4 p-4">
                    {block.profiles.map((profile, index) => (
                      <div key={profile.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-700">Profile - {index + 1}</p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => markDefaultProfile(block.id, profile.id)}
                              className={[
                                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-bold transition",
                                profile.isDefault ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100",
                              ].join(" ")}
                            >
                              <Star size={13} fill={profile.isDefault ? "currentColor" : "none"} />
                              {profile.isDefault ? "Default" : "Mark as default"}
                            </button>
                            {block.profiles.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeProfile(block.id, profile.id)}
                                className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-4">
                          <EntityField label="Location Name" value={profile.locationName} onChange={(e) => updateProfile(block.id, profile.id, "locationName", e.target.value)} placeholder="Location name" />
                          <EntityField label="GST IN No" value={profile.gstin} onChange={(e) => updateProfile(block.id, profile.id, "gstin", e.target.value.toUpperCase())} placeholder="GSTIN" mono />
                          <EntityField label="Contact Name" value={profile.contactName} onChange={(e) => updateProfile(block.id, profile.id, "contactName", e.target.value)} placeholder="Contact name" />
                          <EntityField label="Contact Phone" value={profile.contactPhone} onChange={(e) => updateProfile(block.id, profile.id, "contactPhone", e.target.value)} placeholder="Contact phone" />
                          <EntityField label="Address" value={profile.address} onChange={(e) => updateProfile(block.id, profile.id, "address", e.target.value)} placeholder="Billing address" textarea className="md:col-span-4" />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addProfile(block.id)}
                      className="inline-flex items-center gap-2 rounded-md border border-dashed border-cyan-300 px-3 py-2 text-xs font-bold text-cyan-700 transition hover:bg-cyan-50"
                    >
                      <Plus size={14} /> Add Profile
                    </button>
                  </div>
                </div>
              ))}
              {!form.stateBillingProfiles.length && (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-400">
                  Select state and click Add to create state specific billing profile.
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="rounded-md bg-slate-950 px-5 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Saving..." : editId ? "Update Entity" : "Add Entity"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const FullViewCompanyModal = ({ company, onClose, onEdit }) => {
  if (!company) return null;
  const stateBlocks = normalizeStateBlocks(company.stateBillingProfiles || company.state_billing_profiles || []);
  const [signedImages, setSignedImages] = useState({ logo: "", stamp: "" });

  useEffect(() => {
    const rawLogo = company.logoUrl || company.logo_url || company.logoPath || company.logo_path || "";
    const rawStamp = company.stampUrl || company.stamp_url || company.stampPath || company.stamp_path || "";

    const paths = [rawLogo, rawStamp].filter(Boolean);
    if (paths.length === 0) {
      setSignedImages({ logo: "", stamp: "" });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // If backend already returns signed/full urls, keep them; otherwise sign paths.
        const looksLikeUrl = (v) => /^https?:\/\//i.test(v) || /^data:|^blob:/i.test(v);
        const needSign = paths.filter(p => !looksLikeUrl(p));
        let urlsByPath = {};
        if (needSign.length) {
          const res = await fetch(`${API}/api/procurement/sign-urls`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bucket: "procurement-images", paths: needSign }),
          });
          const data = await res.json().catch(() => ({}));
          urlsByPath = data.urls || {};
        }
        if (cancelled) return;
        setSignedImages({
          logo: looksLikeUrl(rawLogo) ? rawLogo : (urlsByPath[rawLogo] || ""),
          stamp: looksLikeUrl(rawStamp) ? rawStamp : (urlsByPath[rawStamp] || ""),
        });
      } catch {
        if (!cancelled) setSignedImages({ logo: "", stamp: "" });
      }
    })();
    return () => { cancelled = true; };
  }, [company]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm text-left">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 text-left">
            {(company.logoUrl || company.logo_url) ? (
              <img src={company.logoUrl || company.logo_url} alt="" className="w-10 h-10 rounded-xl object-contain border border-slate-100 bg-slate-50 p-1" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <Landmark size={18} className="text-green-600" />
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-slate-800">{company.companyName || company.company_name}</h2>
              {(company.companyCode || company.company_code) && (
                <span className="text-xs font-mono text-green-700 bg-green-50 px-2 py-0.5 rounded-lg">
                  {company.companyCode || company.company_code}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button onClick={() => { onClose(); onEdit(company); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="Edit Company">
                <Pencil size={16} />
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Main Detail</p>
            <div className="grid grid-cols-3 gap-x-8 gap-y-4 text-left">
            {[
              ["Phone", company.phone || company.mobile], 
              ["Email", company.email], 
              ["GSTIN", company.gstin], 
              ["PAN", company.pan], 
              ["Pincode", company.pincode], 
              ["State", company.state], 
              ["District", company.district],
              ["Status", company.status],
            ].map(([l, v]) => v ? (
              <div key={l}><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">{l}</p><p className="text-sm text-slate-700 font-medium">{v}</p></div>
            ) : null)}
          </div>
            {(company.address) && <div className="mt-4 text-left"><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Address</p><p className="text-sm text-slate-700">{company.address}</p></div>}
          </div>

          <div className="border-t border-slate-100 pt-6">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Entity Billing Address</p>
            <div className="grid grid-cols-3 gap-x-8 gap-y-4">
              {[
                ["Billing GSTIN No", company.billingGstin || company.billing_gstin],
                ["Billing Contact Name", company.billingContactName],
                ["Billing Contact Phone", company.billingContactPhone],
                ["Billing State", company.billingState],
              ].map(([l, v]) => v ? (
                <div key={l}><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">{l}</p><p className="text-sm text-slate-700 font-medium">{v}</p></div>
              ) : null)}
              {(company.billingAddress) && (
                <div className="col-span-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Billing Address</p>
                  <p className="text-sm text-slate-700">{company.billingAddress}</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">State Specific Billing Address</p>
            {stateBlocks.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">No state profiles added.</p>
            ) : (
              <div className="space-y-4">
                {stateBlocks.map((block) => (
                  <div key={block.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-bold text-slate-800">{block.stateName}</p>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {block.profiles.map((p, idx) => (
                        <div key={p.id} className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] font-bold text-slate-600">Profile - {idx + 1}</p>
                            {p.isDefault && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg">Default</span>}
                          </div>
                          <div className="mt-2 space-y-1 text-[12px] text-slate-700">
                            {p.locationName && <p><span className="font-bold">Location:</span> {p.locationName}</p>}
                            {p.gstin && <p><span className="font-bold">GSTIN:</span> {p.gstin}</p>}
                            {(p.contactName || p.contactPhone) && <p><span className="font-bold">Contact:</span> {p.contactName}{p.contactPhone ? ` · ${p.contactPhone}` : ""}</p>}
                            {p.address && <p><span className="font-bold">Address:</span> {p.address}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-6">
            {[
              ["Logo", signedImages.logo],
              ["Stamp", signedImages.stamp],
            ].map(([l, u]) => (
              <div key={l} className="text-center">
                 <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">{l}</p>
                 <div className="h-32 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-center overflow-hidden">
                   {u ? (
                     <img src={u} alt={l} className="max-h-full max-w-full object-contain p-2" />
                   ) : (
                     <div className="flex flex-col items-center gap-1 text-slate-300">
                       <ImageIcon size={22} />
                       <span className="text-[10px] font-semibold">Upload</span>
                     </div>
                   )}
                 </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          {onEdit && (
            <button onClick={() => { onClose(); onEdit(company); }}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all flex items-center gap-2">
              <Pencil size={14} /> Edit
            </button>
          )}
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// SITE MODAL
// ─────────────────────────────────────────────────────────────────

const emptySite = {
  siteName: "",
  siteCode: "",
  status: "active",
  district: "",
  state: "",
  pincode: "",
  latitude: "",
  longitude: "",
  siteAddress: "",
  contacts: [],
  slug: "",
};

export const FullSiteModal = ({ onClose, onSuccess, editData, allContacts = [] }) => {
  const [form, setForm] = useState(() => {
    if (!editData) return emptySite;
    return {
      ...emptySite,
      ...editData,
      siteName: editData.siteName || editData.site_name || "",
      siteCode: editData.siteCode || editData.site_code || "",
      status: editData.status || "active",
      district: editData.district || editData.city || "",
      state: editData.state || "",
      pincode: editData.pincode || "",
      latitude: editData.latitude || "",
      longitude: editData.longitude || "",
      siteAddress: editData.siteAddress || editData.site_address || "",
      contacts: Array.isArray(editData.contacts) ? editData.contacts : [],
      slug: editData.slug || "",
    };
  });
  const [saving, setSaving] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);

  const editId = editData?.id;

  const normalizePickedContact = (c) => {
    if (!c) return null;
    return {
      id: c.id,
      name: c.personName || c.person_name || c.name || "",
      phone: c.contactNumber || c.contact_number || c.phone || "",
      email: c.email || "",
    };
  };

  const setContactAt = (index, contactId) => {
    const picked = allContacts.find((c) => String(c.id) === String(contactId));
    const normalized = normalizePickedContact(picked);
    setForm((prev) => {
      const next = [...(prev.contacts || [])];
      next[index] = normalized;
      return { ...prev, contacts: next.filter(Boolean) };
    });
  };

  const addContactRow = () => setForm((prev) => ({ ...prev, contacts: [...(prev.contacts || []), null] }));
  const removeContactRow = (index) => setForm((prev) => ({ ...prev, contacts: (prev.contacts || []).filter((_, i) => i !== index) }));

  const handleSave = async () => {
    if (!form.siteName.trim()) return alert("Site Name required");
    setSaving(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const payload = { ...form, createdById: u.id || "", createdByName: u.name || "" };
      const url = editId ? `${API}/api/procurement/sites/${editId}` : `${API}/api/procurement/sites`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSuccess(data.site?.id || data.id);
      onClose();
    } catch (err) { alert(err.message || "Failed to save site"); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm text-left">
      {showMapModal && (
        <SiteMapModal
          initialLat={form.latitude}
          initialLng={form.longitude}
          onSave={(lat, lng) => { setForm((f) => ({ ...f, latitude: lat, longitude: lng })); setShowMapModal(false); }}
          onClose={() => setShowMapModal(false)}
        />
      )}
      <div className="bg-white rounded-md shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">{editId ? "Edit Site" : "Add New Site"}</h2>
            <p className="text-xs text-slate-400">Site details and location</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="bg-white rounded-md border border-slate-100 p-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Site Details</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Site Name *" value={form.siteName} onChange={e => setForm({ ...form, siteName: e.target.value })} placeholder="Enter site name" inputClassName="!rounded-md" />
              <Field label="Site Code" value={form.siteCode} onChange={e => setForm({ ...form, siteCode: e.target.value.toUpperCase() })} placeholder="Enter site code" inputClassName="!rounded-md" />
              <div>
                <label className={lbl}>Status</label>
                <div className="relative">
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className={inp + " !rounded-md bg-white h-[42px] py-0 pr-10 appearance-none"}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-md border border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Contacts</p>
              <button
                type="button"
                onClick={addContactRow}
                className="w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
                title="Add Contact"
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="space-y-3">
              {(form.contacts || []).length === 0 && (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-xs font-semibold text-slate-400">
                  No contacts assigned.
                </div>
              )}
              {(form.contacts || []).map((c, idx) => (
                <div key={idx} className={`rounded-lg border p-3 ${idx === 0 ? "bg-indigo-50/40 border-indigo-100" : "bg-slate-50 border-slate-100"}`}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                      {idx === 0 ? "Primary Contact" : `Contact ${idx + 1}`}
                    </p>
                    <button type="button" onClick={() => removeContactRow(idx)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="relative">
                    <select
                      value={c?.id || ""}
                      onChange={(e) => setContactAt(idx, e.target.value)}
                      className={inp + " !rounded-md bg-white h-[42px] py-0 pr-10 appearance-none"}
                    >
                      <option value="">— Select contact —</option>
                      {allContacts.map((ct) => (
                        <option key={ct.id} value={ct.id}>
                          {(ct.personName || ct.name || "Unnamed")} {ct.contactNumber ? `(${ct.contactNumber})` : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                  {(c?.name || c?.phone || c?.email) && (
                    <div className="mt-2 text-xs text-slate-600 space-y-0.5">
                      {c?.name && <div className="font-semibold">{c.name}</div>}
                      {(c?.phone || c?.email) && <div className="text-slate-400">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-md border border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Location</p>
              <button
                type="button"
                onClick={() => setShowMapModal(true)}
                className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <MapPin size={14} className="text-slate-400" /> Select on Map
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Pincode" value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })} placeholder="Enter pincode" inputClassName="!rounded-md" />
              <Field label="District" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} placeholder="Enter district" inputClassName="!rounded-md" />
              <Field label="State" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="Enter state" inputClassName="!rounded-md" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <Field label="Latitude" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder="e.g. 28.613900" mono inputClassName="!rounded-md" />
              <Field label="Longitude" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder="e.g. 77.209000" mono inputClassName="!rounded-md" />
            </div>
            <div className="mt-3">
              <Field label="Site Address" value={form.siteAddress} onChange={e => setForm({ ...form, siteAddress: e.target.value })} placeholder="Enter address" textarea inputClassName="!rounded-md" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-md text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
            {saving ? "Saving…" : editId ? "Update Site" : "Add Site"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const FullViewSiteModal = ({ site, onClose, onEdit }) => {
  if (!site) return null;
  const view = {
    siteName: site.siteName || site.site_name || "",
    siteCode: site.siteCode || site.site_code || "",
    status: site.status || "active",
    district: site.district || site.city || "—",
    state: site.state || "—",
    pincode: site.pincode || "—",
    latitude: site.latitude || "",
    longitude: site.longitude || "",
    siteAddress: site.siteAddress || site.site_address || "—",
    contacts: Array.isArray(site.contacts) ? site.contacts : [],
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm text-left">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <MapPin size={20} className="text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 leading-tight truncate">Site Details</h2>
              <p className="text-xs text-slate-400 font-medium truncate">{view.siteCode || "No Code"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onEdit && (
              <button
                onClick={() => { onClose(); onEdit(site); }}
                className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
                title="Edit Site"
              >
                <Pencil size={18} />
              </button>
            )}
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                view.status === "active" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-50 text-slate-500 border border-slate-100"
              }`}>{view.status}</span>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider">Site Master</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 break-words">{view.siteName}</h1>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">District</p>
              <p className="text-sm font-semibold text-slate-700">{view.district}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">State</p>
              <p className="text-sm font-semibold text-slate-700">{view.state}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 col-span-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pincode</p>
              <p className="text-sm font-semibold text-slate-700">{view.pincode}</p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Site Address</h3>
            <div className="p-4 rounded-xl border border-slate-200 text-slate-600 text-sm leading-relaxed bg-white shadow-sm">
              {view.siteAddress}
            </div>
          </div>

          {view.contacts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Assigned Contacts</h3>
              <div className="space-y-2.5">
                {view.contacts.map((c, i) => (
                  <div key={c.id || i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm ${
                      i === 0 ? "bg-indigo-600 text-white shadow-md" : "bg-slate-200 text-slate-500"
                    }`}>
                      {(c.name || "C")?.[0]?.toUpperCase()}
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

          {(view.latitude || view.longitude) && (
            <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100 space-y-3">
              <h3 className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest">Coordinates</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Latitude</p>
                  <p className="text-xs font-mono font-bold text-slate-700">{view.latitude || "0.000000"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Longitude</p>
                  <p className="text-xs font-mono font-bold text-slate-700">{view.longitude || "0.000000"}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-5 border-t border-slate-100 bg-slate-50 flex items-center gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────
// CONTACT MODAL
// ─────────────────────────────────────────────────────────────────

const emptyContact = { personName: "", contactNumber: "", designation: "", company: "" };

export const FullContactModal = ({ onClose, onSuccess, editData, companies = [] }) => {
  const [form, setForm] = useState(editData ? { ...emptyContact, ...editData } : emptyContact);
  const [saving, setSaving] = useState(false);
  const editId = editData?.id;

  const handleSave = async () => {
    if (!form.personName.trim()) return alert("Person Name is required");
    setSaving(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const payload = { ...form, createdById: u.id || "", createdByName: u.name || "" };
      const url = editId ? `${API}/api/procurement/contacts/${editId}` : `${API}/api/procurement/contacts`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { 
        method, 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(payload) 
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSuccess(data.contact?.id || data.id);
      onClose();
    } catch (err) { alert(err.message || "Failed to save contact"); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm text-left">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">{editId ? "Edit Contact" : "Add New Contact"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Field label="Person Name *" value={form.personName} onChange={e => setForm({ ...form, personName: e.target.value })} placeholder="e.g. Rajesh Kumar" />
          <Field label="Contact Number" value={form.contactNumber} onChange={e => setForm({ ...form, contactNumber: e.target.value })} placeholder="e.g. 9876543210" type="tel" />
          <Field label="Designation" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Site Engineer" />
          <div>
            <label className={lbl}>Company / Organisation</label>
            <select value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}
              className={inp + " bg-white"}>
              <option value="">— Select Company —</option>
              {companies.map(c => <option key={c.id} value={c.companyName}>{c.companyName}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
            {saving ? "Saving…" : editId ? "Update Contact" : "Add Contact"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const FullViewContactModal = ({ contact, onClose, onEdit }) => {
  if (!contact) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm text-left">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
        <div className="bg-slate-800 px-6 py-6 relative">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {onEdit && (
              <button onClick={() => { onClose(); onEdit(contact); }}
                className="text-slate-400 hover:text-white transition-colors" title="Edit Contact">
                <Pencil size={16} />
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center shrink-0">
               <span className="text-sky-200 text-xl font-bold">{contact.personName?.[0]?.toUpperCase()}</span>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Contact Details</p>
              <h2 className="text-lg font-bold text-white leading-tight">{contact.personName}</h2>
              {contact.designation && <p className="text-xs text-sky-200/70 mt-1 font-medium">{contact.designation}</p>}
            </div>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4 bg-white">
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
             <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center shadow-sm">
                <Phone size={14} className="text-sky-600" />
             </div>
             <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Contact Number</p>
                <p className="text-sm font-bold text-slate-700 mt-1">{contact.contactNumber || "—"}</p>
             </div>
          </div>
          {contact.company && (
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
               <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shadow-sm">
                  <Users size={14} className="text-slate-600" />
               </div>
               <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Company / Organisation</p>
                  <p className="text-sm font-bold text-slate-700 mt-1">{contact.company}</p>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// CLAUSE MODAL (Mounts full ClausesMaster inside a popup)
// ─────────────────────────────────────────────────────────────────

import ClausesMaster from "../Procurement/clauses/ClausesMaster";

export const FullClauseModal = ({ type, onClose, onSuccess, initialViewId, initialAction }) => {
  return (
    <ClausesMaster 
      type={type} 
      initialViewId={initialViewId} 
      initialAction={initialAction}
      isActionOnly={true}
      onCloseModal={(data) => { onSuccess(data); onClose(); }}
    />
  );
};
