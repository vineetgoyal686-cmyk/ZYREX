const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const XLSX     = require("xlsx");
const supabase = require("../helpers/supabaseHelper");
const { requireAuth } = require("../middleware/auth");
const { uploadStorageFile, createSignedStorageUrl, removeStorageFile } = require("../helpers/storageHelper");

const BUCKET = "historical-data";
const upload = multer({ storage: multer.memoryStorage() });

const signPdf = (path) => createSignedStorageUrl(supabase, BUCKET, path);
const formatRow = async (r) => ({ ...r, pdf_url: r.pdf_path ? await signPdf(r.pdf_path) : null, entry_by: r.creator?.name || "—" });

/* ── GET /api/historical-orders/dropdowns ────────────────────────────────── */
router.get("/dropdowns", requireAuth, async (req, res) => {
  try {
    const [sitesR, entitiesR] = await Promise.all([
      supabase.from("projects").select("project_code, project_name, city, state").neq("is_active", false).order("project_code"),
      supabase.schema("procurement").from("companies").select("company_code, company_name, gstin").order("company_code"),
    ]);
    res.json({
      sites:    (sitesR.data    || []).map(s => ({ code: s.project_code, name: s.project_name, location: [s.city, s.state].filter(Boolean).join(", ") })),
      entities: (entitiesR.data || []).map(c => ({ code: c.company_code, name: c.company_name, gstin: c.gstin })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/historical-orders/template ─────────────────────────────────── */
router.get("/template", requireAuth, (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Order No", "Entity Code", "Site Code", "Vendor Name", "Subject", "Order Value", "Order Date", "Prepared In"],
    ["PO/2022/001", "BITL", "B-47", "Vendor Pvt Ltd", "Supply of materials", 500000, "2022-04-01", "Tally"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Historical Orders");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", 'attachment; filename="historical_orders_template.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

/* ── GET /api/historical-orders/export ──────────────────────────────────── */
router.get("/export", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("historical_orders").select("*, creator:created_by(id, name)").order("order_date", { ascending: false });
    if (error) throw error;
    const rows = (data || []).map(r => ({
      "Order No":    r.order_no,
      "Order Type":  r.order_type   || "",
      "Entity Code": r.entity_code  || "",
      "Site Code":   r.site_code    || "",
      "Vendor Name": r.vendor_name  || "",
      "Subject":     r.subject      || "",
      "Prepared In": r.prepared_in  || "",
      "Order Value": r.order_value != null ? Number(r.order_value) : "",
      "Order Date":  r.order_date   || "",
      "Entry By":    r.creator?.name || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historical Orders");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="historical_orders_export.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/historical-orders ──────────────────────────────────────────── */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { site_code, entity_code, vendor_name, prepared_in, order_type } = req.query;
    let q = supabase.from("historical_orders").select("*, creator:created_by(id, name)").order("order_date", { ascending: false });
    if (site_code)   q = q.in("site_code",   Array.isArray(site_code)   ? site_code   : [site_code]);
    if (entity_code) q = q.in("entity_code", Array.isArray(entity_code) ? entity_code : [entity_code]);
    if (vendor_name) q = q.in("vendor_name", Array.isArray(vendor_name) ? vendor_name : [vendor_name]);
    if (prepared_in) q = q.in("prepared_in", Array.isArray(prepared_in) ? prepared_in : [prepared_in]);
    if (order_type)  q = q.in("order_type",  Array.isArray(order_type)  ? order_type  : [order_type]);
    const { data, error } = await q;
    if (error) throw error;
    const records = await Promise.all((data || []).map(formatRow));
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/historical-orders ─────────────────────────────────────────── */
router.post("/", requireAuth, upload.single("pdf"), async (req, res) => {
  try {
    const { order_no, site_code, entity_code, vendor_name, subject, order_value, order_date, prepared_in, order_type } = req.body;
    if (!order_no) return res.status(400).json({ error: "order_no is required" });
    let pdf_path = null;
    if (req.file) {
      const ext = req.file.originalname.split(".").pop();
      pdf_path  = await uploadStorageFile(supabase, BUCKET, `${Date.now()}_${order_no.replace(/\s+/g, "_")}.${ext}`, req.file.buffer, req.file.mimetype);
    }
    const { data, error } = await supabase.from("historical_orders")
      .insert({ order_no, site_code: site_code || null, entity_code: entity_code || null, vendor_name: vendor_name || null, subject: subject || null, order_value: order_value ? Number(order_value) : null, order_date: order_date || null, prepared_in: prepared_in || null, order_type: order_type || null, pdf_path, created_by: req.user.id })
      .select("*, creator:created_by(id, name)").single();
    if (error) throw error;
    res.json({ record: await formatRow(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── PUT /api/historical-orders/:id ─────────────────────────────────────── */
router.put("/:id", requireAuth, upload.single("pdf"), async (req, res) => {
  try {
    const { order_no, site_code, entity_code, vendor_name, subject, order_value, order_date, prepared_in, order_type, remove_pdf } = req.body;
    const { data: existing, error: fetchErr } = await supabase.from("historical_orders").select("pdf_path").eq("id", req.params.id).single();
    if (fetchErr) throw fetchErr;
    let pdf_path = existing.pdf_path;
    if (remove_pdf === "true" && pdf_path) { await removeStorageFile(supabase, BUCKET, pdf_path); pdf_path = null; }
    if (req.file) {
      if (pdf_path) await removeStorageFile(supabase, BUCKET, pdf_path);
      const ext = req.file.originalname.split(".").pop();
      pdf_path  = await uploadStorageFile(supabase, BUCKET, `${Date.now()}_${(order_no || "order").replace(/\s+/g, "_")}.${ext}`, req.file.buffer, req.file.mimetype);
    }
    const { data, error } = await supabase.from("historical_orders")
      .update({ order_no, site_code: site_code || null, entity_code: entity_code || null, vendor_name: vendor_name || null, subject: subject || null, order_value: order_value ? Number(order_value) : null, order_date: order_date || null, prepared_in: prepared_in || null, order_type: order_type || null, pdf_path, updated_at: new Date().toISOString() })
      .eq("id", req.params.id).select("*, creator:created_by(id, name)").single();
    if (error) throw error;
    res.json({ record: await formatRow(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE /api/historical-orders/:id ──────────────────────────────────── */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { data: existing } = await supabase.from("historical_orders").select("pdf_path").eq("id", req.params.id).single();
    if (existing?.pdf_path) await removeStorageFile(supabase, BUCKET, existing.pdf_path);
    const { error } = await supabase.from("historical_orders").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/historical-orders/bulk ───────────────────────────────────── */
router.post("/bulk", requireAuth, upload.single("excel"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const wb   = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (!rows.length) return res.status(400).json({ error: "Excel is empty" });
    const records = rows.map(r => ({
      order_no:    String(r["Order No"]    || r["order_no"]    || "").trim(),
      entity_code: String(r["Entity Code"] || r["entity_code"] || "").trim() || null,
      site_code:   String(r["Site Code"]   || r["site_code"]   || "").trim() || null,
      vendor_name: String(r["Vendor Name"] || r["vendor_name"] || "").trim() || null,
      subject:     String(r["Subject"]     || r["subject"]     || "").trim() || null,
      prepared_in: String(r["Prepared In"] || r["prepared_in"] || "").trim() || null,
      order_value: Number(r["Order Value"] || r["order_value"]) || null,
      order_date:  r["Order Date"] ? new Date(r["Order Date"]).toISOString().slice(0, 10) : null,
      pdf_path:    null,
      created_by:  req.user.id,
    })).filter(r => r.order_no);
    if (!records.length) return res.status(400).json({ error: "No valid rows. Ensure 'Order No' column exists." });
    const { data, error } = await supabase.from("historical_orders").insert(records).select("id");
    if (error) throw error;
    res.json({ inserted: data.length, skipped: rows.length - records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
