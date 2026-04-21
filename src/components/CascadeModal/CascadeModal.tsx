import { useStore } from '../../store';
import styles from './CascadeModal.module.css';

export function CascadeModal() {
  const cascadePreview = useStore((s) => s.cascadePreview);

  if (!cascadePreview) return null;

  const { affectedDescendants, onConfirm, onCancel } = cascadePreview;
  const n = affectedDescendants.length;

  const formatLocation = (d: typeof affectedDescendants[number]) => {
    const [row, col] = d.slotKey.split(',');
    if (d.surface) {
      return `${d.wallName} · niche ${d.surface} (${row},${col})`;
    }
    return `${d.wallName} · slot (${row},${col})`;
  };

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.stopPropagation()}>
      <div className={styles.modal}>
        <div className={styles.title}>Repositioning will invalidate placed offcuts</div>
        <div className={styles.subtitle}>
          {n} placed offcut{n !== 1 ? 's' : ''} will be removed:
        </div>
        <ul className={styles.list}>
          {affectedDescendants.map((d) => (
            <li key={d.pieceId} className={styles.listItem}>
              <span className={styles.pieceLabel}>{d.pieceId}</span>
              <span className={styles.locationLabel}>{formatLocation(d)}</span>
            </li>
          ))}
        </ul>
        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.confirmBtn} onClick={onConfirm}>
            Confirm &amp; Remove
          </button>
        </div>
      </div>
    </div>
  );
}
