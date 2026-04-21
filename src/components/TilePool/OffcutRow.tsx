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
}

// Drag-image target width for offcut pieces
const OFFCUT_DRAG_WIDTH = 80;

function OffcutItem({
  piece,
  placed,
  walls,
  orientation,
  pieces,
  depth,
}: {
  piece: Piece;
  placed: Map<string, { wallId: string; location: string }>;
  walls: Wall[];
  orientation: Orientation;
  pieces: Record<string, Piece>;
  depth: number;
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

    const result = createPieceDragImage(piece, OFFCUT_DRAG_WIDTH);
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
            maxHeight={50}
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
        />
      ))}
    </div>
  );
}
