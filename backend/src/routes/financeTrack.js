// Master Data → Finance → Track: a general payment/receipt ledger, kept as
// its own file/table like Site Expenses, fully separate from Payments Track.
const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase = require("../helpers/supabaseHelper");
const { uploadStorageFile, createSignedStorageUrl } = require("../helpers/storageHelper");
const { requirePerm } = require("../helpers/permHelper");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const BUCKET = "finance-docs";
const signDoc = (value) => createSignedStorageUrl(supabase, BUCKET, value);

const mapEntry = async (r) => ({
  id:                r.id,
  entryType:         r.entry_type,
  entryDate:         r.entry_date,
  siteId:            r.site_id,
  siteName:          r.site_name || "",
  companyId:         r.company_id,
  companyName:       r.company_name || "",
  partyName:         r.party_name || "",
  description:       r.description || "",
  amount:            Number(r.amount) || 0,
  accountNoTo:       r.account_no_to || "",
  accountNoFrom:     r.account_no_from || "",
  accountHolderName: r.account_holder_name || "",
  remarks:           r.remarks || "",
  documentUrls:      await Promise.all((r.document_urls || []).map(signDoc)),
  createdAt:         r.created_at,
  createdByName:     r.created_by_name || "",
  updatedAt:         r.updated_at,
});

// Uploads every file submitted under `fieldname` — a row can attach more than
// one document — and returns their storage paths.
const uploadDocs = async (files, fieldname, pathPrefix) => {
  const matches = (files || []).filter(f => f.fieldname === fieldname);
  const paths = [];
  for (let i = 0; i < matches.length; i++) {
    const file = matches[i];
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${pathPrefix}/${Date.now()}_${i}_${safeName}`;
    await uploadStorageFile(supabase, BUCKET, path, file.buffer, file.mimetype);
    paths.push(path);
  }
  return paths;
};

const parseJsonField = (raw) => {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
};

/* GET /api/finance/track */
router.get("/track", async (req, res) => {
  try {
    const { entryType, siteId, companyId, search, dateFrom, dateTo } = req.query;

    let query = supabase.from("finance_track_entries").select("*").is("deleted_at", null);
    if (entryType) query = query.eq("entry_type", entryType);
    if (siteId)    query = query.eq("site_id", siteId);
    if (companyId) query = query.eq("company_id", companyId);
    if (dateFrom)  query = query.gte("entry_date", dateFrom);
    if (dateTo)    query = query.lte("entry_date", dateTo);

    const { data, error } = await query.order("entry_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;

    let rows = data || [];
    if (search) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(r =>
        [r.party_name, r.description, r.site_name, r.company_name, r.account_no_to, r.account_no_from, r.account_holder_name, r.remarks]
          .some(v => String(v || "").toLowerCase().includes(s))
      );
    }

    const entries = await Promise.all(rows.map(mapEntry));
    res.json({ entries });
  } catch (err) {
    console.error("Finance track read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/finance/track */
router.post("/track", requirePerm("master_data_finance", "can_add"), upload.any(), async (req, res) => {
  try {
    const {
      entryType, entryDate, siteId, siteName, companyId, companyName,
      partyName, description, amount, accountNoTo, accountNoFrom, accountHolderName, remarks,
    } = req.body;

    if (entryType !== "payment" && entryType !== "receipt") {
      return res.status(400).json({ error: "entryType must be 'payment' or 'receipt'" });
    }

    const { data: created, error: insertError } = await supabase
      .from("finance_track_entries")
      .insert({
        entry_type:           entryType,
        entry_date:           entryDate || null,
        site_id:              siteId || null,
        site_name:            siteName || "",
        company_id:           companyId || null,
        company_name:         companyName || "",
        party_name:           partyName || "",
        description:          description || "",
        amount:                Number(amount) || 0,
        account_no_to:         accountNoTo || "",
        account_no_from:       accountNoFrom || "",
        account_holder_name:   accountHolderName || "",
        remarks:               remarks || "",
        created_by_id:         req._authUserId || null,
        created_by_name:       req.body.createdByName || "",
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    const documentUrls = await uploadDocs(req.files, "document", `finance-track/${created.id}`);
    const { data: finalRow } = await supabase
      .from("finance_track_entries")
      .update({ document_urls: documentUrls })
      .eq("id", created.id)
      .select("*")
      .single();

    res.json({ entry: await mapEntry(finalRow) });
  } catch (err) {
    console.error("Finance track create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/finance/track/:id */
router.put("/track/:id", requirePerm("master_data_finance", "can_edit"), upload.any(), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      entryType, entryDate, siteId, siteName, companyId, companyName,
      partyName, description, amount, accountNoTo, accountNoFrom, accountHolderName, remarks,
    } = req.body;

    if (entryType !== "payment" && entryType !== "receipt") {
      return res.status(400).json({ error: "entryType must be 'payment' or 'receipt'" });
    }

    const keepDocs = parseJsonField(req.body.documentKeep);
    const newDocs  = await uploadDocs(req.files, "document", `finance-track/${id}`);

    const { data: updated, error } = await supabase
      .from("finance_track_entries")
      .update({
        entry_type:           entryType,
        entry_date:           entryDate || null,
        site_id:              siteId || null,
        site_name:            siteName || "",
        company_id:           companyId || null,
        company_name:         companyName || "",
        party_name:           partyName || "",
        description:          description || "",
        amount:                Number(amount) || 0,
        account_no_to:         accountNoTo || "",
        account_no_from:       accountNoFrom || "",
        account_holder_name:   accountHolderName || "",
        remarks:               remarks || "",
        document_urls:         [...keepDocs, ...newDocs],
        updated_at:            new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    res.json({ entry: await mapEntry(updated) });
  } catch (err) {
    console.error("Finance track update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/finance/track/:id — soft delete, matches other finance tables */
router.delete("/track/:id", requirePerm("master_data_finance", "can_delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("finance_track_entries")
      .update({
        deleted_at:      new Date().toISOString(),
        deleted_by_id:   req._authUserId || null,
        deleted_by_name: req.body?.deletedByName || "",
      })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Finance track delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
