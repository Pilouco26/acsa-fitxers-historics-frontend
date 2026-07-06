import type {
  AnalyzeJobRequest,
  ApiEnvelope,
  AssignRequest,
  AssignResponse,
  BatchUploadOut,
  DocumentFilters,
  DocumentListResponse,
  DocumentOut,
  DocumentUpdate,
  HealthOut,
  JobCreated,
  JobOut,
  SettingsOut,
  SettingsUpdate,
  UploadOut,
} from "./types";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: buildHeaders(init?.headers),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const body = (await res.json()) as T | ApiEnvelope<T>;
  return unwrapEnvelope(body);
}

// --- Health ---

export function getHealth(): Promise<HealthOut> {
  return request<HealthOut>("/health");
}

// --- Files ---

export async function uploadFile(file: File): Promise<UploadOut> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/files/upload`, {
    method: "POST",
    headers: API_KEY ? { "X-API-Key": API_KEY } : undefined,
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return unwrapEnvelope(await res.json());
}

export async function uploadBatch(files: File[]): Promise<BatchUploadOut> {
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
  return unwrapEnvelope(await res.json());
}

// --- Documents ---

export function listDocuments(
  params: DocumentFilters = {},
): Promise<DocumentListResponse> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.folder) qs.set("folder", params.folder);
  if (params.q) qs.set("q", params.q);
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
  });
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
  });
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
  });
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
  });
}
