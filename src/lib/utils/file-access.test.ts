import { describe, it, expect } from 'vitest';
import { sanitizeBaseName } from './file-access.js';

describe('sanitizeBaseName', () => {
  it('leaves an ordinary name untouched — including dashes and dots', () => {
    expect(sanitizeBaseName('Q3 report')).toBe('Q3 report');
    expect(sanitizeBaseName('page-1.final')).toBe('page-1.final'); // dashes MUST survive
  });

  it('collapses path separators so a name cannot create subdirectories', () => {
    expect(sanitizeBaseName('a/b\\c')).toBe('a-b-c');
  });

  it('neutralizes ".." segments (zip-slip vector)', () => {
    expect(sanitizeBaseName('..')).toBe('.');
    expect(sanitizeBaseName('../../etc')).toBe('.-.-etc');
  });

  it('replaces characters Windows refuses in a filename, so a ZIP still extracts there', () => {
    expect(sanitizeBaseName('Q3: report <final> "v2" | a?b*')).toBe('Q3_ report _final_ _v2_ _ a_b_');
  });

  it('drops control characters without touching the rest', () => {
    expect(sanitizeBaseName('a' + String.fromCharCode(0) + 'b' + String.fromCharCode(9) + 'c')).toBe('abc');
  });

  it('falls back to "document" for empty / whitespace / all-stripped input', () => {
    expect(sanitizeBaseName('')).toBe('document');
    expect(sanitizeBaseName('   ')).toBe('document');
    expect(sanitizeBaseName('///')).toBe('-'); // collapses to a single dash, kept (non-empty)
    expect(sanitizeBaseName(String.fromCharCode(1, 2, 3))).toBe('document');
  });
});
