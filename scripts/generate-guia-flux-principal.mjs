/**
 * Genera la guia d'ús del flux principal (1 pàgina A4, català, pas a pas).
 * Ús: node scripts/generate-guia-flux-principal.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs");
const outFile = path.join(outDir, "guia-flux-principal-acsa.pdf");
const fontRegular = path.join(
  root,
  "public/pdfjs/standard_fonts/LiberationSans-Regular.ttf",
);
const fontBold = path.join(
  root,
  "public/pdfjs/standard_fonts/LiberationSans-Bold.ttf",
);

const MARGIN = 36;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BADGE_R = 14;
const BADGE_X = MARGIN + BADGE_R + 4;
const TEXT_X = MARGIN + BADGE_R * 2 + 18;
const TEXT_W = PAGE_W - TEXT_X - MARGIN;
const BOTTOM = PAGE_H - 28;

const STEPS = [
  {
    tab: "Escàner",
    actions: [
      "Escanegeu i deseu el document com a PDF.",
      "Pugeu el fitxer a la pestanya Escàner.",
    ],
    next: "Classificador",
  },
  {
    tab: "Classificador",
    actions: [
      "Premeu «Processar documents».",
      "Espereu fins que acabi el procés.",
    ],
    next: "Revisió",
  },
  {
    tab: "Revisió",
    actions: [
      "Reviseu el PDF, el nom i el resum.",
      "Premeu «Aprovar» o «Eliminar».",
    ],
    next: "Documents",
  },
  {
    tab: "Documents",
    actions: [
      "Consulteu els documents ja aprovats.",
      "Cerqueu, filtreu i obriu qualsevol fitxer.",
    ],
    next: null,
  },
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function box(doc, text, x, y, w, opts = {}) {
  const { bold = false, size = 10, color = "#1a1a1a", align = "left", height = 40 } = opts;
  doc.font(bold ? "Bold" : "Regular").fontSize(size).fillColor(color);
  doc.text(text, x, y, { width: w, height, align, lineGap: 1, ellipsis: true });
  return y + height;
}

function drawBadge(doc, cx, cy, num) {
  doc.circle(cx, cy, BADGE_R).fillAndStroke("#2c5282", "#1a365d");
  doc
    .font("Bold")
    .fontSize(13)
    .fillColor("#ffffff")
    .text(String(num), cx - BADGE_R, cy - 7, { width: BADGE_R * 2, align: "center" });
}

function drawArrow(doc, x, y1, y2) {
  doc.save();
  doc.strokeColor("#a0aec0").lineWidth(1.2);
  doc.moveTo(x, y1).lineTo(x, y2 - 7).stroke();
  doc
    .moveTo(x, y2 - 7)
    .lineTo(x - 5, y2 - 14)
    .lineTo(x + 5, y2 - 14)
    .lineTo(x, y2 - 7)
    .fill("#a0aec0");
  doc.restore();
}

function drawStep(doc, step, index, y) {
  const num = index + 1;
  const badgeY = y + BADGE_R + 4;

  drawBadge(doc, BADGE_X, badgeY, num);

  let ty = y + 2;
  ty = box(doc, `Pas ${num} — ${step.tab}`, TEXT_X, ty, TEXT_W, {
    bold: true,
    size: 11.5,
    color: "#1a365d",
    height: 16,
  });

  step.actions.forEach((action, i) => {
    ty = box(doc, `${i + 1}. ${action}`, TEXT_X, ty, TEXT_W, {
      size: 10,
      height: 18,
    });
  });

  if (step.next) {
    ty = box(doc, `→ Següent: ${step.next}`, TEXT_X, ty + 2, TEXT_W, {
      bold: true,
      size: 9.5,
      color: "#2c5282",
      height: 14,
    });
  }

  const blockBottom = ty + 4;

  if (index < STEPS.length - 1) {
    drawArrow(doc, BADGE_X, badgeY + BADGE_R + 4, blockBottom + 12);
    return blockBottom + 18;
  }

  return blockBottom;
}

ensureDir(outDir);

const tmpFile = path.join(outDir, ".guia-flux-principal-acsa.tmp.pdf");

const doc = new PDFDocument({
  size: "A4",
  margins: { top: MARGIN, bottom: 26, left: MARGIN, right: MARGIN },
  autoFirstPage: true,
  lineGap: 0,
});

doc.addPage = () => doc;

const stream = fs.createWriteStream(tmpFile);
doc.pipe(stream);
doc.registerFont("Regular", fontRegular);
doc.registerFont("Bold", fontBold);

let y = MARGIN;

y = box(doc, "ACSA — Fitxers històrics", MARGIN, y, CONTENT_W, {
  bold: true,
  size: 17,
  color: "#1a365d",
  align: "center",
  height: 20,
});
y = box(doc, "Guia pas a pas", MARGIN, y, CONTENT_W, {
  bold: true,
  size: 13,
  color: "#2d3748",
  align: "center",
  height: 18,
});
y = box(doc, "4 passos del menú «Flux principal»", MARGIN, y, CONTENT_W, {
  size: 10,
  color: "#4a5568",
  align: "center",
  height: 16,
});
y += 10;

for (let i = 0; i < STEPS.length; i++) {
  y = drawStep(doc, STEPS[i], i, y);
}

y += 8;
box(
  doc,
  "Només PDF · Sense fitxers nous → Pas 1 · Revisió buida → espereu el Pas 2",
  MARGIN,
  y,
  CONTENT_W,
  { size: 9, color: "#4a5568", align: "center", height: 14 },
);

box(doc, "ACSA — Fitxers històrics", MARGIN, BOTTOM - 6, CONTENT_W, {
  size: 8,
  color: "#718096",
  align: "center",
  height: 12,
});

doc.end();

stream.on("finish", () => {
  try {
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    fs.renameSync(tmpFile, outFile);
    console.log(`PDF generat: ${outFile}`);
  } catch {
    const fallback = path.join(outDir, "guia-flux-principal-acsa-nou.pdf");
    fs.renameSync(tmpFile, fallback);
    console.log(`PDF generat (fitxer original bloquejat): ${fallback}`);
  }
});

stream.on("error", (err) => {
  console.error("Error generant el PDF:", err.message);
});
