import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";

// Light/dark switch for the navbar. The label names what the click does, not the
// state it's in, so it reads the same as every other action in the app.
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
