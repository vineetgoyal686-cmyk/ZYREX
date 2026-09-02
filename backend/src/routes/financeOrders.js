// Payments Track — Orders: a vendor's order entered once, so Payments Track
// invoices can reference it instead of repeating vendor/order details.
const express  = require("express");
const router   = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { requirePerm } = require("../helpers/permHelper");

const mapOrder = (r) => ({
  id:            r.id,
  siteId:        r.site_id,
  vendorId:      r.vendor_id,
  vendorName:    r.vendor_name || "",
  msmeNumber:    r.msme_number || "",
  companyId:     r.company_id,
  companyName:   r.company_name || "",
  orderNo:       r.order_no || "",
  orderDate:     r.order_date,
  orderValue:    Number(r.order_value) || 0,
  createdAt:     r.created_at,
  createdByName: r.created_by_name || "",
});

const num = (v) => Math.max(Number(v) || 0, 0);

/* GET /api/finance/orders */
router.get("/orders", async (req, res) => {
  try {
    const { siteId, vendorId, search } = req.query;

    let query = supabase.from("finance_orders").select("*").is("deleted_at", null);
    if (siteId)   query = query.eq("site_id", siteId);
    if (vendorId) query = query.eq("vendor_id", vendorId);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;

    let rows = data || [];
    if (search) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(r => [r.vendor_name, r.order_no].some(v => String(v || "").toLowerCase().includes(s)));
    }

    res.json({ orders: rows.map(mapOrder) });
  } catch (err) {
    console.error("Finance orders read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/finance/orders */
router.post("/orders", requirePerm("payments_track", "can_add"), async (req, res) => {
  try {
    const { siteId, vendorId, vendorName, msmeNumber, companyId, companyName, orderNo, orderDate, orderValue } = req.body;
    if (!vendorId) return res.status(400).json({ error: "Vendor is required" });

    const { data: created, error } = await supabase
      .from("finance_orders")
      .insert({
        site_id:         siteId || null,
        vendor_id:       vendorId,
        vendor_name:     vendorName || "",
        msme_number:     msmeNumber || "",
        company_id:      companyId || null,
        company_name:    companyName || "",
        order_no:        orderNo || "",
        order_date:      orderDate || null,
        order_value:     num(orderValue),
        created_by_id:   req._authUserId || null,
        created_by_name: req.body.createdByName || "",
      })
      .select("*")
      .single();
    if (error) throw error;

    res.json({ order: mapOrder(created) });
  } catch (err) {
    console.error("Finance order create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/finance/orders/:id */
router.put("/orders/:id", requirePerm("payments_track", "can_edit"), async (req, res) => {
  try {
    const { siteId, vendorId, vendorName, msmeNumber, companyId, companyName, orderNo, orderDate, orderValue } = req.body;
    if (!vendorId) return res.status(400).json({ error: "Vendor is required" });

    const { data: updated, error } = await supabase
      .from("finance_orders")
      .update({
        site_id:     siteId || null,
        vendor_id:   vendorId,
        vendor_name: vendorName || "",
        msme_number: msmeNumber || "",
        company_id:  companyId || null,
        company_name: companyName || "",
        order_no:    orderNo || "",
        order_date:  orderDate || null,
        order_value: num(orderValue),
        updated_at:  new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .select("*")
      .single();
    if (error) throw error;

    res.json({ order: mapOrder(updated) });
  } catch (err) {
    console.error("Finance order update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
