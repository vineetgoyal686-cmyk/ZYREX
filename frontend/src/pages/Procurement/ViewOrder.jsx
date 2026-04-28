import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, Search, Building2, User, Landmark, MapPin, Receipt, ShieldQuestion, FileText, CheckCircle2, Phone, FileDown, Download, Eye, X, Upload, Trash2, FileCheck, Lock, ShoppingCart, Package, GitMerge } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

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


const ViewOrder = ({ orderId, onBack, onEdit, currentUser = {} }) => {
  const [data, setData] = useState({ order: null, items: [] });
  const [approvalData, setApprovalData] = useState({ request: null, timeline: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Order Details");
  const thisUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
  const isGlobalAdmin = thisUser.role === "global_admin";

  // Approval Action state
  const [actionModal, setActionModal] = useState({ open: false, type: "" });
  const [actionComment, setActionComment] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Amendment Request state
  const [amendModal, setAmendModal] = useState(false);
  const [amendReason, setAmendReason] = useState("");
  const [amendFile, setAmendFile] = useState(null);
  const [amendLoading, setAmendLoading] = useState(false);
  const [amendHistory, setAmendHistory] = useState([]);
  // Inline approve/reject (when this order IS the pending clone)
  const [pendingAmend, setPendingAmend] = useState(null);     // amendment row for this clone
  const [canManageAmend, setCanManageAmend] = useState(false);
  const [amendActionLoading, setAmendActionLoading] = useState(false);
  // Amendment History tab data
  const [amendChain, setAmendChain] = useState([]);

  // Order-module permissions for the current user (drives which buttons show)
  const myOrderPerms = (thisUser.app_permissions || []).find(p => p.module_key === "order") || {};
  const canRequestAmend = isGlobalAdmin || !!myOrderPerms.can_add;

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const { subtotal, discAmt, netItems, fright, totalGst, grandTotal, frightTax, discountPct } = React.useMemo(() => {
    if (!data || !data.order) return { subtotal: 0, discAmt: 0, netItems: 0, fright: 0, totalGst: 0, grandTotal: 0, frightTax: 0, discountPct: 0 };
    const order = data.order;
    const dbT = order.totals || {};

    const fright = Number(dbT.frightCharges ?? dbT.fright) || 0;
    const frightTax = Number(dbT.frightTax ?? 18);
    const subtotal = Number(dbT.subtotal) || 0;
    const totalGst = Number(dbT.gst) || 0;
    const discAmt = Number(dbT.totalDiscountAmt) || 0;
    const discountPct = Number(dbT.txDiscountPct || dbT.discount_pct) || 0;
    const grandTotal = Number(dbT.grandTotal) || (subtotal - discAmt + fright + totalGst);

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
    if (orderId) {
      fetchOrderDetails();
      fetchAmendHistory();
      // Prime the server-side preview HTML cache so clicking "PDF View" is instant
      fetch(`${API}/api/orders/${orderId}/preview`, { method: "GET" }).catch(() => {});
    }
  }, [orderId]);

  const fetchAmendHistory = async () => {
    const token = localStorage.getItem("bms_token") || "";
    try {
      const r = await fetch(`${API}/api/amendments/requests?order_id=${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await r.json();
      setAmendHistory(d.requests || []);
    } catch (err) {
      console.error("Amend history fetch failed", err);
    }
    // Pull the full version chain (every PO that shares this amendment lineage)
    try {
      const rc = await fetch(`${API}/api/amendments/chain/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const dc = await rc.json();
      setAmendChain(dc.chain || []);
    } catch (err) {
      console.error("Amend chain fetch failed", err);
    }
    // If THIS order is the pending clone, pull the amendment row (reason/attachment)
    try {
      const rp = await fetch(`${API}/api/amendments/by-clone/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const dp = await rp.json();
      setPendingAmend(dp.amendment || null);
    } catch (err) {
      console.error("Pending amend fetch failed", err);
    }
    // Permission check (drives whether approve/reject buttons render enabled)
    try {
      const rcm = await fetch(`${API}/api/amendments/can-manage`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const dcm = await rcm.json();
      setCanManageAmend(!!dcm.canManage);
    } catch { /* default false */ }
  };

  const handleAmendDecision = async (action) => {
    if (!pendingAmend) return;
    if (!confirm(`${action === "Approved" ? "Approve" : "Reject"} this amendment request?`)) return;
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

  const fetchOrderDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/orders/${orderId}`);
      if (!res.ok) throw new Error("Failed to fetch order");
      const json = await res.json();
      setData(json);

      // Fetch workflow request
      const wRes = await fetch(`${API}/api/approvals/requests/${orderId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem("bms_token") || ""}` }
      });
      if (wRes.ok) {
        const wJson = await wRes.json();
        setApprovalData({ request: wJson.request || null, timeline: wJson.timeline || [] });
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleApprovalAction = async (actionType) => {
    if ((actionType === 'Rejected' || actionType === 'Reverted') && !actionComment.trim()) {
      alert("Comment is required for Revert/Reject.");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`${API}/api/approvals/action`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem("bms_token") || ""}` },
        body: JSON.stringify({
          request_id: approvalData.request.id,
          action: actionType,
          comments: actionComment
        })
      });
      const data = await res.json();
      if (data.success) {
        setActionModal({ open: false, type: "" });
        setActionComment("");
        fetchOrderDetails();
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error("Action error", e);
    }
    setActionLoading(false);
  };

  const updateStatus = async (newStatus, initApproval = false) => {
    setActionLoading(true);
    try {
      showToast(`Moving to ${newStatus}...`);

      if (initApproval) {
        const appRes = await fetch(`${API}/api/approvals/requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem("bms_token") || ""}` },
          body: JSON.stringify({
            module_key: "procurement",
            point_key: "po_submission",
            document_id: orderId,
            requestor_id: JSON.parse(localStorage.getItem("bms_user") || "{}").id
          })
        });
        if (!appRes.ok) {
          const errBody = await appRes.json().catch(() => ({}));
          throw new Error(errBody.error || "Approval init failed");
        }
      }

      const res = await fetch(`${API}/api/orders/${orderId}`, {
        method: "PUT",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: JSON.stringify({ mainData: { status: newStatus } }) })
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
        a.download = `PO_${data.order?.order_number || "Order"}.pdf`;
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
    if (!amendFile)          { showToast("Proof attachment is required", "error"); return; }
    setAmendLoading(true);
    try {
      let attachment_url = "";
      const formData = new FormData();
      formData.append("file", amendFile);
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

      const res = await fetch(`${API}/api/amendments/request`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem("bms_token") || ""}` },
        body: JSON.stringify({
          order_id: orderId,
          reason: amendReason,
          attachment_url
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit amendment request");
      
      showToast("Amendment request submitted successfully!");
      setAmendModal(false);
      setAmendReason("");
      setAmendFile(null);
      fetchOrderDetails();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setAmendLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-10 h-64">
        <div className="h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium">Loading Order Details...</p>
      </div>
    );
  }

  const { order, items } = data;
  if (!order) return <div className="p-10 text-center">Order not found.</div>;

  const getVal = (v) => Array.isArray(v) ? v[0] : v;
  const normalizeRichTextHtml = (html) =>
    typeof html === "string"
      ? html.replace(/&nbsp;|\u00A0/g, " ")
      : html;
  const cleanQuillHtml = (html) => {
    if (!html) return "";
    return html
      .replace(/<span class="ql-ui"><\/span>/gi, "")
      .replace(/<span class="ql-ui"\/>/gi, "")
      .replace(/\s*data-list="[^"]*"/gi, "");
  };
  const renderRichHtml = (html) => cleanQuillHtml(normalizeRichTextHtml(html));
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

  const site = isKacha
    ? (getVal(order.sites) || snap.site || {})
    : (snap.site || getVal(order.sites) || {});

  const liveContact = getVal(order.contact_person);
  const contacts = isKacha
    ? (snap.contacts || (liveContact ? [liveContact] : []))
    : (snap.contacts || (liveContact ? [liveContact] : []));
  const totals = order.totals || {};
  const isSupply = order.order_type === "Supply";
  const showModel = (totals.showModel === true || (totals.showModel !== false && groupedItems.some(it => it.model_number)));
  const showBrand = (totals.showBrand === true || (totals.showBrand !== false && groupedItems.some(it => it.make || it.brand)));
  const showDiscount = totals.discount_mode === "line";
  const showRemarks = (totals.showRemarks === true || (totals.showRemarks !== false && groupedItems.some(it => it.remarks)));




  const FALLBACK = "--";
  const RUPEE = "\u20B9";
  const vendorDisplayName = vend.vendorName || vend.vendor_name || "Vendor";
  const vendorSignatoryName = vend.contactPerson || vend.contact_person || vendorDisplayName || FALLBACK;
  const poDate = formatSignatureDate(order.purchase_order_date || order.created_at);
  const TABS = ["Order Details", "Approvals", "Amendment History", "Order Documents", "PDF View", "Goods receipts", "Vendor Invoices", "Payments"];

  return (
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

        .quill-content ul { list-style-type: disc !important; padding-left: 1.5rem !important; margin: 4px 0 !important; }
        .quill-content ol { list-style-type: decimal !important; padding-left: 1.5rem !important; margin: 4px 0 !important; }
        .quill-content li { display: list-item !important; text-align: justify !important; margin-bottom: 0.2rem !important; }
        .quill-content p { margin-bottom: 2px !important; text-align: justify !important; }
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

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 print:hidden">
        <div className="px-6 py-3 flex items-center justify-between">
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
                  <button disabled={actionLoading} onClick={() => updateStatus('Review')}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm text-xs transition-all">
                    Submit to Review
                  </button>
                  {(isGlobalAdmin || order.created_by_id === thisUser.id) && (
                    <button onClick={() => onEdit && onEdit(orderId)}
                      className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg shadow-sm text-xs hover:bg-slate-50 transition-all">
                      Edit Order
                    </button>
                  )}
                </>
              )}

              {order.status === 'Review' && (
                <>
                  <button disabled={actionLoading} onClick={() => updateStatus('Pending Issue', true)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm text-xs transition-all">
                    Submit for Approval
                  </button>
                  {(isGlobalAdmin || order.created_by_id === thisUser.id) && (
                    <button onClick={() => onEdit && onEdit(orderId)}
                      className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg shadow-sm text-xs hover:bg-slate-50 transition-all">
                      Edit Order
                    </button>
                  )}
                </>
              )}

               {order.status === 'Issued' && (() => {
                const tl = approvalData.timeline || [];
                const canRecall = isGlobalAdmin || tl.some(s =>
                  String(s.approver_id) === String(thisUser.id) && s.permissions?.recall_after_issue
                );
                const canCancel = isGlobalAdmin || tl.some(s =>
                  String(s.approver_id) === String(thisUser.id) && s.permissions?.cancel_after_issue
                );
                return (
                  <>
                    {canRequestAmend && (
                      <button onClick={() => setAmendModal(true)}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg shadow-sm text-xs transition-all">
                        Amend Request
                      </button>
                    )}
                    {canRecall && (
                      <button disabled={actionLoading}
                        onClick={() => { setActionComment(""); setActionModal({ open: true, type: 'Recalled' }); setActiveTab('Approvals'); }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60">
                        Recall
                      </button>
                    )}
                    {canCancel && (
                      <button disabled={actionLoading}
                        onClick={() => { setActionComment(""); setActionModal({ open: true, type: 'Cancelled' }); setActiveTab('Approvals'); }}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60">
                        Cancel Order
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="px-14 pb-4">
          {(() => {
            const isPending = order.order_number?.startsWith("PENDING-");
            const displayNo = isPending ? (order.status || "DRAFT").toUpperCase() : order.order_number;
            return (
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                  {order.order_type === 'Supply' ? 'Purchase Order' : 'Work Order'}
                  <span className="text-slate-400 font-medium">#</span>
                  <span className={isPending ? "text-amber-500 italic bg-amber-50 px-3 py-1 rounded-lg border border-amber-100 uppercase" : "text-indigo-600 font-black tracking-tight"}>
                    {displayNo}
                  </span>
                </h1>
                <div className="mt-3 flex items-center gap-4 bg-indigo-50/50 px-5 py-3 rounded-r-xl border-l-4 border-[#1b3e8a] shadow-sm max-w-4xl">
                  <span className="text-[10px] font-black text-[#1b3e8a] uppercase tracking-[0.2em] shrink-0">Subject :</span>
                  <span className="text-[13px] font-bold text-slate-700 uppercase tracking-tight leading-none">{order.subject || order.order_name || 'N/A'}</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Tabs */}
        <div className="px-14 flex gap-6 overflow-x-auto no-scrollbar border-t border-slate-100 pt-3 print:hidden">
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

      {activeTab === "Order Details" && (
        <div className="px-14 py-3 max-w-[1400px] print:hidden">
          {/* ── INLINE AMENDMENT REVIEW BANNER ── */}
          {/* Shown when this order IS the pending clone (status = Amendment Request)
              and a matching pending row exists. Reviewer sees reason + attachment +
              Approve/Reject inline so they don't have to bounce to Inbox. */}
          {order.status === "Amendment Request" && pendingAmend && (
            <div className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
                  <Package size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-sm font-bold text-amber-900">Amendment Pending Review</h3>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded">
                      Requested by {pendingAmend.requestor?.name || "—"}
                    </span>
                  </div>
                  <div className="bg-white border border-amber-100 rounded-lg p-3 mb-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reason</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{pendingAmend.reason}</p>
                  </div>
                  {pendingAmend.attachment_url && (
                    <a href={pendingAmend.attachment_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-amber-200 rounded-lg text-[11px] font-bold text-amber-700 hover:bg-amber-100 transition mb-3">
                      <FileText size={12} /> View Attached Proof
                    </a>
                  )}
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-amber-200">
                    {canManageAmend ? (
                      <>
                        <button
                          disabled={amendActionLoading}
                          onClick={() => handleAmendDecision("Approved")}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm text-xs transition disabled:opacity-50">
                          {amendActionLoading ? "..." : "Approve Amendment"}
                        </button>
                        <button
                          disabled={amendActionLoading}
                          onClick={() => handleAmendDecision("Rejected")}
                          className="px-4 py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold rounded-lg text-xs transition disabled:opacity-50">
                          Reject
                        </button>
                      </>
                    ) : (
                      <p className="text-[11px] text-amber-700 italic">Only users with Manage Amend permission can approve or reject this request.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Info Block */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-lg font-bold text-slate-800">
                {order.order_type === 'Supply' ? 'Purchase Order' : 'Work Order'}
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${order.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                order.status === 'Issued' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                  order.status === 'Review' ? 'bg-sky-50 text-sky-600 border border-sky-100' :
                    order.status === 'Draft' ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                      'bg-amber-50 text-amber-600 border border-amber-100'
                }`}>
                {order.status || 'Pending'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-slate-400 mb-1">Reference No.</p>
                <p className="font-semibold text-slate-800">{order.ref_number || FALLBACK}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">{order.order_type === 'Supply' ? 'Purchase' : 'Work'} Order No.</p>
                <p className={`font-semibold ${order.order_number?.startsWith("PENDING-") ? "text-amber-600 italic" : "text-slate-800"}`}>
                  {order.order_number?.startsWith("PENDING-") ? "DRAFT (Assigned on Issue)" : order.order_number}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Date</p>
                <p className="font-semibold text-slate-800">{new Date(order.date_of_creation || order.created_at).toLocaleDateString("en-IN")}</p>
              </div>
              <div><p className="text-xs text-slate-400 mb-1">Created By</p><p className="font-semibold text-slate-800">{order.made_by || "N/A"}</p></div>
              <div className="col-span-2">
                <p className="text-xs text-slate-400 mb-1">Subject</p>
                <p className="font-semibold text-slate-800">{order.subject || order.order_name || FALLBACK}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-400 mb-1">Requisition by</p>
                <p className="font-semibold text-slate-800">{order.request_by || FALLBACK}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                <User size={16} className="text-slate-400" /> Vendor Details
              </h3>
              <p className="font-bold text-slate-900 mb-3 uppercase">{vend.vendorName || vend.vendor_name || 'N/A'}</p>
              <div className="space-y-3 text-xs">
                <div><p className="text-slate-400 mb-0.5">Address</p><p className="text-slate-700 leading-relaxed">{vend.address || 'N/A'}</p></div>
                <div className="pt-1">
                  <p className="text-slate-400 mb-1.5 font-semibold uppercase tracking-wide text-[10px]">BANK DETAILS</p>
                  <div className="space-y-1.5">
                    <div className="flex gap-2"><span className="text-slate-400 w-32 shrink-0">Beneficiary Name</span><span className="text-slate-900 font-medium">{vend.beneficiaryName || vend.accountName || vend.vendorName || "N/A"}</span></div>
                    <div className="flex gap-2"><span className="text-slate-400 w-32 shrink-0">Bank Name</span><span className="text-slate-700 font-medium">{vend.bankName || "N/A"}</span></div>
                    <div className="flex gap-2"><span className="text-slate-400 w-32 shrink-0">IFSC Code</span><span className="text-slate-700 font-medium font-mono">{vend.ifscCode || vend.ifsc_code || 'N/A'}</span></div>
                    <div className="flex gap-2"><span className="text-slate-400 w-32 shrink-0">Account No</span><span className="text-slate-700 font-medium font-mono">{vend.accountNumber || vend.account_number || 'N/A'}</span></div>
                  </div>
                </div>
                <div className="pt-2">
                  <p className="text-slate-400 mb-2 font-bold uppercase tracking-widest text-[10px] border-b border-slate-50 pb-1">TAX DOCS</p>
                  <div className="space-y-1">
                    <div className="flex gap-3"><span className="text-slate-400 w-32 shrink-0">GST No</span><span className="font-bold font-mono uppercase text-slate-900 text-[11px]">{vend.gstin || 'NA'}</span></div>
                    <div className="flex gap-3"><span className="text-slate-400 w-32 shrink-0">Pan No</span><span className="font-bold font-mono uppercase text-slate-900 text-[11px]">{vend.pan || 'NA'}</span></div>
                    <div className="flex gap-3"><span className="text-slate-400 w-32 shrink-0">Aadhar No</span><span className="font-bold font-mono uppercase text-sky-600 text-[11px] italic">{vend.aadhar || vend.aadhar_no || 'NA'}</span></div>
                    <div className="flex gap-3"><span className="text-slate-400 w-32 shrink-0">MSME No</span><span className="font-bold font-mono uppercase text-sky-600 text-[11px] italic">{vend.msme_number || vend.msme || vend.msme_no || 'NA'}</span></div>
                  </div>
                </div>
                <div className="pt-2">
                  <p className="text-slate-400 mb-2 font-bold uppercase tracking-widest text-[10px] border-b border-slate-50 pb-1">CONTACT DETAILS</p>
                  <div className="space-y-1.5">
                    <div className="flex gap-2"><span className="text-slate-400 w-32 shrink-0">Person Name</span><span className="text-slate-900 font-bold">{vend.contactPerson || vend.contact_person || 'N/A'}</span></div>
                    <div className="flex gap-2"><span className="text-slate-400 w-32 shrink-0">Contact No</span><span className="text-slate-700 font-medium">{vend.mobile || vend.phone || 'N/A'}</span></div>
                    <div className="flex gap-2"><span className="text-slate-400 w-32 shrink-0">Email</span><span className="text-slate-700 font-medium lowercase">{vend.email || 'N/A'}</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                <Building2 size={16} className="text-slate-400" /> Company Details
              </h3>
              <p className="font-bold text-slate-900 mb-3 uppercase">{comp.companyName || comp.company_name || 'N/A'}</p>
              <div className="space-y-3 text-xs">
                <div><p className="text-slate-400 mb-0.5">Site Address</p><p className="text-slate-700 leading-relaxed">{site.siteAddress || site.site_address || 'N/A'}</p></div>
                <div>
                  <p className="text-slate-400 mb-0.5 mt-2">Billing Address</p>
                  <p className="text-slate-700 leading-relaxed">{site.billingAddress || site.billing_address || comp.address || 'N/A'}</p>
                </div>
                <div><p className="text-slate-400 mb-0.5 mt-2">GSTIN</p><p className="text-slate-700 uppercase">{comp.gstin || 'N/A'}</p></div>
                {contacts.length > 0 && (
                  <div className="pt-2">
                    <p className="text-slate-400 mb-2 font-bold uppercase tracking-widest text-[9px] border-b border-slate-50 pb-1 text-[10px]">Contact Persons</p>
                    <div className="space-y-2">
                      {contacts.map((c, i) => (
                        <div key={i} className="flex flex-col gap-0.5">
                          <p className="text-slate-900 font-bold text-[11px]">{c.personName || c.person_name}</p>
                          <div className="flex gap-2 text-[10px] text-slate-500">
                            <span>{c.designation}</span>
                            <span>�</span>
                            <span>{c.contactNumber || c.contact_number}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-xl border border-slate-200 mb-6 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-slate-400" /> Items
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-slate-100/30 border-b border-slate-200 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-4 text-center w-[35px] border-r border-slate-200/50 sticky left-0 bg-white z-10">S.No</th>
                    {isSupply ? (
                      <>
                        <th className="px-5 py-4 text-left w-[240px] border-r border-slate-200/50">Item Name</th>
                        <th className="px-5 py-4 text-left w-[360px] border-r border-slate-200/50">Specification</th>
                      </>
                    ) : (
                      <th className="px-5 py-4 text-left border-r border-slate-200/50" style={{ minWidth: '380px' }}>Item Name & Description</th>
                    )}
                    <th className="px-4 py-4 text-center w-[60px] border-r border-slate-200/50">Unit</th>
                    <th className="px-4 py-4 text-right w-[80px] border-r border-slate-200/50">Qty</th>
                    <th className="px-4 py-4 text-right w-[100px] border-r border-slate-200/50">Rate</th>
                    {showDiscount && (
                      <th className="px-3 py-4 text-right w-[60px] border-r border-slate-200/50 tracking-tighter">Disc%</th>
                    )}
                    <th className="px-4 py-4 text-right w-[60px] border-r border-slate-200/50">Tax%</th>

                    {showRemarks && (
                      <th className="px-4 py-4 text-left w-[120px] border-r border-slate-200/50">Remarks</th>
                    )}

                    <th className="px-6 py-4 text-right font-black text-indigo-900 bg-indigo-50/30">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupedItems.map((it, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                      {!it._isSubRow && (
                        <td rowSpan={it._rowSpan} className="px-4 py-3 text-center text-slate-600 font-bold text-[10px] border-r border-slate-200/40 sticky left-0 bg-white z-10 align-top">
                          {it._groupSrNo < 10 ? `0${it._groupSrNo}` : it._groupSrNo}
                        </td>
                      )}

                      {isSupply ? (
                        /* Supply: separate Item Name (rowspan) + Specification columns */
                        <>
                          {!it._isSubRow && (
                            <td rowSpan={it._rowSpan} className="px-5 py-3 text-slate-800 font-bold uppercase whitespace-normal leading-tight border-r border-slate-200/40 text-[11px] min-w-[200px] align-top">
                              {it._itemName}
                            </td>
                          )}
                          <td className="px-5 py-3 border-r border-slate-100/60 min-w-[280px]">
                            <div className="space-y-1">
                              {(() => {
                                const desc = it.description || it.specification || it.items?.description;
                                if (!desc) return <span className="text-slate-300 font-bold">---</span>;
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
                              {showBrand && (() => { const raw = it.make || ""; if (!raw || raw === "[]" || raw === "null") return null; let b = raw; try { const p = JSON.parse(raw); if (Array.isArray(p)) { if (p.length !== 1) return null; b = p[0]; } } catch {} return b ? <div className="text-[10px]"><span className="font-bold text-slate-800">Brand:</span> <span className="font-semibold text-slate-700">{b}</span></div> : null; })()}
                            </div>
                          </td>
                        </>
                      ) : (
                        /* SITC/ITC: combined Item Name + Description in one column */
                        <td className="px-5 py-3 border-r border-slate-100/60 align-top" style={{ minWidth: '380px' }}>
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
                              if (!desc) return null;
                              let points = [];
                              try { points = typeof desc === 'string' && (desc.startsWith('[') || desc.startsWith('{')) ? JSON.parse(desc) : (Array.isArray(desc) ? desc : [desc]); } catch (e) { points = [desc]; }
                              return points.map((p, i) => (
                                <div key={i} className="order-rich-text text-[11px] text-slate-600 leading-relaxed whitespace-normal" dangerouslySetInnerHTML={{ __html: p }} />
                              ));
                            })()}
                            {showModel && it.model_number && (
                              <div className="text-[10px] text-slate-500 mt-1">Model No.: <span className="font-semibold text-slate-700">{it.model_number}</span></div>
                            )}
                            {showBrand && (() => { const raw = it.make || ""; if (!raw || raw === "[]" || raw === "null") return null; let b = raw; try { const p = JSON.parse(raw); if (Array.isArray(p)) { if (p.length !== 1) return null; b = p[0]; } } catch {} return b ? <div className="text-[10px]"><span className="font-bold text-slate-800">Brand:</span> <span className="font-semibold text-slate-700">{b}</span></div> : null; })()}
                          </div>
                        </td>
                      )}

                      <td className="px-4 py-3 text-center text-slate-400 font-bold uppercase text-[9px] border-r border-slate-100/60">{it.unit || "nos"}</td>
                      <td className="px-4 py-3 text-right text-slate-800 font-bold text-[12px] border-r border-slate-100/60">{Number(it.qty).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-right text-slate-600 font-medium text-[11px] border-r border-slate-100/60">{RUPEE}{Number(it.unit_rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      {showDiscount && (
                        <td className="px-3 py-3 text-right text-rose-500 font-bold text-[11px] border-r border-slate-100/60">{Number(it.discount_pct)}%</td>
                      )}
                      <td className="px-4 py-3 text-right text-slate-400 font-bold text-[11px] border-r border-slate-100/60">{Number(it.tax_pct)}%</td>

                      {showRemarks && (
                        <td className="px-4 py-3 text-left text-slate-500 font-medium text-[10px] border-r border-slate-100/60 whitespace-normal leading-tight">
                          {it.remarks || FALLBACK}
                        </td>
                      )}

                      <td className="px-6 py-3 text-right text-indigo-900 font-bold bg-indigo-50/20 text-[13px]">{RUPEE}{Number(it.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 bg-slate-50 p-6 flex justify-end">
              <div className="w-full max-w-sm space-y-3 text-sm">
                <div className="flex justify-between items-center text-slate-500 font-medium pb-2 border-b border-slate-100 italic">
                  <span className="text-[10px] uppercase tracking-wider">SubTotal:</span>
                  <span className="text-slate-800 font-mono font-bold">{RUPEE} {subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>

                {discAmt > 0 && (
                  <div className="flex justify-between items-center text-rose-500 font-medium">
                    <span className="text-[10px] uppercase tracking-wider">Discount ({discountPct}%):</span>
                    <span className="font-mono font-bold">- {RUPEE} {discAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                {fright > 0 && (
                  <div className="flex justify-between items-center text-slate-500 font-medium pb-1">
                    <span className="text-[10px] uppercase tracking-wider">Freight & Packing ({frightTax}%):</span>
                    <span className="text-slate-800 font-mono font-bold">{RUPEE} {fright.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                {totalGst > 0 && (
                  <div className="flex justify-between items-center text-slate-500 font-medium pb-1">
                    <span className="text-[10px] uppercase tracking-wider">GST (Summary):</span>
                    <span className="text-slate-800 font-mono font-bold">{RUPEE} {totalGst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                <div className="flex justify-between items-center text-slate-900 font-black py-4 border-t border-slate-200 mt-2">
                  <span className="text-[11px] uppercase tracking-[0.3em] opacity-40">Grand Total:</span>
                  <div className="flex flex-col items-end">
                    <span className="text-2xl font-mono tracking-tighter bg-slate-900 text-white px-5 py-2.5 rounded-2xl shadow-2xl shadow-slate-200">{RUPEE} {grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-tight italic">{amountToWords(grandTotal)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Clause Boxes */}
          <div className="space-y-6">
            {/* Order Notes */}
            {(order.notes || snap.notes) && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                  <FileText size={16} className="text-slate-400" /> Order Notes
                </h3>
                <div className="quill-content order-rich-text text-sm text-slate-600 leading-relaxed">
                  <div dangerouslySetInnerHTML={{ __html: renderRichHtml(order.notes || snap.notes) }} />
                </div>
              </div>
            )}
            {/* Terms & Conditions */}
            {(order.terms_conditions?.length > 0 || order.terms?.length > 0 || snap.terms?.length > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                  <ShieldQuestion size={16} className="text-slate-400" /> Terms & Conditions
                </h3>
                <div className="space-y-3">
                  {(() => {
                    const arr = Array.isArray(order.terms_conditions) ? order.terms_conditions : Array.isArray(order.terms) ? order.terms : Array.isArray(snap.terms) ? snap.terms : null;
                    if (arr && arr.length === 1) return <div className="quill-content order-rich-text text-sm text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderRichHtml(arr[0]) }} />;
                    if (arr && arr.length > 1) return arr.map((term, i) => (
                      <div key={i} className="flex gap-3 text-sm text-slate-600">
                        <span className="text-slate-300 font-bold shrink-0">{String(i + 1).padStart(2, '0')}.</span>
                        <div className="quill-content order-rich-text flex-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderRichHtml(term) }} />
                      </div>
                    ));
                    const single = order.terms_conditions || order.terms || snap.terms;
                    if (single && !Array.isArray(single)) return <div className="quill-content order-rich-text text-sm text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderRichHtml(single) }} />;
                    return null;
                  })()}
                </div>
              </div>
            )}

            {/* Payment Terms */}
            {(order.payment_terms?.length > 0 || order.paymentTerms?.length > 0 || snap.payment_terms?.length > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-slate-400" /> Payment Terms
                </h3>
                <div className="space-y-3">
                  {(() => {
                    const arr = Array.isArray(order.payment_terms) ? order.payment_terms : Array.isArray(order.paymentTerms) ? order.paymentTerms : Array.isArray(snap.payment_terms) ? snap.payment_terms : null;
                    if (arr && arr.length === 1) return <div className="quill-content order-rich-text text-sm text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderRichHtml(arr[0]) }} />;
                    if (arr && arr.length > 1) return arr.map((term, i) => (
                      <div key={i} className="flex gap-3 text-sm text-slate-600">
                        <span className="text-slate-300 font-bold shrink-0">{String(i + 1).padStart(2, '0')}.</span>
                        <div className="quill-content order-rich-text flex-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderRichHtml(term) }} />
                      </div>
                    ));
                    const single = order.payment_terms || order.paymentTerms || snap.payment_terms;
                    if (single && !Array.isArray(single)) return <div className="quill-content order-rich-text text-sm text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderRichHtml(single) }} />;
                    return null;
                  })()}
                </div>
              </div>
            )}

            {/* Governing Laws */}
            {(order.governing_laws?.length > 0 || order.governingLaws?.length > 0 || snap.governing_laws?.length > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                  <Landmark size={16} className="text-slate-400" /> Governing Laws
                </h3>
                <div className="space-y-4">
                  {(() => {
                    const arr = order.governing_laws || order.governingLaws || snap.governing_laws;
                    const items = Array.isArray(arr) ? arr : arr ? [arr] : [];
                    if (items.length === 1) return <div className="quill-content order-rich-text text-sm text-slate-600 leading-relaxed bg-slate-50/50 p-4 rounded-lg border border-slate-100" dangerouslySetInnerHTML={{ __html: renderRichHtml(items[0]) }} />;
                    return items.map((law, i) => (
                      <div key={i} className="quill-content order-rich-text text-sm text-slate-600 leading-relaxed bg-slate-50/50 p-4 rounded-lg border border-slate-100"
                        dangerouslySetInnerHTML={{ __html: renderRichHtml(law) }} />
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Annexures */}
            {(order.annexures?.length > 0 || snap.annexures?.length > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                  <FileText size={16} className="text-slate-400" /> Annexures
                </h3>
                <div className="space-y-3">
                  {(() => {
                    const arr = Array.isArray(order.annexures) ? order.annexures : Array.isArray(snap.annexures) ? snap.annexures : [];
                    if (arr.length === 1) return <div className="quill-content order-rich-text text-sm text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderRichHtml(arr[0]) }} />;
                    return arr.map((anx, i) => (
                      <div key={i} className="flex gap-3 text-sm text-slate-600">
                        <span className="text-slate-300 font-bold shrink-0">{String(i + 1).padStart(2, '0')}.</span>
                        <div className="quill-content order-rich-text flex-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderRichHtml(anx) }} />
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

                  <div className="relative h-28 mb-8">
                    {(comp.stampUrl || comp.stamp_url) && (
                      <img src={comp.stampUrl || comp.stamp_url} alt="Stamp"
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-24 w-auto object-contain opacity-70 mix-blend-multiply" />
                    )}
                    {(comp.signUrl || comp.sign_url) && (
                      <img src={comp.signUrl || comp.sign_url} alt="Signature"
                        className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-auto object-contain z-10" />
                    )}

                  </div>

                  <p className="text-[12px] font-bold text-slate-400 italic mb-4 tracking-tight">(Authorized Signature)</p>
                  <div className="space-y-1.5 text-sm text-slate-900">
                    <p><span className="font-bold text-slate-800">Name:</span> {comp.personName || comp.person_name || order.made_by || FALLBACK} ({comp.designation || "Procurement"})</p>
                    <p><span className="font-bold text-slate-800 transition-colors">Date:</span> {poDate}</p>
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end relative">
                  <div className="w-full max-w-sm">
                    <p className="font-black text-slate-900 text-[13px] mb-8 uppercase tracking-widest">{vendorDisplayName}</p>
                    <div className="h-24 mb-8" />
                    <p className="text-[12px] font-bold text-slate-400 italic mb-4 tracking-tight">(Agreed & Accepted by)</p>
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

      {activeTab === "Approvals" && (() => {
        const user = JSON.parse(localStorage.getItem("bms_user") || "{}");
        const isGlobalAdmin = user.role === "global_admin";
        const timeline = approvalData.timeline || [];
        const currentStep = timeline.find(s => s.status === 'In Progress');
        const isCurrentApprover = currentStep && String(currentStep.approver_id) === String(user.id);
        const isPendingIssue = order.status === 'Pending Issue';
        const isIssued = order.status === 'Issued';

        // Pre-issue: actions allowed by current step's permissions
        const stepPerms = currentStep?.permissions || {};
        const preIssueActions = [
          { key: "Approved", label: "Approve", color: "indigo",  permKey: "approve", needsComment: false },
          { key: "Issued",   label: "Issue",   color: "emerald", permKey: "issue",   needsComment: false },
          { key: "Reverted", label: "Revert",  color: "amber",   permKey: "revert",  needsComment: true  },
          { key: "Rejected", label: "Reject",  color: "rose",    permKey: "reject",  needsComment: true  },
        ].filter(a => isGlobalAdmin || stepPerms[a.permKey]);

        // Post-issue: any step where user has recall_after_issue / cancel_after_issue
        const userCanRecall = isGlobalAdmin || timeline.some(s =>
          String(s.approver_id) === String(user.id) && s.permissions?.recall_after_issue
        );
        const userCanCancel = isGlobalAdmin || timeline.some(s =>
          String(s.approver_id) === String(user.id) && s.permissions?.cancel_after_issue
        );
        const postIssueActions = [];
        if (isIssued && userCanRecall) postIssueActions.push({ key: "Recalled",  label: "Recall",  color: "purple", needsComment: true });
        if (isIssued && userCanCancel) postIssueActions.push({ key: "Cancelled", label: "Cancel",  color: "slate",  needsComment: true });

        const canActPreIssue  = isPendingIssue && approvalData.request && (isGlobalAdmin || isCurrentApprover) && preIssueActions.length > 0;
        const canActPostIssue = isIssued && postIssueActions.length > 0;
        const fallbackAdmin   = isPendingIssue && !approvalData.request && isGlobalAdmin;

        const colorClass = (color) => ({
          indigo:  "bg-indigo-600 hover:bg-indigo-700",
          emerald: "bg-emerald-600 hover:bg-emerald-700",
          amber:   "bg-amber-500 hover:bg-amber-600",
          rose:    "bg-rose-600 hover:bg-rose-700",
          purple:  "bg-purple-600 hover:bg-purple-700",
          slate:   "bg-slate-600 hover:bg-slate-700",
        }[color] || "bg-slate-600 hover:bg-slate-700");

        const runApprovalAction = (actionType, needsComment) => {
          if (needsComment) { setActionModal({ open: true, type: actionType }); return; }
          if (approvalData.request) {
            setActionComment("");
            handleApprovalAction(actionType);
          } else if (isGlobalAdmin) {
            const nextStatus = actionType === 'Issued' ? 'Issued' : actionType === 'Reverted' ? 'Reverted' : 'Rejected';
            updateStatus(nextStatus);
          }
        };

        const allActions = canActPreIssue ? preIssueActions : canActPostIssue ? postIssueActions : [];
        const showActionBar = canActPreIssue || canActPostIssue || fallbackAdmin;

        return (
          <div className="px-14 py-3 max-w-[1400px]">
            <h2 className="text-xl font-bold text-slate-800 mb-6">Approval Workflow</h2>

            {showActionBar && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 flex items-center justify-between shadow-sm">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Take Action</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {canActPreIssue && `Stage ${currentStep?.step_number} — ${currentStep?.approver_name}. Allowed: ${preIssueActions.map(a => a.label).join(', ')}.`}
                    {canActPostIssue && `Issued order — post-issue actions available.`}
                    {fallbackAdmin && "No approval workflow found — global admin override."}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(allActions.length > 0 ? allActions : (fallbackAdmin ? [
                    { key: "Issued",   label: "Issue",  color: "emerald", needsComment: false },
                    { key: "Reverted", label: "Revert", color: "amber",   needsComment: true  },
                    { key: "Rejected", label: "Reject", color: "rose",    needsComment: true  },
                  ] : [])).map(a => (
                    <button key={a.key} disabled={actionLoading}
                      onClick={() => runApprovalAction(a.key, a.needsComment)}
                      className={`px-4 py-2 ${colorClass(a.color)} text-white font-bold rounded-lg shadow-sm text-xs transition-all disabled:opacity-60`}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-8">
              {approvalData.timeline.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-400">No approvals found</div>
              ) : (
                approvalData.timeline.map((step, idx) => (
                  <div key={idx} className="relative flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 z-10">{idx + 1}</div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 flex-1">
                      <h3 className="font-bold text-slate-800">{step.approver_name}</h3>
                      <p className="text-xs text-slate-500">{step.approver_designation}</p>
                      <div className="mt-2 text-sm">{step.status}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Amendment Requests History */}
            {amendHistory.length > 0 && (
              <div className="mt-10 pt-10 border-t border-slate-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-8 w-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                    <Package size={18} />
                  </div>
                  <h2 className="text-base font-bold text-slate-800 uppercase tracking-tight">Amendment History</h2>
                </div>
                <div className="space-y-4">
                  {amendHistory.map((a, idx) => (
                    <div key={a.id} className="bg-slate-50 rounded-xl p-5 border border-slate-100 relative">
                      <div className="flex items-center justify-between mb-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${a.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : a.status === 'Rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                          {a.status}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(a.created_at).toLocaleString()}</span>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reason for Amendment</p>
                          <p className="text-sm text-slate-700 font-medium leading-relaxed">{a.reason}</p>
                        </div>
                        {a.attachment_url && (
                          <a href={a.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-indigo-600 hover:bg-slate-50 transition-all">
                            <FileText size={12} /> VIEW ATTACHMENT
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {actionModal.open && (() => {
              const labelMap = {
                Reverted:  { title: "Revert Order",  btn: "Revert",  cls: "bg-amber-500 hover:bg-amber-600" },
                Rejected:  { title: "Reject Order",  btn: "Reject",  cls: "bg-rose-600 hover:bg-rose-700" },
                Recalled:  { title: "Recall Order",  btn: "Recall",  cls: "bg-purple-600 hover:bg-purple-700" },
                Cancelled: { title: "Cancel Order",  btn: "Cancel Order", cls: "bg-slate-700 hover:bg-slate-800" },
              };
              const meta = labelMap[actionModal.type] || labelMap.Rejected;
              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                  <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                    <h3 className="font-bold text-slate-800 text-base mb-1">{meta.title}</h3>
                    <p className="text-xs text-slate-500 mb-4">Please provide a reason. This is required.</p>
                    <textarea value={actionComment} onChange={(e) => setActionComment(e.target.value)}
                      rows={4} placeholder="Enter reason..."
                      className="w-full border border-slate-200 rounded-lg p-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" />
                    <div className="flex items-center justify-end gap-2 mt-4">
                      <button onClick={() => { setActionModal({ open: false, type: '' }); setActionComment(''); }}
                        className="px-4 py-2 text-xs font-bold text-slate-600 rounded-lg hover:bg-slate-100">
                        Close
                      </button>
                      <button disabled={actionLoading}
                        onClick={() => {
                          if (!actionComment.trim()) { alert("Comment is required."); return; }
                          if (approvalData.request) {
                            handleApprovalAction(actionModal.type);
                          } else if (isGlobalAdmin) {
                            const nextStatus = actionModal.type === 'Reverted' ? 'Reverted' : actionModal.type === 'Rejected' ? 'Rejected' : actionModal.type === 'Cancelled' ? 'Cancelled' : 'Draft';
                            updateStatus(nextStatus);
                          }
                          setActionModal({ open: false, type: '' });
                          setActionComment('');
                        }}
                        className={`px-4 py-2 text-xs font-bold text-white rounded-lg shadow-sm disabled:opacity-60 ${meta.cls}`}>
                        Confirm {meta.btn}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {activeTab === "Amendment History" && (
        <div className="px-14 py-3 max-w-[1400px] print:hidden">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-1">
              <GitMerge size={18} className="text-indigo-500" />
              <h2 className="text-base font-bold text-slate-800">Amendment History</h2>
            </div>
            <p className="text-xs text-slate-500 mb-5">All versions of this purchase order — original, every amended copy, and the active one.</p>

            {amendChain.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No version history yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <tr>
                      <th className="px-4 py-3 text-left border-b border-slate-200">Version</th>
                      <th className="px-4 py-3 text-left border-b border-slate-200">Order Number</th>
                      <th className="px-4 py-3 text-left border-b border-slate-200">Status</th>
                      <th className="px-4 py-3 text-left border-b border-slate-200">Vendor</th>
                      <th className="px-4 py-3 text-left border-b border-slate-200">Issued Date</th>
                      <th className="px-4 py-3 text-left border-b border-slate-200">Amend Request Date</th>
                      <th className="px-4 py-3 text-left border-b border-slate-200">Amend Date</th>
                      <th className="px-4 py-3 text-center border-b border-slate-200">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amendChain.map((row, idx) => {
                      const isCurrent = row.id === orderId;
                      const isLatest = idx === amendChain.length - 1;
                      const statusColor =
                        row.status === "Issued"   ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        row.status === "Amended"  ? "bg-slate-100 text-slate-600 border-slate-200" :
                        row.status === "Draft"    ? "bg-blue-50 text-blue-700 border-blue-200" :
                        row.status === "Amendment Request" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                    "bg-slate-50 text-slate-500 border-slate-200";
                      const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN") : <span className="text-slate-300">—</span>;
                      return (
                        <tr key={row.id} className={`${isCurrent ? "bg-indigo-50/40" : ""} border-b border-slate-100 last:border-0`}>
                          <td className="px-4 py-3 font-semibold text-slate-700">v{idx + 1}</td>
                          <td className="px-4 py-3 font-mono text-[12px] text-slate-700">{row.order_number}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${statusColor}`}>
                              {row.status}
                            </span>
                            {isLatest && row.status === "Issued" && (
                              <span className="ml-2 inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-200">Active</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.vendor_name || "—"}</td>
                          <td className="px-4 py-3 text-[12px] text-slate-500 whitespace-nowrap">{fmtDate(row.issued_at)}</td>
                          <td className="px-4 py-3 text-[12px] text-slate-500 whitespace-nowrap">{fmtDate(row.amend_request_at)}</td>
                          <td className="px-4 py-3 text-[12px] text-slate-500 whitespace-nowrap">{fmtDate(row.amended_at)}</td>
                          <td className="px-4 py-3 text-center">
                            {isCurrent ? (
                              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">You are here</span>
                            ) : (
                              <button onClick={() => onBack && onBack(row.id)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                                title="Open this version">
                                <FileText size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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

      {activeTab === "PDF View" && (
        <div className="bg-slate-200">
          <div className="px-4 py-3 flex justify-end print:hidden">
            <button disabled={pdfLoading} onClick={() => handleSafeDownload(true)} className={`flex items-center gap-2 px-6 py-2.5 text-white font-bold rounded-xl shadow-lg transition-all text-xs uppercase ${pdfLoading ? 'bg-slate-400' : 'bg-[#1b3e8a] hover:bg-[#16326d]'}`}>
              <Download size={14} /> {pdfLoading ? "Working..." : "Download PDF"}
            </button>
          </div>
          {data?.order?.id && (
            <div className="flex justify-center px-4 pb-8 bg-slate-300">
              <iframe
                title="Order PDF"
                src={`${API}/api/orders/${data.order.id}/preview?t=${Date.now()}`}
                className="bg-white shadow-xl"
                style={{ border: 0, width: "210mm", maxWidth: "100%", height: "297mm" }}
              />
            </div>
          )}
        </div>
      )}
      {/* Amendment Modal */}
      {amendModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                  <Package size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Amendment Request</h3>
                  <p className="text-[11px] text-amber-700 font-medium italic">Order: {order.order_number}</p>
                </div>
              </div>
              <button onClick={() => setAmendModal(false)} className="p-2 hover:bg-amber-100 rounded-full transition-colors text-amber-600">
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
                  className="flex-[2] px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-amber-200 transition-all flex items-center justify-center gap-2"
                >
                  {amendLoading ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Package size={14} />}
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewOrder;

/* ════════════════════════════════════
   Order Documents Tab
   - Pre-PO (frozen) on top, read-only
   - Post-PO (live) below, upload/delete per category
   ════════════════════════════════════ */

const POST_CATEGORIES = [
  { key: "quotations",        label: "Quotations" },
  { key: "comparative",       label: "Comparative Sheet" },
  { key: "vendor-docs",       label: "Vendor Documents" },
  { key: "other",             label: "Other" },
  { key: "vendor-acceptance", label: "Vendor Acceptance" },
];

const PRE_CATEGORIES = [
  { key: "quotations",   label: "Quotations" },
  { key: "comparative",  label: "Comparative Sheet" },
  { key: "vendor-docs",  label: "Vendor Documents" },
  { key: "other",        label: "Other" },
];

const OrderDocumentsTab = ({ order, orderId, isGlobalAdmin, thisUser, onRefresh, showToast }) => {
  const [preTab,  setPreTab]  = useState("quotations");
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
      { url: vendor.docGstUrl   || vendor.doc_gst_url,           name: "GST Certificate" },
      { url: vendor.docPanUrl   || vendor.doc_pan_url,           name: "PAN Card" },
      { url: vendor.docAadhaarUrl || vendor.doc_aadhaar_url,     name: "Aadhaar" },
      { url: vendor.docCoiUrl   || vendor.doc_coi_url,           name: "Certificate of Incorporation" },
      { url: vendor.docMsmeUrl  || vendor.doc_msme_url,          name: "MSME Certificate" },
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
    if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1024/1024).toFixed(1)} MB`;
  };

  const isIssued = order.status === "Issued";
  const canUpload = isGlobalAdmin || isIssued || ["Pending Issue", "Reverted", "Recalled"].includes(order.status);

  const totalPreDocs = Object.values(preDocsByCategory).reduce((n, a) => n + a.length, 0);
  const totalPostDocs = Object.values(postDocsByCategory).reduce((n, a) => n + a.length, 0);

  return (
    <div className="px-14 py-5 max-w-[1400px] space-y-5">
      {/* ── PRE-PO SECTION (top) ── */}
      <DocSection
        icon={<FileText size={18} />}
        iconBg="bg-purple-50 text-purple-600"
        title="Pre-Order Documents"
        subtitle={`Total - ${totalPreDocs}`}
        categories={PRE_CATEGORIES}
        docsByCategory={preDocsByCategory}
        activeTab={preTab}
        setActiveTab={setPreTab}
        accent="purple"
        readOnly
        isImage={isImage}
        formatBytes={formatBytes}
      />

      {/* ── POST-PO SECTION (below) ── */}
      <DocSection
        icon={<FileCheck size={18} />}
        iconBg="bg-emerald-50 text-emerald-600"
        title="Post-Order Documents"
        subtitle={`Total - ${totalPostDocs}`}
        categories={POST_CATEGORIES}
        docsByCategory={postDocsByCategory}
        activeTab={postTab}
        setActiveTab={setPostTab}
        accent="emerald"
        canUpload={canUpload}
        onUploadClick={handleUploadClick}
        onDelete={handleDelete}
        uploading={uploading}
        isImage={isImage}
        formatBytes={formatBytes}
      />
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
    </div>
  );
};

const DocSection = ({
  icon, iconBg, title, subtitle, categories, docsByCategory,
  activeTab, setActiveTab, accent, readOnly = false,
  canUpload = false, onUploadClick, onDelete, uploading = false,
  isImage, formatBytes,
}) => {
  const accentMap = {
    emerald: { activeBg: "bg-white shadow-sm", activeText: "text-slate-800", border: "border-slate-200" },
    purple:  { activeBg: "bg-white shadow-sm", activeText: "text-slate-800", border: "border-slate-200" },
  };
  const a = accentMap[accent] || accentMap.purple;
  const docs = docsByCategory[activeTab] || [];

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-bold text-slate-800">{title}</h2>
          <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        {!readOnly && canUpload && (
          <button onClick={onUploadClick} disabled={uploading}
            className={`px-3.5 py-1.5 bg-${accent}-600 hover:bg-${accent}-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-60`}
            style={{ background: uploading ? "#94a3b8" : (accent === "emerald" ? "#059669" : "#7c3aed") }}>
            <Upload size={12} /> {uploading ? "Uploading…" : "Upload"}
          </button>
        )}
      </div>

      {/* Tab Pills */}
      <div className="px-4 pb-3">
        <div className="bg-slate-50 rounded-xl p-1 flex items-center gap-1 overflow-x-auto">
          {categories.map(cat => {
            const count = docsByCategory[cat.key]?.length || 0;
            const active = activeTab === cat.key;
            return (
              <button key={cat.key} onClick={() => setActiveTab(cat.key)}
                className={`flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap transition-all
                  ${active ? a.activeBg + ' ' + a.activeText : "text-slate-500 hover:text-slate-700"}`}>
                <FileText size={12} className={active ? "" : "opacity-60"} />
                {cat.label}
                <span className={`text-[10px] ${active ? "text-slate-500" : "text-slate-400"}`}>({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards */}
      <div className="px-5 pb-5">
        {docs.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-[11px] border border-dashed border-slate-200 rounded-xl bg-slate-50/30">
            {!readOnly && canUpload ? (
              <>
                <button onClick={onUploadClick} disabled={uploading}
                  className="mx-auto px-4 py-2 border border-emerald-300 text-emerald-700 text-[11px] font-bold rounded-lg hover:bg-emerald-50 transition-all flex items-center gap-2 disabled:opacity-60">
                  <Upload size={12} /> {uploading ? "Uploading…" : "Upload Document"}
                </button>
                <p className="mt-2">No {categories.find(c => c.key === activeTab)?.label.toLowerCase()} uploaded yet</p>
              </>
            ) : (
              <p>No {categories.find(c => c.key === activeTab)?.label.toLowerCase()} captured</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {docs.map(d => (
              <DocCard key={d.id} doc={d}
                readOnly={readOnly}
                onDelete={!readOnly && onDelete ? () => onDelete(d.id) : null}
                isImage={isImage}
                formatBytes={formatBytes}
                accent={accent}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const DocCard = ({ doc, readOnly = false, onDelete, isImage, formatBytes, accent = "purple" }) => {
  const img = isImage(doc.name, doc.url);
  const isPdf = /\.pdf(\?|$)/i.test(doc.name) || /\.pdf(\?|$)/i.test(doc.url || "");
  return (
    <div className="group bg-slate-50 border border-slate-200 rounded-xl overflow-hidden hover:shadow-md hover:border-slate-300 transition-all">
      <a href={doc.url} target="_blank" rel="noreferrer" className="relative block aspect-[4/3] bg-slate-100 overflow-hidden">
        {img ? (
          <img src={doc.url} alt={doc.name} className="w-full h-full object-cover" />
        ) : isPdf ? (
          <>
            <iframe
              src={`${doc.url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&page=1`}
              title={doc.name}
              scrolling="no"
              className="pointer-events-none absolute top-0 left-0"
              style={{ width: "calc(100% + 24px)", height: "calc(100% + 24px)" }}
              loading="lazy"
            />
            <div className="absolute inset-0 bg-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <FileText size={36} className="text-rose-400" />
          </div>
        )}
      </a>
      <div className="px-2.5 py-2 flex items-center justify-between gap-1 bg-white border-t border-slate-100">
        <span className={`text-[10px] font-semibold truncate ${accent === "emerald" ? "text-emerald-700" : "text-purple-700"}`} title={doc.name}>
          {doc.name}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <a href={doc.url} download={doc.name} className="p-1 text-slate-400 hover:text-slate-700 transition-all" title="Download">
            <Download size={12} />
          </a>
          {!readOnly && onDelete && (
            <button onClick={onDelete} className="p-1 text-slate-400 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100" title="Delete">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

