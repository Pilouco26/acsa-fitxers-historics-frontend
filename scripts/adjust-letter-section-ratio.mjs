/**
 * Force Capçalera / Cos / Peu to measured 10% / 80% / 10% of the letter box.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = path.join(root, "src/index.css");

const LAYOUT_BLOCK = `.backend-translate-page--structured {
  display: flex;
  flex-direction: column;
  min-height: 40rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.7), transparent 20%),
    #f7f2e7;
}

.backend-translate-letter {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: grid;
  /* Default: Capçalera 10% / Cos 80% / Peu 10% */
  grid-template-rows: 10% 80% 10%;
  /* No vertical gap/padding: percentages must equal outer height exactly. */
  gap: 0;
  padding: 0 clamp(1.25rem, 4.5vw, 2.25rem);
  box-sizing: border-box;
}

.backend-translate-letter[data-letter-layout="body"] {
  grid-template-rows: 1fr;
}

.backend-translate-letter[data-letter-layout="header-body"] {
  grid-template-rows: 10% 90%;
}

.backend-translate-letter[data-letter-layout="body-footer"] {
  grid-template-rows: 90% 10%;
}

.backend-translate-letter[data-letter-layout="header-body-footer"] {
  grid-template-rows: 10% 80% 10%;
}

.backend-translate-letter .pdf-ocr-page-plain {
  padding: 0;
}

.backend-translate-letter-label {
  margin: 0 0 0.35rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.backend-translate-letter-section--meta {
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(70, 55, 30, 0.14);
  background: rgba(255, 255, 255, 0.45);
  box-sizing: border-box;
}

.backend-translate-letter-section--meta .backend-translate-letter-label {
  color: #6b6358;
}

.backend-translate-letter-section--meta .pdf-ocr-page-plain,
.backend-translate-letter-section--meta .pdf-ocr-page-plain p {
  font-size: 0.8125rem;
  line-height: 1.35;
  color: #5c564c;
  white-space: pre-wrap;
  font-family: ui-monospace, "Cascadia Mono", "Segoe UI Mono", Consolas, monospace;
}

.backend-translate-letter-section--meta .pdf-ocr-page-plain p {
  margin-bottom: 0.35em;
}

.backend-translate-letter-section--primary {
  min-height: 0;
  overflow: auto;
  padding: 0.85rem 0;
  box-sizing: border-box;
}

.backend-translate-letter-section--primary .backend-translate-letter-label {
  color: #1f1a14;
  font-size: 0.75rem;
}

.backend-translate-letter-section--primary .pdf-ocr-page-plain,
.backend-translate-letter-section--primary .pdf-ocr-page-plain p {
  font-size: 1.0625rem;
  line-height: 1.65;
  color: #1f1a14;
  font-family:
    "Segoe UI",
    "Helvetica Neue",
    Arial,
    "Noto Sans",
    sans-serif;
}`;

function buildHtml(css) {
  return `<!doctype html>
<html lang="ca">
<head>
  <meta charset="utf-8" />
  <style>${css}</style>
  <style>
    html, body { margin: 0; height: 100%; background: #e8e4dc; }
    .wrap { height: 100vh; display: flex; align-items: stretch; justify-content: center; padding: 1rem; box-sizing: border-box; }
    .pdf-ocr-paper { width: 28rem; height: 100%; }
  </style>
</head>
<body>
  <div class="wrap">
    <article class="pdf-ocr-paper pdf-ocr-paper--translation pdf-ocr-paper--plain-view backend-translate-page--structured">
      <div class="backend-translate-letter" id="letter" data-letter-layout="header-body-footer">
        <section class="backend-translate-letter-section backend-translate-letter-section--meta" data-section="header">
          <h5 class="backend-translate-letter-label">Capçalera</h5>
          <div class="pdf-ocr-page-plain">
            <p>15, RUE DE L'ECOLE NORMALE</p>
            <p>BORDEAUX-CAUDERAN</p>
            <p>Téléphone 48.59.06</p>
          </div>
        </section>
        <section class="backend-translate-letter-section backend-translate-letter-section--primary" data-section="body">
          <h5 class="backend-translate-letter-label">Cos</h5>
          <div class="pdf-ocr-page-plain">
            <p>Estimat senyor,</p>
            <p>Confirmem el vostre telegrama i els enviem la llista completa de mercaderies.</p>
            <p>Aquí teniu els productes disponibles: Anisette, Kirsch, Chartreuse i altres destil·lats.</p>
            <p>Us demanem que confirmeu la comanda tan aviat com sigui possible.</p>
            <p>Ben cordialment,</p>
          </div>
        </section>
        <section class="backend-translate-letter-section backend-translate-letter-section--meta" data-section="footer">
          <h5 class="backend-translate-letter-label">Peu</h5>
          <div class="pdf-ocr-page-plain">
            <p>PUERTO-RICO, GUYANE, MARTINIQUE</p>
            <p>Clauses comercials i legales</p>
          </div>
        </section>
      </div>
    </article>
  </div>
</body>
</html>`;
}

async function measure(page) {
  return page.evaluate(() => {
    const letter = document.getElementById("letter");
    const header = document.querySelector('[data-section="header"]');
    const body = document.querySelector('[data-section="body"]');
    const footer = document.querySelector('[data-section="footer"]');
    const total = letter.getBoundingClientRect().height;
    const h = header.getBoundingClientRect().height;
    const b = body.getBoundingClientRect().height;
    const f = footer.getBoundingClientRect().height;
    return {
      total,
      headerPct: (h / total) * 100,
      bodyPct: (b / total) * 100,
      footerPct: (f / total) * 100,
    };
  });
}

let css = readFileSync(cssPath, "utf8");
const replaced = css.replace(
  /\.backend-translate-page--structured\s*\{[\s\S]*?\n\}\s*\n\.backend-translate-letter\s*\{[\s\S]*?\n\}\s*\n\.backend-translate-letter \.pdf-ocr-page-plain\s*\{[\s\S]*?\n\}\s*\n\.backend-translate-letter-label\s*\{[\s\S]*?\n\}\s*\n\.backend-translate-letter-section--meta\s*\{[\s\S]*?\n\}\s*\n\.backend-translate-letter-section--meta \.backend-translate-letter-label\s*\{[\s\S]*?\n\}\s*\n\.backend-translate-letter-section--meta \.pdf-ocr-page-plain,[\s\S]*?\.backend-translate-letter-section--primary \.pdf-ocr-page-plain p\s*\{[\s\S]*?\n\}/,
  LAYOUT_BLOCK,
);

if (replaced === css) {
  console.error("Failed to replace layout CSS block");
  process.exit(1);
}
writeFileSync(cssPath, replaced, "utf8");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
await page.setContent(buildHtml(readFileSync(cssPath, "utf8")), {
  waitUntil: "load",
});
const final = await measure(page);
const shot = path.join(root, "scripts", "letter-section-ratio.png");
await page.screenshot({ path: shot, fullPage: true });
await browser.close();

console.log("Measured ratios (of letter height):");
console.log(`  Capçalera: ${final.headerPct.toFixed(1)}%`);
console.log(`  Cos:       ${final.bodyPct.toFixed(1)}%`);
console.log(`  Peu:       ${final.footerPct.toFixed(1)}%`);
console.log(`Screenshot: ${shot}`);

const bodyOk = Math.abs(final.bodyPct - 80) <= 2;
const metaOk =
  Math.abs(final.headerPct - 10) <= 2 && Math.abs(final.footerPct - 10) <= 2;

if (!bodyOk || !metaOk) {
  console.error("FAILED: expected ~10% / ~80% / ~10%");
  process.exit(1);
}
console.log("OK: Capçalera 10% / Cos 80% / Peu 10%");
