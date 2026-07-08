import type { DocumentOut } from "@/api/types";
import type { DocumentListFilterParams } from "@/utils/documentListTotal";

function includesInsensitive(
  value: string | null | undefined,
  needle: string,
): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(needle.toLowerCase());
}

function textFilter(
  value: string | null | undefined,
  needle: string | undefined,
): boolean {
  if (!needle) return true;
  return includesInsensitive(value, needle);
}

/** Client-side filter when the API does not apply query params. */
export function matchesDocumentFilters(
  doc: DocumentOut,
  filters: DocumentListFilterParams,
): boolean {
  if (filters.q) {
    const q = filters.q.trim().toLowerCase();
    const haystacks = [
      doc.proposed_name,
      doc.original_name,
      doc.company_folder,
      doc.folder,
      doc.company,
      doc.summary,
    ];
    if (!haystacks.some((value) => value?.toLowerCase().includes(q))) {
      return false;
    }
  }

  if (filters.folder) {
    const matchesFolder =
      textFilter(doc.folder, filters.folder) ||
      textFilter(doc.company_folder, filters.folder);
    if (!matchesFolder) return false;
  }

  if (!textFilter(doc.proposed_name, filters.proposed_name)) return false;
  if (!textFilter(doc.original_name, filters.original_name)) return false;
  if (!textFilter(doc.company_folder, filters.company_folder)) return false;
  if (!textFilter(doc.final_date, filters.final_date)) return false;

  if (filters.doc_type_ca && doc.doc_type_ca !== filters.doc_type_ca) {
    return false;
  }

  if (filters.language && doc.language !== filters.language) {
    return false;
  }

  return true;
}
