// PDF.js touches browser-only globals at import time (DOMMatrix, canvas,
// etc.), so we dynamic-import it to keep SvelteKit SSR from crashing.

import type { PDFDocumentProxy } from 'pdfjs-dist';

let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function getPdfjs() {
	if (!pdfjsLib) {
		pdfjsLib = await import('pdfjs-dist');
		pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
	}
	return pdfjsLib;
}

const docCache = new Map<string, PDFDocumentProxy>();

/**
 * Parse a PDF and cache it under {@link id} for later thumbnail rendering.
 * Must run before the document enters reactive state so {@link renderPage}
 * calls triggered by the Svelte re-render find the cache populated.
 */
export async function loadDocument(
	id: string,
	bytes: Uint8Array
): Promise<{ pageCount: number }> {
	const pdfjs = await getPdfjs();
	// slice() hands pdf.js a detached copy — otherwise the original Uint8Array
	// becomes unusable and later pdf-lib exports would crash.
	const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
	docCache.set(id, doc);
	return { pageCount: doc.numPages };
}

export async function renderPage(
	documentId: string,
	pageIndex: number,
	targetWidth: number = 300
): Promise<string> {
	const doc = docCache.get(documentId);
	if (!doc) throw new Error(`Document ${documentId} not loaded`);

	const page = await doc.getPage(pageIndex + 1);
	// Normalise scale to a target pixel width so cards look consistent
	// regardless of the source PDF's native DPI.
	const unscaledViewport = page.getViewport({ scale: 1 });
	const scale = targetWidth / unscaledViewport.width;
	const viewport = page.getViewport({ scale });

	const canvas = document.createElement('canvas');
	canvas.width = viewport.width;
	canvas.height = viewport.height;

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not get 2d context');

	await page.render({ canvas, canvasContext: ctx, viewport }).promise;

	return canvas.toDataURL('image/png');
}

export function releaseDocument(id: string): void {
	const doc = docCache.get(id);
	if (doc) {
		// pdfjs 6 removed PDFDocumentProxy.destroy(); teardown moved to the
		// loading task (aborts network + destroys the worker).
		doc.loadingTask.destroy();
		docCache.delete(id);
	}
}
