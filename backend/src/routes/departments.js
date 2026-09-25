const express = require("express");
const router  = express.Router();
const admin = require("../helpers/supabaseHelper");
const getAdminClient = () => admin;
const { requireAuth } = require("../middleware/auth");
const { requirePerm } = require("../helpers/permHelper");
const { companyIdFrom, scopeQuery } = require("../helpers/companyScope");

/* Auto-generate next dept_id e.g. DEPT-001 */
const generateDeptId = async (admin) => {
  const { data } = await admin
    .schema("organisation").from("departments")
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
  const { data, error } = await scopeQuery(admin
    .schema("organisation").from("departments")
    .select("*"), req)
    .order("name", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ departments: data });
});

/* POST /api/departments */
router.post("/", requirePerm("departments", "can_add"), async (req, res) => {
  const { name, head, status, division_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Department name is required" });

  const admin = getAdminClient();
  const company_id = companyIdFrom(req.body);

  let dupQ = admin.schema("organisation").from("departments").select("id").ilike("name", name.trim());
  dupQ = company_id ? dupQ.eq("company_id", company_id) : dupQ.is("company_id", null);
  const { data: existing } = await dupQ.limit(1).maybeSingle();
  if (existing) return res.status(400).json({ error: "Department with this name already exists" });

  const dept_id = await generateDeptId(admin);

  const { data, error } = await admin.schema("organisation").from("departments").insert({
    name:        name.trim(),
    dept_id,
    head:        head?.trim()  || null,
    status:      status        || "active",
    division_id: division_id   || null,
    company_id,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, department: data });
});

/* PUT /api/departments/:id */
router.put("/:id", requirePerm("departments", "can_edit"), async (req, res) => {
  const { name, head, status, division_id } = req.body;
  const updates = {};
  if (name        !== undefined) updates.name        = name.trim();
  if (head        !== undefined) updates.head        = head?.trim() || null;
  if (status      !== undefined) updates.status      = status;
  if (division_id !== undefined) updates.division_id = division_id || null;

  const admin = getAdminClient();
  const { data, error } = await admin.schema("organisation").from("departments").update(updates).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, department: data });
});

/* DELETE /api/departments/:id */
router.delete("/:id", requirePerm("departments", "can_delete"), async (req, res) => {
  const admin = getAdminClient();
  const { error } = await admin.schema("organisation").from("departments").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
