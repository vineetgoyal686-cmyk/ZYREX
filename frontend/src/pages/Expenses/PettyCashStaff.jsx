import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Plus, Search, Pencil, Trash2, X, Paperclip, Clock, UploadCloud, Download, FileSpreadsheet,
  ChevronDown, UserPlus, Loader2, Receipt, Users, ArrowLeftRight, Eye, FilePlus2, Package,
  User, Tag, CreditCard, Store, Check, Briefcase, MapPin, CalendarDays, FileText,
} from "lucide-react";
import api from "../../utils/api";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import DateRangeFilter from "../../components/DateRangeFilter";
import LogPanel from "../../components/LogPanel";
import Pagination from "./Pagination";
import VoucherModal from "./PettyCashVoucher";
import { logAudit } from "../../utils/auditLog";
import {
  CATEGORIES, ENTRY_TYPES, PROOF_TYPES, PAYMENT_MODES, GRID_TABLE, DOC_SECTIONS, docSectionsFor, docCount, labelOf, taxLabel, fmtAmount, fmtDate, todayStr, apiError,
} from "./pettyCashConstants";

const LAST_LOCATION_KEY = "petty_cash_last_location";

const readLocal = (key) => { try { return localStorage.getItem(key) || ""; } catch { return ""; } };
const writeLocal = (key, value) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } };
const currentUser = () => { try { return JSON.parse(localStorage.getItem("bms_user") || "{}"); } catch { return {}; } };

const emptyForm = (entryType = "expense", projectId = "") => ({
  entryType, entryDate: todayStr(), amount: "", personId: "", fromPersonId: "",
  particular: "", vendorName: "", category: "", proofType: "", paymentMode: "",
  projectId, location: readLocal(LAST_LOCATION_KEY), remarks: "",
  items: [],
});

// Optional line items behind an expense's total. In the form every field is
// a string; the saved entry holds numbers.
// A voucher file made by Create Voucher is named Voucher_<no>.pdf; the
// saved storage path keeps that name, which is how its details are matched.
const voucherFileName = (no) => `Voucher_${String(no).replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;
const isVoucherDoc = (d, no) => !!no && (d.voucherNo === no || (!d.file && String(d.url || "").includes(voucherFileName(no))));

const emptyItem = () => ({ name: "", qty: "", unit: "", rate: "", amount: "" });
const UNITS = ["nos", "pcs", "kg", "gm", "ltr", "mtr", "ft", "bag", "box", "set", "pkt"];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const itemsTotal = (items) => round2(items.reduce((s, it) => s + (Number(it.amount) || 0), 0));
const isBlankItem = (it) => !String(it.name).trim() && !it.qty && !it.rate && !it.amount;

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

// Closes a popup when the user clicks anywhere outside `ref`.
const useClickOutside = (ref, onOutside) => useEffect(() => {
  const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside(); };
  document.addEventListener("mousedown", h);
  return () => document.removeEventListener("mousedown", h);
}, [ref, onOutside]);

const matchesQuery = (list, q) => {
  const s = q.trim().toLowerCase();
  return s ? list.filter(v => v.toLowerCase().includes(s)) : list;
};

// Vendor field: type a new name or pick one used before. The typed text is
// both the value and the search; a name not in the list is added on save.
function VendorInput({ value, onChange, vendors }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  const matches = matchesQuery(vendors, value);
  const typed = value.trim();
  const isNew = typed && !vendors.some(v => v.toLowerCase() === typed.toLowerCase());
  const pick = (v) => { onChange(v); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === "Escape" || e.key === "Tab") setOpen(false); }}
          placeholder="Search or add a vendor (optional)" className={`${inp} pl-9 pr-8`} />
        {value
          ? <button type="button" onClick={() => pick("")} title="Clear" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700"><X size={14} /></button>
          : <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />}
      </div>
      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-30 overflow-hidden">
          <div className="px-3 py-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border-b border-slate-100">
            {typed ? `${matches.length} of ${vendors.length} vendors found` : `Vendors: ${vendors.length}`}
          </div>
          <div className="max-h-56 overflow-y-auto">
            {isNew && (
              <div onMouseDown={e => { e.preventDefault(); pick(typed); }}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-slate-100 text-[13px] text-emerald-700 font-semibold hover:bg-emerald-50">
                <Plus size={14} /> Add “{typed}” as new vendor
              </div>
            )}
            {matches.map(v => (
              <div key={v} onMouseDown={e => { e.preventDefault(); pick(v); }}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer border-b border-slate-100 last:border-0 text-[13px]
                  ${v.toLowerCase() === typed.toLowerCase() ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-800 hover:bg-slate-50"}`}>
                <span className="truncate">{v}</span>
                {v.toLowerCase() === typed.toLowerCase() && <Check size={14} className="shrink-0 ml-2" />}
              </div>
            ))}
            {!matches.length && !isNew && <div className="px-3 py-3 text-center text-xs text-slate-400">No vendors yet — type a name to add one</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// Vendor filter above the table: searchable list with a found count.
function VendorFilter({ value, onChange, vendors }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  const matches = matchesQuery(vendors, search);
  const pick = (v) => { onChange(v); setOpen(false); setSearch(""); };
  const row = (label, v, extra = "") => (
    <div key={label} onClick={() => pick(v)}
      className={`flex items-center justify-between px-3 py-2 cursor-pointer border-b border-slate-100 last:border-0 text-[13px] ${extra}
        ${value === v ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-800 hover:bg-slate-50"}`}>
      <span className="truncate">{label}</span>
      {value === v && <Check size={14} className="shrink-0 ml-2" />}
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`h-9 w-[170px] flex items-center gap-2 border rounded-lg pl-3 pr-2.5 bg-white text-left text-sm text-slate-700 ${open ? "border-slate-400" : "border-slate-200"}`}>
        <Store size={14} className="text-slate-400 shrink-0" />
        <span className="flex-1 min-w-0 truncate">{value || "All vendors"}</span>
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-[260px] bg-white border border-slate-200 rounded-lg shadow-xl z-40 overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded outline-none focus:border-slate-400 text-slate-700" />
          </div>
          <div className="px-3 py-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border-b border-slate-100">
            {search.trim() ? `${matches.length} of ${vendors.length} vendors found` : `Vendors: ${vendors.length}`}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {!search.trim() && row("All vendors", "")}
            {matches.map(v => row(v, v))}
            {!matches.length && <div className="px-3 py-3 text-center text-xs text-slate-400">No results found</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const STAFF_TABS = [
  { id: "entries",  label: "Expenses",         icon: Receipt },
  { id: "movement", label: "Received & Given", icon: ArrowLeftRight },
  { id: "people",   label: "Person-wise",      icon: Users },
  { id: "items",    label: "Item-wise",        icon: Package },
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

// Bulk-upload templates, one per list tab. The Bill Type / Payment Mode /
// Category cells take the same labels the form shows. Tax / Non Tax is not
// a column: it follows from Bill Type (only Tax Invoice counts as Tax).
const TEMPLATES = {
  entries: {
    file: "petty_cash_expense_template.xlsx",
    headers: ["Date", "Amount", "Paid By", "Expense", "Vendor", "Category", "Bill Type", "Payment Mode", "Location", "Remarks"],
    sample: [
      ["2026-09-14", 729, "Jitendar", "Mithai", "Haldiram", "Kitchen & Grocery", "Local Bill", "Cash", "Noida", ""],
      ["2026-09-14", 1871.94, "Jitendar", "Food charge (Zomato)", "Zomato", "Meals", "Tax Invoice", "Online", "Noida", ""],
    ],
    options: () => {
      const max = Math.max(CATEGORIES.length, PROOF_TYPES.length, PAYMENT_MODES.length);
      return [["Category", "Bill Type", "Payment Mode"],
        ...Array.from({ length: max }, (_, i) => [CATEGORIES[i] || "", PROOF_TYPES[i]?.label || "", PAYMENT_MODES[i]?.label || ""])];
    },
    notes: [
      "Every row is an expense. Date, Amount, Paid By, Expense, Category, Bill Type and Payment Mode are required. Vendor is optional.",
      "Tax / Non Tax is set automatically from Bill Type: Tax Invoice = Tax; Local Bill and Voucher = Non Tax.",
    ],
  },
  movement: {
    file: "petty_cash_received_given_template.xlsx",
    headers: ["Type", "Date", "Amount", "From", "To", "Remarks"],
    sample: [
      ["Received", "2026-09-01", 20000, "Accounts", "Jitendar", "Petty cash for September"],
      ["Given", "2026-09-02", 5000, "Jitendar", "Lalit", ""],
    ],
    options: () => [["Type"], ["Received"], ["Given"]],
    notes: [
      "Type: Received = money from Accounts; Given = one person gave money to another.",
      "From: for Received write Accounts (or leave blank); for Given, the person who gave. To: the person who got the money.",
    ],
  },
};
const COMMON_TEMPLATE_NOTES = [
  "Every row is saved under the Entity and Project selected at the top of Petty Cash — pick a project before uploading.",
  "Date: YYYY-MM-DD, DD-MM-YYYY or 14-Sep-26. New person names are created automatically.",
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

// scope = { company, project (null = all projects), projects } from the
// Petty Cash header; the page is remounted whenever it changes.
export default function PettyCashStaff({ scope }) {
  const { canAdd, canEdit, canDelete, canExport, canBulk, canViewLog } = useModulePermissions("petty_cash_staff");

  const [entries, setEntries]     = useState([]);
  const [people, setPeople]       = useState([]);
  const [locations, setLocations] = useState([]);
  const [vendors, setVendors]     = useState([]); // every vendor name used before, for the form picker
  const [loading, setLoading]     = useState(true);

  const [search, setSearch]           = useState("");
  const [typeFilter, setTypeFilter]   = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [dateRange, setDateRange]     = useState("all");
  const [customFrom, setCustomFrom]   = useState("");
  const [customTo, setCustomTo]       = useState("");
  const [page, setPage]               = useState(1);
  const [perPage, setPerPage]         = useState(20);
  const [subTab, setSubTab]           = useState("entries");

  const [formOpen, setFormOpen]     = useState(false);
  const [form, setForm]             = useState(emptyForm());
  const [docs, setDocs]             = useState(emptyDocs());
  const [editOriginal, setEditOriginal] = useState(null);
  const [saving, setSaving]         = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [docsMenuOpen, setDocsMenuOpen] = useState(false);
  const [zipping, setZipping]       = useState(null); // { done, total } while building a docs zip
  const [personModal, setPersonModal] = useState(null); // field name the new person fills
  const [docsEntry, setDocsEntry]   = useState(null);
  const [viewEntry, setViewEntry]   = useState(null);
  const [viewPerson, setViewPerson] = useState(null); // a balances.list row
  const [viewItem, setViewItem]     = useState(null); // an itemSummary row
  const [voucherOpen, setVoucherOpen] = useState(false);
  // The voucher made for the entry in the form: { voucherNo, data, dirty }.
  // data is loaded on demand for saved entries; dirty means it must be sent
  // on save (data null + dirty = the voucher was removed).
  const [voucher, setVoucher] = useState(null);
  const [voucherEdit, setVoucherEdit] = useState(null); // details being edited
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
      const { data } = await api.get("/api/petty-cash/entries", {
        params: { company_id: scope.company.id, project_id: scope.project?.id || undefined },
      });
      setEntries(data.entries || []);
    } catch (err) { showToast(apiError(err, "Failed to load entries"), "error"); }
    setLoading(false);
  };
  const fetchPeople = async () => {
    try { const { data } = await api.get("/api/petty-cash/people"); setPeople(data.people || []); } catch { /* shown via entries */ }
  };
  const fetchVendors = async () => {
    try { const { data } = await api.get("/api/petty-cash/vendors"); setVendors(data.vendors || []); } catch { /* optional */ }
  };
  const fetchLocations = async () => {
    try { const { data } = await api.get("/api/petty-cash/locations"); setLocations(data.locations || []); } catch { /* optional */ }
  };

  useEffect(() => {
    fetchEntries();
    fetchPeople();
    fetchLocations();
    fetchVendors();
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
    const tabTypes = subTab === "items" ? ["expense"] : TAB_TYPES[subTab];
    return entries.filter(e => {
      if (tabTypes && !tabTypes.includes(e.entryType)) return false;
      if (typeFilter && e.entryType !== typeFilter) return false;
      if (personFilter && e.personId !== personFilter && e.fromPersonId !== personFilter) return false;
      if (vendorFilter && String(e.vendorName || "").trim().toLowerCase() !== vendorFilter.toLowerCase()) return false;
      if (dateRange !== "all" && customFrom && e.entryDate < customFrom) return false;
      if (dateRange !== "all" && customTo && e.entryDate > customTo) return false;
      if (!q || subTab === "items") return true;
      return [e.particular, e.vendorName, e.personName, e.fromPersonName, e.remarks, e.category, e.location, e.project]
        .some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [entries, subTab, search, typeFilter, personFilter, vendorFilter, dateRange, customFrom, customTo]);

  // Item-wise: every item line across the filtered expenses, grouped by
  // name + unit (case-insensitive). Search matches the item name here.
  const itemSummary = useMemo(() => {
    if (subTab !== "items") return [];
    const q = search.trim().toLowerCase();
    const map = {};
    filtered.forEach(e => (e.items || []).forEach(it => {
      if (q && !it.name.toLowerCase().includes(q)) return;
      const key = `${it.name.trim().toLowerCase()}|${String(it.unit || "").trim().toLowerCase()}`;
      const g = (map[key] ||= { key, name: it.name.trim(), unit: it.unit || "", qty: 0, amount: 0, lines: [] });
      g.qty += Number(it.qty) || 0;
      g.amount += Number(it.amount) || 0;
      g.lines.push({ e, it });
    }));
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered, subTab, search]);

  // Vendors on the entries in this entity / project, for the filter.
  const scopeVendors = useMemo(() => {
    const byKey = new Map();
    entries.forEach(e => { const v = String(e.vendorName || "").trim(); if (v && !byKey.has(v.toLowerCase())) byKey.set(v.toLowerCase(), v); });
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  // Names used before, offered as suggestions in the item rows.
  const itemNames = useMemo(() => [...new Set(entries.flatMap(e => (e.items || []).map(it => it.name.trim())))].sort(), [entries]);

  const columns = subTab === "entries"
    ? ["Date", "Vendor", "Expense", "Amount", "Paid By", "Bill Type", "Payment", "Remarks", "Doc", "Action"]
    : ["Date", "Type", "From", "To", "Amount", "Remarks", "Doc", "Action"];

  // Date (+ Vendor on Expenses) stay pinned on the left and Attachments +
  // Action on the right; the columns between them scroll sideways.
  // The table uses a fixed layout so these widths are exact and the sticky
  // offsets line up; Remarks has no width and takes whatever is left.
  // Sticky cells lose the collapsed borders, so their lines are drawn with
  // inset shadows instead.
  const COL_W = {
    Date: 120, Vendor: 200, Expense: 280, Amount: 120, "Paid By": 160, "Bill Type": 130, Payment: 120,
    Type: 130, From: 180, To: 180, Doc: 70, Action: 150,
  };
  const tableMinW = columns.reduce((s, h) => s + (COL_W[h] || 220), 0);
  const LINE   = "shadow-[inset_-1px_0_0_#e2e8f0]";
  const EDGE_L = "shadow-[inset_-1px_0_0_#e2e8f0,6px_0_8px_-6px_rgba(15,23,42,0.25)]";
  const EDGE_R = "shadow-[inset_1px_0_0_#e2e8f0,inset_-1px_0_0_#e2e8f0,-6px_0_8px_-6px_rgba(15,23,42,0.25)]";
  const pinCls = (h) => ({
    Date:   `sticky left-0 ${subTab === "entries" ? LINE : EDGE_L}`,
    Vendor: `sticky left-[120px] ${EDGE_L}`,
    Doc:    `sticky right-[150px] ${EDGE_R}`,
    Action: "sticky right-0",
  })[h] || "";
  const pinTd = (h) => `${pinCls(h)} z-[5] bg-white group-hover:bg-slate-50`;

  // One pager shared by all three tabs (switching tabs resets to page 1).
  const listTotal = subTab === "people" ? balances.list.length : subTab === "items" ? itemSummary.length : filtered.length;
  const pageCount = Math.max(1, Math.ceil(listTotal / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
  const peopleRows = balances.list.slice((page - 1) * perPage, page * perPage);
  const itemPageRows = itemSummary.slice((page - 1) * perPage, page * perPage);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  // ── Form ────────────────────────────────────────────────────────────────
  // New entries go to the header's project; with "All projects" and only
  // one project, that one.
  const defaultProjectId = scope.project?.id || (scope.projects.length === 1 ? scope.projects[0].id : "");
  const projectName = (id) => scope.projects.find(p => p.id === id)?.name || "";

  const openAdd = (entryType) => {
    setForm(emptyForm(entryType, defaultProjectId));
    setDocs(emptyDocs());
    setVoucher(null);
    setEditOriginal(null);
    setAddMenuOpen(false);
    setFormOpen(true);
  };
  const openEdit = (e) => {
    setForm({
      entryType: e.entryType, entryDate: String(e.entryDate || "").slice(0, 10), amount: String(e.amount),
      personId: e.personId || "", fromPersonId: e.fromPersonId || "",
      particular: e.particular, vendorName: e.vendorName || "", category: e.category, proofType: e.proofType, paymentMode: e.paymentMode,
      projectId: e.orgProjectId || "", location: e.location, remarks: e.remarks,
      items: (e.items || []).map(it => ({
        name: it.name, qty: String(it.qty), unit: it.unit || "", rate: it.rate ? String(it.rate) : "", amount: String(it.amount),
      })),
    });
    setDocs(Object.fromEntries(DOC_SECTIONS.map(s => [s.key, (e.documents?.[s.key] || []).map(url => ({ url, keepPath: url }))])));
    setVoucher(e.voucherNo ? { voucherNo: e.voucherNo, data: null, dirty: false } : null);
    setEditOriginal(e);
    setFormOpen(true);
  };
  const closeForm = () => {
    Object.values(docs).flat().forEach(d => d.previewUrl && URL.revokeObjectURL(d.previewUrl));
    setFormOpen(false);
  };
  const set = (key) => (ev) => setForm(f => ({ ...f, [key]: ev.target.value }));

  // While there are items, the entry amount is always their total.
  const setItems = (fn) => setForm(f => {
    const items = fn(f.items);
    return { ...f, items, amount: items.length ? String(itemsTotal(items)) : f.amount };
  });
  const updateItem = (idx, key, value) => setItems(items => items.map((it, i) => {
    if (i !== idx) return it;
    const next = { ...it, [key]: value };
    if ((key === "qty" || key === "rate") && Number(next.qty) > 0 && next.rate !== "") {
      next.amount = String(round2(Number(next.qty) * Number(next.rate)));
    }
    return next;
  }));

  const addFiles = (section, files) => setDocs(prev => ({
    ...prev, [section]: [...prev[section], ...files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))],
  }));
  const removeDoc = (section, idx) => {
    if (section === "voucher" && voucher && isVoucherDoc(docs.voucher[idx], voucher.voucherNo)) {
      setVoucher({ voucherNo: "", data: null, dirty: true });
    }
    removeDocFile(section, idx);
  };
  const removeDocFile = (section, idx) => setDocs(prev => {
    if (prev[section][idx]?.previewUrl) URL.revokeObjectURL(prev[section][idx].previewUrl);
    return { ...prev, [section]: prev[section].filter((_, i) => i !== idx) };
  });

  // Opens the entry's voucher with its saved details (fetched for saved entries).
  const openVoucherEdit = async () => {
    let data = voucher?.data;
    if (!data && editOriginal) {
      try {
        const res = await api.get(`/api/petty-cash/entries/${editOriginal.id}/voucher`);
        data = res.data.voucher;
      } catch (err) { return showToast(apiError(err, "Could not load voucher"), "error"); }
    }
    if (!data) return showToast("This voucher's details weren't saved — remove it and create a new one", "error");
    setVoucher(v => ({ ...v, data }));
    setVoucherEdit(data);
    setVoucherOpen(true);
  };

  const personName = (id) => people.find(p => p.id === id)?.name || "";
  const entryLabel = (f) =>
    f.entryType === "expense" ? f.particular || "Expense"
    : f.entryType === "received" ? `Received from Accounts — ${personName(f.personId)}`
    : `${personName(f.fromPersonId)} → ${personName(f.personId)}`;

  const LOG_FIELDS = {
    entryType: "Type", entryDate: "Date", amount: "Amount", personId: "Person", fromPersonId: "Given By",
    particular: "Expense", vendorName: "Vendor", category: "Category", proofType: "Bill Type", paymentMode: "Payment Mode",
    projectId: "Project", location: "Location", remarks: "Remarks", items: "Items",
  };
  const displayValue = (key, value) => {
    if (key === "personId" || key === "fromPersonId") return personName(value);
    if (key === "entryType") return labelOf(ENTRY_TYPES, value);
    if (key === "proofType") return labelOf(PROOF_TYPES, value);
    if (key === "paymentMode") return labelOf(PAYMENT_MODES, value);
    if (key === "projectId") return projectName(value);
    if (key === "items") return (value || []).map(it => `${String(it.name).trim()} ${Number(it.qty)}${it.unit ? ` ${it.unit}` : ""} = ${Number(it.amount)}`).join(", ");
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
    if (!f.projectId) return showToast("Project is required", "error");
    const items = f.entryType === "expense" ? f.items.filter(it => !isBlankItem(it)) : [];
    for (let i = 0; i < items.length; i++) {
      if (!String(items[i].name).trim()) return showToast(`Item ${i + 1}: name is required`, "error");
      if (!(Number(items[i].qty) > 0)) return showToast(`Item ${i + 1}: quantity must be greater than 0`, "error");
      if (!(Number(items[i].amount) > 0)) return showToast(`Item ${i + 1}: amount must be greater than 0`, "error");
    }
    if (items.length && Math.abs(itemsTotal(items) - Number(f.amount)) > 0.01) return showToast("Items total must equal the amount", "error");
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
      Object.entries(f).forEach(([k, v]) => k !== "items" && fd.append(k, v ?? ""));
      fd.append("companyId", scope.company.id);
      fd.append("items", JSON.stringify(items.map(it => ({ ...it, name: String(it.name).trim(), unit: String(it.unit).trim() }))));
      if (voucher?.dirty) fd.append("voucherData", voucher.data ? JSON.stringify(voucher.data) : "");
      fd.append("createdByName", currentUser().name || "");
      // Only the sections shown for this entry type are sent, so switching an
      // expense to Received drops its Bills / Voucher / Material files.
      const sections = docSectionsFor(f.entryType);
      if (editOriginal) {
        fd.append("docKeep", JSON.stringify(Object.fromEntries(sections.map(s => [s.key, docs[s.key].filter(d => d.keepPath).map(d => d.keepPath)]))));
      }
      sections.forEach(s => docs[s.key].filter(d => d.file).forEach(d => fd.append(`doc_${s.key}`, d.file)));

      const { data } = editOriginal
        ? await api.put(`/api/petty-cash/entries/${editOriginal.id}`, fd)
        : await api.post("/api/petty-cash/entries", fd);

      if (editOriginal) {
        const changes = diff({ ...editOriginal, amount: String(editOriginal.amount), projectId: editOriginal.orgProjectId }, { ...f, items });
        logAudit("petty_cash_entry", editOriginal.id, entryLabel(f), "updated", Object.keys(changes).length ? changes : null);
      } else if (data.entry?.id) {
        logAudit("petty_cash_entry", data.entry.id, entryLabel(f), "created", {
          Type: labelOf(ENTRY_TYPES, f.entryType), Amount: f.amount, Date: f.entryDate,
        });
      }

      if (f.entryType === "expense") writeLocal(LAST_LOCATION_KEY, f.location);
      showToast(editOriginal ? "Entry updated" : "Entry added");
      closeForm();
      fetchEntries();
      fetchLocations();
      fetchVendors();
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
    const t = TEMPLATES[subTab];
    if (!t) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([t.headers, ...t.sample]);
    ws["!cols"] = t.headers.map(h => ({ wch: h === "Expense" || h === "Vendor" || h === "Category" || h === "Remarks" ? 26 : Math.max(14, h.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, "Entries");

    const notes = [[], ["How to fill"], ...[...t.notes, ...COMMON_TEMPLATE_NOTES].map(n => [n])];
    const wsOpts = XLSX.utils.aoa_to_sheet([...t.options(), ...notes]);
    wsOpts["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsOpts, "Options");
    XLSX.writeFile(wb, t.file);
  };

  const handleBulkFile = async (file) => {
    if (!file) return;
    if (!scope.project) {
      if (bulkInputRef.current) bulkInputRef.current.value = "";
      return setBulkResult({ ok: false, message: "Select a project at the top first — uploaded rows are saved under that project." });
    }
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const ws = wb.Sheets["Entries"] || wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
      const rows = raw
        .map((r, i) => ({ r, rowNumber: i + 2 }))
        .filter(({ r }) => Object.values(r).some(v => String(v).trim() !== ""))
        .map(({ r, rowNumber }) => {
          // The Expense template has no Type column — every row is an expense.
          // The Received & Given template (and older all-in-one files) do.
          const typeWord = String(r["Type"] || "").trim().toLowerCase();
          const entryType = !("Type" in r) ? "expense"
            : { expense: "expense", received: "received", given: "transfer", transfer: "transfer" }[typeWord]
              || byLabel(ENTRY_TYPES, r["Type"]);
          const from = String(r["From"] ?? r["Given By"] ?? "").trim();
          return {
            rowNumber,
            entryType,
            entryDate: parseSheetDate(r["Date"]),
            amount: r["Amount"],
            personName: r["Paid By"] ?? r["To"] ?? r["Person"],
            fromPersonName: entryType === "received" || from.toLowerCase() === "accounts" ? "" : from,
            particular: r["Expense"],
            vendorName: r["Vendor"],
            category: CATEGORIES.find(c => c.toLowerCase() === String(r["Category"] || "").trim().toLowerCase()) || String(r["Category"] || "").trim(),
            proofType: byLabel(PROOF_TYPES, r["Bill Type"]),
            paymentMode: byLabel(PAYMENT_MODES, r["Payment Mode"]),
            location: r["Location"], remarks: r["Remarks"],
          };
        });
      if (!rows.length) return showToast("The file has no rows", "error");

      const localErrors = [];
      rows.forEach(r => {
        Object.entries({ Type: r.entryType, Date: r.entryDate, "Bill Type": r.proofType, "Payment Mode": r.paymentMode })
          .forEach(([col, v]) => { if (String(v).startsWith("__invalid:")) localErrors.push(`Row ${r.rowNumber}: invalid ${col} "${String(v).slice(10)}"`); });
      });
      if (localErrors.length) return setBulkResult({ ok: false, message: "Fix these rows and upload again", details: localErrors.slice(0, 50) });

      const { data } = await api.post("/api/petty-cash/entries/bulk", {
        rows, createdByName: currentUser().name || "", companyId: scope.company.id, projectId: scope.project.id,
      });
      setBulkResult({ ok: true, message: `${data.inserted} entries imported${data.newPeople ? `, ${data.newPeople} new people added` : ""}.` });
      fetchEntries();
      fetchPeople();
      fetchLocations();
      fetchVendors();
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
      Vendor: e.vendorName,
      Amount: e.amount,
      Person: `${e.personName} (${PERSON_ROLE[e.entryType]})`,
      Project: e.project,
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
    const itemRows = filtered.flatMap(e => (e.items || []).map(it => ({
      Date: fmtDate(e.entryDate), "Paid By": e.personName, Expense: e.particular, Vendor: e.vendorName, Project: e.project,
      Item: it.name, Qty: it.qty, Unit: it.unit, Rate: it.rate, Amount: it.amount,
    })));
    if (itemRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), "Items");
    XLSX.writeFile(wb, "petty_cash_staff.xlsx");
  };

  // ── Download Docs (zip of attachments) ──────────────────────────────────
  // Signed URLs expire, so the ledger is fetched fresh and only the ids of
  // the chosen rows are taken from the current view.
  const downloadDocs = async (onlyFiltered) => {
    setDocsMenuOpen(false);
    const wanted = onlyFiltered ? new Set(filtered.map(e => e.id)) : null;
    setZipping({ done: 0, total: 0 });
    try {
      const { data } = await api.get("/api/petty-cash/entries", {
        params: { company_id: scope.company.id, project_id: scope.project?.id || undefined },
      });
      const rows = (data.entries || []).filter(e => !wanted || wanted.has(e.id));
      const safe = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 60);
      const files = rows.flatMap(e => {
        const label = e.entryType === "expense" ? e.particular : `${labelOf(ENTRY_TYPES, e.entryType)} - ${e.personName}`;
        const folder = `${String(e.entryDate || "").slice(0, 10)}_${safe(label)}_${String(e.id).slice(0, 6)}`;
        return DOC_SECTIONS.flatMap(s => (e.documents?.[s.key] || []).filter(Boolean).map((url, i) => {
          const name = decodeURIComponent(url.split("?")[0].split("/").pop() || `file_${i + 1}`);
          return { url, path: `${folder}/${s.label}/${safe(name) || `file_${i + 1}`}` };
        }));
      });
      if (!files.length) { setZipping(null); return showToast("No attachments in these entries", "error"); }

      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let done = 0, failed = 0;
      setZipping({ done, total: files.length });
      for (let i = 0; i < files.length; i += 4) {
        await Promise.all(files.slice(i, i + 4).map(async f => {
          try {
            const res = await fetch(f.url);
            if (!res.ok) throw new Error(res.status);
            zip.file(f.path, await res.blob());
          } catch { failed++; }
          setZipping({ done: ++done, total: files.length });
        }));
      }
      if (failed === files.length) throw new Error("Could not download any attachment");
      const blob = await zip.generateAsync({ type: "blob" });
      const tag = [scope.company.code || scope.company.name, scope.project?.name || "All projects", onlyFiltered ? "filtered" : "all"].map(safe).join("_");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `PettyCash_Docs_${tag}_${todayStr()}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      showToast(failed ? `Downloaded ${files.length - failed} files, ${failed} failed` : `Downloaded ${files.length} files`, failed ? "error" : "success");
    } catch (err) { showToast(apiError(err, "Download failed"), "error"); }
    setZipping(null);
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
    <div className="p-4 sm:p-6 space-y-5 md:flex-1 md:min-h-0 md:flex md:flex-col md:space-y-0 md:gap-5">
      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl text-sm font-medium shadow-lg
          ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      {/* Summary */}
      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      <div className="relative z-30 shrink-0 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200">
        <div className="flex items-center gap-6">
          {STAFF_TABS.map(t => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => { setSubTab(t.id); setTypeFilter(""); setVendorFilter(""); setPage(1); }}
                className={`-mb-px flex items-center gap-1.5 pb-3 border-b-2 text-sm font-semibold transition-colors
                  ${active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pb-2.5">
          {TAB_TYPES[subTab] && (
            <div className="relative">
              <button onClick={() => setDocsMenuOpen(o => !o)} disabled={!!zipping}
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-70">
                {zipping
                  ? <><Loader2 size={14} className="animate-spin" /> {zipping.total ? `${zipping.done}/${zipping.total}` : "Preparing…"}</>
                  : <><Download size={14} /> Download Docs <ChevronDown size={14} /></>}
              </button>
              {docsMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDocsMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 z-20 w-56 bg-white rounded-xl border border-slate-200 shadow-lg p-1">
                    <button onClick={() => downloadDocs(false)} className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                      Download all
                      <span className="block text-[11px] text-slate-400">Every entry in this entity / project</span>
                    </button>
                    <button onClick={() => downloadDocs(true)} className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                      Download filtered ({filtered.length})
                      <span className="block text-[11px] text-slate-400">Only rows matching search, person & date</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {((canBulk && TEMPLATES[subTab]) || canExport) && (
            <div className="relative">
              <button onClick={() => setMoreMenuOpen(o => !o)} className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50">
                More <ChevronDown size={14} />
              </button>
              {moreMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMoreMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 z-20 w-48 bg-white rounded-xl border border-slate-200 shadow-lg p-1">
                    {canBulk && TEMPLATES[subTab] && (
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
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden md:flex-1 md:min-h-0 md:flex md:flex-col">
        <div className="overflow-auto md:flex-1 md:min-h-0">
          <table className={GRID_TABLE}>
            <thead className="text-slate-600">
              <tr>
                {["Person", "From Accounts", "Got from Others", "Given to Others", "Expense", "Balance", "Action"].map((h, i) => (
                  <th key={h} className={`sticky top-0 z-20 bg-slate-50 px-4 py-2.5 font-semibold whitespace-nowrap ${i && h !== "Action" ? "text-right" : "text-left"}`}>{h}</th>
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
              <tfoot className="sticky bottom-0 z-20 bg-slate-50 font-bold text-slate-800">
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

      {/* Expenses / Received & Given / Item-wise */}
      {(TAB_TYPES[subTab] || subTab === "items") && (
      <div className="relative z-20 shrink-0 flex flex-wrap items-center gap-2">
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
          {subTab === "entries" && (
            <VendorFilter value={vendorFilter} vendors={scopeVendors} onChange={v => { setVendorFilter(v); setPage(1); }} />
          )}
          <FilterSelect value={personFilter} onChange={e => { setPersonFilter(e.target.value); setPage(1); }}>
            <option value="">All people</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FilterSelect>
          <DateRangeFilter dateRange={dateRange} setDateRange={v => { setDateRange(v); setPage(1); }}
            customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={v => { setCustomTo(v); setPage(1); }} />
        </div>
      </div>
      )}

      {subTab === "items" && (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden md:flex-1 md:min-h-0 md:flex md:flex-col">
        <div className="overflow-auto md:flex-1 md:min-h-0">
          <table className={GRID_TABLE}>
            <thead className="text-slate-600">
              <tr>
                {["Item", "Unit", "Total Qty", "Total Amount", "Avg Rate", "Times Bought", "Action"].map((h, i) => (
                  <th key={h} className={`sticky top-0 z-20 bg-slate-50 px-4 py-2.5 font-semibold whitespace-nowrap ${i >= 2 && h !== "Action" ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
              ) : itemSummary.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No items found — add items to an expense to see them here</td></tr>
              ) : itemPageRows.map(g => (
                <tr key={g.key} className="border-t border-slate-200 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{g.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{g.unit || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{round2(g.qty)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-rose-700">{fmtAmount(g.amount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtAmount(g.qty ? g.amount / g.qty : 0)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{g.lines.length}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => setViewItem(g)} title="View purchases" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"><Eye size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            {itemSummary.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 bg-slate-50 font-bold text-slate-800">
                <tr className="border-t border-slate-200">
                  <td className="px-4 py-2.5" colSpan={3}>Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtAmount(itemSummary.reduce((s, g) => s + g.amount, 0))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!loading && <Pagination page={page} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={itemSummary.length} />}
      </div>
      )}

      {TAB_TYPES[subTab] && (
      <>

      <div className="relative z-0 bg-white rounded-xl border border-slate-200 overflow-hidden md:flex-1 md:min-h-0 md:flex md:flex-col">

        <div className="overflow-auto md:flex-1 md:min-h-0">
          <table className={`${GRID_TABLE} table-fixed`} style={{ minWidth: tableMinW }}>
            <thead className="text-slate-600">
              <tr>
                {columns.map((h, i) => (
                  <th key={i} style={COL_W[h] ? { width: COL_W[h] } : undefined}
                    className={`sticky top-0 ${pinCls(h) ? `${pinCls(h)} z-20` : "z-10"} bg-slate-50 px-4 py-2.5 font-semibold whitespace-nowrap ${h === "Amount" ? "text-right" : h === "Doc" ? "text-center !px-2" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">No entries found</td></tr>
              ) : pageRows.map(e => (
                <tr key={e.id} className="group border-t border-slate-200 hover:bg-slate-50">
                  <td className={`${pinTd("Date")} px-4 py-2.5 whitespace-nowrap text-slate-700`}>{fmtDate(e.entryDate)}</td>
                  {subTab === "entries" ? (
                    <>
                      <td className={`${pinTd("Vendor")} px-4 py-2.5 text-slate-700 whitespace-nowrap truncate`} title={e.vendorName}>{e.vendorName || <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-2.5 text-slate-800 overflow-hidden">
                        <button type="button" onClick={() => setViewEntry(e)} title="View details"
                          className="block max-w-full truncate text-left hover:text-blue-600 hover:underline">{e.particular}</button>
                        <p className="text-[11px] text-slate-400 truncate">
                          {e.category}
                          {!scope.project && e.project && <span className="ml-1.5 text-slate-500">· {e.project}</span>}
                          {e.items?.length > 0 && <span className="ml-1.5 px-1.5 py-px rounded bg-slate-100 text-slate-600 font-medium">{e.items.length} item{e.items.length > 1 ? "s" : ""}</span>}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold truncate text-rose-700">{fmtAmount(e.amount)}</td>
                      <td className="px-4 py-2.5 truncate text-slate-700" title={e.personName}>{e.personName}</td>
                      <td className="px-4 py-2.5 truncate text-slate-600">{labelOf(PROOF_TYPES, e.proofType)}</td>
                      <td className="px-4 py-2.5 truncate text-slate-600">{labelOf(PAYMENT_MODES, e.paymentMode)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${TYPE_BADGE[e.entryType]}`}>{labelOf(ENTRY_TYPES, e.entryType)}</span>
                      </td>
                      <td className="px-4 py-2.5 truncate text-slate-700">{e.entryType === "received" ? "Accounts" : e.fromPersonName}</td>
                      <td className="px-4 py-2.5 truncate text-slate-700">{e.personName}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold truncate text-emerald-700">{fmtAmount(e.amount)}</td>
                    </>
                  )}
                  <td className="px-4 py-2.5 text-slate-500 truncate" title={e.remarks}>{e.remarks || "—"}</td>
                  <td className={`${pinTd("Doc")} px-2 py-2.5 whitespace-nowrap text-center`}>
                    {docCount(e.documents) > 0 ? (
                      <button onClick={() => setDocsEntry(e)} title="View attachments"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-blue-600 hover:bg-blue-50 font-medium">
                        <Paperclip size={13} /> {docCount(e.documents)}
                      </button>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className={`${pinTd("Action")} px-4 py-2.5`}>
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
                <Field label="Project" required wide>
                  <Select value={form.projectId} onChange={set("projectId")}>
                    <option value="">Select project ({scope.company.code || scope.company.name})</option>
                    {scope.projects.map(p => <option key={p.id} value={p.id}>{p.code ? `${p.name} (${p.code})` : p.name}</option>)}
                  </Select>
                  {scope.projects.length === 0 && <p className="mt-1 text-xs text-amber-700">This entity has no projects yet — add one under Organisation → Projects.</p>}
                </Field>
                <Field label="Date" required><input type="date" value={form.entryDate} onChange={set("entryDate")} className={inp} /></Field>
                <Field label="Amount" required>
                  {form.entryType === "expense" && form.items.length > 0 ? (
                    <input readOnly value={form.amount} title="Total of the items below" className={`${inp} bg-slate-50 font-semibold`} />
                  ) : (
                    <input type="number" min="0" step="0.01" value={form.amount} onChange={set("amount")} placeholder="0.00" className={inp} />
                  )}
                </Field>

                {form.entryType === "expense" && (
                  <>
                    <Field label="Expense" required wide><input value={form.particular} onChange={set("particular")} placeholder="e.g. Food charge (Zomato)" className={inp} /></Field>
                    <Field label="Vendor Name" wide><VendorInput value={form.vendorName} onChange={v => setForm(f => ({ ...f, vendorName: v }))} vendors={vendors} /></Field>
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
                    <Field label="Location">
                      <input list="petty-cash-locations" value={form.location} onChange={set("location")} placeholder="Type or pick" className={inp} />
                      <datalist id="petty-cash-locations">{locations.map(l => <option key={l} value={l} />)}</datalist>
                    </Field>
                    <Field label="Items (optional)" wide>
                      <ItemsEditor items={form.items} itemNames={itemNames} onChange={updateItem}
                        onAdd={() => setItems(items => [...items, emptyItem()])}
                        onRemove={(idx) => setItems(items => items.filter((_, i) => i !== idx))} />
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
                  <div className={`grid gap-3 ${docSectionsFor(form.entryType).length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                    {docSectionsFor(form.entryType).map(s => (
                      <div key={s.key} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[13px] font-semibold text-slate-700">{s.label}</p>
                          <div className="flex items-center gap-3">
                            {s.key === "voucher" && (
                              <button type="button" onClick={() => setVoucherOpen(true)} className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline">
                                <FilePlus2 size={13} /> Create Voucher
                              </button>
                            )}
                            <label className="flex items-center gap-1 text-xs font-medium text-blue-600 cursor-pointer hover:underline">
                              <UploadCloud size={13} /> Upload
                              <input type="file" multiple accept="image/*,application/pdf" className="hidden"
                                onChange={e => { addFiles(s.key, Array.from(e.target.files || [])); e.target.value = ""; }} />
                            </label>
                          </div>
                        </div>
                        {docs[s.key].length === 0 ? (
                          <p className="text-xs text-slate-400">No files</p>
                        ) : (
                          <div className="space-y-1">
                            {docs[s.key].map((d, i) => (
                              <div key={i} className="flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-slate-50 text-xs">
                                <a href={d.previewUrl || d.url} target="_blank" rel="noreferrer" className="truncate text-blue-600 hover:underline">
                                  {d.file ? d.file.name : `${s.label} ${i + 1}`}
                                </a>
                                <div className="flex items-center gap-1 shrink-0">
                                  {s.key === "voucher" && voucher && isVoucherDoc(d, voucher.voucherNo) && (
                                    <button type="button" onClick={openVoucherEdit} title="Edit voucher" className="flex items-center gap-0.5 px-1 text-emerald-700 hover:underline font-medium">
                                      <Pencil size={11} /> Edit
                                    </button>
                                  )}
                                  <button type="button" onClick={() => removeDoc(s.key, i)} className="p-0.5 text-slate-400 hover:text-red-600"><X size={13} /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
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

      {voucherOpen && formOpen && (
        <VoucherModal
          entry={form}
          company={scope.company}
          project={scope.projects.find(p => p.id === form.projectId) || null}
          initial={voucherEdit}
          onClose={() => { setVoucherOpen(false); setVoucherEdit(null); }}
          onDone={(file, total, details) => {
            if (voucherEdit) {
              // Swap the old voucher PDF for the edited one.
              setDocs(prev => {
                const idx = prev.voucher.findIndex(d => isVoucherDoc(d, voucherEdit.voucherNo));
                if (idx >= 0 && prev.voucher[idx].previewUrl) URL.revokeObjectURL(prev.voucher[idx].previewUrl);
                const next = { file, previewUrl: URL.createObjectURL(file), voucherNo: details.voucherNo };
                return { ...prev, voucher: idx >= 0 ? prev.voucher.map((d, i) => (i === idx ? next : d)) : [...prev.voucher, next] };
              });
              setVoucher({ voucherNo: details.voucherNo, data: details, dirty: true });
              setVoucherEdit(null);
              setVoucherOpen(false);
              showToast("Voucher updated — click Update to save");
              return;
            }
            setDocs(prev => ({ ...prev, voucher: [...prev.voucher, { file, previewUrl: URL.createObjectURL(file), voucherNo: details.voucherNo }] }));
            setVoucher({ voucherNo: details.voucherNo, data: details, dirty: true });
            setForm(f => ({
              ...f,
              proofType: f.proofType || "voucher",
              amount: Number(f.amount) > 0 ? f.amount : String(total),
            }));
            setVoucherOpen(false);
            showToast("Voucher added to attachments");
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

      {viewItem && (
        <ItemHistory item={viewItem} onViewEntry={setViewEntry} onClose={() => setViewItem(null)} />
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
            <div className="px-6 py-4">
              <DocSectionsList documents={docsEntry.documents} />
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

const emptyDocs = () => Object.fromEntries(DOC_SECTIONS.map(s => [s.key, []]));

// Saved attachments grouped by section; empty sections are skipped.
function DocSectionsList({ documents }) {
  const filled = DOC_SECTIONS.filter(s => documents?.[s.key]?.length);
  if (!filled.length) return <p className="text-sm text-slate-400">No attachments</p>;
  return (
    <div className="space-y-3">
      {filled.map(s => (
        <div key={s.key}>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{s.label}</p>
          <div className="space-y-1">
            {documents[s.key].map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 text-sm text-blue-600 hover:bg-slate-100">
                <Paperclip size={13} /> {s.label} {i + 1}
              </a>
            ))}
          </div>
        </div>
      ))}
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
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate)
        || String(a.createdAt).localeCompare(String(b.createdAt))
        || String(a.id).localeCompare(String(b.id)));
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

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const fileExt = (url) => String(url || "").split("?")[0];

// Entry details as a panel sliding in from the right.
function EntryDetails({ entry: e, canEdit, onEdit, onClose }) {
  useEffect(() => {
    const onKey = (ev) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isExpense = e.entryType === "expense";
  const title = isExpense ? e.particular
    : e.entryType === "received" ? "Received from Accounts"
    : `${e.fromPersonName} → ${e.personName}`;

  const facts = isExpense ? [
    { icon: User,        label: "Paid By",   value: e.personName },
    { icon: Store,       label: "Vendor",    value: e.vendorName },
    { icon: Tag,         label: "Category",  value: e.category },
    { icon: Receipt,     label: "Bill Type", value: e.proofType && `${labelOf(PROOF_TYPES, e.proofType)}`, sub: e.proofType && taxLabel(e.proofType) },
    { icon: CreditCard,  label: "Payment",   value: labelOf(PAYMENT_MODES, e.paymentMode) },
    { icon: Briefcase,   label: "Project",   value: e.project },
    { icon: MapPin,      label: "Location",  value: e.location },
  ] : e.entryType === "received" ? [
    { icon: ArrowLeftRight, label: "From",        value: "Accounts" },
    { icon: User,           label: "Received By", value: e.personName },
  ] : [
    { icon: User, label: "Given By", value: e.fromPersonName },
    { icon: User, label: "Given To", value: e.personName },
  ];

  const docSections = DOC_SECTIONS.filter(s => e.documents?.[s.key]?.length);
  const card = "rounded-xl border border-slate-200 bg-white";
  const heading = "text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5";

  return (
    <div className="fixed inset-0 z-[55]">
      <style>{`@keyframes pcSlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}@keyframes pcFade{from{opacity:0}to{opacity:1}}`}</style>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" style={{ animation: "pcFade .2s ease-out" }} onClick={onClose} />

      <aside className="absolute right-0 top-0 h-full w-full sm:w-[620px] lg:w-[720px] bg-slate-50 shadow-2xl flex flex-col"
        style={{ animation: "pcSlideIn .25s cubic-bezier(.2,.8,.2,1)" }}>
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 pt-5 pb-5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${TYPE_BADGE[e.entryType]}`}>{labelOf(ENTRY_TYPES, e.entryType)}</span>
              <span className="flex items-center gap-1 text-xs text-slate-500"><CalendarDays size={13} /> {fmtDate(e.entryDate)}</span>
            </div>
            <button onClick={onClose} title="Close (Esc)" className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
          </div>
          <h2 className="mt-3 text-lg font-bold text-slate-900 leading-snug break-words">{title || "—"}</h2>
          <p className={`mt-1 text-3xl font-extrabold tabular-nums ${isExpense ? "text-rose-700" : "text-emerald-700"}`}>₹ {fmtAmount(e.amount)}</p>
          {e.items?.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">{e.items.length} item{e.items.length > 1 ? "s" : ""}</p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-4">
          <div className={`${card} grid grid-cols-2 gap-px bg-slate-100 overflow-hidden`}>
            {facts.map(f => (
              <div key={f.label} className="bg-white px-4 py-3 min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide"><f.icon size={12} /> {f.label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 break-words">{f.value || "—"}</p>
                {f.sub && <p className="text-[11px] text-slate-500">{f.sub}</p>}
              </div>
            ))}
          </div>

          {e.items?.length > 0 && (
            <div>
              <p className={heading}>Items</p>
              <div className={`${card} overflow-hidden`}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                    <tr>
                      {["Item", "Qty", "Rate", "Amount"].map((h, i) => <th key={h} className={`px-3 py-2 font-semibold ${i ? "text-right" : "text-left"}`}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {e.items.map((it, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800 font-medium break-words">{it.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-slate-600">{it.qty}{it.unit ? ` ${it.unit}` : ""}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{it.rate ? fmtAmount(it.rate) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{fmtAmount(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-bold">
                      <td className="px-3 py-2" colSpan={3}>Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtAmount(e.amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {e.remarks && (
            <div>
              <p className={heading}>Remarks</p>
              <div className={`${card} px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap break-words`}>{e.remarks}</div>
            </div>
          )}

          <div>
            <p className={heading}>Attachments</p>
            {docSections.length === 0 ? (
              <div className={`${card} px-4 py-6 text-center text-sm text-slate-400`}>No attachments</div>
            ) : (
              <div className="space-y-3">
                {docSections.map(s => (
                  <div key={s.key} className={`${card} p-3`}>
                    <p className="text-xs font-semibold text-slate-700 mb-2">{s.label} <span className="text-slate-400 font-normal">· {e.documents[s.key].length}</span></p>
                    <div className="grid grid-cols-3 gap-2">
                      {e.documents[s.key].map((url, i) => {
                        const isImage = IMAGE_EXT.test(fileExt(url));
                        return (
                          <a key={i} href={url} target="_blank" rel="noreferrer" title={`Open ${s.label} ${i + 1}`}
                            className="group relative aspect-[4/3] rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center hover:border-blue-400 hover:shadow-sm transition">
                            {isImage ? (
                              <img src={url} alt={`${s.label} ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex flex-col items-center gap-1 text-slate-500 group-hover:text-blue-600">
                                <FileText size={22} />
                                <span className="text-[10px] font-semibold uppercase">PDF</span>
                              </div>
                            )}
                            <span className="absolute bottom-0 inset-x-0 bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 truncate">{s.label} {i + 1}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1 px-1 pt-1 text-[11px] text-slate-500">
            <p>Added by <b className="text-slate-700">{e.createdByName || "—"}</b>{e.createdAt ? ` · ${fmtStamp(e.createdAt)}` : ""}</p>
            {e.updatedAt && <p>Last updated · {fmtStamp(e.updatedAt)}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-white shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Close</button>
          {canEdit && (
            <button onClick={onEdit} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 flex items-center gap-1.5">
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

// Item rows inside the Add/Edit form. Amount fills from Qty x Rate but can
// be typed over (e.g. when the bill rounds off).
function ItemsEditor({ items, itemNames, onChange, onAdd, onRemove }) {
  const cell = "w-full h-9 border border-slate-300 rounded-md px-2 text-sm outline-none bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-500";
  const cols = "grid grid-cols-[minmax(140px,1fr)_70px_80px_80px_90px_28px] gap-2 items-center";
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 mb-2">Add items to record what was bought — the amount becomes their total.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[520px] space-y-2 mb-2">
            <div className={`${cols} text-[11px] font-semibold text-slate-500 uppercase tracking-wide`}>
              <span>Item</span><span className="text-right">Qty</span><span>Unit</span><span className="text-right">Rate</span><span className="text-right">Amount</span><span />
            </div>
            {items.map((it, i) => (
              <div key={i} className={cols}>
                <input list="petty-cash-item-names" value={it.name} onChange={e => onChange(i, "name", e.target.value)} placeholder="e.g. Cement" className={cell} />
                <input type="number" min="0" step="any" value={it.qty} onChange={e => onChange(i, "qty", e.target.value)} className={`${cell} text-right`} />
                <input list="petty-cash-units" value={it.unit} onChange={e => onChange(i, "unit", e.target.value)} placeholder="nos" className={cell} />
                <input type="number" min="0" step="0.01" value={it.rate} onChange={e => onChange(i, "rate", e.target.value)} className={`${cell} text-right`} />
                <input type="number" min="0" step="0.01" value={it.amount} onChange={e => onChange(i, "amount", e.target.value)} className={`${cell} text-right`} />
                <button type="button" onClick={() => onRemove(i)} title="Remove item" className="p-1 text-slate-400 hover:text-red-600"><X size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <datalist id="petty-cash-item-names">{itemNames.map(n => <option key={n} value={n} />)}</datalist>
      <datalist id="petty-cash-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onAdd} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
          <Plus size={13} /> Add Item
        </button>
        {items.length > 0 && <p className="text-sm text-slate-600">Total <b className="tabular-nums text-slate-900">₹ {fmtAmount(itemsTotal(items))}</b></p>}
      </div>
    </div>
  );
}

// Every purchase of one item (an itemSummary row).
function ItemHistory({ item, onViewEntry, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">{item.name}{item.unit ? ` (${item.unit})` : ""}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Total <b className="tabular-nums text-slate-800">{round2(item.qty)}{item.unit ? ` ${item.unit}` : ""}</b> for <b className="tabular-nums text-rose-700">₹ {fmtAmount(item.amount)}</b>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="overflow-auto">
          <table className={GRID_TABLE}>
            <thead className="bg-slate-50 text-slate-600 sticky top-0">
              <tr>
                {["Date", "Expense", "Paid By", "Project", "Qty", "Rate", "Amount", ""].map((h, i) => (
                  <th key={i} className={`px-4 py-2.5 font-semibold whitespace-nowrap ${["Qty", "Rate", "Amount"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.lines.map(({ e, it }, i) => (
                <tr key={`${e.id}-${i}`} className="border-t border-slate-200">
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{fmtDate(e.entryDate)}</td>
                  <td className="px-4 py-2.5 text-slate-700 max-w-[200px] truncate" title={e.particular}>{e.particular}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{e.personName}</td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-[160px] truncate">{e.project || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{it.qty}{it.unit ? ` ${it.unit}` : ""}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{it.rate ? fmtAmount(it.rate) : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmtAmount(it.amount)}</td>
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
