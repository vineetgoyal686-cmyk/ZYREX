import React, { useEffect, useRef, useState } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import {
  Building2,
  ChevronDown,
  CreditCard,
  Image,
  Landmark,
  MapPin,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { logAudit } from "../../utils/auditLog";
import LogPanel from "../../components/LogPanel";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const ACCEPT = "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp,image/svg+xml,image/tiff";

const INDIA_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

const imgUrl = (url) => url || "";
const cx = (...classes) => classes.filter(Boolean).join(" ");
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const blank = <span className="text-slate-300">-</span>;

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

const emptyForm = {
  companyName: "",
  companyCode: "",
  phone: "",
  email: "",
  gstin: "",
  pan: "",
  pincode: "",
  state: "",
  district: "",
  address: "",
  status: "active",
  billingGstin: "",
  billingContactName: "",
  billingContactPhone: "",
  billingState: "",
  billingAddress: "",
  accountNo: "",
  accountHolderName: "",
  ifscCode: "",
  bankName: "",
  bankBranch: "",
  bankCity: "",
  bankState: "",
  stateBillingProfiles: [],
  logo: null,
  logoPreview: "",
  logoUrl: "",
  logoPath: "",
  stamp: null,
  stampPreview: "",
  stampUrl: "",
  stampPath: "",
  sign: null,
  signPreview: "",
  signUrl: "",
  signPath: "",
};


const Field = ({ label, value, onChange, placeholder, mono, textarea, select, options = [], className = "" }) => (
  <label className={cx("block", className)}>
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
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.75rem_center]"
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
        className={cx(
          "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-50",
          mono && "font-mono"
        )}
      />
    )}
  </label>
);

const SectionTitle = ({ icon: Icon, title }) => (
  <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
      <Icon size={16} />
    </span>
    <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">{title}</h3>
  </div>
);

const ImgUpload = ({ label, fieldKey, previewKey, form, setForm }) => {
  const ref = useRef();
  const preview = form[previewKey];
  const pathKey = `${fieldKey}Path`;
  const urlKey = `${fieldKey}Url`;
  const [activePreview, setActivePreview] = useState(preview || "");
  const [retrying, setRetrying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setActivePreview(preview || "");
    setFailed(false);
  }, [preview]);

  const refreshSignedUrl = async () => {
    const path = form[pathKey] || form[urlKey] || preview;
    if (!path || retrying) return;
    setRetrying(true);
    try {
      const res = await fetch(`${API}/api/procurement/sign-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "picture", paths: [path] }),
      });
      const data = await res.json().catch(() => ({}));
      const freshUrl = data.urls?.[path] || Object.values(data.urls || {})[0];
      if (freshUrl && freshUrl !== activePreview) {
        setActivePreview(freshUrl);
        setFailed(false);
        setForm((prev) => ({ ...prev, [previewKey]: freshUrl, [urlKey]: freshUrl }));
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }
    setRetrying(false);
  };

  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex h-28 w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50 transition hover:border-cyan-400 hover:bg-cyan-50/40"
      >
        {activePreview && !failed ? (
          <img
            src={activePreview}
            alt={label}
            className="max-h-full max-w-full object-contain p-2"
            onError={refreshSignedUrl}
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs font-semibold text-slate-400">
            <Image size={22} />
            {retrying ? "Loading..." : failed ? "Preview failed" : "Upload"}
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
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setForm((prev) => ({ ...prev, [fieldKey]: file, [previewKey]: URL.createObjectURL(file) }));
          }
          e.target.value = "";
        }}
      />
    </div>
  );
};

function CompanyList({ actionsRef, onDataChange, autoOpenAdd, autoOpenEdit, formOnlyMode, onModalClose } = {}) {
  const { canEdit } = useModulePermissions("company_list");

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [stateQuery, setStateQuery] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [stateListOpen, setStateListOpen] = useState(false);

  // expose actions to parent via actionsRef
  useEffect(() => {
    if (actionsRef) {
      actionsRef.current = {
        openAdd:  () => openAdd(),
        openEdit: (c) => openEdit(c),
      };
    }
  });

  useEffect(() => {
    if (autoOpenAdd) openAdd();
  }, [autoOpenAdd]);

  useEffect(() => {
    if (autoOpenEdit) openEdit(autoOpenEdit);
  }, [autoOpenEdit]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openAdd = () => {
    setForm({ ...emptyForm, stateBillingProfiles: [] });
    setEditId(null);
    setStateQuery("");
    setSelectedState("");
    setShowModal(true);
  };

  const openEdit = (c) => {
    setForm({
      ...emptyForm,
      ...c,
      status: c.status || "active",
      stateBillingProfiles: normalizeStateBlocks(c.stateBillingProfiles),
      logo: null,
      logoPreview: imgUrl(c.logoUrl),
      logoUrl: c.logoUrl || "",
      logoPath: c.logoPath || "",
      stamp: null,
      stampPreview: imgUrl(c.stampUrl),
      stampUrl: c.stampUrl || "",
      stampPath: c.stampPath || "",
      sign: null,
      signPreview: imgUrl(c.signUrl),
      signUrl: c.signUrl || "",
      signPath: c.signPath || "",
    });
    setEditId(c.id);
    setStateQuery("");
    setSelectedState("");
    setShowModal(true);
  };

  const openView = (c) => {
    preloadCompanyImages(c);
    setViewData({ ...c, stateBillingProfiles: normalizeStateBlocks(c.stateBillingProfiles) });
    setShowView(true);
  };

  const updateStateBlock = (blockId, updater) => {
    setForm((prev) => ({
      ...prev,
      stateBillingProfiles: prev.stateBillingProfiles.map((block) => (
        block.id === blockId ? updater(block) : block
      )),
    }));
  };

  const addStateBlock = () => {
    const name = selectedState || INDIA_STATES.find((s) => s.toLowerCase() === stateQuery.trim().toLowerCase());
    if (!name) return showToast("Select state first", "error");
    if (form.stateBillingProfiles.some((b) => b.stateName === name)) {
      return showToast("State already added", "error");
    }
    setForm((prev) => ({ ...prev, stateBillingProfiles: [...prev.stateBillingProfiles, emptyStateBlock(name)] }));
    setStateQuery("");
    setSelectedState("");
  };

  const addProfile = (blockId) => {
    updateStateBlock(blockId, (block) => ({ ...block, profiles: [...block.profiles, emptyProfile(false)] }));
  };

  const updateProfile = (blockId, profileId, key, value) => {
    updateStateBlock(blockId, (block) => ({
      ...block,
      profiles: block.profiles.map((profile) => (
        profile.id === profileId ? { ...profile, [key]: value } : profile
      )),
    }));
  };

  const markDefaultProfile = (blockId, profileId) => {
    updateStateBlock(blockId, (block) => ({
      ...block,
      profiles: block.profiles.map((profile) => ({ ...profile, isDefault: profile.id === profileId })),
    }));
  };

  const removeProfile = (blockId, profileId) => {
    updateStateBlock(blockId, (block) => {
      const profiles = block.profiles.filter((profile) => profile.id !== profileId);
      const safeProfiles = profiles.length ? profiles : [emptyProfile(true)];
      if (!safeProfiles.some((p) => p.isDefault)) safeProfiles[0] = { ...safeProfiles[0], isDefault: true };
      return { ...block, profiles: safeProfiles };
    });
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) return showToast("Entity Name required", "error");
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (["logoPreview", "stampPreview", "signPreview"].includes(key)) return;
        if (key === "stateBillingProfiles") {
          fd.append(key, JSON.stringify(normalizeStateBlocks(value)));
          return;
        }
        if (value instanceof File) fd.append(key, value);
        else if (value !== null && value !== undefined) fd.append(key, value);
      });
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      fd.append("createdById", u.id || "");
      fd.append("createdByName", u.name || "");

      const url = editId ? `${API}/api/procurement/companies/${editId}` : `${API}/api/procurement/companies`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, body: fd });
      const data = await res.json();
      if (!res.ok || data.error) {
        showToast(data.error || "Failed to save", "error");
        setSaving(false);
        return;
      }
      const savedId   = editId || data.id;
      const savedName = form.companyName;
      logAudit("company", savedId, savedName, editId ? "updated" : "created");
      showToast(editId ? "Entity updated" : "Entity added");
      setShowModal(false);
      onDataChange?.();
    } catch {
      showToast("Failed to save", "error");
    }
    setSaving(false);
  };

  const stateOptions = INDIA_STATES.filter((s) => s.toLowerCase().includes(stateQuery.trim().toLowerCase()));

  return (
    <>
      {toast && (
        <div className={cx(
          "fixed right-5 top-5 z-[200] rounded-md border px-4 py-3 text-sm font-semibold shadow-lg",
          toast.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
        )}>
          {toast.msg}
        </div>
      )}


      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-md bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-black text-slate-900">{editId ? "Edit Entity" : "Add Entity"}</h2>
                <p className="text-xs text-slate-400">Main, billing, bank and state-specific billing profiles</p>
              </div>
              <button onClick={() => { setShowModal(false); onModalClose?.(); }} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-8 overflow-y-auto px-5 py-5">
              <section>
                <SectionTitle icon={Building2} title="Main Detail" />
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Entity Name *" value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} placeholder="Entity name" className="md:col-span-2" />
                  <Field label="Entity Code" value={form.companyCode} onChange={(e) => setForm((f) => ({ ...f, companyCode: e.target.value.toUpperCase() }))} placeholder="Code" mono />
                  <Field
                    label="Status"
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    select
                    options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
                  />
                  <Field label="Phone No" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone no" />
                  <Field label="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@company.com" />
                  <Field label="GSTIN Number" value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))} placeholder="GSTIN" mono />
                  <Field label="PAN Number" value={form.pan} onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value.toUpperCase() }))} placeholder="PAN" mono />
                  <Field label="Pincode" value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))} placeholder="Pincode" />
                  <Field label="State" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} placeholder="State" />
                  <Field label="District" value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} placeholder="District" />
                  <div className="grid gap-4 md:col-span-1 md:grid-cols-2">
                    <ImgUpload label="Entity Logo" fieldKey="logo" previewKey="logoPreview" form={form} setForm={setForm} />
                    <ImgUpload label="Entity Stamp" fieldKey="stamp" previewKey="stampPreview" form={form} setForm={setForm} />
                  </div>
                  <Field label="Address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Registered address" textarea className="md:col-span-4" />
                </div>
              </section>

              <section>
                <SectionTitle icon={MapPin} title="Entity Billing Address" />
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Billing GSTIN No" value={form.billingGstin} onChange={(e) => setForm((f) => ({ ...f, billingGstin: e.target.value.toUpperCase() }))} placeholder="Billing GSTIN" mono />
                  <Field label="Billing Contact Name" value={form.billingContactName} onChange={(e) => setForm((f) => ({ ...f, billingContactName: e.target.value }))} placeholder="Contact name" />
                  <Field label="Billing Contact Phone" value={form.billingContactPhone} onChange={(e) => setForm((f) => ({ ...f, billingContactPhone: e.target.value }))} placeholder="Contact phone" />
                  <Field label="Billing State" value={form.billingState} onChange={(e) => setForm((f) => ({ ...f, billingState: e.target.value }))} placeholder="Billing state" />
                  <Field label="Billing Address" value={form.billingAddress} onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))} placeholder="Billing address" textarea className="md:col-span-4" />
                </div>
              </section>

              <section>
                <SectionTitle icon={CreditCard} title="Bank Detail" />
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Account No" value={form.accountNo} onChange={(e) => setForm((f) => ({ ...f, accountNo: e.target.value }))} placeholder="Account no" mono />
                  <Field label="Account Holder Name" value={form.accountHolderName} onChange={(e) => setForm((f) => ({ ...f, accountHolderName: e.target.value }))} placeholder="Account holder" />
                  <Field label="IFSC Code" value={form.ifscCode} onChange={(e) => setForm((f) => ({ ...f, ifscCode: e.target.value.toUpperCase() }))} placeholder="IFSC" mono />
                  <Field label="Bank Name" value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} placeholder="Bank name" />
                  <Field label="Bank Branch" value={form.bankBranch} onChange={(e) => setForm((f) => ({ ...f, bankBranch: e.target.value }))} placeholder="Branch" />
                  <Field label="Bank City" value={form.bankCity} onChange={(e) => setForm((f) => ({ ...f, bankCity: e.target.value }))} placeholder="City" />
                  <Field label="Bank State" value={form.bankState} onChange={(e) => setForm((f) => ({ ...f, bankState: e.target.value }))} placeholder="State" />
                </div>
              </section>

              <section>
                <SectionTitle icon={MapPin} title="State Specific Billing Address" />
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
                                  className={cx(
                                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-bold transition",
                                    profile.isDefault ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                                  )}
                                >
                                  {profile.isDefault ? <Star size={13} fill="currentColor" /> : <Star size={13} />}
                                  {profile.isDefault ? "Default" : "Mark as default"}
                                </button>
                                {block.profiles.length > 1 && (
                                  <button type="button" onClick={() => removeProfile(block.id, profile.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500">
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-4">
                              <Field label="Location Name" value={profile.locationName} onChange={(e) => updateProfile(block.id, profile.id, "locationName", e.target.value)} placeholder="Location name" />
                              <Field label="GST IN No" value={profile.gstin} onChange={(e) => updateProfile(block.id, profile.id, "gstin", e.target.value.toUpperCase())} placeholder="GSTIN" mono />
                              <Field label="Contact Name" value={profile.contactName} onChange={(e) => updateProfile(block.id, profile.id, "contactName", e.target.value)} placeholder="Contact name" />
                              <Field label="Contact Phone" value={profile.contactPhone} onChange={(e) => updateProfile(block.id, profile.id, "contactPhone", e.target.value)} placeholder="Contact phone" />
                              <Field label="Address" value={profile.address} onChange={(e) => updateProfile(block.id, profile.id, "address", e.target.value)} placeholder="Billing address" textarea className="md:col-span-4" />
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
              <button onClick={() => { setShowModal(false); onModalClose?.(); }} className="rounded-md px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="rounded-md bg-slate-950 px-5 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving..." : editId ? "Update Entity" : "Add Entity"}
              </button>
            </div>
          </div>
        </div>
      )}


    </>
  );
}

const ViewSection = ({ title, rows }) => {
  const visible = rows.filter(([, value]) => value);
  if (!visible.length) return null;
  return (
    <div>
      <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-slate-500">{title}</p>
      <div className="grid gap-x-8 gap-y-3 md:grid-cols-3">
        {visible.map(([label, value]) => (
          <div key={label} className={label.toLowerCase().includes("address") ? "md:col-span-3" : ""}>
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="text-sm font-medium text-slate-700">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export function CompanyDetailPanel({ company, onClose, onSelect }) {
  if (!company) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/35 p-3" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-md bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            {company.logoUrl ? (
              <img src={company.logoUrl || ""} alt="" className="h-10 w-10 rounded-md border border-slate-100 bg-slate-50 object-contain p-1" loading="lazy" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-50"><Landmark size={18} className="text-cyan-700" /></div>
            )}
            <div>
              <h2 className="text-base font-black text-slate-900">{company.companyName}</h2>
              <p className="text-xs font-mono font-bold text-cyan-700">{company.companyCode}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <ViewSection title="Main Detail" rows={[
            ["Phone", company.phone],
            ["Email", company.email],
            ["GSTIN", company.gstin],
            ["PAN", company.pan],
            ["Pincode", company.pincode],
            ["State", company.state],
            ["District", company.district],
            ["Status", company.status || "active"],
            ["Address", company.address],
          ]} />
          <ViewSection title="Entity Billing Address" rows={[
            ["Billing GSTIN No", company.billingGstin],
            ["Billing Contact Name", company.billingContactName],
            ["Billing Contact Phone", company.billingContactPhone],
            ["Billing State", company.billingState],
            ["Billing Address", company.billingAddress],
          ]} />
          <ViewSection title="Bank Detail" rows={[
            ["Account No", company.accountNo],
            ["Account Holder Name", company.accountHolderName],
            ["IFSC Code", company.ifscCode],
            ["Bank Name", company.bankName],
            ["Bank Branch", company.bankBranch],
            ["Bank City", company.bankCity],
            ["Bank State", company.bankState],
          ]} />
          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-slate-500">State Specific Billing Address</p>
            <div className="space-y-3">
              {company.stateBillingProfiles?.map((block) => (
                <div key={block.id} className="rounded-md border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-black text-slate-900">{block.stateName}</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {block.profiles.map((profile, index) => (
                      <div key={profile.id} className="rounded-md bg-slate-50 p-3">
                        <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-700">
                          Profile - {index + 1}
                          {profile.isDefault && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700"><Star size={10} fill="currentColor" /> Default</span>}
                        </p>
                        <p className="text-xs text-slate-600"><b>Location:</b> {profile.locationName || "-"}</p>
                        <p className="text-xs text-slate-600"><b>GSTIN:</b> {profile.gstin || "-"}</p>
                        <p className="text-xs text-slate-600"><b>Contact:</b> {profile.contactName || "-"} {profile.contactPhone ? `- ${profile.contactPhone}` : ""}</p>
                        {profile.address && <p className="text-xs text-slate-600"><b>Address:</b> {profile.address}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!company.stateBillingProfiles?.length && <p className="rounded-md border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">No state profiles added.</p>}
            </div>
          </div>
          <div>
            <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-slate-500">Entity Images</p>
            <div className="grid gap-4 md:grid-cols-2">
              {[{ label: "Entity Logo", url: company.logoUrl }, { label: "Entity Stamp", url: company.stampUrl }].map(({ label, url }) => (
                <div key={label} className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3">
                  <div className="flex h-28 items-center justify-center overflow-hidden">
                    {url ? <img src={url} alt={label} className="max-h-full max-w-full object-contain" loading="lazy" /> : <Image size={22} className="text-slate-300" />}
                  </div>
                  <p className="mt-2 text-center text-xs font-bold text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          {onSelect && (
            <button onClick={() => { onSelect(company); onClose(); }}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700">
              Select
            </button>
          )}
          <button onClick={onClose} className="rounded-md bg-slate-950 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

export default CompanyList;
