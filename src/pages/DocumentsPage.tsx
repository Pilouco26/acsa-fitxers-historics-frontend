import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteDocument, listDocuments, updateDocument } from "@/api/client";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import { FilterAutocompleteInput } from "@/components/FilterAutocompleteInput";
import { PageHeader } from "@/components/PageHeader";
import { PdfPreview } from "@/components/PdfPreview";
import { TablePagination } from "@/components/TablePagination";
import {
  DOCUMENT_LIST_MAX_PAGE_SIZE,
  DOCUMENT_LIST_MIN_PAGE_SIZE,
  DOCUMENT_STATUS_OK,
  LIST_PANEL_FIXED_HEIGHT_PX,
  LIST_PANEL_ROW_HEIGHT_PX,
} from "@/constants/globals";
import { DOCUMENT_LANGUAGE_OPTIONS } from "@/constants/documentFilters";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useDocumentFilterOptions } from "@/hooks/useDocumentFilterOptions";
import type { DocumentOrderBy, DocumentOut } from "@/api/types";
import { fetchAllDocuments } from "@/utils/fetchAllDocuments";
import { hasDocumentListFilters } from "@/utils/documentListTotal";
import { matchesDocumentFilters } from "@/utils/matchDocumentFilters";
import { sortDocuments } from "@/utils/sortDocuments";

function sortIndicator(active: boolean, dir: "asc" | "desc") {
  if (!active) return "↕";
  return dir === "asc" ? "↑" : "↓";
}

export function DocumentsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterFolder, setFilterFolder] = useState("");
  const [filterProposedName, setFilterProposedName] = useState("");
  const [filterOriginalName, setFilterOriginalName] = useState("");
  const [filterDocTypeCa, setFilterDocTypeCa] = useState("");
  const [filterFinalDate, setFilterFinalDate] = useState("");
  const [filterLanguage, setFilterLanguage] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const debouncedFilterFolder = useDebouncedValue(filterFolder);
  const debouncedFilterProposedName = useDebouncedValue(filterProposedName);
  const debouncedFilterOriginalName = useDebouncedValue(filterOriginalName);
  const debouncedFilterFinalDate = useDebouncedValue(filterFinalDate);
  const { data: filterOptions } = useDocumentFilterOptions(DOCUMENT_STATUS_OK);
  const [orderBy, setOrderBy] = useState<DocumentOrderBy | null>(null);
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DOCUMENT_LIST_MIN_PAGE_SIZE);
  const [selected, setSelected] = useState<DocumentOut | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [editName, setEditName] = useState("");
  const listCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPage(0);
  }, [
    debouncedSearch,
    debouncedFilterFolder,
    debouncedFilterProposedName,
    debouncedFilterOriginalName,
    filterDocTypeCa,
    debouncedFilterFinalDate,
    filterLanguage,
    orderBy,
    orderDir,
  ]);

  const detailVisible = Boolean(selected && detailOpen);

  useEffect(() => {
    // Keep rows-per-page responsive without introducing scrollbars.
    // The list panel unmounts in preview mode, so we must re-attach when it returns.
    if (detailVisible) return;

    const el = listCardRef.current;
    if (!el) return;

    const compute = () => {
      const height = el.getBoundingClientRect().height;

      const next = Math.max(
        DOCUMENT_LIST_MIN_PAGE_SIZE,
        Math.min(
          DOCUMENT_LIST_MAX_PAGE_SIZE,
          Math.floor((height - LIST_PANEL_FIXED_HEIGHT_PX) / LIST_PANEL_ROW_HEIGHT_PX),
        ),
      );

      setPageSize((prev) => (prev === next ? prev : next));
    };

    const raf = window.requestAnimationFrame(() => compute());
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [detailVisible]);

  const activeFilters = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      folder: debouncedFilterFolder || undefined,
      proposed_name: debouncedFilterProposedName || undefined,
      original_name: debouncedFilterOriginalName || undefined,
      doc_type_ca: filterDocTypeCa || undefined,
      final_date: debouncedFilterFinalDate || undefined,
      language: filterLanguage || undefined,
    }),
    [
      debouncedSearch,
      debouncedFilterFolder,
      debouncedFilterProposedName,
      debouncedFilterOriginalName,
      filterDocTypeCa,
      debouncedFilterFinalDate,
      filterLanguage,
    ],
  );
  const hasActiveFilters = hasDocumentListFilters(activeFilters);

  const allDocumentsQuery = useQuery({
    queryKey: ["documents", DOCUMENT_STATUS_OK, "all"],
    queryFn: () => fetchAllDocuments(DOCUMENT_STATUS_OK),
    enabled: hasActiveFilters,
    staleTime: 30_000,
  });

  const serverListQuery = useQuery({
    queryKey: [
      "documents",
      DOCUMENT_STATUS_OK,
      "server-page",
      orderBy,
      orderDir,
      page,
      pageSize,
    ],
    queryFn: () =>
      listDocuments({
        status: DOCUMENT_STATUS_OK,
        order_by: orderBy ?? undefined,
        order: orderBy ? orderDir : undefined,
        limit: pageSize,
        offset: page * pageSize,
      }),
    enabled: !hasActiveFilters,
    placeholderData: (previousData, previousQuery) => {
      if (!previousData || !previousQuery) return previousData;
      const prev = previousQuery.queryKey;
      const samePageContext = prev[3] === orderBy && prev[4] === orderDir;
      return samePageContext ? previousData : undefined;
    },
  });

  const filteredPage = useMemo(() => {
    if (!hasActiveFilters || !allDocumentsQuery.data) return null;

    const matched = allDocumentsQuery.data.filter((doc) =>
      matchesDocumentFilters(doc, activeFilters),
    );
    const sorted = sortDocuments(matched, orderBy, orderDir);
    const total = sorted.length;
    const items = sorted.slice(page * pageSize, page * pageSize + pageSize);

    return { items, total };
  }, [
    hasActiveFilters,
    allDocumentsQuery.data,
    activeFilters,
    orderBy,
    orderDir,
    page,
    pageSize,
  ]);

  const data = hasActiveFilters ? filteredPage : serverListQuery.data;
  const isLoading = hasActiveFilters
    ? allDocumentsQuery.isLoading
    : serverListQuery.isLoading;
  const isFetching = hasActiveFilters
    ? allDocumentsQuery.isFetching
    : serverListQuery.isFetching;
  const refetch = hasActiveFilters
    ? allDocumentsQuery.refetch
    : serverListQuery.refetch;

  const updateNameMutation = useMutation({
    mutationFn: ({ id, proposed_name }: { id: number; proposed_name: string }) =>
      updateDocument(id, { proposed_name }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
      setEditName(updated.proposed_name ?? updated.original_name ?? "");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setDetailOpen(false);
      setSelected(null);
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalReady = !isFetching;
  const totalPending = isFetching && items.length > 0;

  useEffect(() => {
    if (total <= 0) return;
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [total, page, pageSize]);

  const showDetailToggle = items.length > 0;
  const splitClassName = [
    "split-view",
    !detailVisible && "split-view--auto",
    detailVisible && "split-view--detail-open",
    showDetailToggle && !detailVisible && "split-view--collapsed",
  ]
    .filter(Boolean)
    .join(" ");

  const emptyRows = Math.max(0, pageSize - items.length);

  function selectDoc(doc: DocumentOut) {
    setSelected(doc);
    setEditName(doc.proposed_name ?? doc.original_name ?? "");
    setDetailOpen(true);
  }

  function toggleDetailPanel() {
    if (!selected) return;
    setDetailOpen((open) => !open);
  }

  useEffect(() => {
    setPreviewRotation(0);
  }, [selected?.id]);

  function rotatePreview() {
    setPreviewRotation((deg) => (deg + 90) % 360);
  }

  function toggleSort(field: DocumentOrderBy) {
    if (orderBy === field) {
      setOrderDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setOrderBy(field);
    setOrderDir("asc");
  }

  function saveName() {
    if (!selected) return;

    const current = selected.proposed_name ?? selected.original_name ?? "";
    if (editName === current) return;

    updateNameMutation.mutate({ id: selected.id, proposed_name: editName });
  }

  function clearFilters() {
    setSearch("");
    setFilterFolder("");
    setFilterProposedName("");
    setFilterOriginalName("");
    setFilterDocTypeCa("");
    setFilterFinalDate("");
    setFilterLanguage("");
  }

  const hasFilterUiActive = Boolean(
    search ||
      filterFolder ||
      filterProposedName ||
      filterOriginalName ||
      filterDocTypeCa ||
      filterFinalDate ||
      filterLanguage,
  );

  return (
    <div className="page-fill">
      <PageHeader
        title="Documents"
        description="Documents aprovats a l'arxiu. Cliqui un fitxer per previsualitzar el PDF."
      />

      <div className={splitClassName}>
        {!detailVisible && (
          <div ref={listCardRef} className="card card-panel">
            <div className="toolbar-row">
              <input
                type="search"
                placeholder="Cerca per nom o carpeta…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => refetch()}>
                Actualitzar
              </button>
            </div>

            <details className="table-filters-advanced">
              <summary>Filtres</summary>
              <div className="field-grid" style={{ marginTop: "0.75rem" }}>
                <FilterAutocompleteInput
                  id="filter-folder"
                  label="Carpeta"
                  placeholder="Carpeta d'arxiu"
                  value={filterFolder}
                  suggestions={filterOptions?.folders ?? []}
                  onChange={setFilterFolder}
                />
                <FilterAutocompleteInput
                  id="filter-proposed-name"
                  label="Nom proposat"
                  placeholder="Nom proposat"
                  value={filterProposedName}
                  suggestions={filterOptions?.proposedNames ?? []}
                  onChange={setFilterProposedName}
                />
                <FilterAutocompleteInput
                  id="filter-original-name"
                  label="Nom original"
                  placeholder="Nom original"
                  value={filterOriginalName}
                  suggestions={filterOptions?.originalNames ?? []}
                  onChange={setFilterOriginalName}
                />
                <div className="field">
                  <label htmlFor="filter-doc-type-ca">Tipus (CA)</label>
                  <select
                    id="filter-doc-type-ca"
                    value={filterDocTypeCa}
                    onChange={(e) => setFilterDocTypeCa(e.target.value)}
                  >
                    <option value="">Tots</option>
                    {filterOptions?.docTypeCa.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="filter-final-date">Data final</label>
                  <input
                    id="filter-final-date"
                    type="search"
                    placeholder="AAAA.MM.DD"
                    value={filterFinalDate}
                    onChange={(e) => setFilterFinalDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="filter-language">Idioma</label>
                  <select
                    id="filter-language"
                    value={filterLanguage}
                    onChange={(e) => setFilterLanguage(e.target.value)}
                  >
                    <option value="">Tots</option>
                    {DOCUMENT_LANGUAGE_OPTIONS.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {hasFilterUiActive && (
                <div className="toolbar-row" style={{ marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={clearFilters}
                  >
                    Esborrar filtres
                  </button>
                </div>
              )}
            </details>

            {isLoading || (isFetching && items.length === 0) ? (
              <p className="empty-state">Carregant…</p>
            ) : items.length === 0 ? (
              <p className="empty-state">
                {hasActiveFilters
                  ? "No s'han trobat documents amb aquests filtres."
                  : "No hi ha documents aprovats."}
              </p>
            ) : (
              <div className="table-responsive table-responsive--no-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>
                        <button
                          type="button"
                          className="table-sort-btn"
                          onClick={() => toggleSort("proposed_name")}
                        >
                          Nom {sortIndicator(orderBy === "proposed_name", orderDir)}
                        </button>
                      </th>
                      <th>
                        <button
                          type="button"
                          className="table-sort-btn"
                          onClick={() => toggleSort("company_folder")}
                        >
                          Carpeta {sortIndicator(orderBy === "company_folder", orderDir)}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((doc) => (
                      <tr
                        key={doc.id}
                        className={selected?.id === doc.id ? "selected" : ""}
                        onClick={() => selectDoc(doc)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>{doc.proposed_name ?? doc.original_name ?? "—"}</td>
                        <td>{doc.company_folder ?? "—"}</td>
                      </tr>
                    ))}
                    {emptyRows > 0 &&
                      Array.from({ length: emptyRows }).map((_, idx) => (
                        <tr key={`empty-${idx}`} className="data-table-row--empty" aria-hidden="true">
                          <td>&nbsp;</td>
                          <td>&nbsp;</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {!isLoading && !isFetching && totalReady && total > 0 && (
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
              />
            )}
            {totalPending && (
              <p className="empty-state" style={{ marginTop: "0.5rem" }}>
                Actualitzant paginació…
              </p>
            )}
          </div>
        )}

        {detailVisible && (
          <button
            type="button"
            className="split-detail-toggle"
            onClick={toggleDetailPanel}
            disabled={!selected}
            aria-expanded={detailVisible}
            aria-label={detailVisible ? "Tancar panell" : "Obrir panell"}
          >
            {detailVisible ? "◀" : "▶"}
          </button>
        )}

        {detailVisible && selected && (
          <>
            <div className="card card-panel split-detail-edit">
              <h3 className="card-title">Editar document</h3>

              <div className="field">
                <label htmlFor="doc-name">Nom</label>
                <input
                  id="doc-name"
                  value={editName}
                  disabled={updateNameMutation.isPending || deleteMutation.isPending}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                />
              </div>

              <div className="field">
                <label>Carpeta</label>
                <p className="split-detail-summary">{selected.company_folder || "—"}</p>
              </div>
              <div className="field">
                <label>Resum</label>
                <p className="split-detail-summary">
                  {selected.summary || "—"}
                </p>
              </div>

              <div className="toolbar-row" style={{ justifyContent: "flex-end", marginTop: "0.75rem" }}>
                <DeleteDocumentButton
                  document={selected}
                  isPending={deleteMutation.isPending}
                  disabled={updateNameMutation.isPending}
                  onDelete={(doc) => deleteMutation.mutate(doc.id)}
                />
              </div>
            </div>

            <div className="card card-panel split-detail-preview">
              <div className="toolbar-row" style={{ marginBottom: 0 }}>
                <h3 className="card-title" style={{ marginBottom: 0, flex: "1 1 auto" }}>
                  Vista prèvia
                </h3>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={rotatePreview}
                  title="Rotar 90°"
                >
                  Rotar
                </button>
              </div>
              <PdfPreview
                documentId={selected.id}
                title={editName || selected.original_name || "PDF"}
                rotation={previewRotation}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
