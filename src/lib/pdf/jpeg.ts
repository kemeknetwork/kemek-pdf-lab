// JPEG handling for images the USER brings in (imported photos, uploaded
// signatures, image watermarks). Pure byte work, no pdf-lib, so it stays
// synchronously importable and unit-testable.
//
// Two problems with handing a camera JPEG straight to pdf-lib's embedJpg, which
// stores the file's bytes verbatim as a DCTDecode stream:
//  1. Privacy. APP1 carries EXIF (GPS position, capture time, camera serial)
//     and XMP; APP13 carries IPTC; COM holds free-text comments. All of it would
//     ship inside every export. stripJpegMetadata() drops them.
//  2. Orientation. Phones store the sensor's raster and record the rotation in
//     the EXIF Orientation tag; PDF viewers ignore EXIF, so the photo would land
//     sideways. jpegOrientation() reads the tag BEFORE stripping, and
//     orientedPlacement() turns it into the drawImage parameters that paint the
//     stored raster upright.

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP14 = 0xee;
const COM = 0xfe;

/** EXIF orientation, 1 (upright) … 8. */
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

function isJpeg(b: Uint8Array): boolean {
	return b.length >= 4 && b[0] === 0xff && b[1] === SOI;
}

/** Walk the header segments up to (not including) SOS. */
function* segments(b: Uint8Array): Generator<{ marker: number; start: number; end: number }> {
	let i = 2;
	while (i + 4 <= b.length) {
		if (b[i] !== 0xff) return; // not at a marker: malformed, stop walking
		const marker = b[i + 1];
		if (marker === 0xff) {
			i += 1; // fill byte
			continue;
		}
		if (marker === SOS || marker === EOI) {
			yield { marker, start: i, end: b.length };
			return;
		}
		// Standalone markers (RSTn, TEM) carry no length.
		if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
			yield { marker, start: i, end: i + 2 };
			i += 2;
			continue;
		}
		const len = (b[i + 2] << 8) | b[i + 3];
		if (len < 2 || i + 2 + len > b.length) return;
		yield { marker, start: i, end: i + 2 + len };
		i += 2 + len;
	}
}

function hasPrefix(b: Uint8Array, at: number, ascii: string): boolean {
	for (let k = 0; k < ascii.length; k++) if (b[at + k] !== ascii.charCodeAt(k)) return false;
	return true;
}

/**
 * The EXIF Orientation tag (IFD0, 0x0112), or 1 when absent / unreadable /
 * not a JPEG. Never throws.
 */
export function jpegOrientation(b: Uint8Array): Orientation {
	if (!isJpeg(b)) return 1;
	for (const seg of segments(b)) {
		if (seg.marker === SOS) break;
		const body = seg.start + 4;
		if (seg.marker !== APP1 || !hasPrefix(b, body, 'Exif\0\0')) continue;
		const tiff = body + 6;
		const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
		const big = b[tiff] === 0x4d && b[tiff + 1] === 0x4d;
		if (!little && !big) return 1;
		const u16 = (o: number) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
		const u32 = (o: number) =>
			little
				? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
				: ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
		const ifd = tiff + u32(tiff + 4);
		if (ifd + 2 > seg.end) return 1;
		const count = u16(ifd);
		for (let n = 0; n < count; n++) {
			const entry = ifd + 2 + n * 12;
			if (entry + 12 > seg.end) return 1;
			if (u16(entry) !== 0x0112) continue;
			const value = u16(entry + 8);
			return value >= 1 && value <= 8 ? (value as Orientation) : 1;
		}
		return 1;
	}
	return 1;
}

/**
 * Copy of a JPEG with every metadata segment removed: APP1 (EXIF, XMP), APP3–
 * APP13 and APP15 (IPTC, vendor blocks, Photoshop), COM. Kept: APP0 (JFIF),
 * APP2 only when it is an ICC profile (colour fidelity), APP14 (the Adobe
 * segment that tells a decoder whether CMYK/YCC data is transformed), and every
 * non-APP segment and the entropy-coded data, byte for byte. A non-JPEG or a
 * malformed header is returned unchanged.
 */
export function stripJpegMetadata(b: Uint8Array): Uint8Array {
	if (!isJpeg(b)) return b;
	const keep: [number, number][] = [[0, 2]];
	let reachedScan = false;
	for (const seg of segments(b)) {
		if (seg.marker === SOS || seg.marker === EOI) {
			keep.push([seg.start, seg.end]);
			reachedScan = true;
			break;
		}
		const isApp = seg.marker >= APP0 && seg.marker <= 0xef;
		const drop =
			seg.marker === COM ||
			(isApp &&
				seg.marker !== APP0 &&
				seg.marker !== APP14 &&
				!(seg.marker === APP2 && hasPrefix(b, seg.start + 4, 'ICC_PROFILE\0')));
		if (!drop) keep.push([seg.start, seg.end]);
	}
	// A header we could not walk to the scan is left alone rather than truncated.
	if (!reachedScan) return b;
	const size = keep.reduce((n, [s, e]) => n + (e - s), 0);
	if (size === b.length) return b;
	const out = new Uint8Array(size);
	let at = 0;
	for (const [s, e] of keep) {
		out.set(b.subarray(s, e), at);
		at += e - s;
	}
	return out;
}

/** Orientations 5–8 swap the stored raster's axes. */
export function swapsAxes(o: Orientation): boolean {
	return o >= 5;
}

// For each orientation, where the stored image's unit square (u right, v up,
// PDF image space) lands in the upright display box (X, Y, both 0..1):
// X = a·u + c·v + e, Y = b·u + d·v + f. Derived from the EXIF definitions
// (which corner of the display row 0 / column 0 of the stored raster occupy).
const UNIT: Record<Orientation, [number, number, number, number, number, number]> = {
	1: [1, 0, 0, 1, 0, 0],
	2: [-1, 0, 0, 1, 1, 0],
	3: [-1, 0, 0, -1, 1, 1],
	4: [1, 0, 0, -1, 0, 1],
	5: [0, -1, -1, 0, 1, 1],
	6: [0, -1, 1, 0, 0, 1],
	7: [0, 1, 1, 0, 0, 0],
	8: [0, 1, -1, 0, 1, 0]
};

export interface ImagePlacement {
	x: number;
	y: number;
	width: number;
	height: number;
	/** Degrees counter-clockwise, as pdf-lib's drawImage `rotate` takes them. */
	rotate: number;
}

/**
 * pdf-lib drawImage parameters that paint a stored raster with EXIF orientation
 * `o` upright into `box` (lower-left x/y, display width/height in points), then
 * rotate the whole box by `rotate` degrees CCW about its lower-left corner (the
 * watermark's own rotation; 0 elsewhere). drawImage maps the unit square to
 * (x, y) + R(rotate)·(width·u, height·v); a negative width or height mirrors.
 */
export function orientedPlacement(
	o: Orientation,
	box: { x: number; y: number; width: number; height: number },
	rotate = 0
): ImagePlacement {
	const [a, b, c, d, e, f] = UNIT[o];
	const W = box.width;
	const H = box.height;
	// Columns of the local matrix: where unit u and unit v point inside the box.
	const ux = a * W;
	const uy = b * H;
	const vx = c * W;
	const vy = d * H;
	// Express [ux uy; vx vy] as R(theta)·diag(sx, sy): theta is the direction of
	// the u column, sx its length; sy is v's (signed) length along theta + 90°.
	const theta = Math.atan2(uy, ux);
	const sx = Math.hypot(ux, uy);
	const sy = -vx * Math.sin(theta) + vy * Math.cos(theta);
	const rho = (rotate * Math.PI) / 180;
	// Local origin offset, rotated by the box's own rotation about its corner.
	const ox = e * W;
	const oy = f * H;
	return {
		x: box.x + ox * Math.cos(rho) - oy * Math.sin(rho),
		y: box.y + ox * Math.sin(rho) + oy * Math.cos(rho),
		width: sx,
		height: sy,
		rotate: rotate + (theta * 180) / Math.PI
	};
}
