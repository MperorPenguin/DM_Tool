// modules/router.js — tiny hash router
const routes = new Map();

export function registerRoutes(mapObj){
  for (const [k, h] of Object.entries(mapObj)) routes.set(k, h);
  window.addEventListener('hashchange', handleRoute);
  document.addEventListener('DOMContentLoaded', handleRoute);
}

export function navigate(hash, params = {}){
  const qs = new URLSearchParams(params).toString();
  const h = qs ? `${hash}?${qs}` : hash;
  if (location.hash === h) handleRoute();
  else location.hash = h;
}

export function mountAt(id){
  let root = document.getElementById(id);
  if (!root) {
    root = document.createElement('div');
    root.id = id;
    document.body.appendChild(root);
  }
  return root;
}

function parseHash(){
  const raw = location.hash || '';
  const [path, query=''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { path, params };
}

function handleRoute(){
  const { path, params } = parseHash();
  const handler = routes.get(path) || routes.get('');
  const root = mountAt('app-root');
  root.innerHTML = '';
  handler?.(root, params);
}
