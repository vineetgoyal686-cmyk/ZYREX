import React, { useEffect, useState } from "react";
import { X, Loader2, FileText, Image as ImageIcon, Paperclip, ExternalLink, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import API from "../../../api";
import BrandLoader from "../../../components/BrandLoader";
import { currentUserName } from "../../Attendance/utils";
import { STATUS, NEXT, inr, inWords, fmtDay, typeLabel, fileSize, isStale, isPostDated } from "./utils";

/* Everything about one cheque: details, attachments (open / preview), and
   the status history. */
export function ChequeView({ cheque: c, place, today, onClose }) {
  const [files, setFiles] = useState(null);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!c.attachments.length) return setFiles([]);
    API.get(`/api/cheques/${c.id}/files`).then(({ data }) => setFiles(data.files || [])).catch(() => setFiles([]));
  }, [c.id]);
  const issued = c.direction === "issued";
  const Item = ({ label, children, wide }) => (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 text-sm text-slate-800 break-words">{children || "—"}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <p className="flex items-center gap-2 text-[15px] font-bold text-slate-800">
              {issued ? <ArrowUpRight size={16} className="text-red-500" /> : <ArrowDownLeft size={16} className="text-emerald-600" />}
              Cheque {c.chequeNo}
              <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS[c.status]?.soft}`}>{c.status}</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">{issued ? "Issued — we paid" : "Received — we got"} · {typeLabel(c.chequeType)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
            <p className="text-2xl font-extrabold text-slate-800 tabular-nums">{inr(c.amount)}</p>
            <p className="text-[11px] italic text-slate-500">{inWords(c.amount)}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
            <Item label={issued ? "Paid To" : "Received From"}>{c.partyName}</Item>
            <Item label="Cheque Date">
              {fmtDay(c.chequeDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              {isPostDated(c, today) && <span className="ml-2 text-[10px] font-semibold text-violet-600">Post-dated</span>}
              {isStale(c, today) && <span className="ml-2 text-[10px] font-semibold text-red-600">Over 3 months old</span>}
            </Item>
            <Item label={issued ? "Our Bank" : "Drawn On"}>{c.bankName}{c.accountNo && <span className="text-slate-400 text-xs"> · A/c {c.accountNo}</span>}</Item>
            <Item label="For">{place ? `${place.name} (${place.code})` : c.placeCode}</Item>
            <Item label="Purpose">{c.purpose}</Item>
            <Item label="Bill / PO / Invoice">{c.reference}</Item>
            <Item label={issued ? "Handed To" : "Collected By"}>{c.handedTo}</Item>
            <Item label="Status Date">{c.statusDate ? fmtDay(c.statusDate) : ""}</Item>
            {c.status === "Bounced" && <Item label="Bounce Reason" wide><span className="text-red-600">{c.bounceReason}</span></Item>}
            <Item label="Remarks" wide>{c.remarks}</Item>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Attachments ({c.attachments.length})</p>
            {!c.attachments.length ? <p className="text-sm text-slate-400">No attachments</p>
              : !files ? <BrandLoader compact />
              : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {files.map(a => {
                    const img = String(a.type).startsWith("image/");
                    const Icon = img ? ImageIcon : String(a.type).includes("pdf") ? FileText : Paperclip;
                    return (
                      <button key={a.path} type="button" onClick={() => img ? setPreview(a) : a.url && window.open(a.url, "_blank", "noopener")}
                        className="group text-left rounded-lg border border-slate-200 overflow-hidden hover:border-blue-300">
                        {img && a.url ? <img src={a.url} alt={a.name} className="w-full h-24 object-cover bg-slate-100" />
                          : <div className="w-full h-24 flex items-center justify-center bg-slate-50"><Icon size={26} className="text-slate-300" /></div>}
                        <div className="flex items-center gap-1 px-2 py-1.5">
                          <span className="flex-1 min-w-0 text-[11px] text-slate-600 truncate">{a.name}</span>
                          <span className="text-[10px] text-slate-400">{fileSize(a.size)}</span>
                          {!img && <ExternalLink size={11} className="text-slate-400" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">History</p>
            <ol className="relative border-l border-slate-200 ml-1.5 space-y-3">
              {[...c.statusHistory].reverse().map((h, i) => (
                <li key={i} className="ml-4">
                  <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${STATUS[h.status]?.dot || "bg-slate-300"}`} />
                  <p className="text-[13px] font-semibold text-slate-700">{h.status} <span className="font-normal text-slate-400">· {fmtDay(h.date)}</span></p>
                  <p className="text-[11px] text-slate-400">{[h.note, h.by].filter(Boolean).join(" · ")}</p>
                </li>
              ))}
            </ol>
            <p className="text-[10px] text-slate-400 mt-3">Entered by {c.createdBy || "—"}{c.updatedBy && c.updatedBy !== c.createdBy ? ` · last change by ${c.updatedBy}` : ""}</p>
          </div>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-6" onMouseDown={() => setPreview(null)}>
          <img src={preview.url} alt={preview.name} className="max-w-full max-h-full rounded-lg shadow-2xl" />
          <button onClick={() => setPreview(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><X size={18} /></button>
        </div>
      )}
    </div>
  );
}

/* Move a cheque on: Handed Over / Deposited / Cleared / Bounced … with a date */
export function StatusModal({ cheque: c, today, onClose, onSaved }) {
  const options = NEXT[c.direction].filter(s => s !== c.status);
  const [status, setStatus] = useState(options.includes("Cleared") ? "Cleared" : options[0]);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [handedTo, setHandedTo] = useState(c.handedTo || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const INP = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400";

  const save = async () => {
    setError("");
    if (status === "Bounced" && !reason.trim()) return setError("Write why it bounced");
    setSaving(true);
    try {
      await API.patch(`/api/cheques/${c.id}/status`, {
        status, date, note, bounceReason: reason, byName: currentUserName(),
        ...(status === "Handed Over" ? { handedTo } : {}),
      });
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.error || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div>
            <p className="text-[15px] font-bold text-slate-800">Change Status</p>
            <p className="text-[11px] text-slate-400">Cheque {c.chequeNo} · {c.partyName} · {inr(c.amount)} · now {c.status}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {options.map(s => (
              <button key={s} type="button" onClick={() => setStatus(s)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold text-left transition-all
                  ${status === s ? `${STATUS[s].soft} ring-1 ring-offset-0 ring-current` : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <span className={`w-2 h-2 rounded-full ${STATUS[s].dot}`} />{s}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Date</label>
            <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className={INP} />
          </div>
          {status === "Handed Over" && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Handed To</label>
              <input value={handedTo} onChange={e => setHandedTo(e.target.value)} placeholder="Who took the cheque" className={INP} />
            </div>
          )}
          {status === "Bounced" ? (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Bounce Reason *</label>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Insufficient funds, signature mismatch" className={INP} />
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Note</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" className={INP} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50">
          {error && <p className="text-xs text-red-600 flex-1">{error}</p>}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 h-9 px-5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving && <Loader2 size={13} className="animate-spin" />} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
