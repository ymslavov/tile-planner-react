import type { NicheRect } from '../../store/types';

interface NicheOverlayProps {
  nicheRect: NicheRect;
  scale: number;
}

export function NicheOverlay({ nicheRect, scale }: NicheOverlayProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${nicheRect.left * scale}px`,
        top: `${nicheRect.top * scale}px`,
        width: `${nicheRect.width * scale}px`,
        height: `${nicheRect.height * scale}px`,
        background: 'rgba(37, 99, 235, 0.08)',
        border: '2px dashed #2563eb',
        borderRadius: '2px',
        pointerEvents: 'none',
        zIndex: 5,
        boxSizing: 'border-box',
      }}
    />
  );
}
