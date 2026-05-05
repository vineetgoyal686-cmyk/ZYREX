// backend/src/routes/approvals.js
const express = require("express");
const router  = express.Router();
const { createClient } = require("@supabase/supabase-js");

const getAdminClient = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const appendOrderHistorySnapshot = async (admin, { documentId, action, comments, actionBy }) => {
  if (!["Reverted", "Recalled", "Cancelled", "Rejected"].includes(action)) return;

  const [orderRes, itemRes] = await Promise.all([
    admin.schema("procurement")
      .from("purchase_orders")
      .select("*, sites(*), companies(*), vendors(*), contact_person:contacts(*)")
      .eq("id", documentId)
      .single(),
    admin.schema("procurement")
      .from("purchase_order_items")
      .select("*, items(*)")
      .eq("order_id", documentId),
  ]);

  if (orderRes.error) throw orderRes.error;
  if (itemRes.error) throw itemRes.error;

  const order = orderRes.data;
  const existingSnapshot = order.snapshot || {};
  const { status_history: _oldHistory, ...frozenSnapshot } = existingSnapshot;
  const history = Array.isArray(existingSnapshot.status_history) ? existingSnapshot.status_history : [];
  const actionAt = new Date().toISOString();

  const frozenOrder = {
    ...order,
    status: action,
    snapshot: frozenSnapshot,
  };

  history.push({
    history_id: `history:${documentId}:${Date.now()}`,
    action,
    comments: comments || "",
    action_by: actionBy,
    action_at: actionAt,
    order: frozenOrder,
    items: itemRes.data || [],
  });

  await admin.schema("procurement")
    .from("purchase_orders")
    .update({ snapshot: { ...existingSnapshot, status_history: history } })
    .eq("id", documentId);
};

// Basic auth middleware
const extractUserId = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload.sub || null;
  } catch { return null; }
};

const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });
  const userId = extractUserId(token);
  if (!userId)  return res.status(401).json({ error: "Invalid token" });
  req.userId = userId;
  next();
};

// GET all modules
router.get("/modules", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data: modules, error } = await admin.from("approval_modules").select("*").order("module_name");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ modules });
});

// GET trigger points by module
router.get("/points/:module_key?", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { module_key } = req.params;
  let query = admin.from("approval_points").select("*").order("point_label");
  if (module_key && module_key !== 'undefined') query = query.eq("module_key", module_key);
  
  const { data: points, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ points });
});

// GET all workflows globally mapped
router.get("/workflows", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data: workflows, error } = await admin
    .from("approval_workflows")
    .select(`
      id, module_key, point_key, module_name, flow_name, is_active, created_at,
      steps:approval_steps (id, step_number, approver_id, approver_name, approver_designation, permissions)
    `)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  
  // order steps correctly
  const formatted = workflows.map(w => {
    if (w.steps) w.steps.sort((a, b) => a.step_number - b.step_number);
    return w;
  });

  res.json({ workflows: formatted });
});

// GET workflow by point_key
router.get("/workflows/:point_key", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("approval_workflows")
    .select(`
      id, module_key, point_key, module_name, flow_name, is_active,
      steps:approval_steps (id, step_number, approver_id, approver_name, approver_designation, permissions)
    `)
    .eq("point_key", req.params.point_key)
    .single();

  if (error) return res.json({ workflow: null }); // Don't throw for 404, just return null
  
  if (data && data.steps) data.steps.sort((a, b) => a.step_number - b.step_number);
  res.json({ workflow: data });
});

// POST / PUT workflow
router.post("/workflows", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { module_key, point_key, module_name, flow_name, is_active, steps } = req.body;

  // 1. Upsert workflow
  let { data: workflow, error: wfError } = await admin
    .from("approval_workflows")
    .select()
    .eq("point_key", point_key)
    .single();

  if (!workflow) {
    const result = await admin.from("approval_workflows").insert({
      module_key, point_key, module_name, flow_name, is_active
    }).select().single();
    if (result.error) return res.status(500).json({ error: result.error.message });
    workflow = result.data;
  } else {
    const result = await admin.from("approval_workflows").update({
      module_name, flow_name, is_active, module_key
    }).eq("id", workflow.id).select().single();
    if (result.error) return res.status(500).json({ error: result.error.message });
    workflow = result.data;
  }

  // 2. Clear old steps
  await admin.from("approval_steps").delete().eq("workflow_id", workflow.id);

  // 3. Insert new steps
  if (steps && steps.length > 0) {
    const stepRows = steps.map((s, index) => ({
      workflow_id: workflow.id,
      step_number: index + 1,
      approver_id: s.approver_id,
      approver_name: s.approver_name,
      approver_designation: s.approver_designation || 'Approver',
      permissions: s.permissions || { approve: true, issue: true, reject: true, revert: true, recall: true }
    }));
    await admin.from("approval_steps").insert(stepRows);
  }

  res.json({ success: true, workflow_id: workflow.id });
});

// GET active requests by document (e.g. order_id)
router.get("/requests/:document_id", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { document_id } = req.params;

  // Get request details
  const { data: request, error: reqErr } = await admin
    .from("approval_requests")
    .select(`
       *,
       workflow:approval_workflows (
         id, module_key, module_name, flow_name,
         steps:approval_steps (step_number, approver_id, approver_name, approver_designation, permissions)
       ),
       logs:approval_logs (
         step_number, action_by, action, comments, created_at
       )
    `)
    .eq("document_id", document_id)
    .single();

  if (reqErr || !request) return res.json({ request: null });

  // Resolve user names for logs
  const actionByids = [...new Set((request.logs || []).map(l => l.action_by).filter(Boolean))];
  let userMap = {};
  if (actionByids.length > 0) {
    const { data: users } = await admin.from("users").select("id, name").in("id", actionByids);
    userMap = Object.fromEntries((users || []).map(u => [u.id, u.name]));
  }
  (request.logs || []).forEach(l => {
    l.action_by_name = userMap[l.action_by] || 'Unknown';
  });

  // Prepare UI friendly timelines
  const timeline = [];
  const steps = request.workflow?.steps || [];
  steps.sort((a,b) => a.step_number - b.step_number);

  for (const step of steps) {
    const stepLogs = request.logs?.filter(l => l.step_number === step.step_number) || [];
    stepLogs.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    const lastAction = stepLogs.length > 0 ? stepLogs[stepLogs.length - 1] : null;

    let uiStatus = 'Pending';
    if (request.current_step > step.step_number) uiStatus = 'Approved';
    if (request.current_step === step.step_number) {
       uiStatus = request.status === 'Pending' || request.status === 'Approved' ? 'In Progress' : request.status;
    }

    timeline.push({
      step_number: step.step_number,
      approver_name: step.approver_name,
      approver_designation: step.approver_designation,
      approver_id: step.approver_id,
      status: uiStatus,
      permissions: step.permissions || {},
      action: lastAction ? lastAction.action : null,
      comments: lastAction ? lastAction.comments : null,
      acted_at: lastAction ? lastAction.created_at : null
    });
  }

  res.json({ request, timeline });
});

// Init/Submit Approval Request
router.post("/requests", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { module_key, point_key, document_id, requestor_id } = req.body;

  // 1. Get workflow by point_key, or fallback to module_key (first active workflow for the module)
  let workflow = null;
  if (point_key) {
    const { data } = await admin.from("approval_workflows").select().eq("point_key", point_key).single();
    workflow = data;
  }
  if (!workflow && module_key) {
    const { data } = await admin
      .from("approval_workflows")
      .select()
      .eq("module_key", module_key)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    workflow = data;
  }
  if (!workflow || !workflow.is_active) {
    // Diagnostic: list what workflows do exist, to help debug module_key mismatches
    const { data: allWfs } = await admin
      .from("approval_workflows")
      .select("module_key, point_key, flow_name, is_active");
    const existing = (allWfs || []).map(w => `${w.module_key}/${w.point_key} (active=${w.is_active})`).join(" | ");
    console.warn(`[approvals/requests] No workflow matched module_key="${module_key}" point_key="${point_key}". Existing: ${existing || "none"}`);
    return res.status(400).json({
      error: `No active approval workflow configured for module "${module_key}". Existing: ${existing || "none"}. Please configure/activate one in Approval Engine → Config.`
    });
  }

  // 2. Upsert Request
  let { data: request } = await admin.from("approval_requests").select().match({ module_key, document_id }).single();
  if (request) {
    const upd = await admin.from("approval_requests").update({
      current_step: 1, 
      status: 'Pending',
      requestor_id
    }).eq("id", request.id).select().single();
    request = upd.data;
  } else {
    const ins = await admin.from("approval_requests").insert({
      module_key, document_id, workflow_id: workflow.id, current_step: 1, status: 'Pending', requestor_id
    }).select().single();
    request = ins.data;
  }

  res.json({ success: true, request });
});

// Action (Approve, Issue, Reject, Revert, Recall after Issue, Cancel after Issue)
const ACTION_PERM_MAP = {
  Approved:  'approve',
  Issued:    'issue',
  Rejected:  'reject',
  Reverted:  'revert',
  Recalled:  'recall_after_issue',
  Cancelled: 'cancel_after_issue',
};

router.post("/action", requireAuth, async (req, res) => {
  try {
  const admin = getAdminClient();
  const { request_id, action, comments } = req.body;

  if (!ACTION_PERM_MAP[action]) {
    return res.status(400).json({ error: `Invalid action "${action}"` });
  }

  const { data: request } = await admin.from("approval_requests")
    .select(`*, workflow:approval_workflows(steps:approval_steps(*))`)
    .eq("id", request_id).single();
  if (!request) return res.status(404).json({ error: "Request not found" });

  const userId = req.userId;

  // Resolve global admin
  const { data: userRow } = await admin.from("users").select("role").eq("id", userId).maybeSingle();
  const isGlobalAdmin = userRow?.role === "global_admin";

  const stepsSorted = (request.workflow?.steps || []).slice().sort((a, b) => a.step_number - b.step_number);
  const totalSteps = stepsSorted.length;
  const permKey = ACTION_PERM_MAP[action];
  const isPostIssue = action === "Recalled" || action === "Cancelled";

  // ── Permission check ──
  if (!isGlobalAdmin) {
    if (isPostIssue) {
      // Any step where this user has the post-issue power
      const allowed = stepsSorted.some(s =>
        String(s.approver_id) === String(userId) && !!(s.permissions || {})[permKey]
      );
      if (!allowed) {
        return res.status(403).json({ error: `You are not authorized to ${action.toLowerCase()} this issued order.` });
      }
    } else {
      // Must be the current step's approver and have the permission
      const currentStep = stepsSorted.find(s => s.step_number === request.current_step);
      if (!currentStep) return res.status(400).json({ error: "Workflow current step not found" });
      const isApprover = String(currentStep.approver_id) === String(userId);
      const hasPerm = !!(currentStep.permissions || {})[permKey];
      if (!isApprover) return res.status(403).json({ error: "It is not your turn to act on this request." });
      if (!hasPerm)    return res.status(403).json({ error: `Action "${action}" is not allowed at your stage.` });
    }
  }

  // ── Log action ──
  await admin.from("approval_logs").insert({
    request_id,
    step_number: request.current_step,
    action_by: userId,
    action,
    comments
  });

  // ── Compute state transition ──
  let nextStep = request.current_step;
  let nextStatus = action; // default: Rejected, Reverted, Recalled, Cancelled
  let isFinal = false;

  if (action === 'Approved') {
    if (nextStep < totalSteps) {
      nextStep += 1;
      nextStatus = 'Pending';
    } else {
      // Last stage approved — treat as final issue
      nextStatus = 'Approved';
      isFinal = true;
    }
  } else if (action === 'Issued') {
    nextStatus = 'Approved';
    isFinal = true;
  } else if (action === 'Recalled') {
    nextStep = 1;
    nextStatus = 'Recalled';
  } else if (action === 'Cancelled') {
    nextStatus = 'Cancelled';
  }

  await admin.from("approval_requests").update({
    current_step: nextStep,
    status: nextStatus
  }).eq("id", request.id);

  // Sync back to procurement order status if module_key matches
  if (request.module_key === "procurement" || request.module_key === "create_order") {
     const docUpd = {};
     if (action === 'Reverted' || action === 'Recalled' || action === 'Cancelled' || action === 'Rejected') {
        try {
          await appendOrderHistorySnapshot(admin, {
            documentId: request.document_id,
            action,
            comments,
            actionBy: userId,
          });
        } catch (snapErr) {
          console.error("[approvals/action] snapshot failed (non-fatal):", snapErr.message);
        }
     }
     if (action === 'Reverted' || action === 'Recalled') docUpd.status = 'Draft';
     if (action === 'Rejected') docUpd.status = 'Rejected';
     if (action === 'Cancelled') docUpd.status = 'Cancelled';
     
     if (isFinal) {
        docUpd.status = 'Issued';

        // ── FINAL NUMBERING LOGIC ──
        try {
          // 1. Get Order details
          const { data: order } = await admin
            .schema("procurement")
            .from("purchase_orders")
            .select("*, sites(*), companies(*)")
            .eq("id", request.document_id)
            .single();

          // Stamp issuedAt + issuing user info into totals JSON
          const { data: issuerProfile } = await admin.from("users")
            .select("name, designation, profile_permissions")
            .eq("id", userId)
            .single();
          const issuedBy = {
            id: userId,
            name: issuerProfile?.name || "",
            designation: issuerProfile?.designation || "",
            signatureFile: issuerProfile?.profile_permissions?.ui?.signature || null,
          };
          docUpd.totals = { ...(order?.totals || {}), issuedAt: new Date().toISOString(), issuedBy };
          
          const isDraftNum = (n) => /^(PO|WO)-\d+$/.test(n || '') || (n || '').startsWith('PENDING-');
          if (order && isDraftNum(order.order_number)) {
            // 2. Compute current financial year in 2024-25 format
            const now = new Date();
            const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
            const fy = `${fyStart}-${String(fyStart + 1).slice(-2)}`;
            const kindForSerial = order.order_type === "Supply" ? "Supply" : "SITC";

            // 3. Fetch Serialization Settings for this site + FY + order_kind
            let { data: serialObj } = await admin
              .schema("procurement")
              .from("serialization_settings")
              .select("*")
              .eq("site_id", order.site_id)
              .eq("financial_year", fy)
              .eq("order_kind", kindForSerial)
              .maybeSingle();

            // 4. If no record for this FY, create one starting at 0
            if (!serialObj) {
              const { data: created, error: insErr } = await admin
                .schema("procurement")
                .from("serialization_settings")
                .insert({ site_id: order.site_id, financial_year: fy, current_number: 0, order_kind: kindForSerial })
                .select()
                .single();
              if (insErr) console.error("Serial insert failed:", insErr.message);
              serialObj = created;
            }

            if (serialObj) {
              const nextSerial = (serialObj.current_number || 0) + 1;
              const typeCode  = order.order_type === 'Supply' ? 'PO' : 'WO';
              const compCode  = order.companies?.company_code || 'CO';
              const siteCode  = order.sites?.site_code || 'SITE';
              const finalNo   = `${compCode}/${siteCode}/${typeCode}/${fy}/${nextSerial}`;

              docUpd.order_number = finalNo;

              // 5. Increment serial for next order
              await admin
                .schema("procurement")
                .from("serialization_settings")
                .update({ current_number: nextSerial })
                .eq("id", serialObj.id);

              console.log(`✅ Order number assigned: ${finalNo}`);
            } else {
              console.error("❌ Could not create/find serialization_settings record");
            }
          }

          // Append Issued entry to snapshot activity_log
          const existingSnap = order?.snapshot || {};
          const actLog = Array.isArray(existingSnap.activity_log) ? [...existingSnap.activity_log] : [];
          actLog.push({
            action: 'Issued',
            action_by: issuerProfile?.name || "",
            action_at: new Date().toISOString(),
            ...(docUpd.order_number ? { order_number: docUpd.order_number } : {})
          });
          docUpd.snapshot = { ...existingSnap, activity_log: actLog };
        } catch (numErr) {
          console.error("Number assignment failed:", numErr);
        }
     }
     
     if (Object.keys(docUpd).length > 0) {
        await admin.schema("procurement").from("purchase_orders").update(docUpd).eq("id", request.document_id);
     }
  }

  res.json({ success: true, newStatus: nextStatus, isFinal });
  } catch (err) {
    console.error("[approvals/action] error:", err.message);
    res.status(500).json({ error: err.message || "Action failed" });
  }
});

module.exports = router;
