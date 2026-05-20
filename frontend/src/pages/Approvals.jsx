import React, { useEffect, useMemo, useState } from "react";
import {
  FileText, Check, X, AlertCircle, RefreshCw,
  ChevronDown, Building2, CircleCheck, CircleX, RotateCcw,
  ClipboardList, Clock, IndianRupee, Search, Undo2, User, FileDown
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
const approvalTabs = new Set(["intake", "orders", "payments"]);

const readApprovalTabFromHash = () => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const tab = params.get("approvalTab") || params.get("tab");
  return approvalTabs.has(tab) ? tab : "intake";
};

export default function Approvals() {
  const currentUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
  const isGlobalAdmin = currentUser.role === "global_admin";

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const [activeTab, setActiveTab] = useState(readApprovalTabFromHash);
  const [orderSubTab, setOrderSubTab] = useState("pending_approval");
  const [orders, setOrders] = useState([]);
  const [intakes, setIntakes] = useState([]);
  const [amendments, setAmendments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [commentModal, setCommentModal] = useState({ open: false, orderId: null, action: null });
  const [commentText, setCommentText] = useState("");
  const [search, setSearch] = useState("");
  const [canManageAmend, setCanManageAmend] = useState(false);
  const [canManageActionRequests, setCanManageActionRequests] = useState(false);
  const [isIssueHandler, setIsIssueHandler] = useState(false);
  const [actionRequests, setActionRequests] = useState([]);
  const [arActionLoading, setArActionLoading] = useState(null);
  const [arCommentModal, setArCommentModal] = useState({ open: false, requestId: null, action: null });
  const [arCommentText, setArCommentText] = useState("");
  // Amendment-specific filters + PDF preview state
  const [amendSiteFilter, setAmendSiteFilter] = useState("");
  const [amendCompanyFilter, setAmendCompanyFilter] = useState("");
  const [pdfPreviewId, setPdfPreviewId] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);

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
      const [ordersRes, intakesRes, amendRes, capRes, arRes, arCapRes, pendingApprovalsRes, handlersRes] = await Promise.all([
        fetch(`${API}/api/orders`),
        fetch(`${API}/api/intakes`),
        fetch(`${API}/api/amendments/requests`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/amendments/can-manage`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/action-requests/pending`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/action-requests/can-manage`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/approval-flows/pending-for-me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/request-handlers`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [ordersData, intakesData, amendData, capData, arData, arCapData, pendingApprovalsData, handlersData] = await Promise.all([
        ordersRes.json().catch(() => ({})),
        intakesRes.json().catch(() => ({})),
        amendRes.json().catch(() => ({})),
        capRes.json().catch(() => ({})),
        arRes.json().catch(() => ({})),
        arCapRes.json().catch(() => ({})),
        pendingApprovalsRes.json().catch(() => ({})),
        handlersRes.json().catch(() => ({})),
      ]);

      const ords = ordersData.orders || [];
      const ints = intakesData.intakes || [];
      const amds = amendData.requests || [];
      const caps = !!capData.canManage;
      const ars  = arData.requests || [];

      const issueUsers = (handlersData.config?.order?.issue?.users || []);
      const issueHandlerFlag = isGlobalAdmin || issueUsers.some(u => String(u.id) === String(currentUser.id));

      const pas = pendingApprovalsData.requests || [];
      setOrders(ords);
      setIntakes(ints);
      setAmendments(amds);
      setCanManageAmend(caps);
      setActionRequests(ars);
      setCanManageActionRequests(!!arCapData.canManage);
      setPendingApprovals(pas);
      setIsIssueHandler(issueHandlerFlag);
      
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
    const params = new URLSearchParams(window.location.hash.slice(1));
    const mainTab = params.get("tab");
    if (approvalTabs.has(mainTab)) {
      params.set("tab", "approvals");
    }
    if (params.get("approvalTab") === activeTab && params.get("tab") === "approvals") return;
    params.set("approvalTab", activeTab);
    window.history.replaceState(null, "", `#${params.toString()}`);
  }, [activeTab]);

  useEffect(() => {
    load(true);

    // SSE for instant updates — backend pushes when order status changes
    let es;
    const connectSSE = () => {
      es = new EventSource(`${API}/api/orders/events`);
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "order_updated") load();
        } catch {}
      };
      es.onerror = () => {
        es.close();
        setTimeout(connectSSE, 5000); // reconnect after 5s if disconnected
      };
    };
    connectSSE();

    // Fallback poll every 30s (catches missed SSE events)
    const interval = setInterval(() => load(), 30000);
    return () => {
      clearInterval(interval);
      if (es) es.close();
    };
  }, []);

  useEffect(() => {
    if (!pdfPreviewId) {
      setPdfBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      return;
    }
    let cancelled = false;
    fetch(`${API}/api/orders/${pdfPreviewId}/pdf?t=${Date.now()}`)
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return;
        const pdfFile = new File([blob], `Order_${pdfPreviewId}.pdf`, { type: "application/pdf" });
        const url = URL.createObjectURL(pdfFile);
        setPdfBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pdfPreviewId]);

  const handlePDFDownload = async () => {
    if (!pdfPreviewId || pdfDownloading) return;
    setPdfDownloading(true);
    try {
      const res = await fetch(`${API}/api/orders/${pdfPreviewId}/pdf?download=1&t=${Date.now()}`);
      if (!res.ok) throw new Error("PDF failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Order_${pdfPreviewId}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
    setPdfDownloading(false);
  };

  const handleOrderAction = async (orderId, action, comments = "") => {
    setActionLoading(orderId);
    try {
      const token = localStorage.getItem("bms_token") || "";
      // Map UI action names to issue-action endpoint action keys
      const actionMap = { "Issued": "issue", "Reverted": "revert", "Rejected": "reject" };
      const apiAction = actionMap[action];
      const res = await fetch(`${API}/api/orders/${orderId}/issue-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: apiAction, comment: comments }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        load();
      } else {
        showToast(data.error || "Action failed", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error", "error");
    }
    setActionLoading(null);
  };

  const handleActionRequest = async (requestId, action, comment = "") => {
    setArActionLoading(requestId);
    try {
      const token = localStorage.getItem("bms_token") || "";
      const res = await fetch(`${API}/api/action-requests/${requestId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, comment }),
      });
      const d = await res.json();
      if (d.success) load();
      else showToast(d.error || "Action failed", "error");
    } catch { showToast("Network error", "error"); }
    setArActionLoading(null);
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
        showToast(data.error || "Action failed", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error", "error");
    }
    setActionLoading(null);
  };

  const handleApprovalFlowAction = async (requestId, action, comments = "") => {
    setActionLoading(requestId);
    try {
      const token = localStorage.getItem("bms_token") || "";
      const res = await fetch(`${API}/api/approval-flows/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ request_id: requestId, action, comments }),
      });
      const d = await res.json();
      if (d.success) load();
      else showToast(d.error || "Action failed", "error");
    } catch { showToast("Network error", "error"); }
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
        showToast(data.error, "error");
      }
    } catch (err) {
      console.error(err);
    }
    setActionLoading(null);
  };

  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approvalActionModal, setApprovalActionModal] = useState({ open: false, requestId: null, action: null });
  const [approvalActionComment, setApprovalActionComment] = useState("");
  const [amendView, setAmendView] = useState("tile"); // 'table' or 'tile'
  const [orderView, setOrderView] = useState("tile"); // 'table' or 'tile'

  const pendingOrders = useMemo(() => (
    orders.filter((o) => ["Pending Issue", "To Issue"].includes(o.status))
  ), [orders]);

  const pendingIntakes = useMemo(() => (
    intakes.filter((i) => ["submitted", "in_review"].includes(i.status))
  ), [intakes]);

  const tabs = [
    { key: "intake", label: "Intake", icon: FileText, count: pendingIntakes.length },
    { key: "orders", label: "Orders", icon: ClipboardList, count: pendingOrders.length + amendments.length + actionRequests.length + pendingApprovals.length },
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
  const hasApprovalData = orders.length > 0 || intakes.length > 0 || amendments.length > 0;
  const showInitialLoading = loading && !hasApprovalData;

  return (
    <div className="min-h-screen bg-[#f8fafc] p-3 sm:p-4 lg:p-6 pb-20">
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[300] px-5 py-3 rounded-xl shadow-lg text-sm font-bold text-white transition-all ${toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"}`}>
          {toast.msg}
        </div>
      )}
      {/* Syncing Circle */}
      {loading && hasApprovalData && (
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

      {showInitialLoading ? (
        <div className={`${cardCls} flex min-h-[120px] items-center justify-center`}>
          <div className="smooth-loader w-8 h-8 text-cyan-600"></div>
        </div>
      ) : activeTab === "orders" ? (
        <div className="flex flex-col gap-4">
          {/* Orders Sub-tabs */}
          {/* Orders Sub-tabs & View Toggle */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-0.5 px-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOrderSubTab("pending_approval")}
                className={`px-4 py-2 text-sm font-bold transition-all border-b-2 ${orderSubTab === "pending_approval" ? "border-violet-600 text-violet-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}
              >
                Pending Approval {pendingApprovals.length > 0 && <span className="ml-1 bg-violet-100 text-violet-700 text-[10px] font-black px-1.5 py-0.5 rounded-full">{pendingApprovals.length}</span>}
              </button>
              <button
                onClick={() => setOrderSubTab("issued")}
                className={`px-4 py-2 text-sm font-bold transition-all border-b-2 ${orderSubTab === "issued" ? "border-cyan-600 text-cyan-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}
              >
                Pending Issue ({pendingOrders.length})
              </button>
              <button
                onClick={() => setOrderSubTab("amendment")}
                className={`px-4 py-2 text-sm font-bold transition-all border-b-2 ${orderSubTab === "amendment" ? "border-cyan-600 text-cyan-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}
              >
                Amendment ({amendments.length})
              </button>
              <button
                onClick={() => setOrderSubTab("recall")}
                className={`px-4 py-2 text-sm font-bold transition-all border-b-2 ${orderSubTab === "recall" ? "border-purple-600 text-purple-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}
              >
                Recall {(() => { const n = actionRequests.filter(r => r.request_type === "recall").length; return n > 0 ? <span className="ml-1 bg-purple-100 text-purple-700 text-[10px] font-black px-1.5 py-0.5 rounded-full">{n}</span> : null; })()}
              </button>
              <button
                onClick={() => setOrderSubTab("cancel")}
                className={`px-4 py-2 text-sm font-bold transition-all border-b-2 ${orderSubTab === "cancel" ? "border-rose-600 text-rose-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}
              >
                Cancel {(() => { const n = actionRequests.filter(r => r.request_type === "cancel").length; return n > 0 ? <span className="ml-1 bg-rose-100 text-rose-700 text-[10px] font-black px-1.5 py-0.5 rounded-full">{n}</span> : null; })()}
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

          {orderSubTab === "pending_approval" ? (
            <div className="space-y-3">
              {pendingApprovals.length === 0 ? (
                <div className={`${cardCls} p-8 text-center text-sm font-semibold text-slate-400`}>
                  No orders are pending your approval.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {pendingApprovals.map((req) => {
                    const doc = req.document || {};
                    const flow = req.flow_snapshot || {};
                    const levels = flow.levels || [];
                    const currentLevel = levels[(req.current_level || 1) - 1];
                    const vendorName = doc.vendors?.vendor_name || doc.snapshot?.vendor?.vendorName || "—";
                    const totalVal = doc.totals?.grandTotal ?? doc.totals?.grand_total ?? 0;
                    return (
                      <div key={req.id} className={`${cardCls} flex flex-col rounded-none shadow-sm border-t-4 border-t-violet-600`}>
                        <div className="p-3.5 border-b border-slate-50 flex items-start justify-between">
                          <div className="min-w-0">
                            <button
                              onClick={() => setPdfPreviewId(doc.id)}
                              className="text-[11px] font-black text-violet-700 hover:underline uppercase tracking-tight truncate block leading-none"
                            >
                              {doc.order_number || `Order ${req.document_id?.slice(0, 8)}`}
                            </button>
                            <p className="text-[9px] text-slate-400 font-bold uppercase truncate mt-1">by {doc.made_by || "—"}</p>
                          </div>
                          <span className="text-[8px] font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded-none border border-slate-200 uppercase shrink-0">{doc.sites?.site_code || "—"}</span>
                        </div>
                        <div className="p-3.5 flex-1 flex flex-col gap-4">
                          <div className="bg-white p-2 border border-slate-100 relative">
                            <span className="absolute -top-2 left-2 px-1 bg-white text-[8px] font-black text-violet-500 uppercase tracking-widest">Vendor Name</span>
                            <p className="text-[12px] font-bold text-slate-800 truncate">{vendorName}</p>
                          </div>
                          <div className="bg-white p-2 border border-slate-100 relative">
                            <span className="absolute -top-2 left-2 px-1 bg-white text-[8px] font-black text-violet-500 uppercase tracking-widest">Order Subject</span>
                            <p className="text-[11px] text-slate-700 line-clamp-1 font-bold">{doc.subject || doc.snapshot?.subject || "No Subject"}</p>
                          </div>
                          <div className="bg-slate-50 p-2 border border-slate-200 relative">
                            <span className="absolute -top-2 left-2 px-1 bg-white text-[8px] font-black text-violet-500 uppercase tracking-widest">Total Value</span>
                            <p className="text-[12px] text-slate-900 font-black">Rs {money(totalVal)}</p>
                          </div>
                        </div>
                        {req.can_act && (
                          <div className="px-3.5 pb-3.5 flex gap-1.5 pt-3 border-t border-slate-100">
                            <button
                              disabled={actionLoading === req.id}
                              onClick={() => { setApprovalActionModal({ open: true, requestId: req.id, action: "reverted" }); setApprovalActionComment(""); }}
                              className="flex-1 h-8 bg-white border border-amber-200 text-amber-600 font-bold text-[10px] hover:bg-amber-50 transition-all uppercase">
                              REVERT
                            </button>
                            <button
                              disabled={actionLoading === req.id}
                              onClick={() => { setApprovalActionModal({ open: true, requestId: req.id, action: "rejected" }); setApprovalActionComment(""); }}
                              className="flex-1 h-8 bg-white border border-rose-200 text-rose-600 font-bold text-[10px] hover:bg-rose-50 transition-all uppercase">
                              REJECT
                            </button>
                            <button
                              disabled={actionLoading === req.id}
                              onClick={() => handleApprovalFlowAction(req.id, "approved")}
                              className="flex-1 h-8 bg-emerald-500 text-white font-bold text-[10px] hover:bg-emerald-600 transition-all uppercase">
                              {actionLoading === req.id ? "..." : "APPROVE"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : orderSubTab === "issued" ? (
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
                              {isIssueHandler ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button disabled={actionLoading === o.id} onClick={() => handleOrderAction(o.id, "Issued")} title="Issue Order"
                                    className="h-8 w-8 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 shadow-sm flex items-center justify-center transition-all"><CircleCheck size={18} /></button>
                                  <button disabled={actionLoading === o.id} onClick={() => { setCommentModal({ open: true, orderId: o.id, action: "Rejected" }); setCommentText(""); }} title="Reject Order"
                                    className="h-8 w-8 rounded-md bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-40 shadow-sm flex items-center justify-center transition-all"><CircleX size={18} /></button>
                                  <button disabled={actionLoading === o.id} onClick={() => { setCommentModal({ open: true, orderId: o.id, action: "Reverted" }); setCommentText(""); }} title="Revert to Draft"
                                    className="h-8 w-8 rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 shadow-sm flex items-center justify-center transition-all"><RotateCcw size={16} /></button>
                                </div>
                              ) : <span className="text-[10px] text-slate-400">—</span>}
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
                      {isIssueHandler && <div className="flex gap-1.5 pt-3 border-t border-slate-100">
                        <button disabled={actionLoading === o.id} onClick={() => { setCommentModal({ open: true, orderId: o.id, action: "Reverted" }); setCommentText(""); }}
                          className="flex-1 h-8 bg-white border border-amber-200 text-amber-600 font-bold text-[10px] hover:bg-amber-500 hover:text-white transition-all uppercase">REVERT</button>
                        <button disabled={actionLoading === o.id} onClick={() => { setCommentModal({ open: true, orderId: o.id, action: "Rejected" }); setCommentText(""); }}
                          className="flex-1 h-8 bg-rose-50 border border-rose-200 text-rose-600 font-bold text-[10px] hover:bg-rose-500 hover:text-white transition-all uppercase">REJECT</button>
                        <button disabled={actionLoading === o.id} onClick={() => handleOrderAction(o.id, "Issued")}
                          className="flex-1 h-8 bg-emerald-500 text-white font-bold text-[10px] hover:bg-emerald-600 shadow-sm transition-all uppercase flex items-center justify-center gap-1">
                          {actionLoading === o.id ? "..." : "ISSUE"}
                        </button>
                      </div>}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (orderSubTab === "recall" || orderSubTab === "cancel") ? (() => {
            const isRecallTab = orderSubTab === "recall";
            const filtered = actionRequests.filter(r => r.request_type === (isRecallTab ? "recall" : "cancel"));
            return (
            <div className="space-y-3">
              {loading && (
                <div className="flex items-center gap-2 px-1">
                  <span className={`text-[10px] font-bold animate-pulse uppercase tracking-widest px-2 py-1 rounded ${isRecallTab ? "text-purple-600 bg-purple-50" : "text-rose-600 bg-rose-50"}`}>Syncing...</span>
                </div>
              )}
              {filtered.length === 0 ? (
                <div className={`${cardCls} p-8 text-center text-sm font-semibold text-slate-400`}>
                  No pending {isRecallTab ? "recall" : "cancel"} requests.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filtered.map(ar => {
                    const ord = ar.order || {};
                    const accentTop = isRecallTab ? "border-t-purple-500" : "border-t-rose-500";
                    const accentText = isRecallTab ? "text-purple-600" : "text-rose-600";
                    const accentHover = isRecallTab ? "hover:text-purple-800" : "hover:text-rose-800";
                    const accentBadge = isRecallTab ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-rose-50 text-rose-700 border-rose-200";
                    return (
                      <div key={ar.id} className={`${cardCls} flex flex-col rounded-none shadow-sm border border-slate-200 overflow-hidden bg-white border-t-2 ${accentTop}`}>
                        <div className="p-3.5 border-b border-slate-50 flex items-start justify-between">
                          <div className="min-w-0">
                            <button onClick={() => setPdfPreviewId(ord.id)} className={`text-[12.5px] font-bold ${accentText} uppercase tracking-tight truncate block leading-none mb-1 hover:underline`}>{ord.order_number || "—"}</button>
                            <p className="text-[10px] text-slate-400 font-bold uppercase truncate tracking-wider">{ar.requestor?.name || "—"}</p>
                          </div>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 ${accentBadge}`}>
                            {isRecallTab ? "Recall" : "Cancel"}
                          </span>
                        </div>
                        <div className="p-4 flex-1 flex flex-col gap-4">
                          <div className="bg-white p-2 border border-slate-100 relative">
                            <span className="absolute -top-2 left-2 px-1 bg-white text-[8px] font-black text-slate-400 uppercase tracking-widest">Order</span>
                            <p className="text-[12px] font-bold text-slate-800 truncate">{ord.subject || ord.snapshot?.subject || "No Subject"}</p>
                          </div>
                          <div className="bg-white p-2 border border-slate-100 relative">
                            <span className="absolute -top-2 left-2 px-1 bg-white text-[8px] font-black text-slate-400 uppercase tracking-widest">Vendor</span>
                            <p className="text-[12px] font-bold text-slate-800 truncate">{ord.snapshot?.vendor?.vendorName || ord.vendors?.vendor_name || "—"}</p>
                          </div>
                          {ar.reason && (
                            <div className="flex-1">
                              <div className="bg-slate-50 p-3 border border-slate-200 relative">
                                <span className="absolute -top-2 left-2 px-1 bg-white text-[9px] font-bold text-slate-400 uppercase tracking-widest">Reason</span>
                                <p className="text-[12px] text-slate-600 leading-snug font-medium break-words">{ar.reason}</p>
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2 pt-2 border-t border-slate-50">
                            {canManageActionRequests ? (
                              <>
                                <button disabled={arActionLoading === ar.id}
                                  onClick={() => setArCommentModal({ open: true, requestId: ar.id, action: "Rejected" })}
                                  className="flex-1 h-9 bg-white border border-rose-200 text-rose-600 font-bold text-[11px] hover:bg-rose-50 transition-all uppercase">
                                  REJECT
                                </button>
                                <button disabled={arActionLoading === ar.id}
                                  onClick={() => handleActionRequest(ar.id, "Approved", "")}
                                  className="flex-1 h-9 bg-emerald-500 text-white font-bold text-[11px] hover:bg-emerald-600 shadow-sm transition-all uppercase">
                                  {arActionLoading === ar.id ? "..." : isRecallTab ? "APPROVE RECALL" : "APPROVE CANCEL"}
                                </button>
                              </>
                            ) : (
                              <p className="text-[11px] text-slate-400 italic py-1">Awaiting approval</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })() : (
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
          <div className="flex-1 bg-black/50" onClick={() => setPdfPreviewId(null)} />
          <div className="w-full max-w-[860px] bg-slate-200 flex flex-col h-full shadow-2xl">
            <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
              <span className="font-bold text-slate-700 text-sm">PDF Preview</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={pdfDownloading}
                  onClick={handlePDFDownload}
                  className={`flex items-center gap-2 px-4 py-2 text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all ${pdfDownloading ? "bg-slate-400 cursor-not-allowed" : "bg-[#1b3e8a] hover:bg-[#16326d]"}`}>
                  {pdfDownloading
                    ? <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <FileDown size={14} />}
                  {pdfDownloading ? "Downloading..." : "Download PDF"}
                </button>
                <button onClick={() => setPdfPreviewId(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-all">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-300">
              <iframe title="Order PDF" src={pdfBlobUrl || "about:blank"} className="w-full h-full border-0 bg-white" />
            </div>
          </div>
        </div>
      )}

      {/* Comment modal for Revert / Reject from inbox */}
      {commentModal.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {commentModal.action === "Reverted" ? "Revert Order" : "Reject Order"}
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Mandatory Reason Required</p>
              </div>
              <button onClick={() => setCommentModal({ open: false, orderId: null, action: null })}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[13px] text-slate-600 font-medium bg-amber-50 p-3 rounded-xl border border-amber-100">
                {commentModal.action === "Reverted"
                  ? "Order will return to Draft status for correction."
                  : "Order will be permanently rejected."}
              </p>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Comments / Remarks</label>
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  rows={4}
                  placeholder="Please explain the reason for this action..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 outline-none resize-none transition-all"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setCommentModal({ open: false, orderId: null, action: null })}
                  className="flex-1 py-3 text-xs font-bold text-slate-500 rounded-xl hover:bg-slate-100 transition-all">Cancel</button>
                <button
                  disabled={!commentText.trim() || actionLoading === commentModal.orderId}
                  onClick={async () => {
                    const { orderId, action } = commentModal;
                    setCommentModal({ open: false, orderId: null, action: null });
                    await handleOrderAction(orderId, action, commentText.trim());
                    setCommentText("");
                  }}
                  className={`flex-[2] py-3 text-xs font-bold text-white rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:grayscale ${commentModal.action === "Reverted" ? "bg-amber-500 hover:bg-amber-600" : "bg-rose-600 hover:bg-rose-700"}`}>
                  {commentModal.action === "Reverted" ? "Confirm Revert" : "Confirm Reject"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approval flow action modal (revert/reject from inbox) */}
      {approvalActionModal.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {approvalActionModal.action === "reverted" ? "Revert Order" : "Reject Order"}
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Mandatory Reason Required</p>
              </div>
              <button onClick={() => setApprovalActionModal({ open: false, requestId: null, action: null })}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[13px] text-slate-600 font-medium bg-amber-50 p-3 rounded-xl border border-amber-100">
                {approvalActionModal.action === "reverted"
                  ? "Order will return to Review status for correction."
                  : "Order will be permanently rejected."}
              </p>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Comments / Remarks</label>
                <textarea
                  value={approvalActionComment}
                  onChange={e => setApprovalActionComment(e.target.value)}
                  rows={4}
                  placeholder="Please explain the reason for this action..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 outline-none resize-none transition-all"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setApprovalActionModal({ open: false, requestId: null, action: null })}
                  className="flex-1 py-3 text-xs font-bold text-slate-500 rounded-xl hover:bg-slate-100 transition-all">Cancel</button>
                <button
                  disabled={!approvalActionComment.trim() || actionLoading === approvalActionModal.requestId}
                  onClick={async () => {
                    const { requestId, action } = approvalActionModal;
                    setApprovalActionModal({ open: false, requestId: null, action: null });
                    await handleApprovalFlowAction(requestId, action, approvalActionComment.trim());
                    setApprovalActionComment("");
                  }}
                  className={`flex-[2] py-3 text-xs font-bold text-white rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:grayscale ${approvalActionModal.action === "reverted" ? "bg-amber-500 hover:bg-amber-600" : "bg-rose-600 hover:bg-rose-700"}`}>
                  {approvalActionModal.action === "reverted" ? "Confirm Revert" : "Confirm Reject"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Request comment modal (approve/reject recall/cancel) */}
      {arCommentModal.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {arCommentModal.action === "Approved" ? "Approve Request" : "Reject Request"}
              </h3>
              <button onClick={() => setArCommentModal({ open: false, requestId: null, action: null })}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <textarea
                value={arCommentText}
                onChange={e => setArCommentText(e.target.value)}
                rows={3}
                placeholder={arCommentModal.action === "Rejected" ? "Reason for rejection (required)..." : "Comment (optional)..."}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 outline-none resize-none transition-all"
              />
              <div className="flex gap-3">
                <button onClick={() => { setArCommentModal({ open: false, requestId: null, action: null }); setArCommentText(""); }}
                  className="flex-1 py-3 text-xs font-bold text-slate-500 rounded-xl hover:bg-slate-100 transition-all">Cancel</button>
                <button
                  disabled={arCommentModal.action === "Rejected" && !arCommentText.trim()}
                  onClick={async () => {
                    const { requestId, action } = arCommentModal;
                    setArCommentModal({ open: false, requestId: null, action: null });
                    await handleActionRequest(requestId, action, arCommentText.trim());
                    setArCommentText("");
                  }}
                  className={`flex-[2] py-3 text-xs font-bold text-white rounded-xl shadow-lg transition-all disabled:opacity-50 ${arCommentModal.action === "Approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
                  {arCommentModal.action === "Approved" ? "Confirm Approve" : "Confirm Reject"}
                </button>
              </div>
            </div>
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
