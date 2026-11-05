// Page-numbering / header-footer stamp — burned into the export, mirroring the
// watermark pass (pdf-lib dynamic-imported inside applyStamp; the pure
// formatStampText stays synchronously importable). Reuses the watermark module's
// anchor placement + colour parse rather than re-deriving them.
import { watermarkPlacements, canEncodeWinAnsi } from './watermark.js';
import { hexToRgb01 } from './color.js';
import { renderTextToPng } from './text-raster.js';
import type { StampConfig } from './types.js';
import { openPdf, serializePdf } from './pdf-doc.js';

/**
 * Render a stamp template for one page. `{n}` → the page number (zero-padded to
 * padWidth), `{total}` → the page count. Plain text with neither token is a
 * fixed header/footer. Global flags so a token can repeat (e.g. "{n}/{n}").
 */
export function formatStampText(
	template: string,
	n: number,
	total: number,
	padWidth: number
): string {
	// Cap the pad so a bogus width (a config from outside the dialog) can't build a
	// multi-thousand-char string drawn on every page. 64 digits is well past any
	// real page-numbering need.
	const pad = Math.min(64, Math.max(0, Math.floor(padWidth) || 0));
	const num = String(n).padStart(pad, '0');
	return template.replace(/\{n\}/g, num).replace(/\{total\}/g, String(total));
}

/**
 * Stamp page numbers / header-footer text onto every page and return the new
 * bytes. The number increments over the page order of `pdfBytes` — which is the
 * assembled EXPORT order, so numbering follows reorder/merge, not source index.
 * An all-whitespace template is a no-op. Like the watermark, this does not
 * compensate for a page's own /Rotate (consistent with that feature).
 */
export async function applyStamp(pdfBytes: Uint8Array, config: StampConfig): Promise<Uint8Array> {
	if (config.template.trim() === '') return pdfBytes;

	const { StandardFonts, rgb } = await import('pdf-lib');
	const pdf = await openPdf(pdfBytes);
	const pages = pdf.getPages();
	const total = pages.length;
	const font = await pdf.embedFont(StandardFonts.Helvetica);
	const { r, g, b } = hexToRgb01(config.color);
	const size = config.fontSize;
	// Clamp start to a sane page number — the dialog passes ≥1, but the doc-comment
	// on formatStampText notes configs can arrive from outside it; a negative or
	// fractional start would otherwise draw "-3"/"2.5" page numbers. Mirrors the
	// defensive padWidth/opacity clamps elsewhere. (`|| 1` also catches NaN/0.)
	const start = Math.max(1, Math.floor(config.start) || 1);

	// Non-Latin templates can't be encoded by Helvetica, so they render to a raster
	// image instead (renderTextToPng). Dedup by the FORMATTED string: a fixed header
	// (no {n}/{total}) embeds one image reused on every page; only a non-Latin string
	// that varies per page (CJK alongside a {n} number) costs one image per page —
	// and the lower supersample keeps those small. Page numbers themselves are
	// always digits, so a plain "Page {n}" stays on the crisp vector path throughout.
	const rasterCache = new Map<string, { img: Awaited<ReturnType<typeof pdf.embedPng>>; w: number; h: number }>();

	for (let i = 0; i < pages.length; i++) {
		const text = formatStampText(config.template, start + i, total, config.padWidth);
		const page = pages[i];
		const { width, height } = page.getSize();

		if (canEncodeWinAnsi(font, text)) {
			const objW = font.widthOfTextAtSize(text, size);
			const spot = watermarkPlacements(width, height, objW, size, config.position)[0];
			if (!spot) continue;
			page.drawText(text, { x: spot.x, y: spot.y, size, font, color: rgb(r, g, b) });
		} else {
			let entry = rasterCache.get(text);
			if (!entry) {
				const png = await renderTextToPng(text, { fontSize: size, color: config.color, supersample: 3 });
				entry = { img: await pdf.embedPng(png.bytes), w: png.width, h: png.height };
				rasterCache.set(text, entry);
			}
			const spot = watermarkPlacements(width, height, entry.w, entry.h, config.position)[0];
			if (!spot) continue;
			page.drawImage(entry.img, { x: spot.x, y: spot.y, width: entry.w, height: entry.h });
		}
	}

	return serializePdf(pdf);
}
