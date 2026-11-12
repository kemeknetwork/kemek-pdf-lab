import { describe, expect, it } from 'vitest';
import { packageOf, renderNotices } from './vite.third-party-notices.ts';

describe('packageOf', () => {
  const root = '/repo/node_modules/';

  it('names a plain package and its directory', () => {
    expect(packageOf(`${root}pdf-lib/es/index.js`)).toEqual({ name: 'pdf-lib', dir: `${root}pdf-lib` });
  });

  it('keeps both segments of a scoped package', () => {
    expect(packageOf(`${root}@pdf-lib/upng/dist/upng.js`)).toEqual({
      name: '@pdf-lib/upng',
      dir: `${root}@pdf-lib/upng`
    });
  });

  it('attributes a nested dependency to itself, not its parent', () => {
    // pdf-lib's own copy of tslib ships tslib's code, under tslib's license.
    expect(packageOf(`${root}pdf-lib/node_modules/tslib/tslib.es6.js`)).toEqual({
      name: 'tslib',
      dir: `${root}pdf-lib/node_modules/tslib`
    });
  });

  it('drops a Svelte part query and a virtual-module prefix', () => {
    expect(packageOf(`${root}lucide-svelte/dist/Icon.svelte?svelte&type=style&lang.css`)?.name).toBe('lucide-svelte');
    expect(packageOf(`\0${root}svelte/src/index.js`)?.name).toBe('svelte');
  });

  it('reads Windows separators', () => {
    expect(packageOf('C:\\repo\\node_modules\\svelte\\src\\index.js')?.name).toBe('svelte');
  });

  it('returns null for the app’s own code and for tool-injected virtual modules', () => {
    expect(packageOf('/repo/src/lib/pdf/operator.ts')).toBeNull();
    expect(packageOf('\0vite/preload-helper.js')).toBeNull();
    expect(packageOf('/@unplugin-pwa/virtual:pwa-register')).toBeNull();
  });

  it('does not invent a package from a bare scope or a dotfile directory', () => {
    expect(packageOf(`${root}@scope`)).toBeNull();
    expect(packageOf(`${root}.vite/deps/chunk.js`)).toBeNull();
  });
});

describe('renderNotices', () => {
  const pkg = { title: 'pdf-lib 1.17.1', license: 'MIT', url: 'https://pdf-lib.js.org', text: 'MIT License\n\nCopyright (c) 2019 Andrew Dillon' };
  const extra = { title: 'zlib 1.2.12 (compiled into qpdf.wasm)', license: 'Zlib', text: 'Copyright (C) 1995-2022 Jean-loup Gailly and Mark Adler' };
  const out = renderNotices('9.9.9', [pkg], [extra]);

  it('carries the IJG acknowledgement its license requires of a binary distribution', () => {
    expect(out).toContain('This software is based in part on the work of the Independent JPEG Group.');
  });

  it('lists every entry, then reproduces each license in full', () => {
    expect(out).toContain('  - pdf-lib 1.17.1 [MIT]');
    expect(out).toContain('  - zlib 1.2.12 (compiled into qpdf.wasm) [Zlib]');
    expect(out.indexOf('Copyright (c) 2019 Andrew Dillon')).toBeGreaterThan(out.indexOf('  - zlib'));
    expect(out).toContain('Copyright (C) 1995-2022 Jean-loup Gailly and Mark Adler');
    expect(out).toContain('https://pdf-lib.js.org');
  });

  it('names the app version it was built for', () => {
    expect(out.split('\n')[0]).toBe('Third-party notices for KeMeK PDF Lab 9.9.9');
  });
});
