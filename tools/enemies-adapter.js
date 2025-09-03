// DocumentsTabletopPals/tools/enemies-adapter.js
// Validating Publish–Subscribe adapter for Enemy Admin → Encounters (localStorage)

(() => {
  const ENEMIES_PUBLISH_KEY = 'tp_enemies_data_v1';
  const ENEMIES_PING_KEY    = 'tp_enemies_public_v1';

  // CR→XP (for checks; don't auto-fix here)
  const XP_BY_CR = {
    "0":10,"1/8":25,"1/4":50,"1/2":100,"1":200,"2":450,"3":700,"4":1100,"5":1800,"6":2300,"7":2900,"8":3900,"9":5000,"10":5900,
    "11":7200,"12":8400,"13":10000,"14":11500,"15":13000,"16":15000,"17":18000,"18":20000,"19":22000,"20":25000,
    "21":33000,"22":41000,"23":50000,"24":62000,"25":75000,"26":90000,"27":105000,"28":120000,"29":135000,"30":155000
  };
  const CR_SET = new Set(Object.keys(XP_BY_CR));

  let cache = [];         // valid subset for the UI
  let lastStatus = { ok:false, count:0, errors:[], warnings:[], rawCount:0, when:Date.now() };

  // ---------- Validation ----------
  function validateArray(arr){
    const errors = [];
    const warnings = [];
    const valid = [];
    const seenIds = new Set();

    if (!Array.isArray(arr)) {
      return { ok:false, valid:[], errors:["Published data is not an array"], warnings };
    }

    arr.forEach((e, i) => {
      const where = `Enemy[${i}]`;
      if (typeof e !== 'object' || e === null) {
        errors.push(`${where}: not an object`); return;
      }
      // Required fields
      if (!e.id || typeof e.id !== 'string')  errors.push(`${where}: missing string 'id'`);
      if (!e.name || typeof e.name !== 'string' || !e.name.trim()) errors.push(`${where}: missing 'name'`);
      if (!e.cr || typeof e.cr !== 'string' || !CR_SET.has(e.cr))  errors.push(`${where}: invalid 'cr' (got ${JSON.stringify(e.cr)})`);
      if (!isIntIn(e.ac, 1, 30))   errors.push(`${where} '${e.name||"?"}': 'ac' must be 1..30 (got ${e.ac})`);
      if (!isIntIn(e.hp, 1, 10000)) errors.push(`${where} '${e.name||"?"}': 'hp' must be 1..10000 (got ${e.hp})`);
      if (!e.type || typeof e.type !== 'string') warnings.push(`${where} '${e.name||"?"}': missing 'type' (ok but recommended)`);

      // Duplicates
      if (e.id && seenIds.has(e.id)) {
        errors.push(`${where} '${e.name||"?"}': duplicate id '${e.id}'`);
      }
      seenIds.add(e.id);

      // XP mismatch = warning (don’t block)
      if (e.cr && CR_SET.has(e.cr)) {
        const exp = XP_BY_CR[e.cr];
        if (typeof e.xp !== 'number' || e.xp !== exp) {
          warnings.push(`${where} '${e.name||"?"}': xp (${e.xp}) doesn’t match CR ${e.cr} table (${exp})`);
        }
      }

      // Abilities (optional)
      if (e.abilities && typeof e.abilities === 'object') {
        for (const k of ['str','dex','con','int','wis','cha']) {
          const v = e.abilities[k];
          if (typeof v !== 'undefined' && !isIntIn(v, 1, 30)) {
            errors.push(`${where} '${e.name||"?"}': abilities.${k} must be 1..30 (got ${v})`);
          }
        }
      }

      // Tags (optional)
      if (e.tags && !Array.isArray(e.tags)) {
        errors.push(`${where} '${e.name||"?"}': 'tags' must be an array of strings`);
      }

      // If no hard errors for this record, accept
      // (Warnings do not block)
      const hadHardError = errors.some(msg => msg.startsWith(where));
      if (!hadHardError) valid.push(e);
    });

    return { ok: errors.length === 0, valid, errors, warnings };
  }

  function isIntIn(v, lo, hi){
    return Number.isInteger(v) && v >= lo && v <= hi;
  }

  // ---------- Core load/emit ----------
  const listenersData   = new Set(); // (list) -> void
  const listenersStatus = new Set(); // (status) -> void

  function emit(){
    listenersData.forEach(fn => { try{ fn(cache.slice()); }catch{} });
    listenersStatus.forEach(fn => { try{ fn({...lastStatus}); }catch{} });
  }

  function setStatus(st){
    lastStatus = { ...st, when: Date.now() };
  }

  function load(){
    let parsed;
    try {
      const raw = localStorage.getItem(ENEMIES_PUBLISH_KEY);
      parsed = raw ? JSON.parse(raw) : [];
    } catch (err) {
      cache = [];
      setStatus({
        ok:false, count:0, rawCount:0,
        errors:[`Failed to parse JSON in ${ENEMIES_PUBLISH_KEY}: ${String(err)}`],
        warnings:[]
      });
      emit();
      return;
    }

    const { ok, valid, errors, warnings } = validateArray(parsed);
    cache = valid;
    setStatus({ ok, count: valid.length, rawCount: Array.isArray(parsed) ? parsed.length : 0, errors, warnings });
    emit();
  }

  // Cross-tab update when Admin publishes
  window.addEventListener('storage', (e) => {
    if (e.key === ENEMIES_PUBLISH_KEY || e.key === ENEMIES_PING_KEY) load();
  });

  // Public API (back-compat + status)
  function subscribe(fn){
    listenersData.add(fn);
    try { fn(cache.slice()); } catch {}
    return () => listenersData.delete(fn);
  }
  function subscribeStatus(fn){
    listenersStatus.add(fn);
    try { fn({...lastStatus}); } catch {}
    return () => listenersStatus.delete(fn);
  }
  function reload(){ load(); }
  function get(){ return cache.slice(); }
  function status(){ return { ...lastStatus }; }

  // Init
  load();

  window.EnemiesAdapter = { get, reload, subscribe, subscribeStatus, status };
})();
