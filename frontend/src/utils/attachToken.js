/*
 * Every request to our API carries the login token — the backend refuses
 * /api calls without one. Many pages call fetch() / EventSource directly, so
 * instead of changing each of them this adds the token in one place:
 *   - fetch(): adds "Authorization: Bearer …" when the call doesn't set one,
 *     and on a 401 refreshes the token once and retries
 *   - EventSource (live updates): can't send headers, so ?token=… is added
 * Imported first thing in main.jsx.
 */
import { getValidToken } from "./authFetch";

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
// sign-in calls must never wait on a token refresh (the refresh itself is one)
const NO_TOKEN = ["/api/auth/login", "/api/auth/refresh", "/api/auth/forgot-password", "/api/auth/verify-otp", "/api/auth/reset-password"];

const urlOf = (input) => (typeof input === "string" ? input : input instanceof URL ? input.href : input?.url || "");
const isApi = (url) => url.startsWith(`${BASE}/api/`) || url.startsWith("/api/");
const skip = (url) => NO_TOKEN.some(p => url.includes(p));

if (typeof window !== "undefined" && !window.__zyTokenAttached) {
  window.__zyTokenAttached = true;

  const realFetch = window.fetch.bind(window);
  const withToken = (input, init, token) => {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return [input, { ...init, headers }];
  };

  window.fetch = async (input, init) => {
    const url = urlOf(input);
    if (!isApi(url) || skip(url)) return realFetch(input, init);
    const given = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined)).get("Authorization");
    if (given) return realFetch(input, init); // the page set its own

    const res = await realFetch(...withToken(input, init, localStorage.getItem("bms_token")));
    if (res.status !== 401 || !localStorage.getItem("bms_refresh_token")) return res;
    // token ran out — refresh once and try again
    const fresh = await getValidToken().catch(() => null);
    return fresh ? realFetch(...withToken(input, init, fresh)) : res;
  };

  const RealES = window.EventSource;
  if (RealES) {
    window.EventSource = function EventSource(url, config) {
      let u = String(url);
      const token = localStorage.getItem("bms_token");
      if (isApi(u) && token && !/[?&]token=/.test(u)) u += `${u.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
      return new RealES(u, config);
    };
    window.EventSource.prototype = RealES.prototype;
    Object.assign(window.EventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2 });
  }
}
