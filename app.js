/* DM Toolkit — World Map + DM Page + Dice + Live Sync */

let MAPS = [];
const IS_FILE = (location.protocol === 'file:');
const TRY_FETCH_JSON_INDEX = !IS_FILE;

const CHAR_LIB_KEY = 'tp_cc_characters';

const worldChan = (typeof BroadcastChannel !== 'undefined')
  ? new BroadcastChannel('world-sync')
  : { postMessage: ()=>{} };

// ---------- EnemyStore: shared localStorage + live sync ----------
window.EnemyStore = window.EnemyStore || (function () {
  const KEY = 'tp_dm_enemies';
  const VERSION = 1;

  const uid = () => (crypto?.randomUUID?.() || `e_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
  const now  = () => Date.now();

  function _readRaw() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { version: VERSION, items: [] }; }
    catch { return { version: VERSION, items: [] }; }
  }
  function _writeRaw(payload) {
    localStorage.setItem(KEY, JSON.stringify(payload));
    _broadcast();
  }

  function read() {
    const { items } = _readRaw();
    return Array.isArray(items) ? items : [];
  }
  function write(list) {
    const payload = { version: VERSION, items: list || [] };
    _writeRaw(payload);
  }
  function upsert(enemy) {
    const list = read();
    if (!enemy.id) enemy.id = uid();
    enemy.updatedAt = now();
    const idx = list.findIndex(e => e.id === enemy.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...enemy };
    else list.unshift(enemy);
    write(list);
    return enemy.id;
  }
  function remove(id) { write(read().filter(e => e.id !== id)); }

  let bc = null;
  try { bc = new BroadcastChannel('tp_dm_enemies_channel'); } catch {}
  const listeners = new Set();

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function _notify() { for (const fn of listeners) try { fn(read()); } catch {} }
  function _broadcast() { _notify(); if (bc) bc.postMessage({ type: 'updated' }); }

  if (bc) bc.onmessage = (evt) => { if (evt?.data?.type === 'updated') _notify(); };
  window.addEventListener('storage', (evt) => { if (evt.key === KEY) _notify(); });

  return { KEY, read, write, upsert, remove, subscribe };
})();

/* ========= Global State ========= */
const state = load() || {
  route: 'home',
  ui: { dmTab: 'party', environment: 'clear' },
  notes: '',
  dice: { log: [], last: null },
  worldSrc: null,
  worldIndex: 0,
  boardBg: null,
  mapIndex: 0,
  tokens: {
    pc:   [],
    npc:  [{id:'n1', name:'Elder Bran', cls:'NPC',   traits:['Civilian'], hp:[6,6]}],
    enemy:[{id:'e1', name:'Skeleton A', cls:'Enemy', traits:['Undead','Darkvision'], hp:[13,13]}],
  },
  selected: null,
  worldData: [],
};

function save(){ try { localStorage.setItem('tp_state_v26', JSON.stringify(state)); } catch(e) {} }
function load(){ try { return JSON.parse(localStorage.getItem('tp_state_v26')); }catch(e){ return null; } }

/* ========= Character Manager bridge ========= */
function listCharactersLib(){
  try { return JSON.parse(localStorage.getItem(CHAR_LIB_KEY)) || []; }
  catch { return []; }
}
function getPartyTokens(){
  const party = listCharactersLib().filter(c => !!c.inParty);
  return party.map(c => ({
    id: c.id,
    name: c.name || 'Unnamed',
    cls: 'PC',
    traits: (c.traits && Array.isArray(c.traits)) ? c.traits : [],
    badges: [ c.race && `Race: ${c.race}`, c.class && `Class: ${c.class}`, c.level && `Lvl ${c.level}` ].filter(Boolean),
    hp: Array.isArray(c.hp) && c.hp.length >= 2 ? c.hp : null,
  }));
}

/* ========= Enemies bridge (EnemyStore → DM token cards) ========= */
function mapDMEnemyToToken(e){
  return {
    id: e.id,
    name: e.name || '(Unnamed)',
    cls: 'Enemy',
    traits: Array.isArray(e.tags) ? e.tags : [],
    badges: [ e.type && `Type: ${e.type}`, e.cr && `CR ${e.cr}`, Number.isFinite(e.ac) && `AC ${e.ac}` ].filter(Boolean),
    hp: Number.isFinite(e.hp) ? [e.hp, e.hp] : null,
  };
}
function getEnemyTokens(){ return EnemyStore.read().map(mapDMEnemyToToken); }
let _unsubEnemyStore = null;
function initEnemyStoreSync(){
  try { _unsubEnemyStore?.(); } catch {}
  _unsubEnemyStore = EnemyStore.subscribe(() => {
    if (state.route === 'dm' && state.ui.dmTab === 'enemies') renderDmPage();
  });
}

/* ========= Universal NAV helpers ========= */
function nav(route){
  state.route = route;
  save();
  render();
}
function setDmTab(tab){
  state.ui.dmTab = tab;
  save();
  renderDmPage();
}

// EXPOSE for inline HTML handlers (fixes your landing/nav buttons)
window.nav = nav;
window.setDmTab = setDmTab;
window.openWorld = openWorld;
window.openWorldViewer = openWorldViewer;

/* ========= Storage listeners (PC Party + Enemies live-refresh) ========= */
window.addEventListener('storage', (e)=>{
  if(e.key === CHAR_LIB_KEY){
    if(state.route === 'dm' && state.ui.dmTab === 'party') renderDmPage();
  }
  if (window.EnemyStore && e.key === EnemyStore.KEY){
    if (state.route === 'dm' && state.ui.dmTab === 'enemies') renderDmPage();
  }
});

/* ========= Render root ========= */
function render(){
  // Try a flexible view switcher first: show element whose id == route
  const view = document.getElementById(state.route);
  if (view){
    // Hide a known set if present (won’t error if missing)
    ['home','dm','world','characters','logbook','enemy-builder']
      .forEach(id => { const el = document.getElementById(id); if (el) el.hidden = (el !== view); });
  } else {
    // Fallback to classic 3-panels
    const home = document.getElementById('home');
    const dm   = document.getElementById('dm');
    const world= document.getElementById('world');
    if(home)  home.hidden  = state.route !== 'home';
    if(dm)    dm.hidden    = state.route !== 'dm';
    if(world) world.hidden = state.route !== 'world';
  }

  if(state.route==='home') renderHome();
  if(state.route==='dm')   renderDmPage();
  if(state.route==='world')renderWorld();
}

function renderHome(){ /* landing is static; no-op */ }

/* ========= DM Page ========= */
function dmTabButton(id, label, active){
  return `<button class="btn ghost ${active?'active':''}" onclick="setDmTab('${id}')">${label}</button>`;
}
function tokenCard(kind, t){
  const hpBadge = (t.hp && Array.isArray(t.hp)) ? `<span class="tag" title="HP">${t.hp[0]} / ${t.hp[1]} HP</span>` : '';
  const traits = (t.traits||[]).map(x=>`<span class="tag">${x}</span>`).join('');
  const badges = (t.badges||[]).map(x=>`<span class="tag">${x}</span>`).join('');
  return `
    <div class="card token ${kind}">
      <div class="token-head">
        <div class="token-title">${t.name||'Unnamed'}</div>
        <div class="token-meta">${badges}${hpBadge}</div>
      </div>
      <div class="token-traits">${traits}</div>
    </div>`;
}
function renderDmPage(){
  const tabsEl = document.getElementById('dm-tabs');
  const bodyEl = document.getElementById('dm-body');
  if(!tabsEl || !bodyEl) return;

  const npcs   = state.tokens.npc||[];
  const tab    = state.ui.dmTab||'party';

  tabsEl.innerHTML = `
    ${dmTabButton('party','Party',tab==='party')}
    ${dmTabButton('npcs','NPCs',tab==='npcs')}
    ${dmTabButton('enemies','Enemies',tab==='enemies')}
    ${dmTabButton('notes','Notes',tab==='notes')}
    ${dmTabButton('tools','Tools',tab==='tools')}
  `;

  let body = '';

  if(tab==='party'){
    const pcs = getPartyTokens();
    body += `<div class="dm-grid3">${
      pcs.length
        ? pcs.map(p=>tokenCard('pc',p)).join('')
        : `<div class="panel" style="grid-column:1/-1; text-align:center; padding:16px;">
             <h3 style="margin:0 0 8px;">No party members yet</h3>
             <div class="small">Open <strong>Character Manager</strong> and tick “In Party”.</div>
           </div>`
    }</div>`;
  }

  if(tab==='npcs'){
    body+=`<div class="dm-grid3">${npcs.map(n=>tokenCard('npc',n)).join('')||'<div class="small">No NPCs yet.</div>'}</div>`;
  }

  if(tab==='enemies'){
    const enemiesTokens = getEnemyTokens();
    body+=`<div class="dm-grid3">${
      enemiesTokens.length
        ? enemiesTokens.map(e=>tokenCard('enemy', e)).join('')
        : '<div class="small">No Enemies yet. Open <strong>Enemy Builder</strong> to add some.</div>'
    }</div>`;
  }

  if(tab==='notes'){
    body+=`
      <div class="dm-section">
        <div class="dm-sec-head"><span>DM Notes</span></div>
        <textarea id="dm-notes" rows="12" style="width:100%">${escapeHtml(state.notes||'')}</textarea>
      </div>`;
  }

  if(tab==='tools'){
    const env = state.ui.environment;
    const effects = computeEnvironmentEffects();
    const mapButtons = (MAPS||[]).map((m,i)=>`
      <button type="button" class="map-pill ${state.worldIndex===i?'active':''}" onclick="openWorld(${i})">${escapeHtml(m.name||('Map '+(i+1)))}</button>
    `).join('');

    body+=`
      <div class="dm-section">
        <div class="dm-sec-head"><span>Environment</span></div>
        <div class="pillwrap">
          ${['clear','rain','fog','storm','snow'].map(k=>`
            <button class="pill ${env===k?'active':''}" onclick="setEnvironment('${k}')">${k[0].toUpperCase()+k.slice(1)}</button>
          `).join('')}
        </div>
        <div class="tiny muted">${effects.length?effects.join(' · '):'No special effects.'}</div>
      </div>

      <div class="dm-section">
        <div class="dm-sec-head"><span>World Maps</span></div>
        <div class="pillwrap">${mapButtons || '<span class="tiny muted">No maps loaded.</span>'}</div>
        <div style="margin-top:8px">
          <button class="btn" onclick="openWorldViewer()">Open World Viewer</button>
        </div>
      </div>

      <div class="dm-section">
        <div class="dm-sec-head"><span>Dice</span></div>
        <div class="pillwrap">
          ${[4,6,8,10,12,20,100].map(s=>`<button class="pill" onclick="roll(d${s})">d${s}</button>`).join('')}
          <button class="pill" onclick="rollAdv()">Adv</button>
          <button class="pill" onclick="rollDis()">Dis</button>
        </div>
        <div id="dice-log" class="dice-log"></div>
      </div>
    `;
  }

  bodyEl.innerHTML = body;
  if(tab==='tools') renderDice();
  if(tab==='notes'){
    const ta = document.getElementById('dm-notes');
    ta?.addEventListener('input', ()=>{ state.notes = ta.value; save(); });
  }
}

/* ========= Notes ========= */
function renderNotes(){
  const ta = document.getElementById('dm-notes');
  if(ta) ta.value = state.notes || '';
}

/* ========= Dice ========= */
const d4=(n=1)=>rollDie(4,n), d6=(n=1)=>rollDie(6,n), d8=(n=1)=>rollDie(8,n), d10=(n=1)=>rollDie(10,n), d12=(n=1)=>rollDie(12,n), d20=(n=1)=>rollDie(20,n), d100=(n=1)=>rollDie(100,n);
function rollDie(sides, count=1){ return Array.from({length:count}, ()=>1+Math.floor(Math.random()*sides)); }
function roll(die){
  const res = Array.isArray(die) ? die : [die()];
  const sum = res.reduce((a,b)=>a+b,0);
  const entry = { time: Date.now(), res, sum };
  state.dice.last = entry;
  state.dice.log.unshift(entry);
  if(state.dice.log.length > 50) state.dice.log.pop();
  save();
  renderDice();
}
function rollAdv(){ roll([d20(), d20()].sort((a,b)=>b-a)); }
function rollDis(){ roll([d20(), d20()].sort((a,b)=>a-b)); }

function renderDice(){
  const el = document.getElementById('dice-log'); if(!el) return;
  el.innerHTML = (state.dice.log||[]).slice(0,20).map(x=>`
    <div class="dice-row">
      <span class="muted tiny">${new Date(x.time).toLocaleTimeString()}</span>
      <span class="dice-res">${x.res.join(', ')}</span>
      <strong class="dice-sum">${x.sum}</strong>
    </div>
  `).join('') || '<div class="tiny muted">No rolls yet.</div>';
}

/* ========= Environment ========= */
function setEnvironment(k){ state.ui.environment = k; save(); renderDmPage(); }
function computeEnvironmentEffects(){
  const k = state.ui.environment;
  if(k==='rain') return ['+2 DC to Perception (hearing)', 'Open flames may go out'];
  if(k==='fog')  return ['Heavily obscured > 30 ft', 'Disadvantage on Perception (sight)'];
  if(k==='storm')return ['Disadvantage on ranged attacks at long range', 'Loud thunder: +5 DC to hearing'];
  if(k==='snow') return ['Difficult terrain (deep snow)', 'Trackable footprints'];
  return [];
}

/* ========= World ========= */
async function reloadMaps(){
  try{
    if(TRY_FETCH_JSON_INDEX){
      const res = await fetch('maps.json', { cache: 'no-store' });
      MAPS = res.ok ? await res.json() : [];
    } else { MAPS = []; }
  }catch(e){ MAPS = []; }
}
function openWorld(index=0){
  state.worldIndex = index|0;
  state.worldSrc = (MAPS[index] && MAPS[index].src) || state.worldSrc || 'map.svg';
  save();
  renderWorld();
}
function setWorldUrl(){
  const inp = document.getElementById('world-url');
  const v = (inp?.value||'').trim();
  if(!v) return;
  state.worldSrc = v;
  save();
  renderWorld();
}
let worldViewerWin = null;
function openWorldViewer(){
  if(worldViewerWin && !worldViewerWin.closed){
    worldViewerWin.focus();
    syncWorldViewer();
    worldChan.postMessage({type:'ping'});
    return;
  }
  worldViewerWin = window.open('', 'WorldViewer', 'width=1200,height=800');
  if(!worldViewerWin) return;

  const html = `<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>World Viewer</title>
  <link href="https://fonts.googleapis.com/css2?family=Arvo:wght@400;700&display=swap" rel="stylesheet">
  <style>
    html,body{height:100%;margin:0;background:#000e1b;color:#e9ecf1;font-family:Arvo,system-ui,-apple-system,"Segoe UI",Roboto,Arimo,Helvetica,Arial,sans-serif}
    .wrap{height:100%;display:grid;place-items:center;padding:10px}
    .frame{width:min(1200px,95vw);height:min(900px,90vh);background:#0a1420;border:1px solid #203246;border-radius:12px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.5)}
    iframe{width:100%;height:100%;border:0;background:#08101a}
  </style></head><body>
  <main class="wrap">
    <div class="frame"><iframe id="world-iframe" src=""></iframe></div>
  </main>
  <script>
    const chan = new BroadcastChannel('world-sync');
    chan.onmessage = (e)=>{
      if(e?.data?.type==='sync'){
        const { src } = e.data;
        const ifr = document.getElementById('world-iframe');
        if(ifr && ifr.src !== src){ ifr.src = src; }
      }
    };
  </script>
  </body></html>`;
  worldViewerWin.document.open(); worldViewerWin.document.write(html); worldViewerWin.document.close();
  syncWorldViewer();
}
function syncWorldViewer(){
  const src = state.worldSrc || 'map.svg';
  try{ worldChan.postMessage({type:'sync', src}); }catch(e){}
}
function renderWorld(){
  const iframe = document.getElementById('world-iframe');
  const urlInp = document.getElementById('world-url');
  if(urlInp) urlInp.value = state.worldSrc || '';
  if(iframe) iframe.src = state.worldSrc || 'map.svg';
}

/* ========= Boot ========= */
document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    await reloadMaps();
    renderNotes();
    renderDice();
    initEnemyStoreSync();

    // Keyboard support for tiles
    document.querySelectorAll('.tile[tabindex]')
      .forEach(tile => tile.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tile.click(); }
      }));

    // CLICK DELEGATION: data-route and #hash links → nav()
    document.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-route]');
      if (btn){
        e.preventDefault();
        const route = btn.getAttribute('data-route');
        if (route) nav(route);
        return;
      }
      const a = e.target.closest('a[href^="#"]');
      if (a){
        const hash = a.getAttribute('href').slice(1);
        if (hash){
          e.preventDefault();
          nav(hash);
        }
      }
    });

    // First render
    render();
  }catch(err){ console.error('boot error', err); }
});

/* ========= Utilities ========= */
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'" :'&#39;'}[c])); }
/* DM Toolkit — World Map + DM Page + Dice + Live Sync */

let MAPS = [];
const IS_FILE = (location.protocol === 'file:');
const TRY_FETCH_JSON_INDEX = !IS_FILE;

const CHAR_LIB_KEY = 'tp_cc_characters';

const worldChan = (typeof BroadcastChannel !== 'undefined')
  ? new BroadcastChannel('world-sync')
  : { postMessage: ()=>{} };

// ---------- EnemyStore: shared localStorage + live sync ----------
window.EnemyStore = window.EnemyStore || (function () {
  const KEY = 'tp_dm_enemies';
  const VERSION = 1;

  const uid = () => (crypto?.randomUUID?.() || `e_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
  const now  = () => Date.now();

  function _readRaw() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { version: VERSION, items: [] }; }
    catch { return { version: VERSION, items: [] }; }
  }
  function _writeRaw(payload) {
    localStorage.setItem(KEY, JSON.stringify(payload));
    _broadcast();
  }

  function read() {
    const { items } = _readRaw();
    return Array.isArray(items) ? items : [];
  }
  function write(list) {
    const payload = { version: VERSION, items: list || [] };
    _writeRaw(payload);
  }
  function upsert(enemy) {
    const list = read();
    if (!enemy.id) enemy.id = uid();
    enemy.updatedAt = now();
    const idx = list.findIndex(e => e.id === enemy.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...enemy };
    else list.unshift(enemy);
    write(list);
    return enemy.id;
  }
  function remove(id) { write(read().filter(e => e.id !== id)); }

  let bc = null;
  try { bc = new BroadcastChannel('tp_dm_enemies_channel'); } catch {}
  const listeners = new Set();

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function _notify() { for (const fn of listeners) try { fn(read()); } catch {} }
  function _broadcast() { _notify(); if (bc) bc.postMessage({ type: 'updated' }); }

  if (bc) bc.onmessage = (evt) => { if (evt?.data?.type === 'updated') _notify(); };
  window.addEventListener('storage', (evt) => { if (evt.key === KEY) _notify(); });

  return { KEY, read, write, upsert, remove, subscribe };
})();

/* ========= Global State ========= */
const state = load() || {
  route: 'home',
  ui: { dmTab: 'party', environment: 'clear' },
  notes: '',
  dice: { log: [], last: null },
  worldSrc: null,
  worldIndex: 0,
  boardBg: null,
  mapIndex: 0,
  tokens: {
    pc:   [],
    npc:  [{id:'n1', name:'Elder Bran', cls:'NPC',   traits:['Civilian'], hp:[6,6]}],
    enemy:[{id:'e1', name:'Skeleton A', cls:'Enemy', traits:['Undead','Darkvision'], hp:[13,13]}],
  },
  selected: null,
  worldData: [],
};

function save(){ try { localStorage.setItem('tp_state_v26', JSON.stringify(state)); } catch(e) {} }
function load(){ try { return JSON.parse(localStorage.getItem('tp_state_v26')); }catch(e){ return null; } }

/* ========= Character Manager bridge ========= */
function listCharactersLib(){
  try { return JSON.parse(localStorage.getItem(CHAR_LIB_KEY)) || []; }
  catch { return []; }
}
function getPartyTokens(){
  const party = listCharactersLib().filter(c => !!c.inParty);
  return party.map(c => ({
    id: c.id,
    name: c.name || 'Unnamed',
    cls: 'PC',
    traits: (c.traits && Array.isArray(c.traits)) ? c.traits : [],
    badges: [ c.race && `Race: ${c.race}`, c.class && `Class: ${c.class}`, c.level && `Lvl ${c.level}` ].filter(Boolean),
    hp: Array.isArray(c.hp) && c.hp.length >= 2 ? c.hp : null,
  }));
}

/* ========= Enemies bridge (EnemyStore → DM token cards) ========= */
function mapDMEnemyToToken(e){
  return {
    id: e.id,
    name: e.name || '(Unnamed)',
    cls: 'Enemy',
    traits: Array.isArray(e.tags) ? e.tags : [],
    badges: [ e.type && `Type: ${e.type}`, e.cr && `CR ${e.cr}`, Number.isFinite(e.ac) && `AC ${e.ac}` ].filter(Boolean),
    hp: Number.isFinite(e.hp) ? [e.hp, e.hp] : null,
  };
}
function getEnemyTokens(){ return EnemyStore.read().map(mapDMEnemyToToken); }
let _unsubEnemyStore = null;
function initEnemyStoreSync(){
  try { _unsubEnemyStore?.(); } catch {}
  _unsubEnemyStore = EnemyStore.subscribe(() => {
    if (state.route === 'dm' && state.ui.dmTab === 'enemies') renderDmPage();
  });
}

/* ========= Universal NAV helpers ========= */
function nav(route){
  state.route = route;
  save();
  render();
}
function setDmTab(tab){
  state.ui.dmTab = tab;
  save();
  renderDmPage();
}

// EXPOSE for inline HTML handlers (fixes your landing/nav buttons)
window.nav = nav;
window.setDmTab = setDmTab;
window.openWorld = openWorld;
window.openWorldViewer = openWorldViewer;

/* ========= Storage listeners (PC Party + Enemies live-refresh) ========= */
window.addEventListener('storage', (e)=>{
  if(e.key === CHAR_LIB_KEY){
    if(state.route === 'dm' && state.ui.dmTab === 'party') renderDmPage();
  }
  if (window.EnemyStore && e.key === EnemyStore.KEY){
    if (state.route === 'dm' && state.ui.dmTab === 'enemies') renderDmPage();
  }
});

/* ========= Render root ========= */
function render(){
  // Try a flexible view switcher first: show element whose id == route
  const view = document.getElementById(state.route);
  if (view){
    // Hide a known set if present (won’t error if missing)
    ['home','dm','world','characters','logbook','enemy-builder']
      .forEach(id => { const el = document.getElementById(id); if (el) el.hidden = (el !== view); });
  } else {
    // Fallback to classic 3-panels
    const home = document.getElementById('home');
    const dm   = document.getElementById('dm');
    const world= document.getElementById('world');
    if(home)  home.hidden  = state.route !== 'home';
    if(dm)    dm.hidden    = state.route !== 'dm';
    if(world) world.hidden = state.route !== 'world';
  }

  if(state.route==='home') renderHome();
  if(state.route==='dm')   renderDmPage();
  if(state.route==='world')renderWorld();
}

function renderHome(){ /* landing is static; no-op */ }

/* ========= DM Page ========= */
function dmTabButton(id, label, active){
  return `<button class="btn ghost ${active?'active':''}" onclick="setDmTab('${id}')">${label}</button>`;
}
function tokenCard(kind, t){
  const hpBadge = (t.hp && Array.isArray(t.hp)) ? `<span class="tag" title="HP">${t.hp[0]} / ${t.hp[1]} HP</span>` : '';
  const traits = (t.traits||[]).map(x=>`<span class="tag">${x}</span>`).join('');
  const badges = (t.badges||[]).map(x=>`<span class="tag">${x}</span>`).join('');
  return `
    <div class="card token ${kind}">
      <div class="token-head">
        <div class="token-title">${t.name||'Unnamed'}</div>
        <div class="token-meta">${badges}${hpBadge}</div>
      </div>
      <div class="token-traits">${traits}</div>
    </div>`;
}
function renderDmPage(){
  const tabsEl = document.getElementById('dm-tabs');
  const bodyEl = document.getElementById('dm-body');
  if(!tabsEl || !bodyEl) return;

  const npcs   = state.tokens.npc||[];
  const tab    = state.ui.dmTab||'party';

  tabsEl.innerHTML = `
    ${dmTabButton('party','Party',tab==='party')}
    ${dmTabButton('npcs','NPCs',tab==='npcs')}
    ${dmTabButton('enemies','Enemies',tab==='enemies')}
    ${dmTabButton('notes','Notes',tab==='notes')}
    ${dmTabButton('tools','Tools',tab==='tools')}
  `;

  let body = '';

  if(tab==='party'){
    const pcs = getPartyTokens();
    body += `<div class="dm-grid3">${
      pcs.length
        ? pcs.map(p=>tokenCard('pc',p)).join('')
        : `<div class="panel" style="grid-column:1/-1; text-align:center; padding:16px;">
             <h3 style="margin:0 0 8px;">No party members yet</h3>
             <div class="small">Open <strong>Character Manager</strong> and tick “In Party”.</div>
           </div>`
    }</div>`;
  }

  if(tab==='npcs'){
    body+=`<div class="dm-grid3">${npcs.map(n=>tokenCard('npc',n)).join('')||'<div class="small">No NPCs yet.</div>'}</div>`;
  }

  if(tab==='enemies'){
    const enemiesTokens = getEnemyTokens();
    body+=`<div class="dm-grid3">${
      enemiesTokens.length
        ? enemiesTokens.map(e=>tokenCard('enemy', e)).join('')
        : '<div class="small">No Enemies yet. Open <strong>Enemy Builder</strong> to add some.</div>'
    }</div>`;
  }

  if(tab==='notes'){
    body+=`
      <div class="dm-section">
        <div class="dm-sec-head"><span>DM Notes</span></div>
        <textarea id="dm-notes" rows="12" style="width:100%">${escapeHtml(state.notes||'')}</textarea>
      </div>`;
  }

  if(tab==='tools'){
    const env = state.ui.environment;
    const effects = computeEnvironmentEffects();
    const mapButtons = (MAPS||[]).map((m,i)=>`
      <button type="button" class="map-pill ${state.worldIndex===i?'active':''}" onclick="openWorld(${i})">${escapeHtml(m.name||('Map '+(i+1)))}</button>
    `).join('');

    body+=`
      <div class="dm-section">
        <div class="dm-sec-head"><span>Environment</span></div>
        <div class="pillwrap">
          ${['clear','rain','fog','storm','snow'].map(k=>`
            <button class="pill ${env===k?'active':''}" onclick="setEnvironment('${k}')">${k[0].toUpperCase()+k.slice(1)}</button>
          `).join('')}
        </div>
        <div class="tiny muted">${effects.length?effects.join(' · '):'No special effects.'}</div>
      </div>

      <div class="dm-section">
        <div class="dm-sec-head"><span>World Maps</span></div>
        <div class="pillwrap">${mapButtons || '<span class="tiny muted">No maps loaded.</span>'}</div>
        <div style="margin-top:8px">
          <button class="btn" onclick="openWorldViewer()">Open World Viewer</button>
        </div>
      </div>

      <div class="dm-section">
        <div class="dm-sec-head"><span>Dice</span></div>
        <div class="pillwrap">
          ${[4,6,8,10,12,20,100].map(s=>`<button class="pill" onclick="roll(d${s})">d${s}</button>`).join('')}
          <button class="pill" onclick="rollAdv()">Adv</button>
          <button class="pill" onclick="rollDis()">Dis</button>
        </div>
        <div id="dice-log" class="dice-log"></div>
      </div>
    `;
  }

  bodyEl.innerHTML = body;
  if(tab==='tools') renderDice();
  if(tab==='notes'){
    const ta = document.getElementById('dm-notes');
    ta?.addEventListener('input', ()=>{ state.notes = ta.value; save(); });
  }
}

/* ========= Notes ========= */
function renderNotes(){
  const ta = document.getElementById('dm-notes');
  if(ta) ta.value = state.notes || '';
}

/* ========= Dice ========= */
const d4=(n=1)=>rollDie(4,n), d6=(n=1)=>rollDie(6,n), d8=(n=1)=>rollDie(8,n), d10=(n=1)=>rollDie(10,n), d12=(n=1)=>rollDie(12,n), d20=(n=1)=>rollDie(20,n), d100=(n=1)=>rollDie(100,n);
function rollDie(sides, count=1){ return Array.from({length:count}, ()=>1+Math.floor(Math.random()*sides)); }
function roll(die){
  const res = Array.isArray(die) ? die : [die()];
  const sum = res.reduce((a,b)=>a+b,0);
  const entry = { time: Date.now(), res, sum };
  state.dice.last = entry;
  state.dice.log.unshift(entry);
  if(state.dice.log.length > 50) state.dice.log.pop();
  save();
  renderDice();
}
function rollAdv(){ roll([d20(), d20()].sort((a,b)=>b-a)); }
function rollDis(){ roll([d20(), d20()].sort((a,b)=>a-b)); }

function renderDice(){
  const el = document.getElementById('dice-log'); if(!el) return;
  el.innerHTML = (state.dice.log||[]).slice(0,20).map(x=>`
    <div class="dice-row">
      <span class="muted tiny">${new Date(x.time).toLocaleTimeString()}</span>
      <span class="dice-res">${x.res.join(', ')}</span>
      <strong class="dice-sum">${x.sum}</strong>
    </div>
  `).join('') || '<div class="tiny muted">No rolls yet.</div>';
}

/* ========= Environment ========= */
function setEnvironment(k){ state.ui.environment = k; save(); renderDmPage(); }
function computeEnvironmentEffects(){
  const k = state.ui.environment;
  if(k==='rain') return ['+2 DC to Perception (hearing)', 'Open flames may go out'];
  if(k==='fog')  return ['Heavily obscured > 30 ft', 'Disadvantage on Perception (sight)'];
  if(k==='storm')return ['Disadvantage on ranged attacks at long range', 'Loud thunder: +5 DC to hearing'];
  if(k==='snow') return ['Difficult terrain (deep snow)', 'Trackable footprints'];
  return [];
}

/* ========= World ========= */
async function reloadMaps(){
  try{
    if(TRY_FETCH_JSON_INDEX){
      const res = await fetch('maps.json', { cache: 'no-store' });
      MAPS = res.ok ? await res.json() : [];
    } else { MAPS = []; }
  }catch(e){ MAPS = []; }
}
function openWorld(index=0){
  state.worldIndex = index|0;
  state.worldSrc = (MAPS[index] && MAPS[index].src) || state.worldSrc || 'map.svg';
  save();
  renderWorld();
}
function setWorldUrl(){
  const inp = document.getElementById('world-url');
  const v = (inp?.value||'').trim();
  if(!v) return;
  state.worldSrc = v;
  save();
  renderWorld();
}
let worldViewerWin = null;
function openWorldViewer(){
  if(worldViewerWin && !worldViewerWin.closed){
    worldViewerWin.focus();
    syncWorldViewer();
    worldChan.postMessage({type:'ping'});
    return;
  }
  worldViewerWin = window.open('', 'WorldViewer', 'width=1200,height=800');
  if(!worldViewerWin) return;

  const html = `<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>World Viewer</title>
  <link href="https://fonts.googleapis.com/css2?family=Arvo:wght@400;700&display=swap" rel="stylesheet">
  <style>
    html,body{height:100%;margin:0;background:#000e1b;color:#e9ecf1;font-family:Arvo,system-ui,-apple-system,"Segoe UI",Roboto,Arimo,Helvetica,Arial,sans-serif}
    .wrap{height:100%;display:grid;place-items:center;padding:10px}
    .frame{width:min(1200px,95vw);height:min(900px,90vh);background:#0a1420;border:1px solid #203246;border-radius:12px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.5)}
    iframe{width:100%;height:100%;border:0;background:#08101a}
  </style></head><body>
  <main class="wrap">
    <div class="frame"><iframe id="world-iframe" src=""></iframe></div>
  </main>
  <script>
    const chan = new BroadcastChannel('world-sync');
    chan.onmessage = (e)=>{
      if(e?.data?.type==='sync'){
        const { src } = e.data;
        const ifr = document.getElementById('world-iframe');
        if(ifr && ifr.src !== src){ ifr.src = src; }
      }
    };
  </script>
  </body></html>`;
  worldViewerWin.document.open(); worldViewerWin.document.write(html); worldViewerWin.document.close();
  syncWorldViewer();
}
function syncWorldViewer(){
  const src = state.worldSrc || 'map.svg';
  try{ worldChan.postMessage({type:'sync', src}); }catch(e){}
}
function renderWorld(){
  const iframe = document.getElementById('world-iframe');
  const urlInp = document.getElementById('world-url');
  if(urlInp) urlInp.value = state.worldSrc || '';
  if(iframe) iframe.src = state.worldSrc || 'map.svg';
}

/* ========= Boot ========= */
document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    await reloadMaps();
    renderNotes();
    renderDice();
    initEnemyStoreSync();

    // Keyboard support for tiles
    document.querySelectorAll('.tile[tabindex]')
      .forEach(tile => tile.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tile.click(); }
      }));

    // CLICK DELEGATION: data-route and #hash links → nav()
    document.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-route]');
      if (btn){
        e.preventDefault();
        const route = btn.getAttribute('data-route');
        if (route) nav(route);
        return;
      }
      const a = e.target.closest('a[href^="#"]');
      if (a){
        const hash = a.getAttribute('href').slice(1);
        if (hash){
          e.preventDefault();
          nav(hash);
        }
      }
    });

    // First render
    render();
  }catch(err){ console.error('boot error', err); }
});

/* ========= Utilities ========= */
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'" :'&#39;'}[c])); }
