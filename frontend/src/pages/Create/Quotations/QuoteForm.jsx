import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Search, Upload, Trash2, FileText, Check, ChevronDown, Info } from "lucide-react";
import API from "../../../api";
import { lineCost, charges, inr } from "./calc";

/*
 * Add / edit one vendor's quotation for an intake. The vendor comes only
 * from the Vendor list (Procurement › Registration › Vendors). One row per
 * intake item: rate (before GST), discount %, GST %, make offered. An item
 * the vendor didn't quote is left blank. Sends multipart: data (JSON) + files.
 */
const LBL = "block text-[11px] font-semibold text-slate-500 mb-1";
const INP = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400";
const CELL = "w-full h-8 px-2 text-[13px] border border-slate-200 rounded-md bg-white text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400";

export default function QuoteForm({ intake, quote, takenVendorIds, onClose, onSaved }) {
  const items = intake.intake_items || [];
  const [vendors, setVendors] = useState(null);
  const [vendorId, setVendorId] = useState(quote?.vendorId || "");
  const [f, setF] = useState(() => ({
    quoteRef: quote?.quoteRef || "", quoteDate: quote?.quoteDate || new Date().toISOString().slice(0, 10), validTill: quote?.validTill || "",
    deliveryDays: quote?.deliveryDays ?? "", paymentTerms: quote?.paymentTerms || "", freight: quote?.freight || "", otherCharges: quote?.otherCharges || "",
    remarks: quote?.remarks || "",
  }));
  const [rows, setRows] = useState(() => Object.fromEntries(items.map(it => {
    const q = quote?.items.find(x => x.itemId === it.id);
    return [it.id, { rate: q?.rate || "", discountPct: q?.discountPct || "", gstPct: q ? q.gstPct : 18, make: q?.make || "" }];
  })));
  const [keep, setKeep] = useState(quote?.attachments || []);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pickFile = useRef(null);

  useEffect(() => {
    API.get("/api/quotations/vendors").then(({ data }) => setVendors(data.vendors || [])).catch(() => setVendors([]));
  }, []);

  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));
  const setRow = (id, k, v) => setRows(p => ({ ...p, [id]: { ...p[id], [k]: v } }));
  const totals = useMemo(() => {
    const itemsTotal = items.reduce((a, it) => a + (lineCost(Number(it.raised_qty) || 0, rows[it.id]) || 0), 0);
    return { itemsTotal, quoted: items.filter(it => Number(rows[it.id].rate) > 0).length, grand: itemsTotal + charges(f) };
  }, [rows, f, items]);

  const save = async () => {
    setError("");
    if (!vendorId) return setError("Pick the vendor");
    if (!totals.quoted) return setError("Enter the rate for at least one item");
    const data = {
      vendorId, ...f, keep: keep.map(a => a.path),
      items: items.map(it => ({ itemId: it.id, ...rows[it.id] })).filter(r => Number(r.rate) > 0),
    };
    const fd = new FormData();
    fd.append("data", JSON.stringify(data));
    files.forEach(file => fd.append("files", file));
    setSaving(true);
    try {
      if (quote) await API.put(`/api/quotations/${quote.id}`, fd);
      else await API.post(`/api/quotations/intake/${intake.id}`, fd);
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div>
            <p className="text-[15px] font-bold text-slate-800">{quote ? `Edit Quotation · ${quote.vendorName}` : "Add Quotation"}</p>
            <p className="text-[11px] text-slate-400">{intake.intake_number || "Intake"} · {intake.site_name}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className={LBL}>Vendor *</label>
              {quote ? (
                <p className="h-9 flex items-center px-3 rounded-lg bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700">{quote.vendorName}</p>
              ) : (
                <VendorPicker vendors={vendors} value={vendorId} onChange={setVendorId} taken={takenVendorIds} />
              )}
              {!quote && <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1"><Info size={10} /> Only vendors from the Vendor list. A new vendor must be registered first (Procurement › Registration › Vendors).</p>}
            </div>
            <div>
              <label className={LBL}>Vendor's Quotation No</label>
              <input value={f.quoteRef} onChange={set("quoteRef")} placeholder="Optional" className={INP} />
            </div>
            <div><label className={LBL}>Quotation Date</label><input type="date" value={f.quoteDate} onChange={set("quoteDate")} className={INP} /></div>
            <div><label className={LBL}>Valid Till</label><input type="date" value={f.validTill} onChange={set("validTill")} className={INP} /></div>
            <div><label className={LBL}>Delivery (days)</label><input type="number" min="0" value={f.deliveryDays} onChange={set("deliveryDays")} placeholder="e.g. 7" className={INP} /></div>
            <div className="sm:col-span-3"><label className={LBL}>Payment Terms</label><input value={f.paymentTerms} onChange={set("paymentTerms")} placeholder="e.g. 30 days credit / 50% advance" className={INP} /></div>
          </div>

          {/* items */}
          <div className="rounded-lg border border-slate-200 overflow-auto">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[820px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  {["Item", "Qty", "Rate (₹/unit, before GST)", "Disc %", "GST %", "Make offered", "Amount"].map((h, i) => (
                    <th key={h} className={`px-3 py-2 font-semibold bg-slate-50 border-b border-slate-200 ${i === 0 ? "" : "text-right"} ${i === 5 ? "!text-left" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const r = rows[it.id];
                  const amt = lineCost(Number(it.raised_qty) || 0, r);
                  return (
                    <tr key={it.id} className={Number(r.rate) > 0 ? "" : "bg-slate-50/50"}>
                      <td className="px-3 py-2 border-b border-slate-100 min-w-[200px]">
                        <p className="text-[13px] font-semibold text-slate-800">{it.product_name}</p>
                        <p className="text-[11px] text-slate-400">{[it.make, it.remarks].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-right text-[13px] tabular-nums whitespace-nowrap">{it.raised_qty} {it.unit}</td>
                      <td className="px-2 py-2 border-b border-slate-100 w-36"><input type="number" min="0" step="0.01" value={r.rate} onChange={e => setRow(it.id, "rate", e.target.value)} placeholder="Not quoted" className={CELL} /></td>
                      <td className="px-2 py-2 border-b border-slate-100 w-20"><input type="number" min="0" max="100" value={r.discountPct} onChange={e => setRow(it.id, "discountPct", e.target.value)} placeholder="0" className={CELL} /></td>
                      <td className="px-2 py-2 border-b border-slate-100 w-24">
                        <select value={r.gstPct} onChange={e => setRow(it.id, "gstPct", e.target.value)} className={`${CELL} text-left`}>
                          {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2 border-b border-slate-100 w-40"><input value={r.make} onChange={e => setRow(it.id, "make", e.target.value)} placeholder={it.make || "Brand"} className={`${CELL} text-left`} /></td>
                      <td className="px-3 py-2 border-b border-slate-100 text-right text-[13px] font-semibold tabular-nums whitespace-nowrap">{amt != null ? inr(amt) : <span className="text-slate-300">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={LBL}>Freight (₹, incl. GST)</label><input type="number" min="0" value={f.freight} onChange={set("freight")} placeholder="0 = included" className={INP} /></div>
            <div><label className={LBL}>Other Charges (₹, incl. GST)</label><input type="number" min="0" value={f.otherCharges} onChange={set("otherCharges")} placeholder="Loading, packing…" className={INP} /></div>
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Quotation Total</p>
              <p className="text-lg font-extrabold text-indigo-700 tabular-nums">{inr(totals.grand)}</p>
              <p className="text-[10px] text-indigo-500">{totals.quoted} of {items.length} items quoted · incl. GST</p>
            </div>
          </div>

          <div><label className={LBL}>Remarks</label><input value={f.remarks} onChange={set("remarks")} placeholder="Optional" className={INP} /></div>

          <div>
            <label className={LBL}>Vendor's quotation (PDF / photo)</label>
            <button type="button" onClick={() => pickFile.current?.click()}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100">
              <Upload size={13} /> Attach files
            </button>
            <input ref={pickFile} type="file" multiple accept="image/*,application/pdf" className="hidden"
              onChange={e => { const add = [...e.target.files]; e.target.value = ""; if (add.some(x => x.size > 15 * 1024 * 1024)) return setError("Each file up to 15 MB"); setFiles(p => [...p, ...add]); }} />
            {(keep.length > 0 || files.length > 0) && (
              <ul className="mt-2 space-y-1">
                {keep.map(a => <FileRow key={a.path} name={a.name} onRemove={() => setKeep(k => k.filter(x => x.path !== a.path))} />)}
                {files.map((x, i) => <FileRow key={`n${i}`} name={x.name} isNew onRemove={() => setFiles(l => l.filter((_, j) => j !== i))} />)}
              </ul>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50">
          {error && <p className="text-xs text-red-600 flex-1">{error}</p>}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 h-9 px-5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving && <Loader2 size={13} className="animate-spin" />} {quote ? "Save Changes" : "Save Quotation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileRow({ name, isNew, onRemove }) {
  return (
    <li className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[13px]">
      <FileText size={13} className="text-slate-400" /><span className="flex-1 truncate text-slate-700">{name}</span>
      {isNew && <span className="text-[10px] font-semibold px-1.5 rounded bg-blue-50 text-blue-600">New</span>}
      <button type="button" onClick={onRemove} className="p-1 rounded text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
    </li>
  );
}

/* searchable vendor list; vendors already quoted on this intake are shown but can't be picked */
function VendorPicker({ vendors, value, onChange, taken }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const cur = vendors?.find(v => v.id === value);
  const list = (vendors || []).filter(v => !q.trim() || `${v.name} ${v.code} ${v.gstin}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 80);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} disabled={!vendors}
        className={`${INP} flex items-center justify-between text-left ${open ? "ring-1 ring-blue-400" : ""}`}>
        <span className={cur ? "font-semibold text-slate-800 truncate" : "text-slate-400"}>{cur ? cur.name : vendors ? "Select vendor" : "Loading vendors…"}</span>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="relative p-2 border-b border-slate-100">
            <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, code, GSTIN…" className="w-full h-8 pl-7 pr-2 text-sm border border-slate-200 rounded-md focus:outline-none" />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {list.map(v => {
              const used = taken.includes(v.id);
              return (
                <button key={v.id} type="button" disabled={used} onClick={() => { onChange(v.id); setOpen(false); }}
                  className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-slate-800 truncate">{v.name}</span>
                    <span className="block text-[11px] text-slate-400 truncate">{used ? "Already has a quotation here" : [v.code, v.gstin, v.contact].filter(Boolean).join(" · ")}</span>
                  </span>
                  {value === v.id && <Check size={14} className="text-blue-600 mt-0.5" />}
                </button>
              );
            })}
            {!list.length && <p className="px-3 py-4 text-xs text-slate-400 text-center">No vendor found. Register it first under Procurement › Registration › Vendors.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
