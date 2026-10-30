import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Search, ArrowLeft, Download, FileSpreadsheet, FileText, ChevronDown, Loader2, Plus, X,
  Scale, ArrowDownCircle, ArrowUpCircle, Wallet, Landmark, ArrowRight } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import PageHeader from "../../components/PageHeader";
import { headerBtn } from "../../components/headerStyles";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { logAudit } from "../../utils/auditLog";
import LedgerEntries from "./LedgerEntries";
import { HelpButton, HelpPanel } from "./mastersHelp";
import { AccountPicker, AccountModal, mastersApi } from "./mastersShared";
import BrandLoader from "../../components/BrandLoader";

/*
 * Treasury › Party Ledger. "Entries" is the money in / money out register
 * (the old Finance Sheet). "Parties" rolls those entries up per party into
 * a running account, Tally style, with PDF / Excel download.
 * Balance = received − paid: positive = Payable (we have to pay the party),
 * negative = Receivable (the party has to pay us).
 */
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const BASE = `${API}/api/treasury/ledger`;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("bms_token") || ""}` });

const inr = (v) => `₹${(Number(v) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
// DD.MM.YYYY
const fmtDate = (d) => {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return day && m && y ? `${day}.${m}.${y}` : "—";
};
// same words as Masters: Payable = we have to pay them, Receivable = they have to pay us
const balText = (b) => (Math.abs(b) < 0.005 ? "₹0" : `${inr(Math.abs(b))} ${b > 0 ? "Payable" : "Receivable"}`);
const balCls = (b) => (Math.abs(b) < 0.005 ? "text-slate-800" : b > 0 ? "text-rose-700" : "text-emerald-700");
// on screen the colour says which way (red = Payable, green = Receivable); the
// words stay in the cards and in PDF / Excel
const balAmt = (b) => inr(Math.abs(b));
const balWord = (b) => (Math.abs(b) < 0.005 ? "Settled" : b > 0 ? "Payable" : "Receivable");

// Current financial year (Apr–Mar) as yyyy-mm-dd bounds
const fyBounds = () => {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
};

function PartiesView({ onOpen }) {
  const [parties, setParties] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${BASE}/parties`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => (d.error ? setError(d.error) : setParties(d.parties || [])))
      .catch(() => setError("Couldn't load parties"));
  }, []);

  const q = search.trim().toLowerCase();
  const list = (parties || []).filter(p => !q || p.name.toLowerCase().includes(q));
  const totals = list.reduce((t, p) => ({ received: t.received + p.received, paid: t.paid + p.paid }), { received: 0, paid: 0 });

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-white border-b border-slate-200">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search party..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400 bg-white text-slate-700" />
        </div>
        {parties && <span className="text-[12px] text-slate-400 shrink-0">{list.length} parties</span>}
      </div>

      <div className="p-4 sm:p-6">
        {error ? <p className="text-sm text-red-600">{error}</p> : !parties ? (
          <div className="flex justify-center py-16"><BrandLoader /></div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Party</th>
                  <th className="text-right px-4 py-3 font-semibold">Entries</th>
                  <th className="text-right px-4 py-3 font-semibold">Received</th>
                  <th className="text-right px-4 py-3 font-semibold">Paid</th>
                  <th className="text-right px-4 py-3 font-semibold">Balance</th>
                  <th className="text-left px-4 py-3 font-semibold">Last entry</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-400">No parties yet — entries with a party name show up here.</td></tr>
                )}
                {list.map(p => (
                  <tr key={p.name} onClick={() => onOpen(p.name)} className="border-t border-slate-100 hover:bg-indigo-50/40 cursor-pointer">
                    <td className="px-4 py-3 font-semibold text-slate-800">{p.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">{p.entries}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{inr(p.received)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-700">{inr(p.paid)}</td>
                    <td className="px-4 py-3 text-right">
                      <p className={`tabular-nums font-bold ${balCls(p.balance)}`} title={balWord(p.balance)}>{balAmt(p.balance)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(p.lastDate)}</td>
                  </tr>
                ))}
              </tbody>
              {list.length > 0 && (
                <tfoot className="bg-slate-50 font-bold text-slate-700 border-t border-slate-200">
                  <tr>
                    <td className="px-4 py-3">Total</td>
                    <td />
                    <td className="px-4 py-3 text-right tabular-nums">{inr(totals.received)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(totals.paid)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${balCls(totals.received - totals.paid)}`}>{balAmt(totals.received - totals.paid)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </>
  );
}

const todayISO = () => new Date().toISOString().slice(0, 10);
// where the money went: "HDFC ••4521 → Union Bank ••9780", or "By Hand"
const flowText = (l) => {
  if (l.mode === "By Hand") return "By Hand";
  const from = l.type === "payment" ? l.ourAccount : l.theirAccount;
  const to = l.type === "payment" ? l.theirAccount : l.ourAccount;
  return from || to ? `${from || "—"} → ${to || "—"}` : l.mode;
};
/*
 * One account in a ledger line: "Ours · HDFC ••4521" as a small chip; a click
 * opens a card with everything about it (whose, bank, full number, IFSC,
 * holder, branch).
 */
const SIDE_CLS = { Ours: "text-[#10243b] bg-slate-100", Party: "text-indigo-700 bg-indigo-50", Personal: "text-violet-700 bg-violet-50" };
function AccChip({ info }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  // the card sits on the screen (fixed), so the table's scroll box can't clip it
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom > 220;
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 292)), top: below ? r.bottom + 4 : Math.max(8, r.top - 214) });
    }
    setOpen(o => !o);
  };
  useEffect(() => {
    if (!open) return;
    const shut = () => setOpen(false);
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    return () => { window.removeEventListener("scroll", shut, true); window.removeEventListener("resize", shut); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!info) return <span className="text-slate-300">—</span>;
  const short = `${info.bankName ? `${info.bankName} ` : ""}••${info.number.slice(-4)}`;
  return (
    <span ref={ref} className="relative inline-block">
      <button type="button" onClick={toggle} title="See this account"
        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors ${open ? "border-slate-400 bg-white text-slate-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800"}`}>
        <span className={`rounded px-1 text-[9px] font-bold uppercase ${SIDE_CLS[info.side] || SIDE_CLS.Ours}`}>{info.side === "Party" ? "Party" : info.side}</span>
        {short}
      </button>
      {open && (
        <span style={{ top: pos.top, left: pos.left }} className="fixed z-50 block w-[280px] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl">
          <span className="flex items-center gap-2">
            <Landmark size={14} className="text-slate-400 shrink-0" />
            <span className="flex-1 truncate text-[13px] font-semibold text-slate-800">{info.bankName || "Bank account"}</span>
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${SIDE_CLS[info.side] || SIDE_CLS.Ours}`}>{info.side}</span>
          </span>
          {info.whose && <span className="mt-1 block truncate text-[12px] text-slate-500">{info.whose}</span>}
          <span className="mt-2 block font-mono text-[14px] text-slate-900 select-all">{info.number}</span>
          <span className="mt-2 grid grid-cols-[70px_1fr] gap-y-1 text-[12px]">
            <span className="text-slate-400">IFSC</span><span className="text-slate-700">{info.ifsc || "—"}</span>
            <span className="text-slate-400">Holder</span><span className="text-slate-700 truncate">{info.holderName || "—"}</span>
            <span className="text-slate-400">Branch</span><span className="text-slate-700 truncate">{info.branch || "—"}</span>
          </span>
        </span>
      )}
    </span>
  );
}

const me = () => { try { return JSON.parse(localStorage.getItem("bms_user") || "{}").name || ""; } catch { return ""; } };

/*
 * Paid / Received for this party, in a side panel opened from the ledger's
 * header. Party is fixed; our company comes from the party's latest entry and
 * both accounts start on their primary, so usually only the amount is typed.
 * Our side also offers the Other / Personal accounts, or a one-off account.
 */
const selCls = "h-9 w-full appearance-none pl-2.5 pr-8 rounded-lg border border-slate-200 text-sm text-slate-700 outline-none focus:border-slate-400 bg-white cursor-pointer";
function Sel({ value, onChange, children, className = "", title }) {
  return (
    <div className={`relative ${className}`} title={title}>
      <select value={value} onChange={onChange} className={selCls}>{children}</select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
const primaryOf = (o) => (o?.accounts || []).find(a => a.isPrimary) || (o?.accounts || [])[0] || null;
const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

const Lb = ({ children }) => <label className="block mb-1.5 text-[12px] font-semibold text-slate-600">{children}</label>;

function EntryPanel({ party, last, initialType, onClose, onSaved, onFullForm }) {
  const [seed, setSeed] = useState({ companies: [], vendors: [] });
  const [cats, setCats] = useState([]);
  const [type, setType] = useState(initialType || "payment");
  const [date, setDate] = useState(todayISO);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("account");
  const [company, setCompany] = useState(last?.company || "");
  const [ourAcc, setOurAcc] = useState("");
  const [theirAcc, setTheirAcc] = useState("");
  const [category, setCategory] = useState("");
  const [narration, setNarration] = useState("");
  const [utr, setUtr] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [addingOther, setAddingOther] = useState(false);
  const [oneOff, setOneOff] = useState([]); // accounts typed in for this entry only, not saved

  const loadSeed = () => fetch(`${BASE}/seed-options`, { headers: authHeaders() }).then(r => r.json()).then(d => setSeed(d || {})).catch(() => {});
  useEffect(() => {
    loadSeed();
    fetch(`${BASE}/coded-values?field=category`, { headers: authHeaders() }).then(r => r.json()).then(d => setCats(d.values || [])).catch(() => {});
  }, []);

  const companyObj = (seed.companies || []).find(c => sameName(c.name, company));
  const partyObj = (seed.vendors || []).find(v => sameName(v.name, party));
  const ourList = companyObj?.accounts || [];
  const otherList = [...(seed.otherAccounts || []), ...oneOff];
  // other / personal accounts, one group per person
  const byPerson = new Map();
  otherList.forEach(a => {
    const k = (a.label || "Other").trim();
    byPerson.set(k, [...(byPerson.get(k) || []), a]);
  });
  const ourGroups = [
    ...(companyObj ? [{ title: companyObj.name, accounts: ourList }] : []),
    ...[...byPerson].map(([who, accounts]) => ({ title: who, accounts })),
  ];
  const theirList = partyObj?.accounts || [];
  // primary accounts once the lists arrive or the company changes
  useEffect(() => { setOurAcc(primaryOf(companyObj)?.accountNumber || ""); }, [companyObj?.name, ourList.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTheirAcc(primaryOf(partyObj)?.accountNumber || ""); }, [partyObj?.name, theirList.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!date) return setError("Date is required");
    if (!(Number(amount) > 0)) return setError("Enter an amount");
    setSaving(true); setError("");
    const ours = [...ourList, ...otherList].find(a => a.accountNumber === ourAcc);
    const theirs = theirList.find(a => a.accountNumber === theirAcc);
    const paid = type === "payment";
    try {
      const fd = new FormData();
      Object.entries({
        entryType: type, entryDate: date, partyName: party, amount, paymentMode: mode,
        category, narration, remarks: utr,
        companyName: company, siteName: last?.site || "", createdByName: me(),
        // Paid: from our account to theirs; Received: from theirs into ours
        accountNoFrom: paid ? ourAcc : theirAcc, ifscFrom: (paid ? ours : theirs)?.ifsc || "",
        accountNoTo: paid ? theirAcc : ourAcc, ifscTo: (paid ? theirs : ours)?.ifsc || "",
        accountHolderName: theirs?.holderName || "",
      }).forEach(([k, v]) => fd.append(k, v ?? ""));
      const res = await fetch(`${BASE}/entries`, { method: "POST", headers: authHeaders(), body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      if (data.entry?.id) logAudit("treasury_ledger_entry", data.entry.id, party, "created",
        { Type: paid ? "Paid" : "Received", Amount: amount });
      onSaved(`${paid ? "Paid" : "Received"} ${inr(amount)} saved`);
    } catch (e) { setError(e.message || "Save failed"); }
    setSaving(false);
  };

  const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } };
  const cell = "h-10 w-full px-3 rounded-lg border border-slate-200 text-sm text-slate-700 outline-none focus:border-slate-400 bg-white";
  const byAccount = mode !== "cash";
  const paid = type === "payment";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]">
      <div className="zy-panel-in h-full w-full max-w-[520px] bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{paid ? "Paid to" : "Received from"} {party}</h2>
            <p className="text-[12px] text-slate-500">Saved straight into this party's ledger</p>
          </div>
          <button onClick={onClose} title="Close" className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {[["payment", "Paid", "text-rose-700"], ["receipt", "Received", "text-emerald-700"]].map(([v, l, c]) => (
              <button key={v} type="button" onClick={() => setType(v)}
                className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all ${type === v ? `bg-white shadow-sm ${c}` : "text-slate-500 hover:text-slate-700"}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Lb>Date</Lb><input type="date" value={date} onChange={e => setDate(e.target.value)} className={cell} /></div>
            <div><Lb>Amount</Lb>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} onKeyDown={onKey} autoFocus
                  className={`${cell} pl-7 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} />
              </div>
            </div>
            <div><Lb>Our Company</Lb>
              <Sel value={company} onChange={e => setCompany(e.target.value)} title={company || "Our company"}>
                <option value="">None / Personal</option>
                {(seed.companies || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </Sel>
            </div>
            <div><Lb>Mode</Lb>
              <Sel value={mode} onChange={e => setMode(e.target.value)}>
                <option value="account">By Account</option>
                <option value="cash">By Hand</option>
              </Sel>
            </div>
          </div>

          {byAccount && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div>
                <AccountPicker label={paid ? "Our A/c (from)" : "Our A/c (into)"} groups={ourGroups} value={ourAcc} onChange={setOurAcc}
                  onAddOther={() => setAddingOther(true)} emptyText="No account in Masters" />
              </div>
              <div>
                <AccountPicker label={paid ? "Their A/c (to)" : "Their A/c (from)"} accounts={theirList} value={theirAcc} onChange={setTheirAcc} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><Lb>Category</Lb>
              <Sel value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">—</option>
                {cats.map(c => <option key={c.code} value={c.value}>{c.value}</option>)}
              </Sel>
            </div>
            <div><Lb>UTR / Cheque No.</Lb><input value={utr} onChange={e => setUtr(e.target.value)} onKeyDown={onKey} className={cell} /></div>
            <div className="col-span-2"><Lb>Narration</Lb><input value={narration} onChange={e => setNarration(e.target.value)} onKeyDown={onKey} className={cell} /></div>
          </div>
          {error && <p className="text-[13px] text-red-600">{error}</p>}
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50/60 shrink-0">
          <button type="button" onClick={() => onFullForm(type)} className="mr-auto text-[12px] font-semibold text-slate-500 hover:text-slate-800">
            Need an attachment? Full form
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={save} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 inline-flex items-center gap-1.5">
            {saving && <Loader2 size={13} className="animate-spin" />} Save
          </button>
        </div>
      </div>
      {addingOther && (
        <AccountModal other oneTime onClose={() => setAddingOther(false)}
          onSave={async (d) => {
            if (d.save) {
              await mastersApi("/accounts", { method: "POST", body: { ...d, ownerType: "other" } });
              await loadSeed();
            } else {
              setOneOff(list => [...list.filter(a => a.accountNumber !== d.accountNumber),
                { ...d, id: `one-off-${d.accountNumber}`, label: d.label || "One-off" }]);
            }
            setOurAcc(d.accountNumber.trim());
            setAddingOther(false);
          }} />
      )}
    </div>
  );
}

// onNew(entryType, lastLine): open the full entry form for this party
function LedgerView({ party, onBack, onNew, canAdd }) {
  const [range, setRange] = useState(fyBounds);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [showDl, setShowDl] = useState(false);
  const [tick, setTick] = useState(0);
  const [entry, setEntry] = useState(null); // "payment" | "receipt" while the entry panel is open
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!tick) setData(null);
    const qs = new URLSearchParams({ party, ...(range.from && { from: range.from }), ...(range.to && { to: range.to }) });
    fetch(`${BASE}/parties/ledger?${qs}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError("Couldn't load ledger"));
  }, [party, range.from, range.to, tick]);

  const rangeLabel = `${range.from ? fmtDate(range.from) : "Start"} to ${range.to ? fmtDate(range.to) : "Today"}`;
  const tableRows = useMemo(() => data ? [
    ["", "Opening balance", "", "", balText(data.opening)],
    ...data.lines.map(l => [fmtDate(l.date), [l.detail, flowText(l), l.company].filter(Boolean).join(" · "),
      l.received ? inr(l.received) : "", l.paid ? inr(l.paid) : "", balText(l.balance)]),
    ["", "Closing balance", inr(data.totals.received), inr(data.totals.paid), balText(data.closing)],
  ] : [], [data]);

  const exportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([[`${data.party} — Ledger`], [rangeLabel], [],
      ["Date", "Particulars", "Received", "Paid", "Balance"], ...tableRows]);
    ws["!cols"] = [{ wch: 14 }, { wch: 60 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, `${data.party} ledger.xlsx`);
    setShowDl(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(`${data.party} — Ledger`, 14, 16);
    doc.setFontSize(9); doc.setTextColor(100); doc.text(rangeLabel, 14, 22);
    autoTable(doc, {
      startY: 28, head: [["Date", "Particulars", "Received", "Paid", "Balance"]], body: tableRows,
      styles: { fontSize: 8 }, headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      didParseCell: (c) => { if (c.section === "body" && (c.row.index === 0 || c.row.index === tableRows.length - 1)) c.cell.styles.fontStyle = "bold"; },
    });
    doc.save(`${data.party} ledger.pdf`);
    setShowDl(false);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack} title="Back to parties"
            className="w-8 h-8 shrink-0 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50">
            <ArrowLeft size={16} />
          </button>
          <p className="text-[15px] font-bold text-slate-800 truncate">{party}</p>
          {canAdd && data && (
            <div className="flex items-center gap-1.5 ml-2">
              <button type="button" onClick={() => setEntry("payment")}
                className="h-8 px-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[12px] font-semibold hover:bg-rose-100 inline-flex items-center gap-1"><Plus size={13} /> Paid</button>
              <button type="button" onClick={() => setEntry("receipt")}
                className="h-8 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-[12px] font-semibold hover:bg-emerald-100 inline-flex items-center gap-1"><Plus size={13} /> Received</button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
            className="h-9 px-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 outline-none focus:border-indigo-400" />
          <span className="text-slate-400 text-sm">to</span>
          <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
            className="h-9 px-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 outline-none focus:border-indigo-400" />
          <button type="button" onClick={() => setRange({ from: "", to: "" })} className="h-9 px-3 text-[13px] font-semibold text-slate-500 hover:text-slate-800">All time</button>
          <div className="relative">
            <button type="button" disabled={!data} onClick={() => setShowDl(v => !v)} className={`${headerBtn} disabled:opacity-40`}>
              <Download size={14} /> Download <ChevronDown size={12} />
            </button>
            {showDl && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-lg shadow-xl border border-slate-100 py-1 w-40">
                <button onClick={exportPDF} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"><FileText size={14} className="text-red-500" /> PDF</button>
                <button onClick={exportExcel} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"><FileSpreadsheet size={14} className="text-green-600" /> Excel</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {error ? <p className="text-sm text-red-600">{error}</p> : !data ? (
          <div className="flex justify-center py-16"><BrandLoader /></div>
        ) : (
          <>
            {saved && <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">{saved}</p>}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              {[
                { label: "Opening", val: balAmt(data.opening), sub: balWord(data.opening), cls: balCls(data.opening), icon: Scale, accent: "#475569", tint: "#f1f5f9" },
                { label: "Received", val: inr(data.totals.received), cls: "text-emerald-700", icon: ArrowDownCircle, accent: "#059669", tint: "#ecfdf5" },
                { label: "Paid", val: inr(data.totals.paid), cls: "text-rose-700", icon: ArrowUpCircle, accent: "#e11d48", tint: "#fff1f2" },
                { label: "Closing", val: balAmt(data.closing), sub: balWord(data.closing), cls: balCls(data.closing), icon: Wallet, accent: "#2563eb", tint: "#eff6ff" },
              ].map(c => (
                <div key={c.label} className="relative overflow-hidden bg-white rounded-lg border border-slate-200/80 shadow-sm p-3 flex items-center gap-3 min-w-0">
                  <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: c.accent }} />
                  <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: c.tint, color: c.accent }}>
                    <c.icon size={16} strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">{c.label}</p>
                    <p className={`text-lg font-extrabold leading-tight tracking-tight truncate tabular-nums ${c.cls}`}>
                      {c.val}{c.sub && <span className="ml-1.5 text-[11px] font-semibold text-slate-400">{c.sub}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold w-32">Date</th>
                    <th className="text-left px-4 py-3 font-semibold">Particulars</th>
                    <th className="text-right px-4 py-3 font-semibold w-36">Received</th>
                    <th className="text-right px-4 py-3 font-semibold w-36">Paid</th>
                    <th className="text-right px-4 py-3 font-semibold w-40">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100 bg-slate-50/50 font-semibold text-slate-600">
                    <td className="px-4 py-2.5" /><td className="px-4 py-2.5">Opening balance</td><td /><td />
                    <td className={`px-4 py-2.5 text-right tabular-nums ${balCls(data.opening)}`}>{balAmt(data.opening)}</td>
                  </tr>
                  {data.lines.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-10 text-slate-400">No entries in this period</td></tr>
                  )}
                  {data.lines.map(l => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(l.date)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {l.category && <span className="shrink-0 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{l.category}</span>}
                          <span className="text-slate-700 truncate">{l.narration || (l.category ? "" : l.type === "receipt" ? "Received" : "Paid")}</span>
                        </div>
                        {/* where the money went — each account opens its details on click */}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-400">
                          {l.mode === "By Hand" ? <span>By Hand</span> : (l.ourAccountInfo || l.theirAccountInfo) ? <>
                            <AccChip info={l.type === "payment" ? l.ourAccountInfo : l.theirAccountInfo} />
                            <ArrowRight size={12} className="text-slate-300" />
                            <AccChip info={l.type === "payment" ? l.theirAccountInfo : l.ourAccountInfo} />
                          </> : <span>{l.mode}</span>}
                          {l.company && <span>· {l.company}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{l.received ? inr(l.received) : ""}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-rose-700">{l.paid ? inr(l.paid) : ""}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap ${balCls(l.balance)}`}>{balAmt(l.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold text-slate-700 border-t border-slate-200">
                  <tr>
                    <td className="px-4 py-3" /><td className="px-4 py-3">Closing balance</td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(data.totals.received)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(data.totals.paid)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${balCls(data.closing)}`}>{balAmt(data.closing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
      {entry && data && (
        <EntryPanel party={party} last={data.lines.at(-1)} initialType={entry} onClose={() => setEntry(null)}
          onFullForm={(type) => { setEntry(null); onNew(type, data.lines.at(-1)); }}
          onSaved={(msg) => { setEntry(null); setSaved(msg); setTick(t => t + 1); setTimeout(() => setSaved(""), 3000); }} />
      )}
    </>
  );
}

export default function PartyLedger() {
  const { canView, canAdd } = useModulePermissions("treasury_ledger");
  const [tab, setTab] = useState("entries");
  const [party, setParty] = useState(null);
  const [help, setHelp] = useState(false);
  // New Paid / Received entry started from a party's ledger
  const [newEntry, setNewEntry] = useState(null);
  const [ledgerKey, setLedgerKey] = useState(0);
  const [actions, setActions] = useState(null);
  const [entriesView, setEntriesView] = useState("list");

  if (!canView) {
    return (
      <div className="min-h-full flex items-center justify-center p-10">
        <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-sm">You don't have access to this area</p>
      </div>
    );
  }

  // The entry form brings its own header; hide ours while it's open
  const showHeader = !newEntry && !(tab === "entries" && entriesView === "form");

  const startEntry = (entryType, last) => setNewEntry({
    entryType, partyName: party,
    // same company / site as this party's latest entry, to save typing
    companyName: last?.company || "", siteName: last?.site || "",
  });

  return (
    <div className="h-full flex flex-col bg-[#f8fafc]">
      {showHeader && (
        <div className="shrink-0 bg-white border-b border-slate-200">
          <PageHeader icon={BookOpen} title="Party Ledger" secure
            tabs={[{ key: "entries", label: "Entries" }, { key: "parties", label: "Parties" }]}
            activeTab={tab} onTabChange={t => { setTab(t); setParty(null); }}
            actions={<><HelpButton onClick={() => setHelp(true)} />{tab === "entries" && actions}</>} />
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {newEntry ? (
          <LedgerEntries startNew={newEntry} onFormDone={() => { setNewEntry(null); setLedgerKey(k => k + 1); }} />
        ) : tab === "entries" ? (
          <LedgerEntries onHeaderActionsChange={setActions} onViewChange={setEntriesView}
            onOpenParty={name => { setTab("parties"); setParty(name); }} />
        ) : party ? (
          <LedgerView key={ledgerKey} party={party} onBack={() => setParty(null)} onNew={startEntry} canAdd={canAdd} />
        ) : (
          <PartiesView onOpen={setParty} />
        )}
      </div>
      {help && (
        <HelpPanel onClose={() => setHelp(false)}
          tab={tab === "entries" ? "ledgerEntries" : party ? "ledgerParty" : "ledgerParties"}
          tabLabel={tab === "entries" ? "Party Ledger · Entries" : party ? `Ledger · ${party}` : "Party Ledger · Parties"} />
      )}
    </div>
  );
}
