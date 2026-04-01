# Tile Planner React — Implementation Plan

## Task 1: Project Setup + Types + Store

**Files:**
- `src/store/types.ts` — all TypeScript interfaces
- `src/store/index.ts` — Zustand store with all actions
- `src/constants.ts` — TILE_COUNT, GROUT, DEFAULT_STATE

## Task 2: Service Layer

**Files:**
- `src/services/gridEngine.ts` — computeSizes, computeGrid, computeNicheOverlap
- `src/services/offcutEngine.ts` — generateOffcutId, computeOffcutImageRegion, createOffcuts, cascadeDelete, getValidAnchors
- `src/services/pieceHelpers.ts` — getEffectiveDims, getChildPieces, getAllDescendants, etc.
- `src/services/persistence.ts` — localStorage, JSON export/import, migration
- `src/services/wrapAroundNiche.ts` — computeWrapAroundNicheTiles
- `src/services/cutSheetEngine.ts` — computeAllCuts, collectDescendants

## Task 3: Layout Shell + TopBar

**Files:**
- `src/App.tsx` — main layout (left/center/right panels)
- `src/components/TopBar/TopBar.tsx` — toolbar with all controls
- `src/styles/index.css` — global styles, CSS variables, print styles

## Task 4: Tile Pool

**Files:**
- `src/components/TilePool/TilePool.tsx` — pool container + pool drop target
- `src/components/TilePool/PoolTile.tsx` — individual tile thumbnail
- `src/components/TilePool/OffcutRow.tsx` — offcut tree rows

## Task 5: Wall View

**Files:**
- `src/components/WallView/WallTabs.tsx` — wall tab bar
- `src/components/WallView/WallView.tsx` — wall container with scaling
- `src/components/WallView/WallGrid.tsx` — grid slot rendering
- `src/components/WallView/GridSlot.tsx` — individual slot with DnD
- `src/components/WallView/TileImage.tsx` — image rendering with rotation
- `src/components/WallView/PlacementControls.tsx` — rotate + anchor buttons
- `src/components/WallView/NicheOverlay.tsx` — dashed niche rectangle

## Task 6: Niche Surfaces + Remainder Controls

**Files:**
- `src/components/NicheSurfaces/NicheSurfaces.tsx` — niche surface container
- `src/components/NicheSurfaces/SurfaceGrid.tsx` — mini wall grid for niche surface
- `src/components/WallView/RemainderControls.tsx` — H/V distribution buttons

## Task 7: Settings Panel

**Files:**
- `src/components/Settings/SettingsPanel.tsx` — wall dimensions, niche config, delete wall

## Task 8: Cut Sheet + Toast

**Files:**
- `src/components/CutSheet/CutSheet.tsx` — print view container
- `src/components/CutSheet/CutTileSection.tsx` — per-tile cut chain view
- `src/components/Toast/ToastContainer.tsx` — toast notifications

## Task 9: Integration + Polish

- Wire up localStorage persistence
- ResizeObserver for wall scaling
- Print CSS
- Final testing
