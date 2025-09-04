// DocumentsTabletopPals/tools/enemies-adapter.js
// Publish–Subscribe adapter + BroadcastChannel + ADMIN URL AUTOPROBE (GitHub Pages-safe)

(() => {
  const ENEMIES_PUBLISH_KEY = 'tp_enemies_data_v1';
  const ENEMIES_PING_KEY    = 'tp_enemies_public_v1';

  // ---- Locate our <script> tag ----
  const SCRIPT =
    document.querySelector('#enemies-adapter') ||
    document.currentScript ||
    document.querySelector('script[src*="enemies-adapter.js"]');

  // Build candidate Admin URLs
  function buildCandidates() {
    const cand = new Set();
    const base = document.baseURI;
    const scriptSrc = SCRIPT?.getAttribute('src') || '';
    const scriptURL = new URL(scriptSrc, base);

    // 0) If user forced a path, try that first (absolute or relative to script)
    if (SCRIPT?.dataset?.adminPath) {
      cand.add(new URL(SCRIPT.dataset.adminPath, scriptURL).href);
    }

    // 1) Relative to /.../tools/enemies-adapter.js  →  /.../admin/enemy-builder/
    cand.add(new URL('../admin/enemy-builder/', scriptURL).href);

    // 2) If path contains /DocumentsTabletopPals/, snap to that base
    const snap = (pathname) => {
      const needle = '/DocumentsTabletopPals/';
      const i = pathname.indexOf(needle);
      if (i !== -1) {
        return location.origin + pathname.slice(0, i + needle.length) + 'admin/enemy-builder/';
      }
      return null;
    };
    const s2 = snap(scriptURL.pathname); if (s2) cand.add(s2);
    const s3 = snap(location.pathname);  if (s3) cand.add(s3);

    // 3) Root-relative (user site). Works only if deployed at the root site repo.
    cand.add(new URL('/admin/enemy-builder/', location.origin).href);

    return [...cand];
  }

  // Probe each candidate with a HEAD request; pick the first 200 OK (same-origin only)
  async function pickWorkingURL(cands) {
    for (const href of cands) {
      try {
        const url = new URL(href, location.href);
        if (url.origin !== location.origin) continue; // avoid CORS surprises
        const res = await fetch(url.href, { method: 'HEAD', cache: 'no-store' });
        if (res.ok) return url.href;
        // Some GH Pages setups respond 200 only on index.html
        const res2 = await fetch(new URL('index.html', url).href, { method: 'HEAD', cache: 'no-store' });
        if (res2.ok) return url.href;
      } catch {}
    }
    // Nothing responded OK — fall back to best guess (relative to the script)
    try { return new URL('../admin/enemy-builder/', new URL(SCRIPT?.getAttribute('src')||'', document.baseURI)).href; }
    catch { return new URL('admin/enemy-builder/', location.href).href; }
  }

  const ADMIN_URL_PROMISE = pickWorkingURL(buildCandidates());
  let RESOLVED_ADMIN_URL = null;
  ADMIN_URL_PROMISE.then(u => { RESOLVED_ADMIN_URL = u; console.log('[EnemiesAdapter] Admin URL →', u); });

  // ---- BroadcastChannel + validation (unchanged) ----
  let bc = null;
  try { bc = new BroadcastChannel('tp_enemies'); } catch {}

  const XP_BY_CR = {
    "0":10,"1/8":25,"1/4":50,"1/2":100,"1":200,"2":450,"3":700,"4":1100,"5":1800,"6":2300,"7":2900,"8":3900,"9":5000,"10":5900,
    "11":7200,"12":8400,"13":10000,"14":11500,"15":13000,"16":15000,"17":18000,"18":20000,"19":22000,"20":25000,
    "21":33000,"22":41000,"23":50000,"24":62000,"25":75000,"26":90000,"27":105000,"28":120000,"29":135000,"30":155000
  };
  const CR_SET = new Set(Object.keys(XP_BY_CR));

  let cache = [];
  let lastStatus = { ok:false, count:0, errors:[], warnings:[], rawCount:0, when:Date.now() };

  function isIntIn(v, lo, hi){ return Number.isInteger(v) && v >= lo && v <= hi; }
  function validateArray(arr){
    const errors=[], warnings=[], valid=[], seenIds=new Set();
    if(!Array.isArray(arr)) return { ok:false, valid:[], errors:["Published data is not an array"], warnings };
    arr.forEach((e,i)=>{
      const where = `Enemy[${i}]`;
      if(typeof e!=='object' || e===null){ errors.push(`${where}: not an object`); return; }
      if(!e.id || typeof e.id!=='string') errors.push(`${where}: missing string 'id'`);
      if(!e.name || !String(e.name).trim()) errors.push(`${where}: missing 'name'`);
      if(!e.cr || typeof e.cr!=='string' || !CR_SET.has(e.cr)) errors.push(`${where}: invalid 'cr' (got ${JSON.stringify(e.cr)})`);
      if(!isIntIn(e.ac,1,30)) errors.push(`${where} '${e.name||"?"}': 'ac' must be 1..30 (got ${e.ac})`);
      if(!isIntIn(e.hp,1,10000)) errors.push(`${where} '${e.name||"?"}': 'hp' must be 1..10000 (got ${e.hp})`);
      if(e.type==null) warnings.push(`${where} '${e.name||"?"}': missing 'type' (recommended)`);
      if(e.id && seenIds.has(e.id)) errors.push(`${where} '${e.name||"?"}': duplicate id '${e.id}'`);
      seenIds.add(e.id);
      if(e.abilities && typeof e.abilities==='object'){
        for(const k of ['str','dex','con','int','wis','cha']){
          const v=e.abilities[k]; if(v!=null && !isIntIn(v,1,30)) errors.push(`${where} '${e.name||"?"}': abilities.${k} must be 1..30 (got ${v})`);
        }
      }
      if(e.tags && !Array.isArray(e.tags)) errors.push(`${where} '${e.name||"?"}': 'tags' must be an array of strings`);
      const hasHard = errors.some(x=>x.startsWith(where));
      if(!hasHard) valid.push(e);
    });
    return { ok: errors.length===0, valid, errors, warnings };
  }

  const listenersData   = new Set();
  const listenersStatus = new Set();

  function setStatus(st){ lastStatus = { ...st, when: Date.now() }; }
  function emit(){
    const data = cache.slice(), status = { ...lastStatus };
    listenersData.forEach(fn => { try{ fn(data); }catch{} });
    listenersStatus.forEach(fn => { try{ fn(status); }catch{} });
  }
  function load(){
    let parsed;
    try { parsed = JSON.parse(localStorage.getItem(ENEMIES_PUBLISH_KEY) || '[]'); }
    catch(err){
      cache = [];
      setStatus({ ok:false, count:0, rawCount:0, errors:[`Failed to parse ${ENEMIES_PUBLISH_KEY}: ${String(err)}`], warnings:[] });
      emit(); return;
    }
    const { ok, valid, errors, warnings } = validateArray(parsed);
    cache = valid;
    setStatus({ ok, count: valid.length, rawCount: Array.isArray(parsed)?parsed.length:0, errors, warnings });
    emit();
  }

  window.addEventListener('storage', (e)=> {
    if(e.key===ENEMIES_PUBLISH_KEY || e.key===ENEMIES_PING_KEY) load();
  });
  if(bc){ bc.onmessage = (ev)=> { if(ev?.data?.type==='publish') load(); }; }

  function subscribe(fn){ listenersData.add(fn); try{ fn(cache.slice()); }catch{} return ()=>listenersData.delete(fn); }
  function subscribeStatus(fn){ listenersStatus.add(fn); try{ fn({ ...lastStatus }); }catch{} return ()=>listenersStatus.delete(fn); }
  function reload(){ load(); }
  function get(){ return cache.slice(); }
  function status(){ return { ...lastStatus }; }
  async function openAdmin(){
    const url = RESOLVED_ADMIN_URL || await ADMIN_URL_PROMISE;
    window.open(url, '_blank', 'noopener');
  }

  load();
  window.EnemiesAdapter = { get, reload, subscribe, subscribeStatus, status, openAdmin };
})();
