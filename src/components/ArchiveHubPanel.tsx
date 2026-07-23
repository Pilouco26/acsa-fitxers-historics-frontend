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
import { AppDialog } from "@/components/AppDialog";
import { HubBackButton } from "@/components/HubBackButton";
import { PanelEmptyActions, PanelLoading } from "@/components/PanelStatus";
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
  const folders = useMemo(
    () => mergeFolderBubbles(archiveFolderNames, mediaFolderNames),
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

type ArchiveHubFolderCardProps = {
  folder: HubFolderCapabilities;
  menuOpen: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggleMenu: () => void;
  onRename: () => void;
  onDelete: () => void;
};

/** Folder card with always-visible ⋯ (open menu closes if card scrolls under sticky search). */
function ArchiveHubFolderCard({
  folder,
  menuOpen,
  busy,
  onOpen,
  onToggleMenu,
  onRename,
  onDelete,
}: ArchiveHubFolderCardProps) {
  return (
    <div
      className="archive-hub-card-wrap"
      role="listitem"
      data-folder-name={folder.name}
      data-folder-menu={menuOpen ? "" : undefined}
    >
      <button
        type="button"
        className="archive-hub-card"
        title={folder.name}
        disabled={busy}
        onClick={onOpen}
      >
        <FolderCardIcon />
        <span className="archive-hub-card-body">
          <span className="archive-hub-card-label">{folder.name}</span>
        </span>
      </button>
      <div className="archive-hub-card-menu">
        <button
          type="button"
          className="archive-hub-card-menu-trigger"
          aria-label={`Accions per a ${folder.name}`}
          aria-expanded={menuOpen}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu();
          }}
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="archive-hub-card-menu-popover" role="menu">
            <button
              type="button"
              role="menuitem"
              className="archive-hub-card-menu-item"
              disabled={busy}
              onClick={onRename}
            >
              Canviar el nom
            </button>
            <button
              type="button"
              role="menuitem"
              className="archive-hub-card-menu-item archive-hub-card-menu-item--danger"
              disabled={busy}
              onClick={onDelete}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
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

function validateFolderNameInput(raw: string): string | null {
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
  const [nameDialog, setNameDialog] = useState<
    null | { mode: "create" } | { mode: "rename"; fromName: string }
  >(null);
  const [nameDraft, setNameDraft] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<
    null | { name: string; force: boolean }
  >(null);
  const filteredFolders = useMemo(() => {
    const query = searchFilter.trim();
    if (!query) return folders;
    return folders.filter((folder) => includesFolded(folder.name, query));
  }, [folders, searchFilter]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollTopRef = useRef(initialScrollTop);
  const onScrollTopChangeRef = useRef(onScrollTopChange);
  const menuFolderRef = useRef(menuFolder);
  initialScrollTopRef.current = initialScrollTop;
  onScrollTopChangeRef.current = onScrollTopChange;
  menuFolderRef.current = menuFolder;

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
      return {
        warning: errors.length > 0 ? errors.join(" · ") : null,
      };
    },
    onSuccess: (result) => {
      invalidateFolderQueries();
      if (result.warning) {
        toast.error(`Carpeta creada parcialment: ${result.warning}`);
      } else {
        toast.success("Carpeta creada");
      }
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
      let renamed = 0;
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
          renamed += 1;
        } catch (err) {
          errors.push(
            `${root}: ${err instanceof Error ? err.message : "Error"}`,
          );
        }
      }
      if (renamed === 0) {
        throw new Error(errors[0] ?? "No s'ha pogut reanomenar.");
      }
      return {
        warning: errors.length > 0 ? errors.join(" · ") : null,
      };
    },
    onSuccess: (result) => {
      invalidateFolderQueries();
      setMenuFolder(null);
      if (result.warning) {
        toast.error(`Carpeta reanomenada parcialment: ${result.warning}`);
      } else {
        toast.success("Carpeta reanomenada");
      }
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
      const warningParts = [
        ...errors,
        ...notEmptyRoots.map((r) => `${r}: no buida`),
      ];
      return {
        warning: warningParts.length > 0 ? warningParts.join(" · ") : null,
      };
    },
    onSuccess: (result) => {
      invalidateFolderQueries();
      setMenuFolder(null);
      if (result.warning) {
        toast.error(`Carpeta eliminada parcialment: ${result.warning}`);
      } else {
        toast.success("Carpeta eliminada");
      }
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

  const openCreateDialog = () => {
    setMenuFolder(null);
    setNameDraft("");
    setNameDialog({ mode: "create" });
  };

  const openRenameDialog = (fromName: string) => {
    setMenuFolder(null);
    setNameDraft(fromName);
    setNameDialog({ mode: "rename", fromName });
  };

  const openDeleteDialog = (name: string) => {
    setMenuFolder(null);
    setDeleteDialog({ name, force: false });
  };

  const submitNameDialog = () => {
    if (!nameDialog) return;
    const name = validateFolderNameInput(nameDraft);
    if (!name) return;

    if (nameDialog.mode === "create") {
      const exists =
        archiveNameSet.has(name) ||
        mediaNameSet.has(name) ||
        folders.some(
          (f) =>
            f.name.localeCompare(name, "ca", { sensitivity: "base" }) === 0,
        );
      if (exists) {
        toast.error(`La carpeta «${name}» ja existeix.`);
        return;
      }
      setNameDialog(null);
      createMutation.mutate(name);
      return;
    }

    const fromName = nameDialog.fromName;
    if (name === fromName) {
      setNameDialog(null);
      return;
    }
    const conflict =
      (archiveNameSet.has(name) || mediaNameSet.has(name)) &&
      name.localeCompare(fromName, "ca", { sensitivity: "base" }) !== 0;
    if (conflict) {
      toast.error(`Ja existeix una carpeta anomenada «${name}».`);
      return;
    }
    setNameDialog(null);
    renameMutation.mutate({ fromName, toName: name });
  };

  const submitDeleteDialog = () => {
    if (!deleteDialog) return;
    const { name, force } = deleteDialog;
    deleteMutation.mutate(
      { name, force },
      {
        onSuccess: () => setDeleteDialog(null),
        onError: (err) => {
          if (!force && err instanceof ApiError && err.status === 409) {
            setDeleteDialog({ name, force: true });
            return;
          }
          if (!(err instanceof ApiError && err.status === 409)) {
            setDeleteDialog(null);
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

  // One observer for all cards: close open ⋯ menu when that card scrolls under sticky search.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || filteredFolders.length === 0) return;

    const searchEl = root.querySelector(".archive-hub-search");
    let topInset =
      searchEl instanceof HTMLElement ? searchEl.offsetHeight : 0;
    let observer: IntersectionObserver | null = null;

    const connect = () => {
      observer?.disconnect();
      observer = new IntersectionObserver(
        (entries) => {
          const open = menuFolderRef.current;
          if (!open) return;
          for (const entry of entries) {
            const name = (entry.target as HTMLElement).dataset.folderName;
            if (name === open && !entry.isIntersecting) {
              setMenuFolder(null);
              break;
            }
          }
        },
        {
          root,
          rootMargin: `-${topInset}px 0px 0px 0px`,
          threshold: 0,
        },
      );
      for (const el of root.querySelectorAll("[data-folder-name]")) {
        observer.observe(el);
      }
    };

    connect();

    const ro =
      searchEl instanceof HTMLElement
        ? new ResizeObserver(() => {
            const next = searchEl.offsetHeight;
            if (next === topInset) return;
            topInset = next;
            connect();
          })
        : null;
    if (searchEl instanceof HTMLElement) ro?.observe(searchEl);

    return () => {
      observer?.disconnect();
      ro?.disconnect();
    };
  }, [filteredFolders.length, isLoading]);

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
          {isLoading && <PanelLoading label="Carregant carpetes…" />}

          {!isLoading && folders.length === 0 && (
            <PanelEmptyActions title="No hi ha carpetes disponibles." />
          )}

          {!isLoading && folders.length > 0 && filteredFolders.length === 0 && (
            <PanelEmptyActions title="Cap carpeta coincideix amb la cerca." />
          )}

          {!isLoading && filteredFolders.length > 0 && (
            <div className="archive-hub-card-grid" role="list">
              {filteredFolders.map((folder) => (
                <ArchiveHubFolderCard
                  key={folder.name}
                  folder={folder}
                  menuOpen={menuFolder === folder.name}
                  busy={busy}
                  onOpen={() =>
                    navigate(documentsFolderPickPath(folder.name))
                  }
                  onToggleMenu={() =>
                    setMenuFolder((prev) =>
                      prev === folder.name ? null : folder.name,
                    )
                  }
                  onRename={() => openRenameDialog(folder.name)}
                  onDelete={() => openDeleteDialog(folder.name)}
                />
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
          onClick={openCreateDialog}
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
          Veure vídeos
        </button>
      </div>

      <AppDialog
        open={nameDialog != null}
        title={
          nameDialog?.mode === "rename"
            ? "Canviar el nom de la carpeta"
            : "Nova carpeta"
        }
        onClose={() => setNameDialog(null)}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setNameDialog(null)}
            >
              Cancel·lar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={submitNameDialog}
            >
              {nameDialog?.mode === "rename" ? "Desar" : "Crear"}
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="hub-folder-name">Nom</label>
          <input
            id="hub-folder-name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNameDialog();
              }
            }}
            autoComplete="off"
          />
        </div>
      </AppDialog>

      <AppDialog
        open={deleteDialog != null}
        title={
          deleteDialog?.force
            ? "Eliminar carpeta amb contingut?"
            : "Eliminar carpeta?"
        }
        onClose={() => setDeleteDialog(null)}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDeleteDialog(null)}
            >
              Cancel·lar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={submitDeleteDialog}
            >
              {deleteMutation.isPending
                ? "Eliminant…"
                : deleteDialog?.force
                  ? "Eliminar tot"
                  : "Eliminar"}
            </button>
          </>
        }
      >
        {deleteDialog?.force ? (
          <p>
            La carpeta «{deleteDialog.name}» no està buida. Voleu eliminar-la
            amb tot el contingut? Aquesta acció no es pot desfer fàcilment.
          </p>
        ) : (
          <p>
            Voleu eliminar la carpeta «{deleteDialog?.name}»? Només
            s&apos;eliminarà si està buida.
          </p>
        )}
      </AppDialog>
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
          {isLoading && <PanelLoading />}

          {!isLoading && options.length === 0 && (
            <PanelEmptyActions title="Aquesta carpeta no té contingut disponible." />
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
