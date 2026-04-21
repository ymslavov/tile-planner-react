import type { Wall, Piece, Placement, Orientation, NicheSurfaceKey } from '../store/types';
import { computeGrid, computeNicheOverlap } from './gridEngine';
import { getChildPieces } from './pieceHelpers';

/**
 * In wrap-around mode, auto-populate niche lip surfaces from wall-face tile cuts.
 * Returns mutated wall and pieces.
 */
export function computeWrapAroundNicheTiles(
  wall: Wall,
  pieces: Record<string, Piece>,
  orientation: Orientation
): { wall: Wall; pieces: Record<string, Piece> } {
  if (!wall.niche) return { wall, pieces };

  const newWall = { ...wall };
  const newPieces = { ...pieces };

  if (!newWall.nicheTiles) {
    newWall.nicheTiles = { back: {}, left: {}, right: {}, top: {}, bottom: {} };
  }

  // Collect previously auto-placed IDs
  const prevAutoIds = new Set<string>();
  for (const surface of ['left', 'right', 'top', 'bottom'] as NicheSurfaceKey[]) {
    for (const pl of Object.values(newWall.nicheTiles[surface])) {
      if (pl.autoWrap) prevAutoIds.add(pl.pieceId);
    }
  }

  // Clear lip surfaces
  newWall.nicheTiles = {
    ...newWall.nicheTiles,
    left: {},
    right: {},
    top: {},
    bottom: {},
  };

  // Remove previously auto-placed pieces
  for (const id of prevAutoIds) {
    if (newPieces[id] && newPieces[id].autoWrap) {
      delete newPieces[id];
    }
  }

  const grid = computeGrid(newWall, orientation);
  const { affectedSlots, nicheRect } = computeNicheOverlap(newWall, grid);
  if (!nicheRect) return { wall: newWall, pieces: newPieces };

  for (const slot of affectedSlots) {
    if (slot.fullyInside) continue;
    const key = `${slot.row},${slot.col}`;
    const placement = newWall.tiles[key];
    if (!placement) continue;

    const slotRight = slot.x + slot.w;
    const slotBottom = slot.y + slot.h;
    const children = getChildPieces(newPieces, placement.pieceId);

    function bestChildForLip(lipSide: string): Piece | null {
      if (children.length === 0) return null;
      for (const child of children) {
        const cr = child.imageRegion;
        if (lipSide === 'left') {
          const nicheLocalX = nicheRect!.left - slot.x;
          if (Math.abs(cr.x - nicheLocalX) < 0.5) return child;
        } else if (lipSide === 'right') {
          const nicheLocalX = nicheRect!.right - slot.x;
          if (
            Math.abs(
              cr.x -
                (slot.x +
                  (nicheLocalX - slot.x - (slot.w - (nicheRect!.right - slot.x))))
            ) < 0.5
          )
            return child;
        } else if (lipSide === 'top') {
          const nicheLocalY = nicheRect!.top - slot.y;
          if (Math.abs(cr.y - nicheLocalY) < 0.5) return child;
        } else if (lipSide === 'bottom') {
          const nicheLocalY = nicheRect!.bottom - slot.y;
          if (
            Math.abs(
              cr.y -
                (slot.y +
                  (nicheLocalY -
                    slot.y -
                    (slot.h - (nicheRect!.bottom - slot.y))))
            ) < 0.5
          )
            return child;
        }
      }
      return children[0] || null;
    }

    const makeLipPlacement = (child: Piece | null): Placement => ({
      pieceId: child ? child.id : placement.pieceId,
      rotation: placement.rotation || 0,
      offsetX: 0,
      offsetY: 0,
      autoWrap: true,
    });

    // Left lip
    if (nicheRect.left > slot.x && nicheRect.left < slotRight) {
      const child = bestChildForLip('left');
      newWall.nicheTiles!.left[`0,${slot.row}`] = makeLipPlacement(child);
    }
    // Right lip
    if (nicheRect.right > slot.x && nicheRect.right < slotRight) {
      const child = bestChildForLip('right');
      newWall.nicheTiles!.right[`0,${slot.row}`] = makeLipPlacement(child);
    }
    // Top lip
    if (nicheRect.top > slot.y && nicheRect.top < slotBottom) {
      const child = bestChildForLip('top');
      newWall.nicheTiles!.top[`${slot.col},0`] = makeLipPlacement(child);
    }
    // Bottom lip
    if (nicheRect.bottom > slot.y && nicheRect.bottom < slotBottom) {
      const child = bestChildForLip('bottom');
      newWall.nicheTiles!.bottom[`${slot.col},0`] = makeLipPlacement(child);
    }
  }

  return { wall: newWall, pieces: newPieces };
}
