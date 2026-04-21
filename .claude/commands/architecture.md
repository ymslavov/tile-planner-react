# Tile Planner React — Architecture

Start-here reference for the codebase. Everything else (`offcut-geometry.md`, `ui-interactions.md`, `debugging.md`, `deployment.md`) drills into a specific area.

## What it is

A single-page React + TypeScript + Vite app for planning the layout of marble tiles across bathroom walls that may contain niches. Features:

- Drag-and-drop tile placement (pool → wall, wall → wall, wall → pool).
- Per-placement rotation (0/90/180/270) plus continuous `offsetX`/`offsetY` positioning within a slot.
- Hierarchical offcut tracking — when a tile is cut, the leftover is tracked as a shaped piece that can be placed elsewhere and itself cut.
- Cascade invalidation — repositioning a parent piece invalidates placed offcut descendants (with confirmation modal).
- Niche support: independent mode (5 droppable surfaces) or wrap-around mode (auto-populated lip tiles).
- Printable cut sheet grouped by source tile.

## Tech stack

- **React 19** (`^19.2.4`) + **TypeScript** (strict mode, `~5.9.3`)
- **Vite 8** (`^8.0.1`) with `@vitejs/plugin-react`
- **Zustand 5** (`^5.0.12`) — single store, no middleware
- **CSS Modules** — one `.module.css` per component, plus `src/styles/index.css` for globals
- No other runtime deps. No router. No UI framework.

## Project structure

```
tile-planner-react/
├── public/
│   ├── tiles/                    # 1.jpg – 18.jpg (served at /tiles/N.jpg)
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── main.tsx                  # Entry point: ReactDOM.createRoot(<App />)
│   ├── App.tsx                   # TopBar + 3-panel layout + CascadeModal + ToastContainer + CutSheet
│   ├── constants.ts              # TILE_W, TILE_H, GROUT, TILE_COUNT, STORAGE_KEY, DEFAULT_WALLS
│   ├── store/
│   │   ├── types.ts              # All domain types
│   │   └── index.ts              # Zustand store (state + actions)
│   ├── services/                 # Pure functions — no React, no DOM in most
│   │   ├── gridEngine.ts         # Grid math (columns, rows, niche overlap)
│   │   ├── offcutEngine.ts       # Offcut creation, cascade, validity
│   │   ├── pieceHelpers.ts       # Piece registry utilities
│   │   ├── persistence.ts        # localStorage + JSON export/import + migration
│   │   ├── wrapAroundNiche.ts    # Wrap-around niche lip computation
│   │   ├── cutSheetEngine.ts     # Cut-sheet data aggregation
│   │   └── dragImage.ts          # HTML5 drag-image canvas (DOM-using)
│   ├── components/
│   │   ├── TopBar/               # Orientation + niche-mode toggles, save/load/print/clear
│   │   ├── TilePool/             # Left panel: tiles + offcut tree, sidebar resizer
│   │   │   ├── TilePool.tsx
│   │   │   ├── PoolTile.tsx
│   │   │   ├── OffcutRow.tsx
│   │   │   ├── OffcutThumbnail.tsx
│   │   │   └── SidebarResizer.tsx
│   │   ├── WallView/             # Center panel: tabs + scaled wall + slots
│   │   │   ├── WallView.tsx
│   │   │   ├── WallTabs.tsx
│   │   │   ├── WallGrid.tsx
│   │   │   ├── GridSlot.tsx
│   │   │   ├── TileImage.tsx
│   │   │   ├── PlacementControls.tsx
│   │   │   ├── NicheOverlay.tsx
│   │   │   └── RemainderControls.tsx
│   │   ├── NicheSurfaces/        # Below wall grid: 5 (independent) or 1 (wrap-around) surfaces
│   │   │   ├── NicheSurfaces.tsx
│   │   │   └── SurfaceGrid.tsx
│   │   ├── Settings/             # Right panel: wall/niche dims + delete
│   │   │   └── SettingsPanel.tsx
│   │   ├── CutSheet/             # Print-only output
│   │   │   ├── CutSheet.tsx
│   │   │   └── CutTileSection.tsx
│   │   ├── CascadeModal/         # Confirmation dialog for cascade-deletes
│   │   │   └── CascadeModal.tsx
│   │   └── Toast/
│   │       └── ToastContainer.tsx
│   └── styles/
│       └── index.css             # Globals, buttons, scrollbars, @media print, .pulseHighlight
├── docs/                         # spec.md, plan.md
├── .claude/commands/             # Skills (this file lives here)
├── index.html
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── eslint.config.js
└── package.json
```

## Entry point + layout

- `src/main.tsx` — standard `ReactDOM.createRoot(document.getElementById('root')!).render(<App />)`.
- `src/App.tsx`:
  1. Calls `useStore((s) => s.initialize)` in a `useEffect` on mount to load persisted state.
  2. Renders a flex-column with `<TopBar />` and a flex-row containing `<TilePool />`, `<WallView />`, `<SettingsPanel />`.
  3. Renders `<CutSheet />` (display:none except on print), `<ToastContainer />`, `<CascadeModal />` outside the main flex.
  4. The whole main area is wrapped in `.no-print` so print shows only the cut sheet.

## Type system (`src/store/types.ts`)

### Core data types

```ts
type Orientation = 'portrait' | 'landscape';
type NicheMode = 'wrap-around' | 'independent';
type RemainderMode = 'left' | 'right' | 'split' | 'top' | 'bottom';
type AnchorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
//   ^ AnchorPosition is legacy; the current Placement uses offsetX/offsetY.

interface Cutout      { x: number; y: number; w: number; h: number; }
interface ImageRegion { x: number; y: number; w: number; h: number; }
```

### Piece

```ts
interface Piece {
  id: string;                   // "5", "5-B", "5-B1", "5-B1a"  (hierarchical)
  sourceTileId: number;         // 1..18 — which JPG this derives from
  parentId: string | null;      // null for originals 1..18
  width: number;                // cm, natural (rotation=0) dimensions
  height: number;
  geometry: {
    boundingBox: { w: number; h: number };  // always equals width × height
    cutouts: Cutout[];          // [] = rectangle, 1 = L, 2 = C, 4 = frame
  };
  imageRegion: ImageRegion;     // cm rect into the source tile image
  autoWrap?: boolean;           // true for auto-placed niche-lip pieces
}
```

`geometry.cutouts` are stored in the piece's **natural (rotation=0) coordinate system**, `[0, width] × [0, height]`. When used under a non-zero rotation, they must be rotated via `rotateRectInPiece()` (see `offcut-geometry.md`).

### Placement

```ts
interface Placement {
  pieceId: string;
  rotation: number;   // 0 | 90 | 180 | 270
  offsetX: number;    // cm: piece.top-left relative to slot.top-left. Range: [slotW - effW, 0]
  offsetY: number;    // cm: piece.top-left relative to slot.top-left. Range: [slotH - effH, 0]
  autoWrap?: boolean; // true for auto-placed lip tiles
}
```

Negative `offsetX` means the piece extends **left** of the slot — i.e. part of the piece will be cut off on the left. Zero means flush top-left.

### Wall + niche

```ts
interface Niche { width, height, depth, fromFloor, fromLeft: number; }  // all cm

interface Wall {
  id: string;
  name: string;
  width: number;                           // cm
  height: number;
  niche: Niche | null;
  remainderH: 'left' | 'right' | 'split';  // partial-tile position horizontally
  remainderV: 'top'  | 'bottom' | 'split';
  tiles: Record<string, Placement>;        // key = "row,col"
  nicheTiles?: NicheTiles;                 // present iff niche != null
}

type NicheTiles = {
  back:   Record<string, Placement>;  // niche.width × niche.height
  left:   Record<string, Placement>;  // niche.depth × niche.height
  right:  Record<string, Placement>;  // niche.depth × niche.height
  top:    Record<string, Placement>;  // niche.width × niche.depth
  bottom: Record<string, Placement>;  // niche.width × niche.depth
};
type NicheSurfaceKey = keyof NicheTiles;
```

### Grid + niche-overlap

```ts
interface GridSlot { row, col, x, y, w, h: number; isPartialW, isPartialH: boolean; }
interface GridResult { totalRows, totalCols: number; colWidths, rowHeights: number[]; slots: GridSlot[]; tw, th: number; }
interface NicheRect { left, top, width, height, right, bottom: number; }
interface AffectedSlot extends GridSlot {
  nicheOverlap: { left, top, right, bottom: number };
  fullyInside: boolean;  // slot is entirely within niche opening → hidden from wall view
}
interface NicheOverlapResult { affectedSlots: AffectedSlot[]; nicheRect: NicheRect | null; }
```

### App state

```ts
interface TilePlannerState {
  orientation: Orientation;
  nicheMode: NicheMode;
  activeWallId: string;
  pieces: Record<string, Piece>;
  walls: Wall[];
  toasts: Toast[];
  sidebarWidth: number;
  cascadePreview?: CascadePreview | null;  // runtime-only, NOT persisted
}

interface Toast { id: string; message: string; }

interface RemovedPlacement { pieceId: string; wallName: string; surface: string | null; }

interface AffectedDescendant { pieceId: string; wallName: string; slotKey: string; surface: string | null; }

interface CascadePreview {
  affectedPieceIds: string[];
  affectedDescendants: AffectedDescendant[];
  onConfirm: () => void;
  onCancel: () => void;
}
```

### Drag data

Three flavors of `DataTransfer` payload, stringified into `text/plain`:

```ts
type DragData =
  | { source: 'pool';  tileId: string }
  | { source: 'wall';  key: string }                                   // "row,col"
  | { source: 'niche'; surfaceKey: NicheSurfaceKey; key: string };
```

### Cut sheet

```ts
interface CutPiece { label, placement, cutDesc: string; width, height, centerX, centerY: number; }
interface TileCut { type: 'horizontal' | 'vertical'; positionCm: number; }
interface CutEntry { tileId, wallId, wallName: string; pieces: CutPiece[]; tileCuts: TileCut[]; waste: number; }
```

## Zustand store (`src/store/index.ts`, ~1030 lines)

Single `create<Store>((set, get) => ({...}))`. No middleware (no devtools, no persist — persistence is handled manually via `_save`). `Store = TilePlannerState & TilePlannerActions`.

Constants at the top of the file:

```ts
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 400;
```

### Actions catalogue

| Action | Purpose |
|---|---|
| `initialize()` | Load from localStorage (if present) and run `_applyWrapAround()`. Called once on App mount. |
| `setActiveWall(wallId)` | Switch active wall tab. |
| `setOrientation(orientation)` | Swap portrait↔landscape. **Clears all placements** and resets pieces to full originals at the new dims. Caller (TopBar) shows a `confirm()` if any tiles are placed. |
| `setNicheMode(mode)` | `'wrap-around'` vs `'independent'`. Triggers `_applyWrapAround`. |
| `addWall()` | Append new wall `{100×267, split/bottom, no niche}` with id `wall-${Date.now()}`. Sets it active. |
| `deleteWall(wallId)` | Remove the wall (refuses if only one left). If active, moves active to previous. |
| `updateWallDimension(wallId, 'width'|'height', value)` | Resize a wall. Recomputes the grid and **cascade-deletes placements whose slot no longer exists or no longer fits**, emitting toasts. |
| `setRemainderH/V(wallId, mode)` | Change partial-tile position. |
| `toggleNiche(wallId, enabled)` | Add niche with defaults `{45×45×15, fromFloor:125, fromLeft:25}` or remove it (drops `nicheTiles`). Triggers wrap-around. |
| `updateNiche(wallId, field, value)` | Change a single niche dimension. Triggers wrap-around. |
| `centerNiche(wallId)` | Sets `fromLeft = round((wallW - nicheW)/2, 0.1)`. |
| `placeTile(wallId, slotKey, pieceId)` | Core placement. See flow below. |
| `unplaceTile(wallId, slotKey)` | Remove placement + cascade-delete its children. |
| `swapTiles(wallId, fromKey, toKey)` | Same-wall swap. Cascade-deletes both pieces' children and recreates offcuts from new slot dims. |
| `rotatePlacement(wallId, slotKey)` | Cycle to next rotation where the piece still covers the slot. Opens cascade modal if descendants are placed. |
| `setOffsets(wallId, slotKey, offsetX, offsetY)` | Reposition via `findValidOffset()` (snaps around cutouts). Opens cascade modal if needed. Core of in-slot drag. |
| `placeNicheTile(wallId, surfaceKey, slotKey, pieceId)` | Place on niche surface. Niche surfaces are single-slot grids (`slotKey === '0,0'`). |
| `unplaceNicheTile(wallId, surfaceKey, slotKey)` | Remove + cascade-delete. |
| `swapNicheTiles(wallId, fromSurface, fromKey, toSurface, toKey)` | Cross-surface swap. Does NOT cascade-delete (lightweight). |
| `rotateNichePlacement(wallId, surfaceKey, slotKey)` | Same as wall rotate, but for niche surfaces. |
| `setNicheOffsets(wallId, surfaceKey, slotKey, x, y)` | Same as `setOffsets`, niche version. |
| `doExportJSON()` | Downloads state as `tile-layout.json`. |
| `doImportJSON()` | File picker; runs migration + validation. |
| `clearAll()` | Reset pieces + clear all wall/niche placements. |
| `setSidebarWidth(px)` | Clamps to `[SIDEBAR_MIN=180, SIDEBAR_MAX=400]` and persists. |
| `showToast(message)` | Pushes + auto-removes after 3s. |
| `removeToast(id)` | Manual dismiss. |
| `showCascadePreview(ids, descendants, onConfirm, onCancel)` | Opens the CascadeModal and highlights affected slots. |
| `hideCascadePreview()` | Close modal without applying. |
| `_save()` | Internal: `persistState({...})` to localStorage. |
| `_applyWrapAround()` | Internal: when `nicheMode === 'wrap-around'`, call `computeWrapAroundNicheTiles()` per wall. |

### Internal flow — placement pattern

Every action that changes placements follows this pattern:

1. Find the wall.
2. Cascade-delete offcut descendants of any pieces whose geometry is about to change (via `cascadeDelete()` from `offcutEngine`).
3. Emit a toast for each cross-surface/cross-wall removal.
4. Update `wall.tiles[slotKey]` with the new `Placement`.
5. Recompute offcuts via `createOffcuts(pieces, pieceId, slotW, slotH, rotation, offsetX, offsetY)`.
6. `_applyWrapAround()` → `_save()`.

## Services

All files in `src/services/`. Pure functions operating on domain types. `dragImage.ts` is the only one that touches the DOM.

### `gridEngine.ts`

- **`computeSizes(wallDim, tileDim, grout, mode) → number[]`** — column widths / row heights for one axis. Special cases:
  - Exact fit (`remainder < grout`): return `fullCount × [tileDim]`.
  - **`fullCount === 0`** (wall smaller than one tile + grout): return `[wallDim]` — single partial slot spanning the entire axis, **no grout**. This is why tiny niche surfaces render as single-slot grids (`slotKey === '0,0'`).
  - `'right'`/`'bottom'`: full tiles then partial at the end.
  - `'left'`/`'top'`: partial first, then full tiles.
  - `'split'`: `halfLeft` + `fullCount × tileDim` + `halfRight`, each half rounded to 0.1cm.
- **`computeGrid(wall, orientation) → GridResult`** — builds `slots[]` by stacking `rowHeights × colWidths` with grout gaps. Each slot has `isPartialW / isPartialH` flags.
- **`computeNicheOverlap(wall, grid) → { affectedSlots, nicheRect }`** — Niche rect is `{left: fromLeft, top: wallHeight - fromFloor - height, ...}`. Each affected slot gets `nicheOverlap` (intersection rect) and `fullyInside` (hidden in WallGrid).

### `offcutEngine.ts`

All the offcut geometry. See `offcut-geometry.md` for deep dive. Exported functions:

- `generateOffcutId(parentId, index)` — hierarchical IDs: `"5" → "5-B"`, `"5-B" → "5-B1"`, `"5-B1" → "5-B1a"`.
- `computeOffcutImageRegion(parent, rotation, ox, oy, ow, oh)` — maps offcut's piece-local coords back into the original tile image frame, handling all 4 rotations.
- `isOffsetValid(piece, rotation, slotW, slotH, offsetX, offsetY)` — checks slot lies entirely on material (no cutout overlap).
- `findValidOffset(piece, rotation, slotW, slotH, prefX, prefY)` — clamps + snaps to cutout edges. Fast path for rectangles.
- `createOffcuts(pieces, pieceId, slotW, slotH, rotation, offsetX, offsetY) → { offcuts, pieces }` — 1 offcut for L/C/frame/strip, 2 offcuts for disconnected strips, 0 for exact fit.
- `cascadeDelete(pieces, walls, pieceId) → { removedPlacements, pieces, walls }` — removes all descendants from pieces + placements.
- `canPlacePiece(pieces, pieceId, slotW, slotH)` — true if any rotation fits.
- `getValidAnchors(eff, slot)` — **deprecated**, returns `['top-left']` for backward-compat. The anchor system was replaced by continuous offsets.

### `pieceHelpers.ts`

- `getTileW(orientation)`, `getTileH(orientation)` — returns 60/120 or 120/60 depending on orientation.
- `initPieces(orientation)` — creates pieces 1..18 as full originals.
- `getEffectiveDims(piece, rotation)` — `{w, h}` with w/h swapped for 90°/270°.
- `getChildPieces(pieces, pieceId)` — direct children via `parentId === pieceId`.
- `getAllDescendants(pieces, pieceId)` — BFS all descendant IDs.
- `getPiecePlacement(walls, pieceId) → { wall, key, surface } | null` — first match searching wall tiles then niche surfaces.
- `getPlacedPieceIds(walls) → Map<pieceId, { wallId, location }>`.
- `getUnplacedPieceIds(pieces, walls)`.

### `persistence.ts`

- `loadState()` — reads `STORAGE_KEY = 'tile-planner-state'`, runs `migrateState` + `validateState`, ensures `pieces` is initialized.
- `saveState(state)` — JSON-stringify + localStorage.
- `migrateState(s)` — migrates old vanilla-JS format (`{tileId: N, anchor: 'top-left'}`) to new (`{pieceId, rotation, offsetX, offsetY}`). Only runs if `pieces` is empty.
- `validateState(s)` — removes duplicate placements and warns.
- `exportJSON(state)` — download as `tile-layout.json` via Blob + anchor click.
- `importJSON()` — file picker, returns Promise. Resolves to `null` on cancel/error.

### `wrapAroundNiche.ts`

- `computeWrapAroundNicheTiles(wall, pieces, orientation) → { wall, pieces }` — in wrap-around mode, scans niche-affected wall slots and auto-populates the lip surfaces (left/right/top/bottom) using the appropriate child offcut (or falls back to the parent piece). Marks auto-placed placements with `autoWrap: true`, and the synthetic pieces with `autoWrap: true` so they get cleaned up on re-run.

### `cutSheetEngine.ts`

- `collectCutSheetData(pieces, walls) → CutEntry[]` — per source tile 1..18, walks the piece tree, computes cut positions and piece labels, returns the data the `CutSheet` component renders with SVG overlays.

### `dragImage.ts` (DOM)

- Module-level `imageCache: Map<tileId, HTMLImageElement>` and `imageLoading: Map<tileId, Promise>`.
- `preloadTileImage(tileId)` — fires off an `<img>` load and caches.
- `createPieceDragImage(piece, targetWidth) → { canvas, cleanup } | null` — synchronously builds a canvas with `ctx.clip('evenodd')` for cutouts, draws the tile image via `drawImage(img, sx, sy, sw, sh, ...)`, appends it off-screen, returns the canvas for `dataTransfer.setDragImage()`. **Must be called synchronously inside dragstart** — the browser snapshots it immediately. Returns null if image not yet cached — that's why components call `preloadTileImage` in a `useEffect`.

## Component architecture

### `App.tsx`
Flex-column: `<TopBar>` + flex-row of three panels. Plus three top-level siblings: `<CutSheet>`, `<ToastContainer>`, `<CascadeModal>`.

### `TopBar/TopBar.tsx`
Orientation toggle (shows `confirm()` if any tiles placed), niche-mode toggle, Save/Load/Print/Clear buttons. `Clear All` also confirms.

### `TilePool/`

- `TilePool.tsx` — Left panel. Computes `thumbW` from `sidebarWidth - POOL_PADDING (12)` minus `TILE_GAP (4)`. Renders 18 `families` (parent `PoolTile` + inline `OffcutRow` tree) inside a drop target. Drop accepts `wall`/`niche` drags → unplace.
- `PoolTile.tsx` — Single tile thumbnail. Draggable iff not placed. `onDragStart`: sets `{source: 'pool', tileId}`, builds drag image via `createPieceDragImage` for a full-tile Piece.
- `OffcutRow.tsx` — Recursive: renders child offcuts with indentation.
- `OffcutThumbnail.tsx` — Renders offcut at proportional scale with CSS `clip-path: polygon(evenodd, ...)` to mask out cutouts.
- `SidebarResizer.tsx` — Thin vertical handle on the right edge. `onMouseDown` installs `mousemove`/`mouseup` on `document` to live-adjust `sidebarWidth`.

### `WallView/`

- `WallView.tsx` — Composes `WallTabs`, the scaled wall area (with labels), `RemainderControls`, `NicheSurfaces` if niche present. Uses `ResizeObserver` to keep `scale = min(availWidth/wallW, availHeight/wallH)` up-to-date.
- `WallTabs.tsx` — Tab bar with "+" to add a wall.
- `WallGrid.tsx` — Positions all `GridSlot`s absolutely inside a `relative` container sized `wallW*scale × wallH*scale`. Renders `NicheOverlay` if niche present. Marks `fullyInside` slots as hidden and `partialNiche` slots as `isNicheCut`.
- `GridSlot.tsx` — Drop target + drag source + in-slot drag source. Three drag systems converge here. See `ui-interactions.md`. Adds `wall-slot-placed` global class for hover-controls selector.
- `TileImage.tsx` — The oversized-image-with-negative-offset technique. Transform-origin is the **center of the visible crop region**, not the image center. See `ui-interactions.md`.
- `PlacementControls.tsx` — Hover overlay with rotate (`↻`) and remove (`×`) buttons.
- `NicheOverlay.tsx` — Blue dashed rect at niche position. Renders the placed back-surface tile inside it.
- `RemainderControls.tsx` — Horizontal/Vertical remainder-mode toggles.

### `NicheSurfaces/`

- `NicheSurfaces.tsx` — In independent mode: 5 droppable `SurfaceGrid`s. In wrap-around mode: 1 droppable `SurfaceGrid` for back + read-only list of auto-populated lip tiles.
- `SurfaceGrid.tsx` — Mini wall grid for a single niche surface. `SlotCell` (subcomponent) does HTML5 drag + in-slot mouse drag + rotate/remove controls. `surfaceScale = min(200/surfaceW, 2)`.

### `Settings/SettingsPanel.tsx`
Width/height inputs, Has-niche checkbox, niche fields (width/height/depth/fromFloor/fromLeft), Center button, Delete Wall button (with confirm).

### `CutSheet/`
- `CutSheet.tsx` — `display: none` on screen, `display: block` on print. Iterates `collectCutSheetData(pieces, walls)`.
- `CutTileSection.tsx` — Per-tile SVG overlay showing cut lines on the tile image.

### `CascadeModal/CascadeModal.tsx`
Backdrop + modal reading `cascadePreview` from the store. Renders list of affected descendants with `wallName · slot (row,col)` or `wallName · niche back (0,0)`. Two buttons: Cancel / Confirm & Remove.

### `Toast/ToastContainer.tsx`
Fixed-position list bound to `state.toasts`. Toasts auto-dismiss in `showToast` via `setTimeout(() => removeToast(id), 3000)`.

## Data flow diagrams

### Place a tile (pool → slot)

```
PoolTile onDragStart: dataTransfer = {source: 'pool', tileId}
                    → setDragImage(canvas)
GridSlot onDrop: parse DragData
              → store.placeTile(wallId, slotKey, pieceId)
                   1. cascadeDelete(existing)       (if slot occupied)
                   2. cascadeDelete(pieceId)        (stale offcuts of this piece)
                   3. findValidOffset()             (avoid cutouts for L/C/frame)
                   4. wall.tiles[slotKey] = {pieceId, rotation: 0, offsetX, offsetY}
                   5. createOffcuts()               (register new child pieces)
                   6. _applyWrapAround()
                   7. _save()
React re-renders via Zustand subscription.
```

### Rotate

```
PlacementControls onClick ↻: store.rotatePlacement(wallId, slotKey)
  1. find next valid rotation (eff.w >= slot.w, eff.h >= slot.h)
  2. check for placed descendants
  3. if any → showCascadePreview(ids, descendants, applyRotate, hideCascadePreview)
             CascadeModal renders; affected slots get .pulseHighlight
             on Confirm → applyRotate()
     else → applyRotate() immediately
  4. applyRotate: cascadeDelete → update placement → createOffcuts → wrap → save
```

### In-slot drag (reposition)

```
User mousedown on TileImage (only if effW > slotW OR effH > slotH):
  GridSlot.handleImageMouseDown:
    preventDefault → intercept HTML5 drag
    record initial {mouseX, mouseY, offsetX, offsetY}
    install document mousemove + mouseup
    mousemove: compute target = init + (delta / scale)
               findValidOffset → setDraftOffset{X,Y}
               TileImage re-renders with draft offsets (via props)
    mouseup:   setOffsets(wallId, slotKey, finalX, finalY) — may trigger cascade
```

### Cascade

```
cascadeDelete(pieces, walls, pieceId):
  descendants = getAllDescendants(pieces, pieceId)
  for each descId:
    loc = getPiecePlacement(walls, descId)   // {wall, key, surface?}
    if loc: delete from newWalls[...].tiles or .nicheTiles[surface]
    delete newPieces[descId]
    push RemovedPlacement
  return { removedPlacements, pieces, walls }

Caller emits showToast() per removedPlacement.
```

## Persistence

- **localStorage key**: `tile-planner-state` (exported as `STORAGE_KEY` from `constants.ts`).
- **What's persisted**: `orientation, nicheMode, activeWallId, pieces, walls, sidebarWidth`. **Not** persisted: `toasts`, `cascadePreview`.
- **JSON export**: `tile-layout.json` (same shape + `toasts: []`).
- **Migration** (`migrateState`):
  - Old format: placements were `{tileId: number}` or `{pieceId, rotation, anchor}`.
  - New format: `{pieceId, rotation, offsetX, offsetY}`.
  - Migration only runs when `pieces` is empty (first load of old state).
- **Validation** (`validateState`): silently drops duplicate placements (same piece in multiple slots) and console-warns.

## Key constants (`src/constants.ts`)

```ts
TILE_COUNT  = 18;
TILE_W      = 60;     // cm, portrait width
TILE_H      = 120;    // cm, portrait height
GROUT       = 0.2;    // cm (2mm)
STORAGE_KEY = 'tile-planner-state';
```

Default walls:

```ts
DEFAULT_WALLS = [
  { id: 'wall-1', name: 'Wall 1', width:  75, height: 267, niche: null, remainderH: 'split', remainderV: 'bottom' },
  { id: 'wall-2', name: 'Wall 2', width: 179, height: 267, niche: null, remainderH: 'split', remainderV: 'bottom' },
  { id: 'wall-3', name: 'Wall 3', width:  95, height: 267,
    niche: { width: 45, height: 45, depth: 15, fromFloor: 125, fromLeft: 25 },
    remainderH: 'split', remainderV: 'bottom',
    nicheTiles: { back: {}, left: {}, right: {}, top: {}, bottom: {} } },
];
```

(The store deep-clones `DEFAULT_WALLS` via `JSON.parse(JSON.stringify(...))` to avoid accidental shared mutation.)

## Build / dev commands

```bash
cd ~/projects/tile-planner-react
npm install          # first time
npm run dev          # vite — http://localhost:5173
npm run build        # tsc -b && vite build  — outputs to dist/
npm run preview      # preview the built app
npm run lint         # eslint
```

TypeScript is strict mode. `npm run build` will fail on any type error.

Tile images must be present at `public/tiles/1.jpg` … `18.jpg` — they're served directly at `/tiles/N.jpg` (root, not under `/public`).

See `deployment.md` for deploy details, `offcut-geometry.md` for the shape math, `ui-interactions.md` for DnD internals, `debugging.md` for gotchas and testing.
