declare global {
  interface Window {
    __ACSA_CONFIG__?: {
      apiUrl?: string;
    };
  }
}

const ACCESS_TOKEN_KEY = "acsa_access_token";

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
