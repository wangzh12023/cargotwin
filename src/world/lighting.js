import * as THREE from 'three';

// Soft, high-key daylight: a strong hemisphere fill (keeps shaded faces light grey) plus a sun
// from the north-west (behind the default views), so roofs are the brightest surfaces, the
// camera-facing walls sit in soft shade and shadows fall toward the viewer. The shadow frustum follows the orbit target and scales with distance so
// close-ups keep crisp shadows while the world view still shadows everything in frame.
export const LIGHT = {
  sky: 0.70,        // linear grey of the sky term
  ground: 0.58,     // linear grey of the ground bounce
  sun: 0.37,        // directional factor (multiplied by PI internally)
  sunDir: new THREE.Vector3(-0.55, 0.71, -0.44).normalize(),
  background: '#efeeec',
};

export function createLighting(scene, renderer) {
  const hemi = new THREE.HemisphereLight();
  hemi.color.setRGB(LIGHT.sky, LIGHT.sky, LIGHT.sky, THREE.LinearSRGBColorSpace);
  hemi.groundColor.setRGB(LIGHT.ground, LIGHT.ground * 0.985, LIGHT.ground * 0.96, THREE.LinearSRGBColorSpace);
  hemi.intensity = Math.PI;
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, LIGHT.sun * Math.PI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.6;
  sun.shadow.radius = 3;
  sun.shadow.blurSamples = 12;
  scene.add(sun);
  scene.add(sun.target);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  scene.background = new THREE.Color(LIGHT.background);
  scene.fog = new THREE.Fog(LIGHT.background, 900, 2600);

  const tmp = new THREE.Vector3();
  let lastKey = '';
  function update(camera, target) {
    const dist = camera.position.distanceTo(target);
    // half-size of the shadow box: generous at world zoom, tight at close-up
    const half = THREE.MathUtils.clamp(dist * 0.95, 60, 900);
    // snap the centre to texel-sized steps to avoid shimmering while panning
    const texel = (half * 2) / sun.shadow.mapSize.x;
    const cx = Math.round(target.x / texel) * texel;
    const cz = Math.round(target.z / texel) * texel;
    tmp.set(cx, 0, cz);
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(LIGHT.sunDir, 1200);
    const key = half.toFixed(0);
    if (key !== lastKey) {
      const cam = sun.shadow.camera;
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
      cam.near = 200; cam.far = 2400;
      cam.updateProjectionMatrix();
      sun.shadow.normalBias = THREE.MathUtils.clamp(half / 600, 0.08, 1.0);
      lastKey = key;
    }
    // fog: keep the scene crisp near the target, fade the far city into the background
    scene.fog.near = dist * 1.25 + 150;
    scene.fog.far = dist * 3.4 + 700;
  }

  return { hemi, sun, update };
}
