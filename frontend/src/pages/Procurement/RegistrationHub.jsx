import { useEffect, useState } from "react";
import { Users, Package, FolderTree, Ruler, FileText, IndianRupee, Scale, Paperclip, ArrowRight } from "lucide-react";
import api from "../../utils/api";

/*
 * Procurement › Registration — one page with a card per master list,
 * grouped. Each card opens that list. Cards the user can't open are hidden.
 */
const GROUPS = [
  { label: "Parties", cards: [
    { tab: "proc_setup__vendor_list", title: "Vendors", desc: "Suppliers and contractors", icon: Users, tone: "indigo", count: "vendors", unit: "vendors" },
  ] },
  { label: "Materials", cards: [
    { tab: "proc_setup__item_list",     title: "Material Catalog", desc: "Supply and SITC items", icon: Package,    tone: "emerald", count: "items",      unit: "items" },
    { tab: "proc_setup__category_list", title: "Category",         desc: "Groups for materials",  icon: FolderTree, tone: "amber",   count: "categories", unit: "categories" },
    { tab: "proc_setup__uom",           title: "UOM",              desc: "Units of measurement",  icon: Ruler,      tone: "sky",     count: "uoms",       unit: "units" },
  ] },
  { label: "Order clauses", cards: [
    { tab: "proc_setup__term_condition",  title: "Terms & Conditions", desc: "Standard order terms",      icon: FileText,    tone: "violet", count: "TC",  unit: "clauses" },
    { tab: "proc_setup__payment_terms",   title: "Payment Terms",      desc: "When and how vendors are paid", icon: IndianRupee, tone: "rose",   count: "PAY", unit: "terms" },
    { tab: "proc_setup__government_laws", title: "Government Laws",    desc: "Statutory clauses",         icon: Scale,       tone: "slate",  count: "GOV", unit: "laws" },
    { tab: "proc_setup__annexure",        title: "Annexure",           desc: "Attachments to orders",     icon: Paperclip,   tone: "teal",   count: "ANX", unit: "annexures" },
  ] },
];

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

// Record counts per card (null until loaded); a failed call shows "—"
function useCounts() {
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    const get = (url, key) => api.get(url).then(r => r.data?.[key] || []).catch(() => null);
    Promise.all([
      get("/api/procurement/vendors", "vendors"),
      get("/api/procurement/items", "items"),
      get("/api/procurement/categories", "categories"),
      get("/api/procurement/uom", "uoms"),
      get("/api/procurement/clauses", "clauses"),
    ]).then(([vendors, items, categories, uoms, clauses]) => {
      const byType = (t) => (clauses ? clauses.filter(c => c.type === t).length : null);
      setCounts({
        vendors: vendors?.length, items: items?.length, categories: categories?.length, uoms: uoms?.length,
        TC: byType("TC"), PAY: byType("PAY"), GOV: byType("GOV"), ANX: byType("ANX"),
      });
    });
  }, []);
  return counts;
}

export default function RegistrationHub({ canOpen, onOpen }) {
  const counts = useCounts();
  const groups = GROUPS
    .map(g => ({ ...g, cards: g.cards.filter(c => canOpen(c.tab)) }))
    .filter(g => g.cards.length);

  return (
    <div className="min-h-full bg-[#f0f2f5]">
      <div className="sticky top-0 z-10 flex items-center px-6 py-3.5 bg-white border-b border-slate-200">
        <h1 className="text-[15px] font-bold text-slate-800">Registration</h1>
      </div>

      <div className="p-5 sm:p-6 flex flex-col gap-7">
        {groups.length === 0 && (
          <p className="text-center py-16 text-sm text-slate-400">You don't have access to any registration list.</p>
        )}
        {groups.map(g => (
          <section key={g.label}>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{g.label}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {g.cards.map(c => {
                const Icon = c.icon;
                const n = counts?.[c.count];
                return (
                  <button key={c.tab} type="button" onClick={() => onOpen(c.tab)}
                    className="group text-left bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`w-11 h-11 rounded-xl ring-1 flex items-center justify-center ${TONES[c.tone]}`}>
                        <Icon size={20} strokeWidth={2} />
                      </div>
                      <ArrowRight size={16} className="text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all mt-1" />
                    </div>
                    <p className="mt-4 text-[15px] font-bold text-slate-800">{c.title}</p>
                    <p className="text-[12px] text-slate-400 mt-0.5">{c.desc}</p>
                    <p className="mt-4 text-[13px] text-slate-500">
                      {!counts
                        ? <span className="inline-block w-16 h-3.5 rounded bg-slate-100 animate-pulse align-middle" />
                        : n == null ? <span className="text-slate-300">—</span>
                        : <><span className="text-[20px] font-black text-slate-800 tabular-nums">{n.toLocaleString("en-IN")}</span> <span>{c.unit}</span></>}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
