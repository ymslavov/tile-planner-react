import { useStore } from '../../store';
import { getPlacedPieceIds, getChildPieces } from '../../services/pieceHelpers';
import { PoolTile } from './PoolTile';
import { OffcutRow } from './OffcutRow';
import { TILE_COUNT } from '../../constants';
import styles from './TilePool.module.css';
import type { DragData } from '../../store/types';

export function TilePool() {
  const pieces = useStore((s) => s.pieces);
  const walls = useStore((s) => s.walls);
  const orientation = useStore((s) => s.orientation);
  const activeWallId = useStore((s) => s.activeWallId);
  const unplaceTile = useStore((s) => s.unplaceTile);
  const unplaceNicheTile = useStore((s) => s.unplaceNicheTile);

  const placed = getPlacedPieceIds(walls);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data: DragData = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.source === 'wall') {
        unplaceTile(activeWallId, data.key);
      } else if (data.source === 'niche') {
        unplaceNicheTile(activeWallId, data.surfaceKey, data.key);
      }
    } catch {
      // ignore invalid drag data
    }
  };

  const tiles: React.ReactNode[] = [];
  for (let i = 1; i <= TILE_COUNT; i++) {
    const pieceId = String(i);
    const piece = pieces[pieceId];
    if (!piece) continue;

    const isPlaced = placed.has(pieceId);
    const wallInfo = isPlaced ? placed.get(pieceId)! : null;
    const wall = wallInfo ? walls.find((w) => w.id === wallInfo.wallId) : null;

    tiles.push(
      <PoolTile
        key={pieceId}
        pieceId={pieceId}
        tileNumber={i}
        orientation={orientation}
        isPlaced={isPlaced}
        wallName={wall?.name}
      />
    );

    // Render child offcuts below
    const children = getChildPieces(pieces, pieceId);
    if (children.length > 0) {
      tiles.push(
        <OffcutRow
          key={`offcuts-${pieceId}`}
          pieces={pieces}
          parentPieces={children}
          placed={placed}
          walls={walls}
          depth={1}
        />
      );
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Available Tiles</div>
      <div
        className={styles.pool}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {tiles}
      </div>
    </div>
  );
}
