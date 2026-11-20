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

describe('pickFiles is the only file picker', () => {
  // A detached <input type=file> can be garbage-collected while its picker is
  // open, and the chosen files then land nowhere (see pickFiles). Any other
  // site creating one would bring that back.
  it('no source outside file-access.ts creates an <input> element', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(ts|svelte)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) && !p.endsWith('file-access.ts')) {
          if (/createElement\(\s*['"`]input['"`]/.test(readFileSync(p, 'utf8'))) offenders.push(p);
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
});
