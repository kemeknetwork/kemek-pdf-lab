<script lang="ts">
  import { dndzone } from 'svelte-dnd-action';
  import type { PageInfo } from '$lib/pdf/types.js';
  import PageThumbnail from './PageThumbnail.svelte';

  interface Props {
    pages: PageInfo[];
    selection: Set<string>;
    onreorder: (newPages: PageInfo[]) => void;
    onselect: (pageId: string, event: MouseEvent) => void;
  }

  let { pages, selection, onreorder, onselect }: Props = $props();

  // svelte-dnd-action needs items with `id` prop
  let dndItems = $derived(pages.map((p) => ({ ...p, id: p.id })));

  function handleDndConsider(e: CustomEvent<{ items: PageInfo[] }>) {
    // Update during drag (visual feedback)
    onreorder(e.detail.items);
  }

  function handleDndFinalize(e: CustomEvent<{ items: PageInfo[] }>) {
    onreorder(e.detail.items);
  }
</script>

<div
  class="page-grid"
  use:dndzone={{
    items: dndItems,
    flipDurationMs: 200,
    dropTargetStyle: {},
    type: 'pages'
  }}
  onconsider={handleDndConsider}
  onfinalize={handleDndFinalize}
>
  {#each dndItems as page, index (page.id)}
    <PageThumbnail
      {page}
      {index}
      selected={selection.has(page.id)}
      onclick={(e) => onselect(page.id, e)}
    />
  {/each}
</div>

<style>
  .page-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.5rem;
    padding: 1rem;
    overflow-y: auto;
    flex: 1;
    align-content: start;
  }
</style>
