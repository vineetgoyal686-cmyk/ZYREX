import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Database, Download, Eye, FileText, IndianRupee, Loader2, Package, Plus, Search, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ViewOrder from "./Procurement/ViewOrder";
import { useModulePermissions } from "../hooks/useModulePermissions";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const LOCAL_ROWS_KEY = "bms_vendor_master_manual_rows";

const formatINR = (value) =>
  (Number(value) || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

const taxableValue = (totals = {}) => {
  const subtotal = Number(totals.subtotal) || 0;
  const discount = Number(totals.totalDiscountAmt) || 0;
  const freight = Number(totals.frightCharges ?? totals.fright) || 0;
  const computed = subtotal - discount + freight;
  if (computed > 0) return computed;
  return Number(totals.taxableAmount) || 0;
};

const columns = [
  "Id",
  "Vendor name",
  "Company Code",
  "Site Code",
  "Order type",
  "Order no",
  "Item",
  "Order Value",
  "Total Value of work",
];

const emptyForm = {
  vendorId: "",
  companyCodes: [],
  state: "",
  city: "",
  siteCode: "",
  orderType: "",
  orderId: "",
  selectedItems: [],
  manualItem: "",
  orderValue: 0,
};

const MASTER_DATA_MODULE_KEY = {
  vendor:   "master_data_vendor",
  products: "master_data_products",
  orders:   "master_data_orders_tab",
  intakes:  "master_data_intakes",
  clauses:  "master_data_clauses",
};

export default function MasterData({ view = "vendor" }) {
  const activeView = view;
  const { canExport } = useModulePermissions(MASTER_DATA_MODULE_KEY[activeView] || "master_data_vendor");
  const [rows, setRows] = useState([]);
  const [manualRows, setManualRows] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LOCAL_ROWS_KEY) || "[]"); } catch { return []; }
  });
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState([]);
  const [entityFilter, setEntityFilter] = useState([]);
  const [orderTypeFilter, setOrderTypeFilter] = useState([]);
  const [itemFilter, setItemFilter] = useState([]);
  const [vendorFilter, setVendorFilter] = useState([]);
  const [valueFilter, setValueFilter] = useState(null); // { mode: "top"|"bottom", count: number }
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [viewVendor, setViewVendor] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);
  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportOpen]);
  const [form, setForm] = useState(emptyForm);
  const bulkRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(LOCAL_ROWS_KEY, JSON.stringify(manualRows));
  }, [manualRows]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [masterRes, vendorRes, itemRes, orderRes] = await Promise.all([
          fetch(`${API}/api/orders/master/vendor-data`),
          fetch(`${API}/api/procurement/vendors`),
          fetch(`${API}/api/procurement/items`),
          fetch(`${API}/api/orders`),
        ]);
        const [masterData, vendorData, itemData, orderData] = await Promise.all([
          masterRes.json(),
          vendorRes.json(),
          itemRes.json(),
          orderRes.json(),
        ]);
        if (alive) {
          setRows(masterData.rows || []);
          setVendors(vendorData.vendors || []);
          setItems(itemData.items || []);
          setOrders(orderData.orders || []);
        }
      } catch {
        if (alive) {
          setRows([]);
          setVendors([]);
          setItems([]);
          setOrders([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const allRows = useMemo(() => [...manualRows, ...rows], [manualRows, rows]);

  const filterOptions = useMemo(() => {
    const sites = new Set();
    const entities = new Set();
    const orderTypes = new Set();
    const itemSet = new Set();
    const vendorSet = new Set();
    allRows.forEach(row => {
      if (row.siteCode) sites.add(row.siteCode);
      if (row.orderType) orderTypes.add(row.orderType);
      if (row.vendorName) vendorSet.add(row.vendorName);
      const codes = Array.isArray(row.companyCodes) ? row.companyCodes : (row.companyCode ? [row.companyCode] : []);
      codes.forEach(c => c && entities.add(c));
      String(row.item || "").split(",").map(s => s.trim()).filter(Boolean).forEach(it => itemSet.add(it));
    });
    return {
      sites: [...sites].sort(),
      entities: [...entities].sort(),
      orderTypes: [...orderTypes].sort(),
      items: [...itemSet].sort(),
      vendors: [...vendorSet].sort(),
    };
  }, [allRows]);

  const vendorGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = allRows.filter(row => {
      if (vendorFilter.length && !vendorFilter.includes(row.vendorName)) return false;
      if (siteFilter.length && !siteFilter.includes(row.siteCode)) return false;
      if (orderTypeFilter.length && !orderTypeFilter.includes(row.orderType)) return false;
      if (entityFilter.length) {
        const codes = Array.isArray(row.companyCodes) ? row.companyCodes : (row.companyCode ? [row.companyCode] : []);
        if (!codes.some(c => entityFilter.includes(c))) return false;
      }
      if (itemFilter.length) {
        const rowItems = String(row.item || "").split(",").map(s => s.trim()).filter(Boolean);
        if (!rowItems.some(it => itemFilter.includes(it))) return false;
      }
      if (!term) return true;
      return [
        row.vendorCode,
        row.vendorName,
        Array.isArray(row.companyCodes) ? row.companyCodes.join(", ") : row.companyCode,
        row.state,
        row.city,
        row.siteCode,
        row.orderType,
        row.orderNo,
        row.item,
        row.vendorEmail,
        row.vendorContactNo,
      ].some(value => String(value || "").toLowerCase().includes(term));
    });

    const grouped = new Map();
    filtered.forEach(row => {
      const key = row.vendorId || row.vendorCode || row.vendorName || "unknown";
      if (!grouped.has(key)) {
        grouped.set(key, {
          vendorCode: row.vendorCode,
          vendorName: row.vendorName,
          companyCodes: row.companyCodes || (row.companyCode ? [row.companyCode] : []),
          state: row.state,
          city: row.city,
          vendorEmail: row.vendorEmail,
          vendorContactNo: row.vendorContactNo,
          totalValue: 0,
          orders: [],
        });
      }
      const group = grouped.get(key);
      if (!row.isPlaceholder) group.totalValue += Number(row.orderValue) || 0;
      group.orders.push(row);
    });

    return [...grouped.values()].map(group => {
      const realOrders = group.orders.filter(o => !o.isPlaceholder);
      const orders = realOrders.length ? realOrders : group.orders;
      return {
        ...group,
        orders: orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
      };
    });
  }, [allRows, search, siteFilter, entityFilter, orderTypeFilter, itemFilter, vendorFilter]);

  const displayedGroups = useMemo(() => {
    if (!valueFilter || !valueFilter.count) return vendorGroups;
    const realOnly = vendorGroups.filter(g => g.orders.some(o => !o.isPlaceholder));
    const sorted = [...realOnly].sort((a, b) =>
      valueFilter.mode === "bottom" ? a.totalValue - b.totalValue : b.totalValue - a.totalValue
    );
    return sorted.slice(0, Math.max(1, valueFilter.count));
  }, [vendorGroups, valueFilter]);

  const totalWorkValue = displayedGroups.reduce((sum, group) => sum + group.totalValue, 0);
  const orderCount = displayedGroups.reduce((sum, group) => sum + group.orders.filter(o => !o.isPlaceholder).length, 0);

  const orderStats = useMemo(() => {
    let poCount = 0, woCount = 0, poValue = 0, woValue = 0;
    displayedGroups.forEach(group => {
      group.orders.filter(o => !o.isPlaceholder).forEach(o => {
        const t = String(o.orderType || "").toLowerCase();
        const value = Number(o.orderValue) || 0;
        const isWO = /wo|work|sitc/.test(t);
        const isPO = /po|purchase|supply/.test(t);
        if (isWO) { woCount += 1; woValue += value; }
        else if (isPO) { poCount += 1; poValue += value; }
      });
    });
    return { poCount, woCount, poValue, woValue };
  }, [displayedGroups]);

  const selectedVendor = vendors.find(v => v.id === form.vendorId);
  const selectedOrder = orders.find(o => o.id === form.orderId);
  const availableOrders = orders.filter(order => {
    if (!form.vendorId) return true;
    return order.vendor_id === form.vendorId || order.vendors?.id === form.vendorId;
  });
  const itemOptions = orderItems.length > 0 ? orderItems : items.map(i => ({ id: i.id, name: i.materialName }));

  const updateVendor = (vendorId) => {
    const vendor = vendors.find(v => v.id === vendorId);
    setForm(prev => ({
      ...prev,
      vendorId,
      state: vendor?.bankState || vendor?.state || "",
      city: vendor?.bankCity || vendor?.city || "",
      companyCodes: vendor?.companyCodes || [],
      orderId: "",
      orderType: "",
      siteCode: "",
      selectedItems: [],
      manualItem: "",
      orderValue: 0,
    }));
    setOrderItems([]);
  };

  const updateOrder = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    const site = order?.sites || order?.snapshot?.site || {};
    setForm(prev => ({
      ...prev,
      orderId,
      orderType: order?.order_type || "",
      siteCode: site.site_code || site.siteCode || "",
      orderValue: taxableValue(order?.totals || {}),
      selectedItems: [],
      manualItem: "",
    }));

    if (!orderId) {
      setOrderItems([]);
      return;
    }

    try {
      const res = await fetch(`${API}/api/orders/${orderId}`);
      const data = await res.json();
      const list = (data.items || []).map(row => ({
        id: `${row.id || row.item_id || row.description}`,
        name: row.items?.material_name || row.description || "",
      })).filter(row => row.name);
      setOrderItems([...new Map(list.map(row => [row.name, row])).values()]);
    } catch {
      setOrderItems([]);
    }
  };

  const saveVendorRow = () => {
    if (!selectedVendor || !selectedOrder) return;
    const site = selectedOrder.sites || selectedOrder.snapshot?.site || {};
    const pickedItems = itemOptions
      .filter(item => form.selectedItems.includes(item.id))
      .map(item => item.name);
    const manualItems = form.manualItem.split(",").map(x => x.trim()).filter(Boolean);
    const row = {
      manual: true,
      orderId: selectedOrder.id,
      vendorId: selectedVendor.id,
      vendorCode: selectedVendor.vendorCode || "",
      vendorName: selectedVendor.vendorName || "",
      companyCodes: form.companyCodes,
      state: form.state,
      city: form.city,
      siteCode: form.siteCode || site.site_code || site.siteCode || "",
      orderType: form.orderType || selectedOrder.order_type || "",
      orderNo: selectedOrder.order_number || "",
      item: [...new Set([...pickedItems, ...manualItems])].join(", "),
      orderValue: Number(form.orderValue) || 0,
      vendorEmail: selectedVendor.email || "",
      vendorContactNo: selectedVendor.mobile || "",
      createdAt: new Date().toISOString(),
    };
    setManualRows(prev => [row, ...prev]);
    setShowAdd(false);
    setForm(emptyForm);
    setOrderItems([]);
  };

  const exportVendorMaster = () => {
    const exportRows = vendorGroups.flatMap(group =>
      group.orders.map((order, index) => ({
        Id: index === 0 ? group.vendorCode : "",
        "Vendor name": index === 0 ? group.vendorName : "",
        "Company Code": index === 0 ? (group.companyCodes || []).filter(Boolean).join(", ") : "",
        State: index === 0 ? group.state : "",
        City: index === 0 ? group.city : "",
        "Site Code": order.siteCode || "",
        "Order type": order.orderType || "",
        "Order no": order.orderNo || "",
        Item: order.item || "",
        "Order Value": Number(order.orderValue) || 0,
        "Total Value of work": index === 0 ? Number(group.totalValue) || 0 : "",
        "Vendor Email": index === 0 ? group.vendorEmail : "",
        "Vendor contact No": index === 0 ? group.vendorContactNo : "",
      }))
    );
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendor Master data");
    XLSX.writeFile(wb, "vendor_master_data.xlsx");
  };

  const exportVendorMasterPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Vendor Master Data", 14, 15);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, 14, 21);
    doc.setTextColor(0);

    const rows = vendorGroups.flatMap(group =>
      group.orders.map((order, index) => [
        index === 0 ? group.vendorCode : "",
        index === 0 ? group.vendorName : "",
        index === 0 ? (group.companyCodes || []).filter(Boolean).join(", ") : "",
        order.siteCode || "",
        order.orderType || "",
        order.orderNo || "",
        order.item || "",
        order.isPlaceholder || order.orderValue == null ? "NA" : formatINR(order.orderValue),
        index === 0 ? (group.totalValue > 0 ? formatINR(group.totalValue) : "NA") : "",
      ])
    );

    autoTable(doc, {
      startY: 26,
      head: [["ID", "Vendor Name", "Company Code", "Site Code", "Order Type", "Order No", "Item", "Order Value", "Total Work Value"]],
      body: rows,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [243, 243, 245], textColor: [80, 80, 100], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 250, 252] },
      columnStyles: { 7: { halign: "right" }, 8: { halign: "right", textColor: [5, 150, 105] } },
    });

    doc.save("vendor_master_data.pdf");
  };

  const handleBulkUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      const imported = data.map(row => ({
        manual: true,
        orderId: "",
        vendorId: row.Id || row["Vendor ID"] || row["Vendor Code"] || "",
        vendorCode: row.Id || row["Vendor ID"] || row["Vendor Code"] || "",
        vendorName: row["Vendor name"] || row["Vendor Name"] || "",
        companyCodes: String(row["Company Code"] || row["Company Codes"] || "").split(",").map(x => x.trim()).filter(Boolean),
        state: row.State || "",
        city: row.City || "",
        siteCode: row["Site Code"] || "",
        orderType: row["Order type"] || row["Order Type"] || "",
        orderNo: row["Order no"] || row["Order No"] || "",
        item: row.Item || "",
        orderValue: Number(row["Order Value"]) || 0,
        vendorEmail: row["Vendor Email"] || "",
        vendorContactNo: row["Vendor contact No"] || row["Vendor Contact No"] || "",
        createdAt: new Date().toISOString(),
      })).filter(row => row.vendorName || row.orderNo);
      setManualRows(prev => [...imported, ...prev]);
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
  };

  return (
    <div className="text-slate-800 pb-16">
      <style>{`
        .master-data-scroll { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
        .master-data-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .master-data-scroll::-webkit-scrollbar-track { background: transparent; }
        .master-data-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
        .master-data-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .field-input {
          min-height: 40px;
          width: 100%;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          padding: 8px 10px;
          font-size: 13px;
          color: #334155;
          outline: none;
        }
        .field-input:focus {
          border-color: #94a3b8;
          box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.18);
        }
      `}</style>
      <div className="space-y-3">
        {/* ── Header ── */}
        <div className="bg-white border border-slate-300 rounded-md shadow-sm px-5 py-3">
          {/* Row 1: Title + Export */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-900">Vendor Master Data</h1>
            </div>
            {activeView === "vendor" && canExport && (
              <div className="relative shrink-0" ref={exportRef}>
                <button
                  onClick={() => setExportOpen(o => !o)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Download size={13} /> Export <ChevronDown size={11} className={`transition-transform ${exportOpen ? "rotate-180" : ""}`} />
                </button>
                {exportOpen && (
                  <div className="absolute right-0 mt-1 z-50 w-40 rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden">
                    <button
                      onClick={() => { exportVendorMaster(); setExportOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <FileText size={13} className="text-emerald-600" /> Excel (.xlsx)
                    </button>
                    <button
                      onClick={() => { exportVendorMasterPDF(); setExportOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 border-t border-slate-100"
                    >
                      <FileText size={13} className="text-red-500" /> PDF
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Row 2: Stats bar */}
          {activeView === "vendor" && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-6">
              {/* Vendors */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Vendors</p>
                <p className="text-xl font-black text-slate-900 leading-tight">{displayedGroups.length}</p>
              </div>

              <div className="w-px h-8 bg-slate-200 shrink-0" />

              {/* Orders table */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                  Total Order <span className="text-slate-800 font-black text-sm ml-1">{orderCount}</span>
                </p>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200" style={{background: "rgb(243,243,245)"}}>
                        <th className="text-[8px] font-bold uppercase text-slate-500 text-left px-3 py-1 border-r border-slate-200">Type</th>
                        <th className="text-[8px] font-bold uppercase text-slate-500 text-center px-3 py-1 border-r border-slate-200">Count</th>
                        <th className="text-[8px] font-bold uppercase text-slate-500 text-right px-3 py-1">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100 bg-white">
                        <td className="font-black text-slate-700 px-3 py-1 border-r border-slate-100">PO</td>
                        <td className="font-black text-slate-800 text-center px-3 py-1 border-r border-slate-100">{orderStats.poCount}</td>
                        <td className="font-semibold text-slate-600 text-right whitespace-nowrap px-3 py-1">{formatINR(orderStats.poValue)}</td>
                      </tr>
                      <tr className="bg-white">
                        <td className="font-black text-slate-700 px-3 py-1 border-r border-slate-100">WO</td>
                        <td className="font-black text-slate-800 text-center px-3 py-1 border-r border-slate-100">{orderStats.woCount}</td>
                        <td className="font-semibold text-slate-600 text-right whitespace-nowrap px-3 py-1">{formatINR(orderStats.woValue)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="w-px h-8 bg-slate-200 shrink-0" />

              {/* Work Value Done */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Work Value Done</p>
                <p className="text-xl font-black text-emerald-600 leading-tight whitespace-nowrap">{formatINR(totalWorkValue)}</p>
              </div>
            </div>
          )}
        </div>

        {activeView === "vendor" ? (
          <>

            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 shadow-sm lg:max-w-md flex-1">
                <Search size={16} className="text-slate-400 shrink-0" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor, site, order..." className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MultiFilter label="Vendor" options={filterOptions.vendors} selected={vendorFilter} onChange={setVendorFilter} />
                <MultiFilter label="Site" options={filterOptions.sites} selected={siteFilter} onChange={setSiteFilter} />
                <MultiFilter label="Entity" options={filterOptions.entities} selected={entityFilter} onChange={setEntityFilter} />
                <MultiFilter label="Order Type" options={filterOptions.orderTypes} selected={orderTypeFilter} onChange={setOrderTypeFilter} />
                <MultiFilter label="Item" options={filterOptions.items} selected={itemFilter} onChange={setItemFilter} />
                <ValueFilter value={valueFilter} onChange={setValueFilter} />
                {(vendorFilter.length || siteFilter.length || entityFilter.length || orderTypeFilter.length || itemFilter.length || valueFilter) ? (
                  <button onClick={() => { setVendorFilter([]); setSiteFilter([]); setEntityFilter([]); setOrderTypeFilter([]); setItemFilter([]); setValueFilter(null); }} className="inline-flex h-10 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50">
                    <X size={13} /> Clear
                  </button>
                ) : null}
              </div>
            </div>

            <VendorTable loading={loading} vendorGroups={displayedGroups} setSelectedOrderId={setSelectedOrderId} setViewVendor={setViewVendor} />
          </>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-bold text-slate-400">
            Item Master data will be added next.
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-4xl rounded-md bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-black text-slate-900">Add Vendor Master Data</h2>
                <p className="text-xs text-slate-500">Select vendor and order, then choose or type items.</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="grid h-9 w-9 place-items-center rounded-md text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Vendor name">
                <input list="vendor-master-vendors" value={selectedVendor?.vendorName || ""} onChange={e => {
                  const vendor = vendors.find(v => v.vendorName === e.target.value);
                  updateVendor(vendor?.id || "");
                }} placeholder="Search vendor..." className="field-input" />
                <datalist id="vendor-master-vendors">
                  {vendors.map(v => <option key={v.id} value={v.vendorName} />)}
                </datalist>
              </Field>
              <Field label="Company Code">
                <select multiple value={form.companyCodes} onChange={e => setForm(f => ({ ...f, companyCodes: Array.from(e.target.selectedOptions).map(o => o.value) }))} className="field-input min-h-[76px]">
                  {(selectedVendor?.companyCodes || []).map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              </Field>
              <Field label="State"><input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className="field-input" /></Field>
              <Field label="City"><input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="field-input" /></Field>
              <Field label="Site Code">
                <select value={form.siteCode} onChange={e => setForm(f => ({ ...f, siteCode: e.target.value }))} className="field-input">
                  <option value="">Select site</option>
                  {[...new Set(orders.map(o => o.snapshot?.site?.siteCode).filter(Boolean))].map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              </Field>
              <Field label="Order type">
                <select value={form.orderType} onChange={e => setForm(f => ({ ...f, orderType: e.target.value }))} className="field-input">
                  <option value="">Select type</option>
                  <option value="Supply">Supply</option>
                  <option value="SITC">SITC</option>
                </select>
              </Field>
              <Field label="Order no">
                <select value={form.orderId} onChange={e => updateOrder(e.target.value)} className="field-input">
                  <option value="">Select order</option>
                  {availableOrders.map(order => <option key={order.id} value={order.id}>{order.order_number}</option>)}
                </select>
              </Field>
              <Field label="Item">
                <select multiple value={form.selectedItems} onChange={e => setForm(f => ({ ...f, selectedItems: Array.from(e.target.selectedOptions).map(o => o.value) }))} className="field-input min-h-[92px]">
                  {itemOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <input value={form.manualItem} onChange={e => setForm(f => ({ ...f, manualItem: e.target.value }))} placeholder="Manual item, comma separated" className="field-input mt-2" />
              </Field>
              <Field label="Order Value">
                <input value={formatINR(form.orderValue)} readOnly className="field-input bg-slate-50 font-bold text-slate-900" />
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button onClick={() => setShowAdd(false)} className="h-10 rounded-md border border-slate-200 px-4 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button disabled={!form.vendorId || !form.orderId} onClick={saveVendorRow} className="h-10 rounded-md bg-slate-900 px-4 text-xs font-bold text-white disabled:opacity-40">Add Row</button>
            </div>
          </div>
        </div>
      )}

      {viewVendor && (
        <div className="fixed inset-0 z-[1250] flex justify-end bg-slate-950/35">
          <button className="flex-1 cursor-default" onClick={() => setViewVendor(null)} aria-label="Close vendor view" />
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Vendor overall view</p>
                <h2 className="text-lg font-black text-slate-900">{viewVendor.vendorName || "Vendor"}</h2>
              </div>
              <button onClick={() => setViewVendor(null)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100">
                <X size={17} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-3">
                <InfoBox label="Vendor Code" value={viewVendor.vendorCode || "-"} />
                <InfoBox label="Total Work Value" value={formatINR(viewVendor.totalValue)} strong />
                <InfoBox label="Company Code" value={(viewVendor.companyCodes || []).join(", ") || "-"} wide />
                <InfoBox label="State" value={viewVendor.state || "-"} />
                <InfoBox label="City" value={viewVendor.city || "-"} />
                <InfoBox label="Email" value={viewVendor.vendorEmail || "-"} wide />
                <InfoBox label="Contact No" value={viewVendor.vendorContactNo || "-"} wide />
              </div>

              <div className="rounded-md border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Orders</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {viewVendor.orders.map((order, index) => (
                    <div key={`${order.orderId || order.orderNo}-${index}`} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <button
                            disabled={!order.orderId}
                            onClick={() => order.orderId && setSelectedOrderId(order.orderId)}
                            className="text-left font-mono text-xs font-black text-indigo-700 underline decoration-indigo-200 underline-offset-4 disabled:no-underline disabled:text-slate-500"
                          >
                            {order.orderNo || "NA"}
                          </button>
                          <p className="mt-1 text-xs text-slate-500">{order.siteCode || "NA"} / {order.orderType || "NA"}</p>
                        </div>
                        <p className="text-sm font-black text-slate-900">{order.isPlaceholder || order.orderValue == null ? "NA" : formatINR(order.orderValue)}</p>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{order.item || "NA"}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {selectedOrderId && (
        <div className="fixed inset-0 z-[1200] flex justify-end bg-slate-950/35">
          <button className="flex-1 cursor-default" onClick={() => setSelectedOrderId(null)} aria-label="Close preview" />
          <aside className="h-full w-full max-w-[1180px] overflow-y-auto bg-slate-50 shadow-2xl">
            <div className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Order preview</p>
                <p className="text-sm font-bold text-slate-800">Vendor master data</p>
              </div>
              <button onClick={() => setSelectedOrderId(null)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100" aria-label="Close order preview">
                <X size={17} />
              </button>
            </div>
            <ViewOrder orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />
          </aside>
        </div>
      )}
    </div>
  );
}

function VendorTable({ loading, vendorGroups, setSelectedOrderId, setViewVendor }) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="master-data-scroll overflow-x-auto">
        <table className="min-w-[900px] w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              {columns.map((label, i) => (
                <th key={label} className={`border border-slate-200 px-3 py-3 text-left text-[11px] font-black uppercase tracking-wide ${
                  i === 0 ? "w-[8%]" :          // Id
                  i === 1 ? "w-[18%]" :         // Vendor name
                  i === 2 ? "w-[9%]" :          // Company Code
                  i === 3 ? "w-[8%]" :          // Site Code
                  i === 4 ? "w-[9%]" :          // Order type
                  i === 5 ? "w-[16%]" :         // Order no
                  i === 6 ? "w-[12%]" :         // Item
                  i === 7 ? "w-[10%] text-right" : // Order Value
                  "w-[10%] text-right"           // Total Value of work
                }`}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="h-40 text-center text-slate-400"><Loader2 className="mx-auto mb-2 animate-spin" size={22} />Loading vendor master data...</td></tr>
            ) : vendorGroups.length === 0 ? (
              <tr><td colSpan={columns.length} className="h-40 text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-300">No vendor master data found</td></tr>
            ) : (
              vendorGroups.flatMap(group => {
                const orders = group.orders.length ? group.orders : [{}];
                return orders.map((order, index) => (
                  <tr key={`${group.vendorCode || group.vendorName}-${order.orderId || order.orderNo || index}`} className="hover:bg-slate-50">
                    {index === 0 && (
                      <>
                        <td rowSpan={orders.length} className="align-top border border-slate-200 px-3 py-3 font-mono text-xs font-bold text-slate-700">{group.vendorCode || "-"}</td>
                        <td rowSpan={orders.length} className="align-top border border-slate-200 px-3 py-3">
                          <button onClick={() => setViewVendor(group)} className="text-left font-bold text-slate-900 hover:text-indigo-700 hover:underline decoration-indigo-200 underline-offset-4 transition-colors">
                            {group.vendorName || "-"}
                          </button>
                        </td>
                        <td rowSpan={orders.length} className="align-top border border-slate-200 px-3 py-3 font-mono text-xs text-slate-700">{(group.companyCodes || []).filter(Boolean).join(", ") || <NA />}</td>
                      </>
                    )}
                    <td className="border border-slate-200 px-3 py-3 font-mono text-xs text-slate-700">{order.siteCode || <NA />}</td>
                    <td className="border border-slate-200 px-3 py-3 text-slate-700">{order.orderType || <NA />}</td>
                    <td className="border border-slate-200 px-3 py-3">
                      {order.orderId ? <button onClick={() => setSelectedOrderId(order.orderId)} className="text-left font-mono text-xs font-black text-indigo-700 underline decoration-indigo-200 underline-offset-4 hover:text-indigo-900">{order.orderNo || <NA />}</button> : (order.orderNo || <NA />)}
                    </td>
                    <td className="border border-slate-200 px-3 py-3 text-slate-700">{order.item || <NA />}</td>
                    <td className="border border-slate-200 px-3 py-3 text-right font-bold text-slate-900">{order.isPlaceholder || order.orderValue == null ? <NA /> : formatINR(order.orderValue)}</td>
                    {index === 0 && (
                      <td rowSpan={orders.length} className="align-top border border-slate-200 px-3 py-3 text-right font-black text-emerald-700">{group.totalValue > 0 ? formatINR(group.totalValue) : <NA />}</td>
                    )}
                  </tr>
                ));
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NA() {
  return <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">NA</span>;
}

function ValueFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [customCount, setCustomCount] = useState(value?.count ?? 5);
  const [customMode, setCustomMode] = useState(value?.mode ?? "top");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const apply = (mode, count) => { onChange({ mode, count }); setOpen(false); };

  const label = value
    ? `${value.mode === "bottom" ? "Bottom" : "Top"} ${value.count}`
    : "Value";

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-xs font-bold shadow-sm transition ${value ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
        <span>{label}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-md border border-slate-200 bg-white shadow-2xl">
          <div className="p-2 border-b border-slate-100">
            <p className="px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Presets</p>
            <button onClick={() => apply("top", 5)}
              className="w-full text-left px-2 py-2 rounded-md text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700">
              Top 5 highest value
            </button>
            <button onClick={() => apply("bottom", 5)}
              className="w-full text-left px-2 py-2 rounded-md text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700">
              Top 5 lowest value
            </button>
          </div>
          <div className="p-3 border-b border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Custom</p>
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={customCount}
                onChange={e => setCustomCount(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 h-8 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-indigo-400" />
              <select value={customMode} onChange={e => setCustomMode(e.target.value)}
                className="flex-1 h-8 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-indigo-400">
                <option value="top">Highest value</option>
                <option value="bottom">Lowest value</option>
              </select>
              <button onClick={() => apply(customMode, customCount)}
                className="h-8 rounded-md bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700">
                Apply
              </button>
            </div>
          </div>
          {value && (
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] font-bold text-slate-500">{label} active</span>
              <button onClick={() => { onChange(null); setOpen(false); }} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
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

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function InfoBox({ label, value, strong = false, wide = false }) {
  return (
    <div className={`${wide ? "col-span-2" : ""} rounded-md border border-slate-200 bg-slate-50 p-3`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-1 break-words text-sm ${strong ? "font-black text-emerald-700" : "font-bold text-slate-800"}`}>{value}</p>
    </div>
  );
}

function Metric({ label, value, icon: Icon, wide = false }) {
  return (
    <div className={`${wide ? "col-span-2 lg:col-span-1" : ""} rounded-md border border-slate-200 bg-white p-4 shadow-sm`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-1 truncate text-lg font-black text-slate-900">{value}</p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-700">
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}
