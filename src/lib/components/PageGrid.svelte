<script lang="ts">
  import { dndzone } from 'svelte-dnd-action';
  import type { PageInfo } from '$lib/pdf/types.js';
  import PageThumbnail from './PageThumbnail.svelte';
  import { getGridMinWidth } from '$lib/stores/preferences.svelte.js';

  interface Props {
    pages: PageInfo[];
    selection: Set<string>;
    onreorder: (newPages: PageInfo[]) => void;
    onselect: (pageId: string, event: MouseEvent) => void;
    onlabel: (pageId: string, label: string | undefined) => void;
    onpreview: (pageId: string) => void;
  }

  let { pages, selection, onreorder, onselect, onlabel, onpreview }: Props = $props();

  // DnD consider events mutate dndItems for in-flight visual feedback only;
  // the store is updated on finalize.
  let dndItems = $state<PageInfo[]>([]);

  $effect(() => {
    dndItems = pages.map((p) => ({ ...p }));
  });

  let gridMinWidth = $derived(getGridMinWidth());

  function handleDndConsider(e: CustomEvent<{ items: PageInfo[] }>) {
    dndItems = e.detail.items;
  }

  // svelte-dnd-action attaches extra DnD-internal props to each item; strip
  // them to the known PageInfo shape before committing to the store.
  function handleDndFinalize(e: CustomEvent<{ items: PageInfo[] }>) {
    const cleaned: PageInfo[] = e.detail.items.map((item) => ({
      id: item.id,
      sourceDocumentId: item.sourceDocumentId,
      originalIndex: item.originalIndex,
      rotation: item.rotation,
      ...(item.label !== undefined ? { label: item.label } : {})
    }));
    dndItems = cleaned;
    onreorder(cleaned);
  }
</script>

<div
  class="page-grid"
  style:grid-template-columns="repeat(auto-fill, minmax({gridMinWidth}, 1fr))"
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
      {onlabel}
      {onpreview}
    />
  {/each}
</div>

<style>
  .page-grid {
    display: grid;
    gap: 0.5rem;
    padding: 1.25rem;
    overflow-y: auto;
    flex: 1;
    align-content: start;
    background:
      radial-gradient(circle at 1px 1px, var(--pdf-lab-grid-dot) 1px, transparent 0) 0 0 / 20px 20px;
  }
</style>
