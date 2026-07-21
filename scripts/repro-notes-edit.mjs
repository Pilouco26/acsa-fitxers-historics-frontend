/**
 * Verify post-it title + body stay editable (no blur exit / hidden caret).
 * Usage: node scripts/repro-notes-edit.mjs
 *
 * Mocks authenticated /api/notes so the UI can run without a live backend.
 */
import { chromium } from "playwright";

const BASE = process.env.APP_URL ?? "http://localhost:5173";

const sampleNote = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Titol prova",
  body: "Cos inicial",
  color: "yellow",
  x: 80,
  y: 60,
  width: 240,
  height: 200,
  z_index: 1,
  rotation: -1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function envelope(data) {
  return { status: "success", message: "ok", data };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.addInitScript(() => {
    localStorage.setItem("acsa_access_token", "playwright-test-token");
  });

  await page.route("**/api/notes**", async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());

    if (method === "GET" && !url.searchParams.get("id")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope({ items: [sampleNote], total: 1 })),
      });
      return;
    }

    if (method === "PATCH" || method === "POST") {
      let patch = {};
      try {
        patch = req.postDataJSON() ?? {};
      } catch {
        /* empty body */
      }
      const updated = {
        ...sampleNote,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      Object.assign(sampleNote, updated);
      await route.fulfill({
        status: method === "POST" && url.pathname.endsWith("/notes") ? 201 : 200,
        contentType: "application/json",
        body: JSON.stringify(envelope(updated)),
      });
      return;
    }

    if (method === "DELETE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope(null)),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(sampleNote)),
    });
  });

  await page.goto(`${BASE}/notes`, { waitUntil: "networkidle" });
  await page.waitForSelector(".post-it", { timeout: 15000 });

  await page.locator('.post-it-icon-btn[aria-label="Editar nota"]').first().click();
  await page.waitForSelector(".post-it-title-input");
  await page.waitForSelector(".post-it-body-input");

  const titleStyles = await page.locator(".post-it-title-input").first().evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      caretColor: style.caretColor,
      userSelect: style.userSelect,
      cursor: style.cursor,
    };
  });

  await page.locator(".post-it-body-input").first().click();
  await page.waitForTimeout(80);

  const afterBodyClick = {
    titleVisible: await page.locator(".post-it-title-input").count(),
    bodyVisible: await page.locator(".post-it-body-input").count(),
    editingClass: await page.locator(".post-it--editing").count(),
    activeClass: await page.evaluate(
      () => document.activeElement?.className ?? null,
    ),
  };

  let typed = null;
  if (afterBodyClick.bodyVisible > 0) {
    await page.locator(".post-it-body-input").first().fill("Text del cos editat");
    typed = await page.locator(".post-it-body-input").first().inputValue();
  }

  // Click outside to commit, then reopen and check persistence path doesn't break
  await page.locator(".notes-board").click({ position: { x: 500, y: 400 } });
  await page.waitForTimeout(120);
  const bodyAfterCommit = await page.locator(".post-it-body").first().innerText();

  console.log(
    JSON.stringify({ titleStyles, afterBodyClick, typed, bodyAfterCommit }, null, 2),
  );

  await browser.close();

  if (afterBodyClick.bodyVisible === 0 || afterBodyClick.editingClass === 0) {
    console.error("FAIL: body editor closed when focusing description");
    process.exit(2);
  }
  if (typed !== "Text del cos editat") {
    console.error("FAIL: could not type in body");
    process.exit(3);
  }
  if (!String(titleStyles.userSelect).includes("text")) {
    console.error("FAIL: user-select not text on title input", titleStyles);
    process.exit(4);
  }
  if (bodyAfterCommit !== "Text del cos editat") {
    console.error("FAIL: body not committed", bodyAfterCommit);
    process.exit(5);
  }
  console.log("OK: title+body editable, caret styles ok, body commits");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
