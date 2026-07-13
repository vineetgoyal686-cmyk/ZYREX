const express = require("express");
const router = express.Router();
const supabaseClient = require("../helpers/supabaseHelper");
const { broadcast } = require("../sse");
const { requirePerm, hasPerm } = require("../helpers/permHelper");
const { notifyOrderAction, getHandlerUsers, getUserRecipient, resolveOrderForEmail } = require("../utils/orderNotifications");

const extractUserId = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload.sub || null;
  } catch { return null; }
};

// Check if userId is listed in request_handlers for given module+action
const isHandlerUser = async (admin, userId, moduleKey, actionKey) => {
  const { data } = await admin.from("request_handlers")
    .select("users").eq("module_key", moduleKey).eq("action_key", actionKey);
  return (data || []).flatMap(r => r.users || []).some(u => String(u.id) === String(userId));
};

const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });
  const userId = extractUserId(token);
  if (!userId) return res.status(401).json({ error: "Invalid token" });
  req.userId = userId;
  next();
};

const historyHasAction = (order = {}, expected = "") => {
  const want = String(expected || "").toLowerCase();
  const snapshot = order.snapshot || {};
  const matches = (entry) => String(entry?.action || entry?._history_action || "").toLowerCase() === want;
  return matches(order) ||
    (Array.isArray(snapshot.activity_log) && snapshot.activity_log.some(matches)) ||
    (Array.isArray(snapshot.status_history) && snapshot.status_history.some(matches));
};


// POST /api/action-requests — submit recall or cancel request
router.post("/", requireAuth, async (req, res) => {
  const admin = supabaseClient;
  const { order_id, request_type, reason } = req.body;
  const userId = req.userId;

  if (!order_id || !["recall", "cancel"].includes(request_type)) {
    return res.status(400).json({ error: "order_id and valid request_type required" });
  }

  const permKey = request_type === "recall" ? "can_request_recall" : "can_request_cancel";
  const allowed = await hasPerm(userId, "order", permKey);
  if (!allowed) {
    return res.status(403).json({ error: `Permission denied: you don't have '${permKey}' access on 'order'` });
  }

  try {
    const { data: order } = await admin.schema("procurement").from("purchase_orders")
      .select("id, status, snapshot").eq("id", order_id).single();
    if (!order || order.status !== "Issued") {
      return res.status(400).json({ error: "Order must be Issued to submit a request" });
    }

    const { data: existing } = await admin.from("order_action_requests")
      .select("id").eq("order_id", order_id).eq("status", "Pending").maybeSingle();
    if (existing) {
      return res.status(409).json({ error: "A pending request already exists for this order" });
    }

    const { data: user } = await admin.from("users").select("name, designation, email").eq("id", userId).single();
    const now = new Date().toISOString();
    const snap = order.snapshot || {};
    const actLog = Array.isArray(snap.activity_log) ? [...snap.activity_log] : [];
    actLog.push({
      action: request_type === "recall" ? "Recall Requested" : "Cancel Requested",
      action_by: user?.name || "",
      action_at: now,
      ...(reason ? { comments: reason } : {}),
    });
    const requestedStatus = request_type === "recall" ? "Recall Requested" : "Cancel Requested";
    await admin.schema("procurement").from("purchase_orders")
      .update({ status: requestedStatus, snapshot: { ...snap, activity_log: actLog } }).eq("id", order_id);

    const { data, error } = await admin.from("order_action_requests").insert({
      order_id,
      request_type,
      requestor_id: userId,
      reason: reason || "",
      status: "Pending",
    }).select().single();

    if (error) throw error;
    broadcast({ type: "action_request_updated" });

    try {
      const [toUsers, emailOrder] = await Promise.all([
        getHandlerUsers(request_type),
        resolveOrderForEmail(order_id),
      ]);
      if (emailOrder) {
        await notifyOrderAction({
          eventKey: `${request_type}_request`,
          toUsers,
          order: emailOrder,
          actor: { name: user?.name, designation: user?.designation, email: user?.email },
          reason: reason || "",
        });
      }
    } catch (mailErr) { console.error("Email notification step failed:", mailErr); }

    res.json({ success: true, request: data });
  } catch (err) {
    console.error("POST /action-requests failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/action-requests/can-manage — can current user approve/reject recall/cancel requests
router.get("/can-manage", requireAuth, async (req, res) => {
  const admin = supabaseClient;
  try {
    const { data: user } = await admin.from("users").select("role").eq("id", req.userId).single();
    if (user?.role === "global_admin") return res.json({ canManage: true });

    const [isRecall, isCancel] = await Promise.all([
      isHandlerUser(admin, req.userId, "order", "recall"),
      isHandlerUser(admin, req.userId, "order", "cancel"),
    ]);
    res.json({ canManage: isRecall || isCancel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/action-requests/pending — inbox for B user
router.get("/pending", requireAuth, async (req, res) => {
  const admin = supabaseClient;
  try {
    const { data: requests } = await admin.from("order_action_requests")
      .select("*").eq("status", "Pending").order("created_at", { ascending: false });

    if (!requests?.length) return res.json({ requests: [] });

    const orderIds = [...new Set(requests.map(r => r.order_id))];
    const userIds  = [...new Set(requests.map(r => r.requestor_id).filter(Boolean))];

    const [ordersRes, usersRes] = await Promise.all([
      admin.schema("procurement").from("purchase_orders")
        .select("id, order_number, subject, status, totals, made_by, snapshot, site_id, company_id, vendor_id").in("id", orderIds),
      admin.from("users").select("id, name").in("id", userIds),
    ]);

    const orders = ordersRes.data || [];

    // Hydrate site_code / vendor_name the same way amendments.js does — snapshot
    // first (frozen at issue time), falling back to the live master tables.
    const siteIds   = [...new Set(orders.map(o => o.site_id).filter(Boolean))];
    const vendorIds = [...new Set(orders.map(o => o.vendor_id).filter(Boolean))];
    const [sitesRes, vendorsRes] = await Promise.all([
      siteIds.length   ? admin.from("projects").select("id, project_code").in("id", siteIds)                          : Promise.resolve({ data: [] }),
      vendorIds.length ? admin.schema("procurement").from("vendors").select("id, vendor_name").in("id", vendorIds)   : Promise.resolve({ data: [] }),
    ]);
    const siteMap   = Object.fromEntries((sitesRes.data   || []).map(s => [s.id, s]));
    const vendorMap = Object.fromEntries((vendorsRes.data || []).map(v => [v.id, v]));

    const enrichOrder = (o) => {
      if (!o) return null;
      const snap = o.snapshot || {};
      return {
        ...o,
        site_code:   snap.site?.siteCode     || siteMap[o.site_id]?.project_code || null,
        vendor_name: snap.vendor?.vendorName || vendorMap[o.vendor_id]?.vendor_name || null,
      };
    };

    const orderMap = Object.fromEntries(orders.map(o => [o.id, enrichOrder(o)]));
    const userMap  = Object.fromEntries((usersRes.data  || []).map(u => [u.id, u]));

    res.json({
      requests: requests.map(r => ({
        ...r,
        order:     orderMap[r.order_id]     || null,
        requestor: userMap[r.requestor_id]  || null,
      })),
    });
  } catch (err) {
    console.error("GET /action-requests/pending failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/action-requests/for-order/:orderId — pending request for a specific order
router.get("/for-order/:orderId", requireAuth, async (req, res) => {
  const admin = supabaseClient;
  try {
    const { data: rows } = await admin.from("order_action_requests")
      .select("*").eq("order_id", req.params.orderId).eq("status", "Pending")
      .order("created_at", { ascending: false }).limit(1);
    const data = rows?.[0] || null;
    if (!data) return res.json({ request: null });

    const { data: requestor } = await admin.from("users").select("id, name").eq("id", data.requestor_id).maybeSingle();
    res.json({ request: { ...data, requestor: requestor || null } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate next amendment number — e.g. "PO/2026-27/3" → "PO/2026-27/3A", "3A" → "3B"
const nextAmendNumber = async (admin, currentNumber) => {
  const stem = currentNumber.replace(/[A-Z]$/, "");
  const { data: siblings } = await admin.schema("procurement")
    .from("purchase_orders").select("order_number").like("order_number", `${stem}%`);
  const used = new Set();
  (siblings || []).forEach(o => {
    const tail = o.order_number.slice(stem.length);
    if (/^[A-Z]$/.test(tail)) used.add(tail);
  });
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    if (!used.has(letter)) return stem + letter;
  }
  throw new Error("All amendment slots A–Z are exhausted for this order");
};

// POST /api/action-requests/direct-amend — power user creates amendment clone directly (Issued → Amended + new Draft clone)
router.post("/direct-amend", requireAuth, async (req, res) => {
  const admin = supabaseClient;
  const { order_id, reason, attachment_url } = req.body;
  const userId = req.userId;

  if (!order_id) return res.status(400).json({ error: "order_id required" });

  try {
    const { data: user } = await admin.from("users").select("name, role, designation, email").eq("id", userId).single();
    const isGlobalAdmin = user?.role === "global_admin";

    const hasRecallPerm = isGlobalAdmin || await isHandlerUser(admin, userId, "order", "recall");

    if (!hasRecallPerm) {
      return res.status(403).json({ error: "You do not have permission to directly amend this order" });
    }

    const { data: order } = await admin.schema("procurement").from("purchase_orders")
      .select("*").eq("id", order_id).single();
    if (!order || order.status !== "Issued") {
      return res.status(400).json({ error: "Order must be Issued to amend" });
    }

    const { data: items } = await admin.schema("procurement")
      .from("purchase_order_items").select("*").eq("order_id", order_id);

    const now = new Date().toISOString();
    const newNumber = await nextAmendNumber(admin, order.order_number);

    // Create amendment Draft clone (same as regular amendment approval flow)
    const { id: _id, created_at: _ca, updated_at: _ua, ...clonedData } = order;
    const cloneSnapshot = { ...(clonedData.snapshot || {}), activity_log: [] };
    const { data: clone, error: cloneErr } = await admin.schema("procurement")
      .from("purchase_orders").insert({
        ...clonedData,
        snapshot:        cloneSnapshot,
        order_number:    newNumber,
        status:          "Draft",
        made_by:         user?.name || userId,
        created_by_id:   userId,
        amended_from_id: order_id,
      }).select().single();
    if (cloneErr) throw cloneErr;

    // Clone items into the new Draft
    const newItems = (items || []).map(({ id: _iId, order_id: _oId, created_at: _c, ...it }) => ({
      ...it, order_id: clone.id,
    }));
    if (newItems.length) {
      await admin.schema("procurement").from("purchase_order_items").insert(newItems);
    }

    // Mark original as Amended and record in activity log
    const snap = order.snapshot || {};
    const actLog = Array.isArray(snap.activity_log) ? [...snap.activity_log] : [];
    actLog.push({
      action: "Amended",
      action_by: user?.name || "",
      action_at: now,
      comments: `Amendment draft ${newNumber} created${reason ? `: ${reason}` : ""}`,
      ...(attachment_url ? { attachment_url } : {}),
    });
    await admin.schema("procurement").from("purchase_orders")
      .update({ status: "Amended", snapshot: { ...snap, activity_log: actLog } }).eq("id", order_id);

    await admin.from("order_amendments").insert({
      order_id,
      original_order_id: order_id,
      new_order_id:      clone.id,
      requestor_id:      userId,
      reason:            reason || "",
      attachment_url:    attachment_url || "",
      status:            "Approved",
      actioned_by_id:    userId,
      actioned_at:       now,
      approved_by_id:    userId,
      approved_at:       now,
    });

    // This endpoint collapses request+approve into a single step (a handler
    // amending an order directly, no one ever "requested" anything) — so it
    // gets its own distinct event/wording rather than reusing "Request
    // Approved", and notifies the order's creator directly (not the actor).
    // Global admins acting directly don't trigger this — their direct actions
    // are treated as routine admin work, not something needing a notification.
    if (!isGlobalAdmin) {
      try {
        const emailOrder = await resolveOrderForEmail(order_id);
        const toUsers = emailOrder?.created_by_email
          ? [{ email: emailOrder.created_by_email, name: emailOrder.created_by_name }]
          : [];
        if (emailOrder) {
          await notifyOrderAction({ eventKey: "amend_direct", toUsers, order: emailOrder, actor: { name: user?.name, designation: user?.designation, email: user?.email }, reason });
        }
      } catch (mailErr) { console.error("Direct-amend email notification failed:", mailErr); }
    }

    res.json({ success: true, clone_id: clone.id });
  } catch (err) {
    console.error("POST /action-requests/direct-amend failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/action-requests/withdraw-direct-action — undo a direct recall/cancel by a power user
router.post("/withdraw-direct-action", requireAuth, async (req, res) => {
  const admin = supabaseClient;
  const { order_id, action_type, comment } = req.body;
  const userId = req.userId;

  if (!order_id || !["recall", "cancel"].includes(action_type)) {
    return res.status(400).json({ error: "order_id and valid action_type required" });
  }

  try {
    const { data: user } = await admin.from("users").select("name, role, designation, email").eq("id", userId).single();
    const { data: order, error: orderErr } = await admin.schema("procurement")
      .from("purchase_orders")
      .select("id, status, snapshot, created_by_id")
      .eq("id", order_id)
      .single();
    if (orderErr) throw orderErr;

    const expectedStatus = action_type === "recall" ? "Draft" : "Cancelled";
    const expectedAction = action_type === "recall" ? "Recalled" : "Cancelled";
    if (!order || order.status !== expectedStatus || !historyHasAction(order, expectedAction)) {
      return res.status(400).json({ error: `This order does not have an active ${action_type} action to withdraw.` });
    }

    const isGlobalAdmin = user?.role === "global_admin";
    const isCreator = String(order.created_by_id || "") === String(userId);
    const actionKey = action_type === "recall" ? "recall" : "cancel";
    const hasPerm = isGlobalAdmin || isCreator || await isHandlerUser(admin, userId, "order", actionKey);
    if (!hasPerm) {
      return res.status(403).json({ error: "You do not have permission to withdraw this action." });
    }

    const now = new Date().toISOString();
    const snap = order.snapshot || {};
    const actLog = Array.isArray(snap.activity_log) ? [...snap.activity_log] : [];
    actLog.push({
      action: action_type === "recall" ? "Recall Cancelled" : "Cancel Order Withdrawn",
      action_by: user?.name || "",
      action_at: now,
      ...(comment ? { comments: comment } : {}),
    });

    const { error: updateErr } = await admin.schema("procurement")
      .from("purchase_orders")
      .update({ status: "Issued", snapshot: { ...snap, activity_log: actLog } })
      .eq("id", order_id);
    if (updateErr) throw updateErr;

    broadcast({ type: "action_request_updated" });
    res.json({ success: true });
  } catch (err) {
    console.error("POST /action-requests/withdraw-direct-action failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/action-requests/:id/action — approve / reject / cancel
router.post("/:id/action", requireAuth, async (req, res) => {
  const admin = supabaseClient;
  const { action, comment } = req.body; // Approved | Rejected | Cancelled
  const userId = req.userId;

  if (!["Approved", "Rejected", "Cancelled"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  try {
    const { data: request } = await admin.from("order_action_requests")
      .select("*").eq("id", req.params.id).single();
    if (!request || request.status !== "Pending") {
      return res.status(400).json({ error: "Request not found or already actioned" });
    }

    const now = new Date().toISOString();

    // Only the requestor can cancel their own pending request
    if (action === "Cancelled") {
      if (String(request.requestor_id) !== String(userId)) {
        return res.status(403).json({ error: "Only the requestor can cancel this request" });
      }
      const { data: cancelUser } = await admin.from("users").select("name, designation, email").eq("id", userId).single();
      const { data: cancelOrder } = await admin.schema("procurement").from("purchase_orders")
        .select("snapshot").eq("id", request.order_id).single();
      const cancelSnap = cancelOrder?.snapshot || {};
      const cancelLog = Array.isArray(cancelSnap.activity_log) ? [...cancelSnap.activity_log] : [];
      cancelLog.push({
        action: request.request_type === "recall" ? "Recall Request Cancelled" : "Cancel Request Cancelled",
        action_by: cancelUser?.name || "",
        action_at: now,
        ...(comment ? { comments: comment } : {}),
      });
      await admin.schema("procurement").from("purchase_orders")
        .update({ status: "Issued", snapshot: { ...cancelSnap, activity_log: cancelLog } }).eq("id", request.order_id);
      await admin.from("order_action_requests").update({
        status: "Cancelled", actioned_by_id: userId, actioned_at: now,
      }).eq("id", request.id);
      broadcast({ type: "action_request_updated" });

      try {
        const [toUsers, emailOrder] = await Promise.all([
          getHandlerUsers(request.request_type),
          resolveOrderForEmail(request.order_id),
        ]);
        if (emailOrder) {
          await notifyOrderAction({
            eventKey: `${request.request_type}_withdraw`,
            toUsers,
            order: emailOrder,
            actor: { name: cancelUser?.name, designation: cancelUser?.designation, email: cancelUser?.email },
          });
        }
      } catch (mailErr) { console.error("Withdraw email notification failed:", mailErr); }

      return res.json({ success: true });
    }

    // Approve / Reject — needs global_admin or be a request handler for that action type
    const { data: user } = await admin.from("users").select("role, name, designation, email").eq("id", userId).single();
    const isGlobalAdmin = user?.role === "global_admin";

    if (!isGlobalAdmin) {
      const actionKey = request.request_type === "recall" ? "recall" : "cancel";
      const hasPerm = await isHandlerUser(admin, userId, "order", actionKey);
      if (!hasPerm) {
        return res.status(403).json({ error: "You do not have permission to action this request" });
      }
    }

    await admin.from("order_action_requests").update({
      status: action,
      actioned_by_id: userId,
      actioned_at: now,
      reject_reason: comment || "",
    }).eq("id", request.id);

    if (action === "Rejected") {
      const { data: rejOrder } = await admin.schema("procurement").from("purchase_orders")
        .select("snapshot").eq("id", request.order_id).single();
      const rejSnap = rejOrder?.snapshot || {};
      const rejLog = Array.isArray(rejSnap.activity_log) ? [...rejSnap.activity_log] : [];
      rejLog.push({
        action: request.request_type === "recall" ? "Recall Rejected" : "Cancel Rejected",
        action_by: user?.name || "",
        action_at: now,
        ...(comment ? { comments: comment } : {}),
      });
      await admin.schema("procurement").from("purchase_orders")
        .update({ status: "Issued", snapshot: { ...rejSnap, activity_log: rejLog } }).eq("id", request.order_id);

      try {
        const [toUsers, emailOrder] = await Promise.all([
          getUserRecipient(request.requestor_id),
          resolveOrderForEmail(request.order_id),
        ]);
        if (emailOrder) {
          await notifyOrderAction({ eventKey: `${request.request_type}_rejected`, toUsers, order: emailOrder, actor: { name: user?.name, designation: user?.designation, email: user?.email }, reason: comment });
        }
      } catch (mailErr) { console.error("Request-rejected email notification failed:", mailErr); }
    }

    if (action === "Approved") {
      const newStatus = request.request_type === "recall" ? "Draft" : "Cancelled";

      const { data: order } = await admin.schema("procurement").from("purchase_orders")
        .select("snapshot").eq("id", request.order_id).single();

      const snap   = order?.snapshot || {};
      const actLog = Array.isArray(snap.activity_log) ? [...snap.activity_log] : [];
      actLog.push({
        action:    newStatus,
        action_by: user.name || "",
        action_at: now,
        ...(comment ? { comments: comment } : {}),
      });

      await admin.schema("procurement").from("purchase_orders").update({
        status:   newStatus,
        snapshot: { ...snap, activity_log: actLog },
      }).eq("id", request.order_id);

      try {
        const [toUsers, emailOrder] = await Promise.all([
          getUserRecipient(request.requestor_id),
          resolveOrderForEmail(request.order_id),
        ]);
        if (emailOrder) {
          await notifyOrderAction({ eventKey: `${request.request_type}_approved`, toUsers, order: emailOrder, actor: { name: user?.name, designation: user?.designation, email: user?.email }, reason: comment });
        }
      } catch (mailErr) { console.error("Request-approved email notification failed:", mailErr); }
    }

    broadcast({ type: "action_request_updated" });
    res.json({ success: true });
  } catch (err) {
    console.error("POST /action-requests/:id/action failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
