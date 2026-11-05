// Every image the USER supplies (an imported photo, an uploaded signature, an
// image watermark) is embedded through here, never with a bare embedJpg:
// pdf-lib stores a JPEG's bytes verbatim, EXIF and all (GPS position, capture
// time, camera serial), and PDF viewers ignore its Orientation tag. PNGs are
// re-encoded by pdf-lib, which already drops their text and eXIf chunks.
// pdf-doc.test.ts fails on an embedJpg call anywhere else.
import type { PDFDocument, PDFImage, PDFPage } from 'pdf-lib';
import { jpegOrientation, orientedPlacement, stripJpegMetadata, swapsAxes, type Orientation } from './jpeg.js';

export interface UserImage {
	image: PDFImage;
	orientation: Orientation;
	/** Upright (display) size in image pixels: the stored size, axes swapped for EXIF 5–8. */
	width: number;
	height: number;
}

export async function embedUserImage(
	pdf: PDFDocument,
	bytes: Uint8Array,
	mime: 'image/png' | 'image/jpeg'
): Promise<UserImage> {
	if (mime === 'image/png') {
		const image = await pdf.embedPng(bytes);
		return { image, orientation: 1, width: image.width, height: image.height };
	}
	const orientation = jpegOrientation(bytes);
	const image = await pdf.embedJpg(stripJpegMetadata(bytes));
	const swap = swapsAxes(orientation);
	return { image, orientation, width: swap ? image.height : image.width, height: swap ? image.width : image.height };
}

/** Draw `img` upright into `box` (PDF points, lower-left origin), optionally
 *  rotated `rotate` degrees CCW about the box's lower-left corner. */
export async function drawUserImage(
	page: PDFPage,
	img: UserImage,
	box: { x: number; y: number; width: number; height: number },
	opts: { rotate?: number; opacity?: number } = {}
): Promise<void> {
	const { degrees } = await import('pdf-lib');
	const p = orientedPlacement(img.orientation, box, opts.rotate ?? 0);
	page.drawImage(img.image, {
		x: p.x,
		y: p.y,
		width: p.width,
		height: p.height,
		rotate: degrees(p.rotate),
		opacity: opts.opacity
	});
}
