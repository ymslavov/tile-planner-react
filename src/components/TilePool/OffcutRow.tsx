import type { Piece, Wall, Orientation } from '../../store/types';
import { getChildPieces } from '../../services/pieceHelpers';
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

const MAX_THUMB_HEIGHT = 50;

export function OffcutRow({
  pieces,
  parentPieces,
  placed,
  walls,
  orientation,
  depth,
}: OffcutRowProps) {
  const rows: React.ReactNode[] = [];

  for (const piece of parentPieces) {
    const isPlaced = placed.has(piece.id);
    const wallInfo = isPlaced ? placed.get(piece.id)! : null;
    const wall = wallInfo ? walls.find((w) => w.id === wallInfo.wallId) : null;
    const children = getChildPieces(pieces, piece.id);

    const handleDragStart = (e: React.DragEvent) => {
      e.dataTransfer.setData(
        'text/plain',
        JSON.stringify({ source: 'pool', tileId: piece.id })
      );
      e.dataTransfer.effectAllowed = 'move';
    };

    rows.push(
      <div key={piece.id} className={styles.offcutItem}>
        <div
          className={`${styles.content} ${isPlaced ? styles.placed : ''}`}
          draggable={!isPlaced}
          onDragStart={isPlaced ? undefined : handleDragStart}
        >
          <div className={styles.thumbWrap}>
            <OffcutThumbnail
              piece={piece}
              orientation={orientation}
              maxHeight={MAX_THUMB_HEIGHT}
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

  return <div className={styles.offcutList}>{rows}</div>;
}
