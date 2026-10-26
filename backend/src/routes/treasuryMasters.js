// Treasury › Masters: Treasury's own parties, our companies, projects (and
// their bank accounts) plus the Purpose list. Kept apart from the ERP's
// vendors / companies / projects on purpose — "Import from ERP" copies
// records in, after which the two are independent. Rides on the Party
// Ledger permission (treasury_ledger).
//
// Entries store names as plain text, so renaming a master carries the new
// name over to existing entries too (same as the old quick-add lists did).
const express  = require("express");
const router   = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { requirePerm } = require("../helpers/permHelper");
const { niceName } = require("../helpers/niceName");

const view = requirePerm("treasury_ledger", "can_view");
const add  = requirePerm("treasury_ledger", "can_add");
const edit = requirePerm("treasury_ledger", "can_edit");

const txt = (v) => String(v ?? "").trim();
const key = (v) => txt(v).replace(/\s+/g, " ").toLowerCase();

// kind → table, the entry column holding its name, and the editable fields
const KINDS = {
  parties:   { table: "treasury_parties",   entryCol: "party_name",   owner: "party",
               fields: ["contact_person", "mobile", "email", "pan", "gstin", "address", "city", "state", "notes"], label: "Party" },
  companies: { table: "treasury_companies", entryCol: "company_name", owner: "company",
               fields: ["code", "pan", "gstin", "address"], label: "Company" },
  projects:  { table: "treasury_projects",  entryCol: "site_name",
               fields: ["code", "city", "state", "address"], label: "Project" },
};

const mapAccount = (a) => ({
  id: a.id, bankName: a.bank_name, accountNumber: a.account_number, ifsc: a.ifsc,
  holderName: a.holder_name, branch: a.branch, isPrimary: a.is_primary, isActive: a.is_active,
  // other accounts only: whose account it is
  label: a.label || "",
});
const camel = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));

/* GET /api/treasury/masters — everything the Masters page and the entry form need */
router.get("/", view, async (_req, res) => {
  try {
    const [parties, companies, projects, accounts, entries, categories] = await Promise.all([
      supabase.from("treasury_parties").select("*").order("name"),
      supabase.from("treasury_companies").select("*").order("name"),
      supabase.from("treasury_projects").select("*").order("name"),
      supabase.from("treasury_bank_accounts").select("*").order("is_primary", { ascending: false }).order("created_at"),
      supabase.from("treasury_ledger_entries").select("party_name, company_name, site_name, category").is("deleted_at", null),
      supabase.from("treasury_ledger_coded_values").select("code, value").eq("field_key", "category").order("code"),
    ]);
    for (const r of [parties, companies, projects, accounts, entries, categories]) if (r.error) throw r.error;

    // how many entries use each name — shown in the lists
    const used = (col) => {
      const m = new Map();
      (entries.data || []).forEach(e => { const k = key(e[col]); if (k) m.set(k, (m.get(k) || 0) + 1); });
      return m;
    };
    const byOwner = new Map();
    (accounts.data || []).forEach(a => {
      const k = `${a.owner_type}:${a.owner_id}`;
      byOwner.set(k, [...(byOwner.get(k) || []), mapAccount(a)]);
    });
    const shape = (rows, col, owner) => {
      const counts = used(col);
      return (rows || []).map(r => ({
        ...camel(r), name: niceName(r.name), openingBalance: Number(r.opening_balance) || 0,
        entries: counts.get(key(r.name)) || 0,
        ...(owner ? { accounts: byOwner.get(`${owner}:${r.id}`) || [] } : {}),
      }));
    };
    const categoryCounts = used("category");
    res.json({
      parties: shape(parties.data, "party_name", "party"),
      companies: shape(companies.data, "company_name", "company"),
      projects: shape(projects.data, "site_name"),
      categories: (categories.data || []).map(p => ({ code: p.code, value: p.value, entries: categoryCounts.get(key(p.value)) || 0 })),
      // accounts that belong to no company (a director's personal account…)
      otherAccounts: (accounts.data || []).filter(a => a.owner_type === "other").map(mapAccount),
    });
  } catch (err) {
    console.error("Treasury masters read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const nameTaken = async (table, name, exceptId) => {
  const { data } = await supabase.from(table).select("id, name").ilike("name", name.replace(/[%_]/g, "\\$&"));
  return (data || []).some(r => key(r.name) === key(name) && r.id !== exceptId);
};

const pickFields = (kind, body) => {
  const row = {};
  KINDS[kind].fields.forEach(f => {
    const camelKey = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (body[camelKey] !== undefined || body[f] !== undefined) row[f] = txt(body[camelKey] ?? body[f]);
  });
  if (kind === "parties" && body.openingBalance !== undefined) row.opening_balance = Number(body.openingBalance) || 0;
  return row;
};

/* POST /api/treasury/masters/:kind — new party / company / project
   (an optional first bank account can come along as body.account) */
router.post("/:kind", add, async (req, res, next) => {
  const k = KINDS[req.params.kind];
  if (!k) return next(); // /accounts, /import… are their own routes
  try {
    const name = niceName(txt(req.body.name));
    if (!name) return res.status(400).json({ error: `${k.label} name is required` });
    if (await nameTaken(k.table, name)) return res.status(409).json({ error: `"${name}" is already in the list` });
    const { data, error } = await supabase.from(k.table).insert({ name, ...pickFields(req.params.kind, req.body) }).select("*").single();
    if (error) throw error;
    // bank accounts that came with the new record (body.accounts, or one body.account);
    // the one marked primary — else the first — becomes the primary
    const accs = (Array.isArray(req.body.accounts) ? req.body.accounts : [req.body.account])
      .filter(a => a && txt(a.accountNumber))
      .filter((a, i, all) => all.findIndex(b => txt(b.accountNumber) === txt(a.accountNumber)) === i);
    if (k.owner && accs.length) {
      const primaryAt = Math.max(0, accs.findIndex(a => a.isPrimary));
      const { error: accErr } = await supabase.from("treasury_bank_accounts").insert(accs.map((acc, i) => ({
        // every row lists every column: a bulk insert fills missing ones with null, not the default
        owner_type: k.owner, owner_id: data.id, account_number: txt(acc.accountNumber), bank_name: txt(acc.bankName),
        ifsc: txt(acc.ifsc).toUpperCase(), holder_name: txt(acc.holderName), branch: txt(acc.branch),
        is_primary: i === primaryAt, is_active: true,
      })));
      if (accErr) throw accErr;
    }
    res.json({ item: camel(data) });
  } catch (err) {
    console.error(`Treasury ${k.label} create error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/treasury/masters/:kind/:id — edit; a rename is carried over to entries */
router.put("/:kind/:id", edit, async (req, res, next) => {
  const k = KINDS[req.params.kind];
  if (!k) return next();
  try {
    const name = niceName(txt(req.body.name));
    if (!name) return res.status(400).json({ error: `${k.label} name is required` });
    const { data: existing } = await supabase.from(k.table).select("*").eq("id", req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ error: `${k.label} not found` });
    if (await nameTaken(k.table, name, existing.id)) return res.status(409).json({ error: `"${name}" is already in the list` });

    const patch = { name, ...pickFields(req.params.kind, req.body), updated_at: new Date().toISOString() };
    if (req.body.isActive !== undefined) patch.is_active = !!req.body.isActive;
    const { data, error } = await supabase.from(k.table).update(patch).eq("id", existing.id).select("*").single();
    if (error) throw error;

    if (key(existing.name) !== key(name) || existing.name !== name) {
      // every spelling of the old name (entries match names ignoring case)
      const { data: rows } = await supabase.from("treasury_ledger_entries").select(`id, ${k.entryCol}`).ilike(k.entryCol, existing.name.trim());
      const ids = (rows || []).filter(r => key(r[k.entryCol]) === key(existing.name)).map(r => r.id);
      if (ids.length) {
        const { error: renameErr } = await supabase.from("treasury_ledger_entries").update({ [k.entryCol]: name }).in("id", ids);
        if (renameErr) throw renameErr;
      }
    }
    res.json({ item: camel(data) });
  } catch (err) {
    console.error(`Treasury ${k.label} update error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PATCH /api/treasury/masters/:kind/:id/active — { isActive } (never deleted) */
router.patch("/:kind/:id/active", edit, async (req, res, next) => {
  const k = KINDS[req.params.kind];
  if (!k) return next();
  const { error } = await supabase.from(k.table).update({ is_active: !!req.body.isActive, updated_at: new Date().toISOString() }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* ── Bank accounts ───────────────────────────────────────────────────── */
const accountRow = (b) => ({
  bank_name: txt(b.bankName), account_number: txt(b.accountNumber), ifsc: txt(b.ifsc).toUpperCase(),
  holder_name: txt(b.holderName), branch: txt(b.branch),
  ...(b.label !== undefined ? { label: niceName(txt(b.label)) } : {}),
});
const makePrimary = async (acc) => {
  await supabase.from("treasury_bank_accounts").update({ is_primary: false })
    .eq("owner_type", acc.owner_type).eq("owner_id", acc.owner_id).neq("id", acc.id);
  await supabase.from("treasury_bank_accounts").update({ is_primary: true, is_active: true }).eq("id", acc.id);
};

/* POST /api/treasury/masters/accounts — { ownerType, ownerId, bankName, accountNumber, ifsc, holderName, branch, isPrimary }
   ownerType "other" (no owner) takes { label } instead: an account of no company */
router.post("/accounts", add, async (req, res) => {
  try {
    const ownerType = req.body.ownerType;
    if (ownerType === "other") {
      const row = accountRow({ ...req.body, label: req.body.label ?? "" });
      if (!row.account_number) return res.status(400).json({ error: "Account number is required" });
      if (!row.label) return res.status(400).json({ error: "Say whose account this is" });
      const { data: same } = await supabase.from("treasury_bank_accounts").select("id")
        .eq("owner_type", "other").eq("account_number", row.account_number).maybeSingle();
      if (same) return res.status(409).json({ error: "This account is already in Other Accounts" });
      const { data, error } = await supabase.from("treasury_bank_accounts")
        .insert({ owner_type: "other", owner_id: null, is_primary: false, is_active: true, ...row }).select("*").single();
      if (error) throw error;
      return res.json({ account: mapAccount(data) });
    }
    if (!["party", "company"].includes(ownerType) || !req.body.ownerId) return res.status(400).json({ error: "Pick a party or company first" });
    const row = accountRow(req.body);
    if (!row.account_number) return res.status(400).json({ error: "Account number is required" });
    const { data: same } = await supabase.from("treasury_bank_accounts").select("id")
      .eq("owner_type", ownerType).eq("owner_id", req.body.ownerId).eq("account_number", row.account_number).maybeSingle();
    if (same) return res.status(409).json({ error: "This account is already added" });
    const { count } = await supabase.from("treasury_bank_accounts").select("id", { count: "exact", head: true })
      .eq("owner_type", ownerType).eq("owner_id", req.body.ownerId).eq("is_active", true);
    const { data, error } = await supabase.from("treasury_bank_accounts")
      .insert({ owner_type: ownerType, owner_id: req.body.ownerId, ...row }).select("*").single();
    if (error) throw error;
    // the first account, or one marked primary, becomes the primary
    if (!count || req.body.isPrimary) await makePrimary(data);
    res.json({ account: mapAccount({ ...data, is_primary: !count || !!req.body.isPrimary }) });
  } catch (err) {
    console.error("Treasury account create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/treasury/masters/accounts/:id — edit details (old entries keep their snapshot) */
router.put("/accounts/:id", edit, async (req, res) => {
  try {
    const row = accountRow(req.body);
    if (!row.account_number) return res.status(400).json({ error: "Account number is required" });
    const { data, error } = await supabase.from("treasury_bank_accounts")
      .update({ ...row, updated_at: new Date().toISOString() }).eq("id", req.params.id).select("*").single();
    if (error) throw error;
    res.json({ account: mapAccount(data) });
  } catch (err) {
    console.error("Treasury account update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PATCH /api/treasury/masters/accounts/:id/primary */
router.patch("/accounts/:id/primary", edit, async (req, res) => {
  const { data: acc } = await supabase.from("treasury_bank_accounts").select("*").eq("id", req.params.id).maybeSingle();
  if (!acc) return res.status(404).json({ error: "Account not found" });
  if (acc.owner_type === "other") return res.status(400).json({ error: "Other accounts have no primary" });
  await makePrimary(acc);
  res.json({ success: true });
});

/* PATCH /api/treasury/masters/accounts/:id/active — { isActive }; an inactive
   account can't stay primary — the next active one takes over */
router.patch("/accounts/:id/active", edit, async (req, res) => {
  try {
    const { data: acc } = await supabase.from("treasury_bank_accounts").select("*").eq("id", req.params.id).maybeSingle();
    if (!acc) return res.status(404).json({ error: "Account not found" });
    const isActive = !!req.body.isActive;
    await supabase.from("treasury_bank_accounts")
      .update({ is_active: isActive, is_primary: isActive ? acc.is_primary : false, updated_at: new Date().toISOString() }).eq("id", acc.id);
    if (!isActive && acc.is_primary) {
      const { data: next } = await supabase.from("treasury_bank_accounts").select("*")
        .eq("owner_type", acc.owner_type).eq("owner_id", acc.owner_id).eq("is_active", true).order("created_at").limit(1).maybeSingle();
      if (next) await makePrimary(next);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Categories (the coded list, shown as CAT-n) ──────────────────────── */
/* PUT /api/treasury/masters/categories/:code — rename; carried over to entries */
router.put("/categories/:code", edit, async (req, res) => {
  try {
    const value = txt(req.body.value);
    if (!value) return res.status(400).json({ error: "Category is required" });
    const { data: existing } = await supabase.from("treasury_ledger_coded_values").select("*")
      .eq("field_key", "category").eq("code", Number(req.params.code)).maybeSingle();
    if (!existing) return res.status(404).json({ error: "Category not found" });
    const { error } = await supabase.from("treasury_ledger_coded_values").update({ value })
      .eq("field_key", "category").eq("code", existing.code);
    if (error) throw error;
    if (existing.value !== value) {
      const { error: e2 } = await supabase.from("treasury_ledger_entries").update({ category: value }).eq("category", existing.value);
      if (e2) throw e2;
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Treasury category update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── Import from ERP ──────────────────────────────────────────────────── */
const ERP = {
  parties: async () => {
    const { data, error } = await supabase.schema("procurement").from("vendors")
      .select("id, vendor_name, vendor_code, contact_person, mobile, email, pan, gstin, address, bank_name, account_number, ifsc_code, account_holder, bank_branch")
      .is("deleted_at", null).order("vendor_name");
    if (error) throw error;
    return (data || []).filter(v => txt(v.vendor_name)).map(v => ({
      erpId: v.id, name: niceName(txt(v.vendor_name)), sub: [v.vendor_code, v.gstin].filter(Boolean).join(" · "),
      row: { party_type: "Vendor", contact_person: txt(v.contact_person), mobile: txt(v.mobile), email: txt(v.email), pan: txt(v.pan), gstin: txt(v.gstin), address: txt(v.address), source: `erp-vendor:${v.id}` },
      account: { bankName: v.bank_name, accountNumber: v.account_number, ifsc: v.ifsc_code, holderName: v.account_holder, branch: v.bank_branch },
    }));
  },
  companies: async () => {
    const { data, error } = await supabase.schema("organisation").from("companies")
      .select("id, company_name, company_code, pan, gstin, address, bank_name, account_no, ifsc_code, account_holder_name, bank_branch").order("company_name");
    if (error) throw error;
    return (data || []).filter(c => txt(c.company_name)).map(c => ({
      erpId: c.id, name: niceName(txt(c.company_name)), sub: [c.company_code, c.gstin].filter(Boolean).join(" · "),
      row: { code: txt(c.company_code), pan: txt(c.pan), gstin: txt(c.gstin), address: txt(c.address), source: `erp-company:${c.id}` },
      account: { bankName: c.bank_name, accountNumber: c.account_no, ifsc: c.ifsc_code, holderName: c.account_holder_name, branch: c.bank_branch },
    }));
  },
  projects: async () => {
    const { data, error } = await supabase.from("projects").select("id, project_name, project_code, city, state, address").order("project_name");
    if (error) throw error;
    return (data || []).filter(p => txt(p.project_name)).map(p => ({
      erpId: p.id, name: niceName(txt(p.project_name)), sub: [p.project_code, p.city, p.state].filter(Boolean).join(" · "),
      row: { code: txt(p.project_code), city: txt(p.city), state: txt(p.state), address: txt(p.address), source: `erp-project:${p.id}` },
    }));
  },
};

/* GET /api/treasury/masters/erp/:kind — ERP records to pick from; ones already
   in the Treasury list (same name) are flagged */
router.get("/erp/:kind", view, async (req, res) => {
  const k = KINDS[req.params.kind];
  if (!k) return res.status(404).json({ error: "Unknown list" });
  try {
    const [items, { data: mine }] = await Promise.all([ERP[req.params.kind](), supabase.from(k.table).select("name")]);
    const have = new Set((mine || []).map(r => key(r.name)));
    res.json({ items: items.map(({ erpId, name, sub, account }) => ({
      erpId, name, sub, hasAccount: !!txt(account?.accountNumber), alreadyAdded: have.has(key(name)),
    })) });
  } catch (err) {
    console.error("Treasury ERP list error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/treasury/masters/import/:kind — { erpIds: [] }: copies those ERP
   records (with their bank account) into the Treasury list; names already
   there are skipped */
router.post("/import/:kind", add, async (req, res) => {
  const k = KINDS[req.params.kind];
  if (!k) return res.status(404).json({ error: "Unknown list" });
  try {
    const wanted = new Set((req.body.erpIds || []).map(String));
    const items = (await ERP[req.params.kind]()).filter(i => wanted.has(String(i.erpId)));
    const { data: mine } = await supabase.from(k.table).select("name");
    const have = new Set((mine || []).map(r => key(r.name)));
    let added = 0, skipped = 0;
    for (const item of items) {
      if (have.has(key(item.name))) { skipped++; continue; }
      const { data, error } = await supabase.from(k.table).insert({ name: item.name, ...item.row }).select("id").single();
      if (error) { skipped++; continue; }
      have.add(key(item.name));
      added++;
      if (k.owner && txt(item.account?.accountNumber)) {
        await supabase.from("treasury_bank_accounts").insert({
          owner_type: k.owner, owner_id: data.id, is_primary: true, ...accountRow(item.account),
        });
      }
    }
    res.json({ added, skipped });
  } catch (err) {
    console.error("Treasury ERP import error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
