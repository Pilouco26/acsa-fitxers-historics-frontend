import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listFolders, listPictures, listVideos } from "@/api/client";
import { DOCUMENT_STATUS_OK } from "@/constants/globals";
import {
  documentsFolderPickPath,
  documentsListPath,
  FOLDER_ROOT_ARCHIVE,
  FOLDER_ROOT_MEDIA,
  isHiddenHubFolder,
  mediaCatalogPath,
} from "@/constants/folders";
import { includesFolded } from "@/utils/foldSearchText";
import { fetchFilteredDocumentCount } from "@/utils/documentListTotal";
import { HubBackButton } from "@/components/HubBackButton";

export type HubFolderCapabilities = {
  name: string;
  hasDocuments: boolean;
  hasPictures: boolean;
  hasVideos: boolean;
};

export function mergeFolderBubbles(
  archiveNames: string[],
  mediaNames: string[],
): HubFolderCapabilities[] {
  const map = new Map<string, HubFolderCapabilities>();

  for (const name of archiveNames) {
    const key = name.trim();
    if (!key || isHiddenHubFolder(key)) continue;
    const existing = map.get(key);
    if (existing) {
      existing.hasDocuments = true;
    } else {
      map.set(key, {
        name: key,
        hasDocuments: true,
        hasPictures: false,
        hasVideos: false,
      });
    }
  }

  for (const name of mediaNames) {
    const key = name.trim();
    if (!key || isHiddenHubFolder(key)) continue;
    const existing = map.get(key);
    if (existing) {
      // Shared media root: folder may contain photos and/or videos.
      existing.hasPictures = true;
      existing.hasVideos = true;
    } else {
      map.set(key, {
        name: key,
        hasDocuments: false,
        hasPictures: true,
        hasVideos: true,
      });
    }
  }

  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ca", { sensitivity: "base" }),
  );
}

function useHubFolders() {
  const archiveQuery = useQuery({
    queryKey: ["folders", FOLDER_ROOT_ARCHIVE],
    queryFn: () => listFolders({ root: FOLDER_ROOT_ARCHIVE }),
    staleTime: 5 * 60 * 1000,
  });

  const mediaQuery = useQuery({
    queryKey: ["folders", FOLDER_ROOT_MEDIA],
    queryFn: () => listFolders({ root: FOLDER_ROOT_MEDIA }),
    staleTime: 5 * 60 * 1000,
  });

  const folders = useMemo(
    () =>
      mergeFolderBubbles(
        archiveQuery.isError
          ? []
          : (archiveQuery.data?.items.map((f) => f.name) ?? []),
        mediaQuery.isError
          ? []
          : (mediaQuery.data?.items.map((f) => f.name) ?? []),
      ),
    [
      archiveQuery.data?.items,
      archiveQuery.isError,
      mediaQuery.data?.items,
      mediaQuery.isError,
    ],
  );

  const isLoading =
    (archiveQuery.isLoading && !archiveQuery.isError) ||
    (mediaQuery.isLoading && !mediaQuery.isError);

  return { folders, isLoading };
}

function FolderContentBadges({ folder }: { folder: HubFolderCapabilities }) {
  if (!folder.hasDocuments && !folder.hasPictures && !folder.hasVideos) {
    return null;
  }

  return (
    <span className="archive-hub-card-badges">
      {folder.hasDocuments && (
        <span className="archive-hub-badge">Documents</span>
      )}
      {folder.hasPictures && <span className="archive-hub-badge">Fotos</span>}
      {folder.hasVideos && <span className="archive-hub-badge">Vídeo</span>}
    </span>
  );
}

function FolderCardIcon() {
  return (
    <svg
      className="archive-hub-card-icon"
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

type ArchiveHubPanelProps = {
  /** Scroll offset to restore when the bubble grid remounts. */
  initialScrollTop?: number;
  /** Called when scroll changes or the panel unmounts. */
  onScrollTopChange?: (scrollTop: number) => void;
  /** Accent- and case-insensitive folder name filter for the bubble grid. */
  searchFilter?: string;
  onSearchFilterChange?: (value: string) => void;
};

/** Folder-bubble hub for documents / fotos / vídeos. */
export function ArchiveHubPanel({
  initialScrollTop = 0,
  onScrollTopChange,
  searchFilter = "",
  onSearchFilterChange,
}: ArchiveHubPanelProps = {}) {
  const navigate = useNavigate();
  const { folders, isLoading } = useHubFolders();
  const filteredFolders = useMemo(() => {
    const query = searchFilter.trim();
    if (!query) return folders;
    return folders.filter((folder) => includesFolded(folder.name, query));
  }, [folders, searchFilter]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollTopRef = useRef(initialScrollTop);
  const onScrollTopChangeRef = useRef(onScrollTopChange);
  initialScrollTopRef.current = initialScrollTop;
  onScrollTopChangeRef.current = onScrollTopChange;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || isLoading || filteredFolders.length === 0) return;
    el.scrollTop = initialScrollTopRef.current;
  }, [isLoading, filteredFolders.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      onScrollTopChangeRef.current?.(el.scrollTop);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      onScrollTopChangeRef.current?.(el.scrollTop);
      el.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div className="archive-hub">
      <div ref={scrollRef} className="archive-hub-scroll">
        {onSearchFilterChange && (
          <div className="archive-hub-search">
            <label className="archive-hub-search-field">
              <svg
                className="archive-hub-search-icon"
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
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                className="archive-hub-search-input"
                placeholder="Cerca carpetes…"
                value={searchFilter}
                onChange={(e) => onSearchFilterChange(e.target.value)}
              />
            </label>
            {!isLoading && folders.length > 0 && (
              <p className="archive-hub-search-count" aria-live="polite">
                {filteredFolders.length === folders.length
                  ? `${folders.length} carpetes`
                  : `${filteredFolders.length} de ${folders.length} carpetes`}
              </p>
            )}
          </div>
        )}

        <div className="archive-hub-cards">
        {isLoading && <p className="empty-state">Carregant carpetes…</p>}

        {!isLoading && folders.length === 0 && (
          <p className="empty-state">No hi ha carpetes disponibles.</p>
        )}

        {!isLoading && folders.length > 0 && filteredFolders.length === 0 && (
          <p className="empty-state">Cap carpeta coincideix amb la cerca.</p>
        )}

        {!isLoading && filteredFolders.length > 0 && (
          <div className="archive-hub-card-grid" role="list">
            {filteredFolders.map((folder) => (
              <button
                key={folder.name}
                type="button"
                className="archive-hub-card"
                role="listitem"
                title={folder.name}
                onClick={() => navigate(documentsFolderPickPath(folder.name))}
              >
                <FolderCardIcon />
                <span className="archive-hub-card-body">
                  <span className="archive-hub-card-label">{folder.name}</span>
                  <FolderContentBadges folder={folder} />
                </span>
              </button>
            ))}
          </div>
        )}
        </div>
      </div>

      <div className="archive-hub-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate(documentsListPath())}
        >
          Veure documents
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            navigate(mediaCatalogPath("picture", null, { fromDocuments: true }))
          }
        >
          Veure fotos
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            navigate(mediaCatalogPath("video", null, { fromDocuments: true }))
          }
        >
          Veure videos
        </button>
      </div>
    </div>
  );
}

type ArchiveFolderPickPanelProps = {
  folderName: string;
};

type PickOptionKey = "documents" | "pictures" | "videos";

function PickOptionIcon({ kind }: { kind: PickOptionKey }) {
  const common = {
    xmlns: "http://www.w3.org/2000/svg",
    width: "32",
    height: "32",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (kind) {
    case "documents":
      return (
        <svg className="archive-hub-pick-option-icon" {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      );
    case "pictures":
      return (
        <svg className="archive-hub-pick-option-icon" {...common}>
          <rect x="2" y="2" width="20" height="20" rx="4" ry="4" />
          <path d="M8 11l2-2 4 4 3-3 3 3" />
          <path d="M8 7h.01" />
        </svg>
      );
    case "videos":
      return (
        <svg className="archive-hub-pick-option-icon" {...common}>
          <rect x="2" y="6" width="20" height="12" rx="4" ry="4" />
          <path d="M10 8l6 4-6 4z" />
        </svg>
      );
  }
}

/** Choose Documents / Fotos / Vídeo for a selected folder. */
export function ArchiveFolderPickPanel({ folderName }: ArchiveFolderPickPanelProps) {
  const navigate = useNavigate();
  const { folders, isLoading } = useHubFolders();

  const folder = useMemo(
    () => folders.find((f) => f.name === folderName) ?? null,
    [folders, folderName],
  );

  const { data: docCount } = useQuery({
    queryKey: ["pick-count-docs", folderName],
    queryFn: () =>
      fetchFilteredDocumentCount({
        status: DOCUMENT_STATUS_OK,
        folder: folderName,
      }),
    enabled: !isLoading && (folder?.hasDocuments ?? true),
  });
  const { data: picData } = useQuery({
    queryKey: ["pick-count-pics", folderName],
    queryFn: () =>
      listPictures({
        folder: folderName,
        limit: 1,
        status: DOCUMENT_STATUS_OK,
      }),
    enabled: !isLoading && (folder?.hasPictures ?? true),
  });
  const { data: vidData } = useQuery({
    queryKey: ["pick-count-vids", folderName],
    queryFn: () =>
      listVideos({
        folder: folderName,
        limit: 1,
        status: DOCUMENT_STATUS_OK,
      }),
    enabled: !isLoading && (folder?.hasVideos ?? true),
  });

  const picCount = picData?.total ?? null;
  const vidCount = vidData?.total ?? null;
  const docTotal = docCount ?? null;

  const options = useMemo(() => {
    type PickOption = {
      key: PickOptionKey;
      label: string;
      count: number | null;
      path: string;
    };

    if (!folder) {
      const opts: PickOption[] = [
        {
          key: "documents",
          label: "Documents",
          count: docTotal,
          path: documentsListPath(folderName),
        },
        {
          key: "pictures",
          label: "Fotos",
          count: picCount,
          path: mediaCatalogPath("picture", folderName, { fromDocuments: true }),
        },
        {
          key: "videos",
          label: "Vídeo",
          count: vidCount,
          path: mediaCatalogPath("video", folderName, { fromDocuments: true }),
        },
      ];
      return opts;
    }

    const next: PickOption[] = [];
    if (folder.hasDocuments) {
      next.push({
        key: "documents",
        label: "Documents",
        count: docTotal,
        path: documentsListPath(folder.name),
      });
    }
    if (folder.hasPictures) {
      next.push({
        key: "pictures",
        label: "Fotos",
        count: picCount,
        path: mediaCatalogPath("picture", folder.name, { fromDocuments: true }),
      });
    }
    if (folder.hasVideos) {
      next.push({
        key: "videos",
        label: "Vídeo",
        count: vidCount,
        path: mediaCatalogPath("video", folder.name, { fromDocuments: true }),
      });
    }
    return next;
  }, [folder, folderName, docTotal, picCount, vidCount]);

  const singleOptionPath = options.length === 1 ? options[0].path : null;
  const didAutoSkipRef = useRef(false);
  useEffect(() => {
    if (didAutoSkipRef.current) return;
    if (isLoading) return;
    if (!singleOptionPath) return;
    didAutoSkipRef.current = true;
    navigate(singleOptionPath, { replace: true });
  }, [isLoading, navigate, singleOptionPath]);

  return (
    <div className="archive-hub archive-hub--pick">
      <div className="panel-with-back archive-hub-pick-with-back">
        <HubBackButton onClick={() => navigate("/documents")} />
        <div className="archive-hub-pick panel-with-back-body">
          {isLoading && <p className="empty-state">Carregant…</p>}

          {!isLoading && options.length === 0 && (
            <p className="empty-state">Aquesta carpeta no té contingut disponible.</p>
          )}

          {!isLoading && options.length > 0 && (
            <div className="archive-hub-pick-options" role="list">
              {options.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className="archive-hub-pick-option"
                  role="listitem"
                  onClick={() => navigate(opt.path)}
                >
                  <PickOptionIcon kind={opt.key} />
                  <span className="archive-hub-pick-option-title">{opt.label}</span>
                  <span className="archive-hub-pick-option-subtitle">
                    {opt.count != null ? `${opt.count}` : "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
