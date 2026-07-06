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
  language: string | null;
  sender: string | null;
  recipient: string | null;
  processed_at: string | null;
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

export interface DocumentFilters {
  status?: string;
  folder?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface UploadOut {
  filename: string;
  relative_path: string;
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
  gemini_model: string;
  gemini_configured: boolean;
}

export interface SettingsUpdate {
  input_folder?: string | null;
  output_folder?: string | null;
  gemini_api_key?: string | null;
  gemini_model?: string | null;
}

export interface HealthOut {
  status: string;
  ocr: string;
  gemini_configured: boolean;
}
