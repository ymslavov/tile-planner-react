import type {
  Wall,
  Piece,
  Placement,
  NicheSurfaceKey,
  Orientation,
} from '../store/types';
import { computeGrid, computeNicheOverlap } from './gridEngine';
import { getEffectiveDims } from './pieceHelpers';

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
}

/**
 * Build a flat element list: every placed piece gets a sequential element
 * number in walking order (wall by wall, then niche surfaces).
 */
export function buildElementList(
  walls: Wall[],
  pieces: Record<string, Piece>
): ElementEntry[] {
  const result: ElementEntry[] = [];
  let num = 1;

  for (const wall of walls) {
    // Wall-face placements
    for (const [slotKey, placement] of Object.entries(wall.tiles)) {
      const piece = pieces[placement.pieceId];
      if (!piece) continue;
      result.push({
        num: num++,
        pieceId: placement.pieceId,
        piece,
        wall,
        surface: null,
        slotKey,
        placement,
      });
    }

    // Niche surface placements (skip auto-wrap pieces — they're computed)
    if (wall.nicheTiles) {
      const surfaces: NicheSurfaceKey[] = ['back', 'left', 'right', 'top', 'bottom'];
      for (const surface of surfaces) {
        const tiles = wall.nicheTiles[surface] || {};
        for (const [slotKey, placement] of Object.entries(tiles)) {
          const piece = pieces[placement.pieceId];
          if (!piece) continue;
          result.push({
            num: num++,
            pieceId: placement.pieceId,
            piece,
            wall,
            surface,
            slotKey,
            placement,
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
 * Compute centroid in original-tile-image coords for a child piece (used for
 * positioning element-number labels on the cut sheet's tile image).
 */
export function pieceCentroidInTile(
  piece: Piece
): { x: number; y: number } {
  const ir = piece.imageRegion;
  // For shaped pieces (with cutouts), the centroid is approximate — use the
  // bounding-box center, then nudge away from any cutout. For simple rect,
  // bbox center works fine.
  const cx = ir.x + ir.w / 2;
  const cy = ir.y + ir.h / 2;

  // If there's a cutout that contains the centroid, shift toward the largest
  // non-cutout sub-rectangle.
  for (const c of piece.geometry.cutouts) {
    const cuLeft = ir.x + c.x;
    const cuTop = ir.y + c.y;
    const cuRight = cuLeft + c.w;
    const cuBottom = cuTop + c.h;
    if (cx >= cuLeft && cx <= cuRight && cy >= cuTop && cy <= cuBottom) {
      // Centroid is inside the cutout — pick a quadrant of the bounding box
      // that's outside the cutout. Try right-of-cutout, then below.
      if (ir.x + ir.w - cuRight > cuLeft - ir.x) {
        // more space to the right
        return { x: (cuRight + ir.x + ir.w) / 2, y: cy };
      } else if (cuLeft - ir.x > 0.01) {
        return { x: (ir.x + cuLeft) / 2, y: cy };
      } else if (ir.y + ir.h - cuBottom > cuTop - ir.y) {
        return { x: cx, y: (cuBottom + ir.y + ir.h) / 2 };
      } else {
        return { x: cx, y: (ir.y + cuTop) / 2 };
      }
    }
  }
  return { x: cx, y: cy };
}

/**
 * Get effective dimensions for an element (post-rotation).
 */
export function elementEffectiveDims(e: ElementEntry): { w: number; h: number } {
  return getEffectiveDims(e.piece, e.placement.rotation || 0);
}
