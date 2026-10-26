const admin = require("./supabaseHelper");
const { getOwnerMap, isOwner } = require("./controlHelper");

/*
 * Which projects a user may see in one tab (sql/permission_scope.sql).
 *
 * A tab's permission can carry a scope: {"all": true} or
 * {"projects": [ids]}. The user's own permission row decides; without one,
 * their Access Profiles' scopes are joined. When no scope is set anywhere
 * the old rule applies: the user's Project Access lists (own + profiles),
 * an empty list meaning every project, and `legacyAllKey` (the old "All
 * projects" permission) also meaning every project.
 *
 * Returns null for "every project", else a Set holding each allowed
 * project's id AND code, lower-cased (some tables keep the code, e.g.
 * Attendance's project_id = "B47"); offices (Petty Cash) by id. Check with
 * allows(scope, …values).
 */
// like the old Project Access rule: only these two see every project
const BYPASS_ROLES = ["global_admin", "super_admin"];

const fromScopes = (scopes) => {
  if (scopes.some(s => s?.all)) return null;
  return scopes.flatMap(s => s?.projects || []).map(String);
};

// ids → Set of ids + project codes, lower-cased
const withCodes = async (ids) => {
  const set = new Set(ids.map(v => v.toLowerCase()));
  const uuids = ids.filter(v => /^[0-9a-f-]{36}$/i.test(v));
  if (uuids.length) {
    const { data } = await admin.from("projects").select("project_code").in("id", uuids);
    (data || []).forEach(p => p.project_code && set.add(String(p.project_code).toLowerCase()));
  }
  return set;
};

const allows = (scope, ...values) => !scope || values.some(v => v != null && v !== "" && scope.has(String(v).toLowerCase()));

// legacy: false — a tab that never had the old Project Access rule (Petty
// Cash): no scope set means every project
async function projectScope(userId, moduleKey, legacyAllKey, { legacy = true } = {}) {
  const ids = await scopeIds(userId, moduleKey, legacyAllKey, legacy);
  return ids === null ? null : withCodes(ids);
}

async function scopeIds(userId, moduleKey, legacyAllKey, legacy) {
  const { data: user } = await admin.from("users")
    .select("id, role, access_profile_ids, profile_permissions").eq("id", userId).maybeSingle();
  if (!user) return [];
  if (BYPASS_ROLES.includes(user.role)) return null;
  if (isOwner(await getOwnerMap(), moduleKey, user.id)) return null;

  const keys = [moduleKey, legacyAllKey].filter(Boolean);
  const { data: mods } = await admin.from("modules").select("id, module_key").in("module_key", keys);
  const idOf = Object.fromEntries((mods || []).map(m => [m.module_key, m.id]));

  const [{ data: rows }, { data: profiles }] = await Promise.all([
    admin.from("permissions").select("*").eq("user_id", user.id).in("module_id", Object.values(idOf)),
    user.access_profile_ids?.length
      ? admin.from("designations").select("app_permissions, project_access").in("id", user.access_profile_ids)
      : Promise.resolve({ data: [] }),
  ]);
  const own = (rows || []).find(r => r.module_id === idOf[moduleKey]);
  const profileEntries = (profiles || []).flatMap(d => d.app_permissions || []).filter(p => p.module_id === idOf[moduleKey]);

  // 1. scope set on the user's own row, else on their profiles
  if (own?.scope) return fromScopes([own.scope]);
  const profileScopes = profileEntries.map(p => p.scope).filter(Boolean);
  if (!own && profileScopes.length) return fromScopes(profileScopes);

  // 2. old rule
  if (!legacy) return null;
  if (legacyAllKey && idOf[legacyAllKey]) {
    const legacyOwn = (rows || []).find(r => r.module_id === idOf[legacyAllKey]);
    const legacyAll = legacyOwn ? !!legacyOwn.can_view
      : (profiles || []).flatMap(d => d.app_permissions || []).some(p => p.module_id === idOf[legacyAllKey] && p.can_view);
    if (legacyAll) return null;
  }
  const list = [...(user.profile_permissions?.allowed_projects || []), ...(profiles || []).flatMap(d => d.project_access || [])];
  return list.length ? list.map(String) : null;
}

const userIdFrom = (req) => {
  if (req._verifiedUserId) return req._verifiedUserId;
  try {
    const token = req.headers.authorization?.split(" ")[1];
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub || null;
  } catch { return null; }
};

module.exports = { projectScope, allows, userIdFrom };
