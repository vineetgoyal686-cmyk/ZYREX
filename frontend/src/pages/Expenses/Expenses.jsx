import { useState } from "react";
import { Users, Landmark } from "lucide-react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import PettyCashStaff from "./PettyCashStaff";
import PettyCashAccounts from "./PettyCashAccounts";

const NoAccess = () => (
  <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6">
    <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-sm">You don't have access to this area</p>
  </div>
);

function PettyCash() {
  const { canView: canViewStaff }    = useModulePermissions("petty_cash_staff");
  const { canView: canViewAccounts } = useModulePermissions("petty_cash_accounts");
  const tabs = [
    canViewStaff    && { id: "staff",    label: "Staff",    icon: Users },
    canViewAccounts && { id: "accounts", label: "Accounts", icon: Landmark },
  ].filter(Boolean);
  const [picked, setPicked] = useState("staff");
  const tab = tabs.some(t => t.id === picked) ? picked : tabs[0]?.id;

  if (!tabs.length) return <NoAccess />;

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-white border-b border-slate-200">
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
      </div>
      {tab === "staff" ? <PettyCashStaff /> : <PettyCashAccounts />}
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
