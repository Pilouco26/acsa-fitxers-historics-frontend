/**
 * Genera la guia d'ús del flux principal actual (1 pàgina A4, català, visual).
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
const MARGIN = 24;

const C = {
  ink: "#1d1d1f",
  muted: "#6e6e73",
  soft: "#86868b",
  accent: "#007aff",
  accentDark: "#0056b3",
  surface: "#ffffff",
  panel: "#f0f2f5",
  border: "#d2d2d7",
  line: "#e5e5ea",
  success: "#248a3d",
  tipBg: "#e8f1ff",
  iconBg: "#e8f1ff",
};

const STEPS = [
  {
    tab: "Entrar",
    verb: "Accedir",
    actions: ["Inicieu sessió amb usuari i contrasenya", "Entrareu al flux principal"],
    icon: "login",
  },
  {
    tab: "Pujar",
    verb: "Carregar",
    actions: ["Trieu documents o fotos / vídeos", "Pugeu fitxers solts o una carpeta"],
    icon: "upload",
  },
  {
    tab: "Classificador",
    verb: "Analitzar",
    actions: ["Processa documents o mitjans", "Espereu el progrés i l'assignació"],
    icon: "ai",
  },
  {
    tab: "Revisió",
    verb: "Validar",
    actions: ["Reviseu nom, resum i vista prèvia", "Aproveu, descarteu o reintenteu"],
    icon: "check",
  },
  {
    tab: "Classificats",
    verb: "Consultar",
    actions: ["Obriu carpetes, documents i catàleg de mitjans", "Cerqueu, filtreu i descarregueu"],
    icon: "folder",
  },
  {
    tab: "Notes",
    verb: "Organitzar",
    actions: ["Creeu post-its lliures sobre el tauler", "Arrossegueu, feu zoom i reordeneu"],
    icon: "note",
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
  doc.strokeColor(color).fillColor(color).lineWidth(2.2).lineCap("round").lineJoin("round");

  if (kind === "scan") {
    roundedRect(doc, cx - 9, cy - 11, 18, 22, 2);
    doc.stroke();
    doc.moveTo(cx - 14, cy - 7).lineTo(cx - 14, cy - 14).lineTo(cx - 7, cy - 14).stroke();
    doc.moveTo(cx + 14, cy - 7).lineTo(cx + 14, cy - 14).lineTo(cx + 7, cy - 14).stroke();
    doc.moveTo(cx - 14, cy + 7).lineTo(cx - 14, cy + 14).lineTo(cx - 7, cy + 14).stroke();
    doc.moveTo(cx + 14, cy + 7).lineTo(cx + 14, cy + 14).lineTo(cx + 7, cy + 14).stroke();
    doc.moveTo(cx - 6, cy).lineTo(cx + 6, cy).stroke();
  } else if (kind === "login") {
    roundedRect(doc, cx - 12, cy - 10, 18, 20, 2);
    doc.stroke();
    doc.moveTo(cx - 1, cy).lineTo(cx + 12, cy).stroke();
    doc.moveTo(cx + 7, cy - 5).lineTo(cx + 12, cy).lineTo(cx + 7, cy + 5).stroke();
  } else if (kind === "upload") {
    roundedRect(doc, cx - 12, cy - 6, 24, 16, 3);
    doc.stroke();
    doc.moveTo(cx, cy - 13).lineTo(cx, cy + 1).stroke();
    doc.moveTo(cx - 5, cy - 8).lineTo(cx, cy - 13).lineTo(cx + 5, cy - 8).stroke();
  } else if (kind === "ai") {
    // Spark / burst
    doc.circle(cx, cy, 3.5).fill(color);
    const rays = 8;
    for (let i = 0; i < rays; i++) {
      const a = (Math.PI * 2 * i) / rays - Math.PI / 2;
      const inner = 6;
      const outer = i % 2 === 0 ? 13 : 10;
      doc
        .moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
        .lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer)
        .stroke();
    }
  } else if (kind === "check") {
    doc.circle(cx, cy, 13).stroke();
    doc
      .moveTo(cx - 6, cy + 1)
      .lineTo(cx - 1.5, cy + 6)
      .lineTo(cx + 7, cy - 5)
      .stroke();
  } else if (kind === "folder") {
    doc
      .moveTo(cx - 13, cy - 2)
      .lineTo(cx - 13, cy - 8)
      .lineTo(cx - 3, cy - 8)
      .lineTo(cx + 1, cy - 3)
      .lineTo(cx + 13, cy - 3)
      .lineTo(cx + 13, cy + 9)
      .lineTo(cx - 13, cy + 9)
      .closePath()
      .stroke();
  } else if (kind === "note") {
    roundedRect(doc, cx - 11, cy - 11, 22, 22, 3);
    doc.stroke();
    doc.moveTo(cx - 6, cy - 3).lineTo(cx + 6, cy - 3).stroke();
    doc.moveTo(cx - 6, cy + 2).lineTo(cx + 4, cy + 2).stroke();
    doc.moveTo(cx - 6, cy + 7).lineTo(cx + 2, cy + 7).stroke();
  }

  doc.restore();
}

function drawFlowBar(doc, x, y, w) {
  const h = 40;
  const n = STEPS.length;
  const pad = 8;
  const innerW = w - pad * 2;
  const cellW = innerW / n;

  roundedRect(doc, x, y, w, h, 12);
  doc.fill(C.panel);

  STEPS.forEach((step, i) => {
    const cx = x + pad + cellW * i + cellW / 2;
    doc.circle(cx - 28, y + h / 2, 9).fill(C.accent);
    doc
      .font("Bold")
      .fontSize(10)
      .fillColor("#ffffff")
      .text(String(i + 1), cx - 28 - 9, y + h / 2 - 5, { width: 18, align: "center" });
    doc
      .font("Bold")
      .fontSize(10)
      .fillColor(C.ink)
      .text(step.tab, cx - 14, y + h / 2 - 5, { width: cellW / 2 + 20, align: "left" });

    if (i < n - 1) {
      const ax = x + pad + cellW * (i + 1) - 6;
      doc.save();
      doc.strokeColor(C.accent).lineWidth(1.8).lineCap("round").opacity(0.55);
      doc
        .moveTo(ax - 4, y + h / 2 - 4)
        .lineTo(ax + 2, y + h / 2)
        .lineTo(ax - 4, y + h / 2 + 4)
        .stroke();
      doc.restore();
    }
  });

  return y + h;
}

function drawStepCard(doc, step, index, x, y, w, h) {
  const num = index + 1;
  const pad = 22;

  // Shadow
  roundedRect(doc, x + 1.5, y + 2.5, w, h, 16);
  doc.fill("#d8d8dc");

  roundedRect(doc, x, y, w, h, 16);
  doc.fillAndStroke(C.surface, C.border);

  // Top accent strip
  doc.save();
  doc.rect(x + 1, y + 1, w - 2, 6).fill(C.accent);
  // Cover bottom of strip with rounded feel via white overlay isn't needed
  doc.restore();

  // Icon circle — large, centered-ish at top
  const iconCy = y + 58;
  const iconCx = x + w / 2 - 28;
  const iconR = 28;
  doc.circle(iconCx, iconCy, iconR).fill(C.iconBg);
  drawIcon(doc, step.icon, iconCx, iconCy, C.accent);

  // Number badge — opposite side
  const badgeR = 16;
  const badgeCx = x + w / 2 + 36;
  doc.circle(badgeCx, iconCy, badgeR).fill(C.accent);
  doc
    .font("Bold")
    .fontSize(16)
    .fillColor("#ffffff")
    .text(String(num), badgeCx - badgeR, iconCy - 7, {
      width: badgeR * 2,
      align: "center",
    });

  // Title block
  const titleY = y + 98;
  doc
    .font("Bold")
    .fontSize(10)
    .fillColor(C.accent)
    .text(step.verb.toUpperCase(), x + pad, titleY, {
      width: w - pad * 2,
      align: "center",
    });

  doc
    .font("Bold")
    .fontSize(20)
    .fillColor(C.ink)
    .text(step.tab, x + pad, titleY + 16, {
      width: w - pad * 2,
      align: "center",
    });

  // Divider
  const divY = titleY + 48;
  const divW = 48;
  doc
    .moveTo(x + (w - divW) / 2, divY)
    .lineTo(x + (w + divW) / 2, divY)
    .strokeColor(C.line)
    .lineWidth(2)
    .stroke();

  // Actions + footer evenly spaced in the lower half of the card
  const zoneTop = divY + 20;
  const zoneBottom = y + h - 20;
  const slots = step.actions.length + 1;
  const slotH = (zoneBottom - zoneTop) / slots;

  step.actions.forEach((action, i) => {
    const ty = zoneTop + slotH * i + slotH / 2 - 8;
    const bulletX = x + pad + 10;
    doc.circle(bulletX, ty + 7, 3.5).fill(C.accent);
    doc
      .font("Regular")
      .fontSize(12.5)
      .fillColor(C.ink)
      .text(action, bulletX + 14, ty, {
        width: w - pad * 2 - 24,
        align: "left",
      });
  });

  const footerY = zoneTop + slotH * step.actions.length + slotH / 2 - 8;
  if (index < STEPS.length - 1) {
    doc
      .font("Bold")
      .fontSize(11)
      .fillColor(C.accent)
      .text(`→  ${STEPS[index + 1].tab}`, x + pad, footerY, {
        width: w - pad * 2,
        align: "center",
      });
  } else {
    doc
      .font("Bold")
      .fontSize(11)
      .fillColor(C.success)
      .text("Arxiu final", x + pad, footerY, {
        width: w - pad * 2,
        align: "center",
      });
  }
}

function drawTips(doc, x, y, w) {
  const h = 64;
  roundedRect(doc, x, y, w, h, 14);
  doc.fill(C.tipBg);

  doc
    .font("Bold")
    .fontSize(11)
    .fillColor(C.accentDark)
    .text("Consells ràpids", x + 18, y + 12, { width: w - 36 });

  const tips = [
    "Documents: PDF",
    "Mitjans: JPG/PNG/WebP/MP4/MOV/WebM",
    "Sense pendents: torneu a «Pujar» o «Classificador»",
  ];
  const tipW = (w - 36) / tips.length;
  tips.forEach((tip, i) => {
    const tx = x + 18 + i * tipW;
    doc.circle(tx + 4, y + 42, 3).fill(C.accent);
    doc
      .font("Regular")
      .fontSize(10)
      .fillColor(C.ink)
      .text(tip, tx + 12, y + 36, { width: tipW - 16 });
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

// Page background
doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.panel);

// Header
doc.rect(0, 0, PAGE_W, 108).fill(C.surface);
doc.rect(0, 108, PAGE_W, 4).fill(C.accent);

const contentX = MARGIN;
const contentW = PAGE_W - MARGIN * 2;

doc
  .font("Bold")
  .fontSize(22)
  .fillColor(C.ink)
  .text("ACSA — Fitxers històrics", contentX, 20, {
    width: contentW,
    align: "center",
  });
doc
  .font("Regular")
  .fontSize(11.5)
  .fillColor(C.muted)
  .text("Guia visual del flux principal actual", contentX, 48, {
    width: contentW,
    align: "center",
  });

drawFlowBar(doc, contentX, 68, contentW);

// 3×2 grid — fills the page between header and tips
const gridTop = 128;
const gridBottom = PAGE_H - 108;
const gap = 16;
const columns = 3;
const rows = 2;
const cardW = (contentW - gap * (columns - 1)) / columns;
const cardH = (gridBottom - gridTop - gap * (rows - 1)) / rows;

const positions = STEPS.map((_, index) => {
  const col = index % columns;
  const row = Math.floor(index / columns);
  return [contentX + col * (cardW + gap), gridTop + row * (cardH + gap)];
});

STEPS.forEach((step, i) => {
  const [cx, cy] = positions[i];
  drawStepCard(doc, step, i, cx, cy, cardW, cardH);
});

drawTips(doc, contentX, PAGE_H - 92, contentW);

doc
  .font("Regular")
  .fontSize(8)
  .fillColor(C.soft)
  .text("ACSA — Fitxers històrics · Guia pas a pas", contentX, PAGE_H - 22, {
    width: contentW,
    align: "center",
  });

doc.end();

stream.on("finish", () => {
  const candidates = [
    outFile,
    path.join(outDir, "guia-flux-principal-acsa-nou.pdf"),
    path.join(outDir, "guia-flux-principal-acsa-v2.pdf"),
  ];
  for (const dest of candidates) {
    try {
      fs.copyFileSync(tmpFile, dest);
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
      console.log(`PDF generat: ${dest}`);
      return;
    } catch {
      /* try next */
    }
  }
  console.error(`No s'ha pogut desar el PDF. Fitxer temporal: ${tmpFile}`);
});

stream.on("error", (err) => {
  console.error("Error generant el PDF:", err.message);
});
