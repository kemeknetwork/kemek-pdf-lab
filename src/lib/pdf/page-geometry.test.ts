import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
	displaySize,
	displayToUserSpace,
	normalizeRotation,
	rotateOffset,
	toUserSpace,
	visibleBox,
	type PageFrame,
	type QuarterTurn
} from './page-geometry.js';

// The preview IS a pdf.js viewport, so its inverse is the ground truth: a point
// the user placed at (u, v) of the displayed page must map wherever pdf.js says.
// Real pages, so pdf.js's own visible-box computation is exercised too.
describe('toUserSpace matches the pdf.js viewport inverse', () => {
	const cases: { media: [number, number, number, number]; crop?: [number, number, number, number] }[] = [
		{ media: [0, 0, 612, 792] },
		{ media: [0, 0, 612, 792], crop: [100, 100, 512, 692] },
		{ media: [200, 300, 812, 1092] }
	];
	for (const { media, crop } of cases) {
		for (const rotate of [0, 90, 180, 270] as QuarterTurn[]) {
			it(`media ${media.join(',')}${crop ? ` crop ${crop.join(',')}` : ''} rotated ${rotate}`, async () => {
				const pdf = await PDFDocument.create();
				const page = pdf.addPage();
				page.setMediaBox(media[0], media[1], media[2] - media[0], media[3] - media[1]);
				if (crop) page.setCropBox(crop[0], crop[1], crop[2] - crop[0], crop[3] - crop[1]);
				page.setRotation(degrees(rotate));
				const doc = await getDocument({ data: await pdf.save(), verbosity: 0 }).promise;
				const viewport = (await doc.getPage(1)).getViewport({ scale: 1 });
				const frame: PageFrame = {
					box: visibleBox(page.getMediaBox(), page.getCropBox()),
					rotate: normalizeRotation(page.getRotation().angle)
				};
				const size = displaySize(frame);
				expect(size.width).toBeCloseTo(viewport.width, 6);
				expect(size.height).toBeCloseTo(viewport.height, 6);
				for (const [u, v] of [[0, 0], [1, 0], [0, 1], [0.1, 0.1], [0.73, 0.4]]) {
					const [px, py] = viewport.convertToPdfPoint(u * viewport.width, v * viewport.height);
					const got = toUserSpace(frame, u, v);
					expect(got.x).toBeCloseTo(px, 6);
					expect(got.y).toBeCloseTo(py, 6);
				}
			});
		}
	}
});

describe('display axes', () => {
	it('displayToUserSpace takes bottom-left display points', () => {
		const frame: PageFrame = { box: [0, 0, 200, 100], rotate: 90 };
		// Display is 100 wide, 200 tall; its bottom-left is user (200, 0).
		expect(displayToUserSpace(frame, 0, 0)).toEqual({ x: 200, y: 0 });
		expect(displayToUserSpace(frame, 100, 200)).toEqual({ x: 0, y: 100 });
	});

	it('rotateOffset turns a display step into the matching user-space step', () => {
		for (const rotate of [0, 90, 180, 270] as QuarterTurn[]) {
			const frame: PageFrame = { box: [0, 0, 300, 500], rotate };
			const { width, height } = displaySize(frame);
			const a = displayToUserSpace(frame, 10, 20);
			const b = displayToUserSpace(frame, 10 + 7, 20 - 3);
			const step = rotateOffset(frame, 7, -3);
			expect(b.x - a.x).toBeCloseTo(step.x, 6);
			expect(b.y - a.y).toBeCloseTo(step.y, 6);
			expect(width * height).toBe(150_000);
		}
	});
});

describe('visibleBox / normalizeRotation', () => {
	it('clips the CropBox to the MediaBox, and falls back when they do not meet', () => {
		const media = { x: 0, y: 0, width: 612, height: 792 };
		expect(visibleBox(media, { x: 100, y: -50, width: 800, height: 400 })).toEqual([100, 0, 612, 350]);
		expect(visibleBox(media, { x: 1000, y: 1000, width: 10, height: 10 })).toEqual([0, 0, 612, 792]);
	});

	it('folds any multiple of 90 into 0..270', () => {
		expect(normalizeRotation(-90)).toBe(270);
		expect(normalizeRotation(450)).toBe(90);
		expect(normalizeRotation(360)).toBe(0);
	});
});
