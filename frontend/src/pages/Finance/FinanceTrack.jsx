import React, { useState, useEffect, useRef, useMemo } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { Plus, Search, Pencil, Trash2, X, Wallet, FileText, Eye, Download, FileSpreadsheet, Paperclip, ChevronDown, ArrowDownCircle, ArrowUpCircle, ArrowLeft } from "lucide-react";
import * as XLSX from "xlsx";
import DateRangeFilter from "../../components/DateRangeFilter";
import ProjectSelect from "../../components/ProjectSelect";
import EntitySelect from "../../components/EntitySelect";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 10;

const emptyForm = {
  entryType: "payment",
  entryDate: "", siteId: "", siteName: "", companyId: "", companyName: "",
  partyId: "", partyName: "", description: "", amount: "",
  accountNoTo: "", accountNoFrom: "", accountHolderName: "", remarks: "",
};

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{label}</label>
    {children}
  </div>
);
const inp = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700";

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

// Labels flip between Payment (money going out) and Receipt (money coming in) —
// same underlying fields, different meaning depending on direction.
const LABELS = {
  payment: {
    party: "Vendor Name", description: "Expense Info",
    to: "Paid To — Account Number", from: "Paid From — Account Number",
    holder: "Paid From — Account Holder Name",
  },
  receipt: {
    party: "Received From", description: "Received For",
    to: "Received In — Account Number", from: "Received From — Account Number",
    holder: "Received From — Account Holder Name",
  },
};

export default function FinanceTrack() {
  const { canAdd, canEdit, canDelete, canExport } = useModulePermissions("master_data_finance");

  const [sites, setSites]         = useState([]);
  const [companies, setCompanies] = useState([]);
  const [vendors, setVendors]     = useState([]);
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(true);

  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [siteFilter, setSiteFilter]       = useState([]);
  const [companyFilter, setCompanyFilter] = useState([]);
  const [partyFilter, setPartyFilter]     = useState([]);
  const [dateRange, setDateRange]   = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const [page, setPage]             = useState(1);

  const [view, setView]           = useState("list"); // "list" | "form"
  const [form, setForm]           = useState(emptyForm);
  const [docs, setDocs]           = useState([]); // { file } new | { url, keepPath } existing
  const [editId, setEditId]       = useState(null);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [viewEntry, setViewEntry] = useState(null);
  const [docsEntry, setDocsEntry] = useState(null);
  const fileRef = useRef();
  const remarksRef = useRef();

  // Pre-filled Remarks (edit) should start already grown to fit its content,
  // not just expand once the user types.
  useEffect(() => {
    if (view !== "form" || !remarksRef.current) return;
    remarksRef.current.style.height = "auto";
    remarksRef.current.style.height = `${remarksRef.current.scrollHeight}px`;
  }, [view, editId]);

  useEffect(() => {
    fetch(`${API}/api/projects`).then(r => r.json()).then(d => setSites(d.projects || [])).catch(() => {});
    fetch(`${API}/api/procurement/companies`).then(r => r.json()).then(d => setCompanies(d.companies || [])).catch(() => {});
    fetch(`${API}/api/procurement/vendors`).then(r => r.json()).then(d => setVendors(d.vendors || [])).catch(() => {});
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/finance/track`);
      const data = await res.json();
      setEntries(data.entries || []);
    } catch { setEntries([]); }
    setLoading(false);
  };
  useEffect(() => { fetchEntries(); }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openAdd = () => {
    setForm({ ...emptyForm, entryDate: new Date().toISOString().slice(0, 10) });
    setDocs([]);
    setEditId(null);
    setView("form");
  };
  const openEdit = (e) => {
    // partyId isn't stored server-side (only the name is) — best-effort match
    // it back to a vendor so the picker shows the right row pre-selected.
    const matchedVendor = vendors.find(v => v.vendorName === e.partyName);
    setForm({
      entryType: e.entryType, entryDate: e.entryDate ? String(e.entryDate).slice(0, 10) : "",
      siteId: e.siteId || "", siteName: e.siteName || "", companyId: e.companyId || "", companyName: e.companyName || "",
      partyId: matchedVendor?.id || "", partyName: e.partyName || "", description: e.description || "", amount: e.amount || "",
      accountNoTo: e.accountNoTo || "", accountNoFrom: e.accountNoFrom || "", accountHolderName: e.accountHolderName || "",
      remarks: e.remarks || "",
    });
    setDocs((e.documentUrls || []).map(url => ({ url, keepPath: url })));
    setEditId(e.id);
    setView("form");
  };

  const addFiles = (files) => setDocs(prev => [...prev, ...files.map(file => ({ file }))]);
  const removeDoc = (idx) => setDocs(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!form.entryDate) return showToast("Date is required", "error");
    if (!Number(form.amount) || Number(form.amount) <= 0) return showToast("Amount must be greater than 0", "error");

    setSaving(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const token = localStorage.getItem("bms_token") || "";
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ""));
      fd.append("createdByName", u.name || "");
      if (editId) fd.append("documentKeep", JSON.stringify(docs.filter(d => d.keepPath).map(d => d.keepPath)));
      docs.filter(d => d.file).forEach(d => fd.append("document", d.file));

      const url    = editId ? `${API}/api/finance/track/${editId}` : `${API}/api/finance/track`;
      const method = editId ? "PUT" : "POST";
      const res  = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Save failed"); }
      showToast(editId ? "Entry updated" : "Entry added");
      setView("list");
      fetchEntries();
    } catch (err) { showToast(err.message || "Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this entry?")) return;
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const token = localStorage.getItem("bms_token") || "";
      await fetch(`${API}/api/finance/track/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deletedByName: u.name || "" }),
      });
      showToast("Entry deleted");
      fetchEntries();
    } catch { showToast("Failed to delete", "error"); }
  };

  // Filter dropdowns only ever list values that actually appear in the loaded
  // entries — empty until there's data, unlike the Add form's Site/Company
  // selects which always show every project/company.
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
    const matchesSearch = !s || [e.partyName, e.description, e.siteName, e.companyName, e.accountNoTo, e.accountNoFrom, e.accountHolderName, e.remarks]
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
  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const exportExcel = () => {
    const data = filtered.map((e, i) => ({
      "S.No": i + 1, "Type": e.entryType === "payment" ? "Payment" : "Receipt", "Date": fmtDate(e.entryDate),
      "Site": e.siteName, "Company": e.companyName, "Party": e.partyName, "Description": e.description,
      "Amount": e.amount, "To Account No": e.accountNoTo, "From Account No": e.accountNoFrom,
      "Account Holder": e.accountHolderName, "Remarks": e.remarks,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Finance Track");
    XLSX.writeFile(wb, "finance_track.xlsx");
  };

  const L = LABELS[form.entryType];

  if (view === "form") {
    return (
      <>
        {toast && (
          <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg
            ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
            {toast.msg}
          </div>
        )}
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200">
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

        <div className="px-4 sm:px-6 py-5 space-y-5 pb-28 w-full max-w-6xl mx-auto">
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
              <Field label="Date">
                <input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} className={inp} />
              </Field>
              <Field label="Amount">
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inp} placeholder="0" />
              </Field>
              <ProjectSelect
                label="Select Site" variant="order"
                value={form.siteId}
                onChange={e => { const s = sites.find(x => x.id === e.target.value); setForm(f => ({ ...f, siteId: e.target.value, siteName: s?.projectName || s?.project_name || "" })); }}
                options={sites}
                placeholder="Select site…"
              />
              <EntitySelect
                label="Select Company"
                value={form.companyId}
                onChange={e => { const c = companies.find(x => x.id === e.target.value); setForm(f => ({ ...f, companyId: e.target.value, companyName: c?.companyName || "" })); }}
                options={companies} valueKey="id" labelKey="companyName" subLabelKey="companyCode"
                placeholder="Select company…"
              />
              <EntitySelect
                label={L.party}
                value={form.partyId}
                onChange={e => { const v = vendors.find(x => x.id === e.target.value); setForm(f => ({ ...f, partyId: e.target.value, partyName: v?.vendorName || "" })); }}
                options={vendors} valueKey="id" labelKey="vendorName" subLabelKey="address"
                placeholder="Select vendor…"
              />
              <Field label={L.description}>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inp} />
              </Field>
              <Field label={L.to}>
                <input value={form.accountNoTo} onChange={e => setForm(f => ({ ...f, accountNoTo: e.target.value }))} className={inp} />
              </Field>
              <Field label={L.from}>
                <input value={form.accountNoFrom} onChange={e => setForm(f => ({ ...f, accountNoFrom: e.target.value }))} className={inp} />
              </Field>
              <Field label={L.holder}>
                <input value={form.accountHolderName} onChange={e => setForm(f => ({ ...f, accountHolderName: e.target.value }))} className={inp} />
              </Field>
              <div className="sm:col-span-2 xl:col-span-3">
                <Field label="Remarks">
                  <textarea
                    ref={remarksRef}
                    value={form.remarks}
                    onChange={e => { setForm(f => ({ ...f, remarks: e.target.value })); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
                    className={`${inp} resize-none overflow-hidden`}
                    rows={1}
                    placeholder="Optional notes"
                  />
                </Field>
              </div>
            </div>
          </div>

          <Field label="Attachments">
            <div onClick={() => fileRef.current.click()}
              className="flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-all border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 max-w-md">
              <FileText size={15} className="text-slate-300" />
              <span className="text-xs truncate text-slate-400">Click to upload documents (PDF/JPG/PNG)</span>
            </div>
            <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden"
              onChange={e => { const files = Array.from(e.target.files); e.target.value = ""; if (files.length) addFiles(files); }} />
            {docs.length > 0 && (
              <div className="mt-2 space-y-1.5 max-w-md">
                {docs.map((d, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-600 hover:underline truncate">Attachment {idx + 1}</a>
                    ) : (
                      <span className="text-xs font-medium text-slate-700 truncate">{d.file.name}</span>
                    )}
                    <button type="button" onClick={() => removeDoc(idx)} className="p-1 text-slate-400 hover:text-red-500 shrink-0"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </Field>
        </div>

        <div className="sticky bottom-0 z-20 bg-white border-t border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-end gap-2">
          <button onClick={() => setView("list")}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
            {saving ? "Saving…" : editId ? "Update Detail" : "Add Detail"}
          </button>
        </div>
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

      <div className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-white border-b border-slate-200">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Wallet size={16} className="text-blue-600" />
              </div>
              <h1 className="text-[15px] font-bold text-slate-800 whitespace-nowrap">Finance</h1>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit shrink-0">
              <span className="px-4 py-1.5 rounded-md text-sm font-semibold bg-white text-slate-800 shadow-sm">Track</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canExport && (
              <button onClick={exportExcel}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
                <FileSpreadsheet size={14} className="text-green-600" /> Export
              </button>
            )}
            {canAdd && (
              <button onClick={openAdd}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all">
                <Plus size={15} /> Add Detail
              </button>
            )}
          </div>
        </div>

        <div className="px-5 sm:px-6 py-3 space-y-3">
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
              <MultiFilter label="Entity" options={filterOptions.companies} selected={companyFilter} onChange={v => { setCompanyFilter(v); setPage(1); }} />
              <MultiFilter label="Vendor" options={filterOptions.parties} selected={partyFilter} onChange={v => { setPartyFilter(v); setPage(1); }} />
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-600">
              {filtered.length} entr{filtered.length !== 1 ? "ies" : "y"}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold">Total Paid {fmtINR(totalPaid)}</span>
            <span className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Total Received {fmtINR(totalReceived)}</span>
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-4 lg:px-6 pt-4 pb-32 w-full">
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-100 p-16 flex items-center justify-center">
            <p className="text-slate-300 font-bold uppercase tracking-widest text-xs">No entries recorded yet</p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  {["Type", "Date", "Site", "Company", "Party", "Description", "Amount", "To Account", "From Account", "Holder", "Docs", "Action"].map(c => (
                    <th key={c} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3 border border-slate-200 whitespace-nowrap">
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
                    <td className="px-3 py-3 text-sm font-semibold text-slate-800 border border-slate-200 text-right whitespace-nowrap">{fmtINR(e.amount)}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{e.accountNoTo || "—"}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{e.accountNoFrom || "—"}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{e.accountHolderName || "—"}</td>
                    <td className="px-3 py-3 border border-slate-200 text-center">
                      {e.documentUrls?.length ? (
                        <button onClick={() => setDocsEntry(e)}
                          className="inline-flex items-center gap-1 text-indigo-500 text-xs font-semibold hover:text-indigo-700 hover:underline">
                          <Paperclip size={12} /> {e.documentUrls.length}
                        </button>
                      ) : <span className="text-slate-300"><Paperclip size={13} className="inline" /></span>}
                    </td>
                    <td className="px-3 py-3 border border-slate-200">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setViewEntry(e)} className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-all"><Eye size={14} /></button>
                        {canEdit && <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all"><Pencil size={14} /></button>}
                        {canDelete && <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs text-slate-400">{filtered.length} entr{filtered.length !== 1 ? "ies" : "y"} · Page {page} of {totalPages}</p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all">‹</button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let n;
                      if (totalPages <= 5) n = i + 1;
                      else if (page <= 3) n = i + 1;
                      else if (page >= totalPages - 2) n = totalPages - 4 + i;
                      else n = page - 2 + i;
                      return (
                        <button key={n} onClick={() => setPage(n)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${page === n ? "bg-slate-900 text-white border-slate-900" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                          {n}
                        </button>
                      );
                    })}
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all">›</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* View modal */}
        {viewEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col">
              <div className="bg-linear-to-r from-slate-800 to-slate-700 px-6 py-5 relative shrink-0">
                <button onClick={() => setViewEntry(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">{viewEntry.entryType === "payment" ? "Payment" : "Receipt"} · {fmtDate(viewEntry.entryDate)}</p>
                <h2 className="text-lg font-bold text-white leading-tight">{viewEntry.partyName || "—"}</h2>
                <p className="text-sm text-slate-300 mt-1">{fmtINR(viewEntry.amount)}</p>
              </div>
              <div className="px-6 py-5 space-y-2.5 text-sm overflow-y-auto">
                <div className="flex justify-between"><span className="text-slate-400">Site</span><span className="text-slate-700 font-medium">{viewEntry.siteName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Company</span><span className="text-slate-700 font-medium">{viewEntry.companyName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">{LABELS[viewEntry.entryType].description}</span><span className="text-slate-700 font-medium">{viewEntry.description || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">{LABELS[viewEntry.entryType].to}</span><span className="text-slate-700 font-medium">{viewEntry.accountNoTo || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">{LABELS[viewEntry.entryType].from}</span><span className="text-slate-700 font-medium">{viewEntry.accountNoFrom || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">{LABELS[viewEntry.entryType].holder}</span><span className="text-slate-700 font-medium">{viewEntry.accountHolderName || "—"}</span></div>
                {viewEntry.remarks && <div className="pt-2 border-t border-slate-100"><span className="text-slate-400">Remarks</span><p className="text-slate-700 mt-1">{viewEntry.remarks}</p></div>}
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

        {/* Docs list popup */}
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

      </div>
    </>
  );
}

// Multi-select dropdown filter — options list only ever contains values that
// actually appear in the loaded table data (see filterOptions above), so it
// starts empty and fills in as entries get added.
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

  const filtered = query
    ? options.filter(o => String(o).toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-xs font-bold shadow-sm transition ${selected.length ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
      >
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-black text-white">{selected.length}</span>
        )}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-md border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 p-2">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2">
              <Search size={13} className="text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-slate-400">No options</p>
            ) : (
              filtered.map(opt => {
                const checked = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggle(opt)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
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
