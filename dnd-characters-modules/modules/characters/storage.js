// modules/characters/storage.js
const LIB_KEY = 'tp_cc_characters';
const listeners = new Set();

export function listCharacters(){
  try { return JSON.parse(localStorage.getItem(LIB_KEY)) || []; }
  catch { return []; }
}

export function getCharacter(id){
  return listCharacters().find(c => c.id === id) || null;
}

export function saveCharacter(payload){
  const lib = listCharacters();
  const now = new Date().toISOString();
  if(payload.id){
    const i = lib.findIndex(c => c.id === payload.id);
    if(i !== -1){
      lib[i] = { ...lib[i], ...payload, updatedAt: now };
    }else{
      lib.push({ ...payload, createdAt: now, updatedAt: now });
    }
  }else{
    payload.id = cryptoId();
    lib.push({ ...payload, createdAt: now, updatedAt: now });
  }
  localStorage.setItem(LIB_KEY, JSON.stringify(lib));
  notify();
  return payload.id;
}

export function deleteCharacters(ids = []){
  const set = new Set(ids);
  const lib = listCharacters().filter(c => !set.has(c.id));
  localStorage.setItem(LIB_KEY, JSON.stringify(lib));
  notify();
}

export function setInParty(id, inParty){
  const lib = listCharacters();
  const i = lib.findIndex(c => c.id === id);
  if(i !== -1){
    lib[i].inParty = !!inParty;
    lib[i].updatedAt = new Date().toISOString();
    localStorage.setItem(LIB_KEY, JSON.stringify(lib));
    notify();
  }
}

export function onStoreChange(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(){ listeners.forEach(fn => fn()); }

window.addEventListener('storage', (e)=>{
  if(e.key === LIB_KEY) notify();
});

function cryptoId(){
  if(window.crypto?.randomUUID) return crypto.randomUUID();
  return 'id_' + Math.random().toString(36).slice(2);
}
