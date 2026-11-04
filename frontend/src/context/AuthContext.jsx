import { createContext, useCallback, useEffect, useMemo, useState } from "react";

import { fetchMe, loginRequest, registerRequest } from "../api/auth.api";
import { AUTH_EXPIRED_EVENT, tokenStorage } from "../utils/tokenStorage";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Only "loading" at startup if there is a saved token to check
  const [loading, setLoading] = useState(() => Boolean(tokenStorage.get()));

  // On page load: if a token is saved, ask the server who we are
  useEffect(() => {
    if (!tokenStorage.get()) return;
    let cancelled = false;

    fetchMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch((err) => {
        if (err.response?.status === 401) tokenStorage.clear();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // If any request later finds the token expired, drop the user
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await loginRequest({ email, password });
    tokenStorage.set(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await registerRequest(payload);
    tokenStorage.set(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  // Used by the Profile page after the user's details change
  const updateUser = useCallback((nextUser) => setUser(nextUser), []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateUser }),
    [user, loading, login, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}