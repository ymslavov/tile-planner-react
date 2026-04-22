import type { Wall, Piece, Placement, Orientation } from '../store/types';
import { computeGrid, computeNicheOverlap } from './gridEngine';

/**
 * Wrap-around niche mode:
 * When a wall-face tile intersects the niche opening, the tile is cut at the
 * niche edge. The material that's "behind" the niche opening would physically
 * be cut away. In wrap-around mode we assume the installer will keep strips of
 * that material and use them to line the 4 inner niche surfaces (the lips).
 *
 * This function:
 *   1. Clears any previously auto-generated lip pieces from the registry.
 *   2. For each wall-face tile intersecting the niche edges, generates lip
 *      strip pieces — one per relevant niche edge (left/right/top/bottom).
 *   3. Auto-places those strips on the corresponding lip surfaces.
 *
 * The generated pieces have `parentId` = the wall-face piece, `autoWrap: true`,
 * so the sidebar shows them nested under the parent tile with a wall label,
 * and they cannot be manually dragged/edited.
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

  // 1. Clear previously auto-generated lip pieces from registry + lip placements
  const prevAutoIds: string[] = [];
  for (const surfaceKey of ['left', 'right', 'top', 'bottom'] as const) {
    for (const pl of Object.values(newWall.nicheTiles[surfaceKey])) {
      if (pl.autoWrap) prevAutoIds.push(pl.pieceId);
    }
  }
  for (const id of prevAutoIds) {
    if (newPieces[id] && newPieces[id].autoWrap) delete newPieces[id];
  }
  newWall.nicheTiles = {
    ...newWall.nicheTiles,
    left: {},
    right: {},
    top: {},
    bottom: {},
  };

  // 2. Walk wall-face slots that intersect the niche
  const grid = computeGrid(newWall, orientation);
  const { affectedSlots, nicheRect } = computeNicheOverlap(newWall, grid);
  if (!nicheRect) return { wall: newWall, pieces: newPieces };

  const depth = wall.niche.depth;

  for (const slot of affectedSlots) {
    if (slot.fullyInside) continue;
    const key = `${slot.row},${slot.col}`;
    const placement = newWall.tiles[key];
    if (!placement) continue;
    const parent = newPieces[placement.pieceId];
    if (!parent) continue;

    // Convert slot coords and niche rect into tile-local coords.
    // The tile's top-left in wall coords is (slot.x + offsetX, slot.y + offsetY).
    const tileWallLeft = slot.x + (placement.offsetX ?? 0);
    const tileWallTop = slot.y + (placement.offsetY ?? 0);

    // Niche rect in tile-local coords (rotation 0 — handle rotated later if needed)
    const nLeft = nicheRect.left - tileWallLeft;
    const nRight = nicheRect.right - tileWallLeft;
    const nTop = nicheRect.top - tileWallTop;
    const nBottom = nicheRect.bottom - tileWallTop;

    // For each niche edge that the slot's wall-face visible area crosses,
    // compute a lip strip in tile-local coords.

    // A lip strip only exists if the corresponding niche edge is cut by the
    // tile (i.e., the edge position is inside the tile's width/height extent
    // AND the orthogonal extent of the strip intersects the tile).

    const lipStrips: Array<{
      side: 'left' | 'right' | 'top' | 'bottom';
      tileRect: { x: number; y: number; w: number; h: number };
    }> = [];

    // Left lip: wall-face tile's right edge is cut by niche's left edge.
    // Strip extends from nLeft going right by `depth`, vertically spanning
    // the niche opening's Y-range clipped to the tile.
    if (nLeft > 0 && nLeft < parent.width) {
      const yStart = Math.max(0, nTop);
      const yEnd = Math.min(parent.height, nBottom);
      if (yEnd - yStart > 0.01) {
        lipStrips.push({
          side: 'left',
          tileRect: {
            x: nLeft,
            y: yStart,
            w: Math.min(depth, parent.width - nLeft),
            h: yEnd - yStart,
          },
        });
      }
    }

    // Right lip: wall-face tile's left edge is cut by niche's right edge.
    // Strip extends from nRight going LEFT by depth (into the niche interior).
    if (nRight > 0 && nRight < parent.width) {
      const yStart = Math.max(0, nTop);
      const yEnd = Math.min(parent.height, nBottom);
      if (yEnd - yStart > 0.01) {
        const stripLeft = Math.max(0, nRight - depth);
        lipStrips.push({
          side: 'right',
          tileRect: {
            x: stripLeft,
            y: yStart,
            w: nRight - stripLeft,
            h: yEnd - yStart,
          },
        });
      }
    }

    // Top lip: wall-face tile's bottom edge is cut by niche's top edge.
    // Strip extends from nTop going DOWN by depth.
    if (nTop > 0 && nTop < parent.height) {
      const xStart = Math.max(0, nLeft);
      const xEnd = Math.min(parent.width, nRight);
      if (xEnd - xStart > 0.01) {
        lipStrips.push({
          side: 'top',
          tileRect: {
            x: xStart,
            y: nTop,
            w: xEnd - xStart,
            h: Math.min(depth, parent.height - nTop),
          },
        });
      }
    }

    // Bottom lip: wall-face tile's top edge is cut by niche's bottom edge.
    // Strip extends from nBottom going UP by depth.
    if (nBottom > 0 && nBottom < parent.height) {
      const xStart = Math.max(0, nLeft);
      const xEnd = Math.min(parent.width, nRight);
      if (xEnd - xStart > 0.01) {
        const stripTop = Math.max(0, nBottom - depth);
        lipStrips.push({
          side: 'bottom',
          tileRect: {
            x: xStart,
            y: stripTop,
            w: xEnd - xStart,
            h: nBottom - stripTop,
          },
        });
      }
    }

    // 3. Create the lip strip pieces and place them on the lip surfaces
    let lipIndex = 0;
    for (const { side, tileRect } of lipStrips) {
      const lipId = `${placement.pieceId}-L${side[0].toUpperCase()}${lipIndex++}`;
      // imageRegion in the original tile image space — the strip's position
      // in the tile is (tileRect.x, tileRect.y) with size (tileRect.w, h).
      // Since the parent may itself be an offcut with non-zero imageRegion.x/y,
      // we offset accordingly.
      const pr = parent.imageRegion;
      const imageRegion = {
        x: pr.x + tileRect.x,
        y: pr.y + tileRect.y,
        w: tileRect.w,
        h: tileRect.h,
      };

      // Lip surface dimensions:
      //   left/right: depth × niche.height
      //   top/bottom: niche.width × depth
      const surfaceW = (side === 'left' || side === 'right') ? depth : wall.niche.width;
      const surfaceH = (side === 'top' || side === 'bottom') ? depth : wall.niche.height;

      // If the strip doesn't fully cover the lip surface, it's just partial
      // coverage — still show what we have. The piece.width/height is the
      // strip's actual size; the placement offsetX/Y positions it within the
      // lip surface.
      const lipPiece: Piece = {
        id: lipId,
        sourceTileId: parent.sourceTileId,
        parentId: placement.pieceId,
        width: tileRect.w,
        height: tileRect.h,
        geometry: {
          boundingBox: { w: tileRect.w, h: tileRect.h },
          cutouts: [],
        },
        imageRegion,
        autoWrap: true,
      };

      newPieces[lipId] = lipPiece;

      // Place on lip surface. Center or flush-left depending on alignment.
      // Default: anchor at top-left of the lip surface (offsets = 0).
      const lipPlacement: Placement = {
        pieceId: lipId,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        autoWrap: true,
      };

      // SurfaceGrid renders placements keyed at "0,0" (single-slot lip surface).
      // If multiple wall tiles contribute strips to the same lip, they all
      // overlay at offset (0,0) — partial coverage. Physically, multiple
      // strips stack vertically/horizontally; we use unique keys but
      // SurfaceGrid will render each at its own position via offsetX/offsetY.
      //
      // For now, pick the strip with the largest area and use key "0,0".
      // Future work: support multiple strips per lip surface with proper
      // vertical/horizontal positioning.
      const existing = newWall.nicheTiles![side]['0,0'];
      const existingPiece = existing ? newPieces[existing.pieceId] : null;
      const existingArea = existingPiece ? existingPiece.width * existingPiece.height : 0;
      const newArea = tileRect.w * tileRect.h;

      if (!existing || newArea > existingArea) {
        // Remove the prior lip piece if we're replacing it
        if (existing && existingPiece) delete newPieces[existing.pieceId];
        newWall.nicheTiles![side]['0,0'] = lipPlacement;
      } else {
        // Discard this smaller strip — remove the piece we just added
        delete newPieces[lipId];
      }

      // Prevent "unused variable" warning for surfaceW/H (they're documentation)
      void surfaceW;
      void surfaceH;
    }
  }

  return { wall: newWall, pieces: newPieces };
}
