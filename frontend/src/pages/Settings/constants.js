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
  can_export:            "Export",
  can_bulk_upload:       "Bulk Upload",
  can_log:               "Log",
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
  organisation:            ["can_view"],
  audit:                   ["can_view"],
  inbox_orders:            ["can_view", "can_take_action"],
  inbox_intakes:           ["can_view", "can_take_action"],
  inbox_payments:          ["can_view", "can_take_action"],
  company_list:            ["can_view", "can_add", "can_edit", "can_delete", "can_export", "can_log"],
  site_list:               ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  vendor_list:             ["can_view", "can_add", "can_edit", "can_delete", "can_trash", "can_bulk_upload", "can_export", "can_log"],
  vendor_pool:             ["can_view", "can_add", "can_edit", "can_delete", "can_trash", "can_bulk_upload", "can_export", "can_log"],
  item_supply:             ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  item_sitc:               ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  contact_list:            ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  category_list:           ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  uom:                     ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  term_condition:          ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  payment_terms:           ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  government_laws:         ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  annexure:                ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export", "can_log"],
  master_data_vendor:      ["can_view", "can_export"],
  master_data_products:    ["can_view", "can_export"],
  master_data_intakes:     ["can_view", "can_export"],
  master_data_orders_tab:  ["can_view", "can_add", "can_bulk_upload", "can_export"],
  master_data_clauses:     ["can_view", "can_export"],
  dashboard:               ["can_view"],
  view_3d:                 ["can_view"],
  intake:                  ["can_view"],
  order:                   ["can_view", "can_add", "can_edit", "can_delete",
                            "can_request_recall", "can_request_amend", "can_request_cancel",
                            "can_withdraw_recall", "can_withdraw_amend", "can_withdraw_cancel", "can_withdraw_submission",
                            "can_export", "can_download_document", "can_bulk_upload"],
  received_record:         ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  stock_available:         ["can_view", "can_export"],
  consumption_record:      ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  execution_plan:          ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  staff_attendance:        ["can_view", "can_add", "can_edit", "can_delete", "can_bulk_upload", "can_export"],
  daily_manpower:          ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  payment_request:         ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  site_expense:            ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  petty_cash:              ["can_view", "can_add", "can_edit", "can_delete", "can_export"],
  bills_docs:              ["can_view", "can_add", "can_delete", "can_download_document"],
  loa:                     ["can_view", "can_add", "can_edit", "can_delete", "can_download_document"],
  boq:                     ["can_view", "can_add", "can_edit", "can_delete", "can_download_document"],
  drawings:                ["can_view", "can_add", "can_delete", "can_download_document"],
  ra_bills:                ["can_view", "can_add", "can_edit", "can_delete", "can_download_document"],
};

export const DEFAULT_MODULE_PERMS = ["can_view", "can_add", "can_edit", "can_delete", "can_export"];

export const MODULE_BUILT_STATUS = {
  global_dashboard: true, inbox: true, audit: true, annexure: true,
  master_data_vendor: true, master_data_products: true,
  master_data_orders: true, master_data_intakes: true, master_data_clauses: true,
  dashboard: true, view_3d: true,
  intake: true, order: true,
  company_list: true, vendor_list: true, site_list: true, uom: true,
  category_list: true, item_list: true, contact_list: true,
  term_condition: true, payment_terms: true, government_laws: true,
  loa: true, boq: true, drawings: true, ra_bills: true,
  site_expense: true, petty_cash: true, bills_docs: true, payment_request: true,
  execution_plan: true, daily_manpower: true, staff_attendance: true,
  received_record: true, stock_available: true, consumption_record: true,
};

export const MODULE_SECTIONS = [
  {
    section: "Global Tab",
    groups: [
      { label: "Global Dashboard",   keys: ["global_dashboard"] },
      { label: "Inbox",             keys: ["inbox_orders","inbox_intakes","inbox_payments"] },
    ],
  },
  {
    section: "Management",
    groups: [
      { label: "Setup", keys: ["company_list","site_list","vendor_list","vendor_pool","item_supply","item_sitc","uom","category_list","contact_list","term_condition","payment_terms","government_laws","annexure"] },
      { label: "Master Data",       keys: ["master_data_vendor","master_data_products","master_data_orders_tab","master_data_intakes","master_data_clauses"] },
      { label: "Organisation", keys: ["organisation"], single: true },
      { label: "Audit",        keys: ["audit"],        single: true },
    ],
  },
  {
    section: "Project Permissions",
    groups: [
      { label: "Dashboard",   keys: ["dashboard"],     single: true },
      { label: "3D View",     keys: ["view_3d"],       single: true },
      { label: "Procurement", keys: ["order","intake"] },
      { label: "Inventory",    keys: ["received_record","stock_available","consumption_record"], combined_view: true },
      { label: "Operations",   keys: ["execution_plan","staff_attendance","daily_manpower"],      combined_view: true },
      { label: "Finance",      keys: ["payment_request","site_expense","petty_cash","bills_docs"], combined_view: true },
      { label: "Confidential", keys: ["loa","boq","drawings","ra_bills"],                          combined_view: true },
    ],
  },
];

export const PERM_COLOR = {
  can_view:              "text-slate-600",
  can_add:               "text-emerald-600",
  can_edit:              "text-amber-600",
  can_delete:            "text-rose-600",
  can_trash:             "text-rose-400",
  can_export:            "text-indigo-600",
  can_bulk_upload:       "text-cyan-600",
  can_log:               "text-teal-600",
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
    can_log: false, can_download_document: false,
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
