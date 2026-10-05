/* Tikom G8000 panel. Plain JavaScript, no external resources, no build step.
 * All text that comes from the backend or from the user is inserted with
 * textContent or escaped with esc(); never as raw HTML. */

const ROOM_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
const STATE_TEXT = {
  docked: "An der Station", cleaning: "Reinigt", returning: "Fährt zur Station",
  paused: "Pausiert", idle: "Bereit", error: "Fehler", unavailable: "Nicht erreichbar",
  unknown: "Unbekannt",
};
const OPTION_TEXT = {
  sweep: "Saugen", mop: "Wischen", sweep_and_mop: "Saugen und wischen",
  low: "Niedrig", medium: "Mittel", high: "Hoch",
  mute: "Stumm", normal: "Normal", max: "Laut",
  english: "Englisch", german: "Deutsch", french: "Französisch",
  italian: "Italienisch", off: "Aus", spanish: "Spanisch", japanese: "Japanisch",
};
const MODE_TEXT = { sweep: "Saugen", mop: "Wischen", sweep_and_mop: "Beides" };
const SUPPLY_MAX = { filter: 150, edge_brush: 150, roll_brush: 300 };
const SUPPLY_TEXT = { filter: "Filter", edge_brush: "Seitenbürste", roll_brush: "Rollbürste" };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const STYLE = `
:host { display: block; height: 100%; overflow: auto; box-sizing: border-box;
  background: var(--primary-background-color, #111); color: var(--primary-text-color, #e8e8e8);
  --tk-accent: var(--primary-color, #03a9f4); --tk-card: var(--card-background-color, #1c1c1c);
  --tk-line: var(--divider-color, rgba(255,255,255,.14)); --tk-soft: var(--secondary-text-color, #9aa0a6);
  --tk-ok: #3fb27f; --tk-warn: #f2a33a; --tk-bad: #e5534b;
  font-family: var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif); }
* { box-sizing: border-box; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 16px 16px 48px; }
h1, h2, h3, p { margin: 0; }
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--tk-accent); outline-offset: 2px; }

.top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.top h1 { font-size: 22px; font-weight: 600; letter-spacing: .2px; }
.tabs { display: flex; gap: 4px; margin-left: auto; background: var(--tk-card); padding: 4px;
  border-radius: 12px; border: 1px solid var(--tk-line); overflow-x: auto; }
.tab { background: none; border: 0; padding: 8px 14px; flex: 1; border-radius: 9px; color: var(--tk-soft); white-space: nowrap; }
.tab[aria-selected="true"] { background: var(--tk-accent); color: #fff; }

.grid { display: grid; gap: 14px; grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); align-items: start; }
@media (max-width: 860px) { .grid { grid-template-columns: minmax(0, 1fr); } }
.card { background: var(--tk-card); border: 1px solid var(--tk-line); border-radius: 16px; padding: 16px; }
.card + .card { margin-top: 14px; }
.card h2 { font-size: 16px; font-weight: 600; margin-bottom: 10px; }
.card h3 { font-size: 14px; font-weight: 600; margin: 14px 0 6px; }
.hint { color: var(--tk-soft); font-size: 13px; line-height: 1.45; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.row.between { justify-content: space-between; }
.stack { display: grid; gap: 10px; }

.status { display: flex; align-items: center; gap: 14px; }
.status .big { font-size: 26px; font-weight: 600; line-height: 1.1; }
.dot { width: 12px; height: 12px; border-radius: 50%; background: var(--tk-soft); flex: none; }
.dot.cleaning, .dot.returning { background: var(--tk-ok); box-shadow: 0 0 0 4px rgba(63,178,127,.2); }
.dot.docked { background: var(--tk-accent); }
.dot.error { background: var(--tk-bad); }
.bolt { width: 1em; height: 1em; fill: var(--tk-ok); vertical-align: -0.14em; flex: none; }
.bolt.full { fill: none; color: var(--tk-ok); }
.chg { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 500; color: var(--tk-ok); margin-left: 6px; vertical-align: middle; }
.chg .bolt { width: 16px; height: 16px; }
.battery b .bolt { width: 15px; height: 15px; margin-right: 3px; }
.battery { margin-left: auto; text-align: right; min-width: 84px; }
.battery b { font-size: 20px; font-weight: 600; }
.bar { height: 6px; border-radius: 3px; background: var(--tk-line); overflow: hidden; margin-top: 4px; }
.bar > i { display: block; height: 100%; background: var(--tk-ok); }
.bar.warn > i { background: var(--tk-warn); } .bar.bad > i { background: var(--tk-bad); }

.btn { border: 1px solid var(--tk-line); background: transparent; padding: 9px 14px; border-radius: 10px; }
.btn:hover { background: rgba(127,127,127,.12); }
.btn.primary { background: var(--tk-accent); border-color: var(--tk-accent); color: #fff; font-weight: 600; }
.btn.primary:hover { filter: brightness(1.08); }
.btn.danger { border-color: var(--tk-bad); color: var(--tk-bad); }
.btn.big { padding: 13px 18px; width: 100%; font-size: 16px; }
.btn[disabled] { opacity: .45; cursor: not-allowed; }
.seg { display: inline-flex; border: 1px solid var(--tk-line); border-radius: 10px; overflow: hidden; max-width: 100%; }
.seg button { background: none; border: 0; padding: 8px 13px; border-right: 1px solid var(--tk-line); }
.seg button:last-child { border-right: 0; }
.seg button[aria-pressed="true"] { background: var(--tk-accent); color: #fff; }
.seg.full { display: flex; } .seg.full button { flex: 1; }

.plan-wrap { position: relative; border-radius: 12px; overflow: hidden; background:
  radial-gradient(circle at 1px 1px, rgba(127,127,127,.22) 1px, transparent 0) 0 0 / 18px 18px, rgba(127,127,127,.06);
  border: 1px solid var(--tk-line); }
canvas { display: block; width: 100%; touch-action: none; }
.plan-empty { padding: 48px 20px; text-align: center; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 999px;
  border: 1px solid var(--tk-line); background: transparent; }
.chip i { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
.chip[aria-pressed="true"] { border-color: var(--tk-accent); background: color-mix(in srgb, var(--tk-accent) 22%, transparent); }

.steps { display: grid; gap: 8px; }
.step { display: flex; gap: 10px; align-items: center; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--tk-line); }
.step .mark { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--tk-line); flex: none; display: grid; place-items: center; font-size: 13px; }
.step.done .mark { background: var(--tk-ok); border-color: var(--tk-ok); color: #fff; }
.step .grow { flex: 1; }

.notice { padding: 10px 12px; border-radius: 10px; font-size: 14px; line-height: 1.4;
  background: color-mix(in srgb, var(--tk-warn) 16%, transparent); border: 1px solid color-mix(in srgb, var(--tk-warn) 55%, transparent); }
.notice.bad { background: color-mix(in srgb, var(--tk-bad) 16%, transparent); border-color: color-mix(in srgb, var(--tk-bad) 55%, transparent); }
.notice.ok { background: color-mix(in srgb, var(--tk-ok) 16%, transparent); border-color: color-mix(in srgb, var(--tk-ok) 55%, transparent); }

.tools { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.tool { display: inline-flex; gap: 6px; align-items: center; padding: 7px 11px; border-radius: 10px; border: 1px solid var(--tk-line); background: none; }
.tool[aria-pressed="true"] { background: var(--tk-accent); border-color: var(--tk-accent); color: #fff; }
.roomrow { display: grid; grid-template-columns: 30px 1fr 74px auto; gap: 8px; align-items: center; padding: 6px; border-radius: 10px; border: 1px solid transparent; }
.roomrow.active { border-color: var(--tk-accent); background: color-mix(in srgb, var(--tk-accent) 10%, transparent); }
.roomrow input[type=color] { width: 30px; height: 30px; padding: 0; border: 0; background: none; border-radius: 8px; }
input[type=text], input[type=number], select { background: transparent; border: 1px solid var(--tk-line); border-radius: 9px; padding: 8px 10px; min-width: 0; width: 100%; }
select option { background: var(--tk-card); color: var(--primary-text-color, #eee); }
input[type=range] { width: 100%; accent-color: var(--tk-accent); }
label.field { display: grid; gap: 4px; font-size: 13px; color: var(--tk-soft); }
.small { font-size: 13px; }
.num { font-variant-numeric: tabular-nums; }
.padgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-width: 280px; }
.padgrid .btn { padding: 14px 6px; }
.padgrid .empty { visibility: hidden; }
.supply { display: grid; gap: 4px; margin-bottom: 10px; }
.toggle { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; }
.running .plan-line { animation: none; }
.toast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); background: #202124; color: #fff;
  padding: 10px 16px; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.4); max-width: 90vw; z-index: 20; }
.toast.bad { background: #8c2a24; }
@media (max-width: 520px) {
  .top h1 { flex: 1 0 100%; }
  .tabs { margin-left: 0; width: 100%; box-sizing: border-box; }
  .tab { padding: 8px 6px; }
  .roomrow { grid-template-columns: 26px minmax(0, 1fr) 56px auto; gap: 6px; }
  .roomrow .btn { padding: 8px 9px; }
}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;


const STYLE_PLAN = `
.plan-wrap canvas { color: var(--primary-text-color, #e8e8e8); cursor: default; }
.plan-wrap.edit canvas { height: clamp(340px, 58vh, 680px); }
.plan-wrap.view canvas { height: clamp(260px, 50vh, 500px); }
.ftabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.ftab { background: none; border: 1px solid var(--tk-line); border-radius: 999px; padding: 6px 14px; display: inline-flex; align-items: center; gap: 8px; }
.ftab[aria-selected="true"] { background: var(--tk-accent); border-color: var(--tk-accent); color: #fff; }
.ftab.add { border-style: dashed; color: var(--tk-soft); }
.rbadge { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: rgba(127,127,127,.28); }
.ftab[aria-selected="true"] .rbadge { background: rgba(255,255,255,.28); }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.toolbar .seg button { padding: 8px 10px; font-size: 14px; }
.toolbar .btn { padding: 8px 12px; }
.drawopts { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: flex-end; padding: 10px 12px; margin-bottom: 10px; border: 1px solid var(--tk-line); border-radius: 12px; background: rgba(127,127,127,.06); }
.drawopts .field.fit { min-width: 150px; }
.sizebox { display: grid; gap: 4px; }
.optlabel { font-size: 13px; color: var(--tk-soft); }
.newroomrow { flex: 1 0 100%; }
.seg.off { opacity: .5; }
.seg button[disabled] { cursor: not-allowed; }
.field.sm { width: 100px; }
.times { color: var(--tk-soft); padding-top: 18px; }
.fields2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pts { display: grid; gap: 6px; margin-top: 8px; }
.ptrow { display: grid; grid-template-columns: 22px 1fr 1fr 34px; gap: 6px; align-items: center; }
.ptrow .btn { padding: 6px 0; }
details > summary { cursor: pointer; font-size: 13px; color: var(--tk-soft); }
.card.hl { border-color: var(--tk-accent); box-shadow: 0 0 0 1px var(--tk-accent); }
.faces { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.facecard { display: grid; gap: 4px; justify-items: center; text-align: center; padding: 8px; border-radius: 12px; border: 1px solid var(--tk-line); background: none; color: inherit; }
.facecard svg { width: 100%; max-width: 150px; height: auto; color: var(--primary-text-color, #e8e8e8); }
.facecard[aria-pressed="true"] { border-color: var(--tk-accent); box-shadow: 0 0 0 2px var(--tk-accent); background: color-mix(in srgb, var(--tk-accent) 10%, transparent); }
.drop { display: grid; gap: 4px; padding: 14px; border: 2px dashed var(--tk-line); border-radius: 12px; cursor: pointer; text-align: center; }
.drop:hover { border-color: var(--tk-accent); }
.stepline { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12px; }
.stepline span { padding: 3px 10px; border-radius: 999px; border: 1px solid var(--tk-line); color: var(--tk-soft); }
.stepline span.now { background: var(--tk-accent); border-color: var(--tk-accent); color: #fff; }
.cands { display: grid; gap: 4px; margin-top: 8px; }
.cand { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--tk-line); border-radius: 9px; }
.cand i { width: 12px; height: 12px; border-radius: 50%; flex: none; }
.cand .num { margin-left: auto; }
.link { background: none; border: 0; padding: 0; color: var(--tk-accent); text-decoration: underline; font-size: inherit; }
.roomrow .sub { grid-column: 1 / -1; }
.saved { color: var(--tk-soft); }
@media (max-width: 520px) {
  .drawopts .field.fit { flex: 1 0 100%; }
  .faces { grid-template-columns: 1fr; }
  .toolbar > .seg:first-child { display: flex; width: 100%; }
  .toolbar > .seg:first-child button { flex: 1; padding: 8px 2px; font-size: 13px; }
}
`;


/* ---------------------------------------------------------------- geometry (all values in cm) */
const MIN_SIZE = 10;
const GRID_CM = 10;
const KIND_TEXT = { room: "Raum", carpet: "Teppich", door: "Tür", block: "Sperrzone" };
const TYPE_TEXT = { rect: "Rechteck", ellipse: "Rund", poly: "Vieleck", stroke: "Freihand" };

function newId() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return `s${a[0].toString(36)}${a[1].toString(36)}`.slice(0, 20);
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmtNum = (v, digits) => v.toFixed(digits).replace(".", ",");
function fmtLen(cm) { return cm >= 100 ? `${fmtNum(cm / 100, 2)} m` : `${Math.round(cm)} cm`; }
function fmtArea(cm2) { return `${fmtNum(cm2 / 10000, 1)} m²`; }

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}
function polyCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-6) return [pts[0][0], pts[0][1]];
  return [cx / (3 * a), cy / (3 * a)];
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function strokeLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

function bboxOf(s) {
  if (s.t === "rect" || s.t === "ellipse") return { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h };
  const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
  const pad = s.t === "stroke" ? s.width / 2 : 0;
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
}
function shapeArea(s) {
  if (s.t === "rect") return s.w * s.h;
  if (s.t === "ellipse") return Math.PI * (s.w / 2) * (s.h / 2);
  if (s.t === "poly") return polyArea(s.pts);
  return strokeLength(s.pts) * s.width + Math.PI * (s.width / 2) ** 2;
}
function shapeCenter(s) {
  if (s.t === "rect" || s.t === "ellipse") return [s.x + s.w / 2, s.y + s.h / 2];
  if (s.t === "poly") return polyCentroid(s.pts);
  const mid = s.pts[Math.floor(s.pts.length / 2)];
  return [mid[0], mid[1]];
}
function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInShape(s, x, y, tol = 0) {
  if (s.t === "rect") return x >= s.x - tol && x <= s.x + s.w + tol && y >= s.y - tol && y <= s.y + s.h + tol;
  if (s.t === "ellipse") {
    const rx = s.w / 2 + tol, ry = s.h / 2 + tol;
    return ((x - (s.x + s.w / 2)) / rx) ** 2 + ((y - (s.y + s.h / 2)) / ry) ** 2 <= 1;
  }
  if (s.t === "poly") return pointInPoly(s.pts, x, y) || edgeDistance(s.pts, x, y) <= tol;
  for (let i = 0; i < s.pts.length; i++) {
    const a = s.pts[i], b = s.pts[Math.min(i + 1, s.pts.length - 1)];
    if (distSeg(x, y, a[0], a[1], b[0], b[1]) <= s.width / 2 + tol) return true;
  }
  return false;
}
function edgeDistance(pts, x, y) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    best = Math.min(best, distSeg(x, y, a[0], a[1], b[0], b[1]));
  }
  return best;
}
function translateShape(s, dx, dy) {
  if (s.t === "rect" || s.t === "ellipse") { s.x += dx; s.y += dy; }
  else s.pts = s.pts.map((p) => [p[0] + dx, p[1] + dy]);
}
function cloneShape(s) { return JSON.parse(JSON.stringify(s)); }

/* Ramer-Douglas-Peucker for freehand lines */
function rdp(points, eps) {
  if (points.length < 3) return points;
  const a = points[0], b = points[points.length - 1];
  let idx = -1, best = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distSeg(points[i][0], points[i][1], a[0], a[1], b[0], b[1]);
    if (d > best) { best = d; idx = i; }
  }
  if (best <= eps) return [a, b];
  return [...rdp(points.slice(0, idx + 1), eps).slice(0, -1), ...rdp(points.slice(idx), eps)];
}

/* Colours with transparency for canvas fills */
function rgba(hex, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  const n = m ? parseInt(m[1], 16) : 0x8a8f98;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}


/* ---------------------------------------------------------------- plan view (world coordinates in cm) */
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
}
const K_MIN = 0.01, K_MAX = 4;       // pixels per cm
const ROBOT_R = 17, DOCK_GAP = 25;   // cm: robot radius, robot centre to wall
const SNAP_PX = 9;
const DOOR_LEN = 90, DOOR_THICK = 20;
const RULER_W = 30, RULER_H = 22;    // px: width of the left ruler, height of the top ruler

function shapeEdges(s) {
  if (s.t === "rect") {
    const { x, y, w, h } = s;
    return [[[x, y], [x + w, y]], [[x + w, y], [x + w, y + h]], [[x + w, y + h], [x, y + h]], [[x, y + h], [x, y]]];
  }
  let pts = [];
  if (s.t === "ellipse") {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push([s.x + s.w / 2 + Math.cos(a) * s.w / 2, s.y + s.h / 2 + Math.sin(a) * s.h / 2]);
    }
  } else if (s.t === "poly") pts = s.pts;
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
}

class PlanView {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    Object.assign(this, {
      floor: null, floorId: "", rooms: {}, mode: "view", tool: "select",
      cfg: { kind: "room", t: "rect", room: null, width: 30 },
      sel: null, selRooms: new Set(), lines: [], image: null, imageMeta: null,
      cands: [], scalePts: [], running: false,
      onSelect: null, onEditStart: null, onChange: null, onRoomClick: null, onTarget: null,
      onScale: null, onHint: null, onPolyState: null, canDraw: null, onIdle: null,
    });
    this.view = { x: 0, y: 0, k: 0.5 };
    this._ptrs = new Map(); this._op = null; this._poly = null; this._hover = null; this._guides = {};
    this._fitPending = true; this._phase = 0; this._raf = 0; this._lastTap = null; this._alt = false;
    const cv = this.canvas;
    cv.addEventListener("pointerdown", (e) => this._down(e));
    cv.addEventListener("pointermove", (e) => this._move(e));
    cv.addEventListener("pointerup", (e) => { this._up(e, false); if (!this._op) this.onIdle?.(); });
    cv.addEventListener("pointercancel", (e) => { this._up(e, true); if (!this._op) this.onIdle?.(); });
    cv.addEventListener("pointerleave", () => { if (this._hover) { this._hover = null; this.draw(); } });
    cv.addEventListener("wheel", (e) => this._wheel(e), { passive: false });
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    new ResizeObserver(() => this.draw()).observe(cv);
  }

  /* ---- coordinates */
  _sw(sx, sy) { return [sx / this.view.k + this.view.x, sy / this.view.k + this.view.y]; }
  _s(x, y) { return [(x - this.view.x) * this.view.k, (y - this.view.y) * this.view.k]; }
  _local(e) { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  contentBox(withImage) {
    let b = null;
    const add = (x0, y0, x1, y1) => {
      b = b ? { x0: Math.min(b.x0, x0), y0: Math.min(b.y0, y0), x1: Math.max(b.x1, x1), y1: Math.max(b.y1, y1) } : { x0, y0, x1, y1 };
    };
    for (const s of this.floor?.shapes || []) { const q = bboxOf(s); add(q.x0, q.y0, q.x1, q.y1); }
    const d = this.floor?.dock;
    if (d) add(d.x - 40, d.y - 40, d.x + 40, d.y + 40);
    if (withImage && this.image && this.imageMeta) {
      const m = this.imageMeta, wc = m.width_m * 100;
      add(m.x_m * 100, m.y_m * 100, m.x_m * 100 + wc, m.y_m * 100 + (wc * this.image.naturalHeight) / this.image.naturalWidth);
    }
    return b;
  }

  fit() { this._fitPending = true; this.draw(); }
  _fitNow(W, H) {
    const pad = 36;
    const b = this.contentBox(this.mode === "edit") || { x0: 0, y0: 0, x1: 800, y1: 600 };
    const bw = Math.max(b.x1 - b.x0, 100), bh = Math.max(b.y1 - b.y0, 100);
    const k = clamp(Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh), K_MIN, 1.2);
    this.view = { k, x: (b.x0 + b.x1) / 2 - W / (2 * k), y: (b.y0 + b.y1) / 2 - H / (2 * k) };
  }
  zoomAt(sx, sy, f) {
    const v = this.view, [wx, wy] = this._sw(sx, sy), k = clamp(v.k * f, K_MIN, K_MAX);
    v.k = k; v.x = wx - sx / k; v.y = wy - sy / k; this._fitPending = false; this.draw();
  }
  zoomBy(f) { this.zoomAt(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2, f); }
  _wheel(e) {
    if (this.mode === "view" && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const [sx, sy] = this._local(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    this.zoomAt(sx, sy, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
  }

  /* ---- paths */
  _path(s) {
    const p = new Path2D();
    if (s.t === "rect") p.rect(s.x, s.y, s.w, s.h);
    else if (s.t === "ellipse") p.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
    else {
      s.pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
      if (s.pts.length === 1) p.lineTo(s.pts[0][0] + 0.01, s.pts[0][1]);
      if (s.t === "poly") p.closePath();
    }
    return p;
  }
  _paint(c, s, path, fill) {
    if (s.t === "stroke") { c.lineWidth = s.width; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = fill; c.stroke(path); }
    else { c.fillStyle = fill; c.fill(path); }
  }
  _hatch(c, s, path, W, H, dpr, color, both) {
    const q = bboxOf(s);
    let [ax, ay] = this._s(q.x0, q.y0), [bx, by] = this._s(q.x1, q.y1);
    ax = Math.max(0, ax); ay = Math.max(0, ay); bx = Math.min(W, bx); by = Math.min(H, by);
    if (bx <= ax || by <= ay) return;
    c.save(); c.clip(path); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.strokeStyle = color; c.lineWidth = 1.2; c.beginPath();
    const sp = 11;
    for (let t = Math.floor((ax + ay) / sp) * sp; t < bx + by; t += sp) { c.moveTo(t - by, by); c.lineTo(t - ay, ay); }
    if (both) for (let t = Math.floor((ax - by) / sp) * sp; t < bx - ay; t += sp) { c.moveTo(t + ay, ay); c.lineTo(t + by, by); }
    c.stroke(); c.restore();
  }

  /* ---- drawing */
  draw() {
    const cv = this.canvas, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    cv.style.touchAction = this.mode === "edit" ? "none" : "pan-y";
    if (this._fitPending) { this._fitPending = false; this._fitNow(W, H); }
    const c = this.ctx, v = this.view, k = v.k;
    const cs = getComputedStyle(cv);
    const ink = cs.color || "#ddd";
    const accent = cs.getPropertyValue("--tk-accent").trim() || "#03a9f4";
    const edit = this.mode === "edit";
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (edit) this._grid(c, W, H, ink);

    c.setTransform(dpr * k, 0, 0, dpr * k, -v.x * k * dpr, -v.y * k * dpr);
    if (this.image && this.imageMeta && edit) {
      const m = this.imageMeta, wc = m.width_m * 100;
      c.globalAlpha = m.opacity;
      c.drawImage(this.image, m.x_m * 100, m.y_m * 100, wc, (wc * this.image.naturalHeight) / this.image.naturalWidth);
      c.globalAlpha = 1;
    }
    const fl = this.floor, shapes = fl ? fl.shapes : [];
    const paths = new Map(shapes.map((s) => [s.id, this._path(s)]));
    const selShape = this.sel && this.sel !== "dock" ? shapes.find((s) => s.id === this.sel) : null;
    const selRoom = selShape?.kind === "room" ? selShape.room : null;
    const roomShapes = shapes.filter((s) => s.kind === "room");

    for (const s of roomShapes) {
      let a = 0.6;
      if (edit) a = selRoom === s.room ? 0.78 : 0.55;
      else if (this.selRooms.size) a = this.selRooms.has(s.room) ? 0.92 : 0.34;
      c.globalAlpha = a;
      this._paint(c, s, paths.get(s.id), this.rooms[s.room]?.color || "#8a8f98");
    }
    c.globalAlpha = 1;
    for (const s of shapes) {
      if (s.kind === "carpet") {
        c.globalAlpha = 0.5; this._paint(c, s, paths.get(s.id), "#b07e46"); c.globalAlpha = 1;
        if (s.t !== "stroke") this._hatch(c, s, paths.get(s.id), W, H, dpr, "rgba(255,255,255,.6)", false);
      } else if (s.kind === "block") {
        c.globalAlpha = 0.4; this._paint(c, s, paths.get(s.id), "#e5534b"); c.globalAlpha = 1;
        if (s.t !== "stroke") this._hatch(c, s, paths.get(s.id), W, H, dpr, "rgba(229,83,75,.9)", true);
      }
    }
    // walls
    const walls = fl ? fl.walls : true;
    c.lineJoin = "round"; c.strokeStyle = ink; c.globalAlpha = walls ? 0.85 : 0.45;
    c.lineWidth = walls ? Math.max(6, 2.4 / k) : Math.max(2, 1.4 / k);
    for (const s of roomShapes) if (s.t !== "stroke") c.stroke(paths.get(s.id));
    c.globalAlpha = 1;
    // doors
    for (const s of shapes) {
      if (s.kind !== "door") continue;
      c.globalAlpha = 0.95; this._paint(c, s, paths.get(s.id), "#f2a33a"); c.globalAlpha = 1;
      c.lineWidth = Math.max(1, 1.2 / k); c.strokeStyle = "rgba(0,0,0,.55)"; c.stroke(paths.get(s.id));
    }
    // selection outline
    if (edit && selShape) {
      c.strokeStyle = accent; c.lineWidth = 2.5 / k; c.setLineDash([7 / k, 4 / k]);
      c.stroke(paths.get(selShape.id)); c.setLineDash([]);
    }
    // candidates from the image
    this.cands.forEach((cd, i) => {
      const p = this._path(cd.shape);
      c.globalAlpha = cd.on ? 0.5 : 0.12; c.fillStyle = cd.color; c.fill(p); c.globalAlpha = 1;
      c.strokeStyle = cd.color; c.lineWidth = 2.5 / k; c.setLineDash([8 / k, 5 / k]); c.stroke(p); c.setLineDash([]);
    });
    // shape being created
    const op = this._op;
    if (op?.k === "create") {
      const prev = this._createShape(op);
      if (prev) {
        c.globalAlpha = 0.4; this._paint(c, prev, this._path(prev), this._cfgColor()); c.globalAlpha = 1;
        c.strokeStyle = "#fff"; c.lineWidth = 2 / k; c.setLineDash([6 / k, 4 / k]); c.stroke(this._path(prev)); c.setLineDash([]);
      }
    }
    if (op?.k === "stroke" && op.pts.length) {
      c.globalAlpha = 0.45; this._paint(c, { t: "stroke", pts: op.pts, width: this.cfg.width }, this._path({ t: "stroke", pts: op.pts }), this._cfgColor()); c.globalAlpha = 1;
    }
    // routes
    for (const ln of this.lines) {
      if (!ln.pts || ln.pts.length < 2) continue;
      c.strokeStyle = ln.color; c.lineWidth = Math.max(2.5 / k, 5); c.lineJoin = "round"; c.lineCap = "round";
      c.setLineDash(ln.dashed ? [14 / k, 9 / k] : []); c.lineDashOffset = -this._phase / k;
      c.beginPath(); ln.pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); c.setLineDash([]);
      const e = ln.pts[ln.pts.length - 1];
      c.fillStyle = ln.color; c.beginPath(); c.arc(e[0], e[1], Math.max(4 / k, 7), 0, 7); c.fill();
    }

    // ---- screen space
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._labels(c, roomShapes);
    if (edit) this._targets(c);
    if (fl?.dock) this._drawDock(c, fl.dock, accent);
    if (edit) this._overlays(c, shapes, selShape, accent, W, H);
    this._guideLines(c, W, H);
    this._rulers(c, W, H, ink, cs.getPropertyValue("--tk-card").trim() || "#1c1c1c");
    this._scaleBar(c, W, H, ink);
  }

  _cfgColor() {
    if (this.cfg.kind === "room") return this.rooms[this.cfg.room]?.color || "#8a8f98";
    return { carpet: "#b07e46", block: "#e5534b", door: "#f2a33a" }[this.cfg.kind] || "#8a8f98";
  }

  _grid(c, W, H, ink) {
    const k = this.view.k, steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const gs = steps.find((s) => s * k >= 16) || 5000;
    const [x0, y0] = this._sw(0, 0), [x1, y1] = this._sw(W, H);
    c.lineWidth = 1;
    for (const pass of [0, 1]) {
      c.strokeStyle = ink; c.globalAlpha = pass ? 0.16 : 0.07; c.beginPath();
      for (let x = Math.ceil(x0 / gs) * gs; x <= x1; x += gs) {
        if ((x % (gs * 5) === 0) !== !!pass) continue;
        const sx = Math.round((x - this.view.x) * k) + 0.5; c.moveTo(sx, 0); c.lineTo(sx, H);
      }
      for (let y = Math.ceil(y0 / gs) * gs; y <= y1; y += gs) {
        if ((y % (gs * 5) === 0) !== !!pass) continue;
        const sy = Math.round((y - this.view.y) * k) + 0.5; c.moveTo(0, sy); c.lineTo(W, sy);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  _tag(c, text, sx, sy, align = "center") {
    c.font = "600 11px Roboto, system-ui, sans-serif";
    const w = c.measureText(text).width + 10;
    const x = align === "left" ? sx : align === "right" ? sx - w : sx - w / 2;
    c.fillStyle = "rgba(20,24,32,.88)"; c.beginPath(); c.roundRect(x, sy - 9, w, 18, 6); c.fill();
    c.fillStyle = "#fff"; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(text, x + 5, sy + 0.5);
  }

  _labels(c, roomShapes) {
    const byRoom = new Map();
    for (const s of roomShapes) {
      const e = byRoom.get(s.room) || { total: 0, big: null };
      const a = shapeArea(s); e.total += a;
      if (!e.big || a > shapeArea(e.big)) e.big = s;
      byRoom.set(s.room, e);
    }
    const k = this.view.k;
    c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
    byRoom.forEach((e, id) => {
      const r = this.rooms[id]; if (!r) return;
      const b = bboxOf(e.big), sw = (b.x1 - b.x0) * k, sh = (b.y1 - b.y0) * k;
      if (Math.min(sw, sh) < 34) return;
      const [sx, sy] = this._s(...shapeCenter(e.big));
      let size = 14;
      c.font = `700 ${size}px Roboto, system-ui, sans-serif`;
      const tw = c.measureText(r.name).width;
      if (tw > sw * 0.92) size = Math.max(9, Math.floor((size * sw * 0.92) / tw));
      if (size < 10 && tw > sw * 0.92) return;
      c.font = `700 ${size}px Roboto, system-ui, sans-serif`;
      c.lineWidth = 4; c.strokeStyle = "rgba(0,0,0,.6)"; c.fillStyle = "#fff";
      const showArea = sh > 52;
      const ny = showArea ? sy - size * 0.55 : sy;
      c.strokeText(r.name, sx, ny); c.fillText(r.name, sx, ny);
      if (showArea) {
        c.font = `500 ${Math.max(9, size - 2)}px Roboto, system-ui, sans-serif`;
        const t = fmtArea(e.total), y2 = sy + size * 0.75;
        c.strokeText(t, sx, y2); c.fillText(t, sx, y2);
      }
    });
  }

  _targets(c) {
    for (const [id, r] of Object.entries(this.rooms)) {
      if (!r.target || r.floor !== this.floorId) continue;
      const [tx, ty] = this._s(r.target[0], r.target[1]), rr = 8;
      c.strokeStyle = "#fff"; c.lineWidth = 3; c.beginPath(); c.arc(tx, ty, rr, 0, 7); c.stroke();
      c.strokeStyle = r.color; c.lineWidth = 1.6; c.beginPath(); c.arc(tx, ty, rr, 0, 7);
      c.moveTo(tx - rr - 4, ty); c.lineTo(tx + rr + 4, ty); c.moveTo(tx, ty - rr - 4); c.lineTo(tx, ty + rr + 4); c.stroke();
    }
  }

  _drawDock(c, d, accent) {
    const [sx, sy] = this._s(d.x, d.y);
    const u = Math.max(this.view.k, 0.4), h = (d.heading * Math.PI) / 180;
    c.save(); c.translate(sx, sy); c.rotate(h); c.translate(-DOCK_GAP * u, 0);   // x = 0 is the wall, +x points into the room
    // station body
    c.fillStyle = "#1f2430"; c.strokeStyle = "#fff"; c.lineWidth = 1.6;
    c.beginPath(); c.roundRect(-2 * u, -20 * u, 10 * u, 40 * u, 3 * u); c.fill(); c.stroke();
    c.fillStyle = "#3fd08f"; c.beginPath();
    const b = u * 0.9;
    [[3, -9], [-1, 1], [2.4, 1], [1.2, 10], [6.4, -2], [3, -2], [4.6, -9]].forEach(([px, py], i) => (i ? c.lineTo(px * b + u, py * b) : c.moveTo(px * b + u, py * b)));
    c.closePath(); c.fill();
    // robot
    c.translate(DOCK_GAP * u, 0);
    const R = ROBOT_R * u, front = d.facing === "out" ? 0 : Math.PI;
    c.fillStyle = "#3b4254"; c.strokeStyle = "#fff"; c.lineWidth = 1.8;
    c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill(); c.stroke();
    c.strokeStyle = "#ffd54f"; c.lineWidth = Math.max(3, R * 0.28); c.lineCap = "round";
    c.beginPath(); c.arc(0, 0, R * 0.86, front - 0.75, front + 0.75); c.stroke();
    c.fillStyle = "#fff"; c.beginPath();
    const fx = Math.cos(front), fy = Math.sin(front);
    c.moveTo(fx * R * 0.5, fy * R * 0.5);
    c.lineTo(fx * R * 0.05 - fy * R * 0.3, fy * R * 0.05 + fx * R * 0.3);
    c.lineTo(fx * R * 0.05 + fy * R * 0.3, fy * R * 0.05 - fx * R * 0.3);
    c.closePath(); c.fill();
    c.restore();
    if (this.sel === "dock" && this.mode === "edit") {
      c.strokeStyle = accent; c.lineWidth = 2.5; c.setLineDash([6, 4]); c.beginPath(); c.arc(sx, sy, ROBOT_R * u + 12, 0, 7); c.stroke(); c.setLineDash([]);
    }
  }

  _handles(s) {
    const out = [];
    if (s.t === "rect" || s.t === "ellipse") {
      const x0 = s.x, x1 = s.x + s.w, y0 = s.y, y1 = s.y + s.h, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
      [["nw", x0, y0], ["n", xm, y0], ["ne", x1, y0], ["e", x1, ym], ["se", x1, y1], ["s", xm, y1], ["sw", x0, y1], ["w", x0, ym]]
        .forEach(([id, x, y]) => out.push({ id, x, y }));
    } else if (s.t === "poly") {
      s.pts.forEach((p, i) => out.push({ id: `v${i}`, x: p[0], y: p[1] }));
      s.pts.forEach((p, i) => { const q = s.pts[(i + 1) % s.pts.length]; out.push({ id: `m${i}`, x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2, mid: true }); });
    }
    return out;
  }

  _overlays(c, shapes, selShape, accent, W, H) {
    const op = this._op;
    if (selShape && !(op && ["create", "stroke"].includes(op.k))) {
      if (selShape.t === "rect" || selShape.t === "ellipse") this._dims(c, selShape);
      else if (selShape.t === "poly") this._edgeDims(c, selShape.pts, true);
      for (const hd of this._handles(selShape)) {
        const [hx, hy] = this._s(hd.x, hd.y), r = hd.mid ? 3.5 : 5;
        c.fillStyle = hd.mid ? accent : "#fff"; c.strokeStyle = accent; c.lineWidth = 2;
        c.beginPath(); if (hd.mid) c.arc(hx, hy, r, 0, 7); else c.rect(hx - r, hy - r, r * 2, r * 2); c.fill(); c.stroke();
      }
    }
    if (op?.k === "create") {
      const s = this._createShape(op);
      if (s) this._dims(c, s);
    }
    if (this._poly) {
      const pts = this._poly.pts;
      const live = this._hover ? [...pts, this._hover] : pts;
      c.strokeStyle = "#fff"; c.lineWidth = 2.5; c.setLineDash([6, 4]); c.beginPath();
      live.forEach((p, i) => { const [x, y] = this._s(p[0], p[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.setLineDash([]);
      pts.forEach((p, i) => {
        const [x, y] = this._s(p[0], p[1]);
        c.fillStyle = i === 0 ? accent : "#fff"; c.strokeStyle = "#000"; c.lineWidth = 1;
        c.beginPath(); c.arc(x, y, i === 0 ? 6 : 4, 0, 7); c.fill(); c.stroke();
      });
      this._edgeDims(c, live, false);
    }
    if (this.scalePts.length) {
      c.strokeStyle = "#ff4fa3"; c.fillStyle = "#ff4fa3"; c.lineWidth = 2;
      const pts = this.scalePts.length === 1 && this._hover ? [this.scalePts[0], this._hover] : this.scalePts;
      c.beginPath(); pts.forEach((p, i) => { const [x, y] = this._s(p[0], p[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
      this.scalePts.forEach((p) => { const [x, y] = this._s(p[0], p[1]); c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); });
    }
    this.cands.forEach((cd, i) => {
      const [x, y] = this._s(...shapeCenter(cd.shape));
      c.fillStyle = cd.on ? cd.color : "rgba(120,120,120,.8)"; c.beginPath(); c.arc(x, y, 11, 0, 7); c.fill();
      c.fillStyle = "#fff"; c.font = "700 12px Roboto, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(i + 1), x, y + 0.5);
    });
  }

  _dims(c, s) {
    const [tx, ty] = this._s(s.x + s.w / 2, s.y), [rx, ry] = this._s(s.x + s.w, s.y + s.h / 2);
    this._tag(c, fmtLen(s.w), tx, ty - 16);
    this._tag(c, fmtLen(s.h), rx + 12, ry, "left");
  }
  _edgeDims(c, pts, closed) {
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l * this.view.k < 46) continue;
      const [x, y] = this._s((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      this._tag(c, fmtLen(l), x, y);
    }
  }

  _guideLines(c, W, H) {
    const g = this._guides;
    if (g.x == null && g.y == null) return;
    c.strokeStyle = "#19d3da"; c.lineWidth = 1; c.setLineDash([5, 4]); c.beginPath();
    if (g.x != null) { const [x] = this._s(g.x, 0); c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, H); }
    if (g.y != null) { const [, y] = this._s(0, g.y); c.moveTo(0, Math.round(y) + 0.5); c.lineTo(W, Math.round(y) + 0.5); }
    c.stroke(); c.setLineDash([]);
  }

  /* rulers on the left and on top: plan coordinates in cm (below 1 m steps) or m */
  _rulers(c, W, H, ink, bg) {
    const v = this.view, k = v.k;
    const major = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((l) => l * k >= 64) || 5000;
    const per = String(major)[0] === "2" ? 4 : 5, minor = major / per;
    const inM = major >= 100;
    const text = (val) => String(inM ? val / 100 : val);
    const [x0, y0] = this._sw(0, 0), [x1, y1] = this._sw(W, H);
    c.save();
    c.globalAlpha = 0.95; c.fillStyle = bg;
    c.fillRect(0, 0, W, RULER_H); c.fillRect(0, 0, RULER_W, H);
    c.globalAlpha = 1; c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 1;
    c.font = "600 10px Roboto, system-ui, sans-serif";
    // top ruler (x)
    c.beginPath();
    for (let n = Math.ceil(x0 / minor); n * minor <= x1; n++) {
      const sx = Math.round((n * minor - v.x) * k) + 0.5;
      if (sx < RULER_W) continue;
      const big = n % per === 0;
      c.globalAlpha = big ? 0.8 : 0.4;
      c.moveTo(sx, RULER_H); c.lineTo(sx, RULER_H - (big ? 9 : 4));
    }
    c.stroke();
    c.globalAlpha = 0.85; c.textAlign = "left"; c.textBaseline = "top";
    for (let n = Math.ceil(x0 / major); n * major <= x1; n++) {
      const sx = (n * major - v.x) * k;
      if (sx >= RULER_W) c.fillText(text(n * major), Math.round(sx) + 3, 3);
    }
    // left ruler (y), labels read from bottom to top
    c.beginPath();
    for (let n = Math.ceil(y0 / minor); n * minor <= y1; n++) {
      const sy = Math.round((n * minor - v.y) * k) + 0.5;
      if (sy < RULER_H) continue;
      const big = n % per === 0;
      c.globalAlpha = big ? 0.8 : 0.4;
      c.moveTo(RULER_W, sy); c.lineTo(RULER_W - (big ? 9 : 4), sy);
    }
    c.stroke();
    c.globalAlpha = 0.85;
    for (let n = Math.ceil(y0 / major); n * major <= y1; n++) {
      const sy = (n * major - v.y) * k;
      if (sy < RULER_H) continue;
      c.save(); c.translate(3, Math.round(sy) - 3); c.rotate(-Math.PI / 2); c.fillText(text(n * major), 0, 0); c.restore();
    }
    // frame and corner (shows the unit of the labels)
    c.globalAlpha = 0.35; c.beginPath();
    c.moveTo(0, RULER_H + 0.5); c.lineTo(W, RULER_H + 0.5); c.moveTo(RULER_W + 0.5, 0); c.lineTo(RULER_W + 0.5, H); c.stroke();
    c.globalAlpha = 1; c.fillStyle = bg; c.fillRect(0, 0, RULER_W, RULER_H);
    c.fillStyle = ink; c.globalAlpha = 0.9; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(inM ? "m" : "cm", RULER_W / 2, RULER_H / 2 + 0.5);
    c.restore();
  }

  _scaleBar(c, W, H, ink) {
    const k = this.view.k;
    const L = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((l) => l * k >= 56) || 5000;
    const w = L * k, x = RULER_W + 12, y = H - 14;
    c.globalAlpha = 0.85; c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y - 4); c.stroke();
    c.font = "600 11px Roboto, system-ui, sans-serif"; c.textAlign = "left"; c.textBaseline = "bottom";
    c.fillText(fmtLen(L), x + 2, y - 5); c.globalAlpha = 1;
  }

  /* ---- animation of the running route */
  start() {
    if (this._raf) return;
    const tick = () => {
      if (this.running && !this._op && this.lines.length) { this._phase = (this._phase + 0.7) % 1000; this.draw(); }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  stop() { cancelAnimationFrame(this._raf); this._raf = 0; }

  /* ---- hit testing */
  _hit(x, y) {
    const tol = 5 / this.view.k, shapes = this.floor?.shapes || [];
    for (const kind of ["door", "block", "carpet", "room"]) {
      const list = shapes.filter((s) => s.kind === kind).sort((a, b) => shapeArea(a) - shapeArea(b));
      for (const s of list) if (pointInShape(s, x, y, tol)) return s;
    }
    return null;
  }
  _handleAt(sx, sy, touch) {
    const s = this.sel && this.sel !== "dock" ? this.floor?.shapes.find((q) => q.id === this.sel) : null;
    if (!s) return null;
    const reach = touch ? 16 : 11;
    let best = null, bd = reach;
    for (const hd of this._handles(s)) {
      const [hx, hy] = this._s(hd.x, hd.y), d = Math.hypot(hx - sx, hy - sy);
      if (d <= bd) { best = hd; bd = d; }
    }
    return best;
  }
  _dockAt(x, y) {
    const d = this.floor?.dock;
    return !!d && Math.hypot(x - d.x, y - d.y) <= Math.max(ROBOT_R + 6, 14 / this.view.k);
  }

  /* ---- snapping */
  _snapSet(skipId) {
    const xs = new Set(), ys = new Set();
    for (const s of this.floor?.shapes || []) {
      if (s.id === skipId) continue;
      const b = bboxOf(s);
      xs.add(Math.round(b.x0)); xs.add(Math.round(b.x1)); ys.add(Math.round(b.y0)); ys.add(Math.round(b.y1));
      if (s.t === "poly") s.pts.forEach((p) => { xs.add(p[0]); ys.add(p[1]); });
    }
    for (const p of this._poly?.pts || []) { xs.add(p[0]); ys.add(p[1]); }
    return { xs: [...xs], ys: [...ys] };
  }
  _snapAxis(vals, cands, grid) {
    const thr = SNAP_PX / this.view.k;
    let best = null;
    for (const v of vals) for (const cnd of cands) {
      const d = cnd - v;
      if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, guide: cnd };
    }
    if (best) return best;
    if (grid) return { d: Math.round(vals[0] / GRID_CM) * GRID_CM - vals[0], guide: null };
    return { d: 0, guide: null };
  }
  _snapPoint(x, y, set) {
    if (this._alt) { this._guides = {}; return [x, y]; }
    const sx = this._snapAxis([x], set.xs, true), sy = this._snapAxis([y], set.ys, true);
    this._guides = { x: sx.guide, y: sy.guide };
    return [x + sx.d, y + sy.d];
  }

  /* ---- creating shapes */
  _createShape(op) {
    const x0 = Math.min(op.x0, op.x1), y0 = Math.min(op.y0, op.y1);
    const w = Math.abs(op.x1 - op.x0), h = Math.abs(op.y1 - op.y0);
    if (w < 5 && h < 5) return null;
    const s = { id: "tmp", kind: this.cfg.kind, t: this.cfg.t === "ellipse" && this.cfg.kind !== "door" ? "ellipse" : "rect", x: x0, y: y0, w: Math.max(w, MIN_SIZE), h: Math.max(h, MIN_SIZE) };
    if (s.kind === "room") s.room = this.cfg.room;
    return s;
  }
  addShape(s) {
    if (!this.floor) return;
    this.onEditStart?.();
    this.floor.shapes.push(s);
    this.sel = s.id; this.onSelect?.(s); this.onChange?.("create"); this.draw();
  }
  _blocked() {
    const msg = this.canDraw?.();
    if (msg) { this.onHint?.(msg); return true; }
    return false;
  }
  _newShape(extra) {
    const s = { id: newId(), kind: this.cfg.kind, ...extra };
    if (s.kind === "room") s.room = this.cfg.room;
    return s;
  }
  autoDoor(x, y) {
    let best = null;
    for (const s of this.floor?.shapes || []) {
      if (s.kind !== "room") continue;
      for (const [a, b] of shapeEdges(s)) {
        const d = distSeg(x, y, a[0], a[1], b[0], b[1]);
        if (!best || d < best.d) best = { d, a, b };
      }
    }
    if (!best || best.d > 90) return { x: Math.round(x - DOOR_LEN / 2), y: Math.round(y - DOOR_THICK / 2), w: DOOR_LEN, h: DOOR_THICK };
    const dx = best.b[0] - best.a[0], dy = best.b[1] - best.a[1], l2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - best.a[0]) * dx + (y - best.a[1]) * dy) / l2, 0, 1);
    const px = best.a[0] + t * dx, py = best.a[1] + t * dy;
    return Math.abs(dx) >= Math.abs(dy)
      ? { x: Math.round(px - DOOR_LEN / 2), y: Math.round(py - DOOR_THICK / 2), w: DOOR_LEN, h: DOOR_THICK }
      : { x: Math.round(px - DOOR_THICK / 2), y: Math.round(py - DOOR_LEN / 2), w: DOOR_THICK, h: DOOR_LEN };
  }

  /* polygon being drawn */
  _polyAdd(x, y) {
    if (this._blocked()) return;
    const pts = (this._poly ||= { pts: [] }).pts;
    const set = this._snapSet(null);
    const [px, py] = this._snapPoint(x, y, set);
    const first = pts[0];
    if (first && pts.length >= 3) {
      const [fx, fy] = this._s(first[0], first[1]), [qx, qy] = this._s(px, py);
      if (Math.hypot(fx - qx, fy - qy) < 12) { this.finishPoly(); return; }
    }
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last[0] - px, last[1] - py) < 3) { if (pts.length >= 3) this.finishPoly(); return; }
    pts.push([Math.round(px), Math.round(py)]);
    this.onPolyState?.(pts.length); this.draw();
  }
  polyCount() { return this._poly ? this._poly.pts.length : 0; }
  finishPoly() {
    const p = this._poly;
    if (!p || p.pts.length < 3) { this.onHint?.("Ein Vieleck braucht mindestens drei Ecken."); return; }
    this._poly = null; this._guides = {};
    const s = this._newShape({ t: "poly", pts: p.pts });
    this.onPolyState?.(0); this.addShape(s);
  }
  cancelPoly() { if (this._poly) { this._poly = null; this._guides = {}; this.onPolyState?.(0); this.draw(); } }
  undoPolyPoint() {
    if (!this._poly) return;
    this._poly.pts.pop();
    if (!this._poly.pts.length) this._poly = null;
    this.onPolyState?.(this.polyCount()); this.draw();
  }

  /* station: find the nearest wall and turn the station away from it */
  placeDock(x, y) {
    const prev = this.floor?.dock;
    const inside = (px, py) => (this.floor?.shapes || []).some((s) => s.kind === "room" && pointInShape(s, px, py));
    const res = { x: Math.round(x), y: Math.round(y), heading: prev?.heading ?? 0, facing: prev?.facing ?? "in" };
    if (!inside(x, y)) return res;
    let best = null;
    for (const [dx, dy, ang] of [[1, 0, 0], [0, 1, 90], [-1, 0, 180], [0, -1, -90]]) {
      for (let t = 5; t <= 220; t += 5) {
        if (inside(x + dx * t, y + dy * t)) continue;
        let lo = t - 5, hi = t;
        for (let i = 0; i < 4; i++) { const m = (lo + hi) / 2; inside(x + dx * m, y + dy * m) ? (lo = m) : (hi = m); }
        if (!best || hi < best.d) best = { d: hi, dx, dy, ang };
        break;
      }
    }
    if (!best) return res;
    let heading = best.ang + 180; if (heading > 180) heading -= 360;
    res.heading = heading;
    res.x = Math.round(x + best.dx * (best.d - DOCK_GAP));
    res.y = Math.round(y + best.dy * (best.d - DOCK_GAP));
    return res;
  }

  /* ---- pointer handling */
  _down(e) {
    if (!this.floor || (e.pointerType === "mouse" && e.button > 2)) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    const [sx, sy] = this._local(e);
    this._ptrs.set(e.pointerId, { sx, sy });
    this._alt = e.altKey;
    if (this._ptrs.size === 2) {
      const [a, b] = [...this._ptrs.values()], mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
      this._op = { k: "pinch", d0: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, w0: this._sw(mx, my), k0: this.view.k };
      return;
    }
    if (this._ptrs.size > 2) return;
    const [x, y] = this._sw(sx, sy), touch = e.pointerType !== "mouse";
    const pan = { k: "pan", sx, sy, vx: this.view.x, vy: this.view.y, moved: false, t: performance.now() };
    if (e.button === 1 || e.button === 2) { this._op = pan; return; }
    if (sx < RULER_W || sy < RULER_H) { this._op = pan; return; }   // the rulers only pan
    const edit = this.mode === "edit";
    const tool = edit ? this.tool : "view";
    if (tool === "select") {
      const hd = this._handleAt(sx, sy, touch);
      const s = hd && this.floor.shapes.find((q) => q.id === this.sel);
      if (hd && s) {
        if (hd.mid) {
          const i = Number(hd.id.slice(1));
          this.onEditStart?.();
          s.pts.splice(i + 1, 0, [Math.round(hd.x), Math.round(hd.y)]);
          this._op = { k: "vertex", i: i + 1, started: true, sx, sy };
        } else if (hd.id[0] === "v") this._op = { k: "vertex", i: Number(hd.id.slice(1)), started: false, sx, sy };
        else this._op = { k: "resize", id: hd.id, orig: cloneShape(s), set: this._snapSet(s.id), started: false, sx, sy };
        return;
      }
      if (this._dockAt(x, y)) {
        this.sel = "dock"; this.onSelect?.("dock");
        this._op = { k: "dock", started: false, sx, sy }; this.draw(); return;
      }
      const hit = this._hit(x, y);
      if (hit) {
        this.sel = hit.id; this.onSelect?.(hit);
        this._op = { k: "move", orig: cloneShape(hit), x0: x, y0: y, set: this._snapSet(hit.id), started: false, sx, sy };
        this.draw(); return;
      }
      this._op = { ...pan, tap: "deselect" };
    } else if (tool === "draw") {
      if (this.cfg.t === "poly" && this.cfg.kind !== "door") this._op = { ...pan, tap: "poly" };
      else if (this.cfg.t === "stroke" && this.cfg.kind !== "door") {
        if (this._blocked()) { this._op = pan; return; }
        this._op = { k: "stroke", pts: [[x, y]], sx, sy };
      } else {
        if (this._blocked()) { this._op = pan; return; }
        const set = this._snapSet(null), [px, py] = this._snapPoint(x, y, set);
        this._op = { k: "create", x0: px, y0: py, x1: px, y1: py, set, sx, sy, rx: x, ry: y };
      }
    } else if (tool === "dock") {
      this._op = { k: "dockplace", started: false, sx, sy };
      this.onEditStart?.(); this.floor.dock = this.placeDock(x, y); this.sel = "dock"; this.onSelect?.("dock"); this.draw();
    } else if (tool === "target") this._op = { ...pan, tap: "target" };
    else if (tool === "scale") this._op = { ...pan, tap: "scale" };
    else this._op = { ...pan, tap: "view" };
  }

  _move(e) {
    const [sx, sy] = this._local(e);
    this._alt = e.altKey;
    if (this._ptrs.has(e.pointerId)) this._ptrs.set(e.pointerId, { sx, sy });
    const op = this._op, [x, y] = this._sw(sx, sy);
    if (!op) {
      if (this._poly || this.scalePts.length === 1) {
        const set = this._poly ? this._snapSet(null) : { xs: [], ys: [] };
        this._hover = this._poly ? this._snapPoint(x, y, set) : [x, y]; this.draw();
      } else if (this.mode === "edit") this._cursor(sx, sy, x, y, e.pointerType !== "mouse");
      return;
    }
    const k = this.view.k;
    switch (op.k) {
      case "pinch": {
        if (this._ptrs.size < 2) return;
        const [a, b] = [...this._ptrs.values()], mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
        const nk = clamp((op.k0 * Math.hypot(a.sx - b.sx, a.sy - b.sy)) / op.d0, K_MIN, K_MAX);
        this.view = { k: nk, x: op.w0[0] - mx / nk, y: op.w0[1] - my / nk };
        this._fitPending = false; this.draw(); return;
      }
      case "pan":
        if (!op.moved && Math.hypot(sx - op.sx, sy - op.sy) > 6) op.moved = true;
        if (op.moved) { this.view.x = op.vx - (sx - op.sx) / k; this.view.y = op.vy - (sy - op.sy) / k; this._fitPending = false; this.draw(); }
        else if (this._poly) { this._hover = this._snapPoint(x, y, this._snapSet(null)); this.draw(); }
        return;
      case "create": {
        const [px, py] = this._snapPoint(x, y, op.set);
        op.x1 = px; op.y1 = py; this.draw(); return;
      }
      case "stroke": {
        const l = op.pts[op.pts.length - 1];
        if (Math.hypot(x - l[0], y - l[1]) * k >= 4) { op.pts.push([x, y]); this.draw(); }
        return;
      }
      case "move": {
        if (!op.started) { if (Math.hypot(sx - op.sx, sy - op.sy) < 4) return; op.started = true; this.onEditStart?.(); }
        const s = this.floor.shapes.find((q) => q.id === this.sel); if (!s) return;
        let dx = x - op.x0, dy = y - op.y0;
        const b = bboxOf(op.orig);
        if (!this._alt) {
          const ax = this._snapAxis([b.x0 + dx, b.x1 + dx], op.set.xs, false), ay = this._snapAxis([b.y0 + dy, b.y1 + dy], op.set.ys, false);
          let gx = ax.guide, gy = ay.guide;
          if (gx == null) { dx += Math.round((b.x0 + dx) / GRID_CM) * GRID_CM - (b.x0 + dx); } else dx += ax.d;
          if (gy == null) { dy += Math.round((b.y0 + dy) / GRID_CM) * GRID_CM - (b.y0 + dy); } else dy += ay.d;
          this._guides = { x: gx, y: gy };
        } else this._guides = {};
        dx = Math.round(dx); dy = Math.round(dy);
        if (s.t === "rect" || s.t === "ellipse") { s.x = op.orig.x + dx; s.y = op.orig.y + dy; }
        else s.pts = op.orig.pts.map((p) => [p[0] + dx, p[1] + dy]);
        this.draw(); return;
      }
      case "resize": {
        if (!op.started) { if (Math.hypot(sx - op.sx, sy - op.sy) < 3) return; op.started = true; this.onEditStart?.(); }
        const s = this.floor.shapes.find((q) => q.id === this.sel), o = op.orig; if (!s) return;
        const [px, py] = this._snapPoint(x, y, op.set);
        let x0 = o.x, x1 = o.x + o.w, y0 = o.y, y1 = o.y + o.h;
        if (op.id.includes("w")) x0 = Math.min(px, x1 - MIN_SIZE);
        if (op.id.includes("e")) x1 = Math.max(px, x0 + MIN_SIZE);
        if (op.id.includes("n")) y0 = Math.min(py, y1 - MIN_SIZE);
        if (op.id.includes("s")) y1 = Math.max(py, y0 + MIN_SIZE);
        s.x = Math.round(x0); s.y = Math.round(y0); s.w = Math.round(x1 - x0); s.h = Math.round(y1 - y0);
        this.draw(); return;
      }
      case "vertex": {
        if (!op.started) { if (Math.hypot(sx - op.sx, sy - op.sy) < 3) return; op.started = true; this.onEditStart?.(); }
        const s = this.floor.shapes.find((q) => q.id === this.sel); if (!s) return;
        const [px, py] = this._snapPoint(x, y, this._snapSet(s.id));
        s.pts[op.i] = [Math.round(px), Math.round(py)]; this.draw(); return;
      }
      case "dock": case "dockplace": {
        if (!op.started && op.k === "dock") { if (Math.hypot(sx - op.sx, sy - op.sy) < 4) return; op.started = true; this.onEditStart?.(); }
        this.floor.dock = this.placeDock(x, y); this.draw(); return;
      }
    }
  }

  _cursor(sx, sy, x, y, touch) {
    let cur = "default";
    if (this.tool === "select") {
      const hd = this._handleAt(sx, sy, touch);
      if (hd) cur = hd.mid ? "copy" : (hd.id.length === 2 || hd.id[0] === "v" ? "nwse-resize" : (hd.id === "n" || hd.id === "s" ? "ns-resize" : "ew-resize"));
      else if (this._dockAt(x, y) || this._hit(x, y)) cur = "move";
    } else cur = "crosshair";
    this.canvas.style.cursor = cur;
  }

  _up(e, cancel) {
    if (!this._ptrs.delete(e.pointerId)) return;
    const op = this._op;
    if (op?.k === "pinch") { if (this._ptrs.size < 2) this._op = null; return; }
    this._op = null; this._guides = {};
    if (!op) return;
    const [sx, sy] = this._local(e), [x, y] = this._sw(sx, sy);
    if (cancel) { this.draw(); return; }
    switch (op.k) {
      case "pan":
        if (!op.moved) this._tap(op.tap, x, y, sx, sy);
        else this.draw();
        return;
      case "create": {
        const w = Math.abs(op.x1 - op.x0), h = Math.abs(op.y1 - op.y0);
        if (w < 8 && h < 8) {
          if (this.cfg.kind === "door") this.addShape(this._newShape({ t: "rect", ...this.autoDoor(op.rx, op.ry) }));
          else { this.onHint?.("Ziehe mit der Maus oder dem Finger eine Fläche auf – oder gib unten die Maße ein."); this.draw(); }
          return;
        }
        const s = this._createShape(op);
        if (s) { delete s.id; this.addShape(this._newShape(s)); } else this.draw();
        return;
      }
      case "stroke": {
        if (op.pts.length < 2) op.pts.push([op.pts[0][0] + 1, op.pts[0][1]]);
        let pts = op.pts, eps = Math.max(4, this.cfg.width / 6);
        pts = rdp(pts, eps);
        while (pts.length > 150) { eps *= 1.6; pts = rdp(pts, eps); }
        this.addShape(this._newShape({ t: "stroke", pts: pts.map((p) => [Math.round(p[0]), Math.round(p[1])]), width: this.cfg.width }));
        return;
      }
      case "move": case "resize": case "vertex": case "dock": case "dockplace":
        if (op.started || op.k === "dockplace") this.onChange?.(op.k);
        this.draw(); return;
    }
  }

  _tap(kind, x, y, sx, sy) {
    if (kind === "view") {
      const hit = this._hit(x, y);
      if (hit?.kind === "room") this.onRoomClick?.(hit.room);
      else if (hit) { const r = (this.floor.shapes.find((q) => q.kind === "room" && pointInShape(q, x, y))); if (r) this.onRoomClick?.(r.room); }
    } else if (kind === "deselect") { this.sel = null; this.onSelect?.(null); this.draw(); }
    else if (kind === "poly") {
      const now = performance.now(), l = this._lastTap;
      if (l && now - l.t < 350 && Math.hypot(sx - l.sx, sy - l.sy) < 16 && this._poly?.pts.length >= 3) { this._lastTap = null; this.finishPoly(); return; }
      this._lastTap = { t: now, sx, sy };
      this._polyAdd(x, y);
    } else if (kind === "target") this.onTarget?.([Math.round(x), Math.round(y)]);
    else if (kind === "scale") {
      if (this.scalePts.length >= 2) this.scalePts = [];
      this.scalePts.push([x, y]); this._hover = null;
      if (this.scalePts.length === 2) this.onScale?.(this.scalePts[0], this.scalePts[1]);
      this.draw();
    }
  }

  /* ---- editing helpers used by the panel */
  selectedShape() { return this.sel && this.sel !== "dock" ? this.floor?.shapes.find((q) => q.id === this.sel) || null : null; }
  nudge(dx, dy) {
    if (this.sel === "dock" && this.floor?.dock) { this.onEditStart?.(); this.floor.dock.x += dx; this.floor.dock.y += dy; }
    else { const s = this.selectedShape(); if (!s) return; this.onEditStart?.(); translateShape(s, dx, dy); }
    this.onChange?.("nudge"); this.draw();
  }
  resetInteraction() { this._op = null; this._poly = null; this._hover = null; this._guides = {}; this.scalePts = []; this.onPolyState?.(0); }
}


/* ---------------------------------------------------------------- room detection from a floor plan image */
const DETECT_COLORS = ["#e57373", "#64b5f6", "#81c784", "#ffb74d", "#ba68c8", "#4db6ac", "#f06292", "#a1887f", "#7986cb", "#dce775", "#4dd0e1", "#ff8a65"];

function morph1d(src, W, H, r, horiz, erode) {
  const dst = new Uint8Array(W * H), n = horiz ? W : H, lines = horiz ? H : W, win = 2 * r + 1, step = horiz ? 1 : W, out = erode ? 1 : 0;
  for (let l = 0; l < lines; l++) {
    const base = horiz ? l * W : l;
    const get = (i) => (i < 0 || i >= n ? out : src[base + i * step]);
    let cnt = 0;
    for (let i = -r; i <= r; i++) cnt += get(i);
    for (let i = 0; i < n; i++) {
      dst[base + i * step] = erode ? (cnt === win ? 1 : 0) : (cnt > 0 ? 1 : 0);
      cnt += get(i + r + 1) - get(i - r);
    }
  }
  return dst;
}
const dilate = (m, W, H, r) => (r < 1 ? m : morph1d(morph1d(m, W, H, r, true, false), W, H, r, false, false));
const erode = (m, W, H, r) => (r < 1 ? m : morph1d(morph1d(m, W, H, r, true, true), W, H, r, false, true));

function grayOf(img, maxSide) {
  const f = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.max(8, Math.round(img.naturalWidth * f)), H = Math.max(8, Math.round(img.naturalHeight * f));
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.fillStyle = "#fff"; cx.fillRect(0, 0, W, H); cx.drawImage(img, 0, 0, W, H);
  const d = cx.getImageData(0, 0, W, H).data, g = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
  return { g, W, H, f };
}

function otsu(gray) {
  const hist = new Array(256).fill(0);
  gray.forEach((v) => hist[v]++);
  const total = gray.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sb = 0, wb = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wb += hist[t]; if (!wb) continue;
    const wf = total - wb; if (!wf) break;
    sb += t * hist[t];
    const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) ** 2;
    if (v > best) { best = v; thr = t; }
  }
  return thr;
}

function orthoSnap(pts, tol) {
  const n = pts.length;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if (Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) > tol) { const m = (a[0] + b[0]) / 2; a[0] = b[0] = m; }
      else if (Math.abs(a[1] - b[1]) <= tol && Math.abs(a[0] - b[0]) > tol) { const m = (a[1] + b[1]) / 2; a[1] = b[1] = m; }
    }
  }
  return pts;
}
function cleanLoop(pts) {
  let out = pts.filter((p, i) => { const q = pts[(i + pts.length - 1) % pts.length]; return p[0] !== q[0] || p[1] !== q[1]; });
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    out = out.filter((p, i) => {
      const a = out[(i + out.length - 1) % out.length], b = out[(i + 1) % out.length];
      const cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
      if (Math.abs(cross) < 1e-6) { changed = true; return false; }
      return true;
    });
  }
  return out;
}
function simplifyLoop(pts, eps) {
  if (pts.length < 5) return pts;
  let far = 0, bd = -1;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > bd) { bd = d; far = i; } }
  const a = rdp(pts.slice(0, far + 1), eps), b = rdp([...pts.slice(far), pts[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/* outline of a cell mask (gw x gh) as corner points of its outer boundary */
function traceOutline(m, gw, gh) {
  // fill holes: background that cannot reach the border
  const reach = new Uint8Array(gw * gh), stack = [];
  const push = (x, y) => { if (x >= 0 && y >= 0 && x < gw && y < gh && !m[y * gw + x] && !reach[y * gw + x]) { reach[y * gw + x] = 1; stack.push(x, y); } };
  for (let x = 0; x < gw; x++) { push(x, 0); push(x, gh - 1); }
  for (let y = 0; y < gh; y++) { push(0, y); push(gw - 1, y); }
  while (stack.length) { const y = stack.pop(), x = stack.pop(); push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  const inside = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && (m[y * gw + x] || !reach[y * gw + x]);
  const edges = new Map(), add = (ax, ay, bx, by) => { const k = ay * (gw + 2) + ax; (edges.get(k) || edges.set(k, []).get(k)).push({ ax, ay, bx, by, used: false }); };
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x, y - 1)) add(x, y, x + 1, y);
    if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!inside(x - 1, y)) add(x, y + 1, x, y);
  }
  let best = null, bestArea = 0;
  for (const list of edges.values()) for (const e0 of list) {
    if (e0.used) continue;
    const loop = []; let e = e0;
    for (let guard = 0; guard < 200000 && e && !e.used; guard++) {
      e.used = true; loop.push([e.ax, e.ay]);
      const next = edges.get(e.by * (gw + 2) + e.bx);
      e = next ? next.find((q) => !q.used) : null;
    }
    const a = loop.length > 2 ? polyArea(loop) : 0;
    if (a > bestArea) { bestArea = a; best = loop; }
  }
  return best ? cleanLoop(best) : null;
}

/* o: { cmPerNatPx, thresh, invert, gapCm, thin, minM2 }  ->  { thresh, cands: [{ shape, areaM2 }] }
 * Shapes are in cm relative to the top left corner of the image. */
function detectRooms(img, o) {
  const { g, W, H, f } = grayOf(img, 720);
  const cpp = o.cmPerNatPx / f;                       // cm per working pixel
  const thresh = o.thresh ?? otsu(g);
  let wall = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) wall[i] = (o.invert ? g[i] > thresh : g[i] < thresh) ? 1 : 0;
  let thinUsed = false;
  if (o.thin !== false) {
    const ro = Math.max(1, Math.floor(3.5 / cpp)), opened = dilate(erode(wall, W, H, ro), W, H, ro);
    let a = 0, b = 0;
    for (let i = 0; i < W * H; i++) { a += wall[i]; b += opened[i]; }
    // automatic: only drop thin lines when most of the wall pixels are thick (a plan drawn with single lines would vanish)
    if (o.thin === true || (a > 0 && b / a > 0.6)) { wall = opened; thinUsed = true; }
  }
  const r = Math.max(0, Math.round(o.gapCm / 2 / cpp));
  const walls1 = dilate(wall, W, H, r);

  // connected components of free space
  const label = new Int32Array(W * H), comps = [{ area: 0, border: false }];
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (walls1[s] || label[s]) continue;
    const id = comps.length, c = { area: 0, border: false }; comps.push(c);
    label[s] = id; stack.push(s);
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p / W) | 0;
      c.area++;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) c.border = true;
      if (x > 0 && !walls1[p - 1] && !label[p - 1]) { label[p - 1] = id; stack.push(p - 1); }
      if (x < W - 1 && !walls1[p + 1] && !label[p + 1]) { label[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && !walls1[p - W] && !label[p - W]) { label[p - W] = id; stack.push(p - W); }
      if (y < H - 1 && !walls1[p + W] && !label[p + W]) { label[p + W] = id; stack.push(p + W); }
    }
  }
  // grow every component back by r, but only through pixels that are not wall
  if (r > 0) {
    let layer = [];
    for (let p = 0; p < W * H; p++) if (label[p]) layer.push(p);
    for (let step = 0; step < r && layer.length; step++) {
      const next = [];
      for (const p of layer) {
        const x = p % W, y = (p / W) | 0, id = label[p];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (label[q] || wall[q]) continue;
          label[q] = id; next.push(q);
        }
      }
      layer = next;
    }
  }
  const minPx = (o.minM2 * 10000) / (cpp * cpp);
  const boxes = comps.map(() => ({ x0: W, y0: H, x1: -1, y1: -1, n: 0 }));
  for (let p = 0; p < W * H; p++) {
    const id = label[p]; if (!id) continue;
    const b = boxes[id], x = p % W, y = (p / W) | 0;
    if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; b.n++;
  }
  const cands = [];
  const step = Math.max(1, Math.round(10 / cpp));
  for (let id = 1; id < comps.length; id++) {
    const b = boxes[id];
    if (comps[id].border || b.n < minPx || b.x1 < 0) continue;
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    const toCm = (px) => Math.round(px * cpp);
    let shape = null;
    if (b.n / (bw * bh) >= 0.9) {
      shape = { t: "rect", x: toCm(b.x0), y: toCm(b.y0), w: Math.max(MIN_SIZE, toCm(bw)), h: Math.max(MIN_SIZE, toCm(bh)) };
    } else {
      const gw = Math.ceil(bw / step), gh = Math.ceil(bh / step), m = new Uint8Array(gw * gh);
      for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
        let hit = 0, tot = 0;
        for (let y = b.y0 + gy * step; y < Math.min(b.y0 + (gy + 1) * step, b.y1 + 1); y++)
          for (let x = b.x0 + gx * step; x < Math.min(b.x0 + (gx + 1) * step, b.x1 + 1); x++) { tot++; if (label[y * W + x] === id) hit++; }
        m[gy * gw + gx] = tot && hit * 2 >= tot ? 1 : 0;
      }
      const loop = traceOutline(m, gw, gh);
      if (!loop) continue;
      let eps = Math.max(12, step * cpp * 1.4);
      let pts = loop.map(([x, y]) => [(b.x0 + x * step) * cpp, (b.y0 + y * step) * cpp]);
      let simple = orthoSnap(cleanLoop(simplifyLoop(pts, eps)), eps * 0.9);
      simple = cleanLoop(simple.map((p) => [Math.round(p[0]), Math.round(p[1])]));
      while (simple.length > 60) { eps *= 1.5; simple = cleanLoop(simplifyLoop(pts, eps).map((p) => [Math.round(p[0]), Math.round(p[1])])); }
      if (simple.length < 3 || polyArea(simple) < 2500) continue;
      const xs = simple.map((p) => p[0]), ys = simple.map((p) => p[1]);
      const ax = simple.length === 4 && new Set(xs).size === 2 && new Set(ys).size === 2;
      shape = ax
        ? { t: "rect", x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
        : { t: "poly", pts: simple };
    }
    cands.push({ shape, areaM2: shapeArea(shape) / 10000 });
  }
  cands.sort((a, b) => b.areaM2 - a.areaM2);
  return { thresh, thinUsed, cands: cands.slice(0, 30) };
}

function autoThreshold(img) { return otsu(grayOf(img, 720).g); }


/* ---------------------------------------------------------------- panel */
const TABS = [["home", "Übersicht"], ["plan", "Plan"], ["drive", "Fahren"], ["care", "Zubehör"]];
const DEFAULT_SIZE = { room: [400, 300], carpet: [200, 300], block: [100, 100], door: [90, 20] };

/* lengths: shown in cm or m, typed with comma or dot, "3,5 m" overrides the unit */
function fmtIn(cm, unit) { return unit === "m" ? String(Math.round(cm) / 100).replace(".", ",") : String(Math.round(cm)); }
function parseIn(text, unit) {
  const m = /(-?\d+(?:[.,]\d+)?)\s*(cm|m)?/i.exec(String(text ?? "").trim());
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const u = (m[2] || unit).toLowerCase();
  return Math.round(u === "m" ? n * 100 : n);
}

class TikomPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${STYLE}${STYLE_PLAN}</style><div class="wrap"><div id="top"></div><div id="body"></div></div><div id="toast"></div>`;
    this.$top = this.shadowRoot.getElementById("top");
    this.$body = this.shadowRoot.getElementById("body");
    this.$toast = this.shadowRoot.getElementById("toast");
    this.tab = "home"; this.snap = null; this.fid = ""; this.fl = null; this.undo = [];
    this.dirty = false; this.rev = 0; this.saving = false; this.saveState = ""; this.saveTimer = 0;
    this.sel = new Set(); this.activeRoom = null; this.preview = null; this.previewKey = "";
    this.tool = "select"; this.shapeType = "rect"; this.what = "new"; this.brush = 30; this.unit = "cm";
    this.addSize = JSON.parse(JSON.stringify(DEFAULT_SIZE)); this.newRoomOpen = false;
    this.images = {}; this.imgOver = {}; this.imgLoading = {}; this.imgDirty = false; this.imgRev = 0;
    this.imgStep = ""; this.scaleAsk = null;
    this.det = { thresh: null, invert: false, thin: null, thinUsed: null, gap: 100, minM2: 2, cands: [], ran: false, busy: false, note: "" };
    this.confirm = ""; this.fbDismissed = ""; this.errDismissed = ""; this.imp = null; this.calSeconds = { speed: 5, turn: 3 }; this.recName = "";
    this.polyN = 0; this._needFit = true; this.pending = false; this._renderPending = false;

    const pv = this.pv = new PlanView();
    pv.onEditStart = () => this._pushUndo();
    pv.onChange = () => this._edited();
    pv.onSelect = (s) => {
      if (s && s !== "dock" && s.kind === "room") { this.activeRoom = s.room; this.what = `room:${s.room}`; }
      this._renderSoon();
    };
    pv.onRoomClick = (id) => this._toggleRoom(id);
    pv.onTarget = (p) => this._setTarget(p);
    pv.onScale = (a, b) => { this.scaleAsk = { a, b, d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; this._renderSoon(); };
    pv.onHint = (msg) => this.toast(msg);
    pv.canDraw = () => this._canDraw();
    pv.onPolyState = (n) => { this.polyN = n; this._renderSoon(); };
    pv.onIdle = () => { if (this._renderPending) this._render(); };

    const r = this.shadowRoot;
    r.addEventListener("click", (e) => this._click(e));
    r.addEventListener("change", (e) => this._change(e));
    r.addEventListener("input", (e) => this._input(e));
    r.addEventListener("focusout", () => setTimeout(() => this.pending && this._render(), 60));
    r.addEventListener("dragover", (e) => { if (this.tab === "plan") { e.preventDefault(); } });
    r.addEventListener("drop", (e) => this._drop(e));
    this._onKey = (e) => this._key(e);
    this._onPaste = (e) => this._paste(e);
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._start();
    const sig = this._signature();
    if (sig !== this._sig) { this._sig = sig; this._render(); }
  }
  get hass() { return this._hass; }
  set narrow(v) { this._narrow = v; }
  set panel(v) { this._panel = v; }
  set route(v) { this._route = v; }

  connectedCallback() {
    this.pv.start();
    window.addEventListener("keydown", this._onKey);
    window.addEventListener("paste", this._onPaste);
    if (this._hass && !this._unsub) this._start();
  }
  disconnectedCallback() {
    this.pv.stop();
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("paste", this._onPaste);
    if (this._unsub) { this._unsub(); this._unsub = null; }
  }

  /* ---- backend */
  async ws(type, payload = {}) { return this._hass.callWS({ type: `tikom_g8000/${type}`, ...payload }); }
  async act(type, payload = {}, okMessage = "") {
    try { const r = await this.ws(type, payload); if (okMessage) this.toast(okMessage); return r; }
    catch (err) { this.toast(err?.message || String(err), true); return null; }
  }
  async _start() {
    try {
      this._unsub = await this._hass.connection.subscribeMessage((snap) => this._onSnap(snap), { type: "tikom_g8000/subscribe" });
    } catch (err) {
      this.$body.innerHTML = `<div class="card"><h2>Keine Verbindung</h2><p class="hint">${esc(err?.message || err)}</p>
        <p class="hint">Ist die Integration „Tikom G8000“ eingerichtet und bist du als Administrator angemeldet?</p></div>`;
    }
  }
  toast(msg, bad = false) {
    this.$toast.innerHTML = `<div class="toast ${bad ? "bad" : ""}" role="status">${esc(msg)}</div>`;
    clearTimeout(this._toastT); this._toastT = setTimeout(() => (this.$toast.innerHTML = ""), 4800);
  }

  /* ---- floors and the editing copy */
  floors() { return this.snap?.floors || []; }
  floorName(id) { return this.floors().find((f) => f.id === id)?.name || ""; }
  _floorFromSnap(id) {
    const f = this.floors().find((q) => q.id === id);
    return f ? { id: f.id, name: f.name, walls: f.walls, open: JSON.parse(JSON.stringify(f.open || [])), shapes: JSON.parse(JSON.stringify(f.shapes)), dock: f.dock ? { ...f.dock } : null } : null;
  }
  roomsHere() {
    return Object.entries(this.snap?.rooms || {}).filter(([, r]) => r.floor === this.fid || r.floor === null);
  }

  _onSnap(snap) {
    this.snap = snap;
    if (this._pendingFloor && this.floors().some((f) => f.id === this._pendingFloor)) {
      this.fid = this._pendingFloor; this._pendingFloor = null; this.fl = null; this.undo = []; this._needFit = true;
      this.pv.sel = null; this.pv.resetInteraction();
    }
    if (this._keepRoom && snap.rooms[this._keepRoom]) this._keepRoom = null;
    if (!this.fid || !this.floors().some((f) => f.id === this.fid)) {
      this.fid = snap.robot_floor || this.floors()[0]?.id || ""; this.fl = null; this._needFit = true; this.undo = [];
    }
    if (!(this.dirty || this.saving || this.pv._op)) this.fl = this._floorFromSnap(this.fid);
    else if (!this.fl) this.fl = this._floorFromSnap(this.fid);
    for (const id of [...this.sel]) if (!snap.rooms[id]) this.sel.delete(id);
    if (!this.activeRoom || (!snap.rooms[this.activeRoom] && this.activeRoom !== this._keepRoom)) this.activeRoom = this.roomsHere()[0]?.[0] || null;
    if (this.what.startsWith("room:") && !snap.rooms[this.what.slice(5)] && this.what.slice(5) !== this._keepRoom) this.what = this.activeRoom ? `room:${this.activeRoom}` : "new";
    if (this.what === "new" && this.activeRoom && !this.newRoomOpen) this.what = `room:${this.activeRoom}`;
    this._ensureImage(this.fid);
    this._sync();
    this._loadPreview();
    this._render();
  }

  _sync() {
    const s = this.snap, pv = this.pv;
    if (!s) return;
    pv.floor = this.fl; pv.floorId = this.fid; pv.rooms = s.rooms; pv.selRooms = this.sel; pv.running = s.job.running;
    const im = this.images[this.fid];
    pv.image = im?.el || null; pv.imageMeta = im ? this._meta() : null;
    pv.mode = this.tab === "plan" ? "edit" : "view";
    pv.tool = this.tool;
    const w = this.what, kind = w.startsWith("room:") || w === "new" ? "room" : w;
    pv.cfg = { kind, room: w.startsWith("room:") ? w.slice(5) : null, t: kind === "door" ? "rect" : this.shapeType, width: this.brush };
    if (this.what.startsWith("room:")) {
      const id = this.what.slice(5);
      if (id !== this._keepRoom && !this.roomsHere().some(([rid]) => rid === id)) this.what = this.activeRoom ? `room:${this.activeRoom}` : "new";
    }
    if (this.fl) {
      if (pv.sel === "dock" ? !this.fl.dock : pv.sel && !this.fl.shapes.some((x) => x.id === pv.sel)) pv.sel = null;
    }
    this._lines();
  }

  _lines() {
    const s = this.snap, out = [];
    if (this.preview?.line && this.preview.floor === this.fid) out.push({ pts: this.preview.line, color: "#ffffff", dashed: true });
    if (s?.recording_line && s.recording_line.floor === this.fid) out.push({ pts: s.recording_line.line, color: "#ffd54f", dashed: true });
    this.pv.lines = out;
  }

  async _setFloor(id) {
    if (id === this.fid) return;
    await this._save();
    this.fid = id; this.fl = this._floorFromSnap(id); this.undo = []; this._needFit = true;
    this.pv.resetInteraction(); this.pv.sel = null; this.pv.cands = []; this.det.cands = []; this.det.ran = false;
    this.scaleAsk = null; this.imgStep = ""; if (this.tool === "scale") this.tool = "select";
    this.activeRoom = this.roomsHere()[0]?.[0] || null;
    this._ensureImage(id); this._sync(); this._loadPreview(); this._render();
  }

  _canon(s) {
    const o = { id: s.id, kind: s.kind, t: s.t };
    if (s.kind === "room") o.room = s.room;
    if (s.t === "rect" || s.t === "ellipse") { o.x = Math.round(s.x); o.y = Math.round(s.y); o.w = Math.max(MIN_SIZE, Math.round(s.w)); o.h = Math.max(MIN_SIZE, Math.round(s.h)); }
    else { o.pts = s.pts.map((p) => [Math.round(p[0]), Math.round(p[1])]); if (s.t === "stroke") o.width = clamp(Math.round(s.width || 30), 10, 200); }
    return o;
  }
  _canonFloor(f) {
    const d = f.dock;
    return {
      id: f.id, name: f.name, walls: !!f.walls, open: (f.open || []).map((p) => [p[0], p[1]]), shapes: f.shapes.map((s) => this._canon(s)),
      dock: d ? { x: Math.round(d.x), y: Math.round(d.y), heading: Math.round(d.heading), facing: d.facing === "out" ? "out" : "in" } : null,
    };
  }

  /* ---- undo and saving */
  _state() { return JSON.stringify({ name: this.fl.name, walls: this.fl.walls, open: this.fl.open, shapes: this.fl.shapes, dock: this.fl.dock }); }
  _pushUndo() { if (!this.fl) return; this.undo.push(this._state()); if (this.undo.length > 60) this.undo.shift(); }
  _undo() {
    const j = this.undo.pop();
    if (!j || !this.fl) return;
    Object.assign(this.fl, JSON.parse(j));
    this.pv.cancelPoly(); this._sync(); this._edited(true);
  }
  _edited(immediate = false) {
    if (!this.fl) return;
    this.dirty = true; this.rev++; this.saveState = "Speichert gleich …";
    const el = this.shadowRoot.getElementById("savestate"); if (el) el.textContent = this.saveState;
    this.pv.draw();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this._save(), immediate ? 60 : 700);
    this._renderSoon();
  }
  async _save() {
    clearTimeout(this.saveTimer);
    if (!this.dirty && !this.imgDirty) return;
    if (this.saving) { this._again = true; return; }
    const fl = this.fl; if (!fl) return;
    this.saving = true;
    const rev = this.rev, imgRev = this.imgRev, fid = fl.id;
    const msg = { action: "save", floor: this._canonFloor(fl) };
    let imgSent = false;
    if (this.imgDirty) {
      const im = this.images[fid], m = this._meta();
      msg.image = im && m ? { data: im.data, ...m } : null; imgSent = true;
    }
    let failed = false;
    try {
      await this.ws("floor", msg);
      this.saveState = "Gespeichert.";
      if (rev === this.rev) this.dirty = false;
      if (imgSent && imgRev === this.imgRev) { this.imgDirty = false; delete this.imgOver[fid]; }
    } catch (err) {
      failed = true;
      this.toast(err?.message || String(err), true);
      this.saveState = "Speichern fehlgeschlagen."; this.dirty = false; this.imgDirty = false; this.imgOver = {};
      delete this.images[fid];
    }
    this.saving = false;
    if (failed) { this.fl = this._floorFromSnap(this.fid); this._ensureImage(this.fid); this._sync(); this._render(); }
    else if (this._again || this.dirty || this.imgDirty) { this._again = false; this.saveTimer = setTimeout(() => this._save(), 100); }
    const el = this.shadowRoot.getElementById("savestate"); if (el) el.textContent = this.saveState;
  }

  /* ---- images (one per floor) */
  _meta() {
    const f = this.floors().find((q) => q.id === this.fid);
    return this.imgOver[this.fid] || f?.image_meta || null;
  }
  async _ensureImage(fid) {
    if (this.imgDirty) return;
    const f = this.floors().find((q) => q.id === fid);
    if (!f?.has_image) { if (!this.imgDirty) delete this.images[fid]; return; }
    if (this.images[fid] || this.imgLoading[fid]) return;
    this.imgLoading[fid] = true;
    const r = await this.act("get_image", { floor_id: fid });
    this.imgLoading[fid] = false;
    if (!r?.image) return;
    const img = new Image();
    img.onload = () => { this.images[fid] = { el: img, data: r.image.data }; this._sync(); this.pv.draw(); this._renderSoon(); };
    img.src = r.image.data;
  }

  /* ---- preview of a route */
  async _loadPreview() {
    const id = [...this.sel][0], s = this.snap;
    const mode = s.settings.clean_mode || "sweep_and_mop";
    const f = s.floors.find((q) => q.id === s.rooms[id]?.floor);
    const key = id ? `${id}|${mode}|${JSON.stringify(s.calibration)}|${JSON.stringify(f ? [f.shapes, f.dock, f.walls, f.open] : null)}|${s.settings.carpet_sweep_only}|${s.rooms[id]?.use_recorded}|${s.rooms[id]?.target}` : "";
    if (key === this.previewKey) return;
    this.previewKey = key;
    if (!id) { this.preview = null; this._lines(); this.pv.draw(); return; }
    try {
      const p = await this.ws("preview", { room_id: id, mode });
      if (key !== this.previewKey) return;
      this.preview = p;
    } catch (err) {
      if (key !== this.previewKey) return;
      this.preview = { error: err?.message || String(err) };
    }
    this._lines(); this.pv.draw(); this._renderSoon();
  }

  /* ---- helpers */
  _signature() {
    const s = this.snap, h = this._hass;
    if (!s || !h) return "x";
    const ids = [s.vacuum, ...Object.values(s.entities)];
    return ids.map((id) => { const st = h.states[id]; return st ? `${st.state}${id === s.vacuum ? `/${st.attributes?.status ?? ""}` : ""}` : "-"; }).join("|");
  }
  ent(key) { const id = this.snap?.entities[key]; return id ? this._hass.states[id] : null; }
  num(key) { const st = this.ent(key); const n = st ? parseFloat(st.state) : NaN; return Number.isFinite(n) ? n : null; }
  vacState() { return this._hass?.states[this.snap?.vacuum]?.state || "unavailable"; }
  svc(domain, service, data) {
    return this._hass.callService(domain, service, data).catch((e) => this.toast(e?.message || String(e), true));
  }
  _canDraw() {
    if (!this.fl) return "Es gibt noch kein Stockwerk.";
    if (this.fl.shapes.length >= 600) return "Mehr als 600 Formen pro Stockwerk sind nicht möglich.";
    const w = this.what;
    if (!w.startsWith("room:") && !["carpet", "door", "block"].includes(w)) return "Wähle bei „Was ist es?“ einen Raum oder lege einen neuen an.";
    return "";
  }
  _toggleRoom(id) {
    const rooms = this.snap.rooms, rf = rooms[id]?.floor;
    if (!rf) { this.toast("Dieser Raum ist noch nicht in einem Plan gezeichnet."); return; }
    if (rf !== this.fid) this._setFloor(rf);
    if (this.sel.size && [...this.sel].some((x) => rooms[x]?.floor !== rf)) this.sel.clear();
    this.sel.has(id) ? this.sel.delete(id) : this.sel.add(id);
    this.pv.selRooms = this.sel; this._loadPreview(); this._render(); this.pv.draw();
  }
  _setTarget(p) {
    const room = this.snap.rooms[this.activeRoom];
    if (!room) { this.toast("Wähle zuerst einen Raum in der Liste.", true); return; }
    const ok = this.fl.shapes.some((s) => s.kind === "room" && s.room === this.activeRoom && pointInShape(s, p[0], p[1]));
    if (!ok) { this.toast(`Tippe in den Raum „${room.name}“.`, true); return; }
    this.act("room", { action: "update", room_id: this.activeRoom, target: p }, "Zielpunkt gesetzt");
  }
  _renderSoon() {
    this._renderPending = true;
    if (!this.pv._op) this._render();
  }

  /* ---- render */
  _render() {
    if (!this.snap || !this._hass) return;
    if (this.pv._op) { this._renderPending = true; return; }
    const active = this.shadowRoot.activeElement;
    if (active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName) && !["checkbox", "range", "radio"].includes(active.type)) { this.pending = true; return; }
    this.pending = false; this._renderPending = false;
    this._sync();
    const scroll = this.scrollTop;
    this.$top.innerHTML = `<div class="top"><h1>${esc(this.snap.title)}</h1>
      <div class="tabs" role="tablist">${TABS.map(([id, label]) =>
        `<button class="tab" role="tab" data-act="tab" data-tab="${id}" aria-selected="${this.tab === id}">${label}</button>`).join("")}</div></div>`;
    this.$body.innerHTML = { home: () => this._home(), plan: () => this._planTab(), drive: () => this._drive(), care: () => this._care() }[this.tab]();
    const slot = this.shadowRoot.getElementById("planslot");
    if (slot) {
      slot.classList.add(this.tab === "plan" ? "edit" : "view");
      slot.appendChild(this.pv.canvas);
      if (this._needFit) { this._needFit = false; this.pv.fit(); } else this.pv.draw();
    }
    this.scrollTop = scroll;
  }

  /* charging: Tuya Local passes the robot's own status on as an attribute of the vacuum */
  _charge() {
    const raw = this._hass.states[this.snap.vacuum]?.attributes?.status;
    if (this.vacState() !== "docked") return "";
    return raw === "charging" ? "charging" : raw === "charged" ? "full" : "";
  }

  _statusCard() {
    const s = this.snap, st = this.vacState();
    const bat = this.num("battery"), charge = this._charge();
    const room = s.job.running && s.job.room ? s.rooms[s.job.room]?.name : "";
    const sub = s.job.running ? [room && `Raum ${room}`, s.job.phase].filter(Boolean).join(", ") : (this.ent("problem")?.state === "on" ? "Der Roboter meldet ein Problem" : "");
    const barClass = bat !== null && bat < 20 ? "bad" : bat !== null && bat < 40 ? "warn" : "";
    const chargeTxt = charge === "charging" ? "Lädt" : charge === "full" ? "Voll geladen" : "";
    const bolt = charge === "charging"
      ? `<svg class="bolt" viewBox="0 0 24 24" role="img" aria-label="Lädt"><title>Lädt</title><path d="M13.2 2 5 13.4h5.6L9.4 22 19 9.8h-6z"/></svg>`
      : charge === "full" ? `<svg class="bolt full" viewBox="0 0 24 24" role="img" aria-label="Voll geladen"><title>Voll geladen</title><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>` : "";
    return `<div class="card"><div class="status"><span class="dot ${esc(st)}"></span>
      <div><div class="big">${esc(STATE_TEXT[st] || st)}${chargeTxt ? ` <span class="chg ${charge}">${bolt}${esc(chargeTxt)}</span>` : ""}</div><div class="hint">${esc(sub)}</div></div>
      <div class="battery">${bat === null ? "" : `<b class="num">${charge === "charging" ? bolt : ""}${Math.round(bat)} %</b><div class="bar ${barClass}"><i style="width:${Math.min(100, bat)}%"></i></div>`}</div></div>
      <div class="row" style="margin-top:12px">
        <button class="btn" data-act="svc" data-s="start">Start</button>
        <button class="btn" data-act="svc" data-s="pause">Pause</button>
        <button class="btn" data-act="svc" data-s="return_to_base">Zur Station</button>
        <button class="btn" data-act="svc" data-s="locate">Suchen</button>
      </div></div>`;
  }

  _floorTabs() {
    const fl = this.floors();
    if (fl.length < 2 && this.tab !== "plan") return "";
    const rf = this.snap.robot_floor;
    return `<div class="ftabs" role="tablist" aria-label="Stockwerke">${fl.map((f) =>
      `<button class="ftab" role="tab" data-act="floor" data-floor="${esc(f.id)}" aria-selected="${f.id === this.fid}">${esc(f.name)}${f.id === rf && fl.length > 1 ? `<span class="rbadge" title="Hier steht der Roboter">Roboter</span>` : ""}</button>`).join("")}
      ${this.tab === "plan" ? `<button class="ftab add" data-act="floor-add" title="Stockwerk hinzufügen">+ Stockwerk</button>` : ""}</div>`;
  }

  _hasRoomsDrawn() { return this.floors().some((f) => f.shapes.some((s) => s.kind === "room")); }

  _home() {
    const s = this.snap;
    const rooms = Object.entries(s.rooms).filter(([, r]) => r.floor === this.fid);
    const hasPlan = this._hasRoomsDrawn() && this.fl?.shapes.some((x) => x.kind === "room");
    const chips = rooms.length
      ? `<div class="chips">${rooms.map(([id, r]) => `<button class="chip" data-act="sel" data-room="${esc(id)}" aria-pressed="${this.sel.has(id)}"><i style="background:${esc(r.color)}"></i>${esc(r.name)}</button>`).join("")}</div>`
      : "";
    const plan = hasPlan || this._hasRoomsDrawn()
      ? `<div class="plan-wrap" id="planslot"></div>
         <div class="row between" style="margin-top:8px"><p class="hint">Tippe auf einen Raum, um ihn auszuwählen. Mehrere Räume werden nacheinander gereinigt.</p>
         <div class="seg"><button data-act="zoom" data-z="out" aria-label="Verkleinern">−</button><button data-act="zoom" data-z="in" aria-label="Vergrößern">+</button><button data-act="zoom" data-z="fit">Alles</button></div></div>`
      : `<div class="plan-wrap"><div class="plan-empty"><h2>Noch kein Wohnungsplan</h2><p class="hint" style="margin:6px 0 14px">Zeichne deine Räume mit Maßen oder lade einen Grundriss hoch, dann erscheinen sie hier zum Antippen.</p><button class="btn primary" data-act="tab" data-tab="plan">Plan anlegen</button></div></div>`;
    return `<div class="stack">${this._statusCard()}
      <div class="grid"><div>
        <div class="card"><h2>Wohnung</h2>${this._floorTabs()}${plan}${chips ? `<div style="margin-top:12px">${chips}</div>` : ""}</div>
      </div><div>${this._actionCard()}${this._setupCard()}${this._feedbackCard()}${this._quickCard()}</div></div></div>`;
  }

  _wrongFloor() {
    const s = this.snap;
    if (s.floors.length < 2 || !s.robot_floor) return null;
    const ids = [...new Set([...this.sel].map((id) => s.rooms[id]?.floor).filter(Boolean))];
    const bad = ids.find((f) => f !== s.robot_floor);
    return bad || null;
  }

  _actionCard() {
    const s = this.snap, mode = s.settings.clean_mode;
    if (s.job.running) {
      const names = s.job.queue.map((id) => s.rooms[id]?.name).filter(Boolean);
      return `<div class="card"><h2>Läuft gerade</h2><p>${esc(s.job.phase || "Starte")}</p>
        <p class="hint" style="margin:6px 0 12px">${names.length ? `Noch offen: ${esc(names.join(", "))}` : ""}</p>
        <button class="btn danger big" data-act="abort">Abbrechen und zur Station</button></div>`;
    }
    const picked = [...this.sel].map((id) => s.rooms[id]?.name).filter(Boolean);
    let info = `<p class="hint">Wähle einen oder mehrere Räume im Plan.</p>`;
    if (this.preview?.error) info = `<div class="notice">${esc(this.preview.error)}</div>`;
    else if (this.preview) info = `<p class="hint">Weg zum Raum ${this.preview.source === "plan" ? "aus dem Plan" : "aus der Aufnahme"}, ca. ${Math.round(this.preview.seconds)} Sekunden Fahrt (weiße Linie im Plan).</p>`;
    const docked = this.vacState() === "docked";
    const wrong = this._wrongFloor();
    const wrongHtml = wrong
      ? `<div class="notice" style="margin-top:10px">Der Roboter steht laut Plan im Stockwerk „${esc(this.floorName(s.robot_floor))}“. Die Räume liegen im Stockwerk „${esc(this.floorName(wrong))}“.
         Trage den Roboter dorthin, stelle ihn auf die Station und tippe dann hier:
         <div style="margin-top:8px"><button class="btn" data-act="robot-here" data-floor="${esc(wrong)}">Roboter steht jetzt im Stockwerk „${esc(this.floorName(wrong))}“</button></div></div>`
      : "";
    const ok = picked.length && docked && !this.preview?.error && !wrong;
    const carpetRooms = [...this.sel].filter((id) => s.rooms[id]?.has_carpet).map((id) => s.rooms[id].name);
    let carpetHtml = "";
    if (carpetRooms.length && mode !== "sweep") {
      carpetHtml = s.settings.carpet_sweep_only
        ? `<div class="notice ok small" style="margin-top:10px">${esc(carpetRooms.join(", "))}: Im Raum liegt ein Teppich, deshalb wird dort nur gesaugt (Einstellung unter „Zubehör“).</div>`
        : `<div class="notice small" style="margin-top:10px">${esc(carpetRooms.join(", "))}: Im Raum liegt ein Teppich. Der Plan umgeht ihn auf dem Weg dorthin. Im Raum selbst bestimmt der Roboter, wo er fährt, der Plan kann ihm den Teppich nicht verbieten.
           <div style="margin-top:8px"><button class="btn" data-act="carpet-only-on">Räume mit Teppich nur saugen</button></div></div>`;
    }
    const lr = s.last_run;
    const errHtml = lr && lr.error && this.errDismissed !== JSON.stringify(lr)
      ? `<div class="notice bad" style="margin-top:10px"><b>Letzter Auftrag${lr.room && s.rooms[lr.room] ? ` (${esc(s.rooms[lr.room].name)})` : ""} abgebrochen:</b> ${esc(lr.error)}
         <div style="margin-top:8px"><button class="btn" data-act="err-ok">Okay</button></div></div>`
      : "";
    return `<div class="card"><h2>Reinigen</h2>
      <p style="margin-bottom:10px">${picked.length ? esc(picked.join(", ")) : "Kein Raum gewählt"}</p>
      <div class="seg full" style="margin-bottom:12px">${Object.entries(MODE_TEXT).map(([k, t]) => `<button data-act="mode" data-mode="${k}" aria-pressed="${mode === k}">${t}</button>`).join("")}</div>
      ${info}${wrongHtml}${carpetHtml}${errHtml}
      ${docked ? "" : `<div class="notice" style="margin-top:10px">Der Roboter muss auf der Station stehen, sonst startet kein Raumauftrag.</div>`}
      <div class="row" style="margin-top:12px"><button class="btn primary big" data-act="clean" ${ok ? "" : "disabled"}>Los</button></div>
      <div class="row" style="margin-top:8px"><button class="btn" data-act="dry" ${ok ? "" : "disabled"}>Nur hinfahren (Test)</button></div></div>`;
  }

  _setupCard() {
    const s = this.snap;
    const docked = s.floors.some((f) => f.dock);
    const steps = [
      [s.calibration.calibrated, "Roboter messen", "Geschwindigkeit und Drehung messen, dauert 2 Minuten.", "drive", "Messen"],
      [this._hasRoomsDrawn() && docked, "Plan zeichnen und Station setzen", "Räume mit Maßen zeichnen oder einen Grundriss hochladen.", "plan", "Zeichnen"],
      [Object.keys(s.rooms).length > 0, "Räume benennen", "Zum Beispiel Wohnzimmer oder Küche.", "plan", "Benennen"],
      [!!s.last_run && !s.last_run.error, "Testfahrt", "Wähle einen Raum und tippe auf „Nur hinfahren“.", "home", ""],
    ];
    if (steps.every((x) => x[0])) return "";
    return `<div class="card"><h2>Einrichtung</h2><div class="steps">${steps.map(([done, title, text, tab, label]) =>
      `<div class="step ${done ? "done" : ""}"><span class="mark">${done ? "✓" : ""}</span><div class="grow"><div>${esc(title)}</div><div class="hint">${esc(text)}</div></div>
      ${!done && label ? `<button class="btn" data-act="tab" data-tab="${tab}">${label}</button>` : ""}</div>`).join("")}</div></div>`;
  }

  _feedbackCard() {
    const lr = this.snap.last_run;
    if (!lr || lr.error || this.snap.job.running) return "";
    const key = JSON.stringify(lr);
    if (this.fbDismissed === key) return "";
    return `<div class="card"><h2>Wie genau war die Fahrt?</h2><p class="hint" style="margin-bottom:10px">Jede Rückmeldung verbessert die Messwerte um 5 Prozent.</p>
      <div class="row">
        <button class="btn" data-act="fb" data-kind="too_short">Zu kurz</button>
        <button class="btn" data-act="fb" data-kind="too_long">Zu weit</button>
        <button class="btn" data-act="fb" data-kind="over_turn">Zu viel gedreht</button>
        <button class="btn" data-act="fb" data-kind="under_turn">Zu wenig gedreht</button>
        <button class="btn" data-act="fb-ok">Passt</button></div></div>`;
  }

  _control(key, label) {
    const st = this.ent(key);
    if (!st) return "";
    const id = this.snap.entities[key], dom = id.split(".")[0];
    if (dom === "select") {
      const opts = st.attributes.options || [];
      const body = opts.length <= 4
        ? `<div class="seg">${opts.map((o) => `<button data-act="select" data-ent="${esc(id)}" data-opt="${esc(o)}" aria-pressed="${st.state === o}">${esc(OPTION_TEXT[o] || o)}</button>`).join("")}</div>`
        : `<select data-change="select" data-ent="${esc(id)}">${opts.map((o) => `<option value="${esc(o)}" ${st.state === o ? "selected" : ""}>${esc(OPTION_TEXT[o] || o)}</option>`).join("")}</select>`;
      return `<div class="stack" style="gap:6px"><span class="small hint">${esc(label)}</span>${body}</div>`;
    }
    if (dom === "switch") return `<label class="toggle"><span>${esc(label)}</span><input type="checkbox" data-change="switch" data-ent="${esc(id)}" ${st.state === "on" ? "checked" : ""}></label>`;
    return "";
  }

  _quickCard() {
    const parts = [this._control("water", "Wassermenge"), this._control("carpet_boost", "Teppich Druckerhöhung")].filter(Boolean);
    const fan = this._hass.states[this.snap.vacuum]?.attributes.fan_speed_list;
    if (!parts.length && !fan) return "";
    const cur = this._hass.states[this.snap.vacuum]?.attributes.fan_speed;
    const fanHtml = fan?.length ? `<div class="stack" style="gap:6px"><span class="small hint">Saugkraft</span><div class="seg">${fan.map((f) => `<button data-act="fan" data-fan="${esc(f)}" aria-pressed="${cur === f}">${esc(OPTION_TEXT[f] || f)}</button>`).join("")}</div></div>` : "";
    return `<div class="card"><h2>Schnell einstellen</h2><div class="stack">${fanHtml}${parts.join("")}</div></div>`;
  }

  /* ---- drive tab */
  _drive() {
    const s = this.snap, cal = s.calibration;
    const rec = s.recording;
    const docked = this.vacState() === "docked";
    return `<div class="grid"><div>
      <div class="card"><h2>Roboter messen</h2>
        ${cal.calibrated ? `<div class="notice ok">Gemessen: ${cal.speed_cm_s.toFixed(1)} cm pro Sekunde, ${cal.turn_deg_s.toFixed(0)} Grad pro Sekunde.</div>` : `<div class="notice">Noch nicht gemessen. Ohne Messung gibt es keine Wege aus dem Plan.</div>`}
        <p class="hint" style="margin:10px 0 0">Stelle den Roboter mit Platz vor sich auf den Boden und lege einen Zollstock bereit.</p>
        <h3>1. Geschwindigkeit</h3>
        <div class="row"><label class="field" style="width:110px">Sekunden<input type="number" min="1" max="30" step="1" value="${this.calSeconds.speed}" data-change="cal-sec-speed"></label>
          <button class="btn" data-act="cal-drive-speed">Vorwärts fahren</button></div>
        <div class="row" style="margin-top:8px"><label class="field" style="width:110px">Strecke in cm<input type="number" min="1" max="2000" id="cal-speed" placeholder="z. B. 120"></label>
          <button class="btn primary" data-act="cal-save-speed">Speichern</button></div>
        <h3>2. Drehung</h3>
        <div class="row"><label class="field" style="width:110px">Sekunden<input type="number" min="1" max="30" step="1" value="${this.calSeconds.turn}" data-change="cal-sec-turn"></label>
          <button class="btn" data-act="cal-drive-turn">Links drehen</button></div>
        <div class="row" style="margin-top:8px"><label class="field" style="width:110px">Winkel in Grad<input type="number" min="1" max="2000" id="cal-turn" placeholder="z. B. 180"></label>
          <button class="btn primary" data-act="cal-save-turn">Speichern</button></div>
        <p class="hint" style="margin-top:8px">Ein Viertelkreis sind 90 Grad, eine halbe Drehung 180 Grad.</p></div>
      </div><div>
      <div class="card"><h2>Von Hand fahren und aufnehmen</h2>
        <div class="padgrid"><span class="empty btn"></span><button class="btn" data-act="drive" data-d="forward">Vor</button><span class="empty btn"></span>
          <button class="btn" data-act="drive" data-d="left">Links</button><button class="btn" data-act="drive" data-d="reverse">Zurück</button><button class="btn" data-act="drive" data-d="right">Rechts</button></div>
        <label class="field" style="margin-top:12px">Sekunden pro Tastendruck<input type="number" min="0.5" max="30" step="0.5" value="${esc(s.settings.step_seconds)}" data-change="step-seconds"></label>
        <h3>Aufnahme</h3>
        <p class="num" style="word-break:break-all">${rec ? esc(rec) : `<span class="hint">Noch leer. Jeder Tastendruck wird hier festgehalten.</span>`}</p>
        <div class="row" style="margin-top:10px"><button class="btn" data-act="rec" data-r="clear" ${rec ? "" : "disabled"}>Leeren</button>
          <button class="btn" data-act="rec" data-r="test" ${rec && docked ? "" : "disabled"}>Abspielen</button></div>
        <div class="row" style="margin-top:10px"><input type="text" id="recname" placeholder="Als Raum speichern, z. B. Bad" maxlength="40" style="flex:1" value="${esc(this.recName)}"><button class="btn primary" data-act="rec-save" ${rec ? "" : "disabled"}>Speichern</button></div>
        <p class="hint" style="margin-top:8px">Gelb gestrichelt zeigt der Plan (Reiter „Plan“ oder „Übersicht“), wo die Aufnahme enden sollte. Damit kannst du Wege auch dort festlegen, wo der Plan keinen findet.</p></div>
      </div></div>`;
  }

  /* ---- care tab */
  _care() {
    const keys = ["filter", "edge_brush", "roll_brush"];
    const supplies = keys.filter((k) => this.ent(k)).map((k) => {
      const v = this.num(k); if (v === null) return "";
      const max = Math.max(SUPPLY_MAX[k], v);
      const pct = Math.max(0, Math.min(100, (v / max) * 100));
      const cls = pct < 10 ? "bad" : pct < 25 ? "warn" : "";
      const reset = { filter: "reset_filter", edge_brush: "reset_edge_brush", roll_brush: "reset_roll_brush" }[k];
      return `<div class="supply"><div class="row between"><span>${SUPPLY_TEXT[k]}</span><span class="num">${Math.round(v)} Std.</span></div>
        <div class="bar ${cls}"><i style="width:${pct}%"></i></div>
        ${this.ent(reset) ? `<div><button class="btn" style="margin-top:6px" data-act="press" data-ent="${esc(this.snap.entities[reset])}">${SUPPLY_TEXT[k]} getauscht</button></div>` : ""}</div>`;
    }).join("");
    const settings = [["mode", "Betriebsmodus"], ["water", "Wassermenge"], ["carpet_boost", "Teppich Druckerhöhung"], ["carpet_detection", "Teppicherkennung"], ["volume", "Lautstärke"], ["language", "Sprache des Roboters"]]
      .map(([k, l]) => this._control(k, l)).filter(Boolean).join("");
    const area = this.num("area"), time = this.num("time");
    return `<div class="grid"><div><div class="card"><h2>Zubehör: verbleibende Zeit</h2>${supplies || `<p class="hint">Die Zubehör-Werte kommen von Tuya Local. Sie erscheinen, sobald der Roboter mit dem Typ „tikom_g8000_robot_vacuum_mop“ eingerichtet ist.</p>`}</div>
      <div class="card"><h2>Letzte Reinigung</h2><div class="row between"><span>Fläche</span><span class="num">${area === null ? "–" : `${area} m²`}</span></div>
        <div class="row between"><span>Dauer</span><span class="num">${time === null ? "–" : `${time} Min.`}</span></div></div></div>
      <div><div class="card"><h2>Einstellungen</h2><div class="stack">${settings || `<p class="hint">Noch keine Einstellungen gefunden.</p>`}</div></div>
      <div class="card"><h2>Raumaufträge</h2><div class="stack">
        <label class="toggle"><span>Räume mit Teppich nur saugen</span><input type="checkbox" data-change="bool-setting" data-key="carpet_sweep_only" ${this.snap.settings.carpet_sweep_only ? "checked" : ""}></label>
        <p class="hint">Der Plan kennt deine Teppiche und umgeht sie auf dem Weg. Im Raum fährt der Roboter selbst. Erkennt seine eigene Teppicherkennung (oben) den Teppich nicht, hilft nur, in diesen Räumen nicht zu wischen.</p>
        <label class="toggle"><span>Prüfen, ob er die Station verlassen hat</span><input type="checkbox" data-change="bool-setting" data-key="verify_leave_dock" ${this.snap.settings.verify_leave_dock ? "checked" : ""}></label>
        <p class="hint">Nach dem ersten Fahrschritt muss der Roboter sich von „An der Station“ lösen. Sonst bricht der Auftrag ab, statt an der Station zu reinigen.</p></div></div></div></div>`;
  }
}


/* ---------------------------------------------------------------- plan tab */
const SHAPE_BUTTONS = [["rect", "Rechteck"], ["ellipse", "Rund"], ["poly", "Vieleck"], ["stroke", "Freihand"]];
const TOOL_BUTTONS = [["select", "Auswählen"], ["draw", "Zeichnen"], ["dock", "Station"], ["target", "Zielpunkt"]];

function dockSvg(facing) {
  const inward = facing === "in";
  const arc = inward ? "M 46 33.5 A 22 22 0 0 1 74 33.5" : "M 46 66.5 A 22 22 0 0 0 74 66.5";
  const arrow = inward ? "60,33 54,44 66,44" : "60,67 54,56 66,56";
  const frontY = inward ? 40 : 76;
  return `<svg viewBox="0 0 120 84" width="120" height="84" role="img" aria-label="${inward ? "Front zur Wand" : "Front zum Raum"}">
    <rect width="120" height="84" rx="8" fill="rgba(127,127,127,.12)"/>
    <line x1="8" y1="14" x2="112" y2="14" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <rect x="50" y="17" width="20" height="8" rx="2" fill="#1f2430" stroke="#fff"/>
    <circle cx="60" cy="50" r="22" fill="#3b4254" stroke="#fff" stroke-width="2"/>
    <path d="${arc}" fill="none" stroke="#ffd54f" stroke-width="5" stroke-linecap="round"/>
    <polygon points="${arrow}" fill="#fff"/>
    <text x="8" y="10" font-size="8" fill="currentColor">Wand</text>
    <text x="74" y="24" font-size="8" fill="currentColor">Station</text>
    <text x="84" y="${frontY}" font-size="8" fill="#b07d00" font-weight="700">Front</text></svg>`;
}

Object.assign(TikomPanel.prototype, {
  _lenField(label, key, cm, extra = "") {
    return `<label class="field">${label}<input type="text" inputmode="decimal" value="${esc(fmtIn(cm, this.unit))}" data-change="sh" data-f="${key}" ${extra}></label>`;
  },
  _unitSeg() {
    return `<span class="seg unit" title="Einheit der Eingabefelder"><button data-act="unit" data-u="cm" aria-pressed="${this.unit === "cm"}">cm</button><button data-act="unit" data-u="m" aria-pressed="${this.unit === "m"}">m</button></span>`;
  },

  _planHint() {
    const t = this.tool, w = this.what;
    if (this.scaleAsk) return "Gib unten ein, wie lang die markierte Strecke in Wirklichkeit ist.";
    if (t === "scale") return "Tippe im Bild zwei Punkte an, deren echten Abstand du kennst, zum Beispiel eine Wand mit bekannter Länge.";
    if (t === "dock") return "Tippe im Plan an die Wand, an der die Ladestation steht. Sie dreht sich selbst von der Wand weg. Ziehen verschiebt sie.";
    if (t === "target") return `Tippe in den Raum „${this.snap.rooms[this.activeRoom]?.name || "…"}“, wohin der Roboter fahren soll. Ohne Zielpunkt nimmt die App eine Stelle in der Mitte.`;
    if (t === "draw") {
      if (w === "door") return "Tippe an eine Wand: Die Tür setzt sich dorthin und dreht sich passend. Oder ziehe sie als Rechteck auf.";
      if (this.shapeType === "poly") return "Tippe die Ecken nacheinander an. Die letzte Ecke doppelt antippen oder „Fertig“ drücken. Ecken rasten an andere Formen ein.";
      if (this.shapeType === "stroke") return "Fahre mit Finger oder Maus über die Fläche. Die Linie wird ein Streifen in der gewählten Breite.";
      return "Ziehe die Fläche im Plan auf. Sie dockt an andere Formen an (mit Alt aus). Oder gib Breite und Länge ein und tippe auf „Hinzufügen“.";
    }
    return "Fläche antippen zum Auswählen. Ziehen verschiebt sie und dockt an Nachbarn an (Alt hält das aus), die Punkte am Rand ändern die Größe. Auf leerer Fläche ziehen verschiebt den Plan, Mausrad oder zwei Finger zoomen.";
  },

  _drawOptions() {
    const w = this.what, door = w === "door";
    const kind = w.startsWith("room:") || w === "new" ? "room" : w;
    const t = door ? "rect" : this.shapeType;
    const rooms = this.roomsHere();
    const [aw, ah] = this.addSize[kind] || [300, 300];
    const shapeSel = `<label class="field fit">1 · Form<select data-change="shape" ${door ? "disabled" : ""}>${SHAPE_BUTTONS.map(([k, label]) =>
      `<option value="${k}" ${t === k ? "selected" : ""}>${label}</option>`).join("")}</select></label>`;
    let size = "";
    if (t === "rect" || t === "ellipse") {
      size = `<div class="row" style="align-items:flex-end;gap:8px"><label class="field sm">Breite<input type="text" inputmode="decimal" value="${esc(fmtIn(aw, this.unit))}" data-change="add-w"></label>
        <span class="times">×</span><label class="field sm">${door ? "Dicke" : "Länge"}<input type="text" inputmode="decimal" value="${esc(fmtIn(ah, this.unit))}" data-change="add-h"></label>
        ${this._unitSeg()}<button class="btn primary" data-act="add-dims">Hinzufügen</button></div>`;
    } else if (t === "poly") {
      size = `<div class="row" style="align-items:center;gap:8px"><span class="hint">${this.polyN ? `${this.polyN} Ecken gesetzt` : "Ecken im Plan antippen"}</span>
        <button class="btn primary" data-act="poly-done" ${this.polyN >= 3 ? "" : "disabled"}>Fertig</button>
        <button class="btn" data-act="poly-back" ${this.polyN ? "" : "disabled"}>Eine Ecke zurück</button>
        <button class="btn" data-act="poly-cancel" ${this.polyN ? "" : "disabled"}>Abbrechen</button></div>`;
    } else {
      size = `<div class="row" style="align-items:flex-end;gap:8px"><label class="field sm">Strichbreite<input type="text" inputmode="decimal" value="${esc(fmtIn(this.brush, this.unit))}" data-change="brush"></label>${this._unitSeg()}</div>`;
    }
    const newRoom = w === "new" || this.newRoomOpen
      ? `<div class="row newroomrow"><input type="text" id="newroomname" placeholder="Name des Raums, z. B. Wohnzimmer" maxlength="40" style="flex:1"><button class="btn primary" data-act="room-new">Raum anlegen</button></div>`
      : "";
    return `<div class="drawopts">${shapeSel}
      <div class="sizebox"><span class="optlabel">2 · Größe</span>${size}</div>
      <label class="field fit">3 · Was ist es?<select data-change="what">
        <optgroup label="Raum">${rooms.map(([id, r]) => `<option value="room:${esc(id)}" ${w === `room:${id}` ? "selected" : ""}>${esc(r.name)}</option>`).join("")}<option value="new" ${w === "new" ? "selected" : ""}>+ Neuer Raum …</option></optgroup>
        <optgroup label="Dazu"><option value="carpet" ${w === "carpet" ? "selected" : ""}>Teppich</option><option value="door" ${w === "door" ? "selected" : ""}>Tür (Durchgang)</option><option value="block" ${w === "block" ? "selected" : ""}>Sperrzone / Möbel</option></optgroup>
      </select></label>${newRoom}</div>`;
  },

  _planTab() {
    if (!this.fl) return `<div class="card"><h2>Noch kein Stockwerk</h2><button class="btn primary" data-act="floor-add">Stockwerk anlegen</button></div>`;
    const tool = this.tool;
    const imageFirst = !!this.images[this.fid] || !this.fl.shapes.some((s) => s.kind === "room");
    const toolbar = `<div class="toolbar">
      <div class="seg" role="group" aria-label="Werkzeug">${TOOL_BUTTONS.map(([id, label]) =>
        `<button data-act="tool" data-tool="${id}" aria-pressed="${tool === id}">${label}</button>`).join("")}</div>
      <div class="seg" role="group" aria-label="Ansicht"><button data-act="zoom" data-z="out" aria-label="Verkleinern">−</button><button data-act="zoom" data-z="in" aria-label="Vergrößern">+</button><button data-act="zoom" data-z="fit">Alles</button></div>
      <button class="btn" data-act="undo" ${this.undo.length ? "" : "disabled"}>Rückgängig</button></div>`;
    return `<div class="grid"><div><div class="card"><h2>Plan</h2>${this._floorTabs()}${toolbar}
        ${tool === "draw" ? this._drawOptions() : ""}
        <div class="plan-wrap" id="planslot"></div>
        <p class="hint" style="margin-top:8px">${esc(this._planHint())} <span id="savestate" class="saved">${esc(this.saveState)}</span></p></div></div>
      <div>${this._scaleCard()}${this._inspector()}${imageFirst ? this._imageCard() : ""}${this._roomsCard()}${this._dockCard()}${this._floorCard()}${imageFirst ? "" : this._imageCard()}${this._backupCard()}</div></div>`;
  },

  /* ---- selection */
  _inspector() {
    const s = this.pv.selectedShape();
    if (!s) return "";
    const rooms = this.roomsHere();
    const kindSel = `<label class="field">Ist ein<select data-change="sh-kind">${Object.entries(KIND_TEXT).map(([k, t]) => `<option value="${k}" ${s.kind === k ? "selected" : ""}>${t}${k === "block" ? " (Möbel)" : ""}</option>`).join("")}</select></label>`;
    const roomSel = s.kind === "room"
      ? `<label class="field">Gehört zu Raum<select data-change="sh-room">${rooms.map(([id, r]) => `<option value="${esc(id)}" ${s.room === id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></label>`
      : "";
    let geo = "";
    if (s.t === "rect" || s.t === "ellipse") {
      geo = `<div class="fields2">${this._lenField("Breite", "w", s.w)}${this._lenField("Länge", "h", s.h)}${this._lenField("Links (x)", "x", s.x)}${this._lenField("Oben (y)", "y", s.y)}</div>`;
    } else if (s.t === "stroke") {
      geo = `<div class="fields2">${this._lenField("Strichbreite", "width", s.width)}</div><p class="hint">Länge der Linie: ${esc(fmtLen(strokeLength(s.pts)))}</p>`;
    } else {
      const b = bboxOf(s);
      geo = `<p class="hint">Umfasst ${esc(fmtLen(b.x1 - b.x0))} × ${esc(fmtLen(b.y1 - b.y0))}, ${s.pts.length} Ecken.</p>
        <details><summary>Ecken einzeln eingeben</summary><div class="pts">${s.pts.map((p, i) =>
          `<div class="ptrow"><span class="num">${i + 1}</span>
            <input type="text" inputmode="decimal" value="${esc(fmtIn(p[0], this.unit))}" data-change="pt" data-i="${i}" data-axis="0" aria-label="Ecke ${i + 1} x">
            <input type="text" inputmode="decimal" value="${esc(fmtIn(p[1], this.unit))}" data-change="pt" data-i="${i}" data-axis="1" aria-label="Ecke ${i + 1} y">
            <button class="btn" data-act="pt-del" data-i="${i}" ${s.pts.length > 3 ? "" : "disabled"} aria-label="Ecke löschen">✕</button></div>`).join("")}</div></details>`;
    }
    const title = `${KIND_TEXT[s.kind]}${s.kind === "room" ? ` „${this.snap.rooms[s.room]?.name || ""}“` : ""}`;
    return `<div class="card"><div class="row between"><h2 style="margin:0">${esc(title)}</h2>${this._unitSeg()}</div>
      <p class="hint" style="margin:4px 0 10px">${esc(TYPE_TEXT[s.t])}, Fläche ca. ${esc(fmtArea(shapeArea(s)))}</p>
      <div class="stack">${kindSel}${roomSel}${geo}
        <div class="row">${s.t === "rect" ? `<button class="btn" data-act="sh-rot">Breite und Länge tauschen</button>` : ""}<button class="btn" data-act="sh-dup">Duplizieren</button><button class="btn danger" data-act="sh-del">Löschen</button></div></div></div>`;
  },

  _roomsCard() {
    const rooms = this.roomsHere();
    const area = {};
    for (const s of this.fl.shapes) if (s.kind === "room") area[s.room] = (area[s.room] || 0) + shapeArea(s);
    const rows = rooms.map(([id, r]) => `<div class="roomrow ${this.activeRoom === id ? "active" : ""}">
        <input type="color" value="${esc(r.color)}" data-change="room-color" data-room="${esc(id)}" aria-label="Farbe ${esc(r.name)}">
        <input type="text" value="${esc(r.name)}" data-change="room-name" data-room="${esc(id)}" aria-label="Name" maxlength="40" data-focus-room="${esc(id)}">
        <input type="number" min="1" max="90" value="${esc(r.minutes)}" data-change="room-minutes" data-room="${esc(id)}" aria-label="Minuten saugen">
        <button class="btn ${this.confirm === `room:${id}` ? "danger" : ""}" data-act="room-del" data-room="${esc(id)}" aria-label="Raum löschen">${this.confirm === `room:${id}` ? "Sicher?" : "✕"}</button>
        <div class="sub small hint">${area[id] ? `ca. ${esc(fmtArea(area[id]))}` : "noch nicht gezeichnet"} ·
          ${r.target ? `Zielpunkt gesetzt <button class="link" data-act="target-clear" data-room="${esc(id)}">zurücksetzen</button>` : `Zielpunkt automatisch`}
          · <button class="link" data-act="room-pick" data-room="${esc(id)}" data-then="draw">hier zeichnen</button>
          · <button class="link" data-act="room-pick" data-room="${esc(id)}" data-then="target">Zielpunkt setzen</button></div>
        ${r.has_route ? `<label class="field sub">Weg zum Raum<select data-change="room-src" data-room="${esc(id)}"><option value="plan" ${r.use_recorded ? "" : "selected"}>Aus dem Plan berechnen</option><option value="rec" ${r.use_recorded ? "selected" : ""}>Aus meiner Aufnahme</option></select></label>` : ""}
      </div>`).join("");
    return `<div class="card"><h2>Räume in „${esc(this.fl.name)}“</h2>${rows || `<p class="hint">Noch kein Raum. Lege deinen ersten an und zeichne ihn dann mit Maßen.</p>`}
      <div class="row" style="margin-top:10px"><input type="text" id="newroom" placeholder="Neuer Raum, z. B. Wohnzimmer" maxlength="40" style="flex:1"><button class="btn primary" data-act="room-add">Anlegen</button></div>
      <p class="hint" style="margin-top:8px">Die Zahl rechts sind die Minuten, die der Roboter im Raum saugt. Ein Raum kann aus mehreren Flächen bestehen (zum Beispiel L-Form aus zwei Rechtecken).</p></div>`;
  },

  /* ---- charging station */
  _dockCard() {
    const d = this.fl.dock, selected = this.pv.sel === "dock";
    if (!d) {
      return `<div class="card"><h2>Ladestation</h2><p class="hint">Setze die Station dorthin, wo sie in der Wohnung steht. Tippe dazu im Plan an die Wand.</p>
        <div class="row" style="margin-top:10px"><button class="btn primary" data-act="tool" data-tool="dock">Station setzen</button></div></div>`;
    }
    const h = ((Math.round(d.heading) % 360) + 360) % 360;
    const wall = { 90: "top", 180: "right", 270: "bottom", 0: "left" }[h] || "";
    const wallBtn = (id, label) => `<button data-act="dock-wall" data-wall="${id}" aria-pressed="${wall === id}">${label}</button>`;
    const face = (v, title, text) => `<button class="facecard" data-act="dock-face" data-face="${v}" aria-pressed="${d.facing === v}">${dockSvg(v)}<b>${title}</b><span class="small hint">${text}</span></button>`;
    return `<div class="card ${selected ? "hl" : ""}"><h2>Ladestation</h2>
      <div class="stack">
        <div class="stack" style="gap:6px"><span class="small"><b>1. An welcher Wand steht die Station?</b></span>
          <div class="seg full">${wallBtn("top", "Oben")}${wallBtn("right", "Rechts")}${wallBtn("bottom", "Unten")}${wallBtn("left", "Links")}</div>
          <span class="small hint">Gemeint ist die Seite im Plan, so wie du ihn siehst. Beim Antippen einer Wand erkennt der Plan das von selbst.</span></div>
        <div class="stack" style="gap:6px"><span class="small"><b>2. Wie sitzt der Roboter auf der Station?</b></span>
          <div class="faces">${face("in", "Front zur Wand", "Er ist vorwärts auf die Station gefahren.")}${face("out", "Front zum Raum", "Er ist rückwärts auf die Station gefahren.")}</div>
          <span class="small hint">Front ist die Seite, in die der Roboter beim Vorwärtsfahren fährt. Im Plan zeigt der gelbe Bogen die Front. Schau auf deinen Roboter an der Station und wähle, was stimmt.</span></div>
        <div class="fields2"><label class="field">Mitte des Roboters, x<input type="text" inputmode="decimal" value="${esc(fmtIn(d.x, this.unit))}" data-change="dock-x"></label>
          <label class="field">Mitte des Roboters, y<input type="text" inputmode="decimal" value="${esc(fmtIn(d.y, this.unit))}" data-change="dock-y"></label></div>
        <div class="notice ok small">Norden spielt keine Rolle. Der Plan darf beliebig gedreht sein. Wichtig sind nur die Wand der Station und wie der Roboter darauf sitzt.</div>
        <div class="row"><button class="btn" data-act="tool" data-tool="dock">Station neu setzen</button><button class="btn danger" data-act="dock-del">Station entfernen</button></div></div></div>`;
  },

  /* ---- floor settings */
  _openPairs() {
    const f = this.fl, nm = (id) => this.snap.rooms[id]?.name || id;
    if (!f.walls) return "";
    const here = [...new Set(f.shapes.filter((x) => x.kind === "room").map((x) => x.room))].filter((id) => this.snap.rooms[id]);
    const list = (f.open || []).filter(([a, b]) => this.snap.rooms[a] && this.snap.rooms[b]);
    const chips = list.length
      ? `<div class="chips">${list.map(([a, b], i) => `<span class="chip">${esc(nm(a))} ⟷ ${esc(nm(b))}<button class="link" data-act="open-del" data-a="${esc(a)}" data-b="${esc(b)}" aria-label="Verbindung ${esc(nm(a))} und ${esc(nm(b))} entfernen">✕</button></span>`).join("")}</div>`
      : "";
    const opts = (sel) => here.map((id) => `<option value="${esc(id)}" ${id === sel ? "selected" : ""}>${esc(nm(id))}</option>`).join("");
    const adder = here.length >= 2
      ? `<div class="row"><select id="open-a" aria-label="Erster Raum" style="flex:1;min-width:110px">${opts(here[0])}</select><span class="hint">und</span>
          <select id="open-b" aria-label="Zweiter Raum" style="flex:1;min-width:110px">${opts(here[1])}</select>
          <button class="btn" data-act="open-add">Ohne Wand verbinden</button></div>`
      : `<p class="hint">Dafür braucht es mindestens zwei gezeichnete Räume in diesem Stockwerk.</p>`;
    return `<h3 style="margin:2px 0 0">Räume ohne Wand dazwischen</h3>
      <p class="hint">Für Räume, die ohne Tür ineinander übergehen, zum Beispiel ein Flur in L-Form und das Wohnzimmer. Zwischen den beiden Räumen entsteht dann keine Wand, überall wo sie sich berühren.</p>${chips}${adder}`;
  },

  _floorCard() {
    const f = this.fl, many = this.floors().length > 1, rf = this.snap.robot_floor;
    return `<div class="card"><h2>Stockwerk</h2><div class="stack">
      <label class="field">Name<input type="text" value="${esc(f.name)}" maxlength="30" data-change="floor-name"></label>
      <label class="toggle"><span>Wände zwischen Räumen automatisch</span><input type="checkbox" data-change="floor-walls" ${f.walls ? "checked" : ""}></label>
      <p class="hint">Wenn zwei Räume sich berühren, zieht die App dazwischen eine Wand. Türen öffnen sie. Für offene Wohnbereiche ohne Wände ausschalten, oder unten einzelne Räume ohne Wand verbinden.</p>
      ${this._openPairs()}
      ${many ? (rf === f.id ? `<div class="notice ok small">Der Roboter steht laut Plan in diesem Stockwerk.</div>` : `<div class="notice small">Der Roboter steht laut Plan im Stockwerk „${esc(this.floorName(rf))}“.<div style="margin-top:8px"><button class="btn" data-act="robot-here" data-floor="${esc(f.id)}">Roboter steht jetzt hier</button></div></div>`) : ""}
      ${many ? `<div><button class="btn ${this.confirm === "floor" ? "danger" : ""}" data-act="floor-del">${this.confirm === "floor" ? "Wirklich löschen? Räume dieses Stockwerks werden mit gelöscht" : "Stockwerk löschen"}</button></div>` : ""}
      </div></div>`;
  },

  /* ---- export and import of everything */
  _backupCard() {
    const imp = this.imp;
    let state = "";
    if (imp?.error) state = `<div class="notice bad" style="margin-top:10px">${esc(imp.error)}</div>`;
    else if (imp) {
      const when = imp.at ? new Date(imp.at).toLocaleDateString("de-DE") : "";
      state = `<div class="notice" style="margin-top:10px"><b>${esc(imp.name)}</b>${when ? ` (vom ${esc(when)})` : ""}: ${imp.floors} ${imp.floors === 1 ? "Stockwerk" : "Stockwerke"}, ${imp.rooms} ${imp.rooms === 1 ? "Raum" : "Räume"}${imp.images ? `, ${imp.images} ${imp.images === 1 ? "Grundriss" : "Grundrisse"}` : ""}.
        <div class="small" style="margin-top:4px">Beim Laden wird der jetzige Plan mit allen Stockwerken, Räumen, Messwerten und diesen Einstellungen ersetzt.</div>
        <div class="row" style="margin-top:8px"><button class="btn primary" data-act="import-do" ${imp.busy ? "disabled" : ""}>${imp.busy ? "Lädt …" : "Jetzt ersetzen"}</button><button class="btn" data-act="import-cancel" ${imp.busy ? "disabled" : ""}>Abbrechen</button></div></div>`;
    }
    return `<div class="card"><h2>Sichern und übertragen</h2>
      <p class="hint">Speichert alles in einer Datei: Stockwerke mit Plan und Grundriss-Bildern, Räume, Messwerte und Einstellungen. Zum Sichern oder um alles in eine andere Installation zu übernehmen.</p>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-act="export" ${this.busyExport ? "disabled" : ""}>${this.busyExport ? "Exportiert …" : "Alles exportieren"}</button>
        <label class="btn" style="cursor:pointer">Aus Datei laden<input type="file" accept="application/json,.json" data-change="import-file" hidden></label></div>${state}</div>`;
  },

  /* ---- floor plan image */
  _scaleCard() {
    if (!this.scaleAsk) return "";
    const a = this.scaleAsk;
    return `<div class="card hl"><h2>Maßstab festlegen</h2>
      <p class="hint" style="margin-bottom:10px">Du hast zwei Punkte markiert. Wie lang ist diese Strecke in Wirklichkeit?</p>
      <div class="row"><label class="field sm">Länge<input type="text" inputmode="decimal" id="scalelen" placeholder="${this.unit === "m" ? "z. B. 4,2" : "z. B. 420"}"></label>${this._unitSeg()}
        <button class="btn primary" data-act="scale-ok">Maßstab setzen</button><button class="btn" data-act="scale-cancel">Abbrechen</button></div>
      <p class="hint" style="margin-top:8px">Im Plan sind es zurzeit ${esc(fmtLen(a.d))}.</p></div>`;
  },

  _imageCard() {
    const im = this.images[this.fid], meta = this._meta();
    const drop = `<label class="drop">
        <input type="file" accept="image/png,image/jpeg,image/webp" data-change="image" hidden>
        <b>${im ? "Anderes Bild laden" : "Grundriss laden"}</b>
        <span class="small hint">Datei wählen, hierher ziehen oder mit Strg+V einfügen (zum Beispiel einen Screenshot aus Planner 5D).</span></label>`;
    if (!im || !meta) {
      return `<div class="card"><h2>Grundriss als Vorlage</h2>${drop}
        <p class="hint" style="margin-top:10px">Das Panel kann nur Bilder lesen, keine Links zu Webseiten. Ist dein Plan online (Planner 5D, Magicplan, …), mach einen Screenshot oder exportiere ein Bild und lade es hier hoch. Danach legst du den Maßstab fest und die App schlägt die Räume vor.</p></div>`;
    }
    const d = this.det;
    const steps = `<div class="stepline"><span class="${this.imgStep === "scale" ? "now" : ""}">1 Maßstab</span><span class="${this.imgStep === "detect" ? "now" : ""}">2 Räume erkennen</span><span>3 Türen setzen</span></div>`;
    const cands = d.cands.length
      ? `<div class="cands">${d.cands.map((c, i) => `<label class="cand"><input type="checkbox" data-change="cand" data-i="${i}" ${c.on ? "checked" : ""}><i style="background:${esc(c.color)}"></i><span>Fläche ${i + 1}</span><span class="num hint">${esc(fmtNum(c.areaM2, 1))} m²</span></label>`).join("")}</div>
         <div class="row" style="margin-top:10px"><button class="btn primary" data-act="detect-apply" ${d.cands.some((c) => c.on) ? "" : "disabled"}>${d.cands.filter((c) => c.on).length} Räume übernehmen</button><button class="btn" data-act="detect-clear">Verwerfen</button></div>
         <p class="hint" style="margin-top:8px">Die Räume heißen danach „Raum 1“, „Raum 2“ … Benenne sie in der Liste um. Türen setzt du mit Zeichnen, Was ist es: Tür.</p>`
      : (d.ran ? `<div class="notice">${esc(d.note || "Es wurden keine Räume gefunden. Probiere eine andere Empfindlichkeit oder größere Türlücken.")}</div>` : "");
    return `<div class="card"><h2>Grundriss als Vorlage</h2>${steps}
      <div class="row" style="margin:10px 0"><button class="btn ${this.tool === "scale" ? "primary" : ""}" data-act="scale-start">Maßstab messen</button>
        <button class="btn danger" data-act="image-del">Bild entfernen</button></div>
      <div class="fields2">
        <label class="field">Breite des Bildes<input type="text" inputmode="decimal" value="${esc(fmtIn(meta.width_m * 100, this.unit))}" data-change="img-w"></label>
        <label class="field">Deckkraft<input type="range" min="0.1" max="1" step="0.05" value="${esc(meta.opacity)}" data-change="img-o"></label>
        <label class="field">Bild nach rechts<input type="text" inputmode="decimal" value="${esc(fmtIn(meta.x_m * 100, this.unit))}" data-change="img-x"></label>
        <label class="field">Bild nach unten<input type="text" inputmode="decimal" value="${esc(fmtIn(meta.y_m * 100, this.unit))}" data-change="img-y"></label></div>
      <div class="row" style="margin:8px 0 10px"><span class="hint">Einheit der Felder:</span>${this._unitSeg()}</div>
      <h3>Räume erkennen</h3>
      <p class="hint">Die App sucht abgeschlossene Flächen zwischen dunklen Wänden und schlägt sie als Räume vor. Das ist ein Vorschlag, den du prüfst. Am besten klappt es mit dunklen Wänden auf hellem Grund und ohne Möbel und Beschriftungen.</p>
      <div class="stack" style="margin-top:8px">
        <label class="field">Empfindlichkeit: ${d.thresh === null ? "automatisch" : esc(d.thresh)}<input type="range" min="20" max="240" step="1" value="${d.thresh ?? 128}" data-change="det-thresh"></label>
        <label class="field">Türlücken schließen bis: ${esc(fmtLen(d.gap))}<input type="range" min="0" max="200" step="10" value="${esc(d.gap)}" data-change="det-gap"></label>
        <label class="field">Kleinste Fläche: ${esc(fmtNum(d.minM2, 1))} m²<input type="range" min="0.5" max="10" step="0.5" value="${esc(d.minM2)}" data-change="det-min"></label>
        <label class="toggle"><span>Wände sind hell auf dunklem Grund</span><input type="checkbox" data-change="det-invert" ${d.invert ? "checked" : ""}></label>
        <label class="toggle"><span>Dünne Linien ignorieren (Möbel, Schrift)${d.thin === null ? " – automatisch" : ""}</span><input type="checkbox" data-change="det-thin" ${(d.thin ?? d.thinUsed ?? true) ? "checked" : ""}></label>
        <div class="row"><button class="btn primary" data-act="detect" ${d.busy ? "disabled" : ""}>${d.busy ? "Suche …" : "Räume erkennen"}</button>${d.thresh !== null ? `<button class="btn" data-act="det-auto">Empfindlichkeit automatisch</button>` : ""}</div>
        ${cands}</div>
      <div style="margin-top:14px">${drop}</div></div>`;
  },
});


/* ---------------------------------------------------------------- actions and events */
const FLOOR_NAMES = ["Erdgeschoss", "Obergeschoss", "Dachgeschoss", "Untergeschoss", "Keller"];
const WALL_HEADING = { top: 90, right: 180, bottom: -90, left: 0 };

function offsetShape(s, dx, dy) {
  const o = JSON.parse(JSON.stringify(s));
  if (o.t === "rect" || o.t === "ellipse") { o.x += dx; o.y += dy; } else o.pts = o.pts.map((p) => [p[0] + dx, p[1] + dy]);
  return o;
}

Object.assign(TikomPanel.prototype, {
  _input(e) {
    const t = e.target;
    if (t.dataset.change === "img-o" && this.images[this.fid]) {
      this.imgOver[this.fid] = { ...this._meta(), opacity: Number(t.value) };
      this.pv.imageMeta = this.imgOver[this.fid]; this.pv.draw();
    }
  },

  /* ---- keyboard, paste, drop */
  _typing(e) {
    const el = e.composedPath?.()[0] || e.target;
    return el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
  },
  _key(e) {
    if (this.tab !== "plan" || !this.fl || this._typing(e) || !this.isConnected) return;
    const pv = this.pv, k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") { e.preventDefault(); this._undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === "Escape") {
      if (pv.polyCount()) pv.cancelPoly();
      else if (this.scaleAsk) { this.scaleAsk = null; pv.scalePts = []; this._render(); }
      else { pv.sel = null; this._render(); }
      e.preventDefault();
    } else if (k === "Enter" && pv.polyCount() >= 3) { e.preventDefault(); pv.finishPoly(); }
    else if (k === "Backspace" && pv.polyCount()) { e.preventDefault(); pv.undoPolyPoint(); }
    else if ((k === "Delete" || k === "Backspace") && pv.sel) { e.preventDefault(); this._deleteSelection(); }
    else if (k.startsWith("Arrow") && pv.sel) {
      e.preventDefault();
      const d = e.shiftKey ? 1 : 10;
      pv.nudge(k === "ArrowLeft" ? -d : k === "ArrowRight" ? d : 0, k === "ArrowUp" ? -d : k === "ArrowDown" ? d : 0);
    }
  },
  _paste(e) {
    if (this.tab !== "plan" || !this.isConnected || this._typing(e)) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); this._loadImageFile(files[0]); return; }
    const text = e.clipboardData?.getData("text") || "";
    if (/^https?:\/\//i.test(text.trim())) {
      e.preventDefault();
      this.toast("Einen Link kann das Panel nicht öffnen. Mach einen Screenshot des Plans und füge ihn mit Strg+V ein.", true);
    }
  },
  _drop(e) {
    if (this.tab !== "plan") return;
    const f = [...(e.dataTransfer?.files || [])].find((q) => q.type.startsWith("image/"));
    if (f) { e.preventDefault(); this._loadImageFile(f); }
  },

  /* ---- image import */
  _loadImageFile(file) {
    if (!file || !this.fl) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { this.toast("Nur PNG, JPEG oder WebP.", true); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const cx = c.getContext("2d");
        cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height);
        cx.drawImage(img, 0, 0, c.width, c.height);
        let q = 0.88, data = c.toDataURL("image/jpeg", q);
        while (data.length > 1_300_000 && q > 0.3) { q -= 0.1; data = c.toDataURL("image/jpeg", q); }
        if (data.length > 1_300_000) { this.toast("Das Bild ist zu groß. Verkleinere es und versuche es noch einmal.", true); return; }
        this._useImage(data);
      };
      img.onerror = () => this.toast("Das Bild konnte nicht gelesen werden.", true);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  },
  _useImage(data) {
    const el = new Image();
    el.onload = () => {
      const b = this.pv.contentBox(false), fid = this.fid;
      this.images[fid] = { el, data };
      this.imgOver[fid] = { width_m: 12, x_m: b ? Math.round(b.x0) / 100 : 0, y_m: b ? Math.round(b.y0) / 100 : 0, opacity: 0.6 };
      this.imgDirty = true; this.imgRev++;
      this.det.cands = []; this.det.ran = false; this.pv.cands = [];
      this.imgStep = "scale"; this.tool = "scale"; this.scaleAsk = null; this.pv.resetInteraction();
      this._sync(); this._needFit = true; this._render();
      this.toast("Bild geladen. Lege jetzt den Maßstab fest: zwei Punkte antippen, deren Abstand du kennst.");
      clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this._save(), 300);
    };
    el.src = data;
  },
  _imgMeta(patch) {
    const m = { ...this._meta(), ...patch };
    m.width_m = clamp(m.width_m, 0.5, 100); m.x_m = clamp(m.x_m, -100, 100); m.y_m = clamp(m.y_m, -100, 100);
    this.imgOver[this.fid] = m; this.imgDirty = true; this.imgRev++;
    this._sync(); this.pv.draw();
    clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this._save(), 900);
  },
  _applyScale() {
    const a = this.scaleAsk, len = parseIn(this.shadowRoot.getElementById("scalelen")?.value, this.unit);
    if (!a || !len || len < 10) { this.toast("Gib die echte Länge der Strecke ein.", true); return; }
    const f = len / a.d, m = this._meta();
    const ox = a.a[0] + (m.x_m * 100 - a.a[0]) * f, oy = a.a[1] + (m.y_m * 100 - a.a[1]) * f;
    this.scaleAsk = null; this.pv.scalePts = []; this.tool = "select"; this.imgStep = "detect";
    this._imgMeta({ width_m: m.width_m * f, x_m: ox / 100, y_m: oy / 100 });
    this._needFit = true; this._render();
    this.toast("Maßstab gesetzt. Jetzt kannst du die Räume erkennen lassen.");
  },

  /* ---- room detection */
  async _runDetect() {
    const im = this.images[this.fid], meta = this._meta(), d = this.det;
    if (!im || !meta || d.busy) return;
    d.busy = true; this._render();
    await new Promise((r) => setTimeout(r, 40));
    try {
      const res = detectRooms(im.el, { cmPerNatPx: (meta.width_m * 100) / im.el.naturalWidth, thresh: d.thresh, invert: d.invert, gapCm: d.gap, thin: d.thin, minM2: d.minM2 });
      const ox = meta.x_m * 100, oy = meta.y_m * 100;
      d.cands = res.cands.map((c, i) => ({ shape: offsetShape(c.shape, ox, oy), areaM2: c.areaM2, on: true, color: DETECT_COLORS[i % DETECT_COLORS.length] }));
      d.note = ""; d.thinUsed = res.thinUsed;
    } catch (err) { d.cands = []; d.note = `Die Erkennung ist fehlgeschlagen: ${err?.message || err}`; }
    d.ran = true; d.busy = false; this.imgStep = "detect";
    this.pv.cands = d.cands; this._render(); this.pv.draw();
  },
  async _applyDetect() {
    const d = this.det, on = d.cands.filter((c) => c.on);
    if (!on.length || !this.fl) return;
    this.dirty = true; this._pushUndo();
    const used = new Set(Object.values(this.snap.rooms).map((r) => r.name.toLowerCase()));
    let n = 1, made = 0, last = null;
    for (const c of on) {
      while (used.has(`raum ${n}`)) n++;
      const name = `Raum ${n}`; used.add(name.toLowerCase());
      const r = await this.act("room", { action: "add", name, color: c.color });
      if (!r) break;
      this.fl.shapes.push({ id: newId(), kind: "room", room: r.room_id, ...c.shape });
      made++; last = r.room_id;
    }
    d.cands = []; this.pv.cands = []; d.ran = false; this.imgStep = "";
    if (last) { this._keepRoom = last; this.activeRoom = last; this.what = `room:${last}`; }
    this._edited(true); this._needFit = true; this._render();
    if (made) this.toast(`${made} Räume angelegt. Benenne sie in der Liste um und setze die Türen.`);
  },

  /* ---- export and import */
  async _export() {
    if (this.busyExport) return;
    this.busyExport = true; this._render();
    try {
      await this._save();
      const data = await this.ws("export");
      for (const f of data.floors) {
        if (f.has_image) { const r = await this.ws("get_image", { floor_id: f.id }); f.image = r?.image || null; }
        delete f.has_image;
      }
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `tikom-g8000-export-${new Date().toISOString().slice(0, 10)}.json`;
      this.shadowRoot.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      this.toast(`Exportiert: ${data.floors.length} Stockwerke, ${Object.keys(data.rooms).length} Räume.`);
    } catch (err) { this.toast(err?.message || String(err), true); }
    this.busyExport = false; this._render();
  },
  async _readImport(file) {
    if (!file) return;
    try {
      if (file.size > 64e6) throw new Error("Die Datei ist zu groß.");
      const data = JSON.parse(await file.text());
      if (data?.format !== "tikom_g8000_export") throw new Error("Das ist keine Exportdatei von Tikom G8000.");
      if (data.version !== 1) throw new Error("Diese Exportdatei hat ein unbekanntes Format.");
      const floors = Array.isArray(data.floors) ? data.floors : [];
      this.imp = { name: file.name, data, floors: floors.length, rooms: Object.keys(data.rooms || {}).length, images: floors.filter((f) => f.image).length, at: data.exported_at || "" };
    } catch (err) {
      this.imp = { error: err instanceof SyntaxError ? "Die Datei ist kein gültiges JSON." : (err?.message || String(err)) };
    }
    this._render();
  },
  async _import() {
    const imp = this.imp;
    if (!imp || imp.error || imp.busy) return;
    const data = JSON.parse(JSON.stringify(imp.data)), images = {};
    for (const f of data.floors) { if (f.image) images[f.id] = f.image; delete f.image; delete f.has_image; }
    imp.busy = true; this._render();
    clearTimeout(this.saveTimer); this.dirty = false; this.imgDirty = false;
    const r = await this.act("import", { data });
    if (!r) { imp.busy = false; this._render(); return; }
    let lost = 0;
    for (const f of data.floors) {
      if (!images[f.id]) continue;
      try { await this.ws("floor", { action: "save", floor: f, image: images[f.id] }); } catch (err) { lost++; }
    }
    this.imp = null; this.images = {}; this.imgOver = {}; this.undo = []; this.sel.clear(); this.preview = null; this.previewKey = "";
    this.pv.sel = null; this.pv.cands = []; this.det.cands = []; this.det.ran = false; this.scaleAsk = null; this.imgStep = "";
    this.fid = ""; this.fl = null; this._needFit = true;
    if (this.snap) this._onSnap(this.snap);
    this.toast(lost ? `Geladen, aber ${lost} Grundriss-Bild(er) wurden nicht übernommen.` : `Geladen: ${r.rooms} Räume in ${r.floors.length} Stockwerken.`, !!lost);
  },

  /* ---- shape editing */
  _deleteSelection() {
    const pv = this.pv, fl = this.fl;
    if (!fl || !pv.sel) return;
    this._pushUndo();
    if (pv.sel === "dock") fl.dock = null;
    else fl.shapes = fl.shapes.filter((s) => s.id !== pv.sel);
    pv.sel = null; this._sync(); this._edited();
  },
  _addByDims() {
    const msg = this._canDraw();
    if (msg) { this.toast(msg, true); return; }
    const w = this.what, kind = w.startsWith("room:") || w === "new" ? "room" : w;
    const [sw, sh] = this.addSize[kind];
    const t = kind === "door" ? "rect" : this.shapeType === "ellipse" ? "ellipse" : "rect";
    const pv = this.pv, sel = pv.selectedShape();
    let x, y;
    if (!this.fl.shapes.length) { x = 0; y = 0; }
    else if (kind === "room" && sel?.kind === "room") { const b = bboxOf(sel); x = Math.round(b.x1); y = Math.round(b.y0); }
    else {
      const [cx, cy] = pv._sw(pv.canvas.clientWidth / 2, pv.canvas.clientHeight / 2);
      x = Math.round((cx - sw / 2) / 10) * 10; y = Math.round((cy - sh / 2) / 10) * 10;
    }
    const s = { id: newId(), kind, t, x, y, w: sw, h: sh };
    if (kind === "room") s.room = w.slice(5);
    const first = !this.fl.shapes.length;
    pv.addShape(s);
    if (first) this._needFit = true;
    this._render();
  },
  _selShape() { return this.pv.selectedShape(); },

  async _newRoom(name) {
    const r = await this.act("room", { action: "add", name });
    if (!r) return null;
    this._keepRoom = r.room_id; this.activeRoom = r.room_id; this.what = `room:${r.room_id}`; this.newRoomOpen = false;
    return r.room_id;
  },

  /* ---- clicks */
  async _click(e) {
    const fr = e.target.dataset?.focusRoom;
    if (fr) { this.activeRoom = fr; this.what = `room:${fr}`; return; }
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const a = t.dataset.act, s = this.snap, pv = this.pv;
    switch (a) {
      case "tab":
        this.tab = t.dataset.tab; this.confirm = ""; pv.resetInteraction(); this._needFit = true; this._render(); break;
      case "svc": this.svc("vacuum", t.dataset.s, { entity_id: s.vacuum }); break;
      case "sel": this._toggleRoom(t.dataset.room); break;
      case "mode": await this.act("setting", { key: "clean_mode", value: t.dataset.mode }); break;
      case "clean": await this.act("clean", { rooms: [...this.sel], mode: s.settings.clean_mode }, "Los geht's"); break;
      case "dry": await this.act("clean", { rooms: [[...this.sel][0]], dry_run: true }, "Testfahrt gestartet"); break;
      case "abort": await this.act("abort", {}, "Abgebrochen"); break;
      case "err-ok": this.errDismissed = JSON.stringify(s.last_run); this._render(); break;
      case "carpet-only-on": await this.act("setting", { key: "carpet_sweep_only", value: true }, "Räume mit Teppich werden nur gesaugt"); break;
      case "fb": await this.act("calibration", { action: "feedback", kind: t.dataset.kind }, "Danke, Messwerte angepasst"); this.fbDismissed = JSON.stringify(s.last_run); this._render(); break;
      case "fb-ok": this.fbDismissed = JSON.stringify(s.last_run); this._render(); break;
      case "select": this.svc("select", "select_option", { entity_id: t.dataset.ent, option: t.dataset.opt }); break;
      case "fan": this.svc("vacuum", "set_fan_speed", { entity_id: s.vacuum, fan_speed: t.dataset.fan }); break;
      case "press": this.svc("button", "press", { entity_id: t.dataset.ent }); break;

      /* floors */
      case "floor": await this._setFloor(t.dataset.floor); break;
      case "floor-add": {
        await this._save();
        const used = new Set(this.floors().map((f) => f.name));
        const name = FLOOR_NAMES.find((n) => !used.has(n)) || `Stockwerk ${this.floors().length + 1}`;
        const r = await this.act("floor", { action: "add", name });
        if (r) { this._pendingFloor = r.floor_id; this.toast(`„${name}“ angelegt. Umbenennen kannst du es rechts unter „Stockwerk“.`); }
        break;
      }
      case "floor-del":
        if (this.confirm !== "floor") { this.confirm = "floor"; this._render(); break; }
        this.confirm = ""; this.dirty = false; this.imgDirty = false;
        await this.act("floor", { action: "delete", floor_id: this.fid }, "Stockwerk gelöscht");
        break;
      case "open-add": {
        const a = this.shadowRoot.getElementById("open-a")?.value, b = this.shadowRoot.getElementById("open-b")?.value;
        if (!a || !b || a === b) { this.toast("Wähle zwei verschiedene Räume.", true); break; }
        const pair = [a, b].sort();
        if ((this.fl.open || []).some((p) => p[0] === pair[0] && p[1] === pair[1])) { this.toast("Diese beiden sind schon verbunden."); break; }
        this._pushUndo(); this.fl.open = [...(this.fl.open || []), pair]; this._edited(true); break;
      }
      case "open-del": {
        this._pushUndo();
        this.fl.open = (this.fl.open || []).filter((p) => !(p[0] === t.dataset.a && p[1] === t.dataset.b));
        this._edited(true); break;
      }
      case "export": await this._export(); break;
      case "import-do": await this._import(); break;
      case "import-cancel": this.imp = null; this._render(); break;
      case "robot-here": await this.act("floor", { action: "robot_here", floor_id: t.dataset.floor }, "Gemerkt: Der Roboter steht in diesem Stockwerk."); break;

      /* tools and view */
      case "tool":
        this.tool = t.dataset.tool; this.scaleAsk = null; pv.resetInteraction();
        if (this.tool === "target" && !this.activeRoom) this.toast("Wähle zuerst einen Raum in der Liste (Zielpunkt setzen).", true);
        this._render(); break;
      case "zoom": t.dataset.z === "fit" ? pv.fit() : pv.zoomBy(t.dataset.z === "in" ? 1.35 : 1 / 1.35); break;
      case "undo": this._undo(); break;
      case "unit": this.unit = t.dataset.u; this._render(); break;
      case "shape": this.shapeType = t.dataset.t; pv.cancelPoly(); this._render(); break;
      case "add-dims": this._addByDims(); break;
      case "poly-done": pv.finishPoly(); break;
      case "poly-back": pv.undoPolyPoint(); break;
      case "poly-cancel": pv.cancelPoly(); break;

      /* rooms */
      case "room-new": {
        const name = this.shadowRoot.getElementById("newroomname")?.value.trim();
        if (!name) { this.toast("Gib dem Raum einen Namen.", true); return; }
        if (await this._newRoom(name)) this._render();
        break;
      }
      case "room-add": {
        const input = this.shadowRoot.getElementById("newroom"), name = input.value.trim();
        if (!name) return;
        if (await this._newRoom(name)) { input.value = ""; this.tool = "draw"; this._render(); }
        break;
      }
      case "room-pick":
        this.activeRoom = t.dataset.room; this.what = `room:${t.dataset.room}`; this.tool = t.dataset.then; pv.resetInteraction(); this._render(); break;
      case "room-del": {
        const id = t.dataset.room;
        if (this.confirm !== `room:${id}`) { this.confirm = `room:${id}`; this._render(); return; }
        this.confirm = ""; this.sel.delete(id);
        await this._save();
        await this.act("room", { action: "delete", room_id: id }, "Raum gelöscht");
        break;
      }
      case "target-clear": await this.act("room", { action: "update", room_id: t.dataset.room, target: null }, "Zielpunkt zurückgesetzt"); break;

      /* selected shape */
      case "sh-del": this._deleteSelection(); break;
      case "sh-dup": {
        const sh = pv.selectedShape(); if (!sh) break;
        this._pushUndo();
        const c = cloneShape(sh); c.id = newId(); translateShape(c, 20, 20);
        this.fl.shapes.push(c); pv.sel = c.id; this._edited(); break;
      }
      case "sh-rot": {
        const sh = pv.selectedShape(); if (!sh || sh.t !== "rect") break;
        this._pushUndo();
        const cx = sh.x + sh.w / 2, cy = sh.y + sh.h / 2;
        [sh.w, sh.h] = [sh.h, sh.w]; sh.x = Math.round(cx - sh.w / 2); sh.y = Math.round(cy - sh.h / 2);
        this._edited(); break;
      }
      case "pt-del": {
        const sh = pv.selectedShape(); if (!sh || sh.t !== "poly" || sh.pts.length <= 3) break;
        this._pushUndo(); sh.pts.splice(Number(t.dataset.i), 1); this._edited(); break;
      }

      /* charging station */
      case "dock-wall": {
        if (!this.fl.dock) break;
        this._pushUndo(); this.fl.dock.heading = WALL_HEADING[t.dataset.wall]; this._edited(); break;
      }
      case "dock-face": {
        if (!this.fl.dock) break;
        this._pushUndo(); this.fl.dock.facing = t.dataset.face; this._edited(); break;
      }
      case "dock-del": this.pv.sel = "dock"; this._deleteSelection(); break;

      /* image */
      case "scale-start": this.tool = "scale"; this.scaleAsk = null; pv.scalePts = []; this.imgStep = "scale"; this._render(); break;
      case "scale-ok": this._applyScale(); break;
      case "scale-cancel": this.scaleAsk = null; pv.scalePts = []; this._render(); break;
      case "image-del":
        this.images[this.fid] = null; delete this.imgOver[this.fid]; this.imgDirty = true; this.imgRev++;
        this.det.cands = []; this.det.ran = false; pv.cands = []; this.imgStep = ""; if (this.tool === "scale") this.tool = "select";
        this._sync(); this._render(); this._save(); break;
      case "detect": this._runDetect(); break;
      case "detect-apply": this._applyDetect(); break;
      case "detect-clear": this.det.cands = []; this.det.ran = false; pv.cands = []; this._render(); pv.draw(); break;
      case "det-auto": this.det.thresh = null; this._runDetect(); break;

      /* driving */
      case "drive": await this.act("drive", { direction: t.dataset.d, seconds: Number(s.settings.step_seconds) }); break;
      case "rec": await this.act("recording", { action: t.dataset.r }, t.dataset.r === "test" ? "Spiele ab" : ""); break;
      case "rec-save": {
        const name = this.shadowRoot.getElementById("recname").value.trim();
        if (!name) { this.toast("Gib dem Raum einen Namen.", true); return; }
        const r = await this.act("recording", { action: "save_as_room", name }, "Raum gespeichert");
        if (r) this.recName = "";
        break;
      }
      case "cal-drive-speed": await this.act("drive", { direction: "forward", seconds: this.calSeconds.speed, record: false }); break;
      case "cal-drive-turn": await this.act("drive", { direction: "left", seconds: this.calSeconds.turn, record: false }); break;
      case "cal-save-speed": {
        const v = parseFloat(this.shadowRoot.getElementById("cal-speed").value);
        if (v > 0) await this.act("calibration", { action: "measure_speed", seconds: this.calSeconds.speed, measured: v }, "Geschwindigkeit gespeichert");
        break;
      }
      case "cal-save-turn": {
        const v = parseFloat(this.shadowRoot.getElementById("cal-turn").value);
        if (v > 0) await this.act("calibration", { action: "measure_turn", seconds: this.calSeconds.turn, measured: v }, "Drehung gespeichert");
        break;
      }
    }
  },

  /* ---- changes of form fields */
  async _change(e) {
    const t = e.target, k = t.dataset.change, s = this.snap, pv = this.pv;
    if (!k) return;
    const len = () => parseIn(t.value, this.unit);
    switch (k) {
      case "select": this.svc("select", "select_option", { entity_id: t.dataset.ent, option: t.value }); break;
      case "switch": this.svc("switch", t.checked ? "turn_on" : "turn_off", { entity_id: t.dataset.ent }); break;
      case "room-name": await this.act("room", { action: "update", room_id: t.dataset.room, name: t.value.trim() || s.rooms[t.dataset.room].name }); break;
      case "room-color": await this.act("room", { action: "update", room_id: t.dataset.room, color: t.value }); break;
      case "room-minutes": await this.act("room", { action: "update", room_id: t.dataset.room, minutes: Number(t.value) }); break;
      case "room-src": await this.act("room", { action: "update", room_id: t.dataset.room, use_recorded: t.value === "rec" }); break;
      case "step-seconds": await this.act("setting", { key: "step_seconds", value: Number(t.value) }); break;
      case "bool-setting": await this.act("setting", { key: t.dataset.key, value: t.checked }); break;
      case "import-file": this._readImport(t.files?.[0]); t.value = ""; break;
      case "cal-sec-speed": this.calSeconds.speed = clamp(Number(t.value) || 5, 1, 30); break;
      case "cal-sec-turn": this.calSeconds.turn = clamp(Number(t.value) || 3, 1, 30); break;

      case "shape": this.shapeType = t.value; pv.cancelPoly(); this._render(); break;
      case "what":
        this.what = t.value; this.newRoomOpen = t.value === "new";
        if (t.value.startsWith("room:")) this.activeRoom = t.value.slice(5);
        pv.cancelPoly(); this._render(); break;
      case "add-w": case "add-h": {
        const w = this.what, kind = w.startsWith("room:") || w === "new" ? "room" : w, v = len();
        if (v) this.addSize[kind][k === "add-w" ? 0 : 1] = clamp(v, kind === "door" ? 10 : 10, 6000);
        this._render(); break;
      }
      case "brush": { const v = len(); if (v) this.brush = clamp(v, 10, 200); this._render(); break; }

      case "sh": {
        const sh = pv.selectedShape(), v = len(), f = t.dataset.f;
        if (!sh || v === null) { this._render(); break; }
        this._pushUndo();
        if (f === "w" || f === "h") sh[f] = clamp(v, MIN_SIZE, 6000);
        else if (f === "width") sh.width = clamp(v, 10, 200);
        else sh[f] = clamp(v, -5000, 10000);
        pv.draw(); this._edited(); break;
      }
      case "pt": {
        const sh = pv.selectedShape(), v = len();
        if (!sh || v === null || sh.t !== "poly") { this._render(); break; }
        this._pushUndo(); sh.pts[Number(t.dataset.i)][Number(t.dataset.axis)] = clamp(v, -5000, 10000);
        pv.draw(); this._edited(); break;
      }
      case "sh-kind": {
        const sh = pv.selectedShape(); if (!sh) break;
        this._pushUndo();
        if (t.value === "room") {
          const room = this.roomsHere().find(([id]) => id === this.activeRoom)?.[0] || this.roomsHere()[0]?.[0];
          if (!room) { this.undo.pop(); this.toast("Lege zuerst einen Raum an.", true); this._render(); break; }
          sh.room = room;
        } else delete sh.room;
        sh.kind = t.value; this._edited(); break;
      }
      case "sh-room": { const sh = pv.selectedShape(); if (!sh) break; this._pushUndo(); sh.room = t.value; this.activeRoom = t.value; this._edited(); break; }

      case "dock-x": case "dock-y": {
        const v = len(); if (v === null || !this.fl.dock) { this._render(); break; }
        this._pushUndo(); this.fl.dock[k === "dock-x" ? "x" : "y"] = clamp(v, -5000, 10000); pv.draw(); this._edited(); break;
      }
      case "floor-name": {
        const v = t.value.trim(); if (!v) { this._render(); break; }
        this._pushUndo(); this.fl.name = v.slice(0, 30); this._edited(); break;
      }
      case "floor-walls": this._pushUndo(); this.fl.walls = t.checked; this._edited(); break;

      case "image": this._loadImageFile(t.files?.[0]); t.value = ""; break;
      case "img-w": { const v = len(); if (v && v >= 50) this._imgMeta({ width_m: v / 100 }); else this._render(); break; }
      case "img-x": { const v = len(); if (v !== null) this._imgMeta({ x_m: v / 100 }); break; }
      case "img-y": { const v = len(); if (v !== null) this._imgMeta({ y_m: v / 100 }); break; }
      case "img-o": this._imgMeta({ opacity: Number(t.value) }); break;

      case "det-thresh": this.det.thresh = Number(t.value); if (this.det.ran) this._runDetect(); else this._render(); break;
      case "det-gap": this.det.gap = Number(t.value); if (this.det.ran) this._runDetect(); else this._render(); break;
      case "det-min": this.det.minM2 = Number(t.value); if (this.det.ran) this._runDetect(); else this._render(); break;
      case "det-invert": this.det.invert = t.checked; if (this.det.ran) this._runDetect(); break;
      case "det-thin": this.det.thin = t.checked; if (this.det.ran) this._runDetect(); break;
      case "cand": { const c = this.det.cands[Number(t.dataset.i)]; if (c) { c.on = t.checked; this.pv.draw(); this._render(); } break; }
    }
  },
});

customElements.define("tikom-g8000-panel", TikomPanel);

