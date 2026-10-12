import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { setMaxAnisotropy } from './textures.js';
import { createLighting } from './lighting.js';
import { Batcher } from './geometry.js';
import { GRID, DISTRICT, FACILITIES, PRESETS, isDistrict, local } from './layout.js';
import { buildStreets, officeBlock, SLAB_H } from './city.js';
import { District, facilityWorldAnchor, facilityLotRect } from './facilities.js';
import { PropLibrary, PropScatter } from './props.js';
import { CameraRig } from './cameraRig.js';
import { Overlays, Labels } from './overlays.js';
import { Traffic, Mover, Path, Hero, createPools } from './vehicles.js';

const W = (b, x, z) => local(...DISTRICT[b], x, z);

export async function createWorld({ mapEl, labelsEl, createLabel, onSelectFacility = () => {}, onSelectVehicle = () => {}, onProgress = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.classList.add('world-canvas');
  mapEl.prepend(renderer.domElement);
  setMaxAnisotropy(Math.min(16, renderer.capabilities.getMaxAnisotropy()));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 2, 9000);
  const lights = createLighting(scene, renderer);
  const M = createMaterials();

  onProgress(0.1);
  const lib = new PropLibrary(M);
  await lib.load(`${import.meta.env.BASE_URL}models/assets.glb`);
  onProgress(0.45);

  // --- static city ---------------------------------------------------------------------------
  const scatter = new PropScatter(lib);
  const streets = new Batcher(M);
  buildStreets(streets, M);
  scene.add(streets.build({ name: 'streets', castShadow: false }));

  // office blocks, batched per column strip so frustum culling still helps
  for (let i = GRID.COLS[0]; i <= GRID.COLS[1]; i++) {
    const b = new Batcher(M);
    for (let j = GRID.ROWS[0]; j <= GRID.ROWS[1]; j++) if (!isDistrict(i, j)) officeBlock(b, scatter, i, j);
    scene.add(b.build({ name: `offices:${i}` }));
  }
  onProgress(0.65);

  const district = new District(M, scatter).build();
  const { group: districtGroup, roofGroups, cutGroups } = district.output();
  scene.add(districtGroup);
  scene.add(scatter.build('props'));
  onProgress(0.8);

  // --- vehicles ------------------------------------------------------------------------------
  const vehicles = new THREE.Group(); vehicles.name = 'vehicles';
  scene.add(vehicles);
  const pools = createPools(lib, vehicles);
  const traffic = new Traffic(pools, 30);
  const movers = [];
  const pp = (b, pts) => pts.map(([x, z]) => W(b, x, z));
  const shuttle = (pool, b, pts, speed = 2.6, pause = 1.6) => {
    const m = new Mover(pool, { path: new Path(pp(b, pts), 2.5), speed, pingpong: true, pause });
    m.s = Math.random() * m.path.total;
    movers.push(m);
    return m;
  };
  shuttle(pools.forkliftLoaded, 'nrow', [[78, 52], [84, 60], [92, 64]]);
  shuttle(pools.forklift, 'nrow', [[126, 52], [121, 60], [114, 70]]);
  const autoFL = shuttle(pools.forkliftLoaded, 'nrow', [[33, 58], [36, 52], [38, 45]], 1.8, 3);
  shuttle(pools.forklift, 'sort', [[84, 51], [79, 60], [73, 68]]);
  shuttle(pools.forkliftLoaded, 'sort', [[40, 51], [44, 60], [52, 66]]);
  const amrLoop = (b, pts, speed = 1.6) => { const m = new Mover(pools.amr, { path: new Path(pp(b, pts), 1.5), speed, loop: true }); m.s = Math.random() * m.path.total; movers.push(m); };
  amrLoop('sort', [[30, 66], [56, 66], [56, 72], [30, 72], [30, 66]]);
  amrLoop('nrow', [[98, 62], [112, 62], [112, 68], [98, 68], [98, 62]]);
  amrLoop('sort', [[122, 54], [144, 54], [144, 60], [122, 60], [122, 54]]);
  shuttle(pools.forklift, 'wh01', [[22, 98], [29, 98.5], [36, 98]]);
  const fl02 = shuttle(pools.forklift, 'wh01', [[66, 83], [66, 89], [63, 94]], 2.2, 2);
  shuttle(pools.forkliftLoaded, 'plant', [[30, 84], [36, 88], [42, 90]]);
  shuttle(pools.forklift, 'cold', [[110, 52], [104, 57], [97, 66]]);
  shuttle(pools.forkliftLoaded, 'cold', [[56, 58], [52, 66], [48, 74]]);
  shuttle(pools.forklift, 'freight', [[92, 42], [86, 46], [80, 48]]);

  // hero vehicles driven by the simulation
  const [px, pz] = district.yards.flPark;
  const fl01 = new Hero({ empty: pools.forklift, loaded: pools.forkliftLoaded }, { x: px, z: pz, heading: -Math.PI / 2, speed: 5 });
  const [tx, tz] = district.yards.trk2051;
  const trk = new Hero({ truck: pools.truck }, { x: tx, z: tz, heading: 0, y: SLAB_H, speed: 9 });
  const heroes = [fl01, trk];

  // animated plant door (roll-up: shrinks toward its top edge)
  const door = district.dynamic.plantDoor;
  const doorH = 5.0, doorY = door ? door.position.y : 0;
  let doorOpen = 0, doorTarget = 0;

  // --- overlays & labels -----------------------------------------------------------------------
  const overlays = new Overlays(scene, M);
  const labels = new Labels(labelsEl, camera, createLabel);
  for (const [id, f] of Object.entries(FACILITIES)) {
    labels.add({ id, text: f.label, icon: f.icon, variant: 'facility', position: facilityWorldAnchor(id), onClick: (fid) => onSelectFacility(fid) });
  }
  const follow = (m, h = 3.4) => (v) => v.set(m.pos.x, m.pos.y + h, m.pos.z);
  labels.add({ id: 'FL-01', text: 'FL-01', icon: 'forklift', variant: 'vehicle', follow: follow(fl01, 3.6), onClick: () => onSelectVehicle('FL-01') });
  labels.add({ id: 'TRK-2051', text: 'TRK-2051', icon: 'truck', variant: 'facility', follow: follow(trk, 5.2), onClick: () => onSelectVehicle('TRK-2051') });
  labels.add({ id: 'AUTO-FL-03', text: 'AUTO-FL-03', icon: 'forklift', variant: 'vehicle', follow: follow(autoFL), onClick: () => onSelectVehicle('AUTO-FL-03') });

  // --- camera ----------------------------------------------------------------------------------
  const rig = new CameraRig(camera, renderer.domElement);
  // presets are framed for a ~1.37:1 map; pull back on narrower screens so the same width fits
  const fit = (p) => {
    const r = mapEl.getBoundingClientRect();
    const aspect = r.width / Math.max(1, r.height) || 1.37;
    return { ...p, dist: p.dist * Math.max(1, Math.pow(1.37 / aspect, 0.85)) };
  };
  const params = new URLSearchParams(location.search);
  const startPreset = fit(PRESETS[params.get('preset')] || PRESETS.world);
  rig.jump(startPreset);
  if (!params.get('preset') && !params.get('cam') && !params.has('nointro')) {
    const w = fit(PRESETS.world);
    rig.jump({ ...w, az: w.az - 38, el: 64, dist: w.dist * 1.75 });
    setTimeout(() => rig.flyTo(w, 3.4), 250);
  }
  if (params.get('cam')) {
    const [az, el, dist, txx, tzz, fov] = params.get('cam').split(',').map(Number);
    rig.jump({ target: [txx, 0, tzz], az, el, dist, fov: fov || 30 });
  }

  // --- picking -----------------------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    let best = null, bestD = Infinity;
    const hit = new THREE.Vector3();
    for (const p of district.pick) {
      if (ray.ray.intersectBox(p.box, hit)) {
        const d = hit.distanceTo(camera.position);
        if (d < bestD) { bestD = d; best = p.facility; }
      }
    }
    if (best) onSelectFacility(best);
  });

  // --- resize & loop -------------------------------------------------------------------------------
  let width = 1, height = 1;
  const resize = () => {
    const r = mapEl.getBoundingClientRect();
    width = Math.max(1, r.width); height = Math.max(1, r.height);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = width + 'px';
    renderer.domElement.style.height = height + 'px';
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(mapEl);
  resize();

  // adaptive quality: step down resolution, then shadow resolution, then shadows on slow GPUs
  const perf = { level: 0, acc: 0, frames: 0, warm: 2.5 };
  function adapt(raw) {
    if (params.has('hq')) return;
    perf.warm -= raw;
    if (perf.warm > 0) return;
    perf.acc += raw; perf.frames++;
    if (perf.acc < 2) return;
    const fps = perf.frames / perf.acc;
    perf.acc = 0; perf.frames = 0;
    if (fps > 45 || perf.level >= 3) return;
    perf.level++;
    if (perf.level === 1) { renderer.setPixelRatio(1); resize(); }
    if (perf.level === 2) { lights.sun.shadow.mapSize.set(2048, 2048); lights.sun.shadow.map?.dispose(); lights.sun.shadow.map = null; }
    if (perf.level === 3 && fps < 24) lights.sun.castShadow = false;
    console.info(`[quality] ${fps.toFixed(0)} fps -> level ${perf.level}`);
    perf.warm = 1.5;
  }

  const clock = new THREE.Timer();
  let paused = false, speed = 1, frameHooks = [], following = null, ambient = true;
  renderer.domElement.addEventListener('pointerdown', () => { following = null; });
  const tick = () => {
    clock.update(); const raw = Math.min(0.05, clock.getDelta());
    const dt = paused ? 0 : raw * speed;
    rig.update(raw);
    lights.update(camera, rig.target);
    if (ambient) { traffic.update(dt); for (const m of movers) m.update(dt); }
    for (const hv of heroes) hv.update(dt);
    if (door && doorOpen !== doorTarget) {
      doorOpen = THREE.MathUtils.clamp(doorOpen + Math.sign(doorTarget - doorOpen) * dt * 0.9, 0, 1);
      door.scale.y = 1 - 0.9 * doorOpen;
      door.position.y = doorY + doorH * 0.9 * doorOpen;
    }
    if (following) {
      const k = 1 - Math.exp(-raw * 4);
      const d = new THREE.Vector3(following.pos.x - rig.target.x, 0, following.pos.z - rig.target.z).multiplyScalar(k);
      rig.target.add(d); camera.position.add(d);
    }
    for (const p of Object.values(pools)) p.commit();
    overlays.update(raw);
    for (const h of frameHooks) h(dt, raw);
    renderer.render(scene, camera);
    labels.update(width, height);
    adapt(raw);
  };
  renderer.setAnimationLoop(tick);
  onProgress(1);

  const api = {
    renderer, scene, camera, rig, labels, overlays, district, roofGroups, M, lib,
    fl01, trk, fl02, pools,
    flyTo(id, duration) {
      const p = PRESETS[id];
      if (p) rig.flyTo(fit(p), duration);
    },
    flyToFacility(id, duration) {
      const a = facilityWorldAnchor(id);
      rig.flyTo(fit({ target: [a.x, 0, a.z + 10], az: 30, el: 40, dist: 190 }), duration);
    },
    isPaused: () => paused,
    focusFacility(id) {
      overlays.focusLot(id ? facilityLotRect(id) : null);
      labels.setActive(id);
    },
    setRoof(facility, visible) {
      const g = roofGroups.get(facility); if (g) g.visible = visible;
      const c = cutGroups.get(facility); if (c) c.visible = !visible;
    },
    roofVisible(facility) { const g = roofGroups.get(facility); return g ? g.visible : true; },
    setPaused(v) { paused = v; },
    setDoor(open) { doorTarget = open ? 1 : 0; },
    setAmbient(v) { ambient = v; },
    setRotateMode(on) {
      const c = rig.controls;
      c.mouseButtons.LEFT = on ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
      c.mouseButtons.RIGHT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    },
    autoFL,
    doorState: () => doorOpen,
    follow(v) { following = v; },
    get following() { return following; },
    setSpeed(v) { speed = v; },
    onFrame(fn) { frameHooks.push(fn); },
    W,
    describeCamera: () => rig.describe(),
  };
  window.__world = api;
  return api;
}
