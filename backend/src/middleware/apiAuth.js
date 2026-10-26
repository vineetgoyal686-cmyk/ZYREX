const admin = require("../helpers/supabaseHelper");

/*
 * One login check in front of every /api route.
 *
 * The token is checked with Supabase itself (auth.getUser), not just read,
 * so a hand-made token is refused. A verified token is remembered until it
 * expires (at most 10 minutes), so this costs one Supabase call per token,
 * not one per request.
 *
 * Only what is needed before signing in stays open (PUBLIC below). Browser
 * live-update streams (EventSource) can't send headers, so a GET may carry
 * the token as ?token=… instead.
 */
const PUBLIC = [
  ["POST", "/api/auth/login"],
  ["POST", "/api/auth/refresh"],
  ["POST", "/api/auth/forgot-password"],
  ["POST", "/api/auth/verify-otp"],
  ["POST", "/api/auth/reset-password"],
  ["GET",  "/api/auth/accept-invite"],
  ["GET",  "/api/auth/service-lock"],
  ["POST", "/api/contact"],            // the landing page's contact form
];
const isPublic = (method, path) => PUBLIC.some(([m, p]) => m === method && (path === p || path === `${p}/`));

const verified = new Map(); // token → { userId, until }
const MAX_REMEMBER_MS = 10 * 60 * 1000;

const decodeExp = (token) => {
  try { return (JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).exp || 0) * 1000; }
  catch { return 0; }
};

async function verifyToken(token) {
  const now = Date.now();
  const hit = verified.get(token);
  if (hit && hit.until > now) return hit.userId;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) return null;

  const exp = decodeExp(token) || now + MAX_REMEMBER_MS;
  verified.set(token, { userId: data.user.id, until: Math.min(exp, now + MAX_REMEMBER_MS) });
  // keep the memory small: drop anything expired once it grows
  if (verified.size > 5000) for (const [t, v] of verified) if (v.until <= now) verified.delete(t);
  return data.user.id;
}

async function apiAuth(req, res, next) {
  if (req.method === "OPTIONS" || isPublic(req.method, req.path === "/" ? req.baseUrl : `${req.baseUrl}${req.path}`)) return next();

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7)
    : req.method === "GET" && typeof req.query.token === "string" ? req.query.token : "";
  if (!token) return res.status(401).json({ error: "Login required" });

  try {
    const userId = await verifyToken(token);
    if (!userId) return res.status(401).json({ error: "Session expired — please log in again" });
    // later checks (requireAuth / requirePerm) read the header, so put a ?token= one there too
    if (!header) req.headers.authorization = `Bearer ${token}`;
    req._verifiedUserId = userId;
    next();
  } catch (err) {
    console.error("Auth check failed:", err.message);
    res.status(503).json({ error: "Couldn't check your login right now — please try again" });
  }
}

module.exports = { apiAuth };
