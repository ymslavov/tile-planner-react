import { useEffect, useRef } from 'react';
import type { Orientation } from '../../store/types';
import { preloadTileImage, createPieceDragImage } from '../../services/dragImage';
import styles from './PoolTile.module.css';

interface PoolTileProps {
  pieceId: string;
  tileNumber: number;
  orientation: Orientation;
  isPlaced: boolean;
  wallName?: string;
  /** Width of the tile thumbnail in px — drives drag image size */
  thumbWidth?: number;
}

export function PoolTile({
  pieceId,
  tileNumber,
  orientation,
  isPlaced,
  wallName,
  thumbWidth = 50,
}: PoolTileProps) {
  const cleanupRef = useRef<(() => void) | null>(null);

  // Preload the tile image so it's ready for synchronous use in dragstart
  useEffect(() => {
    preloadTileImage(tileNumber);
  }, [tileNumber]);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ source: 'pool', tileId: pieceId })
    );
    e.dataTransfer.effectAllowed = 'move';

    // Build a Piece-like object for the full tile (no cutouts)
    const isPortrait = orientation === 'portrait';
    const tw = 60;
    const th = 120;
    const w = isPortrait ? tw : th;
    const h = isPortrait ? th : tw;

    const piece = {
      id: pieceId,
      sourceTileId: tileNumber,
      parentId: null as null,
      width: w,
      height: h,
      geometry: { boundingBox: { w, h }, cutouts: [] as never[] },
      imageRegion: { x: 0, y: 0, w: tw, h: th },
    };

    const result = createPieceDragImage(piece, thumbWidth * 2);
    if (result) {
      e.dataTransfer.setDragImage(result.canvas, result.canvas.width / 2, result.canvas.height / 2);
      cleanupRef.current = result.cleanup;
    }
  };

  const handleDragEnd = () => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  };

  // Portrait tiles are 60×120 cm (1:2 ratio). Landscape is 120×60 (2:1).
  const thumbH = orientation === 'portrait' ? thumbWidth * 2 : thumbWidth / 2;

  return (
    <div
      className={`${styles.tile} ${isPlaced ? styles.placed : ''}`}
      style={{ width: thumbWidth, height: thumbH }}
      draggable={!isPlaced}
      onDragStart={isPlaced ? undefined : handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <img
        src={`/tiles/${tileNumber}.jpg`}
        alt={`Tile ${tileNumber}`}
        className={styles.img}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <span className={styles.label}>{tileNumber}</span>
      {isPlaced && wallName && (
        <span className={styles.wallLabel}>{wallName}</span>
      )}
    </div>
  );
}
