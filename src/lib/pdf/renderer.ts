/**
 * PDF rendering via PDF.js — lazy-loaded to avoid SSR crashes.
 *
 * PDF.js references browser-only globals (DOMMatrix, canvas, etc.) at import
 * time. SvelteKit SSR would fail, so we dynamically import pdfjs-dist on
 * first use, ensuring it only runs client-side.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist';

let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function getPdfjs() {
	if (!pdfjsLib) {
		pdfjsLib = await import('pdfjs-dist');
		pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
	}
	return pdfjsLib;
}

/** In-memory cache of parsed PDF documents keyed by document ID. */
const docCache = new Map<string, PDFDocumentProxy>();

/**
 * Parse a PDF and cache the result for thumbnail rendering.
 *
 * Must be called *before* the document enters reactive state so that
 * PageThumbnail components can render immediately when Svelte mounts them.
 */
export async function loadDocument(
	id: string,
	bytes: Uint8Array
): Promise<{ pageCount: number }> {
	const pdfjs = await getPdfjs();
	const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
	docCache.set(id, doc);
	return { pageCount: doc.numPages };
}

/**
 * Render a single page to a data-URL PNG at the given pixel width.
 * Scale is computed automatically from the source page dimensions.
 */
export async function renderPage(
	documentId: string,
	pageIndex: number,
	targetWidth: number = 300
): Promise<string> {
	const doc = docCache.get(documentId);
	if (!doc) throw new Error(`Document ${documentId} not loaded`);

	const page = await doc.getPage(pageIndex + 1);
	// Scale to fit a target pixel width regardless of source DPI
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

/** Destroy a cached PDF document and free its resources. */
export function releaseDocument(id: string): void {
	const doc = docCache.get(id);
	if (doc) {
		doc.destroy();
		docCache.delete(id);
	}
}
