import { useState, useEffect } from "react";
import { LayoutDashboard, Wallet } from "lucide-react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import BoardroomFinance from "./BoardroomFinance";

const ALL_TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "finance",   label: "Finance",   icon: Wallet },
];

export default function Boardroom() {
  const { canView: canViewDashboard } = useModulePermissions("boardroom_dashboard");
  const { canView: canViewFinance }   = useModulePermissions("boardroom_finance");
  const visibleTabs = ALL_TABS.filter(t => (t.id === "dashboard" ? canViewDashboard : canViewFinance));

  const [tab, setTab] = useState(() => (canViewDashboard ? "dashboard" : "finance"));
  const [financeActions, setFinanceActions] = useState(null);
  const [financeView, setFinanceView] = useState("list");

  // Permissions can change while this page is open (Access Profile edited
  // elsewhere) — jump off a tab the user no longer has if that happens.
  useEffect(() => {
    if (tab === "dashboard" && !canViewDashboard) setTab(canViewFinance ? "finance" : "dashboard");
    if (tab === "finance" && !canViewFinance) setTab(canViewDashboard ? "dashboard" : "finance");
  }, [canViewDashboard, canViewFinance]);

  const showNav = visibleTabs.length > 1 && !(tab === "finance" && financeView === "form");

  if (!canViewDashboard && !canViewFinance) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6">
        <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-sm">You don't have access to this area</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {showNav && (
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-white border-b border-slate-200">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit shrink-0">
            {visibleTabs.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} type="button" onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold transition-all
                    ${active ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  <Icon size={14} /> {t.label}
                </button>
              );
            })}
          </div>
          {tab === "finance" && financeActions}
        </div>
      )}

      {tab === "dashboard" && canViewDashboard ? (
        <div className="p-6 md:p-10">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 flex items-center justify-center">
            <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-sm">Coming Soon</p>
          </div>
        </div>
      ) : canViewFinance ? (
        <BoardroomFinance onHeaderActionsChange={setFinanceActions} onViewChange={setFinanceView} />
      ) : null}
    </div>
  );
}
