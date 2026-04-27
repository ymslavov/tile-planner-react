import type { Wall, Piece, Orientation } from '../../store/types';
import { computeWallPlacements, type ElementEntry } from '../../services/printData';
import { tileImageUrl } from '../../constants';
import { t } from './i18n';
import styles from './CutSheet.module.css';

interface WallPreviewPageProps {
  wall: Wall;
  pieces: Record<string, Piece>;
  orientation: Orientation;
  elements: ElementEntry[];
}

/**
 * One full page per wall — shows the wall layout with each placed piece
 * labeled by its element number. Designed for A4 portrait print.
 */
export function WallPreviewPage({
  wall,
  pieces: _pieces,
  orientation,
  elements,
}: WallPreviewPageProps) {
  const { boxes, nicheRect } = computeWallPlacements(wall, elements, orientation);

  // Print scale: fit the wall into a roughly 160mm × 220mm area.
  // 1 cm ≈ 1.7-3 mm depending on the wall — we use mm/cm.
  const maxWmm = 160;
  const maxHmm = 230;
  const scale = Math.min(maxWmm / wall.width, maxHmm / wall.height);
  const wallWmm = wall.width * scale;
  const wallHmm = wall.height * scale;

  // Wall-face elements only (with surface=null and matching wallId)
  const wallElements = elements.filter(
    (e) => e.wall.id === wall.id && e.surface === null
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>
        {t.wall} — {t.translateWallName(wall.name)}
      </h1>
      <p className={styles.pageMeta}>
        {t.dimensions}: {wall.width} × {wall.height} см
        {wall.niche && (
          <>
            {' | '}
            {t.niche}: {wall.niche.width}×{wall.niche.height}×{wall.niche.depth} см,{' '}
            {t.fromFloor} {wall.niche.fromFloor}, {t.fromLeft} {wall.niche.fromLeft}
          </>
        )}
      </p>

      <div className={styles.wallPreviewLayout}>
        {/* Left: visual */}
        <div
          className={styles.wallVisual}
          style={{
            width: `${wallWmm}mm`,
            height: `${wallHmm}mm`,
          }}
        >
          {boxes.map((b) => {
            const piece = b.piece;
            const ir = piece.imageRegion;
            const offsetX = b.placement.offsetX ?? 0;
            const offsetY = b.placement.offsetY ?? 0;
            const rotation = b.placement.rotation || 0;
            // Match planning-mode TileImage: rotate the source image around
            // the slot's center expressed in image-local coordinates. Slot
            // top-left in image coords is (offsetX − ir.x, offsetY − ir.y),
            // so slot center is (ir.x − offsetX + slotW/2, ir.y − offsetY +
            // slotH/2) inside the 60×120 image space, then scaled to mm.
            const rotStyle: React.CSSProperties =
              rotation !== 0
                ? {
                    transform: `rotate(${rotation}deg)`,
                    transformOrigin: `${
                      (ir.x - offsetX + b.w / 2) * scale
                    }mm ${(ir.y - offsetY + b.h / 2) * scale}mm`,
                  }
                : {};
            return (
              <div
                key={b.num}
                className={styles.placedPiece}
                style={{
                  position: 'absolute',
                  left: `${b.x * scale}mm`,
                  top: `${b.y * scale}mm`,
                  width: `${b.w * scale}mm`,
                  height: `${b.h * scale}mm`,
                  overflow: 'hidden',
                }}
              >
                <img
                  src={tileImageUrl(piece.sourceTileId)}
                  alt=""
                  style={{
                    position: 'absolute',
                    left: `${(offsetX - ir.x) * scale}mm`,
                    top: `${(offsetY - ir.y) * scale}mm`,
                    width: `${60 * scale}mm`,
                    height: `${120 * scale}mm`,
                    ...rotStyle,
                  }}
                />
                <div className={styles.elementBadge}>{b.piece.id}</div>
              </div>
            );
          })}

          {/* Niche outline */}
          {nicheRect && (
            <div
              className={styles.nicheOutline}
              style={{
                left: `${nicheRect.x * scale}mm`,
                top: `${nicheRect.y * scale}mm`,
                width: `${nicheRect.w * scale}mm`,
                height: `${nicheRect.h * scale}mm`,
              }}
            />
          )}
        </div>

        {/* Right: element list for this wall */}
        <div className={styles.wallLegend}>
          <h3>{t.elementList}</h3>
          {wallElements.length === 0 && (
            <p className={styles.empty}>—</p>
          )}
          {wallElements.map((e) => (
            <div key={e.pieceId} className={styles.legendRow}>
              <span className={styles.legendNum}>{e.pieceId}</span>
              <div className={styles.legendInfo}>
                <div className={styles.legendDims}>
                  {e.piece.width.toFixed(1)} × {e.piece.height.toFixed(1)} см
                </div>
                <div className={styles.legendSource}>
                  {t.fromTile} #{e.piece.sourceTileId}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
