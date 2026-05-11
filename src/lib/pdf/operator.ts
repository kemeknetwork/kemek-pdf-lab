import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
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
