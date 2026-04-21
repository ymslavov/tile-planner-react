import type {
  Wall,
  GridResult,
  GridSlot,
  NicheOverlapResult,
  AffectedSlot,
  Orientation,
} from '../store/types';
import { GROUT } from '../constants';
import { getTileW, getTileH } from './pieceHelpers';

/**
 * Compute column widths or row heights for a wall dimension.
 * Distributes tile sizes + grout gaps to fill wallDim, then places any
 * partial tile according to mode.
 */
export function computeSizes(
  wallDim: number,
  tileDim: number,
  grout: number,
  mode: string
): number[] {
  const fullCount = Math.floor(wallDim / (tileDim + grout));
  const usedSpace = fullCount * tileDim + Math.max(0, fullCount - 1) * grout;
  const remainder = wallDim - usedSpace;

  // Wall is perfectly filled
  if (remainder < grout + 0.01) {
    const sizes: number[] = [];
    for (let i = 0; i < fullCount; i++) sizes.push(tileDim);
    return sizes;
  }

  // Wall is smaller than a single tile — the entire wall is one partial slot.
  // No grout is needed (nothing to gap against). Split mode doesn't make
  // sense here because there are no full tiles to center.
  if (fullCount === 0) {
    return [wallDim];
  }

  const partialSize = remainder - grout;

  if (mode === 'right' || mode === 'bottom') {
    const sizes: number[] = [];
    for (let i = 0; i < fullCount; i++) sizes.push(tileDim);
    sizes.push(partialSize);
    return sizes;
  }

  if (mode === 'left' || mode === 'top') {
    const sizes: number[] = [partialSize];
    for (let i = 0; i < fullCount; i++) sizes.push(tileDim);
    return sizes;
  }

  // 'split' mode (only reached when fullCount >= 1)
  const splitTotal = wallDim - fullCount * tileDim - (fullCount + 1) * grout;
  if (splitTotal < 0.01) {
    const sizes: number[] = [];
    for (let i = 0; i < fullCount; i++) sizes.push(tileDim);
    return sizes;
  }
  const halfLeft = Math.round((splitTotal / 2) * 10) / 10;
  const halfRight = Math.round((splitTotal - halfLeft) * 10) / 10;
  const sizes: number[] = [halfLeft];
  for (let i = 0; i < fullCount; i++) sizes.push(tileDim);
  sizes.push(halfRight);
  return sizes;
}

/**
 * Compute the full grid for a wall.
 * Returns slot positions, dimensions, and partial flags.
 */
export function computeGrid(wall: Pick<Wall, 'width' | 'height' | 'remainderH' | 'remainderV'>, orientation: Orientation): GridResult {
  const tw = getTileW(orientation);
  const th = getTileH(orientation);

  const colWidths = computeSizes(wall.width, tw, GROUT, wall.remainderH);
  const rowHeights = computeSizes(wall.height, th, GROUT, wall.remainderV);
  const totalCols = colWidths.length;
  const totalRows = rowHeights.length;

  const slots: GridSlot[] = [];
  let yPos = 0;
  for (let r = 0; r < totalRows; r++) {
    let xPos = 0;
    for (let c = 0; c < totalCols; c++) {
      slots.push({
        row: r,
        col: c,
        x: xPos,
        y: yPos,
        w: colWidths[c],
        h: rowHeights[r],
        isPartialW: colWidths[c] < tw - 0.01,
        isPartialH: rowHeights[r] < th - 0.01,
      });
      xPos += colWidths[c] + GROUT;
    }
    yPos += rowHeights[r] + GROUT;
  }

  return { totalRows, totalCols, colWidths, rowHeights, slots, tw, th };
}

/**
 * Find which grid slots overlap with the niche rectangle.
 */
export function computeNicheOverlap(
  wall: Wall,
  grid: GridResult
): NicheOverlapResult {
  if (!wall.niche) return { affectedSlots: [], nicheRect: null };

  const n = wall.niche;
  const nicheRect = {
    left: n.fromLeft,
    top: wall.height - n.fromFloor - n.height,
    width: n.width,
    height: n.height,
    right: n.fromLeft + n.width,
    bottom: wall.height - n.fromFloor - n.height + n.height,
  };

  const affectedSlots: AffectedSlot[] = [];
  for (const slot of grid.slots) {
    const slotRight = slot.x + slot.w;
    const slotBottom = slot.y + slot.h;
    const overlapL = Math.max(slot.x, nicheRect.left);
    const overlapT = Math.max(slot.y, nicheRect.top);
    const overlapR = Math.min(slotRight, nicheRect.right);
    const overlapB = Math.min(slotBottom, nicheRect.bottom);

    if (overlapR > overlapL && overlapB > overlapT) {
      const fullyInside =
        slot.x >= nicheRect.left &&
        slotRight <= nicheRect.right &&
        slot.y >= nicheRect.top &&
        slotBottom <= nicheRect.bottom;
      affectedSlots.push({
        ...slot,
        nicheOverlap: {
          left: overlapL,
          top: overlapT,
          right: overlapR,
          bottom: overlapB,
        },
        fullyInside,
      });
    }
  }

  return { affectedSlots, nicheRect };
}
