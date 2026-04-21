# UI Interactions — DnD, Rendering, and the Tricky Parts

The tile planner has three separate drag systems running side by side, CSS tricks to make hover controls escape thin slots, rotation math that is easy to get wrong, and a cascade-confirmation flow that highlights affected slots. This doc captures the non-obvious pieces.

## Three drag/drop systems

### 1. HTML5 drag — pool ↔ slot, slot ↔ slot, slot → pool

Used for moving pieces between containers.

**DragData schema** (`src/store/types.ts`):

```ts
type DragData =
  | { source: 'pool';  tileId: string }                                // from TilePool
  | { source: 'wall';  key: string }                                   // from GridSlot (wall)
  | { source: 'niche'; surfaceKey: NicheSurfaceKey; key: string };     // from SurfaceGrid (niche)
```

Serialized as `text/plain` in `dataTransfer`. Always a JSON string.

**Drop target → dispatch mapping**:

| Drop target | pool source | wall source | niche source |
|---|---|---|---|
| Wall `GridSlot` | `placeTile(wallId, slotKey, tileId)` | `swapTiles(wallId, fromKey, toKey)` | *(not handled — would need a manual dispatch)* |
| Niche `SurfaceGrid` slot | `placeNicheTile(wallId, surfaceKey, slotKey, tileId)` | *(not handled)* | `swapNicheTiles(wallId, fromSurf, fromKey, toSurf, toKey)` |
| `TilePool` container | *(same source, ignored)* | `unplaceTile(wallId, fromKey)` | `unplaceNicheTile(wallId, surf, fromKey)` |

### 2. Mouse-based in-slot drag — reposition a placed tile within its slot

HTML5 drag is intercepted via `mousedown`'s `e.preventDefault()` when the piece has overhang (`effW > slotW + 0.01 || effH > slotH + 0.01`). This drag updates `offsetX/offsetY` so the visible crop shifts within the slot, letting the user pick which part of the piece fills the slot.

Flow (in `GridSlot.tsx` and `SurfaceGrid.tsx SlotCell`):

```
mousedown on <img>:
  if no overhang → let HTML5 drag happen (return)
  preventDefault + stopPropagation
  record {mouseX, mouseY, offsetX, offsetY}
  setIsDragging(true)
  install on document:
    mousemove → compute targetX/Y = init + (delta / scale)
                findValidOffset(...)     // snaps around cutouts
                setDraftOffset{X,Y}
    mouseup  → setOffsets(wallId, slotKey, finalX, finalY)
               // triggers cascade modal if placed descendants exist
```

While dragging, `TileImage` renders with `draftOffsetX/Y` props (not the placement's stored offsets), so the drag is live and smooth without touching the store. Only on `mouseup` does the store update.

**Key gotcha:** the mouseup closure can't read React state directly — there are mirrored refs (`draftOffsetXRef`, `draftOffsetYRef`) updated every render so the closure reads the latest values.

### 3. Custom HTML5 drag image — `dragImage.ts`

By default, the browser uses a screenshot of the dragged element as the drag image. For L/C/frame offcuts this looks wrong — the user sees a rectangular thumbnail with no indication of the cutouts. So the app builds a custom canvas:

```ts
createPieceDragImage(piece, targetWidth): { canvas, cleanup } | null
```

- Scales piece dimensions to `targetWidth`.
- `ctx.beginPath(); ctx.rect(0, 0, canvasW, canvasH)` — outer bbox.
- For each cutout: `ctx.rect(cut.x*scale, cut.y*scale, cut.w*scale, cut.h*scale)` — traced in the same winding, but the next call `ctx.clip('evenodd')` makes them transparent.
- `ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvasW, canvasH)` — draws the tile image, where `(sx, sy, sw, sh)` map the piece's `imageRegion` into the source JPG's pixel coordinates.
- Subtle border via `ctx.stroke()`.
- Canvas is attached off-screen (`position: fixed; top: -2000px`) — some browsers require it to be in the DOM when `setDragImage` is called.
- `cleanup` schedules removal via `setTimeout(..., 0)` — Firefox reads the canvas after `dragstart` returns.

**Must be called synchronously inside `dragstart`** — the browser snapshots immediately and won't wait for async image loads. That's why both `GridSlot` and `PoolTile` call `preloadTileImage(tileId)` in a `useEffect`:

```ts
const imageCache = new Map<number, HTMLImageElement>();
// preload lazily, cache forever
```

If the image isn't cached yet when the drag starts, `createPieceDragImage` returns `null` and the browser falls back to the default screenshot — which is fine, just looks less polished.

## The `overflow: hidden` trick — why it's on `.imageClip`, not `.slot`

For a placed tile, the oversized image needs to be clipped to the slot's rectangle so the portion outside the slot is hidden. Intuitively: put `overflow: hidden` on the slot. **Don't.**

Reason: for thin slots (e.g. a 15cm partial that scales to ~30px), the hover controls (rotate + remove buttons, ~24px circles each) don't fit inside the slot — they'd be clipped and unreachable.

Solution (`GridSlot.module.css`):

```css
.slot { /* no overflow */ }
.imageClip { position: absolute; inset: 0; overflow: hidden; }  /* clips the image */
```

And in JSX:

```tsx
<div className={styles.slot}>
  <div className={styles.imageClip}>
    <TileImage .../>
  </div>
  <PlacementControls .../>    {/* outside .imageClip — can escape the slot */}
</div>
```

The `PlacementControls` bar is positioned at `top: -2px; right: -2px` and extends further out on thin slots. The hover detector uses the parent `.wall-slot-placed` global class (added in JSX whenever a placement exists):

```css
:global(.wall-slot-placed:hover) .btnBar,
.controls:hover .btnBar {
  opacity: 1;
  transform: translateY(0);
}
```

The self-hover on `.controls` keeps the bar visible while the user moves the cursor onto the buttons themselves, preventing flicker.

## Rotation rendering — `transform-origin` at the crop center

`TileImage.tsx` renders the tile as an `<img>` sized to the full tile (`srcW × srcH × scale` = e.g. 60×120 cm × pxPerCm), positioned with a negative offset so only the `imageRegion` appears in the slot:

```ts
left: (offsetX - ir.x) * scale
top:  (offsetY - ir.y) * scale
width:  srcW * scale
height: srcH * scale
```

For rotated placements, the `transform-origin` must be at the **center of the visible crop region**, NOT the image center. If you use `center center`, the image rotates around its own midpoint and flies out of the slot (the image is much larger than the slot).

Math:

```ts
// In slot-local CSS pixels, the slot's center is at (slotW/2, slotH/2) — in cm: (slotW/2, slotH/2).
// In image-local CSS pixels, the slot's center is at (ir.x - offsetX + slotW/2, ir.y - offsetY + slotH/2)
// multiplied by `scale`.
const originX = (ir.x - offsetX + slotW / 2) * scale;
const originY = (ir.y - offsetY + slotH / 2) * scale;
transform: rotate(${rotation}deg)
transform-origin: ${originX}px ${originY}px
```

Because the `<img>` is positioned with `left: (offsetX - ir.x) * scale`, the point `(originX, originY)` in image-local space maps to `(slotW/2, slotH/2)` in slot-local space — i.e. the rotation pivots around the visible slot center, so the crop stays centered.

For landscape orientation: the source JPGs are always portrait (60×120). `TileImage` rotates them 90° CW first (`transform: rotate(90deg); transform-origin: top left; translate: 0 -${naturalW}px`) and then adds the placement rotation on top, so `totalRotation = 90 + placementRotation`.

The same pattern lives in `NicheOverlay.tsx` (for the niche-back tile rendered inside the blue dashed rect) and `SurfaceGrid.tsx` (for placed niche-surface tiles).

## Hover control bar — `PlacementControls`

Two buttons, anchored top-right of a placed slot:

- **Rotate (↻, `&#x21BB;`)** — calls `rotatePlacement(wallId, slotKey)`. Cycles to the next valid rotation where the piece still fits the slot. If no other rotation fits, no change.
- **Remove (×, `&#x2715;`)** — calls `unplaceTile(wallId, slotKey)` (or `unplaceNicheTile(wallId, surface, slotKey)` when `nicheSurface` prop is set).

Both use `onMouseDown: e.stopPropagation()` to avoid triggering the in-slot mouse drag when clicking the button.

CSS: 24×24 circle, subtle shadow, hover grows to `scale(1.1)`. Remove button is red-tinted (`color: #dc2626`).

Niche surface version uses different class names (`.niche-btn-bar`, `.niche-ctrl-btn`) defined in `src/styles/index.css` globals, slightly smaller (20×20) to fit the compact niche layout.

## Cascade confirmation modal

Shown when changing geometry on a piece that has placed descendants.

Triggered from `rotatePlacement` and `setOffsets` (wall and niche variants). Sequence:

1. Compute `descendants = getAllDescendants(state.pieces, pieceId)`.
2. Build `placedDescendants` by calling `getPiecePlacement(walls, id)` for each and filtering to those actually placed.
3. If the list is non-empty:

```ts
showCascadePreview(
  placedDescendants.map(d => d.pieceId),     // affected IDs → used for pulse highlight
  placedDescendants,                          // full detail → rendered in modal list
  applyRotate,                                // onConfirm
  () => hideCascadePreview(),                 // onCancel
);
```

4. Otherwise apply immediately (no modal).

### The pulse highlight

While `cascadePreview` is non-null, `GridSlot` and `SurfaceGrid SlotCell` check whether their placement's `pieceId` is in `cascadePreview.affectedPieceIds`. If so, they add the `pulseHighlight` class. Defined in `src/styles/index.css`:

```css
@keyframes cascadePulse {
  0%   { box-shadow: inset 0 0 0 2px #f59e0b; }
  50%  { box-shadow: inset 0 0 0 3px #f59e0b, 0 0 8px rgba(245, 158, 11, 0.6); }
  100% { box-shadow: inset 0 0 0 2px #f59e0b; }
}

.pulseHighlight {
  animation: cascadePulse 1.5s ease-in-out infinite !important;
  border-color: #f59e0b !important;
  z-index: 10 !important;
}
```

So when the modal is up, every affected slot pulses amber, making it visually obvious what will be removed.

The modal itself (`CascadeModal.tsx`) lists each descendant as `"5-B1  Wall 2 · slot (3,0)"` or `"5-C2  Wall 1 · niche back (0,0)"`.

## Toast notifications

Simple stack bottom-right via `ToastContainer`:

```ts
showToast(message: string):
  id = `toast-${Date.now()}-${random}`;
  state.toasts.push({ id, message });
  setTimeout(() => removeToast(id), 3000);
```

Used for cross-wall cascade deletions (e.g. "Piece 5-B1 removed from Wall 2 (niche back)"), insufficient-fit errors, and other non-blocking feedback. Auto-dismiss after 3s.

## Resizable sidebar

`SidebarResizer.tsx` — a thin vertical handle on the right edge of `TilePool`. On `mousedown`:

```ts
startX = e.clientX;
startWidth = sidebarWidth;
document.body.style.userSelect = 'none';
document.body.style.cursor = 'col-resize';
// install mousemove + mouseup on document
mousemove: setSidebarWidth(startWidth + (clientX - startX));   // clamped in the action
mouseup: remove listeners, restore cursor + userSelect
```

`setSidebarWidth` clamps to `[SIDEBAR_MIN=180, SIDEBAR_MAX=400]` and persists.

The `TilePool` re-derives `thumbW = floor((sidebarWidth - POOL_PADDING - TILE_GAP) / 2)` — 2-column CSS grid of tile thumbnails.

## Proportional offcut thumbnails

Offcut thumbnails in the sidebar use **the same px-per-cm scale as their parent tile**, so a 45×120 offcut appears 75% as wide as its 60×120 parent. In `TilePool.tsx`:

```ts
const parentScale = orientation === 'portrait' ? thumbW / TILE_W : thumbW / TILE_H;
```

This single scale propagates through the `OffcutRow` tree. Every offcut, no matter how deeply nested, renders at its true size relative to the original tile — so the user can visually compare offcut sizes without reading labels.

## L/C/frame shape rendering in the sidebar

`OffcutThumbnail.tsx` renders the shape using CSS `clip-path` with the `evenodd` fill rule:

```ts
clipPath = `polygon(evenodd,
  0 0,
  ${thumbW}px 0,
  ${thumbW}px ${thumbH}px,
  0 ${thumbH}px,
  0 0,
  <for each cutout>
    ${cx}px ${cy}px,
    ${cx}px ${cy + ch}px,
    ${cx + cw}px ${cy + ch}px,
    ${cx + cw}px ${cy}px,
    ${cx}px ${cy}px,
  0 0,
  </for>
)`;
```

Bridging back to `(0,0)` after each cutout keeps the polygon continuous. The outer rect is one winding, each cutout is another — evenodd flips fill state at each boundary, leaving the cutout holes transparent.

## Niche overlay — the blue dashed rectangle

In `NicheOverlay.tsx`: when a wall has a niche, a dashed blue `<div>` is positioned at `nicheRect.left × nicheRect.top` with dims `nicheRect.width × nicheRect.height` (all scaled). Its `z-index: 5` puts it above the slots but below `PlacementControls` (`z-index: 20`).

If there's a tile placed on the niche **back** surface (`wall.nicheTiles.back['0,0']`), that tile's image is rendered inside the dashed rect, cropped/rotated to the niche opening. This gives the main wall view a proper "through the niche" preview.

## Grid scaling

`WallView.tsx` computes `scale` via `ResizeObserver`:

```ts
const availableWidth  = (wrapRef.current.clientWidth  || 600) - 40;
const availableHeight = (wrapRef.current.clientHeight || 500) - 60;
scale = Math.min(availableWidth / wall.width, availableHeight / wall.height);
```

40px horizontal inset accommodates the height label (left, vertical). 60px vertical inset accommodates the width label (top) and margin. All slot positions, tile images, and overlays multiply cm coordinates by `scale` to get pixels.

Niche surface grids use a **separate scale** (`surfaceScale = min(200 / surfaceW, 2)`, max 2px/cm) — their max width is 200px so they fit compactly below the main wall.

## Store-side idempotency

Actions that could be called repeatedly with no change (e.g. `setOffsets` with unchanged values) short-circuit early:

```ts
if (Math.abs(clampedX - prevX) < 0.001 && Math.abs(clampedY - prevY) < 0.001) return;
```

This prevents a cascade-modal flash when the user releases an in-slot drag without having moved.

## References

- `src/components/WallView/GridSlot.tsx` — the convergence point for all three drag systems on wall slots
- `src/components/NicheSurfaces/SurfaceGrid.tsx` — same for niche surfaces (`SlotCell`)
- `src/components/WallView/TileImage.tsx` — rotation + crop math
- `src/components/WallView/PlacementControls.tsx` + `.module.css` — the hover control bar
- `src/components/CascadeModal/CascadeModal.tsx` — confirmation UI
- `src/services/dragImage.ts` — custom drag image + image cache
- `src/services/offcutEngine.ts::findValidOffset` — the snap-to-cutout-edge math used during in-slot drag
- `src/styles/index.css` — global hover classes, `.pulseHighlight`, print media queries, niche button styles
