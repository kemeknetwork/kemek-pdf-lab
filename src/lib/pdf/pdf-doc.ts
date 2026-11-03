// The ONLY place this app opens or creates a pdf-lib document.
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
// pdf-lib stays dynamic-imported (module-cached), so importing this file never
// pulls pdf-lib into the initial bundle.
import type { PDFDocument } from 'pdf-lib';

export async function openPdf(bytes: Uint8Array): Promise<PDFDocument> {
  const { PDFDocument } = await import('pdf-lib');
  return PDFDocument.load(bytes, { updateMetadata: false });
}

export async function createPdf(): Promise<PDFDocument> {
  const { PDFDocument } = await import('pdf-lib');
  return PDFDocument.create({ updateMetadata: false });
}
