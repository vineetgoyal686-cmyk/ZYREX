const express = require("express");
const router  = express.Router();
const admin   = require("../helpers/supabaseHelper");
const { requireAuth } = require("../middleware/auth");
const { EVENTS } = require("../utils/orderNotifications");

const requireAdminOrAbove = (req, res, next) => {
  if (!["global_admin", "super_admin", "admin"].includes(req.user.role))
    return res.status(403).json({ error: "Access denied" });
  next();
};

/* GET /api/mail-management/events — the full list of controllable events + their defaults */
router.get("/events", requireAuth, (req, res) => {
  res.json({
    events: Object.entries(EVENTS).map(([key, meta]) => ({ key, ...meta })),
  });
});

/* GET /api/mail-management — fetch all notification configs, grouped like request-handlers */
router.get("/", requireAuth, async (req, res) => {
  const { data, error } = await admin.from("mail_notification_config").select("*");
  if (error) return res.status(500).json({ error: error.message });

  const config = {};
  (data || []).forEach(row => {
    if (!config[row.module_key]) config[row.module_key] = {};
    config[row.module_key][row.action_key] = {
      enabled:  row.enabled,
      extra_to: row.extra_to || [],
      extra_cc: row.extra_cc || [],
    };
  });
  res.json({ config });
});

/* PUT /api/mail-management — upsert config for a module+action */
router.put("/", requireAuth, requireAdminOrAbove, async (req, res) => {
  const { module_key, action_key, enabled, extra_to, extra_cc } = req.body;
  if (!module_key || !action_key) return res.status(400).json({ error: "module_key and action_key are required" });

  const { data, error } = await admin
    .from("mail_notification_config")
    .upsert({
      module_key,
      action_key,
      enabled:    enabled !== false,
      extra_to:   extra_to || [],
      extra_cc:   extra_cc || [],
      updated_at: new Date().toISOString(),
    }, { onConflict: "module_key,action_key" })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, config: data });
});

module.exports = router;
