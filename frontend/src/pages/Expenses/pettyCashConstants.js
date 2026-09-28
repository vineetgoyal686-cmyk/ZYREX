// Same order as the category columns in Accounts' Excel sheet — keep in
// sync with CATEGORIES in backend/src/routes/pettyCash.js.
export const CATEGORIES = [
  "Credit Card", "Mobile + Data Recharge", "Accommodation", "Transport (Car hire, Taxi, Coach)",
  "Petrol Car/ Bike", "Tolls & Parking", "Kitchen & Grocery", "Meals", "Electric Item",
  "Repair & Maintance charges", "Housekeeping Charges", "Software", "Bank Charges", "Others",
];

export const ENTRY_TYPES = [
  { value: "expense",  label: "Expense" },
  { value: "received", label: "Received from Accounts" },
  { value: "transfer", label: "Given to Person" },
];

// Tax Invoice is the only proof that counts as "Tax" for Accounts — a local
// bill (parchi) and the company voucher are both Non Tax.
export const PROOF_TYPES = [
  { value: "tax_invoice", label: "Tax Invoice" },
  { value: "local_bill",  label: "Local Bill" },
  { value: "voucher",     label: "Voucher" },
];

export const PAYMENT_MODES = [
  { value: "cash",        label: "Cash" },
  { value: "online",      label: "Online" },
  { value: "credit_card", label: "Credit Card" },
];

export const labelOf = (list, value) => list.find(o => o.value === value)?.label || "";
export const taxLabel = (proofType) => (proofType === "tax_invoice" ? "Tax Invoice" : "Non Tax Invoice");

export const fmtAmount = (n) =>
  (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, "-");
};

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const apiError = (err, fallback) => err?.response?.data?.error || err?.message || fallback;

// Boxed table: a line between every column (rows already carry border-t).
export const GRID_TABLE = "w-full text-sm [&_tr>*]:border-r [&_tr>*]:border-slate-200 [&_tr>*:last-child]:border-r-0";
