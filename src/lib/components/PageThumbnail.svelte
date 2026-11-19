<script lang="ts">
  import { Check } from 'lucide-svelte';
  import type { PageInfo } from '#lib/pdf/types.js';
  import { renderPage, hasDocument } from '#lib/pdf/renderer.js';
  import { getRenderWidth } from '#lib/stores/preferences.svelte.js';

  interface Props {
    page: PageInfo;
    index: number;
    selected: boolean;
    tabindex?: number;
    onclick: (e: MouseEvent) => void;
    onfocus?: () => void;
    onlabel: (pageId: string, label: string | undefined) => void;
    onpreview: (pageId: string) => void;
  }

  let {
    page,
    index,
    selected,
    tabindex = -1,
    onclick,
    onfocus,
    onlabel,
    onpreview
  }: Props = $props();

  let thumbnailUrl = $state<string | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  const hasRendered = $derived(thumbnailUrl !== null);
  let renderFailed = $state(false);
  let renderedAtWidth = $state(0);

  // Invalidate the thumbnail when the user switches grid density so the
  // IntersectionObserver effect below re-renders at the new width.
  $effect(() => {
    const currentWidth = getRenderWidth();
    if (hasRendered && currentWidth !== renderedAtWidth) {
      renderFailed = false;
      thumbnailUrl = null;
    }
  });

  $effect(() => {
    if (!containerEl || hasRendered) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          renderThumbnail();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(containerEl);
    return () => observer.disconnect();
  });

  async function renderThumbnail() {
    if (hasRendered) return;
    const width = getRenderWidth();
    try {
      const url = await renderPage(page.sourceDocumentId, page.originalIndex, width);
      thumbnailUrl = url;
      renderFailed = false;
      renderedAtWidth = width;
    } catch (e) {
      // A doc released mid-render (workspace Clear, or a page reload) is an
      // expected teardown race, not a render failure — stay silent and don't
      // flash the error tile; the card is about to unmount anyway.
      if (!hasDocument(page.sourceDocumentId)) return;
      console.error('Failed to render thumbnail:', e);
      renderFailed = true;
    }
  }

  let rotationStyle = $derived(page.rotation !== 0 ? `rotate(${page.rotation}deg)` : '');
  // A quarter turn swaps the image's width and height on screen, so it has to be
  // sized against the other axis or a portrait page overflows the card and clips.
  let quarterTurn = $derived(page.rotation % 180 !== 0);

  let editing = $state(false);
  let editValue = $state('');
  let editInputEl = $state<HTMLInputElement | null>(null);

  function startEditing(e: Event) {
    e.stopPropagation();
    editing = true;
    editValue = page.label ?? '';
    requestAnimationFrame(() => editInputEl?.select());
  }

  function commitLabel() {
    if (!editing) return;
    editing = false;
    const trimmed = editValue.trim();
    onlabel(page.id, trimmed || undefined);
  }

  function cancelEdit() {
    editing = false;
  }

  // Enter/Escape end a keyboard edit, so focus goes back to the page it came from
  // instead of dropping to the document body.
  function onLabelKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Enter') commitLabel();
    else cancelEdit();
    containerEl?.focus();
  }

  // Touch has no hover to reveal the label and no reliable double-tap, so there a
  // tap on the label edits it. With a mouse, a click still selects the page and
  // double-click edits, as before.
  function onLabelTap(e: MouseEvent) {
    let touchOnly = false;
    try {
      touchOnly = matchMedia('(hover: none)').matches;
    } catch {
      /* no matchMedia: keep the mouse behaviour */
    }
    if (touchOnly) startEditing(e);
  }

  function onCardKey(e: KeyboardEvent) {
    // F2 renames, as in a file manager; double-click stays the pointer path.
    if (e.key === 'F2' && e.target === e.currentTarget && !editing) {
      e.preventDefault();
      startEditing(e);
    }
  }

  const accessibleName = $derived(
    `Page ${index + 1}${page.label ? `, ${page.label}` : ''}${page.rotation ? `, rotated ${page.rotation}°` : ''}`
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="thumbnail-card"
  class:selected
  bind:this={containerEl}
  {tabindex}
  role="option"
  aria-selected={selected}
  aria-label={accessibleName}
  onclick={onclick}
  onkeydown={onCardKey}
  onfocus={() => onfocus?.()}
  ondblclick={() => onpreview(page.id)}
>
  <div class="thumbnail-page">
    {#if thumbnailUrl}
      <img
        src={thumbnailUrl}
        alt="Page {index + 1}"
        class="thumbnail-image"
        class:quarter={quarterTurn}
        style:transform={rotationStyle}
        draggable="false"
      />
    {:else if renderFailed}
      <div class="thumbnail-placeholder error" style:transform={rotationStyle}>
        <span class="placeholder-text">!</span>
      </div>
    {:else}
      <div class="thumbnail-placeholder" style:transform={rotationStyle}>
        <span class="placeholder-text">{index + 1}</span>
      </div>
    {/if}

    {#if selected}
      <div class="selection-badge">
        <Check size={12} strokeWidth={3} />
      </div>
    {/if}
  </div>

  <div class="thumbnail-footer">
    <span class="thumbnail-label">{index + 1}</span>
    {#if editing}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="label-input"
        type="text"
        maxlength="30"
        bind:value={editValue}
        bind:this={editInputEl}
        onclick={(e) => e.stopPropagation()}
        ondblclick={(e) => e.stopPropagation()}
        aria-label="Label for page {index + 1}"
        onkeydown={onLabelKey}
        onblur={commitLabel}
        spellcheck="false"
      />
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        class="page-label"
        class:has-label={!!page.label}
        onclick={onLabelTap}
        ondblclick={startEditing}
      >
        {page.label ?? 'Add label...'}
      </span>
    {/if}
  </div>
</div>

<style>
  .thumbnail-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;
    /* The hold that starts a drag on touch must not open iOS's image menu. */
    -webkit-touch-callout: none;
    padding: 0.625rem;
    border-radius: 8px;
    border: 2px solid transparent;
    transition: all 0.15s ease;
  }

  .thumbnail-card:hover {
    background: var(--pdf-lab-surface-hover);
  }

  .thumbnail-card.selected {
    border-color: var(--pdf-lab-selection);
    background: var(--pdf-lab-selection-bg);
  }

  /* The stage: as wide as the grid cell (so S/M/L sizes the pages, not just the
     gaps between them) and one shape for every page, so the numbers below line up
     along a row whatever the page sizes. The page itself is drawn at its real
     shape, on its own paper and shadow: a square or landscape page reads as one
     in the light theme too, where a white stage behind a white page hid it. */
  .thumbnail-page {
    position: relative;
    container-type: size;
    width: 100%;
    aspect-ratio: 1 / 1.3;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .thumbnail-image,
  .thumbnail-placeholder {
    border-radius: 2px;
    box-shadow: var(--pdf-lab-shadow-page);
    /* `translate`, not `transform`: rotation is an inline transform. */
    transition:
      box-shadow 0.2s ease,
      translate 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .thumbnail-image {
    display: block;
    max-width: 100%;
    max-height: 100%;
    background: #fff;
  }

  /* Turned a quarter, its width shows as height: fit it against the other axis. */
  .thumbnail-image.quarter {
    max-width: 100cqb;
    max-height: 100cqi;
  }

  .thumbnail-card:hover .thumbnail-image,
  .thumbnail-card:hover .thumbnail-placeholder {
    box-shadow: var(--pdf-lab-shadow-md), var(--pdf-lab-shadow-page);
    translate: 0 -2px;
  }

  .thumbnail-card.selected .thumbnail-image,
  .thumbnail-card.selected .thumbnail-placeholder {
    box-shadow: 0 0 0 2px var(--pdf-lab-selection), var(--pdf-lab-shadow-md);
  }

  /* Page-shaped (Letter) until the render says otherwise. */
  .thumbnail-placeholder {
    height: 100%;
    aspect-ratio: 8.5 / 11;
    max-width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--pdf-lab-surface-hover);
  }

  .thumbnail-placeholder.error {
    background: var(--pdf-lab-danger-bg);
  }

  .thumbnail-placeholder.error .placeholder-text {
    color: var(--pdf-lab-danger);
  }

  .placeholder-text {
    font-family: var(--pdf-lab-font-display);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--pdf-lab-text-tertiary);
  }

  .selection-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--pdf-lab-primary);
    color: var(--pdf-lab-primary-text);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    animation: badgePop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes badgePop {
    from { transform: scale(0); }
    to { transform: scale(1); }
  }

  .thumbnail-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    width: 100%;
    min-height: 1.75rem;
  }

  .thumbnail-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--pdf-lab-text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  .page-label {
    font-size: 0.625rem;
    color: var(--pdf-lab-text-tertiary);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    visibility: hidden;
    cursor: text;
    transition: visibility 0s, opacity 0.15s ease;
    opacity: 0;
  }

  .page-label.has-label {
    visibility: visible;
    opacity: 1;
    color: var(--pdf-lab-text-secondary);
    font-weight: 500;
  }

  .thumbnail-card:hover .page-label,
  .thumbnail-card:focus-visible .page-label {
    visibility: visible;
    opacity: 1;
  }

  /* Touch: always shown (nothing hovers), and tall enough to hit. */
  @media (hover: none) {
    .page-label {
      visibility: visible;
      opacity: 1;
      padding: 0.3125rem 0.625rem;
      min-height: 24px;
      font-size: 0.6875rem;
    }
  }

  .label-input {
    width: 140px;
    padding: 0.125rem 0.25rem;
    font-size: 0.625rem;
    font-family: var(--pdf-lab-font);
    text-align: center;
    border: 1px solid var(--pdf-lab-primary);
    border-radius: 3px;
    background: var(--pdf-lab-surface);
    color: var(--pdf-lab-text);
    outline: none;
    box-shadow: 0 0 0 2px var(--pdf-lab-primary-glow);
  }
</style>
