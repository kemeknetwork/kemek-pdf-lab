// Page-numbering / header-footer stamp — burned into the export, mirroring the
// watermark pass (pdf-lib dynamic-imported inside applyStamp; the pure
// formatStampText stays synchronously importable). Reuses the watermark module's
// anchor placement + colour parse rather than re-deriving them.
import { watermarkPlacements, hexToRgb01 } from './watermark.js';
import type { StampConfig } from './types.js';

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

	const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
	// updateMetadata:false — re-saving here would otherwise re-stamp pdf-lib's
	// Producer + a fresh ModDate onto the export (see operator.ts).
	const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
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

	for (let i = 0; i < pages.length; i++) {
		const text = formatStampText(config.template, start + i, total, config.padWidth);
		const page = pages[i];
		const { width, height } = page.getSize();
		const objW = font.widthOfTextAtSize(text, size);
		const placements = watermarkPlacements(width, height, objW, size, config.position);
		const spot = placements[0];
		if (!spot) continue;
		page.drawText(text, { x: spot.x, y: spot.y, size, font, color: rgb(r, g, b) });
	}

	return pdf.save();
}
