import React, { useState } from "react";

const PAGE_TITLES = {
  global_dashboard:                 "Dashboard",
  organisation:                     "Organization",
  profile:                          "Profile",
  approvals:                        "Approvals",
  intake:                           "Approvals",
  orders:                           "Approvals",
  amendments:                       "Approvals",
  payments:                         "Approvals",
  audit:                            "Audit",
  master_data:                      "Master Data",
  master_data__vendor:              "Master Data",
  master_data__clauses:             "Master Data",
  master_data__products:            "Master Data",
  master_data__orders:              "Master Data",
  master_data__intakes:             "Master Data",
  create__intake:                   "Create Intake",
  create__order:                    "Create Order",
  proc_setup__item_list:            "Item List",
  proc_setup__vendor_list:          "Vendor List",
  proc_setup__term_condition:       "Term & Conditions",
  proc_setup__payment_terms:        "Payment Terms",
  proc_setup__government_laws:      "Government Laws",
  proc_setup__uom:                  "UOM",
  proc_setup__category_list:        "Category",
  proc_setup__annexure:             "Annexure",
  dashboard:                        "Project Dashboard",
  view_3d:                          "3D View",
  procurement__orders:              "Purchase Orders",
  procurement__intake:              "Intake",
  finance__site_expense:            "Site Expense",
  finance__petty_cash:              "Petty Cash",
  finance__bills_documents:         "Bills & Documents",
  operations__work_activity:        "Work Activity",
  operations__manpower:             "Manpower",
  operations__staff_attendance:     "Attendance",
  inventory__received_material_grn: "Received Material",
  inventory__stock_inventory:       "Stock Inventory",
  inventory__material_issue:        "Material Issue",
};

const initials = (name = "") =>
  name.split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase();

export default function Topbar({ activeTab, currentUser }) {
  const [showPhoto, setShowPhoto] = useState(false);

  const title    = PAGE_TITLES[activeTab] || activeTab?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "—";
  const userName = currentUser?.name || currentUser?.full_name || currentUser?.username || "User";
  const userRole = currentUser?.role || "Admin";
  const avatar   = currentUser?.avatar || null;

  return (
    <>
      <div className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center px-5 z-20">
        {/* Page title — left */}
        <span className="text-[15px] font-bold text-slate-800 whitespace-nowrap mr-auto">{title}</span>

        {/* Right: user */}
        <div className="flex items-center gap-2">
          {/* Avatar — clickable to view full photo */}
          <button
            onClick={() => avatar && setShowPhoto(true)}
            className="shrink-0 focus:outline-none"
            title="View photo"
            style={{ cursor: avatar ? "pointer" : "default" }}
          >
            {avatar ? (
              <img src={avatar} alt={userName} className="w-8 h-8 rounded-full object-cover border border-slate-200 hover:ring-2 hover:ring-blue-400 transition-all" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold">
                {initials(userName)}
              </div>
            )}
          </button>
          <div className="hidden sm:block text-left">
            <p className="text-[13px] font-semibold text-slate-800 leading-tight">{userName}</p>
            <p className="text-[11px] text-slate-500 leading-tight capitalize">{userRole}</p>
          </div>
        </div>
      </div>

      {/* Photo lightbox modal */}
      {showPhoto && avatar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowPhoto(false)}
        >
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img
              src={avatar}
              alt={userName}
              className="w-64 h-64 rounded-full object-cover border-4 border-white shadow-2xl"
            />
            <button
              onClick={() => setShowPhoto(false)}
              className="absolute -top-3 -right-3 w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center text-slate-500 hover:text-slate-800 text-lg font-bold leading-none"
            >
              ×
            </button>
            <p className="text-center text-white font-semibold mt-3 text-sm">{userName}</p>
            <p className="text-center text-slate-300 text-xs capitalize">{userRole}</p>
          </div>
        </div>
      )}
    </>
  );
}
