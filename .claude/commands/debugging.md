# Debugging Guide

Common issues, gotchas, and how to reproduce tricky behavior. For a tour of what each file does, see `architecture.md`. For shape math, see `offcut-geometry.md`. For DnD, see `ui-interactions.md`.

## Using Playwright MCP for testing

The app runs at `http://localhost:5173` via `npm run dev`. Use `browser_navigate` to open it, then `browser_snapshot` for an accessibility tree or `browser_take_screenshot` for a visual.

### Bypass `confirm()` dialogs

`TopBar` calls `confirm(...)` for orientation change and Clear All. `SettingsPanel` does the same for Delete Wall. Playwright's dialog handling can be flaky — a quick workaround is to override `window.confirm` before triggering the action:

```js
await browser_evaluate(`
  window.confirm = () => true;
  window.alert = () => {};
`);
// then click the Clear All button etc.
```

### Simulating drag-drop programmatically

HTML5 drag can't be fully simulated with mouse events — you need `DragEvent` + `DataTransfer`. Example template (run inside `browser_evaluate`):

```js
(() => {
  const source = document.querySelector('[data-tile="3"]');  // or whichever selector
  const target = document.querySelector('[data-slot="0,0"]');
  const dt = new DataTransfer();
  dt.setData('text/plain', JSON.stringify({ source: 'pool', tileId: '3' }));

  source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('dragenter',  { bubbles: true, cancelable: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('dragover',   { bubbles: true, cancelable: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('drop',       { bubbles: true, cancelable: true, dataTransfer: dt }));
  source.dispatchEvent(new DragEvent('dragend',    { bubbles: true, cancelable: true, dataTransfer: dt }));
})();
```

Note: the app's components don't use `data-*` attributes — the CSS modules mangle class names into things like `_slot_abc123`. You'll typically query by index or by partial class match.

### Finding elements with mangled CSS-module class names

CSS Modules produce class names like `_slot_xyz123`, unique per build. For robust selectors:

- Use `[class*="_slot_"]` in querySelector.
- Or use the global classes added alongside — `.wall-slot`, `.wall-slot-placed`, `.pulseHighlight` — which are stable.
- Or use the `alt` attribute on tile images: `img[alt="Tile 3"]`, `img[alt^="Offcut "]`.

### Debugging Zustand state via localStorage

The entire persisted state is under a single key:

```js
JSON.parse(localStorage.getItem('tile-planner-state'))
```

To reset:

```js
localStorage.removeItem('tile-planner-state');
location.reload();
```

Or just click Clear All in the UI (which resets pieces but keeps walls).

To snapshot state in-memory during a test, use the store directly from the window if exposed, otherwise dump from localStorage after an action.

## Common gotchas

### Migration from old format

`persistence.ts::migrateState` only runs when `pieces` is empty. If you see a "pieces dict not populated" scenario after an import, check whether migration ran — the heuristic is `if (s.pieces && Object.keys(s.pieces).length > 0) return`.

Old → new:

- `{ tileId: 3 }` → `{ pieceId: '3', rotation: 0, offsetX: 0, offsetY: 0 }`
- `{ pieceId: '5-B', rotation: 90, anchor: 'top-right' }` → `{ pieceId: '5-B', rotation: 90, offsetX: 0, offsetY: 0 }`

The anchor field is **dropped** — the new offset system doesn't carry forward the anchor's geometric meaning. Re-run positioning after import if needed.

### Grid engine edge case: `fullCount === 0`

When the wall dimension is smaller than one tile + grout, `computeSizes` returns `[wallDim]` — a single partial slot spanning the entire axis, **no grout**. This is why niche back surfaces (typically 45×45 cm) render as a **single-slot grid** (`slotKey = '0,0'`) instead of failing. If you add code that iterates grid rows/cols assuming `fullCount >= 1`, it will break on tiny walls.

### Rotation rendering: the `transform-origin` trap

For a rotated placed tile, `transform-origin` **must** be at the center of the visible crop region (`(ir.x - offsetX + slotW/2) * scale`, `(ir.y - offsetY + slotH/2) * scale`). Using `center center` (or any simpler default) makes the image pivot around the image center — since the image is much larger than the slot, it will rotate out of the slot entirely.

If you see "rotation looks fine for some tiles but the image vanishes for others", this is almost certainly it.

### Offcut with rotation — parent cutouts must be rotated into current frame

Parent `geometry.cutouts` are stored in the parent's **natural (rotation=0) frame** `[0, piece.width] × [0, piece.height]`. When the offcut is being computed under a non-zero rotation, you must rotate the parent cutouts into the rotated frame first via `rotateRectInPiece(rect, rotation, parent.width, parent.height)` before clipping them into the offcut's bbox.

`inheritParentCutouts` does this correctly. If you skip it, L-shape offcuts of rotated parents will have cutouts in the wrong corner.

### `findValidOffset` snaps in quantized jumps

For a piece with cutouts, `findValidOffset` builds candidate positions from cutout edges:

```ts
xCandidates += { -(c.x + c.w), slotW - c.x }   // per cutout
```

and tries all combinations. When the user drags past a cutout edge, the slot "jumps" to the next valid zone — this looks correct but can be mistaken for a bug ("the drag isn't smooth"). It's not smooth because it's avoiding the cutout. The only way to cross a cutout is to drag far enough that the slot can fit entirely on the other side.

For rectangular pieces (no cutouts), `findValidOffset` is a pure clamp — motion is smooth.

### Strict mode effect double-invocation

Vite dev mode uses `React.StrictMode` (check `src/main.tsx`), which double-invokes effects in development. If an effect seems to run twice on mount, that's why. Look for side effects that aren't idempotent — image preloads are idempotent (cache check) and safe.

### Niche back surface is a single slot (not a grid)

In `NicheSurfaces.tsx` and `SurfaceGrid.tsx`, the virtual wall used for `computeGrid` is the niche surface's actual dimensions (e.g. 45×45 or 45×15). Since tiles are 60×120, `fullCount === 0` for every practical niche surface, so `computeSizes` returns `[wallDim]`. Result: `1 × 1` grid, placement always at `slotKey === '0,0'`.

This means `wall.nicheTiles.back['0,0']` is the one and only slot. If you iterate with assumptions of multiple slots, nothing breaks (the dict just has one entry), but don't expect niche tiles to be "placed at (row, col)" — there's only (0,0).

### Build errors from `npm run build`

Runs `tsc -b && vite build` — TypeScript strict mode fires first. Common failures:

- Unused imports (flag varies by tsconfig).
- Props with `?:` that are read without nullish coalescing.
- Array accesses on possibly-undefined without `?`.

Run `npx tsc -b --noEmit` for just the type check.

### Visual: tile image doesn't show

Root causes, in order of likelihood:

1. **imageRegion wrong** — check `piece.imageRegion` matches the parent's subregion. For inherited offcuts, `computeOffcutImageRegion` must be called with the correct `(bbX, bbY, bbW, bbH)` in the parent's rotated frame.
2. **transform-origin at center center** — see above, rotation will fly it off-screen.
3. **JPG not in public/tiles/** — `onError` handler hides the `<img>` silently. Check the Network tab for 404s on `/tiles/N.jpg`.
4. **`overflow: hidden` on the wrong element** — should be on `.imageClip`, not `.slot`. Moving it onto `.slot` clips hover controls on thin slots, but the image should still show.

### Cascade bugs: children not getting deleted

Pattern: after a placement change, placed offcut descendants remain — either visible in the UI or still in `pieces`. Root causes:

1. `cascadeDelete` called with a stale copy of `pieces` or `walls` — you must pass the **latest** copies threaded through the action's closure, not `get().pieces` at action-start if you've since made intermediate updates.
2. Missed `cascadeDelete` call — check every path through `placeTile`, `unplaceTile`, `swapTiles`, `rotatePlacement`, `setOffsets`, `updateWallDimension`.
3. `getAllDescendants` only traverses `parentId` chains. If a piece somehow lost its `parentId`, it won't be found.

Debug by logging `getAllDescendants(pieces, pieceId)` before and after the action.

### In-slot drag doesn't trigger

The in-slot drag (mouse-based) only activates when the piece has **overhang**: `effW > slotW + 0.01 || effH > slotH + 0.01`. If the piece exactly fits the slot (`effW == slotW && effH == slotH`), the mousedown handler returns without `preventDefault`, and HTML5 drag happens normally.

If you want to test in-slot drag, use a scenario where the piece is larger than the slot:
- Place a full 60×120 tile on a **partial** slot (e.g. a 45×120 column at the edge of a 'split' remainder wall) → the piece overflows 15cm, in-slot drag works.
- Or set orientation to landscape (tile becomes 120×60) on a wall where slots are 60×120 → overhang either way.

### Sidebar width clamping

`setSidebarWidth` clamps to `[180, 400]`. If you set a value outside that, it's silently clamped — no error. The resizer bar respects this; `getComputedStyle` shows the clamped value.

### Drag image is a plain screenshot (not the custom canvas)

`createPieceDragImage` returns `null` if the tile image isn't cached yet. Browsers snapshot the drag image synchronously at `dragstart` — there's no way to wait for an async load. Fix: ensure `preloadTileImage(tileId)` has run and completed. Components do this in a `useEffect`, so the first drag right after mount of a new piece can get the fallback; subsequent drags get the custom canvas.

### The `autoWrap: true` flag

Niche lip tiles in wrap-around mode are auto-populated by `computeWrapAroundNicheTiles`. The synthetic pieces and placements are marked `autoWrap: true`. Before re-running wrap-around, the function removes previous auto-placed entries — if you add new auto-generation logic, respect this flag or you'll get orphaned pieces.

## Testing playbook

### Basic: place a tile on a wall → offcut appears in sidebar

1. Navigate to `http://localhost:5173`.
2. Default: Wall 1 (75×267, portrait, split remainder). After grout math: `75 = 5.4 + 60 + 0.2 + ?` — one full 60cm column, with `(75 - 60) / 2 = 7.5cm` remainder split into halves of ~7.4 cm each. So the wall has 2 partial columns + 1 full column (or thereabouts).
3. Drag Tile 1 from the left pool onto a full 60-wide slot. Expect placement.
4. Drag Tile 2 onto a partial column. Expect placement + an offcut `2-B` in the sidebar inline below Tile 2.
5. Check `JSON.parse(localStorage.getItem('tile-planner-state')).pieces['2-B']` exists with `parentId: '2'`.

### Niche: Wall 3 in independent mode

1. Click "Wall 3" tab. Niche is enabled by default (45×45×15, fromFloor 125, fromLeft 25).
2. Click "Independent" niche-mode toggle.
3. Below the wall grid: **5 mini-grids** should render (Back, Left, Right, Top, Bottom), each as a single-slot cell sized per the surface dims.
4. Drag any tile onto Niche Back. Expect offcuts to appear (a 60×120 tile cut to 45×45 yields a large shaped offcut).
5. The blue dashed rect on the main wall should now contain the tile image (cropped to 45×45).

### Cascade: place parent, place offcut, move parent

1. Place Tile 5 on a 45-wide partial slot (e.g. using Wall 1's left-partial). Offcut `5-B` appears (15×120 or similar depending on exact slot dims).
2. Place `5-B` on another partial slot somewhere.
3. Hover over Tile 5 in its slot. Click the rotate (↻) button.
4. Expect: **CascadeModal opens**, listing `5-B · <wall name> · slot (r,c)`. Both slots pulse amber.
5. Click "Confirm & Remove". Modal closes. `5-B` is deleted from the pool and its placement slot is empty. Tile 5 has rotated; any new offcut has a new ID (likely `5-B` again since index=0).
6. Toast appears: "Piece 5-B removed from ...".

### Rotation: partial slot → click ↻

1. Place a tile on a partial slot (any wall with a non-split-fit). Offset will be non-zero to keep the slot on material.
2. Hover, click ↻.
3. Expect: image rotates 90° (or skips to 180/270 if 90 doesn't fit). The visible crop should remain centered in the slot. If the image flies offscreen, `transform-origin` is wrong.

### In-slot drag: reposition

1. Place a tile on a partial slot (overhang guaranteed).
2. Press-and-drag the tile image within the slot.
3. The cursor should show `grab` during mousedown. The image shifts live.
4. Release. The new offset persists. If the offset puts the slot over a cutout (for non-rect pieces), it snaps to the nearest valid position.

### Custom drag image

1. Drag any tile from the pool toward a wall slot.
2. Expect: the drag ghost shows the tile marble texture, sized similar to the thumbnail, with any cutouts rendered as transparent holes.
3. If the drag ghost is a plain screenshot of the thumbnail card (with border/label), the image cache miss fallback happened — reload and try again (preload will have run this time).

## Quick recovery

If state gets into a weird state (orphaned pieces, invalid placements, etc.):

```js
// In devtools console:
localStorage.removeItem('tile-planner-state');
location.reload();
```

This resets to defaults (3 walls, Wall 3 with niche, portrait, wrap-around, empty).

Or click "Clear All" in the TopBar — this clears placements but preserves the wall configuration.

## References

- `src/store/index.ts` — every action that could trigger cascade is a source of potential cascade bugs
- `src/services/offcutEngine.ts` — `findValidOffset`, `cascadeDelete`, `canPlacePiece`
- `src/services/persistence.ts` — `migrateState`, `validateState`
- `src/services/gridEngine.ts` — `computeSizes`, `fullCount === 0` edge case
- `src/components/WallView/TileImage.tsx` — `transform-origin` math
- `src/components/WallView/GridSlot.tsx` — three-drag-system convergence
- `src/services/dragImage.ts` — image cache + custom canvas
