import * as THREE from 'three';

// All textures are generated at runtime on a canvas – no image assets needed.
// Textures are white-based so the material colour tints them (white walls, orange towers…).

let maxAniso = 8;
export function setMaxAnisotropy(v) { maxAniso = v; }

function canvasTex(w, h, draw, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

/** One facade bay (BAY_W x FLOOR_H metres) with a recessed window. */
export const BAY_W = 3.0;
export const FLOOR_H = 3.3;

export function windowTexture({ glass = [134, 150, 168], shade = [104, 116, 132], frame = null, winW = 0.46, winH = 0.47, sill = 0.27 } = {}) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    const ww = w * winW, wh = h * winH;
    const x = (w - ww) / 2;
    const y = h - h * sill - wh; // canvas y grows downward; v=0 is the bottom of the floor
    if (frame) { g.fillStyle = frame; g.fillRect(x - 4, y - 4, ww + 8, wh + 8); }
    g.fillStyle = `rgb(${glass})`;
    g.fillRect(x, y, ww, wh);
    // recess shadow from the lintel + one side jamb
    g.fillStyle = `rgb(${shade})`;
    g.fillRect(x, y, ww, wh * 0.2);
    g.fillRect(x, y, ww * 0.1, wh);
    // faint sky reflection gradient on the lower half (light-blue glass)
    const grd = g.createLinearGradient(0, y + wh * 0.2, 0, y + wh);
    grd.addColorStop(0, 'rgba(190,205,222,0.0)');
    grd.addColorStop(1, 'rgba(190,205,222,0.35)');
    g.fillStyle = grd;
    g.fillRect(x + ww * 0.1, y + wh * 0.2, ww * 0.9, wh * 0.8);
  });
}

/** Corrugated metal: vertical ribs, `period` metres per texture repeat (u). */
export function ribTexture({ ribs = 4, dark = 0.86, light = 1.0, ticks = null } = {}) {
  return canvasTex(128, 256, (g, w, h) => {
    const step = w / ribs;
    for (let i = 0; i < ribs; i++) {
      const x0 = i * step;
      const grd = g.createLinearGradient(x0, 0, x0 + step, 0);
      const d = Math.round(255 * dark), l = Math.round(255 * light);
      grd.addColorStop(0, `rgb(${d},${d},${d})`);
      grd.addColorStop(0.18, `rgb(${l},${l},${l})`);
      grd.addColorStop(0.75, `rgb(${l},${l},${l})`);
      grd.addColorStop(1, `rgb(${Math.round((d + l) / 2)},${Math.round((d + l) / 2)},${Math.round((d + l) / 2)})`);
      g.fillStyle = grd;
      g.fillRect(x0, 0, step, h);
      if (ticks) {
        g.fillStyle = ticks;
        g.fillRect(x0, 0, Math.max(2, step * 0.14), h * 0.07);
      }
    }
  });
}

/** Roll-up door slats + frame (one texture per door, not repeated). */
export function doorTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c9cbcd';
    g.fillRect(8, 8, w - 16, h - 8);
    for (let y = 12; y < h; y += 7) {
      g.fillStyle = '#b5b8bb';
      g.fillRect(8, y, w - 16, 2);
    }
  }, { repeat: false });
}

/** Penthouse / technical floor: dark vertical slots on orange. */
export function slotTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgb(120,120,120)';
    g.fillRect(w * 0.3, h * 0.18, w * 0.4, h * 0.64);
  });
}

/** Soft radial blob used for fake contact shadows / glow sprites. */
export function radialTexture(inner = 'rgba(0,0,0,0.5)', outer = 'rgba(0,0,0,0)') {
  return canvasTex(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, { repeat: false, srgb: false });
}

/** Text painted on a transparent canvas (floor markings like "BUFFER", "ASRS-1"). */
export function textTexture(text, { color = 'rgba(90,90,90,0.75)', font = '600 64px Inter, Arial, sans-serif', w = 512, h = 128 } = {}) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
  }, { repeat: false });
}
