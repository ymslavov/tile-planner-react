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
import { computeOffcutImageRegion } from './offcutEngine';

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
 * Sub-rect of the SOURCE TILE that's actually shown in the slot for this
 * placement. The renderer rotates around the piece center, so for rot=180
 * the visible source pixels are the *mirror* (about the piece center) of
 * what's visible at rot=0 — not the same source pixels. Using the engine's
 * piece-local-rotated → source mapping keeps cut sheet, gray-out mask, and
 * cutline outlines aligned with what the worker actually sees.
 *
 * Returns null when the slot doesn't overlap the piece at all (defensive;
 * shouldn't happen for actual placements).
 */
export function visibleSourceRectForPlacement(
  piece: Piece,
  placement: Placement,
  slotW: number,
  slotH: number
): { x: number; y: number; w: number; h: number } | null {
  const offX = placement.offsetX ?? 0;
  const offY = placement.offsetY ?? 0;
  const rotation = placement.rotation || 0;
  const eff = getEffectiveDims(piece, rotation);
  // Visible region in piece-local-ROTATED frame (where the rotated piece's
  // TL is at (0,0) and dims are eff.w × eff.h).
  const vxL = Math.max(0, -offX);
  const vyT = Math.max(0, -offY);
  const vxR = Math.min(eff.w, slotW - offX);
  const vyB = Math.min(eff.h, slotH - offY);
  if (vxR <= vxL || vyB <= vyT) return null;
  return computeOffcutImageRegion(
    piece,
    rotation,
    vxL,
    vyT,
    vxR - vxL,
    vyB - vyT
  );
}

/**
 * Compute the centroid (in source-tile-image coords) of the part of a placed
 * piece that's actually visible in its slot. When a piece is placed in a slot
 * smaller than the piece itself, only a sub-rectangle of the piece is used;
 * the leader-line dot must point to that sub-rectangle, not the piece's
 * full bounding box, so nested offcuts don't all cluster at the same dot.
 */
export function placedPieceCentroidInTile(
  piece: Piece,
  placement: Placement,
  slotW: number,
  slotH: number
): { x: number; y: number } {
  const ir = piece.imageRegion;
  const rect = visibleSourceRectForPlacement(piece, placement, slotW, slotH);
  if (!rect) {
    return { x: ir.x + ir.w / 2, y: ir.y + ir.h / 2 };
  }
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/**
 * Get effective dimensions for an element (post-rotation).
 */
export function elementEffectiveDims(e: ElementEntry): { w: number; h: number } {
  return getEffectiveDims(e.piece, e.placement.rotation || 0);
}
