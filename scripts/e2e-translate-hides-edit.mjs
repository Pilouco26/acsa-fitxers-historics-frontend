/**
 * Verifies Editar document unmounts when opening Traduir,
 * the same way the list table unmounts when opening a document.
 *
 * Usage: node scripts/e2e-translate-hides-edit.mjs
 * Requires: npm run dev (default http://localhost:5173)
 *
 * Prefer E2E_LIVE=1 when the backend is up. Mocked mode only intercepts
 * HTTP paths under /api/ (not Vite modules like /src/api/).
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const LIVE = process.env.E2E_LIVE === "1";

const mockDoc = {
  id: 42,
  status: "ok",
  original_name: "1984.08.03 - A. OGIER.pdf",
  proposed_name: "1984.08.03 - A. OGIER.pdf",
  company: "A. OGIER",
  company_folder: "A.OGIER",
  folder: "A.OGIER",
  target_folder: null,
  summary: "Resum de prova",
  language: "fr",
  translated_text: "Text traduït de prova.",
  final_date: "1984.08.03",
  doc_type: "letter",
  doc_type_ca: "Carta",
  overall_conf: null,
  error: null,
  sender: null,
  recipient: null,
  processed_at: null,
  duplicate_path: null,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isBackendApi(url) {
  try {
    const { pathname } = new URL(url);
    return pathname === "/api" || pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function isDocumentsListUrl(url) {
  try {
    const { pathname } = new URL(url);
    return pathname === "/api/documents" || pathname === "/api/documents/";
  } catch {
    return false;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  if (!LIVE) {
    await page.route("**/*", async (route) => {
      const req = route.request();
      const url = req.url();

      if (!isBackendApi(url)) {
        await route.continue();
        return;
      }

      const method = req.method();

      if (method === "GET" && isDocumentsListUrl(url)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "ok",
            data: { items: [mockDoc], total: 1 },
          }),
        });
        return;
      }

      if (url.includes("/api/documents/file")) {
        await route.fulfill({
          status: 200,
          contentType: "application/pdf",
          body: Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
        });
        return;
      }

      if (url.includes("/api/folders")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "ok", data: { items: [] } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", data: {} }),
      });
    });
  }

  await page.goto(`${BASE}/documents`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Documents", exact: true }).waitFor({
    state: "visible",
    timeout: 20000,
  });

  const editBefore = await page.getByRole("heading", { name: "Editar document" }).count();
  assert(editBefore === 0, `Expected Editar hidden in list mode, found ${editBefore}`);

  const docCell = LIVE
    ? page.locator(".data-table--list tbody tr:not([aria-hidden='true']) td").first()
    : page.getByText(mockDoc.proposed_name, { exact: false }).first();

  await docCell.waitFor({ state: "visible", timeout: 20000 });

  await docCell.click();
  await page.getByRole("heading", { name: "Editar document" }).waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.getByRole("heading", { name: "Vista prèvia" }).waitFor({ state: "visible" });

  const listDuringDetail = await page.locator(".data-table--list").count();
  assert(
    listDuringDetail === 0,
    `Expected list table unmounted after document open, found ${listDuringDetail}`,
  );

  await page.getByRole("button", { name: "Traduir", exact: true }).click();
  await page.getByRole("heading", { name: "Traducció" }).waitFor({
    state: "visible",
    timeout: 10000,
  });

  const editDuring = await page.getByRole("heading", { name: "Editar document" }).count();
  assert(
    editDuring === 0,
    `Expected Editar unmounted while Traduir open, found ${editDuring}`,
  );

  const previewVisible = await page.locator(".split-detail-preview").isVisible();
  assert(previewVisible, "Expected preview to stay visible during Traduir");

  await page.locator(".split-detail-translate").getByRole("button", { name: /Tancar/ }).click();
  await page.getByRole("heading", { name: "Editar document" }).waitFor({
    state: "visible",
    timeout: 10000,
  });

  console.log("OK: Editar hides on Traduir like the table hides on document open");
  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});