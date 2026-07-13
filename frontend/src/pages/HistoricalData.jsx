import { useState, useEffect, useRef } from "react";
import {
  Plus, Pencil, Trash2, FileText, X,
  ScrollText, ChevronDown, Search, FileSpreadsheet, Download, ArrowDownToLine, CalendarDays, ChevronLeft, ChevronRight, Copy,
} from "lucide-react";
import { authFetch } from "../utils/authFetch";
import { useModulePermissions } from "../hooks/useModulePermissions";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const fmt     = (v) => v != null ? Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—";
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const TABS = [
  { key: "orders",  label: "Orders"  },
  { key: "intake",  label: "Intake"  },
  { key: "payment", label: "Payment" },
];

/* ── MultiSelect ─────────────────────────────────────────────────────────── */
function MultiSelect({ label, options, selected, onChange, showCount }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => { if (!open) setQuery(""); }, [open]);
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const filtered = query.trim() ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`inline-flex h-8 items-center gap-1.5 rounded border px-3 text-xs font-semibold transition-all select-none ${
          selected.length ? "border-indigo-400 bg-indigo-50 text-indigo-800" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
        }`}>
        {selected.length ? `${label} (${selected.length})` : label}
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-slate-200 rounded shadow-md min-w-[200px] w-max max-h-72 flex flex-col">
          {(showCount || options.length > 6) && (
            <div className="p-2 border-b border-slate-100 shrink-0">
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search..."
                  className="w-full h-7 pl-6 pr-2 rounded border border-slate-200 text-xs outline-none focus:border-indigo-400" />
              </div>
            </div>
          )}
          {showCount && (
            <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 border-b border-slate-100 shrink-0">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""} found
            </div>
          )}
          <div className="overflow-y-auto max-h-56">
            {filtered.length === 0
              ? <p className="px-4 py-3 text-xs text-slate-400">No options</p>
              : filtered.map(opt => (
                <label key={opt} className="flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 cursor-pointer hover:bg-slate-50 whitespace-nowrap">
                  <input type="checkbox" className="accent-indigo-600 shrink-0" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
                  {opt}
                </label>
              ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2 shrink-0">
              <button onClick={() => onChange([])} className="text-[11px] text-red-500 hover:text-red-700">Clear all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Dropdown Button ─────────────────────────────────────────────────────── */
function DropBtn({ label, icon: Icon, iconCls, items, btnCls }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`inline-flex h-8 items-center gap-1.5 rounded border px-3 text-xs font-semibold transition-all select-none ${btnCls}`}>
        {Icon && <Icon size={12} className={iconCls} />} {label}
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-slate-200 rounded shadow-md min-w-[180px] py-1">
          {items.map((it, i) => it === "---"
            ? <div key={i} className="border-t border-slate-100 my-1" />
            : <button key={i} onClick={() => { it.action(); setOpen(false); }}
                className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                {it.icon && <it.icon size={13} className={it.iconCls || "text-slate-400"} />}
                {it.label}
              </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Log Modal ───────────────────────────────────────────────────────────── */
function LogModal({ record, onClose }) {
  if (!record) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl w-96 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <span className="font-bold text-slate-800 text-base">Entry Log</span>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded transition-colors"><X size={16} className="text-slate-400" /></button>
        </div>
        <div className="flex flex-col gap-3">
          {[
            ["Order No",     record.order_no],
            ["Entered By",   record.entry_by],
            ["Entry Date",   fmtDate(record.created_at)],
            ["Last Updated", fmtDate(record.updated_at)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between items-center pb-3 border-b border-slate-100 last:border-0 last:pb-0">
              <span className="text-xs text-slate-500">{k}</span>
              <span className="text-sm font-semibold text-slate-800">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── SearchSelect ────────────────────────────────────────────────────────── */
function SearchSelect({ value, onChange, options, placeholder = "— Select —" }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const ref     = useRef();
  const inputRef = useRef();

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  const filtered = query.trim()
    ? options.filter(o => `${o.code} ${o.name}`.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selected = options.find(o => o.code === value);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => { setOpen(o => !o); setQuery(""); }}
        className="w-full border border-slate-200 rounded px-3 py-2 text-sm bg-white cursor-pointer flex items-center justify-between gap-2 hover:border-slate-300 transition-colors min-h-[38px]">
        {selected ? (
          <span className="text-slate-800 font-medium text-[13px]">{selected.name}
            <span className="text-slate-400 font-normal text-[11px] ml-1.5">({selected.code})</span>
          </span>
        ) : <span className="text-slate-400 text-[13px]">{placeholder}</span>}
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[200] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="px-3 py-2 border-b border-slate-100">
            <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search here..." onClick={e => e.stopPropagation()}
              className="w-full text-[13px] border border-slate-200 rounded px-3 py-1.5 outline-none focus:border-indigo-400 placeholder:text-slate-300" />
          </div>
          {/* Count */}
          <div className="px-3 py-1.5 text-[11px] text-slate-400 bg-slate-50 border-b border-slate-100">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""} found
          </div>
          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0
              ? <div className="px-4 py-4 text-[12px] text-slate-400 text-center">No results</div>
              : filtered.map(o => (
                <div key={o.code} onClick={() => { onChange(o.code); setOpen(false); setQuery(""); }}
                  className={`px-4 py-2.5 cursor-pointer border-b border-slate-50 last:border-0 transition-colors flex items-center justify-between group
                    ${value === o.code ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                  <div>
                    <div className={`text-[13px] font-semibold ${value === o.code ? "text-indigo-700" : "text-slate-800"}`}>{o.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Code: <span className="font-semibold text-slate-500">{o.code}</span>
                      {o.gstin && <span className="ml-2">GSTIN: {o.gstin}</span>}
                      {o.location && <span className="ml-0"> · {o.location}</span>}
                    </div>
                  </div>
                  <ChevronRight size={13} className="text-slate-300 group-hover:text-slate-400 shrink-0" />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── DatePicker ──────────────────────────────────────────────────────────── */
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_HDR    = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function DatePicker({ value, onChange, className }) {
  const parsed = value ? new Date(value + "T00:00:00") : null;
  const today  = new Date();
  const [open, setOpen]           = useState(false);
  const [view, setView]           = useState("day"); // "day" | "month" | "year"
  const [vYear, setVYear]         = useState(parsed?.getFullYear() || today.getFullYear());
  const [vMonth, setVMonth]       = useState(parsed?.getMonth() ?? today.getMonth());
  const [yrBase, setYrBase]       = useState(Math.floor((parsed?.getFullYear() || today.getFullYear()) / 12) * 12);
  const ref = useRef();

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setView("day"); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pick = (day) => {
    onChange({ target: { value: `${vYear}-${String(vMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}` } });
    setOpen(false); setView("day");
  };

  const display = parsed
    ? `${String(parsed.getDate()).padStart(2,"0")}-${String(parsed.getMonth()+1).padStart(2,"0")}-${parsed.getFullYear()}`
    : "";

  const firstDay    = new Date(vYear, vMonth, 1).getDay();
  const daysInMonth = new Date(vYear, vMonth + 1, 0).getDate();
  const prevMonth   = () => { if (vMonth === 0) { setVMonth(11); setVYear(y => y-1); } else setVMonth(m => m-1); };
  const nextMonth   = () => { if (vMonth === 11) { setVMonth(0); setVYear(y => y+1); } else setVMonth(m => m+1); };

  return (
    <div ref={ref} className="relative">
      <div className={`${className} flex items-center justify-between cursor-pointer select-none`}
        onClick={() => { setOpen(o => !o); setView("day"); }}>
        <span className={display ? "text-slate-800" : "text-slate-400 text-sm"}>{display || "dd-mm-yyyy"}</span>
        <CalendarDays size={14} className="text-slate-400 shrink-0" />
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-[100] bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-[256px]">

          {/* ── DAY VIEW ── */}
          {view === "day" && <>
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-slate-100"><ChevronLeft size={14}/></button>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setView("month")}
                  className="text-[13px] font-semibold text-slate-700 hover:text-indigo-600 px-1 rounded hover:bg-indigo-50 transition-colors">
                  {MONTHS_FULL[vMonth].slice(0,3)}
                </button>
                <button type="button" onClick={() => { setYrBase(Math.floor(vYear/12)*12); setView("year"); }}
                  className="text-[13px] font-semibold text-slate-700 hover:text-indigo-600 px-1 rounded hover:bg-indigo-50 transition-colors">
                  {vYear}
                </button>
              </div>
              <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-slate-100"><ChevronRight size={14}/></button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {DAYS_HDR.map(d => <div key={d} className="text-[10px] text-slate-400 font-semibold py-0.5">{d}</div>)}
              {Array.from({length: firstDay}, (_,i) => <div key={`e${i}`}/>)}
              {Array.from({length: daysInMonth}, (_,i) => {
                const d = i+1;
                const sel = parsed && parsed.getDate()===d && parsed.getMonth()===vMonth && parsed.getFullYear()===vYear;
                const tod = today.getDate()===d && today.getMonth()===vMonth && today.getFullYear()===vYear;
                return <button key={d} type="button" onClick={() => pick(d)}
                  className={`text-[12px] rounded py-[3px] transition-colors ${sel ? "bg-indigo-600 text-white font-semibold" : tod ? "border border-indigo-300 text-indigo-600" : "hover:bg-indigo-50 text-slate-700"}`}>{d}</button>;
              })}
            </div>
          </>}

          {/* ── MONTH VIEW ── */}
          {view === "month" && <>
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => setVYear(y=>y-1)} className="p-1 rounded hover:bg-slate-100"><ChevronLeft size={14}/></button>
              <button type="button" onClick={() => { setYrBase(Math.floor(vYear/12)*12); setView("year"); }}
                className="text-[13px] font-semibold text-slate-700 hover:text-indigo-600 px-1 rounded hover:bg-indigo-50">{vYear}</button>
              <button type="button" onClick={() => setVYear(y=>y+1)} className="p-1 rounded hover:bg-slate-100"><ChevronRight size={14}/></button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {MONTHS_FULL.map((m,i) => <button key={i} type="button" onClick={() => { setVMonth(i); setView("day"); }}
                className={`py-2 text-[12px] rounded transition-colors ${i===vMonth ? "bg-indigo-600 text-white font-semibold" : "hover:bg-indigo-50 text-slate-700"}`}>
                {m.slice(0,3)}</button>)}
            </div>
          </>}

          {/* ── YEAR VIEW ── */}
          {view === "year" && <>
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => setYrBase(b=>b-12)} className="p-1 rounded hover:bg-slate-100"><ChevronLeft size={14}/></button>
              <span className="text-[12px] font-semibold text-slate-500">{yrBase} – {yrBase+11}</span>
              <button type="button" onClick={() => setYrBase(b=>b+12)} className="p-1 rounded hover:bg-slate-100"><ChevronRight size={14}/></button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {Array.from({length:12},(_,i)=>yrBase+i).map(y => <button key={y} type="button"
                onClick={() => { setVYear(y); setView("month"); }}
                className={`py-2 text-[12px] rounded transition-colors ${y===vYear ? "bg-indigo-600 text-white font-semibold" : "hover:bg-indigo-50 text-slate-700"}`}>{y}</button>)}
            </div>
          </>}

          {value && <button type="button" onClick={() => { onChange({target:{value:""}}); setOpen(false); setView("day"); }}
            className="mt-2 w-full text-[11px] text-slate-400 hover:text-red-500 transition-colors">Clear</button>}
        </div>
      )}
    </div>
  );
}

/* ── Shared field wrapper (must be outside FormModal to avoid focus loss) ─── */
const inp = "w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all";
function LBL({ t, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{t}</label>
      {children}
    </div>
  );
}

/* ── Form Modal ──────────────────────────────────────────────────────────── */
function FormModal({ record, sites, entities, onClose, onSave }) {
  const isEdit   = !!record?.id;
  const meUser   = (() => { try { return JSON.parse(localStorage.getItem("bms_user") || "{}"); } catch { return {}; } })();
  const entryBy  = isEdit ? (record.entry_by || "—") : (meUser.name || "—");
  const [form, setForm] = useState({
    order_no:    record?.order_no    || "",
    order_type:  record?.order_type  || "",
    entity_code: record?.entity_code || "",
    site_code:   record?.site_code   || "",
    vendor_name: record?.vendor_name || "",
    subject:     record?.subject     || "",
    status:      record?.status      || "",
    order_value: record?.order_value || "",
    order_date:  record?.order_date  || "",
    prepared_in: record?.prepared_in || "",
  });
  const [pdfFile, setPdfFile]     = useState(null);
  const [removePdf, setRemovePdf] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState("");
  const fileRef                   = useRef();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.order_no.trim()) return setErr("Order No is required");
    setSaving(true); setErr("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (pdfFile) fd.append("pdf", pdfFile);
      if (removePdf) fd.append("remove_pdf", "true");
      const url = isEdit ? `${API}/api/historical-orders/${record.id}` : `${API}/api/historical-orders`;
      const res = await authFetch(url, { method: isEdit ? "PUT" : "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      onSave(json.record, isEdit);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };


  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl w-[680px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <span className="font-bold text-slate-800">{isEdit ? "Edit Record" : "Add Historical Order"}</span>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded transition-colors"><X size={16} className="text-slate-400" /></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <LBL t="Order No *">
            <input className={inp} value={form.order_no} onChange={e => set("order_no", e.target.value)} placeholder="e.g. PO/2022/001" />
          </LBL>
          <LBL t="Order Date">
            <DatePicker className={inp} value={form.order_date} onChange={e => set("order_date", e.target.value)} />
          </LBL>
          {/* Order Type + Prepared In */}
          <LBL t="Order Type">
            <div className="flex gap-2">
              {[["Purchase Order","PO"],["Work Order","WO"]].map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => set("order_type", form.order_type === val ? "" : val)}
                  className={`flex-1 py-2 rounded border text-[13px] font-semibold transition-all
                    ${form.order_type === val
                      ? val === "Purchase Order" ? "bg-blue-600 border-blue-600 text-white" : "bg-amber-500 border-amber-500 text-white"
                      : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  {lbl} — {val === "Purchase Order" ? "Purchase Order" : "Work Order"}
                </button>
              ))}
            </div>
          </LBL>
          <LBL t="Prepared In">
            <input className={inp} value={form.prepared_in} onChange={e => set("prepared_in", e.target.value)} placeholder="e.g. Tally, SAP, Manual" />
          </LBL>
          <LBL t="Status">
            <input className={inp} value={form.status} onChange={e => set("status", e.target.value)} placeholder="e.g. Completed, Pending, Cancelled" />
          </LBL>
          <LBL t="Entity Code">
            <SearchSelect
              value={form.entity_code}
              onChange={v => set("entity_code", v)}
              options={entities.map(e => ({ code: e.code, name: e.name, gstin: e.gstin }))}
              placeholder="— Select Entity —"
            />
          </LBL>
          <LBL t="Site Code">
            <SearchSelect
              value={form.site_code}
              onChange={v => set("site_code", v)}
              options={sites.map(s => ({ code: s.code, name: s.name, location: s.location }))}
              placeholder="— Select Site —"
            />
          </LBL>
          <div className="col-span-2">
            <LBL t="Vendor Name">
              <input className={inp} value={form.vendor_name} onChange={e => set("vendor_name", e.target.value)} placeholder="Vendor name" />
            </LBL>
          </div>
          <LBL t="Entry By">
            <div className={`${inp} bg-slate-50 text-slate-500 cursor-not-allowed`}>{entryBy}</div>
          </LBL>
          <LBL t="Order Value (₹)">
            <input type="number" className={inp} value={form.order_value} onChange={e => set("order_value", e.target.value)} placeholder="0.00" />
          </LBL>
          <div className="col-span-2">
            <LBL t="Subject">
              <textarea
                className={`${inp} resize-none overflow-hidden`}
                value={form.subject}
                onChange={e => { set("subject", e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                onInput={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                placeholder="Order subject / description"
                rows={2}
                style={{minHeight: "40px"}}
              />
            </LBL>
          </div>
          <div className="col-span-2">
            <LBL t="Order PDF">
              {isEdit && record.pdf_url && !removePdf ? (
                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded border border-slate-200">
                  <FileText size={14} className="text-blue-600 shrink-0" />
                  <span className="text-xs text-blue-600 flex-1">PDF attached</span>
                  <button onClick={() => window.open(record.pdf_url, "_blank")} className="text-xs text-blue-600 hover:underline">View</button>
                  <button onClick={() => setRemovePdf(true)} className="text-xs text-red-500 hover:underline">Remove</button>
                </div>
              ) : (
                <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded py-3 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
                  <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={e => { setPdfFile(e.target.files[0]); setRemovePdf(false); }} />
                  {pdfFile ? <span className="text-xs text-blue-600 font-medium">{pdfFile.name}</span>
                           : <span className="text-xs text-slate-400">Click to upload PDF / image</span>}
                </div>
              )}
            </LBL>
          </div>
        </div>
        {err && <p className="px-6 text-xs text-red-500 -mt-2 mb-2">{err}</p>}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="h-8 px-4 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="h-8 px-4 rounded bg-gradient-to-b from-indigo-600 to-indigo-700 border border-indigo-700 text-xs font-semibold text-white hover:from-indigo-500 hover:to-indigo-600 transition-all disabled:opacity-60">
            {saving ? "Saving…" : isEdit ? "Update" : "Add Record"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Toast ───────────────────────────────────────────────────────────────── */
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, []);
  return (
    <div className="fixed top-5 right-5 z-[200] bg-slate-800 text-white text-xs font-medium px-4 py-2.5 rounded shadow-lg">
      {msg}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function HistoricalData() {
  const { canView, canEdit, canDelete } = useModulePermissions("historical_data");
  const [tab,       setTab]       = useState("orders");
  const [records,   setRecords]   = useState([]);
  const [sites,     setSites]     = useState([]);
  const [entities,  setEntities]  = useState([]);
  const [preparedOpts, setPreparedOpts] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [filterSite,     setFilterSite]     = useState([]);
  const [filterEntity,   setFilterEntity]   = useState([]);
  const [filterVendor,   setFilterVendor]   = useState([]);
  const [filterPrepared, setFilterPrepared] = useState([]);
  const [filterOrderType,setFilterOrderType]= useState([]);
  const [filterStatus,   setFilterStatus]   = useState([]);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [editRec,  setEditRec]  = useState(null);
  const [logRec,   setLogRec]   = useState(null);
  const [delId,    setDelId]    = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast,    setToast]    = useState("");
  const xlsxRef = useRef();

  const fetchDropdowns = async () => {
    try {
      const res  = await authFetch(`${API}/api/historical-orders/dropdowns`);
      const json = await res.json();
      if (!res.ok) { console.error("Dropdowns API error:", json); return; }
      setSites(json.sites || []);
      setEntities(json.entities || []);
    } catch (e) { console.error("fetchDropdowns failed:", e); }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      filterSite.forEach(v       => p.append("site_code",   v));
      filterEntity.forEach(v     => p.append("entity_code", v));
      filterVendor.forEach(v     => p.append("vendor_name", v));
      filterPrepared.forEach(v   => p.append("prepared_in", v));
      filterOrderType.forEach(v  => p.append("order_type",  v));
      filterStatus.forEach(v     => p.append("status",      v));
      const res  = await authFetch(`${API}/api/historical-orders?${p}`);
      const json = await res.json();
      setRecords(json.records || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchDropdowns(); }, []);
  useEffect(() => { fetchRecords(); }, [filterSite, filterEntity, filterVendor, filterPrepared, filterOrderType, filterStatus]);

  const handleSave = (rec, isEdit) => {
    setRecords(prev => isEdit ? prev.map(r => r.id === rec.id ? rec : r) : [rec, ...prev]);
    setFormOpen(false); setEditRec(null);
  };

  const handleDelete = async () => {
    if (!delId) return;
    setDeleting(true);
    await authFetch(`${API}/api/historical-orders/${delId}`, { method: "DELETE" });
    setRecords(prev => prev.filter(r => r.id !== delId));
    setDelId(null); setDeleting(false);
  };

  const handleBulk = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("excel", file);
    const res  = await authFetch(`${API}/api/historical-orders/bulk`, { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) { setToast(json.error || "Upload failed"); return; }
    const dupMsg = json.duplicates?.length ? ` | ${json.duplicates.length} duplicate(s) skipped` : "";
    setToast(`${json.inserted} records inserted${dupMsg}`);
    if (res.ok) fetchRecords();
    e.target.value = "";
  };

  const dlBlob = async (url, filename) => {
    const res  = await authFetch(url);
    const blob = await res.blob();
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const downloadTemplate = () => dlBlob(`${API}/api/historical-orders/template`, "historical_orders_template.xlsx");
  const exportExcel      = () => dlBlob(`${API}/api/historical-orders/export`,   "historical_orders_export.xlsx");

  const allVendors    = [...new Set(records.map(r => r.vendor_name).filter(Boolean))].sort();
  const allEntities   = [...new Set(records.map(r => r.entity_code).filter(Boolean))].sort();
  const allSites      = [...new Set(records.map(r => r.site_code).filter(Boolean))].sort();
  const allPrepared   = [...new Set(records.map(r => r.prepared_in).filter(Boolean))].sort();
  const allOrderTypes = [...new Set(records.map(r => r.order_type).filter(Boolean))].sort();
  const allStatuses   = [...new Set(records.map(r => r.status).filter(Boolean))].sort();

  const filtered = records.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.order_no, r.vendor_name, r.subject, r.site_code, r.entity_code, r.prepared_in].some(v => v?.toLowerCase().includes(q));
  });

  const TH = ({ ch, right, sticky }) => (
    <th className={`px-4 py-3 text-[13px] font-medium text-slate-500 whitespace-nowrap bg-[#f9fafb] border-b border-r border-slate-200
      ${right ? "text-right" : "text-left"}
      ${sticky === "left"  ? "sticky left-0 z-[21]" : ""}
      ${sticky === "right" ? "sticky right-0 z-[21]" : ""}`}>{ch}</th>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#f0f2f5]">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-6 shrink-0 h-14">
        <h1 className="text-base font-bold text-slate-800 shrink-0">Historical Data</h1>
        <div className="flex items-center gap-1 h-full">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`h-full px-4 text-xs font-semibold border-b-2 transition-colors select-none ${
                tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {tab === "orders" && (
          <div className="flex items-center gap-2">
            {/* Export */}
            <DropBtn
              label="Export" icon={Download} iconCls="text-slate-500"
              btnCls="border-slate-300 bg-gradient-to-b from-slate-50 to-slate-100 text-slate-700 hover:border-slate-400"
              items={[
                { label: "Excel (.xlsx)", icon: FileSpreadsheet, iconCls: "text-green-600", action: exportExcel },
              ]}
            />
            {/* Bulk Upload */}
            {canEdit && (
              <>
                <input ref={xlsxRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBulk} />
                <DropBtn
                  label="Bulk Upload" icon={FileSpreadsheet} iconCls="text-green-600"
                  btnCls="border-slate-300 bg-gradient-to-b from-slate-50 to-slate-100 text-slate-700 hover:border-slate-400"
                  items={[
                    { label: "Upload Excel",       icon: FileSpreadsheet, iconCls: "text-green-600", action: () => xlsxRef.current?.click() },
                    "---",
                    { label: "Download Template",  icon: Download,        iconCls: "text-indigo-500", action: downloadTemplate },
                  ]}
                />
              </>
            )}
            {/* Add */}
            {canEdit && (
              <button onClick={() => { setEditRec(null); setFormOpen(true); }}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-indigo-700 bg-gradient-to-b from-indigo-600 to-indigo-700 px-3 text-xs font-semibold text-white hover:from-indigo-500 hover:to-indigo-600 transition-all select-none">
                <Plus size={12} /> Add Entry
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Coming Soon ──────────────────────────────────────────────────── */}
      {tab !== "orders" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white rounded px-20 py-16 shadow-sm border border-slate-100 text-center">
            <p className="text-slate-400 font-bold uppercase tracking-[0.25em] text-sm">
              {TABS.find(t => t.key === tab)?.label} — Coming Soon
            </p>
          </div>
        </div>
      )}

      {tab === "orders" && (<>
        {/* ── Toolbar ────────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center gap-2.5 shrink-0 sticky top-0 z-10 shadow-sm">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search order no, vendor, subject…"
              className="h-8 w-64 pl-7 pr-3 rounded border border-slate-200 text-xs text-slate-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all bg-white" />
          </div>
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {loading ? "Loading…" : `${filtered.length} record${filtered.length !== 1 ? "s" : ""}`}
          </span>
          <div className="flex-1" />
          <MultiSelect label="Order Type"   options={allOrderTypes} selected={filterOrderType} onChange={setFilterOrderType} />
          <MultiSelect label="Status"       options={allStatuses}   selected={filterStatus}   onChange={setFilterStatus} />
          <MultiSelect label="Entity Code"  options={allEntities}   selected={filterEntity}   onChange={setFilterEntity}   showCount />
          <MultiSelect label="Site Code"    options={allSites}      selected={filterSite}     onChange={setFilterSite}     showCount />
          <MultiSelect label="Vendor"       options={allVendors}    selected={filterVendor}   onChange={setFilterVendor}   showCount />
          <MultiSelect label="Prepared In"  options={allPrepared}   selected={filterPrepared} onChange={setFilterPrepared} />
          {(filterSite.length || filterEntity.length || filterVendor.length || filterPrepared.length || filterOrderType.length || filterStatus.length || search) ? (
            <button onClick={() => { setFilterSite([]); setFilterEntity([]); setFilterVendor([]); setFilterPrepared([]); setFilterOrderType([]); setFilterStatus([]); setSearch(""); }}
              className="text-[11px] text-red-500 hover:text-red-700 font-medium">Clear</button>
          ) : null}
        </div>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        {(() => {
          const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
          const safePage   = Math.min(page, totalPages);
          const paginated  = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

          const pageNums = (() => {
            if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
            if (safePage <= 4)               return [1,2,3,4,5,"…",totalPages];
            if (safePage >= totalPages - 3)  return [1,"…",totalPages-4,totalPages-3,totalPages-2,totalPages-1,totalPages];
            return [1,"…",safePage-1,safePage,safePage+1,"…",totalPages];
          })();

          const tdBase = "px-4 py-3 text-[13px] text-slate-700 border-b border-r border-slate-200 align-middle";

          return (
          <div className="flex-1 overflow-y-auto px-5 pt-4 pb-5 min-h-0 flex flex-col gap-3">
            <div className="bg-white rounded border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 min-w-[820px]">
                  <thead>
                    <tr>
                      <TH ch="Order No"    sticky="left" />
                      <TH ch="Order Type" />
                      <TH ch="Status" />
                      <TH ch="Vendor Name" />
                      <TH ch="Subject" />
                      <TH ch="Prepared In" />
                      <TH ch="Order Value" right />
                      <TH ch="Order Date" />
                      <TH ch="Entry By" />
                      <TH ch="Actions"     sticky="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={10} className="px-4 py-16 text-center text-[13px] text-slate-400">Loading…</td></tr>
                    ) : paginated.length === 0 ? (
                      <tr><td colSpan={10} className="px-4 py-16 text-center text-[13px] text-slate-400">No records found</td></tr>
                    ) : paginated.map(r => (
                      <tr key={r.id} className="group hover:bg-slate-50 transition-colors">
                        <td className={`${tdBase} sticky left-0 z-[10] bg-white group-hover:bg-slate-50 whitespace-nowrap`}>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => r.pdf_url ? window.open(r.pdf_url, "_blank") : setToast("No attachment for this order")}
                              className="text-[13px] font-medium text-indigo-600 hover:underline text-left whitespace-nowrap">
                              {r.order_no}
                            </button>
                            <button onClick={() => { navigator.clipboard.writeText(r.order_no); setToast("Order No copied"); }}
                              title="Copy Order No" className="p-1 rounded hover:bg-slate-100 transition-colors shrink-0">
                              <Copy size={12} className="text-slate-400" />
                            </button>
                          </div>
                        </td>
                        <td className={`${tdBase} whitespace-nowrap`}>
                          {r.order_type ? <span className="text-slate-700">{r.order_type}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className={`${tdBase} whitespace-nowrap`}>{r.status || <span className="text-slate-300">—</span>}</td>
                        <td className={`${tdBase} whitespace-nowrap`}>{r.vendor_name || <span className="text-slate-300">—</span>}</td>
                        <td className={`${tdBase} min-w-[280px] max-w-[480px] whitespace-normal break-words text-slate-500`}>{r.subject || <span className="text-slate-300">—</span>}</td>
                        <td className={`${tdBase} whitespace-nowrap`}>{r.prepared_in || <span className="text-slate-300">—</span>}</td>
                        <td className={`${tdBase} text-right font-medium whitespace-nowrap`}>{r.order_value != null ? `₹${fmt(r.order_value)}` : <span className="text-slate-300 font-normal">—</span>}</td>
                        <td className={`${tdBase} whitespace-nowrap`}>{fmtDate(r.order_date)}</td>
                        <td className={`${tdBase} text-slate-500 whitespace-nowrap`}>{r.entry_by}</td>
                        <td className={`${tdBase} sticky right-0 z-[10] bg-white group-hover:bg-slate-50`}>
                          <div className="flex items-center gap-1">
                            {canEdit   && <button onClick={() => { setEditRec(r); setFormOpen(true); }} title="Edit"   className="p-1.5 rounded hover:bg-slate-100 transition-colors"><Pencil  size={14} className="text-slate-500" /></button>}
                            {canDelete && <button onClick={() => setDelId(r.id)}                       title="Delete" className="p-1.5 rounded hover:bg-red-50   transition-colors"><Trash2  size={14} className="text-red-400"   /></button>}
                            <button onClick={() => setLogRec(r)} title="Log" className="p-1.5 rounded hover:bg-violet-50 transition-colors"><ScrollText size={14} className="text-violet-500" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Pagination ── */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-white">
                <span className="text-[13px] text-slate-500 min-w-[140px]">
                  {filtered.length === 0 ? "0 items" : `${(safePage-1)*pageSize+1}-${Math.min(safePage*pageSize,filtered.length)} of ${filtered.length} items`}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(1)} disabled={safePage===1}
                    className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-[14px] font-medium">«</button>
                  <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={safePage===1}
                    className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-[14px]">‹</button>
                  {pageNums.map((n,i) => n === "…"
                    ? <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-slate-400 text-[13px]">...</span>
                    : <button key={n} onClick={() => setPage(n)}
                        className={`w-8 h-8 flex items-center justify-center rounded text-[13px] font-medium transition-colors
                          ${n === safePage ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{n}</button>
                  )}
                  <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={safePage===totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-[14px]">›</button>
                  <button onClick={() => setPage(totalPages)} disabled={safePage===totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-[14px] font-medium">»</button>
                </div>
                <div className="flex items-center gap-2 min-w-[140px] justify-end">
                  <div className="relative">
                    <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                      className="h-8 pl-3 pr-8 rounded border border-slate-200 text-[13px] text-slate-600 bg-white outline-none cursor-pointer appearance-none">
                      {[10,20,30,40,50].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 text-center">
              Bulk upload columns: <b>Order No</b> · <b>Order Type</b> · <b>Entity Code</b> · <b>Site Code</b> · <b>Vendor Name</b> · <b>Subject</b> · <b>Status</b> · <b>Order Value</b> · <b>Order Date</b> · <b>Prepared In</b>
            </p>
          </div>
          );
        })()}
      </>)}

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      {delId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-7 w-80 shadow-2xl">
            <p className="font-bold text-slate-800 mb-2">Delete Record?</p>
            <p className="text-sm text-slate-500 mb-6">This will permanently delete the record and its attached PDF.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDelId(null)} className="h-8 px-4 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="h-8 px-4 rounded bg-red-600 border border-red-700 text-xs font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-60">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {formOpen && <FormModal record={editRec} sites={sites} entities={entities} onClose={() => { setFormOpen(false); setEditRec(null); }} onSave={rec => { handleSave(rec, !!editRec); fetchDropdowns(); }} />}
      {logRec   && <LogModal record={logRec} onClose={() => setLogRec(null)} />}
      {toast    && <Toast msg={toast} onDone={() => setToast("")} />}
    </div>
  );
}
