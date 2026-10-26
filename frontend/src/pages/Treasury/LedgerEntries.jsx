import React, { useState, useEffect, useRef, useMemo } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import {
  Plus, Search, Pencil, Trash2, X, FileText, Eye, Download, FileSpreadsheet,
  Paperclip, ChevronDown, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight,
  ArrowDownCircle, ArrowUpCircle, ArrowLeft, Columns3,
  Sparkles, Clock, ClipboardList, Wallet, CalendarDays, Building2, CreditCard, UploadCloud, Activity,
} from "lucide-react";
import * as XLSX from "xlsx";
import DateRangeFilter from "../../components/DateRangeFilter";
import LogPanel from "../../components/LogPanel";
import { logAudit } from "../../utils/auditLog";
import { mastersApi, maskAcc, AccountModal } from "./mastersShared";
import { RecordModal, CategoryModal } from "./Masters";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const BASE = `${API}/api/treasury/ledger`;
const PER_PAGE = 10;
// Row action buttons (bordered squares)
const actBtn = "w-8 h-8 shrink-0 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 hover:border-slate-300 hover:bg-slate-50 transition-colors";

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("bms_token") || ""}` });
const currentUser = () => { try { return JSON.parse(localStorage.getItem("bms_user") || "{}"); } catch { return {}; } };

const emptyForm = {
  entryType: "payment",
  entryDate: "", siteName: "", companyName: "", partyName: "",
  narration: "", amount: "",
  paymentMode: "account",
  accountNoTo: "", accountNoFrom: "", ifscTo: "", ifscFrom: "", accountHolderName: "", category: "", remarks: "",
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

// DD.MM.YYYY
const fmtDate = (d) => {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return day && m && y ? `${day}.${m}.${y}` : "—";
};
const fmtINR  = (v) => (Number(v) || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

// Form wording per type. The form reads: when / how much / which project →
// our side (company, mode, our account) → their side (name, their account) →
// what it was for. Stored fields stay the same: accountNoFrom is the account
// money left, accountNoTo the account it went into, accountHolderName is
// the other party's account holder.
const LABELS = {
  payment: {
    first: "Payment", ours: "Paid By — Our Side", theirs: "Paid To — Vendor", why: "What It Was For",
    site: "Select Project", company: "Our Company", party: "Vendor Name", narration: "Narration",
    to: "Vendor Account Number", from: "Our Account Number (Paid From)",
    ourAcc: "Our Account Number (Paid From)", theirAcc: "Vendor Account Number", holder: "Vendor Account Holder Name",
    ourAccKey: "accountNoFrom", theirAccKey: "accountNoTo", ourIfscKey: "ifscFrom", theirIfscKey: "ifscTo",
  },
  receipt: {
    first: "Receipt", ours: "Received By — Our Side", theirs: "Received From", why: "What It Was For",
    site: "Select Project", company: "Our Company", party: "Received From", narration: "Narration",
    to: "Our Account Number (Received In)", from: "Their Account Number",
    ourAcc: "Our Account Number (Received In)", theirAcc: "Their Account Number", holder: "Their Account Holder Name",
    ourAccKey: "accountNoTo", theirAccKey: "accountNoFrom", ourIfscKey: "ifscTo", theirIfscKey: "ifscFrom",
  },
};

// Payment mode as people read it; stored as "account" / "cash"
const modeLabel = (m) => (m === "cash" ? "By Hand" : "By Account");


// Save-and-recall combobox styled like the app's EntitySelect (click to open,
// dedicated search box, results counter) — but backed by plain strings, and
// with an inline "+ Add" for a brand-new name. Every value picked or added
// here is remembered (server-side, scoped to just this tab) so next time it
// shows up as a one-click option instead of being retyped; nothing is ever
// written back to the global Sites/Companies/Vendors tables used elsewhere.
function SmartField({ label, value, onChange, options = [], placeholder, icon: Icon, kind, onAddNew, addLabel, onEdit }) {
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
        editable: isObj && o.quickId ? o : null,
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
            {/* only when something is picked — the placeholder here read like a suggestion */}
            {value && (
              <div onClick={() => pick("")}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] text-slate-500 cursor-pointer hover:bg-slate-50 hover:text-slate-700 transition-colors border-b border-slate-100">
                <X size={13} /> Clear selection
              </div>
            )}
            {normalized.length === 0 && (
              <div className="px-4 py-3 text-[12px] text-slate-400">Nothing added yet</div>
            )}
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
                {onEdit && o.editable && (
                  <button type="button" title="Edit"
                    onClick={(e) => { e.stopPropagation(); setOpen(false); setSearch(""); onEdit(o.editable); }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 shrink-0 transition-colors">
                    <Pencil size={14} />
                  </button>
                )}
                {kind && <ChevronRight size={15} className="text-slate-300 shrink-0" />}
              </div>
            ))}
            {normalized.length > 0 && filtered.length === 0 && !canAddNew && !onAddNew && (
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

/*
 * startNew: open straight on a new entry with these fields filled in (from a
 * party's ledger — Paid / Received). onFormDone(saved) is then called when
 * the form closes, instead of dropping back to the entries list.
 * onOpenParty(name): party names in the table open that party's ledger.
 */
export default function LedgerEntries({ onHeaderActionsChange, onViewChange, startNew = null, onFormDone, onOpenParty }) {
  const { canAdd, canEdit, canDelete, canExport, canManageColumns, canViewLog } = useModulePermissions("treasury_ledger");

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seed, setSeed] = useState({ sites: [], companies: [], vendors: [] });
  const [saved, setSaved] = useState({});
  const [codedValues, setCodedValues] = useState({ category: [] });
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

  const [view, setView]           = useState(startNew ? "form" : "list");
  const [form, setForm]           = useState(() => (startNew ? { ...emptyForm, entryDate: new Date().toISOString().slice(0, 10), ...startNew } : emptyForm));
  const [docs, setDocs]           = useState([]);
  const [editId, setEditId]       = useState(null);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [viewEntry, setViewEntry] = useState(null);
  const [docsEntry, setDocsEntry] = useState(null);
  const [showColumns, setShowColumns] = useState(false);
  const [newColName, setNewColName]   = useState("");
  // "Add New" from a pick list opens the same panel as Treasury › Masters
  const [addNew, setAddNew] = useState(null); // "projects" | "companies" | "parties" | "category" | null
  const [addAccountFor, setAddAccountFor] = useState(null); // { side: "ours"|"theirs", owner } | null
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, onConfirm } | null
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

  const loadSeed = () =>
    fetch(`${BASE}/seed-options`, { headers: authHeaders() }).then(r => r.json())
      .then(d => { setSeed(d); return d; }).catch(() => null);

  const loadCodedValues = () => {
    const keys = ["category"];
    Promise.all(keys.map(k => fetch(`${BASE}/coded-values?field=${k}`, { headers: authHeaders() }).then(r => r.json()).then(d => [k, d.values || []]).catch(() => [k, []])))
      .then(pairs => setCodedValues(Object.fromEntries(pairs)));
  };

  useEffect(() => {
    loadSeed();
    loadSaved();
    loadCustomColumns();
    loadCodedValues();
  }, []);

  // ── Bank accounts from Masters ────────────────────────────────────────
  // The picked company / party's accounts (primary first). Picking one fills
  // the account number, IFSC and — on their side — the holder name.
  const ownerOf = (side, f = form) => {
    const name = String(side === "ours" ? f.companyName : f.partyName).trim().toLowerCase();
    const list = side === "ours" ? seed.companies : seed.vendors;
    return name ? (list || []).find(o => o.name.trim().toLowerCase() === name) : null;
  };
  const fillAccount = (f, side, acc) => {
    const L2 = LABELS[f.entryType];
    const next = { ...f, [side === "ours" ? L2.ourAccKey : L2.theirAccKey]: acc?.accountNumber || "",
      [side === "ours" ? L2.ourIfscKey : L2.theirIfscKey]: acc?.ifsc || "" };
    if (side === "theirs") next.accountHolderName = acc?.holderName || "";
    return next;
  };
  // New company / party picked → its primary account, or blank
  const pickOwner = (side, name) => setForm(f => {
    const next = { ...f, [side === "ours" ? "companyName" : "partyName"]: name };
    if (next.paymentMode === "cash") return next;
    const owner = ownerOf(side, next);
    return fillAccount(next, side, owner?.accounts?.find(a => a.isPrimary) || owner?.accounts?.[0] || null);
  });
  const sideAccounts = (side, f = form) => [
    ...(ownerOf(side, f)?.accounts || []),
    ...(side === "ours" ? seed.otherAccounts || [] : []),
  ];
  const pickAccount = (side, number) => setForm(f => {
    const acc = sideAccounts(side, f).find(a => a.accountNumber === number);
    return acc ? fillAccount(f, side, acc) : { ...f, [side === "ours" ? LABELS[f.entryType].ourAccKey : LABELS[f.entryType].theirAccKey]: number };
  });
  const accountOptions = (side) => sideAccounts(side).map(a => ({
    name: a.accountNumber, code: a.isPrimary ? "Primary" : "",
    sub: [a.bankName, a.label, a.ifsc && `IFSC ${a.ifsc}`, a.holderName].filter(Boolean).join(" · "),
  }));
  const saveNewAccount = async (data) => {
    const { side, owner, other } = addAccountFor;
    // our side with no company picked → an Other / Personal account
    const { account } = await mastersApi("/accounts", {
      method: "POST", body: other ? { ...data, ownerType: "other" } : { ...data, ownerType: side === "ours" ? "company" : "party", ownerId: owner.id },
    });
    loadSeed();
    setForm(f => fillAccount(f, side, account));
    setAddAccountFor(null);
    showToast(`Account ${maskAcc(account)} added to ${other ? "Other Accounts" : owner.name}`);
  };
  const startAddAccount = (side) => {
    const owner = ownerOf(side);
    if (side === "ours" && !owner) return setAddAccountFor({ side, other: true });
    if (!owner) return showToast("Pick the party first", "error");
    setAddAccountFor({ side, owner });
  };

  // Something added through "Add New": refresh the lists, pick it in the
  // form, and for a party / company fill in its primary account too.
  const onAddedNew = async (kind, message, item) => {
    setAddNew(null);
    showToast(message);
    if (kind === "category") {
      loadCodedValues();
      setForm(f => ({ ...f, category: item?.value || f.category }));
      return;
    }
    const name = item?.name || "";
    const fresh = await loadSeed();
    const formKey = { projects: "siteName", companies: "companyName", parties: "partyName" }[kind];
    setForm(f => {
      let next = { ...f, [formKey]: name };
      if (kind !== "projects" && next.paymentMode !== "cash" && fresh) {
        const list = kind === "companies" ? fresh.companies : fresh.vendors;
        const owner = (list || []).find(o => o.name.trim().toLowerCase() === name.trim().toLowerCase());
        const acc = owner?.accounts?.find(a => a.isPrimary) || owner?.accounts?.[0];
        if (acc) next = fillAccount(next, kind === "companies" ? "ours" : "theirs", acc);
      }
      return next;
    });
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

  const deleteColumn = (slot, label) => {
    setConfirmModal({
      title: "Delete this column?",
      message: `"${label}" will be removed, along with its data on every entry. This can't be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await fetch(`${BASE}/custom-columns/${slot}`, { method: "DELETE", headers: authHeaders() });
          loadCustomColumns();
          fetchEntries();
          showToast("Column deleted");
        } catch { showToast("Failed to delete column", "error"); }
      },
    });
  };

  // Leave the form: back to the list, or hand control back to the caller
  const closeForm = (saved = false) => {
    setView("list");
    if (startNew) onFormDone?.(saved);
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
      narration: e.narration || "", amount: e.amount || "",
      paymentMode: e.paymentMode || "account",
      accountNoTo: e.accountNoTo || "", accountNoFrom: e.accountNoFrom || "", ifscTo: e.ifscTo || "", ifscFrom: e.ifscFrom || "",
      accountHolderName: e.accountHolderName || "",
      category: e.category || "", remarks: e.remarks || "",
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
    entryType: "Type", entryDate: "Date", siteName: "Project", companyName: "Company", partyName: "Party",
    narration: "Narration", amount: "Amount", accountNoTo: "Paid To Account", accountNoFrom: "Paid From Account",
    ifscTo: "Paid To IFSC", ifscFrom: "Paid From IFSC",
    paymentMode: "Payment Mode", accountHolderName: "Account Holder", category: "Category", remarks: "Remarks",
    customField1: "Custom 1", customField2: "Custom 2", customField3: "Custom 3", customField4: "Custom 4", customField5: "Custom 5",
  };
  const diffEntry = (original, next) => {
    const changes = {};
    Object.keys(FIELD_LOG_LABELS).forEach(key => {
      // the log shows "By Hand" / "By Account", not the stored value
      const show = (v) => (key === "paymentMode" ? modeLabel(v) : String(v ?? "").trim());
      const from = show(original[key]);
      const to   = show(next[key]);
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
        logAudit("treasury_ledger_entry", editId, label, "updated", changes && Object.keys(changes).length ? changes : null);
      } else if (data.entry?.id) {
        logAudit("treasury_ledger_entry", data.entry.id, label, "created", {
          Type: form.entryType === "payment" ? "Paid" : "Received", Amount: form.amount, Project: form.siteName || "—", Company: form.companyName || "—",
        });
      }

      showToast(editId ? "Entry updated" : "Entry added");
      closeForm(true);
      fetchEntries();
      loadSaved();
    } catch (err) { showToast(err.message || "Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = (id) => {
    const target = entries.find(x => x.id === id);
    setConfirmModal({
      title: "Delete this entry?",
      message: `${target?.partyName || target?.companyName || "This entry"} will be permanently removed. This can't be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const u = currentUser();
          await fetch(`${BASE}/entries/${id}`, {
            method: "DELETE", headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ deletedByName: u.name || "" }),
          });
          logAudit("treasury_ledger_entry", id, target?.partyName || target?.companyName || "Entry", "deleted", null);
          showToast("Entry deleted");
          fetchEntries();
        } catch { showToast("Failed to delete", "error"); }
      },
    });
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
    const matchesSearch = !s || [e.partyName, e.narration, e.siteName, e.companyName, e.accountNoTo, e.accountNoFrom, e.accountHolderName, e.category]
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
        "S.No": i + 1, "Type": e.entryType === "payment" ? "Paid" : "Received", "Date": fmtDate(e.entryDate),
        "Project": e.siteName, "Company": e.companyName, "Party": e.partyName, "Category": e.category, "Narration": e.narration,
        "Amount": e.amount, "Payment Mode": modeLabel(e.paymentMode), "To Account No": e.accountNoTo, "To IFSC": e.ifscTo, "From Account No": e.accountNoFrom, "From IFSC": e.ifscFrom,
        "Account Holder": e.accountHolderName, "Remarks": e.remarks,
      };
      activeColumns.forEach(c => { row[c.label] = e[`customField${c.slot}`]; });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Party Ledger");
    XLSX.writeFile(wb, "party_ledger.xlsx");
  };

  const L = LABELS[form.entryType];

  useEffect(() => { onViewChange?.(view); }, [view]);

  useEffect(() => {
    if (!onHeaderActionsChange) return;
    if (view !== "list") { onHeaderActionsChange(null); return; }

    onHeaderActionsChange(
      <div className="flex items-center gap-2 shrink-0">
        {canManageColumns && (
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
              {emptySlot && canManageColumns && (
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
        )}
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
              <button onClick={() => closeForm()} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-all shrink-0"><ArrowLeft size={18} /></button>
              <h1 className="text-[15px] font-bold text-slate-800 whitespace-nowrap">{editId ? "Edit Detail" : "Add Detail"}</h1>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit shrink-0">
              {[{ v: "payment", l: "Paid" }, { v: "receipt", l: "Received" }].map(o => (
                <button key={o.v} type="button" onClick={() => setForm(f => ({ ...f, entryType: o.v }))}
                  className={`px-5 py-1.5 rounded-md text-sm font-semibold transition-all ${form.entryType === o.v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-6 space-y-7 pb-28 w-full min-h-screen bg-[#f8fafc]">
          <Section icon={CalendarDays} title={L.first}>
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
              options={seed.sites} placeholder="Type or pick a project…" kind="Projects"
              onAddNew={() => setAddNew("projects")} addLabel="Add New Project" />
          </Section>

          <Section icon={Building2} title={L.ours}>
            <SmartField label={L.company} value={form.companyName} onChange={v => pickOwner("ours", v)}
              options={seed.companies} placeholder="Type or pick our company…" kind="Companies"
              onAddNew={() => setAddNew("companies")} addLabel="Add New Company" />
            <Field label="Payment Mode">
              <Select value={form.paymentMode} onChange={e => {
                const mode = e.target.value;
                // switching to By Account fills both sides' primary accounts
                setForm(f => {
                  let next = { ...f, paymentMode: mode };
                  if (mode === "account") ["ours", "theirs"].forEach(side => {
                    const o = ownerOf(side, next);
                    if (o && !next[side === "ours" ? L.ourAccKey : L.theirAccKey]) next = fillAccount(next, side, o.accounts?.find(a => a.isPrimary) || o.accounts?.[0] || null);
                  });
                  return next;
                });
              }}>
                <option value="account">By Account</option>
                <option value="cash">By Hand</option>
              </Select>
            </Field>
            {form.paymentMode !== "cash" && (<>
              <SmartField label={L.ourAcc} value={form[L.ourAccKey]} onChange={v => pickAccount("ours", v)}
                options={accountOptions("ours")} placeholder="Pick an account…"
                onAddNew={() => startAddAccount("ours")} addLabel="Add Bank Account" />
              <Field label="Our IFSC">
                <input value={form[L.ourIfscKey]} onChange={e => setForm(f => ({ ...f, [L.ourIfscKey]: e.target.value.toUpperCase() }))} className={`${inp} uppercase placeholder:normal-case`} placeholder="Fills from the account" />
              </Field>
            </>)}
          </Section>

          <Section icon={CreditCard} title={L.theirs}>
            <SmartField label={L.party} value={form.partyName} onChange={v => pickOwner("theirs", v)}
              options={seed.vendors} placeholder={form.entryType === "payment" ? "Type or pick a vendor…" : "Who paid you?"} kind="Vendors"
              onAddNew={() => setAddNew("parties")} addLabel="Add New Vendor" />
            {form.paymentMode !== "cash" && (<>
              <SmartField label={L.theirAcc} value={form[L.theirAccKey]} onChange={v => pickAccount("theirs", v)}
                options={accountOptions("theirs")} placeholder={form.partyName ? "Pick an account…" : "Pick the party first"}
                onAddNew={() => startAddAccount("theirs")} addLabel="Add Bank Account" />
              <Field label={form.entryType === "payment" ? "Vendor IFSC" : "Their IFSC"}>
                <input value={form[L.theirIfscKey]} onChange={e => setForm(f => ({ ...f, [L.theirIfscKey]: e.target.value.toUpperCase() }))} className={`${inp} uppercase placeholder:normal-case`} placeholder="Fills from the account" />
              </Field>
              <SmartField label={L.holder} value={form.accountHolderName} onChange={v => setForm(f => ({ ...f, accountHolderName: v }))}
                options={saved.account_holder_name || []} placeholder="Account holder name…" />
            </>)}
          </Section>

          <Section icon={FileText} title={L.why}>
            <SmartField label="Category" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
              options={codedValues.category.map(c => ({ name: c.value, code: `CAT-${c.code}` }))} placeholder="Material, Advance, Labour…" icon={Sparkles}
              onAddNew={() => setAddNew("category")} addLabel="Add New Category" />
            <Field label={L.narration}>
              <input value={form.narration} onChange={e => setForm(f => ({ ...f, narration: e.target.value }))} className={inp} placeholder="e.g. 50 bags cement…" />
            </Field>
            <Field label="Remarks">
              <input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} className={inp} placeholder="Optional notes…" />
            </Field>
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
          <button onClick={() => closeForm()}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
            {saving ? "Saving…" : editId ? "Update Detail" : "Add Detail"}
          </button>
        </div>

        {addNew && addNew !== "category" && (
          <RecordModal kind={addNew} onClose={() => setAddNew(null)} canAdd={canAdd} canEdit={canEdit} notify={showToast}
            onSaved={(msg, item) => onAddedNew(addNew, msg, item)} />
        )}
        {addNew === "category" && <CategoryModal onClose={() => setAddNew(null)} onSaved={(msg, item) => onAddedNew("category", msg, item)} />}

        {addAccountFor && <AccountModal other={!!addAccountFor.other} ownerName={addAccountFor.other ? "Other / Personal account" : addAccountFor.owner.name}
          onClose={() => setAddAccountFor(null)} onSave={saveNewAccount} />}
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
        <div className="px-5 sm:px-6 py-2.5 bg-white border-b border-slate-200">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 shadow-sm lg:max-w-md flex-1">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search party, narration, account…"
                className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-slate-400 text-slate-700" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                className="h-10 pl-3 rounded-md border border-slate-200 text-xs font-bold text-slate-700 bg-white outline-none focus:border-slate-400">
                <option value="">All Types</option>
                <option value="payment">Paid</option>
                <option value="receipt">Received</option>
              </Select>
              <MultiFilter label="Project" options={filterOptions.sites} selected={siteFilter} onChange={v => { setSiteFilter(v); setPage(1); }} />
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

      <div className="px-3 sm:px-4 lg:px-6 pt-3 pb-32 w-full bg-[#f8fafc]">
        {/* Totals for the filtered entries — same compact cards as the Orders page */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {[
            { label: "Entries", val: filtered.length, icon: ClipboardList, accent: "#4f46e5", tint: "#eef2ff" },
            { label: "Total Paid", val: fmtINR(totalPaid), icon: ArrowUpCircle, accent: "#e11d48", tint: "#fff1f2" },
            { label: "Total Received", val: fmtINR(totalReceived), icon: ArrowDownCircle, accent: "#059669", tint: "#ecfdf5" },
            { label: "Net Balance", val: fmtINR(totalReceived - totalPaid), icon: Wallet, accent: "#2563eb", tint: "#eff6ff",
              valCls: totalReceived - totalPaid >= 0 ? "text-emerald-600" : "text-rose-600" },
          ].map(s => (
            <div key={s.label}
              className="relative overflow-hidden bg-white rounded-lg border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow duration-200 p-3 flex items-center gap-3 min-w-0">
              <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: s.accent }} />
              <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: s.tint, color: s.accent }}>
                <s.icon size={16} strokeWidth={2.25} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{s.label}</p>
                <p className={`text-lg font-extrabold leading-tight tracking-tight truncate ${s.valCls || "text-slate-800"}`}>{s.val}</p>
              </div>
            </div>
          ))}
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
                  {["Date", "Party", "Our Company", "Category", "Narration", "Project", "Mode", ...activeColumns.map(c => c.label)].map(c => (
                    <th key={c} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">{c}</th>
                  ))}
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Paid</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Received</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Doc</th>
                  <th className="sticky right-0 z-20 text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap bg-slate-50">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(e => (
                  <tr key={e.id} className="group hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{fmtDate(e.entryDate)}</td>
                    <td className="px-3 py-3 border border-slate-200 whitespace-nowrap">
                      {e.partyName && onOpenParty ? (
                        <button type="button" onClick={() => onOpenParty(e.partyName)} title="Open this party's ledger"
                          className="text-left text-sm font-semibold text-slate-800 hover:text-amber-700 hover:underline">{e.partyName}</button>
                      ) : <p className="text-sm font-semibold text-slate-800">{e.partyName || "—"}</p>}
                    </td>
                    {/* our company — its own column, so it isn't read as the party's firm */}
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 min-w-[140px] max-w-[180px]">
                      <p className="leading-snug break-words">{e.companyName || "—"}</p>
                    </td>
                    {/* Category as a small tag; Narration as plain text */}
                    <td className="px-3 py-3 border border-slate-200 whitespace-nowrap">
                      {e.category
                        ? <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{e.category}</span>
                        : <span className="text-sm text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 min-w-[110px] max-w-[180px]">
                      <p className="leading-snug break-words">{e.narration || "—"}</p>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 min-w-[120px] max-w-[160px]"><p className="leading-snug break-words">{e.siteName || "—"}</p></td>
                    <td className="px-3 py-3 border border-slate-200 whitespace-nowrap">
                      <p className="text-sm text-slate-600">{modeLabel(e.paymentMode)}</p>
                    </td>
                    {activeColumns.map(c => (
                      <td key={c.slot} className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{e[`customField${c.slot}`] || "—"}</td>
                    ))}
                    <td className="px-3 py-3 text-sm font-semibold text-rose-700 border border-slate-200 text-right whitespace-nowrap tabular-nums">{e.entryType === "payment" ? fmtINR(e.amount) : ""}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-emerald-700 border border-slate-200 text-right whitespace-nowrap tabular-nums">{e.entryType === "receipt" ? fmtINR(e.amount) : ""}</td>
                    <td className="px-3 py-3 border border-slate-200 text-center">
                      {e.documentUrls?.length ? (
                        <button onClick={() => setDocsEntry(e)} title="View attachments"
                          className="inline-flex items-center gap-1 text-indigo-500 text-xs font-semibold hover:text-indigo-700 hover:underline">
                          <Paperclip size={12} /> {e.documentUrls.length}
                        </button>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="sticky right-0 z-10 border border-slate-200 bg-white group-hover:bg-slate-50">
                      <div className="flex items-center justify-center gap-1.5 px-2">
                        {canEdit && <button onClick={() => openEdit(e)} title="Edit" className={actBtn}><Pencil size={14} /></button>}
                        {canDelete && <button onClick={() => handleDelete(e.id)} title="Delete" className={`${actBtn} hover:text-red-600 hover:border-red-200 hover:bg-red-50`}><Trash2 size={14} /></button>}
                        {canViewLog && <button onClick={() => setLogEntry(e)} title="Activity log" className={actBtn}><Activity size={14} /></button>}
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
                <p className="text-[10px] font-semibold text-cyan-300/80 uppercase tracking-widest mb-0.5">{viewEntry.entryType === "payment" ? "Paid" : "Received"} · {fmtDate(viewEntry.entryDate)}</p>
                <h2 className="text-lg font-bold text-white leading-tight">{viewEntry.partyName || "—"}</h2>
                <p className="text-sm text-slate-300 mt-1">{fmtINR(viewEntry.amount)}</p>
              </div>
              <div className="px-6 py-5 space-y-2.5 text-sm overflow-y-auto">
                <div className="flex justify-between"><span className="text-slate-400">Project</span><span className="text-slate-700 font-medium">{viewEntry.siteName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Company</span><span className="text-slate-700 font-medium">{viewEntry.companyName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">{LABELS[viewEntry.entryType].narration}</span><span className="text-slate-700 font-medium">{viewEntry.narration || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Payment Mode</span><span className="text-slate-700 font-medium">{modeLabel(viewEntry.paymentMode)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Category</span><span className="text-slate-700 font-medium">{viewEntry.category || "—"}</span></div>
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
            entityType="treasury_ledger_entry"
            entityId={logEntry.id}
            entityName={logEntry.partyName || logEntry.companyName}
            onClose={() => setLogEntry(null)}
          />
        )}

        {confirmModal && (
          <ConfirmModal
            title={confirmModal.title}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(null)}
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
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 bg-white shadow-2xl">
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
                  <button key={opt} onClick={() => toggle(opt)} className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">
                    <span className={`mt-px grid h-4 w-4 shrink-0 place-items-center rounded border ${checked ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"}`}>
                      {checked && <span className="text-[10px] font-black leading-none">✓</span>}
                    </span>
                    {/* full name, wrapping to a second line if it has to */}
                    <span className="min-w-0 break-words leading-snug">{opt}</span>
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

// Replaces the browser's native confirm() with something that matches the
// rest of the app — used for anything destructive (delete entry, delete
// custom column).
function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 pt-6 pb-5">
          <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <h2 className="text-base font-bold text-slate-800 mb-1.5">{title}</h2>
          <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={onConfirm} className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-all">Delete</button>
        </div>
      </div>
    </div>
  );
}
