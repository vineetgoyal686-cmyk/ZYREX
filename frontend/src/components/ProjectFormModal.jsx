import React, { useState, useRef } from "react";
import { Plus, X, Image } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const ACCEPT = "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp,image/svg+xml";

const emptyForm = {
  projectName: "", projectCode: "", city: "", state: "",
  pincode: "", address: "", district: "",
  logo: null, logoPreview: "",
  contacts: [],
};

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

/** Add / Edit project — same form as Manage Projects */
export default function ProjectFormModal({ editData, onClose, onSuccess, onError }) {
  const editId = editData?.id ?? null;
  const [form, setForm] = useState(() => {
    if (!editData) return { ...emptyForm };
    return {
      ...emptyForm,
      ...editData,
      projectName: editData.projectName || editData.project_name || "",
      projectCode: editData.projectCode || editData.project_code || "",
      city: editData.city || "",
      district: editData.district || "",
      state: editData.state || "",
      pincode: editData.pincode || "",
      address: editData.address || "",
      logo: null,
      logoPreview: editData.logoUrl || editData.logo_url || "",
      contacts: editData.contacts || [],
    };
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.projectName.trim()) {
      onError?.("Project Name is required");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === "logoPreview") return;
        if (k === "contacts") { fd.append("contacts", JSON.stringify(v)); return; }
        if (v instanceof File) fd.append(k, v);
        else if (v !== null && v !== undefined) fd.append(k, String(v));
      });
      const url = editId ? `${API}/api/projects/${editId}` : `${API}/api/projects`;
      const method = editId ? "PUT" : "POST";
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      fd.append("createdById", u.id || "");
      fd.append("createdByName", u.name || "");
      const res = await fetch(url, { method, body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to save");
      onSuccess?.(data.id || editId);
      onClose?.();
    } catch (err) {
      onError?.(err.message || "Failed to save");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2200] flex items-center justify-center p-4">
      <div className="bg-white rounded-md shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-800">{editId ? "Edit Project" : "Add New Project"}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{editId ? "Update project details" : "Fill in the details below"}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-sm hover:bg-slate-100 text-slate-400 transition-colors"><X size={16} /></button>
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
                  <button type="button" onClick={() => setForm(f => ({ ...f, contacts: f.contacts.filter((_, j) => j !== i) }))}
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
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-sm border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-white transition-all">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-sm bg-linear-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:shadow-md hover:shadow-blue-200 transition-all disabled:opacity-50">
            {saving ? "Saving…" : (editId ? "Update Project" : "Add Project")}
          </button>
        </div>
      </div>
    </div>
  );
}
