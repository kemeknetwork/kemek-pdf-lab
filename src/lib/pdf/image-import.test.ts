import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { detectImageMime, imageBytesToPdf } from './image-import.js';
import { JPG_1X1, PNG_1X1 } from './test-images.js';


describe('detectImageMime', () => {
  it('identifies a PNG by its 8-byte signature', () => {
    expect(detectImageMime(PNG_1X1)).toBe('image/png');
  });

  it('identifies a JPG by FF D8 FF', () => {
    const jpgHead = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageMime(jpgHead)).toBe('image/jpeg');
  });

  it('returns null for PDF magic so the caller falls back', () => {
    const pdfHead = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    expect(detectImageMime(pdfHead)).toBeNull();
  });

  it('returns null for arbitrary non-image bytes', () => {
    expect(detectImageMime(Uint8Array.from([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(detectImageMime(new Uint8Array(0))).toBeNull();
  });

  it('returns null for a truncated JPG header (2 bytes)', () => {
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });

  it('returns null for a truncated PNG header (3 bytes)', () => {
    expect(detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e]))).toBeNull();
  });

  it('rejects a JPG-like prefix whose third byte is wrong', () => {
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8, 0x00, 0x00]))).toBeNull();
  });
});

describe('imageBytesToPdf', () => {
  it('wraps a PNG into a one-page PDF', async () => {
    const out = await imageBytesToPdf(PNG_1X1, 'image/png');
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBeGreaterThan(0);
    expect(String.fromCharCode(out[0], out[1], out[2], out[3], out[4])).toBe('%PDF-');

    const parsed = await PDFDocument.load(out);
    expect(parsed.getPageCount()).toBe(1);
  });

  it('sizes a small image at 72 DPI without scaling', async () => {
    const out = await imageBytesToPdf(PNG_1X1, 'image/png');
    const parsed = await PDFDocument.load(out);
    const page = parsed.getPage(0);
    // 1x1 PNG @ 72 DPI = 1pt x 1pt, well under MAX_DIM_PT (2000).
    expect(page.getWidth()).toBeCloseTo(1, 5);
    expect(page.getHeight()).toBeCloseTo(1, 5);
  });

  it('rejects bytes that are not actually a PNG when mime says PNG', async () => {
    await expect(imageBytesToPdf(Uint8Array.from([0x00, 0x01, 0x02]), 'image/png')).rejects.toThrow();
  });

  it('wraps a JPG into a one-page PDF via the embedJpg branch', async () => {
    const out = await imageBytesToPdf(JPG_1X1, 'image/jpeg');
    expect(out).toBeInstanceOf(Uint8Array);
    expect(String.fromCharCode(out[0], out[1], out[2], out[3], out[4])).toBe('%PDF-');

    const parsed = await PDFDocument.load(out);
    expect(parsed.getPageCount()).toBe(1);
    // 1x1 source @ 72 DPI is well under MAX_DIM_PT, so no scaling applies.
    expect(parsed.getPage(0).getWidth()).toBeCloseTo(1, 5);
    expect(parsed.getPage(0).getHeight()).toBeCloseTo(1, 5);
  });

  it('rejects PNG bytes when mime says JPG (mime drives the embed branch)', async () => {
    // The function dispatches on mime, not magic — passing PNG bytes with
    // the JPG mime should hit embedJpg and fail, which pins that the
    // dispatch isn't silently routing on content.
    await expect(imageBytesToPdf(PNG_1X1, 'image/jpeg')).rejects.toThrow();
  });

  // Derive a large-dimension JPEG from the 1x1 fixture by rewriting the SOF0
  // marker's declared height/width. pdf-lib's JpegEmbedder reads the image
  // dimensions straight from SOF0 and never decodes the entropy-coded scan
  // data, so the minimal payload is irrelevant — embedJpg reports whatever
  // SOF0 declares. That lets us push image.width/height past MAX_DIM_PT (2000)
  // to exercise the downscale clamp, which every 1x1 fixture leaves untaken.
  function jpegWithSize(width: number, height: number): Uint8Array {
    const bytes = JPG_1X1.slice();
    // SOF0 marker is 0xFF 0xC0; the only one before the scan in this fixture.
    // Layout after the marker: length(2) precision(1) height(2) width(2).
    const sof = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xc0);
    const dim = sof + 5; // skip marker(2) + length(2) + precision(1)
    bytes[dim] = (height >> 8) & 0xff;
    bytes[dim + 1] = height & 0xff;
    bytes[dim + 2] = (width >> 8) & 0xff;
    bytes[dim + 3] = width & 0xff;
    return bytes;
  }

  it('downscales an oversized landscape image to MAX_DIM_PT, preserving aspect ratio', async () => {
    // 4000x2000 → longer axis 4000 > 2000 cap → scale 0.5 applied to both axes.
    const out = await imageBytesToPdf(jpegWithSize(4000, 2000), 'image/jpeg');
    const page = (await PDFDocument.load(out)).getPage(0);
    expect(page.getWidth()).toBeCloseTo(2000, 5); // longer axis capped at MAX_DIM_PT
    expect(page.getHeight()).toBeCloseTo(1000, 5); // 2:1 ratio preserved
  });

  it('caps the longer axis when the oversized image is portrait', async () => {
    // 1000x5000 → height is the longer axis and the one that gets clamped.
    const out = await imageBytesToPdf(jpegWithSize(1000, 5000), 'image/jpeg');
    const page = (await PDFDocument.load(out)).getPage(0);
    expect(page.getHeight()).toBeCloseTo(2000, 5); // longer axis capped
    expect(page.getWidth()).toBeCloseTo(400, 5); // 1000 * (2000/5000)
  });

  it('leaves an image exactly at MAX_DIM_PT unscaled (boundary is not "greater")', async () => {
    // longer === MAX_DIM_PT takes the `: 1` branch (the guard is `> MAX_DIM_PT`),
    // so a 2000pt edge passes through at 1:1 rather than being needlessly scaled.
    const out = await imageBytesToPdf(jpegWithSize(2000, 1000), 'image/jpeg');
    const page = (await PDFDocument.load(out)).getPage(0);
    expect(page.getWidth()).toBeCloseTo(2000, 5);
    expect(page.getHeight()).toBeCloseTo(1000, 5);
  });
});
