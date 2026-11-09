import { afterEach, beforeEach, describe, it, expect, vi, type MockInstance } from 'vitest';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import {
  classifyQpdfResult,
  DamagedPdfError,
  DecryptError,
  decryptPdf,
  isPasswordRequired,
  WrongPasswordError,
  type QpdfFactory
} from './decrypt.js';

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
    expect(classifyQpdfResult(0, true, false)).toBe('ok');
  });

  it('accepts success-WITH-warnings (exit 3 with output) — must not be a failure', () => {
    // qpdf returns 3 for valid-output-but-warnings, common on real-world PDFs
    // with minor structural quirks. Treating it as failure would falsely reject
    // legitimate unlocks — the bug this test pins.
    expect(classifyQpdfResult(3, true, false)).toBe('ok');
  });

  it('maps exit 2 to wrong-password only when qpdf rejected the password', () => {
    expect(classifyQpdfResult(2, false, true)).toBe('wrong-password');
    expect(classifyQpdfResult(2, true, true)).toBe('wrong-password'); // error exit wins over stray output
  });

  it('maps exit 2 without a rejection to damaged, so the prompt does not loop', () => {
    // qpdf stops before the password check when it can't parse the file, so the
    // RIGHT password lands here too. Reading that as a wrong password re-prompted
    // forever.
    expect(classifyQpdfResult(2, false, false)).toBe('damaged');
  });

  it('treats a success exit code with NO output as an error', () => {
    expect(classifyQpdfResult(0, false, false)).toBe('error');
    expect(classifyQpdfResult(3, false, false)).toBe('error');
  });

  it('treats any other non-zero exit as an error', () => {
    expect(classifyQpdfResult(1, true, false)).toBe('error');
    expect(classifyQpdfResult(5, false, true)).toBe('error');
  });
});

describe('decrypt error types', () => {
  it('carry stable names so the load flow can branch on them', () => {
    expect(new WrongPasswordError().name).toBe('WrongPasswordError');
    expect(new DecryptError('x').name).toBe('DecryptError');
    expect(new DamagedPdfError('x').name).toBe('DamagedPdfError');
    expect(new WrongPasswordError()).toBeInstanceOf(Error);
    expect(new DamagedPdfError('x')).toBeInstanceOf(DecryptError);
  });
});

// The engine the app serves (static/qpdf.wasm; CI checks it matches the package),
// loaded the way Node loads the glue.
const SERVED_WASM = join(import.meta.dirname, '..', '..', '..', 'static', 'qpdf.wasm');
const nodeFactory = createRequire(import.meta.url)('@neslinesli93/qpdf-wasm') as QpdfFactory;
const create: QpdfFactory = (opts) => nodeFactory({ ...opts, locateFile: () => SERVED_WASM });

async function lockedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  doc.addPage([200, 200]);
  const qpdf = await create({ locateFile: () => SERVED_WASM });
  qpdf.FS.writeFile('/in.pdf', await doc.save());
  const exit = qpdf.callMain(['--encrypt', 'user1', 'owner1', '256', '--', '/in.pdf', '/out.pdf']);
  if (exit !== 0) throw new Error(`fixture encryption failed: exit ${exit}`);
  return qpdf.FS.readFile('/out.pdf').slice();
}

describe('decryptPdf with the shipped qpdf build', () => {
  // Classification depends on where the glue writes qpdf's stderr. If a
  // qpdf-wasm bump moves the `invalid password` line off console.error and
  // printErr, every wrong password reads as a damaged file: these catch that.
  let consoleError: MockInstance;
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it('unlocks with the user or the owner password', async () => {
    const locked = await lockedPdf();
    for (const password of ['user1', 'owner1']) {
      const doc = await PDFDocument.load(await decryptPdf(locked, password, create), {
        updateMetadata: false
      });
      expect(doc.getPageCount()).toBe(2);
      expect(doc.isEncrypted).toBe(false);
    }
  });

  it('rejects a wrong password as re-promptable and keeps the expected line off the console', async () => {
    await expect(decryptPdf(await lockedPdf(), 'nope', create)).rejects.toBeInstanceOf(WrongPasswordError);
    expect(consoleError).not.toHaveBeenCalled();
    expect(console.error).toBe(consoleError); // the listener is removed afterwards
  });

  it('reports an unreadable file as damaged and passes qpdf\'s reason to the console', async () => {
    const garbage = new TextEncoder().encode('%PDF-1.7\n garbage \n%%EOF');
    await expect(decryptPdf(garbage, 'user1', create)).rejects.toBeInstanceOf(DamagedPdfError);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("can't find startxref"));
  });

  it('never calls the right password wrong on a damaged encrypted file', async () => {
    // Junk after %%EOF: pdf.js still asks for the password, but this qpdf build
    // can't find startxref (native qpdf recovers it). A build that recovers would
    // decrypt instead, which is also right; re-prompting is the bug.
    const locked = await lockedPdf();
    const damaged = new Uint8Array(locked.length + 2000);
    damaged.set(locked);
    const result = await decryptPdf(damaged, 'user1', create).then(
      () => 'decrypted',
      (e: unknown) => e
    );
    expect(result === 'decrypted' || result instanceof DamagedPdfError).toBe(true);
  });
});
