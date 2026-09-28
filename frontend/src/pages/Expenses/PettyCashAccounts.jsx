import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Loader2, Paperclip } from "lucide-react";
import api from "../../utils/api";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import {
  CATEGORIES, PROOF_TYPES, PAYMENT_MODES, labelOf, taxLabel, fmtAmount, fmtDate, todayStr, apiError,
} from "./pettyCashConstants";

const monthStart = () => `${todayStr().slice(0, 8)}01`;

export default function PettyCashAccounts() {
  const { canExport } = useModulePermissions("petty_cash_accounts");
  const [from, setFrom]       = useState(monthStart());
  const [to, setTo]           = useState(todayStr());
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!from || !to) return;
    if (from > to) { setError("From date must be before To date"); setData(null); return; }
    let alive = true;
    setLoading(true);
    setError("");
    api.get("/api/petty-cash/accounts", { params: { from, to } })
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
    const maxDocs = rows.reduce((m, r) => Math.max(m, r.documentUrls.length), 0);
    const header = [
      "Date", "Particular Items", "Tax Invoice / Non Tax Invoice", "Bill Type", "Payment Mode",
      "Cost Center/ Project Name", "Location", ...CATEGORIES, "Total Exps. Only", "Remarks",
      ...Array.from({ length: maxDocs }, (_, i) => (maxDocs > 1 ? `Bill ${i + 1}` : "Bill")),
    ];
    const catStart = 7;
    const totalCol = catStart + CATEGORIES.length;

    const aoa = [
      ["Petty Cash — Accounts Statement"],
      [`Period: ${fmtDate(from)} to ${fmtDate(to)}`],
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
        ...Array.from({ length: maxDocs }, (_, i) => (r.documentUrls[i] ? "View" : "")),
      ];
      aoa.push(line);
    });
    aoa.push([
      "Total", "", "", "", "", "", "",
      ...CATEGORIES.map(c => categoryTotals[c] || ""),
      summary.expense,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Clickable bill links.
    rows.forEach((r, i) => {
      r.documentUrls.forEach((url, d) => {
        if (!url) return;
        const ref = XLSX.utils.encode_cell({ r: headerRow + 1 + i, c: totalCol + 2 + d });
        if (ws[ref]) ws[ref].l = { Target: url, Tooltip: "Open bill" };
      });
    });

    ws["!cols"] = header.map((h, i) => ({
      wch: i === 1 ? 34 : i === 0 ? 11 : i >= catStart && i < totalCol ? Math.max(10, Math.min(h.length, 18)) : Math.max(12, Math.min(h.length + 2, 26)),
    }));
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Petty Cash");
    XLSX.writeFile(wb, `petty_cash_${from}_to_${to}.xlsx`);
  };

  const s = data?.summary;
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-slate-200 px-5 py-4">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-slate-500 mb-1">From</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-10 border border-slate-300 rounded-lg px-3 outline-none focus:border-slate-500" />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-slate-500 mb-1">To</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-10 border border-slate-300 rounded-lg px-3 outline-none focus:border-slate-500" />
        </label>
        {canExport && (
          <button onClick={downloadExcel} disabled={!data || loading}
            className="ml-auto h-10 px-4 flex items-center gap-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            <FileSpreadsheet size={16} /> Download Excel
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      {data && data.rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800 mb-3">Category-wise Expense</h2>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.filter(c => categoryTotals[c] > 0).map(c => (
              <span key={c} className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-sm">
                <span className="text-slate-500">{c}:</span> <b className="tabular-nums text-slate-800">₹ {fmtAmount(categoryTotals[c])}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {["Date", "Particular Items", "Tax / Non Tax", "Bill Type", "Payment", "Project", "Location", "Category", "Amount", "Remarks", "Bill"].map(h => (
                  <th key={h} className={`px-4 py-2.5 font-semibold whitespace-nowrap ${h === "Amount" ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
              ) : !data || data.rows.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">No expenses in this period</td></tr>
              ) : data.rows.map(r => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.entryDate)}</td>
                  <td className="px-4 py-2.5 max-w-[260px] truncate" title={r.particular}>{r.particular}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{taxLabel(r.proofType)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{labelOf(PROOF_TYPES, r.proofType)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{labelOf(PAYMENT_MODES, r.paymentMode)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{r.project || "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{r.location || "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{r.category}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmtAmount(r.amount)}</td>
                  <td className="px-4 py-2.5 max-w-[180px] truncate text-slate-500" title={r.remarks}>{r.remarks || "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {r.documentUrls.length ? r.documentUrls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 mr-2 text-blue-600 hover:underline">
                        <Paperclip size={12} />{r.documentUrls.length > 1 ? i + 1 : "View"}
                      </a>
                    )) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
