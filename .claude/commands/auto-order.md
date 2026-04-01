# Auto-Order: Tile Layout Optimization

Generate optimized tile arrangements across walls using computer vision pattern matching and simulated annealing.

**Note:** The auto-ordering scripts live in the sibling vanilla project (`~/projects/tile-planner/`), not in this React project. The tile images are shared — both projects use `public/tiles/` (React) or `tiles/` (vanilla). The output `layout-N.json` files can be manually applied to the React app's state via the Load JSON feature.

## Overview

The auto-ordering system (`~/projects/tile-planner/auto-order.py`) analyzes the 18 marble tile images and finds the best arrangement across all defined walls. It optimizes for three things simultaneously:

1. **Vein alignment** — adjacent tiles should have continuous marble vein patterns at their shared edges
2. **Density gradient** — heavier-veined tiles go at the bottom, lighter tiles at the top, creating a natural visual gradient
3. **Row coherence** — tiles in the same row across ALL walls (which are physically adjacent in the bathroom) should have similar vein density so the horizontal band looks consistent

Each tile can be placed at 0° or 180° rotation, doubling the matching possibilities.

## How It Works

### Step 1: Feature Extraction

For each of the 18 tiles, the script:
- Loads the image from `tiles/N.jpg` and downscales to 600px height for speed
- Extracts **2D edge strips** (80px wide) from all 4 edges (top, bottom, left, right)
- These strips capture the actual marble vein pattern near each edge, not just a 1D average
- Computes **overall vein density** — what fraction of the tile surface has dark vein pixels (threshold < 0.7 brightness)

### Step 2: Pairwise Scoring

For every ordered pair of tiles (324 pairs) × 4 rotation combinations (0°-0°, 0°-180°, 180°-0°, 180°-180°) × 2 directions (horizontal, vertical) = **2,592 scores** are precomputed.

The scoring function (`strip_similarity_2d`) is **vein-weighted**, not plain correlation:
- Detects vein pixels in both edge strips (dark pixels = veins)
- Computes **IoU (Intersection over Union)** of vein masks — do veins line up spatially?
- Computes **vein-region NCC** — correlates pixel values only within vein regions, ignoring white marble
- Adds a **density bonus** — edges with more veins produce higher-value matches
- **Blank-vs-blank edges score near zero** — two white edges matching isn't interesting

At 180° rotation, edges reverse: the top edge becomes the bottom edge (pixel order flipped both horizontally and vertically), and left/right swap similarly.

### Step 3: Simulated Annealing

The script runs **10 independent annealing runs**, each with 100,000 iterations, and keeps the **top 3 distinct layouts**.

Each run starts with a **density-sorted initial assignment** (heaviest tiles at the bottom row, lightest at top) and random rotations, then explores via three move types:
- **Cross-row swap (60%)** — swap any two tiles between any slots
- **Within-row swap (20%)** — swap two tiles in the same row (across different walls), preserving density bands while refining edge matches
- **Rotation flip (20%)** — toggle a tile between 0° and 180°

The **total score** combines:
- **Edge adjacency** — sum of vein alignment scores between all touching tile pairs
- **Row density variance penalty** — tiles in the same row with very different densities get penalized
- **Gradient violation penalty** — if a higher row has denser tiles than a lower row, heavy penalty

### Step 4: Output

The script generates:
- **HTML preview** at `auto-order-preview/index.html` showing all 3 layouts side by side
- **Layout JSONs** (`layout-1.json`, `layout-2.json`, `layout-3.json`)

## Usage

```bash
cd ~/projects/tile-planner

# Run the optimizer (takes ~2-3 minutes for 10 runs)
python3 auto-order.py

# Preview results (requires http server running in tile-planner/)
open http://localhost:8080/auto-order-preview/
```

### Applying to the React App

The layout JSONs use a per-wall format:
```json
{
  "Wall 1": {
    "0,0": { "pieceId": "5", "rotation": 180, "anchor": "top-left" }
  }
}
```

To apply: use the React app's "Load JSON" button with a full state export that has the placements updated, or manually place tiles following the preview.

## Tuning Parameters

| Parameter | Location | Default | Effect |
|-----------|----------|---------|--------|
| `NUM_RUNS` | `main()` | 10 | More runs = more variety, takes longer |
| `TOP_N` | `main()` | 3 | How many best layouts to keep |
| `iterations` | `simulated_annealing()` | 100,000 | More = better convergence |
| `STRIP_PX` | module level | 80 | Edge strip width in pixels |
| `density_weight` | `compute_total_score()` | 5.0 × edges | How strongly density coherence is enforced |

## Supporting Scripts

### `crop-tiles.py` — Auto-crop tile photos
```bash
python3 crop-tiles.py          # Preview
python3 crop-tiles.py --apply  # Apply crops
```

### `normalize-tiles.py` — Unify brightness and color
```bash
python3 normalize-tiles.py          # Preview
python3 normalize-tiles.py --apply  # Apply normalization
```

After running these, copy updated tiles to the React project:
```bash
cp ~/projects/tile-planner/tiles/*.jpg ~/projects/tile-planner-react/public/tiles/
```
