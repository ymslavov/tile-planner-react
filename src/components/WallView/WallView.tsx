import { useRef, useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { computeGrid, computeNicheOverlap } from '../../services/gridEngine';
import { WallTabs } from './WallTabs';
import { WallGrid } from './WallGrid';
import { AllWallsView } from './AllWallsView';
import { RemainderControls } from './RemainderControls';
import { NicheSurfaces } from '../NicheSurfaces/NicheSurfaces';
import styles from './WallView.module.css';

export function WallView() {
  const walls = useStore((s) => s.walls);
  const activeWallId = useStore((s) => s.activeWallId);
  const pieces = useStore((s) => s.pieces);
  const orientation = useStore((s) => s.orientation);
  const nicheMode = useStore((s) => s.nicheMode);

  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');

  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const wall = walls.find((w) => w.id === activeWallId);

  const updateScale = useCallback(() => {
    if (!wrapRef.current || !wall) return;
    const availableWidth = (wrapRef.current.clientWidth || 600) - 40;
    const availableHeight = (wrapRef.current.clientHeight || 500) - 60;
    const newScale = Math.min(
      availableWidth / wall.width,
      availableHeight / wall.height
    );
    setScale(newScale);
  }, [wall?.width, wall?.height]);

  useEffect(() => {
    if (viewMode !== 'single') return;
    updateScale();

    if (!wrapRef.current) return;
    const observer = new ResizeObserver(() => {
      updateScale();
    });
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [updateScale, viewMode]);

  if (!wall) return null;

  if (viewMode === 'all') {
    return (
      <div className={styles.centerPanel}>
        <WallTabs viewMode={viewMode} onViewModeChange={setViewMode} />
        <AllWallsView walls={walls} pieces={pieces} orientation={orientation} />
      </div>
    );
  }

  const grid = computeGrid(wall, orientation);
  const nicheOverlap = computeNicheOverlap(wall, grid);

  return (
    <div className={styles.centerPanel}>
      <WallTabs viewMode={viewMode} onViewModeChange={setViewMode} />

      <div className={styles.wallWrap} ref={wrapRef}>
        <div className={styles.wallContainer}>
          <div style={{ position: 'relative', margin: '28px 0 8px 40px' }}>
            {/* Width label */}
            <div
              style={{
                position: 'absolute',
                top: '-20px',
                left: 0,
                width: `${wall.width * scale}px`,
                textAlign: 'center',
                fontSize: '11px',
                color: '#666',
                whiteSpace: 'nowrap',
              }}
            >
              {wall.width} cm
            </div>

            {/* Height label */}
            <div
              style={{
                position: 'absolute',
                left: '-32px',
                top: 0,
                height: `${wall.height * scale}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                color: '#666',
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                whiteSpace: 'nowrap',
              }}
            >
              {wall.height} cm
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
        </div>
      </div>

      {/* Scale indicator */}
      <div className={styles.scaleIndicator}>
        Scale: 1cm = {scale.toFixed(1)}px &nbsp;|&nbsp; Wall: {wall.width} &times;{' '}
        {wall.height} cm
      </div>

      <RemainderControls />

      {wall.niche && (
        <NicheSurfaces wall={wall} pieces={pieces} orientation={orientation} nicheMode={nicheMode} />
      )}
    </div>
  );
}
