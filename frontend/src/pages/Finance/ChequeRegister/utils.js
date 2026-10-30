// Cheque Register helpers — statuses, money in words, dates.

// soft = badge colours; final = nothing more happens to it
export const STATUS = {
  "Pending":     { soft: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500" },
  "Handed Over": { soft: "bg-blue-50 text-blue-700 border-blue-200",          dot: "bg-blue-500" },
  "Deposited":   { soft: "bg-violet-50 text-violet-700 border-violet-200",    dot: "bg-violet-500" },
  "Cleared":     { soft: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", final: true },
  "Bounced":     { soft: "bg-red-50 text-red-700 border-red-200",             dot: "bg-red-500", final: true },
  "Cancelled":   { soft: "bg-slate-100 text-slate-500 border-slate-200",      dot: "bg-slate-400", final: true },
  "Stopped":     { soft: "bg-orange-50 text-orange-700 border-orange-200",    dot: "bg-orange-500", final: true },
};
// what a cheque can move to next
export const NEXT = {
  issued:   ["Pending", "Handed Over", "Cleared", "Bounced", "Cancelled", "Stopped"],
  received: ["Pending", "Deposited", "Cleared", "Bounced", "Cancelled"],
};
export const isOpen = (c) => !STATUS[c.status]?.final;
export const TYPES = [["account_payee", "A/c Payee"], ["bearer", "Bearer"], ["self", "Self"]];
export const typeLabel = (t) => (TYPES.find(x => x[0] === t) || TYPES[0])[1];

export const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const fmtDay = (iso, opts = { day: "numeric", month: "short", year: "numeric" }) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", opts).replace(/,/g, "") : "—";
export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5);
// a cheque is good for 3 months from its date
export const isStale = (c, today) => isOpen(c) && c.chequeDate && daysBetween(c.chequeDate, today) > 90;
export const isPostDated = (c, today) => isOpen(c) && c.chequeDate > today;

// 125000.5 → "Rupees One Lakh Twenty Five Thousand and Fifty Paise Only"
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const two = (n) => n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
const three = (n) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : "", two(n % 100)].filter(Boolean).join(" ");
export const inWords = (amount) => {
  const v = Math.round((Number(amount) || 0) * 100);
  if (!v) return "";
  let r = Math.floor(v / 100);
  const p = v % 100;
  const parts = [];
  for (const [size, name] of [[1e7, "Crore"], [1e5, "Lakh"], [1e3, "Thousand"]]) {
    if (r >= size) { parts.push(`${r >= size * 100 && size === 1e7 ? inWords(Math.floor(r / size)).replace(/^Rupees |\sOnly$/g, "") : two(Math.floor(r / size))} ${name}`); r %= size; }
  }
  if (r) parts.push(three(r));
  const rupees = parts.join(" ");
  return `Rupees ${rupees || "Zero"}${p ? ` and ${two(p)} Paise` : ""} Only`;
};

export const fileSize = (b) => !b ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
export const MAX_FILES = 10, MAX_MB = 15;
