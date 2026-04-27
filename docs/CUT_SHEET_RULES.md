# Cut Sheet Rules

The cut sheet is the printout that construction workers use to physically cut
each tile. Every visualization decision must serve **one goal**: a worker
reading this page should produce the exact same cut as the user planned in the
app, with no ambiguity. Any inconsistency between the planning view and the
cut sheet can result in wasted material.

This document is the source of truth for the visualization rules the cut
sheet implements. It pairs with `src/components/CutSheet/CutTileSection.tsx`,
`WallPreviewPage.tsx`, `NichePage.tsx`, and `services/printData.ts`.

---

## Vocabulary

| Term | Meaning |
|------|---------|
| **Tile** | A source pattern (e.g., #1, #2, …, #18). Image asset. Acts as an unlimited supply — multiple physical instances can be cut differently. |
| **Piece** | A node in the cut chain: a piece can be the whole tile (root) or a sub-piece produced by cutting a parent. Identified by an ID like `9-B1a` (root `9`, then `-B`, `-B1`, `-B1a`). |
| **Image region (ir)** | Where a piece lives in the source tile's image: `{x, y, w, h}` in cm. Children's image regions are subsets of their parent's. |
| **Placement** | A `(wallId, slotKey, offset)` tuple — the piece is anchored at `slot.xy + offset` and clipped to the slot. |
| **Visible portion** | The intersection of `piece (in slot coords) × slot rect` — i.e., the part of the piece the user actually sees on the wall. THIS is what physically needs to be cut. |
| **Used dimensions** | `visible portion`'s width × height. The size of the physical cut. |
| **Root piece** | The piece whose `id == sourceTileId` (no parent). Represents the whole, uncut tile. |
| **Placed** | A piece that appears in some `wall.tiles` or `wall.nicheTiles[surface]` map. |

---

## Root piece classification

A tile's root piece can play two very different roles depending on its descendants:

| Case | Description | Treatment |
|------|-------------|-----------|
| **Whole-tile use** | Root is placed AND no descendant is placed. Possibly one or two stray unplaced offcuts in the chain (e.g., a 1.4 cm sliver from pixel-perfect re-fit). | Root IS the element. List it, label it on the visual, **don't** gray its region. |
| **Tile-as-source** | At least one descendant is placed (`hasPlacedChildPiece(rootId) === true`). The root represents the abstract original tile, not a usable piece. | Hide root from description list, hide its label, gray out its placement region as waste. |

The discriminator is `hasPlacedChildPiece(rootId)` — true iff any descendant
(not the root itself) is placed.

> **Note:** Even when the root is "used whole", the sub-piece chain may
> imply geometry cutouts (notches). Those are still drawn — they're cuts
> the worker has to make. See *Cutlines* below.

---

## What appears in the description list (right side of each tile section)

Iterate `allPieces` for the source tile. For each piece, include it iff:

1. The piece is **placed** (`getPiecePlacement(walls, piece.id)` returns a
   non-null value). Unplaced offcuts are not listed — they're noise.
2. AND the piece is not the root-as-source (when `rootIsTileSource` is true
   AND `piece.id === rootId`).

For each listed piece, the entry shows:

- **Piece ID** in a pill marker (the canonical identifier — `9-B1a`, never an integer).
- **Used dimensions** (the visible-portion size, NOT the piece's raw width/height):
  ```
  usedLeft   = max(0, -offX)
  usedTop    = max(0, -offY)
  usedRight  = min(piece.width,  slotW - offX)
  usedBottom = min(piece.height, slotH - offY)
  dispW      = usedRight - usedLeft
  dispH      = usedBottom - usedTop
  ```
- A `(остатък)` suffix iff the piece is the root AND has children AND is
  placed with non-zero offset (i.e., a leftover after cutting).
- **Position**: wall name (Bulgarian-translated) + niche surface label if any.
  Tells the worker which wall the cut piece installs on. No wall coordinates
  shown — the cut sheet is read at the cutting table, where the relevant
  numbers are the cut on the SOURCE TILE, not the wall.
- **Cut start on source tile** (`Срез`): `vr.x cm от ляво на плочката,
  vr.y cm от горе на плочката` — the visible rect's top-left in source-tile
  coordinates. Together with the used dims this fully specifies the cut:
  start at this point on the tile, cut a rectangle of (dispW × dispH).

Offset/rotation values are **not** shown. They're an internal data-model
detail; the worker only cares about size and where to install.

The "Unused area" footer at the bottom shows
`tileArea − sum(visibleRects.area)` — using `visibleRects` the cut sheet has
already computed, NOT the sum of unplaced piece areas (which double-counts
chains).

---

## Visible rectangles (for the gray-out mask)

For each placed piece, compute its visible rectangle in **tile** coords:

```ts
visibleRect_in_piece_local = (vxL, vyT) → (vxR, vyB)
visibleRect_in_tile_coords = imageRegion + visibleRect_in_piece_local
                           // (with 90°-rotation handling when piece.width != imageRegion.w)
```

Rules:

- Skip pieces that aren't placed.
- **Skip the root** when `rootIsTileSource` (it's the abstract source, not a
  used piece).
- Rotation handling: if `piece.width != imageRegion.w`, the piece is rotated
  90° CW. Map piece-local `(x, y, w, h)` to tile coords as:
  `(ir.x + ir.w − y − h, ir.y + x, h, w)`.

The mask is constructed as a white-fill rectangle over the whole tile with
each `visibleRect` painted black, so the gray translucent overlay only
appears in unused areas.

---

## Cutlines (red dashed rectangles drawn on the tile image)

Cutlines must match what the worker physically cuts. **Cutlines are the
visible rectangles, not the imageRegions.** A piece's `imageRegion`
describes the part of the source tile the piece comes from (its full
bounding box on the tile). When the slot trims the piece, the worker
needs to cut to the trimmed (visible) size, not the full piece size.
Outlining the imageRegion when it's larger than the visible rectangle
creates a phantom "outer cut" and makes the dashed boundary disagree
with the opaque region.

### 1. Visible rectangles

For each placed piece (excluding root-as-source), look up its visible
rect in `visibleByPieceId` (the same map the gray-out mask uses to
punch holes) and `addCut` a rectangle at that rect's coords.

Same dedup as before — if multiple placements happen to map to the
same tile rect, only one cutline is drawn.

### 2. Cutouts (notches) — with intersection filter

For each placed piece's `geometry.cutouts`, compute the cutout's
position in tile coords (with 90° rotation handling when
`piece.width != imageRegion.w`). **Skip the cutout if it doesn't
overlap the piece's visible rect** — a notch on discarded material
isn't a cut the worker has to make.

Notches that DO fall within the visible region (e.g., a niche-wrap
piece installed whole with an L-shape cut into it) are drawn as their
own dashed rectangle.

### Deduplication

Many pieces in a chain share the same image region (e.g., `9-B`, `9-B1`,
`9-B1a` all have ir `(0, 26.6, 60, 93.4)`). Without dedup the same
rectangle would draw multiple times. Cuts are deduplicated by the
`(x, y, w, h)` tuple rounded to 2 decimal places.

---

## Visual labels (right column of the tile image)

Each placed piece in the source tile gets a **piece-ID badge** (pill marker)
in a vertical column to the right of the tile image, with a leader line and
small dot pointing to the visible-portion centroid.

Filtering rule: same as the description list. Iff `rootIsTileSource`, drop
the root piece from `labelsToPlace`. Otherwise include all placed pieces
sourced from this tile.

The badges sort by centroid Y, with greedy spacing to avoid overlap. If the
column overflows the bottom, the whole stack shifts up. The SVG `viewBox`
width auto-grows to accommodate the longest badge text (chain IDs can be
long — `1-B1a1a1` is 8 characters).

---

## Wall preview page

Each wall renders to its own page with the full wall drawn to scale, each
placed piece showing the underlying tile pattern (clipped to the visible
portion via overflow-hidden), and a piece-ID pill badge anchored top-left
inside each piece.

**Tile rotation** (`placement.rotation`, in degrees) is applied to the
source-tile `<img>` via a CSS `transform: rotate(N deg)` with the
`transform-origin` set to the slot center expressed in image-local
coordinates: `((ir.x − offsetX + slotW/2) * scale, (ir.y − offsetY +
slotH/2) * scale)`. Same math as the planning-mode `TileImage` portrait
branch. The piece-ID badge stays UNROTATED (it sits on the slot wrapper,
outside the transform), so it always reads the right-way-up.

The legend on the right lists every placed piece with the same piece-ID
pill marker, the used dimensions, and the source tile number.

Wall names are Bulgarian-translated via `t.translateWallName(wall.name)` —
which maps `"Wall N"` (legacy English default) to `"Стена N"` and passes
custom names through unchanged.

---

## Niche page

For walls with niches: the five surfaces (back, left, right, top, bottom)
unfold around the back surface in a cross layout.

For UNROTATED placements, tiles are rendered as **CSS background-image**
on a div sized to the surface — background images clip naturally to the
box and Chrome's PDF engine handles them reliably. (`<img>` + `overflow:
hidden` was unreliable in print.)

For ROTATED placements (`placement.rotation !== 0`) we fall back to a
positioned `<img>` inside an `overflow:hidden` + `clip-path: inset(0)`
wrapper, with the same rotation math as the wall preview. CSS transforms
don't apply to `background-image` position alone, so the rotated case
needs a transform-able element.

`print-color-adjust: exact` is forced everywhere on the cut sheet so
backgrounds print regardless of the user's "Background graphics" print-dialog
setting (otherwise niche tiles print as empty boxes for everyone except
Playwright runs).

---

## Print vs Cut Mode

The same `<CutSheet>` component renders in two contexts:

| Mode | How |
|------|-----|
| **Print** | `<CutSheet />` (default) — wraps with `print-only` class so the cut sheet is hidden on screen but appears when the user prints. |
| **Cut Mode** (in-app preview) | `<CutSheet visibleOnScreen />` — wraps with `cutSheetOnScreen` class so each page renders as an A4 frame on a gray background, scrollable. Toggled via `store.cutMode`. |

When `cutMode === true`, App swaps the editor (TilePool/WallView/Settings)
for the cut sheet and skips the print-only render to avoid double-mounting.

---

## Validation checklist

Before declaring the cut sheet correct for a given saved state, walk
through every tile section and verify:

- [ ] **Listed entries match labeled badges on the visual** (1:1).
- [ ] **Each listed entry's used-dim equals the visible rectangle on the tile** at the dashed cut boundaries.
- [ ] **Each listed entry's "X cm от ляво, Y cm от горе" equals the slot's visible-portion top-left on the named wall**.
- [ ] **Every dashed cut rectangle either bounds a placed piece's image region or matches a notch on a placed piece** — no stray boundaries inside used regions.
- [ ] **Gray-tinted areas are exactly the parts of the tile no placed piece uses** — and only those.
- [ ] **Unused area footer (cm²) ≈ tileArea − sum of all visible-rect areas** for that tile.
- [ ] **Whole-tile uses (no placed descendants)** keep the root listed and ungrayed.
- [ ] **Tile-as-source uses (≥1 placed descendant)** hide the root from list/label and gray its placement region.
- [ ] **Wall preview page** shows the same piece-IDs as the per-tile sections.
- [ ] **Niche page** renders all five surface tiles (background images, not blank dashed boxes).

If any check fails, the cut sheet is NOT shippable.
