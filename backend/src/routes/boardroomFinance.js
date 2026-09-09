// Boardroom → Finance: a fully separate, executive-only payment/receipt
// ledger. Deliberately isolated from finance_track_entries (Master Data >
// Finance) — its own table, its own "boardroom" storage bucket, and its own
// saved-values history so a Site/Company/Vendor/Paid To/Purpose value typed
// here never leaks into Procurement, Orders, or the plain Finance Track tab.
const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase = require("../helpers/supabaseHelper");
const { uploadStorageFile, createSignedStorageUrl } = require("../helpers/storageHelper");
const { requirePerm } = require("../helpers/permHelper");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const BUCKET = "boardroom";
const signDoc = (value) => createSignedStorageUrl(supabase, BUCKET, value);

// Site/Company/Vendor/Purpose/Paid-To/Paid-From all moved to their own
// dedicated "+ Add New" popups (see quick-sites/quick-companies/quick-vendors
// and coded-values below) — only these two plain fields still use the
// simple "type it once, recall it next time" mechanic.
const SAVED_FIELD_KEYS = ["account_holder_name"];
// Purpose and the two account-number fields get a system-assigned sequential
// code alongside the value the board member enters — shown together in the
// dropdown ("PUR-3 — Site maintenance") purely as a lookup aid; only the
// plain value is ever stored on the entry itself.
const CODED_FIELD_KEYS = { purpose: "PUR", account_no_to: "ACC", account_no_from: "ACC" };
const CUSTOM_FIELD_COLS = { 1: "custom_field_1", 2: "custom_field_2", 3: "custom_field_3", 4: "custom_field_4", 5: "custom_field_5" };

const mapEntry = async (r) => ({
  id:                r.id,
  entryType:         r.entry_type,
  entryDate:         r.entry_date,
  siteName:          r.site_name || "",
  companyName:       r.company_name || "",
  partyName:         r.party_name || "",
  description:       r.description || "",
  amount:            Number(r.amount) || 0,
  accountNoTo:       r.account_no_to || "",
  accountNoFrom:     r.account_no_from || "",
  accountHolderName: r.account_holder_name || "",
  purpose:           r.purpose || "",
  remarks:           r.remarks || "",
  customField1:      r.custom_field_1 || "",
  customField2:      r.custom_field_2 || "",
  customField3:      r.custom_field_3 || "",
  customField4:      r.custom_field_4 || "",
  customField5:      r.custom_field_5 || "",
  documentUrls:      await Promise.all((r.document_urls || []).map(signDoc)),
  createdAt:         r.created_at,
  createdByName:     r.created_by_name || "",
  updatedAt:         r.updated_at,
});

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

// Remembers whatever the user actually typed/picked for the smart fields —
// this is the entire "fill it once, pick it from a list next time" mechanic.
const rememberFieldValues = async (fields) => {
  const rows = SAVED_FIELD_KEYS
    .map(key => ({ field_key: key, value: String(fields[key] || "").trim() }))
    .filter(r => r.value);
  if (!rows.length) return;
  await supabase.from("boardroom_finance_saved_values").upsert(rows, { onConflict: "field_key,value", ignoreDuplicates: true });
};

/* GET /api/boardroom/finance/entries */
router.get("/entries", requirePerm("boardroom", "can_view"), async (req, res) => {
  try {
    const { entryType, search, dateFrom, dateTo } = req.query;
    let query = supabase.from("boardroom_finance_entries").select("*").is("deleted_at", null);
    if (entryType) query = query.eq("entry_type", entryType);
    if (dateFrom)  query = query.gte("entry_date", dateFrom);
    if (dateTo)    query = query.lte("entry_date", dateTo);

    const { data, error } = await query.order("entry_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;

    let rows = data || [];
    if (search) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(r =>
        [r.party_name, r.description, r.site_name, r.company_name, r.account_no_to, r.account_no_from, r.account_holder_name, r.purpose, r.remarks]
          .some(v => String(v || "").toLowerCase().includes(s))
      );
    }

    const entries = await Promise.all(rows.map(mapEntry));
    res.json({ entries });
  } catch (err) {
    console.error("Boardroom finance read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/boardroom/finance/field-values?field=site_name */
router.get("/field-values", requirePerm("boardroom", "can_view"), async (req, res) => {
  try {
    const field = String(req.query.field || "");
    if (!SAVED_FIELD_KEYS.includes(field)) return res.status(400).json({ error: "Invalid field" });
    const { data, error } = await supabase
      .from("boardroom_finance_saved_values")
      .select("value").eq("field_key", field).order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ values: (data || []).map(r => r.value) });
  } catch (err) {
    console.error("Boardroom finance field-values error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/boardroom/finance/seed-options — read-only names from the global
   projects/companies/vendors tables, shown as starter suggestions only.
   Never written back to. */
// Same "city, state" extraction EntitySelect uses for vendor addresses — a
// raw address is one long string, this pulls just the last two comma parts
// and drops a bare pincode token.
const cleanText = (v) => String(v || "").trim().replace(/^["']|["']$/g, "");
const extractCityState = (addr) => {
  const raw = cleanText(addr);
  if (!raw) return "";
  const parts = raw.split(",").map(p => p.trim()).filter(Boolean).filter(p => !/^\d{5,6}$/.test(p));
  if (parts.length === 0) return "";
  const state = parts[parts.length - 1] || "";
  const city = parts[parts.length - 2] || "";
  return [city, state].filter(Boolean).join(", ") || state || city || "";
};

router.get("/seed-options", requirePerm("boardroom", "can_view"), async (_req, res) => {
  try {
    const [{ data: sites }, { data: companies }, { data: vendors }, { data: quickSites }, { data: quickCompanies }, { data: quickVendors }] = await Promise.all([
      supabase.from("projects").select("project_name, project_code, city, state"),
      supabase.schema("organisation").from("companies").select("company_name, company_code, gstin"),
      supabase.schema("procurement").from("vendors").select("vendor_name, address").is("deleted_at", null),
      supabase.from("boardroom_finance_quick_sites").select("*").order("created_at", { ascending: false }),
      supabase.from("boardroom_finance_quick_companies").select("*").order("created_at", { ascending: false }),
      supabase.from("boardroom_finance_quick_vendors").select("*").order("created_at", { ascending: false }),
    ]);
    res.json({
      sites: [
        ...(sites || []).filter(s => s.project_name).map(s => ({
          name: s.project_name, sub: [s.city, s.state].filter(Boolean).join(", "), code: s.project_code || "",
        })),
        // Board-member-added sites/companies — isolated to this tab, never in
        // the real `projects`/`companies` tables.
        ...(quickSites || []).map(s => ({
          name: s.name, sub: [s.state, s.address].filter(Boolean).join(" · "), code: s.code || "",
        })),
      ],
      companies: [
        ...(companies || []).filter(c => c.company_name).map(c => ({
          name: c.company_name, sub: [c.company_code, c.gstin].filter(Boolean).join(" · "),
        })),
        ...(quickCompanies || []).map(c => ({
          name: c.name, sub: [c.code, c.gstin, c.address].filter(Boolean).join(" · "),
        })),
      ],
      vendors: [
        ...(vendors || []).filter(v => v.vendor_name).map(v => ({
          name: v.vendor_name, sub: extractCityState(v.address),
        })),
        ...(quickVendors || []).map(v => ({
          name: v.name, sub: [v.state, v.contact_name, v.contact_number].filter(Boolean).join(" · "),
        })),
      ],
    });
  } catch (err) {
    console.error("Boardroom finance seed-options error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/boardroom/finance/quick-sites — board-member-added site, kept
   isolated to this tab (never written to the real `projects` table). */
router.post("/quick-sites", requirePerm("boardroom", "can_add"), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Site name is required" });

    const { data, error } = await supabase
      .from("boardroom_finance_quick_sites")
      .insert({
        name,
        code:    String(req.body.code || "").trim(),
        state:   String(req.body.state || "").trim(),
        address: String(req.body.address || "").trim(),
      })
      .select("*")
      .single();
    if (error) throw error;

    res.json({ site: data });
  } catch (err) {
    console.error("Boardroom quick-site create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/boardroom/finance/quick-companies — board-member-added company,
   kept isolated to this tab (never written to the real `companies` table). */
router.post("/quick-companies", requirePerm("boardroom", "can_add"), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Company name is required" });

    const { data, error } = await supabase
      .from("boardroom_finance_quick_companies")
      .insert({
        name,
        code:    String(req.body.code || "").trim(),
        gstin:   String(req.body.gstin || "").trim(),
        address: String(req.body.address || "").trim(),
      })
      .select("*")
      .single();
    if (error) throw error;

    res.json({ company: data });
  } catch (err) {
    console.error("Boardroom quick-company create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/boardroom/finance/quick-vendors — board-member-added vendor,
   kept isolated to this tab (never written to the real `vendors` table). */
router.post("/quick-vendors", requirePerm("boardroom", "can_add"), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Firm name is required" });

    const { data, error } = await supabase
      .from("boardroom_finance_quick_vendors")
      .insert({
        name,
        state:           String(req.body.state || "").trim(),
        address:         String(req.body.address || "").trim(),
        contact_name:    String(req.body.contactName || "").trim(),
        contact_number:  String(req.body.contactNumber || "").trim(),
      })
      .select("*")
      .single();
    if (error) throw error;

    res.json({ vendor: data });
  } catch (err) {
    console.error("Boardroom quick-vendor create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/boardroom/finance/coded-values?field=purpose */
router.get("/coded-values", requirePerm("boardroom", "can_view"), async (req, res) => {
  try {
    const field = String(req.query.field || "");
    if (!CODED_FIELD_KEYS[field]) return res.status(400).json({ error: "Invalid field" });
    const { data, error } = await supabase
      .from("boardroom_finance_coded_values")
      .select("code, value").eq("field_key", field).order("code", { ascending: false });
    if (error) throw error;
    res.json({ values: data || [] });
  } catch (err) {
    console.error("Boardroom coded-values read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/boardroom/finance/coded-values — body: { field, value }.
   Assigns the next sequential code for that field (PUR-1, PUR-2, … /
   ACC-1, ACC-2, … — independent counters per field). */
router.post("/coded-values", requirePerm("boardroom", "can_add"), async (req, res) => {
  try {
    const field = String(req.body.field || "");
    const prefix = CODED_FIELD_KEYS[field];
    if (!prefix) return res.status(400).json({ error: "Invalid field" });
    const value = String(req.body.value || "").trim();
    if (!value) return res.status(400).json({ error: "Value is required" });

    const { data: last } = await supabase
      .from("boardroom_finance_coded_values")
      .select("code").eq("field_key", field).order("code", { ascending: false }).limit(1).maybeSingle();
    const nextCode = (last?.code || 0) + 1;

    const { data, error } = await supabase
      .from("boardroom_finance_coded_values")
      .insert({ field_key: field, code: nextCode, value })
      .select("code, value")
      .single();
    if (error) throw error;

    res.json({ code: data.code, value: data.value, display: `${prefix}-${data.code}` });
  } catch (err) {
    console.error("Boardroom coded-values create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/boardroom/finance/custom-columns */
router.get("/custom-columns", requirePerm("boardroom", "can_view"), async (_req, res) => {
  try {
    const { data, error } = await supabase.from("boardroom_finance_custom_columns").select("*").order("slot");
    if (error) throw error;
    res.json({ columns: (data || []).map(c => ({ slot: c.slot, label: c.label || "", isActive: !!c.is_active })) });
  } catch (err) {
    console.error("Boardroom custom-columns read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/boardroom/finance/custom-columns/:slot — body: { label } */
router.put("/custom-columns/:slot", requirePerm("boardroom", "can_add"), async (req, res) => {
  try {
    const slot = Number(req.params.slot);
    if (!CUSTOM_FIELD_COLS[slot]) return res.status(400).json({ error: "Invalid column slot" });
    const label = String(req.body.label || "").trim();
    if (!label) return res.status(400).json({ error: "Column name is required" });

    const { error } = await supabase
      .from("boardroom_finance_custom_columns")
      .update({ label, is_active: true, updated_at: new Date().toISOString() })
      .eq("slot", slot);
    if (error) throw error;
    res.json({ success: true, slot, label, isActive: true });
  } catch (err) {
    console.error("Boardroom custom-columns update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/boardroom/finance/custom-columns/:slot — clears the column
   and wipes its values off every entry. */
router.delete("/custom-columns/:slot", requirePerm("boardroom", "can_delete"), async (req, res) => {
  try {
    const slot = Number(req.params.slot);
    const col = CUSTOM_FIELD_COLS[slot];
    if (!col) return res.status(400).json({ error: "Invalid column slot" });

    const { error: colErr } = await supabase
      .from("boardroom_finance_custom_columns")
      .update({ label: null, is_active: false, updated_at: new Date().toISOString() })
      .eq("slot", slot);
    if (colErr) throw colErr;

    const { error: dataErr } = await supabase.from("boardroom_finance_entries").update({ [col]: null }).not("id", "is", null);
    if (dataErr) throw dataErr;

    res.json({ success: true });
  } catch (err) {
    console.error("Boardroom custom-columns delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/boardroom/finance/entries */
router.post("/entries", requirePerm("boardroom", "can_add"), upload.any(), async (req, res) => {
  try {
    const {
      entryType, entryDate, siteName, companyName, partyName, description, amount,
      accountNoTo, accountNoFrom, accountHolderName, purpose, remarks,
      customField1, customField2, customField3, customField4, customField5,
    } = req.body;

    if (entryType !== "payment" && entryType !== "receipt") {
      return res.status(400).json({ error: "entryType must be 'payment' or 'receipt'" });
    }

    const { data: created, error: insertError } = await supabase
      .from("boardroom_finance_entries")
      .insert({
        entry_type:           entryType,
        entry_date:           entryDate || null,
        site_name:            siteName || "",
        company_name:         companyName || "",
        party_name:           partyName || "",
        description:          description || "",
        amount:                Number(amount) || 0,
        account_no_to:         accountNoTo || "",
        account_no_from:       accountNoFrom || "",
        account_holder_name:   accountHolderName || "",
        purpose:               purpose || "",
        remarks:               remarks || "",
        custom_field_1:        customField1 || null,
        custom_field_2:        customField2 || null,
        custom_field_3:        customField3 || null,
        custom_field_4:        customField4 || null,
        custom_field_5:        customField5 || null,
        created_by_id:         req._authUserId || null,
        created_by_name:       req.body.createdByName || "",
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    const documentUrls = await uploadDocs(req.files, "document", `entries/${created.id}`);
    const { data: finalRow } = await supabase
      .from("boardroom_finance_entries")
      .update({ document_urls: documentUrls })
      .eq("id", created.id)
      .select("*")
      .single();

    await rememberFieldValues({ account_holder_name: accountHolderName });

    res.json({ entry: await mapEntry(finalRow) });
  } catch (err) {
    console.error("Boardroom finance create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/boardroom/finance/entries/:id */
router.put("/entries/:id", requirePerm("boardroom", "can_edit"), upload.any(), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      entryType, entryDate, siteName, companyName, partyName, description, amount,
      accountNoTo, accountNoFrom, accountHolderName, purpose, remarks,
      customField1, customField2, customField3, customField4, customField5,
    } = req.body;

    if (entryType !== "payment" && entryType !== "receipt") {
      return res.status(400).json({ error: "entryType must be 'payment' or 'receipt'" });
    }

    const keepDocs = parseJsonField(req.body.documentKeep);
    const newDocs  = await uploadDocs(req.files, "document", `entries/${id}`);

    const { data: updated, error } = await supabase
      .from("boardroom_finance_entries")
      .update({
        entry_type:           entryType,
        entry_date:           entryDate || null,
        site_name:            siteName || "",
        company_name:         companyName || "",
        party_name:           partyName || "",
        description:          description || "",
        amount:                Number(amount) || 0,
        account_no_to:         accountNoTo || "",
        account_no_from:       accountNoFrom || "",
        account_holder_name:   accountHolderName || "",
        purpose:               purpose || "",
        remarks:               remarks || "",
        custom_field_1:        customField1 || null,
        custom_field_2:        customField2 || null,
        custom_field_3:        customField3 || null,
        custom_field_4:        customField4 || null,
        custom_field_5:        customField5 || null,
        document_urls:         [...keepDocs, ...newDocs],
        updated_at:            new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await rememberFieldValues({ account_holder_name: accountHolderName });

    res.json({ entry: await mapEntry(updated) });
  } catch (err) {
    console.error("Boardroom finance update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/boardroom/finance/entries/:id — soft delete */
router.delete("/entries/:id", requirePerm("boardroom", "can_delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("boardroom_finance_entries")
      .update({
        deleted_at:      new Date().toISOString(),
        deleted_by_id:   req._authUserId || null,
        deleted_by_name: req.body?.deletedByName || "",
      })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Boardroom finance delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
