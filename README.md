<div align="center">

<img src="public/favicon.svg" width="76" alt="CargoTwin logo" />

# CargoTwin

**A real-time 3D logistics digital twin that runs in your browser.**

A white low-poly city, orange warehouses, and forklifts and trucks you can dispatch.<br/>
Built with Three.js. Vehicles and props are modelled by Blender Python scripts and the city is generated procedurally, so there are no downloaded assets.

[![Live Demo](https://img.shields.io/badge/%E2%96%B6%20Live%20Demo-open-f2561d?style=for-the-badge)](https://wangzh12023.github.io/cargotwin/)
[![Deploy](https://img.shields.io/github/actions/workflow/status/wangzh12023/cargotwin/deploy.yml?branch=main&label=GitHub%20Pages&style=for-the-badge&logo=github)](https://github.com/wangzh12023/cargotwin/actions/workflows/deploy.yml)

[![Three.js](https://img.shields.io/badge/Three.js-r186-000000?logo=threedotjs&logoColor=white)](https://threejs.org)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Blender](https://img.shields.io/badge/Blender-Python%20pipeline-F5792A?logo=blender&logoColor=white)](https://www.blender.org)
[![Vanilla JS](https://img.shields.io/badge/Vanilla%20JS-no%20framework-F7DF1E?logo=javascript&logoColor=black)](#)
[![WebGL2](https://img.shields.io/badge/WebGL-2.0-990000?logo=webgl&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4.svg)](#-contributing)
[![Stars](https://img.shields.io/github/stars/wangzh12023/cargotwin?style=social)](https://github.com/wangzh12023/cargotwin/stargazers)

**English** · [简体中文](README.zh-CN.md)

<a href="https://wangzh12023.github.io/cargotwin/"><img src="docs/media/demo.webp" alt="CargoTwin demo: fly-in, dispatching a forklift to production, the QC cutaway" width="100%" /></a>

<sub>Real capture from the running app (4× sim speed). <a href="docs/media/demo.mp4">HD MP4</a></sub>

</div>

---

## ✨ Features

| | |
|---|---|
| 🏙️ **A full 3D city** | A 10 × 11 block street grid with lane markings, crosswalks, and procedurally generated office blocks. An industrial district of six themed blocks sits in the middle. |
| 🏭 **Six facilities** | WH-01 warehouse, a production plant with three orange towers and silos, a COLD-02 cold-chain store, a freight terminal with a gantry crane, plus storage (ASRS) and QC sheds. |
| 🚜 **Live simulation** | Select pallets, pick a destination, then click **Dispatch forklift**. FL-01 picks up the load, drives the route, and the plant door rolls up for it. You can also load TRK-2051 and send it across town. |
| 🎥 **Cinematic camera** | Eased fly-to transitions between layers (World / Warehouse / Production / Freight / Cold chain), a follow-cam, and map-style pan, orbit and zoom. |
| 🧊 **Blender pipeline in code** | `blender/*.py` builds 38 low-poly assets (trucks, forklifts, silos, cranes, racks…) and renders the UI thumbnails with Cycles, fully headless. |
| ⚡ **Fast** | Assets are drawn with GPU instancing (about 1.1 M triangles per frame), and the shadow frustum follows the camera. 60 fps on a laptop GPU, and quality drops automatically on slower machines. |
| 🪟 **Dashboard UI** | A frosted-glass control room in vanilla JS: cargo orders, a fleet panel, a layer bar, search, info panels and 3D-anchored labels. |
| 📦 **Tiny & static** | About 193 KB of gzipped JS plus a 684 KB GLB, no backend. It deploys anywhere: GitHub Pages, Vercel, Netlify or a USB stick. |

## 🚀 Quick start

```bash
git clone https://github.com/wangzh12023/cargotwin.git
cd cargotwin
npm install
npm run dev        # → http://localhost:5173
```

Requires [Node.js](https://nodejs.org) **20.19+ or 22.12+** (any current LTS works). That's it. The 3D assets are prebuilt in `public/`, so **you don't need Blender** unless you want to change the models.

## 🌐 Deploy your own copy (1 minute, no terminal)

### Option A: GitHub Pages (free)

1. Click **[Fork](https://github.com/wangzh12023/cargotwin/fork)** (top right).
2. In your fork, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open the **Actions** tab, enable workflows if GitHub asks, select **Deploy to GitHub Pages**, and click **Run workflow**.

Your site will be live at `https://<your-name>.github.io/cargotwin/` 🎉. Every push to `main` redeploys automatically.

### Option B: One click on Vercel or Netlify

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwangzh12023%2Fcargotwin)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/wangzh12023/cargotwin)

### Option C: Any static host

```bash
npm run build      # outputs dist/, upload it anywhere (relative paths, works from any sub-folder)
```

## 🎮 Controls

| Action | Mouse | Touch |
|---|---|---|
| Pan | Left-drag | One finger |
| Orbit / tilt | Right-drag (or toggle the lasso tool) | Two fingers |
| Zoom | Wheel, or the **+ / −** buttons | Pinch |
| Select a facility | Click a building or its label | Tap |
| Back to overview | 🏠 button, or **World** in the layer bar | |

The search box finds sites and vehicles: try `FL-01`, `cold` or `Receiving`. The 👁 button hides the labels, and the top-right controls pause the simulation or change its speed (1× / 2× / 4×).

<details>
<summary><b>🔗 URL parameters</b> (deep links, kiosk screens, screenshots)</summary>

| Parameter | Example | Effect |
|---|---|---|
| `preset` | `?preset=production` | Start at a camera preset: `world`, `warehouse`, `production`, `freight`, `cold`, `qc` |
| `panel` | `?panel=forklift` | Open an info panel: `wh`, `plant`, `transfer`, `cold`, `qc`, `forklift` |
| `demo` | `?demo` | Dispatch FL-01 to production right away |
| `bare` | `?bare` | 3D city only, no dashboard (great for a wallpaper or kiosk) |
| `nointro` | `?nointro` | Skip the opening fly-in |
| `hq` | `?hq` | Disable adaptive quality |
| `cam` | `?cam=37,39,540,-3,74` | Exact camera: `azimuth,elevation,distance,targetX,targetZ` |

</details>

## 🖼️ Gallery

| World | Warehouse WH-01 |
|---|---|
| ![World view](docs/media/world.jpg) | ![Warehouse](docs/media/warehouse.jpg) |
| **Production plant** | **Receiving & inspection (roof hidden)** |
| ![Production](docs/media/production.jpg) | ![QC cutaway](docs/media/qc-cutaway.jpg) |
| **Freight terminal** | **Cold chain COLD-02** |
| ![Freight](docs/media/freight.jpg) | ![Cold chain](docs/media/cold-chain.jpg) |

<details>
<summary><b>🧊 All 38 Blender-generated assets</b></summary>

![Blender asset sheet](docs/media/blender-assets.jpg)

</details>

## 🧱 How it's made

```mermaid
flowchart LR
  subgraph Blender["Blender (headless, Python)"]
    A[lib_geo.py<br/>bmesh helpers] --> B[build_assets.py<br/>38 low-poly assets]
    A --> C[render_thumbs.py<br/>Cycles renders]
  end
  B -->|assets.glb| D[props.js<br/>GLB → InstancedMesh]
  C -->|PNG| U[ui/<br/>dashboard]
  subgraph Browser["Three.js (browser)"]
    E[layout.js + city.js<br/>procedural streets + offices] --> S[Scene]
    F[facilities.js<br/>6 industrial blocks] --> S
    D --> S
    V[vehicles.js<br/>traffic · shuttles · heroes] --> S
    L[lighting.js<br/>hemisphere + camera-tracking sun] --> S
  end
  SIM[sim/simulation.js<br/>rules-based logistics] <--> APP[sim/app.js] <--> U
  APP <--> S
```

- **No textures to download.** Window grids, corrugated metal, roll-up doors and signage are drawn at runtime on `<canvas>`.
- **Clay look.** Everything uses matte Lambert materials with a strong hemisphere fill and a sun from behind the viewer, which gives bright roofs, soft walls and long readable shadows.
- **One GLB, a few hundred draw calls.** Every `(asset, material)` pair becomes a single `InstancedMesh`, whether it's 9 trucks or 900 fence segments.

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 🛠️ Rebuild the 3D models (optional)

Install [Blender](https://www.blender.org/download/) (tested with 5.2), then run:

```bash
npm run assets     # finds Blender automatically, or set BLENDER_PATH=/path/to/blender
```

This regenerates `public/models/assets.glb` and `public/img/*.png`. Tweak sizes, colours or shapes in `blender/build_assets.py` and run it again.

## 📁 Project structure

```
blender/        Blender Python: models (build_assets.py) + thumbnails (render_thumbs.py)
public/         prebuilt assets.glb, thumbnails, favicon
src/world/      Three.js scene: layout, city, facilities, props, vehicles, lighting, camera
src/sim/        logistics simulation + glue between UI, world and sim
src/ui/         vanilla-JS dashboard (top bar, sidebar, panels, labels)
scripts/        build-assets.mjs (runs Blender headlessly)
```

## 🤝 Contributing

Issues and PRs are welcome. Ideas: new facilities, day/night lighting, more vehicle types, real data feeds over WebSocket, or better touch gestures. Run `npm run build` before opening a PR.

## 📄 License

[MIT](LICENSE). Use it, fork it, ship it.

## 🙏 Acknowledgements

[Three.js](https://threejs.org) · [Blender](https://www.blender.org) · [Vite](https://vite.dev) · [Lucide](https://lucide.dev) icons · [Inter](https://rsms.me/inter/) typeface.
The visual direction was inspired by a logistics digital-twin concept seen in a short video. All code, models and textures in this repository are original.

## ⭐ Star History

<a href="https://star-history.com/#wangzh12023/cargotwin&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=wangzh12023/cargotwin&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=wangzh12023/cargotwin&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=wangzh12023/cargotwin&type=Date" />
  </picture>
</a>

<div align="center"><sub>If you like it, a ⭐ helps others find it!</sub></div>
