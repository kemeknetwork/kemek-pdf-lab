<script lang="ts">
  interface Props {
    /** Pages already parsed and waiting for the grid to arrive. */
    pageCount: number;
  }

  let { pageCount }: Props = $props();

  const id = $props.id();
</script>

<!-- Shown only while the workspace chunk is still downloading after a file opened
     (normally it was prefetched on idle and this never paints). The fade-in waits
     a beat so a fast load doesn't flash it. The mark is the boot loader's, so the
     app has one loading idiom. -->
<div class="pending" role="status">
  <svg class="mark" width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <linearGradient id="beam-{id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="currentColor" stop-opacity="0" />
        <stop offset="0.5" stop-color="currentColor" stop-opacity="0.85" />
        <stop offset="1" stop-color="currentColor" stop-opacity="0" />
      </linearGradient>
      <clipPath id="doc-{id}">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      </clipPath>
    </defs>
    <path class="page" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <g clip-path="url(#doc-{id})">
      <rect class="scan" x="0" width="24" height="7" fill="url(#beam-{id})" />
    </g>
    <g class="ink">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </g>
  </svg>
  <p class="label">Opening {pageCount} {pageCount === 1 ? 'page' : 'pages'}…</p>
</div>

<style>
  .pending {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.875rem;
    color: var(--pdf-lab-primary);
    opacity: 0;
    animation: appear 0.3s ease-out 0.25s forwards;
  }

  .page {
    fill: currentColor;
    opacity: 0.07;
  }

  .ink {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .scan {
    animation: scan 1.55s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }

  .label {
    margin: 0;
    font-size: 0.875rem;
    color: var(--pdf-lab-text-secondary);
  }

  @keyframes appear {
    to { opacity: 1; }
  }

  @keyframes scan {
    0% { y: -7px; }
    72% { y: 23px; }
    100% { y: 23px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .pending {
      animation: none;
      opacity: 1;
    }
    .scan {
      animation: none;
      y: 9px;
    }
  }
</style>
