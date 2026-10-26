import { useEffect, useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";

/*
 * "Projects ▾" next to a tab's permissions: which projects that tab covers.
 * value: null (not set — the old Project Access rule applies),
 *        { all: true } (every project, also ones added later) or
 *        { projects: [ids] }.
 * The list is the live active-project list, so new projects show up and
 * deactivated ones drop out by themselves. offices (Petty Cash): a second
 * list, kept in the same `projects` array of ids.
 */
export default function ProjectScopePicker({ value, projects, offices = null, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!boxRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false);
    };
    // the page scrolled (the list would float away) — but not the list's own scroll
    const shut = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", shut, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", shut, true); };
  }, [open]);

  const everything = [...projects, ...(offices || [])];
  const live = new Set(everything.map(p => p.id));
  const picked = (value?.projects || []).filter(id => live.has(id));
  const all = !!value?.all;
  const noun = offices ? "projects & offices" : "projects";
  const label = all ? `All ${noun}`
    : value == null ? `Choose ${noun}`
    : picked.length === 0 ? "None"
    : picked.length <= 2 ? everything.filter(p => picked.includes(p.id)).map(p => p.projectCode || p.projectName).join(", ")
    : `${picked.length} selected`;

  const toggle = (id) => {
    const next = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id];
    onChange({ projects: next });
  };

  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled}
        onClick={() => {
          const r = btnRef.current.getBoundingClientRect();
          setPos({ left: r.left, top: r.bottom + 4 });
          setOpen(v => !v);
        }}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-default
          ${value == null ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
        <MapPin size={10} /> {label} {!disabled && <ChevronDown size={11} />}
      </button>

      {open && pos && (
        <div ref={boxRef} style={{ position: "fixed", left: pos.left, top: pos.top }}
          className="z-[200] w-64 rounded-lg border border-slate-200 bg-white shadow-xl">
          <label className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 cursor-pointer hover:bg-slate-50">
            <input type="checkbox" checked={all} onChange={e => onChange(e.target.checked ? { all: true } : { projects: [] })}
              className="w-3.5 h-3.5 accent-blue-600" />
            <span className="text-[12px] font-bold text-slate-800">All {noun}</span>
            <span className="ml-auto text-[10px] text-slate-400">incl. new ones</span>
          </label>
          <div className="max-h-72 overflow-y-auto py-1">
            {[["Projects", projects], ...(offices ? [["Offices", offices]] : [])].map(([title, list]) => (
              <div key={title}>
                {offices && <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>}
                {list.map(p => (
                  <label key={p.id} className={`flex items-center gap-2 px-3 py-1.5 ${all ? "opacity-50" : "cursor-pointer hover:bg-slate-50"}`}>
                    <input type="checkbox" disabled={all} checked={all || picked.includes(p.id)} onChange={() => toggle(p.id)}
                      className="w-3.5 h-3.5 accent-blue-600" />
                    <span className="text-[12px] font-semibold text-slate-700 w-12 shrink-0 truncate">{p.projectCode}</span>
                    <span className="text-[12px] text-slate-500 truncate">{p.projectName}</span>
                  </label>
                ))}
                {list.length === 0 && <p className="px-3 py-1.5 text-[12px] text-slate-400">None active</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
