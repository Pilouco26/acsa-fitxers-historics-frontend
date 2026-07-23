/**
 * Visual / UX checks for Revisió empty states, media list title, and archive hub.
 * Usage: node scripts/verify-revisio-empty-hub.mjs
 * Requires Vite at APP_URL (default http://localhost:5173).
 */
import { chromium } from "playwright";

const BASE = process.env.APP_URL ?? "http://localhost:5173";

function envelope(data) {
  return { status: "success", message: "ok", data };
}

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

function makePicture(id) {
  return {
    id,
    kind: "picture",
    status: "revisio",
    name: `pic-${id}.jpg`,
    original_name: `pic-${id}.jpg`,
    proposed_name: `Foto ${id}`,
    date: "2024-01-01",
    overall_conf: "alta",
    summary: "Escena de prova",
    location_guess: "Barcelona",
    folder: "_PENDENTS",
    company_folder: null,
    relative_path: `media/pic-${id}.jpg`,
    error: null,
  };
}

function folderItems(names) {
  return names.map((name, index) => ({
    index,
    name,
    relative_path: name,
  }));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.addInitScript(() => {
    localStorage.setItem("acsa_access_token", "playwright-test-token");
  });

  /** @type {"docsEmpty" | "docsSearchMiss" | "docsWithHits" | "mediaEmpty" | "mediaWithItems"} */
  let revisioMode = "docsEmpty";
  const folderNames = Array.from(
    { length: 16 },
    (_, i) => `Carpeta ${String(i + 1).padStart(2, "0")}`,
  );

  await page.route(
    (url) => new URL(url).pathname.startsWith("/api/"),
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;

      if (path === "/api/folders") {
        const root = url.searchParams.get("root") ?? "archive";
        const names = root === "media" ? folderNames.slice(0, 6) : folderNames;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            envelope({ items: folderItems(names), total: names.length }),
          ),
        });
        return;
      }

      if (path === "/api/documents") {
        const q = (url.searchParams.get("q") ?? "").trim();
        if (revisioMode === "docsSearchMiss" || (q && revisioMode !== "docsWithHits")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(envelope({ items: [], total: 0 })),
          });
          return;
        }
        if (revisioMode === "docsEmpty") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(envelope({ items: [], total: 0 })),
          });
          return;
        }
        const items = [makeDoc(1), makeDoc(2)];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(envelope({ items, total: items.length })),
        });
        return;
      }

      if (path === "/api/pictures") {
        if (revisioMode === "mediaWithItems") {
          const items = [makePicture(1), makePicture(2)];
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(envelope({ items, total: 5 })),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(envelope({ items: [], total: 0 })),
        });
        return;
      }

      if (path === "/api/videos") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(envelope({ items: [], total: 0 })),
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

  // --- Revisió: true empty inbox ---
  revisioMode = "docsEmpty";
  await page.goto(`${BASE}/revisio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".empty-state--actions", { timeout: 15000 });

  const emptyInbox = await page.evaluate(() => {
    const card = document.querySelector(".card-panel");
    const empty = document.querySelector(".empty-state--actions");
    const search = document.querySelector(
      '.toolbar-row input[type="search"]',
    );
    const title = empty?.querySelector(".empty-state__title")?.textContent?.trim();
    if (!card || !empty || !search) return null;
    const cardRect = card.getBoundingClientRect();
    const emptyRect = empty.getBoundingClientRect();
    const midCard = cardRect.top + cardRect.height / 2;
    const midEmpty = emptyRect.top + emptyRect.height / 2;
    return {
      title,
      searchVisible: search.getBoundingClientRect().height > 0,
      verticalCenterDelta: Math.abs(midCard - midEmpty),
      hasContinuar: Boolean(
        [...document.querySelectorAll("button")].some((b) =>
          b.textContent?.includes("Continuar a classificats"),
        ),
      ),
    };
  });

  assert(emptyInbox, "FAIL: empty inbox metrics missing");
  assert(
    emptyInbox.title?.includes("No hi ha documents pendents de revisió"),
    `FAIL: unexpected empty title: ${emptyInbox.title}`,
  );
  assert(emptyInbox.searchVisible, "FAIL: search should stay visible on empty inbox");
  assert(emptyInbox.hasContinuar, "FAIL: Continuar CTA missing on empty inbox");
  assert(
    emptyInbox.verticalCenterDelta < 80,
    `FAIL: empty state not roughly centered (delta=${emptyInbox.verticalCenterDelta})`,
  );
  const emptyHasActualitzar = await page.evaluate(() => {
    const empty = document.querySelector(".empty-state--actions");
    return [...(empty?.querySelectorAll("button") ?? [])].some((b) =>
      b.textContent?.includes("Actualitzar"),
    );
  });
  assert(!emptyHasActualitzar, "FAIL: empty inbox should not show Actualitzar");
  console.log("OK Revisió empty inbox", emptyInbox);

  // --- Revisió: search with no matches ---
  revisioMode = "docsSearchMiss";
  await page.fill('.toolbar-row input[type="search"]', "zzz-no-match");
  await page.waitForFunction(
    () =>
      document
        .querySelector(".empty-state__title")
        ?.textContent?.includes("Cap document no coincideix"),
    { timeout: 5000 },
  );

  const noMatch = await page.evaluate(() => {
    const search = document.querySelector(
      '.toolbar-row input[type="search"]',
    );
    const title = document
      .querySelector(".empty-state__title")
      ?.textContent?.trim();
    const clearBtn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Netejar cerca"),
    );
    const continuar = [...document.querySelectorAll("button")].some((b) =>
      b.textContent?.includes("Continuar a classificats"),
    );
    return {
      title,
      searchValue: search?.value ?? "",
      hasClear: Boolean(clearBtn),
      hasContinuar: continuar,
    };
  });

  assert(
    noMatch.title?.includes("Cap document no coincideix"),
    `FAIL: no-match copy wrong: ${noMatch.title}`,
  );
  assert(noMatch.searchValue.includes("zzz-no-match"), "FAIL: search value lost");
  assert(noMatch.hasClear, "FAIL: Netejar cerca missing");
  assert(!noMatch.hasContinuar, "FAIL: Continuar should not show on search miss");
  console.log("OK Revisió search miss", noMatch);

  await page.getByRole("button", { name: "Netejar cerca" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.toolbar-row input[type="search"]')?.value === "",
  );

  // --- Revisió media: empty + with items / total ---
  revisioMode = "mediaEmpty";
  await page.getByRole("button", { name: "Fotos / vídeos" }).click();
  await page.waitForSelector(".empty-state--actions .empty-state__title", {
    timeout: 10000,
  });

  const mediaEmptyTitle = await page
    .locator(".empty-state__title")
    .textContent();
  assert(
    mediaEmptyTitle?.includes("No hi ha fotos ni vídeos"),
    `FAIL: media empty title: ${mediaEmptyTitle}`,
  );
  console.log("OK Revisió media empty");

  revisioMode = "mediaWithItems";
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Fotos / vídeos" }).click();
  await page.waitForSelector(".data-table tbody tr", { timeout: 15000 });

  const mediaTitle = await page.locator(".card-title").first().textContent();
  assert(
    mediaTitle?.includes("Pendents de revisió (5)"),
    `FAIL: media title should include total 5, got: ${mediaTitle}`,
  );
  const truncation = await page.locator(".scan-hint").first().textContent();
  assert(
    truncation?.includes("Mostrant els primers 2 de 5"),
    `FAIL: truncation hint missing: ${truncation}`,
  );
  console.log("OK Revisió media list title + truncation", {
    mediaTitle,
    truncation,
  });

  // --- Archive hub ---
  await page.goto(`${BASE}/documents`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".archive-hub-card-grid .archive-hub-card", {
    timeout: 15000,
  });

  const hub = await page.evaluate(() => {
    const badges = document.querySelectorAll(".archive-hub-badge").length;
    const videosBtn = [...document.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Veure vídeos"),
    );
    const search = document.querySelector(".archive-hub-search");
    const scroll = document.querySelector(".archive-hub-scroll");
    const cards = [...document.querySelectorAll(".archive-hub-card-wrap")];
    const menuTriggers = document.querySelectorAll(
      ".archive-hub-card-menu-trigger",
    ).length;
    if (!search || !scroll || cards.length === 0) return null;

    scroll.scrollTop = scroll.scrollHeight;
    void scroll.offsetHeight;

    return {
      badges,
      hasVeureVideos: Boolean(videosBtn),
      videosLabel: videosBtn?.textContent?.trim() ?? "",
      menuTriggers,
      cardCount: cards.length,
      novaCarpeta: Boolean(
        [...document.querySelectorAll("button")].find((b) =>
          b.textContent?.includes("Nova carpeta"),
        ),
      ),
    };
  });

  assert(hub, "FAIL: hub metrics missing");
  assert(hub.badges === 0, `FAIL: hub grid should have no badges, got ${hub.badges}`);
  assert(hub.hasVeureVideos, "FAIL: Veure vídeos button missing");
  assert(
    hub.videosLabel.includes("vídeos"),
    `FAIL: accent missing on videos button: ${hub.videosLabel}`,
  );
  assert(
    hub.menuTriggers === hub.cardCount,
    `FAIL: every card should keep ⋯ visible (${hub.menuTriggers}/${hub.cardCount})`,
  );
  assert(hub.novaCarpeta, "FAIL: Nova carpeta action missing");
  console.log("OK Archive hub", hub);

  // Nova carpeta opens accessible dialog (not window.prompt)
  await page.getByRole("button", { name: "Nova carpeta" }).click();
  await page.waitForSelector(".app-dialog", { timeout: 5000 });
  const dialogTitle = await page.locator(".app-dialog-title").textContent();
  assert(
    dialogTitle?.includes("Nova carpeta"),
    `FAIL: create dialog title: ${dialogTitle}`,
  );
  await page.getByRole("button", { name: "Cancel·lar" }).click();
  await page.waitForSelector(".app-dialog", { state: "detached", timeout: 5000 });
  console.log("OK Archive hub create dialog");

  await browser.close();
  console.log("All visual checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
