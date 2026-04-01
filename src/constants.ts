import type { Wall } from './store/types';

export const TILE_COUNT = 18;
export const TILE_W = 60;  // portrait width in cm
export const TILE_H = 120; // portrait height in cm
export const GROUT = 0.2;  // 2mm in cm
export const STORAGE_KEY = 'tile-planner-state';

export const DEFAULT_WALLS: Wall[] = [
  {
    id: 'wall-1',
    name: 'Wall 1',
    width: 75,
    height: 267,
    niche: null,
    remainderH: 'split',
    remainderV: 'bottom',
    tiles: {},
  },
  {
    id: 'wall-2',
    name: 'Wall 2',
    width: 179,
    height: 267,
    niche: null,
    remainderH: 'split',
    remainderV: 'bottom',
    tiles: {},
  },
  {
    id: 'wall-3',
    name: 'Wall 3',
    width: 95,
    height: 267,
    niche: {
      width: 45,
      height: 45,
      depth: 15,
      fromFloor: 125,
      fromLeft: 25,
    },
    remainderH: 'split',
    remainderV: 'bottom',
    tiles: {},
    nicheTiles: { back: {}, left: {}, right: {}, top: {}, bottom: {} },
  },
];
