const express  = require("express");
const router   = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { requirePerm } = require("../helpers/permHelper");
const { userIdFrom } = require("../helpers/projectScope");
const { companyIdFrom } = require("../helpers/companyScope");

/*
 * Finance › Salary — salary records (sql/salary_structure.sql).
 * One row per employee per revision; the record in force on a day is the
 * latest effective_from on or before it. Labour and agency-paid people
 * aren't on payroll (the agency is paid), so they're listed but can't
 * get a record.
 */

const org = (t) => supabase.schema("organisation").from(t);
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST
const isoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null;
const money = (v) => { const n = Math.round(Number(v) * 100) / 100; return Number.isFinite(n) && n > 0 ? n : 0; };
const text = (v, max = 120) => String(v ?? "").trim().slice(0, max);

const AMOUNTS = ["basic", "hra", "conveyance", "medical", "special_allowance", "other_allowance", "daily_rate", "ot_rate", "pt_monthly", "tds_monthly"];
const TEXTS = ["bank_name", "account_holder", "account_number", "ifsc", "pan", "uan", "esic_number"];
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// why someone can't have a salary record (null = they can)
const notOnPayroll = (e) =>
  e.category === "Labour" ? "Labour isn't on payroll"
  : e.employed_through === "agency" ? "Paid through the agency"
  : null;

const out = (r) => r && ({
  id: r.id, employeeId: r.employee_id, effectiveFrom: r.effective_from,
  payType: r.pay_type, dayBasis: r.day_basis,
  ...Object.fromEntries(AMOUNTS.map(k => [camel(k), Number(r[k]) || 0])),
  pfApplicable: !!r.pf_applicable, pfCapped: r.pf_capped !== false, esiApplicable: !!r.esi_applicable,
  paymentMode: r.payment_mode,
  ...Object.fromEntries(TEXTS.map(k => [camel(k), r[k] || ""])),
  remarks: r.remarks || "",
  createdBy: r.created_by_name || "", createdAt: r.created_at,
  updatedBy: r.updated_by_name || "", updatedAt: r.updated_at,
});

// request body → row fields
const fieldsFrom = (b) => {
  const f = {
    pay_type: b.payType === "daily" ? "daily" : "monthly",
    day_basis: ["actual", "30", "26"].includes(String(b.dayBasis)) ? String(b.dayBasis) : "actual",
    pf_applicable: !!b.pfApplicable, pf_capped: b.pfCapped !== false, esi_applicable: !!b.esiApplicable,
    payment_mode: ["bank", "cash", "cheque"].includes(b.paymentMode) ? b.paymentMode : "bank",
    remarks: text(b.remarks, 500),
  };
  AMOUNTS.forEach(k => { f[k] = money(b[camel(k)]); });
  TEXTS.forEach(k => { f[k] = text(b[camel(k)], 60); });
  f.ifsc = f.ifsc.toUpperCase();
  f.pan = f.pan.toUpperCase();
  // a daily-rate person has no monthly breakup, and the other way round
  if (f.pay_type === "daily") ["basic", "hra", "conveyance", "medical", "special_allowance", "other_allowance"].forEach(k => { f[k] = 0; });
  else f.daily_rate = 0;
  return f;
};

const check = (f) => {
  if (f.pay_type === "monthly" && !f.basic) return "Basic is required";
  if (f.pay_type === "daily" && !f.daily_rate) return "Day rate is required";
  if (f.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(f.pan)) return "PAN should look like ABCDE1234F";
  if (f.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc)) return "IFSC should look like HDFC0001234";
  if (f.uan && !/^\d{12}$/.test(f.uan)) return "UAN is 12 digits";
  if (f.payment_mode === "bank" && (!f.account_number || !f.ifsc)) return "Account number and IFSC are needed for bank transfer";
  return null;
};

/* ═══ GET /api/salary/companies ═══ */
router.get("/companies", requirePerm("salary", "can_view"), async (req, res) => {
  try {
    const { data, error } = await org("companies").select("id, company_code, company_name, status").order("company_name");
    if (error) throw error;
    res.json({ companies: (data || []).filter(c => String(c.status || "active").toLowerCase() === "active")
      .map(c => ({ id: c.id, code: c.company_code || "", name: c.company_name || "" })) });
  } catch (err) {
    console.error("Salary companies error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══ GET /api/salary/records?company_id= — every active employee of the
   company with the salary in force today (and the next one, if a raise is
   already entered for later) ═══ */
router.get("/records", requirePerm("salary", "can_view"), async (req, res) => {
  try {
    const companyId = companyIdFrom(req.query);
    if (!companyId) return res.status(400).json({ error: "Pick a company" });
    const [{ data: people, error: pe }, { data: rows, error: re }, projects, offices] = await Promise.all([
      org("employees").select("id, person_name, employee_id, contact_code, designation, department, category, staff_type, employed_through, posted_kind, posted_id, joining_date, status")
        .eq("company_id", companyId).neq("status", "inactive").order("person_name"),
      org("salary_structures").select("*").eq("company_id", companyId).order("effective_from", { ascending: false }),
      supabase.from("projects").select("id, project_code").eq("company_id", companyId),
      org("branches").select("id, code").eq("company_id", companyId),
    ]);
    if (pe) throw pe;
    if (re) throw re;
    const placeCode = new Map([...(projects.data || []).map(p => [p.id, p.project_code]), ...(offices.data || []).map(b => [b.id, b.code])]);
    const byEmp = new Map();
    (rows || []).forEach(r => byEmp.set(r.employee_id, [...(byEmp.get(r.employee_id) || []), r]));
    const d = today();
    res.json({
      today: d,
      records: (people || []).map(e => {
        const list = byEmp.get(e.id) || []; // newest first
        const current = list.find(r => r.effective_from <= d) || null;
        const upcoming = list.filter(r => r.effective_from > d).pop() || null;
        return {
          employeeId: e.id, name: e.person_name || "", empCode: e.employee_id || e.contact_code || "",
          designation: e.designation || "", department: e.department || "", category: e.category || "",
          staffType: e.staff_type || "", joiningDate: e.joining_date || "",
          postedAt: placeCode.get(e.posted_id) || "",
          blocked: notOnPayroll(e),
          current: out(current), upcoming: out(upcoming), revisions: list.length,
        };
      }),
    });
  } catch (err) {
    console.error("Salary records error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══ GET /api/salary/history/:employeeId — every revision, newest first ═══ */
router.get("/history/:employeeId", requirePerm("salary", "can_view"), async (req, res) => {
  try {
    const { data, error } = await org("salary_structures").select("*").eq("employee_id", req.params.employeeId)
      .order("effective_from", { ascending: false });
    if (error) throw error;
    res.json({ history: (data || []).map(out) });
  } catch (err) {
    console.error("Salary history error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ═══ POST /api/salary/records — new record / revision
   body { employeeId, effectiveFrom, …fields, byName } ═══ */
router.post("/records", requirePerm("salary", "can_add"), async (req, res) => {
  try {
    const b = req.body || {};
    const effectiveFrom = isoDate(b.effectiveFrom);
    if (!effectiveFrom) return res.status(400).json({ error: "Effective from date is required" });
    const { data: e, error: ee } = await org("employees").select("id, company_id, person_name, category, employed_through").eq("id", b.employeeId).maybeSingle();
    if (ee) throw ee;
    if (!e) return res.status(404).json({ error: "Employee not found" });
    if (notOnPayroll(e)) return res.status(400).json({ error: `${e.person_name}: ${notOnPayroll(e)}` });
    const f = fieldsFrom(b);
    const bad = check(f);
    if (bad) return res.status(400).json({ error: bad });

    const { data: same } = await org("salary_structures").select("id").eq("employee_id", e.id).eq("effective_from", effectiveFrom).maybeSingle();
    if (same) return res.status(409).json({ error: `${e.person_name} already has a salary from ${effectiveFrom} — edit that one instead` });

    const { data, error } = await org("salary_structures").insert({
      ...f, company_id: e.company_id, employee_id: e.id, effective_from: effectiveFrom,
      created_by_id: userIdFrom(req) || null, created_by_name: text(b.byName) || null, updated_by_name: text(b.byName) || null,
    }).select("*").single();
    if (error) throw error;
    res.json({ success: true, record: out(data) });
  } catch (err) {
    console.error("Salary create error:", err.message);
    res.status(500).json({ error: "Save failed", detail: err.message });
  }
});

/* ═══ PUT /api/salary/records/:id — correct a record ═══ */
router.put("/records/:id", requirePerm("salary", "can_edit"), async (req, res) => {
  try {
    const b = req.body || {};
    const { data: cur, error: ce } = await org("salary_structures").select("id, employee_id, effective_from").eq("id", req.params.id).maybeSingle();
    if (ce) throw ce;
    if (!cur) return res.status(404).json({ error: "Salary record not found" });
    const effectiveFrom = isoDate(b.effectiveFrom) || cur.effective_from;
    if (effectiveFrom !== cur.effective_from) {
      const { data: same } = await org("salary_structures").select("id").eq("employee_id", cur.employee_id).eq("effective_from", effectiveFrom).maybeSingle();
      if (same) return res.status(409).json({ error: `There's already a salary from ${effectiveFrom}` });
    }
    const f = fieldsFrom(b);
    const bad = check(f);
    if (bad) return res.status(400).json({ error: bad });
    const { data, error } = await org("salary_structures")
      .update({ ...f, effective_from: effectiveFrom, updated_by_name: text(b.byName) || null, updated_at: new Date().toISOString() })
      .eq("id", cur.id).select("*").single();
    if (error) throw error;
    res.json({ success: true, record: out(data) });
  } catch (err) {
    console.error("Salary update error:", err.message);
    res.status(500).json({ error: "Save failed", detail: err.message });
  }
});

/* ═══ DELETE /api/salary/records/:id ═══ */
router.delete("/records/:id", requirePerm("salary", "can_delete"), async (req, res) => {
  try {
    const { data, error } = await org("salary_structures").delete().eq("id", req.params.id).select("id");
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: "Salary record not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("Salary delete error:", err.message);
    res.status(500).json({ error: "Delete failed", detail: err.message });
  }
});

module.exports = router;
