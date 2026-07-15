import type {
  AnalyzeJobRequest,
  ApiEnvelope,
  ApplyRequest,
  ApplyResponse,
  AssignRequest,
  AssignResponse,
  BatchUploadOut,
  CompareResponse,
  DeletedDocumentFilters,
  DocumentFilters,
  DocumentListResponse,
  DocumentMoveRequest,
  DocumentMoveResponse,
  DocumentOut,
  DocumentRestoreRequest,
  DocumentTranslateRequest,
  DocumentTranslateResponse,
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
import { getApiBaseUrl, getApiKey } from "@/config";

const BASE = getApiBaseUrl();

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const API_KEY_UNAUTHORIZED_MESSAGE =
  "Accés no autoritzat. La clau API podria estar mal configurada. Poseu-vos en contacte amb un administrador.";

export function isUnauthorizedError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 401;
}

export function buildHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(extra as Record<string, string>),
  };
  const apiKey = getApiKey();
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
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
      headers: buildHeaders(),
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
      headers: buildHeaders(),
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
  if (params.original_name) qs.set("original_name", params.original_name);
  if (params.company_folder) qs.set("company_folder", params.company_folder);
  if (params.doc_type_ca) qs.set("doc_type_ca", params.doc_type_ca);
  if (params.final_date) qs.set("final_date", params.final_date);
  if (params.language) qs.set("language", params.language);
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
  const qs = new URLSearchParams({ id: String(id) });
  return request<DocumentOut>(`/documents?${qs}`);
}

export function updateDocument(
  id: number,
  body: DocumentUpdate,
): Promise<DocumentOut> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<DocumentOut>(`/documents?${qs}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { success: "Desat", errorPrefix: "Error en desar" });
}

export function deleteDocument(id: number): Promise<void> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<void>(
    `/documents?${qs}`,
    { method: "DELETE" },
    { success: "Eliminat", errorPrefix: "Error en eliminar" },
  );
}

export function listDeletedDocuments(
  params: DeletedDocumentFilters = {},
): Promise<DocumentListResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return request<DocumentListResponse>(
    `/documents/deleted${query ? `?${query}` : ""}`,
  );
}

export function restoreDocument(
  id: number,
  body: DocumentRestoreRequest = {},
): Promise<DocumentOut> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<DocumentOut>(
    `/documents/restore?${qs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { success: "Recuperat", errorPrefix: "Error en recuperar" },
  );
}

export function moveDocument(
  id: number,
  body: DocumentMoveRequest,
): Promise<DocumentMoveResponse> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<DocumentMoveResponse>(
    `/documents/move?${qs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { success: "Document mogut", errorPrefix: "Error en moure" },
  );
}

export function translateDocument(
  id: number,
  body: DocumentTranslateRequest,
): Promise<DocumentTranslateResponse> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<DocumentTranslateResponse>(
    `/documents/translate?${qs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { errorPrefix: "Error en traduir" },
  );
}

export function documentFileUrl(id: number): string {
  const qs = new URLSearchParams({ id: String(id) });
  return `${BASE}/documents/file?${qs}`;
}

/** PDF at a storage-relative path (e.g. document `duplicate_path`). */
export function storedFileUrl(relativePath: string): string {
  const qs = new URLSearchParams({ path: relativePath });
  return `${BASE}/files/by-path?${qs}`;
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
  const qs = new URLSearchParams({ id: jobId });
  return request<JobOut>(`/jobs?${qs}`);
}

export function cancelJob(jobId: string): Promise<JobOut> {
  const qs = new URLSearchParams({ id: jobId });
  return request<JobOut>(`/jobs?${qs}`, { method: "DELETE" });
}

// --- Assign ---

export function assignDocuments(body: AssignRequest): Promise<AssignResponse> {
  return request<AssignResponse>("/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { success: "Assignat", errorPrefix: "Error en l'assignació" });
}

export function assignDocument(
  id: number,
  body: Pick<AssignRequest, "dest">,
): Promise<AssignResponse> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<AssignResponse>(`/assign?${qs}`, {
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
      headers: buildHeaders(),
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
  const qs = new URLSearchParams({ id: String(id) });
  return request<EmailOut>(`/emails?${qs}`);
}

export function updateEmail(id: number, body: EmailUpdate): Promise<EmailOut> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<EmailOut>(`/emails?${qs}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function emailFileUrl(id: number): string {
  const qs = new URLSearchParams({ id: String(id) });
  return `${BASE}/emails/file?${qs}`;
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
