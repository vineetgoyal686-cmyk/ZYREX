import React, { useState, useEffect } from "react";
import { Eye, Edit2, Trash2, Plus, X, Star, MapPin, Phone, Mail, FileText, Building2 } from "lucide-react";
import { INDIA_STATES } from "../../data/indiaStateCities";
import { useModulePermissions } from "../../hooks/useModulePermissions";

const API          = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN        = () => localStorage.getItem("bms_token") || "";
const BRANCH_TYPES = ["Branch", "Head Quarter", "Regional Office", "Site Office", "Warehouse", "Sales Office"];
const mapBranch    = (b) => ({ ...b, isMain: b.is_main ?? b.isMain ?? false, status: b.status ? (b.status.charAt(0).toUpperCase() + b.status.slice(1)) : "Active" });

const ini = n => (n || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

const EMPTY_FORM = {
  label: "", code: "", type: "Branch", status: "Active",
  gstin: "", phone: "", email: "",
  state: "", city: "", pincode: "", address: "",
  isMain: false, contacts: [],
};
const EMPTY_CONTACT = { name: "", designation: "", email: "", phone: "", primary: false };

const SEL = "w-full border border-slate-200 rounded px-2.5 py-1.5 text-[13px] text-slate-800 bg-slate-50 focus:outline-none focus:border-blue-400 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.6rem_center]";
const INP = "w-full border border-slate-200 rounded px-2.5 py-1.5 text-[13px] text-slate-800 bg-slate-50 focus:outline-none focus:border-blue-400";
const LBL = "text-[11px] text-slate-500 block mb-1";

/* ── Avatar ─────────────────────────────────────────── */
function Avatar({ name, size = 24 }) {
  const colors = ["bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700"];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return (
    <div className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${colors[h % colors.length]}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {ini(name)}
    </div>
  );
}

/* ── View Modal ──────────────────────────────────────── */
function ViewModal({ branch, onClose, onEdit }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-black/40 overflow-y-auto py-6" onClick={onClose}>
      <div className="bg-white rounded border border-slate-200 shadow-2xl w-[460px] mx-4 shrink-0" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">{branch.type}</span>
            <p className="text-[14px] font-medium text-slate-800">{branch.label}</p>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button onClick={onEdit} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-slate-200 rounded text-slate-600 hover:bg-slate-50">
                <Edit2 size={11}/> Edit
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 ml-1"><X size={15}/></button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Branch Info */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-2">Branch Info</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Branch Code", branch.code],
                ["Type",        branch.type],
                ["Status",      branch.status],
                ["GSTIN",       branch.gstin],
                ["Phone",       branch.phone],
                ["Email",       branch.email],
                ["State",       branch.state],
                ["City",        branch.city],
                ["Pincode",     branch.pincode],
              ].map(([l, v]) => (
                <div key={l}>
                  <p className="text-[11px] text-slate-400">{l}</p>
                  <p className="text-[13px] font-medium text-slate-800 mt-0.5">{v || "—"}</p>
                </div>
              ))}
              <div className="col-span-2">
                <p className="text-[11px] text-slate-400">Address</p>
                <p className="text-[13px] font-medium text-slate-800 mt-0.5">{branch.address || "—"}</p>
              </div>
            </div>
          </div>

          {/* Contacts */}
          {branch.contacts?.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-2">Contacts</p>
              <div className="space-y-2">
                {branch.contacts.map((c, i) => (
                  <div key={i} className="bg-slate-50 rounded p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={c.name || "?"} size={30}/>
                        <div>
                          <p className="text-[13px] font-medium text-slate-800">{c.name}</p>
                          <p className="text-[11px] text-slate-500">{c.designation}</p>
                        </div>
                      </div>
                      {c.primary && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium flex items-center gap-1">
                          <Star size={9} fill="currentColor"/> Primary
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 mt-2">
                      {c.phone && <p className="flex items-center gap-1.5 text-[12px] text-slate-500"><Phone size={11}/>{c.phone}</p>}
                      {c.email && <p className="flex items-center gap-1.5 text-[12px] text-slate-500"><Mail size={11}/>{c.email}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Form Modal ──────────────────────────────────────── */
function FormModal({ initial, onSave, onClose }) {
  const [form, setForm]   = useState(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM);
  const set = (k, v)      => setForm(f => ({ ...f, [k]: v }));

  const addContact    = () => setForm(f => ({ ...f, contacts: [...f.contacts, { ...EMPTY_CONTACT }] }));
  const removeContact = i  => setForm(f => ({ ...f, contacts: f.contacts.filter((_, x) => x !== i) }));
  const setContact    = (i, k, v) => setForm(f => {
    const contacts = f.contacts.map((c, x) => {
      if (k === "primary") return { ...c, primary: x === i };
      return x === i ? { ...c, [k]: v } : c;
    });
    return { ...f, contacts };
  });

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.label.trim()) return alert("Branch label required");
    onSave({ ...form });
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-black/40 overflow-y-auto py-6">
      <div className="bg-white rounded border border-slate-200 shadow-2xl w-[520px] mx-4 shrink-0 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-3.5 border-b border-slate-100 sticky top-0 bg-white z-10 shrink-0">
          <div>
            <p className="text-[14px] font-medium text-slate-800">{form.id ? "Edit Branch" : "Add Branch"}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Fill branch details, address and contacts</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 mt-0.5"><X size={15}/></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          {/* Branch Info */}
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5"><Building2 size={11}/> Branch Info</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={LBL}>Branch Label *</label>
                <input value={form.label} onChange={e => set("label", e.target.value)} placeholder="e.g. Gurgaon Head Quarter" className={INP}/>
              </div>
              <div>
                <label className={LBL}>Branch Code</label>
                <input value={form.code} onChange={e => set("code", e.target.value)} placeholder="e.g. GHQ" className={INP}/>
              </div>
              <div>
                <label className={LBL}>Type</label>
                <select value={form.type} onChange={e => set("type", e.target.value)} className={SEL}>
                  {BRANCH_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Status</label>
                <select value={form.status} onChange={e => set("status", e.target.value)} className={SEL}>
                  <option>Active</option><option>Inactive</option>
                </select>
              </div>
              <div>
                <label className={LBL}>GSTIN</label>
                <input value={form.gstin} onChange={e => set("gstin", e.target.value)} placeholder="Branch GSTIN" className={INP}/>
              </div>
              <div>
                <label className={LBL}>Phone</label>
                <input value={form.phone} onChange={e => set("phone", e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="Branch phone" inputMode="numeric" className={INP}/>
              </div>
              <div className="col-span-2">
                <label className={LBL}>Email</label>
                <input value={form.email} onChange={e => set("email", e.target.value)} placeholder="branch@company.com" className={INP}/>
              </div>
            </div>
            {/* Main Branch toggle */}
            <div className="flex items-center gap-2.5 mt-3">
              <button type="button" onClick={() => set("isMain", !form.isMain)}
                className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${form.isMain ? "bg-blue-600" : "bg-slate-200"}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isMain ? "left-4" : "left-0.5"}`}/>
              </button>
              <span className="text-[13px] text-slate-700">Mark as Main Branch</span>
              {form.isMain && <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-700">Main Branch</span>}
            </div>
          </div>

          {/* Address */}
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5"><MapPin size={11}/> Address</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>State</label>
                <select value={form.state} onChange={e => set("state", e.target.value)} className={SEL}>
                  <option value="">Select state</option>
                  {INDIA_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>City</label>
                <input value={form.city} onChange={e => set("city", e.target.value)} placeholder="City" className={INP}/>
              </div>
              <div>
                <label className={LBL}>Pincode</label>
                <input value={form.pincode} onChange={e => set("pincode", e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="122001" inputMode="numeric" className={INP}/>
              </div>
              <div/>
              <div className="col-span-2">
                <label className={LBL}>Full Address</label>
                <textarea value={form.address} onChange={e => set("address", e.target.value)} placeholder="Complete address" rows={2} className={INP + " resize-none"}/>
              </div>
            </div>
          </div>

          {/* Contacts */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Phone size={11}/> Contacts</p>
              <button type="button" onClick={addContact} className="text-[12px] text-blue-600 flex items-center gap-1 hover:text-blue-700">
                <Plus size={12}/> Add Contact
              </button>
            </div>
            {form.contacts.length === 0 && (
              <p className="text-[12px] text-slate-400 italic">No contacts. Click "Add Contact".</p>
            )}
            <div className="space-y-3">
              {form.contacts.map((c, i) => (
                <div key={i} className={`rounded border p-3 ${c.primary ? "border-blue-200 bg-blue-50/30" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-center justify-between mb-2.5">
                    <button type="button" onClick={() => setContact(i, "primary", true)}
                      className="flex items-center gap-1.5 text-[12px] cursor-pointer">
                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${c.primary ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}>
                        {c.primary && <span className="w-1.5 h-1.5 bg-white rounded-full"/>}
                      </span>
                      <Star size={12} className={c.primary ? "text-blue-600" : "text-slate-300"} fill={c.primary ? "currentColor" : "none"}/>
                      <span className={c.primary ? "text-blue-600 font-medium" : "text-slate-500"}>
                        {c.primary ? "Primary Contact" : "Mark as Primary"}
                      </span>
                    </button>
                    <button type="button" onClick={() => removeContact(i)} className="text-slate-300 hover:text-red-400"><X size={13}/></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={LBL}>Name</label><input value={c.name} onChange={e => setContact(i,"name",e.target.value)} placeholder="Contact name" className={INP}/></div>
                    <div><label className={LBL}>Designation</label><input value={c.designation} onChange={e => setContact(i,"designation",e.target.value)} placeholder="e.g. Admin" className={INP}/></div>
                    <div><label className={LBL}>Email</label><input value={c.email} onChange={e => setContact(i,"email",e.target.value)} placeholder="Email" className={INP}/></div>
                    <div><label className={LBL}>Phone</label><input value={c.phone} onChange={e => setContact(i,"phone",e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="Phone" inputMode="numeric" className={INP}/></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 shrink-0 bg-white sticky bottom-0">
          <button type="button" onClick={onClose} className="px-4 py-1.5 text-[12px] font-medium border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-1.5 text-[12px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700">
            {initial?.id ? "Save Changes" : "Save Branch"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Branch Card ─────────────────────────────────────── */
function BranchCard({ branch, onView, onEdit, onDelete }) {
  return (
    <div className={`bg-white rounded overflow-hidden ${branch.isMain ? "border border-blue-500" : "border border-slate-200"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-medium text-slate-800">{branch.label}</p>
          {branch.isMain && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium flex items-center gap-1">
              <Star size={9} fill="currentColor"/> Main Branch
            </span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">{branch.type}</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <button onClick={onView}  className="hover:text-blue-600 transition-colors"><Eye size={15}/></button>
          {onEdit && <button onClick={onEdit}  className="hover:text-blue-600 transition-colors"><Edit2 size={15}/></button>}
          {onDelete && <button onClick={onDelete} className="hover:text-red-500 transition-colors"><Trash2 size={15}/></button>}
        </div>
      </div>

      {/* Body — 3 columns */}
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        {/* Location */}
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Location</p>
          <div className="flex items-start gap-1.5 text-[12px] text-slate-600 mb-1.5">
            <MapPin size={12} className="mt-0.5 shrink-0 text-slate-400"/>
            <span>
              {branch.address && <span>{branch.address}, </span>}
              {[branch.city, branch.state].filter(Boolean).join(", ")}
              {branch.pincode ? ` — ${branch.pincode}` : ""}
            </span>
          </div>
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${branch.status === "Active" ? "text-emerald-600" : "text-slate-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${branch.status === "Active" ? "bg-emerald-500" : "bg-slate-300"}`}/>
            {branch.status}
          </span>
        </div>

        {/* Contact Info */}
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Contact Info</p>
          <div className="space-y-1.5">
            {branch.phone && <div className="flex items-center gap-1.5 text-[12px] text-slate-600"><Phone size={11} className="text-slate-400"/>{branch.phone}</div>}
            {branch.email && <div className="flex items-center gap-1.5 text-[12px] text-slate-600"><Mail size={11} className="text-slate-400"/>{branch.email}</div>}
            {branch.gstin && <div className="flex items-center gap-1.5 text-[12px] text-slate-600"><FileText size={11} className="text-slate-400"/>{branch.gstin}</div>}
            {!branch.phone && !branch.email && !branch.gstin && <p className="text-[12px] text-slate-300 italic">—</p>}
          </div>
        </div>

        {/* Branch Contacts */}
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
            Branch Contacts {branch.contacts?.length > 0 && `(${branch.contacts.length})`}
          </p>
          <div className="space-y-2">
            {(branch.contacts || []).slice(0, 2).map((c, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <Avatar name={c.name || "?"} size={22}/>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-[12px] font-medium text-slate-800 truncate">{c.name}</p>
                    {c.primary && <Star size={11} className="text-blue-500 shrink-0" fill="currentColor"/>}
                  </div>
                  {c.designation && <p className="text-[11px] text-slate-400 truncate">{c.designation}</p>}
                  {c.phone && (
                    <p className="flex items-center gap-1 text-[11px] text-slate-500">
                      <Phone size={10} className="text-slate-400 shrink-0"/>{c.phone}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {branch.contacts?.length > 2 && (
              <button onClick={onView} className="text-[11px] text-blue-600 hover:underline">
                +{branch.contacts.length - 2} more
              </button>
            )}
            {(!branch.contacts || branch.contacts.length === 0) && (
              <p className="text-[12px] text-slate-300 italic">No contacts</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────── */
export default function Locations({ actionsRef }) {
  const { canAdd, canEdit, canDelete } = useModulePermissions("locations");
  const [branches, setBranches] = useState([]);
  const [modal,    setModal]    = useState(null);
  const [viewing,  setViewing]  = useState(null);

  const fetchBranches = async () => {
    const res = await fetch(`${API}/api/organisation/branches`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
    const d   = await res.json();
    setBranches((d.branches || []).map(mapBranch));
  };
  useEffect(() => { fetchBranches(); }, []);

  useEffect(() => {
    if (actionsRef) actionsRef.current = { openAdd: () => setModal("add") };
    return () => { if (actionsRef) actionsRef.current = {}; };
  });

  const save = async branch => {
    const payload = { ...branch, is_main: branch.isMain, status: branch.status?.toLowerCase() };
    delete payload.isMain;
    const isAdd = !branch.id;
    const url = isAdd ? `${API}/api/organisation/branches` : `${API}/api/organisation/branches/${branch.id}`;
    await fetch(url, { method: isAdd ? "POST" : "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` }, body: JSON.stringify(payload) });
    await fetchBranches();
    setModal(null);
  };

  const remove = async id => {
    if (!confirm("Delete this branch?")) return;
    await fetch(`${API}/api/organisation/branches/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN()}` } });
    fetchBranches();
  };

  return (
    <>
      {viewing && (
        <ViewModal branch={viewing} onClose={() => setViewing(null)}
          onEdit={canEdit ? () => { setModal(viewing); setViewing(null); } : undefined}/>
      )}
      {modal && (
        <FormModal initial={modal === "add" ? null : modal} onSave={save} onClose={() => setModal(null)}/>
      )}

      <div className="space-y-3">
        {branches.length === 0 ? (
          <div className="bg-white rounded border border-slate-200 flex flex-col items-center justify-center py-16 gap-3">
            <Building2 size={32} className="text-slate-200"/>
            <p className="text-[13px] text-slate-400">No branches added yet</p>
            {canAdd && (
              <button onClick={() => setModal("add")}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">
                <Plus size={13}/> Add Branch
              </button>
            )}
          </div>
        ) : (
          branches.map(b => (
            <BranchCard key={b.id} branch={b}
              onView={() => setViewing(b)}
              onEdit={canEdit ? () => setModal(b) : undefined}
              onDelete={canDelete ? () => remove(b.id) : undefined}/>
          ))
        )}
      </div>
    </>
  );
}
