import type { NicheRect, Wall, Piece } from '../../store/types';

interface NicheOverlayProps {
  nicheRect: NicheRect;
  scale: number;
  wall: Wall;
  pieces: Record<string, Piece>;
}

/**
 * Renders the niche opening on the wall view.
 * - Shows the placed niche back tile (if any) filling the niche opening, so
 *   the user sees what's visible through the opening from the front.
 * - Draws a dashed blue border around the opening as a visual indicator.
 */
export function NicheOverlay({ nicheRect, scale, wall, pieces }: NicheOverlayProps) {
  const backPlacement = wall.nicheTiles?.back?.['0,0'];
  const backPiece = backPlacement ? pieces[backPlacement.pieceId] : undefined;

  const nicheW = nicheRect.width * scale;
  const nicheH = nicheRect.height * scale;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${nicheRect.left * scale}px`,
        top: `${nicheRect.top * scale}px`,
        width: `${nicheW}px`,
        height: `${nicheH}px`,
        background: backPiece ? 'transparent' : 'rgba(37, 99, 235, 0.08)',
        border: '2px dashed #2563eb',
        borderRadius: '2px',
        pointerEvents: 'none',
        zIndex: 5,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {backPiece && (
        <NicheBackImage
          piece={backPiece}
          rotation={backPlacement?.rotation ?? 0}
          nicheW={nicheRect.width}
          nicheH={nicheRect.height}
          scale={scale}
        />
      )}
    </div>
  );
}

interface NicheBackImageProps {
  piece: Piece;
  rotation: number;
  nicheW: number;
  nicheH: number;
  scale: number;
}

/**
 * Renders the back-surface tile cropped to fit the niche opening.
 * Source tile image is always 60×120 cm portrait. The piece.imageRegion
 * tells us which part of the tile this piece represents.
 */
function NicheBackImage({ piece, rotation, nicheW, nicheH, scale }: NicheBackImageProps) {
  const ir = piece.imageRegion;
  const srcW = 60;
  const srcH = 120;

  let rotStyle: React.CSSProperties = {};
  if (rotation !== 0) {
    const originX = (ir.x + nicheW / 2) * scale;
    const originY = (ir.y + nicheH / 2) * scale;
    rotStyle = {
      transform: `rotate(${rotation}deg)`,
      transformOrigin: `${originX}px ${originY}px`,
    };
  }

  return (
    <img
      src={`/tiles/${piece.sourceTileId}.jpg`}
      alt={`Niche back ${piece.id}`}
      style={{
        position: 'absolute',
        left: `${-ir.x * scale}px`,
        top: `${-ir.y * scale}px`,
        width: `${srcW * scale}px`,
        height: `${srcH * scale}px`,
        display: 'block',
        ...rotStyle,
      }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
      draggable={false}
    />
  );
}
