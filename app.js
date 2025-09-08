/* DM Toolkit — World Map + DM Page + Dice + Live Sync
   Theme (legacy note): Lime #d6ed17 (actions), Midnight #000e1b (backgrounds)
*/

let MAPS = [];
const IS_FILE = (location.protocol === 'file:');         // Detect local file usage
const TRY_FETCH_JSON_INDEX = !IS_FILE;                    // Skip JSON fetch on file:// to avoid CORS

// Character Manager localStorage key (shared with iframe)
const CHAR_LIB_KEY = 'tp_cc_characters';

// Broadcast channel (for pop-out world viewer sync)
const worldChan = (typeof BroadcastChannel !== 'undefined')
  ? new BroadcastChannel('world-sync')
  : { postMessage: ()=>{} };
// Auto-refresh DM Enemies when Enemy Builder updates the library key
window.addEventListener('storage', (e) => {
  const k = e.key || '';
  if (k === ENEMY_LIB_KEY || ENEMY_CANDIDATE_KEYS.includes(k) || /enemy/i.test(k)) {
    // learn the actual key if it just appeared/changed
    if (k) ENEMY_LIB_KEY = k;
    if (state.route === 'dm' && state.ui.dmTab === 'enemies') {
      renderDmPage();
    }
  }
});

// Optional cross-tab/channel sync (Enemy Builder can broadcast after save)
const tpSyncChan = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('tp_sync') : null;
if (tpSyncChan){
  tpSyncChan.onmessage = (m) => {
    if (m?.data?.type === 'enemies-updated') {
      if (m.data.key) ENEMY_LIB_KEY = m.data.key;
      if (state.route === 'dm' && state.ui.dmTab === 'enemies') renderDmPage();
    }
  };
}

/* ========= App State ========= */
const state = load() || {
  route: 'home',

  // World / Map selection
  worldSrc: null,
  worldIndex: 0,

  // Legacy board compatibility
  boardBg: null,
  mapIndex: 0,

  // DM tokens (NPCs/Enemies keep using internal state; PCs now come from Character Manager)
  tokens: {
    pc:   [], // PCs now sourced from Character Manager → inParty
    npc:   [{id:'n1', name:'Elder Bran', cls:'NPC',   traits:['Civilian'], hp:[6,6]}],
    enemy: [{id:'e1', name:'Skeleton A', cls:'Enemy', traits:['Undead','Darkvision'], hp:[13,13]}],
  },
  selected: null,
  notes: '',
  appNotes: '',
  ui: { dmTab:'party', environment:null, worldMode:'fit' }, // worldMode: 'fit' | 'actual'
};

function save(){
  localStorage.setItem('tp_state_v26', JSON.stringify(state));
  try { worldChan.postMessage({type:'world', src: state.worldSrc || ''}); } catch(e){}
}
function load(){
  try { return JSON.parse(localStorage.getItem('tp_state_v26')); }catch(e){ return null; }
}

/* ========= Characters library bridge (from Character Manager) ========= */
function listCharactersLib(){
  try { return JSON.parse(localStorage.getItem(CHAR_LIB_KEY)) || []; }
  catch { return []; }
}
function getPartyTokens(){
  // Map Character Manager models → DM token model
  const party = listCharactersLib().filter(c => !!c.inParty);
  return party.map(c => ({
    id: c.id,
    name: c.name || 'Unnamed',
    cls: c.class || '—',
    traits: Array.isArray(c.traits) ? c.traits : [],
    badges: [c.background, c.species].filter(Boolean),
    hp: Array.isArray(c.hp) && c.hp.length >= 2 ? c.hp : null,
  }));
}
/* ========= Enemies library bridge (from Enemy Builder) ========= */
/* Auto-detects common keys; falls back gracefully if none found. */
const ENEMY_CANDIDATE_KEYS = ['tp_enemies','tp_enemy_library','tp_cc_enemies','tp_enemies_v2'];

function detectEnemyKey(){
  try{
    const keys = Object.keys(localStorage);
    // 1) Prefer known names in priority order
    for(const k of ENEMY_CANDIDATE_KEYS){ if(keys.includes(k)) return k; }
    // 2) Heuristic: any key containing "enemy" that parses to an array
    for(const k of keys){
      if(/enemy/i.test(k)){
        try{ const v = JSON.parse(localStorage.getItem(k)); if(Array.isArray(v)) return k; }catch{}
      }
    }
  }catch{}
  return null;
}

let ENEMY_LIB_KEY = detectEnemyKey();

function listEnemiesLib(){
  try{
    if(!ENEMY_LIB_KEY) ENEMY_LIB_KEY = detectEnemyKey();
    const raw = ENEMY_LIB_KEY ? JSON.parse(localStorage.getItem(ENEMY_LIB_KEY) || '[]') : [];
    return Array.isArray(raw) ? raw : [];
  }catch{ return []; }
}

/* Normalize various enemy shapes → DM token model used by tokenCard(...) */
function getEnemyTokens(){
  const lib = listEnemiesLib();
  return lib.map((e, i) => {
    const id    = e.id || e.slug || e.key || `e${i+1}`;
    const name  = e.name || e.title || 'Enemy';
    const cls   = e.cls || e.class || e.type || 'Enemy';

    // HP normalization: accept [cur,max], number, or {current,max}
    let hp = null;
    if (Array.isArray(e.hp) && e.hp.length >= 2) {
      hp = [Number(e.hp[0])||0, Number(e.hp[1])||0];
    } else if (typeof e.hp === 'number') {
      hp = [e.hp, e.hp];
    } else if (e.hp && (typeof e.hp === 'object')) {
      const cur = Number(e.hp.current ?? e.hp.cur ?? e.hp.value ?? 0) || 0;
      const max = Number(e.hp.max     ?? e.hp.total ?? e.hp.limit ?? cur) || cur;
      hp = [cur, max];
    } else if (typeof e.hitPoints === 'number') {
      hp = [e.hitPoints, e.hitPoints];
    }

    const traits = Array.isArray(e.traits) ? e.traits
                 : Array.isArray(e.tags)   ? e.tags
                 : [];
    const badges = [e.cr ?? e.challenge ?? e.rank, e.size, e.alignment].filter(Boolean);

    return { id, name, cls, traits, badges, hp };
  });
}

/* Optional debug helper (run in console): window.dumpEnemyLib() */
window.dumpEnemyLib = () => ({ key: ENEMY_LIB_KEY, sample: (listEnemiesLib()[0]||null) });

// Auto-refresh DM Party when Character Manager updates the library
window.addEventListener('storage', (e)=>{
  if(e.key === CHAR_LIB_KEY){
    if(state.route === 'dm' && state.ui.dmTab === 'party'){
      renderDmPage();
    }
  }
});

/* ========= Routing & View Transitions ========= */
function nav(route){
  state.route = route; save();
  const views = ['home','world','dice','notes','dm','logbook','characters'];
  views.forEach(v=>{
    const main = document.getElementById('view-'+v);
    const btn  = document.getElementById('nav-'+v);
    if(!main || !btn){
      if(main){
        main.classList.toggle('hidden', v!==route);
        if(v===route){
          main.classList.add('view-anim');
          setTimeout(()=>main.classList.remove('view-anim'), 260);
        }
      }
      return;
    }
    if(v===route){
      main.classList.remove('hidden');
      btn.classList.add('active');
      main.classList.add('view-anim');
      setTimeout(()=>main.classList.remove('view-anim'), 260);
    }else{
      main.classList.add('hidden');
      btn.classList.remove('active');
    }
  });

  // Accessibility / focus mgmt for the iframe section
  if(route === 'characters'){
    document.getElementById('characters-frame')?.focus();
  }else{
    document.getElementById('characters-frame')?.blur();
  }

  render();
}

function render(){
  if(state.route==='world'){ renderWorld(); renderWorldMapList(); }
  if(state.route==='dice'){ renderDice(); }
  if(state.route==='notes'){ renderNotes(); }
  if(state.route==='dm'){ renderDmPage(); }
}

/* ========= Path helpers ========= */
function prettyNameFromPath(p){
  const base = String(p).split(/[\\/]/).pop() || '';
  const noExt = base.replace(/\.[a-z0-9]+$/i,'');
  return noExt.replace(/[_\-]+/g,' ').trim() || base;
}
function normalizeMapSrc(p){
  if(!p) return '';
  p = String(p).replace(/\\/g, '/');
  if(/^https?:\/\//i.test(p) || p.startsWith('/')) return p;
  if(p.startsWith('MapsKit/')) return p;
  if(p.startsWith('assets/')) return 'MapsKit/' + p;
  return 'MapsKit/assets/maps/' + p;
}
function normalizeMapsList(list){
  if(!Array.isArray(list)) return [];
  const out = list.map(m => {
    const src = normalizeMapSrc(m?.src || m || '');
    const name = m?.name || prettyNameFromPath(src);
    return { ...m, src, name };
  });
  out.sort((a,b)=> String(a.name||'').localeCompare(String(b.name||'')));
  return out;
}

/* ========= Script loader for file:// fallback ========= */
function loadScript(src){
  return new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* ========= Maps loading ========= */
async function reloadMaps(){
  const jsonUrl = 'MapsKit/assets/maps/index.json';
  const jsUrl   = 'MapsKit/assets/maps/index.js';

  if (TRY_FETCH_JSON_INDEX){
    try{
      const res = await fetch(jsonUrl, { cache: 'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      const raw = await res.json();
      MAPS = normalizeMapsList(raw);
    }catch(err){
      console.warn('[maps] JSON fetch failed; trying JS fallback…', err);
      try{
        await loadScript(jsUrl);
        if(Array.isArray(window.__MAPS__)){
          MAPS = normalizeMapsList(window.__MAPS__);
        }else{
          console.error('[maps] JS fallback missing or invalid:', jsUrl);
          MAPS = [];
        }
      }catch(e){
        console.error('[maps] Failed to load fallback JS:', e);
        MAPS = [];
      }
    }
  } else {
    // file:// — go straight to JS fallback to avoid CORS
    try{
      await loadScript(jsUrl);
      if(Array.isArray(window.__MAPS__)){
        MAPS = normalizeMapsList(window.__MAPS__);
      }else{
        console.error('[maps] JS fallback missing or invalid:', jsUrl);
        MAPS = [];
      }
    }catch(e){
      console.error('[maps] Failed to load fallback JS:', e);
      MAPS = [];
    }
  }

  if(!state.worldSrc && MAPS[0]){
    state.worldIndex = 0;
    state.worldSrc   = MAPS[0].src;
    state.mapIndex   = 0;
    state.boardBg    = MAPS[0].src;
    save();
  }

  renderWorld();
  renderWorldMapList();
  syncWorldViewer();
}

/* ========= World viewer (in-page) ========= */
function renderWorld(){
  const mount = document.getElementById('world'); if(!mount) return;
  mount.innerHTML = '';

  const stage = document.createElement('div');
  stage.className = 'world-stage ' + (state.ui.worldMode==='actual' ? 'actual' : 'fit');

  const img = document.createElement('img');
  img.className = 'world-img';
  img.alt = 'World / Region';
  img.src = state.worldSrc || '';

  // Double-click to toggle Fit/Actual
  img.addEventListener('dblclick', ()=>{
    if(stage.classList.contains('fit')){
      stage.classList.remove('fit'); stage.classList.add('actual');
      state.ui.worldMode = 'actual';
    }else{
      stage.classList.remove('actual'); stage.classList.add('fit');
      state.ui.worldMode = 'fit';
    }
    save();
  });

  stage.appendChild(img);
  mount.appendChild(stage);
}
function getWorldStage(){ return document.querySelector('#world .world-stage'); }

function renderWorldMapList(){
  const wrap = document.getElementById('world-map-list'); if(!wrap) return;
  wrap.innerHTML = (MAPS||[]).map((m,i)=>`
    <button type="button" class="map-pill ${state.worldIndex===i?'active':''}" onclick="setWorldMapIndex(${i})">
      ${escapeHtml(m.name || m.src.split('/').pop())}
    </button>
  `).join('') || '<div class="small">No maps found. Rebuild MapsKit/assets/maps/index.json or index.js.</div>';
}
function setWorldMapIndex(idx){
  if(!MAPS[idx]) return;
  state.worldIndex = idx;
  state.worldSrc   = MAPS[idx].src;
  state.mapIndex   = idx;
  state.boardBg    = MAPS[idx].src;
  save();
  renderWorld();
  renderWorldMapList();
  syncWorldViewer();
}

function toggleWorldFullscreen(){
  const stage = getWorldStage(); if(!stage) return;
  const el = stage;
  const enter = !document.fullscreenElement;
  if(enter){
    stage.classList.remove('fit'); stage.classList.add('actual');
    el.requestFullscreen?.();
  }else{
    document.exitFullscreen?.();
  }
}
document.addEventListener('fullscreenchange', ()=>{
  const stage = getWorldStage();
  if(!stage) return;
  if(!document.fullscreenElement){
    stage.classList.remove('actual','fit');
    stage.classList.add(state.ui.worldMode==='actual' ? 'actual' : 'fit');
  }
});

/* ========= Pop-out + live sync ========= */
let worldViewerWin = null;
worldChan.onmessage = (e)=>{ if(e?.data?.type==='ping'){ try{ worldChan.postMessage({type:'world', src: state.worldSrc || ''}); }catch(ex){} } };

function syncWorldViewer(){
  try{
    worldChan.postMessage({type:'world', src: state.worldSrc || ''});
    if(worldViewerWin && !worldViewerWin.closed){
      worldViewerWin.postMessage({type:'world', src: state.worldSrc || ''}, '*');
    }
  }catch(e){}
}

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
    html,body{height:100%;margin:0;background:#000e1b;color:#e9ecf1;font:14px "Arvo", Georgia, serif}
    .topbar{position:fixed;top:10px;right:10px;left:10px;display:flex;gap:6px;justify-content:flex-end;z-index:10}
    .btn{appearance:none;background:#d6ed17;border:1px solid transparent;color:#000e1b;padding:6px 10px;border-radius:10px;cursor:pointer;transition:.15s;font-family:"Arvo", Georgia, serif;min-height:40px}
    .btn:hover{background:#c6de10}

    .stage{position:fixed;inset:0;top:50px;overflow:auto;background:#000e1b}
    .canvas{min-width:100%;min-height:100%;display:grid;place-items:center}
    .img{display:block;max-width:100%;height:auto;transform-origin:center center;transition:transform .12s ease-out}

    .fit .img{max-width:100%;max-height:none;width:auto;height:auto}
    .actual .img{max-width:none;max-height:none;width:auto;height:auto}

    :fullscreen .stage{width:100vw;height:100vh;top:0}
  </style></head><body>
    <div class="topbar">
      <button class="btn" id="btnFit">Fit</button>
      <button class="btn" id="btnActual">Actual</button>
      <button class="btn" id="btnZoomIn">+</button>
      <button class="btn" id="btnZoomOut">−</button>
      <button class="btn" id="btnReset">Reset</button>
      <button class="btn" id="btnFull">Full</button>
    </div>

    <div id="stage" class="stage fit">
      <div id="canvas" class="canvas">
        <img id="img" class="img" alt="">
      </div>
    </div>

    <script>
      const stage  = document.getElementById('stage');
      const img    = document.getElementById('img');
      let scale = 1;

      function setMode(m){
        stage.classList.toggle('fit', m==='fit');
        stage.classList.toggle('actual', m==='actual');
      }
      function applyScale(){
        img.style.transform = 'scale(' + scale.toFixed(4) + ')';
      }
      function reset(){
        scale = 1;
        applyScale();
        setMode('fit');
        requestAnimationFrame(()=>{ stage.scrollLeft = 0; stage.scrollTop = 0; });
      }

      document.getElementById('btnFit').onclick    = ()=>{ setMode('fit');  if(scale!==1){ scale=1; applyScale(); } };
      document.getElementById('btnActual').onclick = ()=>{ setMode('actual'); };
      document.getElementById('btnZoomIn').onclick = ()=>{ scale = Math.min(6, scale*1.2); applyScale(); };
      document.getElementById('btnZoomOut').onclick= ()=>{ scale = Math.max(0.2, scale/1.2); applyScale(); };
      document.getElementById('btnReset').onclick  = reset;

      document.getElementById('btnFull').onclick = ()=>{
        if(!document.fullscreenElement){ stage.requestFullscreen?.(); } else { document.exitFullscreen?.(); }
      };

      window.addEventListener('wheel', (ev)=>{
        if(ev.ctrlKey || ev.metaKey){
          ev.preventDefault();
          const dir = ev.deltaY > 0 ? -1 : 1;
          scale = Math.min(6, Math.max(0.2, scale * (dir>0 ? 1.1 : 1/1.1)));
          applyScale();
        }
      }, { passive:false });

      const chan = new BroadcastChannel('world-sync');
      chan.onmessage = (e)=>{ if(e?.data?.type==='world'){ img.src = e.data.src || ''; } };
      chan.postMessage({type:'ping'});
      addEventListener('message', (e)=>{ if(e?.data?.type==='world' && e.data.src!==undefined){ img.src = e.data.src || ''; } });
    <\/script>
  </body></html>`;

  worldViewerWin.document.open(); worldViewerWin.document.write(html); worldViewerWin.document.close();
  syncWorldViewer();
  worldChan.postMessage({type:'ping'});
}

/* ========= Dice (main page) ========= */
let diceSelection = [];
let lastRollDisplayed = false;

function startRollAnimation(){
  const hero = document.querySelector('.dice-hero');
  hero?.classList.remove('settle');
  hero?.classList.add('rolling');
  document.querySelector('.roll-total')?.classList.add('rolling');
}
function finishRollAnimation(){
  const hero = document.querySelector('.dice-hero');
  if(hero){
    hero.classList.remove('rolling');
    const rx = (Math.random()*60 - 30)|0;
    const ry = (Math.random()*60 - 30)|0;
    const rz = (Math.random()*360)|0;
    hero.style.setProperty('--end-rx', rx + 'deg');
    hero.style.setProperty('--end-ry', ry + 'deg');
    hero.style.setProperty('--end-rz', rz + 'deg');
    hero.classList.remove('settle');
    hero.offsetHeight;
    hero.classList.add('settle');
    document.querySelector('.roll-total')?.classList.remove('rolling');
    setTimeout(()=>hero.classList.remove('settle'), 500);
  }
}
function clearRollOutput(){ updateRollOutput('—', 'Add dice to roll…'); }

function renderDice(){
  const btns = document.getElementById('dice-buttons');
  if(btns){
    btns.innerHTML = [4,6,8,10,12,20].map(n => `
  <button class="die-btn" onclick="addDie(${n})" aria-label="d${n}">
    <span class="die-icon">d${n}</span>
  </button>`).join('');
  }
  updateDiceSelectionText();
  clearRollOutput();
  lastRollDisplayed = false;
}
function addDie(n){
  if(lastRollDisplayed){
    diceSelection = [];
    clearRollOutput();
    lastRollDisplayed = false;
  }
  diceSelection.push(n);
  updateDiceSelectionText();
}
function clearDice(){
  diceSelection = [];
  updateDiceSelectionText();
  clearRollOutput();
  lastRollDisplayed = false;
}
function updateDiceSelectionText(){
  const sel = document.getElementById('dice-selection');
  if(!sel) return;
  if(!diceSelection.length){ sel.textContent = 'No dice selected'; return; }
  const map = {};
  diceSelection.forEach(n=>{ map[n]=(map[n]||0)+1; });
  const parts = Object.keys(map).sort((a,b)=>+a-+b).map(k=>`${map[k]}d${k}`);
  sel.textContent = parts.join(' + ');
}
function rollAll(){
  if(!diceSelection.length){ clearRollOutput(); return; }
  startRollAnimation();

  const duration = 900, steps = 18;
  const stepTime = Math.max(40, Math.floor(duration/steps));
  const totalEl = document.querySelector('.roll-total');
  const breakdownEl = document.querySelector('.roll-breakdown');

  let t = 0;
  const scramble = () => {
    if(t >= duration){
      const rolls = diceSelection.map(n => 1 + Math.floor(Math.random()*n));
      const total = rolls.reduce((a,b)=>a+b,0);
      updateRollOutput(String(total), rolls.join(' + '));
      finishRollAnimation();
      diceSelection = [];
      updateDiceSelectionText();
      lastRollDisplayed = true;
      return;
    }
    const temp = diceSelection.map(n => 1 + Math.floor(Math.random()*n));
    const tempTotal = temp.reduce((a,b)=>a+b,0);
    if(totalEl) totalEl.textContent = tempTotal;
    if(breakdownEl) breakdownEl.textContent = temp.join(' + ');
    t += stepTime;
    setTimeout(scramble, stepTime);
  };
  scramble();
}
function updateRollOutput(total, breakdown){
  const out = document.getElementById('dice-output');
  if(!out) return;
  out.querySelector('.roll-total').textContent = total;
  out.querySelector('.roll-breakdown').textContent = breakdown;
}

/* ========= Notes ========= */
function renderNotes(){
  const ta = document.getElementById('app-notes'); if(!ta) return;
  ta.value = state.appNotes || '';
  ta.oninput = ()=>{ state.appNotes = ta.value; save(); };
}

/* ========= Environment rules & helpers ========= */
const ENVIRONMENTS = ['Forest','Cavern','Open Field','Urban','Swamp','Desert'];
const ENV_RULES = {
  Forest:      { advIfClass:['Rogue'],                        disIfTrait:['Heavy Armor'], advIfTrait:['Stealthy'] },
  Cavern:      { advIfTrait:['Darkvision','Burrower','Undead'], disIfTrait:['Stealthy'] },
  'Open Field':{ advIfTrait:['Mounted'],                      disIfTrait:['Stealthy'] },
  Urban:       { advIfTrait:['Stealthy'],                     disIfClass:['Enemy'] },
  Swamp:       { advIfTrait:['Amphibious'],                   disIfTrait:['Heavy Armor'] },
  Desert:      { advIfTrait:['Survivalist'],                  disIfTrait:['Heavy Armor'] }
};

function dmTabButton(id,label,active){ return `<button class="dm-tab ${active?'active':''}" onclick="setDmTab('${id}')">${label}</button>`; }
function setDmTab(id){ state.ui.dmTab=id; save(); renderDmPage(); }

function findToken(kind,id){ return (state.tokens[kind]||[]).find(t=>t.id===id); }

/* Evaluate current environment for a specific token; return reasons */
function evalEnvironmentForToken(t){
  const env = state.ui.environment;
  const out = { env, adv:false, dis:false, reasonsAdv:[], reasonsDis:[] };
  if(!env){ return out; }
  const rule = ENV_RULES[env] || {};
  const traits = Array.isArray(t.traits) ? t.traits : [];

  // Class-based
  if((rule.advIfClass||[]).includes(t.cls)) out.reasonsAdv.push(`${env}: ${t.cls} class`);
  if((rule.disIfClass||[]).includes(t.cls)) out.reasonsDis.push(`${env}: ${t.cls} class`);

  // Trait-based
  (rule.advIfTrait||[]).forEach(tr => { if(traits.includes(tr)) out.reasonsAdv.push(`${env}: ${tr} trait`); });
  (rule.disIfTrait||[]).forEach(tr => { if(traits.includes(tr)) out.reasonsDis.push(`${env}: ${tr} trait`); });

  out.adv = out.reasonsAdv.length>0;
  out.dis = out.reasonsDis.length>0;
  return out;
}

/* Build a very clear explanation string */
function buildAdvDisMessage(t, mode){
  const envInfo = evalEnvironmentForToken(t);
  const lines = [];

  lines.push(`${t.name} (${t.cls})`);
  lines.push(`Environment: ${envInfo.env || '— none selected —'}`);

  // Why lines
  if(envInfo.reasonsAdv.length){ lines.push(`Advantage from: ${envInfo.reasonsAdv.join(', ')}`); }
  else{ lines.push(`Advantage from environment: none`); }
  if(envInfo.reasonsDis.length){ lines.push(`Disadvantage from: ${envInfo.reasonsDis.join(', ')}`); }
  else{ lines.push(`Disadvantage from environment: none`); }

  // Primer
  if(mode==='adv'){
    lines.push('');
    lines.push('Quick primer — Advantage');
    lines.push('- Roll two d20; keep the HIGHER result.');
    lines.push('- Add your normal modifiers.');
    lines.push('- Multiple sources do not stack.');
  }else{
    lines.push('');
    lines.push('Quick primer — Disadvantage');
    lines.push('- Roll two d20; keep the LOWER result.');
    lines.push('- Add your normal modifiers.');
    lines.push('- Multiple sources do not stack.');
  }

  lines.push('');
  lines.push('If you have both, they cancel (roll a single d20).');

  return lines.join('\n');
}

/* Token cards & actions */
function tokenCard(kind,t){
  const sel = state.selected && state.selected.kind===kind && state.selected.id===t.id;
  const hpBadge = (Array.isArray(t.hp) && t.hp.length>=2)
    ? `<span class="badge">HP ${t.hp[0]}/${t.hp[1]}</span>`
    : '';
  const extra = []
    .concat(Array.isArray(t.badges)?t.badges:[])
    .concat(Array.isArray(t.traits)?t.traits:[]);
  return `
    <div class="dm-character-box">
      <div class="dm-card ${sel?'selected':''}" onclick="selectFromPanel('${kind}','${t.id}')">
        <div class="avatar"><img src="assets/class_icons/${escapeHtml(t.cls)}.svg" alt=""></div>
        <div class="name">${escapeHtml(t.name)}</div>
        <div class="badges">
          <span class="badge">${escapeHtml(t.cls)}</span>
          ${hpBadge}
          ${extra.map(x=>`<span class="badge">${escapeHtml(x)}</span>`).join('')}
        </div>
      </div>
      <div class="dm-actions">
        <button class="dm-title-btn short adv" title="Advantage" onclick="quickAdvFor('${kind}','${t.id}')">A</button>
        <button class="dm-title-btn short dis" title="Disadvantage" onclick="quickDisFor('${kind}','${t.id}')">D</button>
      </div>
    </div>`;
}
function selectFromPanel(kind,id){ state.selected = {kind,id}; save(); renderDmPage(); }
function setEnvironment(env){ state.ui.environment = env; save(); renderDmPage(); }

/* Show detailed toasts */
function quickAdvFor(kind,id){
  const t = (kind==='pc' ? getPartyTokens().find(x=>x.id===id) : findToken(kind,id));
  if(!t) return;
  const msg = buildAdvDisMessage(t,'adv');
  showToast('Advantage', msg, {duration:7000});
}
function quickDisFor(kind,id){
  const t = (kind==='pc' ? getPartyTokens().find(x=>x.id===id) : findToken(kind,id));
  if(!t) return;
  const msg = buildAdvDisMessage(t,'dis');
  showToast('Disadvantage', msg, {duration:7000});
}

/* Compute summary lines for Tools tab list */
function computeEnvironmentEffects(){
  const env = state.ui.environment;
  if(!env) return { lines:[] };
  const rule = ENV_RULES[env] || {};
  const aClass = new Set(rule.advIfClass || []);
  const dClass = new Set(rule.disIfClass || []);
  const aTrait = new Set(rule.advIfTrait || []);
  const dTrait = new Set(rule.disIfTrait || []);
  const allPcs = getPartyTokens().map(t=>({...t, kind:'pc'}));
  const libEn = getEnemyTokens();
const others = []
  .concat((state.tokens.npc||[]).map(t => ({...t, kind:'npc'})))
  .concat((libEn.length ? libEn : (state.tokens.enemy||[])).map(t => ({...t, kind:'enemy'})));
  const all = allPcs.concat(others);

  const lines = all.map(t=>{
    const cls = t.cls || '';
    const traits = Array.isArray(t.traits) ? t.traits : [];
    const adv = aClass.has(cls) || traits.some(tr => aTrait.has(tr));
    const dis = dClass.has(cls) || traits.some(tr => dTrait.has(tr));
    if(adv && !dis) return `${t.name} (${cls}): Advantage`;
    if(dis && !adv) return `${t.name} (${cls}): Disadvantage`;
    if(adv && dis)  return `${t.name} (${cls}): Mixed (DM rule)`;
    return `${t.name} (${cls}): —`;
  });
  return { lines };
}

function renderDmPage(){
  const tabsEl = document.getElementById('dm-tabs');
  const bodyEl = document.getElementById('dm-body');
  if(!tabsEl || !bodyEl) return;

const npcs     = state.tokens.npc || [];
const libEnems = getEnemyTokens();                 // ← from Enemy Builder
const enemies  = libEnems.length ? libEnems : (state.tokens.enemy || []); // fallback to internal
const tab      = state.ui.dmTab || 'party';

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
             <div class="small">Open <strong>Character Manager</strong> and tick “In Party” for the characters you want here.</div>
             <div style="margin-top:10px;"><button class="btn tiny" onclick="nav('characters')">Open Character Manager</button></div>
           </div>`
    }</div>`;
  }

  if(tab==='npcs'){ body+=`<div class="dm-grid3">${npcs.map(n=>tokenCard('npc',n)).join('')||'<div class="small">No NPCs yet.</div>'}</div>`; }
  if(tab==='enemies'){ body+=`<div class="dm-grid3">${enemies.map(e=>tokenCard('enemy',e)).join('')||'<div class="small">No Enemies yet.</div>'}</div>`; }

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
      <button type="button" class="map-pill ${state.worldIndex===i?'active':''}" onclick="setWorldMapIndex(${i})">${escapeHtml(m.name || (m.src.split('/').pop()))}</button>
    `).join('');

    body+=`
      <div class="dm-section">
        <div class="dm-sec-head"><span>Environment / Terrain</span></div>
        <div class="env-grid">
          ${ENVIRONMENTS.map(e=>`<button type="button" class="env-pill ${env===e?'active':''}" onclick="setEnvironment('${e}')">${e}</button>`).join('')}
        </div>
        <div class="dm-detail" style="margin-top:8px">
          ${env ? `<strong>Selected:</strong> ${env}` : 'Select an environment to see advantages/disadvantages.'}
          ${effects.lines.length ? `<div style="margin-top:6px">${effects.lines.map(l=>`• ${escapeHtml(l)}`).join('<br>')}</div>` : ''}
        </div>
      </div>

      <div class="dm-section" style="margin-top:10px">
        <div class="dm-sec-head"><span>Maps (World)</span></div>
        <div class="map-list">
          ${mapButtons || '<div class="small">No maps yet. Add files to MapsKit/assets/maps and rebuild index.json/index.js.</div>'}
        </div>
        <div class="dm-detail" style="margin-top:8px">
          Current: ${escapeHtml(state.worldSrc || 'None')}
          <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn tiny" onclick="openWorldViewer()">Open Pop-out</button>
            <button class="btn tiny" onclick="renderWorld()">Refresh</button>
          </div>
        </div>
      </div>

      <div class="dm-section" style="margin-top:10px">
        <div class="dm-sec-head"><span>Quick Dice</span></div>

        <div class="quick-dice-row">
          ${[4,6,8,10,12,20].map(n => `
  <button class="quick-die-btn" onclick="dmAddDie(${n})" aria-label="d${n}">
    <span class="die-icon">d${n}</span>
  </button>`).join('')}
        </div>

        <div class="dm-quick-bar" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px">
          <div id="dm-dice-selection" class="small">No dice selected</div>
          <button class="btn btn-xl" onclick="dmRollAll()">Roll</button>
          <button class="btn btn-xl" onclick="dmClearDice()">Clear</button>
        </div>

        <div id="dm-dice-output" class="roll-output" style="margin-top:8px">
          <div class="dice-hero" style="color:#d6ed17">
            <img src="assets/icons/d20-lime.svg" alt="d20" />
          </div>
          <div class="roll-card">
            <div class="roll-total">—</div>
            <div class="roll-breakdown">Add dice to roll…</div>
          </div>
        </div>
      </div>`;
  }

  bodyEl.innerHTML = body;

  const notesEl=document.getElementById('dm-notes');
  if(notesEl){ notesEl.addEventListener('input', ()=>{ state.notes=notesEl.value; save(); }); }
  if(tab==='tools'){ dmInitQuickDice(); }
}

/* ========= DM Quick Dice ========= */
let dmDiceSelection = [];
let dmLastRollDisplayed = false;

function dmInitQuickDice(){
  dmDiceSelection = [];
  dmLastRollDisplayed = false;
  dmUpdateDiceSelectionText();
  dmUpdateRollOutput('—','Add dice to roll…');
}
function dmAddDie(n){
  if(dmLastRollDisplayed){
    dmDiceSelection = [];
    dmUpdateRollOutput('—','Add dice to roll…');
    dmLastRollDisplayed = false;
  }
  dmDiceSelection.push(n);
  dmUpdateDiceSelectionText();
}
function dmClearDice(){
  dmDiceSelection = [];
  dmUpdateDiceSelectionText();
  dmUpdateRollOutput('—','Add dice to roll…');
  dmLastRollDisplayed = false;
}
function dmUpdateDiceSelectionText(){
  const el = document.getElementById('dm-dice-selection'); if(!el) return;
  if(!dmDiceSelection.length){ el.textContent = 'No dice selected'; return; }
  const map = {};
  dmDiceSelection.forEach(n=> map[n]=(map[n]||0)+1 );
  const parts = Object.keys(map).sort((a,b)=>+a-+b).map(k=>`${map[k]}d${k}`);
  el.textContent = parts.join(' + ');
}
function dmUpdateRollOutput(total, breakdown){
  const root = document.getElementById('dm-dice-output'); if(!root) return;
  root.querySelector('.roll-total').textContent = total;
  root.querySelector('.roll-breakdown').textContent = breakdown;
}
function startRollAnimationIn(root){
  const hero = root?.querySelector('.dice-hero');
  hero?.classList.remove('settle');
  hero?.classList.add('rolling');
  root?.querySelector('.roll-total')?.classList.add('rolling');
}
function finishRollAnimationIn(root){
  const hero = root?.querySelector('.dice-hero');
  if(hero){
    hero.classList.remove('rolling');
    const rx=(Math.random()*60-30)|0, ry=(Math.random()*60-30)|0, rz=(Math.random()*360)|0;
    hero.style.setProperty('--end-rx', rx+'deg');
    hero.style.setProperty('--end-ry', ry+'deg');
    hero.style.setProperty('--end-rz', rz+'deg');
    hero.classList.remove('settle'); hero.offsetHeight; hero.classList.add('settle');
    root?.querySelector('.roll-total')?.classList.remove('rolling');
    setTimeout(()=>hero.classList.remove('settle'), 500);
  }
}
function dmRollAll(){
  const root = document.getElementById('dm-dice-output'); if(!root) return;
  if(!dmDiceSelection.length){ dmUpdateRollOutput('—','Add dice to roll…'); return; }

  startRollAnimationIn(root);

  const duration=900, steps=18, stepTime=Math.max(40, Math.floor(duration/steps));
  let t=0;
  const totalEl = root.querySelector('.roll-total');
  const breakdownEl = root.querySelector('.roll-breakdown');

  const scramble = ()=>{
    if(t>=duration){
      const rolls = dmDiceSelection.map(n => 1 + Math.floor(Math.random()*n));
      const total = rolls.reduce((a,b)=>a+b,0);
      dmUpdateRollOutput(String(total), rolls.join(' + '));
      finishRollAnimationIn(root);
      dmDiceSelection = [];
      dmUpdateDiceSelectionText();
      dmLastRollDisplayed = true;
      return;
    }
    const temp = dmDiceSelection.map(n => 1 + Math.floor(Math.random()*n));
    const tempTotal = temp.reduce((a,b)=>a+b,0);
    if(totalEl) totalEl.textContent = tempTotal;
    if(breakdownEl) breakdownEl.textContent = temp.join(' + ');
    t += stepTime;
    setTimeout(scramble, stepTime);
  };
  scramble();
}

/* ========= Toast ========= */
let activeToast = null;
function showToast(title,msg, opts){
  closeAllToasts();
  const div=document.createElement('div');
  div.className='dm-toast';
  div.innerHTML=`
    <div class="close" onclick="this.parentElement.remove()">×</div>
    <h4>${escapeHtml(title)}</h4>
    <div class="msg"></div>
  `;
  const body = div.querySelector('.msg');
  body.textContent = String(msg); // preserves \n with CSS white-space:pre-wrap
  document.body.appendChild(div);
  activeToast = div;
  const ms = (opts && opts.duration) ? opts.duration : 7000;
  setTimeout(()=>{ if(div===activeToast){ div.remove(); activeToast=null; } }, ms);
}
function closeAllToasts(){
  document.querySelectorAll('.dm-toast').forEach(t=>t.remove());
  activeToast = null;
}

/* ========= Utils & boot ========= */
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    await reloadMaps();
    renderNotes();
    renderDice();

    // Optional: keyboard support for tiles on the home grid
    document.querySelectorAll('.tile[tabindex]')
      .forEach(tile => tile.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tile.click(); }
      }));
  }catch(err){ console.error('boot error', err); }
});

/* ======================================================================
   TabletopPals — Feedback Modal (self-contained) — v2
   Paste at END OF FILE in DocumentsTabletopPals/app.js
   ====================================================================== */
(() => {
  // --- CONFIG ---------------------------------------------------------------
  const FORMSPREE_ENDPOINT = "https://formspree.io/f/mdklynlj"; // single source of truth
  const FALLBACK_EMAIL     = "matthewmarais14@gmail.com";       // used in mailto
  const QUEUE_KEY          = "tp_feedback_queue_v1";
  const APP_VERSION_LABEL  = "DocumentsTabletopPals — Major Alpha";

  // --- UTIL -----------------------------------------------------------------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  function setStatus(msg, kind=""){ const el=$("#fb-status"); if(el){ el.textContent=msg; el.className=`feedback-status ${kind}`; } }
  function collectMeta(){
    $("#fb-meta-ua").value  = navigator.userAgent || "";
    $("#fb-meta-vp").value  = `${window.innerWidth}x${window.innerHeight}`;
    try { $("#fb-meta-tz").value = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { $("#fb-meta-tz").value = ""; }
    $("#fb-meta-url").value = location.href;
    $("#fb-meta-app").value = APP_VERSION_LABEL;
  }
  function serializeForm(form){
    const data = new FormData(form); const obj = {};
    for(const [k,v] of data.entries()){ if(k==="company" && !v) continue; obj[k]=v; }
    return obj;
  }
  function queuePush(payload){
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    q.push({ payload, t: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }
  async function sendPayload(payload){
    const ENDPOINT = FORMSPREE_ENDPOINT;
    if (!ENDPOINT) throw new Error("Endpoint not configured");
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText);
      throw new Error(`Submit failed: ${res.status} ${txt}`);
    }
    return res.json().catch(() => ({}));
  }
  function buildMailtoURL(payload){
    const subject = encodeURIComponent(`[TP Feedback] ${payload.category || "General"} (sev ${payload.severity || "?"})`);
    const lines = [
      `From: ${payload.name || "Anonymous"} <${payload.email || "n/a"}>`,
      `Where: ${payload.where || "n/a"}`,
      `Severity: ${payload.severity || "n/a"}`,
      "", payload.details || "", "", "--- meta ---",
      `URL: ${payload.meta_url || ""}`, `UA: ${payload.meta_userAgent || ""}`,
      `Viewport: ${payload.meta_viewport || ""}`, `TZ: ${payload.meta_timezone || ""}`,
      `App: ${payload.meta_appver || ""}`
    ];
    return `mailto:${FALLBACK_EMAIL}?subject=${subject}&body=${encodeURIComponent(lines.join("\n"))}`;
  }

  // NEW: queue sender (the missing function that caused runtime errors)
  async function attemptSyncQueue(){
    try{
      if(!navigator.onLine) return;
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
      if(!Array.isArray(q) || !q.length) return;
      const keep = [];
      for(const item of q){
        try { await sendPayload(item.payload); }
        catch(err){ keep.push(item); }
      }
      localStorage.setItem(QUEUE_KEY, JSON.stringify(keep));
      if(keep.length===0) setStatus("Queued feedback sent. Thank you!", "success");
    }catch(e){
      // Silent: not mission-critical
    }
  }

  // --- TEMPLATE -------------------------------------------------------------
  function buildHTML(){
    return `
<button id="feedback-fab" class="feedback-fab" type="button" aria-haspopup="dialog" aria-controls="tp-feedback-modal" aria-expanded="false">Feedback</button>

<dialog id="tp-feedback-modal" aria-labelledby="feedback-title">
  <header class="feedback-head">
    <h2 id="feedback-title">Submit Feedback</h2>
    <button type="button" class="feedback-close" data-feedback-close>&times; Close</button>
  </header>

  <div class="feedback-body">
    <p class="feedback-intro">
      Thanks for helping improve TabletopPals. Share bugs, ideas, or copy fixes.
      Name is optional — click <em>Use random alias</em> if you prefer to stay anonymous.
    </p>

    <form id="feedback-form" novalidate>
      <!-- honeypot (anti-bot; hidden by CSS) -->
      <input type="text" name="company" id="fb-company" class="feedback-hp" tabindex="-1" autocomplete="off" aria-hidden="true">

      <div class="feedback-grid two">
        <label class="feedback-field">
          <span>Category</span>
          <select id="fb-category" name="category" required class="feedback-select">
            <option value="" selected disabled>Select one…</option>
            <option>Bug</option><option>Suggestion</option><option>UI/UX</option>
            <option>Content/Copy</option><option>Performance</option><option>Other</option>
          </select>
          <div class="feedback-helper">What kind of feedback is this?</div>
        </label>

        <div class="feedback-field">
          <span>Severity (1 = tiny, 5 = blocks me)</span>
          <div class="feedback-rating" role="radiogroup" aria-label="Severity">
            ${[1,2,3,4,5].map(n => `<label><input type="radio" name="severity" value="${n}" required><span>${n}</span></label>`).join("")}
          </div>
          <div class="feedback-helper">Helps us triage quickly.</div>
        </div>
      </div>

      <label class="feedback-field">
        <span>Page / Area</span>
        <input id="fb-where" name="where" type="text" class="feedback-input" placeholder="e.g., Encounters → Calculators → CR Budget">
        <div class="feedback-helper">If you can, tell us where you were in the app.</div>
      </label>

      <label class="feedback-field">
        <span>What happened / Your idea</span>
        <textarea id="fb-details" name="details" rows="6" required class="feedback-textarea" placeholder="Describe the bug, idea, or issue…"></textarea>
        <div class="feedback-helper">Include steps to reproduce or expected behaviour if reporting a bug.</div>
      </label>

      <div class="feedback-grid two">
        <label class="feedback-field">
          <span>Your name <span class="feedback-helper">(optional)</span></span>
          <div class="feedback-grid" style="grid-template-columns: 1fr auto; gap:8px">
            <input id="fb-name" name="name" type="text" class="feedback-input" autocomplete="name">
            <button type="button" id="fb-alias" class="btn ghost small">Use random alias</button>
          </div>
        </label>

        <label class="feedback-field">
          <span>Email <span class="feedback-helper">(optional, for follow-up)</span></span>
          <input id="fb-email" name="email" type="email" class="feedback-input" autocomplete="email" placeholder="you@example.com">
        </label>
      </div>

      <label class="feedback-checkbox">
        <input id="fb-consent" type="checkbox" required>
        <span>I agree to send this feedback (incl. basic device info) so you can improve the app.</span>
      </label>

      <!-- Hidden meta -->
      <input type="hidden" name="meta_userAgent" id="fb-meta-ua">
      <input type="hidden" name="meta_viewport"  id="fb-meta-vp">
      <input type="hidden" name="meta_timezone"  id="fb-meta-tz">
      <input type="hidden" name="meta_url"       id="fb-meta-url">
      <input type="hidden" name="meta_appver"    id="fb-meta-app">

      <div class="feedback-actions">
        <button class="btn" type="submit" disabled>Submit feedback</button>
        <button class="btn ghost" type="reset">Reset</button>
      </div>

      <div id="fb-status" class="feedback-status" role="status" aria-live="polite"></div>
    </form>
  </div>
</dialog>
`; }

  // --- OPEN/CLOSE ------------------------------------------------------------
  function openModal(){ const dlg=$("#tp-feedback-modal"); if(!dlg.open) dlg.showModal(); $("#feedback-fab")?.setAttribute("aria-expanded","true"); collectMeta(); $("#fb-category")?.focus(); }
  function closeModal(){ const dlg=$("#tp-feedback-modal"); if(dlg.open) dlg.close(); $("#feedback-fab")?.setAttribute("aria-expanded","false"); }

  // --- INIT ------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    // Inject once
    const container = document.createElement("div");
    container.className = "feedback-wrap";
    container.innerHTML = buildHTML();
    document.body.appendChild(container);

    // Triggers: FAB + any element with data-action="open-feedback"
    document.body.addEventListener("click", (e) => {
      const open = e.target.closest("[data-action='open-feedback'], #feedback-fab");
      if(open){ e.preventDefault(); openModal(); }
      if(e.target.matches("[data-feedback-close]")){ e.preventDefault(); closeModal(); }
    });
    $("#tp-feedback-modal")?.addEventListener("cancel", (e) => { e.preventDefault(); closeModal(); });

    // Form events
    const form = $("#feedback-form");
    const submitBtn = form?.querySelector('button[type="submit"]');
    const consentEl = $("#fb-consent");
    const detailsEl = $("#fb-details");
    const categoryEl = $("#fb-category");

    function isSeverityChecked(){ return !!document.querySelector('input[name="severity"]:checked'); }
    function updateSubmitState(){
      const hasCategory = !!categoryEl?.value;
      const hasDetails  = !!detailsEl?.value.trim();
      const hasConsent  = !!consentEl?.checked;
      const hasSeverity = isSeverityChecked();
      if(submitBtn){ submitBtn.disabled = !(hasCategory && hasDetails && hasConsent && hasSeverity); }
    }
    consentEl?.addEventListener("change", updateSubmitState);
    form?.addEventListener("input", updateSubmitState);
    form?.addEventListener("reset", () => setTimeout(updateSubmitState, 0));
    updateSubmitState();

    // Alias generator
    const aliasBtn   = $("#fb-alias");
    const nameInput  = $("#fb-name");
    function randomAlias(){
      const adjectives = ["Brave","Clever","Mighty","Swift","Cunning","Lucky","Quiet","Bold","Arcane","Wandering"];
      const nouns      = ["Fox","Badger","Oak","Comet","Falcon","Wolf","Harbor","Willow","Lantern","Raven"];
      const num        = Math.floor(Math.random()*900)+100;
      return `${adjectives[Math.floor(Math.random()*adjectives.length)]}${nouns[Math.floor(Math.random()*nouns.length)]}-${num}`;
    }
    aliasBtn?.addEventListener("click", () => { if(nameInput){ nameInput.value = randomAlias(); updateSubmitState(); nameInput.focus(); } });

    // Submit handler
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus("");
      const hp = $("#fb-company"); if(hp && hp.value){ setStatus("Bot detected.", "error"); return; }

      // Required checks (order matters for focus)
      if(!categoryEl.value){ setStatus("Please select a category.", "error"); categoryEl.focus(); return; }
      if(!isSeverityChecked()){ setStatus("Please pick a severity (1–5).", "error"); return; }
      if(!detailsEl.value.trim()){ setStatus("Please describe your feedback.", "error"); detailsEl.focus(); return; }
      if(!consentEl.checked){ setStatus("Please agree to send your feedback.", "error"); consentEl.focus(); return; }

      const payload = serializeForm(form);

      if(!navigator.onLine){
        queuePush(payload);
        form.reset(); collectMeta(); updateSubmitState();
        setStatus("You’re offline. Saved locally — we’ll auto-send when you’re back online.", "success");
        return;
      }

      try{
        await sendPayload(payload);
        form.reset(); collectMeta(); updateSubmitState();
        setStatus("Thank you! Your feedback has been submitted. 🎉", "success");
      }catch(err){
        console.error(err);
        setStatus("Couldn’t submit automatically. Click to send by email instead.", "error");
        const a = document.createElement("a");
        a.href = buildMailtoURL(payload);
        a.textContent = "Open email draft";
        a.className = "btn ghost";
        a.style.marginLeft = "10px";
        $("#fb-status").appendChild(a);
      }
    });

    // Sync queued on online
    window.addEventListener("online", attemptSyncQueue);
    // Collect meta now & try sync early
    collectMeta();
    attemptSyncQueue().catch(()=>{});
  });
})();

// ===== Mobile burger toggle (small, isolated) =====
document.addEventListener('DOMContentLoaded', () => {
  const burger = document.getElementById('burger');
  const navEl  = document.getElementById('site-nav');

  if (!burger || !navEl) return;

  const closeMenu = () => burger.setAttribute('aria-expanded', 'false');

  burger.addEventListener('click', () => {
    const expanded = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-expanded', String(!expanded));
  });

  // Close after any nav action (buttons or links)
  navEl.addEventListener('click', (e) => {
    if (e.target.closest('button, a')) closeMenu();
  });

  // If resizing up to desktop, ensure menu is reset
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 960) closeMenu();
  });
});
/* ======================================================================
   Reviewer Legal Notice — modal gate
   Now defaults to SHOW EVERY TIME the page loads.
   Modes available: 'always' | 'perSession' | 'daily' | 'once'
   ====================================================================== */
(() => {
  const ENABLED = document.body && document.body.dataset.legalGate === 'on';
  if (!ENABLED) return;

  // --- CONFIG -----------------------------------------------------------
  // Set this to 'always' to show the modal on EVERY visit (your request)
  // Other options for convenience: 'perSession', 'daily', 'once'
  const SHOW_MODE = 'always';

  // Keys (used by non-`always` modes; harmless otherwise)
  const LEGAL_ACK_KEY   = 'tp_legal_ack_v1';
  const LEGAL_ACK_VALUE = 'accepted-2025-09';
  const SESSION_KEY     = 'tp_legal_ack_session';
  // ---------------------------------------------------------------------

  function todayKey() {
    const d = new Date();
    const iso = d.toISOString().slice(0,10); // YYYY-MM-DD
    return `tp_legal_ack_day_${iso}`;
  }

  function shouldShow() {
    try {
      switch (SHOW_MODE) {
        case 'always':
          return true; // always show, no storage
        case 'perSession':
          return sessionStorage.getItem(SESSION_KEY) !== '1';
        case 'daily':
          return localStorage.getItem(todayKey()) !== '1';
        case 'once':
        default:
          return localStorage.getItem(LEGAL_ACK_KEY) !== LEGAL_ACK_VALUE;
      }
    } catch {
      // If storage is blocked, safest fallback is to show it
      return true;
    }
  }

  function recordAcceptance() {
    try {
      switch (SHOW_MODE) {
        case 'always':
          // no-op: don’t persist; it will show next load again
          break;
        case 'perSession':
          sessionStorage.setItem(SESSION_KEY, '1');
          break;
        case 'daily':
          localStorage.setItem(todayKey(), '1');
          break;
        case 'once':
        default:
          localStorage.setItem(LEGAL_ACK_KEY, LEGAL_ACK_VALUE);
          break;
      }
    } catch {
      // ignore
    }
  }

  function buildHTML(){
    return `
<dialog id="tp-legal-modal" aria-labelledby="legal-title" aria-modal="true">
  <header class="legal-head">
    <h2 id="legal-title">Reviewer Legal Notice</h2>
    <span class="legal-badge">Preview Build</span>
  </header>

  <div class="legal-body">
    <p>
      This preview of <strong>TabletopPals</strong> is proprietary and confidential.
      By proceeding you agree not to redistribute, copy, or disclose the app’s code,
      designs, or assets. SRD content © Wizards of the Coast (CC-BY-4.0).
    </p>
    <ul>
      <li>For review/testing only — no public sharing or reposting.</li>
      <li>No training, dataset ingestion, or scraping of any materials.</li>
      <li>All brand/artwork remains the property of Matthew (© 2025).</li>
    </ul>
  </div>

  <label class="legal-checkbox">
    <input type="checkbox" id="legal-consent" />
    <span>I have read and agree to the <a href="legal/terms.html" target="_blank" rel="noopener">Terms</a>, <a href="legal/privacy.html" target="_blank" rel="noopener">Privacy</a>, and <a href="legal/notice.html" target="_blank" rel="noopener">Legal Notices</a>.</span>
  </label>

  <div class="legal-actions">
    <button class="btn" id="legal-agree" type="button" disabled>Agree &amp; Enter</button>
    <a class="btn ghost" href="legal/terms.html" target="_blank" rel="noopener">Open Terms</a>
    <a class="btn ghost" href="legal/privacy.html" target="_blank" rel="noopener">Open Privacy</a>
    <a class="btn ghost" href="legal/notice.html" target="_blank" rel="noopener">Open Notices</a>
  </div>
</dialog>`;
  }

  function initGate(){
    if (!shouldShow()) return;

    const container = document.createElement('div');
    container.innerHTML = buildHTML();
    const dlg = container.firstElementChild;
    document.body.appendChild(dlg);

    const agree = dlg.querySelector('#legal-agree');
    const box   = dlg.querySelector('#legal-consent');

    const update = () => { agree.disabled = !box.checked; };
    box.addEventListener('change', update);
    update();

    agree.addEventListener('click', () => {
      recordAcceptance();
      dlg.close();
    });

    // Prevent closing with Esc — must make a conscious choice
    dlg.addEventListener('cancel', (ev) => ev.preventDefault());

    dlg.showModal();
    setTimeout(() => box.focus(), 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGate, { once: true });
  } else {
    initGate();
  }
})();

/* ========= Expose for onclicks ========= */
window.nav=nav;

window.renderWorld=renderWorld;
window.renderWorldMapList=renderWorldMapList;
window.setWorldMapIndex=setWorldMapIndex;
window.toggleWorldFullscreen=toggleWorldFullscreen;
window.openWorldViewer=openWorldViewer;
window.syncWorldViewer=syncWorldViewer;

window.rollAll=rollAll;
window.clearDice=clearDice;
window.addDie=addDie;
window.renderDice=renderDice;

window.renderDmPage=renderDmPage;
window.setDmTab=setDmTab;

window.dmAddDie = dmAddDie;
window.dmClearDice = dmClearDice;
window.dmRollAll = dmRollAll;

window.quickAdvFor = quickAdvFor;
window.quickDisFor = quickDisFor;
