import { describe, it, expect } from 'vitest';
import { splitGroups } from './split.js';
import type { PageInfo } from './types.js';

const mk = (i: number): PageInfo => ({ id: `p${i}`, sourceDocumentId: 'A', originalIndex: i, rotation: 0 });
const pages = (n: number) => Array.from({ length: n }, (_, i) => mk(i));

describe('splitGroups — each page', () => {
  it('one group per page, zero-padded to the count width for natural sort', () => {
    const groups = splitGroups(pages(12), { kind: 'each' });
    expect(groups).toHaveLength(12);
    expect(groups[0]).toEqual({ pages: [mk(0)], suffix: 'page-01' });
    expect(groups[9].suffix).toBe('page-10'); // padded — sorts after page-09, before page-11
    expect(groups[11].suffix).toBe('page-12');
  });

  it('does not pad when a single page', () => {
    expect(splitGroups(pages(1), { kind: 'each' })[0].suffix).toBe('page-1');
  });
});

describe('splitGroups — chunks', () => {
  it('groups every N pages, labeling the inclusive range', () => {
    const groups = splitGroups(pages(10), { kind: 'chunk', size: 3 });
    expect(groups.map((g) => g.suffix)).toEqual([
      'pages-01-03',
      'pages-04-06',
      'pages-07-09',
      'page-10' // the trailing remainder is a single page → "page-NN", not a range
    ]);
    expect(groups[0].pages.map((p) => p.id)).toEqual(['p0', 'p1', 'p2']);
    expect(groups[3].pages).toEqual([mk(9)]);
  });

  it('a chunk size at or above the count yields one group of all pages', () => {
    expect(splitGroups(pages(4), { kind: 'chunk', size: 10 })).toHaveLength(1);
  });

  it('clamps a non-positive or fractional size to a sane whole number', () => {
    expect(splitGroups(pages(3), { kind: 'chunk', size: 0 })).toHaveLength(3); // → size 1
    expect(splitGroups(pages(4), { kind: 'chunk', size: 2.9 })).toHaveLength(2); // floor → 2
  });
});

describe('splitGroups — empty', () => {
  it('returns no groups for no pages', () => {
    expect(splitGroups([], { kind: 'each' })).toEqual([]);
    expect(splitGroups([], { kind: 'chunk', size: 3 })).toEqual([]);
  });
});
