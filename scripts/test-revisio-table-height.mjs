import { chromium } from "playwright";

const BASE_URL = "http://localhost:5173";

function makeDoc(id) {
  return {
    id,
    status: "revisio",
    proposed_name: `Document ${id}`,
    original_name: `original-${id}.pdf`,
    company: "ACSA",
    company_folder: null,
    doc_type: null,
    doc_type_ca: "Factura",
    final_date: "2024.01.01",
    overall_conf: null,
    summary: "Resum de prova",
    error: null,
    folder: null,
    target_folder: null,
    language: "ca",
    sender: null,
    recipient: null,
    processed_at: null,
  };
}

function mockDocuments(items, total) {
  return {
    status: "ok",
    data: { items, total },
  };
}

async function readTableMetrics(page) {
  return page.evaluate(() => {
    const tableArea = document.querySelector(".table-list-body");
    const tbodyRows = document.querySelectorAll(".table-list-body tbody tr");
    const overlay = document.querySelector(".table-list-overlay");
    const pagination = document.querySelector(".table-pagination");

    return {
      tableAreaHeight: tableArea?.getBoundingClientRect().height ?? 0,
      rowCount: tbodyRows.length,
      hasOverlay: Boolean(overlay),
      overlayText: overlay?.textContent?.trim() ?? "",
      hasPagination: Boolean(pagination),
      paginationText: pagination?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    };
  });
}

async function waitForStableTable(page) {
  await page.waitForSelector(".table-list-body tbody tr");
  let stable = 0;
  let last = -1;
  while (stable < 4) {
    await page.waitForTimeout(150);
    const height = await page.locator(".table-list-body").evaluate((el) =>
      el.getBoundingClientRect().height,
    );
    if (Math.abs(height - last) < 0.5) {
      stable += 1;
    } else {
      stable = 0;
    }
    last = height;
  }
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  let currentMode = "full";

  await page.route("**/api/documents**", async (route) => {
    if (currentMode === "full") {
      const items = Array.from({ length: 12 }, (_, i) => makeDoc(i + 1));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDocuments(items, items.length)),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDocuments([], 0)),
    });
  });

  await page.goto(`${BASE_URL}/revisio`);
  await waitForStableTable(page);

  const withData = await readTableMetrics(page);
  console.log("With data:", withData);

  currentMode = "empty";
  await page.getByRole("button", { name: "Actualitzar" }).click();
  await page.waitForSelector(".table-list-overlay");
  await waitForStableTable(page);

  const empty = await readTableMetrics(page);
  console.log("Empty:", empty);

  await browser.close();

  const heightDelta = Math.abs(withData.tableAreaHeight - empty.tableAreaHeight);
  const rowCountOk = withData.rowCount === empty.rowCount;
  const overlayOk =
    empty.hasOverlay &&
    empty.overlayText.includes("No hi ha documents pendents de revisió");
  const paginationOk = empty.hasPagination && empty.paginationText.includes("0–0 de 0");

  if (!rowCountOk) {
    throw new Error(
      `Row count changed: with data=${withData.rowCount}, empty=${empty.rowCount}`,
    );
  }

  if (heightDelta > 1) {
    throw new Error(
      `Table area height changed by ${heightDelta}px: with data=${withData.tableAreaHeight}, empty=${empty.tableAreaHeight}`,
    );
  }

  if (!overlayOk) {
    throw new Error("Empty overlay message missing or incorrect");
  }

  if (!paginationOk) {
    throw new Error("Pagination bar missing for empty results");
  }

  console.log("PASS: Revisio table height stays constant with and without results.");
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
