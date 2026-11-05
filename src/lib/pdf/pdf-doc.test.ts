import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { applyStamp } from './stamp.js';
import { PRODUCER } from './operator.js';

const SRC = join(import.meta.dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|svelte)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

describe('pdf-lib documents go through pdf-doc.ts', () => {
  it('no module opens or creates a pdf-lib document directly', () => {
    // The chokepoint only protects what routes through it: a direct call
    // elsewhere would silently re-enable pdf-lib's Producer + date stamping.
    const offenders = sourceFiles(SRC)
      .filter((f) => !f.endsWith(join('pdf', 'pdf-doc.ts')))
      .filter((f) => /PDFDocument\s*\.\s*(load|create)\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('no module saves a pdf-lib document directly', () => {
    // serializePdf is where the export scrub runs; a bare .save() would write a
    // file carrying page metadata and orphaned copies of deleted pages.
    const offenders = sourceFiles(SRC)
      .filter((f) => !f.endsWith(join('pdf', 'pdf-doc.ts')))
      .filter((f) => /\.save\(\s*(\{[^}]*\})?\s*\)/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('no module embeds a JPEG except through user-image.ts', () => {
    // embedJpg stores the file verbatim, EXIF (GPS, serial, capture time) included.
    const offenders = sourceFiles(SRC)
      .filter((f) => !f.endsWith(join('pdf', 'user-image.ts')))
      .filter((f) => /\.embedJpg\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('the scan sees real source (positive control)', () => {
    expect(sourceFiles(SRC).some((f) => f.endsWith(join('pdf', 'operator.ts')))).toBe(true);
    // ...and the patterns match the calls they exist to catch.
    expect(/\.save\(\s*(\{[^}]*\})?\s*\)/.test(readFileSync(join(SRC, 'lib', 'pdf', 'pdf-doc.ts'), 'utf8'))).toBe(true);
    expect(/\.embedJpg\s*\(/.test(readFileSync(join(SRC, 'lib', 'pdf', 'user-image.ts'), 'utf8'))).toBe(true);
  });
});

describe('applyStamp — privacy', () => {
  it('re-saves without adding a pdf-lib Producer or dates', async () => {
    const src = await PDFDocument.create({ updateMetadata: false });
    src.addPage([200, 200]);
    src.setProducer(PRODUCER);
    const out = await applyStamp(await src.save(), {
      template: '{n}',
      position: 'bottom-center',
      start: 1,
      fontSize: 10,
      padWidth: 0,
      color: '#000000'
    });
    // Read back with updateMetadata:false: a default load would itself stamp
    // pdf-lib's Producer and a fresh ModDate, a false positive.
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getProducer()).toBe(PRODUCER);
    expect(doc.getModificationDate()).toBeUndefined();
    expect(doc.getCreationDate()).toBeUndefined();
  });
});
