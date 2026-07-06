const express  = require("express");
const router   = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { requireAuth, decodeJwt } = require("../middleware/auth");

const isAdmin = (role) => role === "global_admin";
const requireAdmin = (req, res, next) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: "Access denied" });
  next();
};
const hasGrantedAccess = (user) => isAdmin(user.role) || user.profile_permissions?.user_analytics?.view === true;

const writeHeartbeat = async (userId, module_key, seconds) => {
  if (typeof module_key !== "string" || !module_key.trim()) throw new Error("module_key required");
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > 120) throw new Error("invalid seconds");
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.rpc("increment_screen_time", {
    p_user_id: userId,
    p_module_key: module_key,
    p_activity_date: today,
    p_seconds: seconds,
  });
  if (error) throw error;
};

// POST /api/screen-time/login — one row per login (browser session)
router.post("/login", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("login_events")
      .insert({ user_id: req.user.id })
      .select("id")
      .single();
    if (error) throw error;
    res.json({ session_id: data.id });
  } catch (err) {
    console.error("screen-time login error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/screen-time/logout — closes the given session (not "latest for user",
// so a logout on one device/tab can't accidentally close another device's session)
router.post("/logout", requireAuth, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: "session_id required" });
    const { error } = await supabase
      .from("login_events")
      .update({ logout_at: new Date().toISOString() })
      .eq("id", session_id)
      .eq("user_id", req.user.id)
      .is("logout_at", null);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("screen-time logout error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/screen-time/heartbeat — accrues active seconds for the current module.
// Date bucket is computed server-side (NOT taken from the client) to avoid
// client clock-skew putting time in the wrong day.
router.post("/heartbeat", requireAuth, async (req, res) => {
  try {
    await writeHeartbeat(req.user.id, req.body.module_key, req.body.seconds);
    res.json({ success: true });
  } catch (err) {
    console.error("screen-time heartbeat error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/screen-time/heartbeat-beacon — same as /heartbeat, but for calls made via
// navigator.sendBeacon() on tab-close (beforeunload/pagehide), which cannot set an
// Authorization header — the token travels inside the JSON body instead.
router.post("/heartbeat-beacon", async (req, res) => {
  try {
    const { token, module_key, seconds } = req.body || {};
    const payload = token && decodeJwt(token);
    if (!payload?.sub) return res.status(401).end();
    await writeHeartbeat(payload.sub, module_key, seconds);
    res.status(204).end();
  } catch (err) {
    console.error("screen-time heartbeat-beacon error:", err.message);
    res.status(400).end();
  }
});

// GET /api/screen-time/access — list of users granted access to the report
// (besides global_admin/super_admin, who always have it). Admin-only.
router.get("/access", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, profile_permissions")
      .eq("is_active", true);
    if (error) throw error;
    const granted = (data || [])
      .filter(u => !isAdmin(u.role) && u.profile_permissions?.user_analytics?.view === true)
      .map(u => ({ id: u.id, name: u.name, email: u.email }));
    res.json({ users: granted });
  } catch (err) {
    console.error("screen-time access list error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/screen-time/access { user_id } — grant a specific user access to the
// report. Merges into their existing profile_permissions so other capability
// flags (manage_user, manage_project, etc.) aren't clobbered.
router.post("/access", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id required" });
    const { data: target, error: fetchErr } = await supabase
      .from("users").select("profile_permissions").eq("id", user_id).single();
    if (fetchErr) throw fetchErr;
    const merged = { ...(target?.profile_permissions || {}), user_analytics: { view: true } };
    const { error } = await supabase.from("users").update({ profile_permissions: merged }).eq("id", user_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("screen-time access grant error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/screen-time/access/:user_id — revoke a previously granted access.
router.delete("/access/:user_id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { user_id } = req.params;
    const { data: target, error: fetchErr } = await supabase
      .from("users").select("profile_permissions").eq("id", user_id).single();
    if (fetchErr) throw fetchErr;
    const merged = { ...(target?.profile_permissions || {}), user_analytics: { view: false } };
    const { error } = await supabase.from("users").update({ profile_permissions: merged }).eq("id", user_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("screen-time access revoke error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/screen-time/report?date=YYYY-MM-DD&range=day|week&user_id=
// Admin, or a user explicitly granted access via /access. Returns per-user
// module screen time, login/logout sessions, and action-request counts/turnaround.
router.get("/report", requireAuth, async (req, res) => {
  try {
    if (!hasGrantedAccess(req.user)) return res.status(403).json({ error: "Access denied" });

    const range = req.query.range === "week" ? "week" : "day";
    const endDate = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : new Date().toISOString().slice(0, 10);
    const startDate = range === "week"
      ? new Date(new Date(endDate).getTime() - 6 * 86400000).toISOString().slice(0, 10)
      : endDate;
    const userIdFilter = req.query.user_id || null;

    let screenQuery = supabase
      .from("screen_time_logs")
      .select("user_id, module_key, activity_date, duration_seconds")
      .gte("activity_date", startDate)
      .lte("activity_date", endDate);
    if (userIdFilter) screenQuery = screenQuery.eq("user_id", userIdFilter);

    let sessionQuery = supabase
      .from("login_events")
      .select("user_id, login_at, logout_at")
      .gte("login_at", `${startDate}T00:00:00.000Z`)
      .lte("login_at", `${endDate}T23:59:59.999Z`)
      .order("login_at", { ascending: true });
    if (userIdFilter) sessionQuery = sessionQuery.eq("user_id", userIdFilter);

    let actionQuery = supabase
      .from("order_action_requests")
      .select("requestor_id, actioned_by_id, status, created_at, actioned_at")
      .gte("created_at", `${startDate}T00:00:00.000Z`)
      .lte("created_at", `${endDate}T23:59:59.999Z`);

    const [screenRes, sessionRes, actionRes, usersRes] = await Promise.all([
      screenQuery,
      sessionQuery,
      actionQuery,
      supabase.from("users").select("id, name, email, role").eq("is_active", true),
    ]);
    if (screenRes.error) throw screenRes.error;
    if (sessionRes.error) throw sessionRes.error;
    if (actionRes.error) throw actionRes.error;
    if (usersRes.error) throw usersRes.error;

    const userMap = new Map((usersRes.data || []).map(u => [u.id, u]));
    const byUser = new Map();
    const bucket = (userId) => {
      if (!byUser.has(userId)) {
        const u = userMap.get(userId);
        byUser.set(userId, {
          user_id: userId,
          user_name: u?.name || "Unknown",
          user_email: u?.email || "",
          modules: new Map(),
          sessions: [],
          requests_raised: 0,
          requests_actioned: 0,
          turnaround_seconds_total: 0,
          turnaround_count: 0,
          total_seconds: 0,
        });
      }
      return byUser.get(userId);
    };

    for (const row of screenRes.data || []) {
      const u = bucket(row.user_id);
      const prev = u.modules.get(row.module_key) || 0;
      u.modules.set(row.module_key, prev + row.duration_seconds);
      u.total_seconds += row.duration_seconds;
    }

    for (const row of sessionRes.data || []) {
      const u = bucket(row.user_id);
      u.sessions.push({ login_at: row.login_at, logout_at: row.logout_at });
    }

    for (const row of actionRes.data || []) {
      if (row.requestor_id) bucket(row.requestor_id).requests_raised += 1;
      if (row.actioned_by_id && row.status !== "Pending") {
        const u = bucket(row.actioned_by_id);
        u.requests_actioned += 1;
        if (row.actioned_at) {
          const seconds = (new Date(row.actioned_at) - new Date(row.created_at)) / 1000;
          if (seconds >= 0) {
            u.turnaround_seconds_total += seconds;
            u.turnaround_count += 1;
          }
        }
      }
    }

    const users = Array.from(byUser.values())
      .filter(u => !userIdFilter || u.user_id === userIdFilter)
      .map(u => ({
        user_id: u.user_id,
        user_name: u.user_name,
        user_email: u.user_email,
        modules: Array.from(u.modules.entries()).map(([module_key, duration_seconds]) => ({ module_key, duration_seconds })),
        sessions: u.sessions,
        requests_raised: u.requests_raised,
        requests_actioned: u.requests_actioned,
        avg_turnaround_seconds: u.turnaround_count > 0
          ? Math.round(u.turnaround_seconds_total / u.turnaround_count)
          : null,
        total_seconds: u.total_seconds,
      }))
      .sort((a, b) => b.total_seconds - a.total_seconds);

    res.json({ start_date: startDate, end_date: endDate, range, users });
  } catch (err) {
    console.error("screen-time report error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
