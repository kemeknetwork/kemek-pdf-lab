// PDF.js touches browser-only globals at import time (DOMMatrix, canvas,
// etc.), so we dynamic-import it to keep SvelteKit SSR from crashing.

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { buildFormFields, normalizeRect, type RawWidget } from './form-detect.js';
import type { FormField, FormFieldOption } from './types.js';

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

/**
 * Render the first page of an arbitrary PDF byte stream to a PNG data URL via
 * a throwaway pdf.js document torn down immediately after. The watermark
 * preview rasterizes real engine output through this rather than re-deriving
 * placement geometry in the DOM, so the preview is pixel-identical to export.
 */
export async function renderBytesFirstPage(
	bytes: Uint8Array,
	targetWidth: number = 360
): Promise<string> {
	const pdfjs = await getPdfjs();
	// slice() detaches a copy — pdf.js takes ownership of the buffer and would
	// otherwise leave the caller's Uint8Array unusable for a later re-render.
	const task = pdfjs.getDocument({ data: bytes.slice() });
	const doc = await task.promise;
	try {
		const page = await doc.getPage(1);
		const unscaled = page.getViewport({ scale: 1 });
		const viewport = page.getViewport({ scale: targetWidth / unscaled.width });

		const canvas = document.createElement('canvas');
		canvas.width = viewport.width;
		canvas.height = viewport.height;

		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Could not get 2d context');

		await page.render({ canvas, canvasContext: ctx, viewport }).promise;
		return canvas.toDataURL('image/png');
	} finally {
		task.destroy();
	}
}

/**
 * Detect AcroForm fields across every page of a loaded document for the fill
 * UI. pdfjs returns widget annotations already mapped to their page, with rects
 * in PDF coordinates; we convert each to 0..1 viewport space (the coord system
 * the overlay layer positions in) and hand the flat list to buildFormFields,
 * which groups widgets into fields. Export does NOT use these descriptors — it
 * re-derives fields by name via pdf-lib — so detection is purely cosmetic and a
 * parse failure on one page degrades to "fewer fields", never a thrown export.
 */
export async function detectFormFields(documentId: string): Promise<FormField[]> {
	const doc = docCache.get(documentId);
	if (!doc) throw new Error(`Document ${documentId} not loaded`);

	const raws: RawWidget[] = [];
	for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex++) {
		const page = await doc.getPage(pageIndex + 1);
		const viewport = page.getViewport({ scale: 1 });

		let annotations: Array<Record<string, unknown>> = [];
		try {
			annotations = (await page.getAnnotations()) as Array<Record<string, unknown>>;
		} catch {
			continue;
		}

		for (const a of annotations) {
			if (a.subtype !== 'Widget') continue;
			const name = a.fieldName;
			if (typeof name !== 'string' || name.length === 0) continue;
			if (!Array.isArray(a.rect) || a.rect.length !== 4) continue;

			const vrect = viewport.convertToViewportRectangle(a.rect as number[]) as [
				number,
				number,
				number,
				number
			];
			const tu = typeof a.alternativeText === 'string' ? a.alternativeText.trim() : '';

			raws.push({
				name,
				fieldType: typeof a.fieldType === 'string' ? a.fieldType : '',
				radioButton: a.radioButton === true,
				pushButton: a.pushButton === true,
				combo: a.combo === true,
				readOnly: a.readOnly === true,
				required: a.required === true,
				multiline: a.multiLine === true,
				maxLen: typeof a.maxLen === 'number' && a.maxLen > 0 ? a.maxLen : undefined,
				label: tu || undefined,
				onValue: choiceOnValue(a),
				options: choiceOptions(a),
				rect: normalizeRect(vrect, viewport.width, viewport.height),
				pageIndex
			});
		}
	}

	return buildFormFields(raws);
}

/** Checkbox/radio on-value: pdfjs exposes it as exportValue (checkbox) or
 *  buttonValue (radio) depending on the widget. */
function choiceOnValue(a: Record<string, unknown>): string | undefined {
	if (typeof a.exportValue === 'string') return a.exportValue;
	if (typeof a.buttonValue === 'string') return a.buttonValue;
	return undefined;
}

function choiceOptions(a: Record<string, unknown>): FormFieldOption[] | undefined {
	if (!Array.isArray(a.options)) return undefined;
	return (a.options as Array<Record<string, unknown>>).map((o) => {
		const value = typeof o.exportValue === 'string' ? o.exportValue : String(o.exportValue ?? '');
		const label = typeof o.displayValue === 'string' ? o.displayValue : value;
		return { value, label: label || value };
	});
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
