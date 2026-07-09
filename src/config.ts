declare global {
  interface Window {
    __ACSA_CONFIG__?: {
      apiKey?: string;
      apiUrl?: string;
    };
  }
}

function runtimeConfig(): NonNullable<Window["__ACSA_CONFIG__"]> {
  return window.__ACSA_CONFIG__ ?? {};
}

export function getApiKey(): string {
  return (runtimeConfig().apiKey ?? import.meta.env.VITE_API_KEY ?? "").trim();
}

export function getApiBaseUrl(): string {
  const url = runtimeConfig().apiUrl ?? import.meta.env.VITE_API_URL ?? "/api";
  return url.replace(/\/$/, "") || "/api";
}
