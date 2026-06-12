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

  <button class="how" onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
    <span>How it works</span>
    <span class="chev" class:open={expanded} aria-hidden="true"><ChevronDown size={14} /></span>
  </button>

  {#if expanded}
    <p class="detail">
      KeMeK PDF Lab runs entirely in your browser as JavaScript and WebAssembly —
      no server, no account, no backend. Your files are read into memory and
      everything — merge, split, watermark, even decrypting a password-protected
      PDF — happens on your device. Nothing is uploaded and nothing is stored;
      refreshing the page or clearing the workspace wipes it all.
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

  .points {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: stretch;
    gap: 0;
    flex-wrap: wrap;
    justify-content: center;
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

  .how {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--pdf-lab-text-tertiary);
    font-family: var(--pdf-lab-font);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 5px;
    transition: color 0.12s ease;
    animation: rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: 0.36s;
  }
  .how:hover {
    color: var(--pdf-lab-text-secondary);
  }
  .how:focus-visible {
    outline: 2px solid var(--pdf-lab-primary);
    outline-offset: 1px;
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

  @media (max-width: 520px) {
    .points {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.625rem;
    }
    .point {
      border-left: none;
      padding: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .point,
    .how,
    .detail {
      animation: none;
    }
    .chev {
      transition: none;
    }
  }
</style>
