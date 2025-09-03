# Changelog

# Tabletop Pals — DM Toolkit Changelog

## v2.2-alpha (2025-08-29)
- Integrated **Logbook** into DM Toolkit.
  - Logbook tile added to Home grid.
  - Route handling and rescue nav updated.
  - Logbook iframe loads standalone app from `/logbook`.
- Replaced old tile-specific hover rules with a **future-proof rule**:
  - `.home-grid .tile:hover` now covers all tiles.
  - Removed redundant CSS for efficiency.
- Confirmed file structure works from:
  `C:\Users\o2mat\OneDrive\Documents\DND Management App build\DocumentsTabletopPals\`

## v2.1 (stable baseline)
- Locked baseline “DM Lite v2.1”.
- Fixed `.dm-title-btn` scaling on mobile.
- Unified **Lime Green** + **Midnight Blue** theme across all panels and controls.

# Tabletop Pals — DM Toolkit Changelog

## v2.2-alpha (2025-08-29)
- Added **Logbook** as a new core feature (integrated into home tiles + routing).
- Introduced **future-proof hover rule** for home tiles (`.home-grid .tile:hover`).
  - Replaced old tile-specific hover rules (dice, notes, dm, world).
  - Any future tiles now inherit hover behaviour automatically.
- Cleaned redundant CSS hover block for efficiency.
- Updated documentation and baseline for future development.

## v2.1 (stable)
- Locked baseline "DM Lite v2.1" as current stable reference.
- Fixed `.dm-title-btn` scaling on mobile.
- Unified theme colours (Lime Green + Midnight Blue) across all panels and controls.

## 1.0.1-alpha.1 — 2025-08-28

- **World Map**: Multi-image support and auto-named entries from `MapsKit/assets/maps`.
- **Viewer**: Scrollable stage with Fit/Actual (dbl‑click in page).
- **Fullscreen**: Actual size with scrolling.
- **Pop‑out / Cast**: Toolbar (Fit / Actual / Zoom + / Zoom − / Reset / Full), always centered.
- **DM Tools**: Embedded Quick Dice with same animated D20 as Dice page.
- **Dice Art**: New arcane D20 SVG matching theme.
