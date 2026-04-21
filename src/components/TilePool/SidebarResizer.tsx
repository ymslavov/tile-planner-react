import { useRef, useState } from 'react';
import { useStore } from '../../store';
import styles from './SidebarResizer.module.css';

/**
 * A thin drag handle on the right edge of the TilePool sidebar.
 * Dragging it adjusts the sidebar width stored in the Zustand store.
 */
export function SidebarResizer() {
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);
  const [active, setActive] = useState(false);

  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    setActive(true);

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (me: MouseEvent) => {
      const delta = me.clientX - startXRef.current;
      setSidebarWidth(startWidthRef.current + delta);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      setActive(false);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      className={`${styles.handle} ${active ? styles.active : ''}`}
      onMouseDown={handleMouseDown}
      title="Drag to resize sidebar"
    />
  );
}
