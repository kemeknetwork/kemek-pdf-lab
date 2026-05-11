<script lang="ts">
  import {
    getDocuments,
    getPages,
    addTextAnnotation,
    deleteTextAnnotation
  } from '$lib/stores/app.svelte.js';
  import { renderPage } from '$lib/pdf/renderer.js';

  interface Props {
    pageId: string;
    onclose: () => void;
  }

  let { pageId, onclose }: Props = $props();

  const page = $derived(getPages().find((p) => p.id === pageId));
  const document_ = $derived(
    page ? (getDocuments().find((d) => d.id === page.sourceDocumentId) ?? null) : null
  );
  const annotations = $derived(page?.annotations ?? []);

  let imageSrc = $state<string | null>(null);
  let imageError = $state<string | null>(null);
  let frameEl = $state<HTMLDivElement | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);

  let activeInput = $state<{ x: number; y: number } | null>(null);
  let activeText = $state('');

  // Render at modal-suitable resolution. Browser CSS scales to fit; the
  // higher source resolution keeps the image sharp on retina displays.
  $effect(() => {
    if (!page || !document_) return;
    let cancelled = false;
    imageSrc = null;
    imageError = null;
    renderPage(document_.id, page.originalIndex, 1400)
      .then((url) => {
        if (!cancelled) imageSrc = url;
      })
      .catch((err: unknown) => {
        if (!cancelled) imageError = String(err);
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (activeInput) requestAnimationFrame(() => inputEl?.focus());
  });

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleAnnotationLayerClick(e: MouseEvent) {
    if (e.target !== e.currentTarget) return;
    if (!frameEl) return;

    // Clicking elsewhere while an input is open commits the current
    // annotation (blur fires first) and starts a fresh one at the new
    // click position. This keeps the placement loop fluid.
    const rect = frameEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    activeText = '';
    activeInput = { x, y };
  }

  function commitActive() {
    if (!activeInput || !page) {
      cancelActive();
      return;
    }
    const text = activeText.trim();
    if (text) {
      addTextAnnotation(pageId, {
        x: activeInput.x,
        y: activeInput.y,
        text,
        fontSize: 14,
        color: '#000000'
      });
    }
    activeInput = null;
    activeText = '';
  }

  function cancelActive() {
    activeInput = null;
    activeText = '';
  }

  function handleInputKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitActive();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelActive();
    }
  }

  function handleWindowKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (activeInput) cancelActive();
      else onclose();
    }
  }

  const pageLabel = $derived(page ? (page.label ?? `Page ${page.originalIndex + 1}`) : '');
  const rotationNote = $derived(
    page && page.rotation !== 0 ? ` · rotated ${page.rotation}°` : ''
  );
  const footerHint = $derived(
    activeInput ? 'Enter to place · Esc to cancel' : 'Click anywhere on the page to add text'
  );
</script>

<svelte:window onkeydown={handleWindowKey} />

{#if page && document_}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay" onclick={handleBackdropClick} role="dialog" aria-modal="true" aria-label="Edit page text" tabindex="-1">
    <div class="header">
      <span class="eyebrow">Editing</span>
      <span class="filename">{document_.name}</span>
      <span class="separator">·</span>
      <span class="page-label">{pageLabel}{rotationNote}</span>
      <button class="close" onclick={onclose} aria-label="Close (Esc)">
        <span class="close-line"></span>
        <span class="close-line"></span>
      </button>
    </div>

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="stage" onclick={handleBackdropClick}>
      {#if imageError}
        <div class="status status-error">Could not render page<br /><small>{imageError}</small></div>
      {:else if !imageSrc}
        <div class="status">
          <span class="loader" aria-hidden="true"></span>
          Rendering page…
        </div>
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="frame" bind:this={frameEl} onclick={(e) => e.stopPropagation()}>
          <img class="page-image" src={imageSrc} alt="" draggable="false" />
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="annotation-layer" onclick={handleAnnotationLayerClick}>
            {#each annotations as ann (ann.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="annotation"
                style:left="{ann.x * 100}%"
                style:top="{ann.y * 100}%"
                style:color={ann.color}
                style:font-size="{ann.fontSize}px"
                onclick={(e) => e.stopPropagation()}
              >
                <span class="annotation-text">{ann.text}</span>
                <button
                  class="annotation-delete"
                  aria-label="Delete annotation"
                  onclick={(e) => {
                    e.stopPropagation();
                    deleteTextAnnotation(pageId, ann.id);
                  }}>×</button>
              </div>
            {/each}

            {#if activeInput}
              <div
                class="active-input-wrap"
                style:left="{activeInput.x * 100}%"
                style:top="{activeInput.y * 100}%"
              >
                <input
                  class="active-input"
                  type="text"
                  bind:value={activeText}
                  bind:this={inputEl}
                  onkeydown={handleInputKey}
                  onblur={commitActive}
                  spellcheck="false"
                  autocomplete="off"
                />
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <div class="footer">
      <span class="hint">{footerHint}</span>
      {#if annotations.length > 0}
        <span class="bullet">·</span>
        <span class="count">{annotations.length} {annotations.length === 1 ? 'annotation' : 'annotations'}</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* The whole modal is the focal vacuum — chrome dissolves into the
     darkened backdrop, leaving the page itself as the only object that
     reads as "real". */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 16, 11, 0.62);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    z-index: 100;
    display: grid;
    grid-template-rows: auto 1fr auto;
    animation: overlayFadeIn 0.18s ease-out;
  }

  @keyframes overlayFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* HEADER — peripheral, atmospheric. No card, no panel. */
  .header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 1rem 1.5rem;
    color: rgba(255, 255, 255, 0.65);
    font-family: var(--pdf-lab-font);
    font-size: 0.8125rem;
    line-height: 1;
    pointer-events: none;
  }

  .header > * {
    pointer-events: auto;
  }

  .eyebrow {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(74, 222, 128, 0.85);
  }

  .filename {
    color: rgba(255, 255, 255, 0.94);
    font-family: var(--pdf-lab-font-display);
    font-weight: 700;
    font-size: 0.9375rem;
    letter-spacing: -0.01em;
    max-width: 38ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .separator {
    color: rgba(255, 255, 255, 0.25);
  }

  .page-label {
    color: rgba(255, 255, 255, 0.65);
    font-variant-numeric: tabular-nums;
  }

  .close {
    margin-left: auto;
    width: 32px;
    height: 32px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background 0.12s, border-color 0.12s, transform 0.12s;
    position: relative;
  }

  .close:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.32);
  }

  .close:active {
    transform: scale(0.94);
  }

  .close-line {
    position: absolute;
    width: 12px;
    height: 1.5px;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 1px;
  }

  .close-line:nth-child(1) {
    transform: rotate(45deg);
  }
  .close-line:nth-child(2) {
    transform: rotate(-45deg);
  }

  /* STAGE — the page floats. */
  .stage {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 1.5rem;
    overflow: hidden;
    min-height: 0;
  }

  .frame {
    position: relative;
    box-shadow:
      0 12px 48px rgba(0, 0, 0, 0.45),
      0 1px 2px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.04);
    border-radius: 1px;
    background: #fff;
    animation: pageEnter 0.24s cubic-bezier(0.34, 1.4, 0.64, 1);
    line-height: 0;
  }

  @keyframes pageEnter {
    from {
      transform: translateY(8px) scale(0.985);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  .page-image {
    display: block;
    max-width: calc(100vw - 3rem);
    max-height: calc(100vh - 8rem);
    width: auto;
    height: auto;
    user-select: none;
    -webkit-user-drag: none;
  }

  .annotation-layer {
    position: absolute;
    inset: 0;
    cursor: text;
  }

  /* ANNOTATIONS — render as the actual text would appear, no chrome
     until hover. The dashed outline on hover is the only "this is
     interactive" cue. */
  .annotation {
    position: absolute;
    /* Stored (x, y) is the text baseline. Translate the box up so the
       baseline lands exactly at the click point — matches how pdf-lib's
       drawText positions text in the export. */
    transform: translateY(calc(-1em + 2px));
    font-family: var(--pdf-lab-font);
    font-weight: 500;
    line-height: 1.1;
    padding: 1px 3px;
    border-radius: 2px;
    cursor: default;
    transition: background 0.1s ease, outline-color 0.1s ease;
    white-space: nowrap;
    outline: 1px dashed transparent;
    outline-offset: 1px;
  }

  .annotation:hover {
    background: rgba(21, 128, 61, 0.07);
    outline-color: rgba(21, 128, 61, 0.5);
  }

  .annotation-delete {
    position: absolute;
    top: -9px;
    right: -9px;
    width: 18px;
    height: 18px;
    border: none;
    background: var(--pdf-lab-danger, #c53030);
    color: white;
    border-radius: 50%;
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transform: scale(0.7);
    transition: opacity 0.14s ease, transform 0.14s cubic-bezier(0.34, 1.5, 0.64, 1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.6);
    display: grid;
    place-items: center;
    padding: 0;
  }

  .annotation:hover .annotation-delete {
    opacity: 1;
    transform: scale(1);
  }

  .annotation-delete:hover {
    transform: scale(1.12);
  }

  .annotation-delete:active {
    transform: scale(0.92);
  }

  /* ACTIVE INPUT — feels like a typing cursor, not a form field.
     A thin primary baseline, soft tinted background, no border around
     the box. The user clicked the page; the page invited them to type. */
  .active-input-wrap {
    position: absolute;
    /* Match the committed-annotation baseline anchor so committing the
       input doesn't visually shift the text. font-size is explicit here
       because the wrapper itself doesn't carry the input's font. */
    font-size: 14px;
    transform: translateY(calc(-1em + 2px));
  }

  .active-input {
    border: none;
    background: rgba(21, 128, 61, 0.05);
    border-bottom: 1.5px solid var(--pdf-lab-primary, #15803d);
    padding: 1px 3px 2px;
    font-family: var(--pdf-lab-font);
    font-size: 14px;
    font-weight: 500;
    color: #000;
    outline: none;
    caret-color: var(--pdf-lab-primary, #15803d);
    field-sizing: content;
    min-width: 3ch;
    max-width: 50vw;
    line-height: 1.1;
    animation: inputEnter 0.16s ease-out;
  }

  @keyframes inputEnter {
    from {
      opacity: 0;
      transform: translateY(-1px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* FOOTER — quiet status line, last citizen of the visual hierarchy. */
  .footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.25rem 1.25rem;
    color: rgba(255, 255, 255, 0.55);
    font-family: var(--pdf-lab-font);
    font-size: 0.75rem;
    letter-spacing: 0.015em;
    pointer-events: none;
  }

  .hint {
    transition: color 0.14s ease;
  }

  .bullet {
    color: rgba(255, 255, 255, 0.28);
  }

  .count {
    color: rgba(255, 255, 255, 0.78);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  /* Loading + error */
  .status {
    color: rgba(255, 255, 255, 0.7);
    font-family: var(--pdf-lab-font);
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    text-align: center;
  }

  .status-error small {
    display: block;
    margin-top: 0.25rem;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.6875rem;
    color: rgba(255, 220, 220, 0.65);
  }

  .loader {
    width: 14px;
    height: 14px;
    border: 1.5px solid rgba(255, 255, 255, 0.22);
    border-top-color: rgba(255, 255, 255, 0.78);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay,
    .frame,
    .active-input,
    .annotation-delete {
      animation: none;
      transition-duration: 0s;
    }
    .loader {
      animation-duration: 1.4s;
    }
  }
</style>
