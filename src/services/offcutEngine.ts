import type {
  Piece,
  AnchorPosition,
  Wall,
  RemovedPlacement,
  GridSlot,
} from '../store/types';
// AnchorPosition kept for backward-compat export; no longer used in Placement.
import {
  getEffectiveDims,
  getAllDescendants,
  getPiecePlacement,
} from './pieceHelpers';

/**
 * Generate hierarchical offcut ID.
 * "5" -> "5-B", "5-C" | "5-B" -> "5-B1" | "5-B1" -> "5-B1a"
 */
export function generateOffcutId(parentId: string, index: number): string {
  if (!parentId.includes('-')) {
    return `${parentId}-${String.fromCharCode(66 + index)}`;
  }
  const lastChar = parentId.slice(-1);
  if (lastChar >= 'A' && lastChar <= 'Z') {
    return `${parentId}${index + 1}`;
  } else if (lastChar >= '0' && lastChar <= '9') {
    return `${parentId}${String.fromCharCode(97 + index)}`;
  } else {
    return `${parentId}${index + 1}`;
  }
}

/**
 * Map an offcut's position in the parent's rotated coordinate space
 * back to the original tile image space.
 */
export function computeOffcutImageRegion(
  parent: Piece,
  rotation: number,
  ox: number,
  oy: number,
  ow: number,
  oh: number
): { x: number; y: number; w: number; h: number } {
  const pr = parent.imageRegion;
  if (rotation === 0) {
    return { x: pr.x + ox, y: pr.y + oy, w: ow, h: oh };
  } else if (rotation === 90) {
    return {
      x: pr.x + oy,
      y: pr.y + (parent.width - ox - ow),
      w: oh,
      h: ow,
    };
  } else if (rotation === 180) {
    return {
      x: pr.x + (parent.width - ox - ow),
      y: pr.y + (parent.height - oy - oh),
      w: ow,
      h: oh,
    };
  } else {
    // 270
    return {
      x: pr.x + (parent.height - oy - oh),
      y: pr.y + ox,
      w: oh,
      h: ow,
    };
  }
}

/**
 * Create offcut pieces when a piece is placed in a slot using continuous offsets.
 *
 * offsetX / offsetY: cm offset of piece's top-left from slot's top-left.
 *   - offsetX is in [slotW - effW, 0]  (negative means piece extends left of slot)
 *   - offsetY is in [slotH - effH, 0]
 *
 * In piece-local coordinates (piece top-left = (0,0)):
 *   Slot occupies [−offsetX, −offsetX + slotW] × [−offsetY, −offsetY + slotH]
 *
 * We build a 3×3 grid using cut lines at:
 *   xCuts = sort+dedup([0, −offsetX, −offsetX + slotW, effW])
 *   yCuts = sort+dedup([0, −offsetY, −offsetY + slotH, effH])
 *
 * Cell (1,1) (the middle of the 3×3) is the slot-covering region — skipped.
 * All other non-zero-area cells become offcut pieces (up to 8).
 */
export function createOffcuts(
  pieces: Record<string, Piece>,
  pieceId: string,
  slotW: number,
  slotH: number,
  rotation: number,
  offsetX: number,
  offsetY: number,
): { offcuts: Piece[]; pieces: Record<string, Piece> } {
  const piece = pieces[pieceId];
  if (!piece) return { offcuts: [], pieces };

  const eff = getEffectiveDims(piece, rotation);

  // Build sorted, deduped cut lines in piece-local coordinates
  const rawXCuts = [0, -offsetX, -offsetX + slotW, eff.w];
  const rawYCuts = [0, -offsetY, -offsetY + slotH, eff.h];

  const xCuts = [...new Set(rawXCuts.map((v) => Math.min(Math.max(v, 0), eff.w)))].sort((a, b) => a - b);
  const yCuts = [...new Set(rawYCuts.map((v) => Math.min(Math.max(v, 0), eff.h)))].sort((a, b) => a - b);

  // Find the indices of the slot boundary columns/rows
  // slot starts at -offsetX in piece coords (clamped to [0, effW])
  const slotStartX = Math.min(Math.max(-offsetX, 0), eff.w);
  const slotStartY = Math.min(Math.max(-offsetY, 0), eff.h);

  const slotColStart = xCuts.indexOf(slotStartX);
  const slotRowStart = yCuts.indexOf(slotStartY);

  const newPieces = { ...pieces };
  const offcuts: Piece[] = [];
  let offcutIndex = 0;

  for (let row = 0; row < yCuts.length - 1; row++) {
    for (let col = 0; col < xCuts.length - 1; col++) {
      // Skip the slot-covering cell
      if (col === slotColStart && row === slotRowStart) continue;

      const ox = xCuts[col];
      const oy = yCuts[row];
      const ow = xCuts[col + 1] - ox;
      const oh = yCuts[row + 1] - oy;

      if (ow <= 0.01 || oh <= 0.01) continue;

      const offcutId = generateOffcutId(pieceId, offcutIndex++);
      const offcutPiece: Piece = {
        id: offcutId,
        sourceTileId: piece.sourceTileId,
        parentId: pieceId,
        width: ow,
        height: oh,
        geometry: { boundingBox: { w: ow, h: oh }, cutouts: [] },
        imageRegion: computeOffcutImageRegion(piece, rotation, ox, oy, ow, oh),
      };
      newPieces[offcutId] = offcutPiece;
      offcuts.push(offcutPiece);
    }
  }

  return { offcuts, pieces: newPieces };
}

/**
 * Cascade-delete all descendants of a piece.
 * Returns removed placements for toast notifications and the mutated data.
 */
export function cascadeDelete(
  pieces: Record<string, Piece>,
  walls: Wall[],
  pieceId: string
): {
  removedPlacements: RemovedPlacement[];
  pieces: Record<string, Piece>;
  walls: Wall[];
} {
  const descendants = getAllDescendants(pieces, pieceId);
  const removedPlacements: RemovedPlacement[] = [];
  const newPieces = { ...pieces };
  const newWalls = walls.map((w) => ({
    ...w,
    tiles: { ...w.tiles },
    nicheTiles: w.nicheTiles
      ? {
          back: { ...w.nicheTiles.back },
          left: { ...w.nicheTiles.left },
          right: { ...w.nicheTiles.right },
          top: { ...w.nicheTiles.top },
          bottom: { ...w.nicheTiles.bottom },
        }
      : undefined,
  }));

  for (const descId of descendants) {
    const placement = getPiecePlacement(newWalls, descId);
    if (placement) {
      const tiles = placement.surface
        ? newWalls.find((w) => w.id === placement.wall.id)!.nicheTiles![
            placement.surface
          ]
        : newWalls.find((w) => w.id === placement.wall.id)!.tiles;
      delete tiles[placement.key];
      removedPlacements.push({
        pieceId: descId,
        wallName: placement.wall.name,
        surface: placement.surface,
      });
    }
    delete newPieces[descId];
  }

  return { removedPlacements, pieces: newPieces, walls: newWalls };
}

/**
 * @deprecated Anchor system replaced by continuous offsetX/offsetY.
 * Kept for backward-compat; always returns ['top-left'].
 */
export function getValidAnchors(
  _effectiveDims: { w: number; h: number },
  _slot: GridSlot
): AnchorPosition[] {
  return ['top-left'];
}

/**
 * Check if a piece can be placed in a slot (any rotation).
 */
export function canPlacePiece(
  pieces: Record<string, Piece>,
  pieceId: string,
  slotW: number,
  slotH: number
): boolean {
  const piece = pieces[pieceId];
  if (!piece) return false;
  for (const rot of [0, 90, 180, 270]) {
    const dims = getEffectiveDims(piece, rot);
    if (dims.w >= slotW - 0.01 && dims.h >= slotH - 0.01) return true;
  }
  return false;
}
