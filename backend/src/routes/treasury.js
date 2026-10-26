// Treasury › Loans & EMI. Executive-only like the Party Ledger
// (treasury_ledger permission). The EMI schedule is derived from the loan
// (start date + tenure); only paid EMIs are stored. Paying an EMI also
// writes a "payment" entry into the Party Ledger so it shows in the lender's
// account without being entered twice.
const express  = require("express");
const router   = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { requirePerm } = require("../helpers/permHelper");
const { niceName } = require("../helpers/niceName");

const PENALTY_TYPES = ["none", "fixed", "percent", "both"];
const num = (v) => Math.max(Number(v) || 0, 0);
const round2 = (v) => Math.round(v * 100) / 100;

// yyyy-mm-dd → Date at local midnight
const toDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Due date of EMI n (1-based): same day each month as the first, clamped to month end
const dueDateOf = (start, n) => {
  const s = toDate(start);
  const d = new Date(s.getFullYear(), s.getMonth() + (n - 1), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(s.getDate(), last));
  return d;
};

// Months overdue, counting a started month as a full one (1 day late = 1)
const monthsOverdue = (due, upTo) => {
  if (upTo <= due) return 0;
  let m = (upTo.getFullYear() - due.getFullYear()) * 12 + (upTo.getMonth() - due.getMonth());
  if (upTo.getDate() > due.getDate()) m += 1;
  return Math.max(m, 1);
};

const penaltyFor = (loan, due, upTo) => {
  const m = monthsOverdue(due, upTo);
  if (!m || loan.penalty_type === "none") return 0;
  const fixed = ["fixed", "both"].includes(loan.penalty_type) ? num(loan.penalty_fixed) : 0;
  const pct = ["percent", "both"].includes(loan.penalty_type) ? num(loan.emi_amount) * num(loan.penalty_percent) / 100 : 0;
  return round2((fixed + pct) * m);
};

// Full schedule + totals for one loan
const buildSchedule = (loan, payments, today = new Date()) => {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const paidByNo = new Map(payments.map(p => [p.emi_no, p]));
  const rows = [];
  for (let n = 1; n <= loan.tenure_months; n++) {
    const due = dueDateOf(loan.start_date, n);
    const p = paidByNo.get(n);
    if (p) {
      rows.push({ emiNo: n, dueDate: toISO(due), amount: num(loan.emi_amount), status: "paid",
        penalty: num(p.penalty), paidOn: p.paid_on, paidAmount: num(p.amount), mode: p.mode, reference: p.reference, paymentId: p.id });
    } else {
      const overdue = due < t;
      rows.push({ emiNo: n, dueDate: toISO(due), amount: num(loan.emi_amount), status: overdue ? "overdue" : "upcoming",
        penalty: overdue ? penaltyFor(loan, due, t) : 0 });
    }
  }
  const unpaid = rows.filter(r => r.status !== "paid");
  const overdue = rows.filter(r => r.status === "overdue");
  const next = unpaid[0] || null;
  const thisMonth = toISO(t).slice(0, 7);
  const dueThisMonth = unpaid.filter(r => r.status === "upcoming" && r.dueDate.slice(0, 7) === thisMonth);
  return {
    schedule: rows,
    summary: {
      paidCount: rows.length - unpaid.length,
      remainingCount: unpaid.length,
      remainingAmount: round2(unpaid.reduce((s, r) => s + r.amount, 0)),
      overdueCount: overdue.length,
      overdueAmount: round2(overdue.reduce((s, r) => s + r.amount, 0)),
      penaltyDue: round2(overdue.reduce((s, r) => s + r.penalty, 0)),
      dueThisMonth: round2(dueThisMonth.reduce((s, r) => s + r.amount, 0)),
      penaltyPaid: round2(rows.filter(r => r.status === "paid").reduce((s, r) => s + r.penalty, 0)),
      nextDue: next ? { emiNo: next.emiNo, dueDate: next.dueDate, amount: next.amount, status: next.status } : null,
    },
  };
};

const mapLoan = (r) => ({
  id: r.id, name: r.name, lender: niceName(r.lender), companyName: niceName(r.company_name || ""),
  principal: num(r.principal), interestRate: num(r.interest_rate), tenureMonths: r.tenure_months,
  emiAmount: num(r.emi_amount), startDate: r.start_date,
  penaltyType: r.penalty_type, penaltyFixed: num(r.penalty_fixed), penaltyPercent: num(r.penalty_percent),
  remarks: r.remarks || "", isClosed: !!r.is_closed, createdByName: r.created_by_name || "", createdAt: r.created_at,
});

const loanRow = (b) => ({
  name:            String(b.name || "").trim(),
  lender:          niceName(String(b.lender || "").trim()),
  company_name:    niceName(String(b.companyName || "").trim()),
  principal:       num(b.principal),
  interest_rate:   num(b.interestRate),
  tenure_months:   Math.floor(num(b.tenureMonths)),
  emi_amount:      num(b.emiAmount),
  start_date:      b.startDate || null,
  penalty_type:    PENALTY_TYPES.includes(b.penaltyType) ? b.penaltyType : "none",
  penalty_fixed:   num(b.penaltyFixed),
  penalty_percent: num(b.penaltyPercent),
  remarks:         String(b.remarks || "").trim(),
});

const validate = (row) => {
  if (!row.name) return "Loan name is required";
  if (!row.lender) return "Lender is required";
  if (!row.tenure_months || row.tenure_months > 600) return "Tenure (months) is required";
  if (!row.emi_amount) return "EMI amount is required";
  if (!row.start_date) return "First EMI date is required";
  return null;
};

// Party Ledger entries made or removed here go into the entry's Log too
const auditLedger = async (req, entryId, name, action, changes = null) => {
  try {
    let userName = req.body?.createdByName || "";
    if (!userName && req._authUserId) {
      const { data } = await supabase.from("users").select("name").eq("id", req._authUserId).maybeSingle();
      userName = data?.name || "";
    }
    await supabase.schema("procurement").from("audit_logs").insert({
      entity_type: "treasury_ledger_entry", entity_id: String(entryId), entity_name: name || null,
      action, user_id: req._authUserId || null, user_name: userName || null, changes,
    });
  } catch { /* a missing log line must never fail the payment */ }
};

const loadPayments = async (loanIds) => {
  if (!loanIds.length) return [];
  const { data, error } = await supabase.from("treasury_loan_payments").select("*").in("loan_id", loanIds);
  if (error) throw error;
  return data || [];
};

/* GET /api/treasury/loans — every loan with its summary */
router.get("/loans", requirePerm("treasury_ledger", "can_view"), async (_req, res) => {
  try {
    const { data, error } = await supabase.from("treasury_loans").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    const payments = await loadPayments((data || []).map(l => l.id));
    const loans = (data || []).map(l => ({
      ...mapLoan(l),
      summary: buildSchedule(l, payments.filter(p => p.loan_id === l.id)).summary,
    }));
    res.json({ loans });
  } catch (err) {
    console.error("Treasury loans read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/treasury/loans/:id — loan + full EMI schedule */
router.get("/loans/:id", requirePerm("treasury_ledger", "can_view"), async (req, res) => {
  try {
    const { data: loan, error } = await supabase.from("treasury_loans").select("*").eq("id", req.params.id).single();
    if (error || !loan) return res.status(404).json({ error: "Loan not found" });
    const payments = await loadPayments([loan.id]);
    res.json({ loan: mapLoan(loan), ...buildSchedule(loan, payments) });
  } catch (err) {
    console.error("Treasury loan read error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/treasury/loans */
router.post("/loans", requirePerm("treasury_ledger", "can_add"), async (req, res) => {
  try {
    const row = loanRow(req.body);
    const bad = validate(row);
    if (bad) return res.status(400).json({ error: bad });
    const { data, error } = await supabase.from("treasury_loans").insert({
      ...row, created_by_id: req._authUserId || null, created_by_name: req.body.createdByName || "",
    }).select("*").single();
    if (error) throw error;
    res.json({ loan: mapLoan(data) });
  } catch (err) {
    console.error("Treasury loan create error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/treasury/loans/:id — tenure can't drop below EMIs already paid */
router.put("/loans/:id", requirePerm("treasury_ledger", "can_edit"), async (req, res) => {
  try {
    const row = loanRow(req.body);
    const bad = validate(row);
    if (bad) return res.status(400).json({ error: bad });
    const payments = await loadPayments([req.params.id]);
    const maxPaid = Math.max(0, ...payments.map(p => p.emi_no));
    if (row.tenure_months < maxPaid) return res.status(400).json({ error: `EMI ${maxPaid} is already paid — tenure can't be less than that` });
    const { data, error } = await supabase.from("treasury_loans")
      .update({ ...row, is_closed: !!req.body.isClosed, updated_at: new Date().toISOString() })
      .eq("id", req.params.id).select("*").single();
    if (error) throw error;
    res.json({ loan: mapLoan(data) });
  } catch (err) {
    console.error("Treasury loan update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/treasury/loans/:id — only when no EMI is paid (undo those first) */
router.delete("/loans/:id", requirePerm("treasury_ledger", "can_delete"), async (req, res) => {
  try {
    const payments = await loadPayments([req.params.id]);
    if (payments.length) return res.status(400).json({ error: "This loan has paid EMIs — undo them first, so the Party Ledger stays correct" });
    const { error } = await supabase.from("treasury_loans").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Treasury loan delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/treasury/loans/:id/emis/:no/pay — body { paidOn, penalty, mode, reference }
   Records the EMI and adds a "payment" entry to the Party Ledger. */
router.post("/loans/:id/emis/:no/pay", requirePerm("treasury_ledger", "can_add"), async (req, res) => {
  try {
    const emiNo = Math.floor(Number(req.params.no));
    const { data: loan } = await supabase.from("treasury_loans").select("*").eq("id", req.params.id).single();
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    if (!emiNo || emiNo < 1 || emiNo > loan.tenure_months) return res.status(400).json({ error: "Invalid EMI number" });

    const paidOn = req.body.paidOn || toISO(new Date());
    const penalty = req.body.penalty != null ? num(req.body.penalty) : penaltyFor(loan, dueDateOf(loan.start_date, emiNo), toDate(paidOn));
    const mode = req.body.mode === "cash" ? "cash" : "account";
    const reference = String(req.body.reference || "").trim();
    const amount = num(loan.emi_amount);
    // the account the EMI left (ours) and the lender's account it went to
    const t = (v) => (mode === "cash" ? "" : String(v || "").trim());

    const { data: existing } = await supabase.from("treasury_loan_payments").select("id").eq("loan_id", loan.id).eq("emi_no", emiNo).maybeSingle();
    if (existing) return res.status(400).json({ error: `EMI ${emiNo} is already paid` });

    const { data: entry, error: entryErr } = await supabase.from("treasury_ledger_entries").insert({
      entry_type:      "payment",
      entry_date:      paidOn,
      company_name:    loan.company_name || "",
      party_name:      loan.lender,
      narration:       `${loan.name} — EMI ${emiNo}/${loan.tenure_months}${penalty ? ` (incl. penalty ₹${penalty})` : ""}`,
      amount:          round2(amount + penalty),
      payment_mode:    mode,
      account_no_from: t(req.body.accountNoFrom),
      ifsc_from:       t(req.body.ifscFrom).toUpperCase(),
      account_no_to:   t(req.body.accountNoTo),
      ifsc_to:         t(req.body.ifscTo).toUpperCase(),
      account_holder_name: t(req.body.accountHolderName),
      category:        "EMI",
      remarks:         reference,
      created_by_id:   req._authUserId || null,
      created_by_name: req.body.createdByName || "",
    }).select("id").single();
    if (entryErr) throw entryErr;

    const { data: pay, error: payErr } = await supabase.from("treasury_loan_payments").insert({
      loan_id: loan.id, emi_no: emiNo, paid_on: paidOn, amount, penalty, mode, reference,
      entry_id: entry.id, created_by_name: req.body.createdByName || "",
    }).select("*").single();
    if (payErr) {
      // keep the ledger clean if the EMI record couldn't be saved
      await supabase.from("treasury_ledger_entries").delete().eq("id", entry.id);
      throw payErr;
    }
    await auditLedger(req, entry.id, loan.lender, "created", {
      Type: "Paid", Amount: round2(amount + penalty), Source: `${loan.name} — EMI ${emiNo}/${loan.tenure_months}`,
      ...(penalty ? { Penalty: penalty } : {}), Date: paidOn,
    });
    res.json({ payment: pay });
  } catch (err) {
    console.error("Treasury EMI pay error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/treasury/loans/:id/emis/:no/pay — undo a paid EMI and its ledger entry */
router.delete("/loans/:id/emis/:no/pay", requirePerm("treasury_ledger", "can_delete"), async (req, res) => {
  try {
    const { data: pay } = await supabase.from("treasury_loan_payments").select("*")
      .eq("loan_id", req.params.id).eq("emi_no", Number(req.params.no)).maybeSingle();
    if (!pay) return res.status(404).json({ error: "This EMI isn't marked paid" });
    if (pay.entry_id) {
      await supabase.from("treasury_ledger_entries").update({ deleted_at: new Date().toISOString() }).eq("id", pay.entry_id);
      const { data: loan } = await supabase.from("treasury_loans").select("name, lender").eq("id", req.params.id).maybeSingle();
      await auditLedger(req, pay.entry_id, loan?.lender, "deleted", { Reason: `EMI ${pay.emi_no} payment undone${loan ? ` (${loan.name})` : ""}` });
    }
    const { error } = await supabase.from("treasury_loan_payments").delete().eq("id", pay.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Treasury EMI undo error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
