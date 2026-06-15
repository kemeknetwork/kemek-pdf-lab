// pdf-lib (~400KB) is dynamic-imported inside mergePdf rather than statically,
// so it lands in a lazy chunk loaded on first export instead of the initial
// page bundle. The pure watermarkTargetIndices() below stays synchronously
// importable. The `import type` is erased at build time — it adds no runtime
// dependency, just the PDFDocument type for the docMap annotation.
import type { PDFDocument } from 'pdf-lib';
import type { PageInfo, Document } from './types.js';

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m || m.length !== 3) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m[0], 16) / 255,
    g: parseInt(m[1], 16) / 255,
    b: parseInt(m[2], 16) / 255
  };
}

/**
 * Build a merged PDF in the current workspace order. User rotations stack on
 * any rotation already present in the source page so the exported file
 * matches the on-screen preview. Text annotations placed in the preview
 * modal are burned into each page via pdf-lib's drawText.
 */
export async function mergePdf(
  documents: Document[],
  pages: PageInfo[],
  opts: { flattenForms?: boolean } = {}
): Promise<Uint8Array> {
  const { flattenForms = false } = opts;
  const {
    PDFDocument,
    StandardFonts,
    degrees,
    rgb,
    PDFTextField,
    PDFCheckBox,
    PDFRadioGroup,
    PDFDropdown,
    PDFOptionList
  } = await import('pdf-lib');
  // updateMetadata:false stops pdf-lib stamping its own Producer ("pdf-lib …")
  // plus a fresh CreationDate/ModDate into the output Info dict — a privacy leak
  // (tool fingerprint + a wall-clock timestamp) on EVERY export. The user's
  // source metadata is already dropped here: it lives in the trailer Info dict /
  // catalog XMP, neither of which copyPages carries, so a freshly-created output
  // with this flag carries no metadata at all — every export is metadata-clean by
  // default, no opt-in needed.
  const outputPdf = await PDFDocument.create({ updateMetadata: false });

  const docMap = new Map<string, PDFDocument>();
  for (const doc of documents) {
    const loaded = await PDFDocument.load(doc.pdfBytes);
    docMap.set(doc.id, loaded);
  }

  // Bake entered form values into the source page content via fill + flatten
  // BEFORE copyPages. AcroForm fields live in the document catalog and do not
  // survive a page copy, but a flattened field's appearance becomes part of the
  // page content stream, which does. A document is touched when the user filled
  // it, OR when `flattenForms` asks to lock every form (the finalize toggle) —
  // flatten-without-fill burns the current field appearances and drops their
  // interactivity. Untouched forms with neither condition pass through live.
  for (const doc of documents) {
    const values = doc.fieldValues;
    const hasValues = !!values && Object.keys(values).length > 0;
    if (!hasValues && !flattenForms) continue;
    const pdf = docMap.get(doc.id);
    if (!pdf) continue;

    // getForm() synthesizes an empty form for a doc with no AcroForm, so the
    // flatten-all path is a safe no-op there; guard it anyway against a
    // malformed AcroForm that throws on access.
    let form: ReturnType<PDFDocument['getForm']>;
    try {
      form = pdf.getForm();
    } catch {
      continue;
    }

    if (hasValues) {
      for (const [name, value] of Object.entries(values!)) {
        // A single field rejecting its value (unknown option, over maxLen, exotic
        // type) must not sink a multi-page export — skip it; it stays unfilled.
        try {
          const field = form.getFieldMaybe(name);
          if (!field) continue;
          if (field instanceof PDFTextField) field.setText(value);
          else if (field instanceof PDFCheckBox) value ? field.check() : field.uncheck();
          else if (field instanceof PDFRadioGroup) { if (value) field.select(resolveRadioValue(value, field.getOptions())); }
          else if (field instanceof PDFDropdown) { if (value) field.select(value); }
          else if (field instanceof PDFOptionList) { if (value) field.select(value); }
        } catch {
          /* leave this field unfilled */
        }
      }
    }

    // flatten() generates field appearances and can throw on a form with no
    // default font / malformed widgets. A flatten failure must not sink the
    // export — the form just stays interactive (a safe degradation, logged).
    try {
      form.flatten();
    } catch (e) {
      console.warn(`Could not flatten the form in "${doc.name}" — it stays interactive:`, e);
    }
  }

  // Embed once and reuse — every annotation uses Helvetica MVP.
  const annotated = pages.some((p) => (p.annotations?.length ?? 0) > 0);
  const helvetica = annotated ? await outputPdf.embedFont(StandardFonts.Helvetica) : null;

  for (const page of pages) {
    const sourcePdf = docMap.get(page.sourceDocumentId);
    if (!sourcePdf) {
      throw new Error(`Source document missing for page ${page.originalIndex + 1}. Try reloading the file.`);
    }

    // A stale PageInfo can point past the end of an existing document (e.g. the
    // source was reloaded shorter). copyPages would hand back an empty array and
    // the undefined page would crash opaquely on the next line — guard with the
    // same clean, page-numbered error as the missing-document case above.
    if (page.originalIndex < 0 || page.originalIndex >= sourcePdf.getPageCount()) {
      throw new Error(`Page ${page.originalIndex + 1} no longer exists in its source document. Try reloading the file.`);
    }

    const [copiedPage] = await outputPdf.copyPages(sourcePdf, [page.originalIndex]);

    if (page.rotation !== 0) {
      const existing = copiedPage.getRotation().angle;
      copiedPage.setRotation(degrees(existing + page.rotation));
    }

    if (helvetica && page.annotations && page.annotations.length > 0) {
      const { width: pdfW, height: pdfH } = copiedPage.getSize();
      for (const ann of page.annotations) {
        const xPt = ann.x * pdfW;
        // Stored (x, y) is the text BASELINE in normalized page coords
        // (origin top-left). pdf-lib drawText also anchors on baseline,
        // so the only conversion needed is the Y-flip to PDF's
        // bottom-left origin.
        const yPt = pdfH - ann.y * pdfH;
        const { r, g, b } = hexToRgb01(ann.color);
        copiedPage.drawText(ann.text, {
          x: xPt,
          y: yPt,
          size: ann.fontSize,
          font: helvetica,
          color: rgb(r, g, b)
        });
      }
    }

    outputPdf.addPage(copiedPage);
  }

  return outputPdf.save();
}

/**
 * Map a watermark's stored target page-id snapshot to indices into the actual
 * export page list — which is the page order of the assembled output, so a
 * position here is the output-PDF page index applyWatermark expects.
 *
 * Resolving against the live list (rather than storing indices) keeps the
 * targeting correct after reorder/delete and across both export paths (full
 * merge and split). null targets → undefined (every page). Targeted pages no
 * longer in the export simply drop out; an empty result stamps nothing.
 */
/**
 * Resolve a stored radio value to the option pdf-lib's select() expects. pdfjs
 * reports a radio widget's on-state NAME — usually a human string ("free"), but
 * a digit ("0"/"1"/…) when the PDF names states numerically via the /Opt-index
 * convention pdf-lib writes, in which case getOptions() returns the human labels
 * at those positions. select() wants the value as it appears in getOptions().
 *
 * Name-first: if the stored value is itself a valid option, use it directly;
 * only otherwise treat a digit as a positional index into getOptions(). The
 * name check must come first — a PDF can name its on-states with digits that are
 * ALSO real option values but NOT in positional order (getOptions() ["1","0"]),
 * and index-resolving those would silently select the wrong choice on a flattened
 * (unrecoverable) export.
 */
export function resolveRadioValue(value: string, options: string[]): string {
  if (options.includes(value)) return value;
  const idx = Number(value);
  return Number.isInteger(idx) && idx >= 0 && idx < options.length ? options[idx] : value;
}

export function watermarkTargetIndices(
  pages: PageInfo[],
  targetIds: string[] | null
): number[] | undefined {
  if (!targetIds) return undefined;
  const wanted = new Set(targetIds);
  const indices: number[] = [];
  pages.forEach((page, i) => {
    if (wanted.has(page.id)) indices.push(i);
  });
  return indices;
}
