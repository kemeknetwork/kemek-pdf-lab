// Service-worker lifecycle for the offline PWA, in prompt mode.
//
// A new version never takes over on its own: the documents a user is working on
// live only in memory, so an auto-activating worker would reload the tab and
// wipe them mid-edit. A tab reloads into a new version only when its user
// accepts UpdateNotice, or silently when it holds no work and is hidden (nothing
// to lose, nobody watching). That holds across tabs too: one tab applying the
// update must not reload another tab that has documents open.
//
// Production only. In dev the PWA plugin is disabled and `/sw.js` is the
// self-destructing worker in static/, which unregisters itself and navigates
// every client, so registering it would reload-loop. Insecure origins (the
// plain-HTTP tailnet dev origin) have no navigator.serviceWorker at all.

/** 'ready': a new version is installed and this tab can switch to it.
 *  'elsewhere': another tab already switched; this one still runs the old code. */
export type UpdateState = 'none' | 'ready' | 'elsewhere';

let updateState = $state<UpdateState>('none');
let noticeDismissed = $state(false);
let offlineReady = $state(false);
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let requestedHere = false;
let reloading = false;
let holds = 0;

/** Keep a waiting update from applying silently while the user is mid-task
 *  with nothing in the store yet: choosing a file (Android's system picker
 *  hides the page) or a file still being read. Returns the release; a hold
 *  that is never released only disables the quiet path, and the notice still
 *  offers Reload. */
export function holdQuietUpdate(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
  };
}

/** Show the update notice: a new version is available and the user hasn't said "Later". */
export function showUpdateNotice(): boolean {
  return updateState !== 'none' && !noticeDismissed;
}

export function getUpdateState(): UpdateState {
  return updateState;
}

/** The app was just cached for offline use (first install only). */
export function isOfflineReady(): boolean {
  return offlineReady;
}

const HOURLY = 60 * 60 * 1000;

export async function initPwa(hasOpenWork: () => boolean): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // With site data blocked, `'serviceWorker' in navigator` is still true but
  // reading the property throws SecurityError. The app works without offline
  // support, so probe once and bow out quietly (an expected condition).
  try {
    void navigator.serviceWorker;
  } catch {
    return;
  }
  const { registerSW } = await import('virtual:pwa-register');
  const canApplyQuietly = () => document.visibilityState === 'hidden' && holds === 0 && !hasOpenWork();
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateState = 'ready';
      noticeDismissed = false;
    },
    // A new worker took control of this tab. Without this hook the plugin
    // reloads unconditionally, including when ANOTHER tab applied the update,
    // which would wipe this tab's documents without asking.
    onNeedReload() {
      if (requestedHere || canApplyQuietly()) {
        reloadOnce();
        return;
      }
      updateState = 'elsewhere';
      noticeDismissed = false;
    },
    onOfflineReady() {
      offlineReady = true;
    },
    onRegisteredSW(_url, r) {
      registration = r;
      // An editor tab can stay open for days; without this it only learns of a
      // deploy on its next full load. Fetches only /sw.js, same-origin.
      if (r) setInterval(() => void r.update().catch(() => {}), HOURLY);
    },
    onRegisterError(error) {
      console.error('Offline support is unavailable: service worker registration failed.', error);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (updateState !== 'none' && canApplyQuietly()) applyUpdate();
  });
}

/** Switch this tab to the new version: activate the waiting worker if there is
 *  one, then reload. With nothing waiting (another tab activated it, or this
 *  tab was never controlled so the new worker activated directly) a plain
 *  reload is the whole job. */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!updateSW || !waiting) {
    reloadOnce();
    return;
  }
  requestedHere = true;
  // onNeedReload reloads this tab when the new worker takes control of it. A
  // tab the old worker never controlled (a first visit: prompt mode has no
  // clients.claim) gets no controllerchange, so also reload on activation, and
  // fall back to a plain reload if activation never reports back.
  waiting.addEventListener('statechange', () => {
    if (waiting.state === 'activated') reloadOnce();
  });
  setTimeout(reloadOnce, 3000);
  void updateSW(true);
}

function reloadOnce(): void {
  if (reloading) return;
  reloading = true;
  location.reload();
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
