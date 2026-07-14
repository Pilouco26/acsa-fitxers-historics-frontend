/** Types mirroring backend/schemas — keep in sync with Automatització/backend */

export interface ApiEnvelope<T> {
  status: string;
  message?: string;
  data: T;
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
