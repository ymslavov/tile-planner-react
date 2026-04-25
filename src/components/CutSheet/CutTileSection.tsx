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
            {cuts.map((cut) => {
              const centroid = pieceCentroidInTile(pieces[cut.pieceId]);
              return (
                <g key={cut.pieceId}>
                  <rect
                    x={cut.x}
                    y={cut.y}
                    width={cut.w}
                    height={cut.h}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="0.15"
                    strokeDasharray="1.2,0.8"
                  />
                  {/* Element number badge — small white-circle with red number */}
                  {cut.elementNum !== null && (
                    <g>
                      <circle
                        cx={centroid.x}
                        cy={centroid.y}
                        r="2.5"
                        fill="#fff"
                        stroke="#ef4444"
                        strokeWidth="0.3"
                      />
                      <text
                        x={centroid.x}
                        y={centroid.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#ef4444"
                        fontSize="2.4"
                        fontWeight="bold"
                      >
                        {cut.elementNum}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
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
                  <span className={styles.elementBadgeInline}>{elemNum}</span>
                )}
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
