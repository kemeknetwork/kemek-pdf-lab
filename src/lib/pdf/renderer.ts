// PDF.js touches browser-only globals at import time (DOMMatrix, canvas,
// etc.), so we dynamic-import it to keep SvelteKit SSR from crashing.

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { buildFormFields, normalizeRect, type RawWidget } from './form-detect.js';
import { shouldKeepImage, imageDedupeKey } from './extract-images.js';
import { buildMetadataFields, type DocumentMetadata } from './inspect.js';
import { assembleText, type TextPiece } from './text-extract.js';
import { crc32 } from '$lib/utils/zip.js';
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
 * Whether a document is still parsed and cached. A thumbnail render that loses
 * the race against {@link releaseAll} (workspace Clear, or a page reload) throws
 * "not loaded"; callers use this to tell that benign teardown apart from a real
 * render failure, so the expected race doesn't surface as a console error.
 */
export function hasDocument(id: string): boolean {
	return docCache.has(id);
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
 * Rasterize every page of an arbitrary PDF byte stream to image blobs (PNG/JPEG)
 * — the engine behind "export as images". Render the EXPORT output (post merge /
 * reorder / rotation / watermark) through this so the images match what would be
 * exported. The canvas is filled white first: PDF pages are transparent, so JPEG
 * would go black and PNG would lose the paper, neither of which is what "a page
 * as an image" should look like.
 */
export async function renderBytesToImages(
	bytes: Uint8Array,
	opts: { mime: 'image/png' | 'image/jpeg'; dpi?: number; quality?: number }
): Promise<Blob[]> {
	const pdfjs = await getPdfjs();
	const task = pdfjs.getDocument({ data: bytes.slice() });
	const doc = await task.promise;
	try {
		const scale = (opts.dpi ?? 150) / 72;
		const blobs: Blob[] = [];
		for (let i = 1; i <= doc.numPages; i++) {
			const page = await doc.getPage(i);
			const viewport = page.getViewport({ scale });

			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.ceil(viewport.width));
			canvas.height = Math.max(1, Math.ceil(viewport.height));

			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Could not get 2d context');
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			await page.render({ canvas, canvasContext: ctx, viewport }).promise;

			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, opts.mime, opts.quality)
			);
			if (!blob) throw new Error(`Could not encode page ${i} as ${opts.mime}`);
			blobs.push(blob);
		}
		return blobs;
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

			// pdfjs 6.1 removed convertToViewportRectangle. It applied the viewport
			// transform to the rect's two corners — exactly what convertToViewportPoint
			// still does per-point, so two calls reproduce it. Rotation can return the
			// corners unordered; normalizeRect min/maxes them.
			const pdfRect = a.rect as number[];
			const [vx1, vy1] = viewport.convertToViewportPoint(pdfRect[0], pdfRect[1]) as number[];
			const [vx2, vy2] = viewport.convertToViewportPoint(pdfRect[2], pdfRect[3]) as number[];
			const vrect: [number, number, number, number] = [vx1, vy1, vx2, vy2];
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

/**
 * Read a loaded document's metadata for the inspector (4.4): the Info dict
 * (via pdfjs getMetadata), XMP presence, structural flags (form / XFA), and the
 * privacy-relevant extras (attachments, document-level JavaScript). Strictly
 * read-only — the actual removal is a separate export pass (stripMetadata). Each
 * probe is independently guarded so one unsupported call can't sink the panel.
 */
export async function inspectDocument(documentId: string, name: string): Promise<DocumentMetadata> {
	const doc = docCache.get(documentId);
	if (!doc) throw new Error(`Document ${documentId} not loaded`);

	let info: Record<string, unknown> = {};
	let hasXmp = false;
	try {
		const md = await doc.getMetadata();
		info = (md?.info ?? {}) as Record<string, unknown>;
		hasXmp = Boolean(md?.metadata);
	} catch {
		/* document reports no metadata */
	}

	return {
		id: documentId,
		name,
		pageCount: doc.numPages,
		version: typeof info.PDFFormatVersion === 'string' ? info.PDFFormatVersion : null,
		fields: buildMetadataFields(info),
		hasXmp,
		hasAcroForm: info.IsAcroFormPresent === true,
		hasXfa: info.IsXFAPresent === true,
		hasJavaScript: await probeJavaScript(doc),
		attachmentCount: await countAttachments(doc),
		encrypted: typeof info.EncryptFilterName === 'string'
	};
}

async function countAttachments(doc: PDFDocumentProxy): Promise<number> {
	try {
		const attachments = await doc.getAttachments();
		return attachments ? Object.keys(attachments).length : 0;
	} catch {
		return 0;
	}
}

/** Document-level JavaScript actions (OpenAction etc.). Field-level JS isn't
 *  probed — doc-level is the meaningful "this PDF can run code" signal. */
async function probeJavaScript(doc: PDFDocumentProxy): Promise<boolean> {
	try {
		const actions = await (
			doc as unknown as { getJSActions(): Promise<Record<string, unknown> | null> }
		).getJSActions();
		return Boolean(actions) && Object.keys(actions!).length > 0;
	} catch {
		return false;
	}
}

interface PdfImage {
	width?: number;
	height?: number;
	bitmap?: CanvasImageSource;
	data?: Uint8Array | Uint8ClampedArray;
	kind?: number;
}

// Reshape a raw pdfjs pixel buffer to RGBA for putImageData. pdfjs ImageKind:
// 2 = RGB_24BPP, 3 = RGBA_32BPP, 1 = GRAYSCALE_1BPP (a stencil mask — skip, it's
// not a photo). In the browser pdfjs usually hands back an ImageBitmap instead,
// so this raw path is the fallback.
function rawToRgba(
	data: Uint8Array | Uint8ClampedArray,
	w: number,
	h: number,
	kind?: number
): Uint8ClampedArray<ArrayBuffer> | null {
	const px = w * h;
	const out = new Uint8ClampedArray(px * 4); // ArrayBuffer-backed (ImageData needs that)
	if (kind === 3 || data.length >= px * 4) {
		out.set(data.subarray(0, px * 4));
		return out;
	}
	if (kind === 2 || data.length >= px * 3) {
		for (let i = 0, j = 0; i < px; i++) {
			out[j++] = data[i * 3];
			out[j++] = data[i * 3 + 1];
			out[j++] = data[i * 3 + 2];
			out[j++] = 255;
		}
		return out;
	}
	return null;
}

// Fetch a decoded image object from pdfjs. Two gotchas: (1) globally-shared
// images (objId starts with "g_") live in page.commonObjs, page-local ones in
// page.objs; (2) resolution is async — the no-callback get() throws "not
// resolved yet", so use the callback form, which fires when the decode (kicked
// off by the page render) completes. A short timeout guards against an id that
// never resolves so the extract can't hang.
function getImageObj(page: PDFPageProxy, id: string): Promise<PdfImage | null> {
	const store = id.startsWith('g_') ? page.commonObjs : page.objs;
	return new Promise((resolve) => {
		let done = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const finish = (obj: PdfImage | null) => {
			if (done) return;
			done = true;
			if (timer) clearTimeout(timer);
			resolve(obj ?? null);
		};
		try {
			(store as unknown as { get(id: string, cb: (obj: PdfImage) => void): void }).get(id, finish);
		} catch {
			finish(null);
		}
		// Only arm the timeout if the callback didn't already resolve synchronously.
		if (!done) timer = setTimeout(() => finish(null), 2000);
	});
}

async function imageToBlob(img: PdfImage): Promise<Blob | null> {
	const w = img.width ?? 0;
	const h = img.height ?? 0;
	if (w <= 0 || h <= 0) return null;

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	if (img.bitmap) {
		ctx.drawImage(img.bitmap, 0, 0);
	} else if (img.data) {
		const rgba = rawToRgba(img.data, w, h, img.kind);
		if (!rgba) return null;
		ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
	} else {
		return null;
	}
	// PNG to preserve quality + any alpha — these are the original images, not
	// a re-render of a page.
	return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Extract the embedded raster images from a document as PNG blobs. Walks each
 * page's operator list for paintImageXObject ops and pulls the decoded image out
 * of pdfjs. Two non-obvious constraints drive the shape: (1) image objects are
 * only resolved AFTER the page renders (they throw "not resolved yet"
 * otherwise), so each page is rendered to a throwaway canvas first; (2) the same
 * reused image gets DIFFERENT objIds on different pages, so dedup is by decoded
 * content (CRC of the PNG bytes), not objId. Tiny artifacts / mask bits are
 * filtered. Vector graphics and stencil masks are intentionally not extracted.
 */
export async function extractEmbeddedImages(documentId: string): Promise<Blob[]> {
	const doc = docCache.get(documentId);
	if (!doc) throw new Error(`Document ${documentId} not loaded`);
	const pdfjs = await getPdfjs();
	const PAINT = pdfjs.OPS.paintImageXObject;
	const REPEAT = pdfjs.OPS.paintImageXObjectRepeat;

	const seenIds = new Set<string>();
	const seenContent = new Set<string>();
	const out: Blob[] = [];

	for (let p = 1; p <= doc.numPages; p++) {
		const page = await doc.getPage(p);

		// Rendering decodes + resolves the image XObjects into page.objs.
		const viewport = page.getViewport({ scale: 1 });
		const rc = document.createElement('canvas');
		rc.width = Math.max(1, Math.ceil(viewport.width));
		rc.height = Math.max(1, Math.ceil(viewport.height));
		const rctx = rc.getContext('2d');
		if (rctx) {
			try {
				await page.render({ canvas: rc, canvasContext: rctx, viewport }).promise;
			} catch {
				// a page that fails to render still shouldn't sink the whole extract
			}
		}

		const opList = await page.getOperatorList();
		for (let i = 0; i < opList.fnArray.length; i++) {
			const fn = opList.fnArray[i];
			// paintImageXObject carries the image id at arg 0; the tiled/repeat
			// variant at arg 1 — both reference the same image stores, so a
			// background image painted only via repeat is captured too.
			const id =
				fn === PAINT
					? opList.argsArray[i]?.[0]
					: fn === REPEAT
						? opList.argsArray[i]?.[1]
						: undefined;
			if (typeof id !== 'string' || seenIds.has(id)) continue;
			seenIds.add(id);

			const img = await getImageObj(page, id);
			if (!img || !shouldKeepImage(img.width ?? 0, img.height ?? 0)) continue;

			const blob = await imageToBlob(img);
			if (!blob) continue;

			const bytes = new Uint8Array(await blob.arrayBuffer());
			const key = imageDedupeKey(crc32(bytes), bytes.length);
			if (seenContent.has(key)) continue;
			seenContent.add(key);
			out.push(blob);
		}
	}
	return out;
}

/**
 * Extract selectable text (4.5) in the workspace's CURRENT page order — so
 * reorder/delete are reflected, unlike extractEmbeddedImages which pulls from
 * source originals. Each page's positioned text runs (pdfjs getTextContent) are
 * reassembled into reading order by the pure {@link assembleText}; pages are
 * joined by a blank line. A page that has no text layer (scanned image) simply
 * contributes nothing, and a per-page failure never sinks the whole extract.
 */
export async function extractText(
	pages: { sourceDocumentId: string; originalIndex: number }[]
): Promise<string> {
	const out: string[] = [];
	for (const p of pages) {
		const doc = docCache.get(p.sourceDocumentId);
		if (!doc) continue;

		let pageText = '';
		try {
			const page = await doc.getPage(p.originalIndex + 1);
			const content = await page.getTextContent();
			const pieces: TextPiece[] = [];
			for (const item of content.items) {
				// getTextContent yields TextItem | TextMarkedContent; only the former
				// carries str/transform. Skip the marked-content markers.
				if (!('str' in item)) continue;
				const ti = item as { str: string; transform: number[]; width: number; height: number };
				const transform = ti.transform ?? [1, 0, 0, 1, 0, 0];
				pieces.push({
					str: ti.str,
					x: transform[4],
					y: transform[5],
					width: ti.width ?? 0,
					height: ti.height || Math.hypot(transform[2], transform[3]) || 12
				});
			}
			pageText = assembleText(pieces);
		} catch (e) {
			// A page that fails to extract contributes nothing rather than sinking the
			// whole document — but log it so a systematic failure isn't silent.
			console.warn(`Text extraction failed for page ${p.originalIndex + 1}:`, e);
		}
		out.push(pageText);
	}

	return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Release EVERY cached document — the teardown behind workspace Clear, so the
 * "forget everything" action truly forgets everything: including a document that
 * was undone out of the workspace but deliberately kept in the cache for a
 * synchronous redo (see app.svelte.ts add-document undo). Releasing only the
 * live `documents[]` would miss those orphans and leave a parsed PDF alive in
 * worker memory past Clear — a privacy-posture gap, not just a leak.
 *
 * pdfjs 6 removed PDFDocumentProxy.destroy(); teardown is via the loading task
 * (aborts network + destroys the worker).
 */
export function releaseAll(): void {
	for (const doc of docCache.values()) doc.loadingTask.destroy();
	docCache.clear();
}
