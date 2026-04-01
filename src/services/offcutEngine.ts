import type {
  Piece,
  AnchorPosition,
  Wall,
  RemovedPlacement,
  GridSlot,
} from '../store/types';
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
 * Create offcut pieces when a piece is placed in a slot.
 * Returns the created offcuts and the mutated pieces record.
 */
export function createOffcuts(
  pieces: Record<string, Piece>,
  pieceId: string,
  slotW: number,
  slotH: number,
  rotation: number,
  anchor: AnchorPosition
): { offcuts: Piece[]; pieces: Record<string, Piece> } {
  const piece = pieces[pieceId];
  if (!piece) return { offcuts: [], pieces };

  const eff = getEffectiveDims(piece, rotation);
  const overW = eff.w - slotW;
  const overH = eff.h - slotH;

  if (overW <= 0 && overH <= 0) return { offcuts: [], pieces };

  const newPieces = { ...pieces };

  // Determine offcut origins in the parent's rotated space based on anchor
  let sideOx: number, sideOy: number;
  let topOx: number, topOy: number;

  if (anchor === 'top-left') {
    sideOx = slotW;
    sideOy = 0;
    topOx = 0;
    topOy = slotH;
  } else if (anchor === 'top-right') {
    sideOx = 0;
    sideOy = 0;
    topOx = 0;
    topOy = slotH;
  } else if (anchor === 'bottom-left') {
    sideOx = slotW;
    sideOy = 0;
    topOx = 0;
    topOy = 0;
  } else {
    // bottom-right
    sideOx = 0;
    sideOy = 0;
    topOx = 0;
    topOy = 0;
  }

  const offcuts: Piece[] = [];
  let offcutIndex = 0;

  if (overW > 0 && overH > 0) {
    // Both overhangs: 3 offcuts
    const sideId = generateOffcutId(pieceId, offcutIndex++);
    const sidePiece: Piece = {
      id: sideId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: overW,
      height: eff.h,
      geometry: { boundingBox: { w: overW, h: eff.h }, cutouts: [] },
      imageRegion: computeOffcutImageRegion(
        piece,
        rotation,
        sideOx,
        sideOy,
        overW,
        eff.h
      ),
    };
    newPieces[sideId] = sidePiece;
    offcuts.push(sidePiece);

    const bottomId = generateOffcutId(pieceId, offcutIndex++);
    const bottomPiece: Piece = {
      id: bottomId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: slotW,
      height: overH,
      geometry: { boundingBox: { w: slotW, h: overH }, cutouts: [] },
      imageRegion: computeOffcutImageRegion(
        piece,
        rotation,
        topOx,
        topOy,
        slotW,
        overH
      ),
    };
    newPieces[bottomId] = bottomPiece;
    offcuts.push(bottomPiece);

    const cornerId = generateOffcutId(pieceId, offcutIndex++);
    const cornerOx =
      anchor === 'top-left' || anchor === 'bottom-left' ? slotW : 0;
    const cornerOy =
      anchor === 'top-left' || anchor === 'top-right' ? slotH : 0;
    const cornerPiece: Piece = {
      id: cornerId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: overW,
      height: overH,
      geometry: { boundingBox: { w: overW, h: overH }, cutouts: [] },
      imageRegion: computeOffcutImageRegion(
        piece,
        rotation,
        cornerOx,
        cornerOy,
        overW,
        overH
      ),
    };
    newPieces[cornerId] = cornerPiece;
    offcuts.push(cornerPiece);
  } else if (overW > 0) {
    const sideId = generateOffcutId(pieceId, offcutIndex++);
    const sidePiece: Piece = {
      id: sideId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: overW,
      height: eff.h,
      geometry: { boundingBox: { w: overW, h: eff.h }, cutouts: [] },
      imageRegion: computeOffcutImageRegion(
        piece,
        rotation,
        sideOx,
        sideOy,
        overW,
        eff.h
      ),
    };
    newPieces[sideId] = sidePiece;
    offcuts.push(sidePiece);
  } else if (overH > 0) {
    const topId = generateOffcutId(pieceId, offcutIndex++);
    const topPiece: Piece = {
      id: topId,
      sourceTileId: piece.sourceTileId,
      parentId: pieceId,
      width: eff.w,
      height: overH,
      geometry: { boundingBox: { w: eff.w, h: overH }, cutouts: [] },
      imageRegion: computeOffcutImageRegion(
        piece,
        rotation,
        topOx,
        topOy,
        eff.w,
        overH
      ),
    };
    newPieces[topId] = topPiece;
    offcuts.push(topPiece);
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
 * Get valid anchor positions based on effective dimensions vs slot.
 */
export function getValidAnchors(
  effectiveDims: { w: number; h: number },
  slot: GridSlot
): AnchorPosition[] {
  const overW = effectiveDims.w - slot.w > 0.01;
  const overH = effectiveDims.h - slot.h > 0.01;
  if (overW && overH)
    return ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  if (overW) return ['top-left', 'top-right'];
  if (overH) return ['top-left', 'bottom-left'];
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
