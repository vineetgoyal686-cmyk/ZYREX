const express  = require("express");
const router   = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { requireAuth } = require("../middleware/auth");

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// In-memory cache for global stats (expensive query), proactively warmed
// so the first request after server start doesn't pay the full cost.
let globalStatsCache = null;
let globalStatsCacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_REFRESH_INTERVAL = 4 * 60 * 1000; // refresh before TTL expires

async function computeGlobalStats() {
    const { data: orders, error: ordErr } = await supabase
      .schema("procurement")
      .from("purchase_orders")
      .select("id, order_number, order_type, status, totals, site_id, company_id, vendor_id, category_id, created_at, updated_at, made_by, vendors(vendor_name), snapshot")
      .neq("status", "Deleted");
    if (ordErr) throw ordErr;

    const STATUS_KEY = {
      "Draft":         "draft",
      "Review":        "review",
      "Pending Issue": "pendingIssue",
      "Issued":        "issued",
      "Amended":       "amended",
      "Amend Pending": "amendPending",
      "Reverted":      "reverted",
      "Recalled":      "recalled",
      "Rejected":      "rejected",
      "Cancelled":     "cancelled",
    };

    const mkBucket = () => ({ po: 0, wo: 0, poValue: 0, woValue: 0 });
    const orderStats = {
      total:        mkBucket(),
      draft:        mkBucket(),
      review:       mkBucket(),
      pendingIssue: mkBucket(),
      issued:       mkBucket(),
      amended:      mkBucket(),
      amendPending: mkBucket(),
      reverted:     mkBucket(),
      recalled:     mkBucket(),
      rejected:     mkBucket(),
      cancelled:    mkBucket(),
    };

    const entityMap  = {};
    const siteMap    = {};
    const catMap     = {};
    const vendorMap  = {};
    const userMap    = {};
    const monthlySpendArr  = Array.from({ length: 12 }, (_, i) => ({ month: MONTHS[i], po: 0, wo: 0 }));
    const monthlyCountArr  = Array.from({ length: 12 }, (_, i) => ({ month: MONTHS[i], po: 0, wo: 0 }));
    const monthlyBySite      = Array.from({ length: 12 }, () => ({})); // { siteCode: {code,po(₹L),wo(₹L),orders} }
    const monthlyCountBySiteArr = Array.from({ length: 12 }, () => ({})); // { siteCode: {code,po(count),wo(count)} }
    const agingOrders = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Collect made_by UUIDs to batch-resolve names
    const uuidSet = new Set();
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (const o of orders || []) {
      if (o.made_by && UUID_RE.test(o.made_by)) uuidSet.add(o.made_by);
    }

    // Resolve UUIDs → names
    const uuidToName = {};
    if (uuidSet.size > 0) {
      const { data: uRows } = await supabase.from("users")
        .select("id, name")
        .in("id", [...uuidSet]);
      (uRows || []).forEach(u => { uuidToName[u.id] = u.name; });
    }

    for (const o of orders || []) {
      const isPO   = o.order_type === "Supply";
      const type   = isPO ? "po" : "wo";
      const val    = Number(o.totals?.grandTotal) || 0;
      const valL   = Math.round(val / 100000 * 100) / 100;
      const key    = STATUS_KEY[o.status];
      const madeBy = (o.made_by && uuidToName[o.made_by]) || o.made_by || "System";

      // Order stats
      orderStats.total[type]++;
      orderStats.total[`${type}Value`] += val;
      if (key) {
        orderStats[key][type]++;
        orderStats[key][`${type}Value`] += val;
      }

      // Monthly totals + site breakdown
      const mIdx = new Date(o.created_at).getMonth();
      if (!isNaN(mIdx)) {
        monthlySpendArr[mIdx][type] = Math.round((monthlySpendArr[mIdx][type] + valL) * 100) / 100;
        monthlyCountArr[mIdx][type]++;
        // site breakdown per month (populated after siteCode is known below)
      }

      // Entity spend — use company_code as chart key, full name for tooltip
      const eName = o.snapshot?.company?.companyName || o.snapshot?.company?.company_name || "Unknown";
      const eCode = o.snapshot?.company?.companyCode || o.snapshot?.company?.company_code || "";
      const eKey  = eCode || eName;
      if (!entityMap[eKey]) entityMap[eKey] = { entity: eKey, name: eName, code: eCode, po: 0, wo: 0 };
      entityMap[eKey][type] = Math.round((entityMap[eKey][type] + valL) * 100) / 100;

      // Site spend — use siteCode from snapshot (stored as siteCode/siteName)
      const siteCode = o.snapshot?.site?.siteCode || "";
      const siteName = o.snapshot?.site?.siteName || siteCode || o.site_id || "Unknown";
      const sKey     = siteCode || siteName;
      if (!siteMap[sKey]) siteMap[sKey] = { site: sKey, name: siteName, code: siteCode, po: 0, wo: 0 };
      siteMap[sKey][type] = Math.round((siteMap[sKey][type] + valL) * 100) / 100;

      // Month × site breakdown (for tooltips)
      if (!isNaN(mIdx) && siteCode) {
        // spend breakdown
        if (!monthlyBySite[mIdx][siteCode]) monthlyBySite[mIdx][siteCode] = { code: siteCode, po: 0, wo: 0, orders: 0 };
        monthlyBySite[mIdx][siteCode][type] = Math.round((monthlyBySite[mIdx][siteCode][type] + valL) * 100) / 100;
        monthlyBySite[mIdx][siteCode].orders++;
        // count breakdown (integers only, no ₹ values)
        if (!monthlyCountBySiteArr[mIdx][siteCode]) monthlyCountBySiteArr[mIdx][siteCode] = { code: siteCode, po: 0, wo: 0 };
        monthlyCountBySiteArr[mIdx][siteCode][type]++;
      }

      // Category spend (no FK join — use snapshot or category_id)
      const catName = o.snapshot?.category || o.snapshot?.category_name || o.category_id || "Other";
      if (!catMap[catName]) catMap[catName] = { category: catName, po: 0, wo: 0 };
      catMap[catName][type] = Math.round((catMap[catName][type] + valL) * 100) / 100;

      // Vendor spend
      const vName = o.vendors?.vendor_name || o.snapshot?.vendor?.name || o.snapshot?.vendor?.vendor_name || "Unknown";
      if (!vendorMap[vName]) vendorMap[vName] = { name: vName, pov: 0, wov: 0, poc: 0, woc: 0 };
      if (isPO) { vendorMap[vName].pov = Math.round((vendorMap[vName].pov + valL) * 100) / 100; vendorMap[vName].poc++; }
      else       { vendorMap[vName].wov = Math.round((vendorMap[vName].wov + valL) * 100) / 100; vendorMap[vName].woc++; }

      // User order stats (for User Stats table)
      const siteCd = siteCode;
      if (!userMap[madeBy]) userMap[madeBy] = { name: madeBy, po: 0, wo: 0, total: 0, value: 0, sites: {} };
      userMap[madeBy][type]++;
      userMap[madeBy].total++;
      userMap[madeBy].value = Math.round((userMap[madeBy].value + valL) * 100) / 100;
      if (siteCd) {
        if (!userMap[madeBy].sites[siteCd]) userMap[madeBy].sites[siteCd] = { code: siteCd, po: 0, wo: 0 };
        userMap[madeBy].sites[siteCd][type]++;
      }

      // Aging orders
      if (["Review", "Pending Issue", "Amend Pending"].includes(o.status)) {
        const since = new Date(o.updated_at || o.created_at); since.setHours(0, 0, 0, 0);
        const days  = Math.max(0, Math.floor((today - since) / 86400000));
        agingOrders.push({
          orderNo:   o.order_number,
          type:      isPO ? "PO" : "WO",
          vendor:    o.vendors?.vendor_name || o.snapshot?.vendor?.name || o.snapshot?.vendor?.vendor_name || "—",
          value:     `₹${valL}L`,
          rawValue:  val,
          status:    o.status,
          pendingAt: madeBy,
          days,
          since:     since.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
          site:      siteName,
          siteCode:  siteCode,
          entity:    eName,
        });
      }
    }

    // Counts
    const [vR, pR, cR, coR, iR, uR, clR] = await Promise.all([
      supabase.schema("procurement").from("vendors").select("id", { count: "exact", head: true }),
      supabase.from("projects").select("id", { count: "exact", head: true }).neq("is_active", false),
      supabase.schema("organisation").from("companies").select("id", { count: "exact", head: true }),
      supabase.schema("organisation").from("employees").select("id", { count: "exact", head: true }),
      supabase.schema("procurement").from("items").select("id", { count: "exact", head: true }),
      supabase.from("users").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.schema("procurement").from("clauses").select("id, type"),
    ]);
    const cls = clR.data || [];

    const topVendorsPO = Object.values(vendorMap)
      .filter(v => v.pov > 0)
      .sort((a, b) => b.pov - a.pov)
      .slice(0, 5)
      .map(v => ({ name: v.name, value: Math.round(v.pov * 100) / 100, count: v.poc }));

    const topVendorsWO = Object.values(vendorMap)
      .filter(v => v.wov > 0)
      .sort((a, b) => b.wov - a.wov)
      .slice(0, 5)
      .map(v => ({ name: v.name, value: Math.round(v.wov * 100) / 100, count: v.woc }));

    const userOrderData = Object.values(userMap)
      .sort((a, b) => b.total - a.total)
      .map(u => ({ ...u, sites: Object.values(u.sites) }));

    const result = {
      orders:       orderStats,
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
      entitySpend:   Object.values(entityMap),
      siteSpend:     Object.values(siteMap),
      categorySpend: Object.values(catMap).sort((a, b) => (b.po + b.wo) - (a.po + a.wo)).slice(0, 10),
      monthlySpend:    monthlySpendArr,
      monthlyCount:    monthlyCountArr,
      monthlySpendBySite: Object.fromEntries(monthlyBySite.map((s, i) => [MONTHS[i], Object.values(s)])),
      monthlyCountBySite: Object.fromEntries(monthlyCountBySiteArr.map((s, i) => [MONTHS[i], Object.values(s)])),
      topVendorsPO,
      topVendorsWO,
      userOrderData,
      agingOrders:   agingOrders.sort((a, b) => b.days - a.days),
    };
    globalStatsCache = result;
    globalStatsCacheAt = Date.now();
    return result;
}

/* GET /api/dashboard/global-stats */
router.get("/global-stats", requireAuth, async (req, res) => {
  try {
    if (globalStatsCache && Date.now() - globalStatsCacheAt < CACHE_TTL) {
      return res.json(globalStatsCache);
    }
    const result = await computeGlobalStats();
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
  computeGlobalStats().catch(err => console.error("Dashboard refresh error:", err.message));
}, CACHE_REFRESH_INTERVAL);

module.exports = router;
