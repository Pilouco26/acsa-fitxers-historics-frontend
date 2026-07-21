import { useQuery } from "@tanstack/react-query";
import { fetchAllDocuments } from "@/utils/fetchAllDocuments";

/** Distinct doc_type_ca values from approved documents, for filter dropdowns. */
export function useDocumentFilterOptions(
  status: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["documents", status, "all"],
    queryFn: () => fetchAllDocuments(status),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
    select: (docs) => {
      const docTypeCa = new Set<string>();
      const folders = new Set<string>();
      const proposedNames = new Set<string>();
      const originalNames = new Set<string>();

      for (const doc of docs) {
        if (doc.doc_type_ca) docTypeCa.add(doc.doc_type_ca);
        if (doc.company_folder) folders.add(doc.company_folder);
        if (doc.target_folder) folders.add(doc.target_folder);
        if (doc.proposed_name) proposedNames.add(doc.proposed_name);
        if (doc.original_name) originalNames.add(doc.original_name);
      }

      const sort = (a: string, b: string) => a.localeCompare(b, "ca");
      return {
        docTypeCa: [...docTypeCa].sort(sort),
        folders: [...folders].sort(sort),
        proposedNames: [...proposedNames].sort(sort),
        originalNames: [...originalNames].sort(sort),
      };
    },
  });
}
