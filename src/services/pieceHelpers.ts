import type {
  Piece,
  Orientation,
  Wall,
  NicheSurfaceKey,
} from '../store/types';
import { TILE_COUNT, TILE_W, TILE_H } from '../constants';

export function getTileW(orientation: Orientation): number {
  return orientation === 'portrait' ? TILE_W : TILE_H;
}

export function getTileH(orientation: Orientation): number {
  return orientation === 'portrait' ? TILE_H : TILE_W;
}

export function initPieces(orientation: Orientation): Record<string, Piece> {
  const pieces: Record<string, Piece> = {};
  const tw = getTileW(orientation);
  const th = getTileH(orientation);
  for (let i = 1; i <= TILE_COUNT; i++) {
    const id = String(i);
    pieces[id] = {
      id,
      sourceTileId: i,
      parentId: null,
      width: tw,
      height: th,
      geometry: { boundingBox: { w: tw, h: th }, cutouts: [] },
      imageRegion: { x: 0, y: 0, w: tw, h: th },
    };
  }
  return pieces;
}

export function getEffectiveDims(
  piece: Piece,
  rotation: number
): { w: number; h: number } {
  const r = (rotation || 0) % 360;
  if (r === 90 || r === 270) return { w: piece.height, h: piece.width };
  return { w: piece.width, h: piece.height };
}

export function getChildPieces(
  pieces: Record<string, Piece>,
  pieceId: string
): Piece[] {
  return Object.values(pieces).filter((p) => p.parentId === pieceId);
}

export function getAllDescendants(
  pieces: Record<string, Piece>,
  pieceId: string
): string[] {
  const result: string[] = [];
  const queue = getChildPieces(pieces, pieceId).map((p) => p.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    getChildPieces(pieces, id).forEach((p) => queue.push(p.id));
  }
  return result;
}

export function getPiecePlacement(
  walls: Wall[],
  pieceId: string
): { wall: Wall; key: string; surface: NicheSurfaceKey | null } | null {
  for (const wall of walls) {
    for (const [key, pl] of Object.entries(wall.tiles)) {
      if (pl.pieceId === pieceId) return { wall, key, surface: null };
    }
    if (wall.nicheTiles) {
      for (const [surface, tiles] of Object.entries(wall.nicheTiles)) {
        for (const [key, pl] of Object.entries(tiles)) {
          if (pl.pieceId === pieceId)
            return { wall, key, surface: surface as NicheSurfaceKey };
        }
      }
    }
  }
  return null;
}

export function getPlacedPieceIds(
  walls: Wall[]
): Map<string, { wallId: string; location: string }> {
  const map = new Map<string, { wallId: string; location: string }>();
  for (const wall of walls) {
    for (const [pos, pl] of Object.entries(wall.tiles)) {
      map.set(pl.pieceId, { wallId: wall.id, location: pos });
    }
    if (wall.nicheTiles) {
      for (const [surface, tiles] of Object.entries(wall.nicheTiles)) {
        for (const [pos, pl] of Object.entries(tiles)) {
          map.set(pl.pieceId, {
            wallId: wall.id,
            location: `niche-${surface}-${pos}`,
          });
        }
      }
    }
  }
  return map;
}

export function getUnplacedPieceIds(
  pieces: Record<string, Piece>,
  walls: Wall[]
): string[] {
  const placed = getPlacedPieceIds(walls);
  return Object.keys(pieces).filter((id) => !placed.has(id));
}
