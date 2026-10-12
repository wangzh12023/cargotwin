import * as THREE from 'three';
import { GRID, blockX0, blockZ0 } from './layout.js';
import { DynamicPool } from './props.js';
import { SLAB_H } from './city.js';
import { rng } from './geometry.js';

/** Polyline with rounded corners, sampled by arc length. Points are [x, z]. */
export class Path {
  constructor(points, radius = 4) {
    this.pts = Path.round(points, radius);
    this.len = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      this.len.push(this.len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.total = this.len[this.len.length - 1];
  }
  static round(points, r) {
    if (points.length < 3 || r <= 0) return points.map((p) => [...p]);
    const out = [[...points[0]]];
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i], a = points[i - 1], b = points[i + 1];
      const da = Math.hypot(p[0] - a[0], p[1] - a[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const rr = Math.min(r, da / 2, db / 2);
      const pa = [p[0] + ((a[0] - p[0]) / da) * rr, p[1] + ((a[1] - p[1]) / da) * rr];
      const pb = [p[0] + ((b[0] - p[0]) / db) * rr, p[1] + ((b[1] - p[1]) / db) * rr];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, u = 1 - t;
        out.push([u * u * pa[0] + 2 * u * t * p[0] + t * t * pb[0], u * u * pa[1] + 2 * u * t * p[1] + t * t * pb[1]]);
      }
    }
    out.push([...points[points.length - 1]]);
    return out;
  }
  sample(s, out = { x: 0, z: 0, heading: 0 }) {
    s = THREE.MathUtils.clamp(s, 0, this.total);
    let lo = 0, hi = this.len.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.len[m] <= s) lo = m; else hi = m; }
    const a = this.pts[lo], b = this.pts[hi];
    const seg = this.len[hi] - this.len[lo] || 1;
    const t = (s - this.len[lo]) / seg;
    out.x = a[0] + (b[0] - a[0]) * t;
    out.z = a[1] + (b[1] - a[1]) * t;
    out.heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
    return out;
  }
}

/** A vehicle following a Path (forklifts, AMRs, scripted trucks). */
export class Mover {
  constructor(pool, { path = null, speed = 3, y = SLAB_H, loop = false, pingpong = false, pause = 0, x = 0, z = 0, heading = 0 } = {}) {
    this.pool = pool;
    this.index = pool.alloc();
    this.speed = speed; this.y = y; this.loop = loop; this.pingpong = pingpong; this.pause = pause;
    this.s = 0; this.dir = 1; this.wait = 0; this.done = false;
    this.pos = new THREE.Vector3(x, y, z);
    this.heading = heading;
    this.onArrive = null;
    this.visible = true;
    this.setPath(path);
    this.write();
  }
  setPath(path, { reverse = false } = {}) {
    this.path = path; this.s = reverse && path ? path.total : 0; this.dir = reverse ? -1 : 1; this.done = !path;
    this.reverseDriving = reverse;
  }
  update(dt) {
    if (!this.path || this.done) return;
    if (this.wait > 0) { this.wait -= dt; return; }
    this.s += this.dir * this.speed * dt;
    const end = this.dir > 0 ? this.s >= this.path.total : this.s <= 0;
    if (end) {
      if (this.pingpong) { this.dir *= -1; this.s = THREE.MathUtils.clamp(this.s, 0, this.path.total); this.wait = this.pause; }
      else if (this.loop) { this.s = 0; }
      else { this.s = THREE.MathUtils.clamp(this.s, 0, this.path.total); this.done = true; this.onArrive?.(this); }
    }
    const p = this.path.sample(this.s, _smp);
    this.pos.set(p.x, this.y, p.z);
    // forklifts reverse on the way back of a ping-pong run (forks stay facing the load)
    let h = p.heading;
    if (this.dir < 0 && !this.pingpong) h += Math.PI;
    if (this.dir < 0 && this.pingpong) h = p.heading; // drive backwards
    const dh = ((h - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.heading += dh * Math.min(1, dt * 8);
    this.write();
  }
  place(x, z, heading) { this.pos.set(x, this.y, z); this.heading = heading; this.write(); }
  write() {
    if (this.visible) this.pool.set(this.index, this.pos.x, this.pos.y, this.pos.z, this.heading);
    else this.pool.hide(this.index);
  }
  setVisible(v) { this.visible = v; this.write(); }
}
const _smp = { x: 0, z: 0, heading: 0 };

/** A scripted vehicle (FL-01, TRK-2051): drives a queue of path legs, can swap models (empty/loaded). */
export class Hero {
  constructor(pools, { x = 0, z = 0, heading = 0, y = SLAB_H, speed = 5 } = {}) {
    this.slots = {};
    for (const [k, pool] of Object.entries(pools)) this.slots[k] = { pool, index: pool.alloc() };
    this.mode = Object.keys(pools)[0];
    this.pos = new THREE.Vector3(x, y, z);
    this.y = y;
    this.heading = heading;
    this.speed = speed;
    this.queue = [];
    this.leg = null;
    this.s = 0;
    this.onDone = null;
    this.write();
  }
  get moving() { return !!this.leg; }
  setMode(m) { this.mode = m; this.write(); }
  /** legs: [{ points: [[x,z],...], reverse?, speed?, radius? }] */
  drive(legs, onDone = null) {
    this.queue = legs.map((l) => ({ ...l, path: new Path([[this.pos.x, this.pos.z], ...l.points].filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.05), l.radius ?? 3) }));
    // each leg after the first starts where the previous one ends
    for (let k = 1; k < this.queue.length; k++) {
      const prev = this.queue[k - 1].points.at(-1);
      this.queue[k].path = new Path([prev, ...this.queue[k].points], this.queue[k].radius ?? 3);
    }
    this.onDone = onDone;
    this.next();
  }
  next() {
    this.leg = this.queue.shift() || null;
    this.s = 0;
    if (!this.leg) { const cb = this.onDone; this.onDone = null; cb?.(this); }
  }
  stop() { this.queue = []; this.leg = null; this.onDone = null; }
  update(dt) {
    if (this.leg && dt > 0) {
      const { path, reverse = false } = this.leg;
      const speed = this.leg.speed ?? this.speed;
      const remaining = path.total - this.s;
      const v = speed * Math.min(1, 0.22 + Math.min(this.s, remaining) / 7);
      this.s = Math.min(path.total, this.s + v * dt);
      const p = path.sample(this.s, _smp);
      this.pos.set(p.x, this.groundFn ? this.groundFn(p.x, p.z) : this.y, p.z);
      const h = p.heading + (reverse ? Math.PI : 0);
      const dh = ((h - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.heading += dh * Math.min(1, dt * 9);
      if (this.s >= path.total - 1e-3) this.next();
    }
    this.write();
  }
  write() {
    for (const [k, slot] of Object.entries(this.slots)) {
      if (k === this.mode) slot.pool.set(slot.index, this.pos.x, this.pos.y, this.pos.z, this.heading);
      else slot.pool.hide(slot.index);
    }
  }
}

/** Random-walk traffic on the street grid (right-hand traffic, smooth turns). */
export class Traffic {
  constructor(pools, count = 46, seed = 7) {
    this.r = rng(seed);
    this.pools = pools;
    const { COLS, ROWS, BX, BZ, ROAD } = GRID;
    this.xs = []; for (let i = COLS[0] - 1; i <= COLS[1]; i++) this.xs.push(blockX0(i) + BX + ROAD / 2);
    this.zs = []; for (let j = ROWS[0] - 1; j <= ROWS[1]; j++) this.zs.push(blockZ0(j) + BZ + ROAD / 2);
    this.lane = ROAD * 0.19;
    this.cars = [];
    for (let k = 0; k < count; k++) this.spawn();
  }
  spawn() {
    const r = this.r;
    const pool = r() < 0.82 ? this.pools.truck : this.pools.flatbed;
    const ix = r.int(1, this.xs.length - 2), iz = r.int(1, this.zs.length - 2);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const d = r.pick(dirs);
    const car = { pool, index: pool.alloc(), ix, iz, d, speed: r.range(6.5, 9.5), s: r.range(0, 60), path: null };
    this.plan(car);
    this.cars.push(car);
  }
  node(ix, iz) { return [this.xs[ix], this.zs[iz]]; }
  plan(car) {
    // build a path from the current node along d to the next node, then turn into the next leg
    const r = this.r;
    const [dx, dz] = car.d;
    const nx = car.ix + dx, nz = car.iz + dz;
    if (nx < 0 || nx >= this.xs.length || nz < 0 || nz >= this.zs.length) { car.d = [-dx, -dz]; return this.plan(car); }
    // choose the following direction
    const opts = [[dx, dz], [dx, dz], [dx, dz], [-dz, dx], [dz, -dx]].filter(([a, b]) => {
      const tx = nx + a, tz = nz + b;
      return tx >= 0 && tx < this.xs.length && tz >= 0 && tz < this.zs.length;
    });
    const next = opts.length ? r.pick(opts) : [-dx, -dz];
    const L = this.lane;
    const right = (v) => [-v[1], v[0]];
    const [ax, az] = this.node(car.ix, car.iz), [bx, bz] = this.node(nx, nz);
    const rc = right(car.d), rn = right(next);
    const pre = 13, post = 13;
    const start = [ax + dx * post + rc[0] * L, az + dz * post + rc[1] * L];
    const before = [bx - dx * pre + rc[0] * L, bz - dz * pre + rc[1] * L];
    const corner = [bx + rc[0] * L + rn[0] * L * 0 + (next[0] === dx && next[1] === dz ? 0 : (rn[0] * L)), bz + rc[1] * L + (next[0] === dx && next[1] === dz ? 0 : rn[1] * L)];
    const after = [bx + next[0] * post + rn[0] * L, bz + next[1] * post + rn[1] * L];
    const pts = next[0] === dx && next[1] === dz ? [start, after] : [start, before, corner, after];
    car.path = new Path(pts, 9);
    car.ix = nx; car.iz = nz; car.d = next;
  }
  update(dt) {
    for (const car of this.cars) {
      car.s += car.speed * dt;
      if (car.s >= car.path.total) { car.s -= car.path.total; this.plan(car); }
      const p = car.path.sample(car.s, _smp);
      car.pool.set(car.index, p.x, 0, p.z, p.heading);
    }
  }
}

export function createPools(lib, group) {
  const pools = {
    truck: new DynamicPool(lib, 'truck_box', 70),
    flatbed: new DynamicPool(lib, 'truck_flatbed', 16),
    forklift: new DynamicPool(lib, 'forklift', 24),
    forkliftLoaded: new DynamicPool(lib, 'forklift_loaded', 12),
    amr: new DynamicPool(lib, 'amr', 12),
  };
  for (const p of Object.values(pools)) group.add(p.group);
  return pools;
}
