import React, { useState, useRef, useEffect } from "react";
import { X, Building2, Upload, FileText, Download, MapPin, Landmark, Pencil, Image as ImageIcon, Plus, Users, Phone } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const ACCEPT_IMAGES = "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp,image/svg+xml,image/tiff";

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

const Field = ({ label, value, onChange, placeholder, mono, span2, textarea, type = "text", readOnly = false }) => (
  <div className={span2 ? "col-span-2" : ""}>
    <label className={lbl}>{label}</label>
    {textarea ? (
      <textarea value={value || ""} onChange={onChange} rows={2} placeholder={placeholder} readOnly={readOnly}
        className={`${inp} resize-none ${readOnly ? "bg-slate-50 cursor-not-allowed" : ""}`} />
    ) : (
      <input type={type} value={value || ""} onChange={onChange} placeholder={placeholder} readOnly={readOnly}
        className={`${inp} ${mono ? "font-mono" : ""} ${readOnly ? "bg-slate-50 cursor-not-allowed" : ""}`} />
    )}
  </div>
);

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

const COMPANY_TABS = [
  { key: "basic",  label: "Basic Info" },
  { key: "images", label: "Images"     },
];

const emptyCompany = {
  companyName: "", companyCode: "", personName: "", designation: "",
  phone: "", email: "", gstin: "", pan: "", pincode: "", state: "", district: "", address: "",
  logo: null, logoPreview: "", stamp: null, stampPreview: "", sign: null, signPreview: "",
};

export const FullCompanyModal = ({ onClose, onSuccess, editData }) => {
  const [form, setForm] = useState(() => {
    if (!editData) return emptyCompany;
    return {
      ...emptyCompany,
      ...editData,
      companyName:     editData.companyName || editData.company_name || "",
      companyCode:     editData.companyCode || editData.company_code || "",
      logoUrl:         editData.logoUrl     || editData.logo_url     || "",
      logoPreview:     editData.logoUrl     || editData.logo_url     || "",
      stampUrl:        editData.stampUrl    || editData.stamp_url    || "",
      signUrl:         editData.signUrl     || editData.sign_url     || "",
    };
  });
  const [tab, setTab] = useState("basic");
  const [saving, setSaving] = useState(false);

  const editId = editData?.id;

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm text-left">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-slate-800">{editId ? "Edit Company" : "Add New Company"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="flex border-b border-slate-100 px-6 shrink-0">
          {COMPANY_TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 -mb-px
                ${tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "basic" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Company Name *" value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} placeholder="Full registered name" span2 />
              <Field label="Company Code" value={form.companyCode} onChange={e => setForm({ ...form, companyCode: e.target.value.toUpperCase() })} placeholder="e.g. NSSPL" mono />
              <Field label="Person Name" value={form.personName || form.person_name} onChange={e => setForm({ ...form, personName: e.target.value })} placeholder="e.g. John Doe" />
              <Field label="Designation" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Managing Director" />
              <Field label="Phone" value={form.phone || form.mobile} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" />
              <Field label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="company@email.com" span2 />
              <Field label="GSTIN" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="15-digit GST No." mono />
              <Field label="PAN" value={form.pan} onChange={e => setForm({ ...form, pan: e.target.value.toUpperCase() })} placeholder="10-char PAN" mono />
              <Field label="Pincode" value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })} placeholder="6-digit pincode" />
              <Field label="State" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="e.g. Haryana" />
              <Field label="District" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} placeholder="e.g. Gurgaon" />
              <Field label="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Full registered address" span2 textarea />
            </div>
          )}
          {tab === "images" && (
            <div className="grid grid-cols-3 gap-6">
              <ImgUpload label="Company Logo" fieldKey="logo" previewKey="logoPreview" form={form} setForm={setForm} />
              <ImgUpload label="Company Stamp" fieldKey="stamp" previewKey="stampPreview" form={form} setForm={setForm} />
              <ImgUpload label="Company Sign" fieldKey="sign" previewKey="signPreview" form={form} setForm={setForm} />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
            {saving ? "Saving…" : editId ? "Update Company" : "Add Company"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const FullViewCompanyModal = ({ company, onClose, onEdit }) => {
  if (!company) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm text-left">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
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
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-left">
            {[
              ["Person Name", company.personName || company.person_name], 
              ["Designation", company.designation], 
              ["Phone", company.phone || company.mobile], 
              ["Email", company.email], 
              ["GSTIN", company.gstin], 
              ["PAN", company.pan], 
              ["Pincode", company.pincode], 
              ["State", company.state], 
              ["District", company.district]
            ].map(([l, v]) => v ? (
              <div key={l}><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">{l}</p><p className="text-sm text-slate-700 font-medium">{v}</p></div>
            ) : null)}
            {(company.address) && <div className="col-span-2 text-left"><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Address</p><p className="text-sm text-slate-700">{company.address}</p></div>}
          </div>
          <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-6">
            {[
              ["Logo", company.logoUrl || company.logo_url], 
              ["Stamp", company.stampUrl || company.stamp_url], 
              ["Sign", company.signUrl || company.sign_url]
            ].map(([l, u]) => (
              <div key={l} className="text-center">
                 <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">{l}</p>
                 <div className="h-32 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-center overflow-hidden">
                   {u ? <img src={u} alt={l} className="max-h-full max-w-full object-contain p-2" /> : <p className="text-[10px] text-slate-300">N/A</p>}
                 </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// SITE MODAL
// ─────────────────────────────────────────────────────────────────

const emptySite = { siteName: "", siteCode: "", city: "", state: "", billingAddress: "", siteAddress: "" };

export const FullSiteModal = ({ onClose, onSuccess, editData }) => {
  const [form, setForm] = useState(editData ? { ...emptySite, ...editData } : emptySite);
  const [saving, setSaving] = useState(false);

  const editId = editData?.id;

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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">{editId ? "Edit Site" : "Add New Site"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Site Name *" value={form.siteName} onChange={e => setForm({ ...form, siteName: e.target.value })} placeholder="e.g. Varanasi Library" />
            <Field label="Site Code" value={form.siteCode} onChange={e => setForm({ ...form, siteCode: e.target.value.toUpperCase() })} placeholder="e.g. GDLV" />
            <Field label="City" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="City" />
            <Field label="State" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="State" />
          </div>
          <Field label="Billing Address" value={form.billingAddress} onChange={e => setForm({ ...form, billingAddress: e.target.value })} placeholder="Full billing address" textarea />
          <Field label="Site Address" value={form.siteAddress} onChange={e => setForm({ ...form, siteAddress: e.target.value })} placeholder="Physical site address" textarea />
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
            {saving ? "Saving…" : editId ? "Update Site" : "Add Site"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const FullViewSiteModal = ({ site, onClose, onEdit }) => {
  if (!site) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm text-left">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="bg-slate-800 px-6 py-5 relative">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {onEdit && (
              <button onClick={() => { onClose(); onEdit(site); }}
                className="text-slate-400 hover:text-white transition-colors" title="Edit Site">
                <Pencil size={16} />
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0"><MapPin size={20} className="text-blue-300" /></div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Site Name</p>
              <h2 className="text-lg font-bold text-white leading-tight">{site.siteName || site.site_name}</h2>
              <div className="flex items-center gap-1.5 mt-1.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Site Code</p>
                <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-200 rounded-lg text-xs font-mono font-semibold tracking-wider">
                  {site.siteCode || site.site_code || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 px-6 py-5 space-y-4 bg-white">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl px-4 py-3"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">City</p><p className="text-sm font-semibold text-slate-700">{site.city || "—"}</p></div>
            <div className="bg-slate-50 rounded-xl px-4 py-3"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">State</p><p className="text-sm font-semibold text-slate-700">{site.state || "—"}</p></div>
          </div>
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Billing Address</p></div>
            <p className="px-4 py-3 text-sm text-slate-600 leading-relaxed">{site.billingAddress || site.billing_address || "—"}</p>
          </div>
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Site Address</p></div>
            <p className="px-4 py-3 text-sm text-slate-600 leading-relaxed">{site.siteAddress || site.site_address || "—"}</p>
          </div>
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
