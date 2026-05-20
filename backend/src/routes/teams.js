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

const generateTeamId = async (admin) => {
  const { data } = await admin
    .from("teams")
    .select("team_id")
    .not("team_id", "is", null)
    .order("team_id", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return "TEAM-001";
  const last = data[0].team_id || "TEAM-000";
  const num  = parseInt(last.replace("TEAM-", ""), 10) || 0;
  return `TEAM-${String(num + 1).padStart(3, "0")}`;
};

/* GET /api/teams */
router.get("/", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("teams")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ teams: data });
});

/* POST /api/teams */
router.post("/", requireAuth, async (req, res) => {
  const { name, department_id, leader_id, member_ids, status } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Team name is required" });

  const admin   = getAdminClient();
  const team_id = await generateTeamId(admin);

  const { data, error } = await admin.from("teams").insert({
    name:          name.trim(),
    team_id,
    department_id: department_id || null,
    leader_id:     leader_id     || null,
    member_ids:    Array.isArray(member_ids) ? member_ids : [],
    status:        status        || "active",
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, team: data });
});

/* PUT /api/teams/:id */
router.put("/:id", requireAuth, async (req, res) => {
  const { name, department_id, leader_id, member_ids, status } = req.body;
  const updates = {};
  if (name          !== undefined) updates.name          = name.trim();
  if (department_id !== undefined) updates.department_id = department_id || null;
  if (leader_id     !== undefined) updates.leader_id     = leader_id     || null;
  if (member_ids    !== undefined) updates.member_ids    = Array.isArray(member_ids) ? member_ids : [];
  if (status        !== undefined) updates.status        = status;

  const admin = getAdminClient();
  const { data, error } = await admin.from("teams").update(updates).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, team: data });
});

/* DELETE /api/teams/:id */
router.delete("/:id", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { error } = await admin.from("teams").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
