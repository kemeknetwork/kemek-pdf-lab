import { PDFDocument, degrees } from 'pdf-lib';
import type { PageInfo, Document } from './types.js';

/**
 * Build a merged PDF in the current workspace order. User rotations stack on
 * any rotation already present in the source page so the exported file
 * matches the on-screen preview.
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

    outputPdf.addPage(copiedPage);
  }

  return outputPdf.save();
}
