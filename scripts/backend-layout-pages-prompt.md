# Backend prompt: layout-preserving document translate (`layout_pages`)

Use this when improving the `/documents/translate` pipeline with `preserve_layout: true`.
The frontend (`BackendDocumentTranslatePanel`) renders each `layout_pages[].lines[]` entry as an absolutely positioned overlay on top of `background_url`.

## Goal

Return per-page geometry that lets the UI place translated text without clipping, overlap, or orphan fragments.

## Contract (per page)

```json
{
  "page": 1,
  "width": 1820,
  "height": 2573,
  "background_url": "output/translations/{id}/page-1.jpg",
  "lines": [
    {
      "text": "source OCR line",
      "translated": "target-language line",
      "bbox": { "x0": 0, "y0": 0, "x1": 100, "y1": 24 },
      "align": "left",
      "fontHeightRatio": 0.009,
      "fontGroupId": 0,
      "words": [
        { "text": "word", "bbox": { "x0": 0, "y0": 0, "x1": 40, "y1": 22 } }
      ]
    }
  ],
  "plain_paragraphs": ["…"]
}
```

### Required quality rules

1. **`width` / `height` must match the whitened `background_url` image pixel dimensions** (same coordinate space as every `bbox`).
2. **Each `bbox` must fully contain the glyphs** of its source line (include ascenders/descenders). Avoid ~20px-tall boxes for body text when glyphs are taller.
3. **Do not leave orphan lines after MT redistribution.** If a sentence is merged into one translated line, remove the leftover source row (example bug: `"please do let"` → full Catalan sentence, but `"us know."` still emitted as its own line).
4. **`translated` length per line should match the source line’s visual slot.** Prefer splitting long MT across multiple lines (with new bboxes) rather than stuffing a long translation into a short English box.
5. **Provide `words` when OCR supplies them** so the client can refine font size from glyph boxes (`words: null` forces bbox-only fitting).
6. **`fontHeightRatio` / `fontGroupId` should reflect typographic bands** (letterhead, body, date stamp, footer). Ratios must not imply a font larger than the line’s own bbox height.
7. **Lines must not overlap** unless they are genuinely stacked in the scan (letterhead fine print is a common failure case).
8. **`align`** should reflect visual alignment: `left`, `center`, `right`, or `justify`.

### Whitened background

- Background should be the same page crop/rotation as bboxes.
- Remove source ink cleanly; avoid halos that make translated text hard to read.
- JPEG quality ≥ 0.85 recommended.

### Translation distribution

When translating paragraph-by-paragraph but laying out line-by-line:

1. OCR → line boxes
2. Group lines → paragraphs
3. Translate each paragraph once
4. **Redistribute** translated text back to lines (word/phrase boundaries)
5. **Drop or merge** lines that no longer have unique content
6. Validate: no empty `translated`, no duplicate tails, no `translated === text` English fragments after a fully translated predecessor

### Example failure (document 949)

| Issue | Symptom in UI |
|--------|----------------|
| Tight bbox (~23px) for body lines | Horizontal “slices” through letters (client clips overflow) |
| Merged MT + leftover `"us know."` row | Stray English fragment on the page |
| `words: null` on all lines | Weaker font-size estimates |
| Long Catalan in short English box | Text truncated unless client wraps/shrinks |

## Frontend mitigations (already implemented)

The client still applies safety nets; do not rely on them for correctness:

- Shrinks font to fit bbox (`fitOcrLineFontSizePx`), even when `fontHeightRatio` is set
- Wraps longer translations (`lengthRatio > 1.08` or long strings)
- Hides obvious orphan tails (`filterRedundantLayoutLines`)
- Sizes the translation pane from `layout_pages.width/height`, not the PDF preview

## Acceptance checklist

Test with document **949** (EN → CA letter):

- [ ] No visible horizontal clipping on body lines at 125% zoom
- [ ] No orphan `"us know."` (or similar) line in `layout_pages[0].lines`
- [ ] Letterhead lines do not overlap
- [ ] `layout_pdf_url` burn-in matches the interactive overlay
- [ ] At least body lines include `words` when OCR provides them
- [ ] `width`×`height` equals background image dimensions

## API call

```http
POST /documents/translate?id={document_id}
Content-Type: application/json

{
  "target_language": "ca",
  "preserve_layout": true
}
```
