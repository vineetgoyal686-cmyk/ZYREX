// ZyAI — read-only tools the model can call to look things up in the
// ERP. Every tool runs as the person asking: it checks their permission for
// that module first and, for orders / intakes, their project access, so the
// AI never shows anyone more than the app itself would. Treasury and salary
// data are deliberately not exposed.
const supabase = require("./supabaseHelper");
const { hasPerm } = require("./permHelper");

const MAX_ROWS = 25;
const num = (v) => Number(v) || 0;
const lc = (v) => String(v || "").toLowerCase();
const day = (v) => (v ? String(v).slice(0, 10) : null);
// order_type is "Supply" for a purchase order; anything else (SITC...) is a work order
const orderKind = (t) => (t === "Supply" ? "PO" : "WO");
const orderValue = (o) => num(o.totals?.grandTotal) || num(o.totals?.subtotal);
const inRange = (d, from, to) => (!from || (d && d >= from)) && (!to || (d && d <= to));
// Codes are saved inconsistently ("B-47", "B47", "b 47"), so text matches
// also compare with spaces / dashes / slashes stripped.
const squash = (v) => lc(v).replace(/[^a-z0-9]/g, "");
const matches = (q, ...vals) => {
  const ql = lc(q).trim(), qs = squash(q);
  return vals.some(v => (ql && lc(v).includes(ql)) || (qs && squash(v).includes(qs)));
};

// Project ids the user may see; null = no restriction (same rule as /auth/init)
async function allowedProjectIds(user) {
  if (["global_admin", "super_admin"].includes(user.role)) return null;
  let ids = [...(user.profile_permissions?.allowed_projects || [])];
  if (user.access_profile_ids?.length) {
    const { data } = await supabase.from("designations").select("project_access").in("id", user.access_profile_ids);
    (data || []).forEach(d => ids.push(...(d.project_access || [])));
  }
  ids = [...new Set(ids)];
  return ids.length ? new Set(ids) : null;
}

const canView = async (user, keys) => {
  for (const k of keys) if (await hasPerm(user.id, k, "can_view")) return true;
  return false;
};
const denied = (what) => ({ error: `This user doesn't have access to ${what}.` });

/* ── Tool declarations (Gemini function-calling schema) ── */
const DECLARATIONS = [
  {
    name: "find_anything",
    description: "Find what a name, code or number refers to in the ERP — a site / project (e.g. B-47), company, vendor, order number or intake number. Call this FIRST whenever the user mentions something you don't already know. For a site it also gives its orders and intakes count.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "The name, code or number to look up, e.g. 'B-47', 'RSTF', 'Gupta Steel', 'PO/RSTF/001'" } },
      required: ["query"],
    },
  },
  {
    name: "search_orders",
    description: "Search purchase / work orders. Use for questions about orders, POs, WOs, order values, pending or issued orders, a vendor's orders, or a site's orders. Returns matching orders plus exact counts and values — overall, by type (PO / WO) and by status. Always report these counts; never count the order rows yourself.",
    parameters: {
      type: "object",
      properties: {
        query:     { type: "string", description: "Free text matched against order number, subject, vendor and site" },
        type:      { type: "string", enum: ["PO", "WO"], description: "PO = purchase / supply order, WO = work order; leave empty for both" },
        status:    { type: "string", description: "Exact order status, e.g. Draft, Review, Pending Approval, Pending Issue, Issued, Amended, Recalled, Cancelled" },
        vendor:    { type: "string", description: "Part of the vendor name" },
        site:      { type: "string", description: "Part of the site / project code or name" },
        date_from: { type: "string", description: "Earliest order date, YYYY-MM-DD" },
        date_to:   { type: "string", description: "Latest order date, YYYY-MM-DD" },
      },
    },
  },
  {
    name: "search_intakes",
    description: "Search intakes (material requisitions / indents raised by sites). Use for questions about intakes, requisitions, what a site has asked for, or intake status.",
    parameters: {
      type: "object",
      properties: {
        query:     { type: "string", description: "Free text matched against intake number, name, site and requested-by" },
        status:    { type: "string", description: "Intake status, e.g. draft, submitted, in_review, approved, assigned, rejected, closed" },
        site:      { type: "string", description: "Part of the site / project code or name" },
        date_from: { type: "string", description: "Earliest created date, YYYY-MM-DD" },
        date_to:   { type: "string", description: "Latest created date, YYYY-MM-DD" },
      },
    },
  },
  {
    name: "vendor_info",
    description: "Look up vendors in the vendor master: contact details, codes, and how much business they got (number and value of issued orders). For a specific vendor it also returns their filled / missing details (bank, PAN, address...) and which documents are uploaded or missing. With `missing` it lists every vendor that has NOT filled a detail or uploaded a document (e.g. vendors without PAN, without GST certificate, without bank details). Use for any question about a specific vendor, listing vendors, or vendors with incomplete data.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Part of the vendor name or vendor code; leave empty to list top vendors by order value" },
        missing: { type: "string", description: "List vendors missing this detail or document. One of: PAN, PAN Card, GSTIN, GST Certificate, Aadhar No, Aadhar Card, MSME No, MSME Certificate, Cancel Cheque, Certificate of Incorporation, Contact Person, Address, Email, Mobile, Firm Type, Bank Name, Account Holder, Account Number, IFSC, Bank Branch — or 'bank details', 'any document', 'any detail'. A bare detail name means the number/text field only (\"PAN\" = PAN number, \"GST\" = GSTIN); say \"PAN Card\" / \"GST Certificate\" / \"documents\" for uploaded files." },
      },
    },
  },
  {
    name: "petty_cash_summary",
    description: "Petty cash: money received from accounts, money given between staff, and expenses. Use for questions about petty cash spending, who spent what, expense categories, or petty cash balances.",
    parameters: {
      type: "object",
      properties: {
        person:    { type: "string", description: "Part of the staff member's name" },
        category:  { type: "string", description: "Expense category" },
        query:     { type: "string", description: "Free text matched against the expense description and vendor" },
        date_from: { type: "string", description: "Earliest date, YYYY-MM-DD" },
        date_to:   { type: "string", description: "Latest date, YYYY-MM-DD" },
      },
    },
  },
  {
    name: "web_search",
    description: "Search the internet with Google. Use for anything outside the ERP: market rates, GST / tax rules, laws, standards, news, general knowledge.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "What to search for" } },
      required: ["query"],
    },
  },
];

/* ── Executors ── */
async function searchOrders(user, a) {
  if (!(await canView(user, ["order", "master_data_orders_tab"]))) return denied("orders");
  const allowed = await allowedProjectIds(user);
  const { data, error } = await supabase.schema("procurement").from("purchase_orders")
    .select("id, order_number, order_type, subject, status, totals, site_id, date_of_creation, created_at, snapshot, vendors(vendor_name)")
    .neq("status", "Deleted").order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data || []).map(o => {
    const site = o.snapshot?.site || {};
    return {
      order_number: o.order_number || "(draft)",
      date: day(o.date_of_creation || o.created_at),
      status: o.status, type: orderKind(o.order_type),
      vendor: o.vendors?.vendor_name || o.snapshot?.vendor?.vendorName || o.snapshot?.vendor?.vendor_name || "",
      site: site.siteCode || site.site_code || site.projectCode || site.siteName || site.projectName || "",
      site_name: site.siteName || site.projectName || "",
      subject: o.subject || "",
      value: orderValue(o),
      _site_id: o.site_id,
      _site_keys: [site.siteCode, site.site_code, site.projectCode, site.siteName, site.projectName],
    };
  }).filter(o =>
    (!allowed || allowed.has(o._site_id)) &&
    (!a.type || o.type === String(a.type).toUpperCase()) &&
    (!a.status || lc(o.status) === lc(a.status)) &&
    (!a.vendor || matches(a.vendor, o.vendor)) &&
    (!a.site || matches(a.site, ...o._site_keys)) &&
    inRange(o.date, a.date_from, a.date_to) &&
    (!a.query || matches(a.query, o.order_number, o.subject, o.vendor, ...o._site_keys))
  );
  // Newest order date first, so "latest" really is the first row
  rows.sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const byStatus = {}, byType = { PO: { count: 0, value: 0 }, WO: { count: 0, value: 0 } };
  rows.forEach(o => {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    byType[o.type].count++; byType[o.type].value += o.value;
  });
  return {
    total_matching: rows.length,
    total_value: rows.reduce((s, o) => s + o.value, 0),
    // The site codes actually matched, so the reply can say "B-47 is saved as B47"
    ...(a.site ? { matched_sites: [...new Set(rows.map(o => o.site).filter(Boolean))] } : {}),
    by_type: byType,
    count_by_status: byStatus,
    orders: rows.slice(0, MAX_ROWS).map(({ _site_id, _site_keys, ...o }) => o),
    note: rows.length > MAX_ROWS ? `Showing the latest ${MAX_ROWS} of ${rows.length}.` : undefined,
  };
}

async function searchIntakes(user, a) {
  if (!(await canView(user, ["intake", "master_data_intakes"]))) return denied("intakes");
  const allowed = await allowedProjectIds(user);
  const { data, error } = await supabase.schema("store").from("intakes")
    .select("*, intake_items(id)").order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data || []).map(i => ({
    intake_number: i.intake_number || "(draft)",
    name: i.name || "",
    date: day(i.created_at),
    status: i.status,
    priority: i.priority || "",
    site: i.site_code || i.site_name || "",
    requested_by: i.requisition_by || "",
    required_by: day(i.available_by),
    items: (i.intake_items || []).length,
    _site_id: i.site_id,
    _site_name: i.site_name || "",
  })).filter(i =>
    (!allowed || allowed.has(i._site_id)) &&
    (!a.status || lc(i.status) === lc(a.status)) &&
    (!a.site || matches(a.site, i.site, i._site_name)) &&
    inRange(i.date, a.date_from, a.date_to) &&
    (!a.query || matches(a.query, i.intake_number, i.name, i.site, i._site_name, i.requested_by))
  );
  rows.sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const byStatus = {};
  rows.forEach(i => { byStatus[i.status] = (byStatus[i.status] || 0) + 1; });
  return {
    total_matching: rows.length, count_by_status: byStatus,
    intakes: rows.slice(0, MAX_ROWS).map(({ _site_id, _site_name, ...i }) => i),
    note: rows.length > MAX_ROWS ? `Showing the latest ${MAX_ROWS} of ${rows.length}.` : undefined,
  };
}

// The 8 document slots in the vendor form (Vendor Master → Documents tab)
const VENDOR_DOCS = [
  ["Aadhar Card", "doc_aadhaar_url"], ["PAN Card", "doc_pan_url"], ["GST Certificate", "doc_gst_url"],
  ["MSME Certificate", "doc_msme_url"], ["Cancel Cheque", "doc_cancel_cheque_url"],
  ["Certificate of Incorporation", "doc_coi_url"], ["Other Document 1", "doc_other_url"], ["Other Document 2", "doc_other2_url"],
];
const VENDOR_FIELDS = [
  ["Contact Person", "contact_person"], ["Address", "address"], ["PAN", "pan"], ["GSTIN", "gstin"], ["Email", "email"], ["Mobile", "mobile"], ["Aadhar No", "aadhar_no"],
  ["MSME No", "msme_number"], ["Firm Type", "firm_type"], ["Bank Name", "bank_name"], ["Account Holder", "account_holder"],
  ["Account Number", "account_number"], ["IFSC", "ifsc_code"], ["Bank Branch", "bank_branch"],
];
function vendorProfile(v) {
  const has = (k) => String(v[k] || "").trim() !== "";
  const details = {};
  VENDOR_FIELDS.forEach(([label, k]) => {
    if (!has(k)) return;
    // Only the last 4 digits of the account number
    details[label] = k === "account_number" ? `XXXX${String(v[k]).trim().slice(-4)}` : v[k];
  });
  return {
    details,
    missing_details: VENDOR_FIELDS.filter(([, k]) => !has(k)).map(([l]) => l),
    documents_uploaded: VENDOR_DOCS.filter(([, k]) => has(k)).map(([l]) => l),
    documents_missing: VENDOR_DOCS.filter(([, k]) => !has(k)).map(([l]) => l),
  };
}

// What a `missing` question checks. Groups first, then a detail / document by
// label. A bare name means the detail itself ("PAN" → PAN number, not the card);
// the uploaded file only when the question says card / certificate / document.
const BANK_KEYS = ["bank_name", "account_holder", "account_number", "ifsc_code", "bank_branch"];
const DETAIL_ALIASES = {
  pan: "PAN", pannumber: "PAN", panno: "PAN", gst: "GSTIN", gstnumber: "GSTIN", gstno: "GSTIN",
  aadhar: "Aadhar No", aadhaar: "Aadhar No", aadharnumber: "Aadhar No", msme: "MSME No", msmenumber: "MSME No",
  phone: "Mobile", mobilenumber: "Mobile", ifsccode: "IFSC", accountno: "Account Number",
};
function missingTargets(q) {
  const ql = lc(q);
  const alias = DETAIL_ALIASES[squash(q)];
  if (alias) return VENDOR_FIELDS.filter(([label]) => label === alias);
  if (/any\s*doc|all\s*doc|documents?$/.test(ql)) return VENDOR_DOCS;
  if (/any\s*detail|all\s*detail|incomplete/.test(ql)) return VENDOR_FIELDS;
  if (/bank/.test(ql)) return VENDOR_FIELDS.filter(([, k]) => BANK_KEYS.includes(k));
  const all = [...VENDOR_FIELDS, ...VENDOR_DOCS];
  // a full label ("GST Certificate") means just that one
  const exact = all.filter(([label]) => squash(label) === squash(q));
  if (exact.length) return exact;
  const forward = all.filter(([label]) => matches(q, label));
  if (forward.length) return forward;
  // "PAN number", "IFSC code" → the label's first word inside the question
  return all.filter(([label]) => matches(label.split(" ")[0], q));
}

async function vendorInfo(user, a) {
  if (!(await canView(user, ["vendor_list", "master_data_vendor"]))) return denied("vendors");
  const [{ data: vendors, error }, { data: orders }] = await Promise.all([
    supabase.schema("procurement").from("vendors").select("*").is("deleted_at", null),
    supabase.schema("procurement").from("purchase_orders").select("vendor_id, totals, status").in("status", ["Issued", "Amended"]),
  ]);
  if (error) throw error;
  const stats = {};
  (orders || []).forEach(o => {
    const s = stats[o.vendor_id] || (stats[o.vendor_id] = { orders: 0, value: 0 });
    s.orders += 1; s.value += num(o.totals?.grandTotal) || num(o.totals?.subtotal);
  });
  if (a.missing) {
    const targets = missingTargets(a.missing);
    if (!targets.length) return { error: `Can't check "${a.missing}". Ask about one of: ${[...VENDOR_FIELDS, ...VENDOR_DOCS].map(([l]) => l).join(", ")}.` };
    const blank = (v, k) => String(v[k] || "").trim() === "" || /^(n\/?a|na|nil|-+|0+)$/i.test(String(v[k]).trim());
    const list = (vendors || [])
      .filter(v => !a.name || matches(a.name, v.vendor_name, v.vendor_code))
      .map(v => ({ code: v.vendor_code || "", name: v.vendor_name || "", mobile: v.mobile || "", missing: targets.filter(([, k]) => blank(v, k)).map(([l]) => l) }))
      .filter(r => r.missing.length)
      .sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));
    const LIMIT = 200;
    const total = (vendors || []).length;
    // one count per item, so "PAN missing" and "PAN card not uploaded" are never mixed up
    const missing_count_by_item = Object.fromEntries(targets.map(([l]) => [l, list.filter(r => r.missing.includes(l)).length]));
    return {
      checked: targets.map(([l]) => l),
      total_vendors: total,
      missing_count_by_item,
      summary: Object.entries(missing_count_by_item).map(([l, n]) => `${l}: missing for ${n} of ${total} vendors (filled for ${total - n})`).join("; "),
      vendors_missing_any: list.length,
      vendors: list.slice(0, LIMIT),
      note: list.length > LIMIT ? `Showing the first ${LIMIT} of ${list.length}.` : undefined,
    };
  }

  const rows = (vendors || []).filter(v => !a.name || matches(a.name, v.vendor_name, v.vendor_code))
    .map(v => ({
      code: v.vendor_code || "", name: v.vendor_name || "",
      email: v.email || "", mobile: v.mobile || "", gstin: v.gstin || v.gst_number || "",
      city: v.bank_city || v.city || "", state: v.bank_state || v.state || "",
      issued_orders: stats[v.id]?.orders || 0, issued_order_value: stats[v.id]?.value || 0,
      _v: v,
    }))
    .sort((x, y) => y.issued_order_value - x.issued_order_value);
  // Full profile (details + document checklist) only when a few vendors match,
  // so a "list vendors" question stays small.
  const detailed = rows.length <= 3;
  return {
    total_matching: rows.length,
    vendors: rows.slice(0, MAX_ROWS).map(({ _v, ...r }) => (detailed ? { ...r, ...vendorProfile(_v) } : r)),
  };
}

async function pettyCashSummary(user, a) {
  if (!(await canView(user, ["petty_cash_staff", "petty_cash_accounts"]))) return denied("petty cash");
  const [{ data: entries, error }, { data: people }] = await Promise.all([
    supabase.from("petty_cash_entries").select("entry_type, entry_date, amount, person_id, from_person_id, particular, vendor_name, category, project, payment_mode").is("deleted_at", null),
    supabase.from("petty_cash_people").select("id, name"),
  ]);
  if (error) throw error;
  const nameOf = Object.fromEntries((people || []).map(p => [p.id, p.name]));
  const rows = (entries || []).map(e => ({
    type: e.entry_type, date: day(e.entry_date), amount: num(e.amount),
    person: nameOf[e.person_id] || "", from: e.from_person_id ? nameOf[e.from_person_id] || "" : "",
    particular: e.particular || "", vendor: e.vendor_name || "", category: e.category || "",
    project: e.project || "", mode: e.payment_mode || "",
  })).filter(e =>
    inRange(e.date, a.date_from, a.date_to) &&
    (!a.person || matches(a.person, e.person, e.from)) &&
    (!a.category || matches(a.category, e.category)) &&
    (!a.query || matches(a.query, e.particular, e.vendor, e.project))
  );
  const sum = (t) => rows.filter(e => e.type === t).reduce((s, e) => s + e.amount, 0);
  const byCategory = {};
  rows.filter(e => e.type === "expense").forEach(e => { byCategory[e.category || "Other"] = (byCategory[e.category || "Other"] || 0) + e.amount; });
  return {
    received_from_accounts: sum("received"), given_between_staff: sum("transfer"), total_expense: sum("expense"),
    expense_by_category: byCategory,
    entries: rows.sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, MAX_ROWS),
    total_matching: rows.length,
  };
}

async function findAnything(user, a) {
  if (!String(a.query || "").trim()) return { error: "Nothing to look up" };
  const has = (...vals) => matches(a.query, ...vals);
  const allowed = await allowedProjectIds(user);
  const [seeOrders, seeIntakes, seeVendors] = await Promise.all([
    canView(user, ["order", "master_data_orders_tab"]),
    canView(user, ["intake", "master_data_intakes"]),
    canView(user, ["vendor_list", "master_data_vendor"]),
  ]);

  const [projects, companies, vendors, orders, intakes] = await Promise.all([
    supabase.from("projects").select("*").then(r => r.data || []),
    supabase.schema("organisation").from("companies").select("*").then(r => r.data || []),
    seeVendors ? supabase.schema("procurement").from("vendors").select("id, vendor_code, vendor_name, mobile, email").is("deleted_at", null).then(r => r.data || []) : [],
    seeOrders ? supabase.schema("procurement").from("purchase_orders").select("order_number, order_type, subject, status, totals, site_id, date_of_creation, created_at, snapshot, vendors(vendor_name)").neq("status", "Deleted").then(r => r.data || []) : [],
    seeIntakes ? supabase.schema("store").from("intakes").select("intake_number, name, status, site_id, site_code, site_name, created_at").then(r => r.data || []) : [],
  ]);

  const visibleOrders = orders.filter(o => !allowed || allowed.has(o.site_id));
  const visibleIntakes = intakes.filter(i => !allowed || allowed.has(i.site_id));

  const siteMatches = projects
    .filter(p => (!allowed || allowed.has(p.id)) && has(p.project_name, p.project_code, p.city))
    .slice(0, 5)
    .map(p => {
      const os = visibleOrders.filter(o => o.site_id === p.id);
      return {
        type: "site / project", code: p.project_code || "", name: p.project_name || "",
        company: companies.find(c => c.id === p.company_id)?.company_name || "",
        city: p.city || "", state: p.state || "", active: p.is_active !== false,
        ...(seeOrders ? {
          orders: os.length,
          purchase_orders: os.filter(o => orderKind(o.order_type) === "PO").length,
          work_orders: os.filter(o => orderKind(o.order_type) === "WO").length,
          issued_order_value: os.filter(o => ["Issued", "Amended"].includes(o.status)).reduce((s, o) => s + orderValue(o), 0),
        } : {}),
        ...(seeIntakes ? { intakes: visibleIntakes.filter(i => i.site_id === p.id).length } : {}),
      };
    });

  return {
    sites: siteMatches,
    companies: companies.filter(c => has(c.company_name, c.company_code)).slice(0, 5)
      .map(c => ({ code: c.company_code || "", name: c.company_name || "", state: c.state || "", gstin: c.gstin || "" })),
    vendors: vendors.filter(v => has(v.vendor_name, v.vendor_code)).slice(0, 5)
      .map(v => ({ code: v.vendor_code || "", name: v.vendor_name || "", mobile: v.mobile || "" })),
    orders: visibleOrders.filter(o => has(o.order_number, o.subject)).slice(0, 5)
      .map(o => ({ order_number: o.order_number || "(draft)", type: orderKind(o.order_type), subject: o.subject || "", status: o.status, vendor: o.vendors?.vendor_name || "", date: day(o.date_of_creation || o.created_at) })),
    intakes: visibleIntakes.filter(i => has(i.intake_number, i.name)).slice(0, 5)
      .map(i => ({ intake_number: i.intake_number || "(draft)", name: i.name || "", status: i.status, site: i.site_code || i.site_name || "" })),
    not_searched: [!seeOrders && "orders", !seeIntakes && "intakes", !seeVendors && "vendors"].filter(Boolean),
  };
}

const EXECUTORS = {
  find_anything: findAnything,
  search_orders: searchOrders,
  search_intakes: searchIntakes,
  vendor_info: vendorInfo,
  petty_cash_summary: pettyCashSummary,
};

module.exports = { DECLARATIONS, EXECUTORS };
