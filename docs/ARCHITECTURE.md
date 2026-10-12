# Architecture

```
blender/              Blender Python (headless) – every prop & vehicle is modelled in code
  lib_geo.py          bmesh helpers (bevelled boxes, cylinders, ribs, text → mesh, palette)
  build_assets.py     -> public/models/assets.glb  (38 assets, ~19k triangles)
  render_thumbs.py    -> public/img/*.png          (Cycles product renders used by the UI cards)
  preview_assets.py   optional: contact sheets of all assets (blender/preview/)
scripts/
  build-assets.mjs    finds Blender (BLENDER_PATH, PATH, registry, default dirs) and runs the above
src/
  main.js             boot screen, mounts the UI + app (or the 3D view only with ?bare)
  config.js           brand name + palette
  world/              Three.js scene
    layout.js         street grid, district blocks, facility metadata, camera presets
    city.js           roads, markings, sidewalks, procedural office blocks
    facilities.js     the six industrial blocks (warehouses, plant, cold chain, freight, sheds…)
    props.js          GLB → InstancedMesh library, static scatter, dynamic pools
    vehicles.js       Path (rounded polylines), Mover (yard shuttles), Hero (scripted), Traffic
    materials.js      matte Lambert palette; textures.js draws window/rib/door textures on canvas
    lighting.js       hemisphere + sun, shadow frustum that follows the camera target
    cameraRig.js      MapControls + eased fly-to between presets
    overlays.js       focused-lot tint/outline, blue dispatch route, HTML labels
    index.js          createWorld(): renderer, scene assembly, picking, render loop, adaptive quality
  sim/
    simulation.js     rules-based logistics sim (FL-01 trips, TRK-2051 round trip, plant door, counters)
    app.js            glue: UI callbacks ⇄ world ⇄ simulation, URL parameters
  ui/                 vanilla DOM overlay (top bar, sidebar, layer bar, search, toolbar, panels, labels)
  styles/             ui.css (dashboard) + base.css (boot screen, ?bare mode)
public/
  models/assets.glb   prebuilt and committed, so the site runs without Blender
  img/                prebuilt thumbnails
```

## Coordinate conventions

* Units are **metres**. Three.js world: `+X = east`, `+Y = up`, `+Z = south` (north is `-Z`).
* Blender is Z-up; the glTF exporter converts to Y-up (`blender (x, y, z) -> three (x, z, -y)`).
* **Vehicles face Blender `-Y`**, which becomes **three.js `+Z`**. Origins are the footprint centre at
  ground level.
* The city is a regular grid of 155 m × 132 m blocks with 18 m roads (`GRID` in `layout.js`).
  Facility code uses **block-local** coordinates (x from the block's west edge, z from its north edge).

## assets.glb contract

* One top-level Empty per asset, named `asset_<name>`; its children are single-material meshes named
  `asset_<name>__<material>`. The web app turns every (asset, material) pair into an `InstancedMesh`,
  so thousands of props cost a few hundred draw calls.
* Materials are matched **by name** to the app's shared palette (`orange`, `orange_dark`, `white`,
  `offwhite`, `lightgray`, `gray`, `darkgray`, `black`, `glass`, `cardboard`, `tape`, `wood`, `red`,
  `metal`); colours stored in the GLB are placeholders.

## UI ⇄ app contract

```js
const callbacks = {};
const ui = createUI(appEl, callbacks);   // src/ui/index.js – builds the DOM, reads callbacks lazily
await createApp(ui, callbacks);          // src/sim/app.js – fills in callbacks, creates world + sim
```

`ui` exposes `mapEl`, `labelsEl`, `createLabel({icon,text,variant})`, `setActiveLayer(id)`,
`showPanel(spec)` / `hidePanel()`, `updateOrders()`, `updateFleet()`, `updateTasks()`,
`updateActivity()`, `setSim({paused,speed})`. Panel specs are plain data
(`{id, kind, category, title, status, rows, note, image, actions, wideAction}`), see `src/ui/data.js`.
