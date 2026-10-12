import * as THREE from 'three';
import { box, plane, Batcher, rng } from './geometry.js';
import { GRID, DISTRICT, FACILITIES, local } from './layout.js';
import { roofTop, office, SLAB_H } from './city.js';
import { PropScatter } from './props.js';
import { BAY_W, FLOOR_H, textTexture } from './textures.js';

// Builders for the six industrial blocks. All coordinates below are block-local:
// x = metres from the block's west edge (0..160), z = metres from its north edge (0..112).

const Y = SLAB_H;
const WALL_T = 0.45;

function panelMaterial(text, bg = '#e8501c') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ffffff';
  g.font = '600 54px Inter, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return new THREE.MeshLambertMaterial({ map: t });
}

export class District {
  constructor(M, scatter) {
    this.M = M;
    this.scatter = scatter;
    this.batch = new Batcher(M);
    this.roofs = new Map();      // facility -> Batcher (removable roof)
    this.pick = [];              // { facility, box: Box3 }
    this.extraMeshes = [];       // meshes with unique materials (text panels, floor text)
    this.yards = {};             // named points/paths used by the simulation
    this.dynamic = {};           // animated meshes (doors)
    this.roofExtras = new Map(); // facility -> meshes that hide together with the roof
    this.cutaways = new Map();   // facility -> Batcher shown only while the roof is hidden
    this.cutProps = new Map();   // facility -> PropScatter shown only while the roof is hidden
  }

  // --- helpers -----------------------------------------------------------------------------
  W(b, x, z) { const [i, j] = DISTRICT[b]; return local(i, j, x, z); }

  addPick(facility, b, x0, z0, x1, z1, h) {
    const [ax, az] = this.W(b, x0, z0), [bx, bz] = this.W(b, x1, z1);
    this.pick.push({ facility, box: new THREE.Box3(new THREE.Vector3(ax, 0, az), new THREE.Vector3(bx, h, bz)) });
  }

  prop(name, b, x, z, rot = 0, opts = {}) {
    const [wx, wz] = this.W(b, x, z);
    this.scatter.add(name, wx, wz, rot, { y: Y + (opts.y || 0), ...opts, y: Y + (opts.y || 0) });
  }

  slab(mat, b, x, z, w, h, d, y = 0, target = this.batch, opts = {}) {
    const [wx, wz] = this.W(b, x, z);
    target.add(mat, box(w, h, d, opts), wx, Y + y, wz);
  }

  flat(mat, b, x, z, w, d, y = 0.02, target = this.batch) {
    const [wx, wz] = this.W(b, x, z);
    target.add(mat, plane(w, d), wx, Y + y, wz);
  }

  floorText(b, text, x, z, w, rot = 0) {
    const tex = textTexture(text, { color: 'rgba(95,95,95,0.7)' });
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const mesh = new THREE.Mesh(plane(w, w / 4), m);
    const [wx, wz] = this.W(b, x, z);
    mesh.position.set(wx, Y + 0.04, wz);
    mesh.rotation.y = rot;
    mesh.renderOrder = 2;
    this.extraMeshes.push(mesh);
  }

  fence(b, x0, z0, x1, z1, gaps = []) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 4));
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const tm = (t0 + t1) / 2;
      const s = tm * len;
      if (gaps.some(([a, c]) => s > a && s < c)) continue;
      const x = x0 + (x1 - x0) * tm, z = z0 + (z1 - z0) * tm;
      this.prop('fence', b, x, z, rot, { sx: len / n / 4 });
    }
  }

  trees(b, pts) { for (const [x, z] of pts) this.prop('tree', b, x, z, (x * 7 + z) % 6); }
  lamps(b, pts) { for (const [x, z, r = 0] of pts) this.prop('street_lamp', b, x, z, r); }

  pallets(b, x, z, cols, rows, dx = 1.8, dz = 1.6, kinds = ['pallet_boxes'], seed = 1) {
    const r = rng(seed);
    for (let a = 0; a < cols; a++) for (let c = 0; c < rows; c++) {
      if (r() < 0.15) continue;
      this.prop(r.pick(kinds), b, x + a * dx, z + c * dz, r() < 0.5 ? 0 : Math.PI / 2);
    }
  }

  /** walls with an optional door opening on one face; returns nothing (adds to batch) */
  walls(b, x, z, w, d, h, mat, { door = null, uvPeriod = 3.2, target = this.batch } = {}) {
    const t = WALL_T;
    const uv = [uvPeriod, h];
    const add = (cx, cz, ww, dd, hh = h, y = 0) => this.slab(mat, b, cx, cz, ww, hh, dd, y, target, { uv: [uvPeriod, hh], noTop: false });
    // north, west, east
    add(x, z - d / 2 + t / 2, w, t);
    add(x - w / 2 + t / 2, z, t, d - t * 2);
    add(x + w / 2 - t / 2, z, t, d - t * 2);
    // south with opening
    const zs = z + d / 2 - t / 2;
    if (!door) { add(x, zs, w, t); return; }
    const dw = door.w, dh = door.h, dx = door.x ?? x;
    const lw = dx - dw / 2 - (x - w / 2), rw = (x + w / 2) - (dx + dw / 2);
    if (lw > 0.01) add(x - w / 2 + lw / 2, zs, lw, t);
    if (rw > 0.01) add(x + w / 2 - rw / 2, zs, rw, t);
    add(dx, zs, dw, t, h - dh, dh);
  }

  skylights(b, x, z, w, d, top, rows, cols, target) {
    const sx = w / cols, sz = d / (rows + 1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      this.slab('white', b, x - w / 2 + sx * (c + 0.5), z - d / 2 + sz * (r + 1), 3.0, 0.32, 2.0, top, target, { noTop: false });
    }
  }

  /** White ribbed shed with an orange overhanging roof and a central door bay (R&I, Sort & pack…). */
  shed(b, facility, { x, z, w, d, h = 10.5, label = '', interior = null, cutaway = false }) {
    const roof = new Batcher(this.M);
    this.roofs.set(facility, roof);
    const doorW = 10, doorH = 7.2;
    // with a cutaway the ribbed shell belongs to the roof group and is swapped for a plain,
    // open-front shell when the roof is hidden (like the reference "Show roof" view)
    this.walls(b, x, z, w, d, h, 'ribTicks', { door: { w: doorW, h: doorH }, target: cutaway ? roof : this.batch });
    if (cutaway) {
      const cut = new Batcher(this.M);
      this.cutaways.set(facility, cut);
      const t = WALL_T, sw = (w - doorW) / 2;
      this.slab('parapet', b, x, z - d / 2 + t / 2, w, h, t, 0, cut, { noTop: false });
      this.slab('parapet', b, x - w / 2 + t / 2, z, t, h, d - t * 2, 0, cut, { noTop: false });
      this.slab('parapet', b, x + w / 2 - t / 2, z, t, h, d - t * 2, 0, cut, { noTop: false });
      this.slab('ribWhite', b, x - w / 2 + sw / 2, z + d / 2 - t / 2, sw, 1.3, t, 0, cut, { uv: [2.2, 1.3], noTop: false });
      this.slab('ribWhite', b, x + w / 2 - sw / 2, z + d / 2 - t / 2, sw, 1.3, t, 0, cut, { uv: [2.2, 1.3], noTop: false });
      const cp = new PropScatter(this.scatter.lib);
      this.cutProps.set(facility, cp);
      for (const s of [-1, 1]) {
        const [bx, bz] = this.W(b, x + s * (doorW / 2 + 0.6), z + d / 2 + 0.5);
        cp.add('bollard', bx, bz, 0, { y: Y });
      }
    }
    // orange header panel with label above the opening (slightly proud of the wall)
    const [hx, hz] = this.W(b, x, z + d / 2 + 0.05);
    const pm = panelMaterial(label);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(doorW + 0.6, 2.4), pm);
    panel.position.set(hx, Y + doorH + 1.35, hz);
    // the header band belongs to the roof: hiding the roof reveals the open-top interior
    this.roofExtras.set(facility, [panel]);
    this.slab('orangeWall', b, x, z + d / 2 - 0.1, doorW + 0.6, h - doorH - 2.6, 0.5, doorH + 2.55, roof);
    // interior floor (visible through the door / with the roof hidden)
    this.flat('floor', b, x, z, w - 1, d - 1, 0.03);
    // roof slab + skylights (removable)
    this.slab('orangeRoof', b, x, z, w + 0.7, 0.55, d + 0.7, h, roof, { noTop: false });
    this.skylights(b, x, z, w * 0.82, d * 0.78, h + 0.55, 2, 5, roof);
    this.addPick(facility, b, x - w / 2, z - d / 2, x + w / 2, z + d / 2, h + 1);
    if (interior) interior();
  }

  /** Orange ribbed warehouse with dock doors on the south face (WH-01, freight terminal). */
  dockWarehouse(b, facility, { x, z, w, d, h = 11, docks = [], wallMat = 'ribOrange', roofMat = 'orangeRoof', sky = [2, 8], levelers = true, removable = true, sideDoor = null }) {
    const roof = removable ? new Batcher(this.M) : this.batch;
    if (removable) this.roofs.set(facility, roof);
    this.walls(b, x, z, w, d, h, wallMat, { uvPeriod: 4.0 });
    this.flat('floor', b, x, z, w - 1, d - 1, 0.03);
    for (const dx of docks) {
      this.prop('door_rollup', b, dx, z + d / 2 + 0.12, 0);
      if (levelers) this.prop('dock_leveler', b, dx, z + d / 2 + 1.5, 0);
    }
    if (sideDoor) this.prop('door_rollup', b, x + w / 2 + 0.12, sideDoor, Math.PI / 2);
    this.slab(roofMat, b, x, z, w + 0.5, 0.5, d + 0.5, h, roof, { noTop: false });
    this.skylights(b, x, z, w * 0.86, d * 0.8, h + 0.5, sky[0], sky[1], roof);
    this.addPick(facility, b, x - w / 2, z - d / 2, x + w / 2, z + d / 2, h + 1);
  }

  /** White ribbed low warehouse with roll-up doors and roof vents. */
  whiteWarehouse(b, { x, z, w, d, h = 7.5, doors = 3, vents = 3, face = 'S' }) {
    this.slab('ribWhite', b, x, z, w, h, d, 0, this.batch, { uv: [3.2, h], noTop: false });
    const [wx, wz] = this.W(b, x, z);
    roofTop(this.batch, null, wx, wz, w, d, Y + h, { parapetH: 0.5 });
    for (let k = 0; k < doors; k++) {
      const t = (k + 0.5) / doors;
      if (face === 'S') this.prop('door_rollup', b, x - w / 2 + w * t, z + d / 2 + 0.12, 0, { sy: Math.min(1, (h - 1.6) / 4.2) });
      else this.prop('door_rollup', b, x + w / 2 + 0.12, z - d / 2 + d * t, Math.PI / 2, { sy: Math.min(1, (h - 1.6) / 4.2) });
    }
    for (let k = 0; k < vents; k++) this.prop('roof_vent', b, x - w / 2 + w * ((k + 0.5) / vents), z, 0, { y: h + 0.05 });
  }

  /** Orange production tower: window grid + protruding floor slabs (+ optional white pilasters). */
  tower(b, { x, z, w, d, floors, pilasters = false, penthouse = false, canopy = [0, 1] }) {
    const h = floors * FLOOR_H;
    this.slab('facadeOrange', b, x, z, w, h, d, 0, this.batch, { uv: [BAY_W, FLOOR_H] });
    if (!pilasters) {
      for (let f = 1; f < floors; f++) this.slab('orangeWall', b, x, z, w + 0.5, 0.28, d + 0.5, f * FLOOR_H - 0.14, this.batch, { noTop: false });
    } else {
      const n = Math.round(w / 3.4);
      for (let k = 0; k <= n; k++) {
        const px = x - w / 2 + (w * k) / n;
        this.slab('white', b, px, z + d / 2 + 0.2, 0.55, h, 0.7, 0, this.batch, { noTop: false });
        this.slab('white', b, px, z - d / 2 - 0.2, 0.55, h, 0.7, 0, this.batch, { noTop: false });
      }
      const m = Math.round(d / 3.4);
      for (let k = 0; k <= m; k++) {
        const pz = z - d / 2 + (d * k) / m;
        this.slab('white', b, x + w / 2 + 0.2, pz, 0.7, h, 0.55, 0, this.batch, { noTop: false });
        this.slab('white', b, x - w / 2 - 0.2, pz, 0.7, h, 0.55, 0, this.batch, { noTop: false });
      }
    }
    const [wx, wz] = this.W(b, x, z);
    roofTop(this.batch, this.scatter, wx, wz, w, d, Y + h, { units: !penthouse, roofMat: 'roof' });
    if (penthouse) {
      this.slab('slots', b, x - w * 0.12, z - d * 0.05, w * 0.55, 4.2, d * 0.5, h, this.batch, { uv: [1.4, 4.2], noTop: false });
    }
    // orange entrance canopy at the base
    const [cx, cz] = canopy;
    this.slab('orangeWall', b, x + cx * (w / 2 + 1.5), z + cz * (d / 2 + 1.5), cx ? 3 : 9, 0.6, cx ? 9 : 3, 3.4, this.batch, { noTop: false });
    this.slab('orangeWall', b, x + cx * (w / 2 + 0.5), z + cz * (d / 2 + 0.5), cx ? 1 : 8, 3.4, cx ? 8 : 1, 0, this.batch, { noTop: false });
    return h;
  }

  // --- blocks ------------------------------------------------------------------------------
  build() {
    this.nrow();
    this.sort();
    this.wh01();
    this.plant();
    this.cold();
    this.freight();
    return this;
  }

  lotEdges(b, gate = []) {
    const { BX, BZ, SIDEWALK } = GRID;
    const e = SIDEWALK + 0.4;
    this.fence(b, e, BZ - e, BX - e, BZ - e, gate.filter((g) => g.side === 'S').map((g) => g.span));
    this.fence(b, e, e, e, BZ - e, gate.filter((g) => g.side === 'W').map((g) => g.span));
    this.fence(b, BX - e, e, BX - e, BZ - e, gate.filter((g) => g.side === 'E').map((g) => g.span));
  }

  nrow() {
    const b = 'nrow';
    // Automated storage: tall walls on three sides, open top, low front wall with the ASRS sign
    const ax = 38, az = 31, aw = 38, ad = 30, ah = 10;
    this.slab('ribWhite', b, ax, az - ad / 2 + 0.25, aw, ah, 0.5, 0, this.batch, { uv: [3.2, ah], noTop: false });
    this.slab('ribWhite', b, ax - aw / 2 + 0.25, az, 0.5, ah, ad, 0, this.batch, { uv: [3.2, ah], noTop: false });
    this.slab('ribWhite', b, ax + aw / 2 - 0.25, az, 0.5, ah, ad, 0, this.batch, { uv: [3.2, ah], noTop: false });
    this.slab('ribWhite', b, ax - 12.5, az + ad / 2 - 0.25, 13, 1.3, 0.4, 0, this.batch, { uv: [1.6, 1.3], noTop: false });
    this.slab('ribWhite', b, ax + 12.5, az + ad / 2 - 0.25, 13, 1.3, 0.4, 0, this.batch, { uv: [1.6, 1.3], noTop: false });
    this.flat('floor', b, ax, az, aw - 1, ad - 1, 0.03);
    this.prop('rack', b, ax - 13, az - 6, Math.PI / 2);
    this.prop('rack', b, ax - 13, az + 5, Math.PI / 2);
    this.prop('rack', b, ax + 13, az - 6, Math.PI / 2);
    this.prop('rack', b, ax + 13, az + 5, Math.PI / 2);
    this.prop('stacker_crane', b, ax + 7, az - 1, 0);
    this.prop('stacker_crane', b, ax - 7, az - 7, Math.PI);
    this.prop('sign_asrs', b, ax, az + ad / 2 - 1.2, 0);
    for (const [k, dx] of [[1, -9], [2, 9]]) {
      this.flat('pad', b, ax + dx, az + ad / 2 + 9, 7, 6, 0.03);
      this.floorText(b, 'ASRS-' + k, ax + dx, az + ad / 2 + 9, 4);
    }
    this.addPick('storage', b, ax - aw / 2, az - ad / 2, ax + aw / 2, az + ad / 2, ah);
    this.yards.autoForklift = this.W(b, ax - 4, az + ad / 2 + 6);

    // Receiving & inspection (QC) - interior is visible when the roof is hidden
    const rx = 81, rz = 32, rw = 38, rd = 32;
    this.shed(b, 'receiving', {
      x: rx, z: rz, w: rw, d: rd, label: 'QC', cutaway: true, interior: () => {
        this.prop('conveyor', b, rx - 9, rz - 3, 0);
        this.prop('conveyor', b, rx - 9, rz - 9, 0);
        this.prop('conveyor', b, rx + 9, rz + 3, 0);
        this.prop('conveyor', b, rx + 9, rz + 9, 0);
        this.prop('scanner_arch', b, rx - 9, rz - 10, 0, { sx: 1.2, sy: 1.4 });
        this.prop('scanner_arch', b, rx + 9, rz + 1, 0, { sx: 1.2, sy: 1.4 });
        this.slab('parapet', b, rx, rz - 2, 0.6, 4.2, rd - 9, 0, this.batch, { noTop: false });
        for (const lx of [rx - 4.5, rx + 4.5]) this.flat('tape', b, lx, rz + 2, 0.12, rd - 6, 0.05);
        { const [sx, sz] = this.W(b, rx, rz + rd / 2 - 0.6); this.cutProps.get('receiving').add('sign_qc', sx, sz, 0, { y: Y }); }
        this.prop('box', b, rx + 9, rz + 4, 0, { y: 0.9 });
        this.prop('box', b, rx - 9, rz - 5, 0, { y: 0.9 });
        this.prop('box', b, rx - 9, rz - 10, 0, { y: 0.9 });
        this.prop('forklift_loaded', b, rx - 3, rz + 10, Math.PI);
      },
    });
    this.shed(b, 'returnable', { x: 124, z: 32, w: 38, d: 30, label: 'RETURN' });

    // yard in front of the sheds: pallets at the doors, forklifts, AMRs, two truck queues
    this.pallets(b, 66, 56, 4, 2, 2.2, 2.0, ['pallet_boxes', 'pallet_boxes_mixed'], 3);
    this.pallets(b, 110, 56, 4, 2, 2.2, 2.0, ['pallet_boxes', 'pallet_boxes_mixed', 'pallet_stack'], 4);
    this.pallets(b, 52, 74, 6, 1, 1.5, 1.6, ['pallet_stack'], 5);
    this.flat('pad', b, 95, 66, 6, 5, 0.03);
    this.flat('pad', b, 138, 64, 6, 5, 0.03);
    for (const [x, kind] of [[62, 'truck_flatbed'], [77, 'truck_box'], [92, 'truck_box'], [107, 'truck_box'], [122, 'truck_box'], [137, 'truck_box']]) this.prop(kind, b, x, 92, -Math.PI / 2);
    for (const [x, kind] of [[84, 'truck_flatbed'], [99, 'truck_box'], [114, 'truck_box'], [129, 'truck_box']]) this.prop(kind, b, x, 106, -Math.PI / 2);
    this.prop('forklift_loaded', b, 76, 66, 0.4);
    this.prop('forklift', b, 101, 70, -1.2);
    this.prop('forklift', b, 120, 66, 2.6);
    this.prop('amr_cart', b, 140, 60, 1.2);
    this.prop('amr', b, 100, 58, 0.3);
    this.prop('guard_booth', b, 92, 122, 0);
    this.prop('barrier', b, 95, 126, 0);
    this.lotEdges(b, [{ side: 'S', span: [88, 106] }]);
    this.trees(b, [[148, 60], [148, 78], [148, 96], [148, 114]]);
    this.lamps(b, [[8, 124], [60, 124], [146, 124], [146, 8]]);
  }

  sort() {
    const b = 'sort';
    this.shed(b, 'sortpack', { x: 42, z: 32, w: 38, d: 32, label: 'SORT' });
    this.shed(b, 'dispatch', { x: 87, z: 32, w: 40, d: 32, label: 'DOCK' });
    this.shed(b, 'robot', { x: 130, z: 33, w: 38, d: 30, label: 'ROBOT' });
    // flatbeds at the Smart dispatch door being loaded
    this.prop('truck_flatbed', b, 87, 55, 0);
    this.prop('truck_flatbed', b, 97, 62, -2.0);
    this.prop('pallet_boxes', b, 87, 53.8, 0, { y: 1.3 });
    this.prop('pallet_boxes', b, 87, 51.4, 0, { y: 1.3 });
    this.pallets(b, 27, 55, 3, 2, 2.2, 2.2, ['pallet_boxes', 'pallet_boxes_mixed'], 11);
    this.pallets(b, 114, 56, 3, 2, 2.2, 2.2, ['pallet_boxes', 'pallet_boxes_mixed'], 12);
    this.flat('pad', b, 50, 58, 6, 5, 0.03);
    this.flat('pad', b, 68, 63, 6, 5, 0.03);
    this.flat('pad', b, 140, 60, 6, 5, 0.03);
    this.prop('amr', b, 34, 62, 0.4);
    this.prop('amr_cart', b, 58, 60, 1.0);
    this.prop('amr', b, 124, 66, 2.2);
    this.prop('forklift_loaded', b, 76, 72, 1.4);
    this.prop('forklift', b, 104, 58, -0.6);
    for (const x of [36, 52, 68, 84, 100, 116, 132]) this.prop('truck_box', b, x, 88, Math.PI / 2);
    for (const x of [48, 64, 80, 96, 120]) this.prop('truck_box', b, x, 106, Math.PI / 2);
    this.pallets(b, 32, 78, 5, 1, 1.4, 1.6, ['pallet_stack'], 13);
    this.pallets(b, 62, 78, 5, 1, 1.4, 1.6, ['pallet_stack'], 14);
    this.prop('guard_booth', b, 144, 120, 0);
    this.prop('barrier', b, 136, 126, Math.PI);
    this.lotEdges(b, [{ side: 'S', span: [130, 152] }, { side: 'W', span: [70, 90] }]);
    this.trees(b, [[8, 50], [8, 70], [8, 108]]);
    this.lamps(b, [[8, 124], [80, 124], [146, 8], [146, 124]]);
  }

  wh01() {
    const b = 'wh01';
    // office north of the warehouse
    const [ox, oz] = this.W(b, 56, 24);
    office(this.batch, this.scatter, ox, oz, 48, 24, 8, { rng: rng(77), entrance: [0, 1] });
    // WH-01: long orange warehouse with six docks on the south face
    const docks = [30, 42, 54, 66, 78, 90];
    this.dockWarehouse(b, 'warehouse', { x: 60.5, z: 64, w: 77, d: 32, h: 11, docks, sky: [2, 8] });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) this.prop('rack', b, 32 + c * 11, 54 + r * 6.4, 0, { sy: 0.85 });
    this.prop('forklift_loaded', b, 48, 76.5, Math.PI / 2);
    this.prop('forklift', b, 74, 76.5, -Math.PI / 2);
    // white warehouse to the east, small white warehouse to the south-west
    this.whiteWarehouse(b, { x: 126, z: 41, w: 40, d: 30, h: 7.5, doors: 3, vents: 3 });
    this.whiteWarehouse(b, { x: 31, z: 111, w: 34, d: 22, h: 6.5, doors: 3, vents: 3 });
    // trucks backed into the docks (TRK-2051 is the dynamic one at dock 2)
    for (const k of [1, 2, 4, 5]) this.prop('truck_box', b, docks[k], 87, 0);
    this.prop('truck_box', b, 120, 76, -0.35);
    this.pallets(b, 22, 90.5, 5, 3, 2.4, 2.2, ['pallet_boxes', 'pallet_boxes', 'pallet_boxes_mixed'], 21);
    this.pallets(b, 58, 90.5, 4, 2, 2.4, 2.2, ['pallet_boxes', 'pallet_boxes_mixed'], 23);
    this.pallets(b, 68, 105, 6, 2, 1.6, 1.6, ['pallet_stack', 'box'], 22);
    this.prop('forklift_loaded', b, 76, 111, 0.6);
    this.prop('forklift', b, 86, 111, -2.4);
    // staging: two orange-covered pallet stacks on grey skids
    for (const [x, z] of [[97, 112], [108, 116]]) {
      this.slab('concrete', b, x, z, 4.4, 1.0, 9, 0, this.batch, { noTop: false });
      for (let s = -1; s <= 1; s++) this.slab('orange', b, x, z + s * 2.95, 4.2, 2.0, 2.9, 1.0, this.batch, { noTop: false });
    }
    // gate with guard booth and barrier (south-east exit)
    this.prop('guard_booth', b, 128, 122, 0);
    this.prop('barrier', b, 131, 126, 0);
    this.floorText(b, 'WH-01', 116, 124, 6);
    this.lotEdges(b, [{ side: 'S', span: [126, 152] }, { side: 'W', span: [92, 106] }, { side: 'E', span: [94, 110] }]);
    this.trees(b, [[148, 66], [148, 82], [148, 118], [8, 40], [8, 60], [8, 80]]);
    this.lamps(b, [[100, 92], [70, 120], [8, 124], [146, 8]]);
    this.yards.staging = this.W(b, 102, 104);
    this.yards.flPark = this.W(b, 110, 96.5);
    this.yards.eastGate = this.W(b, 152, 99);
    this.yards.dock2 = this.W(b, 42, 86);
    this.yards.trk2051 = this.W(b, 58, 106);
  }

  plant() {
    const b = 'plant';
    this.flat('tan', b, 77.5, 66, 147.8, 124.8, 0.012);
    this.tower(b, { x: 27, z: 34, w: 20, d: 26, floors: 10, canopy: [0, 1] });
    this.tower(b, { x: 65.5, z: 20, w: 25, d: 22, floors: 8, pilasters: true, penthouse: true, canopy: [0, 1] });
    this.tower(b, { x: 94.5, z: 24, w: 23, d: 24, floors: 9, canopy: [0, 1] });
    this.prop('pipe_rack', b, 45, 26, 0, { y: 6, sx: 0.6 });
    this.prop('pipe_rack', b, 80.5, 28, 0, { y: 8, sx: 0.32 });
    // red production enclosure (open top) with machines inside
    const ex = 73, ez = 57.5, ew = 64, ed = 35, eh = 7.5;
    this.walls(b, ex, ez, ew, ed, eh, 'ribOrange', { door: { w: 6.5, h: 5.2, x: 75 }, uvPeriod: 3.0 });
    {
      const [dx, dz] = this.W(b, 75, ez + ed / 2 + 0.12);
      const door = new THREE.Mesh(box(6.3, 5.0, 0.18, { noTop: false }), this.M.door);
      door.position.set(dx, Y, dz);
      door.castShadow = true; door.receiveShadow = true;
      this.extraMeshes.push(door);
      this.dynamic.plantDoor = door;
    }
    this.flat('tanLight', b, ex, ez, ew - 1, ed - 1, 0.03);
    this.prop('machine', b, ex - 16, ez - 5, 0);
    this.prop('machine', b, ex + 16, ez + 5, 0);
    this.prop('conveyor', b, ex - 16, ez + 2, 0, { sz: 0.6 });
    this.prop('conveyor', b, ex + 16, ez - 2, 0, { sz: 0.6 });
    this.prop('pallet_boxes', b, ex - 2, ez - 9, 0);
    for (const [x, z] of [[ex - 6, ez + 3], [ex + 6, ez - 3], [ex - 13, ez + 8], [ex + 9, ez + 9]]) {
      this.flat('marking', b, x, z, 4.4, 0.18, 0.04); this.flat('marking', b, x, z + 4.2, 4.4, 0.18, 0.04);
      this.flat('marking', b, x - 2.1, z + 2.1, 0.18, 4.4, 0.04); this.flat('marking', b, x + 2.1, z + 2.1, 0.18, 4.4, 0.04);
    }
    this.addPick('production', b, ex - ew / 2, ez - ed / 2, ex + ew / 2, ez + ed / 2, eh + 2);
    this.addPick('production', b, 17, 8, 106, 47, 34);
    // supporting white warehouses
    this.whiteWarehouse(b, { x: 23, z: 63, w: 30, d: 26, h: 8, doors: 3, vents: 3 });
    this.whiteWarehouse(b, { x: 80, z: 108, w: 60, d: 18, h: 7, doors: 6, vents: 6 });
    // silos with pipes, orange covered stacks, pallets, parked trucks
    for (const x of [115, 124, 133]) this.prop('silo', b, x, 40, -0.6);
    for (const [x, z] of [[17, 104], [29, 108]]) {
      this.slab('concrete', b, x, z, 4.4, 1.0, 9, 0, this.batch, { noTop: false });
      for (let s = -1; s <= 1; s++) this.slab('orange', b, x, z + s * 2.95, 4.2, 1.9, 2.9, 1.0, this.batch, { noTop: false });
    }
    this.pallets(b, 42, 84, 4, 2, 1.6, 1.6, ['pallet_boxes', 'pallet_stack'], 31);
    this.pallets(b, 112, 122, 5, 1, 1.4, 1.6, ['pallet_stack'], 32);
    for (const [x, z, r] of [[118, 84, 1.25], [131, 88, 1.15], [114, 98, 1.3], [128, 103, 1.2], [140, 108, 1.0], [118, 114, 1.35], [100, 84, 1.3]]) this.prop('truck_box', b, x, z, r);
    this.prop('forklift', b, 30, 80, 0.8);
    this.prop('forklift', b, 108, 124, 1.6);
    this.lotEdges(b, [{ side: 'W', span: [80, 100] }, { side: 'S', span: [96, 110] }]);
    this.trees(b, [[8, 112], [8, 124], [96, 124], [148, 112], [148, 62], [40, 124]]);
    this.lamps(b, [[40, 82], [100, 80], [146, 124], [8, 8]]);
    this.yards.plantDoor = this.W(b, 75, 79);
    this.yards.plantInside = this.W(b, 75, 64);
    this.yards.plantWestGate = this.W(b, 4, 93);
    this.yards.plantApproach = this.W(b, 75, 88.5);
  }

  cold() {
    const b = 'cold';
    // large cold store: off-white ribbed walls, orange roof with condensers, three docks
    this.dockWarehouse(b, 'cold', { x: 74, z: 34, w: 90, d: 38, h: 9, docks: [40, 54, 68], wallMat: 'ribOff', sky: [2, 10], sideDoor: 26, removable: false });
    for (const x of [52, 74, 96]) this.prop('condenser', b, x, 34, 0, { y: 9.5 });
    for (const [x, z, t] of [[52, 76, 'BUFFER'], [70, 72, 'BUFFER'], [92, 64, 'RECEIVING']]) {
      this.pallets(b, x - 2.4, z - 3, 4, 2, 1.6, 1.4, ['pallet'], x + z);
      this.floorText(b, t, x, z + 2.4, 5);
    }
    for (let k = 0; k < 6; k++) this.flat('marking', b, 56 + k * 4, 61, 0.2, 5, 0.04);
    this.prop('dome_tank', b, 104, 70, 0.4);
    this.prop('truck_box', b, 126, 50, Math.PI * 0.85);
    this.prop('truck_box', b, 40, 60, 0);
    this.prop('forklift', b, 108, 56, 0.6);
    this.prop('forklift', b, 60, 64, -0.8);
    this.prop('forklift', b, 146, 20, 2.6);
    const r = rng(41);
    { const [x, z] = this.W(b, 124, 86); office(this.batch, this.scatter, x, z, 45, 42, 5, { rng: r, entrance: [0, 1] }); }
    { const [x, z] = this.W(b, 43, 92); office(this.batch, this.scatter, x, z, 33, 27, 6, { rng: r, entrance: [0, 1] }); }
    this.whiteWarehouse(b, { x: 82, z: 115, w: 34, d: 16, h: 6.5, doors: 3, vents: 3 });
    this.lotEdges(b, [{ side: 'E', span: [40, 58] }]);
    this.trees(b, [[148, 58], [8, 60], [8, 76], [102, 124]]);
    this.lamps(b, [[8, 124], [146, 124], [146, 8], [8, 40]]);
    this.yards.coldApron = this.W(b, 92, 62);
  }

  freight() {
    const b = 'freight';
    this.dockWarehouse(b, 'freight', { x: 50, z: 20, w: 72, d: 28, h: 11, docks: [], sky: [2, 6], removable: false });
    this.prop('door_rollup', b, 40, 34.1, 0, { sx: 1.3, sy: 1.2 });
    // gantry crane over stacked containers east of the terminal
    for (const x of [100, 114]) for (const z of [12, 19, 26]) {
      if (x === 114 && z === 12) continue;
      this.prop('container_white', b, x, z, 0);
      if ((x + z) % 3 !== 0) this.prop('container_white', b, x, z, 0, { y: 2.62 });
    }
    this.prop('gantry_crane', b, 107, 8, 0);
    // canopy shelter, pallets and the truck queue
    this.prop('canopy', b, 63, 50, 0);
    this.pallets(b, 28, 44, 4, 2, 1.5, 1.4, ['pallet_boxes'], 51);
    this.pallets(b, 44, 62, 4, 2, 1.5, 1.4, ['pallet_boxes'], 52);
    this.pallets(b, 80, 38, 8, 1, 1.4, 1.4, ['pallet_stack'], 53);
    for (const [x, z, r] of [[84, 50, -Math.PI / 2], [98, 52, -1.75], [111, 56, -1.85], [123, 62, -2.0], [131, 72, -2.6], [130, 85, 2.9], [124, 97, 2.6], [112, 106, 2.3], [97, 108, 1.8]]) this.prop('truck_box', b, x, z, r);
    this.prop('forklift', b, 92, 44, 0.5);
    this.prop('tank_horizontal', b, 84, 96, 0.5);
    this.floorText(b, 'HUB-03', 80, 122, 5);
    const r = rng(61);
    { const [x, z] = this.W(b, 19, 62); office(this.batch, this.scatter, x, z, 30, 33, 6, { rng: r, entrance: [1, 0] }); }
    { const [x, z] = this.W(b, 30, 105); office(this.batch, this.scatter, x, z, 42, 30, 5, { rng: r, entrance: [0, 1] }); }
    this.lotEdges(b, [{ side: 'S', span: [90, 108] }, { side: 'W', span: [78, 90] }]);
    this.trees(b, [[148, 46], [66, 92], [76, 90], [56, 92], [148, 118]]);
    this.lamps(b, [[48, 124], [100, 90], [146, 8], [8, 8]]);
    this.yards.transfer = this.W(b, 63, 56);
  }

  // --- output --------------------------------------------------------------------------------
  output() {
    const group = new THREE.Group();
    group.name = 'district';
    group.add(this.batch.build({ name: 'district' }));
    const roofGroups = new Map();
    for (const [k, rb] of this.roofs) {
      const g = rb.build({ name: `roof:${k}` });
      for (const m of this.roofExtras.get(k) || []) { m.receiveShadow = true; g.add(m); }
      roofGroups.set(k, g);
      group.add(g);
    }
    const cutGroups = new Map();
    for (const [k, cb] of this.cutaways) {
      const g = cb.build({ name: `cut:${k}` });
      const cp = this.cutProps.get(k);
      if (cp) g.add(cp.build(`cutprops:${k}`));
      g.visible = false;
      cutGroups.set(k, g);
      group.add(g);
    }
    for (const m of this.extraMeshes) { m.receiveShadow = true; group.add(m); }
    return { group, roofGroups, cutGroups };
  }
}

export function facilityWorldAnchor(id) {
  const f = FACILITIES[id];
  const [i, j] = DISTRICT[f.block];
  const [x, z] = local(i, j, f.anchor[0], f.anchor[1]);
  return new THREE.Vector3(x, f.anchor[2], z);
}

export function facilityLotRect(id) {
  const f = FACILITIES[id];
  if (!f.lot) return null;
  const [i, j] = DISTRICT[f.block];
  const [x0, z0] = local(i, j, f.lot[0], f.lot[1]);
  const [x1, z1] = local(i, j, f.lot[2], f.lot[3]);
  return [x0, z0, x1, z1];
}
