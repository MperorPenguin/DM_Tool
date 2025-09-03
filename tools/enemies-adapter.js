// DocumentsTabletopPals/tools/enemies-adapter.js
// Validating Publish–Subscribe adapter + BroadcastChannel + robust Admin URL auto-detect

(() => {
  const ENEMIES_PUBLISH_KEY = 'tp_enemies_data_v1';
  const ENEMIES_PING_KEY    = 'tp_enemies_public_v1';

  // ---------- Admin URL detection (works on GitHub Project Pages) ----------
  // We resolve the Admin URL *relative to the adapter script's own URL*,
  // so if your site is https://user.github.io/REPO/, this becomes /REPO/admin/enemy-builder/
  const SCRIPT =
    document.querySelector('#enemies-adapter') ||
    document.currentScript ||
    document.querySelector('script[src*="enemies-adapter.js"]');

  let ADMIN_URL;
  try {
    // Absolute URL of this script (handles ../../ paths correctly)
    const scriptURL = new URL(SCRIPT?.getAttribute('src') || '', document.baseURI);
    // If you explicitly pass data-admin-path, resolve it relative to the script URL
    if (SCRIPT?.dataset?.adminPath) {
      ADMIN_URL = new URL(SCRIPT.dataset.adminPath, scriptURL);
    } else {
      // Default: "../admin/enemy-builder/" relative to /REPO/tools/enemies-adapter.js -> /REPO/admin/enemy-builder/
      ADMIN_URL = new URL('../admin/enemy-builder/', scriptURL);
    }
  } catch {
    // Fallback (shouldn't be needed): open a relative admin path from current page
    ADMIN_URL = new URL('admin/enemy-builder/', window.location.href);
  }

  // BroadcastChannel (best-effort)
  let bc = null;
  try { bc = new BroadcastChannel('tp_enemies'); } catch {}

  // CR → XP (validation reference)
  const XP_BY_CR = {
    "0":10,"1/8":25,"1/4":50,"1/2":100,"1":200,"2":450,"3":700,"4":1100,"5":1800,"6":2300,"7":2900,"8":3900,"9":5000,"10":5900,
    "11":7200,"12":8400,"13":10000,"14":11500,"15":13000,"16":15000,"17":18000,"18":20000,"19":22000,"20":25000,
    "21":33000,"22":41000,"23":50000,"24":62000,"25":75000,"26":90000,"27":105000,"28":120000,"29":135000,"30":155000
  };
  const CR_SET = new Set(Object.keys(XP_BY_CR));

  let cache = [];
  let lastStatus = { ok:false, count:0, errors:[], warnings:[], rawCount:0, when:Date.now() };

  // ---------- Validation ----------
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

  // ---------- Core load / emit ----------
  const listenersData   = new Set();
  const listenersStatus = new Set();

  function setStatus(st){ lastStatus = { ...st, when: Date.now() }; }
  function emit(){
    const data = cache.slice();
    const status = { ...lastStatus };
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

  // storage + BroadcastChannel listeners
  window.addEventListener('storage', (e)=> {
    if(e.key===ENEMIES_PUBLISH_KEY || e.key===ENEMIES_PING_KEY) load();
  });
  if(bc){
    bc.onmessage = (ev)=> { if(ev && ev.data && ev.data.type==='publish') load(); };
  }

  // ---------- Public API ----------
  function subscribe(fn){ listenersData.add(fn); try{ fn(cache.slice()); }catch{} return ()=>listenersData.delete(fn); }
  function subscribeStatus(fn){ listenersStatus.add(fn); try{ fn({ ...lastStatus }); }catch{} return ()=>listenersStatus.delete(fn); }
  function reload(){ load(); }
  function get(){ return cache.slice(); }
  function status(){ return { ...lastStatus }; }
  function openAdmin(){ window.open(ADMIN_URL.href, '_blank', 'noopener'); }

  // init
  load();

  window.EnemiesAdapter = { get, reload, subscribe, subscribeStatus, status, openAdmin };
})();
