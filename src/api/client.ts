import type {
  AnalyzeJobRequest,
  ApiEnvelope,
  ApplyRequest,
  ApplyResponse,
  AssignRequest,
  AssignResponse,
  BatchUploadOut,
  CompareResponse,
  DocumentFilters,
  DocumentListResponse,
  DocumentOut,
  DocumentUpdate,
  EmailAssignRequest,
  EmailAssignResponse,
  EmailAnalyzeRequest,
  EmailFilters,
  EmailListResponse,
  EmailOut,
  EmailUpdate,
  FolderListResponse,
  HealthOut,
  JobCreated,
  JobOut,
  RevertResponse,
  SettingsOut,
  SettingsUpdate,
  UploadOut,
} from "./types";
import toast from "react-hot-toast";

const BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "/api";

const API_KEY = import.meta.env.VITE_API_KEY?.trim() || "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function buildHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(extra as Record<string, string>),
  };
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }
  return headers;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d: { msg?: string }) => d.msg).join(", ");
    }
  } catch {
    /* ignore */
  }
  return res.statusText || `Error HTTP ${res.status}`;
}

function unwrapEnvelope<T>(body: T | ApiEnvelope<T>): T {
  if (
    body !== null &&
    typeof body === "object" &&
    "status" in body &&
    "data" in body
  ) {
    return (body as ApiEnvelope<T>).data;
  }
  return body;
}

type RequestToast =
  | {
      success?: string;
      errorPrefix?: string;
    }
  | false;

async function request<T>(
  path: string,
  init?: RequestInit,
  toastCfg?: RequestToast,
): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: buildHeaders(init?.headers),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await parseError(res));
    }
    if (res.status === 204) {
      if (toastCfg && toastCfg.success) toast.success(toastCfg.success);
      return undefined as T;
    }
    const body = (await res.json()) as T | ApiEnvelope<T>;
    const unwrapped = unwrapEnvelope(body);
    if (toastCfg && toastCfg.success) toast.success(toastCfg.success);
    return unwrapped;
  } catch (err) {
    if (toastCfg) {
      const msg =
        err instanceof Error ? err.message : "Unknown error";
      toast.error(`${toastCfg.errorPrefix ?? "Error"}: ${msg}`);
    }
    throw err;
  }
}

// --- Health ---

export function getHealth(): Promise<HealthOut> {
  return request<HealthOut>("/health");
}

// --- Files ---

export async function uploadFile(file: File): Promise<UploadOut> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/files/upload`, {
      method: "POST",
      headers: API_KEY ? { "X-API-Key": API_KEY } : undefined,
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, await parseError(res));
    const body = await res.json();
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : undefined;
    const out = unwrapEnvelope(body);
    toast.success(message ?? "Càrrega completada");
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    toast.error(`Error en la càrrega: ${msg}`);
    throw err;
  }
}

export async function uploadBatch(files: File[]): Promise<BatchUploadOut> {
  try {
    const form = new FormData();
    for (const f of files) {
      form.append("files", f);
    }
    const res = await fetch(`${BASE}/files/upload/batch`, {
      method: "POST",
      headers: API_KEY ? { "X-API-Key": API_KEY } : undefined,
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, await parseError(res));
    const body = await res.json();
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : undefined;
    const out = unwrapEnvelope(body);
    toast.success(message ?? "Càrrega múltiple completada");
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    toast.error(`Error en la càrrega múltiple: ${msg}`);
    throw err;
  }
}

// --- Documents ---

export function listDocuments(
  params: DocumentFilters = {},
): Promise<DocumentListResponse> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.folder) qs.set("folder", params.folder);
  if (params.q) qs.set("q", params.q);
  if (params.proposed_name) qs.set("proposed_name", params.proposed_name);
  if (params.company_folder) qs.set("company_folder", params.company_folder);
  if (params.order_by) qs.set("order_by", params.order_by);
  if (params.order) qs.set("order", params.order);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return request<DocumentListResponse>(
    `/documents${query ? `?${query}` : ""}`,
  );
}

export function getDocument(id: number): Promise<DocumentOut> {
  return request<DocumentOut>(`/documents/${id}`);
}

export function updateDocument(
  id: number,
  body: DocumentUpdate,
): Promise<DocumentOut> {
  return request<DocumentOut>(`/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { success: "Desat", errorPrefix: "Error en desar" });
}

export function deleteDocument(id: number): Promise<void> {
  return request<void>(
    `/documents/${id}`,
    { method: "DELETE" },
    { success: "Eliminat", errorPrefix: "Error en eliminar" },
  );
}

export function documentFileUrl(id: number): string {
  return `${BASE}/documents/${id}/file`;
}

// --- Jobs ---

export function startAnalyzeJob(body: AnalyzeJobRequest): Promise<JobCreated> {
  return request<JobCreated>("/jobs/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { success: "Processament iniciat", errorPrefix: "Error en el processament" });
}

export function getJob(jobId: string): Promise<JobOut> {
  return request<JobOut>(`/jobs/${jobId}`);
}

export function cancelJob(jobId: string): Promise<JobOut> {
  return request<JobOut>(`/jobs/${jobId}`, { method: "DELETE" });
}

// --- Assign ---

export function assignDocuments(body: AssignRequest): Promise<AssignResponse> {
  return request<AssignResponse>("/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { success: "Assignat", errorPrefix: "Error en l'assignació" });
}

// --- Settings ---

export function getSettings(): Promise<SettingsOut> {
  return request<SettingsOut>("/settings");
}

export function updateSettings(body: SettingsUpdate): Promise<SettingsOut> {
  return request<SettingsOut>("/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { success: "Configuració desada", errorPrefix: "Error en desar" });
}

// --- Compare ---

export async function compareFile(file: File): Promise<CompareResponse> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/compare/scan`, {
      method: "POST",
      headers: API_KEY ? { "X-API-Key": API_KEY } : undefined,
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, await parseError(res));
    const out = unwrapEnvelope(await res.json());
    toast.success("Comparació completada");
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    toast.error(`Error en la comparació: ${msg}`);
    throw err;
  }
}

// --- Edicions ---

export function applyRenames(body: ApplyRequest = {}): Promise<ApplyResponse> {
  return request<ApplyResponse>("/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { success: "Canvis aplicats", errorPrefix: "Error en aplicar" });
}

export function revertRenames(): Promise<RevertResponse> {
  return request<RevertResponse>(
    "/revert",
    { method: "POST" },
    { success: "Revertit", errorPrefix: "Error en revertir" },
  );
}

// --- Folders ---

export function listFolders(params?: {
  folder?: string;
  root?: string;
}): Promise<FolderListResponse> {
  const qs = new URLSearchParams();
  if (params?.folder) qs.set("folder", params.folder);
  if (params?.root) qs.set("root", params.root);
  const query = qs.toString();
  return request<FolderListResponse>(`/folders${query ? `?${query}` : ""}`);
}

// --- Emails ---

export function listEmails(params: EmailFilters = {}): Promise<EmailListResponse> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return request<EmailListResponse>(`/emails${query ? `?${query}` : ""}`);
}

export function getEmail(id: number): Promise<EmailOut> {
  return request<EmailOut>(`/emails/${id}`);
}

export function updateEmail(id: number, body: EmailUpdate): Promise<EmailOut> {
  return request<EmailOut>(`/emails/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function emailFileUrl(id: number): string {
  return `${BASE}/emails/${id}/file`;
}

export function assignEmails(body: EmailAssignRequest): Promise<EmailAssignResponse> {
  return request<EmailAssignResponse>("/emails/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { success: "Correus assignats", errorPrefix: "Error en l'assignació" });
}

export function startEmailAnalyzeJob(body: EmailAnalyzeRequest): Promise<JobCreated> {
  return request<JobCreated>("/jobs/email-analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { success: "Processament de correus iniciat", errorPrefix: "Error en el processament" });
}
