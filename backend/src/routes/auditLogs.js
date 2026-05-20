const express  = require("express");
const router   = express.Router();
const supabase = require("../helpers/supabaseHelper");

// GET /api/audit-logs/:entityType/:entityId
router.get("/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { data, error } = await supabase
      .schema("procurement")
      .from("audit_logs")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ logs: data || [] });
  } catch (err) {
    console.error("Audit log fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/audit-logs
router.post("/", async (req, res) => {
  try {
    const { entityType, entityId, entityName, action, userId, userName, userEmail, changes } = req.body;
    if (!entityType || !entityId || !action) {
      return res.status(400).json({ error: "entityType, entityId, action required" });
    }
    const { error } = await supabase
      .schema("procurement")
      .from("audit_logs")
      .insert({
        entity_type: entityType,
        entity_id:   String(entityId),
        entity_name: entityName  || null,
        action,
        user_id:     userId      || null,
        user_name:   userName    || null,
        user_email:  userEmail   || null,
        changes:     changes     || null,
      });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Audit log write error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
