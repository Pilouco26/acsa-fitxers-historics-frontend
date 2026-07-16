import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const css = readFileSync("src/index.css", "utf8");
const html = `<!doctype html>
<html><head><style>${css}</style>
<style>
html,body{margin:0;height:100%}
.wrap{height:100vh;display:flex;padding:1rem;box-sizing:border-box}
.pdf-ocr-paper{width:28rem;height:100%}
</style></head>
<body><div class="wrap"><article class="pdf-ocr-paper pdf-ocr-paper--translation pdf-ocr-paper--plain-view backend-translate-page--structured">
<div class="backend-translate-letter" id="letter" data-letter-layout="header-body-footer">
<section class="backend-translate-letter-section backend-translate-letter-section--meta" data-section="header">
  <h5 class="backend-translate-letter-label">Capçalera</h5>
  <div class="pdf-ocr-page-plain"><p>header</p></div>
</section>
<section class="backend-translate-letter-section backend-translate-letter-section--primary" data-section="body">
  <h5 class="backend-translate-letter-label">Cos</h5>
  <div class="pdf-ocr-page-plain"><p>body</p></div>
</section>
<section class="backend-translate-letter-section backend-translate-letter-section--meta" data-section="footer">
  <h5 class="backend-translate-letter-label">Peu</h5>
  <div class="pdf-ocr-page-plain"><p>footer</p></div>
</section>
</div></article></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
await page.setContent(html, { waitUntil: "load" });
const m = await page.evaluate(() => {
  const letter = document.getElementById("letter");
  const total = letter.getBoundingClientRect().height;
  const pct = (sel) =>
    (document.querySelector(sel).getBoundingClientRect().height / total) * 100;
  return {
    h: pct('[data-section="header"]'),
    b: pct('[data-section="body"]'),
    f: pct('[data-section="footer"]'),
  };
});
await page.screenshot({ path: "scripts/letter-section-ratio.png", fullPage: true });
await browser.close();

console.log(`Capçalera: ${m.h.toFixed(1)}%`);
console.log(`Cos:       ${m.b.toFixed(1)}%`);
console.log(`Peu:       ${m.f.toFixed(1)}%`);

if (Math.abs(m.b - 80) > 2 || Math.abs(m.h - 10) > 2 || Math.abs(m.f - 10) > 2) {
  process.exit(1);
}
console.log("OK");
