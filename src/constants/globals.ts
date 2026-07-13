/** Shared layout, timing, and document-status constants. */

export const DOCUMENT_LIST_MIN_PAGE_SIZE = 8;
export const DOCUMENT_LIST_MAX_PAGE_SIZE = 25;
/** Sliding window of list pages kept warm (current + ahead). */
export const DOCUMENT_LIST_PREFETCH_PAGES = 5;

export const SEARCH_DEBOUNCE_MS = 300;

export const LIST_PANEL_FIXED_HEIGHT_PX = 204;
export const LIST_PANEL_ROW_HEIGHT_PX = 36;

export const DOCUMENT_STATUS_OK = "ok";
export const DOCUMENT_STATUS_REVISIO = "revisio";
