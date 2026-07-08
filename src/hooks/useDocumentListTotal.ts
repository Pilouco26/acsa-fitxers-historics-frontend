import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  estimateFilteredTotal,
  fetchFilteredDocumentCount,
  hasDocumentListFilters,
  type DocumentListFilterParams,
} from "@/utils/documentListTotal";

interface UseDocumentListTotalParams extends DocumentListFilterParams {
  status: string;
  page: number;
  pageSize: number;
  apiTotal: number;
  itemsLength: number;
}

export function useDocumentListTotal({
  status,
  q,
  proposed_name,
  company_folder,
  folder,
  page,
  pageSize,
  apiTotal,
  itemsLength,
}: UseDocumentListTotalParams) {
  const filters = useMemo(
    () => ({ q, proposed_name, company_folder, folder }),
    [q, proposed_name, company_folder, folder],
  );
  const hasActiveFilters = hasDocumentListFilters(filters);

  const estimatedTotal = useMemo(
    () => estimateFilteredTotal(itemsLength, page, pageSize),
    [itemsLength, page, pageSize],
  );

  const countQuery = useQuery({
    queryKey: [
      "documents",
      status,
      "filtered-count",
      q ?? "",
      proposed_name ?? "",
      company_folder ?? "",
      folder ?? "",
    ],
    queryFn: () =>
      fetchFilteredDocumentCount({
        status,
        q,
        proposed_name,
        company_folder,
        folder,
      }),
    enabled: hasActiveFilters && estimatedTotal == null,
    staleTime: 30_000,
  });

  const total = useMemo(() => {
    if (!hasActiveFilters) return apiTotal;
    if (estimatedTotal != null) return estimatedTotal;
    return countQuery.data ?? 0;
  }, [hasActiveFilters, apiTotal, estimatedTotal, countQuery.data]);

  const totalPending =
    hasActiveFilters && estimatedTotal == null && countQuery.isFetching;

  const totalReady =
    !hasActiveFilters ||
    estimatedTotal != null ||
    countQuery.data != null;

  return { total, totalPending, totalReady, hasActiveFilters };
}
