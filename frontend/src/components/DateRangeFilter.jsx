// Same calendar date-range filter used on the Orders page (Create/CreateOrder.jsx),
// pulled out here so Finance Track can reuse it without touching that file.
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ChevronDown, CalendarDays, X } from "lucide-react";

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

export default function DateRangeFilter({ dateRange, setDateRange, customFrom, setCustomFrom, customTo, setCustomTo, minDate, maxDate }) {
  const [open,         setOpen]         = useState(false);
  const [popPos,       setPopPos]       = useState({ top: 0, left: 0 });
  const [activePreset, setActivePreset] = useState("all");
  const [rangeFrom,    setRangeFrom]    = useState(null);
  const [rangeTo,      setRangeTo]      = useState(null);
  const [hoverDate,    setHoverDate]    = useState(null);
  const [selecting,    setSelecting]    = useState(false);
  const [calBase,      setCalBase]      = useState(() => { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return d; });
  const [isMobile,     setIsMobile]     = useState(() => window.innerWidth < 640);
  const btnRef  = useRef(null);
  const popRef  = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      setPopPos({ top: r.bottom + 6, left: r.left });
    }
    setOpen(o => !o);
  };

  useLayoutEffect(() => {
    if (!open || !popRef.current || !btnRef.current) return;
    const menuW = popRef.current.offsetWidth;
    const menuH = popRef.current.offsetHeight;
    const r = btnRef.current.getBoundingClientRect();
    const maxLeft = window.innerWidth - menuW - 8;
    const left = r.left > maxLeft ? Math.max(8, maxLeft) : r.left;
    const fitsBelow = r.bottom + 6 + menuH <= window.innerHeight - 8;
    const top = fitsBelow ? r.bottom + 6 : Math.max(8, r.top - 6 - menuH);
    setPopPos({ top, left });
  }, [open]);

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
    for (let i = offset - 1; i >= 0; i--) cells.push(makeCell(prevDim - i, null, true));
    for (let d = 1; d <= dim; d++) cells.push(makeCell(d, new Date(year, month, d), false));
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
    <div ref={popRef} className="flex max-h-[85vh] w-max max-w-[calc(100vw-1rem)] flex-col overflow-y-auto rounded-sm border border-slate-200 bg-white shadow-lg sm:max-h-none sm:flex-row sm:overflow-visible"
      style={{ position: "fixed", top: popPos.top, left: popPos.left, zIndex: 9999 }}
    >
      <div className="flex shrink-0 flex-wrap border-b border-slate-100 py-2 sm:w-[108px] sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r">
        {DR_PRESETS.map(p => (
          <button key={p.val} type="button" onClick={() => handlePreset(p.val)}
            className={`px-2.5 py-1 text-left text-[12px] font-medium transition-colors ${
              activePreset === p.val ? "bg-violet-200/80 text-[#300E4E] font-semibold" : "text-slate-600 hover:bg-slate-50"
            }`}
          >{p.label}</button>
        ))}
      </div>

      <div className="flex shrink-0 flex-col px-3 pt-2 pb-0">
        {isMobile ? (
          <div className="flex flex-col gap-3 w-[240px] py-1">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">From</label>
              <input type="date"
                value={drToStr(rangeFrom)}
                max={drToStr(new Date(maxMs))}
                min={minMs != null ? drToStr(new Date(minMs)) : undefined}
                onChange={e => {
                  if (!e.target.value) return;
                  const d = clampDay(new Date(`${e.target.value}T00:00:00`));
                  setActivePreset("custom");
                  setRangeFrom(d);
                  if (rangeTo && d > rangeTo) setRangeTo(d);
                }}
                className="w-full h-9 px-2.5 text-[13px] border border-slate-200 rounded-md outline-none focus:border-violet-400" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">To</label>
              <input type="date"
                value={drToStr(rangeTo)}
                max={drToStr(new Date(maxMs))}
                min={drToStr(rangeFrom) || (minMs != null ? drToStr(new Date(minMs)) : undefined)}
                onChange={e => {
                  if (!e.target.value) return;
                  setActivePreset("custom");
                  setRangeTo(clampDay(new Date(`${e.target.value}T00:00:00`)));
                }}
                className="w-full h-9 px-2.5 text-[13px] border border-slate-200 rounded-md outline-none focus:border-violet-400" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row">
            {renderMonthPane(leftM.y, leftM.m, "left")}
            <div className="hidden w-px shrink-0 self-stretch bg-slate-100 sm:block" />
            {renderMonthPane(rightM.y, rightM.m, "right")}
          </div>
        )}

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
        className={`inline-flex h-10 w-full items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors ${
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
