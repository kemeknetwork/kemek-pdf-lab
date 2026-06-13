import { describe, it, expect } from 'vitest';
import { formatPdfDate, buildMetadataFields, countSensitive, type DocumentMetadata } from './inspect.js';

describe('formatPdfDate', () => {
  it('formats a full PDF date string', () => {
    expect(formatPdfDate("D:20240115093045Z")).toBe('2024-01-15 09:30:45');
  });

  it('formats a date with a UTC offset without converting the time', () => {
    // No timezone math: the clock components are shown as written, so the output
    // can't drift with the viewer's locale.
    expect(formatPdfDate("D:20240115093045-05'00'")).toBe('2024-01-15 09:30:45');
  });

  it('handles a date-only value (no time components)', () => {
    expect(formatPdfDate('D:20240115')).toBe('2024-01-15');
  });

  it('tolerates the D: prefix being absent', () => {
    expect(formatPdfDate('20240115093045')).toBe('2024-01-15 09:30:45');
  });

  it('fills missing minutes/seconds with zeros', () => {
    expect(formatPdfDate('D:2024011509')).toBe('2024-01-15 09:00:00');
  });

  it('returns an unparseable value verbatim', () => {
    expect(formatPdfDate('not a date')).toBe('not a date');
  });
});

describe('buildMetadataFields', () => {
  it('surfaces only present fields, in display order, flagging identifying ones', () => {
    const fields = buildMetadataFields({
      Producer: 'AcmePDF',
      Author: 'Jane Doe',
      Title: 'Report',
      CreationDate: 'D:20240115093045Z'
    });
    expect(fields.map((f) => f.key)).toEqual(['Title', 'Author', 'Producer', 'CreationDate']);
    expect(fields.find((f) => f.key === 'Author')?.sensitive).toBe(true);
    expect(fields.find((f) => f.key === 'Title')?.sensitive).toBe(false);
    expect(fields.find((f) => f.key === 'CreationDate')?.value).toBe('2024-01-15 09:30:45');
  });

  it('skips empty, whitespace, and non-string values', () => {
    const fields = buildMetadataFields({ Author: '   ', Title: '', Subject: 42, Producer: 'X' });
    expect(fields.map((f) => f.key)).toEqual(['Producer']);
  });

  it('returns nothing for an info object with no recognised keys', () => {
    expect(buildMetadataFields({ Trapped: 'False', PDFFormatVersion: '1.7' })).toEqual([]);
  });
});

describe('countSensitive', () => {
  it('counts only the identifying fields', () => {
    const meta: DocumentMetadata = {
      id: 'doc-a',
      name: 'a.pdf',
      pageCount: 1,
      version: '1.7',
      fields: buildMetadataFields({ Title: 'T', Author: 'A', Producer: 'P' }),
      hasXmp: false,
      hasAcroForm: false,
      hasXfa: false,
      hasJavaScript: false,
      attachmentCount: 0,
      encrypted: false
    };
    expect(countSensitive(meta)).toBe(2); // Author + Producer, not Title
  });
});
