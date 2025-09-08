/* Encounter Builder — Encounters (with Enemy Admin integration + catalog dropdown) */

"use strict";

// ---------- Small storage helpers ----------
const load = (k, d) => JSON.parse(localStorage.getItem(k) || JSON.stringify(d));
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ---------- Rules data ----------
const THRESHOLDS_2014 = {
  1:[25,50,75,100],  2:[50,100,150,200],  3:[75,150,225,400],  4:[125,250,375,500],
  5:[250,500,750,1100], 6:[300,600,900,1400], 7:[350,750,1100,1700], 8:[450,900,1400,2100],
  9:[550,1100,1600,2400], 10:[600,1200,1900,2800], 11:[800,1600,2400,3600], 12:[1000,2000,3000,4500],
  13:[1100,2200,3400,5100], 14:[1250,2500,3800,5700], 15:[1400,2800,4300,6400], 16:[1600,3200,4800,7200],
  17:[2000,3900,5900,8800], 18:[2100,4200,6300,9500], 19:[2400,4900,7300,10900], 20:[2800,5700,8500,12700]
};
const THRESHOLDS_2024 = THRESHOLDS_2014;
const XP_BY_CR = {
  "0":10,"1/8":25,"1/4":50,"1/2":100, 1:200,2:450,3:700,4:1100,5:1800,6:2300,7:2900,8:3900,9:5000,10:5900,
  11:7200,12:8400,13:10000,14:11500,15:13000,16:15000,17:18000,18:20000,19:22000,20:25000,21:33000,22:41000,
  23:50000,24:62000,25:75000,26:90000,27:105000,28:120000,29:135000,30:155000
};

// ---------- App state ----------
let STATE = {
  party: [],
  partySel: [],
  scene: { terrain:"Any", lighting:"Bright", cover:0, adv:"normal" },
  ruleset: "2014",
  groups: [],
  library: load('tp_dm_encounters', []),
  hpAdjust: {}
};

// ---------- Shorthands ----------
const $  = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const uid = (p="id") => p + Math.random().toString(36).slice(2,8);

// ---------- Toast helpers ----------
function ensureToastHost(){
  if (document.getElementById('tp_toast_host')) return;
  const host = document.createElement('div');
  host.id = 'tp_toast_host';
  host.setAttribute('aria-live', 'polite');
  Object.assign(host.style, { position:'fixed', zIndex:'9999', right:'1rem', bottom:'1rem', display:'grid', gap:'.5rem' });
  document.body.appendChild(host);
}
function showToast(msg, type='info', details){
  ensureToastHost();
  const el = document.createElement('div');
  el.role = 'status';
  el.style.background = getComputedStyle(document.documentElement).getPropertyValue('--color-surface-2') || '#1b2024';
  el.style.border = '1px solid var(--color-border)';
  el.style.color = 'var(--color-text)';
  el.style.borderRadius = '12px';
  el.style.padding = '.6rem .8rem';
  el.style.boxShadow = '0 6px 20px rgba(0,0,0,.35)';
  el.style.maxWidth = '360px';
  el.style.fontSize = '.95rem';

  const badge = document.createElement('strong');
  badge.style.marginRight = '.5rem';
  badge.textContent = type === 'success' ? '✓' : (type === 'error' ? '⚠' : '●');
  badge.style.color = type === 'success' ? 'var(--color-primary)' : (type === 'error' ? '#ff6b6b' : 'var(--color-text)');
  const span = document.createElement('span'); span.textContent = msg;
  el.appendChild(badge); el.appendChild(span);

  if (details && Array.isArray(details) && details.length){
    const btn = document.createElement('button');
    btn.className = 'btn ghost sm'; btn.style.marginLeft = '.5rem'; btn.textContent = 'Details';
    btn.onclick = () => { console.group('[Enemies Adapter] Details'); details.forEach(d => console.log(d)); console.groupEnd(); btn.disabled = true; btn.textContent='Logged'; };
    el.appendChild(btn);
  }
  document.getElementById('tp_toast_host').appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 8000 : 4000);
}

// ---------- Published enemies wiring (auto-sync + dropdown + autofill) ----------
let PUBLISHED = [];

function renderCatalog(){
  const sel = document.getElementById('m-catalog');
  if(!sel) return;
  const prev = sel.value;
  if(!Array.isArray(PUBLISHED) || !PUBLISHED.length){
    sel.innerHTML = `<option value="">— No published enemies —</option>`;
    sel.disabled = true; return;
  }
  const opts = ['<option value="">— Select published enemy —</option>']
    .concat(PUBLISHED.map(e => {
      const text = `${e.name} (CR ${e.cr} · AC ${e.ac ?? '?'} · HP ${e.hp ?? '?'})`;
      return `<option value="${e.id}">${text}</option>`;
    }));
  sel.innerHTML = opts.join('');
  sel.disabled = false;
  // Preserve selection if still valid
  if (prev && PUBLISHED.some(e=>e.id===prev)) sel.value = prev;
}

function enemiesSubscribe(){
  if (!window.EnemiesAdapter) return;
  window.EnemiesAdapter.subscribe(list => {
    PUBLISHED = Array.isArray(list)? list : [];
    renderCatalog();
  });
  if (window.EnemiesAdapter.subscribeStatus){
    window.EnemiesAdapter.subscribeStatus((st) => {
      if (st.ok){
        showToast(`Enemies loaded: ${st.count} available.`, 'success');
        renderCatalog();
        if (st.warnings && st.warnings.length){
          showToast(`Loaded with ${st.warnings.length} warning(s).`, 'info', st.warnings.slice(0,5));
        }
      } else {
        const reasons = (st.errors && st.errors.length) ? st.errors.slice(0,5) : ['Unknown validation error'];
        showToast(`Enemies data invalid — ${st.errors ? st.errors.length : '?'} issue(s).`, 'error', reasons);
        renderCatalog();
      }
    });
  }
}

function findPublishedById(id){ return PUBLISHED.find(e => e.id === id) || null; }
function findPublishedByNameLike(q){
  if(!q) return null;
  const s = String(q).trim().toLowerCase();
  const slug = s.replace(/[^a-z0-9]+/g,'-');
  return PUBLISHED.find(e => (e.name||'').toLowerCase() === s)
      || PUBLISHED.find(e => (e.slug||'') === slug)
      || PUBLISHED.find(e => (e.name||'').toLowerCase().startsWith(s))
      || PUBLISHED.find(e => (e.name||'').toLowerCase().includes(s))
      || null;
}

function autofillFromPublished(){
  const nm = document.getElementById('m-name'); if(!nm) return;
  const row = findPublishedByNameLike(nm.value); if(!row) return;
  setFromCatalogRow(row);
}

function setFromCatalogRow(row){
  const set = (id,val,force=false)=>{ const el=document.getElementById(id); if(!el) return; if(force || !el.value) el.value = (val ?? ''); };
  set('m-name', row.name, true);
  set('m-cr', row.cr, true);
  // XP: prefer published xp, else derive
  const xp = (row.xp != null) ? row.xp : XP_BY_CR[row.cr] || '';
  set('m-xp', xp, true);
  set('m-ac', row.ac);
  set('m-hp', row.hp);
  // we don't have attacks/tohit/dice in the published payload; leave as-is for DM to fill
}

// ---------- Core math ----------
function parseDiceAvg(expr){
  if(!expr) return {avg:0, avgCrit:0};
  const m = expr.trim().match(/(\d+)d(\d+)([+\-]\d+)?/i);
  if(!m) return {avg:0, avgCrit:0};
  const n = +m[1], s = +m[2], b = m[3] ? +m[3] : 0;
  const dieAvg = (s + 1) / 2;
  return { avg: n * dieAvg + b, avgCrit: (n * 2) * dieAvg + b };
}
function hitChance(attackBonus, targetAC, adv="normal"){
  const p = clamp((21 + attackBonus - targetAC)/20, 0.05, 0.95);
  if(adv==='adv') return 1 - (1 - p)**2;
  if(adv==='dis') return p**2;
  return p;
}
function critChance(adv="normal"){ const p=0.05; if(adv==='adv') return 1-(1-p)**2; if(adv==='dis') return p**2; return p; }
function saveFailChance(dc, bonus, adv="normal"){
  const need = dc - bonus;
  const baseSuc = clamp((21 - need)/20, 0, 1);
  let suc = baseSuc;
  if(adv==='adv') suc = 1 - (1 - baseSuc)**2;
  if(adv==='dis') suc = baseSuc**2;
  return 1 - suc;
}
function concSuccessChancePerHit(damage, conBonus, adv="normal"){
  const dc = Math.max(10, Math.floor(damage/2));
  const need = dc - conBonus;
  const baseSuc = clamp((21 - need)/20, 0, 1);
  let suc = baseSuc;
  if(adv==='adv') suc = 1 - (1 - baseSuc)**2;
  if(adv==='dis') suc = baseSuc**2;
  return suc;
}
function monsterMultiplier(n){ if(n<=1) return 1; if(n===2) return 1.5; if(n<=6) return 2; if(n<=10) return 2.5; if(n<=14) return 3; return 4; }
function thresholds(levels, ruleset){
  const tbl = ruleset==='2024' ? THRESHOLDS_2024 : THRESHOLDS_2014;
  const sum = levels.reduce((a,l)=>{ const r = tbl[l] || tbl[1]; return [a[0]+r[0], a[1]+r[1], a[2]+r[2], a[3]+r[3]]; }, [0,0,0,0]);
  return { easy:sum[0], med:sum[1], hard:sum[2], deadly:sum[3] };
}
function totalMonsters(){ return STATE.groups.reduce((s,g)=>s+(g.count||1),0); }
function totalBaseXP(){ return STATE.groups.reduce((s,g)=>s+(g.xp*(g.count||1)),0); }
function difficulty(levels, ruleset){
  const t = thresholds(levels, ruleset);
  const base = totalBaseXP();
  const mult = monsterMultiplier(totalMonsters());
  const adjusted = Math.round(base * mult);
  let band = "Deadly";
  if(adjusted <= t.easy) band = "Easy";
  else if(adjusted <= t.med) band = "Medium";
  else if(adjusted <= t.hard) band = "Hard";
  return { t, base, mult, adjusted, band };
}

// ---------- Party ----------
function getParty(){ return load('tp_cc_characters', []); }
function loadParty(){ STATE.party = getParty(); }
function renderPartyBox(){
  const root = $('#partyBox');
  if(!STATE.party.length){
    root.innerHTML = `<div class="helper">No party found in <code>tp_cc_characters</code>. Create characters first or click “Load Sample Party”.</div>`;
    $('#applyBox').innerHTML = '<div class="helper">No party loaded.</div>'; buildCalcEntityOptions(); return;
  }
  const items = STATE.party.map(p=>{
    const checked = STATE.partySel.includes(p.id) ? 'checked' : '';
    const hp = (p.hp ?? '?') + '/' + (p.hpMax ?? '?');
    return `<label class="row"><input type="checkbox" data-id="${p.id}" ${checked}/><span>${p.name}</span><small>Lv ${p.level ?? '?'} • AC ${p.ac ?? '—'} • HP ${hp}</small></label>`;
  }).join('');
  root.innerHTML = items;

  const applyRows = STATE.party.map(p=>{
    const cur = p.hp ?? 0; const max = p.hpMax ?? cur; const adj = STATE.hpAdjust[p.id] ?? 0;
    return `<div class="row"><div><strong>${p.name}</strong><small> HP ${cur}/${max}</small></div>
      <label>Adjust <input type="number" value="${adj}" data-act="hp-adj" data-id="${p.id}"/></label></div>`;
  }).join('');
  $('#applyBox').innerHTML = applyRows;

  buildCalcEntityOptions();
}

// ---------- Groups ----------
function addGroup(g){ STATE.groups.push({ ...g, id: uid('g_') }); saveBuilder(); renderGroups(); renderDiff(); }
function removeGroup(id){ STATE.groups = STATE.groups.filter(g=>g.id!==id); saveBuilder(); renderGroups(); renderDiff(); }
function updateGroup(id, key, val){ const g = STATE.groups.find(x=>x.id===id); if(!g) return; g[key] = val; saveBuilder(); renderGroups(); renderDiff(); }
function renderGroups(){
  const root = $('#groupsList');
  if(!STATE.groups.length){ root.innerHTML = '<div class="helper">No enemy/NPC groups added yet.</div>'; buildCalcEntityOptions(); return; }
  root.innerHTML = STATE.groups.map(g=>`
    <div class="row group">
      <div class="left"><strong>${g.name}</strong>
        <small>CR ${g.cr ?? '?'} • ${g.xp||0} XP • AC ${g.ac||'?'} • HP ${g.hp||'?'} • Att ${g.attacks||1}× +${g.tohit||0} (${g.dice||'—'})</small>
      </div>
      <div class="right"><label>Count <input type="number" min="1" value="${g.count||1}" data-act="g-count" data-id="${g.id}"/></label>
        <button class="btn ghost" data-act="g-del" data-id="${g.id}">Remove</button></div>
    </div>`).join('');
  buildCalcEntityOptions();
}

// ---------- Difficulty ----------
function renderDiff(){
  const levels = STATE.party.filter(p=>STATE.partySel.includes(p.id)).map(p=>p.level||1);
  const res = difficulty(levels, STATE.ruleset);
  const pcs = levels.length || 0, mon = totalMonsters();
  $('#diffReadout').innerHTML = `
    <div class="grid cols-5 tight">
      <div class="pill">PCs: <strong>${pcs}</strong></div>
      <div class="pill">Monsters: <strong>${mon}</strong></div>
      <div class="pill">Base XP: <strong>${res.base}</strong></div>
      <div class="pill">Multiplier: <strong>${res.mult}×</strong></div>
      <div class="pill">Adjusted: <strong>${res.adjusted}</strong></div>
    </div>
    <div class="bars">
      <div class="barrow"><span>Easy</span><div class="bar"><i style="width:${Math.min(100, res.t.easy ? res.adjusted/res.t.easy*100 : 0)}%"></i></div><b>${res.t.easy}</b></div>
      <div class="barrow"><span>Medium</span><div class="bar"><i style="width:${Math.min(100, res.t.med ? res.adjusted/res.t.med*100 : 0)}%"></i></div><b>${res.t.med}</b></div>
      <div class="barrow"><span>Hard</span><div class="bar"><i style="width:${Math.min(100, res.t.hard ? res.adjusted/res.t.hard*100 : 0)}%"></i></div><b>${res.t.hard}</b></div>
      <div class="barrow"><span>Deadly</span><div class="bar"><i style="width:${Math.min(100, res.t.deadly ? res.adjusted/res.t.deadly*100 : 0)}%"></i></div><b>${res.t.deadly}</b></div>
    </div>
    <div class="callout ${res.band.toLowerCase()}">Difficulty: <strong>${res.band}</strong></div>`;
}

// ---------- Calculator dropdown helpers ----------
function entityLabelFromParty(p){ const ac=(p.ac ?? '—'); const hp=(p.hp ?? '?') + '/' + (p.hpMax ?? '?'); return `${p.name} (PC · AC ${ac} · HP ${hp})`; }
function entityLabelFromGroup(g){ const att = (g.attacks||1) + '× +' + (g.tohit||0) + ' (' + (g.dice||'—') + ')'; return `${g.name} (G · AC ${g.ac??'—'} · ${att})`; }
function buildCalcEntityOptions(){
  const atkSel = document.getElementById('atk-entity');
  const tgtSel = document.getElementById('tgt-entity');
  const svTgtSel = document.getElementById('sv-target-entity');
  if(!atkSel || !tgtSel || !svTgtSel) return;
  const mk=(id,label)=>`<option value="${id}">${label}</option>`;
  let partyOpts = STATE.party.map(p => mk(`P:${p.id}`, entityLabelFromParty(p))).join('');
  let groupOpts = STATE.groups.map(g => mk(`G:${g.id}`, entityLabelFromGroup(g))).join('');
  const partyGroup = partyOpts ? `<optgroup label="Party">${partyOpts}</optgroup>` : '';
  const monGroup   = groupOpts ? `<optgroup label="Monsters">${groupOpts}</optgroup>` : '';
  const opts = `<option value="">—</option>${partyGroup}${monGroup}`;
  [atkSel, tgtSel, svTgtSel].forEach(sel => sel.innerHTML = opts);
}
function getEntityByValue(v){
  if(!v) return null; const [kind, id] = v.split(':');
  if(kind === 'P') return STATE.party.find(p => p.id === id) || null;
  if(kind === 'G') return STATE.groups.find(g => g.id === id) || null;
  return null;
}
function qp(val, id){ if(val==='' || val==null) return; const el=document.getElementById(id); if(el) el.value = (''+val).replace('+',''); }
function qpDice(val, id){ if(!val) return; const el=document.getElementById(id); if(!el) return; if(val==='custom'){ el.focus(); return; } el.value = val; }

// ---------- Calculators ----------
function onCalcAttack(e){
  e.preventDefault();
  const adv = $('#atk-adv').value, cover = parseInt($('#atk-cover').value||'0',10);
  const bonus = parseInt($('#atk-bonus').value||'0',10), count = parseInt($('#atk-count').value||'1',10);
  const dice = $('#atk-dice').value.trim();
  const ac = parseInt($('#tgt-ac').value || '10', 10) + cover;
  const {avg, avgCrit} = parseDiceAvg(dice);
  const pHit=hitChance(bonus, ac, adv), pCrit=critChance(adv), pNorm=Math.max(0,pHit-pCrit);
  const dprOne = pNorm*avg + pCrit*avgCrit, dpr = dprOne * count;
  $('#atkOut').innerHTML = `
    <div class="grid cols-4 tight">
      <div class="pill">Hit% <strong>${(pHit*100).toFixed(1)}%</strong></div>
      <div class="pill">Crit% <strong>${(pCrit*100).toFixed(1)}%</strong></div>
      <div class="pill">Avg/Attack <strong>${dprOne.toFixed(2)}</strong></div>
      <div class="pill">DPR (<em>${count}×</em>) <strong>${dpr.toFixed(2)}</strong></div>
    </div>`;
}
function onCalcSave(e){
  e.preventDefault();
  const dc=parseInt($('#sv-dc').value||'10',10), bonus=parseInt($('#sv-bonus').value||'0',10), adv=$('#sv-adv').value;
  const half = $('#sv-half').value==='yes', dice=$('#sv-dice').value.trim();
  const {avg} = parseDiceAvg(dice);
  const pFail=saveFailChance(dc, bonus, adv);
  const exp = half ? (pFail*avg + (1-pFail)*(avg/2)) : (pFail*avg);
  $('#svOut').innerHTML = `
    <div class="grid cols-4 tight">
      <div class="pill">Fail% <strong>${(pFail*100).toFixed(1)}%</strong></div>
      <div class="pill">Success% <strong>${((1-pFail)*100).toFixed(1)}%</strong></div>
      <div class="pill">Avg Damage <strong>${avg.toFixed(2)}</strong></div>
      <div class="pill">Expected/Target <strong>${exp.toFixed(2)}</strong></div>
    </div>`;
}
function onCalcConc(e){
  e.preventDefault();
  const conBonus=parseInt($('#co-bonus').value||'0',10), adv=$('#co-adv').value;
  let dmg=parseFloat($('#co-dmg').value||'0'); const hits=parseInt($('#co-hits').value||'1',10);
  const dice=$('#co-dice').value.trim();
  if(dice){ const {avg}=parseDiceAvg(dice); if(avg>0) dmg=avg; }
  const pKeep=concSuccessChancePerHit(dmg, conBonus, adv), pAll=Math.pow(pKeep, hits);
  $('#coOut').innerHTML = `
    <div class="grid cols-4 tight">
      <div class="pill">DC/Hit <strong>${Math.max(10, Math.floor(dmg/2))}</strong></div>
      <div class="pill">Keep/Hit <strong>${(pKeep*100).toFixed(1)}%</strong></div>
      <div class="pill">Hits <strong>${hits}</strong></div>
      <div class="pill">Keep After All <strong>${(pAll*100).toFixed(1)}%</strong></div>
    </div>`;
}

// ---------- Library ----------
function listEncounters(){ return load('tp_dm_encounters', []); }
function upsertEncounter(enc){
  const all = listEncounters();
  const idx = all.findIndex(x=>x.id===enc.id);
  if(idx>=0) all[idx] = enc; else all.push(enc);
  save('tp_dm_encounters', all);
  STATE.library = all; renderEncList();
}
function renderEncList(){
  const root = $('#encList'), all = STATE.library;
  root.innerHTML = all.length
    ? all.map(e=>`<div class="row"><div class="left"><strong>${e.name}</strong>
        <small>${e.groups.length} groups • party ${e.partySnapshot?.levels?.join(", ") || "—"}</small></div>
        <div class="right"><button class="btn ghost" data-act="load-enc" data-id="${e.id}">Load</button>
        <button class="btn ghost" data-act="del-enc" data-id="${e.id}">Delete</button></div></div>`).join('')
    : '<div class="helper">No saved encounters yet.</div>';
}
function onEncListClick(e){
  const id = e.target.getAttribute('data-id'), act = e.target.getAttribute('data-act'); if(!act) return;
  const all = listEncounters();
  if(act === 'load-enc'){
    const enc = all.find(x=>x.id===id); if(!enc) return;
    STATE.ruleset = enc.ruleset || "2014"; STATE.groups = enc.groups || [];
    STATE.partySel = (enc.partySel && enc.partySel.length) ? enc.partySel : STATE.party.map(p=>p.id);
    saveBuilder(); renderGroups(); renderPartyBox(); renderDiff(); switchTab('setup');
  }
  if(act === 'del-enc'){ const next = all.filter(x=>x.id!==id); save('tp_dm_encounters', next); STATE.library = next; renderEncList(); }
}
function onSaveEncounter(){
  const name = prompt("Name this encounter:", "New Encounter"); if(!name) return;
  const enc = {
    id: uid('e_'), name, ruleset: STATE.ruleset, scene: STATE.scene,
    groups: STATE.groups, partySel: STATE.partySel,
    partySnapshot: { size: STATE.partySel.length, levels: STATE.party.filter(p=>STATE.partySel.includes(p.id)).map(p=>p.level||1) }
  };
  upsertEncounter(enc); alert("Encounter saved.");
}

// ---------- Builder cache ----------
function saveBuilder(){ save('tp_dm_enc_builder', { groups: STATE.groups, partySel: STATE.partySel, ruleset: STATE.ruleset }); }
function loadBuilder(){ const s = load('tp_dm_enc_builder', {}); if(s.groups) STATE.groups = s.groups; if(s.partySel) STATE.partySel = s.partySel; if(s.ruleset) STATE.ruleset = s.ruleset; }

// ---------- Results ----------
function onApplyInput(e){ const el=e.target.closest('input[data-act="hp-adj"]'); if(!el) return; STATE.hpAdjust[ el.getAttribute('data-id') ] = parseInt(el.value || '0', 10); }
function onApplyToParty(){
  const party = getParty(); let changed = 0;
  party.forEach(p=>{
    const d = STATE.hpAdjust[p.id] || 0;
    if(d !== 0){
      const newHp = clamp((p.hp||0) + d, 0, p.hpMax || ((p.hp||0) + Math.max(0,d)));
      if(newHp !== p.hp){ p.hp = newHp; changed++; }
    }
  });
  save('tp_cc_characters', party); loadParty(); renderPartyBox();
  alert(changed ? `Updated ${changed} character(s).` : "No changes to apply.");
}

// ---------- Dropdown behaviour ----------
function onAtkEntityChange(){
  const v = document.getElementById('atk-entity').value;
  const ent = getEntityByValue(v);
  if(ent && ent.name && ent.xp !== undefined){
    qp(''+(ent.tohit||0),'atk-bonus'); qp(''+(ent.attacks||1),'atk-count'); qpDice(ent.dice||'','atk-dice');
  }
}
function onTgtEntityChange(){
  const v = document.getElementById('tgt-entity').value;
  const ent = getEntityByValue(v);
  if(ent && typeof ent.ac !== 'undefined'){ qp(''+(ent.ac||10), 'tgt-ac'); }
}
function onSvTargetChange(){}

// ---------- NEW: Catalog selection handler ----------
function onCatalogChange(){
  const sel = document.getElementById('m-catalog');
  const id = sel?.value;
  if(!id) return;
  const row = findPublishedById(id);
  if(!row) return;
  setFromCatalogRow(row);
  showToast(`Loaded ${row.name} from Admin.`, 'success');
}

// ---------- Tabs & wiring ----------
function switchTab(tab){
  document.querySelectorAll('.tabpanel').forEach(p => p.hidden = true);
  document.querySelector(`#tab-${tab}`).hidden = false;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.getAttribute('data-tab') === tab ? 'true':'false'));
}
function onTabClick(e){ const btn = e.target.closest('.tab'); if(!btn) return; switchTab(btn.getAttribute('data-tab')); }
function onPartyToggle(e){
  const cb = e.target.closest('input[type="checkbox"][data-id]'); if(!cb) return;
  const id = cb.getAttribute('data-id');
  if(cb.checked){ if(!STATE.partySel.includes(id)) STATE.partySel.push(id); }
  else { STATE.partySel = STATE.partySel.filter(x=>x!==id); }
  saveBuilder(); renderDiff();
}
function onMonsterForm(e){
  e.preventDefault();
  // Try to auto-fill if user typed a known enemy name
  autofillFromPublished();

  const name = $('#m-name').value.trim() || 'Creature';
  const cr = $('#m-cr').value.trim() || '';
  const xp = parseInt($('#m-xp').value || (XP_BY_CR[cr]||0), 10);
  const ac = parseInt($('#m-ac').value || '10', 10);
  const hp = parseInt($('#m-hp').value || '1', 10);
  const attacks = parseInt($('#m-attacks').value || '1', 10);
  const tohit = parseInt($('#m-tohit').value || '0', 10);
  const dice = $('#m-dice').value.trim();
  const count = parseInt($('#m-count').value || '1', 10);
  addGroup({name,cr,xp,ac,hp,attacks,tohit,dice,count});
  e.target.reset();
  // Reset catalog select
  const sel = document.getElementById('m-catalog'); if(sel) { sel.value = ''; }
}
function onGroupsList(e){
  const id = e.target.getAttribute('data-id'), act = e.target.getAttribute('data-act'); if(!act) return;
  if(act === 'g-del')  return removeGroup(id);
  if(act === 'g-count') return updateGroup(id, 'count', parseInt(e.target.value || '1', 10));
}
function onRulesetToggle(){ STATE.ruleset = $('#ruleset2024').checked ? '2024' : '2014'; saveBuilder(); renderDiff(); }

// ---------- Inject Enemy Admin button (optional; adapter also does this) ----------
function injectEnemyAdminButton(){
  if (!window.EnemiesAdapter) return;
  if (document.getElementById('btn-enemy-admin')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-enemy-admin';
  btn.className = 'btn ghost';
  btn.type = 'button';
  btn.textContent = 'Enemy Admin';
  btn.style.marginLeft = '.5rem';
  btn.addEventListener('click', () => window.EnemiesAdapter.openAdmin());

  const host = document.querySelector('header .actions');
  if(host){ host.appendChild(btn); return; }
  const floater = btn.cloneNode(true);
  floater.style.position = 'fixed'; floater.style.right = '1rem'; floater.style.bottom = '1rem'; floater.style.zIndex = '9999';
  document.body.appendChild(floater);
}

// ---------- Boot ----------
function boot(){
  document.addEventListener('click', onTabClick);

  // Adapter & Admin integration
  enemiesSubscribe();
  document.getElementById('m-name')?.addEventListener('blur', autofillFromPublished);
  document.getElementById('m-catalog')?.addEventListener('change', onCatalogChange);
  injectEnemyAdminButton();

  // Party
  loadParty();
  if(!STATE.partySel.length) STATE.partySel = STATE.party.map(p=>p.id);
  renderPartyBox();
  $('#partyBox').addEventListener('change', onPartyToggle);
  $('#btn-refresh-party').addEventListener('click', ()=>{ loadParty(); renderPartyBox(); renderDiff(); });

  // Groups
  loadBuilder(); renderGroups();
  $('#monsterForm').addEventListener('submit', onMonsterForm);
  $('#groupsList').addEventListener('input', onGroupsList);
  $('#groupsList').addEventListener('click', onGroupsList);

  // Difficulty
  renderDiff();
  $('#ruleset2024').addEventListener('change', onRulesetToggle);

  // Calculators
  $('#calc-attack').addEventListener('submit', onCalcAttack);
  $('#calc-save').addEventListener('submit', onCalcSave);
  $('#calc-conc').addEventListener('submit', onCalcConc);

  // Results
  $('#applyBox').addEventListener('input', onApplyInput);
  $('#btn-apply-party').addEventListener('click', onApplyToParty);

  // Library
  STATE.library = listEncounters(); renderEncList();
  $('#encList').addEventListener('click', onEncListClick);
  $('#btn-save-enc').addEventListener('click', onSaveEncounter);

  // Dropdowns
  buildCalcEntityOptions();
  document.getElementById('atk-entity')?.addEventListener('change', onAtkEntityChange);
  document.getElementById('tgt-entity')?.addEventListener('change', onTgtEntityChange);
  document.getElementById('sv-target-entity')?.addEventListener('change', onSvTargetChange);

  // Demo / Diagnostics
  document.getElementById('btn-load-demo')?.addEventListener('click', loadDemoEncounter);
  document.getElementById('btn-load-sample-party')?.addEventListener('click', loadSampleParty);
  document.getElementById('btn-run-diagnostics')?.addEventListener('click', runDiagnostics);
}
boot();
