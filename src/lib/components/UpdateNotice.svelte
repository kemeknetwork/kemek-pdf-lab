<script lang="ts">
  import { getPages, hasWorkToLose } from '#lib/stores/app.svelte.js';
  import {
    applyUpdate,
    dismissOfflineReady,
    dismissUpdate,
    getUpdateState,
    isOfflineReady,
    showUpdateNotice
  } from '#lib/stores/pwa.svelte.js';

  // Non-modal on purpose: it never takes focus or blocks the grid. The open
  // pages are named by count because that is exactly what a reload would clear.
  const openPages = $derived(getPages().length);
  // With no pages showing, a reload can still destroy undo/redo history.
  const history = $derived(hasWorkToLose());
  const update = $derived(showUpdateNotice());
  const elsewhere = $derived(getUpdateState() === 'elsewhere');
  const offline = $derived(isOfflineReady() && !update);

  $effect(() => {
    if (!offline) return;
    const t = setTimeout(dismissOfflineReady, 6000);
    return () => clearTimeout(t);
  });
</script>

<!-- The live region is always mounted so the notice is announced when it appears. -->
<div class="notice-anchor" class:raised={openPages > 0} role="status">
  {#if update}
    <div class="notice">
      <span class="glyph" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 4v5h-5" />
        </svg>
      </span>
      <div class="body">
        <p class="title">{elsewhere ? 'Updated in another tab' : 'A new version is ready'}</p>
        <p class="note">
          {#if elsewhere}
            This tab still runs the previous version.
          {/if}
          {#if openPages > 0}
            Reloading clears the {openPages} {openPages === 1 ? 'page' : 'pages'} you have open, so export
            first if you need them.
          {:else if history}
            Reloading clears your undo history, so anything you removed can’t be restored.
          {:else}
            Reload to start using it.
          {/if}
        </p>
        <div class="actions">
          <button type="button" class="btn quiet" onclick={dismissUpdate}>Later</button>
          <button type="button" class="btn primary" onclick={applyUpdate}>Reload</button>
        </div>
      </div>
    </div>
  {:else if offline}
    <div class="notice compact">
      <span class="glyph" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <p class="title">Ready to work offline</p>
      <button type="button" class="close" onclick={dismissOfflineReady} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  /* Floats just above the StatusBar (its height is 2.5rem) so it never covers
     the bar's controls; on the empty screen there is no bar to clear. The 4rem
     right inset keeps clear of KeyboardHelp's floating "?" button (right 0.875rem,
     2.5rem wide). Below the dialog layers (100+), so a modal always sits over it. */
  .notice-anchor {
    position: fixed;
    right: 4rem;
    bottom: 1rem;
    z-index: 90;
    width: min(22rem, calc(100vw - 4.75rem));
    pointer-events: none;
  }
  .notice-anchor.raised {
    bottom: calc(2.5rem + 0.75rem);
  }

  .notice {
    pointer-events: auto;
    display: flex;
    gap: 0.75rem;
    padding: 0.875rem 1rem 0.875rem 0.875rem;
    background: var(--pdf-lab-surface-raised);
    border: 1px solid var(--pdf-lab-border-strong);
    border-radius: 12px;
    box-shadow: var(--pdf-lab-shadow-lg);
    animation: rise 0.16s ease-out;
  }
  .notice.compact {
    align-items: center;
    padding: 0.5rem 0.5rem 0.5rem 0.75rem;
  }

  @keyframes rise {
    from { transform: translateY(6px); opacity: 0; }
    to { transform: none; opacity: 1; }
  }

  /* Green, not ChunkLoadError's amber: a new version is good news. The only
     caution — what a reload clears — lives in the sentence, not the colour. */
  .glyph {
    flex: 0 0 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: var(--pdf-lab-primary-glow);
    color: var(--pdf-lab-primary);
  }
  .compact .glyph {
    flex-basis: 1.5rem;
    height: 1.5rem;
    border-radius: 6px;
  }
  .glyph svg { width: 1.0625rem; height: 1.0625rem; }
  .compact .glyph svg { width: 0.875rem; height: 0.875rem; }

  .body { min-width: 0; flex: 1; }

  .title {
    margin: 0;
    font-family: var(--pdf-lab-font-display);
    font-size: 0.9375rem;
    font-weight: 700;
    line-height: 1.3;
    color: var(--pdf-lab-text);
  }
  .compact .title {
    flex: 1;
    font-size: 0.875rem;
  }

  .note {
    margin: 0.25rem 0 0;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--pdf-lab-text-secondary);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .btn {
    padding: 0.375rem 0.8125rem;
    border-radius: 6px;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }
  .btn.quiet {
    background: transparent;
    color: var(--pdf-lab-text-secondary);
    border: 1px solid var(--pdf-lab-border);
  }
  .btn.quiet:hover {
    background: var(--pdf-lab-surface-hover);
    color: var(--pdf-lab-text);
    border-color: var(--pdf-lab-border-strong);
  }
  .btn.primary {
    background: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
    border: 1px solid var(--pdf-lab-primary);
  }
  .btn.primary:hover {
    background: var(--pdf-lab-primary-hover);
    border-color: var(--pdf-lab-primary-hover);
  }
  .btn:focus-visible,
  .close:focus-visible {
    outline: 2px solid var(--pdf-lab-primary);
    outline-offset: 2px;
  }

  .close {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--pdf-lab-text-tertiary);
    cursor: pointer;
  }
  .close:hover { background: var(--pdf-lab-surface-hover); color: var(--pdf-lab-text); }
  .close svg { width: 0.875rem; height: 0.875rem; }

  @media (max-width: 640px) {
    .notice-anchor {
      left: 0.75rem;
      width: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .notice { animation: none; }
    .btn { transition: none; }
  }
</style>
