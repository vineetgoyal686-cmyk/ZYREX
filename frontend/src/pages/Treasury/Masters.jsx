import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Database, Search, Plus, Pencil, Download, X, ChevronDown, ChevronRight, Star, Power, Landmark, Check,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { headerBtn, headerBtnSecure } from "../../components/headerStyles";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { mastersApi, maskAcc, AccountModal } from "./mastersShared";
import { HelpButton, HelpPanel } from "./mastersHelp";

/*
 * Treasury › Masters — Treasury's own lists, kept apart from the ERP:
 *   Parties (the firms we pay / who pay us, with an opening balance),
 *   Our Companies, Projects — parties and companies each hold any number of
 *   bank accounts, one primary — and Categories.
 * "Import from ERP" copies vendors / companies / projects in; after that the
 * two are independent. Nothing is ever deleted: records and accounts are made
 * inactive, so old entries keep showing what was used.
 */
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("bms_token") || ""}` });

const TABS = [
  { key: "parties", label: "Parties", one: "Party" },
  { key: "companies", label: "Our Companies", one: "Company" },
  { key: "projects", label: "Projects", one: "Project" },
  { key: "otherAccounts", label: "Other Accounts", one: "Person" },
  { key: "categories", label: "Categories", one: "Category" },
];

const inr = (v) => (Number(v) || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
// opening balance uses the ledger's sign: + Payable (we pay them), − Receivable (they pay us)
const balText = (v) => (!v ? "—" : `${inr(Math.abs(v))} ${v > 0 ? "Payable" : "Receivable"}`);

const box = "w-full h-11 border border-slate-300 rounded-lg px-3 text-[14px] outline-none bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-500";
const Lbl = ({ children }) => <label className="block text-[13px] font-semibold text-slate-800 mb-1.5">{children}</label>;
const iconBtn = "w-8 h-8 shrink-0 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 hover:border-slate-300 hover:bg-slate-50 transition-colors";
const th = "text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap";

// Forms open as a wide panel from the right, so the list stays in view
function Modal({ title, sub, onClose, footer, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]">
      <div className="zy-panel-in h-full w-full max-w-[640px] bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between gap-4 px-7 py-5 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {sub && <p className="mt-0.5 text-[13px] text-slate-500 leading-snug">{sub}</p>}
          </div>
          <button onClick={onClose} title="Close" className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 px-7 py-6 space-y-5 overflow-y-auto">{children}</div>
        <div className="flex items-center justify-end gap-2 px-7 py-4 border-t border-slate-200 bg-slate-50/60 shrink-0">{footer}</div>
      </div>
    </div>
  );
}

const up = `${box} uppercase placeholder:normal-case`;

/* Add / edit a party, company or project. Also opened from the Party Ledger
   form's "Add New"; onSaved(message, savedItem).
   Parties and companies get two tabs — Info and Bank Details. Only what's
   needed day to day is asked; older extra fields (email, city, state, notes)
   are kept as they are on save. */
export function RecordModal({ kind, initial, onClose, onSaved, onAccountsChanged, notify, canAdd, canEdit }) {
  const isParty = kind === "parties";
  const hasBank = kind === "parties" || kind === "companies";
  const [tab, setTab] = useState("info");
  const [f, setF] = useState(() => ({
    name: initial?.name || "", contactPerson: initial?.contactPerson || "", mobile: initial?.mobile || "",
    email: initial?.email || "", pan: initial?.pan || "", gstin: initial?.gstin || "", address: initial?.address || "",
    notes: initial?.notes || "", code: initial?.code || "", city: initial?.city || "", state: initial?.state || "",
    openingAmount: initial?.openingBalance ? String(Math.abs(initial.openingBalance)) : "",
    openingSide: (initial?.openingBalance || 0) < 0 ? "dr" : "cr",
  }));
  // bank accounts typed while adding — any number; one is primary
  const blankAcc = () => ({ accountNumber: "", bankName: "", ifsc: "", holderName: "" });
  const [accs, setAccs] = useState([blankAcc()]);
  const [primaryAt, setPrimaryAt] = useState(0);
  const setAcc = (i, k) => (e) => setAccs(list => list.map((a, j) => (j === i ? { ...a, [k]: e.target.value } : a)));
  const removeAcc = (i) => {
    setAccs(list => list.filter((_, j) => j !== i));
    setPrimaryAt(p => (p === i ? 0 : p > i ? p - 1 : p));
  };
  const filledAccs = accs.filter(a => a.accountNumber.trim()).length;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));
  const one = TABS.find(t => t.key === kind).one;
  const nameLabel = isParty ? "Firm Name" : `${one} Name`;

  const save = async () => {
    if (!f.name.trim()) { setTab("info"); return setError(`${nameLabel} is required`); }
    if (isParty && f.mobile && f.mobile.length !== 10) { setTab("info"); return setError("Mobile number must be 10 digits"); }
    setSaving(true); setError("");
    const amt = Number(f.openingAmount) || 0;
    const body = {
      ...f, openingBalance: f.openingSide === "dr" ? -amt : amt,
      // bank accounts, when adding
      accounts: initial ? undefined : accs
        .map((a, i) => ({ ...a, holderName: a.holderName || f.name, isPrimary: i === primaryAt }))
        .filter(a => a.accountNumber.trim()),
    };
    try {
      const res = await mastersApi(initial ? `/${kind}/${initial.id}` : `/${kind}`, { method: initial ? "PUT" : "POST", body });
      onSaved(initial ? `${one} updated` : `${one} "${res.item?.name || f.name.trim()}" added`, res.item);
    } catch (e) { setError(e.message); setSaving(false); }
  };

  const accounts = initial?.accounts || [];
  const activeAccs = accounts.filter(a => a.isActive).length;
  const footer = <>
    {initial && tab === "bank" && <span className="mr-auto text-[12px] text-slate-500">Bank changes are saved right away</span>}
    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">{initial && tab === "bank" ? "Close" : "Cancel"}</button>
    {!(initial && tab === "bank") && (
      <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50">
        {saving ? "Saving…" : initial ? "Save" : `Add ${one}`}
      </button>
    )}
  </>;

  return (
    <Modal title={initial ? `Edit ${one}` : `Add ${one}`}
      sub={initial && initial.name !== f.name ? "Renaming also updates the name on its entries" : initial?.name || ""}
      onClose={onClose} footer={footer}>
      {hasBank && (
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {[{ k: "info", l: "Info" }, { k: "bank", l: "Bank Details", n: initial ? activeAccs : filledAccs }].map(t => (
            <button key={t.k} type="button" onClick={() => setTab(t.k)}
              className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === t.k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {t.l}
              {t.n > 0 && <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${tab === t.k ? "bg-slate-900 text-white" : "bg-slate-300 text-slate-700"}`}>{t.n}</span>}
            </button>
          ))}
        </div>
      )}

      {tab === "info" && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <div className="col-span-2"><Lbl>{nameLabel} *</Lbl>
            <input autoFocus value={f.name} onChange={set("name")} className={box} />
          </div>
          {isParty && <>
            <div><Lbl>Contact Person</Lbl><input value={f.contactPerson} onChange={set("contactPerson")} className={box} /></div>
            <div><Lbl>Mobile</Lbl>
              {/* digits only, 10 of them */}
              <input type="tel" inputMode="numeric" maxLength={10} value={f.mobile}
                onChange={e => setF(p => ({ ...p, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                className={`${box} tabular-nums tracking-wide`} />
            </div>
            <div><Lbl>PAN</Lbl><input value={f.pan} onChange={set("pan")} className={up} /></div>
          </>}
          {!isParty && <div className={kind === "companies" ? "col-span-2" : ""}><Lbl>Code</Lbl><input value={f.code} onChange={set("code")} className={box} /></div>}
          {kind === "companies" && <div><Lbl>PAN</Lbl><input value={f.pan} onChange={set("pan")} className={up} /></div>}
          {kind !== "projects"
            ? <div><Lbl>GSTIN</Lbl><input value={f.gstin} onChange={set("gstin")} className={up} /></div>
            : <div><Lbl>City</Lbl><input value={f.city} onChange={set("city")} className={box} /></div>}
          {kind === "projects" && <div className="col-span-2"><Lbl>State</Lbl><input value={f.state} onChange={set("state")} className={box} /></div>}
          <div className="col-span-2"><Lbl>Address</Lbl><input value={f.address} onChange={set("address")} className={box} /></div>
          {isParty && (
            <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <Lbl>Opening Balance</Lbl>
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">₹</span>
                  {/* no spinner arrows on the amount */}
                  <input type="number" min="0" value={f.openingAmount} onChange={set("openingAmount")}
                    className={`${box} pl-7 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} />
                </div>
                {/* own chevron, with room, instead of the browser's arrow stuck to the edge */}
                <div className="relative">
                  <select value={f.openingSide} onChange={set("openingSide")} className={`${box} appearance-none pr-10 cursor-pointer`}>
                    <option value="cr">Payable — we have to pay</option>
                    <option value="dr">Receivable — we have to receive</option>
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Balance before the first entry — the party's ledger starts from this.</p>
            </div>
          )}
        </div>
      )}

      {tab === "bank" && !initial && (
        <div className="space-y-3">
          {accs.map((a, i) => (
            <div key={i} className={`rounded-xl border p-4 ${primaryAt === i ? "border-[#10243b]/40 bg-slate-50 ring-1 ring-[#10243b]/10" : "border-slate-200"}`}>
              <div className="mb-3 flex items-center gap-2">
                <Landmark size={14} className="text-slate-400" />
                <span className="flex-1 text-[13px] font-semibold text-slate-800">Account {i + 1}</span>
                {primaryAt === i
                  ? <span className="text-[10px] font-bold text-white bg-[#10243b] rounded px-1.5 py-0.5">PRIMARY</span>
                  : <button type="button" onClick={() => setPrimaryAt(i)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-[#10243b]"><Star size={12} /> Make primary</button>}
                {accs.length > 1 && (
                  <button type="button" title="Remove" onClick={() => removeAcc(i)} className="p-1 text-slate-400 hover:text-red-600"><X size={15} /></button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div><Lbl>Account Number</Lbl><input value={a.accountNumber} onChange={setAcc(i, "accountNumber")} className={box} /></div>
                <div><Lbl>Bank Name</Lbl><input value={a.bankName} onChange={setAcc(i, "bankName")} className={box} /></div>
                <div><Lbl>IFSC</Lbl><input value={a.ifsc} onChange={setAcc(i, "ifsc")} className={up} /></div>
                <div><Lbl>Account Holder</Lbl><input value={a.holderName} onChange={setAcc(i, "holderName")} className={box} /></div>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setAccs(list => [...list, blankAcc()])}
            className="w-full h-11 rounded-xl border-2 border-dashed border-slate-300 text-[13px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700 flex items-center justify-center gap-1.5">
            <Plus size={15} /> Add another account
          </button>
          <p className="text-[12px] text-slate-500">Optional. Blank accounts are skipped. The primary one fills in first on a payment.</p>
        </div>
      )}
      {tab === "bank" && initial && (
        <AccountsPanel bare owner={initial} ownerType={isParty ? "party" : "company"} canAdd={canAdd} canEdit={canEdit}
          onChanged={onAccountsChanged} notify={notify} />
      )}

      {error && <p className="text-[13px] text-red-600">{error}</p>}
    </Modal>
  );
}

/* A new person in Other Accounts with as many accounts as they have, in one go */
function PersonModal({ onClose, onSaved }) {
  const blank = () => ({ accountNumber: "", bankName: "", ifsc: "", holderName: "", branch: "" });
  const [label, setLabel] = useState("");
  const [accs, setAccs] = useState([blank()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const setAcc = (i, k) => (e) => setAccs(list => list.map((a, j) => (j === i ? { ...a, [k]: e.target.value } : a)));

  const save = async () => {
    const filled = accs.filter(a => a.accountNumber.trim());
    if (!label.trim()) return setError("Say whose account this is");
    if (!filled.length) return setError("Add at least one account number");
    setSaving(true); setError("");
    const failed = [];
    for (const a of filled) {
      try {
        await mastersApi("/accounts", { method: "POST", body: { ...a, ifsc: a.ifsc.trim().toUpperCase(), holderName: a.holderName || label, label, ownerType: "other" } });
      } catch (e) { failed.push(`${a.accountNumber}: ${e.message}`); }
    }
    if (failed.length === filled.length) { setError(failed.join(" · ")); setSaving(false); return; }
    onSaved(failed.length
      ? `${filled.length - failed.length} added — not added: ${failed.join(" · ")}`
      : `${label.trim()} added with ${filled.length} account${filled.length > 1 ? "s" : ""}`);
  };

  return (
    <Modal title="Add Person" sub="An account holder outside our companies — a director, a partner, an imprest account" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
        <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50">
          {saving ? "Saving…" : "Add Person"}
        </button>
      </>}>
      <div><Lbl>Whose Account *</Lbl><input autoFocus value={label} onChange={e => setLabel(e.target.value)} className={box} /></div>
      <div className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Bank Accounts</p>
        {accs.map((a, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Landmark size={14} className="text-slate-400" />
              <span className="flex-1 text-[13px] font-semibold text-slate-800">Account {i + 1}</span>
              {accs.length > 1 && (
                <button type="button" title="Remove" onClick={() => setAccs(list => list.filter((_, j) => j !== i))} className="p-1 text-slate-400 hover:text-red-600"><X size={15} /></button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div><Lbl>Account Number *</Lbl><input value={a.accountNumber} onChange={setAcc(i, "accountNumber")} className={box} /></div>
              <div><Lbl>Bank Name</Lbl><input value={a.bankName} onChange={setAcc(i, "bankName")} className={box} /></div>
              <div><Lbl>IFSC</Lbl><input value={a.ifsc} onChange={setAcc(i, "ifsc")} className={up} /></div>
              <div><Lbl>Account Holder</Lbl><input value={a.holderName} onChange={setAcc(i, "holderName")} className={box} /></div>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setAccs(list => [...list, blank()])}
          className="w-full h-11 rounded-xl border-2 border-dashed border-slate-300 text-[13px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700 flex items-center justify-center gap-1.5">
          <Plus size={15} /> Add another account
        </button>
      </div>
      {error && <p className="text-[13px] text-red-600">{error}</p>}
    </Modal>
  );
}

/* Pick ERP records to copy into a Treasury list */
function ImportModal({ kind, onClose, onDone }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const tab = TABS.find(t => t.key === kind);
  const src = { parties: "Vendor Master", companies: "Companies", projects: "Projects" }[kind];

  useEffect(() => { mastersApi(`/erp/${kind}`).then(d => setItems(d.items)).catch(e => setError(e.message)); }, [kind]);
  const shown = (items || []).filter(i => !q.trim() || `${i.name} ${i.sub}`.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const run = async () => {
    setSaving(true); setError("");
    try {
      const r = await mastersApi(`/import/${kind}`, { method: "POST", body: { erpIds: [...picked] } });
      onDone(`${r.added} ${r.added === 1 ? tab.one.toLowerCase() : tab.label.toLowerCase()} imported${r.skipped ? `, ${r.skipped} already there` : ""}`);
    } catch (e) { setError(e.message); setSaving(false); }
  };

  return (
    <Modal title={`Import ${tab.label} from ERP`} sub={`Copied from ${src}. Bank details come along; after this the two are separate.`} onClose={onClose}
      footer={<>
        <span className="mr-auto text-[12px] text-slate-500">{picked.size} selected</span>
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
        <button onClick={run} disabled={!picked.size || saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50">
          {saving ? "Importing…" : "Import"}
        </button>
      </>}>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3">
        <Search size={15} className="text-slate-400" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${src.toLowerCase()}…`} className="h-10 flex-1 text-sm outline-none" />
      </div>
      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {!items ? <p className="py-8 text-center text-sm text-slate-400">Loading…</p> : (
        <div className="max-h-[50vh] overflow-y-auto -mx-2">
          {shown.map(i => (
            <label key={i.erpId} className={`flex items-center gap-3 px-2 py-2 rounded-lg ${i.alreadyAdded ? "opacity-50" : "cursor-pointer hover:bg-slate-50"}`}>
              <input type="checkbox" disabled={i.alreadyAdded} checked={picked.has(i.erpId)} onChange={() => toggle(i.erpId)} className="w-4 h-4 accent-slate-900" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold text-slate-800 truncate">{i.name}</span>
                {i.sub && <span className="block text-[11px] text-slate-500 truncate">{i.sub}</span>}
              </span>
              {i.alreadyAdded ? <span className="text-[11px] text-slate-500">Already added</span>
                : i.hasAccount && <span className="text-[11px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">Bank details</span>}
            </label>
          ))}
          {shown.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Nothing found</p>}
        </div>
      )}
    </Modal>
  );
}

/* Category add / rename — also opened from the Party Ledger form; onSaved(message, { value }) */
export function CategoryModal({ initial, onClose, onSaved }) {
  const [value, setValue] = useState(initial?.value || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!value.trim()) return setError("Category is required");
    setSaving(true); setError("");
    try {
      if (initial) await mastersApi(`/categories/${initial.code}`, { method: "PUT", body: { value } });
      else {
        const res = await fetch(`${API}/api/treasury/ledger/coded-values`, {
          method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ field: "category", value }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to add");
      }
      onSaved(initial ? "Category renamed" : `Category "${value.trim()}" added`, { value: value.trim() });
    } catch (e) { setError(e.message); setSaving(false); }
  };
  return (
    <Modal title={initial ? `Rename CAT-${initial.code}` : "Add Category"} sub={initial ? "Also renamed on its entries" : ""} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
        <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50">
          {saving ? "Saving…" : initial ? "Save" : "Add Category"}
        </button>
      </>}>
      <div><Lbl>Category *</Lbl><input autoFocus value={value} onChange={e => setValue(e.target.value)} className={box} /></div>
      {error && <p className="text-[13px] text-red-600">{error}</p>}
    </Modal>
  );
}

/* A party's / company's bank accounts, shown under its row */
// bare: no grey strip — used inside the edit panel
function AccountsPanel({ owner, ownerType, canAdd, canEdit, onChanged, notify, bare = false }) {
  const [modal, setModal] = useState(null); // { initial? }
  const run = async (fn, msg) => { try { await fn(); onChanged(); notify(msg); } catch (e) { notify(e.message, "error"); } };
  const list = owner.accounts || [];
  return (
    <div className={bare ? "" : "px-4 py-3 bg-slate-50/70"}>
      <div className={bare ? "grid grid-cols-2 gap-3" : "flex flex-wrap gap-2.5"}>
        {list.map(a => (
          <div key={a.id} className={`${bare ? "" : "w-[270px] "}rounded-lg border bg-white p-3 ${a.isActive ? "border-slate-200" : "border-dashed border-slate-300 opacity-60"}`}>
            <div className="flex items-center gap-2">
              <Landmark size={14} className="text-slate-400" />
              <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-slate-800">{a.bankName || "Bank account"}</span>
              {a.isPrimary && <span className="text-[10px] font-bold text-white bg-[#10243b] rounded px-1.5 py-0.5">PRIMARY</span>}
              {!a.isActive && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">INACTIVE</span>}
            </div>
            <p className="mt-1.5 font-mono text-[13px] text-slate-900">{a.accountNumber}</p>
            <p className="text-[11px] text-slate-500 truncate">{[a.ifsc && `IFSC ${a.ifsc}`, a.holderName, a.branch].filter(Boolean).join(" · ") || "—"}</p>
            {canEdit && (
              <div className="mt-2 flex items-center gap-1.5">
                {a.isActive && !a.isPrimary && (
                  <button onClick={() => run(() => mastersApi(`/accounts/${a.id}/primary`, { method: "PATCH" }), "Primary account changed")}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-[#10243b]"><Star size={12} /> Make primary</button>
                )}
                <span className="flex-1" />
                <button title="Edit" onClick={() => setModal({ initial: a })} className="p-1 text-slate-400 hover:text-slate-700"><Pencil size={13} /></button>
                <button title={a.isActive ? "Mark inactive" : "Mark active"}
                  onClick={() => run(() => mastersApi(`/accounts/${a.id}/active`, { method: "PATCH", body: { isActive: !a.isActive } }), a.isActive ? "Account marked inactive" : "Account active again")}
                  className="p-1 text-slate-400 hover:text-slate-700"><Power size={13} /></button>
              </div>
            )}
          </div>
        ))}
        {canAdd && (
          <button onClick={() => setModal({})}
            className={`${bare ? "" : "w-[270px] "}min-h-[96px] rounded-lg border-2 border-dashed border-slate-300 text-[13px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700 flex items-center justify-center gap-1.5`}>
            <Plus size={15} /> Add bank account
          </button>
        )}
        {!canAdd && list.length === 0 && <p className="text-[13px] text-slate-400">No bank accounts</p>}
      </div>
      {modal && (
        <AccountModal ownerName={owner.name} initial={modal.initial} onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.initial) await mastersApi(`/accounts/${modal.initial.id}`, { method: "PUT", body: data });
            else await mastersApi("/accounts", { method: "POST", body: { ...data, ownerType, ownerId: owner.id } });
            setModal(null); onChanged(); notify(modal.initial ? "Account updated" : "Account added");
          }} />
      )}
    </div>
  );
}

export default function Masters() {
  const { canView, canAdd, canEdit } = useModulePermissions("treasury_ledger");
  const [tab, setTab] = useState("parties");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(null);       // id whose accounts are expanded
  const [modal, setModal] = useState(null);     // { type: "record"|"import"|"category", initial? }
  const [toast, setToast] = useState(null);
  const [help, setHelp] = useState(false);

  const load = () => mastersApi("/").then(setData).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  const notify = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const done = (msg) => { setModal(null); load(); notify(msg); };

  const meta = TABS.find(t => t.key === tab);
  const rows = useMemo(() => {
    const list = (data?.[tab] || []).filter(r => tab === "categories" || showInactive || r.isActive);
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(r => [r.name, r.value, r.code, r.label, r.bankName, r.accountNumber, r.ifsc, r.holderName,
      r.contactPerson, r.mobile, r.gstin, r.pan, r.city, r.state,
      ...(r.accounts || []).flatMap(a => [a.accountNumber, a.bankName, a.ifsc])].some(v => String(v ?? "").toLowerCase().includes(s)));
  }, [data, tab, q, showInactive]);
  const inactiveCount = tab === "categories" ? 0 : (data?.[tab] || []).filter(r => !r.isActive).length;
  // Other Accounts: grouped by whose account it is — one person can have several
  const people = useMemo(() => {
    if (tab !== "otherAccounts") return null;
    const m = new Map();
    rows.forEach(a => {
      const k = (a.label || "—").trim().toLowerCase();
      if (!m.has(k)) m.set(k, { id: `person:${k}`, label: a.label || "—", accounts: [] });
      m.get(k).accounts.push(a);
    });
    return [...m.values()].sort((x, y) => x.label.localeCompare(y.label));
  }, [tab, rows]);

  if (!canView) {
    return (
      <div className="min-h-full flex items-center justify-center p-10">
        <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-sm">You don't have access to this area</p>
      </div>
    );
  }

  const toggleActive = async (r) => {
    try {
      await mastersApi(`/${tab}/${r.id}/active`, { method: "PATCH", body: { isActive: !r.isActive } });
      load(); notify(r.isActive ? `"${r.name}" marked inactive` : `"${r.name}" active again`);
    } catch (e) { notify(e.message, "error"); }
  };

  const hasAccounts = tab === "parties" || tab === "companies";
  const cols = {
    parties: ["Party", "Contact", "PAN / GSTIN", "Bank Accounts", "Opening", "Entries", ""],
    companies: ["Company", "Code", "PAN / GSTIN", "Bank Accounts", "Entries", ""],
    projects: ["Project", "Code", "City / State", "Entries", ""],
    categories: ["Code", "Category", "Entries", ""],
    otherAccounts: ["Whose Account", "Bank Accounts", ""],
  }[tab];

  return (
    <div className="h-full flex flex-col bg-[#f8fafc]">
      {toast && (
        <div className={`fixed top-5 right-5 z-[70] px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${toast.type === "error" ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>{toast.msg}</div>
      )}
      <div className="shrink-0 bg-white border-b border-slate-200">
        <PageHeader icon={Database} title="Masters" secure tabs={TABS.map(t => ({ key: t.key, label: t.label }))}
          activeTab={tab} onTabChange={t => { setTab(t); setQ(""); setOpen(null); }}
          actions={<>
            <HelpButton onClick={() => setHelp(true)} />
            {tab !== "categories" && tab !== "otherAccounts" && canAdd && (
              <button onClick={() => setModal({ type: "import" })} className={headerBtn}><Download size={14} /> Import from ERP</button>
            )}
            {canAdd && (
              <button onClick={() => setModal({ type: tab === "categories" ? "category" : tab === "otherAccounts" ? "otherAccount" : "record" })} className={headerBtnSecure}>
                <Plus size={15} /> Add {meta.one}
              </button>
            )}
          </>} />
      </div>

      <div className="px-5 sm:px-6 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 w-full sm:max-w-sm">
          <Search size={15} className="text-slate-400 shrink-0" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${meta.label.toLowerCase()}…`} className="h-9 w-full text-sm outline-none" />
        </div>
        <span className="text-[12px] text-slate-500">{people ? `${people.length} ${people.length === 1 ? "person" : "people"} · ${rows.length} accounts` : `${rows.length} ${rows.length === 1 ? meta.one.toLowerCase() : meta.label.toLowerCase()}`}</span>
        {inactiveCount > 0 && (
          <label className="ml-auto flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-3.5 h-3.5 accent-slate-900" />
            Show inactive ({inactiveCount})
          </label>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 lg:px-6 py-4">
        {error ? <p className="py-16 text-center text-sm text-red-600">{error}</p> : !data ? <p className="py-16 text-center text-sm text-slate-400">Loading…</p> : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{cols.map((c, i) => <th key={i} className={`${th} ${c === "Entries" || c === "Opening" ? "text-right" : ""}`}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {(people || rows).map(r => {
                  if (tab === "categories") return (
                    <tr key={r.code} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-3"><span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold font-mono">CAT-{r.code}</span></td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{r.value}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{r.entries}</td>
                      <td className="px-4 py-3 text-right">{canEdit && <button title="Rename" onClick={() => setModal({ type: "category", initial: r })} className={`${iconBtn} ml-auto`}><Pencil size={14} /></button>}</td>
                    </tr>
                  );
                  if (tab === "otherAccounts") {
                    const open1 = open === r.id;
                    const act = r.accounts.filter(a => a.isActive);
                    return (
                      <Fragment key={r.id}>
                        <tr className="border-b border-slate-100 hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <button onClick={() => setOpen(open1 ? null : r.id)} className="flex items-center gap-2 text-left">
                              {open1 ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                              <span className="font-semibold text-slate-800">{r.label}</span>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => setOpen(open1 ? null : r.id)} className="text-left">
                              {act[0] ? <>
                                <span className="text-[13px] text-slate-800">{maskAcc(act[0])}</span>
                                {act.length > 1 && <span className="ml-1.5 text-[11px] text-slate-500">+{act.length - 1} more</span>}
                              </> : <span className="text-[12px] text-slate-400">No active account</span>}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canAdd && (
                              <button title="Add an account for this person" onClick={() => setModal({ type: "otherAccount", presetLabel: r.label })}
                                className={`${iconBtn} ml-auto`}><Plus size={14} /></button>
                            )}
                          </td>
                        </tr>
                        {open1 && (
                          <tr className="border-b border-slate-200">
                            <td colSpan={cols.length} className="px-4 py-3 bg-slate-50/70">
                              <div className="flex flex-wrap gap-2.5">
                                {r.accounts.map(a => (
                                  <div key={a.id} className={`w-[270px] rounded-lg border bg-white p-3 ${a.isActive ? "border-slate-200" : "border-dashed border-slate-300 opacity-60"}`}>
                                    <div className="flex items-center gap-2">
                                      <Landmark size={14} className="text-slate-400" />
                                      <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-slate-800">{a.bankName || "Bank account"}</span>
                                      {!a.isActive && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">INACTIVE</span>}
                                    </div>
                                    <p className="mt-1.5 font-mono text-[13px] text-slate-900">{a.accountNumber}</p>
                                    <p className="text-[11px] text-slate-500 truncate">{[a.ifsc && `IFSC ${a.ifsc}`, a.holderName, a.branch].filter(Boolean).join(" · ") || "—"}</p>
                                    {canEdit && (
                                      <div className="mt-2 flex items-center justify-end gap-1.5">
                                        <button title="Edit" onClick={() => setModal({ type: "otherAccount", initial: a })} className="p-1 text-slate-400 hover:text-slate-700"><Pencil size={13} /></button>
                                        <button title={a.isActive ? "Mark inactive" : "Mark active"} className="p-1 text-slate-400 hover:text-slate-700"
                                          onClick={async () => {
                                            try {
                                              await mastersApi(`/accounts/${a.id}/active`, { method: "PATCH", body: { isActive: !a.isActive } });
                                              load(); notify(a.isActive ? "Account marked inactive" : "Account active again");
                                            } catch (e) { notify(e.message, "error"); }
                                          }}>
                                          <Power size={13} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {canAdd && (
                                  <button onClick={() => setModal({ type: "otherAccount", presetLabel: r.label })}
                                    className="w-[270px] min-h-[96px] rounded-lg border-2 border-dashed border-slate-300 text-[13px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700 flex items-center justify-center gap-1.5">
                                    <Plus size={15} /> Add account for {r.label}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  }
                  const primary = (r.accounts || []).find(a => a.isPrimary && a.isActive);
                  const activeAccs = (r.accounts || []).filter(a => a.isActive).length;
                  const expanded = open === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className={`border-b border-slate-100 hover:bg-slate-50/60 ${!r.isActive ? "opacity-55" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {hasAccounts && (
                              <button onClick={() => setOpen(expanded ? null : r.id)} className="text-slate-400 hover:text-slate-700" title="Bank accounts">
                                {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                              </button>
                            )}
                            <span className="font-semibold text-slate-800">{r.name}</span>
                            {!r.isActive && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">INACTIVE</span>}
                            {r.source && <span className="text-[10px] text-indigo-600" title="Imported from the ERP">ERP</span>}
                          </div>
                        </td>
                        {tab === "parties" && <>
                          <td className="px-4 py-3">
                            <p className="text-slate-700">{r.contactPerson || (r.mobile ? "" : "—")}</p>
                            {r.mobile && <p className="text-[12px] text-slate-500">{r.mobile}</p>}
                          </td>
                          <td className="px-4 py-3 text-[12px] text-slate-600">{[r.pan, r.gstin].filter(Boolean).join(" · ") || "—"}</td>
                        </>}
                        {tab === "companies" && <>
                          <td className="px-4 py-3 text-slate-600">{r.code || "—"}</td>
                          <td className="px-4 py-3 text-[12px] text-slate-600">{[r.pan, r.gstin].filter(Boolean).join(" · ") || "—"}</td>
                        </>}
                        {tab === "projects" && <>
                          <td className="px-4 py-3 text-slate-600">{r.code || "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{[r.city, r.state].filter(Boolean).join(", ") || "—"}</td>
                        </>}
                        {hasAccounts && (
                          <td className="px-4 py-3">
                            <button onClick={() => setOpen(expanded ? null : r.id)} className="text-left">
                              {primary ? <>
                                <span className="text-[13px] text-slate-800">{maskAcc(primary)}</span>
                                {activeAccs > 1 && <span className="ml-1.5 text-[11px] text-slate-500">+{activeAccs - 1} more</span>}
                              </> : <span className="text-[12px] text-slate-400">{canAdd ? "+ Add account" : "None"}</span>}
                            </button>
                          </td>
                        )}
                        {tab === "parties" && <td className="px-4 py-3 text-right tabular-nums text-slate-700">{balText(r.openingBalance)}</td>}
                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">{r.entries}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {canEdit && <button title="Edit" onClick={() => setModal({ type: "record", initial: r })} className={iconBtn}><Pencil size={14} /></button>}
                            {canEdit && (
                              <button title={r.isActive ? "Mark inactive" : "Mark active"} onClick={() => toggleActive(r)} className={iconBtn}>
                                {r.isActive ? <Power size={14} /> : <Check size={14} />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-slate-200">
                          <td colSpan={cols.length} className="p-0">
                            <AccountsPanel owner={r} ownerType={tab === "parties" ? "party" : "company"} canAdd={canAdd} canEdit={canEdit} onChanged={load} notify={notify} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={cols.length} className="py-14 text-center text-sm text-slate-400">
                    {q ? "Nothing matches your search" : `No ${meta.label.toLowerCase()} yet${tab !== "categories" && tab !== "otherAccounts" && canAdd ? " — add one, or import from the ERP" : ""}`}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.type === "record" && (
        <RecordModal kind={tab} onClose={() => setModal(null)} onSaved={done} onAccountsChanged={load} notify={notify} canAdd={canAdd} canEdit={canEdit}
          // the fresh row, so bank changes made inside the panel show at once
          initial={modal.initial && ((data?.[tab] || []).find(r => r.id === modal.initial.id) || modal.initial)} />
      )}
      {help && <HelpPanel tab={tab} tabLabel={meta.label} onClose={() => setHelp(false)} />}
      {modal?.type === "import" && <ImportModal kind={tab} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === "category" && <CategoryModal initial={modal.initial} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.type === "otherAccount" && !modal.initial && !modal.presetLabel && <PersonModal onClose={() => setModal(null)} onSaved={done} />}
      {modal?.type === "otherAccount" && (modal.initial || modal.presetLabel) && (
        <AccountModal other initial={modal.initial} presetLabel={modal.presetLabel || ""} onClose={() => setModal(null)}
          onSave={async (d) => {
            if (modal.initial) await mastersApi(`/accounts/${modal.initial.id}`, { method: "PUT", body: d });
            else await mastersApi("/accounts", { method: "POST", body: { ...d, ownerType: "other" } });
            done(modal.initial ? "Account updated" : "Account added");
          }} />
      )}
    </div>
  );
}
