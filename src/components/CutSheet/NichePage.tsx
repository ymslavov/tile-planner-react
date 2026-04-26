import type { Wall, Piece, NicheSurfaceKey, Placement } from '../../store/types';
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
 * One full page per wall-with-niche — shows the 5 niche surfaces unfolded
 * around the back surface (top above, left/right beside, bottom below) so the
 * spatial relationship matches what the user sees when standing in front of
 * the niche. Each placed piece gets an element-number badge anchored to the
 * surface (not to the piece container) so the badge stays visible even when
 * the piece extends past the surface bounds.
 */
export function NichePage({ wall, pieces, elements }: NichePageProps) {
  if (!wall.niche) return null;

  const niche = wall.niche;

  // Pick a scale that fits the unfolded cross (depth + width + depth) into
  // an A4-portrait page width with margins (~178 mm usable). Round to one
  // decimal so dimensions read cleanly.
  const usableMm = 170;
  const crossWidthCm = niche.depth + niche.width + niche.depth;
  const scale = Math.min(2.5, usableMm / crossWidthCm); // mm per cm

  // Cross layout cell sizes in mm
  const cellDepth = niche.depth * scale;
  const cellW = niche.width * scale;
  const cellH = niche.height * scale;

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

      {/* Unfolded niche cross. Grid columns: depth | width | depth.
          Rows: depth | height | depth. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${cellDepth}mm ${cellW}mm ${cellDepth}mm`,
          gridTemplateRows: `${cellDepth}mm ${cellH}mm ${cellDepth}mm`,
          gap: '2mm',
          marginBottom: '8mm',
          width: 'fit-content',
        }}
      >
        {/* Top */}
        <div style={{ gridColumn: 2, gridRow: 1 }}>
          <NicheSurfaceCell
            label={t.nicheTop}
            wCm={niche.width}
            hCm={niche.depth}
            scale={scale}
            tiles={(wall.nicheTiles && wall.nicheTiles.top) || {}}
            pieces={pieces}
            elements={nicheElements}
            surfaceKey="top"
          />
        </div>

        {/* Left */}
        <div style={{ gridColumn: 1, gridRow: 2 }}>
          <NicheSurfaceCell
            label={t.nicheLeft}
            wCm={niche.depth}
            hCm={niche.height}
            scale={scale}
            tiles={(wall.nicheTiles && wall.nicheTiles.left) || {}}
            pieces={pieces}
            elements={nicheElements}
            surfaceKey="left"
          />
        </div>

        {/* Back (center) */}
        <div style={{ gridColumn: 2, gridRow: 2 }}>
          <NicheSurfaceCell
            label={t.nicheBack}
            wCm={niche.width}
            hCm={niche.height}
            scale={scale}
            tiles={(wall.nicheTiles && wall.nicheTiles.back) || {}}
            pieces={pieces}
            elements={nicheElements}
            surfaceKey="back"
          />
        </div>

        {/* Right */}
        <div style={{ gridColumn: 3, gridRow: 2 }}>
          <NicheSurfaceCell
            label={t.nicheRight}
            wCm={niche.depth}
            hCm={niche.height}
            scale={scale}
            tiles={(wall.nicheTiles && wall.nicheTiles.right) || {}}
            pieces={pieces}
            elements={nicheElements}
            surfaceKey="right"
          />
        </div>

        {/* Bottom */}
        <div style={{ gridColumn: 2, gridRow: 3 }}>
          <NicheSurfaceCell
            label={t.nicheBottom}
            wCm={niche.width}
            hCm={niche.depth}
            scale={scale}
            tiles={(wall.nicheTiles && wall.nicheTiles.bottom) || {}}
            pieces={pieces}
            elements={nicheElements}
            surfaceKey="bottom"
          />
        </div>
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

interface NicheSurfaceCellProps {
  label: string;
  wCm: number;
  hCm: number;
  scale: number;
  tiles: Record<string, Placement>;
  pieces: Record<string, Piece>;
  elements: ElementEntry[];
  surfaceKey: NicheSurfaceKey;
}

function NicheSurfaceCell({
  label,
  wCm,
  hCm,
  scale,
  tiles,
  pieces,
  elements,
  surfaceKey,
}: NicheSurfaceCellProps) {
  const surfaceElements = elements.filter((e) => e.surface === surfaceKey);

  return (
    <>
      <h4 className={styles.nicheSurfaceLabel}>
        {label} ({wCm}×{hCm} см)
      </h4>
      <div
        className={styles.nicheSurfaceVisual}
        style={{
          width: `${wCm * scale}mm`,
          height: `${hCm * scale}mm`,
        }}
      >
        {Object.entries(tiles).map(([slotKey, placement]) => {
          const piece = pieces[placement.pieceId];
          if (!piece) return null;
          const ir = piece.imageRegion;
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
            </div>
          );
        })}
        {/* Badges anchored to the surface (not the piece container) so they
            stay visible even when the piece extends past the surface bounds.
            Stack vertically along the top edge if multiple tiles are on the
            same surface. */}
        {surfaceElements.map((e, i) => (
          <div
            key={`badge-${e.num}`}
            className={styles.elementBadge}
            style={{ top: '1mm', left: `${1 + i * 6}mm` }}
          >
            {e.num}
          </div>
        ))}
      </div>
    </>
  );
}
