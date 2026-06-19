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

/* GET /api/request-handlers — fetch all handler configs */
router.get("/", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data, error } = await admin.from("request_handlers").select("*");
  if (error) return res.status(500).json({ error: error.message });

  const config = {};
  (data || []).forEach(row => {
    if (!config[row.module_key]) config[row.module_key] = {};
    config[row.module_key][row.action_key] = {
      users:     row.users || [],
      is_single: row.is_single,
    };
  });
  res.json({ config });
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

/* PUT /api/request-handlers — upsert handler config for a module+action */
router.put("/", requireAuth, requireAdminOrAbove, async (req, res) => {
  const { module_key, action_key, users, is_single } = req.body;
  if (!module_key || !action_key) return res.status(400).json({ error: "module_key and action_key are required" });

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("request_handlers")
    .upsert({
      module_key,
      action_key,
      users:      users     || [],
      is_single:  !!is_single,
      updated_at: new Date().toISOString(),
    }, { onConflict: "module_key,action_key" })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, handler: data });
});

module.exports = router;
