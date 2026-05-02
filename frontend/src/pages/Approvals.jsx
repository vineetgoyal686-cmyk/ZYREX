import React, { useEffect, useMemo, useState } from "react";
import { 
  FileText, Check, X, AlertCircle, RefreshCw, 
  ChevronDown, Building2, CircleCheck, CircleX, RotateCcw,
  ClipboardList, Clock, IndianRupee, Search, Undo2, User
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const cardCls = "rounded-lg border border-slate-200 bg-white shadow-sm";
const statusCls = {
  Review: "bg-amber-50 text-amber-700 border-amber-200",
  "Pending Issue": "bg-orange-50 text-orange-700 border-orange-200",
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  in_review: "bg-purple-50 text-purple-700 border-purple-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const orderTitle = (order) => order.order_number || order.snapshot?.orderNumber || `Order ${order.id?.slice?.(0, 8) || ""}`;
const intakeTitle = (intake) => intake.intake_number || `Intake ${intake.id?.slice?.(0, 8) || ""}`;
const money = (value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function Approvals() {
  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace("#tab=", "");
    return ["intake", "orders", "payments"].includes(hash) ? hash : "intake";
  });
  const [orderSubTab, setOrderSubTab] = useState("issued");
  const [orders, setOrders] = useState([]);
  const [intakes, setIntakes] = useState([]);
  const [amendments, setAmendments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // request_id being processed
  const [search, setSearch] = useState("");
  const [canManageAmend, setCanManageAmend] = useState(false);
  // Amendment-specific filters + PDF preview state
  const [amendSiteFilter, setAmendSiteFilter] = useState("");
  const [amendCompanyFilter, setAmendCompanyFilter] = useState("");
  const [pdfPreviewId, setPdfPreviewId] = useState(null);

  const load = async (isInitial = false) => {
    if (isInitial) {
      const cached = localStorage.getItem("last_approvals_data");
      if (cached) {
        try {
          const d = JSON.parse(cached);
          setOrders(d.orders || []);
          setIntakes(d.intakes || []);
          setAmendments(d.amendments || []);
          setCanManageAmend(!!d.canManage);
          setLoading(false); // Only stop loading if we have cached data
        } catch(e){
          setLoading(true);
        }
      } else {
        setLoading(true); // No cache, must wait for API
      }
    }

    try {
      const token = localStorage.getItem("bms_token") || "";
      const [ordersRes, intakesRes, amendRes, capRes] = await Promise.all([
        fetch(`${API}/api/orders`),
        fetch(`${API}/api/intakes`),
        fetch(`${API}/api/amendments/requests`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API}/api/amendments/can-manage`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
      ]);
      const [ordersData, intakesData, amendData, capData] = await Promise.all([
        ordersRes.json().catch(() => ({})),
        intakesRes.json().catch(() => ({})),
        amendRes.json().catch(() => ({})),
        capRes.json().catch(() => ({})),
      ]);
      
      const ords = ordersData.orders || [];
      const ints = intakesData.intakes || [];
      const amds = amendData.requests || [];
      const caps = !!capData.canManage;

      setOrders(ords);
      setIntakes(ints);
      setAmendments(amds);
      setCanManageAmend(caps);
      
      // 2. Update Cache for next time
      localStorage.setItem("last_approvals_data", JSON.stringify({
        orders: ords, intakes: ints, amendments: amds, canManage: caps
      }));
    } catch {
      // Silent fail if background sync fails
    }
    setLoading(false);
  };

  useEffect(() => {
    window.location.hash = `tab=${activeTab}`;
  }, [activeTab]);

  useEffect(() => { 
    load(true); // Load with cache first
    const interval = setInterval(() => load(), 10000); 
    return () => clearInterval(interval);
  }, []);

  const handleOrderAction = async (orderId, action) => {
    setActionLoading(orderId);
    try {
      const res = await fetch(`${API}/api/orders/${orderId}`, {
        method: "PUT",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem("bms_token") || ""}` },
        body: JSON.stringify({ data: JSON.stringify({ mainData: { status: action } }) })
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        load();
      } else {
        alert(data.error || "Action failed");
      }
    } catch (err) {
      console.error(err);
      alert("Network error. Check console.");
    }
    setActionLoading(null);
  };

  const handleIntakeAction = async (intakeId, action) => {
    setActionLoading(intakeId);
    try {
      const endpoint = action === "Approved" ? "approve" : "reject";
      const res = await fetch(`${API}/api/intakes/${intakeId}/${endpoint}`, {
        method: "PATCH",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem("bms_token") || ""}` },
        body: JSON.stringify({ 
          approved_by: JSON.parse(localStorage.getItem("bms_user") || "{}").name,
          rejected_by: JSON.parse(localStorage.getItem("bms_user") || "{}").name,
          reject_reason: action === "Rejected" ? "Rejected via dashboard" : ""
        })
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        load();
      } else {
        alert(data.error || "Action failed");
      }
    } catch (err) {
      console.error(err);
      alert("Network error. Check console.");
    }
    setActionLoading(null);
  };

  const handleAmendAction = async (request_id, action) => {
    setActionLoading(request_id);
    try {
      const res = await fetch(`${API}/api/amendments/action`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem("bms_token") || ""}` },
        body: JSON.stringify({ request_id, action })
      });
      const data = await res.json();
      if (data.success) {
        load(); // Refresh list
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
    }
    setActionLoading(null);
  };

  const pendingOrders = useMemo(() => (
    orders.filter((o) => ["Pending Issue", "To Issue"].includes(o.status))
  ), [orders]);

  const pendingIntakes = useMemo(() => (
    intakes.filter((i) => ["submitted", "in_review"].includes(i.status))
  ), [intakes]);

  const tabs = [
    { key: "intake", label: "Intake", icon: FileText, count: pendingIntakes.length },
    { key: "orders", label: "Orders", icon: ClipboardList, count: pendingOrders.length + amendments.length },
    { key: "payments", label: "Payments", icon: IndianRupee, count: 0 },
  ];

  const query = search.trim().toLowerCase();
  const filteredOrders = pendingOrders.filter((o) => {
    const text = [
      orderTitle(o),
      o.status,
      o.snapshot?.vendor?.vendorName,
      o.vendors?.vendor_name,
      o.snapshot?.site?.siteCode,
      o.sites?.site_code,
      o.made_by,
    ].filter(Boolean).join(" ").toLowerCase();
    return !query || text.includes(query);
  });
  const filteredIntakes = pendingIntakes.filter((i) => {
    const text = [intakeTitle(i), i.name, i.site_name, i.requisition_by, i.status].filter(Boolean).join(" ").toLowerCase();
    return !query || text.includes(query);
  });

  const [amendView, setAmendView] = useState("tile"); // 'table' or 'tile'
  const [orderView, setOrderView] = useState("tile"); // 'table' or 'tile'

  return (
    <div className="min-h-screen bg-[#f8fafc] p-3 sm:p-4 lg:p-6 pb-20">
      {/* Simple Loading Spinner */}
      {loading && orders.length === 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f8fafc]">
          <div className="smooth-loader w-10 h-10 text-cyan-600"></div>
        </div>
      )}

      {/* Syncing Circle */}
      {loading && orders.length > 0 && (
        <div className="fixed top-4 right-4 z-[60]">
          <div className="smooth-loader w-4 h-4 text-cyan-500"></div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className={`${cardCls} mb-4 p-2`}>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const on = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${on ? "bg-cyan-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  <Icon size={15} />
                  {tab.label}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${on ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>{tab.count}</span>
                </button>
              );
            })}
          </div>
          <div className="relative min-w-0 md:w-80">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requests..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
            />
          </div>
        </div>
      </div>

      {activeTab === "orders" ? (
        <div className="flex flex-col gap-4">
          {/* Orders Sub-tabs */}
          {/* Orders Sub-tabs & View Toggle */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-0.5 px-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOrderSubTab("issued")}
                className={`px-4 py-2 text-sm font-bold transition-all border-b-2 ${orderSubTab === "issued" ? "border-cyan-600 text-cyan-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}
              >
                Issued ({pendingOrders.length})
              </button>
              <button
                onClick={() => setOrderSubTab("amendment")}
                className={`px-4 py-2 text-sm font-bold transition-all border-b-2 ${orderSubTab === "amendment" ? "border-cyan-600 text-cyan-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}
              >
                Amendment ({amendments.length})
              </button>
            </div>
            
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-inner scale-90 origin-right">
              <button 
                onClick={() => { setOrderView("table"); setAmendView("table"); }} 
                className={`px-4 py-1 text-[10px] font-black rounded-md transition-all ${orderView === 'table' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                TABLE
              </button>
              <button 
                onClick={() => { setOrderView("tile"); setAmendView("tile"); }} 
                className={`px-4 py-1 text-[10px] font-black rounded-md transition-all ${orderView === 'tile' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                TILE
              </button>
            </div>
          </div>

          {orderSubTab === "issued" ? (
            <>
              {loading && (
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-bold text-cyan-600 animate-pulse uppercase tracking-widest bg-cyan-50 px-2 py-1 rounded">Syncing Orders...</span>
                </div>
              )}

              {filteredOrders.length === 0 ? (
                <div className={`${cardCls} p-8 text-center text-sm font-semibold text-slate-400`}>No pending order approval requests.</div>
              ) : orderView === "table" ? (
                <div className={`${cardCls} overflow-hidden border border-slate-200`}>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm border-collapse">
                      <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-5 py-4 border-r border-slate-100">Order No</th>
                          <th className="px-5 py-4 border-r border-slate-100">Subject</th>
                          <th className="px-5 py-4 border-r border-slate-100">Vendor Name</th>
                          <th className="px-5 py-4 border-r border-slate-100">Created By</th>
                          <th className="px-5 py-4 border-r border-slate-100">Total Value</th>
                          <th className="px-5 py-4 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredOrders.map((o) => (
                          <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-4 border-r border-slate-100">
                              <button onClick={() => setPdfPreviewId(o.id)} className="font-bold text-indigo-700 hover:underline text-[12px] whitespace-nowrap">{orderTitle(o)}</button>
                            </td>
                            <td className="px-5 py-4 border-r border-slate-100 text-slate-700 font-medium text-[12px] max-w-[150px] truncate" title={o.subject || o.snapshot?.subject}>{o.subject || o.snapshot?.subject || "—"}</td>
                            <td className="px-5 py-4 border-r border-slate-100 font-semibold text-slate-700 text-[12px] whitespace-nowrap truncate max-w-[150px]">
                              {o.snapshot?.vendor?.vendorName || o.vendors?.vendor_name || "—"}
                            </td>
                            <td className="px-5 py-4 border-r border-slate-100 text-slate-600 font-bold text-[11px] whitespace-nowrap">{o.made_by || o.snapshot?.madeBy || "—"}</td>
                            <td className="px-5 py-4 border-r border-slate-100 text-slate-800 font-black text-[12px] whitespace-nowrap">Rs {money(o.totals?.grandTotal || 0)}</td>
                            <td className="px-5 py-4">
                              <div className="flex items-center justify-center gap-1.5">
                                <button disabled={actionLoading === o.id} onClick={() => handleOrderAction(o.id, "Issued")} title="Issue Order"
                                  className="h-8 w-8 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 shadow-sm flex items-center justify-center transition-all"><CircleCheck size={18} /></button>
                                <button disabled={actionLoading === o.id} onClick={() => handleOrderAction(o.id, "Rejected")} title="Reject Order"
                                  className="h-8 w-8 rounded-md bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-40 shadow-sm flex items-center justify-center transition-all"><CircleX size={18} /></button>
                                <button disabled={actionLoading === o.id} onClick={() => handleOrderAction(o.id, "Draft")} title="Revert to Draft"
                                  className="h-8 w-8 rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 shadow-sm flex items-center justify-center transition-all"><RotateCcw size={16} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredOrders.map((o) => (
                    <div key={o.id} className={`${cardCls} p-3.5 flex flex-col border-t-4 border-t-indigo-600 rounded-none shadow-sm`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0">
                          <button onClick={() => setPdfPreviewId(o.id)} className="text-[11px] font-black text-indigo-700 hover:underline uppercase tracking-tight truncate block leading-none">{orderTitle(o)}</button>
                          <p className="text-[9px] text-slate-400 font-bold uppercase truncate mt-1">by {o.made_by || o.snapshot?.madeBy || "—"}</p>
                        </div>
                        <span className="text-[8px] font-black text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded-none border border-slate-200 uppercase">{o.snapshot?.site?.siteCode || o.sites?.site_code || "-"}</span>
                      </div>
                      <div className="mb-3 flex-1 min-w-0 space-y-4">
                        <div className="bg-white p-2 border border-slate-100 relative">
                          <span className="absolute -top-2 left-2 px-1 bg-white text-[8px] font-black text-indigo-500 uppercase tracking-widest">Vendor Name</span>
                          <p className="text-[12px] font-bold text-slate-800 truncate">{o.snapshot?.vendor?.vendorName || o.vendors?.vendor_name || "—"}</p>
                        </div>
                        <div className="bg-white p-2 border border-slate-100 relative">
                          <span className="absolute -top-2 left-2 px-1 bg-white text-[8px] font-black text-indigo-500 uppercase tracking-widest">Order Subject</span>
                          <p className="text-[11px] text-slate-700 line-clamp-1 font-bold">{o.subject || o.snapshot?.subject || "No Subject"}</p>
                        </div>
                        <div className="bg-slate-50 p-2 border border-slate-200 relative">
                          <span className="absolute -top-2 left-2 px-1 bg-white text-[8px] font-black text-indigo-500 uppercase tracking-widest">Total Value</span>
                          <p className="text-[12px] text-slate-900 font-black">Rs {money(o.totals?.grandTotal || 0)}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5 pt-3 border-t border-slate-100">
                        <button disabled={actionLoading === o.id} onClick={() => handleOrderAction(o.id, "Draft")}
                          className="flex-1 h-8 bg-white border border-amber-200 text-amber-600 font-bold text-[10px] hover:bg-amber-500 hover:text-white transition-all uppercase">REVERT</button>
                        <button disabled={actionLoading === o.id} onClick={() => handleOrderAction(o.id, "Rejected")}
                          className="flex-1 h-8 bg-rose-50 border border-rose-200 text-rose-600 font-bold text-[10px] hover:bg-rose-500 hover:text-white transition-all uppercase">REJECT</button>
                        <button disabled={actionLoading === o.id} onClick={() => handleOrderAction(o.id, "Issued")}
                          className="flex-1 h-8 bg-emerald-500 text-white font-bold text-[10px] hover:bg-emerald-600 shadow-sm transition-all uppercase flex items-center justify-center gap-1">
                          {actionLoading === o.id ? "..." : "ISSUE"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 px-1">
                <select value={amendSiteFilter} onChange={e => setAmendSiteFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 outline-none focus:border-cyan-400 shadow-sm transition-all uppercase tracking-tight">
                  <option value="">All Sites</option>
                  {Array.from(new Set(amendments.map(a => a.original_order?.site_code).filter(Boolean))).sort().map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={amendCompanyFilter} onChange={e => setAmendCompanyFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 outline-none focus:border-cyan-400 shadow-sm transition-all uppercase tracking-tight">
                  <option value="">All Companies</option>
                  {Array.from(new Set(amendments.map(a => a.original_order?.company_code).filter(Boolean))).sort().map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {loading && (
                  <div className="ml-2">
                    <div className="smooth-loader w-3.5 h-3.5 text-cyan-500"></div>
                  </div>
                )}
              </div>

              {!canManageAmend && (
                <div className={`${cardCls} p-3 text-center text-[11px] font-medium text-amber-700 bg-amber-50 border-amber-200`}>
                  You can view amendment requests but only users with <b>Manage Amend</b> permission can approve or reject them.
                </div>
              )}

              {amendments.filter(a => {
                if (amendSiteFilter && a.original_order?.site_code !== amendSiteFilter) return false;
                if (amendCompanyFilter && a.original_order?.company_code !== amendCompanyFilter) return false;
                if (search) {
                  const blob = `${a.original_order?.order_number || ""} ${a.original_order?.subject || ""} ${a.requestor?.name || ""} ${a.reason || ""}`.toLowerCase();
                  if (!blob.includes(search.toLowerCase())) return false;
                }
                return true;
              }).length === 0 ? (
                <div className={`${cardCls} p-8 text-center text-sm font-semibold text-slate-400`}>
                  {amendments.length === 0 ? "No pending amendment requests." : "No requests match the current filters."}
                </div>
              ) : amendView === "table" ? (
                <div className={`${cardCls} overflow-hidden border border-slate-200`}>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm border-collapse">
                      <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-5 py-4 border-r border-slate-100">Order No</th>
                          <th className="px-5 py-4 border-r border-slate-100">Vendor Name</th>
                          <th className="px-5 py-4 border-r border-slate-100">Subject</th>
                          <th className="px-5 py-4 border-r border-slate-100">Requested By</th>
                          <th className="px-5 py-4 border-r border-slate-100 min-w-[250px]">Reason</th>
                          <th className="px-5 py-4 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {amendments.filter(a => {
                          if (amendSiteFilter && a.original_order?.site_code !== amendSiteFilter) return false;
                          if (amendCompanyFilter && a.original_order?.company_code !== amendCompanyFilter) return false;
                          if (search) {
                            const blob = `${a.original_order?.order_number || ""} ${a.original_order?.subject || ""} ${a.requestor?.name || ""} ${a.reason || ""}`.toLowerCase();
                            if (!blob.includes(search.toLowerCase())) return false;
                          }
                          return true;
                        }).map((req) => (
                          <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3 border-r border-slate-100">
                              <button onClick={() => setPdfPreviewId(req.original_order?.id)} className="font-bold text-indigo-700 hover:underline text-[12px] whitespace-nowrap">{req.original_order?.order_number || "—"}</button>
                            </td>
                            <td className="px-5 py-3 border-r border-slate-100 font-semibold text-slate-700 text-[12px] whitespace-nowrap truncate max-w-[150px]">
                              {req.original_order?.vendors?.vendor_name || req.original_order?.snapshot?.vendor?.vendorName || req.original_order?.vendor_name || "—"}
                            </td>
                            <td className="px-5 py-3 border-r border-slate-100 text-slate-500 text-[12px] max-w-[120px] truncate" title={req.original_order?.subject}>{req.original_order?.subject || "—"}</td>
                            <td className="px-5 py-3 border-r border-slate-100 text-slate-600 font-bold text-[11px] whitespace-nowrap">{req.requestor?.name || "—"}</td>
                            <td className="px-5 py-3 border-r border-slate-100 text-slate-500 text-[12px] font-medium leading-relaxed min-w-[300px]" title={req.reason}>{req.reason}</td>
                            <td className="px-5 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {req.attachment_url && (
                                  <a href={req.attachment_url} target="_blank" rel="noreferrer" title="View Attachment" className="h-8 w-8 flex items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"><FileText size={16} /></a>
                                )}
                                <button disabled={actionLoading === req.id || !canManageAmend} onClick={() => handleAmendAction(req.id, "Approved")} title="Approve" className="h-8 w-8 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 shadow-sm transition-all flex items-center justify-center"><CircleCheck size={18} /></button>
                                <button disabled={actionLoading === req.id || !canManageAmend} onClick={() => handleAmendAction(req.id, "Rejected")} title="Reject" className="h-8 w-8 rounded-md bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-40 shadow-sm transition-all flex items-center justify-center"><CircleX size={18} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {amendments.filter(a => {
                    if (amendSiteFilter && a.original_order?.site_code !== amendSiteFilter) return false;
                    if (amendCompanyFilter && a.original_order?.company_code !== amendCompanyFilter) return false;
                    if (search) {
                      const blob = `${a.original_order?.order_number || ""} ${a.original_order?.subject || ""} ${a.requestor?.name || ""} ${a.reason || ""}`.toLowerCase();
                      if (!blob.includes(search.toLowerCase())) return false;
                    }
                    return true;
                  }).map((req) => {
                    const ord = req.original_order || {};
                    return (
                      <div key={req.id} className={`${cardCls} flex flex-col rounded-none shadow-sm border border-slate-200 overflow-hidden bg-white border-t-2 border-t-indigo-500`}>
                        <div className="p-3.5 border-b border-slate-50 flex items-start justify-between">
                          <div className="min-w-0">
                            <button onClick={() => setPdfPreviewId(ord.id)} className="text-[12.5px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-tight truncate block leading-none mb-1">{ord.order_number || "—"}</button>
                            <p className="text-[10px] text-slate-400 font-bold uppercase truncate tracking-wider">{req.requestor?.name || "TEST USER"}</p>
                          </div>
                          <div className="bg-slate-50 px-2 py-0.5 border border-slate-200 shrink-0">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{ord.site_code || "-"}</span>
                          </div>
                        </div>
                        <div className="p-4 flex-1 flex flex-col gap-4">
                          <div className="bg-white p-2 border border-slate-100 relative">
                            <span className="absolute -top-2 left-2 px-1 bg-white text-[8px] font-black text-slate-400 uppercase tracking-widest">Vendor Name</span>
                            <p className="text-[12px] font-bold text-slate-800 truncate">{ord.vendors?.vendor_name || ord.snapshot?.vendor?.vendorName || ord.vendor_name || "—"}</p>
                          </div>
                          <div className="bg-white p-2 border border-slate-100 relative">
                            <span className="absolute -top-2 left-2 px-1 bg-white text-[8px] font-black text-slate-400 uppercase tracking-widest">Subject</span>
                            <p className="text-[11px] text-slate-500 line-clamp-1 font-medium">{ord.subject || ord.snapshot?.subject || "No Subject"}</p>
                          </div>
                          <div className="flex-1">
                            <div className="bg-slate-50 p-3 border border-slate-200 relative">
                              <span className="absolute -top-2 left-2 px-1 bg-white text-[9px] font-bold text-slate-400 uppercase tracking-widest">Reason</span>
                              <p className="text-[12px] text-slate-600 leading-snug font-medium break-words">{req.reason}</p>
                            </div>
                          </div>
                          <div className="flex gap-2 pt-2 border-t border-slate-50">
                            <button onClick={() => setPdfPreviewId(ord.id)} className="h-9 w-9 flex items-center justify-center bg-white border border-slate-300 text-slate-500 hover:text-indigo-600 transition-all shadow-sm shrink-0"><FileText size={16} /></button>
                            <button disabled={actionLoading === req.id || !canManageAmend} onClick={() => handleAmendAction(req.id, "Rejected")} className="flex-1 h-9 bg-white border border-rose-200 text-rose-600 font-bold text-[11px] hover:bg-rose-50 transition-all uppercase">REJECT</button>
                            <button disabled={actionLoading === req.id || !canManageAmend} onClick={() => handleAmendAction(req.id, "Approved")} className="flex-1 h-9 bg-emerald-500 text-white font-bold text-[11px] hover:bg-emerald-600 shadow-sm transition-all uppercase">APPROVE</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      ) : activeTab === "intake" ? (
        <ApprovalTable
          emptyText="No pending intake approval requests."
          onAction={handleIntakeAction}
          actionLoading={actionLoading}
          loading={loading}
          rows={filteredIntakes.map((i) => ({
            id: i.id,
            number: intakeTitle(i),
            title: i.name || "Intake approval",
            source: i.site_name || "-",
            owner: i.requisition_by || "-",
            amount: `${i.intake_items?.length || 0} items`,
            status: i.status,
          }))}
        />
      ) : (
        <div className={`${cardCls} p-8 text-center`}>
          <Clock size={24} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Payment approvals will appear here once payment request workflow is connected.</p>
        </div>
      )}

      {pdfPreviewId && (
        <div className="fixed inset-0 z-[100] flex">
          <div className="flex-1 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPdfPreviewId(null)} />
          <div className="w-full max-w-5xl h-full bg-white shadow-2xl flex flex-col">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Order Preview</p>
              <button onClick={() => setPdfPreviewId(null)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors">✕</button>
            </div>
            <iframe src={`${API}/api/orders/${pdfPreviewId}/preview`} className="flex-1 w-full" title="Order PDF Preview" />
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalTable({ rows, emptyText, onAction, actionLoading, loading }) {
  if (!rows.length) {
    return <div className={`${cardCls} p-8 text-center text-sm font-semibold text-slate-400`}>{emptyText}</div>;
  }

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-bold">Request No.</th>
              <th className="px-4 py-3 font-bold">Title</th>
              <th className="px-4 py-3 font-bold">Project / Site</th>
              <th className="px-4 py-3 font-bold">Requested By</th>
              <th className="px-4 py-3 font-bold">Value</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && rows.length > 0 && (
              <tr>
                <td colSpan="7" className="py-4 text-center">
                  <div className="smooth-loader w-5 h-5 text-cyan-500 mx-auto"></div>
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3 font-mono text-xs font-bold text-cyan-700">{row.number}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{row.title}</td>
                <td className="px-4 py-3 text-slate-500">{row.source}</td>
                <td className="px-4 py-3 text-slate-500">{row.owner}</td>
                <td className="px-4 py-3 text-slate-600">{row.amount}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusCls[row.status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                    {String(row.status).replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button 
                      disabled={actionLoading === row.id}
                      onClick={() => onAction && onAction(row.id, "Approved")}
                      className="px-3 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-md hover:bg-emerald-700 transition-all disabled:opacity-50"
                    >
                      APPROVE
                    </button>
                    <button 
                      disabled={actionLoading === row.id}
                      onClick={() => onAction && onAction(row.id, "Rejected")}
                      className="px-3 py-1 bg-rose-600 text-white text-[10px] font-bold rounded-md hover:bg-rose-700 transition-all disabled:opacity-50"
                    >
                      REJECT
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
