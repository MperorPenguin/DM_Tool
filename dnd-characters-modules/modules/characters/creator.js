// modules/characters/creator.js
import { getCharacter, saveCharacter } from './storage.js';

const ALL_SKILLS = [
  'Acrobatics','Animal Handling','Arcana','Athletics','Deception','History','Insight',
  'Intimidation','Investigation','Medicine','Nature','Perception','Performance',
  'Persuasion','Religion','Sleight of Hand','Stealth','Survival'
];

const CLASSES = [
  c('Barbarian', 2014, true, 2, ['Animal Handling','Athletics','Intimidation','Nature','Perception','Survival']),
  c('Barbarian', 2024, true, 2, ['Athletics','Perception']),
  c('Bard', 2014, true, 3, ALL_SKILLS.slice()),
  c('Bard', 2024, true, 3, ALL_SKILLS.slice()),
  c('Cleric', 2014, false, 2, ['History','Insight','Medicine','Persuasion','Religion']),
  c('Cleric', 2024, false, 2, ['Insight','Religion']),
  c('Druid', 2014, false, 2, ['Arcana','Animal Handling','Insight','Medicine','Nature','Perception','Religion','Survival']),
  c('Druid', 2024, false, 2, ['Nature','Survival']),
  c('Fighter', 2014, false, 2, ['Acrobatics','Animal Handling','History','Insight','Intimidation','Perception','Survival']),
  c('Fighter', 2024, false, 2, ['Athletics','Perception']),
  c('Monk', 2014, false, 2, ['Acrobatics','Athletics','History','Insight','Religion','Stealth']),
  c('Monk', 2024, false, 2, ['Acrobatics','Insight']),
  c('Paladin', 2014, false, 2, ['Athletics','Insight','Intimidation','Medicine','Persuasion','Religion']),
  c('Paladin', 2024, false, 2, ['Athletics','Persuasion']),
  c('Ranger', 2014, true, 3, ['Animal Handling','Athletics','Insight','Investigation','Nature','Perception','Stealth','Survival']),
  c('Ranger', 2024, true, 3, ['Nature','Perception','Survival']),
  c('Rogue', 2014, true, 4, ['Acrobatics','Athletics','Deception','Insight','Intimidation','Investigation','Perception','Performance','Persuasion','Sleight of Hand','Stealth']),
  c('Rogue', 2024, true, 4, ['Acrobatics','Investigation','Sleight of Hand','Stealth']),
  c('Sorcerer', 2014, false, 2, ['Arcana','Deception','Insight','Intimidation','Persuasion','Religion']),
  c('Sorcerer', 2024, false, 2, ['Arcana','Intimidation']),
  c('Warlock', 2014, false, 2, ['Arcana','Deception','History','Intimidation','Investigation','Nature','Religion']),
  c('Warlock', 2024, false, 2, ['Arcana','Deception']),
  c('Wizard', 2014, false, 2, ['Arcana','History','Insight','Investigation','Medicine','Religion']),
  c('Wizard', 2024, false, 2, ['Arcana','History']),
];
function c(name, year, featured, skillChoices, list){ return { name, year, featured, skillChoices, list }; }

const SPECIES = ['Human','Elf','Dwarf','Halfling','Gnome','Half-Orc','Tiefling','Dragonborn'];
const BACKGROUNDS = [
  bg('Acolyte', ['Insight','Religion'], 2),
  bg('Charlatan', ['Deception','Sleight of Hand'], 0),
  bg('Criminal', ['Deception','Stealth'], 0),
  bg('Entertainer', ['Acrobatics','Performance'], 0),
  bg('Folk Hero', ['Animal Handling','Survival'], 0),
  bg('Guild Artisan', ['Insight','Persuasion'], 0),
  bg('Hermit', ['Medicine','Religion'], 2),
  bg('Noble', ['History','Persuasion'], 1),
  bg('Outlander', ['Athletics','Survival'], 0),
  bg('Sage', ['Arcana','History'], 2),
  bg('Sailor', ['Athletics','Perception'], 0),
  bg('Soldier', ['Athletics','Intimidation'], 0),
  bg('Urchin', ['Sleight of Hand','Stealth'], 0),
];
function bg(name, skills = [], langBonus = 0){ return { name, skills, langBonus }; }

export function mountCreator(root, params){
  const id = params?.id || null;
  let state = initialState(id);

  root.innerHTML = `
    <header class="cc-top">
      <div class="cc-top__left">
        <div class="cc-brand-mark"></div>
        <h1 class="cc-title">Character Creator <span class="ver">v2.2.2</span></h1>
      </div>
      <div class="cc-top__actions">
        <button class="btn ghost" id="btn-review">Review</button>
        <button class="btn" id="btn-save">Save</button>
      </div>
    </header>

    <div class="cc-layout">
      <aside class="cc-left">
        <div class="cc-search-row">
          <input id="class-search" type="search" placeholder="Search Classes" class="cc-search">
          <div class="cc-chips">
            <button id="chip-featured" class="chip active" type="button" aria-pressed="true">Featured</button>
            <button id="chip-2024" class="chip" type="button" aria-pressed="false">2024</button>
          </div>
        </div>
        <ul id="class-grid" class="grid"></ul>
      </aside>

      <section class="cc-right" id="creator-right">
        ${rightHTML()}
      </section>
    </div>

    <footer class="cc-footer">
      <nav class="steps">
        <ul id="step-links" class="step-links"></ul>
        <div class="step-where" id="step-where"></div>
      </nav>
      <div class="step-ctas">
        <button id="btn-back" class="btn ghost" type="button">Back</button>
        <button id="btn-next" class="btn" type="button" disabled>Next</button>
      </div>
    </footer>

    <dialog class="modal" id="modal-review">
      <div class="modal__inner">
        <div class="modal__header">
          <h2>Review</h2>
          <button class="modal__close" id="close-review" aria-label="Close">✕</button>
        </div>
        <div class="modal__content review" id="review-content"></div>
        <div class="modal__footer">
          <button class="btn ghost" id="cancel-review">Close</button>
          <button class="btn" id="confirm-save">Save</button>
        </div>
      </div>
    </dialog>
  `;

  const elLeft   = root.querySelector('#class-grid');
  const elRight  = root.querySelector('#creator-right');
  const elWhere  = root.querySelector('#step-where');
  const elBack   = root.querySelector('#btn-back');
  const elNext   = root.querySelector('#btn-next');

  // Top actions
  root.querySelector('#btn-review').addEventListener('click', openReview);
  root.querySelector('#btn-save').addEventListener('click', doSave);

  // Steps
  drawLeft(); renderRight(); wireChips(); updateStepIndicators();

  elBack.addEventListener('click', ()=>{ if(state.step>0){ state.step--; renderRight(); updateStepIndicators(); } });
  elNext.addEventListener('click', ()=>{
    if(state.step < steps().length-1){ state.step++; renderRight(); updateStepIndicators(); }
    else { openReview(); }
  });

  // ===== Left column (classes) =====
  function drawLeft(){
    const list = CLASSES
      .filter(row => state.filter2024 ? row.year===2024 : true)
      .filter(row => state.filterFeatured ? row.featured : true)
      .filter(row => `${row.name}`.toLowerCase().includes((state.search||'').toLowerCase()));

    elLeft.innerHTML = list.map(row=>{
      const isSel = state.selectedClass && state.selectedClass.name===row.name && state.selectedClass.year===row.year;
      const bgUrl = getClassArt(row.name, row.year);
      return `
      <li>
        <button class="card ${isSel?'selected':''}" data-bg="${row.name}" type="button" data-class="${row.name}" data-year="${row.year}" style="${bgUrl ? `background-image:url('${bgUrl}')` : ''}">
          <span class="tag">${row.year}</span>
          <div class="inner"><span class="name">${row.name}</span><span class="pub"></span></div>
        </button>
      </li>`;
    }).join('');

    elLeft.querySelectorAll('button.card').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.selectedClass = { name: btn.dataset.class, year: +btn.dataset.year };
        renderRight(); updateStepIndicators(); drawLeft();
      });
    });
  }

  function wireChips(){
    const chipFeat = root.querySelector('#chip-featured');
    const chip2024 = root.querySelector('#chip-2024');
    chipFeat.addEventListener('click', ()=>{
      state.filterFeatured = !state.filterFeatured;
      chipFeat.classList.toggle('active', state.filterFeatured);
      drawLeft();
    });
    chip2024.addEventListener('click', ()=>{
      state.filter2024 = !state.filter2024;
      chip2024.classList.toggle('active', state.filter2024);
      drawLeft();
    });
    const search = root.querySelector('#class-search');
    search.addEventListener('input', ()=>{ state.search = search.value; drawLeft(); });
  }

  // ===== Right column (steps) =====
  function renderRight(){
    const mount = elRight;
    const id = curStep().id;

    if(id==='class'){
      mount.innerHTML = rightHTML();
    }
    if(id==='species'){
      mount.innerHTML = `<div class="panel"><h2>Species</h2>
        <div class="pillwrap">${SPECIES.map(s=>`<button class="pill ${state.species===s?'active':''}" data-species="${s}">${s}</button>`).join('')}</div></div>`;
      mount.querySelectorAll('[data-species]').forEach(b=>b.addEventListener('click', ()=>{ state.species=b.getAttribute('data-species'); renderRight(); updateStepIndicators(); }));
    }
    if(id==='background'){
      mount.innerHTML = `<div class="panel"><h2>Background</h2>
        <div class="pillwrap">${BACKGROUNDS.map(b=>`<button class="pill ${state.background===b.name?'active':''}" data-bg="${b.name}">${b.name}</button>`).join('')}</div></div>`;
      mount.querySelectorAll('[data-bg]').forEach(b=>b.addEventListener('click', ()=>{ state.background=b.getAttribute('data-bg'); renderRight(); updateStepIndicators(); }));
      updateBgInfo();
    }
    if(id==='skills'){
      mount.innerHTML = `<div class="panel"><h2>Skills</h2><div class="helper tiny">Choose ${getClassRow()?.skillChoices||0} skills for your class.</div><div id="skills-grid" class="skills-grid"></div></div>`;
      drawSkills();
    }
    if(id==='about'){
      mount.innerHTML = `
        <div class="panel"><h2>About</h2>
          <div class="grid2">
            <label class="field"><span>Name</span>
              <input id="cc-name" type="text" placeholder="E.g., Kael Stormborn" />
              <div class="helper tiny">Tip: choose something memorable. You can change it later.</div>
            </label>

            <label class="field"><span>Languages <span class="tiny muted">(optional)</span></span>
              <button id="lang-toggle" class="select like-input" type="button" aria-expanded="false">Select languages</button>
              <div id="lang-panel" class="dropdown" hidden></div>
            </label>

            <label class="field"><span>Party</span>
              <label class="check"><input id="cc-inparty" type="checkbox"> Add this character to the Party</label>
              <div class="helper tiny">Checked characters appear in the DM → Party tab.</div>
            </label>
          </div>
        </div>`;
      const nameEl = mount.querySelector('#cc-name');
      nameEl.value = state.name || '';
      nameEl.addEventListener('input', ()=>{ state.name = nameEl.value; updateStepIndicators(); });
      setupLangDropdown(mount);

      const inPartyEl = mount.querySelector('#cc-inparty');
      inPartyEl.checked = !!state.inParty;
      inPartyEl.addEventListener('change', ()=>{ state.inParty = inPartyEl.checked; });
    }
  }

  function updateBgInfo(){
    const info = document.createElement('div');
    info.className = 'panel';
    const row = getClassRow();
    const bg = BACKGROUNDS.find(b => b.name === state.background) || null;
    const skills = getAllSkillsCombined({ classRow: row, bg });
    info.innerHTML = `
      <h3>Summary</h3>
      <div class="grid2">
        <div class="field"><span>Class</span><div>${row ? `${row.name} (${row.year})` : '—'}</div></div>
        <div class="field"><span>Species</span><div>${state.species || '—'}</div></div>
        <div class="field"><span>Background</span><div>${state.background || '—'}</div></div>
        <div class="field"><span>Skills</span><div>${skills.join(', ') || '—'}</div></div>
      </div>`;
    elRight.appendChild(info);
  }

  function drawSkills(){
    const grid = elRight.querySelector('#skills-grid');
    const row = getClassRow();
    if(!row){ grid.innerHTML = '<div class="small muted">Pick a class first.</div>'; return; }

    const must = new Set((BACKGROUNDS.find(b => b.name===state.background)?.skills) || []);
    const allowed = new Set(row.list);
    const have = new Set(state.classSkillChoices || []);

    const picks = row.skillChoices;
    const items = Array.from(new Set([...row.list])).sort();
    grid.innerHTML = items.map(name=>{
      const isMust = must.has(name);
      const checked = isMust || have.has(name);
      const disabled = isMust;
      return `
        <label class="skill ${isMust?'suggested':''}">
          <input type="checkbox" data-skill="${name}" ${checked?'checked':''} ${disabled?'disabled':''} />
          <span>${name}</span>
        </label>`;
    }).join('');

    const inputs = grid.querySelectorAll('input[type="checkbox"][data-skill]');
    inputs.forEach(cb=> cb.addEventListener('change', ()=>{
      const chosen = Array.from(inputs).filter(i=>i.checked && !i.disabled).map(i=>i.getAttribute('data-skill'));
      if(chosen.length > picks){
        cb.checked = false; // revert
        return;
      }
      state.classSkillChoices = chosen.concat(Array.from(must));
      updateStepIndicators();
    }));

    state.classSkillChoices = Array.from(new Set((state.classSkillChoices||[]).concat(Array.from(must))));
    updateStepIndicators();
  }

  function getClassRow(){
    if(!state.selectedClass) return null;
    return CLASSES.find(r => r.name===state.selectedClass.name && r.year===state.selectedClass.year) || null;
  }

  function getAllSkillsCombined({ classRow = getClassRow(), bg = BACKGROUNDS.find(b=>b.name===state.background) } = {}){
    const set = new Set([...(classRow?.list||[]), ...((bg?.skills)||[]), ...(state.classSkillChoices||[])]);
    return Array.from(set);
  }

  function rightHTML(){
    return `
      <div class="panel">
        <h2>Choose your Class</h2>
        <p>Every adventurer belongs to a class. Your class shapes your combat style, special talents, and how you solve problems.</p>
      </div>
      <div class="panel">
        <h3>Where to Start?</h3>
        <p>Think about playstyle:</p>
        <div class="guide-block"><p><strong>I like charging in with steel.</strong></p><div class="suggested"><span>Barbarian</span><span>Fighter</span></div></div>
        <div class="guide-block"><p><strong>I want to sling spells.</strong></p><div class="suggested"><span>Wizard</span><span>Warlock</span><span>Sorcerer</span></div></div>
        <div class="guide-block"><p><strong>I want to support the party.</strong></p><div class="suggested"><span>Cleric</span><span>Bard</span><span>Druid</span></div></div>
      </div>
    `;
  }

  function steps(){ return [
    { id:'class', label:'Class' },
    { id:'species', label:'Species' },
    { id:'background', label:'Background' },
    { id:'skills', label:'Skills' },
    { id:'about', label:'About' },
  ];}
  function curStep(){ return steps()[state.step]; }

  function updateStepIndicators(){
    const step = curStep().id;
    elWhere.textContent = `Step ${state.step+1} of ${steps().length}: ${curStep().label}`;
    elBack.disabled = state.step === 0;
    elNext.disabled = !canContinue(step);
    elNext.textContent = state.step === steps().length-1 ? 'Review' : 'Next';
  }

  function canContinue(step){
    if(step==='class')      return !!state.selectedClass;
    if(step==='species')    return !!state.species;
    if(step==='background') return !!state.background;
    if(step==='skills'){
      const need = getClassRow()?.skillChoices || 0;
      return (state.classSkillChoices||[]).length >= need;
    }
    if(step==='about')      return !!(state.name && state.name.trim());
    return false;
  }

  function openReview(){
    const modal = root.querySelector('#modal-review');
    const out = root.querySelector('#review-content');
    const row = getClassRow();
    const bg  = BACKGROUNDS.find(b => b.name===state.background) || null;
    const skills = getAllSkillsCombined({ classRow: row, bg });
    out.innerHTML = `
      <div class="cardish">
        <strong>Name:</strong> ${esc(state.name || '—')}
      </div>
      <div class="cardish">
        <strong>Class:</strong> ${row ? `${row.name} (${row.year})` : '—'}
      </div>
      <div class="cardish">
        <strong>Species:</strong> ${esc(state.species || '—')}
      </div>
      <div class="cardish">
        <strong>Background:</strong> ${esc(state.background || '—')}
      </div>
      <div class="cardish">
        <strong>Skills:</strong> ${skills.map(esc).join(', ') || '—'}
      </div>
      <div class="cardish">
        <strong>Languages:</strong> ${(state.languages||[]).map(esc).join(', ') || '—'}
      </div>
      <div class="cardish">
        <strong>In Party:</strong> ${state.inParty ? 'Yes' : 'No'}
      </div>
    `;
    modal.showModal();
    root.querySelector('#close-review').onclick = ()=> modal.close();
    root.querySelector('#cancel-review').onclick = ()=> modal.close();
    root.querySelector('#confirm-save').onclick = doSave;
  }

  function doSave(){
    const row = getClassRow();
    const bg  = BACKGROUNDS.find(b => b.name===state.background) || null;
    const payload = {
      id: state.id || null,
      name: state.name || '',
      class: row ? row.name : null,
      classYear: row ? row.year : null,
      species: state.species || null,
      background: state.background || null,
      skills: getAllSkillsCombined({ classRow: row, bg }),
      languages: state.languages || [],
      inParty: state.inParty || false
    };
    const id = saveCharacter(payload);
    root.querySelector('#modal-review')?.close();
    // Back to gallery, focused on this id
    location.hash = '#characters/gallery?id=' + encodeURIComponent(id);
  }

  // ===== Helpers =====
  function getClassArt(name, year){
    // map to known art paths (replace with your own art if desired)
    const map = {
      Barbarian: 'https://storage.googleapis.com/roll20-cdn/advanced-sheets-production-9b1f7af9/dnd2024byroll20/assets/compendium/webp/classes/Barbarian-PHB.webp',
      Bard:      'https://storage.googleapis.com/roll20-cdn/advanced-sheets-production-9b1f7af9/dnd2024byroll20/assets/compendium/webp/classes/Bard-PHB.webp',
      Cleric:    'https://storage.googleapis.com/roll20-cdn/advanced-sheets-production-9b1f7af9/dnd2024byroll20/assets/compendium/webp/classes/Cleric-PHB.webp',
      Druid:     'https://storage.googleapis.com/roll20-cdn/advanced-sheets-production-9b1f7af9/dnd2024byroll20/assets/compendium/webp/classes/Druid-PHB.webp',
      Fighter:   'https://storage.googleapis.com/roll20-cdn/advanced-sheets-production-9b1f7af9/dnd2024byroll20/assets/compendium/webp/classes/Fighter-PHB.webp',
      Monk:      'https://storage.googleapis.com/roll20-cdn/advanced-sheets-production-9b1f7af9/dnd2024byroll20/assets/compendium/webp/classes/Monk-PHB.webp',
      Paladin:   'https://storage.googleapis.com/roll20-cdn/advanced-sheets-production-9b1f7af9/dnd2024byroll20/assets/compendium/webp/classes/Paladin-PHB.webp',
      Ranger:    'https://storage.googleapis.com/roll20-cdn/advanced-sheets-production-9b1f7af9/dnd2024byroll20/assets/compendium/webp/classes/Ranger-PHB.webp',
      Rogue:     'https://storage.googleapis.com/roll20-cdn/advanced-sheets-production-9b1f7af9/dnd2024byroll20/assets/compendium/webp/classes/Rogue-PHB.webp',
      Sorcerer:  'https://storage.googleapis.com/roll20-cdn/advanced-sheets-production-9b1f7af9/dnd2024byroll20/assets/compendium/webp/classes/Sorcerer-PHB.webp',
      Warlock:   'https://storage.googleapis.com/roll20-cdn/advanced-sheets-production-9b1f7af9/dnd2024byroll20/assets/compendium/webp/classes/Warlock-PHB.webp',
      Wizard:    'https://storage.googleapis.com/roll20-cdn/advanced-sheets-production-9b1f7af9/dnd2024byroll20/assets/compendium/webp/classes/Wizard-PHB.webp',
    };
    return map[name] || '';
  }

  function setupLangDropdown(scope){
    const btn = scope.querySelector('#lang-toggle');
    const panel = scope.querySelector('#lang-panel');
    const ALL = ['Common','Dwarvish','Elvish','Giant','Gnomish','Goblin','Halfling','Orc','Abyssal','Celestial','Draconic','Deep Speech','Infernal','Primordial','Sylvan','Undercommon'];
    btn.addEventListener('click', ()=>{
      const open = panel.hasAttribute('hidden') ? false : true;
      if(open){ panel.setAttribute('hidden',''); btn.setAttribute('aria-expanded','false'); return; }
      panel.innerHTML = ALL.map(l => `
        <label class="check"><input type="checkbox" data-lang="${l}" ${state.languages?.includes(l)?'checked':''}/> ${l}</label>
      `).join('');
      panel.removeAttribute('hidden');
      btn.setAttribute('aria-expanded','true');
      panel.querySelectorAll('[data-lang]').forEach(cb=>{
        cb.addEventListener('change', ()=>{
          const list = Array.from(panel.querySelectorAll('[data-lang]')).filter(x=>x.checked).map(x=>x.getAttribute('data-lang'));
          state.languages = list;
        });
      });
    });
    document.addEventListener('click', (e)=>{
      if(!panel.contains(e.target) && e.target!==btn){ panel.setAttribute('hidden',''); btn.setAttribute('aria-expanded','false'); }
    });
  }

  function steps(){ return [
    { id:'class', label:'Class' },
    { id:'species', label:'Species' },
    { id:'background', label:'Background' },
    { id:'skills', label:'Skills' },
    { id:'about', label:'About' },
  ];}

  function initialState(id){
    if(!id) return { id:null, step:0, selectedClass:null, species:null, background:null, classSkillChoices:[], name:'', languages:[], search:'', filterFeatured:true, filter2024:false, inParty:false };
    const c = getCharacter(id);
    if(!c) return { id:null, step:0, selectedClass:null, species:null, background:null, classSkillChoices:[], name:'', languages:[], search:'', filterFeatured:true, filter2024:false, inParty:false };
    return {
      id: c.id,
      step:0,
      selectedClass: c.class ? { name:c.class, year:c.classYear } : null,
      species: c.species || null,
      background: c.background || null,
      classSkillChoices: (c.skills||[]).filter(s => ALL_SKILLS.includes(s)),
      name: c.name || '',
      languages: c.languages || [],
      search:'', filterFeatured:true, filter2024:false,
      inParty: !!c.inParty
    };
  }

  function esc(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }
}
