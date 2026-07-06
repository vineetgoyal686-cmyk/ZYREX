const express = require("express");
const router  = express.Router();
const admin = require("../helpers/supabaseHelper");
const getAdminClient = () => admin;
const { requireAuth } = require("../middleware/auth");

const requireAdminOrAbove = (req, res, next) => {
  if (!["global_admin", "super_admin", "admin"].includes(req.user.role))
    return res.status(403).json({ error: "Access denied" });
  next();
};

const requireGlobalOrSuper = (req, res, next) => {
  if (!["global_admin", "super_admin"].includes(req.user.role))
    return res.status(403).json({ error: "Only Global Admin or Super Admin can manage designations" });
  next();
};

/* GET /api/designations — list all */
router.get("/", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("designations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ designations: data });
});

/* GET /api/designations/:id — single (with full permissions payload) */
router.get("/:id", requireAuth, async (req, res) => {
  const admin = getAdminClient();
  const { data, error } = await admin.from("designations").select("*").eq("id", req.params.id).single();
  if (error || !data) return res.status(404).json({ error: "Designation not found" });
  res.json({ designation: data });
});

/* POST /api/designations — create */
router.post("/", requireAuth, requireGlobalOrSuper, async (req, res) => {
  const { name, description, app_permissions, profile_permissions, project_access } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const admin = getAdminClient();
  const { data, error } = await admin.from("designations").insert({
    name:                name.trim(),
    description:         description || null,
    app_permissions:     app_permissions     || [],
    profile_permissions: profile_permissions || {},
    project_access:      project_access      || [],
    created_by_id:       req.user.id,
    created_by_name:     req.user.name,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, designation: data });
});

/* PUT /api/designations/:id — update */
router.put("/:id", requireAuth, requireGlobalOrSuper, async (req, res) => {
  const { name, description, app_permissions, profile_permissions, project_access, is_active } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (name                !== undefined) updates.name                = name.trim();
  if (description         !== undefined) updates.description         = description;
  if (app_permissions     !== undefined) updates.app_permissions     = app_permissions;
  if (profile_permissions !== undefined) updates.profile_permissions = profile_permissions;
  if (project_access      !== undefined) updates.project_access      = project_access;
  if (is_active           !== undefined) updates.is_active           = is_active;

  const admin = getAdminClient();
  const { data, error } = await admin.from("designations").update(updates).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, designation: data });
});

/* DELETE /api/designations/:id */
router.delete("/:id", requireAuth, requireGlobalOrSuper, async (req, res) => {
  const admin = getAdminClient();
  // Detach any users still pointing at this template
  await admin.from("users").update({ designation_id: null }).eq("designation_id", req.params.id);
  const { error } = await admin.from("designations").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* POST /api/designations/:id/sync — re-apply template to every user already on it */
router.post("/:id/sync", requireAuth, requireGlobalOrSuper, async (req, res) => {
  const admin = getAdminClient();
  const { data: tpl, error: tplErr } = await admin.from("designations").select("*").eq("id", req.params.id).single();
  if (tplErr || !tpl) return res.status(404).json({ error: "Designation not found" });

  // Find all users currently assigned this template
  const { data: users, error: usersErr } = await admin
    .from("users").select("id, profile_permissions").eq("designation_id", req.params.id);
  if (usersErr) return res.status(500).json({ error: usersErr.message });
  if (!users || users.length === 0) return res.json({ success: true, synced: 0 });

  const userIds = users.map(u => u.id);
  const tplPerms = tpl.app_permissions || [];

  // Build permission rows for every (user, module) pair
  const rows = [];
  userIds.forEach(uid => {
    tplPerms.forEach(p => {
      rows.push({
        user_id:               uid,
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
        can_trash_view:        p.can_trash_view        || false,
        can_trash_log:         p.can_trash_log         || false,
        can_trash_restore:     p.can_trash_restore     || false,
        can_trash_delete:      p.can_trash_delete      || false,
        can_take_action:       p.can_take_action       || false,
        can_submit:            p.can_submit            || false,
        can_approve:           p.can_approve           || false,
        can_request:           p.can_request           || false,
        can_withdraw:          p.can_withdraw          || false,
        order_overview_aging:  p.order_overview_aging  || false,
        order_intake:          p.order_intake          || false,
        order_payment:         p.order_payment         || false,
      });
    });
  });

  if (rows.length) {
    const { error: upErr } = await admin.from("permissions").upsert(rows, { onConflict: "user_id,module_id" });
    if (upErr) return res.status(500).json({ error: upErr.message });
  }

  // Sync profile_permissions on each user too — preserve each user's personal
  // ui data (signature, cover image, etc.) and allowed_projects, since those
  // live in the same JSON column but aren't part of the designation template.
  const profResults = await Promise.all(users.map(u => {
    const existing = u.profile_permissions || {};
    const merged = {
      ...(tpl.profile_permissions || {}),
      ...(existing.ui !== undefined ? { ui: existing.ui } : {}),
      ...(existing.allowed_projects !== undefined ? { allowed_projects: existing.allowed_projects } : {}),
    };
    return admin.from("users").update({ profile_permissions: merged }).eq("id", u.id);
  }));
  const profErr = profResults.find(r => r.error)?.error;
  if (profErr) return res.status(500).json({ error: profErr.message });

  res.json({ success: true, synced: userIds.length });
});

/* POST /api/designations/:id/apply/:userId — copy template perms onto a user */
router.post("/:id/apply/:userId", requireAuth, requireAdminOrAbove, async (req, res) => {
  const admin = getAdminClient();
  const { data: tpl, error: tplErr } = await admin.from("designations").select("*").eq("id", req.params.id).single();
  if (tplErr || !tpl) return res.status(404).json({ error: "Designation not found" });

  // Replace the user's permission rows with the template snapshot
  const rows = (tpl.app_permissions || []).map(p => ({
    user_id:               req.params.userId,
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
    can_trash_view:        p.can_trash_view        || false,
    can_trash_log:         p.can_trash_log         || false,
    can_trash_restore:     p.can_trash_restore     || false,
    can_trash_delete:      p.can_trash_delete      || false,
    can_take_action:       p.can_take_action       || false,
    can_submit:            p.can_submit            || false,
    can_approve:           p.can_approve           || false,
    can_request:           p.can_request           || false,
    can_withdraw:          p.can_withdraw          || false,
    order_overview_aging:  p.order_overview_aging  || false,
    order_intake:          p.order_intake          || false,
    order_payment:         p.order_payment         || false,
  }));

  if (rows.length) {
    const { error: upErr } = await admin.from("permissions").upsert(rows, { onConflict: "user_id,module_id" });
    if (upErr) return res.status(500).json({ error: upErr.message });
  }

  const { data: targetUser } = await admin.from("users").select("profile_permissions").eq("id", req.params.userId).single();
  const existing = targetUser?.profile_permissions || {};
  await admin.from("users").update({
    profile_permissions: {
      ...(tpl.profile_permissions || {}),
      ...(existing.ui !== undefined ? { ui: existing.ui } : {}),
      ...(existing.allowed_projects !== undefined ? { allowed_projects: existing.allowed_projects } : {}),
    },
    designation_id:      tpl.id,
    designation:         tpl.name,
  }).eq("id", req.params.userId);

  res.json({ success: true });
});

module.exports = router;
