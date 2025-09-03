// modules/characters/gallery.js
import { listCharacters, deleteCharacters, onStoreChange, setInParty } from './storage.js';
import { navigate } from '../router.js';

export function mountGallery(root, { focusId = null } = {}){
  root.innerHTML = `
    <section class="gallery-head">
      <h2 class="gallery-title">Characters</h2>
      <div class="gallery-actions">
        <button class="btn" id="new-char">New Character</button>
        <button class="btn ghost" id="print-selected">Print Selected</button>
        <button class="btn ghost" id="delete-selected">Delete Selected</button>
      </div>
    </section>

    <section class="gallery-tools">
      <input type="search" id="gallery-search" placeholder="Search by name, class, species" />
    </section>

    <ul class="gallery-grid" id="gallery-grid"></ul>

    <div id="print-area" class="print-area" hidden></div>
  `;

  const elGrid = root.querySelector('#gallery-grid');
  const elSearch = root.querySelector('#gallery-search');
  const btnNew   = root.querySelector('#new-char');
  const btnPrint = root.querySelector('#print-selected');
  const btnDel   = root.querySelector('#delete-selected');
  const selection = new Set();

  // Top actions
  btnNew.addEventListener('click', ()=>navigate('#characters/new'));
  btnPrint.addEventListener('click', ()=>printSelected());
  btnDel.addEventListener('click', ()=>bulkDelete());

  // Re-render when storage changes or search changes
  const unsub = onStoreChange(()=> render());
  elSearch.addEventListener('input', render);

  render(); // initial draw

  function currentFilteredList(){
    const q = (elSearch.value || '').toLowerCase();
    return listCharacters()
      .filter(c => `${c.name||''} ${c.class||''} ${c.species||''}`.toLowerCase().includes(q))
      .sort((a,b)=> (b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||''));
  }

  function render(){
    const all = listCharacters();
    const list = currentFilteredList();

    // Disable/enable toolbar actions sensibly
    const hasAny = all.length > 0;
    btnPrint.disabled = !hasAny;
    btnDel.disabled   = selection.size === 0;

    if (!hasAny){
      elGrid.innerHTML = emptyStateHTML();
      elGrid.querySelector('#create-first')?.addEventListener('click', ()=>navigate('#characters/new'));
      return;
    }

    elGrid.innerHTML = list.map(c => `
      <li class="gal-card ${selection.has(c.id)?'selected':''}" data-id="${c.id}">
        <div class="gal-card__head">
          <input type="checkbox" class="gal-card__ck" ${selection.has(c.id)?'checked':''} />
          <div class="gal-card__name">${esc(c.name||'Unnamed')}</div>
        </div>
        <div class="gal-card__meta tiny">
          <span>${esc(c.class||'—')}${c.classYear?` (${c.classYear})`:''}</span> ·
          <span>${esc(c.species||'—')}</span> ·
          <span>${esc(c.background||'—')}</span>
        </div>
        <div class="gal-card__tags tiny">
          ${(c.languages||[]).map(l => `<span class="tag">${esc(l)}</span>`).join('')}
          ${c.inParty ? `<span class="tag">In Party</span>` : ``}
        </div>
        <div class="gal-card__foot">
          <button class="btn ghost" data-edit>Edit</button>
          <button class="btn" data-print-one>Print</button>
          <button class="btn ghost" data-party-toggle>${c.inParty ? 'Remove from Party' : 'Add to Party'}</button>
        </div>
      </li>
    `).join('');

    if(focusId && list.some(c => c.id===focusId)){
      const focusEl = elGrid.querySelector(`[data-id="${focusId}"]`);
      focusEl?.scrollIntoView({ behavior:'smooth', block:'center' });
      focusEl?.classList.add('pulse');
      setTimeout(()=> focusEl?.classList.remove('pulse'), 800);
      focusId = null;
    }

    // Wire item events
    elGrid.querySelectorAll('.gal-card').forEach(card => {
      const id = card.getAttribute('data-id');
      const c  = list.find(x => x.id === id) || listCharacters().find(x => x.id===id);

      card.querySelector('.gal-card__ck').addEventListener('change', (e)=>{
        e.currentTarget.checked ? selection.add(id) : selection.delete(id);
        card.classList.toggle('selected', e.currentTarget.checked);
        btnDel.disabled = selection.size === 0;
      });
      card.querySelector('[data-edit]').addEventListener('click', ()=> navigate('#characters/edit', { id }));
      card.querySelector('[data-print-one]').addEventListener('click', ()=> printSelected([id]));
      card.querySelector('[data-party-toggle]').addEventListener('click', ()=>{
        setInParty(id, !c?.inParty);
      });
      card.addEventListener('dblclick', ()=> navigate('#characters/edit', { id }));
    });
  }

  function emptyStateHTML(){
    return `
      <li class="gal-empty">
        <div class="panel empty-state">
          <h3>No characters yet</h3>
          <p class="small muted">Create your first hero to get started.</p>
          <button id="create-first" class="btn">Create Character</button>
        </div>
      </li>
    `;
  }

  function bulkDelete(){
    if(selection.size === 0){
      alert('Select one or more characters first.');
      return;
    }
    if(!confirm(`Delete ${selection.size} character(s)? This cannot be undone.`)) return;
    deleteCharacters(Array.from(selection));
    selection.clear();
    render();
  }

  function printSelected(forceIds){
    let ids = forceIds || Array.from(selection);
    if(ids.length === 0){
      const list = currentFilteredList();
      if(list.length === 1){
        ids = [list[0].id]; // smart default: print the single visible result
      }else{
        alert('Select at least one character to print.');
        return;
      }
    }
    const chars = listCharacters().filter(c => ids.includes(c.id));
    const area = root.querySelector('#print-area');
    area.innerHTML = chars.map(sheetHTML).join('');
    area.removeAttribute('hidden');
    requestAnimationFrame(()=> {
      window.print();
      area.setAttribute('hidden','');
    });
  }

  function sheetHTML(c){
    const skills = (c.skills||[]).sort();
    return `
      <section class="print-sheet">
        <h2>${esc(c.name||'Unnamed')}</h2>
        <div class="print-row"><strong>Class:</strong> ${esc(c.class||'—')}${c.classYear?` (${c.classYear})`:''}</div>
        <div class="print-row"><strong>Species:</strong> ${esc(c.species||'—')}</div>
        <div class="print-row"><strong>Background:</strong> ${esc(c.background||'—')}</div>
        <div class="print-row"><strong>Languages:</strong> ${(c.languages||[]).map(esc).join(', ')||'—'}</div>
        <div class="print-row"><strong>Skills:</strong> ${skills.map(esc).join(', ')||'—'}</div>
        <div class="tiny muted">Printed ${new Date().toLocaleString()}</div>
      </section>
    `;
  }

  function esc(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

  // Cleanup on unmount
  return () => { unsub(); };
}
