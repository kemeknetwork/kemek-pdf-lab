import { describe, it, expect } from 'vitest';
import { isPasswordRequired, classifyQpdfResult, WrongPasswordError, DecryptError } from './decrypt.js';

describe('isPasswordRequired', () => {
  it('recognizes a pdfjs PasswordException (any code = encrypted)', () => {
    // pdfjs throws code 1 (NEED_PASSWORD) on first open, code 2 (INCORRECT) on
    // retry — both mean "encrypted", which is the only distinction the load path
    // needs (the qpdf decrypt step owns wrong-vs-right).
    expect(isPasswordRequired({ name: 'PasswordException', code: 1 })).toBe(true);
    expect(isPasswordRequired({ name: 'PasswordException', code: 2 })).toBe(true);
  });

  it('does not mistake an ordinary load failure for a password prompt', () => {
    expect(isPasswordRequired(new Error('Invalid PDF structure'))).toBe(false);
    expect(isPasswordRequired({ name: 'InvalidPDFException' })).toBe(false);
    expect(isPasswordRequired(null)).toBe(false);
    expect(isPasswordRequired(undefined)).toBe(false);
    expect(isPasswordRequired('PasswordException')).toBe(false); // a string, not the error
  });
});

describe('classifyQpdfResult', () => {
  it('accepts a clean success (exit 0 with output)', () => {
    expect(classifyQpdfResult(0, true)).toBe('ok');
  });

  it('accepts success-WITH-warnings (exit 3 with output) — must not be a failure', () => {
    // qpdf returns 3 for valid-output-but-warnings, common on real-world PDFs
    // with minor structural quirks. Treating it as failure would falsely reject
    // legitimate unlocks — the bug this test pins.
    expect(classifyQpdfResult(3, true)).toBe('ok');
  });

  it('maps exit 2 to wrong-password (qpdf does not distinguish corrupt)', () => {
    expect(classifyQpdfResult(2, false)).toBe('wrong-password');
    expect(classifyQpdfResult(2, true)).toBe('wrong-password'); // error exit wins over stray output
  });

  it('treats a success exit code with NO output as an error', () => {
    expect(classifyQpdfResult(0, false)).toBe('error');
    expect(classifyQpdfResult(3, false)).toBe('error');
  });

  it('treats any other non-zero exit as an error', () => {
    expect(classifyQpdfResult(1, true)).toBe('error');
    expect(classifyQpdfResult(5, false)).toBe('error');
  });
});

describe('decrypt error types', () => {
  it('carry stable names so the load flow can branch on them', () => {
    expect(new WrongPasswordError().name).toBe('WrongPasswordError');
    expect(new DecryptError('x').name).toBe('DecryptError');
    expect(new WrongPasswordError()).toBeInstanceOf(Error);
  });
});
