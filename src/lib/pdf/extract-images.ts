// Pure helpers for "extract embedded images" — the decode/canvas/pdfjs work
// lives in the renderer shell; the filtering decisions live here so they're
// testable. The hard part of image extraction isn't pulling pixels out, it's
// NOT drowning the result in noise (1-bit stencil masks, tiny spacer/icon
// XObjects, repeated background tiles), so the keep/skip rule is the core logic.

/** Smallest image area worth extracting (≈16×16). Below this it's almost always
 *  a spacer, bullet, or mask artifact, not a real picture the user wants. */
export const MIN_IMAGE_AREA = 256;

/**
 * Whether a decoded image is worth including in the output. Skips degenerate
 * (zero) sizes and anything below {@link MIN_IMAGE_AREA}. Deliberately does NOT
 * filter on aspect ratio: a genuinely thin image (a banner, a scanned strip) is
 * a real image, and a graphic the PDF stored as horizontal slices is extracted
 * as those slices honestly rather than silently dropped.
 */
export function shouldKeepImage(width: number, height: number): boolean {
	if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
	if (width <= 0 || height <= 0) return false;
	return width * height >= MIN_IMAGE_AREA;
}

/**
 * Dedup key for a decoded image, from a hash of its encoded bytes plus length.
 * Content-based (not pdfjs objId) because the same reused image gets DIFFERENT
 * objIds on different pages — only the pixels are stable. Length guards against
 * the vanishingly unlikely CRC collision.
 */
export function imageDedupeKey(hash: number, byteLength: number): string {
	return `${hash >>> 0}:${byteLength}`;
}
