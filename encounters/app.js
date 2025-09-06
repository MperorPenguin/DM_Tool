/* Encounter Builder — Encounters (reworked: dropdown-first + ruleset toggle + Enemies Admin hooks) */
"use strict";

/* ---------- Storage helpers ---------- */
const load = (k, d) => JSON.parse(localStorage.getItem(k) || JSON.stringify(d));
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

/* ---------- Rules data ---------- */
const THRESHOLDS_2014 = {
  1:[25,50,75,100],  2:[50,100,150,200],  3:[75,150,225,400],  4:[125,250,375,500],
  5:[250,500,750,1100], 6:[300,600,900,1400], 7:[350,750,1100,1700], 8:[450,900,1400,2100],
  9:[550,1100,1600,2400], 10:[600,1200,1900,2800], 11:[800,1600,2400,3600], 12:[1000,2000,3000,4500],
  13:[1100,2200,3400,5100], 14:[1250,2500,3800,5700], 15:[1400,2800,4300,6400], 16:[1600,3200,4800,7200],
  17:[2000,3900,5900,8800], 18:[2100,4200,6300,9500], 19:[2400,4900,7300,10900], 20:[2800,5700,8500,12700]
};
/* Placeholder: until you supply the 2024 DMG budgets, we mirror 2014 so the UI flows. */
const THRESHOLDS_2024 = THRESHOLDS_2014;

/* CR → XP (2014 DMG) */
const XP_BY_CR = {
  "0":10,"1/8":25,"1/4":50,"1/2":100, 1:200,2:450,3:700,4:1100,5:1800,6:2300,7:2900,8:3900,9:5000,10:5900,
  11:7200,12:8400,13:10000,14:11500,15:13000,16:15000,17:18000,18:20000,19:22000,20:25000,21:33000,22:41000,
  23:50000,24:62000,25:75000,26:90000,27:105000,28:120000,29:135000,30:155000
};

/* ---------- App state ---------- */
let STATE = {
  party: [],              // full CC list (read-only)
  partySel: [],           // selected party subset (ids or inline entries)
  ruleset: "2014",        // "2014" | "2024"
  groups: [],             // [{id,name,cr,xp,ac,hp,count}]
  library: load("tp_dm_encounters", []),
  hpAdjust: {}
};

/* ---------- Shorthands ---------- */
const $  = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const uid = (p="id") => p + Math.random().toString(36).slice(2,8);
const round = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;

/* ---------- Enemies Admin integration ---------- */
let PUBLISHED = []; // external catalog, shape: { id, name, cr, xp, ac, hp }
function initEnemiesAdapter(){
  if (!window.EnemiesAdapter) return;
  if (window.EnemiesAdapter.subscribe){
    window.EnemiesAdapter.subscribe((list) => {
      PUBLISHED = Array.isArray(list) ? list : [];
      showToast(`Enemies loaded: ${PUBLISHED.length}`, "success");
      // if a name is typed, try to backfill on next render
    });
  }
  if (window.EnemiesAdapter.subscribeStatus){
    window.EnemiesAdapter.subscribeStatus((st) => {
      if (st && st.ok) {
        if (st.warnings && st.warnings.length){
          showToast(`Enemies validated with ${st.warnings.length} warning(s)`, "info");
        }
      } else {
        showToast("Enemy Admin data failed validation", "error");
      }
    });
  }
  const btn = $("#btn-open-admin");
  if (btn) btn.addEventListener("click", () => window.EnemiesAdapter && window.EnemiesAdapter.openAdmin && window.EnemiesAdapter.openAdmin());
}
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

/* ---------- Party ---------- */
function getParty(){ return load("tp_cc_characters", []); }
function loadParty(){
  STATE.party = getParty();
  // default selected party is everyone in CC
  STATE.partySel = (STATE.party || []).map(p => ({ id:p.id||uid("pc_"), name:p.name||"PC", level:parseInt(p.level||1,10) }));
}
function renderParty(){
  const root = $("#partyList");
  if (!STATE.partySel.length){
    root.innerHTML = `<div class="helper">No party selected yet. Use the form below to add ad‑hoc members.</div>`;
    return;
  }
  root.innerHTML = STATE.partySel.map(p => `
    <div class="row">
      <div><strong>${p.name}</strong><small> L${p.level||1}</small></div>
      <div class="row-actions">
        <button class="btn ghost sm" data-act="pc-lvl" data-id="${p.id}" data-delta="-1">−</button>
        <button class="btn ghost sm" data-act="pc-lvl" data-id="${p.id}" data-delta="1">+</button>
        <button class="btn ghost sm" data-act="pc-del" data-id="${p.id}">Remove</button>
      </div>
    </div>
  `).join("");
}
function onPartyAdd(e){
  e.preventDefault();
  const name = $("#pc-name").value.trim() || "PC";
  const lvl  = parseInt($("#pc-lvl").value || "1", 10);
  STATE.partySel.push({ id: uid("pc_"), name, level: clamp(lvl,1,20) });
  $("#pc-name").value = ""; $("#pc-lvl").value = "";
  renderParty(); renderDiff(); persist();
}
function onPartyAction(e){
  const t = e.target.closest("button[data-act]"); if(!t) return;
  const id = t.dataset.id;
  if (t.dataset.act === "pc-del"){
    STATE.partySel = STATE.partySel.filter(p => p.id !== id);
  } else if (t.dataset.act === "pc-lvl"){
    const d = parseInt(t.dataset.delta||"0",10);
    const p = STATE.partySel.find(p=>p.id===id); if (p){ p.level = clamp((p.level||1)+d,1,20); }
  }
  renderParty(); renderDiff(); persist();
}

/* ---------- Groups ---------- */
function renderGroups(){
  const root = $("#groupsList");
  if (!STATE.groups.length){
    root.innerHTML = `<div class="helper">No monster groups added yet. Use the builder above.</div>`;
    return;
  }
  root.innerHTML = STATE.groups.map(g => `
    <div class="row">
      <div><strong>${g.name||"Monster"}</strong>
        <small> CR ${g.cr||"?"} • XP ${g.xp||0} • AC ${g.ac||"-"} • HP ${g.hp||"-"} × ${g.count||1}</small>
      </div>
      <div class="row-actions">
        <button class="btn ghost sm" data-act="g-count" data-id="${g.id}" data-delta="-1">−</button>
        <button class="btn ghost sm" data-act="g-count" data-id="${g.id}" data-delta="1">+</button>
        <button class="btn ghost sm" data-act="g-del" data-id="${g.id}">Remove</button>
      </div>
    </div>
  `).join("");
}
function onGroupSubmit(e){
  e.preventDefault();
  const name = $("#m-name").value.trim() || "Monster";
  const cr   = $("#m-cr").value.trim();
  const xp   = parseInt($("#m-xp").value || (XP_BY_CR[cr]||0), 10) || 0;
  const ac   = parseInt($("#m-ac").value || "0", 10);
  const hp   = parseInt($("#m-hp").value || "0", 10);
  const count= Math.max(1, parseInt($("#m-count").value || "1", 10));
  STATE.groups.push({ id: uid("g_"), name, cr, xp, ac, hp, count });
  $("#groupForm").reset();
  renderGroups(); renderDiff(); persist();
}
function onGroupAction(e){
  const t = e.target.closest("button[data-act]"); if(!t) return;
  const id = t.dataset.id;
  if (t.dataset.act === "g-del"){
    STATE.groups = STATE.groups.filter(g => g.id !== id);
  } else if (t.dataset.act === "g-count"){
    const d = parseInt(t.dataset.delta||"0",10);
    const g = STATE.groups.find(g=>g.id===id); if (g){ g.count = Math.max(1, (g.count||1)+d); }
  }
  renderGroups(); renderDiff(); persist();
}

/* ---------- Autofill from Admin ---------- */
function tryAutofillFromAdmin(){
  const q = $("#m-name").value;
  const row = findPublishedByNameLike(q);
  if (!row) return;
  if (row.cr != null)   $("#m-cr").value = String(row.cr);
  const xp = (row.xp != null) ? row.xp : (XP_BY_CR[row.cr]||"");
  if (xp !== "") $("#m-xp").value = xp;
  if (row.ac != null)   $("#m-ac").value = String(row.ac);
  if (row.hp != null)   $("#m-hp").value = String(row.hp);
}

/* ---------- Math ---------- */
function monsterMultiplier(n){
  if (n <= 1) return 1;
  if (n === 2) return 1.5;
  if (n <= 6)  return 2;
  if (n <= 10) return 2.5;
  if (n <= 14) return 3;
  return 4;
}
function thresholds(levels, ruleset){
  const tbl = (ruleset === "2024") ? THRESHOLDS_2024 : THRESHOLDS_2014;
  const sum = levels.reduce((acc,l)=>{
    const r = tbl[l] || tbl[1];
    return [acc[0]+r[0], acc[1]+r[1], acc[2]+r[2], acc[3]+r[3]];
  }, [0,0,0,0]);
  return { easy:sum[0], med:sum[1], hard:sum[2], deadly:sum[3] };
}
function totalMonsters(){ return STATE.groups.reduce((s,g)=>s+(g.count||1),0); }
function totalBaseXP(){ return STATE.groups.reduce((s,g)=>s+(g.xp*(g.count||1)),0); }
function partyLevels(){ return STATE.partySel.map(p => clamp(parseInt(p.level||1,10),1,20)); }

function difficulty(ruleset){
  const t = thresholds(partyLevels(), ruleset);
  const base = totalBaseXP();
  const mult = (ruleset === "2014") ? monsterMultiplier(totalMonsters()) : 1;
  const adj  = Math.round(base * mult);
  let band = "Deadly";
  if (adj <= t.easy) band = "Easy";
  else if (adj <= t.med) band = "Medium";
  else if (adj <= t.hard) band = "Hard";
  return { t, base, mult, adjusted: adj, band };
}

/* ---------- Calculators ---------- */
function hitChance(attackBonus, targetAC, adv="normal"){
  const p = clamp((21 + attackBonus - targetAC)/20, 0.05, 0.95);
  if(adv==='adv') return 1 - (1 - p)**2;
  if(adv==='dis') return p**2;
  return p;
}
function onCalcAttack(e){
  e.preventDefault();
  const atk = parseInt(($("#atk-bonus").value||"").replace("+","")||"0",10);
  const ac  = parseInt($("#tgt-ac").value || "0", 10);
  const adv = $("#atk-adv").value || "normal";
  const p = hitChance(atk, ac, adv);
  $("#atkOut").innerHTML = `
    <div class="grid cols-4 tight">
      <div class="pill">Hit% <strong>${(p*100).toFixed(1)}%</strong></div>
      <div class="pill">Miss% <strong>${((1-p)*100).toFixed(1)}%</strong></div>
      <div class="pill">Expected Hits/Attack <strong>${p.toFixed(3)}</strong></div>
      <div class="pill">Advantage <strong>${adv}</strong></div>
    </div>`;
}

function saveSuccess(conBonus, dc, adv="normal"){
  const need = dc - conBonus;
  const baseSuc = clamp((21 - need)/20, 0, 1);
  if(adv==='adv') return 1 - (1 - baseSuc)**2;
  if(adv==='dis') return baseSuc**2;
  return baseSuc;
}
function onCalcSave(e){
  e.preventDefault();
  const bonus = parseInt(($("#sv-bonus").value||"").replace("+","")||"0",10);
  const dc    = parseInt($("#sv-dc").value || "0", 10);
  const adv   = $("#sv-adv").value || "normal";
  const half  = ($("#sv-half").value||"no") === "yes";
  const suc   = saveSuccess(bonus, dc, adv);
  const fail  = 1 - suc;
  $("#svOut").innerHTML = `
    <div class="grid cols-4 tight">
      <div class="pill">Success% <strong>${(suc*100).toFixed(1)}%</strong></div>
      <div class="pill">Fail% <strong>${(fail*100).toFixed(1)}%</strong></div>
      <div class="pill">Half on Save <strong>${half ? "Yes" : "No"}</strong></div>
      <div class="pill">Advantage <strong>${adv}</strong></div>
    </div>`;
}

/* ---------- Difficulty UI ---------- */
function renderDiff(){
  const out = $("#diffReadout");
  const { t, base, mult, adjusted, band } = difficulty(STATE.ruleset);
  const nMon = totalMonsters();
  const levels = partyLevels();
  const countByLevel = levels.reduce((m,l)=>{ m[l]=(m[l]||0)+1; return m; }, {});
  const levelSummary = Object.keys(countByLevel).sort((a,b)=>+a-+b).map(l=>`L${l}×${countByLevel[l]}`).join(" • ") || "—";

  const pct = (x, max) => round((x / Math.max(1,max)) * 100);
  const maxBar = Math.max(t.deadly, adjusted);
  const wEasy=pct(t.easy, maxBar), wMed=pct(t.med, maxBar), wHard=pct(t.hard, maxBar), wAdj=pct(adjusted, maxBar);

  out.innerHTML = `
    <div class="grid cols-4 tight">
      <div class="pill">Party <strong>${STATE.partySel.length} PCs</strong><small>${levelSummary}</small></div>
      <div class="pill">Monsters <strong>${nMon}</strong><small>${STATE.groups.length} group(s)</small></div>
      <div class="pill">Base XP <strong>${base.toLocaleString()}</strong><small>${STATE.ruleset==="2014" ? "multiplied by count" : "no multiplier"}</small></div>
      <div class="pill">Band <strong>${band}</strong><small>${STATE.ruleset}</small></div>
    </div>
    <div class="bargraph" role="img" aria-label="Encounter budget bars">
      <div class="band easy"  style="width:${wEasy}%">Easy</div>
      <div class="band med"   style="width:${wMed}%">Medium</div>
      <div class="band hard"  style="width:${wHard}%">Hard</div>
      <div class="marker" style="left:${wAdj}%"></div>
    </div>
  `;
}

/* ---------- Persist ---------- */
function persist(){ save("tp_dm_encounters", STATE.library || []); /* slot for future: save current encounter too if desired */ }

/* ---------- Tabs & events ---------- */
function switchTab(id){
  $$(".tabpanel").forEach(el => el.hidden = true);
  $$(".tab").forEach(b => b.setAttribute("aria-selected", "false"));
  $("#tab-"+id).hidden = false;
  document.querySelector(`.tab[data-tab="${id}"]`).setAttribute("aria-selected","true");
}
function initTabs(){
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

/* ---------- Toast ---------- */
function showToast(msg, type="info"){
  const box = $("#toast"); if(!box) return;
  box.textContent = msg;
  box.className = "toast " + type;
  setTimeout(()=>{ box.className = "toast"; }, 3000);
}

/* ---------- Wire up ---------- */
function init(){
  initTabs();
  initEnemiesAdapter();

  // load party
  loadParty();
  renderParty();

  // ruleset toggle
  const rs = $("#ruleset2024");
  if (rs){
    rs.checked = (STATE.ruleset === "2024");
    rs.addEventListener("change", () => { STATE.ruleset = rs.checked ? "2024" : "2014"; renderDiff(); });
  }

  // party add & actions
  const formPC = $("#partyAdd"); if (formPC) formPC.addEventListener("submit", onPartyAdd);
  $("#partyList")?.addEventListener("click", onPartyAction);

  // group form
  const formG = $("#groupForm"); if (formG) formG.addEventListener("submit", onGroupSubmit);
  $("#groupsList")?.addEventListener("click", onGroupAction);

  // group autofill from admin by name focusout
  $("#m-name")?.addEventListener("blur", tryAutofillFromAdmin);
  $("#m-cr")?.addEventListener("change", () => {
    const cr = $("#m-cr").value;
    const xp = XP_BY_CR[cr];
    if (xp != null) $("#m-xp").value = xp;
  });

  // calculators
  $("#calc-attack")?.addEventListener("submit", onCalcAttack);
  $("#calc-save")?.addEventListener("submit", onCalcSave);

  // initial render
  renderGroups();
  renderDiff();
}

// Boot
document.addEventListener("DOMContentLoaded", init);
