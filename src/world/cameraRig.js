import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

const DEG = Math.PI / 180;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Spherical camera state helpers: az 0 = camera south of target (looking north), 90 = east. */
export function cameraFromState(camera, target, { az, el, dist }) {
  const a = az * DEG, e = el * DEG;
  camera.position.set(
    target.x + dist * Math.sin(a) * Math.cos(e),
    target.y + dist * Math.sin(e),
    target.z + dist * Math.cos(a) * Math.cos(e),
  );
  camera.lookAt(target);
}

export function stateFromCamera(camera, target) {
  const d = new THREE.Vector3().subVectors(camera.position, target);
  const dist = d.length();
  const el = Math.asin(THREE.MathUtils.clamp(d.y / dist, -1, 1)) / DEG;
  const az = Math.atan2(d.x, d.z) / DEG;
  return { az, el, dist };
}

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.controls = new MapControls(camera, dom);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.085;
    c.screenSpacePanning = false;
    c.minDistance = 35;
    c.maxDistance = 1500;
    c.minPolarAngle = 8 * DEG;
    c.maxPolarAngle = 72 * DEG;
    c.zoomSpeed = 0.9;
    c.panSpeed = 1.0;
    c.rotateSpeed = 0.6;
    c.zoomToCursor = true;
    this.anim = null;
    this.autoRotate = false;
    dom.addEventListener('pointerdown', () => { if (this.anim) this.anim = null; });
  }

  get target() { return this.controls.target; }

  jump(p) {
    this.target.set(...p.target);
    if (p.fov && p.fov !== this.camera.fov) { this.camera.fov = p.fov; this.camera.updateProjectionMatrix(); }
    cameraFromState(this.camera, this.target, p);
    this.controls.update();
  }

  flyTo(p, duration = 1.7) {
    const from = { target: this.target.clone(), ...stateFromCamera(this.camera, this.target), fov: this.camera.fov };
    const to = { target: new THREE.Vector3(...p.target), az: p.az, el: p.el, dist: p.dist, fov: p.fov || from.fov };
    // shortest azimuth path
    let daz = ((to.az - from.az + 540) % 360) - 180;
    // pull back a little mid-flight for long hops (gives the "fly" feel of the reference)
    const hop = from.target.distanceTo(to.target);
    const lift = Math.min(0.35, hop / 900);
    this.anim = { t: 0, duration, from, to, daz, lift };
  }

  zoom(factor, duration = 0.6) {
    const s = stateFromCamera(this.camera, this.target);
    this.flyTo({ target: this.target.toArray(), az: s.az, el: s.el, dist: THREE.MathUtils.clamp(s.dist * factor, this.controls.minDistance, this.controls.maxDistance) }, duration);
  }

  update(dt) {
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.duration);
      const k = ease(a.t);
      const tgt = a.from.target.clone().lerp(a.to.target, k);
      const bump = Math.sin(Math.PI * k) * a.lift;
      const st = {
        az: a.from.az + a.daz * k,
        el: THREE.MathUtils.lerp(a.from.el, a.to.el, k),
        dist: THREE.MathUtils.lerp(a.from.dist, a.to.dist, k) * (1 + bump),
      };
      if (a.to.fov !== a.from.fov) { this.camera.fov = THREE.MathUtils.lerp(a.from.fov, a.to.fov, k); this.camera.updateProjectionMatrix(); }
      this.target.copy(tgt);
      cameraFromState(this.camera, this.target, st);
      if (a.t >= 1) this.anim = null;
      this.controls.update();
      return;
    }
    if (this.autoRotate) {
      const s = stateFromCamera(this.camera, this.target);
      s.az += dt * 4;
      cameraFromState(this.camera, this.target, s);
    }
    this.controls.update();
  }

  /** for debugging / matching reference frames: ?cam=az,el,dist,tx,tz */
  describe() {
    const s = stateFromCamera(this.camera, this.target);
    return `${s.az.toFixed(1)},${s.el.toFixed(1)},${s.dist.toFixed(0)},${this.target.x.toFixed(0)},${this.target.z.toFixed(0)}`;
  }
}
