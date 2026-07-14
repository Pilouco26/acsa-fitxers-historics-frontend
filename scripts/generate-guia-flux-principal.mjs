/**
 * Genera la guia d'ús del flux principal (1 pàgina A4, català, visual).
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

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 28;

const C = {
  ink: "#1d1d1f",
  muted: "#6e6e73",
  soft: "#86868b",
  accent: "#007aff",
  accentDark: "#0056b3",
  surface: "#ffffff",
  panel: "#f5f5f7",
  border: "#d2d2d7",
  line: "#e8e8ed",
  success: "#248a3d",
  tipBg: "#eef5ff",
};

const STEPS = [
  {
    tab: "Escàner",
    verb: "Pujar",
    actions: ["Escanegeu en PDF", "Pugeu a la pestanya Escàner"],
    icon: "scan",
  },
  {
    tab: "Classificador",
    verb: "Processar",
    actions: ["Premeu «Processar documents»", "Espereu que acabi"],
    icon: "ai",
  },
  {
    tab: "Revisió",
    verb: "Validar",
    actions: ["Reviseu PDF, nom i resum", "Aproveu o elimineu"],
    icon: "check",
  },
  {
    tab: "Documents",
    verb: "Consultar",
    actions: ["Cerqueu i filtreu", "Obriu qualsevol fitxer"],
    icon: "folder",
  },
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function roundedRect(doc, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  doc.moveTo(x + rr, y);
  doc.lineTo(x + w - rr, y);
  doc.quadraticCurveTo(x + w, y, x + w, y + rr);
  doc.lineTo(x + w, y + h - rr);
  doc.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  doc.lineTo(x + rr, y + h);
  doc.quadraticCurveTo(x, y + h, x, y + h - rr);
  doc.lineTo(x, y + rr);
  doc.quadraticCurveTo(x, y, x + rr, y);
  doc.closePath();
}

function drawIcon(doc, kind, cx, cy, color) {
  doc.save();
  doc.strokeColor(color).fillColor(color).lineWidth(2).lineCap("round").lineJoin("round");

  if (kind === "scan") {
    const s = 11;
    doc.roundedRect(cx - s, cy - s * 0.75, s * 2, s * 1.5, 2).stroke();
    doc.moveTo(cx - s - 3, cy - 4).lineTo(cx - s - 3, cy - 8).lineTo(cx - s + 1, cy - 8).stroke();
    doc.moveTo(cx + s + 3, cy - 4).lineTo(cx + s + 3, cy - 8).lineTo(cx + s - 1, cy - 8).stroke();
    doc.moveTo(cx - s - 3, cy + 4).lineTo(cx - s - 3, cy + 8).lineTo(cx - s + 1, cy + 8).stroke();
    doc.moveTo(cx + s + 3, cy + 4).lineTo(cx + s + 3, cy + 8).lineTo(cx + s - 1, cy + 8).stroke();
  } else if (kind === "ai") {
    doc.circle(cx, cy, 3).fill(color);
    for (const [dx, dy] of [
      [0, -10],
      [0, 10],
      [-10, 0],
      [10, 0],
      [-7, -7],
      [7, -7],
      [-7, 7],
      [7, 7],
    ]) {
      doc.moveTo(cx + dx * 0.35, cy + dy * 0.35).lineTo(cx + dx, cy + dy).stroke();
    }
  } else if (kind === "check") {
    doc.circle(cx, cy, 11).stroke();
    doc
      .moveTo(cx - 5, cy)
      .lineTo(cx - 1, cy + 5)
      .lineTo(cx + 6, cy - 5)
      .stroke();
  } else if (kind === "folder") {
    doc
      .moveTo(cx - 12, cy - 4)
      .lineTo(cx - 12, cy - 8)
      .lineTo(cx - 4, cy - 8)
      .lineTo(cx - 1, cy - 4)
      .lineTo(cx + 12, cy - 4)
      .lineTo(cx + 12, cy + 8)
      .lineTo(cx - 12, cy + 8)
      .closePath()
      .stroke();
  }

  doc.restore();
}

function drawChevron(doc, x, y, color = C.accent) {
  doc.save();
  doc.strokeColor(color).lineWidth(2).lineCap("round").lineJoin("round");
  doc
    .moveTo(x, y - 5)
    .lineTo(x + 6, y)
    .lineTo(x, y + 5)
    .stroke();
  doc.restore();
}

function drawFlowBar(doc, x, y, w) {
  const labels = STEPS.map((s) => s.tab);
  const n = labels.length;
  const gap = 10;
  const segW = (w - gap * (n - 1)) / n;
  const h = 34;

  roundedRect(doc, x, y, w, h, 10);
  doc.fill(C.panel);

  labels.forEach((label, i) => {
    const sx = x + i * (segW + gap);
    const cx = sx + segW / 2;

    doc
      .font("Bold")
      .fontSize(8)
      .fillColor(C.accent)
      .text(String(i + 1), sx, y + 5, { width: segW, align: "center" });
    doc
      .font("Bold")
      .fontSize(9)
      .fillColor(C.ink)
      .text(label, sx, y + 17, { width: segW, align: "center" });

    if (i < n - 1) {
      drawChevron(doc, sx + segW + gap / 2 - 3, y + h / 2);
    }
  });

  return y + h;
}

function drawStepCard(doc, step, index, x, y, w, h) {
  const num = index + 1;

  roundedRect(doc, x, y, w, h, 14);
  doc.fillAndStroke(C.surface, C.border);

  // Accent bar on top
  doc.save();
  doc.rect(x, y, w, 5).fill(C.accent);
  doc.restore();

  const pad = 18;
  const iconY = y + 42;
  const iconBgR = 22;
  const iconCx = x + pad + iconBgR;

  doc.circle(iconCx, iconY, iconBgR).fill(C.tipBg);
  drawIcon(doc, step.icon, iconCx, iconY, C.accent);

  // Number badge
  const badgeR = 12;
  const badgeCx = x + w - pad - badgeR;
  const badgeCy = iconY;
  doc.circle(badgeCx, badgeCy, badgeR).fill(C.accent);
  doc
    .font("Bold")
    .fontSize(13)
    .fillColor("#ffffff")
    .text(String(num), badgeCx - badgeR, badgeCy - 6, {
      width: badgeR * 2,
      align: "center",
    });

  let ty = y + 78;
  doc
    .font("Bold")
    .fontSize(9)
    .fillColor(C.accent)
    .text(step.verb.toUpperCase(), x + pad, ty, { width: w - pad * 2 });
  ty += 16;

  doc
    .font("Bold")
    .fontSize(16)
    .fillColor(C.ink)
    .text(step.tab, x + pad, ty, { width: w - pad * 2 });
  ty += 28;

  // Divider
  doc
    .moveTo(x + pad, ty)
    .lineTo(x + w - pad, ty)
    .strokeColor(C.line)
    .lineWidth(1)
    .stroke();
  ty += 16;

  step.actions.forEach((action) => {
    doc.circle(x + pad + 4, ty + 6, 3).fill(C.accent);
    doc
      .font("Regular")
      .fontSize(11)
      .fillColor(C.ink)
      .text(action, x + pad + 14, ty, {
        width: w - pad * 2 - 14,
        lineGap: 2,
      });
    ty += 28;
  });

  if (index < STEPS.length - 1) {
    doc
      .font("Bold")
      .fontSize(10)
      .fillColor(C.accent)
      .text(`→ ${STEPS[index + 1].tab}`, x + pad, y + h - 28, {
        width: w - pad * 2,
      });
  } else {
    doc
      .font("Bold")
      .fontSize(10)
      .fillColor(C.success)
      .text("✓ Arxiu final", x + pad, y + h - 28, {
        width: w - pad * 2,
      });
  }
}

function drawTips(doc, x, y, w) {
  const h = 56;
  roundedRect(doc, x, y, w, h, 12);
  doc.fill(C.tipBg);

  doc
    .font("Bold")
    .fontSize(10)
    .fillColor(C.accentDark)
    .text("Consells ràpids", x + 16, y + 10, { width: w - 32 });

  const tips = [
    "Només PDF",
    "Sense fitxers nous → Pas 1",
    "Revisió buida → espereu el Pas 2",
  ];
  const tipW = (w - 32 - 16) / tips.length;
  tips.forEach((tip, i) => {
    const tx = x + 16 + i * (tipW + 8);
    doc.circle(tx + 4, y + 38, 2.5).fill(C.accent);
    doc
      .font("Regular")
      .fontSize(9)
      .fillColor(C.ink)
      .text(tip, tx + 12, y + 32, { width: tipW - 12 });
  });

  return y + h;
}

ensureDir(outDir);

const tmpFile = path.join(outDir, ".guia-flux-principal-acsa.tmp.pdf");

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 0, bottom: 0, left: 0, right: 0 },
  autoFirstPage: true,
});

doc.addPage = () => doc;

const stream = fs.createWriteStream(tmpFile);
doc.pipe(stream);
doc.registerFont("Regular", fontRegular);
doc.registerFont("Bold", fontBold);

// Soft page background wash
doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.panel);

// Header band
doc.rect(0, 0, PAGE_W, 118).fill(C.surface);
doc.rect(0, 118, PAGE_W, 3).fill(C.accent);

const contentX = MARGIN;
const contentW = PAGE_W - MARGIN * 2;

doc
  .font("Bold")
  .fontSize(20)
  .fillColor(C.ink)
  .text("ACSA — Fitxers històrics", contentX, 28, {
    width: contentW,
    align: "center",
  });
doc
  .font("Regular")
  .fontSize(12)
  .fillColor(C.muted)
  .text("Guia pas a pas del flux principal", contentX, 54, {
    width: contentW,
    align: "center",
  });

drawFlowBar(doc, contentX, 76, contentW);

// 2×2 cards filling most of the page
const gridTop = 140;
const gridBottom = PAGE_H - 110;
const gap = 14;
const cardW = (contentW - gap) / 2;
const cardH = (gridBottom - gridTop - gap) / 2;

const positions = [
  [contentX, gridTop],
  [contentX + cardW + gap, gridTop],
  [contentX, gridTop + cardH + gap],
  [contentX + cardW + gap, gridTop + cardH + gap],
];

STEPS.forEach((step, i) => {
  const [cx, cy] = positions[i];
  drawStepCard(doc, step, i, cx, cy, cardW, cardH);
});

// Horizontal arrow between top cards
{
  const midY = gridTop + cardH / 2;
  const ax = contentX + cardW + 2;
  doc.save();
  doc.strokeColor(C.accent).lineWidth(1.5).opacity(0.45);
  doc.moveTo(ax, midY).lineTo(ax + gap - 4, midY).stroke();
  doc.restore();
  drawChevron(doc, ax + gap - 8, midY, C.accent);
}

// Horizontal arrow between bottom cards
{
  const midY = gridTop + cardH + gap + cardH / 2;
  const ax = contentX + cardW + 2;
  doc.save();
  doc.strokeColor(C.accent).lineWidth(1.5).opacity(0.45);
  doc.moveTo(ax, midY).lineTo(ax + gap - 4, midY).stroke();
  doc.restore();
  drawChevron(doc, ax + gap - 8, midY, C.accent);
}

drawTips(doc, contentX, PAGE_H - 92, contentW);

doc
  .font("Regular")
  .fontSize(8)
  .fillColor(C.soft)
  .text("ACSA — Fitxers històrics · Guia pas a pas", contentX, PAGE_H - 28, {
    width: contentW,
    align: "center",
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
