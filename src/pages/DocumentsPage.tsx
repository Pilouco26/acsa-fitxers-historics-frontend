import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMatch, useNavigate, useSearchParams } from "react-router-dom";
import {
  buildHeaders,
  deleteDocument,
  getDocument,
  documentFileUrl,
  listDocuments,
  listFolders,
  moveDocument,
  throwIfNotOk,
  updateDocument,
} from "@/api/client";
import { ArchiveFolderPickPanel, ArchiveHubPanel } from "@/components/ArchiveHubPanel";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import { FilterAutocompleteInput } from "@/components/FilterAutocompleteInput";
import { HubBackButton } from "@/components/HubBackButton";
import { PageHeader } from "@/components/PageHeader";
import { BackendDocumentTranslatePanel } from "@/components/BackendDocumentTranslatePanel";
import { PdfPreview } from "@/components/PdfPreview";
import { TablePagination } from "@/components/TablePagination";
import toast from "react-hot-toast";
import { documentsListPath, FOLDER_ROOT_ARCHIVE } from "@/constants/folders";
import {
  DOCUMENT_LIST_PAGE_SIZE,
  DOCUMENT_STATUS_OK,
} from "@/constants/globals";
import {
  applyListPanelFit,
  clearListPanelFit,
  fitListPanelLayout,
  measureListPanelChrome,
} from "@/utils/listPanelLayout";
import { DOCUMENT_LANGUAGE_OPTIONS } from "@/constants/documentFilters";
import { looksLikePassthroughSource } from "@/constants/translateLanguages";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useDocumentFilterOptions } from "@/hooks/useDocumentFilterOptions";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePrefetchDocumentListPages } from "@/hooks/usePrefetchDocumentListPages";
import type { DocumentOrderBy, DocumentOut } from "@/api/types";
import { fetchAllDocuments } from "@/utils/fetchAllDocuments";
import { hasDocumentListFilters } from "@/utils/documentListTotal";
import { matchesDocumentFilters } from "@/utils/matchDocumentFilters";
import { sortDocuments } from "@/utils/sortDocuments";
import { buildArchiveFolderSuggestions } from "@/utils/folderSuggestions";
import { useAuth } from "@/contexts/AuthContext";

const COMPACT_VIEWPORT = "(max-width: 600px)";

function sortIndicator(active: boolean, dir: "asc" | "desc") {
  if (!active) return "↕";
  return dir === "asc" ? "↑" : "↓";
}

function documentFolder(doc: DocumentOut): string {
  return doc.company_folder ?? "";
}

function sanitizeFilename(name: string): string {
  // Windows-invalid characters: \ / : * ? " < > |
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

export function DocumentsPage() {
  const queryClient = useQueryClient();
  const { apiMode } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const listMatch = useMatch({ path: "/documents/list", end: true });
  const folderPickMatch = useMatch({ path: "/documents/folder", end: true });
  const documentMatch = useMatch("/documents/:documentId");
  const routeDocumentParam =
    listMatch || folderPickMatch
      ? undefined
      : documentMatch?.params.documentId;
  const routeDocumentId =
    routeDocumentParam != null && /^\d+$/.test(routeDocumentParam)
      ? Number(routeDocumentParam)
      : null;
  const folderPickName = folderPickMatch
    ? (searchParams.get("name")?.trim() ?? "")
    : "";
  const showFolderPick = Boolean(folderPickMatch);
  const showHub =
    !listMatch &&
    !folderPickMatch &&
    routeDocumentId == null &&
    !documentMatch;
  const folderFromUrl = searchParams.get("folder") ?? "";
  const showListChrome = !showHub && !showFolderPick;

  const [search, setSearch] = useState("");
  const [filterFolder, setFilterFolder] = useState(folderFromUrl);
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
  const { data: filterOptions } = useDocumentFilterOptions(
    DOCUMENT_STATUS_OK,
    { enabled: showListChrome },
  );
  const { data: archiveFolders } = useQuery({
    queryKey: ["folders", FOLDER_ROOT_ARCHIVE, apiMode ?? "ALL"],
    queryFn: () =>
      listFolders({
        root: FOLDER_ROOT_ARCHIVE,
        ...(apiMode ? { mode: apiMode } : {}),
      }),
    staleTime: 5 * 60 * 1000,
    enabled: showListChrome,
  });

  useEffect(() => {
    if (!showListChrome) return;
    setFilterFolder(folderFromUrl);
  }, [showListChrome, folderFromUrl]);

  const [orderBy, setOrderBy] = useState<DocumentOrderBy | null>(null);
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DOCUMENT_LIST_PAGE_SIZE);
  const [selected, setSelected] = useState<DocumentOut | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const listCardRef = useRef<HTMLDivElement>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const hubScrollTopRef = useRef(0);
  const [hubSearch, setHubSearch] = useState("");
  const isCompact = useMediaQuery(COMPACT_VIEWPORT);

  useEffect(() => {
    if (showListChrome) return;
    setDetailOpen(false);
    setSelected(null);
    setTranslateOpen(false);
  }, [showListChrome]);

  useEffect(() => {
    if (!isCompact) return;
    setPageSize(DOCUMENT_LIST_PAGE_SIZE);
  }, [isCompact]);

  const folderSuggestions = useMemo(
    () =>
      buildArchiveFolderSuggestions({
        archiveFolderNames: archiveFolders?.items.map((folder) => folder.name),
        documentFolderNames: filterOptions?.folders,
        currentFolder: editFolder,
      }),
    [archiveFolders?.items, editFolder, filterOptions?.folders],
  );

  const existingFolderSuggestions = useMemo(
    () =>
      buildArchiveFolderSuggestions({
        archiveFolderNames: archiveFolders?.items.map((folder) => folder.name),
        documentFolderNames: filterOptions?.folders,
        currentFolder: "",
      }),
    [archiveFolders?.items, filterOptions?.folders],
  );

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
    enabled: showListChrome && hasActiveFilters,
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
    enabled: showListChrome && !hasActiveFilters,
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

  const updateDocumentMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updateDocument>[1] }) =>
      updateDocument(id, body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
      setEditName(updated.proposed_name ?? updated.original_name ?? "");
    },
  });

  const moveDocumentMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof moveDocument>[1] }) =>
      moveDocument(id, body),
    onSuccess: (_result, { id, body }) => {
      const destFolder = (body.dest_folder ?? "").trim();
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSelected((prev) =>
        prev?.id === id ? { ...prev, company_folder: destFolder } : prev,
      );
      setEditFolder(destFolder);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSelected(null);
      navigate(documentsListPath(filterFolder));
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalReady = !isFetching;
  const totalPending = isFetching && items.length > 0;

  const routeDocumentQuery = useQuery({
    queryKey: ["documents", "detail", routeDocumentId],
    queryFn: () => getDocument(routeDocumentId!),
    enabled: showListChrome && routeDocumentId != null,
  });

  useEffect(() => {
    if (listMatch || folderPickMatch || showHub) return;
    if (documentMatch && routeDocumentId == null) {
      navigate("/documents", { replace: true });
    }
  }, [
    listMatch,
    folderPickMatch,
    showHub,
    documentMatch,
    routeDocumentId,
    navigate,
  ]);

  useEffect(() => {
    if (folderPickMatch && !folderPickName) {
      navigate("/documents", { replace: true });
    }
  }, [folderPickMatch, folderPickName, navigate]);

  useEffect(() => {
    if (routeDocumentId == null) {
      setDetailOpen(false);
      setTranslateOpen(false);
      return;
    }

    if (routeDocumentQuery.isError) {
      navigate(documentsListPath(folderFromUrl), { replace: true });
      return;
    }

    const fromList = data?.items?.find((doc) => doc.id === routeDocumentId);
    const doc = routeDocumentQuery.data ?? fromList;
    if (!doc) return;

    setSelected(doc);
    setDetailOpen(true);
  }, [
    routeDocumentId,
    data?.items,
    routeDocumentQuery.data,
    routeDocumentQuery.isError,
    navigate,
  ]);

  usePrefetchDocumentListPages({
    enabled: showListChrome && !hasActiveFilters,
    page,
    pageSize,
    total,
    scopeKey: `${orderBy ?? ""}:${orderDir}`,
    getPageOptions: (targetPage) => ({
      queryKey: [
        "documents",
        DOCUMENT_STATUS_OK,
        "server-page",
        orderBy,
        orderDir,
        targetPage,
        pageSize,
      ],
      queryFn: () =>
        listDocuments({
          status: DOCUMENT_STATUS_OK,
          order_by: orderBy ?? undefined,
          order: orderBy ? orderDir : undefined,
          limit: pageSize,
          offset: targetPage * pageSize,
        }),
    }),
  });

  useEffect(() => {
    // Keep rows-per-page responsive without introducing scrollbars.
    // The list panel unmounts in preview mode, so we must re-attach when it returns.
    // On compact viewports, skip fitting so names can wrap and empty rows are unused.
    if (detailVisible) return;

    const cardEl = listCardRef.current;
    const tableEl = tableAreaRef.current;
    if (!cardEl || !tableEl) return;

    if (isCompact) {
      clearListPanelFit(tableEl);
      return;
    }

    const compute = () => {
      window.requestAnimationFrame(() => {
        const available =
          cardEl.getBoundingClientRect().height -
          measureListPanelChrome(cardEl, tableEl);
        const fit = fitListPanelLayout(available);
        applyListPanelFit(tableEl, fit);
        setPageSize((prev) => (prev === fit.pageSize ? prev : fit.pageSize));
      });
    };

    const raf = window.requestAnimationFrame(() => compute());
    const ro = new ResizeObserver(() => compute());
    ro.observe(cardEl);

    const filtersEl = cardEl.querySelector("details.table-filters-advanced");
    filtersEl?.addEventListener("toggle", compute);
    if (filtersEl) ro.observe(filtersEl);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      filtersEl?.removeEventListener("toggle", compute);
      clearListPanelFit(tableEl);
    };
  }, [detailVisible, isLoading, isFetching, isCompact]);

  useEffect(() => {
    if (total <= 0) return;
    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [total, page, pageSize]);

  const translateFocusOpen = translateOpen;

  const splitClassName = [
    "split-view",
    !detailVisible && "split-view--auto",
    !detailVisible && "split-view--collapsed",
    detailVisible && "split-view--detail-open",
    detailVisible && translateFocusOpen && "split-view--translate-focus",
  ]
    .filter(Boolean)
    .join(" ");

  const emptyRows = isCompact ? 0 : Math.max(0, pageSize - items.length);

  const tableOverlayMessage =
    isLoading || (isFetching && items.length === 0)
      ? "Carregant…"
      : items.length === 0
        ? hasActiveFilters
          ? "No s'han trobat documents amb aquests filtres."
          : "No hi ha documents aprovats."
        : null;

  function selectDoc(doc: DocumentOut) {
    const folderQs = filterFolder.trim()
      ? `?folder=${encodeURIComponent(filterFolder.trim())}`
      : "";
    navigate(`/documents/${doc.id}${folderQs}`);
  }

  function toggleDetailPanel() {
    if (!selected) return;
    // In translation mode, first return to document detail (keep URL).
    if (translateFocusOpen) {
      setTranslateOpen(false);
      return;
    }
    if (detailOpen) {
      navigate(documentsListPath(folderFromUrl || filterFolder));
      return;
    }
    const folderQs = (folderFromUrl || filterFolder).trim()
      ? `?folder=${encodeURIComponent((folderFromUrl || filterFolder).trim())}`
      : "";
    navigate(`/documents/${selected.id}${folderQs}`);
  }

  useEffect(() => {
    if (!selected) return;
    setEditName(selected.proposed_name ?? selected.original_name ?? "");
    setEditFolder(documentFolder(selected));
    setPreviewRotation(0);
    setTranslateOpen(false);
  }, [selected?.id]);

  function rotatePreview() {
    setPreviewRotation((deg) => (deg + 90) % 360);
  }

  async function downloadSelectedDocument() {
    if (!selected || isDownloading) return;
    setIsDownloading(true);

    const baseName = selected.proposed_name ?? selected.original_name ?? "document";
    const filename = `${sanitizeFilename(baseName) || "document"}.pdf`;

    try {
      const res = await fetch(documentFileUrl(selected.id), {
        headers: buildHeaders({ Accept: "application/pdf" }),
      });

      await throwIfNotOk(res);

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "No s'ha pogut descarregar el PDF.",
      );
    } finally {
      setIsDownloading(false);
    }
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

    updateDocumentMutation.mutate({ id: selected.id, body: { proposed_name: editName } });
  }

  function saveFolder(nextFolder?: string) {
    if (!selected) return;

    const destFolder = (nextFolder ?? editFolder).trim();
    if (!destFolder) return;

    const current = documentFolder(selected);
    if (destFolder === current) return;

    if (existingFolderSuggestions.length > 0) {
      const destKey = destFolder.toLocaleLowerCase("ca");
      const isExistingFolder = existingFolderSuggestions.some(
        (folder) => folder.toLocaleLowerCase("ca") === destKey,
      );
      if (!isExistingFolder) {
        const ok = window.confirm(
          `Aquesta carpeta no existeix a la llista.\n\nVoleu crear-la i moure el document a: "${destFolder}"?`,
        );
        if (!ok) {
          setEditFolder(current);
          return;
        }
      }
    }

    moveDocumentMutation.mutate({
      id: selected.id,
      body: {
        dest_folder: destFolder,
        dest_name: null,
        dry_run: false,
      },
    });
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

  const isSaving =
    updateDocumentMutation.isPending ||
    moveDocumentMutation.isPending ||
    deleteMutation.isPending;

  const hasFilterUiActive = Boolean(
    search ||
      filterFolder ||
      filterProposedName ||
      filterOriginalName ||
      filterDocTypeCa ||
      filterFinalDate ||
      filterLanguage,
  );

  if (showHub) {
    return (
      <div className="page-fill page-fill--archive-hub">
        <PageHeader
          title="Classificats"
          description="Trieu una carpeta o obriu documents, fotos o vídeos."
        />
        <ArchiveHubPanel
          searchFilter={hubSearch}
          onSearchFilterChange={setHubSearch}
          initialScrollTop={hubScrollTopRef.current}
          onScrollTopChange={(scrollTop) => {
            hubScrollTopRef.current = scrollTop;
          }}
        />
      </div>
    );
  }

  if (showFolderPick) {
    if (!folderPickName) {
      return null;
    }
    return (
      <div className="page-fill">
        <PageHeader
          title={folderPickName}
          description="Trieu què voleu veure d'aquesta carpeta."
        />
        <ArchiveFolderPickPanel folderName={folderPickName} />
      </div>
    );
  }

  const pageHeader = (
    <PageHeader
      title="Documents Classificats"
      description={
        isCompact ? (
          filterFolder.trim() ? (
            <>
              Carpeta: <strong>{filterFolder.trim()}</strong>
            </>
          ) : undefined
        ) : (
          <>
            Documents aprovats a l&apos;arxiu. Cliqui un fitxer per previsualitzar
            el PDF.
            {filterFolder.trim() ? (
              <>
                {" "}
                Carpeta: <strong>{filterFolder.trim()}</strong>.
              </>
            ) : null}
          </>
        )
      }
    />
  );

  const backToListLabel = translateFocusOpen
    ? "Tornar al document"
    : "Tornar a la llista";

  const detailEditPanel =
    detailVisible && selected && !translateFocusOpen ? (
      <div className="card card-panel split-detail-edit">
        <h3 className="card-title">Editar document</h3>

        <div className="field">
          <label htmlFor="doc-name">Nom</label>
          <input
            id="doc-name"
            value={editName}
            disabled={isSaving}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
        </div>

        <FilterAutocompleteInput
          id="doc-folder"
          label="Carpeta"
          placeholder="Carpeta d'arxiu"
          value={editFolder}
          suggestions={folderSuggestions}
          onChange={setEditFolder}
          disabled={isSaving}
          onCommitValue={(value) => saveFolder(value)}
          maxSuggestions={0}
        />
        <div className="field">
          <label>Resum</label>
          <p className="split-detail-summary">{selected.summary || "—"}</p>
        </div>

        <div
          className="toolbar-row"
          style={{ justifyContent: "flex-end", marginTop: "0.75rem" }}
        >
          <DeleteDocumentButton
            document={selected}
            isPending={deleteMutation.isPending}
            disabled={
              updateDocumentMutation.isPending || moveDocumentMutation.isPending
            }
            onDelete={(doc) => deleteMutation.mutate(doc.id)}
          />
        </div>
      </div>
    ) : null;

  const detailPreviewPanel =
    detailVisible && selected ? (
      <div className="card card-panel split-detail-preview">
        {!translateFocusOpen && (
          <div
            className="toolbar-row toolbar-row--detail-actions"
            style={{ marginBottom: 0 }}
          >
            <h3
              className="card-title"
              style={{ marginBottom: 0, flex: "1 1 auto" }}
            >
              Vista prèvia
            </h3>
            {!looksLikePassthroughSource(selected.language) && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                aria-pressed={false}
                title="Mostrar el text traduït del document (resultat al costat)"
                onClick={() => {
                  setTranslateOpen(true);
                }}
              >
                Traduir
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              title="Descarregar"
              aria-label="Descarregar"
              disabled={isDownloading}
              onClick={() => {
                void downloadSelectedDocument();
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={rotatePreview}
              title="Rotar 90°"
            >
              Rotar
            </button>
          </div>
        )}
        {translateOpen &&
        !looksLikePassthroughSource(selected.language) ? (
          <BackendDocumentTranslatePanel
            documentId={selected.id}
            translatedText={selected.translated_text}
            translatedPages={selected.translated_pages}
            layoutPages={selected.layout_pages}
            layoutPdfUrl={selected.layout_pdf_url}
            documentLanguage={selected.language}
            docType={selected.doc_type}
            docTypeCa={selected.doc_type_ca}
            open
            onTranslated={(result) => {
              setSelected((prev) =>
                prev && prev.id === result.document_id
                  ? {
                      ...prev,
                      translated_text: result.translated_text,
                      translated_pages: result.translated_pages,
                      layout_pages: result.layout_pages,
                      layout_pdf_url: result.layout_pdf_url,
                    }
                  : prev,
              );
              void queryClient.invalidateQueries({
                queryKey: ["documents"],
              });
            }}
          />
        ) : (
          <PdfPreview
            documentId={selected.id}
            title={editName || selected.original_name || "PDF"}
            rotation={previewRotation}
          />
        )}
      </div>
    ) : null;

  return (
    <div className="page-fill">
      {pageHeader}

      <div className={splitClassName}>
        {!detailVisible && (
          <div className="panel-with-back">
            <HubBackButton onClick={() => navigate("/documents")} />
            <div ref={listCardRef} className="card card-panel">
            <div className="toolbar-row toolbar-row--list-search">
              <input
                type="search"
                placeholder="Cerca per nom o carpeta…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => refetch()}
                title="Actualitzar"
                aria-label="Actualitzar"
              >
                {isCompact ? "↻" : "Actualitzar"}
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
                <FilterAutocompleteInput
                  id="filter-doc-type-ca"
                  label="Tipus (CA)"
                  placeholder="Tots"
                  value={filterDocTypeCa}
                  suggestions={filterOptions?.docTypeCa ?? []}
                  onChange={setFilterDocTypeCa}
                />
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
                <FilterAutocompleteInput
                  id="filter-language"
                  label="Idioma"
                  placeholder="ca, es, fr…"
                  value={filterLanguage}
                  suggestions={DOCUMENT_LANGUAGE_OPTIONS.map((option) => option.value)}
                  onChange={setFilterLanguage}
                />
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

            <div
              ref={tableAreaRef}
              className="table-responsive table-responsive--no-scroll table-list-body"
            >
              {tableOverlayMessage && (
                <p className="table-list-overlay" role="status">
                  {tableOverlayMessage}
                </p>
              )}
              <table
                className="data-table data-table--list"
                style={{ "--page-size": pageSize } as CSSProperties}
              >
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
                    <th className="table-list-folder-col">
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
                  {items.map((doc) => {
                    const name = doc.proposed_name ?? doc.original_name ?? "—";
                    const folder = documentFolder(doc) || "—";
                    return (
                      <tr
                        key={doc.id}
                        className={selected?.id === doc.id ? "selected" : ""}
                        onClick={() => selectDoc(doc)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <span className="table-list-primary">{name}</span>
                          <span className="table-list-secondary">{folder}</span>
                        </td>
                        <td className="table-list-folder-col">{folder}</td>
                      </tr>
                    );
                  })}
                  {emptyRows > 0 &&
                    Array.from({ length: emptyRows }).map((_, idx) => (
                      <tr key={`empty-${idx}`} className="data-table-row--empty" aria-hidden="true">
                        <td>&nbsp;</td>
                        <td className="table-list-folder-col">&nbsp;</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!isLoading && !isFetching && totalReady && (
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={total}
                compact={isCompact}
                onPageChange={setPage}
              />
            )}
            {totalPending && (
              <p className="empty-state" style={{ marginTop: "0.5rem" }}>
                Actualitzant paginació…
              </p>
            )}
            </div>
          </div>
        )}

        {detailVisible && !isCompact && (
          <button
            type="button"
            className="split-detail-toggle"
            onClick={toggleDetailPanel}
            disabled={!selected}
            aria-expanded={detailVisible}
            aria-label={backToListLabel}
            title={backToListLabel}
          >
            ◀
          </button>
        )}

        {detailVisible &&
          selected &&
          (isCompact ? (
            <div className="panel-with-back documents-detail-mobile">
              <HubBackButton
                onClick={toggleDetailPanel}
                label={backToListLabel}
              />
              <div className="documents-detail-mobile-stack">
                {detailPreviewPanel}
                {detailEditPanel}
              </div>
            </div>
          ) : (
            <>
              {detailEditPanel}
              {detailPreviewPanel}
            </>
          ))}
      </div>
    </div>
  );
}
