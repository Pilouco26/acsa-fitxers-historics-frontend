/**
 * Verify cut-text fit + paragraph-jump fix on document 11.
 *
 * Usage:
 *   E2E_LIVE=1 node scripts/verify-pdf-layout-fit-jump.mjs
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
  const font = readFileSync(
    path.join(root, "src/utils/ocrLineFontSize.ts"),
    "utf8",
  );
  assert(
    helpers.includes("newSentence") ||
      helpers.includes("Never pull the next paragraph"),
    "paragraph break guard missing",
  );
  assert(helpers.includes("nextLower"), "connective soft-wrap guard missing");
  assert(font.includes("OCR_FONT_GROUP_FIT"), "font fit scale missing");
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
              // Slightly longer than source → stresses fit + redistribute.
              return text.replace(/\b(\w{4,})\b/g, "$1·");
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

    const report = await page.evaluate(() => {
      const paper = document.querySelector(
        ".pdf-layout-translate-workspace .pdf-ocr-paper--on-scan",
      );
      if (!paper) return { state: "missing" };
      const lines = [...paper.querySelectorAll(".pdf-ocr-page-line")];
      if (lines.length < 8) return { state: "few", lineCount: lines.length };

      let overflowCount = 0;
      const samples = [];
      for (const el of lines) {
        const overflow = el.scrollWidth > el.clientWidth + 3;
        if (overflow) overflowCount += 1;
        const text = (el.textContent || "").trim();
        if (text.length >= 28) {
          samples.push({
            text: text.slice(0, 70),
            top: parseFloat(getComputedStyle(el).top),
            left: parseFloat(getComputedStyle(el).left),
            fontSize: parseFloat(getComputedStyle(el).fontSize),
            overflow,
          });
        }
      }

      // Detect possible sentence jumps: a line ending mid-phrase + next line
      // starting with typical paragraph-openers that should not continue.
      const jumpHints = [];
      for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i].text;
        const b = samples[i + 1].text;
        const aEndsOpen = /(?:\b(el|la|los|las|de|del|un|una|este|esta|no|y|e)\s*)$/i.test(
          a,
        );
        const bStartsFresh =
          /^(?:Del mismo|De la misma|Como|Por|Asimismo|Además|Sin embargo)\b/i.test(
            b,
          );
        if (aEndsOpen && bStartsFresh) {
          jumpHints.push({ a: a.slice(-40), b: b.slice(0, 40) });
        }
      }

      const sizes = [
        ...new Set(
          lines.map(
            (el) => Math.round(parseFloat(getComputedStyle(el).fontSize) * 2) / 2,
          ),
        ),
      ].sort((a, b) => a - b);

      return {
        state: "ok",
        lineCount: lines.length,
        overflowCount,
        overflowRatio: overflowCount / lines.length,
        jumpHints,
        uniqueSizes: sizes,
      };
    });

    writeFileSync(
      path.join(outDir, "pdf-layout-fit-jump-report.json"),
      JSON.stringify(report, null, 2),
    );
    await page.screenshot({
      path: path.join(outDir, "pdf-layout-fit-jump-after.png"),
      fullPage: false,
    });

    assert(report.state === "ok", JSON.stringify(report));
    assert(
      report.overflowRatio <= 0.25,
      `Too many clipped lines: ${(report.overflowRatio * 100).toFixed(1)}% (${report.overflowCount}/${report.lineCount})`,
    );
    assert(
      report.jumpHints.length <= 1,
      `Likely sentence jumps still present: ${JSON.stringify(report.jumpHints)}`,
    );

    console.log("Fit/jump OK:", {
      lineCount: report.lineCount,
      overflowRatio: Number(report.overflowRatio.toFixed(3)),
      jumpHints: report.jumpHints.length,
      uniqueSizes: report.uniqueSizes,
    });
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
