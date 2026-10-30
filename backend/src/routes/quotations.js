const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase = require("../helpers/supabaseHelper");
const { requireAuth } = require("../middleware/auth");
const { projectScope, allows } = require("../helpers/projectScope");
const { uploadStorageFile, createSignedStorageUrl } = require("../helpers/storageHelper");

/*
 * Intake › Quotations & Comparison (sql/intake_quotations.sql).
 * An approved intake gets quotations from vendors in the Vendor list; the
 * comparison picks a vendor per item and goes for approval through the
 * approval engine (routes/approvalFlows.js, module "comparison").
 * Locked while the comparison is pending or approved.
 */

const store = (t) => supabase.schema("store").from(t);
const BUCKET = "Intake Docs";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 10 } });
const ADMIN_ROLES = ["global_admin", "super_admin", "admin"];
const isoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null;
const text = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const money = (v) => { const n = Math.round(Number(v) * 100) / 100; return Number.isFinite(n) && n > 0 ? n : 0; };
const pct = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0; };
const OPEN_INTAKE = ["approved", "in_review", "working"]; // intake states that can take quotations

/* ── settings ── */
const getMinQuotations = async () => {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "min_quotations").maybeSingle();
  const n = Number(data?.value);
  return Number.isInteger(n) && n >= 1 ? n : 2;
};

/* ── maths: one item's cost from one quotation, incl. discount + GST ── */
const lineCost = (qty, q) => {
  if (!q || !(Number(q.rate) > 0)) return null;
  const base = qty * Number(q.rate) * (1 - (Number(q.discount_pct) || 0) / 100);
  return Math.round(base * (1 + (Number(q.gst_pct) || 0) / 100) * 100) / 100;
};

// everything the comparison screen and the approval need, from the rows
const compute = (items, quotations, selections = []) => {
  const pick = new Map(selections.map(s => [s.item_id, s.quotation_id]));
  const lines = items.map(it => {
    const qty = Number(it.raised_qty) || 0;
    const offers = quotations.map(q => {
      const qi = (q.items || []).find(x => x.item_id === it.id);
      return { quotation_id: q.id, cost: lineCost(qty, qi) };
    }).filter(o => o.cost != null);
    const l1 = offers.length ? offers.reduce((a, b) => (b.cost < a.cost ? b : a)) : null;
    const chosen = pick.get(it.id) || null;
    return { item_id: it.id, qty, l1: l1?.quotation_id || null, l1_cost: l1?.cost ?? null, chosen, chosen_cost: offers.find(o => o.quotation_id === chosen)?.cost ?? null };
  });
  // per vendor: all quoted items + charges (what the whole lot would cost from them)
  const vendors = quotations.map(q => {
    const quoted = lines.map(l => lineCost(l.qty, (q.items || []).find(x => x.item_id === l.item_id))).filter(c => c != null);
    const charges = (Number(q.freight) || 0) + (Number(q.other_charges) || 0);
    return { quotation_id: q.id, items_quoted: quoted.length, total: Math.round((quoted.reduce((a, b) => a + b, 0) + charges) * 100) / 100 };
  });
  // the chosen set: chosen lines + charges of each vendor that gets something
  const winners = [...new Set(lines.map(l => l.chosen).filter(Boolean))];
  const chargesFor = (id) => { const q = quotations.find(x => x.id === id); return (Number(q?.freight) || 0) + (Number(q?.other_charges) || 0); };
  const chosenTotal = Math.round((lines.reduce((a, l) => a + (l.chosen_cost || 0), 0) + winners.reduce((a, id) => a + chargesFor(id), 0)) * 100) / 100;
  const allL1 = lines.every(l => !l.chosen || l.chosen === l.l1);
  return { lines, vendors, winners, chosenTotal, allL1 };
};

/* ── loading + access ── */
const loadIntake = async (req, id) => {
  const { data: intake, error } = await store("intakes").select("*, intake_items(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!intake) return { status: 404, error: "Intake not found" };
  const scope = await projectScope(req.user.id, "intake", "master_data_intakes");
  if (!allows(scope, intake.site_id, intake.site_code)) return { status: 403, error: "This intake's project isn't in your access" };
  intake.intake_items = (intake.intake_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return { intake };
};
const loadAll = async (intakeId) => {
  const [q, c] = await Promise.all([
    store("intake_quotations").select("*").eq("intake_id", intakeId).order("created_at"),
    store("intake_comparisons").select("*").eq("intake_id", intakeId).maybeSingle(),
  ]);
  if (q.error) throw q.error;
  if (c.error) throw c.error;
  return { quotations: q.data || [], comparison: c.data || null };
};
const locked = (comparison) => comparison && ["pending", "approved"].includes(comparison.status);

const quoteOut = (q) => ({
  id: q.id, vendorId: q.vendor_id, vendorName: q.vendor_name, quoteRef: q.quote_ref, quoteDate: q.quote_date || "",
  validTill: q.valid_till || "", deliveryDays: q.delivery_days ?? "", paymentTerms: q.payment_terms,
  freight: Number(q.freight) || 0, otherCharges: Number(q.other_charges) || 0, remarks: q.remarks,
  items: (q.items || []).map(i => ({ itemId: i.item_id, rate: Number(i.rate) || 0, gstPct: Number(i.gst_pct) || 0, discountPct: Number(i.discount_pct) || 0, make: i.make || "", remarks: i.remarks || "" })),
  attachments: q.attachments || [], createdBy: q.created_by_name || "", updatedBy: q.updated_by_name || "", updatedAt: q.updated_at,
});
const comparisonOut = (c) => c && ({
  id: c.id, status: c.status, reason: c.reason, note: c.note, total: Number(c.total) || 0,
  selections: (c.selections || []).map(s => ({ itemId: s.item_id, quotationId: s.quotation_id })),
  history: c.history || [], submittedBy: c.submitted_by_name || "", submittedAt: c.submitted_at,
  decidedBy: c.decided_by_name || "", decidedAt: c.decided_at,
});

/* ═══ settings: GET / PUT /api/quotations/settings ═══ */
router.get("/settings", requireAuth, async (_req, res) => {
  try { res.json({ minQuotations: await getMinQuotations() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.put("/settings", requireAuth, async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) return res.status(403).json({ error: "Only admins can change this" });
    const n = Number(req.body?.minQuotations);
    if (!Number.isInteger(n) || n < 1 || n > 10) return res.status(400).json({ error: "Minimum quotations must be 1 to 10" });
    const { error } = await supabase.from("app_settings")
      .upsert({ key: "min_quotations", value: n, updated_by_name: req.user.name || null, updated_at: new Date().toISOString() });
    if (error) throw error;
    res.json({ success: true, minQuotations: n });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ GET /api/quotations/vendors — the Vendor list, for picking ═══ */
router.get("/vendors", requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase.schema("procurement").from("vendors")
      .select("id, vendor_name, vendor_code, gstin, contact_person, mobile, email").is("deleted_at", null).order("vendor_name");
    if (error) throw error;
    res.json({ vendors: (data || []).map(v => ({ id: v.id, name: v.vendor_name || "", code: v.vendor_code || "", gstin: v.gstin || "", contact: [v.contact_person, v.mobile].filter(Boolean).join(" · "), email: v.email || "" })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ GET /api/quotations/intake/:id — quotations, comparison, approval ═══ */
router.get("/intake/:id", requireAuth, async (req, res) => {
  try {
    const r = await loadIntake(req, req.params.id);
    if (r.error) return res.status(r.status).json({ error: r.error });
    const { quotations, comparison } = await loadAll(r.intake.id);
    let request = null;
    if (comparison) {
      const { data } = await supabase.from("approval_requests").select("*").eq("document_id", comparison.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (data) {
        const level = data.flow_snapshot?.levels?.[data.current_level - 1];
        const canAct = data.status === "pending" && (req.user.role === "global_admin"
          || (level?.designations || []).some(d => (d.users || []).some(u => String(u.id) === String(req.user.id))));
        const { data: logs } = await supabase.from("approval_logs").select("*").eq("request_id", data.id).order("created_at");
        request = {
          id: data.id, status: data.status, level: data.current_level, levels: (data.flow_snapshot?.levels || []).length,
          flowName: data.flow_snapshot?.name || "", canAct,
          waitingFor: (level?.designations || []).flatMap(d => (d.users || []).map(u => u.name)).filter(Boolean),
          logs: (logs || []).map(l => ({ level: l.level_number, action: l.action, by: l.action_by_name, comments: l.comments, at: l.created_at })),
        };
      }
    }
    res.json({
      intakeStatus: r.intake.status, canQuote: OPEN_INTAKE.includes(r.intake.status),
      minQuotations: await getMinQuotations(),
      quotations: quotations.map(quoteOut), comparison: comparisonOut(comparison), request,
      calc: compute(r.intake.intake_items, quotations, comparison?.selections),
    });
  } catch (err) {
    console.error("Quotations load error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── quotation body (multipart: field "data" = JSON) → row fields ── */
const quoteFields = (d, itemIds) => ({
  quote_ref: text(d.quoteRef, 60), quote_date: isoDate(d.quoteDate), valid_till: isoDate(d.validTill),
  delivery_days: Number.isInteger(Number(d.deliveryDays)) && d.deliveryDays !== "" ? Math.max(0, Number(d.deliveryDays)) : null,
  payment_terms: text(d.paymentTerms, 200), freight: money(d.freight), other_charges: money(d.otherCharges), remarks: text(d.remarks, 500),
  items: (Array.isArray(d.items) ? d.items : [])
    .filter(i => itemIds.has(i.itemId) && Number(i.rate) > 0)
    .map(i => ({ item_id: i.itemId, rate: money(i.rate), gst_pct: pct(i.gstPct), discount_pct: pct(i.discountPct), make: text(i.make, 80), remarks: text(i.remarks, 200) })),
});
const uploadFiles = async (intakeId, files) => {
  const list = [];
  for (const [i, f] of (files || []).entries()) {
    const path = `quotations/${intakeId}/${Date.now()}_${i}_${f.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)}`;
    await uploadStorageFile(supabase, BUCKET, path, f.buffer, f.mimetype);
    list.push({ path, name: f.originalname, size: f.size, type: f.mimetype });
  }
  return list;
};
const removeFiles = async (paths) => { if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => {}); };
const parseData = (req) => { try { return JSON.parse(req.body?.data || "{}"); } catch { return {}; } };

/* ═══ POST /api/quotations/intake/:id — add a vendor's quotation ═══ */
router.post("/intake/:id", requireAuth, upload.array("files", 10), async (req, res) => {
  try {
    const r = await loadIntake(req, req.params.id);
    if (r.error) return res.status(r.status).json({ error: r.error });
    if (!OPEN_INTAKE.includes(r.intake.status)) return res.status(400).json({ error: "Quotations can be added once the intake is approved" });
    const { comparison } = await loadAll(r.intake.id);
    if (locked(comparison)) return res.status(400).json({ error: `The comparison is ${comparison.status} — quotations are locked` });
    const d = parseData(req);
    const { data: vendor } = await supabase.schema("procurement").from("vendors").select("id, vendor_name, deleted_at").eq("id", d.vendorId).maybeSingle();
    if (!vendor || vendor.deleted_at) return res.status(400).json({ error: "Pick a vendor from the Vendor list (register a new vendor first)" });
    const f = quoteFields(d, new Set(r.intake.intake_items.map(i => i.id)));
    if (!f.items.length) return res.status(400).json({ error: "Enter the rate for at least one item" });
    const { data: row, error } = await store("intake_quotations").insert({
      ...f, intake_id: r.intake.id, vendor_id: vendor.id, vendor_name: vendor.vendor_name || "",
      created_by_id: req.user.id, created_by_name: req.user.name || null, updated_by_name: req.user.name || null,
    }).select("*").single();
    if (error) return res.status(error.code === "23505" ? 409 : 500).json({ error: error.code === "23505" ? `${vendor.vendor_name} already has a quotation here — edit it` : error.message });
    if (req.files?.length) {
      const attachments = await uploadFiles(r.intake.id, req.files);
      await store("intake_quotations").update({ attachments }).eq("id", row.id);
    }
    res.json({ success: true, id: row.id });
  } catch (err) {
    console.error("Quotation create error:", err.message);
    res.status(500).json({ error: "Save failed", detail: err.message });
  }
});

/* ═══ PUT /api/quotations/:qid — edit; data.keep = attachment paths to keep ═══ */
router.put("/:qid", requireAuth, upload.array("files", 10), async (req, res) => {
  try {
    const { data: cur, error: ce } = await store("intake_quotations").select("*").eq("id", req.params.qid).maybeSingle();
    if (ce) throw ce;
    if (!cur) return res.status(404).json({ error: "Quotation not found" });
    const r = await loadIntake(req, cur.intake_id);
    if (r.error) return res.status(r.status).json({ error: r.error });
    const { comparison } = await loadAll(cur.intake_id);
    if (locked(comparison)) return res.status(400).json({ error: `The comparison is ${comparison.status} — quotations are locked` });
    const d = parseData(req);
    const f = quoteFields(d, new Set(r.intake.intake_items.map(i => i.id)));
    if (!f.items.length) return res.status(400).json({ error: "Enter the rate for at least one item" });
    const keep = Array.isArray(d.keep) ? d.keep : [];
    const kept = (cur.attachments || []).filter(a => keep.includes(a.path));
    const dropped = (cur.attachments || []).filter(a => !keep.includes(a.path)).map(a => a.path);
    const added = await uploadFiles(cur.intake_id, req.files);
    const { error } = await store("intake_quotations").update({
      ...f, attachments: [...kept, ...added], updated_by_name: req.user.name || null, updated_at: new Date().toISOString(),
    }).eq("id", cur.id);
    if (error) { await removeFiles(added.map(a => a.path)); throw error; }
    await removeFiles(dropped);
    res.json({ success: true });
  } catch (err) {
    console.error("Quotation update error:", err.message);
    res.status(500).json({ error: "Save failed", detail: err.message });
  }
});

/* ═══ DELETE /api/quotations/:qid ═══ */
router.delete("/:qid", requireAuth, async (req, res) => {
  try {
    const { data: cur } = await store("intake_quotations").select("*").eq("id", req.params.qid).maybeSingle();
    if (!cur) return res.status(404).json({ error: "Quotation not found" });
    const r = await loadIntake(req, cur.intake_id);
    if (r.error) return res.status(r.status).json({ error: r.error });
    const { comparison } = await loadAll(cur.intake_id);
    if (locked(comparison)) return res.status(400).json({ error: `The comparison is ${comparison.status} — quotations are locked` });
    const { error } = await store("intake_quotations").delete().eq("id", cur.id);
    if (error) throw error;
    await removeFiles((cur.attachments || []).map(a => a.path));
    // a chosen line pointing at it goes back to unchosen
    if (comparison) {
      await store("intake_comparisons").update({ selections: (comparison.selections || []).filter(s => s.quotation_id !== cur.id) }).eq("id", comparison.id);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Quotation delete error:", err.message);
    res.status(500).json({ error: "Delete failed", detail: err.message });
  }
});

/* ═══ GET /api/quotations/:qid/files — signed links ═══ */
router.get("/:qid/files", requireAuth, async (req, res) => {
  try {
    const { data: cur } = await store("intake_quotations").select("intake_id, attachments").eq("id", req.params.qid).maybeSingle();
    if (!cur) return res.status(404).json({ error: "Quotation not found" });
    const r = await loadIntake(req, cur.intake_id);
    if (r.error) return res.status(r.status).json({ error: r.error });
    const files = await Promise.all((cur.attachments || []).map(async a => ({ ...a, url: await createSignedStorageUrl(supabase, BUCKET, a.path, 3600) })));
    res.json({ files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══ PUT /api/quotations/intake/:id/comparison — save the picks (draft) ═══ */
router.put("/intake/:id/comparison", requireAuth, async (req, res) => {
  try {
    const r = await loadIntake(req, req.params.id);
    if (r.error) return res.status(r.status).json({ error: r.error });
    const { quotations, comparison } = await loadAll(r.intake.id);
    if (locked(comparison)) return res.status(400).json({ error: `The comparison is ${comparison.status}` });
    const itemIds = new Set(r.intake.intake_items.map(i => i.id));
    const quoteIds = new Set(quotations.map(q => q.id));
    const selections = (Array.isArray(req.body?.selections) ? req.body.selections : [])
      .filter(s => itemIds.has(s.itemId) && quoteIds.has(s.quotationId))
      .map(s => ({ item_id: s.itemId, quotation_id: s.quotationId }));
    const calc = compute(r.intake.intake_items, quotations, selections);
    const row = {
      intake_id: r.intake.id, selections, reason: text(req.body?.reason, 500), note: text(req.body?.note, 500),
      total: calc.chosenTotal, status: "draft", updated_at: new Date().toISOString(),
    };
    const { error } = comparison
      ? await store("intake_comparisons").update(row).eq("id", comparison.id)
      : await store("intake_comparisons").insert(row);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Comparison save error:", err.message);
    res.status(500).json({ error: "Save failed", detail: err.message });
  }
});

/* Called by routes/approvalFlows.js before a comparison goes for approval:
   enough quotations, every item has a vendor, a reason when not all L1.
   Returns { error } or { comparison, document } (document for flow conditions). */
const prepareForApproval = async (comparisonId) => {
  const { data: comparison } = await store("intake_comparisons").select("*").eq("id", comparisonId).maybeSingle();
  if (!comparison) return { error: "Comparison not found" };
  if (locked(comparison)) return { error: `The comparison is already ${comparison.status}` };
  const { data: intake } = await store("intakes").select("*, intake_items(*)").eq("id", comparison.intake_id).maybeSingle();
  const { quotations } = await loadAll(comparison.intake_id);
  const min = await getMinQuotations();
  if (quotations.length < min) return { error: `At least ${min} quotations are needed — there ${quotations.length === 1 ? "is" : "are"} ${quotations.length}` };
  const calc = compute(intake.intake_items || [], quotations, comparison.selections);
  const missing = calc.lines.filter(l => !l.chosen).length;
  if (missing) return { error: `Pick a vendor for every item — ${missing} not picked` };
  if (!calc.allL1 && !String(comparison.reason || "").trim()) return { error: "Some items don't go to the lowest (L1) — write the reason" };
  return { comparison, intake, quotations, calc, document: { total: calc.chosenTotal, site_id: intake.site_id, priority: intake.priority } };
};
// after it's sent / decided
const markComparison = async (comparisonId, patch, entry) => {
  const { data: c } = await store("intake_comparisons").select("history").eq("id", comparisonId).maybeSingle();
  await store("intake_comparisons").update({ ...patch, history: [...(c?.history || []), { ...entry, at: new Date().toISOString() }], updated_at: new Date().toISOString() }).eq("id", comparisonId);
};

module.exports = router;
module.exports.prepareForApproval = prepareForApproval;
module.exports.markComparison = markComparison;
