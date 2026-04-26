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

  // Collect all cut rectangles to render with thin dashed lines.
  // Two sources of cuts on a tile:
  //   1. Child-piece bounding boxes (each cut subdivides the parent into smaller pieces)
  //   2. Cutouts within a piece (notches removed for niches, walls, etc.)
  // Cuts are deduplicated by (x,y,w,h) — many pieces in a chain share the same
  // imageRegion (e.g. 14-B, 14-B1, 14-B1a all occupy the same area), so without
  // dedup the same rectangle would be drawn multiple times overlapping.
  type CutRect = {
    x: number;
    y: number;
    w: number;
    h: number;
    pieceId: string;
    elementNum: number | null;
  };
  const cuts: CutRect[] = [];
  const cutKeys = new Set<string>();
  const addCut = (
    x: number,
    y: number,
    w: number,
    h: number,
    pieceId: string,
    elementNum: number | null
  ) => {
    const key = `${x.toFixed(2)},${y.toFixed(2)},${w.toFixed(2)},${h.toFixed(2)}`;
    if (cutKeys.has(key)) return;
    cutKeys.add(key);
    cuts.push({ x, y, w, h, pieceId, elementNum });
  };

  // Identify "unused" regions of the tile.
  //
  // For each PLACED piece, compute the rectangle that's actually visible in
  // its slot (offset + slot size determine which part of the piece is used).
  // Map that visible rect back to tile coords. Then any sub-piece's
  // imageRegion that doesn't significantly overlap a visible rect is "unused"
  // and gets a translucent gray overlay.
  //
  // Why not just gray the imageRegions of unplaced pieces? Because chains
  // like 7-C → 7-C1 → 7-C1a all share the same imageRegion. If 7-C is placed
  // but 7-C1a isn't, naively graying 7-C1a would dim the very area used by
  // its placed ancestor.
  type Rect = { x: number; y: number; w: number; h: number };
  const visibleRects: Rect[] = [];
  for (const piece of allPieces) {
    if (!placed.has(piece.id)) continue;
    const elem = elemByPieceId.get(piece.id);
    if (!elem) continue;
    const ir = piece.imageRegion;
    const offX = elem.placement.offsetX ?? 0;
    const offY = elem.placement.offsetY ?? 0;
    const isRotated =
      Math.abs(piece.width - ir.w) > 0.01 &&
      Math.abs(piece.width - ir.h) < 0.01;
    // Visible portion in piece-local coords (axis-aligned to the piece).
    const vxL = Math.max(0, -offX);
    const vyT = Math.max(0, -offY);
    const vxR = Math.min(piece.width, elem.slotW - offX);
    const vyB = Math.min(piece.height, elem.slotH - offY);
    if (vxR <= vxL || vyB <= vyT) continue;
    if (isRotated) {
      // 90° CW: piece-local (x,y) → tile (ir.x + ir.w - y - h, ir.y + x).
      visibleRects.push({
        x: ir.x + ir.w - vyB,
        y: ir.y + vxL,
        w: vyB - vyT,
        h: vxR - vxL,
      });
    } else {
      visibleRects.push({
        x: ir.x + vxL,
        y: ir.y + vyT,
        w: vxR - vxL,
        h: vyB - vyT,
      });
    }
  }

  // Total used area on the tile is the sum of visibleRects' areas (assuming
  // they don't overlap, which holds when each placement maps to a distinct
  // slot region of the tile). Used to compute the "unused area" footer.
  const usedArea = visibleRects.reduce((s, r) => s + r.w * r.h, 0);
  const tileArea = tw * th;
  const unusedAreaTotal = Math.max(0, tileArea - usedArea);

  // Unique mask id per tile so multiple cut sheets in one DOM don't collide.
  const maskId = `unused-mask-${tileNumber}`;

  for (const piece of allPieces) {
    // 1. Child bounding boxes (the cut that separates this piece from its siblings)
    const children = getChildPieces(pieces, piece.id);
    for (const child of children) {
      const cr = child.imageRegion;
      addCut(
        cr.x,
        cr.y,
        cr.w,
        cr.h,
        child.id,
        elemByPieceId.get(child.id)?.num ?? null
      );
    }

    // 2. Cutouts inside this piece (notches — additional cut lines needed to
    //    physically cut the piece's L/U/frame shape from its rectangular bounding
    //    box). Cutout coords are in the piece's local coord system, which may
    //    differ from the tile coord system if the piece is rotated relative to
    //    its imageRegion (when piece.width != imageRegion.w).
    if (piece.geometry.cutouts.length > 0) {
      const ir = piece.imageRegion;
      const isRotated =
        Math.abs(piece.width - ir.w) > 0.01 &&
        Math.abs(piece.width - ir.h) < 0.01;
      for (const co of piece.geometry.cutouts) {
        let cx: number, cy: number, cw: number, ch: number;
        if (isRotated) {
          // Piece is rotated 90° within its imageRegion (CW): piece-local (x,y)
          // maps to tile (ir.x + ir.w - y - h, ir.y + x), and dimensions swap.
          cx = ir.x + ir.w - co.y - co.h;
          cy = ir.y + co.x;
          cw = co.h;
          ch = co.w;
        } else {
          cx = ir.x + co.x;
          cy = ir.y + co.y;
          cw = co.w;
          ch = co.h;
        }
        addCut(cx, cy, cw, ch, `${piece.id}-co`, null);
      }
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
            {/* Pass 0: gray overlay for unused regions of the tile.
                Mask: white = grayed, black = punched out (visible). We start
                white over the whole tile then paint black over each placed
                piece's visible rectangle, so the gray fill only paints the
                truly-unused area — even when multiple sub-pieces share the
                same imageRegion but only part of it is actually used. */}
            <defs>
              <mask id={maskId}>
                <rect x={0} y={0} width={tw} height={th} fill="white" />
                {visibleRects.map((r, i) => (
                  <rect
                    key={`vr-${i}`}
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    fill="black"
                  />
                ))}
              </mask>
            </defs>
            <rect
              x={0}
              y={0}
              width={tw}
              height={th}
              fill="#e5e7eb"
              opacity="0.2"
              mask={`url(#${maskId})`}
            />
            {/* The mask above also implicitly defines the cut lines bounding
                each visible region, so the explicit cut rectangles below
                continue to layer on top for crisp dashed outlines. */}
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
          // Only show placed pieces. Unplaced offcuts ("available") are
          // visualized via the gray-out on the tile image and the bottom
          // "unused area" footer; listing them as separate entries is noise.
          if (!pl) return null;
          const wall = walls.find((w) => w.id === pl.wall.id);
          const wallName = wall ? t.translateWallName(wall.name) : '';
          const placement = pl.surface
            ? pl.wall.nicheTiles![pl.surface][pl.key]
            : pl.wall.tiles[pl.key];
          const elemNum = elemByPieceId.get(piece.id)?.num;

          // For the root piece placed with offset (a leftover from cutting),
          // display its effective used dimensions and a "(leftover)" marker
          // instead of the misleading full-tile dims.
          const isRoot = piece.id === rootId;
          const hasChildren = getChildPieces(pieces, piece.id).length > 0;
          const offX = placement.offsetX ?? 0;
          const offY = placement.offsetY ?? 0;
          const isLeftover =
            isRoot &&
            hasChildren &&
            (Math.abs(offX) > 0.01 || Math.abs(offY) > 0.01);

          let dispW = piece.width;
          let dispH = piece.height;
          if (isLeftover) {
            const elem = elemByPieceId.get(piece.id);
            if (elem) {
              const usedLeft = Math.max(0, -offX);
              const usedTop = Math.max(0, -offY);
              const usedRight = Math.min(piece.width, elem.slotW - offX);
              const usedBottom = Math.min(piece.height, elem.slotH - offY);
              dispW = Math.max(0, usedRight - usedLeft);
              dispH = Math.max(0, usedBottom - usedTop);
            }
          }

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
                  {dispW.toFixed(1)} × {dispH.toFixed(1)} см
                  {isLeftover ? ` (${t.leftover})` : ''}
                </span>
              </div>
              <p className={styles.pieceInfo}>
                <strong>{t.position}:</strong> {wallName}
                {pl.surface ? `, ${t.surfaceLabels(pl.surface)}` : ''}
              </p>
            </div>
          );
        })}

        {(() => {
          // Unused area = total tile area minus the sum of visible portions
          // of all placed pieces. Computed once at the top of the component.
          if (unusedAreaTotal <= 0.1) return null;
          return (
            <div className={styles.waste}>
              {t.unusedArea}: {unusedAreaTotal.toFixed(0)} см²
            </div>
          );
        })()}
      </div>
    </div>
  );
}
