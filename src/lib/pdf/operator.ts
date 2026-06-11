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
  pages: PageInfo[]
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, degrees, rgb } = await import('pdf-lib');
  const outputPdf = await PDFDocument.create();

  const docMap = new Map<string, PDFDocument>();
  for (const doc of documents) {
    const loaded = await PDFDocument.load(doc.pdfBytes);
    docMap.set(doc.id, loaded);
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
