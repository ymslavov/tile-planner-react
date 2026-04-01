import { useState } from 'react';
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

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  const toggleCollapsed = (pieceId: string) => {
    setCollapsed((prev) => ({ ...prev, [pieceId]: !prev[pieceId] }));
  };

  const families: React.ReactNode[] = [];
  for (let i = 1; i <= TILE_COUNT; i++) {
    const pieceId = String(i);
    const piece = pieces[pieceId];
    if (!piece) continue;

    const isPlaced = placed.has(pieceId);
    const wallInfo = isPlaced ? placed.get(pieceId)! : null;
    const wall = wallInfo ? walls.find((w) => w.id === wallInfo.wallId) : null;
    const children = getChildPieces(pieces, pieceId);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsed[pieceId] ?? false;

    families.push(
      <div
        key={pieceId}
        className={`${styles.family} ${hasChildren ? styles.hasChildren : ''}`}
      >
        <div className={styles.parentRow}>
          <PoolTile
            pieceId={pieceId}
            tileNumber={i}
            orientation={orientation}
            isPlaced={isPlaced}
            wallName={wall?.name}
          />
          {hasChildren && (
            <button
              className={styles.collapseBtn}
              onClick={() => toggleCollapsed(pieceId)}
              title={isCollapsed ? 'Expand offcuts' : 'Collapse offcuts'}
            >
              {isCollapsed ? '\u25B6' : '\u25BC'}
            </button>
          )}
        </div>
        {hasChildren && !isCollapsed && (
          <div className={styles.offcutTree}>
            <OffcutRow
              pieces={pieces}
              parentPieces={children}
              placed={placed}
              walls={walls}
              orientation={orientation}
              depth={1}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Available Tiles</div>
      <div
        className={styles.pool}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {families}
      </div>
    </div>
  );
}
