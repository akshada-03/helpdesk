import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

// Also read by the pre-paint script in index.html — keep the key in sync.
const STORAGE_KEY = "theme";

// jsdom doesn't implement matchMedia, and Navbar renders unstubbed in some
// component tests, so every use of it is guarded rather than assumed.
function prefersDark(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Seeded from the class the pre-paint script already put on <html>, so the hook
// can never disagree with what's on screen.
function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

// Light/dark with an explicit user choice persisted to localStorage. Until the
// user picks one, the app follows the OS setting and keeps following it live.
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(currentTheme);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    // An explicit choice wins — once the user has picked, OS changes are ignored.
    function onChange() {
      if (localStorage.getItem(STORAGE_KEY)) return;
      const next: Theme = prefersDark() ? "dark" : "light";
      applyTheme(next);
      setThemeState(next);
    }

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  return { theme, setTheme, toggleTheme };
}
