const express = require("express");
const router  = express.Router();
const admin = require("../helpers/supabaseHelper");
const getAdminClient = () => admin;
const { requireAuth } = require("../middleware/auth");

const ACTION_LABELS = {
  issue:    "Issue Orders",
  recall:   "Recall Orders",
  cancel:   "Cancel Orders",
  amend:    "Amend Orders",
  approval: "Approvals",
};

/* GET /api/delegations/my-powers — what actions this user has power over */
router.get("/my-powers", requireAuth, async (req, res) => {
  const admin       = getAdminClient();
  const userId      = String(req.user.id);
  const isSuperOrGlobal = ["global_admin", "super_admin"].includes(req.user.role);

  const powers = [];

  /* Check request_handlers for order actions */
  const { data: handlers } = await admin.from("request_handlers").select("*");
  for (const h of (handlers || [])) {
    if (h.module_key !== "order") continue;
    if (!ACTION_LABELS[h.action_key] || h.action_key === "approval") continue;
    const inList = isSuperOrGlobal || (h.users || []).some(u => String(u.id) === userId);
    if (inList) powers.push({ key: h.action_key, label: ACTION_LABELS[h.action_key] });
  }

  /* Check if user is approver in any active flow */
  let isApprover = isSuperOrGlobal;
  if (!isApprover) {
    const { data: flows } = await admin.from("approval_flows").select("levels").eq("status", "active");
    outer: for (const flow of (flows || [])) {
      for (const level of (flow.levels || [])) {
        if ((level.approvers || []).some(a => String(a.id) === userId)) {
          isApprover = true;
          break outer;
        }
      }
    }
  }
  if (isApprover) powers.push({ key: "approval", label: ACTION_LABELS.approval });

  res.json({ powers });
});

/* GET /api/delegations/my — my delegations (as delegator) */
router.get("/my", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("approval_delegations")
    .select("*, delegate:delegate_id(id, name, email, avatar_url)")
    .eq("delegator_id", req.user.id)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ delegations: data || [] });
});

/* POST /api/delegations — create */
router.post("/", requireAuth, async (req, res) => {
  const { delegate_id, actions, start_date, end_date, reason } = req.body;
  if (!delegate_id || !actions?.length || !start_date || !end_date)
    return res.status(400).json({ error: "delegate_id, actions, start_date, end_date are required" });
  if (String(delegate_id) === String(req.user.id))
    return res.status(400).json({ error: "Cannot delegate to yourself" });
  if (new Date(end_date) < new Date(start_date))
    return res.status(400).json({ error: "end_date must be on or after start_date" });

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("approval_delegations")
    .insert({ delegator_id: req.user.id, delegate_id, actions, start_date, end_date, reason: reason || null, is_active: true })
    .select("*, delegate:delegate_id(id, name, email, avatar_url)")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ delegation: data });
});

/* PUT /api/delegations/:id — update */
router.put("/:id", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data: existing } = await admin.from("approval_delegations").select("delegator_id").eq("id", req.params.id).single();
  if (!existing || String(existing.delegator_id) !== String(req.user.id))
    return res.status(403).json({ error: "Access denied" });

  const { delegate_id, actions, start_date, end_date, reason, is_active } = req.body;
  const { data, error } = await admin
    .from("approval_delegations")
    .update({ delegate_id, actions, start_date, end_date, reason: reason || null, is_active, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select("*, delegate:delegate_id(id, name, email, avatar_url)")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ delegation: data });
});

/* DELETE /api/delegations/:id */
router.delete("/:id", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data: existing } = await admin.from("approval_delegations").select("delegator_id").eq("id", req.params.id).single();
  if (!existing || String(existing.delegator_id) !== String(req.user.id))
    return res.status(403).json({ error: "Access denied" });
  const { error } = await admin.from("approval_delegations").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* ── Helper used by other routes ─────────────────────────────────────────────
   Returns true if userId has a currently-active delegation for the given action
   from delegatorId (i.e. delegatorId delegated `action` to userId today).
   ──────────────────────────────────────────────────────────────────────────── */
async function isDelegatedFor(admin, userId, delegatorId, action) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("approval_delegations")
    .select("id")
    .eq("delegate_id", userId)
    .eq("delegator_id", delegatorId)
    .eq("is_active", true)
    .lte("start_date", today)
    .gte("end_date", today)
    .contains("actions", [action])
    .maybeSingle();
  return !!data;
}

/* Helper: get all active delegates for a delegator+action on today */
async function getActiveDelegatesFor(admin, delegatorId, action) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("approval_delegations")
    .select("delegate_id")
    .eq("delegator_id", delegatorId)
    .eq("is_active", true)
    .lte("start_date", today)
    .gte("end_date", today)
    .contains("actions", [action]);
  return (data || []).map(r => r.delegate_id);
}

module.exports = router;
module.exports.isDelegatedFor       = isDelegatedFor;
module.exports.getActiveDelegatesFor = getActiveDelegatesFor;
