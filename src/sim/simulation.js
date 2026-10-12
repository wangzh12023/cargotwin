import { GRID } from '../world/layout.js';
import { SLAB_H } from '../world/city.js';

// Rules-based logistics simulation: one dispatchable forklift (FL-01) that carries pallets from the
// WH-01 staging area to a destination, and one truck (TRK-2051) that can be loaded and sent to the
// freight terminal. Everything else in the scene is ambient traffic.

const DEST_INFO = {
  production: { title: 'Production', facility: 'production', approach: 'Approaching plant', arriving: 'Entering production' },
  truck: { title: 'Load truck', facility: 'warehouse', approach: 'Heading to TRK-2051', arriving: 'Loading TRK-2051' },
  freight: { title: 'Freight', facility: 'freight', approach: 'Crossing to freight', arriving: 'Unloading at transfer' },
  cold: { title: 'Cold chain', facility: 'cold', approach: 'Crossing the avenue', arriving: 'Entering cold apron' },
};

export function groundY(x, z) {
  const sx = GRID.BX + GRID.ROAD, sz = GRID.BZ + GRID.ROAD;
  const lx = (((x - GRID.OX) % sx) + sx) % sx;
  const lz = (((z - GRID.OZ) % sz) + sz) % sz;
  return lx < GRID.BX && lz < GRID.BZ ? SLAB_H : 0;
}

function clock() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export class Simulation {
  constructor(world, emit) {
    this.world = world;
    this.emit = emit; // (what) => void ; what in 'orders' | 'fleet' | 'panel' | 'feed' | 'route'
    const W = world.W;
    const wh = (x, z) => W('wh01', x, z), pl = (x, z) => W('plant', x, z), co = (x, z) => W('cold', x, z), fr = (x, z) => W('freight', x, z);
    // street lanes (right-hand traffic, same offsets as the ambient traffic)
    const SB = -1.4, NB = 5.4;      // avenue between WH-01 and the plant: south/north-bound lane x
    const EB = 85.4, WB = 78.6;     // road between WH-01 and the cold block: east/west-bound lane z
    const GATE = fr(0, 84)[1];      // z of the freight block's west gate
    const PZ = wh(0, 96.5)[1];      // z of FL-01's lane through the east gate of WH-01
    this.routes = {
      park: wh(110, 96.5),
      pickup: [wh(98, 100), wh(97, 105.4)],
      backout: wh(97, 100.6),
      production: {
        go: [wh(120, 96.5), wh(153, 96.5), pl(2, 96.5), pl(75, 96.5), pl(75, 80.5), pl(75, 66)],
        back: [[pl(75, 84)], [pl(67, 96.5), pl(2, 96.5), wh(153, 96.5), wh(110, 96.5)]],
        door: pl(75, 75),
      },
      truck: {
        go: [wh(80, 96.5), wh(58, 96.5), wh(58, 99.3)],
        back: [[wh(58, 95.5)], [wh(64, 96.5), wh(110, 96.5)]],
      },
      freight: {
        go: [wh(153, 96.5), [SB, PZ], [SB, GATE], fr(4, 84), fr(63, 84), fr(63, 66)],
        back: [[fr(63, 71)], [fr(57, 84), fr(4, 84), [NB, GATE], [NB, PZ], wh(153, 96.5), wh(110, 96.5)]],
      },
      cold: {
        go: [wh(138, 100.6), wh(140, 104), wh(140, 129), co(140, 3), co(136, 57.5), co(99, 61.5)],
        back: [[co(103, 61.5)], [co(134, 57), co(140, 4), wh(140, 127), wh(138, 100.6), wh(118, 96.5), wh(110, 96.5)]],
      },
      truckOut: [wh(58, 116), wh(66, 121), wh(132, 121), wh(138, 126), wh(138, 132), [wh(138, 0)[0] + 3, EB], [SB - 5, EB], [SB, EB + 6], [SB, GATE], fr(8, 84), fr(52, 84), fr(60, 76), fr(60, 64)],
      truckBackOut: [fr(60, 78)],
      truckHome: [fr(54, 84), fr(4, 84), [NB, GATE], [NB, WB + 6], [NB - 5, WB], [wh(140, 0)[0] + 4, WB], [wh(140, 0)[0], WB - 5], wh(140, 126), wh(136, 121), wh(66, 121), wh(54, 121)],
      truckPark: [wh(57, 114), wh(58, 110), wh(58, 106)],
    };

    this.orders = ['P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06'].map((id) => ({ id, site: 'Riverside Hub', location: 'WH-01', kind: 'Pallet', status: 'Ready to move', selected: id === 'P-01' }));
    this.nextOrder = 7;
    this.destination = 'production';
    this.fl = { state: 'idle', task: null, load: null, phase: 'Choose destination, then dispatch', queue: [] };
    this.trk = { state: 'bay', load: 0, trailerOpen: false, location: 'Loading bay' };
    this.counters = { production: 0, freight: 0, cold: 0, completed: 5, tasks: 85 };
    this.plantDoor = { manual: false, open: false };
    this.qc = { aisleBlocked: false };
    this.tasks = [];
    this.activity = [];
    this.timers = [];
    this.log('Simulation started', 'Riverside Hub · rules-based', 'activity');

    world.fl01.groundFn = groundY;
    world.trk.groundFn = groundY;
    world.onFrame((dt) => this.update(dt));
    this.updatePreview();
  }

  // ------------------------------------------------------------------------------- helpers
  log(title, sub, icon = 'activity') {
    this.activity.unshift({ title, sub, icon, time: clock() });
    this.activity.length = Math.min(this.activity.length, 30);
    this.emit('feed');
  }
  after(seconds, fn) { this.timers.push({ t: seconds, fn }); }
  selectedReady() { return this.orders.filter((o) => o.selected && o.status === 'Ready to move'); }

  // ------------------------------------------------------------------------------- commands
  /** planned route shown while FL-01 is idle and pallets are selected */
  updatePreview() {
    if (this.fl.state !== 'idle') return;
    const r = this.routes[this.destination];
    this.route = this.selectedReady().length && r ? [this.routes.park, ...(this.destination === 'production' ? r.go.slice(0, -1) : r.go)] : null;
    this.emit('route');
  }
  togglePallet(id, on) {
    const o = this.orders.find((x) => x.id === id);
    if (!o || o.status !== 'Ready to move') return;
    o.selected = on;
    this.emit('orders'); this.emit('fleet');
    this.updatePreview();
  }
  selectNextReady() {
    const o = this.orders.find((x) => x.status === 'Ready to move' && !x.selected);
    if (o) { o.selected = true; this.emit('orders'); this.emit('fleet'); this.updatePreview(); }
    return o;
  }
  setDestination(dest) {
    if (!DEST_INFO[dest]) return;
    this.destination = dest;
    this.emit('fleet');
    this.updatePreview();
  }
  dispatchForklift() {
    const picked = this.selectedReady();
    if (!picked.length) return false;
    for (const o of picked) { o.status = 'Queued'; o.selected = false; o.dest = this.destination; }
    this.fl.queue.push(...picked);
    for (const o of picked) this.tasks.unshift({ title: `${o.id} → ${DEST_INFO[o.dest].title}`, sub: 'FL-01 · queued', icon: 'tasks', id: o.id });
    this.counters.tasks += picked.length;
    this.log(`Dispatched FL-01`, `${picked.length} pallet${picked.length > 1 ? 's' : ''} → ${DEST_INFO[this.destination].title}`, 'forklift');
    this.emit('orders'); this.emit('feed'); this.emit('fleet');
    if (this.fl.state === 'idle') this.nextTrip();
    return true;
  }
  dispatchTruck() {
    if (this.trk.state !== 'bay' || this.trk.load === 0) return false;
    this.trk.state = 'enroute'; this.trk.location = 'Industrial Avenue';
    this.log('TRK-2051 departed', `${this.trk.load} / 3 pallets → Freight terminal`, 'truck');
    this.world.trk.drive([{ points: this.routes.truckOut, speed: 9, radius: 7 }], () => {
      this.trk.state = 'unloading'; this.trk.location = 'Freight terminal';
      this.emit('fleet'); this.emit('panel');
      this.after(4, () => {
        this.counters.freight += this.trk.load;
        this.log('TRK-2051 unloaded', `${this.trk.load} pallets at TRANSFER`, 'truck');
        this.trk.load = 0; this.trk.state = 'returning'; this.trk.location = 'Industrial Avenue';
        this.emit('fleet'); this.emit('panel');
        this.world.trk.drive([
          { points: this.routes.truckBackOut, reverse: true, speed: 3 },
          { points: this.routes.truckHome, speed: 9, radius: 7 },
          { points: this.routes.truckPark, reverse: true, speed: 3, radius: 4 },
        ], () => {
          this.trk.state = 'bay'; this.trk.location = 'Loading bay';
          this.emit('fleet'); this.emit('panel');
        });
      });
    });
    this.emit('fleet'); this.emit('panel');
    return true;
  }
  toggleTrailer() { this.trk.trailerOpen = !this.trk.trailerOpen; this.emit('fleet'); }
  setPlantDoor(open) { this.plantDoor.manual = true; this.plantDoor.open = open; this.world.setDoor(open); this.emit('panel'); }
  toggleAisle() { this.qc.aisleBlocked = !this.qc.aisleBlocked; this.log(this.qc.aisleBlocked ? 'QC aisle blocked' : 'QC aisle reopened', 'Receiving & inspection', 'block'); this.emit('panel'); }

  // ------------------------------------------------------------------------------- forklift trips
  nextTrip() {
    const fl = this.world.fl01;
    const order = this.fl.queue.shift();
    if (!order) {
      this.fl.state = 'idle'; this.fl.task = null; this.fl.load = null;
      this.fl.phase = 'Choose destination, then dispatch';
      this.emit('fleet'); this.emit('panel');
      this.updatePreview();
      return;
    }
    const dest = order.dest;
    const r = this.routes[dest];
    this.fl.state = 'working'; this.fl.task = order; this.fl.dest = dest;
    this.fl.phase = `Picking up ${order.id}`;
    this.emit('fleet'); this.emit('panel');
    this.route = [this.routes.backout, ...(dest === 'production' ? r.go.slice(0, -1) : r.go)];
    this.emit('route');
    fl.drive([{ points: this.routes.pickup, speed: 3.2 }], () => {
      this.after(1.0, () => {
        fl.setMode('loaded');
        order.status = 'In transit'; this.fl.load = order;
        this.fl.phase = DEST_INFO[dest].approach;
        this.emit('orders'); this.emit('fleet'); this.emit('panel');
        fl.drive([
          { points: [this.routes.backout], reverse: true, speed: 2.4 },
          { points: r.go, speed: dest === 'truck' ? 4 : 6, radius: 4 },
        ], () => this.arrive(order, dest));
      });
    });
  }

  arrive(order, dest) {
    const fl = this.world.fl01;
    this.fl.phase = DEST_INFO[dest].arriving;
    this.emit('fleet'); this.emit('panel');
    this.after(1.4, () => {
      fl.setMode('empty');
      order.status = 'Delivered'; this.fl.load = null;
      if (dest === 'truck') this.trk.load = Math.min(3, this.trk.load + 1);
      else this.counters[dest] += 1;
      this.counters.completed += 1;
      const t = this.tasks.find((x) => x.id === order.id);
      if (t) t.sub = 'FL-01 · done';
      this.log(`${order.id} delivered`, DEST_INFO[dest].title, 'package');
      this.emit('orders'); this.emit('fleet'); this.emit('panel');
      this.after(5, () => this.replaceOrder(order));
      this.fl.phase = 'Returning to staging';
      this.route = null; this.emit('route');
      const [rev, fwd] = this.routes[dest].back;
      fl.drive([{ points: rev, reverse: true, speed: 2.4 }, { points: fwd, speed: 6, radius: 4 }], () => this.nextTrip());
    });
  }

  replaceOrder(order) {
    const i = this.orders.indexOf(order);
    if (i < 0) return;
    const id = `P-${String(this.nextOrder++).padStart(2, '0')}`;
    this.orders.splice(i, 1);
    this.orders.push({ id, site: 'Riverside Hub', location: 'WH-01', kind: 'Pallet', status: 'Ready to move', selected: false });
    this.emit('orders');
  }

  // ------------------------------------------------------------------------------- tick
  update(dt) {
    if (dt <= 0) return;
    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.fn();
    // automatic plant door: opens ahead of the forklift, closes behind it
    if (!this.plantDoor.manual && this.fl.dest === 'production' && this.fl.state === 'working') {
      const [dx, dz] = this.routes.production.door;
      const p = this.world.fl01.pos;
      const near = Math.hypot(p.x - dx, p.z - dz) < 16;
      if (near !== this.plantDoor.open) { this.plantDoor.open = near; this.world.setDoor(near); this.emit('panel'); }
    } else if (!this.plantDoor.manual && this.plantDoor.open) {
      this.plantDoor.open = false; this.world.setDoor(false); this.emit('panel');
    }
  }

  // ------------------------------------------------------------------------------- views for the UI
  ordersView() { return this.orders.map((o) => ({ ...o })); }

  fleetView(IMG) {
    const n = this.selectedReady().length;
    const working = this.fl.state === 'working';
    const destTitle = DEST_INFO[this.fl.dest || this.destination].title;
    const trkStatus = { bay: { text: 'At bay' }, enroute: { text: 'En route', tone: 'blue' }, unloading: { text: 'Unloading', tone: 'blue' }, returning: { text: 'Returning' } }[this.trk.state];
    return [
      {
        id: 'FL_01', type: 'forklift', image: IMG.forklift, site: 'Riverside Hub', location: 'WH-01',
        status: working ? { text: 'In progress', tone: 'blue' } : { text: 'Automatic' },
        destination: working ? this.fl.dest : this.destination,
        routeTitle: this.fl.phase,
        routeFrom: 'Staging', routeTo: working ? destTitle : DEST_INFO[this.destination].title,
        dispatch: { label: working && n > 0 ? 'Queue for FL-01' : 'Dispatch forklift', count: `${n} pallet${n === 1 ? '' : 's'}`, enabled: n > 0 },
        actions: ['locate', 'truck'],
      },
      {
        id: 'TRK_2051', type: 'truck', image: IMG.truck, site: 'Riverside Hub', location: this.trk.location,
        status: trkStatus,
        load: `${this.trk.load} / 3 pallets`, trailerAction: this.trk.trailerOpen ? 'Close trailer' : 'Open trailer', target: 'Freight terminal',
        dispatch: { label: 'Dispatch truck', enabled: this.trk.state === 'bay' && this.trk.load > 0 },
        actions: ['eye'],
      },
      { id: 'FL_02', type: 'forklift', compact: true, image: IMG.forklift, site: 'Riverside Hub', location: 'WH-01', status: { text: 'Automatic' }, actions: ['eye'] },
    ];
  }

  facilityRows(kind) {
    switch (kind) {
      case 'wh': {
        const tracked = this.orders.filter((o) => o.status !== 'Delivered').length;
        const avail = this.orders.filter((o) => o.status === 'Ready to move').length;
        return { rows: [['Tracked cargo', `${tracked} pallets`], ['Staging', `${avail} available`], ['Location', 'WH-01']] };
      }
      case 'plant':
        return {
          status: { text: this.plantDoor.open ? 'Door open' : 'Door closed' },
          rows: [['Receiving', `${this.counters.production} pallet${this.counters.production === 1 ? '' : 's'}`], ['Door', this.plantDoor.manual ? 'Manual control' : 'Automatic'], ['Area', 'Production']],
        };
      case 'transfer':
        return {
          rows: [['Pallets received', String(this.counters.freight)], ['Truck', { bay: 'Awaiting arrival', enroute: 'Arriving', unloading: 'Unloading', returning: 'Departed' }[this.trk.state]], ['Route', 'Riverside Hub']],
        };
      case 'cold':
        return { rows: [['Pallets received', String(this.counters.cold)], ['Access', 'Industrial Avenue'], ['Facility', 'COLD-02']] };
      case 'qc':
        return {
          rows: [['Facility', 'Receiving & inspection'], ['Completed', String(this.counters.completed)], ['Door', 'Open'], ['Queue', '1 vehicles'], ['Routing', this.qc.aisleBlocked ? 'Aisle blocked' : 'Normal aisle']],
        };
      default: return {};
    }
  }

  forkliftRows() {
    const working = this.fl.state === 'working';
    const loaded = !!this.fl.load;
    return {
      status: working ? { text: 'Working', tone: 'blue' } : { text: 'Idle' },
      rows: [['Mode', working ? 'dispatch' : 'standby'], ['Current task', this.fl.task ? this.fl.task.id : '—'], ['Load', loaded ? this.fl.load.id : '—'], ['Fork height', loaded ? '0.70 m' : '0.15 m']],
      note: this.fl.phase,
    };
  }

  feedView() {
    return {
      tasks: this.tasks.slice(0, 20),
      activity: this.activity.slice(0, 20),
      taskCount: this.counters.tasks,
    };
  }
}
