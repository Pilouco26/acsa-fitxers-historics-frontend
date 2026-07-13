import { useEffect, useRef } from "react";
import {
  useQueryClient,
  type QueryKey,
  type QueryFunction,
} from "@tanstack/react-query";
import type { DocumentListResponse } from "@/api/types";
import { DOCUMENT_LIST_PREFETCH_PAGES } from "@/constants/globals";

interface PrefetchPageOptions {
  queryKey: QueryKey;
  queryFn: QueryFunction<DocumentListResponse>;
}

interface UsePrefetchDocumentListPagesOptions {
  enabled: boolean;
  page: number;
  pageSize: number;
  total: number;
  /**
   * Identity of the list query besides page (search, sort, status, …).
   * When it changes, the prefetch window is rebuilt even if page stays 0.
   */
  scopeKey: unknown;
  /** Build query options for a target page index (0-based). */
  getPageOptions: (page: number) => PrefetchPageOptions;
}

/**
 * Keeps a sliding window of DOCUMENT_LIST_PREFETCH_PAGES pages warm in the
 * cache (current page is loaded by useQuery; this prefetches the ones ahead).
 * On page N, pages N..N+4 are available; advancing loads only the new page
 * at the far end of the window.
 */
export function usePrefetchDocumentListPages({
  enabled,
  page,
  pageSize,
  total,
  scopeKey,
  getPageOptions,
}: UsePrefetchDocumentListPagesOptions) {
  const queryClient = useQueryClient();
  const getPageOptionsRef = useRef(getPageOptions);
  getPageOptionsRef.current = getPageOptions;

  useEffect(() => {
    if (!enabled || total <= 0 || pageSize <= 0) return;

    const totalPages = Math.ceil(total / pageSize);
    const lastPrefetchPage = Math.min(
      page + DOCUMENT_LIST_PREFETCH_PAGES - 1,
      totalPages - 1,
    );

    for (let p = page + 1; p <= lastPrefetchPage; p++) {
      const { queryKey, queryFn } = getPageOptionsRef.current(p);
      void queryClient.prefetchQuery({ queryKey, queryFn });
    }
  }, [enabled, page, pageSize, total, scopeKey, queryClient]);
}
