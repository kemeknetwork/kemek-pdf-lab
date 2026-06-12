import { describe, it, expect } from 'vitest';
import { isPasswordRequired, WrongPasswordError, DecryptError } from './decrypt.js';

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

describe('decrypt error types', () => {
  it('carry stable names so the load flow can branch on them', () => {
    expect(new WrongPasswordError().name).toBe('WrongPasswordError');
    expect(new DecryptError('x').name).toBe('DecryptError');
    expect(new WrongPasswordError()).toBeInstanceOf(Error);
  });
});
