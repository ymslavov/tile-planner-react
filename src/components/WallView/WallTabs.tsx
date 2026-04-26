import { useEffect, useRef, useState } from 'react';
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
  const reorderWalls = useStore((s) => s.reorderWalls);
  const renameWall = useStore((s) => s.renameWall);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEdit = (wall: { id: string; name: string }) => {
    setEditingId(wall.id);
    setDraftName(wall.name);
  };
  const commitEdit = () => {
    if (editingId) renameWall(editingId, draftName);
    setEditingId(null);
  };
  const cancelEdit = () => setEditingId(null);

  return (
    <div className={styles.bar}>
      {walls.map((wall) => {
        const isEditing = editingId === wall.id;
        return (
        <div
          key={wall.id}
          className={[
            styles.tab,
            wall.id === activeWallId && viewMode === 'single' ? styles.active : '',
            wall.id === dropTargetId && draggingId && draggingId !== wall.id ? styles.dropTarget : '',
            wall.id === draggingId ? styles.dragging : '',
          ].filter(Boolean).join(' ')}
          draggable={!isEditing}
          onClick={() => {
            if (isEditing) return;
            setActiveWall(wall.id);
            onViewModeChange('single');
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startEdit(wall);
          }}
          onDragStart={(e) => {
            setDraggingId(wall.id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-wall-tab', wall.id);
          }}
          onDragOver={(e) => {
            if (!draggingId || draggingId === wall.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (dropTargetId !== wall.id) setDropTargetId(wall.id);
          }}
          onDragLeave={() => {
            if (dropTargetId === wall.id) setDropTargetId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const fromId = e.dataTransfer.getData('application/x-wall-tab');
            if (fromId && fromId !== wall.id) reorderWalls(fromId, wall.id);
            setDraggingId(null);
            setDropTargetId(null);
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDropTargetId(null);
          }}
          title={isEditing ? undefined : `${wall.name} - ${wall.width}x${wall.height} cm (double-click to rename, drag to reorder)`}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              className={styles.tabInput}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                else if (e.key === 'Escape') cancelEdit();
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              {wall.name} ({wall.width}&times;{wall.height})
            </>
          )}
        </div>
        );
      })}
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
