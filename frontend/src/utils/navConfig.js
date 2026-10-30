/*
 * Main navigation — every tab, its URL and where it sits in the sidebar.
 *
 * Tab ids are kept from the old layout wherever the page is the same, so
 * permission checks (TAB_MODULE_KEY, screen-time tracking) are unchanged.
 * `project`: "optional" pages take ?project= (none = all projects, if the
 * user may see all); "required" pages need one picked.
 */

export const TABS = {
  zyhawk_ai:                     { path: "/ai",                                 label: "ZyAI" },
  global_dashboard:              { path: "/dashboard",                          label: "Dashboard" },
  view_3d:                       { path: "/3d-view",                            label: "3D View",            project: "required" },
  approvals:                     { path: "/inbox",                              label: "Inbox" },

  procurement__intake:           { path: "/procurement/intake",                 label: "Intake",             project: "optional" },
  procurement__orders:           { path: "/procurement/orders",                 label: "Orders",             project: "optional" },
  // Registration hub; its lists below open from its cards (parent)
  procurement__registration:     { path: "/procurement/registration",           label: "Registration" },
  proc_setup__vendor_list:       { path: "/procurement/registration/vendors",   label: "Vendors", parent: "procurement__registration" },
  proc_setup__item_list:         { path: "/procurement/registration/materials", label: "Material Catalog", parent: "procurement__registration" },
  proc_setup__category_list:     { path: "/procurement/registration/categories", label: "Category", parent: "procurement__registration" },
  proc_setup__uom:               { path: "/procurement/registration/uom",       label: "UOM", parent: "procurement__registration" },
  proc_setup__term_condition:    { path: "/procurement/registration/terms",     label: "Terms & Conditions", parent: "procurement__registration" },
  proc_setup__payment_terms:     { path: "/procurement/registration/payment-terms", label: "Payment Terms", parent: "procurement__registration" },
  proc_setup__government_laws:   { path: "/procurement/registration/laws",      label: "Government Laws", parent: "procurement__registration" },
  proc_setup__annexure:          { path: "/procurement/registration/annexures", label: "Annexure", parent: "procurement__registration" },

  inventory:                     { path: "/inventory",                          label: "Inventory" },

  // Records from before Zyhawk (orders, intake, payment)
  historical_data:               { path: "/archive",                            label: "Archive" },

  // Treasury — executive-only
  treasury__overview:            { path: "/finance/treasury/overview",          label: "Overview" },
  treasury__ledger:                { path: "/finance/treasury/party-ledger",      label: "Party Ledger" },
  treasury__loans:               { path: "/finance/treasury/loans",             label: "Loans & EMI" },
  treasury__masters:             { path: "/finance/treasury/masters",           label: "Masters" },
  finance__expense_book:         { path: "/finance/expense-book",               label: "Expense Book",       project: "required" },
  finance__salary:               { path: "/finance/salary",                     label: "Salary" },
  expenses__petty_cash:          { path: "/finance/petty-cash",                 label: "Petty Cash" },
  expenses__cheque_record:       { path: "/finance/cheque-register",            label: "Cheque Register" },

  hr__employees:                 { path: "/hrms/employees",                     label: "Employees",          orgTab: "employees" },
  operations__staff_attendance:  { path: "/hrms/attendance",                    label: "Attendance" },
  hr__letters:                   { path: "/hrms/offer-letters",                 label: "Offer & Appointment", orgTab: "hr_letters" },
  hr__org_chart:                 { path: "/hrms/org-chart",                     label: "Org Chart",          orgTab: "org_chart" },
  hr__policy:                    { path: "/hrms/policy",                        label: "Policy",             orgTab: "policy" },
  hr__sop:                       { path: "/hrms/sop",                           label: "SOP",                orgTab: "sop" },

  master_data__vendor:           { path: "/reports/vendor-spend",               label: "Vendor-wise Spend" },
  master_data__clauses:          { path: "/reports/clause-usage",               label: "Clause Usage" },
  reports__user_analytics:       { path: "/reports/user-analytics",             label: "User Analytics",     settings: "user_analytics" },

  settings__company:             { path: "/settings/company",                   label: "Organisation" },
  settings__users:               { path: "/settings/users",                     label: "User Management",    settings: "team" },
  settings__access_profiles:     { path: "/settings/access-profiles",           label: "Access Profiles",    settings: "designations" },
  settings__roles:               { path: "/settings/roles",                     label: "Roles",              settings: "roles" },
  settings__control_center:      { path: "/settings/control-center",            label: "Control Center",     settings: "control_center" },
  settings__approval_flow:       { path: "/settings/approval-flow",             label: "Approval Flow",      settings: "approval_flow" },
  settings__request_handler:     { path: "/settings/request-handler",           label: "Request Handler",    settings: "request_handler" },
  settings__numbering:           { path: "/settings/numbering",                 label: "Numbering",          settings: "serialization" },
  settings__mail:                { path: "/settings/mail",                      label: "Mail",               settings: "mail_management" },

  profile:                       { path: "/profile",                            label: "Personal Info",      settings: "profile" },
  profile__security:             { path: "/profile/security",                   label: "Security",           settings: "security" },
  profile__delegation:           { path: "/profile/delegation",                 label: "Delegation",         settings: "delegation" },

  // Not in the sidebar — opened from inside other pages
  create__order:                 { path: "/create/order",                       label: "Create Order" },
  create__intake:                { path: "/create/intake",                      label: "Create Intake" },
};

export const PATH_TO_TAB = Object.fromEntries(Object.entries(TABS).map(([id, t]) => [t.path, id]));

/*
 * Sidebar layout. A section holds rows and/or sub-groups; a sub-group is a
 * collapsible list inside a section.
 */
export const NAV = [
  { row: "global_dashboard" },
  { row: "view_3d" },
  { row: "approvals" },
  { section: "procurement", label: "Procurement", items: [
    "procurement__intake", "procurement__orders", "procurement__registration",
  ] },
  { row: "inventory" },
  { section: "finance", label: "Finance", items: [
    "expenses__petty_cash", "finance__expense_book", "finance__salary", "expenses__cheque_record",
    // secure: drawn as a gold "vault" in the sidebar
    { group: "treasury", label: "Treasury", secure: true, items: ["treasury__overview", "treasury__ledger", "treasury__loans", "treasury__masters"] },
  ] },
  { section: "hrms", label: "HRMS", items: [
    "hr__employees", "operations__staff_attendance", "hr__letters",
    "hr__org_chart",
    { group: "hr_documents", label: "Documents", items: ["hr__policy", "hr__sop"] },
  ] },
  { section: "reports", label: "Reports", items: [
    "master_data__vendor", "master_data__clauses", "reports__user_analytics",
  ] },
  { row: "historical_data" },
  { section: "settings", label: "Settings", items: [
    "settings__company",
    { group: "set_access",   label: "Access",   items: ["settings__users", "settings__access_profiles", "settings__roles", "settings__control_center"] },
    { group: "set_workflow", label: "Workflow", items: ["settings__approval_flow", "settings__request_handler"] },
    { group: "set_system",   label: "System",   items: ["settings__numbering", "settings__mail"] },
  ] },
];

// Profile page tabs (opened from the user card at the bottom of the sidebar)
export const PROFILE_TABS = ["profile", "profile__security", "profile__delegation"];

/*
 * Old URLs → new. Query string and hash are carried over (order emails
 * link to /master-data/orders?order=…).
 */
export const LEGACY_PATHS = {
  "/finance/payments-track":  "/finance/expense-book",
  "/finance/finance-track":   "/finance/expense-book",
  "/boardroom":                "/finance/treasury/overview",
  "/finance/treasury/dashboard": "/finance/treasury/overview",
  "/expenses/petty-cash":      "/finance/petty-cash",
  "/expenses/cheque-record":   "/finance/cheque-register",
  "/finance/cheque-record":    "/finance/cheque-register",
  "/organisation":             "/settings/company",
  // Projects and Branch moved inside Settings › Company
  "/settings/projects":        "/settings/company",
  "/settings/branch":          "/settings/company",
  "/organisation/structure":   "/settings/company",
  // Departments, Teams, Designations, Grades moved to Settings › Organisation; Divisions and Hierarchy removed
  "/hrms/structure":           "/settings/company",
  "/hrms/divisions":           "/settings/company",
  "/hrms/departments":         "/settings/company",
  "/hrms/teams":               "/settings/company",
  "/hrms/grades":              "/settings/company",
  "/hrms/designations":        "/settings/company",
  "/organisation/sop":         "/hrms/sop",
  "/historical-data":          "/archive",
  "/setup/vendors":            "/procurement/registration/vendors",
  "/setup/items":              "/procurement/registration/materials",
  "/setup/categories":         "/procurement/registration/categories",
  "/setup/uom":                "/procurement/registration/uom",
  "/setup/clauses/terms":      "/procurement/registration/terms",
  "/setup/clauses/payment":    "/procurement/registration/payment-terms",
  "/setup/clauses/laws":       "/procurement/registration/laws",
  "/setup/clauses/annexures":  "/procurement/registration/annexures",
  "/master-data":              "/procurement/orders",
  "/master-data/vendors":      "/reports/vendor-spend",
  "/master-data/clauses":      "/reports/clause-usage",
  "/master-data/orders":       "/procurement/orders",
  "/master-data/intakes":      "/procurement/intake",
  "/master-data/finance":      "/finance/finance-track",
};

// Old project URLs: /p/<project>/<sub>
export const LEGACY_PROJECT_SUBS = {
  "":                        "/procurement/orders",
  "/3d":                     "/3d-view",
  "/procurement/intake":     "/procurement/intake",
  "/procurement/orders":     "/procurement/orders",
  "/operations/attendance":  "/hrms/attendance",
  "/finance/payments-track": "/finance/expense-book",
};

// New URL for an old one, or null if it isn't an old URL
export function legacyRedirect(pathname, search = "", hash = "") {
  if (LEGACY_PATHS[pathname]) return LEGACY_PATHS[pathname] + search + hash;
  if (!pathname.startsWith("/p/")) return null;
  const rest = pathname.slice(3);
  const slash = rest.indexOf("/");
  const project = decodeURIComponent(slash === -1 ? rest : rest.slice(0, slash));
  const sub = slash === -1 ? "" : rest.slice(slash);
  const target = LEGACY_PROJECT_SUBS[sub] || "/procurement/orders";
  const params = new URLSearchParams(search);
  if (project && project !== "select-project") params.set("project", project);
  const qs = params.toString();
  return target + (qs ? `?${qs}` : "") + hash;
}
