import { useEffect, useRef, useState } from 'react';
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
import { getEffectiveDims } from '../../services/pieceHelpers';
import { findValidOffset } from '../../services/offcutEngine';
import { tileImageUrl } from '../../constants';
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
  const rotateNichePlacement = useStore((s) => s.rotateNichePlacement);
  const setNicheOffsets = useStore((s) => s.setNicheOffsets);
  const wallIdFromStore = useStore((s) => s.activeWallId);

  // In-slot drag state (mouse-based, independent of HTML5 drag)
  const [isDragging, setIsDragging] = useState(false);
  const [draftOffsetX, setDraftOffsetX] = useState(0);
  const [draftOffsetY, setDraftOffsetY] = useState(0);
  const dragRef = useRef<{
    startMouseX: number;
    startMouseY: number;
    initOffsetX: number;
    initOffsetY: number;
    minX: number;
    minY: number;
  } | null>(null);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    unplaceNicheTile(wallIdFromStore, surfaceKey, slotKey);
  };

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    rotateNichePlacement(wallIdFromStore, surfaceKey, slotKey);
  };

  const handleImageMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!placement || !piece || readOnly) return;
    const eff = getEffectiveDims(piece, placement.rotation || 0);
    const overW = eff.w - slot.w;
    const overH = eff.h - slot.h;
    if (overW < 0.01 && overH < 0.01) return; // no overhang, nothing to drag

    e.preventDefault();
    e.stopPropagation();
    const initOX = placement.offsetX ?? 0;
    const initOY = placement.offsetY ?? 0;
    dragRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      initOffsetX: initOX,
      initOffsetY: initOY,
      minX: slot.w - eff.w,
      minY: slot.h - eff.h,
    };
    setDraftOffsetX(initOX);
    setDraftOffsetY(initOY);
    setIsDragging(true);

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d || !piece || !placement) return;
      const dxCm = (ev.clientX - d.startMouseX) / surfaceScale;
      const dyCm = (ev.clientY - d.startMouseY) / surfaceScale;
      const targetX = d.initOffsetX + dxCm;
      const targetY = d.initOffsetY + dyCm;
      // Snap to a valid position that avoids cutouts (L/C/frame shapes)
      const valid = findValidOffset(
        piece,
        placement.rotation || 0,
        slot.w,
        slot.h,
        targetX,
        targetY
      );
      if (valid) {
        setDraftOffsetX(valid.x);
        setDraftOffsetY(valid.y);
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const d = dragRef.current;
      dragRef.current = null;
      setIsDragging(false);
      if (!d) return;
      // Use the latest draft values we computed (read from state via refs not possible; use closure)
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', onMove);
      dragRef.current = null;
      // Commit whatever was last set in draft state via the onUp closure below
      setIsDragging(false);
    }, { once: true });

    // Use a separate handler that reads the latest draft values from state
    const commit = () => {
      setNicheOffsets(wallIdFromStore, surfaceKey, slotKey, draftOffsetXRef.current, draftOffsetYRef.current);
    };
    document.addEventListener('mouseup', commit, { once: true });
  };

  // Keep refs in sync with state so the mouseup handler can commit the latest
  const draftOffsetXRef = useRef(draftOffsetX);
  const draftOffsetYRef = useRef(draftOffsetY);
  useEffect(() => {
    draftOffsetXRef.current = draftOffsetX;
  }, [draftOffsetX]);
  useEffect(() => {
    draftOffsetYRef.current = draftOffsetY;
  }, [draftOffsetY]);

  const tileId = piece ? piece.sourceTileId : null;
  const ir = piece?.imageRegion || { x: 0, y: 0, w: tileW, h: tileH };
  const rot = placement?.rotation || 0;
  const effOffsetX = isDragging ? draftOffsetX : (placement?.offsetX ?? 0);
  const effOffsetY = isDragging ? draftOffsetY : (placement?.offsetY ?? 0);

  let rotCss: React.CSSProperties = {};
  if (rot !== 0 && piece) {
    const ox = (ir.x - effOffsetX + slot.w / 2) * surfaceScale;
    const oy = (ir.y - effOffsetY + slot.h / 2) * surfaceScale;
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
      draggable={!!placement && !readOnly && !isDragging}
      onDragStart={placement && !readOnly ? handleDragStart : undefined}
      onDragEnd={handleDragEnd}
    >
      {placement && tileId && piece && (
        <>
          {/* Piece container: positioned within the slot at (offsetX, offsetY),
              sized to the piece's own dimensions. For pieces smaller than the
              slot (e.g., auto-wrap lip strips), only the piece's region is
              covered — the rest of the slot remains empty/background. */}
          <div
            style={{
              position: 'absolute',
              left: `${effOffsetX * surfaceScale}px`,
              top: `${effOffsetY * surfaceScale}px`,
              width: `${piece.width * surfaceScale}px`,
              height: `${piece.height * surfaceScale}px`,
              overflow: 'hidden',
            }}
          >
            <img
              src={tileImageUrl(tileId)}
              alt={`Tile ${tileId}`}
              onMouseDown={handleImageMouseDown}
              draggable={false}
              style={{
                position: 'absolute',
                left: `${-ir.x * surfaceScale}px`,
                top: `${-ir.y * surfaceScale}px`,
                width: `${60 * surfaceScale}px`,
                height: `${120 * surfaceScale}px`,
                cursor: getEffectiveDims(piece, rot).w > slot.w + 0.01 || getEffectiveDims(piece, rot).h > slot.h + 0.01 ? 'grab' : 'default',
                ...rotCss,
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
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
          {!readOnly && (
            <div className="niche-btn-bar">
              <button
                className="niche-ctrl-btn"
                title="Rotate tile"
                onClick={handleRotate}
                onMouseDown={(e) => e.stopPropagation()}
                draggable={false}
              >
                &#x21BB;
              </button>
              <button
                className="niche-ctrl-btn niche-remove-btn-inline"
                title="Remove tile from niche surface"
                onClick={handleRemove}
                onMouseDown={(e) => e.stopPropagation()}
                draggable={false}
              >
                &#x2715;
              </button>
            </div>
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
