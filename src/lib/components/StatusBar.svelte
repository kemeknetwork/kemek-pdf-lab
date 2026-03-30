<!--
  StatusBar — bottom bar showing page count, selection state, and quick actions.

  When pages are selected, the center section shows rotate and delete buttons.
  The left shows a selection count badge; the right shows the page total and
  KeMeK Network copyright.

  @prop totalPages — number of pages in the workspace.
  @prop selectedCount — number of currently selected pages.
  @prop onrotatecw / onrotateccw / ondelete — action callbacks for selected pages.
-->
<script lang="ts">
  import { RotateCw, RotateCcw, Trash2 } from 'lucide-svelte';

  interface Props {
    totalPages: number;
    selectedCount: number;
    onrotatecw: () => void;
    onrotateccw: () => void;
    ondelete: () => void;
  }

  let { totalPages, selectedCount, onrotatecw, onrotateccw, ondelete }: Props = $props();

  let hasSelection = $derived(selectedCount > 0);
</script>

<footer class="status-bar">
  <div class="status-left">
    {#if hasSelection}
      <span class="status-selection">
        <span class="selection-dot"></span>
        {selectedCount} selected
      </span>
    {/if}
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
    <span class="status-copyright">&copy; {new Date().getFullYear()} KeMeK Network</span>
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
</style>
