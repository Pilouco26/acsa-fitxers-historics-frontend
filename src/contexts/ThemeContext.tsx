import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getTheme,
  setTheme as persistTheme,
  type ThemePreference,
} from "@/config";
import { useAuth } from "@/contexts/AuthContext";

interface ThemeContextValue {
  /** Stored preference (may be dark even when not applied). */
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
  /** Whether dark theme is currently applied (admin + dark preference). */
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyDocumentTheme(isDark: boolean): void {
  const root = document.documentElement;
  if (isDark) {
    root.dataset.theme = "dark";
    root.style.colorScheme = "dark";
  } else {
    delete root.dataset.theme;
    root.style.colorScheme = "light";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  const [theme, setThemeState] = useState<ThemePreference>(() => getTheme());

  const isDark = isAdmin && theme === "dark";

  useEffect(() => {
    applyDocumentTheme(isDark);
  }, [isDark]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    persistTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, isDark }),
    [theme, setTheme, toggleTheme, isDark],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
