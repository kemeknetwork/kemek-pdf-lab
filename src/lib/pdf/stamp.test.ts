import { describe, it, expect } from 'vitest';
import { formatStampText } from './stamp.js';

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
});
