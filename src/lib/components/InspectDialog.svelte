<script lang="ts">
  import { getDocuments } from '$lib/stores/app.svelte.js';
  import { inspectDocument } from '$lib/pdf/renderer.js';
  import { countSensitive, type DocumentMetadata } from '$lib/pdf/inspect.js';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let metas = $state<DocumentMetadata[] | null>(null);
  let loading = $state(true);
  const dialogId = $props.id();

  let lastFocused: HTMLElement | null = null;
  $effect(() => {
    const active = document.activeElement;
    lastFocused = active instanceof HTMLElement ? active : null;
    return () => requestAnimationFrame(() => lastFocused?.focus());
  });

  // Read every loaded document's metadata once when the dialog opens.
  $effect(() => {
    let cancelled = false;
    const docs = getDocuments();
    (async () => {
      try {
        const results = await Promise.all(docs.map((d) => inspectDocument(d.id, d.name)));
        if (!cancelled) metas = results;
      } catch (e) {
        console.error('Inspect failed:', e);
        if (!cancelled) metas = [];
      } finally {
        if (!cancelled) loading = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  // Total identifying signal across all docs (named fields + the XMP channel) —
  // makes the export-reassurance note concrete ("none of the N items above…").
  const totalSensitive = $derived(
    (metas ?? []).reduce((n, m) => n + countSensitive(m) + (m.hasXmp ? 1 : 0), 0)
  );

  function hasNothing(m: DocumentMetadata): boolean {
    return (
      m.fields.length === 0 &&
      !m.hasXmp &&
      !m.hasAcroForm &&
      !m.hasXfa &&
      !m.hasJavaScript &&
      !m.encrypted &&
      m.attachmentCount === 0
    );
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
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
    aria-labelledby="inspect-title-{dialogId}"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
  >
    <h3 class="dialog-title" id="inspect-title-{dialogId}">What’s inside this PDF</h3>
    <p class="dialog-sub">
      Read directly from your file, in your browser. Nothing here was sent anywhere.
    </p>

    <div class="scroll">
      {#if loading}
        <p class="muted">Reading metadata…</p>
      {:else if metas}
        {#each metas as m (m.id)}
          <section class="doc">
            <header class="doc-head">
              <span class="doc-name" title={m.name}>{m.name}</span>
              <span class="doc-meta">
                {m.pageCount} page{m.pageCount === 1 ? '' : 's'}{m.version ? ` · PDF ${m.version}` : ''}
              </span>
            </header>

            {#if hasNothing(m)}
              <p class="clean">No identifying metadata — this file is already clean.</p>
            {:else}
              {#if m.fields.length > 0}
                <dl class="fields">
                  {#each m.fields as f (f.key)}
                    <div class="field-row" class:sensitive={f.sensitive}>
                      <dt>{f.label}</dt>
                      <dd>
                        <span class="value">{f.value}</span>
                        {#if f.sensitive}<span class="flag">identifying</span>{/if}
                      </dd>
                    </div>
                  {/each}
                </dl>
              {/if}

              {#if m.hasXmp || m.hasAcroForm || m.hasXfa || m.hasJavaScript || m.attachmentCount > 0 || m.encrypted}
                <div class="chips">
                  {#if m.hasXmp}<span class="chip warn">XMP metadata</span>{/if}
                  {#if m.attachmentCount > 0}
                    <span class="chip warn">{m.attachmentCount} attachment{m.attachmentCount === 1 ? '' : 's'}</span>
                  {/if}
                  {#if m.hasJavaScript}<span class="chip warn">JavaScript</span>{/if}
                  {#if m.encrypted}<span class="chip warn">Encrypted</span>{/if}
                  {#if m.hasAcroForm}<span class="chip">Form fields</span>{/if}
                  {#if m.hasXfa}<span class="chip">XFA form</span>{/if}
                </div>
              {/if}
            {/if}
          </section>
        {/each}
      {/if}
    </div>

    <p class="export-note">
      {#if !loading && totalSensitive > 0}
        None of the {totalSensitive} identifying item{totalSensitive === 1 ? '' : 's'} above reach your exports — your author, dates, and XMP are stripped, and the producer is replaced with a neutral “KeMeK PDF Lab” tag.
      {:else}
        Your exports never carry your document metadata — author, dates, and XMP are dropped, and the producer is set to a neutral “KeMeK PDF Lab” tag.
      {/if}
    </p>

    <div class="dialog-actions">
      <button class="dialog-btn confirm" onclick={onclose}>Done</button>
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
    width: 480px;
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 4rem);
    display: flex;
    flex-direction: column;
    box-shadow: var(--pdf-lab-shadow-lg);
    animation: dialogPop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes dialogPop {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .dialog-title {
    margin: 0 0 0.25rem;
    font-family: var(--pdf-lab-font-display);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--pdf-lab-text);
  }
  .dialog-sub {
    margin: 0 0 1rem;
    font-size: 0.75rem;
    color: var(--pdf-lab-text-tertiary);
  }

  .scroll {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    margin: 0 -0.25rem;
    padding: 0 0.25rem;
  }

  .muted {
    color: var(--pdf-lab-text-tertiary);
    font-size: 0.875rem;
    padding: 1rem 0;
  }

  .doc {
    padding: 0.75rem 0;
    border-top: 1px solid var(--pdf-lab-border);
  }
  .doc:first-child {
    border-top: none;
    padding-top: 0;
  }

  .doc-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  .doc-name {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--pdf-lab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .doc-meta {
    flex-shrink: 0;
    font-size: 0.6875rem;
    color: var(--pdf-lab-text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  .clean {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--pdf-lab-primary);
    background: var(--pdf-lab-primary-soft);
    border-radius: 6px;
    padding: 0.5rem 0.625rem;
  }

  .fields {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .field-row {
    display: grid;
    grid-template-columns: 7.5rem 1fr;
    gap: 0.75rem;
    align-items: baseline;
    padding: 0.3125rem 0.5rem;
    border-radius: 5px;
  }
  .field-row.sensitive {
    background: var(--pdf-lab-danger-bg, rgba(197, 48, 48, 0.06));
  }
  .field-row dt {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--pdf-lab-text-secondary);
  }
  .field-row dd {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--pdf-lab-text);
    word-break: break-word;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .value {
    min-width: 0;
  }
  .flag {
    flex-shrink: 0;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--pdf-lab-danger, #c53030);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.625rem;
  }
  .chip {
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.1875rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--pdf-lab-border);
    color: var(--pdf-lab-text-secondary);
    background: var(--pdf-lab-surface);
  }
  .chip.warn {
    border-color: transparent;
    color: var(--pdf-lab-danger, #c53030);
    background: var(--pdf-lab-danger-bg, rgba(197, 48, 48, 0.08));
  }

  .export-note {
    margin: 1rem 0 0;
    padding: 0.625rem 0.75rem;
    border-radius: 8px;
    background: var(--pdf-lab-primary-soft);
    color: var(--pdf-lab-primary);
    font-size: 0.75rem;
    line-height: 1.45;
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
