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

  // Pick a scale that fits the unfolded cross into the page area, accounting
  // for both width AND height (tall niches were overflowing). Each grid row
  // also reserves labelH mm for the surface label that sits above its visual.
  const labelH = 5; // mm reserved per row for the label above each visual
  const usableW = 170; // A4 portrait content width minus margins
  const usableH = 215; // A4 portrait content height minus title, meta, legend
  const crossWidthCm = niche.depth + niche.width + niche.depth;
  const crossHeightCm = niche.depth + niche.height + niche.depth;
  const scale = Math.min(
    2.5,
    usableW / crossWidthCm,
    (usableH - 3 * labelH) / crossHeightCm
  ); // mm per cm

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
        {t.niche} — {t.translateWallName(wall.name)}
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
          gridTemplateRows: `${cellDepth + labelH}mm ${cellH + labelH}mm ${cellDepth + labelH}mm`,
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
          // Render the tile as a background-image of a div sized to the
          // surface. background-image is naturally clipped to the element's
          // box (no fragile overflow-of-absolute-children dance), and Chrome's
          // PDF engine handles it reliably. Position the background so that
          // tile coord (0,0) lands at surface coord (offsetX - ir.x, offsetY - ir.y),
          // i.e. the piece's top-left in the slot, minus the piece's offset
          // into the source tile.
          const bgX = (offsetX - ir.x) * scale;
          const bgY = (offsetY - ir.y) * scale;
          return (
            <div
              key={slotKey}
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url(${tileImageUrl(piece.sourceTileId)})`,
                backgroundSize: `${60 * scale}mm ${120 * scale}mm`,
                backgroundPosition: `${bgX}mm ${bgY}mm`,
                backgroundRepeat: 'no-repeat',
              }}
            />
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
