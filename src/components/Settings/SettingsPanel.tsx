import { useStore } from '../../store';
import type { Niche } from '../../store/types';
import styles from './SettingsPanel.module.css';

export function SettingsPanel() {
  const walls = useStore((s) => s.walls);
  const activeWallId = useStore((s) => s.activeWallId);
  const updateWallDimension = useStore((s) => s.updateWallDimension);
  const toggleNiche = useStore((s) => s.toggleNiche);
  const updateNiche = useStore((s) => s.updateNiche);
  const centerNiche = useStore((s) => s.centerNiche);
  const deleteWall = useStore((s) => s.deleteWall);

  const wall = walls.find((w) => w.id === activeWallId);
  if (!wall) return null;

  const handleDimensionChange = (field: 'width' | 'height', value: string) => {
    const v = parseFloat(value);
    if (v > 0) {
      updateWallDimension(activeWallId, field, v);
    }
  };

  const handleNicheToggle = (checked: boolean) => {
    toggleNiche(activeWallId, checked);
  };

  const handleNicheChange = (field: keyof Niche, value: string) => {
    const v = parseFloat(value);
    if (!isNaN(v) && v >= 0) {
      updateNiche(activeWallId, field, v);
    }
  };

  const handleDelete = () => {
    if (walls.length <= 1) {
      alert('Cannot delete the last wall.');
      return;
    }
    if (!confirm(`Delete "${wall.name}"? All placed tiles will return to the pool.`)) return;
    deleteWall(activeWallId);
  };

  const nicheFields: { id: string; label: string; field: keyof Niche }[] = [
    { id: 'niche-width', label: 'Width', field: 'width' },
    { id: 'niche-height', label: 'Height', field: 'height' },
    { id: 'niche-depth', label: 'Depth', field: 'depth' },
    { id: 'niche-from-floor', label: 'From floor', field: 'fromFloor' },
    { id: 'niche-from-left', label: 'From left', field: 'fromLeft' },
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Wall Settings</div>
      <div className={styles.body}>
        {/* Wall dimensions */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Width</label>
          <div className={styles.fieldInline}>
            <input
              type="number"
              min={1}
              max={9999}
              value={wall.width}
              onChange={(e) => handleDimensionChange('width', e.target.value)}
            />
            <span className={styles.unit}>cm</span>
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Height</label>
          <div className={styles.fieldInline}>
            <input
              type="number"
              min={1}
              max={9999}
              value={wall.height}
              onChange={(e) => handleDimensionChange('height', e.target.value)}
            />
            <span className={styles.unit}>cm</span>
          </div>
        </div>

        <hr className={styles.divider} />

        {/* Niche toggle */}
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={!!wall.niche}
            onChange={(e) => handleNicheToggle(e.target.checked)}
          />
          <span>Has niche</span>
        </label>

        {/* Niche settings */}
        {wall.niche && (
          <div className={styles.nicheSettings}>
            <div className={styles.nicheHeader}>Niche</div>
            {nicheFields.map(({ label, field }) => (
              <div key={field} className={styles.fieldRow}>
                <label className={styles.nicheLabel}>{label}</label>
                <input
                  type="number"
                  min={field === 'fromFloor' || field === 'fromLeft' ? 0 : 1}
                  value={wall.niche![field]}
                  onChange={(e) => handleNicheChange(field, e.target.value)}
                  className={styles.nicheInput}
                />
                <span className={styles.unitSmall}>cm</span>
              </div>
            ))}
            <button
              className="btn-secondary btn-small"
              style={{ width: '100%', marginTop: '2px' }}
              onClick={() => centerNiche(activeWallId)}
            >
              Center
            </button>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <button className="btn-danger" onClick={handleDelete}>
          Delete Wall
        </button>
      </div>
    </div>
  );
}
