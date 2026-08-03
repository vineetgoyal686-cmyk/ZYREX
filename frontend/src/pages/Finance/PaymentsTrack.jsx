import React, { useState, useEffect, useRef, useMemo } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { Plus, Search, Pencil, Trash2, X, Wallet, FileText, Eye, Download, FileSpreadsheet, Paperclip, Receipt, Upload, ChevronDown } from "lucide-react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 10;

const CATEGORIES     = ["Material", "Service", "Rent", "Fuel", "Transport", "Misc"];
const BILL_STATUSES  = ["Pending", "Verified", "On Hold", "Rejected"];
const PAYMENT_MODES  = ["Bank Transfer", "UPI", "Cheque", "Cash"];

const emptyForm = {
  vendorId: "", vendorName: "", companyId: "",
  orderId: "", orderNumber: "",
  invoiceNumber: "", invoiceDate: "", category: "", description: "", remarks: "",
  billStatus: "Pending", gstType: "intra", document: null,
};
const emptyItem = () => ({
  itemDate: "", inNo: "", dcNo: "", category: "", itemType: "goods", itemName: "", hsnCode: "", unit: "",
  qty: "", basicRate: "", otherCharges: "", igstPct: "", cgstPct: "", sgstPct: "", remarks: "",
});
const emptyPayment = () => ({ amount: "", paymentDate: "", paymentMode: "", referenceNo: "", remarks: "", document: null, documentUrl: "" });

// Mirrors backend computeItemTotals — live preview while typing.
const computeItemTotals = (it) => {
  const qty = Number(it.qty) || 0, rate = Number(it.basicRate) || 0, otherChg = Number(it.otherCharges) || 0;
  const igstPct = Number(it.igstPct) || 0, cgstPct = Number(it.cgstPct) || 0, sgstPct = Number(it.sgstPct) || 0;
  const amount = qty * rate;
  const totalAmount = amount + otherChg;
  const igstAmount = totalAmount * igstPct / 100;
  const cgstAmount = totalAmount * cgstPct / 100;
  const sgstAmount = totalAmount * sgstPct / 100;
  const gstAmount = igstAmount + cgstAmount + sgstAmount;
  const netAmount = totalAmount + gstAmount;
  return { amount, totalAmount, igstAmount, cgstAmount, sgstAmount, gstAmount, netAmount };
};

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{label}</label>
    {children}
  </div>
);
const inp  = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700";
const cell = "w-full px-1.5 py-1.5 text-xs border-0 outline-none focus:bg-indigo-50 rounded text-slate-700 bg-transparent";
const th   = "text-left px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap";
const td   = "border border-slate-200 whitespace-nowrap";

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

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtINR  = (v) => (Number(v) || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num     = (v) => (Number(v) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const DETAIL_COLUMNS = [
  "Date", "In No", "DC No", "Vendor Name", "Category", "Type", "Item", "HSN/SAC", "Unit", "Qty", "Basic Rate",
  "Amount", "Other Charges", "Total Amount", "IGST %", "IGST Amount", "CGST %", "CGST Amount", "SGST %", "SGST Amount",
  "GST Amount", "Net Amount", "Bill Status", "Remarks",
];

export default function PaymentsTrack({ project }) {
  const { canAdd, canEdit, canDelete, canExport } = useModulePermissions("payments_track");

  const [mainTab, setMainTab] = useState("summary"); // "summary" | "detail"

  const [sites, setSites]         = useState([]);
  const [vendors, setVendors]     = useState([]);
  const [companies, setCompanies] = useState([]);
  const [orders, setOrders]       = useState([]);
  const [bills, setBills]         = useState([]);
  const [loading, setLoading]     = useState(true);

  const [search, setSearch]         = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [orderFilter, setOrderFilter]   = useState("");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [page, setPage]             = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState(emptyForm);
  const [hasOrder, setHasOrder]   = useState(false);
  const [items, setItems]         = useState([emptyItem()]);
  const [payments, setPayments]   = useState([]);
  const [editId, setEditId]       = useState(null);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [viewBill, setViewBill]   = useState(null);
  const [paymentsBill, setPaymentsBill] = useState(null);
  const fileRef = useRef();
  const paymentFileRefs = useRef({});

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

  const fetchBills = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!isAllProject && currentSite) params.set("siteId", currentSite.id);
      const res  = await fetch(`${API}/api/finance/bills?${params.toString()}`);
      const data = await res.json();
      setBills(data.bills || []);
    } catch { setBills([]); }
    setLoading(false);
  };

  useEffect(() => { fetchBills(); }, [currentSite, isAllProject]);

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
    setShowModal(true);
  };
  const openEdit = (b) => {
    setForm({
      vendorId: b.vendorId || "", vendorName: b.vendorName || "", companyId: b.companyId || "",
      orderId: b.orderId || "", orderNumber: b.orderNumber || "",
      invoiceNumber: b.invoiceNumber || "", invoiceDate: b.invoiceDate ? String(b.invoiceDate).slice(0, 10) : "",
      category: b.category || "", description: b.description || "", remarks: b.remarks || "",
      billStatus: b.billStatus || "Pending", gstType: b.gstType || "intra", document: null,
    });
    setHasOrder(!!b.orderId);
    setItems(b.items?.length ? b.items.map(it => ({
      itemDate: it.itemDate ? String(it.itemDate).slice(0, 10) : "", inNo: it.inNo, dcNo: it.dcNo,
      category: it.category, itemType: it.itemType || "goods", itemName: it.itemName, hsnCode: it.hsnCode, unit: it.unit,
      qty: it.qty || "", basicRate: it.basicRate || "", otherCharges: it.otherCharges || "",
      igstPct: it.igstPct || "", cgstPct: it.cgstPct || "", sgstPct: it.sgstPct || "", remarks: it.remarks,
    })) : [emptyItem()]);
    setPayments(b.payments?.length ? b.payments.map(p => ({
      amount: p.amount || "", paymentDate: p.paymentDate ? String(p.paymentDate).slice(0, 10) : "",
      paymentMode: p.paymentMode || "", referenceNo: p.referenceNo || "", remarks: p.remarks || "",
      document: null, documentUrl: p.documentUrl || "",
    })) : []);
    setEditId(b.id);
    setShowModal(true);
  };

  const updateItem = (idx, key, value) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: value } : it));
  const addItemRow    = () => setItems(prev => [...prev, emptyItem()]);
  const removeItemRow = (idx) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const updatePayment = (idx, key, value) => setPayments(prev => prev.map((p, i) => i === idx ? { ...p, [key]: value } : p));
  const addPaymentRow    = () => setPayments(prev => [...prev, emptyPayment()]);
  const removePaymentRow = (idx) => setPayments(prev => prev.filter((_, i) => i !== idx));

  const itemsTotal     = useMemo(() => items.reduce((sum, it) => sum + computeItemTotals(it).netAmount, 0), [items]);
  const paymentsTotal  = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const previewOutstanding = Math.max(itemsTotal - paymentsTotal, 0);

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
      fd.append("gstType", form.gstType);
      fd.append("description", form.description);
      fd.append("remarks", form.remarks);
      fd.append("billStatus", form.billStatus);
      fd.append("createdByName", u.name || "");
      fd.append("items", JSON.stringify(items.filter(it => it.itemName.trim() || Number(it.qty) > 0)));
      fd.append("payments", JSON.stringify(payments.map((p, i) => ({ ...p, _idx: i, createdByName: u.name || "" }))));
      payments.forEach((p, i) => { if (p.document) fd.append(`paymentDoc_${i}`, p.document); });
      if (form.document) fd.append("document", form.document);

      const url    = editId ? `${API}/api/finance/bills/${editId}` : `${API}/api/finance/bills`;
      const method = editId ? "PUT" : "POST";
      const res  = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Save failed"); }
      showToast(editId ? "Bill updated" : "Bill added");
      setShowModal(false);
      fetchBills();
    } catch (err) { showToast(err.message || "Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this bill?")) return;
    try {
      const token = localStorage.getItem("bms_token") || "";
      await fetch(`${API}/api/finance/bills/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      showToast("Bill deleted");
      fetchBills();
    } catch { showToast("Failed to delete", "error"); }
  };

  const filtered = bills.filter(b => {
    const s = search.trim().toLowerCase();
    const matchesSearch = !s || [b.billNumber, b.vendorName, b.orderNumber, b.invoiceNumber, b.category, b.description]
      .some(v => String(v || "").toLowerCase().includes(s));
    const matchesVendor = !vendorFilter || b.vendorId === vendorFilter;
    const matchesOrder  = !orderFilter || b.orderId === orderFilter;
    const matchesFrom = !dateFrom || (b.invoiceDate && b.invoiceDate >= dateFrom);
    const matchesTo   = !dateTo   || (b.invoiceDate && b.invoiceDate <= dateTo);
    return matchesSearch && matchesVendor && matchesOrder && matchesFrom && matchesTo;
  });
  const totalBilled      = filtered.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const totalPaid        = filtered.reduce((sum, b) => sum + (Number(b.paid) || 0), 0);
  const totalOutstanding = filtered.reduce((sum, b) => sum + (Number(b.outstanding) || 0), 0);
  const totalPages  = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated   = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Detail = one row per line item, header fields (vendor/status) repeated per row.
  const detailRows = filtered.flatMap(b => (b.items || []).map(it => ({ bill: b, item: it })));

  const exportExcel = () => {
    if (mainTab === "detail") {
      const data = detailRows.map(({ bill, item }) => ({
        "Date": fmtDate(item.itemDate || bill.invoiceDate),
        "In No": item.inNo || "", "DC No": item.dcNo || "", "Vendor Name": bill.vendorName,
        "Category": item.category || bill.category, "Type": item.itemType === "service" ? "Service" : "Goods",
        "Item": item.itemName || "", "HSN/SAC": item.hsnCode || "", "Unit": item.unit || "",
        "Qty": item.qty || 0, "Basic Rate": item.basicRate || 0, "Amount": item.amount || 0,
        "Other Charges": item.otherCharges || 0, "Total Amount": item.totalAmount || 0,
        "IGST %": item.igstPct || 0, "IGST Amount": item.igstAmount || 0, "CGST %": item.cgstPct || 0,
        "CGST Amount": item.cgstAmount || 0, "SGST %": item.sgstPct || 0, "SGST Amount": item.sgstAmount || 0,
        "GST Amount": item.gstAmount || 0, "Net Amount": item.netAmount || 0,
        "Bill Status": bill.billStatus, "Remarks": item.remarks || bill.remarks,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Payments Detail");
      XLSX.writeFile(wb, `payments_track_detail_${isAllProject ? "all_projects" : project}.xlsx`);
    } else {
      const data = filtered.map((b, i) => ({
        "S.No": i + 1, "Bill No": b.billNumber, "Vendor": b.vendorName, "Order No": b.orderNumber || "—",
        "Invoice No": b.invoiceNumber, "Invoice Date": fmtDate(b.invoiceDate), "Category": b.category,
        "Amount": Number(b.amount) || 0, "Paid": Number(b.paid) || 0, "Balance": Number(b.outstanding) || 0,
        "Bill Status": b.billStatus, "Description": b.description, "Remarks": b.remarks,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Payments Summary");
      XLSX.writeFile(wb, `payments_track_summary_${isAllProject ? "all_projects" : project}.xlsx`);
    }
  };

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
                <Wallet size={16} className="text-blue-600" />
              </div>
              <h1 className="text-base font-bold text-slate-800 whitespace-nowrap">Payments Track</h1>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit shrink-0">
              {[{ key: "summary", label: "Summary" }, { key: "detail", label: "Detail" }].map(t => (
                <button key={t.key} type="button" onClick={() => { setMainTab(t.key); setPage(1); }}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    mainTab === t.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}>
                  {t.label}
                </button>
              ))}
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
                <Plus size={15} /> Add Bill
              </button>
            )}
          </div>
        </div>

        <div className="px-3 sm:px-4 lg:px-6 py-3 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-full sm:w-72 shrink-0">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search bill, vendor, invoice, order…"
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
                Order: {bills.find(b => b.orderId === orderFilter)?.orderNumber || orderFilter} <X size={12} />
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
              {filtered.length} bill{filtered.length !== 1 ? "s" : ""}
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
            <p className="text-slate-300 font-bold uppercase tracking-widest text-xs">No bills recorded yet</p>
          </div>
        ) : mainTab === "summary" ? (
          <div className="rounded-lg border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 whitespace-nowrap">Bill No</th>
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
                {paginated.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800 text-sm border border-slate-200 whitespace-nowrap">{b.billNumber}</td>
                    <td className="px-4 py-3 text-sm border border-slate-200 whitespace-nowrap">
                      <button onClick={() => { setVendorFilter(b.vendorId); setPage(1); }}
                        className="text-slate-700 font-medium hover:text-indigo-600 hover:underline transition-colors">{b.vendorName || "—"}</button>
                    </td>
                    <td className="px-4 py-3 text-sm border border-slate-200 whitespace-nowrap">
                      {b.orderNumber ? (
                        <button onClick={() => { setOrderFilter(b.orderId); setPage(1); }}
                          className="text-slate-600 hover:text-indigo-600 hover:underline transition-colors">{b.orderNumber}</button>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{b.invoiceNumber}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 border border-slate-200 whitespace-nowrap">{fmtDate(b.invoiceDate)}</td>
                    <td className="px-4 py-3 text-sm text-slate-800 font-semibold border border-slate-200 text-right whitespace-nowrap">{fmtINR(b.amount)}</td>
                    <td className="px-4 py-3 text-sm text-emerald-700 border border-slate-200 text-right whitespace-nowrap">{fmtINR(b.paid)}</td>
                    <td className={`px-4 py-3 text-sm font-semibold border border-slate-200 text-right whitespace-nowrap ${b.outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtINR(b.outstanding)}</td>
                    <td className="px-4 py-3 text-sm border border-slate-200 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{b.billStatus}</span>
                    </td>
                    <td className="px-3 py-3 border border-slate-200 text-center">
                      {b.documentUrl ? (
                        <a href={b.documentUrl} target="_blank" rel="noreferrer" className="inline-flex p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 transition-all"><FileText size={14} /></a>
                      ) : <span className="text-slate-300"><Paperclip size={13} className="inline" /></span>}
                    </td>
                    <td className="px-3 py-3 border border-slate-200 text-center">
                      <button onClick={() => setPaymentsBill(b)} className="inline-flex p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="Payment history">
                        <Receipt size={14} />
                      </button>
                    </td>
                    <td className="px-3 py-3 border border-slate-200">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setViewBill(b)} className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-all"><Eye size={14} /></button>
                        {canEdit && <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all"><Pencil size={14} /></button>}
                        {canDelete && <button onClick={() => handleDelete(b.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs text-slate-400">{filtered.length} bill{filtered.length !== 1 ? "s" : ""} · Page {page} of {totalPages}</p>
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
        ) : (
          /* ── Detail tab: one row per line item, the full GST sheet ── */
          <div className="rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {DETAIL_COLUMNS.map(c => <th key={c} className={th}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {detailRows.map(({ bill, item }, i) => (
                  <tr key={`${bill.id}-${item.id || i}`} className="hover:bg-slate-50 transition-colors">
                    <td className={`${td} px-2 py-2 text-xs text-slate-600`}>{fmtDate(item.itemDate || bill.invoiceDate)}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600`}>{item.inNo || "—"}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600`}>{item.dcNo || "—"}</td>
                    <td className={`${td} px-2 py-2 text-xs font-semibold text-slate-800`}>{bill.vendorName || "—"}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600`}>{item.category || bill.category || "—"}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600`}>{item.itemType === "service" ? "Service" : "Goods"}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-700`}>{item.itemName || "—"}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600`}>{item.hsnCode || "—"}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600`}>{item.unit || "—"}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600 text-right`}>{item.qty ? num(item.qty) : "—"}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600 text-right`}>{item.basicRate ? num(item.basicRate) : "—"}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-700 text-right`}>{num(item.amount)}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600 text-right`}>{num(item.otherCharges)}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-700 text-right`}>{num(item.totalAmount)}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600 text-right`}>{num(item.igstPct)}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600 text-right`}>{num(item.igstAmount)}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600 text-right`}>{num(item.cgstPct)}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600 text-right`}>{num(item.cgstAmount)}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600 text-right`}>{num(item.sgstPct)}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-600 text-right`}>{num(item.sgstAmount)}</td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-700 text-right`}>{num(item.gstAmount)}</td>
                    <td className={`${td} px-2 py-2 text-xs font-semibold text-slate-800 text-right`}>{num(item.netAmount)}</td>
                    <td className={`${td} px-2 py-2 text-xs`}><span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">{bill.billStatus}</span></td>
                    <td className={`${td} px-2 py-2 text-xs text-slate-500`}>{item.remarks || bill.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* View modal */}
        {viewBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="bg-linear-to-r from-slate-800 to-slate-700 px-6 py-5 relative">
                <button onClick={() => setViewBill(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">{viewBill.billNumber}</p>
                <h2 className="text-lg font-bold text-white leading-tight">{viewBill.vendorName || "No Vendor"}</h2>
                <p className="text-sm text-slate-300 mt-1">{fmtINR(viewBill.amount)}</p>
              </div>
              <div className="px-6 py-5 space-y-2.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Order No</span><span className="text-slate-700 font-medium">{viewBill.orderNumber || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Invoice No</span><span className="text-slate-700 font-medium">{viewBill.invoiceNumber}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Invoice Date</span><span className="text-slate-700 font-medium">{fmtDate(viewBill.invoiceDate)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Paid</span><span className="text-emerald-700 font-medium">{fmtINR(viewBill.paid)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Balance</span><span className={`font-medium ${viewBill.outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtINR(viewBill.outstanding)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Bill Status</span><span className="text-slate-700 font-medium">{viewBill.billStatus}</span></div>
                {viewBill.description && <div className="pt-2 border-t border-slate-100"><span className="text-slate-400">Description</span><p className="text-slate-700 mt-1">{viewBill.description}</p></div>}
                {viewBill.remarks && <div className="pt-2 border-t border-slate-100"><span className="text-slate-400">Remarks</span><p className="text-slate-700 mt-1">{viewBill.remarks}</p></div>}
                {viewBill.documentUrl && (
                  <a href={viewBill.documentUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 mt-3 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-medium hover:bg-indigo-100 transition-all">
                    <Download size={14} /> View / Download Bill PDF
                  </a>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
                {canEdit && (
                  <button onClick={() => { setViewBill(null); openEdit(viewBill); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all">
                    <Pencil size={13} /> Edit
                  </button>
                )}
                <button onClick={() => setViewBill(null)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Payment history popup */}
        {paymentsBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{paymentsBill.billNumber} — {paymentsBill.vendorName}</p>
                  <h2 className="text-base font-bold text-slate-800">Payment History</h2>
                </div>
                <button onClick={() => setPaymentsBill(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="px-6 py-4 overflow-y-auto space-y-2">
                {!paymentsBill.payments?.length ? (
                  <p className="text-center text-slate-300 text-xs font-bold uppercase tracking-widest py-10">No payments recorded yet</p>
                ) : paymentsBill.payments.map(p => (
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
                <span className="text-sm font-semibold text-slate-700">Total Paid: {fmtINR(paymentsBill.paid)}</span>
                <button onClick={() => setPaymentsBill(null)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl xl:max-w-4xl overflow-hidden max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <h2 className="text-base font-bold text-slate-800">{editId ? "Edit Bill" : "Add Bill"}</h2>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="px-6 py-5 space-y-5 overflow-y-auto">
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
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Order made against this bill?</label>
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

                {/* GST type + item grid — always the source of the bill amount */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Items — Amount, GST &amp; Charges</p>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                        {[{ v: "intra", l: "Same State" }, { v: "inter", l: "Other State" }].map(o => (
                          <button key={o.v} type="button" onClick={() => setForm(f => ({ ...f, gstType: o.v }))}
                            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${form.gstType === o.v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                            {o.l}
                          </button>
                        ))}
                      </div>
                      <button type="button" onClick={addItemRow}
                        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                        <Plus size={13} /> Add Row
                      </button>
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="border-collapse">
                      <thead>
                        <tr className="bg-slate-50">
                          {["Date", "In No", "DC No", "Category", "Type", "Item", form.gstType === "inter" ? "SAC/HSN" : "HSN/SAC", "Unit", "Qty", "Rate", "Other Chg",
                            ...(form.gstType === "inter" ? ["IGST%"] : ["CGST%", "SGST%"]),
                            "Amount", "Total Amt", "GST Amt", "Net Amount", "Remarks", ""].map(c => (
                            <th key={c} className="text-left px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap border border-slate-200">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it, idx) => {
                          const t = computeItemTotals(it);
                          return (
                            <tr key={idx}>
                              <td className="border border-slate-200"><input type="date" value={it.itemDate} onChange={e => updateItem(idx, "itemDate", e.target.value)} className={`${cell} w-32`} /></td>
                              <td className="border border-slate-200"><input value={it.inNo} onChange={e => updateItem(idx, "inNo", e.target.value)} className={`${cell} w-16`} /></td>
                              <td className="border border-slate-200"><input value={it.dcNo} onChange={e => updateItem(idx, "dcNo", e.target.value)} className={`${cell} w-16`} /></td>
                              <td className="border border-slate-200">
                                <SelectCell value={it.category} onChange={e => updateItem(idx, "category", e.target.value)} className="w-24">
                                  <option value="">—</option>
                                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </SelectCell>
                              </td>
                              <td className="border border-slate-200">
                                <div className="flex gap-0.5 p-0.5">
                                  {["goods", "service"].map(v => (
                                    <button key={v} type="button" onClick={() => updateItem(idx, "itemType", v)}
                                      className={`px-1.5 py-1 rounded text-[10px] font-semibold ${it.itemType === v ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500"}`}>
                                      {v === "goods" ? "Goods" : "Svc"}
                                    </button>
                                  ))}
                                </div>
                              </td>
                              <td className="border border-slate-200"><input value={it.itemName} onChange={e => updateItem(idx, "itemName", e.target.value)} className={`${cell} w-32`} /></td>
                              <td className="border border-slate-200"><input value={it.hsnCode} onChange={e => updateItem(idx, "hsnCode", e.target.value)} placeholder={it.itemType === "service" ? "SAC" : "HSN"} className={`${cell} w-20`} /></td>
                              <td className="border border-slate-200"><input value={it.unit} onChange={e => updateItem(idx, "unit", e.target.value)} className={`${cell} w-14`} /></td>
                              <td className="border border-slate-200"><input type="number" value={it.qty} onChange={e => updateItem(idx, "qty", e.target.value)} className={`${cell} w-16 text-right`} /></td>
                              <td className="border border-slate-200"><input type="number" value={it.basicRate} onChange={e => updateItem(idx, "basicRate", e.target.value)} className={`${cell} w-20 text-right`} /></td>
                              <td className="border border-slate-200"><input type="number" value={it.otherCharges} onChange={e => updateItem(idx, "otherCharges", e.target.value)} className={`${cell} w-20 text-right`} placeholder="Cartage/Freight" /></td>
                              {form.gstType === "inter" ? (
                                <td className="border border-slate-200"><input type="number" value={it.igstPct} onChange={e => updateItem(idx, "igstPct", e.target.value)} className={`${cell} w-14 text-right`} /></td>
                              ) : (
                                <>
                                  <td className="border border-slate-200"><input type="number" value={it.cgstPct} onChange={e => updateItem(idx, "cgstPct", e.target.value)} className={`${cell} w-14 text-right`} /></td>
                                  <td className="border border-slate-200"><input type="number" value={it.sgstPct} onChange={e => updateItem(idx, "sgstPct", e.target.value)} className={`${cell} w-14 text-right`} /></td>
                                </>
                              )}
                              <td className="border border-slate-200 px-2 py-1.5 text-xs text-slate-500 text-right whitespace-nowrap">{num(t.amount)}</td>
                              <td className="border border-slate-200 px-2 py-1.5 text-xs text-slate-500 text-right whitespace-nowrap">{num(t.totalAmount)}</td>
                              <td className="border border-slate-200 px-2 py-1.5 text-xs text-slate-500 text-right whitespace-nowrap">{num(t.gstAmount)}</td>
                              <td className="border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 text-right whitespace-nowrap">{num(t.netAmount)}</td>
                              <td className="border border-slate-200"><input value={it.remarks} onChange={e => updateItem(idx, "remarks", e.target.value)} className={`${cell} w-24`} /></td>
                              <td className="border border-slate-200 px-1 text-center">
                                <button type="button" onClick={() => removeItemRow(idx)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-right text-sm font-semibold text-slate-700 mt-2">Bill Total: {fmtINR(itemsTotal)}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Description">
                    <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inp} placeholder="What is this bill for?" />
                  </Field>
                  <Field label="Remarks">
                    <input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} className={inp} placeholder="Optional notes" />
                  </Field>
                </div>
                <Field label="Bill / Invoice PDF">
                  <div onClick={() => fileRef.current.click()}
                    className="flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-all border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40">
                    <FileText size={15} className="text-slate-300" />
                    <span className="text-xs truncate text-slate-400">
                      {form.document ? form.document.name : editId ? "Click to replace uploaded bill" : "Click to upload PDF"}
                    </span>
                  </div>
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => { const f = e.target.files[0]; if (f) setForm(prev => ({ ...prev, document: f })); e.target.value = ""; }} />
                </Field>

                {/* Payments */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Record Payment</p>
                    <button type="button" onClick={addPaymentRow}
                      className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                      <Plus size={13} /> Add Payment
                    </button>
                  </div>
                  {payments.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-x-auto mb-2">
                      <table className="border-collapse w-full">
                        <thead>
                          <tr className="bg-slate-50">
                            {["Date", "Amount", "Mode", "Reference No", "Remarks", "Proof", ""].map(c => (
                              <th key={c} className="text-left px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap border border-slate-200">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((p, idx) => (
                            <tr key={idx}>
                              <td className="border border-slate-200"><input type="date" value={p.paymentDate} onChange={e => updatePayment(idx, "paymentDate", e.target.value)} className={`${cell} w-32`} /></td>
                              <td className="border border-slate-200"><input type="number" value={p.amount} onChange={e => updatePayment(idx, "amount", e.target.value)} className={`${cell} w-24 text-right`} /></td>
                              <td className="border border-slate-200">
                                <SelectCell value={p.paymentMode} onChange={e => updatePayment(idx, "paymentMode", e.target.value)} className="w-32">
                                  <option value="">—</option>
                                  {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                </SelectCell>
                              </td>
                              <td className="border border-slate-200"><input value={p.referenceNo} onChange={e => updatePayment(idx, "referenceNo", e.target.value)} placeholder="Cheque/UTR No" className={`${cell} w-28`} /></td>
                              <td className="border border-slate-200"><input value={p.remarks} onChange={e => updatePayment(idx, "remarks", e.target.value)} className={`${cell} w-28`} /></td>
                              <td className="border border-slate-200 px-1 text-center">
                                <button type="button" onClick={() => paymentFileRefs.current[idx]?.click()}
                                  className={`p-1.5 rounded-lg transition-all ${p.document || p.documentUrl ? "text-indigo-600 bg-indigo-50" : "text-slate-300 hover:text-slate-500"}`} title="Upload proof">
                                  <Upload size={13} />
                                </button>
                                <input ref={el => paymentFileRefs.current[idx] = el} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                                  onChange={e => { const f = e.target.files[0]; if (f) updatePayment(idx, "document", f); e.target.value = ""; }} />
                              </td>
                              <td className="border border-slate-200 px-1 text-center">
                                <button type="button" onClick={() => removePaymentRow(idx)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-4 text-sm">
                    <span className="text-slate-500">Paid: <b className="text-emerald-700">{fmtINR(paymentsTotal)}</b></span>
                    <span className="text-slate-500">Balance: <b className={previewOutstanding > 0 ? "text-red-600" : "text-emerald-600"}>{fmtINR(previewOutstanding)}</b></span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
                <button onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                  {saving ? "Saving…" : editId ? "Update Bill" : "Add Bill"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
