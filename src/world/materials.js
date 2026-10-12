import * as THREE from 'three';
import { windowTexture, ribTexture, doorTexture, slotTexture } from './textures.js';

// Matte "clay" look: Lambert everywhere. Colours were calibrated against frames of the
// reference video (white city, red-orange industry, light-blue/grey glass).
export const COLORS = {
  ground: '#efeeeb',
  lot: '#ebeae6',
  road: '#bebebc',
  sidewalk: '#e0e0dd',
  marking: '#fbfbfa',
  tan: '#f1d6bf',
  tanLight: '#f4e2d1',
  facade: '#f6f6f4',
  roof: '#e9e9e6',
  parapet: '#f7f7f5',
  orange: '#f2561d',
  orangeWall: '#ea4f1a',
  orangeTower: '#ee5219',
  offwhite: '#efe9e6',
  interior: '#9a9c9e',
  darkGlass: '#717a84',
};

const PALETTE = {
  orange: '#f2561d',
  orange_dark: '#c9441a',
  white: '#f5f5f3',
  offwhite: '#e6e4e0',
  lightgray: '#d3d4d4',
  gray: '#a7a9ab',
  darkgray: '#55595e',
  black: '#1d1e21',
  glass: '#8f9daa',
  cardboard: '#c99b62',
  tape: '#a87d4b',
  wood: '#a98257',
  red: '#d9381e',
  metal: '#bcc1c6',
};

function lam(color, extra = {}) {
  const m = new THREE.MeshLambertMaterial({ color, ...extra });
  return m;
}

export function createMaterials() {
  const win = windowTexture();
  const winOrange = windowTexture({ glass: [150, 112, 104], shade: [118, 86, 80], winW: 0.36, winH: 0.4, sill: 0.3 });
  const ribW = ribTexture({ ribs: 4, dark: 0.84 });
  const ribTicks = ribTexture({ ribs: 4, dark: 0.82, ticks: '#e2521f' });
  const ribO = ribTexture({ ribs: 6, dark: 0.9 });
  const ribFine = ribTexture({ ribs: 8, dark: 0.9 });
  const door = doorTexture();
  const slots = slotTexture();

  const M = {
    ground: lam(COLORS.ground),
    lot: lam(COLORS.lot),
    road: lam(COLORS.road),
    sidewalk: lam(COLORS.sidewalk),
    marking: lam(COLORS.marking, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    tan: lam(COLORS.tan, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    tanLight: lam(COLORS.tanLight, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    pad: lam('#dcdcd9', { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    facade: lam(COLORS.facade, { map: win }),
    facadeOrange: lam(COLORS.orangeTower, { map: winOrange }),
    roof: lam(COLORS.roof),
    parapet: lam(COLORS.parapet),
    ribWhite: lam('#f6f6f4', { map: ribW }),
    ribTicks: lam('#f7f7f5', { map: ribTicks }),
    ribOrange: lam(COLORS.orangeWall, { map: ribO }),
    ribOff: lam(COLORS.offwhite, { map: ribFine }),
    orangeRoof: lam(COLORS.orange),
    orangeWall: lam(COLORS.orangeWall),
    door: lam('#f3f3f2', { map: door }),
    slots: lam(COLORS.orangeTower, { map: slots }),
    interior: lam(COLORS.interior),
    floor: lam('#e3e3e0'),
    darkGlass: lam(COLORS.darkGlass),
    concrete: lam('#d9d9d6'),
    blueLine: new THREE.MeshBasicMaterial({ color: '#2b35e6', transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    outline: new THREE.MeshBasicMaterial({ color: '#f2561d', transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    tanOverlay: new THREE.MeshLambertMaterial({ color: COLORS.tan, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  };
  for (const [k, c] of Object.entries(PALETTE)) M[k] = M[k] || lam(c);
  M.glass = lam(PALETTE.glass);
  M.marking.userData.noCast = true;
  M.tan.userData.noCast = true;
  M.tanLight.userData.noCast = true;
  M.pad.userData.noCast = true;
  M.road.userData.noCast = true;
  M.ground.userData.noCast = true;
  M.lot.userData.noCast = true;
  for (const [k, m] of Object.entries(M)) m.name = k;
  return M;
}
