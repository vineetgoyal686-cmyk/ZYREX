import { Lightbulb, X } from "lucide-react";

/*
 * "How this works" guide behind a bulb button — a panel from the right.
 * guide = { title, intro, sections: [{ title, items: [{ name, what, eg, note }] }], example?: { title, lines }, tips: [] }
 * note = a warning line under an item (e.g. "not applied yet").
 */
export function HelpButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} title="How this works" aria-label="How this works"
      className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
      <Lightbulb size={15} />
    </button>
  );
}

export function HelpDrawer({ guide, onClose }) {
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" onClick={onClose}>
      <div className="zy-panel-in h-full w-full max-w-[520px] bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-200 shrink-0">
          <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0"><Lightbulb size={18} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-900">{guide.title}</h2>
            <p className="text-[12px] text-slate-500">How this works</p>
          </div>
          <button onClick={onClose} title="Close" className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <p className="text-[14px] leading-relaxed text-slate-700">{guide.intro}</p>

          {guide.sections.map(sec => (
            <div key={sec.title}>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{sec.title}</p>
              <div className="space-y-2.5">
                {sec.items.map(it => (
                  <div key={it.name} className="rounded-xl border border-slate-200 p-3.5">
                    <p className="text-[13px] font-semibold text-slate-900">{it.name}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{it.what}</p>
                    {it.eg && <p className="mt-1.5 text-[12px] text-slate-500"><span className="font-semibold text-slate-400">e.g.</span> {it.eg}</p>}
                    {it.note && <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[12px] text-amber-800">{it.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {guide.example && (
            <div>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{guide.example.title}</p>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5">
                {guide.example.lines.map((l, i) => <p key={i} className="text-[13px] leading-relaxed text-slate-700">{l}</p>)}
              </div>
            </div>
          )}

          {guide.tips?.length > 0 && (
            <div>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Good to know</p>
              <ul className="space-y-2">
                {guide.tips.map(t => (
                  <li key={t} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-600">
                    <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
