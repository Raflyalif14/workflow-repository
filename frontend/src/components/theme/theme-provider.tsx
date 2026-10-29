"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { resolveTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const ThemeContext = createContext<{ theme: Theme; ready: boolean; storageError: boolean; setTheme: (theme: Theme) => void } | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const applyTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    setThemeState(next);
  }, []);

  useEffect(() => {
    // Preserve the head script's choice without changing the SSR markup on hydration.
    applyTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      try {
        if (event.storageArea !== window.localStorage) return;
        applyTheme(resolveTheme(window.localStorage.getItem(THEME_STORAGE_KEY)));
        setStorageError(false);
      } catch { setStorageError(true); }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [applyTheme]);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next); setStorageError(false); }
    catch { setStorageError(true); }
  }, [applyTheme]);

  return <ThemeContext.Provider value={{ theme, ready, storageError, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
