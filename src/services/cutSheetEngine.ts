import type {
  Piece,
  Wall,
  Orientation,
  NicheSurfaceKey,
} from '../store/types';
import { computeGrid, computeNicheOverlap } from './gridEngine';
import {
  getChildPieces,
  getPlacedPieceIds,
} from './pieceHelpers';
import { TILE_COUNT } from '../constants';

export interface CutSheetTileEntry {
  tileNumber: number;
  allPieces: Piece[];
  placed: Map<string, { wallId: string; location: string }>;
}

/**
 * Collect all descendants of a piece recursively.
 */
export function collectDescendants(
  pieces: Record<string, Piece>,
  pieceId: string,
  result: Piece[]
): void {
  const children = getChildPieces(pieces, pieceId);
  for (const child of children) {
    result.push(child);
    collectDescendants(pieces, child.id, result);
  }
}

/**
 * Get all tile entries that have cuts for the cut sheet.
 */
export function getCutSheetEntries(
  pieces: Record<string, Piece>,
  walls: Wall[],
  _orientation: Orientation
): CutSheetTileEntry[] {
  const placed = getPlacedPieceIds(walls);
  const entries: CutSheetTileEntry[] = [];

  for (let i = 1; i <= TILE_COUNT; i++) {
    const rootId = String(i);
    const rootPiece = pieces[rootId];
    if (!rootPiece) continue;

    const allPieces: Piece[] = [rootPiece];
    collectDescendants(pieces, rootId, allPieces);

    // Include the tile if any piece in the chain is placed. Whole-tile
    // uses (root placed, no children) still get a section so the worker
    // knows where the tile goes — the wall preview alone can be hard to
    // cross-reference for a single tile.
    const anyPlaced = allPieces.some((p) => placed.has(p.id));
    if (!anyPlaced) continue;

    entries.push({ tileNumber: i, allPieces, placed });
  }

  return entries;
}

/**
 * Build edge cut description text for a slot.
 */
export function buildEdgeCutDescription(slot: {
  w: number;
  h: number;
  isPartialW: boolean;
  isPartialH: boolean;
}): string {
  const parts: string[] = [];
  if (slot.isPartialW)
    parts.push(`Vertical cut at ${slot.w.toFixed(1)}cm from left edge`);
  if (slot.isPartialH)
    parts.push(`Horizontal cut at ${slot.h.toFixed(1)}cm from top edge`);
  return parts.join('; ');
}

export function computeWaste(
  pieceDims: { width: number; height: number }[],
  tw: number,
  th: number
): number {
  const totalArea = tw * th;
  const usedArea = pieceDims.reduce(
    (sum, p) => sum + p.width * p.height,
    0
  );
  return Math.max(0, totalArea - usedArea);
}

export interface CutSheetCutPiece {
  label: string;
  width: number;
  height: number;
  placement: string;
  cutDesc: string;
  centerX: number;
  centerY: number;
}

export interface CutSheetTileCut {
  type: 'horizontal' | 'vertical';
  positionCm: number;
}

export interface CutSheetCutEntry {
  tileId: string;
  wallId: string;
  wallName: string;
  pieces: CutSheetCutPiece[];
  tileCuts: CutSheetTileCut[];
  waste: number;
}

/**
 * Compute all cuts for the full cut sheet analysis.
 */
export function computeAllCuts(
  pieces: Record<string, Piece>,
  walls: Wall[],
  orientation: Orientation,
  nicheMode: string
): CutSheetCutEntry[] {
  const cuts: CutSheetCutEntry[] = [];

  for (const wall of walls) {
    const grid = computeGrid(wall, orientation);
    const { affectedSlots, nicheRect } = computeNicheOverlap(wall, grid);
    const nichePartialKeys = new Set(
      affectedSlots
        .filter((s) => !s.fullyInside)
        .map((s) => `${s.row},${s.col}`)
    );

    for (const [key, placement] of Object.entries(wall.tiles)) {
      const [row, col] = key.split(',').map(Number);
      const slot = grid.slots.find((s) => s.row === row && s.col === col);
      if (!slot) continue;

      const isPartialW = slot.isPartialW;
      const isPartialH = slot.isPartialH;
      const isNicheCut = nichePartialKeys.has(key);

      if (!isPartialW && !isPartialH && !isNicheCut) continue;

      const cspieces: CutSheetCutPiece[] = [];
      const tileCuts: CutSheetTileCut[] = [];

      if (isNicheCut && nicheRect) {
        const nichePiece = pieces[placement.pieceId];
        const tileId = nichePiece
          ? nichePiece.sourceTileId
          : placement.pieceId;
        const slotRight = slot.x + slot.w;
        const slotBottom = slot.y + slot.h;

        const cutLeft =
          nicheRect.left > slot.x && nicheRect.left < slotRight;
        const cutRight =
          nicheRect.right > slot.x && nicheRect.right < slotRight;
        const cutTop =
          nicheRect.top > slot.y && nicheRect.top < slotBottom;
        const cutBottom =
          nicheRect.bottom > slot.y && nicheRect.bottom < slotBottom;

        const xCuts = [slot.x];
        if (cutLeft) xCuts.push(nicheRect.left);
        if (cutRight) xCuts.push(nicheRect.right);
        xCuts.push(slotRight);

        const yCuts = [slot.y];
        if (cutTop) yCuts.push(nicheRect.top);
        if (cutBottom) yCuts.push(nicheRect.bottom);
        yCuts.push(slotBottom);

        let pieceLabel = 65;
        for (let yi = 0; yi < yCuts.length - 1; yi++) {
          for (let xi = 0; xi < xCuts.length - 1; xi++) {
            const rx = xCuts[xi],
              ry = yCuts[yi];
            const rw = xCuts[xi + 1] - rx;
            const rh = yCuts[yi + 1] - ry;
            if (rw < 0.1 || rh < 0.1) continue;

            const insideNiche =
              rx >= nicheRect.left &&
              rx + rw <= nicheRect.right + 0.01 &&
              ry >= nicheRect.top &&
              ry + rh <= nicheRect.bottom + 0.01;

            cspieces.push({
              label: `${tileId}-${String.fromCharCode(pieceLabel++)}`,
              width: rw,
              height: rh,
              placement: insideNiche
                ? nicheMode === 'wrap-around'
                  ? `${wall.name}, niche interior (lip)`
                  : 'Offcut (niche is independent)'
                : `${wall.name}, Row ${slot.row + 1}, Col ${slot.col + 1}`,
              cutDesc: `${rw.toFixed(1)} x ${rh.toFixed(1)}cm piece`,
              centerX: rx - slot.x + rw / 2,
              centerY: ry - slot.y + rh / 2,
            });
          }
        }

        if (nicheRect.left > slot.x && nicheRect.left < slotRight)
          tileCuts.push({ type: 'vertical', positionCm: nicheRect.left - slot.x });
        if (nicheRect.right > slot.x && nicheRect.right < slotRight)
          tileCuts.push({ type: 'vertical', positionCm: nicheRect.right - slot.x });
        if (nicheRect.top > slot.y && nicheRect.top < slotBottom)
          tileCuts.push({ type: 'horizontal', positionCm: nicheRect.top - slot.y });
        if (nicheRect.bottom > slot.y && nicheRect.bottom < slotBottom)
          tileCuts.push({ type: 'horizontal', positionCm: nicheRect.bottom - slot.y });
      } else {
        const edgePiece = pieces[placement.pieceId];
        const edgeTileId = edgePiece
          ? edgePiece.sourceTileId
          : placement.pieceId;
        cspieces.push({
          label: `${edgeTileId}-A`,
          width: slot.w,
          height: slot.h,
          placement: `${wall.name}, Row ${row + 1}, Col ${col + 1}`,
          cutDesc: buildEdgeCutDescription(slot),
          centerX: slot.w / 2,
          centerY: slot.h / 2,
        });
        if (isPartialW) {
          tileCuts.push({ type: 'vertical', positionCm: slot.w });
          cspieces.push({
            label: `${edgeTileId}-B`,
            width: grid.tw - slot.w,
            height: isPartialH ? slot.h : grid.th,
            placement: 'Offcut',
            cutDesc: `Vertical cut at ${slot.w.toFixed(1)}cm`,
            centerX: slot.w + (grid.tw - slot.w) / 2,
            centerY: slot.h / 2,
          });
        }
        if (isPartialH) {
          tileCuts.push({ type: 'horizontal', positionCm: slot.h });
          const offcutLabel =
            cspieces.length >= 2
              ? `${edgeTileId}-C`
              : `${edgeTileId}-B`;
          cspieces.push({
            label: offcutLabel,
            width: isPartialW ? slot.w : grid.tw,
            height: grid.th - slot.h,
            placement: 'Offcut',
            cutDesc: `Horizontal cut at ${slot.h.toFixed(1)}cm`,
            centerX: slot.w / 2,
            centerY: slot.h + (grid.th - slot.h) / 2,
          });
        }
      }

      cuts.push({
        tileId: placement.pieceId,
        wallId: wall.id,
        wallName: wall.name,
        pieces: cspieces,
        tileCuts,
        waste: computeWaste(
          cspieces,
          grid.tw,
          grid.th
        ),
      });
    }

    // Niche surface tiles
    if (wall.nicheTiles && wall.niche) {
      const nicheSurfaces: {
        key: NicheSurfaceKey;
        w: number;
        h: number;
      }[] = [
        { key: 'back', w: wall.niche.width, h: wall.niche.height },
        { key: 'left', w: wall.niche.depth, h: wall.niche.height },
        { key: 'right', w: wall.niche.depth, h: wall.niche.height },
        { key: 'top', w: wall.niche.width, h: wall.niche.depth },
        { key: 'bottom', w: wall.niche.width, h: wall.niche.depth },
      ];

      for (const surface of nicheSurfaces) {
        const virtualWall = {
          width: surface.w,
          height: surface.h,
          niche: null,
          remainderH: 'split' as const,
          remainderV: 'split' as const,
          tiles: wall.nicheTiles[surface.key] || {},
        };
        const surfaceGrid = computeGrid(virtualWall, orientation);
        for (const [key, placement] of Object.entries(virtualWall.tiles)) {
          const [row, col] = key.split(',').map(Number);
          const slot = surfaceGrid.slots.find(
            (s) => s.row === row && s.col === col
          );
          if (!slot || (!slot.isPartialW && !slot.isPartialH)) continue;
          const tileCuts: CutSheetTileCut[] = [];
          if (slot.isPartialW)
            tileCuts.push({ type: 'vertical', positionCm: slot.w });
          if (slot.isPartialH)
            tileCuts.push({ type: 'horizontal', positionCm: slot.h });
          const nicheSurfacePiece = pieces[placement.pieceId];
          const nicheSurfaceTileId = nicheSurfacePiece
            ? nicheSurfacePiece.sourceTileId
            : placement.pieceId;
          cuts.push({
            tileId: placement.pieceId,
            wallId: wall.id,
            wallName: `${wall.name} - niche ${surface.key}`,
            pieces: [
              {
                label: `${nicheSurfaceTileId}-A`,
                width: slot.w,
                height: slot.h,
                placement: `${wall.name}, niche ${surface.key}`,
                cutDesc: buildEdgeCutDescription(slot),
                centerX: slot.w / 2,
                centerY: slot.h / 2,
              },
            ],
            tileCuts,
            waste: computeWaste(
              [{ width: slot.w, height: slot.h }],
              surfaceGrid.tw,
              surfaceGrid.th
            ),
          });
        }
      }
    }
  }

  return cuts;
}
