import { ocrPage, tesseractLangsForIso, type OcrBBox, type OcrLine } from "@/utils/ocrImage";
import { cleanOcrLinesForLayout } from "@/utils/ocrLineCleanup";
import { assignOcrFontGroups } from "@/utils/ocrFontGroups";

export type TranslatedOcrLine = OcrLine & {
  translated: string;
  /** Median height ratio of the typographic group (page-relative). */
  fontHeightRatio?: number;
  fontGroupId?: number;
};

export type TranslatedPageResult = {
  width: number;
  height: number;
  backgroundUrl: string;
  lines: TranslatedOcrLine[];
  plainParagraphs: string[];
};

/** Trailing quotes/brackets after sentence punctuation. */
const TRAILING_CLOSERS = /["')\]]+$/;

/** Letters that can start a word (Latin + common Romance accents). */
const WORD_START = /[a-záéíóúàèìòùâêîôûäëïöüçñ]/i;

/** Place + date like "Andorra la Vella, 29 de enero de 1990". */
const DATE_CORE =
  /\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚÀÈÒÑÜáéíóúàèòñü]+\s+de\s+\d{4}/gi;

/** Lowercase particles allowed inside a place name. */
const PLACE_PARTICLE = /^(?:la|el|de|del|los|las|les|y|i|di|du|des)$/i;

/** Footers / contact lines that should stay on their own block. */
const CONTACT_BREAK_BEFORE =
  /(?<=\S)\s+(?=(?:Avda\.?|Avenida|Tel\.?|Fax\.?|Tix\.?|Telex)\b)/gi;


/** Small words that often end a soft-wrapped line. */
const TRAILING_CONNECTIVE =
  /\b(?:de|del|la|el|los|las|les|y|e|o|u|a|al|en|con|por|para|the|and|of|to|for|a|an|ou|et|des|du|le|un|une)$/i;

/** Abbreviations that should not end a sentence at their trailing period. */
const ABBREVIATION_END =
  /\b(?:Sr|Sra|Dr|Dra|Avda|Av|Tel|Fax|Tix|Inc|Ltd|etc|núm|Núm|C|c|S\.?N\.?C|S\.?L|S\.?A)\.$/i;

function startsWithLowercaseWord(text: string): boolean {
  const first = text.trim()[0];
  return Boolean(
    first && WORD_START.test(first) && first === first.toLowerCase(),
  );
}

function startsWithUppercaseWord(text: string): boolean {
  const first = text.trim()[0];
  return Boolean(
    first && WORD_START.test(first) && first === first.toUpperCase(),
  );
}

/** True when `text` ends a sentence/clause that should open a new translation block. */
export function endsWithSentenceBoundary(text: string): boolean {
  const trimmed = text.trim().replace(TRAILING_CLOSERS, "").trimEnd();
  if (!trimmed) return false;
  if (ABBREVIATION_END.test(trimmed)) return false;
  return /[.!?…:;]$/.test(trimmed);
}

/**
 * Soft line wrap (same paragraph) vs hard break (new paragraph for MT).
 * Prefer joining mid-sentence wraps, but keep letterhead / address blocks apart.
 */
export function isSoftWrappedContinuation(
  previousText: string,
  nextText: string,
): boolean {
  const prev = previousText.trim();
  const next = nextText.trim();
  if (!prev || !next) return false;

  // Syllable hyphenation across lines.
  if (/[-\u2010\u2011\u2012\u2013]$/.test(prev)) return true;

  const nextLower = startsWithLowercaseWord(next);
  const nextUpper = startsWithUppercaseWord(next);

  // New sentence / paragraph after terminal punctuation — never soft-join.
  if (endsWithSentenceBoundary(prev) && nextUpper) return false;

  // Mid-sentence wrap with lowercase continuation.
  if (!endsWithSentenceBoundary(prev) && nextLower) return true;

  // Connective left hanging on the previous line (OCR wrap) — only into
  // lowercase continuations. Uppercase next is a new sentence ("… et" / "De même").
  if (
    !endsWithSentenceBoundary(prev) &&
    TRAILING_CONNECTIVE.test(prev) &&
    nextLower
  ) {
    return true;
  }

  // No terminal punctuation + capital next → letterhead / date / address block.
  if (!endsWithSentenceBoundary(prev) && nextUpper) return false;

  // Finished sentence: only join when the next line looks like a wrap artifact.
  if (endsWithSentenceBoundary(prev) && nextLower) return true;

  return false;
}

function joinWrappedLinePair(previous: string, next: string): string {
  const prev = previous.trim();
  const following = next.trim();
  if (/[-\u2010\u2011\u2012\u2013]$/.test(prev)) {
    return `${prev.replace(/[-\u2010\u2011\u2012\u2013]$/, "")}${following}`;
  }
  return `${prev} ${following}`.replace(/\s+/g, " ").trim();
}

/** Join OCR line texts for translation (handles hyphenated wraps). */
export function joinOcrLineTexts(lines: Array<{ text: string }>): string {
  if (lines.length === 0) return "";
  let joined = lines[0].text.trim();
  for (let i = 1; i < lines.length; i++) {
    joined = joinWrappedLinePair(joined, lines[i].text);
  }
  return joined;
}

/** Merge OCR/plain lines that look like soft wraps into paragraph strings. */
export function mergeSoftWrappedLines(lines: string[]): string[] {
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  if (cleaned.length === 0) return [];

  const paragraphs: string[] = [cleaned[0]];
  for (let i = 1; i < cleaned.length; i++) {
    const prev = paragraphs[paragraphs.length - 1];
    const next = cleaned[i];
    if (isSoftWrappedContinuation(prev, next)) {
      paragraphs[paragraphs.length - 1] = joinWrappedLinePair(prev, next);
    } else {
      paragraphs.push(next);
    }
  }
  return paragraphs;
}

/** Group OCR lines into paragraphs using gaps + soft-wrap text heuristics. */
export function groupLinesIntoParagraphs(
  lines: OcrLine[],
  pageHeight: number,
): OcrLine[][] {
  if (lines.length === 0) return [];
  const sorted = [...lines].sort(
    (a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0,
  );
  const heights = sorted
    .map((line) => line.bbox.y1 - line.bbox.y0)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const medianH =
    heights[Math.floor(heights.length / 2)] ?? Math.max(pageHeight * 0.02, 1);
  /** Gaps below this stay together when text may still be one unit. */
  const softGap = medianH * 1.25;
  /**
   * Beyond this, only keep together when text clearly continues
   * (OCR often inserts a “blank” mid-wrap on aged scans).
   */
  const hardGap = medianH * 2.2;
  /** Absurd gap → new column / footer / stamp, never join. */
  const breakGap = medianH * 4.5;

  const paragraphs: OcrLine[][] = [];
  let current: OcrLine[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const line = sorted[i];
    const gap = line.bbox.y0 - prev.bbox.y1;
    const softWrap = isSoftWrappedContinuation(prev.text, line.text);
    const newSentence =
      endsWithSentenceBoundary(prev.text) && startsWithUppercaseWord(line.text);
    // Indent jump relative to previous line (common at paragraph starts).
    const prevW = Math.max(prev.bbox.x1 - prev.bbox.x0, 1);
    const indentJump =
      line.bbox.x0 - prev.bbox.x0 > Math.max(prevW * 0.12, pageHeight * 0.012);

    let startNew = false;
    if (gap > breakGap) {
      startNew = true;
    } else if (newSentence) {
      // Never pull the next paragraph into the previous translation unit.
      startNew = true;
    } else if (softWrap && gap <= hardGap) {
      startNew = false;
    } else if (gap > hardGap) {
      startNew = true;
    } else if (gap > softGap) {
      startNew = true;
    } else if (
      !endsWithSentenceBoundary(prev.text) &&
      startsWithUppercaseWord(line.text)
    ) {
      // Tight letterhead / address lines with no mid-sentence wrap.
      startNew = true;
    } else if (indentJump && !softWrap && gap > medianH * 0.35) {
      startNew = true;
    }

    if (startNew) {
      paragraphs.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  paragraphs.push(current);
  return paragraphs;
}

/**
 * Split a dense single-line translation into readable structural blocks
 * (letterhead, date, address, body sentences, footer).
 */
export function splitDenseProse(text: string): string[] {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return [];

  let working = injectPlaceDateBreaks(compact);
  // Break after a closing parenthetical place before a new capitalized sentence.
  working = working.replace(/(\([^)]+\))\s+(?=[A-ZÁÉÍÓÚÑÜ])/g, "$1\n\n");
  // Break before street / phone footers (not every Edifici mid-address).
  working = working.replace(CONTACT_BREAK_BEFORE, "\n\n");

  const chunks = working
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const blocks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length < 110) {
      blocks.push(chunk);
      continue;
    }
    blocks.push(...splitIntoSentences(chunk));
  }

  return blocks.length > 0 ? blocks : [compact];
}

/** Insert breaks around "Place, DD de month de YYYY" without overlapping leftovers. */
function injectPlaceDateBreaks(text: string): string {
  DATE_CORE.lastIndex = 0;
  const parts: string[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = DATE_CORE.exec(text)) !== null) {
    const dateStart = match.index;
    const dateEnd = dateStart + match[0].length;
    const region = text.slice(last, dateStart);
    const commaAt = region.lastIndexOf(",");
    if (commaAt < 0 || region.slice(commaAt + 1).trim() !== "") {
      continue;
    }

    const beforeComma = region.slice(0, commaAt);
    const words = beforeComma.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    if (!/^[A-ZÁÉÍÓÚÑÜ]/.test(words[words.length - 1] ?? "")) continue;

    // Place names are short: e.g. "Andorra la Vella" (≤2 capitals + particles).
    let startWord = words.length - 1;
    let capitals = 1;
    for (let i = words.length - 2; i >= 0; i--) {
      const word = words[i];
      if (PLACE_PARTICLE.test(word)) {
        startWord = i;
        continue;
      }
      if (/^[A-ZÁÉÍÓÚÑÜ]/.test(word) && capitals < 2) {
        startWord = i;
        capitals += 1;
        continue;
      }
      break;
    }
    while (
      startWord < words.length &&
      !/^[A-ZÁÉÍÓÚÑÜ]/.test(words[startWord] ?? "")
    ) {
      startWord += 1;
    }
    if (startWord >= words.length) continue;

    const placeWords = words.slice(startWord);
    const placeStr = placeWords.join(" ");
    const placeAt = beforeComma.lastIndexOf(placeStr);
    if (placeAt < 0) continue;

    const absPlace = last + placeAt;
    const before = text.slice(last, absPlace).trim();
    const placeDate = text.slice(absPlace, dateEnd).trim();
    if (before) parts.push(before);
    if (placeDate) parts.push(placeDate);
    last = dateEnd;
    while (last < text.length && /\s/.test(text[last])) last += 1;
  }

  const tail = text.slice(last).trim();
  if (tail) parts.push(tail);
  return parts.length > 0 ? parts.join("\n\n") : text;
}

/** Split prose on sentence boundaries while keeping abbreviations intact. */
function splitIntoSentences(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;

    const until = text.slice(start, i + 1).trim();
    if (ABBREVIATION_END.test(until)) continue;

    const rest = text.slice(i + 1);
    const nextMeaningful = rest.match(/\S/);
    if (
      nextMeaningful &&
      !startsWithUppercaseWord(rest.slice(rest.indexOf(nextMeaningful[0])))
    ) {
      continue;
    }

    const sentence = text.slice(start, i + 1).trim();
    if (sentence) parts.push(sentence);
    start = i + 1;
    while (start < text.length && /\s/.test(text[start])) start += 1;
  }

  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return parts.length > 0 ? parts : [text.trim()].filter(Boolean);
}

/**
 * Prefer blank-line paragraphs, then soft-merged lines, then dense prose splits
 * so letterhead / date / address / body stay visually separated.
 */
export function splitDocumentBlocks(text: string): string[] {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [];

  const byBlank = trimmed
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (byBlank.length > 1) {
    return byBlank.flatMap((block) => expandDocumentBlock(block));
  }

  return expandDocumentBlock(trimmed);
}

function expandDocumentBlock(block: string): string[] {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    return mergeSoftWrappedLines(lines);
  }
  return splitDenseProse(block);
}

/**
 * Split OCR plain text into translation paragraphs.
 * Soft-wrapped visual lines are merged so the translator sees full sentences.
 * Dense display splits happen later via `splitDocumentBlocks`.
 */
export function splitTextIntoParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\u000c/g, "").trim();
  if (!normalized) return [];

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) {
    return [normalized.replace(/\s+/g, " ").trim()].filter(Boolean);
  }

  return mergeSoftWrappedLines(lines);
}

/** Spread a paragraph translation back onto its source OCR lines by weight. */
export function distributeTranslationToLines(
  lines: OcrLine[],
  translated: string,
): TranslatedOcrLine[] {
  const words = translated.trim().split(/\s+/).filter(Boolean);
  if (lines.length === 0) return [];
  if (words.length === 0) {
    return lines.map((line) => ({ ...line, translated: line.text }));
  }
  if (lines.length === 1) {
    return [{ ...lines[0], translated: words.join(" ") }];
  }

  // Capacity ≈ source chars × box width so short wrappers don't steal MT words
  // that belong on later body lines of the same paragraph.
  const capacities = lines.map((line) => {
    const boxW = Math.max(line.bbox.x1 - line.bbox.x0, 1);
    const boxH = Math.max(line.bbox.y1 - line.bbox.y0, 1);
    return Math.max(line.text.length, 1) * Math.sqrt(boxW * boxH);
  });
  const total = capacities.reduce((sum, c) => sum + c, 0);
  let wordIndex = 0;
  return lines.map((line, index) => {
    const isLast = index === lines.length - 1;
    const share = isLast
      ? words.length - wordIndex
      : Math.max(
          1,
          Math.round((capacities[index] / Math.max(total, 1)) * words.length),
        );
    const capped = Math.min(share, words.length - wordIndex);
    const piece = words.slice(wordIndex, wordIndex + capped).join(" ");
    wordIndex += capped;
    return { ...line, translated: piece || line.text };
  });
}

/** Average nearby light pixels so whiteouts match aged paper, not pure white. */
function samplePaperFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
): string {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(Math.max(0, y - 3)));
  const sw = Math.max(1, Math.min(12, Math.floor(w)));
  try {
    const { data } = ctx.getImageData(sx, sy, sw, 1);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const pr = data[i];
      const pg = data[i + 1];
      const pb = data[i + 2];
      if (pr + pg + pb < 420) continue;
      r += pr;
      g += pg;
      b += pb;
      n += 1;
    }
    if (n === 0) return "rgb(244, 239, 230)";
    return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
  } catch {
    return "rgb(244, 239, 230)";
  }
}

function sampleGlobalPaper(ctx: CanvasRenderingContext2D, w: number, h: number): {
  r: number;
  g: number;
  b: number;
} {
  const points = [
    [w * 0.08, h * 0.06],
    [w * 0.92, h * 0.06],
    [w * 0.08, h * 0.94],
    [w * 0.92, h * 0.94],
    [w * 0.5, h * 0.5],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [px, py] of points) {
    try {
      const { data } = ctx.getImageData(Math.floor(px), Math.floor(py), 1, 1);
      const pr = data[0];
      const pg = data[1];
      const pb = data[2];
      if (pr + pg + pb < 480) continue;
      r += pr;
      g += pg;
      b += pb;
      n += 1;
    } catch {
      /* ignore */
    }
  }
  if (n === 0) return { r: 244, g: 239, b: 230 };
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

type WhiteoutBox = { bbox: OcrBBox; text?: string; translated?: string };

function paintTextBand(
  ctx: CanvasRenderingContext2D,
  box: WhiteoutBox,
  canvasW: number,
  canvasH: number,
): void {
  const boxW = Math.max(1, box.bbox.x1 - box.bbox.x0);
  const boxH = Math.max(1, box.bbox.y1 - box.bbox.y0);
  const padX = Math.max(boxW * 0.06, canvasW * 0.008);
  const padY = Math.max(boxH * 0.45, canvasH * 0.004);
  const x = Math.max(0, box.bbox.x0 - padX);
  const y = Math.max(0, box.bbox.y0 - padY);
  const srcLen = Math.max((box.text ?? "").length, 1);
  const outLen = Math.max((box.translated ?? box.text ?? "").length, srcLen);
  const lengthRatio = outLen / srcLen;
  const widthScale = Math.min(1.85, Math.max(1.15, lengthRatio * 1.08));
  const w = Math.min(canvasW - x - 1, boxW * widthScale + padX * 2);
  const h = Math.min(canvasH - y - 1, boxH + padY * 2);
  ctx.fillStyle = samplePaperFill(ctx, x, y, boxW);
  ctx.fillRect(x, y, w, h);
}

/**
 * Replace dark, low-chroma ink with paper color while keeping logos / red stamps
 * (higher chroma). Applied mainly outside the letterhead crest zone.
 */
function scrubInkKeepBranding(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  let image: ImageData;
  try {
    image = ctx.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const paper = sampleGlobalPaper(ctx, width, height);
  const data = image.data;
  // Protect top branding/logo band from aggressive scrub.
  const letterheadEnd = Math.floor(height * 0.2);

  for (let y = 0; y < height; y++) {
    const inLetterhead = y < letterheadEnd;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const maxc = Math.max(r, g, b);
      const minc = Math.min(r, g, b);
      const chroma = maxc - minc;
      const luma = r * 0.299 + g * 0.587 + b * 0.114;

      // Keep colorful branding / stamps / logos.
      if (chroma >= (inLetterhead ? 28 : 36)) continue;
      // Keep paper / light pixels.
      if (luma >= (inLetterhead ? 150 : 168)) continue;

      // Dark gray/black typewriter ink → paper.
      // In letterhead, only scrub very dark black so crests survive.
      if (inLetterhead && luma > 95) continue;

      data[i] = paper.r;
      data[i + 1] = paper.g;
      data[i + 2] = paper.b;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * Clone the scanned page and remove original typing so translated text sits on
 * clean paper, while logos / crests / colored stamps remain.
 */
export function buildWhitenedPageBackground(
  source: HTMLCanvasElement,
  lines: WhiteoutBox[],
  options?: { coverLines?: WhiteoutBox[] },
): string {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return source.toDataURL("image/jpeg", 0.92);

  ctx.drawImage(source, 0, 0);

  // Cover every OCR text region (layout lines + raw OCR leftovers).
  const cover = [...(options?.coverLines ?? []), ...lines];
  const seen = new Set<string>();
  for (const line of cover) {
    const key = `${Math.round(line.bbox.x0)}:${Math.round(line.bbox.y0)}:${Math.round(line.bbox.x1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    paintTextBand(ctx, line, out.width, out.height);
  }

  // Second pass: scrub remaining black typing, keep colorful branding.
  scrubInkKeepBranding(ctx, out.width, out.height);

  return out.toDataURL("image/jpeg", 0.9);
}

/** Filter OCR lines that are likely body text (not noise / full-page headers). */
export function usableOcrLines(
  lines: OcrLine[],
  pageHeight: number,
  pageWidth?: number,
): OcrLine[] {
  const width =
    pageWidth ??
    Math.max(
      ...lines.map((l) => l.bbox.x1),
      pageHeight * 0.7,
      1,
    );
  return cleanOcrLinesForLayout(lines, width, pageHeight);
}

/** OCR one rendered page and translate its paragraphs into positioned lines. */
export async function ocrAndTranslateCanvas(options: {
  canvas: HTMLCanvasElement;
  sourceLanguage: string;
  targetLanguage: string;
  signal?: AbortSignal;
  onOcrProgress?: (ratio: number) => void;
  translate: (text: string) => Promise<string>;
}): Promise<TranslatedPageResult> {
  const { canvas, sourceLanguage, signal, onOcrProgress, translate } = options;
  signal?.throwIfAborted();

  const ocr = await ocrPage(canvas, {
    langs: tesseractLangsForIso(sourceLanguage),
    signal,
    onProgress: onOcrProgress,
  });

  if (!ocr.text.trim() && ocr.lines.length === 0) {
    return {
      width: canvas.width,
      height: canvas.height,
      backgroundUrl: canvas.toDataURL("image/jpeg", 0.92),
      lines: [],
      plainParagraphs: [],
    };
  }

  const lines = usableOcrLines(ocr.lines, ocr.height, ocr.width);
  // Smooth per-line OCR height jitter into a few typographic groups.
  const groupedLines = assignOcrFontGroups(lines, ocr.height);
  // Prefer line boxes whenever we have OCR geometry so the faithful layout
  // view can absolute-position translations (including single-line pages).
  const lineParagraphs =
    groupedLines.length >= 1
      ? groupLinesIntoParagraphs(groupedLines, ocr.height)
      : [];
  const useLineLayout = lineParagraphs.length > 0;
  const sourceParagraphs = useLineLayout
    ? lineParagraphs.map((group) => joinOcrLineTexts(group))
    : splitTextIntoParagraphs(ocr.text);

  const translatedParas: string[] = [];
  for (const paragraph of sourceParagraphs) {
    signal?.throwIfAborted();
    const piece = await translate(paragraph);
    translatedParas.push(piece.trim() || paragraph);
  }

  let out: TranslatedOcrLine[] = [];
  if (useLineLayout) {
    for (let i = 0; i < lineParagraphs.length; i++) {
      out.push(
        ...distributeTranslationToLines(
          lineParagraphs[i],
          translatedParas[i] ?? "",
        ),
      );
    }
  } else if (groupedLines.length === 1 && translatedParas[0]) {
    const only = groupedLines[0];
    out = [
      {
        ...only,
        translated: translatedParas[0],
        fontHeightRatio: only.fontHeightRatio,
        fontGroupId: only.fontGroupId,
      },
    ];
  }

  return {
    width: canvas.width,
    height: canvas.height,
    backgroundUrl:
      out.length > 0
        ? buildWhitenedPageBackground(canvas, out, {
            // Also cover filtered OCR leftovers so ghost typing disappears.
            coverLines: ocr.lines,
          })
        : canvas.toDataURL("image/jpeg", 0.92),
    lines: out,
    plainParagraphs: translatedParas,
  };
}
