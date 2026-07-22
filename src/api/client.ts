import type {
  AdminConfigStatus,
  AdminJobsResponse,
  AdminService,
  AdminServicesResponse,
  AnalyzeJobRequest,
  ApiEnvelope,
  ApplyRequest,
  ApplyResponse,
  AssignRequest,
  AssignResponse,
  AuditListResponse,
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
  FolderRoot,
  HealthOut,
  JobCreated,
  JobOut,
  LogPage,
  LogQueryParams,
  LogSourcesResponse,
  MediaAnalyzeJobRequest,
  MediaBatchUploadOut,
  MediaFilters,
  MediaGuessRouteResponse,
  MediaKind,
  MediaMoveRequest,
  MediaMoveResponse,
  MediaRouteRequest,
  MediaRouteResponse,
  MediaUpdate,
  MediaUploadOut,
  NoteCreate,
  NoteListResponse,
  NoteOut,
  NoteUpdate,
  PictureListResponse,
  PictureOut,
  RevertResponse,
  ServiceActionRequest,
  ServiceActionResult,
  SettingsOut,
  SettingsUpdate,
  UploadOut,
  VideoListResponse,
  VideoOut,
} from "./types";
import toast from "react-hot-toast";
import {
  clearSession,
  clearUserType,
  getAccessToken,
  getApiBaseUrl,
  setAccessToken,
  setUserRole,
  setUserType,
  setUsername,
} from "@/config";
import { normalizeAppMode } from "@/constants/appMode";
import { normalizeUserRole, roleFromAccessToken } from "@/constants/userRole";
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

export const UNAUTHORIZED_MESSAGE =
  "Sessió caducada o no autoritzada. Torneu a iniciar sessió.";

export function isUnauthorizedError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 401;
}

export function isForbiddenError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 403;
}

let redirectingToLogin = false;

export function clearSessionAndRedirectToLogin(): void {
  clearSession();
  if (redirectingToLogin) return;
  if (window.location.pathname === "/login") return;
  redirectingToLogin = true;
  window.location.assign("/login");
}

export function buildHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(extra as Record<string, string>),
  };
  const token = getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function throwIfNotOk(
  res: Response,
  options?: { skipAuthRedirect?: boolean },
): Promise<void> {
  if (res.ok) return;
  if (res.status === 401 && !options?.skipAuthRedirect) {
    clearSessionAndRedirectToLogin();
  }
  throw new ApiError(res.status, await parseError(res));
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (
      body &&
      typeof body === "object" &&
      "status" in body &&
      (body as { status?: unknown }).status === "error" &&
      typeof (body as { message?: unknown }).message === "string" &&
      (body as { message: string }).message
    ) {
      return (body as { message: string }).message;
    }
    if (typeof body.message === "string" && body.message) return body.message;
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
  options?: { skipAuthRedirect?: boolean },
): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: buildHeaders(init?.headers),
    });
    await throwIfNotOk(res, options);
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

// --- Auth ---

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type?: string;
  /**
   * Tenancy mode: PERSONAL | EMPRESA (legacy FAMILIA accepted by normalize).
   * May be null for admin accounts.
   */
  type: string | null;
  /** Authorization role: personal | empresa | admin. */
  role?: string;
  username?: string;
}

export async function login(body: LoginRequest): Promise<LoginResponse> {
  const out = await request<LoginResponse>(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: body.username.trim(),
        password: body.password,
      }),
    },
    false,
    { skipAuthRedirect: true },
  );
  if (!out?.access_token) {
    throw new ApiError(500, "Resposta d'inici de sessió invàlida");
  }
  setAccessToken(out.access_token);
  const mode = normalizeAppMode(out.type);
  if (mode) setUserType(mode);
  else clearUserType();
  const role =
    normalizeUserRole(out.role) ?? roleFromAccessToken(out.access_token);
  if (role) setUserRole(role);
  if (out.username) setUsername(out.username);
  redirectingToLogin = false;
  return out;
}

export function logout(): void {
  clearSession();
}

// --- Health ---

export function getHealth(): Promise<HealthOut> {
  return request<HealthOut>("/health");
}

function setModeParam(
  qs: URLSearchParams,
  mode?: string | null,
): void {
  if (mode) qs.set("mode", mode);
}

export type UploadModeOptions = {
  /** Admin tenancy filter: PERSONAL | EMPRESA. */
  mode?: string | null;
};

// --- Files ---

export async function uploadFile(
  file: File,
  options?: UploadModeOptions,
): Promise<UploadOut> {
  try {
    const form = new FormData();
    form.append("file", file);
    const qs = new URLSearchParams();
    setModeParam(qs, options?.mode);
    const query = qs.toString();
    const res = await fetch(`${BASE}/files/upload${query ? `?${query}` : ""}`, {
      method: "POST",
      headers: buildHeaders(),
      body: form,
    });
    await throwIfNotOk(res);
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

export async function uploadBatch(
  files: File[],
  options?: UploadModeOptions,
): Promise<BatchUploadOut> {
  try {
    const form = new FormData();
    for (const f of files) {
      form.append("files", f);
    }
    const qs = new URLSearchParams();
    setModeParam(qs, options?.mode);
    const query = qs.toString();
    const res = await fetch(
      `${BASE}/files/upload/batch${query ? `?${query}` : ""}`,
      {
        method: "POST",
        headers: buildHeaders(),
        body: form,
      },
    );
    await throwIfNotOk(res);
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
  setModeParam(qs, params.mode);
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
    await throwIfNotOk(res);
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
  root?: FolderRoot | string;
  /** Admin tenancy filter: PERSONAL | EMPRESA. */
  mode?: string | null;
}): Promise<FolderListResponse> {
  const qs = new URLSearchParams();
  if (params?.folder) qs.set("folder", params.folder);
  if (params?.root) qs.set("root", params.root);
  setModeParam(qs, params?.mode);
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

// --- Media (pictures & videos) ---

function mediaListQuery(params: MediaFilters = {}): string {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  const folder = params.folder ?? params.company_folder;
  if (folder) qs.set("folder", folder);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export async function uploadMedia(
  file: File,
  options?: UploadModeOptions,
): Promise<MediaUploadOut> {
  try {
    const form = new FormData();
    form.append("file", file);
    const qs = new URLSearchParams({ target: "media" });
    setModeParam(qs, options?.mode);
    const res = await fetch(`${BASE}/files/upload?${qs}`, {
      method: "POST",
      headers: buildHeaders(),
      body: form,
    });
    await throwIfNotOk(res);
    const body = await res.json();
    if (
      body &&
      typeof body === "object" &&
      "status" in body &&
      (body as { status?: unknown }).status === "error"
    ) {
      const message =
        typeof (body as { message?: unknown }).message === "string"
          ? (body as { message: string }).message
          : "Error en la càrrega";
      throw new ApiError(res.status, message);
    }
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : undefined;
    const out = unwrapEnvelope(body) as MediaUploadOut;
    toast.success(message ?? "Càrrega completada");
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    toast.error(`Error en la càrrega: ${msg}`);
    throw err;
  }
}

export async function uploadMediaBatch(
  files: File[],
  options?: UploadModeOptions,
): Promise<MediaBatchUploadOut> {
  try {
    const form = new FormData();
    for (const f of files) {
      form.append("files", f);
    }
    const qs = new URLSearchParams({ target: "media" });
    setModeParam(qs, options?.mode);
    const res = await fetch(`${BASE}/files/upload/batch?${qs}`, {
      method: "POST",
      headers: buildHeaders(),
      body: form,
    });
    await throwIfNotOk(res);
    const body = await res.json();
    if (
      body &&
      typeof body === "object" &&
      "status" in body &&
      (body as { status?: unknown }).status === "error"
    ) {
      const message =
        typeof (body as { message?: unknown }).message === "string"
          ? (body as { message: string }).message
          : "Error en la càrrega múltiple";
      throw new ApiError(res.status, message);
    }
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : undefined;
    const out = unwrapEnvelope(body) as MediaBatchUploadOut;
    toast.success(message ?? "Càrrega múltiple completada");
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    toast.error(`Error en la càrrega múltiple: ${msg}`);
    throw err;
  }
}

export function listPictures(
  params: MediaFilters = {},
): Promise<PictureListResponse> {
  return request<PictureListResponse>(`/pictures${mediaListQuery(params)}`);
}

export function listVideos(
  params: MediaFilters = {},
): Promise<VideoListResponse> {
  return request<VideoListResponse>(`/videos${mediaListQuery(params)}`);
}

export function updatePicture(
  id: number,
  body: MediaUpdate,
): Promise<PictureOut> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<PictureOut>(
    `/pictures?${qs}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { success: "Desat", errorPrefix: "Error en desar" },
  );
}

export function updateVideo(id: number, body: MediaUpdate): Promise<VideoOut> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<VideoOut>(
    `/videos?${qs}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { success: "Desat", errorPrefix: "Error en desar" },
  );
}

export function movePicture(
  id: number,
  body: MediaMoveRequest,
): Promise<MediaMoveResponse> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<MediaMoveResponse>(
    `/pictures/move?${qs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { success: "Foto moguda", errorPrefix: "Error en moure" },
  );
}

export function moveVideo(
  id: number,
  body: MediaMoveRequest,
): Promise<MediaMoveResponse> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<MediaMoveResponse>(
    `/videos/move?${qs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { success: "Vídeo mogut", errorPrefix: "Error en moure" },
  );
}

export function deletePicture(id: number): Promise<void> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<void>(
    `/pictures?${qs}`,
    { method: "DELETE" },
    { success: "Eliminat", errorPrefix: "Error en eliminar" },
  );
}

export function deleteVideo(id: number): Promise<void> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<void>(
    `/videos?${qs}`,
    { method: "DELETE" },
    { success: "Eliminat", errorPrefix: "Error en eliminar" },
  );
}

export function pictureFileUrl(id: number): string {
  const qs = new URLSearchParams({ id: String(id) });
  return `${BASE}/pictures/file?${qs}`;
}

export function videoFileUrl(
  id: number,
  options?: { playback?: boolean },
): string {
  const qs = new URLSearchParams({ id: String(id) });
  // Lazy Chromium-safe H.264 derivative for in-app <video> preview.
  if (options?.playback) qs.set("playback", "1");
  return `${BASE}/videos/file?${qs}`;
}

export function startMediaAnalyzeJob(
  body: MediaAnalyzeJobRequest,
): Promise<JobCreated> {
  return request<JobCreated>(
    "/jobs/media-analyze",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    {
      success: "Anàlisi de mitjans iniciada",
      errorPrefix: "Error en l'anàlisi",
    },
  );
}

export function guessMediaRoute(
  id: number,
  kind: MediaKind,
): Promise<MediaGuessRouteResponse> {
  const qs = new URLSearchParams({ id: String(id), kind });
  return request<MediaGuessRouteResponse>(`/media/guess-route?${qs}`, {
    method: "POST",
  });
}

export function routeMedia(
  id: number,
  kind: MediaKind,
  body: MediaRouteRequest = {},
): Promise<MediaRouteResponse> {
  const qs = new URLSearchParams({ id: String(id), kind });
  return request<MediaRouteResponse>(
    `/media/route?${qs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { success: "Mitjà mogut", errorPrefix: "Error en moure" },
  );
}

/** Fetch a media/binary endpoint as a blob object URL (caller must revoke). */
export async function fetchMediaObjectUrl(
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(url, {
    headers: buildHeaders({ Accept: "*/*" }),
    signal,
  });
  await throwIfNotOk(res);
  const raw = await res.blob();
  const header = res.headers.get("Content-Type")?.split(";")[0]?.trim() ?? "";
  const blobType = raw.type?.split(";")[0]?.trim() ?? "";
  const usable =
    header &&
    header !== "application/octet-stream" &&
    header !== "application/json"
      ? header
      : blobType &&
          blobType !== "application/octet-stream" &&
          blobType !== "application/json"
        ? blobType
        : "";
  const blob = usable && raw.type === usable ? raw : new Blob([raw], { type: usable || raw.type });
  return URL.createObjectURL(blob);
}

// --- Notes ---

export function listNotes(): Promise<NoteListResponse> {
  return request<NoteListResponse>("/notes");
}

export function getNote(id: string): Promise<NoteOut> {
  const qs = new URLSearchParams({ id });
  return request<NoteOut>(`/notes?${qs}`);
}

export function createNote(body: NoteCreate = {}): Promise<NoteOut> {
  return request<NoteOut>(
    "/notes",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    false,
  );
}

export function updateNote(id: string, body: NoteUpdate): Promise<NoteOut> {
  const qs = new URLSearchParams({ id });
  return request<NoteOut>(
    `/notes?${qs}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    false,
  );
}

export function deleteNote(id: string): Promise<void> {
  const qs = new URLSearchParams({ id });
  return request<void>(
    `/notes?${qs}`,
    { method: "DELETE" },
    { success: "Eliminat", errorPrefix: "Error en eliminar" },
  );
}

export function bringNoteToFront(id: string): Promise<NoteOut> {
  const qs = new URLSearchParams({ id });
  return request<NoteOut>(
    `/notes/bring-to-front?${qs}`,
    { method: "POST" },
    false,
  );
}

// --- Admin ops ---

function buildLogQuery(params: LogQueryParams): string {
  const qs = new URLSearchParams();
  qs.set("source", params.source);
  if (params.since) qs.set("since", params.since);
  if (params.since_seconds != null) {
    qs.set("since_seconds", String(params.since_seconds));
  }
  if (params.level) qs.set("level", params.level);
  if (params.q) qs.set("q", params.q);
  if (params.job_id) qs.set("job_id", params.job_id);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  return qs.toString();
}

export function listLogSources(): Promise<LogSourcesResponse> {
  return request<LogSourcesResponse>("/admin/logs/sources");
}

export function getAdminLogs(params: LogQueryParams): Promise<LogPage> {
  return request<LogPage>(`/admin/logs?${buildLogQuery(params)}`);
}

/** Download filtered logs as a Blob (caller triggers save). */
export async function downloadAdminLogs(
  params: LogQueryParams,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${BASE}/admin/logs/download?${buildLogQuery(params)}`, {
    headers: buildHeaders({ Accept: "*/*" }),
  });
  await throwIfNotOk(res);
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(disposition);
  const filename = match
    ? decodeURIComponent(match[1].replace(/"/g, ""))
    : `logs-${params.source}.txt`;
  return { blob, filename };
}

export function listAdminServices(): Promise<AdminServicesResponse> {
  return request<AdminServicesResponse>("/admin/services");
}

export function getAdminService(id: string): Promise<AdminService> {
  return request<AdminService>(`/admin/services/${encodeURIComponent(id)}`);
}

export function restartAdminService(
  id: string,
  body: ServiceActionRequest = {},
): Promise<ServiceActionResult> {
  return request<ServiceActionResult>(
    `/admin/services/${encodeURIComponent(id)}/restart`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { success: "Reinici sol·licitat", errorPrefix: "Error en reiniciar" },
  );
}

export function listAdminAudit(params?: {
  limit?: number;
  cursor?: string;
  action?: string;
  actor?: string;
  since?: string;
}): Promise<AuditListResponse> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.cursor) qs.set("cursor", params.cursor);
  if (params?.action) qs.set("action", params.action);
  if (params?.actor) qs.set("actor", params.actor);
  if (params?.since) qs.set("since", params.since);
  const query = qs.toString();
  return request<AuditListResponse>(
    `/admin/audit${query ? `?${query}` : ""}`,
  );
}

export function listAdminJobs(params?: {
  status?: string;
  type?: string;
  limit?: number;
  cursor?: string;
}): Promise<AdminJobsResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.type) qs.set("type", params.type);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.cursor) qs.set("cursor", params.cursor);
  const query = qs.toString();
  return request<AdminJobsResponse>(
    `/admin/jobs${query ? `?${query}` : ""}`,
  );
}

export function getAdminConfigStatus(): Promise<AdminConfigStatus> {
  return request<AdminConfigStatus>("/admin/config/status");
}
