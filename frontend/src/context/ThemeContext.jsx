import { createContext, useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "theme";

export const ThemeContext = createContext(null);

// Wrapped in try/catch because browsers can block storage (private mode, etc.)
function readSaved() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function systemPrefersDark() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }) {
  // First visit: follow the device setting. After that: the user's own choice.
  const [theme, setTheme] = useState(() => readSaved() ?? (systemPrefersDark() ? "dark" : "light"));

  // Put the "dark" class on <html>; index.css does the rest
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  // Until the user picks a theme, keep following the device setting
  useEffect(() => {
    let media;
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return undefined;
    }
    const onChange = (event) => {
      if (readSaved() === null) setTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }, [theme]);

  const value = useMemo(() => ({ theme, isDark: theme === "dark", toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}