// Store-only (uncompressed) ZIP writer — no dependencies.
//
// PDFs and rasterized images are already compressed, so deflating them again
// costs CPU for ~no size win; "stored" (method 0) entries are correct and
// effectively free. This is the keystone primitive behind "split into N files"
// and the future PDF->image / extract-images "download all" — anything that
// produces several files the user downloads as one archive.
//
// Implements the minimal ZIP subset: a local file header + data per entry, a
// central directory, and the end-of-central-directory record (APPNOTE 4.3,
// pre-ZIP64 — fine since per-file and total sizes stay well under 4GB here).

export interface ZipEntry {
	/** Path inside the archive (forward slashes). */
	name: string;
	data: Uint8Array;
}

// CRC-32 (IEEE 802.3), table-driven — required in every ZIP header.
const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

export function crc32(data: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

// Fixed DOS timestamp (1980-01-01 00:00) — the modified time is cosmetic, and a
// constant keeps makeZip pure + deterministic (no Date dependency).
const DOS_TIME = 0;
const DOS_DATE = 0x21;

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const EOCD = 22;

// General-purpose bit 11 (EFS): filenames are UTF-8 — required so non-ASCII
// document names (e.g. "отчёт.pdf") aren't mojibake'd as CP437 by strict tools.
const UTF8_FLAG = 0x0800;

/** Build a store-only ZIP archive from the given entries. */
export function makeZip(entries: ZipEntry[]): Uint8Array {
	// Pre-ZIP64: the EOCD entry count is uint16 (max 65535) and sizes/offsets are
	// uint32 (4GB). `setUint16` would silently wrap an over-count into a corrupt
	// archive, so guard the reachable case — a split of a 65k+ page PDF. The 4GB
	// ceilings are unreachable for this app's per-file PDF sizes.
	if (entries.length > 0xffff) {
		throw new Error(`Too many files for one ZIP archive (${entries.length}; max 65535).`);
	}
	const enc = new TextEncoder();
	const records = entries.map((e) => ({
		nameBytes: enc.encode(e.name),
		data: e.data,
		crc: crc32(e.data)
	}));

	const localSize = records.reduce((s, r) => s + LOCAL_HEADER + r.nameBytes.length + r.data.length, 0);
	const centralSize = records.reduce((s, r) => s + CENTRAL_HEADER + r.nameBytes.length, 0);
	const out = new Uint8Array(localSize + centralSize + EOCD);
	const view = new DataView(out.buffer);

	let pos = 0;
	const offsets: number[] = [];

	for (const r of records) {
		offsets.push(pos);
		view.setUint32(pos, 0x04034b50, true); // local file header signature
		view.setUint16(pos + 4, 20, true); // version needed
		view.setUint16(pos + 6, UTF8_FLAG, true); // flags
		view.setUint16(pos + 8, 0, true); // method: stored
		view.setUint16(pos + 10, DOS_TIME, true);
		view.setUint16(pos + 12, DOS_DATE, true);
		view.setUint32(pos + 14, r.crc, true);
		view.setUint32(pos + 18, r.data.length, true); // compressed size
		view.setUint32(pos + 22, r.data.length, true); // uncompressed size
		view.setUint16(pos + 26, r.nameBytes.length, true);
		view.setUint16(pos + 28, 0, true); // extra length
		out.set(r.nameBytes, pos + LOCAL_HEADER);
		out.set(r.data, pos + LOCAL_HEADER + r.nameBytes.length);
		pos += LOCAL_HEADER + r.nameBytes.length + r.data.length;
	}

	const centralStart = pos;
	records.forEach((r, i) => {
		view.setUint32(pos, 0x02014b50, true); // central directory header signature
		view.setUint16(pos + 4, 20, true); // version made by
		view.setUint16(pos + 6, 20, true); // version needed
		view.setUint16(pos + 8, UTF8_FLAG, true); // flags
		view.setUint16(pos + 10, 0, true); // method: stored
		view.setUint16(pos + 12, DOS_TIME, true);
		view.setUint16(pos + 14, DOS_DATE, true);
		view.setUint32(pos + 16, r.crc, true);
		view.setUint32(pos + 20, r.data.length, true); // compressed size
		view.setUint32(pos + 24, r.data.length, true); // uncompressed size
		view.setUint16(pos + 28, r.nameBytes.length, true);
		view.setUint16(pos + 30, 0, true); // extra length
		view.setUint16(pos + 32, 0, true); // comment length
		view.setUint16(pos + 34, 0, true); // disk number start
		view.setUint16(pos + 36, 0, true); // internal attrs
		view.setUint32(pos + 38, 0, true); // external attrs
		view.setUint32(pos + 42, offsets[i], true); // local header offset
		out.set(r.nameBytes, pos + CENTRAL_HEADER);
		pos += CENTRAL_HEADER + r.nameBytes.length;
	});

	view.setUint32(pos, 0x06054b50, true); // end of central directory signature
	view.setUint16(pos + 4, 0, true); // disk number
	view.setUint16(pos + 6, 0, true); // disk with central dir
	view.setUint16(pos + 8, records.length, true); // entries on this disk
	view.setUint16(pos + 10, records.length, true); // total entries
	view.setUint32(pos + 12, centralSize, true);
	view.setUint32(pos + 16, centralStart, true);
	view.setUint16(pos + 20, 0, true); // comment length

	return out;
}
