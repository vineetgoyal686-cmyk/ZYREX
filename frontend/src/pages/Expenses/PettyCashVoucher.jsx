import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { X, Plus, Trash2, UploadCloud, Loader2, Printer } from "lucide-react";
import api from "../../utils/api";
import { fmtDate, apiError } from "./pettyCashConstants";

// Expense Voucher — same layout as the company's expense_voucher.html
// (A5 landscape), drawn with jsPDF so it can be attached to the entry as a
// PDF and printed from there.
const COMPANY = {
  name: "BHARAT VOLT PRIVATE LIMITED",
  address: [
    "15th Floor, Gate No. 3, Unit No. F-1505/1504, Silver & Platinum Lobby, Wave One Building,",
    "L-2A, Pocket G, Sector 18, Noida, Uttar Pradesh-201301",
  ],
};

const MODES = [
  { key: "cash", label: "Cash" },
  { key: "upi",  label: "UPI" },
  { key: "bank", label: "Bank / Cheque" },
];
// Entry payment mode → voucher tick box. Credit card has no box on the
// voucher, so nothing is ticked for it.
const MODE_FROM_ENTRY = { cash: "cash", online: "upi" };

const SIGN_SLOTS = [
  { key: "prepared", label: "Prepared by" },
  { key: "checked",  label: "Checked by (Accountant)" },
  { key: "approved", label: "Approved by" },
];

// ── Amount in words (Indian numbering) ───────────────────────────────────
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);
const threeDigits = (n) => {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
};
const integerWords = (n) => {
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5);  n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${integerWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
};
const amountInWords =(amount) => {
  const total = Math.round((Number(amount) || 0) * 100);
  const rupees = Math.floor(total / 100), paise = total % 100;
  return paise ? `${integerWords(rupees)} and ${twoDigits(paise)} Paise` : integerWords(rupees);
};

const money = (n) => (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const imageSize = (dataUrl) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
  img.onerror = () => resolve({ w: 3, h: 1 });
  img.src = dataUrl;
});

// ── PDF ──────────────────────────────────────────────────────────────────
async function buildVoucherPdf(v) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" }); // 210 × 148
  const L = 7, T = 7, W = 196, H = 134, R = L + W;
  const inL = L + 7, inR = R - 7;

  const dotted = (x1, x2, y) => {
    doc.setLineDashPattern([0.4, 0.8], 0);
    doc.setLineWidth(0.3);
    doc.line(x1, y, x2, y);
    doc.setLineDashPattern([], 0);
  };
  // Bold label followed by a dotted value line; returns nothing.
  const field = (label, value, x, xEnd, y) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(label, x, y);
    const vx = x + doc.getTextWidth(label) + 2;
    dotted(vx, xEnd, y + 0.8);
    doc.setFont("helvetica", "normal");
    const text = doc.splitTextToSize(String(value || ""), xEnd - vx - 2)[0] || "";
    doc.text(text, vx + 1.5, y - 0.3);
  };

  doc.setLineWidth(0.5);
  doc.rect(L, T, W, H);

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(COMPANY.name, 105, T + 9, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  COMPANY.address.forEach((line, i) => doc.text(line, 105, T + 13.5 + i * 3.4, { align: "center" }));

  const titleY = T + 21.5;
  doc.setLineWidth(0.3);
  doc.line(inL, titleY, inR, titleY);
  doc.line(inL, titleY + 6, inR, titleY + 6);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("EXPENSE VOUCHER", 105, titleY + 4.2, { align: "center" });

  let y = titleY + 13;
  field("Voucher No.", v.voucherNo, inL, 118, y);
  field("Date", v.date ? fmtDate(v.date) : "", 124, inR, y);
  y += 7;
  field("Paid To", v.paidTo, inL, inR, y);

  // Items table
  y += 4;
  const cols = [
    { title: "S.No.", w: 12, align: "center" },
    { title: "Expense Details", w: inR - inL - 12 - 40 - 33 },
    { title: "Category", w: 40 },
    { title: "Amount (Rs.)", w: 33, align: "right" },
  ];
  const xs = cols.reduce((acc, c, i) => [...acc, acc[i] + c.w], [inL]);
  const cellText = (text, ci, top, h) => {
    const c = cols[ci];
    const lines = doc.splitTextToSize(String(text ?? ""), c.w - 3);
    const tx = c.align === "center" ? xs[ci] + c.w / 2 : c.align === "right" ? xs[ci + 1] - 1.5 : xs[ci] + 1.5;
    lines.forEach((ln, i) => doc.text(ln, tx, top + 4.3 + i * 3.6, { align: c.align || "left" }));
    return h;
  };
  const rowBox = (top, h, fill) => {
    if (fill) { doc.setFillColor(232, 232, 232); doc.rect(inL, top, inR - inL, h, "F"); }
    doc.setLineWidth(0.25);
    doc.rect(inL, top, inR - inL, h);
    xs.slice(1, -1).forEach(x => doc.line(x, top, x, top + h));
  };

  doc.setFontSize(8.5);
  rowBox(y, 6.5, true);
  doc.setFont("helvetica", "bold");
  cols.forEach((c, i) => cellText(c.title, i, y, 6.5));
  y += 6.5;

  doc.setFont("helvetica", "normal");
  const rows = [...v.items];
  while (rows.length < 6) rows.push({ details: "", category: "", amount: "" });
  rows.forEach((it, i) => {
    const lines = Math.max(1, doc.splitTextToSize(String(it.details || ""), cols[1].w - 3).length);
    const h = Math.max(6, 2.4 + lines * 3.6);
    rowBox(y, h);
    cellText(String(i + 1), 0, y, h);
    cellText(it.details, 1, y, h);
    cellText(it.category, 2, y, h);
    cellText(it.amount !== "" && it.amount != null ? money(it.amount) : "", 3, y, h);
    y += h;
  });

  // Total row
  doc.setLineWidth(0.25);
  doc.rect(inL, y, inR - inL, 6.5);
  doc.line(xs[3], y, xs[3], y + 6.5);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", xs[3] - 1.5, y + 4.3, { align: "right" });
  doc.text(money(v.total), xs[4] - 1.5, y + 4.3, { align: "right" });
  y += 6.5;

  y += 7;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("Only", inR, y, { align: "right" });
  field("Amount in Words: Rupees", v.amountWords, inL, inR - doc.getTextWidth("Only") - 2, y);

  y += 7;
  doc.setFont("helvetica", "bold");
  doc.text("Payment Mode:", inL, y);
  let bx = inL + doc.getTextWidth("Payment Mode:") + 3;
  doc.setFont("helvetica", "normal");
  MODES.forEach(m => {
    doc.setLineWidth(0.25);
    doc.rect(bx, y - 2.8, 3, 3, m.key === v.paymentMode ? "FD" : "D");
    doc.text(m.label, bx + 4.2, y);
    bx += 4.2 + doc.getTextWidth(m.label) + 5;
  });
  field("Ref No.", v.refNo, bx + 2, inR, y);

  // Signatures, pinned to the bottom of the box
  const lineY = T + H - 11;
  const slotW = (inR - inL) / 3;
  for (let i = 0; i < SIGN_SLOTS.length; i++) {
    const s = v.signs[SIGN_SLOTS[i].key] || {};
    const x1 = inL + i * slotW + 4, x2 = inL + (i + 1) * slotW - 4, cx = (x1 + x2) / 2;
    if (s.image) {
      const { w, h } = await imageSize(s.image);
      const maxW = x2 - x1 - 10, maxH = 12;
      const scale = Math.min(maxW / w, maxH / h);
      const iw = w * scale, ih = h * scale;
      try { doc.addImage(s.image, cx - iw / 2, lineY - ih - 0.8, iw, ih); } catch { /* unreadable image — leave blank */ }
    }
    doc.setLineWidth(0.3);
    doc.line(x1, lineY, x2, lineY);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text(SIGN_SLOTS[i].label, cx, lineY + 4, { align: "center" });
    if (s.name) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      doc.text(s.name, cx, lineY + 7.5, { align: "center" });
    }
  }

  return doc.output("blob");
}

// ── Editor modal ─────────────────────────────────────────────────────────
const inp = "w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm outline-none bg-white text-slate-900 focus:border-slate-500";
const lbl = "block text-xs font-semibold text-slate-600 mb-1";

const defaultVoucherNo = (date) => {
  const d = new Date();
  const stamp = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  return `PCV-${(date || "").replace(/-/g, "") || "NA"}-${stamp}`;
};

export default function VoucherModal({ entry, paidTo, onClose, onDone }) {
  const [v, setV] = useState(() => ({
    voucherNo: defaultVoucherNo(entry.entryDate),
    date: entry.entryDate || "",
    paidTo: paidTo || "",
    items: [{ details: entry.particular || "", category: entry.category || "", amount: entry.amount || "" }],
    paymentMode: MODE_FROM_ENTRY[entry.paymentMode] || "",
    refNo: "",
    signs: Object.fromEntries(SIGN_SLOTS.map(s => [s.key, { userId: "", name: "", image: "" }])),
  }));
  const [users, setUsers]       = useState([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy]         = useState(false);
  const [signLoading, setSignLoading] = useState("");
  const [error, setError]       = useState("");
  const previewRef = useRef("");

  useEffect(() => {
    api.get("/api/petty-cash/users").then(({ data }) => setUsers(data.users || [])).catch(() => {});
  }, []);

  const total = useMemo(() => v.items.reduce((s, it) => s + (Number(it.amount) || 0), 0), [v.items]);
  const voucherData = useMemo(() => ({ ...v, total, amountWords: amountInWords(total) }), [v, total]);

  // Live PDF preview, rebuilt shortly after each change.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const blob = await buildVoucherPdf(voucherData);
      if (!alive) return;
      const url = URL.createObjectURL(blob);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = url;
      setPreviewUrl(url);
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [voucherData]);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const setField = (key) => (e) => setV(p => ({ ...p, [key]: e.target.value }));
  const setItem = (i, key) => (e) => setV(p => ({ ...p, items: p.items.map((it, j) => (j === i ? { ...it, [key]: e.target.value } : it)) }));
  const addItem = () => setV(p => ({ ...p, items: [...p.items, { details: "", category: "", amount: "" }] }));
  const removeItem = (i) => setV(p => ({ ...p, items: p.items.filter((_, j) => j !== i) }));
  const setSign = (slot, patch) => setV(p => ({ ...p, signs: { ...p.signs, [slot]: { ...p.signs[slot], ...patch } } }));

  // Picking a login user fills the name and pulls their profile signature.
  const pickUser = async (slot, userId) => {
    const u = users.find(x => x.id === userId);
    setSign(slot, { userId, name: u?.name || "", image: "" });
    if (!userId) return;
    setSignLoading(slot);
    setError("");
    try {
      const { data } = await api.get(`/api/petty-cash/users/${userId}/signature`);
      if (data.signatureUrl) {
        const blob = await fetch(data.signatureUrl).then(r => r.blob());
        setSign(slot, { image: await blobToDataUrl(blob) });
      } else {
        setError(`${u?.name || "This user"} has no signature in their profile — upload one instead.`);
      }
    } catch (err) { setError(apiError(err, "Could not load signature")); }
    setSignLoading("");
  };
  const uploadSign = async (slot, file) => {
    if (!file) return;
    setSign(slot, { image: await blobToDataUrl(file) });
  };

  const done = async () => {
    if (!v.voucherNo.trim()) return setError("Voucher No. is required");
    if (!v.paidTo.trim()) return setError("Paid To is required");
    if (!v.items.some(it => String(it.details).trim() && Number(it.amount) > 0)) return setError("Add at least one expense line with an amount");
    setBusy(true);
    try {
      const blob = await buildVoucherPdf(voucherData);
      const safeNo = v.voucherNo.replace(/[^a-zA-Z0-9._-]/g, "_");
      onDone(new File([blob], `Voucher_${safeNo}.pdf`, { type: "application/pdf" }), total);
    } catch (err) { setError(err.message || "Could not create voucher"); setBusy(false); }
  };

  const printPreview = () => {
    const w = window.open(previewUrl, "_blank");
    if (w) w.addEventListener("load", () => w.print());
  };

  const entryAmount = Number(entry.amount) || 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-slate-900">Create Expense Voucher</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[420px_1fr]">
          {/* Form */}
          <div className="overflow-y-auto px-5 py-4 space-y-4 border-r border-slate-100">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Voucher No.</label><input value={v.voucherNo} onChange={setField("voucherNo")} className={inp} /></div>
              <div><label className={lbl}>Date</label><input type="date" value={v.date} onChange={setField("date")} className={inp} /></div>
            </div>
            <div><label className={lbl}>Paid To</label><input value={v.paidTo} onChange={setField("paidTo")} className={inp} /></div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-600">Expense Lines</label>
                <button type="button" onClick={addItem} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"><Plus size={12} /> Add line</button>
              </div>
              <div className="space-y-2">
                {v.items.map((it, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400 w-4">{i + 1}.</span>
                      <input value={it.details} onChange={setItem(i, "details")} placeholder="Expense details" className={inp} />
                      {v.items.length > 1 && (
                        <button type="button" onClick={() => removeItem(i)} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                      )}
                    </div>
                    <div className="flex gap-1.5 pl-5">
                      <input value={it.category} onChange={setItem(i, "category")} placeholder="Category" className={inp} />
                      <input type="number" min="0" step="0.01" value={it.amount} onChange={setItem(i, "amount")} placeholder="Amount" className={`${inp} w-32`} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-800">Total: ₹ {money(total)}</p>
              {entryAmount > 0 && Math.abs(total - entryAmount) > 0.005 && (
                <p className="text-xs text-amber-600 mt-0.5">Entry amount is ₹ {money(entryAmount)} — the voucher total doesn't match it.</p>
              )}
              <p className="text-xs text-slate-500 mt-0.5">Rupees {amountInWords(total)} Only</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Payment Mode</label>
                <select value={v.paymentMode} onChange={setField("paymentMode")} className={inp}>
                  <option value="">—</option>
                  {MODES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </div>
              <div><label className={lbl}>Ref No.</label><input value={v.refNo} onChange={setField("refNo")} className={inp} /></div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-600">Signatures</p>
              {SIGN_SLOTS.map(s => {
                const sign = v.signs[s.key];
                return (
                  <div key={s.key} className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                    <p className="text-[13px] font-semibold text-slate-700">{s.label}</p>
                    <select value={sign.userId} onChange={e => pickUser(s.key, e.target.value)} className={inp}>
                      <option value="">Pick a login user (uses profile signature)</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <input value={sign.name} onChange={e => setSign(s.key, { name: e.target.value })} placeholder="Or type a name" className={inp} />
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs font-medium text-blue-600 cursor-pointer hover:underline">
                        <UploadCloud size={13} /> Upload signature
                        <input type="file" accept="image/*" className="hidden" onChange={e => { uploadSign(s.key, e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                      {signLoading === s.key && <Loader2 size={13} className="animate-spin text-slate-400" />}
                      {sign.image && (
                        <>
                          <img src={sign.image} alt="" className="h-8 max-w-[120px] object-contain border border-slate-100 rounded" />
                          <button type="button" onClick={() => setSign(s.key, { image: "" })} className="p-1 text-slate-400 hover:text-red-600"><X size={13} /></button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-slate-100 min-h-[300px] flex flex-col">
            {previewUrl
              ? <iframe title="Voucher preview" src={`${previewUrl}#toolbar=0&view=FitH`} className="flex-1 w-full" />
              : <div className="flex-1 flex items-center justify-center text-slate-400"><Loader2 size={20} className="animate-spin" /></div>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-3.5 border-t border-slate-100 bg-slate-50 shrink-0">
          <button onClick={printPreview} disabled={!previewUrl} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            <Printer size={15} /> Print
          </button>
          {/* Shown here, next to Done, so a validation error is never hidden below the scrolled form. */}
          {error && <p className="flex-1 text-sm font-medium text-red-600 text-right">{error}</p>}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={done} disabled={busy} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-60 flex items-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />} Done — Add Voucher
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
