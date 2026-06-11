// pdf-lib is dynamic-imported inside applyWatermark (see operator.ts) to keep
// it out of the initial page bundle. watermarkPlacements() is pure and stays
// synchronously importable.
import type { WatermarkConfig, WatermarkPosition } from './types.js';

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m || m.length !== 3) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m[0], 16) / 255,
    g: parseInt(m[1], 16) / 255,
    b: parseInt(m[2], 16) / 255
  };
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

  const { PDFDocument, StandardFonts, degrees, rgb } = await import('pdf-lib');

  const pdf = await PDFDocument.load(pdfBytes);
  const pages = pdf.getPages();
  const indices = targetIndices ?? pages.map((_, i) => i);
  const opacity = clamp01(config.opacity);
  const rotate = degrees(config.rotation);

  if (config.kind === 'text') {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const objW = font.widthOfTextAtSize(config.text, config.fontSize);
    const objH = config.fontSize;
    const { r, g, b } = hexToRgb01(config.color);
    for (const i of indices) {
      const page = pages[i];
      if (!page) continue;
      const { width, height } = page.getSize();
      for (const { x, y } of watermarkPlacements(width, height, objW, objH, config.position)) {
        page.drawText(config.text, {
          x,
          y,
          size: config.fontSize,
          font,
          color: rgb(r, g, b),
          opacity,
          rotate
        });
      }
    }
  } else {
    const image =
      config.imageMime === 'image/png'
        ? await pdf.embedPng(config.imageBytes)
        : await pdf.embedJpg(config.imageBytes);
    const dims = image.scale(config.scale);
    for (const i of indices) {
      const page = pages[i];
      if (!page) continue;
      const { width, height } = page.getSize();
      for (const { x, y } of watermarkPlacements(width, height, dims.width, dims.height, config.position)) {
        page.drawImage(image, {
          x,
          y,
          width: dims.width,
          height: dims.height,
          opacity,
          rotate
        });
      }
    }
  }

  return pdf.save();
}
