const express = require("express");
const router  = express.Router();
const admin = require("../helpers/supabaseHelper");
const { requireAuth } = require("../middleware/auth");
const { bustOwnerCache } = require("../helpers/controlHelper");

// Global Admin, or someone Global Admin gave Control Center access to
const requireControlCenter = (req, res, next) => {
  if (req.user.role !== "global_admin" && !req.user.can_manage_control_center)
    return res.status(403).json({ error: "You don't have access to the Control Center" });
  next();
};

/* GET /api/control-center — every controlled tab with its owners.
   Readable by any logged-in user: the permission screens use it to hide
   tabs the viewer can't grant. */
router.get("/", requireAuth, async (req, res) => {
  const { data, error } = await admin.from("module_owners").select("module_key, user_id");
  if (error) return res.status(500).json({ error: error.message });
  const owners = {};
  (data || []).forEach(r => { (owners[r.module_key] = owners[r.module_key] || []).push(r.user_id); });
  res.json({ owners });
});

/* GET /api/control-center/users — people who can be made owners. Its own
   route so a Control Center manager without User Management access can
   still pick owners. */
router.get("/users", requireAuth, requireControlCenter, async (req, res) => {
  const { data, error } = await admin.from("users")
    .select("id, name, email").eq("is_active", true).neq("role", "global_admin").order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ users: data || [] });
});

/* PUT /api/control-center — body { owners: { module_key: [user_id, ...] } }.
   Replaces the owners of every key sent; an empty list takes that tab out
   of the Control Center (back to normal). Keys not sent are untouched. */
router.put("/", requireAuth, requireControlCenter, async (req, res) => {
  const owners = req.body?.owners;
  if (!owners || typeof owners !== "object" || Array.isArray(owners))
    return res.status(400).json({ error: "owners must be an object" });

  const keys = Object.keys(owners);
  if (!keys.length) return res.json({ success: true });
  if (keys.some(k => !Array.isArray(owners[k])))
    return res.status(400).json({ error: "each tab needs a list of owners" });

  const { error: delErr } = await admin.from("module_owners").delete().in("module_key", keys);
  if (delErr) return res.status(500).json({ error: delErr.message });

  const rows = keys.flatMap(k => [...new Set(owners[k])].map(uid => ({
    module_key: k, user_id: uid, created_by: req.user.id,
  })));
  if (rows.length) {
    const { error: insErr } = await admin.from("module_owners").insert(rows);
    if (insErr) return res.status(500).json({ error: insErr.message });
  }

  bustOwnerCache();
  res.json({ success: true });
});

module.exports = router;
