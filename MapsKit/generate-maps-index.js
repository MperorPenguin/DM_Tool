// tools/generate-maps-index.js
// Usage: npm run maps  (or)  node tools/generate-maps-index.js
// Scans assets/maps for PNG/SVG/JPG/WEBP and writes assets/maps/index.json.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const MAP_DIR = path.resolve('assets/maps');
const OUT = path.join(MAP_DIR, 'index.json');
const exts = new Set(['.png','.svg','.jpg','.jpeg','.webp']);

function prettyName(filename){
  const base = filename.replace(/\.[^.]+$/,'').replace(/[_\-]+/g,' ').trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

async function main(){
  try{
    const items = await fs.readdir(MAP_DIR, { withFileTypes: true });
    const files = items
      .filter(d => d.isFile())
      .map(d => d.name)
      .filter(n => exts.has(path.extname(n).toLowerCase()))
      .sort();

    const list = files.map((fname, i) => ({
      id: `m${i+1}`,
      name: prettyName(fname),
      src: `assets/maps/${fname}`
    }));

    await fs.writeFile(OUT, JSON.stringify(list, null, 2), 'utf8');
    console.log(`Wrote ${OUT} with ${list.length} entries.`);
  }catch(err){
    console.error('Failed:', err);
    process.exitCode = 1;
  }
}

main();
