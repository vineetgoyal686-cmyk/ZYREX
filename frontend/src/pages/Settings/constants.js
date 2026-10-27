export const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

export const ROLE_BADGE = {
  global_admin: { label: "Global Admin", color: "bg-violet-100 text-violet-700 border border-violet-200" },
  super_admin:  { label: "Super Admin",  color: "bg-purple-100 text-purple-700 border border-purple-200" },
  admin:        { label: "Admin",        color: "bg-blue-100 text-blue-700 border border-blue-200"        },
  user:         { label: "User",         color: "bg-slate-100 text-slate-600 border border-slate-200"     },
};

export const PROFILE_SECTIONS = [
  { key: "manage_user",      label: "User Management",   keys: [{ k: "view", label: "View" }, { k: "add", label: "Add" }, { k: "edit", label: "Edit" }, { k: "delete", label: "Delete" }, { k: "manage_permissions", label: "Manage Permissions" }] },
  { key: "manage_project",   label: "Project Management",keys: [{ k: "view", label: "View" }, { k: "add", label: "Add" }, { k: "edit", label: "Edit" }, { k: "delete", label: "Delete" }] },
  { key: "designation",      label: "Access Profile",    keys: [{ k: "view", label: "View" }, { k: "add", label: "Add" }, { k: "edit", label: "Edit" }, { k: "delete", label: "Delete" }] },
  { key: "approval_flow",    label: "Approval Flow",     keys: [{ k: "view", label: "View" }, { k: "add", label: "Add" }, { k: "edit", label: "Edit" }, { k: "delete", label: "Delete" }] },
  { key: "serialization",    label: "Serialization",     keys: [{ k: "view", label: "View" }, { k: "add", label: "Add" }, { k: "edit", label: "Edit" }, { k: "delete", label: "Delete" }] },
  { key: "request_handler",  label: "Request Handler",   keys: [{ k: "view", label: "View" }, { k: "edit", label: "Edit" }] },
  { key: "delegation",       label: "Delegation",        keys: [{ k: "view", label: "View" }, { k: "add", label: "Add" }, { k: "edit", label: "Edit" }, { k: "delete", label: "Delete" }] },
  { key: "mail_management",  label: "Mail Management",   keys: [{ k: "view", label: "View" }, { k: "add", label: "Add" }, { k: "edit", label: "Edit" }, { k: "delete", label: "Delete" }] },
];

export const DEFAULT_PROFILE_PERMS = {
  manage_user:     { view: false, add: false, edit: false, delete: false, manage_permissions: false },
  manage_project:  { view: false, add: false, edit: false, delete: false },
  designation:     { view: false, add: false, edit: false, delete: false },
  approval_flow:   { view: false, add: false, edit: false, delete: false },
  serialization:   { view: false, add: false, edit: false, delete: false },
  request_handler: { view: false, edit: false },
  delegation:      { view: false, add: false, edit: false, delete: false },
  mail_management: { view: false, add: false, edit: false, delete: false },
};

export const ROLE_DEFAULT_PERMS = {
  super_admin: {
    manage_user:     { view: true, add: true, edit: true, delete: true, manage_permissions: true },
    manage_project:  { view: true, add: true, edit: true, delete: true },
    designation:     { view: true, add: true, edit: true, delete: true },
    approval_flow:   { view: true, add: true, edit: true, delete: true },
    serialization:   { view: true, add: true, edit: true, delete: true },
    request_handler: { view: true, edit: true },
    delegation:      { view: true, add: true, edit: true, delete: true },
    mail_management: { view: true, add: true, edit: true, delete: true },
  },
  admin: {
    manage_user:     { view: true, add: true, edit: true, delete: false, manage_permissions: false },
    manage_project:  { view: true, add: true, edit: true, delete: false },
    designation:     { view: true, add: true, edit: true, delete: false },
    approval_flow:   { view: true, add: true, edit: true, delete: false },
    serialization:   { view: true, add: false, edit: true, delete: false },
    request_handler: { view: true, edit: true },
    delegation:      { view: true, add: true, edit: true, delete: false },
    mail_management: { view: true, add: true, edit: true, delete: false },
  },
  user: {
    manage_user:     { view: false, add: false, edit: false, delete: false, manage_permissions: false },
    manage_project:  { view: false, add: false, edit: false, delete: false },
    designation:     { view: false, add: false, edit: false, delete: false },
    approval_flow:   { view: false, add: false, edit: false, delete: false },
    serialization:   { view: false, add: false, edit: false, delete: false },
    request_handler: { view: false, edit: false },
    delegation:      { view: false, add: false, edit: false, delete: false },
    mail_management: { view: false, add: false, edit: false, delete: false },
  },
};

export const MODULE_PERM_KEYS = [
  { key: "can_view",              label: "View"           },
  { key: "can_add",               label: "Create"         },
  { key: "can_edit",              label: "Edit"           },
  { key: "can_delete",            label: "Delete"         },
  { key: "can_trash",             label: "Trash"          },
  { key: "can_trash_view",        label: "Trash View"     },
  { key: "can_trash_log",         label: "Trash Log"      },
  { key: "can_trash_restore",     label: "Trash Restore"  },
  { key: "can_trash_delete",      label: "Trash Delete"   },
  { key: "can_export",            label: "Export"         },
  { key: "can_bulk_upload",       label: "Bulk Upload"    },
  { key: "can_log",               label: "Log"            },
  { key: "can_download_document", label: "Download"       },
  { key: "can_take_action",       label: "Take Action"    },
  { key: "can_submit",            label: "Submit"         },
  { key: "can_approve",           label: "Approve"        },
  { key: "can_reject",            label: "Reject"         },
  { key: "can_revert",            label: "Revert"         },
  { key: "can_request",           label: "Request"        },
  { key: "can_request_recall",    label: "Request Recall" },
  { key: "can_request_amend",     label: "Request Amend"  },
  { key: "can_request_cancel",    label: "Request Cancel" },
  { key: "can_withdraw",          label: "Withdraw"         },
  { key: "can_withdraw_recall",   label: "Withdraw Recall"  },
  { key: "can_withdraw_amend",    label: "Withdraw Amend"   },
  { key: "can_withdraw_cancel",   label: "Withdraw Cancel"  },
  { key: "can_withdraw_submission",    label: "Withdraw Issue"   },
];

export const PERM_LABELS = {
  can_view:              "View",
  can_add:               "Create",
  can_edit:              "Edit",
  can_delete:            "Delete",
  can_trash:             "Trash",
  can_trash_view:        "View",
  can_trash_log:         "Log",
  can_trash_restore:     "Restore",
  can_trash_delete:      "Delete",
  can_export:            "Export",
  can_bulk_upload:       "Bulk Upload",
  can_log:               "Log",
  can_manage_columns:    "Add Column",
  can_download_document: "Download",
  can_take_action:       "Take Action",
  can_submit:            "Submit",
  can_approve:           "Approve",
  can_reject:            "Reject",
  can_revert:            "Revert",
  can_request:           "Request",
  can_request_recall:    "Request Recall",
  can_request_amend:     "Request Amend",
  can_request_cancel:    "Request Cancel",
  can_withdraw:          "Withdraw",
  can_withdraw_recall:   "Withdraw Recall",
  can_withdraw_amend:    "Withdraw Amend",
  can_withdraw_cancel:   "Withdraw Cancel",
  can_withdraw_submission:    "Withdraw Submission",
};

export const MODULE_PERM_CONFIG = {
  global_dashboard:        ["can_view"],
  zyhawk_ai:               ["can_view"],
  organisation:            ["can_view"],
  structure:               ["can_view"],
  org_chart:               ["can_view"],
  sop:                     ["can_view"],
  departments:             ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export"],
  teams:                   ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export"],
  divisions:               ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export"],
  grades:                  ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export"],
  designations:            ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export"],
  employees:               ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export"],
  locations:               ["can_view", "can_add", "can_edit", "can_delete"],
  policy:                  ["can_view", "can_add", "can_edit", "can_delete"],
  audit:                   ["can_view"],
  treasury_overview:     ["can_view"],
  petty_cash_staff:        ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  petty_cash_accounts:     ["can_view", "can_export"],
  expenses_cheque_record:  ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  treasury_ledger:       ["can_view", "can_add", "can_edit", "can_delete", "can_export", "can_manage_columns", "can_log"],
  inbox_orders:            ["can_view", "can_take_action"],
  inbox_intakes:           ["can_view", "can_take_action"],
  inbox_payments:          ["can_view", "can_take_action"],
  company_list:            ["can_view", "can_add", "can_edit", "can_delete", "can_export", "can_log"],
  vendor_list:             ["can_view", "can_add", "can_edit", "can_delete", "can_trash", "can_bulk_upload", "can_export", "can_log"],
  vendor_pool:             ["can_view", "can_add", "can_edit", "can_delete", "can_trash", "can_bulk_upload", "can_export", "can_log"],
  item_supply:             ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  item_sitc:               ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  category_list:           ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  uom:                     ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  term_condition:          ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  payment_terms:           ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  government_laws:         ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  annexure:                ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  historical_data:         ["can_view", "can_edit", "can_delete"],
  master_data_vendor:      ["can_view", "can_export"],
  master_data_intakes:     ["can_view", "can_export"],
  master_data_orders_tab:  ["can_view", "can_add", "can_bulk_upload", "can_export",
                            "can_trash_view", "can_trash_log", "can_trash_restore", "can_trash_delete"],
  master_data_clauses:     ["can_view", "can_export"],
  view_3d:                 ["can_view"],
  intake:                  ["can_view"],
  order:                   ["can_view", "can_add", "can_edit", "can_delete",
                            "can_request_recall", "can_request_amend", "can_request_cancel",
                            "can_withdraw_recall", "can_withdraw_amend", "can_withdraw_cancel", "can_withdraw_submission",
                            "can_export", "can_download_document", "can_bulk_upload",
                            "can_trash_view", "can_trash_log", "can_trash_restore", "can_trash_delete"],
  staff_attendance:        ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export"],
  payment_request:         ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  expense_book:            ["can_view", "can_add", "can_edit", "can_delete", "can_export", "can_bulk_upload"],
  bills_docs:              ["can_view", "can_add", "can_delete", "can_download_document"],
};

export const DEFAULT_MODULE_PERMS = ["can_view", "can_add", "can_edit", "can_delete", "can_export"];

export const MODULE_BUILT_STATUS = {
  global_dashboard: true, zyhawk_ai: true, treasury_overview: true, treasury_ledger: true, inbox: true,
  petty_cash_staff: true, petty_cash_accounts: true, expenses_cheque_record: true, annexure: true,
  departments: true, teams: true, divisions: true, grades: true,
  designations: true, employees: true, locations: true, policy: true,
  master_data_vendor: true,
  master_data_orders: true, master_data_intakes: true, master_data_clauses: true,
  view_3d: true,
  intake: true, order: true,
  historical_data: true,
  company_list: true, vendor_list: true, uom: true,
  category_list: true, item_list: true,
  term_condition: true, payment_terms: true, government_laws: true,
  bills_docs: true, payment_request: true, expense_book: true,
  staff_attendance: true,
};

/*
 * Permission screen layout — same order and names as the sidebar.
 * A row is one permission module (key) shown under the tab name (label);
 * `group` rows nest like the sidebar's sub-groups; `perms` limits which of
 * the module's permissions the row shows.
 */
export const PERMISSION_LAYOUT = [
  { section: "General", rows: [
    { key: "global_dashboard", label: "Dashboard" },
    { key: "zyhawk_ai",        label: "ZyAI" },
    { key: "view_3d",          label: "3D View" },
    { group: "Inbox", rows: [
      { key: "inbox_orders",   label: "Orders" },
      { key: "inbox_intakes",  label: "Intake",   perms: ["can_view"] },
      { key: "inbox_payments", label: "Payments", perms: ["can_view"] },
    ] },
  ] },
  { section: "Procurement", rows: [
    // which projects: "Projects ▾" on the row (the old separate
    // "All projects" permissions are no longer shown)
    { key: "intake", label: "Intake" },
    { key: "order",  label: "Orders" },
    { group: "Registration", rows: [
      { key: "vendor_list",     label: "Vendors" },
      { key: "vendor_pool",     label: "Vendor Pool" },
      { key: "item_supply",     label: "Materials (Supply)" },
      { key: "item_sitc",       label: "Materials (SITC)" },
      { key: "category_list",   label: "Category" },
      { key: "uom",             label: "UOM" },
      { key: "term_condition",  label: "Terms & Conditions" },
      { key: "payment_terms",   label: "Payment Terms" },
      { key: "government_laws", label: "Government Laws" },
      { key: "annexure",        label: "Annexure" },
    ] },
  ] },
  { section: "Finance", rows: [
    { group: "Petty Cash", rows: [
      { key: "petty_cash_staff",    label: "Staff" },
      { key: "petty_cash_accounts", label: "Accounts" },
    ] },
    { key: "expense_book",           label: "Expense Book" },
    { key: "expenses_cheque_record", label: "Cheque Record" },
    { group: "Treasury", rows: [
      { key: "treasury_overview", label: "Overview" },
      { key: "treasury_ledger",   label: "Ledger, Loans & Masters" },
    ] },
  ] },
  { section: "HRMS", rows: [
    { key: "employees",        label: "Employees" },
    { key: "staff_attendance", label: "Attendance" },
    { group: "Structure", rows: [
      { key: "structure",    label: "Hierarchy" },
      { key: "divisions",    label: "Divisions" },
      { key: "departments",  label: "Departments" },
      { key: "teams",        label: "Teams" },
      { key: "grades",       label: "Grades" },
      { key: "designations", label: "Designations" },
      { key: "org_chart",    label: "Org Chart" },
    ] },
    { group: "Documents", rows: [
      { key: "policy", label: "Policy" },
      { key: "sop",    label: "SOP" },
    ] },
  ] },
  { section: "Reports", rows: [
    { key: "master_data_vendor",  label: "Vendor-wise Spend" },
    { key: "master_data_clauses", label: "Clause Usage" },
  ] },
  { section: "Archive", rows: [
    { key: "historical_data", label: "Archive" },
  ] },
  // `profile` rows are the Settings pages' own permissions, kept in
  // profile_permissions (PROFILE_SECTIONS) rather than as modules
  { section: "Settings", rows: [
    { group: "Organisation", rows: [
      { key: "company_list",       label: "Companies" },
      { profile: "manage_project", label: "Projects" },
      { key: "locations",          label: "Branch" },
    ] },
    { group: "Access", rows: [
      { profile: "manage_user", label: "User Management" },
      { profile: "designation", label: "Access Profiles" },
    ] },
    { group: "Workflow", rows: [
      { profile: "approval_flow",   label: "Approval Flow" },
      { profile: "request_handler", label: "Request Handler" },
    ] },
    { group: "System", rows: [
      { profile: "serialization",   label: "Numbering" },
      { profile: "mail_management", label: "Mail" },
    ] },
  ] },
  { section: "My Profile", rows: [
    { profile: "delegation", label: "Delegation" },
  ] },
];

// Tabs that work per project: each picks its own projects next to its
// permissions ("Projects ▾", saved as the permission's scope —
// sql/permission_scope.sql). Orders and Petty Cash also list offices.
export const SCOPE_PICKER_KEYS = ["view_3d", "intake", "order", "staff_attendance", "expense_book", "petty_cash_staff", "petty_cash_accounts"];
export const OFFICE_SCOPE_KEYS = ["order", "petty_cash_staff", "petty_cash_accounts"];

// module key → name as shown on the permission screen ("Inbox › Orders")
// (module rows only — profile rows aren't modules)
const moduleRows = (rows) => rows.filter(r => r.key || r.group);
export const MODULE_TAB_LABELS = Object.fromEntries(PERMISSION_LAYOUT.flatMap(s => moduleRows(s.rows).flatMap(r =>
  r.group ? r.rows.filter(x => x.key).map(x => [x.key, `${r.group} › ${x.label}`]) : [[r.key, r.label]])));

// Same layout as { section, groups: [{ label, keys }] } — used by Control
// Center and for "every key on the screen". A plain row is a group of one.
export const MODULE_SECTIONS = PERMISSION_LAYOUT.map(s => ({
  section: s.section,
  groups: moduleRows(s.rows)
    .map(r => (r.group ? { label: r.group, keys: r.rows.filter(x => x.key).map(x => x.key) } : { label: r.label, keys: [r.key] }))
    .filter(g => g.keys.length),
})).filter(s => s.groups.length);

export const PERM_COLOR = {
  can_view:              "text-slate-600",
  can_add:               "text-emerald-600",
  can_edit:              "text-amber-600",
  can_delete:            "text-rose-600",
  can_trash:             "text-rose-400",
  can_export:            "text-indigo-600",
  can_bulk_upload:       "text-cyan-600",
  can_log:               "text-teal-600",
  can_manage_columns:    "text-fuchsia-600",
  can_download_document: "text-sky-600",
  can_take_action:       "text-blue-600",
  can_submit:            "text-green-600",
  can_approve:           "text-emerald-700",
  can_reject:            "text-red-600",
  can_revert:            "text-orange-600",
  can_request:           "text-amber-500",
  can_request_recall:    "text-amber-600",
  can_request_amend:     "text-amber-700",
  can_request_cancel:    "text-orange-600",
  can_withdraw:          "text-slate-500",
  can_withdraw_recall:   "text-slate-600",
  can_withdraw_amend:    "text-slate-600",
  can_withdraw_cancel:   "text-slate-600",
  can_withdraw_submission:    "text-slate-600",
};

export const GLOBAL_DASHBOARD_ORDER_KEYS = ["order_overview_aging", "order_intake", "order_payment"];

export const GLOBAL_DASHBOARD_ORDER_LABELS = {
  order_overview_aging: "Overview and aging",
  order_intake: "Intake",
  order_payment: "Payment",
};

export const isModuleBuilt = (key) => MODULE_BUILT_STATUS[key] !== false;

export const getModulePerms = (key) =>
  isModuleBuilt(key)
    ? (MODULE_PERM_CONFIG[key] || DEFAULT_MODULE_PERMS)
    : ["can_view"];

export const makeBlankModule = (m) => {
  const row = {
    module_id:   m.id,
    module_key:  m.module_key,
    module_name: m.module_name,
    can_view: false, can_add: false, can_edit: false, can_delete: false,
    can_trash: false, can_bulk_upload: false, can_export: false,
    can_log: false, can_manage_columns: false, can_download_document: false,
    can_take_action: false, can_submit: false, can_approve: false,
    can_reject: false, can_revert: false,
    can_request: false, can_request_recall: false, can_request_amend: false, can_request_cancel: false,
    can_withdraw: false, can_withdraw_recall: false, can_withdraw_amend: false, can_withdraw_cancel: false, can_withdraw_submission: false,
  };
  if (m.module_key === "global_dashboard") {
    GLOBAL_DASHBOARD_ORDER_KEYS.forEach((k) => { row[k] = false; });
  }
  return row;
};

export const getModulePermKeysFull = (m) => {
  const keys = [...getModulePerms(m.module_key)];
  if (m.module_key === "global_dashboard") {
    GLOBAL_DASHBOARD_ORDER_KEYS.forEach((k) => {
      if (!keys.includes(k)) keys.push(k);
    });
  }
  return keys;
};
