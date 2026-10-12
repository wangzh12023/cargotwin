import { box, plane, rng } from './geometry.js';
import { GRID, blockX0, blockZ0 } from './layout.js';
import { BAY_W, FLOOR_H } from './textures.js';

const SLAB_H = 0.16; // blocks (sidewalk + lots) are raised above the asphalt

/** Roads, markings, sidewalks and lot surfaces for the whole grid. */
export function buildStreets(batch, M) {
  const { BX, BZ, ROAD, SIDEWALK, COLS, ROWS } = GRID;
  const x0 = blockX0(COLS[0]) - ROAD, x1 = blockX0(COLS[1]) + BX + ROAD;
  const z0 = blockZ0(ROWS[0]) - ROAD, z1 = blockZ0(ROWS[1]) + BZ + ROAD;
  const W = x1 - x0, D = z1 - z0;

  // asphalt everywhere, plus an outer apron that fades into the fog
  batch.add('road', plane(W + 4000, D + 4000), (x0 + x1) / 2, 0, (z0 + z1) / 2);

  for (let i = COLS[0]; i <= COLS[1]; i++) {
    for (let j = ROWS[0]; j <= ROWS[1]; j++) {
      const bx = blockX0(i), bz = blockZ0(j);
      const cx = bx + BX / 2, cz = bz + BZ / 2;
      // raised slab with sidewalk colour, lot inset on top
      batch.add('sidewalk', box(BX, SLAB_H, BZ, { noTop: false }), cx, 0, cz);
      batch.add('lot', plane(BX - SIDEWALK * 2, BZ - SIDEWALK * 2), cx, SLAB_H + 0.005, cz);
    }
  }

  // lane markings: centre dashes + lane dividers on every road segment between intersections
  const dash = plane(0.22, 3.2);
  const dashX = plane(3.2, 0.22);
  const stripeN = plane(0.62, 3.6);  // zebra stripe on a N-S road (stripe runs N-S)
  const stripeE = plane(3.6, 0.62);
  for (let i = COLS[0] - 1; i <= COLS[1]; i++) {
    // N-S road east of column i
    const rx = blockX0(i) + BX + ROAD / 2;
    for (let j = ROWS[0]; j <= ROWS[1]; j++) {
      const za = blockZ0(j), zb = za + BZ;
      for (const off of [-ROAD / 4, 0, ROAD / 4]) {
        for (let z = za + 9; z < zb - 9; z += 9.5) batch.add('marking', dash, rx + off, 0.02, z);
      }
      // crosswalks at both ends of this segment
      for (const zc of [za + 2.6, zb - 2.6]) {
        for (let s = -ROAD / 2 + 1.2; s <= ROAD / 2 - 1.2; s += 1.3) batch.add('marking', stripeN, rx + s, 0.02, zc);
      }
    }
  }
  for (let j = ROWS[0] - 1; j <= ROWS[1]; j++) {
    const rz = blockZ0(j) + BZ + ROAD / 2;
    for (let i = COLS[0]; i <= COLS[1]; i++) {
      const xa = blockX0(i), xb = xa + BX;
      for (const off of [-ROAD / 4, 0, ROAD / 4]) {
        for (let x = xa + 9; x < xb - 9; x += 9.5) batch.add('marking', dashX, x, 0.02, rz + off);
      }
      for (const xc of [xa + 2.6, xb - 2.6]) {
        for (let s = -ROAD / 2 + 1.2; s <= ROAD / 2 - 1.2; s += 1.3) batch.add('marking', stripeE, xc, 0.02, rz + s);
      }
    }
  }
  return { SLAB_H };
}

/** Office building with window-grid facades, parapet and roof clutter. */
export function office(batch, scatter, x, z, w, d, floors, opts = {}) {
  const r = opts.rng || Math.random;
  const y0 = SLAB_H;
  const mat = opts.mat || 'facade';
  const h = floors * FLOOR_H;
  batch.add(mat, box(w, h, d, { uv: [BAY_W, FLOOR_H], uvOffset: [opts.uOff ?? 0, 0] }), x, y0, z);
  roofTop(batch, scatter, x, z, w, d, y0 + h, { rng: r, units: opts.units ?? true, roofMat: opts.roofMat || 'roof' });

  // optional set-back penthouse
  if (opts.penthouse) {
    const pw = Math.max(BAY_W * 3, Math.round((w * 0.45) / BAY_W) * BAY_W);
    const pd = Math.max(BAY_W * 3, Math.round((d * 0.5) / BAY_W) * BAY_W);
    const pf = opts.penthouse;
    batch.add(mat, box(pw, pf * FLOOR_H, pd, { uv: [BAY_W, FLOOR_H] }), x, y0 + h, z);
    roofTop(batch, scatter, x, z, pw, pd, y0 + h + pf * FLOOR_H, { rng: r, units: false });
  }
  // entrance canopy + lobby glass on the street side
  if (opts.entrance) {
    const [nx, nz] = opts.entrance; // outward normal of the entrance facade
    const cw = Math.min(12, (nx ? d : w) * 0.35);
    const ex = x + nx * ((w / 2) + 1.4), ez = z + nz * ((d / 2) + 1.4);
    const cbox = nx ? box(2.8, 0.45, cw) : box(cw, 0.45, 2.8);
    batch.add('parapet', cbox, ex, y0 + 3.6, ez);
    const gbox = nx ? box(0.3, 3.4, cw * 0.8) : box(cw * 0.8, 3.4, 0.3);
    batch.add('darkGlass', gbox, x + nx * (w / 2 + 0.05), y0, z + nz * (d / 2 + 0.05));
  }
  return y0 + h;
}

/** Flat roof with parapet and a few AC units / vents. */
export function roofTop(batch, scatter, x, z, w, d, top, { rng: r = Math.random, units = true, roofMat = 'roof', parapetH = 0.9 } = {}) {
  const t = 0.45;
  batch.add(roofMat, plane(w - t * 2, d - t * 2), x, top + 0.02, z);
  batch.add('parapet', box(w, parapetH, t, { noTop: false }), x, top, z - d / 2 + t / 2);
  batch.add('parapet', box(w, parapetH, t, { noTop: false }), x, top, z + d / 2 - t / 2);
  batch.add('parapet', box(t, parapetH, d - t * 2, { noTop: false }), x - w / 2 + t / 2, top, z);
  batch.add('parapet', box(t, parapetH, d - t * 2, { noTop: false }), x + w / 2 - t / 2, top, z);
  if (!units || !scatter) return;
  const n = 1 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const ux = x + (r() - 0.5) * (w - 8), uz = z + (r() - 0.5) * (d - 8);
    scatter.add(r() < 0.6 ? 'rooftop_ac' : 'roof_vent', ux, uz, r() < 0.5 ? 0 : Math.PI / 2, { y: top });
  }
}

/** Fill a regular office block with 2–5 buildings (deterministic per block). */
export function officeBlock(batch, scatter, i, j) {
  const { BX, BZ, SIDEWALK } = GRID;
  const r = rng(1000 + (i + 50) * 131 + (j + 50) * 17);
  const bx = blockX0(i), bz = blockZ0(j);
  const inner = { x: bx + SIDEWALK + 3, z: bz + SIDEWALK + 3, w: BX - SIDEWALK * 2 - 6, d: BZ - SIDEWALK * 2 - 6 };
  const snap = (v) => Math.max(BAY_W * 4, Math.floor(v / BAY_W) * BAY_W);
  const tpl = r.pick(['row3', 'row2', 'grid4', 'row3', 'big2', 'row4']);
  const cells = [];
  const gap = 8;
  if (tpl === 'row2' || tpl === 'row3' || tpl === 'row4') {
    const n = tpl === 'row2' ? 2 : tpl === 'row3' ? 3 : 4;
    const cw = (inner.w - gap * (n - 1)) / n;
    for (let k = 0; k < n; k++) {
      const dd = inner.d * r.range(0.62, 0.95);
      const zoff = r() < 0.5 ? 0 : inner.d - dd;
      cells.push([inner.x + k * (cw + gap), inner.z + zoff, cw, dd]);
    }
  } else if (tpl === 'grid4') {
    const cw = (inner.w - gap) / 2, cd = (inner.d - gap) / 2;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) cells.push([inner.x + a * (cw + gap), inner.z + b * (cd + gap), cw, cd]);
  } else {
    const split = r.range(0.45, 0.6);
    cells.push([inner.x, inner.z, inner.w * split - gap / 2, inner.d]);
    cells.push([inner.x + inner.w * split + gap / 2, inner.z, inner.w * (1 - split) - gap / 2, inner.d * r.range(0.6, 1)]);
  }
  for (const [cx, cz, cw, cd] of cells) {
    const w = snap(cw * r.range(0.82, 1)), d = snap(cd * r.range(0.82, 1));
    const floors = r.int(5, 13);
    const px = cx + (cw - w) * r(), pz = cz + (cd - d) * r();
    const entrance = r() < 0.5 ? [0, 1] : [0, -1];
    office(batch, scatter, px + w / 2, pz + d / 2, w, d, floors, {
      rng: r,
      penthouse: r() < 0.22 ? r.int(1, 2) : 0,
      entrance: r() < 0.7 ? entrance : null,
    });
  }
  // street lamps at the block corners
  const s = SIDEWALK / 2;
  for (const [lx, lz, rot] of [[bx + s, bz + s, Math.PI], [bx + BX - s, bz + s, 0], [bx + s, bz + BZ - s, Math.PI], [bx + BX - s, bz + BZ - s, 0]]) {
    scatter.add('street_lamp', lx, lz, rot, { y: SLAB_H });
  }
}

export { SLAB_H };
