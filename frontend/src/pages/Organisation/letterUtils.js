/* Shared helpers for the HR letters (offer / appointment) in both formats. */

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const addDaysISO = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

/** "7th April 2026" */
export const fmtDateOrdinal = (iso) => {
  if (!iso) return "__________";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const day = d.getDate();
  const suf = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suf} ${d.toLocaleDateString("en-IN", { month: "long" })} ${d.getFullYear()}`;
};

/** Indian financial year for a date, e.g. "2025-2026" */
export const financialYear = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
};

export const fmtMoney = (n) => Math.round(Number(n) || 0).toLocaleString("en-IN");

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
  "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const twoDigits = (n) => n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
const threeDigits = (n) => {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
};

/** Indian numbering (crore / lakh / thousand): 240000 → "Two Lakh Forty Thousand" */
export function numberInWords(num) {
  let n = Math.round(Number(num) || 0);
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh  = Math.floor(n / 1e5); n %= 1e5;
  const thou  = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${crore >= 100 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh)  parts.push(`${twoDigits(lakh)} Lakh`);
  if (thou)  parts.push(`${twoDigits(thou)} Thousand`);
  if (n)     parts.push(threeDigits(n));
  return parts.join(" ");
}

/* Loads an image URL into a PNG data URL (via canvas) so jsPDF can embed any format. */
export function loadImageData(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        resolve({ data: c.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Opens the browser print dialog for a jsPDF document. */
export function printPdf(doc) {
  const url = doc.output("bloburl");
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.src = url;
  frame.onload = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch { window.open(url, "_blank"); }
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
  };
  document.body.appendChild(frame);
}
