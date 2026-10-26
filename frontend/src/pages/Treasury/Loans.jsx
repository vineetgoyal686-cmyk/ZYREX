import { useEffect, useState } from "react";
import { Landmark, Plus, Pencil, Trash2, ArrowLeft, Loader2, X, Calculator, CheckCircle2, AlertCircle, Clock, Undo2, ChevronDown } from "lucide-react";
import api from "../../utils/api";
import PageHeader from "../../components/PageHeader";
import { headerBtn, headerBtnSecure as headerBtnPrimary } from "../../components/headerStyles";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { HelpButton, HelpPanel } from "./mastersHelp";
import { RecordModal } from "./Masters";
import { AccountPicker, AccountModal, mastersApi } from "./mastersShared";

/*
 * Treasury › Loans & EMI. A loan's EMI schedule is worked out from its
 * first EMI date and tenure; marking an EMI paid also writes a "Paid" entry
 * into the Party Ledger under the lender. Overdue EMIs build up penalty per
 * the loan's rule, month by month, until paid.
 */
const inr = (v) => (Number(v) || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
// DD.MM.YYYY
const fmtDate = (d) => {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return day && m && y ? `${day}.${m}.${y}` : "—";
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const me = () => { try { return JSON.parse(localStorage.getItem("bms_user") || "{}").name || ""; } catch { return ""; } };

const inp = "w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-800 outline-none focus:border-slate-400 bg-white";
const lbl = "block text-[12px] font-semibold text-slate-500 mb-1";

const PENALTY_LABEL = { none: "No penalty", fixed: "Fixed ₹ per month late", percent: "% of EMI per month late", both: "Fixed ₹ + % of EMI" };

// Standard EMI on a reducing balance
const calcEmi = (p, ratePct, n) => {
  const r = Number(ratePct) / 12 / 100;
  if (!p || !n) return 0;
  if (!r) return Math.round((p / n) * 100) / 100;
  return Math.round((p * r * (1 + r) ** n) / ((1 + r) ** n - 1) * 100) / 100;
};

const STATUS = {
  paid:     { label: "Paid",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  overdue:  { label: "Overdue",  cls: "bg-rose-50 text-rose-700 border-rose-200",          icon: AlertCircle },
  upcoming: { label: "Upcoming", cls: "bg-slate-50 text-slate-500 border-slate-200",       icon: Clock },
};

const emptyLoan = { name: "", lender: "", companyName: "", principal: "", interestRate: "", tenureMonths: "", emiAmount: "",
  startDate: "", penaltyType: "none", penaltyFixed: "", penaltyPercent: "", remarks: "" };

// Forms open as a panel from the right, like the rest of Treasury
function Modal({ title, sub, onClose, children, footer, width = "max-w-[600px]" }) {
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-[2px]">
      <div className={`zy-panel-in h-full w-full ${width} bg-white shadow-2xl flex flex-col`}>
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {sub && <p className="text-[12px] text-slate-500">{sub}</p>}
          </div>
          <button onClick={onClose} title="Close" className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/60 flex justify-end gap-2 shrink-0">{footer}</div>
      </div>
    </div>
  );
}

// A native select with its own chevron (room to breathe, not stuck to the edge)
function Pick({ value, onChange, children }) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} className={`${inp} appearance-none pr-9 cursor-pointer`}>{children}</select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

// Lender and company come from Treasury › Masters (Parties / Our Companies)
const useSeed = () => {
  const [seed, setSeed] = useState({ companies: [], vendors: [], otherAccounts: [] });
  const load = () => api.get("/api/treasury/ledger/seed-options").then(r => setSeed(r.data || {})).catch(() => {});
  useEffect(() => { load(); }, []);
  return [seed, load];
};
const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

function LoanForm({ initial, onClose, onSaved }) {
  const [f, setF] = useState(initial ? { ...emptyLoan, ...initial } : emptyLoan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [seed, reloadSeed] = useSeed();
  const [addNew, setAddNew] = useState(null); // "parties" | "companies"
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setSaving(true); setError("");
    try {
      const body = { ...f, createdByName: me() };
      if (initial?.id) await api.put(`/api/treasury/loans/${initial.id}`, body);
      else await api.post("/api/treasury/loans", body);
      onSaved();
    } catch (e) { setError(e.response?.data?.error || "Couldn't save the loan"); }
    setSaving(false);
  };

  // a name already on the loan stays selectable even if it isn't in Masters
  const opts = (list, current) => {
    const names = (list || []).map(o => o.name);
    return current && !names.some(n => sameName(n, current)) ? [current, ...names] : names;
  };
  const newLink = (kind, text) => (
    <button type="button" onClick={() => setAddNew(kind)} className="text-[11px] font-semibold text-[#10243b] hover:underline inline-flex items-center gap-0.5">
      <Plus size={11} /> {text}
    </button>
  );

  return (
    <Modal title={initial?.id ? "Edit Loan" : "New Loan"} onClose={onClose}
      footer={<>
        <button onClick={onClose} className={headerBtn}>Cancel</button>
        <button onClick={save} disabled={saving} className={`${headerBtnPrimary} disabled:opacity-50`}>
          {saving && <Loader2 size={14} className="animate-spin" />} Save
        </button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2"><label className={lbl}>Loan name *</label><input className={inp} value={f.name} onChange={set("name")} /></div>
        <div>
          <div className="flex items-center justify-between"><label className={lbl}>Lender *</label>{newLink("parties", "New lender")}</div>
          <Pick value={f.lender} onChange={set("lender")}>
            <option value="">—</option>
            {opts(seed.vendors, f.lender).map(n => <option key={n} value={n}>{n}</option>)}
          </Pick>
        </div>
        <div>
          <div className="flex items-center justify-between"><label className={lbl}>Company</label>{newLink("companies", "New company")}</div>
          <Pick value={f.companyName} onChange={set("companyName")}>
            <option value="">—</option>
            {opts(seed.companies, f.companyName).map(n => <option key={n} value={n}>{n}</option>)}
          </Pick>
        </div>
        <div><label className={lbl}>Principal (₹)</label><input type="number" className={inp} value={f.principal} onChange={set("principal")} /></div>
        <div><label className={lbl}>Interest (% per year)</label><input type="number" className={inp} value={f.interestRate} onChange={set("interestRate")} /></div>
        <div><label className={lbl}>Tenure (months) *</label><input type="number" className={inp} value={f.tenureMonths} onChange={set("tenureMonths")} /></div>
        <div>
          <label className={lbl}>EMI amount (₹) *</label>
          <div className="flex gap-2">
            <input type="number" className={inp} value={f.emiAmount} onChange={set("emiAmount")} />
            <button type="button" title="Work out from principal, interest and tenure"
              onClick={() => setF(x => ({ ...x, emiAmount: String(calcEmi(Number(x.principal), x.interestRate, Number(x.tenureMonths)) || "") }))}
              className="shrink-0 h-10 px-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 text-[12px] font-semibold">
              <Calculator size={14} /> Calculate
            </button>
          </div>
        </div>
        <div><label className={lbl}>First EMI date *</label><input type="date" className={inp} value={f.startDate} onChange={set("startDate")} /></div>
        <div>
          <label className={lbl}>Penalty if an EMI is late</label>
          <Pick value={f.penaltyType} onChange={set("penaltyType")}>
            {Object.entries(PENALTY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Pick>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {["fixed", "both"].includes(f.penaltyType) && (
            <div><label className={lbl}>₹ per month</label><input type="number" className={inp} value={f.penaltyFixed} onChange={set("penaltyFixed")} /></div>
          )}
          {["percent", "both"].includes(f.penaltyType) && (
            <div><label className={lbl}>% of EMI per month</label><input type="number" className={inp} value={f.penaltyPercent} onChange={set("penaltyPercent")} /></div>
          )}
        </div>
        <div className="sm:col-span-2"><label className={lbl}>Remarks</label><input className={inp} value={f.remarks} onChange={set("remarks")} /></div>
      </div>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {addNew && (
        <RecordModal kind={addNew} onClose={() => setAddNew(null)} canAdd canEdit notify={() => {}}
          onSaved={async (_msg, item) => {
            await reloadSeed();
            setF(x => ({ ...x, [addNew === "parties" ? "lender" : "companyName"]: item?.name || x[addNew === "parties" ? "lender" : "companyName"] }));
            setAddNew(null);
          }} />
      )}
    </Modal>
  );
}

function PayForm({ loan, row, onClose, onSaved }) {
  const [paidOn, setPaidOn] = useState(todayISO());
  const [penalty, setPenalty] = useState(String(row.penalty || 0));
  const [mode, setMode] = useState("account");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [seed, reloadSeed] = useSeed();
  const [ourAcc, setOurAcc] = useState("");
  const [theirAcc, setTheirAcc] = useState("");
  const [addingOther, setAddingOther] = useState(false);

  // our side: the loan company's accounts, then Other / Personal ones by person
  const company = (seed.companies || []).find(c => sameName(c.name, loan.companyName));
  const lender = (seed.vendors || []).find(v => sameName(v.name, loan.lender));
  const ourList = company?.accounts || [];
  const others = seed.otherAccounts || [];
  const byPerson = new Map();
  others.forEach(a => { const k = (a.label || "Other").trim(); byPerson.set(k, [...(byPerson.get(k) || []), a]); });
  const ourGroups = [...(company ? [{ title: company.name, accounts: ourList }] : []), ...[...byPerson].map(([title, accounts]) => ({ title, accounts }))];
  const theirList = lender?.accounts || [];
  const primary = (list) => (list.find(a => a.isPrimary) || list[0])?.accountNumber || "";
  useEffect(() => { setOurAcc(a => a || primary(ourList)); }, [ourList.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTheirAcc(a => a || primary(theirList)); }, [theirList.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true); setError("");
    const ours = [...ourList, ...others].find(a => a.accountNumber === ourAcc);
    const theirs = theirList.find(a => a.accountNumber === theirAcc);
    try {
      await api.post(`/api/treasury/loans/${loan.id}/emis/${row.emiNo}/pay`, {
        paidOn, penalty, mode, reference, createdByName: me(),
        accountNoFrom: ourAcc, ifscFrom: ours?.ifsc || "", accountNoTo: theirAcc, ifscTo: theirs?.ifsc || "",
        accountHolderName: theirs?.holderName || "",
      });
      onSaved();
    } catch (e) { setError(e.response?.data?.error || "Couldn't mark it paid"); }
    setSaving(false);
  };

  return (
    <Modal title={`Pay EMI ${row.emiNo} — ${loan.name}`} sub={`${inr(row.amount)} · due ${fmtDate(row.dueDate)} · to ${loan.lender}`} width="max-w-[520px]" onClose={onClose}
      footer={<>
        <button onClick={onClose} className={headerBtn}>Cancel</button>
        <button onClick={save} disabled={saving} className={`${headerBtnPrimary} disabled:opacity-50`}>
          {saving && <Loader2 size={14} className="animate-spin" />} Mark Paid
        </button>
      </>}>
      <div className="grid grid-cols-2 gap-4">
        <div><label className={lbl}>Paid on</label><input type="date" className={inp} value={paidOn} onChange={e => setPaidOn(e.target.value)} /></div>
        <div><label className={lbl}>Penalty (₹)</label><input type="number" className={inp} value={penalty} onChange={e => setPenalty(e.target.value)} /></div>
        <div>
          <label className={lbl}>Mode</label>
          <Pick value={mode} onChange={e => setMode(e.target.value)}>
            <option value="account">By Account</option>
            <option value="cash">By Hand</option>
          </Pick>
        </div>
        <div><label className={lbl}>UTR / Cheque No.</label><input className={inp} value={reference} onChange={e => setReference(e.target.value)} /></div>
      </div>
      {mode !== "cash" && (
        <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <AccountPicker label="Our A/c (from)" groups={ourGroups} value={ourAcc} onChange={setOurAcc}
            onAddOther={() => setAddingOther(true)} emptyText="No account in Masters" />
          <AccountPicker label={`${loan.lender} A/c (to)`} accounts={theirList} value={theirAcc} onChange={setTheirAcc} />
        </div>
      )}
      <p className="mt-4 text-[12px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
        A "Paid" entry of {inr(Number(row.amount) + (Number(penalty) || 0))} to {loan.lender} will be added to the Party Ledger.
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {addingOther && (
        <AccountModal other oneTime onClose={() => setAddingOther(false)}
          onSave={async (d) => {
            if (d.save) { await mastersApi("/accounts", { method: "POST", body: { ...d, ownerType: "other" } }); await reloadSeed(); }
            setOurAcc(d.accountNumber.trim());
            setAddingOther(false);
          }} />
      )}
    </Modal>
  );
}

function LoanDetail({ loanId, perms, onBack, onEdit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => api.get(`/api/treasury/loans/${loanId}`).then(r => setData(r.data)).catch(e => setError(e.response?.data?.error || "Couldn't load the loan"));
  useEffect(() => { load(); }, [loanId]);

  const undo = async (row) => {
    if (!confirm(`Undo EMI ${row.emiNo}? Its Party Ledger entry will be removed too.`)) return;
    setBusy(row.emiNo);
    try { await api.delete(`/api/treasury/loans/${loanId}/emis/${row.emiNo}/pay`); await load(); }
    catch (e) { alert(e.response?.data?.error || "Couldn't undo"); }
    setBusy(null);
  };

  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;
  if (!data) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-400" /></div>;
  const { loan, schedule, summary } = data;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack} title="Back to loans"
            className="w-8 h-8 shrink-0 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-slate-800 truncate">{loan.name}</p>
            <p className="text-[12px] text-slate-400 truncate">
              {loan.lender}{loan.companyName ? ` · ${loan.companyName}` : ""} · {inr(loan.emiAmount)} × {loan.tenureMonths} · {PENALTY_LABEL[loan.penaltyType]}
              {loan.penaltyType !== "none" && ` (${[["fixed", "both"].includes(loan.penaltyType) && inr(loan.penaltyFixed), ["percent", "both"].includes(loan.penaltyType) && `${loan.penaltyPercent}%`].filter(Boolean).join(" + ")})`}
            </p>
          </div>
        </div>
        {perms.canEdit && <button onClick={() => onEdit(loan)} className={headerBtn}><Pencil size={14} /> Edit</button>}
      </div>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            ["Paid", `${summary.paidCount} of ${loan.tenureMonths}`, "text-emerald-700"],
            ["Remaining", inr(summary.remainingAmount), "text-slate-800"],
            ["Overdue", summary.overdueCount ? `${summary.overdueCount} EMI · ${inr(summary.overdueAmount)}` : "None", summary.overdueCount ? "text-rose-700" : "text-slate-800"],
            ["Penalty due", inr(summary.penaltyDue), summary.penaltyDue ? "text-rose-700" : "text-slate-800"],
          ].map(([label, value, cls]) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
              <p className={`text-lg font-bold tabular-nums ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-semibold w-16">EMI</th>
                <th className="text-left px-4 py-3 font-semibold">Due</th>
                <th className="text-right px-4 py-3 font-semibold">Amount</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Penalty</th>
                <th className="text-left px-4 py-3 font-semibold">Paid on</th>
                <th className="text-right px-4 py-3 font-semibold w-32" />
              </tr>
            </thead>
            <tbody>
              {schedule.map(r => {
                const s = STATUS[r.status];
                const Icon = s.icon;
                return (
                  <tr key={r.emiNo} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-semibold text-slate-600">{r.emiNo}</td>
                    <td className="px-4 py-2.5 text-slate-700">{fmtDate(r.dueDate)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">{inr(r.amount)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${s.cls}`}><Icon size={11} /> {s.label}</span>
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.penalty ? "text-rose-700 font-semibold" : "text-slate-300"}`}>{r.penalty ? inr(r.penalty) : "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.paidOn ? `${fmtDate(r.paidOn)}${r.reference ? ` · ${r.reference}` : ""}` : ""}</td>
                    <td className="px-4 py-2.5 text-right">
                      {r.status !== "paid" && perms.canAdd && (
                        <button onClick={() => setPaying(r)} className="h-8 px-3 rounded-lg border border-amber-400/40 bg-gradient-to-b from-[#10243b] to-[#04111f] text-amber-200 text-[12px] font-semibold hover:text-amber-100">Mark Paid</button>
                      )}
                      {r.status === "paid" && perms.canDelete && (
                        <button onClick={() => undo(r)} disabled={busy === r.emiNo} title="Undo this payment"
                          className="h-8 px-2.5 rounded-lg border border-slate-200 text-slate-500 text-[12px] font-semibold hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50">
                          <Undo2 size={12} /> Undo
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {paying && <PayForm loan={loan} row={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load(); }} />}
    </>
  );
}

export default function Loans() {
  const perms = useModulePermissions("treasury_ledger");
  const [loans, setLoans] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [help, setHelp] = useState(false);
  const [editing, setEditing] = useState(null); // {} = new, loan = edit
  const [reloadKey, setReloadKey] = useState(0);

  const load = () => api.get("/api/treasury/loans").then(r => setLoans(r.data.loans || [])).catch(e => setError(e.response?.data?.error || "Couldn't load loans"));
  useEffect(() => { load(); }, []);

  const remove = async (loan) => {
    if (!confirm(`Delete loan "${loan.name}"?`)) return;
    try { await api.delete(`/api/treasury/loans/${loan.id}`); load(); }
    catch (e) { alert(e.response?.data?.error || "Couldn't delete"); }
  };

  if (!perms.canView) {
    return (
      <div className="min-h-full flex items-center justify-center p-10">
        <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-sm">You don't have access to this area</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f8fafc]">
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <PageHeader icon={Landmark} title="Loans & EMI" secure count={loans?.length ?? null}
          actions={<>
            <HelpButton onClick={() => setHelp(true)} />
            {perms.canAdd && !openId && <button onClick={() => setEditing({})} className={headerBtnPrimary}><Plus size={14} /> New Loan</button>}
          </>} />
      </div>
      {help && <HelpPanel tab={openId ? "loan" : "loans"} tabLabel={openId ? "Loan · EMI schedule" : "Loans & EMI"} onClose={() => setHelp(false)} />}

      {openId ? (
        <LoanDetail key={`${openId}|${reloadKey}`} loanId={openId} perms={perms} onBack={() => { setOpenId(null); load(); }} onEdit={l => setEditing(l)} />
      ) : (
        <div className="p-4 sm:p-6">
          {error ? <p className="text-sm text-red-600">{error}</p> : !loans ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Loan</th>
                    <th className="text-left px-4 py-3 font-semibold">Lender</th>
                    <th className="text-right px-4 py-3 font-semibold">EMI</th>
                    <th className="text-left px-4 py-3 font-semibold">Paid</th>
                    <th className="text-left px-4 py-3 font-semibold">Next due</th>
                    <th className="text-left px-4 py-3 font-semibold">Overdue</th>
                    <th className="text-right px-4 py-3 font-semibold">Penalty due</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {loans.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-12 text-slate-400">No loans yet{perms.canAdd ? " — add one with New Loan" : ""}</td></tr>
                  )}
                  {loans.map(l => (
                    <tr key={l.id} onClick={() => setOpenId(l.id)} className="border-t border-slate-100 hover:bg-indigo-50/40 cursor-pointer">
                      <td className="px-4 py-3 font-semibold text-slate-800">{l.name}</td>
                      <td className="px-4 py-3 text-slate-600">{l.lender}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-800">{inr(l.emiAmount)}</td>
                      <td className="px-4 py-3 text-slate-600">{l.summary.paidCount} / {l.tenureMonths}</td>
                      <td className="px-4 py-3 text-slate-600">{l.summary.nextDue ? fmtDate(l.summary.nextDue.dueDate) : "Completed"}</td>
                      <td className={`px-4 py-3 ${l.summary.overdueCount ? "text-rose-700 font-semibold" : "text-slate-400"}`}>
                        {l.summary.overdueCount ? `${l.summary.overdueCount} EMI · ${inr(l.summary.overdueAmount)}` : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${l.summary.penaltyDue ? "text-rose-700 font-semibold" : "text-slate-300"}`}>{l.summary.penaltyDue ? inr(l.summary.penaltyDue) : "—"}</td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex gap-1">
                          {perms.canEdit && <button onClick={() => setEditing(l)} title="Edit" className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"><Pencil size={14} /></button>}
                          {perms.canDelete && <button onClick={() => remove(l)} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editing && (
        <LoanForm initial={editing.id ? editing : null} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); setReloadKey(k => k + 1); }} />
      )}
    </div>
  );
}
