import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Plus, Search, Pencil, Trash2, X, Paperclip, Clock, UploadCloud, Download, FileSpreadsheet,
  ChevronDown, UserPlus, Loader2, Receipt, Users, ArrowLeftRight, Eye,
} from "lucide-react";
import api from "../../utils/api";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import DateRangeFilter from "../../components/DateRangeFilter";
import LogPanel from "../../components/LogPanel";
import Pagination from "./Pagination";
import { logAudit } from "../../utils/auditLog";
import {
  CATEGORIES, ENTRY_TYPES, PROOF_TYPES, PAYMENT_MODES, GRID_TABLE, labelOf, taxLabel, fmtAmount, fmtDate, todayStr, apiError,
} from "./pettyCashConstants";

const LAST_PROJECT_KEY  = "petty_cash_last_project";
const LAST_LOCATION_KEY = "petty_cash_last_location";

const readLocal = (key) => { try { return localStorage.getItem(key) || ""; } catch { return ""; } };
const writeLocal = (key, value) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } };
const currentUser = () => { try { return JSON.parse(localStorage.getItem("bms_user") || "{}"); } catch { return {}; } };

const emptyForm = (entryType = "expense") => ({
  entryType, entryDate: todayStr(), amount: "", personId: "", fromPersonId: "",
  particular: "", category: "", proofType: "", paymentMode: "",
  project: readLocal(LAST_PROJECT_KEY), location: readLocal(LAST_LOCATION_KEY), remarks: "",
});

const inp = "w-full h-11 border border-slate-300 rounded-lg px-3 text-sm outline-none bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-500 transition-colors";

const Field = ({ label, required, children, wide }) => (
  <div className={wide ? "sm:col-span-2" : ""}>
    <label className="block text-[13px] font-semibold text-slate-800 mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
  </div>
);

const Select = ({ value, onChange, children, disabled }) => (
  <div className="relative">
    <select value={value} onChange={onChange} disabled={disabled} className={`${inp} appearance-none pr-8 disabled:bg-slate-50`}>
      {children}
    </select>
    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
  </div>
);

const FilterSelect = ({ value, onChange, children }) => (
  <div className="relative">
    <select value={value} onChange={onChange}
      className="h-9 appearance-none border border-slate-200 rounded-lg pl-3 pr-9 text-sm text-slate-700 outline-none bg-white focus:border-slate-400 cursor-pointer">
      {children}
    </select>
    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
  </div>
);

const STAFF_TABS = [
  { id: "entries",  label: "Expenses",         icon: Receipt },
  { id: "movement", label: "Received & Given", icon: ArrowLeftRight },
  { id: "people",   label: "Person-wise",      icon: Users },
];

// Which entry types each list tab shows.
const TAB_TYPES = { entries: ["expense"], movement: ["received", "transfer"] };

// What the row's person did — shown under the name in the Person column.
const PERSON_ROLE = { expense: "Paid by", received: "Received by", transfer: "Given to" };

const TYPE_BADGE = {
  expense:  "bg-rose-50 text-rose-700 border-rose-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  transfer: "bg-sky-50 text-sky-700 border-sky-200",
};

// Bulk-upload template columns, in order. The Type / Bill Type / Payment
// Mode / Category cells take the same labels the form shows.
const TEMPLATE_HEADERS = [
  "Type", "Date", "Amount", "Person", "Given By", "Expense", "Category",
  "Bill Type", "Payment Mode", "Project", "Location", "Remarks",
];

const byLabel = (list, raw) => {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return "";
  return list.find(o => o.label.toLowerCase() === v || o.value === v)?.value || `__invalid:${raw}`;
};

// Accepts real Excel dates (cellDates), "YYYY-MM-DD", "DD-MM-YYYY",
// "DD/MM/YYYY" and "14-Sep-26" style strings.
const parseSheetDate = (raw) => {
  if (!raw) return "";
  const pad = (n) => String(n).padStart(2, "0");
  if (raw instanceof Date && !isNaN(raw)) return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/);
  if (m) {
    const month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(m[2].slice(0, 3).toLowerCase());
    if (month >= 0) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(month + 1)}-${pad(m[1])}`;
  }
  return `__invalid:${s}`;
};

export default function PettyCashStaff() {
  const { canAdd, canEdit, canDelete, canExport, canBulk, canViewLog } = useModulePermissions("petty_cash_staff");

  const [entries, setEntries]     = useState([]);
  const [people, setPeople]       = useState([]);
  const [locations, setLocations] = useState([]);
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);

  const [search, setSearch]           = useState("");
  const [typeFilter, setTypeFilter]   = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [dateRange, setDateRange]     = useState("all");
  const [customFrom, setCustomFrom]   = useState("");
  const [customTo, setCustomTo]       = useState("");
  const [page, setPage]               = useState(1);
  const [perPage, setPerPage]         = useState(20);
  const [subTab, setSubTab]           = useState("entries");

  const [formOpen, setFormOpen]     = useState(false);
  const [form, setForm]             = useState(emptyForm());
  const [docs, setDocs]             = useState([]);
  const [editOriginal, setEditOriginal] = useState(null);
  const [saving, setSaving]         = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [personModal, setPersonModal] = useState(null); // field name the new person fills
  const [docsEntry, setDocsEntry]   = useState(null);
  const [viewEntry, setViewEntry]   = useState(null);
  const [viewPerson, setViewPerson] = useState(null); // a balances.list row
  const [logEntry, setLogEntry]     = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [toast, setToast]           = useState(null);
  const bulkInputRef = useRef(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchEntries = async () => {
    try {
      const { data } = await api.get("/api/petty-cash/entries");
      setEntries(data.entries || []);
    } catch (err) { showToast(apiError(err, "Failed to load entries"), "error"); }
    setLoading(false);
  };
  const fetchPeople = async () => {
    try { const { data } = await api.get("/api/petty-cash/people"); setPeople(data.people || []); } catch { /* shown via entries */ }
  };
  const fetchLocations = async () => {
    try { const { data } = await api.get("/api/petty-cash/locations"); setLocations(data.locations || []); } catch { /* optional */ }
  };

  useEffect(() => {
    fetchEntries();
    fetchPeople();
    fetchLocations();
    api.get("/api/projects").then(({ data }) => setProjects((data.projects || []).filter(p => p.isActive))).catch(() => {});
  }, []);

  // ── Balances (always over the whole ledger, not the filtered view) ──────
  const balances = useMemo(() => {
    const map = {};
    const row = (id, name) => (map[id] ||= { id, name, fromAccounts: 0, gotFromOthers: 0, givenToOthers: 0, expense: 0 });
    entries.forEach(e => {
      if (e.entryType === "received") row(e.personId, e.personName).fromAccounts += e.amount;
      else if (e.entryType === "expense") row(e.personId, e.personName).expense += e.amount;
      else {
        row(e.personId, e.personName).gotFromOthers += e.amount;
        row(e.fromPersonId, e.fromPersonName).givenToOthers += e.amount;
      }
    });
    const list = Object.values(map)
      .map(r => ({ ...r, balance: r.fromAccounts + r.gotFromOthers - r.givenToOthers - r.expense }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const totalReceived = list.reduce((s, r) => s + r.fromAccounts, 0);
    const totalExpense  = list.reduce((s, r) => s + r.expense, 0);
    return { list, totalReceived, totalExpense, totalBalance: totalReceived - totalExpense };
  }, [entries]);

  // ── Filtering ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tabTypes = TAB_TYPES[subTab];
    return entries.filter(e => {
      if (tabTypes && !tabTypes.includes(e.entryType)) return false;
      if (typeFilter && e.entryType !== typeFilter) return false;
      if (personFilter && e.personId !== personFilter && e.fromPersonId !== personFilter) return false;
      if (dateRange !== "all" && customFrom && e.entryDate < customFrom) return false;
      if (dateRange !== "all" && customTo && e.entryDate > customTo) return false;
      if (!q) return true;
      return [e.particular, e.personName, e.fromPersonName, e.remarks, e.category, e.location, e.project]
        .some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [entries, subTab, search, typeFilter, personFilter, dateRange, customFrom, customTo]);

  const columns = subTab === "entries"
    ? ["Date", "Expense", "Amount", "Paid By", "Bill Type", "Payment", "Remarks", "Attachments", "Action"]
    : ["Date", "Type", "From", "To", "Amount", "Remarks", "Attachments", "Action"];

  // One pager shared by all three tabs (switching tabs resets to page 1).
  const listTotal = subTab === "people" ? balances.list.length : filtered.length;
  const pageCount = Math.max(1, Math.ceil(listTotal / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
  const peopleRows = balances.list.slice((page - 1) * perPage, page * perPage);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  // ── Form ────────────────────────────────────────────────────────────────
  const openAdd = (entryType) => {
    setForm(emptyForm(entryType));
    setDocs([]);
    setEditOriginal(null);
    setAddMenuOpen(false);
    setFormOpen(true);
  };
  const openEdit = (e) => {
    setForm({
      entryType: e.entryType, entryDate: String(e.entryDate || "").slice(0, 10), amount: String(e.amount),
      personId: e.personId || "", fromPersonId: e.fromPersonId || "",
      particular: e.particular, category: e.category, proofType: e.proofType, paymentMode: e.paymentMode,
      project: e.project, location: e.location, remarks: e.remarks,
    });
    setDocs((e.documentUrls || []).map(url => ({ url, keepPath: url })));
    setEditOriginal(e);
    setFormOpen(true);
  };
  const closeForm = () => {
    docs.forEach(d => d.previewUrl && URL.revokeObjectURL(d.previewUrl));
    setFormOpen(false);
  };
  const set = (key) => (ev) => setForm(f => ({ ...f, [key]: ev.target.value }));

  const addFiles = (files) => setDocs(prev => [...prev, ...files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  const removeDoc = (idx) => setDocs(prev => {
    if (prev[idx]?.previewUrl) URL.revokeObjectURL(prev[idx].previewUrl);
    return prev.filter((_, i) => i !== idx);
  });

  const personName = (id) => people.find(p => p.id === id)?.name || "";
  const entryLabel = (f) =>
    f.entryType === "expense" ? f.particular || "Expense"
    : f.entryType === "received" ? `Received from Accounts — ${personName(f.personId)}`
    : `${personName(f.fromPersonId)} → ${personName(f.personId)}`;

  const LOG_FIELDS = {
    entryType: "Type", entryDate: "Date", amount: "Amount", personId: "Person", fromPersonId: "Given By",
    particular: "Expense", category: "Category", proofType: "Bill Type", paymentMode: "Payment Mode",
    project: "Project", location: "Location", remarks: "Remarks",
  };
  const displayValue = (key, value) => {
    if (key === "personId" || key === "fromPersonId") return personName(value);
    if (key === "entryType") return labelOf(ENTRY_TYPES, value);
    if (key === "proofType") return labelOf(PROOF_TYPES, value);
    if (key === "paymentMode") return labelOf(PAYMENT_MODES, value);
    return String(value ?? "").trim();
  };
  const diff = (original, next) => {
    const changes = {};
    Object.keys(LOG_FIELDS).forEach(key => {
      const from = displayValue(key, original[key]);
      const to   = displayValue(key, next[key]);
      if (key === "amount" ? Number(from) !== Number(to) : from !== to) {
        changes[LOG_FIELDS[key]] = { from: from || "—", to: to || "—" };
      }
    });
    return changes;
  };

  const handleSave = async () => {
    const f = form;
    if (!f.entryDate) return showToast("Date is required", "error");
    if (!(Number(f.amount) > 0)) return showToast("Amount must be greater than 0", "error");
    if (f.entryType === "expense") {
      if (!f.particular.trim()) return showToast("Expense is required", "error");
      if (!f.personId) return showToast("Paid By is required", "error");
      if (!f.category) return showToast("Category is required", "error");
      if (!f.proofType) return showToast("Bill type is required", "error");
      if (!f.paymentMode) return showToast("Payment mode is required", "error");
    } else if (f.entryType === "received") {
      if (!f.personId) return showToast("Received By is required", "error");
    } else {
      if (!f.fromPersonId || !f.personId) return showToast("Given By and Given To are required", "error");
      if (f.fromPersonId === f.personId) return showToast("Given By and Given To can't be the same person", "error");
    }

    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v ?? ""));
      fd.append("createdByName", currentUser().name || "");
      if (editOriginal) fd.append("documentKeep", JSON.stringify(docs.filter(d => d.keepPath).map(d => d.keepPath)));
      docs.filter(d => d.file).forEach(d => fd.append("document", d.file));

      const { data } = editOriginal
        ? await api.put(`/api/petty-cash/entries/${editOriginal.id}`, fd)
        : await api.post("/api/petty-cash/entries", fd);

      if (editOriginal) {
        const changes = diff({ ...editOriginal, amount: String(editOriginal.amount) }, f);
        logAudit("petty_cash_entry", editOriginal.id, entryLabel(f), "updated", Object.keys(changes).length ? changes : null);
      } else if (data.entry?.id) {
        logAudit("petty_cash_entry", data.entry.id, entryLabel(f), "created", {
          Type: labelOf(ENTRY_TYPES, f.entryType), Amount: f.amount, Date: f.entryDate,
        });
      }

      if (f.entryType === "expense") {
        writeLocal(LAST_PROJECT_KEY, f.project);
        writeLocal(LAST_LOCATION_KEY, f.location);
      }
      showToast(editOriginal ? "Entry updated" : "Entry added");
      closeForm();
      fetchEntries();
      fetchLocations();
    } catch (err) { showToast(apiError(err, "Failed to save"), "error"); }
    setSaving(false);
  };

  const handleDelete = async (e) => {
    setConfirmDelete(null);
    try {
      await api.delete(`/api/petty-cash/entries/${e.id}`, { data: { deletedByName: currentUser().name || "" } });
      logAudit("petty_cash_entry", e.id, e.particular || labelOf(ENTRY_TYPES, e.entryType), "deleted", null);
      showToast("Entry deleted");
      fetchEntries();
    } catch (err) { showToast(apiError(err, "Failed to delete"), "error"); }
  };

  // ── Bulk upload ─────────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const sample = [
      TEMPLATE_HEADERS,
      ["Received", "2026-09-01", 20000, "Jitendar", "", "", "", "", "", "", "", "Petty cash for September"],
      ["Transfer", "2026-09-02", 5000, "Lalit", "Jitendar", "", "", "", "", "", "", ""],
      ["Expense", "2026-09-14", 729, "Jitendar", "", "Mithai", "Kitchen & Grocery", "Local Bill", "Cash", "", "Noida", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sample);
    ws["!cols"] = TEMPLATE_HEADERS.map(h => ({ wch: Math.max(14, h.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, "Entries");

    const maxLen = Math.max(CATEGORIES.length, ENTRY_TYPES.length, PROOF_TYPES.length, PAYMENT_MODES.length);
    const opts = [["Type", "Category", "Bill Type", "Payment Mode"]];
    const typeWords = ["Expense", "Received", "Transfer"];
    for (let i = 0; i < maxLen; i++) {
      opts.push([typeWords[i] || "", CATEGORIES[i] || "", PROOF_TYPES[i]?.label || "", PAYMENT_MODES[i]?.label || ""]);
    }
    const notes = [
      [],
      ["How to fill"],
      ["Type: Expense = money spent, Received = money from Accounts, Transfer = one person gave money to another."],
      ["Person: who spent (Expense), who got it from Accounts (Received), or who got it (Transfer)."],
      ["Given By: only for Transfer — who gave the money."],
      ["Expense, Category, Bill Type, Payment Mode: required for Expense rows only."],
      ["Date: YYYY-MM-DD, DD-MM-YYYY or 14-Sep-26. New person names are created automatically."],
    ];
    const wsOpts = XLSX.utils.aoa_to_sheet([...opts, ...notes]);
    wsOpts["!cols"] = [{ wch: 14 }, { wch: 34 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsOpts, "Options");
    XLSX.writeFile(wb, "petty_cash_template.xlsx");
  };

  const handleBulkFile = async (file) => {
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const ws = wb.Sheets["Entries"] || wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
      const rows = raw
        .map((r, i) => ({ r, rowNumber: i + 2 }))
        .filter(({ r }) => Object.values(r).some(v => String(v).trim() !== ""))
        .map(({ r, rowNumber }) => {
          const typeWord = String(r["Type"] || "").trim().toLowerCase();
          const entryType = { expense: "expense", received: "received", transfer: "transfer" }[typeWord]
            || byLabel(ENTRY_TYPES, r["Type"]);
          return {
            rowNumber,
            entryType,
            entryDate: parseSheetDate(r["Date"]),
            amount: r["Amount"],
            personName: r["Person"],
            fromPersonName: r["Given By"],
            particular: r["Expense"],
            category: CATEGORIES.find(c => c.toLowerCase() === String(r["Category"] || "").trim().toLowerCase()) || String(r["Category"] || "").trim(),
            proofType: byLabel(PROOF_TYPES, r["Bill Type"]),
            paymentMode: byLabel(PAYMENT_MODES, r["Payment Mode"]),
            project: r["Project"], location: r["Location"], remarks: r["Remarks"],
          };
        });
      if (!rows.length) return showToast("The file has no rows", "error");

      const localErrors = [];
      rows.forEach(r => {
        Object.entries({ Type: r.entryType, Date: r.entryDate, "Bill Type": r.proofType, "Payment Mode": r.paymentMode })
          .forEach(([col, v]) => { if (String(v).startsWith("__invalid:")) localErrors.push(`Row ${r.rowNumber}: invalid ${col} "${String(v).slice(10)}"`); });
      });
      if (localErrors.length) return setBulkResult({ ok: false, message: "Fix these rows and upload again", details: localErrors.slice(0, 50) });

      const { data } = await api.post("/api/petty-cash/entries/bulk", { rows, createdByName: currentUser().name || "" });
      setBulkResult({ ok: true, message: `${data.inserted} entries imported${data.newPeople ? `, ${data.newPeople} new people added` : ""}.` });
      fetchEntries();
      fetchPeople();
      fetchLocations();
    } catch (err) {
      setBulkResult({ ok: false, message: apiError(err, "Upload failed"), details: err?.response?.data?.details || [] });
    } finally {
      if (bulkInputRef.current) bulkInputRef.current.value = "";
    }
  };

  // ── Export (Staff view, 4-column format) ────────────────────────────────
  const exportList = () => {
    const rows = filtered.map(e => ({
      Date: fmtDate(e.entryDate),
      Type: labelOf(ENTRY_TYPES, e.entryType),
      Expense: e.entryType === "expense" ? e.particular : e.entryType === "transfer" ? `Given by ${e.fromPersonName}` : "Received from Accounts",
      Amount: e.amount,
      Person: `${e.personName} (${PERSON_ROLE[e.entryType]})`,
      "Bill Type": labelOf(PROOF_TYPES, e.proofType),
      Payment: labelOf(PAYMENT_MODES, e.paymentMode),
      Remarks: e.remarks,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Entries");
    const summary = balances.list.map(b => ({
      Person: b.name, "From Accounts": b.fromAccounts, "Got from Others": b.gotFromOthers,
      "Given to Others": b.givenToOthers, Expense: b.expense, Balance: b.balance,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Person-wise");
    XLSX.writeFile(wb, "petty_cash_staff.xlsx");
  };

  const activePeople = people.filter(p => p.isActive);
  const personSelect = (field, placeholder) => (
    <div className="flex gap-2">
      <div className="flex-1">
        <Select value={form[field]} onChange={set(field)}>
          <option value="">{placeholder}</option>
          {activePeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      <button type="button" onClick={() => setPersonModal(field)} title="Add person"
        className="h-11 w-11 shrink-0 flex items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:text-slate-800 hover:border-slate-500">
        <UserPlus size={16} />
      </button>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl text-sm font-medium shadow-lg
          ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Received (from Accounts)", value: balances.totalReceived, color: "text-emerald-700" },
          { label: "Total Expense", value: balances.totalExpense, color: "text-rose-700" },
          { label: "Balance", value: balances.totalBalance, color: balances.totalBalance < 0 ? "text-rose-700" : "text-slate-900" },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-2xl font-extrabold mt-1 tabular-nums ${c.color}`}>₹ {fmtAmount(c.value)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200">
        <div className="flex items-center gap-6">
          {STAFF_TABS.map(t => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => { setSubTab(t.id); setTypeFilter(""); setPage(1); }}
                className={`-mb-px flex items-center gap-1.5 pb-3 border-b-2 text-sm font-semibold transition-colors
                  ${active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pb-2.5">
          {(canBulk || canExport) && (
            <div className="relative">
              <button onClick={() => setMoreMenuOpen(o => !o)} className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50">
                More <ChevronDown size={14} />
              </button>
              {moreMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMoreMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 z-20 w-48 bg-white rounded-xl border border-slate-200 shadow-lg p-1">
                    {canBulk && (
                      <>
                        <button onClick={() => { setMoreMenuOpen(false); downloadTemplate(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                          <Download size={14} className="text-slate-400" /> Download Template
                        </button>
                        <button onClick={() => { setMoreMenuOpen(false); bulkInputRef.current?.click(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                          <UploadCloud size={14} className="text-slate-400" /> Bulk Upload
                        </button>
                      </>
                    )}
                    {canExport && (
                      <button onClick={() => { setMoreMenuOpen(false); exportList(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                        <FileSpreadsheet size={14} className="text-slate-400" /> Export
                      </button>
                    )}
                  </div>
                </>
              )}
              {canBulk && <input ref={bulkInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => handleBulkFile(e.target.files?.[0])} />}
            </div>
          )}
          {canAdd && (
            <div className="relative">
              <button onClick={() => setAddMenuOpen(o => !o)} className="h-9 px-3.5 flex items-center gap-1 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700">
                <Plus size={15} /> Add
              </button>
              {addMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAddMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 z-20 w-56 bg-white rounded-xl border border-slate-200 shadow-lg p-1">
                    {ENTRY_TYPES.map(t => (
                      <button key={t.value} onClick={() => openAdd(t.value)}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">{t.label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Person-wise */}
      {subTab === "people" && (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {["Person", "From Accounts", "Got from Others", "Given to Others", "Expense", "Balance", "Action"].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 font-semibold whitespace-nowrap ${i && h !== "Action" ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {balances.list.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No entries yet</td></tr>
              ) : peopleRows.map(b => (
                <tr key={b.id} className="border-t border-slate-200">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{b.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtAmount(b.fromAccounts)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtAmount(b.gotFromOthers)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtAmount(b.givenToOthers)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtAmount(b.expense)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${b.balance < 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmtAmount(b.balance)}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => setViewPerson(b)} title="View entries" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"><Eye size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            {balances.list.length > 0 && (
              <tfoot className="bg-slate-50 font-bold text-slate-800">
                <tr className="border-t border-slate-200">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtAmount(balances.totalReceived)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtAmount(balances.list.reduce((s, b) => s + b.gotFromOthers, 0))}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtAmount(balances.list.reduce((s, b) => s + b.givenToOthers, 0))}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtAmount(balances.totalExpense)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${balances.totalBalance < 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmtAmount(balances.totalBalance)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <Pagination page={page} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={balances.list.length} />
      </div>
      )}

      {/* Expenses / Received & Given */}
      {TAB_TYPES[subTab] && (
      <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search..."
            className="w-full h-9 pl-9 pr-3 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-slate-400" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {subTab === "movement" && (
            <FilterSelect value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
              <option value="">All types</option>
              {ENTRY_TYPES.filter(t => t.value !== "expense").map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </FilterSelect>
          )}
          <FilterSelect value={personFilter} onChange={e => { setPersonFilter(e.target.value); setPage(1); }}>
            <option value="">All people</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FilterSelect>
          <DateRangeFilter dateRange={dateRange} setDateRange={v => { setDateRange(v); setPage(1); }}
            customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={v => { setCustomTo(v); setPage(1); }} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">

        <div className="overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {columns.map((h, i) => (
                  <th key={i} className={`px-4 py-2.5 font-semibold whitespace-nowrap ${h === "Amount" ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">No entries found</td></tr>
              ) : pageRows.map(e => (
                <tr key={e.id} className="border-t border-slate-200 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{fmtDate(e.entryDate)}</td>
                  {subTab === "entries" ? (
                    <>
                      <td className="px-4 py-2.5 text-slate-800 max-w-[280px]">
                        <p className="truncate">{e.particular}</p>
                        <p className="text-[11px] text-slate-400 truncate">{e.category}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap text-rose-700">{fmtAmount(e.amount)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{e.personName}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{labelOf(PROOF_TYPES, e.proofType)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{labelOf(PAYMENT_MODES, e.paymentMode)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${TYPE_BADGE[e.entryType]}`}>{labelOf(ENTRY_TYPES, e.entryType)}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{e.entryType === "received" ? "Accounts" : e.fromPersonName}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{e.personName}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap text-emerald-700">{fmtAmount(e.amount)}</td>
                    </>
                  )}
                  <td className="px-4 py-2.5 text-slate-500 max-w-[220px] truncate" title={e.remarks}>{e.remarks || "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {e.documentUrls?.length > 0 ? (
                      <button onClick={() => setDocsEntry(e)} title="View attachments"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-blue-600 hover:bg-blue-50 font-medium">
                        <Paperclip size={13} /> {e.documentUrls.length}
                      </button>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => setViewEntry(e)} title="View" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"><Eye size={14} /></button>
                      {canViewLog && <button onClick={() => setLogEntry(e)} title="Activity log" className="p-1.5 rounded-lg text-slate-300 hover:text-cyan-600 hover:bg-cyan-50"><Clock size={14} /></button>}
                      {canEdit && <button onClick={() => openEdit(e)} title="Edit" className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50"><Pencil size={14} /></button>}
                      {canDelete && <button onClick={() => setConfirmDelete(e)} title="Delete" className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && <Pagination page={page} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={filtered.length} />}
      </div>
      </>
      )}

      {/* Add / edit form */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h2 className="text-base font-bold text-slate-900">{editOriginal ? "Edit Entry" : "Add Entry"}</h2>
              <button onClick={closeForm} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="px-6 py-5 overflow-y-auto space-y-5">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                {ENTRY_TYPES.map(t => (
                  <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, entryType: t.value }))}
                    className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${form.entryType === t.value ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Date" required><input type="date" value={form.entryDate} onChange={set("entryDate")} className={inp} /></Field>
                <Field label="Amount" required><input type="number" min="0" step="0.01" value={form.amount} onChange={set("amount")} placeholder="0.00" className={inp} /></Field>

                {form.entryType === "expense" && (
                  <>
                    <Field label="Expense" required wide><input value={form.particular} onChange={set("particular")} placeholder="e.g. Food charge (Zomato)" className={inp} /></Field>
                    <Field label="Paid By" required>{personSelect("personId", "Select person")}</Field>
                    <Field label="Category" required>
                      <Select value={form.category} onChange={set("category")}>
                        <option value="">Select category</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </Select>
                    </Field>
                    <Field label="Bill Type" required>
                      <Select value={form.proofType} onChange={set("proofType")}>
                        <option value="">Select bill type</option>
                        {PROOF_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Payment" required>
                      <Select value={form.paymentMode} onChange={set("paymentMode")}>
                        <option value="">Select payment mode</option>
                        {PAYMENT_MODES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Project">
                      <Select value={form.project} onChange={set("project")}>
                        <option value="">—</option>
                        {form.project && !projects.some(p => (p.projectName || p.projectCode) === form.project) && <option value={form.project}>{form.project}</option>}
                        {projects.map(p => {
                          const value = p.projectName || p.projectCode;
                          return <option key={p.id} value={value}>{p.projectCode && p.projectName ? `${p.projectName} (${p.projectCode})` : value}</option>;
                        })}
                      </Select>
                    </Field>
                    <Field label="Location">
                      <input list="petty-cash-locations" value={form.location} onChange={set("location")} placeholder="Type or pick" className={inp} />
                      <datalist id="petty-cash-locations">{locations.map(l => <option key={l} value={l} />)}</datalist>
                    </Field>
                  </>
                )}

                {form.entryType === "received" && (
                  <Field label="Received By" required wide>{personSelect("personId", "Who got the money")}</Field>
                )}

                {form.entryType === "transfer" && (
                  <>
                    <Field label="Given By" required>{personSelect("fromPersonId", "Who gave")}</Field>
                    <Field label="Given To" required>{personSelect("personId", "Who got")}</Field>
                  </>
                )}

                <Field label="Remarks" wide>
                  <textarea value={form.remarks} onChange={set("remarks")} rows={2} className={`${inp} h-auto py-2.5 resize-none`} />
                </Field>

                <Field label="Attachments" wide>
                  <label className="flex items-center justify-center gap-2 h-11 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-slate-500 hover:text-slate-700">
                    <UploadCloud size={16} /> Upload bill / voucher
                    <input type="file" multiple accept="image/*,application/pdf" className="hidden"
                      onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
                  </label>
                  {docs.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {docs.map((d, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-50 text-sm">
                          <a href={d.previewUrl || d.url} target="_blank" rel="noreferrer" className="truncate text-blue-600 hover:underline">
                            {d.file ? d.file.name : `Attachment ${i + 1}`}
                          </a>
                          <button type="button" onClick={() => removeDoc(i)} className="p-1 text-slate-400 hover:text-red-600"><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </Field>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
              <button onClick={closeForm} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />} {editOriginal ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {personModal && (
        <AddPersonModal
          onClose={() => setPersonModal(null)}
          onCreated={(person) => {
            setPeople(prev => [...prev, person].sort((a, b) => a.name.localeCompare(b.name)));
            setForm(f => ({ ...f, [personModal]: person.id }));
            setPersonModal(null);
            showToast(`"${person.name}" added`);
          }}
        />
      )}

      {viewPerson && (
        <PersonLedger
          person={viewPerson}
          entries={entries}
          onViewEntry={setViewEntry}
          onClose={() => setViewPerson(null)}
        />
      )}

      {viewEntry && (
        <EntryDetails
          entry={viewEntry}
          canEdit={canEdit}
          onEdit={() => { const e = viewEntry; setViewEntry(null); openEdit(e); }}
          onClose={() => setViewEntry(null)}
        />
      )}

      {docsEntry && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Attachments</h2>
              <button onClick={() => setDocsEntry(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-1.5">
              {docsEntry.documentUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 text-sm text-blue-600 hover:bg-slate-100">
                  <Paperclip size={14} /> Attachment {i + 1}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {logEntry && (
        <LogPanel
          entityType="petty_cash_entry"
          entityId={logEntry.id}
          entityName={logEntry.particular || labelOf(ENTRY_TYPES, logEntry.entryType)}
          onClose={() => setLogEntry(null)}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 pt-6 pb-5">
              <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center mb-4"><Trash2 size={18} className="text-red-500" /></div>
              <h2 className="text-base font-bold text-slate-800 mb-1.5">Delete entry?</h2>
              <p className="text-sm text-slate-500">
                {labelOf(ENTRY_TYPES, confirmDelete.entryType)} of ₹ {fmtAmount(confirmDelete.amount)} on {fmtDate(confirmDelete.entryDate)} will be removed and balances recalculated.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {bulkResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <h2 className={`text-base font-bold ${bulkResult.ok ? "text-emerald-700" : "text-red-700"}`}>
                {bulkResult.ok ? "Import complete" : "Import failed"}
              </h2>
              <p className="text-sm text-slate-600 mt-1">{bulkResult.message}</p>
            </div>
            {bulkResult.details?.length > 0 && (
              <ul className="px-6 pb-4 overflow-y-auto text-sm text-red-700 space-y-1 list-disc list-inside">
                {bulkResult.details.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
            <div className="flex justify-end px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setBulkResult(null)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const fmtStamp = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
}) : "");

// Every entry that moved money in or out of one person's hands, oldest
// first, with a running balance — explains how the Person-wise figure
// was reached.
function PersonLedger({ person, entries, onViewEntry, onClose }) {
  const rows = useMemo(() => {
    const mine = entries
      .filter(e => e.personId === person.id || e.fromPersonId === person.id)
      .sort((a, b) => (a.entryDate === b.entryDate
        ? String(a.createdAt).localeCompare(String(b.createdAt))
        : a.entryDate.localeCompare(b.entryDate)));
    const describe = (e) => {
      if (e.entryType === "expense") return [`${e.particular}${e.category ? ` (${e.category})` : ""}`, -e.amount];
      if (e.entryType === "received") return ["From Accounts", e.amount];
      if (e.personId === person.id) return [`From ${e.fromPersonName}`, e.amount];
      return [`To ${e.personName}`, -e.amount];
    };
    return mine.reduce((acc, e) => {
      const [detail, signed] = describe(e);
      const running = (acc.length ? acc[acc.length - 1].running : 0) + signed;
      return [...acc, { e, detail, signed, running }];
    }, []);
  }, [entries, person.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">{person.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Balance <b className={`tabular-nums ${person.balance < 0 ? "text-rose-600" : "text-emerald-700"}`}>₹ {fmtAmount(person.balance)}</b>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-100 border-b border-slate-100 shrink-0">
          {[
            ["From Accounts", person.fromAccounts],
            ["Got from Others", person.gotFromOthers],
            ["Given to Others", person.givenToOthers],
            ["Expense", person.expense],
          ].map(([label, value]) => (
            <div key={label} className="bg-white px-5 py-3">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
              <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">₹ {fmtAmount(value)}</p>
            </div>
          ))}
        </div>

        <div className="overflow-auto">
          <table className={GRID_TABLE}>
            <thead className="bg-slate-50 text-slate-600 sticky top-0">
              <tr>
                {["Date", "Type", "Details", "In", "Out", "Balance", ""].map((h, i) => (
                  <th key={i} className={`px-4 py-2.5 font-semibold whitespace-nowrap ${["In", "Out", "Balance"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No entries</td></tr>
              ) : rows.map(({ e, detail, signed, running }) => (
                <tr key={e.id} className="border-t border-slate-200">
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{fmtDate(e.entryDate)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${TYPE_BADGE[e.entryType]}`}>{labelOf(ENTRY_TYPES, e.entryType)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 max-w-[220px] truncate" title={detail}>{detail}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{signed > 0 ? fmtAmount(signed) : ""}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-rose-700">{signed < 0 ? fmtAmount(-signed) : ""}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${running < 0 ? "text-rose-600" : "text-slate-900"}`}>{fmtAmount(running)}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => onViewEntry(e)} title="View entry" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"><Eye size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700">Close</button>
        </div>
      </div>
    </div>
  );
}

function EntryDetails({ entry: e, canEdit, onEdit, onClose }) {
  const rows = [
    ["Type", labelOf(ENTRY_TYPES, e.entryType)],
    ["Date", fmtDate(e.entryDate)],
    ["Amount", `₹ ${fmtAmount(e.amount)}`],
    ...(e.entryType === "expense" ? [
      ["Expense", e.particular],
      ["Category", e.category],
      ["Paid By", e.personName],
      ["Bill Type", `${labelOf(PROOF_TYPES, e.proofType)} (${taxLabel(e.proofType)})`],
      ["Payment", labelOf(PAYMENT_MODES, e.paymentMode)],
      ["Project", e.project],
      ["Location", e.location],
    ] : e.entryType === "received" ? [
      ["From", "Accounts"],
      ["Received By", e.personName],
    ] : [
      ["Given By", e.fromPersonName],
      ["Given To", e.personName],
    ]),
    ["Remarks", e.remarks],
    ["Added By", [e.createdByName, fmtStamp(e.createdAt)].filter(Boolean).join(" · ")],
    ...(e.updatedAt ? [["Last Updated", fmtStamp(e.updatedAt)]] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Entry Details</h2>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${TYPE_BADGE[e.entryType]}`}>{labelOf(ENTRY_TYPES, e.entryType)}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 overflow-y-auto">
          <dl className="divide-y divide-slate-100">
            {rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[130px_1fr] gap-3 py-2.5 text-sm">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-slate-900 font-medium break-words">{value || "—"}</dd>
              </div>
            ))}
            <div className="grid grid-cols-[130px_1fr] gap-3 py-2.5 text-sm">
              <dt className="text-slate-500">Attachments</dt>
              <dd className="space-y-1">
                {e.documentUrls?.length ? e.documentUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline">
                    <Paperclip size={13} /> Attachment {i + 1}
                  </a>
                )) : <span className="text-slate-900 font-medium">—</span>}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Close</button>
          {canEdit && (
            <button onClick={onEdit} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 flex items-center gap-1.5">
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddPersonModal({ onClose, onCreated }) {
  const [mode, setMode]     = useState("name"); // "name" | "user"
  const [name, setName]     = useState("");
  const [users, setUsers]   = useState([]);
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  useEffect(() => {
    if (mode === "user" && !users.length) {
      api.get("/api/petty-cash/users").then(({ data }) => setUsers(data.users || [])).catch(() => setError("Could not load users"));
    }
  }, [mode]);

  const save = async () => {
    const picked = users.find(u => u.id === userId);
    const finalName = mode === "user" ? picked?.name : name.trim();
    if (!finalName) return setError(mode === "user" ? "Select a user" : "Enter a name");
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/api/petty-cash/people", { name: finalName, userId: mode === "user" ? userId : null });
      onCreated(data.person);
    } catch (err) { setError(apiError(err, "Failed to add")); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Add Person</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {[["name", "Type a name"], ["user", "Pick a login user"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => { setMode(v); setError(""); }}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-semibold ${mode === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
          {mode === "name" ? (
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className={inp}
              onKeyDown={e => e.key === "Enter" && save()} />
          ) : (
            <Select value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">Select user</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-60">Add</button>
        </div>
      </div>
    </div>
  );
}
