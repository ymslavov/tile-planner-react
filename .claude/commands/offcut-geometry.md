# Offcut Geometry

Deep dive on the single most complex part of the app: how leftover tile pieces are modeled, cut, and tracked. All code in `src/services/offcutEngine.ts` and `src/services/pieceHelpers.ts`.

The physical model is **one placement produces one leftover piece** (which may be a strange shape), and that leftover may itself be placed and cut. This is how real tile-cutting works: every cut transforms one piece into two — the part that fills the slot (installed, gone from the pool) and the remaining shape (kept, possibly re-cut later).

## Piece schema recap

```ts
interface Piece {
  id: string;                           // hierarchical — "5", "5-B", "5-B1", "5-B1a"
  sourceTileId: number;                 // 1..18 — which JPG
  parentId: string | null;              // null for originals
  width: number;                        // cm, natural (rotation=0) dims
  height: number;
  geometry: {
    boundingBox: { w, h: number };      // equals { width, height }
    cutouts: Cutout[];                  // [] = rect, 1 = L, 2 = C, 4 = frame
  };
  imageRegion: ImageRegion;             // rect into the source JPG
  autoWrap?: boolean;                   // auto-placed niche lip piece
}

interface Cutout { x, y, w, h: number; }   // rect in piece's natural frame
interface ImageRegion { x, y, w, h: number; } // rect into source tile image
```

## Four shape classes

All pieces are a **rectangular bounding box minus zero-or-more rectangular cutouts**. The number and positions of cutouts determine which physical shape the piece is:

| Cutouts | Shape    | When produced |
|---------|----------|---------------|
| 0       | rectangle | exact fit, or slot flush on 3 edges of the piece |
| 1 corner | L        | slot in a corner (flush top-left etc.) |
| 1 middle edge | C / U | slot centered on one axis, flush on the other |
| 1 middle | frame | slot centered on both axes (a donut) |
| 2 parallel edges | two strips | slot spans full width or height across the middle — disconnected offcut, returns **two pieces** |

Cutouts inherited from the parent stack — e.g. an L-shape parent cut again in its material produces a piece with **2 cutouts**: one inherited from the parent, one from the new cut.

## Placement geometry

```ts
interface Placement {
  pieceId: string;
  rotation: number;      // 0 | 90 | 180 | 270
  offsetX: number;       // cm
  offsetY: number;
}
```

**Invariant:** `offsetX ∈ [slotW - effW, 0]` and `offsetY ∈ [slotH - effH, 0]`, where `eff = getEffectiveDims(piece, rotation)`.

- `offsetX = 0, offsetY = 0` → piece's top-left aligned with slot's top-left.
- `offsetX = slotW - effW` → piece's top-left shifted left by `effW - slotW` — i.e. piece is flush right inside the slot (the right edge of piece meets the right edge of slot).
- Negative values are normal. Positive values are invalid.

The slot, in piece-local coordinates (piece top-left = origin of the rotated frame), occupies:

```
slotLeft  = −offsetX
slotTop   = −offsetY
slotRight = slotLeft + slotW
slotBot   = slotTop  + slotH
```

## Coordinate systems

Two frames matter per piece:

1. **Natural frame** — `[0, piece.width] × [0, piece.height]`. `piece.geometry.cutouts` are stored here. Rotation-0.
2. **Rotated frame** — `[0, effW] × [0, effH]` where `(effW, effH) = getEffectiveDims(piece, rotation)`. All offcut geometry is computed here. Placements' `offsetX/Y` are in this frame.

Converting between them:

- Natural → rotated: `rotateRectInPiece(rect, rotation, piece.width, piece.height)` (internal to offcutEngine).
- Rotated → natural: apply the inverse (rotation → 360-rotation), or invert manually.

`rotateRectInPiece` formulas (rotating clockwise):

```ts
case 90:  { x: parentH - y - h,    y: x,                  w: h, h: w }   // (x,y) → (pH-y-h, x), swap w/h
case 180: { x: parentW - x - w,    y: parentH - y - h,    w,    h    }
case 270: { x: y,                  y: parentW - x - w,    w: h, h: w }
```

## The offcut algorithm — `createOffcuts()`

Signature (from `offcutEngine.ts`):

```ts
createOffcuts(
  pieces: Record<string, Piece>,
  pieceId: string,
  slotW: number,
  slotH: number,
  rotation: number,
  offsetX: number,
  offsetY: number
): { offcuts: Piece[]; pieces: Record<string, Piece> }
```

### Step 1: slot-covered region in piece-local coords

```ts
const eff = getEffectiveDims(piece, rotation);     // {w: effW, h: effH} in rotated frame
const slotX    = min(max(-offsetX, 0), eff.w);     // clip
const slotY    = min(max(-offsetY, 0), eff.h);
const slotUsedW = min(slotW, eff.w - slotX);
const slotUsedH = min(slotH, eff.h - slotY);
const slotEndX = slotX + slotUsedW;
const slotEndY = slotY + slotUsedH;
```

### Step 2: short-circuits

```ts
if (slotUsedW >= eff.w - 0.01 && slotUsedH >= eff.h - 0.01) return NOTHING;   // exact fit
if (slotUsedW <= 0.01 || slotUsedH <= 0.01) return NOTHING;                   // defensive
```

### Step 3: disconnected-strips special cases

**If the slot spans the full width but lies in the middle of the height** (touches neither top nor bottom edge), the piece is split into two disconnected horizontal strips:

```ts
if (spansFullWidth && slotY > 0.01 && slotEndY < eff.h - 0.01) {
  // top strip:    [0, eff.w] × [0, slotY]
  // bottom strip: [0, eff.w] × [slotEndY, eff.h]
  // Returns TWO offcut Pieces, each with inheritParentCutouts().
}
```

**Mirror case: slot spans full height, middle of width** → left strip + right strip.

These are the only cases that produce more than one offcut piece.

### Step 4: general case — one offcut with up-to-two cutouts

The offcut is **the connected region = piece minus slot**, encoded as one Piece with a bounding box + cutout(s).

**Bounding-box trimming rule** (this is subtle):

```ts
const coversEntireLeftEdge   = slotX    < 0.01          && spansFullHeight;
const coversEntireRightEdge  = slotEndX > eff.w - 0.01  && spansFullHeight;
const coversEntireTopEdge    = slotY    < 0.01          && spansFullWidth;
const coversEntireBottomEdge = slotEndY > eff.h - 0.01  && spansFullWidth;
```

Only trim an axis **when the slot covers the ENTIRE opposite edge on that axis**. A slot flush with the top edge trims `bbMinY` only if it also spans full width — otherwise the top edge has non-slot content on the sides, and trimming would lose it.

```ts
const bbX    = coversEntireLeftEdge   ? slotEndX : 0;
const bbMaxX = coversEntireRightEdge  ? slotX    : eff.w;
const bbY    = coversEntireTopEdge    ? slotEndY : 0;
const bbMaxY = coversEntireBottomEdge ? slotY    : eff.h;
const bbW    = bbMaxX - bbX;
const bbH    = bbMaxY - bbY;
```

**Cutouts in the offcut's frame** come from two sources:

1. **Inherited cutouts** — the parent's cutouts, rotated into the current rotated frame, then clipped + translated into the offcut's bbox frame via `inheritParentCutouts(piece, rotation, bbX, bbY, bbW, bbH)`.
2. **The new cut** — the slot-covered rect, translated into the offcut's bbox frame:

```ts
const cutoutX = slotX - bbX;
const cutoutY = slotY - bbY;
// Clip to [0, bbW] × [0, bbH]
if (within bbox) cutouts.push({ cx, cy, cw, ch });
```

Edge cases during clip:

- If `slotX < bbX`, cutout starts at 0 and shrinks by the overshoot.
- If `cw >= bbW && ch >= bbH` (full-bbox cut), we skip — this means the slot fills the entire offcut bbox, which shouldn't happen given earlier checks but is defensive.

### Step 5: imageRegion for the new offcut

Computed by `computeOffcutImageRegion(parent, rotation, bbX, bbY, bbW, bbH)` — maps the offcut's piece-local bbox back into the original JPG's coordinate space.

### Step 6: register the piece

```ts
const offcutId = generateOffcutId(pieceId, 0);
newPieces[offcutId] = {
  id: offcutId,
  sourceTileId: piece.sourceTileId,
  parentId: pieceId,
  width: bbW,
  height: bbH,
  geometry: { boundingBox: {w: bbW, h: bbH}, cutouts },
  imageRegion,
};
```

## Why ONE shaped offcut, not a rectangular decomposition

A corner-anchored cut (e.g. 45×45 slot out of a 60×120 piece) **could** be decomposed into two rectangles (e.g. 15×45 on the right + 60×75 on the bottom), but that contradicts the physical model: the tile is one continuous L-shaped offcut. Modeling it as two rectangles would wrongly suggest the installer has two independent pieces when they actually have one piece that they could further cut into those two rectangles if they chose to.

The one-shape model means:

- The user sees a single L/C/frame thumbnail in the sidebar, mirroring the real offcut in their hand.
- When they drop it onto a slot, `findValidOffset()` respects the cutout(s), so the slot lands on material — not on the missing corner.
- They can cut that offcut again, producing a grandchild offcut with inherited cutouts.

## `inheritParentCutouts()` in detail

```ts
function inheritParentCutouts(parent, rotation, bbX, bbY, bbW, bbH): Cutout[]
```

For each parent cutout `c` (in parent's natural frame):

1. Rotate it into parent's rotated frame: `rotated = rotateRectInPiece(c, rotation, parent.width, parent.height)`.
2. Intersect with the offcut bbox `[bbX, bbY, bbW, bbH]` via `clipRectToBbox`.
3. If non-empty intersection, add to result in offcut-local coordinates (`x' = x - bbX`, `y' = y - bbY`).

Small-epsilon (`0.01cm`) checks guard against floating-point drift.

## `computeOffcutImageRegion()` — all 4 rotations

Given parent `imageRegion = pr`, rotation, and offcut bbox `(ox, oy, ow, oh)` in parent's rotated frame:

```ts
rotation === 0:    { x: pr.x + ox,                          y: pr.y + oy,                          w: ow,  h: oh }
rotation === 90:   { x: pr.x + oy,                          y: pr.y + (parent.width  - ox - ow),   w: oh,  h: ow }
rotation === 180:  { x: pr.x + (parent.width  - ox - ow),   y: pr.y + (parent.height - oy - oh),   w: ow,  h: oh }
rotation === 270:  { x: pr.x + (parent.height - oy - oh),   y: pr.y + ox,                          w: oh,  h: ow }
```

Note that `w/h` swap for 90/270 because the bbox is in the rotated frame but the image region is in the source JPG's (portrait) frame.

## Offset validation — `isOffsetValid()` and `findValidOffset()`

For rectangular pieces, any offset in `[slotW - effW, 0] × [slotH - effH, 0]` is valid. For L/C/frame pieces, the offset must additionally **not land the slot on top of a cutout**.

### `isOffsetValid(piece, rotation, slotW, slotH, offsetX, offsetY) → boolean`

1. Bounds: `offsetX ≤ 0`, `offsetY ≤ 0`, `offsetX ≥ slotW - effW`, `offsetY ≥ slotH - effH`.
2. Rotate cutouts into current frame.
3. Compute `slotLeft/Top/Right/Bottom = -offsetX / -offsetY / +slotW / +slotH`.
4. For each cutout: if the slot rect and cutout rect intersect with area > 0 (using `+/- 0.01cm` epsilon to allow edge-touching), return `false`.
5. Otherwise `true`.

### `findValidOffset(piece, rotation, slotW, slotH, prefX = 0, prefY = 0) → {x, y} | null`

1. Clamp `prefX/Y` to the valid range.
2. **Fast path**: if no cutouts, return the clamped value.
3. If the clamped preferred is already valid, return it.
4. **Snap-to-edge**: for each cutout `c`, the slot can avoid it by being entirely left/right/above/below. The transition points are the cutout edges offset by the slot dims:
   - `xCandidates ← { clamped, min, 0, -(c.x + c.w), slotW - c.x }` for each cutout.
   - `yCandidates ← { clamped, min, 0, -(c.y + c.h), slotH - c.y }`.
5. Filter candidates to `[minX, 0]` and `[minY, 0]`.
6. Try all `(x, y)` combinations; for each, check `isOffsetValid`.
7. Return the valid one with minimum squared distance from `(clampedPx, clampedPy)`.
8. If no valid combo exists, return `null`.

This is why dragging a tile with cutouts **snaps to positions that keep the slot on material** — moving past a cutout boundary jumps to the next valid zone.

## Cascade invalidation

When a placed piece is rotated, repositioned, or removed, its recorded `geometry.cutouts` (relative to that specific rotation/offset) become stale. Any offcut descendants derived from that geometry are no longer valid physical leftovers. So:

### `cascadeDelete(pieces, walls, pieceId) → { removedPlacements, pieces, walls }`

1. `descendants = getAllDescendants(pieces, pieceId)` — BFS via `parentId`.
2. For each descendant:
   - Find any placement via `getPiecePlacement(walls, descId)` (searches `walls[i].tiles` then `walls[i].nicheTiles[surface]`).
   - If placed, delete the entry from `newWalls[...].tiles[key]` or `newWalls[...].nicheTiles[surface][key]`.
   - `delete newPieces[descId]`.
   - Push `RemovedPlacement { pieceId, wallName, surface }`.
3. Return the mutated structures + the list.

The caller emits a toast for each removed placement ("Piece 5-B1 removed from Wall 2 (niche back)").

### `getAllDescendants(pieces, pieceId)`

BFS:

```ts
queue = getChildPieces(pieces, pieceId).map(id);
while (queue.length) {
  const id = queue.shift();
  result.push(id);
  queue.push(...getChildPieces(pieces, id).map(id));
}
```

## Hierarchical IDs — `generateOffcutId(parentId, index)`

```
"5"       → "5-B"  (index 0) or "5-C"  (index 1)
"5-B"     → "5-B1" (index 0) or "5-B2" (index 1)
"5-B1"    → "5-B1a" (index 0) or "5-B1b" (index 1)
"5-B1a"   → "5-B1a1" (alternate again)
```

Algorithm:

- No `-` in parentId (original tile): append `-` + `String.fromCharCode(66 + index)` (B, C, D...).
- Last char is `[A-Z]`: append `index+1` (digit).
- Last char is `[0-9]`: append `String.fromCharCode(97 + index)` (a, b, c...).
- Else: append `index+1` (defensive).

Letters and digits alternate so you can eyeball the hierarchy depth from the ID. "5-B1a" is 3 levels deep under tile 5.

## Worked examples

### Example 1 — corner cut producing an L

- Parent: piece `5` (60×120, rect, rotation=0, no cutouts).
- Placed in slot 45×45 with `offsetX=0, offsetY=0` (top-left flush).
- `eff = (60, 120)`. Slot-covered region: `[0,45] × [0,45]`.
- `spansFullWidth=false, spansFullHeight=false`.
- `coversEntire*Edge = all false` → no bbox trimming. Bbox = `(0, 0, 60, 120)`.
- Inherited cutouts: none (parent is a rect).
- New cutout: `(0, 0, 45, 45)` in the offcut's frame.
- Offcut `5-B`: width=60, height=120, cutouts=`[{0,0,45,45}]`, imageRegion mapping to same 60×120 region of source tile 5.
- **Shape: L-shape** (60×120 bounding box with top-left 45×45 missing).

### Example 2 — cutting the L again

- Parent: `5-B` (L from above).
- Placed in a 15×45 slot with `offsetX=-45, offsetY=0` (piece shifted so the slot sits in the top-right stub of the L).
  - Slot-covered region: `[45, 60] × [0, 45]` in piece frame.
- `eff = (60, 120)`. `spansFullWidth=false, spansFullHeight=false`.
- `slotEndX = 60` touches the right edge; `slotEndY = 45 < 120`. `spansFullHeight = false` so `coversEntireRightEdge = false`. No trimming.
- Bbox = `(0, 0, 60, 120)`.
- Inherited cutouts: parent's `(0,0,45,45)` clipped to bbox → still `(0,0,45,45)`.
- New cutout: `(45, 0, 15, 45)` — the freshly cut region.
- Offcut `5-B1`: 60×120 bounding box with **two cutouts** (`{0,0,45,45}` and `{45,0,15,45}`), forming essentially a "reverse T" with the top 45cm fully missing. That's the same as a `60×75` rectangular strip at the bottom — but the engine records it structurally, not simplified. (This happens to be the case that could be simplified to a rect, but the engine doesn't — it always uses the full bbox so the piece has consistent coordinates with its parent's image region.)

### Example 3 — centered cut producing a C

- Parent: piece `3` (60×120, rect).
- Slot: 40×30 centered horizontally and flush to the top. `offsetX = -(60-40)/2 = -10`, `offsetY = 0`.
  - Slot-covered region: `[10, 50] × [0, 30]`.
- `spansFullWidth=false, spansFullHeight=false`.
- `coversEntireTopEdge`: `slotY < 0.01` but `spansFullWidth = false` → `false`. No trimming.
- Bbox = `(0, 0, 60, 120)`.
- Cutout: `(10, 0, 40, 30)`.
- **Shape: U / inverted-C** — the cut touches the top edge but leaves material on either side.

### Example 4 — disconnected strips

- Parent: piece `7` (60×120).
- Slot: 60×30 placed in the middle vertically: `offsetX = 0`, `offsetY = -45`.
  - Slot-covered region: `[0, 60] × [45, 75]`.
- `spansFullWidth = true`, `slotY = 45 > 0`, `slotEndY = 75 < 120`.
- **Special case 1 fires.** Returns two pieces:
  - `7-B`: 60×45 top strip, imageRegion mapping to top of source 7.
  - `7-C`: 60×45 bottom strip, imageRegion mapping to bottom of source 7.

### Example 5 — exact fit

- Slot equals `eff.w × eff.h`. `slotUsedW >= eff.w - 0.01 && slotUsedH >= eff.h - 0.01` → return `{ offcuts: [], pieces }`. No offcut registered.

## Integration points

- `store.placeTile` / `store.setOffsets` / `store.rotatePlacement`: all call `createOffcuts(...)` after the placement is written.
- `store.swapTiles`: recreates offcuts for both involved pieces using each new slot's dims.
- `store.updateWallDimension`: when a slot shrinks or disappears, uses `cascadeDelete` on its occupant (no re-create, since the slot no longer exists to be filled).
- `TilePool`/`OffcutRow` renders every non-original piece as an inline offcut row under its source tile, using `OffcutThumbnail` with proportional scale (scale-in-px/cm shared between parent tile and its offcut tree).
- `CutSheet`/`CutTileSection`: reads the final piece tree per source tile and shows each cut with a labeled SVG line at `cut.positionCm`.

## References

- `src/services/offcutEngine.ts` (primary source)
- `src/services/pieceHelpers.ts` — `getEffectiveDims`, `getAllDescendants`, `getPiecePlacement`, `initPieces`
- `src/store/types.ts` — `Piece`, `Cutout`, `ImageRegion`, `Placement`
- `src/components/TilePool/OffcutThumbnail.tsx` — how cutouts render visually (CSS `clip-path: polygon(evenodd, ...)`)
- `src/components/WallView/TileImage.tsx` — how a placed piece with cutouts is drawn in a slot (oversized image + rotation transform-origin at crop center)
