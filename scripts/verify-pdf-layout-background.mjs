/**
 * Verify translation background hides original typing while keeping branding.
 *
 * Usage:
 *   E2E_LIVE=1 node scripts/verify-pdf-layout-background.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const DOC_ID = Number(process.env.E2E_DOC_ID ?? "11");
const LIVE = process.env.E2E_LIVE === "1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "scripts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceContractCheck() {
  const helpers = readFileSync(
    path.join(root, "src/utils/ocrTranslateHelpers.ts"),
    "utf8",
  );
  assert(helpers.includes("scrubInkKeepBranding"), "ink scrub missing");
  assert(helpers.includes("coverLines"), "raw OCR cover missing");
  console.log("Source contract OK");
}

async function main() {
  sourceContractCheck();
  mkdirSync(outDir, { recursive: true });
  if (!LIVE) {
    console.warn("Set E2E_LIVE=1 to exercise /documents/" + DOC_ID);
    return;
  }

  const channel = process.env.E2E_BROWSER_CHANNEL || "chrome";
  let browser;
  try {
    browser = await chromium.launch({
      headless: process.env.E2E_HEADED !== "1",
      channel,
    });
  } catch {
    browser = await chromium.launch({
      headless: process.env.E2E_HEADED !== "1",
    });
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(120_000);

  try {
    await page.addInitScript(() => {
      window.Translator = {
        async availability() {
          return "available";
        },
        async create() {
          return {
            async translate(text) {
              return text;
            },
            destroy() {},
          };
        },
      };
    });

    console.log(`Opening ${BASE}/documents/${DOC_ID} …`);
    await page.goto(`${BASE}/documents/${DOC_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "DEV traduir" }).click();
    await page.locator(".pdf-layout-translate-workspace").waitFor({
      state: "visible",
    });
    await page
      .locator(".pdf-layout-translate-workspace")
      .getByRole("button", { name: /Traduint/ })
      .waitFor({ state: "visible", timeout: 90_000 });
    await page
      .locator(".pdf-layout-translate-workspace")
      .getByRole("button", { name: /^Traduir$/ })
      .waitFor({ state: "visible", timeout: 360_000 });

    const report = await page.evaluate(async () => {
      const origImg = document.querySelector(
        ".pdf-layout-translate-workspace .pdf-ocr-paper--original img",
      );
      const bgImg = document.querySelector(
        ".pdf-layout-translate-workspace .pdf-ocr-paper--on-scan .pdf-ocr-page-bg",
      );
      if (!(origImg instanceof HTMLImageElement) || !(bgImg instanceof HTMLImageElement)) {
        return { state: "missing" };
      }

      async function darkRatio(img, y0 = 0.25, y1 = 0.9) {
        await img.decode().catch(() => undefined);
        const canvas = document.createElement("canvas");
        const w = Math.min(img.naturalWidth || 400, 600);
        const scale = w / Math.max(img.naturalWidth || w, 1);
        const h = Math.max(1, Math.round((img.naturalHeight || 800) * scale));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return 1;
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        let dark = 0;
        let total = 0;
        const row0 = Math.floor(h * y0);
        const row1 = Math.floor(h * y1);
        for (let y = row0; y < row1; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const luma =
              data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            total += 1;
            if (luma < 140) dark += 1;
          }
        }
        return total ? dark / total : 1;
      }

      const originalDark = await darkRatio(origImg);
      const cleanedDark = await darkRatio(bgImg);
      const reduction =
        originalDark > 0 ? 1 - cleanedDark / originalDark : 0;

      // Branding check: top band should retain more structure than a blank page.
      const topDark = await darkRatio(bgImg, 0.02, 0.18);

      return {
        state: "ok",
        originalDark: Number(originalDark.toFixed(4)),
        cleanedDark: Number(cleanedDark.toFixed(4)),
        reduction: Number(reduction.toFixed(4)),
        topDark: Number(topDark.toFixed(4)),
        bgSrcKind: (bgImg.src || "").startsWith("data:") ? "data" : "other",
      };
    });

    writeFileSync(
      path.join(outDir, "pdf-layout-background-report.json"),
      JSON.stringify(report, null, 2),
    );
    await page.screenshot({
      path: path.join(outDir, "pdf-layout-background-after.png"),
      fullPage: false,
    });

    assert(report.state === "ok", JSON.stringify(report));
    assert(report.bgSrcKind === "data", "Expected whitened data URL background");
    assert(
      report.reduction >= 0.35,
      `Body ink not reduced enough (${(report.reduction * 100).toFixed(1)}%)`,
    );
    assert(
      report.topDark >= 0.01,
      "Letterhead/branding band looks blank — scrub too aggressive",
    );

    console.log("Background cleanup OK:", report);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
