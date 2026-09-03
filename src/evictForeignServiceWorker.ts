/**
 * Removes any service worker registered against this origin.
 *
 * This app has no service worker — no vite-plugin-pwa, no Workbox, no
 * manifest. But a service worker is scoped to the ORIGIN, not to the project,
 * so any other Vite PWA that was ever served on localhost:5173 stays
 * registered and keeps intercepting requests for this one.
 *
 * The symptoms are confusing precisely because they name files this project
 * does not contain:
 *   GET /src/main.jsx                              404   (ours is main.tsx)
 *   GET /@vite-plugin-pwa/pwa-entry-point-loaded   404   (not installed here)
 *   Manifest: Line 1, column 1, Syntax error             (no manifest exists;
 *                                                         the worker answers
 *                                                         with cached HTML,
 *                                                         which is not JSON)
 *
 * Clearing site data by hand fixes it until the next time another PWA runs on
 * the same port. Doing it in code fixes it for good, and is safe in production
 * too: this app never registers a worker, so any worker found is by definition
 * not ours.
 */
export async function evictForeignServiceWorker(): Promise<void> {
  // Undefined on an insecure origin that is not localhost, and in older
  // browsers. Nothing to do in either case.
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) {
      return;
    }

    await Promise.all(registrations.map((r) => r.unregister()));

    /*
     * Unregistering stops the worker but leaves its Cache Storage behind, and
     * those entries are what serve the stale index.html. Both have to go.
     */
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    console.warn(
      `[club-infication] Removed ${registrations.length} service worker(s) left on this origin by another app, ` +
        'along with their caches. Reloading once to drop anything they already served.',
    );

    /*
     * A reload is needed, not optional: the document currently on screen was
     * itself served by the worker we just removed, so it may reference files
     * that do not exist here. sessionStorage guards against a loop if the
     * eviction somehow fails.
     */
    const RELOAD_FLAG = 'ci_sw_evicted';
    if (!sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    }
  } catch (error) {
    // Never let cleanup stop the app from starting.
    console.warn('[club-infication] Could not clear service workers', error);
  }
}
