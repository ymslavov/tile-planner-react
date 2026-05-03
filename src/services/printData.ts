import type {
  Wall,
  Piece,
  Placement,
  NicheSurfaceKey,
  Orientation,
} from '../store/types';
import { computeGrid, computeNicheOverlap } from './gridEngine';
import { getEffectiveDims, getPlacedPieceIds } from './pieceHelpers';
import { getDisplayPieceId } from './displayId';

/**
 * Element list for the cut sheet — every placed piece across all walls and
 * niches gets a sequential number (1, 2, 3, ...). The number is shown on the
 * preview pages and referenced in the per-tile cut chain.
 */
export interface ElementEntry {
  num: number;
  pieceId: string;
  piece: Piece;
  wall: Wall;
  surface: NicheSurfaceKey | null;
  slotKey: string;
  placement: Placement;
  slotW: number;
  slotH: number;
  // Slot's top-left in wall (or niche surface) coords. Used to report each
  // placed piece's actual position on the wall ("X cm from left, Y from top").
  slotX: number;
  slotY: number;
  // Visual label — defaults to pieceId. Equals "${pieceId}-A" when the root
  // of a tile chain is placed AND has placed descendants (see displayId.ts).
  displayId: string;
}

/**
 * Build a flat element list: every placed piece gets a sequential element
 * number in walking order (wall by wall, then niche surfaces).
 */
export function buildElementList(
  walls: Wall[],
  pieces: Record<string, Piece>,
  orientation: Orientation
): ElementEntry[] {
  const result: ElementEntry[] = [];
  let num = 1;
  const placedIds = getPlacedPieceIds(walls);

  for (const wall of walls) {
    const wallGrid = computeGrid(wall, orientation);

    // Wall-face placements
    for (const [slotKey, placement] of Object.entries(wall.tiles)) {
      const piece = pieces[placement.pieceId];
      if (!piece) continue;
      const [r, c] = slotKey.split(',').map(Number);
      const slot = wallGrid.slots.find((s) => s.row === r && s.col === c);
      if (!slot) continue;
      result.push({
        num: num++,
        pieceId: placement.pieceId,
        piece,
        wall,
        surface: null,
        slotKey,
        placement,
        slotW: slot.w,
        slotH: slot.h,
        slotX: slot.x,
        slotY: slot.y,
        displayId: getDisplayPieceId(piece, pieces, placedIds),
      });
    }

    // Niche surface placements
    if (wall.nicheTiles && wall.niche) {
      const surfaceDims: Record<NicheSurfaceKey, { w: number; h: number }> = {
        back: { w: wall.niche.width, h: wall.niche.height },
        left: { w: wall.niche.depth, h: wall.niche.height },
        right: { w: wall.niche.depth, h: wall.niche.height },
        top: { w: wall.niche.width, h: wall.niche.depth },
        bottom: { w: wall.niche.width, h: wall.niche.depth },
      };
      const surfaces: NicheSurfaceKey[] = ['back', 'left', 'right', 'top', 'bottom'];
      for (const surface of surfaces) {
        const tiles = wall.nicheTiles[surface] || {};
        const dims = surfaceDims[surface];
        const surfaceGrid = computeGrid(
          { width: dims.w, height: dims.h, remainderH: 'split', remainderV: 'split' },
          orientation
        );
        for (const [slotKey, placement] of Object.entries(tiles)) {
          const piece = pieces[placement.pieceId];
          if (!piece) continue;
          const [r, c] = slotKey.split(',').map(Number);
          const slot = surfaceGrid.slots.find((s) => s.row === r && s.col === c);
          if (!slot) continue;
          result.push({
            num: num++,
            pieceId: placement.pieceId,
            piece,
            wall,
            surface,
            slotKey,
            placement,
            slotW: slot.w,
            slotH: slot.h,
            slotX: slot.x,
            slotY: slot.y,
            displayId: getDisplayPieceId(piece, pieces, placedIds),
          });
        }
      }
    }
  }

  return result;
}

/**
 * Compute the visual position of each placed wall-face piece (for rendering
 * the wall preview). Returns absolute slot rectangles in cm wall-coords.
 */
export interface WallPlacementBox {
  num: number;
  piece: Piece;
  placement: Placement;
  displayId: string;
  // wall-local coords in cm
  x: number;
  y: number;
  w: number;
  h: number;
  // niche-related
  isNicheCut: boolean;
}

export function computeWallPlacements(
  wall: Wall,
  elements: ElementEntry[],
  orientation: Orientation
): { boxes: WallPlacementBox[]; nicheRect: { x: number; y: number; w: number; h: number } | null } {
  const grid = computeGrid(wall, orientation);
  const overlap = computeNicheOverlap(wall, grid);
  const partialNicheKeys = new Set(
    overlap.affectedSlots.filter((s) => !s.fullyInside).map((s) => `${s.row},${s.col}`)
  );

  const boxes: WallPlacementBox[] = [];
  for (const e of elements) {
    if (e.wall.id !== wall.id || e.surface !== null) continue;
    const [r, c] = e.slotKey.split(',').map(Number);
    const slot = grid.slots.find((s) => s.row === r && s.col === c);
    if (!slot) continue;
    boxes.push({
      num: e.num,
      piece: e.piece,
      placement: e.placement,
      displayId: e.displayId,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      isNicheCut: partialNicheKeys.has(e.slotKey),
    });
  }

  const nicheRect = overlap.nicheRect
    ? {
        x: overlap.nicheRect.left,
        y: overlap.nicheRect.top,
        w: overlap.nicheRect.width,
        h: overlap.nicheRect.height,
      }
    : null;

  return { boxes, nicheRect };
}

/**
 * Compute the centroid (in original-tile-image coords) of the part of a placed
 * piece that's actually visible in its slot. When a piece is placed in a slot
 * smaller than the piece itself, only a sub-rectangle of the piece is used;
 * the leader-line dot must point to that sub-rectangle, not the piece's
 * full bounding box, so nested offcuts don't all cluster at the same dot.
 *
 * Rotation handling: only rotation 0 is treated explicitly. For other
 * rotations the formula falls back to the unrotated rectangle, which is a
 * reasonable visual approximation for marble tiles.
 */
export function placedPieceCentroidInTile(
  piece: Piece,
  placement: Placement,
  slotW: number,
  slotH: number
): { x: number; y: number } {
  const ir = piece.imageRegion;
  const offX = placement.offsetX ?? 0;
  const offY = placement.offsetY ?? 0;

  const usedLeft = Math.max(0, -offX);
  const usedTop = Math.max(0, -offY);
  const usedRight = Math.min(piece.width, slotW - offX);
  const usedBottom = Math.min(piece.height, slotH - offY);

  if (usedRight <= usedLeft || usedBottom <= usedTop) {
    return { x: ir.x + ir.w / 2, y: ir.y + ir.h / 2 };
  }

  return {
    x: ir.x + (usedLeft + usedRight) / 2,
    y: ir.y + (usedTop + usedBottom) / 2,
  };
}

/**
 * Get effective dimensions for an element (post-rotation).
 */
export function elementEffectiveDims(e: ElementEntry): { w: number; h: number } {
  return getEffectiveDims(e.piece, e.placement.rotation || 0);
}
