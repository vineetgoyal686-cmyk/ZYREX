const admin = require("./supabaseHelper");
const { getOwnerMap, isControlled, isOwner } = require("./controlHelper");

const BYPASS_ROLES = ["global_admin", "super_admin", "admin"];

// Every guarded request used to run up to 4 queries (user, module, permission
// row, access profiles). Short caches cut that: module ids hardly ever change;
// users and their permissions are held 30s, so a permission change takes at
// most 30s to apply.
const SHORT_TTL  = 30 * 1000;
const MODULE_TTL = 5 * 60 * 1000;
const memo = new Map(); // key -> { value, at, ttl }
const cached = async (key, ttl, load) => {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;
  const value = await load();
  memo.set(key, { value, at: Date.now(), ttl });
  return value;
};

const getUser = (id) => cached(`user:${id}`, SHORT_TTL, async () =>
  (await admin.from("users").select("id, role, is_active, access_profile_ids").eq("id", id).single()).data || null);

const getModuleId = async (moduleKey) => {
  const ids = await cached("modules", MODULE_TTL, async () => {
    const { data } = await admin.from("modules").select("id, module_key");
    return Object.fromEntries((data || []).map(m => [m.module_key, m.id]));
  });
  return ids[moduleKey];
};

// All of a user's own permission rows, by module id
const getOwnPerms = (userId) => cached(`perms:${userId}`, SHORT_TTL, async () => {
  const { data } = await admin.from("permissions").select("*").eq("user_id", userId);
  return Object.fromEntries((data || []).map(p => [String(p.module_id), p]));
});

const getProfilePerms = (ids) => cached(`profiles:${[...ids].sort().join(",")}`, SHORT_TTL, async () => {
  const { data } = await admin.from("designations").select("app_permissions").in("id", ids);
  return (data || []).flatMap(d => d.app_permissions || []);
});

const decodeToken = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch { return null; }
};

/**
 * Core check, reusable both as middleware (requirePerm) and inline (hasPerm)
 * when a route needs to pick the permKey dynamically from the request body
 * (e.g. "can_request_recall" vs "can_request_cancel" based on request_type).
 * `user` must already include { id, role, access_profile_ids }.
 */
const checkPermission = async (user, moduleKey, permKey) => {
  // Treasury is executive-only — only global_admin bypasses (unlike every
  // other module, where super_admin/admin bypass too). Everyone else needs
  // the permission explicitly granted, per-user or via an Access Profile.
  // Control Center tabs follow the same rule, and their owners get full access.
  const owners = await getOwnerMap();
  if (isOwner(owners, moduleKey, user.id)) return true;
  const noBypass = moduleKey.startsWith("treasury") || isControlled(owners, moduleKey);
  const bypassAllowed = noBypass ? user.role === "global_admin" : BYPASS_ROLES.includes(user.role);
  if (bypassAllowed) return true;

  const modId = await getModuleId(moduleKey);
  if (modId == null) return false;

  const perm = (await getOwnPerms(user.id))[String(modId)];

  // A saved per-user row fully decides the outcome for this module (even to
  // restrict below what the Access Profile grants); only fall back to the
  // profile when the user has never had this module explicitly set.
  let allowed = perm ? !!perm[permKey] : false;
  if (!perm && user.access_profile_ids?.length > 0) {
    const profilePerms = await getProfilePerms(user.access_profile_ids);
    allowed = profilePerms.some(p => p.module_id === modId && !!p[permKey]);
  }
  return allowed;
};

/**
 * Express middleware factory.
 * requirePerm("order", "can_add") → 403 if user role is "user" and has no can_add on order module.
 * Admin roles (global_admin, super_admin, admin) always pass.
 */
const requirePerm = (moduleKey, permKey) => async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });

  const payload = decodeToken(token);
  if (!payload?.sub) return res.status(401).json({ error: "Invalid token" });
  if (payload.exp && payload.exp * 1000 < Date.now()) return res.status(401).json({ error: "Token expired" });

  const user = await getUser(payload.sub);
  if (!user || !user.is_active) return res.status(403).json({ error: "Account inactive" });

  const allowed = await checkPermission(user, moduleKey, permKey);
  if (!allowed) {
    return res.status(403).json({
      error: `Permission denied: you don't have '${permKey}' access on '${moduleKey}'`,
    });
  }

  req._authUserId   = user.id;
  req._authUserRole = user.role;
  next();
};

/**
 * Inline check for routes where the permKey depends on the request body
 * (decided only after req.body is available, so it can't be a fixed-permKey
 * middleware). Looks the user up itself — call with just (userId, moduleKey, permKey).
 */
const hasPerm = async (userId, moduleKey, permKey) => {
  const user = await getUser(userId);
  if (!user || !user.is_active) return false;
  return checkPermission(user, moduleKey, permKey);
};

module.exports = { requirePerm, hasPerm };
