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

/* Auto-generate next dept_id e.g. DEPT-001 */
const generateDeptId = async (admin) => {
  const { data } = await admin
    .from("departments")
    .select("dept_id")
    .not("dept_id", "is", null)
    .order("dept_id", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return "DEPT-001";
  const last = data[0].dept_id || "DEPT-000";
  const num  = parseInt(last.replace("DEPT-", ""), 10) || 0;
  return `DEPT-${String(num + 1).padStart(3, "0")}`;
};

/* GET /api/departments */
router.get("/", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("departments")
    .select("*")
    .order("name", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ departments: data });
});

/* POST /api/departments */
router.post("/", requireAuth, async (req, res) => {
  const { name, head, status, division_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Department name is required" });

  const admin = getAdminClient();

  const { data: existing } = await admin.from("departments").select("id").ilike("name", name.trim()).single();
  if (existing) return res.status(400).json({ error: "Department with this name already exists" });

  const dept_id = await generateDeptId(admin);

  const { data, error } = await admin.from("departments").insert({
    name:        name.trim(),
    dept_id,
    head:        head?.trim()  || null,
    status:      status        || "active",
    division_id: division_id   || null,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, department: data });
});

/* PUT /api/departments/:id */
router.put("/:id", requireAuth, async (req, res) => {
  const { name, head, status, division_id } = req.body;
  const updates = {};
  if (name        !== undefined) updates.name        = name.trim();
  if (head        !== undefined) updates.head        = head?.trim() || null;
  if (status      !== undefined) updates.status      = status;
  if (division_id !== undefined) updates.division_id = division_id || null;

  const admin = getAdminClient();
  const { data, error } = await admin.from("departments").update(updates).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, department: data });
});

/* DELETE /api/departments/:id */
router.delete("/:id", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { error } = await admin.from("departments").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
