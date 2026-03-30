import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const docCache = new Map<string, PDFDocumentProxy>();

export async function loadDocument(
  id: string,
  bytes: Uint8Array
): Promise<{ pageCount: number }> {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  docCache.set(id, doc);
  return { pageCount: doc.numPages };
}

export async function renderPage(
  documentId: string,
  pageIndex: number,
  scale: number = 1
): Promise<string> {
  const doc = docCache.get(documentId);
  if (!doc) throw new Error(`Document ${documentId} not loaded`);

  // PDF.js pages are 1-indexed
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');

  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas.toDataURL('image/png');
}

export function releaseDocument(id: string): void {
  const doc = docCache.get(id);
  if (doc) {
    doc.destroy();
    docCache.delete(id);
  }
}
