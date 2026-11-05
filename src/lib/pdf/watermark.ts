// pdf-lib is dynamic-imported inside applyWatermark (see operator.ts) to keep
// it out of the initial page bundle. watermarkPlacements() is pure and stays
// synchronously importable.
import type { WatermarkConfig, WatermarkPosition } from './types.js';
import type { PDFFont } from 'pdf-lib';
import { renderTextToPng } from './text-raster.js';
import { hexToRgb01 } from './color.js';
import { openPdf, serializePdf } from './pdf-doc.js';
import { drawUserImage, embedUserImage, type UserImage } from './user-image.js';
import { displaySize, displayToUserSpace, pageFrame } from './page-geometry.js';

/**
 * Whether the built-in Helvetica (WinAnsi) can encode `text`. False for emoji and
 * non-Latin scripts (Cyrillic / Greek / CJK …). The watermark and stamp use this
 * to fork between crisp vector Helvetica (Latin) and a browser-rendered raster
 * image (non-Latin, via {@link renderTextToPng}) — so non-Latin no longer hard-
 * fails the export. Shared by the two Helvetica text features.
 */
export function canEncodeWinAnsi(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch (e) {
    // pdf-lib throws exactly `WinAnsi cannot encode "X" (0x…)` for an out-of-
    // charset glyph. Match that precisely — any OTHER error is a real failure, not
    // a "this is non-Latin, raster it" signal, and must propagate.
    if (e instanceof Error && /cannot encode/i.test(e.message)) return false;
    throw e;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Lower-left-corner placements (PDF points, origin bottom-left) for stamping
 * an objW×objH watermark onto a pageW×pageH page.
 *
 * The 9 single-point anchors ('center' + the 8 corners/edges) return exactly
 * one placement: corners and edge anchors respect `margin`; edge anchors
 * center the object on their free axis; 'center' centers on both. 'tile'
 * returns a grid covering the page, stepping by the object size plus a gap of
 * 1.5× the object's larger dimension. Placement uses the object's unrotated
 * bounding box — `rotation` is applied by the caller at draw time and pivots
 * about this lower-left point.
 */
export function watermarkPlacements(
  pageW: number,
  pageH: number,
  objW: number,
  objH: number,
  position: WatermarkPosition,
  margin = 24
): { x: number; y: number }[] {
  const left = margin;
  const right = pageW - margin - objW;
  const bottom = margin;
  const top = pageH - margin - objH;
  const midX = (pageW - objW) / 2;
  const midY = (pageH - objH) / 2;

  switch (position) {
    case 'top-left':
      return [{ x: left, y: top }];
    case 'top-center':
      return [{ x: midX, y: top }];
    case 'top-right':
      return [{ x: right, y: top }];
    case 'middle-left':
      return [{ x: left, y: midY }];
    case 'middle-right':
      return [{ x: right, y: midY }];
    case 'bottom-left':
      return [{ x: left, y: bottom }];
    case 'bottom-center':
      return [{ x: midX, y: bottom }];
    case 'bottom-right':
      return [{ x: right, y: bottom }];
    case 'center':
      return [{ x: midX, y: midY }];
    case 'tile': {
      const gap = 1.5 * Math.max(objW, objH);
      const stepX = objW + gap;
      const stepY = objH + gap;
      // A non-positive step (degenerate 0-size object, e.g. a 0pt font) would
      // make the loops below never advance — an unbounded main-thread hang.
      // No positive step means there is nothing to tile.
      if (!(stepX > 0) || !(stepY > 0)) return [];
      const out: { x: number; y: number }[] = [];
      for (let y = margin; y < pageH; y += stepY) {
        for (let x = margin; x < pageW; x += stepX) {
          out.push({ x, y });
        }
      }
      return out;
    }
    default:
      // Exhaustive over WatermarkPosition at compile time (the `never` errors if
      // a new member is added without a case). At runtime, also the defensive
      // fallback: without it a malformed position returns undefined, and
      // applyWatermark's `for (…of undefined)` would TypeError the whole export.
      position satisfies never;
      return [{ x: midX, y: midY }];
  }
}

/**
 * Stamp a text or image watermark onto a PDF and return the new bytes. Page
 * count is preserved; only pages in `targetIndices` are stamped (default: all).
 * An empty-text config is a no-op and returns the input bytes unchanged.
 */
export async function applyWatermark(
  pdfBytes: Uint8Array,
  config: WatermarkConfig,
  targetIndices?: number[]
): Promise<Uint8Array> {
  if (config.kind === 'text' && config.text === '') return pdfBytes;

  const { StandardFonts, degrees, rgb } = await import('pdf-lib');
  const pdf = await openPdf(pdfBytes);
  const pages = pdf.getPages();
  const indices = targetIndices ?? pages.map((_, i) => i);
  const opacity = clamp01(config.opacity);

  // Tile/anchor an already-embedded image of objW×objH points onto every target
  // page — shared by the image watermark and the rastered-text path below.
  const tileImage = async (image: UserImage, objW: number, objH: number) => {
    for (const i of indices) {
      const page = pages[i];
      if (!page) continue;
      // Placed on the page as displayed (visible box, turned by its /Rotate);
      // the watermark's own rotation adds to the page's.
      const frame = pageFrame(page);
      const { width, height } = displaySize(frame);
      for (const { x, y } of watermarkPlacements(width, height, objW, objH, config.position)) {
        const at = displayToUserSpace(frame, x, y);
        await drawUserImage(page, image, { x: at.x, y: at.y, width: objW, height: objH }, { rotate: frame.rotate + config.rotation, opacity });
      }
    }
  };

  if (config.kind === 'text') {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    if (canEncodeWinAnsi(font, config.text)) {
      // Latin → crisp, selectable vector Helvetica.
      const objW = font.widthOfTextAtSize(config.text, config.fontSize);
      const { r, g, b } = hexToRgb01(config.color);
      for (const i of indices) {
        const page = pages[i];
        if (!page) continue;
        const frame = pageFrame(page);
        const { width, height } = displaySize(frame);
        const rotate = degrees(frame.rotate + config.rotation);
        for (const { x, y } of watermarkPlacements(width, height, objW, config.fontSize, config.position)) {
          const at = displayToUserSpace(frame, x, y);
          page.drawText(config.text, { x: at.x, y: at.y, size: config.fontSize, font, color: rgb(r, g, b), opacity, rotate });
        }
      }
    } else {
      // Non-Latin (CJK / emoji / Cyrillic …) → Helvetica can't encode it, so render
      // the text to an image with the browser's fonts and stamp THAT (one image,
      // reused across every placement). Raster, so not selectable — acceptable here.
      const { bytes, width, height } = await renderTextToPng(config.text, {
        fontSize: config.fontSize,
        color: config.color
      });
      await tileImage(await embedUserImage(pdf, bytes, 'image/png'), width, height);
    }
  } else {
    // Upright size: a phone photo's EXIF orientation is applied, not ignored.
    const image = await embedUserImage(pdf, config.imageBytes, config.imageMime);
    await tileImage(image, image.width * config.scale, image.height * config.scale);
  }

  return serializePdf(pdf);
}
