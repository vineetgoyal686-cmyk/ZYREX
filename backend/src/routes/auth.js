const express = require("express");
const router = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { createClient } = require("@supabase/supabase-js");
const {
  normalizeStoragePath,
  createSignedStorageUrl,
  removeStorageFile,
} = require("../helpers/storageHelper");

// Fresh admin client for DB queries after signInWithPassword
// (shared client ka session signInWithPassword se pollute ho jaata hai)
const getAdminClient = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// JWT tokens expire after 1 hour — for internal routes we decode the sub
// without verifying expiry, then confirm user exists in our DB.
const extractUserId = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload.sub || null;
  } catch { return null; }
};

const getUserFromToken = async (token) => {
  const userId = extractUserId(token);
  if (!userId) return null;
  const admin = getAdminClient();
  const { data } = await admin.from("users").select("*").eq("id", userId).single();
  return data || null;
};

/* ─────────────────────────────────────────
   POST /api/auth/login
   Body: { email, password }
───────────────────────────────────────── */
router.post("/login", async (req, res) => {
  let { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email aur password required hai" });

  email = email.toLowerCase().trim();

  const admin = getAdminClient();

  // Run DB profile check and Supabase auth in parallel to save ~300-600ms
  const [{ data: profile, error: profileErr }, { data, error: authError }] = await Promise.all([
    admin.from("users").select("*").eq("email", email).single(),
    admin.auth.signInWithPassword({ email, password }),
  ]);

  if (authError) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (profileErr || !profile) {
    return res.status(404).json({ error: "User does not exist" });
  }

  if (!profile.is_active) {
    return res.status(403).json({ error: "You are blocked, contact to Administrator" });
  }

  const signedAvatarPromise = createSignedStorageUrl(admin, "avatars", profile.avatar);
  const signedProfilePermissions = { ...(profile.profile_permissions || {}) };
  const signedCoverPromise = signedProfilePermissions.ui?.cover_image
    ? createSignedStorageUrl(admin, "avatars", signedProfilePermissions.ui.cover_image)
    : Promise.resolve(null);
  const signedSignaturePromise = signedProfilePermissions.ui?.signature
    ? createSignedStorageUrl(admin, "avatars", signedProfilePermissions.ui.signature)
    : Promise.resolve(null);

  const [signedAvatar, signedCoverImage, signedSignature] = await Promise.all([signedAvatarPromise, signedCoverPromise, signedSignaturePromise]);
  const ui = signedProfilePermissions.ui || {};

  res.json({
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: {
      id:                  profile.id,
      name:                profile.name,
      email:               profile.email,
      role:                profile.role,
      designation:         profile.designation,
      department:          profile.department,
      contact_no:          profile.contact_no          || "",
      avatar:              signedAvatar                || null,
      cover_image:         signedCoverImage            || null,
      signature:           signedSignature             || null,
      header_theme:        ui.header_theme             || null,
      profile_permissions: signedProfilePermissions,
    },
  });
});

/* ─────────────────────────────────────────
   POST /api/auth/refresh
   Body: { refresh_token }
───────────────────────────────────────── */
router.post("/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: "Refresh token required" });

  const admin = getAdminClient();
  const { data, error } = await admin.auth.refreshSession({ refresh_token });

  if (error || !data?.session)
    return res.status(401).json({ error: "Session expired. Please login again." });

  res.json({
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

/* ─────────────────────────────────────────
   POST /api/auth/forgot-password
   Body: { email }
   Supabase khud reset email bhejta hai
───────────────────────────────────────── */
router.post("/forgot-password", async (req, res) => {
  let { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required hai" });

  email = email.toLowerCase().trim();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.FRONTEND_URL}/reset-password`,
  });

  // Security ke liye hamesha success return karo (email exist kare ya nahi)
  res.json({ success: true, message: "Agar email registered hai toh reset link aa jayega" });
});

/* ─────────────────────────────────────────
   POST /api/auth/reset-password
   Body: { password }
   Header: Authorization: Bearer <recovery_token>
───────────────────────────────────────── */
router.post("/reset-password", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { password, refresh_token } = req.body;
  if (!password) return res.status(400).json({ error: "Password required hai" });
  if (!token)    return res.status(401).json({ error: "Reset token required" });

  const adminClient = getAdminClient();

  // Pehle access_token se try karo, expire ho toh refresh_token se session refresh karo
  let userId;
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token);

  if (!userError && user) {
    userId = user.id;
  } else if (refresh_token) {
    // Access token expired — refresh_token se naya session lo
    const { data: refreshData, error: refreshError } = await adminClient.auth.refreshSession({ refresh_token });
    if (refreshError || !refreshData?.user)
      return res.status(401).json({ error: "Reset link expired or invalid. Please request a new one." });
    userId = refreshData.user.id;
  } else {
    return res.status(401).json({ error: "Reset link expired or invalid. Please request a new one." });
  }

  // Update password via admin API
  const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
  if (error) return res.status(400).json({ error: error.message });

  res.json({ success: true });
});

/* ─────────────────────────────────────────
   PUT /api/auth/profile
   Any authenticated user can update their own profile
───────────────────────────────────────── */
router.put("/profile", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });

  const dbUser = await getUserFromToken(token);
  if (!dbUser) return res.status(401).json({ error: "Invalid token" });

  const { name, contact_no, department } = req.body;
  const admin = getAdminClient();
  const currentPerms = dbUser.profile_permissions || {};
  const updates = {};

  if (name        !== undefined) updates.name        = name;
  if (contact_no  !== undefined) updates.contact_no  = contact_no;
  if (department  !== undefined) updates.department  = department;

  if (req.body.header_theme !== undefined || req.body.cover_image !== undefined) {
    const ui = currentPerms.ui || {};
    if (req.body.header_theme !== undefined) ui.header_theme = req.body.header_theme;
    if (req.body.cover_image !== undefined)  ui.cover_image  = req.body.cover_image;
    updates.profile_permissions = { ...currentPerms, ui };
  }

  const { data, error } = await admin
    .from("users").update(updates).eq("id", dbUser.id).select().single();

  if (error) return res.status(500).json({ error: error.message });

  // Return signed URLs so frontend doesn't get raw filenames
  const signedAvatar = await createSignedStorageUrl(admin, "avatars", data.avatar);
  const signedProfilePermissions = { ...(data.profile_permissions || {}) };
  let signedCover = null;
  if (signedProfilePermissions.ui?.cover_image) {
    signedCover = await createSignedStorageUrl(admin, "avatars", signedProfilePermissions.ui.cover_image);
    signedProfilePermissions.ui = { ...signedProfilePermissions.ui, cover_image: signedCover };
  }
  let signedSig = null;
  if (signedProfilePermissions.ui?.signature) {
    signedSig = await createSignedStorageUrl(admin, "avatars", signedProfilePermissions.ui.signature);
    signedProfilePermissions.ui = { ...signedProfilePermissions.ui, signature: signedSig };
  }

  res.json({
    success: true,
    user: {
      ...data,
      avatar: signedAvatar || null,
      cover_image: signedCover || null,
      signature: signedSig || null,
      header_theme: signedProfilePermissions.ui?.header_theme || null,
      profile_permissions: signedProfilePermissions
    }
  });
});

/* ─────────────────────────────────────────
   POST /api/auth/avatar
   Upload avatar to Supabase Storage
   Body: { avatar: "data:image/jpeg;base64,..." }
───────────────────────────────────────── */
router.post("/avatar", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });

  const dbUser = await getUserFromToken(token);
  if (!dbUser) return res.status(401).json({ error: "Invalid token" });

  const { avatar } = req.body;
  if (!avatar) return res.status(400).json({ error: "Avatar required" });

  // base64 string se image type aur data alag karo
  const matches = avatar.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: "Invalid image format" });

  const mimeType   = matches[1];
  const base64Data = matches[2];
  const buffer     = Buffer.from(base64Data, "base64");
  const ext        = mimeType.split("/")[1] || "jpg";

  const newFileName = `${dbUser.id}_${Date.now()}.${ext}`;
  const admin       = getAdminClient();

  // Upload se pehle is user ki SAARI purani avatar files delete karo (cleanup)
  try {
    const { data: existingFiles } = await admin.storage.from("avatars").list();
    if (existingFiles && existingFiles.length > 0) {
      const toDelete = existingFiles
        .filter(f => f.name.startsWith(`${dbUser.id}_`))
        .map(f => f.name);
      if (toDelete.length > 0) await admin.storage.from("avatars").remove(toDelete);
    }
  } catch (err) {
    console.error("Cleanup failed, proceeding with upload:", err.message);
  }

  // Naya file upload karo
  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(newFileName, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });

  // DB update: filename save karo
  const { error: dbError } = await admin.from("users")
    .update({ avatar: newFileName })
    .eq("id", dbUser.id)
    .select();

  if (dbError) return res.status(500).json({ error: `DB update failed: ${dbError.message}` });

  // UI ke liye signed URL generate karo
  const { data: signedData, error: signedError } = await admin.storage
    .from("avatars")
    .createSignedUrl(newFileName, 315360000); // 10 years

  if (signedError || !signedData?.signedUrl)
    return res.status(500).json({ error: "Failed to generate signed URL for preview" });

  res.json({ success: true, url: signedData.signedUrl });
});

/* ─────────────────────────────────────────
   POST /api/auth/cover
   Upload cover image to Supabase Storage (avatars bucket)
   Body: { cover: "data:image/jpeg;base64,..." }
   (Using same bucket 'avatars' for simplicity, but different naming)
───────────────────────────────────────── */
router.post("/cover", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });

  const dbUser = await getUserFromToken(token);
  if (!dbUser) return res.status(401).json({ error: "Invalid token" });

  const { cover } = req.body;
  if (!cover) return res.status(400).json({ error: "Cover image required" });

  const matches = cover.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: "Invalid image format" });

  const mimeType   = matches[1];
  const base64Data = matches[2];
  const buffer     = Buffer.from(base64Data, "base64");
  const ext        = mimeType.split("/")[1] || "jpg";

  const newFileName = `cover_${dbUser.id}_${Date.now()}.${ext}`;
  const admin       = getAdminClient();

  // Upload se pehle is user ki SAARI purani cover files delete karo
  const { data: existingCovers } = await admin.storage.from("avatars").list("", { search: `cover_${dbUser.id}_` });
  if (existingCovers && existingCovers.length > 0) {
    const toDelete = existingCovers
      .filter(f => f.name.startsWith(`cover_${dbUser.id}_`))
      .map(f => f.name);
    if (toDelete.length > 0) await admin.storage.from("avatars").remove(toDelete);
  }

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(newFileName, buffer, { contentType: mimeType });

  if (uploadError) return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });

  const { data: signedData, error: signedError } = await admin.storage
    .from("avatars")
    .createSignedUrl(newFileName, 315360000); // 10 years

  if (signedError || !signedData?.signedUrl)
    return res.status(500).json({ error: "Failed to generate signed URL" });

  const coverUrl = signedData.signedUrl;

  const currentPerms = dbUser.profile_permissions || {};
  const ui = currentPerms.ui || {};
  ui.cover_image = newFileName;

  const { error: dbError } = await admin.from("users")
    .update({ profile_permissions: { ...currentPerms, ui } }).eq("id", dbUser.id);

  if (dbError) return res.status(500).json({ error: `DB update failed: ${dbError.message}` });

  res.json({ success: true, url: coverUrl });
});

/* ─────────────────────────────────────────
   DELETE /api/auth/cover
   Remove cover image from Storage + DB
───────────────────────────────────────── */
router.delete("/cover", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });

  const dbUser = await getUserFromToken(token);
  if (!dbUser) return res.status(401).json({ error: "Invalid token" });

  const admin = getAdminClient();

  if (dbUser.profile_permissions?.ui?.cover_image) {
    await removeStorageFile(admin, "avatars", dbUser.profile_permissions.ui.cover_image);
  }

  const currentPerms = dbUser.profile_permissions || {};
  const ui = currentPerms.ui || {};
  ui.cover_image = null;

  await admin.from("users").update({ profile_permissions: { ...currentPerms, ui } }).eq("id", dbUser.id);
  res.json({ success: true });
});

/* ─────────────────────────────────────────
   POST /api/auth/signature
   Upload user signature to Supabase Storage
   Body: { signature: "data:image/png;base64,..." }
───────────────────────────────────────── */
router.post("/signature", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });

  const dbUser = await getUserFromToken(token);
  if (!dbUser) return res.status(401).json({ error: "Invalid token" });

  const { signature } = req.body;
  if (!signature) return res.status(400).json({ error: "Signature required" });

  const matches = signature.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: "Invalid image format" });

  const mimeType   = matches[1];
  const base64Data = matches[2];
  const buffer     = Buffer.from(base64Data, "base64");
  const ext        = mimeType.split("/")[1] || "png";

  const newFileName = `sig_${dbUser.id}_${Date.now()}.${ext}`;
  const admin       = getAdminClient();

  // Purani signature files delete karo
  try {
    const { data: existingFiles } = await admin.storage.from("avatars").list();
    if (existingFiles?.length > 0) {
      const toDelete = existingFiles.filter(f => f.name.startsWith(`sig_${dbUser.id}_`)).map(f => f.name);
      if (toDelete.length > 0) await admin.storage.from("avatars").remove(toDelete);
    }
  } catch { /* ignore cleanup errors */ }

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(newFileName, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });

  const { data: signedData, error: signedError } = await admin.storage
    .from("avatars")
    .createSignedUrl(newFileName, 315360000);

  if (signedError || !signedData?.signedUrl)
    return res.status(500).json({ error: "Failed to generate signed URL" });

  const currentPerms = dbUser.profile_permissions || {};
  const ui = currentPerms.ui || {};
  ui.signature = newFileName;

  const { error: dbError } = await admin.from("users")
    .update({ profile_permissions: { ...currentPerms, ui } }).eq("id", dbUser.id);

  if (dbError) return res.status(500).json({ error: `DB update failed: ${dbError.message}` });

  res.json({ success: true, url: signedData.signedUrl });
});

/* ─────────────────────────────────────────
   DELETE /api/auth/signature
   Remove signature from Storage + DB
───────────────────────────────────────── */
router.delete("/signature", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });

  const dbUser = await getUserFromToken(token);
  if (!dbUser) return res.status(401).json({ error: "Invalid token" });

  const admin = getAdminClient();

  if (dbUser.profile_permissions?.ui?.signature) {
    await removeStorageFile(admin, "avatars", dbUser.profile_permissions.ui.signature);
  }

  const currentPerms = dbUser.profile_permissions || {};
  const ui = currentPerms.ui || {};
  ui.signature = null;

  await admin.from("users").update({ profile_permissions: { ...currentPerms, ui } }).eq("id", dbUser.id);
  res.json({ success: true });
});

/* ─────────────────────────────────────────
   DELETE /api/auth/avatar
   Avatar hataao Storage + DB dono se
───────────────────────────────────────── */
router.delete("/avatar", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });

  const dbUser = await getUserFromToken(token);
  if (!dbUser) return res.status(401).json({ error: "Invalid token" });

  const admin = getAdminClient();

  // Purani avatar file Storage se hatao
  if (dbUser.avatar) {
    await removeStorageFile(admin, "avatars", dbUser.avatar);
  }

  // DB me null set karo
  await admin.from("users").update({ avatar: null }).eq("id", dbUser.id);

  res.json({ success: true });
});

/* ─────────────────────────────────────────
   GET /api/auth/refresh-avatar
   Private bucket ke liye fresh signed URL generate karo
   (purane public URLs jo ab 403 de rahe hain unke liye)
───────────────────────────────────────── */
router.get("/refresh-avatar", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });

  const dbUser = await getUserFromToken(token);
  if (!dbUser) return res.status(401).json({ error: "Invalid token" });

  if (!dbUser.avatar) return res.json({ url: null });

  const filename = normalizeStoragePath(dbUser.avatar, "avatars");
  if (!filename) return res.json({ url: null });

  const admin = getAdminClient();

  // File actually exists ki nahi check karo
  const { data: fileList } = await admin.storage.from("avatars").list("", { search: filename });
  const fileExists = fileList?.some(f => f.name === filename);

  if (!fileExists) {
    // File Storage se delete ho chuki — DB bhi clear karo
    await admin.from("users").update({ avatar: null }).eq("id", dbUser.id);
    return res.json({ url: null });
  }

  const { data, error } = await admin.storage
    .from("avatars")
    .createSignedUrl(filename, 315360000);

  if (error || !data?.signedUrl) return res.json({ url: null });

  res.json({ url: data.signedUrl });
});

/* ─────────────────────────────────────────
   POST /api/auth/send-otp
   Logged-in user ke email pe OTP bhejo
   Body: { email }  ← frontend localStorage se bhejta hai
   Token verify ki zaroorat nahi — OTP hi security hai
───────────────────────────────────────── */
router.post("/send-otp", async (req, res) => {
  let { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  email = email.toLowerCase().trim();

  const admin = getAdminClient();

  // Verify: yeh email hamare users table mein hai?
  const { data: userRow, error: dbErr } = await admin
    .from("users").select("id").eq("email", email).single();
  if (dbErr || !userRow) return res.status(404).json({ error: "Email not found in system" });

  // OTP bhejo
  const { error } = await admin.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, email });
});

/* ─────────────────────────────────────────
   POST /api/auth/verify-otp-change-password
   OTP verify karke password badlo
   Body: { email, otp, newPassword }
───────────────────────────────────────── */
router.post("/verify-otp-change-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword)
    return res.status(400).json({ error: "Email, OTP aur naya password required hai" });

  const admin = getAdminClient();

  // OTP verify karo
  const { data: verifyData, error: otpError } = await admin.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });

  if (otpError) return res.status(400).json({ error: "Invalid or expired OTP" });

  // Auth user ID nikalo
  const userId = verifyData?.user?.id;
  if (!userId) return res.status(400).json({ error: "OTP verification failed" });

  // Password update karo via admin API
  const { error: pwError } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (pwError) return res.status(500).json({ error: pwError.message });
  res.json({ success: true });
});

/* ─────────────────────────────────────────
   GET /api/auth/me
   Header: Authorization: Bearer <token>
───────────────────────────────────────── */
router.get("/me", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token required hai" });

  const userId = extractUserId(token);
  if (!userId) return res.status(401).json({ error: "Invalid token" });

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, name, email, role, designation, department, contact_no, avatar, profile_permissions, permissions(*, modules(module_key, module_name))")
    .eq("id", userId)
    .single();

  if (!profile) return res.status(401).json({ error: "User not found" });
  const signedAvatar = await createSignedStorageUrl(admin, "avatars", profile.avatar);
  const signedProfilePermissions = { ...(profile.profile_permissions || {}) };
  if (signedProfilePermissions.ui?.cover_image) {
    signedProfilePermissions.ui = {
      ...signedProfilePermissions.ui,
      cover_image: await createSignedStorageUrl(admin, "avatars", signedProfilePermissions.ui.cover_image),
    };
  }
  let signedSignature = null;
  if (signedProfilePermissions.ui?.signature) {
    signedSignature = await createSignedStorageUrl(admin, "avatars", signedProfilePermissions.ui.signature);
    signedProfilePermissions.ui = { ...signedProfilePermissions.ui, signature: signedSignature };
  }

  res.json({ user: { ...profile, avatar: signedAvatar || null, signature: signedSignature || null, profile_permissions: signedProfilePermissions } });
});

/* ─────────────────────────────────────────
   GET /api/auth/my-permissions
   Current user apni tab permissions fetch kare
   Header: Authorization: Bearer <token>
───────────────────────────────────────── */
router.get("/my-permissions", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token required" });

  const userId = extractUserId(token);
  if (!userId) return res.status(401).json({ error: "Invalid token" });

  const admin = getAdminClient();
  const { data: modules } = await admin.from("modules").select("*").eq("is_active", true).order("id");
  const { data: perms }   = await admin.from("permissions").select("*").eq("user_id", userId);

  const result = (modules || []).map(mod => {
    const perm = (perms || []).find(p => p.module_id === mod.id) || {};
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
      has_explicit_entry:    !!perms?.find(p => p.module_id === mod.id),
    };
  });

  res.json({ permissions: result, has_any_permissions: (perms || []).length > 0 });
});

module.exports = router;
