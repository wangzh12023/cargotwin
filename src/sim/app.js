import { createWorld } from '../world/index.js';
import { PRESETS, FACILITIES } from '../world/layout.js';
import { PANEL_PRESETS, IMG } from '../ui/index.js';
import { Simulation } from './simulation.js';

// Glue between the DOM UI (src/ui), the 3D world (src/world) and the simulation (src/sim).

const LAYER_FACILITY = { world: null, warehouse: 'warehouse', production: 'production', freight: 'freight', cold: 'cold' };
const PANEL_FOR = { warehouse: 'wh', production: 'plant', freight: 'transfer', cold: 'cold', receiving: 'qc' };
const FACILITY_LAYER = { warehouse: 'warehouse', production: 'production', freight: 'freight', cold: 'cold' };

/** `cb` is the callbacks object that was passed to createUI(); it is filled in place. */
export async function createApp(ui, cb) {

  let world, sim;
  let panel = null; // { type: 'facility'|'vehicle', id, presetKey }

  // --------------------------------------------------------------------------- panel rendering
  function renderPanel() {
    if (!panel || !sim) return;
    if (panel.type === 'vehicle') {
      const base = PANEL_PRESETS.forklift;
      ui.showPanel({ ...base, ...sim.forkliftRows(), actions: [
        { id: 'inspect', label: 'Inspect', icon: 'eye', variant: 'light' },
        { id: 'follow', label: world.following === world.fl01 ? 'Unfollow' : 'Follow', icon: 'move', variant: 'light' },
      ] });
      return;
    }
    const key = panel.presetKey;
    const base = PANEL_PRESETS[key];
    const live = sim.facilityRows(key);
    const spec = { ...base, ...live };
    if (key === 'qc') {
      const roofShown = world.roofVisible('receiving');
      spec.actions = [
        { id: 'toggle-roof', label: roofShown ? 'Hide roof' : 'Show roof', icon: 'warehouse', variant: 'light' },
        { id: 'block-aisle', label: sim.qc.aisleBlocked ? 'Open aisle' : 'Block aisle', icon: 'route', variant: 'light' },
      ];
      spec.wideAction = { id: 'pause', label: world.isPaused() ? 'Resume' : 'Pause', icon: world.isPaused() ? 'play' : 'pause', variant: 'light' };
    }
    if (key === 'wh') {
      spec.actions = [
        { id: 'inside', label: world.roofVisible('warehouse') ? 'Inside' : 'Outside', icon: 'warehouse', variant: 'dark' },
        { id: 'select-cargo', label: 'Select cargo', icon: 'package', variant: 'light' },
      ];
    }
    if (key === 'plant') {
      spec.actions = [
        { id: 'open-door', label: sim.plantDoor.open ? 'Close door' : 'Open door', icon: 'door', variant: 'light' },
        { id: 'enter-plant', label: 'Enter plant', icon: 'plant', variant: 'dark' },
      ];
    }
    ui.showPanel(spec);
  }

  function openFacility(id, { fly = true } = {}) {
    const f = FACILITIES[id];
    if (!f) return;
    const presetKey = PANEL_FOR[id];
    const layer = FACILITY_LAYER[id];
    if (layer) ui.setActiveLayer(layer);
    world.focusFacility(id);
    if (fly) { if (PRESETS[layer]) world.flyTo(layer); else if (id === 'receiving') world.flyTo('qc'); else world.flyToFacility(id); }
    if (id === 'receiving') world.setRoof('receiving', false);
    if (presetKey) { panel = { type: 'facility', id, presetKey }; renderPanel(); }
    else { panel = null; ui.hidePanel(); }
  }

  function openVehicle(id) {
    if (id === 'FL-01' || id === 'FL_01') {
      panel = { type: 'vehicle', id: 'FL-01' };
      world.labels.setActive('FL-01');
      renderPanel();
    } else if (id === 'TRK-2051' || id === 'TRK_2051') {
      world.focusFacility(null);
      world.labels.setActive('TRK-2051');
      ui.setActiveLayer('warehouse');
      world.flyTo('warehouse');
      panel = { type: 'facility', id: 'freight', presetKey: 'transfer' };
      renderPanel();
    }
  }

  function closePanel() {
    panel = null;
    ui.hidePanel();
    world.focusFacility(null);
  }

  // --------------------------------------------------------------------------- callbacks
  Object.assign(cb, {
    onLayer(id) {
      const fac = LAYER_FACILITY[id];
      if (!fac) { world.focusFacility(null); world.flyTo('world'); return; }
      openFacility(fac);
    },
    onAutomation(on) { world.setAmbient(on); },
    onZoom(dir) { world.rig.zoom(dir > 0 ? 0.72 : 1.38); },
    onHome() { closePanel(); ui.setActiveLayer('world'); world.flyTo('world'); },
    onToggleLabels(v) { world.labels.setVisible(v); },
    onLasso(on) { world.setRotateMode(on); },
    onSearch(q) {
      const s = q.toLowerCase();
      const items = [
        ...Object.entries(FACILITIES).map(([id, f]) => ({ id, label: f.label, sub: 'Facility', icon: f.icon })),
        { id: 'FL-01', label: 'FL-01', sub: 'Forklift · Riverside Hub', icon: 'forklift' },
        { id: 'TRK-2051', label: 'TRK-2051', sub: 'Truck · Loading bay', icon: 'truck' },
        { id: 'WH-01', label: 'WH-01', sub: 'Warehouse', icon: 'warehouse', facility: 'warehouse' },
        { id: 'COLD-02', label: 'COLD-02', sub: 'Cold chain', icon: 'cold', facility: 'cold' },
        { id: 'PLANT', label: 'PLANT', sub: 'Production', icon: 'factory', facility: 'production' },
        { id: 'TRANSFER', label: 'TRANSFER', sub: 'Freight terminal', icon: 'route', facility: 'freight' },
      ];
      return items.filter((r) => r.label.toLowerCase().includes(s) || r.sub.toLowerCase().includes(s));
    },
    onPickResult(r) {
      if (r.id === 'FL-01' || r.id === 'TRK-2051') {
        openVehicle(r.id);
        if (r.id === 'FL-01') { world.follow(world.fl01); world.rig.zoom(0.5); }
        return;
      }
      openFacility(r.facility || r.id);
    },
    onSimToggle(paused) { world.setPaused(paused); renderPanel(); },
    onSpeed(x) { world.setSpeed(x); },
    onSelectPallet(id, on) { sim.togglePallet(id, on); },
    onOrderClick(id) { const o = sim.orders.find((x) => x.id === id); if (o && o.status === 'Ready to move') sim.togglePallet(id, !o.selected); },
    onSelectRow() { for (const o of sim.orders) if (o.status === 'Ready to move') o.selected = true; refresh('orders'); refresh('fleet'); },
    onRefresh() { refresh('orders'); refresh('fleet'); refresh('feed'); },
    onDestination(vehicleId, dest) { sim.setDestination(dest); },
    onDispatchForklift() {
      if (sim.dispatchForklift()) {
        const dest = sim.fl.dest;
        const layer = FACILITY_LAYER[{ production: 'production', truck: 'warehouse', freight: 'freight', cold: 'cold' }[dest]] || 'warehouse';
        ui.setActiveLayer(layer);
        world.focusFacility({ production: 'production', truck: 'warehouse', freight: 'freight', cold: 'cold' }[dest]);
        world.flyTo(dest === 'production' ? 'dispatch' : layer);
        openVehicle('FL-01');
      }
    },
    onDispatchTruck() { if (sim.dispatchTruck()) { ui.setActiveLayer('freight'); world.flyTo('freight'); } },
    onVehicleAction(id, action) {
      if (action === 'locate' || action === 'eye') {
        if (id === 'TRK_2051') { world.follow(world.trk); world.flyTo('warehouse', 1.2); return; }
        world.follow(world.fl01);
        world.rig.zoom(0.6);
        openVehicle('FL-01');
      }
      if (action === 'truck') { sim.setDestination('truck'); }
      if (action === 'trailer') sim.toggleTrailer();
      if (action === 'move') world.flyTo('warehouse');
    },
    onPanelAction(action) {
      switch (action) {
        case 'inside': world.setRoof('warehouse', !world.roofVisible('warehouse')); if (!world.roofVisible('warehouse')) world.flyTo('warehouseInside'); break;
        case 'select-cargo': sim.selectNextReady(); break;
        case 'open-door': sim.setPlantDoor(!sim.plantDoor.open); break;
        case 'enter-plant': world.flyTo('plantInside'); sim.setPlantDoor(true); break;
        case 'deliver-here': {
          const dest = { plant: 'production', transfer: 'freight', cold: 'cold' }[panel?.presetKey];
          if (dest) { sim.setDestination(dest); if (!sim.selectedReady().length) sim.selectNextReady(); }
          break;
        }
        case 'view-truck': world.follow(null); world.flyTo('warehouse'); world.labels.setActive('TRK-2051'); break;
        case 'toggle-roof': world.setRoof('receiving', !world.roofVisible('receiving')); break;
        case 'block-aisle': sim.toggleAisle(); break;
        case 'pause': { const p = !world.isPaused(); world.setPaused(p); ui.setSim({ paused: p }); break; }
        case 'inspect': world.follow(null); world.flyTo('dispatch'); break;
        case 'follow': world.follow(world.following === world.fl01 ? null : world.fl01); break;
        default: break;
      }
      renderPanel();
    },
    onClosePanel() { closePanel(); },
    onNav(id) {
      if (id === 'operations') { closePanel(); ui.setActiveLayer('world'); world.follow(null); world.flyTo('world'); }
      if (id === 'fleet') { openVehicle('FL-01'); world.follow(world.fl01); world.flyTo('warehouse', 1.2); }
      if (id === 'inventory') openFacility('warehouse');
    },
    onSidebarTab() {},
    onMenu() {},
  });

  // --------------------------------------------------------------------------- world + sim
  world = await createWorld({
    mapEl: ui.mapEl,
    labelsEl: ui.labelsEl,
    createLabel: (o) => ui.createLabel(o),
    onSelectFacility: (id) => openFacility(id),
    onSelectVehicle: (id) => openVehicle(id),
  });

  function refresh(what) {
    if (!sim) return;
    if (what === 'orders') ui.updateOrders(sim.ordersView());
    if (what === 'fleet') ui.updateFleet(sim.fleetView(IMG));
    if (what === 'panel') renderPanel();
    if (what === 'route') world.overlays.setRoute(sim.route || null);
    if (what === 'feed') {
      const f = sim.feedView();
      ui.updateTasks?.(f.tasks);
      ui.updateActivity?.(f.activity);
      ui.setTaskCount?.(f.taskCount);
    }
  }
  // coalesce UI refreshes to once per frame
  const pending = new Set();
  let scheduled = false;
  const emit = (what) => {
    pending.add(what);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; for (const w of pending) refresh(w); pending.clear(); });
  };
  sim = new Simulation(world, emit);
  ['orders', 'fleet', 'feed'].forEach(refresh);

  // initial state from the URL (used by the screenshot script and for deep links)
  const params = new URLSearchParams(location.search);
  const layer = params.get('layer');
  if (layer && LAYER_FACILITY[layer] !== undefined) {
    ui.setActiveLayer(layer);
    if (LAYER_FACILITY[layer]) { world.focusFacility(LAYER_FACILITY[layer]); panel = { type: 'facility', id: LAYER_FACILITY[layer], presetKey: PANEL_FOR[LAYER_FACILITY[layer]] }; renderPanel(); }
  }
  const p = params.get('panel');
  if (p === 'qc') { world.setRoof('receiving', false); panel = { type: 'facility', id: 'receiving', presetKey: 'qc' }; world.labels.setActive('receiving'); renderPanel(); }
  if (p && PANEL_PRESETS[p] && p !== 'qc' && p !== 'forklift') {
    const fac = Object.keys(PANEL_FOR).find((k) => PANEL_FOR[k] === p);
    panel = { type: 'facility', id: fac, presetKey: p }; renderPanel();
  }
  if (p === 'forklift') openVehicle('FL-01');
  if (params.has('demo')) {
    sim.setDestination('production');
    cb.onDispatchForklift();
  }

  window.__app = { world, sim, ui, cb };
  return { world, sim, ui };
}
