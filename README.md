# TabletopPals — Beta 0.9.0-beta

This is the **beta docs drop** for the DocumentsTabletopPals project. It does not change your HTML/JS — it only adds/updates docs and the version file.

## What you get
- `VERSION` → sets project version to **0.9.0-beta**
- `README.md` → quick orientation and rules
- `CHANGELOG.md` → summary of changes for the beta milestone

## Visual-only policy (Base Alpha → Beta)
- **Single source of truth:** `DocumentsTabletopPals/CSS/theme.css`
- Every stylesheet must begin with:
  ```css
  @import url("../CSS/theme.css");
  ```
- Tokens drive colours, typography and states. Do **not** modify HTML/JS, links, classes, data-attributes, or layout.

### Core tokens (already in theme.css)
```
--color-primary, --color-primary-600, --color-primary-700
--color-surface-1, --color-surface-2, --color-border, --color-text, --input-bg
--font-body (defaults to Poppins stack)
```

## Modules overview (unchanged in this drop)
- **DM Home & Panels**
- **Encounters** (builder + calculators)
- **Logbook**
- **Character Manager** (shares `localStorage` key `tp_cc_characters` with DM Party)
- **World Map**
- **Feedback** (Formspree endpoint configurable)

## How to apply this drop
1) Copy the `DocumentsTabletopPals/` folder from this zip into your existing project root (same name), allowing it to **merge/overwrite** only these docs files.
2) Commit and tag:
   ```bash
   git add .
   git commit -m "docs: bump to 0.9.0-beta and add beta docs"
   git tag v0.9.0-beta
   git push && git push --tags
   ```

## Beta expectations
- Feature set is stable; polish and bug-fixing continue.
- Accessibility and mobile scaling remain priorities; see internal QA checklist.
