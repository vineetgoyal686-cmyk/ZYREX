import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, Edit2, Trash2, Paperclip, Truck, Wallet, CalendarClock, Trophy, Send, Save, Loader2,
  CheckCircle2, XCircle, Undo2, Clock, AlertTriangle, Users, Info,
} from "lucide-react";
import API from "../../../api";
import BrandLoader from "../../../components/BrandLoader";
import QuoteForm from "./QuoteForm";
import { compute, inr, fmtDay, fmtWhen, charges } from "./calc";

/*
 * Intake › Quotations & Comparison.
 * 1 · quotations from vendors (Vendor list only), 2 · comparison: a vendor
 * per item, lowest (L1) marked, reason needed when not L1, 3 · approval
 * through Settings › Approval Flow (module "comparison"), at least
 * N quotations (setting). Backend: routes/quotations.js.
 */
const STATUS = {
  draft:    { label: "Draft",            cls: "bg-slate-100 text-slate-600 border-slate-200" },
  pending:  { label: "Pending Approval", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Approved",         cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Rejected",         cls: "bg-red-50 text-red-700 border-red-200" },
};

export default function QuotationsTab({ intake, currentUser = {} }) {
  const items = intake.intake_items || [];
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);        // { quote? }
  const [picks, setPicks] = useState({});        // itemId → quotationId
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [comments, setComments] = useState("");
  const [toast, setToast] = useState(null);

  const flash = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), type === "error" ? 6000 : 3000); };
  const load = async () => {
    try {
      const { data } = await API.get(`/api/quotations/intake/${intake.id}`);
      setData(data); setError("");
      setPicks(Object.fromEntries((data.comparison?.selections || []).map(s => [s.itemId, s.quotationId])));
      setReason(data.comparison?.reason || ""); setNote(data.comparison?.note || ""); setDirty(false);
    } catch (err) { setError(err?.response?.data?.error || "Could not load quotations"); setData(d => d || { quotations: [] }); }
  };
  useEffect(() => { load(); }, [intake.id]);

  const quotations = data?.quotations || [];
  const cmp = data?.comparison;
  const status = cmp?.status || "draft";
  const editable = !!data?.canQuote && !["pending", "approved"].includes(status);
  const calc = useMemo(() => compute(items, quotations, picks), [items, quotations, picks]);
  const min = data?.minQuotations || 2;
  const enough = quotations.length >= min;
  const qName = (id) => quotations.find(q => q.id === id)?.vendorName || "";

  const pick = (itemId, qid) => { if (!editable) return; setPicks(p => ({ ...p, [itemId]: p[itemId] === qid ? undefined : qid })); setDirty(true); };
  const pickAllL1 = () => { setPicks(Object.fromEntries(calc.lines.filter(l => l.l1).map(l => [l.item.id, l.l1]))); setDirty(true); };
  const allTo = (qid) => { setPicks(p => ({ ...p, ...Object.fromEntries(calc.lines.filter(l => l.offers.some(o => o.id === qid)).map(l => [l.item.id, qid])) })); setDirty(true); };

  const saveDraft = async (quiet) => {
    await API.put(`/api/quotations/intake/${intake.id}/comparison`, {
      selections: Object.entries(picks).filter(([, q]) => q).map(([itemId, quotationId]) => ({ itemId, quotationId })), reason, note,
    });
    if (!quiet) flash("Comparison saved");
  };
  const run = async (key, fn) => { setBusy(key); try { await fn(); await load(); } catch (err) { flash(err?.response?.data?.error || err?.response?.data?.detail || "Something went wrong", "error"); } finally { setBusy(""); } };

  const send = () => run("send", async () => {
    if (!enough) throw { response: { data: { error: `At least ${min} quotations are needed` } } };
    if (calc.missing) throw { response: { data: { error: `Pick a vendor for every item — ${calc.missing} not picked` } } };
    if (!calc.allL1 && !reason.trim()) throw { response: { data: { error: "Write why some items don't go to the lowest (L1)" } } };
    await saveDraft(true);
    const { data: fresh } = await API.get(`/api/quotations/intake/${intake.id}`);
    await API.post("/api/approval-flows/submit", { module: "comparison", document_id: fresh.comparison.id });
    flash("Sent for approval");
  });
  const act = (action) => run(action, async () => {
    if (action !== "approved" && !comments.trim()) throw { response: { data: { error: "Write a comment for this" } } };
    await API.post("/api/approval-flows/action", { request_id: data.request.id, action, comments });
    setComments("");
    flash(action === "approved" ? "Approved" : action === "rejected" ? "Rejected" : "Sent back");
  });
  const withdraw = () => run("withdraw", async () => { await API.post(`/api/approval-flows/withdraw/${cmp.id}`); flash("Withdrawn — you can change it now"); });
  const removeQuote = (q) => { if (window.confirm(`Delete ${q.vendorName}'s quotation?`)) run("del", () => API.delete(`/api/quotations/${q.id}`)); };

  if (!data) return <BrandLoader compact />;

  const req = data.request;
  const th = "px-3 py-2.5 font-semibold bg-slate-50 border-b border-r border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 whitespace-nowrap";
  const td = "px-3 py-2 border-b border-r border-slate-200 text-[13px] text-slate-600";

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {/* stage */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Stage n={1} label="Quotations" done={enough} text={`${quotations.length} received · ${min} needed`} />
        <span className="h-px w-8 bg-slate-200 hidden sm:block" />
        <Stage n={2} label="Comparison" done={!calc.missing && quotations.length > 0} text={quotations.length ? (calc.missing ? `${calc.missing} item${calc.missing === 1 ? "" : "s"} to pick` : `All ${items.length} items picked`) : "—"} />
        <span className="h-px w-8 bg-slate-200 hidden sm:block" />
        <Stage n={3} label="Approval" done={status === "approved"} text={STATUS[status].label} />
        <span className={`ml-auto px-2.5 py-1 rounded-full border text-[11px] font-semibold ${STATUS[status].cls}`}>{STATUS[status].label}</span>
      </div>

      {!data.canQuote && (
        <p className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <Info size={15} /> Quotations can be added once this intake is approved.
        </p>
      )}

      {/* quotations */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Quotations <span className="text-indigo-600">{quotations.length}</span></p>
          {editable && (
            <button onClick={() => setForm({})} className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <Plus size={13} /> Add Quotation
            </button>
          )}
        </div>
        {!quotations.length ? (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-slate-600">No quotation yet</p>
            <p className="text-xs text-slate-400 mt-1">Add each vendor's quotation — at least {min} are needed for the comparison.</p>
          </div>
        ) : (
          <div className="p-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {quotations.map(q => {
              const won = calc.winners.includes(q.id);
              return (
                <div key={q.id} className={`rounded-lg border p-4 ${won ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{q.vendorName}</p>
                      <p className="text-[11px] text-slate-400">{[q.quoteRef && `Ref ${q.quoteRef}`, q.quoteDate && fmtDay(q.quoteDate)].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    {editable && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setForm({ quote: q })} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Edit"><Edit2 size={13} /></button>
                        <button onClick={() => removeQuote(q)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50" title="Delete"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-xl font-extrabold text-slate-800 tabular-nums">{inr(calc.vendorTotal[q.id])}</p>
                  <p className="text-[11px] text-slate-400">{q.items.length} of {items.length} items · incl. GST{charges(q) ? ` + ${inr(charges(q))} charges` : ""}</p>
                  <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    {q.deliveryDays !== "" && <span className="flex items-center gap-1"><Truck size={11} />{q.deliveryDays} days</span>}
                    {q.paymentTerms && <span className="flex items-center gap-1"><Wallet size={11} />{q.paymentTerms}</span>}
                    {q.validTill && <span className="flex items-center gap-1"><CalendarClock size={11} />till {fmtDay(q.validTill)}</span>}
                    {q.attachments.length > 0 && <span className="flex items-center gap-1"><Paperclip size={11} />{q.attachments.length}</span>}
                  </div>
                  {calc.lotL1 === q.id && quotations.length > 1 && <p className="mt-2 text-[10px] font-bold text-emerald-700 flex items-center gap-1"><Trophy size={11} /> Lowest for the whole lot</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* comparison */}
      {quotations.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Comparison</p>
              {editable && <p className="text-[11px] text-slate-400 mt-0.5">Click a rate to give that item to the vendor. <span className="text-emerald-700 font-semibold">L1</span> = lowest, incl. discount and GST.</p>}
            </div>
            {editable && (
              <div className="flex gap-2">
                <button onClick={pickAllL1} className="h-8 px-3 text-xs font-semibold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Pick all L1</button>
              </div>
            )}
          </div>
          <div className="overflow-auto">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={`${th} sticky left-0 z-10 min-w-[220px]`}>Item</th>
                  <th className={`${th} text-right`}>Qty</th>
                  {quotations.map(q => (
                    <th key={q.id} className={`${th} text-center min-w-[170px]`}>
                      <span className="block normal-case text-[12px] font-bold text-slate-700 tracking-normal truncate max-w-[200px] mx-auto">{q.vendorName}</span>
                      {editable && <button onClick={() => allTo(q.id)} className="mt-0.5 normal-case tracking-normal text-[10px] font-semibold text-blue-600 hover:underline">Give all to this vendor</button>}
                    </th>
                  ))}
                  <th className={`${th} border-r-0 text-right`}>Picked</th>
                </tr>
              </thead>
              <tbody>
                {calc.lines.map(l => (
                  <tr key={l.item.id}>
                    <td className={`${td} sticky left-0 bg-white z-[1]`}>
                      <p className="font-semibold text-slate-800">{l.item.product_name}</p>
                      <p className="text-[11px] text-slate-400">{[l.item.make, l.item.unit].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className={`${td} text-right tabular-nums whitespace-nowrap`}>{l.qty} {l.item.unit}</td>
                    {quotations.map(q => {
                      const qi = q.items.find(x => x.itemId === l.item.id);
                      const off = l.offers.find(o => o.id === q.id);
                      const isL1 = l.l1 === q.id && l.offers.length > 1;
                      const chosen = l.chosen === q.id;
                      return (
                        <td key={q.id} className={`${td} p-1.5 text-center`}>
                          {!off ? <span className="text-slate-300 text-xs">Not quoted</span> : (
                            <button type="button" onClick={() => pick(l.item.id, q.id)} disabled={!editable}
                              className={`w-full rounded-lg px-2 py-1.5 border-2 transition-all ${chosen ? "border-blue-500 bg-blue-50" : "border-transparent"} ${editable ? "hover:border-blue-300 cursor-pointer" : "cursor-default"}`}>
                              <span className="flex items-center justify-center gap-1.5">
                                <span className="font-bold text-slate-800 tabular-nums">{inr(off.cost)}</span>
                                {isL1 && <span className="text-[9px] font-black px-1 rounded bg-emerald-100 text-emerald-700">L1</span>}
                                {chosen && <CheckCircle2 size={13} className="text-blue-600" />}
                              </span>
                              <span className="block text-[10px] text-slate-400 tabular-nums">
                                {inr(qi.rate)}/{l.item.unit || "unit"}{qi.discountPct ? ` −${qi.discountPct}%` : ""} · GST {qi.gstPct}%{qi.make ? ` · ${qi.make}` : ""}
                              </span>
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className={`${td} border-r-0 text-right whitespace-nowrap`}>
                      {l.chosen ? <><p className="font-semibold text-slate-800 tabular-nums">{inr(l.chosenCost)}</p><p className="text-[10px] text-slate-400 truncate max-w-[140px]">{qName(l.chosen)}</p></>
                        : <span className="text-[11px] font-semibold text-amber-600">Not picked</span>}
                    </td>
                  </tr>
                ))}
                {/* terms */}
                {[
                  ["Freight + other charges", q => charges(q) ? inr(charges(q)) : "Included"],
                  ["Delivery", q => q.deliveryDays !== "" ? `${q.deliveryDays} days` : "—"],
                  ["Payment terms", q => q.paymentTerms || "—"],
                  ["Valid till", q => q.validTill ? fmtDay(q.validTill) : "—"],
                ].map(([label, get]) => (
                  <tr key={label} className="bg-slate-50/60">
                    <td className={`${td} sticky left-0 bg-slate-50 z-[1] text-[11px] font-semibold uppercase tracking-wide text-slate-500`} colSpan={2}>{label}</td>
                    {quotations.map(q => <td key={q.id} className={`${td} text-center text-xs`}>{get(q)}</td>)}
                    <td className={`${td} border-r-0`} />
                  </tr>
                ))}
                <tr className="bg-slate-50">
                  <td className={`${td} sticky left-0 bg-slate-50 z-[1] font-bold text-slate-700`} colSpan={2}>Whole lot from this vendor</td>
                  {quotations.map(q => (
                    <td key={q.id} className={`${td} text-center font-extrabold tabular-nums ${calc.lotL1 === q.id ? "text-emerald-700" : "text-slate-800"}`}>
                      {inr(calc.vendorTotal[q.id])}
                      {q.items.length < items.length && <span className="block text-[10px] font-normal text-slate-400">{q.items.length}/{items.length} items only</span>}
                    </td>
                  ))}
                  <td className={`${td} border-r-0 text-right`}>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Picked total</p>
                    <p className="text-base font-extrabold text-blue-700 tabular-nums">{inr(calc.total)}</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <span>Picked total: <b className="text-blue-700 tabular-nums">{inr(calc.total)}</b></span>
              <span className="text-slate-500">All-L1 total: <b className="tabular-nums">{inr(calc.l1Total)}</b></span>
              {calc.total > calc.l1Total && !calc.missing && <span className="text-amber-700 font-semibold">₹{Math.round(calc.total - calc.l1Total).toLocaleString("en-IN")} more than L1</span>}
              {calc.winners.length > 1 && <span className="flex items-center gap-1 text-slate-500"><Users size={13} /> Split between {calc.winners.length} vendors</span>}
            </div>
            {(!calc.allL1 || reason) && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Why not the lowest (L1)? {!calc.allL1 && "*"}</label>
                <textarea rows={2} value={reason} disabled={!editable} onChange={e => { setReason(e.target.value); setDirty(true); }}
                  placeholder="e.g. Vendor B delivers in 3 days, L1 needs 15 days"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50" />
              </div>
            )}
            {(editable || note) && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Note for the approver</label>
                <input value={note} disabled={!editable} onChange={e => { setNote(e.target.value); setDirty(true); }} placeholder="Optional"
                  className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50" />
              </div>
            )}
            {editable && (
              <div className="flex flex-wrap items-center gap-2">
                {!enough && <span className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={13} /> {min - quotations.length} more quotation{min - quotations.length === 1 ? "" : "s"} needed</span>}
                <div className="ml-auto flex gap-2">
                  <button onClick={() => run("save", () => saveDraft())} disabled={!!busy || !dirty}
                    className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                    {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                  </button>
                  <button onClick={send} disabled={!!busy}
                    className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                    {busy === "send" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send for Approval
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* approval */}
      {req && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Approval</p>
            <span className="text-xs text-slate-500">{req.flowName}{req.levels > 1 ? ` · level ${Math.min(req.level, req.levels)} of ${req.levels}` : ""}</span>
            {req.status === "pending" && req.waitingFor.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-700"><Clock size={12} /> Waiting for {req.waitingFor.join(", ")}</span>
            )}
          </div>
          {(cmp?.history || []).length > 0 && (
            <ol className="space-y-1.5">
              {cmp.history.map((h, i) => (
                <li key={i} className="text-[13px] text-slate-600">
                  <b className="text-slate-800">{h.action}</b> · {h.by || "—"} <span className="text-slate-400 text-[11px]">{fmtWhen(h.at)}</span>
                  {h.note && <span className="block text-[12px] text-slate-500 italic pl-3">“{h.note}”</span>}
                </li>
              ))}
            </ol>
          )}
          {req.canAct && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
              <input value={comments} onChange={e => setComments(e.target.value)} placeholder="Comment (needed to reject or send back)"
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
              <div className="flex flex-wrap gap-2">
                <button onClick={() => act("approved")} disabled={!!busy} className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy === "approved" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
                </button>
                <button onClick={() => act("reverted")} disabled={!!busy} className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  <Undo2 size={14} /> Send back
                </button>
                <button onClick={() => act("rejected")} disabled={!!busy} className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
                  <XCircle size={14} /> Reject
                </button>
              </div>
            </div>
          )}
          {req.status === "pending" && cmp?.submittedBy === currentUser.name && !req.canAct && (
            <button onClick={withdraw} disabled={!!busy} className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              <Undo2 size={13} /> Withdraw to change
            </button>
          )}
        </div>
      )}

      {/* awarded */}
      {status === "approved" && (
        <div className="bg-white rounded-xl border border-emerald-200 px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 mb-3">Final — order to</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {calc.winners.map(id => {
              const ls = calc.lines.filter(l => l.chosen === id);
              const q = quotations.find(x => x.id === id);
              return (
                <div key={id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-bold text-slate-800">{q?.vendorName}</p>
                  <p className="text-[11px] text-slate-400">{ls.map(l => l.item.product_name).join(", ")}</p>
                  <p className="mt-1 text-base font-extrabold text-slate-800 tabular-nums">{inr(ls.reduce((a, l) => a + l.chosenCost, 0) + charges(q))}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">Next: create the order for each vendor from here (coming next).</p>
        </div>
      )}

      {form && (
        <QuoteForm intake={intake} quote={form.quote} takenVendorIds={quotations.map(q => q.vendorId)}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); flash("Quotation saved"); }} />
      )}
      {toast && (
        <div className={`fixed top-5 right-5 z-[200] max-w-md px-4 py-3 rounded-lg text-sm font-medium shadow-lg border
          ${toast.type === "error" ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>{toast.msg}</div>
      )}
    </div>
  );
}

function Stage({ n, label, done, text }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
        {done ? <CheckCircle2 size={15} /> : n}
      </span>
      <span>
        <span className="block text-[13px] font-semibold text-slate-800">{label}</span>
        <span className="block text-[11px] text-slate-400">{text}</span>
      </span>
    </div>
  );
}
