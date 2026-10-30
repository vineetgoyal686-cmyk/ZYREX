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

/* ── Departments from what employees already have ──
   Same as Designations › "From employees" (routes/organisation.js):
   GET = departments a company's employees use that aren't in its list,
   POST = add the chosen ones (renamed / merged) and set those employees'
   department to the list name. */
const deptKey = (v) => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();

router.get("/from-employees", requirePerm("departments", "can_view"), async (req, res) => {
  try {
    const company_id = companyIdFrom(req.query);
    if (!company_id) return res.status(400).json({ error: "Pick a company" });
    const org = admin.schema("organisation");
    const [{ data: emps, error: e1 }, { data: master, error: e2 }] = await Promise.all([
      org.from("employees").select("person_name, department").eq("company_id", company_id).neq("status", "inactive"),
      org.from("departments").select("name").eq("company_id", company_id),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const have = new Set((master || []).map(d => deptKey(d.name)));
    const by = new Map();
    for (const e of emps || []) {
      const k = deptKey(e.department);
      if (!k || have.has(k)) continue;
      const cur = by.get(k) || { text: String(e.department).trim().replace(/\s+/g, " "), count: 0, people: [] };
      cur.count++;
      if (cur.people.length < 4) cur.people.push(e.person_name);
      by.set(k, cur);
    }
    res.json({ suggestions: [...by.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/from-employees", requirePerm("departments", "can_add"), async (req, res) => {
  try {
    const company_id = companyIdFrom(req.body);
    if (!company_id) return res.status(400).json({ error: "Pick a company" });
    const items = (Array.isArray(req.body.items) ? req.body.items : [])
      .map(i => ({ from: deptKey(i.from), title: String(i.title || "").trim().replace(/\s+/g, " ") }))
      .filter(i => i.from && i.title);
    if (!items.length) return res.status(400).json({ error: "Nothing to add" });
    const org = admin.schema("organisation");
    const { data: master } = await org.from("departments").select("name").eq("company_id", company_id);
    const have = new Map((master || []).map(d => [deptKey(d.name), d.name]));

    let added = 0;
    for (const name of [...new Set(items.map(i => i.title))]) {
      if (have.has(deptKey(name))) continue;
      const dept_id = await generateDeptId(admin);
      const { error } = await org.from("departments").insert({ name, dept_id, head: null, status: "active", company_id });
      if (error) throw error;
      have.set(deptKey(name), name);
      added++;
    }
    const { data: emps } = await org.from("employees").select("id, department").eq("company_id", company_id);
    const target = new Map(items.map(i => [i.from, have.get(deptKey(i.title))]));
    const updates = new Map();
    for (const e of emps || []) {
      const t = target.get(deptKey(e.department));
      if (t && e.department !== t) updates.set(t, [...(updates.get(t) || []), e.id]);
    }
    let linked = 0;
    for (const [name, ids] of updates) {
      const { error } = await org.from("employees").update({ department: name }).in("id", ids);
      if (error) throw error;
      linked += ids.length;
    }
    res.json({ success: true, added, linked });
  } catch (err) {
    console.error("Departments from employees error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/departments */
router.post("/", requirePerm("departments", "can_add"), async (req, res) => {
  const { name, head, status } = req.body;
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
    company_id,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, department: data });
});

/* PUT /api/departments/:id */
router.put("/:id", requirePerm("departments", "can_edit"), async (req, res) => {
  const { name, head, status } = req.body;
  const updates = {};
  if (name        !== undefined) updates.name        = name.trim();
  if (head        !== undefined) updates.head        = head?.trim() || null;
  if (status      !== undefined) updates.status      = status;

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
