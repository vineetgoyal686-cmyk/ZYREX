import React, { useState, useEffect, useRef, useMemo } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import {
  Plus, Search, Pencil, Trash2, X, FileText, Eye, Download, FileSpreadsheet,
  Paperclip, ChevronDown, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight,
  ArrowDownCircle, ArrowUpCircle, ArrowLeft, Columns3,
  Sparkles, Clock, ClipboardList, Wallet, CalendarDays, Building2, CreditCard, UploadCloud,
} from "lucide-react";
import * as XLSX from "xlsx";
import DateRangeFilter from "../../components/DateRangeFilter";
import LogPanel from "../../components/LogPanel";
import { logAudit } from "../../utils/auditLog";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const BASE = `${API}/api/boardroom/finance`;
const PER_PAGE = 10;

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("bms_token") || ""}` });
const currentUser = () => { try { return JSON.parse(localStorage.getItem("bms_user") || "{}"); } catch { return {}; } };

const emptyForm = {
  entryType: "payment",
  entryDate: "", siteName: "", companyName: "", partyName: "",
  description: "", amount: "",
  accountNoTo: "", accountNoFrom: "", accountHolderName: "", purpose: "", remarks: "",
  customField1: "", customField2: "", customField3: "", customField4: "", customField5: "",
};

const inp = "w-full h-14 border border-slate-300 rounded px-4 text-[15px] outline-none bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-400 transition-colors";

const Field = ({ label, hint, children }) => (
  <div>
    <label className="flex items-baseline gap-1.5 text-[15px] font-semibold text-slate-950 mb-2">
      {label} {hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}
    </label>
    {children}
  </div>
);

const Section = ({ icon: Icon, title, children }) => (
  <div>
    <div className="flex items-center gap-2 pb-2.5 mb-4 border-b border-slate-200">
      <Icon size={15} className="text-emerald-600" />
      <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wider">{title}</h3>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
      {children}
    </div>
  </div>
);

const Select = ({ value, onChange, className = inp, children }) => (
  <div className="relative">
    <select value={value} onChange={onChange} className={`${className} appearance-none pr-8`}>
      {children}
    </select>
    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
  </div>
);

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtINR  = (v) => (Number(v) || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

const LABELS = {
  payment: {
    site: "Select Site", company: "Select Company", party: "Vendor Name", description: "Expense Info",
    to: "Paid To — Account Number", from: "Paid From — Account Number", holder: "Paid From — Account Holder Name",
  },
  receipt: {
    site: "Select Site", company: "Select Company", party: "Received From", description: "Received For",
    to: "Received In — Account Number", from: "Received From — Account Number", holder: "Received From — Account Holder Name",
  },
};

// Purpose / Paid To / Paid From all get the same "system assigns a code,
// you just supply the value" popup — this is what parameterizes it per field.
const CODED_MODAL_META = {
  purpose:        { title: "Add New Purpose", fieldLabel: "Purpose Info", placeholder: "e.g. Site maintenance expense", formKey: "purpose" },
  account_no_to:  { title: "Add New Account Number", fieldLabel: "Account Number", placeholder: "e.g. 1234567890", formKey: "accountNoTo" },
  account_no_from: { title: "Add New Account Number", fieldLabel: "Account Number", placeholder: "e.g. 1234567890", formKey: "accountNoFrom" },
};

// Save-and-recall combobox styled like the app's EntitySelect (click to open,
// dedicated search box, results counter) — but backed by plain strings, and
// with an inline "+ Add" for a brand-new name. Every value picked or added
// here is remembered (server-side, scoped to just this tab) so next time it
// shows up as a one-click option instead of being retyped; nothing is ever
// written back to the global Sites/Companies/Vendors tables used elsewhere.
function SmartField({ label, value, onChange, options = [], placeholder, icon: Icon, kind, onAddNew, addLabel }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // `options` mixes plain strings (locally-saved values, isolated to this tab)
  // with rich { name, sub, code } objects seeded read-only from the real
  // Sites/Companies/Vendors tables — normalize both into one display shape.
  // The stored value is always the plain name; code/sub are display-only.
  const normalized = useMemo(() => {
    const seen = new Set();
    const list = [];
    options.forEach(o => {
      const isObj = typeof o === "object" && o !== null;
      const name = String(isObj ? o.name : o || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push({
        value: name,
        // Site/Company/Vendor read naturally as "Name (Code)" on one line;
        // Purpose/Account codes are system-assigned reference numbers, not
        // part of the name, so they get their own badge on the right instead.
        display: kind && isObj && o.code ? `${name} (${o.code})` : name,
        code: !kind && isObj ? (o.code || "") : "",
        sub: isObj ? (o.sub || "") : "",
      });
    });
    return list;
  }, [options, kind]);

  const q = search.trim().toLowerCase();
  const filtered = q ? normalized.filter(o => `${o.display} ${o.sub}`.toLowerCase().includes(q)) : normalized;
  const exactMatch = normalized.some(o => o.value.toLowerCase() === q);
  const canAddNew = q && !exactMatch;
  const selected = normalized.find(o => o.value === value);

  const pick = (v) => { onChange(v); setOpen(false); setSearch(""); };

  return (
    <div ref={ref} className="relative">
      <Field label={label}>
        <div
          onClick={() => setOpen(o => !o)}
          className={`${inp} flex items-center justify-between gap-2 cursor-pointer hover:border-slate-400 ${open ? "border-slate-400" : ""}`}
        >
          <span className="flex items-center gap-2 flex-1 min-w-0">
            {Icon && <Icon size={15} className="text-slate-400 shrink-0" />}
            <span className={`truncate ${value ? "text-slate-950" : "text-slate-400"}`}>{value ? (selected?.display || value) : placeholder}</span>
          </span>
          <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </Field>
      {open && (
        <div className="absolute z-40 mt-1 w-full bg-white border border-slate-200 rounded shadow-lg flex flex-col overflow-hidden min-w-[240px]">
          <div className="p-2 border-b border-slate-100">
            <input
              type="text" autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search here…"
              className="w-full py-2 px-3 text-sm bg-white border border-slate-200 rounded outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50/50"
            />
          </div>
          <div className="overflow-y-auto max-h-56">
            <div onClick={() => pick("")}
              className={`px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 transition-colors ${!value ? "text-slate-500 font-bold" : "text-slate-400"}`}>
              {placeholder || "Clear selection"}
            </div>
            {normalized.length > 0 && (
              <div className="px-4 py-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border-b border-slate-100">
                {kind ? `Total ${kind}: ${normalized.length}` : `${filtered.length} result${filtered.length !== 1 ? "s" : ""} found`}
              </div>
            )}
            {filtered.map(o => (
              <div key={o.value} onClick={() => pick(o.value)}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors border-b border-slate-100 last:border-0 ${value === o.value ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                {o.code && (
                  <span className="shrink-0 px-2 py-1 rounded-md bg-slate-100 text-slate-500 text-[11px] font-bold font-mono border border-slate-200 whitespace-nowrap">{o.code}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] truncate ${value === o.value ? "text-indigo-700 font-semibold" : "text-slate-900 font-semibold"}`}>{o.display}</p>
                  {o.sub && <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">{o.sub}</p>}
                </div>
                {kind && <ChevronRight size={15} className="text-slate-300 shrink-0" />}
              </div>
            ))}
            {filtered.length === 0 && !canAddNew && !onAddNew && (
              <div className="px-4 py-4 text-center text-xs text-slate-400">No results found</div>
            )}
          </div>
          {onAddNew ? (
            <div onClick={() => { setOpen(false); setSearch(""); onAddNew(); }}
              className="bg-indigo-50/50 hover:bg-indigo-100 text-indigo-600 border-t border-slate-100 font-medium text-sm px-3 py-3 text-center cursor-pointer transition-colors flex items-center justify-center gap-1.5">
              <Plus size={14} /> {addLabel || "Add New"}
            </div>
          ) : canAddNew && (
            <div onClick={() => pick(search.trim())}
              className="bg-indigo-50/50 hover:bg-indigo-100 text-indigo-600 border-t border-slate-100 font-medium text-sm px-3 py-3 text-center cursor-pointer transition-colors flex items-center justify-center gap-1.5">
              <Plus size={14} /> Add "{search.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BoardroomFinance({ onHeaderActionsChange, onViewChange }) {
  const { canAdd, canEdit, canDelete, canExport } = useModulePermissions("boardroom");

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seed, setSeed] = useState({ sites: [], companies: [], vendors: [] });
  const [saved, setSaved] = useState({});
  const [codedValues, setCodedValues] = useState({ purpose: [], account_no_to: [], account_no_from: [] });
  const [customColumns, setCustomColumns] = useState([]);

  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [siteFilter, setSiteFilter]       = useState([]);
  const [companyFilter, setCompanyFilter] = useState([]);
  const [partyFilter, setPartyFilter]     = useState([]);
  const [dateRange, setDateRange]   = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const [page, setPage]             = useState(1);
  const [perPage, setPerPage]       = useState(PER_PAGE);

  const [view, setView]           = useState("list");
  const [form, setForm]           = useState(emptyForm);
  const [docs, setDocs]           = useState([]);
  const [editId, setEditId]       = useState(null);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [viewEntry, setViewEntry] = useState(null);
  const [docsEntry, setDocsEntry] = useState(null);
  const [showColumns, setShowColumns] = useState(false);
  const [newColName, setNewColName]   = useState("");
  const [showAddSite, setShowAddSite] = useState(false);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showAddCoded, setShowAddCoded] = useState(null); // "purpose" | "account_no_to" | "account_no_from" | null
  const [editOriginal, setEditOriginal] = useState(null);
  const [logEntry, setLogEntry] = useState(null);
  const fileRef = useRef();
  const columnsRef = useRef();

  useEffect(() => {
    if (view !== "form") return;
  }, [view, editId]);

  const loadSaved = () => {
    const keys = ["account_holder_name"];
    Promise.all(keys.map(k => fetch(`${BASE}/field-values?field=${k}`, { headers: authHeaders() }).then(r => r.json()).then(d => [k, d.values || []]).catch(() => [k, []])))
      .then(pairs => setSaved(Object.fromEntries(pairs)));
  };

  const loadCustomColumns = () => {
    fetch(`${BASE}/custom-columns`, { headers: authHeaders() }).then(r => r.json()).then(d => setCustomColumns(d.columns || [])).catch(() => {});
  };

  const loadSeed = () => {
    fetch(`${BASE}/seed-options`, { headers: authHeaders() }).then(r => r.json()).then(setSeed).catch(() => {});
  };

  const loadCodedValues = () => {
    const keys = ["purpose", "account_no_to", "account_no_from"];
    Promise.all(keys.map(k => fetch(`${BASE}/coded-values?field=${k}`, { headers: authHeaders() }).then(r => r.json()).then(d => [k, d.values || []]).catch(() => [k, []])))
      .then(pairs => setCodedValues(Object.fromEntries(pairs)));
  };

  useEffect(() => {
    loadSeed();
    loadSaved();
    loadCustomColumns();
    loadCodedValues();
  }, []);

  const addQuickSite = async (site) => {
    try {
      const res = await fetch(`${BASE}/quick-sites`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(site),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to add site");
      loadSeed();
      setForm(f => ({ ...f, siteName: site.name.trim() }));
      setShowAddSite(false);
      showToast(`Site "${site.name.trim()}" added`);
    } catch (err) { showToast(err.message, "error"); }
  };

  const addQuickCompany = async (company) => {
    try {
      const res = await fetch(`${BASE}/quick-companies`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(company),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to add company");
      loadSeed();
      setForm(f => ({ ...f, companyName: company.name.trim() }));
      setShowAddCompany(false);
      showToast(`Company "${company.name.trim()}" added`);
    } catch (err) { showToast(err.message, "error"); }
  };

  const addQuickVendor = async (vendor) => {
    try {
      const res = await fetch(`${BASE}/quick-vendors`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(vendor),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to add vendor");
      loadSeed();
      setForm(f => ({ ...f, partyName: vendor.name.trim() }));
      setShowAddVendor(false);
      showToast(`Vendor "${vendor.name.trim()}" added`);
    } catch (err) { showToast(err.message, "error"); }
  };

  // Shared by Purpose / Paid To / Paid From — assigns the next PUR-N / ACC-N
  // code on the server and drops the plain value straight into the form.
  const addCodedValue = async (field, formKey, value) => {
    try {
      const res = await fetch(`${BASE}/coded-values`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ field, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add");
      loadCodedValues();
      setForm(f => ({ ...f, [formKey]: value.trim() }));
      setShowAddCoded(null);
      showToast(`${data.display} added`);
    } catch (err) { showToast(err.message, "error"); }
  };

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${BASE}/entries`, { headers: authHeaders() });
      const data = await res.json();
      setEntries(data.entries || []);
    } catch { setEntries([]); }
    setLoading(false);
  };
  useEffect(() => { fetchEntries(); }, []);

  useEffect(() => {
    if (!showColumns) return;
    const h = (e) => { if (columnsRef.current && !columnsRef.current.contains(e.target)) setShowColumns(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showColumns]);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const activeColumns = customColumns.filter(c => c.isActive);
  const emptySlot = customColumns.find(c => !c.isActive);

  const addColumn = async () => {
    const label = newColName.trim();
    if (!label) return;
    if (!emptySlot) return showToast("Maximum of 5 custom columns reached", "error");
    try {
      const res = await fetch(`${BASE}/custom-columns/${emptySlot.slot}`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setNewColName("");
      loadCustomColumns();
      showToast(`Column "${label}" added`);
    } catch (err) { showToast(err.message, "error"); }
  };

  const deleteColumn = async (slot, label) => {
    if (!confirm(`Delete column "${label}"? This removes its data from every entry.`)) return;
    try {
      await fetch(`${BASE}/custom-columns/${slot}`, { method: "DELETE", headers: authHeaders() });
      loadCustomColumns();
      fetchEntries();
      showToast("Column deleted");
    } catch { showToast("Failed to delete column", "error"); }
  };

  const openAdd = () => {
    setForm({ ...emptyForm, entryDate: new Date().toISOString().slice(0, 10) });
    setDocs([]);
    setEditId(null);
    setEditOriginal(null);
    setView("form");
  };
  const openEdit = (e) => {
    setForm({
      entryType: e.entryType, entryDate: e.entryDate ? String(e.entryDate).slice(0, 10) : "",
      siteName: e.siteName || "", companyName: e.companyName || "", partyName: e.partyName || "",
      description: e.description || "", amount: e.amount || "",
      accountNoTo: e.accountNoTo || "", accountNoFrom: e.accountNoFrom || "", accountHolderName: e.accountHolderName || "",
      purpose: e.purpose || "", remarks: e.remarks || "",
      customField1: e.customField1 || "", customField2: e.customField2 || "", customField3: e.customField3 || "",
      customField4: e.customField4 || "", customField5: e.customField5 || "",
    });
    setDocs((e.documentUrls || []).map(url => ({ url, keepPath: url })));
    setEditId(e.id);
    setEditOriginal(e);
    setView("form");
  };

  // Field-level diff between the entry as it was opened and the form as
  // submitted — this is exactly what shows up in the Log panel for an edit.
  const FIELD_LOG_LABELS = {
    entryType: "Type", entryDate: "Date", siteName: "Site", companyName: "Company", partyName: "Party",
    description: "Description", amount: "Amount", accountNoTo: "Paid To Account", accountNoFrom: "Paid From Account",
    accountHolderName: "Account Holder", purpose: "Purpose", remarks: "Remarks",
    customField1: "Custom 1", customField2: "Custom 2", customField3: "Custom 3", customField4: "Custom 4", customField5: "Custom 5",
  };
  const diffEntry = (original, next) => {
    const changes = {};
    Object.keys(FIELD_LOG_LABELS).forEach(key => {
      const from = String(original[key] ?? "").trim();
      const to   = String(next[key] ?? "").trim();
      if (from !== to) changes[FIELD_LOG_LABELS[key]] = { from: from || "—", to: to || "—" };
    });
    return changes;
  };

  // A freshly picked file has no server URL yet — an object URL lets the
  // board member open/preview it immediately, same as an already-saved doc.
  const addFiles = (files) => setDocs(prev => [...prev, ...files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  const removeDoc = (idx) => setDocs(prev => {
    const target = prev[idx];
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    return prev.filter((_, i) => i !== idx);
  });

  const handleSave = async () => {
    if (!form.entryDate) return showToast("Date is required", "error");
    if (!Number(form.amount) || Number(form.amount) <= 0) return showToast("Amount must be greater than 0", "error");

    setSaving(true);
    try {
      const u = currentUser();
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ""));
      fd.append("createdByName", u.name || "");
      if (editId) fd.append("documentKeep", JSON.stringify(docs.filter(d => d.keepPath).map(d => d.keepPath)));
      docs.filter(d => d.file).forEach(d => fd.append("document", d.file));

      const url    = editId ? `${BASE}/entries/${editId}` : `${BASE}/entries`;
      const method = editId ? "PUT" : "POST";
      const res  = await fetch(url, { method, headers: authHeaders(), body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");

      const label = form.partyName || form.companyName || "Entry";
      if (editId) {
        const changes = editOriginal ? diffEntry(editOriginal, form) : null;
        logAudit("boardroom_finance_entry", editId, label, "updated", changes && Object.keys(changes).length ? changes : null);
      } else if (data.entry?.id) {
        logAudit("boardroom_finance_entry", data.entry.id, label, "created", {
          Type: form.entryType === "payment" ? "Payment" : "Receipt", Amount: form.amount, Site: form.siteName || "—", Company: form.companyName || "—",
        });
      }

      showToast(editId ? "Entry updated" : "Entry added");
      setView("list");
      fetchEntries();
      loadSaved();
    } catch (err) { showToast(err.message || "Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this entry?")) return;
    try {
      const u = currentUser();
      const target = entries.find(x => x.id === id);
      await fetch(`${BASE}/entries/${id}`, {
        method: "DELETE", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ deletedByName: u.name || "" }),
      });
      logAudit("boardroom_finance_entry", id, target?.partyName || target?.companyName || "Entry", "deleted", null);
      showToast("Entry deleted");
      fetchEntries();
    } catch { showToast("Failed to delete", "error"); }
  };

  const filterOptions = useMemo(() => {
    const siteSet = new Set(), companySet = new Set(), partySet = new Set();
    entries.forEach(e => {
      if (e.siteName) siteSet.add(e.siteName);
      if (e.companyName) companySet.add(e.companyName);
      if (e.partyName) partySet.add(e.partyName);
    });
    return { sites: [...siteSet].sort(), companies: [...companySet].sort(), parties: [...partySet].sort() };
  }, [entries]);

  const filtered = entries.filter(e => {
    const s = search.trim().toLowerCase();
    const matchesSearch = !s || [e.partyName, e.description, e.siteName, e.companyName, e.accountNoTo, e.accountNoFrom, e.accountHolderName, e.purpose]
      .some(v => String(v || "").toLowerCase().includes(s));
    const matchesType    = !typeFilter || e.entryType === typeFilter;
    const matchesSite    = !siteFilter.length    || siteFilter.includes(e.siteName);
    const matchesCompany = !companyFilter.length || companyFilter.includes(e.companyName);
    const matchesParty   = !partyFilter.length   || partyFilter.includes(e.partyName);
    const matchesFrom = dateRange === "all" || !customFrom || (e.entryDate && e.entryDate >= customFrom);
    const matchesTo   = dateRange === "all" || !customTo   || (e.entryDate && e.entryDate <= customTo);
    return matchesSearch && matchesType && matchesSite && matchesCompany && matchesParty && matchesFrom && matchesTo;
  });
  const totalPaid     = filtered.filter(e => e.entryType === "payment").reduce((sum, e) => sum + e.amount, 0);
  const totalReceived = filtered.filter(e => e.entryType === "receipt").reduce((sum, e) => sum + e.amount, 0);
  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  const exportExcel = () => {
    const data = filtered.map((e, i) => {
      const row = {
        "S.No": i + 1, "Type": e.entryType === "payment" ? "Payment" : "Receipt", "Date": fmtDate(e.entryDate),
        "Site": e.siteName, "Company": e.companyName, "Party": e.partyName, "Description": e.description,
        "Purpose": e.purpose, "Amount": e.amount, "To Account No": e.accountNoTo, "From Account No": e.accountNoFrom,
        "Account Holder": e.accountHolderName, "Remarks": e.remarks,
      };
      activeColumns.forEach(c => { row[c.label] = e[`customField${c.slot}`]; });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Boardroom Finance");
    XLSX.writeFile(wb, "boardroom_finance.xlsx");
  };

  const L = LABELS[form.entryType];

  useEffect(() => { onViewChange?.(view); }, [view]);

  useEffect(() => {
    if (!onHeaderActionsChange) return;
    if (view !== "list") { onHeaderActionsChange(null); return; }

    onHeaderActionsChange(
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative" ref={columnsRef}>
          <button onClick={() => setShowColumns(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
            <Columns3 size={14} /> Columns
          </button>
          {showColumns && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl z-30 overflow-hidden">
              <p className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">Custom Columns ({activeColumns.length}/5)</p>
              <div className="p-3 space-y-1.5">
                {customColumns.filter(c => c.isActive).map(c => (
                  <div key={c.slot} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-sm font-medium text-slate-700 truncate">{c.label}</span>
                    {canDelete && <button onClick={() => deleteColumn(c.slot, c.label)} className="text-slate-400 hover:text-red-500 shrink-0"><Trash2 size={13} /></button>}
                  </div>
                ))}
                {customColumns.filter(c => c.isActive).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">No custom columns yet</p>
                )}
              </div>
              {emptySlot && canAdd && (
                <div className="flex items-center gap-2 p-3 border-t border-slate-100 bg-slate-50">
                  <input value={newColName} onChange={e => setNewColName(e.target.value)} placeholder="New column name"
                    onKeyDown={e => e.key === "Enter" && addColumn()}
                    className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
                  <button onClick={addColumn} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-all">Add</button>
                </div>
              )}
            </div>
          )}
        </div>
        {canExport && (
          <button onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
            <FileSpreadsheet size={14} className="text-emerald-600" /> Export
          </button>
        )}
        {canAdd && (
          <button onClick={openAdd}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-all">
            <Plus size={15} /> Add Detail
          </button>
        )}
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, canAdd, canExport, canDelete, showColumns, newColName, customColumns, activeColumns.length, emptySlot?.slot]);

  if (view === "form") {
    return (
      <>
        {toast && (
          <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg
            ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
            {toast.msg}
          </div>
        )}
        <div className="bg-white border-b border-slate-200">
          <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setView("list")} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-all shrink-0"><ArrowLeft size={18} /></button>
              <h1 className="text-[15px] font-bold text-slate-800 whitespace-nowrap">{editId ? "Edit Detail" : "Add Detail"}</h1>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit shrink-0">
              {[{ v: "payment", l: "Payment" }, { v: "receipt", l: "Receipt" }].map(o => (
                <button key={o.v} type="button" onClick={() => setForm(f => ({ ...f, entryType: o.v }))}
                  className={`px-5 py-1.5 rounded-md text-sm font-semibold transition-all ${form.entryType === o.v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-6 space-y-7 pb-28 w-full min-h-screen bg-[#f8fafc]">
          <Section icon={CalendarDays} title="What & When">
            <Field label="Date">
              <input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} className={inp} />
            </Field>
            <Field label="Amount" hint="in ₹">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[15px] pointer-events-none">₹</span>
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={`${inp} pl-9`} placeholder="0" />
              </div>
            </Field>
            <SmartField label={L.site} value={form.siteName} onChange={v => setForm(f => ({ ...f, siteName: v }))}
              options={seed.sites} placeholder="Type or pick a site…" kind="Sites"
              onAddNew={() => setShowAddSite(true)} addLabel="Add New Site" />
          </Section>

          <Section icon={Building2} title="Parties Involved">
            <SmartField label={L.company} value={form.companyName} onChange={v => setForm(f => ({ ...f, companyName: v }))}
              options={seed.companies} placeholder="Type or pick a company…" kind="Companies"
              onAddNew={() => setShowAddCompany(true)} addLabel="Add New Company" />
            <SmartField label={L.party} value={form.partyName} onChange={v => setForm(f => ({ ...f, partyName: v }))}
              options={seed.vendors} placeholder={form.entryType === "payment" ? "Type or pick a vendor…" : "Who paid you?"} kind="Vendors"
              onAddNew={() => setShowAddVendor(true)} addLabel="Add New Vendor" />
            <Field label={L.description}>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inp} placeholder="What is this for…" />
            </Field>
            <SmartField label="Purpose" value={form.purpose} onChange={v => setForm(f => ({ ...f, purpose: v }))}
              options={codedValues.purpose.map(c => ({ name: c.value, code: `PUR-${c.code}` }))} placeholder="Purpose of this entry…" icon={Sparkles}
              onAddNew={() => setShowAddCoded("purpose")} addLabel="Add New Purpose" />
            <Field label="Remarks">
              <input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} className={inp} placeholder="Optional notes…" />
            </Field>
          </Section>

          <Section icon={CreditCard} title="Bank Details">
            <SmartField label={L.to} value={form.accountNoTo} onChange={v => setForm(f => ({ ...f, accountNoTo: v }))}
              options={codedValues.account_no_to.map(c => ({ name: c.value, code: `ACC-${c.code}` }))} placeholder="Account number…"
              onAddNew={() => setShowAddCoded("account_no_to")} addLabel="Add New Account Number" />
            <SmartField label={L.from} value={form.accountNoFrom} onChange={v => setForm(f => ({ ...f, accountNoFrom: v }))}
              options={codedValues.account_no_from.map(c => ({ name: c.value, code: `ACC-${c.code}` }))} placeholder="Account number…"
              onAddNew={() => setShowAddCoded("account_no_from")} addLabel="Add New Account Number" />
            <SmartField label={L.holder} value={form.accountHolderName} onChange={v => setForm(f => ({ ...f, accountHolderName: v }))}
              options={saved.account_holder_name || []} placeholder="Account holder name…" />
          </Section>

          {activeColumns.length > 0 && (
            <Section icon={Columns3} title="Additional Details">
              {activeColumns.map(c => (
                <Field key={c.slot} label={c.label}>
                  <input value={form[`customField${c.slot}`]} onChange={e => setForm(f => ({ ...f, [`customField${c.slot}`]: e.target.value }))}
                    className={inp} placeholder={c.label} />
                </Field>
              ))}
            </Section>
          )}

          <div>
            <div className="flex items-center gap-2 pb-2.5 mb-4 border-b border-slate-200">
              <UploadCloud size={15} className="text-emerald-600" />
              <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Attachments</h3>
            </div>
            <div onClick={() => fileRef.current.click()}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-6 py-8 cursor-pointer transition-all border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30">
              <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                <UploadCloud size={16} className="text-slate-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700">Click to upload a file</p>
                <p className="text-xs text-slate-400 mt-0.5">Any format supported · receipts, invoices, scans</p>
              </div>
            </div>
            <input ref={fileRef} type="file" multiple className="hidden"
              onChange={e => { const files = Array.from(e.target.files); e.target.value = ""; if (files.length) addFiles(files); }} />
            {docs.length > 0 && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {docs.map((d, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-600 hover:underline truncate">Attachment {idx + 1}</a>
                    ) : (
                      <a href={d.previewUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-600 hover:underline truncate">{d.file.name}</a>
                    )}
                    <button type="button" onClick={() => removeDoc(idx)} className="p-1 text-slate-400 hover:text-red-500 shrink-0"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 z-20 bg-white border-t border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-end gap-2">
          <button onClick={() => setView("list")}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
            {saving ? "Saving…" : editId ? "Update Detail" : "Add Detail"}
          </button>
        </div>

        {showAddSite && <AddSiteModal onClose={() => setShowAddSite(false)} onSave={addQuickSite} />}
        {showAddCompany && <AddCompanyModal onClose={() => setShowAddCompany(false)} onSave={addQuickCompany} />}
        {showAddVendor && <AddVendorModal onClose={() => setShowAddVendor(false)} onSave={addQuickVendor} />}
        {showAddCoded && (
          <AddCodedValueModal
            {...CODED_MODAL_META[showAddCoded]}
            onClose={() => setShowAddCoded(null)}
            onSave={(value) => addCodedValue(showAddCoded, CODED_MODAL_META[showAddCoded].formKey, value)}
          />
        )}
      </>
    );
  }

  return (
    <>
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg
          ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      <div className="sticky top-0 z-20">
        <div className="px-5 sm:px-6 py-3 space-y-3 bg-white border-b border-slate-200">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 shadow-sm lg:max-w-md flex-1">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search party, description, account…"
                className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-slate-400 text-slate-700" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                className="h-10 pl-3 rounded-md border border-slate-200 text-xs font-bold text-slate-700 bg-white outline-none focus:border-slate-400">
                <option value="">All Types</option>
                <option value="payment">Payment</option>
                <option value="receipt">Receipt</option>
              </Select>
              <MultiFilter label="Site" options={filterOptions.sites} selected={siteFilter} onChange={v => { setSiteFilter(v); setPage(1); }} />
              <MultiFilter label="Company" options={filterOptions.companies} selected={companyFilter} onChange={v => { setCompanyFilter(v); setPage(1); }} />
              <MultiFilter label="Party" options={filterOptions.parties} selected={partyFilter} onChange={v => { setPartyFilter(v); setPage(1); }} />
              <DateRangeFilter dateRange={dateRange} setDateRange={v => { setDateRange(v); setPage(1); }}
                customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={v => { setCustomTo(v); setPage(1); }} />
              {(typeFilter || siteFilter.length || companyFilter.length || partyFilter.length || dateRange !== "all") ? (
                <button onClick={() => { setTypeFilter(""); setSiteFilter([]); setCompanyFilter([]); setPartyFilter([]); setDateRange("all"); setCustomFrom(""); setCustomTo(""); setPage(1); }}
                  className="inline-flex h-10 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50">
                  <X size={13} /> Clear
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-4 lg:px-6 pt-4 pb-32 w-full bg-[#f8fafc]">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Entries</p>
              <p className="text-xl font-bold text-slate-800">{filtered.length}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <ClipboardList size={18} className="text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Paid</p>
              <p className="text-xl font-bold text-slate-800">{fmtINR(totalPaid)}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
              <ArrowUpCircle size={18} className="text-rose-500" />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Received</p>
              <p className="text-xl font-bold text-slate-800">{fmtINR(totalReceived)}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <ArrowDownCircle size={18} className="text-emerald-500" />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Net Balance</p>
              <p className={`text-xl font-bold ${totalReceived - totalPaid >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtINR(totalReceived - totalPaid)}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Wallet size={18} className="text-indigo-500" />
            </div>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-100 p-16 flex items-center justify-center">
            <p className="text-slate-300 font-bold uppercase tracking-widest text-xs">No entries recorded yet</p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto thin-scrollbar-light">
            <table className="w-full text-sm border-separate border-spacing-0 border border-slate-200">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 z-20 w-14 text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap bg-slate-50">S.No</th>
                  <th className="sticky left-14 z-20 w-36 text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap bg-slate-50">Type</th>
                  {["Date", "Site", "Company", "Party", "Description", "Purpose", "Amount", "To Account", "From Account", "Holder", "Remarks",
                    ...activeColumns.map(c => c.label), "Docs"].map(c => (
                    <th key={c} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">{c}</th>
                  ))}
                  <th className="sticky right-0 z-20 text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap bg-slate-50">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((e, i) => (
                  <tr key={e.id} className="group hover:bg-slate-50 transition-colors">
                    <td className="sticky left-0 z-10 w-14 px-3 py-3 text-sm font-medium text-slate-500 border border-slate-200 text-center whitespace-nowrap bg-white group-hover:bg-slate-50">{(page - 1) * perPage + i + 1}</td>
                    <td className="sticky left-14 z-10 w-36 px-3 py-3 border border-slate-200 whitespace-nowrap bg-white group-hover:bg-slate-50">
                      {e.entryType === "payment" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600"><ArrowUpCircle size={12} /> Payment</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700"><ArrowDownCircle size={12} /> Receipt</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{fmtDate(e.entryDate)}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{e.siteName || "—"}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{e.companyName || "—"}</td>
                    <td className="px-3 py-3 text-sm font-medium text-slate-800 border border-slate-200 whitespace-nowrap">{e.partyName || "—"}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 max-w-[180px] truncate">{e.description || "—"}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 max-w-[140px] truncate">{e.purpose || "—"}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-800 border border-slate-200 text-right whitespace-nowrap">{fmtINR(e.amount)}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{e.accountNoTo || "—"}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{e.accountNoFrom || "—"}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{e.accountHolderName || "—"}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 max-w-[160px] truncate">{e.remarks || "—"}</td>
                    {activeColumns.map(c => (
                      <td key={c.slot} className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{e[`customField${c.slot}`] || "—"}</td>
                    ))}
                    <td className="px-3 py-3 border border-slate-200 text-center">
                      {e.documentUrls?.length ? (
                        <button onClick={() => setDocsEntry(e)}
                          className="inline-flex items-center gap-1 text-indigo-500 text-xs font-semibold hover:text-indigo-700 hover:underline">
                          <Paperclip size={12} /> {e.documentUrls.length}
                        </button>
                      ) : <span className="text-slate-300"><Paperclip size={13} className="inline" /></span>}
                    </td>
                    <td className="sticky right-0 z-10 border border-slate-200 bg-white group-hover:bg-slate-50">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setViewEntry(e)} className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-all"><Eye size={14} /></button>
                        {canEdit && <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all"><Pencil size={14} /></button>}
                        {canDelete && <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={14} /></button>}
                        <button onClick={() => setLogEntry(e)} title="Activity log" className="p-1.5 rounded-lg text-slate-300 hover:text-cyan-600 hover:bg-cyan-50 transition-all"><Clock size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 md:gap-4 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-500 order-1">
                {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}-{Math.min(page * perPage, filtered.length)} of {filtered.length} items
              </p>
              <div className="order-3 md:order-2 w-full md:w-auto flex justify-center">
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(1)} disabled={page === 1}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-white disabled:opacity-30 transition-all"><ChevronsLeft size={14} /></button>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-white disabled:opacity-30 transition-all"><ChevronLeft size={14} /></button>
                    {(() => {
                      const items = [];
                      const addPage = n => items.push(n);
                      if (totalPages <= 7) {
                        for (let n = 1; n <= totalPages; n++) addPage(n);
                      } else {
                        addPage(1);
                        if (page > 3) items.push("...");
                        const start = Math.max(2, page - 1);
                        const end = Math.min(totalPages - 1, page + 1);
                        for (let n = start; n <= end; n++) addPage(n);
                        if (page < totalPages - 2) items.push("...");
                        addPage(totalPages);
                      }
                      return items.map((n, i) =>
                        n === "..." ? (
                          <span key={`e${i}`} className="px-1.5 text-xs text-slate-400 select-none">...</span>
                        ) : (
                          <button key={n} onClick={() => setPage(n)}
                            className={`min-w-[26px] h-[26px] px-1.5 rounded-md text-xs font-medium transition-all ${page === n ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"}`}>
                            {n}
                          </button>
                        )
                      );
                    })()}
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-white disabled:opacity-30 transition-all"><ChevronRight size={14} /></button>
                    <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-white disabled:opacity-30 transition-all"><ChevronsRight size={14} /></button>
                  </div>
                )}
              </div>
              <div className="relative order-2 md:order-3">
                <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                  className="appearance-none text-xs border border-slate-200 rounded-md pl-2.5 pr-6 py-1.5 text-slate-600 bg-white focus:outline-none">
                  {[10, 20, 30, 40, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>
        )}

        {viewEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5 relative shrink-0">
                <button onClick={() => setViewEntry(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
                <p className="text-[10px] font-semibold text-cyan-300/80 uppercase tracking-widest mb-0.5">{viewEntry.entryType === "payment" ? "Payment" : "Receipt"} · {fmtDate(viewEntry.entryDate)}</p>
                <h2 className="text-lg font-bold text-white leading-tight">{viewEntry.partyName || "—"}</h2>
                <p className="text-sm text-slate-300 mt-1">{fmtINR(viewEntry.amount)}</p>
              </div>
              <div className="px-6 py-5 space-y-2.5 text-sm overflow-y-auto">
                <div className="flex justify-between"><span className="text-slate-400">Site</span><span className="text-slate-700 font-medium">{viewEntry.siteName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Company</span><span className="text-slate-700 font-medium">{viewEntry.companyName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">{LABELS[viewEntry.entryType].description}</span><span className="text-slate-700 font-medium">{viewEntry.description || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Purpose</span><span className="text-slate-700 font-medium">{viewEntry.purpose || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">{LABELS[viewEntry.entryType].to}</span><span className="text-slate-700 font-medium">{viewEntry.accountNoTo || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">{LABELS[viewEntry.entryType].from}</span><span className="text-slate-700 font-medium">{viewEntry.accountNoFrom || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">{LABELS[viewEntry.entryType].holder}</span><span className="text-slate-700 font-medium">{viewEntry.accountHolderName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Remarks</span><span className="text-slate-700 font-medium">{viewEntry.remarks || "—"}</span></div>
                {activeColumns.map(c => (
                  <div key={c.slot} className="flex justify-between"><span className="text-slate-400">{c.label}</span><span className="text-slate-700 font-medium">{viewEntry[`customField${c.slot}`] || "—"}</span></div>
                ))}
                {viewEntry.documentUrls?.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <span className="text-slate-400">Attachments</span>
                    {viewEntry.documentUrls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-medium hover:bg-indigo-100 transition-all">
                        <Download size={14} /> Attachment {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 shrink-0">
                {canEdit && (
                  <button onClick={() => { setViewEntry(null); openEdit(viewEntry); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all">
                    <Pencil size={13} /> Edit
                  </button>
                )}
                <button onClick={() => setViewEntry(null)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all">Close</button>
              </div>
            </div>
          </div>
        )}

        {docsEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{docsEntry.partyName || "—"}</p>
                  <h2 className="text-base font-bold text-slate-800">Attachments ({docsEntry.documentUrls?.length || 0})</h2>
                </div>
                <button onClick={() => setDocsEntry(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="px-6 py-4 overflow-y-auto space-y-1.5">
                {(docsEntry.documentUrls || []).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-medium hover:bg-indigo-100 transition-all">
                    <FileText size={14} /> Attachment {i + 1}
                  </a>
                ))}
              </div>
              <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100 shrink-0">
                <button onClick={() => setDocsEntry(null)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all">Close</button>
              </div>
            </div>
          </div>
        )}

        {logEntry && (
          <LogPanel
            entityType="boardroom_finance_entry"
            entityId={logEntry.id}
            entityName={logEntry.partyName || logEntry.companyName}
            onClose={() => setLogEntry(null)}
          />
        )}
      </div>
    </>
  );
}

function MultiFilter({ label, options, selected, onChange }) {
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
        className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-xs font-bold shadow-sm transition ${selected.length ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
        <span>{label}</span>
        {selected.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-black text-white">{selected.length}</span>}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-md border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 p-2">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2">
              <Search size={13} className="text-slate-400" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${label.toLowerCase()}...`}
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
                  <button key={opt} onClick={() => toggle(opt)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">
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

// Kept deliberately small — just enough to identify a site. Saved to
// boardroom_finance_quick_sites, isolated to this tab; never touches the
// real `projects` table used by Procurement/Orders.
function AddSiteModal({ onClose, onSave }) {
  const [name, setName]       = useState("");
  const [code, setCode]       = useState("");
  const [state, setState]     = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving]   = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name, code, state, address });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Add New Site</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Site Name">
            <input autoFocus value={name} onChange={e => setName(e.target.value)} className={inp} placeholder="e.g. B-47 IAS House Noida" />
          </Field>
          <Field label="Site Code">
            <input value={code} onChange={e => setCode(e.target.value)} className={inp} placeholder="e.g. B47" />
          </Field>
          <Field label="State">
            <input value={state} onChange={e => setState(e.target.value)} className={inp} placeholder="e.g. Uttar Pradesh" />
          </Field>
          <Field label="Address">
            <textarea
              value={address} rows={1} placeholder="Optional"
              onChange={e => { setAddress(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
              className={`${inp} py-3.5 resize-none overflow-hidden`}
            />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={submit} disabled={!name.trim() || saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
            {saving ? "Adding…" : "Add Site"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Kept deliberately small — just enough to identify a company. Saved to
// boardroom_finance_quick_companies, isolated to this tab; never touches the
// real `companies` table used by Procurement/Orders.
function AddCompanyModal({ onClose, onSave }) {
  const [name, setName]       = useState("");
  const [code, setCode]       = useState("");
  const [gstin, setGstin]     = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving]   = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name, code, gstin, address });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Add New Company</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Company Name">
            <input autoFocus value={name} onChange={e => setName(e.target.value)} className={inp} placeholder="e.g. Bharat Volt Pvt Ltd" />
          </Field>
          <Field label="Company Code">
            <input value={code} onChange={e => setCode(e.target.value)} className={inp} placeholder="e.g. BVPL" />
          </Field>
          <Field label="GST Number">
            <input value={gstin} onChange={e => setGstin(e.target.value)} className={inp} placeholder="e.g. 06AAMCB6496J1Z2" />
          </Field>
          <Field label="Address">
            <textarea
              value={address} rows={1} placeholder="Optional"
              onChange={e => { setAddress(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
              className={`${inp} py-3.5 resize-none overflow-hidden`}
            />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={submit} disabled={!name.trim() || saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
            {saving ? "Adding…" : "Add Company"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Kept deliberately small — just enough to identify a vendor. Saved to
// boardroom_finance_quick_vendors, isolated to this tab; never touches the
// real `vendors` table used by Procurement/Orders.
function AddVendorModal({ onClose, onSave }) {
  const [name, setName]           = useState("");
  const [state, setState]         = useState("");
  const [address, setAddress]     = useState("");
  const [contactName, setContactName]     = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name, state, address, contactName, contactNumber });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-slate-800">Add New Vendor</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <Field label="Firm Name">
            <input autoFocus value={name} onChange={e => setName(e.target.value)} className={inp} placeholder="e.g. Advance Infra" />
          </Field>
          <Field label="State">
            <input value={state} onChange={e => setState(e.target.value)} className={inp} placeholder="e.g. Delhi" />
          </Field>
          <Field label="Address">
            <textarea
              value={address} rows={1} placeholder="Optional"
              onChange={e => { setAddress(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
              className={`${inp} py-3.5 resize-none overflow-hidden`}
            />
          </Field>
          <Field label="Contact Name">
            <input value={contactName} onChange={e => setContactName(e.target.value)} className={inp} placeholder="Optional" />
          </Field>
          <Field label="Contact Number">
            <input value={contactNumber} onChange={e => setContactNumber(e.target.value)} className={inp} placeholder="Optional" />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={submit} disabled={!name.trim() || saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
            {saving ? "Adding…" : "Add Vendor"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Generic single-field popup for Purpose / Paid To / Paid From — the server
// assigns the sequential code, this just collects the value.
function AddCodedValueModal({ title, fieldLabel, placeholder, onClose, onSave }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!value.trim()) return;
    setSaving(true);
    await onSave(value);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5">
          <Field label={fieldLabel}>
            <input autoFocus value={value} onChange={e => setValue(e.target.value)} className={inp} placeholder={placeholder}
              onKeyDown={e => e.key === "Enter" && submit()} />
          </Field>
          <p className="text-xs text-slate-400 mt-2">A unique reference number is assigned automatically.</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={submit} disabled={!value.trim() || saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
