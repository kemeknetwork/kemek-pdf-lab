import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { jpegOrientation, orientedPlacement, stripJpegMetadata, type Orientation } from './jpeg.js';
import { JPG_1X1 } from './test-images.js';

function segment(marker: number, body: Uint8Array): Uint8Array {
	const len = body.length + 2;
	return Uint8Array.from([0xff, marker, len >> 8, len & 0xff, ...body]);
}

const ascii = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

/** EXIF APP1 holding an Orientation tag and a GPS-like marker string. */
function exifSegment(orientation: number, little = true): Uint8Array {
	const tiff = new Uint8Array(8 + 2 + 12 + 4);
	const dv = new DataView(tiff.buffer);
	tiff.set(ascii(little ? 'II' : 'MM'), 0);
	dv.setUint16(2, 42, little);
	dv.setUint32(4, 8, little);
	dv.setUint16(8, 1, little);
	dv.setUint16(10, 0x0112, little);
	dv.setUint16(12, 3, little);
	dv.setUint32(14, 1, little);
	dv.setUint16(18, orientation, little);
	return segment(0xe1, Uint8Array.from([...ascii('Exif\0\0'), ...tiff, ...ascii('GPS=40.7488N,73.9854W')]));
}

/** JPG_1X1 with extra header segments inserted after its APP0. */
function withSegments(...segs: Uint8Array[]): Uint8Array {
	const app0End = 2 + 2 + ((JPG_1X1[4] << 8) | JPG_1X1[5]);
	return Uint8Array.from([...JPG_1X1.subarray(0, app0End), ...segs.flatMap((s) => [...s]), ...JPG_1X1.subarray(app0End)]);
}

const includes = (hay: Uint8Array, needle: Uint8Array) =>
	Buffer.from(hay).includes(Buffer.from(needle));

describe('jpegOrientation', () => {
	it('reads the EXIF tag in both byte orders', () => {
		expect(jpegOrientation(withSegments(exifSegment(6)))).toBe(6);
		expect(jpegOrientation(withSegments(exifSegment(8, false)))).toBe(8);
	});

	it('is 1 without EXIF, for non-JPEG bytes and for out-of-range values', () => {
		expect(jpegOrientation(JPG_1X1)).toBe(1);
		expect(jpegOrientation(ascii('%PDF-1.7'))).toBe(1);
		expect(jpegOrientation(withSegments(exifSegment(9)))).toBe(1);
	});

	it('never throws on a truncated header', () => {
		const exif = withSegments(exifSegment(6));
		for (let n = 0; n < exif.length; n += 7) expect(() => jpegOrientation(exif.subarray(0, n))).not.toThrow();
	});
});

describe('stripJpegMetadata', () => {
	it('drops EXIF, XMP, IPTC and comments, keeps JFIF, ICC, Adobe and the image data', async () => {
		const icc = segment(0xe2, Uint8Array.from([...ascii('ICC_PROFILE\0'), 1, 1, 9, 9]));
		const adobe = segment(0xee, ascii('Adobe\0\x64\0\0\0\0\x01'));
		const xmp = segment(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>XMP-AUTHOR</x:xmpmeta>'));
		const iptc = segment(0xed, ascii('Photoshop 3.0\0IPTC-BYLINE'));
		const com = segment(0xfe, ascii('COMMENT-SERIAL-0042'));
		const input = withSegments(exifSegment(6), icc, xmp, adobe, iptc, com);

		const out = stripJpegMetadata(input);
		for (const secret of ['GPS=40.7488N', 'XMP-AUTHOR', 'IPTC-BYLINE', 'COMMENT-SERIAL']) {
			expect(includes(input, ascii(secret))).toBe(true); // positive control
			expect(includes(out, ascii(secret))).toBe(false);
		}
		expect(includes(out, icc)).toBe(true);
		expect(includes(out, adobe)).toBe(true);
		expect(out.length).toBe(input.length - exifSegment(6).length - xmp.length - iptc.length - com.length);
		// What remains is still a JPEG pdf-lib embeds.
		const pdf = await PDFDocument.create();
		const img = await pdf.embedJpg(out);
		expect([img.width, img.height]).toEqual([1, 1]);
	});

	it('returns a clean JPEG and non-JPEG bytes unchanged', () => {
		expect(stripJpegMetadata(JPG_1X1)).toBe(JPG_1X1);
		const notJpeg = ascii('%PDF-1.7');
		expect(stripJpegMetadata(notJpeg)).toBe(notJpeg);
	});
});

describe('orientedPlacement', () => {
	// Where the stored raster's top-left and top-right corners must appear in the
	// display, straight from the EXIF definitions of each orientation.
	const EXPECT: Record<Orientation, [string, string]> = {
		1: ['TL', 'TR'],
		2: ['TR', 'TL'],
		3: ['BR', 'BL'],
		4: ['BL', 'BR'],
		5: ['TL', 'BL'],
		6: ['TR', 'BR'],
		7: ['BR', 'TR'],
		8: ['BL', 'TL']
	};
	const box = { x: 100, y: 50, width: 40, height: 30 };
	const corner = (name: string, rotate: number) => {
		const local = {
			TL: [0, box.height],
			TR: [box.width, box.height],
			BL: [0, 0],
			BR: [box.width, 0]
		}[name]!;
		const r = (rotate * Math.PI) / 180;
		return [
			box.x + local[0] * Math.cos(r) - local[1] * Math.sin(r),
			box.y + local[0] * Math.sin(r) + local[1] * Math.cos(r)
		];
	};
	// drawImage: (x, y) + R(rotate)·(width·u, height·v), stored top row at v = 1.
	const paint = (p: ReturnType<typeof orientedPlacement>, u: number, v: number) => {
		const r = (p.rotate * Math.PI) / 180;
		const px = p.width * u;
		const py = p.height * v;
		return [p.x + px * Math.cos(r) - py * Math.sin(r), p.y + px * Math.sin(r) + py * Math.cos(r)];
	};

	for (const rotate of [0, 90, 37]) {
		for (const o of [1, 2, 3, 4, 5, 6, 7, 8] as Orientation[]) {
			it(`orientation ${o}, box rotated ${rotate}°`, () => {
				const p = orientedPlacement(o, box, rotate);
				const [tl, tr] = EXPECT[o];
				const got = [paint(p, 0, 1), paint(p, 1, 1)];
				const want = [corner(tl, rotate), corner(tr, rotate)];
				for (let k = 0; k < 2; k++) {
					expect(got[k][0]).toBeCloseTo(want[k][0], 6);
					expect(got[k][1]).toBeCloseTo(want[k][1], 6);
				}
			});
		}
	}
});
