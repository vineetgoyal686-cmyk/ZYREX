const express = require("express");
const router = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { sendTemplateEmail } = require("../utils/mailer");
const { createClient } = require("@supabase/supabase-js");
const {
  normalizeStoragePath,
  createSignedStorageUrl,
  removeStorageFile,
} = require("../helpers/storageHelper");
const { bustUserCache } = require("../middleware/auth");

// Separate client only for signInWithPassword — avoids auth state on shared singleton
const getAdminClient = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Auth/permission responses must never be cached by the browser or any
// intermediary proxy — a stale cached copy of /my-permissions would keep
// showing a user's old Access Profile state even after a hard refresh.
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  next();
});

const extractUserId = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload.sub || null;
  } catch { return null; }
};

const getUserFromToken = async (token) => {
  const userId = extractUserId(token);
  if (!userId) return null;
  const { data } = await supabase.from("users").select("*").eq("id", userId).single();
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

  const signedAvatarPromise = createSignedStorageUrl(admin, "picture", profile.avatar);
  const signedProfilePermissions = { ...(profile.profile_permissions || {}) };
  const signedCoverPromise = signedProfilePermissions.ui?.cover_image
    ? createSignedStorageUrl(admin, "picture", signedProfilePermissions.ui.cover_image)
    : Promise.resolve(null);
  const signedSignaturePromise = signedProfilePermissions.ui?.signature
    ? createSignedStorageUrl(admin, "picture", signedProfilePermissions.ui.signature)
    : Promise.resolve(null);

  // Fetch user's permissions + access profile permissions at login so sidebar renders immediately
  const [signedAvatar, signedCoverImage, signedSignature, modulesRes, permsRes, designationsRes] = await Promise.all([
    signedAvatarPromise,
    signedCoverPromise,
    signedSignaturePromise,
    admin.from("modules").select("id,module_key,module_name").eq("is_active", true).order("id"),
    admin.from("permissions").select("*").eq("user_id", profile.id),
    (profile.access_profile_ids?.length > 0)
      ? admin.from("designations").select("app_permissions").in("id", profile.access_profile_ids)
      : Promise.resolve({ data: [] }),
  ]);

  const BOOL_KEYS = [
    "can_view","can_add","can_edit","can_delete","can_bulk_upload","can_export",
    "can_download_document","can_issue","can_recall","can_reject","can_revert",
    "can_cancel","can_manage_amend","can_log","can_trash","can_take_action",
    "can_submit","can_approve","can_request","can_withdraw",
    "can_request_recall","can_request_amend","can_request_cancel",
    "can_withdraw_recall","can_withdraw_amend","can_withdraw_cancel","can_withdraw_submission",
    "can_trash_view","can_trash_log","can_trash_restore","can_trash_delete",
    "order_overview_aging","order_intake","order_payment",
  ];
  const profilePerms = (designationsRes.data || []).flatMap(d => d.app_permissions || []);
  const appPermissions = (modulesRes.data || []).map(mod => {
    const explicit = (permsRes.data || []).find(p => p.module_id === mod.id) || {};
    const hasExplicit = !!explicit.user_id;
    const profMatches = profilePerms.filter(p => p.module_id === mod.id);
    const merged = { module_id: mod.id, module_key: mod.module_key, module_name: mod.module_name };
    // Once a user has their own saved row for a module, it fully overrides the
    // Access Profile for that module (even to restrict below it) — the profile
    // only fills in modules the user has never explicitly had set.
    BOOL_KEYS.forEach(k => { merged[k] = hasExplicit ? !!explicit[k] : profMatches.some(p => !!p[k]); });
    return merged;
  });

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
      app_permissions:     appPermissions,
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
   ZeptoMail se reset link bhejta hai
───────────────────────────────────────── */
router.post("/forgot-password", async (req, res) => {
  let { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required hai" });

  email = email.toLowerCase().trim();
  const admin = getAdminClient();

  try {
    const { data: userRow } = await admin.from("users").select("name").eq("email", email).maybeSingle();
    if (userRow) {
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${process.env.FRONTEND_URL}/reset-password` },
      });
      if (linkData?.properties?.action_link) {
        await sendTemplateEmail({
          to:          email,
          toName:      userRow.name || email,
          templateKey: process.env.ZEPTOMAIL_TEMPLATE_RESET,
          mergeInfo:   { name: userRow.name || email, reset_link: linkData.properties.action_link },
        });
      }
    }
  } catch (err) {
    console.error("forgot-password email error:", err);
  }

  // Security: hamesha success return karo
  res.json({ success: true, message: "Agar email registered hai toh reset link aa jayega" });
});

/* ─────────────────────────────────────────
   GET /api/auth/accept-invite
   Email link yahan aata hai, frontend pe redirect karta hai with hash
   (scanners JS execute nahi karte — token safe rehta hai)
───────────────────────────────────────── */
router.get("/accept-invite", (req, res) => {
  const { token_hash, type = "invite" } = req.query;
  if (!token_hash) return res.status(400).send("Missing token_hash");
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  res.redirect(`${frontendUrl}/app.html?token_hash=${encodeURIComponent(token_hash)}&type=${type}`);
});

/* ─────────────────────────────────────────
   POST /api/auth/verify-otp
   Body: { token_hash, type }
   Used by PKCE invite/recovery links (query-param based, newer Supabase)
───────────────────────────────────────── */
router.post("/verify-otp", async (req, res) => {
  const { token_hash, type } = req.body;
  if (!token_hash || !type) return res.status(400).json({ error: "token_hash and type required" });

  const adminClient = getAdminClient();
  const { data, error } = await adminClient.auth.verifyOtp({ token_hash, type });

  if (error || !data?.session)
    return res.status(401).json({ error: error?.message || "Invalid or expired link. Please request a new invite." });

  res.json({
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
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
  const signedAvatar = await createSignedStorageUrl(admin, "picture", data.avatar);
  const signedProfilePermissions = { ...(data.profile_permissions || {}) };
  let signedCover = null;
  if (signedProfilePermissions.ui?.cover_image) {
    signedCover = await createSignedStorageUrl(admin, "picture", signedProfilePermissions.ui.cover_image);
    signedProfilePermissions.ui = { ...signedProfilePermissions.ui, cover_image: signedCover };
  }
  let signedSig = null;
  if (signedProfilePermissions.ui?.signature) {
    signedSig = await createSignedStorageUrl(admin, "picture", signedProfilePermissions.ui.signature);
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

  const newFileName = `avatar/${dbUser.id}_${Date.now()}.${ext}`;
  const admin       = getAdminClient();

  // Upload se pehle is user ki SAARI purani avatar files delete karo (cleanup)
  try {
    const { data: existingFiles } = await admin.storage.from("picture").list("avatar");
    if (existingFiles && existingFiles.length > 0) {
      const toDelete = existingFiles
        .filter(f => f.name.startsWith(`${dbUser.id}_`))
        .map(f => `avatar/${f.name}`);
      if (toDelete.length > 0) await admin.storage.from("picture").remove(toDelete);
    }
  } catch (err) {
    console.error("Cleanup failed, proceeding with upload:", err.message);
  }

  // Naya file upload karo
  const { error: uploadError } = await admin.storage
    .from("picture")
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
    .from("picture")
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

  const newFileName = `avatar/cover_${dbUser.id}_${Date.now()}.${ext}`;
  const admin       = getAdminClient();

  // Upload se pehle is user ki SAARI purani cover files delete karo
  const { data: existingCovers } = await admin.storage.from("picture").list("avatar", { search: `cover_${dbUser.id}_` });
  if (existingCovers && existingCovers.length > 0) {
    const toDelete = existingCovers
      .filter(f => f.name.startsWith(`cover_${dbUser.id}_`))
      .map(f => `avatar/${f.name}`);
    if (toDelete.length > 0) await admin.storage.from("picture").remove(toDelete);
  }

  const { error: uploadError } = await admin.storage
    .from("picture")
    .upload(newFileName, buffer, { contentType: mimeType });

  if (uploadError) return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });

  const { data: signedData, error: signedError } = await admin.storage
    .from("picture")
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
    await removeStorageFile(admin, "picture", dbUser.profile_permissions.ui.cover_image);
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

  const newFileName = `sign/sig_${dbUser.id}_${Date.now()}.${ext}`;
  const admin       = getAdminClient();

  // Purani signature files delete karo
  try {
    const { data: existingFiles } = await admin.storage.from("picture").list("sign");
    if (existingFiles?.length > 0) {
      const toDelete = existingFiles.filter(f => f.name.startsWith(`sig_${dbUser.id}_`)).map(f => `sign/${f.name}`);
      if (toDelete.length > 0) await admin.storage.from("picture").remove(toDelete);
    }
  } catch { /* ignore cleanup errors */ }

  const { error: uploadError } = await admin.storage
    .from("picture")
    .upload(newFileName, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });

  const { data: signedData, error: signedError } = await admin.storage
    .from("picture")
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
    await removeStorageFile(admin, "picture", dbUser.profile_permissions.ui.signature);
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
    await removeStorageFile(admin, "picture", dbUser.avatar);
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

  const filename = normalizeStoragePath(dbUser.avatar, "picture");
  if (!filename) return res.json({ url: null });

  const admin = getAdminClient();

  // File actually exists ki nahi check karo
  const folder = filename.includes("/") ? filename.slice(0, filename.lastIndexOf("/")) : "";
  const baseName = filename.includes("/") ? filename.slice(filename.lastIndexOf("/") + 1) : filename;
  const { data: fileList } = await admin.storage.from("picture").list(folder, { search: baseName });
  const fileExists = fileList?.some(f => f.name === baseName);

  if (!fileExists) {
    // File Storage se delete ho chuki — DB bhi clear karo
    await admin.from("users").update({ avatar: null }).eq("id", dbUser.id);
    return res.json({ url: null });
  }

  const { data, error } = await admin.storage
    .from("picture")
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
    .from("users").select("id, name").eq("email", email).single();
  if (dbErr || !userRow) return res.status(404).json({ error: "Email not found in system" });

  // 6-digit OTP generate karo
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Purane OTPs delete karo, naya insert karo
  await admin.from("otp_tokens").delete().eq("email", email);
  const { error: insertErr } = await admin.from("otp_tokens").insert({ email, otp, expires_at: expiresAt });
  if (insertErr) return res.status(500).json({ error: "OTP generate karne mein error hua" });

  // ZeptoMail se bhejo
  const otpName = userRow.name || email;
  try {
    await sendTemplateEmail({
      to:          email,
      toName:      otpName,
      templateKey: process.env.ZEPTOMAIL_TEMPLATE_OTP,
      mergeInfo:   { name: otpName, otp },
    });
  } catch (err) {
    console.error("OTP email error:", err);
    return res.status(500).json({ error: "OTP email bhejne mein error hua" });
  }

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
  const normalEmail = email.toLowerCase().trim();

  // OTP verify karo from otp_tokens table
  const { data: tokenRow, error: tokenErr } = await admin
    .from("otp_tokens").select("otp, expires_at").eq("email", normalEmail).single();

  if (tokenErr || !tokenRow) return res.status(400).json({ error: "Invalid or expired OTP" });
  if (new Date(tokenRow.expires_at) < new Date()) {
    await admin.from("otp_tokens").delete().eq("email", normalEmail);
    return res.status(400).json({ error: "OTP expired hai, dobara request karo" });
  }
  if (tokenRow.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });

  // OTP valid — delete karo (one-time use)
  await admin.from("otp_tokens").delete().eq("email", normalEmail);

  // User ID nikalo from our users table
  const { data: userRow } = await admin.from("users").select("id").eq("email", normalEmail).single();
  if (!userRow) return res.status(400).json({ error: "User not found" });

  // Password update karo via admin API
  const { error: pwError } = await admin.auth.admin.updateUserById(userRow.id, {
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
    .select("id, name, email, role, designation, department, contact_no, avatar, access_profile_ids, profile_permissions, permissions(*, modules(module_key, module_name))")
    .eq("id", userId)
    .single();

  if (!profile) return res.status(401).json({ error: "User not found" });
  const signedAvatar = await createSignedStorageUrl(admin, "picture", profile.avatar);
  const signedProfilePermissions = { ...(profile.profile_permissions || {}) };
  if (signedProfilePermissions.ui?.cover_image) {
    signedProfilePermissions.ui = {
      ...signedProfilePermissions.ui,
      cover_image: await createSignedStorageUrl(admin, "picture", signedProfilePermissions.ui.cover_image),
    };
  }
  let signedSignature = null;
  if (signedProfilePermissions.ui?.signature) {
    signedSignature = await createSignedStorageUrl(admin, "picture", signedProfilePermissions.ui.signature);
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

  // Fetch modules, user's explicit permissions, and their access profiles in parallel
  const [
    { data: modules },
    { data: perms },
    { data: userRow },
  ] = await Promise.all([
    admin.from("modules").select("*").eq("is_active", true).order("id"),
    admin.from("permissions").select("*").eq("user_id", userId),
    admin.from("users").select("access_profile_ids").eq("id", userId).single(),
  ]);

  // Also merge permissions from the user's linked access profiles (designations)
  // This ensures designation updates are reflected without re-saving per-user permissions
  const profileIds = userRow?.access_profile_ids || [];
  let profilePerms = [];
  if (profileIds.length > 0) {
    const { data: designations } = await admin.from("designations")
      .select("app_permissions")
      .in("id", profileIds);
    profilePerms = (designations || []).flatMap(d => d.app_permissions || []);
  }

  const BOOL_KEYS = [
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
    const explicit = (perms || []).find(p => p.module_id === mod.id) || {};
    const hasExplicit = !!explicit.user_id;
    // A saved per-user row fully overrides the Access Profile for that module
    // (even to restrict below it); profile only fills in untouched modules.
    const profMatches = profilePerms.filter(p => p.module_id === mod.id);
    const merged = {};
    BOOL_KEYS.forEach(k => {
      merged[k] = hasExplicit ? !!explicit[k] : profMatches.some(p => !!p[k]);
    });
    return {
      module_id:   mod.id,
      module_key:  mod.module_key,
      module_name: mod.module_name,
      ...merged,
      has_explicit_entry: hasExplicit,
    };
  });

  const hasAny = result.some(r => r.can_view);
  res.json({ permissions: result, has_any_permissions: hasAny });
});

/* ─────────────────────────────────────────
   GET /api/auth/init
   Single call: user profile + projects (replaces /me + /api/projects)
   Header: Authorization: Bearer <token>
───────────────────────────────────────── */
router.get("/init", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token required" });

  const userId = extractUserId(token);
  if (!userId) return res.status(401).json({ error: "Invalid token" });

  const admin = getAdminClient();

  const [profileRes, projectsRes] = await Promise.all([
    admin.from("users")
      .select("id, name, email, role, designation, department, contact_no, avatar, access_profile_ids, profile_permissions, is_active")
      .eq("id", userId).single(),
    admin.from("projects").select("id, project_name, project_code, city, state, is_active, logo_url").order("created_at", { ascending: true }),
  ]);

  if (!profileRes.data || !profileRes.data.is_active)
    return res.status(401).json({ error: "User not found or inactive" });

  const profile = profileRes.data;
  const signedAvatar = await createSignedStorageUrl(admin, "picture", profile.avatar);
  const signedProfilePermissions = { ...(profile.profile_permissions || {}) };
  if (signedProfilePermissions.ui?.cover_image) {
    signedProfilePermissions.ui = {
      ...signedProfilePermissions.ui,
      cover_image: await createSignedStorageUrl(admin, "picture", signedProfilePermissions.ui.cover_image),
    };
  }

  let projects = (projectsRes.data || []).map(r => ({
    id:          r.id,
    projectName: r.project_name || "",
    projectCode: r.project_code || "",
    city:        r.city         || "",
    state:       r.state        || "",
    isActive:    r.is_active !== false,
    logoUrl:     "",
  }));

  // Project Access restriction: union of the user's own allowed_projects and
  // any linked access profile's project_access. An empty effective list means
  // no restriction has ever been configured, so every project stays visible
  // (keeps existing users working exactly as before this was enforced).
  const isPrivileged = profile.role === "global_admin" || profile.role === "super_admin";
  if (!isPrivileged) {
    const profileIds = profile.access_profile_ids || [];
    let profileProjectAccess = [];
    if (profileIds.length > 0) {
      const { data: designations } = await admin.from("designations").select("project_access").in("id", profileIds);
      profileProjectAccess = (designations || []).flatMap(d => d.project_access || []);
    }
    const ownAllowedProjects = profile.profile_permissions?.allowed_projects || [];
    const effectiveAllowedProjects = [...new Set([...ownAllowedProjects, ...profileProjectAccess])];
    if (effectiveAllowedProjects.length > 0) {
      const allowedSet = new Set(effectiveAllowedProjects);
      projects = projects.filter(p => allowedSet.has(p.id));
    }
  }

  res.json({
    user: {
      ...profile,
      avatar: signedAvatar || null,
      profile_permissions: signedProfilePermissions,
    },
    projects,
  });
});

module.exports = router;
