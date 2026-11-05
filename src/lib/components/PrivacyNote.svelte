<script lang="ts">
  import { CloudOff, Cpu, EyeOff, ChevronDown } from 'lucide-svelte';

  let expanded = $state(false);

  const points = [
    { icon: CloudOff, label: 'No uploads', sub: 'Your files never reach a server.' },
    { icon: Cpu, label: 'Runs on your device', sub: 'Processed in your browser, as code.' },
    { icon: EyeOff, label: 'Leaves no trace', sub: 'Nothing is saved — close the tab and it’s gone.' }
  ];
</script>

<section class="privacy" aria-label="How your files are handled">
  <ul class="points">
    {#each points as p, i (p.label)}
      {@const Icon = p.icon}
      <li class="point" style:--i={i}>
        <span class="point-icon"><Icon size={17} /></span>
        <span class="point-text">
          <span class="point-label">{p.label}</span>
          <span class="point-sub">{p.sub}</span>
        </span>
      </li>
    {/each}
  </ul>

  <div class="meta">
    <button class="how" onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
      <span>How it works</span>
      <span class="chev" class:open={expanded} aria-hidden="true"><ChevronDown size={14} /></span>
    </button>

    <span class="meta-sep" aria-hidden="true"></span>

    <a
      class="source"
      href="https://github.com/kemeknetwork/kemek-pdf-lab"
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg class="gh" width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      <span>Source · MIT</span>
    </a>
  </div>

  {#if expanded}
    <p class="detail">
      KeMeK PDF Lab runs entirely in your browser as JavaScript and WebAssembly —
      no server, no account, no backend. Your files are read into memory and
      everything — merge, split, watermark, even decrypting a password-protected
      PDF — happens on your device. Nothing is uploaded and nothing is stored;
      refreshing the page or clearing the workspace wipes it all.
      <span class="detail-proof">
        Don’t take our word for it — it’s open source (MIT), so you can read
        exactly what runs. Your files are read into memory and never uploaded;
        nothing you open ever leaves your device.
      </span>
    </p>
  {/if}
</section>

<style>
  .privacy {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.875rem;
    margin: 0 1.5rem 1.25rem;
    padding-top: 0.25rem;
  }

  /* Three columns that keep their natural width while there is room and share
     the row when there isn't (the sub-lines wrap). A wrapping flex row dropped
     the third point onto a line of its own, divider and all, from ~520 to ~880px. */
  .points {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, auto));
    justify-content: center;
    align-items: stretch;
    max-width: 100%;
  }

  .point {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0 1.5rem;
    /* hairline separators between points, like the toolbar dividers */
    border-left: 1px solid var(--pdf-lab-border);
    /* staggered settle-in on first paint */
    animation: rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: calc(var(--i) * 90ms + 80ms);
  }
  .point:first-child {
    border-left: none;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .point-icon {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    color: var(--pdf-lab-primary);
    background: var(--pdf-lab-primary-soft);
  }

  .point-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .point-label {
    font-family: var(--pdf-lab-font);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--pdf-lab-text);
    line-height: 1.2;
  }
  .point-sub {
    font-size: 0.6875rem;
    color: var(--pdf-lab-text-tertiary);
    line-height: 1.3;
  }

  .meta {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    /* rises in after the three points have settled */
    animation: rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: 0.36s;
  }

  /* hairline between the toggle and the source link — the same motif the points
     and the toolbar dividers use */
  .meta-sep {
    width: 1px;
    height: 13px;
    background: var(--pdf-lab-border);
  }

  /* "How it works" toggle and the source link share one quiet link style */
  .how,
  .source {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    padding: 0.25rem 0.375rem;
    border: none;
    background: transparent;
    color: var(--pdf-lab-text-tertiary);
    font-family: var(--pdf-lab-font);
    font-size: 0.75rem;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    border-radius: 5px;
    transition: color 0.12s ease;
  }
  .how:hover,
  .source:hover {
    color: var(--pdf-lab-primary);
  }
  .how:focus-visible,
  .source:focus-visible {
    outline: 2px solid var(--pdf-lab-primary);
    outline-offset: 1px;
  }

  .gh {
    flex: 0 0 auto;
    opacity: 0.9;
  }

  .chev {
    display: inline-flex;
    transition: transform 0.2s ease;
  }
  .chev.open {
    transform: rotate(180deg);
  }

  .detail {
    max-width: 460px;
    margin: 0;
    text-align: center;
    font-size: 0.75rem;
    line-height: 1.6;
    color: var(--pdf-lab-text-secondary);
    animation: rise 0.24s ease both;
  }
  /* the verifiable claim — set apart as its own beat, slightly stronger */
  .detail-proof {
    display: block;
    margin-top: 0.5rem;
    color: var(--pdf-lab-text);
  }

  /* Below ~700px three columns get under ~210px each and the sub-lines run to
     three lines; one column reads better. */
  @media (max-width: 700px) {
    .points {
      grid-template-columns: minmax(0, auto);
      justify-items: start;
      gap: 0.625rem;
    }
    .point {
      border-left: none;
      padding: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .point,
    .meta,
    .detail {
      animation: none;
    }
    .chev {
      transition: none;
    }
  }
</style>
