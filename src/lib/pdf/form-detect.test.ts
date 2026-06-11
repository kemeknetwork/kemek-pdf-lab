import { describe, it, expect } from 'vitest';
import { classifyField, normalizeRect, buildFormFields, type RawWidget } from './form-detect.js';

const RECT = { x: 0, y: 0, width: 0.1, height: 0.05 };

function raw(over: Partial<RawWidget>): RawWidget {
  return { name: 'f', fieldType: 'Tx', rect: RECT, pageIndex: 0, ...over };
}

describe('classifyField', () => {
  it('maps each AcroForm field type to a fillable kind', () => {
    expect(classifyField(raw({ fieldType: 'Tx' }))).toBe('text');
    expect(classifyField(raw({ fieldType: 'Ch', combo: true }))).toBe('dropdown');
    expect(classifyField(raw({ fieldType: 'Ch', combo: false }))).toBe('listbox');
    expect(classifyField(raw({ fieldType: 'Btn', radioButton: true }))).toBe('radio');
    expect(classifyField(raw({ fieldType: 'Btn' }))).toBe('checkbox'); // plain Btn = checkbox
  });

  it('returns null for things v1 cannot fill', () => {
    expect(classifyField(raw({ fieldType: 'Btn', pushButton: true }))).toBeNull(); // action, not a value
    expect(classifyField(raw({ fieldType: 'Sig' }))).toBeNull();
    expect(classifyField(raw({ fieldType: '' }))).toBeNull();
  });
});

describe('normalizeRect', () => {
  it('divides a viewport rect down to 0..1 coords', () => {
    const r = normalizeRect([10, 20, 110, 70], 200, 300);
    expect(r.x).toBeCloseTo(0.05, 6);
    expect(r.y).toBeCloseTo(20 / 300, 6);
    expect(r.width).toBeCloseTo(0.5, 6);
    expect(r.height).toBeCloseTo(50 / 300, 6);
  });

  it('tolerates unordered corners (pdfjs can flip them after rotation)', () => {
    // Same rectangle, corners swapped — must yield the identical normalized box,
    // never a negative width/height.
    const r = normalizeRect([110, 70, 10, 20], 200, 300);
    expect(r.x).toBeCloseTo(0.05, 6);
    expect(r.width).toBeCloseTo(0.5, 6);
    expect(r.height).toBeGreaterThan(0);
  });

  it('guards against a zero viewport dimension instead of dividing by zero', () => {
    const r = normalizeRect([0, 0, 10, 10], 0, 0);
    expect(Number.isFinite(r.x)).toBe(true);
    expect(Number.isFinite(r.width)).toBe(true);
  });
});

describe('buildFormFields', () => {
  it('groups a field repeated across pages into one field with both widgets', () => {
    // A name shown in every page footer is one AcroForm field with several
    // widgets; the value is shared, so it must collapse to a single field.
    const fields = buildFormFields([
      raw({ name: 'fullName', fieldType: 'Tx', pageIndex: 0 }),
      raw({ name: 'fullName', fieldType: 'Tx', pageIndex: 2 })
    ]);
    expect(fields).toHaveLength(1);
    expect(fields[0].widgets.map((w) => w.pageIndex)).toEqual([0, 2]);
  });

  it('collapses a radio group into one field with one option per button', () => {
    // Each radio button is a separate widget sharing the field name; its
    // on-value is one selectable option. Three buttons → one field, three
    // options, three widgets.
    const fields = buildFormFields([
      raw({ name: 'plan', fieldType: 'Btn', radioButton: true, onValue: 'free' }),
      raw({ name: 'plan', fieldType: 'Btn', radioButton: true, onValue: 'pro' }),
      raw({ name: 'plan', fieldType: 'Btn', radioButton: true, onValue: 'team' })
    ]);
    expect(fields).toHaveLength(1);
    expect(fields[0].type).toBe('radio');
    expect(fields[0].options?.map((o) => o.value)).toEqual(['free', 'pro', 'team']);
    expect(fields[0].widgets).toHaveLength(3);
  });

  it('dedupes a radio on-value that appears on multiple widgets', () => {
    const fields = buildFormFields([
      raw({ name: 'plan', fieldType: 'Btn', radioButton: true, onValue: 'pro' }),
      raw({ name: 'plan', fieldType: 'Btn', radioButton: true, onValue: 'pro' })
    ]);
    expect(fields[0].options).toHaveLength(1);
  });

  it('skips unfillable widgets but keeps the fillable ones, in document order', () => {
    const fields = buildFormFields([
      raw({ name: 'go', fieldType: 'Btn', pushButton: true }), // dropped
      raw({ name: 'email', fieldType: 'Tx' }),
      raw({ name: 'sig', fieldType: 'Sig' }), // dropped
      raw({ name: 'agree', fieldType: 'Btn', onValue: 'Yes' })
    ]);
    expect(fields.map((f) => f.name)).toEqual(['email', 'agree']);
    expect(fields.map((f) => f.type)).toEqual(['text', 'checkbox']);
  });

  it('carries text-only metadata only on text fields', () => {
    const [text, check] = buildFormFields([
      raw({ name: 't', fieldType: 'Tx', multiline: true, maxLen: 50 }),
      raw({ name: 'c', fieldType: 'Btn', multiline: true, maxLen: 50 })
    ]);
    expect(text.multiline).toBe(true);
    expect(text.maxLen).toBe(50);
    expect(check.multiline).toBeUndefined();
    expect(check.maxLen).toBeUndefined();
  });
});
