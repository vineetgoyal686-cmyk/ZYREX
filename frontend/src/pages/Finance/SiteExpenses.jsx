import React, { useState, useEffect, useMemo } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { Plus, Search, Pencil, Trash2, X, Receipt, FileText, Eye, Download, FileSpreadsheet, Paperclip, ChevronDown, ArrowLeft } from "lucide-react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 10;

const CATEGORIES     = ["Material", "Service", "Rent", "Fuel", "Transport", "Misc"];
const BILL_STATUSES  = ["Pending", "Verified", "On Hold", "Rejected"];

const CHARGE_TYPES = [
  { key: "labour",       label: "Labour Charge" },
  { key: "freight",      label: "Freight Charge" },
  { key: "transport",    label: "Transport Charge" },
  { key: "installation", label: "Installation Charge" },
];

const emptyForm = {
  vendorId: "", vendorName: "", companyId: "",
  orderId: "", orderNumber: "",
  invoiceNumber: "", invoiceDate: "", category: "",
  billStatus: "Pending",
  documents: [], ewayBillDocs: [], otherDocs: [],
  discountMode: "none", discountPct: "",
  labourEnabled: false, labourCharge: "",
  freightEnabled: false, freightCharge: "",
  transportEnabled: false, transportCharge: "",
  installationEnabled: false, installationCharge: "",
  chargesBeforeGst: true,
  gstType: "intra", gstMode: "none", gstPct: "",
};
const emptyItem = () => ({ inNo: "", itemName: "", unit: "", qty: "", basicRate: "", remarks: "" });

const computeItemAmount = (it) => (Number(it.qty) || 0) * (Number(it.basicRate) || 0);

// Mirrors the backend's computeSummary — live preview while typing.
// Subtotal -> Discount -> (charges in/out of taxable base) -> GST -> Grand Total.
const computeSummary = (subtotal, f) => {
  const discountPct = f.discountMode === "total" ? (Number(f.discountPct) || 0) : 0;
  const discountAmount = subtotal * discountPct / 100;
  const afterDiscount = subtotal - discountAmount;

  const charges = CHARGE_TYPES.map(c => ({
    ...c,
    enabled: !!f[`${c.key}Enabled`],
    amount: f[`${c.key}Enabled`] ? (Number(f[`${c.key}Charge`]) || 0) : 0,
  }));
  const chargesTotal = charges.reduce((sum, c) => sum + c.amount, 0);

  const taxableAmount = f.chargesBeforeGst ? afterDiscount + chargesTotal : afterDiscount;
  const gstPct = f.gstMode === "total" ? (Number(f.gstPct) || 0) : 0;
  const gstAmount = taxableAmount * gstPct / 100;

  const grandTotal = f.chargesBeforeGst
    ? afterDiscount + chargesTotal + gstAmount
    : afterDiscount + gstAmount + chargesTotal;

  return { discountAmount, afterDiscount, charges, chargesTotal, taxableAmount, gstAmount, grandTotal };
};

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{label}</label>
    {children}
  </div>
);
const inp  = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700";
const cell = "w-full px-1.5 py-1.5 text-xs border-0 outline-none focus:bg-indigo-50 rounded text-slate-700 bg-transparent";

// Native <select> arrows render inconsistently across browsers — replace with
// a fixed lucide chevron so it lines up the same way everywhere in this page.
const Select = ({ value, onChange, className = inp, children }) => (
  <div className="relative">
    <select value={value} onChange={onChange} className={`${className} appearance-none pr-8`}>
      {children}
    </select>
    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
  </div>
);
const SelectCell = ({ value, onChange, className = "", children }) => (
  <div className="relative">
    <select value={value} onChange={onChange} className={`${cell} ${className} appearance-none pr-4`}>
      {children}
    </select>
    <ChevronDown size={10} className="pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2 text-slate-400" />
  </div>
);

// A document slot that can hold multiple files — already-uploaded ones
// (\{url\}) are clickable links, freshly picked ones (\{file\}) are plain text
// until saved. Card look matches the "Order Documentation" upload boxes used
// on the Create Order page, for visual consistency across the app.
const DocBox = ({ label, docs, fieldKey, addDocs, removeDoc, docName }) => (
  <div className="bg-slate-100/60 p-4 rounded-md border border-slate-100 space-y-2">
    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
      {label}
      {docs.length > 0 && <span className="ml-2 text-indigo-500 lowercase">({docs.length})</span>}
    </label>
    <div className="grid grid-cols-1 gap-2">
      {docs.map((d, idx) => (
        <div key={idx} className="flex items-center justify-between bg-white border border-emerald-100 rounded-md px-3 py-2 shadow-sm">
          {d.url ? (
            <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-w-0 hover:opacity-80">
              <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-emerald-50">
                <FileText size={14} className="text-emerald-500" />
              </div>
              <span className="text-xs font-medium text-slate-700 truncate hover:text-emerald-600 hover:underline">{docName(d)}</span>
            </a>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-emerald-50">
                <FileText size={14} className="text-emerald-500" />
              </div>
              <span className="text-xs font-medium text-slate-700 truncate">{docName(d)}</span>
            </div>
          )}
          <button type="button" onClick={() => removeDoc(fieldKey, idx)} className="p-1 hover:text-red-500 text-slate-400 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
      ))}
      <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-md p-2.5 cursor-pointer transition-all text-slate-400 hover:text-indigo-600 group">
        <Plus size={16} className="group-hover:scale-110 transition-transform" />
        <span className="text-xs font-semibold uppercase tracking-wider">Add Document</span>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden"
          onChange={e => { if (e.target.files.length) addDocs(fieldKey, e.target.files); e.target.value = ""; }} />
      </label>
    </div>
  </div>
);

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtINR  = (v) => (Number(v) || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num     = (v) => (Number(v) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function SiteExpenses({ project }) {
  const { canAdd, canEdit, canDelete, canExport } = useModulePermissions("site_expense");

  const [sites, setSites]         = useState([]);
  const [vendors, setVendors]     = useState([]);
  const [companies, setCompanies] = useState([]);
  const [orders, setOrders]       = useState([]);
  const [expenses, setExpenses]   = useState([]);
  const [loading, setLoading]     = useState(true);

  const [search, setSearch]         = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [orderFilter, setOrderFilter]   = useState("");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [page, setPage]             = useState(1);

  const [view, setView]           = useState("list"); // "list" | "form"
  const [form, setForm]           = useState(emptyForm);
  const [hasOrder, setHasOrder]   = useState(false);
  const [items, setItems]         = useState([emptyItem()]);
  const [payments, setPayments]   = useState([]);
  const [editId, setEditId]       = useState(null);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [viewExpense, setViewExpense]   = useState(null);
  const [paymentsExpense, setPaymentsExpense] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const normProject   = String(project || "").trim().toLowerCase();
  const isAllProject  = !normProject || normProject === "all project";
  const currentSite = useMemo(() => {
    if (isAllProject) return null;
    return sites.find(s =>
      [s.projectCode, s.project_code, s.projectName, s.project_name]
        .some(v => String(v || "").trim().toLowerCase() === normProject)
    ) || null;
  }, [sites, normProject, isAllProject]);

  useEffect(() => {
    fetch(`${API}/api/projects`).then(r => r.json()).then(d => setSites(d.projects || [])).catch(() => {});
    fetch(`${API}/api/procurement/vendors`).then(r => r.json()).then(d => setVendors(d.vendors || [])).catch(() => {});
    fetch(`${API}/api/procurement/companies`).then(r => r.json()).then(d => setCompanies(d.companies || [])).catch(() => {});
    fetch(`${API}/api/orders`).then(r => r.json()).then(d => setOrders(d.orders || d || [])).catch(() => {});
  }, []);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!isAllProject && currentSite) params.set("siteId", currentSite.id);
      const res  = await fetch(`${API}/api/finance/site-expenses?${params.toString()}`);
      const data = await res.json();
      setExpenses(data.expenses || []);
    } catch { setExpenses([]); }
    setLoading(false);
  };

  useEffect(() => { fetchExpenses(); }, [currentSite, isAllProject]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const siteOrders = useMemo(() => {
    if (!currentSite) return orders;
    return orders.filter(o => o.site_id === currentSite.id);
  }, [orders, currentSite]);
  // Only the selected vendor's orders — a vendor can have both a PO and a WO,
  // no point showing every other vendor's orders in the same dropdown.
  const vendorOrders = useMemo(() => siteOrders.filter(o => !form.vendorId || o.vendor_id === form.vendorId), [siteOrders, form.vendorId]);

  const openAdd = () => {
    setForm({ ...emptyForm, invoiceDate: new Date().toISOString().slice(0, 10) });
    setHasOrder(false);
    setItems([emptyItem()]);
    setPayments([]);
    setEditId(null);
    setView("form");
  };
  const openEdit = (e) => {
    setForm({
      vendorId: e.vendorId || "", vendorName: e.vendorName || "", companyId: e.companyId || "",
      orderId: e.orderId || "", orderNumber: e.orderNumber || "",
      invoiceNumber: e.invoiceNumber || "", invoiceDate: e.invoiceDate ? String(e.invoiceDate).slice(0, 10) : "",
      category: e.category || "",
      billStatus: e.billStatus || "Pending",
      documents: (e.documentUrls || []).map(url => ({ url })),
      ewayBillDocs: (e.ewayBillUrls || []).map(url => ({ url })),
      otherDocs: (e.otherDocUrls || []).map(url => ({ url })),
      discountMode: e.discountMode || "none", discountPct: e.discountPct || "",
      labourEnabled: !!e.labourEnabled, labourCharge: e.labourCharge || "",
      freightEnabled: !!e.freightEnabled, freightCharge: e.freightCharge || "",
      transportEnabled: !!e.transportEnabled, transportCharge: e.transportCharge || "",
      installationEnabled: !!e.installationEnabled, installationCharge: e.installationCharge || "",
      chargesBeforeGst: e.chargesBeforeGst !== false,
      gstType: e.gstType || "intra", gstMode: e.gstMode || "none", gstPct: e.gstPct || "",
    });
    setHasOrder(!!e.orderId);
    setItems(e.items?.length ? e.items.map(it => ({
      inNo: it.inNo || "", itemName: it.itemName || "", unit: it.unit || "",
      qty: it.qty || "", basicRate: it.basicRate || "", remarks: it.remarks || "",
    })) : [emptyItem()]);
    setPayments(e.payments?.length ? e.payments.map(p => ({
      amount: p.amount || "", paymentDate: p.paymentDate ? String(p.paymentDate).slice(0, 10) : "",
      paymentMode: p.paymentMode || "", referenceNo: p.referenceNo || "", remarks: p.remarks || "",
      document: null, documentUrl: p.documentUrl || "",
    })) : []);
    setEditId(e.id);
    setView("form");
  };

  const updateItem = (idx, key, value) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: value } : it));
  const addItemRow    = () => setItems(prev => [...prev, emptyItem()]);
  const removeItemRow = (idx) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const subtotal = useMemo(() => items.reduce((sum, it) => sum + computeItemAmount(it), 0), [items]);
  const summary  = useMemo(() => computeSummary(subtotal, form), [subtotal, form]);

  // Each doc box holds a mixed list of already-uploaded files ({url}) and
  // newly picked ones ({file}) — addDocs/removeDoc work the same for all three.
  const addDocs    = (key, fileList) => setForm(f => ({ ...f, [key]: [...f[key], ...Array.from(fileList).map(file => ({ file }))] }));
  const removeDoc   = (key, idx)     => setForm(f => ({ ...f, [key]: f[key].filter((_, i) => i !== idx) }));
  const docName = (d) => d.file ? d.file.name : decodeURIComponent((d.url.split("/").pop() || "").split("?")[0]);

  const handleSave = async () => {
    if (!form.invoiceNumber.trim()) return showToast("Invoice number is required", "error");
    if (!isAllProject && !currentSite) return showToast("Selected project not recognized", "error");

    setSaving(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const token = localStorage.getItem("bms_token") || "";
      const fd = new FormData();
      fd.append("siteId", currentSite?.id || "");
      fd.append("companyId", form.companyId);
      fd.append("vendorId", form.vendorId);
      fd.append("vendorName", form.vendorName);
      fd.append("orderId", hasOrder ? form.orderId : "");
      fd.append("orderNumber", hasOrder ? form.orderNumber : "");
      fd.append("invoiceNumber", form.invoiceNumber);
      fd.append("invoiceDate", form.invoiceDate);
      fd.append("category", form.category);
      fd.append("billStatus", form.billStatus);
      fd.append("createdByName", u.name || "");
      fd.append("discountMode", form.discountMode);
      fd.append("discountPct", form.discountPct);
      CHARGE_TYPES.forEach(c => {
        fd.append(`${c.key}Enabled`, form[`${c.key}Enabled`]);
        fd.append(`${c.key}Charge`, form[`${c.key}Charge`]);
      });
      fd.append("chargesBeforeGst", form.chargesBeforeGst);
      fd.append("gstType", form.gstType);
      fd.append("gstMode", form.gstMode);
      fd.append("gstPct", form.gstPct);
      fd.append("items", JSON.stringify(items.filter(it => it.itemName.trim() || Number(it.qty) > 0)));
      fd.append("payments", JSON.stringify(payments.map((p, i) => ({ ...p, _idx: i, createdByName: u.name || "" }))));
      payments.forEach((p, i) => { if (p.document) fd.append(`paymentDoc_${i}`, p.document); });

      fd.append("documentKeep", JSON.stringify(form.documents.filter(d => d.url).map(d => d.url)));
      fd.append("ewayBillKeep", JSON.stringify(form.ewayBillDocs.filter(d => d.url).map(d => d.url)));
      fd.append("otherDocKeep", JSON.stringify(form.otherDocs.filter(d => d.url).map(d => d.url)));
      form.documents.forEach(d    => { if (d.file) fd.append("document", d.file); });
      form.ewayBillDocs.forEach(d => { if (d.file) fd.append("ewayBillDoc", d.file); });
      form.otherDocs.forEach(d    => { if (d.file) fd.append("otherDoc", d.file); });

      const url    = editId ? `${API}/api/finance/site-expenses/${editId}` : `${API}/api/finance/site-expenses`;
      const method = editId ? "PUT" : "POST";
      const res  = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Save failed"); }
      showToast(editId ? "Expense updated" : "Expense added");
      setView("list");
      fetchExpenses();
    } catch (err) { showToast(err.message || "Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this expense?")) return;
    try {
      const token = localStorage.getItem("bms_token") || "";
      await fetch(`${API}/api/finance/site-expenses/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      showToast("Expense deleted");
      fetchExpenses();
    } catch { showToast("Failed to delete", "error"); }
  };

  const filtered = expenses.filter(e => {
    const s = search.trim().toLowerCase();
    const matchesSearch = !s || [e.expenseNumber, e.vendorName, e.orderNumber, e.invoiceNumber, e.category, e.description]
      .some(v => String(v || "").toLowerCase().includes(s));
    const matchesVendor = !vendorFilter || e.vendorId === vendorFilter;
    const matchesOrder  = !orderFilter || e.orderId === orderFilter;
    const matchesFrom = !dateFrom || (e.invoiceDate && e.invoiceDate >= dateFrom);
    const matchesTo   = !dateTo   || (e.invoiceDate && e.invoiceDate <= dateTo);
    return matchesSearch && matchesVendor && matchesOrder && matchesFrom && matchesTo;
  });
  const totalBilled      = filtered.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalPaid        = filtered.reduce((sum, e) => sum + (Number(e.paid) || 0), 0);
  const totalOutstanding = filtered.reduce((sum, e) => sum + (Number(e.outstanding) || 0), 0);
  const totalPages  = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated   = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const exportExcel = () => {
    const data = filtered.map((e, i) => ({
      "S.No": i + 1, "Expense No": e.expenseNumber, "Vendor": e.vendorName, "Order No": e.orderNumber || "—",
      "Invoice No": e.invoiceNumber, "Invoice Date": fmtDate(e.invoiceDate), "Category": e.category,
      "Amount": Number(e.amount) || 0, "Paid": Number(e.paid) || 0, "Balance": Number(e.outstanding) || 0,
      "Bill Status": e.billStatus, "Description": e.description, "Remarks": e.remarks,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Site Expenses");
    XLSX.writeFile(wb, `site_expenses_${isAllProject ? "all_projects" : project}.xlsx`);
  };

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
          <div className="flex items-center justify-between gap-4 px-3 sm:px-4 lg:px-6 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setView("list")} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-all shrink-0"><ArrowLeft size={18} /></button>
              <h1 className="text-base font-bold text-slate-800 whitespace-nowrap">{editId ? "Edit Expense" : "Add Expense"}</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setView("list")}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                {saving ? "Saving…" : editId ? "Update Expense" : "Add Expense"}
              </button>
            </div>
          </div>
        </div>

        <div className="px-3 sm:px-4 lg:px-6 py-5 space-y-5 pb-32 w-full">
          {/* Basic info first */}
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Basic Details</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Vendor">
                <Select value={form.vendorId}
                  onChange={e => { const v = vendors.find(x => x.id === e.target.value); setForm(f => ({ ...f, vendorId: e.target.value, vendorName: v?.vendorName || "", orderId: "", orderNumber: "" })); }}>
                  <option value="">— Select Vendor —</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.vendorName}</option>)}
                </Select>
              </Field>
              <Field label="Company / Entity">
                <Select value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
                  <option value="">— Select Company —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                </Select>
              </Field>
              <Field label="Category">
                <Select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">— Select —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Invoice Number *">
                <input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} className={inp} placeholder="e.g. INV-1234" />
              </Field>
              <Field label="Invoice Date">
                <input type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} className={inp} />
              </Field>
              <Field label="Bill Status">
                <Select value={form.billStatus} onChange={e => setForm(f => ({ ...f, billStatus: e.target.value }))}>
                  {BILL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Order made against this expense?</label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                  {[{ v: false, l: "No" }, { v: true, l: "Yes" }].map(o => (
                    <button key={o.l} type="button" onClick={() => { setHasOrder(o.v); if (!o.v) setForm(f => ({ ...f, orderId: "", orderNumber: "" })); }}
                      className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${hasOrder === o.v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                      {o.l}
                    </button>
                  ))}
                </div>
                {hasOrder && (
                  <div className="flex-1">
                    <Select value={form.orderId}
                      onChange={e => { const o = vendorOrders.find(x => x.id === e.target.value); setForm(f => ({ ...f, orderId: e.target.value, orderNumber: o?.order_number || "" })); }}>
                      <option value="">— Select Order ({vendorOrders.length} available) —</option>
                      {vendorOrders.map(o => <option key={o.id} value={o.id}>{o.order_number}</option>)}
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Items — plain Qty x Rate lines; GST/discount/charges live in the summary below */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Items</p>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button type="button" onClick={() => setShowSettings(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${showSettings ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600"}`}>
                    <Plus size={13} strokeWidth={3} /> Add Columns / Settings
                  </button>
                  {showSettings && (
                    <>
                      <div className="absolute right-0 top-full mt-1 z-40 w-72 bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-y-auto max-h-[70vh]">
                        <div className="p-4 border-b border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">GST</p>
                          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg mb-2">
                            {[["none", "None"], ["total", "Total"]].map(([m, lbl]) => (
                              <button key={m} type="button" onClick={() => setForm(f => ({ ...f, gstMode: m }))}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${form.gstMode === m ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                                {lbl}
                              </button>
                            ))}
                          </div>
                          {form.gstMode === "total" && (
                            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                              {[["intra", "Same State"], ["inter", "Other State"]].map(([m, lbl]) => (
                                <button key={m} type="button" onClick={() => setForm(f => ({ ...f, gstType: m }))}
                                  className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${form.gstType === m ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                                  {lbl}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="p-4 border-b border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Discount</p>
                          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                            {[["none", "None"], ["total", "Total"]].map(([m, lbl]) => (
                              <button key={m} type="button" onClick={() => setForm(f => ({ ...f, discountMode: m }))}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${form.discountMode === m ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                                {lbl}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="p-4 border-b border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Charges</p>
                          <div className="space-y-1.5">
                            {CHARGE_TYPES.map(c => (
                              <button key={c.key} type="button" onClick={() => setForm(f => ({ ...f, [`${c.key}Enabled`]: !f[`${c.key}Enabled`] }))}
                                className={`flex items-center gap-2.5 px-3 py-2 w-full text-left rounded-lg border transition-all ${
                                  form[`${c.key}Enabled`] ? "border-indigo-300 bg-indigo-50" : "border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-100"
                                }`}>
                                {form[`${c.key}Enabled`] ? <X size={13} strokeWidth={3} className="text-indigo-500 shrink-0" /> : <Plus size={13} strokeWidth={3} className="text-slate-400 shrink-0" />}
                                <span className="text-xs font-medium text-slate-700">{c.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="p-4">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Charges vs GST</p>
                          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                            {[[true, "Before GST"], [false, "After GST"]].map(([v, lbl]) => (
                              <button key={lbl} type="button" onClick={() => setForm(f => ({ ...f, chargesBeforeGst: v }))}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${form.chargesBeforeGst === v ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                                {lbl}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="fixed inset-0 z-30" onClick={() => setShowSettings(false)} />
                    </>
                  )}
                </div>
                <button type="button" onClick={addItemRow}
                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                  <Plus size={13} /> Add Row
                </button>
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="border-collapse w-full">
                <thead>
                  <tr className="bg-slate-50">
                    {["In No", "Item", "Unit", "Qty", "Rate", "Amount", "Description", ""].map(c => (
                      <th key={c} className="text-left px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap border border-slate-200">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="border border-slate-200"><input value={it.inNo} onChange={e => updateItem(idx, "inNo", e.target.value)} className={`${cell} w-20`} /></td>
                      <td className="border border-slate-200"><input value={it.itemName} onChange={e => updateItem(idx, "itemName", e.target.value)} className={`${cell} w-48`} /></td>
                      <td className="border border-slate-200"><input value={it.unit} onChange={e => updateItem(idx, "unit", e.target.value)} className={`${cell} w-16`} /></td>
                      <td className="border border-slate-200"><input type="number" value={it.qty} onChange={e => updateItem(idx, "qty", e.target.value)} className={`${cell} w-20 text-right`} /></td>
                      <td className="border border-slate-200"><input type="number" value={it.basicRate} onChange={e => updateItem(idx, "basicRate", e.target.value)} className={`${cell} w-24 text-right`} /></td>
                      <td className="border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 text-right whitespace-nowrap">{num(computeItemAmount(it))}</td>
                      <td className="border border-slate-200"><input value={it.remarks} onChange={e => updateItem(idx, "remarks", e.target.value)} className={`${cell} w-40`} /></td>
                      <td className="border border-slate-200 px-1 text-center">
                        <button type="button" onClick={() => removeItemRow(idx)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary — Subtotal -> Discount -> Charges -> GST -> Grand Total */}
            <div className="mt-3 ml-auto max-w-sm space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="text-slate-700 font-medium">{fmtINR(subtotal)}</span></div>
              {form.discountMode === "total" && (
                <div className="flex justify-between"><span className="text-slate-500">Discount ({form.discountPct || 0}%)</span><span className="text-red-500 font-medium">− {fmtINR(summary.discountAmount)}</span></div>
              )}
              {summary.charges.filter(c => c.enabled).map(c => (
                <div key={c.key} className="flex justify-between"><span className="text-slate-500">{c.label}</span><span className="text-slate-700 font-medium">+ {fmtINR(c.amount)}</span></div>
              ))}
              {form.gstMode === "total" && (
                <div className="flex justify-between"><span className="text-slate-500">GST ({form.gstPct || 0}%, {form.gstType === "inter" ? "IGST" : "CGST+SGST"})</span><span className="text-slate-700 font-medium">+ {fmtINR(summary.gstAmount)}</span></div>
              )}
              <div className="flex justify-between pt-1.5 border-t border-slate-200"><span className="font-bold text-slate-800">Grand Total</span><span className="font-bold text-slate-900">{fmtINR(summary.grandTotal)}</span></div>
            </div>

            {/* Inputs for discount % / GST % / enabled charge amounts */}
            {(form.discountMode === "total" || form.gstMode === "total" || summary.charges.some(c => c.enabled)) && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                {form.discountMode === "total" && (
                  <Field label="Discount %"><input type="number" value={form.discountPct} onChange={e => setForm(f => ({ ...f, discountPct: e.target.value }))} className={inp} placeholder="0" /></Field>
                )}
                {form.gstMode === "total" && (
                  <Field label="GST %"><input type="number" value={form.gstPct} onChange={e => setForm(f => ({ ...f, gstPct: e.target.value }))} className={inp} placeholder="0" /></Field>
                )}
                {CHARGE_TYPES.filter(c => form[`${c.key}Enabled`]).map(c => (
                  <Field key={c.key} label={c.label}>
                    <input type="number" value={form[`${c.key}Charge`]} onChange={e => setForm(f => ({ ...f, [`${c.key}Charge`]: e.target.value }))} className={inp} placeholder="0" />
                  </Field>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded p-5 shadow-sm space-y-4 border border-slate-100">
            <h2 className="inline-flex items-center text-[11px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded">Documents</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <DocBox label="E-way Bill" docs={form.ewayBillDocs} fieldKey="ewayBillDocs" addDocs={addDocs} removeDoc={removeDoc} docName={docName} />
              <DocBox label="Invoice" docs={form.documents} fieldKey="documents" addDocs={addDocs} removeDoc={removeDoc} docName={docName} />
              <DocBox label="Other Docs" docs={form.otherDocs} fieldKey="otherDocs" addDocs={addDocs} removeDoc={removeDoc} docName={docName} />
            </div>
          </div>
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
        <div className="flex items-center justify-between gap-4 px-3 sm:px-4 lg:px-6 py-2.5 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Receipt size={16} className="text-blue-600" />
              </div>
              <h1 className="text-base font-bold text-slate-800 whitespace-nowrap">Site Expenses</h1>
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
                <Plus size={15} /> Add Expense
              </button>
            )}
          </div>
        </div>

        <div className="px-3 sm:px-4 lg:px-6 py-3 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-full sm:w-72 shrink-0">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search expense, vendor, invoice, order…"
                className="w-full pl-9 pr-4 h-10 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400 bg-white text-slate-700" />
            </div>
            <Select value={vendorFilter} onChange={e => { setVendorFilter(e.target.value); setPage(1); }}
              className="h-10 pl-3 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white outline-none focus:border-slate-400">
              <option value="">All Vendors</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.vendorName}</option>)}
            </Select>
            {orderFilter && (
              <button onClick={() => setOrderFilter("")}
                className="h-10 px-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                Order: {expenses.find(e => e.orderId === orderFilter)?.orderNumber || orderFilter} <X size={12} />
              </button>
            )}
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white outline-none focus:border-slate-400" />
            <span className="text-slate-400 text-xs">to</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white outline-none focus:border-slate-400" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-600">
              {filtered.length} expense{filtered.length !== 1 ? "s" : ""}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold">Total Billed {fmtINR(totalBilled)}</span>
            <span className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Total Paid {fmtINR(totalPaid)}</span>
            <span className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold">Outstanding {fmtINR(totalOutstanding)}</span>
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-4 lg:px-6 pt-4 pb-32 w-full">
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-100 p-16 flex items-center justify-center">
            <p className="text-slate-300 font-bold uppercase tracking-widest text-xs">No expenses recorded yet</p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Expense No</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Vendor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Order No</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Invoice No</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Amount</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Paid</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Balance</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Bill Status</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Bill</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Payments</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800 text-sm border border-slate-200 whitespace-nowrap">{e.expenseNumber}</td>
                    <td className="px-4 py-3 text-sm border border-slate-200 whitespace-nowrap">
                      <button onClick={() => { setVendorFilter(e.vendorId); setPage(1); }}
                        className="text-slate-700 font-medium hover:text-indigo-600 hover:underline transition-colors">{e.vendorName || "—"}</button>
                    </td>
                    <td className="px-4 py-3 text-sm border border-slate-200 whitespace-nowrap">
                      {e.orderNumber ? (
                        <button onClick={() => { setOrderFilter(e.orderId); setPage(1); }}
                          className="text-slate-600 hover:text-indigo-600 hover:underline transition-colors">{e.orderNumber}</button>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{e.invoiceNumber}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{fmtDate(e.invoiceDate)}</td>
                    <td className="px-4 py-3 text-sm text-slate-800 font-semibold border border-slate-200 text-right whitespace-nowrap">{fmtINR(e.amount)}</td>
                    <td className="px-4 py-3 text-sm text-emerald-700 border border-slate-200 text-right whitespace-nowrap">{fmtINR(e.paid)}</td>
                    <td className={`px-4 py-3 text-sm font-semibold border border-slate-200 text-right whitespace-nowrap ${e.outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtINR(e.outstanding)}</td>
                    <td className="px-4 py-3 text-sm border border-slate-200 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{e.billStatus}</span>
                    </td>
                    <td className="px-3 py-3 border border-slate-200 text-center">
                      {e.documentUrls?.length ? (
                        <a href={e.documentUrls[0]} target="_blank" rel="noreferrer" className="inline-flex p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 transition-all"><FileText size={14} /></a>
                      ) : <span className="text-slate-300"><Paperclip size={13} className="inline" /></span>}
                    </td>
                    <td className="px-3 py-3 border border-slate-200 text-center">
                      <button onClick={() => setPaymentsExpense(e)} className="inline-flex p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="Payment history">
                        <Receipt size={14} />
                      </button>
                    </td>
                    <td className="px-3 py-3 border border-slate-200">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setViewExpense(e)} className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-all"><Eye size={14} /></button>
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
                <p className="text-xs text-slate-400">{filtered.length} expense{filtered.length !== 1 ? "s" : ""} · Page {page} of {totalPages}</p>
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
        {viewExpense && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="bg-linear-to-r from-slate-800 to-slate-700 px-6 py-5 relative">
                <button onClick={() => setViewExpense(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">{viewExpense.expenseNumber}</p>
                <h2 className="text-lg font-bold text-white leading-tight">{viewExpense.vendorName || "No Vendor"}</h2>
                <p className="text-sm text-slate-300 mt-1">{fmtINR(viewExpense.amount)}</p>
              </div>
              <div className="px-6 py-5 space-y-2.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Order No</span><span className="text-slate-700 font-medium">{viewExpense.orderNumber || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Invoice No</span><span className="text-slate-700 font-medium">{viewExpense.invoiceNumber}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Invoice Date</span><span className="text-slate-700 font-medium">{fmtDate(viewExpense.invoiceDate)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Paid</span><span className="text-emerald-700 font-medium">{fmtINR(viewExpense.paid)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Balance</span><span className={`font-medium ${viewExpense.outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtINR(viewExpense.outstanding)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Bill Status</span><span className="text-slate-700 font-medium">{viewExpense.billStatus}</span></div>
                {viewExpense.description && <div className="pt-2 border-t border-slate-100"><span className="text-slate-400">Description</span><p className="text-slate-700 mt-1">{viewExpense.description}</p></div>}
                {viewExpense.remarks && <div className="pt-2 border-t border-slate-100"><span className="text-slate-400">Remarks</span><p className="text-slate-700 mt-1">{viewExpense.remarks}</p></div>}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  {[
                    { label: "E-way Bill", urls: viewExpense.ewayBillUrls },
                    { label: "Invoice", urls: viewExpense.documentUrls },
                    { label: "Other Docs", urls: viewExpense.otherDocUrls },
                  ].flatMap(({ label, urls }) => (urls || []).map((url, i) => (
                    <a key={`${label}-${i}`} href={url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-medium hover:bg-indigo-100 transition-all">
                      <Download size={14} /> {label}{urls.length > 1 ? ` (${i + 1})` : ""}
                    </a>
                  )))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
                {canEdit && (
                  <button onClick={() => { setViewExpense(null); openEdit(viewExpense); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all">
                    <Pencil size={13} /> Edit
                  </button>
                )}
                <button onClick={() => setViewExpense(null)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Payment history popup */}
        {paymentsExpense && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{paymentsExpense.expenseNumber} — {paymentsExpense.vendorName}</p>
                  <h2 className="text-base font-bold text-slate-800">Payment History</h2>
                </div>
                <button onClick={() => setPaymentsExpense(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="px-6 py-4 overflow-y-auto space-y-2">
                {!paymentsExpense.payments?.length ? (
                  <p className="text-center text-slate-300 text-xs font-bold uppercase tracking-widest py-10">No payments recorded yet</p>
                ) : paymentsExpense.payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between border border-slate-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{fmtINR(p.amount)}</p>
                      <p className="text-xs text-slate-500">{fmtDate(p.paymentDate)} · {p.paymentMode || "—"}{p.referenceNo ? ` · Ref: ${p.referenceNo}` : ""}</p>
                    </div>
                    {p.documentUrl && (
                      <a href={p.documentUrl} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-indigo-500 hover:bg-indigo-50"><FileText size={15} /></a>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
                <span className="text-sm font-semibold text-slate-700">Total Paid: {fmtINR(paymentsExpense.paid)}</span>
                <button onClick={() => setPaymentsExpense(null)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all">Close</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
