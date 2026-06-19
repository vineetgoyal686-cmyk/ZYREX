const express = require("express");
const router  = express.Router();
const admin   = require("../helpers/supabaseHelper");
const { requireAuth } = require("../middleware/auth");

/* GET /api/sop */
router.get("/", requireAuth, async (req, res) => {
  const { data, error } = await admin
    .from("sops")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ sops: data });
});

/* GET /api/sop/:id */
router.get("/:id", requireAuth, async (req, res) => {
  const { data, error } = await admin
    .from("sops")
    .select("*")
    .eq("id", req.params.id)
    .single();
  if (error) return res.status(404).json({ error: "SOP not found" });
  res.json({ sop: data });
});

/* POST /api/sop */
router.post("/", requireAuth, async (req, res) => {
  const { name, description, steps } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "SOP name is required" });

  const user = req.user;
  const { data, error } = await admin
    .from("sops")
    .insert({
      name:            name.trim(),
      description:     description?.trim() || null,
      steps:           steps || [],
      created_by:      user.id,
      created_by_name: user.name || user.email || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, sop: data });
});

/* PUT /api/sop/:id */
router.put("/:id", requireAuth, async (req, res) => {
  const { name, description, steps } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (name        !== undefined) updates.name        = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (steps       !== undefined) updates.steps       = steps;

  const { data, error } = await admin
    .from("sops")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, sop: data });
});

/* DELETE /api/sop/:id */
router.delete("/:id", requireAuth, async (req, res) => {
  const { error } = await admin.from("sops").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
