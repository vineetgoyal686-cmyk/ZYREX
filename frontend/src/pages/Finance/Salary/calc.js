// Salary maths shared by the records list and the form (standard Indian rules).
// PF: 12% of Basic (Basic capped at ₹15,000 when pfCapped), employee and employer.
// ESI: while gross ≤ ₹21,000 — employee 0.75%, employer 3.25%.
// PT and TDS are monthly amounts typed in per person.
export const PF_RATE = 0.12, PF_CEILING = 15000;
export const ESI_EMP = 0.0075, ESI_ER = 0.0325, ESI_LIMIT = 21000;
export const DAILY_EST_DAYS = 26; // a day-rate person's month, for the estimate only

export const EARNINGS = [
  ["basic", "Basic"], ["hra", "HRA"], ["conveyance", "Conveyance"],
  ["medical", "Medical"], ["specialAllowance", "Special Allowance"], ["otherAllowance", "Other Allowance"],
];

const r0 = (n) => Math.round(n);

export function calc(s) {
  if (!s) return null;
  const daily = s.payType === "daily";
  const gross = daily ? (Number(s.dailyRate) || 0) * DAILY_EST_DAYS : EARNINGS.reduce((t, [k]) => t + (Number(s[k]) || 0), 0);
  // a day-rate person's "basic" for PF is what they earn
  const pfBase = daily ? gross : (Number(s.basic) || 0);
  const pfWage = s.pfCapped ? Math.min(pfBase, PF_CEILING) : pfBase;
  const pf = s.pfApplicable ? r0(pfWage * PF_RATE) : 0;
  const esiOk = s.esiApplicable && gross > 0 && gross <= ESI_LIMIT;
  const esi = esiOk ? Math.ceil(gross * ESI_EMP) : 0;
  const esiEr = esiOk ? Math.ceil(gross * ESI_ER) : 0;
  const pt = Number(s.ptMonthly) || 0, tds = Number(s.tdsMonthly) || 0;
  const deductions = pf + esi + pt + tds;
  return {
    daily, gross, pf, esi, pt, tds, deductions, net: gross - deductions,
    pfEr: pf, esiEr, ctc: gross + pf + esiEr,
    esiOver: s.esiApplicable && gross > ESI_LIMIT,
  };
}

export const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
export const fmtDay = (iso, opts = { day: "numeric", month: "short", year: "numeric" }) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", opts).replace(/,/g, "") : "—";
export const firstOfNextMonth = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
};

export const EMPTY = {
  payType: "monthly", dayBasis: "actual",
  basic: "", hra: "", conveyance: "", medical: "", specialAllowance: "", otherAllowance: "",
  dailyRate: "", otRate: "",
  pfApplicable: false, pfCapped: true, esiApplicable: false, ptMonthly: "", tdsMonthly: "",
  paymentMode: "bank", bankName: "", accountHolder: "", accountNumber: "", ifsc: "", pan: "", uan: "", esicNumber: "",
  remarks: "",
};
