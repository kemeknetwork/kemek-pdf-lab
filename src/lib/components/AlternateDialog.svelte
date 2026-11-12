<script lang="ts">
  import { holdDialogFocus, trapTab } from '#lib/utils/focus-trap.js';
  import { getDocuments, getPages, reorderPages } from '#lib/stores/app.svelte.js';
  import { interleave } from '#lib/pdf/interleave.js';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  // Snapshot at mount — the dialog is modal, so the page set can't change under it.
  const allPages = getPages();
  const documents = getDocuments();

  // Only documents that still have pages in the workspace are interleavable.
  const docOptions = documents
    .map((d) => ({
      id: d.id,
      name: d.name,
      count: allPages.filter((p) => p.sourceDocumentId === d.id).length
    }))
    .filter((o) => o.count > 0);

  let aId = $state(docOptions[0]?.id ?? '');
  let bId = $state(docOptions[1]?.id ?? '');
  let reverseB = $state(false);

  let cardEl = $state<HTMLDivElement | null>(null);
  const dialogId = $props.id();

  $effect(() => holdDialogFocus(() => cardEl));

  const aPages = $derived(allPages.filter((p) => p.sourceDocumentId === aId));
  const bPages = $derived(allPages.filter((p) => p.sourceDocumentId === bId));
  // Pages from any other loaded document keep their order, appended after the mix.
  const rest = $derived(
    allPages.filter((p) => p.sourceDocumentId !== aId && p.sourceDocumentId !== bId)
  );
  const sameDoc = $derived(aId === bId);
  const canApply = $derived(!sameDoc && aPages.length > 0 && bPages.length > 0);

  function nameOf(id: string): string {
    return docOptions.find((o) => o.id === id)?.name ?? '';
  }

  function apply() {
    if (!canApply) return;
    reorderPages([...interleave(aPages, bPages, reverseB), ...rest]);
    onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    // cardEl was bound but never trapped, so Tab walked out of the modal into
    // the grid behind it.
    trapTab(e, cardEl);
  }
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="dialog-overlay" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="alt-title-{dialogId}"
    tabindex="-1"
    bind:this={cardEl}
    onclick={(e) => e.stopPropagation()}
  >
    <h3 class="dialog-title" id="alt-title-{dialogId}">Alternate &amp; mix</h3>
    <p class="dialog-blurb">
      Interleave two documents page-by-page — A, B, A, B… The classic fix for a
      duplex job scanned in two single-sided passes (fronts in one file, backs in
      another).
    </p>

    <div class="slots">
      <div class="slot">
        <label class="dialog-label" for="alt-a-{dialogId}">Document A <span class="slot-tag a">fronts</span></label>
        <select id="alt-a-{dialogId}" class="dialog-select" bind:value={aId}>
          {#each docOptions as o (o.id)}
            <option value={o.id}>{o.name} · {o.count}p</option>
          {/each}
        </select>
      </div>

      <span class="slot-join" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m16 3 4 4-4 4" /><path d="M20 7H4" />
          <path d="m8 21-4-4 4-4" /><path d="M4 17h16" />
        </svg>
      </span>

      <div class="slot">
        <label class="dialog-label" for="alt-b-{dialogId}">Document B <span class="slot-tag b">backs</span></label>
        <select id="alt-b-{dialogId}" class="dialog-select" bind:value={bId}>
          {#each docOptions as o (o.id)}
            <option value={o.id}>{o.name} · {o.count}p</option>
          {/each}
        </select>
      </div>
    </div>

    <label class="reverse-row">
      <input type="checkbox" bind:checked={reverseB} />
      <span class="reverse-text">
        <span class="reverse-label">Reverse document B</span>
        <span class="reverse-hint">Turn on if the backs were fed last-sheet-first (bottom-up)</span>
      </span>
    </label>

    <p class="result" class:warn={!canApply}>
      {#if sameDoc}
        Pick two different documents.
      {:else if aPages.length === 0 || bPages.length === 0}
        Both documents need at least one page.
      {:else}
        {nameOf(aId)} ({aPages.length}p) + {nameOf(bId)} ({bPages.length}p) →
        <strong>{aPages.length + bPages.length + rest.length} pages</strong>, alternating
        {#if rest.length > 0}<span class="result-rest"> · {rest.length} other page{rest.length === 1 ? '' : 's'} kept at the end</span>{/if}
      {/if}
    </p>

    <div class="dialog-actions">
      <button class="dialog-btn cancel" onclick={onclose}>Cancel</button>
      <button class="dialog-btn confirm" onclick={apply} disabled={!canApply}>Interleave</button>
    </div>
  </div>
</div>

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: var(--pdf-lab-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
    animation: fadeIn 0.12s ease-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .dialog-card {
    background: var(--pdf-lab-surface);
    border-radius: 12px;
    padding: 1.5rem;
    width: min(460px, 100%);
    box-sizing: border-box;
    box-shadow: var(--pdf-lab-shadow-lg);
    animation: dialogPop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes dialogPop {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .dialog-title {
    margin: 0 0 0.375rem;
    font-family: var(--pdf-lab-font-display);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
  }

  .dialog-blurb {
    margin: 0 0 1.25rem;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--pdf-lab-text-secondary);
  }

  .slots {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: end;
    gap: 0.75rem;
  }
  .slot { min-width: 0; }

  .dialog-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--pdf-lab-text-secondary);
    margin-bottom: 0.375rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .slot-tag {
    text-transform: none;
    letter-spacing: 0;
    font-size: 0.625rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 999px;
  }
  .slot-tag.a {
    color: var(--pdf-lab-primary);
    background: var(--pdf-lab-primary-soft);
  }
  .slot-tag.b {
    color: var(--pdf-lab-text-tertiary);
    background: var(--pdf-lab-surface-hover);
  }

  .dialog-select {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--pdf-lab-border-input);
    border-radius: 6px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text);
    font-size: 0.875rem;
    font-family: var(--pdf-lab-font);
    padding: 0.5rem 0.625rem;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .dialog-select:focus {
    border-color: var(--pdf-lab-primary);
    box-shadow: 0 0 0 3px var(--pdf-lab-primary-glow);
  }

  .slot-join {
    display: grid;
    place-items: center;
    width: 30px;
    height: 38px;
    color: var(--pdf-lab-text-tertiary);
  }
  .slot-join svg { width: 18px; height: 18px; }

  .reverse-row {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    margin-top: 1.125rem;
    padding: 0.75rem;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease;
  }
  .reverse-row:hover {
    border-color: var(--pdf-lab-border-strong);
    background: var(--pdf-lab-surface-hover);
  }
  .reverse-row input {
    margin: 0;
    width: 1rem;
    height: 1rem;
    accent-color: var(--pdf-lab-primary);
    cursor: pointer;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .reverse-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .reverse-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--pdf-lab-text);
  }
  .reverse-hint {
    font-size: 0.6875rem;
    color: var(--pdf-lab-text-tertiary);
    line-height: 1.4;
  }

  .result {
    margin: 1.125rem 0 0;
    padding: 0.625rem 0.75rem;
    border: 1px dashed var(--pdf-lab-border);
    border-radius: 6px;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--pdf-lab-text-secondary);
    background:
      radial-gradient(circle at 1px 1px, var(--pdf-lab-grid-dot) 1px, transparent 0) 0 0 / 16px 16px,
      var(--pdf-lab-surface);
  }
  .result strong {
    color: var(--pdf-lab-text);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .result-rest {
    color: var(--pdf-lab-text-tertiary);
  }
  .result.warn {
    color: var(--pdf-lab-text-tertiary);
    font-style: italic;
    background: var(--pdf-lab-surface);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }
  .dialog-btn {
    padding: 0.4375rem 0.875rem;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .dialog-btn.cancel {
    background: transparent;
    color: var(--pdf-lab-text-secondary);
    border: 1px solid var(--pdf-lab-border);
  }
  .dialog-btn.cancel:hover {
    background: var(--pdf-lab-surface-hover);
    color: var(--pdf-lab-text);
    border-color: var(--pdf-lab-border-strong);
  }
  .dialog-btn.confirm {
    background: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
    border: 1px solid var(--pdf-lab-primary);
    box-shadow: var(--pdf-lab-shadow-sm);
  }
  .dialog-btn.confirm:hover:not(:disabled) {
    background: var(--pdf-lab-primary-hover);
    border-color: var(--pdf-lab-primary-hover);
  }
  .dialog-btn.confirm:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .dialog-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  @media (prefers-reduced-motion: reduce) {
    .dialog-overlay,
    .dialog-card {
      animation: none;
    }
  }
</style>
