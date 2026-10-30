import React from "react";
import API from "../../../api";
import BulkImportModal from "../../../components/BulkImportModal";
import { parseDate, currentUserName } from "../../Attendance/utils";
import { calc, inr, fmtDay, EARNINGS } from "./calc";

/* Salary › Bulk Upload — salary records for many employees from one sheet.
   The template lists everyone on payroll who has no salary yet (or
   everyone, if all are set — for a raise, put the new date). Saved through
   POST /api/salary/bulk (same checks as the form). */
const COLS = ["Employee ID", "Name", "Effective From", "Pay Type", "Day Basis",
  "Basic", "HRA", "Conveyance", "Medical", "Special Allowance", "Other Allowance", "Day Rate", "OT / Hour",
  "PF", "PF Cap 15000", "ESI", "PT / Month", "TDS / Month",
  "Payment Mode", "Bank Name", "Account Holder", "Account No", "IFSC", "PAN", "UAN", "ESIC No", "Remarks"];
const EARN_COL = { basic: "Basic", hra: "HRA", conveyance: "Conveyance", medical: "Medical", specialAllowance: "Special Allowance", otherAllowance: "Other Allowance" };
const low = (v) => String(v ?? "").trim().toLowerCase();
const yes = (v, dflt) => { const s = low(v); return !s ? dflt : ["yes", "y", "1", "true"].includes(s); };
const num = (v) => { const n = Number(String(v ?? "").replace(/[₹,\s]/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; };

export default function SalaryBulk({ company, records, today, onClose, onDone }) {
  const payroll = records.filter(r => !r.blocked);
  const byCode = new Map(payroll.filter(r => r.empCode).map(r => [low(r.empCode), r]));
  const byName = new Map();
  payroll.forEach(r => byName.set(low(r.name), [...(byName.get(low(r.name)) || []), r]));
  const seen = new Set();

  const parse = (pick, line) => {
    if (line === 2) seen.clear(); // a new file
    const code = String(pick("Employee ID")).trim();
    const name = String(pick("Name")).trim();
    const daily = /^d/.test(low(pick("Pay Type")));
    const vals = Object.fromEntries(Object.entries(EARN_COL).map(([k, col]) => [k, num(pick(col))]));
    const dailyRate = num(pick("Day Rate"));
    if (!vals.basic && !dailyRate) return { blank: true }; // no salary filled in

    let p = code ? byCode.get(low(code)) : null;
    let error = "";
    if (!p && name) {
      const m = byName.get(low(name)) || [];
      if (m.length === 1) p = m[0];
      else if (m.length > 1) error = `${m.length} employees named "${name}" — add the Employee ID`;
    }
    const eff = parseDate(pick("Effective From"));
    const db = low(pick("Day Basis")).replace(/[^0-9a-z]/g, "");
    const pm = low(pick("Payment Mode"));
    const data = {
      employeeId: p?.employeeId, effectiveFrom: eff,
      payType: daily ? "daily" : "monthly", dayBasis: db.includes("30") ? "30" : db.includes("26") ? "26" : "actual",
      ...vals, dailyRate, otRate: num(pick("OT / Hour", "OT")),
      pfApplicable: yes(pick("PF"), false), pfCapped: yes(pick("PF Cap 15000", "PF Cap"), true), esiApplicable: yes(pick("ESI"), false),
      ptMonthly: num(pick("PT / Month", "PT")), tdsMonthly: num(pick("TDS / Month", "TDS")),
      paymentMode: pm.startsWith("cash") ? "cash" : pm.startsWith("cheq") ? "cheque" : "bank",
      bankName: String(pick("Bank Name", "Bank")).trim(), accountHolder: String(pick("Account Holder")).trim() || p?.name || "",
      accountNumber: String(pick("Account No", "Account Number")).replace(/\s/g, ""), ifsc: String(pick("IFSC")).trim().toUpperCase(),
      pan: String(pick("PAN")).trim().toUpperCase(), uan: String(pick("UAN")).replace(/\D/g, ""), esicNumber: String(pick("ESIC No", "ESIC")).trim(),
      remarks: String(pick("Remarks")).trim(),
    };
    if (!error) {
      if (!p) error = code ? `No employee with ID "${code}" on payroll here` : "Employee not found — add the Employee ID";
      else if (!eff) error = "Effective From missing or not a date";
      else if (daily && !dailyRate) error = "Day Rate missing";
      else if (!daily && !vals.basic) error = "Basic missing";
      else if (data.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(data.pan)) error = "PAN should look like ABCDE1234F";
      else if (data.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifsc)) error = "IFSC should look like HDFC0001234";
      else if (data.uan && !/^\d{12}$/.test(data.uan)) error = "UAN is 12 digits";
      else if (data.paymentMode === "bank" && (!data.accountNumber || !data.ifsc)) error = "Bank transfer needs Account No and IFSC";
      else if ([p.current, p.upcoming].some(s => s?.effectiveFrom === eff)) error = `Already has a salary from ${fmtDay(eff)}`;
      else if (seen.has(`${p.employeeId}_${eff}`)) error = "Same person and date twice in the file";
    }
    if (p && eff) seen.add(`${p.employeeId}_${eff}`);
    const c = calc(data);
    return {
      error,
      cells: [p?.name || name || code, eff ? fmtDay(eff) : "", daily ? `${inr(dailyRate)}/day` : "Monthly", inr(c.gross), inr(c.net),
        [data.pfApplicable && "PF", c.esi && "ESI"].filter(Boolean).join(" · ")],
      data,
    };
  };

  const todo = payroll.filter(r => !r.current && !r.upcoming);
  const firstOfMonth = `${today.slice(0, 8)}01`;
  return (
    <BulkImportModal
      title="Bulk Upload Salary" subtitle={company.name}
      fileName={`Salary_upload_${company.code || "company"}.xlsx`} cols={COLS}
      templateRows={() => (todo.length ? todo : payroll).map(r => ({
        "Employee ID": r.empCode, Name: r.name,
        "Effective From": r.joiningDate && r.joiningDate <= today && !r.current ? r.joiningDate : firstOfMonth,
        "Pay Type": "Monthly", "Day Basis": "Month days", PF: "No", "PF Cap 15000": "Yes", ESI: "No", "Payment Mode": "Bank", "Account Holder": r.name,
      }))}
      help={[
        ["Employee ID / Name", "Who it's for. Matched by Employee ID, else exact name. Don't change these in the template."],
        ["Effective From", "From when this salary applies (YYYY-MM-DD or DD-MM-YYYY). For a raise, a new later date."],
        ["Pay Type", "Monthly or Daily"],
        ["Day Basis", "Monthly pay only — one day's pay = gross ÷ Month days / 30 / 26"],
        ["Basic … Other Allowance", "Monthly ₹ (Monthly pay). Basic is required. A row with no Basic and no Day Rate is skipped."],
        ["Day Rate", "₹ per day (Daily pay)"],
        ["OT / Hour", "₹ per overtime hour (0 = none)"],
        ["PF / ESI", "Yes or No. PF Cap 15000: Yes = PF on Basic up to ₹15,000 (usual)"],
        ["PT / TDS", "₹ to deduct each month (PT is 0 in Haryana, UP, Delhi)"],
        ["Payment Mode", "Bank, Cash or Cheque. Bank needs Account No and IFSC."],
        ["PAN / UAN / ESIC No", "Optional. PAN like ABCDE1234F, UAN 12 digits."],
        ["", ""],
        ["Note", "Labour and agency-paid people aren't on payroll. Someone who already has a salary from the same date is skipped."],
      ]}
      previewHead={["Employee", "From", "Pay", "Gross", "Net", "Deductions"]}
      parse={parse}
      save={async (rows) => (await API.post("/api/salary/bulk", { company_id: company.id, rows, byName: currentUserName() })).data}
      onClose={onClose} onDone={onDone}
    />
  );
}
