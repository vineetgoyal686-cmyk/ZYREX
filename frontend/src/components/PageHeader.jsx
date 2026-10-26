import BackButton from "./BackButton";

const TONES = {
  indigo:  "bg-indigo-50 text-indigo-600 ring-indigo-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  amber:   "bg-amber-50 text-amber-600 ring-amber-100",
  sky:     "bg-sky-50 text-sky-600 ring-sky-100",
  violet:  "bg-violet-50 text-violet-600 ring-violet-100",
  rose:    "bg-rose-50 text-rose-600 ring-rose-100",
  slate:   "bg-slate-100 text-slate-600 ring-slate-200",
  teal:    "bg-teal-50 text-teal-600 ring-teal-100",
};

/*
 * The one page header used across the app:
 *   Row 1 — [back] [icon] Title (count)  ·····  actions (More, then one primary)
 *   Row 2 — underline tabs, only when the page has tabs
 * Search / filters go in the page's own toolbar right below.
 * secure: Treasury look — navy + gold icon, gold tabs.
 */
export default function PageHeader({ icon: Icon, tone = "indigo", iconClass, title, count, actions, tabs, activeTab, onTabChange, secure = false }) {
  const tileClass = secure
    ? "bg-gradient-to-br from-[#0b1b2e] to-[#04111f] text-amber-300 ring-amber-400/40 shadow-[0_3px_8px_-2px_rgba(4,17,31,0.45)]"
    : (iconClass || TONES[tone]);
  return (
    <>
    <div className={`px-4 sm:px-6 pt-3.5 ${tabs ? "" : "pb-3.5"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <BackButton />
          {Icon && (
            <div className={`hidden sm:flex w-9 h-9 rounded-xl ring-1 items-center justify-center shrink-0 ${tileClass}`}>
              <Icon size={18} strokeWidth={2} />
            </div>
          )}
          <h1 className="text-[17px] font-bold text-slate-900 tracking-tight truncate">{title}</h1>
          {count != null && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-slate-600">
              {Number(count).toLocaleString("en-IN")}
            </span>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {tabs && (
        <div className="flex items-center gap-6 mt-2.5 -mb-px overflow-x-auto thin-scrollbar-xs">
          {tabs.map(t => {
            const active = activeTab === t.key;
            return (
              <button key={t.key} type="button" onClick={() => onTabChange(t.key)}
                className={`shrink-0 pb-2.5 pt-1 text-[13px] font-semibold border-b-2 transition-colors ${
                  active ? `${secure ? "border-amber-500" : "border-indigo-600"} text-slate-900` : "border-transparent text-slate-400 hover:text-slate-700"}`}>
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}
