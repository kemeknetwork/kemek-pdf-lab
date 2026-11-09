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
// The qpdf-wasm build is single-threaded (its memory is not shared), so no
// COOP/COEP cross-origin isolation is required. Pure (bytes, password) → bytes, so it can move to a Web Worker
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

/**
 * qpdf could not read the file's structure, so the password was never the
 * problem — the right one fails the same way, and re-prompting would loop.
 */
export class DamagedPdfError extends DecryptError {
	constructor(message: string) {
		super(message);
		this.name = 'DamagedPdfError';
	}
}

export type QpdfOutcome = 'ok' | 'wrong-password' | 'damaged' | 'error';

/**
 * Classify a qpdf `--decrypt` run. qpdf's exit model: 0 = clean success, 3 =
 * success WITH warnings (output is still valid — common for real-world PDFs with
 * minor structural quirks, so it must NOT be treated as failure), 2 = error.
 * Exit 2 covers both a rejected password and a file qpdf can't parse; only its
 * `invalid password` message tells them apart, so the caller reports whether that
 * appeared. Success additionally requires the output to exist.
 */
export function classifyQpdfResult(
	exit: number,
	hasOutput: boolean,
	passwordRejected: boolean
): QpdfOutcome {
	if (hasOutput && (exit === 0 || exit === 3)) return 'ok';
	if (exit === 2) return passwordRejected ? 'wrong-password' : 'damaged';
	return 'error';
}

interface QpdfInstance {
	callMain: (args: string[]) => number;
	FS: {
		writeFile: (path: string, data: Uint8Array) => void;
		readFile: (path: string) => Uint8Array;
	};
}
export type QpdfFactory = (opts: {
	locateFile: () => string;
	printErr?: (...args: unknown[]) => void;
}) => Promise<QpdfInstance>;

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
 * @throws {DamagedPdfError} qpdf could not read the file, whatever the password
 * @throws {DecryptError} any other failure
 * @param create the qpdf factory; tests pass the Node-loaded build
 */
export async function decryptPdf(
	bytes: Uint8Array,
	password: string,
	create?: QpdfFactory
): Promise<Uint8Array> {
	create ??= await getFactory();

	// Exit 2 means a rejected password OR an unreadable file, and qpdf's
	// `<program>: /in.pdf: invalid password` stderr line is the only difference.
	// This build ignores the printErr hook: its glue binds console.error when the
	// instance is created and writes stderr through that. So the listener goes on
	// console.error BEFORE create() and stays through callMain (printErr gets it
	// too, in case a rebuild honours the hook). The rejection is expected — we
	// re-prompt — so it's swallowed; every other line passes through. Decrypt is
	// serialized by the caller's loadingBatch guard, so this brief window can't
	// swallow an unrelated concurrent error.
	let passwordRejected = false;
	const realConsoleError = console.error;
	const onStderr = (...args: unknown[]) => {
		if (typeof args[0] === 'string' && /invalid password/i.test(args[0])) passwordRejected = true;
		else realConsoleError(...args);
	};
	console.error = onStderr;

	let exit: number;
	let qpdf: QpdfInstance;
	try {
		qpdf = await create({ locateFile: () => '/qpdf.wasm', printErr: onStderr });
		qpdf.FS.writeFile('/in.pdf', bytes);
		try {
			exit = qpdf.callMain(['--password=' + password, '--decrypt', '/in.pdf', '/out.pdf']);
		} catch (e) {
			throw new DecryptError(`qpdf aborted: ${e instanceof Error ? e.message : String(e)}`);
		}
	} finally {
		console.error = realConsoleError;
	}

	let out: Uint8Array | null = null;
	try {
		out = qpdf.FS.readFile('/out.pdf');
	} catch {
		// no output file — failure (qpdf writes nothing on a bad password)
	}

	const outcome = classifyQpdfResult(exit, !!out, passwordRejected);
	if (outcome === 'wrong-password') throw new WrongPasswordError();
	// qpdf's own reason has already reached the console through onStderr.
	if (outcome === 'damaged') throw new DamagedPdfError(`qpdf could not read the file (exit ${exit})`);
	if (outcome === 'error' || !out) throw new DecryptError(`qpdf exited with code ${exit}`);

	// Detach a copy off the wasm heap before the instance is collected.
	return out.slice();
}
