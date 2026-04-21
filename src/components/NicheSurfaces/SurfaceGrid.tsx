import { useEffect, useRef } from 'react';
import type {
  Piece,
  Placement,
  Orientation,
  NicheSurfaceKey,
  DragData,
  GridSlot,
} from '../../store/types';
import { computeGrid } from '../../services/gridEngine';
import { useStore } from '../../store';
import { preloadTileImage, createPieceDragImage } from '../../services/dragImage';
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

interface SlotCellProps {
  slot: GridSlot;
  slotKey: string;
  placement: Placement | undefined;
  piece: Piece | undefined;
  surfaceScale: number;
  surfaceKey: NicheSurfaceKey;
  tileW: number;
  tileH: number;
  cascadeAffected: boolean;
  readOnly: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, key: string) => void;
}

function SlotCell({
  slot,
  slotKey,
  placement,
  piece,
  surfaceScale,
  surfaceKey,
  tileW,
  tileH,
  cascadeAffected,
  readOnly,
  onDragOver,
  onDrop,
}: SlotCellProps) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (piece) preloadTileImage(piece.sourceTileId);
  }, [piece]);

  const handleDragStart = (e: React.DragEvent) => {
    if (!placement || readOnly) return;
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ source: 'niche', surfaceKey, key: slotKey })
    );
    e.dataTransfer.effectAllowed = 'move';

    if (piece) {
      const dragW = Math.round(slot.w * surfaceScale * 2);
      const result = createPieceDragImage(piece, Math.max(40, dragW));
      if (result) {
        e.dataTransfer.setDragImage(result.canvas, result.canvas.width / 2, result.canvas.height / 2);
        cleanupRef.current = result.cleanup;
      }
    }
  };

  const handleDragEnd = () => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  };

  const unplaceNicheTile = useStore((s) => s.unplaceNicheTile);
  const wallIdFromStore = useStore((s) => s.activeWallId);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    unplaceNicheTile(wallIdFromStore, surfaceKey, slotKey);
  };

  const tileId = piece ? piece.sourceTileId : null;
  const ir = piece?.imageRegion || { x: 0, y: 0, w: tileW, h: tileH };
  const rot = placement?.rotation || 0;

  let rotCss: React.CSSProperties = {};
  if (rot !== 0 && piece) {
    const ox = (ir.x + slot.w / 2) * surfaceScale;
    const oy = (ir.y + slot.h / 2) * surfaceScale;
    rotCss = {
      transform: `rotate(${rot}deg)`,
      transformOrigin: `${ox}px ${oy}px`,
    };
  }

  const slotClass = `${styles.slotEl} ${slot.isPartialW || slot.isPartialH ? styles.partial : ''} ${cascadeAffected ? 'pulseHighlight' : ''}${placement ? ' wall-slot-placed' : ''}`;

  return (
    <div
      className={slotClass}
      style={{
        position: 'absolute',
        left: `${slot.x * surfaceScale}px`,
        top: `${slot.y * surfaceScale}px`,
        width: `${slot.w * surfaceScale}px`,
        height: `${slot.h * surfaceScale}px`,
        border: placement ? '1px solid #e0e0e0' : '1px dashed #ccc',
        background: placement ? '#fff' : '#fafafa',
        boxSizing: 'border-box',
      }}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, slotKey)}
      draggable={!!placement && !readOnly}
      onDragStart={placement && !readOnly ? handleDragStart : undefined}
      onDragEnd={handleDragEnd}
    >
      {placement && tileId && (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
            }}
          >
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
          </div>
          {!readOnly && (
            <button
              className="niche-remove-btn"
              title="Remove tile from niche surface"
              onClick={handleRemove}
              onMouseDown={(e) => e.stopPropagation()}
              draggable={false}
            >
              &#x2715;
            </button>
          )}
        </>
      )}
    </div>
  );
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

  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, key: string) => {
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
        const cascadeAffected =
          placement !== undefined &&
          cascadePreview != null &&
          cascadePreview.affectedPieceIds.includes(placement.pieceId);

        return (
          <SlotCell
            key={key}
            slot={slot}
            slotKey={key}
            placement={placement}
            piece={piece}
            surfaceScale={surfaceScale}
            surfaceKey={surfaceKey}
            tileW={grid.tw}
            tileH={grid.th}
            cascadeAffected={cascadeAffected}
            readOnly={readOnly}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        );
      })}
    </div>
  );
}
