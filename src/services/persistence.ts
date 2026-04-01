import type { TilePlannerState, Wall } from '../store/types';
import { STORAGE_KEY } from '../constants';
import { getTileW, getTileH, initPieces } from './pieceHelpers';

interface OldPlacement {
  tileId?: number;
  pieceId?: string;
  rotation?: number;
  anchor?: string;
}

/**
 * Migrate old-format state (tileId-based) to new format (pieceId-based).
 */
export function migrateState(s: TilePlannerState): void {
  if (s.pieces && Object.keys(s.pieces).length > 0) return;

  const tw = getTileW(s.orientation);
  const th = getTileH(s.orientation);
  s.pieces = {};
  for (let i = 1; i <= 18; i++) {
    s.pieces[String(i)] = {
      id: String(i),
      sourceTileId: i,
      parentId: null,
      width: tw,
      height: th,
      geometry: { boundingBox: { w: tw, h: th }, cutouts: [] },
      imageRegion: { x: 0, y: 0, w: tw, h: th },
    };
  }

  for (const wall of s.walls) {
    const newTiles: Record<string, { pieceId: string; rotation: number; anchor: string }> = {};
    for (const [key, placement] of Object.entries(wall.tiles)) {
      const pl = placement as unknown as OldPlacement;
      if (pl.tileId !== undefined) {
        newTiles[key] = {
          pieceId: String(pl.tileId),
          rotation: 0,
          anchor: 'top-left',
        };
      } else {
        newTiles[key] = placement as unknown as { pieceId: string; rotation: number; anchor: string };
      }
    }
    wall.tiles = newTiles as Wall['tiles'];

    if (wall.nicheTiles) {
      for (const [surface, tiles] of Object.entries(wall.nicheTiles)) {
        const newSurface: Record<string, { pieceId: string; rotation: number; anchor: string }> = {};
        for (const [key, placement] of Object.entries(tiles)) {
          const pl = placement as unknown as OldPlacement;
          if (pl.tileId !== undefined) {
            newSurface[key] = {
              pieceId: String(pl.tileId),
              rotation: 0,
              anchor: 'top-left',
            };
          } else {
            newSurface[key] = placement as unknown as { pieceId: string; rotation: number; anchor: string };
          }
        }
        (wall.nicheTiles as Record<string, typeof newSurface>)[surface] = newSurface;
      }
    }
  }
}

/**
 * Validate state for duplicate placements.
 */
export function validateState(s: TilePlannerState): boolean {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];

  for (const wall of s.walls) {
    for (const [pos, placement] of Object.entries(wall.tiles)) {
      if (seen.has(placement.pieceId)) {
        duplicates.push(placement.pieceId);
        delete wall.tiles[pos];
      }
      seen.set(placement.pieceId, wall.id);
    }
    if (wall.nicheTiles) {
      for (const [surface, tiles] of Object.entries(wall.nicheTiles)) {
        for (const [pos, placement] of Object.entries(tiles)) {
          if (seen.has(placement.pieceId)) {
            duplicates.push(placement.pieceId);
            delete (wall.nicheTiles as Record<string, Record<string, unknown>>)[
              surface
            ][pos];
          }
          seen.set(placement.pieceId, wall.id);
        }
      }
    }
  }

  if (duplicates.length > 0) {
    console.warn(
      `Duplicate placements found for: ${[...new Set(duplicates)].join(', ')}`
    );
  }
  return true;
}

/**
 * Load state from localStorage.
 */
export function loadState(): TilePlannerState | null {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved) as TilePlannerState;
    migrateState(parsed);
    validateState(parsed);

    // Ensure pieces exist
    if (!parsed.pieces || Object.keys(parsed.pieces).length === 0) {
      parsed.pieces = initPieces(parsed.orientation);
    }

    return parsed;
  } catch (e) {
    console.warn('Failed to load state:', e);
    return null;
  }
}

/**
 * Save state to localStorage.
 */
export function saveState(state: TilePlannerState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Export state as JSON file download.
 */
export function exportJSON(state: TilePlannerState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tile-layout.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Import state from a JSON file. Returns the parsed state or null.
 */
export function importJSON(): Promise<TilePlannerState | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(
            ev.target?.result as string
          ) as TilePlannerState;
          migrateState(parsed);
          validateState(parsed);
          if (!parsed.pieces || Object.keys(parsed.pieces).length === 0) {
            parsed.pieces = initPieces(parsed.orientation);
          }
          resolve(parsed);
        } catch (err) {
          alert('Invalid JSON file: ' + (err as Error).message);
          resolve(null);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
