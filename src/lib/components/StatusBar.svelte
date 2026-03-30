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
      <span class="status-selection">{selectedCount} selected</span>
    {/if}
  </div>

  <div class="status-center">
    {#if hasSelection}
      <button
        class="status-btn"
        onclick={onrotateccw}
        title="Rotate counter-clockwise"
      >
        <RotateCcw size={16} />
      </button>
      <button
        class="status-btn"
        onclick={onrotatecw}
        title="Rotate clockwise (R)"
      >
        <RotateCw size={16} />
      </button>
      <button
        class="status-btn danger"
        onclick={ondelete}
        title="Delete selected (Delete)"
      >
        <Trash2 size={16} />
      </button>
    {/if}
  </div>

  <div class="status-right">
    <span class="status-total">{totalPages} {totalPages === 1 ? 'page' : 'pages'}</span>
  </div>
</footer>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--pdf-lab-surface);
    border-top: 1px solid var(--pdf-lab-border);
    flex-shrink: 0;
    min-height: 40px;
  }

  .status-left,
  .status-center,
  .status-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-left {
    flex: 1;
  }

  .status-right {
    flex: 1;
    justify-content: flex-end;
  }

  .status-selection {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--pdf-lab-primary);
  }

  .status-total {
    font-size: 0.8rem;
    color: var(--pdf-lab-text-secondary);
  }

  .status-btn {
    display: inline-flex;
    align-items: center;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 5px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .status-btn:hover {
    background: var(--pdf-lab-surface-hover);
  }

  .status-btn.danger:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: var(--pdf-lab-danger);
    color: var(--pdf-lab-danger);
  }
</style>
