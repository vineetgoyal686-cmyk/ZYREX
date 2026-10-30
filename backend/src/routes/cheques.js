const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase = require("../helpers/supabaseHelper");
const { requirePerm } = require("../helpers/permHelper");
const { userIdFrom } = require("../helpers/projectScope");
const { companyIdFrom } = require("../helpers/companyScope");
const { uploadStorageFile, createSignedStorageUrl } = require("../helpers/storageHelper");

/*
 * Finance › Cheque Register (sql/cheque_register.sql) — cheques the company
 * gives (issued) or gets (received), their status and attachments.
 * Files live in the private "cheques" bucket under <cheque id>/.
 */

const MOD = "expenses_cheque_record";
const BUCKET = "cheques";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 10 } });
const table = () => supabase.from("cheque_records");
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST
const isoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null;
const text = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const UUID = /^[0-9a-f-]{36}$/i;

const STATUSES = ["Pending", "Handed Over", "Deposited", "Cleared", "Bounced", "Cancelled", "Stopped"];
const TYPES = ["account_payee", "bearer", "self"];

const out = (r) => ({
  id: r.id, companyId: r.company_id, placeKind: r.place_kind || "", placeId: r.place_id || "", placeCode: r.place_code || "",
  direction: r.direction, chequeNo: r.cheque_no, chequeDate: r.cheque_date, amount: Number(r.amount) || 0,
  partyName: r.party_name, bankName: r.bank_name, accountNo: r.account_no, chequeType: r.cheque_type,
  purpose: r.purpose, reference: r.reference, status: r.status, statusDate: r.status_date || "",
  handedTo: r.handed_to, bounceReason: r.bounce_reason, remarks: r.remarks,
  statusHistory: r.status_history || [],
  attachments: (r.attachments || []).map(a => ({ path: a.path, name: a.name, size: a.size, type: a.type })),
  createdBy: r.created_by_name || "", createdAt: r.created_at, updatedBy: r.updated_by_name || "", updatedAt: r.updated_at,
});

// form body → row fields (multipart: every value is a string)
const fieldsFrom = (b) => {
  const direction = b.direction === "received" ? "received" : "issued";
  return {
    direction,
    cheque_no: text(b.chequeNo, 20).replace(/\s+/g, ""),
    cheque_date: isoDate(b.chequeDate),
    amount: Math.round(Number(b.amount) * 100) / 100,
    party_name: text(b.partyName, 150),
    bank_name: text(b.bankName, 100),
    account_no: text(b.accountNo, 30),
    cheque_type: TYPES.includes(b.chequeType) ? b.chequeType : "account_payee",
    purpose: text(b.purpose, 300),
    reference: text(b.reference, 100),
    handed_to: text(b.handedTo, 100),
    remarks: text(b.remarks, 500),
    place_kind: ["project", "office"].includes(b.placeKind) && UUID.test(String(b.placeId || "")) ? b.placeKind : null,
    place_id: ["project", "office"].includes(b.placeKind) && UUID.test(String(b.placeId || "")) ? b.placeId : null,
    place_code: text(b.placeCode, 40),
  };
};
const check = (f) => {
  if (!f.cheque_no) return "Cheque number is required";
  if (!/^\d{6}$/.test(f.cheque_no)) return "Cheque number is 6 digits";
  if (!f.cheque_date) return "Cheque date is required";
  if (!(f.amount > 0)) return "Amount must be more than 0";
  if (!f.party_name) return f.direction === "issued" ? "Paid to (party) is required" : "Received from (party) is required";
  if (!f.bank_name) return "Bank is required";
  return null;
};

const uploadFiles = async (id, files) => {
  const list = [];
  for (const [i, f] of (files || []).entries()) {
    const safe = f.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${id}/${Date.now()}_${i}_${safe}`;
    await uploadStorageFile(supabase, BUCKET, path, f.buffer, f.mimetype);
    list.push({ path, name: f.originalname, size: f.size, type: f.mimetype });
  }
  return list;
};
const removeFiles = async (paths) => {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
};
const dupError = (err) => err?.code === "23505" ? "This cheque number is already recorded for this bank" : null;

/* ═══ GET /api/cheques/scopes — companies with their projects / offices ═══ */
router.get("/scopes", requirePerm(MOD, "can_view"), async (req, res) => {
  try {
    const [c, p, b] = await Promise.all([
      supabase.schema("organisation").from("companies").select("id, company_code, company_name, status").order("company_name"),
      supabase.from("projects").select("id, company_id, project_code, project_name, is_active").not("company_id", "is", null).order("project_name"),
      supabase.schema("organisation").from("branches").select("id, company_id, code, label, status").order("label"),
    ]);
    for (const r of [c, p, b]) if (r.error) throw r.error;
    res.json({
      companies: c.data.filter(x => String(x.status || "active").toLowerCase() === "active")
        .map(x => ({ id: x.id, code: x.company_code || "", name: x.company_name || "" })),
      places: [
        ...p.data.filter(x => x.is_active !== false).map(x => ({ kind: "project", id: x.id, companyId: x.company_id, code: x.project_code || "", name: x.project_name || "" })),
        ...b.data.filter(x => String(x.status || "active").toLowerCase() === "active").map(x => ({ kind: "office", id: x.id, companyId: x.company_id, code: x.code || "", name: x.label || "" })),
      ],
    });
  } catch (err) {
    console.error("Cheque scopes error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══ GET /api/cheques?company_id= — every cheque of the company ═══ */
router.get("/", requirePerm(MOD, "can_view"), async (req, res) => {
  try {
    const companyId = companyIdFrom(req.query);
    if (!companyId) return res.status(400).json({ error: "Pick a company" });
    let rows = [], i = 0;
    for (;;) {
      const { data, error } = await table().select("*").eq("company_id", companyId)
        .order("cheque_date", { ascending: false }).order("created_at", { ascending: false }).range(i, i + 999);
      if (error) throw error;
      rows = rows.concat(data || []);
      if (!data || data.length < 1000) break;
      i += 1000;
    }
    res.json({ today: today(), cheques: rows.map(out) });
  } catch (err) {
    console.error("Cheque list error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══ GET /api/cheques/:id/files — signed links to the attachments ═══ */
router.get("/:id/files", requirePerm(MOD, "can_view"), async (req, res) => {
  try {
    const { data: r, error } = await table().select("attachments").eq("id", req.params.id).maybeSingle();
    if (error) throw error;
    if (!r) return res.status(404).json({ error: "Cheque not found" });
    const files = await Promise.all((r.attachments || []).map(async a => ({
      ...a, url: await createSignedStorageUrl(supabase, BUCKET, a.path, 60 * 60),
    })));
    res.json({ files });
  } catch (err) {
    console.error("Cheque files error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══ POST /api/cheques — multipart: fields + files[] ═══ */
router.post("/", requirePerm(MOD, "can_add"), upload.array("files", 10), async (req, res) => {
  try {
    const b = req.body || {};
    const companyId = companyIdFrom(b);
    if (!companyId) return res.status(400).json({ error: "Pick a company" });
    const f = fieldsFrom(b);
    const bad = check(f);
    if (bad) return res.status(400).json({ error: bad });
    const by = text(b.byName, 100) || null;
    const status = f.direction === "issued" && f.handed_to ? "Handed Over" : "Pending";
    const { data: row, error } = await table().insert({
      ...f, company_id: companyId, status, status_date: status === "Pending" ? null : today(),
      status_history: [{ status, date: today(), note: "Recorded", by, at: new Date().toISOString() }],
      created_by_id: userIdFrom(req) || null, created_by_name: by, updated_by_name: by,
    }).select("*").single();
    if (error) return res.status(dupError(error) ? 409 : 500).json({ error: dupError(error) || error.message });

    if (req.files?.length) {
      const attachments = await uploadFiles(row.id, req.files);
      const { data: done, error: ue } = await table().update({ attachments }).eq("id", row.id).select("*").single();
      if (ue) throw ue;
      return res.json({ success: true, cheque: out(done) });
    }
    res.json({ success: true, cheque: out(row) });
  } catch (err) {
    console.error("Cheque create error:", err.message);
    res.status(500).json({ error: "Save failed", detail: err.message });
  }
});

/* ═══ POST /api/cheques/bulk — many cheques from an Excel sheet
   body { company_id, rows: [{ …form fields, placeCode, status, statusDate, bounceReason }], byName }
   Each row is checked like the form; bad / duplicate rows are skipped. ═══ */
router.post("/bulk", requirePerm(MOD, "can_add"), async (req, res) => {
  try {
    const b = req.body || {};
    const companyId = companyIdFrom(b);
    if (!companyId) return res.status(400).json({ error: "Pick a company" });
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 1000) : [];
    if (!rows.length) return res.status(400).json({ error: "Nothing to save" });
    const [p, o] = await Promise.all([
      supabase.from("projects").select("id, project_code").eq("company_id", companyId),
      supabase.schema("organisation").from("branches").select("id, code").eq("company_id", companyId),
    ]);
    const places = new Map([
      ...(p.data || []).map(x => [String(x.project_code || "").toLowerCase(), { kind: "project", id: x.id, code: x.project_code }]),
      ...(o.data || []).map(x => [String(x.code || "").toLowerCase(), { kind: "office", id: x.id, code: x.code }]),
    ]);
    const by = text(b.byName, 100) || null;
    const uid = userIdFrom(req) || null;
    const now = new Date().toISOString();
    let saved = 0;
    const skipped = [];
    for (const [i, r] of rows.entries()) {
      const label = `Row ${r.line || i + 2}${r.chequeNo ? ` · ${r.chequeNo}` : ""}`;
      const place = r.placeCode ? places.get(String(r.placeCode).trim().toLowerCase()) : null;
      if (r.placeCode && !place) { skipped.push({ label, reason: `No project / office "${r.placeCode}" in this company` }); continue; }
      const f = fieldsFrom({ ...r, placeKind: place?.kind, placeId: place?.id, placeCode: place?.code });
      const bad = check(f);
      if (bad) { skipped.push({ label, reason: bad }); continue; }
      const status = STATUSES.includes(r.status) ? r.status : "Pending";
      if (status === "Bounced" && !text(r.bounceReason)) { skipped.push({ label, reason: "Bounced needs a bounce reason" }); continue; }
      const statusDate = status === "Pending" ? null : (isoDate(r.statusDate) || f.cheque_date);
      const history = [{ status: "Pending", date: f.cheque_date, note: "Bulk upload", by, at: now }];
      if (status !== "Pending") history.push({ status, date: statusDate, note: text(r.bounceReason, 300), by, at: now });
      const { error } = await table().insert({
        ...f, company_id: companyId, status, status_date: statusDate,
        bounce_reason: status === "Bounced" ? text(r.bounceReason, 300) : "",
        status_history: history, created_by_id: uid, created_by_name: by, updated_by_name: by,
      });
      if (error) { skipped.push({ label, reason: dupError(error) || error.message }); continue; }
      saved++;
    }
    res.json({ success: true, saved, skipped });
  } catch (err) {
    console.error("Cheque bulk error:", err.message);
    res.status(500).json({ error: "Upload failed", detail: err.message });
  }
});

/* ═══ PUT /api/cheques/:id — edit details; body.keep = JSON list of
   attachment paths to keep, files[] = new ones ═══ */
router.put("/:id", requirePerm(MOD, "can_edit"), upload.array("files", 10), async (req, res) => {
  try {
    const b = req.body || {};
    const { data: cur, error: ce } = await table().select("*").eq("id", req.params.id).maybeSingle();
    if (ce) throw ce;
    if (!cur) return res.status(404).json({ error: "Cheque not found" });
    const f = fieldsFrom(b);
    const bad = check(f);
    if (bad) return res.status(400).json({ error: bad });

    let keep = [];
    try { keep = JSON.parse(b.keep || "[]"); } catch { keep = []; }
    const kept = (cur.attachments || []).filter(a => keep.includes(a.path));
    const dropped = (cur.attachments || []).filter(a => !keep.includes(a.path)).map(a => a.path);
    const added = await uploadFiles(cur.id, req.files);
    if (kept.length + added.length > 10) return res.status(400).json({ error: "Up to 10 attachments per cheque" });

    const { data, error } = await table().update({
      ...f, attachments: [...kept, ...added],
      updated_by_name: text(b.byName, 100) || null, updated_at: new Date().toISOString(),
    }).eq("id", cur.id).select("*").single();
    if (error) {
      await removeFiles(added.map(a => a.path));
      return res.status(dupError(error) ? 409 : 500).json({ error: dupError(error) || error.message });
    }
    await removeFiles(dropped);
    res.json({ success: true, cheque: out(data) });
  } catch (err) {
    console.error("Cheque update error:", err.message);
    res.status(500).json({ error: "Save failed", detail: err.message });
  }
});

/* ═══ PATCH /api/cheques/:id/status — { status, date, note, bounceReason } ═══ */
router.patch("/:id/status", requirePerm(MOD, "can_edit"), async (req, res) => {
  try {
    const b = req.body || {};
    if (!STATUSES.includes(b.status)) return res.status(400).json({ error: "Unknown status" });
    const date = isoDate(b.date) || today();
    if (date > today()) return res.status(400).json({ error: "Status date can't be in the future" });
    if (b.status === "Bounced" && !text(b.bounceReason)) return res.status(400).json({ error: "Write why it bounced" });
    const { data: cur, error: ce } = await table().select("id, status_history").eq("id", req.params.id).maybeSingle();
    if (ce) throw ce;
    if (!cur) return res.status(404).json({ error: "Cheque not found" });
    const by = text(b.byName, 100) || null;
    const { data, error } = await table().update({
      status: b.status, status_date: date,
      bounce_reason: b.status === "Bounced" ? text(b.bounceReason, 300) : "",
      ...(b.handedTo !== undefined ? { handed_to: text(b.handedTo, 100) } : {}),
      status_history: [...(cur.status_history || []), { status: b.status, date, note: text(b.note || b.bounceReason, 300), by, at: new Date().toISOString() }],
      updated_by_name: by, updated_at: new Date().toISOString(),
    }).eq("id", cur.id).select("*").single();
    if (error) throw error;
    res.json({ success: true, cheque: out(data) });
  } catch (err) {
    console.error("Cheque status error:", err.message);
    res.status(500).json({ error: "Save failed", detail: err.message });
  }
});

/* ═══ DELETE /api/cheques/:id — the record and its files ═══ */
router.delete("/:id", requirePerm(MOD, "can_delete"), async (req, res) => {
  try {
    const { data, error } = await table().delete().eq("id", req.params.id).select("attachments");
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: "Cheque not found" });
    await removeFiles((data[0].attachments || []).map(a => a.path));
    res.json({ success: true });
  } catch (err) {
    console.error("Cheque delete error:", err.message);
    res.status(500).json({ error: "Delete failed", detail: err.message });
  }
});

module.exports = router;
