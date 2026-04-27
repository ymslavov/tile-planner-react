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

  // hasPlacedInSubtree(pieceId): true if pieceId itself or any descendant
  // is placed. Used by the cut-rendering loop to skip cutlines for unused
  // offcut chains (otherwise stray boundaries appear inside placed regions).
  const hasPlacedInSubtree = (pieceId: string): boolean => {
    if (placed.has(pieceId)) return true;
    for (const c of getChildPieces(pieces, pieceId)) {
      if (hasPlacedInSubtree(c.id)) return true;
    }
    return false;
  };
  // True iff any descendant (NOT the piece itself) is placed. Used to tell
  // "tile cut into multiple placed pieces" (treat root as tile-as-source)
  // apart from "tile used whole, with stray unplaced offcuts" (root is the
  // actual element).
  const hasPlacedChildPiece = (pieceId: string): boolean => {
    for (const c of getChildPieces(pieces, pieceId)) {
      if (placed.has(c.id) || hasPlacedChildPiece(c.id)) return true;
    }
    return false;
  };
  const rootIsTileSource = hasPlacedChildPiece(rootId);

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
  // Map placed-piece-id → visible rect in tile coords. Lets cutline drawing
  // (further below) reuse exactly what the gray-out mask treats as used.
  const visibleByPieceId = new Map<string, Rect>();
  for (const piece of allPieces) {
    if (!placed.has(piece.id)) continue;
    if (piece.id === rootId && rootIsTileSource) {
      continue;
    }
    const elem = elemByPieceId.get(piece.id);
    if (!elem) continue;
    const ir = piece.imageRegion;
    const offX = elem.placement.offsetX ?? 0;
    const offY = elem.placement.offsetY ?? 0;
    const isRotated =
      Math.abs(piece.width - ir.w) > 0.01 &&
      Math.abs(piece.width - ir.h) < 0.01;
    const vxL = Math.max(0, -offX);
    const vyT = Math.max(0, -offY);
    const vxR = Math.min(piece.width, elem.slotW - offX);
    const vyB = Math.min(piece.height, elem.slotH - offY);
    if (vxR <= vxL || vyB <= vyT) continue;
    let rect: Rect;
    if (isRotated) {
      rect = {
        x: ir.x + ir.w - vyB,
        y: ir.y + vxL,
        w: vyB - vyT,
        h: vxR - vxL,
      };
    } else {
      rect = {
        x: ir.x + vxL,
        y: ir.y + vyT,
        w: vxR - vxL,
        h: vyB - vyT,
      };
    }
    visibleRects.push(rect);
    visibleByPieceId.set(piece.id, rect);
  }

  // Total used area on the tile is the sum of visibleRects' areas (assuming
  // they don't overlap, which holds when each placement maps to a distinct
  // slot region of the tile). Used to compute the "unused area" footer.
  const usedArea = visibleRects.reduce((s, r) => s + r.w * r.h, 0);
  const tileArea = tw * th;
  const unusedAreaTotal = Math.max(0, tileArea - usedArea);

  // Unique mask id per tile so multiple cut sheets in one DOM don't collide.
  const maskId = `unused-mask-${tileNumber}`;

  // Cutlines mirror the actually-USED rectangles, NOT each piece's full
  // imageRegion. Workers need to cut the size that's installed; outlining
  // the larger imageRegion when the slot trims the piece down would tell
  // them to cut a bigger piece than necessary and confuse the boundary
  // with the grayed-out region.
  for (const piece of allPieces) {
    if (!placed.has(piece.id)) continue;
    if (piece.id === rootId && rootIsTileSource) continue;
    const vr = visibleByPieceId.get(piece.id);
    if (!vr) continue;
    addCut(
      vr.x,
      vr.y,
      vr.w,
      vr.h,
      piece.id,
      elemByPieceId.get(piece.id)?.num ?? null
    );

    // Notches (cutouts) are part of the piece's geometry — but only those
    // that fall within the visible rect represent cuts the worker actually
    // makes. When the piece is trimmed by its slot, notches outside the
    // visible region are on discarded material and would mislead.
    if (piece.geometry.cutouts.length === 0) continue;
    const ir = piece.imageRegion;
    const isRotated =
      Math.abs(piece.width - ir.w) > 0.01 &&
      Math.abs(piece.width - ir.h) < 0.01;
    for (const co of piece.geometry.cutouts) {
      let cx: number, cy: number, cw: number, ch: number;
      if (isRotated) {
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
      // Skip notches that don't overlap the visible rect.
      const ox = Math.max(0, Math.min(cx + cw, vr.x + vr.w) - Math.max(cx, vr.x));
      const oy = Math.max(0, Math.min(cy + ch, vr.y + vr.h) - Math.max(cy, vr.y));
      if (ox <= 0.01 || oy <= 0.01) continue;
      addCut(cx, cy, cw, ch, `${piece.id}-co`, null);
    }
  }

  // Piece-ID labels are placed in a column to the RIGHT of the tile image,
  // with thin leader lines back to each piece's centroid. This matches
  // engineering-drawing conventions and reliably avoids overlap regardless
  // of how many pieces cluster in one area of the tile.
  const BADGE_HEIGHT = 3.5; // viewBox units (cm); pill height
  const BADGE_HALF = BADGE_HEIGHT / 2;
  const CHAR_W = 1.6; // approx glyph width at fontSize 2.4
  const BADGE_PAD = 1.2;
  const COLUMN_X = tw + 5; // x position of label column (5 cm right of tile)
  const COLUMN_TOP = BADGE_HALF;
  const COLUMN_BOTTOM = th - BADGE_HALF;
  const MIN_SPACING = BADGE_HEIGHT + 1; // vertical spacing between labels

  type LabelLayout = {
    pieceId: string;
    cx: number;        // piece centroid x (in tile)
    cy: number;        // piece centroid y (in tile)
    labelX: number;    // label center x (in column)
    labelY: number;    // label center y (in column)
    badgeW: number;    // badge width (in viewBox units)
  };

  // Step 1: compute centroids and sort labels by Y (top to bottom).
  // We label EVERY placed piece sourced from this tile (including the root
  // piece "N" itself, which doesn't appear in the children-of iteration but
  // does occupy a region in the tile). The centroid points at the part of
  // the tile actually used for that placement, so nested offcuts don't all
  // stack on the same dot.
  // Match the description-list rule: drop the root piece's label only when
  // the tile has been cut into multiple PLACED pieces (rootIsTileSource).
  // If the only sub-pieces are unplaced stray offcuts, the root is being
  // used whole and gets a real label like any other element.
  const labelsToPlace = elements
    .filter((e) => e.piece.sourceTileId === tileNumber)
    .filter((e) => !(rootIsTileSource && e.pieceId === rootId))
    .map((e) => {
      const centroid = placedPieceCentroidInTile(
        e.piece,
        e.placement,
        e.slotW,
        e.slotH
      );
      return {
        pieceId: e.pieceId,
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
    const badgeW = l.pieceId.length * CHAR_W + BADGE_PAD * 2;
    labels.push({ ...l, labelX: COLUMN_X, labelY: y, badgeW });
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
              piece-ID label column. Cut lines + leader dots stay over the
              image; pill-shaped ID badges sit in the column on the right.
              The viewBox width grows with the longest piece-ID badge so
              long chain IDs (e.g. "1-B1a1a1") aren't clipped. */}
          <svg
            viewBox={`0 0 ${Math.max(tw + 12, COLUMN_X + (labels.reduce((m, l) => Math.max(m, l.badgeW), 0)) / 2 + 1)} ${th}`}
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
              fill="#ffffff"
              opacity="0.75"
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
                x2={l.labelX - l.badgeW / 2}
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
            {/* Pass 4: piece-ID pill badges in the column */}
            {labels.map((l) => (
              <g key={`b-${l.pieceId}`}>
                <rect
                  x={l.labelX - l.badgeW / 2}
                  y={l.labelY - BADGE_HALF}
                  width={l.badgeW}
                  height={BADGE_HEIGHT}
                  rx={BADGE_HALF}
                  ry={BADGE_HALF}
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
                  {l.pieceId}
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
          // Hide the root "whole tile" entry only when the tile has been
          // cut into multiple PLACED pieces — in that case the root is
          // tile-as-source and listing it alongside the cuts is noise.
          // If the only sub-pieces are unplaced stray offcuts, keep the
          // root entry: the user is using the tile whole.
          if (piece.id === rootId && rootIsTileSource) {
            return null;
          }
          const wall = walls.find((w) => w.id === pl.wall.id);
          const wallName = wall ? t.translateWallName(wall.name) : '';
          const placement = pl.surface
            ? pl.wall.nicheTiles![pl.surface][pl.key]
            : pl.wall.tiles[pl.key];

          // Show the EFFECTIVE used dimensions (= the size of the piece's
          // visible portion in its slot) rather than the raw piece dims.
          // The visible portion is what the user has to physically cut, so
          // it's what they need on the cut sheet — raw piece dims of an
          // ancestor piece are misleading when the slot is smaller.
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
          const elem = elemByPieceId.get(piece.id);
          if (elem) {
            const usedLeft = Math.max(0, -offX);
            const usedTop = Math.max(0, -offY);
            const usedRight = Math.min(piece.width, elem.slotW - offX);
            const usedBottom = Math.min(piece.height, elem.slotH - offY);
            dispW = Math.max(0, usedRight - usedLeft);
            dispH = Math.max(0, usedBottom - usedTop);
          }

          return (
            <div key={piece.id} className={styles.pieceDesc}>
              <div className={styles.pieceHeader}>
                <span className={styles.pieceBadge}>{piece.id}</span>
                <span className={styles.pieceDims}>
                  {dispW.toFixed(1)} × {dispH.toFixed(1)} см
                  {isLeftover ? ` (${t.leftover})` : ''}
                </span>
              </div>
              <p className={styles.pieceInfo}>
                <strong>{t.position}:</strong> {wallName}
                {pl.surface ? `, ${t.surfaceLabels(pl.surface)}` : ''}
                {elem &&
                  (() => {
                    // Position of the piece's used (visible) top-left corner
                    // within the wall (or niche surface) — "X cm from left,
                    // Y cm from top". Computed from slot.x + max(0, offset).
                    const fromLeft = elem.slotX + Math.max(0, offX);
                    const fromTop = elem.slotY + Math.max(0, offY);
                    return ` · ${fromLeft.toFixed(1)} см ${t.fromLeft}, ${fromTop.toFixed(1)} см ${t.fromTop}`;
                  })()}
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
