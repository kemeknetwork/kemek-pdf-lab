import { describe, it, expect } from 'vitest';
import { assembleText, type TextPiece } from './text-extract.js';

// Helper: a 12pt run at (x, y) with an explicit advance width.
function run(str: string, x: number, y: number, width = str.length * 6, height = 12): TextPiece {
  return { str, x, y, width, height };
}

describe('assembleText', () => {
  it('returns empty string for no runs', () => {
    expect(assembleText([])).toBe('');
    expect(assembleText([run('', 0, 100)])).toBe('');
  });

  it('orders lines top-to-bottom regardless of input order', () => {
    // y is bottom-left origin, so larger y is higher on the page → earlier.
    const out = assembleText([run('World', 0, 86), run('Hello', 0, 100)]);
    expect(out).toBe('Hello\nWorld');
  });

  it('joins runs on the same line, inserting a space across a gap', () => {
    // "Hello" ends at x=30; "World" starts at x=50 → 20pt gap > spaceThresh.
    const out = assembleText([run('Hello', 0, 100, 30), run('World', 50, 100, 30)]);
    expect(out).toBe('Hello World');
  });

  it('does not insert a space between touching runs', () => {
    // "Foo" ends at 18, "bar" starts at 18 → no gap, no inserted space.
    const out = assembleText([run('Foo', 0, 100, 18), run('bar', 18, 100, 18)]);
    expect(out).toBe('Foobar');
  });

  it('does not double a space the run already carries', () => {
    const out = assembleText([run('Hello ', 0, 100, 36), run('World', 50, 100, 30)]);
    expect(out).toBe('Hello World');
  });

  it('groups runs whose baselines differ within the line tolerance', () => {
    // A 2pt baseline jitter (< lineTol = 6) is still one line.
    const out = assembleText([run('one', 0, 100, 18), run('two', 24, 98, 18)]);
    expect(out).toBe('one two');
  });

  it('keeps adjacent lines as single newlines (no paragraph break)', () => {
    // 14pt line spacing < paraGap (16.8 for 12pt) → just a newline.
    const out = assembleText([run('Line A', 0, 100), run('Line B', 0, 86)]);
    expect(out).toBe('Line A\nLine B');
  });

  it('inserts a blank line on a paragraph-sized vertical gap', () => {
    // 30pt gap > paraGap → blank line between paragraphs.
    const out = assembleText([run('Para one', 0, 100), run('Para two', 0, 70)]);
    expect(out).toBe('Para one\n\nPara two');
  });

  it('assembles a small multi-line, multi-run block in reading order', () => {
    const pieces = [
      run('quick', 30, 100, 30),
      run('The', 0, 100, 24),
      run('brown', 64, 100, 30),
      run('fox', 0, 86, 18),
      run('jumps', 22, 86, 30)
    ];
    expect(assembleText(pieces)).toBe('The quick brown\nfox jumps');
  });

  it('scales tolerances to large text (headings)', () => {
    // 48pt runs: lineTol/paraGap scale up, so a 40pt line gap is still one
    // paragraph and same-line runs join with a space.
    const out = assembleText([
      run('BIG', 0, 200, 100, 48),
      run('TITLE', 120, 200, 120, 48),
      run('subhead', 0, 160, 60, 48)
    ]);
    expect(out).toBe('BIG TITLE\nsubhead');
  });
});
