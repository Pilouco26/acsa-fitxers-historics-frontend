import type { DocumentOrderBy, DocumentOrderDir, DocumentOut } from "@/api/types";

export function sortDocuments(
  docs: DocumentOut[],
  orderBy: DocumentOrderBy | null,
  orderDir: DocumentOrderDir,
): DocumentOut[] {
  if (!orderBy) return docs;

  const dir = orderDir === "asc" ? 1 : -1;
  return [...docs].sort((a, b) => {
    const left = (a[orderBy] ?? "") as string;
    const right = (b[orderBy] ?? "") as string;
    return left.localeCompare(right, "ca", { sensitivity: "base" }) * dir;
  });
}
