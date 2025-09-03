// modules/party/party-bridge.js
import { listCharacters, setInParty, onStoreChange } from '../characters/storage.js';

export function mountPartyBridge(root){
  root.innerHTML = `
    <section class="panel">
      <h2>Party</h2>
      <div class="tiny muted" style="margin-bottom:8px;">Tick to include in party. This view auto-syncs with the Characters Library.</div>
      <div id="party-list" class="party-list"></div>
      <div style="margin-top:10px;">
        <button class="btn ghost" id="party-print">Print Party</button>
      </div>
    </section>
  `;

  const listEl = root.querySelector('#party-list');
  const unsub = onStoreChange(render);
  root.querySelector('#party-print').addEventListener('click', ()=> printParty());

  render();

  function render(){
    const party = listCharacters().filter(c => !!c.inParty);
    const others = listCharacters().filter(c => !c.inParty);
    listEl.innerHTML = `
      <h3 class="tiny muted">In Party</h3>
      <ul class="party-grid">
        ${party.map(item).join('') || `<li class="tiny muted">No members yet.</li>`}
      </ul>
      <h3 class="tiny muted" style="margin-top:6px;">Library</h3>
      <ul class="party-grid">
        ${others.map(item).join('')}
      </ul>
    `;
    listEl.querySelectorAll('[data-toggle]').forEach(inp => {
      inp.addEventListener('change', (e)=>{
        const id = e.currentTarget.getAttribute('data-toggle');
        setInParty(id, e.currentTarget.checked);
      });
    });
  }

  function item(c){
    return `
      <li class="party-card">
        <label class="check">
          <input type="checkbox" ${c.inParty?'checked':''} data-toggle="${c.id}" />
          <span class="party-name">${esc(c.name||'Unnamed')}</span>
        </label>
        <div class="tiny muted">${esc(c.class||'—')}${c.classYear?` (${c.classYear})`:''} · ${esc(c.species||'—')}</div>
      </li>
    `;
  }

  function printParty(){
    const party = listCharacters().filter(c => !!c.inParty);
    if(party.length===0) return;
    const area = document.createElement('div');
    area.className = 'print-area';
    area.innerHTML = party.map(c => `
      <section class="print-sheet">
        <h2>${esc(c.name||'Unnamed')}</h2>
        <div class="print-row"><strong>Class:</strong> ${esc(c.class||'—')}${c.classYear?` (${c.classYear})`:''}</div>
        <div class="print-row"><strong>Species:</strong> ${esc(c.species||'—')}</div>
        <div class="print-row"><strong>Background:</strong> ${esc(c.background||'—')}</div>
        <div class="print-row"><strong>Languages:</strong> ${(c.languages||[]).map(esc).join(', ')||'—'}</div>
        <div class="print-row"><strong>Skills:</strong> ${(c.skills||[]).map(esc).join(', ')||'—'}</div>
      </section>
    `).join('');
    document.body.appendChild(area);
    window.print();
    document.body.removeChild(area);
  }

  function esc(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

  return () => unsub();
}
