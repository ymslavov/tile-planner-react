import type { Piece, Wall } from '../../store/types';
import { getChildPieces, getPiecePlacement, getTileW, getTileH } from '../../services/pieceHelpers';
import type { Orientation } from '../../store/types';
import styles from './CutSheet.module.css';

interface CutTileSectionProps {
  tileNumber: number;
  allPieces: Piece[];
  pieces: Record<string, Piece>;
  walls: Wall[];
  placed: Map<string, { wallId: string; location: string }>;
  orientation: Orientation;
}

export function CutTileSection({
  tileNumber,
  allPieces,
  pieces,
  walls,
  placed,
  orientation,
}: CutTileSectionProps) {
  const tw = getTileW(orientation);
  const th = getTileH(orientation);
  const rootId = String(tileNumber);

  return (
    <div className={styles.tileSection}>
      {/* Left: tile image with cut lines */}
      <div className={styles.visual}>
        <div className={styles.imgContainer}>
          <img
            src={`/tiles/${tileNumber}.jpg`}
            className={styles.tileImg}
            alt={`Tile ${tileNumber}`}
          />
          {/* SVG overlay with cut lines */}
          <svg
            viewBox={`0 0 ${tw} ${th}`}
            className={styles.svgOverlay}
          >
            {allPieces.map((piece) => {
              const pl = getPiecePlacement(walls, piece.id);
              if (!pl) return null;
              const children = getChildPieces(pieces, piece.id);
              if (children.length === 0) return null;

              return children.map((child) => {
                const cr = child.imageRegion;
                return (
                  <g key={child.id}>
                    <rect
                      x={cr.x}
                      y={cr.y}
                      width={cr.w}
                      height={cr.h}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="0.5"
                      strokeDasharray="2,1"
                    />
                    <text
                      x={cr.x + cr.w / 2}
                      y={cr.y + cr.h / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ef4444"
                      fontSize="4"
                      fontWeight="bold"
                    >
                      {child.id}
                    </text>
                  </g>
                );
              });
            })}
          </svg>
        </div>
      </div>

      {/* Right: piece chain descriptions */}
      <div className={styles.descriptions}>
        <h3 className={styles.chainTitle}>
          Tile {tileNumber} — Cut Chain
        </h3>

        {allPieces.map((piece) => {
          const pl = getPiecePlacement(walls, piece.id);
          const isPlaced = !!pl;
          const wall = isPlaced
            ? walls.find((w) => w.id === pl!.wall.id)
            : null;
          const wallName = wall ? wall.name : '';
          const placement = isPlaced
            ? pl!.surface
              ? pl!.wall.nicheTiles![pl!.surface][pl!.key]
              : pl!.wall.tiles[pl!.key]
            : null;

          return (
            <div key={piece.id} className={styles.pieceDesc}>
              <div className={styles.pieceHeader}>
                <span className={styles.pieceBadge}>{piece.id}</span>
                <span className={styles.pieceDims}>
                  {piece.width.toFixed(1)} &times; {piece.height.toFixed(1)} cm
                </span>
              </div>
              <p className={styles.pieceInfo}>
                {isPlaced ? (
                  <>
                    <strong>Placed:</strong> {wallName}
                    {pl!.surface ? `, niche ${pl!.surface}` : ''}, {pl!.key}
                    {placement
                      ? `, anchor: ${placement.anchor}, rotation: ${placement.rotation}\u00B0`
                      : ''}
                  </>
                ) : (
                  <strong>Available (unplaced)</strong>
                )}
              </p>
            </div>
          );
        })}

        {/* Waste */}
        {(() => {
          const unplacedArea = allPieces
            .filter((p) => !placed.has(p.id) && p.id !== rootId)
            .reduce((sum, p) => sum + p.width * p.height, 0);
          if (unplacedArea <= 0.1) return null;
          return (
            <div className={styles.waste}>
              Unused offcut area: {unplacedArea.toFixed(0)} cm&sup2;
            </div>
          );
        })()}
      </div>
    </div>
  );
}
