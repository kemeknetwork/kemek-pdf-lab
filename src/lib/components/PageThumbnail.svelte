<!--
  PageThumbnail — card representing a single PDF page.

  Lazy-renders a PNG thumbnail via IntersectionObserver so off-screen pages
  don't consume resources. Shows a numbered placeholder until the render
  completes. Selected pages get a blue ring and a check badge.

  @prop page — the PageInfo to render.
  @prop index — zero-based position in the current page order (for label).
  @prop selected — whether this page is in the active selection.
  @prop onclick — click handler forwarded from PageGrid for selection logic.
-->
<script lang="ts">
  import { Check } from 'lucide-svelte';
  import type { PageInfo } from '$lib/pdf/types.js';
  import { renderPage } from '$lib/pdf/renderer.js';

  interface Props {
    page: PageInfo;
    index: number;
    selected: boolean;
    onclick: (e: MouseEvent) => void;
  }

  let { page, index, selected, onclick }: Props = $props();

  let thumbnailUrl = $state<string | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  let hasRendered = $state(false);

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
    hasRendered = true;
    try {
      const url = await renderPage(page.sourceDocumentId, page.originalIndex, 240);
      thumbnailUrl = url;
    } catch (e) {
      console.error('Failed to render thumbnail:', e);
    }
  }

  let rotationStyle = $derived(page.rotation !== 0 ? `rotate(${page.rotation}deg)` : '');
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

  <span class="thumbnail-label">{index + 1}</span>
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

  .thumbnail-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--pdf-lab-text-tertiary);
    font-variant-numeric: tabular-nums;
  }
</style>
