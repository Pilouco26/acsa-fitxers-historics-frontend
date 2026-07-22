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
import {
  clearAdminViewMode,
  clearUserType,
  getAccessToken,
  getAdminViewMode,
  getUserRole,
  getUserType,
  getUsername,
  setAdminViewMode as persistAdminViewMode,
  setUserRole,
  setUserType,
  setUsername,
} from "@/config";
import {
  adminViewModeLabel,
  apiModeFromViewMode,
  appModeLabel,
  normalizeAdminViewMode,
  normalizeAppMode,
  type AdminViewMode,
  type AppMode,
} from "@/constants/appMode";
import {
  isAdminRole,
  normalizeUserRole,
  roleFromAccessToken,
  roleFromAppType,
  userRoleLabel,
  type UserRole,
} from "@/constants/userRole";

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
  /** Login tenancy type; may be null for admin. */
  userType: AppMode | null;
  /**
   * Admin data-scope filter (PERSONAL | EMPRESA | ALL).
   * Non-admins mirror their fixed `userType` (or PERSONAL fallback).
   */
  viewMode: AdminViewMode;
  /**
   * Concrete `mode` to send on admin-scoped API calls.
   * `null` when view is Tots or the user is not admin (backend scopes by JWT).
   */
  apiMode: AppMode | null;
  setViewMode: (mode: AdminViewMode) => void;
  role: UserRole | null;
  isAdmin: boolean;
  canConfigure: boolean;
  username: string | null;
  userTypeLabel: string;
  viewModeLabel: string;
  roleLabel: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function resolveStoredRole(): UserRole | null {
  const stored = normalizeUserRole(getUserRole());
  if (stored) return stored;
  const fromToken = roleFromAccessToken(getAccessToken());
  if (fromToken) return fromToken;
  return roleFromAppType(getUserType());
}

function resolveInitialViewMode(
  isAdmin: boolean,
  userType: AppMode | null,
): AdminViewMode {
  if (!isAdmin) return userType ?? "PERSONAL";
  const stored = normalizeAdminViewMode(getAdminViewMode());
  if (stored) return stored;
  return userType ?? "ALL";
}

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
  const [userType, setUserTypeState] = useState<AppMode | null>(() =>
    normalizeAppMode(getUserType()),
  );
  const [role, setRoleState] = useState<UserRole | null>(() => resolveStoredRole());
  const [username, setUsernameState] = useState<string | null>(() => getUsername());
  const initialAdmin = isAdminRole(resolveStoredRole());
  const [viewMode, setViewModeState] = useState<AdminViewMode>(() =>
    resolveInitialViewMode(initialAdmin, normalizeAppMode(getUserType())),
  );

  const login = useCallback(async (usernameValue: string, password: string) => {
    const out = await apiLogin({
      username: usernameValue.trim(),
      password,
    });
    setToken(out.access_token);
    const mode = normalizeAppMode(out.type);
    setUserTypeState(mode);
    if (mode) setUserType(mode);
    else clearUserType();
    const nextRole =
      normalizeUserRole(out.role) ??
      roleFromAccessToken(out.access_token) ??
      roleFromAppType(out.type);
    setRoleState(nextRole);
    if (nextRole) setUserRole(nextRole);
    const admin = isAdminRole(nextRole);
    const nextView = resolveInitialViewMode(admin, mode);
    setViewModeState(nextView);
    if (admin) persistAdminViewMode(nextView);
    else clearAdminViewMode();
    const name = out.username ?? usernameValue.trim();
    setUsernameState(name);
    setUsername(name);
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setToken(null);
    setUserTypeState(null);
    setRoleState(null);
    setViewModeState("ALL");
    setUsernameState(null);
    queryClient.clear();
  }, [queryClient]);

  const isAdmin = isAdminRole(role);

  const setViewMode = useCallback(
    (mode: AdminViewMode) => {
      if (!isAdmin) return;
      setViewModeState(mode);
      persistAdminViewMode(mode);
      void queryClient.invalidateQueries();
    },
    [isAdmin, queryClient],
  );

  useInactivityLogout(logout, Boolean(token));

  const apiMode = isAdmin ? apiModeFromViewMode(viewMode) : null;

  const value = useMemo(
    () => ({
      isAuthenticated: Boolean(token),
      userType,
      viewMode: isAdmin ? viewMode : (userType ?? "PERSONAL"),
      apiMode,
      setViewMode,
      role,
      isAdmin,
      canConfigure: isAdmin,
      username,
      userTypeLabel: appModeLabel(userType),
      viewModeLabel: isAdmin
        ? adminViewModeLabel(viewMode)
        : appModeLabel(userType),
      roleLabel: userRoleLabel(role),
      login,
      logout,
    }),
    [
      token,
      userType,
      viewMode,
      apiMode,
      setViewMode,
      role,
      isAdmin,
      username,
      login,
      logout,
    ],
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
