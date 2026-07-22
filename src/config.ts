declare global {
  interface Window {
    __ACSA_CONFIG__?: {
      apiUrl?: string;
    };
  }
}

const ACCESS_TOKEN_KEY = "acsa_access_token";
const USER_TYPE_KEY = "acsa_user_type";
const USER_ROLE_KEY = "acsa_user_role";
const ADMIN_VIEW_MODE_KEY = "acsa_admin_view_mode";
const USERNAME_KEY = "acsa_username";

function runtimeConfig(): NonNullable<Window["__ACSA_CONFIG__"]> {
  return window.__ACSA_CONFIG__ ?? {};
}

export function getApiBaseUrl(): string {
  const url = runtimeConfig().apiUrl ?? import.meta.env.VITE_API_URL ?? "/api";
  return url.replace(/\/$/, "") || "/api";
}

export function getAccessToken(): string | null {
  try {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    return token?.trim() || null;
  } catch {
    return null;
  }
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getUserType(): string | null {
  try {
    return localStorage.getItem(USER_TYPE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function setUserType(type: string): void {
  localStorage.setItem(USER_TYPE_KEY, type);
}

export function clearUserType(): void {
  try {
    localStorage.removeItem(USER_TYPE_KEY);
  } catch {
    /* ignore */
  }
}

export function getUserRole(): string | null {
  try {
    return localStorage.getItem(USER_ROLE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function setUserRole(role: string): void {
  localStorage.setItem(USER_ROLE_KEY, role);
}

export function clearUserRole(): void {
  try {
    localStorage.removeItem(USER_ROLE_KEY);
  } catch {
    /* ignore */
  }
}

export function getAdminViewMode(): string | null {
  try {
    return localStorage.getItem(ADMIN_VIEW_MODE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function setAdminViewMode(mode: string): void {
  localStorage.setItem(ADMIN_VIEW_MODE_KEY, mode);
}

export function clearAdminViewMode(): void {
  try {
    localStorage.removeItem(ADMIN_VIEW_MODE_KEY);
  } catch {
    /* ignore */
  }
}

export function getUsername(): string | null {
  try {
    return localStorage.getItem(USERNAME_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function setUsername(username: string): void {
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearUsername(): void {
  try {
    localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* ignore */
  }
}

export function clearSession(): void {
  clearAccessToken();
  clearUserType();
  clearUserRole();
  clearAdminViewMode();
  clearUsername();
}
