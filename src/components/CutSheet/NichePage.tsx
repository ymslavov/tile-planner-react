import type { Wall, Piece, NicheSurfaceKey } from '../../store/types';
import type { ElementEntry } from '../../services/printData';
import { tileImageUrl } from '../../constants';
import { t } from './i18n';
import styles from './CutSheet.module.css';

interface NichePageProps {
  wall: Wall;
  pieces: Record<string, Piece>;
  elements: ElementEntry[];
}

/**
 * One full page per wall-with-niche — shows the 5 niche surfaces (back + lips)
 * with element-number labels for each placed piece.
 */
export function NichePage({ wall, pieces: _pieces, elements }: NichePageProps) {
  if (!wall.niche) return null;

  const niche = wall.niche;

  // Print scale: niche surfaces are tiny (max 60 cm). Use a fixed scale.
  const scale = 2.5; // mm per cm

  type SurfaceInfo = {
    key: NicheSurfaceKey;
    label: string;
    w: number;
    h: number;
  };
  const surfaces: SurfaceInfo[] = [
    { key: 'back',   label: t.nicheBack,   w: niche.width, h: niche.height },
    { key: 'left',   label: t.nicheLeft,   w: niche.depth, h: niche.height },
    { key: 'right',  label: t.nicheRight,  w: niche.depth, h: niche.height },
    { key: 'top',    label: t.nicheTop,    w: niche.width, h: niche.depth  },
    { key: 'bottom', label: t.nicheBottom, w: niche.width, h: niche.depth  },
  ];

  // Niche elements for this wall
  const nicheElements = elements.filter(
    (e) => e.wall.id === wall.id && e.surface !== null
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>
        {t.niche} — {wall.name}
      </h1>
      <p className={styles.pageMeta}>
        {t.width} {niche.width} см, {t.height} {niche.height} см, {t.depth}{' '}
        {niche.depth} см ({t.fromFloor} {niche.fromFloor}, {t.fromLeft}{' '}
        {niche.fromLeft})
      </p>

      <div className={styles.nicheLayout}>
        {/* Top row: back surface (centered) */}
        {surfaces.map((surface) => {
          const tiles =
            (wall.nicheTiles && wall.nicheTiles[surface.key]) || {};
          const surfElements = nicheElements.filter(
            (e) => e.surface === surface.key
          );

          return (
            <div key={surface.key} className={styles.nicheSurfaceCell}>
              <h4 className={styles.nicheSurfaceLabel}>
                {surface.label} ({surface.w}×{surface.h} см)
              </h4>
              <div
                className={styles.nicheSurfaceVisual}
                style={{
                  width: `${surface.w * scale}mm`,
                  height: `${surface.h * scale}mm`,
                }}
              >
                {Object.entries(tiles).map(([slotKey, placement]) => {
                  const piece = _pieces[placement.pieceId];
                  if (!piece) return null;
                  const ir = piece.imageRegion;
                  const elem = surfElements.find(
                    (e) => e.slotKey === slotKey
                  );
                  const num = elem?.num ?? '?';

                  const offsetX = placement.offsetX ?? 0;
                  const offsetY = placement.offsetY ?? 0;

                  return (
                    <div
                      key={slotKey}
                      style={{
                        position: 'absolute',
                        left: `${offsetX * scale}mm`,
                        top: `${offsetY * scale}mm`,
                        width: `${piece.width * scale}mm`,
                        height: `${piece.height * scale}mm`,
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={tileImageUrl(piece.sourceTileId)}
                        alt=""
                        style={{
                          position: 'absolute',
                          left: `${-ir.x * scale}mm`,
                          top: `${-ir.y * scale}mm`,
                          width: `${60 * scale}mm`,
                          height: `${120 * scale}mm`,
                        }}
                      />
                      <div className={styles.elementBadge}>{num}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Element list for this niche */}
      {nicheElements.length > 0 && (
        <div className={styles.nicheLegend}>
          <h3>{t.elementList}</h3>
          {nicheElements.map((e) => (
            <div key={e.num} className={styles.legendRow}>
              <span className={styles.legendNum}>{e.num}</span>
              <div className={styles.legendInfo}>
                <div className={styles.legendId}>{e.pieceId}</div>
                <div className={styles.legendDims}>
                  {e.piece.width.toFixed(1)} × {e.piece.height.toFixed(1)} см ·{' '}
                  {t.surfaceLabels(e.surface!)}
                </div>
                <div className={styles.legendSource}>
                  {t.fromTile} #{e.piece.sourceTileId}
                  {e.placement.autoWrap && ' · авто'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
