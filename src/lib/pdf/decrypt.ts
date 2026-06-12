// Decrypt password-protected PDFs at ingest with qpdf (WebAssembly).
//
// Strategy: decrypt ONCE at the door and store the cleartext bytes, so pdfjs
// (render) and pdf-lib (export) downstream never see encryption — no passwords
// threaded through the pipeline, full fidelity (text/vectors preserved, not
// rasterized). qpdf handles the whole PDF encryption-handler zoo (RC4, AES-128,
// AES-256, the /Encrypt dict + key derivation) — the one place rolling our own
// would be a real mistake.
//
// The ~1.3MB wasm is lazy-imported (kept out of the initial bundle, like
// pdf-lib/pdfjs) and self-hosted at /qpdf.wasm (static/qpdf.wasm — a copy of the
// pinned node_modules build; the two MUST move together on a version bump).
// qpdf-wasm 0.3.0 is single-threaded, so no COOP/COEP cross-origin isolation is
// required. Pure (bytes, password) → bytes, so it can move to a Web Worker
// unchanged if main-thread decrypt of very large files ever janks.

/**
 * True if a pdfjs `getDocument()` rejection means the PDF is encrypted and needs
 * a password. pdfjs throws a `PasswordException` (name-checked structurally so we
 * don't import pdfjs just for the type) — code 1 NEED_PASSWORD on the first open,
 * code 2 INCORRECT_PASSWORD on a retry; either way the file is encrypted.
 */
export function isPasswordRequired(err: unknown): boolean {
	return (
		!!err && typeof err === 'object' && (err as { name?: string }).name === 'PasswordException'
	);
}

/** Wrong password — callers re-prompt. qpdf exits 2 and writes no output. */
export class WrongPasswordError extends Error {
	constructor() {
		super('Incorrect password');
		this.name = 'WrongPasswordError';
	}
}

/** Decryption failed for a non-password reason (corrupt, unsupported). */
export class DecryptError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DecryptError';
	}
}

interface QpdfInstance {
	callMain: (args: string[]) => number;
	FS: {
		writeFile: (path: string, data: Uint8Array) => void;
		readFile: (path: string) => Uint8Array;
	};
}
type QpdfFactory = (opts: { locateFile: () => string }) => Promise<QpdfInstance>;

let factory: QpdfFactory | null = null;

async function getFactory(): Promise<QpdfFactory> {
	if (!factory) {
		const mod = await import('@neslinesli93/qpdf-wasm');
		// CommonJS interop: the Emscripten glue exports the factory as default.
		factory = ((mod as unknown as { default?: QpdfFactory }).default ??
			(mod as unknown as QpdfFactory)) as QpdfFactory;
	}
	return factory;
}

/**
 * Decrypt a password-protected PDF to cleartext bytes. A fresh qpdf instance per
 * call — Emscripten tears the runtime down on exit, so instances are one-shot.
 * @throws {WrongPasswordError} the password is incorrect (re-promptable)
 * @throws {DecryptError} any other failure
 */
export async function decryptPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
	const create = await getFactory();
	const qpdf = await create({ locateFile: () => '/qpdf.wasm' });

	qpdf.FS.writeFile('/in.pdf', bytes);

	let exit: number;
	try {
		exit = qpdf.callMain(['--password=' + password, '--decrypt', '/in.pdf', '/out.pdf']);
	} catch (e) {
		throw new DecryptError(`qpdf aborted: ${e instanceof Error ? e.message : String(e)}`);
	}

	let out: Uint8Array | null = null;
	try {
		out = qpdf.FS.readFile('/out.pdf');
	} catch {
		// no output file — failure (qpdf writes nothing on a bad password)
	}

	if (exit !== 0 || !out) {
		if (exit === 2) throw new WrongPasswordError();
		throw new DecryptError(`qpdf exited with code ${exit}`);
	}

	// Detach a copy off the wasm heap before the instance is collected.
	return out.slice();
}
