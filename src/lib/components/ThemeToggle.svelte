<script lang="ts">
  import { browser } from '$app/environment';

  function initialDark(): boolean {
    if (!browser) return false;
    const stored = localStorage.getItem('pdf-lab-theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  let dark = $state(initialDark());

  $effect(() => {
    if (!browser) return;
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('pdf-lab-theme', dark ? 'dark' : 'light'); } catch { /* private browsing */ }
    // Keep the iOS/Android address-bar tint in sync with the active palette.
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#06120b' : '#15803d');
  });

  function toggle() {
    dark = !dark;
  }
</script>

<button class="toggle" onclick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
  <div class="toggle-track" class:dark>
    <div class="toggle-thumb">
      {#if dark}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <line x1="12" y1="2" x2="12" y2="5"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
          <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/>
          <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
          <line x1="2" y1="12" x2="5" y2="12"/>
          <line x1="19" y1="12" x2="22" y2="12"/>
          <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/>
          <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
        </svg>
      {:else}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
        </svg>
      {/if}
    </div>
  </div>
</button>

<style>
  .toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0.375rem;
    border-radius: 4px;
  }

  .toggle:focus-visible {
    outline: 2px solid var(--pdf-lab-primary);
    outline-offset: 2px;
  }

  .toggle-track {
    width: 2.5rem;
    height: 1.375rem;
    border-radius: 1rem;
    background: var(--pdf-lab-border);
    position: relative;
    transition: background 0.25s ease;
  }

  .toggle-track.dark {
    background: var(--pdf-lab-primary);
  }

  .toggle-thumb {
    position: absolute;
    top: 2.5px;
    left: 2.5px;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: white;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--pdf-lab-text-secondary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .dark .toggle-thumb {
    transform: translateX(1.125rem);
    color: var(--pdf-lab-primary);
  }
</style>
