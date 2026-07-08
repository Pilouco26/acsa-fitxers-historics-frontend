import { listDocuments } from "@/api/client";
import type { DocumentOut } from "@/api/types";

const BATCH_SIZE = 10_000;

/** Load every document for a status by paging through the API. */
export async function fetchAllDocuments(status: string): Promise<DocumentOut[]> {
  const items: DocumentOut[] = [];
  let offset = 0;

  for (;;) {
    const res = await listDocuments({ status, limit: BATCH_SIZE, offset });
    items.push(...res.items);
    if (res.items.length < BATCH_SIZE) return items;
    offset += BATCH_SIZE;
  }
}
