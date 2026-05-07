import type { NicheRect, Wall, Piece } from '../../store/types';
import { tileImageUrl } from '../../constants';

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
          offsetX={backPlacement?.offsetX ?? 0}
          offsetY={backPlacement?.offsetY ?? 0}
          scale={scale}
        />
      )}
    </div>
  );
}

interface NicheBackImageProps {
  piece: Piece;
  rotation: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

/**
 * Renders the back-surface tile cropped to fit the niche opening.
 *
 * Mirrors the layout used by SurfaceGrid: a piece-sized container is
 * positioned at (offsetX, offsetY) within the niche slot, and the source
 * tile image is shifted inside that container so the piece's imageRegion
 * lines up with the container's top-left. This way, dragging the back
 * tile in the niche surface panel is faithfully reflected on the wall.
 */
function NicheBackImage({ piece, rotation, offsetX, offsetY, scale }: NicheBackImageProps) {
  const ir = piece.imageRegion;
  const srcW = 60;
  const srcH = 120;

  let rotCss: React.CSSProperties = {};
  if (rotation !== 0) {
    const ox = (ir.x + piece.width / 2) * scale;
    const oy = (ir.y + piece.height / 2) * scale;
    rotCss = {
      transform: `rotate(${rotation}deg)`,
      transformOrigin: `${ox}px ${oy}px`,
    };
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: `${offsetX * scale}px`,
        top: `${offsetY * scale}px`,
        width: `${piece.width * scale}px`,
        height: `${piece.height * scale}px`,
        overflow: 'hidden',
      }}
    >
      <img
        src={tileImageUrl(piece.sourceTileId)}
        alt={`Niche back ${piece.id}`}
        style={{
          position: 'absolute',
          left: `${-ir.x * scale}px`,
          top: `${-ir.y * scale}px`,
          width: `${srcW * scale}px`,
          height: `${srcH * scale}px`,
          display: 'block',
          ...rotCss,
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
        draggable={false}
      />
    </div>
  );
}
