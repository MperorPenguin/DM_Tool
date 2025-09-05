// Enemy Builder (Admin) — vanilla JS
// Keys:
//   'tp_bestiary_v1'       (authoring data, admin-only)
//   'tp_enemies_data_v1'   (published minimal array for Encounters)
//   'tp_enemies_public_v1' (ping for cross-tab updates)

(() => {
  const BESTIARY_KEY = 'tp_bestiary_v1';
  const PUBLISH_DATA = 'tp_enemies_data_v1';
  const PUBLISH_PING = 'tp_enemies_public_v1';

  const CR_XP = {
    '0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700,'4':1100,'5':1800,'6':2300,'7':2900,'8':3900,'9':5000,'10':5900,
    '11':7200,'12':8400,'13':10000,'14':11500,'15':13000,'16':15000,'17':18000,'18':20000,'19':22000,'20':25000,
    '21':33000,'22':41000,'23':50000,'24':62000,'25':75000,'26':90000,'27':105000,'28':120000,'29':135000,'30':155000
  };
  const CR_SET = new Set(Object.keys(CR_XP));

  const el = (s,r=document)=>r.querySelector(s);
  const byId = id => document.getElementById(id);
  const slug = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

  const state = { list: [], filtered: [], currentId: null };

  function defaultEnemy(){
    return {
      id: crypto.randomUUID(),
      name: 'Goblin Skirmisher',
      size: 'Small',
      type: 'Humanoid',
      alignment: 'Neutral Evil',
      cr: '1/4',
      ac: 15,
      hp: 11,
      speed: '30 ft.',
      abilities: { str:8, dex:14, con:10, int:10, wis:8, cha:8 },
      skills: 'Stealth +6, Perception +2',
      senses: 'Darkvision 60 ft., Passive Perception 12',
      languages: 'Common, Goblin',
      traits: 'Nimble Escape. The goblin can Disengage or Hide as a bonus action on each of its turns.',
      actions: 'Scimitar. *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) slashing damage.',
      reactions: '',
      legendary: '',
      tags: ['goblin','skirmisher','ranged'],
      source: 'Homebrew',
      notes: ''
    };
  }

  // Load/Save
  function load(){
    try { state.list = JSON.parse(localStorage.getItem(BESTIARY_KEY) || '[]'); }
    catch { state.list = []; }
    if(!Array.isArray(state.list)) state.list = [];
    state.filtered = state.list.slice();
    renderList();
  }
  function save(){
    localStorage.setItem(BESTIARY_KEY, JSON.stringify(state.list));
    filterAndRender();
  }

  // Filter/List
  function filterAndRender(){
    const q = byId('search').value.trim().toLowerCase();
    const t = byId('filter-type').value;
    const crMax = byId('filter-cr').value;
    state.filtered = state.list.filter(e=>{
      const hay = [e.name, e.type, e.cr, (e.tags||[]).join(',')].join(' ').toLowerCase();
      if(q && !hay.includes(q)) return false;
      if(t && e.type !== t) return false;
      if(crMax){
        const toNum = v => ({'0':0,'1/8':0.125,'1/4':0.25,'1/2':0.5}[v] ?? Number(v));
        if(toNum(e.cr) > toNum(crMax)) return false;
      }
      return true;
    });
    renderList();
  }
  function renderList(){
    const list = byId('enemy-list'); list.innerHTML = '';
    const tpl = byId('enemy-row');
    state.filtered.forEach(e=>{
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = e.id;
      node.querySelector('.name').textContent = e.name;
      node.querySelector('.sub').textContent = `CR ${e.cr} · AC ${e.ac} · ${e.type}`;
      if(state.currentId === e.id) node.classList.add('active');
      node.querySelector('.select').addEventListener('click', () => edit(e.id));
      node.addEventListener('click', () => edit(e.id));
      list.appendChild(node);
    });
  }

  // Editor
  function edit(id){
    state.currentId = id;
    const e = state.list.find(x=>x.id===id); if(!e) return;
    byId('name').value = e.name || '';
    byId('size').value = e.size || 'Medium';
    byId('type').value = e.type || 'Humanoid';
    byId('alignment').value = e.alignment || '';
    byId('cr').value = e.cr || '1/4';
    byId('tags').value = (e.tags||[]).join(', ');
    byId('ac').value = e.ac ?? 10;
    byId('hp').value = e.hp ?? 1;
    byId('speed').value = e.speed || '';
    const ab = e.abilities || {};
    byId('str').value = ab.str ?? 10; byId('dex').value = ab.dex ?? 10; byId('con').value = ab.con ?? 10;
    byId('int').value = ab.int ?? 10; byId('wis').value = ab.wis ?? 10; byId('cha').value = ab.cha ?? 10;
    byId('skills').value = e.skills || ''; byId('senses').value = e.senses || ''; byId('languages').value = e.languages || '';
    byId('traits').value = e.traits || ''; byId('actions').value = e.actions || '';
    byId('reactions').value = e.reactions || ''; byId('legendary').value = e.legendary || '';
    byId('source').value = e.source || ''; byId('notes').value = e.notes || '';
    renderList();
  }
  function serializeForm(){
    const cur = state.list.find(e => e.id === state.currentId) ?? defaultEnemy();
    return {
      ...cur,
      name: byId('name').value.trim() || 'Unnamed Enemy',
      size: byId('size').value,
      type: byId('type').value,
      alignment: byId('alignment').value.trim(),
      cr: byId('cr').value,
      ac: clamp(int(byId('ac').value, 15), 1, 30),
      hp: clamp(int(byId('hp').value, 1), 1, 10000),
      speed: byId('speed').value.trim(),
      abilities: {
        str: int(byId('str').value, 10), dex: int(byId('dex').value, 10), con: int(byId('con').value, 10),
        int: int(byId('int').value, 10), wis: int(byId('wis').value, 10), cha: int(byId('cha').value, 10),
      },
      skills: byId('skills').value.trim(),
      senses: byId('senses').value.trim(),
      languages: byId('languages').value.trim(),
      traits: byId('traits').value.trim(),
      actions: byId('actions').value.trim(),
      reactions: byId('reactions').value.trim(),
      legendary: byId('legendary').value.trim(),
      tags: byId('tags').value.split(',').map(s => s.trim()).filter(Boolean),
      source: byId('source').value.trim(),
      notes: byId('notes').value.trim()
    };
  }
  function upsertEnemy(data){
    const idx = state.list.findIndex(x=>x.id===data.id);
    if(idx === -1) state.list.unshift(data); else state.list[idx] = data;
    state.currentId = data.id; save();
  }
  function removeEnemy(id){
    const idx = state.list.findIndex(x=>x.id===id);
    if(idx !== -1){ state.list.splice(idx,1); save(); }
    if(state.currentId === id) state.currentId = null;
    if(state.list[0]) edit(state.list[0].id);
  }
  function duplicateEnemy(id){
    const e = state.list.find(x=>x.id===id); if(!e) return;
    const copy = JSON.parse(JSON.stringify(e));
    copy.id = crypto.randomUUID(); copy.name = e.name + ' (Copy)';
    state.list.unshift(copy); save(); edit(copy.id);
  }

  // Validation (blocks publish with precise reasons)
  function isIntIn(v, lo, hi){ return Number.isInteger(v) && v >= lo && v <= hi; }
  function validateArray(arr){
    const errors=[], warnings=[], valid=[], seenIds=new Set();
    if(!Array.isArray(arr)) return { ok:false, valid:[], errors:["Published data is not an array"], warnings };
    arr.forEach((e,i)=>{
      const where=`Enemy[${i}]`;
      if(typeof e!=='object'||!e){ errors.push(`${where}: not an object`); return; }
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

  // Publish / IO
  function publish(){
    const mini = state.list.map(e => ({
      id:e.id, slug:slug(e.name), name:e.name, size:e.size, type:e.type, alignment:e.alignment,
      cr:e.cr, xp:CR_XP[e.cr] ?? 0, ac:e.ac, hp:e.hp, speed:e.speed, abilities:e.abilities,
      skills:e.skills, senses:e.senses, languages:e.languages, traits:e.traits, actions:e.actions,
      reactions:e.reactions, legendary:e.legendary, tags:e.tags, source:e.source
    }));
    const { ok, valid, errors, warnings } = validateArray(mini);
    if(!ok){
      alert(`Publish blocked.\n\nFound ${errors.length} error(s):\n\n` +
        errors.slice(0,10).join('\n') + (errors.length>10?`\n…and ${errors.length-10} more.`:''));
      return;
    }
    localStorage.setItem(PUBLISH_DATA, JSON.stringify(valid));
    localStorage.setItem(PUBLISH_PING, JSON.stringify({ updatedAt: Date.now(), count: valid.length }));
    // Broadcast for instant sync
    try { const bc = new BroadcastChannel('tp_enemies'); bc.postMessage({ type:'publish', updatedAt:Date.now(), count: valid.length }); bc.close?.(); } catch {}
    if(warnings.length){ console.group('[Enemy Admin] Publish warnings'); warnings.forEach(w=>console.warn(w)); console.groupEnd(); }
    alert(`Published ${valid.length} enemies to Encounters.`);
  }
  function exportJSON(){
    const blob = new Blob([JSON.stringify(state.list, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bestiary-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  }
  function importJSON(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const arr = JSON.parse(String(reader.result));
        if(Array.isArray(arr)){
          const cleaned = arr.map(e => ({...defaultEnemy(), ...e, id: e.id || crypto.randomUUID()}));
          state.list = cleaned; save(); if(state.list[0]) edit(state.list[0].id);
          alert(`Imported ${state.list.length} enemies.`);
        } else throw 0;
      } catch { alert('Invalid JSON file. Expecting an array of enemies.'); }
    };
    reader.readAsText(file);
  }

  // Quick Generate
  function quickGenerate(){
    if(state.list.length) return alert('Quick Generate only on an empty list (to avoid duplicates).');
    const templates = [
      { name:'Goblin Skirmisher', size:'Small', type:'Humanoid', ac:15, hp:11, cr:'1/4',
        abilities:{str:8,dex:14,con:10,int:10,wis:8,cha:8},
        skills:'Stealth +6, Perception +2', senses:'Darkvision 60 ft., Passive Perception 12',
        languages:'Common, Goblin', traits:'Nimble Escape.', actions:'Scimitar. +4 to hit; 1d6+2 slashing.', tags:['goblin','skirmisher'] },
      { name:'Bandit', size:'Medium', type:'Humanoid', ac:12, hp:11, cr:'1/8',
        abilities:{str:11,dex:12,con:12,int:10,wis:10,cha:10},
        senses:'Passive Perception 10', languages:'Any one (usually Common)',
        traits:'Pack Tactics (variant).', actions:'Scimitar +3; Crossbow +3.', tags:['humanoid','bandit'] },
      { name:'Orc', size:'Medium', type:'Humanoid', ac:13, hp:15, cr:'1/2',
        abilities:{str:16,dex:12,con:16,int:7,wis:11,cha:10},
        skills:'Intimidation +2', senses:'Darkvision 60 ft., Passive Perception 10',
        languages:'Common, Orc', traits:'Aggressive.', actions:'Greataxe +5; 1d12+3 slashing.', tags:['orc','brute'] },
    ];
    state.list = templates.map(t => ({...defaultEnemy(), ...t, id: crypto.randomUUID()}));
    save(); edit(state.list[0].id);
  }

  // Helpers
  const int = (v, d=0) => Number.parseInt(String(v),10) || d;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Events
  byId('btn-new').addEventListener('click', () => { const e = defaultEnemy(); state.list.unshift(e); save(); edit(e.id); });
  byId('btn-bulk').addEventListener('click', quickGenerate);
  byId('btn-export').addEventListener('click', exportJSON);
  byId('btn-import').addEventListener('click', () => byId('file-import').click());
  byId('file-import').addEventListener('change', (ev) => { const f = ev.target.files?.[0]; if(f) importJSON(f); ev.target.value=''; });
  byId('btn-publish').addEventListener('click', publish);
  byId('btn-delete').addEventListener('click', () => { if(!state.currentId) return; if(confirm('Delete this enemy?')) removeEnemy(state.currentId); });
  byId('btn-duplicate').addEventListener('click', () => { if(state.currentId) duplicateEnemy(state.currentId); });

  byId('enemy-form').addEventListener('submit', (ev) => { ev.preventDefault(); upsertEnemy(serializeForm()); });
  byId('search').addEventListener('input', filterAndRender);
  byId('filter-type').addEventListener('change', filterAndRender);
  byId('filter-cr').addEventListener('change', filterAndRender);

  // Init
  load();
  if(!state.list.length){ const e = defaultEnemy(); state.list=[e]; save(); edit(e.id); } else edit(state.list[0].id);
})();
