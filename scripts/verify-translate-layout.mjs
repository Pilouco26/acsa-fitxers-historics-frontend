/**
 * Structural parity check: BackendDocumentTranslatePanel vs PdfOcrTranslateWorkspace.
 * Renders the shared layout classes and asserts one box + pager arrows.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(path.join(root, "src/index.css"), "utf8");

const backendSrc = readFileSync(
  path.join(root, "src/components/BackendDocumentTranslatePanel.tsx"),
  "utf8",
);
const ocrSrc = readFileSync(
  path.join(root, "src/components/PdfOcrTranslateWorkspace.tsx"),
  "utf8",
);

const sourceIssues = [];
for (const [name, src] of [
  ["BackendDocumentTranslatePanel", backendSrc],
  ["PdfOcrTranslateWorkspace", ocrSrc],
]) {
  for (const token of [
    "pdf-ocr-workspace-toolbar",
    "pdf-ocr-workspace-pager",
    "pdf-ocr-workspace-panes",
    "pdf-ocr-workspace-pane-title",
    "←",
    "→",
  ]) {
    if (!src.includes(token)) {
      sourceIssues.push(`${name}: missing "${token}"`);
    }
  }
}
if (!backendSrc.includes("aria-label=\"Document original\"")) {
  sourceIssues.push("BackendDocumentTranslatePanel: missing Original pane");
}
if (backendSrc.includes("split-detail-translate")) {
  sourceIssues.push(
    "BackendDocumentTranslatePanel: still uses separate split-detail-translate card",
  );
}
if (sourceIssues.length) {
  console.error("Source structure FAILED:");
  for (const issue of sourceIssues) console.error(" -", issue);
  process.exit(1);
}

function workspaceFixture(kind) {
  const extraToolbar =
    kind === "ocr"
      ? `
        <div class="pdf-ocr-workspace-langs">
          <label class="pdf-ocr-workspace-lang"><span>Origen</span><select><option>fr</option></select></label>
          <span>→</span>
          <label class="pdf-ocr-workspace-lang"><span>Destí</span><select><option>es</option></select></label>
        </div>
        <button type="button" class="btn btn-primary btn-sm">Traduir</button>
      `
      : "";

  return `
    <div class="card card-panel split-detail-preview" style="height: 80vh; padding: 1rem;">
      <div class="pdf-ocr-workspace" data-workspace="${kind}">
        <div class="pdf-ocr-workspace-toolbar">
          <div class="pdf-ocr-workspace-pager">
            <button type="button" class="btn btn-secondary btn-sm">←</button>
            <span>Pàg. 1 / 2</span>
            <button type="button" class="btn btn-secondary btn-sm">→</button>
          </div>
          <div class="pdf-ocr-workspace-zoom" role="group" aria-label="Zoom document">
            <button type="button" class="btn btn-secondary btn-sm">−</button>
            <span class="pdf-ocr-workspace-zoom-label">100%</span>
            <button type="button" class="btn btn-secondary btn-sm">+</button>
            <button type="button" class="btn btn-secondary btn-sm">100%</button>
          </div>
          ${extraToolbar}
        </div>
        <div class="pdf-ocr-workspace-panes">
          <section class="pdf-ocr-workspace-pane" aria-label="Document original">
            <h4 class="pdf-ocr-workspace-pane-title">Original</h4>
            <div class="pdf-ocr-doc-stage">
              <div class="pdf-ocr-doc-stack">
                <div class="pdf-ocr-paper pdf-ocr-paper--original" data-translate-page="1">
                  <p class="empty-state" style="padding:1.5rem">Original pàg. 1</p>
                </div>
              </div>
            </div>
          </section>
          <section class="pdf-ocr-workspace-pane" aria-label="Document traduït">
            <h4 class="pdf-ocr-workspace-pane-title">Traducció</h4>
            <div class="pdf-ocr-doc-stage">
              <div class="pdf-ocr-doc-stack">
                <div class="pdf-ocr-paper pdf-ocr-paper--translation pdf-ocr-paper--plain-view" data-translate-page="1">
                  <p class="empty-state" style="padding:1.5rem">Traducció pàg. 1</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

const html = `<!doctype html>
<html lang="ca">
<head>
  <meta charset="utf-8" />
  <title>Translate layout parity</title>
  <style>${css}</style>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f5f5f7; }
    .fixtures { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; padding: 1rem; }
    .label { margin: 0 0 0.5rem; font-weight: 600; }
  </style>
</head>
<body>
  <div class="fixtures">
    <div>
      <p class="label">PdfOcrTranslateWorkspace</p>
      ${workspaceFixture("ocr")}
    </div>
    <div>
      <p class="label">BackendDocumentTranslatePanel</p>
      ${workspaceFixture("backend")}
    </div>
  </div>
</body>
</html>`;

function assertStructure(workspace) {
  const issues = [];
  const boxes = workspace.locator(".pdf-ocr-workspace");
  // already scoped to one workspace root
  const pagerPrev = workspace.locator(".pdf-ocr-workspace-pager button").first();
  const pagerNext = workspace.locator(".pdf-ocr-workspace-pager button").nth(1);
  const panes = workspace.locator(".pdf-ocr-workspace-panes > .pdf-ocr-workspace-pane");
  const stages = workspace.locator(".pdf-ocr-doc-stage");
  const titles = workspace.locator(".pdf-ocr-workspace-pane-title");

  return {
    async run(name) {
      if ((await workspace.count()) !== 1) {
        issues.push(`${name}: expected exactly 1 .pdf-ocr-workspace (one box)`);
      }
      if ((await pagerPrev.count()) !== 1 || (await pagerNext.count()) !== 1) {
        issues.push(`${name}: missing pager ← → arrows`);
      }
      const prevText = (await pagerPrev.textContent())?.trim();
      const nextText = (await pagerNext.textContent())?.trim();
      if (prevText !== "←" || nextText !== "→") {
        issues.push(`${name}: pager buttons should be ← and → (got "${prevText}" / "${nextText}")`);
      }
      if ((await panes.count()) !== 2) {
        issues.push(`${name}: expected 2 panes inside one workspace`);
      }
      if ((await stages.count()) !== 2) {
        issues.push(`${name}: expected 2 .pdf-ocr-doc-stage boxes`);
      }
      if ((await titles.count()) !== 2) {
        issues.push(`${name}: expected Original + Traducció titles`);
      }
      // Must NOT be a sibling two-card layout
      const siblingCards = await workspace
        .locator("xpath=ancestor::*[contains(@class,'fixtures')]/div[contains(@class,'card')]")
        .count();
      if (siblingCards > 1) {
        issues.push(`${name}: more than one card around workspace`);
      }
      return issues;
    },
  };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.setContent(html, { waitUntil: "load" });

const ocr = page.locator('[data-workspace="ocr"]');
const backend = page.locator('[data-workspace="backend"]');

const ocrIssues = await assertStructure(ocr).run("OCR");
const backendIssues = await assertStructure(backend).run("Backend");

const ocrBox = await ocr.boundingBox();
const backendBox = await backend.boundingBox();
const ocrPanes = await ocr.locator(".pdf-ocr-workspace-panes").boundingBox();
const backendPanes = await backend.locator(".pdf-ocr-workspace-panes").boundingBox();

const layoutIssues = [];
if (!ocrBox || !backendBox || !ocrPanes || !backendPanes) {
  layoutIssues.push("Could not measure workspace bounding boxes");
} else {
  // Both are a single contiguous box; panes live inside that one box
  if (ocrPanes.y < ocrBox.y) layoutIssues.push("OCR panes outside workspace");
  if (backendPanes.y < backendBox.y) layoutIssues.push("Backend panes outside workspace");
  const ocrPaneCount = await ocr.locator(".pdf-ocr-workspace-panes > *").count();
  const backendPaneCount = await backend.locator(".pdf-ocr-workspace-panes > *").count();
  if (ocrPaneCount !== backendPaneCount) {
    layoutIssues.push(
      `Pane child count mismatch: OCR=${ocrPaneCount} Backend=${backendPaneCount}`,
    );
  }
}

const shotPath = path.join(root, "scripts", "translate-layout-parity.png");
await page.screenshot({ path: shotPath, fullPage: true });

await browser.close();

const allIssues = [...ocrIssues, ...backendIssues, ...layoutIssues];
if (allIssues.length) {
  console.error("Layout parity FAILED:");
  for (const issue of allIssues) console.error(" -", issue);
  process.exit(1);
}

console.log("Layout parity OK");
console.log(" - Both use one .pdf-ocr-workspace box");
console.log(" - Both have pager ← → arrows");
console.log(" - Both have Original + Traducció panes inside the same box");
console.log(` - Screenshot: ${shotPath}`);
