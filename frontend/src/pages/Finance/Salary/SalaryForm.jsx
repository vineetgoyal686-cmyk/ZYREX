import React, { useMemo, useState } from "react";
import { X, Loader2, Info } from "lucide-react";
import API from "../../../api";
import { currentUserName } from "../../Attendance/utils";
import { calc, inr, EARNINGS, EMPTY, firstOfNextMonth, fmtDay, ESI_LIMIT, PF_CEILING, DAILY_EST_DAYS } from "./calc";

/*
 * Set / revise / edit one employee's salary.
 *  new    — first salary; effective from joining date (or today)
 *  revise — a raise: a NEW record from a later date, starting from the current one
 *  edit   — correct an existing record in place
 * The summary on the right works out PF, ESI, net pay and CTC as you type.
 */
const LBL = "block text-[11px] font-semibold text-slate-500 mb-1";
const INP = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400";
const TITLES = { new: "Set Salary", revise: "Revise Salary", edit: "Edit Salary" };

export default function SalaryForm({ person, mode, record, today, onClose, onSaved }) {
  const t = today || new Date().toISOString().slice(0, 10);
  const [f, setF] = useState(() => {
    const base = record ? { ...EMPTY, ...Object.fromEntries(Object.entries(record).map(([k, v]) => [k, typeof v === "number" ? (v || "") : v])) } : { ...EMPTY };
    const eff = mode === "edit" ? record.effectiveFrom
      : mode === "revise" ? firstOfNextMonth(record?.effectiveFrom > t ? record.effectiveFrom : t)
      : (person.joiningDate && person.joiningDate <= t ? person.joiningDate : `${t.slice(0, 8)}01`);
    return { ...base, effectiveFrom: eff, accountHolder: base.accountHolder || person.name };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
  const c = useMemo(() => calc(f), [f]);
  const daily = f.payType === "daily";

  const save = async () => {
    setError("");
    if (!f.effectiveFrom) return setError("Effective from date is required");
    if (daily ? !Number(f.dailyRate) : !Number(f.basic)) return setError(daily ? "Enter the day rate" : "Enter Basic");
    setSaving(true);
    try {
      const body = { ...f, employeeId: person.employeeId, byName: currentUserName() };
      if (mode === "edit") await API.put(`/api/salary/records/${record.id}`, body);
      else await API.post("/api/salary/records", body);
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const ctx = { f, set };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div>
            <p className="text-[15px] font-bold text-slate-800">{TITLES[mode]} · {person.name}</p>
            <p className="text-[11px] text-slate-400">{[person.designation, person.category, person.empCode].filter(Boolean).join(" · ")}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* form */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-6">
            {mode === "revise" && (
              <p className="flex items-start gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                <Info size={14} className="shrink-0 mt-0.5" /> A new salary from the date below. The old one stays for the months before it.
              </p>
            )}
            <Section title="Basics">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={LBL}>Effective From *</label>
                  <input type="date" value={f.effectiveFrom} onChange={set("effectiveFrom")} className={INP} />
                  {f.effectiveFrom && <p className="text-[10px] text-slate-400 mt-0.5">{fmtDay(f.effectiveFrom, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</p>}
                </div>
                <div>
                  <label className={LBL}>Pay Type</label>
                  <Seg {...ctx} k="payType" options={[["monthly", "Monthly Salary"], ["daily", "Daily Wage"]]} />
                </div>
                <div>
                  <label className={LBL}>{daily ? "Days" : "One day's pay ="}</label>
                  {daily ? <p className="text-xs text-slate-500 h-9 flex items-center">Paid for each day present</p> : (
                    <Seg {...ctx} k="dayBasis" options={[["actual", "Month days"], ["30", "÷ 30"], ["26", "÷ 26"]]} />
                  )}
                </div>
              </div>
            </Section>

            <Section title="Earnings">
              {daily ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Money {...ctx} k="dailyRate" label="Day Rate *" hint={`≈ ${inr((Number(f.dailyRate) || 0) * DAILY_EST_DAYS)} for ${DAILY_EST_DAYS} days`} />
                  <Money {...ctx} k="otRate" label="Overtime / hour" hint="0 = no OT pay" />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {EARNINGS.map(([k, l]) => <Money {...ctx} key={k} k={k} label={k === "basic" ? "Basic *" : l} hint={k === "hra" ? "Usually 40–50% of Basic" : null} />)}
                  <Money {...ctx} k="otRate" label="Overtime / hour" hint="0 = no OT pay" />
                </div>
              )}
            </Section>

            <Section title="Deductions">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Toggle {...ctx} k="pfApplicable" label="PF (Provident Fund)" hint={`12% of ${daily ? "earnings" : "Basic"}, employee + employer`} />
                  {f.pfApplicable && (
                    <div className="pl-6"><Toggle {...ctx} k="pfCapped" label={`Cap at ₹${PF_CEILING.toLocaleString("en-IN")}`} hint="PF on Basic up to ₹15,000 only (most common)" /></div>
                  )}
                </div>
                <div className="space-y-1">
                  <Toggle {...ctx} k="esiApplicable" label="ESI" hint={`0.75% employee + 3.25% employer, gross up to ₹${ESI_LIMIT.toLocaleString("en-IN")}`} />
                  {c.esiOver && <p className="pl-6 text-[11px] font-semibold text-amber-700">Gross is over ₹21,000 — no ESI</p>}
                </div>
                <Money {...ctx} k="ptMonthly" label="Professional Tax / month" hint="Depends on the state; ₹0 in Haryana, UP, Delhi" />
                <Money {...ctx} k="tdsMonthly" label="TDS / month" hint="Income tax to deduct each month" />
              </div>
            </Section>

            <Section title="Payment">
              <Seg {...ctx} k="paymentMode" options={[["bank", "Bank Transfer"], ["cash", "Cash"], ["cheque", "Cheque"]]} />
              {f.paymentMode === "bank" && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={LBL}>Account Holder</label><input value={f.accountHolder} onChange={set("accountHolder")} className={INP} /></div>
                  <div><label className={LBL}>Bank Name</label><input value={f.bankName} onChange={set("bankName")} placeholder="HDFC Bank" className={INP} /></div>
                  <div><label className={LBL}>Account Number *</label><input value={f.accountNumber} onChange={set("accountNumber")} className={`${INP} tabular-nums`} /></div>
                  <div><label className={LBL}>IFSC *</label><input value={f.ifsc} onChange={e => set("ifsc")(e.target.value.toUpperCase())} placeholder="HDFC0001234" maxLength={11} className={`${INP} uppercase`} /></div>
                </div>
              )}
            </Section>

            <Section title="Statutory Numbers">
              <div className="grid grid-cols-3 gap-3">
                <div><label className={LBL}>PAN</label><input value={f.pan} onChange={e => set("pan")(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} className={`${INP} uppercase`} /></div>
                <div><label className={LBL}>UAN (PF)</label><input value={f.uan} onChange={set("uan")} placeholder="12 digits" maxLength={12} className={`${INP} tabular-nums`} /></div>
                <div><label className={LBL}>ESIC Number</label><input value={f.esicNumber} onChange={set("esicNumber")} className={`${INP} tabular-nums`} /></div>
              </div>
            </Section>

            <div>
              <label className={LBL}>Remarks</label>
              <input value={f.remarks} onChange={set("remarks")} placeholder="Optional — e.g. annual increment 10%" className={INP} />
            </div>
          </div>

          {/* live summary */}
          <div className="md:w-72 shrink-0 border-t md:border-t-0 md:border-l border-slate-200 bg-slate-50/70 p-5 space-y-4 overflow-y-auto">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Monthly Summary{daily && ` (≈ ${DAILY_EST_DAYS} days)`}</p>
            <div className="space-y-1.5">
              <Line label="Gross" value={inr(c.gross)} strong />
              <Line label="PF (employee)" value={c.pf ? `− ${inr(c.pf)}` : "—"} tone="text-red-600" />
              <Line label="ESI (employee)" value={c.esi ? `− ${inr(c.esi)}` : "—"} tone="text-red-600" />
              <Line label="Professional Tax" value={c.pt ? `− ${inr(c.pt)}` : "—"} tone="text-red-600" />
              <Line label="TDS" value={c.tds ? `− ${inr(c.tds)}` : "—"} tone="text-red-600" />
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Net Pay (in hand)</p>
              <p className="text-xl font-extrabold text-emerald-700 tabular-nums">{inr(c.net)}</p>
            </div>
            <div className="space-y-1.5 pt-1">
              <Line label="PF (employer)" value={c.pfEr ? `+ ${inr(c.pfEr)}` : "—"} />
              <Line label="ESI (employer)" value={c.esiEr ? `+ ${inr(c.esiEr)}` : "—"} />
            </div>
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">CTC (cost to company)</p>
              <p className="text-lg font-extrabold text-indigo-700 tabular-nums">{inr(c.ctc)}<span className="text-[11px] font-semibold"> / month</span></p>
              <p className="text-[11px] text-indigo-600 tabular-nums">{inr(c.ctc * 12)} / year</p>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">Full month. Payroll will pay by paid days from Attendance{daily ? "" : f.dayBasis === "actual" ? " (gross ÷ days in the month × paid days)" : ` (gross ÷ ${f.dayBasis} × paid days)`}.</p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50">
          {error && <p className="text-xs text-red-600 flex-1">{error}</p>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-2 h-9 px-5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving && <Loader2 size={13} className="animate-spin" />} {mode === "edit" ? "Save Changes" : "Save Salary"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── small form pieces (outside the form so inputs keep focus while typing) ── */
const Money = ({ k, label, hint, f, set }) => (
  <div>
    <label className={LBL}>{label}</label>
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
      <input type="number" min="0" step="1" value={f[k]} onChange={set(k)} placeholder="0" className={`${INP} pl-7 tabular-nums`} />
    </div>
    {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
  </div>
);
const Toggle = ({ k, label, hint, f, set }) => (
  <label className="flex items-start gap-2.5 cursor-pointer select-none">
    <input type="checkbox" checked={!!f[k]} onChange={set(k)} className="mt-0.5 w-4 h-4 accent-blue-600" />
    <span><span className="block text-sm font-semibold text-slate-700">{label}</span>{hint && <span className="block text-[11px] text-slate-400">{hint}</span>}</span>
  </label>
);
const Seg = ({ k, options, f, set }) => (
  <div className="flex items-center bg-slate-100 rounded-lg p-0.5 w-fit">
    {options.map(([v, l]) => (
      <button key={v} type="button" onClick={() => set(k)(v)}
        className={`px-3 h-8 rounded-md text-xs font-semibold transition-all ${f[k] === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
    ))}
  </div>
);
const Section = ({ title, children }) => (
  <div className="space-y-3">
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5">{title}</p>
    {children}
  </div>
);
const Line = ({ label, value, tone = "", strong }) => (
  <div className={`flex items-center justify-between text-[13px] ${strong ? "font-bold" : ""}`}>
    <span className="text-slate-500">{label}</span><span className={`tabular-nums ${tone}`}>{value}</span>
  </div>
);
