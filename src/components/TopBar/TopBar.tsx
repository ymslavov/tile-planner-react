import { useStore } from '../../store';
import styles from './TopBar.module.css';

export function TopBar() {
  const orientation = useStore((s) => s.orientation);
  const nicheMode = useStore((s) => s.nicheMode);
  const setOrientation = useStore((s) => s.setOrientation);
  const setNicheMode = useStore((s) => s.setNicheMode);
  const doExportJSON = useStore((s) => s.doExportJSON);
  const doImportJSON = useStore((s) => s.doImportJSON);
  const clearAll = useStore((s) => s.clearAll);
  const walls = useStore((s) => s.walls);

  const handleOrientationChange = (newOrientation: 'portrait' | 'landscape') => {
    if (orientation === newOrientation) return;
    // Check if any tiles are placed
    const hasPlaced = walls.some(
      (w) =>
        Object.keys(w.tiles).length > 0 ||
        (w.nicheTiles &&
          Object.values(w.nicheTiles).some((t) => Object.keys(t).length > 0))
    );
    if (hasPlaced) {
      const ok = confirm('Changing orientation will clear all tile placements. Continue?');
      if (!ok) return;
    }
    setOrientation(newOrientation);
  };

  const handleClear = () => {
    if (!confirm('Clear all tile placements on all walls? This cannot be undone.')) return;
    clearAll();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={styles.topBar}>
      <h1 className={styles.title}>Tile Planner</h1>
      <div className={styles.sep} />

      <div className={styles.controlGroup}>
        <label className={styles.label}>Orientation:</label>
        <button
          className={`btn-toggle ${orientation === 'portrait' ? 'active' : ''}`}
          onClick={() => handleOrientationChange('portrait')}
        >
          Portrait
        </button>
        <button
          className={`btn-toggle ${orientation === 'landscape' ? 'active' : ''}`}
          onClick={() => handleOrientationChange('landscape')}
        >
          Landscape
        </button>
      </div>

      <div className={styles.sep} />

      <div className={styles.controlGroup}>
        <label className={styles.label}>Niche mode:</label>
        <button
          className={`btn-toggle ${nicheMode === 'wrap-around' ? 'active' : ''}`}
          onClick={() => setNicheMode('wrap-around')}
        >
          Wrap-around
        </button>
        <button
          className={`btn-toggle ${nicheMode === 'independent' ? 'active' : ''}`}
          onClick={() => setNicheMode('independent')}
        >
          Independent
        </button>
      </div>

      <div className={styles.sep} />

      <div className={styles.controlGroup}>
        <button className="btn-secondary" onClick={doExportJSON}>
          Save JSON
        </button>
        <button className="btn-secondary" onClick={doImportJSON}>
          Load JSON
        </button>
        <button className="btn-primary" onClick={handlePrint}>
          Print Cut Sheet
        </button>
        <button className="btn-clear" onClick={handleClear}>
          Clear All
        </button>
      </div>
    </div>
  );
}
