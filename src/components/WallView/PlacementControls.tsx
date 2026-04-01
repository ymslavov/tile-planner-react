import { useStore } from '../../store';
import type { Placement, GridSlot, AnchorPosition, Piece } from '../../store/types';
import { getEffectiveDims } from '../../services/pieceHelpers';
import { getValidAnchors } from '../../services/offcutEngine';
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
  placement,
  slot,
  piece,
}: PlacementControlsProps) {
  const rotatePlacement = useStore((s) => s.rotatePlacement);
  const setAnchor = useStore((s) => s.setAnchor);

  const rotation = placement.rotation || 0;
  const eff = getEffectiveDims(piece, rotation);
  const validAnchors = getValidAnchors(eff, slot);
  const currentAnchor = placement.anchor || 'top-left';

  const anchorPositions: Record<AnchorPosition, React.CSSProperties> = {
    'top-left': { top: '2px', left: '2px' },
    'top-right': { top: '2px', right: '24px' },
    'bottom-left': { bottom: '2px', left: '2px' },
    'bottom-right': { bottom: '2px', right: '24px' },
  };

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

      {validAnchors.length > 1 &&
        validAnchors.map((anchor) => (
          <div
            key={anchor}
            className={`${styles.anchorDot} ${anchor === currentAnchor ? styles.anchorActive : ''}`}
            title={anchor}
            style={anchorPositions[anchor]}
            onClick={(e) => {
              e.stopPropagation();
              if (anchor !== currentAnchor) {
                setAnchor(wallId, slotKey, anchor);
              }
            }}
          >
            &#x25CF;
          </div>
        ))}
    </div>
  );
}
