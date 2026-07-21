/**
 * Verify the archive hub folder grid fills the available width (no large right gap).
 * Usage: node scripts/test-archive-hub-grid.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.APP_URL ?? "http://localhost:5173";

function envelope(data) {
  return { status: "success", message: "ok", data };
}

function folderItems(names) {
  return names.map((name, index) => ({
    index,
    name,
    relative_path: name,
  }));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  await page.addInitScript(() => {
    localStorage.setItem("acsa_access_token", "playwright-test-token");
  });

  const folderNames = Array.from({ length: 24 }, (_, i) => `Folder ${String(i + 1).padStart(2, "0")}`);

  await page.route(
    (url) => new URL(url).pathname.startsWith("/api/"),
    async (route) => {
      const url = new URL(route.request().url());

      if (url.pathname === "/api/folders") {
        const root = url.searchParams.get("root") ?? "archive";
        const names = root === "media" ? folderNames.slice(0, 8) : folderNames;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            envelope({
              items: folderItems(names),
              total: names.length,
            }),
          ),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope({ items: [], total: 0 })),
      });
    },
  );

  await page.goto(`${BASE}/documents`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".archive-hub-card-grid .archive-hub-card", {
    timeout: 15000,
  });

  const metrics = await page.evaluate(() => {
    const scroll = document.querySelector(".archive-hub-scroll");
    const grid = document.querySelector(".archive-hub-card-grid");
    const header = document.querySelector(".page-header h2");
    const main = document.querySelector(".main-content");
    if (!scroll || !grid || !header || !main) return null;

    const scrollRect = scroll.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const mainStyle = getComputedStyle(main);
    const expectedHeaderLeft =
      mainRect.left + Number.parseFloat(mainStyle.paddingLeft || "0");
    const cards = [...grid.querySelectorAll(".archive-hub-card")];
    if (cards.length === 0) return null;

    const firstTop = cards[0].getBoundingClientRect().top;
    const firstRow = cards.filter(
      (card) => Math.abs(card.getBoundingClientRect().top - firstTop) < 2,
    );
    const rightmostCardRight = Math.max(
      ...firstRow.map((card) => card.getBoundingClientRect().right),
    );

    const leftmostCardLeft = Math.min(
      ...firstRow.map((card) => card.getBoundingClientRect().left),
    );

    const viewportRight = window.innerWidth;

    return {
      columnCount: firstRow.length,
      viewportRight,
      scrollRight: scrollRect.right,
      gridRight: gridRect.right,
      rightmostCardRight,
      leftmostCardLeft,
      scrollToGridGap: scrollRect.right - gridRect.right,
      gridToCardGap: gridRect.right - rightmostCardRight,
      headerLeft: headerRect.left,
      expectedHeaderLeft,
      headerInset: headerRect.left - expectedHeaderLeft,
      gridAlignInset: leftmostCardLeft - headerRect.left,
    };
  });

  await browser.close();

  if (!metrics) {
    console.error("FAIL: could not measure archive hub grid layout");
    process.exit(1);
  }

  console.log("Layout metrics:", { ...metrics, scrollToCardGap: metrics.scrollRight - metrics.rightmostCardRight });

  const failures = [];
  if (metrics.columnCount < 5) {
    failures.push(`expected at least 5 columns at 1920px, got ${metrics.columnCount}`);
  }
  if (metrics.scrollToGridGap > 24) {
    failures.push(
      `scroll-to-grid gap too large: ${metrics.scrollToGridGap.toFixed(1)}px (max 24px)`,
    );
  }
  if (metrics.gridToCardGap > 2) {
    failures.push(
      `grid-to-card gap too large: ${metrics.gridToCardGap.toFixed(1)}px (max 2px)`,
    );
  }
  if (Math.abs(metrics.headerInset) > 2) {
    failures.push(
      `page header misaligned: inset ${metrics.headerInset.toFixed(1)}px (expected ~0px)`,
    );
  }
  if (Math.abs(metrics.gridAlignInset) > 2) {
    failures.push(
      `grid not aligned with header: offset ${metrics.gridAlignInset.toFixed(1)}px (expected ~0px)`,
    );
  }
  const scrollToCardGap = metrics.scrollRight - metrics.rightmostCardRight;
  const scrollToViewportGap = metrics.viewportRight - metrics.scrollRight;
  if (scrollToViewportGap > 4) {
    failures.push(
      `scrollbar not at viewport edge: ${scrollToViewportGap.toFixed(1)}px gap (max 4px)`,
    );
  }
  if (scrollToCardGap > 48) {
    failures.push(
      `scroll-to-card gap too large: ${scrollToCardGap.toFixed(1)}px (max 40px)`,
    );
  }

  if (failures.length > 0) {
    console.error("FAIL:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log("PASS: archive hub grid fills the row without a large right gap.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
