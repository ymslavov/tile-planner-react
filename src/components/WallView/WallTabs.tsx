import { useStore } from '../../store';
import styles from './WallTabs.module.css';

interface WallTabsProps {
  viewMode: 'single' | 'all';
  onViewModeChange: (mode: 'single' | 'all') => void;
}

export function WallTabs({ viewMode, onViewModeChange }: WallTabsProps) {
  const walls = useStore((s) => s.walls);
  const activeWallId = useStore((s) => s.activeWallId);
  const setActiveWall = useStore((s) => s.setActiveWall);
  const addWall = useStore((s) => s.addWall);

  return (
    <div className={styles.bar}>
      {walls.map((wall) => (
        <div
          key={wall.id}
          className={`${styles.tab} ${wall.id === activeWallId && viewMode === 'single' ? styles.active : ''}`}
          onClick={() => {
            setActiveWall(wall.id);
            onViewModeChange('single');
          }}
          title={`${wall.name} - ${wall.width}x${wall.height} cm`}
        >
          {wall.name} ({wall.width}&times;{wall.height})
        </div>
      ))}
      <div className={styles.addBtn} onClick={addWall} title="Add wall">
        +
      </div>
      <div
        className={`${styles.tab} ${viewMode === 'all' ? styles.active : ''}`}
        onClick={() => onViewModeChange(viewMode === 'all' ? 'single' : 'all')}
        title="Show all walls side-by-side"
        style={{ marginLeft: 'auto' }}
      >
        All walls
      </div>
    </div>
  );
}
