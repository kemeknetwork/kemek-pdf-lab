import { describe, expect, it } from 'vitest';
import { resolveOrder } from './reorder.js';
import type { PageInfo } from './types.js';

const page = (id: string, extra: Partial<PageInfo> = {}): PageInfo => ({
  id,
  sourceDocumentId: 'doc',
  originalIndex: 0,
  rotation: 0,
  ...extra
});

describe('resolveOrder', () => {
  it('keeps every field of the store page, whatever the caller passed', () => {
    // The drag grid used to rebuild pages from a field list that predated
    // annotations, so a drag silently deleted every signature and text overlay.
    const signed = page('b', {
      rotation: 90,
      label: 'cover',
      annotations: [{ id: 'a1', kind: 'text', x: 0.1, y: 0.2, text: 'hi', fontSize: 12, color: '#000' }]
    });
    const current = [page('a'), signed, page('c')];
    const next = resolveOrder(current, ['b', 'a', 'c'])!;
    expect(next.map((p) => p.id)).toEqual(['b', 'a', 'c']);
    expect(next[0]).toBe(signed);
    expect(next[0].annotations).toHaveLength(1);
  });

  it('refuses an order that is not a permutation of the current pages', () => {
    const current = [page('a'), page('b')];
    expect(resolveOrder(current, ['a'])).toBeNull();
    expect(resolveOrder(current, ['a', 'x'])).toBeNull();
    expect(resolveOrder(current, ['a', 'a'])).toBeNull();
  });
});
