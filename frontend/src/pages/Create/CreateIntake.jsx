import React, { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, X, FileText, Upload, Save, Send,
  ChevronDown, Loader2, CheckCircle2, PackagePlus, Hash,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const inp  = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 text-slate-700 bg-white transition-all";
const lbl  = "block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider";

const emptyItem = () => ({
  id:           Date.now() + Math.random(),
  product_name: "",
  make:         "",
  unit:         "",
  existing_qty: "",
  raised_qty:   "",
  remarks:      "",
  files:        [], // max 5 File objects
});

const Toast = ({ msg, type }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3 shadow-lg text-sm font-semibold
    ${type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
    {type === "success" ? <CheckCircle2 size={16} /> : <X size={16} />}
    {msg}
  </div>
);

/* ─── Item Row component (defined outside to avoid re-mount) ─── */
const ItemRow = ({ item, idx, onChange, onRemove, canRemove }) => {
  const fileRef = useRef();

  const handleFiles = (e) => {
    const picked = Array.from(e.target.files);
    e.target.value = "";
    onChange(idx, "files", [...item.files, ...picked].slice(0, 5));
  };

  return (
    <tr className="group hover:bg-slate-50/60 transition-colors">
      <td className="px-3 py-2.5 text-xs text-slate-400 font-medium w-10 text-center">{idx + 1}</td>

      <td className="px-2 py-2">
        <input className={inp} value={item.product_name}
          onChange={e => onChange(idx, "product_name", e.target.value)}
          placeholder="Product name" />
      </td>
      <td className="px-2 py-2">
        <input className={inp} value={item.make}
          onChange={e => onChange(idx, "make", e.target.value)}
          placeholder="Make / Brand" />
      </td>
      <td className="px-2 py-2 w-24">
        <input className={inp} value={item.unit}
          onChange={e => onChange(idx, "unit", e.target.value)}
          placeholder="Nos / Kg…" />
      </td>
      <td className="px-2 py-2 w-28">
        <input type="number" min="0" className={inp} value={item.existing_qty}
          onChange={e => onChange(idx, "existing_qty", e.target.value)}
          placeholder="0" />
      </td>
      <td className="px-2 py-2 w-28">
        <input type="number" min="0" className={inp} value={item.raised_qty}
          onChange={e => onChange(idx, "raised_qty", e.target.value)}
          placeholder="0" />
      </td>
      <td className="px-2 py-2">
        <input className={inp} value={item.remarks}
          onChange={e => onChange(idx, "remarks", e.target.value)}
          placeholder="Remarks…" />
      </td>

      {/* Attachments — max 5 */}
      <td className="px-2 py-2 w-40">
        <div className="space-y-1">
          {item.files.map((f, fi) => (
            <div key={fi} className="flex items-center gap-1.5 bg-indigo-50 rounded-lg px-2 py-1">
              <FileText size={11} className="text-indigo-500 shrink-0" />
              <span className="text-[10px] text-indigo-700 truncate flex-1 max-w-20">{f.name}</span>
              <button type="button" onClick={() => onChange(idx, "files", item.files.filter((_, i) => i !== fi))}
                className="text-slate-400 hover:text-red-400 shrink-0"><X size={10} /></button>
            </div>
          ))}
          {item.files.length < 5 && (
            <button type="button" onClick={() => fileRef.current.click()}
              className="flex items-center gap-1.5 text-[10px] text-indigo-500 font-semibold hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 border border-dashed border-indigo-200 w-full transition-all">
              <Upload size={10} /> Attach
            </button>
          )}
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx" className="hidden"
            onChange={handleFiles} />
        </div>
      </td>

      <td className="px-2 py-2 w-10 text-center">
        {canRemove && (
          <button type="button" onClick={() => onRemove(idx)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
  );
};

export default function CreateIntake() {
  const currentUser = JSON.parse(localStorage.getItem("bms_user") || "{}");

  const [sites,   setSites]   = useState([]);
  const [toast,   setToast]   = useState(null);
  const [saving,  setSaving]  = useState(null); // "draft" | "submit"
  const [success, setSuccess] = useState(null); // { number, status }

  const [form, setForm] = useState({
    name:           "",
    requisition_by: currentUser.name || "",
    priority:       "Low",
    available_by:   "",
    site_id:        "",
    site_name:      "",
  });

  const [items, setItems]           = useState([emptyItem()]);
  const [intakePreview, setPreview] = useState(null); // next intake number

  useEffect(() => {
    fetch(`${API}/api/procurement/sites`)
      .then(r => r.json())
      .then(d => setSites(d.sites || []))
      .catch(() => {});
  }, []);

  // Fetch next serial number when site changes
  useEffect(() => {
    if (!form.site_id) { setPreview(null); return; }
    fetch(`${API}/api/intakes/serialization/next/intake/${form.site_id}`)
      .then(r => r.json())
      .then(d => setPreview(d.preview || null))
      .catch(() => setPreview(null));
  }, [form.site_id]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const updateItem = (idx, field, value) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const removeItem = (idx) =>
    setItems(prev => prev.filter((_, i) => i !== idx));

  const addItem = () => setItems(prev => [...prev, emptyItem()]);

  const handleSiteChange = (e) => {
    const id   = e.target.value;
    const site = sites.find(s => s.id === id);
    setForm(f => ({ ...f, site_id: id, site_name: site?.siteName || "" }));
  };

  const handleSubmit = async (status) => {
    if (!form.name.trim()) return showToast("Intake name is required", "error");
    if (!form.site_id)     return showToast("Please select a site", "error");
    if (items.every(it => !it.product_name.trim())) return showToast("Add at least one item", "error");

    setSaving(status);
    try {
      const fd = new FormData();
      const intakePayload = {
        ...form,
        status,
        created_by: currentUser.name || "",
        createdById: currentUser.id || "",
        createdByName: currentUser.name || "",
        items: items.filter(it => it.product_name.trim()).map(it => ({
          product_name: it.product_name,
          make:         it.make,
          unit:         it.unit,
          existing_qty: it.existing_qty,
          raised_qty:   it.raised_qty,
          remarks:      it.remarks,
        })),
      };
      fd.append("intakeData", JSON.stringify(intakePayload));

      // Append files: item_N_file_M
      const validItems = items.filter(it => it.product_name.trim());
      validItems.forEach((it, idx) => {
        it.files.forEach((file, fi) => fd.append(`item_${idx}_file_${fi}`, file));
      });

      const res  = await fetch(`${API}/api/intakes`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setSuccess({ number: data.intake_number, status });
      // Reset form
      setForm({ name: "", requisition_by: currentUser.name || "", priority: "Low", available_by: "", site_id: "", site_name: "" });
      setItems([emptyItem()]);
      setPreview(null);
    } catch (err) {
      showToast(err.message, "error");
    }
    setSaving(null);
  };

  if (success) {
    return (
      <div className="p-6 w-full">
        {toast && <Toast msg={toast.msg} type={toast.type} />}
        <div className="max-w-lg mx-auto mt-16 bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={32} className="text-green-500" />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">
            {success.status === "submitted" ? "Intake Submitted!" : "Saved as Draft"}
          </h2>
          {success.number && (
            <p className="text-sm text-slate-500 mb-1">Intake Number: <span className="font-bold font-mono text-indigo-600">{success.number}</span></p>
          )}
          <p className="text-xs text-slate-400 mb-8">
            {success.status === "submitted"
              ? "Intake has been sent to procurement for review."
              : "Draft saved. You can submit it later from the intake list."}
          </p>
          <button onClick={() => setSuccess(null)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-all mx-auto">
            <Plus size={15} /> Create Another Intake
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 w-full">
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
          <PackagePlus size={18} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Create Intake</h1>
          <p className="text-xs text-slate-400">Raise a material purchase requisition</p>
        </div>
      </div>

      {/* Header form */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Name */}
          <div className="lg:col-span-2">
            <label className={lbl}>Intake Name <span className="text-red-400 normal-case font-normal">*</span></label>
            <input className={inp} value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Enter intake name / description" />
          </div>

          {/* Intake Number */}
          <div>
            <label className={lbl}>Intake Number</label>
            <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50">
              <Hash size={13} className="text-slate-400 shrink-0" />
              <span className={`text-sm font-mono font-bold ${intakePreview ? "text-indigo-600" : "text-slate-300"}`}>
                {intakePreview || "Select site to preview"}
              </span>
            </div>
          </div>

          {/* Requisition By */}
          <div>
            <label className={lbl}>Requisition By <span className="text-red-400 normal-case font-normal">*</span></label>
            <input className={inp} value={form.requisition_by}
              onChange={e => setForm(f => ({ ...f, requisition_by: e.target.value }))}
              placeholder="Enter name" />
          </div>

          {/* Priority */}
          <div>
            <label className={lbl}>Priority <span className="text-red-400 normal-case font-normal">*</span></label>
            <div className="relative">
              <select className={`${inp} appearance-none pr-8`} value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Urgent</option>
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Available By */}
          <div>
            <label className={lbl}>Required By Date <span className="text-red-400 normal-case font-normal">*</span></label>
            <input type="date" className={inp} value={form.available_by}
              onChange={e => setForm(f => ({ ...f, available_by: e.target.value }))} />
          </div>

          {/* Site */}
          <div>
            <label className={lbl}>Site <span className="text-red-400 normal-case font-normal">*</span></label>
            <div className="relative">
              <select className={`${inp} appearance-none pr-8`} value={form.site_id} onChange={handleSiteChange}>
                <option value="">Select site…</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.siteName}{s.siteCode ? ` (${s.siteCode})` : ""}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
          <h3 className="text-sm font-bold text-slate-700">Item Details</h3>
          <button onClick={addItem}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 text-indigo-600 text-xs font-semibold hover:bg-indigo-50 transition-all">
            <Plus size={13} /> Add Row
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 w-10">#</th>
                <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 text-left min-w-45">Product Name</th>
                <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 text-left min-w-32">Make</th>
                <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 text-left w-24">Unit</th>
                <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 text-left w-28">Existing Qty</th>
                <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 text-left w-28">Raised Qty</th>
                <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 text-left min-w-40">Remarks</th>
                <th className="px-2 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 text-left w-40">Attachments (max 5)</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((item, idx) => (
                <ItemRow key={item.id} item={item} idx={idx}
                  onChange={updateItem} onRemove={removeItem} canRemove={items.length > 1} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 border-t border-slate-50 bg-slate-50/50">
          <button onClick={addItem}
            className="flex items-center gap-1.5 text-xs text-indigo-500 font-semibold hover:text-indigo-700 transition-colors">
            <Plus size={13} /> Add another row
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => handleSubmit("draft")}
          disabled={!!saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-all">
          {saving === "draft" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save as Draft
        </button>
        <button
          onClick={() => handleSubmit("submitted")}
          disabled={!!saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm">
          {saving === "submitted" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          Submit to Procurement
        </button>
        <p className="text-xs text-slate-400">Draft can be submitted later · Submitted goes to procurement panel</p>
      </div>
    </div>
  );
}
