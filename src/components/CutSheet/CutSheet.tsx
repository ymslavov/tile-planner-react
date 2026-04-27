import { useStore } from '../../store';
import { getCutSheetEntries } from '../../services/cutSheetEngine';
import { buildElementList } from '../../services/printData';
import { CutTileSection } from './CutTileSection';
import { WallPreviewPage } from './WallPreviewPage';
import { NichePage } from './NichePage';
import { t } from './i18n';
import styles from './CutSheet.module.css';

interface CutSheetProps {
  /** When true, render visibly on screen (not just for print). */
  visibleOnScreen?: boolean;
}

/**
 * Multi-page cut sheet (print-only):
 *   1. Cover page with summary.
 *   2. One page per wall — wall layout preview with element numbers.
 *   3. One page per wall-with-niche — niche surfaces with element numbers.
 *   4. One section per source tile — tile image with thin cut lines and a per-piece list.
 *
 * All text in Bulgarian.
 */
export function CutSheet({ visibleOnScreen = false }: CutSheetProps = {}) {
  const pieces = useStore((s) => s.pieces);
  const walls = useStore((s) => s.walls);
  const orientation = useStore((s) => s.orientation);
  const nicheMode = useStore((s) => s.nicheMode);

  const elements = buildElementList(walls, pieces, orientation);
  const entries = getCutSheetEntries(pieces, walls, orientation);

  const orientationLabel = orientation === 'portrait' ? t.portrait : t.landscape;
  const nicheLabel = nicheMode === 'wrap-around' ? t.wrapAround : t.independent;

  return (
    <div
      className={`${styles.cutSheet} ${
        visibleOnScreen ? styles.cutSheetOnScreen : 'print-only'
      }`}
    >
      {/* Cover */}
      <div className={`${styles.page} ${styles.coverPage}`}>
        <h1 className={styles.coverTitle}>{t.cutSheetTitle}</h1>
        <div className={styles.coverInfo}>
          <p>
            <strong>{t.orientation}:</strong> {orientationLabel}
          </p>
          <p>
            <strong>{t.nicheMode}:</strong> {nicheLabel}
          </p>
          <p>
            <strong>{t.walls}:</strong> {walls.length}
          </p>
          <p>
            <strong>{t.elements}:</strong> {elements.length}
          </p>
        </div>
      </div>

      {/* Wall preview pages */}
      {walls.map((wall) => (
        <WallPreviewPage
          key={`wall-${wall.id}`}
          wall={wall}
          pieces={pieces}
          orientation={orientation}
          elements={elements}
        />
      ))}

      {/* Niche pages */}
      {walls
        .filter((w) => w.niche)
        .map((wall) => (
          <NichePage
            key={`niche-${wall.id}`}
            wall={wall}
            pieces={pieces}
            elements={elements}
          />
        ))}

      {/* Per-tile cut sheets */}
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>{t.cuts}</h1>
        {entries.length === 0 && <p>—</p>}
        {entries.map((entry) => (
          <CutTileSection
            key={entry.tileNumber}
            tileNumber={entry.tileNumber}
            allPieces={entry.allPieces}
            pieces={pieces}
            walls={walls}
            placed={entry.placed}
            orientation={orientation}
            elements={elements}
          />
        ))}
      </div>
    </div>
  );
}
