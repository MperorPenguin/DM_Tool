/* DM Toolkit — World Map + DM Page + Dice + Live Sync
   Theme: Lime #d6ed17 (actions), Midnight #000e1b (backgrounds)
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
    // traits: leave empty unless you later add traits in the Character Manager
    traits: Array.isArray(c.traits) ? c.traits : [],
    // extra badges to show (species/background)
    badges: [c.background, c.species].filter(Boolean),
    // hp is optional in the library; if added later, tokenCard will render it
    hp: Array.isArray(c.hp) && c.hp.length >= 2 ? c.hp : null,
  }));
}
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
  const others = ['npc','enemy'].flatMap(k => (state.tokens[k]||[]).map(t=>({...t, kind:k})));
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

  const npcs   = state.tokens.npc||[];
  const enemies= state.tokens.enemy||[];
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
/* ===== DM — Enemy sync from Admin “Enemy Builder” (RESILIENT ADD-ONLY) ===== */
(() => {
  // Keys & channel used by Enemy Builder “Publish”
  const ENEMY_DATA_KEYS = [
    'tp_enemies_data_v1',          // primary (current)
    'tp_enemies_v1',               // fallback (older)
    'tp_encounters_enemies_v1'     // fallback (namespaced)
  ];
  const ENEMY_PING_KEYS = ['tp_enemies_public_v1']; // publish timestamp/count pings
  const ENEMY_BC_NAME  = 'tp_enemies';              // BroadcastChannel name
  const DEFAULT_ICON   = 'assets/class_icons/Enemy.svg';

  // ——— Helpers to find the DM view & grid (no HTML changes required)
  function getDmRoot() {
    return document.getElementById('view-dm')
        || document.querySelector('[data-panel="dm"]')
        || document.body;
  }
  function getEnemiesGrid() {
    const root = getDmRoot();
    let el = root.querySelector('#dm-enemy-grid');  // use if you ever add an id
    if (el) return el;
    el = root.querySelector('.dm-grid3');          // your current enemies grid
    if (el) return el;
    return Array.from(document.querySelectorAll('.dm-grid3'))
      .find(e => e.offsetParent !== null) || null;
  }

  // ——— Read published enemies from storage (robust to key variations)
  function tryParse(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const val = JSON.parse(raw);
      return Array.isArray(val) ? val : null;
    } catch { return null; }
  }
  function readPublishedEnemies() {
    for (const k of ENEMY_DATA_KEYS) {
      const arr = tryParse(k);
      if (arr) return arr;
    }
    // As last resort, scan enemy-like keys
    try {
      for (const k of Object.keys(localStorage)) {
        if (/enemy/i.test(k) || /enemies/i.test(k)) {
          const arr = tryParse(k);
          if (arr) return arr;
        }
      }
    } catch {}
    return [];
  }

  // ——— Mapping to your token shape used by renderDmPage/tokenCard
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const coalesce = (...vals) => vals.find(v => v !== undefined && v !== null && v !== '');

  function senseBadges(s) {
    if (!s || typeof s !== 'string') return [];
    const t = s.toLowerCase();
    const out = [];
    if (t.includes('darkvision')) out.push('Darkvision');
    if (t.includes('blindsight')) out.push('Blindsight');
    if (t.includes('tremorsense')) out.push('Tremorsense');
    if (t.includes('truesight'))  out.push('Truesight');
    return out;
  }

  function toToken(e) {
    const id  = e.id || (crypto?.randomUUID?.() || ('e_' + Math.random().toString(36).slice(2,10)));
    const hpMax = (typeof e.hp === 'number' && e.hp>0) ? e.hp : coalesce(e.hp?.max, e.hpMax, null);
    const hpCur = coalesce(e.hp?.current, e.hpCurrent, hpMax, null);
    const hpArr = hpMax ? [hpCur ?? hpMax, hpMax] : null;

    const badges = [];
    if (e.cr != null && e.cr !== '') badges.push(`CR ${String(e.cr)}`);
    if (e.ac != null && e.ac !== '') badges.push(`AC ${String(e.ac)}`);
    if (e.type) badges.push(String(e.type));

    const traits = [
      ...senseBadges(e.senses || ''),
      ...(Array.isArray(e.tags) ? e.tags.slice(0,2) : [])
    ];

    return {
      id,
      name: e.name || 'Enemy',
      cls: 'Enemy',           // ensures tokenCard picks Enemy.svg
      hp: hpArr || undefined, // tokenCard handles undefined gracefully
      badges,
      traits
    };
  }

  // ——— Sync into app state (what your Enemies tab consumes)
  function syncEnemiesIntoState(list) {
    if (window.state && window.state.tokens) {
      window.state.tokens.enemy = list;
    }
  }

  // ——— Optional DOM fallback (only used if we can’t/won’t call renderDmPage)
  function cardHTML(t) {
    const hpBadge = (t.hp && t.hp.length === 2)
      ? `<span class="badge">HP ${esc(t.hp[0])}/${esc(t.hp[1])}</span>` : '';
    const moreBadges  = (t.badges || []).map(b => `<span class="badge">${esc(b)}</span>`).join('');
    const traitBadges = (t.traits || []).map(b => `<span class="badge">${esc(b)}</span>`).join('');
    return `
      <div class="dm-character-box" data-id="${esc(t.id)}">
        <div class="dm-card" onclick="selectFromPanel && selectFromPanel('enemy','${esc(t.id)}')">
          <div class="avatar"><img src="${DEFAULT_ICON}" alt=""></div>
          <div class="name">${esc(t.name)}</div>
          <div class="badges">
            <span class="badge">Enemy</span>
            ${hpBadge}${moreBadges}${traitBadges}
          </div>
        </div>
        <div class="dm-actions">
          <button class="dm-title-btn short adv" title="Advantage" onclick="quickAdvFor && quickAdvFor('enemy','${esc(t.id)}')">A</button>
          <button class="dm-title-btn short dis"  title="Disadvantage" onclick="quickDisFor && quickDisFor('enemy','${esc(t.id)}')">D</button>
        </div>
      </div>`;
  }

  let lastSig = '';
  function hydrateEnemies() {
    const published = readPublishedEnemies();
    const list = published.map(toToken);

    // 1) update app state (your renderer consumes this)
    syncEnemiesIntoState(list);

    // 2) if we’re on DM→Enemies and renderer exists, just render normally
    const inDmEnemies = (window.state?.route === 'dm' && window.state?.ui?.dmTab === 'enemies');
    if (inDmEnemies && typeof window.renderDmPage === 'function') {
      const sig = JSON.stringify(list.map(e => [e.id, e.name, e.badges?.join('|'), e.traits?.join('|'), e.hp?.join('/')]));
      if (sig !== lastSig) {
        lastSig = sig;
        window.renderDmPage();
      }
      return;
    }

    // 3) fallback DOM render if needed (no HTML edits required)
    const grid = getEnemiesGrid();
    if (!grid) return;
    const sig = JSON.stringify(list.map(e => [e.id, e.name, e.badges?.join('|'), e.traits?.join('|'), e.hp?.join('/')]));
    if (sig === lastSig) return;
    lastSig = sig;
    grid.innerHTML = list.map(cardHTML).join('');
  }

  const hydrateSoon = () => setTimeout(hydrateEnemies, 0);

  // ——— Event wiring (load, tab switches, publishes)
  document.addEventListener('DOMContentLoaded', hydrateSoon);

  // DM nav clicked
  document.getElementById('nav-dm')?.addEventListener('click', hydrateSoon);

  // Enemies sub-tab clicked (inline onclick uses setDmTab('enemies'))
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.dm-tab');
    if (!btn) return;
    const onclk = btn.getAttribute('onclick') || '';
    const label = (btn.textContent || '').trim().toLowerCase();
    if (onclk.includes("setDmTab('enemies')") || label === 'enemies') {
      hydrateSoon();
    }
  }, true);

  // Storage ping/data when Admin publishes
  window.addEventListener('storage', (e) => {
    if (!e) return;
    if (ENEMY_DATA_KEYS.includes(e.key) || ENEMY_PING_KEYS.includes(e.key)) hydrateSoon();
  });

  // Instant cross-tab updates
  try {
    const bc = new BroadcastChannel(ENEMY_BC_NAME);
    bc.onmessage = hydrateSoon;
  } catch {}

  // Re-hydrate when DM view appears/rebuilds
  const dmRoot = getDmRoot();
  if (dmRoot) {
    const mo = new MutationObserver(hydrateSoon);
    mo.observe(dmRoot, { attributes: true, subtree: true, childList: true });
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
