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
 * Rotate a rectangle from the parent's natural (rotation=0) piece-local
 * coordinate system into a rotated coordinate system. Used when the parent's
 * cutouts (stored in its natural frame) need to be expressed in the rotated
 * frame used for offcut geometry.
 *
 * Input: rect in parent's natural coords [0, parent.width] × [0, parent.height]
 * Output: rect in parent's rotated coords [0, effW] × [0, effH]
 */
function rotateRectInPiece(
  rect: { x: number; y: number; w: number; h: number },
  rotation: number,
  parentW: number,
  parentH: number
): { x: number; y: number; w: number; h: number } {
  switch (rotation) {
    case 0:
      return rect;
    case 90:
      // 90° CW: (x, y) → (parentH - y - h, x), and w/h swap
      return {
        x: parentH - rect.y - rect.h,
        y: rect.x,
        w: rect.h,
        h: rect.w,
      };
    case 180:
      return {
        x: parentW - rect.x - rect.w,
        y: parentH - rect.y - rect.h,
        w: rect.w,
        h: rect.h,
      };
    case 270:
      // 270° CW (= 90° CCW): (x, y) → (y, parentW - x - w), and w/h swap
      return {
        x: rect.y,
        y: parentW - rect.x - rect.w,
        w: rect.h,
        h: rect.w,
      };
    default:
      return rect;
  }
}

/**
 * Clip a rectangle to a bounding box and translate to bbox-local coords.
 * Returns null if there's no overlap.
 */
function clipRectToBbox(
  rect: { x: number; y: number; w: number; h: number },
  bbX: number,
  bbY: number,
  bbW: number,
  bbH: number
): { x: number; y: number; w: number; h: number } | null {
  const x1 = Math.max(rect.x, bbX);
  const y1 = Math.max(rect.y, bbY);
  const x2 = Math.min(rect.x + rect.w, bbX + bbW);
  const y2 = Math.min(rect.y + rect.h, bbY + bbH);
  if (x2 - x1 < 0.01 || y2 - y1 < 0.01) return null;
  return { x: x1 - bbX, y: y1 - bbY, w: x2 - x1, h: y2 - y1 };
}

/**
 * Given the parent's cutouts and the offcut bounding box (in parent's rotated
 * frame), produce the cutout list for the offcut, translated to offcut-local
 * coords and clipped to the offcut bbox.
 *
 * Input rects are in parent.rotated frame [0, effW]×[0, effH].
 * Output rects are in offcut-local frame [0, bbW]×[0, bbH].
 */
function inheritParentCutouts(
  parent: Piece,
  rotation: number,
  bbX: number,
  bbY: number,
  bbW: number,
  bbH: number
): { x: number; y: number; w: number; h: number }[] {
  const result: { x: number; y: number; w: number; h: number }[] = [];
  for (const c of parent.geometry.cutouts) {
    // Parent's cutouts are stored in parent's natural (rotation=0) frame.
    // Rotate them into the rotated frame to align with bbX/bbY/bbW/bbH.
    const rotated = rotateRectInPiece(c, rotation, parent.width, parent.height);
    const clipped = clipRectToBbox(rotated, bbX, bbY, bbW, bbH);
    if (clipped) result.push(clipped);
  }
  return result;
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
    const topId = generateOffcutId(pieceId, 0);
    const topCutouts = inheritParentCutouts(piece, rotation, 0, 0, eff.w, slotY);
    const top: Piece = {
      id: topId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: eff.w,
      height: slotY,
      geometry: { boundingBox: { w: eff.w, h: slotY }, cutouts: topCutouts },
      imageRegion: computeOffcutImageRegion(piece, rotation, 0, 0, eff.w, slotY),
    };
    newPieces[topId] = top;
    offcuts.push(top);

    const bottomId = generateOffcutId(pieceId, 1);
    const bottomCutouts = inheritParentCutouts(piece, rotation, 0, slotEndY, eff.w, eff.h - slotEndY);
    const bottom: Piece = {
      id: bottomId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: eff.w,
      height: eff.h - slotEndY,
      geometry: { boundingBox: { w: eff.w, h: eff.h - slotEndY }, cutouts: bottomCutouts },
      imageRegion: computeOffcutImageRegion(piece, rotation, 0, slotEndY, eff.w, eff.h - slotEndY),
    };
    newPieces[bottomId] = bottom;
    offcuts.push(bottom);
    return { offcuts, pieces: newPieces };
  }

  // Special case 2: slot spans full height but middle of width → 2 disconnected strips
  if (spansFullHeight && slotX > 0.01 && slotEndX < eff.w - 0.01) {
    const leftId = generateOffcutId(pieceId, 0);
    const leftCutouts = inheritParentCutouts(piece, rotation, 0, 0, slotX, eff.h);
    const left: Piece = {
      id: leftId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: slotX,
      height: eff.h,
      geometry: { boundingBox: { w: slotX, h: eff.h }, cutouts: leftCutouts },
      imageRegion: computeOffcutImageRegion(piece, rotation, 0, 0, slotX, eff.h),
    };
    newPieces[leftId] = left;
    offcuts.push(left);

    const rightId = generateOffcutId(pieceId, 1);
    const rightCutouts = inheritParentCutouts(piece, rotation, slotEndX, 0, eff.w - slotEndX, eff.h);
    const right: Piece = {
      id: rightId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: eff.w - slotEndX,
      height: eff.h,
      geometry: { boundingBox: { w: eff.w - slotEndX, h: eff.h }, cutouts: rightCutouts },
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

  // Start with inherited cutouts from the parent piece, translated and clipped
  // to the offcut's bounding box. These represent regions that already didn't
  // physically exist in the parent (e.g. an L-shape parent has a corner cutout).
  const cutouts: { x: number; y: number; w: number; h: number }[] =
    inheritParentCutouts(piece, rotation, bbX, bbY, bbW, bbH);

  // Add the new cutout for the slot-covered region within the offcut bbox
  const cutoutX = slotX - bbX;
  const cutoutY = slotY - bbY;
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
