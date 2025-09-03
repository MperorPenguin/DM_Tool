// main.mod.js  (ES module boot + routes)
import { registerRoutes, navigate, mountAt } from './modules/router.js';
import { mountCreator } from './modules/characters/creator.js';
import { mountGallery } from './modules/characters/gallery.js';
import { mountPartyBridge } from './modules/party/party-bridge.js';
import { onStoreChange } from './modules/characters/storage.js';

registerRoutes({
  '#characters/gallery': (root, params) => mountGallery(root, { focusId: params.focus }),
  '#characters/new':     (root)          => mountCreator(root, { onSave: id => navigate('#characters/gallery', { focus:id }) }),
  '#characters/edit':    (root, params)  => mountCreator(root, { id: params.id, onSave: id => navigate('#characters/gallery', { focus:id }) }),
  '#party':              (root)          => mountPartyBridge(root),
  '':                    ()              => navigate('#characters/gallery')
});

document.addEventListener('DOMContentLoaded', () => {
  mountAt('app-root');

  // Optional: if this page ever has nav buttons (not parent page)
  document.getElementById('nav-characters')?.addEventListener('click', () => navigate('#characters/gallery'));
  document.getElementById('nav-party')?.addEventListener('click', () => navigate('#party'));

  // Helpers (only visible inside this iframe window)
  window.DND = window.DND || {};
  window.DND.openCharacters = () => navigate('#characters/gallery');
  window.DND.openParty = () => navigate('#party');
});

// Re-render views on store changes
onStoreChange(() => {});
