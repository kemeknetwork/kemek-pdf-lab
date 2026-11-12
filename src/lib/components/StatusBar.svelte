<script lang="ts">
  import { RotateCw, RotateCcw, Trash2, Eraser, ArrowDownUp, Copy } from 'lucide-svelte';
  import { getGridDensity, setGridDensity } from '#lib/stores/preferences.svelte.js';
  import type { GridDensity } from '#lib/stores/preferences.svelte.js';

  interface Props {
    totalPages: number;
    selectedCount: number;
    onrotatecw: () => void;
    onrotateccw: () => void;
    onduplicate: () => void;
    onreverse: () => void;
    ondelete: () => void;
    onclear: () => void;
  }

  let { totalPages, selectedCount, onrotatecw, onrotateccw, onduplicate, onreverse, ondelete, onclear }: Props = $props();

  let hasSelection = $derived(selectedCount > 0);
  let density = $derived(getGridDensity());
  const densities: { value: GridDensity; label: string; title: string }[] = [
    { value: 'compact', label: 'S', title: 'Compact grid' },
    { value: 'default', label: 'M', title: 'Default grid' },
    { value: 'spacious', label: 'L', title: 'Spacious grid' },
  ];
</script>

<footer class="status-bar">
  <div class="status-left">
    {#if hasSelection}
      <span class="status-selection">
        <span class="selection-dot"></span>
        {selectedCount} selected
      </span>
      <div class="status-btn-divider density-divider"></div>
    {/if}
    <div class="density-toggle">
      {#each densities as d}
        <button
          class="density-btn"
          class:active={density === d.value}
          onclick={() => setGridDensity(d.value)}
          title={d.title}
          aria-label={d.title}
          aria-pressed={density === d.value}
        >
          {d.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="status-center">
    {#if totalPages >= 2}
      <button
        class="status-btn"
        onclick={onreverse}
        title="Reverse the whole page order"
        aria-label="Reverse page order"
      >
        <ArrowDownUp size={16} />
      </button>
    {/if}
    {#if hasSelection}
      {#if totalPages >= 2}<div class="status-btn-divider"></div>{/if}
      <button
        class="status-btn"
        onclick={onrotateccw}
        title="Rotate counter-clockwise"
        aria-label="Rotate counter-clockwise"
      >
        <RotateCcw size={16} />
      </button>
      <button
        class="status-btn"
        onclick={onrotatecw}
        title="Rotate clockwise (R)"
        aria-label="Rotate clockwise"
      >
        <RotateCw size={16} />
      </button>
      <button
        class="status-btn"
        onclick={onduplicate}
        title="Duplicate selected pages"
        aria-label="Duplicate selected pages"
      >
        <Copy size={16} />
      </button>
      <div class="status-btn-divider"></div>
      <button
        class="status-btn danger"
        onclick={ondelete}
        title="Delete selected (Delete)"
        aria-label="Delete selected pages"
      >
        <Trash2 size={16} />
      </button>
    {/if}
  </div>

  <div class="status-right">
    <button
      class="status-clear"
      onclick={onclear}
      title="Clear all files from memory (forget everything)"
      aria-label="Clear all files"
    >
      <Eraser size={14} />
      <span class="clear-text" aria-hidden="true">Clear</span>
    </button>
    <div class="status-btn-divider"></div>
    <span class="status-total">{totalPages} {totalPages === 1 ? 'page' : 'pages'}</span>
    <span class="status-sep">&middot;</span>
    <!-- New tab: leaving this one would drop the open files (memory only). -->
    <span class="status-copyright"><a class="status-link" href="https://kemek.com" target="_blank" rel="noopener noreferrer">KeMeK Network</a> &copy; {new Date().getFullYear()} | PDF Lab v{__APP_VERSION__} | License: MIT</span>
  </div>
</footer>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    height: 2.5rem;
    background: var(--pdf-lab-surface);
    border-top: 1px solid var(--pdf-lab-border);
    flex-shrink: 0;
  }

  .status-left,
  .status-center,
  .status-right {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .status-left {
    flex: 1;
  }

  .status-right {
    flex: 1;
    justify-content: flex-end;
    min-width: 0;
  }

  .status-selection {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--pdf-lab-primary);
    flex-shrink: 0;
  }

  .selection-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--pdf-lab-primary);
  }

  .status-total {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--pdf-lab-text-secondary);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .status-sep {
    color: var(--pdf-lab-text-tertiary);
    font-size: 0.8125rem;
    flex-shrink: 0;
  }

  /* Decorative brand+version: allowed to ellipsis-truncate so a longer string
     (or a narrow phone) never pushes the bar into horizontal overflow. */
  .status-copyright {
    font-size: 0.8125rem;
    color: var(--pdf-lab-text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  /* Quiet like the line it sits in, but underlined: a link by more than colour. */
  .status-link {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: var(--pdf-lab-border-strong);
    text-underline-offset: 0.2em;
  }
  .status-link:hover {
    color: var(--pdf-lab-primary);
    text-decoration-color: currentColor;
  }

  .status-btn {
    display: inline-flex;
    align-items: center;
    padding: 0.3125rem 0.5rem;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 5px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text-secondary);
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .status-btn:hover {
    background: var(--pdf-lab-surface-hover);
    color: var(--pdf-lab-text);
    border-color: var(--pdf-lab-border-strong);
  }

  .status-btn:focus-visible {
    outline: 2px solid var(--pdf-lab-primary);
    outline-offset: 1px;
  }

  .status-btn:active {
    transform: scale(0.95);
  }

  .status-btn.danger:hover {
    background: var(--pdf-lab-danger-bg);
    border-color: var(--pdf-lab-danger);
    color: var(--pdf-lab-danger);
  }

  .status-btn-divider {
    width: 1px;
    height: 1rem;
    background: var(--pdf-lab-border);
  }

  .status-clear {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--pdf-lab-text-tertiary);
    font-family: var(--pdf-lab-font);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.12s ease;
  }
  .status-clear:hover {
    color: var(--pdf-lab-danger);
    border-color: var(--pdf-lab-danger);
    background: var(--pdf-lab-danger-bg);
  }
  .status-clear:focus-visible {
    outline: 2px solid var(--pdf-lab-primary);
    outline-offset: 1px;
  }
  .status-clear:active {
    transform: scale(0.96);
  }

  .density-toggle {
    display: flex;
    gap: 1px;
  }

  .density-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.625rem;
    height: 1.5rem;
    border: 1px solid var(--pdf-lab-border);
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text-tertiary);
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.12s ease;
    flex-shrink: 0;
  }

  .density-btn:first-child {
    border-radius: 4px 0 0 4px;
  }

  .density-btn:last-child {
    border-radius: 0 4px 4px 0;
  }

  .density-btn:not(:first-child) {
    border-left: none;
  }

  .density-btn:focus-visible {
    outline: 2px solid var(--pdf-lab-primary);
    outline-offset: 1px;
  }

  .density-btn:hover {
    background: var(--pdf-lab-surface-hover);
    color: var(--pdf-lab-text-secondary);
  }

  .density-btn.active {
    background: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
    border-color: var(--pdf-lab-primary);
  }

  .density-btn.active + .density-btn {
    border-left-color: var(--pdf-lab-primary);
  }

  /* Phones: the brand/version line just truncates to noise on a narrow bar — drop
     it and its separator, keeping the functional controls (density, rotate/delete,
     clear, page count). The empty-state footer still carries the full credit. */
  @media (max-width: 560px) {
    .status-bar {
      padding: 0 0.625rem;
    }
    .status-copyright,
    .status-sep {
      display: none;
    }
  }

  /* PHONE — a selection's actions (reverse, rotate ×2, duplicate, delete) need the
     room. Grid density does nothing here (one column at every setting), so it
     goes; Clear keeps its icon and its name. */
  @media (max-width: 480px) {
    .density-toggle,
    .density-divider {
      display: none;
    }
    .clear-text {
      display: none;
    }
    .status-left,
    .status-center,
    .status-right {
      gap: 0.25rem;
    }
    .status-btn {
      padding: 0.3125rem 0.4375rem;
      min-height: 1.875rem;
    }
  }
</style>
