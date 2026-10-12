import * as THREE from 'three';
import { ribbon, plane } from './geometry.js';
import { SLAB_H } from './city.js';

/** Focus highlight (tan lot + orange outline) and the blue dispatch route. */
export class Overlays {
  constructor(scene, M) {
    this.scene = scene;
    this.M = M;
    this.group = new THREE.Group();
    this.group.name = 'overlays';
    scene.add(this.group);

    this.tanMat = new THREE.MeshLambertMaterial({ color: '#f1d6bf', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.outlineMat = new THREE.MeshBasicMaterial({ color: '#f2561d', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.routeMat = new THREE.MeshBasicMaterial({ color: '#2a31e3', transparent: true, opacity: 0.0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.routeGlow = new THREE.MeshBasicMaterial({ color: '#7f86ff', transparent: true, opacity: 0.0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });

    this.tan = null; this.outline = null; this.route = null; this.glow = null; this.ring = null;
    this.tanTarget = 0; this.routeTarget = 0;
  }

  focusLot(rect) {
    for (const m of [this.tan, this.outline]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    this.tan = this.outline = null;
    if (!rect) { this.tanTarget = 0; return; }
    const [x0, z0, x1, z1] = rect;
    const y = SLAB_H + 0.02;
    this.tan = new THREE.Mesh(plane(x1 - x0, z1 - z0), this.tanMat);
    this.tan.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    this.tan.receiveShadow = true;
    this.tan.renderOrder = 1;
    const i = 0.5;
    this.outline = new THREE.Mesh(ribbon([[x0 + i, z0 + i], [x1 - i, z0 + i], [x1 - i, z1 - i], [x0 + i, z1 - i]], 0.7, y + 0.03, true), this.outlineMat);
    this.outline.renderOrder = 3;
    this.group.add(this.tan, this.outline);
    this.tanTarget = 1;
  }

  setRoute(points) {
    for (const m of [this.route, this.glow, this.ring]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    this.route = this.glow = this.ring = null;
    if (!points || points.length < 2) { this.routeTarget = 0; return; }
    const y = SLAB_H + 0.12;
    this.glow = new THREE.Mesh(ribbon(points, 2.2, y - 0.02), this.routeGlow);
    this.route = new THREE.Mesh(ribbon(points, 1.05, y), this.routeMat);
    const end = points[points.length - 1];
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 40).rotateX(-Math.PI / 2), this.routeMat);
    this.ring.position.set(end[0], y + 0.01, end[1]);
    this.route.renderOrder = this.glow.renderOrder = this.ring.renderOrder = 4;
    this.group.add(this.glow, this.route, this.ring);
    this.routeTarget = 1;
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 6);
    this.tanMat.opacity += ((this.tanTarget ? 0.92 : 0) - this.tanMat.opacity) * k;
    this.outlineMat.opacity += ((this.tanTarget ? 0.95 : 0) - this.outlineMat.opacity) * k;
    this.routeMat.opacity += ((this.routeTarget ? 0.95 : 0) - this.routeMat.opacity) * k;
    this.routeGlow.opacity += ((this.routeTarget ? 0.28 : 0) - this.routeGlow.opacity) * k;
  }
}

/** HTML labels anchored to 3D points (facilities and vehicles). */
export class Labels {
  constructor(layer, camera, factory) {
    this.layer = layer;
    this.camera = camera;
    this.factory = factory;
    this.items = [];
    this.visible = true;
    this._v = new THREE.Vector3();
  }
  add({ id, text, icon, variant = 'facility', position, follow = null, onClick = null }) {
    const el = this.factory({ icon, text, variant });
    el.dataset.labelId = id;
    if (onClick) el.addEventListener('click', (e) => { e.stopPropagation(); onClick(id); });
    this.layer.appendChild(el);
    const item = { id, el, position: position ? position.clone() : new THREE.Vector3(), follow, active: false };
    this.items.push(item);
    return item;
  }
  get(id) { return this.items.find((i) => i.id === id); }
  setActive(id) {
    for (const it of this.items) {
      const on = it.id === id;
      if (on !== it.active) { it.active = on; it.el.classList.toggle('is-active', on); }
    }
  }
  setVisible(v) { this.visible = v; this.layer.style.opacity = v ? '1' : '0'; }
  update(width, height) {
    const cam = this.camera;
    for (const it of this.items) {
      if (it.follow) it.follow(it.position);
      const v = this._v.copy(it.position).project(cam);
      const behind = v.z > 1;
      const x = (v.x * 0.5 + 0.5) * width;
      const y = (-v.y * 0.5 + 0.5) * height;
      const off = behind || x < -150 || x > width + 150 || y < -60 || y > height + 60;
      if (off) { if (!it.hidden) { it.el.style.display = 'none'; it.hidden = true; } continue; }
      if (it.hidden) { it.el.style.display = ''; it.hidden = false; }
      it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      it.el.style.zIndex = String(1000 - Math.round(v.z * 1000));
    }
  }
}
