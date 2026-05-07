const express = require("express");
const router = express.Router();
const supabaseClient = require("../helpers/supabaseHelper");
const { broadcast } = require("../sse");

const extractUserId = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload.sub || null;
  } catch { return null; }
};

const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });
  const userId = extractUserId(token);
  if (!userId) return res.status(401).json({ error: "Invalid token" });
  req.userId = userId;
  next();
};

// POST /api/action-requests — submit recall or cancel request
router.post("/", requireAuth, async (req, res) => {
  const admin = supabaseClient;
  const { order_id, request_type, reason } = req.body;
  const userId = req.userId;

  if (!order_id || !["recall", "cancel"].includes(request_type)) {
    return res.status(400).json({ error: "order_id and valid request_type required" });
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

    const { data: user } = await admin.from("users").select("name").eq("id", userId).single();
    const now = new Date().toISOString();
    const snap = order.snapshot || {};
    const actLog = Array.isArray(snap.activity_log) ? [...snap.activity_log] : [];
    actLog.push({
      action: request_type === "recall" ? "Recall Requested" : "Cancel Requested",
      action_by: user?.name || "",
      action_at: now,
      ...(reason ? { comments: reason } : {}),
    });
    await admin.schema("procurement").from("purchase_orders")
      .update({ snapshot: { ...snap, activity_log: actLog } }).eq("id", order_id);

    const { data, error } = await admin.from("order_action_requests").insert({
      order_id,
      request_type,
      requestor_id: userId,
      reason: reason || "",
      status: "Pending",
    }).select().single();

    if (error) throw error;
    broadcast({ type: "action_request_updated" });
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

    const { data: steps } = await admin.from("approval_steps")
      .select("permissions").eq("approver_id", req.userId);
    const canManage = (steps || []).some(s =>
      !!(s.permissions?.recall_after_issue) || !!(s.permissions?.cancel_after_issue)
    );
    res.json({ canManage });
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
        .select("id, order_number, subject, status").in("id", orderIds),
      admin.from("users").select("id, name").in("id", userIds),
    ]);

    const orderMap = Object.fromEntries((ordersRes.data || []).map(o => [o.id, o]));
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
    const { data } = await admin.from("order_action_requests")
      .select("*").eq("order_id", req.params.orderId).eq("status", "Pending").maybeSingle();
    if (!data) return res.json({ request: null });

    const { data: requestor } = await admin.from("users").select("id, name").eq("id", data.requestor_id).maybeSingle();
    res.json({ request: { ...data, requestor: requestor || null } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/action-requests/direct-amend — power user directly moves Issued → Draft
router.post("/direct-amend", requireAuth, async (req, res) => {
  const admin = supabaseClient;
  const { order_id, reason, attachment_url } = req.body;
  const userId = req.userId;

  if (!order_id) return res.status(400).json({ error: "order_id required" });

  try {
    const { data: user } = await admin.from("users").select("name, role").eq("id", userId).single();
    const isGlobalAdmin = user?.role === "global_admin";

    let hasRecallPerm = isGlobalAdmin;
    if (!hasRecallPerm) {
      const { data: approvalReq } = await admin.from("approval_requests")
        .select("workflow:approval_workflows(steps:approval_steps(*))")
        .eq("document_id", order_id)
        .eq("module_key", "order")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const steps = approvalReq?.workflow?.steps || [];
      hasRecallPerm = steps.some(s =>
        String(s.approver_id) === String(userId) && !!(s.permissions || {}).recall_after_issue
      );
    }

    if (!hasRecallPerm) {
      return res.status(403).json({ error: "You do not have permission to directly amend this order" });
    }

    const { data: order } = await admin.schema("procurement").from("purchase_orders")
      .select("snapshot, status").eq("id", order_id).single();
    if (!order || order.status !== "Issued") {
      return res.status(400).json({ error: "Order must be Issued to amend" });
    }

    const now = new Date().toISOString();
    const snap = order.snapshot || {};
    const actLog = Array.isArray(snap.activity_log) ? [...snap.activity_log] : [];
    actLog.push({
      action: "Recalled",
      action_by: user?.name || "",
      action_at: now,
      ...(reason ? { comments: reason } : {}),
    });

    await admin.schema("procurement").from("purchase_orders").update({
      status: "Draft",
      made_by: user?.name || "",
      created_by_id: userId,
      snapshot: { ...snap, activity_log: actLog },
    }).eq("id", order_id);

    await admin.from("order_amendments").insert({
      order_id,
      requestor_id: userId,
      reason: reason || "",
      attachment_url: attachment_url || "",
      status: "Approved",
      actioned_by_id: userId,
      actioned_at: now,
      approved_by_id: userId,
      approved_at: now,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("POST /action-requests/direct-amend failed:", err.message);
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
      const { data: cancelUser } = await admin.from("users").select("name").eq("id", userId).single();
      const { data: cancelOrder } = await admin.schema("procurement").from("purchase_orders")
        .select("snapshot").eq("id", request.order_id).single();
      const cancelSnap = cancelOrder?.snapshot || {};
      const cancelLog = Array.isArray(cancelSnap.activity_log) ? [...cancelSnap.activity_log] : [];
      cancelLog.push({
        action: request.request_type === "recall" ? "Recall Request Cancelled" : "Cancel Request Cancelled",
        action_by: cancelUser?.name || "",
        action_at: now,
      });
      await admin.schema("procurement").from("purchase_orders")
        .update({ snapshot: { ...cancelSnap, activity_log: cancelLog } }).eq("id", request.order_id);
      await admin.from("order_action_requests").update({
        status: "Cancelled", actioned_by_id: userId, actioned_at: now,
      }).eq("id", request.id);
      broadcast({ type: "action_request_updated" });
      return res.json({ success: true });
    }

    // Approve / Reject — needs global_admin or recall_after_issue / cancel_after_issue permission
    const { data: user } = await admin.from("users").select("role, name").eq("id", userId).single();
    const isGlobalAdmin = user?.role === "global_admin";

    if (!isGlobalAdmin) {
      // Check if user has recall_after_issue or cancel_after_issue in the order's approval steps
      const permKey = request.request_type === "recall" ? "recall_after_issue" : "cancel_after_issue";
      const { data: approvalReq } = await admin.from("approval_requests")
        .select("workflow:approval_workflows(steps:approval_steps(*))")
        .eq("document_id", request.order_id)
        .eq("module_key", "order")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const steps = approvalReq?.workflow?.steps || [];
      const hasPerm = steps.some(s =>
        String(s.approver_id) === String(userId) && !!(s.permissions || {})[permKey]
      );
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
        .update({ snapshot: { ...rejSnap, activity_log: rejLog } }).eq("id", request.order_id);
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
    }

    broadcast({ type: "action_request_updated" });
    res.json({ success: true });
  } catch (err) {
    console.error("POST /action-requests/:id/action failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
