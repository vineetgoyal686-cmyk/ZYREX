import React from "react";
import { LayoutDashboard, ClipboardList, ShoppingBag, Package, Building2 } from "lucide-react";

const NAV = [
  { id: "global_dashboard",          label: "Home",         icon: LayoutDashboard },
  { id: "master_data__orders",        label: "Records",      icon: ClipboardList   },
  { id: "create__order",              label: "Procurement",  icon: ShoppingBag     },
  { id: "inventory__stock_inventory", label: "Inventory",    icon: Package         },
  { id: "organisation",               label: "Organisation", icon: Building2       },
];

function isActive(navId, activeTab) {
  if (navId === "global_dashboard")
    return activeTab === "global_dashboard" || activeTab === "dashboard";
  if (navId === "master_data__orders")
    return activeTab.startsWith("master_data") || activeTab === "historical_data" || activeTab === "audit";
  if (navId === "create__order")
    return activeTab.startsWith("create") || activeTab.startsWith("procurement") ||
           activeTab === "approvals" || activeTab.startsWith("approvals");
  if (navId === "inventory__stock_inventory")
    return activeTab.startsWith("inventory") || activeTab.startsWith("operations") || activeTab.startsWith("finance");
  if (navId === "organisation")
    return activeTab.startsWith("organisation");
  return activeTab === navId;
}

export default function MobileBottomNav({ activeTab, onTabChange }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-slate-200 flex items-center justify-around"
      style={{ height: "60px", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = isActive(id, activeTab);
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full"
          >
            <div className={`flex items-center justify-center w-10 h-7 rounded-xl transition-colors ${active ? "bg-blue-50" : ""}`}>
              <Icon
                size={19}
                strokeWidth={active ? 2.5 : 1.8}
                className={active ? "text-blue-600" : "text-slate-400"}
              />
            </div>
            <span className={`text-[10px] font-semibold leading-none ${active ? "text-blue-600" : "text-slate-400"}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
