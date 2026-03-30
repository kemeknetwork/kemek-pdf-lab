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
      // Render at a scale suitable for ~180px thumbnails
      const url = await renderPage(page.sourceDocumentId, page.originalIndex, 0.5);
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
  <div class="thumbnail-image-wrapper">
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
      <div class="selection-check">
        <Check size={14} strokeWidth={3} />
      </div>
    {/if}
  </div>

  <div class="thumbnail-label">
    {index + 1}
  </div>
</div>

<style>
  .thumbnail-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    cursor: pointer;
    user-select: none;
    padding: 0.5rem;
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

  .thumbnail-image-wrapper {
    position: relative;
    width: 180px;
    min-height: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid var(--pdf-lab-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .thumbnail-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transition: transform 0.2s ease;
  }

  .thumbnail-placeholder {
    width: 100%;
    height: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f1f5f9;
    transition: transform 0.2s ease;
  }

  .placeholder-text {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--pdf-lab-text-secondary);
  }

  .selection-check {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--pdf-lab-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .thumbnail-label {
    font-size: 0.75rem;
    color: var(--pdf-lab-text-secondary);
    font-weight: 500;
  }
</style>
