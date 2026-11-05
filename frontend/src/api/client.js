import axios from "axios";

import { AUTH_EXPIRED_EVENT, tokenStorage } from "../utils/tokenStorage";

// A free Render server that was asleep needs up to about a minute to wake up
const TIMEOUT_MS = 60000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  timeout: TIMEOUT_MS,
});

// Attach the login token to every request automatically
apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the server rejects our token (expired/invalid), log the user out.
// A read request that got no answer at all (server waking up) is retried a couple of times.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    const noAnswer = !error.response && !axios.isCancel(error);
    const isRead = config && (config.method || "get").toLowerCase() === "get";

    if (noAnswer && isRead && (config.__retryCount || 0) < MAX_RETRIES) {
      config.__retryCount = (config.__retryCount || 0) + 1;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return apiClient(config);
    }

    const status = error.response?.status;
    const url = config?.url || "";
    const isAuthForm = url.includes("/api/auth/login") || url.includes("/api/auth/register");

    if (status === 401 && !isAuthForm && tokenStorage.get()) {
      tokenStorage.clear();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

export default apiClient;