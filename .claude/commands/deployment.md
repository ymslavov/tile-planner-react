# Deployment & Build Reference

How to run, build, tune, and deploy the tile planner.

## Dev workflow

```bash
cd ~/projects/tile-planner-react
npm install          # first time only
npm run dev
```

Vite dev server starts at `http://localhost:5173`. HMR is enabled; most file edits reload instantly. Changes to `vite.config.ts`, `tsconfig.*.json`, or `package.json` require a dev-server restart.

`npm run lint` runs ESLint (`eslint.config.js`) — no required hooks; you can ignore or fix.

## Build

```bash
npm run build
```

Runs `tsc -b && vite build`:

1. **`tsc -b`** — TypeScript project references build. Strict mode errors will fail the build. Run `npx tsc -b --noEmit` to type-check without producing output.
2. **`vite build`** — bundles to `dist/`. Outputs an `index.html` + hashed JS/CSS + `tiles/` copied from `public/`.

To test the production bundle locally:

```bash
npm run preview    # serves dist/ at http://localhost:4173
```

## Tuning the app

All hand-tunable values live in `src/constants.ts`:

```ts
export const TILE_COUNT = 18;      // number of tile images in public/tiles/
export const TILE_W     = 60;      // portrait width, cm
export const TILE_H     = 120;     // portrait height, cm
export const GROUT      = 0.2;     // grout width between tiles, cm (2mm)
export const STORAGE_KEY = 'tile-planner-state';

export const DEFAULT_WALLS: Wall[] = [ /* three walls */ ];
```

### Changing tile dimensions

Update `TILE_W` and/or `TILE_H`. Both `gridEngine` and `offcutEngine` read from these via `pieceHelpers.getTileW/getTileH(orientation)`. On next load the app will initialize pieces at the new dims.

Existing saved state in localStorage has `piece.width`/`height` baked in — it won't auto-resize. Either Clear All, remove `localStorage['tile-planner-state']`, or bump `STORAGE_KEY` to force a fresh start.

### Changing grout width

Update `GROUT`. All grid calculations use this; niche overlap, bbox trimming, and everything else recompute on next render. No persistence concerns (grout isn't stored per-wall).

### Changing default walls

Edit `DEFAULT_WALLS` in `src/constants.ts`. Shape:

```ts
{
  id: 'wall-1',
  name: 'Wall 1',
  width: 75,
  height: 267,
  niche: null,  // or { width, height, depth, fromFloor, fromLeft }
  remainderH: 'split' | 'left' | 'right',
  remainderV: 'bottom' | 'top' | 'split',
  tiles: {},
  nicheTiles: { back: {}, left: {}, right: {}, top: {}, bottom: {} },  // required iff niche != null
}
```

Wall IDs should remain unique. `activeWallId: 'wall-1'` in the store defaults to the first wall — change `defaultState.activeWallId` in `src/store/index.ts` if you rename.

### Sidebar width constraints

Defined in `src/store/index.ts`:

```ts
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 400;
```

`setSidebarWidth(width)` clamps to this range. Bump the max if you want wider thumbnails; the 2-column grid scales `thumbW` proportionally.

### Adding more tiles

1. Drop additional images into `public/tiles/` as `19.jpg`, `20.jpg`, etc. Format: JPG, portrait orientation, aspect ratio matching `TILE_W : TILE_H` (60:120 = 1:2). Typical source: 1500×3000 or similar.
2. Bump `TILE_COUNT` in `src/constants.ts`.
3. Hard-reload to pick up the change (or Clear All).

The app doesn't inspect the filesystem at runtime — any IDs up to `TILE_COUNT` are loaded. Missing files gracefully `onError`-hide the `<img>`, but offcut generation uses cm-based math so missing images don't break the logic.

### Image preloading for drag canvas

Images in `public/tiles/` are served from the site root at `/tiles/N.jpg` (Vite copies `public/` verbatim into `dist/`). The drag-image canvas (`src/services/dragImage.ts`) preloads tiles lazily via a module-level `Map<tileId, HTMLImageElement>`. First drag of a never-seen tile may fall back to the default drag ghost; subsequent drags use the custom canvas.

If you want to eagerly preload all 18 on mount, add this to `App.tsx`:

```ts
import { preloadTileImage } from './services/dragImage';
import { TILE_COUNT } from './constants';

useEffect(() => {
  for (let i = 1; i <= TILE_COUNT; i++) preloadTileImage(i);
}, []);
```

Currently the app preloads on `GridSlot`/`PoolTile`/`SurfaceGrid SlotCell` mount, which covers most interactive cases.

## GitHub Pages deployment

The Vite config must declare the subpath that GH Pages serves from, so asset URLs resolve correctly (`/tile-planner-react/assets/...` instead of `/assets/...`).

### `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/tile-planner-react/',   // ← must match the repo name for GH Pages
})
```

### GitHub Actions workflow — `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Push any commit to `main`, Actions builds `dist/` and `actions/deploy-pages` uploads it to the `github-pages` environment.

### GitHub Pages settings

In the repo on github.com: **Settings → Pages → Build and deployment → Source = "GitHub Actions"**. No branch selection — the workflow handles everything.

### Deployed URL

After the workflow succeeds:

```
https://ymslavov.github.io/tile-planner-react/
```

(or whatever `https://<user>.github.io/<repo>/` maps to for your GH account).

### Manual redeploy

Either push a new commit to `main`, or from the repo's Actions tab, open the latest workflow run and click "Re-run all jobs". Or use `workflow_dispatch`:

```bash
gh workflow run deploy.yml
gh run watch
```

### Disabling the deploy temporarily

- **Cleanest**: Actions tab → "Deploy to GitHub Pages" workflow → "..." menu → Disable workflow.
- **Alternative**: edit `.github/workflows/deploy.yml` to change the trigger to `on: workflow_dispatch` only, commit the change.
- **Destructive but clear**: delete the workflow file. Commits to main won't trigger any build.

### Troubleshooting

**Assets 404 after deploy** — `base` in `vite.config.ts` doesn't match the repo name. Both must be `/tile-planner-react/` (with leading and trailing slash).

**White page, console errors about `MIME type`** — same root cause: assets load with wrong URLs. Fix `base`.

**Tile images 404** — `public/tiles/` wasn't committed, or file names don't match `1.jpg`…`TILE_COUNT.jpg`. Verify in the deployed site via Network tab.

**TypeScript build fails in CI but works locally** — probably a dev-dependency version mismatch. Run `npm ci` locally (clean install from lockfile) to reproduce.

**Workflow doesn't trigger** — check the default branch is `main`, not `master`. The workflow's `on.push.branches` is `[main]`.

### Cache busting

Vite emits hashed asset filenames (e.g. `index-Abcd123.js`), so clients always fetch the latest bundle after deploy. No manual cache busting needed. If you see stale JS/CSS, it's likely the `index.html` being cached by the browser or a CDN — hard-reload or check GH Pages cache headers.

## Local self-hosting

If you want to host the built app on any static web server (nginx, Caddy, s3+cloudfront, etc.):

1. Decide the URL subpath where it'll live (e.g. `/tile-planner`).
2. Set `base: '/tile-planner/'` in `vite.config.ts` accordingly.
3. `npm run build`.
4. Upload `dist/` to the server at the chosen subpath.

If serving from root (`/`), set `base: '/'` (or omit the option — `/` is the Vite default).

## References

- `src/constants.ts` — all tunables
- `vite.config.ts` — build config
- `package.json` — scripts (`dev`, `build`, `preview`, `lint`)
- `public/tiles/` — tile images
- `.github/workflows/deploy.yml` — GH Pages CI
