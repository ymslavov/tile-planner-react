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
 * Create the offcut piece when a piece is placed in a slot using continuous offsets.
 *
 * offsetX / offsetY: cm offset of piece's top-left from slot's top-left.
 *   - offsetX is in [slotW - effW, 0]  (negative means piece extends left of slot)
 *   - offsetY is in [slotH - effH, 0]
 *
 * In piece-local coordinates (piece top-left = (0,0)):
 *   Slot occupies [−offsetX, −offsetX + slotW] × [−offsetY, −offsetY + slotH]
 *
 * This function produces **one offcut piece** whose shape is the piece minus the
 * slot-covered rectangle. The shape is encoded via the piece's bounding box and
 * a single rectangular cutout for the slot-used area.
 *
 * Resulting offcut shapes depending on offset position:
 *   - Corner-anchored (e.g., top-left flush):    L-shape
 *   - Centered on one axis, flush on the other:  C-shape (U-shape)
 *   - Centered on both axes:                     frame shape (square donut)
 *   - Slot spans full width OR height:           rectangle (simple strip)
 *   - Slot flush on 3 sides:                     rectangle (single strip)
 *   - Slot flush on 4 sides (exact fit):         no offcut
 *
 * This matches the physical reality of cutting tile: one placement produces
 * one leftover piece (which may or may not be further sub-cut later).
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

  // Slot-covered region in piece-local coordinates (piece top-left = 0,0)
  const slotX = Math.min(Math.max(-offsetX, 0), eff.w);
  const slotY = Math.min(Math.max(-offsetY, 0), eff.h);
  const slotUsedW = Math.min(slotW, eff.w - slotX);
  const slotUsedH = Math.min(slotH, eff.h - slotY);
  const slotEndX = slotX + slotUsedW;
  const slotEndY = slotY + slotUsedH;

  // Exact fit — no offcut
  if (slotUsedW >= eff.w - 0.01 && slotUsedH >= eff.h - 0.01) {
    return { offcuts: [], pieces };
  }

  // Nothing to cut out (shouldn't happen but defensive)
  if (slotUsedW <= 0.01 || slotUsedH <= 0.01) {
    return { offcuts: [], pieces };
  }

  const spansFullWidth = slotUsedW >= eff.w - 0.01;
  const spansFullHeight = slotUsedH >= eff.h - 0.01;
  const newPieces = { ...pieces };
  const offcuts: Piece[] = [];

  // Special case 1: slot spans full width but middle of height → 2 disconnected strips
  if (spansFullWidth && slotY > 0.01 && slotEndY < eff.h - 0.01) {
    // Top strip: (0, 0, eff.w, slotY)
    const topId = generateOffcutId(pieceId, 0);
    const top: Piece = {
      id: topId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: eff.w,
      height: slotY,
      geometry: { boundingBox: { w: eff.w, h: slotY }, cutouts: [] },
      imageRegion: computeOffcutImageRegion(piece, rotation, 0, 0, eff.w, slotY),
    };
    newPieces[topId] = top;
    offcuts.push(top);

    // Bottom strip: (0, slotEndY, eff.w, eff.h - slotEndY)
    const bottomId = generateOffcutId(pieceId, 1);
    const bottom: Piece = {
      id: bottomId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: eff.w,
      height: eff.h - slotEndY,
      geometry: { boundingBox: { w: eff.w, h: eff.h - slotEndY }, cutouts: [] },
      imageRegion: computeOffcutImageRegion(piece, rotation, 0, slotEndY, eff.w, eff.h - slotEndY),
    };
    newPieces[bottomId] = bottom;
    offcuts.push(bottom);
    return { offcuts, pieces: newPieces };
  }

  // Special case 2: slot spans full height but middle of width → 2 disconnected strips
  if (spansFullHeight && slotX > 0.01 && slotEndX < eff.w - 0.01) {
    const leftId = generateOffcutId(pieceId, 0);
    const left: Piece = {
      id: leftId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: slotX,
      height: eff.h,
      geometry: { boundingBox: { w: slotX, h: eff.h }, cutouts: [] },
      imageRegion: computeOffcutImageRegion(piece, rotation, 0, 0, slotX, eff.h),
    };
    newPieces[leftId] = left;
    offcuts.push(left);

    const rightId = generateOffcutId(pieceId, 1);
    const right: Piece = {
      id: rightId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: eff.w - slotEndX,
      height: eff.h,
      geometry: { boundingBox: { w: eff.w - slotEndX, h: eff.h }, cutouts: [] },
      imageRegion: computeOffcutImageRegion(piece, rotation, slotEndX, 0, eff.w - slotEndX, eff.h),
    };
    newPieces[rightId] = right;
    offcuts.push(right);
    return { offcuts, pieces: newPieces };
  }

  // General case: slot is a rectangle inside the piece. The offcut is the
  // connected region = piece minus slot, represented as one piece with a
  // cutout. Shape: rectangle / L / C / frame depending on which edges of the
  // piece the slot touches.
  //
  // Bounding box trimming rule: only trim an axis when the slot covers
  // the ENTIRE opposite edge on that axis (meaning there's no non-slot content
  // reaching that edge at all). This happens only when the slot spans the full
  // extent of the OTHER axis.
  //
  // For example, if the slot is flush with the top edge AND spans full width,
  // then the top edge of the piece is fully covered, so we can trim bbMinY to
  // slotEndY. But if the slot is flush with top but NOT full width, the top
  // edge has non-slot content on the sides — don't trim.

  const coversEntireLeftEdge = slotX < 0.01 && spansFullHeight;
  const coversEntireRightEdge = slotEndX > eff.w - 0.01 && spansFullHeight;
  const coversEntireTopEdge = slotY < 0.01 && spansFullWidth;
  const coversEntireBottomEdge = slotEndY > eff.h - 0.01 && spansFullWidth;

  const bbX = coversEntireLeftEdge ? slotEndX : 0;
  const bbMaxX = coversEntireRightEdge ? slotX : eff.w;
  const bbY = coversEntireTopEdge ? slotEndY : 0;
  const bbMaxY = coversEntireBottomEdge ? slotY : eff.h;
  const bbW = bbMaxX - bbX;
  const bbH = bbMaxY - bbY;

  // Cutout position within the offcut's local coords
  const cutoutX = slotX - bbX;
  const cutoutY = slotY - bbY;
  const cutouts: { x: number; y: number; w: number; h: number }[] = [];

  // Only add a cutout if the slot actually overlaps the offcut bounding box
  // AND the cutout doesn't cover the entire bounding box.
  const cutoutWithinBbox =
    cutoutX < bbW - 0.01 &&
    cutoutY < bbH - 0.01 &&
    cutoutX + slotUsedW > 0.01 &&
    cutoutY + slotUsedH > 0.01;
  if (cutoutWithinBbox) {
    const cx = Math.max(0, cutoutX);
    const cy = Math.max(0, cutoutY);
    const cw = Math.min(bbW - cx, slotUsedW + Math.min(0, cutoutX));
    const ch = Math.min(bbH - cy, slotUsedH + Math.min(0, cutoutY));
    if (cw > 0.01 && ch > 0.01 && !(cw >= bbW - 0.01 && ch >= bbH - 0.01)) {
      // Don't add a cutout that's flush with all 4 edges (= empty offcut)
      cutouts.push({ x: cx, y: cy, w: cw, h: ch });
    }
  }

  // Compute image region for the offcut bounding box
  const imageRegion = computeOffcutImageRegion(piece, rotation, bbX, bbY, bbW, bbH);

  const offcutId = generateOffcutId(pieceId, 0);
  const offcutPiece: Piece = {
    id: offcutId,
    sourceTileId: piece.sourceTileId,
    parentId: pieceId,
    width: bbW,
    height: bbH,
    geometry: {
      boundingBox: { w: bbW, h: bbH },
      cutouts,
    },
    imageRegion,
  };

  newPieces[offcutId] = offcutPiece;
  offcuts.push(offcutPiece);
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
