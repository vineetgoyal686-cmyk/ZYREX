/* Request Handlers — who handles each module action (issue / recall / amend / cancel).
   Each action has one Default row (company_id = null) and may have a row per company.
   A company row with at least one user overrides the Default for that company's
   orders; otherwise the Default handlers apply. */
const admin = require("../helpers/supabaseHelper");

const sameId = (a, b) => String(a) === String(b);

async function loadRows(moduleKey, actionKey) {
  const { data } = await admin.from("request_handlers")
    .select("company_id, users").eq("module_key", moduleKey).eq("action_key", actionKey);
  return data || [];
}

/** Handler users ([{id, name}]) for a company: its own list if set, else the Default list. */
function pickUsers(rows, companyId) {
  if (companyId) {
    const own = rows.find(r => r.company_id && sameId(r.company_id, companyId));
    if (own?.users?.length) return own.users;
  }
  return rows.find(r => !r.company_id)?.users || [];
}

async function resolveHandlers(moduleKey, actionKey, companyId) {
  return pickUsers(await loadRows(moduleKey, actionKey), companyId);
}

/** True if userId handles this action for the given company (Default applies when the company has none). */
async function isHandlerFor(userId, moduleKey, actionKey, companyId) {
  const users = await resolveHandlers(moduleKey, actionKey, companyId);
  return users.some(u => sameId(u.id, userId));
}

/** True if userId handles this action for at least one company (or the Default). */
async function isHandlerAnywhere(userId, moduleKey, actionKey) {
  const rows = await loadRows(moduleKey, actionKey);
  return rows.some(r => (r.users || []).some(u => sameId(u.id, userId)));
}

async function orderCompanyId(orderId) {
  if (!orderId) return null;
  const { data } = await admin.schema("procurement").from("purchase_orders")
    .select("company_id").eq("id", orderId).maybeSingle();
  return data?.company_id || null;
}

module.exports = { pickUsers, resolveHandlers, isHandlerFor, isHandlerAnywhere, orderCompanyId };
