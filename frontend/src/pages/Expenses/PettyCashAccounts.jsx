import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Loader2, Paperclip, CalendarRange, ChevronDown } from "lucide-react";
import api from "../../utils/api";
import Pagination from "./Pagination";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import {
  CATEGORIES, PROOF_TYPES, PAYMENT_MODES, GRID_TABLE, DOC_SECTIONS, labelOf, taxLabel, fmtAmount, fmtDate, todayStr, apiError,
} from "./pettyCashConstants";

const monthStart = () => `${todayStr().slice(0, 8)}01`;

// ── Period presets ────────────────────────────────────────────────────────
// Each resolves to { from, to } (YYYY-MM-DD, local dates). Ranges that
// include the current month end today. Financial year = April to March.
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const firstOfMonth = (y, m) => ymd(new Date(y, m, 1));
const lastOfMonth = (y, m) => ymd(new Date(y, m + 1, 0));

const periodOptions = () => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), today = ymd(now);
  const fyStart = m >= 3 ? y : y - 1; // FY starts 1 April
  const quick = [
    { id: "this_month",  label: "This Month",          from: firstOfMonth(y, m), to: today },
    { id: "last_month",  label: "Last Month",          from: firstOfMonth(y, m - 1), to: lastOfMonth(y, m - 1) },
    { id: "last_3",      label: "Last 3 Months",       from: firstOfMonth(y, m - 2), to: today },
    { id: "last_6",      label: "Last 6 Months",       from: firstOfMonth(y, m - 5), to: today },
    { id: "last_12",     label: "Last 12 Months",      from: firstOfMonth(y, m - 11), to: today },
    { id: "this_fy",     label: `This Financial Year (${fyStart}-${String(fyStart + 1).slice(2)})`, from: `${fyStart}-04-01`, to: today },
    { id: "last_fy",     label: `Last Financial Year (${fyStart - 1}-${String(fyStart).slice(2)})`, from: `${fyStart - 1}-04-01`, to: `${fyStart}-03-31` },
    { id: "this_year",   label: `This Year (${y})`,  from: `${y}-01-01`, to: today },
    { id: "last_year",   label: `Last Year (${y - 1})`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ];
  return quick;
};

// "YYYY-MM" -> that month's range (the current month ends today).
const monthRange = (ym) => {
  const [yy, mm] = ym.split("-").map(Number);
  const to = lastOfMonth(yy, mm - 1);
  return { from: firstOfMonth(yy, mm - 1), to: to > todayStr() ? todayStr() : to };
};

// First (Date) and last (Attachments) columns stay pinned while the middle
// scrolls sideways; the header row stays pinned while rows scroll.
const HEADERS = ["Date", "Particular Items", "Tax / Non Tax", "Bill Type", "Payment", "Project", "Location", "Category", "Amount", "Remarks", "Attachments"];
const PIN_LEFT  = "sticky left-0 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]";
const PIN_RIGHT = "sticky right-0 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)]";
const pinFor = (i) => (i === 0 ? PIN_LEFT : i === HEADERS.length - 1 ? PIN_RIGHT : "");

// scope = { company, project (null = all), projects } from the Petty Cash header.
export default function PettyCashAccounts({ scope }) {
  const { canExport } = useModulePermissions("petty_cash_accounts");
  const [from, setFrom]       = useState(monthStart());
  const [to, setTo]           = useState(todayStr());
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [page, setPage]       = useState(1);
  const [perPage, setPerPage] = useState(20);
  const periods = useMemo(() => periodOptions(), []);
  const [monthMode, setMonthMode] = useState(false); // "Pick a month" chosen
  // Shown option: the quick range matching the dates, else a whole month,
  // else "Custom" (dates typed by hand).
  const isWholeMonth = from.slice(0, 7) === to.slice(0, 7) && monthRange(from.slice(0, 7)).from === from && monthRange(from.slice(0, 7)).to === to;
  const periodId = monthMode ? "month" : periods.find(p => p.from === from && p.to === to)?.id || (isWholeMonth ? "month" : "custom");
  const pickMonth = (ym) => { if (!ym) return; const r = monthRange(ym); setFrom(r.from); setTo(r.to); };
  const pickPeriod = (id) => {
    if (id === "month") { setMonthMode(true); pickMonth(from.slice(0, 7)); return; }
    setMonthMode(false);
    const p = periods.find(x => x.id === id);
    if (p) { setFrom(p.from); setTo(p.to); }
  };
  const setDate = (setter) => (e) => { setMonthMode(false); setter(e.target.value); };

  useEffect(() => {
    if (!from || !to) return;
    if (from > to) { setError("From date must be before To date"); setData(null); return; }
    let alive = true;
    setLoading(true);
    setError("");
    setPage(1);
    api.get("/api/petty-cash/accounts", { params: { from, to, company_id: scope.company.id, project_id: scope.project?.id || undefined } })
      .then(({ data }) => { if (alive) setData(data); })
      .catch(err => { if (alive) { setError(apiError(err, "Failed to load")); setData(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [from, to]);

  const categoryTotals = useMemo(() => {
    const totals = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
    (data?.rows || []).forEach(r => { totals[CATEGORIES.includes(r.category) ? r.category : "Others"] += r.amount; });
    return totals;
  }, [data]);

  const downloadExcel = () => {
    if (!data) return;
    const { summary, rows } = data;
    // One link column per file slot per attachment section, e.g. "Bills 1",
    // "Bills 2", "Payment Docs" — only for sections that have any files.
    const docCols = DOC_SECTIONS.flatMap(s => {
      const max = rows.reduce((m, r) => Math.max(m, r.documents[s.key]?.length || 0), 0);
      return Array.from({ length: max }, (_, i) => ({ key: s.key, idx: i, header: max > 1 ? `${s.label} ${i + 1}` : s.label }));
    });
    const header = [
      "Date", "Particular Items", "Tax Invoice / Non Tax Invoice", "Bill Type", "Payment Mode",
      "Cost Center/ Project Name", "Location", ...CATEGORIES, "Total Exps. Only", "Remarks",
      ...docCols.map(c => c.header),
    ];
    const catStart = 7;
    const totalCol = catStart + CATEGORIES.length;

    const aoa = [
      [`Petty Cash — Accounts Statement · ${scope.company.name}`],
      [`Project: ${scope.project?.name || "All projects"}   |   Period: ${fmtDate(from)} to ${fmtDate(to)}`],
      [],
      ["Opening Balance", summary.opening],
      ["Received from Accounts", summary.received],
      ["Total Expense", summary.expense],
      ["Closing Balance", summary.closing],
      [],
      header,
    ];
    const headerRow = aoa.length - 1;

    rows.forEach(r => {
      const line = [
        fmtDate(r.entryDate), r.particular, taxLabel(r.proofType), labelOf(PROOF_TYPES, r.proofType),
        labelOf(PAYMENT_MODES, r.paymentMode), r.project, r.location,
        ...CATEGORIES.map(c => ((CATEGORIES.includes(r.category) ? r.category : "Others") === c ? r.amount : "")),
        r.amount, r.remarks,
        ...docCols.map(c => (r.documents[c.key]?.[c.idx] ? "View" : "")),
      ];
      aoa.push(line);
    });
    aoa.push([
      "Total", "", "", "", "", "", "",
      ...CATEGORIES.map(c => categoryTotals[c] || ""),
      summary.expense,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Clickable attachment links.
    rows.forEach((r, i) => {
      docCols.forEach((c, d) => {
        const url = r.documents[c.key]?.[c.idx];
        if (!url) return;
        const ref = XLSX.utils.encode_cell({ r: headerRow + 1 + i, c: totalCol + 2 + d });
        if (ws[ref]) ws[ref].l = { Target: url, Tooltip: `Open ${c.header}` };
      });
    });

    ws["!cols"] = header.map((h, i) => ({
      wch: i === 1 ? 34 : i === 0 ? 11 : i >= catStart && i < totalCol ? Math.max(10, Math.min(h.length, 18)) : Math.max(12, Math.min(h.length + 2, 26)),
    }));
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Petty Cash");
    const tag = [scope.company.code, scope.project?.name].filter(Boolean).join("_").replace(/[^a-zA-Z0-9_-]+/g, "_");
    XLSX.writeFile(wb, `petty_cash_${tag ? `${tag}_` : ""}${from}_to_${to}.xlsx`);
  };

  const s = data?.summary;
  return (
    <div className="p-4 sm:p-6 space-y-5 md:flex-1 md:min-h-0 md:flex md:flex-col md:space-y-0 md:gap-5">
      <div className="shrink-0 flex flex-wrap items-end gap-3 bg-white rounded-xl border border-slate-200 px-5 py-4">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-slate-500 mb-1">Period</span>
          <div className="relative">
            <CalendarRange size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select value={periodId} onChange={e => pickPeriod(e.target.value)}
              className="h-10 w-[230px] appearance-none border border-slate-300 rounded-lg pl-9 pr-8 bg-white text-slate-800 outline-none focus:border-slate-500 cursor-pointer">
              {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              <option value="month">Pick a month…</option>
              <option value="custom" disabled={periodId !== "custom"}>Custom dates</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </label>
        {periodId === "month" && (
          <label className="text-sm">
            <span className="block text-xs font-semibold text-slate-500 mb-1">Month</span>
            <input type="month" value={from.slice(0, 7)} max={todayStr().slice(0, 7)} onChange={e => { setMonthMode(true); pickMonth(e.target.value); }}
              className="h-10 border border-slate-300 rounded-lg px-3 outline-none focus:border-slate-500" />
          </label>
        )}
        <label className="text-sm">
          <span className="block text-xs font-semibold text-slate-500 mb-1">From</span>
          <input type="date" value={from} onChange={setDate(setFrom)} className="h-10 border border-slate-300 rounded-lg px-3 outline-none focus:border-slate-500" />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-slate-500 mb-1">To</span>
          <input type="date" value={to} onChange={setDate(setTo)} className="h-10 border border-slate-300 rounded-lg px-3 outline-none focus:border-slate-500" />
        </label>
        {canExport && (
          <button onClick={downloadExcel} disabled={!data || loading}
            className="ml-auto h-10 px-4 flex items-center gap-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            <FileSpreadsheet size={16} /> Download Excel
          </button>
        )}
      </div>

      {error && <p className="shrink-0 text-sm text-red-600">{error}</p>}

      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Opening Balance", value: s?.opening },
          { label: "Received from Accounts", value: s?.received, color: "text-emerald-700" },
          { label: "Total Expense", value: s?.expense, color: "text-rose-700" },
          { label: "Closing Balance", value: s?.closing, color: (s?.closing || 0) < 0 ? "text-rose-700" : "text-slate-900" },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-xl sm:text-2xl font-extrabold mt-1 tabular-nums ${c.color || "text-slate-900"}`}>
              {loading || !s ? "—" : `₹ ${fmtAmount(c.value)}`}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden md:flex-1 md:min-h-0 md:flex md:flex-col">
        <div className="overflow-auto md:flex-1 md:min-h-0 thin-scroll">
          <table className={GRID_TABLE}>
            <thead className="text-slate-600">
              <tr>
                {HEADERS.map((h, i) => (
                  <th key={h} className={`sticky top-0 bg-slate-50 px-4 py-2.5 font-semibold whitespace-nowrap ${h === "Amount" ? "text-right" : "text-left"} ${pinFor(i) ? `${pinFor(i)} z-30` : "z-20"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
              ) : !data || data.rows.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">No expenses in this period</td></tr>
              ) : data.rows.slice((page - 1) * perPage, page * perPage).map(r => (
                <tr key={r.id} className="border-t border-slate-200">
                  <td className={`px-4 py-2.5 whitespace-nowrap bg-white z-10 ${PIN_LEFT}`}>{fmtDate(r.entryDate)}</td>
                  <td className="px-4 py-2.5 max-w-[260px] truncate" title={r.particular}>{r.particular}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{taxLabel(r.proofType)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{labelOf(PROOF_TYPES, r.proofType)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{labelOf(PAYMENT_MODES, r.paymentMode)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{r.project || "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{r.location || "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{r.category}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmtAmount(r.amount)}</td>
                  <td className="px-4 py-2.5 max-w-[180px] truncate text-slate-500" title={r.remarks}>{r.remarks || "—"}</td>
                  <td className={`px-4 py-2.5 whitespace-nowrap text-xs bg-white z-10 ${PIN_RIGHT}`}>
                    {DOC_SECTIONS.some(s => r.documents[s.key]?.length) ? DOC_SECTIONS.filter(s => r.documents[s.key]?.length).map(s => (
                      <div key={s.key} className="flex items-center gap-1.5">
                        <span className="text-slate-500">{s.label}:</span>
                        {r.documents[s.key].map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-blue-600 hover:underline">
                            <Paperclip size={11} />{i + 1}
                          </a>
                        ))}
                      </div>
                    )) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && data && (
          <Pagination page={page} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={data.rows.length} />
        )}
      </div>
    </div>
  );
}
