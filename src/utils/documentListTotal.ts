import type { DocumentFilters } from "@/api/types";
import { fetchAllDocuments } from "@/utils/fetchAllDocuments";
import { matchesDocumentFilters } from "@/utils/matchDocumentFilters";

export type DocumentListFilterParams = Pick<
  DocumentFilters,
  | "q"
  | "proposed_name"
  | "original_name"
  | "company_folder"
  | "folder"
  | "doc_type_ca"
  | "final_date"
  | "language"
>;

export function hasDocumentListFilters(
  filters: DocumentListFilterParams,
): boolean {
  return Boolean(
    filters.q ||
      filters.proposed_name ||
      filters.original_name ||
      filters.company_folder ||
      filters.folder ||
      filters.doc_type_ca ||
      filters.final_date ||
      filters.language,
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
  const all = await fetchAllDocuments(filters.status ?? "");
  return all.filter((doc) => matchesDocumentFilters(doc, filters)).length;
}
