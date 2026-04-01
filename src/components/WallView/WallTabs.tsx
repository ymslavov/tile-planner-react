import { useStore } from '../../store';
import styles from './WallTabs.module.css';

export function WallTabs() {
  const walls = useStore((s) => s.walls);
  const activeWallId = useStore((s) => s.activeWallId);
  const setActiveWall = useStore((s) => s.setActiveWall);
  const addWall = useStore((s) => s.addWall);

  return (
    <div className={styles.bar}>
      {walls.map((wall) => (
        <div
          key={wall.id}
          className={`${styles.tab} ${wall.id === activeWallId ? styles.active : ''}`}
          onClick={() => setActiveWall(wall.id)}
          title={`${wall.name} - ${wall.width}x${wall.height} cm`}
        >
          {wall.name} ({wall.width}&times;{wall.height})
        </div>
      ))}
      <div className={styles.addBtn} onClick={addWall} title="Add wall">
        +
      </div>
    </div>
  );
}
