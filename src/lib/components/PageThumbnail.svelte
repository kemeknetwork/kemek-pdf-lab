<!--
  PageThumbnail — card representing a single PDF page.

  Lazy-renders a PNG thumbnail via IntersectionObserver so off-screen pages
  don't consume resources. Shows a numbered placeholder until the render
  completes. Selected pages get a green ring and a check badge.

  Thumbnails automatically re-render at the appropriate resolution when the
  user changes grid density (compact/default/spacious).

  Labels can be edited inline by double-clicking the label area below
  the page number.

  @prop page — the PageInfo to render.
  @prop index — zero-based position in the current page order (for label).
  @prop selected — whether this page is in the active selection.
  @prop onclick — click handler forwarded from PageGrid for selection logic.
  @prop onlabel — called with (pageId, label) when user edits a page label.
-->
<script lang="ts">
  import { Check } from 'lucide-svelte';
  import type { PageInfo } from '$lib/pdf/types.js';
  import { renderPage } from '$lib/pdf/renderer.js';
  import { getRenderWidth } from '$lib/stores/preferences.svelte.js';

  interface Props {
    page: PageInfo;
    index: number;
    selected: boolean;
    onclick: (e: MouseEvent) => void;
    onlabel: (pageId: string, label: string | undefined) => void;
  }

  let { page, index, selected, onclick, onlabel }: Props = $props();

  let thumbnailUrl = $state<string | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  let hasRendered = $state(false);
  let renderedAtWidth = $state(0);

  // Re-render thumbnails when grid density (render width) changes
  $effect(() => {
    const currentWidth = getRenderWidth();
    if (hasRendered && currentWidth !== renderedAtWidth) {
      hasRendered = false;
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
    hasRendered = true;
    renderedAtWidth = width;
    try {
      const url = await renderPage(page.sourceDocumentId, page.originalIndex, width);
      thumbnailUrl = url;
    } catch (e) {
      console.error('Failed to render thumbnail:', e);
    }
  }

  let rotationStyle = $derived(page.rotation !== 0 ? `rotate(${page.rotation}deg)` : '');

  let editing = $state(false);
  let editValue = $state('');
  let editInputEl = $state<HTMLInputElement | null>(null);

  function startEditing(e: MouseEvent) {
    e.stopPropagation();
    editing = true;
    editValue = page.label ?? '';
    requestAnimationFrame(() => editInputEl?.select());
  }

  function commitLabel() {
    editing = false;
    const trimmed = editValue.trim();
    onlabel(page.id, trimmed || undefined);
  }

  function cancelEdit() {
    editing = false;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="thumbnail-card"
  class:selected
  bind:this={containerEl}
  onclick={onclick}
>
  <div class="thumbnail-page">
    {#if thumbnailUrl}
      <img
        src={thumbnailUrl}
        alt="Page {index + 1}"
        class="thumbnail-image"
        style:transform={rotationStyle}
        draggable="false"
      />
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
        onkeydown={(e) => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') cancelEdit(); }}
        onblur={commitLabel}
        spellcheck="false"
      />
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        class="page-label"
        class:has-label={!!page.label}
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
    padding: 0.625rem;
    border-radius: 8px;
    border: 2px solid transparent;
    transition: all 0.15s ease;
  }

  .thumbnail-card:hover {
    background: var(--pdf-lab-surface-hover);
  }

  .thumbnail-card:hover .thumbnail-page {
    box-shadow: var(--pdf-lab-shadow-md);
    transform: translateY(-2px);
  }

  .thumbnail-card.selected {
    border-color: var(--pdf-lab-selection);
    background: var(--pdf-lab-selection-bg);
  }

  .thumbnail-card.selected .thumbnail-page {
    box-shadow: 0 0 0 2px var(--pdf-lab-selection), var(--pdf-lab-shadow-md);
  }

  .thumbnail-page {
    position: relative;
    width: 180px;
    min-height: 232px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: var(--pdf-lab-shadow-page);
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  :global(.dark) .thumbnail-page {
    background: #162e1f;
  }

  .thumbnail-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .thumbnail-placeholder {
    width: 100%;
    height: 232px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--pdf-lab-surface-hover);
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
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0;
    cursor: text;
    transition: opacity 0.15s ease;
  }

  .page-label.has-label {
    opacity: 1;
    color: var(--pdf-lab-text-secondary);
    font-weight: 500;
  }

  .thumbnail-card:hover .page-label {
    opacity: 1;
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
