/**
 * User preferences store — persisted to localStorage.
 *
 * Stores UI preferences as a single JSON blob under 'pdf-lab-prefs'. The `_v`
 * field lets future schema changes invalidate stale entries.
 *
 * File must be `.svelte.ts` for rune compilation.
 */

const STORAGE_KEY = 'pdf-lab-prefs';
const CURRENT_VERSION = 1;

export type GridDensity = 'compact' | 'default' | 'spacious';

interface StoredPreferences {
  _v: number;
  gridDensity: GridDensity;
  lastExportName: string;
}

const DEFAULTS: StoredPreferences = {
  _v: CURRENT_VERSION,
  gridDensity: 'default',
  lastExportName: '',
};

function load(): StoredPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    if (parsed._v !== CURRENT_VERSION) return { ...DEFAULTS };
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(prefs: StoredPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded)
  }
}

const initial = typeof localStorage !== 'undefined' ? load() : { ...DEFAULTS };

let gridDensity = $state<GridDensity>(initial.gridDensity);
let lastExportName = $state(initial.lastExportName);

// Skip the first synchronous run so page load doesn't write identical state.
let initialized = false;
$effect.root(() => {
  $effect(() => {
    const prefs: StoredPreferences = {
      _v: CURRENT_VERSION,
      gridDensity,
      lastExportName,
    };
    if (!initialized) {
      initialized = true;
      return;
    }
    save(prefs);
  });
});

export function getGridDensity(): GridDensity { return gridDensity; }
export function getLastExportName(): string { return lastExportName; }
export function setGridDensity(value: GridDensity): void { gridDensity = value; }
export function setLastExportName(value: string): void { lastExportName = value; }

/** Map grid density to CSS grid-template-columns minmax value. */
export function getGridMinWidth(): string {
  switch (gridDensity) {
    case 'compact': return '170px';
    case 'spacious': return '280px';
    default: return '210px';
  }
}

/** Map grid density to thumbnail render width for optimal quality. */
export function getRenderWidth(): number {
  switch (gridDensity) {
    case 'compact': return 180;
    case 'spacious': return 300;
    default: return 240;
  }
}
