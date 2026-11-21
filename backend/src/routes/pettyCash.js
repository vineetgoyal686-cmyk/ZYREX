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
const { requirePerm, hasPerm } = require("../helpers/permHelper");
const { projectScope, allows, userIdFrom } = require("../helpers/projectScope");

// Petty Cash project access per tab (Staff / Accounts): the projects and
// offices picked next to its permission; none picked = all (Petty Cash never
// had the old Project Access rule). null = every project / office.
const pcScope = (req, key) => projectScope(userIdFrom(req), key, null, { legacy: false });
const pcAllowed = (scope, r) => allows(scope, r.project_id, r.branch_id);

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
  vendorName:    r.vendor_name || "",
  category:     r.category || "",
  proofType:     r.proof_type || "",
  paymentMode:   r.payment_mode || "",
  project:       r.project || "",
  location:      r.location || "",
  remarks:       r.remarks || "",
  companyId:     r.company_id || null,
  // a project or an office (Branch) of the entity — the pickers use one list
  projectId:     r.project_id || r.branch_id || null,
  items:         Array.isArray(r.items) ? r.items : [],
  charges:       Array.isArray(r.charges) ? r.charges : [],
  voucherNo:     r.voucher_data?.voucherNo || "",
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

// Every entry belongs to an Entity (company) and one of its projects
// (public.projects) or offices (organisation.branches). Checks the pair and
// stamps it on the row; the name is also copied into the legacy `project`
// text column, which lists and exports still read.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const loadProject = async (companyId, projectId, req) => {
  if (!UUID_RE.test(String(companyId || ""))) throw new Error("Entity is required");
  if (!UUID_RE.test(String(projectId || ""))) throw new Error("Project or office is required");
  const { data: project, error } = await supabase.from("projects")
    .select("id, company_id, project_name").eq("id", projectId).maybeSingle();
  if (error) throw error;
  let scope = project && { kind: "project", id: project.id, company_id: project.company_id, name: project.project_name };
  if (!scope) {
    const { data: office, error: oErr } = await supabase.schema("organisation").from("branches")
      .select("id, company_id, label").eq("id", projectId).maybeSingle();
    if (oErr) throw oErr;
    scope = office && { kind: "office", id: office.id, company_id: office.company_id, name: office.label };
  }
  if (!scope || scope.company_id !== companyId) throw new Error("Project / office doesn't belong to the selected entity");
  if (req && !allows(await pcScope(req, "petty_cash_staff"), scope.id)) throw new Error("This project / office isn't in your Petty Cash access");
  return scope;
};
const applyScope = (row, scope) => Object.assign(row, {
  company_id: scope.company_id,
  project_id: scope.kind === "project" ? scope.id : null,
  branch_id:  scope.kind === "office" ? scope.id : null,
  project:    scope.name,
});

// GET filters: ?company_id= (and optionally ?project_id=).
const scopeFilter = (query, q) => {
  if (UUID_RE.test(String(q.company_id || ""))) query = query.eq("company_id", q.company_id);
  if (UUID_RE.test(String(q.project_id || ""))) query = query.or(`project_id.eq.${q.project_id},branch_id.eq.${q.project_id}`);
  // ?kind=project|office — all projects, or all offices, of the entity
  else if (q.kind === "project") query = query.not("project_id", "is", null);
  else if (q.kind === "office") query = query.not("branch_id", "is", null);
  return query;
};

// Staff or Accounts viewers both need the Entity / Project pickers.
const requireAnyView = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  let sub = null;
  try { sub = JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString()).sub; } catch { /* invalid */ }
  if (!sub) return res.status(401).json({ error: "Login required" });
  const ok = await hasPerm(sub, "petty_cash_staff", "can_view") || await hasPerm(sub, "petty_cash_accounts", "can_view");
  if (!ok) return res.status(403).json({ error: "Permission denied" });
  next();
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

// Extra charges on an itemised expense (delivery, handling, discount…):
// [{ name, amount }], amount signed — a discount is negative.
const parseCharges = (raw) => {
  let list = raw;
  if (typeof raw === "string") {
    try { list = JSON.parse(raw || "[]"); } catch { throw new Error("Invalid charges"); }
  }
  if (list == null) return [];
  if (!Array.isArray(list)) throw new Error("Invalid charges");
  return list.map((c, i) => {
    const name = String(c?.name || "").trim();
    const amount = round2(c?.amount);
    if (!name) throw new Error(`Charge ${i + 1}: name is required`);
    if (!amount) throw new Error(`Charge ${i + 1}: amount is required`);
    return { name, amount };
  });
};

// Saved Create-Voucher details, so the voucher can be reopened and edited.
// Returns undefined when the request doesn't touch it, null to clear it.
const parseVoucherData = (body, entryType) => {
  if (entryType !== "expense") return null;
  if (!Object.prototype.hasOwnProperty.call(body, "voucherData")) return undefined;
  const raw = body.voucherData;
  if (!raw) return null;
  if (String(raw).length > 2 * 1024 * 1024) throw new Error("Voucher details are too large");
  let v;
  try { v = JSON.parse(raw); } catch { throw new Error("Invalid voucher details"); }
  if (!v || typeof v !== "object" || !v.voucherNo) throw new Error("Invalid voucher details");
  return v;
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
    particular: "", vendor_name: "", category: "", proof_type: "", payment_mode: "", project: "", location: "",
    remarks: String(b.remarks || "").trim(), items: [], charges: [],
  };

  if (entryType === "expense") {
    if (!String(b.particular || "").trim()) throw new Error("Expense is required");
    if (!CATEGORIES.includes(b.category)) throw new Error("Category is required");
    if (!PROOF_TYPES.includes(b.proofType)) throw new Error("Bill type is required");
    if (!PAYMENT_MODES.includes(b.paymentMode)) throw new Error("Payment mode is required");
    const items = parseItems(b.items);
    // Charges only sit on top of items; without items the amount is typed.
    const charges = items.length ? parseCharges(b.charges) : [];
    const total = round2(items.reduce((s, it) => s + it.amount, 0) + charges.reduce((s, c) => s + c.amount, 0));
    if (items.length && Math.abs(total - amount) > 0.01) {
      throw new Error(charges.length ? "Items total plus charges must equal the amount" : "Items total must equal the amount");
    }
    Object.assign(row, {
      items, charges,
      particular: String(b.particular).trim(), vendor_name: String(b.vendorName || "").trim(),
      category: b.category, proof_type: b.proofType,
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

/* ── Directory tab: every vendor of the picked entity + project / office ──
   Vendors are the names typed on expense entries plus the ones added by hand
   or from Excel (petty_cash_vendors, sql/petty_cash_vendors.sql), one row
   per project / office + name (case-insensitive). Rename fixes a name on all
   of that project's entries; renaming onto a name already there merges the
   two. A vendor with no entries can be deleted. */

// Projects / offices this user may see in Petty Cash (Staff or Accounts
// view); null = every one
const anyViewScope = async (req) => {
  const parts = [];
  for (const key of ["petty_cash_staff", "petty_cash_accounts"]) {
    if (!(await hasPerm(userIdFrom(req), key, "can_view"))) continue;
    const sc = await pcScope(req, key);
    if (sc === null) return null;
    parts.push(...sc);
  }
  return new Set(parts);
};

const vendorKey = (name) => String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
const cleanVendor = (name) => String(name || "").trim().replace(/\s+/g, " ");

// Vendors added by hand, filtered like entries; [] until the SQL is run
const savedVendors = async (query) => {
  const { data, error } = await scopeFilter(supabase.from("petty_cash_vendors")
    .select("id, name, project_id, branch_id"), query);
  if (error) {
    if (/petty_cash_vendors/.test(error.message || "")) return [];
    throw error;
  }
  return data || [];
};

/* GET /api/petty-cash/vendor-directory?company_id=&kind=&project_id= */
router.get("/vendor-directory", requireAnyView, async (req, res) => {
  try {
    if (!UUID_RE.test(String(req.query.company_id || ""))) return res.json({ vendors: [] });
    const { data, error } = await scopeFilter(supabase.from("petty_cash_entries")
      .select("vendor_name, project_id, branch_id, amount, entry_date"), req.query)
      .eq("entry_type", "expense").neq("vendor_name", "").is("deleted_at", null);
    if (error) throw error;
    const scope = await anyViewScope(req);
    const map = new Map();
    (data || []).filter(r => pcAllowed(scope, r)).forEach(r => {
      const key = vendorKey(r.vendor_name);
      if (!key) return;
      const projectId = r.project_id || r.branch_id || null;
      const k = `${projectId}|${key}`;
      const v = map.get(k) || { name: "", projectId, entries: 0, total: 0, lastUsed: "", spellings: {} };
      const spelled = String(r.vendor_name).trim();
      v.spellings[spelled] = (v.spellings[spelled] || 0) + 1;
      v.entries += 1;
      v.total = round2(v.total + Number(r.amount || 0));
      if (String(r.entry_date || "") > v.lastUsed) v.lastUsed = String(r.entry_date || "");
      map.set(k, v);
    });
    // Added by hand (no entries yet, or also used on entries)
    (await savedVendors(req.query)).filter(r => pcAllowed(scope, r)).forEach(r => {
      const projectId = r.project_id || r.branch_id;
      const k = `${projectId}|${vendorKey(r.name)}`;
      const v = map.get(k) || { name: "", projectId, entries: 0, total: 0, lastUsed: "", spellings: {} };
      if (!v.entries) v.spellings[r.name] = 1;
      v.saved = true;
      map.set(k, v);
    });
    // Shown name = the spelling used most
    const vendors = [...map.values()].map(({ spellings, ...v }) => ({
      ...v, saved: !!v.saved, name: Object.entries(spellings).sort((a, b) => b[1] - a[1])[0][0],
    })).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ vendors });
  } catch (err) {
    console.error("Petty cash vendor directory error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/petty-cash/vendor-directory/rename
   { company_id, project_id, from, to } — every entry of that project /
   office whose vendor is `from` (any case / spacing) gets `to`. */
router.post("/vendor-directory/rename", requirePerm("petty_cash_staff", "can_edit"), async (req, res) => {
  try {
    const { company_id: companyId, project_id: projectId } = req.body || {};
    const from = vendorKey(req.body?.from);
    const to = String(req.body?.to || "").trim().replace(/\s+/g, " ");
    if (!UUID_RE.test(String(companyId || "")) || !UUID_RE.test(String(projectId || "")))
      return res.status(400).json({ error: "Entity and project / office are required" });
    if (!from || !to) return res.status(400).json({ error: "Vendor name is required" });
    if (to.length > 200) return res.status(400).json({ error: "Vendor name is too long" });

    const scope = await pcScope(req, "petty_cash_staff");
    if (!allows(scope, projectId)) return res.status(403).json({ error: "You don't have access to this project / office" });

    const { data, error } = await supabase.from("petty_cash_entries")
      .select("id, vendor_name, particular").eq("company_id", companyId)
      .or(`project_id.eq.${projectId},branch_id.eq.${projectId}`)
      .eq("entry_type", "expense").is("deleted_at", null).neq("vendor_name", "");
    if (error) throw error;
    const rows = (data || []).filter(r => vendorKey(r.vendor_name) === from && r.vendor_name !== to);

    // The hand-added row follows the rename; on a merge the old one goes
    const saved = await savedVendors({ company_id: companyId, project_id: projectId });
    const fromRow = saved.find(r => vendorKey(r.name) === from);
    const toRow = saved.find(r => vendorKey(r.name) === vendorKey(to));
    if (fromRow && toRow && fromRow.id !== toRow.id) {
      const { error: dErr } = await supabase.from("petty_cash_vendors").delete().eq("id", fromRow.id);
      if (dErr) throw dErr;
    } else if (fromRow && fromRow.name !== to) {
      const { error: uErr } = await supabase.from("petty_cash_vendors").update({ name: to }).eq("id", fromRow.id);
      if (uErr) throw uErr;
    }
    if (!rows.length) return res.json({ success: true, updated: 0 });

    const ids = rows.map(r => r.id);
    const { error: upErr } = await supabase.from("petty_cash_entries").update({ vendor_name: to }).in("id", ids);
    if (upErr) throw upErr;

    // Each entry's Activity log shows the change
    const uid = userIdFrom(req);
    const { data: who } = await supabase.from("users").select("name, email").eq("id", uid).maybeSingle();
    await supabase.schema("procurement").from("audit_logs").insert(rows.map(r => ({
      entity_type: "petty_cash_entry", entity_id: String(r.id), entity_name: r.particular || null,
      action: "updated", user_id: uid || null, user_name: who?.name || null, user_email: who?.email || null,
      changes: { Vendor: { from: r.vendor_name, to } },
    })));

    res.json({ success: true, updated: ids.length });
  } catch (err) {
    console.error("Petty cash vendor rename error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Names already in a project / office: hand-added + used on expenses
const takenNames = async (companyId, projectId) => {
  const [saved, { data, error }] = await Promise.all([
    savedVendors({ company_id: companyId, project_id: projectId }),
    supabase.from("petty_cash_entries").select("vendor_name").eq("company_id", companyId)
      .or(`project_id.eq.${projectId},branch_id.eq.${projectId}`)
      .eq("entry_type", "expense").neq("vendor_name", "").is("deleted_at", null),
  ]);
  if (error) throw error;
  return new Set([...saved.map(r => vendorKey(r.name)), ...(data || []).map(r => vendorKey(r.vendor_name))]);
};

const whoIs = async (req) => {
  const { data } = await supabase.from("users").select("name").eq("id", userIdFrom(req)).maybeSingle();
  return data?.name || "";
};

const vendorInsertError = (err) =>
  /petty_cash_vendors/.test(err?.message || "") && !/duplicate/i.test(err?.message || "")
    ? "Vendor list isn't set up yet — run sql/petty_cash_vendors.sql" : err.message;

const vendorRow = (name, by, place) => {
  const row = applyScope({ name, created_by_name: by }, place);
  delete row.project; // that text column is only on entries
  return row;
};

/* POST /api/petty-cash/vendor-directory { company_id, project_id, name } */
router.post("/vendor-directory", requirePerm("petty_cash_staff", "can_add"), async (req, res) => {
  try {
    const name = cleanVendor(req.body?.name);
    if (!name) return res.status(400).json({ error: "Vendor name is required" });
    if (name.length > 200) return res.status(400).json({ error: "Vendor name is too long" });
    let place;
    try { place = await loadProject(req.body?.company_id, req.body?.project_id, req); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    if ((await takenNames(place.company_id, place.id)).has(vendorKey(name)))
      return res.status(409).json({ error: `${name} is already in ${place.name}` });
    const { error } = await supabase.from("petty_cash_vendors").insert(vendorRow(name, await whoIs(req), place));
    if (error) return res.status(/duplicate/i.test(error.message) ? 409 : 500).json({ error: vendorInsertError(error) });
    res.json({ success: true });
  } catch (err) {
    console.error("Petty cash vendor add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/petty-cash/vendor-directory/bulk { company_id, rows: [{ row, name, project_id }] }
   Adds the new ones; names already in their project / office (or repeated in
   the file) are skipped and reported. */
router.post("/vendor-directory/bulk", requirePerm("petty_cash_staff", "can_add"), async (req, res) => {
  try {
    const companyId = req.body?.company_id;
    const list = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!list.length) return res.status(400).json({ error: "No rows to upload" });
    if (list.length > 2000) return res.status(400).json({ error: "Upload at most 2000 vendors at a time" });

    const places = new Map(); // project_id -> { place, taken } | { error }
    const toInsert = [];
    const skipped = [];
    const by = await whoIs(req);
    for (let i = 0; i < list.length; i++) {
      const rowNo = Number(list[i]?.row) || i + 2;
      const name = cleanVendor(list[i]?.name);
      const pid = String(list[i]?.project_id || "");
      if (!name) { skipped.push({ row: rowNo, name: "", reason: "Vendor name is empty" }); continue; }
      if (name.length > 200) { skipped.push({ row: rowNo, name, reason: "Name is too long" }); continue; }
      if (!places.has(pid)) {
        try {
          const place = await loadProject(companyId, pid, req);
          places.set(pid, { place, taken: await takenNames(place.company_id, place.id) });
        } catch (e) { places.set(pid, { error: e.message }); }
      }
      const p = places.get(pid);
      if (p.error) { skipped.push({ row: rowNo, name, reason: p.error }); continue; }
      if (p.taken.has(vendorKey(name))) { skipped.push({ row: rowNo, name, reason: `Already in ${p.place.name}` }); continue; }
      p.taken.add(vendorKey(name));
      toInsert.push(vendorRow(name, by, p.place));
    }
    if (toInsert.length) {
      const { error } = await supabase.from("petty_cash_vendors").insert(toInsert);
      if (error) return res.status(500).json({ error: vendorInsertError(error) });
    }
    res.json({ success: true, added: toInsert.length, skipped });
  } catch (err) {
    console.error("Petty cash vendor bulk error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/petty-cash/vendor-directory/delete { company_id, project_id, name }
   Only a vendor no expense uses (added by hand / Excel). */
router.post("/vendor-directory/delete", requirePerm("petty_cash_staff", "can_delete"), async (req, res) => {
  try {
    const { company_id: companyId, project_id: projectId } = req.body || {};
    const key = vendorKey(req.body?.name);
    if (!UUID_RE.test(String(companyId || "")) || !UUID_RE.test(String(projectId || "")) || !key)
      return res.status(400).json({ error: "Vendor is required" });
    if (!allows(await pcScope(req, "petty_cash_staff"), projectId))
      return res.status(403).json({ error: "You don't have access to this project / office" });
    const { data, error } = await supabase.from("petty_cash_entries").select("vendor_name").eq("company_id", companyId)
      .or(`project_id.eq.${projectId},branch_id.eq.${projectId}`)
      .eq("entry_type", "expense").neq("vendor_name", "").is("deleted_at", null);
    if (error) throw error;
    if ((data || []).some(r => vendorKey(r.vendor_name) === key))
      return res.status(409).json({ error: "This vendor is used on expenses — rename or merge it instead" });
    const row = (await savedVendors({ company_id: companyId, project_id: projectId })).find(r => vendorKey(r.name) === key);
    if (!row) return res.status(404).json({ error: "Vendor not found" });
    const { error: dErr } = await supabase.from("petty_cash_vendors").delete().eq("id", row.id);
    if (dErr) throw dErr;
    res.json({ success: true });
  } catch (err) {
    console.error("Petty cash vendor delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/petty-cash/vendors?company_id= — vendor names used on this
   entity's entries, each with its project / office ({ name, projectId }), so
   the form lists only the vendors of the project the entry is for. Only
   projects / offices the user may see. */
router.get("/vendors", requirePerm("petty_cash_staff", "can_view"), async (req, res) => {
  try {
    if (!UUID_RE.test(String(req.query.company_id || ""))) return res.json({ vendors: [] });
    const { data, error } = await supabase.from("petty_cash_entries")
      .select("vendor_name, project_id, branch_id").eq("company_id", req.query.company_id)
      .neq("vendor_name", "").is("deleted_at", null);
    if (error) throw error;
    const scope = await pcScope(req, "petty_cash_staff");
    const byKey = new Map();
    const saved = (await savedVendors({ company_id: req.query.company_id })).map(r => ({ ...r, vendor_name: r.name }));
    [...(data || []), ...saved].filter(r => pcAllowed(scope, r)).forEach(r => {
      const name = String(r.vendor_name || "").trim();
      const projectId = r.project_id || r.branch_id || null;
      const key = `${projectId}|${name.toLowerCase()}`;
      if (name && !byKey.has(key)) byKey.set(key, { name, projectId });
    });
    res.json({ vendors: [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name)) });
  } catch (err) {
    console.error("Petty cash vendors read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/petty-cash/scopes — active entities and their projects, for the
   Entity / Project pickers in the Petty Cash header. */
router.get("/scopes", requireAnyView, async (req, res) => {
  try {
    const [companiesRes, projectsRes, officesRes] = await Promise.all([
      supabase.schema("organisation").from("companies")
        .select("id, company_code, company_name, gstin, address, state, pincode, status").order("company_name"),
      supabase.from("projects")
        .select("id, company_id, project_code, project_name, address, city, state, is_active")
        .not("company_id", "is", null).order("project_name"),
      supabase.schema("organisation").from("branches")
        .select("id, company_id, code, label, address, city, state, status").order("label"),
    ]);
    if (companiesRes.error) throw companiesRes.error;
    if (projectsRes.error) throw projectsRes.error;
    if (officesRes.error) throw officesRes.error;
    // projects / offices this user may use in Petty Cash (Staff or Accounts)
    const uid = userIdFrom(req);
    const parts = [];
    let every = false;
    for (const key of ["petty_cash_staff", "petty_cash_accounts"]) {
      if (!(await hasPerm(uid, key, "can_view"))) continue;
      const sc = await pcScope(req, key);
      if (sc === null) { every = true; break; }
      parts.push(...sc);
    }
    const scope = every ? null : new Set(parts);
    projectsRes.data = (projectsRes.data || []).filter(p => allows(scope, p.id));
    officesRes.data = (officesRes.data || []).filter(o => allows(scope, o.id));
    res.json({
      companies: (companiesRes.data || []).filter(c => String(c.status || "active").toLowerCase() === "active").map(c => ({
        id: c.id, code: c.company_code || "", name: c.company_name || "", gstin: c.gstin || "",
        address: c.address || "", state: c.state || "", pincode: c.pincode || "",
      })),
      projects: (projectsRes.data || []).map(p => ({
        id: p.id, companyId: p.company_id, code: p.project_code || "", name: p.project_name || "",
        address: p.address || "", city: p.city || "", state: p.state || "", status: p.is_active === false ? "inactive" : "active",
        kind: "project",
      })).concat((officesRes.data || []).filter(o => String(o.status || "active").toLowerCase() === "active").map(o => ({
        id: o.id, companyId: o.company_id, code: o.code || "", name: o.label || "",
        address: o.address || "", city: o.city || "", state: o.state || "", status: "active",
        kind: "office",
      }))),
    });
  } catch (err) {
    console.error("Petty cash scopes read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* Expense voucher numbers — <PREFIX>/(<FY>)/VH-<seq>, e.g. BVPL-WAV/(2026-27)/VH-001, one series per project /
   office and financial year (sql/petty_cash_voucher_series.sql). The number
   is only stored when the entry is saved; the next one is the highest used
   in that series + 1, so a voucher that's never saved doesn't use one up. */
const fyOf = (date) => {
  const [y, m] = String(date || "").split("-").map(Number);
  if (!y || !m) return "";
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};
const formatVoucherNo = (series, fy, seq) => `${series.prefix}/(${fy})/VH-${String(seq).padStart(series.digits, "0")}`;
const VOUCHER_TAKEN = "This voucher number was just used by another entry — remove the voucher, create it again and save.";
const PREFIX_RE = /^[A-Za-z0-9][A-Za-z0-9/-]{0,23}$/;

// The project's / office's saved prefix + digits, or the default
// <company code>-<project / office code>, 3 digits.
const loadSeries = async (scope) => {
  const { data: saved, error } = await supabase.from("petty_cash_voucher_series")
    .select("prefix, digits").eq("scope_id", scope.id).maybeSingle();
  if (error) throw error;
  if (saved) return { prefix: saved.prefix, digits: saved.digits, isDefault: false };
  const [{ data: company }, { data: place }] = await Promise.all([
    supabase.schema("organisation").from("companies").select("company_code").eq("id", scope.company_id).maybeSingle(),
    scope.kind === "project"
      ? supabase.from("projects").select("code:project_code").eq("id", scope.id).maybeSingle()
      : supabase.schema("organisation").from("branches").select("code").eq("id", scope.id).maybeSingle(),
  ]);
  const prefix = [company?.company_code, place?.code].map(s => String(s || "").trim().replace(/[^A-Za-z0-9/-]/g, ""))
    .filter(Boolean).join("-").toUpperCase() || "PC";
  return { prefix, digits: 3, isDefault: true };
};

const scopeCol = (scope) => (scope.kind === "project" ? "project_id" : "branch_id");

// Highest seq used in the series (optionally only entries dated before `before`).
const maxSeq = async (scope, fy, before) => {
  let q = supabase.from("petty_cash_entries").select("voucher_seq")
    .eq(scopeCol(scope), scope.id).eq("voucher_fy", fy).not("voucher_seq", "is", null).is("deleted_at", null)
    .order("voucher_seq", { ascending: false }).limit(1);
  if (before) q = q.lt("entry_date", before);
  const { data, error } = await q;
  if (error) throw error;
  return data?.[0]?.voucher_seq || 0;
};

// voucher_fy / voucher_seq for a saved entry from its voucher details.
// Vouchers made before series numbering (no seq) keep no seq.
const voucherSeqCols = (v, entryDate) => {
  if (!v || !Number.isInteger(v.seq)) return { voucher_fy: null, voucher_seq: null };
  const fy = fyOf(entryDate);
  if (v.fy && v.fy !== fy) throw new Error(`This voucher was numbered for FY ${v.fy}, but the entry date is in FY ${fy} — remove the voucher and create it again.`);
  return { voucher_fy: fy, voucher_seq: v.seq };
};

/* GET /api/petty-cash/voucher-no?company_id=&project_id=&date= — the number
   a new voucher would get (shown on the voucher; stored on save) */
router.get("/voucher-no", requirePerm("petty_cash_staff", "can_view"), async (req, res) => {
  try {
    let scope;
    try { scope = await loadProject(req.query.company_id, req.query.project_id, req); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    const fy = fyOf(req.query.date);
    if (!fy) return res.status(400).json({ error: "Pick the entry date first" });
    const [series, max] = await Promise.all([loadSeries(scope), maxSeq(scope, fy)]);
    res.json({ voucherNo: formatVoucherNo(series, fy, max + 1), fy, seq: max + 1 });
  } catch (err) {
    console.error("Petty cash voucher no peek error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/* GET /api/petty-cash/voucher-series?company_id=&project_id= — prefix and
   digits, plus the next number in the current FY */
router.get("/voucher-series", requirePerm("petty_cash_staff", "can_view"), async (req, res) => {
  try {
    let scope;
    try { scope = await loadProject(req.query.company_id, req.query.project_id, req); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    const fy = fyOf(new Date().toISOString().slice(0, 10));
    const [series, max] = await Promise.all([loadSeries(scope), maxSeq(scope, fy)]);
    res.json({ series, fy, next: formatVoucherNo(series, fy, max + 1) });
  } catch (err) {
    console.error("Petty cash voucher series read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/petty-cash/voucher-series — { companyId, projectId, prefix, digits }.
   New vouchers use it; old ones change only when their month is renumbered. */
router.put("/voucher-series", requirePerm("petty_cash_staff", "can_edit"), async (req, res) => {
  try {
    let scope;
    try { scope = await loadProject(req.body?.companyId, req.body?.projectId, req); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    const prefix = String(req.body?.prefix || "").trim().toUpperCase();
    const digits = Number(req.body?.digits);
    if (!PREFIX_RE.test(prefix)) return res.status(400).json({ error: "Prefix: letters, numbers, - or / only (up to 24)" });
    if (!Number.isInteger(digits) || digits < 1 || digits > 6) return res.status(400).json({ error: "Digits must be 1 to 6" });
    const { error } = await supabase.from("petty_cash_voucher_series").upsert({
      scope_id: scope.id, company_id: scope.company_id, prefix, digits,
      updated_at: new Date().toISOString(), updated_by_name: req.body?.updatedByName || "",
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Petty cash voucher series save error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Vouchers of one project / office dated in `month` (YYYY-MM), in date order.
const monthVouchers = async (scope, month) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) throw Object.assign(new Error("Pick a month"), { status: 400 });
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const { data, error } = await supabase.from("petty_cash_entries")
    .select("id, entry_date, amount, vendor_name, voucher_data, voucher_docs, created_at")
    .eq(scopeCol(scope), scope.id).eq("entry_type", "expense").not("voucher_data", "is", null).is("deleted_at", null)
    .gte("entry_date", from).lt("entry_date", to)
    .order("entry_date").order("created_at").order("id");
  if (error) throw error;
  return { from, fy: fyOf(from), rows: (data || []).filter(r => r.voucher_data?.voucherNo) };
};

/* GET /api/petty-cash/voucher-renumber?company_id=&project_id=&month= — the
   month's vouchers and the suggested start (last number before it + 1) */
router.get("/voucher-renumber", requirePerm("petty_cash_staff", "can_view"), async (req, res) => {
  try {
    let scope;
    try { scope = await loadProject(req.query.company_id, req.query.project_id, req); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    const { from, fy, rows } = await monthVouchers(scope, req.query.month);
    const [series, before] = await Promise.all([loadSeries(scope), maxSeq(scope, fy, from)]);
    res.json({
      fy, series, suggestedStart: before + 1,
      vouchers: rows.map(r => ({
        id: r.id, entryDate: r.entry_date, amount: Number(r.amount) || 0,
        paidTo: r.voucher_data.paidTo || r.vendor_name || "", voucherNo: r.voucher_data.voucherNo,
      })),
    });
  } catch (err) {
    console.error("Petty cash renumber preview error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/* POST /api/petty-cash/voucher-renumber — { companyId, projectId, month, start }.
   Numbers the month's vouchers start, start+1 … in date order. Returns each
   entry's old number and new details; the client then rebuilds each PDF
   (POST /entries/:id/voucher-pdf). */
router.post("/voucher-renumber", requirePerm("petty_cash_staff", "can_edit"), async (req, res) => {
  try {
    let scope;
    try { scope = await loadProject(req.body?.companyId, req.body?.projectId, req); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    const start = Number(req.body?.start);
    if (!Number.isInteger(start) || start < 1) return res.status(400).json({ error: "Start number must be 1 or more" });
    const { fy, rows } = await monthVouchers(scope, req.body?.month);
    if (!rows.length) return res.status(400).json({ error: "No vouchers in this month" });
    const end = start + rows.length - 1;

    // The new range mustn't hit numbers other months of this FY already use.
    const { data: clash, error: cErr } = await supabase.from("petty_cash_entries")
      .select("entry_date, voucher_data").eq(scopeCol(scope), scope.id).eq("voucher_fy", fy).is("deleted_at", null)
      .gte("voucher_seq", start).lte("voucher_seq", end).not("id", "in", `(${rows.map(r => r.id).join(",")})`)
      .order("voucher_seq").limit(1);
    if (cErr) throw cErr;
    if (clash?.length) {
      return res.status(400).json({ error: `Numbers ${start}–${end} overlap ${clash[0].voucher_data?.voucherNo || "a voucher"} (${clash[0].entry_date}). Pick another start, or renumber that month first.` });
    }

    const series = await loadSeries(scope);
    // Clear first so swapping numbers within the month can't trip the unique index.
    const { error: clearErr } = await supabase.from("petty_cash_entries")
      .update({ voucher_seq: null }).in("id", rows.map(r => r.id));
    if (clearErr) throw clearErr;
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const seq = start + i;
      const voucher = { ...r.voucher_data, voucherNo: formatVoucherNo(series, fy, seq), fy, seq };
      const { error } = await supabase.from("petty_cash_entries")
        .update({ voucher_fy: fy, voucher_seq: seq, voucher_data: voucher, updated_at: new Date().toISOString() })
        .eq("id", r.id);
      if (error) throw error;
      out.push({ id: r.id, oldNo: r.voucher_data.voucherNo, voucher });
    }
    res.json({ renumbered: out });
  } catch (err) {
    console.error("Petty cash renumber error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/* POST /api/petty-cash/entries/:id/voucher-pdf — multipart "pdf" + oldNo:
   replaces the entry's Voucher_<oldNo>.pdf attachment (or adds it). */
router.post("/entries/:id/voucher-pdf", requirePerm("petty_cash_staff", "can_edit"), upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "PDF is required" });
    const { data: row, error } = await supabase.from("petty_cash_entries")
      .select("id, voucher_docs, voucher_data").eq("id", req.params.id).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).json({ error: "Entry not found" });
    const safe = (no) => String(no || "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const name = `Voucher_${safe(row.voucher_data?.voucherNo)}.pdf`;
    const path = `entries/${row.id}/voucher/${Date.now()}_0_${name}`;
    await uploadStorageFile(supabase, BUCKET, path, req.file.buffer, "application/pdf");
    const oldName = `Voucher_${safe(req.body?.oldNo)}.pdf`;
    const docs = [...(row.voucher_docs || [])];
    const idx = req.body?.oldNo ? docs.findIndex(p => String(p).endsWith(oldName)) : -1;
    if (idx >= 0) docs[idx] = path; else docs.push(path);
    const { error: uErr } = await supabase.from("petty_cash_entries").update({ voucher_docs: docs }).eq("id", row.id);
    if (uErr) throw uErr;
    res.json({ success: true });
  } catch (err) {
    console.error("Petty cash voucher pdf error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/petty-cash/entries — the full active ledger (balances are
   computed over all of it, so no date filtering server-side) */
router.get("/entries", requirePerm("petty_cash_staff", "can_view"), async (req, res) => {
  try {
    const [peopleById, entriesRes] = await Promise.all([
      loadPeopleMap(),
      scopeFilter(supabase.from("petty_cash_entries").select("*"), req.query).is("deleted_at", null)
        // id breaks ties (bulk-uploaded rows share created_at), so a row
        // doesn't jump around the list after it's edited.
        .order("entry_date", { ascending: false }).order("created_at", { ascending: false }).order("id"),
    ]);
    if (entriesRes.error) throw entriesRes.error;
    const scope = await pcScope(req, "petty_cash_staff");
    const entries = await Promise.all((entriesRes.data || []).filter(r => pcAllowed(scope, r)).map(r => mapEntry(r, peopleById)));
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
    try {
      row = buildRow(req.body);
      const voucherData = parseVoucherData(req.body, row.entry_type);
      if (voucherData !== undefined) Object.assign(row, { voucher_data: voucherData }, voucherSeqCols(voucherData, row.entry_date));
      applyScope(row, await loadProject(req.body.companyId, req.body.projectId, req));
    } catch (e) { return res.status(400).json({ error: e.message }); }

    const { data: created, error: insertError } = await supabase
      .from("petty_cash_entries")
      .insert({ ...row, created_by_id: req._authUserId || null, created_by_name: req.body.createdByName || "" })
      .select("*")
      .single();
    if (insertError?.code === "23505") return res.status(409).json({ error: VOUCHER_TAKEN });
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
    try {
      row = buildRow(req.body);
      const voucherData = parseVoucherData(req.body, row.entry_type);
      if (voucherData !== undefined) Object.assign(row, { voucher_data: voucherData }, voucherSeqCols(voucherData, row.entry_date));
      applyScope(row, await loadProject(req.body.companyId, req.body.projectId, req));
    } catch (e) { return res.status(400).json({ error: e.message }); }

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
    if (error?.code === "23505") return res.status(409).json({ error: VOUCHER_TAKEN });
    if (error) throw error;

    await rememberLocation(row.location);
    res.json({ entry: await mapEntry(updated, await loadPeopleMap()) });
  } catch (err) {
    console.error("Petty cash update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/petty-cash/entries/:id/voucher — saved Create-Voucher details
   (kept out of the list response; only needed when editing a voucher) */
router.get("/entries/:id/voucher", requirePerm("petty_cash_staff", "can_view"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("petty_cash_entries").select("voucher_data")
      .eq("id", req.params.id).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    res.json({ voucher: data?.voucher_data || null });
  } catch (err) {
    console.error("Petty cash voucher read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/petty-cash/entries/:id/voucher — multipart "pdf" + "voucherData"
   (JSON). Saves a system voucher on an expense that has none yet: its
   details + number, and the PDF in its Voucher files. Used by Create Vouchers
   (many at once); 409 when the number was taken meanwhile, so the caller can
   fetch the next one and try again. */
router.post("/entries/:id/voucher", requirePerm("petty_cash_staff", "can_edit"), upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "PDF is required" });
    const { data: row, error } = await supabase.from("petty_cash_entries")
      .select("id, entry_type, entry_date, particular, project_id, branch_id, voucher_data, voucher_docs")
      .eq("id", req.params.id).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).json({ error: "Entry not found" });
    if (!pcAllowed(await pcScope(req, "petty_cash_staff"), row)) return res.status(403).json({ error: "This project / office isn't in your Petty Cash access" });
    if (row.entry_type !== "expense") return res.status(400).json({ error: "Only an expense can have a voucher" });
    if (row.voucher_data?.voucherNo) return res.status(409).json({ error: `Already has voucher ${row.voucher_data.voucherNo}`, exists: true });

    let voucher, seqCols;
    try {
      voucher = parseVoucherData(req.body, "expense");
      if (!voucher || !Number.isInteger(voucher.seq)) throw new Error("Invalid voucher details");
      seqCols = voucherSeqCols(voucher, row.entry_date);
    } catch (e) { return res.status(400).json({ error: e.message }); }

    const safe = String(voucher.voucherNo).replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `entries/${row.id}/voucher/${Date.now()}_0_Voucher_${safe}.pdf`;
    await uploadStorageFile(supabase, BUCKET, path, req.file.buffer, "application/pdf");
    const { error: uErr } = await supabase.from("petty_cash_entries")
      .update({ voucher_data: voucher, ...seqCols, voucher_docs: [...(row.voucher_docs || []), path] })
      .eq("id", row.id);
    if (uErr) {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      if (uErr.code === "23505") return res.status(409).json({ error: "Voucher number already used", taken: true });
      throw uErr;
    }

    const uid = userIdFrom(req);
    const { data: who } = await supabase.from("users").select("name, email").eq("id", uid).maybeSingle();
    await supabase.schema("procurement").from("audit_logs").insert({
      entity_type: "petty_cash_entry", entity_id: String(row.id), entity_name: row.particular || null,
      action: "updated", user_id: uid || null, user_name: who?.name || null, user_email: who?.email || null,
      changes: { Voucher: { from: "—", to: voucher.voucherNo } },
    });
    res.json({ success: true, voucherNo: voucher.voucherNo });
  } catch (err) {
    console.error("Petty cash voucher create error:", err.message);
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
    let project;
    try { project = await loadProject(req.body.companyId, req.body.projectId, req); }
    catch (e) { return res.status(400).json({ error: e.message }); }

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
        return applyScope(buildRow({ ...r, personId: resolve(r.personName), fromPersonId: resolve(r.fromPersonName) }), project);
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

    const { data, error } = await scopeFilter(supabase.from("petty_cash_entries").select("*"), req.query)
      .is("deleted_at", null)
      .in("entry_type", ["expense", "received"])
      .lte("entry_date", to)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id");
    if (error) throw error;

    let opening = 0, received = 0, expense = 0;
    const inRange = [];
    const scope = await pcScope(req, "petty_cash_accounts");
    for (const r of (data || []).filter(x => pcAllowed(scope, x))) {
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
      vendorName:   r.vendor_name || "",
      category:    r.category || "",
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
