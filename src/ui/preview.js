// Dev harness: mounts the UI with demo data so it can be inspected/screenshot in isolation.
//   ui-preview.html?panel=wh|plant|transfer|cold|qc|forklift   open an info panel
//   ui-preview.html?state=far       far-shot state (P-01 selected, FL_01 ready to dispatch)
//   ui-preview.html?bg=<url>        image behind the map (onion-skin comparisons)
//   ui-preview.html?labels=1        a few demo map labels
import { createUI, PANEL_PRESETS, demoOrders, demoFleet } from './index.js';

const q = new URLSearchParams(location.search);
const log = (...a) => console.log('[ui]', ...a);

let orders = demoOrders();
let fleet = demoFleet();

if (q.get('state') === 'far') {
  orders = orders.map((o) => (o.id === 'P-01' ? { ...o, status: 'Ready to move', selected: true } : { ...o, status: 'Ready to move' }));
  fleet = fleet.map((v) => (v.id === 'FL_01'
    ? { ...v, status: { text: 'Automatic' }, routeTitle: 'Choose destination, then dispatch', dispatch: { label: 'Dispatch forklift', count: '1 pallet', enabled: true } }
    : v));
}

const SEARCH_INDEX = [
  { id: 'WH-01', label: 'WH-01', sub: 'Warehouse · Riverside Hub', icon: 'warehouse' },
  { id: 'PLANT', label: 'Production plant', sub: 'PLANT', icon: 'plant' },
  { id: 'TRANSFER', label: 'Freight terminal', sub: 'TRANSFER', icon: 'route' },
  { id: 'COLD-02', label: 'Cold chain', sub: 'COLD-02', icon: 'warehouse' },
  { id: 'QC', label: 'Receiving & inspection', sub: 'QC', icon: 'warehouse' },
  { id: 'FL_01', label: 'FL_01', sub: 'Forklift', icon: 'forklift' },
  { id: 'FL_02', label: 'FL_02', sub: 'Forklift', icon: 'forklift' },
  { id: 'TRK_2051', label: 'TRK_2051', sub: 'Truck', icon: 'truck' },
];

const ui = createUI(document.getElementById('app'), {
  onLayer: (id) => {
    log('layer', id);
    const map = { warehouse: 'wh', production: 'plant', freight: 'transfer', cold: 'cold' };
    if (map[id]) ui.showPanel(PANEL_PRESETS[map[id]]);
  },
  onZoom: (d) => log('zoom', d),
  onHome: () => log('home'),
  onToggleLabels: (v) => log('labels', v),
  onLasso: (v) => log('lasso', v),
  onSearch: (s) => SEARCH_INDEX.filter((r) => (r.label + ' ' + r.sub).toLowerCase().includes(s.toLowerCase())),
  onPickResult: (r) => log('pick', r.id),
  onSimToggle: (p) => log('paused', p),
  onSpeed: (x) => log('speed', x),
  onSelectPallet: (id, sel) => {
    orders = orders.map((o) => (o.id === id ? { ...o, selected: sel } : o));
    ui.updateOrders(orders);
  },
  onDestination: (vid, dest) => {
    fleet = fleet.map((v) => (v.id === vid ? { ...v, destination: dest } : v));
    ui.updateFleet(fleet);
  },
  onDispatchForklift: (id) => log('dispatch forklift', id),
  onDispatchTruck: (id) => log('dispatch truck', id),
  onVehicleAction: (id, a) => { log('vehicle', id, a); if (id === 'FL_01' && a === 'locate') ui.showPanel(PANEL_PRESETS.forklift); },
  onPanelAction: (a, spec) => log('panel action', a, spec?.id),
  onClosePanel: () => ui.hidePanel(),
});

ui.updateOrders(orders);
ui.updateFleet(fleet);
ui.updateTasks([
  { title: 'Move P-01 to Production', sub: 'FL_01 · Staging → Plant', icon: 'forklift', time: 'now' },
  { title: 'Load TRK_2051', sub: '3 pallets · Loading bay', icon: 'truck', time: '4 min' },
]);
ui.updateActivity([{ title: 'TRK_2051 docked', sub: 'Loading bay 3', icon: 'truck', time: '2 min' }]);

const panel = q.get('panel');
if (panel && PANEL_PRESETS[panel]) ui.showPanel(PANEL_PRESETS[panel]);
const layerFor = { wh: 'warehouse', plant: 'production', transfer: 'freight', cold: 'cold', qc: 'world', forklift: 'world' };
if (panel && layerFor[panel]) ui.setActiveLayer(layerFor[panel]);

const bg = q.get('bg');
if (bg) {
  Object.assign(ui.mapEl.style, { backgroundImage: `url("${bg}")`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' });
}

if (q.get('labels')) {
  // positions in rem relative to the map's top-left (taken from the world view reference)
  const demo = [
    { icon: 'warehouse', text: 'Warehouse', x: 46.3, y: 18.0 },
    { icon: 'warehouse', text: 'Returnable packaging', x: 72.5, y: 7.3 },
    { icon: 'warehouse', text: 'Sort & pack', x: 86.0, y: 13.6 },
    { icon: 'plant', text: 'Production', x: 74.3, y: 30.0 },
    { icon: 'route', text: 'Cold chain', x: 29.1, y: 30.2, variant: 'facility', active: true },
    { icon: 'route', text: 'Freight terminal', x: 64.0, y: 47.6 },
    { icon: 'forklift', text: 'FL-01', x: 48.5, y: 27.3, variant: 'vehicle' },
    { icon: 'truck', text: 'TRK-2051', x: 39.0, y: 25.5 },
  ];
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  for (const d of demo) {
    const el = ui.createLabel(d);
    if (d.active) el.classList.add('is-active');
    el.style.transform = `translate3d(${d.x * rem}px, ${d.y * rem}px, 0)`;
  }
}

window.__ui = ui;
