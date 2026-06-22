const express = require("express");
const router  = express.Router();
const { createSignedStorageUrl, removeStorageFile } = require("../helpers/storageHelper");
const admin = require("../helpers/supabaseHelper");
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
    .select("id, name, email, contact_no, designation, designation_id, access_profile_ids, department, role, is_active, avatar, created_at")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // global_admin users are invisible to everyone except other global_admins
  const isGlobalAdmin = req.user.role === "global_admin";
  const visible = (data || []).filter(u => isGlobalAdmin || u.role !== "global_admin");

  const users = await Promise.all(visible.map(async user => {
    const pp = user.profile_permissions || {};
    const sigFile = pp.ui?.signature || null;
    const [signedAvatar, signedSignature] = await Promise.all([
      createSignedStorageUrl(admin, "avatars", user.avatar),
      sigFile ? createSignedStorageUrl(admin, "avatars", sigFile) : Promise.resolve(null),
    ]);
    return { ...user, avatar: signedAvatar, signature: signedSignature };
  }));
  res.json({ users });
});

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

  const { data: authData, error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo: process.env.FRONTEND_URL + "/set-password",
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
    profile_permissions: profile_permissions || null,
    created_by_id:       req.body.createdById || null,
    created_by_name:     req.body.createdByName || null,
  }, { onConflict: "id" }).select().single();

  if (profileError) return res.status(500).json({ error: profileError.message });
  res.json({ success: true, user: profile });
});

/* POST /api/users/:id/resend-invite */
router.post("/:id/resend-invite", requireAuth, requireAdminOrAbove, async (req, res) => {
  const { id } = req.params;
  const admin = getAdminClient();
  const { data: user, error: fetchErr } = await admin.from("users").select("email").eq("id", id).single();
  if (fetchErr || !user) return res.status(404).json({ error: "User not found" });
  const { error } = await admin.auth.admin.inviteUserByEmail(user.email, {
    redirectTo: process.env.FRONTEND_URL + "/",
  });
  if (error) return res.status(400).json({ error: error.message });
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
  const newFileName = `sig_${id}_${Date.now()}.${ext}`;

  const admin = getAdminClient();

  const { data: targetUser } = await admin.from("users").select("profile_permissions").eq("id", id).single();
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  // Cleanup old signature files for this user
  try {
    const { data: existing } = await admin.storage.from("avatars").list();
    if (existing?.length > 0) {
      const toDelete = existing.filter(f => f.name.startsWith(`sig_${id}_`)).map(f => f.name);
      if (toDelete.length > 0) await admin.storage.from("avatars").remove(toDelete);
    }
  } catch { /* ignore */ }

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(newFileName, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });

  const { data: signedData, error: signedError } = await admin.storage
    .from("avatars")
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
  const { name, contact_no, designation, designation_id, access_profile_ids, department, role, is_active, profile_permissions, reset_permissions } = req.body;

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

  const result = (modules || []).map(mod => {
    const perm = perms?.find(p => p.module_id === mod.id) || {};
    return {
      module_id:             mod.id,
      module_key:            mod.module_key,
      module_name:           mod.module_name,
      can_view:              perm.can_view              || false,
      can_add:               perm.can_add               || false,
      can_edit:              perm.can_edit              || false,
      can_delete:            perm.can_delete            || false,
      can_bulk_upload:       perm.can_bulk_upload       || false,
      can_export:            perm.can_export            || false,
      can_download_document: perm.can_download_document || false,
      can_issue:             perm.can_issue             || false,
      can_recall:            perm.can_recall            || false,
      can_reject:            perm.can_reject            || false,
      can_revert:            perm.can_revert            || false,
      can_cancel:            perm.can_cancel            || false,
      can_manage_amend:      perm.can_manage_amend      || false,
      can_log:               perm.can_log               || false,
      can_trash:             perm.can_trash             || false,
      can_take_action:       perm.can_take_action       || false,
      can_submit:            perm.can_submit            || false,
      can_approve:           perm.can_approve           || false,
      can_request:           perm.can_request           || false,
      can_withdraw:          perm.can_withdraw          || false,
      order_overview_aging:  perm.order_overview_aging  || false,
      order_intake:          perm.order_intake          || false,
      order_payment:         perm.order_payment         || false,
    };
  });

  res.json({ permissions: result, profile_permissions: user?.profile_permissions || {}, access_profile_ids: user?.access_profile_ids || [] });
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
      order_overview_aging:  p.order_overview_aging  || false,
      order_intake:          p.order_intake          || false,
      order_payment:         p.order_payment         || false,
    }));
    const { error: permError } = await admin.from("permissions").upsert(rows, { onConflict: "user_id,module_id" });
    if (permError) return res.status(500).json({ error: permError.message });
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

module.exports = router;
