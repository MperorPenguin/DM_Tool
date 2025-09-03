// generate-maps-index.js  (kept in DocumentsTabletopPals\MapsKit)
// Builds .\assets\maps\index.json AND .\assets\maps\index.js (fallback for file://)

const fs = require('fs');
const path = require('path');

const ROOT     = __dirname; // MapsKit folder
const MAPS_DIR = path.join(ROOT, 'assets', 'maps');
const OUT_JSON = path.join(MAPS_DIR, 'index.json');
const OUT_JS   = path.join(MAPS_DIR, 'index.js');

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.avif']);

const toSlug  = s => String(s).toLowerCase().replace(/\.[^.]+$/, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const toTitle = s => String(s).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
  .replace(/\s+/g, ' ').trim().replace(/\b\w/g, ch => ch.toUpperCase());

function main() {
  if (!fs.existsSync(MAPS_DIR)) {
    console.error('[ERR] Folder not found:', MAPS_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(MAPS_DIR, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => d.name)
    .filter(n => n.toLowerCase() !== 'index.json' && n.toLowerCase() !== 'index.js')
    .filter(n => ALLOWED_EXT.has(path.extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  const list = files.map((filename, i) => ({
    id: toSlug(filename) || `map-${i + 1}`,
    name: toTitle(filename),
    // IMPORTANT: web-friendly path (forward slashes) that matches app.js
    src: `MapsKit/assets/maps/${filename}`
  }));

  fs.writeFileSync(OUT_JSON, JSON.stringify(list, null, 2), 'utf8');

  // JS fallback for file:// — sets a global your app can read without fetch()
  const js = 'window.__MAPS__ = ' + JSON.stringify(list, null, 2) + ';';
  fs.writeFileSync(OUT_JS, js, 'utf8');

  console.log(`[OK] Wrote ${list.length} map(s) to ${OUT_JSON}`);
  console.log(`[OK] Wrote JS fallback to ${OUT_JS}`);
}

main();
