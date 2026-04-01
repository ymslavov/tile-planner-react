import type { Wall, Piece, Orientation, NicheMode, NicheSurfaceKey } from '../../store/types';
import { SurfaceGrid } from './SurfaceGrid';
import styles from './NicheSurfaces.module.css';

interface NicheSurfacesProps {
  wall: Wall;
  pieces: Record<string, Piece>;
  orientation: Orientation;
  nicheMode: NicheMode;
}

export function NicheSurfaces({
  wall,
  pieces,
  orientation,
  nicheMode,
}: NicheSurfacesProps) {
  if (!wall.niche) return null;

  if (nicheMode === 'wrap-around') {
    // Wrap-around: show niche back (droppable) + read-only lip info
    return (
      <div className={styles.container}>
        <div className={styles.heading}>
          Niche Surfaces — Wrap-Around Mode
        </div>

        {/* Back surface: droppable */}
        <div className={styles.surface}>
          <h4 className={styles.surfaceTitle}>
            Niche Back ({wall.niche.width}&times;{wall.niche.height} cm)
          </h4>
          <SurfaceGrid
            surfaceKey="back"
            surfaceW={wall.niche.width}
            surfaceH={wall.niche.height}
            tiles={(wall.nicheTiles && wall.nicheTiles.back) || {}}
            pieces={pieces}
            orientation={orientation}
            wallId={wall.id}
          />
        </div>

        {/* Lip surfaces: read-only info */}
        <div className={styles.lipInfo}>
          <strong>Lip surfaces (auto-populated from wall cuts):</strong>
          <br />
          {(['left', 'right', 'top', 'bottom'] as NicheSurfaceKey[]).map((lip) => {
            const tiles = (wall.nicheTiles && wall.nicheTiles[lip]) || {};
            const count = Object.keys(tiles).length;
            const tileList =
              count > 0
                ? Object.values(tiles)
                    .map((p) => {
                      const lp = pieces[p.pieceId];
                      return `#${lp ? lp.sourceTileId : p.pieceId}`;
                    })
                    .join(', ')
                : 'none';
            return (
              <span key={lip} className={styles.lipItem}>
                {lip.charAt(0).toUpperCase() + lip.slice(1)} Lip:{' '}
                <strong>{tileList}</strong>
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // Independent mode: show all 5 surfaces as droppable grids
  const surfaces: {
    key: NicheSurfaceKey;
    label: string;
    w: number;
    h: number;
  }[] = [
    { key: 'back', label: 'Niche Back', w: wall.niche.width, h: wall.niche.height },
    { key: 'left', label: 'Niche Left', w: wall.niche.depth, h: wall.niche.height },
    { key: 'right', label: 'Niche Right', w: wall.niche.depth, h: wall.niche.height },
    { key: 'top', label: 'Niche Top', w: wall.niche.width, h: wall.niche.depth },
    { key: 'bottom', label: 'Niche Bottom', w: wall.niche.width, h: wall.niche.depth },
  ];

  return (
    <div className={styles.container}>
      {surfaces.map((surface) => (
        <div key={surface.key} className={styles.surface}>
          <h4 className={styles.surfaceTitle}>
            {surface.label} ({surface.w}&times;{surface.h} cm)
          </h4>
          <SurfaceGrid
            surfaceKey={surface.key}
            surfaceW={surface.w}
            surfaceH={surface.h}
            tiles={(wall.nicheTiles && wall.nicheTiles[surface.key]) || {}}
            pieces={pieces}
            orientation={orientation}
            wallId={wall.id}
          />
        </div>
      ))}
    </div>
  );
}
