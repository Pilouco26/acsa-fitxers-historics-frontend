import { listDocuments } from "@/api/client";
import type { DocumentFilters } from "@/api/types";

const COUNT_BATCH_SIZE = 10_000;

export type DocumentListFilterParams = Pick<
  DocumentFilters,
  "q" | "proposed_name" | "company_folder" | "folder"
>;

export function hasDocumentListFilters(
  filters: DocumentListFilterParams,
): boolean {
  return Boolean(
    filters.q || filters.proposed_name || filters.company_folder || filters.folder,
  );
}

/** Exact total when the current page is the last page of a filtered result set. */
export function estimateFilteredTotal(
  itemsLength: number,
  page: number,
  pageSize: number,
): number | null {
  if (itemsLength < pageSize) return page * pageSize + itemsLength;
  return null;
}

/** Backend may return an unfiltered total; count matching rows when filters are active. */
export async function fetchFilteredDocumentCount(
  filters: DocumentListFilterParams & Pick<DocumentFilters, "status">,
): Promise<number> {
  let offset = 0;
  let count = 0;

  for (;;) {
    const res = await listDocuments({
      status: filters.status,
      q: filters.q,
      proposed_name: filters.proposed_name,
      company_folder: filters.company_folder,
      folder: filters.folder,
      limit: COUNT_BATCH_SIZE,
      offset,
    });

    count += res.items.length;
    if (res.items.length < COUNT_BATCH_SIZE) return count;
    offset += COUNT_BATCH_SIZE;
  }
}
