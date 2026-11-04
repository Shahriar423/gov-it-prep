import axios from "axios";

import { AUTH_EXPIRED_EVENT, tokenStorage } from "../utils/tokenStorage";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  timeout: 8000,
});

// Attach the login token to every request automatically
apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the server rejects our token (expired/invalid), log the user out
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || "";
    const isAuthForm = url.includes("/api/auth/login") || url.includes("/api/auth/register");

    if (status === 401 && !isAuthForm && tokenStorage.get()) {
      tokenStorage.clear();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

export default apiClient;
