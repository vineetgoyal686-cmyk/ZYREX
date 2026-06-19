const admin = require("../helpers/supabaseHelper");

// In-memory cache: userId -> { profile, expiresAt }
const userCache = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

const decodeJwt = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch { return null; }
};

const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required" });

  const payload = decodeJwt(token);
  if (!payload?.sub) return res.status(401).json({ error: "Invalid token" });

  if (payload.exp && payload.exp * 1000 < Date.now()) {
    return res.status(401).json({ error: "Token expired" });
  }

  const userId = payload.sub;
  const now = Date.now();
  const cached = userCache.get(userId);

  if (cached && cached.expiresAt > now) {
    req.user = cached.profile;
    return next();
  }

  const { data: profile } = await admin.from("users").select("*").eq("id", userId).single();
  if (!profile || !profile.is_active) return res.status(403).json({ error: "Account inactive" });

  userCache.set(userId, { profile, expiresAt: now + CACHE_TTL });
  req.user = profile;
  next();
};

// Call this after a user profile update to bust the cache
const bustUserCache = (userId) => userCache.delete(userId);

module.exports = { requireAuth, bustUserCache };
