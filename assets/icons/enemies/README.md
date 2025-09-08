# TabletopPals Enemy Icons (Partial Set)

This package contains a partial set of **enemy icons** for the TabletopPals dark‑UI web application. The icons here have been drawn from silhouettes generated via an image generator and converted into the TabletopPals house style. Each icon is supplied as **PNG only**; no vector formats are included.

## Style and Palette

- **Badge:** All icons sit on a *rounded diamond* badge with a danger‑red ring (`#E14A4A`) and a semi‑transparent black interior. This backdrop matches TabletopPals’ dark panels.
- **Silhouette:** Foreground marks are rendered in off‑white (`#eaf2ec`) with a bold dark outline (`#0f1317`).
- **Sizes:** Icons are exported at 1024 px, 512 px, and 256 px square, plus a mask version for CSS tinting.

## Files

For each icon (slug), you will find:

| File | Description |
|------|-------------|
| `enemy-<slug>.png` | 1024 px badge icon |
| `enemy-<slug>-512.png` | 512 px badge icon |
| `enemy-<slug>-256.png` | 256 px badge icon |
| `enemy-<slug>--mask.png` | White silhouette only (no badge) |
| `<slug>.png` | Alias for the 1024 px version |

The JSON manifest (`manifest.enemies.json`) enumerates all included icons with metadata and file paths.

## Preview

The `preview-grid.png` shows the included icons in a grid for quick reference.

