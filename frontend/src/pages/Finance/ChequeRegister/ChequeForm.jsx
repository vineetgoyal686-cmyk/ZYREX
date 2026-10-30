import React, { useMemo, useRef, useState } from "react";
import { X, Loader2, Paperclip, Upload, FileText, Image as ImageIcon, Trash2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import API from "../../../api";
import { currentUserName } from "../../Attendance/utils";
import { TYPES, inWords, fileSize, MAX_FILES, MAX_MB } from "./utils";

/*
 * Add / edit one cheque. Sends multipart: the fields, new files as files[],
 * and on edit `keep` = the attachment paths still wanted.
 * Party and bank names already used in this company are offered as you type.
 */
const LBL = "block text-[11px] font-semibold text-slate-500 mb-1";
const INP = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400";

export default function ChequeForm({ company, places, cheque, today, known, onClose, onSaved }) {
  const editing = !!cheque;
  const [f, setF] = useState(() => cheque ? {
    direction: cheque.direction, chequeNo: cheque.chequeNo, chequeDate: cheque.chequeDate, amount: String(cheque.amount),
    partyName: cheque.partyName, bankName: cheque.bankName, accountNo: cheque.accountNo, chequeType: cheque.chequeType,
    purpose: cheque.purpose, reference: cheque.reference, handedTo: cheque.handedTo, remarks: cheque.remarks,
    placeKind: cheque.placeKind || "project", placeId: cheque.placeId || "",
  } : {
    direction: "issued", chequeNo: "", chequeDate: today, amount: "", partyName: "", bankName: "", accountNo: "",
    chequeType: "account_payee", purpose: "", reference: "", handedTo: "", remarks: "", placeKind: "project", placeId: "",
  });
  const [keep, setKeep] = useState(() => cheque?.attachments || []);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pick = useRef(null);
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const issued = f.direction === "issued";
  const placeList = useMemo(() => places.filter(p => p.kind === f.placeKind), [places, f.placeKind]);

  const addFiles = (list) => {
    setError("");
    const arr = [...list];
    const big = arr.find(x => x.size > MAX_MB * 1024 * 1024);
    if (big) return setError(`${big.name} is over ${MAX_MB} MB`);
    if (keep.length + files.length + arr.length > MAX_FILES) return setError(`Up to ${MAX_FILES} attachments per cheque`);
    setFiles(prev => [...prev, ...arr]);
  };

  const save = async () => {
    setError("");
    if (!/^\d{6}$/.test(f.chequeNo)) return setError("Cheque number is 6 digits");
    if (!f.chequeDate) return setError("Pick the cheque date");
    if (!(Number(f.amount) > 0)) return setError("Enter the amount");
    if (!f.partyName.trim()) return setError(issued ? "Who is it paid to?" : "Who is it from?");
    if (!f.bankName.trim()) return setError("Enter the bank");
    const place = placeList.find(p => p.id === f.placeId);
    const fd = new FormData();
    Object.entries({ ...f, placeKind: place ? f.placeKind : "", placeId: place?.id || "", placeCode: place?.code || "" })
      .forEach(([k, v]) => fd.append(k, v ?? ""));
    fd.append("company_id", company.id);
    fd.append("byName", currentUserName());
    if (editing) fd.append("keep", JSON.stringify(keep.map(a => a.path)));
    files.forEach(file => fd.append("files", file));
    setSaving(true);
    try {
      if (editing) await API.put(`/api/cheques/${cheque.id}`, fd);
      else await API.post("/api/cheques", fd);
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div>
            <p className="text-[15px] font-bold text-slate-800">{editing ? `Edit Cheque ${cheque.chequeNo}` : "Add Cheque"}</p>
            <p className="text-[11px] text-slate-400">{company.name}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <Seg f={f} set={set} k="direction" options={[["issued", "Issued — we paid", ArrowUpRight], ["received", "Received — we got", ArrowDownLeft]]} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={LBL}>Cheque No *</label>
              <input value={f.chequeNo} onChange={e => set("chequeNo")(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 digits" inputMode="numeric" className={`${INP} tabular-nums tracking-wider`} />
            </div>
            <div>
              <label className={LBL}>Cheque Date *</label>
              <input type="date" value={f.chequeDate} onChange={set("chequeDate")} className={INP} />
              {f.chequeDate > today && <p className="text-[10px] font-semibold text-violet-600 mt-0.5">Post-dated cheque</p>}
            </div>
            <div>
              <label className={LBL}>Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                <input type="number" min="0" step="0.01" value={f.amount} onChange={set("amount")} placeholder="0" className={`${INP} pl-7 tabular-nums`} />
              </div>
            </div>
          </div>
          {Number(f.amount) > 0 && <p className="-mt-3 text-[11px] italic text-slate-500">{inWords(f.amount)}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LBL}>{issued ? "Paid To *" : "Received From *"}</label>
              <input value={f.partyName} onChange={set("partyName")} list="cq-parties" placeholder={issued ? "Vendor / person name" : "Client / person name"} className={INP} />
            </div>
            <div>
              <label className={LBL}>{issued ? "Our Bank *" : "Drawn On (their bank) *"}</label>
              <input value={f.bankName} onChange={set("bankName")} list="cq-banks" placeholder="e.g. HDFC Bank" className={INP} />
            </div>
            <div>
              <label className={LBL}>{issued ? "Our Account No" : "Their Account No"}</label>
              <input value={f.accountNo} onChange={set("accountNo")} placeholder="Optional — last 4 digits are enough" className={`${INP} tabular-nums`} />
            </div>
            <div>
              <label className={LBL}>Cheque Type</label>
              <Seg f={f} set={set} k="chequeType" options={TYPES} />
            </div>
          </div>
          <datalist id="cq-parties">{known.parties.map(p => <option key={p} value={p} />)}</datalist>
          <datalist id="cq-banks">{known.banks.map(b => <option key={b} value={b} />)}</datalist>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LBL}>Purpose</label>
              <input value={f.purpose} onChange={set("purpose")} placeholder="e.g. Advance for cement supply" className={INP} />
            </div>
            <div>
              <label className={LBL}>Bill / PO / Invoice No</label>
              <input value={f.reference} onChange={set("reference")} placeholder="Optional" className={INP} />
            </div>
            <div>
              <label className={LBL}>For (project / office)</label>
              <div className="flex gap-2">
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0">
                  {[["project", "Project"], ["office", "Office"]].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setF(p => ({ ...p, placeKind: v, placeId: "" }))}
                      className={`px-2.5 h-8 rounded-md text-xs font-semibold ${f.placeKind === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>{l}</button>
                  ))}
                </div>
                <select value={f.placeId} onChange={set("placeId")} className={INP}>
                  <option value="">— None —</option>
                  {placeList.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={LBL}>{issued ? "Handed To" : "Collected By"}</label>
              <input value={f.handedTo} onChange={set("handedTo")} placeholder={issued ? "Who took the cheque" : "Who got it from the party"} className={INP} />
              {issued && !editing && f.handedTo && <p className="text-[10px] text-slate-400 mt-0.5">Saved as "Handed Over"</p>}
            </div>
          </div>

          <div>
            <label className={LBL}>Remarks</label>
            <input value={f.remarks} onChange={set("remarks")} placeholder="Optional" className={INP} />
          </div>

          {/* attachments */}
          <div>
            <label className={LBL}>Attachments <span className="font-normal text-slate-400">— cheque photo, receipt / acknowledgement (images or PDF, up to {MAX_FILES}, {MAX_MB} MB each)</span></label>
            <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              onClick={() => pick.current?.click()}
              className="flex flex-col items-center justify-center gap-1 py-5 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/60 text-slate-500 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40">
              <Upload size={18} className="text-slate-400" />
              <p className="text-xs font-semibold">Drop files here or click to choose</p>
            </div>
            <input ref={pick} type="file" multiple accept="image/*,application/pdf" className="hidden"
              onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
            {(keep.length > 0 || files.length > 0) && (
              <ul className="mt-2 space-y-1.5">
                {keep.map(a => (
                  <FileRow key={a.path} name={a.name} size={a.size} type={a.type} onRemove={() => setKeep(k => k.filter(x => x.path !== a.path))} />
                ))}
                {files.map((file, i) => (
                  <FileRow key={`new-${i}`} name={file.name} size={file.size} type={file.type} isNew onRemove={() => setFiles(l => l.filter((_, j) => j !== i))} />
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50">
          {error && <p className="text-xs text-red-600 flex-1">{error}</p>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-2 h-9 px-5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving && <Loader2 size={13} className="animate-spin" />} {editing ? "Save Changes" : "Save Cheque"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileRow({ name, size, type, isNew, onRemove }) {
  const Icon = String(type).startsWith("image/") ? ImageIcon : String(type).includes("pdf") ? FileText : Paperclip;
  return (
    <li className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 bg-white">
      <Icon size={15} className="text-slate-400 shrink-0" />
      <span className="flex-1 min-w-0 text-[13px] text-slate-700 truncate">{name}</span>
      {isNew && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">New</span>}
      <span className="text-[11px] text-slate-400 tabular-nums">{fileSize(size)}</span>
      <button type="button" onClick={onRemove} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50" title="Remove"><Trash2 size={13} /></button>
    </li>
  );
}

const Seg = ({ k, options, f, set }) => (
  <div className="flex items-center bg-slate-100 rounded-lg p-0.5 w-fit">
    {options.map(([v, l, Icon]) => (
      <button key={v} type="button" onClick={() => set(k)(v)}
        className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold transition-all ${f[k] === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
        {Icon && <Icon size={13} />}{l}
      </button>
    ))}
  </div>
);
