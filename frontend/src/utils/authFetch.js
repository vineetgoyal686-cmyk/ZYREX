const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const decodeExp = (token) => {
  try { return JSON.parse(atob(token.split(".")[1])).exp; } catch { return 0; }
};

let refreshPromise = null;

async function refreshToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refresh = localStorage.getItem("bms_refresh_token");
    if (!refresh) return null;
    try {
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("bms_token", data.token);
        localStorage.setItem("bms_refresh_token", data.refresh_token);
        return data.token;
      }
    } catch {}
    return null;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function logout() {
  localStorage.removeItem("bms_token");
  localStorage.removeItem("bms_refresh_token");
  localStorage.removeItem("bms_user");
  window.location.href = "/app.html";
}

export async function getValidToken() {
  let token = localStorage.getItem("bms_token") || "";
  const exp = decodeExp(token);
  // Refresh if expires within 60 seconds
  if (exp && exp * 1000 - Date.now() < 60_000) {
    const newToken = await refreshToken();
    if (newToken) token = newToken;
    else { logout(); return ""; }
  }
  return token;
}

export async function authFetch(url, options = {}) {
  const token = await getValidToken();
  const res = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    // One retry with fresh token
    const newToken = await refreshToken();
    if (!newToken) { logout(); throw new Error("Session expired"); }
    const retry = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${newToken}` },
    });
    if (retry.status === 401) { logout(); throw new Error("Session expired"); }
    return retry;
  }
  return res;
}
