// Where a point the user placed on screen lands in a PDF page's own coordinates.
//
// The preview shows a page the way pdf.js draws it: the VISIBLE box (CropBox
// clipped to the MediaBox, which need not start at 0,0) turned by the page's own
// /Rotate. Overlays, signatures and form rects are stored normalized to that
// view, origin top-left. PDF user space is the unrotated box, origin bottom-left.
// Export used to map straight onto getSize() from (0,0), which put marks off the
// visible page on cropped pages and mirrored them on rotated ones.
//
// Pure, so it is tested against pdf.js's own viewport inverse (page-geometry.test.ts).

export type QuarterTurn = 0 | 90 | 180 | 270;

export interface PageFrame {
	/** Visible box in user space: [x0, y0, x1, y1] with x0 < x1, y0 < y1. */
	box: [number, number, number, number];
	/** Clockwise display rotation, as /Rotate. */
	rotate: QuarterTurn;
}

type Box = { x: number; y: number; width: number; height: number };

/** The frame a pdf-lib page is displayed in; `rotate` defaults to its /Rotate. */
export function pageFrame(
	page: { getMediaBox(): Box; getCropBox(): Box; getRotation(): { angle: number } },
	rotate = page.getRotation().angle
): PageFrame {
	return { box: visibleBox(page.getMediaBox(), page.getCropBox()), rotate: normalizeRotation(rotate) };
}

export function normalizeRotation(deg: number): QuarterTurn {
	const r = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
	return r as QuarterTurn;
}

/** The visible box: CropBox ∩ MediaBox, as pdf.js computes `page.view`. Falls back
 *  to the MediaBox when the two don't overlap. */
export function visibleBox(
	media: { x: number; y: number; width: number; height: number },
	crop: { x: number; y: number; width: number; height: number }
): [number, number, number, number] {
	const m = [media.x, media.y, media.x + media.width, media.y + media.height];
	const c = [crop.x, crop.y, crop.x + crop.width, crop.y + crop.height];
	const lo = (a: number, b: number) => Math.min(a, b);
	const hi = (a: number, b: number) => Math.max(a, b);
	const mx0 = lo(m[0], m[2]), mx1 = hi(m[0], m[2]), my0 = lo(m[1], m[3]), my1 = hi(m[1], m[3]);
	const cx0 = lo(c[0], c[2]), cx1 = hi(c[0], c[2]), cy0 = lo(c[1], c[3]), cy1 = hi(c[1], c[3]);
	const x0 = Math.max(mx0, cx0), x1 = Math.min(mx1, cx1), y0 = Math.max(my0, cy0), y1 = Math.min(my1, cy1);
	return x0 < x1 && y0 < y1 ? [x0, y0, x1, y1] : [mx0, my0, mx1, my1];
}

/** Displayed width and height in points. */
export function displaySize(frame: PageFrame): { width: number; height: number } {
	const [x0, y0, x1, y1] = frame.box;
	const w = x1 - x0;
	const h = y1 - y0;
	return frame.rotate === 90 || frame.rotate === 270 ? { width: h, height: w } : { width: w, height: h };
}

/** A point given normalized to the displayed page (0..1, origin top-left) in
 *  user space. */
export function toUserSpace(frame: PageFrame, u: number, v: number): { x: number; y: number } {
	const [x0, y0, x1, y1] = frame.box;
	const w = x1 - x0;
	const h = y1 - y0;
	switch (frame.rotate) {
		case 90:
			return { x: x0 + v * w, y: y0 + u * h };
		case 180:
			return { x: x1 - u * w, y: y0 + v * h };
		case 270:
			return { x: x1 - v * w, y: y1 - u * h };
		default:
			return { x: x0 + u * w, y: y1 - v * h };
	}
}

/**
 * A point given in DISPLAY points, origin bottom-left (how watermarkPlacements
 * reports), in user space. Display axes are user axes turned by `rotate`, so a
 * mark drawn there with `rotate` degrees CCW added to its own angle reads upright
 * on screen.
 */
export function displayToUserSpace(frame: PageFrame, x: number, y: number): { x: number; y: number } {
	const { width, height } = displaySize(frame);
	return toUserSpace(frame, x / width, 1 - y / height);
}

/** Offset (dx, dy) given in display axes, turned into user-space axes. */
export function rotateOffset(frame: PageFrame, dx: number, dy: number): { x: number; y: number } {
	const r = (frame.rotate * Math.PI) / 180;
	return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}
