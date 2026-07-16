/**
 * Verify DEV faithful PDF layout translation for document 406.
 *
 * Usage:
 *   E2E_LIVE=1 node scripts/verify-pdf-layout-translate.mjs
 *
 * Requires: npm run dev (default http://localhost:5173) and backend with doc 406.
 * Injects a Translator mock so OCR → layout overlay can run without Chrome packs.
 * Translation starts automatically when DEV traduir opens (no second click).
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const DOC_ID = Number(process.env.E2E_DOC_ID ?? "406");
const LIVE = process.env.E2E_LIVE === "1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "scripts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceContractCheck() {
  const workspaceSrc = readFileSync(
    path.join(root, "src/components/PdfLayoutTranslateWorkspace.tsx"),
    "utf8",
  );
  const docsSrc = readFileSync(
    path.join(root, "src/pages/DocumentsPage.tsx"),
    "utf8",
  );
  const css = readFileSync(path.join(root, "src/index.css"), "utf8");
  const fontSrc = readFileSync(
    path.join(root, "src/utils/ocrLineFontSize.ts"),
    "utf8",
  );

  for (const [name, src, token] of [
    ["PdfLayoutTranslateWorkspace", workspaceSrc, "autoStartedRef"],
    ["PdfLayoutTranslateWorkspace", workspaceSrc, "FittingOcrTranslatedLine"],
    ["DocumentsPage", docsSrc, "DEV traduir"],
    ["index.css", css, ".pdf-layout-translate-workspace .pdf-ocr-paper--original img"],
    ["ocrLineFontSize", fontSrc, "ocrLineFontSizePx"],
  ]) {
    assert(src.includes(token), `${name}: missing "${token}"`);
  }
  console.log("Source contract OK");
}

async function main() {
  sourceContractCheck();
  mkdirSync(outDir, { recursive: true });

  const channel = process.env.E2E_BROWSER_CHANNEL || "chrome";
  let browser;
  try {
    browser = await chromium.launch({
      headless: process.env.E2E_HEADED !== "1",
      channel,
    });
  } catch {
    console.warn(`Channel "${channel}" unavailable; falling back to Chromium.`);
    browser = await chromium.launch({
      headless: process.env.E2E_HEADED !== "1",
    });
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(120_000);

  try {
    if (!LIVE) {
      console.warn(
        "E2E_LIVE is not set. Structural source checks passed; set E2E_LIVE=1 to exercise /documents/406.",
      );
      return;
    }

    await page.addInitScript(() => {
      window.Translator = {
        async availability() {
          return "available";
        },
        async create() {
          return {
            // Near 1:1 length so font sizing isn't dominated by wrap shrink.
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

    const devBtn = page.getByRole("button", { name: "DEV traduir" });
    await devBtn.waitFor({ state: "visible", timeout: 60_000 });
    await page.screenshot({
      path: path.join(outDir, "pdf-layout-translate-before.png"),
      fullPage: false,
    });

    console.log("Clicking DEV traduir (auto-starts OCR+translate)…");
    await devBtn.click();
    await page
      .locator('.pdf-layout-translate-workspace, [data-layout-translate="true"]')
      .waitFor({ state: "visible", timeout: 30_000 });

    // Auto-start should move into busy state without clicking Traduir.
    await page
      .locator(".pdf-layout-translate-workspace")
      .getByRole("button", { name: /Traduint/ })
      .waitFor({ state: "visible", timeout: 90_000 });

    // Wait until the run finishes (button returns to "Traduir").
    await page
      .locator(".pdf-layout-translate-workspace")
      .getByRole("button", { name: /^Traduir$/ })
      .waitFor({ state: "visible", timeout: 300_000 });

    const outcome = await page.evaluate(() => {
      const workspace = document.querySelector(
        ".pdf-layout-translate-workspace",
      );
      if (!workspace) return { state: "missing" };
      const err = workspace.querySelector(".alert-error");
      const errText = err?.textContent?.trim() || "";
      if (errText) return { state: "error", error: errText };

      const stage = workspace.querySelector(
        '.pdf-ocr-workspace-pane[aria-label="Document original"] .pdf-ocr-doc-stage',
      );
      const paper = workspace.querySelector(".pdf-ocr-paper--original");
      const paperImg = paper?.querySelector("img");
      const stageW = stage?.clientWidth ?? 0;
      const stageH = stage?.clientHeight ?? 0;
      const paperW = paperImg?.clientWidth ?? paper?.clientWidth ?? 0;
      const paperH = paperImg?.clientHeight ?? paper?.clientHeight ?? 0;
      const fillRatio = stageW > 0 ? paperW / stageW : 0;
      const heightFill = stageH > 0 ? paperH / stageH : 0;
      const zoomLabel =
        workspace
          .querySelector(".pdf-ocr-workspace-zoom-label")
          ?.textContent?.trim() || "";

      const lines = [...workspace.querySelectorAll(".pdf-ocr-page-line")];
      const bg = workspace.querySelector(
        ".pdf-ocr-paper--on-scan .pdf-ocr-page-bg",
      );
      const bgSrc = bg?.getAttribute("src") || "";
      const bgOk =
        Boolean(bg) &&
        (bgSrc.startsWith("data:") || bgSrc.startsWith("blob:"));

      const fontSizes = lines.map((el) => parseFloat(getComputedStyle(el).fontSize));
      const sorted = [...fontSizes].sort((a, b) => a - b);
      const medianFont =
        sorted.length === 0
          ? 0
          : sorted[Math.floor(sorted.length / 2)] ?? 0;

      if (lines.length >= 2 && bgOk) {
        const aligns = {};
        for (const el of lines) {
          const a = el.getAttribute("data-ocr-align") || "left";
          aligns[a] = (aligns[a] || 0) + 1;
        }
        const samples = lines.slice(0, 8).map((el) => {
          const s = getComputedStyle(el);
          return {
            text: (el.textContent || "").slice(0, 60),
            top: s.top,
            left: s.left,
            width: s.width,
            fontSize: s.fontSize,
            textAlign: s.textAlign,
            align: el.getAttribute("data-ocr-align"),
          };
        });
        return {
          state: "ok",
          lineCount: lines.length,
          hasBg: true,
          aligns,
          samples,
          fillRatio,
          heightFill,
          zoomLabel,
          medianFont,
          stageW,
          paperW,
          stageH,
          paperH,
        };
      }
      return {
        state: "incomplete",
        lineCount: lines.length,
        hasBg: bgOk,
        fillRatio,
        heightFill,
        zoomLabel,
        medianFont,
      };
    });

    writeFileSync(
      path.join(outDir, "pdf-layout-translate-report.json"),
      JSON.stringify(outcome, null, 2),
    );

    await page.screenshot({
      path: path.join(outDir, "pdf-layout-translate-after.png"),
      fullPage: false,
    });

    if (!outcome || outcome.state !== "ok") {
      throw new Error(
        outcome?.error ||
          `Layout overlay did not render lines (state=${outcome?.state})`,
      );
    }

    assert(
      outcome.lineCount >= 2,
      `Expected ≥2 lines, got ${outcome.lineCount}`,
    );
    assert(outcome.hasBg, "Missing whitened .pdf-ocr-page-bg");
    assert(
      outcome.fillRatio >= 0.85,
      `Page should fill Vista-previa-like width (≥85%), got ${(outcome.fillRatio * 100).toFixed(1)}% (paper ${outcome.paperW} / stage ${outcome.stageW})`,
    );
    assert(
      outcome.heightFill >= 0.72,
      `Page should fill most of pane height (≥72%), got ${(outcome.heightFill * 100).toFixed(1)}% (paper ${outcome.paperH} / stage ${outcome.stageH}, zoom ${outcome.zoomLabel})`,
    );
    assert(
      outcome.medianFont >= 12,
      `Median font size too small (${outcome.medianFont}px); expected ≥12px`,
    );

    for (const sample of outcome.samples) {
      assert(sample.top !== "auto", `Bad top: ${JSON.stringify(sample)}`);
      assert(
        parseFloat(sample.fontSize) >= 11,
        `Font too small: ${JSON.stringify(sample)}`,
      );
    }

    console.log("Layout translate OK:", {
      lineCount: outcome.lineCount,
      aligns: outcome.aligns,
      fillRatio: Number(outcome.fillRatio.toFixed(3)),
      heightFill: Number(outcome.heightFill.toFixed(3)),
      zoomLabel: outcome.zoomLabel,
      medianFont: outcome.medianFont,
    });
    console.log(
      "Screenshots: pdf-layout-translate-before/workspace/after.png + report.json",
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
