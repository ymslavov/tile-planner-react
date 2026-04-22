import type { Wall, Piece, Orientation, NicheMode, NicheSurfaceKey } from '../../store/types';
import { SurfaceGrid } from './SurfaceGrid';
import styles from './NicheSurfaces.module.css';

interface NicheSurfacesProps {
  wall: Wall;
  pieces: Record<string, Piece>;
  orientation: Orientation;
  nicheMode: NicheMode;
}

/**
 * Renders the 5 niche inner surfaces (back + 4 lips) below the wall grid.
 *
 * - **Independent mode**: all 5 surfaces are editable drop targets.
 * - **Wrap-around mode**: only the back is editable; the 4 lip surfaces are
 *   read-only — they display auto-generated strip pieces produced from the
 *   wall-face tiles that intersect the niche edges.
 */
export function NicheSurfaces({
  wall,
  pieces,
  orientation,
  nicheMode,
}: NicheSurfacesProps) {
  if (!wall.niche) return null;

  const surfaces: {
    key: NicheSurfaceKey;
    label: string;
    w: number;
    h: number;
  }[] = [
    { key: 'back',   label: 'Niche Back',   w: wall.niche.width, h: wall.niche.height },
    { key: 'left',   label: 'Niche Left',   w: wall.niche.depth, h: wall.niche.height },
    { key: 'right',  label: 'Niche Right',  w: wall.niche.depth, h: wall.niche.height },
    { key: 'top',    label: 'Niche Top',    w: wall.niche.width, h: wall.niche.depth  },
    { key: 'bottom', label: 'Niche Bottom', w: wall.niche.width, h: wall.niche.depth  },
  ];

  const isLipReadOnly = nicheMode === 'wrap-around';

  return (
    <div className={styles.container}>
      {nicheMode === 'wrap-around' && (
        <div className={styles.heading}>
          Niche Surfaces — Wrap-Around Mode (lip surfaces auto-populated from wall cuts)
        </div>
      )}
      {surfaces.map((surface) => {
        const readOnly = surface.key !== 'back' && isLipReadOnly;
        return (
          <div key={surface.key} className={styles.surface}>
            <h4 className={styles.surfaceTitle}>
              {surface.label} ({surface.w}&times;{surface.h} cm)
              {readOnly && <span className={styles.autoTag}> auto</span>}
            </h4>
            <SurfaceGrid
              surfaceKey={surface.key}
              surfaceW={surface.w}
              surfaceH={surface.h}
              tiles={(wall.nicheTiles && wall.nicheTiles[surface.key]) || {}}
              pieces={pieces}
              orientation={orientation}
              wallId={wall.id}
              readOnly={readOnly}
            />
          </div>
        );
      })}
    </div>
  );
}
