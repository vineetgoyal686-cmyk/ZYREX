const admin = require("./supabaseHelper");

const BYPASS_ROLES = ["global_admin", "super_admin", "admin"];

const decodeToken = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch { return null; }
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

  const { data: user } = await admin.from("users").select("id, role, is_active, access_profile_ids").eq("id", payload.sub).single();
  if (!user || !user.is_active) return res.status(403).json({ error: "Account inactive" });

  // Admin roles bypass all module-level permission checks
  if (BYPASS_ROLES.includes(user.role)) {
    req._authUserId   = user.id;
    req._authUserRole = user.role;
    return next();
  }

  const { data: mod } = await admin.from("modules").select("id").eq("module_key", moduleKey).maybeSingle();
  if (!mod) {
    return res.status(403).json({ error: `Permission denied: you don't have '${permKey}' access on '${moduleKey}'` });
  }

  const { data: perm } = await admin
    .from("permissions")
    .select(permKey + ", user_id")
    .eq("user_id", user.id)
    .eq("module_id", mod.id)
    .maybeSingle();

  // A saved per-user row fully decides the outcome for this module (even to
  // restrict below what the Access Profile grants); only fall back to the
  // profile when the user has never had this module explicitly set.
  let allowed = perm ? !!perm[permKey] : false;
  if (!perm && user.access_profile_ids?.length > 0) {
    const { data: designations } = await admin
      .from("designations")
      .select("app_permissions")
      .in("id", user.access_profile_ids);
    const profilePerms = (designations || []).flatMap(d => d.app_permissions || []);
    allowed = profilePerms.some(p => p.module_id === mod.id && !!p[permKey]);
  }

  if (!allowed) {
    return res.status(403).json({
      error: `Permission denied: you don't have '${permKey}' access on '${moduleKey}'`,
    });
  }

  req._authUserId   = user.id;
  req._authUserRole = user.role;
  next();
};

module.exports = { requirePerm };
