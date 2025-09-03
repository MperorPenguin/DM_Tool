DND Characters Modules — Drop-in Package
=======================================

Files:
  main.mod.js
  modules/router.js
  modules/characters/storage.js
  modules/characters/creator.js
  modules/characters/gallery.js
  modules/party/party-bridge.js
  styles/characters.css
  demo.html (safe test page)

Install:
  1) Copy everything into your project root, keeping folders intact.
  2) Link the CSS once (either):
     <link rel="stylesheet" href="./styles/characters.css">
     OR paste its contents into your existing style.css.
  3) Ensure the Arvo font is loaded in your <head>:
     <link href="https://fonts.googleapis.com/css2?family=Arvo:wght@400;700&display=swap" rel="stylesheet">
  4) Add a mount point on any page you want to render into:
     <div id="app-root"></div>
  5) Load the router module at the end of the page:
     <script type="module" src="./main.mod.js"></script>

Routes:
  #characters/gallery   — Library + ESC quick menu, print, delete, edit
  #characters/new       — Creator (new)
  #characters/edit?id=… — Creator (edit existing)
  #party                — Party panel (toggle in/out of party + print party)

DM Party embedding:
  import { mountPartyBridge } from './modules/party/party-bridge.js';
  mountPartyBridge(document.getElementById('party-panel'));

Data:
  localStorage key: 'tp_cc_characters'
  Record:
    { id, name, class, classYear, species, background, skills[], languages[], inParty?, createdAt, updatedAt }

Print:
  - Gallery: select cards → Print Selected
  - Party: Print Party
