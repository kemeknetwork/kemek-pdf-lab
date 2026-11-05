// The ONLY place this app opens, creates or saves a pdf-lib document.
//
// pdf-lib's default (`updateMetadata: true`) stamps its own Producer
// ("pdf-lib …") plus a fresh CreationDate/ModDate into the Info dict on every
// load and create — a foreign-tool fingerprint and a wall-clock timestamp on
// any file that is then saved. Exports are privacy-clean by default (no opt-in),
// so the flag is applied once here rather than remembered at each call site;
// pdf-doc.test.ts fails the build if any other module calls PDFDocument.load or
// PDFDocument.create directly. Sources that are only copied from go through here
// too, so no "this one is never saved" exception exists to be copied into a
// path that does save.
//
// Saving goes through here too (serializePdf), so every written file passes the
// export scrub (scrub.ts): no page-level metadata, no orphaned copies of deleted
// pages. pdf-doc.test.ts fails on a `.save(` anywhere else as well.
//
// pdf-lib stays dynamic-imported (module-cached), so importing this file never
// pulls pdf-lib into the initial bundle.
import type { PDFDocument } from 'pdf-lib';
import { scrubForExport } from './scrub.js';

export async function openPdf(bytes: Uint8Array): Promise<PDFDocument> {
  const { PDFDocument } = await import('pdf-lib');
  return PDFDocument.load(bytes, { updateMetadata: false });
}

export async function createPdf(): Promise<PDFDocument> {
  const { PDFDocument } = await import('pdf-lib');
  return PDFDocument.create({ updateMetadata: false });
}

/**
 * Write a document's bytes. Fonts and images are embedded first (pdf-lib
 * defers that to save), so the scrub sees the finished object graph, then the
 * scrub removes metadata and anything the page tree no longer reaches. Field
 * appearances are generated explicitly by forms.ts, never regenerated here.
 */
export async function serializePdf(pdf: PDFDocument): Promise<Uint8Array> {
  await pdf.flush();
  await scrubForExport(pdf);
  return pdf.save({ updateFieldAppearances: false });
}
