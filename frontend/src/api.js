import axios from 'axios';

const API = axios.create({
  // Ye line automatically .env se URL utha legi
  baseURL: import.meta.env.VITE_API_URL 
});

export default API;
