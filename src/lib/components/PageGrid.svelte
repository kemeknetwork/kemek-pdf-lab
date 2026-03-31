<!--
  PageGrid — drag-and-drop grid of page thumbnails.

  Uses svelte-dnd-action for reordering. The grid auto-fills columns at
  minmax(210px, 1fr) with a dot-grid background pattern.

  DnD consider events update only local visual state; the real page order
  (and undo stack) is committed only on finalize.

  @prop pages — ordered array of pages in the workspace.
  @prop selection — set of selected page IDs.
  @prop onreorder — called with the new page array after a drag finishes.
  @prop onselect — called when a thumbnail is clicked (page ID + MouseEvent).
  @prop onlabel — called when a page label is edited (pageId, label).
-->
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
  }

  let { pages, selection, onreorder, onselect, onlabel }: Props = $props();

  // Local DnD state — updated on consider for visual feedback only.
  let dndItems = $state<PageInfo[]>([]);

  // Sync from props when not dragging.
  $effect(() => {
    dndItems = pages.map((p) => ({ ...p }));
  });

  let gridMinWidth = $derived(getGridMinWidth());

  function handleDndConsider(e: CustomEvent<{ items: PageInfo[] }>) {
    dndItems = e.detail.items;
  }

  /** Strip DnD-injected properties and commit to store. */
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
