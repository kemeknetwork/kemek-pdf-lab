// Marks land where the preview showed them. The preview is a pdf.js viewport,
// so each case exports, renders the result through pdf.js, and reads back where
// the text sits on the DISPLAYED page (normalized, origin top-left) and at what
// on-screen angle.
import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { mergePdf } from './operator.js';
import { applyStamp } from './stamp.js';
import { applyWatermark } from './watermark.js';
import type { PageInfo } from './types.js';

async function where(bytes: Uint8Array, needle: string) {
	const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
	const page = await doc.getPage(1);
	const vp = page.getViewport({ scale: 1 });
	const item = (await page.getTextContent()).items.find((i) => 'str' in i && i.str.includes(needle));
	if (!item || !('transform' in item)) return null;
	const m = Util.transform(vp.transform, item.transform);
	return {
		x: m[4] / vp.width,
		y: m[5] / vp.height,
		angle: Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI),
		displayW: vp.width
	};
}

const shapes: Record<string, (p: import('pdf-lib').PDFPage) => void> = {
	'plain Letter': () => {},
	'CropBox inside the MediaBox': (p) => p.setCropBox(100, 100, 412, 592),
	'MediaBox not at the origin': (p) => p.setMediaBox(200, 300, 612, 792),
	'source /Rotate 90': (p) => p.setRotation(degrees(90)),
	'source /Rotate 270 with a CropBox': (p) => {
		p.setCropBox(50, 80, 500, 600);
		p.setRotation(degrees(270));
	}
};

async function source(shape: (p: import('pdf-lib').PDFPage) => void): Promise<Uint8Array> {
	const src = await PDFDocument.create();
	shape(src.addPage([612, 792]));
	return src.save();
}

const overlayPage = (extra: Partial<PageInfo> = {}): PageInfo => ({
	id: 'p',
	sourceDocumentId: 'd',
	originalIndex: 0,
	rotation: 0,
	annotations: [{ kind: 'text', id: 'a', x: 0.1, y: 0.1, text: 'OVERLAY', fontSize: 14, color: '#000000' }],
	...extra
});

describe('text overlays land where they were placed', () => {
	for (const [label, shape] of Object.entries(shapes)) {
		it(label, async () => {
			const out = await mergePdf([{ id: 'd', name: 'd.pdf', pdfBytes: await source(shape), pages: [], pageCount: 1 }], [overlayPage()]);
			const at = await where(out, 'OVERLAY');
			expect(at).not.toBeNull();
			expect(at!.x).toBeCloseTo(0.1, 3);
			expect(at!.y).toBeCloseTo(0.1, 3);
			expect(at!.angle).toBe(0);
		});
	}

	it('a user rotation turns the page and the overlay together', async () => {
		const out = await mergePdf([{ id: 'd', name: 'd.pdf', pdfBytes: await source(() => {}), pages: [], pageCount: 1 }], [overlayPage({ rotation: 90 })]);
		const at = await where(out, 'OVERLAY');
		// Rotated 90° clockwise with the page: top-left (0.1, 0.1) moves to the top-right.
		expect(at!.x).toBeCloseTo(0.9, 3);
		expect(at!.y).toBeCloseTo(0.1, 3);
		expect(at!.angle).toBe(90);
	});
});

describe('stamp and watermark sit on the page as displayed', () => {
	for (const [label, shape] of Object.entries(shapes)) {
		it(label, async () => {
			let out = await mergePdf([{ id: 'd', name: 'd.pdf', pdfBytes: await source(shape), pages: [], pageCount: 1 }], [overlayPage({ annotations: [] })]);
			out = await applyStamp(out, { template: 'PAGENUM {n}', start: 1, padWidth: 0, position: 'bottom-center', fontSize: 10, color: '#000000' });
			out = await applyWatermark(out, { kind: 'text', text: 'MARK', fontSize: 20, color: '#000000', opacity: 0.5, rotation: 0, position: 'top-left' });
			const stamp = await where(out, 'PAGENUM');
			expect(stamp!.angle).toBe(0);
			expect(stamp!.y).toBeGreaterThan(0.9); // near the bottom edge
			expect(stamp!.y).toBeLessThan(1);
			expect(stamp!.x).toBeGreaterThan(0.3); // centred, not off to one side
			expect(stamp!.x).toBeLessThan(0.5);
			const mark = await where(out, 'MARK');
			expect(mark!.angle).toBe(0);
			expect(mark!.x).toBeCloseTo(24 / mark!.displayW, 2); // the 24pt margin
			expect(mark!.y).toBeLessThan(0.15);
		});
	}
});

describe('signatures land in their box', () => {
	it('on a source-rotated page, the box keeps its displayed corner', async () => {
		const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
		const out = await mergePdf([{ id: 'd', name: 'd.pdf', pdfBytes: await source(shapes['source /Rotate 90']), pages: [], pageCount: 1 }], [
			overlayPage({ annotations: [{ kind: 'image', id: 's', x: 0.1, y: 0.2, width: 0.3, height: 0.1, imageBytes: PNG, imageMime: 'image/png' }] })
		]);
		const doc = await getDocument({ data: out.slice(), verbosity: 0 }).promise;
		const page = await doc.getPage(1);
		const vp = page.getViewport({ scale: 1 });
		const ops = await page.getOperatorList();
		// The CTM in force at the image paint maps the unit square; its (0,1) corner
		// is the image's top-left as displayed.
		let ctm = [1, 0, 0, 1, 0, 0];
		const stack: number[][] = [];
		let topLeft: number[] | null = null;
		for (let i = 0; i < ops.fnArray.length; i++) {
			const fn = ops.fnArray[i];
			if (fn === OPS.save) stack.push(ctm);
			else if (fn === OPS.restore) ctm = stack.pop()!;
			else if (fn === OPS.transform) ctm = Util.transform(ctm, ops.argsArray[i]);
			else if (fn === OPS.paintImageXObject) {
				const m = Util.transform(vp.transform, ctm);
				topLeft = [(m[2] + m[4]) / vp.width, (m[3] + m[5]) / vp.height];
			}
		}
		expect(topLeft).not.toBeNull();
		expect(topLeft![0]).toBeCloseTo(0.1, 3);
		expect(topLeft![1]).toBeCloseTo(0.2, 3);
	});
});
