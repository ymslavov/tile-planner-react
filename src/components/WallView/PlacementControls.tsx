import { useStore } from '../../store';
import type { Placement, GridSlot, Piece } from '../../store/types';
import styles from './PlacementControls.module.css';

interface PlacementControlsProps {
  wallId: string;
  slotKey: string;
  placement: Placement;
  slot: GridSlot;
  piece: Piece;
}

export function PlacementControls({
  wallId,
  slotKey,
  placement: _placement,
  slot: _slot,
  piece: _piece,
}: PlacementControlsProps) {
  const rotatePlacement = useStore((s) => s.rotatePlacement);

  return (
    <div className={styles.controls}>
      <button
        className={styles.rotateBtn}
        title="Rotate tile"
        onClick={(e) => {
          e.stopPropagation();
          rotatePlacement(wallId, slotKey);
        }}
      >
        &#x21BB;
      </button>
    </div>
  );
}
