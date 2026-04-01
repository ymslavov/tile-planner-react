import type { Piece, Placement, Orientation } from '../../store/types';

interface TileImageProps {
  piece: Piece;
  placement: Placement;
  slotW: number;
  slotH: number;
  scale: number;
  orientation: Orientation;
}

export function TileImage({
  piece,
  placement,
  slotW,
  slotH,
  scale,
  orientation,
}: TileImageProps) {
  const ir = piece.imageRegion;
  const tileId = piece.sourceTileId;
  const placementRotation = placement.rotation || 0;

  if (orientation === 'portrait') {
    const srcW = 60;
    const srcH = 120;
    const imgLeft = -(ir.x * scale);
    const imgTop = -(ir.y * scale);

    let rotStyle: React.CSSProperties = {};
    if (placementRotation !== 0) {
      const originX = (ir.x + slotW / 2) * scale;
      const originY = (ir.y + slotH / 2) * scale;
      rotStyle = {
        transform: `rotate(${placementRotation}deg)`,
        transformOrigin: `${originX}px ${originY}px`,
      };
    }

    return (
      <img
        src={`/tiles/${tileId}.jpg`}
        alt={`Tile ${tileId}`}
        style={{
          position: 'absolute',
          left: `${imgLeft}px`,
          top: `${imgTop}px`,
          width: `${srcW * scale}px`,
          height: `${srcH * scale}px`,
          display: 'block',
          ...rotStyle,
        }}
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
        src={`/tiles/${tileId}.jpg`}
        alt={`Tile ${tileId}`}
        style={{
          position: 'absolute',
          left: `${preLeft}px`,
          top: `${preTop}px`,
          width: `${naturalW}px`,
          height: `${naturalH}px`,
          display: 'block',
          transform: `rotate(${totalRotation}deg)`,
          transformOrigin: 'top left',
          translate: `0 -${naturalW}px`,
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
}
