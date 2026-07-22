/** Types mirroring backend/schemas — keep in sync with Automatització/backend */

export interface ApiEnvelope<T> {
  status: string;
  message?: string;
  data: T;
}

/** Structured letter roles when the backend returns `segments` instead of labeled `text`. */
export type TranslatedPageSegmentRole = "header" | "body" | "footer";

export interface TranslatedPageSegment {
  role: TranslatedPageSegmentRole;
  text: string;
}

export interface TranslatedPage {
  /** 1-based, aligned with PDF page numbers */
  page: number;
  /**
   * Translated text for that page only (may be "").
   * For letters may still contain `[Capçalera…]` / `[Cos…]` / `[Peu…]` markers
   * when `segments` is absent.
   */
  text: string;
  /** Preferred structured layout; when present, frontend skips marker parsing. */
  segments?: TranslatedPageSegment[] | null;
}

export type LayoutTextAlign = "left" | "center" | "right" | "justify";

export interface LayoutBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LayoutWord {
  text: string;
  bbox: LayoutBBox;
  confidence?: number;
}

export interface LayoutLine {
  text: string;
  translated: string;
  bbox: LayoutBBox;
  align?: LayoutTextAlign;
  fontHeightRatio?: number;
  fontGroupId?: number;
  words?: LayoutWord[];
}

/** Per-page overlay payload from layout-preserving `/documents/translate`. */
export interface LayoutPage {
  /** 1-based PDF page index */
  page: number;
  width: number;
  height: number;
  /** Storage-relative path; resolve via `/files/by-path`. */
  background_url: string;
  lines: LayoutLine[];
  plain_paragraphs?: string[] | null;
}

export interface DocumentOut {
  id: number;
  status: string | null;
  proposed_name: string | null;
  original_name: string | null;
  company: string | null;
  company_folder: string | null;
  doc_type: string | null;
  doc_type_ca: string | null;
  final_date: string | null;
  overall_conf: string | null;
  summary: string | null;
  error: string | null;
  folder: string | null;
  target_folder: string | null;
  /** Relative storage path of the matched original when status is repeated. */
  duplicate_path?: string | null;
  /** Full-document translation (backward compatible). */
  translated_text?: string | null;
  translated_at?: string | null;
  /**
   * Per-page translations. Null/omitted on older docs → fall back to
   * single-scroll view using translated_text only.
   */
  translated_pages?: TranslatedPage[] | null;
  /** Layout-preserving overlay pages (when previously translated with flag). */
  layout_pages?: LayoutPage[] | null;
  /** Storage-relative burn-in PDF path from layout-preserving translate. */
  layout_pdf_url?: string | null;
  language: string | null;
  sender: string | null;
  recipient: string | null;
  processed_at: string | null;
  deleted_at?: string | null;
  duplicate?: boolean;
  compare?: CompareResponse;
}

export interface DocumentListResponse {
  items: DocumentOut[];
  total: number;
}

export interface DocumentUpdate {
  proposed_name?: string | null;
  summary?: string | null;
  status?: string | null;
  target_folder?: string | null;
  approve?: boolean;
}

export interface DocumentMoveRequest {
  dest_folder: string | null;
  dest_name?: string | null;
  dry_run?: boolean;
}

export interface DocumentMoveResponse {
  document_id: number;
  src_path: string;
  dest_path: string;
  relative_path: string;
  filename: string;
  dry_run: boolean;
  unchanged?: boolean;
  collision_resolved?: boolean;
}

export interface DocumentTranslateRequest {
  target_language: string;
  /**
   * When true, backend runs OCR+layout path and returns `layout_pages` /
   * `layout_pdf_url` (whitened backgrounds + burn-in PDF).
   */
  preserve_layout?: boolean;
}

export interface DocumentTranslateResponse {
  document_id: number;
  source_language: string | null;
  target_language: string;
  original_text: string;
  translated_text: string;
  translated_pages?: TranslatedPage[] | null;
  layout_pages?: LayoutPage[] | null;
  /** Storage-relative path to burn-in PDF; resolve via `/files/by-path`. */
  layout_pdf_url?: string | null;
}

export interface DocumentRestoreRequest {
  dest_folder?: string | null;
}

export interface DeletedDocumentFilters {
  q?: string;
  limit?: number;
  offset?: number;
  /** Admin tenancy filter: PERSONAL | EMPRESA. */
  mode?: string | null;
}

export type DocumentOrderBy = "proposed_name" | "company_folder";
export type DocumentOrderDir = "asc" | "desc";

export interface DocumentFilters {
  status?: string;
  folder?: string;
  q?: string;
  proposed_name?: string;
  original_name?: string;
  company_folder?: string;
  doc_type_ca?: string;
  final_date?: string;
  language?: string;
  order_by?: DocumentOrderBy;
  order?: DocumentOrderDir;
  limit?: number;
  offset?: number;
}

export interface UploadOut {
  filename: string;
  relative_path: string;
  duplicate?: boolean;
  compare?: CompareResponse;
}

export interface BatchUploadOut {
  files: UploadOut[];
}

export interface AnalyzeJobRequest {
  source?: string;
  dest?: string;
  folder?: string | null;
  limit?: number | null;
  folder_limit?: number | null;
  folder_start?: number | null;
  folder_end?: number | null;
  folder_from?: string | null;
  folder_to?: string | null;
  force?: boolean;
  dry_run?: boolean;
  require_review?: boolean;
  run_assign?: boolean;
  /** Admin tenancy filter: PERSONAL | EMPRESA. Omit for all / non-admin. */
  mode?: string | null;
}

export interface JobProgress {
  processed: number;
  total: number;
  current_file: string | null;
  status_counts: Record<string, number>;
  message: string | null;
}

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface JobOut {
  id: string;
  type: string;
  status: JobStatus;
  /**
   * Optional timing fields for UI ETA/elapsed display.
   * Backend may omit these; frontend must handle undefined.
   */
  started_at?: string | null;
  elapsed_seconds?: number | null;
  eta_seconds?: number | null;
  progress: JobProgress;
  error: string | null;
  result: Record<string, unknown> | null;
}

export interface JobCreated {
  job_id: string;
}

export interface AssignRequest {
  source?: string;
  dest?: string;
  limit?: number | null;
  dry_run?: boolean;
  require_review?: boolean;
  run_assign?: boolean;
  quarantine?: string;
  sync_db?: boolean;
}

export interface AssignResponse {
  summary: Record<string, number>;
  details?: Record<string, unknown>[] | null;
}

export interface SettingsOut {
  input_folder: string;
  output_folder: string;
  gemini_api_key: string;
  gemini_api_key_backup: string;
  gemini_model: string;
  gemini_configured: boolean;
}

export interface SettingsUpdate {
  input_folder?: string | null;
  output_folder?: string | null;
  gemini_api_key?: string | null;
  gemini_api_key_backup?: string | null;
  gemini_model?: string | null;
}

export interface HealthOut {
  status: string;
  ocr: string;
  gemini_configured: boolean;
}

export interface CompareMatchOut {
  relative_path: string | null;
  document_id: number | null;
  trust: number | null;
  breakdown: Record<string, unknown> | null;
}

export interface CompareResponse {
  verdict: string;
  candidates_scanned: number;
  bytes_compared: number;
  text_compared: number;
  trust: number | null;
  breakdown: Record<string, unknown> | null;
  best_match: CompareMatchOut | null;
  alternatives: CompareMatchOut[];
}

export interface ApplyRequest {
  dry_run?: boolean;
  folder?: string | null;
}

export interface ApplyResponse {
  summary: Record<string, number>;
}

export interface RevertResponse {
  summary: Record<string, number>;
}

export interface EmailOut {
  id: number;
  status: string | null;
  proposed_name: string | null;
  original_name: string | null;
  company: string | null;
  doc_type: string | null;
  doc_type_ca: string | null;
  final_date: string | null;
  overall_conf: string | null;
  summary: string | null;
  error: string | null;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  sent_at: string | null;
  processed_at: string | null;
}

export interface EmailUpdate {
  proposed_name?: string | null;
  summary?: string | null;
  status?: string | null;
  target_folder?: string | null;
  approve?: boolean;
}

export interface EmailListResponse {
  items: EmailOut[];
  total: number;
}

export interface EmailFilters {
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface EmailAssignRequest {
  source?: string;
  dest?: string;
  limit?: number | null;
  dry_run?: boolean;
  quarantine?: string;
  sync_db?: boolean;
}

export interface EmailAssignResponse {
  summary: Record<string, number>;
}

export interface EmailAnalyzeRequest {
  source?: string;
  limit?: number | null;
  force?: boolean;
  dry_run?: boolean;
  /** Admin tenancy filter: PERSONAL | EMPRESA. */
  mode?: string | null;
}

export interface FolderItem {
  index: number;
  name: string;
  relative_path: string;
}

export interface FolderListResponse {
  items: FolderItem[];
  total: number;
}

// --- Media (pictures & videos) ---

export type MediaKind = "picture" | "video";

export interface PictureOut {
  id: number;
  name: string;
  relative_path: string;
  /** Hub folder under the media root (`media/<folder>/…`). */
  folder?: string | null;
  /** @deprecated Prefer `folder` (backend field name). */
  company_folder?: string | null;
  date: string | null;
  /** Tenancy mode EMPRESA | PERSONAL. */
  mode?: string | null;
  original_name: string | null;
  proposed_name: string | null;
  status: string | null;
  summary: string | null;
  location_guess: string | null;
  ocr_text: string | null;
  overall_conf: string | null;
  error: string | null;
  processed_at: string | null;
}

export type VideoOut = PictureOut & {
  duration_sec: string | null;
  keyframe_count: string | null;
  /** Storage path of lazy H.264 playback derivative, when ready. */
  playback_relative_path?: string | null;
  /** none | processing | ready | error */
  playback_status?: string | null;
  playback_error?: string | null;
};

export interface PictureListResponse {
  items: PictureOut[];
  total: number;
}

export interface VideoListResponse {
  items: VideoOut[];
  total: number;
}

export interface MediaFilters {
  status?: string;
  q?: string;
  /** Filter by media hub folder (`GET /pictures?folder=`). */
  folder?: string;
  /** @deprecated Prefer `folder`. */
  company_folder?: string;
  limit?: number;
  offset?: number;
}

/** Known values for `GET /folders?root=`. */
export type FolderRoot = "archive" | "media";

export interface MediaUpdate {
  proposed_name?: string | null;
  date?: string | null;
  summary?: string | null;
  location_guess?: string | null;
  approve?: boolean;
}

export interface MediaMoveRequest {
  dest_folder: string;
  dest_name?: string | null;
  dry_run?: boolean;
}

export interface MediaMoveResponse {
  media_id: number;
  kind: string;
  src_path: string;
  dest_path: string;
  relative_path: string;
  folder: string;
  filename: string;
  dry_run: boolean;
  unchanged?: boolean;
  collision_resolved?: boolean;
}

/** Ranked routing strategies from `POST /media/guess-route`. */
export type MediaRouteStrategy =
  | "aligned"
  | "archive_mirror"
  | "media_match"
  | "new_folder";

export interface MediaGuessRouteCandidate {
  strategy: MediaRouteStrategy;
  dest_folder: string;
  score?: number | null;
}

export interface MediaGuessRouteResponse {
  media_id: number;
  kind: MediaKind;
  dest_folder: string;
  strategy: MediaRouteStrategy;
  candidates?: MediaGuessRouteCandidate[] | null;
}

export interface MediaRouteRequest {
  dest_folder?: string;
  strategy?: MediaRouteStrategy;
  dry_run?: boolean;
}

export interface MediaRouteResponse {
  media_id: number;
  kind: MediaKind;
  dest_folder: string;
  strategy?: MediaRouteStrategy | null;
  src_path?: string;
  dest_path?: string;
  relative_path?: string;
  folder?: string;
  filename?: string;
  dry_run?: boolean;
  unchanged?: boolean;
  collision_resolved?: boolean;
}

export interface MediaUploadOut {
  filename: string;
  relative_path: string;
  status: string;
  id: number;
  media_kind: MediaKind;
  mode?: string | null;
}

export interface MediaBatchUploadOut {
  files: MediaUploadOut[];
}

export interface MediaAnalyzeJobRequest {
  source?: string;
  require_review?: boolean;
  dry_run?: boolean;
  picture_ids?: number[];
  video_ids?: number[];
  /** Admin tenancy filter: PERSONAL | EMPRESA. */
  mode?: string | null;
}

export interface MediaAnalyzeResultFile {
  kind: MediaKind;
  id: number;
  relative_path: string;
  status?: string;
  error?: string | null;
}

export interface MediaAnalyzeResult {
  summary: {
    total: number;
    processed: number;
    errors: number;
    dry_run: boolean;
  };
  files: MediaAnalyzeResultFile[];
}

/** Sticky notes board — mirrors Automatització `/notes` API. */
export type NoteColor =
  | "yellow"
  | "pink"
  | "blue"
  | "green"
  | "orange"
  | "purple";

export interface NoteOut {
  id: string;
  title: string;
  body: string;
  color: NoteColor;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  rotation: number;
  created_at: string;
  updated_at: string;
}

export interface NoteCreate {
  title?: string;
  body?: string;
  color?: NoteColor;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
}

export interface NoteUpdate {
  title?: string;
  body?: string;
  color?: NoteColor;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  z_index?: number;
  rotation?: number;
}

export interface NoteListResponse {
  items: NoteOut[];
  total: number;
}

// --- Admin ops (logs / services / jobs) ---

export type LogSourceKind = "container" | "file" | "job";

export interface LogSource {
  id: string;
  label: string;
  kind: LogSourceKind;
  container_name?: string | null;
}

export interface LogSourcesResponse {
  sources: LogSource[];
}

export interface LogLine {
  ts: string;
  level?: string | null;
  message: string;
  source: string;
  job_id?: string | null;
  container?: string | null;
}

export interface LogPage {
  lines: LogLine[];
  next_cursor?: string | null;
  truncated: boolean;
}

export interface LogQueryParams {
  source: string;
  since?: string;
  since_seconds?: number;
  level?: string;
  q?: string;
  job_id?: string;
  limit?: number;
  cursor?: string;
}

export type ServiceStatus =
  | "running"
  | "exited"
  | "restarting"
  | "paused"
  | "created"
  | "dead"
  | "unknown";

export type ServiceHealth =
  | "healthy"
  | "unhealthy"
  | "starting"
  | "none"
  | "unknown";

export interface ServiceMount {
  source: string;
  destination: string;
  mode?: string;
}

export interface AdminService {
  id: string;
  name: string;
  container_name: string;
  image: string;
  status: ServiceStatus;
  health: ServiceHealth;
  started_at?: string | null;
  uptime_seconds?: number | null;
  restart_count?: number | null;
  ports?: string[];
  mounts?: ServiceMount[];
  labels?: Record<string, string>;
}

export interface AdminServicesResponse {
  services: AdminService[];
  stack?: string | null;
  generated_at: string;
}

export interface ServiceActionRequest {
  reason?: string;
}

export interface ServiceActionResult {
  service_id: string;
  action: "restart";
  accepted: boolean;
  message: string;
  audit_id?: string;
}

export interface AuditEvent {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target: string;
  success: boolean;
  detail?: string | null;
}

export interface AuditListResponse {
  items: AuditEvent[];
  next_cursor?: string | null;
}

export interface AdminJobSummary {
  id: string;
  type: string;
  status: JobStatus;
  started_at?: string | null;
  finished_at?: string | null;
  progress?: {
    processed: number;
    total: number;
    message?: string | null;
  } | null;
  error?: string | null;
  worker_service_id?: string | null;
}

export interface AdminJobsResponse {
  items: AdminJobSummary[];
  next_cursor?: string | null;
}

export interface AdminConfigStatus {
  input_folder: string;
  output_folder: string;
  input_folder_exists: boolean;
  output_folder_exists: boolean;
  input_folder_writable: boolean;
  output_folder_writable: boolean;
  gemini_configured: boolean;
  gemini_backup_configured: boolean;
  gemini_model: string;
  env_flags?: { key: string; set: boolean }[];
  app_version?: string | null;
  git_sha?: string | null;
}
