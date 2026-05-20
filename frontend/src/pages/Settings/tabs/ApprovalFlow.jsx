import { useState, useEffect, useCallback, useRef } from "react";
import {
  Workflow, Plus, Eye, Pencil, Trash2, Loader2, X, ChevronDown,
  GripVertical, AlertCircle, Check, ChevronLeft, Settings2, Users,
} from "lucide-react";
import api from "../../../utils/api";
import { SiteDetailPanel } from "../../Procurement/SiteList";
import { CompanyDetailPanel } from "../../Procurement/CompanyList";
import { CategoryDetailPanel } from "../../Procurement/CategoryList";

const MODULES = [
  { key: "order", label: "Order" },
];

const CONDITION_FIELDS = [
  { value: "price",          label: "Price" },
  { value: "category",       label: "Category" },
  { value: "billing_entity", label: "Billing Entity" },
  { value: "site",           label: "Site" },
];

const CONDITION_OPS = [
  { value: "is_equal_to",        label: "is equal to" },
  { value: "greater_than",       label: "greater than" },
  { value: "less_than",          label: "less than" },
  { value: "greater_than_equal", label: "greater than or equal" },
  { value: "less_than_equal",    label: "less than or equal" },
];

const blankForm = () => ({
  name: "", status: "active",
  self_approve_below: "", escalation_days: "1", description: "",
  conditions_match: "all", conditions: [], config_options: {}, levels: [],
});

const uid = () => Math.random().toString(36).slice(2);

/* ── small reusable ── */
const Label = ({ children }) => (
  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">{children}</p>
);

const Input = ({ className = "", ...props }) => (
  <input
    className={`w-full border border-slate-300 rounded-sm text-[12px] px-2.5 py-1.5 text-slate-800
      focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 bg-white ${className}`}
    {...props}
  />
);

const Select = ({ children, className = "", ...props }) => (
  <div className="relative">
    <select
      className={`w-full appearance-none border border-slate-300 rounded-sm text-[12px] pl-2.5 pr-7 py-1.5
        text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 bg-white ${className}`}
      {...props}
    >
      {children}
    </select>
    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
      <ChevronDown size={12} className="text-slate-400" />
    </div>
  </div>
);

/* ══════════════════════════════════════════════
   LEVEL EDITOR — department + designations
══════════════════════════════════════════════ */
function LevelCard({ level, levelIdx, allUsers, designations, onChange, onRemove }) {
  const updateField = (key, val) => onChange({ ...level, [key]: val });

  const addDesignation = (desigId) => {
    if (!desigId) return;
    const found = designations.find(d => d.id === desigId);
    if (!found) return;
    if (level.designations.find(d => d.designation_id === desigId)) return;
    onChange({
      ...level,
      designations: [...level.designations, {
        _id: uid(), designation_id: desigId,
        designation_name: found.name,
        required: true, parallel: false,
        time_enabled: false, time_limit: 1, time_unit: "day", users: [],
      }],
    });
  };

  const updateDesig = (idx, patch) => {
    const updated = level.designations.map((d, i) => i === idx ? { ...d, ...patch } : d);
    onChange({ ...level, designations: updated });
  };

  const removeDesig = (idx) => {
    onChange({ ...level, designations: level.designations.filter((_, i) => i !== idx) });
  };

  const toggleUser = (desigIdx, user) => {
    const desig = level.designations[desigIdx];
    const exists = desig.users.find(u => u.id === user.id);
    const newUsers = exists
      ? desig.users.filter(u => u.id !== user.id)
      : [...desig.users, { id: user.id, name: user.name, email: user.email }];
    updateDesig(desigIdx, { users: newUsers });
  };

  const availableDesigs = designations.filter(d => !level.designations.find(ld => ld.designation_id === d.id));
  const [selDesig, setSelDesig] = useState("");

  return (
    <div className="border border-slate-200 rounded-sm bg-white">
      {/* Level header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 bg-slate-50">
        <GripVertical size={14} className="text-slate-300 shrink-0" />
        <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
          #{levelIdx + 1}
        </span>
        <span className="text-[13px] font-semibold text-slate-700">Dept: {level.department_name || "—"}</span>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => updateField("parallel", !level.parallel)}>
            <span className={`text-[11px] font-medium ${level.parallel ? "text-indigo-600" : "text-slate-500"}`}>
              {level.parallel ? "Any one designation enough" : "All designations required"}
            </span>
            <div className={`w-8 h-4 rounded-full transition-colors relative ${level.parallel ? "bg-indigo-600" : "bg-slate-300"}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${level.parallel ? "left-4" : "left-0.5"}`} />
            </div>
          </div>
          <button type="button" onClick={onRemove} className="text-slate-400 hover:text-rose-500 transition">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Add designation */}
        <div>
          <p className="text-[11px] font-semibold text-slate-500 mb-1.5">
            Add Designation <span className="text-slate-400">({availableDesigs.length} available)</span>
          </p>
          <div className="flex gap-2">
            <Select value={selDesig} onChange={e => setSelDesig(e.target.value)} className="flex-1">
              <option value="">Select a designation</option>
              {availableDesigs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <button type="button"
              onClick={() => { addDesignation(selDesig); setSelDesig(""); }}
              className="w-8 h-[30px] shrink-0 flex items-center justify-center rounded-sm bg-indigo-600 text-white hover:bg-indigo-700 transition">
              <Plus size={13} />
            </button>
          </div>
        </div>

        {/* Designations list */}
        {level.designations.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-slate-500">
              Designations <span className="text-slate-400 font-normal">{level.designations.length} items</span>
            </p>
            {level.designations.map((desig, di) => {
              const desigUsers = allUsers.filter(u => {
                const des = designations.find(d => d.id === desig.designation_id);
                return des ? (u.designation === des.name || u.designation_id === des.id) : false;
              });
              const availableUsers = desigUsers.length > 0 ? desigUsers : allUsers;

              return (
                <div key={desig._id || di} className="border border-slate-200 rounded-sm bg-slate-50">
                  {/* Desig header */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200">
                    <GripVertical size={12} className="text-slate-300 shrink-0" />
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-0.5">
                      #{di + 1}
                    </span>
                    <span className="text-[12px] font-semibold text-slate-700">{desig.designation_name}</span>
                    <button type="button" onClick={() => removeDesig(di)} className="ml-auto text-slate-400 hover:text-rose-500">
                      <X size={13} />
                    </button>
                  </div>

                  <div className="p-3 space-y-2.5">
                    {/* Required + Parallel */}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center justify-between border border-slate-200 rounded-sm px-2.5 py-1.5 bg-white cursor-pointer">
                        <span className="text-[11px] text-slate-600">Required</span>
                        <div className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${desig.required ? "bg-indigo-600" : "bg-slate-300"}`}
                          onClick={() => updateDesig(di, { required: !desig.required })}>
                          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${desig.required ? "left-4" : "left-0.5"}`} />
                        </div>
                      </label>
                      <div className="flex items-center justify-between border border-slate-200 rounded-sm px-2.5 py-1.5 bg-white cursor-pointer"
                        onClick={() => updateDesig(di, { parallel: !desig.parallel })}>
                        <span className={`text-[11px] font-medium ${desig.parallel ? "text-indigo-600" : "text-slate-600"}`}>
                          {desig.parallel ? "Any one user enough" : "All users required"}
                        </span>
                        <div className={`w-8 h-4 rounded-full transition-colors relative ${desig.parallel ? "bg-indigo-600" : "bg-slate-300"}`}>
                          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${desig.parallel ? "left-4" : "left-0.5"}`} />
                        </div>
                      </div>
                    </div>

                    {/* Time limit */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] text-slate-500">Time Limit</p>
                        <div className="flex items-center gap-2 cursor-pointer"
                          onClick={() => updateDesig(di, { time_enabled: !desig.time_enabled })}>
                          <span className={`text-[10px] font-medium ${desig.time_enabled ? "text-indigo-600" : "text-slate-400"}`}>
                            {desig.time_enabled ? "Enabled" : "Disabled"}
                          </span>
                          <div className={`w-7 h-3.5 rounded-full transition-colors relative ${desig.time_enabled ? "bg-indigo-600" : "bg-slate-300"}`}>
                            <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow transition-all ${desig.time_enabled ? "left-3.5" : "left-0.5"}`} />
                          </div>
                        </div>
                      </div>
                      {desig.time_enabled && (
                        <div className="flex gap-2">
                          <Input type="number" min="1" value={desig.time_limit}
                            onChange={e => updateDesig(di, { time_limit: e.target.value })} className="flex-1" />
                          <Select value={desig.time_unit} onChange={e => updateDesig(di, { time_unit: e.target.value })} className="w-24">
                            <option value="hour">Hour</option>
                            <option value="day">Day</option>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Employees */}
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">
                        Employees <span className="text-slate-400">({availableUsers.length} available, {desig.users.length} selected)</span>
                      </p>
                      <div className="border border-slate-200 rounded-sm bg-white max-h-32 overflow-y-auto">
                        {availableUsers.length === 0 ? (
                          <p className="text-[11px] text-slate-400 p-2 italic">No users found</p>
                        ) : availableUsers.map(u => (
                          <label key={u.id} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox"
                              checked={!!desig.users.find(su => su.id === u.id)}
                              onChange={() => toggleUser(di, u)}
                              className="w-3 h-3 rounded" />
                            <div>
                              <p className="text-[12px] font-medium text-slate-700">{u.name}</p>
                              <p className="text-[10px] text-slate-400">{u.email}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      {/* Selected chips */}
                      {desig.users.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {desig.users.map(u => (
                            <span key={u.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full text-[10px] font-medium">
                              {u.name}
                              <button type="button" onClick={() => toggleUser(di, u)}
                                className="hover:bg-indigo-200 rounded-full transition">
                                <X size={9} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   EDIT / CREATE FORM
══════════════════════════════════════════════ */
function ConditionValueInput({ field, value, valueLabel, onChange }) {
  const [search, setSearch]   = useState("");
  const [open, setOpen]       = useState(false);
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewItem, setViewItem] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (field === "price") return;
    setLoading(true);
    const ep = field === "category" ? "/api/procurement/categories" : field === "billing_entity" ? "/api/procurement/companies" : "/api/procurement/sites";
    api.get(ep).then(({ data }) => {
      if (field === "category")            setItems(data.categories || []);
      else if (field === "billing_entity") setItems(data.companies  || []);
      else                                 setItems(data.sites      || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [field]);

  if (field === "price") {
    return (
      <div className="relative flex-1">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">₹</span>
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder="Enter amount" className="pl-6" />
      </div>
    );
  }

  const filtered = items.filter(item => {
    const q = search.toLowerCase();
    if (field === "category")       return (item.categoryName || "").toLowerCase().includes(q) || (item.categoryCode || "").toLowerCase().includes(q);
    if (field === "billing_entity") return (item.companyName  || "").toLowerCase().includes(q) || (item.companyCode  || "").toLowerCase().includes(q);
    return (item.siteName || "").toLowerCase().includes(q) || (item.siteCode || "").toLowerCase().includes(q);
  });

  const getLabel = (id) => {
    const item = items.find(i => String(i.id) === String(id));
    if (!item) return "";
    if (field === "category")       return `${item.categoryName} (${item.categoryCode})`;
    if (field === "billing_entity") return `${item.companyName} (${item.companyCode})`;
    return `${item.siteName} (${item.siteCode})`;
  };

  const placeholder = field === "category" ? "Select category" : field === "billing_entity" ? "Select entity" : "Select site";

  const handleSelectFromPanel = (item) => {
    const id = String(item.id);
    const lbl = field === "category" ? item.categoryName : field === "billing_entity" ? item.companyName : `${item.siteName} (${item.siteCode})`;
    onChange(id, lbl);
    setViewItem(null);
    setOpen(false);
  };

  return (
    <>
      <div className="relative flex-1" ref={ref}>
        <button type="button" onClick={() => { setOpen(o => !o); setSearch(""); }}
          className="w-full border border-slate-300 rounded-sm text-[12px] px-2.5 py-1.5 text-left bg-white flex items-center justify-between gap-2 focus:outline-none focus:border-indigo-400">
          <span className={value ? "text-slate-800" : "text-slate-400"}>{value ? (getLabel(value) || valueLabel || value) : placeholder}</span>
          <ChevronDown size={13} className="text-slate-400 shrink-0" />
        </button>
        {open && (
          <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-sm shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100">
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full text-[12px] px-3 py-1.5 border border-slate-200 rounded-md bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors" />
            </div>
            {!loading && (
              <div className="px-3 py-1.5 border-b border-slate-100">
                <p className="text-[10px] text-slate-400 font-medium">{filtered.length} results found</p>
              </div>
            )}
            <div className="max-h-52 overflow-y-auto">
              {loading ? (
                <p className="text-center text-[11px] text-slate-400 py-4">Loading...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-[11px] text-slate-400 py-4">No results found</p>
              ) : filtered.map(item => {
                const id  = String(item.id);
                const sel = String(value) === id;
                let line1, line2;
                if (field === "category") {
                  line1 = item.categoryName; line2 = item.categoryCode;
                } else if (field === "billing_entity") {
                  line1 = item.companyName; line2 = `Code: ${item.companyCode}${item.gstin ? ` · GSTIN: ${item.gstin}` : ""}`;
                } else {
                  line1 = `${item.siteName} (${item.siteCode})`; line2 = [item.city, item.state].filter(Boolean).join(", ");
                }
                return (
                  <div key={id} className={`flex items-center border-b border-slate-50 last:border-0 ${sel ? "bg-indigo-50" : "hover:bg-slate-50"} transition-colors`}>
                    <button type="button"
                      onClick={() => { onChange(id, line1); setOpen(false); }}
                      className="flex-1 text-left px-4 py-2.5">
                      <p className={`text-[12px] font-semibold leading-snug truncate ${sel ? "text-indigo-700" : "text-slate-800"}`}>{line1}</p>
                      {line2 && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{line2}</p>}
                    </button>
                    <button type="button"
                      onClick={e => { e.stopPropagation(); setOpen(false); setViewItem(item); }}
                      className="px-3 py-2.5 text-slate-300 hover:text-indigo-500 transition-colors shrink-0 border-l border-slate-100">
                      <ChevronDown size={13} className="-rotate-90" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Full detail panels rendered as centered modals */}
      {viewItem && field === "category" && (
        <CategoryDetailPanel category={viewItem} onClose={() => setViewItem(null)} onSelect={handleSelectFromPanel} />
      )}
      {viewItem && field === "billing_entity" && (
        <CompanyDetailPanel company={viewItem} onClose={() => setViewItem(null)} onSelect={handleSelectFromPanel} />
      )}
      {viewItem && field === "site" && (
        <SiteDetailPanel site={viewItem} onClose={() => setViewItem(null)} onSelect={handleSelectFromPanel} />
      )}
    </>
  );
}

function FlowForm({ flow, module, allUsers, designations, onSave, onBack, saving }) {
  const [form, setForm] = useState(() => flow
    ? { ...flow, self_approve_below: flow.self_approve_below ?? "", escalation_days: flow.escalation_days ?? 1 }
    : { ...blankForm(), module }
  );
  const [selDept, setSelDept] = useState("");

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addCondition = () => setField("conditions", [...form.conditions, { _id: uid(), field: "price", operator: "greater_than", value: "" }]);
  const removeCondition = (idx) => setField("conditions", form.conditions.filter((_, i) => i !== idx));
  const updateCondition = (idx, patch) => setField("conditions", form.conditions.map((c, i) => i === idx ? { ...c, ...patch } : c));

  const addLevel = () => {
    if (!selDept.trim()) return;
    setField("levels", [...form.levels, { _id: uid(), department_name: selDept, parallel: false, designations: [] }]);
    setSelDept("");
  };

  const updateLevel = (idx, val) => setField("levels", form.levels.map((l, i) => i === idx ? val : l));
  const removeLevel  = (idx) => setField("levels", form.levels.filter((_, i) => i !== idx));

  const toggleConfig = (key) => setField("config_options", { ...form.config_options, [key]: !form.config_options[key] });

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <button type="button" onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-sm border border-slate-300 hover:bg-slate-50 transition">
          <ChevronLeft size={15} className="text-slate-600" />
        </button>
        <div>
          <h3 className="text-[14px] font-bold text-slate-800">{flow ? "Edit Approval Flow" : "New Approval Flow"}</h3>
          <p className="text-[11px] text-slate-400">{MODULES.find(m => m.key === module)?.label} module</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onBack}
            className="h-8 px-4 rounded-sm border border-slate-300 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition">
            Cancel
          </button>
          <button type="button" onClick={() => onSave(form)} disabled={saving || !form.name.trim()}
            className="h-8 px-5 rounded-sm bg-indigo-600 text-white text-[12px] font-bold hover:bg-indigo-700 disabled:opacity-40 transition flex items-center gap-2">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {flow ? "Update" : "Create"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* Approval Configuration */}
        <div className="bg-white border border-slate-200 rounded-sm p-4 space-y-3">
          <p className="text-[13px] font-bold text-slate-800 flex items-center gap-2">
            <Settings2 size={14} className="text-slate-500" /> Approval Configuration
          </p>
          <div className="grid grid-cols-[1fr_180px] gap-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. PO Approval Workflow" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={e => setField("status", e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Self Approve Below Amount (₹)</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">₹</span>
              <input
                type="text"
                inputMode="numeric"
                value={form.self_approve_below ? Number(form.self_approve_below).toLocaleString("en-IN") : ""}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  setField("self_approve_below", raw);
                }}
                placeholder="e.g. 10,000 (leave blank to disable)"
                className="w-full border border-slate-300 rounded-sm text-[12px] pl-6 pr-2.5 py-1.5 text-slate-800
                  focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 bg-white"
              />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <textarea value={form.description} onChange={e => setField("description", e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="w-full border border-slate-300 rounded-sm text-[12px] px-2.5 py-1.5 text-slate-800
                focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 bg-white resize-none" />
          </div>
        </div>

        {/* Conditions */}
        <div className="bg-white border border-slate-200 rounded-sm p-4 space-y-3">
          <div>
            <p className="text-[13px] font-bold text-slate-800">Conditions</p>
            <p className="text-[11px] text-slate-400">Define conditions for when this approval flow should be applied</p>
          </div>
          <div className="flex items-center gap-4 text-[12px] text-slate-600">
            <span>Conditions must match:</span>
            {["all", "any"].map(m => (
              <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="cond_match" value={m}
                  checked={form.conditions_match === m}
                  onChange={() => setField("conditions_match", m)}
                  className="w-3.5 h-3.5" />
                {m === "all" ? "all conditions" : "any condition"}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            {form.conditions.length > 0 && (
              <div className="grid gap-2 px-0.5" style={{ gridTemplateColumns: "140px 160px 1fr 30px" }}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Field</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Operator</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Value</p>
                <span />
              </div>
            )}
            {form.conditions.map((c, idx) => {
              const isLookup = ["category", "billing_entity", "site"].includes(c.field);
              return (
                <div key={c._id || idx} className="grid items-center gap-2" style={{ gridTemplateColumns: "140px 160px 1fr 30px" }}>
                  <Select value={c.field}
                    onChange={e => updateCondition(idx, { field: e.target.value, value: "", value_label: "", operator: ["category","billing_entity","site"].includes(e.target.value) ? "is_equal_to" : "greater_than" })}>
                    {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </Select>
                  {isLookup ? (
                    <div className="border border-slate-200 rounded-sm text-[12px] px-2.5 py-1.5 text-slate-400 bg-slate-50 select-none">
                      is equal to
                    </div>
                  ) : (
                    <Select value={c.operator} onChange={e => updateCondition(idx, { operator: e.target.value })}>
                      {CONDITION_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  )}
                  <ConditionValueInput
                    field={c.field}
                    value={c.value}
                    valueLabel={c.value_label}
                    onChange={(val, label) => updateCondition(idx, { value: val, value_label: label || val })}
                  />
                  <button type="button" onClick={() => removeCondition(idx)}
                    className="w-[30px] h-[30px] flex items-center justify-center rounded-sm bg-rose-50 border border-rose-200 text-rose-500 hover:bg-rose-100 transition shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={addCondition}
            className="text-[12px] text-indigo-600 font-semibold hover:text-indigo-700 flex items-center gap-1">
            <Plus size={13} /> Add another condition
          </button>
        </div>

        {/* Levels */}
        <div className="bg-white border border-slate-200 rounded-sm p-4 space-y-3">
          <div>
            <p className="text-[13px] font-bold text-slate-800 flex items-center gap-2">
              <Users size={14} className="text-slate-500" />
              Add Departments &amp; Designations to Levels
              <span className="text-[11px] font-normal text-slate-400">({form.levels.length} level{form.levels.length !== 1 ? "s" : ""})</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Input value={selDept} onChange={e => setSelDept(e.target.value)}
              placeholder="Enter department name (e.g. Procurement)" className="flex-1" />
            <button type="button" onClick={addLevel}
              className="w-10 h-[30px] shrink-0 flex items-center justify-center rounded-sm bg-indigo-600 text-white hover:bg-indigo-700 transition">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-3">
            {form.levels.map((level, idx) => (
              <LevelCard key={level._id || idx}
                level={level} levelIdx={idx}
                allUsers={allUsers} designations={designations}
                onChange={val => updateLevel(idx, val)}
                onRemove={() => removeLevel(idx)} />
            ))}
            {form.levels.length === 0 && (
              <p className="text-[12px] text-slate-400 italic text-center py-4">
                No levels added yet. Enter a department name and click + to add.
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   DETAIL VIEW (read-only)
══════════════════════════════════════════════ */
function FlowDetail({ flow, onBack, onEdit }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 bg-white">
        <button type="button" onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-sm border border-slate-300 hover:bg-slate-50 transition">
          <ChevronLeft size={15} className="text-slate-600" />
        </button>
        <h3 className="text-[14px] font-bold text-slate-800">View Approval Flow</h3>
        <div className="ml-auto">
          <button type="button" onClick={onEdit}
            className="h-8 px-4 rounded-sm bg-indigo-600 text-white text-[12px] font-bold hover:bg-indigo-700 transition">
            Edit Approval Flow
          </button>
        </div>
      </div>

      <div className="px-6 space-y-4">
        {/* Config summary */}
        <div className="bg-white border border-slate-200 rounded-sm p-4 space-y-3">
          <p className="text-[13px] font-bold text-slate-800 flex items-center gap-2">
            <Settings2 size={14} className="text-slate-500" /> Approval Flow Configuration
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[12px]">
            <div><p className="text-slate-400 text-[11px]">Used For</p><p className="font-medium text-slate-800">{MODULES.find(m => m.key === flow.module)?.label}</p></div>
            <div><p className="text-slate-400 text-[11px]">Auto-Approve Below</p><p className="font-medium text-slate-800">{flow.self_approve_below ? `₹${parseFloat(flow.self_approve_below).toLocaleString("en-IN")}` : "—"}</p></div>
            <div><p className="text-slate-400 text-[11px]">Status</p>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${flow.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {flow.status === "active" ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>

        {/* Flow overview */}
        <div className="bg-white border border-slate-200 rounded-sm p-4">
          <p className="text-[13px] font-bold text-slate-800 mb-3">Flow Overview</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: "Approval Levels", val: (flow.levels || []).length },
              { label: "People Involved", val: (flow.levels || []).reduce((a, l) => a + (l.designations || []).reduce((b, d) => b + (d.users || []).length, 0), 0) },
              { label: "Time Limits Set", val: (flow.levels || []).some(l => (l.designations || []).some(d => d.time_enabled)) ? "✓" : "—", green: (flow.levels || []).some(l => (l.designations || []).some(d => d.time_enabled)) },
            ].map(s => (
              <div key={s.label}>
                <p className={`text-[22px] font-bold ${s.green ? "text-emerald-600" : "text-slate-800"}`}>{s.val}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Conditions */}
        {(flow.conditions || []).length > 0 && (
          <div className="bg-white border border-slate-200 rounded-sm p-4">
            <p className="text-[13px] font-bold text-slate-800 mb-2">When This Flow Triggers</p>
            <p className="text-[11px] text-slate-400 mb-2">Match {flow.conditions_match === "all" ? "all" : "any"} of the following:</p>
            <div className="space-y-1">
              {flow.conditions.map((c, i) => (
                <p key={i} className="text-[12px] text-slate-700">
                  <span className="font-semibold">{CONDITION_FIELDS.find(f => f.value === c.field)?.label}</span>
                  {" "}{CONDITION_OPS.find(o => o.value === c.operator)?.label}{" "}
                  <span className="font-semibold">{c.field === "price" ? `₹${c.value}` : (c.value_label || c.value)}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Approval process */}
        <div className="bg-white border border-slate-200 rounded-sm p-4">
          <p className="text-[13px] font-bold text-slate-800 mb-1">Approval Process</p>
          <p className="text-[11px] text-slate-400 mb-3">Who needs to approve and in what order</p>
          <div className="space-y-3">
            {(flow.levels || []).map((level, li) => (
              (level.designations || []).map((desig, di) => {
                const isLast = li === flow.levels.length - 1 && di === level.designations.length - 1;
                return (
                  <div key={`${li}-${di}`} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-[12px] font-bold shrink-0">
                        {li * 10 + di + 1}
                      </div>
                      {!isLast && <div className="w-px flex-1 bg-slate-200 my-1" />}
                    </div>
                    <div className="flex-1 border border-slate-200 rounded-sm p-3 mb-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[13px] font-semibold text-slate-800">
                          {level.department_name} — {desig.designation_name}
                        </span>
                        {desig.required && <span className="text-[10px] font-bold px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full">Required</span>}
                        {isLast && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Final Level</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 text-[11px] text-slate-500 mb-2">
                        <span>Department: <span className="text-slate-700 font-medium">{level.department_name}</span></span>
                        <span>Role: <span className="text-slate-700 font-medium">{desig.designation_name}</span></span>
                        <span>Time Limit: <span className="text-slate-700 font-medium">{desig.time_enabled ? `${desig.time_limit} ${desig.time_unit}` : "—"}</span></span>
                      </div>
                      {(desig.users || []).length > 0 && (
                        <div>
                          <p className="text-[11px] text-slate-400 mb-1">Assigned People:</p>
                          <div className="flex flex-wrap gap-2">
                            {desig.users.map(u => (
                              <span key={u.id} className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
                                <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                  {u.name?.[0]?.toUpperCase()}
                                </span>
                                {u.name} {u.email && <span className="text-slate-400">({u.email})</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
export default function ApprovalFlow({ showToast }) {
  const [activeTab, setActiveTab]       = useState("overview"); // overview | module key
  const [activeModule, setActiveModule] = useState("order");
  const [flows, setFlows]               = useState([]);
  const [allFlows, setAllFlows]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [view, setView]                 = useState("list"); // list | edit | detail
  const [selected, setSelected]         = useState(null);
  const [allUsers, setAllUsers]         = useState([]);
  const [designations, setDesignations] = useState([]);

  const fetchFlows = useCallback(async () => {
    setLoading(true);
    try {
      const [moduleRes, allRes] = await Promise.all([
        api.get(`/api/approval-flows?module=${activeModule}`),
        api.get(`/api/approval-flows`),
      ]);
      setFlows(moduleRes.data.flows || []);
      setAllFlows(allRes.data.flows || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [activeModule]);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  useEffect(() => {
    api.get("/api/users").then(r => setAllUsers((r.data.users || []).filter(u => u.is_active !== false))).catch(() => {});
    api.get("/api/designations").then(r => setDesignations(r.data.designations || [])).catch(() => {});
  }, []);

  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (selected?.id) {
        await api.put(`/api/approval-flows/${selected.id}`, form);
        showToast?.("Flow updated successfully");
      } else {
        await api.post("/api/approval-flows", { ...form, module: activeModule });
        showToast?.("Flow created successfully");
      }
      await fetchFlows();
      setView("list"); setSelected(null);
    } catch (err) {
      showToast?.(err.response?.data?.error || "Failed to save flow", "error");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this approval flow?")) return;
    try {
      await api.delete(`/api/approval-flows/${id}`);
      showToast?.("Flow deleted");
      fetchFlows();
    } catch { showToast?.("Failed to delete", "error"); }
  };

  /* ── Render ── */
  if (view === "edit") return (
    <div className="bg-white rounded-none shadow-sm border border-slate-100">
      <FlowForm flow={selected} module={activeModule} allUsers={allUsers} designations={designations}
        onSave={handleSave} onBack={() => { setView("list"); setSelected(null); }} saving={saving} />
    </div>
  );

  if (view === "detail") return (
    <div className="bg-white rounded-none shadow-sm border border-slate-100">
      <FlowDetail flow={selected}
        onBack={() => { setView("list"); setSelected(null); }}
        onEdit={() => setView("edit")} />
    </div>
  );

  /* List view */
  return (
    <div className="bg-white rounded-none shadow-sm border border-slate-100">

      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm bg-indigo-50 flex items-center justify-center shrink-0">
            <Workflow size={18} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-slate-800">Approval Flow</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Configure multi-level approval workflows per module</p>
          </div>
        </div>
        {activeTab !== "overview" && (
          <button type="button"
            onClick={() => { setSelected(null); setView("edit"); }}
            className="inline-flex items-center gap-2 h-8 px-4 rounded-sm bg-indigo-600 text-white text-[12px] font-bold hover:bg-indigo-700 transition">
            <Plus size={13} /> Add Flow
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-6">
        <button type="button" onClick={() => setActiveTab("overview")}
          className={`px-5 py-3 text-[13px] font-semibold border-b-2 -mb-px transition-colors
            ${activeTab === "overview" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"}`}>
          Overview
        </button>
        {MODULES.map(m => (
          <button key={m.key} type="button" onClick={() => { setActiveTab(m.key); setActiveModule(m.key); }}
            className={`px-5 py-3 text-[13px] font-semibold border-b-2 -mb-px transition-colors
              ${activeTab === m.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"}`}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Flow list */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading...
          </div>
        ) : activeTab === "overview" ? (
          /* ── Overview: full table ── */
          allFlows.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-sm p-12 text-center">
              <Workflow size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-400">No approval flows configured</p>
            </div>
          ) : (
            <div className="w-full overflow-hidden rounded-sm border border-slate-200">
              <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="bg-[#e8edf5]">
                    <th className="w-16 px-3 py-2.5 text-[11px] font-bold text-slate-800 uppercase tracking-wider border-r border-[#cdd5e0]">S.No</th>
                    <th className="px-3 py-2.5 text-[11px] font-bold text-slate-800 uppercase tracking-wider border-r border-[#cdd5e0]">Flow Name</th>
                    <th className="px-3 py-2.5 text-[11px] font-bold text-slate-800 uppercase tracking-wider border-r border-[#cdd5e0]">Module</th>
                    <th className="px-3 py-2.5 text-[11px] font-bold text-slate-800 uppercase tracking-wider border-r border-[#cdd5e0]">Status</th>
                    <th className="px-3 py-2.5 text-[11px] font-bold text-slate-800 uppercase tracking-wider border-r border-[#cdd5e0]">Levels</th>
                    <th className="px-3 py-2.5 text-[11px] font-bold text-slate-800 uppercase tracking-wider border-r border-[#cdd5e0]">Approvers</th>
                    <th className="px-3 py-2.5 text-[11px] font-bold text-slate-800 uppercase tracking-wider border-r border-[#cdd5e0]">Conditions</th>
                    <th className="px-3 py-2.5 text-[11px] font-bold text-slate-800 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
              {allFlows.map((flow, idx) => {
                const levels = flow.levels || [];
                const allApprovers = levels.flatMap(l => (l.designations || []).flatMap(d => d.users || []));
                const uniqueApprovers = [...new Map(allApprovers.map(u => [u.id, u])).values()];
                const conditions = flow.conditions || [];
                const approverText = uniqueApprovers.length === 0 ? "—"
                  : uniqueApprovers.slice(0, 2).map(u => u.name).join(", ") + (uniqueApprovers.length > 2 ? ` +${uniqueApprovers.length - 2}` : "");
                const conditionText = conditions.length === 0 ? "Always"
                  : (() => { const c = conditions[0]; const fl = CONDITION_FIELDS.find(f => f.value === c.field)?.label || c.field; const op = CONDITION_OPS.find(o => o.value === c.operator)?.label || c.operator; const v = c.field === "price" ? `₹${Number(c.value).toLocaleString("en-IN")}` : (c.value_label || c.value); return `${fl} ${op} ${v}` + (conditions.length > 1 ? ` +${conditions.length - 1}` : ""); })();
                const moduleLabel = MODULES.find(m => m.key === flow.module)?.label || flow.module;
                return (
                  <tr key={flow.id} className="border-b border-[#e2e8f0] last:border-0 hover:bg-[#f0f4fa] transition-colors">
                    <td className="px-3 py-3 text-[12px] text-slate-500 border-r border-[#e2e8f0]">{idx + 1}</td>
                    <td className="px-3 py-3 border-r border-[#e2e8f0]">
                      <p className="text-[13px] font-medium text-slate-700">{flow.name}</p>
                      {flow.description && <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{flow.description}</p>}
                    </td>
                    <td className="px-3 py-3 border-r border-[#e2e8f0]"><span className="text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{moduleLabel}</span></td>
                    <td className="px-3 py-3 border-r border-[#e2e8f0]">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${flow.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {flow.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-slate-600 border-r border-[#e2e8f0]">{levels.length} {levels.length === 1 ? "level" : "levels"}</td>
                    <td className="px-3 py-3 text-[12px] text-slate-600 max-w-[120px] truncate border-r border-[#e2e8f0]">{approverText}</td>
                    <td className="px-3 py-3 text-[12px] text-slate-600 max-w-[160px] truncate border-r border-[#e2e8f0]">{conditionText}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button type="button" onClick={() => { setSelected(flow); setView("detail"); }} className="w-7 h-7 flex items-center justify-center rounded-sm text-slate-500 hover:bg-slate-200 transition"><Eye size={14} /></button>
                        <button type="button" onClick={() => { setSelected(flow); setView("edit"); }} className="w-7 h-7 flex items-center justify-center rounded-sm text-slate-500 hover:bg-slate-200 transition"><Pencil size={13} /></button>
                        <button type="button" onClick={() => handleDelete(flow.id)} className="w-7 h-7 flex items-center justify-center rounded-sm text-rose-400 hover:bg-rose-50 transition"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* ── Module tab: original simple list ── */
          flows.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-sm p-12 text-center">
              <Workflow size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-400">No approval flows configured</p>
              <p className="text-xs text-slate-300 mt-1">Click "Add Flow" to create the first workflow</p>
            </div>
          ) : (
            <div className="space-y-2">
              {flows.map((flow, idx) => (
                <div key={flow.id}
                  className="flex items-center gap-3 border border-slate-200 rounded-sm px-4 py-3 bg-white hover:bg-slate-50/50 transition">
                  <GripVertical size={14} className="text-slate-300 shrink-0" />
                  <span className="text-[12px] font-bold text-slate-400 w-5 shrink-0">{idx + 1}</span>
                  <span className="text-[13px] font-semibold text-slate-800 flex-1">{flow.name}</span>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full
                    ${flow.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {flow.status === "active" ? "Active" : "Inactive"}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => { setSelected(flow); setView("detail"); }}
                      className="w-8 h-8 flex items-center justify-center rounded-sm text-slate-500 hover:bg-slate-100 transition"><Eye size={15} /></button>
                    <button type="button" onClick={() => { setSelected(flow); setView("edit"); }}
                      className="w-8 h-8 flex items-center justify-center rounded-sm text-slate-500 hover:bg-slate-100 transition"><Pencil size={14} /></button>
                    <button type="button" onClick={() => handleDelete(flow.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-sm text-rose-400 hover:bg-rose-50 transition"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
