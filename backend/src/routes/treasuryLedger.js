// Treasury › Party Ledger: a fully separate, executive-only payment/receipt
// ledger — its own table, its own storage bucket ("boardroom", the name it
// was created with — Supabase buckets can't be renamed), and its own
// saved-values history so a Site/Company/Vendor/Paid To/Purpose value typed
// here never leaks into Procurement or Orders.
const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase = require("../helpers/supabaseHelper");
const { uploadStorageFile, createSignedStorageUrl } = require("../helpers/storageHelper");
const { requirePerm } = require("../helpers/permHelper");
const { niceName } = require("../helpers/niceName");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const BUCKET = "boardroom";
const signDoc = (value) => createSignedStorageUrl(supabase, BUCKET, value);

// Projects / companies / parties and their bank accounts now live in
// Treasury › Masters (routes/treasuryMasters.js); Purpose is the coded list
// below. Only the account holder name still uses the simple "type it once,
// recall it next time" mechanic.
const SAVED_FIELD_KEYS = ["account_holder_name"];
// Purpose and the two account-number fields get a system-assigned sequential
// code alongside the value the board member enters — shown together in the
// dropdown ("PUR-3 — Site maintenance") purely as a lookup aid; only the
// plain value is ever stored on the entry itself.
// Category is shown with its code as CAT-n
const CODED_FIELD_KEYS = { category: "CAT", account_no_to: "ACC", account_no_from: "ACC" };
const CUSTOM_FIELD_COLS = { 1: "custom_field_1", 2: "custom_field_2", 3: "custom_field_3", 4: "custom_field_4", 5: "custom_field_5" };

const isCash = (mode) => mode === "cash";

const mapEntry = async (r) => ({
  id:                r.id,
  entryType:         r.entry_type,
  entryDate:         r.entry_date,
  siteName:          niceName(r.site_name || ""),
  companyName:       niceName(r.company_name || ""),
  partyName:         niceName(r.party_name || ""),
  narration:       r.narration || "",
  amount:            Number(r.amount) || 0,
  accountNoTo:       r.account_no_to || "",
  accountNoFrom:     r.account_no_from || "",
  ifscTo:            r.ifsc_to || "",
  ifscFrom:          r.ifsc_from || "",
  paymentMode:       r.payment_mode || "account",
  accountHolderName: r.account_holder_name || "",
  category:           r.category || "",
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
  await supabase.from("treasury_ledger_saved_values").upsert(rows, { onConflict: "field_key,value", ignoreDuplicates: true });
};

/* GET /api/treasury/ledger/entries */
router.get("/entries", requirePerm("treasury_ledger", "can_view"), async (req, res) => {
  try {
    const { entryType, search, dateFrom, dateTo } = req.query;
    let query = supabase.from("treasury_ledger_entries").select("*").is("deleted_at", null);
    if (entryType) query = query.eq("entry_type", entryType);
    if (dateFrom)  query = query.gte("entry_date", dateFrom);
    if (dateTo)    query = query.lte("entry_date", dateTo);

    const { data, error } = await query.order("entry_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;

    let rows = data || [];
    if (search) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(r =>
        [r.party_name, r.narration, r.site_name, r.company_name, r.account_no_to, r.account_no_from, r.account_holder_name, r.category, r.remarks]
          .some(v => String(v || "").toLowerCase().includes(s))
      );
    }

    const entries = await Promise.all(rows.map(mapEntry));
    res.json({ entries });
  } catch (err) {
    console.error("Treasury finance read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/treasury/ledger/field-values?field=site_name */
router.get("/field-values", requirePerm("treasury_ledger", "can_view"), async (req, res) => {
  try {
    const field = String(req.query.field || "");
    if (!SAVED_FIELD_KEYS.includes(field)) return res.status(400).json({ error: "Invalid field" });
    const { data, error } = await supabase
      .from("treasury_ledger_saved_values")
      .select("value").eq("field_key", field).order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ values: (data || []).map(r => r.value) });
  } catch (err) {
    console.error("Treasury finance field-values error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/treasury/ledger/seed-options — the entry form's pick lists, from
   Treasury › Masters (active records only), each party / company with its
   active bank accounts, primary first. */
router.get("/seed-options", requirePerm("treasury_ledger", "can_view"), async (_req, res) => {
  try {
    const [projects, companies, parties, accounts] = await Promise.all([
      supabase.from("treasury_projects").select("*").eq("is_active", true).order("name"),
      supabase.from("treasury_companies").select("*").eq("is_active", true).order("name"),
      supabase.from("treasury_parties").select("*").eq("is_active", true).order("name"),
      supabase.from("treasury_bank_accounts").select("*").eq("is_active", true)
        .order("is_primary", { ascending: false }).order("created_at"),
    ]);
    for (const r of [projects, companies, parties, accounts]) if (r.error) throw r.error;
    const acc = (type, id) => (accounts.data || []).filter(a => a.owner_type === type && a.owner_id === id).map(a => ({
      id: a.id, bankName: a.bank_name, accountNumber: a.account_number, ifsc: a.ifsc, holderName: a.holder_name, isPrimary: a.is_primary,
    }));
    res.json({
      sites: (projects.data || []).map(p => ({ id: p.id, name: niceName(p.name), code: p.code, sub: [p.city, p.state].filter(Boolean).join(", ") })),
      companies: (companies.data || []).map(c => ({ id: c.id, name: niceName(c.name), code: c.code, sub: c.gstin || "", accounts: acc("company", c.id) })),
      // accounts of no company — offered on our side whichever company is picked
      otherAccounts: (accounts.data || []).filter(a => a.owner_type === "other").map(a => ({
        id: a.id, bankName: a.bank_name, accountNumber: a.account_number, ifsc: a.ifsc, holderName: a.holder_name,
        label: a.label || "",
      })),
      vendors: (parties.data || []).map(p => ({ id: p.id, name: niceName(p.name), sub: [p.contact_person, p.mobile].filter(Boolean).join(" · "), accounts: acc("party", p.id) })),
    });
  } catch (err) {
    console.error("Treasury seed-options error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/treasury/ledger/coded-values?field=category */
router.get("/coded-values", requirePerm("treasury_ledger", "can_view"), async (req, res) => {
  try {
    const field = String(req.query.field || "");
    if (!CODED_FIELD_KEYS[field]) return res.status(400).json({ error: "Invalid field" });
    const { data, error } = await supabase
      .from("treasury_ledger_coded_values")
      .select("code, value").eq("field_key", field).order("code", { ascending: false });
    if (error) throw error;
    res.json({ values: data || [] });
  } catch (err) {
    console.error("Treasury coded-values read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/treasury/ledger/coded-values — body: { field, value }.
   Assigns the next sequential code for that field (PUR-1, PUR-2, … /
   ACC-1, ACC-2, … — independent counters per field). */
router.post("/coded-values", requirePerm("treasury_ledger", "can_add"), async (req, res) => {
  try {
    const field = String(req.body.field || "");
    const prefix = CODED_FIELD_KEYS[field];
    if (!prefix) return res.status(400).json({ error: "Invalid field" });
    const value = String(req.body.value || "").trim();
    if (!value) return res.status(400).json({ error: "Value is required" });

    const { data: last } = await supabase
      .from("treasury_ledger_coded_values")
      .select("code").eq("field_key", field).order("code", { ascending: false }).limit(1).maybeSingle();
    const nextCode = (last?.code || 0) + 1;

    const { data, error } = await supabase
      .from("treasury_ledger_coded_values")
      .insert({ field_key: field, code: nextCode, value })
      .select("code, value")
      .single();
    if (error) throw error;

    res.json({ code: data.code, value: data.value, display: `${prefix}-${data.code}` });
  } catch (err) {
    console.error("Treasury coded-values create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/treasury/ledger/custom-columns */
router.get("/custom-columns", requirePerm("treasury_ledger", "can_view"), async (_req, res) => {
  try {
    const { data, error } = await supabase.from("treasury_ledger_custom_columns").select("*").order("slot");
    if (error) throw error;
    res.json({ columns: (data || []).map(c => ({ slot: c.slot, label: c.label || "", isActive: !!c.is_active })) });
  } catch (err) {
    console.error("Treasury custom-columns read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/treasury/ledger/custom-columns/:slot — body: { label } */
router.put("/custom-columns/:slot", requirePerm("treasury_ledger", "can_add"), async (req, res) => {
  try {
    const slot = Number(req.params.slot);
    if (!CUSTOM_FIELD_COLS[slot]) return res.status(400).json({ error: "Invalid column slot" });
    const label = String(req.body.label || "").trim();
    if (!label) return res.status(400).json({ error: "Column name is required" });

    const { error } = await supabase
      .from("treasury_ledger_custom_columns")
      .update({ label, is_active: true, updated_at: new Date().toISOString() })
      .eq("slot", slot);
    if (error) throw error;
    res.json({ success: true, slot, label, isActive: true });
  } catch (err) {
    console.error("Treasury custom-columns update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/treasury/ledger/custom-columns/:slot — clears the column
   and wipes its values off every entry. */
router.delete("/custom-columns/:slot", requirePerm("treasury_ledger", "can_delete"), async (req, res) => {
  try {
    const slot = Number(req.params.slot);
    const col = CUSTOM_FIELD_COLS[slot];
    if (!col) return res.status(400).json({ error: "Invalid column slot" });

    const { error: colErr } = await supabase
      .from("treasury_ledger_custom_columns")
      .update({ label: null, is_active: false, updated_at: new Date().toISOString() })
      .eq("slot", slot);
    if (colErr) throw colErr;

    const { error: dataErr } = await supabase.from("treasury_ledger_entries").update({ [col]: null }).not("id", "is", null);
    if (dataErr) throw dataErr;

    res.json({ success: true });
  } catch (err) {
    console.error("Treasury custom-columns delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/treasury/ledger/entries */
router.post("/entries", requirePerm("treasury_ledger", "can_add"), upload.any(), async (req, res) => {
  try {
    const {
      entryType, entryDate, siteName, companyName, partyName, narration, amount,
      accountNoTo, accountNoFrom, ifscTo, ifscFrom, accountHolderName, category, remarks, paymentMode,
      customField1, customField2, customField3, customField4, customField5,
    } = req.body;

    if (entryType !== "payment" && entryType !== "receipt") {
      return res.status(400).json({ error: "entryType must be 'payment' or 'receipt'" });
    }

    const { data: created, error: insertError } = await supabase
      .from("treasury_ledger_entries")
      .insert({
        entry_type:           entryType,
        entry_date:           entryDate || null,
        site_name:            niceName(siteName || ""),
        company_name:         niceName(companyName || ""),
        party_name:           niceName(partyName || ""),
        narration:          narration || "",
        amount:                Number(amount) || 0,
        // Cash entries carry no bank details — clear them so a mode switch
        // never leaves stale account numbers behind.
        payment_mode:          isCash(paymentMode) ? "cash" : "account",
        account_no_to:         isCash(paymentMode) ? "" : accountNoTo || "",
        account_no_from:       isCash(paymentMode) ? "" : accountNoFrom || "",
        ifsc_to:               isCash(paymentMode) ? "" : String(ifscTo || "").trim().toUpperCase(),
        ifsc_from:             isCash(paymentMode) ? "" : String(ifscFrom || "").trim().toUpperCase(),
        account_holder_name:   isCash(paymentMode) ? "" : accountHolderName || "",
        category:               category || "",
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
      .from("treasury_ledger_entries")
      .update({ document_urls: documentUrls })
      .eq("id", created.id)
      .select("*")
      .single();

    await rememberFieldValues({ account_holder_name: accountHolderName });

    res.json({ entry: await mapEntry(finalRow) });
  } catch (err) {
    console.error("Treasury finance create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/treasury/ledger/entries/:id */
router.put("/entries/:id", requirePerm("treasury_ledger", "can_edit"), upload.any(), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      entryType, entryDate, siteName, companyName, partyName, narration, amount,
      accountNoTo, accountNoFrom, ifscTo, ifscFrom, accountHolderName, category, remarks, paymentMode,
      customField1, customField2, customField3, customField4, customField5,
    } = req.body;

    if (entryType !== "payment" && entryType !== "receipt") {
      return res.status(400).json({ error: "entryType must be 'payment' or 'receipt'" });
    }

    const keepDocs = parseJsonField(req.body.documentKeep);
    const newDocs  = await uploadDocs(req.files, "document", `entries/${id}`);

    const { data: updated, error } = await supabase
      .from("treasury_ledger_entries")
      .update({
        entry_type:           entryType,
        entry_date:           entryDate || null,
        site_name:            niceName(siteName || ""),
        company_name:         niceName(companyName || ""),
        party_name:           niceName(partyName || ""),
        narration:          narration || "",
        amount:                Number(amount) || 0,
        // Cash entries carry no bank details — clear them so a mode switch
        // never leaves stale account numbers behind.
        payment_mode:          isCash(paymentMode) ? "cash" : "account",
        account_no_to:         isCash(paymentMode) ? "" : accountNoTo || "",
        account_no_from:       isCash(paymentMode) ? "" : accountNoFrom || "",
        ifsc_to:               isCash(paymentMode) ? "" : String(ifscTo || "").trim().toUpperCase(),
        ifsc_from:             isCash(paymentMode) ? "" : String(ifscFrom || "").trim().toUpperCase(),
        account_holder_name:   isCash(paymentMode) ? "" : accountHolderName || "",
        category:               category || "",
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
    console.error("Treasury finance update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/treasury/ledger/entries/:id — soft delete */
router.delete("/entries/:id", requirePerm("treasury_ledger", "can_delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("treasury_ledger_entries")
      .update({
        deleted_at:      new Date().toISOString(),
        deleted_by_id:   req._authUserId || null,
        deleted_by_name: req.body?.deletedByName || "",
      })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Treasury finance delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/treasury/ledger/dashboard-stats — high-level summary of the
   Party Ledger, for the Treasury Overview tab. Gated
   by treasury_overview, not treasury_ledger — a board member can be
   given the summary without the raw ledger, or vice versa. */
/* ── Treasury › Party Ledger: party-wise accounts built from the entries ──
   Balance = received − paid. Positive (Cr): the party gave us more, so we
   owe them. Negative (Dr): they owe us. Parties are matched on the name,
   ignoring case and extra spaces. */
const partyKey = (name) => String(name || "").trim().replace(/\s+/g, " ").toLowerCase();

const loadLedgerRows = async () => {
  const { data, error } = await supabase.from("treasury_ledger_entries")
    .select("id, entry_type, entry_date, party_name, company_name, site_name, narration, category, amount, payment_mode, remarks, account_no_to, account_no_from, ifsc_to, ifsc_from, created_at")
    .is("deleted_at", null)
    .order("entry_date", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
};

// Opening balances from Treasury › Masters, by party name
const loadOpenings = async () => {
  const { data } = await supabase.from("treasury_parties").select("name, opening_balance");
  return new Map((data || []).map(p => [partyKey(p.name), { name: niceName(String(p.name).trim()), opening: Number(p.opening_balance) || 0 }]));
};

/* GET /api/treasury/ledger/parties */
router.get("/parties", requirePerm("treasury_ledger", "can_view"), async (_req, res) => {
  try {
    const parties = new Map();
    const openings = await loadOpenings();
    // a party with only an opening balance still has an account
    openings.forEach((o, k) => {
      if (o.opening) parties.set(k, { name: o.name, entries: 0, received: 0, paid: 0, lastDate: null });
    });
    (await loadLedgerRows()).forEach(r => {
      const key = partyKey(r.party_name);
      if (!key) return;
      const p = parties.get(key) || { name: niceName(String(r.party_name).trim()), entries: 0, received: 0, paid: 0, lastDate: null };
      const amt = Number(r.amount) || 0;
      p.entries += 1;
      if (r.entry_type === "receipt") p.received += amt; else p.paid += amt;
      if (r.entry_date && (!p.lastDate || r.entry_date > p.lastDate)) p.lastDate = r.entry_date;
      parties.set(key, p);
    });
    const list = [...parties.entries()]
      .map(([k, p]) => {
        const opening = openings.get(k)?.opening || 0;
        return { ...p, opening, balance: opening + p.received - p.paid };
      })
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    res.json({ parties: list });
  } catch (err) {
    console.error("Party list error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/treasury/ledger/parties/ledger?party=&from=&to= */
router.get("/parties/ledger", requirePerm("treasury_ledger", "can_view"), async (req, res) => {
  try {
    const key = partyKey(req.query.party);
    if (!key) return res.status(400).json({ error: "party is required" });
    const { from, to } = req.query;
    const rows = (await loadLedgerRows()).filter(r => partyKey(r.party_name) === key);

    const signed = (r) => (r.entry_type === "receipt" ? 1 : -1) * (Number(r.amount) || 0);
    const before = from ? rows.filter(r => r.entry_date && r.entry_date < from) : [];
    const inRange = rows.filter(r => (!from || !r.entry_date || r.entry_date >= from) && (!to || !r.entry_date || r.entry_date <= to));
    const openings = await loadOpenings();
    const opening = (openings.get(key)?.opening || 0) + before.reduce((s, r) => s + signed(r), 0);

    // "HDFC ••4521": bank name from Treasury › Masters when the number is known there
    const { data: accs } = await supabase.from("treasury_bank_accounts").select("account_number, bank_name, owner_type, label, ifsc, holder_name, branch");
    const accOf = new Map();
    (accs || []).forEach(a => {
      const num = String(a.account_number).trim();
      // an "other" account's name wins — it tells whose personal account it was
      if (!accOf.has(num) || a.owner_type === "other") accOf.set(num, a);
    });
    const accLabel = (n) => {
      const num = String(n || "").trim();
      if (!num) return "";
      const a = accOf.get(num);
      const base = [a?.bank_name, `••${num.slice(-4)}`].filter(Boolean).join(" ");
      return a?.owner_type === "other" && a.label ? `${base} (${a.label})` : base;
    };
    // everything about one account, for the card that opens when it's clicked
    const accInfo = (n, ifsc, ownerName, side) => {
      const num = String(n || "").trim();
      if (!num) return null;
      const a = accOf.get(num);
      const personal = a?.owner_type === "other";
      return {
        number: num, bankName: a?.bank_name || "", ifsc: a?.ifsc || ifsc || "", holderName: a?.holder_name || "", branch: a?.branch || "",
        whose: personal ? a.label || "Personal account" : ownerName || "",
        side: personal ? "Personal" : side,  // "Ours" / "Party" / "Personal"
      };
    };

    let balance = opening;
    const lines = inRange.map(r => {
      balance += signed(r);
      return {
        id: r.id, date: r.entry_date, type: r.entry_type,
        category: r.category || "", narration: r.narration || "",
        detail: [r.category, r.narration].filter(Boolean).join(" — ") || (r.entry_type === "receipt" ? "Received" : "Paid"),
        mode: r.payment_mode === "cash" ? "By Hand" : "By Account",
        // Paid: money left our account (from) for theirs (to); Received the other way
        ourAccount: r.payment_mode === "cash" ? "" : accLabel(r.entry_type === "payment" ? r.account_no_from : r.account_no_to),
        theirAccount: r.payment_mode === "cash" ? "" : accLabel(r.entry_type === "payment" ? r.account_no_to : r.account_no_from),
        ourAccountInfo: r.payment_mode === "cash" ? null : (r.entry_type === "payment"
          ? accInfo(r.account_no_from, r.ifsc_from, niceName(r.company_name || ""), "Ours")
          : accInfo(r.account_no_to, r.ifsc_to, niceName(r.company_name || ""), "Ours")),
        theirAccountInfo: r.payment_mode === "cash" ? null : (r.entry_type === "payment"
          ? accInfo(r.account_no_to, r.ifsc_to, niceName(r.party_name || ""), "Party")
          : accInfo(r.account_no_from, r.ifsc_from, niceName(r.party_name || ""), "Party")),
        company: niceName(r.company_name || ""), site: niceName(r.site_name || ""), remarks: r.remarks || "",
        received: r.entry_type === "receipt" ? Number(r.amount) || 0 : 0,
        paid: r.entry_type === "payment" ? Number(r.amount) || 0 : 0,
        balance,
      };
    });
    res.json({
      party: rows[0] ? niceName(String(rows[0].party_name).trim()) : openings.get(key)?.name || req.query.party,
      opening, closing: balance, lines,
      totals: { received: lines.reduce((s, l) => s + l.received, 0), paid: lines.reduce((s, l) => s + l.paid, 0) },
    });
  } catch (err) {
    console.error("Party ledger error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/dashboard-stats", requirePerm("treasury_overview", "can_view"), async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("treasury_ledger_entries")
      .select("id, entry_type, entry_date, site_name, company_name, party_name, amount, created_at")
      .is("deleted_at", null);
    if (error) throw error;

    const rows = data || [];
    const sum = (list) => list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const payments = rows.filter(r => r.entry_type === "payment");
    const receipts = rows.filter(r => r.entry_type === "receipt");
    const totalPaid = sum(payments);
    const totalReceived = sum(receipts);

    // Last 6 months, oldest first, keyed by entry_date (falls back to created_at
    // if entry_date is somehow blank).
    const monthKey = (r) => String(r.entry_date || r.created_at || "").slice(0, 7);
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) };
    });
    const monthlyTrend = months.map(({ key, label }) => ({
      month: label,
      paid: sum(payments.filter(r => monthKey(r) === key)),
      received: sum(receipts.filter(r => monthKey(r) === key)),
    }));

    const topByField = (field) => {
      const totals = new Map();
      rows.forEach(r => {
        const name = niceName((r[field] || "").trim());
        if (!name) return;
        totals.set(name, (totals.get(name) || 0) + (Number(r.amount) || 0));
      });
      return [...totals.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
    };

    const recentEntries = [...rows]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8)
      .map(r => ({
        id: r.id, entryType: r.entry_type, entryDate: r.entry_date,
        partyName: niceName(r.party_name || ""), companyName: niceName(r.company_name || ""), amount: Number(r.amount) || 0,
      }));

    res.json({
      totalPaid, totalReceived, netBalance: totalReceived - totalPaid, totalEntries: rows.length,
      monthlyTrend,
      topSites: topByField("site_name"),
      topCompanies: topByField("company_name"),
      recentEntries,
      typeSplit: { payment: totalPaid, receipt: totalReceived },
    });
  } catch (err) {
    console.error("Treasury dashboard-stats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
