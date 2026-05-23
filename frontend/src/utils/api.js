import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("bms_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let queue = [];

const processQueue = (error, token = null) => {
  queue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token));
  queue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem("bms_refresh_token");
    if (!refreshToken) {
      localStorage.removeItem("bms_token");
      localStorage.removeItem("bms_user");
      window.location.href = "/";
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post(`${BASE}/api/auth/refresh`, {
        refresh_token: refreshToken,
      });
      localStorage.setItem("bms_token", data.token);
      localStorage.setItem("bms_refresh_token", data.refresh_token);
      api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
      processQueue(null, data.token);
      original.headers.Authorization = `Bearer ${data.token}`;
      return api(original);
    } catch (err) {
      processQueue(err, null);
      localStorage.removeItem("bms_token");
      localStorage.removeItem("bms_refresh_token");
      localStorage.removeItem("bms_user");
      window.location.href = "/";
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
