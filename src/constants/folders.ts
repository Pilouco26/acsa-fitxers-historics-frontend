/** Values for `GET /folders?root=`. */
export const FOLDER_ROOT_ARCHIVE = "archive" as const;
export const FOLDER_ROOT_MEDIA = "media" as const;

/** Inbox / quarantine folder — hidden from the Classificats hub. */
export const FOLDER_INBOX = "_PENDENTS" as const;

export function isHiddenHubFolder(name: string): boolean {
  return name.trim() === FOLDER_INBOX;
}

/**
 * Flat hub folder name suitable for create/rename (no path separators, not reserved).
 * Matches backend validation expected by folder CRUD APIs.
 */
export function isValidExplorerFolderName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed === FOLDER_INBOX) return false;
  if (trimmed === "." || trimmed === "..") return false;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return false;
  if (trimmed.includes("\\") || trimmed.includes("/")) return false;
  return true;
}

export function documentsListPath(folder?: string | null): string {
  const name = folder?.trim();
  if (!name) return "/documents/list";
  return `/documents/list?folder=${encodeURIComponent(name)}`;
}

/** Hub step: choose Documents / Fotos / Vídeo for a folder. */
export function documentsFolderPickPath(folder: string): string {
  return `/documents/folder?name=${encodeURIComponent(folder.trim())}`;
}

export function mediaCatalogPath(
  kind: "picture" | "video",
  folder?: string | null,
  options?: { fromDocuments?: boolean },
): string {
  const params = new URLSearchParams();
  params.set("kind", kind);
  const name = folder?.trim();
  if (name) params.set("folder", name);
  if (options?.fromDocuments) params.set("from", "documents");
  return `/media/catalog?${params}`;
}
