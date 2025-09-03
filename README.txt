 Tabletop Pals — DM Toolkit (with MapsKit + Logbook)

**Current Version:** v2.2-alpha  
**Stable Baseline:** v2.1 (DM Lite)

---

## What’s New (v2.2-alpha)
- Added **Logbook** as a new Home tile (iframe from `/logbook` folder).
- Updated routing + rescue nav to include `logbook`.
- Future-proof hover state for tiles (`.home-grid .tile:hover`).
- Confirmed working structure in:


# Tabletop Pals — DM Toolkit (with MapsKit)

Current Version: **v2.2-alpha**  
Stable Baseline: **v2.1 (DM Lite)**

---

## What's New (v2.2-alpha)
- Integrated **Logbook** feature: a dedicated space for session notes/history.
- Added a **future-proof hover rule** for home tiles — consistent animations without needing tile-specific selectors.
- Cleaned up redundant CSS hover rules to keep codebase lean.

---

## Project Structure
- `index.html` — Main UI (Home tiles, navigation, panels).
- `style.css` — Global theme (Lime Green + Midnight Blue), responsive scaling, tile hover states.
- `app.js` — App state, routing, maps loader, dice logic, DM tools, logbook integration.
- `MapsKit/` — Map manager:
  - `assets/maps/` — Drop your PNG/JPG/SVG/WEBP maps here.
  - `assets/maps/index.json` — Auto-generated map list.
  - `assets/maps/index.js` — Fallback for local `file://` use.
  - `tools/generate-maps-index.js` — Node script to rebuild map index.
  - `generate-maps.bat` — One-click Windows script for rebuilding index.
- `README.txt` — Project documentation.
- `CHANGELOG.md` — Version history.

---

## Quick Start
1. Open `index.html` in a browser (serve locally for best results).
2. Use the **Home Tiles** to access World, Dice, DM, Notes, and now **Logbook**.
3. For maps: drop files into `MapsKit/assets/maps/`, then run `generate-maps.bat` (Windows) or  
   `node tools/generate-maps-index.js` (Mac/Linux).

---

## Versioning
- **v2.1 (stable)** — Baseline “DM Lite” release.
- **v2.2-alpha** — Current development build with Logbook + improved CSS.


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

