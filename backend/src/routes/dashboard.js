const express  = require("express");
const router   = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { requireAuth } = require("../middleware/auth");
const { requirePerm } = require("../helpers/permHelper");
const { projectScope, userIdFrom } = require("../helpers/projectScope");

// In-memory cache for global stats (expensive query), proactively warmed
// so the first request after server start doesn't pay the full cost.
let globalStatsCache = null;
let globalStatsCacheAt = 0;
let globalStatsRefreshing = null; // in-flight recompute promise, so concurrent requests share one recompute
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_REFRESH_INTERVAL = 4 * 60 * 1000; // refresh before TTL expires

// Kicks off (or joins an already in-flight) recompute. Errors propagate to the
// caller — use this when a request actually needs the result (cold start).
function recomputeGlobalStats() {
  if (!globalStatsRefreshing) {
    globalStatsRefreshing = computeGlobalStats().finally(() => { globalStatsRefreshing = null; });
  }
  return globalStatsRefreshing;
}

// Fire-and-forget recompute — used when we already have stale cache to serve,
// so a cache-expiry moment never blocks the request that happens to hit it.
function refreshGlobalStatsInBackground() {
  recomputeGlobalStats().catch(err => console.error("Dashboard refresh error:", err.message));
}

// All order-level aggregation (entity/site/category/vendor spend, monthly
// breakdowns, aging, user stats) runs inside Postgres via this RPC — see
// backend/sql/global_dashboard_stats_function.sql. This keeps the endpoint
// fast regardless of table size: only the small aggregated JSON crosses the
// network, instead of every order row.
// siteIds: null = every order (the shared cache); else the lower-cased
// project / office ids + codes a user's Dashboard permission is limited to
async function computeGlobalStats(siteIds = null) {
    const [statsRes, vR, pR, cR, coR, iR, uR, clR] = await Promise.all([
      siteIds
        ? supabase.schema("procurement").rpc("get_global_dashboard_stats", { p_site_ids: siteIds })
        : supabase.schema("procurement").rpc("get_global_dashboard_stats"),
      supabase.schema("procurement").from("vendors").select("id", { count: "exact", head: true }),
      supabase.from("projects").select("id", { count: "exact", head: true }).neq("is_active", false),
      supabase.schema("organisation").from("companies").select("id", { count: "exact", head: true }),
      supabase.schema("organisation").from("employees").select("id", { count: "exact", head: true }),
      supabase.schema("procurement").from("items").select("id", { count: "exact", head: true }),
      supabase.from("users").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.schema("procurement").from("clauses").select("id, type"),
    ]);
    if (statsRes.error) throw statsRes.error;
    const stats = statsRes.data;
    const cls = clR.data || [];

    const result = {
      orders:       stats.orders,
      counts: {
        vendors:  vR.count  || 0,
        sites:    pR.count  || 0,
        entities: cR.count  || 0,
        contacts: coR.count || 0,
        items:    iR.count  || 0,
        users:    uR.count  || 0,
        clauses: {
          total: cls.length,
          tc:    cls.filter(c => c.type === "TC").length,
          pay:   cls.filter(c => c.type === "PAY").length,
          gov:   cls.filter(c => c.type === "GOV").length,
        },
      },
      entitySpend:        stats.entitySpend,
      siteSpend:          stats.siteSpend,
      categorySpend:      stats.categorySpend,
      monthlySpend:       stats.monthlySpend,
      monthlyCount:       stats.monthlyCount,
      monthlySpendBySite: stats.monthlySpendBySite,
      monthlyCountBySite: stats.monthlyCountBySite,
      topVendorsPO:       stats.topVendorsPO,
      topVendorsWO:       stats.topVendorsWO,
      userOrderData:      stats.userOrderData,
      agingOrders:        stats.agingOrders,
    };
    if (siteIds) {
      // Only the sites this user may see
      result.counts.sites = (stats.siteSpend || []).length;
      return result;
    }
    globalStatsCache = result;
    globalStatsCacheAt = Date.now();
    return result;
}

// Users limited to some projects: their own small cache, per set of sites
const scopedCache = new Map(); // key -> { result, at }
async function scopedStats(siteIds, force) {
  const key = [...siteIds].sort().join(",");
  const hit = scopedCache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL) return hit.result;
  const result = await computeGlobalStats(siteIds);
  if (scopedCache.size > 200) scopedCache.clear();
  scopedCache.set(key, { result, at: Date.now() });
  return result;
}

/* GET /api/dashboard/global-stats */
router.get("/global-stats", requireAuth, requirePerm("global_dashboard", "can_view"), async (req, res) => {
  try {
    // "Choose projects" on the Dashboard permission; no scope = every project
    const scope = await projectScope(userIdFrom(req), "global_dashboard", null, { legacy: false });
    if (scope) return res.json(await scopedStats([...scope], req.query.force === "1"));

    if (req.query.force === "1") {
      const result = await recomputeGlobalStats();
      return res.json(result);
    }
    if (globalStatsCache) {
      // Serve whatever we have immediately; if it's gone stale, kick off a
      // background recompute for next time instead of making this request wait.
      if (Date.now() - globalStatsCacheAt >= CACHE_TTL) refreshGlobalStatsInBackground();
      return res.json(globalStatsCache);
    }
    // No cache yet at all (first request right after server start) — this is
    // the only case that has to wait for the real computation.
    const result = await recomputeGlobalStats();
    res.json(result);
  } catch (err) {
    console.error("Dashboard stats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Warm the cache on server start, and keep refreshing it in the background
// so users never hit a cold (slow) first request.
computeGlobalStats().catch(err => console.error("Dashboard warmup error:", err.message));
setInterval(() => {
  refreshGlobalStatsInBackground();
}, CACHE_REFRESH_INTERVAL);

module.exports = router;
