import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Upload, Save, FileText, ChevronDown, ChevronRight, Check, Building2, MapPin, Truck, Landmark, ShieldCheck, FilePlus, Eye, Loader2, Pencil, Trash2, Download, FileDown, Rocket, Undo2, Ban, CheckCircle2, RotateCcw, RefreshCw, XCircle, Search, FileSpreadsheet, Copy, ShoppingCart, IndianRupee, Hammer, ShoppingBag, Box, CalendarDays, User, Tag, Activity, Calendar } from "lucide-react";
import * as XLSX from "xlsx";
import { FullCompanyModal, FullVendorModal, FullViewSiteModal, FullViewCompanyModal, FullViewVendorModal, FullContactModal, FullViewContactModal, FullClauseModal } from "./FullMasterModals";
import ProjectFormModal from "../../components/ProjectFormModal";
import ProjectSelect from "../../components/ProjectSelect";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import ViewOrder from "../Procurement/ViewOrder";
import { preloadOrderDetails, seedOrderDetails, getCachedOrderDetails } from "../Procurement/orderDetailsCache";
import { normalizeOrderSite, getOrderSiteCode, siteCodeMatch } from "../../utils/orderSite";
import { authFetch, getValidToken } from "../../utils/authFetch";

// Module-level master data cache — avoids re-fetching on every form open (TTL: 2 min)
let _masterCache = null;
let _masterCacheAt = 0;
const MASTER_CACHE_TTL = 2 * 60 * 1000;
const invalidateMasterCache = () => { _masterCache = null; _masterCacheAt = 0; };

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
  /* Thin scrollbar for calc modal tables */
  .calc-thin-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
  .calc-thin-scroll::-webkit-scrollbar-track { background: transparent; }
  .calc-thin-scroll::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.8); border-radius: 999px; }
  .calc-thin-scroll::-webkit-scrollbar-thumb:hover { background: rgba(99,102,241,0.9); }
  .scrollbar-thin::-webkit-scrollbar { width: 2px; height: 2px; }
  .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
  .scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
  .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
  .table-fixed-header th { position: sticky; top: 0; z-index: 10; }
  /* Ensure ALL header cells share identical tint (solid, non-transparent) */
  .create-order-items-table thead th { background: rgb(243, 243, 245); }
  /* Hide number input spinners (use class on specific inputs) */
  .no-spin::-webkit-outer-spin-button,
  .no-spin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .no-spin { -moz-appearance: textfield; appearance: textfield; }
  /* Column separators for Create Order items table */
  .col-lines { border-collapse: separate; border-spacing: 0; }
  .col-lines th, .col-lines td { border-right: 1px solid rgba(226,232,240,0.9); }
  .col-lines th:last-child, .col-lines td:last-child { border-right: 0; }
  /* Don't double-border next to sticky action column */
  .col-lines .no-col-line { border-right: 0 !important; }
  /* Full-width row divider (use on group header row) */
  .col-lines tr.row-divider > td,
  .col-lines tr.row-divider > th { border-top: 1px solid rgba(226,232,240,0.9); }
`;

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
let cachedOrders = null;

const CancelledStampIcon = ({ size = 14, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <circle cx="32" cy="32" r="24" stroke="currentColor" strokeWidth="5" />
    <circle cx="32" cy="32" r="17" stroke="currentColor" strokeWidth="4" />
    <g transform="rotate(-45 32 32)">
      <rect x="5" y="24" width="54" height="16" rx="8" fill="white" stroke="currentColor" strokeWidth="5" />
      <text
        x="32"
        y="35"
        textAnchor="middle"
        fontSize="9"
        fontWeight="900"
        fill="currentColor"
        fontFamily="Arial, sans-serif"
        letterSpacing="0"
      >
        CANCELLED
      </text>
    </g>
  </svg>
);

const normalizeRichTextHtml = (value) =>
  typeof value === "string"
    ? value.replace(/&nbsp;|&#160;|\u00A0/g, " ")
    : value;

const normalizeRichTextArray = (value) =>
  Array.isArray(value) ? value.map(normalizeRichTextHtml) : [];

const hasRecallHistory = (order = {}) => {
  const snapshot = order.snapshot || {};
  const matchesRecall = (entry) => String(entry?.action || entry?._history_action || "").toLowerCase() === "recalled";
  return order.status === "Recalled" ||
    matchesRecall(order) ||
    (Array.isArray(snapshot.activity_log) && snapshot.activity_log.some(matchesRecall)) ||
    (Array.isArray(snapshot.status_history) && snapshot.status_history.some(matchesRecall));
};

const makeOrderPdfFilename = (orderNumber, fallback = "Order") => {
  const base = String(orderNumber || fallback).trim().replace(/\.pdf$/i, "") || fallback;
  return `${base.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")}.pdf`;
};


/* Strip Quill v2 internal markers and convert flat ql-indent lists to nested lists. */
const cleanQuillHTML = (html) => {
  if (!html) return "";

  if (typeof document === "undefined") {
    return html
      .replace(/<span class="ql-ui"[^>]*><\/span>/gi, "")
      .replace(/<span class="ql-ui"[^>]*\/>/gi, "")
      .replace(/\s*data-list="[^"]*"/gi, "")
      .replace(/\s*class="ql-indent-\d+"/gi, "");
  }

  const container = document.createElement("div");
  container.innerHTML = html;

  const stripQuillListAttrs = (root) => {
    root.querySelectorAll(".ql-ui").forEach(el => el.remove());
    root.querySelectorAll("li").forEach(li => {
      li.removeAttribute("data-list");
      const classes = (li.getAttribute("class") || "")
        .split(/\s+/)
        .filter(cls => cls && !/^ql-indent-\d+$/.test(cls));
      if (classes.length) li.setAttribute("class", classes.join(" "));
      else li.removeAttribute("class");
    });
  };
  const directListItems = (list) =>
    Array.from(list.children).filter(child => child.tagName === "LI");
  const getIndent = (li) => {
    const match = (li.getAttribute("class") || "").match(/\bql-indent-(\d+)\b/);
    return match ? Number(match[1]) || 0 : 0;
  };
  const getListTag = (li, fallbackTag) =>
    li.getAttribute("data-list") === "bullet" ? "ul" : fallbackTag;
  const itemHtml = (li) => {
    const clone = li.cloneNode(true);
    Array.from(clone.children)
      .filter(child => child.tagName === "OL" || child.tagName === "UL")
      .forEach(child => child.remove());
    stripQuillListAttrs(clone);
    return clone.innerHTML;
  };
  const buildNestedList = (items, fallbackTag) => {
    const root = document.createElement(items[0]?.tag || fallbackTag);
    const listsAtLevel = [root];
    const lastLiAtLevel = [];
    items.forEach(item => {
      let level = item.indent;
      while (level > 0 && !lastLiAtLevel[level - 1]) level -= 1;
      if (level > 0 && !listsAtLevel[level]) {
        const childList = document.createElement(item.tag);
        lastLiAtLevel[level - 1].appendChild(childList);
        listsAtLevel[level] = childList;
      }
      if (level > 0 && listsAtLevel[level].tagName.toLowerCase() !== item.tag) {
        const childList = document.createElement(item.tag);
        lastLiAtLevel[level - 1].appendChild(childList);
        listsAtLevel[level] = childList;
      }
      const li = document.createElement("li");
      li.innerHTML = item.html;
      listsAtLevel[level].appendChild(li);
      lastLiAtLevel[level] = li;
      listsAtLevel.length = level + 1;
      lastLiAtLevel.length = level + 1;
    });
    return root;
  };

  Array.from(container.querySelectorAll("ol, ul")).forEach(list => {
    if (!container.contains(list)) return;
    const listItems = directListItems(list);
    const hasQuillFlatItems = listItems.some(li =>
      li.hasAttribute("data-list") || /\bql-indent-\d+\b/.test(li.getAttribute("class") || "")
    );
    if (!hasQuillFlatItems) return;
    const fallbackTag = list.tagName.toLowerCase();
    const items = listItems.map(li => ({
      indent: getIndent(li),
      tag: getListTag(li, fallbackTag),
      html: itemHtml(li),
    }));
    list.replaceWith(buildNestedList(items, fallbackTag));
  });

  stripQuillListAttrs(container);
  return container.innerHTML;
};

/* Get single clean HTML string from a points array (Quill v2 or legacy format) */
const getCleanHTML = (points) => {
  // Strip legacy __sp: style prefix from the first element if present
  const pts = points?.[0]?.startsWith?.("__sp:") ? [points[0].slice(5), ...points.slice(1)] : points;
  if (!pts || !pts.length) return "";
  if (pts.length === 1 && pts[0].includes('<')) return cleanQuillHTML(normalizeRichTextHtml(pts[0]));
  return `<ol>${pts.map(p => `<li>${normalizeRichTextHtml(p)}</li>`).join('')}</ol>`;
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

const FIELD_LABEL_CLASS = "block text-[15px] font-semibold text-slate-950 mb-2 tracking-normal";
const FIELD_BASE_CLASS = "w-full border border-slate-300 rounded px-4 text-[15px] font-normal outline-none transition-colors bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-400 focus:ring-0";
const FIELD_READONLY_CLASS = "bg-[#f7f7f7] text-slate-500 cursor-not-allowed";

const Input = ({ label, value: propValue, onChange, placeholder, type = "text", required, mono, span2, readOnly, disabled, className, multiline, rows = 4 }) => {
  const [localValue, setLocalValue] = useState(propValue || "");
  const timerRef = useRef(null);
  const isLocked = readOnly || disabled;

  useEffect(() => {
    setLocalValue(propValue || "");
  }, [propValue]);

  const handleChange = (e) => {
    if (isLocked) return;
    const val = e.target.value;
    setLocalValue(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (typeof onChange === "function") onChange({ target: { value: val } });
    }, 50); // Small delay to batch updates
  };

  const handleBlur = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (typeof onChange === "function") onChange({ target: { value: localValue } });
  };

  return (
    <div className={span2 ? "col-span-2" : ""}>
      {label && <label className={FIELD_LABEL_CLASS}>{label} {required && <span className="text-red-500">*</span>}</label>}
      {multiline ? (
        <textarea
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          rows={rows}
          className={`${FIELD_BASE_CLASS} py-3 min-h-[102px] resize-y ${isLocked ? FIELD_READONLY_CLASS : ""} ${mono ? "font-mono" : ""} ${className || ""}`}
        />
      ) : (
        <input
          type={type}
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          className={`${FIELD_BASE_CLASS} h-14 ${isLocked ? FIELD_READONLY_CLASS : ""} ${mono ? "font-mono" : ""} ${className || ""}`}
        />
      )}
    </div>
  );
};

const SpecViewModal = ({ html, onClose, onEdit, clauseCode, clauseType, clauseTitle }) => {
  const isClause = Boolean(clauseCode || clauseType || clauseTitle);
  // Setup-like colors based on clause type
  const getTheme = () => {
    const type = (clauseType || "").toLowerCase();
    if (type.includes("payment")) return { header: "from-emerald-500 to-teal-600", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" };
    if (type.includes("governing")) return { header: "from-amber-500 to-orange-600", iconBg: "bg-amber-50", iconColor: "text-amber-600" };
    if (type.includes("annexure")) return { header: "from-rose-500 to-pink-600", iconBg: "bg-rose-50", iconColor: "text-rose-600" };
    return { header: "from-indigo-500 to-purple-600", iconBg: "bg-indigo-50", iconColor: "text-indigo-600" };
  };
  const theme = getTheme();

  return (
    <div className={`fixed inset-0 z-[1200] flex ${isClause ? "justify-end" : "items-center justify-center p-4"}`}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative w-full bg-white shadow-2xl flex flex-col ${
          isClause
            ? "max-w-[560px] h-full border-l border-slate-200"
            : "max-w-[760px] max-h-[85vh] rounded-2xl border border-slate-200"
        }`}
        style={isClause ? { animation: "slideInRight 0.3s ease-out" } : { animation: "fadeIn 0.15s ease-out" }}
      >
        {/* HEADER */}
        {isClause ? (
          <div className={`px-6 py-6 border-b border-slate-100 shrink-0 bg-gradient-to-r ${theme.header}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className={`w-11 h-11 rounded-2xl ${theme.iconBg} flex items-center justify-center shrink-0 shadow-lg shadow-black/10`}>
                  <ShieldCheck size={22} className={theme.iconColor} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-white/80 uppercase tracking-[0.2em] font-black mb-1">Clause Preview</p>
                  <h3 className="text-lg font-bold text-white leading-tight truncate">{clauseTitle || "Clause Details"}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-white/20 text-white backdrop-blur-md border border-white/20`}>
                      {clauseCode || "N/A"}
                    </span>
                    {!!clauseType && (
                      <span className="px-2.5 py-1 rounded-lg bg-white/10 text-white/90 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border border-white/10">
                        {clauseType}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition-all">
                <X size={20} />
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5 border-b border-slate-100 shrink-0 bg-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-slate-900/5 flex items-center justify-center text-slate-700 border border-slate-200">
                  <FileText size={20} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Specification</p>
                  <h3 className="text-base font-black text-slate-900 leading-tight truncate">Specification Details</h3>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all">
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        {/* SETUP-STYLE BODY */}
        <div className={`${isClause ? "p-8" : "p-6"} overflow-y-auto flex-1 premium-scroll bg-white`}>
          <div className="quill-content text-[15px] text-slate-700 leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: html || '' }} />
        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-all">Close</button>
          <button onClick={onEdit} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200 active:scale-95">
            <Pencil size={14} /> {isClause ? "Edit Clause" : "Edit Spec"}
          </button>
        </div>
      </div>
    </div>
  );
};

const InlineSelect = ({ value, onChange, options, placeholder, className, disabled, onAdd, addLabel, onEdit, onView, renderHtml, searchable, minDropWidth, variant }) => {
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
        className={`w-full cursor-pointer border flex items-center gap-1.5 transition-all
          ${variant === "table" ? "min-h-[34px] px-2 py-2 rounded-[6px] text-xs" : "min-h-[30px] px-2 py-1.5 rounded-md text-xs"}
          ${disabled ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-100" : "bg-white border-slate-200 hover:border-slate-300"}
          ${open ? "border-slate-400" : ""} ${className}`}>
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
            title="View Details"
          >
            <Eye size={14} />
          </button>
        )}
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[1100]" onClick={() => setOpen(false)} />
          <div ref={dropdownRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 1101 }}
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
        </>,
        document.body
      )}
    </div>
  );
};

const Select = ({ label, value, onChange, options, valueKey = "id", labelKey = "name", subLabelKey, placeholder, required, span2, onAdd, addLabel, onView, isMulti, disabled }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  const toSnake = (key) => String(key || "").replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
  const getField = (obj, key) => {
    if (!obj || !key) return "";
    const direct = obj[key];
    if (direct !== undefined && direct !== null && direct !== "") return direct;
    const snake = obj[toSnake(key)];
    if (snake !== undefined && snake !== null) return snake;
    return "";
  };
  const cleanText = (v) => String(v || "").trim().replace(/^["']|["']$/g, "");
  const extractCityState = (addr) => {
    const raw = cleanText(addr);
    if (!raw) return "";
    const parts = raw
      .split(",")
      .map(p => p.trim())
      .filter(Boolean)
      .filter(p => !/^\d{5,6}$/.test(p)); // drop pure pincode token
    if (parts.length === 0) return "";
    // Prefer last two tokens (city, state). If last token looks like country/pincode, it's already dropped.
    const state = parts[parts.length - 1] || "";
    const city = parts[parts.length - 2] || "";
    const res = [city, state].filter(Boolean).join(", ");
    return res || state || city || "";
  };
  const siteSecondary = (o) => {
    const d = cleanText(getField(o, "district") || getField(o, "city"));
    const s = cleanText(getField(o, "state"));
    return [d, s].filter(Boolean).join(", ");
  };

  useEffect(() => {
    const handleOutside = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const selectedOptions = isMulti
    ? options.filter(o => (value || []).includes(o[valueKey]))
    : options.filter(o => o[valueKey] === value);

  const filteredOptions = options.filter(o => {
    const labelTxt = String(getField(o, labelKey) || "").toLowerCase();
    const subTxt = subLabelKey ? String(getField(o, subLabelKey) || "").toLowerCase() : "";
    const text = `${labelTxt} ${subTxt}`.trim();
    return text.includes(search.toLowerCase());
  });
  const totalKind = (() => {
    const low = String(label || "").toLowerCase();
    if (low.includes("vendor")) return "Vendors";
    if (low.includes("company") || low.includes("business entity")) return "Companies";
    if (low.includes("site")) return "Sites";
    if (low.includes("contact")) return "Contacts";
    return "Results";
  })();
  const prefersResultsFound = (() => {
    const low = String(label || "").toLowerCase();
    return low.includes("site") || low.includes("location");
  })();

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
      <label className={FIELD_LABEL_CLASS}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div
        onClick={() => !disabled && setOpen(!open)}
        className={`${FIELD_BASE_CLASS} h-14 flex justify-between items-center
          ${disabled ? FIELD_READONLY_CLASS : "cursor-pointer hover:border-slate-400"}
          ${open ? "border-slate-400" : ""}`}
      >
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {selectedOptions.length > 0 ? (
            selectedOptions.map(o => (
              <span key={o[valueKey]} className={`${isMulti ? "bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded text-[12px] font-medium flex items-center gap-1 max-w-full" : "text-slate-950 truncate"}`}>
                <span className="truncate">{getField(o, labelKey)}</span>
                {isMulti && !disabled && (
                  <X size={10} className="hover:text-red-500 cursor-pointer shrink-0" onClick={(e) => { e.stopPropagation(); handleToggle(o[valueKey]); }} />
                )}
              </span>
            ))
          ) : (
            <span className='text-slate-400'>{placeholder || 'Select...'}</span>
          )}
        </div>
        {!disabled && <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : "ml-2"}`} />}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded shadow-lg flex flex-col overflow-hidden min-w-[240px]">
          <div className="p-2 border-b border-slate-100 bg-white">
            <input type="text" autoFocus value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50/50 shadow-sm"
              placeholder="Search here..." />
          </div>
          <div className="overflow-y-auto max-h-56 w-full scrollbar-thin">
            {!required && !isMulti && (
              <div onClick={() => { onChange({ target: { value: "" } }); setOpen(false); setSearch(""); }}
                className={`px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 transition-colors ${!value ? "text-slate-400 font-bold" : "text-slate-400"}`}>
                {placeholder || 'Clear Selection'}
              </div>
            )}
            {options.length > 0 && (
              <div className="px-4 py-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border-b border-slate-100">
                {prefersResultsFound ? `${filteredOptions.length} results found` : `Total ${totalKind}: ${options.length}`}
              </div>
            )}
            {filteredOptions.map(o => {
              const isSelected = isMulti ? (value || []).includes(o[valueKey]) : value === o[valueKey];
              const primary = getField(o, labelKey);
              const secondary = subLabelKey ? getField(o, subLabelKey) : "";
              const isAddressStyle = subLabelKey === "address";
              const isCompanyStyle = subLabelKey === "companyCode";
              const isSiteStyle = subLabelKey === "siteCode";
              const useChevronView = ["address", "companyCode", "siteCode", "code"].includes(subLabelKey);
              const secondaryLine = isAddressStyle ? extractCityState(secondary) : secondary;
              const gstin = getField(o, "gstin") || getField(o, "billingGstin") || getField(o, "billing_gstin");
              return (
                <div key={o[valueKey]}
                  className={`flex items-center justify-between px-4 py-2 cursor-pointer transition-colors group border-b border-slate-100 last:border-0
                    ${isSelected ? "bg-indigo-50" : "bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex-1 min-w-0" onClick={() => handleToggle(o[valueKey])}>
                    {isSiteStyle ? (
                      <div className="min-w-0">
                        <p className={`text-[13px] truncate ${isSelected ? "text-indigo-700 font-semibold" : "text-slate-900 font-semibold"}`}>
                          {primary}{secondary ? ` (${secondary})` : ""}
                        </p>
                        {siteSecondary(o) && (
                          <p className="text-[11px] text-slate-500 truncate leading-tight">{siteSecondary(o)}</p>
                        )}
                      </div>
                    ) : isCompanyStyle ? (
                      <div className="min-w-0">
                        <p className={`text-[13px] truncate ${isSelected ? "text-indigo-700 font-semibold" : "text-slate-900 font-semibold"}`}>
                          {primary}
                        </p>
                        {secondary && (
                          <p className="text-[11px] text-slate-600 truncate mt-0.5">
                            <span className="text-slate-500">Code:</span> <span className="font-semibold text-slate-700">{secondary}</span>
                          </p>
                        )}
                        {gstin && (
                          <p className="text-[11px] text-slate-600 truncate">
                            <span className="text-slate-500">GSTIN:</span> {gstin}
                          </p>
                        )}
                      </div>
                    ) : isAddressStyle ? (
                      <div className="min-w-0">
                        <p className={`text-[13px] truncate ${isSelected ? "text-indigo-700 font-semibold" : "text-slate-900 font-semibold"}`}>
                          {primary}
                        </p>
                        {secondaryLine && (
                          <p className="text-[11px] text-slate-500 truncate leading-tight">{secondaryLine}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {subLabelKey && secondaryLine && (
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-sm shrink-0 uppercase tracking-tight">
                            {secondaryLine}
                          </span>
                        )}
                        <p className={`text-sm truncate ${isSelected ? "text-indigo-700 font-bold" : "text-slate-700 font-semibold"}`}>{primary}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    {isMulti && isSelected && <Check size={14} className="text-indigo-600" />}
                    {onView && useChevronView ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpen(false); onView(o); }}
                        className="p-1 rounded-md text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
                        title="View"
                      >
                        <ChevronRight size={16} />
                      </button>
                    ) : onView ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpen(false); onView(o); }}
                        className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors shrink-0"
                        title="View"
                      >
                        <Eye size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {filteredOptions.length === 0 && <div className="px-4 py-4 text-center text-xs text-slate-400">No results found</div>}
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
    <label className={`w-full flex items-center justify-between border rounded-md px-3 py-2.5 text-sm cursor-pointer transition-all
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
        <div key={i} className="flex items-center justify-between bg-white border border-emerald-100 rounded-md px-3 py-2 shadow-sm animate-in fade-in slide-in-from-left-2 transition-all">
          <div
            className={`flex items-center gap-2 min-w-0 ${onPreview ? 'cursor-pointer hover:opacity-80' : ''}`}
            onClick={() => onPreview && onPreview(f)}
          >
            {(() => {
              const n = ((f instanceof File ? f.name : f.name) || "").toLowerCase();
              const isPdf = n.endsWith(".pdf");
              const isXls = /\.(xlsx?|csv)$/.test(n);
              const isImg = /\.(png|jpe?g|gif|webp|svg)$/.test(n);
              return (
                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isPdf ? "bg-red-50" : isXls ? "bg-green-50" : isImg ? "bg-blue-50" : "bg-emerald-50"}`}>
                  {isPdf ? <FileText size={14} className="text-red-500" /> : isXls ? <FileSpreadsheet size={14} className="text-green-600" /> : <FileText size={14} className="text-emerald-500" />}
                </div>
              );
            })()}
            <span className={`text-xs font-medium text-slate-700 truncate ${onPreview ? 'hover:text-emerald-600 hover:underline' : ''}`}>{f.name}</span>
          </div>
          <button onClick={() => onRemove(i)} className="p-1 hover:text-red-500 text-slate-400 transition-colors">
            <X size={14} />
          </button>
        </div>
      ))}
      {files.length < max && (
        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-md p-2.5 cursor-pointer transition-all text-slate-400 hover:text-indigo-600 group">
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

const autoGrowTextarea = (el) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

const formatINR = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function OrderForm({ project, onCancel, editOrderId, onEditComplete }) {
  const user = JSON.parse(localStorage.getItem("bms_user") || "{}");

  const [orders, setOrders] = useState(() => {
    try {
      const cached = localStorage.getItem("bms_procurement_orders");
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(orders.length === 0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }
  const [actionModal, setActionModal] = useState({ type: null, data: null });
  const [calcModalOpen, setCalcModalOpen] = useState(false);
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
  const [categories, setCategories] = useState([]);
  const [uomList, setUomList] = useState([]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000); // Background sync every 30s
    return () => clearInterval(interval);
  }, []);

  // Body scroll lock for modals/drawers
  useEffect(() => {
    const isModalOpen = actionModal.type || specViewModal.open || uomModal.open || customInputModal.open || confirmModal || calcModalOpen;
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = "6px"; // Prevent layout shift
    } else {
      document.body.style.overflow = "auto";
      document.body.style.paddingRight = "0px";
    }
    return () => {
      document.body.style.overflow = "auto";
      document.body.style.paddingRight = "0px";
    };
  }, [actionModal.type, specViewModal.open, uomModal.open, customInputModal.open, confirmModal, calcModalOpen]);

  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API}/api/orders`);
      const data = await res.json();
      const newOrders = data.orders || [];
      setOrders(newOrders);
      localStorage.setItem("bms_procurement_orders", JSON.stringify(newOrders));
    } catch (err) {
      console.error("Fetch orders failed", err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-select site based on project prop
  useEffect(() => {
    if (project && sites.length > 0) {
      const match = sites.find(s => s.projectCode === project);
      if (match) {
        setHeader(h => ({ ...h, siteId: match.id }));
        setSiteDetails(match || null);
      }
    }
  }, [project, sites]);

  // Form State - Header
  const [header, setHeader] = useState({
    orderType: "Supply", orderNumber: "", refNumber: "", subject: "", orderName: "",
    siteId: "", companyId: "", vendorId: "", categoryId: "", contactPersonIds: [],
    requestBy: "", madeBy: user.name || "", priority: "Medium", deliveryDate: "",
    creationDate: new Date().toISOString().split('T')[0],
    notes: ""
  });
  const [nextSerial, setNextSerial] = useState(1);

  // Read-only populated details
  const [siteDetails, setSiteDetails] = useState(null);
  const [companyDetails, setCompanyDetails] = useState(null);
  const [vendorDetails, setVendorDetails] = useState(null);
  const [isRecalledEdit, setIsRecalledEdit] = useState(false);

  // Sync siteDetails/companyDetails when IDs change (covers edit-load and manual selection)
  useEffect(() => {
    if (header.siteId && sites.length) setSiteDetails(sites.find(s => s.id === header.siteId) || null);
  }, [header.siteId, sites]);

  useEffect(() => {
    if (header.companyId && companies.length) setCompanyDetails(companies.find(c => c.id === header.companyId) || null);
  }, [header.companyId, companies]);

  // Form State - Items Table (grouped: each group = one item, multiple spec sub-rows)
  const [items, setItems] = useState([makeGroup()]);

  // Settings / Toggles
  const [settings, setSettings] = useState({
    model: false, brand: true, remarks: false,
    taxMode: 'line',
    discountMode: 'none',
    frightMode: 'none'
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPos, setSettingsPos] = useState({ top: 0, right: 0 });
  const settingsBtnRef = useRef(null);
  const notesRef = useRef("");
  const [notesLoadedAt, setNotesLoadedAt] = useState(null);
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
      if (editOrderId) {
        await Promise.all([fetchMasterData(), fetchOrderForEdit()]);
      } else {
        await fetchMasterData();
        setIsRecalledEdit(false);
      }
    };
    init();
  }, [editOrderId]);

  const fetchOrderForEdit = async () => {
    setLoading(true);
    try {
      // Use cache if already preloaded (hover triggered preload), else fetch fresh
      const cached = getCachedOrderDetails(editOrderId);
      let order, rawItems;
      if (cached && !cached.__partial) {
        ({ order, items: rawItems } = cached);
      } else {
        const res = await authFetch(`${API}/api/orders/${editOrderId}?lean=1`);
        ({ order, items: rawItems } = await res.json());
      }
      setIsRecalledEdit(hasRecallHistory(order));

      // 1. Map Header
      setHeader({
        orderType: order.order_type,
        orderNumber: order.order_number,
        refNumber: order.ref_number || "",
        subject: order.subject,
        orderName: order.order_name,
        siteId: order.site_id,
        companyId: order.company_id,
        vendorId: order.vendor_id,
        categoryId: order.category_id || order.snapshot?.categoryId || order.snapshot?.category?.id || "",
        contactPersonIds: (order.snapshot?.contacts && order.snapshot.contacts.length > 0)
          ? order.snapshot.contacts.map(c => c.id)
          : [order.contact_person_id].filter(Boolean),
        requestBy: order.request_by,
        madeBy: order.made_by,
        priority: order.priority,
        deliveryDate: order.delivery_date ? order.delivery_date.split('T')[0] : "",
        creationDate: order.date_of_creation ? order.date_of_creation.split('T')[0] : "",
        notes: normalizeRichTextHtml(order.notes || order.snapshot?.notes || "")
      });
      setNotesLoadedAt(Date.now());

      setTcPoints(normalizeRichTextArray(order.terms_conditions));
      setPayPoints(normalizeRichTextArray(order.payment_terms));
      setGovPoints(normalizeRichTextArray(order.governing_laws));
      setAnxPoints(normalizeRichTextArray(order.annexures));

      // Map Existing Files
      const existingQuotations = [];
      if (order.quotation_url) {
        let qUrls = [];
        try { const p = JSON.parse(order.quotation_url); if (Array.isArray(p)) qUrls = p.filter(Boolean); else throw 0; }
        catch { qUrls = [order.quotation_url]; }
        qUrls.forEach(url => existingQuotations.push({
          name: decodeURIComponent(url.split('/').pop().split('?')[0]).replace(/^quotation_\d+_/, '') || "Existing Quotation",
          url,
          isExisting: true
        }));
      }

      const existingProof = [];
      if (order.comparative_sheet_url) {
        existingProof.push({
          name: order.comparative_sheet_url.split('/').pop().split('?')[0].replace(/^comparative_\d+_/, '') || "Existing Comparative",
          url: order.comparative_sheet_url,
          isExisting: true
        });
      }

      const existingOthers = (Array.isArray(order.pre_documents) ? order.pre_documents : [])
        .filter(d => d.category === "other")
        .map(d => ({
          id: d.id,
          name: d.name || decodeURIComponent((d.storage_path || d.url || "").split('/').pop().split('?')[0]) || "Other Document",
          url: d.url,
          isExisting: true
        }));

      setFiles({
        quotations: existingQuotations,
        proof: {
          type: order.comparative_sheet_url ? "Comparative Docs" : "",
          files: existingProof
        },
        others: existingOthers
      });

      // 2. Map Settings & Totals
      let t = order.totals || {};
      if ((!t || !t.subtotal) && order.snapshot?.totals) {
        t = order.snapshot.totals;
      }
      setSettings(s => ({
        ...s,
        taxMode: t.tax_mode === "none" ? "none" : t.tax_mode === "total" ? "total" : "line",
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
      setIsRecalledEdit(false);
      showToast("Failed to load order for editing", "error");
    }
    setLoading(false);
  };

  const fetchMasterData = async (force = false) => {
    try {
      if (!force && _masterCache && Date.now() - _masterCacheAt < MASTER_CACHE_TTL) {
        const { sites, companies, vendors, contacts, items, clauses, categories, uoms } = _masterCache;
        setSites(sites); setCompanies(companies); setVendors(vendors); setContacts(contacts);
        setItemsList(items); setClauses(clauses); setCategories(categories); setUomList(uoms);
        return;
      }
      const [sRes, cRes, vRes, coRes, iRes, clRes, catRes, uomRes] = await Promise.all([
        fetch(`${API}/api/projects`),
        fetch(`${API}/api/procurement/companies`),
        fetch(`${API}/api/procurement/vendors`),
        fetch(`${API}/api/organisation/employees`),
        fetch(`${API}/api/procurement/items`),
        fetch(`${API}/api/procurement/clauses`),
        fetch(`${API}/api/procurement/categories`),
        fetch(`${API}/api/procurement/uom`),
      ]);
      const [s, c, v, co, i, cl, cat, uom] = await Promise.all([
        sRes.json(), cRes.json(), vRes.json(), coRes.json(),
        iRes.json(), clRes.json(), catRes.json(), uomRes.json(),
      ]);
      const sites = s.projects || [], companies = c.companies || [], vendors = v.vendors || [],
            contacts = co.contacts || [], items = i.items || [], clauses = cl.clauses || [],
            categories = cat.categories || [], uoms = uom.uoms || [];
      _masterCache = { sites, companies, vendors, contacts, items, clauses, categories, uoms };
      _masterCacheAt = Date.now();
      setSites(sites); setCompanies(companies); setVendors(vendors); setContacts(contacts);
      setItemsList(items); setClauses(clauses); setCategories(categories); setUomList(uoms);
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

    return `${c?.companyCode || "COMP"} / ${s?.projectCode || "SITE"} / ${type}`;
  }, [header.orderNumber, header.siteId, header.companyId, header.orderType, companies, sites]);

  // Reference No prefix: Company/Proc/Site/Type/FY/ — auto-derived, user only types the trailing number
  const computedRefPrefix = useMemo(() => {
    if (!header.siteId || !header.companyId || !header.orderType) return "";
    const c = companies.find(x => x.id === header.companyId);
    const s = sites.find(x => x.id === header.siteId);
    const type = header.orderType === "Supply" ? "PO" : "WO";
    const d = new Date(), m = d.getMonth(), y = d.getFullYear();
    const fyStart = m >= 3 ? y : y - 1;
    const fy = `${fyStart}-${String(fyStart + 1).slice(-2)}`;
    return `${c?.companyCode || "COMP"}/Proc/${s?.projectCode || "SITE"}/${type}/${fy}/`;
  }, [header.siteId, header.companyId, header.orderType, companies, sites]);

  const refSuffix = computedRefPrefix && header.refNumber.startsWith(computedRefPrefix)
    ? header.refNumber.slice(computedRefPrefix.length)
    : header.refNumber;

  const handleRefSuffixChange = (val) => {
    setHeader(h => ({ ...h, refNumber: (computedRefPrefix || "") + val }));
  };


  // Reset items + brand setting when order type changes (skip during edit load)
  useEffect(() => {
    if (editOrderId) return;
    setItems([makeGroup()]);
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

  // State-matched billing profile: site.state → company.stateBillingProfiles
  // Returns { address, gstin, contactName, contactPhone, source: "state"|"entity"|null }
  const billingProfile = useMemo(() => {
    if (!companyDetails) return null;
    const st = siteDetails?.state;
    const blocks = companyDetails.stateBillingProfiles || [];

    // 1. Try state-specific profile
    if (st && blocks.length) {
      const block = blocks.find(b => b.stateName?.toLowerCase() === st.toLowerCase());
      const profile = block?.profiles?.find(p => p.isDefault) || block?.profiles?.[0];
      if (profile) return { ...profile, source: "state" };
    }

    // 2. Fallback: entity-level billing address + gstin
    const fallbackAddr = companyDetails.billingAddress || companyDetails.address || "";
    const fallbackGstin = companyDetails.billingGstin || companyDetails.gstin || "";
    if (fallbackAddr || fallbackGstin) {
      return { address: fallbackAddr, gstin: fallbackGstin, source: "entity" };
    }
    return null;
  }, [siteDetails, companyDetails]);
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
      if (key === 'taxMode' && val === 'none') setTransactionTax(0);
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
      if (settings.taxMode === 'line') {
        // Item-level GST always uses the item's own base (line discount only, not global)
        rowGst = base * (tax / 100);
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

    if (settings.taxMode === 'total') {
      // Total (single) Tax Mode
      let taxableBase = itemsNet;
      if (settings.frightMode === "before") taxableBase += fAmt;
      finalGst = taxableBase * (Number(transactionTax) / 100);
    } else if (settings.taxMode === 'none') {
      finalGst = 0;
    } else {
      // Individual Tax Mode
      // If global discount is applied, proportionally reduce GST on items too
      if (settings.discountMode === "total" && txPct > 0) {
        finalGst = itemGstSum * (1 - txPct / 100);
      }
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
      if (!header.orderName) {
        return showToast(`${header.orderType === "Supply" ? "PO" : "WO"} Name is required for submission.`, "error");
      }
      if (!header.categoryId) {
        return showToast("Category is required for submission.", "error");
      }
      if (!header.subject) {
        return showToast("Order Subject is required for submission.", "error");
      }
      if (!refSuffix?.trim()) {
        return showToast("Reference Number is required for submission.", "error");
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

    // Resolve billing profile at save time so ViewOrder always has it
    const saveSiteState = currentSite?.state;
    const saveBlocks = currentCompany?.stateBillingProfiles || [];
    const saveBlock = saveBlocks.find(b => b.stateName?.toLowerCase() === saveSiteState?.toLowerCase());
    const stateProfile = saveBlock
      ? (saveBlock.profiles?.find(p => p.isDefault) || saveBlock.profiles?.[0] || null)
      : null;
    const saveBillingProfile = stateProfile
      ? { ...stateProfile, source: "state" }
      : (currentCompany?.billingAddress || currentCompany?.billingGstin)
        ? { address: currentCompany.billingAddress || currentCompany.address || "", gstin: currentCompany.billingGstin || currentCompany.gstin || "", source: "entity" }
        : null;

    const snapshot = {
      site: normalizeOrderSite(currentSite),
      company: currentCompany,
      vendor: vendorDetails || vendors.find(v => v.id === header.vendorId),
      contacts: contacts.filter(c => header.contactPersonIds.includes(c.id)),
      billingProfile: saveBillingProfile,
      billingState: saveSiteState || null,
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
      category_id: header.categoryId || null,
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
        tax_mode: settings.taxMode,
        fright_mode: settings.frightMode,
        discount_mode: settings.discountMode,
        showBrand: settings.brand,
        showModel: settings.model,
        showRemarks: settings.remarks
      },
      notes: normalizeRichTextHtml(notesRef.current || header.notes || ""),
      created_by_id: user.id,
      status: submitStatus,
      action_by: user.name || "",
      snapshot: { ...snapshot, proof_type: files.proof.type, notes: normalizeRichTextHtml(notesRef.current || header.notes || "") }
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
      // Send URLs of existing quotation files the user kept (not deleted) so backend can merge
      const keptQuotUrls = files.quotations.filter(f => !(f instanceof File)).map(f => f.url);
      fd.append("keptQuotations", JSON.stringify(keptQuotUrls));

      // Only append new files if they are actually File objects (not urls)
      files.quotations.forEach(f => { if (f instanceof File) fd.append("quotation", f); });
      files.proof.files.forEach(f => { if (f instanceof File) fd.append("comparative", f); });

      // Other Documents — send kept existing docs (by id) plus any new files
      const keptOthers = files.others.filter(f => !(f instanceof File)).map(f => ({ id: f.id }));
      fd.append("keptOthers", JSON.stringify(keptOthers));
      files.others.forEach(f => { if (f instanceof File) fd.append("other", f); });

      const payload = {
        mainData: mappedMain,
        items: mappedItems,
        nextSerial: editOrderId ? nextSerial : nextSerial // nextSerial update only for new orders usually
      };

      fd.append("data", JSON.stringify(payload));

      const url = editOrderId ? `${API}/api/orders/${editOrderId}` : `${API}/api/orders`;
      const method = editOrderId ? "PUT" : "POST";

      const res = await authFetch(url, { method, body: fd });
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

    // Remove Quill v2 marker spans (.ql-ui)  these are empty marker-hosts
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
    const hasSavedContent = ptsState.length > 0;
    // Find the template that matches the current points, just to show its code/title —
    // saved content still counts as "selected" even if no live master clause matches it
    // (e.g. the master clause was edited/re-versioned after this order was saved).
    const selectedTemplate = hasSavedContent ? list.find(x => getCleanHTML(x.points) === ptsState[0]) : null;

    return (
      <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-lg flex flex-col gap-3 min-h-[140px]">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-slate-950 tracking-normal flex items-center gap-2">
            {title}
          </h3>
          {ptsState.length > 0 && (
            <button onClick={() => setPtsState([])} className="text-slate-300 hover:text-rose-500 transition-colors">
              <Trash2 size={12} />
            </button>
          )}
        </div>

        {!hasSavedContent ? (
          <div className="flex-1 flex flex-col justify-end">
            <Select
              value=""
              onChange={e => {
                const v = e.target.value;
                if (!v) return;
                const c = list.find(x => x.id === v);
                if (c) setPtsState([getCleanHTML(c.points)]);
              }}
              options={list}
              valueKey="id"
              labelKey="title"
              subLabelKey="code"
              placeholder={`Select ${title}...`}
              onAdd={() => setActionModal({ type: 'manageClause', clauseType: type, initialAction: 'add' })}
              addLabel={`Add`}
              onView={(c) => setActionModal({ type: 'manageClause', clauseType: type, initialViewId: c.id, initialAction: 'view', setPoints: setPtsState })}
            />
          </div>
        ) : selectedTemplate ? (
          <div className="flex-1 flex flex-col justify-end">
            <div className="bg-white border border-slate-200 rounded-md p-2.5 flex items-center justify-between gap-3 shadow-sm group">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-sm shrink-0 uppercase tracking-tight">
                  {selectedTemplate.code || selectedTemplate.id?.slice(0, 8)}
                </span>
                <span className="text-xs font-bold text-slate-700 truncate">{selectedTemplate.title}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActionModal({ type: 'manageClause', clauseType: type, initialViewId: selectedTemplate.id, initialAction: 'view', setPoints: setPtsState })}
                  className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                  title="View"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => setPtsState([])}
                  className="p-1.5 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-end">
            <div className="bg-white border border-slate-200 rounded-md p-2.5 flex items-center justify-between gap-3 shadow-sm group">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-sm shrink-0 uppercase tracking-tight">
                  Saved
                </span>
                <span className="text-xs font-bold text-slate-700 truncate">{title} added with this order</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPtsState([])}
                  className="p-1.5 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const lockRecallIdentityFields = Boolean(editOrderId && isRecalledEdit);

  if (loading && sites.length === 0 && companies.length === 0) return <div className="p-6 text-slate-400 text-center py-20 flex items-center justify-center flex-col gap-4"><Loader2 size={30} className="animate-spin text-indigo-500" /> <p>Loading master data...</p></div>;

  return (
    <div className="px-4 w-full max-w-none mx-0 pb-32">
      <style>{SCROLLBAR_STYLE}</style>
      {calcModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-base font-black text-slate-900">Calculation breakdown</h2>
                <p className="text-xs text-slate-400">How the total is calculated (simple steps)</p>
              </div>
              <button onClick={() => setCalcModalOpen(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 bg-slate-50">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-white border border-slate-200 rounded-md p-4">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-3">Step by step</p>
                  <div className="space-y-2 text-[13px] font-medium text-slate-600">
                    <div className="flex items-center justify-between">
                      <span>1) Subtotal (Σ Qty × Rate)</span>
                      <span className="text-slate-900 font-bold">{formatINR(totals.subtotal)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span>
                        2) Discount{settings.discountMode === "line" ? " (per line)" : settings.discountMode === "total" ? ` (${totals.txDiscountPct || 0}%)` : ""}
                      </span>
                      <span className="text-slate-900 font-bold">- {formatINR(totals.totalDiscountAmt)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span>3) Taxable amount</span>
                      <span className="text-slate-900 font-bold">{formatINR((totals.subtotal || 0) - (totals.totalDiscountAmt || 0))}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span>
                        4) GST{settings.taxMode === 'line' ? " (item wise)" : settings.taxMode === 'total' ? ` (${transactionTax || 0}%)` : " (none)"}{settings.frightMode === "before" ? " + Freight GST" : ""}
                      </span>
                      <span className="text-slate-900 font-bold">{formatINR(totals.gst)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span>
                        5) Freight{settings.frightMode === "before" ? ` (+GST ${totals.frightTax || 0}%)` : ""}
                      </span>
                      <span className="text-slate-900 font-bold">{formatINR(totals.frightCharges)}</span>
                    </div>

                    <div className="pt-3 mt-2 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-slate-900 font-bold">Grand Total</span>
                      <span className="text-slate-900 font-bold text-base">{formatINR(totals.grandTotal)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-md p-4">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-3">Formula view</p>
                  <div className="text-[13px] font-medium text-slate-600 space-y-2">
                    <p><span className="text-slate-900 font-bold">Subtotal</span> = Σ(Qty × Rate)</p>
                    <p><span className="text-slate-900 font-bold">Discount</span> = {settings.discountMode === "line" ? "Σ(Line Discount)" : settings.discountMode === "total" ? "Subtotal × Discount%" : "0"}</p>
                    <p><span className="text-slate-900 font-bold">Taxable</span> = Subtotal − Discount</p>
                    <p><span className="text-slate-900 font-bold">GST</span> = {settings.taxMode === 'line' ? "Σ(Item Base × Tax%)" : settings.taxMode === 'total' ? "Taxable Base × GST%" : "0 (no GST)"}{settings.frightMode === "before" ? " (+ Freight × FreightTax%)" : ""}</p>
                    <p><span className="text-slate-900 font-bold">Grand Total</span> = Taxable + Freight + GST</p>
                  </div>
                  <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-1">Total in words</p>
                    <p className="text-sm font-semibold text-slate-900">{totals.words || amountToWords(Number(totals.grandTotal) || 0)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 bg-white border border-slate-200 rounded-md overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Line items</p>
                  <p className="text-xs text-slate-400">Qty × Rate → Discount → GST → Total</p>
                </div>
                <div className="overflow-x-auto calc-thin-scroll">
                  <table className="min-w-[900px] w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-100 text-slate-600 text-[13px] font-medium">
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="px-3 py-2 text-left">Spec</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Gross</th>
                        <th className="px-3 py-2 text-right">Disc</th>
                        <th className="px-3 py-2 text-right">GST</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {totals.processedItems.map((p) => {
                        const group = items.find((g) => (g.subRows || []).some((s) => String(s.id) === String(p.id)));
                        const item = itemsList.find((it) => String(it.id) === String(group?.itemId));
                        const itemName = item?.materialName || item?.name || item?.itemCode || "—";
                        const spec = p.specification || "—";
                        return (
                          <tr key={p.id} className="border-b border-slate-50 last:border-0 text-[13px] font-medium text-slate-600">
                            <td className="px-3 py-2 text-slate-900 font-bold">{itemName}</td>
                            <td className="px-3 py-2">{spec}</td>
                            <td className="px-3 py-2 text-right">{Number(p.qty || 0)}</td>
                            <td className="px-3 py-2 text-right">{formatINR(p.unitRate || 0)}</td>
                            <td className="px-3 py-2 text-right">{formatINR(p.gross || 0)}</td>
                            <td className="px-3 py-2 text-right">{formatINR(p.dAmt || 0)}</td>
                            <td className="px-3 py-2 text-right">{formatINR(p.rowGst || 0)}</td>
                            <td className="px-3 py-2 text-right text-slate-900 font-bold">{formatINR(p.total || 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-white shrink-0 flex items-center justify-end">
              <button
                onClick={() => setCalcModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
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

      <div className="sticky top-0 z-20 flex items-center justify-between bg-white px-4 sm:px-6 py-4 border-b border-slate-200 shadow-sm -mx-4 mb-6">
        <h1 className="text-xl font-black text-slate-800 tracking-tight">Create Order</h1>
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="px-4 py-2.5 rounded border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-all text-sm">Cancel</button>
          <button onClick={() => handleSave("Draft")} disabled={saving}
            className="px-5 py-2.5 rounded border border-slate-200 bg-slate-50 text-slate-700 font-semibold flex items-center gap-2 hover:bg-slate-100 transition-all disabled:opacity-50 text-sm">
            <Save size={16} /> {saving ? "..." : "Save as Draft"}
          </button>
          <button onClick={() => handleSave("Review")} disabled={saving || !header.companyId || !header.siteId || !header.vendorId || !header.categoryId || !header.subject || !header.orderName || !refSuffix?.trim()}
            className="px-6 py-2.5 rounded bg-indigo-600 text-white font-semibold flex items-center gap-2 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 text-sm">
            <Check size={16} /> {saving ? "..." : "Submit for Review"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">

        {/* TOP SECTION - Settings & Details */}
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded p-5 shadow-sm space-y-5">
            <h2 className="inline-flex items-center text-[11px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded">Order Setup</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-7">
              <Input label={header.orderType === "Supply" ? "PO Name" : "WO Name"}
                value={header.orderName} onChange={e => setHeader(h => ({ ...h, orderName: e.target.value }))}
                placeholder={header.orderType === "Supply" ? "Enter PO Name..." : "Enter WO Name..."} required />
              <Select label="Order Type" value={header.orderType} onChange={e => {
                const newType = e.target.value;
                setHeader(h => {
                  const expectedPrefix = newType === "Supply" ? "PO" : "WO";
                  const isDraft = /^(PO|WO)-\d+$/.test(h.orderNumber || "");
                  const currentPrefix = (h.orderNumber || "").split("-")[0];
                  // Clear mismatched draft number so backend assigns correct WO-N/PO-N on next save
                  const orderNumber = isDraft && currentPrefix !== expectedPrefix ? "" : h.orderNumber;
                  return { ...h, orderType: newType, orderNumber };
                });
              }} options={[{ id: "Supply", name: "Supply (PO)" }, { id: "SITC", name: "SITC (WO)" }, { id: "ITC", name: "ITC (WO)" }]} required />
              <Input label={header.orderType === "Supply" ? "PO Number" : "WO Number"}
                value={header.orderNumber || ""}
                placeholder={header.orderType === "Supply" ? "PO-# (on save)" : "WO-# (on save)"}
                readOnly mono
              />
              <ProjectSelect
                label="Select Project"
                required
                variant="order"
                value={header.siteId}
                onChange={handleSiteChange}
                options={sites}
                placeholder="Select project…"
                disabled={!!project || lockRecallIdentityFields}
                onAdd={() => setActionModal({ type: "addSite" })}
                onView={(s) => setActionModal({ type: "viewSite", data: s })}
              />
              <Select label="Select Company" value={header.companyId} onChange={handleCompanyChange} options={companies} valueKey="id" labelKey="companyName" subLabelKey="companyCode" required
                disabled={lockRecallIdentityFields}
                onAdd={() => setActionModal({ type: "addCompany" })} addLabel="Add New Company" onView={(c) => setActionModal({ type: "viewCompany", data: c })} />
              <Select label="Select Vendor" value={header.vendorId} onChange={handleVendorChange} options={vendors} valueKey="id" labelKey="vendorName" subLabelKey="address" required
                onAdd={() => setActionModal({ type: "addVendor" })} addLabel="Add New Vendor" onView={(v) => setActionModal({ type: "viewVendor", data: v })} />
              <Select label="Category" value={header.categoryId} onChange={e => setHeader(h => ({ ...h, categoryId: e.target.value }))}
                options={categories} valueKey="id" labelKey="categoryName" subLabelKey="categoryCode" placeholder="Select category..." required />
              <Input label="Date of Creation" type="date" value={header.creationDate} onChange={e => setHeader(h => ({ ...h, creationDate: e.target.value }))} disabled={lockRecallIdentityFields} required />
              <Input label="Order Made By" value={header.madeBy} readOnly />
            </div>
          </div>

          {/* ── Billing Detail & GST (auto from site state + entity profiles) ── */}
          <div className="bg-white rounded p-5 shadow-sm">
            <h2 className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded mb-4">
              Billing Detail &amp; GST
              {siteDetails?.state && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 normal-case tracking-normal">
                  {siteDetails.state}
                </span>
              )}
            </h2>
            {billingProfile ? (
              <div className="space-y-3">
                {billingProfile.source === "entity" && siteDetails?.state && (
                  <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                    No state-specific profile for <span className="font-bold">{siteDetails.state}</span> — using entity billing details
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <Input label="Billing Address" value={billingProfile.address || "—"} readOnly multiline rows={3} />
                  </div>
                  <div className="space-y-4">
                    <Input label="GSTIN" value={billingProfile.gstin || "—"} readOnly />
                    {(billingProfile.contactName || billingProfile.contactPhone) && (
                      <div className="px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Contact Details</p>
                        <p className="text-xs font-bold text-slate-600">
                          {billingProfile.contactName}{billingProfile.contactPhone ? ` · ${billingProfile.contactPhone}` : ""}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-5 text-slate-400">
                {!siteDetails && !companyDetails
                  ? <p className="text-xs">Select site and company to see billing details</p>
                  : !siteDetails
                    ? <p className="text-xs">Select a site to determine billing state</p>
                    : <p className="text-xs">Select a company to load billing profile</p>
                }
              </div>
            )}
          </div>

          <div className="bg-white rounded p-5 shadow-sm space-y-6">
            <h2 className="inline-flex items-center text-[11px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded">Order Meta</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="col-span-full">
                <Input label="Subject" value={header.subject} onChange={e => setHeader(h => ({ ...h, subject: e.target.value }))} placeholder="Enter full order subject (e.g. Supply of IT Equipment for Varanasi Site)..."
                  multiline rows={4} required />
              </div>
              <div className="lg:col-span-2">
                <label className={FIELD_LABEL_CLASS}>Reference No <span className="text-red-500">*</span></label>
                <div className="flex items-stretch gap-2">
                  {computedRefPrefix && (
                    <span className="shrink-0 border border-slate-300 rounded px-4 h-14 flex items-center font-mono text-[13px] whitespace-nowrap bg-[#f7f7f7] text-slate-500">
                      {computedRefPrefix}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <Input value={refSuffix} onChange={e => handleRefSuffixChange(e.target.value)}
                      placeholder={computedRefPrefix ? "e.g. 001" : "Select Company & Site first"}
                      disabled={!computedRefPrefix}
                      className="font-bold text-slate-800" />
                  </div>
                </div>
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

          <div className="bg-white rounded p-5 shadow-sm space-y-6">
            <h2 className="inline-flex items-center text-[11px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded">Order Documentation</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* QUOTATIONS */}
              <div className="bg-slate-100/60 p-4 rounded-md border border-slate-100">
                <MultiDocUpload label="Quotation(s) * (Min 1, Max 6)" files={files.quotations} max={6} required
                  onAdd={e => {
                    const f = e.target.files[0];
                    if (f) setFiles(prev => ({ ...prev, quotations: [...prev.quotations, f] }));
                  }}
                  onRemove={i => setFiles(prev => ({ ...prev, quotations: prev.quotations.filter((_, idx) => idx !== i) }))}
                  onPreview={handlePreviewDoc} />
              </div>

              {/* COMPARATIVE / PROOF */}
              <div className="bg-slate-100/60 p-4 rounded-md border border-slate-100 space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Proof Type *</label>
                  <div className="relative">
                    <select
                      value={files.proof.type}
                      onChange={e => setFiles(prev => ({ ...prev, proof: { ...prev.proof, type: e.target.value } }))}
                      className="w-full border border-slate-200 rounded-md pl-3 pr-10 h-10 text-sm outline-none focus:border-indigo-400 bg-white appearance-none"
                    >
                      <option value="">Select Type</option>
                      <option value="Comparative Docs">Comparative Docs</option>
                      <option value="Mail Proof Doc">Mail Proof Doc</option>
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                {files.proof.type && (
                  <MultiDocUpload label={`${files.proof.type} *`} files={files.proof.files} max={1} required
                    onAdd={e => {
                      const f = e.target.files[0];
                      if (f) setFiles(prev => ({ ...prev, proof: { ...prev.proof, files: [...prev.proof.files, f] } }));
                    }}
                    onRemove={i => {
                      setFiles(prev => {
                        const newFiles = prev.proof.files.filter((_, idx) => idx !== i);
                        return { ...prev, proof: { ...prev.proof, files: newFiles } };
                      });
                    }}
                    onPreview={handlePreviewDoc} />
                )}
              </div>

              {/* OTHERS */}
              <div className="bg-slate-100/60 p-4 rounded-md border border-slate-100">
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
          <div className="bg-white rounded p-5 shadow-sm flex flex-col gap-4">
            <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-black text-slate-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                  <FileText size={20} strokeWidth={2.5} />
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
                              { key: 'brand', label: 'Brand' },
                              { key: 'remarks', label: 'Remarks' }
                            ].filter(({ key }) => !settings[key]).map(({ key, label }) => (
                              <button key={key} onClick={() => setSettings(s => ({ ...s, [key]: true }))}
                                className="flex items-center gap-2.5 px-3 py-2 w-full text-left rounded-lg border border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100 hover:border-indigo-400 transition-all group">
                                <Plus size={13} strokeWidth={3} className="text-indigo-500 shrink-0" />
                                <span className="text-xs font-medium text-slate-700">{label}</span>
                              </button>
                            ))}
                            {['model', 'remarks', 'brand'].every(k => settings[k]) && (
                              <p className="text-xs text-slate-400 italic text-center py-1 font-medium bg-slate-50 rounded-lg">All columns added</p>
                            )}
                          </div>
                        </div>

                        {/* GST */}
                        <div className="p-4 border-b border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">GST (Tax)</p>
                          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                            {[['none', 'None'], ['line', 'Per Line'], ['total', 'Total']].map(([m, lbl]) => (
                              <button key={m} onClick={() => updateSettingsAndClearData('taxMode', m)}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${settings.taxMode === m ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                                {lbl}
                              </button>
                            ))}
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

            <div>
              <div className="relative isolate w-full premium-scroll border border-slate-200 rounded bg-white overflow-x-auto overflow-y-hidden">
                <table className="create-order-items-table w-full text-xs table-fixed col-lines" style={{ minWidth: '100%', tableLayout: 'fixed' }}>
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th
                        className="col-sep sticky left-0 z-50 py-3 pl-3 pr-2 text-xs font-semibold text-slate-700 text-left whitespace-nowrap"
                        style={{ width: '60px', left: 0 }}
                      >
                        S.No
                      </th>
                      {["SITC", "ITC"].includes(header.orderType) ? (
                        <th
                          className="col-sep sticky z-40 px-3 py-3 text-xs font-semibold text-slate-700 text-left"
                          style={{ width: '420px', left: 60 }}
                        >
                          Product Name & Description
                        </th>
                      ) : (
                        <>
                          <th
                            className="col-sep sticky z-40 px-3 py-3 text-xs font-semibold text-slate-700 text-left"
                            style={{ width: '320px', minWidth: '320px', maxWidth: '320px', left: 60 }}
                          >
                            Product Name
                          </th>
                          <th
                            className="col-sep sticky z-30 px-3 py-3 text-xs font-semibold text-slate-700 text-left"
                            style={{ width: '260px', minWidth: '260px', maxWidth: '260px', left: 380 }}
                          >
                            Specification
                          </th>
                        </>
                      )}
                      {settings.model && (
                        <th className="px-3 py-3 text-xs font-semibold text-slate-700 text-left group/th" style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>
                          <div className="flex items-center gap-1 whitespace-nowrap">Model No
                            <button onClick={() => updateSettingsAndClearData('model', false)} className="opacity-0 group-hover/th:opacity-100 ml-1 w-4 h-4 rounded bg-rose-500/80 text-white flex items-center justify-center transition-opacity hover:bg-rose-600" title="Remove column"><X size={8} strokeWidth={3} /></button>
                          </div>
                        </th>
                      )}
                      {settings.brand && (
                        <th className="px-3 py-3 text-xs font-semibold text-slate-700 text-left group/th" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                          <div className="flex items-center gap-1 whitespace-nowrap">Brand
                            <button onClick={() => updateSettingsAndClearData('brand', false)} className="opacity-0 group-hover/th:opacity-100 ml-1 w-4 h-4 rounded bg-rose-500/80 text-white flex items-center justify-center transition-opacity hover:bg-rose-600" title="Remove column"><X size={8} strokeWidth={3} /></button>
                          </div>
                        </th>
                      )}
                      <th className="px-3 py-3 text-xs font-semibold text-slate-700 text-center whitespace-nowrap" style={{ width: '80px' }}>Unit</th>
                      <th className="px-3 py-3 text-xs font-semibold text-slate-700 text-center whitespace-nowrap" style={{ width: '100px' }}>Quantity</th>
                      <th className="px-3 py-3 text-xs font-semibold text-slate-700 text-right whitespace-nowrap" style={{ width: '120px' }}>Rate (₹)</th>
                      {settings.discountMode === "line" && <th className="px-3 py-3 text-xs font-semibold text-slate-700 text-center whitespace-nowrap" style={{ width: '70px' }}>Disc (%)</th>}
                      {settings.taxMode === 'line' && (
                        <th className="px-3 py-3 text-xs font-semibold text-slate-700 text-center whitespace-nowrap group/th" style={{ width: '80px' }}>
                          <div className="flex items-center justify-center gap-1">Tax (%)
                            <button onClick={() => updateSettingsAndClearData('tax', false)} className="opacity-0 group-hover/th:opacity-100 w-4 h-4 rounded bg-rose-500/80 text-white flex items-center justify-center transition-opacity hover:bg-rose-600" title="Move to summary"><X size={8} strokeWidth={3} /></button>
                          </div>
                        </th>
                      )}
                      <th className="px-3 py-3 text-xs font-semibold text-slate-700 text-right whitespace-nowrap" style={{ width: '140px' }}>Amount (₹)</th>
                      {settings.remarks && (
                        <th className="px-3 py-3 text-xs font-semibold text-slate-700 text-left group/th" style={{ width: '240px' }}>
                          <div className="flex items-center gap-1 whitespace-nowrap">Remarks
                            <button onClick={() => updateSettingsAndClearData('remarks', false)} className="opacity-0 group-hover/th:opacity-100 ml-1 w-4 h-4 rounded bg-rose-500/80 text-white flex items-center justify-center transition-opacity hover:bg-rose-600" title="Remove column"><X size={8} strokeWidth={3} /></button>
                          </div>
                        </th>
                      )}
                      <th
                        className="sticky right-0 z-50 no-col-line"
                        style={{ width: '32px' }}
                      ></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {items.map((group, gIdx) => {
                      const itemData = itemsList.find(i => i.id === group.itemId);
                      return group.subRows.map((sub, sIdx) => {
                        const isFirst = sIdx === 0;
                        const isLast = sIdx === group.subRows.length - 1;
                        const isSITC = ["SITC", "ITC"].includes(header.orderType);
                        const showPointLabel = isSITC && group.subRows.length > 1;
                        if (isSITC && isFirst) {
                          const rowSpan = group.subRows.length + 1; // header row + points rows
                          return (
                            <React.Fragment key={`${group.id}-sitc`}>
                              {/* Header row: only Item/Service */}
                              <tr className={`bg-white ${gIdx > 0 ? "row-divider" : ""}`}>
                                <td
                                  rowSpan={rowSpan}
                                  className="col-sep sticky left-0 z-40 px-1 py-3 text-center align-top bg-white"
                                  style={{ left: 0, width: '60px', minWidth: '60px', maxWidth: '60px' }}
                                >
                                  <span className="text-[11px] font-black text-slate-900">{(gIdx + 1).toString().padStart(2, "0")}</span>
                                </td>
                                <td
                                  className="col-sep sticky z-30 px-3 py-2 border-r border-slate-50 bg-white align-top"
                                  style={{ left: 60 }}
                                >
                                  <p className="h-4 mb-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <span className="w-1 h-3 bg-slate-200 rounded-full"></span>
                                    Item Name
                                  </p>
                                  <InlineSelect
                                    value={group.itemId}
                                    onChange={e => handleGroupChange(group.id, e.target.value)}
                                    options={itemsList.filter(i => header.orderType === "ITC" ? ["SITC", "ITC"].includes(i.itemType) : i.itemType === header.orderType)}
                                    placeholder="Select Item..."
                                    variant="table"
                                  />
                                </td>
                                {/* Fill remaining columns in header row */}
                                {group.subRows.length === 1 ? (
                                  <>
                                    {/* Model */}
                                    {settings.model && (
                                      <td className="px-2 pt-2 pb-2 align-top" style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>
                                        <div className="h-4 mb-1.5" />
                                        {group.subRows[0].hideModel ? (
                                          <button onClick={() => handleSubRowChange(group.id, group.subRows[0].id, "hideModel", false)}
                                            className="w-full text-[10px] text-slate-300 border border-dashed border-slate-200 rounded-[6px] px-2 py-2 text-center hover:border-indigo-300 hover:text-indigo-400 transition-all min-h-[34px]">
                                            + Add
                                          </button>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <input
                                              type="text"
                                              value={group.subRows[0].modelNumber}
                                              onChange={e => handleSubRowChange(group.id, group.subRows[0].id, "modelNumber", e.target.value)}
                                              className="flex-1 min-w-0 text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 transition-all placeholder:text-slate-300 placeholder:italic min-h-[34px]"
                                              placeholder="Model #"
                                            />
                                            <button
                                              onClick={() => { handleSubRowChange(group.id, group.subRows[0].id, "modelNumber", ""); handleSubRowChange(group.id, group.subRows[0].id, "hideModel", true); }}
                                              className="shrink-0 text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded"
                                            >
                                              <X size={11} strokeWidth={2.5} />
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                    )}

                                    {/* Brand */}
                                    {settings.brand && (
                                      <td className="px-1 pt-2 pb-2 align-top" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                                        <div className="h-4 mb-1.5" />
                                        {group.subRows[0].hideBrand ? (
                                          <button onClick={() => handleSubRowChange(group.id, group.subRows[0].id, "hideBrand", false)}
                                            className="w-full text-[10px] text-slate-300 border border-dashed border-slate-200 rounded-[6px] px-2 py-2 text-center hover:border-indigo-300 hover:text-indigo-400 transition-all min-h-[34px]">
                                            + Add
                                          </button>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <div className="flex-1 min-w-0">
                                              <InlineSelect
                                                value={group.subRows[0].make}
                                                onChange={e => handleSubRowChange(group.id, group.subRows[0].id, "make", e.target.value)}
                                                options={itemData?.brands || []}
                                                placeholder="Brand"
                                                disabled={!group.itemId}
                                                variant="table"
                                                onAdd={() => setCustomInputModal({ open: true, type: "make", groupId: group.id, subId: group.subRows[0].id, itemId: group.itemId, text: group.subRows[0].make || "", originalValue: "" })}
                                                onEdit={(val) => setCustomInputModal({ open: true, type: "make", groupId: group.id, subId: group.subRows[0].id, itemId: group.itemId, text: val, originalValue: val })}
                                                addLabel="+ Add New Brand"
                                              />
                                            </div>
                                            <button
                                              onClick={() => { handleSubRowChange(group.id, group.subRows[0].id, "make", ""); handleSubRowChange(group.id, group.subRows[0].id, "hideBrand", true); }}
                                              className="shrink-0 text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded"
                                            >
                                              <X size={11} strokeWidth={2.5} />
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                    )}

                                    {/* Unit */}
                                    <td className="py-2 px-1 text-center align-top whitespace-nowrap" style={{ width: '80px' }}>
                                      <div className="h-4 mb-1.5" />
                                      <InlineSelect
                                        value={group.unit || ""}
                                        onChange={e => setItems(prev => prev.map(g => g.id !== group.id ? g : { ...g, unit: e.target.value }))}
                                        options={uomList.map(u => u.uomCode || u.uomName)}
                                        placeholder="Unit"
                                        searchable={true}
                                        minDropWidth={160}
                                        variant="table"
                                        className="text-center"
                                        onAdd={(searchText) => handleAddCustomUnit(group.id, searchText)}
                                        addLabel="+ Add"
                                      />
                                    </td>

                                    {/* Qty */}
                                    <td className="px-1 py-2 whitespace-nowrap align-top text-center" style={{ width: '90px' }}>
                                      <div className="h-4 mb-1.5" />
                                      <input
                                        type="number"
                                        value={group.subRows[0].qty || ""}
                                        onChange={e => handleSubRowChange(group.id, group.subRows[0].id, "qty", Number(e.target.value))}
                                        className="no-spin w-full block text-center text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 transition-all"
                                        placeholder="0"
                                      />
                                    </td>

                                    {/* Rate */}
                                    <td className="px-1 py-2 whitespace-nowrap align-top" style={{ width: '120px' }}>
                                      <div className="h-4 mb-1.5" />
                                      <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-300">₹</span>
                                        <input
                                          type="number"
                                          value={group.subRows[0].unitRate || ""}
                                          onChange={e => handleSubRowChange(group.id, group.subRows[0].id, "unitRate", Number(e.target.value))}
                                          className="no-spin w-full block text-right text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] pl-5 pr-2 py-2 outline-none focus:border-slate-400 transition-all"
                                          placeholder="0.00"
                                        />
                                      </div>
                                    </td>

                                    {/* Discount */}
                                    {settings.discountMode === "line" && (
                                      <td className="px-1 py-2 whitespace-nowrap align-top text-center" style={{ width: '70px' }}>
                                        <div className="h-4 mb-1.5" />
                                        <input
                                          type="number"
                                          value={group.subRows[0].discountPct || ""}
                                          onChange={e => handleSubRowChange(group.id, group.subRows[0].id, "discountPct", Number(e.target.value))}
                                          className="no-spin w-full text-center text-xs font-bold text-rose-500 bg-rose-50/30 border border-rose-100 rounded-[6px] px-2 py-2 outline-none focus:border-rose-300 transition-all"
                                          placeholder="%"
                                        />
                                      </td>
                                    )}

                                    {/* Tax */}
                                    {settings.taxMode === 'line' && (
                                      <td className="px-1 py-2 whitespace-nowrap align-top text-center" style={{ width: '80px' }}>
                                        <div className="h-4 mb-1.5" />
                                        <div className="relative">
                                          <select
                                            value={group.subRows[0].taxPct}
                                            onChange={e => handleSubRowChange(group.id, group.subRows[0].id, "taxPct", Number(e.target.value))}
                                            className="w-full appearance-none text-center text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 cursor-pointer transition-all"
                                          >
                                            <option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option>
                                          </select>
                                          <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                                        </div>
                                      </td>
                                    )}

                                    {/* Amount */}
                                    <td className="px-3 py-2 text-right text-sm font-bold text-slate-800 whitespace-nowrap align-top" style={{ width: '140px' }}>
                                      <div className="h-4 mb-1.5" />
                                      {(() => {
                                        const p = totals.processedItems.find(x => x.id === group.subRows[0].id);
                                        return `₹${(p?.total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
                                      })()}
                                    </td>

                                    {/* Remarks (single-point) */}
                                    {settings.remarks && (
                                      <td className="px-2 pt-2 pb-2 align-top" style={{ width: '240px' }}>
                                        <div className="h-4 mb-1.5" />
                                        <textarea
                                          ref={(el) => autoGrowTextarea(el)}
                                          value={group.subRows[0].remarks || ""}
                                          onChange={e => handleSubRowChange(group.id, group.subRows[0].id, "remarks", e.target.value)}
                                          onInput={(e) => autoGrowTextarea(e.currentTarget)}
                                          onFocus={(e) => autoGrowTextarea(e.currentTarget)}
                                          rows={1}
                                          className="w-full resize-none overflow-hidden text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 transition-all leading-snug"
                                          placeholder="Remarks..."
                                        />
                                      </td>
                                    )}
                                    {/* Action (single-point) */}
                                    <td className="px-1 pt-2 pb-2 sticky right-0 z-40 bg-white align-top no-col-line">
                                      <div className="h-4 mb-1.5" />
                                      <div className="w-full flex justify-center items-start pt-[2px]">
                                        <button
                                          onClick={() => removeGroup(group.id)}
                                          disabled={items.length === 1}
                                          className="w-6 h-6 flex items-center justify-center mx-auto text-slate-300 hover:text-white hover:bg-rose-400 rounded transition-all disabled:opacity-0"
                                        >
                                          <X size={11} strokeWidth={2.5} />
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    {settings.model && <td style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}><div className="h-4 mb-1.5" /></td>}
                                    {settings.brand && <td style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}><div className="h-4 mb-1.5" /></td>}
                                    <td><div className="h-4 mb-1.5" /></td>
                                    <td><div className="h-4 mb-1.5" /></td>
                                    <td><div className="h-4 mb-1.5" /></td>
                                    {settings.discountMode === "line" && <td><div className="h-4 mb-1.5" /></td>}
                                    {settings.taxMode === 'line' && <td><div className="h-4 mb-1.5" /></td>}
                                    <td><div className="h-4 mb-1.5" /></td>
                                    {settings.remarks && <td><div className="h-4 mb-1.5" /></td>}
                                    <td className="sticky right-0 bg-white no-col-line"><div className="h-4 mb-1.5" /></td>
                                  </>
                                )}
                              </tr>
                              {/* Point 1 row (rendered here so it doesn't get skipped) */}
                              <tr className="bg-white hover:bg-slate-50 transition-colors">
                                <td
                                  className="col-sep sticky z-30 px-3 py-2 border-r border-slate-50 bg-white align-top"
                                  style={{ width: '420px', left: 60 }}
                                >
                                  <div className="pl-4 border-l-2 border-slate-50 flex items-start gap-2">
                                    {group.subRows.length > 1 ? (
                                      <span className="shrink-0 mt-[7px] text-[10px] font-bold text-slate-600 bg-white border border-slate-300 rounded px-1.5 py-0.5">
                                        Point-1
                                      </span>
                                    ) : (
                                      isFirst && <p className="shrink-0 mt-[7px] text-[9px] font-black text-slate-400 uppercase tracking-widest">Technical</p>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <InlineSelect value={sub.specification} onChange={e => handleSubRowChange(group.id, sub.id, "specification", e.target.value)}
                                        options={itemData?.specifications || []} placeholder=" Spec " disabled={!group.itemId} renderHtml={true}
                                        variant="table"
                                        onAdd={() => setCustomInputModal({ open: true, type: "specification", groupId: group.id, subId: sub.id, itemId: group.itemId, text: "", originalValue: "" })}
                                        onEdit={(val) => setCustomInputModal({ open: true, type: "specification", groupId: group.id, subId: sub.id, itemId: group.itemId, text: val, originalValue: val })}
                                        onView={(val) => setSpecViewModal({ open: true, html: val, onEdit: () => { setSpecViewModal({ open: false, html: '', onEdit: null }); setCustomInputModal({ open: true, type: 'specification', groupId: group.id, subId: sub.id, itemId: group.itemId, text: val, originalValue: val }); } })}
                                        addLabel="+ Type Custom Spec" />
                                      {isLast && group.itemId && (
                                        <button
                                          onClick={() => addSubRow(group.id)}
                                          className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg bg-indigo-50 transition-colors border border-indigo-100/50"
                                          title="Add Description Point"
                                        >
                                          <Plus size={10} strokeWidth={3} /> Add Point
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                {group.subRows.length === 1 ? (
                                  <>
                                    {settings.model && <td style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }} />}
                                    {settings.brand && <td style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }} />}
                                    <td style={{ width: '80px' }} />
                                    <td style={{ width: '90px' }} />
                                    <td style={{ width: '120px' }} />
                                    {settings.discountMode === "line" && <td style={{ width: '70px' }} />}
                                    {settings.taxMode === 'line' && <td style={{ width: '80px' }} />}
                                    <td style={{ width: '140px' }} />
                                    {settings.remarks && <td style={{ width: '240px' }} />}
                                    <td className="sticky right-0 bg-white no-col-line" style={{ width: '32px' }} />
                                  </>
                                ) : (
                                  <>
                                    {/* Model (Point 1) */}
                                    {settings.model && (
                                      <td className="px-2 py-2 align-top" style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>
                                        {sub.hideModel ? (
                                          <button
                                            onClick={() => handleSubRowChange(group.id, sub.id, "hideModel", false)}
                                            className="w-full text-[10px] text-slate-300 border border-dashed border-slate-200 rounded-[6px] px-2 py-2 text-center hover:border-indigo-300 hover:text-indigo-400 transition-all min-h-[34px]"
                                          >
                                            + Add
                                          </button>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <input
                                              type="text"
                                              value={sub.modelNumber}
                                              onChange={e => handleSubRowChange(group.id, sub.id, "modelNumber", e.target.value)}
                                              className="flex-1 min-w-0 text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 transition-all placeholder:text-slate-300 placeholder:italic min-h-[34px]"
                                              placeholder="Model #"
                                            />
                                            <button
                                              onClick={() => { handleSubRowChange(group.id, sub.id, "modelNumber", ""); handleSubRowChange(group.id, sub.id, "hideModel", true); }}
                                              className="shrink-0 text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded"
                                            >
                                              <X size={11} strokeWidth={2.5} />
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                    )}

                                    {/* Brand (Point 1) */}
                                    {settings.brand && (
                                      <td className="px-1 py-2 align-top" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                                        {sub.hideBrand ? (
                                          <button
                                            onClick={() => handleSubRowChange(group.id, sub.id, "hideBrand", false)}
                                            className="w-full text-[10px] text-slate-300 border border-dashed border-slate-200 rounded-[6px] px-2 py-2 text-center hover:border-indigo-300 hover:text-indigo-400 transition-all min-h-[34px]"
                                          >
                                            + Add
                                          </button>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <div className="flex-1 min-w-0">
                                              <InlineSelect
                                                value={sub.make}
                                                onChange={e => handleSubRowChange(group.id, sub.id, "make", e.target.value)}
                                                options={itemData?.brands || []}
                                                placeholder="Brand"
                                                disabled={!group.itemId}
                                                variant="table"
                                                onAdd={() => setCustomInputModal({ open: true, type: "make", groupId: group.id, subId: sub.id, itemId: group.itemId, text: sub.make || "", originalValue: "" })}
                                                onEdit={(val) => setCustomInputModal({ open: true, type: "make", groupId: group.id, subId: sub.id, itemId: group.itemId, text: val, originalValue: val })}
                                                addLabel="+ Add New Brand"
                                              />
                                            </div>
                                            <button
                                              onClick={() => { handleSubRowChange(group.id, sub.id, "make", ""); handleSubRowChange(group.id, sub.id, "hideBrand", true); }}
                                              className="shrink-0 text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded"
                                            >
                                              <X size={11} strokeWidth={2.5} />
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                    )}
                                    <td className="py-2 px-1 text-center align-top whitespace-nowrap" style={{ width: '80px' }}>
                                      <InlineSelect
                                        value={group.unit || ""}
                                        onChange={e => setItems(prev => prev.map(g => g.id !== group.id ? g : { ...g, unit: e.target.value }))}
                                        options={uomList.map(u => u.uomCode || u.uomName)}
                                        placeholder="Unit"
                                        searchable={true}
                                        minDropWidth={160}
                                        variant="table"
                                        className="text-center"
                                        onAdd={(searchText) => handleAddCustomUnit(group.id, searchText)}
                                        addLabel="+ Add"
                                      />
                                    </td>
                                    <td className="px-1 py-2 whitespace-nowrap align-top text-center" style={{ width: '90px' }}>
                                      <input type="number" value={sub.qty || ""} onChange={e => handleSubRowChange(group.id, sub.id, "qty", Number(e.target.value))}
                                        className="no-spin w-full block text-center text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 transition-all" placeholder="0" />
                                    </td>
                                    <td className="px-1 py-2 whitespace-nowrap align-top" style={{ width: '120px' }}>
                                      <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-300">₹</span>
                                        <input type="number" value={sub.unitRate || ""} onChange={e => handleSubRowChange(group.id, sub.id, "unitRate", Number(e.target.value))}
                                          className="no-spin w-full block text-right text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] pl-5 pr-2 py-2 outline-none focus:border-slate-400 transition-all" placeholder="0.00" />
                                      </div>
                                    </td>
                                    {settings.discountMode === "line" && (
                                      <td className="px-1 py-2 whitespace-nowrap align-top text-center" style={{ width: '70px' }}>
                                        <input type="number" value={sub.discountPct || ""} onChange={e => handleSubRowChange(group.id, sub.id, "discountPct", Number(e.target.value))}
                                          className="no-spin w-full text-center text-xs font-bold text-rose-500 bg-rose-50/30 border border-rose-100 rounded-[6px] px-2 py-2 outline-none focus:border-rose-300 transition-all" placeholder="%" />
                                      </td>
                                    )}
                                    {settings.taxMode === 'line' && (
                                      <td className="px-1 py-2 whitespace-nowrap align-top text-center" style={{ width: '80px' }}>
                                        <div className="relative">
                                          <select value={sub.taxPct} onChange={e => handleSubRowChange(group.id, sub.id, "taxPct", Number(e.target.value))}
                                            className="w-full appearance-none text-center text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 cursor-pointer transition-all">
                                            <option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option>
                                          </select>
                                          <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                                        </div>
                                      </td>
                                    )}
                                    <td className="px-3 py-2 text-right text-sm font-bold text-slate-800 whitespace-nowrap align-top" style={{ width: '140px' }}>
                                      {(() => {
                                        const p = totals.processedItems.find(x => x.id === sub.id);
                                        return `₹${(p?.total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
                                      })()}
                                    </td>
                                    {settings.remarks && (
                                      <td className="px-2 py-2 align-top" style={{ width: '240px' }}>
                                        <textarea
                                          ref={(el) => autoGrowTextarea(el)}
                                          value={sub.remarks || ""}
                                          onChange={e => handleSubRowChange(group.id, sub.id, "remarks", e.target.value)}
                                          onInput={(e) => autoGrowTextarea(e.currentTarget)}
                                          onFocus={(e) => autoGrowTextarea(e.currentTarget)}
                                          rows={1}
                                          className="w-full resize-none overflow-hidden text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 transition-all leading-snug"
                                          placeholder="Remarks..."
                                        />
                                      </td>
                                    )}
                                    <td className="px-1 py-2 sticky right-0 z-40 bg-white align-top no-col-line">
                                      <div className="w-full flex justify-center items-start pt-[2px]">
                                        <button onClick={() => removeGroup(group.id)}
                                          disabled={items.length === 1}
                                          className="w-6 h-6 flex items-center justify-center mx-auto text-slate-300 hover:text-white hover:bg-rose-400 rounded transition-all disabled:opacity-0">
                                          <X size={11} strokeWidth={2.5} />
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            </React.Fragment>
                          );
                        }

                        return (
                          <tr key={sub.id} className={`transition-colors
                          ${isFirst && gIdx > 0 ? "row-divider" : ""}
                          ${isLast ? "border-b border-slate-100" : "border-b-0"}
                          ${!isFirst ? "bg-slate-50/20 hover:bg-slate-100/40" : "bg-white hover:bg-slate-50"}`}>

                            {["SITC", "ITC"].includes(header.orderType) ? (
                              <td
                                className="sticky z-30 px-3 py-2 border-r border-slate-50 bg-white align-top"
                                style={{ width: '420px', left: 60 }}
                              >
                                <div className="pl-4 border-l-2 border-slate-50 flex items-start gap-2">
                                  {group.subRows.length > 1 ? (
                                    <span className="shrink-0 mt-[7px] text-[10px] font-bold text-slate-600 bg-white border border-slate-300 rounded px-1.5 py-0.5">
                                      {`Point-${sIdx + 1}`}
                                    </span>
                                  ) : (
                                    isFirst && <p className="shrink-0 mt-[7px] text-[9px] font-black text-slate-400 uppercase tracking-widest">Technical</p>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <InlineSelect value={sub.specification} onChange={e => handleSubRowChange(group.id, sub.id, "specification", e.target.value)}
                                      options={itemData?.specifications || []} placeholder=" Spec " disabled={!group.itemId} renderHtml={true}
                                      variant="table"
                                      onAdd={() => setCustomInputModal({ open: true, type: "specification", groupId: group.id, subId: sub.id, itemId: group.itemId, text: "", originalValue: "" })}
                                      onEdit={(val) => setCustomInputModal({ open: true, type: "specification", groupId: group.id, subId: sub.id, itemId: group.itemId, text: val, originalValue: val })}
                                      onView={(val) => setSpecViewModal({ open: true, html: val, onEdit: () => { setSpecViewModal({ open: false, html: '', onEdit: null }); setCustomInputModal({ open: true, type: 'specification', groupId: group.id, subId: sub.id, itemId: group.itemId, text: val, originalValue: val }); } })}
                                      addLabel="+ Type Custom Spec" />
                                    {isLast && group.itemId && (
                                      <button
                                        onClick={() => addSubRow(group.id)}
                                        className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg bg-indigo-50 transition-colors border border-indigo-100/50"
                                        title="Add Description Point"
                                      >
                                        <Plus size={10} strokeWidth={3} /> Add Point
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            ) : (
                              <>
                                {/* S.No (Standard PO) */}
                                {isFirst && (
                                  <td
                                    rowSpan={group.subRows.length}
                                    className="col-sep sticky left-0 z-40 px-1 py-3 text-center align-top bg-white"
                                    style={{ left: 0, width: '60px', minWidth: '60px', maxWidth: '60px' }}
                                  >
                                    <span className="text-[11px] font-black text-slate-900">
                                      {(gIdx + 1).toString().padStart(2, "0")}
                                    </span>
                                  </td>
                                )}
                                {/* Item  rowspan (Standard PO) */}
                                {isFirst && (
                                  <td
                                    rowSpan={group.subRows.length}
                                    className="col-sep sticky z-30 px-2 py-2 align-top border-r border-slate-50 bg-white"
                                    style={{ width: '320px', minWidth: '320px', maxWidth: '320px', left: 60 }}
                                  >
                                    <div className="pl-0">
                                      <InlineSelect
                                        value={group.itemId}
                                        onChange={e => handleGroupChange(group.id, e.target.value)}
                                        options={itemsList.filter(i => header.orderType === "ITC" ? ["SITC", "ITC"].includes(i.itemType) : i.itemType === header.orderType)}
                                        placeholder="Select Item..."
                                        variant="table"
                                      />
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
                                <td
                                  className="col-sep sticky z-20 px-2 py-2 align-top bg-white"
                                  style={{ width: '260px', minWidth: '260px', maxWidth: '260px', left: 380 }}
                                >
                                  <InlineSelect
                                    value={sub.specification}
                                    onChange={e => handleSubRowChange(group.id, sub.id, "specification", e.target.value)}
                                    options={itemData?.specifications || []}
                                    placeholder=" Spec "
                                    disabled={!group.itemId}
                                    renderHtml={true}
                                    variant="table"
                                    onAdd={() => setCustomInputModal({ open: true, type: "specification", groupId: group.id, subId: sub.id, itemId: group.itemId, text: "", originalValue: "" })}
                                    onEdit={(val) => setCustomInputModal({ open: true, type: "specification", groupId: group.id, subId: sub.id, itemId: group.itemId, text: val, originalValue: val })}
                                    onView={(val) => setSpecViewModal({ open: true, html: val, onEdit: () => { setSpecViewModal({ open: false, html: '', onEdit: null }); setCustomInputModal({ open: true, type: 'specification', groupId: group.id, subId: sub.id, itemId: group.itemId, text: val, originalValue: val }); } })}
                                    addLabel="+ Type Custom Spec" />
                                </td>
                              </>
                            )}

                            {/* Model */}
                            {settings.model && (
                              <td className="px-2 py-2 align-top" style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>
                                {sub.hideModel ? (
                                  <button onClick={() => handleSubRowChange(group.id, sub.id, "hideModel", false)}
                                    className="w-full text-[10px] text-slate-300 border border-dashed border-slate-200 rounded-[6px] px-2 py-2 text-center hover:border-indigo-300 hover:text-indigo-400 transition-all min-h-[34px]">
                                    + Add
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <input type="text" value={sub.modelNumber} onChange={e => handleSubRowChange(group.id, sub.id, "modelNumber", e.target.value)}
                                      className="flex-1 min-w-0 text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 transition-all placeholder:text-slate-300 placeholder:italic min-h-[34px]" placeholder="Model #" />
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
                              <td className="px-1 py-2 align-top" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                                {sub.hideBrand ? (
                                  <button onClick={() => handleSubRowChange(group.id, sub.id, "hideBrand", false)}
                                    className="w-full text-[10px] text-slate-300 border border-dashed border-slate-200 rounded-[6px] px-2 py-2 text-center hover:border-indigo-300 hover:text-indigo-400 transition-all min-h-[34px]">
                                    + Add
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <div className="flex-1 min-w-0">
                                      <InlineSelect value={sub.make} onChange={e => handleSubRowChange(group.id, sub.id, "make", e.target.value)}
                                        options={itemData?.brands || []} placeholder="Brand" disabled={!group.itemId} variant="table"
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
                            <td className="py-2 px-1 text-center align-top whitespace-nowrap" style={{ width: '80px' }}>
                              <InlineSelect
                                value={group.unit || ""}
                                onChange={e => setItems(prev => prev.map(g => g.id !== group.id ? g : { ...g, unit: e.target.value }))}
                                options={uomList.map(u => u.uomCode || u.uomName)}
                                placeholder="Unit"
                                searchable={true}
                                minDropWidth={160}
                                variant="table"
                                className="text-center"
                                onAdd={(searchText) => handleAddCustomUnit(group.id, searchText)}
                                addLabel="+ Add"
                              />
                            </td>

                            {/* Qty */}
                            <td className="px-1 py-2 whitespace-nowrap align-top text-center" style={{ width: '90px' }}>
                              <input type="number" value={sub.qty || ""} onChange={e => handleSubRowChange(group.id, sub.id, "qty", Number(e.target.value))}
                                className="no-spin w-full block text-center text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 transition-all" placeholder="0" />
                            </td>

                            {/* Rate */}
                            <td className="px-1 py-2 whitespace-nowrap align-top" style={{ width: '120px' }}>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-300">₹</span>
                                <input type="number" value={sub.unitRate || ""} onChange={e => handleSubRowChange(group.id, sub.id, "unitRate", Number(e.target.value))}
                                  className="no-spin w-full block text-right text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] pl-5 pr-2 py-2 outline-none focus:border-slate-400 transition-all" placeholder="0.00" />
                              </div>
                            </td>

                            {/* Disc */}
                            {settings.discountMode === "line" && (
                              <td className="px-1 py-2 whitespace-nowrap align-top text-center" style={{ width: '70px' }}>
                                <input type="number" value={sub.discountPct || ""} onChange={e => handleSubRowChange(group.id, sub.id, "discountPct", Number(e.target.value))}
                                  className="no-spin w-full text-center text-xs font-bold text-rose-500 bg-rose-50/30 border border-rose-100 rounded-[6px] px-2 py-2 outline-none focus:border-rose-300 transition-all" placeholder="%" />
                              </td>
                            )}

                            {/* GST % */}
                            {settings.taxMode === 'line' && (
                              <td className="px-1 py-2 whitespace-nowrap align-top text-center" style={{ width: '80px' }}>
                                <div className="relative">
                                  <select value={sub.taxPct} onChange={e => handleSubRowChange(group.id, sub.id, "taxPct", Number(e.target.value))}
                                    className="w-full appearance-none text-center text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 cursor-pointer transition-all">
                                    <option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option>
                                  </select>
                                  <ChevronDown size={9} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                                </div>
                              </td>
                            )}

                            {/* Amount (Total) */}
                            <td className="px-3 py-2 text-right text-sm font-bold text-slate-800 border-b border-slate-50 whitespace-nowrap align-top" style={{ width: '140px' }}>
                              {(() => {
                                const p = totals.processedItems.find(x => x.id === sub.id);
                                return `₹${(p?.total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
                              })()}
                            </td>

                            {/* Remarks */}
                            {settings.remarks && (
                              <td className="px-2 py-2 align-top" style={{ width: '240px' }}>
                                <textarea
                                  ref={(el) => autoGrowTextarea(el)}
                                  value={sub.remarks || ""}
                                  onChange={e => handleSubRowChange(group.id, sub.id, "remarks", e.target.value)}
                                  onInput={(e) => autoGrowTextarea(e.currentTarget)}
                                  onFocus={(e) => autoGrowTextarea(e.currentTarget)}
                                  rows={1}
                                  className="w-full resize-none overflow-hidden text-xs text-slate-700 bg-white border border-slate-200 rounded-[6px] px-2 py-2 outline-none focus:border-slate-400 transition-all leading-snug"
                                  placeholder="Remarks..."
                                />
                              </td>
                            )}

                            {/* Action */}
                            <td className="px-1 py-2 sticky right-0 z-40 bg-white align-top no-col-line">
                              <div className="w-full flex justify-center items-start pt-[2px]">
                              <button onClick={() => group.subRows.length > 1 ? removeSubRow(group.id, sub.id) : removeGroup(group.id)}
                                disabled={group.subRows.length === 1 && items.length === 1}
                                className="w-6 h-6 flex items-center justify-center mx-auto text-slate-300 hover:text-white hover:bg-rose-400 rounded transition-all disabled:opacity-0">
                                <X size={11} strokeWidth={2.5} />
                              </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer: Add Item + Summary */}
            {/* Footer: Add Item + Summary Card */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-8 pt-2 border-t border-slate-100">
              {/* Add Item Button Area */}
              <div className="pt-0 md:pt-1">
                <button onClick={addItem}
                  className="group inline-flex items-center justify-center gap-2.5 px-6 py-3 min-w-[170px] whitespace-nowrap rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95">
                  <Plus size={18} strokeWidth={3} /> Add New Item
                </button>
              </div>

              {/* Summary Card Area */}
              <div className="w-full flex flex-col md:flex-row gap-4 md:justify-between md:items-start">
                {/* Total in Words (uses the empty left space) */}
                <div className="w-full md:w-[520px] md:flex-none bg-slate-900/5 rounded-lg border border-slate-200 px-6 py-4 shadow-sm md:mx-auto">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">Total (in words)</p>
                  <p className="mt-2 text-[13px] font-semibold text-slate-950 leading-relaxed">
                    {amountToWords(Number(totals.grandTotal) || 0)}
                  </p>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setCalcModalOpen(true)}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline underline-offset-4"
                    >
                      View calculation
                    </button>
                  </div>
                </div>

                <div className="w-full md:w-[380px] bg-slate-900/5 rounded-md border border-slate-200 pl-6 pr-10 py-4 space-y-3 shadow-sm">
                  <div className="flex justify-between items-center text-[13px] font-medium text-slate-600">
                    <span>Subtotal</span>
                    <span className="text-slate-900 font-bold">₹{totals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>

                  {settings.discountMode === "total" && (
                    <div className="grid grid-cols-[72px_1fr_auto] items-center gap-x-2 text-[13px] font-medium text-slate-600">
                      <span>Discount</span>
                      <div className="flex items-center justify-start">
                        <div className="inline-flex items-center border border-slate-200 rounded-[6px] bg-white overflow-hidden shadow-sm h-9">
                          <input
                            type="number"
                            value={transactionDiscount}
                            onChange={e => setTransactionDiscount(e.target.value)}
                            className="no-spin w-12 text-center outline-none text-[13px] bg-transparent text-slate-700 px-2 font-bold"
                            placeholder="0.00"
                            inputMode="decimal"
                            step="0.01"
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                          <span className="text-[11px] text-slate-400 font-bold px-3 bg-slate-50 border-l border-slate-100 h-full flex items-center">%</span>
                        </div>
                      </div>
                      <span className="text-slate-900 font-bold justify-self-end">
                        ₹{(Number(totals.txDiscountAmt) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  {settings.taxMode === "total" && (
                    <div className="grid grid-cols-[72px_1fr_auto] items-center gap-x-2 text-[13px] font-medium text-slate-600">
                      <span>GST</span>
                      <div className="flex items-center justify-start">
                        <div className="inline-flex items-center border border-slate-200 rounded-[6px] bg-white overflow-hidden shadow-sm h-9">
                          <input
                            type="number"
                            value={transactionTax}
                            onChange={e => setTransactionTax(e.target.value)}
                            className="no-spin w-12 text-center outline-none text-[13px] bg-transparent text-slate-700 px-2 font-bold"
                            placeholder="18"
                            inputMode="decimal"
                            step="0.01"
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                          <span className="text-[11px] text-slate-400 font-bold px-3 bg-slate-50 border-l border-slate-100 h-full flex items-center">%</span>
                        </div>
                      </div>
                      <span className="text-slate-900 font-bold justify-self-end">
                        ₹{(Number(totals.gst) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                {settings.frightMode !== "none" && (
                  <div className="grid grid-cols-[72px_auto_1fr_auto] items-center gap-x-2 text-[13px] font-medium text-slate-600">
                    <span>Freight</span>
                    <div className="border border-slate-200 rounded-[6px] bg-white px-2 shadow-sm h-9 flex items-center">
                      <select
                        value={frightTax}
                        onChange={e => setFrightTax(Number(e.target.value))}
                        disabled={settings.frightMode !== "before"}
                        className="text-[12px] outline-none bg-transparent text-slate-600 font-bold cursor-pointer disabled:opacity-40"
                      >
                        <option value="0">0%</option><option value="5">5%</option>
                        <option value="12">12%</option><option value="18">18%</option>
                      </select>
                    </div>
                    <div />
                    <div className="border border-slate-200 rounded-[6px] bg-white overflow-hidden shadow-sm h-9 flex items-center justify-self-end">
                      <input
                        type="number"
                        value={frightCharges}
                        onChange={e => setFrightCharges(e.target.value)}
                        className="no-spin w-20 text-right outline-none text-[13px] bg-transparent px-3 text-slate-900 font-bold"
                        placeholder="0.00"
                        inputMode="decimal"
                        step="0.01"
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                    </div>
                  </div>
                )}

                {settings.taxMode !== 'total' && (
                  <div className="flex justify-between items-center text-[13px] font-medium text-slate-600">
                    <span>GST</span>
                    <span className="text-slate-900 font-bold">
                      ₹{(Number(totals.gst) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                  <div className="pt-3 border-t border-slate-400">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-bold text-slate-900">Total</p>
                      <p className="text-lg font-bold text-slate-900">₹{totals.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── ORDER NOTES (RICH TEXT) ── */}
          <div className="bg-white rounded p-5 shadow-sm">
            <h2 className="inline-flex items-center text-[11px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded mb-4">Order Notes</h2>
            <div>
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
                  key={`${editOrderId || "new-order"}-${notesLoadedAt || ""}`}
                  theme="snow"
                  defaultValue={header.notes}
                  onChange={(val) => {
                    notesRef.current = val;
                    setHeader(h => ({ ...h, notes: val }));
                  }}
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
          <div className="bg-white rounded p-5 shadow-sm space-y-4">
            <h2 className="inline-flex items-center text-[11px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded">Order Clauses & Terms</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderClauses("Terms & Conditions", "TC", tcPoints, setTcPoints)}
              {renderClauses("Payment Terms", "PAY", payPoints, setPayPoints)}
              {renderClauses("Governing Laws", "GOV", govPoints, setGovPoints)}

              {!showAnnexure && anxPoints.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors group">
                  <button
                    onClick={() => setShowAnnexure(true)}
                    className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-indigo-600 transition-all"
                  >
                    <Plus size={24} className="opacity-40 group-hover:opacity-100" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Add Annexure</span>
                  </button>
                </div>
              ) : (
                <div className="relative group/anx-outer">
                  {renderClauses("Annexures", "ANX", anxPoints, setAnxPoints)}
                  {anxPoints.length === 0 && (
                    <button
                      onClick={() => setShowAnnexure(false)}
                      className="absolute top-2 right-2 p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                      title="Remove Section"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Master Data Interactivity Modals */}
      {actionModal.type === "addSite" && (
        <ProjectFormModal
          onClose={() => setActionModal({ type: null })}
          onError={msg => showToast(msg, "error")}
          onSuccess={async (id) => {
            invalidateMasterCache(); await fetchMasterData(true);
            setHeader(h => ({ ...h, siteId: id }));
            handleSiteChange({ target: { value: id } });
            setActionModal({ type: null });
            showToast("Project added!");
          }}
        />
      )}
      {actionModal.type === "addCompany" && <FullCompanyModal onClose={() => setActionModal({ type: null })} onSuccess={(id) => { invalidateMasterCache(); fetchMasterData(true); setHeader(h => ({ ...h, companyId: id })); handleCompanyChange({ target: { value: id } }); }} />}
      {actionModal.type === "addVendor" && <FullVendorModal onClose={() => setActionModal({ type: null })} onSuccess={(id) => { invalidateMasterCache(); fetchMasterData(true); setHeader(h => ({ ...h, vendorId: id })); handleVendorChange({ target: { value: id } }); }} />}

      {actionModal.type === "editSite" && (
        <ProjectFormModal
          editData={actionModal.data}
          onClose={() => setActionModal({ type: null })}
          onError={msg => showToast(msg, "error")}
          onSuccess={async () => {
            invalidateMasterCache(); await fetchMasterData(true);
            setActionModal({ type: null });
            showToast("Project updated!");
          }}
        />
      )}
      {actionModal.type === "editCompany" && <FullCompanyModal editData={actionModal.data} onClose={() => setActionModal({ type: null })} onSuccess={() => { invalidateMasterCache(); fetchMasterData(true); }} />}
      {actionModal.type === "editVendor" && <FullVendorModal editData={actionModal.data} onClose={() => setActionModal({ type: null })} onSuccess={() => { invalidateMasterCache(); fetchMasterData(true); }} />}

      {actionModal.type === "viewSite" && <FullViewSiteModal site={actionModal.data} onClose={() => setActionModal({ type: null })} onEdit={(d) => setActionModal({ type: "editSite", data: d })} />}
      {actionModal.type === "viewCompany" && <FullViewCompanyModal company={actionModal.data} onClose={() => setActionModal({ type: null })} onEdit={(d) => setActionModal({ type: "editCompany", data: d })} />}
      {actionModal.type === "viewVendor" && <FullViewVendorModal vendor={actionModal.data} onClose={() => setActionModal({ type: null })} onEdit={(d) => setActionModal({ type: "editVendor", data: d })} />}

      {/* CONTACTS */}
      {actionModal.type === "addContact" && <FullContactModal companies={companies} onClose={() => setActionModal({ type: null })} onSuccess={() => { invalidateMasterCache(); fetchMasterData(true); }} />}
      {actionModal.type === "editContact" && <FullContactModal companies={companies} editData={actionModal.data} onClose={() => setActionModal({ type: null })} onSuccess={() => { invalidateMasterCache(); fetchMasterData(true); }} />}
      {actionModal.type === "viewContact" && <FullViewContactModal contact={actionModal.data} onClose={() => setActionModal({ type: null })} onEdit={(d) => setActionModal({ type: "editContact", data: d })} />}

      {/* SPEC VIEW MODAL */}
      {specViewModal.open && (
        <SpecViewModal
          html={specViewModal.html}
          clauseCode={specViewModal.code}
          clauseType={specViewModal.type}
          clauseTitle={specViewModal.title}
          onClose={() => setSpecViewModal({ open: false, html: '' })}
          onEdit={() => {
            const h = specViewModal.onEdit;
            setSpecViewModal({ open: false, html: '' });
            if (h) h();
          }}
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
            invalidateMasterCache(); fetchMasterData(true);
            if (selectedPoints) {
              const html = getCleanHTML(selectedPoints);
              if (actionModal.setPoints) actionModal.setPoints([html]);
            }
            setActionModal({ type: null });
          }}
        />
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <p className="text-sm font-semibold text-slate-700 leading-relaxed">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ORDER_LIST_FILTER_SHELL =
  "relative flex h-9 items-center rounded-md border border-slate-300 bg-white shadow-sm transition-colors hover:border-slate-400 focus-within:border-slate-400";
const ORDER_LIST_FILTER_CONTROL =
  "w-full h-full min-w-0 appearance-none border-0 bg-transparent text-[12px] font-normal text-slate-700 outline-none cursor-pointer";

function OrderMultiFilter({ label, options, selected, onChange, icon: Icon, minWidth = 100 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) { setQuery(""); return; }
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (val) => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  const visible = query ? options.filter(o => String(o).toLowerCase().includes(query.toLowerCase())) : options;

  return (
    <div ref={ref} className="relative" style={{ minWidth }}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex h-9 w-full items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium shadow-sm transition-colors ${
          selected.length ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
        }`}
      >
        {Icon && <Icon size={12} className="shrink-0 opacity-70" />}
        <span className="truncate flex-1 text-left">
          {selected.length === 1 ? selected[0] : selected.length > 1 ? `${label} (${selected.length})` : label}
        </span>
        {selected.length > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-indigo-600 px-1 text-[9px] font-black text-white">{selected.length}</span>
        )}
        <ChevronDown size={11} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="border-b border-slate-100 px-2 py-1.5">
            <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2">
              <Search size={12} className="text-slate-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search..."
                className="h-7 w-full bg-transparent text-[11px] outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <p className="px-3 py-3 text-center text-[11px] text-slate-400">No options</p>
            ) : visible.map(opt => {
              const checked = selected.includes(opt);
              return (
                <button key={opt} onClick={() => toggle(opt)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${checked ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded border transition-colors ${checked ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white"}`}>
                    {checked && <Check size={9} strokeWidth={3} className="text-white" />}
                  </span>
                  <span className="truncate">{opt}</span>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5">
              <span className="text-[10px] font-semibold text-slate-400">{selected.length} selected</span>
              <button onClick={() => onChange([])} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800">Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const DR_PRESETS = [
  { val: "today",       label: "Today" },
  { val: "yesterday",   label: "Yesterday" },
  { val: "this_week",   label: "This Week" },
  { val: "last_week",   label: "Last Week" },
  { val: "past_2_week", label: "Past 2 Week" },
  { val: "this_month",  label: "This Month" },
  { val: "last_month",  label: "Last Month" },
  { val: "this_year",   label: "This Year" },
  { val: "last_year",   label: "Last Year" },
  { val: "all",         label: "All" },
];
const DR_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DR_DAYS   = ["Mo","Tu","We","Th","Fr","Sa","Su"];

function drToStr(d) {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function drPresetRange(val) {
  const t = new Date(); t.setHours(0,0,0,0);
  switch (val) {
    case "today":       return [new Date(t), new Date(t)];
    case "yesterday":   { const d=new Date(t); d.setDate(d.getDate()-1); return [d,d]; }
    case "this_week":   { const day=t.getDay(), diff=day===0?-6:1-day, f=new Date(t); f.setDate(t.getDate()+diff); return [f,new Date(t)]; }
    case "last_week":   { const day=t.getDay(), diff=day===0?-6:1-day, m=new Date(t); m.setDate(t.getDate()+diff); const lm=new Date(m); lm.setDate(m.getDate()-7); const ls=new Date(m); ls.setDate(m.getDate()-1); return [lm,ls]; }
    case "past_2_week": { const f=new Date(t); f.setDate(t.getDate()-14); return [f,new Date(t)]; }
    case "this_month":  return [new Date(t.getFullYear(),t.getMonth(),1), new Date(t)];
    case "last_month":  return [new Date(t.getFullYear(),t.getMonth()-1,1), new Date(t.getFullYear(),t.getMonth(),0)];
    case "this_year":   return [new Date(t.getFullYear(),0,1), new Date(t)];
    case "last_year":   return [new Date(t.getFullYear()-1,0,1), new Date(t.getFullYear()-1,11,31)];
    default:            return [null,null];
  }
}

function DateRangeFilter({ dateRange, setDateRange, customFrom, setCustomFrom, customTo, setCustomTo, minDate, maxDate }) {
  const [open,         setOpen]         = useState(false);
  const [popPos,       setPopPos]       = useState({ top: 0, right: 0 });
  const [activePreset, setActivePreset] = useState("all");
  const [rangeFrom,    setRangeFrom]    = useState(null);
  const [rangeTo,      setRangeTo]      = useState(null);
  const [hoverDate,    setHoverDate]    = useState(null);
  const [selecting,    setSelecting]    = useState(false);
  const [calBase,      setCalBase]      = useState(() => { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return d; });
  const btnRef  = useRef(null);
  const popRef  = useRef(null);

  const maxMs = useMemo(() => {
    const d = maxDate ? new Date(maxDate) : new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [maxDate]);

  const minMs = useMemo(() => {
    if (!minDate) return null;
    const d = new Date(minDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [minDate]);

  const clampDay = (d) => {
    if (!d) return null;
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    let ms = t.getTime();
    if (minMs != null && ms < minMs) ms = minMs;
    if (ms > maxMs) ms = maxMs;
    return new Date(ms);
  };

  const clampRange = (f, t) => {
    let from = clampDay(f);
    let to = clampDay(t);
    if (from && to && from.getTime() > to.getTime()) to = new Date(from);
    return [from, to];
  };

  const isSelectable = (ms) => ms <= maxMs && (minMs == null || ms >= minMs);

  const leftMonthMs = new Date(calBase.getFullYear(), calBase.getMonth(), 1).getTime();
  const canGoPrev = minMs == null || leftMonthMs > new Date(new Date(minMs).getFullYear(), new Date(minMs).getMonth(), 1).getTime();

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPopPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const handlePreset = (p) => {
    setActivePreset(p); setSelecting(false);
    const [f, t] = clampRange(...drPresetRange(p));
    setRangeFrom(f); setRangeTo(t);
    // Navigate calendar so range is visible
    if (p === "all") {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); setCalBase(d);
    } else if (f) {
      setCalBase(new Date(f.getFullYear(), f.getMonth(), 1));
    }
  };

  const handleDateClick = (date) => {
    if (!isSelectable(date.getTime())) return;
    setActivePreset("custom");
    if (!selecting || !rangeFrom) { setRangeFrom(date); setRangeTo(null); setSelecting(true); }
    else {
      if (date < rangeFrom) { setRangeTo(rangeFrom); setRangeFrom(date); }
      else { setRangeTo(date); }
      setSelecting(false);
    }
  };

  const handleApply = () => {
    if (activePreset === "all") { setDateRange("all"); setCustomFrom(""); setCustomTo(""); }
    else {
      const [from, to] = clampRange(rangeFrom, rangeTo || rangeFrom);
      setDateRange("custom");
      setCustomFrom(drToStr(from));
      setCustomTo(drToStr(to));
    }
    setOpen(false);
  };

  const handleClear = () => { setActivePreset("all"); setRangeFrom(null); setRangeTo(null); setSelecting(false); };

  const leftM  = { y: calBase.getFullYear(), m: calBase.getMonth() };
  const rBase  = new Date(calBase.getFullYear(), calBase.getMonth()+1, 1);
  const rightM = { y: rBase.getFullYear(), m: rBase.getMonth() };

  const renderCells = (year, month) => {
    const dim      = new Date(year, month+1, 0).getDate();
    const prevDim  = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const offset   = firstDay === 0 ? 6 : firstDay - 1;
    const effectiveTo = selecting ? hoverDate : rangeTo;
    const lo = rangeFrom && effectiveTo ? (rangeFrom <= effectiveTo ? rangeFrom : effectiveTo) : null;
    const hi = rangeFrom && effectiveTo ? (rangeFrom <= effectiveTo ? effectiveTo : rangeFrom) : null;

    const makeCell = (d, date, isGhost) => {
      if (isGhost) return (
        <div key={`g${d}`} className="flex h-8 items-center justify-center text-[11px] text-slate-300 select-none">{d}</div>
      );
      const ms = date.getTime();
      if (!isSelectable(ms)) {
        return (
          <div key={d} className="flex h-8 items-center justify-center text-[11px] text-slate-300 select-none">{d}</div>
        );
      }
      const isStart    = rangeFrom && ms === rangeFrom.getTime();
      const isEnd      = effectiveTo && ms === effectiveTo.getTime();
      const inRange    = lo && hi && date > lo && date < hi;
      const isSelected = isStart || isEnd || inRange;
      const isToday    = ms === maxMs;
      return (
        <div key={d} className="flex h-8 items-center justify-center">
          <button
            type="button"
            onClick={() => handleDateClick(date)}
            onMouseEnter={() => selecting && isSelectable(date.getTime()) && setHoverDate(date)}
            onMouseLeave={() => selecting && setHoverDate(null)}
            className={[
              "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[12px] leading-none transition-colors",
              isStart || isEnd ? "bg-[#300E4E] text-white font-semibold" : "",
              inRange ? "bg-violet-100 text-[#300E4E] font-medium" : "",
              !isSelected ? "text-slate-700 hover:bg-slate-100" : "",
              isToday && !isSelected ? "ring-1 ring-[#300E4E]/40" : "",
            ].filter(Boolean).join(" ")}
          >{d}</button>
        </div>
      );
    };

    const cells = [];
    // Previous month ghost dates
    for (let i = offset - 1; i >= 0; i--) cells.push(makeCell(prevDim - i, null, true));
    // Current month dates
    for (let d = 1; d <= dim; d++) cells.push(makeCell(d, new Date(year, month, d), false));
    // Next month ghost dates (fill to complete row)
    const total = offset + dim;
    const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let d = 1; d <= trailing; d++) cells.push(makeCell(d, null, true));
    return cells;
  };

  const isActive = dateRange !== "all";
  const btnLabel = isActive
    ? (dateRange === "custom" && customFrom
        ? `${customFrom}${customTo ? " – "+customTo : ""}`
        : DR_PRESETS.find(p => p.val === activePreset)?.label || "Date")
    : "Pick a date range";

  const drCalGridStyle = { gridTemplateColumns: "repeat(7, 32px)", columnGap: 3, rowGap: 3 };

  const renderMonthPane = (year, month, nav) => (
    <div className="w-[242px] shrink-0">
      <div className="mb-1 flex h-7 w-full items-center justify-between">
        {nav === "left" ? (
          <button type="button" disabled={!canGoPrev}
            onClick={() => canGoPrev && setCalBase(new Date(calBase.getFullYear(), calBase.getMonth() - 1, 1))}
            className={`flex h-6 w-6 items-center justify-center rounded text-slate-500 ${canGoPrev ? "hover:bg-slate-100" : "opacity-30 cursor-not-allowed"}`}>
            <ChevronRight size={13} className="rotate-180" />
          </button>
        ) : <span className="h-6 w-6" />}
        <span className="text-[12px] font-semibold text-slate-800">{DR_MONTHS[month]} {year}</span>
        {nav === "right" ? (
          <button type="button" onClick={() => setCalBase(new Date(calBase.getFullYear(), calBase.getMonth() + 1, 1))}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 text-slate-500">
            <ChevronRight size={13} />
          </button>
        ) : <span className="h-6 w-6" />}
      </div>
      <div className="mb-0.5 grid" style={drCalGridStyle}>
        {DR_DAYS.map(d => (
          <div key={d} className="flex h-6 items-center justify-center text-[10px] font-medium text-slate-400">{d}</div>
        ))}
      </div>
      <div className="grid" style={drCalGridStyle}>{renderCells(year, month)}</div>
    </div>
  );

  const popup = open && createPortal(
    <div ref={popRef} className="flex w-max rounded-sm border border-slate-200 bg-white shadow-lg"
      style={{ position: "fixed", top: popPos.top, right: popPos.right, zIndex: 9999 }}
    >
          {/* Preset list */}
          <div className="w-[108px] shrink-0 border-r border-slate-100 py-2 flex flex-col">
            {DR_PRESETS.map(p => (
              <button key={p.val} type="button" onClick={() => handlePreset(p.val)}
                className={`px-2.5 py-1 text-left text-[12px] font-medium transition-colors ${
                  activePreset === p.val ? "bg-violet-200/80 text-[#300E4E] font-semibold" : "text-slate-600 hover:bg-slate-50"
                }`}
              >{p.label}</button>
            ))}
          </div>

          {/* Dual calendar + footer */}
          <div className="flex shrink-0 flex-col px-3 pt-2 pb-0">
            <div className="flex items-start gap-3">
              {renderMonthPane(leftM.y, leftM.m, "left")}
              <div className="w-px shrink-0 self-stretch bg-slate-100" />
              {renderMonthPane(rightM.y, rightM.m, "right")}
            </div>

            <div className="mt-2 flex items-center justify-end gap-2 border-t border-slate-200 pt-1.5 pb-2">
              <button type="button" onClick={handleClear} className="flex items-center gap-1 px-1 py-0.5 text-[12px] font-medium text-slate-500 hover:text-slate-700 rounded hover:bg-slate-50">
                <X size={12} strokeWidth={2} />
                Clear
              </button>
              <button type="button" onClick={handleApply} className="flex h-7 items-center gap-1 rounded-md bg-[#300E4E] px-3 text-[12px] font-semibold text-white hover:opacity-90">
                <CalendarDays size={12} />
                Apply
              </button>
            </div>
          </div>
        </div>,
    document.body
  );

  return (
    <div ref={btnRef} className="relative" style={{ minWidth: 140 }}>
      <button type="button" onClick={handleToggle}
        className={`inline-flex h-9 w-full items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors ${
          isActive ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
        }`}
      >
        <CalendarDays size={14} className={`shrink-0 ${isActive ? "text-violet-700" : "text-slate-400"}`} />
        <span className={`truncate flex-1 text-left ${!isActive ? "text-slate-400" : ""}`}>{btnLabel}</span>
        <ChevronDown size={12} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {popup}
    </div>
  );
}

/** Grand total for list table + analytics (matches Total Value column). */
const getOrderGrandTotal = (o) => {
  let totalVal = Number(o.totals?.grandTotal || 0);
  if (totalVal === 0) {
    const its = o.order_items || o.snapshot?.items || [];
    if (its.length > 0) {
      const sub = its.reduce((s, it) => s + (Number(it.qty) * Number(it.unit_rate) || Number(it.amount) || 0), 0);
      const gst = its.reduce((s, it) => {
        const base = Number(it.qty) * Number(it.unit_rate) || Number(it.amount) || 0;
        return s + (base * (Number(it.tax_pct) || 0) / 100);
      }, 0);
      totalVal = sub + gst;
    }
  }
  return totalVal > 0 ? totalVal : 0;
};

// ============== ORDER LIST COMPONENT ==============
function OrderList({ project, onCreateClick, onViewClick, onEditClick }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("bms_user") || "{}"); }
    catch { return {}; }
  });
  const isGlobalAdmin = currentUser.role === "global_admin";
  // Priority order matters: Master Data and Procurement scopes must resolve to
  // their own module_key first, not whichever module happens to sort first.
  const orderPermissionKeys = project ? ["order", "create_order"] : ["master_data_orders_tab", "order", "create_order"];
  const myPerms = orderPermissionKeys
    .map(k => currentUser.app_permissions?.find(p => p.module_key === k))
    .find(Boolean) || {};
  const canEdit = isGlobalAdmin || !!myPerms.can_edit || !!myPerms.can_add;
  const canDelete = isGlobalAdmin || !!myPerms.can_delete;
  const canTrashView    = isGlobalAdmin || !!myPerms.can_trash_view;
  const canTrashLog     = isGlobalAdmin || !!myPerms.can_trash_log;
  const canTrashRestore = isGlobalAdmin || !!myPerms.can_trash_restore;
  const canTrashDelete  = isGlobalAdmin || !!myPerms.can_trash_delete;

  useEffect(() => {
    const token = localStorage.getItem("bms_token");
    if (!token) return;
    fetch(`${API}/api/auth/my-permissions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        const stored = JSON.parse(localStorage.getItem("bms_user") || "{}");
        const updated = { ...stored, app_permissions: data.permissions || [] };
        localStorage.setItem("bms_user", JSON.stringify(updated));
        setCurrentUser(updated);
        window.dispatchEvent(new CustomEvent("bms_permissions_updated"));
      })
      .catch(() => { });
  }, []);

  // Users with create/edit order access can edit any Draft/Review order.
  const canEditOrder = (o) => {
    if (o._history || ["Rejected", "Cancelled", "Reverted", "Recalled", "Issued"].includes(o.status)) return false;
    const isEditableStatus = ['Draft', 'Review'].includes(o.status);
    if (isGlobalAdmin) return isEditableStatus;
    return canEdit && isEditableStatus;
  };

  const canDeleteOrder = (o) => {
    if (o._history) return false;
    return canDelete && ["Draft", "Review"].includes(o.status);
  };
  const canWithdrawApproval = (o) =>
    !o._history &&
    ["Pending Issue", "To Issue"].includes(o.status) &&
    o.pending_approval_request?.status === "Pending" &&
    (
      String(o.pending_approval_request?.requestor_id) === String(currentUser.id) ||
      String(o.created_by_id) === String(currentUser.id)
    );
  const [orders, setOrders] = useState(cachedOrders || []);
  const [loading, setLoading] = useState(!cachedOrders);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("All");
  const tableScrollRef = useRef(null);
  useEffect(() => {
    if (tableScrollRef.current) tableScrollRef.current.scrollLeft = 0;
  }, [activeTab]);
  const [pdfPreviewId, setPdfPreviewId] = useState(null);
  const [pdfPreviewNonce, setPdfPreviewNonce] = useState(0);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);

  // Export modal
  const [showExport, setShowExport] = useState(false);
  const [exportScope, setExportScope] = useState("current"); // "current" | "all"
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  // Bulk import / export
  const [showBulk, setShowBulk] = useState(false);
  const [bulkKind, setBulkKind] = useState("Purchase Order"); // Purchase Order | Work Order
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const bulkRef = React.useRef();

  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }
  const [copiedOrderId, setCopiedOrderId] = useState("");
  const [trashedOrders, setTrashedOrders] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [logPanel, setLogPanel] = useState(null); // { orderId, orderNumber }
  const [logLoading, setLogLoading] = useState(false);
  const [logEvents, setLogEvents] = useState([]);

  useEffect(() => {
    if (!logPanel) { setLogEvents([]); return; }
    setLogLoading(true);
    const token = localStorage.getItem("bms_token") || "";
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API}/api/orders/${logPanel.orderId}`).then(r => r.json()),
      fetch(`${API}/api/amendments/requests?order_id=${logPanel.orderId}`, { headers }).then(r => r.json()).catch(() => ({ requests: [] })),
      fetch(`${API}/api/approval-flows/request/${logPanel.orderId}`, { headers }).then(r => r.json()).catch(() => ({ request: null })),
    ]).then(([orderData, amendData, approvalData]) => {
      const order = orderData.order || {};
      const events = [];

      const statusLabels = {
        Review: 'Submitted for Review', 'Pending Issue': 'Submitted for Approval',
        Issued: 'Issued', Draft: 'Returned to Draft', Reverted: 'Reverted',
        Recalled: 'Recalled', Cancelled: 'Cancelled', Rejected: 'Rejected',
        Deleted: 'Deleted', Restored: 'Restored', Withdrawn: 'Approval Withdrawn',
        Amended: 'Amended',
        'Recall Requested': 'Recall Requested', 'Cancel Requested': 'Cancel Requested',
        'Recall Rejected': 'Recall Rejected', 'Cancel Rejected': 'Cancel Rejected',
        'Recall Request Cancelled': 'Recall Request Cancelled',
        'Cancel Request Cancelled': 'Cancel Request Cancelled',
        'Recall Cancelled': 'Recall Cancelled',
        'Cancel Order Withdrawn': 'Cancel Order Withdrawn',
        'Amendment Cancelled': 'Amendment Cancelled',
        'Amendment Request Cancelled': 'Amendment Request Cancelled',
      };

      // 1. Synthetic created event
      if (order.created_at) {
        events.push({ action_at: order.created_at, action_by: order.made_by || 'Unknown', action: 'Order Created', _sub: `${order.order_number || ''} • Draft` });
      }

      // 2. activity_log entries
      const actLog = Array.isArray(order.snapshot?.activity_log) ? order.snapshot.activity_log : [];
      actLog.forEach(e => {
        events.push({ ...e, action: statusLabels[e.action] || e.action, _attach: e.attachment_url || undefined });
      });

      // Older trash rows may only have the _deleted marker, not an activity_log entry.
      const deletedMeta = order.snapshot?._deleted || {};
      if (deletedMeta.deleted_at) {
        const deletedMinute = deletedMeta.deleted_at?.slice(0, 16);
        const hasDeletedEvent = events.some(e =>
          e.action === "Deleted" && e.action_at?.slice(0, 16) === deletedMinute
        );
        if (!hasDeletedEvent) {
          events.push({
            action_at: deletedMeta.deleted_at,
            action_by: deletedMeta.deleted_by || "Unknown",
            action: "Deleted",
            comments: `Moved to Trash from ${deletedMeta.original_status || "Unknown"}`,
          });
        }
      }

      // 3. Approval logs — intermediate approver decisions (dedupe against activity_log)
      const activityTs = new Set(actLog.map(e => e.action_at?.slice(0, 16)));
      const approvalLogs = approvalData.request?.logs || [];
      approvalLogs.forEach(log => {
        const logMin = log.created_at?.slice(0, 16);
        const isDupe = activityTs.has(logMin) && ['Issued', 'Reverted', 'Recalled', 'Cancelled', 'Rejected'].includes(log.action);
        if (!isDupe) {
          events.push({
            action_at: log.created_at,
            action_by: log.action_by_name || 'Approver',
            action: log.action,
            comments: log.comments,
            _step: log.step_number,
          });
        }
      });

      // 4. Amendment events
      (amendData.requests || []).forEach(a => {
        events.push({ action_at: a.created_at, action_by: a.requestor?.name || 'User', action: 'Amendment Requested', comments: a.reason, _attach: a.attachment_url });
        if (a.status === 'Approved' && a.actioned_at)
          events.push({ action_at: a.actioned_at, action_by: a.actioner?.name || 'Admin', action: 'Amendment Approved' });
        else if (a.approved_at)
          events.push({ action_at: a.approved_at, action_by: a.approver?.name || 'Admin', action: 'Amendment Approved' });
        if ((a.status === 'Cancelled' || a.status === 'Rejected') && a.actioned_at)
          events.push({ action_at: a.actioned_at, action_by: a.actioner?.name || 'Admin', action: `Amendment ${a.status}` });
      });

      events.sort((a, b) => new Date(a.action_at) - new Date(b.action_at));
      setLogEvents(events);
    })
      .catch(() => setLogEvents([]))
      .finally(() => setLogLoading(false));
  }, [logPanel]);

  // Body scroll lock for modals/drawers in OrderList
  useEffect(() => {
    const isModalOpen = logPanel || pdfPreviewId || showBulk || confirmModal;
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = "6px";
    } else {
      document.body.style.overflow = "auto";
      document.body.style.paddingRight = "0px";
    }
    return () => {
      document.body.style.overflow = "auto";
      document.body.style.paddingRight = "0px";
    };
  }, [logPanel, pdfPreviewId, showBulk, confirmModal]);

  const getLogStyle = (action = "") => {
    const a = action.toLowerCase();
    if (a.includes("created")) return { dot: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-700", icon: <FileText size={12} /> };
    if (a === "issued") return { dot: "bg-emerald-600", badge: "bg-emerald-100 text-emerald-800", icon: <CheckCircle2 size={12} /> };
    if (a === "restored") return { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", icon: <Undo2 size={12} /> };
    if (a === "deleted") return { dot: "bg-rose-600", badge: "bg-rose-100 text-rose-700", icon: <Trash2 size={12} /> };
    if (a.includes("withdraw")) return { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700", icon: <Undo2 size={12} /> };
    if (a.includes("edit")) return { dot: "bg-cyan-500", badge: "bg-cyan-100 text-cyan-700", icon: <Pencil size={12} /> };
    if (a.includes("recall") && a.includes("cancel")) return { dot: "bg-slate-400", badge: "bg-slate-100 text-slate-500", icon: <X size={12} /> };
    if (a.includes("recall") && a.includes("reject")) return { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-700", icon: <X size={12} /> };
    if (a.includes("recall")) return { dot: "bg-purple-500", badge: "bg-purple-100 text-purple-700", icon: <FileText size={12} /> };
    if (a.includes("cancel") && a.includes("reject")) return { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-700", icon: <X size={12} /> };
    if (a === "cancelled") return { dot: "bg-slate-600", badge: "bg-slate-100 text-slate-600", icon: <X size={12} /> };
    if (a.includes("cancel")) return { dot: "bg-rose-400", badge: "bg-rose-50 text-rose-600", icon: <FileText size={12} /> };
    if (a.includes("reject")) return { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-700", icon: <X size={12} /> };
    if (a.includes("amend") && a.includes("approv")) return { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 size={12} /> };
    if (a.includes("amend")) return { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700", icon: <FileText size={12} /> };
    if (a.includes("review")) return { dot: "bg-sky-500", badge: "bg-sky-100 text-sky-700", icon: <FileText size={12} /> };
    if (a.includes("approv")) return { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 size={12} /> };
    if (a === "draft") return { dot: "bg-blue-400", badge: "bg-blue-100 text-blue-700", icon: <FileText size={12} /> };
    return { dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600", icon: <FileText size={12} /> };
  };

  const fmtLogTs = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + ", " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  const copyOrderNumber = (text, id, e) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedOrderId(id);
      setTimeout(() => setCopiedOrderId(""), 1500);
    }).catch(() => showToast("Copy failed", "error"));
  };

  // Filters
  const [filterSite, setFilterSite] = useState([]);
  const [filterCompany, setFilterCompany] = useState([]);
  const [filterType, setFilterType] = useState([]);
  const [filterMadeBy, setFilterMadeBy] = useState([]);
  const [filterVendor, setFilterVendor] = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);
  const [dateRange, setDateRange] = useState("all"); // all | this_year | last_year | custom
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showMoreTabs, setShowMoreTabs] = useState(false);

  const PRIMARY_TABS = ["All", "Draft", "Review", "Pending Approval", "Pending Issue", "Issued", "Amend Request", "Amended"];
  const MORE_TABS = ["Reverted", "Rejected", "Recalled", "Cancelled", "Trash"];
  const TABS = [...PRIMARY_TABS, ...MORE_TABS];

  useEffect(() => {
    if (cachedOrders) fetchOrders(true);
    else fetchOrders();
    fetchTrash(true);
  }, []);

  useEffect(() => {
    if (activeTab === "Trash") fetchTrash();
  }, [activeTab]);

  const fetchTrash = async (isBackground = false) => {
    if (!isBackground) setTrashLoading(true);
    try {
      const res = await fetch(`${API}/api/orders/trash`);
      const data = await res.json();
      setTrashedOrders(data.orders || []);
    } catch {
      if (!isBackground) showToast("Failed to load trash", "error");
    }
    if (!isBackground) setTrashLoading(false);
  };

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

  const handleDelete = (id) => {
    setConfirmModal({
      message: "Move this order to Trash?", onConfirm: async () => {
        try {
          const user = JSON.parse(localStorage.getItem("bms_user") || "{}");
          const deleted_by = encodeURIComponent(user.name || user.id || "Unknown");
          const res = await authFetch(`${API}/api/orders/${id}?deleted_by=${deleted_by}`, { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { showToast(data.error || `Delete failed (${res.status})`, "error"); return; }
          showToast("Order moved to Trash");
          fetchOrders();
          fetchTrash(true);
        } catch (err) { showToast(err.message || "Failed to delete", "error"); }
      }
    });
  };

  const handleRestore = (id) => {
    setConfirmModal({
      message: "Restore this order? It will return to its original status.", onConfirm: async () => {
        try {
          const user = JSON.parse(localStorage.getItem("bms_user") || "{}");
          const restored_by = encodeURIComponent(user.name || user.id || "Unknown");
          const res = await fetch(`${API}/api/orders/${id}/restore?restored_by=${restored_by}`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { showToast(data.error || "Restore failed", "error"); return; }
          showToast(`Order restored to ${data.restored_status || "original status"}`);
          fetchTrash();
          fetchOrders(true);
        } catch (err) { showToast(err.message || "Restore failed", "error"); }
      }
    });
  };

  const handlePermanentDelete = (id) => {
    setConfirmModal({
      message: "Permanently delete this order? This CANNOT be undone — all data will be lost.", onConfirm: async () => {
        try {
          const res = await fetch(`${API}/api/orders/${id}/permanent`, { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { showToast(data.error || "Delete failed", "error"); return; }
          showToast("Order permanently deleted");
          fetchTrash();
        } catch (err) { showToast(err.message || "Permanent delete failed", "error"); }
      }
    });
  };

  const handleApprovalAction = async (id, action, promptMsg) => {
    const comments = prompt(promptMsg || `Enter comments for ${action}:`, "");
    if (comments === null) return;
    try {
      const reqRes = await authFetch(`${API}/api/approval-flows/request/${id}`);
      const reqData = await reqRes.json();
      const requestId = reqData?.request?.id;
      if (!requestId) throw new Error("No approval request found");
      const actRes = await authFetch(`${API}/api/approval-flows/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, action: action.toLowerCase(), comments: comments || action }),
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
    try {
      const res = await authFetch(`${API}/api/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: JSON.stringify({ mainData: { status: "Recalled" } }) }),
      });
      if (!res.ok) throw new Error("Recall failed");
      showToast("Order recalled");
      fetchOrders();
    } catch (err) { showToast(err.message || "Recall failed", "error"); }
  };

  const handleCancel = async (id) => {
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
      showToast("Submitting for approval...");
      const bmsUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const res = await authFetch(`${API}/api/approval-flows/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: "order", document_id: id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Submit failed");

      if (d.skip && !d.auto_approved) {
        // No flow — push directly to Pending Issue
        await fetch(`${API}/api/orders/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: JSON.stringify({ mainData: { status: "Pending Issue", action_by: bmsUser.name || "" } }) }),
        });
      }

      showToast(
        d.auto_approved
          ? "Auto-approved — moved to Pending Issue"
          : d.skip
          ? "No approval flow — moved to Pending Issue"
          : "Order submitted for approval"
      );
      fetchOrders();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleWithdrawApproval = (id) => {
    setConfirmModal({
      message: "Withdraw this approval request? The order will return to Review.", onConfirm: async () => {
        try {
          const res = await authFetch(`${API}/api/approval-flows/withdraw/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) throw new Error(data.error || "Withdraw failed");
          showToast("Approval request withdrawn. Order moved back to Review.");
          fetchOrders();
        } catch (err) {
          showToast(err.message || "Withdraw failed", "error");
        }
      }
    });
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
      // Normalize notes: may be plain HTML, JSON array string, or JS array
      const resolveNotesPoints = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
        if (typeof raw === "string" && raw.trim().startsWith("[")) {
          try { const a = JSON.parse(raw); if (Array.isArray(a)) return a.map(String).filter(Boolean); } catch {}
        }
        return null; // plain HTML / text — handle separately
      };
      const notesPoints = resolveNotesPoints(order.notes);
      const notesHtml = notesPoints
        ? null
        : (typeof order.notes === "string" ? order.notes : "");
      const notesText = notesPoints
        ? notesPoints.join(" ")
        : (notesHtml || "").replace(/<[^>]+>/g, "").trim();

      if (notesText) {
        if (cursorY > pageHeight - 60) { doc.addPage(); cursorY = 20; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("ORDER NOTES:", 15, cursorY);
        cursorY += 6;
        doc.setFont("helvetica", "normal"); doc.setFontSize(9);

        if (notesPoints) {
          notesPoints.forEach((pt, i) => {
            const lines = doc.splitTextToSize(`${i + 1}. ${pt}`, 180);
            doc.text(lines, 15, cursorY);
            cursorY += (lines.length * 5) + 2;
          });
          cursorY += 6;
        } else {
          const cleanNotes = normalizeRichTextHtml(notesHtml)
            .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n")
            .replace(/<li>/gi, "• ").replace(/<\/li>/gi, "\n")
            .replace(/<[^>]+>/g, "");
          const noteLines = doc.splitTextToSize(cleanNotes.trim(), 180);
          doc.text(noteLines, 15, cursorY);
          cursorY += (noteLines.length * 5) + 8;
        }
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

      doc.save(makeOrderPdfFilename(order.order_number));
      showToast("PDF exported successfully!");
    } catch (err) { console.error(err); showToast("Error generating PDF", "error"); }
  };

  const openPDFPreview = (orderId) => {
    setPdfPreviewNonce(Date.now());
    setPdfPreviewId(orderId);
  };

  useEffect(() => {
    if (!pdfPreviewId) {
      setPdfBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      return;
    }
    let cancelled = false;
    const order = orders.find(o => String(o.id) === String(pdfPreviewId));
    const filename = makeOrderPdfFilename(order?.order_number, `Order_${pdfPreviewId}`);
    fetch(`${API}/api/orders/${pdfPreviewId}/pdf?t=${pdfPreviewNonce || Date.now()}`)
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return;
        const pdfFile = new File([blob], filename, { type: "application/pdf" });
        const url = URL.createObjectURL(pdfFile);
        setPdfBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [pdfPreviewId, pdfPreviewNonce]);

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
      const order = orders.find(o => String(o.id) === String(pdfPreviewId));
      a.download = makeOrderPdfFilename(order?.order_number, `Order_${pdfPreviewId}`);
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      showToast("PDF downloaded successfully!");
    } catch (err) {
      console.error(err);
      showToast("PDF download failed", "error");
    }
    setPdfDownloading(false);
  };

  const doExport = () => {
    let data = exportScope === "current" ? filtered : orders;
    if (exportFrom || exportTo) {
      const from = exportFrom ? new Date(exportFrom) : null;
      const to = exportTo ? new Date(exportTo + "T23:59:59") : null;
      data = data.filter(o => {
        const d = new Date(o.date_of_creation || o.created_at);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    const rows = data.map(o => {
      const snap = o.snapshot || {};
      const t = o.totals || {};
      const taxable = (Number(t.subtotal) || 0) - (Number(t.totalDiscountAmt) || 0);
      return {
        "Company Code": snap.company?.companyCode || o.companies?.company_code || "",
        "Site Code": snap.site?.siteCode || "",
        "Order No": o.order_number || "DRAFT",
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
    showToast(`${rows.length} orders exported`);
    setShowExport(false);
  };

  const handleExport = () => {
    setExportScope("current");
    setExportFrom("");
    setExportTo("");
    setShowExport(true);
  };

  const downloadBulkTemplate = () => {
    const isPO = bulkKind === "Purchase Order";
    const orderNoCol = isPO ? "Purchase Order No." : "Work Order No.";
    const defaultType = isPO ? "Supply" : "SITC";

    // Common columns — only IDs/codes, system fetches details from masters
    const commonStart = [
      "S.No",
      "Site Code", "Company Code", "Vendor Code", "Vendor PAN", "Contact IDs",
      orderNoCol, "Order Type", "Reference Number",
      "Created By", "Created On", "Requisition By", "Subject",
      "Status", "Issued At", "Issued By (Email)", "Amended From (Order No)",
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
      "Vendor Code": "VEN-001",
      "Vendor PAN": "",
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
      "Issued By (Email)": "admin@company.com",
    };

    const totalsBlock = {
      "Fright": 0,
      "Total Tax (₹)": isPO ? 7200 : 9000,
      "Total Amount (₹)": isPO ? 47200 : 59000,
      "Order Notes": isPO
        ? "Deliver at site gate, Payment net 30, Quality check mandatory, Insurance included"
        : "Scraping of old paint, Application of primer coat, Final water-proofing coat with warranty",
      "TC ID": "TC-001",
      "Payment Terms ID": "PAY-001",
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
          "Site Code": "", "Company Code": "", "Vendor Code": "", "Vendor PAN": "", "Contact IDs": "",
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

  const getSiteCodeForOrder = (o) => getOrderSiteCode(o);
  const projectScoped = (o) => !project || siteCodeMatch(getSiteCodeForOrder(o), project);

  const getTabCount = (tabName) => {
    if (tabName === "Trash") return trashedOrders.filter(projectScoped).length;
    const scoped = orders.filter(projectScoped);
    if (tabName === "All") return scoped.filter(o => !o._history && !["Reverted", "Recalled"].includes(o.status)).length;
    if (tabName === "Issued") return scoped.filter(o => ["Issued", "Amended"].includes(o.status)).length;
    if (tabName === "Pending Approval") return scoped.filter(o => o.status === "Pending Approval").length;
    if (tabName === "Pending Issue") return scoped.filter(o => ["Pending Issue", "To Issue"].includes(o.status)).length;
    if (tabName === "Amend Request") return scoped.filter(o => ["Amendment Request", "Amend Request"].includes(o.status)).length;
    return scoped.filter(o => o.status === tabName).length;
  };


  // Build unique option lists for filter dropdowns
  const getCompanyCode = (o) => o.snapshot?.company?.companyCode || o.companies?.company_code || "";
  const getSiteCode = (o) => getOrderSiteCode(o);
  const getVendorName = (o) => o.snapshot?.vendor?.vendorName || o.vendors?.vendor_name || "";
  const optionOrders = activeTab === "Trash" ? trashedOrders : orders;
  const scopedOptionOrders = optionOrders.filter(projectScoped);
  const siteOptions = Array.from(
    new Map(scopedOptionOrders.map(getSiteCode).filter(Boolean).map(c => [c.replace(/[-_]/g, "").toUpperCase(), c])).values()
  ).sort();
  const companyOptions = Array.from(new Set(scopedOptionOrders.map(getCompanyCode).filter(Boolean))).sort();
  const vendorOptions = Array.from(new Set(scopedOptionOrders.map(getVendorName).filter(Boolean))).sort();
  const madeByOptions = Array.from(new Set(scopedOptionOrders.map(o => o.made_by).filter(Boolean))).sort();

  // Date range helpers
  const getFYBounds = (yearOffset = 0) => {
    const now = new Date();
    const currMonth = now.getMonth(); // 0-indexed
    const fyStartYear = (currMonth >= 3 ? now.getFullYear() : now.getFullYear() - 1) + yearOffset;
    const from = new Date(fyStartYear, 3, 1);              // 1 Apr
    const to = new Date(fyStartYear + 1, 2, 31, 23, 59, 59); // 31 Mar
    return { from, to };
  };

  const searchMatch = (o, ms) => {
    const snap = o.snapshot || {};
    const blob = [o.order_number, o.subject, o.vendors?.vendor_name, snap.vendor?.vendorName,
    o.companies?.company_code, o.companies?.company_name, snap.company?.companyCode,
    snap.company?.companyName, snap.site?.siteCode, snap.site?.siteName,
    o.made_by, o.order_type
    ].filter(Boolean).join(" ").toLowerCase();
    return !ms || blob.includes(ms);
  };

  const filtered = activeTab === "Trash"
    ? trashedOrders.filter(o => {
      const created = new Date(o.snapshot?._deleted?.deleted_at || o.updated_at || o.date_of_creation || o.created_at);
      let matchDate = true;
      if (dateRange !== "all") {
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
      return projectScoped(o)
        && searchMatch(o, search.toLowerCase())
        && (!filterSite.length || filterSite.some(s => siteCodeMatch(s, getSiteCode(o))))
        && (!filterCompany.length || filterCompany.includes(getCompanyCode(o)))
        && (!filterType.length || filterType.includes(o.order_type))
        && (!filterMadeBy.length || filterMadeBy.includes(o.made_by))
        && (!filterVendor.length || filterVendor.includes(getVendorName(o)))
        && matchDate;
    })
    : orders.filter(o => {
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
          : activeTab === "Pending Approval"
            ? o.status === "Pending Approval"
            : activeTab === "Pending Issue"
              ? ["Pending Issue", "To Issue"].includes(o.status)
              : activeTab === "Amend Request"
                ? ["Amendment Request", "Amend Request"].includes(o.status)
                : o.status === activeTab;
      const matchSite = !filterSite.length || filterSite.some(s => siteCodeMatch(s, getSiteCode(o)));
      const matchCompany = !filterCompany.length || filterCompany.includes(getCompanyCode(o));
      const matchType = !filterType.length || filterType.includes(o.order_type);
      const matchMadeBy = !filterMadeBy.length || filterMadeBy.includes(o.made_by);
      const matchVendor = !filterVendor.length || filterVendor.includes(getVendorName(o));
      const matchStatus = activeTab !== "All" || !filterStatus.length || filterStatus.includes(o.status);

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

      const matchProject = !project || siteCodeMatch(getSiteCode(o), project);
      return matchProject && matchSearch && matchTab && matchSite && matchCompany && matchType && matchMadeBy && matchVendor && matchStatus && matchDate;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Land back on page 1 whenever the result set changes shape, so the user
  // never lands on a page number that no longer has any rows.
  useEffect(() => {
    setPage(1);
  }, [activeTab, search, filterSite, filterCompany, filterVendor, filterType, filterMadeBy, filterStatus, dateRange, customFrom, customTo, pageSize, project]);

  const clearFilters = () => {
    setFilterSite([]); setFilterCompany([]); setFilterType([]); setFilterMadeBy([]); setFilterVendor([]); setFilterStatus([]);
    setDateRange("all"); setCustomFrom(""); setCustomTo("");
  };
  const hasActiveFilters = filterSite.length || filterCompany.length || filterType.length || filterMadeBy.length || filterVendor.length || filterStatus.length || dateRange !== "all";

  // Earliest order date — enable minDate on DateRangeFilter when production data is loaded.
  const orderDateBounds = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let earliest = null;
    for (const o of [...orders, ...trashedOrders]) {
      const raw = o.date_of_creation || o.created_at;
      if (!raw) continue;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) continue;
      d.setHours(0, 0, 0, 0);
      if (!earliest || d.getTime() < earliest.getTime()) earliest = d;
    }
    return { minDate: earliest, maxDate: today };
  }, [orders, trashedOrders]);
  const orderFilterMinDate = null; // later: orderDateBounds.minDate

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
    const totalOrderValue = filtered.reduce((acc, o) => acc + getOrderGrandTotal(o), 0);
    return {
      total: filtered.length,
      poCount: po.length, poValue: sumTaxable(po),
      woCount: wo.length, woValue: sumTaxable(wo),
      totalOrderValue,
    };
  }, [filtered]);
  const tableLoading = activeTab === "Trash" ? trashLoading : loading;

  return (
    <>
      <style>{SCROLLBAR_STYLE}</style>
      <div className="w-full pb-10">
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
                  src={pdfBlobUrl || "about:blank"}
                  className="w-full h-full border-0 bg-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="sticky top-0 z-30 flex items-center justify-between bg-white px-5 py-4 border-b border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-[#6366f1] rounded flex items-center justify-center shadow-md shadow-indigo-100">
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
              className="h-10 px-5 rounded border border-slate-200 bg-white text-slate-700 font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all text-sm">
              <Download size={14} className="text-slate-400" /> Export
            </button>
            <button onClick={() => { setShowBulk(true); setBulkRows([]); setBulkFileName(""); setBulkResult(null); }}
              className="h-10 px-5 rounded border border-slate-200 bg-slate-50 text-slate-700 font-semibold flex items-center gap-2 hover:bg-slate-100 transition-all text-sm">
              <Upload size={14} className="text-slate-400" /> Bulk Upload
            </button>
            <button onClick={onCreateClick}
              className="h-10 px-6 rounded bg-indigo-600 text-white font-semibold flex items-center gap-2 hover:bg-indigo-700 transition-all text-sm shadow-md shadow-indigo-600/20">
              <Plus size={16} /> Create Order
            </button>
          </div>
        </div>

        {/* Export Modal */}
        {showExport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-800">Export Orders</h2>
                <button onClick={() => setShowExport(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="px-6 py-5 space-y-5">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">What to export</p>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="radio" name="exportScope" value="current" checked={exportScope === "current"} onChange={() => setExportScope("current")} className="accent-indigo-600" />
                      <span className="text-sm text-slate-700">Current view <span className="text-slate-400">({filtered.length} orders, filters applied)</span></span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="radio" name="exportScope" value="all" checked={exportScope === "all"} onChange={() => setExportScope("all")} className="accent-indigo-600" />
                      <span className="text-sm text-slate-700">All orders <span className="text-slate-400">({orders.length} total)</span></span>
                    </label>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Date range <span className="font-normal normal-case text-slate-400">(optional)</span></p>
                  <div className="flex items-center gap-2">
                    <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    <span className="text-slate-400 text-sm">to</span>
                    <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setShowExport(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200">Cancel</button>
                <button onClick={doExport} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-2">
                  <Download size={14} /> Export Excel
                </button>
              </div>
            </div>
          </div>
        )}

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
                  <p className="font-bold mb-2">How to fill the template:</p>
                  <div className="space-y-2">
                    <div>
                      <p className="font-semibold mb-0.5">Fill once per order (any row):</p>
                      <p className="text-amber-700">{bulkKind} No., Site Code, Company Code, Vendor Code / PAN, Status, Subject</p>
                    </div>
                    <div>
                      <p className="font-semibold mb-0.5">Fill in every item row:</p>
                      <p className="text-amber-700">Item Name, Qty, Unit, Rate — one row per item</p>
                    </div>
                    <div>
                      <p className="font-semibold mb-0.5">Rules:</p>
                      <ul className="list-disc pl-4 space-y-0.5 text-amber-700">
                        <li>Same {bulkKind} No. = same order. Leave it blank in item rows — auto-groups under last order</li>
                        <li>Site Code &amp; Company Code must exist in master data</li>
                        <li>Status default = <b>Issued</b>. Other options: Draft, Review, Pending Issue</li>
                        <li>{bulkKind} No. left blank on Issued orders = auto-assigned number</li>
                      </ul>
                    </div>
                  </div>
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

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-[0.7fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-4 border-b border-slate-200 bg-slate-100">
          {[
            { label: "Total Orders", val: stats.total, icon: ShoppingBag, color: "text-[#4f46e5] bg-[#eef2ff]" },
            { label: "Total PO", val: stats.poCount, sub: `₹ ${stats.poValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: FileText, color: "text-[#2563eb] bg-[#eff6ff]" },
            { label: "Total WO", val: stats.woCount, sub: `₹ ${stats.woValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Box, color: "text-[#0891b2] bg-[#ecfeff]" },
            { label: "Taxable Value", val: `₹ ${(stats.poValue + stats.woValue).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: IndianRupee, color: "text-[#9333ea] bg-[#faf5ff]" },
            { label: "Total Order Value", val: `₹ ${stats.totalOrderValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: ShoppingCart, color: "text-emerald-600 bg-emerald-50" },
          ].map((s, i) => (
            <div key={i} className="bg-white p-3.5 rounded shadow-sm flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded ${s.color} flex items-center justify-center shrink-0`}>
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

        <div className="bg-white shadow-sm border-t border-slate-200">

          <div className="flex px-5 pt-4 pb-0 border-b border-slate-100 bg-white gap-8 overflow-visible relative">
            {PRIMARY_TABS.map(t => {
              const count = getTabCount(t);
              return (
                <button key={t} onClick={() => { setActiveTab(t); setShowMoreTabs(false); }}
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

            {/* More Dropdown */}
            <div className="relative pb-3.5 flex items-center">
              <div className="flex items-center">
                <button
                  onClick={() => setShowMoreTabs(!showMoreTabs)}
                  className={`text-[13px] font-bold transition-all whitespace-nowrap flex items-center gap-2.5 px-3 py-1.5 rounded
                  ${MORE_TABS.includes(activeTab) ? "text-[#4f46e5] bg-indigo-50/50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}>
                  {MORE_TABS.includes(activeTab) ? activeTab : "More"}
                  <ChevronDown size={14} className={`transition-transform ${showMoreTabs ? "rotate-180" : ""}`} />
                  {(() => {
                    const currentTabCount = MORE_TABS.includes(activeTab) ? getTabCount(activeTab) : MORE_TABS.reduce((acc, t) => acc + getTabCount(t), 0);
                    return currentTabCount > 0 ? (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${MORE_TABS.includes(activeTab) ? "bg-[#4f46e5] text-white" : "bg-slate-100 text-slate-500"}`}>
                        {currentTabCount}
                      </span>
                    ) : null;
                  })()}
                </button>

                {MORE_TABS.includes(activeTab) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveTab("All"); }}
                    className="ml-1 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                    title="Clear selection">
                    <X size={14} />
                  </button>
                )}
              </div>

              {showMoreTabs && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setShowMoreTabs(false)}></div>
                  <div className="absolute top-[100%] right-0 mt-1 w-52 bg-white border border-slate-200 shadow-lg rounded py-2 z-[70] animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                    <div className="px-4 py-1.5 mb-1 border-b border-slate-50">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Status</span>
                    </div>
                    {MORE_TABS.filter(t => t !== "Trash" || canTrashView).map(t => {
                      const count = getTabCount(t);
                      return (
                        <button
                          key={t}
                          onClick={() => {
                            setActiveTab(t);
                            setShowMoreTabs(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left text-[13px] flex items-center justify-between transition-all
                          ${activeTab === t ? "bg-indigo-50 text-indigo-700 font-bold" : "text-slate-600 hover:bg-slate-50 hover:pl-5"}`}>
                          <div className="flex items-center gap-3">
                            {t === "Reverted" && <RotateCcw size={14} className={activeTab === t ? "text-indigo-500" : "text-slate-400"} />}
                            {t === "Rejected" && <Ban size={14} className={activeTab === t ? "text-red-500" : "text-slate-400"} />}
                            {t === "Recalled" && <RefreshCw size={14} className={activeTab === t ? "text-amber-500" : "text-slate-400"} />}
                            {t === "Cancelled" && <CancelledStampIcon size={16} className={activeTab === t ? "text-slate-600" : "text-slate-400"} />}
                            {t === "Trash" && <Trash2 size={14} className={activeTab === t ? "text-red-500" : "text-slate-400"} />}
                            {t}
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTab === t ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="px-5 py-3 border-b border-slate-100 bg-[#f8fafc]/50 flex flex-col gap-3">
            <div className="flex items-center flex-wrap gap-2">
              {/* Search */}
              <div className={`${ORDER_LIST_FILTER_SHELL} flex-1 min-w-[180px] max-w-[260px] pl-8 pr-3`}>
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search PO, subject, vendor..."
                  className={`${ORDER_LIST_FILTER_CONTROL} placeholder:text-slate-400`}
                />
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                {[
                  { selected: filterCompany, set: setFilterCompany, label: "Entity", opts: companyOptions, min: 110, icon: Building2 },
                  !project && { selected: filterSite, set: setFilterSite, label: "Sites", opts: siteOptions, min: 100, icon: MapPin },
                  { selected: filterVendor, set: setFilterVendor, label: "Vendor", opts: vendorOptions, min: 115, icon: Truck },
                  { selected: filterType, set: setFilterType, label: "Type", opts: ["Supply", "SITC", "ITC"], min: 100, icon: Tag },
                  activeTab === "All" && { selected: filterStatus, set: setFilterStatus, label: "Status", opts: ["Draft", "Review", "Pending Issue", "Amend Request", "Amended", "Issued", "Rejected", "Cancelled"], min: 115, icon: CheckCircle2 },
                  { selected: filterMadeBy, set: setFilterMadeBy, label: "Users", opts: madeByOptions, min: 105, icon: User }
                ].filter(Boolean).map((f, i) => (
                  <OrderMultiFilter key={i} label={f.label} options={f.opts} selected={f.selected} onChange={f.set} icon={f.icon} minWidth={f.min} />
                ))}

                <DateRangeFilter
                  dateRange={dateRange} setDateRange={setDateRange}
                  customFrom={customFrom} setCustomFrom={setCustomFrom}
                  customTo={customTo} setCustomTo={setCustomTo}
                  minDate={orderFilterMinDate}
                  maxDate={orderDateBounds.maxDate}
                />
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="inline-flex h-9 items-center px-3 text-xs font-semibold text-slate-600 border border-slate-300 bg-slate-50 hover:bg-slate-100 rounded-md transition-all"
                >
                  Clear
                </button>
              )}

            </div>
          </div>

          <div ref={tableScrollRef} className="overflow-x-auto w-full rounded-none thin-scrollbar-light border-r border-slate-200">
            <table className="w-full text-sm text-left border-separate border-spacing-0 whitespace-nowrap border-t border-l border-slate-200">
              <thead>
                <tr className="bg-slate-100">
                  <th className="sticky left-0 z-20 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-r border-slate-200 bg-slate-100 whitespace-nowrap" style={{ width: '240px', minWidth: '240px' }}>Order No</th>
                  <th className="sticky z-20 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-r border-slate-200 bg-slate-100 whitespace-nowrap text-center" style={{ left: '240px', width: '130px', minWidth: '130px' }}>Status</th>
                  <th className="px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Order Type</th>
                  <th className="px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Site</th>
                  <th className="px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Entity</th>
                  <th className="px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Created By</th>
                  <th className="px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Created On</th>
                  <th className="px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Subject</th>
                  <th className="px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Vendor</th>
                  <th className="px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-r border-slate-200 whitespace-nowrap">Issued At</th>
                  <th className="px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-r border-slate-200 text-right whitespace-nowrap">Taxable Amount</th>
                  <th className="px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-r border-slate-200 text-right whitespace-nowrap">Total Value</th>
                  <th className="sticky right-0 z-30 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500 border-b border-l border-slate-200 bg-slate-100 whitespace-nowrap [box-shadow:-1px_0_0_0_#e2e8f0]" style={{ width: '180px', minWidth: '180px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableLoading && filtered.length > 0 && (
                  <tr>
                    <td colSpan="13" className="py-4 text-center">
                      <div className="smooth-loader w-5 h-5 text-indigo-500 mx-auto"></div>
                    </td>
                  </tr>
                )}
                {tableLoading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan="13" className="py-32 text-center bg-white">
                      <div className="smooth-loader w-8 h-8 text-indigo-600 mx-auto"></div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan="13" className="py-24 text-center bg-white">
                      <div className="flex flex-col items-center justify-center">
                        <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
                          <FileText size={24} className="text-slate-300" />
                        </div>
                        <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-[10px]">
                          No records found
                        </p>
                      </div>
                    </td>
                  </tr>
                ) :
                  paginated.map(o => {
                    const snap = o.snapshot || {};
                    const cCode = snap.company?.companyCode || o.companies?.company_code || "-";
                    const sCode = getOrderSiteCode(o) || "-";
                    const vName = snap.vendor?.vendorName || o.vendors?.vendor_name || "-";

                    const typeCode = o.order_type === "Supply" ? "PO" : "WO";
                    const prefix = `${cCode}/${sCode}/${typeCode}/`;
                    const displayNo = o.order_number?.startsWith("PENDING-")
                      ? `${typeCode}-DRAFT`
                      : o.order_number;

                    return (
                      <tr key={o.id} className="hover:bg-slate-50 transition-colors group bg-white">
                        <td className="sticky left-0 z-10 px-5 py-2 border-b border-r border-slate-200 bg-white group-hover:bg-slate-50 transition-colors whitespace-nowrap" style={{ width: '240px', minWidth: '240px' }}>
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
                        <td className="sticky z-10 px-5 py-2 border-b border-r border-slate-200 text-center whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors" style={{ left: '240px', width: '130px', minWidth: '130px' }}>
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold
                           ${o.status === "Draft" ? "bg-slate-100 text-slate-600" :
                              o.status === "Approved" || o.status === "Issued" ? "bg-emerald-50 text-emerald-600" :
                                o.status === "Amendment Request" ? "bg-amber-100 text-amber-700" :
                                  o.status === "Amended" ? "bg-slate-100 text-slate-600" :
                                    o.status === "Rejected" ? "bg-red-50 text-red-600" :
                                      o.status === "Review" ? "bg-sky-50 text-sky-600" :
                                        o.status === "Reverted" ? "bg-orange-50 text-orange-600" :
                                          o.status === "Pending Approval" ? "bg-violet-50 text-violet-600" :
                                          (o.status === "Pending Issue" || o.status === "To Issue") ? "bg-amber-50 text-amber-600" :
                                            o.status === "Recalled" ? "bg-purple-50 text-purple-600" :
                                              o.status === "Cancelled" ? "bg-slate-100 text-slate-500 line-through" :
                                                o.status === "Deleted" ? "bg-red-50 text-red-600" :
                                                  "bg-slate-100 text-slate-600"}`}>
                            {(o.status === "Pending Issue" || o.status === "To Issue") ? "Pending Issue" :
                              (o.status === "Amendment Request" || o.status === "Amend Request") ? "Amend Request" :
                                (o.status || "Draft")}
                          </span>
                        </td>
                        <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-nowrap">
                          {o.order_type === "Supply" ? "Purchase Order" : o.order_type === "SITC" || o.order_type === "ITC" ? "Work Order" : (o.order_type || "-")}
                        </td>
                        <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-nowrap">
                          {sCode}
                        </td>
                        <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-nowrap">
                          {cCode}
                        </td>
                        <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-nowrap">
                          {o.made_by || "System"}
                        </td>
                        <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-nowrap">
                          {new Date(o.date_of_creation || o.created_at).toLocaleDateString("en-GB").replace(/\//g, '.')}
                        </td>
                        <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-normal min-w-[280px] leading-relaxed bg-white group-hover:bg-slate-50 transition-colors">
                          {o.subject || "-"}
                        </td>
                        <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors">
                          {vName}
                        </td>
                        <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-500 text-[13.5px] whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors">
                          {(["Issued", "Amended"].includes(o.status) && (o.totals?.issuedAt || o.updated_at))
                            ? new Date(o.totals?.issuedAt || o.updated_at).toLocaleDateString("en-GB").replace(/\//g, '.')
                            : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-700 text-[13.5px] font-medium text-right whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors">
                          {(() => {
                            const t = o.totals || {};
                            let sub = Number(t.subtotal) || 0;
                            const disc = Number(t.totalDiscountAmt) || 0;
                            // Fallback: calculate from items or snapshot if totals missing
                            if (sub === 0) {
                              const its = o.order_items || o.snapshot?.items || [];
                              if (its.length > 0) {
                                sub = its.reduce((s, it) => s + (Number(it.qty) * Number(it.unit_rate) || Number(it.amount) || 0), 0);
                              }
                            }
                            const taxable = sub - disc;
                            return taxable > 0
                              ? `₹ ${taxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : <span className="text-slate-300 font-normal">-</span>;
                          })()}
                        </td>
                        <td className="px-5 py-1 border-b border-r border-slate-200 text-slate-700 text-[13.5px] font-medium text-right whitespace-nowrap bg-white group-hover:bg-slate-50 transition-colors">
                          {(() => {
                            const totalVal = getOrderGrandTotal(o);
                            return totalVal > 0
                              ? `₹ ${totalVal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : <span className="text-slate-300 font-normal">-</span>;
                          })()}
                        </td>
                        <td className="sticky right-0 z-40 px-5 py-1 border-b border-l border-slate-200 bg-white group-hover:bg-slate-50 transition-colors whitespace-nowrap [box-shadow:-1px_0_0_0_#e2e8f0]" style={{ width: '190px', minWidth: '190px', maxWidth: '190px' }}>
                          <div className="flex items-center justify-center gap-1.5">
                            {activeTab === "Trash" ? (
                              <>
                                {canTrashLog && (
                                  <button
                                    onClick={() => setLogPanel({ orderId: o.id, orderNumber: o.order_number || "Draft" })}
                                    className="h-8 w-8 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:text-violet-600 hover:border-violet-200 hover:bg-violet-50 transition-all shadow-sm"
                                    title="Activity Log">
                                    <Activity size={14} />
                                  </button>
                                )}
                                {canTrashRestore && (
                                  <button
                                    onClick={() => handleRestore(o.id)}
                                    className="h-8 w-8 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50 transition-all shadow-sm"
                                    title="Restore">
                                    <Undo2 size={14} />
                                  </button>
                                )}
                                {canTrashDelete && (
                                  <>
                                    <button
                                      onClick={() => handlePermanentDelete(o.id)}
                                      className="h-8 w-8 rounded-md border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all shadow-sm"
                                      title="Permanent Delete">
                                      <Trash2 size={13} />
                                    </button>
                                  </>
                                )}
                              </>
                            ) : (
                              <>
                                {canWithdrawApproval(o) && (
                                  <button
                                    onClick={() => handleWithdrawApproval(o.id)}
                                    className="h-8 w-8 rounded-md border border-amber-200 flex items-center justify-center text-amber-600 hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50 transition-all shadow-sm"
                                    title="Withdraw Request">
                                    <Undo2 size={14} />
                                  </button>
                                )}
                                {canEditOrder(o) && (
                                  <button
                                    onMouseEnter={() => preloadOrderDetails(o.id).catch(() => {})}
                                    onClick={() => { preloadOrderDetails(o.id).catch(() => {}); onEditClick(o.id); }}
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
                                <button
                                  onClick={() => setLogPanel({ orderId: o.id, orderNumber: o.order_number || "Draft" })}
                                  className="h-8 w-8 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:text-violet-600 hover:border-violet-200 hover:bg-violet-50 transition-all shadow-sm"
                                  title="Activity Log">
                                  <Activity size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-white">
              <div className="flex items-center gap-2 text-[12.5px] text-slate-500">
                <span>Rows per page</span>
                <div className="relative">
                  <select
                    value={pageSize}
                    onChange={e => setPageSize(Number(e.target.value))}
                    className="h-8 appearance-none rounded-md border border-slate-300 bg-white pl-2 pr-7 text-[12.5px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                  >
                    {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
                <span className="ml-2">
                  {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="h-8 px-3 rounded-md border border-slate-300 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="px-2 text-[12.5px] font-semibold text-slate-600">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="h-8 px-3 rounded-md border border-slate-300 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {logPanel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setLogPanel(null)} />
          <div className="relative w-[440px] h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col" style={{ animation: "slideInRight 0.2s ease-out" }}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                  <Activity size={15} className="text-violet-600" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Activity Log</p>
                  <p className="text-sm font-bold text-slate-800">{logPanel.orderNumber}</p>
                </div>
              </div>
              <button onClick={() => setLogPanel(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {logLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="smooth-loader w-7 h-7 text-violet-500" />
                </div>
              ) : logEvents.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-12">No activity recorded yet.</p>
              ) : (
                <div className="relative pl-10">
                  <div className="absolute left-[27px] top-3 bottom-3 w-[2px] bg-slate-200" />
                  {logEvents.map((ev, idx) => {
                    const s = getLogStyle(ev.action);
                    const isLast = idx === logEvents.length - 1;
                    return (
                      <div key={idx} className={`relative flex gap-4 ${isLast ? "" : "pb-4"}`}>
                        <div className={`absolute -left-[27px] top-1 w-8 h-8 rounded-full ${s.dot} flex items-center justify-center text-white shrink-0 z-10 border-2 border-white shadow-sm`}>{s.icon}</div>
                        <div className="flex-1 min-w-0 bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all p-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-bold text-slate-800">{ev.action_by || "System"}</span>
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${s.badge}`}>{ev.action}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar size={10} className="text-slate-400 shrink-0" />
                              <span className="text-[10px] text-slate-400 font-semibold whitespace-nowrap">{fmtLogTs(ev.action_at)}</span>
                            </div>
                          </div>
                          {ev._sub && <p className="text-[10px] text-slate-500 mt-1">{ev._sub}</p>}
                          {ev._step && <p className="text-[9px] font-black text-slate-400 uppercase mt-0.5">Level {ev._step}</p>}
                          {ev.comments && <p className="text-[10px] text-slate-500 italic mt-1">"{ev.comments}"</p>}
                          {ev._attach && <a href={ev._attach} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline mt-1"><FileText size={10} /> Attachment</a>}
                          {ev.changes?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {ev.changes.map((c, ci) => (
                                <span key={ci} className="text-[9px] bg-cyan-50 border border-cyan-100 px-2 py-0.5">
                                  <span className="font-black text-cyan-600">{c.field}: </span>
                                  <span className="text-slate-400 line-through">{c.from}</span>
                                  <span className="text-slate-700 font-semibold"> → {c.to}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <p className="text-sm font-semibold text-slate-700 leading-relaxed">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
