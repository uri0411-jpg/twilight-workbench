// ═══════════════════════════════════════════
//  TWILIGHT — sw-register.js v2
//  Service Worker registration — relative paths
// ═══════════════════════════════════════════

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      // Use relative path so it works on any subpath (e.g. /twilight-pwa/)
      const swPath = new URL('sw.js', window.location.href).href;
      const scopePath = new URL('./', window.location.href).href;
      const reg = await navigator.serviceWorker.register(swPath, { scope: scopePath });
      console.log('[SW] Registered, scope:', reg.scope);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW] New version available');
          }
        });
      });
    } catch (e) {
      console.warn('[SW] Registration failed:', e);
    }
  });
}

// ✓ sw-register.js v2 — relative paths
