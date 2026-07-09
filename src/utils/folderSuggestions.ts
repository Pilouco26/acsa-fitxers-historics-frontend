/** True when the value is a single archive folder name, not a filesystem path. */
export function isRelativeArchiveFolderName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return false;
  if (trimmed.includes("\\")) return false;
  if (trimmed.includes("/")) return false;
  return true;
}

export function buildArchiveFolderSuggestions({
  archiveFolderNames = [],
  documentFolderNames = [],
  currentFolder = "",
}: {
  archiveFolderNames?: string[];
  documentFolderNames?: string[];
  currentFolder?: string;
}): string[] {
  const names = new Set<string>();

  for (const folder of archiveFolderNames) {
    if (isRelativeArchiveFolderName(folder)) names.add(folder.trim());
  }
  for (const folder of documentFolderNames) {
    if (isRelativeArchiveFolderName(folder)) names.add(folder.trim());
  }

  const current = currentFolder.trim();
  if (isRelativeArchiveFolderName(current)) names.add(current);

  return [...names].sort((a, b) => a.localeCompare(b, "ca"));
}
