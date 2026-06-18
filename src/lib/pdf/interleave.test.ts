import { describe, it, expect } from 'vitest';
import { interleave } from './interleave.js';

describe('interleave', () => {
  it('zips two equal-length lists A-first', () => {
    expect(interleave([1, 3], [2, 4])).toEqual([1, 2, 3, 4]);
  });

  it('appends the tail when A is longer', () => {
    expect(interleave([1, 3, 5, 7], [2, 4])).toEqual([1, 2, 3, 4, 5, 7]);
  });

  it('appends the tail when B is longer', () => {
    expect(interleave([1], [2, 4, 6])).toEqual([1, 2, 4, 6]);
  });

  it('reconstructs page order from a bottom-up back stack with reverseB', () => {
    // fronts 1,3,5 ; backs scanned last-sheet-first 6,4,2 → reversed pairs cleanly
    expect(interleave([1, 3, 5], [6, 4, 2], true)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('returns the non-empty list unchanged when one side is empty', () => {
    expect(interleave([], [1, 2])).toEqual([1, 2]);
    expect(interleave([1, 2], [])).toEqual([1, 2]);
  });

  it('returns empty for two empty lists', () => {
    expect(interleave([], [])).toEqual([]);
  });

  it('does not mutate its inputs', () => {
    const a = [1, 3];
    const b = [4, 2];
    interleave(a, b, true);
    expect(a).toEqual([1, 3]);
    expect(b).toEqual([4, 2]);
  });
});
