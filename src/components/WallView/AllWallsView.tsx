import { useRef, useState, useEffect, useCallback } from 'react';
import type { Orientation, Piece, Wall } from '../../store/types';
import { computeGrid, computeNicheOverlap } from '../../services/gridEngine';
import { WallGrid } from './WallGrid';
import styles from './WallView.module.css';

interface AllWallsViewProps {
  walls: Wall[];
  pieces: Record<string, Piece>;
  orientation: Orientation;
}

/**
 * Renders every wall in a single horizontal strip, lined up edge-to-edge with
 * no gaps, at a unified scale that fits the strip into the available area.
 * Useful for visualising tile-pattern continuity across the whole bathroom.
 *
 * Each WallGrid stays interactive — drag/drop still routes through the
 * existing GridSlot/store logic, so this is a pure layout view, not a copy.
 */
export function AllWallsView({ walls, pieces, orientation }: AllWallsViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const totalWidth = walls.reduce((sum, w) => sum + w.width, 0);
  const maxHeight = walls.reduce((m, w) => Math.max(m, w.height), 0);

  const updateScale = useCallback(() => {
    if (!wrapRef.current) return;
    const availableWidth = (wrapRef.current.clientWidth || 600) - 80;
    const availableHeight = (wrapRef.current.clientHeight || 500) - 80;
    if (totalWidth <= 0 || maxHeight <= 0) return;
    const newScale = Math.min(
      availableWidth / totalWidth,
      availableHeight / maxHeight
    );
    setScale(Math.max(0.1, newScale));
  }, [totalWidth, maxHeight]);

  useEffect(() => {
    updateScale();
    if (!wrapRef.current) return;
    const observer = new ResizeObserver(() => updateScale());
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [updateScale]);

  return (
    <div className={styles.wallWrap} ref={wrapRef}>
      <div className={styles.wallContainer}>
        <div style={{ position: 'relative', margin: '28px 0 8px 40px' }}>
          {/* Total-width label */}
          <div
            style={{
              position: 'absolute',
              top: '-20px',
              left: 0,
              width: `${totalWidth * scale}px`,
              textAlign: 'center',
              fontSize: '11px',
              color: '#666',
              whiteSpace: 'nowrap',
            }}
          >
            {totalWidth} cm ({walls.length} walls)
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 0,
              minHeight: `${maxHeight * scale}px`,
            }}
          >
            {walls.map((wall) => {
              const grid = computeGrid(wall, orientation);
              const nicheOverlap = computeNicheOverlap(wall, grid);
              return (
                <div key={wall.id} style={{ position: 'relative' }}>
                  {/* Wall label */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: `-18px`,
                      left: 0,
                      width: `${wall.width * scale}px`,
                      textAlign: 'center',
                      fontSize: '10px',
                      color: '#666',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {wall.name} · {wall.width}×{wall.height}
                  </div>
                  <WallGrid
                    wall={wall}
                    pieces={pieces}
                    grid={grid}
                    nicheOverlap={nicheOverlap}
                    scale={scale}
                    orientation={orientation}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
