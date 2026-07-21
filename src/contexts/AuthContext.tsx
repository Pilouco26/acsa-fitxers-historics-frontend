import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  login as apiLogin,
  logout as apiLogout,
  ApiError,
} from "@/api/client";
import { getAccessToken } from "@/config";

/** Log out after this much idle time while authenticated. */
export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function useInactivityLogout(onIdle: () => void, enabled: boolean) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let lastReset = 0;

    const schedule = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => onIdleRef.current(), INACTIVITY_TIMEOUT_MS);
    };

    const onActivity = () => {
      const now = Date.now();
      // Throttle resets — mousemove fires very often
      if (now - lastReset < 1000) return;
      lastReset = now;
      schedule();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    schedule();

    return () => {
      clearTimeout(timeoutId);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [enabled]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => getAccessToken());

  const login = useCallback(async (username: string, password: string) => {
    const out = await apiLogin({
      username: username.trim(),
      password,
    });
    setToken(out.access_token);
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  useInactivityLogout(logout, Boolean(token));

  const value = useMemo(
    () => ({
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [token, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function getLoginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return "Usuari o contrasenya incorrectes.";
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "No s'ha pogut iniciar sessió.";
}
