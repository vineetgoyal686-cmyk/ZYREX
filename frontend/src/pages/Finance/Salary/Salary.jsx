import React, { useEffect, useMemo, useState } from "react";
import {
  Building2, Wallet, Calculator, Search, Loader2, Users, UserCheck, UserX, IndianRupee, Landmark, ShieldCheck,
  Edit2, Plus, History, TrendingUp, Download, Lock,
} from "lucide-react";
import * as XLSX from "xlsx";
import API from "../../../api";
import ScopeDropdown from "../../../components/ScopeDropdown";
import { useModulePermissions } from "../../../hooks/useModulePermissions";
import StatCards from "../../Attendance/StatCards";
import CategoryTabs, { inCategory } from "../../Attendance/CategoryTabs";
import Pager, { pageOf } from "../../Attendance/Pager";
import ActionBtn, { RowMenu } from "../../Attendance/ActionBtn";
import { MoreMenu } from "../../Attendance/DailyRegister";
import { CATEGORY_DOT } from "../../Attendance/utils";
import SalaryForm from "./SalaryForm";
import HistoryModal from "./HistoryModal";
import { calc, inr, fmtDay } from "./calc";
import BrandLoader from "../../../components/BrandLoader";

/*
 * Finance › Salary. Step 1 — Salary Records: each employee's salary
 * structure (earnings, PF / ESI / PT / TDS, bank details), with revisions.
 * Step 2 (Payroll) will take these + attendance paid days each month.
 */
const TABS = [
  { id: "records", label: "Salary Records", icon: Wallet },
  { id: "payroll", label: "Payroll",        icon: Calculator },
];
const STORE = "salary_company";

export default function Salary() {
  const { canView, canAdd, canEdit, canExport } = useModulePermissions("salary");
  const [tab, setTab] = useState("records");
  const [companies, setCompanies] = useState(null);
  const [companyId, setCompanyId] = useState(() => localStorage.getItem(STORE) || "");
  const [data, setData] = useState(null); // { today, records }
  const [error, setError] = useState("");
  const [group, setGroup] = useState("all");
  const [card, setCard] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [form, setForm] = useState(null);       // { person, mode: new|revise|edit, record? }
  const [historyOf, setHistoryOf] = useState(null);

  useEffect(() => {
    API.get("/api/salary/companies")
      .then(({ data }) => setCompanies(data.companies || []))
      .catch(err => { setCompanies([]); setError(err?.response?.data?.error || "Could not load companies"); });
  }, []);
  const company = companies?.find(c => c.id === companyId) || companies?.[0] || null;

  const load = () => {
    if (!company) return;
    setData(null); setError("");
    API.get("/api/salary/records", { params: { company_id: company.id } })
      .then(({ data }) => setData(data))
      .catch(err => { setData({ records: [] }); setError(err?.response?.data?.error || "Could not load salary records"); });
  };
  useEffect(() => { if (company) { localStorage.setItem(STORE, company.id); load(); } }, [company?.id]);
  useEffect(() => { setPage(1); }, [group, card, q, per, company?.id]);

  const records = data?.records || [];
  const groupList = useMemo(() => records.filter(r => inCategory(r.category, group)), [records, group]);
  const stats = useMemo(() => {
    const s = { total: 0, set: 0, unset: 0, gross: 0, ctc: 0, pf: 0, esi: 0, agency: 0 };
    groupList.forEach(r => {
      if (r.blocked) { s.agency++; return; }
      s.total++;
      if (!r.current) { s.unset++; return; }
      s.set++;
      const c = calc(r.current);
      s.gross += c.gross; s.ctc += c.ctc;
      if (r.current.pfApplicable) s.pf++;
      if (c.esi) s.esi++;
    });
    return s;
  }, [groupList]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return groupList.filter(r => {
      if (card === "set" && (!r.current || r.blocked)) return false;
      if (card === "unset" && (r.current || r.blocked)) return false;
      if (card === "pf" && !r.current?.pfApplicable) return false;
      if (card === "esi" && !(r.current && calc(r.current).esi)) return false;
      return !s || `${r.name} ${r.designation} ${r.empCode} ${r.department}`.toLowerCase().includes(s);
    }).sort((a, b) => !!a.blocked - !!b.blocked || a.name.localeCompare(b.name));
  }, [groupList, card, q]);
  const paged = pageOf(shown, page, per);

  const exportExcel = () => {
    const rows = shown.filter(r => r.current).map((r, i) => {
      const s = r.current, c = calc(s);
      return {
        "#": i + 1, Name: r.name, "Employee ID": r.empCode, Designation: r.designation, Category: r.category,
        "Effective From": s.effectiveFrom, "Pay Type": s.payType === "daily" ? "Daily" : "Monthly",
        "Day Rate": s.dailyRate || "", Basic: s.basic, HRA: s.hra, Conveyance: s.conveyance, Medical: s.medical,
        "Special Allowance": s.specialAllowance, "Other Allowance": s.otherAllowance, Gross: c.gross,
        "PF (Employee)": c.pf, "ESI (Employee)": c.esi, PT: c.pt, TDS: c.tds, "Net Pay": c.net,
        "PF (Employer)": c.pfEr, "ESI (Employer)": c.esiEr, CTC: c.ctc, "OT / hour": s.otRate || "",
        "Payment Mode": s.paymentMode, Bank: s.bankName, "Account No": s.accountNumber, IFSC: s.ifsc,
        PAN: s.pan, UAN: s.uan, "ESIC No": s.esicNumber,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Salary");
    XLSX.writeFile(wb, `Salary_${company.code || company.name}.xlsx`);
  };

  if (!canView) return (
    <div className="flex min-h-full items-center justify-center p-10">
      <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-sm">You don't have access to this area</p>
    </div>
  );

  const th = "px-3 py-2.5 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap";
  const td = "px-3 py-2.5 border-b border-r border-slate-200 text-[13px] text-slate-600 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors";
  const cards = [
    { id: "",      label: "Employees",     value: stats.total, Icon: Users,       accent: "#475569", tint: "#f1f5f9", sub: stats.agency ? `+${stats.agency} agency` : "" },
    { id: "set",   label: "Salary Set",    value: stats.set,   Icon: UserCheck,   accent: "#059669", tint: "#ecfdf5" },
    { id: "unset", label: "Not Set",       value: stats.unset, Icon: UserX,       accent: "#dc2626", tint: "#fef2f2" },
    { label: "Monthly Gross",              value: inr(stats.gross), Icon: IndianRupee, accent: "#2563eb", tint: "#eff6ff" },
    { label: "Monthly CTC",                value: inr(stats.ctc),   Icon: Landmark,    accent: "#4f46e5", tint: "#eef2ff" },
    { id: "pf",    label: "PF / ESI",      value: stats.pf,    Icon: ShieldCheck, accent: "#0d9488", tint: "#f0fdfa", sub: `/ ${stats.esi}` },
  ];

  return (
    <div className="h-full flex flex-col bg-[#f8fafc]">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit shrink-0">
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold transition-all
                ${tab === t.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {!companies && <Loader2 size={16} className="animate-spin text-slate-400" />}
          {company && (
            <ScopeDropdown subtle icon={Building2} value={company.id} placeholder="Select company" countLabel="Total Companies"
              onChange={setCompanyId} options={companies.map(c => ({ id: c.id, title: c.name, code: c.code }))} />
          )}
        </div>
      </div>

      {tab === "payroll" ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500"><Calculator size={22} /></div>
          <p className="text-sm font-semibold text-slate-700">Payroll comes next</p>
          <p className="text-xs text-slate-400 max-w-sm">Each month it will take the salary records here and the paid days from Attendance › Monthly Sheet to work out everyone's pay.</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-4 p-4 sm:p-5">
          <div className="shrink-0 flex flex-wrap items-center gap-2">
            <CategoryTabs list={records} value={group} onChange={setGroup} />
            <div className="relative w-48 sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, ID, department…"
                className="h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg bg-white w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div className="ml-auto">
              <MoreMenu items={[
                canExport && { label: "Export", hint: "Salary records as Excel", Icon: Download, onClick: exportExcel, disabled: !shown.some(r => r.current) },
              ].filter(Boolean)} />
            </div>
          </div>

          <div className="shrink-0"><StatCards cards={cards} active={card} onPick={setCard} /></div>

          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto">
              {!data ? (
                <div className="flex items-center justify-center h-48"><BrandLoader /></div>
              ) : error ? (
                <p className="p-6 text-sm text-red-600">{error}</p>
              ) : (
                <table className="w-full text-left border-separate border-spacing-0 min-w-[1100px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                      <th className={`${th} w-12 text-center`}>#</th>
                      <th className={th}>Name</th>
                      <th className={`${th} text-center`}>Category</th>
                      <th className={`${th} text-center`}>Pay</th>
                      <th className={`${th} text-right`}>Gross / Month</th>
                      <th className={`${th} text-right`}>Deductions</th>
                      <th className={`${th} text-right`}>Net Pay</th>
                      <th className={`${th} text-right`}>CTC</th>
                      <th className={`${th} text-center`}>Effective From</th>
                      <th className={`${th} text-center border-r-0`}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((r, idx) => {
                      const s = r.current, c = calc(s);
                      return (
                        <tr key={r.employeeId} className="group">
                          <td className={`${td} text-center text-xs text-slate-400 tabular-nums`}>{(page - 1) * per + idx + 1}</td>
                          <td className={`${td} min-w-[210px]`}>
                            <button type="button" onClick={() => s && setHistoryOf(r)} disabled={!s} title={s ? "Salary details and history" : ""}
                              className={`font-semibold text-slate-800 leading-tight text-left ${s ? "hover:text-blue-600 hover:underline underline-offset-2" : "cursor-default"}`}>{r.name}</button>
                            <p className="text-[11px] text-slate-400 mt-0.5">{[r.designation, r.empCode].filter(Boolean).join(" · ") || "—"}</p>
                          </td>
                          <td className={`${td} text-center`}>
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                              <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[r.category] || "bg-slate-300"}`} />{r.category || "—"}
                            </span>
                          </td>
                          {r.blocked ? (
                            <td colSpan={6} className={`${td} text-center text-xs text-slate-400 italic`}>
                              <Lock size={11} className="inline mr-1 -mt-0.5" />{r.blocked}
                            </td>
                          ) : !s ? (
                            <td colSpan={5} className={`${td} text-center`}>
                              <span className="inline-block px-2.5 py-0.5 rounded-full border border-dashed border-slate-300 text-[11px] font-semibold text-slate-400">Salary not set</span>
                            </td>
                          ) : (
                            <>
                              <td className={`${td} text-center text-xs`}>
                                {c.daily ? <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">{inr(s.dailyRate)}/day</span>
                                  : <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">Monthly</span>}
                              </td>
                              <td className={`${td} text-right tabular-nums font-semibold text-slate-800`}>{inr(c.gross)}{c.daily && <span className="block text-[10px] font-normal text-slate-400">≈ 26 days</span>}</td>
                              <td className={`${td} text-right tabular-nums text-red-600`}>
                                {c.deductions ? `− ${inr(c.deductions)}` : "—"}
                                <span className="block text-[10px] text-slate-400">{[c.pf && "PF", c.esi && "ESI", c.pt && "PT", c.tds && "TDS"].filter(Boolean).join(" · ")}</span>
                              </td>
                              <td className={`${td} text-right tabular-nums font-bold text-emerald-700`}>{inr(c.net)}</td>
                              <td className={`${td} text-right tabular-nums text-slate-700`}>{inr(c.ctc)}</td>
                            </>
                          )}
                          {!r.blocked && (
                            <td className={`${td} text-center`}>
                              {s ? <>
                                <span className="tabular-nums">{fmtDay(s.effectiveFrom)}</span>
                                {r.upcoming && <span className="block text-[10px] font-semibold text-violet-600">Raise from {fmtDay(r.upcoming.effectiveFrom)}</span>}
                              </> : r.upcoming ? <span className="text-[11px] font-semibold text-violet-600">Starts {fmtDay(r.upcoming.effectiveFrom)}</span> : "—"}
                            </td>
                          )}
                          <td className={`${td} text-center border-r-0`}>
                            {r.blocked ? null : !s && !r.upcoming ? (
                              canAdd && (
                                <button onClick={() => setForm({ person: r, mode: "new" })}
                                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100">
                                  <Plus size={12} /> Set Salary
                                </button>
                              )
                            ) : (
                              <div className="flex items-center justify-center gap-1.5">
                                {canEdit && <ActionBtn icon={Edit2} tone="blue" title="Edit this salary" onClick={() => setForm({ person: r, mode: "edit", record: s || r.upcoming })} />}
                                <RowMenu items={[
                                  canAdd && { label: "Revise / Raise", icon: TrendingUp, onClick: () => setForm({ person: r, mode: "revise", record: r.upcoming || s }) },
                                  { label: "History", icon: History, onClick: () => setHistoryOf(r) },
                                ].filter(Boolean)} />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!shown.length && <tr><td colSpan={10} className="py-10 text-center text-sm text-slate-400">{records.length ? "No one matches" : "No employees in this company"}</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
            <Pager total={shown.length} page={page} per={per} onPage={setPage} onPer={setPer} />
          </div>
        </div>
      )}

      {form && (
        <SalaryForm person={form.person} mode={form.mode} record={form.record} today={data?.today}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />
      )}
      {historyOf && (
        <HistoryModal person={historyOf} onClose={() => setHistoryOf(null)}
          onEdit={(rec) => { setHistoryOf(null); setForm({ person: historyOf, mode: "edit", record: rec }); }}
          onChanged={load} />
      )}
    </div>
  );
}
