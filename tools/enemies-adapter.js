// DocumentsTabletopPals/tools/enemies-adapter.js
// Publish–Subscribe adapter for Enemy Admin → Encounters (localStorage-based)

(() => {
  const ENEMIES_PUBLISH_KEY = 'tp_enemies_data_v1';
  const ENEMIES_PING_KEY    = 'tp_enemies_public_v1';

  let cache = [];

  function load() {
    try {
      const raw = localStorage.getItem(ENEMIES_PUBLISH_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      cache = Array.isArray(arr) ? arr : [];
    } catch { cache = []; }
    emit();
  }

  const listeners = new Set();
  function emit() { listeners.forEach(fn => fn(cache)); }

  /** Subscribe to changes (fires immediately with current cache) */
  function subscribe(fn) {
    listeners.add(fn);
    fn(cache);
    return () => listeners.delete(fn);
  }

  /** Manual reload if you add a “Reload” button somewhere */
  function reload() { load(); }

  // Cross-tab refresh when the Admin publishes
  window.addEventListener('storage', (e) => {
    if (e.key === ENEMIES_PUBLISH_KEY || e.key === ENEMIES_PING_KEY) load();
  });

  // Init
  load();

  // Minimal global surface
  window.EnemiesAdapter = { get: () => cache.slice(), subscribe, reload };
})();
