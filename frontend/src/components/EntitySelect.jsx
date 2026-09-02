// Same searchable dropdown used for Company / Vendor on the Orders page
// (Create/CreateOrder.jsx's local `Select`), trimmed to single-select only
// (no multi-select, inline row edit/log actions, or contact-list styling)
// so it can be shared without duplicating that whole file's logic.
import { useState, useEffect, useRef } from "react";
import { ChevronDown, Eye, Plus } from "lucide-react";

const FIELD_LABEL_CLASS = "block text-[15px] font-semibold text-slate-950 mb-2 tracking-normal";
const FIELD_BASE_CLASS  = "w-full border border-slate-300 rounded px-4 text-[15px] font-normal outline-none transition-colors bg-white text-slate-950 placeholder:text-slate-400 focus:border-slate-400 focus:ring-0";
const FIELD_READONLY_CLASS = "bg-[#f7f7f7] text-slate-500 cursor-not-allowed";

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
  const parts = raw.split(",").map(p => p.trim()).filter(Boolean).filter(p => !/^\d{5,6}$/.test(p));
  if (parts.length === 0) return "";
  const state = parts[parts.length - 1] || "";
  const city = parts[parts.length - 2] || "";
  return [city, state].filter(Boolean).join(", ") || state || city || "";
};

export default function EntitySelect({ label, value, onChange, options = [], valueKey = "id", labelKey = "name", subLabelKey, placeholder, required, onAdd, addLabel, onView, disabled }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutside = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const selectedOption = options.find(o => o[valueKey] === value);
  const filteredOptions = options.filter(o => {
    const labelTxt = String(getField(o, labelKey) || "").toLowerCase();
    const subTxt = subLabelKey ? String(getField(o, subLabelKey) || "").toLowerCase() : "";
    return `${labelTxt} ${subTxt}`.trim().includes(search.toLowerCase());
  });
  const totalKind = (() => {
    const low = String(label || "").toLowerCase();
    if (low.includes("vendor")) return "Vendors";
    if (low.includes("company") || low.includes("entity")) return "Companies";
    return "Results";
  })();

  const pick = (id) => { onChange({ target: { value: id } }); setOpen(false); setSearch(""); };

  return (
    <div className="relative" ref={containerRef}>
      <label className={FIELD_LABEL_CLASS}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div
        onClick={() => !disabled && setOpen(!open)}
        className={`${FIELD_BASE_CLASS} h-14 flex justify-between items-center
          ${disabled ? FIELD_READONLY_CLASS : "cursor-pointer hover:border-slate-400"}
          ${open ? "border-slate-400" : ""}`}
      >
        <span className="truncate flex-1 min-w-0">
          {selectedOption ? <span className="text-slate-950">{getField(selectedOption, labelKey)}</span>
            : <span className="text-slate-400">{placeholder || "Select..."}</span>}
        </span>
        {!disabled && <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : "ml-2"}`} />}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded shadow-lg flex flex-col overflow-hidden min-w-[240px]">
          <div className="p-2 border-b border-slate-100 bg-white">
            <input type="text" autoFocus value={search} onChange={e => setSearch(e.target.value)}
              className="w-full py-2 px-3 text-sm bg-white border border-slate-200 rounded outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50/50 shadow-sm"
              placeholder="Search here..." />
          </div>
          <div className="overflow-y-auto max-h-56 w-full">
            {!required && (
              <div onClick={() => { onChange({ target: { value: "" } }); setOpen(false); setSearch(""); }}
                className={`px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 transition-colors ${!value ? "text-slate-400 font-bold" : "text-slate-400"}`}>
                {placeholder || "Clear Selection"}
              </div>
            )}
            {options.length > 0 && (
              <div className="px-4 py-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border-b border-slate-100">
                Total {totalKind}: {options.length}
              </div>
            )}
            {filteredOptions.map(o => {
              const isSelected = value === o[valueKey];
              const primary = getField(o, labelKey);
              const secondary = subLabelKey ? getField(o, subLabelKey) : "";
              const isCompanyStyle = subLabelKey === "companyCode";
              const isAddressStyle = subLabelKey === "address";
              const secondaryLine = isAddressStyle ? extractCityState(secondary) : secondary;
              const gstin = getField(o, "gstin") || getField(o, "billingGstin") || getField(o, "billing_gstin");
              return (
                <div key={o[valueKey]}
                  className={`flex items-center justify-between px-4 py-2 cursor-pointer transition-colors border-b border-slate-100 last:border-0
                    ${isSelected ? "bg-indigo-50" : "bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex-1 min-w-0" onClick={() => pick(o[valueKey])}>
                    {isCompanyStyle ? (
                      <div className="min-w-0">
                        <p className={`text-[13px] truncate ${isSelected ? "text-indigo-700 font-semibold" : "text-slate-900 font-semibold"}`}>{primary}</p>
                        {secondary && <p className="text-[11px] text-slate-600 truncate mt-0.5"><span className="text-slate-500">Code:</span> <span className="font-semibold text-slate-700">{secondary}</span></p>}
                        {gstin && <p className="text-[11px] text-slate-600 truncate"><span className="text-slate-500">GSTIN:</span> {gstin}</p>}
                      </div>
                    ) : isAddressStyle ? (
                      <div className="min-w-0">
                        <p className={`text-[13px] truncate ${isSelected ? "text-indigo-700 font-semibold" : "text-slate-900 font-semibold"}`}>{primary}</p>
                        {secondaryLine && <p className="text-[11px] text-slate-500 truncate leading-tight">{secondaryLine}</p>}
                      </div>
                    ) : (
                      <p className={`text-sm truncate ${isSelected ? "text-indigo-700 font-bold" : "text-slate-700 font-semibold"}`}>{primary}</p>
                    )}
                  </div>
                  {onView && (
                    <button onClick={(e) => { e.stopPropagation(); setOpen(false); onView(o); }}
                      className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors shrink-0 ml-2"
                      title="View">
                      <Eye size={14} />
                    </button>
                  )}
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
}
