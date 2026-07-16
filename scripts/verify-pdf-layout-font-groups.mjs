/**
 * Verify typographic font groups on document 11: few distinct sizes, not one per line.
 *
 * Usage:
 *   E2E_LIVE=1 node scripts/verify-pdf-layout-font-groups.mjs
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
  const groups = readFileSync(
    path.join(root, "src/utils/ocrFontGroups.ts"),
    "utf8",
  );
  const helpers = readFileSync(
    path.join(root, "src/utils/ocrTranslateHelpers.ts"),
    "utf8",
  );
  const fitting = readFileSync(
    path.join(root, "src/components/FittingOcrTranslatedLine.tsx"),
    "utf8",
  );
  assert(groups.includes("assignOcrFontGroups"), "missing assignOcrFontGroups");
  assert(helpers.includes("assignOcrFontGroups"), "helpers not wired");
  assert(fitting.includes("fontHeightRatio"), "fitting line missing group size");
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
    await page
      .locator(".pdf-layout-translate-workspace")
      .waitFor({ state: "visible" });
    await page
      .locator(".pdf-layout-translate-workspace")
      .getByRole("button", { name: /Traduint/ })
      .waitFor({ state: "visible", timeout: 90_000 });
    await page
      .locator(".pdf-layout-translate-workspace")
      .getByRole("button", { name: /^Traduir$/ })
      .waitFor({ state: "visible", timeout: 360_000 });

    const report = await page.evaluate(() => {
      const paper = document.querySelector(
        ".pdf-layout-translate-workspace .pdf-ocr-paper--on-scan",
      );
      if (!paper) return { state: "missing" };
      const lines = [...paper.querySelectorAll(".pdf-ocr-page-line")];
      if (lines.length < 8) {
        return { state: "few", lineCount: lines.length };
      }

      const sizes = lines.map((el) =>
        Math.round(parseFloat(getComputedStyle(el).fontSize) * 2) / 2,
      );
      const unique = [...new Set(sizes)].sort((a, b) => a - b);
      const groups = [
        ...new Set(
          lines
            .map((el) => el.getAttribute("data-font-group"))
            .filter((g) => g != null && g !== ""),
        ),
      ];

      // Body-ish: lines with longer text should share almost one size.
      const bodySizes = lines
        .filter((el) => ((el.textContent || "").trim().length || 0) >= 40)
        .map((el) => Math.round(parseFloat(getComputedStyle(el).fontSize) * 2) / 2);
      const bodyUnique = [...new Set(bodySizes)];

      return {
        state: "ok",
        lineCount: lines.length,
        uniqueSizes: unique,
        uniqueCount: unique.length,
        fontGroups: groups.length,
        bodyUniqueCount: bodyUnique.length,
        bodyUnique,
      };
    });

    writeFileSync(
      path.join(outDir, "pdf-layout-font-groups-report.json"),
      JSON.stringify(report, null, 2),
    );
    await page.screenshot({
      path: path.join(outDir, "pdf-layout-font-groups-after.png"),
      fullPage: false,
    });

    assert(report.state === "ok", `Unexpected state: ${JSON.stringify(report)}`);
    assert(
      report.uniqueCount <= 8,
      `Too many distinct font sizes (${report.uniqueCount}): ${report.uniqueSizes}`,
    );
    assert(
      report.bodyUniqueCount <= 2,
      `Body text should share ≤2 sizes, got ${report.bodyUniqueCount}: ${report.bodyUnique}`,
    );
    assert(
      report.fontGroups >= 1 && report.fontGroups <= 8,
      `Unexpected font group count: ${report.fontGroups}`,
    );

    console.log("Font groups OK:", {
      lineCount: report.lineCount,
      uniqueSizes: report.uniqueSizes,
      fontGroups: report.fontGroups,
      bodyUnique: report.bodyUnique,
    });
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
