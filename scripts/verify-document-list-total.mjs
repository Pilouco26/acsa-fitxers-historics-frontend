/**
 * Verifies filtered document count against the live API.
 * Run: node scripts/verify-document-list-total.mjs
 */

const BASE = process.env.API_URL ?? "http://localhost:8000/api";

async function listDocuments(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") qs.set(key, String(value));
  }
  const res = await fetch(`${BASE}/documents?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body.data ?? body;
}

async function fetchFilteredCount(filters) {
  const BATCH = 10_000;
  let offset = 0;
  let count = 0;
  for (;;) {
    const res = await listDocuments({ ...filters, limit: BATCH, offset });
    count += res.items.length;
    if (res.items.length < BATCH) return count;
    offset += BATCH;
  }
}

function estimateFilteredTotal(itemsLength, page, pageSize) {
  if (itemsLength < pageSize) return page * pageSize + itemsLength;
  return null;
}

async function check(label, params, pageSize = 17) {
  const pageRes = await listDocuments({ ...params, limit: pageSize, offset: 0 });
  const estimated = estimateFilteredTotal(pageRes.items.length, 0, pageSize);
  const counted =
    estimated ??
    (await fetchFilteredCount({
      status: params.status,
      q: params.q,
      proposed_name: params.proposed_name,
      company_folder: params.company_folder,
      folder: params.folder,
    }));
  const pages = Math.max(1, Math.ceil(counted / pageSize));

  console.log(`\n${label}`);
  console.log(`  API total (wrong when filtered): ${pageRes.total}`);
  console.log(`  Page items: ${pageRes.items.length}`);
  console.log(`  Resolved total: ${counted}`);
  console.log(`  Resolved pages: ${pages}`);
}

async function main() {
  await check("JAIME search", { status: "ok", q: "JAIME" });
  await check("No filters", { status: "ok" });
  await check("Broad search q=A", { status: "ok", q: "A" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
