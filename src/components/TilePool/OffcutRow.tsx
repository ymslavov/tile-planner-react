import { useEffect, useRef } from 'react';
import type { Piece, Wall, Orientation } from '../../store/types';
import { getChildPieces } from '../../services/pieceHelpers';
import { preloadTileImage, createPieceDragImage } from '../../services/dragImage';
import { OffcutThumbnail } from './OffcutThumbnail';
import styles from './OffcutRow.module.css';

interface OffcutRowProps {
  pieces: Record<string, Piece>;
  parentPieces: Piece[];
  placed: Map<string, { wallId: string; location: string }>;
  walls: Wall[];
  orientation: Orientation;
  depth: number;
  /** Scale (px per cm) — same scale as parent tile for proportional sizing */
  scale: number;
}

function OffcutItem({
  piece,
  placed,
  walls,
  orientation,
  pieces,
  depth,
  scale,
}: {
  piece: Piece;
  placed: Map<string, { wallId: string; location: string }>;
  walls: Wall[];
  orientation: Orientation;
  pieces: Record<string, Piece>;
  depth: number;
  scale: number;
}) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const isPlaced = placed.has(piece.id);
  const wallInfo = isPlaced ? placed.get(piece.id)! : null;
  const wall = wallInfo ? walls.find((w) => w.id === wallInfo.wallId) : null;
  const children = getChildPieces(pieces, piece.id);

  useEffect(() => {
    preloadTileImage(piece.sourceTileId);
  }, [piece.sourceTileId]);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ source: 'pool', tileId: piece.id })
    );
    e.dataTransfer.effectAllowed = 'move';

    // Drag image at the same scale as the thumbnail for consistency
    const dragW = Math.max(40, Math.min(200, piece.width * scale));
    const result = createPieceDragImage(piece, dragW);
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

  return (
    <div className={styles.offcutItem}>
      <div
        className={`${styles.content} ${isPlaced ? styles.placed : ''}`}
        draggable={!isPlaced}
        onDragStart={isPlaced ? undefined : handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.thumbWrap}>
          <OffcutThumbnail
            piece={piece}
            orientation={orientation}
            scale={scale}
          />
          <span className={styles.badge}>{piece.id}</span>
        </div>
        <div className={styles.meta}>
          <span className={styles.dims}>
            {piece.width.toFixed(1)}&times;{piece.height.toFixed(1)}
          </span>
          {isPlaced && wall && (
            <span className={styles.wallBadge}>{wall.name}</span>
          )}
        </div>
      </div>

      {children.length > 0 && (
        <div className={styles.childTree}>
          <OffcutRow
            pieces={pieces}
            parentPieces={children}
            placed={placed}
            walls={walls}
            orientation={orientation}
            depth={depth + 1}
            scale={scale}
          />
        </div>
      )}
    </div>
  );
}

export function OffcutRow({
  pieces,
  parentPieces,
  placed,
  walls,
  orientation,
  depth,
  scale,
}: OffcutRowProps) {
  return (
    <div className={styles.offcutList}>
      {parentPieces.map((piece) => (
        <OffcutItem
          key={piece.id}
          piece={piece}
          placed={placed}
          walls={walls}
          orientation={orientation}
          pieces={pieces}
          depth={depth}
          scale={scale}
        />
      ))}
    </div>
  );
}
