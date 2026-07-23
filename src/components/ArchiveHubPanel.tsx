import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ApiError,
  createFolder,
  deleteFolder,
  listDocuments,
  listFolders,
  listPictures,
  listVideos,
  renameFolder,
} from "@/api/client";
import type { FolderRoot } from "@/api/types";
import { useAuth } from "@/contexts/AuthContext";
import { DOCUMENT_STATUS_OK } from "@/constants/globals";
import {
  documentsFolderPickPath,
  documentsListPath,
  FOLDER_ROOT_ARCHIVE,
  FOLDER_ROOT_MEDIA,
  isHiddenHubFolder,
  isValidExplorerFolderName,
  mediaCatalogPath,
} from "@/constants/folders";
import { includesFolded } from "@/utils/foldSearchText";
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
  mediaContents?: {
    documentFolders?: Iterable<string>;
    pictureFolders?: Iterable<string>;
    videoFolders?: Iterable<string>;
  },
): HubFolderCapabilities[] {
  const map = new Map<string, HubFolderCapabilities>();
  const documentFolders = new Set(
    [...(mediaContents?.documentFolders ?? [])]
      .map((name) => name.trim())
      .filter(Boolean),
  );
  const pictureFolders = new Set(
    [...(mediaContents?.pictureFolders ?? [])]
      .map((name) => name.trim())
      .filter(Boolean),
  );
  const videoFolders = new Set(
    [...(mediaContents?.videoFolders ?? [])]
      .map((name) => name.trim())
      .filter(Boolean),
  );
  // When probes are omitted, keep legacy behaviour (archive → docs; media → both).
  const documentProbesKnown = mediaContents?.documentFolders != null;
  const mediaProbesKnown = mediaContents != null;

  for (const name of archiveNames) {
    const key = name.trim();
    if (!key || isHiddenHubFolder(key)) continue;
    const hasDocuments = documentProbesKnown
      ? documentFolders.has(key)
      : true;
    const existing = map.get(key);
    if (existing) {
      existing.hasDocuments = existing.hasDocuments || hasDocuments;
    } else {
      map.set(key, {
        name: key,
        hasDocuments,
        hasPictures: false,
        hasVideos: false,
      });
    }
  }

  for (const name of mediaNames) {
    const key = name.trim();
    if (!key || isHiddenHubFolder(key)) continue;
    const hasPictures = mediaProbesKnown ? pictureFolders.has(key) : true;
    const hasVideos = mediaProbesKnown ? videoFolders.has(key) : true;
    const existing = map.get(key);
    if (existing) {
      existing.hasPictures = existing.hasPictures || hasPictures;
      existing.hasVideos = existing.hasVideos || hasVideos;
    } else {
      map.set(key, {
        name: key,
        hasDocuments: false,
        hasPictures,
        hasVideos,
      });
    }
  }

  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ca", { sensitivity: "base" }),
  );
}

function folderNameSet(names: string[]): Set<string> {
  return new Set(
    names.map((n) => n.trim()).filter((n) => n && !isHiddenHubFolder(n)),
  );
}

function rootsForFolderName(
  name: string,
  archiveNames: Set<string>,
  mediaNames: Set<string>,
): FolderRoot[] {
  const key = name.trim();
  const roots: FolderRoot[] = [];
  if (archiveNames.has(key)) roots.push(FOLDER_ROOT_ARCHIVE);
  if (mediaNames.has(key)) roots.push(FOLDER_ROOT_MEDIA);
  return roots;
}

function useHubFolders() {
  const { apiMode } = useAuth();
  const archiveQuery = useQuery({
    queryKey: ["folders", FOLDER_ROOT_ARCHIVE, apiMode ?? "ALL"],
    queryFn: () =>
      listFolders({
        root: FOLDER_ROOT_ARCHIVE,
        ...(apiMode ? { mode: apiMode } : {}),
      }),
    staleTime: 5 * 60 * 1000,
  });

  const mediaQuery = useQuery({
    queryKey: ["folders", FOLDER_ROOT_MEDIA, apiMode ?? "ALL"],
    queryFn: () =>
      listFolders({
        root: FOLDER_ROOT_MEDIA,
        ...(apiMode ? { mode: apiMode } : {}),
      }),
    staleTime: 5 * 60 * 1000,
  });

  const archiveNameSet = useMemo(() => {
    if (archiveQuery.isError) return new Set<string>();
    return folderNameSet(archiveQuery.data?.items.map((f) => f.name) ?? []);
  }, [archiveQuery.data?.items, archiveQuery.isError]);

  const archiveFolderNames = useMemo(
    () => [...archiveNameSet],
    [archiveNameSet],
  );

  const mediaFolderNames = useMemo(() => {
    if (mediaQuery.isError) return [];
    return (mediaQuery.data?.items ?? [])
      .map((f) => f.name.trim())
      .filter((name) => name && !isHiddenHubFolder(name));
  }, [mediaQuery.data?.items, mediaQuery.isError]);

  const mediaNameSet = useMemo(
    () => new Set(mediaFolderNames),
    [mediaFolderNames],
  );

  // Names only on the hub. Content (docs / fotos / vídeos) is probed when a
  // folder is opened — probing every folder up-front floods Docker / slow APIs.
  // Empty probe sets hide badges until the pick screen loads real contents.
  const folders = useMemo(
    () =>
      mergeFolderBubbles(archiveFolderNames, mediaFolderNames, {
        documentFolders: [],
        pictureFolders: [],
        videoFolders: [],
      }),
    [archiveFolderNames, mediaFolderNames],
  );

  const isLoading =
    (archiveQuery.isLoading && !archiveQuery.isError) ||
    (mediaQuery.isLoading && !mediaQuery.isError);

  return {
    folders,
    isLoading,
    apiMode,
    archiveNameSet,
    mediaNameSet,
  };
}

/** Probe documents / pictures / videos for a single folder (on open). */
function useFolderContents(folderName: string, enabled = true) {
  return useQuery({
    queryKey: ["hub-folder-contents", folderName],
    enabled: enabled && Boolean(folderName.trim()),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [documents, pictures, videos] = await Promise.all([
        listDocuments({
          folder: folderName,
          limit: 1,
          status: DOCUMENT_STATUS_OK,
        }),
        listPictures({
          folder: folderName,
          limit: 1,
          status: DOCUMENT_STATUS_OK,
        }),
        listVideos({
          folder: folderName,
          limit: 1,
          status: DOCUMENT_STATUS_OK,
        }),
      ]);
      // Prefer document items over total: filtered list totals can be unreliable.
      const hasDocuments = documents.items.length > 0;
      const hasPictures = pictures.total > 0;
      const hasVideos = videos.total > 0;
      return {
        hasDocuments,
        hasPictures,
        hasVideos,
        docCount:
          hasDocuments && documents.total > 0 ? documents.total : null,
        picCount: hasPictures ? pictures.total : null,
        vidCount: hasVideos ? videos.total : null,
      };
    },
  });
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

function promptFolderName(message: string, initial = ""): string | null {
  const raw = window.prompt(message, initial);
  if (raw == null) return null;
  const name = raw.trim();
  if (!name) {
    toast.error("El nom de la carpeta no pot estar buit.");
    return null;
  }
  if (!isValidExplorerFolderName(name)) {
    toast.error(
      "Nom de carpeta no vàlid (sense barres, ni «.», ni «..», ni «_PENDENTS»).",
    );
    return null;
  }
  return name;
}

/** Folder-bubble hub for documents / fotos / vídeos. */
export function ArchiveHubPanel({
  initialScrollTop = 0,
  onScrollTopChange,
  searchFilter = "",
  onSearchFilterChange,
}: ArchiveHubPanelProps = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { folders, isLoading, apiMode, archiveNameSet, mediaNameSet } =
    useHubFolders();
  const [menuFolder, setMenuFolder] = useState<string | null>(null);
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

  const modeOpts = apiMode ? { mode: apiMode } : {};

  const invalidateFolderQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ["folders"] });
    void queryClient.invalidateQueries({
      queryKey: ["hub-folder-contents"],
    });
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
    void queryClient.invalidateQueries({ queryKey: ["pictures"] });
    void queryClient.invalidateQueries({ queryKey: ["videos"] });
  };

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const roots: FolderRoot[] = [FOLDER_ROOT_ARCHIVE, FOLDER_ROOT_MEDIA];
      const errors: string[] = [];
      let created = 0;
      for (const root of roots) {
        try {
          await createFolder({ root, ...modeOpts }, { name }, { quiet: true });
          created += 1;
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            created += 1;
            continue;
          }
          errors.push(
            `${root}: ${err instanceof Error ? err.message : "Error"}`,
          );
        }
      }
      if (created === 0) {
        throw new Error(errors[0] ?? "No s'ha pogut crear la carpeta.");
      }
      if (errors.length > 0) {
        throw new Error(errors.join(" · "));
      }
    },
    onSuccess: () => {
      toast.success("Carpeta creada");
      invalidateFolderQueries();
    },
    onError: (err) => {
      toast.error(
        `Error en crear la carpeta: ${err instanceof Error ? err.message : "Error"}`,
      );
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({
      fromName,
      toName,
    }: {
      fromName: string;
      toName: string;
    }) => {
      const roots = rootsForFolderName(fromName, archiveNameSet, mediaNameSet);
      if (roots.length === 0) {
        throw new Error("No s'ha trobat la carpeta.");
      }
      const errors: string[] = [];
      for (const root of roots) {
        try {
          await renameFolder(
            {
              root,
              from_name: fromName,
              to_name: toName,
              ...(apiMode ? { mode: apiMode } : {}),
            },
            { quiet: true },
          );
        } catch (err) {
          errors.push(
            `${root}: ${err instanceof Error ? err.message : "Error"}`,
          );
        }
      }
      if (errors.length === roots.length) {
        throw new Error(errors[0] ?? "No s'ha pogut reanomenar.");
      }
      if (errors.length > 0) {
        throw new Error(errors.join(" · "));
      }
    },
    onSuccess: () => {
      toast.success("Carpeta reanomenada");
      invalidateFolderQueries();
      setMenuFolder(null);
    },
    onError: (err) => {
      toast.error(
        `Error en reanomenar: ${err instanceof Error ? err.message : "Error"}`,
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({
      name,
      force,
    }: {
      name: string;
      force: boolean;
    }) => {
      const roots = rootsForFolderName(name, archiveNameSet, mediaNameSet);
      if (roots.length === 0) {
        throw new Error("No s'ha trobat la carpeta.");
      }
      const errors: string[] = [];
      const notEmptyRoots: string[] = [];
      let deleted = 0;
      for (const root of roots) {
        try {
          await deleteFolder(
            { root, name, force, ...modeOpts },
            { quiet: true },
          );
          deleted += 1;
        } catch (err) {
          if (!force && err instanceof ApiError && err.status === 409) {
            notEmptyRoots.push(root);
            continue;
          }
          errors.push(
            `${root}: ${err instanceof Error ? err.message : "Error"}`,
          );
        }
      }
      if (deleted === 0 && notEmptyRoots.length > 0) {
        throw new ApiError(
          409,
          `La carpeta no està buida (${notEmptyRoots.join(", ")}).`,
        );
      }
      if (deleted === 0) {
        throw new Error(errors[0] ?? "No s'ha pogut eliminar la carpeta.");
      }
      if (errors.length > 0 || notEmptyRoots.length > 0) {
        throw new Error(
          [...errors, ...notEmptyRoots.map((r) => `${r}: no buida`)].join(
            " · ",
          ),
        );
      }
    },
    onSuccess: () => {
      toast.success("Carpeta eliminada");
      invalidateFolderQueries();
      setMenuFolder(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) return;
      toast.error(
        `Error en eliminar la carpeta: ${err instanceof Error ? err.message : "Error"}`,
      );
    },
  });

  const busy =
    createMutation.isPending ||
    renameMutation.isPending ||
    deleteMutation.isPending;

  const handleCreateFolder = () => {
    const name = promptFolderName("Nom de la nova carpeta:");
    if (!name) return;
    const exists =
      archiveNameSet.has(name) ||
      mediaNameSet.has(name) ||
      folders.some(
        (f) => f.name.localeCompare(name, "ca", { sensitivity: "base" }) === 0,
      );
    if (exists) {
      toast.error(`La carpeta «${name}» ja existeix.`);
      return;
    }
    createMutation.mutate(name);
  };

  const handleRenameFolder = (fromName: string) => {
    const toName = promptFolderName("Nou nom de la carpeta:", fromName);
    if (!toName) return;
    if (toName === fromName) {
      setMenuFolder(null);
      return;
    }
    const conflict =
      (archiveNameSet.has(toName) || mediaNameSet.has(toName)) &&
      toName.localeCompare(fromName, "ca", { sensitivity: "base" }) !== 0;
    if (conflict) {
      toast.error(`Ja existeix una carpeta anomenada «${toName}».`);
      return;
    }
    renameMutation.mutate({ fromName, toName });
  };

  const handleDeleteFolder = (name: string) => {
    const emptyOk = window.confirm(
      `Voleu eliminar la carpeta «${name}»?\n\nNomés s'eliminarà si està buida.`,
    );
    if (!emptyOk) return;
    deleteMutation.mutate(
      { name, force: false },
      {
        onError: (err) => {
          if (!(err instanceof ApiError) || err.status !== 409) return;
          const forceOk = window.confirm(
            `La carpeta «${name}» no està buida.\n\nVoleu eliminar-la amb tot el contingut? Aquesta acció no es pot desfer fàcilment.`,
          );
          if (forceOk) {
            deleteMutation.mutate({ name, force: true });
          }
        },
      },
    );
  };

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

  useEffect(() => {
    if (!menuFolder) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuFolder(null);
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-folder-menu]")) return;
      setMenuFolder(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [menuFolder]);

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
                <div
                  key={folder.name}
                  className="archive-hub-card-wrap"
                  role="listitem"
                  data-folder-menu={
                    menuFolder === folder.name ? "" : undefined
                  }
                >
                  <button
                    type="button"
                    className="archive-hub-card"
                    title={folder.name}
                    disabled={busy}
                    onClick={() =>
                      navigate(documentsFolderPickPath(folder.name))
                    }
                  >
                    <FolderCardIcon />
                    <span className="archive-hub-card-body">
                      <span className="archive-hub-card-label">
                        {folder.name}
                      </span>
                      <FolderContentBadges folder={folder} />
                    </span>
                  </button>
                  <div className="archive-hub-card-menu">
                    <button
                      type="button"
                      className="archive-hub-card-menu-trigger"
                      aria-label={`Accions per a ${folder.name}`}
                      aria-expanded={menuFolder === folder.name}
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFolder((prev) =>
                          prev === folder.name ? null : folder.name,
                        );
                      }}
                    >
                      ⋯
                    </button>
                    {menuFolder === folder.name && (
                      <div
                        className="archive-hub-card-menu-popover"
                        role="menu"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="archive-hub-card-menu-item"
                          disabled={busy}
                          onClick={() => handleRenameFolder(folder.name)}
                        >
                          Canviar el nom
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="archive-hub-card-menu-item archive-hub-card-menu-item--danger"
                          disabled={busy}
                          onClick={() => handleDeleteFolder(folder.name)}
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="archive-hub-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={handleCreateFolder}
        >
          {createMutation.isPending ? "Creant…" : "Nova carpeta"}
        </button>
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
export function ArchiveFolderPickPanel({
  folderName,
}: ArchiveFolderPickPanelProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const skipAutoPick = Boolean(
    (location.state as { skipAutoPick?: boolean } | null)?.skipAutoPick,
  );
  const { data: contents, isLoading } = useFolderContents(folderName);

  const options = useMemo(() => {
    type PickOption = {
      key: PickOptionKey;
      label: string;
      count: number | null;
      path: string;
    };

    if (!contents) return [] as PickOption[];

    const next: PickOption[] = [];
    if (contents.hasDocuments) {
      next.push({
        key: "documents",
        label: "Documents",
        count: contents.docCount,
        path: documentsListPath(folderName),
      });
    }
    if (contents.hasPictures) {
      next.push({
        key: "pictures",
        label: "Fotos",
        count: contents.picCount,
        path: mediaCatalogPath("picture", folderName, {
          fromDocuments: true,
        }),
      });
    }
    if (contents.hasVideos) {
      next.push({
        key: "videos",
        label: "Vídeo",
        count: contents.vidCount,
        path: mediaCatalogPath("video", folderName, { fromDocuments: true }),
      });
    }
    return next;
  }, [contents, folderName]);

  const singleOptionPath = options.length === 1 ? options[0].path : null;
  const didAutoSkipRef = useRef(false);
  useEffect(() => {
    didAutoSkipRef.current = false;
  }, [folderName]);
  useEffect(() => {
    // Coming back from fotos/vídeos must land on the pick screen (no bounce loop).
    if (skipAutoPick) return;
    if (didAutoSkipRef.current) return;
    if (isLoading) return;
    if (!singleOptionPath) return;
    didAutoSkipRef.current = true;
    navigate(singleOptionPath, { replace: true });
  }, [isLoading, navigate, singleOptionPath, skipAutoPick]);

  return (
    <div className="archive-hub archive-hub--pick">
      <div className="panel-with-back archive-hub-pick-with-back">
        <HubBackButton onClick={() => navigate("/documents")} />
        <div className="archive-hub-pick panel-with-back-body">
          {isLoading && <p className="empty-state">Carregant…</p>}

          {!isLoading && options.length === 0 && (
            <p className="empty-state">
              Aquesta carpeta no té contingut disponible.
            </p>
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
                  <span className="archive-hub-pick-option-title">
                    {opt.label}
                  </span>
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
