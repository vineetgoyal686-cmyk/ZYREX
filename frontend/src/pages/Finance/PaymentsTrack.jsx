import React, { useState, useEffect, useRef, useMemo } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { Plus, Search, Pencil, Trash2, X, Wallet, Eye, FileSpreadsheet, ChevronDown, ArrowLeft, FileText, Upload, Download, IndianRupee } from "lucide-react";
import * as XLSX from "xlsx";
import DateRangeFilter from "../../components/DateRangeFilter";
import EntitySelect from "../../components/EntitySelect";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 10;

const BILL_STATUSES      = ["Pending", "Approved", "Rejected", "Hold"];
const PAYMENT_STATUSES   = ["Unpaid", "Partially Paid", "Fully Paid"];
const PAYMENT_MODES      = ["Cash", "Cheque", "NEFT", "RTGS", "UPI"];

const emptyForm = {
  orderId: "",
  invoiceNo: "", invoiceDate: "", invoiceAmount: "",
  expenseCategory: "", expenseInfo: "", tallyStatus: "No", billStatus: "Pending",
};
const emptyNewOrder = { vendorId: "", vendorName: "", msmeNumber: "", companyId: "", companyName: "", orderNo: "", orderDate: "", orderValue: "" };
const emptyPayment = () => ({ paidAmount: "", paidDate: "", mode: "", referenceNo: "", remarks: "" });

const SectionCard = ({ step, title, subtitle, action, children }) => (
  // No overflow-hidden here — EntitySelect's dropdown is absolutely
  // positioned inside this card, so clipping overflow would clip the list.
  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
    <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/60 rounded-t-2xl">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0">{step}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
    <div className="px-5 sm:px-6 py-5">{children}</div>
  </div>
);

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
      {label} {required && <span className="text-red-500 normal-case">*</span>}
    </label>
    {children}
  </div>
);
// Matches EntitySelect/ProjectSelect's field shape (h-14, small radius,
// 15px text) so every box in the form looks the same, dropdowns included.
const inp  = "w-full border border-slate-300 rounded h-14 px-4 text-[15px] outline-none focus:border-slate-400 text-slate-950 placeholder:text-slate-400";
const cell = "w-full px-1.5 py-1.5 text-xs border-0 outline-none focus:bg-indigo-50 rounded text-slate-700 bg-transparent";
const td   = "border border-slate-200 whitespace-nowrap";

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

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtINR  = (v) => (Number(v) || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

const PAYMENT_BADGE = {
  "Unpaid":          "bg-red-50 text-red-600",
  "Partially Paid":  "bg-amber-50 text-amber-700",
  "Fully Paid":      "bg-emerald-50 text-emerald-700",
};

export default function PaymentsTrack({ project }) {
  const { canAdd, canEdit, canDelete, canExport, canBulk } = useModulePermissions("payments_track");

  const [sites, setSites]     = useState([]);
  const [vendors, setVendors] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders]   = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch]                     = useState("");
  const [vendorFilter, setVendorFilter]         = useState([]);
  const [billStatusFilter, setBillStatusFilter] = useState([]);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState([]);
  const [categoryFilter, setCategoryFilter]     = useState([]);
  const [dateRange, setDateRange]   = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const [page, setPage] = useState(1);

  const [showMore, setShowMore] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkRows, setBulkRows]     = useState([]);
  const [bulkFile, setBulkFile]     = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const moreRef = useRef();

  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [payOrderId, setPayOrderId] = useState("");
  const [payAmount, setPayAmount]   = useState("");
  const [payDate, setPayDate]       = useState("");
  const [payMode, setPayMode]       = useState("");
  const [payRef, setPayRef]         = useState("");
  const [payRemarks, setPayRemarks] = useState("");
  const [payAllocations, setPayAllocations] = useState({}); // invoiceId -> amount string
  const [paySaving, setPaySaving]   = useState(false);
  const bulkRef = useRef();

  const [view, setView]     = useState("list"); // "list" | "form"
  const [form, setForm]     = useState(emptyForm);
  const [orderMode, setOrderMode] = useState("existing"); // "existing" | "new"
  const [newOrder, setNewOrder]   = useState(emptyNewOrder);
  const [payments, setPayments] = useState([]);
  const [docs, setDocs]     = useState([]); // { file } new | { url, keepPath } existing
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState(null);
  const [viewInvoice, setViewInvoice] = useState(null);
  const fileRef = useRef();
  const expenseInfoRef = useRef();

  // Pre-filled Expense Info (edit) should start already grown to fit its
  // content, not just expand once the user types.
  useEffect(() => {
    if (view !== "form" || !expenseInfoRef.current) return;
    expenseInfoRef.current.style.height = "auto";
    expenseInfoRef.current.style.height = `${expenseInfoRef.current.scrollHeight}px`;
  }, [view, editId]);

  const normProject  = String(project || "").trim().toLowerCase();
  const isAllProject = !normProject || normProject === "all project";
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
    fetch(`${API}/api/procurement/categories`).then(r => r.json()).then(d => setCategories(d.categories || [])).catch(() => {});
  }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!isAllProject && currentSite) params.set("siteId", currentSite.id);
      const res  = await fetch(`${API}/api/finance/invoices?${params.toString()}`);
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch { setInvoices([]); }
    setLoading(false);
  };
  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams();
      if (!isAllProject && currentSite) params.set("siteId", currentSite.id);
      const res  = await fetch(`${API}/api/finance/orders?${params.toString()}`);
      const data = await res.json();
      setOrders(data.orders || []);
    } catch { setOrders([]); }
  };
  useEffect(() => { fetchInvoices(); fetchOrders(); }, [currentSite, isAllProject]);

  useEffect(() => {
    if (!showMore) return;
    const h = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMore]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openAdd = () => {
    setForm({ ...emptyForm, invoiceDate: new Date().toISOString().slice(0, 10) });
    setOrderMode(orders.length ? "existing" : "new");
    setNewOrder(emptyNewOrder);
    setPayments([]);
    setDocs([]);
    setEditId(null);
    setView("form");
  };
  const openEdit = (inv) => {
    setForm({
      orderId: inv.orderId || "",
      invoiceNo: inv.invoiceNo || "", invoiceDate: inv.invoiceDate ? String(inv.invoiceDate).slice(0, 10) : "", invoiceAmount: inv.invoiceAmount || "",
      expenseCategory: inv.expenseCategory || "", expenseInfo: inv.expenseInfo || "", tallyStatus: inv.tallyStatus || "No", billStatus: inv.billStatus || "Pending",
    });
    setOrderMode("existing");
    setNewOrder(emptyNewOrder);
    setPayments((inv.payments || []).map(p => ({
      paidAmount: p.paidAmount || "", paidDate: p.paidDate ? String(p.paidDate).slice(0, 10) : "",
      mode: p.mode || "", referenceNo: p.referenceNo || "", remarks: p.remarks || "",
    })));
    setDocs((inv.documentUrls || []).map(url => ({ url, keepPath: url })));
    setEditId(inv.id);
    setView("form");
  };

  const addFiles = (files) => setDocs(prev => [...prev, ...files.map(file => ({ file }))]);
  const removeDoc = (idx) => setDocs(prev => prev.filter((_, i) => i !== idx));

  const updatePayment = (idx, key, value) => setPayments(prev => prev.map((p, i) => i === idx ? { ...p, [key]: value } : p));
  const addPaymentRow    = () => setPayments(prev => [...prev, emptyPayment()]);
  const removePaymentRow = (idx) => setPayments(prev => prev.filter((_, i) => i !== idx));

  const selectedOrder = orders.find(o => o.id === form.orderId);
  // Vendors with no formal PO still need to be told apart in the picker —
  // fall back to "No PO" instead of leaving the badge blank.
  const orderOptions = useMemo(() => orders.map(o => ({ ...o, orderNo: o.orderNo || "No PO" })), [orders]);

  const invoiceAmountNum = Number(form.invoiceAmount) || 0;
  const totalPaidPreview = payments.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
  const balancePreview   = Math.max(invoiceAmountNum - totalPaidPreview, 0);
  const paymentStatusPreview = totalPaidPreview <= 0 ? "Unpaid" : balancePreview <= 0 ? "Fully Paid" : "Partially Paid";

  const validate = () => {
    if (orderMode === "existing") {
      if (!form.orderId) return "Select an order";
    } else {
      if (!newOrder.vendorId) return "Vendor is required";
      if (Number(newOrder.orderValue) < 0) return "Order Value cannot be negative";
    }
    if (!form.invoiceNo.trim()) return "Invoice No is required";
    if (!form.invoiceDate) return "Invoice Date is required";
    if (invoiceAmountNum <= 0) return "Invoice Amount must be greater than 0";
    for (const p of payments) {
      if (Number(p.paidAmount) < 0) return "Paid Amount cannot be negative";
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) return showToast(err, "error");

    setSaving(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const token = localStorage.getItem("bms_token") || "";

      let orderId = form.orderId;
      if (orderMode === "new") {
        const orderRes = await fetch(`${API}/api/finance/orders`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...newOrder, siteId: currentSite?.id || "", createdByName: u.name || "" }),
        });
        if (!orderRes.ok) { const e = await orderRes.json().catch(() => ({})); throw new Error(e.error || "Could not save order"); }
        const orderData = await orderRes.json();
        orderId = orderData.order.id;
        setOrders(prev => [orderData.order, ...prev]);
      }

      const fd = new FormData();
      fd.append("orderId", orderId);
      fd.append("siteId", currentSite?.id || "");
      fd.append("invoiceNo", form.invoiceNo);
      fd.append("invoiceDate", form.invoiceDate);
      fd.append("invoiceAmount", form.invoiceAmount);
      fd.append("expenseCategory", form.expenseCategory);
      fd.append("expenseInfo", form.expenseInfo);
      fd.append("tallyStatus", form.tallyStatus);
      fd.append("billStatus", form.billStatus);
      fd.append("createdByName", u.name || "");
      fd.append("payments", JSON.stringify(payments.filter(p => Number(p.paidAmount) > 0).map(p => ({ ...p, createdByName: u.name || "" }))));
      if (editId) fd.append("documentKeep", JSON.stringify(docs.filter(d => d.keepPath).map(d => d.keepPath)));
      docs.filter(d => d.file).forEach(d => fd.append("document", d.file));

      const url    = editId ? `${API}/api/finance/invoices/${editId}` : `${API}/api/finance/invoices`;
      const method = editId ? "PUT" : "POST";
      const res  = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Save failed"); }
      showToast(editId ? "Invoice updated" : "Invoice added");
      setView("list");
      fetchInvoices();
    } catch (err2) { showToast(err2.message || "Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this invoice?")) return;
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const token = localStorage.getItem("bms_token") || "";
      await fetch(`${API}/api/finance/invoices/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deletedByName: u.name || "" }),
      });
      showToast("Invoice deleted");
      fetchInvoices();
    } catch { showToast("Failed to delete", "error"); }
  };

  const filterOptions = useMemo(() => {
    const vendorSet = new Set();
    invoices.forEach(i => { if (i.vendorName) vendorSet.add(i.vendorName); });
    return { vendors: [...vendorSet].sort() };
  }, [invoices]);

  const filtered = invoices.filter(i => {
    const s = search.trim().toLowerCase();
    const matchesSearch = !s || [i.vendorName, i.invoiceNo, i.orderNo, i.expenseCategory]
      .some(v => String(v || "").toLowerCase().includes(s));
    const matchesVendor  = !vendorFilter.length || vendorFilter.includes(i.vendorName);
    const matchesBill    = !billStatusFilter.length || billStatusFilter.includes(i.billStatus);
    const matchesPayment = !paymentStatusFilter.length || paymentStatusFilter.includes(i.paymentStatus);
    const matchesCategory = !categoryFilter.length || categoryFilter.includes(i.expenseCategory);
    const matchesFrom = dateRange === "all" || !customFrom || (i.invoiceDate && i.invoiceDate >= customFrom);
    const matchesTo   = dateRange === "all" || !customTo   || (i.invoiceDate && i.invoiceDate <= customTo);
    return matchesSearch && matchesVendor && matchesBill && matchesPayment && matchesCategory && matchesFrom && matchesTo;
  });
  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const exportExcel = () => {
    const data = filtered.map((i, idx) => ({
      "S.No": idx + 1, "Vendor Name": i.vendorName, "Invoice No": i.invoiceNo, "Invoice Date": fmtDate(i.invoiceDate),
      "Expense Category": i.expenseCategory, "Expense Info": i.expenseInfo, "Invoice Amount": i.invoiceAmount, "Paid Amount": i.totalPaid,
      "Balance Amount": i.balance, "Bill Status": i.billStatus, "Tally Status": i.tallyStatus, "Payment Status": i.paymentStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payments Track");
    XLSX.writeFile(wb, `payments_track_${isAllProject ? "all_projects" : project}.xlsx`);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{
      "Vendor Name": "Advance Infra", "Company Name": "Bharat Volt Pvt Ltd",
      "Order No": "PO-1234", "Order Date": "2026-04-01", "Order Value": 500000,
      "Invoice No": "INV-1234", "Invoice Date": "2026-04-10", "Invoice Amount": 125000,
      "Expense Category": "Raw Material", "Expense Info": "Cement & steel for foundation",
      "Tally Status": "No", "Bill Status": "Pending",
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");
    XLSX.writeFile(wb, "payments_track_bulk_template.xlsx");
  };

  const handleBulkFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target.result, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      setBulkRows(data.filter(r => r["Vendor Name"] || r["Invoice No"]));
      setBulkResult(null);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleBulkSave = async () => {
    if (!bulkRows.length) return showToast("No valid rows to upload", "error");
    setBulkSaving(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const token = localStorage.getItem("bms_token") || "";
      const res = await fetch(`${API}/api/finance/invoices/bulk`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: bulkRows, siteId: currentSite?.id || "", createdByName: u.name || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      showToast(`${data.inserted} invoice${data.inserted !== 1 ? "s" : ""} uploaded${data.skipped ? `, ${data.skipped} skipped` : ""}`);
      setBulkResult(data);
      setBulkRows([]); setBulkFile("");
      fetchInvoices(); fetchOrders();
    } catch (err) { showToast(err.message, "error"); }
    setBulkSaving(false);
  };

  const showRefNo = (mode) => mode && mode !== "Cash";

  // Record Payment — one lump payment split across whichever of an order's
  // invoices it actually covers, since a vendor is often paid a round-sum
  // amount that isn't tied to a single bill.
  const openRecordPayment = () => {
    setPayOrderId(""); setPayAmount(""); setPayDate(new Date().toISOString().slice(0, 10));
    setPayMode(""); setPayRef(""); setPayRemarks(""); setPayAllocations({});
    setShowRecordPayment(true);
  };
  const payOrderInvoices = useMemo(
    () => invoices.filter(i => i.orderId === payOrderId && i.balance > 0)
      .sort((a, b) => new Date(a.invoiceDate || 0) - new Date(b.invoiceDate || 0)),
    [invoices, payOrderId]
  );
  const payAllocatedTotal = payOrderInvoices.reduce((sum, i) => sum + (Number(payAllocations[i.id]) || 0), 0);
  const payAmountNum = Number(payAmount) || 0;

  const autoFillOldestFirst = () => {
    let remaining = payAmountNum;
    const next = {};
    for (const inv of payOrderInvoices) {
      const take = Math.min(remaining, inv.balance);
      next[inv.id] = take > 0 ? String(take) : "";
      remaining -= take;
    }
    setPayAllocations(next);
  };

  const handleRecordPaymentSave = async () => {
    if (!payOrderId) return showToast("Select an order", "error");
    if (payAmountNum <= 0) return showToast("Amount must be greater than 0", "error");
    if (Math.round(payAllocatedTotal * 100) !== Math.round(payAmountNum * 100)) {
      return showToast("Allocated amount must exactly match the payment amount", "error");
    }
    setPaySaving(true);
    try {
      const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const token = localStorage.getItem("bms_token") || "";
      const allocations = payOrderInvoices
        .map(i => ({ invoiceId: i.id, amount: Number(payAllocations[i.id]) || 0 }))
        .filter(a => a.amount > 0);
      const res = await fetch(`${API}/api/finance/orders/${payOrderId}/record-payment`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paidDate: payDate, mode: payMode, referenceNo: payRef, remarks: payRemarks, allocations, createdByName: u.name || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save payment");
      showToast(`Payment recorded across ${data.count} invoice${data.count !== 1 ? "s" : ""}`);
      setShowRecordPayment(false);
      fetchInvoices();
    } catch (err) { showToast(err.message, "error"); }
    setPaySaving(false);
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
          <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setView("list")} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-all shrink-0"><ArrowLeft size={18} /></button>
              <h1 className="text-[15px] font-bold text-slate-800 whitespace-nowrap">{editId ? "Edit Invoice" : "Add Invoice"}</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setView("list")}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                {saving ? "Saving…" : editId ? "Update Invoice" : "Add Invoice"}
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-5 pb-8 w-full bg-[#f6f7f9] min-h-full">
          <SectionCard step={1} title="Order / Vendor Info" subtitle="One order can have many invoices raised against it — pick it once, reuse it every time"
            action={
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit shrink-0">
                {[{ v: "existing", l: "Existing Order" }, { v: "new", l: "New Order" }].map(o => (
                  <button key={o.v} type="button" onClick={() => setOrderMode(o.v)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${orderMode === o.v ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            }>
            {orderMode === "existing" ? (
              <div className="space-y-4">
                <EntitySelect
                  label="Select Order" required
                  value={form.orderId}
                  onChange={e => setForm(f => ({ ...f, orderId: e.target.value }))}
                  options={orderOptions} valueKey="id" labelKey="vendorName" subLabelKey="orderNo"
                  placeholder={orders.length ? "Select order…" : "No orders yet — use New Order"}
                />
                {selectedOrder && (
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm">
                    <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Site Name</p><p className="text-slate-700 font-medium mt-0.5">{currentSite?.projectName || currentSite?.project_name || "—"}</p></div>
                    <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MSME Number</p><p className="text-slate-700 font-medium mt-0.5">{selectedOrder.msmeNumber || "—"}</p></div>
                    <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Company</p><p className="text-slate-700 font-medium mt-0.5">{selectedOrder.companyName || "—"}</p></div>
                    <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order No</p><p className="text-slate-700 font-medium mt-0.5">{selectedOrder.orderNo || "—"}</p></div>
                    <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order Date</p><p className="text-slate-700 font-medium mt-0.5">{fmtDate(selectedOrder.orderDate)}</p></div>
                    <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order Value</p><p className="text-slate-700 font-medium mt-0.5">{fmtINR(selectedOrder.orderValue)}</p></div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-4">
                <Field label="Site Name">
                  <input value={currentSite?.projectName || currentSite?.project_name || ""} readOnly className={`${inp} bg-slate-50 text-slate-400 cursor-not-allowed`} placeholder="Selected project" />
                </Field>
                <EntitySelect
                  label="Vendor Name" required
                  value={newOrder.vendorId}
                  onChange={e => { const v = vendors.find(x => x.id === e.target.value); setNewOrder(f => ({ ...f, vendorId: e.target.value, vendorName: v?.vendorName || "", msmeNumber: v?.msmeNumber || "" })); }}
                  options={vendors} valueKey="id" labelKey="vendorName" subLabelKey="address"
                  placeholder="Select vendor…"
                />
                <Field label="MSME Number">
                  <input value={newOrder.msmeNumber} readOnly className={`${inp} bg-slate-50 text-slate-400 cursor-not-allowed`} placeholder="Auto-fetched from vendor" />
                </Field>
                <EntitySelect
                  label="Company Name"
                  value={newOrder.companyId}
                  onChange={e => { const c = companies.find(x => x.id === e.target.value); setNewOrder(f => ({ ...f, companyId: e.target.value, companyName: c?.companyName || "" })); }}
                  options={companies} valueKey="id" labelKey="companyName" subLabelKey="companyCode"
                  placeholder="Select company…"
                />
                <Field label="Order No">
                  <input value={newOrder.orderNo} onChange={e => setNewOrder(f => ({ ...f, orderNo: e.target.value }))} className={inp} />
                </Field>
                <Field label="Order Date">
                  <input type="date" value={newOrder.orderDate} onChange={e => setNewOrder(f => ({ ...f, orderDate: e.target.value }))} className={inp} />
                </Field>
                <Field label="Order Value">
                  <input type="number" min="0" value={newOrder.orderValue} onChange={e => setNewOrder(f => ({ ...f, orderValue: e.target.value }))} className={inp} placeholder="0" />
                </Field>
              </div>
            )}
          </SectionCard>

          <SectionCard step={2} title="Invoice Info" subtitle="The bill raised against this order">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-4">
              <Field label="Invoice No" required>
                <input value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} className={inp} placeholder="e.g. INV-1234" />
              </Field>
              <Field label="Invoice Date" required>
                <input type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} className={inp} />
              </Field>
              <Field label="Invoice Amount" required>
                <input type="number" min="0" value={form.invoiceAmount} onChange={e => setForm(f => ({ ...f, invoiceAmount: e.target.value }))} className={inp} placeholder="0" />
              </Field>
              <Field label="Expense Category">
                <Select value={form.expenseCategory} onChange={e => setForm(f => ({ ...f, expenseCategory: e.target.value }))}>
                  <option value="">— Select —</option>
                  {categories.map(c => <option key={c.id} value={c.categoryName}>{c.categoryName}</option>)}
                </Select>
              </Field>
              <Field label="Tally Status">
                <Select value={form.tallyStatus} onChange={e => setForm(f => ({ ...f, tallyStatus: e.target.value }))}>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </Select>
              </Field>
              <Field label="Bill Status">
                <Select value={form.billStatus} onChange={e => setForm(f => ({ ...f, billStatus: e.target.value }))}>
                  {BILL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Expense Info">
                <textarea
                  ref={expenseInfoRef}
                  value={form.expenseInfo}
                  onChange={e => { setForm(f => ({ ...f, expenseInfo: e.target.value })); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
                  className={`${inp} min-h-14 py-4 leading-tight resize-none overflow-hidden`}
                  rows={1}
                  placeholder="What is this expense for?"
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard step={3} title="Payment Info" subtitle="Track partial payments made against this invoice"
            action={
              <button type="button" onClick={addPaymentRow}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-all shrink-0">
                <Plus size={13} /> Add Payment
              </button>
            }>
            {payments.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-x-auto mb-3">
                <table className="border-collapse w-full">
                  <thead>
                    <tr className="bg-slate-50">
                      {["Paid Amount", "Paid Date", "Mode", "Cheque/Ref No", "Remarks", ""].map(c => (
                        <th key={c} className="text-left px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap border border-slate-200">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p, idx) => (
                      <tr key={idx}>
                        <td className="border border-slate-200"><input type="number" min="0" value={p.paidAmount} onChange={e => updatePayment(idx, "paidAmount", e.target.value)} className={`${cell} w-24 text-right`} /></td>
                        <td className="border border-slate-200"><input type="date" value={p.paidDate} onChange={e => updatePayment(idx, "paidDate", e.target.value)} className={`${cell} w-32`} /></td>
                        <td className="border border-slate-200">
                          <SelectCell value={p.mode} onChange={e => updatePayment(idx, "mode", e.target.value)} className="w-28">
                            <option value="">—</option>
                            {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                          </SelectCell>
                        </td>
                        <td className="border border-slate-200">
                          {showRefNo(p.mode) ? (
                            <input value={p.referenceNo} onChange={e => updatePayment(idx, "referenceNo", e.target.value)} placeholder="Cheque/UTR No" className={`${cell} w-32`} />
                          ) : <span className="px-1.5 text-xs text-slate-300">—</span>}
                        </td>
                        <td className="border border-slate-200"><input value={p.remarks} onChange={e => updatePayment(idx, "remarks", e.target.value)} className={`${cell} w-32`} /></td>
                        <td className="border border-slate-200 px-1 text-center">
                          <button type="button" onClick={() => removePaymentRow(idx)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-end gap-5 text-sm bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
              <span className="text-slate-500">Total Payable: <b className="text-slate-800">{fmtINR(invoiceAmountNum)}</b></span>
              <span className="text-slate-500">Total Paid: <b className="text-emerald-700">{fmtINR(totalPaidPreview)}</b></span>
              <span className="text-slate-500">Balance: <b className={balancePreview > 0 ? "text-red-600" : "text-emerald-600"}>{fmtINR(balancePreview)}</b></span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${PAYMENT_BADGE[paymentStatusPreview]}`}>{paymentStatusPreview}</span>
            </div>
          </SectionCard>

          <SectionCard step={4} title="Attachments" subtitle="Bill / invoice documents for this invoice">
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
          </SectionCard>
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
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Wallet size={16} className="text-blue-600" />
            </div>
            <h1 className="text-[15px] font-bold text-slate-800 whitespace-nowrap">Payments Track</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canExport && (
              <button onClick={exportExcel}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
                <FileSpreadsheet size={14} className="text-green-600" /> Export
              </button>
            )}
            {canBulk && (
              <div className="relative" ref={moreRef}>
                <button onClick={() => setShowMore(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
                  <Upload size={14} className="text-slate-500" /> Bulk Upload <ChevronDown size={12} className={`transition-transform ${showMore ? "rotate-180" : ""}`} />
                </button>
                {showMore && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg z-30 overflow-hidden">
                    <button onClick={() => { downloadTemplate(); setShowMore(false); }}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                      <Download size={14} className="text-slate-400" /> Download Template
                    </button>
                    <div className="border-t border-slate-100" />
                    <button onClick={() => { setShowBulk(true); setShowMore(false); }}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                      <Upload size={14} className="text-blue-500" /> Upload Excel File
                    </button>
                  </div>
                )}
              </div>
            )}
            {canAdd && (
              <button onClick={openRecordPayment}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
                <IndianRupee size={14} className="text-emerald-600" /> Record Payment
              </button>
            )}
            {canAdd && (
              <button onClick={openAdd}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all">
                <Plus size={15} /> Add Invoice
              </button>
            )}
          </div>
        </div>

        <div className="px-5 sm:px-6 py-3 space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 shadow-sm lg:max-w-md flex-1">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search vendor, invoice, order…"
                className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-slate-400 text-slate-700" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <MultiFilter label="Vendor" options={filterOptions.vendors} selected={vendorFilter} onChange={v => { setVendorFilter(v); setPage(1); }} />
              <MultiFilter label="Bill Status" options={BILL_STATUSES} selected={billStatusFilter} onChange={v => { setBillStatusFilter(v); setPage(1); }} />
              <MultiFilter label="Payment Status" options={PAYMENT_STATUSES} selected={paymentStatusFilter} onChange={v => { setPaymentStatusFilter(v); setPage(1); }} />
              <MultiFilter label="Category" options={categories.map(c => c.categoryName)} selected={categoryFilter} onChange={v => { setCategoryFilter(v); setPage(1); }} />
              <DateRangeFilter dateRange={dateRange} setDateRange={v => { setDateRange(v); setPage(1); }}
                customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={v => { setCustomTo(v); setPage(1); }} />
              {(vendorFilter.length || billStatusFilter.length || paymentStatusFilter.length || categoryFilter.length || dateRange !== "all") ? (
                <button onClick={() => { setVendorFilter([]); setBillStatusFilter([]); setPaymentStatusFilter([]); setCategoryFilter([]); setDateRange("all"); setCustomFrom(""); setCustomTo(""); setPage(1); }}
                  className="inline-flex h-10 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50">
                  <X size={13} /> Clear
                </button>
              ) : null}
            </div>
          </div>
          <span className="inline-block px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-600">
            {filtered.length} invoice{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="px-3 sm:px-4 lg:px-6 pt-4 pb-32 w-full">
        {showBulk && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-700">Bulk Upload Invoices</h3>
              <button onClick={() => { setShowBulk(false); setBulkRows([]); setBulkFile(""); setBulkResult(null); }}
                className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-100 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Step 1 — Download Template</p>
                <p className="text-xs text-slate-400 mb-3">Fill it in Excel — Vendor Name, Invoice No, Invoice Date & Invoice Amount are required.</p>
                <button onClick={downloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
                  <Download size={14} className="text-slate-400" /> Download Template
                </button>
              </div>
              <div className="border border-slate-100 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Step 2 — Choose File</p>
                <p className="text-xs text-slate-400 mb-3">{bulkFile || "No file selected"}{bulkRows.length > 0 ? ` · ${bulkRows.length} row${bulkRows.length !== 1 ? "s" : ""} found` : ""}</p>
                <button onClick={() => bulkRef.current.click()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
                  <Upload size={14} className="text-blue-500" /> Choose Excel File
                </button>
                <input ref={bulkRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkFile} />
              </div>
            </div>
            {bulkRows.length > 0 && (
              <div className="flex items-center justify-end mt-4">
                <button onClick={handleBulkSave} disabled={bulkSaving}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                  {bulkSaving ? "Uploading…" : `Upload ${bulkRows.length} Invoice${bulkRows.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            )}
            {bulkResult && (
              <div className="mt-4">
                <p className="text-xs font-bold text-slate-600 mb-2">{bulkResult.inserted} inserted · {bulkResult.skipped} skipped</p>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50">
                  {bulkResult.details.map((d, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-2.5 text-xs">
                      <span className={`shrink-0 px-1.5 py-0.5 rounded font-bold uppercase text-[10px] ${d.status === "inserted" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                        {d.status}
                      </span>
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-700">{d.row}</span>
                        <span className="text-slate-400"> — {d.reason}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-100 p-16 flex items-center justify-center">
            <p className="text-slate-300 font-bold uppercase tracking-widest text-xs">No invoices recorded yet</p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  {["S.No", "Vendor Name", "Invoice No", "Invoice Date", "Expense Category", "Invoice Amount", "Paid Amount", "Balance Amount", "Bill Status", "Tally Status", "Payment Status", "Actions"].map(c => (
                    <th key={c} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((i, idx) => (
                  <tr key={i.id} onClick={() => setViewInvoice(i)} className="hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="px-3 py-3 text-sm text-slate-500 border border-slate-200 whitespace-nowrap">{(page - 1) * PER_PAGE + idx + 1}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-800 border border-slate-200 whitespace-nowrap">{i.vendorName || "—"}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{i.invoiceNo}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{fmtDate(i.invoiceDate)}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{i.expenseCategory || "—"}</td>
                    <td className="px-3 py-3 text-sm text-slate-800 font-semibold border border-slate-200 text-right whitespace-nowrap">{fmtINR(i.invoiceAmount)}</td>
                    <td className="px-3 py-3 text-sm text-emerald-700 border border-slate-200 text-right whitespace-nowrap">{fmtINR(i.totalPaid)}</td>
                    <td className={`px-3 py-3 text-sm font-semibold border border-slate-200 text-right whitespace-nowrap ${i.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtINR(i.balance)}</td>
                    <td className="px-3 py-3 text-sm border border-slate-200 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{i.billStatus}</span>
                    </td>
                    <td className="px-3 py-3 text-sm border border-slate-200 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${i.tallyStatus === "Yes" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{i.tallyStatus}</span>
                    </td>
                    <td className="px-3 py-3 text-sm border border-slate-200 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${PAYMENT_BADGE[i.paymentStatus]}`}>{i.paymentStatus}</span>
                    </td>
                    <td className="px-3 py-3 border border-slate-200" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setViewInvoice(i)} className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-all"><Eye size={14} /></button>
                        {canEdit && <button onClick={() => openEdit(i)} className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all"><Pencil size={14} /></button>}
                        {canDelete && <button onClick={() => handleDelete(i.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs text-slate-400">{filtered.length} invoice{filtered.length !== 1 ? "s" : ""} · Page {page} of {totalPages}</p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all">‹</button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i2) => {
                      let n;
                      if (totalPages <= 5) n = i2 + 1;
                      else if (page <= 3) n = i2 + 1;
                      else if (page >= totalPages - 2) n = totalPages - 4 + i2;
                      else n = page - 2 + i2;
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

        {/* View modal — full detail + payment history */}
        {viewInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col">
              <div className="bg-linear-to-r from-slate-800 to-slate-700 px-6 py-5 relative shrink-0">
                <button onClick={() => setViewInvoice(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">{viewInvoice.invoiceNo}</p>
                <h2 className="text-lg font-bold text-white leading-tight">{viewInvoice.vendorName || "—"}</h2>
                <p className="text-sm text-slate-300 mt-1">{fmtINR(viewInvoice.invoiceAmount)}</p>
              </div>
              <div className="px-6 py-5 space-y-2.5 text-sm overflow-y-auto">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order Info</p>
                <div className="flex justify-between"><span className="text-slate-400">Site Name</span><span className="text-slate-700 font-medium">{sites.find(s => s.id === viewInvoice.siteId)?.projectName || sites.find(s => s.id === viewInvoice.siteId)?.project_name || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">MSME Number</span><span className="text-slate-700 font-medium">{viewInvoice.msmeNumber || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Company</span><span className="text-slate-700 font-medium">{viewInvoice.companyName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Order No</span><span className="text-slate-700 font-medium">{viewInvoice.orderNo || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Order Date</span><span className="text-slate-700 font-medium">{fmtDate(viewInvoice.orderDate)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Order Value</span><span className="text-slate-700 font-medium">{fmtINR(viewInvoice.orderValue)}</span></div>

                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-2 border-t border-slate-100">Invoice Info</p>
                <div className="flex justify-between"><span className="text-slate-400">Invoice Date</span><span className="text-slate-700 font-medium">{fmtDate(viewInvoice.invoiceDate)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Expense Category</span><span className="text-slate-700 font-medium">{viewInvoice.expenseCategory || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Expense Info</span><span className="text-slate-700 font-medium text-right">{viewInvoice.expenseInfo || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Tally Status</span><span className="text-slate-700 font-medium">{viewInvoice.tallyStatus}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Bill Status</span><span className="text-slate-700 font-medium">{viewInvoice.billStatus}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Paid</span><span className="text-emerald-700 font-medium">{fmtINR(viewInvoice.totalPaid)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Balance</span><span className={`font-medium ${viewInvoice.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtINR(viewInvoice.balance)}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-400">Payment Status</span><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${PAYMENT_BADGE[viewInvoice.paymentStatus]}`}>{viewInvoice.paymentStatus}</span></div>

                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-2 border-t border-slate-100">Payment History</p>
                {!viewInvoice.payments?.length ? (
                  <p className="text-center text-slate-300 text-xs font-bold uppercase tracking-widest py-6">No payments recorded yet</p>
                ) : viewInvoice.payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between border border-slate-100 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{fmtINR(p.paidAmount)}</p>
                      <p className="text-xs text-slate-500">{fmtDate(p.paidDate)} · {p.mode || "—"}{p.referenceNo ? ` · Ref: ${p.referenceNo}` : ""}</p>
                      {p.remarks && <p className="text-xs text-slate-400 mt-0.5">{p.remarks}</p>}
                    </div>
                  </div>
                ))}

                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-2 border-t border-slate-100">Attachments</p>
                {!viewInvoice.documentUrls?.length ? (
                  <p className="text-center text-slate-300 text-xs font-bold uppercase tracking-widest py-6">No attachments</p>
                ) : viewInvoice.documentUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-medium hover:bg-indigo-100 transition-all">
                    <FileText size={14} /> Attachment {i + 1}
                  </a>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 shrink-0">
                {canEdit && (
                  <button onClick={() => { setViewInvoice(null); openEdit(viewInvoice); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all">
                    <Pencil size={13} /> Edit
                  </button>
                )}
                <button onClick={() => setViewInvoice(null)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Record Payment — one lump payment split across an order's invoices */}
        {showRecordPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <h2 className="text-base font-bold text-slate-800">Record Payment</h2>
                <button onClick={() => setShowRecordPayment(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="px-6 py-5 space-y-4 overflow-y-auto">
                <EntitySelect
                  label="Select Order" required
                  value={payOrderId}
                  onChange={e => { setPayOrderId(e.target.value); setPayAllocations({}); }}
                  options={orderOptions} valueKey="id" labelKey="vendorName" subLabelKey="orderNo"
                  placeholder="Select order…"
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Amount" required>
                    <input type="number" min="0" value={payAmount} onChange={e => setPayAmount(e.target.value)} className={inp} placeholder="0" />
                  </Field>
                  <Field label="Paid Date">
                    <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={inp} />
                  </Field>
                  <Field label="Mode">
                    <Select value={payMode} onChange={e => setPayMode(e.target.value)}>
                      <option value="">—</option>
                      {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                    </Select>
                  </Field>
                  {showRefNo(payMode) && (
                    <Field label="Cheque/Ref No">
                      <input value={payRef} onChange={e => setPayRef(e.target.value)} className={inp} placeholder="Cheque/UTR No" />
                    </Field>
                  )}
                </div>
                <Field label="Remarks">
                  <input value={payRemarks} onChange={e => setPayRemarks(e.target.value)} className={inp} placeholder="Optional notes" />
                </Field>

                {payOrderId && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Allocate Across Invoices</p>
                      <button type="button" onClick={autoFillOldestFirst} disabled={!payAmountNum}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
                        Auto-fill (oldest first)
                      </button>
                    </div>
                    {payOrderInvoices.length === 0 ? (
                      <p className="text-center text-slate-300 text-xs font-bold uppercase tracking-widest py-8 border border-dashed border-slate-200 rounded-xl">No outstanding invoices for this order</p>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-x-auto">
                        <table className="border-collapse w-full">
                          <thead>
                            <tr className="bg-slate-50">
                              {["Invoice No", "Invoice Amount", "Already Paid", "Balance", "Allocate"].map(c => (
                                <th key={c} className="text-left px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap border border-slate-200">{c}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {payOrderInvoices.map(inv => (
                              <tr key={inv.id}>
                                <td className={`${td} px-2 py-2 text-xs font-semibold text-slate-700`}>{inv.invoiceNo}</td>
                                <td className={`${td} px-2 py-2 text-xs text-slate-600 text-right`}>{fmtINR(inv.invoiceAmount)}</td>
                                <td className={`${td} px-2 py-2 text-xs text-emerald-700 text-right`}>{fmtINR(inv.totalPaid)}</td>
                                <td className={`${td} px-2 py-2 text-xs text-red-600 font-semibold text-right`}>{fmtINR(inv.balance)}</td>
                                <td className="border border-slate-200">
                                  <input type="number" min="0" max={inv.balance} value={payAllocations[inv.id] || ""}
                                    onChange={e => setPayAllocations(prev => ({ ...prev, [inv.id]: e.target.value }))}
                                    className={`${cell} w-28 text-right`} placeholder="0" />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-4 mt-2 text-sm">
                      <span className="text-slate-500">Allocated: <b className={payAllocatedTotal === payAmountNum && payAmountNum > 0 ? "text-emerald-600" : "text-red-600"}>{fmtINR(payAllocatedTotal)}</b></span>
                      <span className="text-slate-500">of <b className="text-slate-800">{fmtINR(payAmountNum)}</b></span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
                <button onClick={() => setShowRecordPayment(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
                <button onClick={handleRecordPaymentSave} disabled={paySaving}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                  {paySaving ? "Saving…" : "Save Payment"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Multi-select dropdown filter — options list starts empty and fills in as
// matching data appears (Vendor), or is a fixed enum list (Bill/Payment
// Status, Category).
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
