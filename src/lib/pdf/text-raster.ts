// Render arbitrary text to a transparent PNG using the BROWSER's own fonts —
// which cover CJK, emoji (in colour), Cyrillic, RTL, everything the OS has. This
// is how the watermark and stamp render text the built-in WinAnsi Helvetica
// can't encode: the non-Latin string becomes a raster image (embedded via
// pdf-lib's embedPng) instead of vector glyphs. Trade-off: such text isn't
// selectable in the output — fine for a decorative overlay / header, and only the
// rare non-Latin string takes this path (Latin stays crisp Helvetica vector).
//
// Browser-only: there is no <canvas> in node/SSR (vitest runs in 'node'), where
// it throws the same actionable "use Latin text" message the caller would
// otherwise surface — so a headless export degrades cleanly instead of crashing.

export interface RasterText {
  /** transparent PNG bytes */
  bytes: Uint8Array;
  /** width to draw the image at, in PDF points */
  width: number;
  /** height to draw the image at, in PDF points */
  height: number;
}

// Helvetica/Arial first so the Latin parts of a mixed string match the vector
// path; the browser falls back to the OS's CJK / emoji fonts per-glyph anyway.
const FONT_STACK = 'Helvetica, Arial, sans-serif';

/**
 * Rasterize `text` to a transparent PNG at `supersample`× the point size, so the
 * image embedded at the returned point dimensions stays crisp at print DPI.
 * Throws an actionable error (no canvas) in a non-browser environment.
 */
export async function renderTextToPng(
  text: string,
  opts: { fontSize: number; color: string; supersample?: number }
): Promise<RasterText> {
  const { fontSize, color, supersample = 4 } = opts;
  const ctx = create2dContext();
  if (!ctx) {
    throw new Error(`Can’t render “${text}” without a browser canvas — please use Latin text.`);
  }

  const px = fontSize * supersample;
  const fontSpec = `${px}px ${FONT_STACK}`;
  ctx.font = fontSpec;
  const m = ctx.measureText(text);
  // Tight glyph metrics where the browser reports them; font-relative estimates
  // otherwise (older Safari omits the bounding-box fields).
  const ascent = m.actualBoundingBoxAscent || px * 0.82;
  const descent = m.actualBoundingBoxDescent || px * 0.22;
  const pad = Math.ceil(px * 0.1);
  const w = Math.max(1, Math.ceil(m.width) + pad * 2);
  const h = Math.max(1, Math.ceil(ascent + descent) + pad * 2);

  const canvas = ctx.canvas;
  canvas.width = w; // NB: resizing the canvas RESETS all context state…
  canvas.height = h;
  ctx.font = fontSpec; // …so re-apply the font (and fill) before drawing.
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, pad, pad + ascent);

  return { bytes: await canvasToPng(canvas), width: w / supersample, height: h / supersample };
}

function create2dContext(): CanvasRenderingContext2D | null {
  // typeof check covers node/SSR; the getContext null covers jsdom-without-canvas.
  if (typeof document === 'undefined') return null;
  try {
    return document.createElement('canvas').getContext('2d');
  } catch {
    return null;
  }
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('canvas.toBlob produced no PNG'));
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, 'image/png');
  });
}
