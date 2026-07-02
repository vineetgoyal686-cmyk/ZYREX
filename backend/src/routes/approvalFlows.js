const express = require("express");
const router  = express.Router();
const { broadcast } = require("../sse");
const admin = require("../helpers/supabaseHelper");
const getAdminClient = () => admin;
const { requireAuth } = require("../middleware/auth");
const cache = require("../helpers/cacheHelper");
const ORDERS_CACHE_KEY = "orders_list";

const requireAdminOrAbove = (req, res, next) => {
  if (!["global_admin", "super_admin", "admin"].includes(req.user.role))
    return res.status(403).json({ error: "Access denied" });
  next();
};

async function addOrderActivityLog(admin, orderId, action, userName, comments = "") {
  try {
    const { data: order } = await admin.schema("procurement").from("purchase_orders")
      .select("snapshot").eq("id", orderId).single();
    const snap = order?.snapshot || {};
    const log = Array.isArray(snap.activity_log) ? [...snap.activity_log] : [];
    log.push({ action, action_by: userName, action_at: new Date().toISOString(), comments });
    await admin.schema("procurement").from("purchase_orders")
      .update({ snapshot: { ...snap, activity_log: log } }).eq("id", orderId);
  } catch (err) {
    console.error("addOrderActivityLog failed:", err.message);
  }
}

function checkConditions(flow, document) {
  const conditions = flow.conditions || [];
  if (!conditions.length) return true;
  const results = conditions.map(c => {
    const val = getDocField(document, c.field);
    return evalCondition(val, c.operator, c.value);
  });
  return flow.conditions_match === "any" ? results.some(Boolean) : results.every(Boolean);
}

function getDocField(doc, field) {
  if (!doc) return null;
  // Intake document (has intake_items)
  if (doc.intake_items !== undefined) {
    const maxRaisedQty = Math.max(0, ...(doc.intake_items || []).map(i => parseFloat(i.raised_qty) || 0));
    const map = {
      priority:    doc.priority,
      intake_type: doc.intake_type,
      category:    doc.category,
      site:        doc.site_id,
      raised_qty:  maxRaisedQty,
    };
    return map[field] ?? null;
  }
  // Order document
  const map = {
    price:          doc.grand_total ?? doc.totals?.grandTotal ?? doc.totals?.grand_total,
    category:       doc.category_id ?? doc.snapshot?.categoryId ?? doc.snapshot?.category?.id,
    billing_entity: doc.company_id,
    site:           doc.site_id,
  };
  return map[field] ?? null;
}

function evalCondition(val, op, condVal) {
  const n = parseFloat(val), c = parseFloat(condVal);
  switch (op) {
    case "is_equal_to":        return String(val) === String(condVal);
    case "greater_than":       return n > c;
    case "less_than":          return n < c;
    case "greater_than_equal": return n >= c;
    case "less_than_equal":    return n <= c;
    default: return true;
  }
}

function isUserAuthorizedForLevel(level, userId) {
  return (level.designations || []).some(d =>
    (d.users || []).some(u => String(u.id) === String(userId))
  );
}

/* ── Pending for current user ── */

// GET /api/approval-flows/pending-for-me
router.get("/pending-for-me", requireAuth, async (req, res) => {
  const admin  = getAdminClient();
  const userId = req.user.id;
  const isGlobalAdmin = req.user.role === "global_admin";

  const { data: requests, error } = await admin
    .from("approval_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Everyone sees all pending requests; can_act tells if this user can approve/reject
  const mine = (requests || []).map(r => {
    const flow   = r.flow_snapshot;
    const levels = flow?.levels || [];
    const level  = levels[r.current_level - 1];
    const can_act = isGlobalAdmin || (level ? isUserAuthorizedForLevel(level, userId) : false);
    return { ...r, can_act };
  });

  // Fetch document details for each request
  const orderIds = mine.filter(r => r.module === "order").map(r => r.document_id);
  let orderMap = {};
  if (orderIds.length > 0) {
    const { data: orders, error: ordErr } = await admin.schema("procurement").from("purchase_orders")
      .select("id, order_number, status, totals, snapshot, site_id, vendors(id, vendor_name), made_by")
      .in("id", orderIds);
    if (ordErr) console.error("[pending-for-me] orders fetch error:", ordErr);

    // Resolve made_by UUIDs to names
    const madeByIds = [...new Set((orders || []).map(o => o.made_by).filter(id => id && id.includes('-')))];
    let userNameMap = {};
    if (madeByIds.length > 0) {
      const { data: users } = await admin.from("users").select("id, name").in("id", madeByIds);
      userNameMap = Object.fromEntries((users || []).map(u => [u.id, u.name]));
    }

    orderMap = Object.fromEntries((orders || []).map(o => [o.id, {
      ...o,
      companies: { company_code: o.snapshot?.company?.companyCode || o.snapshot?.company?.company_code || "CO" },
      made_by: userNameMap[o.made_by] || o.made_by || null,
      subject: o.snapshot?.subject || null,
    }]));
  }

  const result = mine.map(r => ({
    ...r,
    document: r.module === "order" ? (orderMap[r.document_id] || null) : null,
  }));

  res.json({ requests: result });
});

/* ── CRUD ── */

// GET /api/approval-flows?module=order
router.get("/", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  let query = admin.from("approval_flows").select("*").order("priority");
  if (req.query.module) query = query.eq("module", req.query.module);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ flows: data || [] });
});

// GET /api/approval-flows/:id
router.get("/:id", requireAuth, async (req, res) => {
  if (["submit", "action", "request"].includes(req.params.id)) return next();
  const admin = getAdminClient();
  const { data, error } = await admin.from("approval_flows").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ error: "Flow not found" });
  res.json({ flow: data });
});

// POST /api/approval-flows
router.post("/", requireAuth, requireAdminOrAbove, async (req, res) => {
  const admin = getAdminClient();
  const { name, module, status, self_approve_below, escalation_days, description, conditions_match, conditions, config_options, levels } = req.body;
  const { data: existing } = await admin.from("approval_flows").select("priority").eq("module", module).order("priority", { ascending: false }).limit(1);
  const priority = (existing?.[0]?.priority || 0) + 1;
  const { data, error } = await admin.from("approval_flows").insert({
    name, module, status: status || "active", priority,
    self_approve_below: self_approve_below || null,
    escalation_days: escalation_days || 1,
    description: description || "",
    conditions_match: conditions_match || "all",
    conditions: conditions || [],
    config_options: config_options || {},
    levels: levels || [],
    updated_at: new Date().toISOString(),
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ flow: data });
});

// PUT /api/approval-flows/reorder — update priorities
router.put("/reorder", requireAuth, requireAdminOrAbove, async (req, res) => {
  const admin = getAdminClient();
  const { items } = req.body;
  await Promise.all((items || []).map(({ id, priority }) =>
    admin.from("approval_flows").update({ priority, updated_at: new Date().toISOString() }).eq("id", id)
  ));
  res.json({ success: true });
});

// PUT /api/approval-flows/:id
router.put("/:id", requireAuth, requireAdminOrAbove, async (req, res) => {
  const admin = getAdminClient();
  const { name, status, self_approve_below, escalation_days, description, conditions_match, conditions, config_options, levels } = req.body;
  const { data, error } = await admin.from("approval_flows").update({
    name, status,
    self_approve_below: self_approve_below || null,
    escalation_days: escalation_days || 1,
    description: description || "",
    conditions_match: conditions_match || "all",
    conditions: conditions || [],
    config_options: config_options || {},
    levels: levels || [],
    updated_at: new Date().toISOString(),
  }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ flow: data });
});

// DELETE /api/approval-flows/:id
router.delete("/:id", requireAuth, requireAdminOrAbove, async (req, res) => {
  const admin = getAdminClient();
  const { error } = await admin.from("approval_flows").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* ── Approval Request Status ── */

// GET /api/approval-flows/request/:document_id
router.get("/request/:document_id", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data: request } = await admin.from("approval_requests")
    .select("*").eq("document_id", req.params.document_id)
    .in("status", ["pending", "approved", "rejected", "reverted"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!request) return res.json({ request: null, logs: [] });
  const { data: logs } = await admin.from("approval_logs")
    .select("*").eq("request_id", request.id).order("created_at");
  res.json({ request, logs: logs || [] });
});

/* ── Submit for Approval ── */

// POST /api/approval-flows/submit
router.post("/submit", requireAuth, async (req, res) => {
  try {
    const admin = getAdminClient();
    const { module, document_id } = req.body;
    const userId = req.user.id;
    const userName = req.user.name;

    // Get all active flows for this module ordered by priority
    const { data: flows } = await admin.from("approval_flows")
      .select("*").eq("module", module).eq("status", "active").order("priority");

    if (!flows?.length) {
      console.log(`[ApprovalFlow] skip — no active flows for module="${module}"`);
      return res.json({ skip: true, skip_reason: "no_flow", message: "No active approval flow configured" });
    }

    // Get document for condition checking
    let document = null;
    if (module === "order") {
      const { data } = await admin.schema("procurement").from("purchase_orders")
        .select("*").eq("id", document_id).single();
      document = data;
    } else if (module === "intake") {
      const { data } = await admin.schema("store").from("intakes")
        .select("*, intake_items(*)").eq("id", document_id).single();
      document = data;
    }

    // Find first matching flow
    const matchedFlow = flows.find(f => checkConditions(f, document));
    if (!matchedFlow) {
      console.log(`[ApprovalFlow] skip — ${flows.length} flow(s) found but none matched conditions. doc_id=${document_id}`);
      flows.forEach(f => {
        const conds = f.conditions || [];
        const results = conds.map(c => ({ field: c.field, val: getDocField(document, c.field), op: c.operator, condVal: c.value }));
        console.log(`  Flow "${f.name}" conditions:`, JSON.stringify(results));
      });
      return res.json({ skip: true, skip_reason: "no_match", message: "No matching flow found for this order's conditions" });
    }

    // Self-approve check (order only — intake has no price threshold)
    if (module === "order") {
      const grandTotal = parseFloat(document?.grand_total ?? document?.totals?.grand_total ?? 0);
      if (matchedFlow.self_approve_below && grandTotal < parseFloat(matchedFlow.self_approve_below)) {
        await admin.schema("procurement").from("purchase_orders")
          .update({ status: "Pending Issue", updated_at: new Date().toISOString() }).eq("id", document_id);
        await addOrderActivityLog(admin, document_id, "Auto-Approved (Below Threshold)", userName);
        cache.bust(ORDERS_CACHE_KEY);
        broadcast({ type: "order_updated", status: "Pending Issue" });
        return res.json({ skip: true, auto_approved: true });
      }
    }

    // Cancel any old pending request
    await admin.from("approval_requests")
      .update({ status: "withdrawn", updated_at: new Date().toISOString() })
      .eq("document_id", document_id).eq("status", "pending");

    // Create new approval request
    const { data: request, error } = await admin.from("approval_requests").insert({
      flow_id: matchedFlow.id, module, document_id,
      status: "pending", current_level: 1,
      flow_snapshot: matchedFlow,
      requested_by: userId,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });

    // Update document status
    if (module === "order") {
      await admin.schema("procurement").from("purchase_orders")
        .update({ status: "Pending Approval", updated_at: new Date().toISOString() }).eq("id", document_id);
      await addOrderActivityLog(admin, document_id, "Submitted for Approval", userName);
      cache.bust(ORDERS_CACHE_KEY);
      broadcast({ type: "order_updated", status: "Pending Approval" });
    } else if (module === "intake") {
      // intake stays "submitted" — that IS the pending approval state
      broadcast({ type: "intake_updated", document_id, status: "submitted" });
    }

    res.json({ success: true, request });
  } catch (err) {
    console.error("[approval-flows/submit]", err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Take Action (Approve / Reject / Revert) ── */

// POST /api/approval-flows/action
router.post("/action", requireAuth, async (req, res) => {
  try {
    const admin = getAdminClient();
    const { request_id, action, comments } = req.body;
    const userId = req.user.id;
    const userName = req.user.name;
    const isGlobalAdmin = req.user.role === "global_admin";

    const { data: request } = await admin.from("approval_requests")
      .select("*").eq("id", request_id).single();
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "pending") return res.status(400).json({ error: "Request is no longer pending" });

    const flow = request.flow_snapshot;
    const levels = flow?.levels || [];
    const currentLevel = levels[request.current_level - 1];
    if (!currentLevel) return res.status(400).json({ error: "Level not found" });

    if (!isGlobalAdmin && !isUserAuthorizedForLevel(currentLevel, userId))
      return res.status(403).json({ error: "You are not authorized to act on this level" });

    // Log the action
    await admin.from("approval_logs").insert({
      request_id,
      level_number: request.current_level,
      designation_name: (currentLevel.designations || []).map(d => d.designation_name).join(", "),
      action, action_by: userId, action_by_name: userName,
      comments: comments || "",
    });

    let newStatus = request.status;
    let newLevel  = request.current_level;
    let docStatus = "Pending Approval";
    let logAction = "";

    if (action === "approved") {
      if (request.current_level >= levels.length) {
        newStatus = "approved";
        docStatus = "Pending Issue";
        logAction = "Approval Completed — Moved to Pending Issue";
      } else {
        newLevel  = request.current_level + 1;
        logAction = `Approved at Level ${request.current_level}`;
      }
    } else if (action === "rejected") {
      newStatus = "rejected";
      docStatus = "Rejected";
      logAction = "Rejected";
    } else if (action === "reverted") {
      newStatus = "reverted";
      docStatus = "Review";
      logAction = "Reverted to Review";
    }

    await admin.from("approval_requests").update({
      status: newStatus, current_level: newLevel,
      completed_at: newStatus !== "pending" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", request_id);

    if (request.module === "order") {
      await admin.schema("procurement").from("purchase_orders")
        .update({ status: docStatus, updated_at: new Date().toISOString() }).eq("id", request.document_id);
      await addOrderActivityLog(admin, request.document_id, logAction, userName, comments);
      cache.bust(ORDERS_CACHE_KEY);
      broadcast({ type: "order_updated", status: docStatus });
    } else if (request.module === "intake") {
      const intakeStatusMap = {
        "Pending Issue": "approved",   // final approval → approved
        "Pending Approval": "submitted", // mid-level → still submitted
        "Rejected": "rejected",
        "Review": "draft",              // reverted → back to draft
      };
      const intakeStatus = intakeStatusMap[docStatus] || "submitted";
      const patch = { status: intakeStatus, updated_at: new Date().toISOString() };
      if (intakeStatus === "approved") { patch.approved_by = userName; patch.approved_at = new Date().toISOString(); }
      if (intakeStatus === "rejected") { patch.reject_reason = comments || ""; }
      await admin.schema("store").from("intakes").update(patch).eq("id", request.document_id);
      broadcast({ type: "intake_updated", document_id: request.document_id, status: intakeStatus });
    }

    res.json({ success: true, newStatus, docStatus });
  } catch (err) {
    console.error("[approval-flows/action]", err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Withdraw ── */

// POST /api/approval-flows/withdraw/:document_id
router.post("/withdraw/:document_id", requireAuth, async (req, res) => {
  try {
    const admin = getAdminClient();
    const { document_id } = req.params;
    const userName = req.user.name;

    const { data: request } = await admin.from("approval_requests")
      .select("*").eq("document_id", document_id).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!request) return res.status(404).json({ error: "No pending approval request found" });

    // Only requester or global_admin can withdraw
    if (req.user.role !== "global_admin" && String(request.requested_by) !== String(req.user.id))
      return res.status(403).json({ error: "Only the requester can withdraw" });

    await admin.from("approval_requests")
      .update({ status: "withdrawn", updated_at: new Date().toISOString() }).eq("id", request.id);

    if (request.module === "order") {
      await admin.schema("procurement").from("purchase_orders")
        .update({ status: "Review", updated_at: new Date().toISOString() }).eq("id", document_id);
      await addOrderActivityLog(admin, document_id, "Approval Withdrawn — Returned to Review", userName);
      cache.bust(ORDERS_CACHE_KEY);
      broadcast({ type: "order_updated", status: "Review" });
    } else if (request.module === "intake") {
      await admin.schema("store").from("intakes")
        .update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", document_id);
      broadcast({ type: "intake_updated", document_id, status: "draft" });
    }

    res.json({ success: true, status: "Review" });
  } catch (err) {
    console.error("[approval-flows/withdraw]", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
