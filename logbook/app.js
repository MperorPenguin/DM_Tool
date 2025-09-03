// Starts empty: editor hidden until "+ New Log".
// After Save: animate border puff/confetti on the notes card, add to sidebar, then editor clears & hides.
// Sidebar wraps long titles/stamps; no horizontal overflow.

const DEFAULT_TITLE = 'Untitled session';

const state = {
  logs: [],                 // start with no sessions
  current: null,            // no editor open initially
  selectMode: false,
  selectedIds: new Set()
};

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const on = (el, ev, fn) => { if(el) el.addEventListener(ev, fn); };

function nowStamp(ms){ return new Date(ms || Date.now()).toLocaleString(); }
function makeId(){ return 'log-' + Math.random().toString(36).slice(2,9); }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

document.addEventListener('DOMContentLoaded', () => {
  bindGlobal();
  renderSidebar();
  renderEditor(); // hidden (no current)
});

/* ---------- Bindings ---------- */
function bindGlobal(){
  on($('#btn-new'), 'click', newLog);
  on($('#btn-export'), 'click', exportAll);

  on($('#btn-select-toggle'), 'click', () => {
    state.selectMode = !state.selectMode;
    if(!state.selectMode) state.selectedIds.clear();
    renderSidebar();
  });
  on($('#btn-delete-selected'), 'click', onBulkDeleteRequested);

  on($('#confirm-no'), 'click', closeModal);
  on($('#confirm-yes'), 'click', confirmDelete);
}

/* ---------- Sidebar ---------- */
function renderSidebar(){
  const headBtn = $('#btn-select-toggle');
  if(headBtn) headBtn.textContent = state.selectMode ? 'Cancel' : 'Select';

  const bulk = $('#sidebar-bulk');
  if(bulk){
    bulk.classList.toggle('hidden', !state.selectMode);
    const countEl = bulk.querySelector('.bulk-count');
    if(countEl) countEl.textContent = `${state.selectedIds.size} selected`;
    const delBtn = $('#btn-delete-selected');
    if(delBtn) delBtn.disabled = state.selectedIds.size === 0;
  }

  const list = $('#sidebar-list');
  if(!list) return;

  if(!state.logs.length){
    list.innerHTML = `<div class="small">No sessions yet.</div>`;
    return;
  }

  const items = state.logs.slice()
    .sort((a,b)=> (b.updatedAt||b.createdAt||0) - (a.updatedAt||a.createdAt||0));

  list.innerHTML = items.map(l => {
    const checked = state.selectedIds.has(l.id) ? 'checked' : '';
    return `
      <div class="sidebar-item" data-id="${escapeHtml(l.id)}">
        ${state.selectMode ? `<input type="checkbox" class="check" ${checked} aria-label="Select log">` : ``}
        <div class="title">${escapeHtml(l.title || DEFAULT_TITLE)}</div>
        <div class="row-actions">
          ${!state.selectMode ? `<button class="btn tiny btn-ghost" data-action="open">Open</button>` : ``}
        </div>
        <div class="stamp">${escapeHtml(nowStamp(l.updatedAt || l.createdAt))}</div>
      </div>
    `;
  }).join('');

  $$('.sidebar-item').forEach(el => {
    const id = el.getAttribute('data-id');
    const openBtn = el.querySelector('[data-action="open"]');
    const checkbox = el.querySelector('.check');

    if(openBtn){
      on(openBtn, 'click', (e) => {
        e.stopPropagation();
        const log = state.logs.find(x => x.id === id);
        if(log) openExisting(log);
      });
    }
    if(checkbox){
      on(checkbox, 'change', (e) => {
        if(e.target.checked) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
        const countEl = $('#sidebar-bulk')?.querySelector('.bulk-count');
        if(countEl) countEl.textContent = `${state.selectedIds.size} selected`;
        const delBtn = $('#btn-delete-selected');
        if(delBtn) delBtn.disabled = state.selectedIds.size === 0;
      });
    }
    on(el, 'click', () => {
      if(state.selectMode){
        if(state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
        renderSidebar();
      }else{
        const log = state.logs.find(x => x.id === id);
        if(log) openExisting(log);
      }
    });
  });
}

/* ---------- Editor ---------- */
function openExisting(log){
  state.current = {
    id: log.id,
    title: log.title,
    body: log.body,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
    titleSubmitted: true,
    titleEverEdited: true,
    notesUnlocked: true,
    isNew: false,
    bounceOnReveal: false
  };
  renderEditor();
}

function newLog(){
  state.current = {
    id: makeId(),
    title: DEFAULT_TITLE,
    body: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    titleSubmitted: false,
    titleEverEdited: false,
    notesUnlocked: false,   // locked until first submit
    isNew: true,
    bounceOnReveal: false
  };
  renderEditor();
  setTimeout(()=> $('#title')?.focus(), 0);
}

function renderEditor(){
  const cur = state.current;
  const wrap = $('.editor-wrap');

  // Hide whole editor when there's no current log
  wrap?.classList.toggle('hidden', !cur);

  const metaEl   = $('#editor-meta');
  const titleEl  = $('#title');
  const notesWrap= $('#notes-wrap');
  const notesEl  = $('#notes');
  const btnSubmit= $('#btn-submit-title');
  const btnEdit  = $('#btn-edit-title');
  const helper   = $('#title-helper');

  if(!cur){
    // Clean slate UI (not visible because editor-wrap is hidden)
    if(metaEl)  metaEl.textContent = '';
    if(titleEl){ titleEl.value = ''; titleEl.readOnly = false; }
    btnSubmit?.classList.remove('hidden');
    btnEdit?.classList.add('hidden');
    helper?.classList.remove('hidden');
    notesWrap?.classList.add('hidden');
    return;
  }

  // Meta
  if(metaEl){
    metaEl.innerHTML = `Created: ${escapeHtml(nowStamp(cur.createdAt))} <span class="small">•</span> Last updated: ${escapeHtml(nowStamp(cur.updatedAt))}`;
  }

  // Title
  if(titleEl){
    titleEl.value = cur.title || '';
    titleEl.readOnly = !!cur.titleSubmitted;

    titleEl.onfocus = () => {
      if(!cur.titleSubmitted && !cur.titleEverEdited){
        const def = (titleEl.value||'').trim() === '' || titleEl.value === DEFAULT_TITLE;
        if(def) titleEl.value = '';
      }
    };
    titleEl.oninput = () => {
      if(!cur.titleEverEdited){
        const v = titleEl.value.trim();
        if(v.length>0 && v !== DEFAULT_TITLE) cur.titleEverEdited = true;
      }
    };
  }

  // Buttons & helper
  if(cur.titleSubmitted){
    btnSubmit?.classList.add('hidden');
    btnEdit?.classList.remove('hidden');
    helper?.classList.add('hidden');
  }else{
    btnSubmit?.classList.remove('hidden');
    btnEdit?.classList.add('hidden');
    helper?.classList.remove('hidden');
  }

  // Notes visibility
  const showNotes = !!cur.notesUnlocked;
  if(notesEl) notesEl.toggleAttribute('disabled', !showNotes);
  notesWrap?.classList.toggle('hidden', !showNotes);

  // Bounce only when we just unlocked notes on a fresh log
  if(cur.bounceOnReveal && showNotes){
    const card = document.querySelector('.notes-card');
    if(card){
      card.classList.remove('bounce-in'); void card.offsetWidth; card.classList.add('bounce-in');
    }
    cur.bounceOnReveal = false;
  }

  // Title actions
  if(btnSubmit){
    btnSubmit.onclick = () => {
      const v = (titleEl?.value || '').trim();
      if(!v){ titleEl?.focus(); return; }
      cur.title = v;
      cur.titleSubmitted = true;
      cur.titleEverEdited = true;
      cur.notesUnlocked = true;         // unlock notes permanently
      cur.updatedAt = Date.now();

      if(cur.isNew){ cur.bounceOnReveal = true; }
      renderEditor();
      setTimeout(()=> $('#notes')?.focus(), 0);
    };
  }

  if(btnEdit){
    btnEdit.onclick = () => {
      // Keep notes visible; just unlock title for edits
      cur.titleSubmitted = false;
      cur.updatedAt = Date.now();
      renderEditor();
      setTimeout(()=> $('#title')?.focus(), 0);
    };
  }

  // Notes bindings
  if(notesEl){
    notesEl.value = cur.body || '';
    notesEl.oninput = () => { cur.body = notesEl.value; };
  }

  // Footer actions
  const saveBtn = $('#btn-save');
  const delBtn  = $('#btn-delete-current');
  if(saveBtn) saveBtn.onclick = onSave;
  if(delBtn)  delBtn.onclick  = () => onSingleDeleteRequested(cur.id);
}

/* ---------- Save / FX / Sidebar ------------ */
function onSave(){
  const cur = state.current;
  if(!cur) return;
  if(!cur.titleSubmitted){
    $('#btn-submit-title')?.focus();
    return;
  }

  // Border-anchored puff + edge confetti on the notes card itself
  playBorderFx();

  // Commit snapshot
  cur.updatedAt = Date.now();
  const idx = state.logs.findIndex(l => l.id === cur.id);
  const snapshot = { id: cur.id, title: cur.title, body: cur.body, createdAt: cur.createdAt, updatedAt: cur.updatedAt };
  if(idx === -1) state.logs.unshift(snapshot);
  else state.logs[idx] = snapshot;

  cur.isNew = false;

  renderSidebar();

  // Sidebar pop on saved item
  setTimeout(()=>{
    const el = $$('.sidebar-item').find(node => node.getAttribute('data-id') === cur.id);
    if(el){
      el.classList.add('pop-in');
      el.addEventListener('animationend', ()=> el.classList.remove('pop-in'), { once:true });
    }
  }, 0);

  // Clear editor (hide it) after save
  state.current = null;
  renderEditor();
}

function playBorderFx(){
  const card = document.querySelector('.notes-card');
  if(!card) return;

  // Smoke ring around border
  card.classList.add('saving');

  // Edge confetti: spawn from random points on the edges
  const PARTICLES = 20;
  const rect = card.getBoundingClientRect();

  // Build inside the card so it’s positioned correctly relative to the edge
  for(let i=0;i<PARTICLES;i++){
    const p = document.createElement('div');
    p.className = 'edge-confetti';
    // choose an edge: 0=top,1=right,2=bottom,3=left
    const edge = Math.floor(Math.random()*4);
    let x = 0, y = 0, dx = 0, dy = 0;

    const dist = 60 + Math.random()*80; // travel distance
    const rot  = (Math.random()*360|0) + 'deg';
    const shades = ['#d6ed17','#c6de10','#a7c60e','#e2ff4a'];
    p.style.background = shades[i % shades.length];

    if(edge===0){ // top
      x = Math.random()*rect.width; y = 0;
      dx = (Math.random() - .5)*80; dy = -dist;
    }else if(edge===1){ // right
      x = rect.width; y = Math.random()*rect.height;
      dx = dist; dy = (Math.random() - .5)*80;
    }else if(edge===2){ // bottom
      x = Math.random()*rect.width; y = rect.height;
      dx = (Math.random() - .5)*80; dy = dist;
    }else{ // left
      x = 0; y = Math.random()*rect.height;
      dx = -dist; dy = (Math.random() - .5)*80;
    }

    // anchor at edge point
    p.style.left = `${x}px`;
    p.style.top  = `${y}px`;
    p.style.setProperty('--dx', `${dx}px`);
    p.style.setProperty('--dy', `${dy}px`);
    p.style.setProperty('--rot', rot);

    card.appendChild(p);
  }

  // Cleanup
  setTimeout(()=>{
    card.classList.remove('saving');
    card.querySelectorAll('.edge-confetti').forEach(el => el.remove());
  }, 750);
}

/* ---------- Delete / Modal ---------- */
function onSingleDeleteRequested(id){
  const log = state.logs.find(l => l.id === id);
  if(!log) return;
  openModal([log]);
}
function onBulkDeleteRequested(){
  if(state.selectedIds.size === 0) return;
  const list = state.logs.filter(l => state.selectedIds.has(l.id));
  openModal(list);
}
function openModal(logs){
  const modal = $('#confirm-modal');
  if(modal){
    const ul = $('#confirm-list');
    if(ul) ul.innerHTML = logs.map(l => `<li><strong>${escapeHtml(l.title || DEFAULT_TITLE)}</strong> <span class="small">(${escapeHtml(l.id)})</span></li>`).join('');
    modal.dataset.ids = logs.map(l => l.id).join(',');
    modal.classList.remove('hidden');
  }else{
    const names = logs.map(l => l.title || DEFAULT_TITLE).join(', ');
    if(window.confirm(`Delete the following log(s)?\n\n${names}`)){
      performDelete(logs.map(l => l.id));
    }
  }
}
function closeModal(){
  const modal = $('#confirm-modal');
  if(modal){ modal.classList.add('hidden'); modal.dataset.ids=''; }
}
function confirmDelete(){
  const modal = $('#confirm-modal');
  if(!modal) return;
  const ids = (modal.dataset.ids || '').split(',').filter(Boolean);
  performDelete(ids);
  closeModal();
}
function performDelete(ids){
  if(!ids || !ids.length) return;
  state.logs = state.logs.filter(l => !ids.includes(l.id));
  if(state.current && ids.includes(state.current.id)){
    state.current = null;
    renderEditor();
  }
  ids.forEach(id => state.selectedIds.delete(id));
  state.selectMode = false;
  renderSidebar();
}

/* ---------- Export ---------- */
function exportAll(){
  const payload = JSON.stringify(state.logs || [], null, 2);
  const blob = new Blob([payload], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  a.download = `dm-logbook-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
