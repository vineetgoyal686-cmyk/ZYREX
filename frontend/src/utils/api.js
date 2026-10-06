import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const api = axios.create({ baseURL: BASE });

// Expiry (ms) from the JWT payload; 0 if it can't be read.
const tokenExpiry = (token) => {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(part)).exp || 0) * 1000;
  } catch {
    return 0;
  }
};

const logout = () => {
  localStorage.removeItem("bms_token");
  localStorage.removeItem("bms_refresh_token");
  localStorage.removeItem("bms_user");
  window.location.href = "/app.html";
};

// One refresh at a time: every caller that needs a new token while a
// refresh is running waits on the same promise (refresh tokens rotate, so
// two parallel refreshes would log the user out).
let refreshing = null;
const refreshAccessToken = () => {
  if (!refreshing) {
    const refreshToken = localStorage.getItem("bms_refresh_token");
    refreshing = (refreshToken
      ? axios.post(`${BASE}/api/auth/refresh`, { refresh_token: refreshToken }).then(({ data }) => {
          localStorage.setItem("bms_token", data.token);
          localStorage.setItem("bms_refresh_token", data.refresh_token);
          api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
          return data.token;
        })
      : Promise.reject(new Error("No refresh token"))
    ).finally(() => { refreshing = null; });
  }
  return refreshing;
};

const isAuthCall = (url = "") => url.includes("/api/auth/login") || url.includes("/api/auth/refresh");

// Refresh a token that has expired or is about to, BEFORE sending. File
// uploads need this: the server rejects an expired token while the browser
// is still sending the files and drops the connection, so the browser only
// reports "Network Error" and the 401 handler below never sees a 401.
api.interceptors.request.use(async (config) => {
  let token = localStorage.getItem("bms_token");
  const exp = token ? tokenExpiry(token) : 0;
  if (token && exp && exp - Date.now() < 60_000 && !isAuthCall(config.url) && localStorage.getItem("bms_refresh_token")) {
    try { token = await refreshAccessToken(); } catch { /* the 401 handler deals with it */ }
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // Don't intercept 401s from the login endpoint itself — let the form handle the error
    if (isAuthCall(original.url)) {
      return Promise.reject(error);
    }

    if (!localStorage.getItem("bms_refresh_token")) {
      logout();
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      const token = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (err) {
      logout();
      return Promise.reject(err);
    }
  }
);

export default api;
