import { describe, it, expect } from 'vitest';
import { makeZip } from './zip.js';

// Minimal central-directory reader — parses makeZip output the way a real
// unzipper does (locate EOCD, walk the central dir, follow each local-header
// offset to the data), so the round-trip genuinely exercises the format.
function readZip(zip: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('no end-of-central-directory record');
  const count = view.getUint16(eocd + 10, true);
  let cd = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: { name: string; data: Uint8Array; crc: number }[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(cd, true) !== 0x02014b50) throw new Error('bad central header');
    const crc = view.getUint32(cd + 16, true);
    const size = view.getUint32(cd + 24, true);
    const nameLen = view.getUint16(cd + 28, true);
    const extraLen = view.getUint16(cd + 30, true);
    const commentLen = view.getUint16(cd + 32, true);
    const localOff = view.getUint32(cd + 42, true);
    const name = dec.decode(zip.subarray(cd + 46, cd + 46 + nameLen));
    const localNameLen = view.getUint16(localOff + 26, true);
    const localExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    out.push({ name, crc, data: new Uint8Array(zip.subarray(dataStart, dataStart + size)) });
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe('makeZip', () => {
  it('round-trips multiple entries (names + bytes intact)', () => {
    const a = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const b = Uint8Array.from({ length: 300 }, (_, i) => i % 256);
    const zip = makeZip([
      { name: 'page-1.pdf', data: a },
      { name: 'sub/page-2.pdf', data: b }
    ]);

    expect(zip[0]).toBe(0x50); // 'P'
    expect(zip[1]).toBe(0x4b); // 'K'

    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['page-1.pdf', 'sub/page-2.pdf']);
    expect(entries[0].data).toEqual(a);
    expect(entries[1].data).toEqual(b);
  });

  it('records a correct CRC-32 (known vector for "123456789" = 0xCBF43926)', () => {
    const data = new TextEncoder().encode('123456789');
    const [entry] = readZip(makeZip([{ name: 'x', data }]));
    expect(entry.crc >>> 0).toBe(0xcbf43926);
  });

  it('handles an empty file entry', () => {
    const entries = readZip(makeZip([{ name: 'empty.pdf', data: new Uint8Array(0) }]));
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toHaveLength(0);
    expect(entries[0].crc).toBe(0);
  });

  it('produces a valid empty archive (zero entries)', () => {
    const zip = makeZip([]);
    expect(zip).toHaveLength(22); // just the EOCD record
    expect(readZip(zip)).toEqual([]);
  });
});
