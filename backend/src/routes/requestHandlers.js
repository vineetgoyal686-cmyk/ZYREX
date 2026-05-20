const express = require("express");
const router  = express.Router();
const { createClient } = require("@supabase/supabase-js");

const getAdminClient = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

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
  if (!userId) return res.status(401).json({ error: "Invalid token" });
  const admin = getAdminClient();
  const { data: profile } = await admin.from("users").select("*").eq("id", userId).single();
  if (!profile || !profile.is_active) return res.status(403).json({ error: "Account inactive" });
  req.user = profile;
  next();
};

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
