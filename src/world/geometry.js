import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Axis-aligned box whose UVs are expressed in metres (divided by `uv` = [uScale, vScale]).
 * Side faces: u runs along the face from its left edge, v = height from the bottom.
 * The box is created with its bottom at y = 0 and centred on x/z.
 * `faces` can drop faces that are never visible (e.g. bottom).
 */
export function box(w, h, d, { uv = [1, 1], uvOffset = [0, 0], noBottom = true, noTop = false } = {}) {
  const [us, vs] = uv;
  const [uo, vo] = uvOffset;
  const hx = w / 2, hz = d / 2;
  const pos = [], nor = [], uvs = [], idx = [];
  let vi = 0;
  const quad = (p0, p1, p2, p3, n, uv0, uv1, uv2, uv3) => {
    pos.push(...p0, ...p1, ...p2, ...p3);
    for (let i = 0; i < 4; i++) nor.push(...n);
    uvs.push(...uv0, ...uv1, ...uv2, ...uv3);
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  };
  const V = (s, y) => [(s + uo) / us, (y + vo) / vs];
  // +Z (south) face, viewer looking north: left = -x
  quad([-hx, 0, hz], [hx, 0, hz], [hx, h, hz], [-hx, h, hz], [0, 0, 1], V(0, 0), V(w, 0), V(w, h), V(0, h));
  // -Z (north) face: left = +x
  quad([hx, 0, -hz], [-hx, 0, -hz], [-hx, h, -hz], [hx, h, -hz], [0, 0, -1], V(0, 0), V(w, 0), V(w, h), V(0, h));
  // +X (east) face: left = +z
  quad([hx, 0, hz], [hx, 0, -hz], [hx, h, -hz], [hx, h, hz], [1, 0, 0], V(0, 0), V(d, 0), V(d, h), V(0, h));
  // -X (west) face: left = -z
  quad([-hx, 0, -hz], [-hx, 0, hz], [-hx, h, hz], [-hx, h, -hz], [-1, 0, 0], V(0, 0), V(d, 0), V(d, h), V(0, h));
  if (!noTop) quad([-hx, h, hz], [hx, h, hz], [hx, h, -hz], [-hx, h, -hz], [0, 1, 0], [-hx / us, hz / us], [hx / us, hz / us], [hx / us, -hz / us], [-hx / us, -hz / us]);
  if (!noBottom) quad([-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz], [0, -1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** Horizontal rectangle (top-facing) at height y, centred on x/z. UVs in metres / uvScale. */
export function plane(w, d, { uv = 1 } = {}) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  if (uv !== 1) {
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, (a.getX(i) * w) / uv, (a.getY(i) * d) / uv);
  }
  return g;
}

/** Flat polygon (XZ) from a list of [x,z] points (counter-clockwise when viewed from above). */
export function polygon(points, y = 0) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/** Flat ribbon following a polyline in XZ (for route lines / outlines). */
export function ribbon(points, width, y = 0, closed = false) {
  const pts = closed ? [...points, points[0], points[1]] : points;
  const pos = [], idx = [], uvs = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    let tx = next[0] - prev[0], tz = next[1] - prev[1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    // miter
    let nx = -tz, nz = tx;
    let scale = 1;
    if (i > 0 && i < pts.length - 1) {
      const ax = p[0] - prev[0], az = p[1] - prev[1], al = Math.hypot(ax, az) || 1;
      const n1x = -az / al, n1z = ax / al;
      const dot = nx * n1x + nz * n1z;
      scale = 1 / Math.max(0.35, dot);
    }
    if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const hw = (width / 2) * scale;
    pos.push(p[0] + nx * hw, y, p[1] + nz * hw, p[0] - nx * hw, y, p[1] - nz * hw);
    uvs.push(dist, 0, dist, 1);
    if (i < pts.length - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Collects geometries per material key, merges them into as few meshes as possible. */
export class Batcher {
  constructor(materials) {
    this.materials = materials;
    this.groups = new Map(); // key -> geometry[]
  }
  /** add geometry transformed by (x, y, z, rotY) or a Matrix4 */
  add(matKey, geo, x = 0, y = 0, z = 0, rotY = 0) {
    if (!this.materials[matKey]) throw new Error(`unknown material ${matKey}`);
    const g = geo.index ? geo : geo; // keep indexed geometry as-is
    const m = new THREE.Matrix4();
    if (x && x.isMatrix4) m.copy(x);
    else m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(_up, rotY), _one);
    const c = g.clone().applyMatrix4(m);
    if (!c.attributes.uv) {
      c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
    }
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
    if (!c.index) {
      const n = c.attributes.position.count;
      const ix = new Array(n); for (let i = 0; i < n; i++) ix[i] = i;
      c.setIndex(ix);
    }
    if (!this.groups.has(matKey)) this.groups.set(matKey, []);
    this.groups.get(matKey).push(c);
    return c;
  }
  build({ castShadow = true, receiveShadow = true, name = 'batch' } = {}) {
    const out = new THREE.Group();
    out.name = name;
    for (const [key, list] of this.groups) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, this.materials[key]);
      mesh.name = `${name}:${key}`;
      mesh.castShadow = castShadow && !this.materials[key].userData.noCast;
      mesh.receiveShadow = receiveShadow;
      out.add(mesh);
      for (const g of list) g.dispose();
    }
    this.groups.clear();
    return out;
  }
}

const _up = new THREE.Vector3(0, 1, 0);
const _one = new THREE.Vector3(1, 1, 1);

/** Deterministic PRNG (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}
