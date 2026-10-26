import { useEffect, useRef, useState } from "react";
import { X, Landmark, ChevronDown, Check } from "lucide-react";

/*
 * Bits shared by Treasury › Masters and the Party Ledger entry form:
 * the masters API helper, how an account is shown, and the bank-account popup.
 */
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
export const MASTERS_BASE = `${API}/api/treasury/masters`;

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("bms_token") || ""}` });

// fetch → JSON, throwing the server's own message on failure
export async function mastersApi(path, { method = "GET", body } = {}) {
  const res = await fetch(`${MASTERS_BASE}${path}`, {
    method,
    headers: { ...authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

// "HDFC ••4521"
export const maskAcc = (a) => {
  const n = String(a?.accountNumber || "").trim();
  return [a?.bankName, n ? `••${n.slice(-4)}` : ""].filter(Boolean).join(" ") || n;
};

const box = "w-full h-11 border border-slate-300 rounded-lg px-3 text-[14px] outline-none bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-500";
const Lbl = ({ children }) => <label className="block text-[13px] font-semibold text-slate-800 mb-1.5">{children}</label>;

/* Add / edit one bank account. onSave(data) returns a promise; errors are shown here.
   other: an account of no company — asks whose it is.
   oneTime: offers "Save to Other Accounts" (unticked = use for this entry only; data.save). */
export function AccountModal({ ownerName, initial, onClose, onSave, other = false, oneTime = false, presetLabel = "" }) {
  const [f, setF] = useState({
    bankName: initial?.bankName || "", accountNumber: initial?.accountNumber || "", ifsc: initial?.ifsc || "",
    holderName: initial?.holderName || "", branch: initial?.branch || "", isPrimary: false,
    label: initial?.label || presetLabel, save: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF(p => ({ ...p, [k]: k === "isPrimary" || k === "save" ? e.target.checked : e.target.value }));

  const submit = async () => {
    if (!f.accountNumber.trim()) return setError("Account number is required");
    if (other && f.save && !f.label.trim()) return setError("Say whose account this is");
    setSaving(true); setError("");
    const { label, save, ...rest } = f;
    try { await onSave({ ...rest, ifsc: f.ifsc.trim().toUpperCase(), ...(other ? { label } : {}), ...(oneTime ? { save } : {}) }); }
    catch (e) { setError(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-800">{initial ? "Edit Bank Account" : other ? (oneTime ? "Use Another Account" : "Add Other Account") : "Add Bank Account"}</h2>
            {ownerName && <p className="text-xs text-slate-500 truncate">{ownerName}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-3.5 overflow-y-auto">
          {other && (
            <div><Lbl>Whose Account{f.save ? " *" : ""}</Lbl><input autoFocus={!presetLabel} value={f.label} onChange={set("label")} className={box} /></div>
          )}
          <div><Lbl>Account Number *</Lbl><input autoFocus={!other || !!presetLabel} value={f.accountNumber} onChange={set("accountNumber")} className={box} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Lbl>Bank Name</Lbl><input value={f.bankName} onChange={set("bankName")} className={box} /></div>
            <div><Lbl>IFSC</Lbl><input value={f.ifsc} onChange={set("ifsc")} className={`${box} uppercase placeholder:normal-case`} /></div>
          </div>
          <div><Lbl>Account Holder Name</Lbl><input value={f.holderName} onChange={set("holderName")} className={box} /></div>
          <div><Lbl>Branch</Lbl><input value={f.branch} onChange={set("branch")} className={box} /></div>
          {!initial && !other && (
            <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
              <input type="checkbox" checked={f.isPrimary} onChange={set("isPrimary")} className="w-4 h-4 accent-slate-900" />
              Make this the primary account
            </label>
          )}
          {oneTime && (
            <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
              <input type="checkbox" checked={f.save} onChange={set("save")} className="w-4 h-4 accent-slate-900" />
              Save to Other Accounts, to pick it next time
            </label>
          )}
          {error && <p className="text-[13px] text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50">
            {saving ? "Saving…" : initial ? "Save" : oneTime && !f.save ? "Use Account" : "Add Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

/*
 * Account picker shown as cards, like the accounts in Masters: the box shows
 * the chosen bank and last digits; the list shows each account in full
 * (bank, number, IFSC, holder, PRIMARY). value = account number.
 */
// groups: [{ title, accounts }] — or plain `accounts` for one list. onAddOther adds "+ Use another account".
export function AccountPicker({ label, accounts = [], groups, value, onChange, onAddOther, emptyText = "No account in Masters", className = "" }) {
  const lists = (groups || [{ title: "", accounts }]).filter(g => g.accounts.length);
  const all = lists.flatMap(g => g.accounts);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const sel = all.find(a => a.accountNumber === value);
  const name = (a) => `${a.bankName || "Account"} ••${String(a.accountNumber).slice(-4)}${a.label ? ` · ${a.label}` : ""}`;
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(o => !o)} title={sel ? `${sel.bankName || ""} ${sel.accountNumber}` : label}
        className={`h-9 w-full flex items-center gap-2 rounded-lg border bg-white pl-2.5 pr-2 text-left transition-colors ${open ? "border-slate-400" : "border-slate-200 hover:border-slate-300"}`}>
        <Landmark size={14} className={sel ? "text-[#10243b] shrink-0" : "text-slate-300 shrink-0"} />
        <span className="flex-1 min-w-0 leading-tight">
          <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
          <span className={`block truncate text-[13px] ${sel ? "font-semibold text-slate-800" : "text-slate-400"}`}>
            {sel ? name(sel) : all.length ? "Pick an account" : emptyText}
          </span>
        </span>
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {all.length === 0 && <p className="px-3 py-4 text-center text-[12px] text-slate-400">{emptyText}</p>}
          <div className="max-h-80 overflow-y-auto space-y-1">
            {lists.map(g => (
              <div key={g.title} className="space-y-1">
                {g.title && <p className="px-2 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">{g.title}</p>}
                {g.accounts.map(a => {
              const on = a.accountNumber === value;
              return (
                <button key={a.id || a.accountNumber} type="button" onClick={() => { onChange(a.accountNumber); setOpen(false); }}
                  className={`w-full rounded-lg border p-2.5 text-left transition-colors ${on ? "border-[#10243b]/40 bg-slate-50" : "border-transparent hover:bg-slate-50"}`}>
                  <span className="flex items-center gap-2">
                    <Landmark size={13} className="text-slate-400 shrink-0" />
                    <span className="flex-1 truncate text-[13px] font-semibold text-slate-800">{a.bankName || "Bank account"}</span>
                    {a.isPrimary && <span className="text-[9px] font-bold text-white bg-[#10243b] rounded px-1.5 py-0.5">PRIMARY</span>}
                    {on && <Check size={14} className="text-[#10243b] shrink-0" />}
                  </span>
                  <span className="mt-1 block font-mono text-[12px] text-slate-900">{a.accountNumber}</span>
                  <span className="block truncate text-[11px] text-slate-500">{[a.ifsc && `IFSC ${a.ifsc}`, a.holderName].filter(Boolean).join(" · ") || "—"}</span>
                </button>
              );
                })}
              </div>
            ))}
          </div>
          {onAddOther && (
            <button type="button" onClick={() => { setOpen(false); onAddOther(); }}
              className="mt-1 w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-[12px] font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800">+ Use another account</button>
          )}
          {value && (
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[12px] text-slate-500 hover:bg-slate-50">✕ Clear</button>
          )}
        </div>
      )}
    </div>
  );
}
