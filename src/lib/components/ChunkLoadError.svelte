<script lang="ts">
  import { trapTab } from '$lib/utils/focus-trap.js';

  interface Props {
    /** What failed to open, e.g. "the editor" — folded into the message. */
    feature?: string;
    /** Dismiss: the caller resets whatever state was stuck open behind the
     *  failed import so grid shortcuts come back. */
    onclose: () => void;
  }

  let { feature = 'that panel', onclose }: Props = $props();

  let cardEl = $state<HTMLDivElement | null>(null);
  const dialogId = $props.id();

  // A code-split chunk failed to fetch — almost always offline-and-uncached, or a
  // stale service worker still pointing at a previous deploy's filenames. A fresh
  // page load re-fetches the manifest / activates the waiting SW, so reload is the
  // real fix; Dismiss just unsticks the UI.
  function reload() {
    location.reload();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="dialog-overlay" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog-card"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="chunk-title-{dialogId}"
    tabindex="-1"
    bind:this={cardEl}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => trapTab(e, cardEl)}
  >
    <div class="dialog-head">
      <span class="glyph" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 9v4" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 17h.01" />
        </svg>
      </span>
      <div class="head-text">
        <h3 class="dialog-title" id="chunk-title-{dialogId}">Couldn’t load {feature}</h3>
        <p class="dialog-sub">A part of the app failed to download.</p>
      </div>
    </div>

    <p class="dialog-note">
      You may be offline, or the app updated since this tab opened. Reloading
      fetches the latest version — your files are only in memory, so reload only
      when you’ve saved any work in progress.
    </p>

    <div class="dialog-actions">
      <button class="dialog-btn cancel" onclick={onclose}>Dismiss</button>
      <button class="dialog-btn confirm" onclick={reload}>Reload</button>
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
    z-index: 110;
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
    width: min(420px, 100%);
    box-shadow: var(--pdf-lab-shadow-lg);
    animation: dialogPop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes dialogPop {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .dialog-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .glyph {
    flex: 0 0 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    /* amber "heads up", not red "danger" — the failure is recoverable */
    background: rgba(217, 119, 6, 0.14);
    color: #b45309;
  }
  :global(.dark) .glyph {
    color: #fbbf24;
  }
  .glyph svg { width: 20px; height: 20px; }

  .head-text { min-width: 0; }

  .dialog-title {
    margin: 0;
    font-family: var(--pdf-lab-font-display);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
  }

  .dialog-sub {
    margin: 0.125rem 0 0;
    font-size: 0.8125rem;
    color: var(--pdf-lab-text-tertiary);
  }

  .dialog-note {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--pdf-lab-text-secondary);
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
  .dialog-btn.confirm:hover {
    background: var(--pdf-lab-primary-hover);
    border-color: var(--pdf-lab-primary-hover);
  }

  .dialog-btn:active {
    transform: scale(0.97);
  }

  @media (prefers-reduced-motion: reduce) {
    .dialog-overlay,
    .dialog-card {
      animation: none;
    }
  }
</style>
