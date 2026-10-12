import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Instanced prop library backed by public/models/assets.glb (built by blender/build_assets.py).
// Every asset is an Empty `asset_<name>` whose children are single-material meshes; each
// (asset, material) pair becomes one InstancedMesh, so thousands of props cost a few draw calls.

// Fallback stand-ins (w, h, d, material) used if the GLB is missing an asset.
const FALLBACK = {
  truck_box: [[2.5, 3.6, 7.0, 'white', 0, 0, -1.2], [2.5, 3.0, 2.3, 'orange', 0, 0, 3.6]],
  truck_flatbed: [[2.5, 1.3, 7.0, 'lightgray', 0, 0, -1.2], [2.5, 3.0, 2.3, 'orange', 0, 0, 3.6]],
  forklift: [[1.2, 1.3, 2.0, 'orange'], [1.1, 2.2, 0.3, 'black', 0, 0, 1.0]],
  forklift_loaded: [[1.2, 1.3, 2.0, 'orange'], [1.2, 1.2, 1.0, 'cardboard', 0, 0.2, 1.6]],
  pallet: [[1.2, 0.14, 1.0, 'wood']],
  pallet_boxes: [[1.2, 0.14, 1.0, 'wood'], [1.15, 0.95, 0.95, 'cardboard', 0, 0.14, 0]],
  pallet_boxes_mixed: [[1.2, 0.14, 1.0, 'wood'], [1.15, 0.5, 0.95, 'cardboard', 0, 0.14, 0], [1.15, 0.45, 0.95, 'white', 0, 0.64, 0]],
  pallet_stack: [[1.2, 0.7, 1.0, 'wood']],
  box: [[0.5, 0.5, 0.5, 'cardboard']],
  silo: [[6, 15, 6, 'gray']],
  gantry_crane: [[1, 14, 1, 'orange', -15, 0, 0], [1, 14, 1, 'orange', 15, 0, 0], [31, 1.4, 1.4, 'orange', 0, 13, 0]],
  container_white: [[12.2, 2.6, 2.44, 'white']],
  container_orange: [[12.2, 2.6, 2.44, 'orange']],
  tree: [[0.25, 2.2, 0.25, 'darkgray'], [2.6, 2.6, 2.6, 'lightgray', 0, 2.0, 0]],
  street_lamp: [[0.2, 7.5, 0.2, 'darkgray']],
  fence: [[4, 1.2, 0.08, 'offwhite']],
  barrier: [[0.4, 1.1, 0.4, 'white'], [5, 0.12, 0.12, 'red', 2.5, 0.95, 0]],
  guard_booth: [[2.6, 2.7, 2.2, 'white']],
  conveyor: [[1.2, 0.9, 6, 'gray']],
  rack: [[9, 7.5, 1.2, 'cardboard']],
  sign_asrs: [[7, 6.5, 0.3, 'red', 0, 2.6, 0]],
  sign_qc: [[6.2, 2.4, 0.3, 'red', 0, 4.2, 0]],
  rooftop_ac: [[2.4, 1.0, 1.6, 'lightgray']],
  roof_vent: [[1.8, 0.5, 1.2, 'gray']],
  skylight: [[3.0, 0.25, 2.0, 'white']],
  condenser: [[9, 1.1, 2.6, 'white']],
  dock_leveler: [[3.2, 1.1, 2.6, 'white']],
  door_rollup: [[3.6, 4.2, 0.15, 'gray']],
  canopy: [[26, 0.4, 15, 'white', 0, 6, 0]],
  amr: [[0.75, 0.45, 1.1, 'white']],
  amr_cart: [[0.8, 0.8, 1.2, 'white']],
  stacker_crane: [[0.6, 15, 0.6, 'gray']],
  machine: [[2.4, 2, 2, 'orange']],
  tank_horizontal: [[7, 2.6, 2.6, 'white']],
  dome_tank: [[6, 3, 2.2, 'white']],
  bollard: [[0.2, 0.9, 0.2, 'orange']],
  pipe_rack: [[12, 0.5, 1.5, 'gray', 0, 5, 0]],
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class PropLibrary {
  constructor(materials) {
    this.M = materials;
    this.assets = new Map(); // name -> [{ geometry, matKey }]
    this.bounds = new Map(); // name -> Box3
  }

  async load(url) {
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (!o.name || !o.name.startsWith('asset_') || o.name.includes('__')) return;
        if (o.parent && o.parent.name && o.parent.name.startsWith('asset_')) return;
        const name = o.name.slice(6);
        const parts = [];
        const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
        const box = new THREE.Box3();
        o.traverse((c) => {
          if (!c.isMesh) return;
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          const g = c.geometry.clone();
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
          for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
          const matName = (mats[0].name || '').replace(/\.\d+$/, '');
          const matKey = this.M[matName] ? matName : 'white';
          g.computeBoundingBox();
          box.union(g.boundingBox);
          parts.push({ geometry: g, matKey });
        });
        if (parts.length) { this.assets.set(name, parts); this.bounds.set(name, box); }
      });
      console.info(`[props] loaded ${this.assets.size} assets from ${url}`);
    } catch (e) {
      console.warn('[props] assets.glb not available, using stand-ins', e?.message);
    }
  }

  parts(name) {
    if (this.assets.has(name)) return this.assets.get(name);
    const fb = FALLBACK[name];
    if (!fb) throw new Error(`unknown prop ${name}`);
    const parts = fb.map(([w, h, d, mat, x = 0, y = 0, z = 0]) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y + h / 2, z);
      return { geometry: g, matKey: mat };
    });
    this.assets.set(name, parts);
    const box = new THREE.Box3();
    for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
    this.bounds.set(name, box);
    return parts;
  }

  size(name) {
    this.parts(name);
    return this.bounds.get(name).getSize(new THREE.Vector3());
  }
}

/** Accumulates static placements and builds InstancedMeshes. */
export class PropScatter {
  constructor(lib) {
    this.lib = lib;
    this.items = new Map(); // name -> Matrix4[]
  }
  add(name, x, z, rotY = 0, { y = 0, scale = 1, sx, sy, sz } = {}) {
    _q.setFromAxisAngle(_up, rotY);
    _p.set(x, y, z);
    _s.set(sx ?? scale, sy ?? scale, sz ?? scale);
    const m = new THREE.Matrix4().compose(_p, _q, _s);
    if (!this.items.has(name)) this.items.set(name, []);
    this.items.get(name).push(m);
    return m;
  }
  build(name = 'props') {
    const group = new THREE.Group();
    group.name = name;
    for (const [asset, mats] of this.items) {
      for (const part of this.lib.parts(asset)) {
        const mesh = new THREE.InstancedMesh(part.geometry, this.lib.M[part.matKey], mats.length);
        mats.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = `${asset}:${part.matKey}`;
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
    }
    return group;
  }
}

/** A pool of movable instances of one asset (vehicles). */
export class DynamicPool {
  constructor(lib, asset, capacity) {
    this.group = new THREE.Group();
    this.meshes = lib.parts(asset).map((part) => {
      const mesh = new THREE.InstancedMesh(part.geometry, lib.M[part.matKey], capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      return mesh;
    });
    this.capacity = capacity;
    this.count = 0;
  }
  alloc() {
    if (this.count >= this.capacity) throw new Error('pool full');
    const i = this.count++;
    for (const m of this.meshes) m.count = this.count;
    return i;
  }
  set(i, x, y, z, rotY) {
    _q.setFromAxisAngle(_up, rotY);
    _p.set(x, y, z);
    _s.set(1, 1, 1);
    _m.compose(_p, _q, _s);
    for (const m of this.meshes) m.setMatrixAt(i, _m);
  }
  hide(i) {
    _m.makeScale(0, 0, 0);
    for (const m of this.meshes) m.setMatrixAt(i, _m);
  }
  commit() {
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
