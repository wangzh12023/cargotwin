import './styles/base.css';
import { BRAND } from './config.js';
import { createUI } from './ui/index.js';
import { createApp } from './sim/app.js';
import { createWorld } from './world/index.js';

// `?bare` renders only the 3D city (no dashboard) - handy for screenshots and kiosk screens.
const bare = new URLSearchParams(location.search).has('bare');

function bootScreen() {
  const el = document.createElement('div');
  el.className = 'boot';
  el.innerHTML = `<div class="boot-card"><div class="boot-logo"></div><div class="boot-name">${BRAND}</div><div class="boot-bar"><i></i></div></div>`;
  document.body.append(el);
  return () => { el.classList.add('is-done'); setTimeout(() => el.remove(), 600); };
}

function bareUI(app) {
  app.innerHTML = '<main class="bare-map"><div class="bare-labels"></div></main>';
  const mapEl = app.querySelector('.bare-map');
  const labelsEl = app.querySelector('.bare-labels');
  return {
    mapEl, labelsEl,
    createLabel({ text }) {
      const el = document.createElement('div');
      el.className = 'bare-label';
      el.textContent = text;
      labelsEl.append(el);
      return el;
    },
  };
}

async function boot() {
  const done = bootScreen();
  const app = document.getElementById('app');
  try {
    if (bare) {
      const ui = bareUI(app);
      await createWorld({ mapEl: ui.mapEl, labelsEl: ui.labelsEl, createLabel: ui.createLabel });
    } else {
      const callbacks = {};
      const ui = createUI(app, callbacks);
      await createApp(ui, callbacks);
    }
  } finally {
    done();
  }
}
boot();
