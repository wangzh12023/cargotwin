// City layout. World: +X east, +Z south, metres. The industrial district is a 2x3 group of blocks
// in the middle of a regular office grid (reconstructed from the reference views):
//
//              col 0 (W)                      col 1 (E)
//   row -1     N-row: Automated storage,      Sort & pack, Smart dispatch,
//              Receiving & inspection,        Robot service
//              Returnable packaging
//   row  0     WH-01 warehouse block          Production plant (PLANT)
//   row  1     Cold chain (COLD-02)           Freight terminal (TRANSFER)

export const GRID = {
  BX: 155,       // block size east-west
  BZ: 132,       // block size north-south
  ROAD: 18,      // carriageway width
  SIDEWALK: 3.6, // sidewalk ring inside each block
  OX: -162,      // west edge of block column 0
  OZ: -59,       // north edge of block row 0
  COLS: [-4, 5], // inclusive range of block columns
  ROWS: [-5, 5], // inclusive range of block rows
};

export function blockX0(i) { return GRID.OX + i * (GRID.BX + GRID.ROAD); }
export function blockZ0(j) { return GRID.OZ + j * (GRID.BZ + GRID.ROAD); }
/** world position of a point given in block-local coordinates (x from west edge, z from north edge) */
export function local(i, j, x, z) { return [blockX0(i) + x, blockZ0(j) + z]; }

export const DISTRICT = {
  nrow: [0, -1],
  sort: [1, -1],
  wh01: [0, 0],
  plant: [1, 0],
  cold: [0, 1],
  freight: [1, 1],
};

export function isDistrict(i, j) {
  return Object.values(DISTRICT).some(([a, b]) => a === i && b === j);
}

// Facility metadata used by labels, the layer bar, info panels and camera presets.
// `anchor` is block-local [x, z] + height; `lot` is the block-local rectangle highlighted on focus.
export const FACILITIES = {
  storage: { block: 'nrow', label: 'Automated storage', icon: 'warehouse', anchor: [38, 18, 14] },
  receiving: { block: 'nrow', label: 'Receiving & inspection', icon: 'warehouse', anchor: [81, 21, 13], panel: 'qc' },
  returnable: { block: 'nrow', label: 'Returnable packaging', icon: 'warehouse', anchor: [125, 23, 13] },
  sortpack: { block: 'sort', label: 'Sort & pack', icon: 'warehouse', anchor: [36, 21, 13] },
  dispatch: { block: 'sort', label: 'Smart dispatch', icon: 'warehouse', anchor: [81, 21, 13] },
  robot: { block: 'sort', label: 'Robot service', icon: 'warehouse', anchor: [126, 23, 13] },
  warehouse: { block: 'wh01', label: 'Warehouse', icon: 'warehouse', anchor: [63, 64, 14], panel: 'wh', lot: [3.6, 3.6, 151.4, 128.4] },
  production: { block: 'plant', label: 'Production', icon: 'factory', anchor: [75, 58, 10], panel: 'plant', lot: [3.6, 3.6, 151.4, 128.4] },
  freight: { block: 'freight', label: 'Freight terminal', icon: 'route', anchor: [60, 56, 8], panel: 'transfer', lot: [3.6, 3.6, 151.4, 128.4] },
  cold: { block: 'cold', label: 'Cold chain', icon: 'route', anchor: [73, 30, 12], panel: 'cold', lot: [3.6, 3.6, 151.4, 128.4] },
};

// Camera presets: target (world), azimuth (deg, 0 = camera south of target looking north,
// 90 = camera east of target looking west), elevation (deg above horizon), distance (m).
export const PRESETS = {
  world: { target: [-3.0, 0, 74.3], az: 36.9, el: 39.2, dist: 542, fov: 30 },
  warehouse: { facility: 'warehouse', target: [-94.4, 0, 22.5], az: 35.7, el: 33.7, dist: 219, fov: 30 },
  warehouseInside: { facility: 'warehouse', target: [-101, 0, 5], az: 30, el: 52, dist: 120, fov: 30 },
  production: { facility: 'production', target: [86, 0, 3], az: 34, el: 40, dist: 162, fov: 30 },
  plantInside: { facility: 'production', target: [84, 0, -2], az: 25, el: 55, dist: 85, fov: 30 },
  dispatch: { facility: 'production', target: [-20, 0, 35], az: 33, el: 40, dist: 300, fov: 30 },
  freight: { facility: 'freight', target: [100.5, 0, 141.2], az: 33.2, el: 39.6, dist: 156, fov: 30 },
  cold: { facility: 'cold', target: [-84, 0, 157.9], az: -38.4, el: 59.8, dist: 199, fov: 30 },
  qc: { facility: 'receiving', target: [-81.9, 0, -170.6], az: 34.1, el: 40.7, dist: 111.4, fov: 30 },
};

export const LAYERS = [
  { id: 'world', preset: 'world' },
  { id: 'warehouse', preset: 'warehouse' },
  { id: 'production', preset: 'production' },
  { id: 'freight', preset: 'freight' },
  { id: 'cold', preset: 'cold' },
];
