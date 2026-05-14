import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { detectImageMime, imageBytesToPdf } from './image-import.js';

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
});
