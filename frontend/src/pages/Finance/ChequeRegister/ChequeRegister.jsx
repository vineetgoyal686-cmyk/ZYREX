import React, { useEffect, useMemo, useState } from "react";
import {
  Building2, Search, Plus, Download, Edit2, Trash2, RefreshCw, Paperclip, Eye,
  Receipt, Upload, ArrowUpRight, ArrowDownLeft, Hourglass, CheckCircle2, XCircle,
} from "lucide-react";
import * as XLSX from "xlsx";
import API from "../../../api";
import ScopeDropdown from "../../../components/ScopeDropdown";
import BrandLoader from "../../../components/BrandLoader";
import { useModulePermissions } from "../../../hooks/useModulePermissions";
import StatCards from "../../Attendance/StatCards";
import Pager, { pageOf } from "../../Attendance/Pager";
import ActionBtn, { RowMenu } from "../../Attendance/ActionBtn";
import { MoreMenu } from "../../Attendance/DailyRegister";
import ChequeForm from "./ChequeForm";
import ChequeBulk from "./ChequeBulk";
import { ChequeView, StatusModal } from "./ChequeView";
import { STATUS, isOpen, inr, fmtDay, typeLabel, isStale, isPostDated } from "./utils";

/*
 * Finance › Cheque Register — every cheque the company gives or gets, for one
 * company at a time: who, how much, which bank, its status (Pending → Handed
 * Over / Deposited → Cleared, or Bounced / Cancelled / Stopped) and the
 * cheque photo / receipt. Backend: routes/cheques.js.
 */
const DIRS = [["all", "All"], ["issued", "Issued"], ["received", "Received"]];
const STORE = "cheque_company";

export default function ChequeRegister() {
  const { canView, canAdd, canEdit, canDelete, canExport } = useModulePermissions("expenses_cheque_record");
  const [scopes, setScopes] = useState(null);
  const [companyId, setCompanyId] = useState(() => localStorage.getItem(STORE) || "");
  const [data, setData] = useState(null); // { today, cheques }
  const [error, setError] = useState("");
  const [dir, setDir] = useState("all");
  const [card, setCard] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [form, setForm] = useState(null);     // { cheque? }
  const [viewOf, setViewOf] = useState(null);
  const [statusOf, setStatusOf] = useState(null);
  const [bulk, setBulk] = useState(false);

  useEffect(() => {
    if (!canView) return;
    API.get("/api/cheques/scopes").then(({ data }) => setScopes(data))
      .catch(err => { setScopes({ companies: [], places: [] }); setError(err?.response?.data?.error || "Could not load companies"); });
  }, [canView]);
  const companies = scopes?.companies || [];
  const company = companies.find(c => c.id === companyId) || companies[0] || null;
  const places = useMemo(() => (scopes?.places || []).filter(p => p.companyId === company?.id), [scopes, company?.id]);
  const placeOf = (c) => places.find(p => p.id === c.placeId);

  const load = () => {
    if (!company) return;
    setData(null); setError("");
    API.get("/api/cheques", { params: { company_id: company.id } })
      .then(({ data }) => setData(data))
      .catch(err => { setData({ cheques: [] }); setError(err?.response?.data?.error || "Could not load cheques"); });
  };
  useEffect(() => { if (company) { localStorage.setItem(STORE, company.id); load(); } }, [company?.id]);
  useEffect(() => { setPage(1); }, [dir, card, q, per, company?.id]);

  const today = data?.today || new Date().toISOString().slice(0, 10);
  const all = data?.cheques || [];
  const dirList = useMemo(() => all.filter(c => dir === "all" || c.direction === dir), [all, dir]);
  const sum = useMemo(() => {
    const s = { count: 0, total: 0, issued: 0, received: 0, open: 0, openN: 0, cleared: 0, clearedN: 0, bounced: 0, bouncedN: 0 };
    dirList.forEach(c => {
      if (c.status === "Cancelled") return;
      s.count++; s.total += c.amount;
      if (c.direction === "issued") s.issued += c.amount; else s.received += c.amount;
      if (isOpen(c)) { s.open += c.amount; s.openN++; }
      if (c.status === "Cleared") { s.cleared += c.amount; s.clearedN++; }
      if (c.status === "Bounced") { s.bounced += c.amount; s.bouncedN++; }
    });
    return s;
  }, [dirList]);
  const known = useMemo(() => ({
    parties: [...new Set(all.map(c => c.partyName).filter(Boolean))].sort(),
    banks: [...new Set(all.map(c => c.bankName).filter(Boolean))].sort(),
  }), [all]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return dirList.filter(c => {
      if (card === "open" && !isOpen(c)) return false;
      if (card === "Cleared" && c.status !== "Cleared") return false;
      if (card === "Bounced" && c.status !== "Bounced") return false;
      if (card === "issued" && c.direction !== "issued") return false;
      if (card === "received" && c.direction !== "received") return false;
      return !s || `${c.chequeNo} ${c.partyName} ${c.bankName} ${c.purpose} ${c.reference} ${c.placeCode} ${c.handedTo} ${c.amount}`.toLowerCase().includes(s);
    });
  }, [dirList, card, q]);
  const paged = pageOf(shown, page, per);

  const remove = async (c) => {
    if (!window.confirm(`Delete cheque ${c.chequeNo} (${c.partyName}, ${inr(c.amount)}) and its attachments?`)) return;
    try { await API.delete(`/api/cheques/${c.id}`); load(); }
    catch (err) { alert(err?.response?.data?.error || "Delete failed"); }
  };

  const exportExcel = () => {
    const rows = shown.map((c, i) => ({
      "#": i + 1, Type: c.direction === "issued" ? "Issued" : "Received", "Cheque No": c.chequeNo, "Cheque Date": c.chequeDate,
      Amount: c.amount, Party: c.partyName, Bank: c.bankName, "Account No": c.accountNo, "Cheque Type": typeLabel(c.chequeType),
      For: c.placeCode, Purpose: c.purpose, "Bill / PO": c.reference, Status: c.status, "Status Date": c.statusDate,
      "Handed To / Collected By": c.handedTo, "Bounce Reason": c.bounceReason, Remarks: c.remarks,
      Attachments: c.attachments.length, "Entered By": c.createdBy,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cheques");
    XLSX.writeFile(wb, `Cheques_${company.code || company.name}.xlsx`);
  };

  if (!canView) return (
    <div className="flex min-h-full items-center justify-center p-10">
      <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-sm">You don't have access to this area</p>
    </div>
  );

  const cards = [
    { label: "Cheques",          value: sum.count,          Icon: Receipt,       accent: "#475569", tint: "#f1f5f9", sub: inr(sum.total) },
    { id: "issued",   label: "Issued",   value: inr(sum.issued),   Icon: ArrowUpRight,  accent: "#dc2626", tint: "#fef2f2" },
    { id: "received", label: "Received", value: inr(sum.received), Icon: ArrowDownLeft, accent: "#059669", tint: "#ecfdf5" },
    { id: "open",     label: "Not Cleared Yet", value: inr(sum.open), Icon: Hourglass,  accent: "#d97706", tint: "#fffbeb", sub: sum.openN || "" },
    { id: "Cleared",  label: "Cleared",  value: inr(sum.cleared),  Icon: CheckCircle2,  accent: "#0d9488", tint: "#f0fdfa", sub: sum.clearedN || "" },
    { id: "Bounced",  label: "Bounced",  value: inr(sum.bounced),  Icon: XCircle,       accent: "#e11d48", tint: "#fff1f2", sub: sum.bouncedN || "" },
  ];
  const th = "px-3 py-2.5 font-semibold bg-slate-50 border-b border-r border-slate-200 whitespace-nowrap";
  const td = "px-3 py-2.5 border-b border-r border-slate-200 text-[13px] text-slate-600 whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors";

  return (
    <div className="h-full flex flex-col bg-[#f8fafc]">
      {/* one header: title · Issued/Received · search … company · ⋯ · Add */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-5 sm:px-6 py-2.5 bg-white border-b border-slate-200">
        <h1 className="text-lg font-extrabold text-slate-900 mr-2">Cheque Register</h1>
        {company && (
          <>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              {DIRS.map(([id, l]) => (
                <button key={id} onClick={() => { setDir(id); setCard(""); }}
                  className={`px-3 h-8 rounded-md text-xs font-semibold transition-all ${dir === id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
              ))}
            </div>
            <div className="relative w-48 sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search cheque no, party, bank…"
                className="h-9 pl-9 pr-3 text-sm border border-slate-200 rounded-lg bg-white w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ScopeDropdown subtle icon={Building2} value={company.id} placeholder="Select company" countLabel="Total Companies"
                onChange={setCompanyId} options={companies.map(c => ({ id: c.id, title: c.name, code: c.code }))} />
              <span className="h-5 w-px bg-slate-200" />
              <MoreMenu items={[
                canAdd && { label: "Bulk Upload", hint: "Many cheques from Excel", Icon: Upload, onClick: () => setBulk(true) },
                canExport && { label: "Export", hint: "These cheques as Excel", Icon: Download, onClick: exportExcel, disabled: !shown.length },
              ].filter(Boolean)} />
              {canAdd && (
                <button onClick={() => setForm({})}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm">
                  <Plus size={15} /> Add Cheque
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {!scopes ? <BrandLoader /> : !company ? (
        <p className="p-6 text-sm text-slate-500">{error || "No active company found."}</p>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-4 p-4 sm:p-5">
          <div className="shrink-0"><StatCards cards={cards} active={card} onPick={setCard} /></div>

          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto">
              {!data ? <BrandLoader /> : error ? <p className="p-6 text-sm text-red-600">{error}</p> : (
                <table className="w-full text-left border-separate border-spacing-0 min-w-[1150px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                      <th className={`${th} w-12 text-center`}>#</th>
                      <th className={th}>Cheque</th>
                      <th className={th}>Party</th>
                      <th className={th}>Bank</th>
                      <th className={`${th} text-right`}>Amount</th>
                      <th className={`${th} text-center`}>Status</th>
                      <th className={`${th} text-center`}>For</th>
                      <th className={`${th} text-center`}>Files</th>
                      <th className={`${th} text-center border-r-0`}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((c, idx) => {
                      const issued = c.direction === "issued";
                      return (
                        <tr key={c.id} className="group">
                          <td className={`${td} text-center text-xs text-slate-400 tabular-nums`}>{(page - 1) * per + idx + 1}</td>
                          <td className={td}>
                            <button type="button" onClick={() => setViewOf(c)} title="View details"
                              className="flex items-center gap-1.5 font-semibold text-slate-800 tabular-nums tracking-wide hover:text-blue-600 hover:underline underline-offset-2">
                              {issued ? <ArrowUpRight size={13} className="text-red-500" /> : <ArrowDownLeft size={13} className="text-emerald-600" />}
                              {c.chequeNo}
                            </button>
                            <p className="text-[11px] text-slate-400 mt-0.5 pl-[19px]">
                              {fmtDay(c.chequeDate)}
                              {isPostDated(c, today) && <span className="ml-1.5 font-semibold text-violet-600">Post-dated</span>}
                              {isStale(c, today) && <span className="ml-1.5 font-semibold text-red-600">Over 3 months</span>}
                            </p>
                          </td>
                          <td className={`${td} min-w-[200px] max-w-[280px]`}>
                            <p className="font-semibold text-slate-800 truncate">{c.partyName}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{[c.purpose, c.reference].filter(Boolean).join(" · ") || (issued ? "Paid to" : "Received from")}</p>
                          </td>
                          <td className={td}>
                            <p>{c.bankName}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{[typeLabel(c.chequeType), c.accountNo && `A/c ${c.accountNo}`].filter(Boolean).join(" · ")}</p>
                          </td>
                          <td className={`${td} text-right tabular-nums font-bold ${issued ? "text-slate-800" : "text-emerald-700"} ${c.status === "Cancelled" ? "line-through text-slate-400" : ""}`}>{inr(c.amount)}</td>
                          <td className={`${td} text-center`}>
                            <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS[c.status]?.soft}`}>{c.status}</span>
                            {c.statusDate && c.status !== "Pending" && <p className="text-[10px] text-slate-400 mt-0.5">{fmtDay(c.statusDate, { day: "numeric", month: "short" })}</p>}
                          </td>
                          <td className={`${td} text-center text-xs`} title={placeOf(c)?.name || ""}>{c.placeCode || "—"}</td>
                          <td className={`${td} text-center`}>
                            {c.attachments.length
                              ? <button onClick={() => setViewOf(c)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-blue-600"><Paperclip size={12} />{c.attachments.length}</button>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className={`${td} text-center border-r-0`}>
                            <div className="flex items-center justify-center gap-1.5">
                              {canEdit && <ActionBtn icon={RefreshCw} tone="blue" title="Change status" onClick={() => setStatusOf(c)} />}
                              <RowMenu items={[
                                { label: "View", icon: Eye, onClick: () => setViewOf(c) },
                                canEdit && { label: "Edit", icon: Edit2, onClick: () => setForm({ cheque: c }) },
                                canDelete && { label: "Delete", icon: Trash2, danger: true, onClick: () => remove(c) },
                              ].filter(Boolean)} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!shown.length && (
                      <tr><td colSpan={9} className="py-14 text-center text-sm text-slate-400">
                        {all.length ? "No cheque matches" : <>No cheques recorded for {company.name} yet.{canAdd && <button onClick={() => setForm({})} className="ml-2 font-semibold text-blue-600 hover:underline">Add the first one</button>}</>}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <Pager total={shown.length} page={page} per={per} onPage={setPage} onPer={setPer} />
          </div>
        </div>
      )}

      {form && (
        <ChequeForm company={company} places={places} cheque={form.cheque} today={today} known={known}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />
      )}
      {bulk && <ChequeBulk company={company} places={places} existing={all} today={today} onClose={() => setBulk(false)} onDone={load} />}
      {viewOf && <ChequeView cheque={viewOf} place={placeOf(viewOf)} today={today} onClose={() => setViewOf(null)} />}
      {statusOf && <StatusModal cheque={statusOf} today={today} onClose={() => setStatusOf(null)} onSaved={() => { setStatusOf(null); load(); }} />}
    </div>
  );
}
