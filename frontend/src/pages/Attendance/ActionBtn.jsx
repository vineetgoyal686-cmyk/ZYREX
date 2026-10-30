import React from "react";

/* Small coloured button for the Action column: View / Edit / Log / Delete */
const TONE = {
  slate:  "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:border-slate-300",
  blue:   "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300",
  violet: "border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 hover:border-violet-300",
  red:    "border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300",
};

export default function ActionBtn({ icon: Icon, tone = "slate", title, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title}
      className={`h-7 w-7 inline-flex items-center justify-center rounded-md border shadow-sm transition-colors
        disabled:opacity-35 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:bg-inherit ${TONE[tone]}`}>
      <Icon size={13} strokeWidth={2.25} />
    </button>
  );
}

/* "⋯" for the rest of a row's actions. The list is position: fixed so the
   table's scroll box doesn't cut it off; opens upward near the bottom. */
export function RowMenu({ items }) {
  const [at, setAt] = React.useState(null); // { top|bottom, right }
  const btn = React.useRef(null);
  const list = React.useRef(null);
  React.useEffect(() => {
    if (!at) return;
    // any click outside this row's button and list closes it (also another row's ⋯)
    const close = (e) => { if (!btn.current?.contains(e.target) && !list.current?.contains(e.target)) setAt(null); };
    const shut = () => setAt(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", shut, true); window.removeEventListener("resize", shut); };
  }, [at]);
  const toggle = () => {
    if (at) return setAt(null);
    const r = btn.current.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 40 * items.length + 20;
    setAt({ right: window.innerWidth - r.right, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  };
  return (
    <span className="inline-flex">
      <button ref={btn} type="button" onClick={toggle} title="More" aria-label="More actions"
        className={`h-7 w-7 inline-flex items-center justify-center rounded-md border shadow-sm transition-colors text-slate-600
          ${at ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-100 hover:border-slate-300"}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>
      {at && (
        <div ref={list} style={{ position: "fixed", ...at }} className="z-[60] w-40 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-left">
          {items.map(it => (
            <button key={it.label} type="button" disabled={it.disabled} title={it.title}
              onClick={() => { setAt(null); it.onClick(); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white
                ${it.danger ? "text-red-600 hover:bg-red-50" : "text-slate-700"}`}>
              <it.icon size={14} className={it.danger ? "text-red-500" : "text-slate-400"} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
