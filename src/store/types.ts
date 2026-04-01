// ── Core Data Types ──────────────────────────────────────────────────────

export type Orientation = 'portrait' | 'landscape';
export type NicheMode = 'wrap-around' | 'independent';
export type RemainderMode = 'left' | 'right' | 'split' | 'top' | 'bottom';
export type AnchorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface Cutout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Piece {
  id: string;
  sourceTileId: number;
  parentId: string | null;
  width: number;
  height: number;
  geometry: {
    boundingBox: { w: number; h: number };
    cutouts: Cutout[];
  };
  imageRegion: ImageRegion;
  autoWrap?: boolean;
}

export interface Niche {
  width: number;
  height: number;
  depth: number;
  fromFloor: number;
  fromLeft: number;
}

export interface Placement {
  pieceId: string;
  rotation: number;
  anchor: AnchorPosition;
  autoWrap?: boolean;
}

export type NicheTiles = {
  back: Record<string, Placement>;
  left: Record<string, Placement>;
  right: Record<string, Placement>;
  top: Record<string, Placement>;
  bottom: Record<string, Placement>;
};

export type NicheSurfaceKey = keyof NicheTiles;

export interface Wall {
  id: string;
  name: string;
  width: number;
  height: number;
  niche: Niche | null;
  remainderH: 'left' | 'right' | 'split';
  remainderV: 'top' | 'bottom' | 'split';
  tiles: Record<string, Placement>;
  nicheTiles?: NicheTiles;
}

// ── Grid Types ──────────────────────────────────────────────────────────

export interface GridSlot {
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
  isPartialW: boolean;
  isPartialH: boolean;
}

export interface GridResult {
  totalRows: number;
  totalCols: number;
  colWidths: number[];
  rowHeights: number[];
  slots: GridSlot[];
  tw: number;
  th: number;
}

export interface NicheRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface AffectedSlot extends GridSlot {
  nicheOverlap: { left: number; top: number; right: number; bottom: number };
  fullyInside: boolean;
}

export interface NicheOverlapResult {
  affectedSlots: AffectedSlot[];
  nicheRect: NicheRect | null;
}

// ── Store Types ─────────────────────────────────────────────────────────

export interface TilePlannerState {
  orientation: Orientation;
  nicheMode: NicheMode;
  activeWallId: string;
  pieces: Record<string, Piece>;
  walls: Wall[];
  toasts: Toast[];
}

export interface Toast {
  id: string;
  message: string;
}

export interface RemovedPlacement {
  pieceId: string;
  wallName: string;
  surface: string | null;
}

// ── Drag and Drop Types ─────────────────────────────────────────────────

export interface PoolDragData {
  source: 'pool';
  tileId: string;
}

export interface WallDragData {
  source: 'wall';
  key: string;
}

export interface NicheDragData {
  source: 'niche';
  surfaceKey: NicheSurfaceKey;
  key: string;
}

export type DragData = PoolDragData | WallDragData | NicheDragData;

// ── Cut Sheet Types ─────────────────────────────────────────────────────

export interface CutPiece {
  label: string;
  width: number;
  height: number;
  placement: string;
  cutDesc: string;
  centerX: number;
  centerY: number;
}

export interface TileCut {
  type: 'horizontal' | 'vertical';
  positionCm: number;
}

export interface CutEntry {
  tileId: string;
  wallId: string;
  wallName: string;
  pieces: CutPiece[];
  tileCuts: TileCut[];
  waste: number;
}
