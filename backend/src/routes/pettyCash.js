// Expenses > Petty Cash. One ledger (petty_cash_entries) holding three kinds
// of entry — expense, received (from Accounts) and transfer (person to
// person). The Staff tab (petty_cash_staff) works on the full ledger; the
// Accounts tab (petty_cash_accounts) only gets totals + expense rows for a
// date range, with no per-person breakdown and no transfers.
const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const supabase = require("../helpers/supabaseHelper");
const { uploadStorageFile, createSignedStorageUrl, normalizeStoragePath } = require("../helpers/storageHelper");
const { requirePerm } = require("../helpers/permHelper");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const BUCKET = "petty_cash";
const signDoc = (value) => createSignedStorageUrl(supabase, BUCKET, value);

const ENTRY_TYPES   = ["expense", "received", "transfer"];
const PROOF_TYPES   = ["tax_invoice", "local_bill", "voucher"];
const PAYMENT_MODES = ["cash", "online", "credit_card"];
// Same order as the columns in Accounts' Excel sheet — the frontend mirrors
// this list (pages/Expenses/pettyCashConstants.js).
const CATEGORIES = [
  "Credit Card", "Mobile + Data Recharge", "Accommodation", "Transport (Car hire, Taxi, Coach)",
  "Petrol Car/ Bike", "Tolls & Parking", "Kitchen & Grocery", "Meals", "Electric Item",
  "Repair & Maintance charges", "Housekeeping Charges", "Software", "Bank Charges", "Others",
];

// Attachments are kept in four separate sections, each its own column.
// Uploads arrive as multipart fields "doc_<section>"; on edit, the files
// to keep come back as { <section>: [path|signedUrl, ...] } in docKeep.
const DOC_SECTIONS = { bill: "bill_docs", voucher: "voucher_docs", payment: "payment_docs", material: "material_docs" };

const signDocs = async (r) => Object.fromEntries(await Promise.all(
  Object.entries(DOC_SECTIONS).map(async ([key, col]) => [key, await Promise.all((r[col] || []).map(signDoc))])
));

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const mapEntry = async (r, peopleById) => ({
  id:            r.id,
  entryType:     r.entry_type,
  entryDate:     r.entry_date,
  amount:        Number(r.amount) || 0,
  personId:      r.person_id,
  personName:    peopleById[r.person_id]?.name || "",
  fromPersonId:  r.from_person_id || null,
  fromPersonName: r.from_person_id ? (peopleById[r.from_person_id]?.name || "") : "",
  particular:    r.particular || "",
  category:      r.category || "",
  proofType:     r.proof_type || "",
  paymentMode:   r.payment_mode || "",
  project:       r.project || "",
  location:      r.location || "",
  remarks:       r.remarks || "",
  items:         Array.isArray(r.items) ? r.items : [],
  documents:     await signDocs(r),
  createdAt:     r.created_at,
  createdByName: r.created_by_name || "",
  updatedAt:     r.updated_at,
});

const loadPeopleMap = async () => {
  const { data, error } = await supabase.from("petty_cash_people").select("id, name, user_id, is_active");
  if (error) throw error;
  return Object.fromEntries((data || []).map(p => [p.id, p]));
};

// Uploads every "doc_<section>" file and returns { <column>: [paths] }.
const uploadDocs = async (files, pathPrefix) => {
  const out = {};
  for (const [key, col] of Object.entries(DOC_SECTIONS)) {
    const matches = (files || []).filter(f => f.fieldname === `doc_${key}`);
    out[col] = [];
    for (let i = 0; i < matches.length; i++) {
      const file = matches[i];
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${pathPrefix}/${key}/${Date.now()}_${i}_${safeName}`;
      await uploadStorageFile(supabase, BUCKET, path, file.buffer, file.mimetype);
      out[col].push(path);
    }
  }
  return out;
};

// docKeep → { <column>: [storage paths] }, stripping any signed-URL wrapper
// the client echoed back so only bare paths are stored.
const parseDocKeep = (raw) => {
  let v = {};
  try { v = JSON.parse(raw || "{}") || {}; } catch { v = {}; }
  return Object.fromEntries(Object.entries(DOC_SECTIONS).map(([key, col]) => [
    col, (Array.isArray(v[key]) ? v[key] : []).map(p => normalizeStoragePath(p, BUCKET)).filter(Boolean),
  ]));
};

const rememberLocation = async (name) => {
  const value = String(name || "").trim();
  if (!value) return;
  const { data: existing } = await supabase.from("petty_cash_locations").select("id").ilike("name", value).maybeSingle();
  if (!existing) await supabase.from("petty_cash_locations").insert({ name: value });
};

// Optional line items on an expense. Arrives as a JSON string (the form is
// multipart) or an array; returns the cleaned list, or throws.
const parseItems = (raw) => {
  let list = raw;
  if (typeof raw === "string") {
    try { list = JSON.parse(raw || "[]"); } catch { throw new Error("Invalid items"); }
  }
  if (list == null) return [];
  if (!Array.isArray(list)) throw new Error("Invalid items");
  return list.map((it, i) => {
    const name = String(it?.name || "").trim();
    const qty = round2(it?.qty);
    const rate = round2(it?.rate);
    const amount = round2(it?.amount);
    if (!name) throw new Error(`Item ${i + 1}: name is required`);
    if (!(qty > 0)) throw new Error(`Item ${i + 1}: quantity must be greater than 0`);
    if (!(amount > 0)) throw new Error(`Item ${i + 1}: amount must be greater than 0`);
    return { name, qty, unit: String(it?.unit || "").trim(), rate, amount };
  });
};

// Validates a request body and returns the DB row (minus audit columns), or
// throws with a user-facing message. Only the fields that belong to the
// entry's type are kept, so switching an expense to a transfer on edit
// clears the stale expense-only fields.
const buildRow = (b) => {
  const entryType = b.entryType;
  if (!ENTRY_TYPES.includes(entryType)) throw new Error("Invalid entry type");
  if (!b.entryDate) throw new Error("Date is required");
  const amount = round2(b.amount);
  if (!(amount > 0)) throw new Error("Amount must be greater than 0");
  if (!b.personId) throw new Error(entryType === "expense" ? "Paid By is required" : "Person is required");

  const row = {
    entry_type: entryType, entry_date: b.entryDate, amount,
    person_id: b.personId, from_person_id: null,
    particular: "", category: "", proof_type: "", payment_mode: "", project: "", location: "",
    remarks: String(b.remarks || "").trim(), items: [],
  };

  if (entryType === "expense") {
    if (!String(b.particular || "").trim()) throw new Error("Expense is required");
    if (!CATEGORIES.includes(b.category)) throw new Error("Category is required");
    if (!PROOF_TYPES.includes(b.proofType)) throw new Error("Bill type is required");
    if (!PAYMENT_MODES.includes(b.paymentMode)) throw new Error("Payment mode is required");
    const items = parseItems(b.items);
    if (items.length && Math.abs(round2(items.reduce((s, it) => s + it.amount, 0)) - amount) > 0.01) {
      throw new Error("Items total must equal the amount");
    }
    Object.assign(row, {
      items,
      particular: String(b.particular).trim(), category: b.category, proof_type: b.proofType,
      payment_mode: b.paymentMode, project: String(b.project || "").trim(), location: String(b.location || "").trim(),
    });
  } else if (entryType === "transfer") {
    if (!b.fromPersonId) throw new Error("Given By is required");
    if (b.fromPersonId === b.personId) throw new Error("Given By and Given To can't be the same person");
    row.from_person_id = b.fromPersonId;
  }
  return row;
};

/* GET /api/petty-cash/people */
router.get("/people", requirePerm("petty_cash_staff", "can_view"), async (_req, res) => {
  try {
    const { data, error } = await supabase.from("petty_cash_people").select("id, name, user_id, is_active").order("name");
    if (error) throw error;
    res.json({ people: (data || []).map(p => ({ id: p.id, name: p.name, userId: p.user_id, isActive: p.is_active })) });
  } catch (err) {
    console.error("Petty cash people read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/petty-cash/people — { name, userId? } */
router.post("/people", requirePerm("petty_cash_staff", "can_add"), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name is required" });
    const { data: existing } = await supabase.from("petty_cash_people").select("id").ilike("name", name).maybeSingle();
    if (existing) return res.status(400).json({ error: `"${name}" already exists` });

    const { data, error } = await supabase
      .from("petty_cash_people")
      .insert({ name, user_id: req.body.userId || null })
      .select("id, name, user_id, is_active")
      .single();
    if (error) throw error;
    res.json({ person: { id: data.id, name: data.name, userId: data.user_id, isActive: data.is_active } });
  } catch (err) {
    console.error("Petty cash people create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/petty-cash/users — login users, for linking a person to a user */
router.get("/users", requirePerm("petty_cash_staff", "can_add"), async (_req, res) => {
  try {
    const { data, error } = await supabase.from("users").select("id, name, email").eq("is_active", true).order("name");
    if (error) throw error;
    res.json({ users: (data || []).map(u => ({ id: u.id, name: u.name || u.email, email: u.email })) });
  } catch (err) {
    console.error("Petty cash users read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/petty-cash/users/:id/signature — the user's profile signature
   (Settings > Personal Info, stored in the "picture" bucket), for signing
   an expense voucher. signatureUrl is null when they haven't set one. */
router.get("/users/:id/signature", requirePerm("petty_cash_staff", "can_add"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("users").select("profile_permissions").eq("id", req.params.id).maybeSingle();
    if (error) throw error;
    let file = data?.profile_permissions?.ui?.signature;
    // Profile link missing (e.g. wiped by an old permissions save) but the
    // uploaded file may still be in storage — use the newest one, the same
    // file work orders keep showing.
    if (!file && data) {
      const { data: files } = await supabase.storage.from("picture").list("sign", { search: `sig_${req.params.id}_` });
      const latest = (files || []).filter(f => f.name.startsWith(`sig_${req.params.id}_`)).sort((a, b) => b.name.localeCompare(a.name))[0];
      if (latest) file = `sign/${latest.name}`;
    }
    const signatureUrl = file ? await createSignedStorageUrl(supabase, "picture", file) : "";
    res.json({ signatureUrl: signatureUrl || null });
  } catch (err) {
    console.error("Petty cash signature read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/petty-cash/locations */
router.get("/locations", requirePerm("petty_cash_staff", "can_view"), async (_req, res) => {
  try {
    const { data, error } = await supabase.from("petty_cash_locations").select("name").order("name");
    if (error) throw error;
    res.json({ locations: (data || []).map(l => l.name) });
  } catch (err) {
    console.error("Petty cash locations read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/petty-cash/entries — the full active ledger (balances are
   computed over all of it, so no date filtering server-side) */
router.get("/entries", requirePerm("petty_cash_staff", "can_view"), async (_req, res) => {
  try {
    const [peopleById, entriesRes] = await Promise.all([
      loadPeopleMap(),
      supabase.from("petty_cash_entries").select("*").is("deleted_at", null)
        .order("entry_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    if (entriesRes.error) throw entriesRes.error;
    const entries = await Promise.all((entriesRes.data || []).map(r => mapEntry(r, peopleById)));
    res.json({ entries });
  } catch (err) {
    console.error("Petty cash entries read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/petty-cash/entries */
router.post("/entries", requirePerm("petty_cash_staff", "can_add"), upload.any(), async (req, res) => {
  try {
    let row;
    try { row = buildRow(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }

    const { data: created, error: insertError } = await supabase
      .from("petty_cash_entries")
      .insert({ ...row, created_by_id: req._authUserId || null, created_by_name: req.body.createdByName || "" })
      .select("*")
      .single();
    if (insertError) throw insertError;

    const uploaded = await uploadDocs(req.files, `entries/${created.id}`);
    let finalRow = created;
    if (Object.values(uploaded).some(list => list.length)) {
      const { data, error } = await supabase.from("petty_cash_entries")
        .update(uploaded).eq("id", created.id).select("*").single();
      if (error) throw error;
      finalRow = data;
    }

    await rememberLocation(row.location);
    res.json({ entry: await mapEntry(finalRow, await loadPeopleMap()) });
  } catch (err) {
    console.error("Petty cash create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/petty-cash/entries/:id */
router.put("/entries/:id", requirePerm("petty_cash_staff", "can_edit"), upload.any(), async (req, res) => {
  try {
    const { id } = req.params;
    let row;
    try { row = buildRow(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }

    const keep = parseDocKeep(req.body.docKeep);
    const uploaded = await uploadDocs(req.files, `entries/${id}`);
    const docCols = Object.fromEntries(Object.values(DOC_SECTIONS).map(col => [col, [...keep[col], ...uploaded[col]]]));

    const { data: updated, error } = await supabase
      .from("petty_cash_entries")
      .update({ ...row, ...docCols, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) throw error;

    await rememberLocation(row.location);
    res.json({ entry: await mapEntry(updated, await loadPeopleMap()) });
  } catch (err) {
    console.error("Petty cash update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/petty-cash/entries/:id — soft delete */
router.delete("/entries/:id", requirePerm("petty_cash_staff", "can_delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("petty_cash_entries")
      .update({
        deleted_at:      new Date().toISOString(),
        deleted_by_id:   req._authUserId || null,
        deleted_by_name: req.body?.deletedByName || "",
      })
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Petty cash delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/petty-cash/entries/bulk — { rows: [...] }, each row shaped like
   the single-entry body but with person *names* (personName /
   fromPersonName) instead of ids. Unknown names become new people. The
   whole batch is validated first; nothing is inserted if any row fails. */
router.post("/entries/bulk", requirePerm("petty_cash_staff", "can_bulk_upload"), async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: "No rows to import" });
    if (rows.length > 5000) return res.status(400).json({ error: "Too many rows (max 5000 per upload)" });

    const { data: peopleData, error: peopleErr } = await supabase.from("petty_cash_people").select("id, name");
    if (peopleErr) throw peopleErr;
    const idByName = Object.fromEntries((peopleData || []).map(p => [p.name.trim().toLowerCase(), p.id]));

    // New names get a placeholder id during validation; real people rows are
    // only created once every row has passed.
    const newNames = new Map();
    const resolve = (name) => {
      const clean = String(name || "").trim();
      if (!clean) return "";
      const key = clean.toLowerCase();
      if (idByName[key]) return idByName[key];
      if (!newNames.has(key)) newNames.set(key, { name: clean, placeholder: `new:${key}` });
      return newNames.get(key).placeholder;
    };

    const errors = [];
    const built = rows.map((r, i) => {
      try {
        return buildRow({ ...r, personId: resolve(r.personName), fromPersonId: resolve(r.fromPersonName) });
      } catch (e) {
        errors.push(`Row ${r.rowNumber || i + 2}: ${e.message}`);
        return null;
      }
    });
    if (errors.length) return res.status(400).json({ error: "Fix these rows and upload again", details: errors.slice(0, 50) });

    if (newNames.size) {
      const { data: createdPeople, error } = await supabase
        .from("petty_cash_people")
        .insert([...newNames.values()].map(n => ({ name: n.name })))
        .select("id, name");
      if (error) throw error;
      const idByPlaceholder = Object.fromEntries(createdPeople.map(p => [`new:${p.name.trim().toLowerCase()}`, p.id]));
      built.forEach(row => {
        if (idByPlaceholder[row.person_id]) row.person_id = idByPlaceholder[row.person_id];
        if (row.from_person_id && idByPlaceholder[row.from_person_id]) row.from_person_id = idByPlaceholder[row.from_person_id];
      });
    }

    const createdByName = req.body.createdByName || "";
    const { error: insertErr } = await supabase
      .from("petty_cash_entries")
      .insert(built.map(row => ({ ...row, created_by_id: req._authUserId || null, created_by_name: createdByName })));
    if (insertErr) throw insertErr;

    for (const loc of new Set(built.map(r => r.location).filter(Boolean))) await rememberLocation(loc);

    res.json({ success: true, inserted: built.length, newPeople: newNames.size });
  } catch (err) {
    console.error("Petty cash bulk upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/petty-cash/accounts?from=YYYY-MM-DD&to=YYYY-MM-DD — totals-only
   view for Accounts. Opening = everything received minus everything spent
   before `from`; transfers are internal hand-overs and never count. */
router.get("/accounts", requirePerm("petty_cash_accounts", "can_view"), async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: "from and to dates are required" });
    if (from > to) return res.status(400).json({ error: "From date must be before To date" });

    const { data, error } = await supabase
      .from("petty_cash_entries")
      .select("*")
      .is("deleted_at", null)
      .in("entry_type", ["expense", "received"])
      .lte("entry_date", to)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;

    let opening = 0, received = 0, expense = 0;
    const inRange = [];
    for (const r of data || []) {
      const amt = Number(r.amount) || 0;
      const sign = r.entry_type === "received" ? 1 : -1;
      if (r.entry_date < from) { opening += sign * amt; continue; }
      if (r.entry_type === "received") received += amt;
      else { expense += amt; inRange.push(r); }
    }

    const rows = await Promise.all(inRange.map(async r => ({
      id:           r.id,
      entryDate:    r.entry_date,
      particular:   r.particular || "",
      category:     r.category || "",
      proofType:    r.proof_type || "",
      paymentMode:  r.payment_mode || "",
      project:      r.project || "",
      location:     r.location || "",
      remarks:      r.remarks || "",
      amount:       Number(r.amount) || 0,
      documents:    await signDocs(r),
    })));

    res.json({
      summary: { opening: round2(opening), received: round2(received), expense: round2(expense), closing: round2(opening + received - expense) },
      rows,
    });
  } catch (err) {
    console.error("Petty cash accounts read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
