import { useRef, useState, useCallback, useEffect } from 'react';
import type {
  GridSlot as GridSlotType,
  Placement,
  Piece,
  Orientation,
  DragData,
} from '../../store/types';
import { TileImage } from './TileImage';
import { PlacementControls } from './PlacementControls';
import styles from './GridSlot.module.css';
import { useStore } from '../../store';
import { getEffectiveDims } from '../../services/pieceHelpers';
import { preloadTileImage, createPieceDragImage } from '../../services/dragImage';

interface GridSlotProps {
  slot: GridSlotType;
  placement: Placement | undefined;
  piece: Piece | undefined;
  scale: number;
  wallId: string;
  isHidden: boolean;
  isNicheCut: boolean;
  orientation: Orientation;
}

export function GridSlot({
  slot,
  placement,
  piece,
  scale,
  wallId,
  isHidden,
  isNicheCut,
  orientation,
}: GridSlotProps) {
  const placeTile = useStore((s) => s.placeTile);
  const swapTiles = useStore((s) => s.swapTiles);
  const setOffsets = useStore((s) => s.setOffsets);
  const cascadePreview = useStore((s) => s.cascadePreview);

  const slotKey = `${slot.row},${slot.col}`;
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // Preload tile image for drag previews whenever piece changes
  useEffect(() => {
    if (piece) preloadTileImage(piece.sourceTileId);
  }, [piece]);

  // ── In-slot drag state ──────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [draftOffsetX, setDraftOffsetX] = useState<number>(0);
  const [draftOffsetY, setDraftOffsetY] = useState<number>(0);

  const dragStart = useRef<{
    mouseX: number;
    mouseY: number;
    initOffsetX: number;
    initOffsetY: number;
  } | null>(null);

  const handleImageMouseDown = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (!placement || !piece) return;

      const eff = getEffectiveDims(piece, placement.rotation || 0);
      const hasOverhangX = eff.w > slot.w + 0.01;
      const hasOverhangY = eff.h > slot.h + 0.01;

      if (!hasOverhangX && !hasOverhangY) {
        // No overhang — let HTML5 drag happen normally
        return;
      }

      // Has overhang — intercept for in-slot repositioning
      e.preventDefault();
      e.stopPropagation();

      const initOffsetX = placement.offsetX ?? 0;
      const initOffsetY = placement.offsetY ?? 0;

      dragStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        initOffsetX,
        initOffsetY,
      };
      setDraftOffsetX(initOffsetX);
      setDraftOffsetY(initOffsetY);
      setIsDragging(true);

      const onMouseMove = (me: MouseEvent) => {
        if (!dragStart.current) return;
        const dxCm = (me.clientX - dragStart.current.mouseX) / scale;
        const dyCm = (me.clientY - dragStart.current.mouseY) / scale;

        const minX = slot.w - eff.w;
        const minY = slot.h - eff.h;

        const newX = Math.min(0, Math.max(minX, dragStart.current.initOffsetX + dxCm));
        const newY = Math.min(0, Math.max(minY, dragStart.current.initOffsetY + dyCm));

        setDraftOffsetX(newX);
        setDraftOffsetY(newY);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        if (dragStart.current) {
          const finalX = draftOffsetXRef.current;
          const finalY = draftOffsetYRef.current;
          setIsDragging(false);
          dragStart.current = null;
          setOffsets(wallId, slotKey, finalX, finalY);
        }
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [placement, piece, slot, scale, wallId, slotKey, setOffsets]
  );

  // Ref mirror of draft offsets so the mouseup closure can read the latest values
  const draftOffsetXRef = useRef(0);
  const draftOffsetYRef = useRef(0);
  draftOffsetXRef.current = draftOffsetX;
  draftOffsetYRef.current = draftOffsetY;

  // ── HTML5 drag (between slots) ──────────────────────────────────────
  const handleDragEnd = () => {
    if (dragCleanupRef.current) {
      dragCleanupRef.current();
      dragCleanupRef.current = null;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isHidden) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    if (isHidden) return;
    e.preventDefault();
    e.stopPropagation();

    try {
      const data: DragData = JSON.parse(e.dataTransfer.getData('text/plain'));

      if (data.source === 'pool') {
        placeTile(wallId, slotKey, data.tileId);
      } else if (data.source === 'wall') {
        swapTiles(wallId, data.key, slotKey);
      }
    } catch {
      // ignore
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!placement) return;
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ source: 'wall', key: slotKey })
    );
    e.dataTransfer.effectAllowed = 'move';

    if (piece) {
      const dragW = Math.round(slot.w * scale);
      const result = createPieceDragImage(piece, Math.max(40, dragW));
      if (result) {
        e.dataTransfer.setDragImage(result.canvas, result.canvas.width / 2, result.canvas.height / 2);
        dragCleanupRef.current = result.cleanup;
      }
    }
  };

  // ── Pulse highlight ─────────────────────────────────────────────────
  const isPulseTarget =
    placement !== undefined &&
    cascadePreview != null &&
    cascadePreview.affectedPieceIds.includes(placement.pieceId);

  let className = styles.slot;
  if (slot.isPartialW || slot.isPartialH) className += ` ${styles.partial}`;
  if (isHidden) className += ` ${styles.hidden}`;
  if (isNicheCut) className += ` ${styles.nicheCut}`;
  if (!placement && !isHidden) className += ` ${styles.empty}`;
  if (isPulseTarget) className += ' pulseHighlight';

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        left: `${slot.x * scale}px`,
        top: `${slot.y * scale}px`,
        width: `${slot.w * scale}px`,
        height: `${slot.h * scale}px`,
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      draggable={!!placement && !isDragging}
      onDragStart={placement ? handleDragStart : undefined}
      onDragEnd={handleDragEnd}
    >
      {!isHidden && placement && piece && (
        <>
          <TileImage
            piece={piece}
            placement={placement}
            slotW={slot.w}
            slotH={slot.h}
            scale={scale}
            orientation={orientation}
            draftOffsetX={isDragging ? draftOffsetX : undefined}
            draftOffsetY={isDragging ? draftOffsetY : undefined}
            onMouseDown={handleImageMouseDown}
          />
          <span className={styles.label}>{piece.sourceTileId}</span>
          <PlacementControls
            wallId={wallId}
            slotKey={slotKey}
            placement={placement}
            slot={slot}
            piece={piece}
          />
        </>
      )}
    </div>
  );
}
