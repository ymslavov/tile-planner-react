import type { Orientation } from '../../store/types';
import styles from './PoolTile.module.css';

interface PoolTileProps {
  pieceId: string;
  tileNumber: number;
  orientation: Orientation;
  isPlaced: boolean;
  wallName?: string;
}

export function PoolTile({
  pieceId,
  tileNumber,
  orientation,
  isPlaced,
  wallName,
}: PoolTileProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ source: 'pool', tileId: pieceId })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  const aspectClass = orientation === 'portrait' ? styles.portrait : styles.landscape;

  return (
    <div
      className={`${styles.tile} ${aspectClass} ${isPlaced ? styles.placed : ''}`}
      draggable={!isPlaced}
      onDragStart={isPlaced ? undefined : handleDragStart}
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
