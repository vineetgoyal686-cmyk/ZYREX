const express = require("express");
const router  = express.Router();
const { createSignedStorageUrl, removeStorageFile } = require("../helpers/storageHelper");
const admin = require("../helpers/supabaseHelper");
const { sendTemplateEmail } = require("../utils/mailer");
const getAdminClient = () => admin;
const { requireAuth, bustUserCache } = require("../middleware/auth");

const requireAdminOrAbove = (req, res, next) => {
  if (!["global_admin", "super_admin", "admin"].includes(req.user.role))
    return res.status(403).json({ error: "Access denied" });
  next();
};

const requireGlobalAdmin = (req, res, next) => {
  if (req.user.role !== "global_admin")
    return res.status(403).json({ error: "Sirf Global Admin yeh kar sakta hai" });
  next();
};

/* GET /api/users */
router.get("/", requireAuth, async (req, res) => {
  const pp = req.user.profile_permissions || {};
  const isAuthorized = ["global_admin", "super_admin", "admin"].includes(req.user.role) || 
                       (pp.manage_user?.view === true);

  if (!isAuthorized) return res.status(403).json({ error: "Access denied" });

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, name, email, contact_no, designation, designation_id, access_profile_ids, department, role, is_active, avatar, created_at, can_manage_roles")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // global_admin users are invisible to everyone except other global_admins
  const isGlobalAdmin = req.user.role === "global_admin";
  const visible = (data || []).filter(u => isGlobalAdmin || u.role !== "global_admin");

  const users = await Promise.all(visible.map(async user => {
    const pp = user.profile_permissions || {};
    const sigFile = pp.ui?.signature || null;
    const [signedAvatar, signedSignature] = await Promise.all([
      createSignedStorageUrl(admin, "picture", user.avatar),
      sigFile ? createSignedStorageUrl(admin, "picture", sigFile) : Promise.resolve(null),
    ]);
    return { ...user, avatar: signedAvatar, signature: signedSignature };
  }));
  res.json({ users });
});

const ROLE_DEFAULT_PERMS = {
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
};

/* POST /api/users — invite */
router.post("/", requireAuth, requireAdminOrAbove, async (req, res) => {
  let { name, email, contact_no, designation, designation_id, access_profile_ids, department, role, profile_permissions } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name aur email required hai" });
  email = email.toLowerCase().trim();

  // global_admin role KABHI bhi app se assign nahi hoga — sirf Supabase Dashboard se
  if (role === "global_admin")
    return res.status(403).json({ error: "Global Admin sirf database se set hota hai" });
  // Only global_admin can assign super_admin
  if (role === "super_admin" && req.user.role !== "global_admin")
    return res.status(403).json({ error: "Sirf Global Admin, Super Admin bana sakta hai" });
  // admin can only create plain users
  if (req.user.role === "admin" && role === "admin")
    return res.status(403).json({ error: "Sirf Global Admin ya Super Admin, Admin bana sakta hai" });
  // super_admin can create admin and user, not super_admin
  if (req.user.role === "super_admin" && role === "super_admin")
    return res.status(403).json({ error: "Sirf Global Admin, Super Admin bana sakta hai" });

  const admin = getAdminClient();

  // Check if user already exists in our users table
  const { data: existingUser } = await admin.from("users").select("id, email").eq("email", email).maybeSingle();
  if (existingUser) return res.status(409).json({ error: "Yeh email already registered hai. Resend invite use karo." });

  const { data: authData, error: authError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { name }, redirectTo: process.env.FRONTEND_URL + "/app.html" },
  });
  if (authError) return res.status(400).json({ error: authError.message });

  // upsert instead of insert — handles rare case where auth user exists but profile row doesn't
  const { data: profile, error: profileError } = await admin.from("users").upsert({
    id:                  authData.user.id,
    name,
    email,
    contact_no:          contact_no          || "",
    designation:         designation         || "",
    designation_id:      designation_id      || null,
    access_profile_ids:  access_profile_ids  || [],
    department:          department          || "",
    role:                role                || "user",
    profile_permissions: profile_permissions ?? ROLE_DEFAULT_PERMS[role] ?? null,
    created_by_id:       req.body.createdById || null,
    created_by_name:     req.body.createdByName || null,
  }, { onConflict: "id" }).select().single();

  if (profileError) return res.status(500).json({ error: profileError.message });

  // Invite email ZeptoMail se bhejo
  const inviteLink = authData?.properties?.action_link;
  if (inviteLink) {
    sendTemplateEmail({
      to:          email,
      toName:      name || email,
      templateKey: process.env.ZEPTOMAIL_TEMPLATE_INVITE,
      mergeInfo:   { name: name || email, invite_link: inviteLink },
    }).catch(err => console.error("Invite email error:", err));
  }

  res.json({ success: true, user: profile });
});

/* POST /api/users/:id/resend-invite */
router.post("/:id/resend-invite", requireAuth, requireAdminOrAbove, async (req, res) => {
  const { id } = req.params;
  const admin = getAdminClient();
  const { data: user, error: fetchErr } = await admin.from("users").select("email, name").eq("id", id).single();
  if (fetchErr || !user) return res.status(404).json({ error: "User not found" });

  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: user.email,
    options: { redirectTo: process.env.FRONTEND_URL + "/app.html" },
  });
  if (error) return res.status(400).json({ error: error.message });

  const inviteLink = linkData?.properties?.action_link;
  if (inviteLink) {
    sendTemplateEmail({
      to:          user.email,
      toName:      user.name || user.email,
      templateKey: process.env.ZEPTOMAIL_TEMPLATE_INVITE,
      mergeInfo:   { name: user.name || user.email, invite_link: inviteLink },
    }).catch(err => console.error("Resend invite email error:", err));
  }

  res.json({ success: true });
});

/* POST /api/users/:id/signature — admin uploads signature on behalf of user */
router.post("/:id/signature", requireAuth, requireAdminOrAbove, async (req, res) => {
  const { id } = req.params;
  const { signature } = req.body;
  if (!signature) return res.status(400).json({ error: "Signature required" });

  const matches = signature.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: "Invalid image format" });

  const mimeType   = matches[1];
  const base64Data = matches[2];
  const buffer     = Buffer.from(base64Data, "base64");
  const ext        = mimeType.split("/")[1] || "png";
  const newFileName = `sign/sig_${id}_${Date.now()}.${ext}`;

  const admin = getAdminClient();

  const { data: targetUser } = await admin.from("users").select("profile_permissions").eq("id", id).single();
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  // Cleanup old signature files for this user
  try {
    const { data: existing } = await admin.storage.from("picture").list("sign");
    if (existing?.length > 0) {
      const toDelete = existing.filter(f => f.name.startsWith(`sig_${id}_`)).map(f => `sign/${f.name}`);
      if (toDelete.length > 0) await admin.storage.from("picture").remove(toDelete);
    }
  } catch { /* ignore */ }

  const { error: uploadError } = await admin.storage
    .from("picture")
    .upload(newFileName, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });

  const { data: signedData, error: signedError } = await admin.storage
    .from("picture")
    .createSignedUrl(newFileName, 315360000);

  if (signedError || !signedData?.signedUrl)
    return res.status(500).json({ error: "Failed to generate signed URL" });

  const currentPerms = targetUser.profile_permissions || {};
  const ui = currentPerms.ui || {};
  ui.signature = newFileName;

  const { error: dbError } = await admin.from("users")
    .update({ profile_permissions: { ...currentPerms, ui } }).eq("id", id);

  if (dbError) return res.status(500).json({ error: `DB update failed: ${dbError.message}` });

  res.json({ success: true, url: signedData.signedUrl });
});

/* PUT /api/users/:id */
router.put("/:id", requireAuth, requireAdminOrAbove, async (req, res) => {
  const { id } = req.params;
  const { name, contact_no, designation, designation_id, access_profile_ids, department, role, is_active, profile_permissions, reset_permissions, can_manage_roles } = req.body;

  const admin = getAdminClient();
  const { data: targetUser } = await admin.from("users").select("role").eq("id", id).single();

  if (!targetUser) return res.status(404).json({ error: "User not found" });

  const ROLE_RANK = { global_admin: 4, super_admin: 3, admin: 2, user: 1 };
  const callerRank = ROLE_RANK[req.user.role] ?? 0;
  const targetRank = ROLE_RANK[targetUser.role] ?? 0;

  if (targetRank >= callerRank && id !== req.user.id) {
    return res.status(403).json({ error: "You don't have permission to edit this user" });
  }

  const updates = {};
  if (name                !== undefined) updates.name                = name;
  if (contact_no          !== undefined) updates.contact_no          = contact_no;
  if (designation         !== undefined) updates.designation         = designation;
  if (designation_id      !== undefined) updates.designation_id      = designation_id || null;
  if (access_profile_ids  !== undefined) updates.access_profile_ids  = access_profile_ids || [];
  if (department          !== undefined) updates.department          = department;
  if (is_active           !== undefined) updates.is_active           = is_active;
  if (can_manage_roles    !== undefined && req.user.role === "global_admin") updates.can_manage_roles = !!can_manage_roles;

  if (role !== undefined && role !== targetUser.role) {
    if (req.user.role === "global_admin") {
      if (role !== "global_admin") updates.role = role;
    } else if (req.user.role === "super_admin") {
      if (["admin", "user"].includes(role)) updates.role = role;
    }
    
    // Automatic Reset Logic if requested
    if (reset_permissions && updates.role) {
      const { data: modules } = await admin.from("modules").select("id").eq("is_active", true);
      const rows = (modules || []).map(m => ({
        user_id:               id,
        module_id:             m.id,
        can_view:              true, // Everyone gets view-only at minimum for admin/super_admin
        can_add:               updates.role === "super_admin",
        can_edit:              updates.role === "super_admin",
        can_delete:            false, // Super admin starts with no delete perms by default
        can_bulk_upload:       updates.role === "super_admin",
        can_export:            updates.role === "super_admin",
        can_download_document: updates.role === "super_admin",
        can_issue:             updates.role === "super_admin",
        can_recall:            updates.role === "super_admin",
        can_reject:            updates.role === "super_admin",
        can_revert:            updates.role === "super_admin",
        can_cancel:            updates.role === "super_admin",
        can_manage_amend:      false, // Restricted: only global_admin grants this manually
      }));
      
      const isSA = updates.role === "super_admin";
      if (updates.role === "user") {
        await admin.from("permissions").delete().eq("user_id", id);
        updates.profile_permissions = {
          manage_user:    { view: false, add: false, edit: false, delete: false, manage_permissions: false },
          manage_project: { view: false, add: false, edit: false, delete: false },
          serialization:  { view: false, edit: false },
          approval_flow:  { view: false, edit: false },
        };
      } else {
        await admin.from("permissions").upsert(rows, { onConflict: "user_id,module_id" });
        updates.profile_permissions = {
          manage_user:    { view: true, add: isSA, edit: isSA, delete: isSA, manage_permissions: isSA },
          manage_project: { view: true, add: isSA, edit: isSA, delete: isSA },
          serialization:  { view: true, edit: isSA },
          approval_flow:  { view: true, edit: isSA },
        };
      }
    }
  }

  if (profile_permissions !== undefined && !reset_permissions) {
    if (req.user.role === "global_admin" || req.user.role === "super_admin") {
      updates.profile_permissions = profile_permissions;
    }
  }

  const { data, error } = await admin.from("users").update(updates).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  bustUserCache(id);
  res.json({ success: true, user: data });
});

/* DELETE /api/users/:id — permanently remove user (global_admin only) */
router.delete("/:id", requireAuth, requireGlobalAdmin, async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id)
    return res.status(400).json({ error: "You cannot delete your own account" });

  const admin = getAdminClient();

  const { data: targetUser } = await admin.from("users").select("role").eq("id", id).single();
  if (targetUser?.role === "global_admin")
    return res.status(403).json({ error: "Global Admin users can only be removed directly in the database" });

  // request_handlers.users is a denormalized JSONB snapshot ([{id, name}]),
  // not a real foreign key — deleting the user row here has no effect on it,
  // so a stale {id, name} entry would otherwise sit there forever, silently
  // never matching if the same person is re-invited with a new user id.
  const { data: handlerRows } = await admin.from("request_handlers").select("id, users");
  const staleRows = (handlerRows || []).filter(r => (r.users || []).some(u => String(u.id) === String(id)));
  await Promise.all(staleRows.map(r =>
    admin.from("request_handlers")
      .update({ users: (r.users || []).filter(u => String(u.id) !== String(id)) })
      .eq("id", r.id)
  ));

  // Remove from our users table first
  const { error: dbError } = await admin.from("users").delete().eq("id", id);
  if (dbError) return res.status(500).json({ error: dbError.message });

  // Remove from Supabase auth
  const { error: authError } = await admin.auth.admin.deleteUser(id);
  if (authError) console.warn("Auth delete warning:", authError.message);

  res.json({ success: true });
});

/* GET /api/users/:id/permissions */
router.get("/:id/permissions", requireAuth, requireAdminOrAbove, async (req, res) => {
  const admin = getAdminClient();
  const { data: modules } = await admin.from("modules").select("*").eq("is_active", true).order("id");
  const { data: user }   = await admin.from("users").select("profile_permissions, access_profile_ids").eq("id", req.params.id).single();
  const { data: perms }   = await admin.from("permissions").select("*").eq("user_id", req.params.id);

  // Effective project access = user's own explicit list unioned with all linked
  // access profiles' project_access, so the panel reflects what the user can
  // actually reach today (not just per-user overrides).
  const profileIds = user?.access_profile_ids || [];
  let designations = [];
  if (profileIds.length > 0) {
    ({ data: designations } = await admin.from("designations").select("project_access, app_permissions").in("id", profileIds));
    designations = designations || [];
  }
  const profileProjectAccess = designations.flatMap(d => d.project_access || []);
  const profilePerms = designations.flatMap(d => d.app_permissions || []);
  const ownAllowedProjects = user?.profile_permissions?.allowed_projects || [];
  const effectiveAllowedProjects = [...new Set([...ownAllowedProjects, ...profileProjectAccess])];

  const PERM_BOOL_KEYS = [
    "can_view","can_add","can_edit","can_delete","can_bulk_upload","can_export",
    "can_download_document","can_issue","can_recall","can_reject","can_revert",
    "can_cancel","can_manage_amend","can_log","can_trash","can_take_action",
    "can_submit","can_approve","can_request","can_withdraw",
    "can_request_recall","can_request_amend","can_request_cancel",
    "can_withdraw_recall","can_withdraw_amend","can_withdraw_cancel","can_withdraw_submission",
    "can_trash_view","can_trash_log","can_trash_restore","can_trash_delete",
    "order_overview_aging","order_intake","order_payment",
  ];

  const result = (modules || []).map(mod => {
    const perm = perms?.find(p => p.module_id === mod.id) || {};
    const hasExplicit = !!perm.user_id;
    // A saved per-user row fully overrides the Access Profile for that module
    // (even to restrict below it); profile only fills in untouched modules.
    const profMatches = profilePerms.filter(p => p.module_id === mod.id);
    const merged = { module_id: mod.id, module_key: mod.module_key, module_name: mod.module_name };
    PERM_BOOL_KEYS.forEach(k => { merged[k] = hasExplicit ? !!perm[k] : profMatches.some(p => !!p[k]); });
    return merged;
  });

  res.json({
    permissions: result,
    profile_permissions: { ...(user?.profile_permissions || {}), allowed_projects: effectiveAllowedProjects },
    access_profile_ids: user?.access_profile_ids || [],
  });
});

/* PUT /api/users/:id/permissions */
router.put("/:id/permissions", requireAuth, requireAdminOrAbove, async (req, res) => {
  const { id } = req.params;
  const { permissions, profile_permissions, designation, designation_id, access_profile_ids } = req.body;

  if (permissions && !Array.isArray(permissions))
    return res.status(400).json({ error: "permissions must be an array" });

  const admin = getAdminClient();

  if (permissions) {
    const rows = permissions.map(p => ({
      user_id:               id,
      module_id:             p.module_id,
      can_view:              p.can_view              || false,
      can_add:               p.can_add               || false,
      can_edit:              p.can_edit              || false,
      can_delete:            p.can_delete            || false,
      can_bulk_upload:       p.can_bulk_upload       || false,
      can_export:            p.can_export            || false,
      can_download_document: p.can_download_document || false,
      can_issue:             p.can_issue             || false,
      can_recall:            p.can_recall            || false,
      can_reject:            p.can_reject            || false,
      can_revert:            p.can_revert            || false,
      can_cancel:            p.can_cancel            || false,
      can_manage_amend:      p.can_manage_amend      || false,
      can_log:               p.can_log               || false,
      can_trash:             p.can_trash             || false,
      can_take_action:       p.can_take_action       || false,
      can_submit:            p.can_submit            || false,
      can_approve:           p.can_approve           || false,
      can_request:           p.can_request           || false,
      can_withdraw:          p.can_withdraw          || false,
      can_request_recall:    p.can_request_recall    || false,
      can_request_amend:     p.can_request_amend     || false,
      can_request_cancel:    p.can_request_cancel    || false,
      can_withdraw_recall:   p.can_withdraw_recall   || false,
      can_withdraw_amend:    p.can_withdraw_amend    || false,
      can_withdraw_cancel:   p.can_withdraw_cancel   || false,
      can_withdraw_submission: p.can_withdraw_submission || false,
      can_trash_view:        p.can_trash_view        || false,
      can_trash_log:         p.can_trash_log         || false,
      can_trash_restore:     p.can_trash_restore     || false,
      can_trash_delete:      p.can_trash_delete      || false,
      order_overview_aging:  p.order_overview_aging  || false,
      order_intake:          p.order_intake          || false,
      order_payment:         p.order_payment         || false,
    }));
    if (rows.length > 0) {
      const { error: permError } = await admin.from("permissions").upsert(rows, { onConflict: "user_id,module_id" });
      if (permError) return res.status(500).json({ error: permError.message });
    }
  }

  const userUpdates = {};
  if (profile_permissions) userUpdates.profile_permissions = profile_permissions;
  if (designation !== undefined) userUpdates.designation = designation || "";
  if (designation_id !== undefined) userUpdates.designation_id = designation_id || null;
  if (access_profile_ids !== undefined) userUpdates.access_profile_ids = access_profile_ids || [];

  if (Object.keys(userUpdates).length > 0) {
    const { error: profError } = await admin.from("users").update(userUpdates).eq("id", id);
    if (profError) return res.status(500).json({ error: profError.message });
  }

  res.json({ success: true });
});

/* GET /api/users/modules/list */
router.get("/modules/list", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data, error } = await admin.from("modules").select("*").eq("is_active", true).order("id");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ modules: data });
});

/* POST /api/users/modules */
router.post("/modules", requireAuth, requireGlobalAdmin, async (req, res) => {
  const { module_key, module_name } = req.body;
  if (!module_key || !module_name)
    return res.status(400).json({ error: "module_key aur module_name required hai" });

  const admin = getAdminClient();
  const { createdById, createdByName } = req.body;
  const { data, error } = await admin.from("modules").insert({ 
    module_key, module_name,
    created_by_id: createdById || null,
    created_by_name: createdByName || null,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, module: data });
});

/* ─────────────────────────────────────────
   Role-level default permissions (Settings > Roles)
───────────────────────────────────────── */
const FALLBACK_ROLE_DEFAULTS = {
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

/* GET /api/role-defaults — Admin+ can view */
router.get("/role-defaults/all", requireAuth, requireAdminOrAbove, async (req, res) => {
  const admin = getAdminClient();
  const { data, error } = await admin.from("role_defaults").select("role, profile_permissions");
  if (error) return res.status(500).json({ error: error.message });

  const result = { ...FALLBACK_ROLE_DEFAULTS };
  (data || []).forEach(row => { result[row.role] = row.profile_permissions || result[row.role]; });
  res.json({ roleDefaults: result });
});

// Hierarchy: global_admin > super_admin > admin > user. A role may only edit
// (or sync) defaults for a role strictly below it — never its own row or above.
const ROLE_RANK = { global_admin: 3, super_admin: 2, admin: 1, user: 0 };
const canEditRoleDefaults = (actorRole, targetRole) =>
  (ROLE_RANK[actorRole] ?? -1) > (ROLE_RANK[targetRole] ?? -1);

/* PUT /api/role-defaults/:role — edit that role's stored defaults */
router.put("/role-defaults/:role", requireAuth, async (req, res) => {
  const { role } = req.params;
  if (!["super_admin", "admin", "user"].includes(role))
    return res.status(400).json({ error: "Invalid role" });
  if (!canEditRoleDefaults(req.user.role, role))
    return res.status(403).json({ error: "You cannot edit this role's defaults" });

  const { profile_permissions } = req.body;
  if (!profile_permissions || typeof profile_permissions !== "object")
    return res.status(400).json({ error: "profile_permissions object required" });

  const admin = getAdminClient();
  const { error } = await admin.from("role_defaults")
    .upsert({ role, profile_permissions, updated_at: new Date().toISOString() }, { onConflict: "role" });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* POST /api/role-defaults/:role/sync — apply this role's saved defaults onto
   every EXISTING user with that role (only the management-permission keys;
   everything else in their profile_permissions, e.g. allowed_projects, stays untouched). */
router.post("/role-defaults/:role/sync", requireAuth, async (req, res) => {
  const { role } = req.params;
  if (!["super_admin", "admin", "user"].includes(role))
    return res.status(400).json({ error: "Invalid role" });
  if (!canEditRoleDefaults(req.user.role, role))
    return res.status(403).json({ error: "You cannot sync this role's defaults" });

  const admin = getAdminClient();
  const { data: roleRow, error: roleErr } = await admin.from("role_defaults")
    .select("profile_permissions").eq("role", role).single();
  if (roleErr || !roleRow) return res.status(404).json({ error: "No saved defaults for this role yet" });

  const { data: targetUsers, error: usersErr } = await admin.from("users")
    .select("id, profile_permissions").eq("role", role);
  if (usersErr) return res.status(500).json({ error: usersErr.message });

  const results = await Promise.all((targetUsers || []).map(u =>
    admin.from("users")
      .update({ profile_permissions: { ...(u.profile_permissions || {}), ...roleRow.profile_permissions } })
      .eq("id", u.id)
  ));
  const failed = results.find(r => r.error);
  if (failed) return res.status(500).json({ error: failed.error.message });

  res.json({ success: true, updatedCount: (targetUsers || []).length });
});

module.exports = router;
