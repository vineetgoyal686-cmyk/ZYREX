import React, { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Search, Building2, User, Landmark, MapPin, Receipt, ShieldQuestion, FileText, CheckCircle2, Phone, Mail, FileDown, Download, Eye, X, Upload, Trash2, FileCheck, Lock, ShoppingCart, Package, GitMerge, Calendar, Undo2, Folder, Plus, Clock, Pencil, ChevronDown } from "lucide-react";
import { getCachedOrderDetails, preloadOrderDetails, seedOrderDetails } from "./orderDetailsCache";
import { normalizeOrderSite } from "../../utils/orderSite";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

function PdfViewTab({ pdfBlobUrl, pdfLoading, onDownload }) {
  return (
    <div className="bg-slate-300 flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
      <div className="px-4 py-3 flex items-center justify-end print:hidden bg-slate-200 border-b border-slate-300">
        <button
          disabled={pdfLoading}
          onClick={onDownload}
          className={`flex items-center gap-2 px-6 py-2.5 text-white font-bold rounded-xl shadow-lg transition-all text-xs uppercase ${pdfLoading ? "bg-slate-400" : "bg-[#1b3e8a] hover:bg-[#16326d]"}`}
        >
          <Download size={14} /> {pdfLoading ? "Working..." : "Download PDF"}
        </button>
      </div>
      <div className="flex-1 flex justify-center px-4 py-4">
        {pdfBlobUrl ? (
          <iframe
            src={pdfBlobUrl}
            title="Order Preview"
            style={{ width: "210mm", minHeight: "calc(100vh - 160px)", border: "none", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.15)" }}
          />
        ) : (
          <div className="text-slate-400 text-sm py-12">
            {pdfLoading ? "Loading preview…" : "Preview not available."}
          </div>
        )}
      </div>
    </div>
  );
}

const makeOrderPdfFilename = (orderNumber, fallback = "Order") => {
  const base = String(orderNumber || fallback).trim().replace(/\.pdf$/i, "") || fallback;
  return `${base.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")}.pdf`;
};

const amountToWords = (amount) => {
  if (!amount || isNaN(amount) || amount === 0) return "Zero Rupees Only";
  const a = ["", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ", "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const numToWords = (n) => {
    let numStr = n.toString();
    if (numStr.length > 9) return "Overflow";
    const nArray = ("000000000" + numStr).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!nArray) return "";
    let str = "";
    str += nArray[1] != 0 ? (a[Number(nArray[1])] || b[nArray[1][0]] + " " + a[nArray[1][1]]) + "Crore " : "";
    str += nArray[2] != 0 ? (a[Number(nArray[2])] || b[nArray[2][0]] + " " + a[nArray[2][1]]) + "Lakh " : "";
    str += nArray[3] != 0 ? (a[Number(nArray[3])] || b[nArray[3][0]] + " " + a[nArray[3][1]]) + "Thousand " : "";
    str += nArray[4] != 0 ? (a[Number(nArray[4])] || b[nArray[4][0]] + " " + a[nArray[4][1]]) + "Hundred " : "";
    str += nArray[5] != 0 ? ((str != "") ? "and " : "") + (a[Number(nArray[5])] || b[nArray[5][0]] + " " + a[nArray[5][1]]) : "";
    return str.trim();
  };
  const parts = Number(amount).toFixed(2).split(".");
  const rs = parseInt(parts[0], 10);
  const ps = parseInt(parts[1], 10);
  let res = numToWords(rs) + " Rupees";
  if (ps > 0) res += " and " + numToWords(ps) + " Paise";
  return res + " Only";
};


const ViewOrder = ({ orderId, onBack, onEdit, currentUser = {}, initialOrder = null }) => {
  const [data, setData] = useState({ order: null, items: [] });
  const [approvalData, setApprovalData] = useState({ request: null, logs: [] });
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [activeTab, setActiveTab] = useState("Order Details");
  const [handlers, setHandlers] = useState({});
  const thisUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
  const isGlobalAdmin = thisUser.role === "global_admin";

  // Approval Action state
  const [actionModal, setActionModal] = useState({ open: false, type: "" });
  const [actionComment, setActionComment] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [toast, setToast] = useState(null);

  // Amendment Request state
  const [amendModal, setAmendModal] = useState(false);
  const [amendReason, setAmendReason] = useState("");
  const [amendFile, setAmendFile] = useState(null);
  const [amendLoading, setAmendLoading] = useState(false);
  const [amendHistory, setAmendHistory] = useState([]);
  // Inline approve/reject (when this order IS the pending clone)
  const [pendingAmend, setPendingAmend] = useState(null);     // amendment row for this clone
  const [cancelAmendLoading, setCancelAmendLoading] = useState(false);
  const [cancelCommentModal, setCancelCommentModal] = useState({ open: false, type: null, comment: "" });

  // Action Requests (recall / cancel requests)
  const [pendingActionRequest, setPendingActionRequest] = useState(null);
  const [requestDropdownOpen, setRequestDropdownOpen] = useState(false);
  const [requestModal, setRequestModal] = useState({ open: false, type: "" }); // type: 'recall'|'cancel'
  const [requestReason, setRequestReason] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // Amendment Info Modal (for history tab)
  const [infoModal, setInfoModal] = useState({ open: false, data: null });
  const [amendActionLoading, setAmendActionLoading] = useState(false);
  const [arActionLoading, setArActionLoading] = useState(false);
  const [arRejectModal, setArRejectModal] = useState(false);
  const [arRejectComment, setArRejectComment] = useState("");
  const [logView, setLogView] = useState("flow"); // "flow" | "list"
  // Amendment History tab data
  const [amendChain, setAmendChain] = useState([]);
  // Calculation breakdown modal
  const [calcModalOpen, setCalcModalOpen] = useState(false);

  // Order-module permissions for the current user (drives which buttons show)
  const myOrderPerms = (thisUser.app_permissions || []).find(p => p.module_key === "order") || {};
  const canRequestAmend = isGlobalAdmin || !!myOrderPerms.can_add;

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const { subtotal, discAmt, netItems, fright, totalGst, grandTotal, frightTax, discountPct } = React.useMemo(() => {
    if (!data || !data.order) return { subtotal: 0, discAmt: 0, netItems: 0, fright: 0, totalGst: 0, grandTotal: 0, frightTax: 0, discountPct: 0 };
    const order = data.order;
    // Prefer order.totals, but fallback to snapshot.totals if root totals are missing/empty
    let dbT = order.totals || {};
    if ((!dbT || !dbT.subtotal) && order.snapshot?.totals) {
      dbT = order.snapshot.totals;
    }

    const fright = Number(dbT.frightCharges ?? dbT.fright) || 0;
    const frightTax = Number(dbT.frightTax ?? 18);
    let subtotal = Number(dbT.subtotal) || 0;
    let totalGst = Number(dbT.gst) || 0;
    const discAmt = Number(dbT.totalDiscountAmt) || 0;
    const discountPct = Number(dbT.txDiscountPct || dbT.discount_pct) || 0;
    let grandTotal = Number(dbT.grandTotal) || 0;

    // Fallback: if totals are missing (e.g. amended/cloned orders), calculate from items
    if (subtotal === 0 && data.items && data.items.length > 0) {
      subtotal = data.items.reduce((sum, it) => sum + (Number(it.qty) * Number(it.unit_rate) || Number(it.amount) || 0), 0);
      const itemsDiscSum = data.items.reduce((sum, it) => {
        const gross = (Number(it.qty) * Number(it.unit_rate) || Number(it.amount) || 0);
        return sum + (gross * (Number(it.discount_pct) || 0) / 100);
      }, 0);
      totalGst = data.items.reduce((sum, it) => {
        const gross = (Number(it.qty) * Number(it.unit_rate) || Number(it.amount) || 0);
        const net = gross * (1 - (Number(it.discount_pct) || 0) / 100);
        return sum + (net * (Number(it.tax_pct) || 0) / 100);
      }, 0);
      grandTotal = subtotal - itemsDiscSum + fright + totalGst;
    } else if (grandTotal === 0) {
      grandTotal = subtotal - discAmt + fright + totalGst;
    }

    return {
      subtotal,
      discAmt,
      discountPct,
      netItems: subtotal - discAmt,
      fright,
      totalGst,
      grandTotal,
      frightTax
    };
  }, [data]);

  const groupedItems = React.useMemo(() => {
    const raw = data.items || [];
    const normalizeGroupText = (value) =>
      String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
    const groups = [];
    const groupIndexByKey = new Map();

    for (let i = 0; i < raw.length; i++) {
      const it = raw[i];
      const itemNameRaw = it.material_name || it.items?.material_name || it.item?.material_name || "Unknown Item";
      const itemName = String(itemNameRaw || "").trim() || "Unknown Item";
      const unit = String(it.unit || "").trim();
      const itemGroupKey = normalizeGroupText(itemName);
      const unitGroupKey = normalizeGroupText(unit);
      const groupKey = `${itemGroupKey}__${unitGroupKey}`;

      if (groupIndexByKey.has(groupKey)) {
        const group = groups[groupIndexByKey.get(groupKey)];
        const subIdx = group.head._rowSpan + 1;
        group.rows.push({ ...it, _itemName: group.head._itemName, _isSubRow: true, _subIdx: subIdx });
        group.head._rowSpan++;
      } else {
        const head = {
          ...it,
          _itemName: itemName,
          _isSubRow: false,
          _rowSpan: 1,
          _subIdx: 1,
          _itemGroupKey: itemGroupKey,
          _unitGroupKey: unitGroupKey,
          _groupSrNo: groups.length + 1
        };
        groups.push({ head, rows: [head] });
        groupIndexByKey.set(groupKey, groups.length - 1);
      }
    }

    return groups.flatMap((group) => group.rows);
  }, [data.items]);

  useEffect(() => {
    if (!orderId) return undefined;

    const cached = getCachedOrderDetails(orderId);
    if (cached?.order) {
      setData(cached);
      setLoading(false);
      setHydrating(!!cached.__partial);
    } else if (initialOrder) {
      const seeded = { order: initialOrder, items: [], __partial: true };
      seedOrderDetails(initialOrder);
      setData(seeded);
      setLoading(false);
      setHydrating(true);
    }

    // Initial parallel fetch for instant results
    fetchAmendHistory(); // Call this FIRST for fastest box appearance
    fetchOrderDetails();
    fetchApprovalData();
    fetchActionRequest();
    fetchRequestHandlers();

    const scheduleIdle = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 1500));
    const cancelIdle = window.cancelIdleCallback || window.clearTimeout;
    const idleId = scheduleIdle(() => {
      fetch(`${API}/api/orders/${orderId}/preview`, { method: "GET" }).catch(() => { });
    });

    return () => {
      cancelIdle(idleId);
    };
  }, [orderId, initialOrder]);

  useEffect(() => {
    const id = data?.order?.id;
    if (!id) return;
    let cancelled = false;
    fetch(`${API}/api/orders/${id}/preview`)
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPdfBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [data?.order?.id]);

  const fetchApprovalData = async () => {
    try {
      const wRes = await fetch(`${API}/api/approval-flows/request/${orderId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("bms_token") || ""}` }
      });
      if (wRes.ok) {
        const wJson = await wRes.json();
        setApprovalData({ request: wJson.request || null, logs: wJson.logs || [] });
      }
    } catch (err) {
      console.error("Approval fetch failed", err);
    }
  };

  const fetchAmendHistory = async () => {
    const token = localStorage.getItem("bms_token") || "";
    const headers = { Authorization: `Bearer ${token}` };

    // Parallelize all amendment related calls for maximum speed
    Promise.all([
      fetch(`${API}/api/amendments/requests?order_id=${orderId}`, { headers }).then(r => r.json()),
      fetch(`${API}/api/amendments/chain/${orderId}`, { headers }).then(r => r.json()),
      fetch(`${API}/api/amendments/by-clone/${orderId}`, { headers }).then(r => r.json()),
      Promise.resolve({ canManage: false }) // derived from request handlers now
    ]).then(([dRequests, dChain, dClone]) => {
      setAmendHistory(dRequests.requests || []);
      setAmendChain(dChain.chain || []);
      setPendingAmend(dClone.amendment || null);
    }).catch(err => {
      console.error("Amend fetch failed", err);
    });
  };

  const fetchActionRequest = async () => {
    const token = localStorage.getItem("bms_token") || "";
    try {
      const res = await fetch(`${API}/api/action-requests/for-order/${orderId}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setPendingActionRequest(d.request || null);
    } catch { }
  };

  const fetchRequestHandlers = async () => {
    try {
      const token = localStorage.getItem("bms_token") || "";
      const res = await fetch(`${API}/api/request-handlers`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setHandlers(d.config || {});
      }
    } catch { }
  };

  const handleIssueAction = async (action, comment = "") => {
    setActionLoading(true);
    const token = localStorage.getItem("bms_token") || "";
    try {
      const res = await fetch(`${API}/api/orders/${orderId}/issue-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, comment }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Action failed");
      setActionModal({ open: false, type: "" });
      setActionComment("");
      showToast(action === "issue" ? "Order Issued!" : action === "revert" ? "Order reverted to Review" : "Order rejected");
      fetchOrderDetails();
    } catch (err) {
      showToast(err.message || "Action failed", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const submitActionRequest = async () => {
    if (!requestReason.trim()) return;
    setRequestLoading(true);
    const token = localStorage.getItem("bms_token") || "";
    try {
      const res = await fetch(`${API}/api/action-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: orderId, request_type: requestModal.type, reason: requestReason }),
      });
      const d = await res.json();
      if (d.success) {
        setRequestModal({ open: false, type: "" });
        setRequestReason("");
        showToast(`${requestModal.type === "recall" ? "Recall" : "Cancel"} request submitted`);
        fetchActionRequest();
      } else {
        showToast(d.error || "Failed to submit request", "error");
      }
    } catch { showToast("Network error", "error"); }
    setRequestLoading(false);
  };

  const cancelActionRequest = async () => {
    if (!pendingActionRequest) return;
    setRequestLoading(true);
    const token = localStorage.getItem("bms_token") || "";
    try {
      const res = await fetch(`${API}/api/action-requests/${pendingActionRequest.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "Cancelled" }),
      });
      const d = await res.json();
      if (d.success) { showToast("Request cancelled"); fetchActionRequest(); }
      else showToast(d.error || "Failed", "error");
    } catch { showToast("Network error", "error"); }
    setRequestLoading(false);
  };

  const handleWithdrawApproval = async () => {
    setWithdrawLoading(true);
    const token = localStorage.getItem("bms_token") || "";
    try {
      const res = await fetch(`${API}/api/approval-flows/withdraw/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) throw new Error(d.error || "Withdraw failed");

      showToast("Approval request withdrawn. Order moved back to Review.");
      setApprovalData({ request: null, logs: [] });
      setData(prev => ({
        ...prev,
        order: prev.order ? { ...prev.order, status: "Review" } : prev.order
      }));
      fetchOrderDetails();
      fetchApprovalData();
    } catch (err) {
      showToast(err.message || "Withdraw failed", "error");
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleActionRequestDecision = async (action, comment = "") => {
    if (!pendingActionRequest) return;
    setArActionLoading(true);
    const token = localStorage.getItem("bms_token") || "";
    try {
      const res = await fetch(`${API}/api/action-requests/${pendingActionRequest.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, comment }),
      });
      const d = await res.json();
      if (d.success) {
        showToast(action === "Approved" ? "Request approved!" : "Request rejected");
        fetchActionRequest();
        fetchOrderDetails();
        fetchAmendHistory();
      } else showToast(d.error || "Failed", "error");
    } catch { showToast("Network error", "error"); }
    setArActionLoading(false);
  };

  const handleAmendDecision = async (action) => {
    if (!pendingAmend) return;
    setAmendActionLoading(true);
    try {
      const res = await fetch(`${API}/api/amendments/action`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem("bms_token") || ""}` },
        body: JSON.stringify({ request_id: pendingAmend.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      showToast(action === "Approved" ? "Amendment approved — clone moved to Draft" : "Amendment rejected — clone removed");

      // FORCE UI UPDATE: Immediately hide the box by clearing state
      setPendingAmend(null);
      setData(prev => ({
        ...prev,
        order: prev.order ? { ...prev.order, status: action === "Approved" ? "Draft" : prev.order.status } : null
      }));

      // After Approve, this clone's status flipped to Draft. After Reject the clone is gone.
      if (action === "Rejected" && onBack) {
        onBack();
      } else {
        fetchOrderDetails();
        fetchAmendHistory();
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setAmendActionLoading(false);
    }
  };

  const handleCancelAmend = async (comment = "") => {
    setCancelAmendLoading(true);
    try {
      const isPendingRequestCancel = order.status === "Amendment Request";
      const res = await fetch(`${API}/api/amendments/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("bms_token") || ""}` },
        body: JSON.stringify(
          isPendingRequestCancel
            ? { order_id: orderId, comment }
            : { clone_order_id: orderId, comment }
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Cancel failed");
      showToast(
        isPendingRequestCancel
          ? "Amendment request cancelled."
          : "Amendment cancelled — original order restored to Issued."
      );
      setTimeout(() => { if (onBack) onBack(); }, 1500);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setCancelAmendLoading(false);
    }
  };

  const handleWithdrawDirectAction = async (actionType, comment = "") => {
    setCancelAmendLoading(true);
    try {
      const res = await fetch(`${API}/api/action-requests/withdraw-direct-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("bms_token") || ""}` },
        body: JSON.stringify({ order_id: orderId, action_type: actionType, comment }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Withdraw failed");
      showToast(actionType === "recall" ? "Recall cancelled — order restored to Issued." : "Cancel order withdrawn — order restored to Issued.");
      setTimeout(() => { if (onBack) onBack(); }, 1500);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setCancelAmendLoading(false);
    }
  };

  const openCancelCommentModal = (type) => {
    setCancelCommentModal({ open: true, type, comment: "" });
  };

  const confirmCancelAction = () => {
    const { type, comment } = cancelCommentModal;
    setCancelCommentModal({ open: false, type: null, comment: "" });
    if (type === "amendment") handleCancelAmend(comment);
    else if (type === "amendRequest") handleCancelAmend(comment);
    else if (type === "recall") handleWithdrawDirectAction("recall", comment);
    else if (type === "cancelOrder") handleWithdrawDirectAction("cancel", comment);
  };

  const fetchOrderDetails = async () => {
    const cached = getCachedOrderDetails(orderId);
    if (cached?.order) {
      setData(cached);
      setHydrating(!!cached.__partial);
    }

    try {
      const json = await preloadOrderDetails(orderId, { force: true, lean: false });
      if (json) setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setHydrating(false);
    }

    fetchApprovalData();
  };

  const handleApprovalAction = async (actionType) => {
    if ((actionType === "rejected" || actionType === "reverted") && !actionComment.trim()) {
      alert("Comment is required for Revert/Reject.");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`${API}/api/approval-flows/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("bms_token") || ""}` },
        body: JSON.stringify({
          request_id: approvalData.request.id,
          action: actionType,
          comments: actionComment,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setActionModal({ open: false, type: "" });
        setActionComment("");
        fetchOrderDetails();
        fetchApprovalData();
      } else {
        showToast(d.error || "Action failed", "error");
      }
    } catch (e) {
      showToast(e.message || "Network error", "error");
    }
    setActionLoading(false);
  };

  const handleSubmitForApproval = async () => {
    setActionLoading(true);
    try {
      const token = localStorage.getItem("bms_token") || "";
      const bmsUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const res = await fetch(`${API}/api/approval-flows/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ module: "order", document_id: orderId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Submit failed");

      if (d.skip && !d.auto_approved) {
        // No flow matched — push directly to Pending Issue
        const reason = d.skip_reason === "no_flow"
          ? "No active approval flow configured — moved to Pending Issue"
          : d.skip_reason === "no_match"
          ? "No approval flow matched this order's conditions — moved to Pending Issue"
          : "No approval flow — moved to Pending Issue";
        console.warn("[ApprovalFlow skip]", reason, d.message);
        const statusRes = await fetch(`${API}/api/orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ data: JSON.stringify({ mainData: { status: "Pending Issue", action_by: bmsUser.name || "" } }) }),
        });
        if (!statusRes.ok) {
          const statusErr = await statusRes.json().catch(() => ({}));
          throw new Error(statusErr.error || "Failed to move order to Pending Issue");
        }
      }

      showToast(
        d.auto_approved
          ? "Auto-approved — moved to Pending Issue"
          : d.skip_reason === "no_flow"
          ? "No active approval flow — moved to Pending Issue directly"
          : d.skip_reason === "no_match"
          ? "No flow matched this order's conditions — moved to Pending Issue"
          : d.skip
          ? "No approval flow — moved to Pending Issue"
          : "Submitted for approval"
      );
      setTimeout(() => { if (onBack) onBack(); }, 1500);
    } catch (err) {
      showToast(err.message, "error");
      setActionLoading(false);
    }
  };

  const updateStatus = async (newStatus, comments = "") => {
    // ── Document validation before submitting to Review ──
    if (newStatus === 'Review') {
      const preDocs = Array.isArray(order.pre_documents) ? order.pre_documents : [];
      const hasQuotation = !!order.quotation_url || preDocs.some(d => d.category === 'quotations');
      const hasProof = !!order.comparative_sheet_url || preDocs.some(d => d.category === 'comparative' || d.category === 'vendor-docs');

      if (!hasQuotation) {
        showToast("At least 1 Quotation Document is mandatory before submitting for Review.", "error");
        return;
      }
      if (!hasProof) {
        showToast("At least 1 Proof Document (Comparative Sheet or Vendor Doc) is mandatory before submitting for Review.", "error");
        return;
      }
    }

    setActionLoading(true);
    try {
      showToast(`Moving to ${newStatus}...`);

      const bmsUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const issuedBy = newStatus === 'Issued' ? {
        id: bmsUser.id,
        name: bmsUser.name || "",
        designation: bmsUser.designation || "",
        signatureFile: bmsUser.profile_permissions?.ui?.signature || null,
      } : undefined;
      const res = await fetch(`${API}/api/orders/${orderId}`, {
        method: "PUT",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: JSON.stringify({ mainData: { status: newStatus, action_by: bmsUser.name || "", ...(comments ? { comments } : {}), ...(issuedBy ? { issuedBy } : {}) } }) })
      });
      if (!res.ok) throw new Error("Status update failed");

      showToast(`Success! Order submitted for ${newStatus === 'Review' ? 'Review' : 'Approval'}.`);
      setTimeout(() => {
        if (onBack) onBack();
      }, 1500);
    } catch (err) {
      showToast(err.message, "error");
      setActionLoading(false);
    }
  };

  const handleSafeDownload = async (download = true) => {
    const orderId = data?.order?.id;
    if (!orderId) { showToast("Order not ready", "error"); return; }
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const url = `${API}/api/orders/${orderId}/pdf${download ? "?download=1" : ""}`;
      if (download) {
        const res = await fetch(url);
        if (!res.ok) throw new Error("PDF generation failed");
        const blob = await res.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = makeOrderPdfFilename(data.order?.order_number);
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(href);
      } else {
        window.open(url, "_blank");
      }
    } catch (err) {
      console.error("PDF error:", err);
      showToast("PDF failed. Please try again.", "error");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleAmendRequest = async () => {
    if (!amendReason.trim()) { showToast("Reason is required", "error"); return; }
    if (!amendFile) { showToast("Proof attachment is required", "error"); return; }
    setAmendLoading(true);
    try {
      let attachment_url = "";
      const formData = new FormData();
      formData.append("file", amendFile);
      formData.append("order_number", order.order_number || "");
      const upRes = await fetch(`${API}/api/orders/upload`, {
        method: "POST",
        body: formData,
      });
      if (!upRes.ok) {
        const errJson = await upRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Attachment upload failed");
      }
      const upJson = await upRes.json();
      attachment_url = upJson.url;
      if (!attachment_url) throw new Error("Upload returned no URL");

      // Power users (recall/cancel permission) amend directly → order to Draft
      // Regular users submit a pending request that needs admin approval
      const isDirect = userCanRecall || userCanCancel;
      const endpoint = isDirect
        ? `${API}/api/action-requests/direct-amend`
        : `${API}/api/amendments/request`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem("bms_token") || ""}` },
        body: JSON.stringify({ order_id: orderId, reason: amendReason, attachment_url })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setAmendModal(false);
      setAmendReason("");
      setAmendFile(null);

      if (isDirect && data.clone_id) {
        showToast("Amendment draft created!");
        if (onBack) onBack();
      } else {
        showToast("Amendment request submitted successfully!");
        fetchOrderDetails();
        fetchAmendHistory();
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setAmendLoading(false);
    }
  };


  const { order, items } = data;
  if (!order) return null; // Silent while initial data is missing or syncing

  const isDraftNum = /^(PO|WO)-\d+$/.test(order.order_number || '');
  const isOldPending = order.order_number?.startsWith("PENDING-");
  const isPending = isDraftNum || isOldPending;
  const hasRecallHistory = (() => {
    const snapshot = order.snapshot || {};
    const matchesRecall = (entry) => String(entry?.action || entry?._history_action || "").toLowerCase() === "recalled";
    return order.status === "Recalled" ||
      matchesRecall(order) ||
      (Array.isArray(snapshot.activity_log) && snapshot.activity_log.some(matchesRecall)) ||
      (Array.isArray(snapshot.status_history) && snapshot.status_history.some(matchesRecall));
  })();
  const hasCancelHistory = (() => {
    const snapshot = order.snapshot || {};
    const matchesCancel = (entry) => String(entry?.action || entry?._history_action || "").toLowerCase() === "cancelled";
    return order.status === "Cancelled" ||
      matchesCancel(order) ||
      (Array.isArray(snapshot.activity_log) && snapshot.activity_log.some(matchesCancel)) ||
      (Array.isArray(snapshot.status_history) && snapshot.status_history.some(matchesCancel));
  })();
  const wasRecalledToDraft = order.status === "Draft" && hasRecallHistory;
  const isDraftAmendment = order.status === "Draft" && !!order.amended_from_id;
  const isDraftRecall = order.status === "Draft" && !order.amended_from_id && wasRecalledToDraft;
  const canCancelDraftDirectAction =
    order.status === "Draft" &&
    (isDraftAmendment || isDraftRecall) &&
    (isGlobalAdmin || String(order.created_by_id) === String(thisUser.id));
  const isCancelledDirectAction = order.status === "Cancelled" && hasCancelHistory;
  const amendRequesterId =
    pendingAmend?.requestor_id ??
    pendingAmend?.requested_by_id ??
    pendingAmend?.created_by_id ??
    pendingAmend?.made_by_id;
  const canCancelPendingAmendRequest =
    order.status === "Amendment Request" &&
    !!pendingAmend &&
    String(amendRequesterId || "") === String(thisUser.id);

  const getVal = (v) => Array.isArray(v) ? v[0] : v;
  const normalizeRichTextHtml = (html) =>
    typeof html === "string"
      ? html.replace(/&nbsp;|\u00A0/g, " ")
      : html;
  const cleanQuillHtml = (html) => {
    if (!html) return "";
    if (typeof document === "undefined") {
      return html
        .replace(/<span class="ql-ui"[^>]*><\/span>/gi, "")
        .replace(/<span class="ql-ui"[^>]*\/>/gi, "")
        .replace(/\s*data-list="[^"]*"/gi, "")
        .replace(/\s*class="ql-indent-\d+"/gi, "");
    }

    const container = document.createElement("div");
    container.innerHTML = html;
    const stripQuillListAttrs = (root) => {
      root.querySelectorAll(".ql-ui").forEach(el => el.remove());
      root.querySelectorAll("li").forEach(li => {
        li.removeAttribute("data-list");
        const classes = (li.getAttribute("class") || "")
          .split(/\s+/)
          .filter(cls => cls && !/^ql-indent-\d+$/.test(cls));
        if (classes.length) li.setAttribute("class", classes.join(" "));
        else li.removeAttribute("class");
      });
    };
    const directListItems = (list) =>
      Array.from(list.children).filter(child => child.tagName === "LI");
    const getIndent = (li) => {
      const match = (li.getAttribute("class") || "").match(/\bql-indent-(\d+)\b/);
      return match ? Number(match[1]) || 0 : 0;
    };
    const getListTag = (li, fallbackTag) =>
      li.getAttribute("data-list") === "bullet" ? "ul" : fallbackTag;
    const itemHtml = (li) => {
      const clone = li.cloneNode(true);
      Array.from(clone.children)
        .filter(child => child.tagName === "OL" || child.tagName === "UL")
        .forEach(child => child.remove());
      stripQuillListAttrs(clone);
      return clone.innerHTML;
    };
    const buildNestedList = (items, fallbackTag) => {
      const root = document.createElement(items[0]?.tag || fallbackTag);
      const listsAtLevel = [root];
      const lastLiAtLevel = [];
      items.forEach(item => {
        let level = item.indent;
        while (level > 0 && !lastLiAtLevel[level - 1]) level -= 1;
        if (level > 0 && !listsAtLevel[level]) {
          const childList = document.createElement(item.tag);
          lastLiAtLevel[level - 1].appendChild(childList);
          listsAtLevel[level] = childList;
        }
        if (level > 0 && listsAtLevel[level].tagName.toLowerCase() !== item.tag) {
          const childList = document.createElement(item.tag);
          lastLiAtLevel[level - 1].appendChild(childList);
          listsAtLevel[level] = childList;
        }
        const li = document.createElement("li");
        li.innerHTML = item.html;
        listsAtLevel[level].appendChild(li);
        lastLiAtLevel[level] = li;
        listsAtLevel.length = level + 1;
        lastLiAtLevel.length = level + 1;
      });
      return root;
    };

    Array.from(container.querySelectorAll("ol, ul")).forEach(list => {
      if (!container.contains(list)) return;
      const listItems = directListItems(list);
      const hasQuillFlatItems = listItems.some(li =>
        li.hasAttribute("data-list") || /\bql-indent-\d+\b/.test(li.getAttribute("class") || "")
      );
      if (!hasQuillFlatItems) return;
      const fallbackTag = list.tagName.toLowerCase();
      const items = listItems.map(li => ({
        indent: getIndent(li),
        tag: getListTag(li, fallbackTag),
        html: itemHtml(li),
      }));
      list.replaceWith(buildNestedList(items, fallbackTag));
    });

    stripQuillListAttrs(container);
    return container.innerHTML;
  };
  const renderRichHtml = (html) => cleanQuillHtml(normalizeRichTextHtml(html));
  const isRichTextEmpty = (html) => {
    if (html === null || html === undefined) return true;
    if (typeof html !== "string") return false;
    const text = html
      .replace(/<br\s*\/?>(?=\s*<\/)/gi, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, "")
      .trim();
    return text.length === 0;
  };
  const formatSignatureDate = (value) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";

    const parts = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).formatToParts(date);

    const day = parts.find((part) => part.type === "day")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const year = parts.find((part) => part.type === "year")?.value;

    return [day, month, year].filter(Boolean).join(" - ");
  };

  const isKacha = ["Draft", "Review"].includes(order.status);
  const snap = order.snapshot || {};

  const comp = isKacha
    ? (getVal(order.companies) || snap.company || {})
    : (snap.company || getVal(order.companies) || {});

  const vend = isKacha
    ? (getVal(order.vendors) || snap.vendor || {})
    : (snap.vendor || getVal(order.vendors) || {});

  const site = normalizeOrderSite(
    isKacha
      ? (getVal(order.sites) || snap.site || {})
      : (snap.site || getVal(order.sites) || {})
  );

  const liveContact = getVal(order.contact_person);
  const contacts = isKacha
    ? (snap.contacts || (liveContact ? [liveContact] : []))
    : (snap.contacts || (liveContact ? [liveContact] : []));
  const totals = order.totals || {};

  // Resolve billing: state profile → entity billing fallback
  const resolvedBillingProfile = (() => {
    // Prefer pre-computed profile saved in snapshot
    if (snap.billingProfile) return snap.billingProfile;

    const siteState = site.state;
    const blocks = comp.stateBillingProfiles || [];

    // 1. Try state-specific profile
    if (siteState && blocks.length) {
      const block = blocks.find(b => b.stateName?.toLowerCase() === siteState.toLowerCase());
      const profile = block?.profiles?.find(p => p.isDefault) || block?.profiles?.[0];
      if (profile) return { ...profile, source: "state" };
    }

    // 2. Fallback: entity-level billing address + gstin
    const fallbackAddr = comp.billingAddress || comp.billing_address || comp.address || "";
    const fallbackGstin = comp.billingGstin || comp.billing_gstin || comp.gstin || "";
    if (fallbackAddr || fallbackGstin) {
      return { address: fallbackAddr, gstin: fallbackGstin, source: "entity" };
    }
    return null;
  })();
  const isSupply = order.order_type === "Supply";
  const showModel = (totals.showModel === true || (totals.showModel !== false && groupedItems.some(it => it.model_number)));
  const showBrand = (totals.showBrand === true || (totals.showBrand !== false && groupedItems.some(it => it.make || it.brand)));
  const showDiscount = totals.discount_mode === "line";
  const showRemarks = (totals.showRemarks === true || (totals.showRemarks !== false && groupedItems.some(it => it.remarks)));




  const FALLBACK = "--";
  const RUPEE = "\u20B9";
  const vendorDisplayName = vend.vendorName || vend.vendor_name || "Vendor";
  const vendorSignatoryName = vend.contactPerson || vend.contact_person || vendorDisplayName || FALLBACK;
  const isIssuedLike = order.status === "Issued" || order.status === "Amended";
  const issuer = order.totals?.issuedBy || null;
  // Fallback: pull issuer name from activity_log "Issued" entry if totals.issuedBy is missing/empty
  const issuedLogEntry = (() => {
    const log = Array.isArray(order.snapshot?.activity_log) ? order.snapshot.activity_log : [];
    return [...log].reverse().find(e => e.action === "Issued" && e.action_by) || null;
  })();
  const issuedAt = order.totals?.issuedAt || issuedLogEntry?.action_at || order.purchase_order_date || null;
  const poDate = isIssuedLike ? formatSignatureDate(issuedAt) : FALLBACK;
  const issuerNameRaw =
    (issuer?.name && issuer.name.trim()) ||
    (issuedLogEntry?.action_by && String(issuedLogEntry.action_by).trim()) ||
    "";
  const issuerName = isIssuedLike ? (issuerNameRaw || FALLBACK) : FALLBACK;
  const issuerDesignationRaw = (issuer?.designation && issuer.designation.trim()) || "";
  const issuerDesignation = isIssuedLike ? (issuerDesignationRaw || null) : null;
  const TABS = ["Order Details", "Approvals", "Log", "Order Documents", "PDF View", "Vendor Invoices", "Payments"];
  const detailLabelCls = "text-[11px] font-medium text-slate-400 mb-0.5";
  const detailValueCls = "text-[13px] font-semibold text-slate-950 leading-snug";
  const cardTitleCls = "text-[14px] font-semibold text-slate-950 mb-3 flex items-center gap-2";
  const bodyLabelCls = "text-[11px] font-medium text-slate-400 mb-0.5";
  const bodyValueCls = "text-[13px] font-medium text-slate-950 leading-relaxed";
  const sectionLabelCls = "text-[11px] font-semibold text-slate-400 mb-1.5 mt-3";
  const contactRowCls = "flex items-center gap-2 text-[13px] font-medium text-slate-950 leading-relaxed";
  const contactIconCls = "h-3.5 w-3.5 shrink-0 text-slate-700";

  // ── Approval Action Logic (Global) ──
  const approvalRequest = approvalData.request;
  const approvalLogs = approvalData.logs || [];
  const flowSnapshot = approvalRequest?.flow_snapshot;
  const flowLevels = flowSnapshot?.levels || [];
  const currentLevelIdx = approvalRequest ? (approvalRequest.current_level - 1) : -1;
  const currentLevel = currentLevelIdx >= 0 ? flowLevels[currentLevelIdx] : null;
  const isUserInLevel = (lvl) =>
    (lvl?.designations || []).some(d =>
      (d.users || []).some(u => String(u.id) === String(thisUser.id))
    );
  const isCurrentApprover = !!currentLevel && isUserInLevel(currentLevel);
  const isPendingApproval = order.status === "Pending Approval";
  const isPendingIssue = ["Pending Issue", "To Issue"].includes(order.status);
  const isIssued = order.status === 'Issued';
  const canWithdrawApproval =
    isPendingApproval &&
    approvalRequest?.status === "pending" &&
    (isGlobalAdmin || String(approvalRequest?.requested_by) === String(thisUser.id));

  const preIssueActions = [
    { key: "approved", label: "Approve", color: "indigo", needsComment: false },
    { key: "reverted", label: "Revert", color: "amber", needsComment: true },
    { key: "rejected", label: "Reject", color: "rose", needsComment: true },
  ];

  const inHandlers = (actionKey) =>
    (handlers.order?.[actionKey]?.users || []).some(u => String(u.id) === String(thisUser.id));
  const isIssueHandler  = isGlobalAdmin || inHandlers("issue");
  const isRecallHandler = isGlobalAdmin || inHandlers("recall");
  const isAmendHandler  = isGlobalAdmin || inHandlers("amend");
  const isCancelHandler = isGlobalAdmin || inHandlers("cancel");

  const userCanRecall = isRecallHandler;
  const userCanCancel = isCancelHandler;
  const canWithdrawCancelledOrder =
    isCancelledDirectAction &&
    (isGlobalAdmin || String(order.created_by_id) === String(thisUser.id));
  const postIssueActions = [];
  if (isIssued && userCanRecall) postIssueActions.push({ key: "Recalled", label: "Recall", color: "purple", needsComment: true });
  if (isIssued && userCanCancel) postIssueActions.push({ key: "Cancelled", label: "Cancel", color: "slate", needsComment: true });

  const canActPreIssue = isPendingApproval && approvalRequest && (isGlobalAdmin || isCurrentApprover);
  const canActPendingIssue = isPendingIssue && isIssueHandler;
  const canActPostIssue = isIssued && postIssueActions.length > 0;
  const fallbackAdmin = isPendingApproval && !approvalRequest && isGlobalAdmin;

  const colorClass = (color) => ({
    indigo: "bg-indigo-600 hover:bg-indigo-700",
    emerald: "bg-emerald-600 hover:bg-emerald-700",
    amber: "bg-amber-500 hover:bg-amber-600",
    rose: "bg-rose-600 hover:bg-rose-700",
    purple: "bg-purple-600 hover:bg-purple-700",
    slate: "bg-slate-700 hover:bg-slate-800",
  }[color] || "bg-slate-600 hover:bg-slate-700");

  const runApprovalAction = (actionType, needsComment) => {
    // "revert"/"reject" are pending-issue handler actions (different from approval flow "reverted"/"rejected")
    if (actionType === "revert" || actionType === "reject") {
      setActionModal({ open: true, type: actionType });
      return;
    }
    const forceComment = ["reverted", "rejected", "Recalled", "Cancelled"].includes(actionType);
    if (needsComment || forceComment) {
      setActionModal({ open: true, type: actionType });
      return;
    }
    if (approvalData.request) {
      setActionComment("");
      handleApprovalAction(actionType);
    } else if (isGlobalAdmin) {
      const nextStatus = actionType === "reverted" ? "Review" : "Rejected";
      updateStatus(nextStatus);
    }
  };

  const allActions = canActPreIssue ? preIssueActions : canActPostIssue ? postIssueActions : [];
  const showGlobalActionBar = canActPreIssue || canActPostIssue || fallbackAdmin;

  return (
    <>
      <style>{`
        .pdf-fit-nowrap {
          min-width: 0;
          max-width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .quill-content ul { padding-left: 1.5rem !important; margin: 6px 0 !important; }
        .quill-content ul > li { list-style-type: disc !important; display: list-item !important; }
        .quill-content ol { padding-left: 1.25rem !important; margin: 4px 0 !important; }
        .quill-content ol > li { list-style-type: decimal !important; display: list-item !important; }
        .quill-content ol ol { padding-left: 1.5rem !important; }
        .quill-content ol ol > li { list-style-type: lower-alpha !important; }
        .quill-content ol ol ol > li { list-style-type: lower-roman !important; }
        .quill-content li { text-align: left !important; margin-bottom: 0.55rem !important; line-height: 1.65 !important; }
        .quill-content p { margin-bottom: 5px !important; text-align: left !important; line-height: 1.65 !important; }
        .quill-content strong { font-weight: 700 !important; }
        .quill-content em { font-style: italic !important; }
        .quill-content u { text-decoration: underline !important; }

        .order-rich-text,
        .order-rich-text * {
          max-width: 100%;
          white-space: normal !important;
          word-break: normal !important;
          overflow-wrap: break-word !important;
          word-wrap: break-word !important;
          hyphens: none !important;
        }

        .order-rich-text p,
        .order-rich-text div,
        .order-rich-text span,
        .order-rich-text li {
          margin: 0;
        }

        .order-rich-text ol,
        .order-rich-text ul {
          margin: 0;
          padding-left: 1.25rem;
        }

        /* Make numbered/bulleted markers bold + black (Quill content) */
        .order-rich-text ol > li::marker,
        .order-rich-text ul > li::marker,
        .quill-content ol > li::marker,
        .quill-content ul > li::marker {
          color: rgb(15 23 42) !important; /* slate-900 */
          font-weight: 900 !important;
        }

        .ql-align-center { text-align: center !important; }
        .ql-align-right { text-align: right !important; }
        .ql-align-justify { text-align: justify !important; }
        .quill-content { text-align: justify !important; }
        .quill-content p, .quill-content div { text-align: justify; }

        @media print {
          @page { margin: 0; size: A4 portrait; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: white !important; margin: 0 !important; padding: 0 !important; }

          /* Hide everything, show only print area */
          body * { visibility: hidden !important; }
          #view-order-print-area,
          #view-order-print-area * { visibility: visible !important; }
          #view-order-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            max-width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .page-container {
            width: 210mm !important;
            height: 297mm !important;
            overflow: hidden !important;
            box-shadow: none !important;
            border: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>
    <div className="bg-slate-50 min-h-screen text-sm w-full mx-auto pb-20 relative">
      {toast && (
        <div className={`fixed top-5 right-5 z-[999] px-4 py-3 rounded-xl text-sm font-medium shadow-lg transition-all animate-in slide-in-from-top-2
          ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}> 
          {toast.msg}
        </div>
      )}

      <style>{`
        .pdf-fit-nowrap {
          min-width: 0;
          max-width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .quill-content ul { padding-left: 1.5rem !important; margin: 6px 0 !important; }
        .quill-content ul > li { list-style-type: disc !important; display: list-item !important; }
        .quill-content ol { padding-left: 1.25rem !important; margin: 4px 0 !important; }
        .quill-content ol > li { list-style-type: decimal !important; display: list-item !important; }
        .quill-content ol ol { padding-left: 1.5rem !important; }
        .quill-content ol ol > li { list-style-type: lower-alpha !important; }
        .quill-content ol ol ol > li { list-style-type: lower-roman !important; }
        .quill-content li { text-align: left !important; margin-bottom: 0.55rem !important; line-height: 1.65 !important; }
        .quill-content p { margin-bottom: 5px !important; text-align: left !important; line-height: 1.65 !important; }
        .quill-content strong { font-weight: 700 !important; }
        .quill-content em { font-style: italic !important; }
        .quill-content u { text-decoration: underline !important; }

        .order-rich-text,
        .order-rich-text * {
          max-width: 100%;
          white-space: normal !important;
          word-break: normal !important;
          overflow-wrap: break-word !important;
          word-wrap: break-word !important;
          hyphens: none !important;
        }

        .order-rich-text p,
        .order-rich-text div,
        .order-rich-text span,
        .order-rich-text li {
          margin: 0;
        }

        .order-rich-text ol,
        .order-rich-text ul {
          margin: 0;
          padding-left: 1.25rem;
        }

        .ql-align-center { text-align: center !important; }
        .ql-align-right { text-align: right !important; }
        .ql-align-justify { text-align: justify !important; }
        .quill-content { text-align: justify !important; }
        .quill-content p, .quill-content div { text-align: justify; }

        @media print {
          @page { margin: 0; size: A4 portrait; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: white !important; margin: 0 !important; padding: 0 !important; }

          /* Hide everything, show only print area */
          body * { visibility: hidden !important; }
          #view-order-print-area,
          #view-order-print-area * { visibility: visible !important; }
          #view-order-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            max-width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .page-container {
            width: 210mm !important;
            height: 297mm !important;
            overflow: hidden !important;
            box-shadow: none !important;
            border: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            page-break-after: always !important;
            break-after: page !important;
          }
          .page-container:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>

      <style>{`
        .calc-thin-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .calc-thin-scroll::-webkit-scrollbar-track { background: transparent; }
        .calc-thin-scroll::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.8); border-radius: 999px; }
        .calc-thin-scroll::-webkit-scrollbar-thumb:hover { background: rgba(99,102,241,0.9); }
      `}</style>

      {/* Calculation Breakdown Modal */}
      {calcModalOpen && (() => {
        const itemsForCalc = (data.items || []).map((it) => {
          const qty = Number(it.qty) || 0;
          const unitRate = Number(it.unit_rate) || 0;
          const dPct = Number(it.discount_pct) || 0;
          const tPct = Number(it.tax_pct) || 0;
          const gross = qty * unitRate;
          const dAmt = gross * dPct / 100;
          const net = gross - dAmt;
          const rowGst = net * tPct / 100;
          const total = Number(it.amount) || (net + rowGst);
          return {
            id: it.id,
            itemName: it.material_name || it.items?.material_name || it.item?.material_name || "Unknown",
            spec: it.specification || it.description || "—",
            qty,
            unitRate,
            gross,
            dAmt,
            rowGst,
            total,
          };
        });
        const taxableAmt = (subtotal || 0) - (discAmt || 0);
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-4xl rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h2 className="text-base font-black text-slate-900">Calculation breakdown</h2>
                  <p className="text-xs text-slate-400">How the total is calculated (simple steps)</p>
                </div>
                <button onClick={() => setCalcModalOpen(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 bg-slate-50">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="bg-white border border-slate-200 rounded-md p-4">
                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-3">Step by step</p>
                    <div className="space-y-2 text-[13px] font-medium text-slate-600">
                      <div className="flex items-center justify-between">
                        <span>1) Subtotal (Σ Qty × Rate)</span>
                        <span className="text-slate-900 font-bold">{RUPEE}{Number(subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>2) Discount{discountPct ? ` (${discountPct}%)` : ""}</span>
                        <span className="text-slate-900 font-bold">- {RUPEE}{Number(discAmt).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>3) Taxable amount</span>
                        <span className="text-slate-900 font-bold">{RUPEE}{Number(taxableAmt).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>4) GST</span>
                        <span className="text-slate-900 font-bold">{RUPEE}{Number(totalGst).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>5) Freight{frightTax ? ` (${frightTax}%)` : ""}</span>
                        <span className="text-slate-900 font-bold">{RUPEE}{Number(fright).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="pt-3 mt-2 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-slate-900 font-bold">Grand Total</span>
                        <span className="text-slate-900 font-bold text-base">{RUPEE}{Number(grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-md p-4">
                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-3">Formula view</p>
                    <div className="text-[13px] font-medium text-slate-600 space-y-2">
                      <p><span className="text-slate-900 font-bold">Subtotal</span> = Σ(Qty × Rate)</p>
                      <p><span className="text-slate-900 font-bold">Discount</span> = Subtotal × Discount%</p>
                      <p><span className="text-slate-900 font-bold">Taxable</span> = Subtotal − Discount</p>
                      <p><span className="text-slate-900 font-bold">GST</span> = Σ(Item Base × Tax%)</p>
                      <p><span className="text-slate-900 font-bold">Grand Total</span> = Taxable + Freight + GST</p>
                    </div>
                    <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-3">
                      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-1">Total in words</p>
                      <p className="text-sm font-semibold text-slate-900">{amountToWords(Number(grandTotal) || 0)}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 bg-white border border-slate-200 rounded-md overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Line items</p>
                    <p className="text-xs text-slate-400">Qty × Rate → Discount → GST → Total</p>
                  </div>
                  <div className="overflow-x-auto calc-thin-scroll">
                    <table className="min-w-[900px] w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr className="border-b border-slate-100 text-slate-600 text-[13px] font-medium">
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-left">Spec</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Rate</th>
                          <th className="px-3 py-2 text-right">Gross</th>
                          <th className="px-3 py-2 text-right">Disc</th>
                          <th className="px-3 py-2 text-right">GST</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsForCalc.map((p) => (
                          <tr key={p.id} className="border-b border-slate-50 last:border-0 text-[13px] font-medium text-slate-600">
                            <td className="px-3 py-2 text-slate-900 font-bold">{p.itemName}</td>
                            <td className="px-3 py-2">
                              <span className="line-clamp-2" dangerouslySetInnerHTML={{ __html: typeof p.spec === "string" ? p.spec : "—" }} />
                            </td>
                            <td className="px-3 py-2 text-right">{Number(p.qty).toLocaleString("en-IN")}</td>
                            <td className="px-3 py-2 text-right">{RUPEE}{Number(p.unitRate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2 text-right">{RUPEE}{Number(p.gross).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2 text-right">{RUPEE}{Number(p.dAmt).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2 text-right">{RUPEE}{Number(p.rowGst).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2 text-right text-slate-900 font-bold">{RUPEE}{Number(p.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-white shrink-0 flex items-center justify-end">
                <button
                  onClick={() => setCalcModalOpen(false)}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 print:hidden">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-500">
              <ArrowLeft size={18} />
            </button>
            <div className="text-slate-400 text-xs font-semibold flex items-center gap-2">
              Purchase Orders <span className="text-slate-300">&gt;</span> <span className="text-slate-700">View</span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3">
              {order.status === 'Draft' && (
                <>
                  {canCancelDraftDirectAction && (
                    <button
                      disabled={cancelAmendLoading}
                      onClick={() => isDraftRecall ? openCancelCommentModal("recall") : openCancelCommentModal("amendment")}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60">
                      {cancelAmendLoading ? "Cancelling..." : (isDraftRecall ? "Cancel Recall" : "Cancel Amendment")}
                    </button>
                  )}
                  <button disabled={actionLoading} onClick={() => updateStatus('Review')}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm text-xs transition-all">
                    Submit to Review
                  </button>
                  {(isGlobalAdmin || !!myOrderPerms.can_add) && (
                    <button onClick={() => onEdit && onEdit(orderId)}
                      className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg shadow-sm text-xs hover:bg-slate-50 transition-all">
                      Edit Order
                    </button>
                  )}
                </>
              )}

              {order.status === 'Cancelled' && canWithdrawCancelledOrder && (
                <button
                  disabled={cancelAmendLoading}
                  onClick={() => openCancelCommentModal("cancelOrder")}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60">
                  {cancelAmendLoading ? "Withdrawing..." : "Withdraw Cancel Order"}
                </button>
              )}

              {order.status === 'Review' && (
                <>
                  <button disabled={actionLoading} onClick={handleSubmitForApproval}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm text-xs transition-all">
                    {actionLoading ? "Submitting..." : "Submit for Approval"}
                  </button>
                  {(isGlobalAdmin || !!myOrderPerms.can_add) && (
                    <button onClick={() => onEdit && onEdit(orderId)}
                      className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg shadow-sm text-xs hover:bg-slate-50 transition-all">
                      Edit Order
                    </button>
                  )}
                </>
              )}

              {order.status === 'Amendment Request' && (
                <>
                  {isAmendHandler ? (
                    <span className="px-3 py-1.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider">
                      Amendment Pending Review
                    </span>
                  ) : canCancelPendingAmendRequest && (
                    <button
                      disabled={cancelAmendLoading}
                      onClick={() => openCancelCommentModal("amendRequest")}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60">
                      {cancelAmendLoading ? "Withdrawing..." : "Withdraw Amend Request"}
                    </button>
                  )}
                </>
              )}

              {/* Pending Issue — Issue / Revert / Reject for issue handler */}
              {canActPendingIssue && (
                <>
                  <button disabled={actionLoading}
                    onClick={() => runApprovalAction("revert", true)}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60">
                    Revert
                  </button>
                  <button disabled={actionLoading}
                    onClick={() => runApprovalAction("reject", true)}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60">
                    Reject
                  </button>
                  <button disabled={actionLoading}
                    onClick={() => handleIssueAction("issue")}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60">
                    {actionLoading ? "Issuing..." : "Issue Order"}
                  </button>
                </>
              )}

              {/* Pending Approval — withdraw + approve/reject/revert actions */}
              {isPendingApproval && (
                <>
                  {canWithdrawApproval && (
                    <button
                      disabled={withdrawLoading}
                      onClick={handleWithdrawApproval}
                      className="px-4 py-2 bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60 flex items-center gap-1.5">
                      <Undo2 size={13} />
                      {withdrawLoading ? "Withdrawing..." : "Withdraw Request"}
                    </button>
                  )}
                  {showGlobalActionBar && (allActions.length > 0 ? allActions : (fallbackAdmin ? [
                    { key: "reverted", label: "Revert", color: "amber", needsComment: true },
                    { key: "rejected", label: "Reject", color: "rose", needsComment: true },
                  ] : [])).map(a => (
                    <button key={a.key} disabled={actionLoading}
                      onClick={() => runApprovalAction(a.key, a.needsComment)}
                      className={`px-4 py-2 ${colorClass(a.color)} text-white font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60`}>
                      {a.label}
                    </button>
                  ))}
                </>
              )}

              {(order.status === 'Issued' || order.status === 'Amended' || isPendingIssue) && (
                <>
                  {order.status === 'Issued' && (
                    <>
                      {/* Power users: Amend button always visible (pending request doesn't block them) */}
                      {(userCanRecall || userCanCancel) && canRequestAmend && (
                        <button onClick={() => setAmendModal(true)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm text-xs transition-all">
                          Amend
                        </button>
                      )}
                      {/* Withdraw request — only to requester AND if they have withdraw permission */}
                      {pendingActionRequest &&
                        String(pendingActionRequest.requestor_id) === String(thisUser.id) &&
                        (isGlobalAdmin || (
                          pendingActionRequest.request_type === "recall"
                            ? !!myOrderPerms.can_withdraw_recall
                            : !!myOrderPerms.can_withdraw_cancel
                        )) && (
                        <button onClick={cancelActionRequest} disabled={requestLoading}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60">
                          {pendingActionRequest.request_type === "recall"
                            ? "Withdraw Recall Request"
                            : "Withdraw Cancel Request"}
                        </button>
                      )}
                      {/* Regular users: Request dropdown — permission-gated, hide if pending request exists */}
                      {!userCanRecall && !userCanCancel && !pendingActionRequest && (() => {
                        const canAmend  = isGlobalAdmin || !!myOrderPerms.can_request_amend;
                        const canRecall = isGlobalAdmin || !!myOrderPerms.can_request_recall;
                        const canCancel = isGlobalAdmin || !!myOrderPerms.can_request_cancel;
                        if (!canAmend && !canRecall && !canCancel) return null;
                        return (
                          <div className="relative">
                            <button onClick={() => setRequestDropdownOpen(v => !v)}
                              className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-lg shadow-sm text-xs transition-all flex items-center gap-1.5">
                              Request ▾
                            </button>
                            {requestDropdownOpen && (
                              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                                {canAmend && (
                                  <button onClick={() => { setRequestDropdownOpen(false); setAmendModal(true); }}
                                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all">
                                    Amend Request
                                  </button>
                                )}
                                {canRecall && (
                                  <button onClick={() => { setRequestDropdownOpen(false); setRequestModal({ open: true, type: "recall" }); }}
                                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all">
                                    Recall Order
                                  </button>
                                )}
                                {canCancel && (
                                  <button onClick={() => { setRequestDropdownOpen(false); setRequestModal({ open: true, type: "cancel" }); }}
                                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all">
                                    Cancel Order
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  )}
                  {canActPostIssue && postIssueActions.map(a => (
                    <button key={a.key} disabled={actionLoading}
                      onClick={() => runApprovalAction(a.key, a.needsComment)}
                      className={`px-4 py-2 ${colorClass(a.color)} text-white font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60`}>
                      {a.label}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-5 lg:px-6 pb-3">
          {(() => {
            const statusRaw = order.status ? order.status.toString().trim() : "Draft";
            const statusLabel = statusRaw.toUpperCase();

            const displayNo = isOldPending
              ? `${order.order_type === 'Supply' ? 'PO' : 'WO'}-DRAFT`
              : order.order_number;

            const getStatusColor = (s) => {
              const low = s.toLowerCase();
              if (low === 'draft') return 'bg-slate-100 text-slate-600 border-slate-200';
              if (low === 'issued') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
              if (low === 'amended' || low === 'amendment request') return 'bg-amber-50 text-amber-700 border-amber-200';
              if (low === 'review' || low === 'in review') return 'bg-blue-50 text-blue-700 border-blue-200';
              return 'bg-slate-100 text-slate-600 border-slate-200';
            };

            return (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-black text-slate-800">
                    {order.order_type === 'Supply' ? 'Purchase Order' : 'Work Order'}
                  </h1>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${getStatusColor(statusRaw)}`}>
                    {statusRaw}
                  </span>
                </div>
                <div className="mt-3 flex w-full items-center gap-4 bg-indigo-50/50 px-5 py-2.5 rounded-r-xl border-l-4 border-[#1b3e8a] shadow-sm">
                  <span className="text-[10px] font-black text-[#1b3e8a] uppercase tracking-[0.2em] shrink-0">Subject :</span>
                  <span className="text-[13px] font-semibold text-slate-700">{order.subject || FALLBACK}</span>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="px-4 sm:px-5 lg:px-6 flex gap-5 overflow-x-auto no-scrollbar border-t border-slate-100 pt-2.5 print:hidden">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`pb-3 text-sm font-semibold transition-all border-b-2 whitespace-nowrap 
                ${activeTab === t ? "text-indigo-600 border-indigo-600" : "text-slate-500 border-transparent hover:text-slate-700"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {order.status === "Amendment Request" && isAmendHandler && pendingAmend && (
        <div className="px-4 sm:px-5 lg:px-6 pt-3 print:hidden">
          <div className="bg-white border border-amber-200 rounded-md shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Amendment Request</p>
                <p className="text-sm font-bold text-slate-800">Review request details and take action</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  By <span className="font-semibold text-slate-800">{pendingAmend.requestor?.name || pendingAmend.made_by || "User"}</span>
                  {" "}on{" "}
                  <span className="font-semibold text-slate-800">
                    {new Date(
                      pendingAmend.created_at ||
                      pendingAmend.amend_request_at ||
                      pendingAmend.requested_at ||
                      Date.now()
                    ).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-md border border-amber-200 text-amber-700 bg-white">
                Pending
              </span>
            </div>

            <div className="px-4 sm:px-5 py-4 space-y-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Reason</p>
                <p className="text-[13px] text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-sm px-3 py-2.5">
                  {pendingAmend.reason || "No reason provided"}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Attachment</p>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {pendingAmend.attachment_url ? (
                    <a
                      href={pendingAmend.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-md text-xs font-bold hover:bg-indigo-100 transition-all"
                    >
                      <FileText size={14} />
                      View Supporting Document
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500">No attachment uploaded</span>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      disabled={amendActionLoading}
                      onClick={() => runApprovalAction("Amendment Request", true)}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md shadow-sm text-xs transition-all disabled:opacity-60"
                    >
                      {amendActionLoading ? "Working..." : "Approve Amendment"}
                    </button>
                    <button
                      disabled={amendActionLoading}
                      onClick={() => handleAmendDecision("Rejected")}
                      className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-md shadow-sm text-xs transition-all disabled:opacity-60"
                    >
                      {amendActionLoading ? "Working..." : "Reject Amendment"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingActionRequest?.status === "Pending" && (isGlobalAdmin || userCanRecall || userCanCancel) && (
        <div className="px-4 sm:px-5 lg:px-6 pt-3 print:hidden">
          <div className="bg-white border border-sky-200 rounded-md shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 py-3 bg-sky-50 border-b border-sky-100 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest">
                  {pendingActionRequest.request_type === "recall" ? "Recall Request" : "Cancel Request"}
                </p>
                <p className="text-sm font-bold text-slate-800">Review request details and take action</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  By{" "}
                  <span className="font-semibold text-slate-800">
                    {pendingActionRequest.requestor?.name || pendingActionRequest.requested_by_name || pendingActionRequest.made_by || "User"}
                  </span>
                  {" "}on{" "}
                  <span className="font-semibold text-slate-800">
                    {new Date(pendingActionRequest.created_at || Date.now()).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-md border border-sky-200 text-sky-700 bg-white">
                Pending
              </span>
            </div>

            <div className="px-4 sm:px-5 py-4 space-y-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Reason</p>
                <p className="text-[13px] text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-sm px-3 py-2.5">
                  {pendingActionRequest.reason || pendingActionRequest.comments || "No reason provided"}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Attachment</p>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {pendingActionRequest.attachment_url ? (
                    <a
                      href={pendingActionRequest.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-md text-xs font-bold hover:bg-indigo-100 transition-all"
                    >
                      <FileText size={14} />
                      View Supporting Document
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500">No attachment uploaded</span>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      disabled={arActionLoading}
                      onClick={() => handleActionRequestDecision("Approved")}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md shadow-sm text-xs transition-all disabled:opacity-60"
                    >
                      {arActionLoading ? "Working..." : `Approve ${pendingActionRequest.request_type === "recall" ? "Recall" : "Cancel"}`}
                    </button>
                    <button
                      disabled={arActionLoading}
                      onClick={() => setArRejectModal(true)}
                      className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-md shadow-sm text-xs transition-all disabled:opacity-60"
                    >
                      {arActionLoading ? "Working..." : `Reject ${pendingActionRequest.request_type === "recall" ? "Recall" : "Cancel"}`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Order Details" && (
        <div className="w-full max-w-none px-4 sm:px-5 lg:px-6 py-3 print:hidden">
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[17px] font-semibold text-slate-950 leading-tight">
                {order.order_type === 'Supply' ? 'Purchase Order' : 'Work Order'}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-4">
              <div>
                <p className={detailLabelCls}>Reference No.</p>
                <p className={detailValueCls}>{order.ref_number || FALLBACK}</p>
              </div>
              <div>
                <p className={detailLabelCls}>{order.order_type === 'Supply' ? 'PO' : 'WO'} Name</p>
                <p className={detailValueCls}>{order.order_name || FALLBACK}</p>
              </div>
              <div>
                <p className={detailLabelCls}>{order.order_type === 'Supply' ? 'Purchase' : 'Work'} Order No.</p>
                <p className={`${detailValueCls} ${isPending ? "text-amber-600 italic" : ""}`}>
                  {isOldPending ? "Assigned on Issue" : order.order_number}
                </p>
              </div>
              <div>
                <p className={detailLabelCls}>Date</p>
                <p className={detailValueCls}>{new Date(order.date_of_creation || order.created_at).toLocaleDateString("en-IN")}</p>
              </div>

              <div>
                <p className={detailLabelCls}>Subject</p>
                <p className={detailValueCls}>{order.subject || FALLBACK}</p>
              </div>
              <div>
                <p className={detailLabelCls}>Created By</p>
                <p className={detailValueCls}>{order.made_by || "N/A"}</p>
              </div>
              <div>
                <p className={detailLabelCls}>Requisition by</p>
                <p className={detailValueCls}>{order.request_by || FALLBACK}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className={cardTitleCls}>
                <User size={15} className="text-slate-500" /> Vendor Details
              </h3>
              <p className="font-semibold text-[14px] text-slate-950 mb-2">{vend.vendorName || vend.vendor_name || 'N/A'}</p>
              <div className="space-y-3">
                <div><p className={bodyLabelCls}>Address</p><p className={bodyValueCls}>{vend.address || 'N/A'}</p></div>
                <div className="pt-1">
                  <p className={sectionLabelCls}>Bank Details</p>
                  <div className="space-y-1">
                    <p className={bodyValueCls}>Beneficiary: {vend.beneficiaryName || vend.accountName || vend.accountHolder || vend.account_holder || vend.vendorName || vend.vendor_name || "N/A"}</p>
                    <p className={bodyValueCls}>Bank: {vend.bankName || vend.bank_name || "N/A"}</p>
                    <p className={bodyValueCls}>IFSC: {vend.ifscCode || vend.ifsc_code || 'N/A'}</p>
                    <p className={bodyValueCls}>Account: {vend.accountNumber || vend.account_number || 'N/A'}</p>
                  </div>
                </div>
                <div className="pt-2">
                  <p className={sectionLabelCls}>Tax Information</p>
                  <div className="space-y-1">
                    <p className={bodyValueCls}>GSTIN: {vend.gstin || 'NA'}</p>
                    <p className={bodyValueCls}>PAN: {vend.pan || 'NA'}</p>
                    <p className={bodyValueCls}>Aadhar: {vend.aadhar || vend.aadhar_no || 'N/A'}</p>
                    <p className={bodyValueCls}>MSME: {vend.msme_number || vend.msme || vend.msme_no || 'N/A'}</p>
                  </div>
                </div>
                <div className="pt-2">
                  <p className={sectionLabelCls}>Contact Information</p>
                  <div className="space-y-1">
                    <p className={contactRowCls}>
                      <User size={16} className={contactIconCls} />
                      <span>{vend.contactPerson || vend.contact_person || 'N/A'}</span>
                    </p>
                    <p className={contactRowCls}>
                      <Phone size={16} className={contactIconCls} />
                      <span>{vend.mobile || vend.phone || 'N/A'}</span>
                    </p>
                    <p className={contactRowCls}>
                      <Mail size={16} className={contactIconCls} />
                      <span className="break-all">{vend.email || 'N/A'}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className={cardTitleCls}>
                <Building2 size={15} className="text-slate-500" /> Company Details
              </h3>
              <p className="font-semibold text-[14px] text-slate-950 mb-1">{comp.companyName || comp.company_name || 'N/A'}</p>
              {(comp.companyCode || comp.company_code) && (
                <p className="text-[13px] text-slate-500 mb-4">Code: {comp.companyCode || comp.company_code}</p>
              )}
              <div className="space-y-3">
                {(site.siteName || site.siteCode) && (
                  <div>
                    <p className={bodyLabelCls}>Site</p>
                    <p className={bodyValueCls}>
                      {[site.siteName, site.siteCode && `(${site.siteCode})`].filter(Boolean).join(" ")}
                    </p>
                  </div>
                )}
                <div><p className={bodyLabelCls}>Site Address</p><p className={bodyValueCls}>{site.siteAddress || site.site_address || 'N/A'}</p></div>
                <div>
                  <p className={`${bodyLabelCls} mt-2 flex items-center gap-1.5`}>
                    Billing Address
                    {(snap.billingState || site.state) && (
                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wide">
                        {snap.billingState || site.state}
                      </span>
                    )}
                  </p>
                  <p className={bodyValueCls}>
                    {resolvedBillingProfile?.address || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className={`${bodyLabelCls} mt-2`}>GSTIN</p>
                  <p className={bodyValueCls}>
                    {resolvedBillingProfile?.gstin || 'N/A'}
                  </p>
                </div>
                {contacts.length > 0 && (
                  <div className="pt-2">
                    <p className={sectionLabelCls}>Contact Persons</p>
                    <div className="space-y-2">
                      {contacts.map((c, i) => (
                        <div key={i} className="flex flex-col gap-0.5">
                          <p className={contactRowCls}>
                            <User size={16} className={contactIconCls} />
                            <span>{c.personName || c.person_name}</span>
                          </p>
                          <p className={contactRowCls}>
                            <Phone size={16} className={contactIconCls} />
                            <span>{c.contactNumber || c.contact_number}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-md border border-slate-200 mb-6 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-slate-400" /> Items
              </h3>
            </div>
            <div className="mx-4 mt-1 mb-0 border border-slate-200 rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead className="bg-slate-900/5 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-4 text-center w-[35px] border-b border-r border-slate-200 sticky left-0 bg-[rgb(243,243,245)] z-10">S.No</th>
                    {isSupply ? (
                      <>
                        <th className="px-5 py-4 text-left w-[240px] border-b border-r border-slate-200">Item Name</th>
                        <th className="px-5 py-4 text-left w-[360px] border-b border-r border-slate-200">Specification</th>
                      </>
                    ) : (
                      <th className="px-5 py-4 text-left border-b border-r border-slate-200" style={{ minWidth: '380px' }}>Item Name & Description</th>
                    )}
                    <th className="px-4 py-4 text-center w-[60px] border-b border-r border-slate-200">Unit</th>
                    <th className="px-4 py-4 text-right w-[80px] border-b border-r border-slate-200">Qty</th>
                    <th className="px-4 py-4 text-right w-[100px] border-b border-r border-slate-200">Rate</th>
                    {showDiscount && (
                      <th className="px-3 py-4 text-right w-[60px] border-b border-r border-slate-200 tracking-tighter">Disc%</th>
                    )}
                    <th className="px-4 py-4 text-right w-[60px] border-b border-r border-slate-200">Tax%</th>

                    {showRemarks && (
                      <th className="px-4 py-4 text-left w-[120px] border-b border-r border-slate-200">Remarks</th>
                    )}

                    <th className="px-6 py-4 text-right font-black text-indigo-900 bg-indigo-50/30 border-b border-slate-200">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hydrating && groupedItems.length === 0 ? (
                    null
                  ) : groupedItems.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      {!it._isSubRow && (
                        <td rowSpan={it._rowSpan} className="px-4 py-3 text-center text-slate-600 font-bold text-[10px] border-b border-r border-slate-200 sticky left-0 bg-white z-10 align-top">
                          {it._groupSrNo < 10 ? `0${it._groupSrNo}` : it._groupSrNo}
                        </td>
                      )}

                      {isSupply ? (
                        /* Supply: separate Item Name (rowspan) + Specification columns */
                        <>
                          {!it._isSubRow && (
                            <td rowSpan={it._rowSpan} className="px-5 py-3 text-slate-800 font-bold uppercase whitespace-normal leading-tight border-b border-r border-slate-200 text-[11px] min-w-[200px] align-top">
                              {it._itemName}
                            </td>
                          )}
                          <td className="px-5 py-3 border-b border-r border-slate-200 min-w-[280px]">
                            <div className="space-y-1">
                              {(() => {
                                const desc = it.description || it.specification || it.items?.description;
                                if (!desc || desc === "--") return <span className="text-slate-300 font-bold">---</span>;
                                let points = [];
                                try { points = typeof desc === 'string' && (desc.startsWith('[') || desc.startsWith('{')) ? JSON.parse(desc) : (Array.isArray(desc) ? desc : [desc]); } catch (e) { points = [desc]; }
                                return points.map((p, i) => (
                                  <div key={i} className="text-[11px] text-slate-600 leading-snug mb-1 last:mb-0">
                                    <span className="font-medium tracking-tight whitespace-normal">{p.replace(/<[^>]*>/g, '')}</span>
                                  </div>
                                ));
                              })()}
                              {showModel && it.model_number && (
                                <div className="text-[10px] mt-0.5"><span className="font-bold text-slate-800">Model No.:</span> <span className="font-semibold text-slate-700">{it.model_number}</span></div>
                              )}
                              {showBrand && (() => { const raw = it.make || ""; if (!raw || raw === "[]" || raw === "null") return null; let b = raw; try { const p = JSON.parse(raw); if (Array.isArray(p)) { if (p.length !== 1) return null; b = p[0]; } } catch { } return b ? <div className="text-[10px]"><span className="font-bold text-slate-800">Brand:</span> <span className="font-semibold text-slate-700">{b}</span></div> : null; })()}
                            </div>
                          </td>
                        </>
                      ) : (
                        /* SITC/ITC: combined Item Name + Description in one column */
                        <td className="px-5 py-3 border-b border-r border-slate-200 align-top" style={{ minWidth: '380px' }}>
                          {!it._isSubRow && (
                            <p className="text-[11px] font-black text-slate-800 uppercase tracking-wide leading-tight mb-2 whitespace-normal">
                              {it._itemName}
                            </p>
                          )}
                          {it._rowSpan > 1 && !it._isSubRow && (
                            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">Point 1</p>
                          )}
                          {it._isSubRow && (
                            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">Point {it._subIdx}</p>
                          )}
                          <div className="space-y-1 whitespace-normal">
                            {(() => {
                              const desc = it.description || it.specification || it.items?.description;
                              if (!desc || desc === "--") return null;
                              let points = [];
                              try { points = typeof desc === 'string' && (desc.startsWith('[') || desc.startsWith('{')) ? JSON.parse(desc) : (Array.isArray(desc) ? desc : [desc]); } catch (e) { points = [desc]; }
                              return points.map((p, i) => (
                                <div key={i} className="order-rich-text text-[11px] text-slate-600 leading-relaxed whitespace-normal" dangerouslySetInnerHTML={{ __html: p }} />
                              ));
                            })()}
                            {showModel && it.model_number && (
                              <div className="text-[10px] text-slate-500 mt-1">Model No.: <span className="font-semibold text-slate-700">{it.model_number}</span></div>
                            )}
                            {showBrand && (() => { const raw = it.make || ""; if (!raw || raw === "[]" || raw === "null") return null; let b = raw; try { const p = JSON.parse(raw); if (Array.isArray(p)) { if (p.length !== 1) return null; b = p[0]; } } catch { } return b ? <div className="text-[10px]"><span className="font-bold text-slate-800">Brand:</span> <span className="font-semibold text-slate-700">{b}</span></div> : null; })()}
                          </div>
                        </td>
                      )}

                      <td className="px-4 py-3 text-center text-slate-400 font-bold uppercase text-[9px] border-b border-r border-slate-200">{it.unit || "nos"}</td>
                      <td className="px-4 py-3 text-right text-slate-800 font-bold text-[12px] border-b border-r border-slate-200">{Number(it.qty).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-right text-slate-600 font-medium text-[11px] border-b border-r border-slate-200">{RUPEE}{Number(it.unit_rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      {showDiscount && (
                        <td className="px-3 py-3 text-right text-rose-500 font-bold text-[11px] border-b border-r border-slate-200">{Number(it.discount_pct)}%</td>
                      )}
                      <td className="px-4 py-3 text-right text-slate-400 font-bold text-[11px] border-b border-r border-slate-200">{Number(it.tax_pct)}%</td>

                      {showRemarks && (
                        <td className="px-4 py-3 text-left text-slate-500 font-medium text-[10px] border-b border-r border-slate-200 whitespace-normal leading-tight">
                          {it.remarks || FALLBACK}
                        </td>
                      )}

                      <td className="px-6 py-3 text-right text-indigo-900 font-bold bg-indigo-50/20 text-[13px] border-b border-slate-200">{RUPEE}{Number(it.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-50 py-6 px-4">
              <div className="w-full flex flex-col md:flex-row gap-4 md:justify-between md:items-stretch">
                {/* Total in Words */}
                <div className="w-full md:flex-1 md:max-w-[560px] bg-slate-900/5 rounded-md border border-slate-200 px-6 py-4 shadow-sm">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Total (in words)</p>
                  <p className="mt-2 text-[13px] font-semibold text-slate-950 leading-relaxed">
                    {amountToWords(Number(grandTotal) || 0)}
                  </p>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setCalcModalOpen(true)}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline underline-offset-4"
                    >
                      View calculation
                    </button>
                  </div>
                </div>

                {/* Summary — aligned with Amount column */}
                <div className="w-full md:w-[380px] bg-slate-900/5 rounded-md border border-slate-200 px-6 py-4 space-y-3 shadow-sm">
                  <div className="flex justify-between items-center text-[13px] font-medium text-slate-600">
                    <span>Subtotal</span>
                    <span className="text-slate-900 font-bold">{RUPEE}{Number(subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>

                  {discAmt > 0 && (
                    <div className="flex justify-between items-center text-[13px] font-medium text-slate-600">
                      <span>Discount{discountPct ? ` (${discountPct}%)` : ""}</span>
                      <span className="text-slate-900 font-bold">- {RUPEE}{Number(discAmt).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  {fright > 0 && (
                    <div className="flex justify-between items-center text-[13px] font-medium text-slate-600">
                      <span>Freight{frightTax ? ` (${frightTax}%)` : ""}</span>
                      <span className="text-slate-900 font-bold">{RUPEE}{Number(fright).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  {totalGst > 0 && (
                    <div className="flex justify-between items-center text-[13px] font-medium text-slate-600">
                      <span>GST</span>
                      <span className="text-slate-900 font-bold">{RUPEE}{Number(totalGst).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-400">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-bold text-slate-900">Total</p>
                      <p className="text-lg font-bold text-slate-900">{RUPEE}{Number(grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Clause Boxes */}
          <div className="space-y-4">
            {/* Order Notes */}
            {(() => {
              const notesContent = order.notes || snap.notes;
              if (!notesContent || isRichTextEmpty(notesContent)) return null;
              return (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-semibold text-[13px] text-slate-800 mb-3 flex items-center gap-2">
                    <FileText size={14} className="text-slate-400" /> Order Notes
                  </h3>
                  <div className="quill-content order-rich-text text-[13px] text-slate-700 leading-relaxed">
                    <div dangerouslySetInnerHTML={{ __html: renderRichHtml(notesContent) }} />
                  </div>
                </div>
              );
            })()}
            {/* Terms & Conditions */}
            {(order.terms_conditions?.length > 0 || order.terms?.length > 0 || snap.terms?.length > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-[13px] text-slate-800 mb-3 flex items-center gap-2">
                  <ShieldQuestion size={14} className="text-slate-400" /> Terms & Conditions
                </h3>
                <div className="space-y-2">
                  {(() => {
                    const arr = Array.isArray(order.terms_conditions) ? order.terms_conditions : Array.isArray(order.terms) ? order.terms : Array.isArray(snap.terms) ? snap.terms : null;
                    if (arr && arr.length === 1) {
                      return (
                        <div className="quill-content order-rich-text text-[14px] leading-7 text-slate-700 text-justify bg-slate-50 border border-slate-200 rounded-lg p-4"
                          dangerouslySetInnerHTML={{ __html: renderRichHtml(arr[0]) }} />
                      );
                    }
                    if (arr && arr.length > 1) {
                      const visible = showAllTerms ? arr : arr.slice(0, 6);
                      return (
                        <>
                          <div className="space-y-2">
                            {visible.map((term, i) => (
                              <div key={i} className="flex gap-3 pl-3 border-l-2 border-slate-200">
                                <span className="text-slate-900 font-black shrink-0 text-[13px] w-6">{i + 1}.</span>
                                <div className="quill-content order-rich-text flex-1 text-[14px] leading-7 text-slate-700 text-justify"
                                  dangerouslySetInnerHTML={{ __html: renderRichHtml(term) }} />
                              </div>
                            ))}
                          </div>
                          {arr.length > 6 && (
                            <button
                              onClick={() => setShowAllTerms(v => !v)}
                              className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 underline underline-offset-4"
                            >
                              {showAllTerms ? "Show less" : `Show all (${arr.length})`}
                            </button>
                          )}
                        </>
                      );
                    }
                    const single = order.terms_conditions || order.terms || snap.terms;
                    if (single && !Array.isArray(single)) {
                      return (
                        <div className="quill-content order-rich-text text-[14px] leading-7 text-slate-700 text-justify bg-slate-50 border border-slate-200 rounded-lg p-4"
                          dangerouslySetInnerHTML={{ __html: renderRichHtml(single) }} />
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}

            {/* Payment Terms */}
            {(order.payment_terms?.length > 0 || order.paymentTerms?.length > 0 || snap.payment_terms?.length > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-[13px] text-slate-800 mb-3 flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-slate-400" /> Payment Terms
                </h3>
                <div className="space-y-2">
                  {(() => {
                    const arr = Array.isArray(order.payment_terms) ? order.payment_terms : Array.isArray(order.paymentTerms) ? order.paymentTerms : Array.isArray(snap.payment_terms) ? snap.payment_terms : null;
                    if (arr && arr.length === 1) {
                      return (
                        <div className="quill-content order-rich-text text-[14px] leading-7 text-slate-700 text-justify bg-slate-50 border border-slate-200 rounded-lg p-4"
                          dangerouslySetInnerHTML={{ __html: renderRichHtml(arr[0]) }} />
                      );
                    }
                    if (arr && arr.length > 1) {
                      const visible = showAllPaymentTerms ? arr : arr.slice(0, 6);
                      return (
                        <>
                          <div className="space-y-2">
                            {visible.map((term, i) => (
                              <div key={i} className="flex gap-3 pl-3 border-l-2 border-slate-200">
                                <span className="text-slate-900 font-black shrink-0 text-[13px] w-6">{i + 1}.</span>
                                <div className="quill-content order-rich-text flex-1 text-[14px] leading-7 text-slate-700 text-justify"
                                  dangerouslySetInnerHTML={{ __html: renderRichHtml(term) }} />
                              </div>
                            ))}
                          </div>
                          {arr.length > 6 && (
                            <button
                              onClick={() => setShowAllPaymentTerms(v => !v)}
                              className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 underline underline-offset-4"
                            >
                              {showAllPaymentTerms ? "Show less" : `Show all (${arr.length})`}
                            </button>
                          )}
                        </>
                      );
                    }
                    const single = order.payment_terms || order.paymentTerms || snap.payment_terms;
                    if (single && !Array.isArray(single)) {
                      return (
                        <div className="quill-content order-rich-text text-[14px] leading-7 text-slate-700 text-justify bg-slate-50 border border-slate-200 rounded-lg p-4"
                          dangerouslySetInnerHTML={{ __html: renderRichHtml(single) }} />
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}

            {/* Governing Laws */}
            {(order.governing_laws?.length > 0 || order.governingLaws?.length > 0 || snap.governing_laws?.length > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-[13px] text-slate-800 mb-3 flex items-center gap-2">
                  <Landmark size={14} className="text-slate-400" /> Governing Laws
                </h3>
                <div className="space-y-3">
                  {(() => {
                    const arr = order.governing_laws || order.governingLaws || snap.governing_laws;
                    const items = Array.isArray(arr) ? arr : arr ? [arr] : [];
                    if (items.length === 1) return <div className="quill-content order-rich-text text-[13px] text-slate-700" dangerouslySetInnerHTML={{ __html: renderRichHtml(items[0]) }} />;
                    return items.map((law, i) => (
                      <div key={i} className="quill-content order-rich-text text-[13px] text-slate-700"
                        dangerouslySetInnerHTML={{ __html: renderRichHtml(law) }} />
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Annexures */}
            {(order.annexures?.length > 0 || snap.annexures?.length > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-[13px] text-slate-800 mb-3 flex items-center gap-2">
                  <FileText size={14} className="text-slate-400" /> Annexures
                </h3>
                <div className="space-y-2">
                  {(() => {
                    const arr = Array.isArray(order.annexures) ? order.annexures : Array.isArray(snap.annexures) ? snap.annexures : [];
                    if (arr.length === 1) return <div className="quill-content order-rich-text text-[13px] text-slate-700" dangerouslySetInnerHTML={{ __html: renderRichHtml(arr[0]) }} />;
                    return arr.map((anx, i) => (
                      <div key={i} className="flex gap-3 text-[13px] text-slate-700">
                        <span className="text-slate-400 font-semibold shrink-0">{i + 1}.</span>
                        <div className="quill-content order-rich-text flex-1" dangerouslySetInnerHTML={{ __html: renderRichHtml(anx) }} />
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Acceptance Section */}
            <div className="bg-white rounded-xl border border-slate-200 p-8 pt-6">
              <h3 className="font-bold text-sm text-slate-800 mb-8 pb-4 border-b border-slate-100 flex items-center gap-2">
                <User size={16} className="text-slate-400" /> Authorized Signatures
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                {/* Authorized Side */}
                <div className="relative">
                  <p className="font-black text-slate-900 text-[13px] mb-8 uppercase tracking-widest">{comp.companyName || comp.company_name || FALLBACK}</p>

                  <div className="relative h-40 mb-8 flex items-center">
                    {isIssuedLike && issuer?.signatureUrl ? (
                      <div className="relative inline-block">
                        <img src={issuer.signatureUrl} alt="Signature"
                          className="block h-28 w-auto object-contain relative z-10" />
                        {(comp.stampUrl || comp.stamp_url) && (
                          <img src={comp.stampUrl || comp.stamp_url} alt="Stamp"
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-28 w-auto object-contain opacity-70 mix-blend-multiply z-0" />
                        )}
                      </div>
                    ) : (
                      (comp.stampUrl || comp.stamp_url) && (
                        <img src={comp.stampUrl || comp.stamp_url} alt="Stamp"
                          className="h-28 w-auto object-contain opacity-70 mix-blend-multiply" />
                      )
                    )}
                  </div>

                  <p className="text-[12px] font-bold text-slate-900 italic mb-4 tracking-tight">(Authorized Signature)</p>
                  <div className="space-y-1.5 text-sm text-slate-900">
                    <p>
                      <span className="font-bold text-slate-800">Name:</span> {issuerName}
                      {issuerDesignation ? ` (${issuerDesignation})` : ""}
                    </p>
                    <p><span className="font-bold text-slate-800 transition-colors">Date:</span> {poDate}</p>
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end relative">
                  <div className="w-full max-w-sm">
                    <p className="font-black text-slate-900 text-[13px] mb-8 uppercase tracking-widest">{vendorDisplayName}</p>
                    <div className="h-40 mb-8" />
                    <p className="text-[12px] font-bold text-slate-900 italic mb-4 tracking-tight">(Agreed & Accepted by)</p>
                    <div className="space-y-1.5 text-sm text-slate-900">
                      <p><span className="font-bold text-slate-800">Name:</span> {vendorSignatoryName}</p>
                      <p><span className="font-bold text-slate-800 transition-colors">Date:</span> </p>
                    </div>
                  </div>
                </div>


              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Approvals" && (
        <div className="px-6 sm:px-10 py-5 max-w-[860px]">
          <h2 className="text-[15px] font-bold text-slate-800 mb-5">Approval Workflow</h2>

          {!approvalRequest && approvalLogs.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-xl p-10 text-center text-slate-400 text-sm">
              No approval request has been initiated for this order.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Flow overview */}
              {approvalRequest && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Flow</p>
                    <p className="text-[14px] font-bold text-slate-800">{flowSnapshot?.name || "Approval Flow"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Level</p>
                    <p className="text-[13px] font-bold text-slate-700">
                      {approvalRequest.status === "pending"
                        ? `${approvalRequest.current_level} / ${flowLevels.length}`
                        : approvalRequest.status === "approved"
                        ? "Completed"
                        : approvalRequest.status === "rejected"
                        ? "Rejected"
                        : "Reverted"}
                    </p>
                  </div>
                  <div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      approvalRequest.status === "pending" ? "bg-violet-50 text-violet-700 border border-violet-200" :
                      approvalRequest.status === "approved" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                      approvalRequest.status === "rejected" ? "bg-rose-50 text-rose-700 border border-rose-200" :
                      "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {approvalRequest.status}
                    </span>
                  </div>
                </div>
              )}

              {/* Levels from flow snapshot */}
              {flowLevels.length > 0 && (
                <div className="space-y-3">
                  {flowLevels.map((lvl, idx) => {
                    const lvlNum = idx + 1;
                    const lvlLogs = approvalLogs.filter(l => l.level_number === lvlNum);
                    const isPast = approvalRequest && approvalRequest.current_level > lvlNum;
                    const isCurrent = approvalRequest?.status === "pending" && approvalRequest.current_level === lvlNum;
                    const approvedLog = lvlLogs.find(l => l.action === "approved");
                    const rejectedLog = lvlLogs.find(l => l.action === "rejected");
                    const revertedLog = lvlLogs.find(l => l.action === "reverted");
                    const actionLog = approvedLog || rejectedLog || revertedLog;

                    return (
                      <div key={idx} className={`bg-white border rounded-xl overflow-hidden ${
                        isCurrent ? "border-violet-300 shadow-sm" :
                        actionLog?.action === "approved" ? "border-emerald-200" :
                        actionLog ? "border-rose-200" :
                        "border-slate-200"
                      }`}>
                        <div className={`px-4 py-3 flex items-center justify-between ${
                          isCurrent ? "bg-violet-50" :
                          actionLog?.action === "approved" ? "bg-emerald-50" :
                          actionLog ? "bg-rose-50" :
                          "bg-slate-50"
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${
                              isCurrent ? "bg-violet-600 text-white" :
                              actionLog?.action === "approved" ? "bg-emerald-600 text-white" :
                              actionLog ? "bg-rose-600 text-white" :
                              "bg-slate-200 text-slate-500"
                            }`}>{lvlNum}</span>
                            <span className="text-[13px] font-bold text-slate-800">
                              {lvl.name || `Level ${lvlNum}`}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-600 text-white font-bold">Current</span>
                            )}
                          </div>
                          {actionLog && (
                            <span className={`text-[11px] font-bold ${
                              actionLog.action === "approved" ? "text-emerald-600" :
                              actionLog.action === "rejected" ? "text-rose-600" :
                              "text-amber-600"
                            }`}>
                              {actionLog.action_by_name} — {actionLog.action}
                              {" · "}{new Date(actionLog.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                            </span>
                          )}
                        </div>
                        <div className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {(lvl.designations || []).map((d, di) => (
                              <div key={di} className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-slate-500">{d.designation_name}:</span>
                                {(d.users || []).map((u, ui) => (
                                  <span key={ui} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-medium text-slate-700">
                                    {u.name}
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                          {actionLog?.comments && (
                            <div className="mt-3 p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-[12px] text-slate-600 italic">
                              "{actionLog.comments}"
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Audit log */}
              {approvalLogs.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">Audit Log</p>
                  <div className="space-y-2">
                    {[...approvalLogs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((log, li) => {
                      const actionColors = {
                        approved: "text-emerald-600 bg-emerald-50 border-emerald-200",
                        rejected: "text-rose-600 bg-rose-50 border-rose-200",
                        reverted: "text-amber-600 bg-amber-50 border-amber-200",
                      };
                      const cls = actionColors[log.action] || "text-slate-600 bg-slate-50 border-slate-200";
                      return (
                        <div key={li} className="flex items-start gap-3 text-[12px]">
                          <span className={`shrink-0 px-2 py-0.5 rounded border font-bold capitalize ${cls}`}>{log.action}</span>
                          <span className="text-slate-700 font-medium">{log.action_by_name}</span>
                          <span className="text-slate-400">· Level {log.level_number}</span>
                          {log.designation_name && <span className="text-slate-400">· {log.designation_name}</span>}
                          <span className="ml-auto text-slate-400 shrink-0">
                            {new Date(log.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "Log" && (() => {
        const fmtTs = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
        const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN") : <span className="text-slate-300">—</span>;

        // Build unified event list
        const events = [];

        // 1. Order Created
        if (order.created_at) {
          events.push({ ts: order.created_at, type: 'created', user: order.made_by || 'Unknown', label: 'Order Created', sub: `${order.order_number} • Draft` });
        }

        // 2. Status transitions (Review, Pending Issue, Reverted, Recalled, Issued etc.) from activity_log
        const activityLog = Array.isArray(order.snapshot?.activity_log) ? order.snapshot.activity_log : [];
        const statusLabels = {
          Review: 'Submitted for Review',
          'Pending Issue': 'Submitted for Approval',
          Withdrawn: 'Approval Withdrawn',
          Issued: 'Issued',
          Draft: 'Returned to Draft',
          Reverted: 'Reverted',
          Recalled: 'Recalled',
          Cancelled: 'Cancelled',
          Rejected: 'Rejected',
          'Recall Requested': 'Recall Requested',
          'Cancel Requested': 'Cancel Requested',
          'Recall Rejected': 'Recall Rejected',
          'Cancel Rejected': 'Cancel Rejected',
          'Recall Request Cancelled': 'Recall Request Cancelled',
          'Cancel Request Cancelled': 'Cancel Request Cancelled',
          'Recall Cancelled': 'Recall Cancelled',
          'Cancel Order Withdrawn': 'Cancel Order Withdrawn',
          Amended: 'Amended',
          'Amendment Cancelled': 'Amendment Cancelled',
          'Amendment Request Cancelled': 'Amendment Request Cancelled',
        };
        activityLog.forEach(entry => {
          if (entry.action === "Edited") {
            events.push({
              ts: entry.action_at,
              type: 'edited',
              user: entry.action_by || 'System',
              label: 'Order Edited',
              changes: entry.changes || [],
            });
          } else {
            events.push({
              ts: entry.action_at,
              type: 'status',
              user: entry.action_by || 'System',
              label: statusLabels[entry.action] || entry.action,
              rawStatus: entry.action,
              comment: entry.comments || null,
              attachment_url: entry.attachment_url || null,
            });
          }
        });

        // 3. Approval logs (approver decisions — Approved/Rejected/Reverted by approver)
        const approvalLogs = approvalData.request?.logs || [];
        // Dedupe: skip if activity_log already has this exact status at near same time
        const activityTs = new Set(activityLog.map(e => e.action_at?.slice(0, 16)));
        approvalLogs.forEach(log => {
          const logMin = log.created_at?.slice(0, 16);
          const isDupe = activityTs.has(logMin) && ['Issued', 'Reverted', 'Recalled', 'Cancelled', 'Rejected'].includes(log.action);
          if (!isDupe) {
            events.push({ ts: log.created_at, type: 'approval', user: log.action_by_name || 'Approver', label: log.action, comment: log.comments, step: log.step_number });
          }
        });

        // 4. Amendment requests — separate event per action stage
        amendHistory.forEach(a => {
          // Stage 1: Requested
          events.push({ ts: a.created_at, type: 'amend', user: a.requestor?.name || a.made_by || 'User', label: 'Amendment Requested', amendStatus: 'Pending', reason: a.reason, attachment_url: a.attachment_url });
          // Stage 2: Approved
          if (a.status === 'Approved' && a.actioned_at) {
            // Directly approved — actioned_at = approval time
            events.push({ ts: a.actioned_at, type: 'amend', user: a.actioner?.name || 'Admin', label: 'Amendment Approved', amendStatus: 'Approved' });
          } else if (a.approved_at) {
            // Approved then cancelled — approved_at preserved separately
            events.push({ ts: a.approved_at, type: 'amend', user: a.approver?.name || 'Admin', label: 'Amendment Approved', amendStatus: 'Approved' });
          }
          // Stage 3: Cancelled or Rejected
          if ((a.status === 'Cancelled' || a.status === 'Rejected') && a.actioned_at) {
            events.push({ ts: a.actioned_at, type: 'amend', user: a.actioner?.name || 'Admin', label: `Amendment ${a.status}`, amendStatus: a.status });
          }
        });

        // Sort ascending (oldest first)
        events.sort((a, b) => new Date(a.ts) - new Date(b.ts));

        const eventStyle = {
          created: { dot: 'bg-indigo-500', icon: <FileText size={10} />, badge: 'bg-indigo-100 text-indigo-700' },
          edited: { dot: 'bg-cyan-500', icon: <FileText size={10} />, badge: 'bg-cyan-100 text-cyan-700' },
          status: {
            Review: { dot: 'bg-sky-500', icon: <FileText size={10} />, badge: 'bg-sky-100 text-sky-700' },
            'Pending Issue': { dot: 'bg-violet-500', icon: <FileText size={10} />, badge: 'bg-violet-100 text-violet-700' },
            Withdrawn: { dot: 'bg-amber-500', icon: <Undo2 size={10} />, badge: 'bg-amber-100 text-amber-700' },
            Issued: { dot: 'bg-emerald-600', icon: <CheckCircle2 size={10} />, badge: 'bg-emerald-100 text-emerald-800' },
            Reverted: { dot: 'bg-amber-500', icon: <FileText size={10} />, badge: 'bg-amber-100 text-amber-700' },
            Recalled: { dot: 'bg-purple-500', icon: <FileText size={10} />, badge: 'bg-purple-100 text-purple-700' },
            Cancelled: { dot: 'bg-slate-600', icon: <X size={10} />, badge: 'bg-slate-100 text-slate-600' },
            Rejected: { dot: 'bg-rose-500', icon: <X size={10} />, badge: 'bg-rose-100 text-rose-700' },
            Draft: { dot: 'bg-blue-400', icon: <FileText size={10} />, badge: 'bg-blue-100 text-blue-700' },
            'Recall Requested': { dot: 'bg-purple-400', icon: <FileText size={10} />, badge: 'bg-purple-50 text-purple-600' },
            'Cancel Requested': { dot: 'bg-rose-400', icon: <FileText size={10} />, badge: 'bg-rose-50 text-rose-600' },
            'Recall Rejected': { dot: 'bg-rose-500', icon: <X size={10} />, badge: 'bg-rose-100 text-rose-700' },
            'Cancel Rejected': { dot: 'bg-rose-500', icon: <X size={10} />, badge: 'bg-rose-100 text-rose-700' },
            'Recall Request Cancelled': { dot: 'bg-slate-400', icon: <X size={10} />, badge: 'bg-slate-100 text-slate-500' },
            'Cancel Request Cancelled': { dot: 'bg-slate-400', icon: <X size={10} />, badge: 'bg-slate-100 text-slate-500' },
            'Recall Cancelled': { dot: 'bg-slate-400', icon: <Undo2 size={10} />, badge: 'bg-slate-100 text-slate-500' },
            'Cancel Order Withdrawn': { dot: 'bg-slate-400', icon: <Undo2 size={10} />, badge: 'bg-slate-100 text-slate-500' },
            Amended: { dot: 'bg-orange-500', icon: <FileText size={10} />, badge: 'bg-orange-100 text-orange-700' },
            'Amendment Cancelled': { dot: 'bg-slate-500', icon: <GitMerge size={10} />, badge: 'bg-slate-100 text-slate-600' },
            'Amendment Request Cancelled': { dot: 'bg-slate-500', icon: <GitMerge size={10} />, badge: 'bg-slate-100 text-slate-600' },
          },
          approval: {
            Approved: { dot: 'bg-emerald-500', icon: <CheckCircle2 size={10} />, badge: 'bg-emerald-100 text-emerald-700' },
            Rejected: { dot: 'bg-rose-500', icon: <X size={10} />, badge: 'bg-rose-100 text-rose-700' },
            Reverted: { dot: 'bg-amber-500', icon: <FileText size={10} />, badge: 'bg-amber-100 text-amber-700' },
            Recalled: { dot: 'bg-purple-500', icon: <FileText size={10} />, badge: 'bg-purple-100 text-purple-700' },
            Cancelled: { dot: 'bg-slate-600', icon: <X size={10} />, badge: 'bg-slate-100 text-slate-600' },
            Issued: { dot: 'bg-emerald-600', icon: <CheckCircle2 size={10} />, badge: 'bg-emerald-100 text-emerald-800' },
            Pending: { dot: 'bg-blue-400', icon: <FileText size={10} />, badge: 'bg-blue-100 text-blue-700' },
          },
          amend: {
            Approved: { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
            Rejected: { dot: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700' },
            Cancelled: { dot: 'bg-slate-500', badge: 'bg-slate-100 text-slate-600' },
            Pending: { dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
          }
        };

        const getStyle = (ev) => {
          if (ev.type === 'created') return eventStyle.created;
          if (ev.type === 'edited') return eventStyle.edited;
          if (ev.type === 'status') return eventStyle.status[ev.rawStatus] || { dot: 'bg-slate-400', icon: <FileText size={10} />, badge: 'bg-slate-100 text-slate-600' };
          if (ev.type === 'approval') return eventStyle.approval[ev.label] || { dot: 'bg-slate-400', icon: <FileText size={10} />, badge: 'bg-slate-100 text-slate-600' };
          if (ev.type === 'amend') return { ...(eventStyle.amend[ev.amendStatus] || eventStyle.amend.Pending), icon: <GitMerge size={10} /> };
          return { dot: 'bg-slate-300', icon: <FileText size={10} />, badge: 'bg-slate-100 text-slate-500' };
        };

        return (
          <div className="px-6 py-4 max-w-[1400px] print:hidden space-y-6">

            {/* ── Activity Log ── */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-indigo-500" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">Activity Log</h2>
                    <p className="text-[11px] text-slate-400">Complete chronological history of this order</p>
                  </div>
                </div>
                <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200 shrink-0">
                  <button onClick={() => setLogView("flow")} className={`px-3 py-1 text-[10px] font-black rounded transition-all ${logView === 'flow' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>FLOW</button>
                  <button onClick={() => setLogView("list")} className={`px-3 py-1 text-[10px] font-black rounded transition-all ${logView === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>LIST</button>
                </div>
              </div>

              {events.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No activity recorded yet.</p>
              ) : logView === 'list' ? (
                /* ── LIST VIEW (connected timeline) ── */
                <div className="relative pl-10">
                  {/* continuous vertical line */}
                  <div className="absolute left-[27px] top-3 bottom-3 w-[2px] bg-slate-200" />
                  {events.map((ev, idx) => {
                    const s = getStyle(ev);
                    const isLast = idx === events.length - 1;
                    return (
                      <div key={idx} className={`relative flex gap-4 ${isLast ? '' : 'pb-4'}`}>
                        {/* dot on the line */}
                        <div className={`absolute -left-[27px] top-1 w-8 h-8 rounded-full ${s.dot} flex items-center justify-center text-white shrink-0 z-10 border-2 border-white shadow-sm`}>{s.icon}</div>
                        {/* card */}
                        <div className="flex-1 min-w-0 bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all p-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-bold text-slate-800">{ev.user}</span>
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${s.badge}`}>{ev.label}</span>
                              {ev.step && <span className="text-[9px] text-slate-400 font-bold uppercase">Level {ev.step}</span>}
                            </div>
                            <span className="text-[10px] text-slate-400 font-semibold whitespace-nowrap">{fmtTs(ev.ts)}</span>
                          </div>
                          {ev.sub && <p className="text-[10px] text-slate-500 mt-1">{ev.sub}</p>}
                          {ev.comment && <p className="text-[10px] text-slate-500 italic mt-1">"{ev.comment}"</p>}
                          {ev.type === 'edited' && ev.changes?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {ev.changes.map((c, ci) => (
                                <span key={ci} className="text-[9px] bg-cyan-50 border border-cyan-100 px-2 py-0.5">
                                  <span className="font-black text-cyan-600">{c.field}: </span>
                                  <span className="text-slate-400 line-through">{c.from}</span>
                                  <span className="text-slate-700 font-semibold"> → {c.to}</span>
                                </span>
                              ))}
                            </div>
                          )}
                          {ev.type === 'amend' && ev.reason && <p className="text-[10px] text-slate-500 mt-1">{ev.reason}</p>}
                          {ev.attachment_url && (
                            <a href={ev.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline mt-1">
                              <FileText size={10} /> Attachment
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (() => {
                /* ── FLOW VIEW (snake) ── */
                const COLS = 4;
                const chunks = [];
                for (let i = 0; i < events.length; i += COLS) chunks.push(events.slice(i, i + COLS));
                return (
                  <div>
                    {chunks.map((chunk, rowIdx) => {
                      const goRight = rowIdx % 2 === 0;
                      const isLastRow = rowIdx === chunks.length - 1;
                      return (
                        <div key={rowIdx}>
                          <div className={`flex ${goRight ? '' : 'flex-row-reverse'} items-stretch`}>
                            {chunk.map((ev, ci) => {
                              const s = getStyle(ev);
                              const isLastInChunk = ci === chunk.length - 1;
                              const lblColor = (s.badge || '').split(' ').find(c => c.startsWith('text-')) || 'text-slate-600';
                              return (
                                <React.Fragment key={ci}>
                                  <div className="flex-1 min-w-0">
                                    <div className="mx-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-all">
                                      <div className={`h-1 ${s.dot}`} />
                                      <div className="p-4 space-y-2">
                                        <div className="flex items-center gap-3">
                                          <div className={`w-10 h-10 rounded-full ${s.dot} flex items-center justify-center text-white shrink-0`}>
                                            {React.cloneElement(s.icon, { size: 16 })}
                                          </div>
                                          <span className={`text-[10px] font-black uppercase tracking-widest leading-tight ${lblColor}`}>{ev.label}</span>
                                        </div>
                                        <p className="text-[14px] font-bold text-slate-800">{ev.user}</p>
                                        <div className="flex items-center gap-1.5">
                                          <Calendar size={11} className="text-slate-400 shrink-0" />
                                          <span className="text-[11px] text-slate-400 font-medium">{fmtTs(ev.ts)}</span>
                                        </div>
                                        {ev.sub && <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-2">{ev.sub}</p>}
                                        {ev.step && <p className="text-[9px] font-black text-slate-400 uppercase">Level {ev.step}</p>}
                                        {ev.comment && <p className="text-[11px] text-slate-500 italic border-t border-slate-100 pt-2 leading-relaxed">"{ev.comment}"</p>}
                                        {ev.type === 'edited' && ev.changes?.length > 0 && (
                                          <div className="space-y-1 border-t border-slate-100 pt-2">
                                            {ev.changes.map((c, ci2) => (
                                              <div key={ci2} className="text-[9px]">
                                                <span className="font-black text-cyan-600">{c.field}: </span>
                                                <span className="text-slate-400 line-through">{c.from}</span>
                                                <span className="text-slate-700 font-semibold"> → {c.to}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {ev.type === 'amend' && ev.reason && <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-2 leading-relaxed">{ev.reason}</p>}
                                        {ev.attachment_url && (
                                          <a href={ev.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline mt-0.5">
                                            <FileText size={10} /> Attachment
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  {!isLastInChunk && (
                                    <div className="flex items-center self-center shrink-0 w-7">
                                      {goRight ? (
                                        <div className="flex items-center w-full">
                                          <div className="flex-1 h-[1.5px] bg-slate-300" />
                                          <svg className="fill-slate-400 shrink-0" width="7" height="11" viewBox="0 0 7 11"><polygon points="0,0 7,5.5 0,11" /></svg>
                                        </div>
                                      ) : (
                                        <div className="flex items-center w-full">
                                          <svg className="fill-slate-400 shrink-0" width="7" height="11" viewBox="0 0 7 11"><polygon points="7,0 0,5.5 7,11" /></svg>
                                          <div className="flex-1 h-[1.5px] bg-slate-300" />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                          {!isLastRow && (
                            <div className={`flex ${goRight ? 'justify-end pr-3' : 'justify-start pl-3'}`}>
                              <div className="flex flex-col items-center w-7">
                                <div className="w-[1.5px] h-8 bg-slate-300" />
                                <svg className="fill-slate-400 shrink-0" width="11" height="6" viewBox="0 0 11 6"><polygon points="0,0 11,0 5.5,6" /></svg>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* ── Version Chain ── */}
            {amendChain.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <GitMerge size={18} className="text-indigo-500" />
                  <div>
                    <h2 className="text-base font-bold text-slate-800">Version History</h2>
                    <p className="text-xs text-slate-400">All versions of this purchase order</p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-slate-100/80 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      <tr>
                        <th className="px-4 py-3.5 text-left border-r border-slate-200/60">Ver.</th>
                        <th className="px-4 py-3.5 text-left border-r border-slate-200/60">Order No.</th>
                        <th className="px-4 py-3.5 text-left border-r border-slate-200/60">Status</th>
                        <th className="px-4 py-3.5 text-left border-r border-slate-200/60">Vendor</th>
                        <th className="px-4 py-3.5 text-left border-r border-slate-200/60">Issued</th>
                        <th className="px-4 py-3.5 text-left border-r border-slate-200/60">Amend Req.</th>
                        <th className="px-4 py-3.5 text-left border-r border-slate-200/60">Amended</th>
                        <th className="px-4 py-3.5 text-center border-r border-slate-200/60">Audit</th>
                        <th className="px-4 py-3.5 text-center">Open</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {amendChain.map((row, idx) => {
                        const isCurrent = row.id === orderId;
                        const isLatest = idx === amendChain.length - 1;
                        const statusColor =
                          row.status === "Issued" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            row.status === "Amended" ? "bg-slate-100 text-slate-600 border-slate-200" :
                              row.status === "Draft" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                row.status === "Amendment Request" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                  "bg-slate-50 text-slate-500 border-slate-200";
                        return (
                          <tr key={row.id} className={`${isCurrent ? "bg-indigo-50/40" : "hover:bg-slate-50/50"} transition-colors`}>
                            <td className="px-4 py-3.5 font-bold text-slate-800 border-r border-slate-100">v{idx + 1}</td>
                            <td className="px-4 py-3.5 font-mono text-[11px] font-bold text-indigo-900 whitespace-nowrap border-r border-slate-100">{row.order_number}</td>
                            <td className="px-4 py-3.5 border-r border-slate-100">
                              <div className="flex flex-wrap gap-1.5 items-center">
                                <span className={`inline-flex items-center text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${statusColor}`}>{row.status}</span>
                                {isLatest && row.status === "Issued" && (
                                  <span className="inline-flex items-center text-[9px] font-black text-white uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-600 shadow-sm shadow-emerald-100">Active</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-[13px] font-medium text-slate-600 border-r border-slate-100">{row.vendor_name || "—"}</td>
                            <td className="px-4 py-3.5 text-[12px] font-medium text-slate-500 whitespace-nowrap border-r border-slate-100">{fmtDate(row.issued_at)}</td>
                            <td className="px-4 py-3.5 text-[12px] font-medium text-slate-500 whitespace-nowrap border-r border-slate-100">{fmtDate(row.amend_request_at)}</td>
                            <td className="px-4 py-3.5 text-[12px] font-medium text-slate-500 whitespace-nowrap border-r border-slate-100">{fmtDate(row.amended_at)}</td>
                            <td className="px-4 py-3.5 text-center border-r border-slate-100">
                              {row.amend_details ? (
                                <button onClick={() => setInfoModal({ open: true, data: row.amend_details })}
                                  className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all border border-indigo-100" title="View Audit">
                                  <ShieldQuestion size={14} />
                                </button>
                              ) : <span className="text-slate-300 font-bold text-[10px]">—</span>}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {isCurrent ? (
                                <div className="flex flex-col items-center">
                                  <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Here</span>
                                </div>
                              ) : (
                                <button onClick={() => onBack && onBack(row.id)}
                                  className="group/btn flex items-center gap-1.5 mx-auto px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:shadow-sm transition-all">
                                  <Eye size={14} className="group-hover/btn:scale-110 transition-transform" />
                                  <span className="text-[10px] font-bold uppercase tracking-tight">View</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Amendment Info Modal */}
      {infoModal.open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                  <ShieldQuestion size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Amendment Audit</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">History Details</p>
                </div>
              </div>
              <button onClick={() => setInfoModal({ open: false, data: null })} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requested By</p>
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><User size={12} className="text-indigo-400" /> {infoModal.data.requested_by}</p>
                  <p className="text-[10px] font-medium text-slate-500 italic">{new Date(infoModal.data.requested_at).toLocaleString("en-IN")}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Approved By</p>
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><ShieldQuestion size={12} className="text-emerald-400" /> {infoModal.data.approved_by}</p>
                  <p className="text-[10px] font-medium text-slate-500 italic">{infoModal.data.approved_at ? new Date(infoModal.data.approved_at).toLocaleString("en-IN") : "Pending"}</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Reason for Amendment</p>
                <p className="text-[13px] text-slate-700 leading-relaxed font-medium">"{infoModal.data.reason}"</p>
              </div>

              {infoModal.data.attachment_url && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Supporting Document</p>
                  <a href={infoModal.data.attachment_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-all group">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-indigo-600 shadow-sm">
                      <FileText size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-indigo-900 truncate">View Proof Document</p>
                      <p className="text-[10px] text-indigo-400 font-medium italic">Click to open in new tab</p>
                    </div>
                    <Download size={14} className="text-indigo-300 group-hover:text-indigo-600 transition-colors" />
                  </a>
                </div>
              )}

              <button
                onClick={() => setInfoModal({ open: false, data: null })}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-slate-200"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Order Documents" && (
        <OrderDocumentsTab
          order={order}
          orderId={orderId}
          isGlobalAdmin={isGlobalAdmin}
          thisUser={thisUser}
          onRefresh={fetchOrderDetails}
          showToast={showToast}
        />
      )}

      {activeTab === "Vendor Invoices" && (
        <VendorInvoicesTab
          order={order}
          orderId={orderId}
          isGlobalAdmin={isGlobalAdmin}
          thisUser={thisUser}
          onRefresh={fetchOrderDetails}
          showToast={showToast}
        />
      )}

      {activeTab === "PDF View" && (
        <PdfViewTab
          pdfBlobUrl={pdfBlobUrl}
          pdfLoading={pdfLoading}
          onDownload={() => handleSafeDownload(true)}
        />
      )}
      {/* Amendment Modal */}
      {amendModal && (() => {
        const isDirect = userCanRecall || userCanCancel;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
              <div className={`px-6 py-4 border-b flex items-center justify-between ${isDirect ? "bg-indigo-50 border-indigo-100" : "bg-amber-50 border-amber-100"}`}>
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isDirect ? "bg-indigo-100 text-indigo-600" : "bg-amber-100 text-amber-600"}`}>
                    <Package size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{isDirect ? "Amend Order" : "Amendment Request"}</h3>
                    <p className={`text-[11px] font-medium italic ${isDirect ? "text-indigo-700" : "text-amber-700"}`}>
                      {isDirect ? "Order will move to Draft immediately" : "Request sent for admin approval"} · {order.order_number}
                    </p>
                  </div>
                </div>
                <button onClick={() => setAmendModal(false)} className={`p-2 rounded-full transition-colors ${isDirect ? "hover:bg-indigo-100 text-indigo-600" : "hover:bg-amber-100 text-amber-600"}`}>
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Reason for Amendment</label>
                  <textarea
                    value={amendReason}
                    onChange={(e) => setAmendReason(e.target.value)}
                    placeholder="Explain why this order needs modification..."
                    className="w-full h-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400/20 focus:border-amber-400 transition-all outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Supporting Attachment (Proof)</label>
                  <div className="relative">
                    <input
                      type="file"
                      onChange={(e) => setAmendFile(e.target.files[0])}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="w-full px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-100/50 transition-colors">
                      <Upload size={18} className="text-slate-400" />
                      <span className="text-xs font-medium text-slate-600">{amendFile ? amendFile.name : "Click to upload proof (PDF/Image)"}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => setAmendModal(false)}
                    className="flex-1 px-4 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAmendRequest}
                    disabled={amendLoading}
                    className={`flex-[2] px-4 py-3 text-white font-bold rounded-xl text-xs shadow-lg transition-all flex items-center justify-center gap-2 ${isDirect ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200" : "bg-amber-500 hover:bg-amber-600 shadow-amber-200"}`}
                  >
                    {amendLoading ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Package size={14} />}
                    {isDirect ? "Amend Now" : "Submit Request"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reject comment modal for inline recall/cancel banner */}
      {arRejectModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Reject Request</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Reason Required</p>
              </div>
              <button onClick={() => setArRejectModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <textarea
                value={arRejectComment}
                onChange={e => setArRejectComment(e.target.value)}
                rows={3}
                placeholder="Reason for rejection..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-400/20 focus:border-rose-400 outline-none resize-none transition-all"
              />
              <div className="flex gap-3">
                <button onClick={() => setArRejectModal(false)}
                  className="flex-1 py-3 text-xs font-bold text-slate-500 rounded-xl hover:bg-slate-100 transition-all">Cancel</button>
                <button
                  disabled={!arRejectComment.trim() || arActionLoading}
                  onClick={async () => {
                    setArRejectModal(false);
                    await handleActionRequestDecision("Rejected", arRejectComment.trim());
                    setArRejectComment("");
                  }}
                  className="flex-[2] py-3 text-xs font-bold text-white rounded-xl bg-rose-600 hover:bg-rose-700 shadow-lg transition-all disabled:opacity-50">
                  Confirm Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel / Withdraw comment modal */}
      {cancelCommentModal.open && (() => {
        const meta = {
          amendment:   { title: "Cancel Amendment",        btn: "Cancel Amendment",      cls: "bg-rose-600 hover:bg-rose-700",   desc: "The amendment draft will be deleted and the original order restored to Issued." },
          amendRequest:{ title: "Withdraw Amend Request",  btn: "Withdraw Request",      cls: "bg-rose-600 hover:bg-rose-700",   desc: "The pending amendment request will be cancelled and the order restored to Issued." },
          recall:      { title: "Cancel Recall",           btn: "Cancel Recall",         cls: "bg-slate-700 hover:bg-slate-800", desc: "The recalled draft will be deleted and the order restored to Issued." },
          cancelOrder: { title: "Withdraw Cancel Order",   btn: "Withdraw Cancellation", cls: "bg-slate-700 hover:bg-slate-800", desc: "The cancellation will be reversed and the order restored to Issued." },
        }[cancelCommentModal.type] || { title: "Confirm Action", btn: "Confirm", cls: "bg-rose-600 hover:bg-rose-700", desc: "" };
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-white shadow-sm ${meta.cls.split(' ')[0]}`}>
                    <X size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{meta.title}</h3>
                    <p className="text-[10px] text-slate-500">{meta.desc}</p>
                  </div>
                </div>
                <button onClick={() => setCancelCommentModal({ open: false, type: null, comment: "" })}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                  <X size={18} />
                </button>
              </div>
              <div className="px-6 py-5">
                <label className="block text-xs font-bold text-slate-700 mb-2">Reason / Comment <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea
                  value={cancelCommentModal.comment}
                  onChange={e => setCancelCommentModal(m => ({ ...m, comment: e.target.value }))}
                  placeholder="Add a reason or note..."
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-rose-200"
                />
              </div>
              <div className="px-6 pb-5 flex gap-3 justify-end">
                <button onClick={() => setCancelCommentModal({ open: false, type: null, comment: "" })}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">
                  Go Back
                </button>
                <button onClick={confirmCancelAction} disabled={cancelAmendLoading}
                  className={`px-4 py-2 text-xs font-bold text-white rounded-lg transition-all disabled:opacity-60 ${meta.cls}`}>
                  {cancelAmendLoading ? "Processing..." : meta.btn}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Request modal (Recall / Cancel request) */}
      {requestModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-black text-slate-800 mb-1">
              {requestModal.type === "recall" ? "Recall Order Request" : "Cancel Order Request"}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {requestModal.type === "recall"
                ? "Request to pull this order back to Draft. An admin will review and action your request."
                : "Request to cancel this order. An admin will review and action your request."}
            </p>
            <textarea
              value={requestReason}
              onChange={e => setRequestReason(e.target.value)}
              placeholder="Reason (required)..."
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setRequestModal({ open: false, type: "" }); setRequestReason(""); }}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">
                Cancel
              </button>
              <button onClick={submitActionRequest} disabled={requestLoading || !requestReason.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all disabled:opacity-60">
                {requestLoading ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action confirmation modal — top-level so it shows on ANY tab */}
      {actionModal.open && (() => {
        const labelMap = {
          reverted: { title: "Revert Order", btn: "Confirm Revert", cls: "bg-amber-500 hover:bg-amber-600", desc: "Order will return to Review status for correction." },
          rejected: { title: "Reject Order", btn: "Confirm Reject", cls: "bg-rose-600 hover:bg-rose-700", desc: "Order will be permanently rejected." },
          revert:   { title: "Revert to Review", btn: "Confirm Revert", cls: "bg-amber-500 hover:bg-amber-600", desc: "Order will be sent back to Review for correction." },
          reject:   { title: "Reject Order", btn: "Confirm Reject", cls: "bg-rose-600 hover:bg-rose-700", desc: "Order will be permanently rejected at issue stage." },
          Recalled: { title: "Recall Order", btn: "Confirm Recall", cls: "bg-purple-600 hover:bg-purple-700", desc: "This issued order will be pulled back to Draft." },
          Cancelled: { title: "Cancel Order", btn: "Confirm Cancellation", cls: "bg-slate-700 hover:bg-slate-800", desc: "Order will be marked as Cancelled." },
          'Amendment Request': { title: "Approve Amendment", btn: "Confirm Approval", cls: "bg-emerald-600 hover:bg-emerald-700", desc: "Original will be Amended, and a new Draft clone will be created." }
        };
        const meta = labelMap[actionModal.type] || { title: "Action Confirmation", btn: "Confirm", cls: "bg-indigo-600", desc: "Please provide a reason." };
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-white shadow-sm ${meta.cls.split(' ')[0]}`}>
                    <ShieldQuestion size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{meta.title}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Mandatory Reason Required</p>
                  </div>
                </div>
                <button onClick={() => { setActionModal({ open: false, type: '' }); setActionComment(''); }} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                  <X size={18} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-[13px] text-slate-600 font-medium leading-relaxed bg-amber-50 p-3 rounded-xl border border-amber-100/50">
                  {meta.desc}
                </p>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Comments / Remarks</label>
                  <textarea
                    value={actionComment}
                    onChange={(e) => setActionComment(e.target.value)}
                    rows={4}
                    placeholder="Please explain the reason for this action..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 transition-all outline-none resize-none"
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button onClick={() => { setActionModal({ open: false, type: '' }); setActionComment(''); }}
                    className="flex-1 py-3 text-xs font-bold text-slate-500 rounded-xl hover:bg-slate-100 transition-all">
                    Cancel
                  </button>
                  <button disabled={actionLoading || !actionComment.trim()}
                    onClick={() => {
                      if (!actionComment.trim()) return;
                      if (actionModal.type === 'revert' || actionModal.type === 'reject') {
                        handleIssueAction(actionModal.type, actionComment);
                      } else if (actionModal.type === 'Amendment Request') {
                        handleAmendDecision('Approved');
                      } else if (approvalData.request) {
                        handleApprovalAction(actionModal.type);
                      } else if (isGlobalAdmin) {
                        const nextStatus = actionModal.type === 'reverted' ? 'Review' : actionModal.type === 'rejected' ? 'Rejected' : actionModal.type === 'Cancelled' ? 'Cancelled' : 'Draft';
                        updateStatus(nextStatus, actionComment);
                      }
                      setActionModal({ open: false, type: '' });
                      setActionComment('');
                    }}
                    className={`flex-[2] py-3 text-xs font-bold text-white rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:grayscale ${meta.cls}`}>
                    {meta.btn}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </>
  );
};

/* ════════════════════════════════════
   Order Documents Tab
   - Pre-PO (frozen) on top, read-only
   - Post-PO (live) below, upload/delete per category
   ════════════════════════════════════ */

const POST_CATEGORIES = [
  { key: "quotations", label: "Quotations" },
  { key: "comparative", label: "Comparative Sheet" },
  { key: "vendor-docs", label: "Vendor Documents" },
  { key: "other", label: "Other" },
  { key: "vendor-acceptance", label: "Vendor Acceptance" },
];

const SignedCopySection = ({ order, orderId, canUpload, onRefresh, showToast }) => {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef();

  const signedDoc = (Array.isArray(order.post_documents) ? order.post_documents : [])
    .find(d => d.category === "signed-copy") || null;

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/api/orders/${orderId}/signed-copy`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      showToast("Signed copy uploaded");
      onRefresh();
    } catch (err) {
      showToast(err.message || "Upload failed", "error");
    }
    setUploading(false);
  };

  const handleDelete = async () => {
    if (!confirm("Delete signed copy?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/api/orders/${orderId}/signed-copy`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      showToast("Signed copy deleted");
      onRefresh();
    } catch (err) {
      showToast(err.message || "Delete failed", "error");
    }
    setDeleting(false);
  };

  const isPdf = (doc) => /\.pdf(\?|$)/i.test(doc.name) || /\.pdf(\?|$)/i.test(doc.url || "");

  return (
    <section className="bg-white rounded-lg border border-slate-200">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ""; }}
      />

      <div className="px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <FileCheck size={18} />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-slate-900">Order Accepted Copy</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Vendor accepted copy · 1 document only</p>
          </div>
        </div>
        {canUpload && !signedDoc && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 text-[12px] font-semibold rounded-lg hover:bg-slate-50 transition-all disabled:opacity-60"
          >
            <Plus size={13} /> {uploading ? "Uploading…" : "Add"}
          </button>
        )}
      </div>

      <div className="px-5 pb-5">
        {!signedDoc ? (
          <div className="py-10 flex flex-col items-center gap-2 border border-dashed border-slate-200 rounded-md bg-slate-50/40">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
              <Lock size={18} />
            </div>
            <p className="text-[13px] font-semibold text-slate-600">No signed copy uploaded yet</p>
            <p className="text-[11px] text-slate-400">
              {canUpload ? "Upload the vendor accepted signed copy" : "Upload unlocks once the order is issued"}
            </p>
            {canUpload && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="mt-2 flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 text-[12px] font-semibold rounded-lg hover:bg-slate-50 transition-all disabled:opacity-60"
              >
                <Plus size={13} /> {uploading ? "Uploading…" : "Upload now"}
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isPdf(signedDoc) ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-500"}`}>
              <FileText size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-slate-800 truncate">{signedDoc.name}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {signedDoc.size ? `${Math.round(signedDoc.size / 1024)} kb` : ""}
                {signedDoc.size && signedDoc.uploaded_at ? " · " : ""}
                {signedDoc.uploaded_at ? new Date(signedDoc.uploaded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <a href={signedDoc.url} target="_blank" rel="noreferrer" className="p-1.5 text-slate-400 hover:text-slate-700 transition-all" title="View">
                <Eye size={15} />
              </a>
              <a href={signedDoc.url} download={signedDoc.name} className="p-1.5 text-slate-400 hover:text-slate-700 transition-all" title="Download">
                <Download size={15} />
              </a>
              {canUpload && (
                <>
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-1.5 text-slate-400 hover:text-slate-700 transition-all disabled:opacity-60" title="Replace">
                    <Upload size={15} />
                  </button>
                  <button onClick={handleDelete} disabled={deleting} className="p-1.5 text-slate-400 hover:text-red-500 transition-all disabled:opacity-60" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const PRE_CATEGORIES = [
  { key: "quotations", label: "Quotations" },
  { key: "comparative", label: "Comparative Sheet" },
  { key: "vendor-docs", label: "Vendor Documents" },
  { key: "other", label: "Other" },
];

const OrderDocumentsTab = ({ order, orderId, isGlobalAdmin, thisUser, onRefresh, showToast }) => {
  const [preTab, setPreTab] = useState("quotations");
  const [postTab, setPostTab] = useState("quotations");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef();

  // ── Build Pre-PO docs map (read-only, derived from order data) ──
  const preDocsByCategory = React.useMemo(() => {
    const map = { quotations: [], comparative: [], "vendor-docs": [], other: [] };

    // Legacy single-quotation field
    if (order.quotation_url) {
      map.quotations.push({
        id: "legacy-quotation",
        url: order.quotation_url,
        name: "Quotation.pdf",
        frozen: true,
      });
    }
    // Legacy comparative sheet
    if (order.comparative_sheet_url) {
      map.comparative.push({
        id: "legacy-comparative",
        url: order.comparative_sheet_url,
        name: "Comparative_Sheet.pdf",
        frozen: true,
      });
    }
    // pre_documents JSONB
    const preArr = Array.isArray(order.pre_documents) ? order.pre_documents : [];
    preArr.forEach(d => {
      const cat = d.category || "other";
      if (!map[cat]) map[cat] = [];
      map[cat].push(d);
    });

    // Vendor docs — pulled from snapshot (frozen) or live vendor record
    const vendor = order.snapshot?.vendor || order.vendors || {};
    const vendorDocs = [
      { url: vendor.docGstUrl || vendor.doc_gst_url, name: "GST Certificate" },
      { url: vendor.docPanUrl || vendor.doc_pan_url, name: "PAN Card" },
      { url: vendor.docAadhaarUrl || vendor.doc_aadhaar_url, name: "Aadhaar" },
      { url: vendor.docCoiUrl || vendor.doc_coi_url, name: "Certificate of Incorporation" },
      { url: vendor.docMsmeUrl || vendor.doc_msme_url, name: "MSME Certificate" },
      { url: vendor.docCancelChequeUrl || vendor.doc_cancel_cheque_url, name: "Cancelled Cheque" },
    ].filter(d => d.url);
    vendorDocs.forEach((d, idx) => {
      map["vendor-docs"].push({
        id: `vendor-doc-${idx}`,
        url: d.url,
        name: d.name,
        frozen: true,
      });
    });

    return map;
  }, [order]);

  // ── Post-PO docs grouped by category ──
  const postDocsByCategory = React.useMemo(() => {
    const arr = Array.isArray(order.post_documents) ? order.post_documents : [];
    const map = {};
    POST_CATEGORIES.forEach(c => { map[c.key] = []; });
    arr.forEach(d => {
      if (map[d.category]) map[d.category].push(d);
      else map[d.category] = [d];
    });
    return map;
  }, [order]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", postTab);
      fd.append("uploadedById", thisUser.id || "");
      fd.append("uploadedByName", thisUser.name || "Unknown");
      const res = await fetch(`${API}/api/orders/${orderId}/post-documents`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      showToast("Document uploaded");
      onRefresh();
    } catch (err) {
      showToast(err.message || "Upload failed", "error");
    }
    setUploading(false);
  };

  const handleDelete = async (docId) => {
    if (!confirm("Delete this document?")) return;
    try {
      const res = await fetch(`${API}/api/orders/${orderId}/post-documents/${docId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      showToast("Document deleted");
      onRefresh();
    } catch (err) {
      showToast(err.message || "Delete failed", "error");
    }
  };

  const isImage = (name = "", url = "") => /\.(png|jpe?g|gif|webp|svg)$/i.test(name) || /\.(png|jpe?g|gif|webp|svg)/i.test(url);
  const formatBytes = (b) => {
    if (!b) return "";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };

  const isIssued = order.status === "Issued";
  const canUpload = isGlobalAdmin || isIssued;

  const totalPreDocs = Object.values(preDocsByCategory).reduce((n, a) => n + a.length, 0);
  const totalPostDocs = Object.values(postDocsByCategory).reduce((n, a) => n + a.length, 0);

  const signedDoc = (Array.isArray(order.post_documents) ? order.post_documents : [])
    .find(d => d.category === "signed-copy") || null;

  return (
    <div className="px-10 py-6 max-w-[1100px] space-y-5">
      {/* ── SUMMARY BAR ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#f7f6f3] rounded-xl px-4 py-3.5">
          <p className="text-[11px] font-medium text-slate-500 mb-1.5">Pre-order documents</p>
          <p className="text-2xl font-bold text-slate-900">{totalPreDocs}</p>
        </div>
        <div className="bg-[#f7f6f3] rounded-xl px-4 py-3.5">
          <p className="text-[11px] font-medium text-slate-500 mb-1.5">Post-order documents</p>
          <p className="text-2xl font-bold text-slate-900">{totalPostDocs}</p>
        </div>
        <div className="bg-[#f7f6f3] rounded-xl px-4 py-3.5">
          <p className="text-[11px] font-medium text-slate-500 mb-1.5">Order accepted copy</p>
          {signedDoc ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700">
              <CheckCircle2 size={14} /> Uploaded
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-700">
              <Clock size={14} /> Pending
            </span>
          )}
        </div>
      </div>

      {/* ── PRE-PO SECTION ── */}
      <DocSection
        title="Pre-order documents"
        totalDocs={totalPreDocs}
        categories={PRE_CATEGORIES}
        docsByCategory={preDocsByCategory}
        activeTab={preTab}
        setActiveTab={setPreTab}
        readOnly
        formatBytes={formatBytes}
      />

      {/* ── POST-PO SECTION ── */}
      <DocSection
        title="Post-order documents"
        totalDocs={totalPostDocs}
        categories={POST_CATEGORIES}
        docsByCategory={postDocsByCategory}
        activeTab={postTab}
        setActiveTab={setPostTab}
        canUpload={canUpload}
        onUploadClick={handleUploadClick}
        onDelete={handleDelete}
        uploading={uploading}
        formatBytes={formatBytes}
      />
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

      {/* ── VENDOR SIGNED COPY (last) ── */}
      <SignedCopySection
        order={order}
        orderId={orderId}
        canUpload={canUpload}
        onRefresh={onRefresh}
        showToast={showToast}
      />
    </div>
  );
};

const DocSection = ({
  title, totalDocs, categories, docsByCategory,
  activeTab, setActiveTab, readOnly = false,
  canUpload = false, onUploadClick, onDelete, uploading = false,
  formatBytes,
}) => {
  const docs = docsByCategory[activeTab] || [];
  const activeLabel = categories.find(c => c.key === activeTab)?.label || "";

  const handleDownloadAll = () => {
    docs.forEach((doc, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = doc.url;
        a.download = doc.name;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 400);
    });
  };

  return (
    <section className="bg-white rounded-lg border border-slate-200">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Folder size={18} />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{totalDocs} files total</p>
          </div>
        </div>
        {totalDocs > 0 && (
          <button onClick={handleDownloadAll}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-[12px] font-semibold rounded-md hover:bg-slate-50 transition-all">
            <Download size={13} /> Download All
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="px-5 pb-4 flex gap-2 overflow-x-auto border-b border-slate-100">
        {categories.map(cat => {
          const count = docsByCategory[cat.key]?.length || 0;
          const active = activeTab === cat.key;
          return (
            <button key={cat.key} onClick={() => setActiveTab(cat.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md whitespace-nowrap transition-all
                ${active ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>
              {cat.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* File grid */}
      <div className="px-5 pb-5 pt-4">
        {docs.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-slate-200 rounded-md bg-slate-50/40">
            {!readOnly && canUpload ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-[12px] text-slate-500">No {activeLabel.toLowerCase()} uploaded yet</p>
                <button onClick={onUploadClick} disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 text-[12px] font-semibold rounded-md hover:bg-slate-50 transition-all disabled:opacity-60">
                  <Plus size={13} /> Add document
                </button>
              </div>
            ) : (
              <p className="text-[12px] text-slate-400">No {activeLabel.toLowerCase()} captured</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {docs.map(d => (
              <DocCard key={d.id} doc={d}
                readOnly={readOnly}
                onDelete={!readOnly && onDelete ? () => onDelete(d.id) : null}
                formatBytes={formatBytes}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const DocCard = ({ doc, readOnly = false, onDelete, formatBytes }) => {
  const isPdf = /\.pdf(\?|$)/i.test(doc.name) || /\.pdf(\?|$)/i.test(doc.url || "");
  const isImg = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(doc.name) || /\.(png|jpe?g|gif|webp|svg)/i.test(doc.url || "");
  const sizeStr = formatBytes ? formatBytes(doc.size) : (doc.size ? `${Math.round(doc.size / 1024)} kb` : "");
  const dateStr = doc.uploaded_at
    ? new Date(doc.uploaded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "";

  return (
    <div className="group bg-white border border-slate-200 rounded-md overflow-hidden hover:shadow-sm hover:border-slate-300 transition-all">
      {/* Thumbnail */}
      <div className="relative h-24 bg-slate-50 overflow-hidden">
        <a href={doc.url} target="_blank" rel="noreferrer" className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          {isImg ? (
            <img src={doc.url} alt={doc.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <>
              <div className={`w-9 h-9 rounded-md flex items-center justify-center ${isPdf ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-500"}`}>
                <FileText size={20} />
              </div>
              {isPdf && <span className="text-[8px] font-bold uppercase tracking-widest text-red-400/80">PDF</span>}
            </>
          )}
        </a>
        {/* Download button — top right inside box */}
        <a
          href={doc.url}
          download={doc.name}
          onClick={e => e.stopPropagation()}
          className="absolute top-1.5 right-1.5 p-1 bg-white/90 border border-slate-200 rounded text-slate-500 hover:text-slate-800 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10"
          title="Download"
        >
          <Download size={12} />
        </a>
      </div>
      {/* Footer */}
      <div className="px-2.5 py-2 bg-white border-t border-slate-100">
        <p className="text-[11px] font-semibold text-slate-700 truncate" title={doc.name}>{doc.name}</p>
        {(sizeStr || dateStr) && (
          <p className="text-[10px] text-slate-400 mt-0.5">{[sizeStr, dateStr].filter(Boolean).join(" · ")}</p>
        )}
        {!readOnly && onDelete && (
          <button onClick={onDelete} className="mt-1 p-1 text-slate-400 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100" title="Delete">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
};


/* ─────────────────────────────────────────
   VendorInvoicesTab
───────────────────────────────────────── */
const VendorInvoicesTab = ({ order, orderId, isGlobalAdmin, thisUser, onRefresh, showToast }) => {
  const [invoices, setInvoices]         = useState([]);
  const [loadingInv, setLoadingInv]     = useState(true);
  const [page, setPage]                 = useState('list'); // 'list' | 'detail' | 'trash'
  const [selectedInv, setSelectedInv]   = useState(null);
  const [addModal, setAddModal]         = useState(false);
  const [billDocsInvId, setBillDocsInvId] = useState(null);
  const [uploadingBillDoc, setUploadingBillDoc] = useState(false);
  const [saving, setSaving]             = useState(false);
  const [importing, setImporting]       = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [confirmDlg, setConfirmDlg]     = useState(null);
  const [invTrashSel, setInvTrashSel]   = useState(new Set());
  const [editingItems, setEditingItems]     = useState(false);
  const [detailItems, setDetailItems]       = useState([]);
  const [detailCharges, setDetailCharges]   = useState([]);
  const [discountConfig, setDiscountConfig] = useState({ mode: null, pct: '' });
  const [calcModalOpen, setCalcModalOpen]   = useState(false);
  const [chargesMenuOpen, setChargesMenuOpen] = useState(false);
  const [savingCharges, setSavingCharges]   = useState(false);
  const [editInvModal, setEditInvModal] = useState(null); // invoice to edit
  const [editInvForm, setEditInvForm]   = useState({ invoice_no: '', invoice_date: '', amount: '' });
  const [logModal, setLogModal]         = useState(null);
  const [globalLogPanel, setGlobalLogPanel] = useState(false);
  const [globalLogs, setGlobalLogs]     = useState([]);
  const [loadingGlobalLog, setLoadingGlobalLog] = useState(false);
  const [moreOpen, setMoreOpen]         = useState(false);
  const moreRef                         = useRef(null);
  const [docsPanel, setDocsPanel]       = useState(false);
  const [docTrashOpen, setDocTrashOpen] = useState(false);

  const [editUploadingInvoice, setEditUploadingInvoice] = useState(false);
  const [editUploadingEway, setEditUploadingEway]       = useState(false);

  const pendingFileInputRef    = useRef();
  const pendingInvoiceInputRef = useRef();
  const pendingEwayInputRef    = useRef();
  const billDocInputRef        = useRef();
  const excelInputRef          = useRef();
  const itemExcelInputRef      = useRef();
  const editInvoiceInputRef    = useRef();
  const editEwayInputRef       = useRef();
  const detailEwayInputRef     = useRef();

  const blankItem = () => ({ item: '', hsn: '', unit: '', qty: '', rate: '', disc_pct: '', gst_pct: '', remarks: '' });
  const [addForm, setAddForm] = useState({ invoice_no: '', invoice_date: '', amount: '' });

  const isIssued = order.status === 'Issued';
  const canEdit  = isGlobalAdmin || isIssued;

  const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtAmt   = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const fmtBytes = (b) => { if (!b) return ''; if (b < 1048576) return `${(b/1024).toFixed(1)} KB`; return `${(b/1048576).toFixed(1)} MB`; };

  const fetchInvoices = async () => {
    try {
      const res  = await fetch(`${API}/api/orders/${orderId}/vendor-invoices`);
      const data = await res.json();
      const list = Array.isArray(data.invoices) ? data.invoices : [];
      setInvoices(list);
      if (selectedInv) {
        const updated = list.find(inv => inv.id === selectedInv.id);
        if (updated) { setSelectedInv(updated); setDetailCharges(updated.charges || []); }
      }
    } catch(err) {
      console.error('[fetchInvoices] error:', err);
    } finally { setLoadingInv(false); }
  };

  const fetchGlobalLog = async () => {
    setLoadingGlobalLog(true);
    try {
      const res  = await fetch(`${API}/api/orders/${orderId}/invoice-audit-log`);
      const data = await res.json();
      setGlobalLogs(Array.isArray(data.log) ? data.log : []);
    } catch(err) { console.error(err); }
    setLoadingGlobalLog(false);
  };
  useEffect(() => { fetchInvoices(); }, [orderId]);

  const activeInvoices  = invoices.filter(inv => !inv.trashed);
  const trashedInvoices = invoices.filter(inv => inv.trashed);
  const totalAmount     = activeInvoices.reduce((s, inv) => s + (Number(inv.amount) || 0), 0);

  // ── Add invoice ──
  const handleAddSave = async (andAddDetail = false) => {
    if (!addForm.invoice_no.trim()) { showToast('Invoice number required', 'error'); return; }
    if (!addForm.invoice_date)      { showToast('Invoice date required', 'error'); return; }
    setSaving(true);
    try {
      const res  = await fetch(`${API}/api/orders/${orderId}/vendor-invoices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_no: addForm.invoice_no.trim(), invoice_date: addForm.invoice_date, amount: addForm.amount, items: [], remarks: '', created_by: thisUser?.name || thisUser?.full_name || thisUser?.email || 'Unknown' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      const newInv = data.invoice;
      for (const pf of pendingFiles) {
        const fd = new FormData();
        fd.append('file', pf.file);
        fd.append('doc_type', pf.doc_type || 'invoice');
        fd.append('uploaded_by', thisUser?.name || thisUser?.full_name || thisUser?.email || 'Unknown');
        await fetch(`${API}/api/orders/${orderId}/vendor-invoices/${newInv.id}/docs`, { method: 'POST', body: fd });
      }
      showToast('Invoice added');
      setAddModal(false);
      setAddForm({ invoice_no: '', invoice_date: '', amount: '' });
      setPendingFiles([]);
      await fetchInvoices();
      if (andAddDetail) {
        setSelectedInv(newInv);
        setDetailItems([blankItem()]);
        setEditingItems(true);
        setPage('detail');
      }
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  // ── Soft-delete invoice (move to trash) ──
  const handleSoftDeleteInv = async (invoiceId) => {
    try {
      const res = await fetch(`${API}/api/orders/${orderId}/vendor-invoices/${invoiceId}/trash`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true, by: thisUser?.name || thisUser?.full_name || thisUser?.email || 'Unknown' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, trashed: true } : inv));
      if (selectedInv?.id === invoiceId) { setPage('list'); setSelectedInv(null); }
    } catch (err) { showToast(err.message, 'error'); }
  };

  // ── Permanent delete invoices from trash ──
  const handlePermanentDeleteInvoices = (invoiceIds) => {
    setConfirmDlg({ msg: `Permanently delete ${invoiceIds.length} invoice${invoiceIds.length !== 1 ? 's' : ''}?`, onOk: async () => {
      try {
        const res = await fetch(`${API}/api/orders/${orderId}/vendor-invoices`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceIds, deleted_by: thisUser?.name || thisUser?.full_name || thisUser?.email || 'Unknown' }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        showToast(`${d.deleted} invoice${d.deleted !== 1 ? 's' : ''} deleted`);
        setInvTrashSel(new Set());
        fetchInvoices();
      } catch (err) { showToast(err.message, 'error'); }
    }});
  };

  // ── Restore invoice from trash ──
  const handleRestoreInv = async (invoiceId) => {
    try {
      const res = await fetch(`${API}/api/orders/${orderId}/vendor-invoices/${invoiceId}/trash`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: false, by: thisUser?.name || thisUser?.full_name || thisUser?.email || 'Unknown' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, trashed: false } : inv));
      showToast('Invoice restored');
    } catch (err) { showToast(err.message, 'error'); }
  };

  // ── Bill Docs ──
  const handleUploadBillDoc = async (file, invId, docType = 'invoice') => {
    const targetId = invId || billDocsInvId;
    if (!file || !targetId) return;
    if (!invId) setUploadingBillDoc(true);
    else if (docType === 'invoice') setEditUploadingInvoice(true);
    else setEditUploadingEway(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', docType);
      fd.append('uploaded_by', thisUser?.name || thisUser?.full_name || thisUser?.email || 'Unknown');
      const res = await fetch(`${API}/api/orders/${orderId}/vendor-invoices/${targetId}/docs`, { method: 'POST', body: fd });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error);
      fetchInvoices();
    } catch (err) { showToast(err.message, 'error'); }
    if (!invId) setUploadingBillDoc(false);
    else if (docType === 'invoice') setEditUploadingInvoice(false);
    else setEditUploadingEway(false);
  };

  const handleSoftDeleteDoc = async (invoiceId, docId) => {
    try {
      const res = await fetch(`${API}/api/orders/${orderId}/vendor-invoices/${invoiceId}/docs/${docId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true, trashed_at: new Date().toISOString() }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setInvoices(prev => prev.map(inv => inv.id !== invoiceId ? inv : {
        ...inv, docs: (inv.docs || []).map(d => d.id === docId ? { ...d, trashed: true } : d)
      }));
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handlePermanentDeleteDocs = (invoiceId, docIds) => {
    setConfirmDlg({ msg: `Permanently delete ${docIds.length} file${docIds.length !== 1 ? 's' : ''}?`, onOk: async () => {
      try {
        const res = await fetch(`${API}/api/orders/${orderId}/vendor-invoices/${invoiceId}/docs`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docIds }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        showToast(`${d.deleted} file${d.deleted !== 1 ? 's' : ''} deleted permanently`);
        fetchInvoices();
      } catch (err) { showToast(err.message, 'error'); }
    }});
  };

  // ── Detail items ──
  const calcRow = (it, discMode) => {
    const qty = Number(it.qty) || 0, rate = Number(it.rate) || 0;
    const disc = discMode === 'inline' ? (Number(it.disc_pct) || 0) : 0;
    const base = qty * rate * (1 - disc / 100);
    const gst_amount = base * (Number(it.gst_pct) || 0) / 100;
    return { gst_amount, net_amount: base + gst_amount };
  };
  const addDetailRow    = () => setDetailItems(r => [...r, blankItem()]);
  const removeDetailRow = (i) => setDetailItems(r => r.filter((_, idx) => idx !== i));
  const updateDetail    = (i, k, v) => setDetailItems(r => r.map((it, idx) => idx === i ? { ...it, [k]: v } : it));

  const openDetailPage = (inv) => {
    setSelectedInv(inv);
    const items = (inv.items || []);
    setDetailItems(items.length > 0
      ? items.map(it => ({ item: it.item || '', hsn: it.hsn || '', unit: it.unit || '', qty: String(it.qty || ''), rate: String(it.rate || ''), disc_pct: String(it.disc_pct || ''), gst_pct: String(it.gst_pct || ''), remarks: it.remarks || '' }))
      : []);
    const charges = (inv.charges || []).filter(c => c.label !== 'Discount');
    setDetailCharges(charges.map(c => ({ ...c, before_gst: c.before_gst !== false })));
    setDiscountConfig(inv.discount_config || { mode: null, pct: '' });
    setEditingItems(false);
    setBillDocsInvId(null);
    setPage('detail');
  };

  const handleSaveDetail = async () => {
    if (!selectedInv) return;
    setSaving(true);
    try {
      const items = detailItems.map((it, idx) => {
        const { gst_amount, net_amount } = calcRow(it, discountConfig.mode);
        return { sno: idx + 1, item: it.item, hsn: it.hsn, unit: it.unit, qty: Number(it.qty) || 0, rate: Number(it.rate) || 0, disc_pct: Number(it.disc_pct) || 0, gst_pct: Number(it.gst_pct) || 0, gst_amount, net_amount, remarks: it.remarks };
      });
      const res = await fetch(`${API}/api/orders/${orderId}/vendor-invoices/${selectedInv.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_no: selectedInv.invoice_no, invoice_date: selectedInv.invoice_date, amount: selectedInv.amount, remarks: selectedInv.remarks || '', items, updated_by: thisUser?.name || thisUser?.full_name || thisUser?.email || 'Unknown' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('Details saved');
      setEditingItems(false);
      await fetchInvoices();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const handleSaveCharges = async () => {
    if (!selectedInv) return;
    setSavingCharges(true);
    try {
      const res = await fetch(`${API}/api/orders/${orderId}/vendor-invoices/${selectedInv.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_no: selectedInv.invoice_no, invoice_date: selectedInv.invoice_date, amount: selectedInv.amount, charges: detailCharges, discount_config: discountConfig.mode ? discountConfig : null, updated_by: thisUser?.name || thisUser?.full_name || thisUser?.email || 'Unknown' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('Charges saved');
      await fetchInvoices();
    } catch (err) { showToast(err.message, 'error'); }
    setSavingCharges(false);
  };

  // ── Edit invoice header (No, Date, Amount) ──
  const handleEditInvoiceSave = async () => {
    if (!editInvModal) return;
    if (!editInvForm.invoice_no.trim()) { showToast('Invoice number required', 'error'); return; }
    setSaving(true);
    try {
      const inv = editInvModal;
      const res = await fetch(`${API}/api/orders/${orderId}/vendor-invoices/${inv.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_no: editInvForm.invoice_no.trim(), invoice_date: editInvForm.invoice_date, amount: editInvForm.amount, remarks: inv.remarks || '', updated_by: thisUser?.name || thisUser?.full_name || thisUser?.email || 'Unknown' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('Invoice updated');
      setEditInvModal(null);
      fetchInvoices();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  // ── Excel (main page — full invoice import) ──
  const downloadInvoiceTemplate = async () => {
    const XLSX = await import('xlsx');
    const rows = [
      ['Invoice No', 'Invoice Date', 'Amount', 'Remarks', 'Item', 'HSN Code', 'Unit', 'Qty', 'Rate', 'GST %'],
      ['INV-001', '2024-01-15', '50000', 'First delivery', 'Cement Bag 50kg', '252329', 'BAG', 100, 450, 18],
      ['INV-001', '2024-01-15', '', '', 'Sand (cubic ft)', '250290', 'CFT', 50, 800, 5],
      ['INV-002', '2024-01-20', '35000', '', 'Steel Rod 12mm', '721310', 'KG', 500, 70, 18],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [14, 14, 12, 22, 22, 12, 8, 8, 10, 8].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, 'vendor_invoice_template.xlsx');
  };

  const handleExcelImport = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const XLSX = await import('xlsx');
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const parseDate = (d) => { if (d instanceof Date) return d.toISOString().slice(0,10); return String(d||'').slice(0,10); };
      const grouped = {};
      const order_ = [];
      for (const row of rows) {
        const no = String(row['Invoice No'] || '').trim();
        if (!no) continue;
        if (!grouped[no]) {
          grouped[no] = { invoice_no: no, invoice_date: parseDate(row['Invoice Date']), amount: String(row['Amount'] || ''), remarks: String(row['Remarks'] || '').trim(), items: [] };
          order_.push(no);
        }
        const itemName = String(row['Item'] || '').trim();
        if (itemName) {
          const qty = Number(row['Qty']) || 0, rate = Number(row['Rate']) || 0, gst_pct = Number(row['GST %']) || 0;
          const gst_amount = (qty * rate * gst_pct) / 100;
          grouped[no].items.push({ item: itemName, hsn: String(row['HSN Code']||'').trim(), unit: String(row['Unit']||'').trim(), qty, rate, gst_pct, gst_amount, net_amount: qty * rate + gst_amount, remarks: '' });
        }
      }
      const list = order_.map(no => grouped[no]);
      if (!list.length) throw new Error('No valid rows found');
      const res  = await fetch(`${API}/api/orders/${orderId}/vendor-invoices/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoices: list }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`${data.count} invoice${data.count !== 1 ? 's' : ''} imported`);
      fetchInvoices();
    } catch (err) { showToast(err.message, 'error'); }
    setImporting(false);
  };

  // ── Excel (detail page — import line items into selected invoice) ──
  const downloadItemTemplate = async () => {
    const XLSX = await import('xlsx');
    const rows = [
      ['Item', 'HSN Code', 'Unit', 'Qty', 'Rate', 'GST %', 'Remarks'],
      ['Cement Bag 50kg', '252329', 'BAG', 100, 450, 18, ''],
      ['Steel Rod 12mm', '721310', 'KG', 500, 70, 18, ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [22, 12, 8, 8, 10, 8, 20].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    XLSX.writeFile(wb, 'invoice_items_template.xlsx');
  };

  const handleItemExcelImport = async (file) => {
    if (!file || !selectedInv) return;
    try {
      const XLSX = await import('xlsx');
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const newItems = rows.map(row => {
        const itemName = String(row['Item'] || '').trim();
        if (!itemName) return null;
        const qty = Number(row['Qty']) || 0, rate = Number(row['Rate']) || 0, gst_pct = Number(row['GST %']) || 0;
        const gst_amount = (qty * rate * gst_pct) / 100;
        return { item: itemName, hsn: String(row['HSN Code']||'').trim(), unit: String(row['Unit']||'').trim(), qty: String(qty), rate: String(rate), gst_pct: String(gst_pct), remarks: String(row['Remarks']||'').trim() };
      }).filter(Boolean);
      if (!newItems.length) throw new Error('No valid rows found');
      setDetailItems(prev => [...prev, ...newItems]);
      setEditingItems(true);
      showToast(`${newItems.length} item${newItems.length !== 1 ? 's' : ''} imported`);
    } catch (err) { showToast(err.message, 'error'); }
  };

  // Bill Docs for detail page
  const detailBillDocsInv = selectedInv ? (invoices.find(inv => inv.id === selectedInv.id) || selectedInv) : null;

  // ══════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════

  // ── DETAIL PAGE ──
  if (page === 'detail' && selectedInv) {
    const inv = invoices.find(i => i.id === selectedInv.id) || selectedInv;
    const activeDocs  = (inv.docs || []).filter(d => !d.trashed);
    const trashedDocs = (inv.docs || []).filter(d => d.trashed);

    return (
      <div className="px-6 py-5 w-full">

        {/* Back */}
        <button onClick={() => { setPage('list'); setSelectedInv(null); setEditingItems(false); setDocsPanel(false); }}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-slate-700 mb-4 transition-colors">
          <ArrowLeft size={13} /> Back to Invoices
        </button>

        {/* ── Header ── */}
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
          <div>
            <h2 className="text-[20px] font-bold text-slate-900">{inv.invoice_no}</h2>
            <p className="text-[12px] text-slate-400 mt-0.5">{fmtDate(inv.invoice_date)} · {fmtAmt(inv.amount)}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Docs button */}
            <button onClick={() => { setBillDocsInvId(inv.id); setDocsPanel(true); }}
              className="relative flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-[12px] font-semibold rounded-lg hover:bg-slate-50">
              <FileText size={12} /> Docs
              {activeDocs.length > 0 && (
                <span className="ml-0.5 bg-blue-100 text-blue-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeDocs.length}</span>
              )}
            </button>
            {canEdit && (
              <>
                <input ref={itemExcelInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { handleItemExcelImport(e.target.files?.[0]); e.target.value = ''; }} />
                {editingItems ? (
                  <>
                    <button onClick={() => { setEditingItems(false); const items = inv.items || []; setDetailItems(items.map(it => ({ item: it.item||'', hsn: it.hsn||'', unit: it.unit||'', qty: String(it.qty||''), rate: String(it.rate||''), gst_pct: String(it.gst_pct||''), remarks: it.remarks||'' }))); }}
                      className="px-3 py-1.5 border border-slate-200 text-slate-600 text-[12px] font-semibold rounded-lg hover:bg-slate-50">Cancel</button>
                    <button onClick={handleSaveDetail} disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-[12px] font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60">
                      {saving ? 'Saving…' : 'Save Details'}
                    </button>
                  </>
                ) : (
                  <button onClick={() => { const items = inv.items || []; setDetailItems(items.length > 0 ? items.map(it => ({ item: it.item||'', hsn: it.hsn||'', unit: it.unit||'', qty: String(it.qty||''), rate: String(it.rate||''), gst_pct: String(it.gst_pct||''), remarks: it.remarks||'' })) : [blankItem()]); setEditingItems(true); }}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-[12px] font-semibold rounded-lg hover:bg-slate-800">
                    <Pencil size={12} /> {(inv.items || []).length > 0 ? 'Edit Details' : 'Add Detail'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Items table ── */}
        <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
          {editingItems ? (
            <>
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Line Items</span>
                <button onClick={addDetailRow} className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 border border-slate-200 px-2.5 py-1 rounded-md hover:bg-slate-50">
                  <Plus size={12} /> Add Row
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['S.No','Item','HSN','Unit','Qty','Rate (₹)', ...(discountConfig.mode === 'inline' ? ['Disc%'] : []), 'GST %','GST Amt','Net Amt','Remarks',''].map((h,i) => (
                        <th key={i} className={`px-2 py-2.5 text-[11px] font-semibold text-slate-500 border-r border-slate-100 last:border-r-0 ${['S.No','Qty','Rate (₹)','Disc%','GST %','GST Amt','Net Amt'].includes(h) ? 'text-center' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailItems.map((it, i) => {
                      const { gst_amount, net_amount } = calcRow(it, discountConfig.mode);
                      return (
                        <tr key={i}>
                          <td className="px-2 py-1.5 text-center text-slate-400 border-r border-slate-100 w-10">{i+1}</td>
                          <td className="px-2 py-1.5 border-r border-slate-100 min-w-[130px]"><input value={it.item} onChange={e => updateDetail(i,'item',e.target.value)} placeholder="Item" className="w-full px-2 py-1 border border-slate-200 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-slate-300" /></td>
                          <td className="px-2 py-1.5 border-r border-slate-100 w-24"><input value={it.hsn} onChange={e => updateDetail(i,'hsn',e.target.value)} placeholder="HSN" className="w-full px-2 py-1 border border-slate-200 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-slate-300" /></td>
                          <td className="px-2 py-1.5 border-r border-slate-100 w-20"><input value={it.unit} onChange={e => updateDetail(i,'unit',e.target.value)} placeholder="Unit" className="w-full px-2 py-1 border border-slate-200 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-slate-300" /></td>
                          <td className="px-2 py-1.5 border-r border-slate-100 w-20"><input type="text" inputMode="decimal" value={it.qty} onChange={e => updateDetail(i,'qty',e.target.value.replace(/[^0-9.]/g,''))} placeholder="0" className="w-full px-2 py-1 border border-slate-200 rounded text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-slate-300" /></td>
                          <td className="px-2 py-1.5 border-r border-slate-100 w-28"><input type="text" inputMode="decimal" value={it.rate} onChange={e => updateDetail(i,'rate',e.target.value.replace(/[^0-9.]/g,''))} placeholder="0" className="w-full px-2 py-1 border border-slate-200 rounded text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-slate-300" /></td>
                          {discountConfig.mode === 'inline' && (
                            <td className="px-2 py-1.5 border-r border-slate-100 w-20"><input type="text" inputMode="decimal" value={it.disc_pct} onChange={e => updateDetail(i,'disc_pct',e.target.value.replace(/[^0-9.]/g,''))} placeholder="0" className="w-full px-2 py-1 border border-slate-200 rounded text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-slate-300" /></td>
                          )}
                          <td className="px-2 py-1.5 border-r border-slate-100 w-20"><input type="text" inputMode="decimal" value={it.gst_pct} onChange={e => updateDetail(i,'gst_pct',e.target.value.replace(/[^0-9.]/g,''))} placeholder="0" className="w-full px-2 py-1 border border-slate-200 rounded text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-slate-300" /></td>
                          <td className="px-2 py-1.5 text-right text-slate-500 border-r border-slate-100 w-28">₹{gst_amount.toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                          <td className="px-2 py-1.5 text-right font-semibold text-slate-800 border-r border-slate-100 w-28">₹{net_amount.toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                          <td className="px-2 py-1.5 border-r border-slate-100 min-w-[110px]"><input value={it.remarks} onChange={e => updateDetail(i,'remarks',e.target.value)} placeholder="Note" className="w-full px-2 py-1 border border-slate-200 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-slate-300" /></td>
                          <td className="px-2 py-1.5 text-center w-8">{detailItems.length > 1 && <button onClick={() => removeDetailRow(i)} className="p-1 text-slate-300 hover:text-red-500"><X size={12} /></button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (inv.items || []).length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-[13px] font-semibold text-slate-300">No line items added yet</p>
              {canEdit && (
                <button onClick={() => { setDetailItems([blankItem()]); setEditingItems(true); }}
                  className="mt-3 flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-[12px] font-semibold rounded-lg hover:bg-slate-50 mx-auto">
                  <Plus size={12} /> Add Detail
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['S.No','Item','HSN Code','Unit','Qty','Rate', ...(discountConfig.mode === 'inline' ? ['Disc%'] : []), 'GST %','GST Amount','Net Amount','Remarks'].map((h,i) => (
                      <th key={h} className={`px-3 py-2.5 text-[11px] font-semibold text-slate-500 border-r border-slate-100 last:border-r-0 whitespace-nowrap ${['Qty','Rate','Disc%','GST %','GST Amount','Net Amount'].includes(h) ? 'text-right' : i===0 ? 'text-center' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inv.items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2.5 text-center text-slate-400 border-r border-slate-100">{idx+1}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800 border-r border-slate-100">{it.item || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-500 border-r border-slate-100">{it.hsn || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-500 border-r border-slate-100">{it.unit || '—'}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700 border-r border-slate-100">{it.qty}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700 border-r border-slate-100">₹{Number(it.rate||0).toLocaleString('en-IN')}</td>
                      {discountConfig.mode === 'inline' && <td className="px-3 py-2.5 text-right text-slate-500 border-r border-slate-100">{Number(it.disc_pct||0)}%</td>}
                      <td className="px-3 py-2.5 text-right text-slate-500 border-r border-slate-100">{it.gst_pct}%</td>
                      <td className="px-3 py-2.5 text-right text-slate-700 border-r border-slate-100">₹{Number(it.gst_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-800 border-r border-slate-100">₹{Number(it.net_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                      <td className="px-3 py-2.5 text-slate-400">{it.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Calculation Box ── */}
        {(() => {
          const items = editingItems ? detailItems : (selectedInv?.items || []);
          const discMode = discountConfig.mode;
          const discPct  = Number(discountConfig.pct) || 0;

          // Per-item base after inline discount
          const itemBases = items.map(it => {
            const qty = Number(it.qty) || 0, rate = Number(it.rate) || 0;
            const disc = discMode === 'inline' ? (Number(it.disc_pct) || 0) : 0;
            return qty * rate * (1 - disc / 100);
          });
          const subtotal = itemBases.reduce((s, b) => s + b, 0);
          const discountAmt = discMode === 'total' ? subtotal * discPct / 100 : 0;
          const afterDiscount = subtotal - discountAmt;

          const beforeGstCharges = detailCharges.filter(c => c.before_gst !== false);
          const afterGstCharges  = detailCharges.filter(c => c.before_gst === false);
          const beforeGstAmt = beforeGstCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
          const afterGstAmt  = afterGstCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
          const taxable = afterDiscount + beforeGstAmt;

          const discFactor = discMode === 'total' ? (1 - discPct / 100) : 1;
          const gstSum = items.reduce((s, it, idx) => s + itemBases[idx] * discFactor * (Number(it.gst_pct) || 0) / 100, 0);
          const grandTotal = taxable + gstSum + afterGstAmt;

          const showTaxableLine = discountAmt > 0 || beforeGstAmt > 0;

          const CHARGE_OPTIONS = [
            { label: 'Freight Charge', type: 'addition' },
            { label: 'Labour Charge', type: 'addition' },
          ];
          const addedLabels = detailCharges.map(c => c.label);
          const available   = CHARGE_OPTIONS.filter(o => !addedLabels.includes(o.label));
          const canAddDiscount = !discMode;

          return (
            <div className="mt-4 flex justify-end">
              <div className="w-full max-w-sm bg-white border border-slate-200 rounded-md overflow-hidden">

                {/* Calculation Modal */}
                {calcModalOpen && (
                  <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setCalcModalOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                        <span className="text-[13px] font-bold text-slate-800">Calculation Breakdown</span>
                        <button onClick={() => setCalcModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded"><X size={14} /></button>
                      </div>
                      <div className="px-5 py-4 space-y-2 text-[12px]">
                        {/* Subtotal */}
                        <div className="flex justify-between text-slate-600">
                          <span>Subtotal (Base)</span>
                          <span className="font-medium text-slate-800">₹{subtotal.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                        </div>
                        {/* Inline discount note */}
                        {discMode === 'inline' && (
                          <div className="text-slate-400 italic text-[11px]">↳ Discount applied per item (In-line)</div>
                        )}
                        {/* Total discount */}
                        {discMode === 'total' && discPct > 0 && (
                          <div className="flex justify-between text-red-500">
                            <span>Discount ({discPct}%) on ₹{subtotal.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                            <span>–₹{discountAmt.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                          </div>
                        )}
                        {/* Before-GST charges */}
                        {beforeGstCharges.map(c => (
                          <div key={c.id} className="flex justify-between text-slate-600">
                            <span>{c.label} (Before GST)</span>
                            <span>+₹{Number(c.amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                          </div>
                        ))}
                        {/* Taxable line */}
                        {showTaxableLine && (
                          <div className="flex justify-between font-semibold text-slate-700 border-t border-slate-100 pt-2">
                            <span>Taxable Amount</span>
                            <span>₹{taxable.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                          </div>
                        )}
                        {/* GST breakdown per item */}
                        <div className="border-t border-slate-100 pt-2">
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">GST Breakdown</div>
                          {items.map((it, idx) => {
                            const disc = discMode === 'inline' ? (Number(it.disc_pct)||0) : 0;
                            const base = (Number(it.qty)||0)*(Number(it.rate)||0)*(1-disc/100)*discFactor;
                            const gst  = base*(Number(it.gst_pct)||0)/100;
                            if (!it.item && !base) return null;
                            return (
                              <div key={idx} className="flex justify-between text-slate-500 text-[11px] py-0.5">
                                <span className="truncate max-w-[55%]">{it.item || `Item ${idx+1}`}{it.gst_pct ? ` @${it.gst_pct}%` : ''}{disc ? ` (disc ${disc}%)` : ''}</span>
                                <span>₹{gst.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                              </div>
                            );
                          })}
                          <div className="flex justify-between text-slate-700 font-semibold pt-1 border-t border-slate-100">
                            <span>Total GST</span>
                            <span>₹{gstSum.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                          </div>
                        </div>
                        {/* After-GST charges */}
                        {afterGstCharges.length > 0 && (
                          <div className="border-t border-slate-100 pt-2 space-y-1">
                            {afterGstCharges.map(c => (
                              <div key={c.id} className="flex justify-between text-slate-600">
                                <span>{c.label} (After GST)</span>
                                <span>+₹{Number(c.amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Grand Total */}
                        <div className="flex justify-between font-bold text-slate-900 bg-slate-50 rounded-lg px-3 py-2.5 mt-2 text-[13px]">
                          <span>Total Value</span>
                          <span>₹{grandTotal.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Summary</span>
                    <button onClick={() => setCalcModalOpen(true)}
                      className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-50 transition-colors">
                      <Eye size={10} /> View Calculation
                    </button>
                  </div>
                  {canEdit && (available.length > 0 || canAddDiscount) && (
                    <div className="relative">
                      <button onClick={() => setChargesMenuOpen(o => !o)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 px-2 py-1 rounded hover:bg-white">
                        <Plus size={10} /> Add Charge <ChevronDown size={10} className={`transition-transform ${chargesMenuOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {chargesMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded shadow-lg z-20">
                          {available.map(opt => (
                            <button key={opt.label} onClick={() => {
                              setDetailCharges(c => [...c, { id: `ch_${Date.now()}`, label: opt.label, type: opt.type, amount: '', before_gst: true }]);
                              setChargesMenuOpen(false);
                            }} className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50">
                              {opt.label}
                            </button>
                          ))}
                          {available.length > 0 && canAddDiscount && <div className="border-t border-slate-100 my-1" />}
                          {canAddDiscount && (
                            <button onClick={() => { setDiscountConfig({ mode: 'total', pct: '' }); setChargesMenuOpen(false); }}
                              className="w-full text-left px-3 py-2 text-[12px] text-red-600 hover:bg-slate-50">
                              Discount
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="px-4 py-2 space-y-0">

                  {/* Subtotal */}
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-[12px] text-slate-500">Subtotal (Base)</span>
                    <span className="text-[12px] font-medium text-slate-800">₹{subtotal.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                  </div>

                  {/* Discount row */}
                  {discMode && (
                    <div className="py-2 border-b border-slate-100">
                      {/* Mode toggle */}
                      {canEdit && (
                        <div className="flex items-center gap-1 mb-2">
                          <button onClick={() => setDiscountConfig(d => ({ ...d, mode: 'total' }))}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${discMode==='total' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                            Total %
                          </button>
                          <button onClick={() => setDiscountConfig(d => ({ ...d, mode: 'inline' }))}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${discMode==='inline' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                            In-line
                          </button>
                          <button onClick={() => setDiscountConfig({ mode: null, pct: '' })}
                            className="ml-auto p-0.5 text-slate-300 hover:text-red-500"><X size={12} /></button>
                        </div>
                      )}
                      {discMode === 'total' ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] text-red-500">Discount (–)</span>
                          {canEdit ? (
                            <div className="flex items-center gap-1">
                              <input type="text" inputMode="decimal" value={discountConfig.pct}
                                onChange={e => setDiscountConfig(d => ({ ...d, pct: e.target.value.replace(/[^0-9.]/g,'') }))}
                                className="w-16 px-2 py-0.5 border border-slate-200 rounded text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-slate-300"
                                placeholder="0" />
                              <span className="text-[12px] text-slate-400">%</span>
                              <span className="text-[12px] font-medium text-red-500 w-28 text-right">–₹{discountAmt.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                            </div>
                          ) : (
                            <span className="text-[12px] font-medium text-red-500">–₹{discountAmt.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] text-slate-400 italic">Discount applied per item (In-line)</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Before-GST charges (Freight / Labour with before_gst=true) */}
                  {beforeGstCharges.map((c, i) => {
                    const globalIdx = detailCharges.findIndex(ch => ch.id === c.id);
                    return (
                      <div key={c.id} className="py-2 border-b border-slate-100">
                        {canEdit && (
                          <div className="flex items-center gap-1 mb-1.5">
                            <button onClick={() => setDetailCharges(prev => prev.map((ch, idx) => idx === globalIdx ? { ...ch, before_gst: true } : ch))}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${c.before_gst !== false ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                              Before GST
                            </button>
                            <button onClick={() => setDetailCharges(prev => prev.map((ch, idx) => idx === globalIdx ? { ...ch, before_gst: false } : ch))}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${c.before_gst === false ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                              After GST
                            </button>
                            <button onClick={() => setDetailCharges(prev => prev.filter((_, idx) => idx !== globalIdx))}
                              className="ml-auto p-0.5 text-slate-300 hover:text-red-500"><X size={12} /></button>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] text-slate-600">{c.label} (+)</span>
                          {canEdit ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[12px] text-slate-400">₹</span>
                              <input type="text" inputMode="decimal" value={c.amount}
                                onChange={e => setDetailCharges(prev => prev.map((ch, idx) => idx === globalIdx ? { ...ch, amount: e.target.value.replace(/[^0-9.]/g,'') } : ch))}
                                className="w-28 px-2 py-0.5 border border-slate-200 rounded text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-slate-300"
                                placeholder="0.00" />
                            </div>
                          ) : (
                            <span className="text-[12px] font-medium text-slate-800">+₹{Number(c.amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Taxable line (shown only if there's discount or before-GST charges) */}
                  {showTaxableLine && (
                    <div className="flex justify-between items-center py-2 border-b border-slate-200 bg-slate-50 -mx-4 px-4">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Taxable Amount</span>
                      <span className="text-[12px] font-semibold text-slate-800">₹{taxable.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                    </div>
                  )}

                  {/* GST */}
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-[12px] text-slate-500">GST Amount</span>
                    <span className="text-[12px] font-medium text-slate-800">₹{gstSum.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                  </div>

                  {/* After-GST charges */}
                  {afterGstCharges.map((c) => {
                    const globalIdx = detailCharges.findIndex(ch => ch.id === c.id);
                    return (
                      <div key={c.id} className="py-2 border-b border-slate-100">
                        {canEdit && (
                          <div className="flex items-center gap-1 mb-1.5">
                            <button onClick={() => setDetailCharges(prev => prev.map((ch, idx) => idx === globalIdx ? { ...ch, before_gst: true } : ch))}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold border bg-white text-slate-500 border-slate-200 hover:bg-slate-50">
                              Before GST
                            </button>
                            <button onClick={() => setDetailCharges(prev => prev.map((ch, idx) => idx === globalIdx ? { ...ch, before_gst: false } : ch))}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold border bg-slate-800 text-white border-slate-800">
                              After GST
                            </button>
                            <button onClick={() => setDetailCharges(prev => prev.filter((_, idx) => idx !== globalIdx))}
                              className="ml-auto p-0.5 text-slate-300 hover:text-red-500"><X size={12} /></button>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] text-slate-600">{c.label} (+)</span>
                          {canEdit ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[12px] text-slate-400">₹</span>
                              <input type="text" inputMode="decimal" value={c.amount}
                                onChange={e => setDetailCharges(prev => prev.map((ch, idx) => idx === globalIdx ? { ...ch, amount: e.target.value.replace(/[^0-9.]/g,'') } : ch))}
                                className="w-28 px-2 py-0.5 border border-slate-200 rounded text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-slate-300"
                                placeholder="0.00" />
                            </div>
                          ) : (
                            <span className="text-[12px] font-medium text-slate-800">+₹{Number(c.amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total */}
                <div className="flex justify-between items-center px-4 py-3 bg-slate-900">
                  <span className="text-[12px] font-bold text-white">Total Value</span>
                  <span className="text-[14px] font-bold text-white">₹{grandTotal.toLocaleString('en-IN',{minimumFractionDigits:2})}</span>
                </div>

                {/* Save charges */}
                {canEdit && (detailCharges.length > 0 || discMode) && (
                  <div className="flex justify-end px-4 py-2.5 border-t border-slate-100 bg-slate-50">
                    <button onClick={handleSaveCharges} disabled={savingCharges}
                      className="px-3 py-1.5 bg-slate-800 text-white text-[11px] font-semibold rounded hover:bg-slate-700 disabled:opacity-60">
                      {savingCharges ? 'Saving…' : 'Save Charges'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Confirm Dialog ── */}
        {confirmDlg && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-xs mx-4 overflow-hidden">
              <div className="px-5 py-5">
                <p className="text-[14px] font-semibold text-slate-800">{confirmDlg.msg}</p>
                <p className="text-[12px] text-slate-400 mt-1">This action cannot be undone.</p>
              </div>
              <div className="px-5 pb-4 flex justify-end gap-2">
                <button onClick={() => setConfirmDlg(null)} className="px-4 py-2 text-[12px] font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button onClick={() => { setConfirmDlg(null); confirmDlg.onOk(); }} className="px-4 py-2 text-[12px] font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600">Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Docs Side Panel ── */}
        {docsPanel && (
          <div className="fixed inset-0 z-[250] flex justify-end" onClick={() => { setDocsPanel(false); setDocTrashOpen(false); }}>
            <div className="bg-white w-80 h-full shadow-2xl flex flex-col border-l border-slate-200" onClick={e => e.stopPropagation()}>
              {/* Panel header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-[13px] font-bold text-slate-900">Bill Documents</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{activeDocs.length} file{activeDocs.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {trashedDocs.length > 0 && (
                    <button onClick={() => setDocTrashOpen(o => !o)}
                      className={`relative flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors
                        ${docTrashOpen ? 'border-orange-200 bg-orange-50 text-orange-500' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      <Trash2 size={11} />
                      <span>{trashedDocs.length}</span>
                    </button>
                  )}
                  {canEdit && (
                    <button onClick={() => { setBillDocsInvId(inv.id); billDocInputRef.current?.click(); }} disabled={uploadingBillDoc}
                      className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 text-slate-600 text-[11px] font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60">
                      <Plus size={11} /> {uploadingBillDoc ? 'Uploading…' : 'Upload'}
                    </button>
                  )}
                  <button onClick={() => { setDocsPanel(false); setDocTrashOpen(false); }} className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"><X size={15} /></button>
                </div>
              </div>
              <input ref={billDocInputRef} type="file" multiple accept="application/pdf,image/*" className="hidden"
                onChange={async e => { const files = Array.from(e.target.files || []); e.target.value = ''; for (const f of files) await handleUploadBillDoc(f, inv.id, 'invoice'); }} />
              <input ref={detailEwayInputRef} type="file" multiple accept="application/pdf,image/*" className="hidden"
                onChange={async e => { const files = Array.from(e.target.files || []); e.target.value = ''; for (const f of files) await handleUploadBillDoc(f, inv.id, 'eway'); }} />

              {docTrashOpen ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Trash ({trashedDocs.length})</span>
                    <button onClick={() => handlePermanentDeleteDocs(inv.id, trashedDocs.map(d => d.id))}
                      className="text-[11px] font-semibold text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">Empty</button>
                  </div>
                  {trashedDocs.map(d => (
                    <div key={d.id} className="flex items-center gap-2.5 px-3 py-2 rounded border border-slate-100 bg-slate-50">
                      <FileText size={12} className="text-slate-300 shrink-0" />
                      <p className="flex-1 text-[11px] text-slate-400 truncate">{d.name}</p>
                      <button onClick={() => { fetch(`${API}/api/orders/${orderId}/vendor-invoices/${inv.id}/docs/${d.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: false }) }).then(() => fetchInvoices()); }}
                        className="p-1 text-slate-300 hover:text-green-500 rounded"><Undo2 size={11} /></button>
                      <button onClick={() => handlePermanentDeleteDocs(inv.id, [d.id])} className="p-1 text-slate-300 hover:text-red-500 rounded"><Trash2 size={11} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {/* Invoice Docs section */}
                  {(() => {
                    const invDocs  = activeDocs.filter(d => !d.doc_type || d.doc_type === 'invoice');
                    const ewayDocs = activeDocs.filter(d => d.doc_type === 'eway');
                    return (
                      <>
                        <div className="border-b border-slate-100">
                          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Invoice Docs</span>
                            <button onClick={() => billDocInputRef.current?.click()} disabled={uploadingBillDoc}
                              className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-50">
                              <Plus size={10} /> Add
                            </button>
                          </div>
                          <div className="px-4 py-2 space-y-1.5 min-h-[36px]">
                            {invDocs.length === 0 ? (
                              <p className="text-[11px] text-slate-400 py-1">No invoice docs</p>
                            ) : invDocs.map(d => {
                              const isPdf = /\.pdf(\?|$)/i.test(d.name || '');
                              return (
                                <div key={d.id} className="flex items-center gap-2 py-1">
                                  <div className={`w-6 h-6 rounded shrink-0 flex items-center justify-center ${isPdf ? 'bg-red-50 text-red-400' : 'bg-slate-100 text-slate-400'}`}>
                                    <FileText size={11} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-medium text-slate-700 truncate">{d.name}</p>
                                    <p className="text-[10px] text-slate-400">{fmtBytes(d.size)}</p>
                                  </div>
                                  <a href={d.url} target="_blank" rel="noreferrer" className="p-1 text-slate-400 hover:text-slate-700 rounded"><Eye size={11} /></a>
                                  <a href={d.url} download={d.name} className="p-1 text-slate-400 hover:text-slate-700 rounded"><Download size={11} /></a>
                                  <button onClick={() => handleSoftDeleteDoc(inv.id, d.id)} className="p-1 text-slate-400 hover:text-orange-500 rounded"><Trash2 size={11} /></button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">E-way Bill</span>
                            <button onClick={() => detailEwayInputRef.current?.click()} disabled={editUploadingEway}
                              className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-50">
                              <Plus size={10} /> Add
                            </button>
                          </div>
                          <div className="px-4 py-2 space-y-1.5 min-h-[36px]">
                            {ewayDocs.length === 0 ? (
                              <p className="text-[11px] text-slate-400 py-1">No E-way bill docs</p>
                            ) : ewayDocs.map(d => {
                              const isPdf = /\.pdf(\?|$)/i.test(d.name || '');
                              return (
                                <div key={d.id} className="flex items-center gap-2 py-1">
                                  <div className={`w-6 h-6 rounded shrink-0 flex items-center justify-center ${isPdf ? 'bg-red-50 text-red-400' : 'bg-slate-100 text-slate-400'}`}>
                                    <FileText size={11} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-medium text-slate-700 truncate">{d.name}</p>
                                    <p className="text-[10px] text-slate-400">{fmtBytes(d.size)}</p>
                                  </div>
                                  <a href={d.url} target="_blank" rel="noreferrer" className="p-1 text-slate-400 hover:text-slate-700 rounded"><Eye size={11} /></a>
                                  <a href={d.url} download={d.name} className="p-1 text-slate-400 hover:text-slate-700 rounded"><Download size={11} /></a>
                                  <button onClick={() => handleSoftDeleteDoc(inv.id, d.id)} className="p-1 text-slate-400 hover:text-orange-500 rounded"><Trash2 size={11} /></button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── TRASH PAGE ──
  if (page === 'trash') {
    const selAll = trashedInvoices.length > 0 && trashedInvoices.every(inv => invTrashSel.has(inv.id));
    const toggleSel = (id) => setInvTrashSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleAll = () => setInvTrashSel(selAll ? new Set() : new Set(trashedInvoices.map(inv => inv.id)));
    return (
      <div className="px-8 py-5 max-w-[860px]">
        <button onClick={() => { setPage('list'); setInvTrashSel(new Set()); }}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ArrowLeft size={14} /> Back to Invoices
        </button>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[14px] font-bold text-slate-900">Trash <span className="text-slate-400 font-normal">({trashedInvoices.length})</span></h2>
          <div className="flex gap-2">
            {invTrashSel.size > 0 && (
              <button onClick={() => handlePermanentDeleteInvoices([...invTrashSel])}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-500 text-[12px] font-semibold rounded-lg hover:bg-red-50">
                <Trash2 size={12} /> Delete ({invTrashSel.size})
              </button>
            )}
            {trashedInvoices.length > 0 && (
              <button onClick={() => handlePermanentDeleteInvoices(trashedInvoices.map(inv => inv.id))}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-[12px] font-semibold rounded-lg hover:bg-slate-50">
                Empty Trash
              </button>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {trashedInvoices.length === 0 ? (
            <div className="py-14 text-center text-[12px] text-slate-300">Trash is empty</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 w-10">
                    <input type="checkbox" checked={selAll} onChange={toggleAll} className="w-3.5 h-3.5 accent-red-500 cursor-pointer" />
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Invoice No</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Invoice Date</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Amount</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-500 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trashedInvoices.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-center">
                      <input type="checkbox" checked={invTrashSel.has(inv.id)} onChange={() => toggleSel(inv.id)} className="w-3.5 h-3.5 accent-red-500 cursor-pointer" />
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 line-through">{inv.invoice_no}</td>
                    <td className="px-4 py-2.5 text-slate-400">{fmtDate(inv.invoice_date)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">{fmtAmt(inv.amount)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleRestoreInv(inv.id)}
                          className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 border border-slate-200 rounded hover:bg-slate-50">
                          Restore
                        </button>
                        <button onClick={() => handlePermanentDeleteInvoices([inv.id])}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {confirmDlg && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-xs mx-4 overflow-hidden">
              <div className="px-5 py-5">
                <p className="text-[14px] font-semibold text-slate-800">{confirmDlg.msg}</p>
                <p className="text-[12px] text-slate-400 mt-1">Yeh action undo nahi hogi.</p>
              </div>
              <div className="px-5 pb-4 flex justify-end gap-2">
                <button onClick={() => setConfirmDlg(null)} className="px-4 py-2 text-[12px] font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button onClick={() => { setConfirmDlg(null); confirmDlg.onOk(); }} className="px-4 py-2 text-[12px] font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── LIST PAGE ──
  return (
    <div className="px-6 py-5 w-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
        <h2 className="text-[16px] font-bold text-slate-900">Vendor Invoices</h2>
        <div className="flex items-center gap-2">
          <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { handleExcelImport(e.target.files?.[0]); e.target.value = ''; }} />
          {/* More dropdown */}
          <div className="relative" ref={moreRef}>
            <button onClick={() => setMoreOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-[12px] font-semibold rounded-lg hover:bg-slate-50">
              More <ChevronDown size={12} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden"
                onMouseLeave={() => setMoreOpen(false)}>
                <button onClick={() => { downloadInvoiceTemplate(); setMoreOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                  <Download size={13} className="text-slate-400" /> Template
                </button>
                <button onClick={() => { excelInputRef.current?.click(); setMoreOpen(false); }} disabled={importing}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60">
                  <Upload size={13} className="text-slate-400" /> {importing ? 'Importing…' : 'Import Excel'}
                </button>
                <div className="border-t border-slate-100" />
                <button onClick={() => { setPage('trash'); setMoreOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                  <Trash2 size={13} className="text-slate-400" /> Trash
                  {trashedInvoices.length > 0 && (
                    <span className="ml-auto px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 border border-slate-300 rounded-full">
                      {trashedInvoices.length}
                    </span>
                  )}
                </button>
                <button onClick={() => { fetchGlobalLog(); setGlobalLogPanel(true); setMoreOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                  <Clock size={13} className="text-slate-400" /> Log
                </button>
              </div>
            )}
          </div>
          {canEdit && (
            <button onClick={() => setAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-[12px] font-semibold rounded-lg hover:bg-slate-800">
              <Plus size={13} /> Add Invoice
            </button>
          )}
        </div>
      </div>

      {/* ── Analytics ── */}
      <div className="flex gap-4 mb-5">
        <div className="bg-[#f7f6f3] rounded-md px-6 py-3 w-48">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Invoices</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{loadingInv ? '—' : activeInvoices.length}</p>
        </div>
        <div className="bg-[#f7f6f3] rounded-md px-6 py-3 w-56">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Amount</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{loadingInv ? '—' : fmtAmt(totalAmount)}</p>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-md border border-slate-200 overflow-hidden shadow-sm">
        {loadingInv ? (
          <div className="py-16 text-center text-[12px] text-slate-400">Loading…</div>
        ) : activeInvoices.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-slate-300 select-none">No invoices added yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['S.No','Invoice No','Invoice Date','Amount','Bill Docs','Added By','Date Added','Actions'].map((h,i) => (
                    <th key={h} className={`px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-r border-slate-100 last:border-r-0 ${i===0||i===3||i===4 ? 'text-center' : i===7 ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeInvoices.map((inv, idx) => {
                  const docsCount = (inv.docs || []).filter(d => !d.trashed).length;
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-center text-slate-400 font-medium border-r border-slate-100 w-12">{idx + 1}</td>
                      <td className="px-4 py-3 border-r border-slate-100">
                        <button onClick={() => openDetailPage(inv)}
                          className="font-semibold text-blue-600 hover:text-blue-700 hover:underline text-left transition-colors">
                          {inv.invoice_no}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600 border-r border-slate-100 whitespace-nowrap">{fmtDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-800 border-r border-slate-100">{fmtAmt(inv.amount)}</td>
                      <td className="px-4 py-3 text-center border-r border-slate-100">
                        <button onClick={() => { setBillDocsInvId(inv.id); setDocsPanel(true); }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors
                            ${docsCount > 0 ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 cursor-pointer'}`}>
                          <FileText size={10} /> {docsCount > 0 ? docsCount : '—'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600 border-r border-slate-100">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center shrink-0">
                            {(inv.created_by || '?').charAt(0).toUpperCase()}
                          </span>
                          <span className="truncate max-w-[100px]">{inv.created_by || '—'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 border-r border-slate-100 whitespace-nowrap">{fmtDate(inv.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button onClick={() => { setEditInvModal(inv); setEditInvForm({ invoice_no: inv.invoice_no, invoice_date: inv.invoice_date?.slice(0,10) || '', amount: String(inv.amount || '') }); }}
                              title="Edit" className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-all">
                              <Pencil size={13} />
                            </button>
                          )}
                          <button onClick={() => setLogModal(inv)} title="Activity Log"
                            className="p-1.5 text-slate-400 hover:text-violet-500 hover:bg-violet-50 rounded-md transition-all">
                            <Clock size={13} />
                          </button>
                          <button onClick={() => handleSoftDeleteInv(inv.id)} title="Move to Trash"
                            className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-md transition-all">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Confirm Dialog ── */}
      {confirmDlg && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xs mx-4 overflow-hidden">
            <div className="px-5 py-5">
              <p className="text-[14px] font-semibold text-slate-800">{confirmDlg.msg}</p>
              <p className="text-[12px] text-slate-400 mt-1">This action cannot be undone.</p>
            </div>
            <div className="px-5 pb-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDlg(null)} className="px-4 py-2 text-[12px] font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={() => { setConfirmDlg(null); confirmDlg.onOk(); }} className="px-4 py-2 text-[12px] font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Invoice Modal ── */}
      {editInvModal && (() => {
        const currentInv = invoices.find(i => i.id === editInvModal.id) || editInvModal;
        const activeDocs = (currentInv.docs || []).filter(d => !d.trashed);
        const invoiceDocs = activeDocs.filter(d => !d.doc_type || d.doc_type === 'invoice');
        const ewayDocs    = activeDocs.filter(d => d.doc_type === 'eway');
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h2 className="text-[14px] font-bold text-slate-900">Edit Invoice</h2>
                <button onClick={() => setEditInvModal(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"><X size={16} /></button>
              </div>
              <div className="px-5 py-4 space-y-3.5 overflow-y-auto">
                {/* Basic fields */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Invoice No *</label>
                    <input value={editInvForm.invoice_no} onChange={e => setEditInvForm(f => ({ ...f, invoice_no: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-slate-300" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Invoice Date</label>
                    <input type="date" value={editInvForm.invoice_date} onChange={e => setEditInvForm(f => ({ ...f, invoice_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-slate-300" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Amount (₹)</label>
                    <input type="text" inputMode="decimal" value={editInvForm.amount} onChange={e => setEditInvForm(f => ({ ...f, amount: e.target.value.replace(/[^0-9.]/g,'') }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-slate-300" />
                  </div>
                </div>

                {/* Invoice Documents */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-600">Invoice Documents</span>
                    <input ref={editInvoiceInputRef} type="file" accept="application/pdf,image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadBillDoc(f, editInvModal.id, 'invoice'); e.target.value=''; }} />
                    <button onClick={() => editInvoiceInputRef.current?.click()} disabled={editUploadingInvoice}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-50">
                      <Upload size={11} /> {editUploadingInvoice ? 'Uploading…' : 'Upload'}
                    </button>
                  </div>
                  <div className="px-3 py-2 space-y-1.5 min-h-[36px]">
                    {invoiceDocs.length === 0 ? (
                      <p className="text-[11px] text-slate-400 py-1">No invoice documents</p>
                    ) : invoiceDocs.map(d => (
                      <div key={d.id} className="flex items-center gap-2">
                        <FileText size={12} className="text-slate-400 shrink-0" />
                        <span className="flex-1 text-[11px] text-slate-600 truncate">{d.name}</span>
                        <button onClick={() => window.open(d.url, '_blank')} className="p-1 text-slate-400 hover:text-blue-500 rounded"><Eye size={11} /></button>
                        <button onClick={() => handleSoftDeleteDoc(editInvModal.id, d.id)} className="p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 size={11} /></button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* E-way Bill */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-600">E-way Bill</span>
                    <input ref={editEwayInputRef} type="file" accept="application/pdf,image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadBillDoc(f, editInvModal.id, 'eway'); e.target.value=''; }} />
                    <button onClick={() => editEwayInputRef.current?.click()} disabled={editUploadingEway}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-50">
                      <Upload size={11} /> {editUploadingEway ? 'Uploading…' : 'Upload'}
                    </button>
                  </div>
                  <div className="px-3 py-2 space-y-1.5 min-h-[36px]">
                    {ewayDocs.length === 0 ? (
                      <p className="text-[11px] text-slate-400 py-1">No E-way bill uploaded</p>
                    ) : ewayDocs.map(d => (
                      <div key={d.id} className="flex items-center gap-2">
                        <FileText size={12} className="text-slate-400 shrink-0" />
                        <span className="flex-1 text-[11px] text-slate-600 truncate">{d.name}</span>
                        <button onClick={() => window.open(d.url, '_blank')} className="p-1 text-slate-400 hover:text-blue-500 rounded"><Eye size={11} /></button>
                        <button onClick={() => handleSoftDeleteDoc(editInvModal.id, d.id)} className="p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 size={11} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2 shrink-0">
                <button onClick={() => setEditInvModal(null)} className="px-4 py-2 text-[12px] font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button onClick={handleEditInvoiceSave} disabled={saving} className="px-4 py-2 text-[12px] font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Log Side Panel ── */}
      {logModal && (() => {
        const logs = [...(logModal.log || [])];
        const getIcon = (action = '') => {
          const a = action.toLowerCase();
          if (a.includes('created'))          return { icon: <Plus size={10} />,      bg: 'bg-green-100 text-green-600' };
          if (a.includes('trash'))            return { icon: <Trash2 size={10} />,    bg: 'bg-orange-100 text-orange-500' };
          if (a.includes('restored'))         return { icon: <Undo2 size={10} />,     bg: 'bg-blue-100 text-blue-500' };
          if (a.includes('document'))         return { icon: <FileText size={10} />,  bg: 'bg-violet-100 text-violet-500' };
          if (a.includes('updated') || a.includes('details')) return { icon: <Pencil size={10} />, bg: 'bg-slate-100 text-slate-500' };
          if (a.includes('deleted'))          return { icon: <X size={10} />,         bg: 'bg-red-100 text-red-500' };
          return { icon: <Clock size={10} />, bg: 'bg-slate-100 text-slate-400' };
        };
        return (
          <div className="fixed inset-0 z-[200] flex justify-end" onClick={() => setLogModal(null)}>
            <div className="bg-white w-80 h-full shadow-2xl flex flex-col border-l border-slate-200" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-[13px] font-bold text-slate-900">Activity Log</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{logModal.invoice_no} · {logs.length} entr{logs.length === 1 ? 'y' : 'ies'}</p>
                </div>
                <button onClick={() => setLogModal(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"><X size={15} /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {logs.length === 0 ? (
                  <p className="text-[12px] text-slate-400 text-center py-10">No activity recorded</p>
                ) : (
                  <div className="relative">
                    {/* vertical line */}
                    <div className="absolute left-[13px] top-4 bottom-4 w-px bg-slate-100" />
                    <div className="space-y-0">
                      {logs.map((entry, i) => {
                        const { icon, bg } = getIcon(entry.action);
                        const isLast = i === logs.length - 1;
                        return (
                          <div key={i} className={`flex gap-3 ${isLast ? '' : 'pb-5'}`}>
                            <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center z-10 ${bg}`}>
                              {icon}
                            </div>
                            <div className="flex-1 pt-0.5">
                              <p className="text-[12px] font-semibold text-slate-800">{entry.action}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-[11px] font-medium text-slate-600">{entry.user || '—'}</span>
                                {entry.at && (
                                  <>
                                    <span className="text-slate-300 text-[10px]">·</span>
                                    <span className="text-[11px] text-slate-400">
                                      {new Date(entry.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Global Invoice Audit Log Panel ── */}
      {globalLogPanel && (() => {
        const getIcon = (action = '') => {
          const a = action.toLowerCase();
          if (a.includes('created'))     return { icon: <Plus size={10} />,     bg: 'bg-green-100 text-green-600' };
          if (a.includes('permanently')) return { icon: <X size={10} />,        bg: 'bg-red-100 text-red-500' };
          if (a.includes('trash'))       return { icon: <Trash2 size={10} />,   bg: 'bg-orange-100 text-orange-500' };
          if (a.includes('restored'))    return { icon: <Undo2 size={10} />,    bg: 'bg-blue-100 text-blue-500' };
          if (a.includes('document'))    return { icon: <FileText size={10} />, bg: 'bg-violet-100 text-violet-500' };
          if (a.includes('updated') || a.includes('details')) return { icon: <Pencil size={10} />, bg: 'bg-slate-100 text-slate-500' };
          return { icon: <Clock size={10} />, bg: 'bg-slate-100 text-slate-400' };
        };

        // Group by invoice_id, preserve order of first appearance
        const groups = [];
        const seen = {};
        globalLogs.forEach(entry => {
          const key = entry.invoice_id || entry.invoice_no || '?';
          if (!seen[key]) { seen[key] = { invoice_no: entry.invoice_no || key, invoice_id: key, entries: [] }; groups.push(seen[key]); }
          seen[key].entries.push(entry);
        });

        const clearInvoiceLog = async (invoiceId) => {
          await fetch(`${API}/api/orders/${orderId}/invoice-audit-log/invoice/${invoiceId}`, { method: 'DELETE' });
          fetchGlobalLog();
        };
        const clearAllLog = async () => {
          await fetch(`${API}/api/orders/${orderId}/invoice-audit-log`, { method: 'DELETE' });
          setGlobalLogs([]);
        };

        return (
          <div className="fixed inset-0 z-[200] flex justify-end" onClick={() => setGlobalLogPanel(false)}>
            <div className="bg-white w-[460px] h-full shadow-2xl flex flex-col border-l border-slate-200" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-[13px] font-bold text-slate-900">Invoice Activity Log</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{globalLogs.length} total entr{globalLogs.length === 1 ? 'y' : 'ies'} · {groups.length} invoice{groups.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {globalLogs.length > 0 && (
                    <button onClick={clearAllLog}
                      className="flex items-center gap-1 text-[11px] font-semibold text-red-400 hover:text-red-600 border border-red-200 hover:border-red-300 px-2.5 py-1 rounded-lg hover:bg-red-50">
                      <Trash2 size={11} /> Clear All
                    </button>
                  )}
                  <button onClick={() => setGlobalLogPanel(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"><X size={15} /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loadingGlobalLog ? (
                  <p className="text-[12px] text-slate-400 text-center py-10">Loading…</p>
                ) : groups.length === 0 ? (
                  <p className="text-[12px] text-slate-400 text-center py-10">No activity yet</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {groups.map((group) => (
                      <div key={group.invoice_id}>
                        {/* Invoice section header */}
                        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-50 sticky top-0 z-10">
                          <span className="text-[12px] font-bold text-indigo-600">{group.invoice_no}</span>
                          <button onClick={() => clearInvoiceLog(group.invoice_id)}
                            className="text-[10px] font-semibold text-slate-400 hover:text-red-500 px-2 py-0.5 rounded hover:bg-red-50 border border-transparent hover:border-red-200">
                            Empty
                          </button>
                        </div>
                        {/* Timeline entries */}
                        <div className="px-5 py-3 relative">
                          <div className="absolute left-[29px] top-3 bottom-3 w-px bg-slate-100" />
                          <div className="space-y-0">
                            {group.entries.map((entry, i) => {
                              const { icon, bg } = getIcon(entry.action);
                              const isLast = i === group.entries.length - 1;
                              return (
                                <div key={i} className={`flex gap-3 items-start ${isLast ? '' : 'pb-4'}`}>
                                  {/* Number badge */}
                                  <div className="flex flex-col items-center shrink-0 w-8">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center z-10 ${bg}`}>{icon}</div>
                                    <span className="text-[9px] text-slate-300 font-medium mt-0.5">{i + 1}</span>
                                  </div>
                                  <div className="flex-1 pt-0.5">
                                    <p className="text-[12px] font-semibold text-slate-800">{entry.action}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                      <span className="text-[11px] font-medium text-slate-600">{entry.user || '—'}</span>
                                      {entry.at && (
                                        <>
                                          <span className="text-slate-300 text-[10px]">·</span>
                                          <span className="text-[11px] text-slate-400">
                                            {new Date(entry.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add Invoice Modal ── */}
      {addModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h2 className="text-[14px] font-bold text-slate-900">Add Invoice</h2>
              <button onClick={() => { setAddModal(false); setAddForm({ invoice_no: '', invoice_date: '', amount: '' }); setPendingFiles([]); }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3.5 overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Invoice No *</label>
                  <input value={addForm.invoice_no} onChange={e => setAddForm(f => ({ ...f, invoice_no: e.target.value }))}
                    placeholder="e.g. INV-001"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Invoice Date *</label>
                  <input type="date" value={addForm.invoice_date} onChange={e => setAddForm(f => ({ ...f, invoice_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Amount (₹)</label>
                  <input type="text" inputMode="decimal" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value.replace(/[^0-9.]/g,'') }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-slate-300" />
                </div>
              </div>
              {/* Invoice Docs */}
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-600">Invoice Docs</span>
                  <input ref={pendingInvoiceInputRef} type="file" accept="application/pdf,image/*" multiple className="hidden"
                    onChange={e => { const files = Array.from(e.target.files || []); if (files.length) setPendingFiles(p => [...p, ...files.map(f => ({ file: f, doc_type: 'invoice' }))]); e.target.value = ''; }} />
                  <button onClick={() => pendingInvoiceInputRef.current?.click()}
                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100">
                    <Plus size={11} /> Add
                  </button>
                </div>
                <div className="px-3 py-2 space-y-1.5 min-h-[32px]">
                  {pendingFiles.filter(pf => pf.doc_type === 'invoice').length === 0 ? (
                    <p className="text-[11px] text-slate-400 py-0.5">No invoice docs added</p>
                  ) : pendingFiles.map((pf, i) => pf.doc_type !== 'invoice' ? null : (
                    <div key={i} className="flex items-center gap-2">
                      <FileText size={12} className="text-slate-400 shrink-0" />
                      <span className="flex-1 text-[11px] text-slate-700 truncate">{pf.file.name}</span>
                      <button onClick={() => setPendingFiles(f => f.filter((_,idx) => idx !== i))} className="p-0.5 text-slate-400 hover:text-red-500"><X size={11} /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* E-way Bill Docs */}
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-600">E-way Bill</span>
                  <input ref={pendingEwayInputRef} type="file" accept="application/pdf,image/*" multiple className="hidden"
                    onChange={e => { const files = Array.from(e.target.files || []); if (files.length) setPendingFiles(p => [...p, ...files.map(f => ({ file: f, doc_type: 'eway' }))]); e.target.value = ''; }} />
                  <button onClick={() => pendingEwayInputRef.current?.click()}
                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100">
                    <Plus size={11} /> Add
                  </button>
                </div>
                <div className="px-3 py-2 space-y-1.5 min-h-[32px]">
                  {pendingFiles.filter(pf => pf.doc_type === 'eway').length === 0 ? (
                    <p className="text-[11px] text-slate-400 py-0.5">No E-way bill added</p>
                  ) : pendingFiles.map((pf, i) => pf.doc_type !== 'eway' ? null : (
                    <div key={i} className="flex items-center gap-2">
                      <FileText size={12} className="text-slate-400 shrink-0" />
                      <span className="flex-1 text-[11px] text-slate-700 truncate">{pf.file.name}</span>
                      <button onClick={() => setPendingFiles(f => f.filter((_,idx) => idx !== i))} className="p-0.5 text-slate-400 hover:text-red-500"><X size={11} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between">
              <button onClick={() => { setAddModal(false); setAddForm({ invoice_no: '', invoice_date: '', amount: '' }); setPendingFiles([]); }}
                className="px-4 py-2 text-[12px] font-semibold text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">Cancel</button>
              <div className="flex gap-2">
                <button onClick={() => handleAddSave(false)} disabled={saving}
                  className="px-4 py-2 text-[12px] font-semibold text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => handleAddSave(true)} disabled={saving}
                  className="px-4 py-2 text-[12px] font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save & Add Details'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Docs Side Panel (list page) ── */}
      {docsPanel && (() => {
        const panelInv = invoices.find(i => i.id === billDocsInvId);
        if (!panelInv) return null;
        const allDocs     = panelInv.docs || [];
        const panelActive = allDocs.filter(d => !d.trashed);
        const panelTrashed= allDocs.filter(d => d.trashed);
        const invDocs  = panelActive.filter(d => !d.doc_type || d.doc_type === 'invoice');
        const ewayDocs = panelActive.filter(d => d.doc_type === 'eway');
        return (
          <div className="fixed inset-0 z-[250] flex justify-end" onClick={() => { setDocsPanel(false); setDocTrashOpen(false); }}>
            <div className="bg-white w-80 h-full shadow-2xl flex flex-col border-l border-slate-200" onClick={e => e.stopPropagation()}>
              <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-[13px] font-bold text-slate-900">Bill Documents</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{panelInv.invoice_no}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {panelTrashed.length > 0 && (
                    <button onClick={() => setDocTrashOpen(o => !o)}
                      className={`flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded border transition-colors
                        ${docTrashOpen ? 'border-orange-200 bg-orange-50 text-orange-500' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      <Trash2 size={11} /> {panelTrashed.length}
                    </button>
                  )}
                  <button onClick={() => { setDocsPanel(false); setDocTrashOpen(false); }} className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"><X size={15} /></button>
                </div>
              </div>

              {docTrashOpen ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Trash ({panelTrashed.length})</p>
                  {panelTrashed.map(d => (
                    <div key={d.id} className="flex items-center gap-2.5 px-3 py-2 rounded border border-slate-100 bg-slate-50">
                      <FileText size={12} className="text-slate-300 shrink-0" />
                      <p className="flex-1 text-[11px] text-slate-400 truncate">{d.name}</p>
                      <button onClick={() => fetch(`${API}/api/orders/${orderId}/vendor-invoices/${panelInv.id}/docs/${d.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ trashed: false }) }).then(() => fetchInvoices())}
                        className="p-1 text-slate-300 hover:text-green-500 rounded" title="Restore"><Undo2 size={11} /></button>
                      <button onClick={() => handlePermanentDeleteDocs(panelInv.id, [d.id])} className="p-1 text-slate-300 hover:text-red-500 rounded"><Trash2 size={11} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {/* Invoice Docs section */}
                  <div className="border-b border-slate-100">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Invoice Docs</span>
                      <input ref={billDocInputRef} type="file" accept="application/pdf,image/*" multiple className="hidden"
                        onChange={async e => { const files = Array.from(e.target.files||[]); e.target.value=''; for (const f of files) await handleUploadBillDoc(f, panelInv.id, 'invoice'); }} />
                      <button onClick={() => billDocInputRef.current?.click()} disabled={uploadingBillDoc}
                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-50">
                        <Plus size={10} /> Add
                      </button>
                    </div>
                    <div className="px-4 py-2 space-y-1.5 min-h-[36px]">
                      {invDocs.length === 0 ? (
                        <p className="text-[11px] text-slate-400 py-1">No invoice docs</p>
                      ) : invDocs.map(d => {
                        const isPdf = /\.pdf(\?|$)/i.test(d.name||'');
                        return (
                          <div key={d.id} className="flex items-center gap-2 py-1">
                            <div className={`w-6 h-6 rounded shrink-0 flex items-center justify-center ${isPdf ? 'bg-red-50 text-red-400' : 'bg-slate-100 text-slate-400'}`}>
                              <FileText size={11} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium text-slate-700 truncate">{d.name}</p>
                              <p className="text-[10px] text-slate-400">{fmtBytes(d.size)}</p>
                            </div>
                            <a href={d.url} target="_blank" rel="noreferrer" className="p-1 text-slate-400 hover:text-slate-700 rounded"><Eye size={11} /></a>
                            <a href={d.url} download={d.name} className="p-1 text-slate-400 hover:text-slate-700 rounded"><Download size={11} /></a>
                            <button onClick={() => handleSoftDeleteDoc(panelInv.id, d.id)} className="p-1 text-slate-400 hover:text-orange-500 rounded"><Trash2 size={11} /></button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* E-way Bill section */}
                  <div>
                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">E-way Bill</span>
                      <input ref={editEwayInputRef} type="file" accept="application/pdf,image/*" multiple className="hidden"
                        onChange={async e => { const files = Array.from(e.target.files||[]); e.target.value=''; for (const f of files) await handleUploadBillDoc(f, panelInv.id, 'eway'); }} />
                      <button onClick={() => editEwayInputRef.current?.click()} disabled={editUploadingEway}
                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-50">
                        <Plus size={10} /> Add
                      </button>
                    </div>
                    <div className="px-4 py-2 space-y-1.5 min-h-[36px]">
                      {ewayDocs.length === 0 ? (
                        <p className="text-[11px] text-slate-400 py-1">No E-way bill docs</p>
                      ) : ewayDocs.map(d => {
                        const isPdf = /\.pdf(\?|$)/i.test(d.name||'');
                        return (
                          <div key={d.id} className="flex items-center gap-2 py-1">
                            <div className={`w-6 h-6 rounded shrink-0 flex items-center justify-center ${isPdf ? 'bg-red-50 text-red-400' : 'bg-slate-100 text-slate-400'}`}>
                              <FileText size={11} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium text-slate-700 truncate">{d.name}</p>
                              <p className="text-[10px] text-slate-400">{fmtBytes(d.size)}</p>
                            </div>
                            <a href={d.url} target="_blank" rel="noreferrer" className="p-1 text-slate-400 hover:text-slate-700 rounded"><Eye size={11} /></a>
                            <a href={d.url} download={d.name} className="p-1 text-slate-400 hover:text-slate-700 rounded"><Download size={11} /></a>
                            <button onClick={() => handleSoftDeleteDoc(panelInv.id, d.id)} className="p-1 text-slate-400 hover:text-orange-500 rounded"><Trash2 size={11} /></button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};





export default ViewOrder;
