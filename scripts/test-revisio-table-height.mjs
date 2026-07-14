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
    const tbodyRows = [...document.querySelectorAll(".table-list-body tbody tr")];
    const theadRow = document.querySelector(".table-list-body thead tr");
    const overlay = document.querySelector(".table-list-overlay");
    const pagination = document.querySelector(".table-pagination");
    const last = tbodyRows[tbodyRows.length - 1]?.getBoundingClientRect();
    const areaRect = tableArea?.getBoundingClientRect();
    const rowHeights = tbodyRows.map((r) => +r.getBoundingClientRect().height.toFixed(2));
    const firstH = rowHeights[0] ?? 0;
    const maxDelta = Math.max(...rowHeights.map((h) => Math.abs(h - firstH)), 0);
    const theadH = theadRow?.getBoundingClientRect().height ?? 0;
    const areaH = Math.round(areaRect?.height ?? 0);
    const rowH = Math.round(firstH);

    return {
      tableAreaHeight: areaRect?.height ?? 0,
      rowCount: tbodyRows.length,
      rowHeights,
      theadHeight: theadH,
      maxRowHeightDelta: maxDelta,
      heightModRow: rowH > 0 ? areaH % rowH : -1,
      gapLastRowToArea: areaRect && last ? areaRect.bottom - last.bottom : null,
      overflowY: tableArea
        ? tableArea.scrollHeight - tableArea.clientHeight
        : null,
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
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  let currentMode = "full";

  await page.route("**/api/documents**", async (route) => {
    const url = new URL(route.request().url());
    if (currentMode === "full") {
      const limit = Number(url.searchParams.get("limit") || 12);
      const offset = Number(url.searchParams.get("offset") || 0);
      const total = 40;
      const items = Array.from(
        { length: Math.min(limit, Math.max(0, total - offset)) },
        (_, i) => makeDoc(offset + i + 1),
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDocuments(items, total)),
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

  if (Math.abs(withData.gapLastRowToArea ?? 99) > 1.5) {
    throw new Error(
      `Bottom gap too large with data: ${withData.gapLastRowToArea}px`,
    );
  }

  if ((withData.overflowY ?? 99) > 1.5) {
    throw new Error(`Table overflow too large with data: ${withData.overflowY}px`);
  }

  if ((withData.maxRowHeightDelta ?? 99) > 0.5) {
    throw new Error(
      `Uneven row heights: delta=${withData.maxRowHeightDelta}, heights=${JSON.stringify(withData.rowHeights)}`,
    );
  }

  if (withData.heightModRow !== 0) {
    throw new Error(
      `tableHeight % rowHeight !== 0 (mod=${withData.heightModRow}, area=${withData.tableAreaHeight}, row=${withData.rowHeights?.[0]})`,
    );
  }

  if (Math.abs((withData.theadHeight ?? 0) - (withData.rowHeights?.[0] ?? -1)) > 0.5) {
    throw new Error(
      `Header height differs from body rows: thead=${withData.theadHeight}, body=${withData.rowHeights?.[0]}`,
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
