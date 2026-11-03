// Service-worker lifecycle for the offline PWA, in prompt mode.
//
// A new version never takes over on its own: the documents a user is working on
// live only in memory, so an auto-activating worker would reload the tab and
// wipe them mid-edit. A waiting update is applied only when the user accepts
// UpdateNotice, or silently when nothing is open and the tab is hidden (no work
// to lose, nobody watching).
//
// Production only. In dev the PWA plugin is disabled and `/sw.js` is the
// self-destructing worker in static/, which unregisters itself and navigates
// every client, so registering it would reload-loop. Insecure origins (the
// plain-HTTP tailnet dev origin) have no navigator.serviceWorker at all.

let updateWaiting = $state(false);
let noticeDismissed = $state(false);
let offlineReady = $state(false);
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

/** Show the update notice: a new version waits and the user hasn't said "Later". */
export function showUpdateNotice(): boolean {
  return updateWaiting && !noticeDismissed;
}

/** The app was just cached for offline use (first install only). */
export function isOfflineReady(): boolean {
  return offlineReady;
}

const HOURLY = 60 * 60 * 1000;

export async function initPwa(hasOpenWork: () => boolean): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateWaiting = true;
      noticeDismissed = false;
    },
    onOfflineReady() {
      offlineReady = true;
    },
    onRegisteredSW(_url, registration) {
      // An editor tab can stay open for days; without this it only learns of a
      // deploy on its next full load. Fetches only /sw.js, same-origin.
      if (registration) setInterval(() => void registration.update().catch(() => {}), HOURLY);
    },
    onRegisterError(error) {
      console.error('Offline support is unavailable: service worker registration failed.', error);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && updateWaiting && !hasOpenWork()) applyUpdate();
  });
}

/** Activate the waiting worker and reload into it; a plain reload when none waits. */
export function applyUpdate(): void {
  if (updateSW && updateWaiting) void updateSW(true);
  else location.reload();
}

/** "Later": hide the notice. The update keeps waiting: the quiet hidden-tab
 *  apply still runs, and the next load re-detects the waiting worker and shows
 *  the notice again (a plain reload never activates it — the page overlaps the
 *  old worker, so only skip-waiting via applyUpdate swaps them). */
export function dismissUpdate(): void {
  noticeDismissed = true;
}

export function dismissOfflineReady(): void {
  offlineReady = false;
}
