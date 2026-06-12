import { describe, it, expect } from 'vitest';
import { shouldKeepImage, imageDedupeKey, MIN_IMAGE_AREA, MAX_IMAGE_AREA } from './extract-images.js';

describe('shouldKeepImage', () => {
  it('keeps real images', () => {
    expect(shouldKeepImage(100, 80)).toBe(true);
    expect(shouldKeepImage(1920, 1080)).toBe(true);
  });

  it('drops degenerate sizes', () => {
    expect(shouldKeepImage(0, 100)).toBe(false);
    expect(shouldKeepImage(100, 0)).toBe(false);
    expect(shouldKeepImage(-5, 10)).toBe(false);
    expect(shouldKeepImage(NaN, 10)).toBe(false);
  });

  it('drops sub-threshold artifacts (icons / spacers / mask bits) at the area boundary', () => {
    expect(shouldKeepImage(15, 15)).toBe(false); // 225 < 256
    expect(shouldKeepImage(16, 16)).toBe(true); // 256 === MIN
    expect(MIN_IMAGE_AREA).toBe(256);
  });

  it('keeps a genuinely thin image rather than mistaking it for noise', () => {
    expect(shouldKeepImage(800, 4)).toBe(true); // 3200 area — a banner/slice, not dropped
  });

  it('skips supra-threshold giants (decompression-bomb guard)', () => {
    expect(shouldKeepImage(8000, 7000)).toBe(false); // 56MP > 50MP cap
    expect(shouldKeepImage(7000, 7000)).toBe(true); // 49MP < cap — a large scan still extracts
    expect(MAX_IMAGE_AREA).toBe(50_000_000);
  });
});

describe('imageDedupeKey', () => {
  it('combines hash and length, normalizing the hash to unsigned', () => {
    expect(imageDedupeKey(0xcbf43926, 1024)).toBe('3421780262:1024');
    expect(imageDedupeKey(-1, 10)).toBe('4294967295:10'); // >>> 0
  });

  it('separates same-hash different-length (collision guard)', () => {
    expect(imageDedupeKey(42, 100)).not.toBe(imageDedupeKey(42, 200));
  });
});
