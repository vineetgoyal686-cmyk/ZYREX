import axios from 'axios';
import { getValidToken } from './utils/authFetch';

const API = axios.create({
  // Ye line automatically .env se URL utha legi
  baseURL: import.meta.env.VITE_API_URL
});

// The backend needs the login token on every /api call
API.interceptors.request.use(async (config) => {
  const token = await getValidToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default API;
