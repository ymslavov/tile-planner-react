import { create } from 'zustand';
import type {
  TilePlannerState,
  Orientation,
  NicheMode,
  Wall,
  NicheSurfaceKey,
  Niche,
} from './types';
import { DEFAULT_WALLS } from '../constants';
import { initPieces } from '../services/pieceHelpers';
import {
  createOffcuts,
  cascadeDelete,
  canPlacePiece,
} from '../services/offcutEngine';
import { computeGrid } from '../services/gridEngine';
import {
  loadState,
  saveState as persistState,
  exportJSON,
  importJSON,
} from '../services/persistence';
import { computeWrapAroundNicheTiles } from '../services/wrapAroundNiche';
import { getEffectiveDims } from '../services/pieceHelpers';

interface TilePlannerActions {
  // Initialization
  initialize: () => void;

  // Navigation
  setActiveWall: (wallId: string) => void;

  // Orientation & niche mode
  setOrientation: (orientation: Orientation) => void;
  setNicheMode: (mode: NicheMode) => void;

  // Wall management
  addWall: () => void;
  deleteWall: (wallId: string) => void;
  updateWallDimension: (wallId: string, field: 'width' | 'height', value: number) => void;
  setRemainderH: (wallId: string, mode: 'left' | 'right' | 'split') => void;
  setRemainderV: (wallId: string, mode: 'top' | 'bottom' | 'split') => void;

  // Niche
  toggleNiche: (wallId: string, enabled: boolean) => void;
  updateNiche: (wallId: string, field: keyof Niche, value: number) => void;
  centerNiche: (wallId: string) => void;

  // Tile placement
  placeTile: (wallId: string, slotKey: string, pieceId: string) => void;
  unplaceTile: (wallId: string, slotKey: string) => void;
  swapTiles: (wallId: string, fromKey: string, toKey: string) => void;
  rotatePlacement: (wallId: string, slotKey: string) => void;
  setOffsets: (wallId: string, slotKey: string, offsetX: number, offsetY: number) => void;

  // Niche surface placement
  placeNicheTile: (wallId: string, surfaceKey: NicheSurfaceKey, slotKey: string, pieceId: string) => void;
  unplaceNicheTile: (wallId: string, surfaceKey: NicheSurfaceKey, slotKey: string) => void;
  swapNicheTiles: (wallId: string, fromSurface: NicheSurfaceKey, fromKey: string, toSurface: NicheSurfaceKey, toKey: string) => void;

  // File operations
  doExportJSON: () => void;
  doImportJSON: () => Promise<void>;
  clearAll: () => void;

  // Toast
  showToast: (message: string) => void;
  removeToast: (id: string) => void;

  // Internal
  _save: () => void;
  _applyWrapAround: () => void;
}

type Store = TilePlannerState & TilePlannerActions;

const defaultState: TilePlannerState = {
  orientation: 'portrait',
  nicheMode: 'wrap-around',
  activeWallId: 'wall-1',
  pieces: initPieces('portrait'),
  walls: JSON.parse(JSON.stringify(DEFAULT_WALLS)),
  toasts: [],
};

export const useStore = create<Store>((set, get) => ({
  ...defaultState,

  initialize: () => {
    const saved = loadState();
    if (saved) {
      set({
        orientation: saved.orientation,
        nicheMode: saved.nicheMode,
        activeWallId: saved.activeWallId,
        pieces: saved.pieces,
        walls: saved.walls,
        toasts: [],
      });
    }
    // Apply wrap-around after load
    get()._applyWrapAround();
  },

  setActiveWall: (wallId) => {
    set({ activeWallId: wallId });
    get()._save();
  },

  setOrientation: (orientation) => {
    const state = get();
    // Clear all placements
    const clearedWalls = state.walls.map((w) => ({
      ...w,
      tiles: {},
      nicheTiles: w.nicheTiles
        ? { back: {}, left: {}, right: {}, top: {}, bottom: {} }
        : undefined,
    }));
    set({
      orientation,
      pieces: initPieces(orientation),
      walls: clearedWalls,
    });
    get()._save();
  },

  setNicheMode: (mode) => {
    set({ nicheMode: mode });
    get()._applyWrapAround();
    get()._save();
  },

  addWall: () => {
    const state = get();
    const id = `wall-${Date.now()}`;
    const newWall: Wall = {
      id,
      name: `Wall ${state.walls.length + 1}`,
      width: 100,
      height: 267,
      niche: null,
      remainderH: 'split',
      remainderV: 'bottom',
      tiles: {},
    };
    set({
      walls: [...state.walls, newWall],
      activeWallId: id,
    });
    get()._save();
  },

  deleteWall: (wallId) => {
    const state = get();
    if (state.walls.length <= 1) return;
    const idx = state.walls.findIndex((w) => w.id === wallId);
    const newWalls = state.walls.filter((w) => w.id !== wallId);
    const newActiveId =
      state.activeWallId === wallId
        ? newWalls[Math.max(0, idx - 1)].id
        : state.activeWallId;
    set({ walls: newWalls, activeWallId: newActiveId });
    get()._save();
  },

  updateWallDimension: (wallId, field, value) => {
    const state = get();
    const wallIdx = state.walls.findIndex((w) => w.id === wallId);
    if (wallIdx === -1) return;

    const newWalls = [...state.walls];
    const wall = { ...newWalls[wallIdx] };
    wall[field] = value;

    // Validate and clear invalid placements
    const grid = computeGrid(wall, state.orientation);
    const newTiles = { ...wall.tiles };
    let newPieces = { ...state.pieces };
    const toastMessages: string[] = [];

    for (const [key, placement] of Object.entries(newTiles)) {
      const [row, col] = key.split(',').map(Number);
      const slot = grid.slots.find((s) => s.row === row && s.col === col);
      if (!slot || !canPlacePiece(newPieces, placement.pieceId, slot.w, slot.h)) {
        // Cascade delete
        const result = cascadeDelete(newPieces, newWalls, placement.pieceId);
        newPieces = result.pieces;
        for (const r of result.removedPlacements) {
          toastMessages.push(`Piece ${r.pieceId} removed from ${r.wallName}`);
        }
        toastMessages.push(`Piece ${placement.pieceId} removed - no longer fits`);
        delete newTiles[key];
      }
    }
    wall.tiles = newTiles;
    newWalls[wallIdx] = wall;
    set({ walls: newWalls, pieces: newPieces });

    for (const msg of toastMessages) {
      get().showToast(msg);
    }
    get()._applyWrapAround();
    get()._save();
  },

  setRemainderH: (wallId, mode) => {
    const state = get();
    const newWalls = state.walls.map((w) =>
      w.id === wallId ? { ...w, remainderH: mode } : w
    );
    set({ walls: newWalls });
    get()._save();
  },

  setRemainderV: (wallId, mode) => {
    const state = get();
    const newWalls = state.walls.map((w) =>
      w.id === wallId ? { ...w, remainderV: mode } : w
    );
    set({ walls: newWalls });
    get()._save();
  },

  toggleNiche: (wallId, enabled) => {
    const state = get();
    const newWalls = state.walls.map((w) => {
      if (w.id !== wallId) return w;
      if (enabled) {
        return {
          ...w,
          niche: { width: 45, height: 45, depth: 15, fromFloor: 125, fromLeft: 25 },
          nicheTiles: { back: {}, left: {}, right: {}, top: {}, bottom: {} },
        };
      } else {
        const { nicheTiles: _nt, ...rest } = w;
        return { ...rest, niche: null };
      }
    });
    set({ walls: newWalls });
    get()._applyWrapAround();
    get()._save();
  },

  updateNiche: (wallId, field, value) => {
    const state = get();
    const newWalls = state.walls.map((w) => {
      if (w.id !== wallId || !w.niche) return w;
      return { ...w, niche: { ...w.niche, [field]: value } };
    });
    set({ walls: newWalls });
    get()._applyWrapAround();
    get()._save();
  },

  centerNiche: (wallId) => {
    const state = get();
    const wall = state.walls.find((w) => w.id === wallId);
    if (!wall || !wall.niche) return;
    const fromLeft = Math.round(((wall.width - wall.niche.width) / 2) * 10) / 10;
    const newWalls = state.walls.map((w) => {
      if (w.id !== wallId || !w.niche) return w;
      return { ...w, niche: { ...w.niche, fromLeft } };
    });
    set({ walls: newWalls });
    get()._applyWrapAround();
    get()._save();
  },

  placeTile: (wallId, slotKey, pieceId) => {
    const state = get();
    const wallIdx = state.walls.findIndex((w) => w.id === wallId);
    if (wallIdx === -1) return;

    const wall = state.walls[wallIdx];
    const grid = computeGrid(wall, state.orientation);
    const [row, col] = slotKey.split(',').map(Number);
    const slot = grid.slots.find((s) => s.row === row && s.col === col);
    if (!slot) return;

    // Validate
    if (!canPlacePiece(state.pieces, pieceId, slot.w, slot.h)) {
      get().showToast(`Piece ${pieceId} is too small for this slot`);
      return;
    }

    let newPieces = { ...state.pieces };
    let newWalls = [...state.walls];
    newWalls[wallIdx] = { ...wall, tiles: { ...wall.tiles } };

    // Remove existing piece from this slot
    const existing = newWalls[wallIdx].tiles[slotKey];
    if (existing) {
      const result = cascadeDelete(newPieces, newWalls, existing.pieceId);
      newPieces = result.pieces;
      newWalls = result.walls;
      for (const r of result.removedPlacements) {
        const surfaceLabel = r.surface ? ` (niche ${r.surface})` : '';
        get().showToast(`Piece ${r.pieceId} removed from ${r.wallName}${surfaceLabel}`);
      }
    }

    // Cascade-delete any stale offcuts from the piece being placed
    const staleResult = cascadeDelete(newPieces, newWalls, pieceId);
    newPieces = staleResult.pieces;
    newWalls = staleResult.walls;
    for (const r of staleResult.removedPlacements) {
      const surfaceLabel = r.surface ? ` (niche ${r.surface})` : '';
      get().showToast(`Piece ${r.pieceId} removed from ${r.wallName}${surfaceLabel}`);
    }

    // Place the piece
    const wIdx = newWalls.findIndex((w) => w.id === wallId);
    newWalls[wIdx] = {
      ...newWalls[wIdx],
      tiles: {
        ...newWalls[wIdx].tiles,
        [slotKey]: { pieceId, rotation: 0, offsetX: 0, offsetY: 0 },
      },
    };

    // Create offcuts
    const offcutResult = createOffcuts(newPieces, pieceId, slot.w, slot.h, 0, 0, 0);
    newPieces = offcutResult.pieces;

    set({ pieces: newPieces, walls: newWalls });
    get()._applyWrapAround();
    get()._save();
  },

  unplaceTile: (wallId, slotKey) => {
    const state = get();
    const wallIdx = state.walls.findIndex((w) => w.id === wallId);
    if (wallIdx === -1) return;

    const wall = state.walls[wallIdx];
    const placement = wall.tiles[slotKey];
    if (!placement) return;

    let newPieces = { ...state.pieces };
    let newWalls = [...state.walls];

    // Cascade-delete offcuts
    const result = cascadeDelete(newPieces, newWalls, placement.pieceId);
    newPieces = result.pieces;
    newWalls = result.walls;
    for (const r of result.removedPlacements) {
      const surfaceLabel = r.surface ? ` (niche ${r.surface})` : '';
      get().showToast(`Piece ${r.pieceId} removed from ${r.wallName}${surfaceLabel}`);
    }

    // Remove placement
    const wIdx = newWalls.findIndex((w) => w.id === wallId);
    const newTiles = { ...newWalls[wIdx].tiles };
    delete newTiles[slotKey];
    newWalls[wIdx] = { ...newWalls[wIdx], tiles: newTiles };

    set({ pieces: newPieces, walls: newWalls });
    get()._applyWrapAround();
    get()._save();
  },

  swapTiles: (wallId, fromKey, toKey) => {
    const state = get();
    const wallIdx = state.walls.findIndex((w) => w.id === wallId);
    if (wallIdx === -1) return;

    const wall = state.walls[wallIdx];
    const grid = computeGrid(wall, state.orientation);
    const fromPlacement = wall.tiles[fromKey];
    const toPlacement = wall.tiles[toKey];

    let newPieces = { ...state.pieces };
    let newWalls = [...state.walls];

    // Cascade-delete offcuts for both
    if (fromPlacement) {
      const r1 = cascadeDelete(newPieces, newWalls, fromPlacement.pieceId);
      newPieces = r1.pieces;
      newWalls = r1.walls;
      for (const r of r1.removedPlacements) {
        const surfaceLabel = r.surface ? ` (niche ${r.surface})` : '';
        get().showToast(`Piece ${r.pieceId} removed from ${r.wallName}${surfaceLabel}`);
      }
    }
    if (toPlacement) {
      const r2 = cascadeDelete(newPieces, newWalls, toPlacement.pieceId);
      newPieces = r2.pieces;
      newWalls = r2.walls;
      for (const r of r2.removedPlacements) {
        const surfaceLabel = r.surface ? ` (niche ${r.surface})` : '';
        get().showToast(`Piece ${r.pieceId} removed from ${r.wallName}${surfaceLabel}`);
      }
    }

    // Perform swap
    const wIdx = newWalls.findIndex((w) => w.id === wallId);
    const newTiles = { ...newWalls[wIdx].tiles };
    if (fromPlacement) {
      newTiles[toKey] = fromPlacement;
    }
    if (toPlacement) {
      newTiles[fromKey] = toPlacement;
    } else {
      delete newTiles[fromKey];
    }
    newWalls[wIdx] = { ...newWalls[wIdx], tiles: newTiles };

    // Recreate offcuts
    const [fromRow, fromCol] = fromKey.split(',').map(Number);
    const fromSlot = grid.slots.find(
      (s) => s.row === fromRow && s.col === fromCol
    );
    const [toRow, toCol] = toKey.split(',').map(Number);
    const toSlot = grid.slots.find(
      (s) => s.row === toRow && s.col === toCol
    );

    if (toPlacement && fromSlot) {
      const r = createOffcuts(
        newPieces,
        toPlacement.pieceId,
        fromSlot.w,
        fromSlot.h,
        toPlacement.rotation || 0,
        toPlacement.offsetX ?? 0,
        toPlacement.offsetY ?? 0,
      );
      newPieces = r.pieces;
    }
    if (fromPlacement && toSlot) {
      const r = createOffcuts(
        newPieces,
        fromPlacement.pieceId,
        toSlot.w,
        toSlot.h,
        fromPlacement.rotation || 0,
        fromPlacement.offsetX ?? 0,
        fromPlacement.offsetY ?? 0,
      );
      newPieces = r.pieces;
    }

    set({ pieces: newPieces, walls: newWalls });
    get()._applyWrapAround();
    get()._save();
  },

  rotatePlacement: (wallId, slotKey) => {
    const state = get();
    const wallIdx = state.walls.findIndex((w) => w.id === wallId);
    if (wallIdx === -1) return;

    const wall = state.walls[wallIdx];
    const placement = wall.tiles[slotKey];
    if (!placement) return;

    const piece = state.pieces[placement.pieceId];
    if (!piece) return;

    const grid = computeGrid(wall, state.orientation);
    const [row, col] = slotKey.split(',').map(Number);
    const slot = grid.slots.find((s) => s.row === row && s.col === col);
    if (!slot) return;

    const currentRotation = placement.rotation || 0;
    const rotations = [0, 90, 180, 270];
    let nextRotation = currentRotation;
    for (let i = 1; i <= 4; i++) {
      const candidate = rotations[(rotations.indexOf(currentRotation) + i) % 4];
      const eff = getEffectiveDims(piece, candidate);
      if (eff.w >= slot.w - 0.01 && eff.h >= slot.h - 0.01) {
        nextRotation = candidate;
        break;
      }
    }
    if (nextRotation === currentRotation) return;

    let newPieces = { ...state.pieces };
    let newWalls = [...state.walls];

    // Cascade-delete children
    const result = cascadeDelete(newPieces, newWalls, placement.pieceId);
    newPieces = result.pieces;
    newWalls = result.walls;
    for (const r of result.removedPlacements) {
      const surfaceLabel = r.surface ? ` (niche ${r.surface})` : '';
      get().showToast(`Piece ${r.pieceId} removed from ${r.wallName}${surfaceLabel}`);
    }

    // Update rotation
    const wIdx = newWalls.findIndex((w) => w.id === wallId);
    newWalls[wIdx] = {
      ...newWalls[wIdx],
      tiles: {
        ...newWalls[wIdx].tiles,
        [slotKey]: {
          pieceId: placement.pieceId,
          rotation: nextRotation,
          offsetX: placement.offsetX ?? 0,
          offsetY: placement.offsetY ?? 0,
        },
      },
    };

    // Create new offcuts
    const offcutResult = createOffcuts(
      newPieces,
      placement.pieceId,
      slot.w,
      slot.h,
      nextRotation,
      placement.offsetX ?? 0,
      placement.offsetY ?? 0,
    );
    newPieces = offcutResult.pieces;

    set({ pieces: newPieces, walls: newWalls });
    get()._applyWrapAround();
    get()._save();
  },

  setOffsets: (wallId, slotKey, offsetX, offsetY) => {
    const state = get();
    const wallIdx = state.walls.findIndex((w) => w.id === wallId);
    if (wallIdx === -1) return;

    const wall = state.walls[wallIdx];
    const placement = wall.tiles[slotKey];
    if (!placement) return;

    const piece = state.pieces[placement.pieceId];
    if (!piece) return;

    const grid = computeGrid(wall, state.orientation);
    const [row, col] = slotKey.split(',').map(Number);
    const slot = grid.slots.find((s) => s.row === row && s.col === col);
    if (!slot) return;

    const eff = getEffectiveDims(piece, placement.rotation || 0);
    // Clamp offsets to valid range: [slotW - effW, 0] for X, [slotH - effH, 0] for Y
    const clampedX = Math.min(0, Math.max(slot.w - eff.w, offsetX));
    const clampedY = Math.min(0, Math.max(slot.h - eff.h, offsetY));

    let newPieces = { ...state.pieces };
    let newWalls = [...state.walls];

    // Cascade-delete children
    const result = cascadeDelete(newPieces, newWalls, placement.pieceId);
    newPieces = result.pieces;
    newWalls = result.walls;
    for (const r of result.removedPlacements) {
      const surfaceLabel = r.surface ? ` (niche ${r.surface})` : '';
      get().showToast(`Piece ${r.pieceId} removed from ${r.wallName}${surfaceLabel}`);
    }

    // Update offsets
    const wIdx = newWalls.findIndex((w) => w.id === wallId);
    newWalls[wIdx] = {
      ...newWalls[wIdx],
      tiles: {
        ...newWalls[wIdx].tiles,
        [slotKey]: {
          pieceId: placement.pieceId,
          rotation: placement.rotation || 0,
          offsetX: clampedX,
          offsetY: clampedY,
        },
      },
    };

    // Create new offcuts
    const offcutResult = createOffcuts(
      newPieces,
      placement.pieceId,
      slot.w,
      slot.h,
      placement.rotation || 0,
      clampedX,
      clampedY,
    );
    newPieces = offcutResult.pieces;

    set({ pieces: newPieces, walls: newWalls });
    get()._applyWrapAround();
    get()._save();
  },

  placeNicheTile: (wallId, surfaceKey, slotKey, pieceId) => {
    const state = get();
    const newWalls = state.walls.map((w) => {
      if (w.id !== wallId || !w.nicheTiles) return w;
      return {
        ...w,
        nicheTiles: {
          ...w.nicheTiles,
          [surfaceKey]: {
            ...w.nicheTiles[surfaceKey],
            [slotKey]: { pieceId, rotation: 0, offsetX: 0, offsetY: 0 },
          },
        },
      };
    });
    set({ walls: newWalls });
    get()._save();
  },

  unplaceNicheTile: (wallId, surfaceKey, slotKey) => {
    const state = get();
    const wall = state.walls.find((w) => w.id === wallId);
    if (!wall?.nicheTiles) return;
    const placement = wall.nicheTiles[surfaceKey][slotKey];
    if (!placement) return;

    let newPieces = { ...state.pieces };
    let newWalls = [...state.walls];

    const result = cascadeDelete(newPieces, newWalls, placement.pieceId);
    newPieces = result.pieces;
    newWalls = result.walls;
    for (const r of result.removedPlacements) {
      get().showToast(`Piece ${r.pieceId} removed from ${r.wallName}`);
    }

    const wIdx = newWalls.findIndex((w) => w.id === wallId);
    if (newWalls[wIdx].nicheTiles) {
      const newSurface = { ...newWalls[wIdx].nicheTiles![surfaceKey] };
      delete newSurface[slotKey];
      newWalls[wIdx] = {
        ...newWalls[wIdx],
        nicheTiles: {
          ...newWalls[wIdx].nicheTiles!,
          [surfaceKey]: newSurface,
        },
      };
    }

    set({ pieces: newPieces, walls: newWalls });
    get()._save();
  },

  swapNicheTiles: (wallId, fromSurface, fromKey, toSurface, toKey) => {
    const state = get();
    const wall = state.walls.find((w) => w.id === wallId);
    if (!wall?.nicheTiles) return;

    const fromTile = wall.nicheTiles[fromSurface][fromKey];
    const toTile = wall.nicheTiles[toSurface][toKey];

    const newWalls = state.walls.map((w) => {
      if (w.id !== wallId || !w.nicheTiles) return w;
      const nt = { ...w.nicheTiles };
      nt[toSurface] = { ...nt[toSurface], [toKey]: fromTile };
      if (toTile) {
        nt[fromSurface] = { ...nt[fromSurface], [fromKey]: toTile };
      } else {
        nt[fromSurface] = { ...nt[fromSurface] };
        delete nt[fromSurface][fromKey];
      }
      return { ...w, nicheTiles: nt };
    });
    set({ walls: newWalls });
    get()._save();
  },

  doExportJSON: () => {
    const state = get();
    exportJSON({
      orientation: state.orientation,
      nicheMode: state.nicheMode,
      activeWallId: state.activeWallId,
      pieces: state.pieces,
      walls: state.walls,
      toasts: [],
    });
  },

  doImportJSON: async () => {
    const result = await importJSON();
    if (result) {
      set({
        orientation: result.orientation,
        nicheMode: result.nicheMode,
        activeWallId: result.activeWallId,
        pieces: result.pieces,
        walls: result.walls,
      });
      get()._applyWrapAround();
      get()._save();
    }
  },

  clearAll: () => {
    const state = get();
    const clearedWalls = state.walls.map((w) => ({
      ...w,
      tiles: {},
      nicheTiles: w.nicheTiles
        ? { back: {}, left: {}, right: {}, top: {}, bottom: {} }
        : undefined,
    }));
    set({
      pieces: initPieces(state.orientation),
      walls: clearedWalls,
    });
    get()._save();
  },

  showToast: (message) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set((state) => ({
      toasts: [...state.toasts, { id, message }],
    }));
    setTimeout(() => {
      get().removeToast(id);
    }, 3000);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  _save: () => {
    const state = get();
    persistState({
      orientation: state.orientation,
      nicheMode: state.nicheMode,
      activeWallId: state.activeWallId,
      pieces: state.pieces,
      walls: state.walls,
      toasts: [],
    });
  },

  _applyWrapAround: () => {
    const state = get();
    if (state.nicheMode !== 'wrap-around') return;

    let newPieces = { ...state.pieces };
    const newWalls = state.walls.map((w) => {
      if (!w.niche) return w;
      const result = computeWrapAroundNicheTiles(w, newPieces, state.orientation);
      newPieces = result.pieces;
      return result.wall;
    });

    set({ walls: newWalls, pieces: newPieces });
  },
}));
