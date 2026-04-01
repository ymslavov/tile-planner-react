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

  const slotKey = `${slot.row},${slot.col}`;

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
  };

  let className = styles.slot;
  if (slot.isPartialW || slot.isPartialH) className += ` ${styles.partial}`;
  if (isHidden) className += ` ${styles.hidden}`;
  if (isNicheCut) className += ` ${styles.nicheCut}`;
  if (!placement && !isHidden) className += ` ${styles.empty}`;

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
      draggable={!!placement}
      onDragStart={placement ? handleDragStart : undefined}
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
