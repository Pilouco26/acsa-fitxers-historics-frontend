/** Shared layout, timing, and document-status constants. */

/** Fixed rows per page for document list tables. */
export const DOCUMENT_LIST_PAGE_SIZE = 12;
/** Sliding window of list pages kept warm (current + ahead). */
export const DOCUMENT_LIST_PREFETCH_PAGES = 5;

export const SEARCH_DEBOUNCE_MS = 300;

export const LIST_PANEL_FIXED_HEIGHT_PX = 204;
/** Must match `--list-panel-row-height` and list-cell box height in index.css */
export const LIST_PANEL_ROW_HEIGHT_PX = 42;

export const DOCUMENT_STATUS_OK = "ok";
export const DOCUMENT_STATUS_REVISIO = "revisio";
/** Stored on upload / awaiting analyze (Catalan; API exact-match filter). */
export const DOCUMENT_STATUS_PENDING = "pendent";
/**
 * Statuses backend list_pending treats as ready to analyze.
 * Probe each — GET ?status= is an exact filter, not a set.
 */
export const DOCUMENT_STATUS_ANALYZE_PENDING = [
  DOCUMENT_STATUS_PENDING,
  "pending",
  "error",
] as const;
