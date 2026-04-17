<script lang="ts">
  import { RotateCw, RotateCcw, Trash2 } from 'lucide-svelte';
  import { getGridDensity, setGridDensity } from '$lib/stores/preferences.svelte.js';
  import type { GridDensity } from '$lib/stores/preferences.svelte.js';

  interface Props {
    totalPages: number;
    selectedCount: number;
    onrotatecw: () => void;
    onrotateccw: () => void;
    ondelete: () => void;
  }

  let { totalPages, selectedCount, onrotatecw, onrotateccw, ondelete }: Props = $props();

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
      <div class="status-btn-divider"></div>
    {/if}
    <div class="density-toggle">
      {#each densities as d}
        <button
          class="density-btn"
          class:active={density === d.value}
          onclick={() => setGridDensity(d.value)}
          title={d.title}
        >
          {d.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="status-center">
    {#if hasSelection}
      <button
        class="status-btn"
        onclick={onrotateccw}
        title="Rotate counter-clockwise"
      >
        <RotateCcw size={14} />
      </button>
      <button
        class="status-btn"
        onclick={onrotatecw}
        title="Rotate clockwise (R)"
      >
        <RotateCw size={14} />
      </button>
      <div class="status-btn-divider"></div>
      <button
        class="status-btn danger"
        onclick={ondelete}
        title="Delete selected (Delete)"
      >
        <Trash2 size={14} />
      </button>
    {/if}
  </div>

  <div class="status-right">
    <span class="status-total">{totalPages} {totalPages === 1 ? 'page' : 'pages'}</span>
    <span class="status-sep">&middot;</span>
    <span class="status-copyright">KeMeK Network &copy; {new Date().getFullYear()} | PDF Lab v{__APP_VERSION__}</span>
  </div>
</footer>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    height: 2.25rem;
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
  }

  .status-selection {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--pdf-lab-primary);
  }

  .selection-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--pdf-lab-primary);
  }

  .status-total {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--pdf-lab-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .status-sep {
    color: var(--pdf-lab-text-tertiary);
    font-size: 0.75rem;
  }

  .status-copyright {
    font-size: 0.6875rem;
    color: var(--pdf-lab-text-tertiary);
  }

  .status-btn {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.4375rem;
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

  .density-toggle {
    display: flex;
    gap: 1px;
  }

  .density-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.375rem;
    border: 1px solid var(--pdf-lab-border);
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text-tertiary);
    font-size: 0.625rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.12s ease;
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
</style>
