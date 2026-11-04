const KEY = "access_token";

// Fired when the server says our token is no longer valid
export const AUTH_EXPIRED_EVENT = "auth:expired";

// Wrapped in try/catch because browsers can block storage (private mode, etc.)
export const tokenStorage = {
  get() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(KEY, token);
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
