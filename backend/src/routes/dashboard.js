const express  = require("express");
const router   = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { requireAuth } = require("../middleware/auth");

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* GET /api/dashboard/global-stats */
router.get("/global-stats", requireAuth, async (req, res) => {
  try {
    const { data: orders, error: ordErr } = await supabase
      .schema("procurement")
      .from("purchase_orders")
      .select("id, order_number, order_type, status, totals, site_id, company_id, vendor_id, category_id, created_at, updated_at, made_by, companies(name, code), vendors(name), categories(name), snapshot")
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
    const monthlySpendArr = Array.from({ length: 12 }, (_, i) => ({ month: MONTHS[i], po: 0, wo: 0 }));
    const monthlyCountArr = Array.from({ length: 12 }, (_, i) => ({ month: MONTHS[i], po: 0, wo: 0 }));
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
      const madeBy = (o.made_by && uuidToName[o.made_by]) || o.made_by || "Unknown";

      // Order stats
      orderStats.total[type]++;
      orderStats.total[`${type}Value`] += val;
      if (key) {
        orderStats[key][type]++;
        orderStats[key][`${type}Value`] += val;
      }

      // Monthly
      const mIdx = new Date(o.created_at).getMonth();
      if (!isNaN(mIdx)) {
        monthlySpendArr[mIdx][type] = Math.round((monthlySpendArr[mIdx][type] + valL) * 100) / 100;
        monthlyCountArr[mIdx][type]++;
      }

      // Entity spend
      const eName = o.companies?.name || o.snapshot?.company?.name || "Unknown";
      const eCode = o.companies?.code || "";
      if (!entityMap[eName]) entityMap[eName] = { entity: eName, code: eCode, po: 0, wo: 0 };
      entityMap[eName][type] = Math.round((entityMap[eName][type] + valL) * 100) / 100;

      // Site spend
      const siteName = o.snapshot?.site?.name || o.site_id || "Unknown";
      const siteCode = o.snapshot?.site?.code || "";
      if (!siteMap[siteName]) siteMap[siteName] = { site: siteName, code: siteCode, po: 0, wo: 0 };
      siteMap[siteName][type] = Math.round((siteMap[siteName][type] + valL) * 100) / 100;

      // Category spend
      const catName = o.categories?.name || o.snapshot?.category || "Other";
      if (!catMap[catName]) catMap[catName] = { category: catName, po: 0, wo: 0 };
      catMap[catName][type] = Math.round((catMap[catName][type] + valL) * 100) / 100;

      // Vendor spend
      const vName = o.vendors?.name || o.snapshot?.vendor?.name || "Unknown";
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
          vendor:    o.vendors?.name || o.snapshot?.vendor?.name || "—",
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
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.schema("procurement").from("companies").select("id", { count: "exact", head: true }),
      supabase.schema("procurement").from("contacts").select("id", { count: "exact", head: true }),
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

    res.json({
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
      monthlySpend:  monthlySpendArr,
      monthlyCount:  monthlyCountArr,
      topVendorsPO,
      topVendorsWO,
      userOrderData,
      agingOrders:   agingOrders.sort((a, b) => b.days - a.days),
    });
  } catch (err) {
    console.error("Dashboard stats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
