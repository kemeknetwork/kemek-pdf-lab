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

// 1x1 grayscale baseline JPEG. Full JFIF wrapper + SOF0 declaring
// width=1, height=1, 1 component + standard luminance Huffman tables +
// minimal SOS payload. Inline because committing a binary fixture for
// what is conceptually "the smallest valid JPG pdf-lib will accept"
// hides the test's intent in a separate file.
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
