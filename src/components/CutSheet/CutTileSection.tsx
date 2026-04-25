import type { Piece, Wall } from '../../store/types';
import {
  getChildPieces,
  getPiecePlacement,
  getTileW,
  getTileH,
} from '../../services/pieceHelpers';
import type { Orientation } from '../../store/types';
import { tileImageUrl } from '../../constants';
import { placedPieceCentroidInTile, type ElementEntry } from '../../services/printData';
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

  // Build a map of pieceId → element entry (for any pieces that are placed)
  const elemByPieceId = new Map<string, ElementEntry>();
  for (const e of elements) {
    if (e.piece.sourceTileId === tileNumber) {
      elemByPieceId.set(e.pieceId, e);
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
        elementNum: elemByPieceId.get(child.id)?.num ?? null,
      });
    }
  }

  // Element-number labels are placed in a column to the RIGHT of the tile
  // image, with thin leader lines back to each piece's centroid. This matches
  // engineering-drawing conventions and reliably avoids overlap regardless of
  // how many pieces cluster in one area of the tile.
  const BADGE_RADIUS = 2.5; // viewBox units (cm)
  const COLUMN_X = tw + 5; // x position of label column (5 cm right of tile)
  const COLUMN_TOP = BADGE_RADIUS;
  const COLUMN_BOTTOM = th - BADGE_RADIUS;
  const MIN_SPACING = BADGE_RADIUS * 2 + 1; // vertical spacing between labels in column

  type LabelLayout = {
    pieceId: string;
    num: number;
    cx: number;        // piece centroid x (in tile)
    cy: number;        // piece centroid y (in tile)
    labelX: number;    // label x (in column)
    labelY: number;    // label y (in column)
  };

  // Step 1: compute centroids and sort labels by Y (top to bottom).
  // We label EVERY placed piece sourced from this tile (including the root
  // piece "N" itself, which doesn't appear in the children-of iteration but
  // does occupy a region in the tile). The centroid points at the part of
  // the tile actually used for that placement, so nested offcuts don't all
  // stack on the same dot.
  const labelsToPlace = elements
    .filter((e) => e.piece.sourceTileId === tileNumber)
    .map((e) => {
      const centroid = placedPieceCentroidInTile(
        e.piece,
        e.placement,
        e.slotW,
        e.slotH
      );
      return {
        pieceId: e.pieceId,
        num: e.num,
        cx: centroid.x,
        cy: centroid.y,
      };
    })
    .sort((a, b) => a.cy - b.cy);

  // Step 2: assign label Y positions in the column.
  // Greedy: each label sits at max(prevY + spacing, its natural Y), clamped
  // to the column. If the bottom is exceeded, shift everything up to fit.
  const labels: LabelLayout[] = [];
  let prevY = COLUMN_TOP - MIN_SPACING;
  for (const l of labelsToPlace) {
    const y = Math.max(prevY + MIN_SPACING, Math.min(COLUMN_BOTTOM, l.cy));
    labels.push({ ...l, labelX: COLUMN_X, labelY: y });
    prevY = y;
  }
  // If labels overflow the column bottom, shift them all up evenly.
  const lastY = labels[labels.length - 1]?.labelY ?? 0;
  if (lastY > COLUMN_BOTTOM) {
    const shift = lastY - COLUMN_BOTTOM;
    for (const l of labels) {
      l.labelY = Math.max(COLUMN_TOP, l.labelY - shift);
    }
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
          {/* SVG overlay extends past the tile's right edge to host the
              element-number label column. Cut lines + leader dots stay over
              the image; badges sit in the column on the right. */}
          <svg
            viewBox={`0 0 ${tw + 12} ${th}`}
            className={styles.svgOverlay}
            preserveAspectRatio="xMinYMin meet"
          >
            {/* Pass 1: cut rectangles on the tile */}
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
            {/* Pass 2: leader lines from each piece centroid to its column badge */}
            {labels.map((l) => (
              <line
                key={`ll-${l.pieceId}`}
                x1={l.cx}
                y1={l.cy}
                x2={l.labelX - BADGE_RADIUS}
                y2={l.labelY}
                stroke="#ef4444"
                strokeWidth="0.15"
              />
            ))}
            {/* Pass 3: small dots at original centroids */}
            {labels.map((l) => (
              <circle
                key={`d-${l.pieceId}`}
                cx={l.cx}
                cy={l.cy}
                r="0.5"
                fill="#ef4444"
              />
            ))}
            {/* Pass 4: badge circles + element numbers in the column */}
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
          const elemNum = elemByPieceId.get(piece.id)?.num;

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
