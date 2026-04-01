import { useStore } from '../../store';
import { getCutSheetEntries } from '../../services/cutSheetEngine';
import { CutTileSection } from './CutTileSection';
import styles from './CutSheet.module.css';

export function CutSheet() {
  const pieces = useStore((s) => s.pieces);
  const walls = useStore((s) => s.walls);
  const orientation = useStore((s) => s.orientation);
  const nicheMode = useStore((s) => s.nicheMode);

  const entries = getCutSheetEntries(pieces, walls, orientation);

  return (
    <div className={`${styles.cutSheet} print-only`}>
      <div className={styles.summary}>
        <h1>Tile Cut Sheet</h1>
        <p>
          Orientation: {orientation} | Niche Mode: {nicheMode}
        </p>
      </div>

      {entries.map((entry) => (
        <CutTileSection
          key={entry.tileNumber}
          tileNumber={entry.tileNumber}
          allPieces={entry.allPieces}
          pieces={pieces}
          walls={walls}
          placed={entry.placed}
          orientation={orientation}
        />
      ))}
    </div>
  );
}
