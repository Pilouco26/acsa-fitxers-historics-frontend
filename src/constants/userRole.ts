/** Authorization role from JWT / login (separate from tenancy `type`). */
export type UserRole = "personal" | "empresa" | "admin";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  personal: "Personal",
  empresa: "Empresa",
  admin: "Administrador",
};

export function normalizeUserRole(
  value: string | null | undefined,
): UserRole | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (raw === "personal" || raw === "empresa" || raw === "admin") return raw;
  return null;
}

export function userRoleLabel(role: UserRole | null | undefined): string {
  if (!role) return "";
  return USER_ROLE_LABELS[role];
}

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "admin";
}

/** Default landing path after login / root redirect. */
export function homePathForRole(role: UserRole | null | undefined): string {
  return isAdminRole(role) ? "/settings" : "/upload";
}

/** Infer role from tenancy type when JWT/login omits `role` (legacy sessions). */
export function roleFromAppType(
  type: string | null | undefined,
): UserRole | null {
  if (!type) return null;
  const raw = type.trim().toUpperCase();
  if (raw === "PERSONAL" || raw === "FAMILIA" || raw === "FAMILIAR") {
    return "personal";
  }
  if (raw === "EMPRESA") return "empresa";
  return null;
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    const payload = JSON.parse(json) as Record<string, unknown>;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

/** Read `role` claim from a JWT access token (session restore without stored role). */
export function roleFromAccessToken(
  token: string | null | undefined,
): UserRole | null {
  if (!token?.trim()) return null;
  const payload = parseJwtPayload(token.trim());
  if (!payload) return null;
  const direct = normalizeUserRole(
    typeof payload.role === "string" ? payload.role : null,
  );
  if (direct) return direct;
  return roleFromAppType(
    typeof payload.type === "string" ? payload.type : null,
  );
}
