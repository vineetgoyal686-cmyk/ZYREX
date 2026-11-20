const admin = require("./supabaseHelper");

/*
 * Control Center — tab owners (module_owners table).
 *
 * A module with at least one owner is "controlled":
 *  - only its owners and Global Admin can grant / change / remove its
 *    permissions (per-user, in Access Profiles, or via profile apply/sync);
 *  - no role bypass applies to it — super_admin/admin need it granted like
 *    anyone else (same rule Treasury already had);
 *  - its owners get full access to it automatically.
 * Modules without owners behave exactly as before.
 */

// Boolean columns of the permissions table
const PERM_COLUMNS = [
  "can_view","can_add","can_edit","can_delete","can_bulk_upload","can_export",
  "can_download_document","can_issue","can_recall","can_reject","can_revert",
  "can_cancel","can_manage_amend","can_log","can_manage_columns","can_trash","can_take_action",
  "can_submit","can_approve","can_request","can_withdraw",
  "can_request_recall","can_request_amend","can_request_cancel",
  "can_withdraw_recall","can_withdraw_amend","can_withdraw_cancel","can_withdraw_submission",
  "can_trash_view","can_trash_log","can_trash_restore","can_trash_delete",
  "order_overview_aging","order_intake","order_payment",
];

const CACHE_TTL = 30 * 1000;
let cache = null;
let cacheAt = 0;

// { module_key: [user_id, ...] } — cached briefly, every permission check reads it
const getOwnerMap = async () => {
  if (cache && Date.now() - cacheAt < CACHE_TTL) return cache;
  const { data, error } = await admin.from("module_owners").select("module_key, user_id");
  // Table not created yet (SQL not run) → nothing is controlled
  if (error) return {};
  const map = {};
  (data || []).forEach(r => { (map[r.module_key] = map[r.module_key] || []).push(r.user_id); });
  cache = map;
  cacheAt = Date.now();
  return map;
};

const bustOwnerCache = () => { cache = null; };

const isControlled = (map, key) => (map[key] || []).length > 0;
const isOwner      = (map, key, userId) => (map[key] || []).includes(userId);

// Can this user grant / change / remove permissions on this module?
const canGrant = (map, user, key) =>
  user.role === "global_admin" || !isControlled(map, key) || isOwner(map, key, user.id);

/*
 * Modules this user may NOT touch (controlled, and not their own), as a Map
 * of String(module_id) → module_id. Check with locked.has(String(id)).
 */
const lockedModuleIds = async (user) => {
  if (user.role === "global_admin") return new Map();
  const map = await getOwnerMap();
  if (!Object.keys(map).length) return new Map();
  const { data } = await admin.from("modules").select("id, module_key");
  return new Map(
    (data || []).filter(m => !canGrant(map, user, m.module_key)).map(m => [String(m.id), m.id])
  );
};

/*
 * Marks each merged app_permissions row with `controlled` (so the frontend
 * drops its role bypass for it) and turns everything on for modules the user
 * owns. Rows must carry module_key.
 */
const applyOwnership = (rows, map, userId, boolKeys) => rows.map(r => {
  const controlled = isControlled(map, r.module_key);
  if (!controlled) return r;
  const out = { ...r, controlled: true };
  if (isOwner(map, r.module_key, userId)) {
    out.is_owner = true;
    boolKeys.forEach(k => { out[k] = true; });
  }
  return out;
});

/*
 * Changing a user's Access Profiles must not grant or take away a locked
 * module. For every locked module the user has no own row for yet, pin its
 * current (old-profile) value as an own row — own rows override profiles.
 */
const freezeLockedForProfileChange = async (caller, targetId, oldProfileIds = [], newProfileIds = []) => {
  const locked = await lockedModuleIds(caller);
  if (!locked.size) return;
  const same = oldProfileIds.length === newProfileIds.length && oldProfileIds.every(id => newProfileIds.includes(id));
  if (same) return;

  const { data: own } = await admin.from("permissions").select("module_id").eq("user_id", targetId);
  const hasOwn = new Set((own || []).map(p => String(p.module_id)));
  const toPin = [...locked.values()].filter(id => !hasOwn.has(String(id)));
  if (!toPin.length) return;

  let oldPerms = [];
  if (oldProfileIds.length) {
    const { data: designations } = await admin.from("designations").select("app_permissions").in("id", oldProfileIds);
    oldPerms = (designations || []).flatMap(d => d.app_permissions || []);
  }

  const rows = toPin.map(moduleId => {
    const row = { user_id: targetId, module_id: moduleId };
    const matches = oldPerms.filter(p => String(p.module_id) === String(moduleId));
    PERM_COLUMNS.forEach(k => { row[k] = matches.some(p => !!p[k]); });
    return row;
  });
  await admin.from("permissions").upsert(rows, { onConflict: "user_id,module_id" });
};

/*
 * Puts users back on their Access Profiles: deletes their own permission
 * rows, so every module falls back to the profile(s) again (see
 * permHelper.checkPermission). Rows for Control Center tabs the caller
 * doesn't own are kept — only their owners may change those.
 */
const clearOwnPerms = async (caller, userIds = []) => {
  if (!userIds.length) return;
  const locked = await lockedModuleIds(caller);
  let del = admin.from("permissions").delete().in("user_id", userIds);
  if (locked.size) del = del.not("module_id", "in", `(${[...locked.keys()].join(",")})`);
  const { error } = await del;
  if (error) throw error;
};

/*
 * Settings-page permissions (users.profile_permissions sections such as
 * manage_user: {view, edit, …}) a user gets from these Access Profiles:
 * a key is on when any of the profiles has it on. Everything else stored in
 * that column (ui, allowed_projects, other flags) is kept as it is.
 */
const isSection = (v) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length > 0 && Object.values(v).every(x => typeof x === "boolean");

const settingsPermsFromProfiles = async (existing = {}, profileIds = []) => {
  let profiles = [];
  if (profileIds.length) {
    const { data } = await admin.from("designations").select("profile_permissions").in("id", profileIds);
    profiles = (data || []).map(d => d.profile_permissions || {});
  }
  const out = { ...(existing || {}) };
  const keys = new Set([
    ...Object.keys(out).filter(k => k !== "ui" && isSection(out[k])),
    ...profiles.flatMap(pp => Object.keys(pp).filter(k => k !== "ui" && isSection(pp[k]))),
  ]);
  keys.forEach(sec => {
    const merged = {};
    Object.keys(out[sec] || {}).forEach(k => { merged[k] = false; });
    profiles.forEach(pp => Object.entries(pp[sec] || {}).forEach(([k, v]) => { merged[k] = !!merged[k] || !!v; }));
    out[sec] = merged;
  });
  return out;
};

const sameIds = (a = [], b = []) => a.length === b.length && a.every(id => b.includes(id));

module.exports = {
  PERM_COLUMNS, getOwnerMap, bustOwnerCache, isControlled, isOwner, canGrant,
  lockedModuleIds, applyOwnership, freezeLockedForProfileChange,
  clearOwnPerms, settingsPermsFromProfiles, sameIds,
};
