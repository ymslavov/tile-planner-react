import type {
  Piece,
  Placement,
  Orientation,
  NicheSurfaceKey,
  DragData,
} from '../../store/types';
import { computeGrid } from '../../services/gridEngine';
import { useStore } from '../../store';
import styles from './NicheSurfaces.module.css';

interface SurfaceGridProps {
  surfaceKey: NicheSurfaceKey;
  surfaceW: number;
  surfaceH: number;
  tiles: Record<string, Placement>;
  pieces: Record<string, Piece>;
  orientation: Orientation;
  wallId: string;
  readOnly?: boolean;
}

export function SurfaceGrid({
  surfaceKey,
  surfaceW,
  surfaceH,
  tiles,
  pieces,
  orientation,
  wallId,
  readOnly = false,
}: SurfaceGridProps) {
  const placeNicheTile = useStore((s) => s.placeNicheTile);
  const swapNicheTiles = useStore((s) => s.swapNicheTiles);
  const cascadePreview = useStore((s) => s.cascadePreview);

  const virtualWall = {
    width: surfaceW,
    height: surfaceH,
    niche: null,
    remainderH: 'split' as const,
    remainderV: 'split' as const,
    tiles,
  };
  const grid = computeGrid(virtualWall, orientation);

  const maxWidth = 200;
  const surfaceScale = Math.min(maxWidth / surfaceW, 2);

  return (
    <div
      className={styles.surfaceGrid}
      style={{
        position: 'relative',
        width: `${surfaceW * surfaceScale}px`,
        height: `${surfaceH * surfaceScale}px`,
      }}
    >
      {grid.slots.map((slot) => {
        const key = `${slot.row},${slot.col}`;
        const placement = tiles[key];
        const piece = placement ? pieces[placement.pieceId] : undefined;

        const handleDragOver = (e: React.DragEvent) => {
          if (readOnly) return;
          e.preventDefault();
        };

        const handleDrop = (e: React.DragEvent) => {
          if (readOnly) return;
          e.preventDefault();
          e.stopPropagation();
          try {
            const data: DragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            if (data.source === 'pool') {
              placeNicheTile(wallId, surfaceKey, key, data.tileId);
            } else if (data.source === 'niche') {
              swapNicheTiles(wallId, data.surfaceKey, data.key, surfaceKey, key);
            }
          } catch {
            // ignore
          }
        };

        const handleDragStart = (e: React.DragEvent) => {
          if (!placement || readOnly) return;
          e.dataTransfer.setData(
            'text/plain',
            JSON.stringify({ source: 'niche', surfaceKey, key })
          );
          e.dataTransfer.effectAllowed = 'move';
        };

        const tileId = piece ? piece.sourceTileId : null;
        const ir = piece?.imageRegion || { x: 0, y: 0, w: grid.tw, h: grid.th };
        const rot = placement?.rotation || 0;
        const isPulseTarget =
          placement !== undefined &&
          cascadePreview != null &&
          cascadePreview.affectedPieceIds.includes(placement.pieceId);

        let rotCss: React.CSSProperties = {};
        if (rot !== 0 && piece) {
          const ox = (ir.x + slot.w / 2) * surfaceScale;
          const oy = (ir.y + slot.h / 2) * surfaceScale;
          rotCss = {
            transform: `rotate(${rot}deg)`,
            transformOrigin: `${ox}px ${oy}px`,
          };
        }

        return (
          <div
            key={key}
            className={`${styles.slotEl} ${slot.isPartialW || slot.isPartialH ? styles.partial : ''} ${isPulseTarget ? 'pulseHighlight' : ''}`}
            style={{
              position: 'absolute',
              left: `${slot.x * surfaceScale}px`,
              top: `${slot.y * surfaceScale}px`,
              width: `${slot.w * surfaceScale}px`,
              height: `${slot.h * surfaceScale}px`,
              overflow: 'hidden',
              border: placement ? '1px solid #e0e0e0' : '1px dashed #ccc',
              background: placement ? '#fff' : '#fafafa',
              boxSizing: 'border-box',
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            draggable={!!placement && !readOnly}
            onDragStart={placement && !readOnly ? handleDragStart : undefined}
          >
            {placement && tileId && (
              <>
                <img
                  src={`/tiles/${tileId}.jpg`}
                  alt={`Tile ${tileId}`}
                  style={{
                    position: 'absolute',
                    left: `${-(ir.x * surfaceScale)}px`,
                    top: `${-(ir.y * surfaceScale)}px`,
                    width: `${60 * surfaceScale}px`,
                    height: `${120 * surfaceScale}px`,
                    ...rotCss,
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    bottom: '1px',
                    right: '2px',
                    fontSize: '8px',
                    color: '#fff',
                    background: 'rgba(0,0,0,0.45)',
                    padding: '0 2px',
                    borderRadius: '2px',
                    lineHeight: '1.4',
                    pointerEvents: 'none',
                    zIndex: 3,
                  }}
                >
                  {tileId}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
