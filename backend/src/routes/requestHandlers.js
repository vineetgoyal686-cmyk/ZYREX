const express = require("express");
const router  = express.Router();
const admin = require("../helpers/supabaseHelper");
const getAdminClient = () => admin;
const { requireAuth } = require("../middleware/auth");

const requireAdminOrAbove = (req, res, next) => {
  if (!["global_admin", "super_admin", "admin"].includes(req.user.role))
    return res.status(403).json({ error: "Access denied" });
  next();
};

/* GET /api/request-handlers — fetch all handler configs
   config      → Default handlers: module -> action -> { users, is_single }
   by_company  → company_id -> module -> action -> { users, is_single } (only companies with their own) */
router.get("/", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data, error } = await admin.from("request_handlers").select("*");
  if (error) return res.status(500).json({ error: error.message });

  const config = {};
  const by_company = {};
  (data || []).forEach(row => {
    const target = row.company_id ? (by_company[row.company_id] ||= {}) : config;
    if (!target[row.module_key]) target[row.module_key] = {};
    target[row.module_key][row.action_key] = {
      users:     row.users || [],
      is_single: row.is_single,
    };
  });
  res.json({ config, by_company });
});

/* POST /api/request-handlers/validate-user — check user is active */
router.post("/validate-user", requireAuth, requireAdminOrAbove, async (req, res) => {
  const { user_id } = req.body;
  const admin = getAdminClient();
  const { data: targetUser } = await admin.from("users").select("is_active").eq("id", user_id).single();
  if (!targetUser || targetUser.is_active === false)
    return res.json({ valid: false, error: "User is inactive." });
  res.json({ valid: true });
});

/* PUT /api/request-handlers — save handlers for a module + action (+ company).
   company_id omitted/null → the Default row. A company row saved with no users is
   removed, so that company goes back to the Default handlers. */
router.put("/", requireAuth, requireAdminOrAbove, async (req, res) => {
  const { module_key, action_key, users, is_single } = req.body;
  const company_id = req.body.company_id || null;
  if (!module_key || !action_key) return res.status(400).json({ error: "module_key and action_key are required" });

  const admin = getAdminClient();
  let q = admin.from("request_handlers").select("id")
    .eq("module_key", module_key).eq("action_key", action_key);
  q = company_id ? q.eq("company_id", company_id) : q.is("company_id", null);
  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr) return res.status(500).json({ error: findErr.message });

  const list = users || [];
  if (company_id && list.length === 0) {
    if (existing) {
      const { error } = await admin.from("request_handlers").delete().eq("id", existing.id);
      if (error) return res.status(500).json({ error: error.message });
    }
    return res.json({ success: true, handler: null });
  }

  const row = {
    module_key,
    action_key,
    company_id,
    users:      list,
    is_single:  !!is_single,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = existing
    ? await admin.from("request_handlers").update(row).eq("id", existing.id).select().single()
    : await admin.from("request_handlers").insert(row).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, handler: data });
});

module.exports = router;
