/**
 * Genera una guia profunda per a desenvolupadors del frontend ACSA en PDF.
 * Ús: node scripts/generate-guia-desenvolupador-acsa.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs");
const outFile = path.join(outDir, "guia-desenvolupador-acsa.pdf");
const fontRegular = path.join(
  root,
  "public/pdfjs/standard_fonts/LiberationSans-Regular.ttf",
);
const fontBold = path.join(
  root,
  "public/pdfjs/standard_fonts/LiberationSans-Bold.ttf",
);
const fontItalic = path.join(
  root,
  "public/pdfjs/standard_fonts/LiberationSans-Italic.ttf",
);

const MARGIN = 50;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 35;
const BODY_BOTTOM = FOOTER_Y - 16;

const COLORS = {
  title: "#14324a",
  section: "#1d4f7a",
  subsection: "#2d3748",
  body: "#1b1b1d",
  muted: "#5c6670",
  panel: "#f6f8fb",
  border: "#dde3ea",
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
    this.pageNum += 1;
    this.y = MARGIN;
    this.drawFooter();
  }

  ensureSpace(height) {
    if (this.y + height > BODY_BOTTOM) this.newPage();
  }

  drawFooter() {
    this.doc
      .font("Regular")
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(
        `ACSA Frontend — Guia del desenvolupador · Pàgina ${this.pageNum}`,
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
    this.y += 18;
  }

  section(num, title) {
    this.ensureSpace(34);
    if (!this.inToc) this.toc.push({ num, title, page: this.pageNum });
    this.doc.font("Bold").fontSize(14).fillColor(COLORS.section);
    this.doc.text(`${num}. ${title}`, MARGIN, this.y, { width: CONTENT_W });
    this.y += 22;
  }

  subsection(title) {
    this.ensureSpace(24);
    this.doc.font("Bold").fontSize(11).fillColor(COLORS.subsection);
    this.doc.text(title, MARGIN, this.y, { width: CONTENT_W });
    this.y += 15;
  }

  paragraph(text, options = {}) {
    const size = options.size ?? 9.5;
    const indent = options.indent ?? 0;
    const font = options.italic ? "Italic" : "Regular";
    this.doc.font(font).fontSize(size).fillColor(options.color ?? COLORS.body);
    const h = this.doc.heightOfString(text, {
      width: CONTENT_W - indent,
      lineGap: 2,
    });
    this.ensureSpace(h + 6);
    this.doc.text(text, MARGIN + indent, this.y, {
      width: CONTENT_W - indent,
      lineGap: 2,
    });
    this.y += h + 6;
  }

  bullets(items) {
    for (const item of items) {
      const text = `• ${item}`;
      const h = this.doc.heightOfString(text, {
        width: CONTENT_W - 10,
        lineGap: 1,
      });
      this.ensureSpace(h + 4);
      this.doc.font("Regular").fontSize(9.5).fillColor(COLORS.body);
      this.doc.text(text, MARGIN + 8, this.y, {
        width: CONTENT_W - 10,
        lineGap: 1,
      });
      this.y += h + 4;
    }
    this.y += 3;
  }

  code(text) {
    this.doc.font("Regular").fontSize(8).fillColor("#22303c");
    const h = this.doc.heightOfString(text, { width: CONTENT_W - 16, lineGap: 0 });
    this.ensureSpace(h + 14);
    const boxY = this.y;
    this.doc
      .rect(MARGIN, boxY, CONTENT_W, h + 10)
      .fillAndStroke(COLORS.panel, COLORS.border);
    this.doc.text(text, MARGIN + 8, boxY + 5, {
      width: CONTENT_W - 16,
      lineGap: 0,
    });
    this.y = boxY + h + 14;
  }

  table(headers, rows) {
    const colW = CONTENT_W / headers.length;
    const rowH = 14;
    this.ensureSpace(rowH * (rows.length + 2));

    let x = MARGIN;
    this.doc.font("Bold").fontSize(8).fillColor(COLORS.subsection);
    for (const header of headers) {
      this.doc.text(header, x + 2, this.y, { width: colW - 4 });
      x += colW;
    }
    this.y += rowH;

    this.doc.font("Regular").fontSize(8).fillColor(COLORS.body);
    for (const row of rows) {
      x = MARGIN;
      for (const cell of row) {
        this.doc.text(String(cell), x + 2, this.y, { width: colW - 4 });
        x += colW;
      }
      this.y += rowH;
    }
    this.y += 8;
  }

  spacer(height = 10) {
    this.y += height;
  }
}

function buildContent(w) {
  w.title("ACSA — Guia profunda del desenvolupador");
  w.subtitle("Frontend React + TypeScript");
  w.subtitle("Versió 0.1.0 · Generada automàticament");
  w.spacer(16);
  w.paragraph(
    "Aquesta guia està pensada per a qualsevol desenvolupador que necessiti entendre de debò com funciona el frontend actual: autenticació, navegació keep-alive, flux de documents, flux de fotos i vídeos, notes, integració amb l'API i punts habituals de manteniment.",
    { italic: true, color: COLORS.muted },
  );
  w.newPage();

  const tocPage = w.pageNum;
  w.section("0", "Taula de continguts");
  w.paragraph("(Es completa al final de la generació.)", { italic: true });
  w.newPage();

  w.section("1", "Mapa mental ràpid");
  w.subsection("Què és aquesta aplicació");
  w.paragraph(
    "És una SPA que acompanya un procés d'arxiu històric. El frontend no fa OCR ni classificació per si mateix: llança treballs al backend, en mostra el progrés i ofereix eines d'edició i revisió abans de donar per vàlid el resultat.",
  );
  w.subsection("Fluxos de negoci principals");
  w.bullets([
    "Documents: login -> pujar PDFs -> classificar -> revisar -> arxivar a Classificats.",
    "Mitjans: login -> pujar imatges o vídeos -> classificar -> revisar -> enviar a carpeta definitiva i al catàleg.",
    "Notes: tauler lliure de post-its que persisteix a l'API i manté vista, zoom i scroll entre navegacions.",
  ]);
  w.subsection("Peces estructurals");
  w.table(
    ["Capa", "Responsabilitat"],
    [
      ["`App.tsx`", "Bootstrap del router, auth i toaster global"],
      ["`Layout.tsx`", "Shell lateral, seccions de navegació i banner global de jobs"],
      ["`PersistentPages.tsx`", "Manté les pàgines visitades muntades per preservar estat local"],
      ["`src/api/client.ts`", "Client HTTP, auth bearer, tractament d'errors i endpoints"],
      ["`ClassificadorJobContext`", "Orquestració dels jobs i passos automàtics post-anàlisi"],
    ],
  );

  w.newPage();
  w.section("2", "Runtime i autenticació");
  w.subsection("Entrada real de l'aplicació");
  w.code(
    `main.tsx
  -> QueryClientProvider
  -> App

App.tsx
  -> BrowserRouter
  -> AuthProvider
  -> Toaster
  -> AppRoutes`,
  );
  w.subsection("Com es decideix si es veu login o app");
  w.paragraph(
    "A `AppRoutes`, la ruta `/login` sempre renderitza `LoginPage`. Per a la resta, si `useAuth()` diu que l'usuari no està autenticat, es redirigeix a `/login`. Quan sí que hi ha sessió, es carrega `AuthenticatedApp`, que encapsula `ClassificadorJobProvider`, `Layout` i `PersistentPages`.",
  );
  w.subsection("Model d'autenticació actual");
  w.bullets([
    "El frontend fa `POST /auth/login` amb `username` i `password`.",
    "Si la resposta té `access_token`, el token es desa amb `setAccessToken()` des de `config`.",
    "Totes les peticions normals afegeixen `Authorization: Bearer <token>` via `buildHeaders()`.",
    "Un `401` fora del flux de login neteja la sessió i redirigeix a `/login` amb `clearSessionAndRedirectToLogin()`.",
  ]);
  w.subsection("Conseqüència pràctica per a manteniment");
  w.paragraph(
    "Quan un component mostra errors d'autorització, la causa acostuma a ser global i no local. Abans de tocar la UI, val la pena revisar si el backend ha invalidat el token, si `AuthProvider` restaura la sessió correctament i si hi ha alguna petició feta amb headers personalitzats que no passen per `buildHeaders()`.",
  );

  w.newPage();
  w.section("3", "Navegació i keep-alive");
  w.subsection("Sidebar i seccions");
  w.paragraph(
    "`Layout.tsx` defineix quatre grups reals de navegació: flux principal (`Pujar`, `Classificador`, `Revisió`, `Classificats`, `Notes`), secció `Mitjans`, eines secundàries i administració. El recompte de `Revisió` es calcula sumant documents, fotos i vídeos pendents.",
  );
  w.subsection("Per què existeix `PersistentPages`");
  w.paragraph(
    "La majoria de pàgines no es desmunten quan canvies de secció. En lloc d'això, `PersistentPages` manté un conjunt de rutes visitades i només canvia quina queda visible. Això conserva cerca, scroll, seleccions, panells oberts i altres estats locals sense haver-los d'elevar a context global.",
  );
  w.subsection("Rutes importants");
  w.table(
    ["Ruta", "Pantalla"],
    [
      ["/upload", "Pujada de documents o mitjans"],
      ["/classificador", "Llançament de jobs de documents o media"],
      ["/revisio", "Revisió de documents o mitjans"],
      ["/documents", "Hub de carpetes classificades"],
      ["/documents/list", "Llista filtrable de documents aprovats"],
      ["/documents/:id", "Document aprovat amb detall i vista prèvia"],
      ["/media/catalog", "Catàleg de fotos i vídeos aprovats"],
      ["/notes", "Tauler de post-its"],
    ],
  );
  w.subsection("Implicació clau");
  w.paragraph(
    "Si una pàgina sembla 'recordar massa coses', probablement és intencionat. En aquest projecte, perdre estat en navegar es considera pitjor que mantenir components muntats durant més temps.",
  );

  w.newPage();
  w.section("4", "Flux de documents");
  w.subsection("Pujar documents");
  w.paragraph(
    "`UploadPage` treballa amb un selector de tipus (`documents` o `media`). En mode documents, només accepta PDFs, inclosos fitxers arrossegats des d'una carpeta sencera. La pujada real es fa amb `uploadBatch(files)` i la llista de resultats es mostra localment dins de la mateixa pàgina.",
  );
  w.subsection("Classificar documents");
  w.paragraph(
    "`ClassificadorPage` és fina: la lògica important viu al context. Quan l'usuari prem `Processar documents`, `ClassificadorJobContext` crida `startAnalyzeJob({ source: 'inbox', require_review: true, run_assign: false })`. Després fa polling del job i, quan acaba, executa automàticament `assignDocuments()` per portar-los a revisió.",
  );
  w.subsection("Revisar documents");
  w.bullets([
    "`RevisioPage` llista documents amb `status=revisio`.",
    "En seleccionar-ne un, s'obre un split view amb editor a l'esquerra i `PdfPreview` a la dreta.",
    "Si el backend marca duplicat, es pot comparar el document actual amb l'original a dos panells.",
    "Si el document no és en una llengua de passthrough, es pot obrir `BackendDocumentTranslatePanel`.",
  ]);
  w.subsection("Consultar documents aprovats");
  w.paragraph(
    "`DocumentsPage` ja no és només una taula. Té tres modes: hub de carpetes, selector per carpeta i vista llista/detall. També combina filtres locals i servidor: si hi ha filtres avançats actius, pot carregar tots els documents aprovats i filtrar-los al client; si no, treballa amb paginació servidor.",
  );
  w.subsection("Moure documents");
  w.paragraph(
    "Des del detall d'un document aprovat es poden editar nom i carpeta. El canvi de carpeta passa per `moveDocument()`. Si la carpeta no existeix en els suggeriments, la UI demana confirmació abans de crear la destinació implícitament al backend.",
  );

  w.newPage();
  w.section("5", "Flux de fotos i vídeos");
  w.subsection("Pujada");
  w.paragraph(
    "En mode `media`, `UploadPage` accepta `.jpg`, `.jpeg`, `.png`, `.webp`, `.mp4`, `.mov` i `.webm`. Els fitxers es pugen amb `uploadMediaBatch()`. Les miniatures d'imatges es poden previsualitzar i eliminar des de la mateixa pantalla immediatament després de pujar.",
  );
  w.subsection("Anàlisi");
  w.paragraph(
    "Per mitjans, el context llança `startMediaAnalyzeJob({ source: 'media', require_review: true })`. Quan el job queda `completed`, no mou arxius directament: calcula carpetes suggerides amb `guessMediaRoute()` per als elements afectats o, si el backend no retorna llista, per a tots els pendents de revisió.",
  );
  w.subsection("Revisió");
  w.paragraph(
    "`MediaReviewPanel` combina fotos i vídeos en una sola llista. En seleccionar un element, es poden editar nom, carpeta, data, resum i ubicació. Si l'element està en estat `error`, hi ha un camí de reanàlisi individual mitjançant `startMediaAnalyzeJob()` passant ids específics.",
  );
  w.subsection("Aprovació i ruta final");
  w.bullets([
    "Si l'usuari manté la carpeta suggerida o no n'escriu cap, es fa `guessMediaRoute()` + `routeMedia()`.",
    "Si escriu una carpeta diferent, es fa `routeMedia()` amb `dest_folder` explícit.",
    "No es permet aprovar cap mitjà cap a `_PENDENTS`.",
    "El catàleg final (`MediaCatalogPanel`) treballa només amb contingut aprovat.",
  ]);
  w.subsection("Catàleg");
  w.paragraph(
    "`MediaCatalogPanel` pot mostrar fotos, vídeos o tots dos. Té tres densitats de visualització, selecció múltiple, descàrrega massiva i lightbox. Les fotos fan servir `MediaPreview`; els vídeos es representen amb placeholder a la graella i s'obren a pantalla completa al visor.",
  );

  w.newPage();
  w.section("6", "Hub Classificats i carpetes");
  w.subsection("Nova idea central");
  w.paragraph(
    "La secció `Classificats` ara és una porta d'entrada comuna per a documents i mitjans. En lloc d'obrir directament una taula, `ArchiveHubPanel` consulta dues arrels de carpetes (`archive` i `media`), les fusiona i mostra targetes per carpeta amb badges de capacitats: documents, fotos i/o vídeo.",
  );
  w.subsection("Detalls útils");
  w.bullets([
    "La carpeta `_PENDENTS` està amagada al hub per evitar confondre quarantena amb arxiu final.",
    "El panell recorda scroll i filtre de cerca mentre canvies entre carpetes o entres a documents.",
    "Després de triar una carpeta, `ArchiveFolderPickPanel` deixa escollir quin tipus de contingut obrir.",
  ]);
  w.subsection("Què revisar si alguna carpeta no surt");
  w.bullets([
    "Comprovar si `listFolders({ root: 'archive' | 'media' })` retorna el nom esperat.",
    "Revisar si el nom és exactament `_PENDENTS` o buit.",
    "Revisar el merge de `mergeFolderBubbles()` quan una carpeta existeix només en una arrel.",
  ]);

  w.newPage();
  w.section("7", "Notes i estat d'interacció");
  w.subsection("Funció del tauler");
  w.paragraph(
    "`NotesPage` és un espai lliure tipus whiteboard amb post-its. No depèn de React Query: usa crides directes (`listNotes`, `createNote`, `updateNote`, `deleteNote`, `bringNoteToFront`) i gestiona optimitzacions locals manualment.",
  );
  w.subsection("Per què és especial");
  w.bullets([
    "Manté `scrollLeft`, `scrollTop` i `zoom` en un objecte de mòdul per sobreviure al keep-alive i remuntatges.",
    "Fa persistència debounced de canvis de geometria i contingut amb `schedulePersist()`.",
    "Admet pan, zoom amb teclat o roda i doble clic per crear una nota on apunta el cursor.",
  ]);
  w.subsection("Risc principal");
  w.paragraph(
    "Com que hi ha estat optimista i persistència diferida, qualsevol canvi aquí s'ha de provar amb calma: arrossegar, editar, redimensionar, navegar fora i tornar, i validar que les respostes del backend no trenquen la geometria visible.",
  );

  w.newPage();
  w.section("8", "Client API, tipus i contractes");
  w.subsection("Patró del client");
  w.paragraph(
    "`src/api/client.ts` té una funció central `request()` que aplica `buildHeaders()`, valida errors amb `throwIfNotOk()`, desempaqueta possibles `ApiEnvelope<T>` i mostra toasts quan s'escau. Qualsevol nou endpoint que comparteixi aquest patró hauria d'entrar aquí abans que en un component.",
  );
  w.subsection("Punts importants del contracte actual");
  w.bullets([
    "Autenticació amb bearer token, no amb `X-API-Key`.",
    "Molts endpoints poden respondre tant com a objecte nu com dins `{ status, data }`.",
    "Hi ha models per documents, media, jobs, carpetes, login i notes al mateix `types.ts`.",
    "Documents i media tenen camps similars però no idèntics; no convé unificar-los massa aviat sense revisar l'API.",
  ]);
  w.subsection("Endpoints que val la pena conèixer de memòria");
  w.table(
    ["Àrea", "Funcions client destacades"],
    [
      ["Auth", "login, logout"],
      ["Documents", "listDocuments, getDocument, updateDocument, moveDocument, deleteDocument"],
      ["Media", "listPictures, listVideos, updatePicture, updateVideo, routeMedia, guessMediaRoute"],
      ["Jobs", "startAnalyzeJob, startMediaAnalyzeJob, cancelJob, getJob"],
      ["Notes", "listNotes, createNote, updateNote, deleteNote, bringNoteToFront"],
    ],
  );

  w.newPage();
  w.section("9", "Hooks i components a entendre abans de refactoritzar");
  w.subsection("Hooks");
  w.bullets([
    "`useJobPolling` governa el polling del context del classificador.",
    "`useDebouncedValue` és clau per a cerques i filtres sense saturar queries.",
    "`useDocumentFilterOptions` prepara llistes de suggeriments per documents aprovats.",
    "`usePrefetchDocumentListPages` intenta fer que la navegació de taules sigui més suau.",
  ]);
  w.subsection("Components crítics");
  w.bullets([
    "`PdfPreview` i `MediaPreview`: gestionen blobs, alliberament de recursos i unmount segur.",
    "`JobProgressPanel`: UI comuna per estat de jobs i cancel·lació.",
    "`FilterAutocompleteInput`: input reutilitzable amb suggeriments i commit controlat.",
    "`HubBackButton`: peça petita però important per la UX dels subfluxos de Classificats.",
  ]);
  w.subsection("Principi pràctic");
  w.paragraph(
    "Si canvies un component d'aquest grup, assumeix que impacta més d'una pantalla. Aquí la reutilització no sempre és visual; sovint encapsula comportament subtil sobre cache, memòria, navegació o control de focus.",
  );

  w.newPage();
  w.section("10", "Com afegir funcionalitat nova sense trencar el flux");
  w.subsection("Patró recomanat");
  w.bullets([
    "1. Afegir tipus a `src/api/types.ts`.",
    "2. Afegir funció client a `src/api/client.ts`.",
    "3. Connectar-la via `useQuery` o `useMutation` a la pàgina o panell adequat.",
    "4. Invalidar només les queries afectades i revisar si el keep-alive conserva un estat que ara queda obsolet.",
    "5. Provar el flux real complet, no només la crida HTTP.",
  ]);
  w.subsection("Quan convé context i quan no");
  w.paragraph(
    "Només el classificador té prou coordinació transversal per justificar un context dedicat. Si la funcionalitat nova és local a una pàgina, és millor mantenir-la local i aprofitar React Query abans que afegir més estat global.",
  );
  w.subsection("Quan convé subcomponentitzar");
  w.paragraph(
    "`DocumentsPage`, `RevisioPage`, `MediaReviewPanel` i `NotesPage` ja contenen prou lògica perquè una extracció de peces UI tingui valor. En canvi, moure helpers petits de lloc sense separar responsabilitats reals acostuma a empitjorar el rastreig mental.",
  );

  w.newPage();
  w.section("11", "Debugging i verificació");
  w.subsection("Símptomes comuns");
  w.bullets([
    "Si una pantalla sembla quedar 'enganxada', comprova primer si està keep-alive i no s'ha remuntat.",
    "Si el banner global de job apareix fora de lloc, revisa `Layout` i l'estat `isActive` del context.",
    "Si una previsualització deixa artefactes o consumeix memòria, revisa les funcions `release*Preview()`.",
    "Si un canvi no es reflecteix a taules o catàlegs, sol faltar una invalidació de query.",
  ]);
  w.subsection("Ordre recomanat de prova manual");
  w.code(
    `1. Login
2. Pujar contingut
3. Llançar classificador
4. Esperar polling / banner global
5. Revisar i aprovar
6. Obrir Classificats o Catàleg
7. Tornar enrere i validar que l'estat es conserva`,
  );
  w.subsection("Verificacions tècniques útils");
  w.bullets([
    "`npm run lint` valida TypeScript.",
    "Els scripts `.mjs` del directori `scripts/` serveixen per proves visuals o de documentació.",
    "Per qualsevol canvi de flux complex, és útil generar els PDFs de guia i revisar si encara descriuen el producte real.",
  ]);

  w.section("12", "Conclusió operativa");
  w.paragraph(
    "La idea més important per mantenir aquest frontend és que no és una col·lecció de pàgines independents: és un flux de treball continu amb estat persistent, jobs en segon pla i dues famílies de contingut (documents i mitjans) que comparteixen més UX que no pas model de dades. Si entens aquesta idea, la resta del codi deixa de semblar dispers i comença a tenir sentit.",
  );

  return tocPage;
}

function renderToc(doc, entries, tocPage) {
  const w = new DocWriter(doc);
  w.pageNum = tocPage;
  w.y = MARGIN + 28;
  w.inToc = true;
  w.doc.font("Bold").fontSize(14).fillColor(COLORS.section);
  w.doc.text("0. Taula de continguts", MARGIN, w.y, { width: CONTENT_W });
  w.y += 24;
  for (const entry of entries) {
    const line = `${entry.num}. ${entry.title}`;
    const dots = ".".repeat(Math.max(2, 64 - line.length));
    w.doc.font("Regular").fontSize(10).fillColor(COLORS.body);
    w.doc.text(`${line} ${dots} ${entry.page}`, MARGIN, w.y, {
      width: CONTENT_W,
    });
    w.y += 16;
  }
}

function main() {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const tmpFile = path.join(outDir, ".guia-desenvolupador-acsa.tmp.pdf");
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
      const fallback = path.join(outDir, "guia-desenvolupador-acsa-nou.pdf");
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
