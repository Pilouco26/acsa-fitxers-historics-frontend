/**
 * Genera la documentació completa del codebase ACSA Frontend en PDF (català).
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
};

class DocWriter {
  constructor(doc) {
    this.doc = doc;
    this.y = MARGIN;
    this.pageNum = 1;
    this.toc = [];
    this.inToc = false;
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
      .text(
        `ACSA Frontend — Documentació tècnica · Pàgina ${this.pageNum}`,
        MARGIN,
        FOOTER_Y,
        { width: CONTENT_W, align: "center" },
      );
  }

  title(text) {
    this.doc.font("Bold").fontSize(22).fillColor(COLORS.title);
    this.doc.text(text, MARGIN, this.y, { width: CONTENT_W, align: "center" });
    this.y += 32;
  }

  subtitle(text) {
    this.doc.font("Regular").fontSize(11).fillColor(COLORS.muted);
    this.doc.text(text, MARGIN, this.y, { width: CONTENT_W, align: "center" });
    this.y += 20;
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
    this.doc.rect(MARGIN, boxY, CONTENT_W, h + 10).fillAndStroke("#f7fafc", "#e2e8f0");
    this.doc.fillColor(COLORS.code).text(text, MARGIN + 8, boxY + 5, {
      width: CONTENT_W - 16,
      lineGap: 0,
    });
    this.y = boxY + h + 14;
  }

  diagram(text) {
    this.codeBlock(text);
  }

  table(headers, rows) {
    const colW = CONTENT_W / headers.length;
    const rowH = 14;
    this.ensureSpace(rowH * (rows.length + 2));
    let x = MARGIN;
    this.doc.font("Bold").fontSize(8).fillColor(COLORS.subsection);
    for (const h of headers) {
      this.doc.text(h, x + 2, this.y, { width: colW - 4, lineGap: 0 });
      x += colW;
    }
    this.y += rowH;
    this.doc.font("Regular").fontSize(8).fillColor(COLORS.body);
    for (const row of rows) {
      x = MARGIN;
      for (const cell of row) {
        this.doc.text(String(cell), x + 2, this.y, { width: colW - 4, lineGap: 0 });
        x += colW;
      }
      this.y += rowH;
    }
    this.y += 8;
  }

  spacer(h = 10) {
    this.y += h;
  }
}

function buildContent(w) {
  // --- COVER ---
  w.title("ACSA — Fitxers històrics");
  w.subtitle("Documentació tècnica del frontend");
  w.subtitle("Versió 0.1.0 · Generada automàticament");
  w.spacer(20);
  w.paragraph(
    "Aquest document és la font única de veritat per a desenvolupadors, revisors, DevOps i futurs mantenidors del projecte acsa-frontend. El backend API resideix en un repositori separat (Automatització/backend); aquesta documentació cobreix exclusivament la capa d'interfície React.",
    { italic: true, color: COLORS.muted },
  );
  w.newPage();

  // --- TOC placeholder ---
  const tocStartPage = w.pageNum;
  w.section("0", "Taula de continguts", "toc");
  w.paragraph("(La taula de continguts es genera al final del document.)", { italic: true });
  w.newPage();

  // --- 1. EXECUTIVE SUMMARY ---
  w.section("1", "Resum executiu", "s1");
  w.subsection("Propòsit");
  w.paragraph(
    "ACSA Frontend és una aplicació web d'una sola pàgina (SPA) per digitalitzar, classificar amb IA, revisar humànement i arxivar documents PDF històrics de l'organització ACSA.",
  );
  w.subsection("Domini de negoci");
  w.bullet([
    "Gestió del cicle de vida de documents històrics en PDF",
    "Classificació automàtica mitjançant OCR i Google Gemini",
    "Revisió humana abans de l'arxivament definitiu",
    "Detecció de duplicats i comparació de similitud",
    "Processament de correus electrònics com a font documental",
  ]);
  w.subsection("Usuaris previstos");
  w.bullet([
    "Operadors d'escaneig i càrrega de documents",
    "Revisors documentals que validen noms i resums proposats",
    "Administradors que configuren carpetes, claus API i processos batch",
  ]);
  w.subsection("Capacitats principals");
  w.bullet([
    "Flux principal en 4 passos: Escàner → Classificador → Revisió → Documents",
    "Eines: Comparador de duplicats, Configuració",
    "Administració: Anàlisi batch, Edicions al sistema de fitxers, Correus",
  ]);
  w.subsection("Stack tecnològic");
  w.table(
    ["Capa", "Tecnologia"],
    [
      ["UI", "React 18.3 + TypeScript 5.6"],
      ["Build", "Vite 5.4"],
      ["Routing", "react-router-dom 6.28"],
      ["Estat servidor", "@tanstack/react-query 5.60"],
      ["Notificacions", "react-hot-toast"],
      ["PDF", "pdfjs-dist (actius a public/pdfjs/)"],
      ["Producció", "nginx Alpine (Docker multi-stage)"],
    ],
  );
  w.subsection("Arquitectura d'alt nivell");
  w.paragraph(
    "El navegador executa la SPA compilada. Les peticions API passen per /api (proxy Vite en dev, nginx en producció) cap al backend Python/FastAPI (inferit) al port 8000. L'autenticació es fa amb capçalera X-API-Key, no amb sessions d'usuari.",
  );
  w.subsection("Integracions externes");
  w.bullet([
    "Backend ACSA API (REST JSON)",
    "Google Gemini (configurat al backend via pantalla Configuració)",
    "Sistema de fitxers local/xarxa (carpetes d'entrada i sortida)",
  ]);
  w.subsection("Model de desplegament");
  w.bullet([
    "Desenvolupament: npm run dev (port 5173) amb proxy a localhost:8000",
    "Docker: imatge nginx servint dist/ + entrypoint que injecta config.js",
    "docker-compose: servei web a port 8080, xarxa externa acsa",
  ]);

  // --- 2. ARCHITECTURE ---
  w.newPage();
  w.section("2", "Visió general de l'arquitectura", "s2");
  w.subsection("Arquitectura per capes");
  w.bullet([
    "Presentació: src/pages/ + src/components/",
    "Estat: React Query (cache servidor) + Context (treball classificador)",
    "Accés a dades: src/api/client.ts",
    "Configuració: src/config.ts + public/config.js (runtime)",
    "Utilitats: src/utils/, src/hooks/, src/constants/",
  ]);
  w.subsection("Límits de domini");
  w.paragraph(
    "Cada pàgina correspon a una capacitat de negoci. El client API centralitza totes les interaccions HTTP. Els tipus a src/api/types.ts reflecteixen l'esquema del backend i s'han de mantenir sincronitzats manualment.",
  );
  w.subsection("Cicle de vida d'una petició");
  w.diagram(
    `Usuari → Component React → React Query / Mutation
         → client.ts (buildHeaders + fetch)
         → /api (proxy nginx/Vite)
         → Backend FastAPI
         → JSON { status, data } o cos directe
         → unwrapEnvelope → actualització UI + toast`,
  );
  w.subsection("Processament en segon pla");
  w.paragraph(
    "Els treballs d'anàlisi (jobs) s'executen al backend. El frontend fa polling cada 2s via useJobPolling fins a estat terminal (completed/failed/cancelled). Després de completar l'anàlisi, ClassificadorJobContext dispara automàticament assignDocuments().",
  );
  w.subsection("Diagrama d'arquitectura del sistema");
  w.diagram(
    `[Navegador SPA]
      |  HTTPS/HTTP
      v
[nginx :80] -- /api --> [Backend :8000]
      |                      |
      |-- config.js          |-- OCR + Gemini
      |-- assets estàtics    |-- SQLite/FS (inferit)
      v
[React + React Query]`,
  );
  w.subsection("Flux del classificador");
  w.diagram(
    `ClassificadorPage.startAnalyze()
  → POST /jobs/analyze (source=inbox)
  → polling GET /jobs/{id}
  → status=completed
  → POST /assign (inbox→archive, require_review=true)
  → documents amb status=revisio`,
  );
  w.subsection("Graf de dependències de mòduls");
  w.diagram(
    `main.tsx → App.tsx → Layout + Pages
App.tsx → ClassificadorJobContext → useJobPolling → api/client
Pages → api/client → config.ts
PdfPreview → api/client (fetch blob PDF)`,
  );

  // --- 3. FUNCTIONAL ---
  w.newPage();
  w.section("3", "Documentació funcional", "s3");

  const features = [
    {
      name: "3.1 Escaneig i càrrega (UploadPage)",
      purpose: "Ingressar PDF nous a la safata d'entrada (_PENDENTS).",
      flow: "Drag-and-drop → validació PDF → POST /files/upload/batch → llista local d'historial.",
      components: "UploadPage, uploadBatch(), getSettings()",
      errors: "Rebutja fitxers no-PDF; mostra errors ApiError.",
    },
    {
      name: "3.2 Classificació IA (ClassificadorPage)",
      purpose: "Analitzar PDF de la safata amb OCR+Gemini i assignar-los a revisió.",
      flow: "startAnalyzeJob → polling → assignDocuments automàtic.",
      components: "ClassificadorJobContext, JobProgressPanel, useJobPolling",
      errors: "401 → missatge 'Accés no autoritzat'; cancel·lació via DELETE /jobs/{id}.",
    },
    {
      name: "3.3 Revisió humana (RevisioPage)",
      purpose: "Validar documents amb status=revisio abans de l'arxivament.",
      flow: "listDocuments → selecció → PdfPreview → edició nom/resum → approve o delete.",
      components: "PdfPreview, TablePagination, DeleteDocumentButton",
      errors: "Concurrència: dues pestanyes editant el mateix document.",
    },
    {
      name: "3.4 Arxiu de documents (DocumentsPage)",
      purpose: "Consultar, filtrar, ordenar i moure documents aprovats (status=ok).",
      flow: "Filtres servidor/client híbrids → paginació → moveDocument.",
      components: "useDocumentFilterOptions, matchDocumentFilters, folderSuggestions",
      errors: "Filtres complexos carreguen tots els documents (rendiment).",
    },
    {
      name: "3.5 Configuració (SettingsPage)",
      purpose: "Gestionar carpetes i claus Gemini al backend.",
      flow: "GET /settings → formulari → PUT /settings.",
      components: "SettingsPage, updateSettings()",
      errors: "Claus buides no s'envien (undefined) per no esborrar-les.",
    },
    {
      name: "3.6 Comparador (ComparadorPage)",
      purpose: "Detectar duplicats o similituds contra l'arxiu.",
      flow: "POST /compare/scan amb FormData.",
      components: "FilePdfPreview, compareFile()",
      errors: "Veredicte: duplicate | similar | none.",
    },
    {
      name: "3.7 Anàlisi administrativa (AnalisiPage)",
      purpose: "Control granular de treballs batch (carpetes, límits, dry-run).",
      flow: "Formulari avançat → startAnalyzeJob amb paràmetres complets.",
      components: "AnalisiPage, listFolders()",
      errors: "Jobs llargs sense timeout al frontend.",
    },
    {
      name: "3.8 Edicions al filesystem (EdicionsPage)",
      purpose: "Aplicar o revertir canvis de nom al disc.",
      flow: "POST /apply o POST /revert.",
      components: "applyRenames(), revertRenames()",
      errors: "Operacions irreversibles parcialment (revert limitat).",
    },
    {
      name: "3.9 Correus (CorreusPage)",
      purpose: "Pipeline paral·lel per documents provinents de correu.",
      flow: "listEmails → anàlisi → assign → revisió/aprovació.",
      components: "startEmailAnalyzeJob(), assignEmails()",
      errors: "Estat independent dels documents PDF.",
    },
  ];

  for (const f of features) {
    w.subsection(f.name);
    w.paragraph(`Propòsit: ${f.purpose}`);
    w.paragraph(`Flux: ${f.flow}`);
    w.paragraph(`Components: ${f.components}`);
    w.paragraph(`Errors/edge cases: ${f.errors}`);
  }

  // --- 4. DEVELOPER REFERENCE ---
  w.newPage();
  w.section("4", "Referència per a desenvolupadors", "s4");
  w.subsection("src/api/client.ts");
  w.paragraph(
    "Client HTTP central. Exporta ApiError, buildHeaders(), isUnauthorizedError() i funcions per cada endpoint. La funció request() desenvelopa {status,data}, gestiona toasts i errors HTTP.",
  );
  w.subsection("src/api/types.ts");
  w.paragraph("Interfícies TypeScript que reflecteixen l'esquema del backend. Mantenir sincronitzat amb Automatització/backend.");
  w.subsection("src/config.ts");
  w.paragraph("getApiKey(): runtime config → VITE_API_KEY. getApiBaseUrl(): runtime → VITE_API_URL → /api.");
  w.subsection("src/contexts/ClassificadorJobContext.tsx");
  w.paragraph(
    "Provider global per al treball del classificador. Gestiona jobId, polling, auto-assignació post-completed i errors 401.",
  );
  w.subsection("Hooks");
  w.table(
    ["Hook", "Responsabilitat"],
    [
      ["useJobPolling", "Polling recursiu de jobs amb backoff en error"],
      ["useDebouncedValue", "Debounce per camps de cerca"],
      ["useDocumentFilterOptions", "Opcions de filtre des de documents"],
      ["useDocumentListTotal", "Comptador total amb filtres"],
    ],
  );
  w.subsection("Components clau");
  w.table(
    ["Component", "Responsabilitat"],
    [
      ["Layout", "Shell amb sidebar i banner de job global"],
      ["PdfPreview", "Fetch blob PDF amb AbortController i revocació URL"],
      ["JobProgressPanel", "Progrés i cancel·lació de jobs"],
      ["FilterAutocompleteInput", "Autocomplete accessible (ARIA)"],
      ["TablePagination", "Paginació reutilitzable"],
    ],
  );

  // --- 5. API ---
  w.newPage();
  w.section("5", "Referència API", "s5");
  w.paragraph(
    "Especificació OpenAPI 3.1 disponible a docs/openapi.yaml. Totes les rutes requereixen X-API-Key excepte /health.",
  );
  w.subsection("Endpoints documentats");
  w.table(
    ["Mètode", "Ruta", "Funció client"],
    [
      ["GET", "/health", "getHealth()"],
      ["POST", "/files/upload/batch", "uploadBatch()"],
      ["GET", "/documents", "listDocuments()"],
      ["PATCH", "/documents/{id}", "updateDocument()"],
      ["DELETE", "/documents/{id}", "deleteDocument()"],
      ["POST", "/documents/{id}/move", "moveDocument()"],
      ["GET", "/documents/{id}/file", "documentFileUrl()"],
      ["POST", "/jobs/analyze", "startAnalyzeJob()"],
      ["GET", "/jobs/{id}", "getJob()"],
      ["DELETE", "/jobs/{id}", "cancelJob()"],
      ["POST", "/assign", "assignDocuments()"],
      ["GET/PUT", "/settings", "getSettings/updateSettings"],
      ["POST", "/compare/scan", "compareFile()"],
      ["POST", "/apply", "applyRenames()"],
      ["POST", "/revert", "revertRenames()"],
      ["GET", "/folders", "listFolders()"],
      ["GET", "/emails", "listEmails()"],
      ["POST", "/emails/assign", "assignEmails()"],
      ["POST", "/jobs/email-analyze", "startEmailAnalyzeJob()"],
    ],
  );
  w.subsection("Exemple cURL");
  w.codeBlock(
    `curl -H "X-API-Key: LA_CLAU" \\
  "http://localhost:8000/documents?status=revisio&limit=10"`,
  );
  w.subsection("Errors HTTP");
  w.bullet([
    "401: Clau API invàlida → isUnauthorizedError()",
    "4xx/5xx: parseError() extreu detail de FastAPI",
    "204: sense cos (delete)",
  ]);

  // --- 6. DATA MODELS ---
  w.newPage();
  w.section("6", "Models de dades", "s6");
  w.subsection("DocumentOut (principal)");
  w.paragraph(
    "id, status (ok|revisio), proposed_name, original_name, company, company_folder, doc_type_ca, final_date, summary, target_folder, language, processed_at, duplicate, compare.",
  );
  w.subsection("JobOut");
  w.paragraph(
    "id, type, status (pending|running|completed|failed|cancelled), progress {processed,total,current_file,status_counts}, error, result.",
  );
  w.subsection("SettingsOut");
  w.paragraph("input_folder, output_folder, gemini_api_key (enmascarat), gemini_model, gemini_configured.");
  w.subsection("EmailOut");
  w.paragraph("Paral·lel a DocumentOut amb camps de correu: subject, sender_email, sent_at.");
  w.subsection("Diagrama ER (conceptual)");
  w.diagram(
    `Document (1) --- status: ok | revisio
Job (N) --- processa --- Document
Email (N) --- pot generar --- Document
Settings (1) --- configura --- Backend`,
  );

  // --- 7. CONFIGURATION ---
  w.newPage();
  w.section("7", "Configuració", "s7");
  w.table(
    ["Variable", "On", "Per defecte", "Obligatori"],
    [
      ["VITE_API_URL", ".env / build Docker", "/api", "No"],
      ["VITE_API_KEY", ".env / build Docker", "(buit)", "Recomanat"],
      ["API_KEY", "Docker runtime", "VITE_API_KEY", "Prod: Sí"],
      ["API_UPSTREAM", "Docker runtime", "http://api:8000", "Sí en compose"],
      ["WEB_PORT", "docker-compose", "8080", "No"],
    ],
  );
  w.subsection("config.js (runtime)");
  w.codeBlock(`window.__ACSA_CONFIG__ = { apiKey: "...", apiUrl?: "..." };`);
  w.paragraph(
    "En Docker, entrypoint.sh escriu apiKey a l'arrencada. Les variables Vite queden fixades al build; la clau API es pot injectar sense rebuild.",
  );
  w.subsection("Comportament en fallada");
  w.bullet([
    "Sense API_KEY: peticions sense capçalera → probable 401",
    "Backend no disponible: nginx arrenca igual (resolver dinàmic)",
    "Proxy dev sense VITE_API_KEY: cal configurar manualment",
  ]);

  // --- 8. DEPLOYMENT ---
  w.newPage();
  w.section("8", "Guia de desplegament", "s8");
  w.subsection("Desenvolupament");
  w.codeBlock(`npm ci\nnpm run dev\n# Backend a localhost:8000\n# .env: VITE_API_KEY=...`);
  w.subsection("Docker");
  w.codeBlock(`docker compose build\ndocker compose up -d\n# http://localhost:8080`);
  w.subsection("Ordre d'inicialització");
  w.bullet([
    "1. Xarxa Docker externa 'acsa' ha d'existir",
    "2. Backend API en la mateixa xarxa",
    "3. entrypoint.sh: config.js + nginx upstream",
    "4. nginx serveix SPA + proxy /api",
  ]);
  w.subsection("CI/CD");
  w.paragraph("No hi ha pipeline CI configurat en aquest repositori (assumpció verificada: no .github/workflows).");
  w.subsection("Health checks");
  w.paragraph("getHealth() existeix al client però no s'usa a la UI. Recomanable afegir endpoint de readiness al contenidor.");
  w.subsection("Rollback");
  w.paragraph("Desplegar imatge anterior de Docker. Els assets són immutables dins la imatge.");

  // --- 9. PITFALLS ---
  w.newPage();
  w.section("9", "Errors comuns i trampes", "s9");
  const pitfalls = [
    ["Rutes admin sense protecció", "Només ocultes al menú", "Qualsevol usuari amb accés a la URL", "Afegir guards o auth al backend"],
    ["Clau API al client", "config.js visible al navegador", "Inspeccionar xarxa/font", "Rotació de claus; claus restringides"],
    ["DocumentsPage fetch total", "Filtres clients actius", "Lentitud amb milers de docs", "Filtratge servidor complet"],
    ["Polling sense timeout", "Jobs penjats", "UI bloquejada indefinidament", "Timeout màxim al hook"],
    ["Tipus desincronitzats", "Canvis al backend", "Errors runtime TS/API", "Contract testing"],
    ["Playwright no a package.json", "Scripts de layout", "npm install manual", "Afegir com a devDependency"],
    ["BASE URL al import", "getApiBaseUrl() a mòdul load", "Canvis runtime ignorats", "Lazy resolution (baixa prioritat)"],
  ];
  w.table(["Problema", "Causa", "Símptoma", "Solució"], pitfalls);

  // --- 10. SECURITY ---
  w.newPage();
  w.section("10", "Revisió de seguretat", "s10");
  w.bullet([
    "Autenticació: només API key compartida, sense usuaris ni RBAC al frontend",
    "Autorització: inexistent a nivell UI; rutes /admin/* accessibles directament",
    "Secrets: VITE_API_KEY es pot incloure al bundle de build; preferir runtime config.js",
    "XSS: React escapa per defecte; PdfPreview usa blob URLs (baix risc)",
    "CSRF: no aplicable (API key, no cookies de sessió)",
    "Càrrega de fitxers: validació MIME/nom .pdf al client; validació servidor necessària",
    "Rate limiting: no implementat al frontend",
    "Logging: no es registren claus; toasts mostren missatges d'error genèrics",
  ]);
  w.paragraph("Recomanacions: autenticació per usuari, protecció de rutes admin, CSP headers a nginx, no exposar claus Gemini al client (ja gestionades al backend).");

  // --- 11. PERFORMANCE ---
  w.newPage();
  w.section("11", "Revisió de rendiment", "s11");
  w.table(
    ["Àrea", "Impacte", "Recomanació"],
    [
      ["fetchAllDocuments", "Alt amb arxius grans", "Paginació servidor per tots els filtres"],
      ["PdfPreview blob", "Mitjà (memòria)", "Revocació URL ja implementada correctament"],
      ["React Query staleTime 30s", "Baix", "Adequat per llistes"],
      ["Polling 2s", "Baix-Mitjà", "WebSocket o SSE si escala"],
      ["public/pdfjs assets", "Alt (mida imatge)", "CDN o lazy load si cal"],
      ["DocumentsPage re-renders", "Mitjà", "Memoització de files de taula"],
    ],
  );

  // --- 12. TESTING ---
  w.section("12", "Estratègia de proves", "s12");
  w.bullet([
    "No hi ha framework de tests unitaris (Vitest/Jest) configurat",
    "Scripts Playwright ad hoc: test-revisio-table-height.mjs, test-documents-table-height.mjs",
    "Scripts de verificació API: verify-document-list-total.mjs, verify-folder-suggestions.mjs",
    "lint: només tsc --noEmit",
  ]);
  w.paragraph("Recomanacions: Vitest per utils/hooks, Testing Library per components, Playwright E2E al CI, contract tests amb openapi.yaml.");

  // --- 13. TECH DEBT ---
  w.newPage();
  w.section("13", "Deute tècnic", "s13");
  w.table(
    ["Element", "Severitat", "Esforç"],
    [
      ["Sense tests automatitzats", "Alta", "Mitjà"],
      ["Rutes admin obertes", "Alta", "Baix-Mitjà"],
      ["Sincronització manual de tipus", "Mitjana", "Mitjà"],
      ["PlaceholderPage no usada", "Baixa", "Baix"],
      ["README absent", "Mitjana", "Baix"],
      ["DocumentsPage complexa (647 línies)", "Mitjana", "Alt"],
      ["getHealth() no usat", "Baixa", "Baix"],
    ],
  );

  // --- 14. IMPROVEMENTS ---
  w.section("14", "Full de ruta de millores", "s14");
  w.subsection("Victòries ràpides");
  w.bullet([
    "Afegir README.md amb enllaç a aquest PDF",
    "Script npm docs:codebase-ca al package.json",
    "Health check al Layout o splash",
    "Eliminar PlaceholderPage si no cal",
  ]);
  w.subsection("Millores mitjanes");
  w.bullet([
    "Vitest + tests de useJobPolling i matchDocumentFilters",
    "Route guards per seccions admin",
    "Playwright com a devDependency amb CI",
    "Refactor de DocumentsPage en subcomponents",
  ]);
  w.subsection("Refactorització a llarg termini");
  w.bullet([
    "Autenticació per usuari amb JWT i rols",
    "Generació automàtica de tipus des d'OpenAPI del backend",
    "SSE/WebSockets per progrés de jobs",
    "Internacionalització (i18n) si cal castellà/anglès",
  ]);

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
    const dots = ".".repeat(Math.max(2, 60 - line.length));
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
