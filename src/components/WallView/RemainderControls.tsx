import { useStore } from '../../store';
import styles from './RemainderControls.module.css';

export function RemainderControls() {
  const walls = useStore((s) => s.walls);
  const activeWallId = useStore((s) => s.activeWallId);
  const setRemainderH = useStore((s) => s.setRemainderH);
  const setRemainderV = useStore((s) => s.setRemainderV);

  const wall = walls.find((w) => w.id === activeWallId);
  if (!wall) return null;

  return (
    <div className={styles.controls}>
      <label className={styles.mainLabel}>Remainder:</label>

      <div className={styles.group}>
        <label className={styles.groupLabel}>Horizontal:</label>
        {(['split', 'left', 'right'] as const).map((mode) => (
          <button
            key={mode}
            className={`btn-toggle btn-small ${wall.remainderH === mode ? 'active' : ''}`}
            onClick={() => setRemainderH(activeWallId, mode)}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      <div className={styles.group}>
        <label className={styles.groupLabel}>Vertical:</label>
        {(['split', 'bottom', 'top'] as const).map((mode) => (
          <button
            key={mode}
            className={`btn-toggle btn-small ${wall.remainderV === mode ? 'active' : ''}`}
            onClick={() => setRemainderV(activeWallId, mode)}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
