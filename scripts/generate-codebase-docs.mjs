/**
 * Genera la documentació completa del codebase ACSA Frontend en PDF (català).
 * Estructura alineada amb DOCUMENTACIO_COMPLETA.pdf del backend DocPipe.
 * Ús: node scripts/generate-codebase-docs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs");
const outFile = path.join(outDir, "documentacio-codebase-acsa.pdf");
const fontRegular = path.join(root, "public/pdfjs/standard_fonts/LiberationSans-Regular.ttf");
const fontBold = path.join(root, "public/pdfjs/standard_fonts/LiberationSans-Bold.ttf");
const fontItalic = path.join(root, "public/pdfjs/standard_fonts/LiberationSans-Italic.ttf");

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const VERSION = pkg.version ?? "0.0.0";
const GENERATED_DATE = new Date().toLocaleDateString("ca-ES", {
  year: "numeric",
  month: "long",
});

const MARGIN = 50;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 35;
const BODY_BOTTOM = FOOTER_Y - 15;

const COLORS = {
  title: "#1a365d",
  section: "#2c5282",
  subsection: "#2d3748",
  body: "#1a1a1a",
  muted: "#4a5568",
  code: "#2d3748",
  panel: "#f7fafc",
  border: "#e2e8f0",
};

class DocWriter {
  constructor(doc) {
    this.doc = doc;
    this.y = MARGIN;
    this.pageNum = 1;
    this.toc = [];
    this.inToc = false;
    this.footerTitle = "ACSA Frontend — Documentació tècnica";
  }

  newPage() {
    this.doc.addPage();
    this.pageNum++;
    this.y = MARGIN;
    this.drawFooter();
  }

  ensureSpace(h) {
    if (this.y + h > BODY_BOTTOM) this.newPage();
  }

  drawFooter() {
    this.doc
      .font("Regular")
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(`${this.footerTitle} · Pàgina ${this.pageNum}`, MARGIN, FOOTER_Y, {
        width: CONTENT_W,
        align: "center",
      });
  }

  title(text) {
    this.doc.font("Bold").fontSize(22).fillColor(COLORS.title);
    this.doc.text(text, MARGIN, this.y, { width: CONTENT_W, align: "center" });
    this.y += 32;
  }

  subtitle(text) {
    this.doc.font("Regular").fontSize(11).fillColor(COLORS.muted);
    this.doc.text(text, MARGIN, this.y, { width: CONTENT_W, align: "center" });
    this.y += 18;
  }

  section(num, title, anchor) {
    this.ensureSpace(40);
    if (!this.inToc) {
      this.toc.push({ num, title, page: this.pageNum, anchor });
    }
    this.doc.font("Bold").fontSize(14).fillColor(COLORS.section);
    this.doc.text(`${num}. ${title}`, MARGIN, this.y, { width: CONTENT_W });
    this.y += 22;
  }

  subsection(title) {
    this.ensureSpace(28);
    this.doc.font("Bold").fontSize(11).fillColor(COLORS.subsection);
    this.doc.text(title, MARGIN, this.y, { width: CONTENT_W });
    this.y += 16;
  }

  paragraph(text, opts = {}) {
    const size = opts.size ?? 9.5;
    const indent = opts.indent ?? 0;
    this.doc.font(opts.italic ? "Italic" : "Regular").fontSize(size).fillColor(opts.color ?? COLORS.body);
    const h = this.doc.heightOfString(text, { width: CONTENT_W - indent, lineGap: 2 });
    this.ensureSpace(h + 6);
    this.doc.text(text, MARGIN + indent, this.y, { width: CONTENT_W - indent, lineGap: 2 });
    this.y += h + 6;
  }

  field(label, value) {
    this.ensureSpace(16);
    this.doc.font("Bold").fontSize(9.5).fillColor(COLORS.subsection);
    this.doc.text(`${label}: `, MARGIN, this.y, { continued: true, width: CONTENT_W });
    this.doc.font("Regular").fillColor(COLORS.body);
    this.doc.text(value, { width: CONTENT_W, lineGap: 2 });
    this.y += 4;
  }

  bullet(items) {
    for (const item of items) {
      const text = `• ${item}`;
      const h = this.doc.heightOfString(text, { width: CONTENT_W - 12, lineGap: 1 });
      this.ensureSpace(h + 3);
      this.doc.font("Regular").fontSize(9.5).fillColor(COLORS.body);
      this.doc.text(text, MARGIN + 8, this.y, { width: CONTENT_W - 12, lineGap: 1 });
      this.y += h + 3;
    }
    this.y += 4;
  }

  codeBlock(text) {
    this.doc.font("Regular").fontSize(8).fillColor(COLORS.code);
    const h = this.doc.heightOfString(text, { width: CONTENT_W - 16, lineGap: 0 });
    this.ensureSpace(h + 14);
    const boxY = this.y;
    this.doc.rect(MARGIN, boxY, CONTENT_W, h + 10).fillAndStroke(COLORS.panel, COLORS.border);
    this.doc.fillColor(COLORS.code).text(text, MARGIN + 8, boxY + 5, {
      width: CONTENT_W - 16,
      lineGap: 0,
    });
    this.y = boxY + h + 14;
  }

  diagram(text) {
    this.codeBlock(text);
  }

  table(headers, rows, opts = {}) {
    const colWidths = opts.colWidths ?? headers.map(() => CONTENT_W / headers.length);
    const rowH = opts.rowH ?? 14;
    const fontSize = opts.fontSize ?? 8;
    this.ensureSpace(rowH * (rows.length + 2));
    let x = MARGIN;
    this.doc.font("Bold").fontSize(fontSize).fillColor(COLORS.subsection);
    for (let i = 0; i < headers.length; i++) {
      this.doc.text(headers[i], x + 2, this.y, { width: colWidths[i] - 4, lineGap: 0 });
      x += colWidths[i];
    }
    this.y += rowH;
    this.doc.font("Regular").fontSize(fontSize).fillColor(COLORS.body);
    for (const row of rows) {
      x = MARGIN;
      let maxH = rowH;
      for (let i = 0; i < row.length; i++) {
        const cellH = this.doc.heightOfString(String(row[i]), {
          width: colWidths[i] - 4,
          lineGap: 0,
        });
        maxH = Math.max(maxH, cellH + 4);
      }
      if (this.y + maxH > BODY_BOTTOM) this.newPage();
      x = MARGIN;
      for (let i = 0; i < row.length; i++) {
        this.doc.text(String(row[i]), x + 2, this.y, { width: colWidths[i] - 4, lineGap: 0 });
        x += colWidths[i];
      }
      this.y += maxH;
    }
    this.y += 8;
  }

  feature({ id, title, purpose, architecture, flow, components, rules, errors, edgeCases, seeAlso }) {
    this.subsection(`${id} ${title}`);
    if (purpose) this.field("Propòsit", purpose);
    if (architecture) this.field("Arquitectura", architecture);
    if (flow) this.field("Flux d'execució", flow);
    if (components) this.field("Components", components);
    if (rules) {
      this.paragraph("Regles de negoci:", { size: 9.5 });
      this.bullet(rules);
    }
    if (errors) this.field("Errors", errors);
    if (edgeCases) this.field("Casos límit", edgeCases);
    if (seeAlso) {
      this.paragraph(`Veure també: ${seeAlso}`, { italic: true, color: COLORS.muted, size: 8.5 });
    }
    this.spacer(4);
  }

  pitfall({ id, title, why, symptoms, detection, solution, prevention, files }) {
    this.subsection(`${id} ${title}`);
    if (why) this.field("Per què passa", why);
    if (symptoms) this.field("Símptomes", symptoms);
    if (detection) this.field("Detecció", detection);
    if (solution) this.field("Solució", solution);
    if (prevention) this.field("Prevenció", prevention);
    if (files) this.field("Fitxers", files);
    this.spacer(4);
  }

  spacer(h = 10) {
    this.y += h;
  }
}

function buildContent(w) {
  // --- COVER ---
  w.title("ACSA — Fitxers històrics");
  w.subtitle("Documentació tècnica del frontend");
  w.subtitle(`Versió ${VERSION} · ${GENERATED_DATE}`);
  w.subtitle("Idioma: català");
  w.spacer(8);
  w.paragraph(
    "Àmbit: font única de veritat per a desenvolupadors, revisors, DevOps i mantenidors del projecte acsa-frontend.",
    { italic: true, color: COLORS.muted },
  );
  w.spacer(6);
  w.paragraph(
    "Nota sobre incertesa: On la documentació indica «(inferit)», la informació s'ha deduït del codi però no està explícitament documentada en un altre lloc. Les seccions marcades amb «(assumpció)» reflecteixen decisions raonables però no confirmades per l'equip de producte.",
    { italic: true, color: COLORS.muted, size: 9 },
  );
  w.spacer(6);
  w.paragraph(
    "El backend API (DocPipe / Automatització/backend) resideix en un repositori separat. Aquest document cobreix exclusivament la capa d'interfície React.",
    { italic: true, color: COLORS.muted },
  );
  w.newPage();

  const tocStartPage = w.pageNum;
  w.section("0", "Taula de continguts", "toc");
  w.paragraph("(La taula de continguts es genera al final del document.)", { italic: true });
  w.newPage();

  // --- 1. EXECUTIVE SUMMARY ---
  w.section("1", "Resum executiu", "s1");
  w.subsection("Propòsit de l'aplicació");
  w.paragraph(
    "ACSA Frontend és una aplicació web d'una sola pàgina (SPA) per digitalitzar, classificar amb IA, revisar humànement i arxivar documents històrics de l'organització ACSA. El sistema complementa el pipeline DocPipe (Python/FastAPI) amb una interfície operativa per a operadors i administradors.",
  );
  w.paragraph(
    "Exemple de nom proposat pel backend: 1984.03.15 - BOSCH SA - CARTA.pdf",
    { italic: true, color: COLORS.muted },
  );
  w.subsection("Domini de negoci");
  w.bullet([
    "Gestió del cicle de vida de documents històrics en PDF (~1.300 fitxers SETDATA, 1966–1997)",
    "Classificació automàtica mitjançant OCR i Google Gemini (al backend)",
    "Revisió humana abans de l'arxivament definitiu",
    "Detecció de duplicats i comparació de similitud",
    "Processament de correus .eml com a font documental",
    "Catàleg de mitjans personals/empresa (fotos i vídeos)",
    "Traducció de documents amb preservació de layout (Gemini + Google Translate al backend)",
    "Segregació per mode d'usuari: EMPRESA (arxiu comercial) vs PERSONAL (arxiu familiar)",
  ]);
  w.subsection("Usuaris previstos");
  w.table(
    ["Rol", "Ús"],
    [
      ["Admin", "Configuració, anàlisi batch, edicions al disc, correus, recuperació"],
      ["Usuari normal", "Pujada, classificació, revisió, aprovació i consulta de l'arxiu"],
    ],
    { colWidths: [80, CONTENT_W - 80] },
  );
  w.subsection("Capacitats principals");
  w.bullet([
    "Autenticació JWT (POST /auth/login) amb modes EMPRESA / PERSONAL",
    "Flux principal: Pujar → Classificador → Revisió → Classificats",
    "Eines: Comparador, Configuració, Notes (post-its al canvas)",
    "Mitjans: pujada, anàlisi, revisió, catàleg de fotos/vídeos",
    "Traducció de documents aprovats (text pla o layout preservat)",
    "Administració: Anàlisi batch, Edicions, Correus, Recuperació de documents esborrats",
  ]);
  w.subsection("Stack tecnològic");
  w.table(
    ["Capa", "Tecnologia"],
    [
      ["UI", "React 18.3 + TypeScript 5.6"],
      ["Build", "Vite 5.4"],
      ["Routing", "react-router-dom 6.28"],
      ["Estat servidor", "@tanstack/react-query 5.60"],
      ["Autenticació", "JWT Bearer (localStorage)"],
      ["Notificacions", "react-hot-toast"],
      ["PDF", "pdfjs-dist (actius a public/pdfjs/)"],
      ["OCR client", "tesseract.js (auxiliar per traducció local)"],
      ["Producció", "nginx Alpine + TLS auto-signat (Docker multi-stage)"],
    ],
  );
  w.subsection("Arquitectura d'alt nivell");
  w.paragraph(
    "El navegador executa la SPA compilada. Les peticions API passen per /api (proxy Vite en dev, nginx en producció) cap al backend DocPipe (FastAPI) al port 8000. L'autenticació es fa amb JWT Bearer (Authorization header), no amb sessions de servidor ni cookies.",
  );
  w.subsection("Integracions externes");
  w.bullet([
    "Backend DocPipe API (REST JSON amb envelope {status, message, data})",
    "Google Gemini i Google Cloud Translation (configurats al backend)",
    "Sistema de fitxers local/xarxa (carpetes d'entrada i sortida via backend)",
  ]);
  w.subsection("Model de desplegament");
  w.bullet([
    "Desenvolupament: npm run dev (port 5173) amb proxy a localhost:8000",
    "Docker: imatge nginx servint dist/ + entrypoint que injecta config.js i TLS",
    "docker-compose: servei web a ports 8080 (HTTP) i 8443 (HTTPS), xarxa externa acsa",
  ]);
  w.subsection("Diagrama d'arquitectura del sistema");
  w.diagram(
    `[Navegador SPA]
      |  HTTPS/HTTP
      v
[nginx :80/:443] -- /api --> [Backend DocPipe :8000]
      |                           |
      |-- config.js               |-- OCR + Gemini + JWT
      |-- assets estàtics         |-- SQLite + filesystem
      v
[React + React Query + AuthContext]`,
  );

  // --- 2. ARCHITECTURE ---
  w.newPage();
  w.section("2", "Visió general de l'arquitectura", "s2");
  w.subsection("Arquitectura per capes");
  w.table(
    ["Capa", "Ubicació", "Responsabilitat"],
    [
      ["Presentació", "src/pages/, src/components/", "Pantalles per capacitat de negoci"],
      ["Routing", "App.tsx, PersistentPages.tsx", "Rutes, guards d'autenticació, keep-alive"],
      ["Estat global", "src/contexts/", "AuthContext, ClassificadorJobContext"],
      ["Estat servidor", "React Query", "Cache, mutations, invalidació"],
      ["Accés a dades", "src/api/client.ts", "HTTP, envelope, JWT, toasts"],
      ["Tipus", "src/api/types.ts", "Esquema sincronitzat amb backend/schemas"],
      ["Configuració", "src/config.ts, public/config.js", "API URL runtime, tokens localStorage"],
      ["Utilitats", "src/utils/, src/hooks/, src/constants/", "OCR, filtres, layout, polling"],
    ],
    { colWidths: [70, 150, CONTENT_W - 220], fontSize: 7.5 },
  );
  w.subsection("Límits de domini");
  w.bullet([
    "1. Autenticació — login JWT, claims type (EMPRESA/PERSONAL)",
    "2. Ingesta — pujada PDF i mitjans a safates _PENDENTS",
    "3. Anàlisi — jobs asíncrons amb polling (PDF, email, mitjans)",
    "4. Revisió — estat revisio, edició de camps, aprovació",
    "5. Arxiu — consulta, filtres, moviment a carpetes",
    "6. Mitjans — catàleg, routing, reproducció de vídeo",
    "7. Traducció — overlay layout o text pla via backend",
    "8. Notes — post-its persistents per usuari",
    "9. Configuració — settings via API",
  ]);
  w.subsection("Cicle de vida d'una petició");
  w.diagram(
    `Usuari → Component React → React Query / Mutation
         → client.ts (buildHeaders + Bearer JWT + fetch)
         → /api (proxy nginx/Vite)
         → Backend FastAPI
         → JSON { status, data } o cos directe (fitxers)
         → unwrapEnvelope → actualització UI + toast
         → 401 → clearSessionAndRedirectToLogin()`,
  );
  w.subsection("Processament en segon pla");
  w.paragraph(
    "Els treballs d'anàlisi (jobs) s'executen al backend. El frontend fa polling cada 2s via useJobPolling fins a estat terminal (completed/failed/cancelled). Després de completar l'anàlisi de documents, ClassificadorJobContext dispara automàticament assignDocuments(). Per mitjans, en compleció es crida guessMediaRoute/routeMedia per cada fitxer processat.",
  );
  w.subsection("Keep-alive de pàgines");
  w.paragraph(
    "PersistentPages manté les pàgines visitades muntades (ocultes) per preservar l'estat local de la UI (filtres, scroll, selecció) entre navegacions. Les pàgines es muntent lazy al primer accés.",
  );
  w.subsection("Flux del classificador");
  w.diagram(
    `ClassificadorPage / ClassificadorJobContext.startAnalyze()
  → POST /jobs/analyze (source=inbox) o POST /jobs/media-analyze
  → polling GET /jobs?id={id}
  → status=completed
  → POST /assign (documents) o guessMediaRoute + routeMedia (mitjans)
  → registres amb status=revisio`,
  );
  w.subsection("Graf de dependències de mòduls");
  w.diagram(
    `main.tsx → App.tsx → AuthProvider → AppRoutes
App.tsx → ClassificadorJobContext → useJobPolling → api/client
PersistentPages → Pages → api/client → config.ts
DocumentsPage → BackendDocumentTranslatePanel → translateDocument()
PdfPreview → api/client (fetch blob PDF)
NotesPage → PostItNote → api/notes`,
  );
  w.subsection("Flux de configuració runtime");
  w.bullet([
    "1. Build Vite: VITE_API_URL fixat a /api (Docker) o .env local",
    "2. entrypoint.sh: escriu config.js buit (apiUrl opcional)",
    "3. nginx: proxy /api → API_UPSTREAM (http://api:8000)",
    "4. Login: token JWT a localStorage (acsa_access_token)",
  ]);

  // --- 3. FUNCTIONAL ---
  w.newPage();
  w.section("3", "Documentació funcional (per capacitats de negoci)", "s3");

  w.feature({
    id: "3.1",
    title: "Autenticació JWT (LoginPage)",
    purpose: "Identificar usuaris i segregar operacions per mode EMPRESA/PERSONAL.",
    architecture: "POST /auth/login → AuthContext → localStorage (token, type, username). AppRoutes redirigeix a /login si no autenticat.",
    flow: "Formulari → login() → apiLogin → setAccessToken → navigate(from). Logout: clearSession + queryClient.clear(). Inactivitat: 15 min sense activitat → logout automàtic.",
    components: "LoginPage, AuthContext, AuthProvider, config.ts (get/setAccessToken)",
    rules: [
      "Token enviat com Authorization: Bearer <token> a totes les peticions",
      "401 a qualsevol endpoint → clearSessionAndRedirectToLogin()",
      "Mode EMPRESA/PERSONAL mostrat a la sidebar (userTypeLabel)",
    ],
    errors: "401/403 al login → 'Usuari o contrasenya incorrectes.'",
    edgeCases: "Redirecció post-login preserva location.state.from; sessió perduda en netejar localStorage",
    seeAlso: "§5 Documentació d'API, §10 Revisió de seguretat",
  });

  w.feature({
    id: "3.2",
    title: "Ingesta de documents i mitjans (UploadPage)",
    purpose: "Ingressar PDF nous a _PENDENTS i fotos/vídeos a media/_PENDENTS.",
    architecture: "POST /files/upload/batch (PDF) i uploadMediaBatch (mitjans). Drag-and-drop recursiu de carpetes via FileSystem API.",
    flow: "Selecció documents|mitjans → validació tipus → upload → llista local d'historial amb previsualització.",
    components: "UploadPage, uploadBatch(), uploadMediaBatch(), MediaPreview",
    rules: [
      "PDF: nom .pdf i MIME application/pdf o buit",
      "Mitjans: .jpg/.png/.webp/.mp4/.mov/.webm",
      "Eliminació local de mitjans pujats via deletePicture/deleteVideo",
    ],
    errors: "Rebutja fitxers no vàlids; mostra errors ApiError",
    edgeCases: "Carpetes arrossegades: recorregut recursiu d'entrades; duplicats reportats pel backend",
    seeAlso: "§5 API /files/upload",
  });

  w.feature({
    id: "3.3",
    title: "Classificació IA (ClassificadorPage)",
    purpose: "Analitzar PDF o mitjans pendents amb OCR+Gemini i assignar-los a revisió.",
    architecture: "ClassificadorJobContext global; JobProgressPanel a Layout (banner) i ClassificadorPage.",
    flow: "startAnalyze → startAnalyzeJob o startMediaAnalyzeJob → polling → auto-assign o auto-route → documents/mitjans a revisio.",
    components: "ClassificadorJobContext, ClassificadorPage, JobProgressPanel, useJobPolling",
    rules: [
      "contentKind: documents | media — determina el pipeline",
      "Cancel·lació via DELETE /jobs?id={id}",
      "Després d'anàlisi documents: assignDocuments(inbox→archive, require_review=true)",
    ],
    errors: "401 → authError al context; errors de job a job.error",
    edgeCases: "Job sense fitxers: no dispara assignació; múltiples kinds completats en una execució",
    seeAlso: "§2 Flux del classificador",
  });

  w.feature({
    id: "3.4",
    title: "Revisió humana (RevisioPage)",
    purpose: "Validar documents i mitjans amb status=revisio abans de l'arxivament.",
    architecture: "Pestanyes documents|mitjans. Documents: listDocuments + PdfPreview + BackendDocumentTranslatePanel. Mitjans: MediaReviewPanel.",
    flow: "Llista paginada → selecció → previsualització → edició nom/resum/carpeta → approve (status=ok) o delete.",
    components: "RevisioPage, PdfPreview, MediaReviewPanel, BackendDocumentTranslatePanel, DeleteDocumentButton, TablePagination",
    rules: [
      "Documents repeated/duplicats: avís visual, no es poden aprovar directament",
      "Traducció disponible per documents (no mitjans)",
      "Badge de revisió a Layout compta documents + pictures + videos",
    ],
    errors: "Concurrència: dues pestanyes editant el mateix registre",
    edgeCases: "Rotació de previsualització PDF; layout panel fit per pantalles petites",
    seeAlso: "§3.8 Traducció, §3.5 Arxiu",
  });

  w.feature({
    id: "3.5",
    title: "Arxiu de documents (DocumentsPage)",
    purpose: "Consultar, filtrar, ordenar, moure i traduir documents aprovats (status=ok).",
    architecture: "Hub d'arxiu (ArchiveHubPanel) + llista per carpeta. Filtres servidor/client híbrids. Ruta /documents/:id per deep-link.",
    flow: "Hub carpetes → llista filtrada → selecció → PdfPreview → edició/move/translate/delete.",
    components: "DocumentsPage, ArchiveHubPanel, FilterAutocompleteInput, useDocumentFilterOptions, fetchAllDocuments, BackendDocumentTranslatePanel",
    rules: [
      "Filtres actius al client poden requerir fetchAllDocuments (rendiment)",
      "Ordenació: proposed_name, company_folder",
      "Moviment via moveDocument amb dry_run opcional",
    ],
    errors: "Filtres complexos amb milers de documents: lentitud",
    edgeCases: "Vista compacta <600px; prefetch de pàgines adjacents",
    seeAlso: "§11 Revisió de rendiment",
  });

  w.feature({
    id: "3.6",
    title: "Catàleg de mitjans (MediaCatalogPage)",
    purpose: "Consultar i editar fotos/vídeos aprovats per carpeta o tipus.",
    architecture: "MediaCatalogPanel amb query params ?kind=picture|video&folder=...",
    flow: "Navegació des de DocumentsPage hub → llista → previsualització → edició/move.",
    components: "MediaCatalogPage, MediaCatalogPanel, MediaPreview, pictureFileUrl, videoFileUrl(?playback=1)",
    rules: ["Vídeos: reproducció via derivat H.264 lazy del backend"],
    errors: "playback_status=error: missatge al preview",
    seeAlso: "Backend docs/FRONTEND_MEDIA.md, docs/VIDEO_PLAYBACK.md",
  });

  w.feature({
    id: "3.7",
    title: "Configuració (SettingsPage)",
    purpose: "Gestionar carpetes i claus Gemini al backend.",
    flow: "GET /settings → formulari → PUT /settings.",
    components: "SettingsPage, getSettings(), updateSettings()",
    errors: "Claus buides no s'envien (undefined) per no esborrar-les al servidor",
    seeAlso: "§7 Configuració",
  });

  w.feature({
    id: "3.8",
    title: "Traducció de documents (BackendDocumentTranslatePanel)",
    purpose: "Traduir documents PDF aprovats mantenint layout o text pla.",
    architecture: "POST /documents/translate?id={id} → layout_pages + layout_pdf_url o translated_pages.",
    flow: "Selecció idioma → translateDocument(preserve_layout?) → render overlay OCR o text per pàgina.",
    components: "BackendDocumentTranslatePanel, LetterTranslateContent, FittingOcrTranslatedLine, utils/ocr*, utils/backendLayoutTranslate",
    rules: [
      "preserve_layout=true: overlay amb línies traduïdes sobre fons blanquejat",
      "Cartes: segments header/body/footer quan el backend els retorna",
      "Idiomes: constants/translateLanguages.ts",
    ],
    errors: "Documents sense text extret: missatge informatiu",
    seeAlso: "§6 Models (TranslatedPage, LayoutPage)",
  });

  w.feature({
    id: "3.9",
    title: "Comparador (ComparadorPage)",
    purpose: "Detectar duplicats o similituds contra l'arxiu.",
    flow: "POST /compare/scan amb FormData (fitxer PDF).",
    components: "ComparadorPage, FilePdfPreview, compareFile()",
    errors: "Veredicte: duplicate | similar | none",
  });

  w.feature({
    id: "3.10",
    title: "Anàlisi administrativa (AnalisiPage)",
    purpose: "Control granular de treballs batch (carpetes, límits, dry-run).",
    flow: "Formulari avançat → startAnalyzeJob amb paràmetres complets.",
    components: "AnalisiPage, listFolders()",
    errors: "Jobs llargs sense timeout al frontend",
  });

  w.feature({
    id: "3.11",
    title: "Edicions al filesystem (EdicionsPage)",
    purpose: "Aplicar o revertir canvis de nom al disc.",
    flow: "POST /apply o POST /revert.",
    components: "EdicionsPage, applyRenames(), revertRenames()",
    errors: "Revert només l'últim lot (undo_manifest.json al backend)",
  });

  w.feature({
    id: "3.12",
    title: "Correus (CorreusPage)",
    purpose: "Pipeline paral·lel per documents provinents de correu .eml.",
    flow: "listEmails → anàlisi → assign → revisió/aprovació.",
    components: "CorreusPage, startEmailAnalyzeJob(), assignEmails()",
    errors: "Estat independent dels documents PDF",
  });

  w.feature({
    id: "3.13",
    title: "Recuperació (RecuperacioPage)",
    purpose: "Restaurar documents soft-deleted des de la paperera.",
    flow: "listDeletedDocuments → selecció → restoreDocument.",
    components: "RecuperacioPage, listDeletedDocuments(), restoreDocument()",
    errors: "dest_folder opcional a la restauració",
  });

  w.feature({
    id: "3.14",
    title: "Notes al canvas (NotesPage)",
    purpose: "Post-its persistents per usuari amb pan/zoom infinit.",
    architecture: "CRUD /notes + bring-to-front. Estat de viewport en memòria de sessió.",
    flow: "Crear → arrossegar/redimensionar/rotar → persistència debounced (400ms).",
    components: "NotesPage, PostItNote, listNotes/createNote/updateNote/deleteNote/bringNoteToFront",
    rules: ["Mida mínima 160×140; colors predefinits; z-index via bring-to-front"],
    edgeCases: "Viewport (scroll/zoom) persisteix entre keep-alive hide/show",
  });

  // --- 4. DEVELOPER REFERENCE ---
  w.newPage();
  w.section("4", "Referència per a desenvolupadors (mòduls)", "s4");

  w.subsection("4.1 src/api/client.ts");
  w.paragraph(
    "Client HTTP central (~900 línies). Exporta ApiError, buildHeaders(), isUnauthorizedError(), clearSessionAndRedirectToLogin() i funcions per cada endpoint. request() desenvelopa {status,data}, gestiona toasts i redirecció 401.",
  );

  w.subsection("4.2 src/api/types.ts");
  w.paragraph(
    "Interfícies TypeScript que reflecteixen backend/schemas. Inclou tipus de traducció (TranslatedPage, LayoutPage, LayoutLine) i mitjans (PictureOut, VideoOut). Mantenir sincronitzat amb Automatització/backend.",
  );

  w.subsection("4.3 src/config.ts");
  w.paragraph(
    "getApiBaseUrl(): runtime config.js → VITE_API_URL → /api. Gestió de sessió JWT a localStorage: access_token, user_type, username.",
  );

  w.subsection("4.4 src/contexts/AuthContext.tsx");
  w.paragraph(
    "Provider d'autenticació. login() crida apiLogin i desa token/type/username. useInactivityLogout: 15 min sense activitat. logout() neteja React Query cache.",
  );

  w.subsection("4.5 src/contexts/ClassificadorJobContext.tsx");
  w.paragraph(
    "Provider global per al treball del classificador (documents i mitjans). Gestiona jobId, polling, auto-assignació post-completed, auto-routing de mitjans i errors 401.",
  );

  w.subsection("4.6 Hooks");
  w.table(
    ["Hook", "Responsabilitat"],
    [
      ["useJobPolling", "Polling recursiu de jobs; backoff 2× en error"],
      ["useDebouncedValue", "Debounce per camps de cerca"],
      ["useDocumentFilterOptions", "Opcions de filtre des de documents"],
      ["useDocumentListTotal", "Comptador total amb filtres"],
      ["usePrefetchDocumentListPages", "Prefetch de pàgines adjacents"],
      ["useMediaQuery", "Media queries CSS (vista compacta)"],
    ],
  );

  w.subsection("4.7 Components clau");
  w.table(
    ["Component", "Responsabilitat"],
    [
      ["Layout", "Shell amb sidebar, badge revisió, banner job global, logout"],
      ["PersistentPages", "Keep-alive lazy de pàgines visitades"],
      ["PdfPreview", "Fetch blob PDF amb AbortController i revocació URL"],
      ["BackendDocumentTranslatePanel", "Traducció layout/text amb overlay OCR"],
      ["JobProgressPanel", "Progrés i cancel·lació de jobs"],
      ["ArchiveHubPanel", "Hub de carpetes d'arxiu"],
      ["MediaReviewPanel", "Revisió de fotos/vídeos"],
      ["FilterAutocompleteInput", "Autocomplete accessible (ARIA)"],
      ["PostItNote", "Post-it draggable al canvas de notes"],
      ["TablePagination", "Paginació reutilitzable"],
    ],
    { colWidths: [140, CONTENT_W - 140] },
  );

  w.subsection("4.8 Utilitats destacades");
  w.table(
    ["Mòdul", "Responsabilitat"],
    [
      ["utils/fetchAllDocuments", "Descàrrega paginada de tots els documents per filtres client"],
      ["utils/matchDocumentFilters", "Filtratge client-side"],
      ["utils/ocrLineAlign", "Alineació de línies traduïdes sobre layout"],
      ["utils/backendLayoutTranslate", "Renderització overlay layout-preserving"],
      ["utils/listPanelLayout", "Ajust dinàmic d'alçada de panells llista+detall"],
      ["utils/folderSuggestions", "Suggeriments de carpetes d'arxiu"],
    ],
    { colWidths: [150, CONTENT_W - 150], fontSize: 7.5 },
  );

  // --- 5. API ---
  w.newPage();
  w.section("5", "Documentació d'API (vista frontend)", "s5");
  w.paragraph(
    "Base URL: getApiBaseUrl() (per defecte /api). Autenticació: JWT Bearer via buildHeaders(). Endpoints públics: GET /health, GET /health/ready, POST /auth/login.",
  );
  w.paragraph(
    "Envelope: { \"status\": \"success\"|\"error\", \"message\": \"...\", \"data\": {} }. Excepcions: descàrregues de fitxers (cos binari directe).",
  );
  w.paragraph("Especificació completa: docs/openapi.yaml al repositori backend (Automatització).");

  w.subsection("Resum d'endpoints consumits");
  const apiRows = [
    ["POST", "/auth/login", "No", "login()"],
    ["GET", "/health", "No", "getHealth()"],
    ["POST", "/files/upload/batch", "JWT", "uploadBatch()"],
    ["POST", "/files/upload (media)", "JWT", "uploadMedia(), uploadMediaBatch()"],
    ["GET", "/documents", "JWT", "listDocuments()"],
    ["GET", "/documents?id={id}", "JWT", "getDocument()"],
    ["PATCH", "/documents?id={id}", "JWT", "updateDocument()"],
    ["DELETE", "/documents?id={id}", "JWT", "deleteDocument()"],
    ["GET", "/documents/deleted", "JWT", "listDeletedDocuments()"],
    ["POST", "/documents/restore?id={id}", "JWT", "restoreDocument()"],
    ["POST", "/documents/move?id={id}", "JWT", "moveDocument()"],
    ["POST", "/documents/translate?id={id}", "JWT", "translateDocument()"],
    ["GET", "/documents/file?id={id}", "JWT", "documentFileUrl()"],
    ["GET", "/files/by-path", "JWT", "storedFileUrl()"],
    ["POST", "/jobs/analyze", "JWT", "startAnalyzeJob()"],
    ["POST", "/jobs/email-analyze", "JWT", "startEmailAnalyzeJob()"],
    ["POST", "/jobs/media-analyze", "JWT", "startMediaAnalyzeJob()"],
    ["GET", "/jobs?id={id}", "JWT", "getJob()"],
    ["DELETE", "/jobs?id={id}", "JWT", "cancelJob()"],
    ["POST", "/assign", "JWT", "assignDocuments()"],
    ["GET/PUT", "/settings", "JWT", "getSettings/updateSettings"],
    ["POST", "/compare/scan", "JWT", "compareFile()"],
    ["POST", "/apply", "JWT", "applyRenames()"],
    ["POST", "/revert", "JWT", "revertRenames()"],
    ["GET", "/folders", "JWT", "listFolders()"],
    ["GET/PATCH", "/emails", "JWT", "listEmails/updateEmail"],
    ["POST", "/emails/assign", "JWT", "assignEmails()"],
    ["GET/PATCH", "/pictures", "JWT", "listPictures/updatePicture"],
    ["POST", "/pictures/move?id={id}", "JWT", "movePicture()"],
    ["GET/PATCH", "/videos", "JWT", "listVideos/updateVideo"],
    ["POST", "/videos/move?id={id}", "JWT", "moveVideo()"],
    ["POST", "/media/guess-route", "JWT", "guessMediaRoute()"],
    ["POST", "/media/route", "JWT", "routeMedia()"],
    ["GET/POST/PATCH/DELETE", "/notes", "JWT", "CRUD notes"],
    ["POST", "/notes/bring-to-front", "JWT", "bringNoteToFront()"],
  ];
  w.table(
    ["Mètode", "Ruta", "Auth", "Funció client"],
    apiRows,
    { colWidths: [42, 155, 28, CONTENT_W - 225], fontSize: 7 },
  );

  w.subsection("Exemple: login");
  w.codeBlock(
    `curl -X POST "http://localhost:8000/api/auth/login" \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"secret"}'`,
  );

  w.subsection("Exemple: llistar documents en revisió");
  w.codeBlock(
    `curl "http://localhost:8000/api/documents?status=revisio&limit=10" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN"`,
  );

  w.subsection("Errors HTTP");
  w.table(
    ["HTTP", "Causa"],
    [
      ["401", "JWT absent, invàlid o expirat → redirect /login"],
      ["409", "MAX_CONCURRENT_JOBS excedit (backend)"],
      ["413", "Fitxer massa gran"],
      ["429", "Rate limit excedit (backend)"],
      ["503", "/health/ready degradat (backend)"],
    ],
    { colWidths: [40, CONTENT_W - 40] },
  );

  // --- 6. DATA MODELS ---
  w.newPage();
  w.section("6", "Models de dades (tipus frontend)", "s6");
  w.paragraph(
    "Els tipus a src/api/types.ts reflecteixen els schemas Pydantic del backend. La persistència real és SQLite al backend.",
  );

  w.subsection("DocumentOut (principal)");
  w.paragraph(
    "id, status (ok|revisio|repeated|...), proposed_name, original_name, company, company_folder, doc_type_ca, final_date, summary, target_folder, language, processed_at, duplicate_path, translated_text, translated_pages, layout_pages, layout_pdf_url, deleted_at, duplicate, compare.",
  );

  w.subsection("PictureOut / VideoOut");
  w.paragraph(
    "id, name, relative_path, folder, date, proposed_name, status, location_guess, location_string, file_hash. VideoOut afegeix: duration_sec, playback_relative_path, playback_status, playback_error.",
  );

  w.subsection("JobOut");
  w.paragraph(
    "id, type (analyze|email-analyze|media-analyze), status (pending|running|completed|failed|cancelled), progress {processed,total,current_file,status_counts}, error, error_code, result.",
  );

  w.subsection("NoteOut");
  w.paragraph(
    "id (UUID), title, body, color, x, y, width, height, z_index, rotation, created_at, updated_at.",
  );

  w.subsection("SettingsOut");
  w.paragraph("input_folder, output_folder, gemini_api_key (enmascarat), gemini_model, gemini_configured.");

  w.subsection("TranslatedPage / LayoutPage");
  w.paragraph(
    "TranslatedPage: page (1-based), text, segments? (header/body/footer). LayoutPage: page, width, height, background_url, lines[] amb bbox, translated, fontHeightRatio, words[].",
  );

  w.subsection("Apèndix B — Estats del document");
  w.table(
    ["Estat", "Significat"],
    [
      ["pendent", "Pendent d'anàlisi"],
      ["revisio", "Analitzat, esperant revisió humana"],
      ["ok", "Aprovat per apply/assign"],
      ["repeated", "Duplicat detectat"],
      ["(error)", "Columna error amb detalls"],
    ],
    { colWidths: [70, CONTENT_W - 70] },
  );

  // --- 7. CONFIGURATION ---
  w.newPage();
  w.section("7", "Configuració", "s7");
  w.subsection("Variables d'entorn (build Vite)");
  w.table(
    ["Variable", "On", "Per defecte", "Obligatori"],
    [
      ["VITE_API_URL", ".env / build Docker", "/api", "No"],
    ],
  );
  w.subsection("Variables Docker runtime");
  w.table(
    ["Variable", "Per defecte", "Descripció"],
    [
      ["API_UPSTREAM", "http://api:8000", "Upstream nginx per /api"],
      ["WEB_PORT", "8080", "Port HTTP host"],
      ["WEB_HTTPS_PORT", "8443", "Port HTTPS host"],
      ["HTTPS_EXTERNAL_PORT", "8443", "Port extern per redirects"],
    ],
    { colWidths: [110, 100, CONTENT_W - 210], fontSize: 7.5 },
  );
  w.subsection("config.js (runtime)");
  w.codeBlock(`window.__ACSA_CONFIG__ = { apiUrl?: "..." };`);
  w.paragraph(
    "En Docker, entrypoint.sh escriu config.js buit. VITE_API_URL queda fixat al build (/api). El token JWT es desa a localStorage, no a config.js.",
  );
  w.subsection("localStorage (sessió)");
  w.table(
    ["Clau", "Contingut"],
    [
      ["acsa_access_token", "JWT access token"],
      ["acsa_user_type", "EMPRESA | PERSONAL"],
      ["acsa_username", "Nom d'usuari"],
    ],
  );
  w.subsection("Comportament en fallada");
  w.bullet([
    "Sense token: redirecció a /login",
    "Token expirat (401): clearSessionAndRedirectToLogin()",
    "Backend no disponible: errors de xarxa als toasts",
    "nginx arrenca igual amb upstream dinàmic (resolver)",
  ]);

  // --- 8. DEPLOYMENT ---
  w.newPage();
  w.section("8", "Guia de desplegament", "s8");
  w.subsection("Desenvolupament");
  w.codeBlock(`npm ci
npm run dev
# Backend DocPipe a localhost:8000
# Login via /login amb credencials del backend`);
  w.subsection("Docker");
  w.codeBlock(`docker compose build
docker compose up -d
# http://localhost:8080  o  https://localhost:8443`);
  w.subsection("Ordre d'inicialització");
  w.bullet([
    "1. Xarxa Docker externa 'acsa' ha d'existir",
    "2. Backend API en la mateixa xarxa (servei api)",
    "3. entrypoint.sh: certificat TLS auto-signat + config.js + nginx upstream",
    "4. nginx serveix SPA + proxy /api → API_UPSTREAM",
  ]);
  w.subsection("CI/CD");
  w.paragraph("No hi ha pipeline CI configurat en aquest repositori (no .github/workflows).");
  w.subsection("Health checks");
  w.paragraph(
    "getHealth() existeix al client però no s'usa a la UI. El backend exposa GET /health/ready per readiness.",
  );
  w.subsection("Rollback");
  w.paragraph("Desplegar imatge anterior de Docker. Els assets són immutables dins la imatge. La sessió JWT al navegador no depèn del desplegament frontend.");

  // --- 9. PITFALLS ---
  w.newPage();
  w.section("9", "Errors habituals (pitfalls)", "s9");

  w.pitfall({
    id: "9.1",
    title: "Sessió JWT expirada",
    why: "JWT_EXPIRE_MINUTES al backend (per defecte 1440 min); token invàlid després de caducitat.",
    symptoms: "401 a qualsevol petició; redirecció sobtada a /login.",
    detection: "Network tab: 401; toast 'Sessió caducada...'",
    solution: "Tornar a iniciar sessió.",
    prevention: "Refresh token (no implementat); avís proactiu abans de caducitat.",
    files: "src/api/client.ts, src/contexts/AuthContext.tsx",
  });

  w.pitfall({
    id: "9.2",
    title: "DocumentsPage fetch total",
    why: "Filtres clients actius requereixen tots els documents en memòria.",
    symptoms: "Lentitud amb milers de documents; memòria elevada al navegador.",
    detection: "Network: múltiples GET /documents amb paginació fins a total.",
    solution: "Filtratge servidor complet o índexs al backend.",
    files: "src/utils/fetchAllDocuments.ts, src/pages/DocumentsPage.tsx",
  });

  w.pitfall({
    id: "9.3",
    title: "Polling sense timeout",
    why: "useJobPolling continua fins a estat terminal sense límit de temps.",
    symptoms: "UI amb banner de job indefinidament si el backend penja.",
    solution: "Timeout màxim al hook o cancel·lació manual.",
    files: "src/hooks/useJobPolling.ts, src/contexts/ClassificadorJobContext.tsx",
  });

  w.pitfall({
    id: "9.4",
    title: "Tipus desincronitzats amb backend",
    why: "Sincronització manual de src/api/types.ts.",
    symptoms: "Errors runtime o camps undefined a la UI.",
    solution: "Generació automàtica des d'OpenAPI del backend.",
    files: "src/api/types.ts",
  });

  w.pitfall({
    id: "9.5",
    title: "Rutes admin accessibles per URL",
    why: "No hi ha guards per rol; només ocultes al menú MoreNavMenu.",
    symptoms: "Qualsevol usuari autenticat pot accedir a /admin/*.",
    solution: "Route guards basats en rol o type JWT (assumpció: cal backend RBAC).",
    files: "src/components/PersistentPages.tsx, src/components/Layout.tsx",
  });

  w.pitfall({
    id: "9.6",
    title: "BASE URL al import",
    why: "const BASE = getApiBaseUrl() s'avalua al load del mòdul client.ts.",
    symptoms: "Canvis runtime a config.js ignorats sense reload.",
    solution: "Lazy resolution per petició (baixa prioritat).",
    files: "src/api/client.ts",
  });

  w.pitfall({
    id: "9.7",
    title: "TLS auto-signat a Docker",
    why: "entrypoint.sh genera certificat auto-signat per HTTPS.",
    symptoms: "Advertència del navegador la primera vegada; cal acceptar.",
    solution: "Muntar certificats propis o usar reverse proxy amb Let's Encrypt.",
    files: "docker/entrypoint.sh",
  });

  // --- 10. SECURITY ---
  w.newPage();
  w.section("10", "Revisió de seguretat", "s10");
  w.table(
    ["Àrea", "Estat", "Risc", "Recomanació"],
    [
      ["Autenticació", "JWT Bearer", "Mitjà", "Refresh token; logout servidor"],
      ["Autorització", "Sense RBAC UI", "Mitjà", "Guards per rol; segregació per type"],
      ["Secrets", "JWT a localStorage", "Mitjà", "HttpOnly cookie (requereix canvi arquitectura)"],
      ["XSS", "React escapa per defecte", "Baix", "Sanititzar HTML si s'afegeix"],
      ["CSRF", "No aplicable (Bearer)", "Baix", "—"],
      ["Càrrega fitxers", "Validació MIME client", "Mitjà", "Confiar en validació servidor"],
      ["CORS", "Configurat al backend", "Baix", "Orígens explícits a producció"],
      ["Rate limiting", "Al backend", "Baix", "—"],
    ],
    { colWidths: [70, 90, 45, CONTENT_W - 205], fontSize: 7.5 },
  );
  w.paragraph(
    "Millores proposades: RBAC operador/admin, audit log, CSP headers a nginx, no exposar claus Gemini al client (ja gestionades al backend).",
  );

  // --- 11. PERFORMANCE ---
  w.section("11", "Revisió de rendiment", "s11");
  w.table(
    ["Àrea", "Impacte", "Recomanació"],
    [
      ["fetchAllDocuments", "Alt amb arxius grans", "Filtratge servidor per tots els filtres"],
      ["PdfPreview blob", "Mitjà (memòria)", "Revocació URL implementada (releaseDocumentPreview)"],
      ["React Query staleTime", "Baix", "15–30s adequat per llistes"],
      ["Polling 2s", "Baix-Mitjà", "SSE/WebSocket si escala"],
      ["Keep-alive pages", "Mitjà (memòria)", "Només pàgines visitades muntades"],
      ["public/pdfjs assets", "Alt (mida imatge)", "CDN o lazy load"],
      ["NotesPage canvas", "Mitjà", "Virtualització si moltes notes"],
      ["BackendDocumentTranslatePanel", "Alt", "Overlay OCR costós; lazy per pàgina"],
    ],
    { colWidths: [130, 90, CONTENT_W - 220], fontSize: 7.5 },
  );

  // --- 12. TESTING ---
  w.newPage();
  w.section("12", "Estratègia de proves", "s12");
  w.bullet([
    "No hi ha framework de tests unitaris (Vitest/Jest) configurat al package.json",
    "Playwright com a devDependency: scripts ad hoc (test-revisio-table-height.mjs, test-documents-table-height.mjs, test-archive-hub-grid.mjs)",
    "Scripts de verificació: verify-document-list-total.mjs, verify-folder-suggestions.mjs, verify-pdf-layout-*.mjs",
    "lint: només tsc --noEmit",
  ]);
  w.subsection("Proves recomanades");
  w.table(
    ["Àrea", "Eina", "Prioritat"],
    [
      ["Hooks (useJobPolling)", "Vitest", "Alta"],
      ["Utils (matchDocumentFilters)", "Vitest", "Alta"],
      ["Components crítics", "Testing Library", "Mitjana"],
      ["Flux login → revisió", "Playwright E2E", "Alta"],
      ["Contract API", "OpenAPI vs client.ts", "Mitjana"],
    ],
  );

  // --- 13. TECH DEBT ---
  w.section("13", "Deute tècnic", "s13");
  w.table(
    ["Element", "Severitat", "Esforç", "Fitxers"],
    [
      ["Sense tests automatitzats", "Alta", "Mitjà", "package.json"],
      ["Rutes admin sense RBAC", "Alta", "Baix-Mitjà", "PersistentPages.tsx"],
      ["Sincronització manual tipus", "Mitjana", "Mitjà", "api/types.ts"],
      ["PlaceholderPage no usada", "Baixa", "Baix", "pages/PlaceholderPage.tsx"],
      ["DocumentsPage complexa (~1000 línies)", "Mitjana", "Alt", "pages/DocumentsPage.tsx"],
      ["BASE URL al import", "Baixa", "Baix", "api/client.ts"],
      ["getHealth() no usat", "Baixa", "Baix", "api/client.ts"],
      ["NotesPage format inconsistent", "Baixa", "Baix", "pages/NotesPage.tsx"],
    ],
    { colWidths: [130, 55, 55, CONTENT_W - 240], fontSize: 7.5 },
  );

  // --- 14. IMPROVEMENTS ---
  w.section("14", "Full de ruta de millores", "s14");
  w.subsection("Victòries ràpides");
  w.table(
    ["Millora", "Benefici"],
    [
      ["README.md amb enllaç a aquest PDF", "Onboarding"],
      ["Health check al Layout", "Detecció backend caigut"],
      ["Eliminar PlaceholderPage", "Menys confusió"],
      ["Route guard admin", "Seguretat bàsica"],
    ],
    { colWidths: [200, CONTENT_W - 200] },
  );
  w.subsection("Millores mitjanes");
  w.table(
    ["Millora", "Benefici", "Esforç"],
    [
      ["Vitest + tests hooks/utils", "Regressions", "Mitjà"],
      ["Playwright E2E al CI", "Fluxos crítics", "Mitjà"],
      ["Refactor DocumentsPage", "Mantenibilitat", "Alt"],
      ["Generació tipus des d'OpenAPI", "Contracte API", "Mitjà"],
    ],
    { colWidths: [160, 120, CONTENT_W - 280] },
  );
  w.subsection("Refactorització a llarg termini");
  w.bullet([
    "Refresh token JWT i revocació servidor",
    "RBAC operador vs admin",
    "SSE/WebSockets per progrés de jobs",
    "Internacionalització (i18n) si cal castellà/anglès",
    "Virtualització del canvas de notes",
  ]);

  // --- 15. CROSS REFERENCES ---
  w.newPage();
  w.section("15", "Referències creuades", "s15");
  w.table(
    ["Document", "Contingut"],
    [
      ["Automatització/docs/DOCUMENTACIO_COMPLETA.pdf", "Documentació completa backend DocPipe"],
      ["Automatització/docs/openapi.yaml", "Especificació OpenAPI 3.x"],
      ["Automatització/docs/FRONTEND.md", "Integració frontend-backend"],
      ["Automatització/docs/FRONTEND_MEDIA.md", "API mitjans (pictures/videos)"],
      ["Automatització/docs/VIDEO_PLAYBACK.md", "Reproducció vídeo (ffmpeg)"],
      ["Automatització/docs/DEPLOY.md", "Desplegament Docker"],
      ["Automatització/docs/GUIA_FLUJO_PRINCIPAL.md", "Flux operatiu"],
      ["docs/guia-desenvolupador-acsa.pdf", "Guia profunda desenvolupador (generada)"],
      ["docs/guia-flux-principal.pdf", "Guia flux principal (generada)"],
    ],
    { colWidths: [200, CONTENT_W - 200], fontSize: 7.5 },
  );

  w.subsection("Apèndix A — Mapa de rutes");
  w.table(
    ["Ruta", "Pàgina", "Menú"],
    [
      ["/login", "LoginPage", "—"],
      ["/upload", "UploadPage", "Flux principal → Pujar"],
      ["/classificador", "ClassificadorPage", "Flux principal → Classificador"],
      ["/revisio", "RevisioPage", "Flux principal → Revisió"],
      ["/documents", "DocumentsPage", "Flux principal → Classificats"],
      ["/documents/:id", "DocumentsPage (deep-link)", "—"],
      ["/media/catalog", "MediaCatalogPage", "Des de hub Classificats"],
      ["/notes", "NotesPage", "Flux principal → Notes"],
      ["/settings", "SettingsPage", "Eines → Configuració"],
      ["/comparador", "ComparadorPage", "Eines → Comparador"],
      ["/admin/analisi", "AnalisiPage", "Admin → Anàlisi"],
      ["/admin/edicions", "EdicionsPage", "Admin → Edicions"],
      ["/correus", "CorreusPage", "Admin → Correus"],
      ["/recuperacio", "RecuperacioPage", "Admin → Recuperació"],
    ],
    { colWidths: [100, 130, CONTENT_W - 230], fontSize: 7.5 },
  );

  w.spacer(20);
  w.paragraph(
    "*Fi del document. Generat automàticament com a font única de veritat tècnica del projecte acsa-frontend (ACSA — Fitxers històrics).*",
    { italic: true, color: COLORS.muted, align: "center" },
  );

  return tocStartPage;
}

function renderToc(doc, tocEntries, tocPage) {
  const w = new DocWriter(doc);
  w.pageNum = tocPage;
  w.y = MARGIN + 30;
  w.inToc = true;
  w.doc.font("Bold").fontSize(14).fillColor(COLORS.section);
  w.doc.text("0. Taula de continguts", MARGIN, w.y);
  w.y += 24;
  for (const entry of tocEntries) {
    const line = `${entry.num}. ${entry.title}`;
    const dots = ".".repeat(Math.max(2, 55 - Math.min(line.length, 55)));
    w.doc.font("Regular").fontSize(10).fillColor(COLORS.body);
    w.doc.text(`${line} ${dots} ${entry.page}`, MARGIN, w.y, { width: CONTENT_W });
    w.y += 16;
  }
}

function main() {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const tmpFile = path.join(outDir, ".documentacio-codebase-acsa.tmp.pdf");
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: 40, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
    bufferPages: true,
  });

  doc.registerFont("Regular", fontRegular);
  doc.registerFont("Bold", fontBold);
  doc.registerFont("Italic", fontItalic);

  const stream = fs.createWriteStream(tmpFile);
  doc.pipe(stream);

  const writer = new DocWriter(doc);
  writer.drawFooter();
  const tocPage = buildContent(writer);

  renderToc(doc, writer.toc, tocPage);

  doc.end();

  stream.on("finish", () => {
    try {
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
      fs.renameSync(tmpFile, outFile);
      console.log(`PDF generat: ${outFile}`);
    } catch {
      const fallback = path.join(outDir, "documentacio-codebase-acsa-nou.pdf");
      fs.renameSync(tmpFile, fallback);
      console.log(`PDF generat (fitxer original bloquejat): ${fallback}`);
    }
  });

  stream.on("error", (err) => {
    console.error("Error generant el PDF:", err.message);
    process.exit(1);
  });
}

main();
