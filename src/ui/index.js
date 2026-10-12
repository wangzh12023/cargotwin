// DOM overlay for the app: top bar, two-column sidebar, map overlays, info panel, map labels.
// Vanilla ES modules; all state lives in the caller (simulation) and is pushed in via update*().
import '@fontsource-variable/inter';
import '../styles/ui.css';
import { BRAND } from '../config.js';
import { h, clear, add } from './dom.js';
import { icon } from './icons.js';
import { NAV_TABS, LAYERS, DESTINATIONS } from './data.js';

/**
 * @typedef {{ text: string, tone?: 'neutral'|'blue'|'lavender' }} Status
 * @typedef {{ id: string, label: string, icon?: string, variant?: 'dark'|'light', disabled?: boolean }} PanelAction
 * @typedef {Object} PanelSpec
 * @property {string} id                 stable id (e.g. 'WH-01'); passed back to callbacks
 * @property {'facility'|'vehicle'} kind vehicle panels show `image` large, overlapping the rows
 * @property {string} category           small caps label (rendered uppercase), e.g. 'Warehouse'
 * @property {string} title              e.g. 'WH-01'
 * @property {Status} [status]           pill at the right of the title
 * @property {Array<[string,string]>} [rows]  key/value rows
 * @property {string} [note]             muted paragraph under the rows
 * @property {string} [image]            image url (vehicle panels)
 * @property {PanelAction[]} [actions]   up to two buttons side by side
 * @property {PanelAction} [wideAction]  optional full-width button under `actions`
 *
 * @typedef {{ id: string, site: string, location: string, kind?: string, status: string, selected?: boolean }} Order
 * @typedef {Object} Vehicle
 * @property {string} id
 * @property {'forklift'|'truck'} type
 * @property {boolean} [compact]         compact card (image + title only)
 * @property {string} image
 * @property {string} site
 * @property {string} location
 * @property {Status} status
 * @property {string} [destination]      forklift: selected destination id
 * @property {string} [routeTitle]       forklift: 'Approaching plant' | 'Choose destination, then dispatch'
 * @property {string} [routeFrom]
 * @property {string} [routeTo]
 * @property {string} [load]             truck: '0 / 3 pallets'
 * @property {string} [trailerAction]    truck: 'Open trailer'
 * @property {string} [target]           truck: 'Freight terminal'
 * @property {{ label: string, count?: string, enabled: boolean }} [dispatch]
 * @property {Array<'locate'|'truck'|'eye'>} [actions]
 */

const NOOP = () => undefined;

/**
 * Build the overlay inside `appEl`.
 * Label anchor convention: a label element's (0,0) is its anchor point and the pill is centred
 * on it. Position with `el.style.transform = \`translate3d(${x}px, ${y}px, 0)\``
 * where (x, y) are pixels relative to the top-left of `ui.mapEl`.
 *
 * @param {HTMLElement} appEl
 * @param {Record<string, Function>} [callbacks]
 */
export function createUI(appEl, callbacks = {}) {
  const cb = new Proxy(callbacks, { get: (t, k) => (typeof t[k] === 'function' ? t[k] : NOOP) });
  clear(appEl);
  appEl.classList.add('ct-app');

  const state = {
    nav: 'operations',
    tab: 'dispatch',
    layer: 'world',
    automation: true,
    labelsVisible: true,
    lasso: false,
    sim: { paused: false, speed: 1 },
    orders: [],
    fleet: [],
    tasks: [],
    activity: [],
    panel: null,
  };

  // ---------------------------------------------------------------- top bar
  const navButtons = NAV_TABS.map((t) =>
    h('button.nav-tab', { type: 'button', dataset: { id: t.id }, onclick: () => setNav(t.id) }, t.label)
  );
  const pauseBtn = h('button.sq-btn.sim-pause', { type: 'button', title: 'Pause simulation', onclick: () => toggleSim() });
  const speedBtn = h('button.pill-btn.sim-speed', { type: 'button', title: 'Simulation speed', onclick: () => cycleSpeed() });
  const topbar = h('header.topbar',
    h('div.brand',
      h('span.brand-ico', icon('warehouse', 22, 1.6)),
      h('span.brand-name', BRAND),
    ),
    h('nav.nav', navButtons),
    h('div.simctl',
      pauseBtn,
      h('span.sim-label', 'Simulation'),
      speedBtn,
      h('button.sq-btn.menu-btn', { type: 'button', title: 'Menu', onclick: () => cb.onMenu() }, icon('menu', 20, 1.6)),
    ),
  );

  // ---------------------------------------------------------------- sidebar
  const tabButtons = [
    h('button.tab', { type: 'button', dataset: { id: 'dispatch' }, onclick: () => setTab('dispatch') }, 'Dispatch'),
    h('button.tab', { type: 'button', dataset: { id: 'tasks' }, onclick: () => setTab('tasks') }, 'Tasks', h('small.tab-count', '85')),
    h('button.tab', { type: 'button', dataset: { id: 'activity' }, onclick: () => setTab('activity') }, 'Activity'),
  ];
  const ordersList = h('div.orders-list');
  const tasksList = h('div.feed-list', { hidden: true });
  const activityList = h('div.feed-list', { hidden: true });
  const groupRow = h('div.card.card-group',
    h('span.group-name', 'Riverside Hub'),
    h('button.soft-btn', { type: 'button', onclick: () => cb.onSelectRow('Riverside Hub') }, 'Select row'),
  );
  const colOrders = h('section.col.col-orders',
    h('div.card.card-head', h('h2.head-title', 'Cargo orders'), h('span.tag', 'WH-01')),
    h('div.card.card-tabs', tabButtons),
    groupRow,
    ordersList, tasksList, activityList,
    h('div.col-spacer'),
    h('div.card.card-foot',
      h('span.foot-ico', icon('dot', 14, 1.6)),
      h('span.foot-text', 'Riverside · Warehouse'),
      h('button.foot-btn', { type: 'button', title: 'Refresh', onclick: () => cb.onRefresh() }, icon('refresh', 15, 1.6)),
    ),
  );
  const colFleet = h('section.col.col-fleet');
  const sidebar = h('aside.sidebar', colOrders, colFleet);

  // ---------------------------------------------------------------- map + overlays
  const labelsEl = h('div.map-labels');
  const layerButtons = LAYERS.map((l) =>
    h('button.layer-btn', { type: 'button', dataset: { id: l.id }, onclick: () => { setActiveLayer(l.id); cb.onLayer(l.id); } }, l.label)
  );
  const autoBtn = h('button.layer-btn.layer-auto', { type: 'button', onclick: () => {
    state.automation = !state.automation; renderLayerbar(); cb.onAutomation(state.automation);
  } }, 'Automation');
  const layerbar = h('div.layerbar.glass', autoBtn, h('span.layer-ico', icon('layers', 16, 1.6)), layerButtons);

  const searchInput = h('input.search-input', { type: 'text', placeholder: 'Find a site or vehicle', spellcheck: 'false', autocomplete: 'off' });
  const searchResults = h('div.search-results.glass', { hidden: true });
  const searchBox = h('div.search.glass',
    h('span.search-ico', icon('search', 18, 1.7)),
    searchInput,
    h('button.search-go', { type: 'button', title: 'Go', onclick: () => pickFirstResult() }, icon('arrow-up-right', 16, 1.7)),
    searchResults,
  );
  const eyeBtn = h('button.tool-btn.eye-btn.glass', { type: 'button', title: 'Toggle labels', onclick: () => setLabelsVisible(!state.labelsVisible, true) });
  const lassoBtn = h('button.tool-btn', { type: 'button', title: 'Rotate / select', onclick: () => {
    state.lasso = !state.lasso; lassoBtn.classList.toggle('is-on', state.lasso); cb.onLasso(state.lasso);
  } }, icon('lasso', 18, 1.7));
  const toolbar = h('div.toolbar',
    h('div.tool-group.glass',
      h('button.tool-btn', { type: 'button', title: 'Zoom in', onclick: () => cb.onZoom(1) }, icon('plus', 18, 1.7)),
      h('button.tool-btn', { type: 'button', title: 'Zoom out', onclick: () => cb.onZoom(-1) }, icon('minus', 18, 1.7)),
    ),
    h('div.tool-group.glass',
      h('button.tool-btn', { type: 'button', title: 'Home view', onclick: () => cb.onHome() }, icon('house', 18, 1.7)),
      lassoBtn,
    ),
  );
  const panelEl = h('section.panel.glass', { hidden: true });
  const mapUI = h('div.map-ui', layerbar, h('div.search-wrap', searchBox, eyeBtn), toolbar, panelEl);
  const mapEl = h('main.map#map', labelsEl, mapUI);

  appEl.append(topbar, sidebar, mapEl);

  // ---------------------------------------------------------------- behaviour
  function setNav(id) {
    state.nav = id;
    navButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.id === id));
    cb.onNav(id);
  }
  function setTab(id) {
    state.tab = id;
    tabButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.id === id));
    groupRow.hidden = id !== 'dispatch';
    ordersList.hidden = id !== 'dispatch';
    tasksList.hidden = id !== 'tasks';
    activityList.hidden = id !== 'activity';
    cb.onSidebarTab(id);
  }
  function renderSim() {
    clear(pauseBtn).append(icon(state.sim.paused ? 'play' : 'pause', 18, 1.6));
    pauseBtn.title = state.sim.paused ? 'Resume simulation' : 'Pause simulation';
    speedBtn.textContent = `${state.sim.speed}× speed`;
  }
  function toggleSim() {
    state.sim.paused = !state.sim.paused;
    renderSim();
    cb.onSimToggle(state.sim.paused);
  }
  function cycleSpeed() {
    const steps = [1, 2, 4];
    state.sim.speed = steps[(steps.indexOf(state.sim.speed) + 1) % steps.length];
    renderSim();
    cb.onSpeed(state.sim.speed);
  }
  function renderLayerbar() {
    autoBtn.classList.toggle('is-active', state.automation);
    layerButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.id === state.layer));
  }
  function setActiveLayer(id) {
    state.layer = id;
    renderLayerbar();
  }
  function setLabelsVisible(v, fromUser = false) {
    state.labelsVisible = v;
    labelsEl.classList.toggle('is-hidden', !v);
    clear(eyeBtn).append(icon(v ? 'eye' : 'eye-off', 18, 1.7));
    eyeBtn.classList.toggle('is-on', !v);
    if (fromUser) cb.onToggleLabels(v);
  }

  // search -------------------------------------------------------------
  let results = [];
  function renderResults() {
    clear(searchResults);
    searchResults.hidden = !results.length;
    for (const r of results) {
      searchResults.append(
        h('button.search-item', { type: 'button', onclick: () => pick(r) },
          h('span.search-item-ico', icon(r.icon || 'map-pin', 15, 1.7)),
          h('span.search-item-text', h('b', r.label), r.sub ? h('small', r.sub) : null),
        )
      );
    }
  }
  function pick(r) {
    results = [];
    renderResults();
    searchInput.value = r.label;
    searchInput.blur();
    cb.onPickResult(r);
  }
  function pickFirstResult() {
    const q = searchInput.value.trim();
    if (!results.length && q) results = cb.onSearch(q) || [];
    if (results[0]) pick(results[0]);
  }
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    results = q ? (cb.onSearch(q) || []).slice(0, 7) : [];
    renderResults();
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') pickFirstResult();
    if (e.key === 'Escape') { results = []; renderResults(); searchInput.blur(); }
  });
  searchInput.addEventListener('blur', () => setTimeout(() => { results = []; renderResults(); }, 150));

  // orders ---------------------------------------------------------------
  function statusPill(s, extra = '') {
    const st = typeof s === 'string' ? { text: s } : s || { text: '' };
    return h(`span.status-pill${st.tone ? '.is-' + st.tone : ''}${extra}`, st.text);
  }
  function renderOrders() {
    clear(ordersList);
    for (const o of state.orders) {
      const toggle = h(`button.order-toggle${o.selected ? '.is-checked' : ''}`, {
        type: 'button', title: o.selected ? 'Deselect' : 'Select',
        onclick: (e) => { e.stopPropagation(); cb.onSelectPallet(o.id, !o.selected); },
      }, icon(o.selected ? 'check' : 'plus', o.selected ? 15 : 17, o.selected ? 2.4 : 1.5));
      ordersList.append(
        h(`article.card.order${o.selected ? '.is-selected' : ''}`, { dataset: { id: o.id }, onclick: () => cb.onOrderClick(o.id) },
          h('div.order-r1', h('span.order-id', o.id), toggle),
          h('div.order-r2', h('span.order-site', o.site), h('span.order-loc', o.location)),
          h('div.order-r3',
            h('span.order-kind', icon('package', 15, 1.5), o.kind || 'Pallet'),
            statusPill(o.selected && o.status === 'Ready to move' ? { text: o.status, tone: 'lavender' } : o.status),
          ),
        )
      );
    }
  }

  // fleet ----------------------------------------------------------------
  function vehicleImage(v, cls) {
    const img = h(`img.veh-img${cls}`, { src: v.image, alt: '', draggable: 'false' });
    img.addEventListener('error', () => img.classList.add('is-missing'), { once: true });
    return img;
  }
  function actionButtons(v) {
    const map = { locate: 'map-pin', truck: 'truck', eye: 'eye' };
    return h('div.veh-actions', (v.actions || []).map((a) =>
      h('button.sq-btn.veh-action', { type: 'button', title: a, onclick: () => cb.onVehicleAction(v.id, a) }, icon(map[a] || 'dot', 18, 1.6))
    ));
  }
  function dispatchZone(v, kind) {
    const d = v.dispatch || { label: kind === 'truck' ? 'Dispatch truck' : 'Dispatch forklift', enabled: false };
    const btn = h(`button.dispatch-btn${d.enabled ? '' : '.is-disabled'}`, {
      type: 'button', disabled: !d.enabled,
      onclick: () => (kind === 'truck' ? cb.onDispatchTruck(v.id) : cb.onDispatchForklift(v.id)),
    }, icon(kind === 'truck' ? 'truck' : 'forklift', 17, 1.6), h('span.dispatch-label', d.label), d.count ? h('small.dispatch-count', d.count) : null);
    return h(`div.dispatch-zone${d.enabled ? '' : '.is-disabled'}`, btn);
  }
  function forkliftCard(v) {
    if (v.compact) {
      return h('article.card.vehicle.is-compact', { dataset: { id: v.id } },
        h('div.veh-top', vehicleImage(v, '.is-small'), actionButtons(v)),
        h('div.veh-title', h('h3.veh-id', v.id), statusPill(v.status)),
        h('div.veh-sub', v.site, h('i.sep-dot'), v.location),
      );
    }
    const dest = h('div.dest-grid', DESTINATIONS.map((d) =>
      h(`button.dest-btn${v.destination === d.id ? '.is-active' : ''}`, { type: 'button', onclick: () => cb.onDestination(v.id, d.id) },
        h('span.dest-ico', icon(d.icon, 16, 1.6)), h('span.dest-label', d.label))
    ));
    return h('article.card.vehicle.is-forklift', { dataset: { id: v.id } },
      h('div.veh-top', vehicleImage(v, ''), actionButtons(v)),
      h('div.veh-title', h('h3.veh-id', v.id), statusPill(v.status)),
      h('div.veh-sub', v.site, h('i.sep-dot'), v.location),
      h('div.veh-label', 'Destination'),
      dest,
      h('div.veh-route',
        h('div.route-text',
          h('div.route-title', v.routeTitle || 'Choose destination, then dispatch'),
          h('div.route-path', v.routeFrom || 'Staging', h('span.route-arrow', '→'), v.routeTo || 'Production'),
        ),
        h('button.sq-btn.route-move', { type: 'button', title: 'Move', onclick: () => cb.onVehicleAction(v.id, 'move') }, icon('move', 18, 1.6)),
      ),
      dispatchZone(v, 'forklift'),
    );
  }
  function truckCard(v) {
    return h('article.card.vehicle.is-truck', { dataset: { id: v.id } },
      h('div.veh-top', vehicleImage(v, '.is-truck'), actionButtons(v)),
      h('div.veh-title', h('h3.veh-id', v.id), statusPill(v.status)),
      h('div.veh-sub', v.site, h('i.sep-dot'), v.location),
      h('div.veh-line',
        h('span.veh-line-text', icon('package', 17, 1.5), v.load || '0 / 3 pallets'),
        h('button.soft-btn.trailer-btn', { type: 'button', onclick: () => cb.onVehicleAction(v.id, 'trailer') }, v.trailerAction || 'Open trailer'),
      ),
      h('div.veh-line', h('span.veh-line-text', icon('map-pin', 17, 1.5), v.target || 'Freight terminal')),
      dispatchZone(v, 'truck'),
    );
  }
  function renderFleet() {
    clear(colFleet);
    for (const v of state.fleet) colFleet.append(v.type === 'truck' ? truckCard(v) : forkliftCard(v));
  }

  // tasks / activity -----------------------------------------------------
  function renderFeed(listEl, items, emptyText) {
    clear(listEl);
    if (!items.length) listEl.append(h('div.card.feed-empty', emptyText));
    for (const it of items) {
      listEl.append(h('div.card.feed-item',
        h('span.feed-ico', icon(it.icon || 'activity', 15, 1.6)),
        h('span.feed-text', h('b', it.title), it.sub ? h('small', it.sub) : null),
        it.time ? h('span.feed-time', it.time) : null,
      ));
    }
  }

  // panel ----------------------------------------------------------------
  function actionButton(a, wide = false) {
    return h(`button.panel-btn.is-${a.variant || 'light'}${wide ? '.is-wide' : ''}`, {
      type: 'button', disabled: a.disabled, onclick: () => cb.onPanelAction(a.id, state.panel),
    }, a.icon ? icon(a.icon, 16, 1.7) : null, h('span', a.label));
  }
  function showPanel(spec) {
    const same = !panelEl.hidden && state.panel && state.panel.id === spec.id;
    state.panel = spec;
    clear(panelEl);
    panelEl.className = `panel glass is-${spec.kind || 'facility'}${same ? ' is-in' : ''}`;
    const rows = (spec.rows || []).map(([k, v]) => h('div.panel-row', h('span.panel-k', k), h('span.panel-v', v)));
    add(panelEl,
      spec.kind === 'vehicle' ? h('div.panel-glow') : null,
      h('div.panel-head',
        h('span.panel-cat', spec.category),
        h('button.panel-close', { type: 'button', title: 'Close', onclick: () => cb.onClosePanel(spec) }, icon('x', 18, 1.7)),
      ),
      h('div.panel-title-row', h('h3.panel-title', spec.title), spec.status ? statusPill(spec.status, '.panel-status') : null),
      spec.image ? h('img.panel-img', { src: spec.image, alt: '', draggable: 'false', onerror: (e) => e.target.classList.add('is-missing') }) : null,
      rows.length ? h('div.panel-rows', rows) : null,
      spec.note ? h('p.panel-note', spec.note) : null,
      spec.actions?.length ? h(`div.panel-actions${spec.actions.length === 1 ? '.is-single' : ''}`, spec.actions.map((a) => actionButton(a))) : null,
      spec.wideAction ? actionButton(spec.wideAction, true) : null,
    );
    panelEl.hidden = false;
    requestAnimationFrame(() => panelEl.classList.add('is-in'));
  }
  function hidePanel() {
    state.panel = null;
    panelEl.classList.remove('is-in');
    panelEl.hidden = true;
  }

  // labels -----------------------------------------------------------------
  /**
   * @param {{ icon?: string, text: string, variant?: 'facility'|'vehicle' }} opts
   * @returns {HTMLElement} absolutely positioned at (0,0) of mapEl; anchor = pill centre.
   */
  function createLabel({ icon: ico = 'warehouse', text, variant = 'facility' }) {
    const el = h(`div.map-label.is-${variant}`,
      h('div.map-label-pill',
        h('span.map-label-ico', icon(ico, 13, 1.8)),
        h('span.map-label-text', text),
      ),
    );
    labelsEl.append(el);
    return el;
  }

  // Labels sit above the canvas; forward wheel events so zooming still works over them.
  labelsEl.addEventListener('wheel', (e) => {
    const canvas = mapEl.querySelector('canvas');
    if (!canvas) return;
    e.preventDefault();
    canvas.dispatchEvent(new WheelEvent('wheel', e));
  }, { passive: false });

  // init -------------------------------------------------------------------
  setNav('operations');
  setTab('dispatch');
  renderLayerbar();
  renderSim();
  setLabelsVisible(true);

  return {
    root: appEl,
    mapEl,
    labelsEl,
    panelEl,
    createLabel,
    setActiveLayer,
    showPanel,
    hidePanel,
    get panel() { return state.panel; },
    updateOrders(orders) { state.orders = orders || []; renderOrders(); },
    updateFleet(fleet) { state.fleet = fleet || []; renderFleet(); },
    updateTasks(tasks) { state.tasks = tasks || []; renderFeed(tasksList, state.tasks, 'No open tasks'); },
    updateActivity(items) { state.activity = items || []; renderFeed(activityList, state.activity, 'No activity yet'); },
    setSim({ paused, speed } = {}) {
      if (paused != null) state.sim.paused = !!paused;
      if (speed != null) state.sim.speed = speed;
      renderSim();
    },
    setLabelsVisible: (v) => setLabelsVisible(v, false),
    setTaskCount(n) { tabButtons[1].querySelector('.tab-count').textContent = String(n); },
    setAutomation(on) { state.automation = !!on; renderLayerbar(); },
  };
}

export { PANEL_PRESETS, demoOrders, demoFleet, IMG, LAYERS, DESTINATIONS } from './data.js';
