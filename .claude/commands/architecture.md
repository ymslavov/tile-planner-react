# Tile Planner React — Architecture & Implementation Guide

## Overview

The tile planner is a **React + TypeScript + Vite** app for planning the layout of 18 marble tiles (60cm × 120cm each) across multiple bathroom walls. It features drag-and-drop tile placement, an offcut tracking system, per-placement rotation and anchor snapping, niche support, and a printable cut sheet.

**Tech stack:** React 19, TypeScript, Vite, Zustand (state management), CSS Modules. No other runtime dependencies.

## Project Structure

```
tile-planner-react/
├── public/
│   └── tiles/                    # 1.jpg - 18.jpg (marble tile images)
├── src/
│   ├── main.tsx                  # Entry point, renders <App />
│   ├── App.tsx                   # Root layout: TopBar + 3-panel flex layout
│   ├── constants.ts              # TILE_W, TILE_H, GROUT, TILE_COUNT, default walls
│   ├── store/
│   │   ├── types.ts              # All TypeScript interfaces and type aliases
│   │   └── index.ts              # Zustand store with all state + actions
│   ├── services/
│   │   ├── gridEngine.ts         # Grid calculation (pure math, no React)
│   │   ├── offcutEngine.ts       # Offcut creation, cascade delete, image region
│   │   ├── pieceHelpers.ts       # Piece registry utilities
│   │   ├── persistence.ts        # localStorage + JSON export/import + migration
│   │   ├── wrapAroundNiche.ts    # Auto-populate niche lip surfaces
│   │   └── cutSheetEngine.ts     # Cut sheet data collection
│   ├── components/
│   │   ├── TopBar/
│   │   │   └── TopBar.tsx        # Title, toggles, save/load/print/clear buttons
│   │   ├── TilePool/
│   │   │   ├── TilePool.tsx      # Left panel: 2-column grid + offcut tree
│   │   │   ├── PoolTile.tsx      # Single tile thumbnail (draggable)
│   │   │   └── OffcutRow.tsx     # Inline offcut row below parent tile
│   │   ├── WallView/
│   │   │   ├── WallView.tsx      # Center panel orchestrator
│   │   │   ├── WallTabs.tsx      # Wall tab bar with add button
│   │   │   ├── WallGrid.tsx      # Scaled wall container with slots
│   │   │   ├── GridSlot.tsx      # Single grid slot (drop target)
│   │   │   ├── TileImage.tsx     # Tile image with rotation + crop
│   │   │   ├── PlacementControls.tsx  # Rotate + anchor buttons overlay
│   │   │   ├── NicheOverlay.tsx  # Blue dashed niche rectangle
│   │   │   └── RemainderControls.tsx  # H/V remainder toggle buttons
│   │   ├── NicheSurfaces/
│   │   │   ├── NicheSurfaces.tsx # Niche surface grids container
│   │   │   └── SurfaceGrid.tsx   # Single niche surface mini-grid
│   │   ├── Settings/
│   │   │   └── SettingsPanel.tsx  # Right panel: wall dims, niche config, delete
│   │   ├── CutSheet/
│   │   │   ├── CutSheet.tsx      # Print view container
│   │   │   └── CutTileSection.tsx # Per-tile cut chain with SVG overlay
│   │   └── Toast/
│   │       └── ToastContainer.tsx # Fixed-position toast notifications
│   └── styles/
│       └── index.css             # Global styles, print media queries
├── docs/
│   ├── spec.md                   # Design specification
│   └── plan.md                   # Implementation plan
└── package.json
```

## Type System (`src/store/types.ts`)

All data types are defined in one file:

```typescript
type Orientation = 'portrait' | 'landscape'
type NicheMode = 'wrap-around' | 'independent'
type RemainderMode = 'left' | 'right' | 'split' | 'top' | 'bottom'
type AnchorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

interface Piece {
  id: string                    // "5", "5-B", "5-B1a"
  sourceTileId: number          // which tile image to load (1-18)
  parentId: string | null       // null for originals
  width: number                 // natural dimensions in cm
  height: number
  geometry: {
    boundingBox: { w: number; h: number }
    cutouts: Cutout[]           // empty=rect, entries=L/C-shape
  }
  imageRegion: ImageRegion      // region of source tile image
  autoWrap?: boolean
}

interface Placement {
  pieceId: string
  rotation: number              // 0, 90, 180, 270
  anchor: AnchorPosition
  autoWrap?: boolean
}

interface Wall {
  id: string
  name: string
  width: number                 // cm
  height: number
  niche: Niche | null
  remainderH: 'left' | 'right' | 'split'
  remainderV: 'top' | 'bottom' | 'split'
  tiles: Record<string, Placement>     // keyed by "row,col"
  nicheTiles?: NicheTiles
}

interface AppState {
  orientation: Orientation
  nicheMode: NicheMode
  activeWallId: string
  pieces: Record<string, Piece>
  walls: Wall[]
  toasts: Toast[]
}
```

## Zustand Store (`src/store/index.ts`)

Single store with ~740 lines. All state mutations happen through store actions — components never modify state directly.

### State Shape
```typescript
{
  orientation, nicheMode, activeWallId,
  pieces: Record<string, Piece>,
  walls: Wall[],
  toasts: Toast[]
}
```

### Key Actions

| Action | Purpose |
|--------|---------|
| `setActiveWall(id)` | Switch active wall tab |
| `setOrientation(o)` | Toggle portrait/landscape (clears all placements with confirmation) |
| `setNicheMode(mode)` | Toggle wrap-around/independent |
| `addWall()` | Create new wall with defaults (100×267) |
| `deleteWall(id)` | Remove wall, return tiles to pool |
| `updateWallDimension(id, field, value)` | Change width/height, validates existing placements |
| `toggleNiche(id, enabled)` | Add/remove niche on a wall |
| `updateNiche(id, field, value)` | Change niche dimensions |
| `placeTile(wallId, slotKey, pieceId)` | Place piece in slot, create offcuts |
| `unplaceTile(wallId, slotKey)` | Remove piece, cascade delete children |
| `swapTiles(wallId, fromKey, toKey)` | Swap two tiles on same wall |
| `rotatePlacement(wallId, slotKey)` | Cycle rotation, cascade + recreate offcuts |
| `setAnchor(wallId, slotKey, anchor)` | Change anchor, cascade + recreate offcuts |
| `placeNicheTile(...)` | Place on niche surface |
| `unplaceNicheTile(...)` | Remove from niche surface |
| `clearAll()` | Reset all placements and pieces |
| `showToast(msg)` | Display notification |
| `_save()` | Internal: persist to localStorage |
| `_applyWrapAround()` | Internal: recompute auto-placed lip tiles |

### Internal Flow

Every mutation that changes placements follows this pattern:
1. Cascade-delete affected pieces' descendants
2. Update the placement in `walls`
3. Create new offcuts via `createOffcuts()`
4. Call `_applyWrapAround()` to recompute auto-placed niche lip tiles
5. Call `_save()` to persist to localStorage

## Services (Pure Functions)

All services are pure functions with no React or DOM dependencies. They operate on the data types from `types.ts`.

### `gridEngine.ts` (148 lines)

Grid calculation — determines how tiles fit on a wall.

- **`computeSizes(wallDim, tileDim, grout, mode)`** — computes column widths or row heights. Handles 'left'/'right'/'split' remainder distribution. Split mode produces `fullCount + 2` entries (half-remainder on each side).
- **`computeGrid(wall, orientation)`** — returns `{ totalRows, totalCols, colWidths, rowHeights, slots, tw, th }` where each slot has `{ row, col, x, y, w, h, isPartialW, isPartialH }`.
- **`computeNicheOverlap(wall, grid)`** — intersects slots with the niche rectangle. Returns `{ affectedSlots, nicheRect }` where each affected slot has `fullyInside` flag.

Key math: `fullCount = floor(wallDim / (tileDim + grout))`, `remainder = wallDim - fullCount * (tileDim + grout)`. Grout is 0.2cm (2mm).

### `offcutEngine.ts` (318 lines)

Offcut creation and tracking.

- **`generateOffcutId(parentId, index)`** — hierarchical naming: `"5"→"5-B"`, `"5-B"→"5-B1"`, `"5-B1"→"5-B1a"`.
- **`computeOffcutImageRegion(parent, rotation, ox, oy, ow, oh)`** — maps offcut position in parent's rotated space back to original tile image coordinates. Handles all 4 rotations.
- **`createOffcuts(pieces, pieceId, slotW, slotH, rotation, anchor)`** — the main function. Computes overhangs based on anchor, creates 1-3 rectangular offcut pieces, registers them. Returns updated pieces dict.
- **`cascadeDelete(pieces, walls, pieceId)`** — recursively removes all descendants from pieces dict and their placements from all walls. Returns `{ pieces, walls, removed }`.
- **`getValidAnchors(effectiveDims, slot)`** — returns which anchor positions produce distinct cuts.
- **`canPlacePiece(pieces, pieceId, slotW, slotH)`** — checks all 4 rotations for fit.

### `pieceHelpers.ts` (114 lines)

Piece registry utilities.

- **`getEffectiveDims(piece, rotation)`** — returns `{w, h}` with dimensions swapped for 90°/270°.
- **`getChildPieces(pieces, pieceId)`** — direct children.
- **`getAllDescendants(pieces, pieceId)`** — recursive all descendant IDs.
- **`getPiecePlacement(walls, pieceId)`** — finds which wall/slot/surface a piece is placed in.
- **`getPlacedPieceIds(walls)`** — Map of all placed piece IDs → `{wallId, location}`.
- **`initPieces(orientation)`** — creates the 18 original tile entries.

### `persistence.ts` (188 lines)

State persistence.

- **`saveState(state)`** — serializes to localStorage under key `tile-planner-state`.
- **`loadState()`** — deserializes + migrates old format.
- **`migrateState(state)`** — converts old `{ tileId: N }` placements to `{ pieceId, rotation, anchor }`.
- **`exportJSON(state)`** — downloads state as `.json` file.
- **`importJSON(callback)`** — file picker that reads, migrates, and returns parsed state.

### `wrapAroundNiche.ts` (128 lines)

Wrap-around niche mode logic.

- **`applyWrapAround(walls, pieces, nicheMode, orientation)`** — for each wall with a niche in wrap-around mode, finds wall-face tiles intersecting the niche, looks up their offcuts, and auto-places them on the corresponding lip surfaces. Returns updated `{ walls, pieces }`.

### `cutSheetEngine.ts` (343 lines)

Cut sheet data collection.

- **`collectCutSheetData(pieces, walls)`** — iterates tiles 1-18, collects the full piece tree for each, returns structured data for the CutSheet component.

## Component Architecture

### App.tsx
Root layout — flex row with `TilePool | WallView + NicheSurfaces | SettingsPanel`, `TopBar` above, `CutSheet` hidden (print only), `ToastContainer` fixed.

### TopBar
Orientation toggle (Portrait/Landscape), niche mode toggle (Wrap-around/Independent), Save/Load/Print/Clear buttons. Orientation toggle shows `confirm()` if tiles are placed.

### TilePool
Left panel (140px). Renders 18 original tiles in a 2-column CSS grid. Each `PoolTile` shows the marble thumbnail, tile number badge, and placed/available status. Below each placed tile, `OffcutRow` components render the offcut tree inline with indentation.

Drag source: unplaced tiles and offcuts set `dataTransfer` with `{ source: 'pool', pieceId }`.

Drop target: the pool container accepts tiles dragged from wall slots (unplace + cascade).

### WallView
Center panel. Contains `WallTabs`, the wall grid area, scale indicator, `RemainderControls`, and `NicheSurfaces`.

### WallGrid
Computes the grid via `computeGrid()`, calculates scale as `min(availableWidth/wallWidth, availableHeight/wallHeight)`, then renders `GridSlot` components absolutely positioned within a relatively positioned wall container. Also renders `NicheOverlay` if the wall has a niche.

### GridSlot
A single grid slot — drop target and drag source. Renders `TileImage` if a piece is placed, otherwise shows dashed border. Adds `PlacementControls` overlay on placed tiles.

Handles DnD events: `onDragOver`, `onDrop` (pool→slot placement, slot→slot swap), `onDragStart` (for rearranging).

### TileImage
Renders the marble tile image correctly cropped and rotated within a slot. Uses the oversized-image-with-negative-offset technique:

```
position: absolute
left: -(imageRegion.x * scale)
top: -(imageRegion.y * scale)
width: srcW * scale
height: srcH * scale
```

For rotation, `transform-origin` is set to the center of the **visible crop region**, not the image center:
```
originX = (ir.x + slotW/2) * scale
originY = (ir.y + slotH/2) * scale
transform: rotate(Ndeg)
transform-origin: originX originY
```

This is critical — using `center center` causes the image to fly out of the slot because the image is much larger than the slot.

### PlacementControls
Overlay on placed tiles with:
- **Rotate button (↻)**: cycles valid rotations (skips rotations where piece doesn't fit)
- **Anchor dots**: colored dots at valid snap corners (active = blue, inactive = grey)

Both trigger store actions that cascade-delete children and recreate offcuts.

### NicheSurfaces
Below the wall grid. In **independent mode**: renders 5 `SurfaceGrid` components (back, left, right, top, bottom) as mini wall grids with their own drop targets. In **wrap-around mode**: shows back surface as droppable + lip surfaces as read-only info.

### SettingsPanel
Right panel (200px). Width/height inputs, has-niche checkbox, niche dimension inputs with Center button, Delete Wall button.

### CutSheet
Hidden on screen (`display: none`), shown on print (`@media print`). Groups by source tile (1-18), shows full piece tree with SVG cut line overlays on the tile image and per-piece placement descriptions.

### ToastContainer
Fixed bottom-right. Displays brief notifications for cross-wall cascade deletions. Toasts auto-dismiss after 3 seconds.

## Data Flow

### Placing a Tile
```
User drags PoolTile → GridSlot onDrop fires →
  store.placeTile(wallId, slotKey, pieceId) →
    cascadeDelete old occupant (if any) →
    wall.tiles[key] = { pieceId, rotation: 0, anchor: 'top-left' } →
    createOffcuts() → new pieces registered →
    _applyWrapAround() → _save()
→ React re-renders (Zustand subscription)
```

### Rotating
```
User clicks ↻ in PlacementControls →
  store.rotatePlacement(wallId, slotKey) →
    cascadeDelete all children →
    cycle to next valid rotation →
    createOffcuts() with new rotation →
    _applyWrapAround() → _save()
```

### Cascade Deletion
```
cascadeDelete(pieces, walls, pieceId) →
  getAllDescendants() recursively →
  for each: find placement across all walls, remove it →
  delete from pieces →
  return { pieces, walls, removed } →
  store.showToast() for each cross-wall removal
```

## CSS Architecture

- **CSS Modules**: each component has its own `.module.css` file (scoped class names)
- **Global styles** in `src/styles/index.css`: body reset, print media queries
- **Print CSS**: `@media print` hides `.app-layout`, `.top-bar` etc., shows `.cut-sheet`
- **No CSS framework** — plain CSS with flexbox/grid

## Key Constants (`src/constants.ts`)

```typescript
TILE_W = 60        // cm (portrait width)
TILE_H = 120       // cm (portrait height)
GROUT = 0.2        // cm (2mm)
TILE_COUNT = 18
```

## Persistence

- **localStorage key**: `tile-planner-state`
- **JSON export**: full state object downloaded as `tile-layout.json`
- **Migration**: old vanilla JS format `{ tileId: N }` auto-migrated to `{ pieceId, rotation, anchor }` on load

## Common Modifications

### Adding More Tiles
Update `TILE_COUNT` in `constants.ts`. Add images to `public/tiles/`.

### Changing Tile Dimensions
Update `TILE_W`, `TILE_H` in `constants.ts`. The grid engine and offcut engine read from these.

### Changing Default Walls
Edit the `DEFAULT_WALLS` array in `store/index.ts` (or `constants.ts` if extracted there).

### Adding a New Service
Create a new `.ts` file in `src/services/`. Keep it pure — no React imports, no DOM access. Accept data as parameters, return new data.

### Adding a New Component
Create a new directory in `src/components/` with the component `.tsx` and optional `.module.css`. Keep components under ~200 lines. If a component grows, split it.

## Development

```bash
cd ~/projects/tile-planner-react
npm run dev      # Start dev server (Vite)
npm run build    # Production build
npm run preview  # Preview production build
```

Tile images must be in `public/tiles/` (1.jpg through 18.jpg). Copy from the vanilla project if needed:
```bash
cp ~/projects/tile-planner/tiles/*.jpg public/tiles/
```
