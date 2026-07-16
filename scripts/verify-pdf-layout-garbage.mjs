/**
 * Verify OCR garbage cleanup on document 11 (overlapping text + giant glyphs).
 *
 * Usage:
 *   E2E_LIVE=1 node scripts/verify-pdf-layout-garbage.mjs
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
  const cleanup = readFileSync(
    path.join(root, "src/utils/ocrLineCleanup.ts"),
    "utf8",
  );
  const helpers = readFileSync(
    path.join(root, "src/utils/ocrTranslateHelpers.ts"),
    "utf8",
  );
  assert(cleanup.includes("cleanOcrLinesForLayout"), "missing cleanup export");
  assert(cleanup.includes("isGarbageOcrLine"), "missing garbage detector");
  assert(helpers.includes("cleanOcrLinesForLayout"), "helpers not wired");
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
      .waitFor({ state: "visible", timeout: 30_000 });

    await page
      .locator(".pdf-layout-translate-workspace")
      .getByRole("button", { name: /Traduint/ })
      .waitFor({ state: "visible", timeout: 90_000 });

    await page
      .locator(".pdf-layout-translate-workspace")
      .getByRole("button", { name: /^Traduir$/ })
      .waitFor({ state: "visible", timeout: 360_000 });

    const report = await page.evaluate(() => {
      const workspace = document.querySelector(
        ".pdf-layout-translate-workspace",
      );
      const err = workspace?.querySelector(".alert-error")?.textContent?.trim();
      if (err) return { state: "error", error: err };

      const papers = [
        ...(workspace?.querySelectorAll(".pdf-ocr-paper--on-scan") ?? []),
      ];
      let lineCount = 0;
      let giants = [];
      let shortHuge = 0;
      let maxFont = 0;
      let overlapPairs = 0;
      let pageH = 1;

      for (const paper of papers) {
        pageH = Math.max(pageH, paper.clientHeight || 1);
        const lines = [...paper.querySelectorAll(".pdf-ocr-page-line")];
        lineCount += lines.length;
        const samples = lines.map((el) => {
          const s = getComputedStyle(el);
          const fontSize = parseFloat(s.fontSize);
          const top = parseFloat(s.top);
          const height = el.getBoundingClientRect().height;
          return {
            text: (el.textContent || "").trim(),
            fontSize,
            top,
            height,
            fontRatio: fontSize / Math.max(paper.clientHeight, 1),
          };
        });

        for (const s of samples) {
          maxFont = Math.max(maxFont, s.fontSize);
          if (
            s.fontRatio > 0.055 ||
            (s.text.length <= 3 && s.fontSize > 28) ||
            (s.text.length <= 2 && s.fontSize > 22)
          ) {
            giants.push({
              text: s.text.slice(0, 40),
              fontSize: s.fontSize,
              fontRatio: Number(s.fontRatio.toFixed(4)),
            });
          }
          if (s.text.length <= 3 && s.fontSize >= 20) shortHuge += 1;
        }

        // Same-page stacking only (ignore cross-page relative tops).
        for (let i = 0; i < samples.length; i++) {
          for (let j = i + 1; j < samples.length; j++) {
            const a = samples[i];
            const b = samples[j];
            if (a.text.length < 12 || b.text.length < 12) continue;
            const a1 = a.top + Math.max(a.height, 6);
            const b1 = b.top + Math.max(b.height, 6);
            const overlap = Math.min(a1, b1) - Math.max(a.top, b.top);
            const shorter = Math.min(
              Math.max(a.height, 6),
              Math.max(b.height, 6),
            );
            if (overlap / shorter > 0.7) overlapPairs += 1;
          }
        }
      }

      return {
        state: "ok",
        lineCount,
        pageH,
        giants,
        overlapPairs,
        shortHuge,
        maxFont,
        pageCount: papers.length,
      };
    });

    writeFileSync(
      path.join(outDir, "pdf-layout-garbage-report.json"),
      JSON.stringify(report, null, 2),
    );
    await page.screenshot({
      path: path.join(outDir, "pdf-layout-garbage-after.png"),
      fullPage: false,
    });

    if (report.state !== "ok") {
      throw new Error(report.error || "Layout failed");
    }

    assert(report.lineCount >= 5, `Too few lines: ${report.lineCount}`);
    assert(
      report.giants.length === 0,
      `Giant garbage glyphs still present: ${JSON.stringify(report.giants)}`,
    );
    assert(
      report.shortHuge === 0,
      `Short huge tokens remain: ${report.shortHuge}`,
    );
    assert(
      report.overlapPairs <= 8,
      `Too many overlapping text pairs: ${report.overlapPairs}`,
    );
    assert(
      report.maxFont <= report.pageH * 0.06,
      `Max font ${report.maxFont} too large for page ${report.pageH}`,
    );

    console.log("Garbage cleanup OK:", {
      lineCount: report.lineCount,
      maxFont: report.maxFont,
      overlapPairs: report.overlapPairs,
    });
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
