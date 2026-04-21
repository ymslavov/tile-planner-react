import { useStore } from '../../store';
import type { Placement, GridSlot, Piece } from '../../store/types';
import styles from './PlacementControls.module.css';

interface PlacementControlsProps {
  wallId: string;
  slotKey: string;
  placement: Placement;
  slot: GridSlot;
  piece: Piece;
  /** Optional niche surface key — if set, uses unplaceNicheTile instead of unplaceTile */
  nicheSurface?: 'back' | 'left' | 'right' | 'top' | 'bottom';
}

export function PlacementControls({
  wallId,
  slotKey,
  placement: _placement,
  slot: _slot,
  piece: _piece,
  nicheSurface,
}: PlacementControlsProps) {
  const rotatePlacement = useStore((s) => s.rotatePlacement);
  const unplaceTile = useStore((s) => s.unplaceTile);
  const unplaceNicheTile = useStore((s) => s.unplaceNicheTile);

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    rotatePlacement(wallId, slotKey);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (nicheSurface) {
      unplaceNicheTile(wallId, nicheSurface, slotKey);
    } else {
      unplaceTile(wallId, slotKey);
    }
  };

  return (
    <div className={styles.controls}>
      <div className={styles.btnBar}>
        <button
          className={styles.btn}
          title="Rotate tile"
          onClick={handleRotate}
          onMouseDown={(e) => e.stopPropagation()}
        >
          &#x21BB;
        </button>
        <button
          className={`${styles.btn} ${styles.removeBtn}`}
          title="Remove tile from slot"
          onClick={handleRemove}
          onMouseDown={(e) => e.stopPropagation()}
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
