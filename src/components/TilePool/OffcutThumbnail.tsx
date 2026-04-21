import type { Piece, Orientation } from '../../store/types';
import { TILE_W, TILE_H, tileImageUrl } from '../../constants';
import styles from './OffcutThumbnail.module.css';

interface OffcutThumbnailProps {
  piece: Piece;
  orientation: Orientation;
  /**
   * Scale in px per cm. Offcut thumbnail renders at piece.width * scale × piece.height * scale.
   * This is the scale of the parent tile — so an offcut proportionally smaller than its
   * parent tile renders proportionally smaller here too.
   */
  scale: number;
}

/**
 * Renders the marble texture cropped to the offcut's imageRegion
 * at proportional size, with cutouts masked out for L/C-shapes.
 */
export function OffcutThumbnail({
  piece,
  orientation,
  scale,
}: OffcutThumbnailProps) {
  const ir = piece.imageRegion;
  const tileId = piece.sourceTileId;

  const thumbW = piece.width * scale;
  const thumbH = piece.height * scale;

  // Build clip-path to mask out cutouts (L-shape, C-shape)
  const clipPath = buildClipPath(piece, thumbW, thumbH, scale);

  if (orientation === 'portrait') {
    // Source image is 60x120 (portrait), matches orientation
    const imgW = TILE_W * scale;
    const imgH = TILE_H * scale;
    const imgLeft = -(ir.x * scale);
    const imgTop = -(ir.y * scale);

    return (
      <div
        className={styles.container}
        style={{ width: thumbW, height: thumbH }}
      >
        <div className={styles.imageWrap} style={{ clipPath }}>
          <img
            src={tileImageUrl(tileId)}
            alt={`Offcut ${piece.id}`}
            className={styles.img}
            style={{
              width: imgW,
              height: imgH,
              left: imgLeft,
              top: imgTop,
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      </div>
    );
  }

  // Landscape: source image file is always portrait (60x120 jpg),
  // CSS-rotated 90deg CW to display as 120x60 landscape.
  // The imageRegion coords are in landscape space (120x60).
  const naturalW = TILE_H * scale; // natural width of rotated img = 120 * scale
  const naturalH = TILE_W * scale; // natural height of rotated img = 60 * scale
  const preLeft = -(ir.y * scale);
  const preTop = ir.x * scale;

  return (
    <div
      className={styles.container}
      style={{ width: thumbW, height: thumbH }}
    >
      <div className={styles.imageWrap} style={{ clipPath }}>
        <img
          src={tileImageUrl(tileId)}
          alt={`Offcut ${piece.id}`}
          className={styles.img}
          style={{
            width: naturalW,
            height: naturalH,
            left: preLeft,
            top: preTop,
            transform: 'rotate(90deg)',
            transformOrigin: 'top left',
            translate: `0 -${naturalW}px`,
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    </div>
  );
}

/**
 * Builds a CSS polygon clip-path that represents the piece shape
 * minus any cutouts. Returns undefined if no cutouts (simple rectangle).
 */
function buildClipPath(
  piece: Piece,
  thumbW: number,
  thumbH: number,
  scale: number
): string | undefined {
  const cutouts = piece.geometry.cutouts;
  if (cutouts.length === 0) return undefined;

  // Build a polygon with the outer rectangle, then bridge to each cutout
  // traced in reverse winding. With evenodd fill rule, the cutout areas
  // become transparent.
  const outerPoints: string[] = [
    `0 0`,
    `${thumbW}px 0`,
    `${thumbW}px ${thumbH}px`,
    `0 ${thumbH}px`,
    `0 0`,
  ];

  const allPoints = [...outerPoints];

  for (const c of cutouts) {
    const cx = c.x * scale;
    const cy = c.y * scale;
    const cw = c.w * scale;
    const ch = c.h * scale;

    // Trace cutout in reverse winding for evenodd subtraction
    allPoints.push(
      `${cx}px ${cy}px`,
      `${cx}px ${cy + ch}px`,
      `${cx + cw}px ${cy + ch}px`,
      `${cx + cw}px ${cy}px`,
      `${cx}px ${cy}px`,
    );
    // Bridge back to outer origin
    allPoints.push(`0 0`);
  }

  return `polygon(evenodd, ${allPoints.join(', ')})`;
}
