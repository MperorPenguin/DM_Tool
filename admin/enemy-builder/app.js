// =============== app.js ===============
skills: e.skills,
senses: e.senses,
languages: e.languages,
traits: e.traits,
actions: e.actions,
reactions: e.reactions,
legendary: e.legendary,
tags: e.tags,
source: e.source
}));


localStorage.setItem(PUBLISH_DATA, JSON.stringify(mini));
// tiny ping for storage listeners
localStorage.setItem(PUBLISH_PING, JSON.stringify({ updatedAt: Date.now(), count: mini.length }));
alert(`Published ${mini.length} enemies to localStorage. Key: ${PUBLISH_DATA}`);
}


function exportJSON(){
const blob = new Blob([JSON.stringify(state.list, null, 2)], {type:'application/json'});
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = `bestiary-${new Date().toISOString().slice(0,10)}.json`;
a.click();
URL.revokeObjectURL(a.href);
}


function importJSON(file){
const reader = new FileReader();
reader.onload = () => {
try {
const arr = JSON.parse(String(reader.result));
if(Array.isArray(arr)){
// very light validation
const cleaned = arr.map((e) => ({...defaultEnemy(), ...e, id: e.id || crypto.randomUUID()}));
state.list = cleaned;
save();
if(state.list[0]) edit(state.list[0].id);
alert(`Imported ${state.list.length} enemies.`);
} else throw 0;
} catch { alert('Invalid JSON file. Expecting an array of enemies.'); }
};
reader.readAsText(file);
}


// Quick generator: drops a few starting enemies
function quickGenerate(){
if(state.list.length) return alert('Quick Generate only on an empty list (to avoid duplicates). You can still add templates manually.');
const templates = [
{ name:'Goblin Skirmisher', size:'Small', type:'Humanoid', ac:15, hp:11, cr:'1/4', abilities:{str:8,dex:14,con:10,int:10,wis:8,cha:8}, skills:'Stealth +6, Perception +2', senses:'Darkvision 60 ft., Passive Perception 12', languages:'Common, Goblin', traits:'Nimble Escape. The goblin can Disengage or Hide as a bonus action on each of its turns.', actions:'Scimitar. *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) slashing damage.', tags:['goblin','skirmisher'] },
{ name:'Bandit', size:'Medium', type:'Humanoid', ac:12, hp:11, cr:'1/8', abilities:{str:11,dex:12,con:12,int:10,wis:10,cha:10}, skills:'', senses:'Passive Perception 10', languages:'Any one (usually Common)', traits:'Pack Tactics (variant).', actions:'Scimitar. +3 to hit; Light Crossbow. +3 to hit.', tags:['humanoid','bandit'] },
{ name:'Orc', size:'Medium', type:'Humanoid', ac:13, hp:15, cr:'1/2', abilities:{str:16,dex:12,con:16,int:7,wis:11,cha:10}, skills:'Intimidation +2', senses:'Darkvision 60 ft., Passive Perception 10', languages:'Common, Orc', traits:'Aggressive. As a bonus action, the orc can move up to its speed toward a hostile creature it can see.', actions:'Greataxe. +5 to hit, reach 5 ft. Hit: 9 (1d12 + 3) slashing.', tags:['orc','brute'] },
];
state.list = templates.map(t => ({...defaultEnemy(), ...t, id: crypto.randomUUID()}));
save();
edit(state.list[0].id);
}


// Helpers
const int = (v, d=0) => Number.parseInt(String(v),10) || d;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');


// Events
byId('btn-new').addEventListener('click', () => { const e = defaultEnemy(); state.list.unshift(e); save(); edit(e.id); });
byId('btn-bulk').addEventListener('click', quickGenerate);
byId('btn-export').addEventListener('click', exportJSON);
byId('btn-import').addEventListener('click', () => byId('file-import').click());
byId('file-import').addEventListener('change', (ev) => { const f = ev.target.files?.[0]; if(f) importJSON(f); ev.target.value=''; });
byId('btn-publish').addEventListener('click', publish);
byId('btn-delete').addEventListener('click', () => { if(!state.currentId) return; if(confirm('Delete this enemy?')) removeEnemy(state.currentId); });
byId('btn-duplicate').addEventListener('click', () => { if(state.currentId) duplicateEnemy(state.currentId); });


byId('enemy-form').addEventListener('submit', (ev) => {
ev.preventDefault();
const data = serializeForm();
upsertEnemy(data);
});


byId('search').addEventListener('input', filterAndRender);
byId('filter-type').addEventListener('change', filterAndRender);
byId('filter-cr').addEventListener('change', filterAndRender);


// init
load();
if(!state.list.length){
// seed a single example for first run
const e = defaultEnemy();
state.list = [e];
save();
edit(e.id);
} else if(state.list[0]) {
edit(state.list[0].id);
}
})();