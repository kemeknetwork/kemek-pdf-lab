import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { formatStampText, applyStamp } from './stamp.js';
import type { StampConfig } from './types.js';

describe('formatStampText', () => {
  it('substitutes {n} with the (zero-padded) page number', () => {
    expect(formatStampText('Page {n}', 3, 10, 0)).toBe('Page 3');
    expect(formatStampText('{n}', 7, 10, 3)).toBe('007'); // Bates-style zero pad
  });

  it('substitutes {total}', () => {
    expect(formatStampText('Page {n} of {total}', 2, 5, 0)).toBe('Page 2 of 5');
  });

  it('handles a Bates prefix + pad', () => {
    expect(formatStampText('ABC-{n}', 42, 100, 6)).toBe('ABC-000042');
  });

  it('leaves a tokenless template as a fixed header/footer', () => {
    expect(formatStampText('CONFIDENTIAL', 1, 9, 0)).toBe('CONFIDENTIAL');
  });

  it('replaces every occurrence of a repeated token', () => {
    expect(formatStampText('{n}/{total} · {n}', 4, 8, 0)).toBe('4/8 · 4');
  });

  it('does not pad a number wider than padWidth', () => {
    expect(formatStampText('{n}', 1234, 2000, 2)).toBe('1234');
  });

  it('caps a bogus pad width so it cannot build a multi-thousand-char string', () => {
    expect(formatStampText('{n}', 1, 5, 5000).length).toBe(64); // capped, not 5000
    expect(formatStampText('{n}', 1, 5, -3)).toBe('1'); // negative → no pad
  });
});

// applyStamp draws with the built-in Helvetica (WinAnsi); a non-Latin template
// rasterizes via renderTextToPng in a browser. In node there is no canvas, so it
// degrades to the actionable "use Latin text" error — these pin that headless
// fallback and that a Latin template still stamps through. (Previously applyStamp
// had no integration coverage at all.)
describe('applyStamp — non-Latin raster fallback (headless)', () => {
  function stampConfig(over: Partial<StampConfig> = {}): StampConfig {
    return {
      template: 'Page {n} of {total}',
      start: 1,
      padWidth: 0,
      position: 'bottom-center',
      fontSize: 12,
      color: '#000000',
      ...over
    };
  }
  async function blankPdf(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    return doc.save();
  }

  it('rejects with a clear error when the template has un-encodable characters', async () => {
    await expect(applyStamp(await blankPdf(), stampConfig({ template: '機密 {n}' }))).rejects.toThrow(
      /use Latin text/i
    );
  });

  it('stamps a Latin template through without throwing', async () => {
    const out = await applyStamp(await blankPdf(), stampConfig());
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });
});
