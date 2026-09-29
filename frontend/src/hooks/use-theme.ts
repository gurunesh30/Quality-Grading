/**
 * Light/dark/system theme, persisted to `localStorage` under `agrigrade-theme`.
 *
 * Defaults to dark: the capture view puts a bright live feed in the middle of
 * the page, and a dark chrome keeps the surrounding UI from competing with it.
 */

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "agrigrade-theme";
const DEFAULT_THEME: Theme = "dark";

function read(): Theme {
  if (typeof localStorage === "undefined") return DEFAULT_THEME;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : DEFAULT_THEME;
}

function systemPrefersDark(): boolean {
  if (typeof matchMedia === "undefined") return true;
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(theme: Theme): ResolvedTheme {
  const resolved: ResolvedTheme =
    theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;

  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
  }
  return resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(read);
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    apply(read()),
  );

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setResolved(apply(next));
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  // Track OS changes while the user is on `system`.
  useEffect(() => {
    if (theme !== "system" || typeof matchMedia === "undefined") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(apply("system"));
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  return { theme, resolved, setTheme, toggle };
}
