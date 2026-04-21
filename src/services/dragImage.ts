import type { Piece } from '../store/types';
import { TILE_W, TILE_H } from '../constants';

// Module-level cache: sourceTileId → HTMLImageElement
const imageCache = new Map<number, HTMLImageElement>();
const imageLoading = new Map<number, Promise<HTMLImageElement>>();

/**
 * Load an image and cache it. Returns the cached image immediately if available.
 */
function loadImage(src: string, tileId: number): Promise<HTMLImageElement> {
  const cached = imageCache.get(tileId);
  if (cached) return Promise.resolve(cached);

  const existing = imageLoading.get(tileId);
  if (existing) return existing;

  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(tileId, img);
      imageLoading.delete(tileId);
      resolve(img);
    };
    img.onerror = () => {
      imageLoading.delete(tileId);
      reject(new Error(`Failed to load tile image: ${src}`));
    };
    img.src = src;
  });

  imageLoading.set(tileId, p);
  return p;
}

/**
 * Preload a tile image into the cache. Call this on component mount.
 * Safe to call multiple times — subsequent calls are no-ops if already cached.
 */
export function preloadTileImage(tileId: number): void {
  if (imageCache.has(tileId) || imageLoading.has(tileId)) return;
  loadImage(`/tiles/${tileId}.jpg`, tileId).catch(() => {
    // Ignore errors during preload — setDragImage will just skip
  });
}

/**
 * Create a canvas element showing the piece's physical shape (bounding box
 * with cutouts masked via evenodd clip), textured with the tile's marble image.
 *
 * Must be called SYNCHRONOUSLY inside a dragstart handler — the tile image
 * must already be in the cache via preloadTileImage().
 *
 * @param piece       The piece to render
 * @param targetWidth Max pixel width for the drag image canvas
 * @returns { canvas, cleanup } or null if the image isn't cached yet
 */
export function createPieceDragImage(
  piece: Piece,
  targetWidth: number,
): { canvas: HTMLCanvasElement; cleanup: () => void } | null {
  const img = imageCache.get(piece.sourceTileId);
  if (!img) return null;

  // Scale piece dimensions to fit targetWidth
  const scale = targetWidth / piece.width;
  const canvasW = Math.round(piece.width * scale);
  const canvasH = Math.round(piece.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Build clip path: outer bounding box, then cutouts with evenodd rule
  ctx.beginPath();
  ctx.rect(0, 0, canvasW, canvasH);
  for (const cut of piece.geometry.cutouts) {
    // Add cutout rect in reverse winding so evenodd makes it transparent
    ctx.rect(cut.x * scale, cut.y * scale, cut.w * scale, cut.h * scale);
  }
  ctx.clip('evenodd');

  // Determine how the tile image maps to this piece
  // The source JPG is always in portrait orientation: TILE_W × TILE_H
  const imgScaleX = img.naturalWidth / TILE_W;
  const imgScaleY = img.naturalHeight / TILE_H;

  const ir = piece.imageRegion;
  // Source rect in image pixels
  const sx = ir.x * imgScaleX;
  const sy = ir.y * imgScaleY;
  const sw = ir.w * imgScaleX;
  const sh = ir.h * imgScaleY;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvasW, canvasH);

  // Add a subtle border
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Attach off-screen so setDragImage works in all browsers
  canvas.style.cssText = 'position:fixed;top:-2000px;left:-2000px;pointer-events:none;';
  document.body.appendChild(canvas);

  const cleanup = () => {
    // Delay removal slightly — Firefox reads the canvas after dragstart returns
    setTimeout(() => {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }, 0);
  };

  return { canvas, cleanup };
}
