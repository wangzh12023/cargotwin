// Icon helper. Uses Lucide icon nodes (ISC licence) plus a couple of custom glyphs
// drawn in the same 24x24 / 2px-stroke style.
import {
  createElement,
  Warehouse, Factory, Route, Truck, Forklift, Package, Eye, EyeOff, Search, Plus, Minus,
  House, Lasso, Menu, Pause, Play, MapPin, X, Move, ArrowUpRight, Check, Layers,
  RefreshCw, Boxes, Container, Bot, Clock, Activity, ListChecks, CircleDot, Snowflake,
  ScanSearch, Ban, DoorOpen, Navigation,
} from 'lucide';

// Custom: cooling-tower "production" glyph (the plant icon used in the destination grid / labels).
const Plant = [
  ['path', { d: 'M6 21c1.2-3.6 1.4-7.4-.4-11h8.8c-1.8 3.6-1.6 7.4-.4 11Z' }],
  ['path', { d: 'M3 21h18' }],
  ['path', { d: 'M15.5 5.5c.9-.9 1.9.9 2.8 0s1.9-.9 2.7 0' }],
  ['path', { d: 'M14 8.5c.7-.6 1.4.6 2.1 0' }],
];

// Custom: "automation" glyph (small robot arm / gear-like hub).
const Automation = [
  ['circle', { cx: '12', cy: '12', r: '3' }],
  ['path', { d: 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1' }],
];

const ICONS = {
  warehouse: Warehouse,
  factory: Factory,
  plant: Plant,
  route: Route,
  truck: Truck,
  forklift: Forklift,
  package: Package,
  eye: Eye,
  'eye-off': EyeOff,
  search: Search,
  plus: Plus,
  minus: Minus,
  house: House,
  lasso: Lasso,
  menu: Menu,
  pause: Pause,
  play: Play,
  'map-pin': MapPin,
  x: X,
  move: Move,
  'arrow-up-right': ArrowUpRight,
  check: Check,
  layers: Layers,
  refresh: RefreshCw,
  boxes: Boxes,
  container: Container,
  robot: Bot,
  clock: Clock,
  activity: Activity,
  tasks: ListChecks,
  dot: CircleDot,
  cold: Snowflake,
  scan: ScanSearch,
  block: Ban,
  door: DoorOpen,
  follow: Navigation,
  automation: Automation,
};

/**
 * Create an SVG icon element.
 * @param {string} name   key of ICONS (unknown names fall back to "dot")
 * @param {number} [size] px at the 16px root size (scaled with rem via CSS width/height)
 * @param {number} [stroke]
 */
export function icon(name, size = 16, stroke = 1.75) {
  const node = ICONS[name] || ICONS.dot;
  const svg = createElement(node);
  svg.setAttribute('stroke-width', String(stroke));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ico');
  svg.style.width = `${size / 16}rem`;
  svg.style.height = `${size / 16}rem`;
  return svg;
}

export const ICON_NAMES = Object.keys(ICONS);
