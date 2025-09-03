# Tabletop Pals — Maps Kit (PNG-first)

This kit contains ONLY what's needed to manage **battle maps** for the DM Toolkit.

## Folder Structure
- `assets/maps/` — put your PNG/JPG/SVG/WEBP maps here (e.g., `dungeon.png`, `forest_clearing.png`).
- `assets/maps/index.json` — auto-generated list of maps the app reads.
- `tools/generate-maps-index.js` — script that scans the folder and rebuilds `index.json`.
- `generate-maps.bat` — double-click on Windows to regenerate `index.json` (no PowerShell policy change needed).
- `package.json` — enables `npm run maps`.

## Quick Start (Windows)
1. Install Node.js from https://nodejs.org/
2. Drop your map PNGs into `assets\maps\`
3. Double-click `generate-maps.bat`

## Quick Start (Mac/Linux)
```bash
node tools/generate-maps-index.js
# or, if you added the npm script:
npm run maps
```

## Naming Convention
- Use lowercase, hyphens/underscores: `dungeon.png`, `forest_clearing.png`, `desert-ruins.png`
- The visible name in the app comes from the filename:
  - `dungeon.png` → "Dungeon"
  - `cavern_underground.png` → "Cavern underground"

## How the Map File Should Look
- File format: **PNG preferred** (JPG ok; SVG/WebP supported)
- Dimensions: any; common sizes: 2048×2048, 4096×4096, or 3840×2160
- Resolution: 72–150 DPI is plenty for screen
- Keep file size reasonable (<10–15 MB) for quick loading
- Optional transparency (PNG) if you want overlays

## Integrating with Your Existing App
- Your `app.js` fetches `assets/maps/index.json` and shows the list in **DM Panel → Tools → Maps**.
- No changes to your existing `index.html` / `app.js` are required; just run this generator whenever you add maps.

