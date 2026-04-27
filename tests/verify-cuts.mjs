// Verify the cut sheet against the planning data, end-to-end.
//
// For each source tile we use the REAL engine (gridEngine.computeGrid +
// services/printData.buildElementList) to compute what each placed piece's
// used dims and wall-coord position should be, what the visible rectangle
// on the source tile should look like, and what the unused area should be.
// Then we open the running app, toggle Cut Mode, and read back what the
// cut sheet actually shows. Anything that mismatches is reported.
//
// Run: npx vite-node tests/verify-cuts.mjs   (dev server must be on :5173)

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildElementList } from '../src/services/printData.ts';
import { getChildPieces } from '../src/services/pieceHelpers.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures/USER-latest.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

function placedSet(walls) {
  const s = new Set();
  for (const w of walls) {
    for (const pl of Object.values(w.tiles || {})) s.add(pl.pieceId);
    for (const tiles of Object.values(w.nicheTiles || {})) {
      for (const pl of Object.values(tiles)) s.add(pl.pieceId);
    }
  }
  return s;
}

function visibleRectInTile(piece, slotW, slotH, placement) {
  const ir = piece.imageRegion;
  const offX = placement.offsetX ?? 0;
  const offY = placement.offsetY ?? 0;
  const isRotated =
    Math.abs(piece.width - ir.w) > 0.01 &&
    Math.abs(piece.width - ir.h) < 0.01;
  const vxL = Math.max(0, -offX);
  const vyT = Math.max(0, -offY);
  const vxR = Math.min(piece.width, slotW - offX);
  const vyB = Math.min(piece.height, slotH - offY);
  if (vxR <= vxL || vyB <= vyT) return null;
  if (isRotated) {
    return { x: ir.x + ir.w - vyB, y: ir.y + vxL, w: vyB - vyT, h: vxR - vxL };
  }
  return { x: ir.x + vxL, y: ir.y + vyT, w: vxR - vxL, h: vyB - vyT };
}

const elements = buildElementList(fixture.walls, fixture.pieces, fixture.orientation);
const elemByPieceId = new Map(elements.map((e) => [e.pieceId, e]));
const placed = placedSet(fixture.walls);

const tilesUsed = new Set();
for (const pid of placed) {
  const p = fixture.pieces[pid];
  if (p) tilesUsed.add(p.sourceTileId);
}

function hasPlacedChildPiece(pid) {
  for (const c of getChildPieces(fixture.pieces, pid)) {
    if (placed.has(c.id) || hasPlacedChildPiece(c.id)) return true;
  }
  return false;
}

const report = [];
for (const tileId of [...tilesUsed].sort((a, b) => a - b)) {
  const rootId = String(tileId);
  const root = fixture.pieces[rootId];
  if (!root) continue;
  const allPiecesInChain = Object.values(fixture.pieces).filter((p) => p.sourceTileId === tileId);
  const rootIsTileSource = hasPlacedChildPiece(rootId);

  const expected = {
    tileId,
    rootIsTileSource,
    listed: [],
    sumVisible: 0,
  };

  for (const piece of allPiecesInChain) {
    if (!placed.has(piece.id)) continue;
    if (rootIsTileSource && piece.id === rootId) continue;
    const elem = elemByPieceId.get(piece.id);
    if (!elem) continue;
    const offX = elem.placement.offsetX ?? 0;
    const offY = elem.placement.offsetY ?? 0;
    const usedLeft = Math.max(0, -offX);
    const usedTop = Math.max(0, -offY);
    const usedRight = Math.min(piece.width, elem.slotW - offX);
    const usedBottom = Math.min(piece.height, elem.slotH - offY);
    const dispW = Math.max(0, usedRight - usedLeft);
    const dispH = Math.max(0, usedBottom - usedTop);
    const fromLeft = elem.slotX + Math.max(0, offX);
    const fromTop = elem.slotY + Math.max(0, offY);
    const vr = visibleRectInTile(piece, elem.slotW, elem.slotH, elem.placement);
    expected.listed.push({
      pieceId: piece.id,
      dispW: +dispW.toFixed(1),
      dispH: +dispH.toFixed(1),
      fromLeft: +fromLeft.toFixed(1),
      fromTop: +fromTop.toFixed(1),
      wallName: elem.wall.name,
      surface: elem.surface,
    });
    if (vr) expected.sumVisible += vr.w * vr.h;
  }
  expected.unusedArea = +(60 * 120 - expected.sumVisible).toFixed(0);
  report.push(expected);
}

// --- Render via Playwright in cut mode and compare ---
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1800 } });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/tile-planner-react/', { waitUntil: 'networkidle' });
await page.evaluate((s) => localStorage.setItem('tile-planner-state', JSON.stringify(s)), fixture);
await page.goto('http://localhost:5173/tile-planner-react/', { waitUntil: 'networkidle' });

const cutBtn = await page.locator('button', { hasText: /^Cut Mode$/ }).first();
await cutBtn.click();
await page.waitForTimeout(800);

const onScreen = await page.evaluate(() => {
  const sections = Array.from(document.querySelectorAll('[class*="tileSection"]'));
  return sections.map((sec) => {
    const title = sec.querySelector('h3')?.textContent ?? '';
    const m = title.match(/#(\d+)/);
    const tileId = m ? Number(m[1]) : null;
    const entries = Array.from(sec.querySelectorAll('[class*="pieceDesc"]')).map((d) => {
      const id = d.querySelector('[class*="pieceBadge"]')?.textContent ?? '';
      const dims = d.querySelector('[class*="pieceDims"]')?.textContent ?? '';
      const info = d.querySelector('[class*="pieceInfo"]')?.textContent ?? '';
      return { id, dims, info };
    });
    const waste = sec.querySelector('[class*="waste"]')?.textContent ?? '';
    const labelBadges = Array.from(sec.querySelectorAll('svg text'))
      .map((t) => t.textContent)
      .filter((t) => t && t.trim());
    return { tileId, entries, waste, labelBadges };
  });
});
await browser.close();

let issues = 0;
for (const exp of report) {
  const got = onScreen.find((s) => s.tileId === exp.tileId);
  if (!got) {
    if (exp.listed.length > 0) {
      console.log(`tile ${exp.tileId}: NO RENDERED SECTION (expected entries: ${exp.listed.map((l) => l.pieceId).join(',')})`);
      issues++;
    }
    continue;
  }

  const expIds = exp.listed.map((l) => l.pieceId).sort();
  const gotIds = got.entries.map((e) => e.id).sort();
  if (JSON.stringify(expIds) !== JSON.stringify(gotIds)) {
    console.log(`tile ${exp.tileId}: LISTED MISMATCH`);
    console.log(`  expected: ${JSON.stringify(expIds)}`);
    console.log(`  got     : ${JSON.stringify(gotIds)}`);
    issues++;
  }

  for (const l of exp.listed) {
    const e = got.entries.find((x) => x.id === l.pieceId);
    if (!e) continue;
    const expDim = `${l.dispW.toFixed(1)} × ${l.dispH.toFixed(1)}`;
    if (!e.dims.includes(expDim)) {
      console.log(`tile ${exp.tileId} ${l.pieceId}: DIM mismatch — expected "${expDim}", got "${e.dims}"`);
      issues++;
    }
    const expL = `${l.fromLeft.toFixed(1)} см от ляво`;
    const expT = `${l.fromTop.toFixed(1)} см от горе`;
    if (!e.info.includes(expL)) {
      console.log(`tile ${exp.tileId} ${l.pieceId}: fromLeft mismatch — expected "${expL}", got info "${e.info}"`);
      issues++;
    }
    if (!e.info.includes(expT)) {
      console.log(`tile ${exp.tileId} ${l.pieceId}: fromTop mismatch — expected "${expT}", got info "${e.info}"`);
      issues++;
    }
  }

  const visualLabels = (got.labelBadges || []).sort();
  if (JSON.stringify(visualLabels) !== JSON.stringify(expIds)) {
    console.log(`tile ${exp.tileId}: VISUAL LABEL mismatch`);
    console.log(`  expected: ${JSON.stringify(expIds)}`);
    console.log(`  got     : ${JSON.stringify(visualLabels)}`);
    issues++;
  }

  const m = got.waste.match(/(\d+)\s*см/);
  const gotUnused = m ? Number(m[1]) : 0;
  if (Math.abs(gotUnused - exp.unusedArea) > 1) {
    console.log(
      `tile ${exp.tileId}: UNUSED AREA mismatch — expected ${exp.unusedArea}, got ${gotUnused}`
    );
    issues++;
  }
}

console.log(`\n=== Verification: ${issues === 0 ? 'PASS ✓' : `${issues} issue(s) ✗`} ===`);
console.log(`Tiles checked: ${report.length}, sections rendered: ${onScreen.length}`);
process.exit(issues === 0 ? 0 : 1);
