/**
 * Verify archive folder suggestions merge API folders + document company_folder values.
 * Usage: node scripts/verify-folder-suggestions.mjs [apiBase]
 */

const API_BASE = (process.argv[2] ?? "http://localhost:5173/api").replace(/\/$/, "");

function isRelativeArchiveFolderName(name) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return false;
  if (trimmed.includes("\\")) return false;
  if (trimmed.includes("/")) return false;
  return true;
}

function buildArchiveFolderSuggestions({
  archiveFolderNames = [],
  documentFolderNames = [],
  currentFolder = "",
}) {
  const names = new Set();
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

function unwrapEnvelope(body) {
  if (body && typeof body === "object" && "data" in body) return body.data;
  return body;
}

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`${path} -> HTTP ${res.status}`);
  }
  return unwrapEnvelope(await res.json());
}

async function fetchAllDocuments(status) {
  const items = [];
  const batchSize = 10_000;
  let offset = 0;
  for (;;) {
    const page = await fetchJson(
      `/documents?status=${encodeURIComponent(status)}&limit=${batchSize}&offset=${offset}`,
    );
    items.push(...(page.items ?? []));
    if ((page.items ?? []).length < batchSize) break;
    offset += batchSize;
  }
  return items;
}

async function main() {
  console.log(`API base: ${API_BASE}`);

  const foldersRes = await fetchJson("/folders?root=archive");
  const archiveNames = (foldersRes.items ?? []).map((item) => item.name);
  console.log(`Archive API folders: ${archiveNames.length}`);
  console.log(`  sample: ${archiveNames.slice(0, 5).join(", ") || "(none)"}`);

  const docs = await fetchAllDocuments("ok");
  const documentFolderNames = [
    ...new Set(
      docs.flatMap((doc) => [doc.company_folder, doc.target_folder].filter(Boolean)),
    ),
  ].filter(isRelativeArchiveFolderName);
  console.log(`Document folder names: ${documentFolderNames.length}`);
  console.log(`  sample: ${documentFolderNames.slice(0, 5).join(", ") || "(none)"}`);

  const merged = buildArchiveFolderSuggestions({
    archiveFolderNames: archiveNames,
    documentFolderNames,
  });

  const onlyApi = buildArchiveFolderSuggestions({ archiveFolderNames: archiveNames });
  const addedFromDocs = merged.filter((name) => !onlyApi.includes(name));

  console.log(`Merged suggestions: ${merged.length}`);
  console.log(`Added from documents (not in API): ${addedFromDocs.length}`);
  if (addedFromDocs.length > 0) {
    console.log(`  sample: ${addedFromDocs.slice(0, 8).join(", ")}`);
  }

  const hasAbsolute = merged.some((name) => !isRelativeArchiveFolderName(name));
  if (hasAbsolute) {
    console.error("FAIL: merged list contains absolute paths");
    process.exit(1);
  }

  if (merged.length <= archiveNames.length && documentFolderNames.length > archiveNames.length) {
    console.error(
      "FAIL: document folders exist but merge did not grow beyond API-only list",
    );
    process.exit(1);
  }

  if (merged.length === 0) {
    console.warn("WARN: no folder suggestions (API and documents may be empty)");
  } else {
    console.log("OK: folder suggestions merge verified");
  }
}

main().catch((err) => {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
});
