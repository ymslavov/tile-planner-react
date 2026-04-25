import type { Piece, Wall } from '../../store/types';
import {
  getChildPieces,
  getPiecePlacement,
  getTileW,
  getTileH,
} from '../../services/pieceHelpers';
import type { Orientation } from '../../store/types';
import { tileImageUrl } from '../../constants';
import { pieceCentroidInTile, type ElementEntry } from '../../services/printData';
import { t } from './i18n';
import styles from './CutSheet.module.css';

interface CutTileSectionProps {
  tileNumber: number;
  allPieces: Piece[];
  pieces: Record<string, Piece>;
  walls: Wall[];
  placed: Map<string, { wallId: string; location: string }>;
  orientation: Orientation;
  elements: ElementEntry[];
}

/**
 * Per-tile cut chain page.
 * - Tile image with thin dashed cut lines (strokeWidth 0.15) and small piece labels at centroids.
 * - Element-number callouts shown as numbered circles.
 * - Right-side list of pieces with dimensions and placement info, in Bulgarian.
 */
export function CutTileSection({
  tileNumber,
  allPieces,
  pieces,
  walls,
  placed,
  orientation,
  elements,
}: CutTileSectionProps) {
  const tw = getTileW(orientation);
  const th = getTileH(orientation);
  const rootId = String(tileNumber);

  // Build a map of pieceId → element number (for any pieces that are placed)
  const elemByPieceId = new Map<string, number>();
  for (const e of elements) {
    if (e.piece.sourceTileId === tileNumber) {
      elemByPieceId.set(e.pieceId, e.num);
    }
  }

  // Collect all leaf-level cut rectangles to render with thin dashed lines.
  // We render each child's bounding box once per parent in the chain.
  type CutRect = {
    x: number;
    y: number;
    w: number;
    h: number;
    pieceId: string;
    elementNum: number | null;
  };
  const cuts: CutRect[] = [];
  for (const piece of allPieces) {
    const children = getChildPieces(pieces, piece.id);
    for (const child of children) {
      const cr = child.imageRegion;
      cuts.push({
        x: cr.x,
        y: cr.y,
        w: cr.w,
        h: cr.h,
        pieceId: child.id,
        elementNum: elemByPieceId.get(child.id) ?? null,
      });
    }
  }

  // Compute element-number badge positions with collision avoidance.
  // Original centroid is the piece center. If two badges would overlap (within
  // BADGE_DIAMETER cm), shift one along its piece's longer axis. Leader lines
  // link the badge back to the piece centroid so users can still see the link.
  const BADGE_RADIUS = 2.5; // viewBox units (cm)
  const MIN_DIST = BADGE_RADIUS * 2 + 0.5;
  type LabelLayout = {
    pieceId: string;
    num: number;
    cx: number;
    cy: number;
    labelX: number;
    labelY: number;
    needsLeader: boolean;
  };
  const labels: LabelLayout[] = [];
  // Sort by area descending so larger pieces claim their natural spots first
  const labelsToPlace = cuts
    .filter((c) => c.elementNum !== null)
    .map((c) => {
      const child = pieces[c.pieceId];
      const centroid = pieceCentroidInTile(child);
      return { c, centroid, area: c.w * c.h };
    })
    .sort((a, b) => b.area - a.area);

  for (const { c, centroid } of labelsToPlace) {
    let lx = centroid.x;
    let ly = centroid.y;
    // Try to find a non-overlapping position by shifting along the piece's
    // longer axis up to a few times.
    const longerAxis = c.h > c.w ? 'y' : 'x';
    const shortMin = longerAxis === 'y' ? c.y + BADGE_RADIUS : c.x + BADGE_RADIUS;
    const shortMax =
      longerAxis === 'y' ? c.y + c.h - BADGE_RADIUS : c.x + c.w - BADGE_RADIUS;
    let attempts = 0;
    while (attempts < 12) {
      const overlap = labels.find(
        (l) =>
          Math.hypot(l.labelX - lx, l.labelY - ly) < MIN_DIST
      );
      if (!overlap) break;
      // Shift away from the overlapping label along the longer axis
      const direction =
        longerAxis === 'y'
          ? (overlap.labelY > ly ? -1 : 1)
          : (overlap.labelX > lx ? -1 : 1);
      const step = MIN_DIST * 0.8 * direction;
      if (longerAxis === 'y') {
        ly = Math.max(shortMin, Math.min(shortMax, ly + step));
      } else {
        lx = Math.max(shortMin, Math.min(shortMax, lx + step));
      }
      attempts++;
    }
    const needsLeader =
      Math.hypot(lx - centroid.x, ly - centroid.y) > 0.5;
    labels.push({
      pieceId: c.pieceId,
      num: c.elementNum!,
      cx: centroid.x,
      cy: centroid.y,
      labelX: lx,
      labelY: ly,
      needsLeader,
    });
  }

  return (
    <div className={styles.tileSection}>
      <div className={styles.visual}>
        <h3 className={styles.tileSectionTitle}>
          {t.tileCutPlan} #{tileNumber}
        </h3>
        <div className={styles.imgContainer}>
          <img
            src={tileImageUrl(tileNumber)}
            className={styles.tileImg}
            alt={`Плочка ${tileNumber}`}
          />
          {/* Thin SVG overlay with cut lines and small element-number labels */}
          <svg
            viewBox={`0 0 ${tw} ${th}`}
            className={styles.svgOverlay}
          >
            {/* Pass 1: cut rectangles */}
            {cuts.map((cut) => (
              <rect
                key={`r-${cut.pieceId}`}
                x={cut.x}
                y={cut.y}
                width={cut.w}
                height={cut.h}
                fill="none"
                stroke="#ef4444"
                strokeWidth="0.15"
                strokeDasharray="1.2,0.8"
              />
            ))}
            {/* Pass 2: leader lines (drawn before badges so badges sit on top) */}
            {labels
              .filter((l) => l.needsLeader)
              .map((l) => (
                <line
                  key={`ll-${l.pieceId}`}
                  x1={l.cx}
                  y1={l.cy}
                  x2={l.labelX}
                  y2={l.labelY}
                  stroke="#ef4444"
                  strokeWidth="0.15"
                />
              ))}
            {/* Pass 3: small dots at original centroids */}
            {labels
              .filter((l) => l.needsLeader)
              .map((l) => (
                <circle
                  key={`d-${l.pieceId}`}
                  cx={l.cx}
                  cy={l.cy}
                  r="0.5"
                  fill="#ef4444"
                />
              ))}
            {/* Pass 4: badge circles + element numbers */}
            {labels.map((l) => (
              <g key={`b-${l.pieceId}`}>
                <circle
                  cx={l.labelX}
                  cy={l.labelY}
                  r={BADGE_RADIUS}
                  fill="#fff"
                  stroke="#ef4444"
                  strokeWidth="0.3"
                />
                <text
                  x={l.labelX}
                  y={l.labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#ef4444"
                  fontSize="2.4"
                  fontWeight="bold"
                >
                  {l.num}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className={styles.descriptions}>
        <h3 className={styles.chainTitle}>
          {t.pieceLabel} {tileNumber} — {t.cuts}
        </h3>

        {allPieces.map((piece) => {
          const pl = getPiecePlacement(walls, piece.id);
          const isPlaced = !!pl;
          const wall = isPlaced ? walls.find((w) => w.id === pl!.wall.id) : null;
          const wallName = wall ? wall.name : '';
          const placement = isPlaced
            ? pl!.surface
              ? pl!.wall.nicheTiles![pl!.surface][pl!.key]
              : pl!.wall.tiles[pl!.key]
            : null;
          const elemNum = elemByPieceId.get(piece.id);

          return (
            <div key={piece.id} className={styles.pieceDesc}>
              <div className={styles.pieceHeader}>
                {elemNum !== undefined && (
                  <>
                    <span className={styles.elementBadgeLabel}>№</span>
                    <span className={styles.elementBadgeInline}>{elemNum}</span>
                  </>
                )}
                <span className={styles.pieceBadgeLabel}>ID</span>
                <span className={styles.pieceBadge}>{piece.id}</span>
                <span className={styles.pieceDims}>
                  {piece.width.toFixed(1)} × {piece.height.toFixed(1)} см
                </span>
              </div>
              <p className={styles.pieceInfo}>
                {isPlaced ? (
                  <>
                    <strong>{t.position}:</strong> {wallName}
                    {pl!.surface ? `, ${t.surfaceLabels(pl!.surface)}` : ''}
                    {placement
                      ? `, ${t.offset} (${(placement.offsetX ?? 0).toFixed(1)}, ${(placement.offsetY ?? 0).toFixed(1)}), ${t.rotation} ${placement.rotation}°`
                      : ''}
                  </>
                ) : (
                  <strong>{t.available} ({t.unplaced})</strong>
                )}
              </p>
            </div>
          );
        })}

        {(() => {
          const unplacedArea = allPieces
            .filter((p) => !placed.has(p.id) && p.id !== rootId)
            .reduce((sum, p) => sum + p.width * p.height, 0);
          if (unplacedArea <= 0.1) return null;
          return (
            <div className={styles.waste}>
              {t.unusedArea}: {unplacedArea.toFixed(0)} см²
            </div>
          );
        })()}
      </div>
    </div>
  );
}
