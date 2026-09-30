import { useEffect, useMemo, useState } from "react";
import { Users, Landmark, Building2, FolderKanban, ChevronDown, Loader2 } from "lucide-react";
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

function ScopeSelect({ icon, value, onChange, children, disabled }) {
  const Icon = icon;
  return (
    <div className="relative">
      <Icon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <select value={value} onChange={onChange} disabled={disabled}
        className="h-9 max-w-[240px] appearance-none border border-slate-200 rounded-lg pl-8 pr-8 text-sm font-medium text-slate-700 bg-white outline-none focus:border-slate-400 cursor-pointer disabled:bg-slate-50">
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
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
              <ScopeSelect icon={Building2} value={company?.id || ""} onChange={e => { setCompanyId(e.target.value); setProjectId(""); }}>
                {companies.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} — ${c.name}` : c.name}</option>)}
              </ScopeSelect>
              <ScopeSelect icon={FolderKanban} value={project?.id || ""} onChange={e => setProjectId(e.target.value)}>
                <option value="">All projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </ScopeSelect>
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
