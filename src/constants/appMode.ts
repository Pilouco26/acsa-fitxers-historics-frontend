/** App tenancy mode (matches backend JWT `type` / row `mode`). */
export type AppMode = "PERSONAL" | "EMPRESA";

/**
 * Admin data-scope filter. `ALL` ("Tots") omits `mode` on API calls so the
 * backend returns every tenancy; PERSONAL/EMPRESA filter to that scope.
 */
export type AdminViewMode = AppMode | "ALL";

export const APP_MODE_LABELS: Record<AppMode, string> = {
  PERSONAL: "Personal",
  EMPRESA: "Empresa",
};

export const ADMIN_VIEW_MODE_LABELS: Record<AdminViewMode, string> = {
  PERSONAL: "Personal",
  EMPRESA: "Empresa",
  ALL: "Tots",
};

export const ADMIN_VIEW_MODE_OPTIONS: AdminViewMode[] = [
  "EMPRESA",
  "PERSONAL",
  "ALL",
];

/** Map legacy FAMILIA / FAMILIAR → PERSONAL. */
export function normalizeAppMode(value: string | null | undefined): AppMode | null {
  if (!value) return null;
  const raw = value.trim().toUpperCase();
  if (raw === "FAMILIA" || raw === "FAMILIAR" || raw === "PERSONAL") return "PERSONAL";
  if (raw === "EMPRESA") return "EMPRESA";
  return null;
}

export function normalizeAdminViewMode(
  value: string | null | undefined,
): AdminViewMode | null {
  if (!value) return null;
  const raw = value.trim().toUpperCase();
  if (raw === "ALL" || raw === "TOTS" || raw === "*") return "ALL";
  return normalizeAppMode(raw);
}

export function appModeLabel(mode: AppMode | null | undefined): string {
  if (!mode) return "";
  return APP_MODE_LABELS[mode];
}

export function adminViewModeLabel(
  mode: AdminViewMode | null | undefined,
): string {
  if (!mode) return "";
  return ADMIN_VIEW_MODE_LABELS[mode];
}

/** Concrete mode for API `mode` param; `null` means omit (Tots / non-admin). */
export function apiModeFromViewMode(
  viewMode: AdminViewMode | null | undefined,
): AppMode | null {
  if (!viewMode || viewMode === "ALL") return null;
  return viewMode;
}
