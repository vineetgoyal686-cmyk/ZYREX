import { TAB_MODULE_KEY } from "./tabModuleKeys";
import { TABS } from "./navConfig";
import { settingsAccess } from "../pages/Settings/access";

// Sidebar tabs driven by several modules (visible if any one is granted)
const TAB_GROUP_KEYS = {
  approvals:              ["inbox_orders", "inbox_intakes", "inbox_payments"],
  expenses__petty_cash:   ["petty_cash_staff", "petty_cash_accounts"],
  proc_setup__item_list:  ["item_supply", "item_sitc"],
};

// HRMS / company tabs → module key. These used to live inside the
// Organisation page, which hid a tab unless it was granted (no fail-open).
const ORG_TAB_MODULE = {
  employees: "employees", divisions: "divisions", departments: "departments",
  sub_departments: "teams", grades: "grades", designations: "designations",
  structure: "structure", org_chart: "org_chart", policy: "policy", sop: "sop",
  locations: "locations",
};

/*
 * Same rules the old Sidebar used, per tab. `perms` is App's
 * userTabPermissions ({ map: { module_key: row } }).
 */
function baseVisible(tabId, user, perms) {
  const role = user?.role;
  const isGlobalAdmin = role === "global_admin";
  const isSuperOrGlobal = isGlobalAdmin || role === "super_admin";
  const map = perms?.map || {};

  if (tabId === "inventory") return true;

  // Settings / Profile sections follow the Settings page's own rules
  const t = TABS[tabId];
  if (t?.settings) return !!settingsAccess(user)[t.settings];
  // Company list was reachable by everyone (Organisation tab had no module)
  if (tabId === "settings__company") return true;

  // Treasury is executive-only: only global_admin
  // bypasses, everyone else needs it granted. Loans & EMI and Masters ride
  // on the Party Ledger permission.
  if (tabId === "treasury__overview" || tabId === "treasury__ledger" || tabId === "treasury__loans" || tabId === "treasury__masters") {
    if (isGlobalAdmin) return true;
    return map[tabId === "treasury__overview" ? "treasury_overview" : "treasury_ledger"]?.can_view === true;
  }

  // HRMS / Branch: hidden unless granted (super/global bypass unless controlled)
  if (t?.orgTab) {
    const key = ORG_TAB_MODULE[t.orgTab];
    if (!key) return true; // Offer & Appointment had no permission of its own
    const p = map[key] || {};
    if (isGlobalAdmin) return true;
    if (role === "super_admin" && !p.controlled) return true;
    return !!p.can_view;
  }

  // Control Center tabs: no role bypass (super_admin included)
  if (!isGlobalAdmin) {
    const keys = TAB_GROUP_KEYS[tabId] || (TAB_MODULE_KEY[tabId] ? [TAB_MODULE_KEY[tabId]] : []);
    if (keys.length && keys.every(k => map[k]?.controlled)) return keys.some(k => map[k]?.can_view === true);
  }
  if (isSuperOrGlobal) return true;
  if (!perms) return false;
  // Inbox, Petty Cash and Material Catalog: visible if any of their modules is granted
  if (TAB_GROUP_KEYS[tabId]) return TAB_GROUP_KEYS[tabId].some(k => map[k]?.can_view === true);
  // Expenses tabs and ZyAI are hidden unless explicitly granted
  if (tabId.startsWith("expenses__") || tabId === "zyhawk_ai") return map[TAB_MODULE_KEY[tabId]]?.can_view === true;
  const moduleKey = TAB_MODULE_KEY[tabId];
  if (!moduleKey) return true;
  const perm = map[moduleKey];
  if (!perm) return true;
  return perm.can_view === true;
}

// Orders / Intake: one project needs the project permission, all projects
// needs the old Master Data permission
export function projectScopeAccess(tabId, user, perms) {
  if (tabId === "procurement__orders")
    return { one: baseVisible("procurement__orders", user, perms), all: baseVisible("master_data__orders", user, perms) };
  if (tabId === "procurement__intake")
    return { one: baseVisible("procurement__intake", user, perms), all: baseVisible("master_data__intakes", user, perms) };
  return { one: baseVisible(tabId, user, perms), all: false };
}

export function isTabVisible(tabId, user, perms) {
  // A hub (Registration) shows if any list under it does
  const children = Object.keys(TABS).filter(id => TABS[id].parent === tabId);
  if (children.length) return children.some(id => isTabVisible(id, user, perms));
  if (tabId === "procurement__orders" || tabId === "procurement__intake") {
    const a = projectScopeAccess(tabId, user, perms);
    return a.one || a.all;
  }
  return baseVisible(tabId, user, perms);
}
