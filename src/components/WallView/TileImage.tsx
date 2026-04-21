import type { Piece, Placement, Orientation } from '../../store/types';
import { tileImageUrl } from '../../constants';

interface TileImageProps {
  piece: Piece;
  placement: Placement;
  slotW: number;
  slotH: number;
  scale: number;
  orientation: Orientation;
  /** Draft offsets during in-slot drag. When provided, override placement.offsetX/Y visually. */
  draftOffsetX?: number;
  draftOffsetY?: number;
  onMouseDown?: (e: React.MouseEvent<HTMLImageElement>) => void;
}

export function TileImage({
  piece,
  placement,
  slotW,
  slotH,
  scale,
  orientation,
  draftOffsetX,
  draftOffsetY,
  onMouseDown,
}: TileImageProps) {
  const ir = piece.imageRegion;
  const tileId = piece.sourceTileId;
  const placementRotation = placement.rotation || 0;
  const offsetX = draftOffsetX ?? placement.offsetX ?? 0;
  const offsetY = draftOffsetY ?? placement.offsetY ?? 0;

  if (orientation === 'portrait') {
    const srcW = 60;
    const srcH = 120;
    // offsetX/Y shift the piece's top-left relative to the slot's top-left.
    // When offsetX < 0 the piece extends left; the image is shifted accordingly.
    const imgLeft = (offsetX - ir.x) * scale;
    const imgTop = (offsetY - ir.y) * scale;

    let rotStyle: React.CSSProperties = {};
    if (placementRotation !== 0) {
      const originX = (ir.x - offsetX + slotW / 2) * scale;
      const originY = (ir.y - offsetY + slotH / 2) * scale;
      rotStyle = {
        transform: `rotate(${placementRotation}deg)`,
        transformOrigin: `${originX}px ${originY}px`,
      };
    }

    return (
      <img
        src={tileImageUrl(tileId)}
        alt={`Tile ${tileId}`}
        style={{
          position: 'absolute',
          left: `${imgLeft}px`,
          top: `${imgTop}px`,
          width: `${srcW * scale}px`,
          height: `${srcH * scale}px`,
          display: 'block',
          cursor: onMouseDown ? 'grab' : undefined,
          userSelect: 'none',
          ...rotStyle,
        }}
        draggable={false}
        onMouseDown={onMouseDown}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  } else {
    // Landscape: source image is portrait (60x120cm), CSS-rotated 90 CW
    const srcW = 120;
    const srcH = 60;
    const naturalW = srcW * scale;
    const naturalH = srcH * scale;
    const preLeft = -(ir.y * scale);
    const preTop = ir.x * scale;
    const totalRotation = 90 + placementRotation;

    return (
      <img
        src={tileImageUrl(tileId)}
        alt={`Tile ${tileId}`}
        style={{
          position: 'absolute',
          left: `${preLeft}px`,
          top: `${preTop}px`,
          width: `${naturalW}px`,
          height: `${naturalH}px`,
          display: 'block',
          cursor: onMouseDown ? 'grab' : undefined,
          userSelect: 'none',
          transform: `rotate(${totalRotation}deg)`,
          transformOrigin: 'top left',
          translate: `0 -${naturalW}px`,
        }}
        draggable={false}
        onMouseDown={onMouseDown}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
}
