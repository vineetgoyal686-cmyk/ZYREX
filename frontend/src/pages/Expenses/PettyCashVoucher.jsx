import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { X, Plus, Trash2, UploadCloud, Loader2, Printer, Download, ZoomIn, ZoomOut, Maximize2, ChevronDown } from "lucide-react";
import api from "../../utils/api";
import { fmtDate, apiError } from "./pettyCashConstants";
import BrandLoader from "../../components/BrandLoader";

// Expense Voucher — same layout as the company's expense_voucher.html
// (A5 landscape), drawn with jsPDF so it can be attached to the entry as a
// PDF and printed from there.
// Voucher header: the entity's name, and the project's address when it has
// one (the site where the money was spent), else the entity's address.
const voucherHeader = (company, project) => {
  const projectAddr = [project?.address, [project?.city, project?.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const companyAddr = [company?.address, [company?.state, company?.pincode].filter(Boolean).join("-")].filter(Boolean).join(", ");
  return { name: String(company?.name || "").toUpperCase(), address: projectAddr || companyAddr };
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
  await drawVoucher(doc, v, 0);
  return doc.output("blob");
}

// Several vouchers in one PDF. "a5" = one per A5 landscape page; "a4x2" =
// two on an A4 portrait page (each half is A5 landscape), with a cut line.
async function buildVouchersPdf(vouchers, layout) {
  const two = layout === "a4x2";
  const doc = two
    ? new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }) // 210 × 297
    : new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
  const perPage = two ? 2 : 1;
  for (let i = 0; i < vouchers.length; i++) {
    const slot = i % perPage;
    if (i && !slot) doc.addPage();
    await drawVoucher(doc, vouchers[i], slot * 148.5);
    if (two && slot) {
      doc.setLineDashPattern([2, 1.5], 0);
      doc.setLineWidth(0.2);
      doc.setDrawColor(150);
      doc.line(0, 148.5, 210, 148.5);
      doc.setDrawColor(0);
      doc.setLineDashPattern([], 0);
    }
  }
  return doc.output("blob");
}

// Blank voucher to fill by hand — `pages` pages of the chosen layout.
function buildBlankVoucherPdf(header, layout, pages = 1) {
  const blank = {
    header, voucherNo: "", date: "", paidTo: "", items: [], total: null, amountWords: "",
    paymentMode: "", refNo: "", signs: {},
  };
  return buildVouchersPdf(Array(pages * (layout === "a4x2" ? 2 : 1)).fill(blank), layout);
}

// Draws one voucher in a 210 × 148 box whose top edge is at `top` mm.
async function drawVoucher(doc, v, top) {
  const L = 7, T = top + 7, W = 196, H = 134, R = L + W;
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
  doc.text(v.header?.name || "", 105, T + 9, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.splitTextToSize(v.header?.address || "", W - 20).slice(0, 2)
    .forEach((line, i) => doc.text(line, 105, T + 13.5 + i * 3.4, { align: "center" }));

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
  // Tallest wrapped cell sets the row height (details or category).
  const rowH = (it) => Math.max(6, 2.4 + 3.6 * Math.max(1,
    doc.splitTextToSize(String(it.details || ""), cols[1].w - 3).length,
    doc.splitTextToSize(String(it.category || ""), cols[2].w - 3).length));
  // Empty rows fill the table to six plain rows' height (36 mm), so wrapped
  // lines don't push the footer into the signatures.
  const rows = [...v.items];
  let used = rows.reduce((s, it) => s + rowH(it), 0);
  while (used + 6 <= 36.01) { rows.push({ details: "", category: "", amount: "" }); used += 6; }
  rows.forEach((it, i) => {
    const h = rowH(it);
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
  if (v.total != null) doc.text(money(v.total), xs[4] - 1.5, y + 4.3, { align: "right" });
  y += 6.5;

  y += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("Only", inR, y, { align: "right" });
  field("Amount in Words: Rupees", v.amountWords, inL, inR - doc.getTextWidth("Only") - 2, y);

  y += 6.5;
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
      const maxW = x2 - x1 - 10, maxH = 11;
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
}

// ── Editor modal ─────────────────────────────────────────────────────────
const inp = "w-full h-9 border border-slate-300 rounded-lg px-2.5 text-sm outline-none bg-white text-slate-900 focus:border-slate-500";
const lbl = "block text-xs font-semibold text-slate-600 mb-1";

// `initial` (saved voucher details) opens an existing voucher for editing:
// it keeps its number, and Done returns a fresh PDF to replace the old one.
export default function VoucherModal({ entry, company, project, initial, onClose, onDone }) {
  const editing = !!initial;
  const [v, setV] = useState(() => initial ? {
    ...initial,
    header: initial.header || voucherHeader(company, project),
    signs: Object.fromEntries(SIGN_SLOTS.map(s => [s.key, { userId: "", name: "", image: "", ...(initial.signs?.[s.key] || {}) }])),
  } : ({
    // <prefix>/(<FY>)/VH-<n> comes from the server: the next number in the
    // project's / office's series for the entry date's FY. It's stored when
    // the entry is saved, so a voucher that's never saved uses none up.
    voucherNo: "", fy: "", seq: null,
    header: voucherHeader(company, project),
    date: entry.entryDate || "",
    paidTo: String(entry.vendorName || "").trim(), // the payee — starts as the entry's vendor, editable
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
    if (editing) {
      // Profile signatures aren't stored with the voucher — pull them again.
      SIGN_SLOTS.forEach(s => {
        const sign = initial.signs?.[s.key];
        if (sign?.userId && !sign.image) loadSignature(s.key, sign.userId, sign.name);
      });
      return;
    }
    if (!project?.id) return setError("Pick the project / office on the entry first — the voucher number depends on it");
    api.get("/api/petty-cash/voucher-no", { params: { company_id: company?.id, project_id: project.id, date: entry.entryDate } })
      .then(({ data }) => setV(p => ({ ...p, voucherNo: data.voucherNo, fy: data.fy, seq: data.seq })))
      .catch(err => setError(apiError(err, "Could not load voucher number")));
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

  async function loadSignature(slot, userId, name) {
    setSignLoading(slot);
    setError("");
    try {
      const { data } = await api.get(`/api/petty-cash/users/${userId}/signature`);
      if (data.signatureUrl) {
        const blob = await fetch(data.signatureUrl).then(r => r.blob());
        setSign(slot, { image: await blobToDataUrl(blob) });
      } else {
        setError(`${name || "This user"} has no signature in their profile — upload one instead.`);
      }
    } catch (err) { setError(apiError(err, "Could not load signature")); }
    setSignLoading("");
  }

  // Picking a login user fills the name and pulls their profile signature.
  const pickUser = async (slot, userId) => {
    const u = users.find(x => x.id === userId);
    setSign(slot, { userId, name: u?.name || "", image: "" });
    if (userId) await loadSignature(slot, userId, u?.name);
  };
  const uploadSign = async (slot, file) => {
    if (!file) return;
    setSign(slot, { image: await blobToDataUrl(file) });
  };

  const done = async () => {
    if (!v.paidTo.trim()) return setError("Paid To is required");
    if (!v.items.some(it => String(it.details).trim() && Number(it.amount) > 0)) return setError("Add at least one expense line with an amount");
    if (!v.voucherNo) return setError("The voucher number hasn't loaded yet");
    setBusy(true);
    try {
      const voucherNo = v.voucherNo;
      const blob = await buildVoucherPdf(voucherData);
      const safeNo = voucherNo.replace(/[^a-zA-Z0-9._-]/g, "_");
      // Saved with the entry so the voucher can be reopened. Profile
      // signatures are re-fetched on edit, so only uploaded images are kept.
      const details = {
        voucherNo, fy: v.fy, seq: v.seq, header: v.header, date: v.date, paidTo: v.paidTo, items: v.items, paymentMode: v.paymentMode, refNo: v.refNo,
        signs: Object.fromEntries(SIGN_SLOTS.map(s => {
          const sign = v.signs[s.key];
          return [s.key, { userId: sign.userId, name: sign.name, image: sign.userId ? "" : sign.image }];
        })),
      };
      onDone(new File([blob], `Voucher_${safeNo}.pdf`, { type: "application/pdf" }), total, details);
    } catch (err) { setError(apiError(err, "Could not create voucher")); setBusy(false); }
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
          <h2 className="text-base font-bold text-slate-900">{editing ? `Edit Voucher ${v.voucherNo}` : "Create Expense Voucher"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[420px_1fr]">
          {/* Form */}
          <div className="overflow-y-auto px-5 py-4 space-y-4 border-r border-slate-100">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Voucher No.</label><input value={v.voucherNo} readOnly placeholder="Loading…" title="Assigned automatically when the voucher is created" className={`${inp} bg-slate-50`} /></div>
              <div><label className={lbl}>Date</label><input type="date" value={v.date} onChange={setField("date")} className={inp} /></div>
            </div>
            <div><label className={lbl}>Paid To</label><input value={v.paidTo} onChange={setField("paidTo")} placeholder="Who received the money (shop / vendor)" className={inp} /></div>

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
              : <div className="flex-1 flex items-center justify-center text-slate-400"><BrandLoader /></div>}
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

// ── Print panels (blank vouchers / saved vouchers) ───────────────────────
const BLANK_LAYOUTS = [
  { key: "a5",   label: "1 / page", hint: "A5 landscape" },
  { key: "a4x2", label: "2 / page", hint: "A4, two halves with a cut line" },
];
const ZOOMS = [50, 75, 100, 125, 150, 200];

// Object URL for the latest PDF `build` returns (null = nothing to build);
// the previous URL is revoked.
function usePdfUrl(build, deps) {
  const [url, setUrl] = useState("");
  const ref = useRef("");
  useEffect(() => {
    const p = build();
    if (!p) return;
    let alive = true;
    p.then(blob => {
      if (!alive) return;
      const next = URL.createObjectURL(blob);
      if (ref.current) URL.revokeObjectURL(ref.current);
      ref.current = next;
      setUrl(next);
    });
    return () => { alive = false; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (ref.current) URL.revokeObjectURL(ref.current); }, []);
  return url;
}

// Right-side panel: one header row with every control, the PDF below it.
function PdfPanel({ title, subtitle, notes = [], layout, setLayout, extra, url, fileName, body, onClose }) {
  const [zoom, setZoom] = useState("fit");
  const zoomIdx = zoom === "fit" ? -1 : ZOOMS.indexOf(zoom);
  const zoomOut = () => setZoom(zoom === "fit" ? 75 : ZOOMS[Math.max(0, zoomIdx - 1)]);
  const zoomIn = () => setZoom(zoom === "fit" ? 100 : ZOOMS[Math.min(ZOOMS.length - 1, zoomIdx + 1)]);
  const download = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  };
  const print = () => {
    const w = window.open(url, "_blank");
    if (w) w.addEventListener("load", () => w.print());
  };
  const iconBtn = "h-8 w-8 flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:shadow-sm disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="fixed top-0 right-0 h-full w-full max-w-[900px] bg-white shadow-2xl flex flex-col">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-200 shrink-0">
          <div className="min-w-0 mr-auto">
            <h2 className="text-[15px] font-bold text-slate-900 leading-tight truncate">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 leading-tight">{subtitle}</p>}
          </div>
          {extra}
          <div className="flex p-0.5 rounded-lg bg-slate-100">
            {BLANK_LAYOUTS.map(l => (
              <button key={l.key} type="button" title={l.hint} onClick={() => setLayout(l.key)}
                className={`h-8 px-2.5 rounded-md text-xs font-semibold ${layout === l.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex items-center p-0.5 rounded-lg bg-slate-100">
            <button type="button" title="Zoom out" onClick={zoomOut} disabled={zoomIdx === 0} className={iconBtn}><ZoomOut size={15} /></button>
            <span className="w-11 text-center text-xs font-semibold text-slate-700 tabular-nums">{zoom === "fit" ? "Fit" : `${zoom}%`}</span>
            <button type="button" title="Zoom in" onClick={zoomIn} disabled={zoomIdx === ZOOMS.length - 1} className={iconBtn}><ZoomIn size={15} /></button>
            <button type="button" title="Fit whole page" onClick={() => setZoom("fit")} className={iconBtn}><Maximize2 size={14} /></button>
          </div>
          <button type="button" title="Download PDF" onClick={download} disabled={!url} className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            <Download size={16} />
          </button>
          <button type="button" onClick={print} disabled={!url} className="h-9 px-3.5 flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-40">
            <Printer size={15} /> Print
          </button>
          <button type="button" title="Close" onClick={onClose} className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {notes.length > 0 && (
          <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 shrink-0">{notes.join(" · ")}</div>
        )}
        <div className="flex-1 min-h-0 bg-slate-200 flex flex-col">
          {body || (url
            ? <iframe key={`${url}|${zoom}`} title={title} src={`${url}#toolbar=0&navpanes=0&${zoom === "fit" ? "view=Fit" : `zoom=${zoom}`}`} className="flex-1 w-full" />
            : <div className="flex-1 flex items-center justify-center text-slate-400"><BrandLoader /></div>)}
        </div>
      </div>
    </div>
  );
}

export function BlankVoucherModal({ company, project, onClose }) {
  const [layout, setLayout] = useState("a4x2");
  const [copies, setCopies] = useState(1);
  const header = useMemo(() => voucherHeader(company, project), [company, project]);
  const pages = Math.min(50, Math.max(1, Number(copies) || 1));
  const url = usePdfUrl(() => buildBlankVoucherPdf(header, layout, pages), [header, layout, pages]);
  const count = pages * (layout === "a4x2" ? 2 : 1);

  return (
    <PdfPanel
      title="Blank Voucher"
      subtitle={`${company?.name || ""} · ${count} voucher${count > 1 ? "s" : ""}`}
      layout={layout} setLayout={setLayout} url={url} onClose={onClose}
      fileName={`Blank_Voucher_${String(company?.name || "").replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`}
      extra={(
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          Pages
          <input type="number" min="1" max="50" value={copies} onChange={e => setCopies(e.target.value)}
            className="h-8 w-14 border border-slate-300 rounded-md px-2 text-sm text-slate-900 outline-none focus:border-slate-500" />
        </label>
      )}
    />
  );
}

// Saved voucher details → ready to draw: totals, amount in words, and the
// profile signatures (not stored with the voucher), fetched once per user.
async function printableVouchers(details) {
  const cache = {};
  const signature = (userId) => (cache[userId] ||= api.get(`/api/petty-cash/users/${userId}/signature`)
    .then(({ data }) => (data.signatureUrl ? fetch(data.signatureUrl).then(r => r.blob()).then(blobToDataUrl) : ""))
    .catch(() => ""));
  const list = [];
  for (const d of details) {
    const signs = {};
    for (const s of SIGN_SLOTS) {
      const sign = d.signs?.[s.key] || {};
      signs[s.key] = { ...sign, image: sign.image || (sign.userId ? await signature(sign.userId) : "") };
    }
    const total = (d.items || []).reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
    list.push({ ...d, items: d.items || [], signs, total, amountWords: amountInWords(total) });
  }
  return list;
}

// `entries` are the filtered entries that have a Create-Voucher voucher;
// `skipped` counts Voucher-type entries whose voucher was only uploaded.
export function PrintVouchersModal({ entries, skipped, onClose }) {
  const [layout, setLayout] = useState("a4x2");
  const [vouchers, setVouchers] = useState(null);
  const [missing, setMissing] = useState(0);
  const [error, setError] = useState("");

  // Load each entry's saved details, then the profile signatures (not stored
  // with the voucher) — fetched once per user.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sorted = [...entries].sort((a, b) => String(a.entryDate).localeCompare(String(b.entryDate)) || String(a.voucherNo).localeCompare(String(b.voucherNo)));
        const details = [];
        for (let i = 0; i < sorted.length; i += 6) {
          const batch = await Promise.all(sorted.slice(i, i + 6).map(e =>
            api.get(`/api/petty-cash/entries/${e.id}/voucher`).then(r => r.data.voucher).catch(() => null)));
          details.push(...batch);
        }
        const list = await printableVouchers(details.filter(Boolean));
        if (!alive) return;
        setMissing(details.length - list.length);
        setVouchers(list);
      } catch (err) { if (alive) setError(apiError(err, "Could not load vouchers")); }
    })();
    return () => { alive = false; };
  }, [entries]);

  const url = usePdfUrl(() => (vouchers?.length ? buildVouchersPdf(vouchers, layout) : null), [vouchers, layout]);

  const count = vouchers?.length || 0;
  const pages = Math.ceil(count / (layout === "a4x2" ? 2 : 1));
  const notes = [
    skipped ? `${skipped} Voucher entr${skipped > 1 ? "ies" : "y"} without a system-made voucher (uploaded only) left out` : "",
    missing ? `${missing} voucher${missing > 1 ? "s" : ""} had no saved details and were left out` : "",
  ].filter(Boolean);
  const message = error ? <span className="text-red-600">{error}</span>
    : vouchers && !count ? "No vouchers made with Create Voucher in the current filter." : "";

  return (
    <PdfPanel
      title="Print Vouchers"
      subtitle={vouchers ? `${count} voucher${count === 1 ? "" : "s"} · ${pages} page${pages === 1 ? "" : "s"}` : "Loading…"}
      notes={notes} layout={layout} setLayout={setLayout} url={count ? url : ""} fileName="Vouchers.pdf" onClose={onClose}
      body={message && <div className="flex-1 flex items-center justify-center text-sm text-slate-500">{message}</div>}
    />
  );
}

// ── Voucher numbering (format + month-wise renumber) ─────────────────────
const padNo = (series, fy, seq) => `${series.prefix}/(${fy})/VH-${String(seq).padStart(series.digits, "0")}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);

// Native select with its own chevron, spaced like the inputs.
const Select = ({ children, ...props }) => (
  <div className="relative">
    <select {...props} className={`${inp} appearance-none pr-9 disabled:bg-slate-50`}>{children}</select>
    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
  </div>
);

export function VoucherNumberingPanel({ company, projects, defaultProjectId, defaultMonth, canEdit, onChanged, onClose }) {
  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || "");
  const [series, setSeries] = useState(null);   // saved { prefix, digits, isDefault }
  const [form, setForm] = useState({ prefix: "", digits: 3 });
  const [next, setNext] = useState({ fy: "", no: "" });
  const [month, setMonth] = useState(defaultMonth || thisMonth());
  const [plan, setPlan] = useState(null);       // { fy, series, suggestedStart, vouchers }
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });

  const loadSeries = async () => {
    if (!projectId) return;
    try {
      const { data } = await api.get("/api/petty-cash/voucher-series", { params: { company_id: company.id, project_id: projectId } });
      setSeries(data.series);
      setForm({ prefix: data.series.prefix, digits: data.series.digits });
      setNext({ fy: data.fy, no: data.next });
    } catch (err) { setMsg({ type: "error", text: apiError(err, "Could not load the format") }); }
  };
  const loadPlan = async () => {
    if (!projectId || !month) return;
    setPlan(null);
    try {
      const { data } = await api.get("/api/petty-cash/voucher-renumber", { params: { company_id: company.id, project_id: projectId, month } });
      setPlan(data);
      setStart(String(data.suggestedStart));
    } catch (err) { setMsg({ type: "error", text: apiError(err, "Could not load the month's vouchers") }); }
  };
  useEffect(() => { setMsg({ type: "", text: "" }); loadSeries(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadPlan(); }, [projectId, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const formDirty = !!series && (form.prefix.trim().toUpperCase() !== series.prefix || Number(form.digits) !== series.digits);
  const previewSeries = { prefix: form.prefix.trim().toUpperCase() || "…", digits: Number(form.digits) || 3 };
  const nextSeq = Number(String(next.no).split("-").pop()) || 1;

  const saveFormat = async () => {
    setBusy("format");
    setMsg({ type: "", text: "" });
    try {
      await api.put("/api/petty-cash/voucher-series", { companyId: company.id, projectId, prefix: form.prefix, digits: Number(form.digits) });
      await Promise.all([loadSeries(), loadPlan()]);
      setMsg({ type: "ok", text: "Format saved. New vouchers use it; renumber a month to update its old vouchers." });
    } catch (err) { setMsg({ type: "error", text: apiError(err, "Could not save the format") }); }
    setBusy("");
  };

  const startNo = Number(start);
  const startOk = Number.isInteger(startNo) && startNo >= 1;
  const count = plan?.vouchers.length || 0;
  const renumber = async () => {
    if (!startOk || !count) return;
    if (!window.confirm(`Renumber ${count} voucher${count > 1 ? "s" : ""} of ${month} starting at ${padNo(plan.series, plan.fy, startNo)}?`)) return;
    setBusy("renumber");
    setMsg({ type: "", text: "" });
    try {
      const { data } = await api.post("/api/petty-cash/voucher-renumber", { companyId: company.id, projectId, month, start: startNo });
      // The attached PDFs still show the old numbers, so rebuild each one.
      const list = await printableVouchers(data.renumbered.map(r => r.voucher));
      let failed = 0;
      for (let i = 0; i < list.length; i++) {
        setBusy(`pdf ${i + 1}/${list.length}`);
        try {
          const fd = new FormData();
          fd.append("pdf", new File([await buildVoucherPdf(list[i])], "voucher.pdf", { type: "application/pdf" }));
          fd.append("oldNo", data.renumbered[i].oldNo);
          await api.post(`/api/petty-cash/entries/${data.renumbered[i].id}/voucher-pdf`, fd);
        } catch { failed++; }
      }
      await Promise.all([loadSeries(), loadPlan()]);
      onChanged?.();
      setMsg(failed
        ? { type: "error", text: `Renumbered, but ${failed} PDF${failed > 1 ? "s" : ""} could not be updated. Run Renumber again for this month.` }
        : { type: "ok", text: `${list.length} voucher${list.length > 1 ? "s" : ""} renumbered and their PDFs updated.` });
    } catch (err) { setMsg({ type: "error", text: apiError(err, "Could not renumber") }); }
    setBusy("");
  };

  const card = "rounded-xl border border-slate-200 p-4 space-y-3";
  return (
    <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="fixed top-0 right-0 h-full w-full max-w-[920px] bg-white shadow-2xl flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 shrink-0">
          <div className="min-w-0 mr-auto">
            <h2 className="text-[15px] font-bold text-slate-900 leading-tight">Voucher Numbering</h2>
            <p className="text-xs text-slate-500 leading-tight">{company?.name} · one series per project / office and financial year</p>
          </div>
          <button type="button" title="Close" onClick={onClose} className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className={lbl}>Project / office</label>
            <Select value={projectId} onChange={e => setProjectId(e.target.value)}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>

          {msg.text && (
            <p className={`text-sm font-medium rounded-lg px-3 py-2 ${msg.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{msg.text}</p>
          )}

          <div className={card}>
            <p className="text-sm font-bold text-slate-800">Format</p>
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <div>
                <label className={lbl}>Prefix</label>
                {/* Spaces become "-"; anything else not allowed in a voucher number is dropped. */}
                <input value={form.prefix} onChange={e => setForm(f => ({ ...f, prefix: e.target.value.toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9/-]/g, "") }))} disabled={!canEdit} maxLength={24} className={inp} />
                <p className="text-[11px] text-slate-400 mt-1">Letters, numbers, - and / only</p>
              </div>
              <div>
                <label className={lbl}>Digits</label>
                <Select value={form.digits} onChange={e => setForm(f => ({ ...f, digits: Number(e.target.value) }))} disabled={!canEdit}>
                  {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} ({"1".padStart(n, "0")})</option>)}
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                Next voucher{next.fy ? ` (FY ${next.fy}, from the entry date)` : ""}:{" "}
                <span className="font-semibold text-slate-900">{next.fy ? padNo(previewSeries, next.fy, nextSeq) : "…"}</span>
              </p>
              {canEdit && (
                <button onClick={saveFormat} disabled={!formDirty || !!busy} className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-40 flex items-center gap-1.5">
                  {busy === "format" && <Loader2 size={14} className="animate-spin" />} Save format
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">The FY comes from the entry date (April to March), and numbers start again at 1 each April. A new voucher takes the last number used + 1 when its entry is saved.</p>
          </div>

          <div className={card}>
            <p className="text-sm font-bold text-slate-800">Renumber a month</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Month</label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>Start from</label>
                <input type="number" min="1" value={start} onChange={e => setStart(e.target.value)} disabled={!canEdit} className={inp} />
              </div>
            </div>
            {plan && <p className="text-xs text-slate-500">Suggested start {plan.suggestedStart}: the last number used before this month in FY {plan.fy}, + 1.</p>}
            {formDirty && <p className="text-xs text-amber-600">Save the format first. Renumbering uses the saved one.</p>}

            {!plan ? <div className="py-6 flex justify-center text-slate-400"><BrandLoader /></div>
              : !count ? <p className="text-sm text-slate-500 py-2">No vouchers made with Create Voucher in this month.</p>
                : (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="max-h-[42vh] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500 sticky top-0">
                          <tr>
                            <th className="text-left font-semibold px-2.5 py-2">Date</th>
                            <th className="text-left font-semibold px-2.5 py-2">Paid To</th>
                            <th className="text-right font-semibold px-2.5 py-2">Amount</th>
                            <th className="text-left font-semibold px-2.5 py-2">Now</th>
                            <th className="text-left font-semibold px-2.5 py-2">New</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {plan.vouchers.map((r, i) => {
                            const newNo = startOk ? padNo(plan.series, plan.fy, startNo + i) : "";
                            return (
                              <tr key={r.id}>
                                <td className="px-2.5 py-1.5 whitespace-nowrap text-slate-700">{fmtDate(r.entryDate)}</td>
                                <td className="px-2.5 py-1.5 text-slate-700 truncate max-w-[200px]">{r.paidTo}</td>
                                <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{money(r.amount)}</td>
                                <td className="px-2.5 py-1.5 whitespace-nowrap text-slate-400">{r.voucherNo}</td>
                                <td className={`px-2.5 py-1.5 whitespace-nowrap font-semibold ${newNo === r.voucherNo ? "text-slate-500" : "text-emerald-700"}`}>{newNo}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

            {canEdit && count > 0 && (
              <div className="flex justify-end">
                <button onClick={renumber} disabled={!startOk || formDirty || !!busy} className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-40 flex items-center gap-1.5">
                  {busy === "renumber" || busy.startsWith("pdf")
                    ? <><Loader2 size={14} className="animate-spin" /> {busy === "renumber" ? "Renumbering…" : `Updating PDFs ${busy.slice(4)}`}</>
                    : `Renumber ${count} voucher${count > 1 ? "s" : ""}`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
