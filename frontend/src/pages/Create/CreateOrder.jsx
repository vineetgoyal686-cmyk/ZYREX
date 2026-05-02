import React, { useState, useEffect, useMemo, useRef } from "react";
import { Plus, X, Upload, Save, FileText, ChevronDown, ChevronRight, Check, Building2, MapPin, Truck, Landmark, ShieldCheck, FilePlus, Eye, Loader2, Pencil, Trash2, Download, FileDown, Rocket, Undo2, Ban, CheckCircle2, RotateCcw, XCircle, Search, FileSpreadsheet, Copy, ShoppingCart, IndianRupee, Hammer, ShoppingBag, Box, CalendarDays, User, Tag } from "lucide-react";
import * as XLSX from "xlsx";
import { FullSiteModal, FullCompanyModal, FullVendorModal, FullViewSiteModal, FullViewCompanyModal, FullViewVendorModal, FullContactModal, FullViewContactModal, FullClauseModal } from "./FullMasterModals";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import ViewOrder, { preloadOrderDetails, seedOrderDetails } from "../Procurement/ViewOrder";

const QUILL_MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ indent: '-1' }, { indent: '+1' }],
    [{ align: [] }],
    ['clean']
  ]
};

const SCROLLBAR_STYLE = `
  .premium-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
  .premium-scroll::-webkit-scrollbar-track { background: transparent; }
  .premium-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; transition: all 0.2s; }
  .premium-scroll::-webkit-scrollbar-thumb:hover { background: #6366f1; }
  .table-fixed-header th { position: sticky; top: 0; z-index: 10; }
`;

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
let cachedOrders = null;
const normalizeRichTextHtml = (value) =>
  typeof value === "string"
    ? value.replace(/&nbsp;|&#160;|\u00A0/g, " ")
    : value;

const normalizeRichTextArray = (value) =>
  Array.isArray(value) ? value.map(normalizeRichTextHtml) : [];

/* Strip Quill v2 internal markers (.ql-ui spans, data-list attrs) so HTML
   renders as a standard <ol>/<ul> list that native CSS can number/bullet */
const cleanQuillHTML = (html) => {
  if (!html) return "";
  return html
    .replace(/<span class="ql-ui"><\/span>/gi, "")
    .replace(/<span class="ql-ui"\/>/gi, "")
    .replace(/\s*data-list="[^"]*"/gi, "");
};

/* Get single clean HTML string from a points array (Quill v2 or legacy format) */
const getCleanHTML = (points) => {
  if (!points || !points.length) return "";
  if (points.length === 1 && points[0].includes('<')) return cleanQuillHTML(normalizeRichTextHtml(points[0]));
  return `<ol>${points.map(p => `<li>${normalizeRichTextHtml(p)}</li>`).join('')}</ol>`;
};

const stripHtml = (html) => {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/* ── helper: INR to Words ── */
const amountToWords = (amount) => {
  if (!amount || isNaN(amount) || amount === 0) return "Zero Rupees Only";
  const a = ["", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ", "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const numToWords = (n) => {
    let numStr = n.toString();
    if (numStr.length > 9) return "Overflow";
    const nArray = ("000000000" + numStr).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!nArray) return "";
    let str = "";
    str += nArray[1] != 0 ? (a[Number(nArray[1])] || b[nArray[1][0]] + " " + a[nArray[1][1]]) + "Crore " : "";
    str += nArray[2] != 0 ? (a[Number(nArray[2])] || b[nArray[2][0]] + " " + a[nArray[2][1]]) + "Lakh " : "";
    str += nArray[3] != 0 ? (a[Number(nArray[3])] || b[nArray[3][0]] + " " + a[nArray[3][1]]) + "Thousand " : "";
    str += nArray[4] != 0 ? (a[Number(nArray[4])] || b[nArray[4][0]] + " " + a[nArray[4][1]]) + "Hundred " : "";
    str += nArray[5] != 0 ? ((str != "") ? "and " : "") + (a[Number(nArray[5])] || b[nArray[5][0]] + " " + a[nArray[5][1]]) : "";
    return str.trim();
  };
  const parts = Number(amount).toFixed(2).split(".");
  const rs = parseInt(parts[0], 10);
  const ps = parseInt(parts[1], 10);
  let res = numToWords(rs) + " Rupees";
  if (ps > 0) res += " and " + numToWords(ps) + " Paise";
  return res + " Only";
};

const Input = ({ label, value, onChange, placeholder, type = "text", required, mono, span2, readOnly, className }) => (
  <div className={span2 ? "col-span-2" : ""}>
    {label && <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{label} {required && <span className="text-red-400 normal-case">*</span>}</label>}
    <input type={type} value={value || ""} onChange={onChange} placeholder={placeholder} readOnly={readOnly}
      className={`w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 ${readOnly ? "bg-slate-50 text-slate-500 font-medium cursor-not-allowed" : "bg-white text-slate-800 shadow-sm"} ${mono ? "font-mono" : ""} ${className}`} />
  </div>
);

const SpecViewModal = ({ html, onClose, onEdit }) => (
  <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Eye size={14} className="text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-700">Description</h3>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Full View</p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-rose-500 transition-colors bg-white rounded-md p-1 border border-slate-200"><X size={16} /></button>
      </div>
      <div className="p-5 overflow-y-auto overflow-x-hidden flex-1 premium-scroll">
        <div className="quill-content text-sm text-slate-700 leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: html || '' }} />
      </div>
      <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 shrink-0">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors">Close</button>
        <button onClick={onEdit} className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-md shadow-indigo-200">
          <Pencil size={13} /> Edit
        </button>
      </div>
    </div>
  </div>
);

const InlineSelect = ({ value, onChange, options, placeholder, className, disabled, onAdd, addLabel, onEdit, onView, renderHtml, searchable, minDropWidth }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [search, setSearch] = useState("");
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (searchable && searchRef.current) setTimeout(() => searchRef.current?.focus(), 50);
    const handleScroll = (e) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [open]);

  const openDropdown = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const dropW = Math.max(rect.width, minDropWidth ?? 220);
      const left = rect.left + dropW > window.innerWidth - 8 ? window.innerWidth - dropW - 8 : rect.left;
      setPos({ top: rect.bottom + 4, left, width: dropW });
    }
    setSearch("");
    setOpen(true);
  };

  const label = options.find(o => o.id === value || o === value);
  const displayLabel = typeof label === "string" ? label : (label?.materialName || label?.itemCode || label?.name || value || "");

  const filteredOptions = searchable && search.trim()
    ? options.filter(o => {
      const lbl = typeof o === "string" ? o : (o.materialName || o.itemCode || o.name || "");
      return lbl.toLowerCase().includes(search.toLowerCase());
    })
    : options;

  return (
    <div className="relative w-full group/inlsel" ref={triggerRef}>
      <div onClick={openDropdown}
        className={`w-full min-h-[30px] px-2 py-1.5 rounded-md text-xs cursor-pointer border flex items-center gap-1.5 transition-all
          ${disabled ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-100" : "bg-white border-slate-200 hover:border-indigo-300"}
          ${open ? "border-indigo-400 ring-1 ring-indigo-200" : ""} ${className}`}>
        <span className={`flex-1 text-xs leading-snug whitespace-normal break-words ${!value ? "text-slate-300 italic" : "text-slate-800 font-medium font-inter"}`}>
          {renderHtml && value ? (
            <div className="quill-content quill-compact" dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(displayLabel) }} />
          ) : (
            displayLabel || placeholder
          )}
        </span>
        {onView && value && (
          <button
            onClick={(e) => { e.stopPropagation(); onView(value); }}
            className="opacity-0 group-hover/inlsel:opacity-100 shrink-0 p-0.5 rounded text-slate-300 hover:text-indigo-500 transition-all"
            title="View full spec">
            <Eye size={12} />
          </button>
        )}
        <ChevronDown size={10} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180 text-indigo-500" : ""}`} />
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setOpen(false)} />
          <div ref={dropdownRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 1000 }}
            className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-100">{placeholder}</div>
            {searchable && (
              <div className="px-2 py-1.5 border-b border-slate-100">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  placeholder="Search..."
                  className="w-full text-xs border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-indigo-400 placeholder:text-slate-300"
                />
              </div>
            )}
            <div className="overflow-y-auto max-h-48 premium-scroll">
              {filteredOptions.length === 0
                ? <div className="px-3 py-3 text-center text-xs text-slate-400 italic">No options</div>
                : filteredOptions.map((opt, i) => {
                  const id = typeof opt === "string" ? opt : opt.id;
                  const lbl = typeof opt === "string" ? opt : (opt.materialName || opt.itemCode || opt.name || "");
                  const isSel = value === id;
                  return (
                    <div key={i} className={`flex items-center group/opt border-b border-slate-50 last:border-0 ${isSel ? "bg-indigo-50" : "hover:bg-indigo-50"}`}>
                      <div onClick={(e) => { e.stopPropagation(); onChange({ target: { value: id } }); setOpen(false); setSearch(""); }}
                        className={`flex-1 px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition-colors
                            ${isSel ? "text-indigo-700 font-semibold" : "text-slate-700"}`}>
                        {renderHtml ? (
                          <div className="whitespace-normal break-words leading-tight quill-content quill-compact" dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(lbl) }} />
                        ) : (
                          <span className="whitespace-normal break-words leading-tight">{lbl}</span>
                        )}
                        {isSel && <Check size={11} className="text-indigo-600 shrink-0 ml-2" strokeWidth={3} />}
                      </div>
                      {onEdit && (
                        <button onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(id); }}
                          className="p-2 opacity-0 group-hover/opt:opacity-100 text-slate-400 hover:text-indigo-600 transition-all">
                          <Pencil size={11} />
                        </button>
                      )}
                    </div>
                  );
                })
              }
            </div>
            {onAdd && (
              <div onClick={(e) => { e.stopPropagation(); const t = search; setOpen(false); setSearch(""); onAdd(t); }}
                className={`border-t border-slate-100 font-medium text-[10px] px-3 py-2 text-center transition-colors flex items-center justify-center gap-1.5 uppercase tracking-wide
                  ${search.trim() ? "bg-indigo-50/50 hover:bg-indigo-100 text-indigo-600 cursor-pointer" : "bg-slate-50 text-slate-300 cursor-default"}`}>
                <Plus size={12} strokeWidth={3} />
                {search.trim() ? `${addLabel || "Add"} "${search.trim()}"` : (addLabel || "Add")}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const Select = ({ label, value, onChange, options, valueKey = "id", labelKey = "name", subLabelKey, placeholder, required, span2, onAdd, addLabel, onView, isMulti, disabled }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutside = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const selectedOptions = isMulti
    ? options.filter(o => (value || []).includes(o[valueKey]))
    : options.filter(o => o[valueKey] === value);

  const filteredOptions = options.filter(o => {
    const text = (o[labelKey] || "").toLowerCase() + " " + (subLabelKey ? (o[subLabelKey] || "").toLowerCase() : "");
    return text.includes(search.toLowerCase());
  });

  const handleToggle = (id) => {
    if (isMulti) {
      const current = Array.isArray(value) ? value : [];
      const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
      onChange({ target: { value: next } });
    } else {
      onChange({ target: { value: id } });
      setOpen(false);
      setSearch("");
    }
  };

  return (
    <div className={`relative ${span2 ? "col-span-2" : ""}`} ref={containerRef}>
      <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
        {label} {required && <span className="text-red-400 normal-case">*</span>}
      </label>
      <div
        onClick={() => !disabled && setOpen(!open)}
        className={`w-full border rounded-xl px-3 py-2 text-sm outline-none transition-all flex justify-between items-center min-h-[42px]
          ${disabled ? "bg-slate-50 border-slate-100 cursor-not-allowed opacity-60" : "bg-white cursor-pointer border-slate-200 hover:border-slate-300"}
          ${open ? "border-indigo-400 ring-2 ring-indigo-50" : ""}`}
      >
        <div className="flex flex-wrap gap-1.5 py-1 flex-1 min-w-0">
          {selectedOptions.length > 0 ? (
            selectedOptions.map(o => (
              <span key={o[valueKey]} className={`${isMulti ? "bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 max-w-full" : "text-slate-700 truncate"}`}>
                <span className="truncate">{o[labelKey]}</span>
                {isMulti && !disabled && (
                  <X size={10} className="hover:text-red-500 cursor-pointer shrink-0" onClick={(e) => { e.stopPropagation(); handleToggle(o[valueKey]); }} />
                )}
              </span>
            ))
          ) : (
            <span className='text-slate-400 italic'>{placeholder || 'Select...'}</span>
          )}
        </div>
        {!disabled && <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : "ml-2"}`} />}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden min-w-[240px]">
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <input type="text" autoFocus value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
              placeholder="Search here..." />
          </div>
          <div className="overflow-y-auto max-h-56 w-full p-1 scrollbar-thin">
            {!required && !isMulti && (
              <div onClick={() => { onChange({ target: { value: "" } }); setOpen(false); setSearch(""); }}
                className={`px-3 py-2 text-sm cursor-pointer rounded-lg hover:bg-slate-50 transition-colors ${!value ? "text-slate-400 font-bold" : "text-slate-400"}`}>
                {placeholder || 'Clear Selection'}
              </div>
            )}
            {filteredOptions.length > 0 && <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-50 mb-1">{filteredOptions.length} results found</div>}
            {filteredOptions.map(o => {
              const isSelected = isMulti ? (value || []).includes(o[valueKey]) : value === o[valueKey];
              return (
                <div key={o[valueKey]}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer rounded-lg hover:bg-indigo-50 transition-colors group ${isSelected ? "bg-indigo-50" : ""}`}>
                  <div className="flex-1 min-w-0" onClick={() => handleToggle(o[valueKey])}>
                    <p className={`text-sm truncate ${isSelected ? "text-indigo-700 font-bold" : "text-slate-700 font-semibold"}`}>{o[labelKey]}</p>
                    {subLabelKey && o[subLabelKey] && <p className="text-[11px] text-slate-500 truncate">{o[subLabelKey]}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    {onView && (
                      <button onClick={(e) => { e.stopPropagation(); setOpen(false); onView(o); }} className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors shrink-0">
                        <Eye size={14} />
                      </button>
                    )}
                    {isMulti && isSelected && <Check size={14} className="text-indigo-600" />}
                  </div>
                </div>
              );
            })}
            {filteredOptions.length === 0 && <div className="px-3 py-4 text-center text-xs text-slate-400">No results found</div>}
          </div>
          {onAdd && (
            <div onClick={() => { setOpen(false); onAdd(); }}
              className="bg-indigo-50/50 hover:bg-indigo-100 text-indigo-600 border-t border-slate-100 font-medium text-sm px-3 py-3 text-center cursor-pointer transition-colors flex items-center justify-center gap-1.5">
              <Plus size={14} /> {addLabel || "Add New"}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DocUpload = ({ label, file, onChange, required }) => (
  <div>
    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
      {label} {required && <span className="text-red-400 normal-case">*</span>}
    </label>
    <label className={`w-full flex items-center justify-between border rounded-xl px-3 py-2.5 text-sm cursor-pointer transition-all
      ${file ? "border-green-200 bg-green-50/50" : "border-slate-200 hover:border-indigo-300"}`}>
      <div className="flex items-center gap-2 truncate">
        <FileText size={15} className={file ? "text-green-500" : "text-slate-400"} />
        <span className={`truncate ${file ? "text-green-700 font-medium" : "text-slate-400"}`}>
          {file ? file.name : "Choose file..."}
        </span>
      </div>
      {file && <Check size={14} className="text-green-500 shrink-0" />}
      <input type="file" accept=".pdf,.doc,.docx,.jpg,.png" className="hidden" onChange={onChange} />
    </label>
  </div>
);

const MultiDocUpload = ({ label, files, onAdd, onRemove, onPreview, max = 6, required }) => (
  <div className="space-y-2">
    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
      {label} {required && <span className="text-red-400 normal-case">*</span>}
      {files.length > 0 && <span className="ml-2 text-indigo-500 lowercase">({files.length}/{max})</span>}
    </label>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {files.map((f, i) => (
        <div key={i} className="flex items-center justify-between bg-white border border-emerald-100 rounded-xl px-3 py-2 shadow-sm animate-in fade-in slide-in-from-left-2 transition-all">
          <div
            className={`flex items-center gap-2 min-w-0 ${onPreview ? 'cursor-pointer hover:opacity-80' : ''}`}
            onClick={() => onPreview && onPreview(f)}
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <FileText size={14} className="text-emerald-500" />
            </div>
            <span className={`text-xs font-medium text-slate-700 truncate ${onPreview ? 'hover:text-emerald-600 hover:underline' : ''}`}>{f.name}</span>
          </div>
          <button onClick={() => onRemove(i)} className="p-1 hover:text-red-500 text-slate-400 transition-colors">
            <X size={14} />
          </button>
        </div>
      ))}
      {files.length < max && (
        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-xl p-2.5 cursor-pointer transition-all text-slate-400 hover:text-indigo-600 group">
          <Plus size={16} className="group-hover:scale-110 transition-transform" />
          <span className="text-xs font-semibold uppercase tracking-wider">Add Document</span>
          <input type="file" className="hidden" multiple={false} onChange={onAdd} />
        </label>
      )}
    </div>
  </div>
);


function makeSubRow() {
  return { id: Date.now() + Math.random(), specification: "", modelNumber: "", make: "", hideModel: false, hideBrand: false, qty: 0, unitRate: 0, discountPct: 0, taxPct: 18, grossAmount: 0, discountAmount: 0, baseAmount: 0, gstAmount: 0, totalAmount: 0, remarks: "" };
}
function makeGroup() {
  return { id: Date.now(), itemId: "", unit: "", subRows: [makeSubRow()] };
}

function OrderForm({ project, onCancel, editOrderId, onEditComplete }) {
  const user = JSON.parse(localStorage.getItem("bms_user") || "{}");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [actionModal, setActionModal] = useState({ type: null, data: null });
  const [customInputModal, setCustomInputModal] = useState({ open: false, type: "", groupId: "", subId: "", itemId: "", text: "", originalValue: "" });
  const [specViewModal, setSpecViewModal] = useState({ open: false, html: '', onEdit: null });
  const [uomModal, setUomModal] = useState({ open: false, gid: null, name: "", code: "", saving: false });

  // Master Data
  const [sites, setSites] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [uomList, setUomList] = useState([]);

  // Auto-select site based on project prop
  useEffect(() => {
    if (project && sites.length > 0) {
      const match = sites.find(s => s.siteCode === project);
      if (match) {
        setHeader(h => ({ ...h, siteId: match.id }));
        setSiteDetails(match || null);
      }
    }
  }, [project, sites]);

  // Form State - Header
  const [header, setHeader] = useState({
    orderType: "Supply", orderNumber: "", refNumber: "", subject: "", orderName: "",
    siteId: "", companyId: "", vendorId: "", contactPersonIds: [],
    requestBy: "", madeBy: user.name || "", priority: "Medium", deliveryDate: "",
    creationDate: new Date().toISOString().split('T')[0],
    notes: ""
  });
  const [nextSerial, setNextSerial] = useState(1);

  // Read-only populated details
  const [siteDetails, setSiteDetails] = useState(null);
  const [companyDetails, setCompanyDetails] = useState(null);
  const [vendorDetails, setVendorDetails] = useState(null);

  // Form State - Items Table (grouped: each group = one item, multiple spec sub-rows)
  const [items, setItems] = useState([makeGroup()]);

  // Settings / Toggles
  const [settings, setSettings] = useState({
    model: false, brand: true, remarks: false,
    tax: true,
    discountMode: 'none',
    frightMode: 'none'
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPos, setSettingsPos] = useState({ top: 0, right: 0 });
  const settingsBtnRef = useRef(null);
  const [transactionDiscount, setTransactionDiscount] = useState(0);
  const [transactionTax, setTransactionTax] = useState(18);
  const [frightCharges, setFrightCharges] = useState(0);
  const [frightTax, setFrightTax] = useState(18);

  // Form State - Clauses
  const [tcPoints, setTcPoints] = useState([]);
  const [payPoints, setPayPoints] = useState([]);
  const [govPoints, setGovPoints] = useState([]);
  const [anxPoints, setAnxPoints] = useState([]);
  const [showAnnexure, setShowAnnexure] = useState(false);

  // Documents
  const [files, setFiles] = useState({
    quotations: [],
    proof: { type: "", files: [] },
    others: []
  });

  const [docPreviewUrl, setDocPreviewUrl] = useState(null);
  const handlePreviewDoc = (f) => {
    if (f.url) {
      setDocPreviewUrl(f.url);
    } else if (f instanceof File) {
      setDocPreviewUrl(URL.createObjectURL(f));
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchMasterData();
      if (editOrderId) fetchOrderForEdit();
    };
    init();
  }, [editOrderId]);

  const fetchOrderForEdit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/orders/${editOrderId}`);
      const { order, items: rawItems } = await res.json();

      // 1. Map Header
      setHeader({
        orderType: order.order_type,
        orderNumber: order.order_number,
        refNumber: order.ref_number,
        subject: order.subject,
        orderName: order.order_name,
        siteId: order.site_id,
        companyId: order.company_id,
        vendorId: order.vendor_id,
        contactPersonIds: (order.snapshot?.contacts && order.snapshot.contacts.length > 0)
          ? order.snapshot.contacts.map(c => c.id)
          : [order.contact_person_id].filter(Boolean),
        requestBy: order.request_by,
        madeBy: order.made_by,
        priority: order.priority,
        deliveryDate: order.delivery_date ? order.delivery_date.split('T')[0] : "",
        creationDate: order.date_of_creation ? order.date_of_creation.split('T')[0] : "",
        notes: normalizeRichTextHtml(order.notes || "")
      });

      setTcPoints(normalizeRichTextArray(order.terms_conditions));
      setPayPoints(normalizeRichTextArray(order.payment_terms));
      setGovPoints(normalizeRichTextArray(order.governing_laws));
      setAnxPoints(normalizeRichTextArray(order.annexures));

      // Map Existing Files
      const existingQuotations = [];
      if (order.quotation_url) {
        existingQuotations.push({
          name: order.quotation_url.split('/').pop().split('?')[0].replace(/^quotation_\d+_/, '') || "Existing Quotation",
          url: order.quotation_url,
          isExisting: true
        });
      }

      const existingProof = [];
      if (order.comparative_sheet_url) {
        existingProof.push({
          name: order.comparative_sheet_url.split('/').pop().split('?')[0].replace(/^comparative_\d+_/, '') || "Existing Comparative",
          url: order.comparative_sheet_url,
          isExisting: true
        });
      }

      setFiles({
        quotations: existingQuotations,
        proof: {
          type: order.comparative_sheet_url ? "Comparative Docs" : "",
          files: existingProof
        },
        others: []
      });

      // 2. Map Settings & Totals
      const t = order.totals || {};
      setSettings(s => ({
        ...s,
        tax: t.tax_mode === "line",
        discountMode: t.discount_mode || "none",
        frightMode: t.fright_mode || "none",
        brand: t.showBrand ?? s.brand,
        model: t.showModel ?? s.model,
        remarks: t.showRemarks ?? s.remarks
      }));
      setTransactionDiscount(t.txDiscountPct ?? 0);
      setTransactionTax(t.txTaxPct ?? 18);
      setFrightCharges(t.frightCharges ?? 0);
      setFrightTax(t.frightTax ?? 18);

      // 3. Map Items (Flat to Grouped)
      const grouped = [];
      rawItems.forEach(it => {
        let g = grouped.find(x => x.itemId === it.item_id);
        if (!g) {
          g = { id: Math.random(), itemId: it.item_id, unit: it.unit, subRows: [] };
          grouped.push(g);
        }
        const q = Number(it.qty) || 0;
        const r = Number(it.unit_rate) || 0;
        const tax = Number(it.tax_pct) || 0;
        const dPct = Number(it.discount_pct) || 0;
        const gross = q * r;
        const dAmt = gross * dPct / 100;
        const base = gross - dAmt;
        const gst = base * tax / 100;

        g.subRows.push({
          id: Math.random(),
          specification: it.description,
          modelNumber: it.model_number || "",
          make: it.make || "",
          hideModel: false,
          hideBrand: false,
          qty: q,
          unitRate: r,
          discountPct: dPct,
          taxPct: tax,
          grossAmount: gross,
          discountAmount: dAmt,
          baseAmount: base,
          gstAmount: gst,
          totalAmount: Number(it.amount) || (base + gst),
          remarks: it.remarks
        });
      });
      if (grouped.length > 0) setItems(grouped);

    } catch (err) {
      console.error(err);
      showToast("Failed to load order for editing", "error");
    }
    setLoading(false);
  };

  const fetchMasterData = async () => {
    // setLoading is handled by caller or kept here for fresh loads
    try {
      const [sRes, cRes, vRes, coRes, iRes, clRes] = await Promise.all([
        fetch(`${API}/api/procurement/sites`),
        fetch(`${API}/api/procurement/companies`),
        fetch(`${API}/api/procurement/vendors`),
        fetch(`${API}/api/procurement/contacts`),
        fetch(`${API}/api/procurement/items`),
        fetch(`${API}/api/procurement/clauses`)
      ]);
      const s = await sRes.json(); setSites(s.sites || []);
      const c = await cRes.json(); setCompanies(c.companies || []);
      const v = await vRes.json(); setVendors(v.vendors || []);
      const co = await coRes.json(); setContacts(co.contacts || []);
      const i = await iRes.json(); setItemsList(i.items || []);
      const cl = await clRes.json(); setClauses(cl.clauses || []);
      const uomRes = await fetch(`${API}/api/procurement/uom`);
      const uomData = await uomRes.json(); setUomList(uomData.uoms || []);
    } catch {
      showToast("Failed to load master data.", "error");
    }
  };

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // Dynamic Order Numbering Logic
  const computedOrderNumber = useMemo(() => {
    // If order number already exists and is properly formatted (edit mode or already fetched), use it
    if (header.orderNumber && header.orderNumber.includes('/')) return header.orderNumber;

    // During creation: Show Draft Pattern
    if (!header.siteId || !header.companyId || !header.orderType) return "Draft/Comp/Site/Type";

    const c = companies.find(x => x.id === header.companyId);
    const s = sites.find(x => x.id === header.siteId);
    const type = header.orderType === "Supply" ? "PO" : "WO";

    return `${c?.companyCode || "COMP"} / ${s?.siteCode || "SITE"} / ${type}`;
  }, [header.orderNumber, header.siteId, header.companyId, header.orderType, companies, sites]);


  // Reset items + brand setting when order type changes
  useEffect(() => {
    setItems([makeGroup()]);
    // Default brand to true for Supply, but allow user settings to override if they already toggled it
    setSettings(s => ({ ...s, brand: header.orderType === "Supply" }));
  }, [header.orderType]);

  // Recalculate all rows when discount mode changes so amounts update instantly
  useEffect(() => {
    setItems(prev => prev.map(g => ({
      ...g,
      subRows: g.subRows.map(s => {
        const q = Number(s.qty) || 0;
        const r = Number(s.unitRate) || 0;
        const d = settings.discountMode === "line" ? (Number(s.discountPct) || 0) : 0;
        const t = Number(s.taxPct) || 0;
        const gross = q * r;
        const discAmt = gross * d / 100;
        const base = gross - discAmt;
        const gst = base * (t / 100);
        return { ...s, grossAmount: gross, discountAmount: discAmt, baseAmount: base, gstAmount: gst, totalAmount: base + gst };
      })
    })));
  }, [settings.discountMode]);

  // Generate Order Number
  useEffect(() => {
    // Only fetch official serial numbers if the order has been issued or is being ready-for-issue?
    // User requested: "year and number issued me ayega"
    // So we skip pre-fetching the real serial here for new/draft orders.
    if (!editOrderId) {
      setHeader(h => ({ ...h, orderNumber: "" }));
      return;
    }
  }, [header.siteId, header.companyId, header.orderType, companies, editOrderId]);

  // Handle master selection changes
  const handleSiteChange = (e) => {
    const id = e.target.value;
    setHeader(h => ({ ...h, siteId: id }));
    setSiteDetails(sites.find(s => s.id === id) || null);
  };
  const handleCompanyChange = (e) => {
    const id = e.target.value;
    setHeader(h => ({ ...h, companyId: id }));
    setCompanyDetails(companies.find(c => c.id === id) || null);
  };
  const handleVendorChange = (e) => {
    const id = e.target.value;
    setHeader(h => ({ ...h, vendorId: id }));
    setVendorDetails(vendors.find(v => v.id === id) || null);
  };

  // Items handling
  const recalcSubRow = (s) => {
    const q = Number(s.qty) || 0;
    const r = Number(s.unitRate) || 0;
    const d = settings.discountMode === "line" ? (Number(s.discountPct) || 0) : 0;
    const t = Number(s.taxPct) || 0;
    const gross = q * r;
    const discAmt = gross * d / 100;
    const base = gross - discAmt;
    const gst = base * (t / 100);
    return { ...s, grossAmount: gross, discountAmount: discAmt, baseAmount: base, gstAmount: gst, totalAmount: base + gst };
  };

  const addItem = () => setItems(prev => [...prev, makeGroup()]);

  const removeGroup = (gid) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter(g => g.id !== gid));
  };

  const addSubRow = (gid) => {
    setItems(prev => prev.map(g => g.id !== gid ? g : { ...g, subRows: [...g.subRows, makeSubRow()] }));
  };

  const removeSubRow = (gid, sid) => {
    setItems(prev => prev.map(g => {
      if (g.id !== gid) return g;
      if (g.subRows.length === 1) return g;
      return { ...g, subRows: g.subRows.filter(s => s.id !== sid) };
    }));
  };

  const handleGroupChange = (gid, val) => {
    setItems(prev => prev.map(g => {
      if (g.id !== gid) return g;
      const found = itemsList.find(i => i.id === val);
      return {
        ...g, itemId: val, unit: found?.unit || "",
        subRows: g.subRows.map(s => ({
          ...s, specification: "", make: "", modelNumber: "", hideModel: false, hideBrand: false
        }))
      };
    }));
  };

  const handleSubRowChange = (gid, sid, key, val) => {
    setItems(prev => prev.map(g => {
      if (g.id !== gid) return g;
      return {
        ...g, subRows: g.subRows.map(s => {
          if (s.id !== sid) return s;
          const updated = { ...s, [key]: val };
          // When spec changes, clear spec-specific fields so stale values don't carry over
          if (key === "specification") {
            updated.modelNumber = "";
            updated.make = "";
            updated.hideModel = false;
            updated.hideBrand = false;
          }
          return recalcSubRow(updated);
        })
      };
    }));
  };

  const handleAddCustomUnit = (gid, searchText) => {
    setUomModal({ open: true, gid, name: searchText || "", code: "", saving: false });
  };

  const submitUomModal = async () => {
    const { gid, name, code } = uomModal;
    if (!name.trim()) return;
    setUomModal(m => ({ ...m, saving: true }));
    try {
      const res = await fetch(`${API}/api/procurement/uom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uomName: name.trim(), uomCode: code.trim() || name.trim() }),
      });
      const data = await res.json();
      const newUnit = data.uom?.uomCode || data.uom?.uomName || code.trim() || name.trim();
      const refreshed = await fetch(`${API}/api/procurement/uom`);
      const refreshedData = await refreshed.json();
      setUomList(refreshedData.uoms || []);
      setItems(prev => prev.map(g => g.id !== gid ? g : { ...g, unit: newUnit }));
      setUomModal({ open: false, gid: null, name: "", code: "", saving: false });
    } catch {
      setUomModal(m => ({ ...m, saving: false }));
    }
  };

  const handleSaveCustomInput = async () => {
    const { type, groupId, subId, itemId, text, originalValue } = customInputModal;
    const isEffectivelyEmpty = !text || !text.trim() || text.trim() === '<p><br></p>' || text.trim() === '<p></p>';
    if (isEffectivelyEmpty) return setCustomInputModal({ open: false, text: "", type: "", groupId: "", subId: "", itemId: "", originalValue: "" });

    // 1. Update subrow immediately
    handleSubRowChange(groupId, subId, type, text.trim());
    setCustomInputModal({ open: false, text: "", type: "", groupId: "", subId: "", itemId: "", originalValue: "" });

    // 2. Map type to db field
    let field = "";
    if (type === "specification") field = "description";
    else if (type === "make") field = "make"; // brands

    if (!field) return;

    // 3. Make API call to append it to master item
    try {
      const isEdit = !!originalValue;
      const url = isEdit
        ? `${API}/api/procurement/items/${itemId}/update-array-item`
        : `${API}/api/procurement/items/${itemId}/append-array`;

      const body = isEdit
        ? { field, oldValue: originalValue, newValue: text.trim() }
        : { field, value: text.trim() };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success && data.updatedArray) {
        // Update local itemsList so the dropdown updates!
        setItemsList(prev => prev.map(i => {
          if (i.id === itemId) {
            const updated = { ...i };
            if (type === "specification") updated.specifications = data.updatedArray;
            if (type === "make") updated.brands = data.updatedArray;
            return updated;
          }
          return i;
        }));
        showToast(isEdit ? "Master item updated!" : "Added to master item options!", "success");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to save to master item, but applied to row", "error");
    }
  }; const updateSettingsAndClearData = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));

    // Clear data if toggling off
    if (val === false || val === 'none') {
      setItems(prevItems => prevItems.map(group => ({
        ...group,
        subRows: group.subRows.map(row => {
          const updated = { ...row };
          if (key === 'model') { updated.modelNumber = ""; updated.hideModel = false; }
          if (key === 'brand') { updated.make = ""; updated.hideBrand = false; }
          if (key === 'remarks') updated.remarks = "";
          if (key === 'discountMode' && val === 'none') {
            updated.discountPct = 0;
            updated.discountAmount = 0;
          }
          return recalcSubRow(updated);
        })
      })));

      if (key === 'discountMode' && val === 'none') setTransactionDiscount(0);
      if (key === 'frightMode' && val === 'none') setFrightCharges(0);
    }
  };

  // Totals Calculation (Atomic Source of Truth)
  const totals = useMemo(() => {
    let subtotal = 0;       // Sum of (Qty * Rate) before any discounts
    let lineDiscountSum = 0; // Sum of line-level discounts
    let itemGstSum = 0;      // Sum of GST from all line items

    const txPct = settings.discountMode === "total" ? (Number(transactionDiscount) || 0) : 0;

    // Calculate each row from scratch to ensure sync
    const processedItems = items.flatMap(g => g.subRows.map(s => {
      const q = Number(s.qty) || 0;
      const r = Number(s.unitRate) || 0;
      const tax = Number(s.taxPct) || 0;
      const dPct = settings.discountMode === "line" ? (Number(s.discountPct) || 0) : 0;

      const gross = q * r;
      const dAmt = gross * dPct / 100;
      const base = gross - dAmt;

      let rowGst = 0;
      if (settings.tax) {
        if (settings.discountMode === "total") {
          // Proportionate global discount applies before tax
          const discountedBase = gross * (1 - txPct / 100);
          rowGst = discountedBase * (tax / 100);
        } else {
          rowGst = base * (tax / 100);
        }
      }

      subtotal += gross;
      lineDiscountSum += dAmt;
      itemGstSum += rowGst;

      return { ...s, gross, dAmt, base, rowGst, total: base + rowGst };
    }));

    const txDiscountAmt = subtotal * txPct / 100;
    const totalDiscountAmt = settings.discountMode === "line" ? lineDiscountSum : txDiscountAmt;
    const itemsNet = subtotal - totalDiscountAmt;
    const fAmt = (Number(frightCharges) || 0);

    let finalGst = itemGstSum;
    let frightGst = 0;

    if (!settings.tax) {
      // Global Tax Mode
      let taxableBase = itemsNet;
      if (settings.frightMode === "before") taxableBase += fAmt;
      finalGst = taxableBase * (Number(transactionTax) / 100);
    } else {
      // Individual Tax Mode
      if (settings.frightMode === "before") {
        frightGst = fAmt * (Number(frightTax) / 100);
        finalGst += frightGst;
      }
    }

    let grandTotal = itemsNet + fAmt + finalGst;
    grandTotal = Math.round(grandTotal);

    return {
      subtotal,
      lineDiscountSum,
      txDiscountPct: txPct,
      txDiscountAmt,
      txTaxPct: Number(transactionTax) || 0,
      totalDiscountAmt,
      frightCharges: fAmt,
      frightTax: Number(frightTax) || 0,
      gst: finalGst,
      frightGst,
      grandTotal,
      words: amountToWords(grandTotal),
      processedItems // exported for table display sync
    };
  }, [items, settings, transactionDiscount, transactionTax, frightCharges, frightTax]);

  // Handle Save
  const handleSave = async (submitStatus) => {
    const finalOrderNumber = header.orderNumber || computedOrderNumber;

    // Validation Logic
    if (submitStatus !== "Draft") {
      if (!header.siteId || !header.companyId || !header.vendorId || !finalOrderNumber) {
        return showToast("Site, Company, Vendor and Order Number are required for submission.", "error");
      }
      if (!header.subject) {
        return showToast("Order Subject is required for submission.", "error");
      }
      if (files.quotations.length === 0) {
        return showToast("At least 1 Quotation Document is mandatory for submission.", "error");
      }
      if (!files.proof.type) {
        return showToast("Please select the Proof Type (Comparative or Mail) for submission.", "error");
      }
      if (files.proof.files.length === 0) {
        return showToast(`At least 1 ${files.proof.type} Document is mandatory for submission.`, "error");
      }
      if (items.some(g => !g.itemId) || items.some(g => g.subRows.some(s => s.qty <= 0))) {
        return showToast("All line items must have an item selected and Qty > 0 for submission.", "error");
      }
    }

    const currentSite = siteDetails || sites.find(s => s.id === header.siteId);
    const currentCompany = companyDetails || companies.find(c => c.id === header.companyId);

    const snapshot = {
      site: currentSite,
      company: currentCompany,
      vendor: vendorDetails || vendors.find(v => v.id === header.vendorId),
      contacts: contacts.filter(c => header.contactPersonIds.includes(c.id))
    };

    // Final consolidation with consolidated map
    const mappedMain = {
      order_type: header.orderType,
      order_number: finalOrderNumber,
      ref_number: header.refNumber || "",
      subject: header.subject || "",
      order_name: header.orderName || "",
      site_id: header.siteId || null,
      company_id: header.companyId || null,
      vendor_id: header.vendorId || null,
      contact_person_id: header.contactPersonIds?.[0] || null,
      request_by: header.requestBy || "",
      made_by: header.madeBy || "",
      priority: header.priority || "Medium",
      date_of_creation: header.creationDate || new Date().toISOString(),
      delivery_date: header.deliveryDate || null,
      terms_conditions: normalizeRichTextArray(tcPoints),
      payment_terms: normalizeRichTextArray(payPoints),
      governing_laws: normalizeRichTextArray(govPoints),
      annexures: normalizeRichTextArray(anxPoints),
      totals: {
        ...totals,
        tax_mode: settings.tax ? "line" : "total",
        fright_mode: settings.frightMode,
        discount_mode: settings.discountMode,
        showBrand: settings.brand,
        showModel: settings.model,
        showRemarks: settings.remarks
      },
      notes: normalizeRichTextHtml(header.notes || ""),
      created_by_id: user.id,
      status: submitStatus,
      snapshot: { ...snapshot, proof_type: files.proof.type, notes: normalizeRichTextHtml(header.notes || "") }
    };

    const mappedItems = items.flatMap(g => g.subRows.map(({ id, ...s }) => ({
      item_id: g.itemId || null,
      unit: g.unit || "",
      description: s.specification || "",
      model_number: settings.model && !s.hideModel ? (s.modelNumber || "") : "",
      make: settings.brand && !s.hideBrand ? (s.make || "") : "",
      qty: Number(s.qty) || 0,
      unit_rate: Number(s.unitRate) || 0,
      discount_pct: settings.discountMode === "line" ? (Number(s.discountPct) || 0) : 0,
      tax_pct: Number(s.taxPct) || 0,
      amount: Number(s.totalAmount) || 0,
      remarks: settings.remarks ? (s.remarks || "") : ""
    })));


    setSaving(true);
    try {
      const fd = new FormData();
      // Only append new files if they are actually File objects (not urls)
      files.quotations.forEach(f => { if (f instanceof File) fd.append("quotation", f); });
      files.proof.files.forEach(f => { if (f instanceof File) fd.append("comparative", f); });

      const payload = {
        mainData: mappedMain,
        items: mappedItems,
        nextSerial: editOrderId ? nextSerial : nextSerial // nextSerial update only for new orders usually
      };

      fd.append("data", JSON.stringify(payload));

      const url = editOrderId ? `${API}/api/orders/${editOrderId}` : `${API}/api/orders`;
      const method = editOrderId ? "PUT" : "POST";

      const res = await fetch(url, { method, body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Save failed");

      // Note: Approval initialization is now handled in the 'Review' stage transition
      // directly from the Order List to ensure the 'Draft -> Review -> Pending Issue' flow.

      showToast(`Order ${editOrderId ? 'updated' : 'saved'} successfully as ${submitStatus}!`);
      setTimeout(() => {
        if (onEditComplete) onEditComplete();
        onCancel();
      }, 1500);
    } catch (err) {
      showToast(err.message, "error");
    }
    setSaving(false);
  };

  // Helper to split Clause HTML into separate points
  const splitClauseToPoints = (html) => {
    if (!html) return [];

    const div = document.createElement("div");
    div.innerHTML = html;

    // Remove Quill v2 marker spans (.ql-ui) � these are empty marker-hosts
    // that only render content via CSS ::before in the editor context
    div.querySelectorAll(".ql-ui").forEach(el => el.remove());

    // Check if it's a list (ol/ul)
    const listItems = div.querySelectorAll("li");
    if (listItems.length > 0) {
      return Array.from(listItems).map(li => li.innerHTML.trim()).filter(x => x);
    }

    // Check if it has paragraphs
    const paragraphs = div.querySelectorAll("p");
    if (paragraphs.length > 0) {
      return Array.from(paragraphs).map(p => p.innerHTML.trim()).filter(x => x && x !== "<br>");
    }

    // Fallback
    return [div.innerHTML.trim()].filter(x => x);
  };

  /* ── Clause Component ── */
  const renderClauses = (title, type, ptsState, setPtsState) => {
    const list = clauses.filter(c => c.type === type);
    return (
      <div className="bg-slate-100/50 border border-slate-200 p-4 sm:p-5 rounded-2xl space-y-4">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
          {title}
        </h3>
        <Select
          value=""
          onChange={e => {
            const v = e.target.value;
            if (!v) return;
            const c = list.find(x => x.id === v);
            if (c) {
              setPtsState([getCleanHTML(c.points)]);
            }
          }}
          options={list}
          valueKey="id"
          labelKey="title"
          placeholder="- Select from Template -"
          onAdd={() => setActionModal({ type: 'manageClause', clauseType: type, initialAction: 'add' })}
          addLabel={`Add New`}
          onView={(c) => setActionModal({ type: 'manageClause', clauseType: type, initialViewId: c.id, initialAction: 'view', setPoints: setPtsState })}
        />
        {ptsState.length > 0 && (
          <div className="mt-2 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden relative group/clause">
              {/* Main Clause Content Box */}
              <div className="px-5 py-3">
                <div className="quill-content max-w-full break-words prose prose-sm prose-slate leading-normal text-slate-600" dangerouslySetInnerHTML={{ __html: ptsState[0] || "" }} />
              </div>

              {/* Action Overlay or Clear Button */}
              <div className="absolute top-4 right-4 opacity-0 group-hover/clause:opacity-100 transition-opacity">
                <button onClick={() => setPtsState([])} title="Remove Template"
                  className="h-8 w-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-rose-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 shadow-sm transition-all">
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div className="flex justify-end pr-2">
              <button
                onClick={() => setPtsState([])}
                className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-rose-50 border border-transparent hover:border-rose-100"
              >
                <Trash2 size={12} /> Clear Selected Clause
              </button>
            </div>

            <style>{`
              .quill-content p { margin: 0; }
              .quill-content ul, .quill-content ol { padding-left: 1rem; margin: 0; }
              .quill-content li { margin-bottom: 0.125rem; }
              .quill-content * { max-width: 100%; word-break: break-word; }
              .quill-compact p { margin-bottom: 0px !important; text-align: justify !important; }
              .quill-compact ul, .quill-compact ol { margin: 0 !important; }
              .quill-content { text-align: justify !important; }
            `}</style>
          </div>
        )}
      </div>
    );
  };

  if (loading && sites.length === 0 && companies.length === 0) return <div className="p-6 text-slate-400 text-center py-20 flex items-center justify-center flex-col gap-4"><Loader2 size={30} className="animate-spin text-indigo-500" /> <p>Loading master data...</p></div>;

  return (
    <div className="p-4 md:p-6 w-full max-w-[1400px] mx-auto pb-32">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg
          ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      {docPreviewUrl && (
        <div className="fixed inset-0 z-[60] flex">
          <div className="flex-1 bg-black/50" onClick={() => setDocPreviewUrl(null)} />
          <div className="w-full max-w-[860px] bg-slate-200 flex flex-col h-full shadow-2xl animate-in slide-in-from-right">
            <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
              <span className="font-bold text-slate-700 text-sm">Document Preview</span>
              <button
                onClick={() => setDocPreviewUrl(null)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-all"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 bg-slate-300 relative">
              <iframe
                src={docPreviewUrl}
                className="w-full h-full border-0 bg-white"
                title="Document Preview"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <FileSpreadsheet size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">
              {project ? `${project} Order Data` : "Order Master Data"}
            </h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse"></span>
              {project ? "Project Specific Order Logs" : "Global Order Management System"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-all text-sm">Cancel</button>
          <button onClick={() => handleSave("Draft")} disabled={saving}
            className="px-5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold flex items-center gap-2 hover:bg-slate-100 transition-all disabled:opacity-50 text-sm">
            <Save size={16} /> {saving ? "..." : "Save as Draft"}
          </button>
          <button onClick={() => handleSave("Review")} disabled={saving || !header.companyId || !header.siteId || !header.vendorId || !header.subject}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold flex items-center gap-2 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 text-sm">
            <Check size={16} /> {saving ? "..." : "Submit for Review"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">

        {/* TOP SECTION - Settings & Details */}
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-5">
            <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">Order Setup</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Select label="Order Type" value={header.orderType} onChange={e => setHeader(h => ({ ...h, orderType: e.target.value }))}
                options={[{ id: "Supply", name: "Supply (PO)" }, { id: "SITC", name: "SITC (WO)" }, { id: "ITC", name: "ITC (WO)" }]} required />
              <Input label={header.orderType === "Supply" ? "PO Number" : "WO Number"}
                value={header.orderNumber || "WILL BE ASSIGNED UPON ISSUANCE"}
                readOnly mono
                className={!header.orderNumber ? "text-amber-600 font-bold italic text-[11px]" : ""}
              />
              <Select label="Select Site" value={header.siteId} onChange={handleSiteChange} options={sites} valueKey="id" labelKey="siteName" subLabelKey="siteCode" required
                disabled={!!project}
                onAdd={() => setActionModal({ type: "addSite" })} addLabel="Add New Site" onView={(s) => setActionModal({ type: "viewSite", data: s })} />
              <Select label="Select Company" value={header.companyId} onChange={handleCompanyChange} options={companies} valueKey="id" labelKey="companyName" subLabelKey="companyCode" required
                onAdd={() => setActionModal({ type: "addCompany" })} addLabel="Add New Company" onView={(c) => setActionModal({ type: "viewCompany", data: c })} />
              <Select label="Select Vendor" value={header.vendorId} onChange={handleVendorChange} options={vendors} valueKey="id" labelKey="vendorName" subLabelKey="address" required
                onAdd={() => setActionModal({ type: "addVendor" })} addLabel="Add New Vendor" onView={(v) => setActionModal({ type: "viewVendor", data: v })} />
              <Input label="Date of Creation" type="date" value={header.creationDate} onChange={e => setHeader(h => ({ ...h, creationDate: e.target.value }))} required />
              <Input label="Order Made By" value={header.madeBy} readOnly />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-6">
            <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
              <div className="w-5 h-5 bg-indigo-50 rounded-md flex items-center justify-center"><FileText size={12} className="text-indigo-600" /></div>
              Order Meta
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="col-span-full">
                <Input label="Subject" value={header.subject} onChange={e => setHeader(h => ({ ...h, subject: e.target.value }))} placeholder="Enter full order subject (e.g. Supply of IT Equipment for Varanasi Site)..."
                  className="text-lg font-bold" />
              </div>
              <div className="lg:col-span-2">
                <Input label="Reference No" value={header.refNumber} onChange={e => setHeader(h => ({ ...h, refNumber: e.target.value }))} placeholder="e.g. BMS/PRO/2026/001"
                  className="font-bold text-slate-800" />
              </div>
              <Input label="Date of Delivery" type="date" value={header.deliveryDate} onChange={e => setHeader(h => ({ ...h, deliveryDate: e.target.value }))} />
              <Select label="Priority" value={header.priority} onChange={e => setHeader(h => ({ ...h, priority: e.target.value }))}
                options={[{ id: "Low", name: "Low" }, { id: "Medium", name: "Medium" }, { id: "High", name: "High" }, { id: "Urgent", name: "Urgent" }]} />
              <div className="lg:col-span-2">
                <Select label="Contact Person(s)" value={header.contactPersonIds} isMulti
                  onChange={e => setHeader(h => ({ ...h, contactPersonIds: e.target.value }))}
                  options={contacts} valueKey="id" labelKey="personName" subLabelKey="designation"
                  onAdd={() => setActionModal({ type: "addContact" })} addLabel="Add New Contact"
                  onView={(c) => setActionModal({ type: "viewContact", data: c })} />
              </div>
              <div className="lg:col-span-2">
                <Input label="Requested By" value={header.requestBy} onChange={e => setHeader(h => ({ ...h, requestBy: e.target.value }))} placeholder="Name of person requesting order" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-6">
            <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
              <div className="w-5 h-5 bg-indigo-50 rounded-md flex items-center justify-center"><FilePlus size={12} className="text-indigo-600" /></div>
              Order Documentation
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* QUOTATIONS */}
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                <MultiDocUpload label="Quotation(s) * (Min 1, Max 6)" files={files.quotations} max={6} required
                  onAdd={e => {
                    const f = e.target.files[0];
                    if (f) setFiles(prev => ({ ...prev, quotations: [...prev.quotations, f] }));
                  }}
                  onRemove={i => setFiles(prev => ({ ...prev, quotations: prev.quotations.filter((_, idx) => idx !== i) }))}
                  onPreview={handlePreviewDoc} />
              </div>

              {/* COMPARATIVE / PROOF */}
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Proof Type *</label>
                  <select value={files.proof.type} onChange={e => setFiles(prev => ({ ...prev, proof: { ...prev.proof, type: e.target.value } }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white">
                    <option value="">� Select Type �</option>
                    <option value="Comparative Docs">Comparative Docs</option>
                    <option value="Mail Proof Doc">Mail Proof Doc</option>
                  </select>
                </div>
                {files.proof.type && (
                  <MultiDocUpload label={`${files.proof.type} *`} files={files.proof.files} max={3} required
                    onAdd={e => {
                      const f = e.target.files[0];
                      if (f) setFiles(prev => ({ ...prev, proof: { ...prev.proof, files: [...prev.proof.files, f] } }));
                    }}
                    onRemove={i => setFiles(prev => ({ ...prev, proof: { ...prev.proof, files: prev.proof.files.filter((_, idx) => idx !== i) } }))}
                    onPreview={handlePreviewDoc} />
                )}
              </div>

              {/* OTHERS */}
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                <MultiDocUpload label="Other Documents (Max 2)" files={files.others} max={2}
                  onAdd={e => {
                    const f = e.target.files[0];
                    if (f) setFiles(prev => ({ ...prev, others: [...prev.others, f] }));
                  }}
                  onRemove={i => setFiles(prev => ({ ...prev, others: prev.others.filter((_, idx) => idx !== i) }))}
                  onPreview={handlePreviewDoc} />
              </div>
            </div>
          </div>


        </div>

        {/* MIDDLE COLUMN - Table */}
        <div className="w-full space-y-6 min-w-0 flex-1">

          {/* ITEMS TABLE */}
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col border-b-0">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <h2 className="text-base font-black text-slate-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                  <ShieldCheck size={20} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col">
                  <span className="leading-tight text-sm font-black">Table of Content</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order Items & Specifications</span>
                </div>
              </h2>
              <div className="flex items-center gap-6">
                {/* COLUMN SETTINGS DROPDOWN */}
                <div className="relative">
                  <button ref={settingsBtnRef} onClick={() => {
                    const rect = settingsBtnRef.current?.getBoundingClientRect();
                    if (rect) setSettingsPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                    setShowSettings(!showSettings);
                  }}
                    className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-2xl transition-all border ${showSettings ? "bg-indigo-600 border-indigo-600 text-white shadow-2xl -translate-y-1" : "bg-white border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 hover:shadow-xl"}`}>
                    <Plus size={18} strokeWidth={3} /> Add Columns / Settings
                  </button>
                  {showSettings && (
                    <>
                      <div style={{ position: "fixed", top: settingsPos.top, right: settingsPos.right, zIndex: 1000 }}
                        className="w-72 bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-y-auto max-h-[80vh]">
                        {/* Columns */}
                        <div className="p-4 border-b border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Add Columns</p>
                          <div className="space-y-1.5">
                            {[
                              { key: 'model', label: 'Model Number' },
                              { key: 'brand', label: 'Make / Brand' },
                              { key: 'tax', label: 'GST (Tax)' },
                              { key: 'remarks', label: 'Remarks' }
                            ].filter(({ key }) => !settings[key]).map(({ key, label }) => (
                              <button key={key} onClick={() => setSettings(s => ({ ...s, [key]: true }))}
                                className="flex items-center gap-2.5 px-3 py-2 w-full text-left rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100 hover:border-indigo-400 transition-all group">
                                <Plus size={13} strokeWidth={3} className="text-indigo-500 shrink-0" />
                                <span className="text-xs font-medium text-slate-700">{label}</span>
                              </button>
                            ))}
                            {['model', 'remarks', 'brand', 'tax'].every(k => settings[k]) && (
                              <p className="text-xs text-slate-400 italic text-center py-1 font-medium bg-slate-50 rounded-lg">All columns added</p>
                            )}
                          </div>
                        </div>

                        {/* Discount */}
                        <div className="p-4 border-b border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Discount</p>
                          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                            {[['none', 'None'], ['line', 'Per Line'], ['total', 'Total']].map(([m, lbl]) => (
                              <button key={m} onClick={() => updateSettingsAndClearData('discountMode', m)}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${settings.discountMode === m ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                                {lbl}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Freight */}
                        <div className="p-4">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Freight</p>
                          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                            {[['none', 'Off'], ['before', '+ GST']].map(([m, lbl]) => (
                              <button key={m} onClick={() => updateSettingsAndClearData('frightMode', m)}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${settings.frightMode === m ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                                {lbl}
                              </button>
                            ))}

                          </div>
                        </div>
                      </div>
                      <div className="fixed inset-0 z-[999]" onClick={() => setShowSettings(false)} />
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full premium-scroll" style={{ overflowX: "auto" }}>
              <table className="text-xs border-collapse" style={{ minWidth: '100%', tableLayout: 'auto' }}>
                <thead>
                  <tr className="bg-slate-700 border-b border-slate-600">
                    <th className="px-2 py-2.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider text-center whitespace-nowrap" style={{ width: '40px' }}>S.No</th>
                    {["SITC", "ITC"].includes(header.orderType) ? (
                      <th className="px-2 py-2.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider text-left" style={{ minWidth: '340px' }}>Item Name & Description</th>
                    ) : (
                      <>
                        <th className="px-2 py-2.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider text-left" style={{ minWidth: '200px' }}>Item Name</th>
                        <th className="px-2 py-2.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider text-left" style={{ minWidth: '180px' }}>Specification</th>
                      </>
                    )}
                    {settings.model && (
                      <th className="px-2 py-2.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider text-left group/th" style={{ minWidth: '110px' }}>
                        <div className="flex items-center gap-1 whitespace-nowrap">Model No
                          <button onClick={() => updateSettingsAndClearData('model', false)} className="opacity-0 group-hover/th:opacity-100 ml-1 w-4 h-4 rounded bg-rose-500/80 text-white flex items-center justify-center transition-opacity hover:bg-rose-600" title="Remove column"><X size={8} strokeWidth={3} /></button>
                        </div>
                      </th>
                    )}
                    {settings.brand && (
                      <th className="px-2 py-2.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider text-left group/th" style={{ minWidth: '120px' }}>
                        <div className="flex items-center gap-1 whitespace-nowrap">Make / Brand
                          <button onClick={() => updateSettingsAndClearData('brand', false)} className="opacity-0 group-hover/th:opacity-100 ml-1 w-4 h-4 rounded bg-rose-500/80 text-white flex items-center justify-center transition-opacity hover:bg-rose-600" title="Remove column"><X size={8} strokeWidth={3} /></button>
                        </div>
                      </th>
                    )}
                    <th className="px-2 py-2.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider text-center whitespace-nowrap" style={{ width: '60px' }}>Unit</th>
                    <th className="px-2 py-2.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider text-center whitespace-nowrap" style={{ width: '90px' }}>Qty</th>
                    <th className="px-2 py-2.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider text-right whitespace-nowrap" style={{ width: '120px' }}>Rate (₹)</th>
                    {settings.discountMode === "line" && <th className="px-2 py-2.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider text-center whitespace-nowrap" style={{ width: '70px' }}>Disc%</th>}
                    {settings.tax && (
                      <th className="px-2 py-2.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider text-center whitespace-nowrap group/th" style={{ width: '80px' }}>
                        <div className="flex items-center justify-center gap-1">GST%
                          <button onClick={() => updateSettingsAndClearData('tax', false)} className="opacity-0 group-hover/th:opacity-100 w-4 h-4 rounded bg-rose-500/80 text-white flex items-center justify-center transition-opacity hover:bg-rose-600" title="Move to summary"><X size={8} strokeWidth={3} /></button>
                        </div>
                      </th>
                    )}
                    <th className="px-2 py-2.5 text-[10px] font-bold text-indigo-300 uppercase tracking-wider text-right whitespace-nowrap" style={{ width: '140px' }}>Amount (₹)</th>
                    {settings.remarks && (
                      <th className="px-2 py-2.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider text-left group/th" style={{ minWidth: '140px' }}>
                        <div className="flex items-center gap-1 whitespace-nowrap">Remarks
                          <button onClick={() => updateSettingsAndClearData('remarks', false)} className="opacity-0 group-hover/th:opacity-100 ml-1 w-4 h-4 rounded bg-rose-500/80 text-white flex items-center justify-center transition-opacity hover:bg-rose-600" title="Remove column"><X size={8} strokeWidth={3} /></button>
                        </div>
                      </th>
                    )}
                    <th className="sticky right-0 bg-slate-700" style={{ width: '32px' }}></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {items.map((group, gIdx) => {
                    const itemData = itemsList.find(i => i.id === group.itemId);
                    return group.subRows.map((sub, sIdx) => {
                      const isFirst = sIdx === 0;
                      return (
                        <tr key={sub.id} className={`transition-colors border-b border-slate-100
                          ${isFirst && gIdx > 0 ? "border-t-2 border-slate-300" : ""}
                          ${!isFirst ? "bg-slate-50/60 hover:bg-slate-100/60" : "bg-white hover:bg-indigo-50/30"}`}>

                          {/* S.No � rowspan */}
                          {isFirst && (
                            <td rowSpan={group.subRows.length} className="px-1 py-2 text-center align-middle border-r border-slate-100">
                              <span className="text-[11px] font-bold text-slate-400">{(gIdx + 1).toString().padStart(2, "0")}</span>
                            </td>
                          )}

                          {["SITC", "ITC"].includes(header.orderType) ? (
                            <td className="px-3 py-2 border-r border-slate-100 min-w-[320px]">
                              {isFirst && (
                                <div className="mb-3 pb-3 border-b border-slate-100/50">
                                  <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                    <span className="w-1 h-3 bg-indigo-500 rounded-full"></span>
                                    Item / Service Name
                                  </p>
                                  <InlineSelect value={group.itemId} onChange={e => handleGroupChange(group.id, e.target.value)}
                                    options={itemsList.filter(i => header.orderType === "ITC" ? ["SITC", "ITC"].includes(i.itemType) : i.itemType === header.orderType)} placeholder="Select Item..." />
                                </div>
                              )}
                              <div className={!isFirst ? "pl-4 border-l-2 border-slate-100 mt-1" : "mt-1"}>
                                {isFirst ? (
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Technical Description</p>
                                ) : (
                                  <p className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter mb-1">Point {sIdx + 1}</p>
                                )}
                                <div className="text-justify">
                                  <InlineSelect value={sub.specification} onChange={e => handleSubRowChange(group.id, sub.id, "specification", e.target.value)}
                                    options={itemData?.specifications || []} placeholder="� Spec �" disabled={!group.itemId} renderHtml={true}
                                    onAdd={() => setCustomInputModal({ open: true, type: "specification", groupId: group.id, subId: sub.id, itemId: group.itemId, text: "", originalValue: "" })}
                                    onEdit={(val) => setCustomInputModal({ open: true, type: "specification", groupId: group.id, subId: sub.id, itemId: group.itemId, text: val, originalValue: val })}
                                    onView={(val) => setSpecViewModal({ open: true, html: val, onEdit: () => { setSpecViewModal({ open: false, html: '', onEdit: null }); setCustomInputModal({ open: true, type: 'specification', groupId: group.id, subId: sub.id, itemId: group.itemId, text: val, originalValue: val }); } })}
                                    addLabel="+ Type Custom Spec" />
                                </div>
                              </div>
                              {isFirst && group.itemId && (
                                <button onClick={() => addSubRow(group.id)}
                                  className="mt-3 flex items-center gap-1.5 text-[9px] font-bold text-indigo-500 hover:text-indigo-700 px-2.5 py-1.5 rounded-xl bg-indigo-50 overflow-hidden relative group/btn transition-all border border-indigo-100/50">
                                  <Plus size={10} strokeWidth={3} /> Add Description Point
                                  <div className="absolute inset-0 bg-indigo-600 opacity-0 group-hover/btn:opacity-10 transition-opacity"></div>
                                </button>
                              )}
                            </td>
                          ) : (
                            <>
                              {/* Item � rowspan (Standard PO) */}
                              {isFirst && (
                                <td rowSpan={group.subRows.length} className="px-2 py-2 align-middle border-r border-slate-100">
                                  <div className="border-l-2 border-indigo-300 pl-1.5">
                                    <InlineSelect value={group.itemId} onChange={e => handleGroupChange(group.id, e.target.value)}
                                      options={itemsList.filter(i => header.orderType === "ITC" ? ["SITC", "ITC"].includes(i.itemType) : i.itemType === header.orderType)} placeholder="Select Item..." />
                                    {group.itemId && (
                                      <button onClick={() => addSubRow(group.id)}
                                        className="mt-1 flex items-center gap-0.5 text-[9px] font-bold text-indigo-400 hover:text-indigo-600 px-1 rounded hover:bg-indigo-50 transition-colors">
                                        <Plus size={9} strokeWidth={3} /> Add Spec
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}

                              {/* Spec (Standard PO) */}
                              <td className="px-2 py-2">
                                <InlineSelect value={sub.specification} onChange={e => handleSubRowChange(group.id, sub.id, "specification", e.target.value)}
                                  options={itemData?.specifications || []} placeholder="� Spec �" disabled={!group.itemId} renderHtml={true}
                                  onAdd={() => setCustomInputModal({ open: true, type: "specification", groupId: group.id, subId: sub.id, itemId: group.itemId, text: "", originalValue: "" })}
                                  onEdit={(val) => setCustomInputModal({ open: true, type: "specification", groupId: group.id, subId: sub.id, itemId: group.itemId, text: val, originalValue: val })}
                                  onView={(val) => setSpecViewModal({ open: true, html: val, onEdit: () => { setSpecViewModal({ open: false, html: '', onEdit: null }); setCustomInputModal({ open: true, type: 'specification', groupId: group.id, subId: sub.id, itemId: group.itemId, text: val, originalValue: val }); } })}
                                  addLabel="+ Type Custom Spec" />
                              </td>
                            </>
                          )}

                          {/* Model */}
                          {settings.model && (
                            <td className="px-2 py-2" style={{ minWidth: '110px' }}>
                              {sub.hideModel ? (
                                <button onClick={() => handleSubRowChange(group.id, sub.id, "hideModel", false)}
                                  className="w-full text-[10px] text-slate-300 border border-dashed border-slate-200 rounded-md px-2 py-1.5 text-center hover:border-indigo-300 hover:text-indigo-400 transition-all">
                                  + Add
                                </button>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <input type="text" value={sub.modelNumber} onChange={e => handleSubRowChange(group.id, sub.id, "modelNumber", e.target.value)}
                                    className="flex-1 min-w-0 text-xs text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1.5 outline-none focus:border-indigo-400 placeholder:text-slate-300 placeholder:italic" placeholder="Model #" />
                                  <button onClick={() => { handleSubRowChange(group.id, sub.id, "modelNumber", ""); handleSubRowChange(group.id, sub.id, "hideModel", true); }}
                                    className="shrink-0 text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded">
                                    <X size={11} strokeWidth={2.5} />
                                  </button>
                                </div>
                              )}
                            </td>
                          )}

                          {/* Brand */}
                          {settings.brand && (
                            <td className="px-1 py-2" style={{ minWidth: '120px' }}>
                              {sub.hideBrand ? (
                                <button onClick={() => handleSubRowChange(group.id, sub.id, "hideBrand", false)}
                                  className="w-full text-[10px] text-slate-300 border border-dashed border-slate-200 rounded-md px-2 py-1.5 text-center hover:border-indigo-300 hover:text-indigo-400 transition-all">
                                  + Add
                                </button>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <div className="flex-1 min-w-0">
                                    <InlineSelect value={sub.make} onChange={e => handleSubRowChange(group.id, sub.id, "make", e.target.value)}
                                      options={itemData?.brands || []} placeholder="Brand" disabled={!group.itemId}
                                      onAdd={() => setCustomInputModal({ open: true, type: "make", groupId: group.id, subId: sub.id, itemId: group.itemId, text: sub.make || "", originalValue: "" })}
                                      onEdit={(val) => setCustomInputModal({ open: true, type: "make", groupId: group.id, subId: sub.id, itemId: group.itemId, text: val, originalValue: val })}
                                      addLabel="+ Add New Brand" />
                                  </div>
                                  <button onClick={() => { handleSubRowChange(group.id, sub.id, "make", ""); handleSubRowChange(group.id, sub.id, "hideBrand", true); }}
                                    className="shrink-0 text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded">
                                    <X size={11} strokeWidth={2.5} />
                                  </button>
                                </div>
                              )}
                            </td>
                          )}

                          {/* Unit � rowspan, editable from UOM list */}
                          {isFirst && (
                            <td rowSpan={group.subRows.length} className="py-2 px-1 text-center align-middle bg-slate-50 border-x border-slate-100 whitespace-nowrap" style={{ width: '80px' }}>
                              <InlineSelect
                                value={group.unit || ""}
                                onChange={e => setItems(prev => prev.map(g => g.id !== group.id ? g : { ...g, unit: e.target.value }))}
                                options={uomList.map(u => u.uomCode || u.uomName)}
                                placeholder="Unit"
                                searchable={true}
                                minDropWidth={160}
                                onAdd={(searchText) => handleAddCustomUnit(group.id, searchText)}
                                addLabel="+ Add"
                              />
                            </td>
                          )}

                          {/* Qty */}
                          <td className="px-1 py-2 whitespace-nowrap" style={{ width: '90px' }}>
                            <input type="number" value={sub.qty || ""} onChange={e => handleSubRowChange(group.id, sub.id, "qty", Number(e.target.value))}
                              className="text-center text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-md px-1 py-1.5 outline-none focus:border-indigo-400" style={{ width: '78px' }} placeholder="0" />
                          </td>

                          {/* Rate */}
                          <td className="px-1 py-2 whitespace-nowrap" style={{ width: '120px' }}>
                            <div className="relative">
                              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-300">₹</span>
                              <input type="number" value={sub.unitRate || ""} onChange={e => handleSubRowChange(group.id, sub.id, "unitRate", Number(e.target.value))}
                                className="text-right text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-md pl-4 pr-1 py-1.5 outline-none focus:border-indigo-400" style={{ width: '108px' }} placeholder="0.00" />
                            </div>
                          </td>

                          {/* Disc */}
                          {settings.discountMode === "line" && (
                            <td className="px-1 py-2 whitespace-nowrap" style={{ width: '70px' }}>
                              <input type="number" value={sub.discountPct || ""} onChange={e => handleSubRowChange(group.id, sub.id, "discountPct", Number(e.target.value))}
                                className="text-center text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md py-1.5 outline-none focus:border-indigo-400" style={{ width: '58px' }} placeholder="%" />
                            </td>
                          )}

                          {/* GST % */}
                          {settings.tax && (
                            <td className="px-1 py-2 whitespace-nowrap" style={{ width: '80px' }}>
                              <div className="relative">
                                <select value={sub.taxPct} onChange={e => handleSubRowChange(group.id, sub.id, "taxPct", Number(e.target.value))}
                                  className="appearance-none text-center text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-md px-1 py-1.5 outline-none focus:border-indigo-400 cursor-pointer" style={{ width: '68px' }}>
                                  <option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option>
                                </select>
                                <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                              </div>
                            </td>
                          )}

                          {/* Amount (Total) */}
                          <td className="px-2 py-2 text-right text-xs font-bold text-indigo-600 bg-indigo-50/50 font-mono border-l border-indigo-100 whitespace-nowrap" style={{ width: '140px' }}>
                            {(() => {
                              const p = totals.processedItems.find(x => x.id === sub.id);
                              return (p?.total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
                            })()}
                          </td>

                          {/* Remarks */}
                          {settings.remarks && (
                            <td className="px-2 py-2" style={{ minWidth: '140px' }}>
                              <input type="text" value={sub.remarks} onChange={e => handleSubRowChange(group.id, sub.id, "remarks", e.target.value)}
                                className="w-full text-xs text-slate-500 bg-slate-50 border border-transparent rounded-md px-2 py-1.5 focus:bg-white focus:border-indigo-300 outline-none italic" placeholder="Remarks..." />
                            </td>
                          )}

                          {/* Action */}
                          <td className="px-1 py-2 text-center sticky right-0 border-l border-slate-100 bg-inherit">
                            <button onClick={() => group.subRows.length > 1 ? removeSubRow(group.id, sub.id) : removeGroup(group.id)}
                              disabled={group.subRows.length === 1 && items.length === 1}
                              className="w-6 h-6 flex items-center justify-center mx-auto text-slate-300 hover:text-white hover:bg-rose-400 rounded transition-all disabled:opacity-0">
                              <X size={11} strokeWidth={2.5} />
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer: Add Item + Summary */}
            <div className="border-t-2 border-slate-100 grid grid-cols-1 md:grid-cols-2">
              {/* Add Item */}
              <div className="p-5 flex items-center border-r border-slate-100">
                <button onClick={addItem}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200">
                  <Plus size={16} strokeWidth={2.5} /> Add New Item
                </button>
              </div>

              {/* Summary */}
              <div className="p-5 space-y-2.5">
                <div className="flex justify-between text-xs font-medium text-slate-500 pb-2 border-b border-slate-100">
                  <span>Subtotal</span>
                  <span className="font-mono font-semibold text-slate-700">₹ {totals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>

                {settings.discountMode === "line" && totals.lineDiscountSum > 0 && (
                  <div className="flex justify-between items-center text-xs font-medium text-rose-500">
                    <span>Discount (Line)</span>
                    <span className="font-mono font-semibold">
                      - ₹ {totals.lineDiscountSum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {settings.discountMode === "total" && (
                  <div className="flex justify-between items-center text-xs font-medium text-rose-500">
                    <span className="flex items-center gap-1">
                      Discount <span className="text-[10px] font-normal italic">(Global)</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center border border-rose-200 rounded-md bg-rose-50 overflow-hidden">
                        <input type="number"
                          value={transactionDiscount}
                          onChange={e => setTransactionDiscount(e.target.value)}
                          className="w-10 text-right outline-none font-mono text-xs bg-transparent text-rose-600 px-1.5 py-1 placeholder:text-rose-300"
                          placeholder="0" />
                        <span className="text-[11px] text-rose-400 font-bold pr-1.5">%</span>
                      </div>
                      <span className="font-mono font-semibold text-rose-500 w-[90px] text-right">
                        - ₹ {(Number(totals.txDiscountAmt) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}

                {settings.frightMode !== "none" && (
                  <div className="flex justify-between items-center text-xs font-medium text-slate-500 border-t border-slate-100 pt-2">
                    <div className="flex items-center gap-2">
                      <span>Freight & Packing</span>
                      {settings.frightMode === "before" && (
                        <select value={frightTax} onChange={e => setFrightTax(Number(e.target.value))}
                          className="text-[10px] border border-slate-200 rounded-md px-1.5 py-0.5 outline-none bg-white text-slate-600 ml-1">
                          <option value="0">0% GST</option><option value="5">5% GST</option>
                          <option value="12">12% GST</option><option value="18">18% GST</option>
                        </select>
                      )}
                    </div>
                    <input type="number"
                      value={frightCharges}
                      onChange={e => setFrightCharges(e.target.value)}
                      className="w-28 text-right border border-slate-200 rounded-lg px-2 py-1 outline-none font-mono text-xs focus:border-indigo-400 bg-white"
                      placeholder="0.00" />
                  </div>
                )}

                <div className="flex justify-between items-center text-xs font-medium text-slate-500 pt-1">
                  <div className="flex items-center gap-2">
                    <span>GST {settings.tax ? "(Summary)" : "(Applied Global)"}</span>
                    {!settings.tax && (
                      <div className="flex items-center border border-indigo-200 rounded-md bg-indigo-50 overflow-hidden ml-1">
                        <select value={transactionTax} onChange={e => setTransactionTax(Number(e.target.value))}
                          className="text-[11px] outline-none font-mono bg-transparent text-indigo-700 px-1.5 py-0.5 cursor-pointer">
                          <option value="0">0%</option><option value="5">5%</option>
                          <option value="12">12%</option><option value="18">18%</option><option value="28">28%</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <span className="font-mono font-semibold text-slate-700 w-[120px] text-right">
                    ₹ {(Number(totals.gst) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="pt-3 border-t-2 border-slate-200 mt-1 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Grand Total</p>
                    <p className="text-2xl font-black text-indigo-600 font-mono">₹ {totals.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <p className="text-[11px] text-slate-400 italic leading-snug">
                    {header.orderType === "Supply" ? "Total Purchase Order Value: " : "Total Work Order Value: "}
                    {totals.words}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── ORDER NOTES (RICH TEXT) ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <FileText size={16} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-700">Order Notes</h3>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">Custom instructions, delivery notes, or additional details</p>
              </div>
            </div>
            <div className="p-5">
              <div className="quill-notes-container">
                <style>{`
                  .quill-notes-container .ql-container {
                    min-height: 120px;
                    font-size: 14px;
                    border-bottom-left-radius: 12px;
                    border-bottom-right-radius: 12px;
                    font-family: inherit;
                  }
                  .quill-notes-container .ql-toolbar {
                    border-top-left-radius: 12px;
                    border-top-right-radius: 12px;
                    background: #f8fafc;
                    border-color: #e2e8f0 !important;
                  }
                  .quill-notes-container .ql-container {
                    border-color: #e2e8f0 !important;
                  }
                  .quill-notes-container .ql-editor.ql-blank::before {
                    color: #cbd5e1;
                    font-style: italic;
                  }
                `}</style>
                <ReactQuill
                  theme="snow"
                  value={header.notes}
                  onChange={(val) => setHeader(h => ({ ...h, notes: val }))}
                  placeholder="Type your custom notes here (Select text to format as Bold, Italics or Lists)..."
                  modules={{
                    toolbar: [
                      ['bold', 'italic', 'underline'],
                      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                      ['clean']
                    ],
                  }}
                />
              </div>
            </div>
          </div>

          {/* CLAUSES */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-5">
            <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2"><ShieldCheck size={16} className="text-slate-400" /> Order Clauses & Terms</h2>
            <div className="grid grid-cols-1 gap-6">
              {renderClauses("Terms & Conditions", "TC", tcPoints, setTcPoints)}
              {renderClauses("Payment Terms", "PAY", payPoints, setPayPoints)}
              {renderClauses("Governing Laws", "GOV", govPoints, setGovPoints)}

              {!showAnnexure && anxPoints.length === 0 ? (
                <div className="flex justify-center p-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-colors">
                  <button
                    onClick={() => setShowAnnexure(true)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
                  >
                    <Plus size={16} strokeWidth={3} /> Add Order Annexure
                  </button>
                </div>
              ) : (
                <div className="relative group/anx-outer">
                  {renderClauses("Annexures", "ANX", anxPoints, setAnxPoints)}
                  {anxPoints.length === 0 && (
                    <button
                      onClick={() => setShowAnnexure(false)}
                      className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover/anx-outer:opacity-100"
                      title="Remove Section"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Master Data Interactivity Modals */}
      {actionModal.type === "addSite" && <FullSiteModal onClose={() => setActionModal({ type: null })} onSuccess={(id) => { fetchMasterData(); setHeader(h => ({ ...h, siteId: id })); handleSiteChange({ target: { value: id } }); }} />}
      {actionModal.type === "addCompany" && <FullCompanyModal onClose={() => setActionModal({ type: null })} onSuccess={(id) => { fetchMasterData(); setHeader(h => ({ ...h, companyId: id })); handleCompanyChange({ target: { value: id } }); }} />}
      {actionModal.type === "addVendor" && <FullVendorModal onClose={() => setActionModal({ type: null })} onSuccess={(id) => { fetchMasterData(); setHeader(h => ({ ...h, vendorId: id })); handleVendorChange({ target: { value: id } }); }} />}

      {actionModal.type === "editSite" && <FullSiteModal editData={actionModal.data} onClose={() => setActionModal({ type: null })} onSuccess={() => fetchMasterData()} />}
      {actionModal.type === "editCompany" && <FullCompanyModal editData={actionModal.data} onClose={() => setActionModal({ type: null })} onSuccess={() => fetchMasterData()} />}
      {actionModal.type === "editVendor" && <FullVendorModal editData={actionModal.data} onClose={() => setActionModal({ type: null })} onSuccess={() => fetchMasterData()} />}

      {actionModal.type === "viewSite" && <FullViewSiteModal site={actionModal.data} onClose={() => setActionModal({ type: null })} onEdit={(d) => setActionModal({ type: "editSite", data: d })} />}
      {actionModal.type === "viewCompany" && <FullViewCompanyModal company={actionModal.data} onClose={() => setActionModal({ type: null })} onEdit={(d) => setActionModal({ type: "editCompany", data: d })} />}
      {actionModal.type === "viewVendor" && <FullViewVendorModal vendor={actionModal.data} onClose={() => setActionModal({ type: null })} onEdit={(d) => setActionModal({ type: "editVendor", data: d })} />}

      {/* CONTACTS */}
      {actionModal.type === "addContact" && <FullContactModal companies={companies} onClose={() => setActionModal({ type: null })} onSuccess={fetchMasterData} />}
      {actionModal.type === "editContact" && <FullContactModal companies={companies} editData={actionModal.data} onClose={() => setActionModal({ type: null })} onSuccess={fetchMasterData} />}
      {actionModal.type === "viewContact" && <FullViewContactModal contact={actionModal.data} onClose={() => setActionModal({ type: null })} onEdit={(d) => setActionModal({ type: "editContact", data: d })} />}

      {/* SPEC VIEW MODAL */}
      {specViewModal.open && (
        <SpecViewModal
          html={specViewModal.html}
          onClose={() => setSpecViewModal({ open: false, html: '', onEdit: null })}
          onEdit={specViewModal.onEdit}
        />
      )}

      {/* UOM MODAL */}
      {uomModal.open && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">Add UOM</h3>
              <button onClick={() => setUomModal({ open: false, gid: null, name: "", code: "", saving: false })} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={16} /></button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">UOM Name <span className="text-rose-400">*</span></label>
                <input
                  autoFocus
                  type="text"
                  value={uomModal.name}
                  onChange={e => setUomModal(m => ({ ...m, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && submitUomModal()}
                  placeholder="e.g. Kilogram"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 placeholder:text-slate-300"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">UOM Code</label>
                <input
                  type="text"
                  value={uomModal.code}
                  onChange={e => setUomModal(m => ({ ...m, code: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && submitUomModal()}
                  placeholder="e.g. kg"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 placeholder:text-slate-300"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setUomModal({ open: false, gid: null, name: "", code: "", saving: false })} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
              <button onClick={submitUomModal} disabled={!uomModal.name.trim() || uomModal.saving}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2">
                {uomModal.saving && <Loader2 size={13} className="animate-spin" />} Add UOM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM INPUT MODAL */}
      {customInputModal.open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-bold text-slate-700">
                {customInputModal.originalValue ? "Edit" : "Add Custom"} {customInputModal.type === "specification" ? "Description" : "Make / Brand"}
              </h3>
              <button onClick={() => setCustomInputModal({ open: false })} className="text-slate-400 hover:text-rose-500 transition-colors bg-white rounded-md p-1 border border-slate-200"><X size={16} /></button>
            </div>
            <div className="p-5">
              <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wide">
                {customInputModal.originalValue ? "Update Value" : "Enter New Value"}
              </label>
              {customInputModal.type === "specification" ? (
                <div className="border border-slate-300 rounded-xl overflow-hidden focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100 transition-all">
                  <ReactQuill
                    theme="snow"
                    value={customInputModal.text || ""}
                    onChange={val => setCustomInputModal(prev => ({ ...prev, text: val }))}
                    modules={QUILL_MODULES}
                    placeholder="Type description here..."
                    style={{ minHeight: '180px' }}
                  />
                </div>
              ) : (
                <textarea autoFocus value={customInputModal.text} onChange={e => setCustomInputModal(prev => ({ ...prev, text: e.target.value }))}
                  className="w-full text-sm border border-slate-300 rounded-xl p-3 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all min-h-[120px]"
                  placeholder="Type here..." />
              )}
              <p className="text-[10px] text-slate-400 mt-2 font-medium">
                This will be {customInputModal.originalValue ? "updated" : "added"} in this row AND saved permanently to the item master.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
              <button onClick={() => setCustomInputModal({ open: false })} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={handleSaveCustomInput} className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-md shadow-indigo-200">
                <Check size={14} strokeWidth={3} /> {customInputModal.originalValue ? "Update & Apply" : "Save & Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLAUSES Modal Setup */}
      {actionModal.type === "manageClause" && (
        <FullClauseModal
          type={actionModal.clauseType}
          initialAction={actionModal.initialAction}
          initialViewId={actionModal.initialViewId}
          onClose={() => setActionModal({ type: null })}
          onSuccess={(selectedPoints) => {
            fetchMasterData();
            if (selectedPoints) {
              const html = getCleanHTML(selectedPoints);
              if (actionModal.setPoints) actionModal.setPoints([html]);
            }
            setActionModal({ type: null });
          }}
        />
      )}
    </div>
  );
}

// ============== ORDER LIST COMPONENT ==============
function OrderList({ project, onCreateClick, onViewClick, onEditClick }) {
  const currentUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
  const isGlobalAdmin = currentUser.role === "global_admin";
  const myPerms = currentUser.app_permissions?.find(p => p.module_key === "create_order") || {};
  const canEdit = isGlobalAdmin || !!myPerms.can_edit;
  const canDelete = isGlobalAdmin || !!myPerms.can_delete;

  // Per-order edit check: global_admin can always edit; otherwise only creator can edit editable orders
  const canEditOrder = (o) => {
    if (o._history || ["Rejected", "Cancelled", "Reverted", "Recalled", "Issued"].includes(o.status)) return false;
    const isEditableStatus = ['Draft', 'Review'].includes(o.status);
    const isCreator = o.created_by_id === currentUser.id;
    if (isGlobalAdmin) return isEditableStatus;
    return canEdit && isEditableStatus && isCreator;
  };

  const canDeleteOrder = (o) => {
    if (o._history || ["Issued", "Rejected", "Cancelled", "Reverted", "Recalled"].includes(o.status)) return false;
    return canDelete;
  };
  const [orders, setOrders] = useState(cachedOrders || []);
  const [loading, setLoading] = useState(!cachedOrders);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("All");
  const [pdfPreviewId, setPdfPreviewId] = useState(null);
  const [pdfPreviewNonce, setPdfPreviewNonce] = useState(0);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  // Bulk import / export
  const [showBulk, setShowBulk] = useState(false);
  const [bulkKind, setBulkKind] = useState("Purchase Order"); // Purchase Order | Work Order
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const bulkRef = React.useRef();

  const [copiedOrderId, setCopiedOrderId] = useState("");

  const copyOrderNumber = (text, id, e) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedOrderId(id);
      setTimeout(() => setCopiedOrderId(""), 1500);
    }).catch(() => showToast("Copy failed", "error"));
  };

  // Filters
  const [filterSite, setFilterSite] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterMadeBy, setFilterMadeBy] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [dateRange, setDateRange] = useState("all"); // all | this_year | last_year | custom
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const TABS = ["All", "Draft", "Review", "To Issue", "Amendment Request", "Amended", "Issued", "Rejected", "Reverted", "Recalled", "Cancelled"];

  useEffect(() => {
    if (cachedOrders) fetchOrders(true);
    else fetchOrders();
  }, []);

  const fetchOrders = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res = await fetch(`${API}/api/orders`);
      const data = await res.json();
      cachedOrders = data.orders || [];
      setOrders(cachedOrders);
    } catch {
      showToast("Failed to fetch orders", "error");
    }
    if (!isBackground) setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this order?")) return;
    try {
      const res = await fetch(`${API}/api/orders/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || `Delete failed (${res.status})`, "error");
        return;
      }
      showToast("Order deleted successfully");
      fetchOrders();
    } catch (err) {
      showToast(err.message || "Failed to delete", "error");
    }
  };

  const handleApprovalAction = async (id, action, promptMsg) => {
    const comments = prompt(promptMsg || `Enter comments for ${action}:`, "");
    if (comments === null) return;
    try {
      const token = localStorage.getItem("bms_token") || "";
      const reqRes = await fetch(`${API}/api/approvals/requests/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const reqData = await reqRes.json();
      const requestId = reqData?.request?.id;
      if (!requestId) throw new Error("No approval request found");
      const actRes = await fetch(`${API}/api/approvals/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ request_id: requestId, action, comments: comments || action })
      });
      if (!actRes.ok) {
        const errData = await actRes.json().catch(() => ({}));
        throw new Error(errData.error || `${action} failed`);
      }
      showToast(`Order ${action.toLowerCase()}`);
      fetchOrders();
    } catch (err) {
      showToast(err.message || `${action} failed`, "error");
    }
  };

  const handleRecall = async (id) => {
    if (!confirm("Recall this order? A frozen recall record will be kept and the live order will move back to Draft for editing.")) return;
    try {
      const token = localStorage.getItem("bms_token") || "";
      const reqRes = await fetch(`${API}/api/approvals/requests/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const reqData = await reqRes.json();
      const requestId = reqData?.request?.id;
      if (!requestId) throw new Error("No approval request found");
      const actRes = await fetch(`${API}/api/approvals/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ request_id: requestId, action: 'Recalled', comments: 'Recalled by user' })
      });
      if (!actRes.ok) throw new Error("Recall failed");
      showToast("Order recalled");
      fetchOrders();
    } catch (err) {
      showToast(err.message || "Recall failed", "error");
    }
  };

  const handleCancel = async (id) => {
    if (!confirm("Cancel this order? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API}/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: JSON.stringify({ mainData: { status: 'Cancelled' } }) })
      });
      if (!res.ok) throw new Error("Cancel failed");
      showToast("Order cancelled");
      fetchOrders();
    } catch (err) {
      showToast(err.message || "Cancel failed", "error");
    }
  };

  const handleSendToApproval = async (id) => {
    try {
      showToast("Initializing approval flow...");
      // 1. Update Order Status to Pending Issue
      const updRes = await fetch(`${API}/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: JSON.stringify({ mainData: { status: 'To Issue' } }) })
      });
      if (!updRes.ok) throw new Error("Failed to update status");

      // 2. Initialize Approval Engine
      const appRes = await fetch(`${API}/api/approvals/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem("bms_token") || ""}` },
        body: JSON.stringify({
          module_key: "procurement",
          point_key: "po_submission",
          document_id: id,
          requestor_id: JSON.parse(localStorage.getItem("bms_user") || "{}").id
        })
      });
      if (!appRes.ok) throw new Error("Approval init failed");

      showToast("Order submitted for approval!");
      fetchOrders();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // Convert image URL to Base64 to embed in PDF
  const _getBase64Image = async (url) => {
    if (!url) return null;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  };

  const _exportPDF = async (orderId) => {
    try {
      showToast("Generating PDF... Please wait.");

      // Dynamic import to avoid main bundle bloat
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"), import("jspdf-autotable")
      ]);

      const res = await fetch(`${API}/api/orders/${orderId}`);
      const { order, items } = await res.json();

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const snap = order.snapshot || {};
      const sComp = snap.company || order.companies || {};
      const sVend = snap.vendor || order.vendors || {};
      const sSite = snap.site || order.sites || {};

      const logoB64 = await _getBase64Image(sComp.logoUrl || sComp.logo_url);
      const signB64 = await _getBase64Image(sComp.signUrl || sComp.sign_url);

      let cursorY = 15;

      /* ── HEADER ── */
      if (logoB64) doc.addImage(logoB64, "PNG", 15, cursorY, 30, 20, "", "FAST");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(sComp.companyName?.toUpperCase() || sComp.company_name?.toUpperCase() || "", pageWidth - 15, cursorY + 5, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(sComp.address || "", pageWidth - 15, cursorY + 10, { align: "right" });
      doc.text(`GSTIN: ${sComp.gstin || "N/A"}`, pageWidth - 15, cursorY + 14, { align: "right" });

      cursorY += 25;
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5);
      doc.line(15, cursorY, pageWidth - 15, cursorY);
      cursorY += 8;

      /* ── TITLE & META ── */
      doc.setFont("helvetica", "bold"); doc.setFontSize(16);
      doc.text(order.order_type === "Supply" ? "PURCHASE ORDER" : "WORK ORDER", pageWidth / 2, cursorY, { align: "center" });
      cursorY += 10;

      doc.setFontSize(10);
      doc.text("Order No:", 15, cursorY); doc.setFont("helvetica", "normal"); doc.text(order.order_number, 40, cursorY);
      doc.setFont("helvetica", "bold"); doc.text("Date:", pageWidth / 2 + 10, cursorY); doc.setFont("helvetica", "normal");
      doc.text(new Date(order.created_at).toLocaleDateString("en-IN"), pageWidth / 2 + 30, cursorY);

      cursorY += 6;
      doc.setFont("helvetica", "bold"); doc.text("Subject:", 15, cursorY); doc.setFont("helvetica", "normal"); doc.text(order.subject || "N/A", 40, cursorY);
      cursorY += 6;
      doc.setFont("helvetica", "bold"); doc.text("Ref No:", 15, cursorY); doc.setFont("helvetica", "normal"); doc.text(order.ref_number || "N/A", 40, cursorY);
      cursorY += 12;

      /* ── BOXES ── */
      doc.setDrawColor(0); doc.setLineWidth(0.2);
      // VENDOR
      doc.rect(15, cursorY, 85, 35); doc.setFont("helvetica", "bold"); doc.text("VENDOR / BILL TO:", 18, cursorY + 5);
      doc.setFont("helvetica", "normal"); doc.text(sVend.vendorName || sVend.vendor_name || "", 18, cursorY + 11);
      doc.setFontSize(8); doc.text(doc.splitTextToSize(sVend.address || "", 80), 18, cursorY + 16);
      doc.text(`GSTIN: ${sVend.gstin || "N/A"}`, 18, cursorY + 31);

      // SITE
      doc.rect(105, cursorY, 90, 35); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("SHIP TO / DELIVERY SITE:", 108, cursorY + 5);
      doc.setFont("helvetica", "normal"); doc.text(sSite.siteName || sSite.site_name || "", 108, cursorY + 11);
      doc.setFontSize(8); doc.text(doc.splitTextToSize(sSite.siteAddress || sSite.site_address || "", 85), 108, cursorY + 16);
      cursorY += 45;

      /* ── TABLE ── */
      const tableHead = [["S.No", "Description", "UOM", "Qty", "Rate (Rs)", "Tax %", "Amount (Rs)"]];
      const tableBody = items.map((it, i) => [
        i + 1, it.description,
        it.unit?.toUpperCase() || "", it.qty || 0, Number(it.unit_rate).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
        it.tax_pct || "0", Number(it.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
      ]);

      autoTable(doc, {
        startY: cursorY, head: tableHead, body: tableBody, theme: "grid", styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [40, 50, 70], textColor: 255, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: "auto" }, 2: { cellWidth: 15, halign: "center" }, 3: { cellWidth: 15, halign: "center" }, 4: { cellWidth: 25, halign: "right" }, 5: { cellWidth: 15, halign: "center" }, 6: { cellWidth: 30, halign: "right" } },
      });
      cursorY = doc.lastAutoTable.finalY + 10;

      /* ── TOTALS ── */
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); const totalsObj = order.totals || {}; const tY = cursorY;
      doc.text("Subtotal:", 145, tY, { align: "right" }); doc.setFont("helvetica", "normal"); doc.text((totalsObj.subtotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }), 190, tY, { align: "right" });
      doc.setFont("helvetica", "bold"); doc.text("GST:", 145, tY + 6, { align: "right" }); doc.setFont("helvetica", "normal"); doc.text((totalsObj.gst || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }), 190, tY + 6, { align: "right" });
      doc.setFont("helvetica", "bold"); doc.text("Grand Total:", 145, tY + 12, { align: "right" }); doc.text((totalsObj.grandTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }), 190, tY + 12, { align: "right" });
      doc.setFontSize(9); doc.text(`Amount in Words:`, 15, tY); doc.setFont("helvetica", "italic"); doc.text(totalsObj.words || "", 15, tY + 6);
      cursorY += 25;

      /* ── NOTES ── */
      if (order.notes && order.notes.trim() !== "" && order.notes !== "<p><br></p>") {
        if (cursorY > pageHeight - 60) { doc.addPage(); cursorY = 20; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("ORDER NOTES:", 15, cursorY);
        cursorY += 6;
        doc.setFont("helvetica", "normal"); doc.setFontSize(9);

        // Basic HTML to text conversion for PDF
        const cleanNotes = normalizeRichTextHtml(order.notes)
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n")
          .replace(/<li>/gi, "• ")
          .replace(/<\/li>/gi, "\n")
          .replace(/<[^>]+>/g, ""); // strip remaining tags

        const noteLines = doc.splitTextToSize(cleanNotes.trim(), 180);
        doc.text(noteLines, 15, cursorY);
        cursorY += (noteLines.length * 5) + 8;
      }

      /* ── CLAUSES ── */
      if (cursorY > pageHeight - 80) { doc.addPage(); cursorY = 20; }

      const tc = normalizeRichTextArray(order.terms_conditions || []);
      const pt = normalizeRichTextArray(order.payment_terms || []);
      const gl = normalizeRichTextArray(order.governing_laws || []);
      const anx = order.annexures || [];

      const printClauses = (title, arr) => {
        if (!arr.length) return;
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(title, 15, cursorY); cursorY += 5;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        arr.forEach((t, i) => { const lines = doc.splitTextToSize(`${i + 1}. ${t}`, 180); doc.text(lines, 15, cursorY); cursorY += (lines.length * 4) + 1; });
        cursorY += 5;
      };

      printClauses("Terms & Conditions:", tc);
      printClauses("Payment Terms:", pt);
      printClauses("Governing Laws:", gl);
      printClauses("Annexures:", anx);

      /* ── FOOTER ── */
      const footerY = pageHeight - 45; if (cursorY > footerY) { doc.addPage(); }
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(`For ${sComp.companyName || sComp.company_name || ""}`, pageWidth - 15, footerY, { align: "right" });
      if (signB64) doc.addImage(signB64, "PNG", pageWidth - 55, footerY + 2, 40, 15, "", "FAST");
      doc.setFont("helvetica", "normal"); doc.text("Authorised Signatory", pageWidth - 15, footerY + 20, { align: "right" });
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5); doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15);
      doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.text("This is a computer generated document.", pageWidth / 2, pageHeight - 10, { align: "center" });

      doc.save(`Order_${order.order_number.replace(/\//g, "_")}.pdf`);
      showToast("PDF exported successfully!");
    } catch (err) { console.error(err); showToast("Error generating PDF", "error"); }
  };

  const openPDFPreview = (orderId) => {
    setPdfPreviewNonce(Date.now());
    setPdfPreviewId(orderId);
  };

  const handlePDFDownload = async () => {
    if (!pdfPreviewId || pdfDownloading) return;
    setPdfDownloading(true);
    try {
      const res = await fetch(`${API}/api/orders/${pdfPreviewId}/pdf?download=1&t=${pdfPreviewNonce || Date.now()}`);
      if (!res.ok) throw new Error("PDF failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PO_${pdfPreviewId}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      showToast("PDF downloaded successfully!");
    } catch (err) {
      console.error(err);
      showToast("PDF download failed", "error");
    }
    setPdfDownloading(false);
  };

  const handleExport = () => {
    const rows = filtered.map(o => {
      const snap = o.snapshot || {};
      const t = o.totals || {};
      const taxable = (Number(t.subtotal) || 0) - (Number(t.totalDiscountAmt) || 0);
      return {
        "Company Code": snap.company?.companyCode || o.companies?.company_code || "",
        "Site Code": snap.site?.siteCode || o.sites?.site_code || "",
        "Order No": o.order_number?.startsWith("PENDING-") ? "DRAFT" : o.order_number,
        "Order Type": o.order_type || "",
        "Vendor Name": snap.vendor?.vendorName || o.vendors?.vendor_name || "",
        "Subject": o.subject || "",
        "Ref No": o.ref_number || "",
        "Made By": o.made_by || "",
        "Created Date": o.date_of_creation ? new Date(o.date_of_creation).toLocaleDateString("en-IN") : "",
        "Issued Date": ["Issued", "Amended"].includes(o.status) && (t.issuedAt || o.updated_at) ? new Date(t.issuedAt || o.updated_at).toLocaleDateString("en-IN") : "",
        "Taxable Amount": taxable,
        "Grand Total": Number(t.grandTotal) || 0,
        "Status": o.status || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, `orders_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("Export downloaded");
  };

  const downloadBulkTemplate = () => {
    const isPO = bulkKind === "Purchase Order";
    const orderNoCol = isPO ? "Purchase Order No." : "Work Order No.";
    const defaultType = isPO ? "Supply" : "SITC";

    // Common columns — only IDs/codes, system fetches details from masters
    const commonStart = [
      "S.No",
      "Site Code", "Company Code", "Vendor ID", "Contact IDs",
      orderNoCol, "Order Type", "Reference Number",
      "Created By", "Created On", "Requisition By", "Subject",
      "Status", "Issued At",
    ];
    const itemCols = isPO
      ? ["Item Name", "Specification", "Model No", "Brand Name", "Unit", "Quantity", "Unit Price (₹)", "Tax (%)", "Discount (%)", "Amount"]
      : ["Item Name", "Description", "Model No", "Brand Name", "Unit", "Quantity", "Unit Price (₹)", "Tax (%)", "Discount (%)", "Amount"];
    const commonEnd = [
      "Fright", "Total Tax (₹)", "Total Amount (₹)",
      "Order Notes",
      "TC ID", "Payment Terms ID", "Govern Laws ID", "Annexure ID",
    ];
    const columns = [...commonStart, ...itemCols, ...commonEnd];

    const poNumber = isPO ? "BITL/B47/PO/2025-26/001" : "BITL/B47/WO/2025-26/001";

    // Header details only on first row of each order — only IDs, masters provide rest
    const orderHead = {
      "Site Code": "B47",
      "Company Code": "BITL",
      "Vendor ID": "VEN-001",
      "Contact IDs": "CON-001; CON-002",
      [orderNoCol]: poNumber,
      "Order Type": defaultType,
      "Reference Number": "REF-001",
      "Created By": "Admin",
      "Created On": "2025-04-01",
      "Requisition By": "Site Engineer",
      "Subject": isPO ? "Cement & Steel supply" : "Water Proofing Work",
      "Status": "Issued",
      "Issued At": "2025-04-05",
    };

    const totalsBlock = {
      "Fright": 0,
      "Total Tax (₹)": isPO ? 7200 : 9000,
      "Total Amount (₹)": isPO ? 47200 : 59000,
      "Order Notes": isPO
        ? "Deliver at site gate, Payment net 30, Quality check mandatory, Insurance included"
        : "Scraping of old paint, Application of primer coat, Final water-proofing coat with warranty",
      "TC ID": "TC-001",            // V1 (latest if no version specified — uses base record)
      "Payment Terms ID": "PAY-001/V2", // V2 of PAY-001
      "Govern Laws ID": "GOV-001",
      "Annexure ID": "",
    };

    // PO example: 2 different items (cement + steel)
    // WO example: 1 item (Water Proofing) with multi-point description in single cell
    let example;
    if (isPO) {
      example = [
        {
          "S.No": 1, ...orderHead,
          "Item Name": "Cement Bag",
          "Specification": "OPC 43 grade",
          "Model No": "",
          "Brand Name": "UltraTech",
          "Unit": "bag",
          "Quantity": 100,
          "Unit Price (₹)": 400,
          "Tax (%)": 18,
          "Discount (%)": 0,
          "Amount": 40000,
          ...totalsBlock,
        },
        {
          "S.No": 2,
          "Site Code": "", "Company Code": "", "Vendor ID": "", "Contact IDs": "",
          [orderNoCol]: poNumber, // same PO → same order
          "Order Type": "", "Reference Number": "", "Created By": "", "Created On": "",
          "Requisition By": "", "Subject": "",
          "Status": "", "Issued At": "",
          "Item Name": "Steel Rod",
          "Specification": "Fe500 TMT 12mm",
          "Model No": "",
          "Brand Name": "TATA Tiscon",
          "Unit": "kg",
          "Quantity": 500,
          "Unit Price (₹)": 60,
          "Tax (%)": 18,
          "Discount (%)": 0,
          "Amount": 30000,
          "Fright": "", "Total Tax (₹)": "", "Total Amount (₹)": "",
          "Order Notes": "",
          "TC ID": "", "Payment Terms ID": "", "Govern Laws ID": "", "Annexure ID": "",
        }
      ];
    } else {
      // WO example: Water Proofing with multi-point description
      // Use Alt+Enter inside the Description cell → newline-separated points.
      // Here we embed actual newlines via "\n" so the resulting cell shows multiple lines.
      const multiPointDesc = [
        "Scraping of old paint and cleaning of surface",
        "Application of primer coat",
        "Final water-proofing coat with warranty of 5 years",
      ].join("\n");

      example = [
        {
          "S.No": 1, ...orderHead,
          "Item Name": "Terrace Water Proofing",
          "Description": multiPointDesc, // multi-line cell → stored as JSON array of points
          "Model No": "",
          "Brand Name": "Dr. Fixit",
          "Unit": "sqft",
          "Quantity": 1000,
          "Unit Price (₹)": 50,
          "Tax (%)": 18,
          "Discount (%)": 0,
          "Amount": 50000,
          ...totalsBlock,
        }
      ];
    }

    const ws = XLSX.utils.json_to_sheet(example, { header: columns });

    // Enable text-wrap on Description cell so newlines show visually in Excel
    if (!isPO) {
      const descColIdx = columns.indexOf("Description");
      if (descColIdx >= 0) {
        const cellRef = XLSX.utils.encode_cell({ r: 1, c: descColIdx }); // row 1 (0-indexed, after header)
        if (ws[cellRef]) {
          ws[cellRef].s = { alignment: { wrapText: true, vertical: "top" } };
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isPO ? "Purchase Orders" : "Work Orders");
    XLSX.writeFile(wb, `${isPO ? "purchase_order" : "work_order"}_bulk_template.xlsx`);
  };

  const handleBulkFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        setBulkRows(rows);
        setBulkResult(null);
      } catch (err) {
        showToast("Failed to read Excel: " + err.message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBulkUpload = async () => {
    if (bulkRows.length === 0) return showToast("No rows to import", "error");
    setBulkSaving(true);
    try {
      const user = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const res = await fetch(`${API}/api/orders/bulk-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: bulkRows, orderKind: bulkKind, createdBy: user.name || "Bulk Import" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setBulkResult(data);
      showToast(`Imported ${data.inserted} / ${bulkRows.length} orders`);
      fetchOrders();
    } catch (err) {
      showToast(err.message || "Import failed", "error");
    }
    setBulkSaving(false);
  };

  const getSiteCodeForOrder = (o) => o.snapshot?.site?.siteCode || o.sites?.site_code || "";
  const projectScoped = (o) => !project || getSiteCodeForOrder(o) === project;

  const getTabCount = (tabName) => {
    const scoped = orders.filter(projectScoped);
    if (tabName === "All") return scoped.filter(o => !o._history && !["Reverted", "Recalled"].includes(o.status)).length;
    // "Issued" is the broader bucket — includes amended orders that were issued
    // at some point in their lifecycle. "Amended" tab still shows only those.
    if (tabName === "Issued") return scoped.filter(o => ["Issued", "Amended"].includes(o.status)).length;
    return scoped.filter(o => o.status === tabName).length;
  };


  // Build unique option lists for filter dropdowns
  const getCompanyCode = (o) => o.snapshot?.company?.companyCode || o.companies?.company_code || "";
  const getSiteCode = (o) => o.snapshot?.site?.siteCode || o.sites?.site_code || "";
  const siteOptions = Array.from(new Set(orders.map(getSiteCode).filter(Boolean))).sort();
  const companyOptions = Array.from(new Set(orders.map(getCompanyCode).filter(Boolean))).sort();
  const madeByOptions = Array.from(new Set(orders.map(o => o.made_by).filter(Boolean))).sort();

  // Date range helpers
  const getFYBounds = (yearOffset = 0) => {
    const now = new Date();
    const currMonth = now.getMonth(); // 0-indexed
    const fyStartYear = (currMonth >= 3 ? now.getFullYear() : now.getFullYear() - 1) + yearOffset;
    const from = new Date(fyStartYear, 3, 1);              // 1 Apr
    const to = new Date(fyStartYear + 1, 2, 31, 23, 59, 59); // 31 Mar
    return { from, to };
  };

  const filtered = orders.filter(o => {
    const ms = search.toLowerCase();
    const snap = o.snapshot || {};
    const searchBlob = [
      o.order_number,
      o.subject,
      o.vendors?.vendor_name,
      snap.vendor?.vendorName,
      o.companies?.company_code,
      o.companies?.company_name,
      snap.company?.companyCode,
      snap.company?.companyName,
      o.sites?.site_code,
      o.sites?.site_name,
      snap.site?.siteCode,
      snap.site?.siteName,
      o.made_by,
      o.order_type
    ].filter(Boolean).join(" ").toLowerCase();
    const matchSearch = !ms || searchBlob.includes(ms);
    const matchTab = activeTab === "All"
      ? (!o._history && !["Reverted", "Recalled"].includes(o.status))
      : activeTab === "Issued"
        ? ["Issued", "Amended"].includes(o.status)
        : o.status === activeTab;
    const matchSite = !filterSite || getSiteCode(o) === filterSite;
    const matchCompany = !filterCompany || getCompanyCode(o) === filterCompany;
    const matchType = !filterType || o.order_type === filterType;
    const matchMadeBy = !filterMadeBy || o.made_by === filterMadeBy;
    const matchStatus = activeTab !== "All" || !filterStatus || o.status === filterStatus;

    let matchDate = true;
    if (dateRange !== "all") {
      const created = new Date(o.date_of_creation || o.created_at);
      let from, to;
      if (dateRange === "this_year") ({ from, to } = getFYBounds(0));
      else if (dateRange === "last_year") ({ from, to } = getFYBounds(-1));
      else if (dateRange === "custom") {
        from = customFrom ? new Date(customFrom) : null;
        to = customTo ? new Date(customTo + "T23:59:59") : null;
      }
      if (from && created < from) matchDate = false;
      if (to && created > to) matchDate = false;
    }

    const matchProject = !project || getSiteCode(o) === project;
    return matchProject && matchSearch && matchTab && matchSite && matchCompany && matchType && matchMadeBy && matchStatus && matchDate;
  });

  const clearFilters = () => {
    setFilterSite(""); setFilterCompany(""); setFilterType(""); setFilterMadeBy(""); setFilterStatus("");
    setDateRange("all"); setCustomFrom(""); setCustomTo("");
  };
  const hasActiveFilters = filterSite || filterCompany || filterType || filterMadeBy || filterStatus || dateRange !== "all";

  const stats = useMemo(() => {
    const po = filtered.filter(o => o.order_type === "Supply");
    const wo = filtered.filter(o => ["SITC", "ITC"].includes(o.order_type));
    const taxableOf = (o) => {
      const t = o.totals || {};
      const sub = Number(t.subtotal) || 0;
      const disc = Number(t.totalDiscountAmt) || 0;
      const computed = sub - disc;
      return computed > 0 ? computed : (Number(t.taxableAmount) || 0);
    };
    const sumTaxable = (arr) => arr.reduce((acc, o) => acc + taxableOf(o), 0);
    return {
      total: filtered.length,
      poCount: po.length, poValue: sumTaxable(po),
      woCount: wo.length, woValue: sumTaxable(wo),
    };
  }, [filtered]);

  return (
    <div className="p-0 sm:p-2 lg:p-3 w-full pb-10">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg
          ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      {pdfPreviewId && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => setPdfPreviewId(null)} />
          <div className="w-full max-w-[860px] bg-slate-200 flex flex-col h-full shadow-2xl">
            <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
              <span className="font-bold text-slate-700 text-sm">PDF Preview</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={pdfDownloading}
                  onClick={handlePDFDownload}
                  className={`flex items-center gap-2 px-4 py-2 text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all ${pdfDownloading ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#1b3e8a] hover:bg-[#16326d]'}`}>
                  {pdfDownloading
                    ? <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <FileDown size={14} />}
                  {pdfDownloading ? "Downloading..." : "Download PDF"}
                </button>
                <button
                  onClick={() => setPdfPreviewId(null)}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-all">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-300">
              <iframe
                title="Order PDF"
                src={`${API}/api/orders/${pdfPreviewId}/pdf?t=${pdfPreviewNonce}#toolbar=0&navpanes=0&statusbar=0&messages=0&view=FitH`}
                className="w-full h-full border-0 bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 bg-white p-4 px-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-[#6366f1] rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <FileSpreadsheet size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none mb-1.5">
              {project ? `${project} Order Data` : "Order Master Data"}
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {project ? "• Project Specific Order Logs" : "• Global Order Management System"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExport}
            className="h-10 px-5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold flex items-center gap-2 hover:bg-slate-50 transition-all text-xs shadow-sm">
            <Download size={14} className="text-slate-400" /> Export
          </button>
          <button onClick={() => { setShowBulk(true); setBulkRows([]); setBulkFileName(""); setBulkResult(null); }}
            className="h-10 px-5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold flex items-center gap-2 hover:bg-slate-50 transition-all text-xs shadow-sm">
            <Upload size={14} className="text-slate-400" /> Bulk Upload
          </button>
          <button onClick={onCreateClick}
            className="h-10 px-6 rounded-xl bg-[#4f46e5] text-white font-bold flex items-center gap-2 hover:bg-[#4338ca] transition-all text-xs shadow-lg shadow-indigo-100">
            <Plus size={16} /> Create Order
          </button>
        </div>
      </div>

      {/* Bulk Upload Modal */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={20} className="text-emerald-600" />
                <div>
                  <h3 className="font-bold text-slate-800">Bulk Upload Orders</h3>
                  <p className="text-xs text-slate-500">Imported orders will be marked as Issued</p>
                </div>
              </div>
              <button onClick={() => setShowBulk(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {/* Order Kind selector */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Order Kind</label>
                <div className="relative">
                  <select value={bulkKind} onChange={e => { setBulkKind(e.target.value); setBulkRows([]); setBulkFileName(""); setBulkResult(null); }}
                    className="appearance-none w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 bg-white outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-50 cursor-pointer">
                    <option value="Purchase Order">Purchase Order</option>
                    <option value="Work Order">Work Order</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-xs text-amber-800">
                <p className="font-bold mb-1">Instructions:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>Download the template, fill it, then upload</li>
                  <li><b>One row = one item.</b> Same <i>{bulkKind} No.</i> in multiple rows = one order with multiple items</li>
                  <li>Order-level fields (Vendor, Company, Status, Totals, Clauses) only needed in the <b>first row</b> of each order</li>
                  <li><b>Company Code</b> and <b>Site Code</b> must already exist in master data</li>
                  <li>Excel values <b>override</b> master data and are <b>frozen</b> in the order (later master edits won't affect imported orders)</li>
                  <li>If Excel cell is blank, data is picked from master (Company / Site / Vendor tab)</li>
                  <li><b>Vendor Bank Details</b> (Bank Name, IFSC, Account No) can be set per-order in Excel — blank picks from vendor master</li>
                  {bulkKind === "Work Order" ? (
                    <li><b>Multi-point description</b>: in the <i>Description</i> cell, press <kbd>Alt + Enter</kbd> after each point to add a new line. Multiple lines = multiple points for that item. Model No & Brand Name are optional</li>
                  ) : (
                    <li>Item columns: <b>Specification</b>, <b>Model No</b>, <b>Brand Name</b> (leave blank if not applicable)</li>
                  )}
                  <li><b>Status</b>: Draft / Review / Pending Issue / Issued / Rejected / Reverted / Recalled / Cancelled. Default = Issued</li>
                  <li>Orders with status Issued get an auto-assigned {bulkKind === "Purchase Order" ? "PO" : "WO"} number if not provided</li>
                  <li>Non-Issued orders will continue normal workflow from that stage</li>
                  <li>Clauses accept multiple items separated by newline or <code>;</code></li>
                </ul>
              </div>

              <button onClick={downloadBulkTemplate}
                className="mb-4 text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5">
                <Download size={13} /> Download {bulkKind} Template
              </button>

              <input ref={bulkRef} type="file" accept=".xlsx,.xls" onChange={handleBulkFile} className="hidden" />
              <button onClick={() => bulkRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-300 rounded-xl p-6 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all text-center">
                <Upload size={20} className="mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-semibold text-slate-700">{bulkFileName || "Click to select Excel file"}</p>
                <p className="text-xs text-slate-400 mt-0.5">{bulkRows.length > 0 ? `${bulkRows.length} rows ready to import` : ".xlsx or .xls"}</p>
              </button>

              {bulkResult && (
                <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
                  <p className="font-bold text-slate-800 mb-2">Import Result</p>
                  <p className="text-slate-600">Orders detected in Excel: <b>{bulkResult.ordersInExcel}</b></p>
                  <p className="text-emerald-600">✓ Imported: {bulkResult.inserted}</p>
                  {bulkResult.failed?.length > 0 && (
                    <>
                      <p className="text-red-600 mt-1">✗ Failed: {bulkResult.failed.length}</p>
                      <ul className="mt-2 max-h-40 overflow-y-auto space-y-1">
                        {bulkResult.failed.map((f, i) => (
                          <li key={i} className="text-slate-600">
                            {f.orderKey && !f.orderKey.startsWith("__row_") ? <b>{f.orderKey}</b> : `Row ${f.row}`}: {f.reason}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button onClick={() => setShowBulk(false)}
                className="px-4 py-2 text-sm font-bold text-slate-600 rounded-lg hover:bg-slate-100">
                Close
              </button>
              <button onClick={handleBulkUpload} disabled={bulkSaving || bulkRows.length === 0}
                className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {bulkSaving ? <><Loader2 size={14} className="animate-spin" /> Importing...</> : <><Upload size={14} /> Import {bulkRows.length} Orders</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Orders", val: stats.total, icon: ShoppingBag, color: "text-[#4f46e5] bg-[#eef2ff]" },
          { label: "Total PO", val: stats.poCount, sub: `₹ ${stats.poValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: FileText, color: "text-[#2563eb] bg-[#eff6ff]" },
          { label: "Total WO", val: stats.woCount, sub: `₹ ${stats.woValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Box, color: "text-[#0891b2] bg-[#ecfeff]" },
          { label: "Taxable Value", val: `₹ ${(stats.poValue + stats.woValue).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: IndianRupee, color: "text-[#9333ea] bg-[#faf5ff]" },
        ].map((s, i) => (
          <div key={i} className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-[14px] ${s.color} flex items-center justify-center shrink-0`}>
              <s.icon size={20} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.08em] mb-0.5">{s.label}</p>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-base font-black text-slate-800 leading-none">{s.val}</span>
                {s.sub && <span className="text-[10px] font-bold text-indigo-600 leading-none">{s.sub}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-none border border-slate-100 shadow-sm">

        <div className="flex px-5 pt-4 pb-0 border-b border-slate-100 bg-white gap-8 overflow-x-auto thin-scrollbar-light">
          {TABS.map(t => {
            const count = getTabCount(t);
            return (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`pb-3.5 text-[13px] font-bold transition-all whitespace-nowrap border-b-[3px] flex items-center gap-2.5
                  ${activeTab === t ? "text-[#4f46e5] border-[#4f46e5]" : "text-slate-400 border-transparent hover:text-slate-600"}`}>
                {t}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === t ? "bg-[#4f46e5] text-white" : "bg-slate-100 text-slate-500"
                  }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-5 py-3 border-b border-slate-100 bg-[#f8fafc]/50 flex flex-col gap-3">
          <div className="flex items-center flex-wrap gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-[260px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search PO, subject, vendor..."
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 bg-white shadow-sm" />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {[
                { val: filterCompany, set: setFilterCompany, placeholder: "Entity", opts: companyOptions, min: 110, icon: Building2 },
                !project && { val: filterSite, set: setFilterSite, placeholder: "Sites", opts: siteOptions, min: 100, icon: MapPin },
                { val: filterType, set: setFilterType, placeholder: "Type", opts: ["Supply", "SITC", "ITC"], min: 100, icon: Tag },
                activeTab === "All" && { val: filterStatus, set: setFilterStatus, placeholder: "Status", opts: ["Draft", "Review", "Pending Issue", "Amendment Request", "Amended", "Issued", "Rejected", "Cancelled"], min: 110, icon: CheckCircle2 },
                { val: filterMadeBy, set: setFilterMadeBy, placeholder: "Users", opts: madeByOptions, min: 105, icon: User }
              ].filter(Boolean).map((f, i) => (
                <div key={i} className="relative" style={{ minWidth: f.min }}>
                  <f.icon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <select value={f.val} onChange={e => f.set(e.target.value)}
                    className="appearance-none w-full pl-7 pr-7 py-2 border border-slate-200 rounded-[12px] text-[11px] font-bold text-slate-600 bg-white outline-none focus:border-indigo-400 cursor-pointer shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] hover:border-slate-300 transition-all">
                    <option value="">{f.placeholder}</option>
                    {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              ))}

              <div className="relative" style={{ minWidth: 105 }}>
                <CalendarDays size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <select value={dateRange} onChange={e => setDateRange(e.target.value)}
                  className="appearance-none w-full pl-7 pr-7 py-2 border border-slate-200 rounded-[12px] text-[11px] font-bold text-slate-600 bg-white outline-none focus:border-indigo-400 cursor-pointer shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] hover:border-slate-300 transition-all">
                  <option value="all">All Time</option>
                  <option value="this_year">This Year</option>
                  <option value="last_year">Last Year</option>
                  <option value="custom">Custom</option>
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {dateRange === "custom" && (
              <>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-50" />
                <span className="text-xs text-slate-400">to</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-50" />
              </>
            )}

            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">
                Clear
              </button>
            )}

          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm italic font-medium animate-pulse">
            📦 Syncing orders... Please wait.
          </div>
        ) : (
          <div className="overflow-x-auto w-full rounded-none thin-scrollbar-light">
            <table className="w-full text-sm text-left border-separate border-spacing-0 whitespace-nowrap border-t border-l border-slate-200">
              <thead>
                <tr className="bg-slate-100">
                  <th className="sticky left-0 z-20 px-5 py-2 text-[13px] font-semibold text-slate-500 border-b border-r border-slate-200 bg-slate-100 whitespace-nowrap" style={{ width: '180px', minWidth: '180px', maxWidth: '180px' }}>Order No</th>
                  <th className="sticky z-20 px-5 py-2 text-[13px] font-semibold text-slate-500 border-b border-r border-slate-200 bg-slate-100 whitespace-nowrap text-center" style={{ left: '180px', width: '120px', minWidth: '120px', maxWidth: '120px' }}>Status</th>
                  <th className="px-5 py-2 text-[13px] font-semibold text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Order Type</th>
                  <th className="px-5 py-2 text-[13px] font-semibold text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Created By</th>
                  <th className="px-5 py-2 text-[13px] font-semibold text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Created On</th>
                  <th className="px-5 py-2 text-[13px] font-semibold text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Subject</th>
                  <th className="px-5 py-2 text-[13px] font-semibold text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Vendor</th>
                  <th className="px-5 py-2 text-[13px] font-semibold text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Issued At</th>
                  <th className="px-5 py-2 text-[13px] font-semibold text-slate-500 border-b border-r border-slate-200 text-right whitespace-nowrap">Taxable Amount</th>
                  <th className="px-5 py-2 text-[13px] font-semibold text-slate-500 border-b border-r border-slate-200 text-right whitespace-nowrap">Total Value</th>
                  <th className="sticky right-0 z-20 px-5 py-2 text-[13px] font-semibold text-slate-500 border-b border-r border-slate-200 bg-slate-100 text-center whitespace-nowrap [box-shadow:-1px_0_0_0_#e2e8f0]" style={{ width: '190px', minWidth: '190px', maxWidth: '190px' }}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="py-24 text-center bg-white">
                      <div className="flex flex-col items-center justify-center">
                        <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
                          <FileText size={24} className="text-slate-300" />
                        </div>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">
                          {search ? "No matches found" : "No orders found"}
                        </p>
                        <p className="text-slate-300 text-[10px] mb-4 text-center max-w-[240px]">
                          {search ? `Searching for "${search}" in ${activeTab} tab returned 0 results.` : `You don't have any orders in the ${activeTab} category yet.`}
                        </p>
                        {(search || activeTab !== "All") && (
                          <button onClick={() => { setSearch(""); setActiveTab("All"); }} className="text-indigo-600 hover:text-indigo-700 text-xs font-bold underline underline-offset-4 decoration-indigo-200">
                            Clear all filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(o => {
                  const snap = o.snapshot || {};
                  const cCode = snap.company?.companyCode || o.companies?.company_code || "-";
                  const sCode = snap.site?.siteCode || o.sites?.site_code || "-";
                  const vName = snap.vendor?.vendorName || o.vendors?.vendor_name || "-";

                  const typeCode = o.order_type === "Supply" ? "PO" : "WO";
                  const prefix = `${cCode}/${sCode}/${typeCode}/`;
                  const displayNo = o.order_number?.startsWith("PENDING-") ? prefix : o.order_number;

                  return (
                    <tr key={o.id} className="hover:bg-slate-50 transition-colors group bg-white">
                      <td className="sticky left-0 z-10 px-5 py-1 border-b border-r border-slate-200 bg-white group-hover:bg-slate-50 transition-colors whitespace-nowrap" style={{ width: '180px', minWidth: '180px', maxWidth: '180px' }}>
                        {displayNo ? (
                          <div className="flex items-center gap-2">
                            <button
                              onMouseEnter={() => preloadOrderDetails(o.id).catch(() => { })}
                              onFocus={() => preloadOrderDetails(o.id).catch(() => { })}
                              onClick={() => onViewClick(o)}
                              className="font-medium text-[13.5px] text-[#5b4fbe] hover:text-[#4236a1] transition-all text-left">
                              {displayNo}
                            </button>
                            <button
                              onClick={(e) => copyOrderNumber(displayNo, o.id, e)}
                              title={copiedOrderId === o.id ? "Copied!" : "Copy order number"}
                              className={`p-1 rounded transition-colors shrink-0 ${copiedOrderId === o.id ? "text-emerald-500" : "text-transparent group-hover:text-slate-300 hover:!text-slate-500"}`}>
                              {copiedOrderId === o.id ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          </div>
                        ) : (
                          <span className="font-medium text-[13.5px] text-slate-300">-</span>
                        )}
                      </td>
                      <td className="sticky z-10 px-5 py-1 border-b border-r border-slate-200 text-center whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors" style={{ left: '180px', width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                        <span style={{ whiteSpace: 'nowrap', display: 'inline-flex' }} className={`px-2.5 py-1 rounded-full text-[11px] font-medium
                           ${o.status === "Draft" ? "bg-slate-100 text-slate-600" :
                            o.status === "Approved" || o.status === "Issued" ? "bg-emerald-50 text-emerald-600" :
                              o.status === "Amendment Request" ? "bg-amber-100 text-amber-700" :
                                o.status === "Amended" ? "bg-slate-100 text-slate-600" :
                                  o.status === "Rejected" ? "bg-red-50 text-red-600" :
                                    o.status === "Review" ? "bg-sky-50 text-sky-600" :
                                      o.status === "Reverted" ? "bg-orange-50 text-orange-600" :
                                        o.status === "Recalled" ? "bg-purple-50 text-purple-600" :
                                          o.status === "Cancelled" ? "bg-slate-100 text-slate-500 line-through" :
                                            "bg-slate-100 text-slate-600"}`}>
                          {o.status || "Draft"}
                        </span>
                      </td>
                      <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-nowrap">
                        {o.order_type === "Supply" ? "Purchase Order" : o.order_type === "SITC" || o.order_type === "ITC" ? "Work Order" : (o.order_type || "-")}
                      </td>
                      <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-nowrap">
                        {o.made_by || "System"}
                      </td>
                      <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-nowrap">
                        {new Date(o.date_of_creation || o.created_at).toLocaleDateString("en-GB").replace(/\//g, '.')}
                      </td>
                      <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-normal min-w-[280px] leading-relaxed">
                        {o.subject || "-"}
                      </td>
                      <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-normal min-w-[200px] leading-relaxed">
                        {vName}
                      </td>
                      <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-nowrap">
                        {(["Issued", "Amended"].includes(o.status) && (o.totals?.issuedAt || o.updated_at))
                          ? new Date(o.totals?.issuedAt || o.updated_at).toLocaleDateString("en-GB").replace(/\//g, '.')
                          : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-700 text-[13.5px] font-medium text-right whitespace-nowrap">
                        {(() => {
                          const t = o.totals || {};
                          const sub = Number(t.subtotal) || 0;
                          const disc = Number(t.totalDiscountAmt) || 0;
                          const taxable = sub - disc;
                          return taxable > 0
                            ? `₹ ${taxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : <span className="text-slate-300 font-normal">-</span>;
                        })()}
                      </td>
                      <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-700 text-[13.5px] font-medium text-right whitespace-nowrap">
                        {(() => {
                          const totalVal = Number(o.totals?.grandTotal || 0);
                          return totalVal > 0
                            ? `₹ ${totalVal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : <span className="text-slate-300 font-normal">-</span>;
                        })()}
                      </td>
                      <td className="sticky right-0 z-10 px-5 py-1 border-b border-r border-slate-200 bg-white group-hover:bg-slate-50 transition-colors whitespace-nowrap [box-shadow:-1px_0_0_0_#e2e8f0]" style={{ width: '190px', minWidth: '190px', maxWidth: '190px' }}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onMouseEnter={() => preloadOrderDetails(o.id).catch(() => { })}
                            onFocus={() => preloadOrderDetails(o.id).catch(() => { })}
                            onClick={() => onViewClick(o)}
                            className="h-8 w-8 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all shadow-sm"
                            title="Quick View">
                            <Eye size={14} />
                          </button>
                          {canEditOrder(o) && (
                            <button onClick={() => onEditClick(o.id)}
                              className="h-8 w-8 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:text-sky-600 hover:border-sky-200 hover:bg-sky-50 transition-all shadow-sm"
                              title="Full Edit">
                              <Pencil size={13} />
                            </button>
                          )}
                          {canDeleteOrder(o) && (
                            <button onClick={() => handleDelete(o.id)}
                              className="h-8 w-8 rounded-md border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all shadow-sm"
                              title="Delete">
                              <Trash2 size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => openPDFPreview(o.id)}
                            className="h-8 w-8 rounded-md border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all shadow-sm"
                            title="Export PDF">
                            <FileDown size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============== MAIN CONTROLLER ==============
export default function CreateOrderWrapper({ project, editOrderId, onEditComplete }) {
  const [view, setView] = useState("list");
  const [viewId, setViewId] = useState(null);
  const [viewSeed, setViewSeed] = useState(null);
  const [localEditId, setLocalEditId] = useState(null);

  useEffect(() => {
    sessionStorage.removeItem("bms_co_view");
    sessionStorage.removeItem("bms_co_view_id");
  }, []);

  // Auto-switch to create view if editOrderId is provided from global state (App.jsx)
  useEffect(() => {
    if (editOrderId) setView("create");
  }, [editOrderId]);

  if (view === "create") {
    return (
      <OrderForm
        project={project}
        editOrderId={localEditId || editOrderId}
        onEditComplete={() => { if (onEditComplete) onEditComplete(); setLocalEditId(null); }}
        onCancel={() => { setView("list"); setLocalEditId(null); if (onEditComplete) onEditComplete(); }}
      />
    );
  }
  if (view === "view" && viewId) {
    return (
      <ViewOrder
        orderId={viewId}
        initialOrder={viewSeed}
        onBack={() => { setView("list"); setViewId(null); setViewSeed(null); }}
        onEdit={(id) => { setViewId(null); setViewSeed(null); setLocalEditId(id); setView("create"); }} // switch to form
      />
    );
  }
  return (
    <OrderList
      project={project}
      onCreateClick={() => { if (onEditComplete) onEditComplete(); setLocalEditId(null); setViewSeed(null); setView("create"); }}
      onViewClick={(order) => {
        const id = typeof order === "object" ? order.id : order;
        const seed = typeof order === "object" ? order : null;
        if (seed) seedOrderDetails(seed);
        setViewSeed(seed);
        setViewId(id);
        setView("view");
      }}
      onEditClick={(id) => { setViewSeed(null); setLocalEditId(id); setView("create"); }}
    />
  );
}
