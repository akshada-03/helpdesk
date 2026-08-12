import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

// Also read by the pre-paint script in index.html — keep the key in sync.
const STORAGE_KEY = "theme";

function currentTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light") return "light";
    if (saved === "dark") return "dark";
  } catch (e) {
    // Ignore storage errors
  }
  return "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(currentTheme);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      // Ignore storage errors
    }
    setThemeState(next);
  }, []);

  useEffect(() => {
    // Ensure initial theme is applied to DOM on mount
    const initial = currentTheme();
    applyTheme(initial);
    setThemeState(initial);
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  return { theme, setTheme, toggleTheme };
}
