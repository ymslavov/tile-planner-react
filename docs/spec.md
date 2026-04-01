# Tile Planner React — Specification

## Overview

A React + TypeScript rewrite of the vanilla JS tile planner for planning the layout of 18 marble tiles (60x120cm) across multiple bathroom walls. The app supports drag-and-drop tile placement, an offcut tracking system, per-placement rotation and anchor snapping, niche support, and a printable cut sheet.

## Tech Stack

- **Vite** — build tool
- **React 19** + **TypeScript** — UI framework
- **Zustand** — state management (single store with action methods)
- **CSS Modules** — scoped component styling
- **HTML5 Drag and Drop API** — tile placement interactions

## Architecture

### State Management (Zustand)

Single store with the following shape:

```typescript
interface TilePlannerState {
  orientation: 'portrait' | 'landscape';
  nicheMode: 'wrap-around' | 'independent';
  activeWallId: string;
  pieces: Record<string, Piece>;
  walls: Wall[];
}
```

Store actions handle all mutations: placing tiles, rotating, changing anchors, cascade deleting, etc. Components subscribe to slices of state they need.

### Data Model

**Piece** — every physical piece (original tile or offcut):
```typescript
interface Piece {
  id: string;              // "5", "5-B", "5-B1", "5-B1a"
  sourceTileId: number;    // 1-18, for image lookup
  parentId: string | null; // null for originals
  width: number;           // natural dimensions in cm
  height: number;
  geometry: {
    boundingBox: { w: number; h: number };
    cutouts: Cutout[];     // empty for rectangles
  };
  imageRegion: { x: number; y: number; w: number; h: number };
  autoWrap?: boolean;      // true for auto-placed lip pieces
}
```

**Wall**:
```typescript
interface Wall {
  id: string;
  name: string;
  width: number;          // cm
  height: number;         // cm
  niche: Niche | null;
  remainderH: 'left' | 'right' | 'split';
  remainderV: 'top' | 'bottom' | 'split';
  tiles: Record<string, Placement>;
  nicheTiles?: NicheTiles;
}
```

**Placement**:
```typescript
interface Placement {
  pieceId: string;
  rotation: number;       // 0, 90, 180, 270
  anchor: AnchorPosition; // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  autoWrap?: boolean;
}
```

### Service Layer (Pure Functions)

All heavy computation lives in service files — no DOM manipulation, no React dependencies:

1. **gridEngine.ts** — `computeSizes()`, `computeGrid()`, `computeNicheOverlap()`
2. **offcutEngine.ts** — `generateOffcutId()`, `computeOffcutImageRegion()`, `createOffcuts()`, `cascadeDelete()`, `getValidAnchors()`
3. **pieceHelpers.ts** — `getEffectiveDims()`, `getChildPieces()`, `getAllDescendants()`, `getPiecePlacement()`, `getPlacedPieceIds()`, `getUnplacedPieceIds()`, `initPieces()`
4. **persistence.ts** — `saveState()`, `loadState()`, `migrateState()`, `validateState()`, `exportJSON()`, `importJSON()`
5. **wrapAroundNiche.ts** — `computeWrapAroundNicheTiles()`
6. **cutSheetEngine.ts** — `computeAllCuts()`, `collectDescendants()`

### Component Architecture

```
App
├── TopBar
│   ├── OrientationToggle
│   ├── NicheModeToggle
│   └── ActionButtons (Save, Load, Print, Clear)
├── MainLayout
│   ├── TilePool (left panel, 140px)
│   │   ├── PoolTile (×18)
│   │   └── OffcutRow (nested tree)
│   ├── CenterPanel (flex: 1)
│   │   ├── WallTabs
│   │   ├── WallView (scaled wall grid)
│   │   │   ├── GridSlot (×N)
│   │   │   │   ├── TileImage
│   │   │   │   └── PlacementControls
│   │   │   └── NicheOverlay
│   │   ├── ScaleIndicator
│   │   ├── RemainderControls
│   │   └── NicheSurfaces
│   │       └── SurfaceGrid
│   └── SettingsPanel (right panel, 200px)
│       ├── WallDimensions
│       ├── NicheSettings
│       └── DeleteWall
├── CutSheet (print only)
│   └── CutTileSection (×N)
└── ToastContainer
```

## Features

### Core Features
1. **18 tile pool** — 2-column grid with thumbnail images, placed tiles dimmed
2. **Multi-wall support** — tabbed interface, add/delete walls
3. **Grid computation** — tiles + grout (2mm) with remainder distribution (split/left/right/top/bottom)
4. **Drag and drop** — pool-to-wall, wall-to-wall (swap), wall-to-pool (unplace)
5. **Orientation toggle** — portrait (60×120) or landscape (120×60), clears all placements

### Offcut System
6. **Piece registry** — flat map tracking all pieces with parent-child relationships
7. **Automatic offcut creation** — 1 offcut (single axis overhang), 3 offcuts (both axes)
8. **Hierarchical naming** — "5" → "5-B", "5-C" | "5-B" → "5-B1" | "5-B1" → "5-B1a"
9. **Image region tracking** — each offcut knows its region in the source tile image
10. **Cascading invalidation** — removing/rotating a parent deletes all descendant offcuts
11. **Cross-wall cascade toasts** — notifications when pieces on other walls are affected

### Per-Placement Controls
12. **Rotation** — 0°/90°/180°/270° per placement, only valid rotations offered
13. **Anchor snapping** — top-left/top-right/bottom-left/bottom-right based on overhang
14. **Inline offcuts in pool** — tree view showing offcut hierarchy below parent tiles

### Niche Support
15. **Niche overlay** — dashed blue rectangle on wall grid
16. **Wrap-around mode** — lip surfaces auto-populated from wall cuts
17. **Independent mode** — all 5 surfaces tiled independently
18. **Niche surface grids** — mini wall grids for each niche surface

### Output
19. **Cut sheet** — printable view grouped by source tile, SVG cut line overlays
20. **JSON export/import** — full state serialization
21. **localStorage persistence** — auto-save on every change

### Wall Configuration
22. **Wall dimensions** — width/height inputs
23. **Niche configuration** — width, height, depth, fromFloor, fromLeft with center button
24. **Remainder distribution** — horizontal and vertical toggle buttons

## Default State

Three walls:
- Wall 1: 75×267cm, no niche
- Wall 2: 179×267cm, no niche
- Wall 3: 95×267cm, niche (45×45×15cm, centered, 125cm from floor)

## Key Implementation Details

### Grid Calculation
- Grout: 0.2cm (2mm)
- `fullCount = floor(wallDim / (tileDim + grout))`
- Split mode: `fullCount + 2` columns with half-remainder on each side
- Niche overlap: top-down coordinate system, `nicheTop = wallHeight - fromFloor - nicheHeight`

### Image Rendering
- Source images are portrait (60×120cm ratio)
- Oversized image with negative offsets inside overflow:hidden slot
- Rotation: transform-origin at center of visible crop region
- Formula: `originX = (ir.x + slot.w/2) * scale`, `originY = (ir.y + slot.h/2) * scale`

### Offcut Image Region
- Maps parent's rotated coordinate space back to source tile's image space
- Handles 0°/90°/180°/270° coordinate transforms
- Each offcut, no matter how deep, references the original tile image

### Scaling
- `scale = min(availableWidth / wallWidth, availableHeight / wallHeight)`
- Wall fits viewport in both dimensions
