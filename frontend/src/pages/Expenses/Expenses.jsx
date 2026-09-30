import { useEffect, useMemo, useRef, useState } from "react";
import { Users, Landmark, Building2, FolderKanban, ChevronDown, Loader2, Check } from "lucide-react";
import api from "../../utils/api";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import PettyCashStaff from "./PettyCashStaff";
import PettyCashAccounts from "./PettyCashAccounts";

const NoAccess = () => (
  <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6">
    <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-sm">You don't have access to this area</p>
  </div>
);

// Entity + Project picked in the Petty Cash header; everything below is
// scoped to them. Remembered per browser.
const SCOPE_KEY = "petty_cash_scope";
const readScope = () => { try { return JSON.parse(localStorage.getItem(SCOPE_KEY) || "{}"); } catch { return {}; } };
const writeScope = (v) => { try { localStorage.setItem(SCOPE_KEY, JSON.stringify(v)); } catch { /* ignore */ } };

// Header picker in the same style as the Create Order company select:
// search box, a count row, and each option with its code and one more
// detail line. `allLabel` adds an "all" option at the top (value "").
function ScopeDropdown({ icon, value, onChange, options, countLabel, allLabel, placeholder }) {
  const Icon = icon;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selected = options.find(o => o.id === value);
  const q = search.trim().toLowerCase();
  const filtered = options.filter(o => !q || `${o.title} ${o.code} ${o.detail}`.toLowerCase().includes(q));
  const pick = (id) => { onChange(id); setOpen(false); setSearch(""); };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`h-9 w-[210px] sm:w-[250px] flex items-center gap-2 border rounded-lg pl-3 pr-2.5 bg-white text-left transition-colors
          ${open ? "border-slate-500" : "border-slate-200 hover:border-slate-400"}`}>
        <Icon size={14} className="text-slate-400 shrink-0" />
        <span className={`flex-1 min-w-0 truncate text-sm font-medium ${selected || allLabel ? "text-slate-800" : "text-slate-400"}`}>
          {selected ? selected.title : allLabel || placeholder}
        </span>
        {selected?.code && <span className="shrink-0 text-[11px] font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{selected.code}</span>}
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-[320px] bg-white border border-slate-200 rounded-lg shadow-xl z-[60] flex flex-col overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search here..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 text-slate-700" />
          </div>
          <div className="overflow-y-auto max-h-72">
            <div className="px-4 py-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border-b border-slate-100">
              {countLabel}: {options.length}
            </div>
            {allLabel && !q && (
              <div onClick={() => pick("")}
                className={`px-4 py-2.5 cursor-pointer border-b border-slate-100 text-[13px] font-semibold ${!value ? "bg-indigo-50 text-indigo-700" : "text-slate-900 hover:bg-slate-50"}`}>
                {allLabel}
              </div>
            )}
            {filtered.map(o => {
              const isSel = o.id === value;
              return (
                <div key={o.id} onClick={() => pick(o.id)}
                  className={`flex items-center justify-between px-4 py-2 cursor-pointer border-b border-slate-100 last:border-0 ${isSel ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold truncate ${isSel ? "text-indigo-700" : "text-slate-900"}`}>{o.title}</p>
                    {o.code && (
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">
                        <span className="text-slate-500">Code:</span> <span className="font-semibold text-slate-700">{o.code}</span>
                      </p>
                    )}
                    {o.detail && <p className="text-[11px] text-slate-600 truncate">{o.detail}</p>}
                  </div>
                  {isSel && <Check size={15} className="text-indigo-600 shrink-0 ml-3" />}
                </div>
              );
            })}
            {filtered.length === 0 && <div className="px-4 py-4 text-center text-xs text-slate-400">No results found</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function PettyCash() {
  const { canView: canViewStaff }    = useModulePermissions("petty_cash_staff");
  const { canView: canViewAccounts } = useModulePermissions("petty_cash_accounts");
  const tabs = [
    canViewStaff    && { id: "staff",    label: "Staff",    icon: Users },
    canViewAccounts && { id: "accounts", label: "Accounts", icon: Landmark },
  ].filter(Boolean);
  const [picked, setPicked] = useState("staff");
  const tab = tabs.some(t => t.id === picked) ? picked : tabs[0]?.id;

  const [scopes, setScopes]   = useState(null); // { companies, projects }
  const [scopeError, setScopeError] = useState("");
  const [companyId, setCompanyId] = useState(() => readScope().companyId || "");
  const [projectId, setProjectId] = useState(() => readScope().projectId || "");

  useEffect(() => {
    if (!tabs.length) return;
    api.get("/api/petty-cash/scopes")
      .then(({ data }) => setScopes(data))
      .catch(err => setScopeError(err?.response?.data?.error || "Could not load entities"));
  }, [tabs.length]);

  const companies = scopes?.companies || [];
  const company = companies.find(c => c.id === companyId) || companies.find(c => c.code === "BVPL") || companies[0] || null;
  const projects = useMemo(() => (scopes?.projects || []).filter(p => p.companyId === company?.id), [scopes, company?.id]);
  const project = projects.find(p => p.id === projectId) || null; // null = All projects

  useEffect(() => { if (company) writeScope({ companyId: company.id, projectId: project?.id || "" }); }, [company, project]);

  if (!tabs.length) return <NoAccess />;

  const scope = company ? { company, project, projects } : null;
  const scopeKey = `${company?.id}|${project?.id || "all"}`;

  // Both tabs fill the screen: summary and pager stay put, only the table scrolls.
  return (
    <div className="min-h-screen bg-[#f8fafc] md:min-h-0 md:h-full md:flex md:flex-col">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-3.5 bg-white border-b border-slate-200">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit shrink-0">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setPicked(t.id)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold transition-all
                  ${active ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {!scopes && !scopeError && <Loader2 size={16} className="animate-spin text-slate-400" />}
          {scopes && (
            <>
              <ScopeDropdown icon={Building2} value={company?.id || ""} placeholder="Select entity" countLabel="Total Entities"
                onChange={id => { setCompanyId(id); setProjectId(""); }}
                options={companies.map(c => ({ id: c.id, title: c.name, code: c.code, detail: c.gstin ? `GSTIN: ${c.gstin}` : "" }))} />
              <ScopeDropdown icon={FolderKanban} value={project?.id || ""} allLabel="All projects" countLabel="Total Projects"
                onChange={setProjectId}
                options={projects.map(p => ({ id: p.id, title: p.name, code: p.code, detail: [p.city, p.state].filter(Boolean).join(", ") }))} />
            </>
          )}
        </div>
      </div>
      {scopeError ? (
        <p className="p-6 text-sm text-red-600">{scopeError}</p>
      ) : !scope ? (
        scopes && <p className="p-6 text-sm text-slate-500">No active entity found. Add one under Organisation first.</p>
      ) : tab === "staff" ? <PettyCashStaff key={scopeKey} scope={scope} /> : <PettyCashAccounts key={scopeKey} scope={scope} />}
    </div>
  );
}

function ChequeRecord() {
  const { canView } = useModulePermissions("expenses_cheque_record");
  if (!canView) return <NoAccess />;
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-white border-b border-slate-200">
        <h1 className="text-lg font-extrabold text-slate-900">Cheque Record</h1>
      </div>
      <div className="p-5 sm:p-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <p className="text-slate-400 text-sm">No entries yet.</p>
        </div>
      </div>
    </div>
  );
}

export default function Expenses({ view }) {
  return view === "petty_cash" ? <PettyCash /> : <ChequeRecord />;
}
