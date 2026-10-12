// Static UI data: navigation, layers, destinations, demo state and panel presets.
// The simulation owns the live state; these are defaults + presets it can reuse.
import { asset } from './dom.js';

export const NAV_TABS = [
  { id: 'operations', label: 'Operations' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'inventory', label: 'Inventory' },
];

export const LAYERS = [
  { id: 'world', label: 'World' },
  { id: 'warehouse', label: 'Warehouse' },
  { id: 'production', label: 'Production' },
  { id: 'freight', label: 'Freight' },
  { id: 'cold', label: 'Cold chain' },
];

export const DESTINATIONS = [
  { id: 'production', label: 'Production', icon: 'plant' },
  { id: 'truck', label: 'Load truck', icon: 'truck' },
  { id: 'freight', label: 'Freight', icon: 'route' },
  { id: 'cold', label: 'Cold chain', icon: 'warehouse' },
];

export const IMG = {
  forklift: asset('img/forklift.png'),
  forkliftCargo: asset('img/forklift_cargo.png'),
  truck: asset('img/truck.png'),
};

/** @returns {import('./index.js').Order[]} */
export function demoOrders() {
  return [
    { id: 'P-01', site: 'Riverside Hub', location: 'WH-01', kind: 'Pallet', status: 'In transit', selected: false },
    { id: 'P-02', site: 'Riverside Hub', location: 'WH-01', kind: 'Pallet', status: 'Queued', selected: false },
    { id: 'P-03', site: 'Riverside Hub', location: 'WH-01', kind: 'Pallet', status: 'Queued', selected: false },
    { id: 'P-04', site: 'Riverside Hub', location: 'WH-01', kind: 'Pallet', status: 'Ready to move', selected: false },
    { id: 'P-05', site: 'Riverside Hub', location: 'WH-01', kind: 'Pallet', status: 'Ready to move', selected: false },
    { id: 'P-06', site: 'Riverside Hub', location: 'WH-01', kind: 'Pallet', status: 'Ready to move', selected: false },
  ];
}

/** @returns {import('./index.js').Vehicle[]} */
export function demoFleet() {
  return [
    {
      id: 'FL_01', type: 'forklift', image: IMG.forklift,
      site: 'Riverside Hub', location: 'WH-01',
      status: { text: 'In progress', tone: 'blue' },
      destination: 'production',
      routeTitle: 'Approaching plant', routeFrom: 'Staging', routeTo: 'Production',
      dispatch: { label: 'Dispatch forklift', count: '0 pallets', enabled: false },
      actions: ['locate', 'truck'],
    },
    {
      id: 'TRK_2051', type: 'truck', image: IMG.truck,
      site: 'Riverside Hub', location: 'Loading bay',
      status: { text: 'At bay' },
      load: '0 / 3 pallets', trailerAction: 'Open trailer', target: 'Freight terminal',
      dispatch: { label: 'Dispatch truck', enabled: false },
      actions: ['eye'],
    },
    {
      id: 'FL_02', type: 'forklift', compact: true, image: IMG.forklift,
      site: 'Riverside Hub', location: 'WH-01',
      status: { text: 'Automatic' },
      actions: ['eye'],
    },
  ];
}

/**
 * Panel presets matching the facilities/vehicles of the scene. Values are defaults; the
 * simulation can clone a preset and overwrite rows/status before calling ui.showPanel().
 * @type {Record<string, import('./index.js').PanelSpec>}
 */
export const PANEL_PRESETS = {
  wh: {
    id: 'WH-01', kind: 'facility', category: 'Warehouse', title: 'WH-01',
    status: { text: 'Operational' },
    rows: [['Tracked cargo', '6 pallets'], ['Staging', '6 available'], ['Location', 'WH-01']],
    note: 'Check the racks or send staged pallets out.',
    actions: [
      { id: 'inside', label: 'Inside', icon: 'warehouse', variant: 'dark' },
      { id: 'select-cargo', label: 'Select cargo', icon: 'package', variant: 'light' },
    ],
  },
  plant: {
    id: 'PLANT', kind: 'facility', category: 'Production', title: 'PLANT',
    status: { text: 'Door closed' },
    rows: [['Receiving', '0 pallets'], ['Door', 'Manual control'], ['Area', 'Production']],
    note: 'Doors open automatically ahead of an arriving forklift.',
    actions: [
      { id: 'open-door', label: 'Open door', icon: 'door', variant: 'light' },
      { id: 'enter-plant', label: 'Enter plant', icon: 'plant', variant: 'dark' },
    ],
    wideAction: { id: 'deliver-here', label: 'Deliver here', icon: 'package', variant: 'light' },
  },
  transfer: {
    id: 'TRANSFER', kind: 'facility', category: 'Transfer', title: 'TRANSFER',
    status: { text: 'Receiving' },
    rows: [['Pallets received', '0'], ['Truck', 'Awaiting arrival'], ['Route', 'Riverside Hub']],
    note: 'Forklift drop-offs and truck unloading are handled here.',
    actions: [{ id: 'view-truck', label: 'View truck', icon: 'truck', variant: 'dark' }],
    wideAction: { id: 'deliver-here', label: 'Deliver here', icon: 'package', variant: 'light' },
  },
  cold: {
    id: 'COLD-02', kind: 'facility', category: 'Cold', title: 'COLD-02',
    status: { text: 'Receiving' },
    rows: [['Pallets received', '0'], ['Access', 'Industrial Avenue'], ['Facility', 'COLD-02']],
    note: 'Send cargo over the avenue to the cold-chain intake apron.',
    actions: [{ id: 'select-cargo', label: 'Select cargo', icon: 'package', variant: 'dark' }],
    wideAction: { id: 'deliver-here', label: 'Deliver here', icon: 'package', variant: 'light' },
  },
  qc: {
    id: 'QC', kind: 'facility', category: 'Facility', title: 'QC',
    status: { text: 'Operating' },
    rows: [['Facility', 'Receiving & inspection'], ['Completed', '5'], ['Door', 'Open'], ['Queue', '1 vehicles'], ['Routing', 'Normal aisle']],
    note: 'Rule-based sim — pick a vehicle to assign it work.',
    actions: [
      { id: 'toggle-roof', label: 'Show roof', icon: 'warehouse', variant: 'light' },
      { id: 'block-aisle', label: 'Block aisle', icon: 'route', variant: 'light' },
    ],
    wideAction: { id: 'pause', label: 'Pause', icon: 'pause', variant: 'light' },
  },
  forklift: {
    id: 'FL-01', kind: 'vehicle', category: 'Forklift', title: 'FL-01',
    status: { text: 'Working', tone: 'blue' },
    image: IMG.forkliftCargo,
    rows: [['Mode', 'dispatch'], ['Current task', 'P-02'], ['Load', 'P-02'], ['Fork height', '0.70 m']],
    note: 'Entering production',
    actions: [
      { id: 'inspect', label: 'Inspect', icon: 'eye', variant: 'light' },
      { id: 'follow', label: 'Follow', icon: 'move', variant: 'light' },
    ],
  },
};
