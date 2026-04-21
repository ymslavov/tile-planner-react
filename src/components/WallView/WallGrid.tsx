import type { Wall, Orientation, Piece, GridResult, NicheOverlapResult } from '../../store/types';
import { GridSlot } from './GridSlot';
import { NicheOverlay } from './NicheOverlay';

interface WallGridProps {
  wall: Wall;
  pieces: Record<string, Piece>;
  grid: GridResult;
  nicheOverlap: NicheOverlapResult;
  scale: number;
  orientation: Orientation;
}

export function WallGrid({
  wall,
  pieces,
  grid,
  nicheOverlap,
  scale,
  orientation,
}: WallGridProps) {
  const { affectedSlots, nicheRect } = nicheOverlap;

  const fullyInsideKeys = new Set(
    affectedSlots.filter((s) => s.fullyInside).map((s) => `${s.row},${s.col}`)
  );
  const partialNicheKeys = new Set(
    affectedSlots
      .filter((s) => !s.fullyInside)
      .map((s) => `${s.row},${s.col}`)
  );

  return (
    <div
      style={{
        position: 'relative',
        width: `${wall.width * scale}px`,
        height: `${wall.height * scale}px`,
        background: '#e8e8e8',
        overflow: 'hidden',
      }}
    >
      {grid.slots.map((slot) => {
        const key = `${slot.row},${slot.col}`;
        const placement = wall.tiles[key];
        const piece = placement ? pieces[placement.pieceId] : undefined;
        const isHidden = fullyInsideKeys.has(key);
        const isNicheCut = partialNicheKeys.has(key);

        return (
          <GridSlot
            key={key}
            slot={slot}
            placement={placement}
            piece={piece}
            scale={scale}
            wallId={wall.id}
            isHidden={isHidden}
            isNicheCut={isNicheCut}
            orientation={orientation}
          />
        );
      })}

      {nicheRect && (
        <NicheOverlay
          nicheRect={nicheRect}
          scale={scale}
          wall={wall}
          pieces={pieces}
        />
      )}
    </div>
  );
}
