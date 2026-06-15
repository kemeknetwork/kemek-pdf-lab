import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFArray, PDFRawStream, StandardFonts } from 'pdf-lib';
import { watermarkPlacements, applyWatermark, canEncodeWinAnsi } from './watermark.js';
import type { TextWatermark, ImageWatermark } from './types.js';

// 1x1 transparent PNG — smallest valid PNG that embedPng accepts.
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82
]);

// 1x1 grayscale baseline JPEG (same inline fixture used by image-import.test.ts).
const JPG_1X1 = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c,
  0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d,
  0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34,
  0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4,
  0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff,
  0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04,
  0x00, 0x00, 0x01, 0x7d, 0x01, 0x02, 0x03, 0x00,
  0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32,
  0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1,
  0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a,
  0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35,
  0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55,
  0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65,
  0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85,
  0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94,
  0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
  0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2,
  0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba,
  0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
  0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8,
  0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6,
  0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda,
  0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0xfb, 0xd0, 0xff, 0xd9
]);

// Known page + object dims used across the geometry assertions.
const PAGE_W = 600;
const PAGE_H = 800;
const OBJ_W = 100;
const OBJ_H = 20;
const MARGIN = 24;

async function blankPdf(pageCount: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) pdf.addPage([PAGE_W, PAGE_H]);
  return pdf.save();
}

// Per-page drawn-content byte length. A stamped page carries a non-empty
// content stream; an untouched page is 0. Lets the targetIndices tests assert
// *which* pages were stamped, not merely that the page count survived.
async function stampedContentLengths(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    if (!contents) return 0;
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    return refs.reduce((sum, ref) => {
      const stream = doc.context.lookup(ref);
      return sum + (stream instanceof PDFRawStream ? stream.contents.length : 0);
    }, 0);
  });
}

function textConfig(over: Partial<TextWatermark> = {}): TextWatermark {
  return {
    kind: 'text',
    text: 'DRAFT',
    fontSize: 24,
    color: '#ff0000',
    opacity: 0.5,
    rotation: 0,
    position: 'center',
    ...over
  };
}

function imageConfig(over: Partial<ImageWatermark> = {}): ImageWatermark {
  return {
    kind: 'image',
    imageBytes: PNG_1X1,
    imageMime: 'image/png',
    scale: 1,
    opacity: 0.5,
    rotation: 0,
    position: 'center',
    ...over
  };
}

describe('watermarkPlacements', () => {
  it('returns a single placement for each of the 9 anchors', () => {
    const anchors = [
      'center', 'top-left', 'top-center', 'top-right',
      'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'
    ] as const;
    for (const a of anchors) {
      expect(watermarkPlacements(PAGE_W, PAGE_H, OBJ_W, OBJ_H, a)).toHaveLength(1);
    }
  });

  it('centers the object on both axes for center', () => {
    const [p] = watermarkPlacements(PAGE_W, PAGE_H, OBJ_W, OBJ_H, 'center');
    expect(p.x).toBeCloseTo((PAGE_W - OBJ_W) / 2, 5); // 250
    expect(p.y).toBeCloseTo((PAGE_H - OBJ_H) / 2, 5); // 390
  });

  it('respects margin on the top-left corner', () => {
    const [p] = watermarkPlacements(PAGE_W, PAGE_H, OBJ_W, OBJ_H, 'top-left');
    expect(p.x).toBeCloseTo(MARGIN, 5); // 24
    expect(p.y).toBeCloseTo(PAGE_H - MARGIN - OBJ_H, 5); // 756
  });

  it('respects margin on the bottom-right corner', () => {
    const [p] = watermarkPlacements(PAGE_W, PAGE_H, OBJ_W, OBJ_H, 'bottom-right');
    expect(p.x).toBeCloseTo(PAGE_W - MARGIN - OBJ_W, 5); // 476
    expect(p.y).toBeCloseTo(MARGIN, 5); // 24
  });

  it('centers edge anchors on their free axis', () => {
    const [topCenter] = watermarkPlacements(PAGE_W, PAGE_H, OBJ_W, OBJ_H, 'top-center');
    expect(topCenter.x).toBeCloseTo((PAGE_W - OBJ_W) / 2, 5);
    const [middleLeft] = watermarkPlacements(PAGE_W, PAGE_H, OBJ_W, OBJ_H, 'middle-left');
    expect(middleLeft.y).toBeCloseTo((PAGE_H - OBJ_H) / 2, 5);
    expect(middleLeft.x).toBeCloseTo(MARGIN, 5);
  });

  it('honors a custom margin', () => {
    const [p] = watermarkPlacements(PAGE_W, PAGE_H, OBJ_W, OBJ_H, 'bottom-left', 50);
    expect(p.x).toBeCloseTo(50, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });

  it('tiles into a grid of more than one placement covering the page', () => {
    const grid = watermarkPlacements(PAGE_W, PAGE_H, OBJ_W, OBJ_H, 'tile');
    expect(grid.length).toBeGreaterThan(1);
    // Every placement sits within the page bounds (lower-left corner).
    for (const p of grid) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(PAGE_W);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(PAGE_H);
    }
    // Grid should span both axes (more than one distinct row and column).
    expect(new Set(grid.map((p) => p.x)).size).toBeGreaterThan(1);
    expect(new Set(grid.map((p) => p.y)).size).toBeGreaterThan(1);
  });

  it('returns no tile placements for a degenerate 0-size object (guards the infinite loop)', () => {
    // A 0pt font makes objW=objH=0 → step 0; without the guard the tile loop
    // never advances and hangs the main thread. This test completing at all
    // proves termination. A single zero dimension is still fine — the gap from
    // the other dimension keeps both steps positive.
    expect(watermarkPlacements(PAGE_W, PAGE_H, 0, 0, 'tile')).toEqual([]);
    expect(watermarkPlacements(PAGE_W, PAGE_H, 0, OBJ_H, 'tile').length).toBeGreaterThan(0);
  });
});

describe('applyWatermark', () => {
  it('preserves page count (text)', async () => {
    const out = await applyWatermark(await blankPdf(3), textConfig());
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  });

  it('preserves page count (image)', async () => {
    const out = await applyWatermark(await blankPdf(3), imageConfig());
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  });

  it('returns the input bytes unchanged for empty text', async () => {
    const input = await blankPdf(2);
    const out = await applyWatermark(input, textConfig({ text: '' }));
    expect(out).toBe(input);
  });

  it('produces valid PDF bytes for a text watermark', async () => {
    const out = await applyWatermark(await blankPdf(1), textConfig());
    expect(String.fromCharCode(out[0], out[1], out[2], out[3], out[4])).toBe('%PDF-');
  });

  it('embeds a PNG via the image branch', async () => {
    const out = await applyWatermark(await blankPdf(1), imageConfig());
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });

  it('embeds a JPG via the imageMime dispatch', async () => {
    const out = await applyWatermark(
      await blankPdf(1),
      imageConfig({ imageBytes: JPG_1X1, imageMime: 'image/jpeg' })
    );
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });

  it('routes on imageMime, not content (PNG bytes + JPG mime throws)', async () => {
    await expect(
      applyWatermark(await blankPdf(1), imageConfig({ imageMime: 'image/jpeg' }))
    ).rejects.toThrow();
  });

  it('accepts out-of-range opacity by clamping rather than throwing', async () => {
    const high = await applyWatermark(await blankPdf(1), textConfig({ opacity: 5 }));
    expect((await PDFDocument.load(high)).getPageCount()).toBe(1);
    const low = await applyWatermark(await blankPdf(1), textConfig({ opacity: -3 }));
    expect((await PDFDocument.load(low)).getPageCount()).toBe(1);
  });

  it('does not hang on a 0pt tiled text watermark (degenerate-size guard)', async () => {
    // fontSize 0 + tile made objW=objH=0 → a 0 step → an infinite placement
    // loop that froze the tab. The guard turns it into a no-op stamp; this
    // resolving at all (within the test timeout) proves there is no hang.
    const out = await applyWatermark(await blankPdf(1), textConfig({ fontSize: 0, position: 'tile' }));
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });

  it('stamps only the pages named in targetIndices', async () => {
    const lens = await stampedContentLengths(
      await applyWatermark(await blankPdf(3), textConfig(), [1])
    );
    expect(lens).toHaveLength(3);
    expect(lens[0]).toBe(0); // untouched
    expect(lens[1]).toBeGreaterThan(0); // stamped
    expect(lens[2]).toBe(0); // untouched
  });

  it('stamps every page when targetIndices is omitted', async () => {
    const lens = await stampedContentLengths(
      await applyWatermark(await blankPdf(3), textConfig())
    );
    expect(lens.every((n) => n > 0)).toBe(true);
  });

  it('treats an empty targetIndices array as "no pages", not "all"', async () => {
    // [] is an explicit empty selection, distinct from undefined (= all). Guards
    // against a `targetIndices || all` refactor that would wrongly stamp all.
    const lens = await stampedContentLengths(
      await applyWatermark(await blankPdf(3), textConfig(), [])
    );
    expect(lens).toEqual([0, 0, 0]);
  });

  it('ignores out-of-bounds target indices safely', async () => {
    const lens = await stampedContentLengths(
      await applyWatermark(await blankPdf(2), textConfig(), [5, 99])
    );
    expect(lens).toEqual([0, 0]);
  });
});

// canEncodeWinAnsi decides the watermark/stamp fork: Latin (and CP1252 extras) go
// the crisp vector-Helvetica path; emoji and non-Latin scripts return false and
// take the browser raster path (renderTextToPng). These pin that classification.
describe('canEncodeWinAnsi', () => {
  async function helvetica() {
    const doc = await PDFDocument.create();
    return doc.embedFont(StandardFonts.Helvetica);
  }

  it('returns true for Latin and CP1252 extras', async () => {
    const font = await helvetica();
    expect(canEncodeWinAnsi(font, 'Page {n} of {total}')).toBe(true);
    expect(canEncodeWinAnsi(font, 'café — naïve “quote”')).toBe(true);
  });

  it('returns false for emoji and non-Latin scripts', async () => {
    const font = await helvetica();
    expect(canEncodeWinAnsi(font, 'CONFIDENTIAL ✅')).toBe(false);
    expect(canEncodeWinAnsi(font, '機密')).toBe(false); // CJK
    expect(canEncodeWinAnsi(font, 'Привет')).toBe(false); // Cyrillic
  });
});

// In a browser, non-Latin watermark/stamp text rasterizes (renderTextToPng → an
// embedded image). In node (vitest 'environment: node') there is no canvas, so it
// degrades to the actionable "use Latin text" error — these pin that headless
// fallback and prove the fork is wired into the export (the real raster output is
// browser-verified separately).
describe('applyWatermark — non-Latin raster fallback (headless)', () => {
  it('rejects with the actionable message when there is no canvas to raster', async () => {
    await expect(applyWatermark(await blankPdf(1), textConfig({ text: 'DRAFT ✅' }))).rejects.toThrow(
      /use Latin text/i
    );
  });
});
