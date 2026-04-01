import type { Piece, Wall } from '../../store/types';
import { getChildPieces } from '../../services/pieceHelpers';
import styles from './OffcutRow.module.css';

interface OffcutRowProps {
  pieces: Record<string, Piece>;
  parentPieces: Piece[];
  placed: Map<string, { wallId: string; location: string }>;
  walls: Wall[];
  depth: number;
}

export function OffcutRow({
  pieces,
  parentPieces,
  placed,
  walls,
  depth,
}: OffcutRowProps) {
  const rows: React.ReactNode[] = [];

  for (const piece of parentPieces) {
    const isPlaced = placed.has(piece.id);
    const wallInfo = isPlaced ? placed.get(piece.id)! : null;
    const wall = wallInfo ? walls.find((w) => w.id === wallInfo.wallId) : null;
    const depthClass = depth <= 1 ? styles.depth1 : styles.depth2;

    const handleDragStart = (e: React.DragEvent) => {
      e.dataTransfer.setData(
        'text/plain',
        JSON.stringify({ source: 'pool', tileId: piece.id })
      );
      e.dataTransfer.effectAllowed = 'move';
    };

    rows.push(
      <div
        key={piece.id}
        className={`${styles.row} ${depthClass} ${isPlaced ? styles.placed : ''}`}
        draggable={!isPlaced}
        onDragStart={isPlaced ? undefined : handleDragStart}
      >
        <span className={styles.indent}>
          {depth <= 1 ? '\u2514 ' : '  \u2514 '}
        </span>
        <span className={styles.info}>
          {piece.id} [{piece.width.toFixed(1)}&times;{piece.height.toFixed(1)}]
        </span>
        {isPlaced && wall && (
          <span className={styles.wallLabel}> &mdash; {wall.name}</span>
        )}
      </div>
    );

    // Render children recursively
    const children = getChildPieces(pieces, piece.id);
    if (children.length > 0) {
      rows.push(
        <OffcutRow
          key={`offcuts-${piece.id}`}
          pieces={pieces}
          parentPieces={children}
          placed={placed}
          walls={walls}
          depth={depth + 1}
        />
      );
    }
  }

  return <>{rows}</>;
}
