import { useEffect, useRef, useState } from "react";
import { fmtDate } from "./pettyCashConstants";
import { PdfPanel, EntryChips } from "./PettyCashVoucher";

// Print Bills — every Bills attachment of the filtered expenses in one PDF,
// one bill per A4 page with a caption line (date · vendor · expense ·
// amount · voucher no.). Image bills are fitted to the page; each page of a
// PDF bill gets its own page. pdf-lib is loaded only when this panel opens.

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 24, CAPTION_H = 22;
const MAX_IMAGE_PX = 2000; // phone photos are scaled down to keep the PDF small

const money = (n) => (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// The standard PDF fonts can't draw ₹ or non-Latin text.
const latin = (t) => String(t || "").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
const isPdf = (url, type) => /pdf/i.test(type) || /\.pdf$/i.test(String(url).split("?")[0]);

// Any browser-readable image → JPEG bytes, upright (EXIF) and at most MAX_IMAGE_PX.
async function imageToJpeg(blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_IMAGE_PX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const out = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.85));
  return new Uint8Array(await out.arrayBuffer());
}

async function buildBillsPdf(entries, onProgress) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const boxW = A4.w - MARGIN * 2, boxH = A4.h - MARGIN * 2 - CAPTION_H;
  const failed = [];
  const total = entries.reduce((n, e) => n + e.documents.bill.length, 0);
  let done = 0;

  const newPage = (caption) => {
    const page = doc.addPage([A4.w, A4.h]);
    const y = A4.h - MARGIN - 11;
    const lead = `${caption.lead}   `;
    const room = boxW - bold.widthOfTextAtSize(lead, 9);
    let text = caption.rest;
    if (font.widthOfTextAtSize(text, 9) > room) {
      while (text && font.widthOfTextAtSize(`${text}...`, 9) > room) text = text.slice(0, -1);
      text += "...";
    }
    page.drawText(lead, { x: MARGIN, y, size: 9, font: bold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(text, { x: MARGIN + bold.widthOfTextAtSize(lead, 9), y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: A4.w - MARGIN, y: y - 6 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    return page;
  };
  // Scales (w, h) to fit the area under the caption, centred.
  const fit = (w, h) => {
    const s = Math.min(boxW / w, boxH / h);
    return { width: w * s, height: h * s, x: MARGIN + (boxW - w * s) / 2, y: MARGIN + (boxH - h * s) / 2 };
  };

  for (const e of entries) {
    const bills = e.documents.bill;
    for (let i = 0; i < bills.length; i++) {
      onProgress?.(++done, total);
      const caption = {
        lead: fmtDate(e.entryDate),
        rest: [e.vendorName, e.particular, `Rs. ${money(e.amount)}`, e.voucherNo, bills.length > 1 ? `Bill ${i + 1} of ${bills.length}` : ""]
          .map(latin).filter(Boolean).join("  -  "),
      };
      try {
        const res = await fetch(bills[i]);
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        if (isPdf(bills[i], blob.type)) {
          const src = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
          let drawn = 0;
          for (const idx of src.getPageIndices()) {
            // A page with no content can't be embedded (it would break saving
            // the whole file) — skip just that page.
            if (!src.getPage(idx).node.Contents()) continue;
            const [p] = await doc.embedPdf(src, [idx]);
            newPage(caption).drawPage(p, fit(p.width, p.height));
            drawn++;
          }
          if (!drawn) throw new Error("empty PDF");
        } else {
          const img = await doc.embedJpg(await imageToJpeg(blob));
          newPage(caption).drawImage(img, fit(img.width, img.height));
        }
      } catch { failed.push(e); }
    }
  }
  return { blob: doc.getPageCount() ? new Blob([await doc.save()], { type: "application/pdf" }) : null, failed, pages: doc.getPageCount() };
}

// `entries`: filtered expenses with at least one bill. `missing`: Tax
// Invoice / Local Bill expenses with no bill attached.
export function PrintBillsPanel({ entries, missing = [], onOpenEntry, onClose }) {
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null); // { failed, pages }
  const ref = useRef("");

  useEffect(() => {
    let alive = true;
    const sorted = [...entries].sort((a, b) => String(a.entryDate).localeCompare(String(b.entryDate)) || String(a.voucherNo).localeCompare(String(b.voucherNo)));
    buildBillsPdf(sorted, (done, total) => alive && setProgress({ done, total })).then(({ blob, failed, pages }) => {
      if (!alive) return;
      if (blob) {
        ref.current = URL.createObjectURL(blob);
        setUrl(ref.current);
      }
      setResult({ failed: [...new Map(failed.map(e => [e.id, e])).values()], pages });
    });
    return () => { alive = false; };
  }, [entries]);
  useEffect(() => () => { if (ref.current) URL.revokeObjectURL(ref.current); }, []);

  const billCount = entries.reduce((n, e) => n + e.documents.bill.length, 0);
  const notes = [
    missing.length > 0 && (
      <>
        <p className="font-medium">{missing.length} Tax Invoice / Local Bill entr{missing.length > 1 ? "ies have" : "y has"} no bill attached:</p>
        <EntryChips entries={missing} onOpen={onOpenEntry} />
      </>
    ),
    result?.failed.length > 0 && (
      <>
        <p className="font-medium">{result.failed.length} bill{result.failed.length > 1 ? "s" : ""} couldn't be read (not an image or PDF, or the file is damaged). Open to check:</p>
        <EntryChips entries={result.failed} onOpen={onOpenEntry} />
      </>
    ),
  ].filter(Boolean);
  const subtitle = !result
    ? `Loading bills ${progress.done}/${progress.total || billCount}…`
    : `${billCount} bill${billCount === 1 ? "" : "s"} from ${entries.length} entr${entries.length === 1 ? "y" : "ies"} · ${result.pages} page${result.pages === 1 ? "" : "s"}`;
  const body = !entries.length
    ? <div className="flex-1 flex items-center justify-center text-sm text-slate-500">No bills attached in the current filter.</div>
    : result && !url ? <div className="flex-1 flex items-center justify-center text-sm text-slate-500">None of the bills could be read.</div> : null;

  return (
    <PdfPanel title="Print Bills" subtitle={subtitle} notes={notes} url={url} fileName="Bills.pdf" body={body} onClose={onClose} />
  );
}
