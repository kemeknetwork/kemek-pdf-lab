/**
 * PDF export via pdf-lib — merges workspace pages into a single output PDF.
 *
 * Each page is copied from its source document, rotation is applied, and the
 * result is serialized to a new Uint8Array ready for download.
 */

import { PDFDocument, degrees } from 'pdf-lib';
import type { PageInfo, Document } from './types.js';

/**
 * Build a merged PDF from the current workspace page order.
 * Copies pages from their source documents and applies any user rotation.
 */
export async function mergePdf(
  documents: Document[],
  pages: PageInfo[]
): Promise<Uint8Array> {
  const outputPdf = await PDFDocument.create();

  // Build a map from document id to loaded PDFDocument
  const docMap = new Map<string, PDFDocument>();
  for (const doc of documents) {
    const loaded = await PDFDocument.load(doc.pdfBytes);
    docMap.set(doc.id, loaded);
  }

  for (const page of pages) {
    const sourcePdf = docMap.get(page.sourceDocumentId);
    if (!sourcePdf) continue;

    const [copiedPage] = await outputPdf.copyPages(sourcePdf, [page.originalIndex]);

    // Apply rotation
    if (page.rotation !== 0) {
      const existing = copiedPage.getRotation().angle;
      copiedPage.setRotation(degrees(existing + page.rotation));
    }

    outputPdf.addPage(copiedPage);
  }

  return outputPdf.save();
}
