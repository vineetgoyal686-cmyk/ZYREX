import { useEffect, useMemo, useState } from "react";
import { Users, Landmark, Building2, FolderKanban, Loader2, Briefcase } from "lucide-react";
import api from "../../utils/api";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import PettyCashStaff from "./PettyCashStaff";
import PettyCashAccounts from "./PettyCashAccounts";
import ScopeDropdown from "../../components/ScopeDropdown";

const NoAccess = () => (
  <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6">
    <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-sm">You don't have access to this area</p>
  </div>
);

// Entity, then Project or Office, then which one — picked in the Petty Cash
// header; everything below is scoped to them. Remembered per browser.
const KINDS = [
  { id: "project", label: "Project", plural: "projects", icon: FolderKanban },
  { id: "office",  label: "Office",  plural: "offices",  icon: Briefcase },
];
const SCOPE_KEY = "petty_cash_scope";
const readScope = () => { try { return JSON.parse(localStorage.getItem(SCOPE_KEY) || "{}"); } catch { return {}; } };
const writeScope = (v) => { try { localStorage.setItem(SCOPE_KEY, JSON.stringify(v)); } catch { /* ignore */ } };

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
  const [kind, setKind] = useState(() => (readScope().kind === "office" ? "office" : "project"));

  useEffect(() => {
    if (!tabs.length) return;
    api.get("/api/petty-cash/scopes")
      .then(({ data }) => setScopes(data))
      .catch(err => setScopeError(err?.response?.data?.error || "Could not load entities"));
  }, [tabs.length]);

  const companies = scopes?.companies || [];
  const company = companies.find(c => c.id === companyId) || companies.find(c => c.code === "BVPL") || companies[0] || null;
  const projects = useMemo(() => (scopes?.projects || [])
    .filter(p => p.companyId === company?.id && (p.kind || "project") === kind), [scopes, company?.id, kind]);
  const project = projects.find(p => p.id === projectId) || null; // null = all of this kind
  const K = KINDS.find(k => k.id === kind);

  useEffect(() => { if (company) writeScope({ companyId: company.id, kind, projectId: project?.id || "" }); }, [company, kind, project]);

  if (!tabs.length) return <NoAccess />;

  // kind / kindLabel: "project" + "Project" or "office" + "Office"
  const scope = company ? { company, project, projects, kind, kindLabel: K.label, allLabel: `All ${K.plural}` } : null;
  const scopeKey = `${company?.id}|${kind}|${project?.id || "all"}`;

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
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {!scopes && !scopeError && <Loader2 size={16} className="animate-spin text-slate-400" />}
          {scopes && (
            <>
              <ScopeDropdown subtle icon={Building2} value={company?.id || ""} placeholder="Select entity" countLabel="Total Entities"
                onChange={id => { setCompanyId(id); setProjectId(""); }}
                options={companies.map(c => ({ id: c.id, title: c.name, code: c.code, detail: c.gstin ? `GSTIN: ${c.gstin}` : "" }))} />
              <span className="h-5 w-px bg-slate-200 shrink-0" />
              <div className="flex items-center bg-slate-100 rounded-md p-0.5 shrink-0">
                {KINDS.map(k => (
                  <button key={k.id} type="button" onClick={() => { setKind(k.id); setProjectId(""); }}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all
                      ${kind === k.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    {k.label}
                  </button>
                ))}
              </div>
              <ScopeDropdown subtle icon={K.icon} value={project?.id || ""} allLabel={`All ${K.plural}`} countLabel={`Total ${K.plural}`}
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

// Cheque Register lives in pages/Finance/ChequeRegister
export default function Expenses() {
  return <PettyCash />;
}
